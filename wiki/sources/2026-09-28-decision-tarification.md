---
type: source
tags: [tarifs, abonnement, stripe, decision]
status: stable
created: 2026-09-28
updated: 2026-09-30
sources: []
source-file: "Consigne du porteur, session du 28/09/2026 (pas de document dans raw/)"
source-type: décision du porteur
source-date: 2026-09-28
---

# Décision tarifaire du 28 septembre 2026

Consigne écrite du porteur : nouvelle tarification, **le premier bien n'est plus
gratuit**. Elle remplace la grille du 05/09 (premier bien offert, 5,99 €/bien) et
le barème agence du 12/09. Détail normatif : [[Grille tarifaire]].

## Points clés
- **Particuliers et SCI gérant leurs propres biens** — formules TTC selon le nombre
  de biens, fonctions identiques : Solo 1 bien (5,99 €/mois, 59,90 €/an), Bailleur
  jusqu'à 3 (9,99 € / 99,90 €), Investisseur jusqu'à 10 (19,99 € / 199,90 €),
  Patrimoine jusqu'à 20 (29,99 € / 299,90 €) ; au-delà de 20, +1 €/mois ou
  +10 €/an par bien. Annuel = deux mois offerts, prélevé en une fois. Formule la
  moins chère proposée d'office ; jamais une plus chère sans montant et accord.
- **Agences** — mensuel HT selon les lots sous mandat actif : socle 39 € jusqu'à
  10 lots, +2 € (11ᵉ–50ᵉ), +1,50 € (51ᵉ–200ᵉ), +1 € (à partir du 201ᵉ), tranches
  cumulatives. Socle dû dès la souscription, même sous 10 lots.
- **Distinction par l'usage** : SCI gérant ses biens → particuliers ; agence
  gérant pour des tiers → agences.
- **Essai** 14 jours sans carte *(porté à **2 mois** le 30/09 — voir arbitrages)* ; aucune gratuité permanente ; souscription
  explicite à la fin ; jours restants préservés si souscription anticipée.
- **Résiliation** pour la prochaine échéance, accès payé conservé ; données en
  lecture seule et exportables ensuite, jamais supprimées automatiquement.
- **Comptage** : biens activement gérés (occupés ou vacants), archives exclues ;
  logement + annexes au même bail = 1 bien ; parking loué à part = 1 bien.
  Agences : lots distincts sous mandat actif, sans contournement par archivage.
- **Inclus** : accès locataires, propriétaires invités par une agence,
  collaborateurs. Travaux d'artisans toujours sur devis, hors abonnement ; aucune
  promesse de [[Signature électronique|signature électronique]], SMS ou services bancaires illimités.
- **Changements** : hausse après présentation (montant, date d'effet, prorata)
  et confirmation ; baisse à l'échéance ; pas de conversion annuel → mensuel en
  cours de période.
- **Existant** : pas de migration silencieuse ni de débit rétroactif ;
  procédure distincte après recensement et décisions ; anciennes promotions et
  parrainage non cumulés automatiquement, avantages accordés préservés.

## Arbitrages du porteur (même jour)
- **3 logements = 3 biens** (chaque lot loué séparément compte).
- **Le premier bien n'est plus offert** : la seule chose offerte, ce sont 14 jours,
  puis **gel** avec possibilité de visualiser jusqu'au paiement.
- **Bascule dès l'ajout de bien** pour les organisations existantes.
- **Pas de cumul** (parrainage, anciennes promotions).
- **Préavis de révision des prix : au moins un mois** (CGU art. 8.8).
- **Portail Stripe** : résiliation en fin de période, changement de formule
  désactivé (configuration posée par Gerimmo).
- **TVA : franchise en base** (art. 293 B du CGI) — aucune TVA facturée ;
  factures avec la mention « TVA non applicable, art. 293 B du CGI ».
- Mise en production demandée une fois tout au vert.
- **30/09 : essai porté à 2 mois** (« 2 mois gratuits »), pour tous — particuliers,
  SCI et agences — en mois calendaires ; les essais en cours sont prolongés à
  2 mois depuis l'ouverture ; CGU version du 30/09/2026 (art. 8.2). Le délai de
  rétractation du consommateur reste de 14 jours.
- **30/09 : 2 mois = offre de lancement jusqu'au 31/12/2026, puis 1 mois.** Toute
  inscription (ou ouverture par la console) jusqu'au 31/12/2026 inclus (date de
  Paris) reçoit 2 mois ; à compter du 1er janvier 2027, l'essai ordinaire est
  d'un mois. CGU art. 8.2 rédigé pour les deux périodes (version du 30/09/2026
  inchangée) ; migration `20260930110000_offre_lancement_essai`.
- **30/09 : parrainage réactivé — 1 mois offert au parrain à la conversion du
  filleul** (première facture non nulle payée) : avoir de son mensuel courant
  (annuel ÷ 12) ou un mois d'essai de plus ; rien de plus pour le filleul ; une
  récompense par filleul. Le « pas de cumul » est levé pour cette seule
  récompense. CGU art. 8.11 ; migration `20260930120000_parrainage_grille_2026`.

## Pages touchées
[[Grille tarifaire]] · [[Abonnement]] · [[Cycle de vie de l'abonnement]] ·
[[Parrainage]] · [[Onboarding et abonnement]] ·
[[Grille tarifaire agence — proposition]] · [[État du projet et décisions ouvertes]]
