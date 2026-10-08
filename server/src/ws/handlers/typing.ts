// server/src/ws/handlers/typing.ts
import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEnvelope, ServerEnvelope, UUID } from '@lan-comm/shared';
import { wsTypingSchema, PROTOCOL_VERSION } from '@lan-comm/shared';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { wsHub } from '../hub';

// Cache des timers de frappe
const typingTimers = new Map<string, NodeJS.Timeout>();

export function handleTyping(
  socket: WebSocket,
  userId: UUID,
  envelope: ClientEnvelope,
  isTyping: boolean
): void {
  const parsed = wsTypingSchema.safeParse(envelope.payload);
  if (!parsed.success) return;

  const { conversationId } = parsed.data;
  const db = getDb();

  if (!queries.isConversationMember(db, conversationId, userId)) {
    return;
  }

  const key = `${conversationId}:${userId}`;

  // Nettoyer le timer précédent s'il existe
  if (typingTimers.has(key)) {
    clearTimeout(typingTimers.get(key)!);
    typingTimers.delete(key);
  }

  const members = queries.getConversationMembers(db, conversationId);
  const otherMemberIds = members.map((m) => m.id).filter((id) => id !== userId);

  const typingEnv: ServerEnvelope = {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'typing.update',
    ts: new Date().toISOString(),
    payload: {
      conversationId,
      userId,
      typing: isTyping,
    },
  };

  wsHub.broadcastToUsers(otherMemberIds, typingEnv);

  // Si typing.start, programmer l'arrêt automatique après 5 secondes
  if (isTyping) {
    const timer = setTimeout(() => {
      typingTimers.delete(key);
      const stopEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'typing.update',
        ts: new Date().toISOString(),
        payload: {
          conversationId,
          userId,
          typing: false,
        },
      };
      wsHub.broadcastToUsers(otherMemberIds, stopEnv);
    }, 5000);

    typingTimers.set(key, timer);
  }
}
