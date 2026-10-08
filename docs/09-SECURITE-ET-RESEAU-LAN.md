# 09 — Sécurité et réseau LAN

## Modèle de menace (V1 test)
Réseau local de confiance partielle. Objectifs : empêcher l'accès non authentifié, l'usurpation d'identité, la lecture des conversations d'autrui, les uploads dangereux, le plantage du serveur par données malformées. Pas de chiffrement de bout en bout (trafic en clair HTTP/WS sur le LAN — **à signaler dans l'UI Réglages**). Le média d'appel est chiffré (DTLS-SRTP, inhérent à WebRTC).

## Mesures
| Domaine | Mesure |
|---|---|
| Auth | bcrypt (10), JWT HS256 7 j, `JWT_SECRET` ≥ 32 car. généré au premier lancement dans `DATA_DIR/secret` si absent |
| Identité | `senderId` toujours dérivé du token |
| Autorisation | contrôle d'appartenance à chaque requête REST et événement WS |
| Brute force | 10 tentatives de login / min / IP, délai croissant |
| Validation | zod sur tout payload ; enveloppe WS ≤ 64 Ko ; JSON invalide → `error`, socket conservé |
| Upload | taille max, liste blanche MIME, extension recalculée, nom stocké = UUID (anti path traversal), pas d'exécution/serving statique brut |
| Accès fichiers | via route authentifiée uniquement |
| CORS | `*` autorisé (clients natifs) ; pas de cookies |
| Inscription | option `ALLOW_REGISTRATION=true/false` ; option `INVITE_CODE` |
| Logs | pas de données sensibles |

## Notes Expo / clair en LAN
- Expo Go autorise `http://` et `ws://` vers des IP privées.
- **Development Build** : Android → `usesCleartextTraffic: true` (plugin `expo-build-properties`) ; iOS → `NSAppTransportSecurity` avec `NSAllowsLocalNetworking: true`.
- iOS 14+ : texte `NSLocalNetworkUsageDescription` obligatoire (« Communiquer avec le serveur du réseau local »).

## Découverte du serveur
V1 : saisie manuelle `IP:port` + **QR code** affiché au démarrage du serveur dans la console (`qrcode-terminal`) et à `GET /` (page HTML minimale : IP(s) détectées, QR, statut).
Le serveur liste toutes ses IPv4 non internes au démarrage. Recommandé : réserver l'IP dans le routeur (bail DHCP statique).
V1.1 (optionnel) : mDNS/Bonjour (`_lancomm._tcp`) — nécessite module natif, donc dev build.

## Pièges réseau fréquents
| Symptôme | Cause probable | Action |
|---|---|---|
| `/health` OK sur PC, KO sur téléphone | Pare-feu Windows | autoriser Node.js / port 3000 sur réseau privé |
| Téléphones ne voient pas le serveur | Isolation client / réseau invité | désactiver « AP isolation » |
| Appel connecté mais pas de média | Isolation client, VPN actif, UDP bloqué | couper VPN, vérifier isolation |
| IP serveur change | DHCP | réservation DHCP |
| Messages perdus en veille | Socket tué par l'OS | reconnexion + rattrapage `lastSeq` |
| Données mobiles interfèrent | Android préfère mobile si Wi-Fi sans Internet | désactiver « Basculer automatiquement » / « Wi-Fi intelligent » ; mode avion + Wi-Fi |

## Limites assumées
- Pas de notification push en arrière-plan : un téléphone en veille/fermé ne sonne pas ; il rattrape les messages à la réouverture, les appels manqués sont listés dans l'historique.
- Une connexion active par compte.
- Pas de chiffrement applicatif des messages au repos.
