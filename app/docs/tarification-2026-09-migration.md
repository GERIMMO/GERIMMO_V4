# Nouvelle tarification — activation et migration séparées

Décision produit du 28 septembre 2026. Version du catalogue : `2026-09-v2`.

Cette livraison prépare une nouvelle grille. Elle ne constitue pas une autorisation de modifier les abonnements, prix ou soldes Stripe réels pendant le développement. Les preuves d’essai doivent préciser leur environnement ; un retour de page Checkout ne constitue jamais une preuve de paiement.

## Règles commerciales

Les montants de l’application proviennent de `src/lib/tarification.ts`, en centimes entiers. Les contrôles en base sont vérifiés sur les mêmes cas. Le site, l’estimation et le récapitulatif de paiement doivent reprendre ce catalogue ; aucun calcul monétaire à partir d’un texte affiché.

| Gestion de ses propres biens, particulier ou SCI | Capacité | Mensuel TTC | Annuel TTC, prélevé en une fois |
|---|---:|---:|---:|
| Solo | 1 | 5,99 € | 59,90 € |
| Bailleur | 3 | 9,99 € | 99,90 € |
| Investisseur | 10 | 19,99 € | 199,90 € |
| Patrimoine | 20 | 29,99 € | 299,90 € |

Au-delà de vingt biens : +1 € TTC par bien et par mois ou +10 € TTC par bien et par an. Exemple de contrôle : 25 biens = 34,99 € TTC/mois ou 349,90 € TTC/an. La formule la moins chère couvrant le volume est proposée ; la suggestion ne souscrit rien. À zéro bien, Solo est une capacité proposée, pas un abonnement démarré automatiquement.

Agence pour des tiers : mensuel uniquement. Socle de 39 € HT jusqu’à dix lots ; +2 € du 11e au 50e, +1,50 € du 51e au 200e, +1 € au-delà. Les tranches sont cumulatives. Contrôles : 10 = 39 €, 20 = 59 €, 50 = 119 €, 100 = 194 €, 200 = 344 €, 300 = 444 €, 500 = 644 € HT. Une agence ayant souscrit conserve le socle même à zéro lot.

L’essai dure quatorze jours sans carte ; aucun débit sans accord explicite. Les jours restants sont conservés en cas de souscription anticipée. Le mensuel se résilie pour l’échéance suivante ; l’annuel paie douze mois en une fois et se renouvelle annuellement sauf résiliation. Les droits payés restent acquis jusqu’au terme ; ensuite, lecture et export, sans suppression automatique du seul fait de la fin d’abonnement.

Les augmentations nécessitent un récapitulatif montant/date/prorata et un accord. Pour diminuer la facturation, le responsable ouvre **Mon abonnement**, choisit la capacité proposée pour son nouveau volume puis confirme le récapitulatif ; la baisse est alors programmée pour la prochaine échéance si le parc le permet. Un archivage ou une fin de mandat actualise le volume et propose ce lien, mais ne programme pas seul une baisse : il faut terminer ce parcours de confirmation. Les annexes sur le même bail ne créent pas d’unité supplémentaire ; un parking indépendant, oui. L’archivage ne fait pas disparaître un mandat actif de la facturation.

Les accès locataires, propriétaires invités et collaborateurs sont inclus. Un compte peut consulter des biens confiés à une agence et gérer d’autres biens personnellement : espaces, droits et factures restent distincts. Ne jamais attribuer au propriétaire invité le rôle de gestionnaire de l’agence.

## Inventaire préalable, en lecture seule

À exécuter avec un accès de supervision adapté, sur une copie d’essai puis en lecture seule sur la production. Ne pas exporter les secrets, moyens de paiement, charges complètes des notifications Stripe ou données personnelles inutiles. Archiver le résultat horodaté dans un emplacement privé à accès restreint ; aucun chiffre de clientèle n’est présumé par ce document.

Pour chaque organisation, relever :

