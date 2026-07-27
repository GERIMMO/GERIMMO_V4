---
type: source
tags: [mobile, edl, incident, compte-rendu, hors-ligne, module-19]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-Module-19-Mobile.md
source-type: module du référentiel des parcours clients (V3) — adaptation, non spécification
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 19 : Mobile

**En une phrase :** aucun parcours nouveau — 3 déclinaisons mobiles de parcours déjà
spécifiés (agent : [[État des lieux|EDL]] · locataire : incident · artisan : compte
rendu). Décision actée : **site adapté, pas d'application native** — donc pas de push
(email + WhatsApp suffisent) ni de hors ligne prolongé. **Module clos.** Il conclut le
référentiel : **« Vingt-deux modules spécifiés […] Le référentiel peut servir de base
au développement. »**

## Affirmations clés

1. **Un module d'adaptation, pas de spécification** : il identifie les parcours qui
   s'utilisent « debout, sur place, sans ordinateur » (dépend des modules 1, 7, 8, 10,
   11) et précise ce que l'écran impose. **Aucune règle métier n'est modifiée par le
   mobile** (RM-19.1.5, 19.2.4, 19.3.4).
2. **Site adapté, pas d'app native (acté)** : aucune installation, mise à jour ou
   validation de magasin d'applications ; en contrepartie, on renonce aux
   **notifications push** (email et WhatsApp les couvrent — modules 14 et 16) et au
   **hors ligne prolongé**. Le navigateur suffit : photo, signature tactile
   (RM-13.1.6), sauvegarde locale, géolocalisation optionnelle ; accès aux contacts
   écarté (sans usage).
3. **Agent — l'EDL, criticité MAXIMALE, « le parcours le plus exigeant du produit »**
   (~60 lignes, debout, logement mal couvert, locataire qui attend — « si l'écran est
   mal conçu, il retournera au papier »). Hors ligne : **sauvegarde locale automatique
   sans action de l'agent** (RM-19.1.1), **synchronisation seule au retour du réseau**
   (RM-19.1.2), photos **compressées à la prise** (RM-19.1.3), signature tactile
   **pleine largeur** (RM-19.1.4). Écran : progression pièce par pièce, boutons
   larges, champs compteurs dédiés, état d'entrée affiché en regard à la sortie
   (RM-1.13.1).
4. **Les limites du hors ligne, assumées** : les données locales **ne survivent ni au
   vidage du cache ni au changement d'appareil** (RM-19.1.8) ; deux garde-fous
   distinguent « un hors ligne utilisable d'un hors ligne dangereux » — **indicateur
   permanent** des données non synchronisées (RM-19.1.6, **bloquant**, ajouté à
   l'audit P1.5) et **alerte avant fermeture** avec données en attente (RM-19.1.7).
   Concurrence : « un état des lieux ne se saisit pas à deux » — la dernière
   synchronisation écrase la précédente ; un EDL ouvert ailleurs est **signalé, pas
   verrouillé** (le hors ligne interdit le verrou, RM-19.1.9).
5. **Locataire — la déclaration d'incident est le parcours qui compte** (7.1 : « il
   photographie sur le vif » ; sinon il appelle et l'agence perd la photo). **Trois
   écrans maximum** (RM-19.2.1), **la photo est le premier champ, avant la
   description** (RM-19.2.2), statut visible depuis l'accueil (RM-19.2.3). 8 parcours
   déclinés au total (attestation 0b.5, quittances 3.12, créneaux 10.2, notation 11.1,
   messagerie 15.1, bail 13.2…).
6. **Artisan — usage quotidien, « c'est son outil de travail »** : le compte rendu
   conditionne la facturation (photo obligatoire RM-7.5.2 — la prendre et l'envoyer
   depuis le chantier « en quelques secondes […] la condition pour qu'il joue le
   jeu »). **Deux écrans** (RM-19.3.1), photo **champ central** (RM-19.3.2), agenda
   toutes agences avec **logo de l'agence sur chaque intervention** (RM-19.3.3,
   reprend RM-17.3.2). Contraintes : gants → boutons larges, plein soleil →
   contrastes élevés, réseau faible → compression + envoi différé.

## Décisions actées / reports

Actées : site adapté (pas d'app native), sauvegarde locale automatique EDL,
synchronisation au retour du réseau, pas de push, email + WhatsApp comme canaux,
**indicateur de synchronisation ajouté à l'audit P1.5**. **Hors périmètre** : app
native iOS/Android, hors ligne prolongé, accès aux contacts. 3 US, 6 critères.
**Module clos — aucune question ouverte.**

## Ce que ce module impose ailleurs

Décline 9 modules (0b, 1, 3, 7, 8, 9, 10, 11, 15) sans en modifier les règles.
Impose surtout à l'EDL (module 1) son mode hors ligne complet, à la déclaration
d'incident (module 7) son format 3 écrans photo-d'abord, au compte rendu (7.5) son
format 2 écrans. Conclut le référentiel des parcours : 22 modules spécifiés.

## Pages mises à jour par cet ingest

[[État des lieux]] · [[Agent immobilier]] · [[Locataire]] · [[Artisan]] ·
[[Cycle de vie d'un incident]] · [[Canaux de communication]] ·
[[État du projet et décisions ouvertes]]
