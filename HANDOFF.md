# HANDOFF — État du projet JOKKO

> **Ce fichier est la source de vérité pour l'agent qui reprend ce projet.**
> Lis-le intégralement AVANT d'écrire une seule ligne de code. Ne déduis rien de ce qui n'est pas écrit ici.

---

## 1. Ce qui est TERMINÉ et NE DOIT PAS être retouché

### 1.1 Backend — `server/` ✅ COMPLET ET TESTÉ

Le backend est **100 % fonctionnel**. 12 tests passent (vitest). **Ne refais pas le backend.**

**Fichiers critiques — ne pas modifier :**

| Fichier | Rôle |
|---|---|
| `server/src/db/schema.sql` | Schéma SQLite (tables, indexes, triggers) |
| `server/src/db/queries.ts` | Toutes les requêtes SQL préparées |
| `server/src/db/index.ts` | Init SQLite via node:sqlite (Node 24+) |
| `server/src/services/auth.ts` | Login, register, JWT, bcrypt |
| `server/src/services/calls.ts` | Machine à états des appels + timers |
| `server/src/services/presence.ts` | Présence en RAM |
| `server/src/services/files.ts` | Upload/download/Range/nettoyage orphelins |
| `server/src/ws/hub.ts` | Registre WS userId -> Connection |
| `server/src/ws/router.ts` | Validation zod + dispatch par type |
| `server/src/ws/handlers/call.ts` | Signalisation WebRTC (invite/accept/offer/answer/ice/end/reject) |
| `server/src/ws/handlers/message.ts` | Envoi idempotent, seq, ack |
| `server/src/ws/handlers/receipt.ts` | delivered/read |
| `server/src/ws/handlers/typing.ts` | typing.start/stop |
| `server/src/ws/handlers/hello.ts` | Handshake WS + rattrapage seq |
| `server/src/http/routes/auth.ts` | POST /register, POST /login, GET /me |
| `server/src/http/routes/users.ts` | GET /users (avec online) |
| `server/src/http/routes/contacts.ts` | GET/POST/DELETE /contacts |
| `server/src/http/routes/conversations.ts` | GET/POST /conversations, GET messages paginés |
| `server/src/http/routes/files.ts` | POST/GET /files/:id (Range support) |
| `server/src/http/routes/calls.ts` | GET /calls (historique) |
| `server/src/http/routes/admin.ts` | Routes admin (rôle admin requis) |
| `server/src/http/routes/health.ts` | GET /health, GET /server-info |

**Endpoints REST disponibles (préfixe /api/v1) :**

    POST   /auth/register        Body: { username, phoneNumber, displayName, password, role? }
    POST   /auth/login           Body: { usernameOrPhone, password }
    GET    /auth/me              Header: Authorization: Bearer <token>
    GET    /users                -> [ { ...User, online: boolean } ]
    GET    /contacts             -> [ { ...Contact, user: User } ]
    POST   /contacts             Body: { contactUserId, nickname }
    DELETE /contacts/:userId
    GET    /conversations        -> ConversationSummary[]
    POST   /conversations        Body: { type: 'direct', userId }
    GET    /conversations/:id/messages?limit=40&beforeSeq=N  -> Message[]
    POST   /files                multipart, champ 'file', max 25 Mo
    GET    /files/:id            Requiert JWT, supporte Range
    GET    /calls?limit=50       -> CallRecord[]
    GET    /health               -> { ok, name, version, uptime }
    GET    /server-info          -> { name, version, protocol, lan_ip }

**Événements WebSocket (JSON, protocole v1) :**

    Client -> Serveur:
      hello          { token, lastSeq }
      message.send   { conversationId, clientMsgId, kind, body?, attachmentIds? }
      receipt.delivered { messageIds[] }
      receipt.read   { conversationId, upToSeq }
      typing.start   { conversationId }
      typing.stop    { conversationId }
      call.invite    { calleeId, media: 'audio'|'video' }
      call.accept    { callId }
      call.reject    { callId }
      call.cancel    { callId }
      call.end       { callId }
      call.offer     { callId, sdp }
      call.answer    { callId, sdp }
      call.ice       { callId, candidate }

    Serveur -> Client:
      hello.ok       { userId, serverTime, currentSeq }
      message.ack    { clientMsgId, messageId, seq, createdAt }
      message.new    { message: Message }
      receipt.update { messageId, status, updatedAt }
      typing.peer    { conversationId, userId, typing: bool }
      presence.update { userId, online, lastSeenAt }
      call.incoming  { callId, callerId, callerInfo, media }
      call.accepted  { callId }
      call.rejected  { callId }
      call.cancelled { callId }
      call.ended     { callId }
      call.timeout   { callId }
      call.offer     { callId, sdp }
      call.answer    { callId, sdp }
      call.ice       { callId, candidate }
      error          { code, message }

