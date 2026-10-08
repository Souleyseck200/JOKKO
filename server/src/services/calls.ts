// server/src/services/calls.ts
import crypto from 'node:crypto';
import type {
  UUID, ISODate, CallMedia, CallStatus, ServerCallState,
  CallerDisplayInfo, CallRecord,
} from '@lan-comm/shared';
import { TIMING } from '@lan-comm/shared';
import { getDb } from '../db';
import { queries } from '../db/queries';

export interface ActiveCallSession {
  callId: UUID;
  callerId: UUID;
  calleeId: UUID;
  media: CallMedia;
  state: ServerCallState;
  startedAt: ISODate;
  answeredAt?: ISODate;
  connectedAt?: ISODate;
  ringTimer?: NodeJS.Timeout;
  connectTimer?: NodeJS.Timeout;
  isUrgent?: boolean;
}

export class CallService {
  private activeSessions = new Map<UUID, ActiveCallSession>();
  // Index rapide pour vérifier si un utilisateur est déjà en appel
  private userToCallId = new Map<UUID, UUID>();

  isUserBusy(userId: UUID): boolean {
    const callId = this.userToCallId.get(userId);
    if (!callId) return false;
    const session = this.activeSessions.get(callId);
    return Boolean(session && session.state !== 'ended');
  }

  getSession(callId: UUID): ActiveCallSession | undefined {
    return this.activeSessions.get(callId);
  }

  createInvite(
    callerId: UUID,
    calleeId: UUID,
    media: CallMedia,
    isUrgent = false,
    onTimeout?: (session: ActiveCallSession) => void
  ): {
    session?: ActiveCallSession;
    callerInfo: CallerDisplayInfo;
    error?: 'CALL_BUSY' | 'INTERNAL';
  } {
    const db = getDb();

    // Vérifier si l'appelant ou l'appelé est déjà occupé
    if (this.isUserBusy(callerId) || this.isUserBusy(calleeId)) {
      return {
        callerInfo: queries.resolveCallerDisplay(db, calleeId, callerId)!,
        error: 'CALL_BUSY',
      };
    }

    const callId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Insérer en base de données avec statut initial
    queries.insertCall(db, {
      id: callId,
      callerId,
      calleeId,
      media,
      status: 'missed', // par défaut si timeout
      startedAt: now,
      isUrgent,
    });

    const session: ActiveCallSession = {
      callId,
      callerId,
      calleeId,
      media,
      state: 'ringing',
      startedAt: now,
      isUrgent,
    };

    // Timer de sonnerie (30 s)
    session.ringTimer = setTimeout(() => {
      this.endCall(callId, 'missed', 'timeout');
      if (onTimeout) {
        onTimeout(session);
      }
    }, TIMING.RING_TIMEOUT_MS);

    this.activeSessions.set(callId, session);
    this.userToCallId.set(callerId, callId);
    this.userToCallId.set(calleeId, callId);

    const callerInfo = queries.resolveCallerDisplay(db, calleeId, callerId)!;

    return { session, callerInfo };
  }

  acceptCall(
    callId: UUID,
    calleeId: UUID,
    onConnectTimeout?: (session: ActiveCallSession) => void
  ): ActiveCallSession | null {
    const session = this.activeSessions.get(callId);
    if (!session || session.calleeId !== calleeId || session.state !== 'ringing') {
      return null;
    }

    if (session.ringTimer) {
      clearTimeout(session.ringTimer);
      session.ringTimer = undefined;
    }

    const now = new Date().toISOString();
    session.state = 'accepted';
    session.answeredAt = now;

    // Timer d'établissement WebRTC (20 s)
    session.connectTimer = setTimeout(() => {
      this.endCall(callId, 'failed', 'connect_timeout');
      if (onConnectTimeout) {
        onConnectTimeout(session);
      }
    }, TIMING.CONNECT_TIMEOUT_MS);

    return session;
  }

  markConnected(callId: UUID): ActiveCallSession | null {
    const session = this.activeSessions.get(callId);
    if (!session || (session.state !== 'accepted' && session.state !== 'ringing')) {
      return null;
    }

    if (session.connectTimer) {
      clearTimeout(session.connectTimer);
      session.connectTimer = undefined;
    }

    session.state = 'connected';
    session.connectedAt = new Date().toISOString();

    return session;
  }

  endCall(callId: UUID, status: CallStatus, reason?: string): CallRecord | null {
    const session = this.activeSessions.get(callId);
    if (!session) return null;

    if (session.ringTimer) clearTimeout(session.ringTimer);
    if (session.connectTimer) clearTimeout(session.connectTimer);

    session.state = 'ended';
    const now = new Date().toISOString();

    let durationSec: number | null = null;
    if (session.answeredAt) {
      const start = new Date(session.answeredAt).getTime();
      const end = new Date(now).getTime();
      durationSec = Math.max(0, Math.floor((end - start) / 1000));
    }

    const db = getDb();
    const updated = queries.updateCall(db, callId, {
      status,
      answeredAt: session.answeredAt || null,
      endedAt: now,
      durationSec,
      endReason: reason || null,
    });

    this.activeSessions.delete(callId);
    this.userToCallId.delete(session.callerId);
    this.userToCallId.delete(session.calleeId);

    return updated;
  }
}

export const callService = new CallService();
