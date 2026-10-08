# 07 — Écrans et composants (mobile)

Navigation : `expo-router`. Garde d'accès : pas de serveur configuré → `ServerSetupScreen` ; pas de token → `LoginScreen` ; sinon `MainTabs`.

```
app/
├ _layout.tsx                 racine + gardes + CallOverlay global
├ server-setup.tsx            S01
├ (auth)/login.tsx            S02
├ (auth)/register.tsx         S03
├ (tabs)/_layout.tsx          onglets
├ (tabs)/index.tsx            S04 ConversationListScreen
├ (tabs)/contacts.tsx         S05 ContactsScreen
├ (tabs)/calls.tsx            S06 CallHistoryScreen
├ (tabs)/settings.tsx         S07 SettingsScreen
├ chat/[id].tsx               S08 ChatScreen
├ media/[fileId].tsx          S09 MediaViewerScreen
├ call/incoming.tsx           S10 IncomingCallScreen   (modal plein écran)
└ call/active.tsx             S11 CallScreen           (modal plein écran)
```

---
## S00 — BootScreen / SplashGate
- **Rôle** : lire `serverUrl` et `token` (SecureStore), valider le token (`GET /auth/me`), router.
- **Données** : `serverUrl` (SecureStore), `token` (SecureStore).
- **Sorties** : → S01, S02 ou S04. Échec réseau → écran avec « Réessayer » + « Changer de serveur ».

## S01 — ServerSetupScreen
- **But** : renseigner l'adresse du serveur LAN.
- **Éléments** : champ `IP:port` (placeholder `192.168.1.10:3000`), bouton **Tester** (`GET /health`), bouton **Scanner un QR** (caméra, QR = `lancomm://192.168.1.10:3000`), liste « serveurs récents ».
- **Comportement** : normalise l'entrée en `http://ip:port`, timeout 4 s, affiche nom + version du serveur si OK. Enregistre `serverUrl` puis → S02.
- **Erreurs** : « Serveur introuvable — vérifie le Wi-Fi et l'adresse », « Version de protocole incompatible ».

## S02 — LoginScreen
- **Champs** : pseudo, mot de passe. **Actions** : Se connecter, lien vers S03, lien « Changer de serveur » (→ S01).
- **Flux** : `POST /auth/login` → stocke `token` → ouvre le WS → S04. Erreurs : identifiants invalides, serveur injoignable.

## S03 — RegisterScreen
- **Champs** : pseudo (validation `[a-z0-9_.-]{3,24}`), nom affiché, mot de passe (≥ 6), confirmation.
- **Flux** : `POST /auth/register` → connexion automatique. Erreur 409 : « pseudo déjà pris ».

## S04 — ConversationListScreen (onglet « Discussions »)
- **But** : voir ses conversations, accéder au chat.
- **Éléments** : `ConnectionBanner`, liste de `ConversationListItem`, bouton flottant « Nouveau » (→ S05), pull-to-refresh.
- **Données** : store `conversations` (alimenté par `GET /conversations` + `message.new`, `conversation.new`, `receipt.update`).
- **Tri** : `lastMessageSeq` décroissant. **Badge** : `unreadCount`.

## S05 — ContactsScreen (onglet « Contacts »)
- **But** : voir tous les utilisateurs et leur statut ; démarrer un chat ou un appel.
- **Éléments** : champ de recherche locale, liste de `ContactListItem` (avatar, nom, pastille en ligne, boutons 💬 / 📞 / 🎥).
- **Actions** : 💬 → `POST /conversations` puis → S08 ; 📞/🎥 → `CallManager.startCall(userId, media)` (désactivé si hors ligne).

## S06 — CallHistoryScreen (onglet « Appels »)
- **But** : historique. **Liste** de `CallHistoryItem` (sens, média, statut, durée, date). Tap = rappeler.
- **Données** : `GET /calls`.

## S07 — SettingsScreen (onglet « Réglages »)
- **Contenu** : profil (nom affiché, avatar), serveur actuel (+ « Changer »), état de la connexion WS, version app/protocole, **Se déconnecter** (efface token, ferme WS), vider le cache local.

## S08 — ChatScreen
- **But** : conversation 1-1.
- **Éléments** : `ChatHeader` (nom, présence/« écrit… », boutons appel audio/vidéo), `MessageList` (inversée, pagination au scroll vers le haut via `beforeSeq`), `MessageBubble`, `DateSeparator`, `TypingIndicator`, `Composer` (champ texte, bouton pièce jointe, envoi).
- **Comportements** :
  - Envoi optimiste ; statut visible sur les bulles sortantes (⏱ envoi · ✓ envoyé · ✓✓ délivré · ✓✓ bleu lu · ⚠ échec + « Réessayer »).
  - À l'ouverture et à chaque nouveau message visible : `receipt.read`.
  - Frappe : `typing.start` (throttle 1/s), `typing.stop` après 3 s sans frappe ou envoi.
  - Pièce jointe : menu Photo (galerie) / Appareil photo / Fichier ; barre de progression d'upload ; annulation possible.
  - Appui sur image → S09. Appui sur fichier → téléchargement (`expo-file-system`) puis partage (`expo-sharing`).