> **Note SQLite critique :** Le serveur utilise node:sqlite (module natif Node 24+).
> Ne jamais installer better-sqlite3 ni sqlite3 npm.
> Import via : process.getBuiltinModule('node:sqlite')

### 1.2 Types partagés — `shared/` ✅ COMPLET

- `shared/src/models.ts` — types TypeScript (User, Message, Call, Contact, etc.)
- `shared/src/protocol.ts` — types des événements WS (ClientEvent, ServerEvent)
- `shared/src/schemas.ts` — schémas zod pour validation
- `shared/src/index.ts` — exports barrel

### 1.3 Mobile — scaffold de base ✅

- `mobile/package.json` — dépendances déclarées (Expo 52, Zustand 5, lucide-react-native, AsyncStorage)
- `mobile/src/api/client.ts` — **ApiClient complet**, toutes les routes REST sont implémentées
- `mobile/src/store/serverStore.ts` — store Zustand pour l'URL du serveur
- `mobile/App.tsx` — placeholder vide (à remplacer par expo-router)
- `mobile/app.json` — config Expo de base
- `mobile/assets/logo.png` — logo JOKKO (PNG)
- `mobile/assets/logo/Logo JOKKO, communication connectée.png` — logo haute qualité original

---

## 2. Ce qui reste à faire — mobile/ uniquement

### 2.1 Structure de fichiers à créer

    mobile/
    ├── app/
    │   ├── _layout.tsx                  <- racine Expo Router + gardes + CallOverlay global
    │   ├── server-setup.tsx             <- S01 ServerSetupScreen
    │   ├── (auth)/
    │   │   ├── _layout.tsx
    │   │   ├── login.tsx                <- S02 LoginScreen
    │   │   └── register.tsx             <- S03 RegisterScreen
    │   ├── (tabs)/
    │   │   ├── _layout.tsx              <- tab bar avec 4 onglets
    │   │   ├── index.tsx                <- S04 ConversationListScreen
    │   │   ├── contacts.tsx             <- S05 ContactsScreen
    │   │   ├── calls.tsx                <- S06 CallHistoryScreen
    │   │   └── settings.tsx             <- S07 SettingsScreen
    │   ├── chat/
    │   │   └── [id].tsx                 <- S08 ChatScreen
    │   ├── media/
    │   │   └── [fileId].tsx             <- S09 MediaViewerScreen
    │   └── call/
    │       ├── incoming.tsx             <- S10 IncomingCallScreen (modal plein écran)
    │       └── active.tsx               <- S11 CallScreen (modal plein écran)
    └── src/
        ├── api/client.ts               <- DEJA FAIT
        ├── realtime/
        │   ├── socket.ts               <- A CREER: WS + reconnexion exponentielle + file d'envoi
        │   └── dispatcher.ts           <- A CREER: route événements -> stores
        ├── store/
        │   ├── serverStore.ts          <- DEJA FAIT
        │   ├── authStore.ts            <- A CREER
        │   ├── socketStore.ts          <- A CREER
        │   ├── conversationStore.ts    <- A CREER
        │   ├── messageStore.ts         <- A CREER
        │   ├── presenceStore.ts        <- A CREER
        │   ├── typingStore.ts          <- A CREER
        │   └── callStore.ts            <- A CREER
        ├── calls/
        │   ├── CallManager.ts          <- A CREER: WebRTC react-native-webrtc
        │   └── mediaUtils.ts           <- A CREER: getUserMedia, permissions
        ├── storage/
        │   └── secure.ts               <- A CREER: SecureStore + AsyncStorage
        ├── theme/
        │   ├── colors.ts               <- A CREER
        │   ├── typography.ts           <- A CREER
        │   └── spacing.ts              <- A CREER
        ├── hooks/
        │   ├── useSocket.ts            <- A CREER
        │   └── useCall.ts              <- A CREER
        ├── utils/
        │   ├── format.ts               <- A CREER: formatDate, formatDuration, formatFileSize
        │   └── uuid.ts                 <- A CREER: generateUUID v4
        └── components/                 <- TOUS A CREER (voir section 3)

