# Recette S7 — Incidents (incrément 1 : gestion de l'incident)

> Rédigée le 2026-08-21, à dérouler sur **https://gerimmo-v4.vercel.app** une fois
> la branche `sprint7-incidents` fusionnée et déployée (le code n'est PAS sur
> main ; la base, elle, est déjà migrée — tables et fonctions `incidents`).
> Mot de passe commun : `Gerimmo-Demo-2026`.
>
> **Périmètre de l'incrément** : déclaration (locataire + agence), qualification
> et imputation, contestation, clôture, réouverture, attribution, photos,
> alertes chaînées. **Hors périmètre** (incréments S7 suivants) : artisans,
> devis, planification, interventions — les états « affecté / en cours /
> terminé » existent dans la machine mais aucun écran ne les sert encore.
>
> **Prérequis** : un bail **actif** dont `locataire.alpha@` est locataire
> principal (créé en recette S4/S5 ; sinon, en recréer un via Baux).

## 1. Déclaration par le locataire — persona LO (`locataire.alpha@gerimmo-demo.fr`)

1. Se connecter, ouvrir son espace → une carte **« Mes signalements »** est sur
   l'accueil, avec le bouton doré **« Signaler un problème »**.
2. Cliquer → page « Signaler un problème » : **le champ photo est le premier**
   (avant la description), puis catégorie, pièce, description, « Depuis
   quand ? », urgence (« Non, cela peut attendre… » / « Oui, dégât en cours… »).
3. Envoyer sans catégorie ni description → refus du navigateur (champs requis).
4. Remplir : catégorie « Plomberie — joint, siphon, robinetterie », pièce
   Cuisine, description libre, 1 à 2 photos JPEG, urgence normale → **succès** :
   « Signalement envoyé — votre gérant est prévenu. Suivez-le depuis votre
   espace. » + lien de retour.
5. Retour accueil → le signalement apparaît avec la puce
   **« Reçu — votre gérant l'examine »**, son numéro `INC-2026-000x`, la date et
   le nombre de photos. **Aucune mention de « qui paiera »** tant que l'agence
   n'a pas qualifié (RM-7.2.1 — écart assumé avec la maquette).
6. Redéclarer la même catégorie → accepté (le doublon **alerte** l'agence, il ne
   bloque pas).

## 2. Côté agence : alerte, liste, badge — persona AG (`agent.alpha@gerimmo-demo.fr`)

1. Se connecter → la nav porte l'onglet **Incidents** (après Parc) avec un badge
   rouge du nombre d'incidents ouverts ; la cloche/le tableau de bord montrent
   l'alerte **« Incident à qualifier — INC-… »** (critique si urgence déclarée).
2. Le tableau de bord affiche la carte **« Incidents par payeur »** (donut) :
   tout est « Pas encore tranché » à ce stade.
3. Ouvrir Incidents → liste avec filtres « En cours / À traiter / Clos / Tous »,
   chaque rang : catégorie courte, numéro, lot, déclarant, date, puce
   **« À qualifier »** (rouge), « non attribué ».

## 3. Qualification / imputation — persona AG

1. Ouvrir la fiche → carte **« Qualification — qui paie »** à liseré laiton :
   trois choix (Charge locataire / Charge propriétaire / Dégradation fautive —
   charge locataire), **aucun pré-coché** ; le repère juridique de la catégorie
   est affiché en information (« Repère : en général charge locataire — Décret
   87-712… C'est vous qui tranchez »).
2. Qualifier avec une justification vide → refus navigateur ; avec des espaces →
   **« La justification de l'imputation est obligatoire — elle est opposable »**.
3. Qualifier « Charge locataire » + justification → succès « Incident qualifié —
   le locataire voit l'imputation dès maintenant » ; la puce passe à
   **« Qualifié »**, l'alerte « à qualifier » est **soldée** (Alertes → fermées
   récemment : « Incident INC-… qualifié »).
