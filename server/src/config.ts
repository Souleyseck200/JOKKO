// server/src/config.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES_DIR = path.join(DATA_DIR, 'files');
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// Secret JWT : lu depuis l'environnement ou persisté dans DATA_DIR/secret
function getOrGenerateJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32) {
    return process.env.JWT_SECRET.trim();
  }

  const secretFile = path.join(DATA_DIR, 'secret');
  if (fs.existsSync(secretFile)) {
    const secret = fs.readFileSync(secretFile, 'utf-8').trim();
    if (secret.length >= 32) return secret;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, generated, { encoding: 'utf-8' });
  return generated;
}

export const CONFIG = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATA_DIR,
  FILES_DIR,
  DB_PATH: path.join(DATA_DIR, 'lancomm.sqlite'),
  JWT_SECRET: getOrGenerateJwtSecret(),
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '25', 10),
  ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION !== 'false',
  INVITE_CODE: process.env.INVITE_CODE || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SERVER_NAME: process.env.SERVER_NAME || 'LAN-Comm',
  PROTOCOL_VERSION: 1,
} as const;
