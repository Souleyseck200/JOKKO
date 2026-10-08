// server/src/db/seed.ts
import crypto from 'node:crypto';
import { initDb, closeDb } from './index';
import { queries } from './queries';
import { hashPassword } from '../services/auth';

async function seed() {
  console.log('🌱 Amorçage des données de test...');
  const db = initDb();

  const passwordHash = await hashPassword('password123');

  // 1. Utilisateur Admin : Alice
  let alice: import('@lan-comm/shared').User | null = queries.getUserByUsername(db, 'alice');
  if (!alice) {
    alice = queries.createUser(db, {
      id: crypto.randomUUID(),
      username: 'alice',
      phoneNumber: '+1 (555) 111-1111',
      displayName: 'Alice Dupont',
      passwordHash,
      role: 'admin',
    });
    console.log('   - Créé : Alice (Admin, +1 555 111-1111)');
  }

  // 2. Utilisateur standard : Bob
  let bob: import('@lan-comm/shared').User | null = queries.getUserByUsername(db, 'bob');
  if (!bob) {
    bob = queries.createUser(db, {
      id: crypto.randomUUID(),
      phoneNumber: '+1 (555) 222-2222',
      username: 'bob',
      displayName: 'Bob Martin',
      passwordHash,
      role: 'user',
    });
    console.log('   - Créé : Bob (User, +1 555 222-2222)');
  }

  // 3. Utilisateur correspondant au mockup : Min Harada
  let minHarada: import('@lan-comm/shared').User | null = queries.getUserByUsername(db, 'min_harada');
  if (!minHarada) {
    minHarada = queries.createUser(db, {
      id: crypto.randomUUID(),
      username: 'min_harada',
      phoneNumber: '+1 (555) 453-2345',
      displayName: 'Min Harada',
      passwordHash,
      role: 'user',
    });
    console.log('   - Créé : Min Harada (+1 (555) 453-2345)');
  }

  // 4. Utilisateur inconnu non enregistré dans les contacts de Bob : Inconnu / Carol
  let carol: import('@lan-comm/shared').User | null = queries.getUserByUsername(db, 'carol');
  if (!carol) {
    carol = queries.createUser(db, {
      id: crypto.randomUUID(),
      username: 'carol',
      phoneNumber: '+1 (555) 483-5843',
      displayName: 'Carol Williams',
      passwordHash,
      role: 'user',
    });
    console.log('   - Créé : Carol (+1 (555) 483-5843)');
  }

  // 5. Enregistrer Min Harada dans les contacts de Bob
  if (bob && minHarada) {
    queries.upsertContact(db, bob.id, minHarada.id, 'Min Harada');
    console.log('   - Contact ajouté : Bob a enregistré Min Harada dans son répertoire');
  }

  // Note : Carol n'est PAS enregistrée dans les contacts de Bob.
  // Quand Carol appelle Bob, Bob verra uniquement le numéro et la photo (nom = null),
  // conformément à la règle : "si un user que tu nas pas enregistré tappel ca naffiche pas son nom mais sa photo de profil et son numero de telephone".

  console.log('✅ Base de données initialisée avec succès !');
  closeDb();
}

seed().catch(console.error);
