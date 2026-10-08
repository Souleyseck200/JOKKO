// server/src/services/files.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Attachment, UUID } from '@lan-comm/shared';
import { CONFIG } from '../config';
import { getDb } from '../db';
import { queries } from '../db/queries';

const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/zip': 'zip',
};

export function getSafeExtension(mime: string, originalName: string): string {
  if (MIME_EXT_MAP[mime]) {
    return MIME_EXT_MAP[mime];
  }
  const ext = path.extname(originalName).replace('.', '').toLowerCase();
  return ext && /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin';
}

export async function saveUploadedFile(
  uploaderId: UUID,
  originalName: string,
  mime: string,
  buffer: Buffer,
  meta?: { width?: number; height?: number; durationSec?: number }
): Promise<Attachment> {
  const fileId = crypto.randomUUID();
  const ext = getSafeExtension(mime, originalName);
  const fileName = `${fileId}.${ext}`;
  const absolutePath = path.join(CONFIG.FILES_DIR, fileName);
  const relativePath = fileName;

  await fs.promises.writeFile(absolutePath, buffer);

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const size = buffer.length;

  const db = getDb();
  const attachment = queries.insertFile(db, {
    id: fileId,
    uploaderId,
    originalName,
    mime,
    size,
    storagePath: relativePath,
    sha256,
    width: meta?.width || null,
    height: meta?.height || null,
    durationSec: meta?.durationSec || null,
  });

  return attachment;
}

export function getFilePath(storagePath: string): string {
  return path.join(CONFIG.FILES_DIR, storagePath);
}

export function cleanOrphanFiles(): number {
  const db = getDb();
  const orphans = queries.getOrphanFiles(db, 3600000); // 1 heure

  let count = 0;
  for (const orphan of orphans) {
    try {
      const fullPath = path.join(CONFIG.FILES_DIR, orphan.storagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      queries.deleteFile(db, orphan.id);
      count++;
    } catch (err) {
      console.error(`Erreur lors du nettoyage du fichier orphelin ${orphan.id}:`, err);
    }
  }
  return count;
}
