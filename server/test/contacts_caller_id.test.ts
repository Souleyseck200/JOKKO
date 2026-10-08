// server/test/contacts_caller_id.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { initDb, closeDb, type DatabaseSync } from '../src/db';
import { queries } from '../src/db/queries';

describe('Contacts & Caller ID Resolution', () => {
  let db: DatabaseSync;

  const receiverId = crypto.randomUUID();
  const knownCallerId = crypto.randomUUID();
  const unknownCallerId = crypto.randomUUID();

  beforeAll(() => {
    db = initDb(':memory:');

    // Créer le récepteur (Bob)
    queries.createUser(db, {
      id: receiverId,
      username: 'bob_receiver',
      phoneNumber: '+1 555 000 0001',
      displayName: 'Bob',
      passwordHash: 'dummy',
    });

    // Créer un appelant connu (Min Harada)
    queries.createUser(db, {
      id: knownCallerId,
      username: 'min_harada',
      phoneNumber: '+1 (555) 453-2345',
      displayName: 'Min Harada Official',
      passwordHash: 'dummy',
    });

    // Créer un appelant inconnu (Carol)
    queries.createUser(db, {
      id: unknownCallerId,
      username: 'carol_unknown',
      phoneNumber: '+1 (555) 483-5843',
      displayName: 'Carol Williams Secret',
      passwordHash: 'dummy',
    });

    // Enregistrer UNIQUEMENT Min Harada dans les contacts de Bob
    queries.upsertContact(db, receiverId, knownCallerId, 'Min Harada');
  });

  afterAll(() => {
    closeDb();
  });

  it('affiche le nom et le numéro si l appelant est un contact enregistré', () => {
    const callerInfo = queries.resolveCallerDisplay(db, receiverId, knownCallerId);

    expect(callerInfo).not.toBeNull();
    expect(callerInfo?.isKnown).toBe(true);
    expect(callerInfo?.name).toBe('Min Harada'); // Le nom du contact enregistré
    expect(callerInfo?.phoneNumber).toBe('+1 (555) 453-2345');
  });

  it('n affiche PAS le nom mais la photo et le numéro si l appelant N EST PAS enregistré', () => {
    const callerInfo = queries.resolveCallerDisplay(db, receiverId, unknownCallerId);

    expect(callerInfo).not.toBeNull();
    expect(callerInfo?.isKnown).toBe(false);
    expect(callerInfo?.name).toBeNull(); // Strictement aucun nom affiché !
    expect(callerInfo?.phoneNumber).toBe('+1 (555) 483-5843'); // Numéro affiché
  });
});
