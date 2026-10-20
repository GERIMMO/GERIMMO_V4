# Sauvegarde et restauration — preuves du 27 septembre 2026

## Ce qui fonctionne réellement

La copie chiffrée de la base et des fichiers est déposée chaque jour chez Scaleway, à Paris, dans un compte distinct de Supabase. Le dépôt est relu après transfert. La conservation prévue est de 90 jours ; la règle de cycle de vie a été configurée par le porteur. Les secrets nécessaires existent dans GitHub et ne sont jamais copiés dans le dépôt.

- [Sauvegarde réelle du 27 septembre à 20 h 58, heure de Paris](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/36342460407) : succès, préfixe `20260927-1856`.
- [Restauration réelle du 27 septembre à 21 h, heure de Paris](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/36342665715) : succès. La copie a été téléchargée depuis Scaleway, déchiffrée et restaurée dans un PostgreSQL 17 temporaire.
- Résultat : **146 tables, 601 lignes et 1 fichier**. Aucun fichier manquant ou non référencé ; chaque fichier extrait a été relu et comparé à son empreinte. Les fonctions privilégiées ne sont pas exécutables par un visiteur anonyme, les tables publiques portent leur protection par utilisateur et les clés étrangères sont validées.
- Durée de l'étape de restauration : **6 secondes** sur ce petit volume. Ce chiffre ne mesure pas une remise en service complète de Gerimmo.
- La base temporaire et les fichiers déchiffrés ont été supprimés à la fin. Seul le bilan agrégé est conservé en artefact, sans donnée personnelle.

## Relancer le contrôle

Dans GitHub, Actions → **Vérifier la restauration de la sauvegarde réelle** → **Run workflow**, branche `main`. Le chantier prend la dernière copie chiffrée, sans écrire dans Scaleway, Supabase ni le site. Il refuse de remplacer une base existante et n'accepte qu'une base locale neuve nommée `gerimmo_restauration_…`.

Pour prendre une nouvelle copie avant l'essai : Actions → **Sauvegarde quotidienne** → **Run workflow**. Attendre sa réussite avant de lancer la restauration. Les deux exports (base et fichiers) ne constituent pas un instantané commun : pendant une activité d'écriture, une différence de catalogue doit être examinée et une nouvelle copie cohérente prise ; elle ne doit pas être ignorée.

**Avant une migration réelle (19 octobre).** Le chantier **Migrations Supabase** (`.github/workflows/migrations.yml`) refuse une application réelle (`simulation` décoché) si aucune « Sauvegarde quotidienne » n'a réussi depuis moins de 90 minutes. La preuve se lit dans la base elle-même, par la même connexion psql que l'application : `scripts/sauvegarde/age-derniere-sauvegarde.sql` rend l'âge de la dernière ligne `tech_log` de sauvegarde réussie (événement `tache_sauvegarde`, sans auteur, sans échec). Aucune entrée de contournement : si la garde refuse, lancer la sauvegarde à la demande, attendre son succès, relancer le chantier. En simulation, la garde informe sans bloquer. Le même chantier refuse aussi, par empreinte (md5 du fichier, octet pour octet, comparé au texte enregistré en base), un contenu déjà appliqué sous un autre numéro : c'est le cas des trois fichiers de la PR #202 (`20261017180829_supervision_finances.sql`, `20261018061548_supervision_complete.sql`, `20261018071556_supervision_index_relations.sql`), appliqués le 18 octobre hors du chantier et enregistrés sous les versions `20261018071151`, `20261018071200` et `20261018071811` ; ne jamais les nommer dans l'entrée `fichiers`.

## Programmes et protections

