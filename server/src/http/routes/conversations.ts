// server/src/http/routes/conversations.ts
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { createConversationSchema } from '@lan-comm/shared';

export const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Lister les conversations de l'utilisateur
  fastify.get('/conversations', async (request) => {
    const db = getDb();
    const userId = request.user!.id;
    return queries.getUserConversations(db, userId);
  });

  // Créer ou récupérer une conversation directe 1-1
  fastify.post('/conversations', async (request, reply) => {
    const parse = createConversationSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: 'Payload de conversation invalide' },
      });
    }

    const { userId: otherUserId } = parse.data;
    const currentUserId = request.user!.id;

    if (otherUserId === currentUserId) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: 'Impossible de créer une conversation avec soi-même' },
      });
    }

    const db = getDb();
    const targetUser = queries.getUserById(db, otherUserId);
    if (!targetUser) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Utilisateur destinataire introuvable' },
      });
    }

    const convSummary = queries.getOrCreateDirectConversation(db, currentUserId, otherUserId);
    return reply.status(200).send(convSummary);
  });

  // Historique paginé des messages d'une conversation
  fastify.get('/conversations/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { beforeSeq, limit } = request.query as { beforeSeq?: string; limit?: string };

    const db = getDb();
    const userId = request.user!.id;

    // Vérifier l'appartenance
    if (!queries.isConversationMember(db, id, userId)) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Vous ne faites pas partie de cette conversation' },
      });
    }

    const parsedBeforeSeq = beforeSeq ? parseInt(beforeSeq, 10) : undefined;
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 40;

    const messages = queries.getConversationMessages(db, id, parsedBeforeSeq, parsedLimit);
    return messages;
  });
};
