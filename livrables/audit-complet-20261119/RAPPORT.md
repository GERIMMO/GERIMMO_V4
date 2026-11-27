# Gerimmo V4 — Audit indépendant complet avant lancement

- **Version auditée** : `341b770f1d339071f23784ef79fec8fbffb3ff49`. PR #345 et #346 publiées.
- **Date** : 19 novembre 2026, de 12 h 40 à 15 h UTC.
- **Production** : https://www.gerimmo.app ; ventes payantes fermées (vérifié en base).

**Méthode**
- **Faits relevés d'abord** : code, production en lecture seule, CI.
- **Tests modifiant des données** : sur deux bancs isolés construits à 341b770f, avec une base fictive. Toute écriture
  de sonde de sécurité a été faite dans une transaction annulée.
- **Écritures en production** : avec l'accord du dirigeant, uniquement deux opérations, toutes deux purgées :
  - la recette automatisée n° 51 ;
  - un parcours SCI complet, avec un compte fictif `delivered+…@resend.dev`.
- **Aucun** paiement, envoi engageant, déploiement, fusion ou modification de code.
- **Rapports précédents** : utilisés comme liste de risques, jamais comme preuve.

**Dans ce rapport**, « vérifié » signifie que je l'ai constaté moi-même aujourd'hui. « Non vérifié » est dit
explicitement, avec la raison.

---

## A. Synthèse générale

| Note | /10 | En une phrase |
|---|---|---|
| **Globale** | **6** | Un socle sérieux et bien gardé. Il reste quelques trous précis qui ne se voient qu'en cherchant. |
| Technique | 7 | CI, migrations sous garde, sauvegarde et restauration exercées, tâches planifiées fiables ; l'alerte du dirigeant échoue depuis 8 jours. |
| Sécurité | 6 | Isolation solide en base (419 fonctions sondées, aucun contournement). Mais un chemin de fichier entre espaces, une double authentification non exigée et aucun antivirus. |
| Fonctionnalités | 7 | Parcours particulier complet. Parcours SCI presque réparé, encore bloqué au choix du signataire. |
| UX | 6 | Gestes courts réussis ; refus silencieux ou peu explicites dans le parcours SCI. |
| Préparation commerciale | 4 | Ventes fermées à raison : aucun médiateur désigné, paiement jamais exercé en réel, recommandé AR24 non configuré. |

### Les trois verdicts

| Cible | Verdict | Conditions |
|---|---|---|
| 1. **10 propriétaires particuliers gratuits** | **GO sous deux conditions** | Corriger SEC-1, un correctif court. Constater le 20/11 à 04 h UTC que l'alerte du dirigeant arrive. |
| 2. **Propriétaires en SCI** | **NO GO aujourd'hui → GO après SCI-1** | Le bail SCI est bloqué au choix du représentant, par un message qui n'explique pas la cause. Le correctif est petit. |
| 3. **Commercialisation payante à grande échelle** | **NO GO** | Voir « Avant la commercialisation payante » dans la section E : médiateur, paiement réel, antivirus, double authentification, validation juridique. |

---

## B. État exact relevé (preuves vérifiables)

