# Instructions pour l'agent IA

Tu implémentes **LAN-Comm**, décrit dans ce dossier. Tu as deux livrables : `server/` (Node.js) et `mobile/` (Expo).

## Règles
1. `contracts/*` est la source de vérité. Copie `protocol.ts` et `models.ts` dans un package partagé `shared/` utilisé par `server` et `mobile` (pas de duplication manuelle).
2. TypeScript `strict: true` partout. Pas de `any` sauf justification en commentaire.
3. Valide **toute** entrée serveur (REST + WS) avec `zod`. Un message invalide ne fait jamais planter le serveur : il renvoie `error`.
4. Le serveur est la source de vérité des `seq`, `createdAt`, états de message et états d'appel. Le client ne les invente jamais.
5. Idempotence : l'envoi d'un message avec le même `clientMsgId` ne crée jamais de doublon.
6. Aucun secret en dur. Config via `.env` (voir doc 10).
7. Aucune dépendance à Internet à l'exécution (pas de CDN, pas de service cloud, pas de STUN/TURN public).
8. Le code des écrans suit exactement les noms de `docs/07` (ex. `ChatScreen`, `CallScreen`).
9. Travailler phase par phase (doc 10). À la fin de chaque phase : lancer les tests, lister ce qui marche, ce qui reste.
10. Si une spec est ambiguë : choisir l'option la plus simple, la noter dans `DECISIONS.md`, continuer.

## Ordre de lecture
README → docs/01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → contracts/*.

## Définition de « terminé » (V1)
Tous les critères d'acceptation de la doc 10 sont verts, sur au moins 2 téléphones réels dans le même Wi-Fi, **Internet coupé** (mode avion + Wi-Fi seul, routeur sans WAN).