- `scripts/sauvegarde/base.mjs` : export PostgreSQL des schémas public, auth, storage, support_interne et supabase_migrations, au format custom, sans propriétaires mais **avec les droits et les commentaires**. Il exporte aussi **les tâches planifiées** (`cron.job`, voir plus bas) dans `taches-pg-cron.gcm`, chiffré, avec son empreinte au manifeste. Si la lecture de `cron.job` échoue (droit refusé, connexion), la sauvegarde échoue : une copie qui omettrait les tâches sans le dire ne se déclare pas réussie. Sur un projet sans pg_cron, la liste est vide et le manifeste le note.
- `scripts/sauvegarde/taches-planifiees.mjs` : lecture de `cron.job` (psql, mot de passe dans l'environnement du seul processus), validation de la liste et génération du script `rejouer-pg-cron.sql`.
- `scripts/sauvegarde/fichiers.mjs` : copie des fichiers, contrôle des tailles et des empreintes SHA-256.
- `scripts/sauvegarde/restaurer-archive.mjs` : exercice de la copie réelle, déchiffrement, import PostgreSQL, extraction des fichiers et contrôles de cohérence. Il rejoue aussi la liste des tâches sur un planificateur de façade (pg_cron et pg_net n'existent pas dans la base jetable) et le dit dans son bilan.
- `scripts/sauvegarde/exercice-restauration.mjs` : contre-épreuve sur données fictives, avec comparaison détaillée des tables, politiques, fonctions, déclencheurs, commentaires et droits dans le même instantané source. Le registre privé est refusé s’il manque, perd sa protection par utilisateur, devient accessible à anon/authenticated ou perd une de ses gardes essentielles. Elle reste exécutée dans les tests automatiques.
- `scripts/sauvegarde/age-derniere-sauvegarde.sql` : âge, en minutes, de la dernière « Sauvegarde quotidienne » réussie d'après `public.tech_log` (ligne `tache_sauvegarde` sans auteur et sans échec), rendu sous la forme « minutes|préfixe » (« -1| » si aucune n'est consignée). Lecture seule, jouée par psql dans le chantier « Migrations Supabase » pour la garde « Avant une migration réelle » ci-dessus.
- Chiffrement AES-256-GCM ; clé de 32 octets hors des archives. Un fichier supérieur à 64 Mo interrompt la copie.
- Planification quotidienne à 01:20 UTC ; la supervision signale un retard au-delà de 26 heures. Une planification GitHub peut être retardée par le fournisseur : consulter la dernière réussite, pas seulement l'horaire prévu.

Les copies prises avant la correction du 27 septembre ne contenaient pas les droits PostgreSQL : leur restauration exige de rétablir les permissions avant toute ouverture. Ne jamais utiliser `--no-privileges` lors de la restauration des copies récentes.

## Registre privé de support (16 octobre)

`support_interne` contient les intentions d’encaissement de support, leurs résultats et les permis transactionnels de la console. Ce schéma, ses trois tables, ses cinq fonctions et les déclencheurs qui les utilisent font partie de la sauvegarde. Il reste inaccessible à `anon` et `authenticated` après restauration ; seules les fonctions publiques prévues contrôlent l’accès du superadmin et son second facteur. Les droits du schéma, des tables et des fonctions sont comparés pendant l’exercice local, ainsi que les définitions et l’activation des déclencheurs.

Une intention expire après cinq minutes. Son registre suit la règle de conservation existante `journal:audit_log` (36 mois par défaut), purgée quotidiennement par `appliquer_retention()`. Les permis de maintenance ne vivent que dans leur transaction et sont supprimés avant le retour de la commande. Les identifiants d’auteur, d’organisation, de bail et d’appel sont des instantanés d’audit : ils ne bloquent pas la suppression légitime de ces objets ; le support revalide la présence de la cible avant toute exécution.

Les archives antérieures à cette migration ne portent pas ce schéma et restent lisibles. L’export exige la présence de chacun des schémas annoncés (`--strict-names`) : un schéma manquant fait échouer la sauvegarde avant toute archive. Une archive qui le déclare dans son manifeste mais ne le restaure pas est refusée. Une copie d’une base déjà migrée ne doit jamais être exportée avec seulement les trois anciens schémas.

Après [l’exercice réel réussi du 16 octobre](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38943437206), l’option qui retirait les commentaires PostgreSQL a été supprimée. Les nouvelles copies conservent ainsi la documentation des objets métier et de sécurité ; les anciennes ne peuvent pas restituer les commentaires qui n’avaient pas été sauvegardés.

## Procédure en cas d'incident

1. Suspendre les écritures concernées et les envois externes ; identifier la dernière copie saine et conserver la trace de l'incident.
2. Obtenir la clé de chiffrement et télécharger uniquement les archives nécessaires dans un environnement privé.
3. Exécuter l'exercice ci-dessus pour contrôler la copie, puis préparer **un projet Supabase de secours distinct**. Désactiver ses envois, paiements, signatures, publications et tâches métier.
4. Restaurer les schémas applicatifs et les droits en respectant les schémas gérés par Supabase. Réimporter les fichiers aux mêmes chemins, dans des compartiments privés, sans écraser de données existantes.
5. Vérifier les comptes, un bail, une quittance, une photo d'incident, les refus d'accès entre organisations et les parcours des profils. Comparer le catalogue des fichiers et contrôler les permissions.
6. Faire valider la bascule, changer les connexions du site, contrôler les parcours, puis reprendre progressivement les traitements. Conserver l'ancien environnement fermé en lecture tant que le contrôle n'est pas terminé.
7. **Au moment de la reprise des traitements, et pas avant : activer pg_cron et pg_net, puis rejouer les `cron.schedule`.** Une restauration ne recrée pas les tâches planifiées de la base (voir la section suivante) ; sans cette étape, plus aucun appel de loyer, plus d'alerte d'impayés, plus de rétention et plus de publication programmée ne partent, et rien ne le signale avant 32 jours. Dans l'ordre :
   1. Dans le projet restauré, activer les extensions `pg_cron` et `pg_net` (tableau de bord Supabase, Database → Extensions).
   2. Contrôler `public.declencheur_marketing` : `site_url` doit être l'adresse du site qui reprend, et `actif` doit refléter le choix voulu. La tâche `marketing-declencheur` appelle ce site avec le jeton restauré avec la base ; vers l'ancien site, elle déclencherait ses publications. Même contrôle pour `public.declencheur_relais_urgences` (tâche `relais-urgences`, toutes les 10 minutes) : vers un mauvais site, les urgences du relais ne seraient plus constatées que le matin, et l'e-mail de 5 h signalerait la tâche « sans passage ».
   3. Jouer `rejouer-pg-cron.sql`, produit avec la copie par `node scripts/sauvegarde/base.mjs extraire <dossier de la copie> <dossier neuf>` (il refuse de s'exécuter si `pg_cron` n'est pas activée). À défaut de ce fichier, les mêmes tâches se recréent en rejouant les `cron.schedule` des migrations (liste ci-dessous).
   4. Vérifier : `select jobname, schedule, active from cron.job order by jobname;` doit rendre les dix lignes.
   5. Rien ne rejoue ce qu'une tâche aurait fait pendant l'arrêt : le prochain cycle mensuel crée les appels de tous les mois manquants ; d'ici là, le bouton « Générer l'échéancier » de chaque bail (page du bail, rubrique loyers) rattrape un bail à la fois.
   6. **Si l'arrêt a couvert un 1er du mois**, ce rattrapage a un effet à surveiller : les avis d'échéance créés pour les mois manquants ont une échéance déjà passée, et la mission « Relances de loyers » (07:45 UTC, un quart d'heure après les avis, 07:30 UTC) les lit comme des loyers en retard. Sans précaution, un locataire peut recevoir le même matin l'avis d'échéance et une relance pour le même loyer. Pour l'éviter : garder la mission « Relances de loyers » arrêtée jusqu'à l'envoi des avis du rattrapage (écran « Relais et arrêts »), puis lever cet arrêt ; ou, pour une seule agence, lui faire décocher « Relancer automatiquement les loyers impayés par e-mail » (rubrique Profil) le temps du rattrapage. Une règle côté base (ne relancer un terme qu'après l'envoi de son avis) reste à décider ; elle n'est pas faite.

## Les tâches planifiées de la base (pg_cron)

Dix tâches SQL tournent dans la base, appelées par pg_cron (deux d'entre elles appellent le site par pg_net). Elles vivent dans `cron.job` (schéma `cron`), que `pg_dump` ne copie pas : depuis le 14 octobre 2026, la sauvegarde les exporte à part (voir plus haut). Heures en UTC, comme dans la base.

| Tâche | Horaire | Fonction appelée | Ce qu'elle fait |
|---|---|---|---|
| `retention-quotidienne` | tous les jours, 03:00 | `appliquer_retention()` | supprime ou anonymise ce dont la durée de conservation est échue |
| `alertes-diagnostics-quotidiennes` | tous les jours, 03:30 | `generer_alertes_diagnostics()` | alertes d'expiration des diagnostics |
| `alertes-assurance-quotidiennes` | tous les jours, 03:45 | `generer_alertes_assurance()` | alertes d'expiration des assurances |
| `alertes-restitutions-quotidiennes` | tous les jours, 04:15 | `generer_alertes_restitution()` | alertes de restitution du dépôt de garantie |
| `maintenance-artisans` | tous les jours, 04:30 | `maintenance_artisans_interne()` | passe à « expiré » les devis d'artisan dont la validité est dépassée |
| `cycle-mensuel` | le 1er du mois, 05:00 | `cycle_mensuel_interne()` | génère les appels de loyer du mois et les quittances qui en découlent |
| `alertes-impayes-quotidiennes` | tous les jours, 05:30 | `generer_alertes_impayes()` | alertes d'impayés |
| `propositions-publication-hebdo` | le lundi, 06:00 | `proposer_publications_interne()` | propositions de publication de la semaine |
| `marketing-declencheur` | toutes les 5 minutes, de 05:00 à 19:55 | `declencher_marketing()` | appelle le site pour préparer ou diffuser les publications (demande pg_net) |
| `relais-urgences` | toutes les 10 minutes, jour et nuit | `declencher_relais_urgences()` | appelle le site pour constater les urgences du relais et envoyer leur e-mail immédiat (demande pg_net ; jeton dans `declencheur_relais_urgences`) |

Ce qu'une restauration ne fait pas : elle ne recrée pas ces tâches ni les extensions `pg_cron` et `pg_net`. Sans l'étape 7 de la procédure, aucun signal immédiat ; c'est pourquoi l'écran **Santé** lit le dernier passage du cycle mensuel (ligne `cycle_mensuel` du journal technique) et passe en alerte au-delà de **32 jours** : un point bloquant, compté dans « À décider ». Un arrêt d'urgence qui couvre le cycle (arrêt global, « appels » ou « quittances ») l'affiche « suspendu » et non en retard.

L'arrêt d'urgence couvre neuf de ces dix tâches (migration `20261014200000`, table `supervision_taches_arret`) : voir l'écran « Relais et arrêts » pour le périmètre de chaque clé. La dixième, `relais-urgences`, n'est pas couverte, à dessein (table `supervision_taches_hors_arret`, migration `20261014812000`) : c'est une alerte au dirigeant, et l'arrêt fait partie de ce qu'elle signale.

## Ce qui reste à éprouver

**Les tâches planifiées.** L'export de `cron.job`, son chiffrement, sa vérification et le rejeu du script sont couverts par des tests automatiques sur base locale (export réel de la base d'essai, altération détectée, copies d'avant le 14 octobre toujours vérifiables, rejeu sans doublon sur un planificateur de façade). Ils ne remplacent pas un essai de restauration de la copie réelle de production avec ses tâches, ni l'exécution de pg_cron sur un projet de secours : **cet essai n'a pas été joué et reste à autoriser par le dirigeant** (décision D07). Tant qu'il ne l'est pas, l'étape 7 de la procédure est écrite et vérifiée sur banc, non éprouvée sur un vrai projet.

L'exercice du 27 septembre prouve la récupération de **la vraie base PostgreSQL et des octets des fichiers**. Il ne prouve pas la bascule des services Supabase Auth et Storage vers un projet de secours, la réimportation dans leur API, ni une remise en service en moins de quatre heures. Cet essai nécessite un projet de secours dédié ; aucun projet tiers existant ne doit être utilisé. Le plan Supabase Pro est visible, mais la restauration de ses sauvegardes natives n'a pas été exercée ici.

Les archives en clair ne doivent jamais être publiées ni jointes au rapport. La clé de chiffrement doit être conservée séparément dans un gestionnaire de secrets : perdre cette clé rend les copies inutilisables.

## Historique des migrations — 20 octobre 2026

Les nouvelles copies incluent `supabase_migrations.schema_migrations` : versions, noms et instructions appliquées. L’exercice local compare aussi l’empreinte de chaque ligne ; des versions identiques avec un contenu différent font échouer le contrôle. Une archive qui annonce ce schéma sans le restaurer est refusée. Les copies antérieures restent lisibles et leur bilan indique explicitement l’absence de cet historique.

Sur un projet de secours déjà initialisé par Supabase, comparer son registre à celui de la copie avant la bascule : ne pas fusionner ni écraser les versions automatiquement. Le contrôle local restaure dans une base vide et ne valide pas cette bascule des services.
