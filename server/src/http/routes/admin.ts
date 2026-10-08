// server/src/http/routes/admin.ts
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../middleware';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { wsHub } from '../../ws/hub';
import { z } from 'zod';

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdmin);

  // Statistiques du serveur LAN
  fastify.get('/admin/stats', async () => {
    const db = getDb();
    const userCount: any = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const convCount: any = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
    const msgCount: any = db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const callCount: any = db.prepare('SELECT COUNT(*) as count FROM calls').get();

    return {
      activeConnections: wsHub.getActiveCount(),
      totalUsers: userCount?.count || 0,
      totalConversations: convCount?.count || 0,
      totalMessages: msgCount?.count || 0,
      totalCalls: callCount?.count || 0,
      timestamp: new Date().toISOString(),
    };
  });

  // Liste de tous les utilisateurs (vue administrateur)
  fastify.get('/admin/users', async () => {
    const db = getDb();
    return queries.getAllUsers(db);
  });

  // Modifier le rôle d'un utilisateur
  fastify.patch('/admin/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parse = updateRoleSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: 'Rôle invalide' },
      });
    }

    const db = getDb();
    const target = queries.getUserById(db, id);
    if (!target) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Utilisateur introuvable' },
      });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(parse.data.role, id);
    return { id, role: parse.data.role };
  });
};