- identifiant interne, type d’usage et version de tarification ;
- statut, date de fin d’essai et éventuelle prolongation manuelle ;
- volume réel actif, archives, lots sous mandat actif et unités liées comme annexes ;
- existence de l’abonnement, prix réels Stripe, périodicité, quantité, prochaine échéance, résiliation ou modification déjà programmée ;
- premier bien offert historique, accès offert manuel, contrat sur devis et autres dérogations ;
- parrainages inscrits, essais accordés, avoirs appliqués ou à appliquer ;
- coupons, remises et solde créditeur visibles côté Stripe, sans présumer qu’un avantage provient de Gerimmo ;
- prélèvement en échec, délai de régularisation et droits encore acquis.

Exemple de classement initial, sans écriture et sans données personnelles :

```sql
begin transaction read only;
select o.id, o.type, o.status, o.essai_fin,
       (a.stripe_subscription_id is not null) as abonnement_stripe_present,
       a.stripe_statut, a.quantite, a.montant_mensuel_cents,
       a.periode_fin, a.annulation_demandee,
       (select count(*) from public.biens b where b.organization_id=o.id and b.archived_at is null) as conteneurs_biens_actifs,
       (select count(*) from public.biens b where b.organization_id=o.id and b.archived_at is not null) as conteneurs_biens_archives
from public.organizations o
left join public.abonnements a on a.organization_id=o.id
order by o.created_at, o.id;
select beneficiaire_organization_id, nature, etat,
       count(*) as nombre, sum(coalesce(jours,0)) as jours_inscrits,
       sum(coalesce(montant_cents,0)) as montant_inscrit_cents
from public.avantages_parrainage
group by beneficiaire_organization_id, nature, etat;
rollback;
```

Le nombre de conteneurs `biens` de ce relevé historique ne remplace pas le nouveau comptage des unités louables. Le détail opérationnel du nouveau volume doit être rapproché du parc avant toute proposition de migration.

## Avantages identifiés dans l’existant

1. Premier bien offert sans limite de durée dans l’ancienne grille ; les comptes existants ne perdent pas ce droit à l’installation du nouveau code.
2. Parrainage : filleul porté à trente jours, parrain en essai prolongé de trente jours, ou avoir du montant mensuel figé lors de la conversion. Registre `avantages_parrainage`, dont les états `a_appliquer` et `applique` doivent être honorés et préservés.
3. Prolongations et activations manuelles d’organisations par la supervision : distinguer une concession commerciale d’une simple opération technique avant migration.
4. Anciennes offres V3, coupons de type pourcentage/montant/mois gratuit, mise en route et redevance annuelle : décrits dans les archives du wiki, mais aucun moteur de coupon actif supplémentaire n’a été trouvé dans les parcours V4 examinés. Vérifier leur existence réelle dans Stripe ; ne pas les créer ni les réactiver sur cette seule documentation.

Ne pas recalculer à la baisse un avoir déjà acquis lorsque son bénéficiaire change de formule. Conserver son montant et sa référence externe pour éviter un deuxième crédit.

## Décisions à obtenir avant migration d’existants

- Date de proposition, information contractuelle et date d’effet de chaque cohorte ; aucun basculement rétroactif.
- Maintien du premier bien historiquement offert ou proposition volontaire vers la nouvelle grille, avec comparaison clairement affichée.
- Sort des parrainages déjà inscrits mais pas encore convertis : aucune suppression silencieuse d’une promesse ; les avantages déjà enregistrés sont acquis.
- Traitement des remises Stripe et contrats sur devis non portés par le registre local.
- Prix et modèle de coût des éventuelles signatures électroniques, SMS, prestations bancaires et accompagnements manuels ; pas d’illimité annoncé sans décision.
- Régime fiscal réel de Gerimmo. Ne pas utiliser le statut TVA de l’agence cliente comme celui de l’éditeur.
- Version et date d’acceptation des nouvelles conditions, préavis et clauses légales encore non fournis. Conserver les acceptations antérieures.

## Procédure d’activation proposée

