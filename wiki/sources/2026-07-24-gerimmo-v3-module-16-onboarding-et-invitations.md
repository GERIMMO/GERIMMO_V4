---
type: source
tags: [onboarding, invitation, consentement, whatsapp, import, module-16]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-Module-16-Onboarding-et-invitations.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 16 : Onboarding et invitations

**En une phrase :** 8 parcours, 2 objets (**Compte**, **Consentement**) — « une
personne existe avant d'avoir un compte » : le module ouvre les espaces personnels
quand ils sont utiles **et acceptés**. Enjeu commercial : « sans import, aucune
agence ne migre ». **Module clos.**

## Affirmations clés

1. **Qui a un compte** : SA, admin agence (créée par le SA à la signature du contrat),
   agents, artisans (ils déposent leurs pièces), propriétaire direct ; **locataire :
   optionnel** (« une personne sans compte reste gérable » — bail, quittances,
   documents par email, RM-16.4.2) ; **mandant : JAMAIS** (RM-16.4.3).
2. **Création d'agence (16.1)** : réservée au SA ; l'agence démarre avec un **jeu
   complet de paramètres par défaut** (modèles de documents, grilles de récupérables
   et de vétusté, plan comptable, liste d'équipements, seuils d'alerte, modèles
   WhatsApp — RM-16.1.2). Paramétrage initial (16.2) : identité, agents, **indice
   IRL obligatoire avant toute révision**, seuil de délégation, marque blanche et
   WhatsApp optionnels.
3. **Deux imports conservés** (décision actée) : **0.12** (SA — migration, milliers
   de lignes, atomique, annulable) vs **16.3** (agence — saisie accélérée, dizaines
   de lots, **ligne par ligne, sans reprise du passé ni annulation globale**) —
   **gabarit et contrôles communs** (RM-16.3.1).
4. **Invitation (16.4)** : depuis la fiche personne (email requis), relances J+3 et
   J+10, **expiration J+30** renvoyable, **refus explicite tracé qui arrête les
   relances** (« un refus n'est pas un problème »). Première connexion (16.8) : mot
   de passe, CGU obligatoires, espace selon le rôle, enrôlement WhatsApp proposé.
5. **Enrôlement WhatsApp (16.5) — criticité maximale, contraintes Meta** :
   **optionnel, repli email systématique** (RM-16.5.1/7 — toute alerte doit avoir un
   canal de repli) ; **aucun message sans consentement** préalable daté et conservé
   (RM-16.5.2/3), **révocable** (case dans l'espace, STOP natif, ou via l'agence) ;
   **fenêtre de 24 h** : hors fenêtre, seuls les **modèles approuvés par Meta**
   partent (8 modèles à faire approuver — invitation, rappels RDV, relances impayé,
   assurance, documents, notation, créneaux, signature), **gérés par le super
   admin** (même logique que les modèles du module 12).

## Décisions actées / reports

Actées : WhatsApp optionnel + repli email, modèles Meta par le SA, révocation depuis
l'espace, deux imports, gabarit commun, mandant sans compte. **Hors périmètre** :
bot WhatsApp conversationnel, SMS. 4 US, 5 critères.

> [!warning] Écarts avec le code
> - Le code lie les bots par **jeton haché à expiration 30 min** (Telegram) ; le V3
>   enrôle par **consentement WhatsApp** sur numéro. À réconcilier avec le sort de
>   Telegram (cf. module 15).
> - « **Bot WhatsApp conversationnel : hors périmètre** » — alors que le code actuel
>   a un bot conversationnel (déclaration d'incident guidée). Régression assumée ou
>   formulation à clarifier.

## Ce que ce module impose ailleurs

Module 14 (canal de repli par alerte), module 15 (canal WhatsApp conditionné au
consentement), module 12 (envoi WhatsApp), module 17 (activation marque blanche),
module 18 (gestion des modèles WhatsApp).

## Pages mises à jour par cet ingest

[[Onboarding et abonnement]] · [[Compte, personne et adhésion]] ·
[[Canaux de communication]] · [[État du projet et décisions ouvertes]]
