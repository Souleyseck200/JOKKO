// server/src/ws/handlers/call.ts
import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEnvelope, ServerEnvelope, UUID } from '@lan-comm/shared';
import {
  wsCallInviteSchema, wsCallActionSchema, wsCallOfferAnswerSchema, wsCallIceSchema,
  PROTOCOL_VERSION,
} from '@lan-comm/shared';
import { wsHub } from '../hub';
import { callService } from '../../services/calls';
import { getDb } from '../../db';
import { queries } from '../../db/queries';

export function handleCall(socket: WebSocket, userId: UUID, envelope: ClientEnvelope): void {
  const db = getDb();
  const now = new Date().toISOString();

  switch (envelope.type) {
    case 'call.invite': {
      const parsed = wsCallInviteSchema.safeParse(envelope.payload);
      if (!parsed.success) {
        socket.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            id: crypto.randomUUID(),
            type: 'error',
            ts: now,
            ref: envelope.id,
            payload: { code: 'INVALID_PAYLOAD', message: 'Payload call.invite invalide' },
          })
        );
        return;
      }

      const { calleeId, media, isUrgent } = parsed.data;

      // 1. Vérifier si l'appelé est en ligne
      if (!wsHub.isUserConnected(calleeId)) {
        // Enregistrer l'appel comme manqué
        const callId = crypto.randomUUID();
        queries.insertCall(db, {
          id: callId,
          callerId: userId,
          calleeId,
          media,
          status: 'missed',
          startedAt: now,
          isUrgent,
        });

        const unavailEnv: ServerEnvelope = {
          v: PROTOCOL_VERSION,
          id: crypto.randomUUID(),
          type: 'call.unavailable',
          ts: now,
          ref: envelope.id,
          payload: { callId },
        };
        socket.send(JSON.stringify(unavailEnv));
        return;
      }

      // 2. Créer la session d'appel
      const result = callService.createInvite(userId, calleeId, media, Boolean(isUrgent), (session) => {
        // Callback en cas de timeout (30s)
        const timeoutEnv: ServerEnvelope = {
          v: PROTOCOL_VERSION,
          id: crypto.randomUUID(),
          type: 'call.timeout',
          ts: new Date().toISOString(),
          payload: { callId: session.callId },
        };
        wsHub.send(session.callerId, timeoutEnv);
        wsHub.send(session.calleeId, timeoutEnv);
      });

      if (result.error === 'CALL_BUSY' || !result.session) {
        const busyEnv: ServerEnvelope = {
          v: PROTOCOL_VERSION,
          id: crypto.randomUUID(),
          type: 'call.busy',
          ts: now,
          ref: envelope.id,
          payload: { callId: crypto.randomUUID() },
        };
        socket.send(JSON.stringify(busyEnv));
        return;
      }

      const { session, callerInfo } = result;

      // 3. Notifier l'appelant que ça sonne
      const ringingEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.ringing',
        ts: now,
        ref: envelope.id,
        payload: { callId: session.callId },
      };
      socket.send(JSON.stringify(ringingEnv));

      // 4. Notifier l'appelé de l'appel entrant avec la résolution callerInfo :
      // - Si connu (dans les contacts de l'appelé) : affiche son nom + téléphone
      // - Si inconnu (pas enregistré) : nom = null (affiche uniquement sa photo et son numéro)
      const incomingEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.incoming',
        ts: now,
        payload: {
          callId: session.callId,
          callerId: userId,
          media,
          startedAt: session.startedAt,
          callerInfo,
          isUrgent,
        },
      };
      wsHub.send(calleeId, incomingEnv);
      break;
    }

    case 'call.accept': {
      const parsed = wsCallActionSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId } = parsed.data;
      const session = callService.acceptCall(callId, userId, (timeoutSession) => {
        const endedEnv: ServerEnvelope = {
          v: PROTOCOL_VERSION,
          id: crypto.randomUUID(),
          type: 'call.ended',
          ts: new Date().toISOString(),
          payload: { callId: timeoutSession.callId, reason: 'connect_timeout' },
        };
        wsHub.send(timeoutSession.callerId, endedEnv);
        wsHub.send(timeoutSession.calleeId, endedEnv);
      });

      if (!session) return;

      const acceptedEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.accepted',
        ts: now,
        ref: envelope.id,
        payload: { callId },
      };
      wsHub.send(session.callerId, acceptedEnv);
      break;
    }

    case 'call.reject': {
      const parsed = wsCallActionSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId, reason } = parsed.data;
      const session = callService.getSession(callId);
      if (!session) return;

      callService.endCall(callId, 'rejected', reason || 'declined');

      const rejectedEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.rejected',
        ts: now,
        ref: envelope.id,
        payload: { callId, reason },
      };
      wsHub.send(session.callerId, rejectedEnv);
      break;
    }

    case 'call.cancel': {
      const parsed = wsCallActionSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId } = parsed.data;
      const session = callService.getSession(callId);
      if (!session || session.callerId !== userId) return;

      callService.endCall(callId, 'cancelled', 'caller_cancel');

      const cancelledEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.cancelled',
        ts: now,
        ref: envelope.id,
        payload: { callId },
      };
      wsHub.send(session.calleeId, cancelledEnv);
      break;
    }

    case 'call.end': {
      const parsed = wsCallActionSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId, reason } = parsed.data;
      const session = callService.getSession(callId);
      if (!session) return;

      const peerId = session.callerId === userId ? session.calleeId : session.callerId;
      callService.endCall(callId, 'completed', reason || 'hangup');

      const endedEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.ended',
        ts: now,
        ref: envelope.id,
        payload: { callId, reason },
      };
      wsHub.send(peerId, endedEnv);
      break;
    }

    case 'call.connected': {
      const parsed = wsCallActionSchema.safeParse(envelope.payload);
      if (!parsed.success) return;
      callService.markConnected(parsed.data.callId);
      break;
    }

    case 'call.offer': {
      const parsed = wsCallOfferAnswerSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId, sdp } = parsed.data;
      const session = callService.getSession(callId);
      if (!session) return;

      const peerId = session.callerId === userId ? session.calleeId : session.callerId;
      const offerEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.offer',
        ts: now,
        payload: { callId, sdp },
      };
      wsHub.send(peerId, offerEnv);
      break;
    }

    case 'call.answer': {
      const parsed = wsCallOfferAnswerSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId, sdp } = parsed.data;
      const session = callService.getSession(callId);
      if (!session) return;

      const peerId = session.callerId === userId ? session.calleeId : session.callerId;
      const answerEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.answer',
        ts: now,
        payload: { callId, sdp },
      };
      wsHub.send(peerId, answerEnv);
      break;
    }

    case 'call.ice': {
      const parsed = wsCallIceSchema.safeParse(envelope.payload);
      if (!parsed.success) return;

      const { callId, candidate } = parsed.data;
      const session = callService.getSession(callId);
      if (!session) return;

      const peerId = session.callerId === userId ? session.calleeId : session.callerId;
      const iceEnv: ServerEnvelope = {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        type: 'call.ice',
        ts: now,
        payload: {
          callId,
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          },
        },
      };
      wsHub.send(peerId, iceEnv);
      break;
    }
  }
}
