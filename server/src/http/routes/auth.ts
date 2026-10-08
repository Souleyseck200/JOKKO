// server/src/http/routes/auth.ts
import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { registerSchema, loginSchema } from '@lan-comm/shared';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { hashPassword, comparePassword, signJwt } from '../../services/auth';
import { CONFIG } from '../../config';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/register', async (request, reply) => {
    if (!CONFIG.ALLOW_REGISTRATION) {
      return reply.status(403).send({
        error: { code: 'REGISTRATION_CLOSED', message: 'Les inscriptions sont fermées sur ce serveur' },
      });
    }

    const parse = registerSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: parse.error.issues[0]?.message || 'Données invalides' },
      });
    }

    const { username, phoneNumber, displayName, password, role } = parse.data;
    const db = getDb();

    // Vérifier l'unicité du pseudo
    if (queries.getUserByUsername(db, username)) {
      return reply.status(409).send({
        error: { code: 'USERNAME_TAKEN', message: "Ce nom d'utilisateur est déjà utilisé" },
      });
    }

    // Vérifier l'unicité du numéro de téléphone
    if (queries.getUserByPhone(db, phoneNumber)) {
      return reply.status(409).send({
        error: { code: 'PHONE_TAKEN', message: 'Ce numéro de téléphone est déjà enregistré' },
      });
    }

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();

    const user = queries.createUser(db, {
      id,
      username,
      phoneNumber,
      displayName,
      passwordHash,
      role: role || 'user',
    });

    const token = signJwt({ sub: user.id, username: user.username, role: user.role });

    return reply.status(201).send({
      token,
      user,
    });
  });

  fastify.post('/auth/login', async (request, reply) => {
    const parse = loginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: 'Identifiant ou mot de passe invalide' },
      });
    }

    const { usernameOrPhone, password } = parse.data;
    const db = getDb();
    const userWithHash = queries.getUserByLogin(db, usernameOrPhone);

    if (!userWithHash) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect' },
      });
    }

    const valid = await comparePassword(password, userWithHash.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect' },
      });
    }

    const { passwordHash: _, ...user } = userWithHash;
    const token = signJwt({ sub: user.id, username: user.username, role: user.role });

    return {
      token,
      user,
    };
  });

  fastify.get('/auth/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Token manquant' },
      });
    }

    const token = authHeader.substring(7);
    const { verifyJwt } = await import('../../services/auth');
    const decoded = verifyJwt(token);
    if (!decoded) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Token invalide ou expiré' },
      });
    }

    const db = getDb();
    const user = queries.getUserById(db, decoded.sub);
    if (!user) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Utilisateur introuvable' },
      });
    }

    const { passwordHash: _, ...cleanUser } = user;
    return cleanUser;
  });
};
