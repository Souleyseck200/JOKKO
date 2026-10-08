// server/src/services/auth.ts
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { CONFIG } from '../config';
import type { User, UUID } from '@lan-comm/shared';

export interface JwtPayload {
  sub: UUID;
  username: string;
  role: 'admin' | 'user';
  iat?: number;
  exp?: number;
}

export function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 10);
}

export function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

// Générateur / vérificateur de JWT autonome (HMAC-SHA256)
export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInDays = 7): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInDays * 24 * 60 * 60,
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', CONFIG.JWT_SECRET)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [b64Header, b64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', CONFIG.JWT_SECRET)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const payloadStr = Buffer.from(b64Payload, 'base64url').toString('utf-8');
    const payload: JwtPayload = JSON.parse(payloadStr);

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expiré
    }

    return payload;
  } catch {
    return null;
  }
}
