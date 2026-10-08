// server/src/http/app.ts
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { setupWebSocket } from '../ws/router';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { contactRoutes } from './routes/contacts';
import { conversationRoutes } from './routes/conversations';
import { fileRoutes } from './routes/files';
import { callRoutes } from './routes/calls';
import { adminRoutes } from './routes/admin';
import { CONFIG } from '../config';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: CONFIG.LOG_LEVEL === 'debug',
  });

  // CORS (clients mobiles locaux)
  app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Support des uploads multipart (photos, vocaux, documents)
  app.register(multipart, {
    limits: {
      fileSize: CONFIG.MAX_UPLOAD_MB * 1024 * 1024,
    },
  });

  // Support WebSocket
  app.register(websocket);

  // Route WebSocket sur /ws
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (connection) => {
      setupWebSocket(connection.socket);
    });
  });

  // Routes publiques
  app.register(healthRoutes);

  // Routes avec préfixe /api/v1
  app.register(
    async (v1) => {
      v1.register(authRoutes);
      v1.register(userRoutes);
      v1.register(contactRoutes);
      v1.register(conversationRoutes);
      v1.register(fileRoutes);
      v1.register(callRoutes);
      v1.register(adminRoutes);
    },
    { prefix: '/api/v1' }
  );

  return app;
}