| Élément | Constat | Preuve |
|---|---|---|
| **Version servie** | 341b770f, maintenance désactivée. | `/api/sante`. Vercel `dpl_EnpyBacaE19hdQcgsC5C2LPjUW8k` (11 h 28 UTC) puis `dpl_6mToNtWoa8UbhCGNnaYcMZjBjnaX`, READY. |
| **CI et livraison sur 341b770f** | Toutes vertes. | CI 44515170620 ; Migrations 44515399700 et 44522556827 ; Sauvegarde 44518574778 ; Restauration 44519259094 ; Publication contrôlée 44521085370, 44522986748 et 44523343823. |
| **Migrations** | Le registre compte 511 versions pour 514 fichiers. Quatre fichiers sont absents du registre par leur nom, mais leurs tables, colonnes et index existent bien en base ; un nom en base n'a pas de fichier. C'est un écart d'enregistrement historique : le schéma est complet. | Requêtes sur `supabase_migrations.schema_migrations` et `to_regclass`. |
| **Ventes** | Fermées. | `supervision_identite.souscriptions_payantes_ouvertes = false` ; 0 abonnement en base. |
| **Erreurs d'exécution sur 48 h** | Un seul groupe : `[relais] Un envoi de l'alerte n'a pas abouti`. | Vercel, erreurs d'exécution. |
| **Tâches internes de la base** (12 tâches pg_cron) | Toutes en succès, 0 échec sur 7 jours. | `cron.job_run_details`. |
| **Tâches Vercel** | Quittances, appels, relances, rappels, abonnements, signatures, purge et sauvegarde passent sans échec ; seul le relais échoue. | `tech_log` sur 3 jours. |
| **Dépendances** | Une vulnérabilité modérée de Next 16.4.2 (`use cache` / root params). L'application n'utilise ni `use cache` ni `unstable_cache`, elle n'est donc pas exploitable ici. | `npm audit --omit=dev`, recherche dans le code. |
| **Avertissements Supabase** | 1 vue SECURITY DEFINER (`organisations_portail`). 419 fonctions SECURITY DEFINER exécutables par un utilisateur connecté, aucune par un visiteur anonyme. `pg_net` installé dans `public`. | `get_advisors` sécurité. |

---

## C. Couverture des tests

Légende :
- ✅ réussi ;
- ❌ échoué ;
- ⚠️ réussi avec un défaut ;
- ⏸ non testé, avec la raison.

**Sources** :
- **[P]** : production aujourd'hui (compte SCI fictif) ;
- **[R51]** : recette de production n° 51 sur 341b770f ;
- **[B]** : bancs isolés à 341b770f ;
- **[CI]** : CI 44515170620 ;
- **[M]** : mon audit du 19/11 au matin sur 2928d63f. Ce dernier n'est pas une preuve pour 341b770f : il est cité à titre d'historique.

### Propriétaire particulier

| Fonction | État | Source |
|---|---|---|
| Inscription publique, confirmation, premier accès | ✅ Écran public, lien de confirmation réel, écran de profil, création de l'espace. | [P], [R51] |
| Récupération du mot de passe | ✅ Lien de réinitialisation réel → choix du mot de passe. | [P] |
| Biens, logements, détention | ✅ | [P], [B], [M] |
| Diagnostics, DPE exigé avant la mise en location | ✅ Refus « DPE absent ou expiré » puis acceptation. | [P] |
| Bail : création, activation par dépôt du PDF signé | ✅ | [P], [B] |
| Loyers : paiement partiel → reçu ; solde → quittance | ✅ 300 € → reçu ; +440 € → quittance de 740 € exacte. | [P] |
| Le locataire ne peut pas encaisser | ✅ Refus en base, y compris par appel direct à l'API. | [B], [M] (403 en production) |
| Impayés, relances | ✅ Automates passés sans échec. ⏸ Pas de relance réelle : les envois automatiques sont suspendus en pilote, par choix. | [CI], `tech_log` |
| Factures, dépenses, charges, régularisation, compteurs, répartition | ✅ Suites de la CI et tests navigateur rejoués. ⏸ Non rejoué en production aujourd'hui. | [CI], [B], [M] |
| Incidents | ✅ | [B], [CI], [M] |
| Congé, départ, restitution du dépôt | ✅ | [CI], [B], [M] |
| Exports et rapports | ✅ Routes revues (autorisation, liens signés de 60 s). ⏸ Export complet non joué en production. | revue de code, [CI] |

### SCI

| Fonction | État | Source |
|---|---|---|
| Inscription « SCI » avec nom de société | ✅ L'espace porte le nom de la société, et la société est la fiche titulaire. | [P] |
| Propriété des biens | ✅ La SCI détient 100 % dès la création du lot, sans contournement. Le P1-1 du 19/11 est corrigé pour les nouveaux comptes. | [P] |
| Choix du représentant signataire | ❌ **SCI-1**. La gérante est bien proposée, mais refusée tant que sa fiche n'a pas de prénom. | [P] |
| Coordonnées de la société dans le bail | ⚠️ **SCI-2**. Le récapitulatif signale « adresse du propriétaire à compléter ». | [P] |
| Bail nu, encaissement, quittance | ✅ La quittance nomme la SCI avec l'adresse du profil. | [P] |
| Bail meublé, colocation | ✅ | [M] (19/11, 2928d63f, code inchangé sur ce point), [CI] |
| Charges, documents, clôtures | ✅ | [CI], [B] |
| Comptes SCI existants avant #346 | ⏸ Non rattachés à la société par la PR (choix documenté). À traiter à la main si un pilote existe déjà. | lecture de la PR #346 |

