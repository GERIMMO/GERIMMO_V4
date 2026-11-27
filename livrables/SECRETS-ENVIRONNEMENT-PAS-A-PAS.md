# Isoler les secrets Supabase et vérifier la restauration

Procédure du dirigeant pour AUD-022 et la réserve N10. Fixer par écrit la date et le créneau de bascule dans la PR. Prévoir les deux relectures de sécurité, dont celle de Claude, et vérifier que la CI est verte sur la tête exacte de la PR. Faire les opérations dans le même créneau, en dehors d’une sauvegarde ou d’une migration en cours.

| Environnement GitHub | Branche autorisée | Approbation | Secrets Supabase |
| --- | --- | --- | --- |
| `gerimmo-donnees` | `main` | Aucune, aucun délai | `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` |
| `gerimmo-production` | `main` | Approbation du dirigeant | `SUPABASE_DB_PASSWORD` |

## 1. Préparer GitHub avant la fusion

1. Ouvrir [GERIMMO/GERIMMO_V4](https://github.com/GERIMMO/GERIMMO_V4). Cliquer **Settings**, **Environments**, **New environment**. Saisir `gerimmo-donnees`, puis cliquer **Configure environment**.
2. Dans **Deployment branches and tags**, choisir **Selected branches and tags**, puis **Add deployment branch or tag rule**. Sélectionner **Branch**, saisir exactement `main`, puis cliquer **Add rule**. Vérifier que la liste contient uniquement cette règle de branche, sans règle de tag. Laisser **Required reviewers**, **Wait timer** et les protections personnalisées désactivés pour cet environnement.
3. Dans Supabase, ouvrir le projet **Gerimmo V4**. Cliquer **Settings** (roue dentée), **API Keys**, puis l’onglet des clés historiques **Legacy anon, service_role API keys**. Sur la ligne `service_role`, afficher la clé si nécessaire et la copier directement vers le champ **Secret** de l’étape suivante. La sauvegarde et la recette utilisent cette clé comme jeton serveur.
4. Dans GitHub, revenir sur `gerimmo-donnees`. Sous **Environment secrets**, cliquer **Add secret**. Saisir `SUPABASE_SERVICE_ROLE_KEY` dans **Name**, coller la valeur dans **Secret**, cliquer **Add secret**. Refaire le geste avec `SUPABASE_DB_PASSWORD` et le mot de passe actuel conservé dans le gestionnaire du dirigeant. Si le mot de passe actuel est indisponible, utiliser le nouveau mot de passe lors de l’étape 3, mettre à jour les deux environnements avant la fusion et garder les exécutions en attente le temps du geste.
5. Dans **Settings → Environments**, ouvrir `gerimmo-production`. Vérifier **Required reviewers**, le compte approbateur du dirigeant et la règle de branche `main`. Conserver les protections existantes. Si la restriction de branche manque, ajouter la règle **Branch → main** comme à l’étape 2. Sous **Environment secrets**, ajouter le même `SUPABASE_DB_PASSWORD` avec **Add secret**. Si le nom existe, utiliser **Edit → Update secret**. Vérifier leur présence par leur nom et leur date de mise à jour.
6. Dans **Settings → Secrets and variables → Actions → Secrets**, vérifier aussi la section **Organization secrets**. Si un des trois noms à retirer est fourni par l’organisation, ouvrir les réglages de l’organisation, **Secrets and variables → Actions**, ouvrir le secret, puis examiner **Repository access** et exclure `GERIMMO_V4` en tenant compte des autres dépôts concernés.

[Réglages des environnements GitHub](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) · [Clés API Supabase](https://supabase.com/docs/guides/getting-started/api-keys)

## 2. Relire les droits d’écriture

1. Dans le dépôt, cliquer **Settings → Collaborators & teams**. Examiner **Direct access** puis **Organization access**. Relever les personnes et équipes ayant **Write**, **Maintain**, **Admin** ou un rôle personnalisé équivalent. Dans l’organisation **GERIMMO**, ouvrir **Teams**, puis **Members** pour chaque équipe qui peut écrire. Vérifier les accès hérités sous **Settings → Member privileges → Base permissions**.
2. Dans le dépôt, ouvrir **Settings → Deploy keys** et relever les clés avec accès en écriture. Dans les réglages de l’organisation, ouvrir **Installed GitHub Apps**, puis **Configure** pour contrôler les installations qui couvrent ce dépôt et peuvent modifier son contenu ou ses workflows.
3. Sous **Settings → Rules → Rulesets** et **Settings → Branches**, vérifier la protection de `main`, les contrôles obligatoires et les personnes ou applications qui peuvent contourner ces règles. Faire confirmer chaque accès privilégié. Consigner la date, les accès confirmés et les retraits à décider dans le registre privé du dirigeant.

[Accès au dépôt GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository) · [Droits de base de l’organisation](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/setting-base-permissions-for-an-organization)

## 3. Basculer et faire tourner le mot de passe le même jour

1. Dans **Actions**, vérifier si **Sauvegarde quotidienne**, **Recette de production avec nettoyage** ou **Migrations Supabase** est en cours ou en attente. Attendre la fin et identifier les autres consommateurs du mot de passe PostgreSQL, y compris les connexions directes et via le pooler. Préparer leur mise à jour. Garder les workflows de production au repos pendant le changement.
2. Une fois la date autorisée et les deux environnements prêts, le dirigeant fusionne la PR. Vérifier que le workflow **Sauvegarde quotidienne** de `main` référence `gerimmo-donnees`. Effectuer ensuite la rotation dans le même créneau. Si le mot de passe actuel manquait, effectuer la rotation et renseigner les deux secrets immédiatement avant la fusion.
3. Dans Supabase, ouvrir **Gerimmo V4 → Database → Settings → Reset database password**. Générer un mot de passe dans le gestionnaire du dirigeant, le saisir et confirmer **Reset database password**. Mettre immédiatement le nouveau mot de passe brut dans GitHub, pour chacun des deux environnements, via **Settings → Environments → [environnement] → Environment secrets → SUPABASE_DB_PASSWORD → Edit → Update secret**. Mettre à jour les autres connexions PostgreSQL identifiées. Si le pooler rejette brièvement le nouveau mot de passe, attendre la propagation et vérifier de nouveau.
4. Dans GitHub, ouvrir **Settings → Secrets and variables → Actions → Secrets → Repository secrets**. Sur chacune des lignes `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` et `GERIMMO_BACKUP_SERVICE_KEY` encore présentes, cliquer **Remove** puis confirmer. Vérifier que les trois noms ont disparu à ce niveau. Les noms et valeurs restent distincts des réglages Vercel et de la clé de chiffrement des sauvegardes.
5. Vérifier le prochain passage planifié de **Sauvegarde quotidienne** dans **Actions**. Il doit démarrer sans validation, réussir et afficher la relecture distante du préfixe daté. Avant toute reprise de la recette et des migrations, contrôler leurs réglages dans GitHub. La recette réelle crée puis nettoie des comptes en production. La vérification de cette mission s’appuie sur le banc fictif et les réglages. Si la sauvegarde échoue, vérifier la règle `main`, les dates des deux secrets dans `gerimmo-donnees` et la propagation du nouveau mot de passe. Corriger dans les environnements et conserver la dernière copie saine. Ne pas recréer les secrets de dépôt.

La rotation du mot de passe PostgreSQL est indépendante des clés API. La clé de service historique reste celle du projet. Conserver les valeurs dans les champs secrets et le gestionnaire du dirigeant. [Rotation du mot de passe Supabase](https://supabase.com/kb/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB)

## 4. Exercice de restauration lancé par le dirigeant

1. Dans **Actions → Sauvegarde quotidienne**, ouvrir le dernier passage réussi. Relever son URL, son préfixe UTC et la preuve de relecture Scaleway. La sauvegarde doit être postérieure à la fin du lot du 25 novembre à 22 h 09 UTC. Le passage préalable `20261125-2201` est trop ancien. [Application des migrations du 25 novembre](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/45710263565)
2. Dans **Actions**, ouvrir **Vérifier la restauration de la sauvegarde réelle → Run workflow**. Choisir **main**, cocher **Vérifier les dossiers et pièces après les migrations du 25 novembre**, puis cliquer **Run workflow**. Le chantier prend le dernier préfixe disponible chez Scaleway. Il restaure dans un PostgreSQL 17 jetable et relit les fichiers extraits. Il contrôle leur empreinte, leur correspondance avec le catalogue et la présence de pièces rattachées aux dossiers reconstruits (bien, lot, bail et document dans le même espace).
3. Ouvrir le passage terminé, puis **Summary → Artifacts → bilan-restauration**. Ouvrir `bilan-restauration.json`. Comparer `sauvegarde` au préfixe relevé. Si un passage plus récent a pris sa place, rapprocher le préfixe de son propre passage de sauvegarde et de sa preuve de relecture. En cas d’échec ou de préfixe partiel, conserver le constat et établir la cause avant de conclure.
4. Remplir le compte rendu ci-dessous avec les nombres et les liens des passages. Conserver uniquement le bilan agrégé. Les copies déchiffrées et la base jetable sont supprimées par l’exercice. Le catalogue et les octets prouvent la récupération des pièces associées aux dossiers au niveau des données. La reconnexion via Supabase Auth, le téléchargement via son API Storage et l’ouverture dans Gerimmo exigent un essai séparé sur un banc applicatif hors production. Les tâches planifiées sont vérifiées sur un planificateur de façade.

### Compte rendu à remplir après exécution

| Preuve | Résultat |
| --- | --- |
| Dirigeant, date UTC, lien de l’exécution GitHub | À renseigner |
| Passage de sauvegarde, préfixe, date UTC du manifeste | À renseigner |
| Dernière migration restaurée exigée `20261125154000` | À renseigner d’après `dossiers_restaures.migration` |
| Tables et lignes restaurées, protections | À renseigner d’après `tables`, `lignes`, `protections` |
| Dossiers bien–lot–bail retrouvés, dossiers avec au moins une pièce restaurée | À renseigner d’après `dossiers_restaures.dossiers` et `dossiers_restaures.dossiers_avec_piece` |
| Pièces de dossier absentes, fichiers relus et fichiers manquants | À renseigner d’après `dossiers_restaures.pieces_manquantes`, `fichiers` et `fichiers_manquants` |
| Durée de l’exercice et état des tâches planifiées | À renseigner d’après `duree_secondes` et `taches_planifiees` |
| Verdict, écarts et portée | En attente d’exécution |

Le verdict est positif si le passage a réussi, si la copie est postérieure aux migrations, si au moins un dossier a une pièce reconstituée et si aucun fichier ni aucune pièce de dossier contrôlée ne manque. [Procédure de reprise complète](../app/docs/sauvegarde-et-restauration.md) · [Périmètre des sauvegardes natives Supabase](https://supabase.com/docs/guides/platform/backups)