4. Retenter une qualification (recharger la fiche : le formulaire a disparu,
   l'imputation s'affiche en lecture).

## 4. Information immédiate et contestation — persona LO

1. Recharger l'accueil locataire → la puce est passée à **« À votre charge »**,
   la ligne « Qui prend en charge » cite la justification (RM-7.2.4 :
   information immédiate, avant l'intervention).
2. Cliquer **« Contester cette imputation »**, envoyer un message → « Contestation
   transmise à l'agence. Elle ne suspend pas la réparation. »
3. Le lien de contestation disparaît (une seule contestation) ; côté agence :
   alerte **« Imputation contestée par le locataire — INC-… »**, puce
   **« Contestée par le locataire »** sur la fiche, message visible dans la
   carte Qualification et la chronologie.

## 5. Clôture — persona AG

1. Sur l'incident qualifié : carte Clôture → motifs proposés **« Résolu »** et
   « Transmis au syndic » (pas de « classé sans suite » : il est réservé au non
   qualifié). Clôturer « Résolu » + commentaire → puce **« Clos »**, **toutes**
   les alertes de l'incident (y compris la contestation) sont soldées
   (RM-7.6.2).
2. Sur le second incident resté « À qualifier » : motifs proposés « Classé sans
   suite » et « Transmis au syndic » seulement. Le clôturer « sans suite ».
3. La chronologie de chaque fiche retrace tout : déclaration → qualification →
   contestation → clôture, horodatée, avec les mots exacts.

## 6. Réouverture — personas LO puis AG

1. LO, sur le signalement clos : cliquer **« Le problème persiste »**, expliquer
   → « Signalement rouvert — votre gérant est prévenu » ; puce
   **« Rouvert — votre gérant le réexamine »**, et la ligne « Qui prend en
   charge » repasse à « Votre gérant l'examine » (l'ancienne imputation ne
   préjuge pas de la requalification).
2. AG : alerte **« Incident rouvert, à requalifier — INC-… »** ; la fiche est
   repassée **« Rouvert — à requalifier »**, le formulaire de qualification est
   revenu (clos → rouvert → qualifié : la réouverture ne court-circuite jamais
   la qualification). Requalifier — par exemple « Charge propriétaire »
   (malfaçon de la première réparation).

## 7. Saisie par l'agence — persona AG

1. Incidents → **« Ouvrir un incident »** : choisir un lot **loué**, catégorie,
   description (« Appel du locataire… ») → la fiche s'ouvre, canal **Agence**,
   déclarant = le locataire du bail actif (il suit l'incident depuis son
   espace).
2. Choisir un lot **sans bail actif** → l'incident s'ouvre quand même,
   « Déclaré par — (aucun bail actif sur le lot) ».

## 8. Attribution — personas AG puis AA (`admin.alpha@gerimmo-demo.fr`)

1. AG, fiche non attribuée : bouton **« Je le prends en charge »** → « Suivi par
   agent.alpha@… » ; le bouton devient « Remettre au pot commun ».
2. AA : à la place du bouton, un **sélecteur** (« Personne — pot commun » + les
   gestionnaires) — réattribuer le dossier à l'admin → « Dossier attribué. »

## 9. Photos — personas AG et LO

1. Les photos de la déclaration s'affichent en vignettes sur la fiche agence
   (servies par la route Documents : chaque consultation est journalisée).
2. Fiche agence → « Ajouter une photo » : joindre un JPEG → vignette ajoutée +
   événement « Photo ajoutée » ; joindre un PDF → refus « n'est pas une image
   JPEG ou PNG ».
3. Côté locataire, le **nombre** de photos s'affiche (pas les vignettes —
   limite connue de l'incrément).

## 10. Isolation — persona AA Beta (`admin.beta@gerimmo-demo.fr`)

1. Se connecter chez Beta → onglet Incidents vide, aucun badge, aucune alerte :
   rien des incidents d'Alpha ne transparaît (RM-A1.7).

