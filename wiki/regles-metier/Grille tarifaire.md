---
type: business-rule
tags: [tarifs, stripe, abonnement, tva, franchise]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[2026-09-28-decision-tarification]]", "[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]", "[[Conditions générales]]", "[[Recueil des textes officiels (v6)]]", "DECISIONS-2026-11-24.md (Q7, complément du 24/11 : « Mentionne tva non applicable pour l'instant »)", "QUESTIONS.md (Q63, Q66, Q80)", "JURISTE.md, partie 6 point 13 et partie 9 point 32", "livrables/notes-banc/notes-D7.md (§ 1, 5.3), notes-T4.md (R29-A1, T4R-10)", "livrables/recueil/analyse-refs-25-37.md (réf. 29, 30)", "code en production jusqu'au 25/11 : 81740dec — app/src/lib/tarifs.ts, app/src/components/grilles-tarifaires.tsx, app/src/app/tarifs/page.tsx, app/src/lib/conditions-versions.json", "version lue avant la publication : 89cb87ff (branche claude/palier-1-fusion, complétée jusqu'à 062296e2, en production depuis le 25/11) — mêmes fichiers", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)", "livrables/PLAN-DE-PUBLICATION.md (§ 4, réglages R1, R2, R7)"]
---

# Grille tarifaire

> [!info] État de la production au 26/11/2026
> - **En production depuis le 25/11/2026** à 23:17Z (26/11 à 00 h 17, heure de Paris) : version `062296e2` (branche
>   `89cb87ff`, complétée jusqu'à `062296e2`, vérifiée en entier sur le banc), publiée par la PR #358 (`main` =
>   `8f9dd9ce`, identique à `062296e2`) ; ses 52 migrations sont appliquées (25/11, 22:09Z) et la recette de production
>   n° 58 a réussi (`log.md`, entrée « deploy » du 25/11/2026). **La grille ne change pas** ; seules changent la mention
>   de franchise (« article » en toutes lettres) et l'identité du vendeur qui la porte. Les **ventes y restent
>   fermées** (`/tarifs` relue le 25/11 après la publication ; [[Souscription de l'abonnement]]).
> - **Jusqu'au 25/11** : code `81740dec` (servi depuis le 21/11/2026), ventes fermées.
> - **Pas encore fait au 26/11** (réglages à faire par le dirigeant, `livrables/PLAN-DE-PUBLICATION.md`, § 4) :
>   identité du vendeur (R1) et en-tête des factures dans le compte Stripe (R7).

## Grille appliquée par le code depuis le 11/11/2026

**Particuliers et SCI gérant leurs propres biens** (organisation « propriétaire direct ») — **abonnement unique**
« Gerimmo », depuis la PR #286 du 11/11/2026 et la version des conditions du même jour (« Abonnement unique pour les
nouvelles souscriptions propriétaires et SCI, calcul par unité locative active et deux mois offerts en annuel »,
[[Conditions générales]]). Le prix dépend du nombre de **biens actifs** (`montantAbonnementUnique`,
`app/src/lib/tarifs.ts`) :

| Biens actifs | Par mois | Par an (en une fois) |
|---:|---:|---:|
| 1 | 5,99 € | 59,90 € |
| 2 à 7 | 5,99 € + 1,99 € par bien au-delà du premier (2 biens : 7,98 € ; 7 biens : 17,93 €) | dix mensualités (7 biens : 179,30 €) |
| 8 à 20 | 19,90 € | 199,00 € |
| au-delà de 20 | 19,90 € + 0,99 € par bien au-delà de 20 (25 biens : 24,85 € ; 30 biens : 29,80 €) | dix mensualités (25 biens : 248,50 €) |

- Annuel = dix mensualités, prélevées en une fois (« deux mois offerts »). Une seule ligne de facture, au prix exact du
  portefeuille. Le site public affiche ce tableau (1, 2, 7, 8, 20, 21 et 30 biens) et l'exemple de 25 biens.
- Source unique en centimes : `app/src/lib/tarifs.ts`, lu par le site, « Mon abonnement », la console et Stripe ; la
  base porte les chiffres des formules et des tranches pour ses gardes (`tarif_formules`, `tarif_tranches`), comparés
  par les tests (commentaire du code ; non revérifié pour l'abonnement unique).
- Les **contrats conclus avant le 11/11** gardent leur formule (« Les conditions des contrats précédents sont
  conservées ») : Solo, Bailleur, Investisseur, Patrimoine restent dans le code, aux prix de la révision du 29/10/2026
  (Solo 5,99 € ; Bailleur 3 biens 17,70 € ; Investisseur 10 biens 59 € ; Patrimoine 20 biens 118 € ; 5,90 € par bien
  au-delà de 20 ; minimum de 4,90 € par bien et par mois après remise annuelle, commentaire de tête de `tarifs.ts`).
  Aucun contrat payant n'existe à ce jour (supposé : ventes jamais ouvertes ; non vérifié en production).
- **Agences** (prix HT, mensuel, lots sous mandat actif) : socle **49 €** jusqu'à 10 lots, puis **4,90 €** par lot
  au-delà (20 lots : 98 €). L'offre et sa grille **ne sont pas publiées** : la page `/tarifs` ne vise que les
  particuliers et les SCI et renvoie à la [[Liste d'attente des agences]].
- **Essai** : **2 mois calendaires** pour toute nouvelle inscription, sans carte, sans échéance de lancement et sans
  souscription automatique (version des conditions du 15/11/2026, article 8.2). L'« offre de lancement » (2 mois
  jusqu'au 31/12/2026, puis 1 mois) n'existe plus dans le code. Aucune formule n'est gratuite en permanence.

**Taxes** — régime déclaré de l'éditeur (`REGIME_TVA`, constante du code) : **franchise en base**, aucune TVA facturée,
le prix affiché est le prix payé.
- Mention en production jusqu'au 25/11 (`81740dec`) : « TVA non applicable, **art.** 293 B du CGI » (pied des factures Stripe, courriel de
  confirmation, `/tarifs`) ; « article » en toutes lettres seulement sur les mentions légales et les conditions.
- **En production depuis le 25/11/2026** (`062296e2`, lu dans le code avant la publication) : « TVA non applicable,
  **article** 293 B du CGI » partout, d'après l'article 293 E du code
  général des impôts lu dans le [[Recueil des textes officiels (v6)]] (**fourni par le dirigeant, non recontrôlé sur
  Légifrance**). Mention gardée « pour l'instant » par le dirigeant (24/11), pour un vendeur **entrepreneur
  individuel** (nom commercial SAUVEXPERT, [[Entrepreneur individuel (EI)]], page à créer).
- Le pied de facture est écrit par Gerimmo ; l'**en-tête** des factures (nom suivi de « EI », adresse, SIREN) se règle
  dans le **compte Stripe**, hors de Gerimmo (Q80 ; réglage R7, pas encore fait au 26/11). Un client Stripe existant ne reçoit le nouveau pied qu'à sa
  prochaine souscription ou hausse (T4R-10).

**Règles d'application** : hausse (formule, biens, lots sous mandat) seulement après présentation du nouveau montant,
de la date d'effet et du prorata (aperçu Stripe) puis confirmation — une garde en base refuse sinon l'écriture ; baisse
appliquée à l'échéance, sans prorata ; changement de périodicité à l'échéance seulement ; résiliation pour la prochaine
échéance. Révision tarifaire notifiée **au moins un mois** avant (article 8.9) et, pour le consommateur, soumise à son
accord exprès. Depuis le 25/11/2026 (`062296e2`) : une hausse ou un changement de périodicité demande aussi l'accord à
une nouvelle version archivée des conditions (décision Q15, [[Conditions générales]] ; au 26/11, la version du 24/11
n'est pas encore archivée, réglage R2). Voir [[Cycle de vie de l'abonnement]].

## Grille du 28/09/2026 — supplantée le 11/11/2026 ([[2026-09-28-decision-tarification]])

**Plus aucune gratuité permanente** : l'essai sans carte est la seule période sans paiement, pour tous. Sa durée
(14 jours jusqu'au 29/09) a suivi une **offre de lancement** (décision du porteur du 30/09/2026) : 2 mois jusqu'au
31/12/2026 inclus, 1 mois ensuite — remplacée le 15/11 par 2 mois sans échéance (ci-dessus).

**Particuliers et SCI** — prix TTC, fonctions identiques :

| Formule | Biens | Mensuel TTC | Annuel TTC |
|---|---:|---:|---:|
| Solo | 1 | 5,99 € | 59,90 € |
| Bailleur | jusqu'à 3 | 9,99 € | 99,90 € |
| Investisseur | jusqu'à 10 | 19,99 € | 199,90 € |
| Patrimoine | jusqu'à 20 | 29,99 € | 299,90 € |
| Au-delà de 20 | Patrimoine + | +1 €/bien/mois | +10 €/bien/an |

Annuel = dix mensualités. La formule la moins chère qui couvre le parc était proposée d'office.

**Agences** — mensuel HT, lots **distincts** sous mandat actif ou en préavis, vacants compris, tranches
**cumulatives** : socle 39 € jusqu'à 10 lots, +2 € du 11ᵉ au 50ᵉ, +1,50 € du 51ᵉ au 200ᵉ, +1 € à partir du 201ᵉ.

**Unité comptée (particuliers)** : chaque lot non archivé d'un bien non retiré — un logement et ses annexes louées au
même bail forment un lot ; un parking loué à part est son propre lot. Règle non revérifiée pour l'abonnement unique du
11/11 (« unité locative active »).

**Organisations antérieures** (décision du porteur, 28/09) : plus de premier bien offert pour personne — seul l'essai
est offert, puis **gel en lecture seule** jusqu'au paiement. **Pas de cumul** avec le parrainage — sauf, depuis le
30/09, le **mois offert au parrain** à la conversion de son filleul ([[Parrainage]]). Non revérifié depuis le 11/11.

## Historique des grilles (supplantées le 28/09/2026)

**Énoncé :** **8 offres** d'[[Abonnement]] en base — dont **6 achetables en ligne** et **2 sur
devis** (`requires_quote = true` : `agency_301_600`, `agency_600_plus`) — segmentées par
**audience** (`owner`/`agency`) et par **tranche de nombre de biens**. Lancement **mensuel
uniquement**, essai **14 jours**, EUR.

## Fondement
- Migration `20260712110100_sprint10_official_pricing.sql` (source faisant foi) + `20260720160000`,
  `20260720170000` ; config publique `src/config/public-pricing.ts` ; décision `docs/08-tarifs-stripe.md`.

## Grille officielle
| Offre | Public | Mensuel | Mise en place | Gestion annuelle | Biens |
|---|---|---|---|---|---|
| owner_1_5 | Propriétaire 1–5 | 19 € | 49 € | 79 € | 1–5 |
| owner_6_20 | Propriétaire 6–20 | 39 € | 49 € | 79 € | 6–20 |
| owner_21_50 | Propriétaire 21–50 | 69 € | 99 € | 149 € | 21–50 |
| agency_1_50 | Agence 1–50 | 79 € | 199 € | 199 € | 1–50 |
| agency_51_150 | Agence 51–150 | 149 € | 399 € | 199 € | 51–150 |
| agency_151_300 | Agence 151–300 | 249 € | 399 € | 399 € | 151–300 |
| agency_301_600 | Agence 301–600 | 399 € | **599 €** | 399 € | 301–600 (**sur devis**) |
| agency_600_plus | Agence +600 | — (**sur devis**) | — | — | 601+ |

## Paramètres / valeurs
- 3 tarifs par offre : mensuel (`amount_cents`), mise en place one-time (`setup_fee_cents`),
  gestion annuelle récurrente (`annual_fee_cents`). `trial_days = 14`.
- Correction 2026-07-20 : mise en place `agency_301_600` passée de 0 € à **599 €**.

## Mécanique Stripe
- 3 `stripe_*_price_id` par offre. Setup = 2ᵉ ligne de la 1ʳᵉ facture ; **gestion annuelle = abonnement
  SÉPARÉ** (Stripe interdit de mélanger deux rythmes). Idempotency key `checkout:{org}:{plan}:{date}`.
- Codes promo : `percent` (≤100), `fixed`, `free_month` ; usage unique par organisation par défaut.

## Conséquences si non respectée
- Règle **R1** : offre achetable seulement si prix + `stripe_price_id` renseignés et non « sur devis ».

## Cible V3 (module 18.6, 2026-07-24) — la facturation entre au périmètre
« **Gerimmo compte, Stripe encaisse et facture** » (RM-18.6.9). **Trois flux** : mise
en route (une fois), **abonnement exclusivement mensuel** (RM-18.6.7), **redevance
annuelle** à la date anniversaire. **Deux modèles** : agences **par palier de lots**,
propriétaires directs **par bien**. **Comptage automatique : lot sous [[Mandat de gestion|mandat]] actif au dernier jour du mois** (vacant compté, sans mandat non).
Essai **14 jours** sans restriction → alerte J-3 → **lecture seule** (données
conservées). Échec de prélèvement → relance puis suspension (module 18.4), **jamais
suppression**.

## Structure cible — tranchée (humain, 2026-07-25)

**Propriétaires bailleurs : par bien. Agences : par palier de lots.** Clôt la
réconciliation RM-18.6.3 — les paliers `owner_*` du code sont à remplacer.

**Grille PD — VALIDÉE (humain, 2026-07-25), prix RÉVISÉ (humain, 2026-09-05) :**
| Élément | Décision | Justification |
|---|---|---|
| **1ᵉʳ bien** | **Gratuit, à vie** | Neutralise le « Rentila gratuit 1 bien » ; porte d'entrée |
| **Par bien suivant** | **5,99 €/bien/mois** | Décision humain 2026-09-05 — remplace les 2,50 € du 25/07 ; 2 biens ≈ 72 €/an, 5 biens ≈ 24 €/mois |
| Mise en place / redevance | **Aucune pour les PD** | Friction fatale sur ce segment ; réservées aux agences |
| Essai | 14 jours sans carte | Inchangé |

> [!info] Révision de prix (2026-09-05)
> Le tarif par bien supplémentaire passe de 2,50 € à **5,99 €/bien/mois** (décision
> humain, session mobile). Le 1ᵉʳ bien reste offert à vie et l'absence de mise en
> place / redevance pour les PD est inchangée (non revues par l'humain — hypothèse
> conservée). Répercuté dans l'app : pages « Mon abonnement », accueil propriétaire,
> FAQ propriétaire. La justification « moins cher que Rentila » du 25/07 ne tient
> plus au même niveau (2 biens ≈ 72 €/an vs Rentila ~49 €/an) — positionnement
> assumé montée en gamme.

Points d'attention : (1) au-delà de ~20 biens le « par bien » dépasse les anciens
paliers (20 biens ≈ 47,50 €/mois vs 39 €) — assumable (la valeur suit le parc) ou
lisser par une dégressivité (2 €/bien au-delà de 20) ; (2) le comptage suit la
mécanique du module 18 (au dernier jour du mois).

**Agences : grille actuelle conservée — VALIDÉE (humain, 2026-07-25)**
(79/149/249/399 €/mois + mise en route + redevance — soit ~0,8 à 1,6 €/lot
dégressif), alignée sur le modèle V3 « mise en route + mensuel exclusif + redevance
annuelle » ; paliers exprimés en **lots sous mandat** (comptage automatique RM-18.6).
Les deux dernières tranches restent sur devis.

## Relations
[[Abonnement]] · [[Cycle de vie de l'abonnement]] · [[Souscription de l'abonnement]] · [[Conditions générales]] ·
[[Parrainage]] · [[Liste d'attente des agences]] · [[Analyse concurrentielle]] · [[Entrepreneur individuel (EI)]] ·
[[Recueil des textes officiels (v6)]]

> [!warning] Points à trancher / contradictions
> - **Grille « en vigueur » contredite par le code** : [[Abonnement]] et [[Référentiel du palier 1]] (règle R-ABO-01)
>   donnent encore la grille du 28/09 (Solo, Bailleur, Investisseur, Patrimoine) comme en vigueur ; le code applique
>   l'abonnement unique depuis le 11/11 (dans `81740dec` comme dans `062296e2`, en production depuis le 25/11/2026). La décision du dirigeant qui fonde
>   l'abonnement unique et la révision du 29/10 n'est dans aucune page-source du wiki : seuls le code, la PR #286 et le
>   résumé de la version des conditions du 11/11 en témoignent. À faire confirmer.
> - **Franchise en base pour ce vendeur** : activité déclarée « formation continue d'adultes » (85.59A) pour un vendeur
>   de logiciel par abonnement (Q66). Le texte fourni (293 B, recueil) parle du chiffre d'affaires total ; seuils de
>   37 500 € et 41 250 € pour les services ; formation et abonnements s'additionnent-ils ? À voir avec
>   l'expert-comptable (JURISTE.md, partie 9, point 32 a).
> - **Mention au 1er janvier 2027** : d'après le recueil (réf. 30, non recontrôlé), la franchise passe dans le code des
>   impositions sur les biens et services (L233-1 et suivants) et l'obligation de mention est maintenue jusqu'à la
>   mesure réglementaire, qui fixera la nouvelle mention ; une fiche officielle lue le 24/11 annonçait un changement
>   au 1er septembre 2026 et une tolérance jusqu'au 31/12/2027, que le recueil ne confirme pas. Le régime est une
>   constante du code : en changer demande une publication.
> - **Factures à une SCI ou à un professionnel** : d'ici septembre 2027 elles devront porter le SIREN du client, que
>   Gerimmo ne demande pas à la souscription (recueil, réf. 29, non recontrôlé).
> - **En-tête des factures Stripe** (« EI », adresse, SIREN) : réglage hors Gerimmo, non vu (Q80) ; réglage R7 du plan
>   de publication, pas encore fait au 26/11.
> - ~~Unité « bien »~~ — tranché le 28/09 pour l'ancienne grille ; non revérifié pour l'abonnement unique.
> - ~~Régime de TVA de l'éditeur~~ — tranché le 28/09 : franchise en base ; confirmé « pour l'instant » le 24/11.
> - ~~Clients existants~~ — tranché le 28/09 : bascule, gel après l'essai, bascule dès l'ajout de bien pour ceux qui
>   payaient l'ancienne grille.
> - ~~Parrainage~~ — tranché le 28/09 : pas de cumul ; 30/09 : 1 mois offert au parrain à la conversion du filleul,
>   rien de plus pour le filleul ([[Parrainage]]).
> - ~~Préavis de révision tarifaire~~ — tranché le 28/09 : au moins un mois (conditions, art. 8.9).
> - Les points qui suivent concernent les grilles supplantées : `agency_301_600` sur devis ; prix annuels de V3.
