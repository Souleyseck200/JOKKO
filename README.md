# JOKKO — Communication Connectée

Application de communication **100 % réseau local** (LAN) : messages texte, photos, messages vocaux, appels audio/vidéo.

**Stack :** Node.js (Fastify + WebSocket + SQLite) · Expo (React Native + TypeScript) · WebRTC P2P

## Lancement rapide

```bash
npm install
npm run seed        # Crée les comptes de test
npm run dev:server  # Démarre le serveur (affiche IP LAN + QR Code)
npm run dev:mobile  # Lance l'app mobile (scanner le QR)
```

## Comptes de test (mot de passe : `password123`)
| Utilisateur | Rôle | Téléphone |
|---|---|---|
| alice | Admin | +1 (555) 111-1111 |
| bob | User | +1 (555) 222-2222 |
| min_harada | User | +1 (555) 453-2345 |
