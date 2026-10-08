// server/src/http/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';
import { CONFIG } from '../../config';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      ok: true,
      name: CONFIG.SERVER_NAME,
      version: '1.0.0',
      time: new Date().toISOString(),
    };
  });

  fastify.get('/server-info', async () => {
    return {
      name: CONFIG.SERVER_NAME,
      version: '1.0.0',
      protocol: CONFIG.PROTOCOL_VERSION,
      maxUploadMb: CONFIG.MAX_UPLOAD_MB,
      registrationOpen: CONFIG.ALLOW_REGISTRATION,
    };
  });
};
