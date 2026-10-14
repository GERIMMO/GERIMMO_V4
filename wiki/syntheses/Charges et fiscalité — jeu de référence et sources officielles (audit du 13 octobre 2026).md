---
type: synthesis
tags: [fiscalite, charges, audit-2026-10-13, mission-operationnelle]
status: draft
created: 2026-10-14
updated: 2026-10-14
sources: []
---

# Charges et fiscalité — jeu de référence et sources officielles (audit du 13 octobre 2026)

> [!warning] Limites de cette page
> Les montants attendus ont été calculés à part, par un script, sur un jeu de référence construit sur le banc local. **Aucune règle fiscale n'a été
> confrontée à une source officielle** : les sites officiels français sont bloqués par la politique réseau de l'environnement de l'audit, et les
> règles portent donc la mention « source officielle non consultée ». Tout changement de calcul reste à soumettre à une validation spécialisée.

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]] (CHF-01 à CHF-09, FIN-07, FIN-11), [[Régularisation des charges]], [[Rapport de gestion]].

## Inventaire des fonctions

| Fonction | Écran / point d'entrée | Code | Exercée ici |
|---|---|---|---|
| Échéancier des appels (prorata du mois d'entrée) | bail > « Générer l'échéancier » | SQL generer_appels_loyer_interne | oui |
| Encaissement imputé du plus ancien au plus récent, reçu / quittance | bail > « Encaisser » | actions/loyers.ts, trigger ecrire_encaissement | oui |
| Retrait d'un encaissement (contre-écriture + motif) | bail > « Retirer l'encaissement » | supprimer_encaissement | oui |
| Capture fiscale loyer HC / charges par paiement | trigger à l'INSERT | fiscal_encaissements_composantes | oui |
| Livre recettes-dépenses, saisie, journal, clôture, export CSV | /comptabilite, /comptabilite/export | actions/compta.ts | oui (clôture non rejouée) |
| Ventilation TEOM d'une taxe foncière | formulaire de saisie | lib/ventilation-teom.ts | oui |
| Répartition d'une dépense entre lots (clé) | « Répartir une dépense entre plusieurs lots » | SQL ventiler_depense_bien | oui |
| Annulation d'une écriture (contre-écriture) | journal > « Annuler l'écriture » | SQL contre_ecriture | oui |
| Grille de récupérabilité des charges de copropriété | (non branchée sur un écran de ce parcours) | lib/charges.ts | non |
| Récapitulatif fiscal 2044, exercice du lot, qualification des pièces, ligne 230 | /comptabilite/fiscal | lib/fiscal.ts, components/recapitulatif-fiscal.tsx | oui |
| Export CSV fiscal | /comptabilite/fiscal > « Exporter les montants (CSV) » | lib/fiscal-export.ts | oui |
| Document « Récapitulatif annuel · location nue » (PDF) | /documents/catalogue?modele=recap_fiscal_nu | lib/documents/modeles/catalogue-gestion.ts | oui |
| Régularisation annuelle des charges avec justificatif | bail > « Régulariser » | SQL regulariser_charges_avec_justificatif | oui |
| Documents de charges (courrier, décompte, consultation) | /documents/catalogue | catalogue-gestion.ts | oui |
| Révision IRL | bail > « Réviser le loyer » | SQL reviser_loyer | oui |
| Dépôt de garantie (encaissement plafonné) | bail > dépôt > « Encaisser » | actions/depot.ts | oui |
| Rapport de gestion, versement au mandant | /comptabilite (mandats) | actions/compta.ts | non (agences, hors V1 publique) |

## Tableau attendu / obtenu

| Cas | Attendu | Obtenu | Écart | Preuve |
|---|---|---|---|---|
| Appel 2025-03 bail A (HC / charges / total) | 427.74/32.90/460.64 | 427.74/32.90/460.64 | 0,00 | sql: appels_loyer |
| Appel 2025-04 bail A (HC / charges / total) | 780.00/60.00/840.00 | 780.00/60.00/840.00 | 0,00 | sql: appels_loyer |
| Appel 2025-05 bail A (HC / charges / total) | 780.00/60.00/840.00 | 780.00/60.00/840.00 | 0,00 | sql: appels_loyer |
| Nombre d'appels bail A (03/2025 à 10/2026) | 20 | 20 | 0,00 | sql |
| Nombre d'appels bail B (07/2024 à 10/2026) | 28 | 28 | 0,00 | sql |
| Composantes du paiement 2025-03-20 (460.64 €) bail A : HC/charges/non ventilé | 427.74/32.90/0.00 | 427.74/32.90/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2025-10-31 (5880 €) bail A : HC/charges/non ventilé | 5460.00/420.00/0.00 | 5460.00/420.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2025-12-20 (1680 €) bail A : HC/charges/non ventilé | 1560.00/120.00/0.00 | 1560.00/120.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-01-05 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-02-05 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-03-05 (500 €) bail A : HC/charges/non ventilé | 464.29/35.71/0.00 | 464.29/35.71/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-03-20 (340 €) bail A : HC/charges/non ventilé | 315.71/24.29/0.00 | 315.71/24.29/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-04-06 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-05-05 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-06-05 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-07-06 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-08-05 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-09-08 (840 €) bail A : HC/charges/non ventilé | 780.00/60.00/0.00 | 780.00/60.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-10-05 (900 €) bail A : HC/charges/non ventilé | 780.00/60.00/60.00 | 780.00/60.00/60.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Nombre de paiements actifs bail A | 14 | 14 | 0,00 | sql |
| Composantes du paiement 2025-12-31 (9900 €) bail B : HC/charges/non ventilé | 9000.00/900.00/0.00 | 9000.00/900.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-01-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-02-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-03-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-04-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-05-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-06-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-07-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-08-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-09-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Composantes du paiement 2026-10-02 (550 €) bail B : HC/charges/non ventilé | 500.00/50.00/0.00 | 500.00/50.00/0.00 | 0,00 | sql: fiscal_encaissements_composantes |
| Nombre de paiements actifs bail B | 11 | 11 | 0,00 | sql |
| CSV 2044 2026 (tous lots), ligne 211 | 12860,00 | 12860,00 | 0,00 | captures/fiscal-final.csv |
| CSV 2044 2026 (tous lots), ligne 221 | 150,00 | 150,00 | 0,00 | captures/fiscal-final.csv |
| CSV 2044 2026 (tous lots), ligne 223 | 592,55 | 592,55 | 0,00 | captures/fiscal-final.csv |
| CSV 2044 2026 (tous lots), ligne 227 | 1827,22 | 1827,22 | 0,00 | captures/fiscal-final.csv |
| CSV 2044 2026 (tous lots), ligne 229 | 600,00 | 600,00 | 0,00 | captures/fiscal-final.csv |
| CSV 2044 2026 (tous lots), ligne 250 | 2345,67 | 2345,67 | 0,00 | captures/fiscal-final.csv |
| CSV ligne 224, règle du produit (fonds travaux à part) | 2478,91 | 2478,91 | 0,00 | captures/fiscal-final.csv |
| CSV ligne 224, variante « la qualification justifiée prime » (FIN-07) | 3278,91 | 2478,91 | -800,00 | captures/fiscal-final.csv |
| CSV ligne 230 | 150,00 | 150,00 | 0,00 | captures/fiscal-final.csv |
| CSV ligne 212 / 213 | 0,00/0,00 | 0,00/0,00 | 0,00 | captures/fiscal-final.csv |
| CSV charges récupérées hors total | 1100,00 | 1100,00 | 0,00 | captures/fiscal-final.csv |
| CSV fonds travaux ALUR versé | 800,00 | 800,00 | 0,00 | captures/fiscal-final.csv |
| Écran : recettes confirmées | 12 860,00 € | 12 860,00 € | 0,00 | captures/fiscal-final.png |
| Écran : charges après 230, règle du produit | 7 844,35 € | 7 844,35 € | 0,00 | captures/fiscal-final.png |
| Écran : charges après 230, variante « qualification prime » | 8 644,35 € | 7 844,35 € | -800,00 | captures/fiscal-final.png |
| Écran : solde, règle du produit | 5 015,65 € | 5 015,65 € | 0,00 | captures/fiscal-final.png |
| Écran : solde, variante « qualification prime » | 4 215,65 € | 5 015,65 € | +800,00 | captures/fiscal-final.png |
| PDF récapitulatif nu lot A, ligne 211 | 7860,00 | 7860,00 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 221 | 150,00 | 150,00 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 223 | 312,45 | 312,45 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 224 | 1812,20 | 1812,20 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 227 | 1047,22 | 1047,22 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 229 | 600,00 | 600,00 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 230 | 150,00 | 150,00 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot A, ligne 250 | 2345,67 | 2345,67 | 0,00 | captures/recap-nu-lotA.txt |
| PDF récapitulatif nu lot B, ligne 211 | 5000,00 | 5000,00 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 221 | 0,00 | 0,00 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 223 | 280,10 | 280,10 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 224 | 666,71 | 666,71 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 227 | 780,00 | 780,00 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 229 | 0,00 | 0,00 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 230 | 0,00 | 0,00 | 0,00 | captures/recap-nu-lotB.txt |
| PDF récapitulatif nu lot B, ligne 250 | 0,00 | 0,00 | 0,00 | captures/recap-nu-lotB.txt |
| Régularisation A 2025 : provisions | 572.90 | 572.90 | 0,00 | sql: regularisations_charges |
| Régularisation A 2025 : charges réelles au prorata des jours (292 j) | 562.54 | 562.54 | 0,00 | sql |
| Régularisation A 2025 : écart (+ trop-perçu / − complément) | 10.36 | 10.36 | 0,00 | sql |
| Régularisation B 2025 : provisions | 600.00 | 600.00 | 0,00 | sql: regularisations_charges |
| Régularisation B 2025 : charges réelles au prorata des jours (365 j) | 650.40 | 650.40 | 0,00 | sql |
| Régularisation B 2025 : écart (+ trop-perçu / − complément) | -50.40 | -50.40 | 0,00 | sql |
| Régularisation A 2026 (exercice en cours) : provisions | 600.00 | 600.00 | 0,00 | sql: regularisations_charges |
| Régularisation A 2026 (exercice en cours) : charges réelles au prorata des jours (365 j) | 640.00 | 640.00 | 0,00 | sql |
| Régularisation A 2026 (exercice en cours) : écart (+ trop-perçu / − complément) | -40.00 | -40.00 | 0,00 | sql |
| Ventilation toiture : part lot B | 666.71 | 666.71 | 0,00 | sql: ecritures |
| Ventilation toiture : part lot A | 333.30 | 333.30 | 0,00 | sql: ecritures |
| Taxe foncière hors TEOM lot A (1234,56 − 187,34) | 1047.22 | 1047.22 | 0,00 | sql: ecritures |

## Règles confrontées aux sources officielles

Aucune source officielle n'a pu être lue le 14/10/2026 (service-public.fr et impots.gouv.fr : getaddrinfo ENOTFOUND ; WebSearch : titres et URL seulement). Les URL ci-dessous sont celles renvoyées par la recherche ou citées par le produit, NON LUES. Aucune règle n'est confirmée de mémoire.

| Règle | Observé dans le produit | Source officielle (URL, non lue) | Date | Verdict |
|---|---|---|---|---|
| 2044 : intitulés et numéros des lignes 211, 212, 213, 221, 222, 223, 224, 225, 227, 229, 230, 250 | Le produit imprime ces 12 lignes (écran, CSV, PDF). | https://www.impots.gouv.fr/sites/default/files/formulaires/2044/2026/2044_5483.pdf (renvoyé par la recherche, NON LU) ; lien du produit : …/2044_5487.pdf (NON LU, numéro différent à vérifier) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée |
| 211 = loyers bruts encaissés hors charges, par année d'encaissement, avances comprises selon qualification | 211 = parts HC des paiements de l'année ; charges encaissées hors 2044 ; avance traitée selon la qualification saisie (12 860,00 sur le jeu). | impots.gouv.fr — notice 2044 (non lue) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; cohérent avec sa propre règle (77 cas comparés) |
| 221 à 224, 227, 250 : déductibilité d'une dépense | Rien n'est compté sans qualification justifiée du propriétaire ; mots-clés = simple proposition. | impots.gouv.fr — notice 2044 (non lue) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée |
| 227 = taxe foncière hors TEOM ; TEOM récupérable sur le locataire exclue de la déduction | 1 234,56 saisis avec TEOM 187,34 -> 227 = 1 047,22 et 187,34 « hors déclaration ». | impots.gouv.fr / service-public.fr (non lus) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; calcul au centime conforme |
| 229 provisions de copropriété versées dans l'année ; 230 régularisation N-1 à retrancher des charges | 229 compté en entier ; 230 saisie à la main (150,00) et retranchée : charges brutes 7 994,35 - 230 (150,00) = 7 844,35. | impots.gouv.fr — notice 2044 (non lue) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée |
| Fonds de travaux ALUR : non déductible l'année du versement (texte de l'écran : « se déduisent l'année où les travaux sont réalisés ») | Mis à part, même si le propriétaire qualifie la pièce « déductible 224 » (FIN-07 : écart de 800,00 sur 224 et sur le solde). | service-public.fr / impots.gouv.fr (non lus) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; le choix du propriétaire est enregistré sans effet (FIN-07) |
| Micro-foncier : recettes <= 15 000 € et abattement de 30 % (texte de l'écran) | Texte affiché en pied de page ; aucun calcul micro-foncier. | impots.gouv.fr (non lu) ; le wiki Fiscalité ne cite que des blogs commerciaux | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée |
| Dépôt de garantie : exclu des recettes 2044 ; plafonné à 1 mois de loyer HC (nu) / 2 (meublé) ; encaissement plafonné au dépôt du bail | Dépôt de 500 € encaissé : 211 inchangé (12 860,00) ; 600 € pour 500 dus refusé (« plafonné au dépôt du bail »). | service-public.fr F34661 et F31269 (cités par le code, NON LUS) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; comportement conforme au wiki « Dépôt de garantie » |
| Régularisation annuelle : année civile, prorata des jours d'occupation, justificatif obligatoire | A 2025 : 292 j / 365, réel 703,17 -> 562,54 ; provisions 572,90 ; écart +10,36. B 2025 : -50,40. Justificatif refusé s'il manque. | service-public.fr (non lu) ; loi du 6/7/1989 art. 23 (non lue) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; conforme au wiki « Régularisation des charges » (prorata en jours, justificatif bloquant) |
| Régularisation : provisions = charges des APPELS de l'exercice (non des paiements reçus) | provisions_charges_annee somme appels_loyer.charges. | service-public.fr (non lu) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; choix du produit non documenté dans le wiki |
| Régularisation d'un exercice non terminé | Acceptée (A 2026 : provisions 600,00 sur 10 mois contre réel 640,00 d'une année pleine -> « complément 40,00 » alors que l'année pleine donnerait +80,00). | service-public.fr (non lu) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | écart interne avéré (CHF-02) ; règle officielle non consultée -> validation spécialisée recommandée |
| Prescription triennale du complément (art. 7-1) ; régularisation tardive et douzièmes (art. 23) | Code SQL lu ; dates non rejouées sur le banc. | legifrance.gouv.fr (non lu) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non testé ; non vérifiable — source officielle non consultée |
| Révision IRL : nouveau loyer = loyer x indice nouveau / indice de référence, même trimestre, une fois par année de bail, sans rétroactivité | 780 x 145,50 / 144,00 = 788,125 -> 788,13 (demi vers le haut). Refus : même année d'indice, autre trimestre, demande future, seconde révision. Indices FICTIFS (T2 2025 = 144,00 ; T2 2026 = 145,50). | legifrance.gouv.fr art. 17-1 loi 1989 ; INSEE (non lus) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | formule conforme au wiki « Révision annuelle IRL » ; valeurs d'indice et plafonnement légal non vérifiables — source officielle non consultée |
| Quittance : émise quand le mois est soldé ; montant de l'appel, non du virement | Mars : 500 + 340 -> une quittance de 840,00 ; octobre : virement 900 pour 840 dus -> quittance de 840,00. | service-public.fr (non lu) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée ; cohérent avec le wiki « Quittance conforme » |
| Décompte de charges communiqué un mois avant, justificatifs consultables six mois (texte du document) | Seul le document « Consultation des justificatifs » se génère ; courrier et décompte sont bloqués (CHF-03). | service-public.fr / legifrance (non lus) | 2026-10-14 — tentative échouée le 14/10/2026 (getaddrinfo ENOTFOUND) : source officielle non consultée | non vérifiable — source officielle non consultée |
