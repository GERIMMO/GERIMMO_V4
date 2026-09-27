---
type: business-rule
tags: [tarifs, stripe, abonnement, migration]
status: implementation
created: 2026-09-28
updated: 2026-09-28
---

# Tarification 2026-09 — nouvelle grille et migration

La demande du 28 septembre 2026 remplace les anciennes propositions. Source opérationnelle complète : `app/docs/tarification-2026-09-migration.md`. Catalogue calculable : `app/src/lib/tarification.ts`, version `2026-09-v2`, montants en centimes.

| Formule particuliers et SCI pour leurs propres biens | Capacité | Mensuel TTC | Annuel TTC, en une fois |
|---|---:|---:|---:|
| Solo | 1 | 5,99 € | 59,90 € |
| Bailleur | 3 | 9,99 € | 99,90 € |
| Investisseur | 10 | 19,99 € | 199,90 € |
| Patrimoine | 20 | 29,99 € | 299,90 € |

Au-delà de vingt : +1 €/mois ou +10 €/an par bien. Même gestion pour toutes les formules. La moins chère couvrant le portefeuille est proposée, jamais engagée sans accord. Pas d’abonnement gratuit permanent dans la nouvelle grille.

Agences pour des tiers : socle 39 € HT/mois jusqu’à dix lots, +2 € par lot du 11e au 50e, +1,50 € du 51e au 200e, +1 € à partir du 201e. Tranches cumulatives ; mensuel seulement ; régime fiscal de Gerimmo à vérifier avant tout total réel.

Essai de quatorze jours sans carte pour les deux publics ; jours restants conservés en cas de souscription anticipée. Augmentations et prorata soumis à accord ; baisses à l’échéance si le parc le permet. Mensuel résiliable à l’échéance ; annuel prélevé une fois pour douze mois, renouvelable sauf résiliation. Droits payés conservés, puis lecture et export ; aucune suppression automatique liée à l’expiration.

Les biens occupés ou vacants comptent ; logement et annexes du même bail forment une unité ; parking séparé = unité distincte. Les archives ne comptent plus en gestion propre mais ne peuvent masquer un mandat agence actif. Comptes locataires, collaborateurs et propriétaires invités inclus. Consultation des biens confiés et gestion personnelle sont distinctes, y compris pour une même personne.

Gestion nationale ; réseau d’artisans ouvert localement par commune/métier, sans effet sur le prix. Travaux séparés sur devis. Aucune promesse d’illimité pour les prestations externes payantes. Aucun frais de démarrage autonome ; reprise manuelle d’agence sur devis accepté.

Les contrats et avantages historiques restent préservés. L’inventaire et la migration de clients existants sont une opération distincte, consentie et sans débit rétroactif. Les anciennes promotions ne se cumulent pas automatiquement ; les essais prolongés et avoirs acquis restent à honorer. La présence de ce document n’atteste ni de tests Stripe réussis ni d’une mise en production.
