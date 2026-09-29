---
type: synthesis
tags: [audit, securite, facturation, conformite, baux, gestion]
status: stable
created: 2026-09-29
updated: 2026-09-29
sources: ["[[2026-09-28-decision-tarification]]", "[[2026-09-28-reseau-national-ouvertures-locales]]"]
---

# Audit complet du 29 septembre 2026

Audit mené la veille du lancement, en cinq revues parallèles (sécurité et base,
facturation, site public et conformité, parcours métier par persona, santé du
wiki), puis corrigé et mis en production le même jour. Suite de l'[[Audit complet
du 27 septembre 2026]].

## Sécurité et base
- Formulaire de devis : l'anti-abus ne se contourne plus (date de création imposée).
- [[Comptabilité]] : une écriture ne peut plus être forgée « automatique » ni
  rattachée au mandat ou au dépôt d'une autre organisation.
- Agents à portefeuille restreint : partage et validation de documents bornés au
  portefeuille ; fonctions internes sans fuite d'existence.
- Non traité : colonnes sensibles de l'organisation lisibles par les locataires
  (l'IBAN leur sert à payer) ; invitations d'agents et de locataires.

## Facturation ([[Abonnement]], [[Cycle de vie de l'abonnement]])
- Plus de double souscription ; webhooks relus chez Stripe (ordre et rejeu).
- Capacité payée dépassée signalée, jamais prélevée d'office.
- Premier prélèvement refusé après l'essai → gel immédiat.
- Baisse et changement de périodicité à l'échéance par échéancier Stripe.
- Mention « TVA non applicable, art. 293 B du CGI » sur toutes les factures.
- Avis de reconduction de l'annuel aux particuliers (L. 215-1), rappel de fin d'essai.

## Site public et conformité
- robots.txt, sitemap, métadonnées et aperçus de partage.
- Conditions générales d'utilisation et de vente : reconduction (8.7), révision
  (8.9), rétractation (8.10), conservation, disponibilité, plafond de
  responsabilité, mise en demeure, annexe art. 28 RGPD ([[RGPD]]).
- Confidentialité : bases légales, garanties de transfert, durées.
- Plus de « propriétaires invités » annoncés ; essai agence ouvert sur demande.

## Parcours métier
- [[Révision annuelle IRL]] sans effet rétroactif ; trimestre de l'indice contrôlé.
- [[Bail]] : 3 ans pour SCI familiale et indivision ; départ d'un colocataire avec
  solidarité de 6 mois ; congé pour vente avec prix (location nue seulement).
- [[Garantie]] : reproduction de l'art. 22-1 dans l'acte de caution.
- [[Mandat de gestion]] : mentions consommateur ; pas de location ni
  d'encaissement sans mandat en cours pour une agence.
- [[Régularisation des charges]] : quote-part par chambre en colocation,
  prescription de 3 ans, étalement sur 12 mois.
- Retenues sur dépôt possibles sans EDL d'entrée (art. 1731 C. civ.).
- [[État des lieux]] signé sur preuve (PDF signé ou constat).
- Relances : seuil minimal, information du garant ; fiscalité 2044 corrigée.
- Gel : seules les saisies des gérants sont refusées ; locataires, artisans et
  mandants continuent.

> [!warning] Points à trancher / contradictions
> - Identité de l'éditeur et médiateur de la consommation : à fournir par le porteur.
> - Suspension des relances pendant un plan d'apurement : aucun circuit de plan
>   n'existe encore.
> - Mensualités d'étalement de régularisation : enregistrées, non encore appelées.
> - Médiateur de l'agence absent du profil : blanc laissé dans le mandat.