### 2.2 Dépendances à installer

    cd mobile
    npx expo install expo-router expo-secure-store expo-av expo-haptics
    npx expo install expo-image-picker expo-document-picker expo-file-system expo-sharing
    npx expo install expo-camera expo-barcode-scanner
    npx expo install react-native-webrtc @config-plugins/react-native-webrtc
    npx expo install @react-native-async-storage/async-storage

---

## 3. Design System — Règles STRICTES (ne pas dévier)

### 3.1 INTERDIT

- Glassmorphisme (pas de backdrop-filter, pas de transparences floues)
- Dégradés violets / rose / néon / agressifs
- Ombres portées exagérées façon Material Design v1
- Google Fonts (pas de dépendance réseau)
- Icônes emoji dans les boutons d'action critiques

### 3.2 Palette de couleurs officielle

Copier exactement dans `src/theme/colors.ts` :

    export const Colors = {
      background:      '#0F0F0F',   // noir profond (fond principal)
      surface:         '#1A1A1A',   // fond des cartes/bulles
      surfaceElevated: '#242424',   // éléments élevés (inputs, header)
      border:          '#2E2E2E',   // séparateurs
      textPrimary:     '#F0F0F0',   // texte principal
      textSecondary:   '#8A8A8A',   // métadonnées, dates, placeholders
      textMuted:       '#555555',   // texte très discret
      primary:         '#1DB954',   // vert sobre JOKKO (accent principal)
      primaryDark:     '#158A3E',   // état pressed
      primarySurface:  '#0D2B1A',   // fond teinté primary (très sombre)
      online:          '#22C55E',   // pastille en ligne
      offline:         '#555555',   // pastille hors ligne
      error:           '#EF4444',   // erreur
      warning:         '#F59E0B',   // avertissement
      bubbleMine:      '#1A3A2A',   // bulle message sortant
      bubblePeer:      '#1A1A1A',   // bulle message entrant
      callAccept:      '#1DB954',   // bouton décrocher
      callDecline:     '#EF4444',   // bouton raccrocher
    };

### 3.3 Typographie

Police système uniquement (SF Pro iOS / Roboto Android). Pas de Google Fonts.

    export const Typography = {
      h1:      { fontSize: 24, fontWeight: '700' },
      h2:      { fontSize: 20, fontWeight: '600' },
      h3:      { fontSize: 17, fontWeight: '600' },
      body:    { fontSize: 15, fontWeight: '400' },
      caption: { fontSize: 12, fontWeight: '400' },
      label:   { fontSize: 13, fontWeight: '500' },
      mono:    { fontSize: 13, fontFamily: 'monospace' },
    };

### 3.4 Espacements et rayons

    export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
    export const Radius  = { sm: 6, md: 10, lg: 16, full: 999 };

### 3.5 Design par écran

