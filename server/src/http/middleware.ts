// server/src/http/middleware.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, type JwtPayload } from '../services/auth';
import { getDb } from '../db';
import { queries } from '../db/queries';
import type { User } from '@lan-comm/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Token manquant' },
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyJwt(token);
  if (!payload) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Token invalide ou expiré' },
    });
    return;
  }

  const db = getDb();
  const user = queries.getUserById(db, payload.sub);
  if (!user) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Utilisateur inexistant' },
    });
    return;
  }

  const { passwordHash: _, ...cleanUser } = user;
  request.user = cleanUser;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== 'admin') {
    reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Action réservée aux administrateurs' },
    });
  }
}
