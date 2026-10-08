// server/src/index.ts
import qrcode from 'qrcode-terminal';
import { buildApp } from './http/app';
import { initDb, closeDb } from './db';
import { CONFIG } from './config';
import { getLanIpv4Addresses } from './util/net';
import { cleanOrphanFiles } from './services/files';

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 Démarrage de LAN-Comm Serveur v1.0.0`);
  console.log(`======================================================`);

  // 1. Initialiser SQLite
  initDb();
  console.log(`📦 Base SQLite initialisée dans ${CONFIG.DB_PATH}`);

  // 2. Nettoyeur d'orphelins (toutes les 10 minutes)
  const orphanTimer = setInterval(() => {
    const cleaned = cleanOrphanFiles();
    if (cleaned > 0) {
      console.log(`🧹 Nettoyage de ${cleaned} fichier(s) orphelin(s)`);
    }
  }, 10 * 60 * 1000);

  // 3. Démarrer Fastify
  const app = buildApp();
  try {
    await app.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
  } catch (err) {
    console.error('Erreur au lancement du serveur :', err);
    process.exit(1);
  }

  // 4. Détecter et afficher les IPs LAN pour connexion mobile
  const lanIps = getLanIpv4Addresses();
  const primaryIp = lanIps[0] || '127.0.0.1';
  const serverUrl = `http://${primaryIp}:${CONFIG.PORT}`;

  console.log(`\n📡 Serveur accessible sur le réseau local aux adresses :`);
  for (const ip of lanIps) {
    console.log(`   - http://${ip}:${CONFIG.PORT} (WebSocket : ws://${ip}:${CONFIG.PORT}/ws)`);
  }

  console.log(`\n📱 Flasher ce QR Code depuis l'application mobile pour se connecter :`);
  qrcode.generate(serverUrl, { small: true });

  console.log(`\n✅ Prêt pour les connexions clients (Android / iOS / Dev Build)\n`);

  // Arrêt gracieux
  const cleanup = async () => {
    console.log('\n🛑 Arrêt en cours du serveur...');
    clearInterval(orphanTimer);
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
