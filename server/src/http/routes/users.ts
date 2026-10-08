// server/src/http/routes/users.ts
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { presenceService } from '../../services/presence';
import { updateUserSchema } from '@lan-comm/shared';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Liste de tous les utilisateurs avec statut en ligne
  fastify.get('/users', async (request) => {
    const db = getDb();
    const currentUserId = request.user!.id;
    const allUsers = queries.getAllUsers(db, currentUserId);

    return allUsers.map((u) => ({
      ...u,
      online: presenceService.isOnline(u.id),
    }));
  });

  // Profil d'un utilisateur spécifique
  fastify.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const target = queries.getUserById(db, id);

    if (!target) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Utilisateur introuvable' },
      });
    }

    const { passwordHash: _, ...clean } = target;
    return {
      ...clean,
      online: presenceService.isOnline(clean.id),
    };
  });

  // Mise à jour de son propre profil
  fastify.patch('/users/me', async (request, reply) => {
    const parse = updateUserSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: 'Payload de mise à jour invalide' },
      });
    }

    const db = getDb();
    const updated = queries.updateUser(db, request.user!.id, parse.data);
    return updated;
  });
};