### Locataire

| Fonction | État | Source |
|---|---|---|
| Invitation, activation | ✅ | [R51], [CI] |
| Documents, paiements, incidents, messages | ✅ | [R51], [CI], [B] |
| Protection contre les actions non autorisées | ✅ Sonde de 419 fonctions avec un locataire : toutes les actions de gestion sont refusées (encaisser, activer, réviser, régulariser, clôturer, désigner un représentant…). | [B] |
| Aucun encaissement sur simple déclaration | ✅ Il n'existe pas de fonction « j'ai payé » ; un locataire ne peut pas insérer d'encaissement. | [B], code, [M] |

### Administration et autres espaces

| Fonction | État | Source |
|---|---|---|
| Supervision avec double authentification réelle | ✅ | [R51] (session de supervision ouverte avec un vrai code) |
| Artisan | ✅ | [R51], [CI], [B] (tests navigateur artisan rejoués) |
| Tâches planifiées | ✅ Base et Vercel. ❌ Sauf le relais du dirigeant. | production |
| Sauvegarde et restauration | ✅ | GitHub Actions 44518574778 et 44519259094 |

### Tests automatisés rejoués par moi à 341b770f

| Suite | Résultat |
|---|---|
| **Tests unitaires et de base** (vitest, banc 1) | 12 667 réussis, 3 échoués. Les échecs viennent du banc : tests de retour arrière joués sur une base non historique. |
| **Les mêmes tests de retour arrière**, sur la base historique comme en CI | 47 réussis sur 47. |
| **Quatre fichiers non rejoués** (`lot2-auth-reel`, `lot3-notifications-base`, deux tests navigateur de la console) | ⏸ Ils exigent des bases dédiées et un navigateur sans interface absent de mon environnement. Ils ne sont couverts que par la CI 44515170620. |
| **Tests navigateur** (banc 1) | 259 réussis, 24 échoués. Les échecs viennent du banc : clé de service absente et nom de base non conforme. |
| **Rejeu des 13 fichiers en échec**, sur un banc fidèle à la CI | 56 réussis, 0 échec. |
| **Recette de production n° 51** | Succès sur toutes les étapes : préparation, double authentification réelle, parcours sur téléphone, purge. Les 4 échecs du n° 50 ont disparu. |

---

## D. Anomalies

### P0 — aucune

Je n'ai trouvé aucune faille exploitable sans prérequis, ni d'erreur d'argent ou de perte de données en cours.

### P1

**SEC-1 — Un fichier d'un autre espace peut être lu ou supprimé par une fiche qui pointe vers son chemin**

- **Constat**, vérifié sur le banc avec une transaction annulée : un propriétaire de l'espace A peut créer, dans son
  propre espace, une fiche de document dont le `storage_path` désigne un fichier de l'espace B.
  - **Suppression** : avec le type `document_test` (conservation de 0 mois), la tâche de conservation
    `appliquer_retention()` purge la fiche-sonde et met en file de suppression **le fichier réel de B**, alors que la
    fiche de B reste « vivante ». La purge de nuit supprimerait donc physiquement le document d'un autre client, par
    exemple un bail signé.
  - **Lecture** : avec le type `justificatif`, lié à la fiche de son propre locataire, ce locataire **lit le fichier de
    B**. La politique `ged_select_locataire` passe par `chemins_pieces_locataire()`, qui ne contrôle pas le préfixe du
    chemin.
- **Prérequis** : connaître le chemin exact du fichier. Il contient un identifiant aléatoire, mais il circule dans les
  liens signés remis à quiconque a consulté le fichier : un locataire, un artisan ou un ancien collaborateur.
