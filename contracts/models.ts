// contracts/models.ts — Source de vérité des modèles partagés (serveur + mobile)

export type UUID = string;
export type ISODate = string; // ISO-8601 UTC

export interface User {
  id: UUID;
  username: string;
  displayName: string;
  avatarFileId: UUID | null;
  createdAt: ISODate;
  lastSeenAt: ISODate | null;
}

export interface UserWithPresence extends User {
  online: boolean;
}

export type ConversationType = 'direct' | 'group';

export interface Conversation {
  id: UUID;
  type: ConversationType;
  title: string | null;
  createdAt: ISODate;
  lastMessageSeq: number | null;
}

export interface ConversationMember {
  conversationId: UUID;
  userId: UUID;
  role: 'member' | 'admin';
  joinedAt: ISODate;
  lastReadSeq: number;
  muted: boolean;
}

export interface ConversationSummary extends Conversation {
  members: User[];
  lastMessage: Message | null;
  unreadCount: number;
}

export type MessageKind = 'text' | 'image' | 'file' | 'system';

export interface Attachment {
  id: UUID;
  originalName: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: ISODate;
}

export interface Message {
  id: UUID;
  seq: number;
  conversationId: UUID;
  senderId: UUID;
  clientMsgId: UUID;
  kind: MessageKind;
  body: string;
  attachments: Attachment[];
  createdAt: ISODate;
  deletedAt: ISODate | null;
}

/** Statut calculé pour l'expéditeur. 'sending' et 'failed' n'existent que côté client. */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageReceipt {
  messageId: UUID;
  userId: UUID;
  deliveredAt: ISODate | null;
  readAt: ISODate | null;
}

export type CallMedia = 'audio' | 'video';
export type CallStatus =
  | 'completed' | 'missed' | 'rejected' | 'cancelled' | 'busy' | 'failed';

export interface CallRecord {
  id: UUID;
  callerId: UUID;
  calleeId: UUID;
  media: CallMedia;
  status: CallStatus;
  startedAt: ISODate;
  answeredAt: ISODate | null;
  endedAt: ISODate | null;
  durationSec: number | null;
  endReason: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  DISPLAY_NAME_MAX: 40,
  PASSWORD_MIN: 6,
  MESSAGE_BODY_MAX: 4000,
  WS_ENVELOPE_MAX_BYTES: 64 * 1024,
  UPLOAD_MAX_MB: 25,
  PAGE_SIZE_DEFAULT: 40,
  PAGE_SIZE_MAX: 100,
} as const;

export const TIMING = {
  HELLO_TIMEOUT_MS: 5_000,
  HEARTBEAT_INTERVAL_MS: 15_000,
  PONG_TIMEOUT_MS: 10_000,
  TYPING_TTL_MS: 5_000,
  RING_TIMEOUT_MS: 30_000,
  CONNECT_TIMEOUT_MS: 20_000,
  SEND_ATTEMPT_TIMEOUT_MS: 15_000,
  SEND_MAX_ATTEMPTS: 3,
  ORPHAN_FILE_TTL_MS: 60 * 60 * 1000,
  JWT_TTL_DAYS: 7,
} as const;
