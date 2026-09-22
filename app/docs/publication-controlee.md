# Publication contrôlée et retour à la version précédente

Le contrôle est fourni dans GitHub, mais il n’est pas activé simplement parce que son fichier existe. Tant que Vercel attribue automatiquement les domaines à chaque arrivée sur `main`, cette publication directe contourne le contrôle préalable. La santé du site reste surveillée par les outils existants.

## Ce que fait le parcours fourni

1. Le développement isolé et la CI testent la modification. Le contrôle exige une exécution **CI réussie sur le SHA complet exact**, issue d’un push sur `main` du dépôt Gerimmo. Les résultats d’une branche, d’une demande de fusion ou d’un autre dépôt sont refusés.
2. Vercel construit une version avec les réglages de production, sans lui attribuer les domaines publics. C’est la version de prépublication, avec une adresse Vercel fixe.
3. Dans **Actions → Publication contrôlée Gerimmo**, le responsable indique la révision, la référence `dpl_…` et le numéro de la CI. Le mode initial vérifie seulement.
4. Le contrôle compare le projet, la branche, la révision, la santé de la version préparée et celle de la version actuellement publiée. Le compte rendu se trouve dans les résultats de l’exécution et son résumé.
5. La publication exige la validation GitHub du responsable et la confirmation que la base actuelle reste compatible avec la version précédente. Une migration destructive ou un changement de prestataire doit être examiné séparément ; ce circuit ne restaure jamais la base.
6. Après publication, trois contrôles successifs vérifient la révision complète et la connexion à la base sur le domaine public. En cas de trois échecs successifs, le contrôleur vérifie de nouveau la version initiale puis demande son rétablissement. Le résultat doit être confirmé avant de l’annoncer comme rétabli.

Une panne affectant aussi la version précédente, une publication concurrente ou une réponse incertaine arrête le retour automatique. L’API Vercel ne fournit pas ici une opération atomique « changer seulement si la version actuelle est X » : les publications doivent donc passer par cette file unique, sans publication manuelle concurrente. Une ultime lecture est faite immédiatement avant chaque changement. Ce mécanisme couvre les défauts de déploiement et de disponibilité mesurés ; il ne prouve pas à lui seul que chaque parcours métier est correct.

## Connexions à terminer une fois

- Protéger `main` et exiger la CI avant fusion. Les propositions de l’IA passent par une branche séparée, des tests puis une revue. Les modifications des contrôleurs de publication et des permissions méritent une revue spécifique.
- Dans Vercel, désactiver **Auto-assign Custom Production Domains** pour la branche de production. Conserver les anciennes versions : elles servent au retour. Ne pas remplacer ce réglage avant que le premier contrôle en lecture ait réussi.
- Créer l’environnement GitHub **gerimmo-production**, limité aux branches protégées, avec un responsable obligatoire et l’auto-approbation interdite. Le script refuse de publier si ces protections ne sont pas détectées. Leur disponibilité dépend du forfait et de la visibilité du dépôt.
- Dans cet environnement, enregistrer `VERCEL_TOKEN` (droits au projet concerné) et éventuellement `VERCEL_AUTOMATION_BYPASS_SECRET` pour tester les versions protégées. Ne jamais mettre ces valeurs dans le dépôt ni dans les entrées du formulaire.
- Renseigner les variables `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` si le projet dépend d’une équipe, puis `GERIMMO_RELEASE_ENABLED=true` après vérification des réglages.
- Le jeton GitHub fourni à l’exécution lit les résultats de CI, la révision et les protections d’environnement. Aucun jeton OpenAI n’est nécessaire à ce contrôleur : il ne développe pas le code.
- Déployer d’abord une version exposant `revision` complète sur `/api/sante`, puis utiliser une version ayant ce contrôle comme version de retour. Une ancienne version n’exposant qu’un code court ne suffit pas pour le contrôle exact.
- Relier ensuite le compte rendu GitHub aux propositions du centre de supervision. Le workflow produit `publication-resultats/rapport.json` et `rapport.md` ; il n’appelle pas lui-même la base pour déclarer une proposition publiée.

Aucun paiement, e-mail client, changement de données métier ni réinitialisation de base ne fait partie des essais. Le responsable garde la décision sur les opérations sensibles. Le travail de développement peut être repris par le suivi local de la tâche Gerimmo ; il dépend alors de la disponibilité de l’ordinateur et de la tâche. Cela ne transforme pas l’application en développeur autonome permanent.

## Sécurité du contrôleur

Le workflow est lancé manuellement depuis `main`. Il lit seulement les scripts de contrôle du commit du workflow, avec le jeton de lecture retiré après le téléchargement. Il ne télécharge ni n’exécute le code candidat, et ne restaure aucun cache ni résultat de test provenant d’une branche non fiable. Les secrets de publication ne sont fournis qu’à la commande de contrôle, après ses tests locaux. Les identifiants sont validés avant les appels ; les clés Vercel restent réservées à l’API Vercel, et le contournement de protection aux adresses fixes `*.vercel.app` vérifiées par les métadonnées du projet. Les redirections HTTP sont refusées.

Les actions GitHub utilisées sont fixées à leurs révisions. Une publication s’exécute à la fois. Le retour vise exclusivement la version qui était active au début du contrôle, avec sa révision complète, jamais une version devinée d’après la date. Le contrôleur ne retente pas aveuglément une promotion dont la réponse a été perdue.

## Vérification locale

Depuis `app` : `node --test scripts/deploiement/controle.test.mjs`. Tous les services sont remplacés par des simulations dans ces tests, notamment échecs, concurrence, mauvais projet, mauvais SHA, mauvaise CI, absence d’approbation, panne de base commune et réponse de promotion perdue.

## Documentation des prestataires consultée le 22 septembre 2026

- [Vercel : préparation et promotion d’une version](https://vercel.com/docs/deployments/promoting-a-deployment)
- [Vercel : retour à une version précédente](https://vercel.com/docs/deployments/rollback-production-deployment)
- [API de promotion](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment)
- [API de retour](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-previous-production-deployment-by-id)
- [API de lecture d’un déploiement](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url)
- [API de lecture de l’adresse publiée](https://vercel.com/docs/rest-api/aliases/get-an-alias)
