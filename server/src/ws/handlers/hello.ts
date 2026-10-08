// server/src/ws/handlers/hello.ts
import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEnvelope, ServerEnvelope } from '@lan-comm/shared';
import { wsHelloSchema, PROTOCOL_VERSION, WS_CLOSE } from '@lan-comm/shared';
import { verifyJwt } from '../../services/auth';
import { presenceService } from '../../services/presence';
import { wsHub } from '../hub';
import { getDb } from '../../db';
import { queries } from '../../db/queries';

export function handleHello(
  socket: WebSocket,
  envelope: ClientEnvelope,
  onAuthenticated: (userId: string) => void
): void {
  const parsed = wsHelloSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    socket.close(WS_CLOSE.BAD_TOKEN, 'Invalid hello payload');
    return;
  }

  const { token, lastSeq } = parsed.data;
  const decoded = verifyJwt(token);
  if (!decoded) {
    socket.close(WS_CLOSE.BAD_TOKEN, 'Invalid or expired token');
    return;
  }

  const userId = decoded.sub;
  const db = getDb();
  const user = queries.getUserById(db, userId);
  if (!user) {
    socket.close(WS_CLOSE.BAD_TOKEN, 'User not found');
    return;
  }

  // Enregistrer la connexion
  wsHub.register(userId, socket);
  onAuthenticated(userId);

  // Mettre à jour la présence
  const { changed } = presenceService.userConnected(userId);

  // Récupérer le plus grand seq existant
  const lastMsgRow: any = db.prepare('SELECT MAX(seq) as maxSeq FROM messages').get();
  const currentSeq = lastMsgRow?.maxSeq || 0;

  // Récupérer les appels manqués
  const missedCalls = queries.getMissedCallsSince(db, userId, user.lastSeenAt || '1970-01-01T00:00:00.000Z');

  const now = new Date().toISOString();

  // 1. Envoyer hello.ok
  const helloOkEnv: ServerEnvelope = {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'hello.ok',
    ts: now,
    ref: envelope.id,
    payload: {
      userId,
      serverTime: now,
      currentSeq,
      heartbeatSec: 15,
      missedCalls,
    },
  };
  socket.send(JSON.stringify(helloOkEnv));

  // 2. Rejouer les messages manqués (seq > lastSeq) filtrés pour cet utilisateur
  if (lastSeq < currentSeq) {
    const replayMessages = queries.getReplayMessages(db, userId, lastSeq, 100);
    for (const msg of replayMessages) {
      const msgEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'message.new',
        ts: msg.createdAt,
        payload: {
          message: msg,
          replay: true,
        },
      };
      socket.send(JSON.stringify(msgEnv));
    }
  }

  // 3. Envoyer le snapshot complet de présence
  const snapshotEnv: ServerEnvelope = {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'presence.snapshot',
    ts: now,
    payload: {
      users: presenceService.getSnapshot(),
    },
  };
  socket.send(JSON.stringify(snapshotEnv));

  // 4. Diffuser la présence aux autres clients si l'état a changé
  if (changed) {
    const presenceUpdateEnv: ServerEnvelope = {
      v: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      type: 'presence.update',
      ts: now,
      payload: {
        userId,
        online: true,
      },
    };
    wsHub.broadcastExcept(userId, presenceUpdateEnv);
  }
}
