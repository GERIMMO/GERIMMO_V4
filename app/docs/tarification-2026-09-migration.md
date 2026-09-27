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

Les augmentations nécessitent un récapitulatif montant/date/prorata et un accord ; les diminutions sont programmées pour l’échéance si le parc le permet. Les annexes sur le même bail ne créent pas d’unité supplémentaire ; un parking indépendant, oui. L’archivage ne fait pas disparaître un mandat actif de la facturation.

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