- **Production** : mêmes règles (lecture seule) :
  - la politique `documents_insert` ne vérifie que l'organisation ;
  - aucun déclencheur ni contrôle ne relie le chemin à l'organisation ;
  - la règle de conservation « Documents de test » est active, avec 0 mois.
- **Preuves** : `preuves/securite/test-chemin-croise.sql` (sortie : `fichier_alpha_mis_en_file_de_suppression = 1`,
  `fiche_alpha_originale_purgee = f`) et `test-chemin-croise-lecture.sql` (`fichier_alpha_lisible_par_locataire_PD = 1`).
- **Reproduction** :
  1. En tant que propriétaire A, insérer `documents(organization_id=A, type='document_test', storage_path='<B>/<uuid>.pdf', …)`.
  2. Lancer `appliquer_retention()`.
  3. Lire `purge_fichiers`.
- **Correction** : quelques lignes, sans refonte.
  1. Ajouter une contrainte ou un déclencheur sur `documents` : `split_part(storage_path,'/',1) = organization_id::text`
     pour toute écriture hors tâches système. Prévoir les exceptions réelles : `artisans/…` et `baux-papier` sous le
     préfixe de l'organisation.
  2. Dans `appliquer_retention`, `chemins_pieces_locataire` et la purge de nuit, ne mettre en file ni ne servir un chemin
     que si son préfixe correspond à l'organisation de la fiche, et qu'aucune autre fiche vivante ne le référence.
  3. Contrôler l'existant : aucune fiche ne doit avoir un chemin hors de son préfixe.

**SCI-1 — Le représentant de la SCI est refusé avec un message qui n'explique pas la cause**

- **Constat**, vérifié en production avec un compte fictif :
  - L'inscription SCI (#346) crée la fiche « Personne physique » de la gérante **sans prénom**. Le formulaire public n'a
    pas de champ prénom, et l'écran de confirmation le range dans « Coordonnées et parrainage (facultatif) », replié.
  - `designer_representant_bail` exige un prénom (migration 20261113141000, lignes 42-45). L'écran du bail propose
    bien la gérante, mais « Confirmer le représentant » répond seulement : « Vérifiez la personne physique, son rôle
    et la date du pouvoir. »
  - Pour s'en sortir, il faut deviner qu'il faut compléter la fiche de la gérante. Sa modification exige en plus
    l'adresse, le code postal et la ville, et refuse **sans message** tant qu'ils sont vides (validation HTML).
  - Une fois ces champs remplis : « Pouvoir enregistré pour ce bail. »
- **Preuves** : `preuves/sci-production/sci2-17…`, `sci2-20-representant-apres-clic`, `sci2-22…`,
  `sci2-23-representant-enregistre`, et la base (`representations_bail` vide avant, `persons.prenom` vide).
- **Reproduction** :
  1. S'inscrire en SCI, puis créer un bien, un lot, un locataire et déposer les statuts.
  2. Commencer un bail, puis choisir la gérante comme représentante.
- **Correction** : demander le prénom à l'inscription quand la qualité est SCI ou personne morale (ou le rendre
  visible à l'écran de confirmation). Ne proposer dans la liste que les personnes qui remplissent les conditions, ou
  afficher la cause exacte (« Ajoutez le prénom de Gérante-Audit sur sa fiche »). Ne pas exiger l'adresse de la gérante
  pour enregistrer un prénom.

**OPS-1 — L'alerte quotidienne du dirigeant n'arrive pas depuis le 12/11**

- **Constat** : `relais_alertes_envois` est en échec chaque jour du 12/11 au 19/11, avec 0 destinataire. Vercel
  journalise la même erreur. 9 courriels du relais sont « en attente ».
- **Correctif de configuration** : le destinataire `GERIMMO_RELAIS_EMAILS` a été modifié le 19/11 à 11 h 27 UTC et
  déployé à 11 h 28 UTC (valeur non lue). Son effet ne se verra qu'au passage du 20/11 à 04 h 00 UTC.
