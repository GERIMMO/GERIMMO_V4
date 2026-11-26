# Points à porter au plan de publication (collectés au fil des lots)
- ORDRE DES MIGRATIONS : règle générale « base avant code » (T1R-4 : sinon l'ancienne base accorde un mois d'office en zone tendue).
- EXCEPTION D4 LEVÉE (relecture de la fusion, R-01, 25/11, commit e71d2644 de claude/palier-1-fusion) : la migration 20261125150000_accord_conditions_version_archivee a été réécrite en place (jamais appliquée en production) ; `accepter_cgu` ne refuse plus rien. L'ordre redevient la règle générale « toutes les migrations avant le code » — voir la section « Ordre de publication après la relecture de la fusion » en fin de fichier (elle remplace l'« Ordre établi pour 20261125150000 »).
- D5 : avant d'appliquer 20261125140000 : `select count(*), count(*) filter (where signee_le is null) from public.demandes_signature;` → 0 et 0.
- A-01 (relecture de la fusion) : nouvelle migration 20261125153000_bail_epoux_pacses_personnes_a_la_signature, à son rang (après 20261125152000), avant le code comme les autres. Aucune précondition (colonne ajoutée avec défaut faux ; aucun bail coché en production : la colonne de la case vient de 20261125152000, du même lot non publié — supposé, la production n'a pas été lue).
- X-01 (reprise de la relecture de la fusion) : nouvelle migration 20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature, à son rang (après 20261125153000), avant le code. Deux déclencheurs, aucune ligne écrite par la migration, aucune précondition. Retour : avant celui de 20261125153000.
- Vendeur : saisir l'identité complète (DECISIONS-2026-11-24.md, Q76) + « type de vendeur » ; archiver les conditions ; médiateur absent → ventes aux particuliers fermées sauf levée explicite (case « j'ai lu ») par le dirigeant.
- Envois : ouvrir les cinq interrupteurs un par un (ouvrir la relance de loyer ouvre aussi la relance à la main) ; GERIMMO_MODE=commercial ; repères fiscaux 15 000 / 30 % avec source.
- Circuits de signature « prêts » non envoyés à re-préparer : bail, acte de cautionnement, état des lieux de sortie, protocole, autorisation de travaux (prod : un seul circuit, bail terminé).
- Sauvegarde préalable avec la nouvelle clé (Q9) — rappel programmé.
- FAIT à la fusion (décision du 25/11 « Facebook masqué ») : la mission marketing et l'action « Publier sur Facebook » refusent la diffusion tant que la Page n'est pas « Relié » (même lecture que l'écran), commit 6c4dd35f de claude/palier-1-fusion. Rien à faire au jour J, sinon savoir qu'un post échu reste « en attente » tant que la Page n'est pas reliée et lue.
- Question ouverte : les autres outils publics (quittance, GLI/Visale, rentabilité, LMNP) préremplissent des exemples ; l'IRL non (décision du 25/11).

## Ordre de publication après la relecture de la fusion (R-01, 25/11)

Remplace la section « Ordre établi pour 20261125150000 » écrite à la fusion (premier passage sans 20261125150000, code, archivage, puis 20261125150000 seule) : cet ordre n'a plus lieu d'être. L'ancienne section est gardée hors du plan (`corrections-fusion/PLAN-PUBLICATION-NOTES.avant.md` du dossier de travail).

**L'ordre redevient la règle générale : toutes les migrations du lot, dans l'ordre du manifeste, AVANT le code.**
La migration `20261125150000_accord_conditions_version_archivee` a été réécrite en place (commit e71d2644 de
`claude/palier-1-fusion` ; jamais appliquée en production) : elle n'a plus de position propre.

### Ce que fait la migration réécrite (lu dans le fichier)
- `accepter_cgu` : plus aucun refus. Elle garde le texte exact de `20261024090000` (une version non archivée
  s'enregistre sans empreinte) ; si la première écriture de la migration avait été jouée (banc), ce texte est reposé
  (`app/supabase/migrations/20261125150000_accord_conditions_version_archivee.sql`, bloc `$accepter$`).
- `abonnements_sans_accord_conditions(p_version)` (non-reconduction faute d'accord exprès) : ne compte plus qu'un accord
  dont l'empreinte est celle du texte archivé de cette version (bloc 2 du même fichier). Une ligne forgée ou sans
  empreinte ne vaut pas accord et ne masque pas l'absence d'accord réel.
- D4R-03 (relance de loyer à la main jamais reprise d'elle-même) : inchangé.

### Pourquoi aucune position ne bloque plus rien (lu dans le code, puis rejoué — voir « Preuves »)
- `accepter_cgu` est la MÊME fonction avant et après la migration (texte du 24/10, vérifié au caractère près par
  `tests/accord-conditions-archivee-base.test.ts`, test « rejeu… »). Inscription, premier mot de passe, case de la
  souscription, accord à une nouvelle version : aucun refus, avec l'ancien code (81740dec) comme avec le nouveau.
- La preuve d'accord de l'application exige l'empreinte (`preuveConditionsEnVigueur`,
  `app/src/lib/garde-souscription-serveur.ts`) ; l'ancien code (81740dec) ne l'exige pas et lit la même table : rien ne
  change pour lui.
- `abonnements_sans_accord_conditions` n'est appelée que pour une version archivée qui exige l'accord exprès
  (`motifSansObjet`, `app/src/lib/non-reconduction-conditions.ts:53-62`). Ni 2026-11-15 (code en ligne, « nouvelles
  souscriptions uniquement ») ni 2026-11-24 (nouveau code, « au prochain acte ») ne l'exigent
  (`conditions-versions.json`) : la fonction n'est appelée par aucun des deux codes aujourd'hui.
- `20261125153000` (relecture A-01) : nouveaux déclencheurs sur `bail_personnes` et `baux`. Sans la case cochée (tous les
  baux de production : la colonne n'y existe pas encore), ils ne refusent rien ; la marque « entrée après la signature »
  se pose sans être lue par l'ancien code. Le nouveau code lit la marque à part et, faute de colonne, rend les textes
  d'avant : sûr dans les deux ordres, mais la règle reste « migrations avant le code ».
- `20261125154000` (reprise X-01) : deux déclencheurs de plus ; ils ne refusent rien et ne font que remettre à faux, à la
  sortie du brouillon, la marque des personnes encore au bail. Sans la case cochée, la marque n'est lue par rien qui
  change un montant ou une date (lu dans la migration et dans la fonction du départ) : sans effet visible pour l'ancien code.
- `20261125151000` et `20261125152000` doivent précéder le code (inchangé : signatures `p_exercice_ancien`, colonne
  `baux.locataires_epoux_pacses`).

### Ordre exact du jour de publication
1. Sauvegarde (protocole habituel).
2. Précondition D5 : `select count(*), count(*) filter (where signee_le is null) from public.demandes_signature;` → 0 et 0.
3. **Toutes les migrations du lot, dans l'ordre du manifeste**, jusqu'à `20261125154000` comprise (`20261125150000` à
   son rang, entre `20261125140000` et `20261125151000`).
4. **Déployer le code.**
5. Saisir l'identité du vendeur et son type (l'archivage range l'identité affichée).
6. Contrôle en lecture : zéro abonné actif (requête ci-dessous) ; sinon l'archivage est refusé (D4R-02) — les souscriptions
   attendent alors l'archive (la preuve exige l'empreinte), mais l'inscription et le premier mot de passe passent.
   `select count(*) from public.abonnements where stripe_subscription_id is not null and coalesce(stripe_statut,'') not in ('canceled','incomplete_expired');`
7. Archiver la version du 24 novembre 2026 depuis /admin/sante (la page publiée doit afficher la version du serveur).
8. Contrôles, **en lecture seule** (rien n'est écrit) :
   - `select * from public.acceptations_sans_version_archivee();` (clé de service ou super admin ; supervision : les
     accords à une version non archivée, inscriptions faites avant l'archivage comprises, y figurent sans rien bloquer) ;
   - `select md5(prosrc) = '05c1f8827ce05a4599803634a822a575' as accepter_cgu_texte_attendu from pg_proc where oid = 'public.accepter_cgu(text,text,text)'::regprocedure;`
     → `t` (texte du 24/10 : une version non archivée s'enregistre sans empreinte, aucun refus) ;
   - `select position('c.empreinte_sha256 = v.empreinte_sha256' in prosrc) > 0 as accord_exige_empreinte from pg_proc where oid = 'public.abonnements_sans_accord_conditions(text)'::regprocedure;`
     → `t` (seul un accord à l'empreinte du texte archivé compte pour la non-reconduction).
   **Ne jamais appeler `accepter_cgu` en production pour ce contrôle, même avec un compte de test** (reprise de la
   relecture de la fusion, Y-02) : `acceptations_cgu` est la preuve des acceptations, en ajout seul (déclencheur
   `acceptations_cgu_immuables`) ; une ligne « 2099-01-01 » écrite ne se supprime pas, même par la clé de service (seule la
   suppression du compte la retire, par cascade), et elle resterait dans la supervision ci-dessus. Le comportement
   « s'enregistre sans empreinte et ne vaut pas preuve » est prouvé au banc, transaction annulée (`tests/accord-conditions-archivee-base.test.ts`).
9. Seulement ensuite, ouvrir les envois automatiques un par un.
Retour arrière : ordre inverse du manifeste, chaque fichier avec `psql -v ON_ERROR_STOP=1` (comme le LISEZ-MOI des retours) — `20261125154000` avant
`20261125153000`, avant `20261125152000` ; `20261125151000` avant `20261125111000` (sinon ce dernier s'arrête sans rien
modifier, A-02 ; depuis la reprise X-02, chacun des deux est une seule instruction, qui passe ou s'arrête d'un bloc même
sans ON_ERROR_STOP, mais psql sort alors avec le code 0 : lire sa sortie) ; `20261125150000` avant `20261024100000` et
`20261024090000`.

### Preuves (banc fidèle à la CI, 25/11, code e71d2644 — commande et sortie ; journaux dans `corrections-fusion/`)
Sonde SQL `corrections-fusion/sonde-positions.sql` (sous `authenticated`, tout annulé) : (1) accord à 2026-11-24 non
archivée, comme l'inscription et le premier mot de passe du nouveau code ; (1 bis) accord à 2026-11-15, comme la case de
la souscription et le premier mot de passe du code en ligne 81740dec ; (2) ligne forgée « 2099-01-01 » ; (2 bis) un
compte B qui n'accepte qu'avant l'archivage ; (3) archivage de 2026-11-24 par la clé de service ; (4) accord exprès /
case de la souscription après l'archivage ; (5) preuve lue comme `preuveConditionsEnVigueur` ; (6) non-reconduction de
2026-11-24 pour un abonné A (accord après archivage) et B (avant seulement).

| État | Comment | Sonde | Tests et parcours |
|---|---|---|---|
| **Migrations avant le code (ordre retenu)** : base neuve, toutes les migrations dont 150000, puis le code | `precheck.sh CORR e71d2644 …` | — | 22 parcours réussis, 2 ignorés (paiement non configuré), dont `compte-securite` (inscription + premier mot de passe + case des conditions), `abonnement`, `blocage-souscription`, `conditions-flux` (`CORR-e2e.log`) |
| Code en ligne (81740dec) sur la base migrée | lecture + sonde (1 bis) | `accepter_cgu('2026-11-15','compte')` : accepté, aucun refus (`R01-sonde-avec.log`) ; texte d'`accepter_cgu` identique avant et après (md5 05c1f882…) ; sa preuve (`version = CONDITIONS_VERSION`, sans empreinte, `81740dec:app/src/lib/garde-souscription-serveur.ts:57-69`) lit une table inchangée ; la non-reconduction n'est pas appelée (2026-11-15 « nouvelles souscriptions uniquement ») | code en ligne non exécuté |
| **Code avant 150000** : banc neuf (`precheck.sh R01SANS`), puis retour de 150000 joué sur les deux bases (psql sortie 0) | `R01-sonde-sans.log` | (1)(1 bis)(2)(2 bis)(4) acceptés ; preuve = 1 ligne à empreinte ; non-reconduction : **aucun** abonné listé (B compté à tort : c'est le défaut R-01) ; déclencheur D4R-03 absent | `premier-mot-de-passe-session-banc` 6/6 ; parcours `compte-securite`, `abonnement`, `blocage-souscription`, `conditions-flux`, `invitations-cycle` : **17 réussis, 2 ignorés** (`R01-sans-e2e.log`, `--retries=0`) |
| Puis 150000 appliquée, code déjà en place | `R01-sonde-reappliquee.log` (psql sortie 0 sur les deux bases) | mêmes acceptations, même preuve ; non-reconduction : **B seul** listé ; déclencheur présent | `premier-mot-de-passe-session-banc` + `accord-conditions-archivee-base` 18/18 ; mêmes parcours **17 réussis, 2 ignorés** (`R01-reappliquee-e2e.log`) |
| Base de l'émulateur après la suite vitest complète, migration appliquée | `R01-sonde-avec.log` | identique à la ligne précédente | — |

Sans la migration, `accord-conditions-archivee-base` échoue sur les 4 tests qui portent sur son effet (non-reconduction
à empreinte, droits du déclencheur, D4R-03, rejeu) : attendu, il décrit la migration (`R01-sans-vitest.log`).
Inscription, souscription et accord exprès passent donc dans les deux ordres ; seule la non-reconduction change, dans
le sens voulu.

### Constaté au banc de la fusion (25/11) — RÉSOLU par R-01
- Le blocage de l'inscription d'un propriétaire sans archive (« L'acceptation des conditions n'a pas pu être enregistrée.
  Réessayez. », `tests/premier-mot-de-passe-session-banc.test.ts`, 3 échecs) venait du refus posé par la première écriture
  de `20261125150000`. Il a disparu avec la réécriture : 6/6 avec la migration appliquée (journal
  `corrections-fusion/R01-premier-mdp-apres.log`). Une future version des conditions ne ferme donc plus les inscriptions
  avant son archivage ; elle ferme seulement les souscriptions (la preuve exige l'empreinte), ce qui était déjà le cas.
- Banc et CI : le banc n'archive toujours aucune version ; le test passe sans archive fictive.
