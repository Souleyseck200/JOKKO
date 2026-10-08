# 10 — Plan de travail

## Structure du monorepo
```
lan-comm/
├ package.json            (npm workspaces: shared, server, mobile)
├ shared/
│  └ src/ protocol.ts  models.ts  schemas.ts (zod)  index.ts
├ server/
│  ├ src/
│  │  ├ index.ts  config.ts
│  │  ├ http/ app.ts  routes/{auth,users,conversations,files,calls,health}.ts
│  │  ├ ws/ hub.ts  router.ts  handlers/{message,receipt,typing,presence,call,sync}.ts
│  │  ├ services/ {auth,messages,conversations,files,presence,calls}.ts
│  │  ├ db/ index.ts  migrations/001_init.sql  queries.ts
│  │  └ util/ rateLimit.ts  ids.ts  net.ts (IP LAN)  logger.ts
│  ├ test/ (vitest)
│  ├ .env.example
│  └ tsconfig.json
└ mobile/
   ├ app/ (voir doc 07)
   ├ src/ api/  realtime/  store/  calls/  storage/  components/  hooks/  utils/
   ├ app.config.ts   (permissions, plugins WebRTC, build-properties)
   ├ eas.json
   └ tsconfig.json
```

## Variables d'environnement serveur (`.env.example`)
```
HOST=0.0.0.0
PORT=3000
DATA_DIR=./data
MAX_UPLOAD_MB=25
ALLOW_REGISTRATION=true
INVITE_CODE=
JWT_SECRET=            # optionnel, sinon généré
LOG_LEVEL=info
SERVER_NAME=LAN-Comm
```

## Phases

### Phase 0 — Fondations
Monorepo, `shared/` (types + schémas zod depuis `contracts/`), serveur Fastify qui démarre, `/health`, `/server-info`, SQLite + migration `schema.sql`, affichage IP LAN + QR, app Expo vide avec expo-router.
**Accepté si** : `GET /health` répond depuis un téléphone (navigateur) ; l'app Expo démarre dans Expo Go.

### Phase 1 — Auth + configuration serveur
REST `register/login/me`, JWT, bcrypt, rate-limit. Mobile : S00, S01, S02, S03, SecureStore, `authStore`, `serverStore`.
**Accepté si** : on configure l'IP, crée un compte, ferme/rouvre l'app et reste connecté ; mauvais mot de passe → erreur claire ; mauvaise IP → erreur claire.

### Phase 2 — Messagerie temps réel
WS hub, `hello`/`hello.ok`, heartbeat, reconnexion, `message.send/ack/new`, reçus delivered/read, typing, présence, REST conversations + historique paginé, rattrapage `lastSeq`. Mobile : S04, S05, S08, stores, `ConnectionBanner`.
**Accepté si** :
1. A écrit à B → B reçoit en < 300 ms ; A voit ✓ puis ✓✓ puis ✓✓ bleu.
2. B en mode avion 30 s ; A envoie 5 messages ; B se reconnecte → reçoit les 5 dans l'ordre, sans doublon.
3. A coupe le Wi-Fi, envoie 1 message (⏱), rétablit → message envoyé une seule fois.
4. « écrit… » apparaît et disparaît en ≤ 5 s.
5. Statut en ligne/hors ligne correct sur S05.
6. Redémarrage du serveur : les clients se reconnectent seuls en ≤ 15 s.

### Phase 3 — Fichiers et photos
`POST/GET /files` (Range), contrôle d'accès, nettoyage orphelins. Mobile : `AttachmentPicker`, compression, `UploadProgress`, `ImageBubble`, `FileBubble`, S09.
**Accepté si** : photo de 5 Mo reçue par l'autre téléphone en < 5 s ; PDF 20 Mo OK ; fichier 30 Mo refusé proprement (413) ; un 3ᵉ utilisateur ne peut pas ouvrir `GET /files/:id` d'une conversation qui n'est pas la sienne (403).

### Phase 4 — Finitions messagerie
`InAppNotification`, badges non-lus, S07 Réglages, cache local, gestion d'erreurs/toasts, état vide, déconnexion propre.
**Accepté si** : message reçu dans un autre écran → bannière ; compteur correct ; logout efface token + cache.

### Phase 5 — Appels audio/vidéo (Development Build requis)
Passage en dev build (`expo-dev-client`, plugin WebRTC, permissions, build-properties). Serveur : `services/calls`, handlers `call.*`, timers, historique. Mobile : `CallManager`, S10, S11, `CallControls`, S06.
**Accepté si** :
1. Appel audio A→B : sonnerie < 1 s, parole bidirectionnelle, latence perçue < 300 ms, Internet coupé.
2. Appel vidéo : images locale + distante, flip caméra, mute micro/caméra.
3. Refus, annulation, non-réponse 30 s, occupé → bon statut dans l'historique des deux côtés.
4. Raccrocher d'un côté termine l'autre en < 2 s ; micro et caméra libérés (voyant éteint).
5. Aucun média ne passe par le serveur (vérifier le trafic serveur ≈ 0 pendant l'appel).
6. Coupure WS 5 s pendant l'appel : l'appel continue.

### Phase 6 — Optionnel V1.1
Groupes, suppression de messages, avatars, mDNS, appels de groupe via SFU (hors scope).

## Tests
- **Serveur (vitest)** : auth, idempotence `clientMsgId`, autorisation (403), pagination, reçus, machine à états d'appel (timeouts avec fake timers), upload (taille/MIME), rattrapage `seq`.
- **Protocole** : tests de contrat WS (client de test Node avec `ws`) pour chaque événement.
- **Mobile** : tests unitaires des stores et du `dispatcher` ; test manuel sur 2 appareils selon les critères ci-dessus.
- **Script de charge simple** : 30 clients simulés échangeant 10 msg/s pendant 1 min sans perte.

## Scripts attendus
`npm run dev:server` · `npm run dev:mobile` · `npm run test` · `npm run lint` · `npm run build:server` · `npm run seed` (crée 3 comptes de test : alice, bob, carol / mot de passe `test123`).

## Livrables attendus de l'agent
Code `shared/`, `server/`, `mobile/` ; `README.md` de lancement (installation, `.env`, pare-feu, QR) ; `DECISIONS.md` ; résultats des critères d'acceptation par phase.