## S09 — MediaViewerScreen
- Affiche l'image en plein écran (pinch-zoom), bouton Partager/Enregistrer, fermer. Source : `GET /files/:id` avec header `Authorization`.

## S10 — IncomingCallScreen
- **Déclenché par** `call.incoming` (n'importe quel écran, via `CallOverlay`).
- **Éléments** : avatar, nom, « Appel audio/vidéo entrant », boutons **Refuser** (`call.reject`) et **Accepter** (permissions → `call.accept` → S11). Sonnerie + vibration en boucle (`expo-av`/`expo-haptics`), arrêtées à la décision ou au `call.cancelled/timeout`.

## S11 — CallScreen
- **États affichés** : « Appel en cours… » (outgoing_ringing), « Connexion… » (connecting), chrono (active), « Appel terminé » (2 s puis retour).
- **Éléments** : `RTCView` distant (plein écran) + `RTCView` local (vignette) pour la vidéo ; avatar centré pour l'audio ; `CallControls` (micro, caméra, flip, haut-parleur, raccrocher) ; `CallQualityBadge` (optionnel).
- **Sortie** : à `ended` → retour à l'écran précédent.

---
# Composants réutilisables (`src/components/`)

| Composant | Rôle / but | Props principales | Données consommées |
|---|---|---|---|
| `ConnectionBanner` | Bandeau « Reconnexion… » / « Hors ligne » | — | `socketStatus` |
| `Avatar` | Image ronde ou initiales | `user`, `size` | `User` |
| `PresenceDot` | Pastille verte/grise | `online` | présence |
| `ConversationListItem` | Ligne de S04 | `conversation` | conversation, dernier message, unread |
| `ContactListItem` | Ligne de S05 | `user`, `online`, `onChat`, `onCall` | user, présence |
| `CallHistoryItem` | Ligne de S06 | `call` | `Call` |
| `ChatHeader` | En-tête de S08 | `peer`, `typing` | présence, typing |
| `MessageList` | Liste inversée paginée | `conversationId` | messages triés par seq |
| `MessageBubble` | Bulle texte/image/fichier + statut | `message`, `isMine` | `Message` (+ statut dérivé) |
| `MessageStatusIcon` | ⏱ ✓ ✓✓ ⚠ | `status` | statut |
| `DateSeparator` | Séparateur de jours | `date` | — |
| `TypingIndicator` | Trois points animés | `visible` | typing |
| `Composer` | Saisie + envoi + pièces jointes | `onSend`, `onAttach`, `onTyping` | — |
| `AttachmentPicker` | Feuille Photo/Caméra/Fichier | `onPicked` | permissions |
| `UploadProgress` | Barre + annuler | `progress`, `onCancel` | upload en cours |
| `FileBubble` | Nom, taille, icône, téléchargement | `attachment` | `Attachment` |
| `ImageBubble` | Miniature chargée avec auth | `attachment` | `Attachment` |
| `CallOverlay` | Écoute le store `call` et affiche S10/S11 | — | `call` store |
| `CallControls` | Boutons d'appel | état, callbacks | état média local |
| `RTCVideoView` | Wrapper `RTCView` | `stream`, `mirror` | flux WebRTC |
| `EmptyState` | Message vide illustré | `title`, `hint` | — |
| `ErrorToast` | Message d'erreur éphémère | `message` | erreurs |
| `InAppNotification` | Bannière « Nouveau message de X » (si pas dans ce chat) | `message` | `message.new` |

## Stores (Zustand)
| Store | Contenu | Persistance |
|---|---|---|
| `serverStore` | `serverUrl`, `recentServers` | AsyncStorage |
| `authStore` | `token`, `user` | SecureStore (token) |
| `socketStore` | `status` (`connecting/open/closed`), `lastSeq`, file d'envoi | `lastSeq` persistant |
| `conversationStore` | conversations, unread | cache AsyncStorage |
| `messageStore` | `Map<conversationId, Message[]>` | cache SQLite/AsyncStorage (200 derniers par chat) |
| `presenceStore` | `Map<userId, {online,lastSeenAt}>` | RAM |
| `typingStore` | `Map<conversationId, userId[]>` + timers | RAM |
| `callStore` | état d'appel, pair, média, flux, chrono | RAM |
