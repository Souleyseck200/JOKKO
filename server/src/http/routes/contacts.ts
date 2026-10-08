// server/src/http/routes/contacts.ts
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { contactSchema } from '@lan-comm/shared';

export const contactRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Liste des contacts enregistrés par l'utilisateur
  fastify.get('/contacts', async (request) => {
    const db = getDb();
    const ownerId = request.user!.id;
    return queries.getContacts(db, ownerId);
  });

  // Ajouter ou mettre à jour un contact (associer un nom personnalisé à un utilisateur)
  fastify.post('/contacts', async (request, reply) => {
    const parse = contactSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: parse.error.issues[0]?.message || 'Contact invalide' },
      });
    }

    const { contactUserId, nickname } = parse.data;
    const ownerId = request.user!.id;
    const db = getDb();

    // Vérifier que l'utilisateur cible existe
    const targetUser = queries.getUserById(db, contactUserId);
    if (!targetUser) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Utilisateur cible introuvable' },
      });
    }

    const contact = queries.upsertContact(db, ownerId, contactUserId, nickname);
    return reply.status(201).send(contact);
  });

  // Supprimer un contact
  fastify.delete('/contacts/:contactUserId', async (request, reply) => {
    const { contactUserId } = request.params as { contactUserId: string };
    const ownerId = request.user!.id;
    const db = getDb();

    queries.deleteContact(db, ownerId, contactUserId);
    return reply.status(204).send();
  });
};
