# Points à porter au plan de publication (collectés au fil des lots)
- ORDRE DES MIGRATIONS : règle générale « base avant code » (T1R-4 : sinon l'ancienne base accorde un mois d'office en zone tendue).
- EXCEPTION D4 (reprise, migration 20261125150000_accord_conditions_version_archivee) : TRANCHÉE à la fusion (25/11, branche claude/palier-1-fusion) — l'ordre de l'auteur est le bon, complété : voir la section « Ordre établi pour 20261125150000 » en fin de fichier.
- D5 : avant d'appliquer 20261125140000 : `select count(*), count(*) filter (where signee_le is null) from public.demandes_signature;` → 0 et 0.
- Vendeur : saisir l'identité complète (DECISIONS-2026-11-24.md, Q76) + « type de vendeur » ; archiver les conditions ; médiateur absent → ventes aux particuliers fermées sauf levée explicite (case « j'ai lu ») par le dirigeant.
- Envois : ouvrir les cinq interrupteurs un par un (ouvrir la relance de loyer ouvre aussi la relance à la main) ; GERIMMO_MODE=commercial ; repères fiscaux 15 000 / 30 % avec source.
- Circuits de signature « prêts » non envoyés à re-préparer : bail, acte de cautionnement, état des lieux de sortie, protocole, autorisation de travaux (prod : un seul circuit, bail terminé).
- Sauvegarde préalable avec la nouvelle clé (Q9) — rappel programmé.
- FAIT à la fusion (décision du 25/11 « Facebook masqué ») : la mission marketing et l'action « Publier sur Facebook » refusent la diffusion tant que la Page n'est pas « Relié » (même lecture que l'écran), commit 6c4dd35f de claude/palier-1-fusion. Rien à faire au jour J, sinon savoir qu'un post échu reste « en attente » tant que la Page n'est pas reliée et lue.
- Question ouverte : les autres outils publics (quittance, GLI/Visale, rentabilité, LMNP) préremplissent des exemples ; l'IRL non (décision du 25/11).

## Ordre établi pour 20261125150000_accord_conditions_version_archivee (fusion du 25/11)

### Ce que fait la migration (lu dans le fichier)
`accepter_cgu` refuse (22023, rien d'écrit) un accord source « compte », document `conditions_clients`, dont la version
n'est pas dans `versions_conditions` (`app/supabase/migrations/20261125150000_accord_conditions_version_archivee.sql:73-79`).
Elle pose aussi le déclencheur D4R-03 : une relance de loyer envoyée à la main n'est jamais reprise d'elle-même (même
fichier, l. 87-107).

### Ce qui l'appelle (lu dans le code)
- Case de la souscription : `accepterConditionsGenerales` appelle `accepter_cgu(CONDITIONS_VERSION, 'compte')` SANS
  vérifier l'archive (`app/src/app/actions/abonnement.ts:525-534`) ; puis `demarrerAbonnement` exige une acceptation
  PORTANT L'EMPREINTE de l'archive (`abonnement.ts:285` → `app/src/lib/garde-souscription-serveur.ts:83-97`).
- Première connexion d'une personne invitée (mot de passe + case) : `definirNouveauMotDePasse` appelle
  `accepter_cgu(version, 'compte', document)` SANS vérifier l'archive ; pour un propriétaire ou une agence, le document
  est `conditions_clients` (`app/src/app/actions/auth.ts:169-183`, `app/src/lib/conditions-acceptation.ts:105-110`).
- Accord à une nouvelle version : vérifie l'archive AVANT l'appel (`app/src/app/actions/acceptation-conditions.ts:40`).
- Actes d'un abonné (hausse, périodicité, reprise) : version « au prochain acte » non archivée → acte sans accord, aucun
  appel (`abonnement.ts:617-623`).
- Ouverture d'un espace propriétaire : source `espace_proprietaire`, non concernée (`auth.ts:459-462`).
- L'archivage lit la PAGE PUBLIÉE et refuse si elle n'affiche pas la version du serveur
  (`app/src/lib/conditions-versions-serveur.ts:193-197`) : la version 2026-11-24 ne peut être archivée qu'une fois le
  nouveau code en ligne. Il est aussi refusé s'il existe un abonné actif (même fichier, l. 164-168, D4R-02).

### Que se passe-t-il selon la position de la migration
1. **Migration AVANT le code (règle générale « base avant code »)** — le code en ligne envoie `2026-11-15`
   (`81740dec:app/src/lib/editeur.ts:403`). Si cette version n'est pas archivée en production (NON VÉRIFIÉ : les notes D7,
   § 6.2, et le wiki au 24/10 disent ne pas le savoir / aucune version archivée), la base refuse la case de la
   souscription et la première connexion des propriétaires et agences invités (« L'acceptation des conditions n'a pas pu
   être enregistrée »), jusqu'au nouveau code ET à l'archivage de 2026-11-24. Aucune donnée abîmée ; blocage temporaire.
2. **Code déployé, migration appliquée AVANT l'archivage de 2026-11-24** — le nouveau code envoie `2026-11-24`, absente de
   l'archive : la première connexion des propriétaires et agences invités est refusée. La souscription, elle, est
   bloquée de toute façon tant que la version n'est pas archivée (la preuve exige l'empreinte,
   `garde-souscription-serveur.ts:83-97`) : la migration ne change que le message (refus de la case au lieu de la case
   redemandée). Si l'archivage est refusé (abonné actif), ce blocage dure.
