// contracts/protocol.ts — Protocole WebSocket v1 (source de vérité)
import type {
  UUID, ISODate, Message, MessageKind, Conversation, User,
  CallMedia, CallRecord,
} from './models';

export const PROTOCOL_VERSION = 1 as const;

export const WS_CLOSE = {
  HELLO_TIMEOUT: 4001,
  BAD_TOKEN: 4002,
  UNSUPPORTED_VERSION: 4003,
  REPLACED: 4004,
} as const;

export type ErrorCode =
  | 'UNSUPPORTED_VERSION' | 'INVALID_PAYLOAD' | 'UNAUTHENTICATED'
  | 'FORBIDDEN' | 'NOT_FOUND' | 'RATE_LIMITED' | 'PAYLOAD_TOO_LARGE'
  | 'CALL_BUSY' | 'CALL_INVALID_STATE' | 'INTERNAL';

export interface Envelope<T extends string = string, P = unknown> {
  v: typeof PROTOCOL_VERSION;
  id: UUID;
  type: T;
  ts: ISODate;
  ref?: UUID;
  payload: P;
}

// ---------- WebRTC (sérialisables, indépendants de la lib native) ----------
export interface SdpPayload { type: 'offer' | 'answer'; sdp: string }
export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

// ---------- Client -> Serveur ----------
export interface ClientEvents {
  'hello': { token: string; lastSeq: number; deviceInfo?: { platform: string; appVersion: string } };
  'ping': Record<string, never>;

  'message.send': {
    conversationId: UUID;
    clientMsgId: UUID;
    kind: Exclude<MessageKind, 'system'>;
    body?: string;
    attachmentIds?: UUID[];
  };
  'receipt.delivered': { messageIds: UUID[] };
  'receipt.read': { conversationId: UUID; upToSeq: number };
  'typing.start': { conversationId: UUID };
  'typing.stop': { conversationId: UUID };
  'presence.get': Record<string, never>;

  'call.invite': { calleeId: UUID; media: CallMedia };
  'call.accept': { callId: UUID };
  'call.reject': { callId: UUID };
  'call.cancel': { callId: UUID };
  'call.end': { callId: UUID; reason?: string };
  'call.connected': { callId: UUID };
  'call.offer': { callId: UUID; sdp: SdpPayload };
  'call.answer': { callId: UUID; sdp: SdpPayload };
  'call.ice': { callId: UUID; candidate: IceCandidatePayload };
}

// ---------- Serveur -> Client ----------
export interface ServerEvents {
  'hello.ok': {
    userId: UUID;
    serverTime: ISODate;
    currentSeq: number;
    heartbeatSec: number;
    missedCalls: CallRecord[]; // appels manqués depuis la dernière déconnexion
  };
  'pong': Record<string, never>;
  'error': { code: ErrorCode; message: string; details?: unknown };

  'message.ack': {
    clientMsgId: UUID; messageId: UUID; seq: number;
    createdAt: ISODate; conversationId: UUID;
  };
  'message.new': { message: Message; replay?: boolean };
  'receipt.update': {
    conversationId: UUID; messageIds: UUID[]; userId: UUID;
    state: 'delivered' | 'read'; at: ISODate;
  };
  'typing.update': { conversationId: UUID; userId: UUID; typing: boolean };
  'presence.snapshot': { users: { userId: UUID; online: boolean; lastSeenAt: ISODate | null }[] };
  'presence.update': { userId: UUID; online: boolean; lastSeenAt?: ISODate | null };
  'conversation.new': { conversation: Conversation; members: User[] };

  'call.incoming': { callId: UUID; callerId: UUID; media: CallMedia; startedAt: ISODate };
  'call.ringing': { callId: UUID };
  'call.accepted': { callId: UUID };
  'call.rejected': { callId: UUID };
  'call.cancelled': { callId: UUID };
  'call.ended': { callId: UUID; reason?: string };
  'call.busy': { callId: UUID };
  'call.unavailable': { callId: UUID };
  'call.timeout': { callId: UUID };
  'call.offer': { callId: UUID; sdp: SdpPayload };
  'call.answer': { callId: UUID; sdp: SdpPayload };
  'call.ice': { callId: UUID; candidate: IceCandidatePayload };
}

export type ClientEventType = keyof ClientEvents;
export type ServerEventType = keyof ServerEvents;

export type ClientEnvelope = {
  [K in ClientEventType]: Envelope<K, ClientEvents[K]>;
}[ClientEventType];

export type ServerEnvelope = {
  [K in ServerEventType]: Envelope<K, ServerEvents[K]>;
}[ServerEventType];

// ---------- États d'appel ----------
export type ServerCallState = 'ringing' | 'accepted' | 'connected' | 'ended';
export type ClientCallState =
  | 'idle' | 'outgoing_ringing' | 'incoming_ringing'
  | 'connecting' | 'active' | 'ended';
