# 01 — Vision et périmètre

## Objectif
Un système de communication fonctionnant **uniquement sur un réseau local** : des téléphones (Expo Go / dev build) parlent à un serveur Node.js hébergé sur un PC du même LAN. Projet de test : simple, lisible, extensible.

## Fonctionnalités V1
| ID | Fonctionnalité | Phase |
|---|---|---|
| F1 | Configurer l'adresse du serveur (IP:port, saisie ou QR) | 1 |
| F2 | Créer un compte / se connecter (pseudo + mot de passe) | 1 |
| F3 | Liste des utilisateurs + statut en ligne/hors ligne | 2 |
| F4 | Conversations directes 1-1 | 2 |
| F5 | Messages texte temps réel, statuts envoyé/délivré/lu | 2 |
| F6 | Indicateur « est en train d'écrire » | 2 |
| F7 | Envoi de photos et fichiers (≤ 25 Mo) | 3 |
| F8 | Reprise après coupure (rattrapage des messages manqués) | 2 |
| F9 | Notifications dans l'app (bannière, badge non-lus) | 4 |
| F10 | Appel audio 1-1 | 5 |
| F11 | Appel vidéo 1-1 | 5 |
| F12 | Historique des appels | 5 |
| F13 | Groupes (optionnel V1.1) | 6 |

## Hors périmètre V1
Chiffrement de bout en bout · notifications push hors app (FCM/APNs) · appels de groupe · messages vocaux · multi-appareils par compte · fédération de plusieurs serveurs · sauvegarde cloud · modération.

## Contraintes
- **Zéro Internet** requis à l'exécution.
- Serveur : un seul processus Node.js, une base SQLite, un dossier de fichiers.
- Capacité visée : ≤ 30 utilisateurs simultanés.
- Plateformes : Android + iOS.
- Les téléphones peuvent être en veille : **l'app n'est pas joignable en arrière-plan** (limitation assumée en V1, voir doc 09).

## Hypothèses réseau
- Serveur à IP fixe ou réservée DHCP (ex. `192.168.1.10`), port `3000`.
- Le Wi-Fi n'a **pas** l'isolation de clients (AP/client isolation) activée, sinon les appels P2P échouent.
- Pare-feu du PC : port 3000/TCP ouvert en entrée sur le réseau privé.
