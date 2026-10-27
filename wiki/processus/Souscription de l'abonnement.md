---
type: process
tags: [abonnement, souscription, stripe, consommateur, support-durable, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Abonnement]]", "[[Cycle de vie de l'abonnement]]", "[[Conditions générales]]", "log.md — entrées « decision » du 23/10/2026 (médiateur non bloquant, valeurs par défaut du plan) et « deploy » du 24/10/2026 (PR #246, PR #247)", "app/src/lib/courriers-contrat.ts", "app/src/lib/courriers-contrat-envoi.ts", "app/src/app/agence/[orgId]/abonnement/formulaire-souscription.tsx", "app/src/lib/stripe-offres.ts"]
---

# Souscription de l'abonnement

**En une phrase :** le propriétaire choisit sa formule dans « Mon abonnement », lit un
récapitulatif qui rappelle son droit de rétractation, coche une case de confirmation, paie
sur la page sécurisée de Stripe, puis reçoit **une seule fois** un courriel de
confirmation sur support durable, avec les conditions acceptées et le formulaire de
rétractation.

> [!info] En production depuis le 24/10/2026
> PR #246 (`f79674c`) pour le récapitulatif, la case et la confirmation ; PR #247
> (`31377f5`) pour la page de paiement (le paramètre `submit_type: "pay"` du plan, refusé
> par Stripe en mode abonnement, a été retiré : de 05 h 51 UTC au correctif, aucune page de
> paiement d'abonnement ne s'ouvrait ; aucun client touché, 0 organisation en production).

## Déclencheur
Le titulaire de l'espace, pendant ou après l'essai, ouvre « Mon abonnement » et choisit une
périodicité et une formule ([[Grille tarifaire]]).

## Étapes
1. **Conditions** : le paiement exige que le compte ait accepté la version en vigueur des
   conditions générales (case « J'ai lu et j'accepte la version du … » si besoin ;
   `acceptations_cgu`, document `conditions_clients`). L'identité complète de l'éditeur
   reste requise (le médiateur ne bloque plus, décision du 23/10).
2. **Récapitulatif avant paiement** : formule, prix, date du premier prélèvement, durée et
   reconduction, puis deux points ajoutés le 24/10 :
   - « Droit de rétractation : vous pouvez renoncer à cet abonnement, sans motif, pendant
     14 jours après la souscription (jusqu'au {date} inclus si vous validez aujourd'hui),
     depuis « Mon abonnement » (bouton « Renoncer au contrat ici ») ou avec le formulaire
     de l'article 8.10 des conditions générales. Vous êtes alors remboursé intégralement,
     sous 14 jours, sur la carte utilisée. » ;
   - « Paiement par carte bancaire, sur la page sécurisée de notre prestataire de
     paiement. »
   Le lien « Conditions générales d'utilisation et de vente, version du … » reste affiché
   sous le bouton, même conditions déjà acceptées.
3. **Case de confirmation** (texte du plan, mot pour mot) : « J'ai vérifié le montant de
   {total} {période} et j'accepte qu'il soit prélevé {à partir du {date} / dès la
   validation du paiement}, selon les conditions ci-dessus. Je demande que mon abonnement
   payant commence à cette date, même pendant mon délai de rétractation, que je conserve :
   si je l'exerce, je suis remboursé intégralement. » Son horodatage est consigné et entre
   dans la preuve du contrat.
4. **Page de paiement Stripe** (« Continuer vers le paiement sécurisé ») : langue française
   et, sous le bouton de Stripe, le texte « En cliquant, vous commandez l'abonnement
   Gerimmo {formule} avec obligation de paiement : {montant} {par mois / par an}{, premier
   prélèvement le {date}}. » Le libellé du bouton lui-même est celui de Stripe, comme avant
   le 24/10.
5. **Conclusion** : l'abonnement payant est conclu quand Stripe confirme la souscription ;
   le webhook enregistre sa date (`abonnements.souscrit_le`), qui fait courir le délai de
   [[Rétractation en ligne]]. Journal d'audit : `abonnement_commande_confirmee`.
6. **Courriel de confirmation** (sujet « Confirmation de votre abonnement Gerimmo »),
   envoyé **une seule fois par souscription** (clé `souscription-{id}`), à l'adresse de
   facturation :
   - souscription, formule et nombre de biens, prix (« TVA non applicable, art. 293 B du
     CGI » en franchise), paiement par carte, premier prélèvement, durée (mensuel : durée
     indéterminée, résiliable à tout moment pour la prochaine échéance ; annuel : douze mois
     reconduits tacitement, « nous vous écrirons entre trois mois et un mois avant chaque
     échéance ») ;
   - droit de rétractation jusqu'au {date limite} inclus, bouton ou formulaire ;
   - médiation : coordonnées du médiateur si elles sont saisies, sinon, mot pour mot,
     « Médiateur de la consommation : adhésion en cours ; ses coordonnées figureront dans
     les mentions légales dès qu'elle sera effective. » — **la confirmation part même sans
     médiateur** (décision 1 du 23/10, qui l'emporte sur le plan) ;
   - les conditions acceptées **en PDF** si leur version est archivée
     ([[Conditions générales]]), sinon leur adresse en ligne ;
   - le formulaire de rétractation de la version en vigueur, puis l'identité de l'éditeur.
   Un échec d'envoi ne fait pas échouer le webhook : la confirmation est retentée à la mise
   à jour suivante d'une souscription de moins de 30 jours, puis par le **rattrapage de
   nuit** (souscriptions du dernier mois jamais confirmées). Journal d'audit :
   `abonnement_confirmation_envoyee`.

## Résultat / sorties
- Souscription active, preuve de la commande et de la confirmation gardée dix ans
  (`journal:audit_preuve_contrat`, [[Durées de conservation]]).
- Les abonnés souscrits moins de 30 jours avant la mise en ligne du 24/10 reçoivent la
  confirmation au premier événement Stripe « updated ».

## Relations
[[Abonnement]] · [[Cycle de vie de l'abonnement]] · [[Onboarding et abonnement]] ·
[[Rétractation en ligne]] · [[Résiliation de l'abonnement]] · [[Impayé de l'abonnement]] ·
[[Grille tarifaire]] · [[Conditions générales]]

> [!warning] Points à trancher / contradictions
> - **Libellé du dernier bouton** : le plan voulait « Payer » (C. conso L. 221-14 al. 2) ;
>   Stripe refuse `submit_type: "pay"` en mode abonnement. Le texte d'obligation de paiement
>   sous le bouton est gardé ; le recours du plan (mode « setup », bouton Gerimmo
>   « Commander avec obligation de paiement ») reste possible si un juriste l'exige — à
>   confirmer sur Légifrance (source non ouverte le 23/10/2026).
> - **Vente sans médiateur désigné** : choix du dirigeant (23/10) ; l'information sur le
>   médiateur est une obligation (C. conso L. 612-1, L. 616-1) — à confirmer sur Légifrance
>   (source non ouverte le 23/10/2026).
> - **Confirmation sur support durable** (C. conso L. 221-13, C. civ. 1127-2) et case de
>   demande expresse (L. 221-25) : à confirmer sur Légifrance (source non ouverte le
>   23/10/2026).
> - **PDF joint** seulement après l'archivage de la version 2026-09-30 depuis Santé (geste
>   d'après la mise en ligne, non constaté au 24/10) ; d'ici là, la confirmation donne
>   l'adresse des conditions.
> - **Recette Stripe en mode test** à faire : texte sous le bouton avec et sans essai, durée
>   du webhook avec le rendu du PDF.

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.

Point résolu : archive du 30 septembre enregistrée avant publication, le 24 octobre à 08:13 UTC. La nouvelle version doit être archivée immédiatement après sa mise en ligne.
