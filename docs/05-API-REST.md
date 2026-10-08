# 05 — API REST

Base : `http://<host>:3000/api/v1`. JSON UTF-8. Détails/schémas : `contracts/openapi.yaml`.
Auth : `Authorization: Bearer <jwt>` sauf mention. Erreurs : `{ "error": { "code": "...", "message": "..." } }`.

| Méthode | Route | Auth | Rôle |
|---|---|---|---|
| GET | `/health` (sans préfixe `/api/v1`) | non | `{ok, name, version, time}` — test de connexion de l'écran ServerSetup |
| GET | `/server-info` | non | `{name, version, protocol:1, maxUploadMb, registrationOpen}` |
| POST | `/auth/register` | non | `{username, displayName, password}` → `{token, user}` |
| POST | `/auth/login` | non | `{username, password}` → `{token, user}` (rate limit 10/min/IP) |
| GET | `/auth/me` | oui | utilisateur courant |
| PATCH | `/users/me` | oui | modifier `displayName`, `avatarFileId` |
| GET | `/users` | oui | liste de tous les utilisateurs (sans soi) + `online` |
| GET | `/users/:id` | oui | profil |
| GET | `/conversations` | oui | conversations de l'utilisateur, triées par `lastMessageSeq` desc, avec membres, dernier message, `unreadCount` |
| POST | `/conversations` | oui | `{type:'direct', userId}` → renvoie l'existante ou la crée |
| GET | `/conversations/:id/messages?beforeSeq=&limit=` | oui | historique paginé (limit 1–100, défaut 40), ordre seq desc |
| POST | `/files` | oui | multipart `file` → `{fileId, name, mime, size, width?, height?}` |
| GET | `/files/:id` | oui | flux du fichier (`Content-Type`, `Content-Length`, support `Range`) |
| GET | `/calls?limit=` | oui | historique des appels de l'utilisateur |

**Règles**
- `GET /files/:id` : accessible seulement si le fichier est rattaché à un message d'une conversation dont l'utilisateur est membre, ou s'il est l'uploader (avant rattachement), ou avatar.
- Upload : taille ≤ `MAX_UPLOAD_MB` (25), types autorisés : `image/*`, `application/pdf`, `text/plain`, `application/zip`, `audio/*`, `video/mp4`, docs Office. Le nom d'origine est **nettoyé** ; le stockage utilise `<uuid>.<ext>`.
- Pagination des messages : le client demande `beforeSeq` = plus petit `seq` qu'il possède.
- Codes HTTP : 200/201 · 400 (`INVALID_PAYLOAD`) · 401 · 403 · 404 · 409 (`USERNAME_TAKEN`) · 413 · 415 · 429.
