// server/src/ws/router.ts
import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEnvelope, ServerEnvelope } from '@lan-comm/shared';
import { envelopeBaseSchema, PROTOCOL_VERSION, WS_CLOSE } from '@lan-comm/shared';
import { wsHub } from './hub';
import { presenceService } from '../services/presence';
import { handleHello } from './handlers/hello';
import { handleMessageSend } from './handlers/message';
import { handleReceiptDelivered, handleReceiptRead } from './handlers/receipt';
import { handleTyping } from './handlers/typing';
import { handleCall } from './handlers/call';

export function setupWebSocket(socket: WebSocket): void {
  let authenticatedUserId: string | null = null;

  // Timeout de 5s pour envoyer hello
  const helloTimer = setTimeout(() => {
    if (!authenticatedUserId) {
      try {
        socket.close(WS_CLOSE.HELLO_TIMEOUT, 'Hello timeout (5s)');
      } catch {}
    }
  }, 5000);

  socket.on('message', (raw: Buffer | string) => {
    let json: any;
    try {
      json = JSON.parse(raw.toString('utf-8'));
    } catch {
      const errorEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'error',
        ts: new Date().toISOString(),
        payload: {
          code: 'INVALID_PAYLOAD',
          message: 'JSON malformé',
        },
      };
      socket.send(JSON.stringify(errorEnv));
      return;
    }

    const envelopeParse = envelopeBaseSchema.safeParse(json);
    if (!envelopeParse.success) {
      const errorEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'error',
        ts: new Date().toISOString(),
        payload: {
          code: 'INVALID_PAYLOAD',
          message: "Enveloppe d'événement non conforme",
        },
      };
      socket.send(JSON.stringify(errorEnv));
      return;
    }

    const envelope = json as ClientEnvelope;

    // 1. Événement hello
    if (envelope.type === 'hello') {
      clearTimeout(helloTimer);
      handleHello(socket, envelope, (userId) => {
        authenticatedUserId = userId;
      });
      return;
    }

    // Toute autre commande requiert d'être authentifié
    if (!authenticatedUserId) {
      const errorEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'error',
        ts: new Date().toISOString(),
        ref: envelope.id,
        payload: {
          code: 'UNAUTHENTICATED',
          message: "Veuillez d'abord initialiser la session avec hello",
        },
      };
      socket.send(JSON.stringify(errorEnv));
      return;
    }

    // 2. Ping / Pong
    if (envelope.type === 'ping') {
      const pongEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'pong',
        ts: new Date().toISOString(),
        ref: envelope.id,
        payload: {},
      };
      socket.send(JSON.stringify(pongEnv));
      return;
    }

    // 3. Présence snapshot
    if (envelope.type === 'presence.get') {
      const snapshotEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'presence.snapshot',
        ts: new Date().toISOString(),
        ref: envelope.id,
        payload: {
          users: presenceService.getSnapshot(),
        },
      };
      socket.send(JSON.stringify(snapshotEnv));
      return;
    }

    // 4. Messages
    if (envelope.type === 'message.send') {
      handleMessageSend(socket, authenticatedUserId, envelope);
      return;
    }

    // 5. Reçus
    if (envelope.type === 'receipt.delivered') {
      handleReceiptDelivered(socket, authenticatedUserId, envelope);
      return;
    }
    if (envelope.type === 'receipt.read') {
      handleReceiptRead(socket, authenticatedUserId, envelope);
      return;
    }

    // 6. Typing
    if (envelope.type === 'typing.start') {
      handleTyping(socket, authenticatedUserId, envelope, true);
      return;
    }
    if (envelope.type === 'typing.stop') {
      handleTyping(socket, authenticatedUserId, envelope, false);
      return;
    }

    // 7. Appels WebRTC
    if (envelope.type.startsWith('call.')) {
      handleCall(socket, authenticatedUserId, envelope);
      return;
    }
  });

  socket.on('close', () => {
    clearTimeout(helloTimer);
    if (authenticatedUserId) {
      wsHub.unregister(authenticatedUserId, socket);
      const { changed, lastSeenAt } = presenceService.userDisconnected(authenticatedUserId);
      if (changed) {
        const updateEnv: ServerEnvelope = {
          v: PROTOCOL_VERSION,
          id: crypto.randomUUID(),
          type: 'presence.update',
          ts: new Date().toISOString(),
          payload: {
            userId: authenticatedUserId,
            online: false,
            lastSeenAt,
          },
        };
        wsHub.broadcast(updateEnv);
      }
    }
  });
}
