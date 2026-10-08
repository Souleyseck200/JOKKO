# 02 — Architecture

## Vue d'ensemble
```
                 RÉSEAU LOCAL (Internet NON requis)
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Phone A  │   │ Phone B  │   │ Phone C  │
   │ Expo app │   │ Expo app │   │ Expo app │
   └────┬─────┘   └────┬─────┘   └────┬─────┘
        │  HTTP (REST) + WebSocket (ws://)   │
        └───────────────┬───────────────────┘
                        │
              ┌─────────▼──────────┐
              │  SERVEUR LOCAL     │  ex. 192.168.1.10:3000
              │  Node.js/Fastify   │
              │  ├ REST API        │
              │  ├ WebSocket hub   │
              │  ├ Signaling WebRTC│
              │  ├ File store      │
              │  ├ Presence (RAM)  │
              │  └ SQLite          │
              └────────────────────┘

   Médias des appels : P2P direct Phone A ⇄ Phone B (RTP/UDP, candidats "host")
   Le serveur ne voit passer QUE la signalisation (offer/answer/ICE).
```

## Trois canaux, trois rôles
| Canal | Protocole | Usage |
|---|---|---|
| REST | HTTP/JSON + multipart | Auth, listes, historique paginé, upload/download de fichiers |
| Temps réel | WebSocket (JSON) | Messages, accusés, présence, frappe, signalisation d'appel |
| Média | WebRTC (SRTP/UDP) | Audio/vidéo entre téléphones |

Règle : **ce qui doit être persistant passe par le serveur et SQLite ; ce qui est éphémère reste en RAM.**

## Composants serveur (`server/`)
| Module | Rôle |
|---|---|
| `http/` | Instance Fastify, plugins (cors, jwt, multipart, static), routes REST |
| `ws/hub.ts` | Registre des connexions `userId → Connection`, diffusion ciblée |
| `ws/router.ts` | Valide l'enveloppe, dispatche vers les handlers par `type` |
| `ws/handlers/*` | `message`, `receipt`, `typing`, `presence`, `call`, `sync` |
| `services/auth` | Hash de mots de passe, émission/vérification JWT |
| `services/messages` | Création idempotente, seq, statuts, rattrapage |
| `services/conversations` | Création/recherche de conversation directe |
| `services/files` | Écriture disque, métadonnées, contrôle d'accès |
| `services/presence` | État en ligne en mémoire, `lastSeen` |
| `services/calls` | Machine à états des appels, timers de sonnerie |
| `db/` | `better-sqlite3`, migrations, requêtes préparées |
| `config.ts` | Variables d'environnement validées |

## Composants mobile (`mobile/`)
| Couche | Rôle |
|---|---|
| `app/` (expo-router) | Écrans et navigation |
| `src/api/` | Client REST typé |
| `src/realtime/socket.ts` | Connexion WS, reconnexion, file d'envoi, ACK |
| `src/realtime/dispatcher.ts` | Route les événements serveur vers les stores |
| `src/store/` | Zustand : `auth`, `server`, `conversations`, `messages`, `presence`, `call` |
| `src/calls/` | `CallManager`, wrapper `react-native-webrtc` |
| `src/storage/` | SecureStore (token), cache local (AsyncStorage/SQLite) |
| `src/components/` | Composants UI réutilisables (doc 07) |

## Flux principaux

### Envoi d'un message texte
1. UI crée un message local `status=sending` avec `clientMsgId` (UUID v4).
2. Client → WS `message.send {conversationId, clientMsgId, kind:'text', body}`.
3. Serveur : valide, vérifie l'appartenance, insère (dédup sur `(senderId, clientMsgId)`), attribue `seq`.
4. Serveur → expéditeur `message.ack {clientMsgId, messageId, seq, createdAt}` → statut `sent`.
5. Serveur → destinataires connectés `message.new {message}`.
6. Destinataire → `receipt.delivered {messageIds}` dès réception → serveur → expéditeur `receipt.update` → `delivered`.
7. Destinataire ouvre le chat → `receipt.read {conversationId, upToSeq}` → `read`.

### Envoi d'une photo
1. Client compresse (qualité 0.7, max 1600 px).
2. `POST /files` multipart → `{fileId, name, mime, size}`.
3. WS `message.send {kind:'image', attachmentIds:[fileId]}`.
4. Le destinataire télécharge via `GET /files/:id` (JWT requis) au moment d'afficher.

### Reconnexion
1. WS rouvert → `hello {token, lastSeq}`.
2. Serveur → `hello.ok {userId, serverTime, currentSeq}` puis rejoue les `message.new` avec `seq > lastSeq`, puis l'état de présence complet.
3. Client réenvoie les messages restés `sending` (même `clientMsgId` ⇒ idempotent).

### Appel
Voir doc 06.

## Choix techniques
| Besoin | Choix | Raison |
|---|---|---|
| HTTP | Fastify 4/5 | Rapide, typé, plugins |
| WS | `@fastify/websocket` (ws) | Même port que HTTP |
| DB | `better-sqlite3` | Zéro install, synchrone, fiable |
| Validation | `zod` | Schémas partagés client/serveur |
| Auth | `@fastify/jwt` + `bcryptjs` | Simple, sans natif à compiler |
| Upload | `@fastify/multipart` | Streaming vers disque |
| État mobile | Zustand | Léger |
| Navigation | expo-router | Standard Expo |
| Appels | `react-native-webrtc` + `@config-plugins/react-native-webrtc` | Seule option WebRTC native viable |
