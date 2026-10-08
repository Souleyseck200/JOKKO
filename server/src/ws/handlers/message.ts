// server/src/ws/handlers/message.ts
import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEnvelope, ServerEnvelope, UUID } from '@lan-comm/shared';
import { wsMessageSendSchema, PROTOCOL_VERSION } from '@lan-comm/shared';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { wsHub } from '../hub';

export function handleMessageSend(socket: WebSocket, senderId: UUID, envelope: ClientEnvelope): void {
  const parsed = wsMessageSendSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    const errorEnv: ServerEnvelope = {
      v: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      type: 'error',
      ts: new Date().toISOString(),
      ref: envelope.id,
      payload: {
        code: 'INVALID_PAYLOAD',
        message: 'Structure de message invalide',
        details: parsed.error.format(),
      },
    };
    socket.send(JSON.stringify(errorEnv));
    return;
  }

  const { conversationId, clientMsgId, kind, body, attachmentIds } = parsed.data;
  const db = getDb();

  // Vérifier l'appartenance à la conversation
  if (!queries.isConversationMember(db, conversationId, senderId)) {
    const errorEnv: ServerEnvelope = {
      v: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      type: 'error',
      ts: new Date().toISOString(),
      ref: envelope.id,
      payload: {
        code: 'FORBIDDEN',
        message: 'Vous ne faites pas partie de cette conversation',
      },
    };
    socket.send(JSON.stringify(errorEnv));
    return;
  }

  // Insérer le message (idempotence sur senderId, clientMsgId)
  const messageId = crypto.randomUUID();
  const message = queries.insertMessage(db, {
    id: messageId,
    conversationId,
    senderId,
    clientMsgId,
    kind,
    body: body || '',
  });

  // Rattacher les pièces jointes (fichiers, images, audio vocal)
  if (attachmentIds && attachmentIds.length > 0) {
    let pos = 0;
    for (const fileId of attachmentIds) {
      queries.attachFileToMessage(db, message.id, fileId, pos++);
    }
    message.attachments = queries.getMessageAttachments(db, message.id);
  }

  // 1. Envoyer ACK à l'expéditeur
  const ackEnv: ServerEnvelope = {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'message.ack',
    ts: new Date().toISOString(),
    ref: envelope.id,
    payload: {
      clientMsgId,
      messageId: message.id,
      seq: message.seq,
      createdAt: message.createdAt,
      conversationId,
    },
  };
  socket.send(JSON.stringify(ackEnv));

  // 2. Diffuser message.new aux autres membres de la conversation
  const members = queries.getConversationMembers(db, conversationId);
  const otherMemberIds = members.map((m) => m.id).filter((id) => id !== senderId);

  const newMsgEnv: ServerEnvelope = {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'message.new',
    ts: message.createdAt,
    payload: {
      message,
    },
  };

  wsHub.broadcastToUsers(otherMemberIds, newMsgEnv);
}