3. **Code déployé AVANT la migration (ordre retenu)** — rien ne se bloque à cause d'elle : sans la migration, un accord sur
   une version non archivée s'écrit sans empreinte et ne vaut pas preuve côté code (même fichier) ; la garde en base
   n'est qu'une seconde barrière contre un appel direct. Seule exposition : D4R-03 — tant que la migration n'est pas
   appliquée, une relance de loyer à la main en échec pourrait être reprise par la tâche des courriels sans trace au
   bail ; elle n'existe que si l'interrupteur « Relance amiable d'un loyer impayé » est ouvert (fermé par défaut).

### Peut-on rendre la migration sûre en toute position ?
Non, sans affaiblir sa garde. Pour ne gêner aucune position, la base devrait accepter une version non archivée quand
c'est la version légitime du code en ligne (2026-11-15 avant le code, 2026-11-24 avant l'archivage) tout en refusant une
version inventée (« 2099-01-01 ») ; elle ne connaît pas la déclaration des versions (`conditions-versions.json`) et ne
peut pas les distinguer. Une règle par date (« n'exiger l'archive que pour une version postérieure à la dernière
archivée ») refuse quand même 2026-11-24 avant son archivage (position 2) et 2026-11-15 si une version plus ancienne
seule est archivée (position 1) ; l'inverse laisserait passer « 2099-01-01 ». Or le test de la migration exige le refus
de toute version non archivée, y compris la version en vigueur avant son archivage
(`app/tests/accord-conditions-archivee-base.test.ts:6` et `:113-120`). Rien n'a donc été changé dans la migration.

### Ordre exact du jour de publication (liste explicite du chantier « migrations », `.github/workflows/migrations.yml`)
1. Sauvegarde (protocole habituel).
2. **Base, premier passage** : toutes les migrations du lot dans l'ordre du manifeste **SAUF `20261125150000`**, c'est-à-dire
   jusqu'à `20261125140000` (précondition D5 ci-dessus : demandes_signature vide), puis **`20261125151000` et
   `20261125152000`**, qui DOIVENT précéder le code (le code de la reprise T3 appelle les signatures avec
   `p_exercice_ancien` ; celui de la case « mariés ou pacsés » lit la colonne `baux.locataires_epoux_pacses`). Le
   chantier accepte cette liste (la contrainte de `scripts/deploiement/conditionner-migration.mjs:19-22` ne vise que les
   huit migrations « commerciales » de novembre) ; `20261125150000` ne dépend ni de `151000` ni de `152000` et inversement
   (fonctions distinctes : `accepter_cgu` et un déclencheur sur `courriels_durables` d'un côté, régularisations et
   `enregistrer_depart_colocataire` de l'autre).
3. **Déployer le code.**
4. Saisir l'identité du vendeur et son type (notes D7, § 5.2) — l'archivage range l'identité affichée.
5. **Contrôle en lecture : zéro abonné actif** — `select count(*) from public.abonnements where stripe_subscription_id is
   not null and coalesce(stripe_statut,'') not in ('canceled','incomplete_expired');` → 0. Sinon l'archivage est refusé :
   **ARRÊTER ICI, ne pas appliquer 20261125150000** (le code reste correct sans elle ; les souscriptions restent bloquées
   tant que la version n'est pas archivée — question R6.1 des notes D4).
6. **Archiver la version du 24 novembre 2026** depuis /admin/sante, aussitôt le code en ligne (entre-temps la souscription
   attend l'archive ; la première connexion des invités, elle, passe).
7. **Base, second passage : `20261125150000` seule.** Contrôles : `select count(*) from
   public.acceptations_sans_version_archivee();` ; avec un compte de test, `accepter_cgu('2099-01-01')` refusé.
8. **Seulement ensuite** ouvrir les envois automatiques, en particulier « Relance amiable d'un loyer impayé » (qui ouvre
   aussi la relance à la main) : le déclencheur D4R-03 doit être en place avant.
Retour arrière : le retour de `20261125150000` se joue en premier (il est indépendant des retours de `151000`/`152000`),
et avant celui de `20261024090000` (LISEZ-MOI des retours, ligne de 20261125150000).

### Constaté au banc de la fusion (25/11) — à connaître avant de choisir
- **Inscription d'un propriétaire bloquée sans archive.** Le test `tests/premier-mot-de-passe-session-banc.test.ts`
  (compte créé comme à l'inscription, puis choix du mot de passe avec la case des conditions, sur l'émulateur) échoue
  avec « L'acceptation des conditions n'a pas pu être enregistrée. Réessayez. » quand `20261125150000` est appliquée et
  qu'aucune version n'est archivée (banc : `versions_conditions` vide). Preuve : 3 échecs ; retour de la migration
  appliqué → 6/6 ; migration remise → 3 échecs. En production, l'ordre ci-dessus (archiver AVANT `20261125150000`) évite
  le blocage. MAIS, avec cette migration, **chaque future version des conditions clients bloquera toute nouvelle
  inscription de propriétaire tant qu'elle n'est pas archivée**, et l'archivage est refusé dès qu'il existe un abonné
  actif (D4R-02) : avec un seul abonné, une nouvelle version fermerait les inscriptions jusqu'à l'écriture de l'annonce
  (question R6.1 des notes D4). À trancher par le dirigeant avant d'appliquer `20261125150000`.
- **Banc et CI.** Le banc (et la CI, qui pose l'émulateur) n'archive aucune version : ce test y reste en échec tant que le
  jeu d'essai n'archive pas la version en vigueur (archive fictive) ou que la garde n'est pas revue. Non corrigé à la
  fusion : une archive fictive change aussi la garde des nouvelles souscriptions (`motifArchiveCommande`,
  `app/src/lib/garde-souscription-serveur.ts:62-69`) et donc d'autres parcours, non rejoués ici.
