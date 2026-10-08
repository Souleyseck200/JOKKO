// server/test/messages_and_receipts.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { initDb, closeDb, type DatabaseSync } from '../src/db';
import { queries } from '../src/db/queries';

describe('Messages, Voice Notes & Receipts', () => {
  let db: DatabaseSync;
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let conversationId: string;

  beforeAll(() => {
    db = initDb(':memory:');

    queries.createUser(db, {
      id: userAId,
      username: 'alice_msg',
      phoneNumber: '+1 555 111 0001',
      displayName: 'Alice',
      passwordHash: 'dummy',
    });

    queries.createUser(db, {
      id: userBId,
      username: 'bob_msg',
      phoneNumber: '+1 555 111 0002',
      displayName: 'Bob',
      passwordHash: 'dummy',
    });

    const conv = queries.getOrCreateDirectConversation(db, userAId, userBId);
    conversationId = conv.id;
  });

  afterAll(() => {
    closeDb();
  });

  it('envoie un message texte avec incrément monotone de seq', () => {
    const msg1 = queries.insertMessage(db, {
      id: crypto.randomUUID(),
      conversationId,
      senderId: userAId,
      clientMsgId: crypto.randomUUID(),
      kind: 'text',
      body: 'Bonjour Bob !',
    });

    const msg2 = queries.insertMessage(db, {
      id: crypto.randomUUID(),
      conversationId,
      senderId: userBId,
      clientMsgId: crypto.randomUUID(),
      kind: 'text',
      body: 'Salut Alice !',
    });

    expect(msg1.seq).toBeGreaterThan(0);
    expect(msg2.seq).toBeGreaterThan(msg1.seq);
    expect(msg1.body).toBe('Bonjour Bob !');
    expect(msg2.body).toBe('Salut Alice !');
  });

  it('garantit l idempotence absolue sur (senderId, clientMsgId)', () => {
    const clientMsgId = crypto.randomUUID();
    const originalMsgId = crypto.randomUUID();

    const first = queries.insertMessage(db, {
      id: originalMsgId,
      conversationId,
      senderId: userAId,
      clientMsgId,
      kind: 'text',
      body: 'Tentative 1',
    });

    // Renvoi du même message avec le même clientMsgId
    const retry = queries.insertMessage(db, {
      id: crypto.randomUUID(), // nouvel id aléatoire tenté par le client
      conversationId,
      senderId: userAId,
      clientMsgId,
      kind: 'text',
      body: 'Tentative 1 (retry)',
    });

    expect(retry.id).toBe(first.id);
    expect(retry.seq).toBe(first.seq);
  });

  it('supporte les messages vocaux (kind: voice) avec durée et attachement audio', () => {
    // 1. Créer le fichier audio vocal
    const fileId = crypto.randomUUID();
    queries.insertFile(db, {
      id: fileId,
      uploaderId: userAId,
      originalName: 'voice_note_1.m4a',
      mime: 'audio/m4a',
      size: 45000,
      storagePath: `${fileId}.m4a`,
      sha256: 'abc123hash',
      durationSec: 14, // 14 secondes d'enregistrement vocal
    });

    // 2. Insérer le message vocal
    const voiceMsg = queries.insertMessage(db, {
      id: crypto.randomUUID(),
      conversationId,
      senderId: userAId,
      clientMsgId: crypto.randomUUID(),
      kind: 'voice',
      body: 'Message vocal (14s)',
    });

    queries.attachFileToMessage(db, voiceMsg.id, fileId);

    const retrieved = queries.getMessageById(db, voiceMsg.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.kind).toBe('voice');
    expect(retrieved?.attachments).toHaveLength(1);
    expect(retrieved?.attachments[0].mime).toBe('audio/m4a');
    expect(retrieved?.attachments[0].durationSec).toBe(14);
  });

  it('gère le cycle de vie des accusés de réception (delivered et read)', () => {
    const msg = queries.insertMessage(db, {
      id: crypto.randomUUID(),
      conversationId,
      senderId: userAId,
      clientMsgId: crypto.randomUUID(),
      kind: 'text',
      body: 'Test accusés',
    });

    // Accusé de délivrance (Bob a reçu le message)
    queries.recordReceiptDelivered(db, msg.id, userBId);
    let receipts = queries.getMessageReceipts(db, msg.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].deliveredAt).not.toBeNull();
    expect(receipts[0].readAt).toBeNull();

    // Accusé de lecture (Bob a ouvert la conversation)
    queries.recordReceiptRead(db, conversationId, userBId, msg.seq);
    receipts = queries.getMessageReceipts(db, msg.id);
    expect(receipts[0].readAt).not.toBeNull();
  });
});