1. Finaliser les tests automatisés et les parcours navigateur sur un environnement isolé. Les comptes réels, leurs droits et les prix de production restent inchangés.
2. Dans un compte Stripe de test, préparer les paramètres exigés par le nouvel adaptateur : prix et périodicités, fiscalité test explicitement identifiée, accès au portail, URL de notification et secret de test. Vérifier les paramètres effectivement attendus dans le code et `.env.example`, pas ceux de l’ancien adaptateur.
3. Effectuer de vrais échanges avec Stripe test : première souscription, essai restant y compris inférieur à 48 h, paiement refusé, notification rejouée, augmentation avec prorata, baisse programmée, renouvellement, résiliation à l’échéance. Conserver les identifiants de tests dans le compte rendu privé. Ne jamais déclarer un paiement réussi sans confirmation du prestataire.
4. Rapprocher facture test, catalogue en centimes, récapitulatif et droits en base. Une fiscalité inconnue empêche la confirmation réelle, elle ne vaut pas taux zéro.
5. Faire valider les choix fiscaux/commerciaux et l’ouverture de la nouvelle grille en production. Créer les nouveaux prix réels séparément ; ne pas modifier les anciens prix attachés aux abonnements existants.
6. Activer pour les nouvelles organisations avec quatorze jours d’essai sans carte. Conserver une version historique pour les organisations déjà présentes.
7. Présenter aux clients existants une migration facultative distincte indiquant ancienne/nouvelle offre, montant, avantages conservés, date d’effet et éventuel prorata. Sans accord : ne pas basculer ni débiter.
8. Migrer seulement les accords identifiés, de préférence à leur échéance, avec journal de décision et contrôles de cohérence. Sur incident, bloquer de nouvelles opérations tarifaires et conserver les droits déjà payés ; ne pas supprimer les données ni recréer aveuglément une souscription.

## Preuves attendues avant annonce « validé »

- Seuils propriétaires : 0, 1, 2, 3, 4, 10, 11, 20, 21 ; exemple 25 ; mensuel et annuel.
- Seuils agences : 0, 10, 11, 50, 51, 200, 201 ; les sept exemples ci-dessus.
- Biens vacants, annexes, parking séparé, archives/restaurations ; aucun contournement par requête directe.
- Droits invités sans double abonnement ni accès à un autre bailleur ; séparation avec gestion directe.
- Essai expiré non souscrit en lecture/export, données conservées, aucun débit.
- Consentement de changement, prorata vérifié, baisse différée, fin des droits payés et renouvellement annuel.
- Notifications doublonnées/retardées et échecs de paiement sans double opération.
- Aucun taux fiscal inventé, aucun message « paiement réussi » fondé seulement sur l’URL de retour.

Le compte rendu de livraison doit distinguer : tests locaux, tests SQL, essais navigateur, échanges réels Stripe test, configuration à fournir, et activation de production. Un scénario non exécuté est annoncé comme tel.

## Accès propriétaire invité par une agence

L’accès invité n’ouvre ni organisation personnelle, ni abonnement, ni rôle de gestionnaire. Il coexiste avec un espace de gestion directe facturé séparément pour les biens que le propriétaire gère lui-même.

1. Le responsable d’agence ouvre **Personnes → fiche du propriétaire → Accès propriétaire invité**. La personne doit avoir une adresse e-mail et être rattachée à une détention et un mandat de cette agence.
2. Après confirmation du destinataire, **Préparer le lien propriétaire** fournit un lien valable sept jours, à copier et transmettre manuellement. Aucun e-mail d’invitation ni SMS n’est envoyé automatiquement. Préparer un nouveau lien ferme l’ancien accès de cette fiche.
3. Le destinataire se connecte avec cette même adresse vérifiée, ou crée son compte invité depuis le lien puis vérifie son adresse. **Accepter l’invitation** ouvre son espace en consultation.
4. **Mes espaces** distingue les biens confiés aux agences de sa gestion personnelle. L’espace invité expose les lots encore détenus sous mandat actif/préavis et ses comptes rendus mensuels validés, avec leur PDF lorsqu’il a été conservé. Il n’expose pas les dossiers locataires ni les documents des autres propriétaires. Les données historiques des rapports restent accessibles lorsque la détention prend fin.
5. Le responsable peut **Fermer l’accès propriétaire** depuis la même fiche. La révocation prend effet sur les écrans comme sur les PDF. L’expiration d’un abonnement d’agence n’enlève pas à l’invité son accès en lecture aux rapports déjà validés.

