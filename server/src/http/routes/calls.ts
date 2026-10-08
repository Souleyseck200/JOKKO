// server/src/http/routes/calls.ts
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware';
import { getDb } from '../../db';
import { queries } from '../../db/queries';

export const callRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Historique des appels de l'utilisateur connecté
  fastify.get('/calls', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 50;

    const db = getDb();
    const userId = request.user!.id;
    return queries.getUserCalls(db, userId, parsedLimit);
  });
};
