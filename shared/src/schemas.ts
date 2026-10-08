// shared/src/schemas.ts — Schémas de validation Zod partagés
import { z } from 'zod';
import { LIMITS } from './models';
import { PROTOCOL_VERSION } from './protocol';

export const uuidSchema = z.string().uuid();

export const registerSchema = z.object({
  username: z
    .string()
    .min(LIMITS.USERNAME_MIN, `Le nom d'utilisateur doit faire au moins ${LIMITS.USERNAME_MIN} caractères`)
    .max(LIMITS.USERNAME_MAX, `Le nom d'utilisateur ne doit pas dépasser ${LIMITS.USERNAME_MAX} caractères`)
    .regex(/^[a-z0-9_.-]+$/i, 'Caractères autorisés : lettres, chiffres, tirets, underscores, points'),
  phoneNumber: z
    .string()
    .min(LIMITS.PHONE_MIN, 'Numéro de téléphone trop court')
    .max(LIMITS.PHONE_MAX, 'Numéro de téléphone trop long')
    .regex(/^[+0-9\s().-]+$/, 'Format de numéro de téléphone invalide'),
  displayName: z
    .string()
    .min(1, 'Le nom affiché est requis')
    .max(LIMITS.DISPLAY_NAME_MAX, `Le nom ne doit pas dépasser ${LIMITS.DISPLAY_NAME_MAX} caractères`),
  password: z
    .string()
    .min(LIMITS.PASSWORD_MIN, `Le mot de passe doit faire au moins ${LIMITS.PASSWORD_MIN} caractères`),
  role: z.enum(['admin', 'user']).optional().default('user'),
});

export const loginSchema = z.object({
  usernameOrPhone: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(LIMITS.DISPLAY_NAME_MAX).optional(),
  avatarFileId: uuidSchema.nullable().optional(),
});

export const contactSchema = z.object({
  contactUserId: uuidSchema,
  nickname: z.string().min(1).max(LIMITS.DISPLAY_NAME_MAX),
});

export const createConversationSchema = z.object({
  type: z.literal('direct'),
  userId: uuidSchema,
});

export const sdpPayloadSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1),
});

export const iceCandidatePayloadSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
});

// WS Enveloppes
export const envelopeBaseSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: uuidSchema,
  type: z.string(),
  ts: z.string(),
  ref: uuidSchema.optional(),
  payload: z.unknown(),
});

export const wsHelloSchema = z.object({
  token: z.string().min(1),
  lastSeq: z.number().int().nonnegative(),
  deviceInfo: z
    .object({
      platform: z.string(),
      appVersion: z.string(),
    })
    .optional(),
});

export const wsMessageSendSchema = z.object({
  conversationId: uuidSchema,
  clientMsgId: uuidSchema,
  kind: z.enum(['text', 'image', 'voice', 'file']),
  body: z.string().max(LIMITS.MESSAGE_BODY_MAX).optional().default(''),
  attachmentIds: z.array(uuidSchema).optional(),
  durationSec: z.number().min(0).max(LIMITS.VOICE_MAX_SEC).optional(),
});

export const wsReceiptDeliveredSchema = z.object({
  messageIds: z.array(uuidSchema).min(1),
});

export const wsReceiptReadSchema = z.object({
  conversationId: uuidSchema,
  upToSeq: z.number().int().nonnegative(),
});

export const wsTypingSchema = z.object({
  conversationId: uuidSchema,
});

export const wsCallInviteSchema = z.object({
  calleeId: uuidSchema,
  media: z.enum(['audio', 'video']),
  isUrgent: z.boolean().optional(),
});

export const wsCallActionSchema = z.object({
  callId: uuidSchema,
  reason: z.string().optional(),
});

export const wsCallOfferAnswerSchema = z.object({
  callId: uuidSchema,
  sdp: sdpPayloadSchema,
});

export const wsCallIceSchema = z.object({
  callId: uuidSchema,
  candidate: iceCandidatePayloadSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