Les accès reposent sur les droits vérifiés à chaque lecture et sur l’adresse actuellement vérifiée du compte, pas sur la seule possession du lien. Un changement d’adresse du destinataire sur la fiche ou sur le compte suspend cet accès jusqu’à une nouvelle invitation cohérente. Les comptes rendus PDF se téléchargent avec la session du propriétaire, sans clé administrative ni exposition de toute la bibliothèque documentaire.

Tests dédiés : neuf scénarios SQL d’isolation et révocation, tests du téléchargement refusé/autorisé, parcours navigateur d’invitation/révocation et présence du profil invité dans l’audit mobile. Leur présence dans le dépôt ne vaut pas validation : leur résultat réel doit être consigné à la livraison.


## Paramètres externes exacts de la nouvelle facturation

Ces paramètres doivent d’abord être posés dans un environnement isolé utilisant exclusivement un compte Stripe **de test**. Aucun identifiant réel, abonnement réel, prix historique ni secret de production n’a à être remplacé pour la recette.

| Paramètre | Contenu et contrôle |
|---|---|
| `STRIPE_SECRET_KEY` | Clé du compte Stripe utilisé par l’environnement. En recette : préfixe `sk_test_` ou `rk_test_`. |
| `STRIPE_WEBHOOK_SECRET` | Secret du point de réception Stripe correspondant à cet environnement. Ne pas le copier dans un rapport. |
| `STRIPE_CATALOGUE_V2_JSON` | Objet contenant les onze identifiants `price_…` détaillés ci-dessous. Chaque montant, intervalle, mode et traitement fiscal est relu auprès de Stripe avant de confirmer. |
| `STRIPE_FISCALITE_V2_JSON` | Régime fiscal **réel du vendeur Gerimmo**, mention à afficher et, si nécessaire, les identifiants de taux. Un paramètre absent bloque les paiements V2 ; il n’est pas remplacé par une taxe supposée. |
| `STRIPE_PORTAIL_V2_CONFIGURATION` | Identifiant `bpc_…` d’une configuration active du portail. Changement direct d’abonnement désactivé ; résiliation permise uniquement à la fin de période. Factures et moyen de paiement restent accessibles. |
| `GERIMMO_TARIFICATION_V2_PRODUCTION` | Laisser vide pendant le développement. La valeur exacte `active` est une activation distincte, à décider après validation de la fiscalité, des contrats et de la recette. |
| `GERIMMO_STRIPE_TEST_KEY` | Secret GitHub réservé au workflow manuel `stripe-bac-a-sable.yml`. Une clé absente ou réelle fait échouer la recette avant les opérations. Ne pas le renseigner dans le navigateur utilisateur. |

Les onze entrées de `STRIPE_CATALOGUE_V2_JSON` sont :

| Entrée | Montant en centimes | Paramètres Stripe |
|---|---:|---|
| `solo_mensuel` | 599 | euro, mois, quantité 1, taxe incluse |
| `solo_annuel` | 5990 | euro, année, quantité 1, taxe incluse |
| `bailleur_mensuel` | 999 | euro, mois, quantité 1, taxe incluse |
| `bailleur_annuel` | 9990 | euro, année, quantité 1, taxe incluse |
| `investisseur_mensuel` | 1999 | euro, mois, quantité 1, taxe incluse |
| `investisseur_annuel` | 19990 | euro, année, quantité 1, taxe incluse |
| `patrimoine_mensuel` | 2999 | euro, mois, quantité 1, taxe incluse |
| `patrimoine_annuel` | 29990 | euro, année, quantité 1, taxe incluse |
| `supplement_mensuel` | 100 par bien au-delà de 20 | euro, mois, taxe incluse |
| `supplement_annuel` | 1000 par bien au-delà de 20 | euro, année, taxe incluse |
| `agence_mensuel` | tranches cumulées | euro, mois, taxe exclue, `tiered` / `graduated` |

