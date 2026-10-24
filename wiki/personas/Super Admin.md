---
type: persona
tags: [role, plateforme]
status: in-progress
created: 2026-07-21
updated: 2026-10-24
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]", "[[Fiches des anomalies P3 — audit du 13 octobre 2026]]", "[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-12-documents-et-ged]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]", "[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "[[2026-09-28-decision-tarification]]", "[[2026-09-28-reseau-national-ouvertures-locales]]"]
---

# Super Admin

**En une phrase :** administrateur de la plateforme GERIMMO elle-même (l'éditeur),
au-dessus de toutes les [[Organisation|organisations]] clientes.

Nom technique : rôle `super_admin` (scope `global`) + drapeau `profiles.is_super_admin`.
Fonction SQL `is_super_admin()` qui court-circuite quasi toutes les policies RLS.

## Rôle et objectifs
- Superviser l'ensemble du réseau (toutes organisations).
- Piloter le business : abonnements, revenus, paiements, offres, codes promo.
- Valider les nouveaux entrants ([[Artisan|artisans]]) et administrer le système.

## Responsabilités / activités
- Gestion des agences, propriétaires, artisans ; **validation des artisans** (réservée).
- Imports de biens/utilisateurs ; statistiques (croissance, acquisition, rétention).
- Support (bugs, idées), communication (articles, alertes), système (bots, sécurité,
  journal d'audit, centre IA).
- Supervision/**impersonation de tous les types de personas** (précision humaine, 2026-07-22) :
  il peut se mettre à la place d'une agence, d'un [[Propriétaire bailleur]], d'un [[Artisan]],
  d'un [[Locataire]] — de n'importe quel persona (console dédiée `/admin/*`).

## Import en masse du parc (référentiel V3 — parcours 0.12)
« **Parcours décisif commercialement** : aucune agence ne migre si elle doit ressaisir
300–800 lots à la main — sinon le produit est invendable. » Réservé au super admin
(RM-0.12.9 ; l'admin agence a le 16.3 pour les ajouts ponctuels) :
- gabarit Excel **à format imposé** (décision actée), 9 feuilles importées dans l'ordre
  des dépendances (personnes → biens → lots → détentions → clés → diagnostics →
  mandats → baux en cours → soldes de départ) ;
- **import à blanc** (contrôles sans écriture), prévisualisation avec compteurs,
  exécution en **transaction atomique** (RM-0.12.1), > 20 % de lignes en erreur =
  refus en bloc (RM-0.12.4) ;
- chaque donnée porte l'**identifiant de son import** → **annulation complète**
  possible tant que rien n'a été modifié (RM-0.12.6/7) ; rapport conservé **3 ans**
  (aligné sur le journal d'audit — décision du 2026-07-25, corrige l'« indéfiniment »
  contraire à RM-A2.2).
- Connecteurs vers les logiciels concurrents : reconsidérés en V2 (argument commercial).

## Administration V3 (module 18)
- **Console de supervision unique** : indicateurs (agences actives/essai/suspendues,
  lots gérés = base de facturation, volumes) et **six files d'attente** (demandes de
  modèles, contestations de notes, modèles WhatsApp, bugs, correctifs, idées).
- **Facturation (18.6)** : comptage automatique des lots sous mandat au dernier jour
  du mois → Stripe prélève et facture ; échec → relance puis **suspension en lecture
  seule** (export toujours possible), résiliation → **archivage jamais suppression**,
  réactivation par lui seul. *Le modèle V3 « paliers + mise en route + mensuel +
  redevance annuelle » est **supplanté le 28/09/2026*** : particuliers Solo /
  Bailleur / Investisseur / Patrimoine (5,99 € à 29,99 € TTC/mois, annuel à deux
  mois offerts), agences 39 € HT jusqu'à 10 lots puis tranches cumulatives, aucun
  bien offert, essai de 2 mois (depuis le 30/09/2026 ; 14 jours avant) puis gel en lecture seule, franchise en base de TVA —
  voir [[Grille tarifaire]], [[Abonnement]], [[2026-09-28-decision-tarification]].
- **Réseau d'artisans** : du 28/09/2026 à la mise en production de la migration
  `20261023180000` (23/10/2026, vers 20 h 25 UTC), il ouvre et ferme le réseau **commune × métier** dans Supervision →
  Couverture (`/admin/couverture`) et rattache les artisans aux communes. **Décision du
  23/10/2026** (en production depuis le 23/10) : il n'ouvre ni ne rattache plus
  rien ; chaque artisan choisit sa zone et ses métiers, et il est proposé dès que le super
  admin a **validé son inscription** (SIRET vérifié, justificatifs relus — la zone déclarée
  s'affiche dans l'écran de validation) et qu'il est public. La Couverture devient une
  lecture (artisans proposés et déclarés par commune, intérêts signalés, demandes). Pour
  écarter un artisan du réseau : « Suspendre la validation » sur sa fiche (la liste noire
  globale existe en base, mais aucun écran ne la pose). Les changements de zone et de
  métiers des artisans se lisent dans le journal d'audit (Historique et sauvegardes) —
  voir [[Ouverture du réseau d'artisans]].
- Met à jour les **seuils légaux** des alertes (RM-14.2.5) et crée les agences (16.1).
- **Création manuelle de tout profil** *(décision du 2026-08-19)* : au-delà des
  agences, il peut créer **n'importe quel profil à la main**, y compris un
  [[Propriétaire bailleur]] (compte + organisation `independent_owner`) —
  l'auto-inscription en ligne du PD est la **voie normale**, la création par le
  super admin la **voie de secours/support**.
- **[[Retours utilisateurs]]** (module 20) : trie les signalements (bug /
  incompréhension / idée — réponse dans tous les cas), **transmet les bugs confirmés
  au suivi technique sans jamais corriger depuis l'administration** (RM-20.3.1/2 —
  « il pilote le produit, pas le code »), anime la **revue mensuelle des idées**
  (classement auto, trois statuts jamais le rejet) et publie les articles.

## Autres prérogatives V3
- **Modèles de documents** (module 12) : les modèles sont **figés** — c'est lui qui
  valide et génère tout modèle propre demandé par une agence (vérification des
  mentions obligatoires) et met à jour les modèles réglementaires pour toutes.
- **Blacklist globale d'artisan** (module 8) et **arbitrage des contestations de
  note** (module 11 — accès exceptionnel au détail, tracé).

## Sécurité : le rôle le plus contraint (A4, 2026-07-24)
Le compromis de son compte exposerait **toutes les agences** — d'où le régime le plus
strict du [[Socle de sécurité]] : **MFA obligatoire** (RM-A4.1, bloquant — seul rôle
où il l'est), session la plus courte (**30 min d'inactivité / 8 h absolu**), toute
**traversée d'agence journalisée** (RM-A1.11, audit 3 ans). Il pilote la **chaîne
d'incident de sécurité** (qualification 2 h, confinement 4 h, information des agences
sans délai) et décide des **restaurations** de sauvegarde (plateforme entière, ou une
agence/une table sur demande — [[Plan de reprise d'activité]]).

## Permissions clés
- Accès total : `is_super_admin()` bypass global sur SELECT/INSERT/UPDATE/DELETE.
- **Seul** habilité à valider/refuser un artisan (`artisan_validations`).
- **Seul** habilité au `DELETE` réel des données métier (les autres archivent).

## Relations
- Chapeaute [[Administrateur d'agence]], [[Propriétaire bailleur]] indépendants et [[Artisan|artisans]].
- Voir [[Modèle de rôles et permissions]], [[Isolation multi-organisation]].

> [!warning] Points à trancher / contradictions
> - `docs/02-roles-permissions.md` liste des rôles fictifs (Gestionnaire, Collaborateur,
>   Lecteur…) absents du code. La vérité = 6 rôles du `seed.sql`.
>

## Décision — super admin transverse (2026-09-09)

Décision de Tahir : son compte est le seul super admin et porte **toutes les
autorisations** — le super admin est réputé porter tous les rôles gérants
dans toutes les organisations (fonction `org_ids_avec_roles`), il entre dans
chaque espace avec les pleins pouvoirs du lieu et « Mes espaces » lui liste
toutes les organisations en supervision. Cette écriture totale déroge au
« régime le plus strict » du référentiel ; la compensation est la
**journalisation systématique** de la traversée (RM-A1.11) : chaque entrée
d'espace (`traversee_espace`) et chaque action de gérance hors adhésion
(`traversee_action`) écrit une ligne `audit_log` via `log_sa_access`, et la
consultation de pièces reste tracée (`acces_pieces_log`). Il figure aussi
dans les listes de gérants (alertes, incidents) sous le rôle « super_admin ».

## Ce que fait le code aujourd'hui : relais, arrêt, plafond IA, recherche (relevé du 16/10/2026)
La console `/admin/relais` (« Relais en mon absence », aussi appelée « Relais et arrêts »
dans les liens) réunit : qui prend le relais, vacances et arrêts, l'alerte e-mail du relais,
les appels payants à l'IA, l'arrêt avant les prochains effets.
- **Relais du dirigeant** (D46-B, partie alerte, PR #192, fusion `a722f94`, en production
  depuis le 16/10) : e-mail quotidien à 5 h (Paris) s'il y a quelque chose à signaler,
  e-mail immédiat des urgences du mode vacances (passage toutes les 10 minutes), vers deux
  adresses fournies par le dirigeant, gardées hors du dépôt ; l'écran n'en montre que la
  forme masquée. Détail : [[Relais du dirigeant]].
- **Arrêt d'urgence** (D06-A, vague 2, PR #182, en production depuis le 15/10) : il couvre
  neuf des dix tâches `pg_cron` ; la dixième, `relais-urgences`, ne l'est pas, à dessein
  (`app/docs/sauvegarde-et-restauration.md`).
- **Plafond des appels payants à l'IA** (X19, PR #190, fusion `f93ec6e`, depuis le 15/10) :
  avant chaque appel payant, **gestes manuels compris**, Gerimmo consulte l'arrêt d'urgence
  puis une limite quotidienne comptée au jour de Paris : **50 appels par jour par défaut**,
  réglable de 0 à 1 000 (0 coupe tout) par le superviseur permanent avec double
  vérification ; le réglage est journalisé. Sept usages comptés : étude de la veille,
  rédaction d'un post, visuel d'un post (tâches planifiées), rédaction assistée d'un article,
  analyse du brief, lancement de l'atelier (console), et la proposition de devis préparée
  pour un artisan. Un appel parti compte, même s'il échoue ; sous arrêt ou limite atteinte,
  l'appel n'a pas lieu et l'écran le dit. C'est une limite d'appels, pas de dépense.
- **Recherche par référence** (X18, PR #190, depuis le 15/10) : la fenêtre de recherche de
  la console retrouve un bien, un lot ou un incident par sa **référence exacte**
  (identifiant complet, numéro d'incident complet comme « INC-2026-0003 », nom complet d'un
  bien ou d'un lot) ; une référence partielle ne trouve rien. Le résultat ne dit que le type
  d'objet et l'organisation (au plus huit lignes) et mène à la **fiche de l'organisation**,
  jamais à la donnée : entrer dans l'espace reste la traversée tracée (D08). Chaque
  recherche est tracée au journal d'audit ; réservée au superviseur actif en second facteur.

> [!warning] Non vérifié / points à trancher (relevé du 16/10/2026)
> - La recette de production n'a aucun parcours de super-administrateur : ni l'écran du
>   relais, ni la recherche par référence, ni le réglage du plafond IA ne sont joués
>   (constat du tour final de vérification). Aucun e-mail du relais n'a encore été reçu.
> - X19 : une seule limite, en nombre d'appels, pour tous les usages ensemble, ni par usage
>   ni en euros (`app/src/lib/plafond-ia.ts`, migration `20261014730000`), alors que la
>   fiche SA-10 ([[Fiches des anomalies P3 — audit du 13 octobre 2026]]) attendait « un
>   plafond (appels ou coût) » ; le défaut de 50 repose sur une estimation écrite dans le
>   code (« l'usage normal en fait une dizaine »), pas sur une mesure ; le lancement de
>   l'atelier (modèle appelé par GitHub) est compté. Aucune source ne dit si le dirigeant
>   veut une autre forme de limite.
> - X18 : le code prend pour référence d'un bien son nom complet (sa « référence
>   interne », migration `20261014720000`) ; ni la fiche SA-09 ni la décision X18 ne disent
>   ce qu'est la référence d'un bien. À faire confirmer au dirigeant.

> [!warning] Changement du 23/10/2026 — réseau d'artisans
> - Le super administrateur n'ouvre plus le réseau commune × métier et ne rattache plus
>   les artisans aux communes : chaque artisan choisit sa zone et ses métiers (décision du
>   dirigeant). Il garde la validation de l'inscription et sa suspension ; la liste noire
>   globale existe en base sans écran pour la poser ; aucun levier par commune (à trancher
>   si besoin). Migration `20261023180000`,
>   appliquée en production le 23/10 ; [[Ouverture du réseau d'artisans]].


## Simplification de la console — publiée le 24 octobre 2026

À la demande du dirigeant, huit rubriques et leurs fiches liées sont réorganisées : décisions, utilisateurs, vacances/relais, améliorations du produit, santé/connexions, sécurité/conformité, historique/sauvegardes et paramètres.

- Les informations utiles restent au premier niveau ; les détails, anciennes périodes et procédures se déplient à la demande.
- Une couleur douce et une icône distinguent chaque groupe ; les statuts restent écrits. Une lecture indisponible ne devient pas un état sain.
- Les liens directs ouvrent la rubrique ciblée. Un champ invalide caché est révélé avant correction. Replier une rubrique conserve tous les champs du formulaire.
- Les coordonnées publiques sont regroupées en contact/entreprise, médiateur et prestataires. Les durées de conservation restent sur leur écran dédié.
- Les droits, validations et confirmations ne changent pas. Le diagnostic du portail artisan est décrit comme une consultation en lecture seule, conformément au contrôle déjà appliqué.

Contrôles et statut de publication : entrée correspondante dans `log.md`. Cette réorganisation ne change aucune règle métier.
