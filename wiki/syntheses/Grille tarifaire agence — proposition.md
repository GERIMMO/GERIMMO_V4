---
type: synthesis
tags: [tarifs, agence, abonnement, stripe, proposition]
status: draft
created: 2026-09-12
updated: 2026-09-12
sources: ["[[Grille tarifaire]]", "[[Analyse concurrentielle]]", "[[Mandat de gestion]]", "[[Cycle de vie de l'abonnement]]", "[[Abonnement]]"]
---

# Grille tarifaire agence — proposition

**Statut : proposition, en attente d'arbitrage humain.** Rien n'est implémenté.
La grille en vigueur dans le code applique 5,99 €/bien à tout le monde, et
l'écran « Mon abonnement » est masqué aux agences — il n'existe aujourd'hui
**aucun chemin d'encaissement pour une agence**.

## Ce qui ne va pas dans la grille actée

La grille du 25/07 ([[Grille tarifaire]]) facture par **palier** : 79 € jusqu'à
50 lots, 149 € jusqu'à 150, 249 € jusqu'à 300, 399 € jusqu'à 600. Trois défauts,
dont un rédhibitoire.

**La marche.** C'est le plus grave, et il se lit en une ligne :

| Passage de palier | Grille par paliers |
|---|---|
| 50 → 51 lots | 79 € → 149 € — **+89 % pour un lot de plus** |
| 150 → 151 lots | 149 € → 249 € — **+67 % pour un lot de plus** |
| 300 → 301 lots | 249 € → 399 € — **+60 % pour un lot de plus** |

Une agence à 50 lots qui en signe un cinquante-et-unième voit sa facture
logicielle doubler le jour où elle gagne 49 € de honoraires. Elle ne saisira pas
ce lot, ou elle appellera pour négocier. Dans les deux cas, le prix a **abîmé la
donnée** : le parc dans l'outil cesse d'être le parc réel, et tout ce qui en
découle — relevés de gestion, régularisations, fiscalité — devient faux.

**Le plancher absent.** Une agence de cinq lots paie 79 € pour 245 € de
honoraires mensuels : un tiers de son chiffre d'affaires. Elle ne signera pas.

**Les trois rythmes.** Mensuel + mise en route + redevance annuelle, c'est
**deux abonnements Stripe** (il refuse de mélanger deux rythmes — [[Grille
tarifaire]]), deux factures, et deux choses à expliquer. Pour le client comme
pour nous.

## La proposition : un barème par tranches, sans marche

Chaque lot supplémentaire est facturé **au tarif de sa tranche**, comme un
barème d'impôt — jamais au tarif du palier entier.

| Tranche | Tarif par lot et par mois |
|---|---|
| Du 1ᵉʳ au 10ᵉ lot | 3,90 € |
| Du 11ᵉ au 50ᵉ | 2,00 € |
| Du 51ᵉ au 150ᵉ | 1,30 € |
| Du 151ᵉ au 400ᵉ | 0,80 € |
| Au-delà de 400 | 0,50 € |

**Plancher : 39 € par mois.** En dessous de dix lots, c'est lui qui s'applique.

**Ni mise en route, ni redevance annuelle.** Un seul prélèvement mensuel, un seul
abonnement Stripe. L'accompagnement à la reprise d'un portefeuille reste
possible, **sur devis** et à la demande — l'import du parc est automatisé
([[Onboarding et abonnement]], 16.3), la reprise **comptable** ne l'est pas
encore.

**Au-delà de 600 lots : sur devis**, comme aujourd'hui.

## Ce que ça donne

| Lots sous mandat | Proposé | Coût par lot | V3 mensuel | V3 + redevance lissée | Part du CA de l'agence |
|---|---|---|---|---|---|
| 5 | **39,00 €** | 7,80 € | 79 € | 96 € | 15,9 % |
| 10 | **39,00 €** | 3,90 € | 79 € | 96 € | 8,0 % |
| 25 | **69,00 €** | 2,76 € | 79 € | 96 € | 5,6 % |
| 50 | **119,00 €** | 2,38 € | 79 € | 96 € | 4,9 % |
| 51 | **120,30 €** | 2,36 € | 149 € | 166 € | 4,8 % |
| 100 | **184,00 €** | 1,84 € | 149 € | 166 € | 3,8 % |
| 150 | **249,00 €** | 1,66 € | 149 € | 166 € | 3,4 % |
| 151 | **249,80 €** | 1,65 € | 249 € | 282 € | 3,4 % |
| 200 | **289,00 €** | 1,45 € | 249 € | 282 € | 2,9 % |
| 300 | **369,00 €** | 1,23 € | 249 € | 282 € | 2,5 % |
| 400 | **449,00 €** | 1,12 € | 399 € | 432 € | 2,3 % |
| 600 | **549,00 €** | 0,92 € | 399 € | 432 € | 1,9 % |

