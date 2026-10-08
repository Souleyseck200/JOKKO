# 04 — Protocole temps réel (WebSocket)

Endpoint : `ws://<host>:3000/ws`. Messages **JSON texte**. Types exacts : `contracts/protocol.ts`.

## Enveloppe
```json
{ "v": 1, "id": "uuid", "type": "message.send", "ts": "2025-01-01T10:00:00.000Z", "ref": "uuid?", "payload": { } }
```
| Champ | Rôle |
|---|---|
| v | version du protocole (1) ; serveur rejette autre valeur avec `error{code:'UNSUPPORTED_VERSION'}` |
| id | identifiant unique de l'enveloppe (UUID, généré par l'émetteur) |
| type | nom de l'événement |
| ts | horloge de l'émetteur (informatif uniquement) |
| ref | `id` de l'enveloppe à laquelle on répond (ACK, erreur) |
| payload | données typées selon `type` |

## Cycle de connexion
1. Client ouvre le socket. **Aucune donnée** n'est traitée avant `hello`.
2. Client envoie `hello {token, lastSeq, deviceInfo}` dans les **5 s**, sinon fermeture code 4001.
3. Serveur valide le JWT → `hello.ok {userId, serverTime, currentSeq, heartbeatSec}`.
4. Serveur rejoue les messages `seq > lastSeq` (`message.new` avec `replay:true`), puis `presence.snapshot`.
5. Serveur diffuse `presence.update {userId, online:true}` aux autres.

**Heartbeat** : le serveur envoie un `ping` WS natif toutes les 15 s ; sans `pong` en 10 s → fermeture, présence offline. Le client envoie en plus `ping`/`pong` applicatifs s'il n'y a eu aucun trafic depuis 20 s (détecte les sockets morts côté mobile).

**Reconnexion client** : backoff exponentiel 1 s, 2 s, 4 s, 8 s, plafonné à 10 s + jitter ±20 %. Reset à 0 après `hello.ok`. Pendant la coupure : bandeau « Reconnexion… », messages en file `sending`.

**Fermeture codes** : 4001 hello timeout · 4002 token invalide · 4003 version non supportée · 4004 remplacé par une autre connexion du même compte · 1001 arrêt serveur.
V1 : **une seule connexion active par compte** ; la nouvelle remplace l'ancienne (4004).

## Catalogue des événements

### Client → Serveur
| type | payload | Réponse |
|---|---|---|
| `hello` | `{token, lastSeq, deviceInfo?}` | `hello.ok` ou fermeture |
| `message.send` | `{conversationId, clientMsgId, kind, body?, attachmentIds?}` | `message.ack` ou `error` |
| `receipt.delivered` | `{messageIds[]}` | `receipt.update` vers l'expéditeur |
| `receipt.read` | `{conversationId, upToSeq}` | `receipt.update` vers l'expéditeur |
| `typing.start` / `typing.stop` | `{conversationId}` | `typing.update` vers les autres membres |
| `presence.get` | `{}` | `presence.snapshot` |
| `call.invite` | `{calleeId, media, callId?}` | `call.ringing` / `call.busy` / `call.unavailable` |
| `call.accept` / `call.reject` / `call.cancel` / `call.end` | `{callId}` (+`reason`) | relayé |
| `call.offer` / `call.answer` | `{callId, sdp}` | relayé |
| `call.ice` | `{callId, candidate}` | relayé |
| `ping` | `{}` | `pong` |

### Serveur → Client
| type | payload |
|---|---|
| `hello.ok` | `{userId, serverTime, currentSeq, heartbeatSec}` |
| `message.ack` | `{clientMsgId, messageId, seq, createdAt, conversationId}` (ref = enveloppe d'origine) |
| `message.new` | `{message, replay?}` |
| `receipt.update` | `{conversationId, messageIds[], userId, state:'delivered'\|'read', at}` |
| `typing.update` | `{conversationId, userId, typing}` |
| `presence.snapshot` | `{users:[{userId, online, lastSeenAt}]}` |
| `presence.update` | `{userId, online, lastSeenAt?}` |
| `conversation.new` | `{conversation, members}` (quand quelqu'un crée un chat avec toi) |
| `call.incoming` | `{callId, callerId, media, startedAt}` |
| `call.ringing` | `{callId}` (au appelant : l'appelé sonne) |
| `call.accepted` / `call.rejected` / `call.cancelled` / `call.ended` / `call.busy` / `call.unavailable` / `call.timeout` | `{callId, reason?}` |
| `call.offer` / `call.answer` / `call.ice` | relayés tels quels |
| `error` | `{code, message, details?}` (ref = enveloppe fautive) |
| `pong` | `{}` |

## Codes d'erreur
`UNSUPPORTED_VERSION` · `INVALID_PAYLOAD` · `UNAUTHENTICATED` · `FORBIDDEN` (pas membre) · `NOT_FOUND` · `RATE_LIMITED` · `PAYLOAD_TOO_LARGE` · `CALL_BUSY` · `CALL_INVALID_STATE` · `INTERNAL`.

## Fiabilité et ordre
- **Idempotence** : `message.send` répété avec même `clientMsgId` → même `message.ack` (pas de doublon, pas de nouveau `message.new`).
- **Ordre** : l'ordre d'affichage est `seq` croissant. Le client insère par `seq`, jamais par heure de réception.
- **Livraison au moins une fois** : le serveur rejoue tout `seq > lastSeq` ; le client dédoublonne par `messageId`.
- **Reçus** : `delivered` envoyé par le client dès que `message.new` est traité et stocké ; `read` quand le message est visible à l'écran et l'app au premier plan.
- Pas de rattrapage pour les événements éphémères (frappe, présence ponctuelle, signalisation d'appel) : ils sont perdus si le destinataire est déconnecté. Présence = recalculée via `presence.snapshot`. Un appel manqué est inscrit en historique (`calls`) et notifié via `call.missed` au prochain `hello` (champ `missedCalls` dans `hello.ok`, voir types).

## Limites et anti-abus
- Taille max d'une enveloppe : 64 Ko.
- `message.send` : 20 / 10 s par utilisateur. `typing.start` : 1 / s. `call.invite` : 5 / min.
- Dépassement → `error{RATE_LIMITED}`, pas de fermeture.

## Durées de vie liées au temps réel
| Élément | Durée | Fin |
|---|---|---|
| Token `hello` à présenter | 5 s après ouverture | fermeture 4001 |
| JWT | 7 jours | re-login requis ; `hello` → 4002 |
| Heartbeat sans pong | 10 s | fermeture |
| Typing | 5 s | `typing.update{typing:false}` automatique |
| Sonnerie d'appel | 30 s | `call.timeout` → `missed` |
| Établissement WebRTC (accept → connecté) | 20 s | `call.ended{reason:'connect_timeout'}` |
| Message `sending` côté client | 15 s par tentative, 3 tentatives | statut `failed` |
| Upload orphelin | 1 h | supprimé |
