---
type: business-rule
tags: [loyer, prorata, arrondi, appel-de-loyer, quittance, conge]
status: stable
created: 2026-10-28
updated: 2026-10-28
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]"]
---

# Prorata du premier et du dernier terme

**Énoncé :** un terme de loyer qui ne couvre pas le mois entier (entrée ou sortie en cours de mois) se calcule **au réel des
jours du mois**, **composante par composante** (loyer hors charges d'un côté, charges de l'autre), avec **un seul arrondi au
centime, à la fin, sur chaque composante** ; le **total appelé est la somme des deux composantes arrondies**, jamais l'arrondi
d'un total proratisé. Cette règle est la même partout : appel de loyer en base, contrat (bail nu et bail meublé), avis
d'échéance, quittance, décompte de prorata.

## Fondement
- Pratique du prorata temporis au réel du mois (jours d'occupation / jours du mois), reprise par le
  [[2026-07-24-gerimmo-v3-module-3-loyers-et-charges|module 3 de la V3]] : « prorata d'entrée/sortie ».
- Décision du dépôt : migration `20260803_prorata_au_centime.sql` (« un seul arrondi, à la fin, sur chaque composante ;
  `montant_du` = somme des composantes »), reprise par `20260927102000_appels_terme_echu.sql` et
  `20261014120000_premier_terme_apres_entree.sql` (fonction `generer_appels_loyer_interne`).
- Audit final du 27/10/2026 (constat COD-01) : les contrats recalculaient le prorata sur le total, en virgule flottante,
  avec deux ordres d'opérations ; 148 833 couples (montant × mois × jour d'entrée) sur 30 millions donnaient un centime
  différent entre bail nu et bail meublé, et le contrat pouvait différer d'un centime du premier avis d'échéance.
  Correction : une seule fonction partagée (`app/src/lib/prorata-premiere-echeance.ts`), en centimes entiers.

## Portée
- S'applique à : [[Appel de loyer]], [[Bail]] (montant de la première échéance imprimé au contrat), [[Quittance de loyer]],
  [[Quittancement des loyers]], [[Solde de tout compte]] (dernier terme), [[Congé]].
- Conditions d'application : le bail entre après le 1er du mois (premier terme) ou prend fin avant le dernier jour du mois
  (dernier terme, `baux.date_fin` posée par le congé). Un bail qui entre un 1er et sort un dernier jour n'a que des termes
  pleins.

## Paramètres / valeurs
- Jours dus : du jour d'entrée au dernier jour du mois inclus (premier terme) ; du 1er au jour de fin inclus (dernier terme) ;
  les deux bornes à la fois si le bail entre et sort le même mois.
- Jours du mois : 28, 29, 30 ou 31 selon le mois réel (le 29 février compte).
- Formule : `loyer_prorata = round(loyer_hc × jours_dus / jours_mois, 2)` ; `charges_prorata = round(charges × jours_dus /
  jours_mois, 2)` ; `montant_du = loyer_prorata + charges_prorata`. Arrondi commercial (la demie vers le haut), identique à
  `round(numeric, 2)` de PostgreSQL et à `Math.round` sur des centimes entiers positifs.
- Exemple : 650,01 € + 100,01 € pour 15 jours sur 30 → 325,01 € + 50,01 € = **375,02 €** (l'arrondi du total proratisé
  donnerait 375,01 €).
- Exemple : 450 € + 50 € pour 25 jours sur 31 → 362,90 € + 40,32 € = **403,22 €**.

## Le dernier terme suit le congé (décision du 28/10/2026, migration `20261028100100`)
- À l'**enregistrement** d'un congé, si l'appel du mois de la date de fin existe déjà (congé saisi après le cycle du 1er), il
  est **recalculé** au prorata avec la même règle ; quittance ou reçu sont resynchronisés.
- À l'**annulation** d'un congé (le locataire reste), l'appel de l'ancien mois de sortie, né au prorata, **redevient un mois
  plein**.
- Si une **quittance ou un reçu de ce terme a déjà été envoyé** au locataire, l'appel n'est pas modifié : une alerte « Terme à
  régulariser » est posée au gérant, qui décide. Même alerte pour un terme appelé **après** la fin du bail (congé saisi très
  tard) : il n'est jamais supprimé ni modifié automatiquement.
- Le mois d'entrée et les mois pleins antérieurs ne sont **jamais** recalculés. La clôture anticipée du bail
  (`terminer_bail`, décision D34) laisse les montants tels quels.
- **Base du recalcul : le loyer en vigueur pendant la période**, jamais le loyer révisé depuis (relecture du 28/10). Un
  appel au mois plein garde ses propres loyer et charges ; un appel au prorata repart de l'ancien loyer de la première
  révision IRL qui prend effet après la fin du mois, à défaut du loyer du bail. Exemple : révision 450 → 482,14 € le 20/10,
  congé tardif avec fin le 25/09 → septembre = 375,00 + 41,67 = **416,67 €** (et non 443,45 €).
- Une quittance ou un reçu **déjà envoyé d'un autre terme** n'est pas réécrit par la nouvelle imputation des règlements :
  il reste tel qu'il a été délivré, et une alerte invite le gérant à le revoir.
- Un **avis d'échéance déjà envoyé** dont le montant change : alerte d'information « prévenez le locataire ».
- Les alertes « Terme à régulariser » qui n'ont plus d'objet (congé annulé ou modifié) **se ferment d'elles-mêmes**.

## Conséquences si non respectée
- Un centime d'écart entre le contrat signé et le premier avis d'échéance ou la quittance : contestation possible du
  locataire, image d'un produit approximatif.
- Un dernier terme laissé au mois plein : le locataire est compté impayé pour des jours non dus, la quittance couvre une
  période qu'il n'occupe plus ; laissé au prorata après rétractation : mois sous-facturé.

## Implications pour l'application
- Toute nouvelle écriture d'un prorata (document, e-mail, écran) passe par `prorataPremiereEcheance` côté application ou par
  `montants_appel_loyer(p_bail, p_mois)` côté base ; aucune formule locale.
- Tests : `app/tests/prorata-premiere-echeance.test.ts` (propriété sur 10 000 triplets : contrat nu = contrat meublé = règle
  de la base), `app/tests/prorata.test.ts` (appel de loyer), `app/tests/conge-dernier-terme-base.test.ts` (congé enregistré ou
  annulé après la génération).

> [!warning] Points à trancher / contradictions
> - La règle d'arrondi n'a pas de source réglementaire : c'est une convention du dépôt (migration du 03/08/2026), cohérente
>   avec la pratique (loyer et charges distincts sur la quittance, art. 21 de la loi du 6 juillet 1989). À confirmer si un
>   texte ou une jurisprudence impose un autre mode de calcul (par exemple sur 30 jours fixes).
