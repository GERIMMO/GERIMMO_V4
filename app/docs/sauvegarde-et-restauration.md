# Sauvegarder les fichiers et remettre Gerimmo en service

Les sauvegardes quotidiennes de la base Supabase ne contiennent pas les fichiers déposés : contrats, photos et justificatifs doivent avoir leur propre copie. Source : https://supabase.com/docs/guides/platform/backups.

## Ce qui est prêt

Le programme `scripts/sauvegarde/fichiers.mjs` copie tous les espaces de stockage accessibles, y compris les dossiers et les listes de plus de 100 fichiers. Chaque fichier et le manifeste sont chiffrés avec AES-256-GCM. Le manifeste conserve les noms, tailles, types, empreintes SHA-256 et paramètres des espaces. Aucun secret de connexion n'est inclus. Le bilan affiché ne contient que des nombres.

Le programme refuse d'écraser une archive ou un dossier restauré. Il interrompt la sauvegarde si l'inventaire change pendant la copie. Les fichiers de plus de 64 Mo demandent un export adapté : ils provoquent un arrêt explicite, jamais une archive annoncée complète. Une archive n'est complète que si son manifeste existe et que la vérification réussit.

La clé de chiffrement doit rester dans un gestionnaire de secrets séparé de la copie. Sans cette clé, les fichiers ne pourront pas être récupérés. Le dossier chiffré doit être transféré vers un stockage privé indépendant, avec conservation de plusieurs versions. Ne pas enregistrer de copie déchiffrée dans GitHub, Vercel, un dossier public ou une sauvegarde synchronisée non autorisée.

## Préparer la première sauvegarde réelle

1. Choisir un stockage privé indépendant et une durée de conservation ; nommer les personnes autorisées à restaurer.
2. Fournir au programme, par le gestionnaire de secrets, `GERIMMO_BACKUP_SOURCE_URL`, `GERIMMO_BACKUP_SERVICE_KEY` et `GERIMMO_BACKUP_KEY` (32 octets aléatoires, représentés par 64 caractères hexadécimaux). Ne jamais passer la clé dans les arguments de commande, les journaux ou le dépôt.
3. Réserver une période sans modification des documents, et relever l'heure de la sauvegarde de la base. Les deux copies doivent correspondre ; l'export de fichiers n'est pas une capture instantanée de la base.
4. Depuis `app`, lancer `node scripts/sauvegarde/fichiers.mjs sauvegarder /dossier/prive/archive-neuve`, puis `node scripts/sauvegarde/fichiers.mjs verifier /dossier/prive/archive-neuve`.
5. Transférer uniquement le dossier chiffré vers la destination autorisée, vérifier de nouveau la copie transférée, conserver la date et le nombre de fichiers. Programmer cette procédure après le premier essai réel réussi. Un échec doit avertir le responsable ; ne jamais remplacer la dernière copie saine.

## Exercice de restauration

1. Utiliser un projet de secours et un dossier local neuf, jamais la production pour le premier exercice. Désactiver les tâches programmées et les connexions d'envoi, paiement, signature et publicité avant tout démarrage du projet de secours.
2. Restaurer la base et ses règles d'accès suivant la procédure officielle Supabase. Conserver la version du code et les migrations correspondant à la sauvegarde. Vérifier les rôles et les secrets du projet de secours avant d'ouvrir les accès.
3. Vérifier l'archive puis lancer `node scripts/sauvegarde/fichiers.mjs extraire /dossier/prive/archive /dossier/prive/restauration-neuve`. Les données déchiffrées sont alors sensibles : accès limité et suppression après l'exercice.
4. Importer les fichiers du dossier restauré dans les espaces du projet de secours, en conservant leurs chemins, types, propriétaires et règles d'accès de la base. Le manifeste est un inventaire ; il ne remplace pas la sauvegarde des propriétaires des fichiers ni des règles d'accès. Ne pas rendre publics les espaces privés. Ne pas activer de remplacement automatique de fichiers existants.
5. Comparer le nombre de fichiers, leurs tailles et leurs empreintes ; ouvrir un bail, une quittance, une photo d'incident et un justificatif artisan. Tester le refus d'accès depuis une autre agence, un locataire et un artisan non concernés.
6. Faire les essais métier et relever la durée de remise en service. Le responsable autorise ensuite une éventuelle bascule du domaine. Réactiver les traitements un par un en vérifiant qu'aucun e-mail, paiement ou publication n'est envoyé deux fois.

## Preuve actuelle et limite

Le test automatique copie puis restaure 205 fichiers fictifs répartis dans un sous-dossier. Il contrôle la pagination, les octets récupérés, la mauvaise clé, l'archive altérée, les chemins sortants, les changements pendant la copie et le refus d'écrasement. Il ne constitue pas un exercice de restauration du projet Supabase réel. La destination indépendante, la programmation et l'exercice complet restent à configurer avec leurs accès.