**S00 — BootScreen**
- Fond background (#0F0F0F), logo JOKKO centré (mobile/assets/logo.png, taille 80px)
- ActivityIndicator couleur primary (#1DB954) en dessous
- Max 3s puis redirect selon état (serverUrl? -> check token -> route)

**S01 — ServerSetupScreen**
- Fond background, logo 48px centré en haut
- Titre "Connecter à un serveur" (h2)
- Champ texte sur surfaceElevated, radius md, placeholder "192.168.1.10:3000" en textMuted
- Bouton pleine largeur fond primary "Tester la connexion", radius md
- Bouton outline (border) "Scanner un QR code" en dessous
- Badge vert "Serveur trouvé : [nom]" si succès
- Liste "Récents" en bas si > 0 serveurs déjà utilisés

**S02 — LoginScreen**
- Fond background
- Logo 64px + titre "JOKKO" (h1) centrés en haut
- Champs pseudo + mot de passe sur surfaceElevated
- Bouton "Se connecter" fond primary pleine largeur
- Lien texte "Créer un compte" en primary (pas de bouton)
- Lien texte "Changer de serveur" en textMuted en bas
- Erreur : bandeau fond error (#EF4444) à 15% d'opacité, texte error

**S03 — RegisterScreen**
- Même layout que S02
- Champs : Pseudo ([a-z0-9_.-]{3,24}), Nom affiché, Téléphone (+XXX...), Mot de passe, Confirmation
- Validation temps réel : texte error si invalide, texte primary si valide

**S04 — ConversationListScreen**
- Header : "Discussions" (h2) à gauche + icône crayon (lucide) à droite
- ConnectionBanner en haut si WS closed (fond warning, texte noir, "Reconnexion...")
- ConversationListItem : avatar 48px | nom (body bold) + dernier message (caption, 1 ligne) | date (caption) + badge unread (cercle primary)
- Séparateur border 0.5px entre items
- Etat vide : texte centré + bouton "Trouver des contacts"

**S05 — ContactsScreen**
- Header "Contacts" + barre de recherche (surfaceElevated, radius full)
- ContactListItem : avatar 44px + PresenceDot 10px | nom (body) + @pseudo (caption) | icônes message + téléphone (lucide 20px)
- Icônes désactivées (textMuted, opacity 0.4) si pair hors ligne
- Sections "Mes contacts" / "Tous les utilisateurs"

**S06 — CallHistoryScreen**
- Header "Appels"
- CallHistoryItem : icône sens (entrant vert / sortant gris / manqué rouge) + icône type (tel/caméra) | nom + date | durée
- Tap sur item = rappeler

**S07 — SettingsScreen**
- Sections groupées sur surface, items sur surfaceElevated
- Profil : avatar + nom + @pseudo
- IP serveur en mono + bouton "Changer"
- Statut WS : pastille verte/rouge + libellé
- Bouton "Se déconnecter" : texte error seulement (pas de fond rouge)

**S08 — ChatScreen**
- ChatHeader : fleche-retour | avatar 36px + nom + "en ligne"/"vu [date]" | icônes audio + video
- MessageList FlatList inverted, fond background
- MessageBubble :
  - Sortant : aligné droite, fond bubbleMine (#1A3A2A), radius lg + coin bas-droit = 4
  - Entrant : aligné gauche, fond bubblePeer (#1A1A1A), radius lg + coin bas-gauche = 4
  - Heure en caption textMuted en bas à droite de la bulle
  - MessageStatusIcon uniquement sur les sortants : horloge / check / double-check / double-check bleu / warning
- DateSeparator : texte centré label textSecondary (pas de ligne)
- TypingIndicator : 3 points animés (opacity pulse), fond surface, radius full
- Composer :
  - Fond surfaceElevated, padding 8
  - Input fond background, radius full, placeholder "Message..."
  - Icône paperclip à gauche (textSecondary)
  - Bouton envoyer (cercle 36px primary, flèche blanche) visible si texte non vide
  - Icône micro si texte vide

**S09 — MediaViewerScreen**
- Fond #000000
- Image resizeMode="contain" plein écran
- Bouton fermer (X blanc) en haut à droite, safe area
- Boutons Partager + Enregistrer en bas
- Pinch-to-zoom (react-native-gesture-handler)

**S10 — IncomingCallScreen** (modal plein écran)
- Fond background
- Avatar 96px centré avec pulsation lente (scale 1->1.05, loop)
- Nom en h1, "Appel audio/vidéo entrant" en textSecondary
- 2 boutons en bas espacés de 80px minimum :
  - Décrocher : cercle 72px fond callAccept (#1DB954), icône phone blanc
  - Refuser : cercle 72px fond callDecline (#EF4444), icône phone-off blanc

**S11 — CallScreen** (modal plein écran)
- Vidéo : RTCView distant plein écran + RTCView local vignette 100x150 coin haut-droit radius md
- Audio : avatar 96px centré, nom h1, chrono h2 (MM:SS)
- Barre contrôles en bas (fond surface, radius haut lg) :
  - Icônes 48px : micro, caméra, flip, haut-parleur, raccrocher (60px, fond callDecline)
  - Icône active = fond primarySurface, couleur primary

---

## 4. Stores Zustand — schémas exacts

    // authStore.ts
    token: string | null
    user: User | null
    setAuth(token, user): void
    logout(): void

    // socketStore.ts
    status: 'connecting' | 'open' | 'closed' | 'error'
    lastSeq: number
    pendingMessages: ClientEvent[]
    setStatus(s): void
    setLastSeq(n): void

    // conversationStore.ts
    conversations: ConversationSummary[]
    setConversations(list): void
    upsertConversation(conv): void
    incrementUnread(id, n): void
    resetUnread(id): void

    // messageStore.ts
    messages: Map<conversationId, Message[]>
    addMessage(convId, msg): void
    updateMessageStatus(msgId, status): void
    prependMessages(convId, msgs): void

    // presenceStore.ts
    presence: Map<userId, { online: boolean, lastSeenAt: string|null }>
    setPresence(userId, data): void

    // typingStore.ts
    typing: Map<conversationId, userId[]>
    setTyping(convId, userId, isTyping): void

    // callStore.ts
    call: {
      callId, peerId, peerInfo: { displayName, avatarUrl? },
      media: 'audio'|'video',
      state: 'incoming'|'outgoing_ringing'|'connecting'|'active'|'ended',
      startedAt: number|null, localStream: MediaStream|null, remoteStream: MediaStream|null
    } | null
    setCall(call): void
    clearCall(): void

---

## 5. Logique WebSocket (socket.ts)

    class SocketManager {
      // Ouvre ws://serverUrl/ws
      // onopen -> envoie { type: 'hello', token, lastSeq }
      // onmessage -> dispatcher.handle(parsed)
      // onclose -> backoff exponentiel 1s->2s->4s->...->30s max
      // Heartbeat ping toutes les 25s (keepalive)
      // Si WS fermé -> enqueue dans pendingMessages, flush à reconnexion
      connect(serverUrl, token, lastSeq): void
      send(event: ClientEvent): void
      disconnect(): void
    }

---

## 6. Logique CallManager (calls/CallManager.ts)

    // Utilise react-native-webrtc
    // RTCPeerConnection({ iceServers: [] })  <- LAN uniquement, ZERO STUN/TURN
    //
    // APPELANT:
    //   startCall(calleeId, media) -> call.invite WS
    //   on call.accepted -> getUserMedia -> createOffer -> call.offer WS
    //   on call.answer -> setRemoteDescription
    //   on call.ice -> addIceCandidate
    //   onicecandidate -> call.ice WS
    //
    // APPELE:
    //   on call.incoming -> afficher S10
    //   accepter -> call.accept WS -> getUserMedia
    //   on call.offer -> setRemoteDescription -> createAnswer -> call.answer WS
    //   on call.ice -> addIceCandidate
    //   onicecandidate -> call.ice WS
    //
    // FIN: call.end des deux cotes -> close RTCPeerConnection -> stop streams

---

## 7. Contraintes critiques

1. **Zero internet à l'exécution** : pas CDN, pas STUN/TURN externe, pas Google Fonts
2. **Caller ID** : appelant non enregistré dans les contacts -> afficher numéro de téléphone + photo (pas le displayName)
3. **Noms uniques** : username unique, erreur 409 si déjà pris
4. **Idempotence messages** : clientMsgId UUID, re-envoyer le même = zéro doublon
5. **Statuts messages** : horloge -> check -> double-check -> double-check bleu -> warning (failed)
6. **Reconnexion WS** : hello { token, lastSeq } -> serveur rejoue les messages manqués
7. **WebRTC = Dev Build uniquement** (pas Expo Go)
8. **Streaming audio** : GET /files/:id supporte Range (messages vocaux)
9. **Admin** : seul le rôle 'admin' peut accéder à /api/v1/admin/*

---

## 8. Ordre de développement

Phase 1 — Auth + Navigation:
  1. npx expo install (dépendances manquantes)
  2. Créer app.config.ts (plugins WebRTC, permissions)
  3. Créer src/theme/ (colors, typography, spacing)
  4. Créer src/storage/secure.ts
  5. Créer stores authStore, serverStore
  6. Créer app/_layout.tsx (BootScreen + gardes)
  7. Créer S01, S02, S03

Phase 2 — Messagerie temps réel:
  1. Créer src/realtime/socket.ts + dispatcher.ts
  2. Créer stores restants (conversations, messages, presence, typing)
  3. Créer S04, S05 + composants liste
  4. Créer S08 + tous ses composants

Phase 3 — Fichiers:
  1. AttachmentPicker, ImageBubble, FileBubble, S09

Phase 4 — Finitions:
  1. S06, S07, InAppNotification, badges, logout

Phase 5 — Appels WebRTC:
  1. CallManager, S10, S11

---

## 9. Commandes de démarrage

    # Racine du monorepo
    npm install

    # Backend
    cd server && npm run dev
    cd server && npm run seed   # crée alice (admin), bob, min_harada (mdp: password123)

    # Mobile
    cd mobile && npm start

---

## 10. Fichiers de référence (lire avant de coder)

1. docs/07-ECRANS-ET-COMPOSANTS.md — spec fonctionnelle complète
2. docs/04-PROTOCOLE-TEMPS-REEL.md — protocole WS
3. docs/05-API-REST.md — routes REST
4. docs/06-APPELS-WEBRTC.md — flow WebRTC
5. shared/src/models.ts — types TypeScript
6. shared/src/protocol.ts — types événements WS
7. mobile/src/api/client.ts — client REST prêt (NE PAS réécrire)

---

*Dernière mise à jour : 2026-10-08 — Backend complet (server/) | Mobile a faire (mobile/)*
