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

## Programmes et protections

- `scripts/sauvegarde/base.mjs` : export PostgreSQL des schémas public, auth et storage, au format custom, sans propriétaires mais **avec les droits**.
- `scripts/sauvegarde/fichiers.mjs` : copie des fichiers, contrôle des tailles et des empreintes SHA-256.
- `scripts/sauvegarde/restaurer-archive.mjs` : exercice de la copie réelle, déchiffrement, import PostgreSQL, extraction des fichiers et contrôles de cohérence.
- `scripts/sauvegarde/exercice-restauration.mjs` : contre-épreuve sur données fictives, avec comparaison détaillée des tables, politiques et droits dans le même instantané source. Elle reste exécutée dans les tests automatiques.
- Chiffrement AES-256-GCM ; clé de 32 octets hors des archives. Un fichier supérieur à 64 Mo interrompt la copie.
- Planification quotidienne à 01:20 UTC ; la supervision signale un retard au-delà de 26 heures. Une planification GitHub peut être retardée par le fournisseur : consulter la dernière réussite, pas seulement l'horaire prévu.

Les copies prises avant la correction du 27 septembre ne contenaient pas les droits PostgreSQL : leur restauration exige de rétablir les permissions avant toute ouverture. Ne jamais utiliser `--no-privileges` lors de la restauration des copies récentes.

## Procédure en cas d'incident

1. Suspendre les écritures concernées et les envois externes ; identifier la dernière copie saine et conserver la trace de l'incident.
2. Obtenir la clé de chiffrement et télécharger uniquement les archives nécessaires dans un environnement privé.
3. Exécuter l'exercice ci-dessus pour contrôler la copie, puis préparer **un projet Supabase de secours distinct**. Désactiver ses envois, paiements, signatures, publications et tâches métier.
4. Restaurer les schémas applicatifs et les droits en respectant les schémas gérés par Supabase. Réimporter les fichiers aux mêmes chemins, dans des compartiments privés, sans écraser de données existantes.
5. Vérifier les comptes, un bail, une quittance, une photo d'incident, les refus d'accès entre organisations et les parcours des profils. Comparer le catalogue des fichiers et contrôler les permissions.
6. Faire valider la bascule, changer les connexions du site, contrôler les parcours, puis reprendre progressivement les traitements. Conserver l'ancien environnement fermé en lecture tant que le contrôle n'est pas terminé.

## Ce qui reste à éprouver

L'exercice du 27 septembre prouve la récupération de **la vraie base PostgreSQL et des octets des fichiers**. Il ne prouve pas la bascule des services Supabase Auth et Storage vers un projet de secours, la réimportation dans leur API, ni une remise en service en moins de quatre heures. Cet essai nécessite un projet de secours dédié ; aucun projet tiers existant ne doit être utilisé. Le plan Supabase Pro est visible, mais la restauration de ses sauvegardes natives n'a pas été exercée ici.

Les archives en clair ne doivent jamais être publiées ni jointes au rapport. La clé de chiffrement doit être conservée séparément dans un gestionnaire de secrets : perdre cette clé rend les copies inutilisables.