- **Non vérifiable aujourd'hui.** Un contrôle est programmé le 20/11 à 04 h 15 UTC.
- **Correction** :
  1. Constater l'envoi réel le 20/11.
  2. Ajouter une alerte de secours qui ne dépend pas du même canal (page Santé visible, ou second destinataire).
     Une panne silencieuse de 8 jours n'est pas acceptable pour un service payant.

### P2

| N° | Constat | Preuve | Correction |
|---|---|---|---|
| **SEC-2** | La double authentification qu'un propriétaire, une agence ou un artisan active n'est jamais demandée à la connexion. Seuls le rôle de supervision et `/relais` vérifient le niveau du second facteur. L'écran promet pourtant « elle sera demandée à chaque connexion ». **Vérifié par le code**, non rejoué dans un navigateur. | `src/proxy.ts:300`, `src/lib/mfa.ts:3-5`, `src/app/compte/second-facteur.tsx:145` | Rediriger vers `/securite` toute session dont le niveau suivant est aal2 et le niveau actuel aal1. À défaut, retirer la promesse. |
| **SEC-3** | Aucun antivirus sur les dépôts. Les PDF de locataires et d'artisans sont visibles sans analyse. Les contrôles de type et de taille existent et sont bons. | `docs/antivirus-depots.md` (« Aucun antivirus n'est actuellement connecté ») ; page Santé « Antivirus à connecter » | Mettre les fichiers en quarantaine et les analyser avant création de la fiche ; le plan décrit dans `docs/` convient. |
| **SEC-4** | Pas de CAPTCHA ni de limitation par compte à la connexion côté application. Cela dépend des réglages Supabase Auth, non lisibles depuis le dépôt et non vérifiés. | `connexion/formulaire-connexion.tsx:101` | Activer le CAPTCHA Supabase et les limites de connexion, la longueur minimale et la protection contre les mots de passe divulgués côté Auth. |
| **SCI-2** | La fiche de la société naît sans e-mail ni adresse, alors que le profil les contient. Le récapitulatif du bail affiche « Adresse du propriétaire / e-mail des parties à compléter ». La quittance, elle, reprend l'adresse du profil. | `sci2-22-bail-recap`, `sci2-14-fiche-sci` | Recopier les coordonnées du profil sur la fiche de la société à sa création. |
| **COM-1** | Aucun médiateur de la consommation désigné : la page des mentions légales indique « adhésion à venir ». | page publique `/mentions-legales` | Adhérer avant toute vente à un particulier : obligation du Code de la consommation, **à valider juridiquement**. |
| **COM-2** | Paiement Stripe jamais exercé en réel : 0 abonnement et 8 événements d'abonnement en base. La vérification de signature du webhook est correcte dans le code. | base, revue de code | Faire une souscription réelle de bout en bout, avec remboursement, avant l'ouverture des ventes. |

### P3

| N° | Constat | Correction |
|---|---|---|
| **TEC-1** | Next 16.4.2 a des avis modérés (`use cache`), non exploitables ici. | Passer en 16.4.6 lors d'une prochaine livraison. |
| **TEC-2** | Écart de nommage du registre des migrations (511 versions pour 514 fichiers). | Documenter l'équivalence des noms, comme c'est déjà fait pour quatre autres. |
| **TEC-3** | `/api/sante` révèle aux anonymes le SHA complet et l'absence éventuelle de la clé de service. Le webhook Stripe nomme les variables manquantes. | Réponse générique ; détail dans les journaux du serveur. |
| **TEC-4** | Le webhook Zoho n'a pas de protection anti-rejeu. L'effet se limite à une resynchronisation. | Dédoublonner par `request_id`. |
| **TEC-5** | L'export comptable renvoie le texte d'erreur de PostgREST pour des dates invalides. La colonne « annulé » du CSV n'est pas échappée (injection de formule possible). | Valider les dates ; passer par `champ()`. |
| **TEC-6** | La variable `RESEND_WEBHOOK_SUIVI_SECRET` attendue par `/api/resend/suivi` est absente en production : cette route répond donc 503. Le suivi de délivrance fonctionne quand même (32 courriels « livrés » en 14 jours, par une autre voie). | Configurer le secret, ou retirer la route. |
| **SCI-3** | La quittance d'une SCI dit « Je soussigné(e) SCI … » sans nommer la personne qui signe pour la société. | Ajouter « représentée par … » ; **à valider juridiquement**. |
| **SEC-5** | La sonde des 419 fonctions n'a trouvé aucun contournement. Limite : 210 fonctions sur 327 ont reçu au moins un identifiant fictif, faute de donnée réelle chez la victime du banc. | Étoffer les données du banc et rejouer la sonde (`preuves/securite/fuzz-definer.mjs`). |

