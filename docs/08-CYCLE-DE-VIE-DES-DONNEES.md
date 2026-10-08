# 08 — Cycle de vie des données

Pour chaque donnée : **origine → création → durée de vie → transformation → destination → suppression**.

## A. Authentification et configuration

| Donnée | Origine | Durée de vie | Transformation | Destination | Suppression |
|---|---|---|---|---|---|
| `serverUrl` | saisie/QR (S01) | jusqu'à changement | normalisée `http://ip:port` ; WS dérivé `ws://ip:port/ws` | AsyncStorage → `api`, `socket` | « Changer de serveur » / effacer cache |
| Mot de passe (clair) | saisie S02/S03 | le temps de la requête (RAM, jamais stocké) | → bcrypt serveur | hash en SQLite | jamais en clair après envoi |
| `passwordHash` | serveur | permanent | bcrypt coût 10 | table `users` | suppression du compte |
| JWT `token` | serveur (`/auth/login`) | 7 jours | signé HS256 `{sub,iat,exp}` | SecureStore ; en-tête `Authorization` ; `hello` WS | logout, expiration, 401 |
| `User` (profil) | serveur | permanent | `passwordHash` retiré avant envoi | `authStore`, caches | — |

## B. Messages

| Donnée | Origine | Durée de vie | Transformation | Destination | Suppression |
|---|---|---|---|---|---|
| Brouillon de saisie | `Composer` | RAM, jusqu'à envoi (conservé par conversation tant que l'app vit) | trim ; refus si vide ou > 4000 | — | à l'envoi |
| Message local (`sending`) | client | jusqu'à `message.ack` ou `failed` | ajout `clientMsgId`, statut | `messageStore` | remplacé par la version serveur à l'ack |
| `Message` (serveur) | `message.send` | **permanent** (V1 : pas de rétention auto) | validation zod, ajout `id`, `seq`, `createdAt` | SQLite ; `message.new` aux membres connectés ; REST historique | suppression logique (V1.1) |
| `seq` | serveur | permanent, monotone | AUTOINCREMENT | tri client, `lastSeq`, rattrapage | jamais |
| `lastSeq` (client) | dernier `seq` traité | persistant | `max(lastSeq, message.seq)` | AsyncStorage → `hello` | logout |
| Cache messages client | `message.new`, REST | 200 derniers/chat | fusion dédoublonnée par `id`, tri `seq` | `messageStore` + disque local | logout / vider cache |
| Statut d'affichage (`sent/delivered/read`) | `receipt.*` | dérivé, recalculé | agrège les reçus par destinataire | UI `MessageStatusIcon` | — |
| `MessageReceipt` | `receipt.delivered/read` | permanent | horodaté serveur | SQLite ; `receipt.update` à l'expéditeur | avec le message |
| `lastReadSeq` (membre) | `receipt.read` | permanent | `max` ancien/nouveau | SQLite → calcule `unreadCount` | — |
| `unreadCount` | dérivé serveur à `GET /conversations` ; incrément client sur `message.new` | recalculé | `lastMessageSeq` vs `lastReadSeq` | badge S04 | remis à 0 par `receipt.read` |

## C. Fichiers et photos

| Étape | Détail |
|---|---|
| Sélection | `expo-image-picker` / `expo-document-picker` → URI locale temporaire (cache app) |
| Transformation image | redimensionnement max 1600 px, JPEG qualité 0.7 (`expo-image-manipulator`) |
| Upload | `POST /files` multipart en streaming ; progression côté client |
| Stockage serveur | `DATA_DIR/files/<uuid>.<ext>` + ligne `files` (nom nettoyé, mime vérifié, taille, sha256) |
| Rattachement | `message.send.attachmentIds` → `message_attachments` |
| Orphelins | non rattachés après 1 h → supprimés (job toutes les 10 min) |
| Téléchargement | `GET /files/:id` avec JWT ; mis en cache disque client (`FileSystem.cacheDirectory/lancomm/`) |
| Durée côté client | cache purgeable (max 200 Mo, LRU) |
| Durée côté serveur | **permanent** V1 |
| Suppression | purge manuelle (script admin) ; V1.1 : suppression avec le message |

## D. Présence et frappe (éphémères)

| Donnée | Origine | Durée | Transformation | Destination |
|---|---|---|---|---|
| `Connection` | `hello` valide | socket ouvert | association `userId↔socket` | `hub` RAM |
| `online` | (dé)connexion WS | tant que ≥ 1 connexion | `connCount>0` | `presence.update` à tous ; `presenceStore` |
| `lastSeenAt` | fermeture du dernier socket | permanent | horodatage serveur | `users.lastSeenAt` ; affiché « vu à 14:02 » |
| `typing` | `typing.start` | 5 s, renouvelé | expiration auto → `typing:false` | `typing.update` aux autres membres ; `typingStore` |

## E. Appels

| Donnée | Origine | Durée | Transformation | Destination | Suppression |
|---|---|---|---|---|---|
| `callId` | serveur à `call.invite` | durée de la session | UUID | tous les messages `call.*` | à l'état terminal (RAM) ; conservé en `calls` |
| `CallSession` | serveur | ringing→ended | machine à états | RAM serveur | à `ended` |
| Timer sonnerie | serveur | 30 s | → `call.timeout` | — | à décision |
| SDP offer/answer | pairs | quelques secondes | relayés sans modification | `setRemoteDescription` | après négociation (non stockés) |
| ICE candidates | pairs | quelques secondes | relayés ; mis en file si pas de remoteDescription | `addIceCandidate` | non stockés |
| Flux média (RTP) | micro/caméra | durée de l'appel | encodage Opus/VP8, chiffrement SRTP/DTLS | P2P vers l'autre téléphone | `track.stop()` + `pc.close()` à la fin ; **jamais enregistrés ni transitant par le serveur** |
| Enregistrement `Call` | serveur | **permanent** | calcul `durationSec`, statut | `calls` ; `GET /calls` ; S06 | — |
| État UI `callStore` | client | session d'appel | reflète `CallManager` | S10/S11 | reset à `idle` |

## F. Données techniques

| Donnée | Durée | Détail |
|---|---|---|
| Logs serveur | rotation 7 jours | niveaux info/warn/error ; **jamais** de mot de passe, token, contenu de message |
| Base SQLite | permanent | `DATA_DIR/lancomm.sqlite`, mode WAL, sauvegarde = copie du dossier `DATA_DIR` |
| Migrations | permanent | table `schema_migrations` |
| Rate-limit counters | fenêtres 10 s – 1 min | RAM |

## G. Règle d'or de transformation
`Entrée utilisateur → validation (zod) → normalisation → persistance (si durable) → diffusion (WS) → affichage (store → UI)`.
Le serveur **réécrit toujours** `createdAt`, `seq`, `senderId` (déduit du JWT, jamais lu du payload).
