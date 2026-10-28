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
  régulariser » est posée au gérant. Même alerte pour un terme appelé **après** la fin du bail (congé saisi très tard) : il
  n'est jamais supprimé ni modifié automatiquement. L'application n'a **pas d'outil de régularisation** d'un terme appelé
  (évolution future, décision du 28/10) : l'alerte et la ligne du terme sur le bail donnent le **montant exact** (appelé en
  trop ou non appelé) et quoi faire. Terme appelé après la fin et **non payé** : « il n'est pas dû, ne le réclamez pas ».
  Terme **payé** (ou trop appelé et quittancé) : ce qui a été versé revient au locataire, « trop-perçu au solde de tout
  compte, ou remboursement » — le [[Quittancement des loyers]] intègre trop-perçu et dettes au [[Solde de tout compte]],
  qui prévoit la ligne « Trop-perçu éventuel — dû au locataire ».
- **Décompte de sortie** (`montants_reels_bail`, décision du 28/10) : il compte ce qui est **dû jusqu'à la fin du bail**.
  Un terme appelé après le mois de fin compte pour 0 ; le terme du mois de fin compte pour son montant dû, recalculé sur
  sa base (même s'il a été figé au mois plein par une quittance envoyée). Exemples : fin au 25/09, octobre appelé 500 € non
  payé, 2 000 € versés → trop-perçu 83,33 € (et non « impayés 416,67 € » retenus sur le dépôt) ; quittance d'octobre de
  500 € envoyée, 403,22 € dus → trop-perçu 96,78 €. Aucun appel n'est modifié.
- **Un terme d'un mois postérieur au mois de fin du bail n'est pas dû — une seule source de vérité** (décision du 28/10) :
  l'imputation des règlements (`etat_loyers_bail_brut`) le compte à 0, avec le statut « Non dû — après la fin du bail ».
  L'échéancier du bail, le reste dû, l'espace du locataire, le quittancement du mois, les relances automatiques (aucun
  courriel au locataire, aux colocataires ni à la caution), l'alerte d'impayé et le décompte disent la même chose. Ce qui
  a été versé dessus n'y est plus imputé : c'est un excédent du bail (« En avance » à l'écran, trop-perçu au décompte).
- Le mois d'entrée et les mois pleins antérieurs ne sont **jamais** recalculés. La clôture anticipée du bail
  (`terminer_bail`, décision D34) laisse les montants tels quels.
- **Base du recalcul : la base mensuelle qui a émis l'appel**, jamais le loyer révisé depuis (relectures du 28/10). Chaque
  appel mémorise à l'émission le loyer et les charges du mois plein qui l'ont produit (`appels_loyer.base_loyer_hc`,
  `base_charges`) : un mois plein est sa propre base ; un appel né au prorata garde la base du bail à son émission. Une
  révision IRL ne touche pas les appels déjà émis, même datée du 1er du mois de sortie. Exemples : révision 450 → 482,14 €
  le 20/10, congé tardif avec fin le 25/09 → septembre = 375,00 + 41,67 = **416,67 €** (et non 443,45 €) ; appel d'octobre
  émis à 500,00 €, révision le 20/10 (ou le 01/10), congé avec fin le 25/10 puis annulation → octobre revient à **500,00 €**
  (et non 532,14 €). Appels antérieurs à la migration : mois plein = ses montants ; prorata = ancien loyer de la première
  révision **enregistrée** après l'appel (même horodatage = même transaction, la révision est tenue pour postérieure : dans
  l'application révision et émission sont deux gestes distincts), à défaut le loyer du bail.
- Une quittance ou un reçu **déjà envoyé d'un autre terme** que la nouvelle imputation des règlements change est **réécrit**
  (il reste cohérent avec l'écran du bail : montant, versements listés, solde) et redevient « à envoyer ». Une alerte
  « Document envoyé remplacé » dit ce qui a été envoyé (nature, date, montant) et ce qui le remplace ; elle suit les
  encaissements suivants et se ferme quand le nouveau document part au locataire, ou quand il redevient identique à
  l'envoyé : il reprend alors sa marque d'envoi et sa date d'émission d'origine, et un remplacement ultérieur rouvre une
  alerte.
  Décision du 28/10 : rien n'est remis en l'état, un document recomposé à la lecture ne peut pas être figé sans gel des
  versements imprimés.
- Un **avis d'échéance déjà envoyé** dont le montant change : alerte d'information qui garde le montant de l'avis **envoyé**
  (« envoyé pour 500,00 € — le terme est maintenant de 403,22 € ») et **se ferme** si le terme y revient (annulation).
- Les alertes « Terme à régulariser » qui n'ont plus d'objet (congé annulé ou modifié) **se ferment d'elles-mêmes**.
- « Traiter » mène à la **ligne du terme** dans l'échéancier du bail, où la consigne est rappelée.

## Conséquences si non respectée
- Un centime d'écart entre le contrat signé et le premier avis d'échéance ou la quittance : contestation possible du
  locataire, image d'un produit approximatif.
- Un dernier terme laissé au mois plein : le locataire est compté impayé pour des jours non dus, la quittance couvre une
  période qu'il n'occupe plus ; laissé au prorata après rétractation : mois sous-facturé.

## Implications pour l'application
- Toute nouvelle écriture d'un prorata (document, e-mail, écran) passe par `prorataPremiereEcheance` côté application ou par
  `montants_appel_loyer(p_bail, p_mois, p_loyer, p_charges)` côté base (la base mensuelle est passée par l'appelant :
  celle qui a émis l'appel) ; aucune formule locale.
- Tests : `app/tests/prorata-premiere-echeance.test.ts` (propriété sur 10 000 triplets : contrat nu = contrat meublé = règle
  de la base), `app/tests/prorata.test.ts` (appel de loyer), `app/tests/conge-dernier-terme-base.test.ts` (congé enregistré ou
  annulé après la génération).

> [!warning] Points à trancher / contradictions
> - Régularisation d'un terme déjà quittancé ou appelé après la fin du bail : aucun outil (avoir, annulation de terme) dans
>   l'application au 28/10. Le terme après la fin est compté non dû partout ; le dernier terme figé au mois plein par une
>   quittance envoyée reste affiché à son montant appelé (seul le décompte de sortie retient le montant dû). Évolution à
>   décider.
> - La règle d'arrondi n'a pas de source réglementaire : c'est une convention du dépôt (migration du 03/08/2026), cohérente
>   avec la pratique (loyer et charges distincts sur la quittance, art. 21 de la loi du 6 juillet 1989). À confirmer si un
>   texte ou une jurisprudence impose un autre mode de calcul (par exemple sur 30 jours fixes).