---

## E. Points restés ouverts

| # | Point | État au 19/11, 15 h UTC |
|---|---|---|
| 1 | **Alerte quotidienne du dirigeant** | ❌ 8 échecs consécutifs, du 12/11 au 19/11. Le destinataire a été corrigé et déployé le 19/11 vers 11 h 28 UTC. **Non vérifiable** avant le 20/11 à 04 h 00 UTC. Contrôle programmé à 04 h 15 UTC. |
| 2 | **Suppression des 19 fichiers fictifs** | ⏸ Toujours en file (`deleted_at` vide) ; la purge passe le 20/11 à 03 h 40 UTC. S'y ajoutent les 7 fichiers du parcours SCI d'aujourd'hui, soit 26 en file. **Non vérifiable aujourd'hui.** |
| 3 | **Parcours SCI après #346** | ⚠️ Réparé pour le nom de l'espace, la fiche titulaire et la détention. Bloqué au représentant (SCI-1). |
| 4 | **Échecs de la recette** | ✅ La recette n° 51 sur 341b770f est un succès complet. |
| 5 | **Intégrations** | Voir le tableau ci-dessous. |
| 6 | **Publication marketing du 20/11** | Article « Vous suivez encore vos loyers dans un tableur ? » : statut `programmee` pour le 20/11 à 08 h 00 UTC. Validation explicite vide (`valide_le` nul). Diffusion Facebook non prévue (`facebook_a_diffuser = false`). Il paraîtra sur le site sauf veto. |

### Services externes

| Service | État |
|---|---|
| **E-mail (Resend)** | **Fonctionne réellement** : 32 courriels livrés en 14 jours, et l'inscription réelle d'aujourd'hui vers une boîte de test. Les envois automatiques au locataire (relances, avis) sont **désactivés** par choix en pilote. |
| **Stockage (Supabase)** | **Fonctionne réellement** : dépôts, liens signés de 60 s, purge de nuit. Mais voir SEC-1 et SEC-3. |
| **Signature électronique (Zoho Sign)** | **Active en production** (`ZOHO_SIGN_BAIL_ACTIF`, `DOCUMENTS`, `DEVIS`). Un seul circuit de bail « terminé » en base. Non rejouée aujourd'hui, car un envoi réel serait engageant. |
| **Paiement (Stripe)** | **Fermé**. Clés présentes, 0 abonnement. Webhook signé dans le code. **Jamais exercé en réel.** |
| **Recommandé (AR24)** | **Désactivé ou non configuré** : 0 connexion, 0 recommandé, aucune variable AR24 en production. |
| **Facebook (Meta)** | **Fonctionne** : une publication diffusée le 18/11. |
| **IA (OpenAI)** | Clé présente. Usage de l'assistant non testé aujourd'hui. Sous-traitant à faire figurer dans la page de confidentialité ; c'est le cas (3 mentions), **à valider juridiquement**. |

---

## F. Plan d'action

### Avant le pilote des 10 particuliers

1. **SEC-1** : lier le chemin du fichier à l'organisation, et le contrôler dans la conservation, la lecture du
   locataire et la purge. Correctif court, à tester sur le banc avec `preuves/securite/*.sql`, qui doivent alors
   renvoyer 0.
2. **OPS-1** : constater le 20/11 l'arrivée de l'alerte. Si elle échoue encore, prévoir un second destinataire ou une
   alerte visible dans la console.
3. **Point 2** : constater le 20/11 la suppression physique des 26 fichiers.

### Avant d'accueillir une SCI

4. **SCI-1** : prénom demandé à l'inscription SCI, ou cause exacte affichée ; fiche de la gérante modifiable sans
   adresse.
