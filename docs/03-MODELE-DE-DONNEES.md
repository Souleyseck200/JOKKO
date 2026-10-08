# 03 — Modèle de données

Deux catégories :
- **Persistant** (SQLite / disque) : users, conversations, members, messages, attachments, receipts, calls.
- **Éphémère** (RAM serveur) : connexions WS, présence, frappe, sessions d'appel actives, timers.

## Diagramme relationnel
```
users 1───n conversation_members n───1 conversations
users 1───n messages n───1 conversations
messages 1───n attachments (via message_attachments)
messages 1───n message_receipts n───1 users
users 1───n calls (caller / callee)
```

## Entités persistantes

### User
| Champ | Type | Règle |
|---|---|---|
| id | UUID v4 | PK |
| username | string 3–24, `[a-z0-9_.-]` | unique, insensible à la casse |
| displayName | string 1–40 | |
| passwordHash | string | bcrypt, jamais renvoyé |
| avatarFileId | UUID? | FK files |
| createdAt | ISO-8601 UTC | |
| lastSeenAt | ISO-8601? | mis à jour à la déconnexion |

### Conversation
| Champ | Type | Règle |
|---|---|---|
| id | UUID | PK |
| type | `direct` \| `group` | V1 : `direct` |
| title | string? | groupes uniquement |
| directKey | string? | `min(userIdA,userIdB):max(...)`, **unique** → une seule conversation directe par paire |
| createdAt | ISO | |
| lastMessageSeq | int? | dénormalisé pour trier la liste |

### ConversationMember
`(conversationId, userId)` PK composite · `role` (`member`/`admin`) · `joinedAt` · `lastReadSeq` (int, défaut 0) · `muted` (bool).

### Message
| Champ | Type | Règle |
|---|---|---|
| id | UUID | PK serveur |
| seq | int autoincrement global | **ordre total** serveur, sert au rattrapage |
| conversationId | UUID | FK |
| senderId | UUID | FK |
| clientMsgId | UUID | fourni par client ; unique avec senderId (idempotence) |
| kind | `text` \| `image` \| `file` \| `system` | |
| body | string ≤ 4000 | texte ou légende |
| createdAt | ISO | horloge serveur |
| deletedAt | ISO? | suppression logique (V1.1) |

### Attachment (table `files`)
`id` UUID · `uploaderId` · `originalName` · `mime` · `size` (octets) · `storagePath` (relatif à `DATA_DIR/files`) · `sha256` · `width?` `height?` · `createdAt`.
Liaison `message_attachments(messageId, fileId, position)`.
Un fichier uploadé mais jamais rattaché à un message pendant 1 h est **orphelin** → supprimé par un job de nettoyage.

### MessageReceipt
`(messageId, userId)` PK · `deliveredAt?` · `readAt?`.
Le statut affiché à l'expéditeur est dérivé : `sent` (aucun reçu) → `delivered` (tous les destinataires ont `deliveredAt`) → `read` (tous ont `readAt`).

### Call (historique)
| Champ | Type |
|---|---|
| id | UUID (généré par le serveur à `call.invite`) |
| callerId, calleeId | UUID |
| media | `audio` \| `video` |
| status | `completed` \| `missed` \| `rejected` \| `cancelled` \| `busy` \| `failed` |
| startedAt | ISO (moment de l'invite) |
| answeredAt | ISO? |
| endedAt | ISO? |
| durationSec | int? (answeredAt→endedAt) |
| endReason | string? |

## Entités éphémères (RAM serveur)

| Nom | Structure | Durée de vie |
|---|---|---|
| Connection | `{connId, userId, socket, lastPongAt, authenticatedAt}` | tant que le socket est ouvert |
| Presence | `Map<userId, {online, connCount, since}>` | recalculée à chaque (dé)connexion ; `lastSeenAt` persisté |
| TypingState | `{conversationId, userId, expiresAt}` | **5 s** (renouvelé par chaque `typing.start`) |
| CallSession | voir doc 06 | de `call.invite` à l'état terminal, puis archivée en table `calls` |
| RingTimer | timeout 30 s | jusqu'à réponse/annulation |

## États d'un message (côté client)
`sending` → `sent` → `delivered` → `read`, ou `failed` (après 3 tentatives / timeout 15 s ; bouton « Réessayer »).

## Règles d'intégrité
1. Un utilisateur ne peut lire/écrire que dans les conversations dont il est membre (vérifié à chaque requête et événement WS).
2. `seq` est strictement croissant ; jamais réutilisé.
3. `(senderId, clientMsgId)` unique → renvoi = même `messageId`.
4. Une conversation directe par paire (`directKey` unique).
5. Un utilisateur ne peut avoir qu'**un appel actif** (sinon `busy`).
6. Mots de passe : min. 6 caractères en V1 (test), bcrypt coût 10.
