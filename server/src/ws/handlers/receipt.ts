// server/src/ws/handlers/receipt.ts
import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEnvelope, ServerEnvelope, UUID } from '@lan-comm/shared';
import { wsReceiptDeliveredSchema, wsReceiptReadSchema, PROTOCOL_VERSION } from '@lan-comm/shared';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { wsHub } from '../hub';

export function handleReceiptDelivered(socket: WebSocket, userId: UUID, envelope: ClientEnvelope): void {
  const parsed = wsReceiptDeliveredSchema.safeParse(envelope.payload);
  if (!parsed.success) return;

  const { messageIds } = parsed.data;
  const db = getDb();
  const now = new Date().toISOString();

  // Grouper les messages par expéditeur et conversation
  const senderMap = new Map<UUID, { conversationId: UUID; ids: UUID[] }>();

  for (const msgId of messageIds) {
    const msg = queries.getMessageById(db, msgId);
    if (msg && msg.senderId !== userId) {
      queries.recordReceiptDelivered(db, msgId, userId);

      const entry = senderMap.get(msg.senderId) || { conversationId: msg.conversationId, ids: [] };
      entry.ids.push(msgId);
      senderMap.set(msg.senderId, entry);
    }
  }

  // Notifier chaque expéditeur
  for (const [senderId, data] of senderMap.entries()) {
    const updateEnv: ServerEnvelope = {
      v: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      type: 'receipt.update',
      ts: now,
      payload: {
        conversationId: data.conversationId,
        messageIds: data.ids,
        userId,
        state: 'delivered',
        at: now,
      },
    };
    wsHub.send(senderId, updateEnv);
  }
}

export function handleReceiptRead(socket: WebSocket, userId: UUID, envelope: ClientEnvelope): void {
  const parsed = wsReceiptReadSchema.safeParse(envelope.payload);
  if (!parsed.success) return;

  const { conversationId, upToSeq } = parsed.data;
  const db = getDb();
  const now = new Date().toISOString();

  // Enregistrer la lecture et récupérer les IDs des messages mis à jour
  const updatedMessageIds = queries.recordReceiptRead(db, conversationId, userId, upToSeq);
  if (updatedMessageIds.length === 0) return;

  // Notifier les autres membres de la conversation
  const members = queries.getConversationMembers(db, conversationId);
  const otherMemberIds = members.map((m) => m.id).filter((id) => id !== userId);

  const updateEnv: ServerEnvelope = {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'receipt.update',
    ts: now,
    payload: {
      conversationId,
      messageIds: updatedMessageIds,
      userId,
      state: 'read',
      at: now,
    },
  };

  wsHub.broadcastToUsers(otherMemberIds, updateEnv);
}
