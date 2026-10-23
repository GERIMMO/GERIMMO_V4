# Inventaire global des souscriptions Stripe — PAY-5

Le contrôle des clients déjà connus de Gerimmo ne peut pas repérer une souscription dont le client est absent de la base. La tâche `abonnements` parcourt désormais aussi le compte Stripe, sans filtre de client. Ce contrôle ne modifie rien chez Stripe et ne crée aucun droit d'accès.

## Résultat et reprise

- Les souscriptions non terminées sans client Gerimmo ou sans rattachement à la souscription du compte sont signalées dans **Administration → Santé → Souscriptions sans dossier Gerimmo**.
- Les états `canceled` et `incomplete_expired` ne sont pas signalés. Une anomalie est une demande de vérification humaine, pas une décision de résiliation ou de remboursement.
- Chaque passage lit au plus cinq pages de cent souscriptions. Le curseur et les anomalies sont enregistrés dans une même transaction par page. Un grand compte peut nécessiter plusieurs passages ; l'écran indique explicitement que l'inventaire reste incomplet.
- Le cycle fixe une borne de création avant son premier appel. Les souscriptions créées après cette borne seront examinées au cycle suivant. Les changements survenus pendant un cycle ne constituent pas un instantané comptable : ils seront revérifiés au cycle suivant.
- Un verrou renouvelé de 90 secondes empêche deux passages de confirmer la même page. Après interruption, le prochain passage reprend le dernier curseur confirmé. Les anomalies d'un ancien cycle ne sont retirées qu'à la fin d'un nouveau cycle complet.
- L'arrêt de supervision `abonnements` est vérifié avant la prise, chaque appel Stripe et chaque confirmation. Une panne lors de la libération ne masque pas cet arrêt.

Seuls les identifiants de souscription et de client, le motif, le cycle et la date de vérification sont conservés. Aucun nom, e-mail, montant, moyen de paiement ou secret n'est importé. Les tables sont privées ; le bilan est réservé au superadmin avec le contrôle d'authentification existant. L'écran présente au plus cinquante anomalies et annonce le nombre total.

## Mise en service

Pas de nouvelle clé ni de nouveau service. Le contrôle utilise la connexion Stripe et la tâche Abonnements existantes. Appliquer `20261023164629_stripe_inventaire_global.sql` par le chantier de migrations, puis déployer le code. Le premier passage constituera le premier inventaire réel ; les tests locaux ne valent pas une vérification du compte Stripe de production.

La limite de temps reste celle de la tâche complète. Si une étape antérieure interrompt toute la tâche, l'inventaire sera différé. Un inventaire partiel ou échoué est visible dans Santé et dans le bilan de la tâche ; il ne doit pas être interprété comme zéro anomalie.

Le retour arrière retire les fonctions ajoutées, conserve les tables privées et leurs résultats. Revenir également au code précédent. Aucun abonnement ni événement Stripe n'est modifié par ce retour.

## Validation

Les essais couvrent le compte sans abonnement connu, une deuxième souscription d'un client existant, les états terminés, la pagination, la limite par passage, les arrêts de supervision, les pannes Stripe/base et le verrou expiré. Les tests SQL vérifient la conservation des anomalies après interruption, leur retrait à la fin d'un cycle et les droits des rôles ordinaires. Ils tournent sur une base fictive locale ; aucun paiement n'est simulé comme réussi.