5. **SCI-2** : recopier sur la fiche de la société les coordonnées du profil.

### Avant la commercialisation payante

6. **COM-1** : adhérer à un médiateur de la consommation, puis faire valider juridiquement les CGU, CGV et la page de
   confidentialité (sous-traitants, transferts hors UE, IA).
7. **COM-2** : souscription Stripe réelle de bout en bout, puis remboursement.
8. **SEC-3** : antivirus avec quarantaine.
9. **SEC-2** : double authentification exigée dès qu'elle est activée.
10. **SEC-4** : régler et vérifier Supabase Auth (CAPTCHA, limites de connexion, mots de passe divulgués).
11. **OPS-1** : alerte de secours.
12. **AR24** : à configurer et tester, ou à retirer de toute promesse commerciale.

### Peut attendre, sans bloquer

- Toutes les anomalies P3 : TEC-1 à TEC-6, SCI-3, SEC-5.

---

## G. Ferais-je confiance à Gerimmo pour mes appartements ?

**Pour des appartements en nom propre : oui, avec une réserve courte.**

- **Ce qui marche** : les gestes qui comptent pour l'argent sont justes et prudents.
  - Une quittance n'existe qu'au solde.
  - Un paiement partiel donne un reçu.
  - Le locataire ne peut rien encaisser lui-même.
  - Le DPE est exigé avant de louer.
  - Les plafonds de dépôt sont appliqués.
- **L'isolation entre clients** est bien gardée dans la base : 419 fonctions attaquées sous deux profils, aucune n'a
  cédé.
- **L'exploitation est sérieuse** : sauvegarde et restauration exercées, migrations sous garde, recette de production
  verte.
- **La réserve, SEC-1** : un utilisateur qui connaît le chemin d'un de mes fichiers pourrait le faire supprimer depuis
  son propre espace. Le risque est faible en pratique, mais il touche l'intégrité de mes baux signés. Je voudrais ce
  correctif avant de déposer mes documents.

**Pour une SCI : pas encore.** Je bloquerais au premier bail, sur un message qui ne me dirait pas pourquoi. Je ne
saurais pas, seul, que c'est le prénom de ma gérante qui manque.

**Pour payer un abonnement : pas encore.**
- Aucun paiement n'a jamais été fait en réel.
- Il n'y a pas de médiateur en cas de litige.
- La double authentification que j'activerais ne me protégerait pas.
- Le fondateur ne reçoit pas, depuis une semaine, l'alerte qui lui dirait qu'un traitement a échoué.

Rien de cela n'est une refonte : ce sont des correctifs précis et des vérifications à faire une fois.

---

## H. Données de test et confidentialité

**Créé en production, avec l'accord du dirigeant** :
- **Recette n° 51** : comptes éphémères purgés par le workflow ; 0 compte « recette » restant.
- **Parcours SCI** :
  - 1 compte fictif `delivered+audit-sci-341b-20261119@resend.dev` et 1 espace ;
  - 3 fiches, 1 bien, 1 bail, 2 encaissements, 1 quittance ;
  - 7 fichiers PDF fictifs (statuts, diagnostics, bail papier).

**Supprimé le 19/11, juste après le parcours**, avec la logique de `e2e/recette-production/purger.sql`, et ses
garde-fous. Vérifié après :
- 0 compte, 0 espace et 0 fiche d'audit ;
- totaux revenus à l'état de départ : 10 comptes, 6 espaces, 13 biens, 11 baux, 51 documents, 0 encaissement ;
- ventes toujours fermées.

**Fichiers** : les 7 PDF sont dans la file `purge_fichiers`, purgée chaque nuit à 03 h 40 UTC.

**Secrets** :
- Le mot de passe de test a été généré localement et transmis uniquement sous forme de hachage, puis détruit avec les
  sessions.
- Un premier mot de passe généré s'est affiché dans une erreur de mon terminal. Il a été jeté avant toute création de
  compte.
- Les jetons de confirmation et de récupération, lus en base pour simuler le clic dans le courriel, ont été consommés
  puis effacés. Ils ne figurent dans aucune preuve.

**Données personnelles** : ce rapport n'en contient aucune.