Le prix agence comporte quatre tranches : jusqu’à 10, forfait 3900 et unité 0 ; jusqu’à 50, unité 200 et forfait 0 ; jusqu’à 200, unité 150 et forfait 0 ; au-delà, unité 100 et forfait 0. À zéro lot, l’abonnement souscrit utilise une quantité technique de 1 pour appliquer le socle de 39 €, tout en affichant zéro lot facturé. La quantité ne représente jamais les collaborateurs ou les locataires.

Le script `node --experimental-strip-types scripts/stripe-catalogue-test.mjs --creer` crée uniquement un catalogue de test et une configuration de portail restreinte, avec `GERIMMO_STRIPE_TEST_KEY` de test. Il refuse une clé réelle et produit les identifiants à enregistrer ; il ne modifie aucun prix existant.

Deux formes de fiscalité sont reconnues. Les valeurs entre chevrons sont à renseigner après vérification, pas des paramètres prêts à activer :

```json
{"mode":"exonere","mention":"<mention exacte de l’exonération réellement applicable>"}
```

ou, si un taux s’applique réellement :

```json
{"mode":"taux","mention":"<mention fiscale validée>","particulier":"txr_<taux_inclus>","agence":"txr_<taux_exclus>"}
```

Les deux taux doivent correspondre à la situation fiscale réelle du vendeur, au même environnement Stripe et respectivement être inclus dans le TTC particulier, puis ajoutés au HT agence. Le code ne présume ni une exonération, ni un taux de 20 %, ni le régime du vendeur à partir de celui d’un client. Le scénario automatisé sans taxe est exclusivement une fixture de test.

Le point de réception reste `/api/stripe/webhook`. Pour la nouvelle grille, il doit recevoir `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied` et `customer.subscription.pending_update_expired`. Conserver les autres événements déjà nécessaires aux parcours historiques. Les messages signés sont contrôlés, dédupliqués et rapprochés de l’état actuel de Stripe ; un événement ancien ne doit pas rétablir un ancien accès. Les confirmations manuelles et ces notifications partagent un verrou court par organisation.

L’essai restant inférieur à 48 heures utilise une page Stripe de confirmation de carte, puis une souscription dont le premier prélèvement conserve la date exacte de fin d’essai. Si cette date est dépassée avant la confirmation, une nouvelle acceptation de la date de paiement est demandée. Une confirmation de carte n’est jamais présentée comme un règlement.

## Portée exacte de la recette Stripe

Le workflow manuel utilise de vrais appels à l’API Stripe **test** et une base PostgreSQL jetable. Il contrôle les montants, les essais courts, les proratas, les refus de paiement, les calendriers de baisse, le renouvellement annuel et la résiliation à échéance. Le fichier `stripe-v2-sql-bac-a-sable.test.ts` relie en outre les souscriptions de test à la vraie route locale de Gerimmo et aux fonctions SQL V2 : accord enregistré, capacité avant/après paiement, doublon, refus puis régularisation, message ancien et résiliation.

Le transport de notification est une requête HTTP construite et signée dans le test. Il **ne prouve pas** une livraison réseau de Stripe vers un site public. L’interface Checkout, la saisie de carte et le parcours bancaire dans un navigateur ne sont pas parcourus par ce workflow. Ils restent une recette distincte sur une préproduction de test configurée. La présence des scénarios ne vaut pas réussite : rapporter le résultat et le commit du dernier lancement exécuté, ainsi que tout cas ignoré ou échoué. Aucun paiement réel, débit rétroactif ou migration des clients existants n’appartient à cette recette.
