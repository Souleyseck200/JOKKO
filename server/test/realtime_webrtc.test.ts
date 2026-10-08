// server/test/realtime_webrtc.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import crypto from 'node:crypto';
import { buildApp } from '../src/http/app';
import { initDb, closeDb } from '../src/db';
import { queries } from '../src/db/queries';
import { signJwt } from '../src/services/auth';
import type { FastifyInstance } from 'fastify';
import type { ServerEnvelope } from '@lan-comm/shared';

describe('Real-Time WebSockets & WebRTC Signaling Flow', () => {
  let app: FastifyInstance;
  let serverPort: number;

  const callerId = crypto.randomUUID();
  const calleeId = crypto.randomUUID();
  let callerToken: string;
  let calleeToken: string;

  beforeAll(async () => {
    const db = initDb(':memory:');

    // Créer appelant et appelé
    queries.createUser(db, {
      id: callerId,
      username: 'alice_call',
      phoneNumber: '+1 555 100 0001',
      displayName: 'Alice Calling',
      passwordHash: 'dummy',
    });

    queries.createUser(db, {
      id: calleeId,
      username: 'bob_callee',
      phoneNumber: '+1 555 100 0002',
      displayName: 'Bob Answering',
      passwordHash: 'dummy',
    });

    // Enregistrer Alice dans les contacts de Bob
    queries.upsertContact(db, calleeId, callerId, 'Alice Contact');

    callerToken = signJwt({ sub: callerId, username: 'alice_call', role: 'user' });
    calleeToken = signJwt({ sub: calleeId, username: 'bob_callee', role: 'user' });

    app = buildApp();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? parseInt(match[1], 10) : 3000;
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  function connectAndAuth(token: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            v: 1,
            id: crypto.randomUUID(),
            type: 'hello',
            ts: new Date().toISOString(),
            payload: { token, lastSeq: 0 },
          })
        );
      });

      const onMessage = (raw: WebSocket.RawData) => {
        const env: ServerEnvelope = JSON.parse(raw.toString());
        if (env.type === 'hello.ok') {
          ws.off('message', onMessage);
          resolve(ws);
        }
      };

      ws.on('message', onMessage);
      ws.on('error', reject);
    });
  }

  function waitForMessage(ws: WebSocket, type: string): Promise<ServerEnvelope> {
    return new Promise((resolve) => {
      const handler = (raw: WebSocket.RawData) => {
        const env: ServerEnvelope = JSON.parse(raw.toString());
        if (env.type === type) {
          ws.off('message', handler);
          resolve(env);
        }
      };
      ws.on('message', handler);
    });
  }

  it('exécute un flux complet de signalisation d appel vidéo WebRTC', async () => {
    // 1. Connexion et authentification des deux pairs
    const callerWs = await connectAndAuth(callerToken);
    const calleeWs = await connectAndAuth(calleeToken);

    // 2. Caller émet call.invite (vidéo)
    const incomingPromise = waitForMessage(calleeWs, 'call.incoming');
    const ringingPromise = waitForMessage(callerWs, 'call.ringing');

    callerWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.invite',
        ts: new Date().toISOString(),
        payload: { calleeId, media: 'video', isUrgent: true },
      })
    );

    const [ringingEnv, incomingEnv] = await Promise.all([ringingPromise, incomingPromise]);

    expect(ringingEnv.type).toBe('call.ringing');
    expect(incomingEnv.type).toBe('call.incoming');

    const incomingPayload = incomingEnv.payload as any;
    const callId = incomingPayload.callId;

    // Vérifier la résolution du callerInfo
    expect(incomingPayload.callerInfo.isKnown).toBe(true);
    expect(incomingPayload.callerInfo.name).toBe('Alice Contact');
    expect(incomingPayload.callerInfo.phoneNumber).toBe('+1 555 100 0001');

    // 3. Callee décroche (call.accept)
    const acceptedPromise = waitForMessage(callerWs, 'call.accepted');
    calleeWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.accept',
        ts: new Date().toISOString(),
        payload: { callId },
      })
    );

    const acceptedEnv = await acceptedPromise;
    expect(acceptedEnv.type).toBe('call.accepted');

    // 4. Échange SDP Offer / Answer
    const offerPromise = waitForMessage(calleeWs, 'call.offer');
    callerWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.offer',
        ts: new Date().toISOString(),
        payload: { callId, sdp: { type: 'offer', sdp: 'v=0\r\no=alice 123' } },
      })
    );
    const offerEnv = await offerPromise;
    expect((offerEnv.payload as any).sdp.sdp).toBe('v=0\r\no=alice 123');

    const answerPromise = waitForMessage(callerWs, 'call.answer');
    calleeWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.answer',
        ts: new Date().toISOString(),
        payload: { callId, sdp: { type: 'answer', sdp: 'v=0\r\no=bob 456' } },
      })
    );
    const answerEnv = await answerPromise;
    expect((answerEnv.payload as any).sdp.sdp).toBe('v=0\r\no=bob 456');

    // 5. Échange ICE Candidate
    const icePromise = waitForMessage(calleeWs, 'call.ice');
    callerWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.ice',
        ts: new Date().toISOString(),
        payload: {
          callId,
          candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.50 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
        },
      })
    );
    const iceEnv = await icePromise;
    expect((iceEnv.payload as any).candidate.candidate).toContain('192.168.1.50');

    // 6. Signalement d'établissement P2P (call.connected)
    callerWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.connected',
        ts: new Date().toISOString(),
        payload: { callId },
      })
    );

    // 7. Fin d'appel (call.end)
    const endedPromise = waitForMessage(calleeWs, 'call.ended');
    callerWs.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: 'call.end',
        ts: new Date().toISOString(),
        payload: { callId, reason: 'hangup' },
      })
    );
    const endedEnv = await endedPromise;
    expect(endedEnv.type).toBe('call.ended');

    // Fermeture propre des sockets de test
    callerWs.close();
    calleeWs.close();
  });
});
