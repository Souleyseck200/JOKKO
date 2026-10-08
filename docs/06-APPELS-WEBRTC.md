# 06 — Appels audio/vidéo (WebRTC)

## Principe
Le serveur ne relaie **que la signalisation**. Les médias vont directement entre téléphones (P2P) sur le LAN.
Pas de STUN/TURN : `iceServers: []`. Les candidats ICE de type **host** suffisent sur un même sous-réseau.

## Prérequis techniques
- `react-native-webrtc` + plugin `@config-plugins/react-native-webrtc` → **Development Build obligatoire** (pas Expo Go).
- Permissions : caméra (vidéo) et micro. Textes iOS : `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`. Android : `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`.
- Le Wi-Fi ne doit pas isoler les clients.
- L'application doit être **au premier plan** pour recevoir un appel (V1).

## Rôles
- **Appelant** : crée l'offre SDP.
- **Appelé** : répond avec l'answer.
- **Serveur** : valide, relaie, gère timers et historique.

## Séquence nominale
```
Appelant                 Serveur                    Appelé
   │ call.invite ─────────▶│                           │
   │                       │ (crée CallSession)        │
   │◀── call.ringing ──────│── call.incoming ─────────▶│  (UI sonnerie)
   │                       │◀──────── call.accept ─────│
   │◀──── call.accepted ───│                           │
   │ getUserMedia + PC     │                           │ getUserMedia + PC
   │ call.offer(sdp) ─────▶│── call.offer ────────────▶│
   │◀── call.answer ───────│◀──────── call.answer ─────│
   │ call.ice ◀──────────▶ │ ◀────────── call.ice ◀──▶ │
   │══════════ média P2P (SRTP/UDP) ═══════════════════│
   │ call.end ────────────▶│── call.ended ────────────▶│
```
Le micro/caméra de l'appelé démarre **après** `call.accept` ; ceux de l'appelant après `call.accepted`.

## Machine à états (serveur — `CallSession`)
| État | Entrée | Sorties |
|---|---|---|
| `ringing` | `call.invite` valide, appelé en ligne et libre | `accepted` (accept) · `ended:rejected` · `ended:cancelled` (appelant annule) · `ended:missed` (timeout 30 s) |
| `accepted` | `call.accept` | `connected` (premier `call.ice`/`connected` rapporté par client) · `ended:connect_timeout` (20 s) |
| `connected` | client signale `call.connected` | `ended:hangup` (`call.end`) · `ended:peer_lost` (déconnexion WS > 10 s) |
| `ended` | terminal | écrit en table `calls`, supprimé de la RAM |

Rejets à l'invite : appelé hors ligne → `call.unavailable` (historique `missed` côté appelé) ; appelé déjà en appel (ou en sonnerie) → `call.busy` (historique `busy`) ; appelant déjà en appel → `error CALL_BUSY`.

**Machine à états côté mobile (`CallManager`)** :
`idle → outgoing_ringing → connecting → active → ended` et `idle → incoming_ringing → connecting → active → ended`. Toute transition inattendue → nettoyage complet (stop tracks, `pc.close()`, reset du store) puis `idle`.

## Contenu des messages de signalisation
- `call.offer/answer {callId, sdp: {type, sdp}}`
- `call.ice {callId, candidate: {candidate, sdpMid, sdpMLineIndex}}` — les candidats reçus avant `setRemoteDescription` sont **mis en file** puis appliqués.
- `call.connected {callId}` (client → serveur) quand `iceConnectionState` ∈ {connected, completed}.

## Paramètres média
| Paramètre | Audio | Vidéo |
|---|---|---|
| Contraintes | `{audio:true}` | `{audio:true, video:{width:640,height:480,frameRate:24,facingMode:'user'}}` |
| Codec | Opus (par défaut) | VP8/H264 (par défaut) |
| Débit max vidéo | — | 1 Mbit/s (LAN) |

Contrôles en appel : couper/rétablir micro, couper/rétablir caméra, changer de caméra, haut-parleur (`InCallManager` ou équivalent), raccrocher. Passage audio→vidéo en cours d'appel : **hors V1**.

## Cas d'erreur à gérer
| Cas | Comportement |
|---|---|
| Permission refusée | Écran explicatif, `call.reject` / abandon, état `idle` |
| WS coupé pendant l'appel | Média continue (P2P). Si WS non rétabli en 10 s, le serveur termine la session côté signalisation ; le client garde l'appel tant que ICE est `connected` et reprend la signalisation à la reconnexion |
| ICE `failed` | Tentative `restartIce` 1 fois, sinon fin d'appel `reason:'ice_failed'` |
| Double appel simultané A→B et B→A | Le serveur accepte le premier arrivé ; le second reçoit `call.busy` |
| App passée en arrière-plan | Appel audio continue si la configuration de background audio est activée ; sinon fin propre. V1 : afficher un avertissement, ne pas garantir |
| Raccrocher pendant la sonnerie | `call.cancel` (appelant) ou `call.reject` (appelé) |

## Historique (table `calls`)
Écrit par le serveur à l'entrée dans l'état `ended`. Statuts : `completed` (connecté puis raccroché), `missed` (timeout/hors ligne, vu par l'appelé), `rejected`, `cancelled`, `busy`, `failed`.