Et la marche disparaît :

| Passage | Grille V3 | Proposée |
|---|---|---|
| 50 → 51 lots | 79 € → 149 € (+89 %) | 119,00 € → 120,30 € (**+1,30 €**) |
| 150 → 151 | 149 € → 249 € (+67 %) | 249,00 € → 249,80 € (**+0,80 €**) |
| 300 → 301 | 249 € → 399 € (+60 %) | 369,00 € → 369,80 € (**+0,80 €**) |

> [!info] Hypothèse de calcul, à confirmer
> La colonne « part du CA » suppose un **loyer moyen de 700 €** et le **taux de
> honoraires par défaut de 7 %** documenté dans [[Mandat de gestion]] (RM-5.1.4),
> soit ~49 € de honoraires par lot et par mois. Le taux est sourcé ; **le loyer
> moyen est une hypothèse** — il faut le confirmer sur un vrai portefeuille.

## Pourquoi c'est plus cher que la grille de juillet

De 25 à 50 % au-dessus, redevance lissée comprise. Trois raisons.

1. **L'humain a déjà décidé de monter en gamme.** Le tarif propriétaire direct
   est passé de 2,50 € à **5,99 €/bien** le 05/09 — 2,4×, « positionnement
   assumé montée en gamme » ([[Grille tarifaire]]). Laisser la grille agence à
   son niveau de juillet, c'est faire payer 5,99 € par bien à un particulier et
   1,58 € par lot à une agence de cinquante. La cohérence commande de bouger les
   deux.
2. **Le produit de septembre n'est pas celui de juillet.** La grille de juillet a
   été fixée avant le module incident/artisan, le portail artisan et le portail
   locataire. [[Analyse concurrentielle]] est explicite : c'est le
   différenciateur, personne dans le panel ne le fait, « le prix ne tiendra que
   si le module incidents/artisans est perçu comme la valeur principale ».
3. **La proposition reste sous les seuils du marché.** De 5 % du chiffre
   d'affaires de l'agence à 50 lots à 2 % à 600. Oskar, le concurrent qui vise
   les agences, **ne publie pas ses prix** ([[Analyse concurrentielle]]) : il n'y
   a donc pas de plafond de marché observable à respecter.

## Ce que ça change dans le code

**L'unité comptée doit changer.** `abonnement_quantite_cible()` compte
aujourd'hui les **biens** (`public.biens`). Pour une agence, c'est faux d'un
facteur considérable : un immeuble de trente lots compte pour un. Le
référentiel dit déjà quoi compter — « **lot sous mandat actif au dernier jour du
mois**, vacant compté, sans mandat non » (RM-18.6) — et la base le permet :
`mandat_lignes` porte `lot_id`, ses dates, et le mandat porte son état.

Trois chantiers, dans cet ordre :

1. Compter les **lots sous mandat actif** pour une agence, les **biens** pour un
   propriétaire direct — la fonction connaît déjà `organizations.type`.
2. Poser le barème par tranches côté Stripe : un tarif **graduated** unique,
   plutôt que cinq tarifs à faire commuter.
3. Ouvrir « Mon abonnement » aux agences (l'écran leur est masqué par
   `if (!estProprietaire) notFound()`), et le rendre lisible pour un barème :
   le décompte bien par bien ne tient pas à trois cents lots.

> [!warning] À trancher par l'humain
> - **Les niveaux** (3,90 / 2,00 / 1,30 / 0,80 / 0,50 et le plancher à 39 €) :
>   ce sont des propositions, calées sur la part du CA, pas des valeurs sourcées.
> - **La mise en route** : supprimée ici, conservée en option sur devis. Elle
>   finançait un accompagnement réel sur les gros portefeuilles.
> - **Le loyer moyen** de l'hypothèse de calcul.
> - **Le sort de la grille du 25/07** : cette proposition la remplace. Tant
>   qu'elle n'est pas arbitrée, [[Grille tarifaire]] fait foi.