## 11. Confidentialité inter-locataires (revue n°2 — si un second compte locataire est disponible)

1. Terminer le bail du locataire déclarant, créer un bail actif pour un autre
   locataire **sur le même lot** → son espace ne montre **aucun** incident de
   l'ancien bail (ni description, ni imputation).
2. L'ancien déclarant, tant que son adhésion est active, garde son historique
   dans « Mes signalements ».
3. Boutons « Contester » / « Le problème persiste » : visibles **uniquement
   pour le déclarant** — un colocataire voit l'incident (informé) mais sans ces
   actions.

---

## Écarts assumés et limites de l'incrément (à connaître avant de tester)

- **Pas d'aperçu « qui paiera » à la déclaration locataire** (la maquette en
  montre un) : RM-7.2.1/7.2.4 imposent que l'imputation vienne de l'agent et
  que le locataire soit informé **après** la décision — le référentiel prime.
- **Description obligatoire même avec photo** : la règle mobile « deux photos et
  la pièce suffisent » (RM-19.2.2) s'appliquera au S13 (mobile).
- Liste en **page + fiche** (pattern de l'app), pas en panneau scindé maquette.
- Le locataire ne **revoit pas ses photos** (compteur seulement) — route de
  consultation côté locataire à un prochain incrément.
- Les 9 statuts maquette liés aux artisans/devis/planning arriveront avec les
  incréments suivants ; le vocabulaire implémenté est le **registre A5**
  (7 états), seuls les états sans artisan sont servis.
- Canaux bot (WhatsApp) : hors périmètre V1 ([[Canaux de communication]]).
- Pas encore de carte « Incidents du lot » sur la fiche lot.

## Vérifications déjà faites par l'agent (ne valent pas validation humaine)

- 82 tests Vitest verts (72 existants en non-régression + 10 unitaires machine
  à états/catégories/motifs) ; les 14 tests d'intégration S7 sont écrits
  (pattern rollback) et s'activeront avec `SUPABASE_DB_URL`.
- 27 scénarios d'intégration déroulés en conditions réelles sur la base (via
  MCP, transactions annulées, zéro résidu) : déclaration, doublon+urgence,
  isolation inter-agences, justification obligatoire, transitions interdites
  (requalification, en cours → clos, résolu sans qualification, rouvert → clos,
  terminé sans suite), contestation unique et non bloquante, clôture soldant
  les alertes, réouverture avec historique, saisie agence, lot archivé refusé,
  attributions (agent/admin/non-membre), photos (MIME, chemin, plafond de dix,
  incident clos), colocataires informés, transmission syndic, catégorie
  fermée, lecture locataire, RLS.
- Revue de code (3 angles : réutilisation, simplification, altitude) : 7 suites
  appliquées — garde-fous déplacés en base, garde locataire factorisée,
  référentiel unique transitions/motifs branché à l'UI, rôles responsables
  centralisés ; 3 écartées et documentées (composants ui partagés = passe
  charte globale, harnais de tests = convention des 12 fichiers existants,
  fusion GED complète = doublon déjà tranché par l'index en base).
- Revue n°2 (rapport final consolidé, 10 findings dont 3 déjà corrigés) :
  **confidentialité inter-locataires corrigée** (la lecture locataire est
  scopée au bail, plus au lot — le nouveau locataire ne voit rien de l'ancien),
  contestation d'un incident clos refusée (plus d'alerte orpheline),
  réouverture efface l'imputation (donut et espace locataire cohérents pendant
  la requalification), boutons contester/rouvrir réservés au déclarant,
  photos : pré-contrôle d'empreinte (plus d'objet Storage orphelin) + uploads
  parallèles. 4 scénarios de re-vérification déroulés en base (rollback).
  Non retenus, documentés : badge nav = total des incidents ouverts de
  l'agence (choix maquette, à la différence du badge Alertes personnel) ;
  numérotation sous verrou et index de tri = négligeables à l'échelle V0.
- Lint 0 erreur, typecheck OK, build OK.
