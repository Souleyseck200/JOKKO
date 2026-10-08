// server/src/http/routes/files.ts
import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { authenticate } from '../middleware';
import { getDb } from '../../db';
import { queries } from '../../db/queries';
import { saveUploadedFile, getFilePath } from '../../services/files';
import { CONFIG } from '../../config';

export const fileRoutes: FastifyPluginAsync = async (fastify) => {
  // Upload multipart de fichier (photo, document, message vocal audio)
  fastify.post('/files', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        error: { code: 'INVALID_PAYLOAD', message: 'Aucun fichier transmis' },
      });
    }

    const buffer = await data.toBuffer();
    const maxBytes = CONFIG.MAX_UPLOAD_MB * 1024 * 1024;

    if (buffer.length > maxBytes) {
      return reply.status(413).send({
        error: { code: 'PAYLOAD_TOO_LARGE', message: `Fichier trop volumineux (max ${CONFIG.MAX_UPLOAD_MB} Mo)` },
      });
    }

    // Récupérer les champs additionnels éventuels (comme durationSec pour le vocal)
    const fields = data.fields as any;
    let durationSec: number | undefined;
    if (fields?.durationSec?.value) {
      durationSec = parseFloat(fields.durationSec.value);
    }

    const attachment = await saveUploadedFile(
      request.user!.id,
      data.filename,
      data.mimetype,
      buffer,
      { durationSec }
    );

    return reply.status(201).send(attachment);
  });

  // Téléchargement / streaming de fichier (photos, messages vocaux avec support Range)
  fastify.get('/files/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const file = queries.getFileById(db, id);

    if (!file) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Fichier introuvable' },
      });
    }

    const filePath = getFilePath(file.storagePath);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Fichier physique introuvable sur le disque' },
      });
    }

    const stat = fs.statSync(filePath);
    const rangeHeader = request.headers.range;

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', file.mime);

    // Support des requêtes partielles (Range) pour la lecture audio et vidéo
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size) {
        return reply.status(416).header('Content-Range', `bytes */${stat.size}`).send();
      }

      const chunksize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      reply.header('Content-Length', chunksize);
      return reply.send(stream);
    } else {
      reply.header('Content-Length', stat.size);
      const stream = fs.createReadStream(filePath);
      return reply.send(stream);
    }
  });
};
