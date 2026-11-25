# Passe 2 (89cb87ff) — relecture documents générés et envois (lecture seule)
**Verdict : aucun défaut bloquant ni majeur dans ce périmètre.** Un trou de couverture sur le congé pour vendre ou pour reprendre (point 2) ; ce n'est pas un défaut du produit.

## Documents
1. **Rendus sans erreur (vérifié), IA activée et coupée.** Status VITEST_EXIT=0 et ANOMALIES=0 ; 6 familles à VITEST_EXIT=0. Aucun « undefined », NaN, « Invalid Date » ni gabarit vide ; aucun PDF sans texte. Mêmes refus et champs à compléter qu'en passe 1, sauf le congé (point 2). Les autres écarts viennent des données, pas d'une régression.
2. **Congé pour vendre ou reprendre : plus aucun rendu sur le banc** (admin, propriétaire, toute la base). Refus « Indiquez si le logement a été acheté alors qu'il était déjà loué ».
   - Règle nouvelle et voulue (`modeles/conge-bailleur.ts:138-144`) ; le banc n'envoie pas `achete_occupe`.
   - L'écran pose la question (`generer-conge-bailleur.tsx:194,286`, `catalogue-options.ts:47-48`) ; `prudences-juridiques.spec.ts:164` passe dans les deux modes.
   - **Aucun PDF de congé pour vendre de 89cb87ff produit ici.** Article 15 II vérifié dans le code seulement : 5 alinéas, empreinte recalculée = c2cdca5f…aece0, refus si le texte n'est plus intact (`conge-bailleur.ts:150-156`).
   - Correction du banc : `achete_occupe:"non"` dans `zz-phase3-documents.test.ts` (vente, reprise), puis relire un PDF.
3. **Bail nu** (org-13ee9fb4, `bail_nu-1-p-3.png`) : première échéance juste, 745,00 € ; prorata 17/31 = 378,39 + 30,16 = 408,55 € (recalculé).
4. **Bail meublé** : effet au 1er, 665,00 € sans prorata ; la phrase de durée réduite (location nue) est retirée, à juste titre.
5. **Solidarité présente partout** (vérifié) :
   - bail commun : article 8-1, fin au remplacement ou au plus tard à 6 mois (`bail_colocation-1-p-3.png`) ;
   - baux individuels : « aucune solidarité » ;
   - caution solidaire : renonciation discussion et division, mention 2297, alinéa du 22-1 (`cautionnement-1-solidaire-p-2.png`) ;
   - avenant de remplacement : 8-1 VI.
6. **Sortie et dépôt corrects** : reçu de dépôt ; état des lieux de sortie avec la date d'entrée (01/09/2023) ; décompte de restitution (vétusté exacte, 417,87 € retenus, 262,13 € rendus) ; avenant. Les mentions retirées (article 24, « Non fourni », encadré Notification) sont des retraits voulus.

## Envois
7. **Aucun e-mail à l'état envoyé dans les 4 passes.** `courriels-durables.txt` : une ligne, `lib/notifications | en_attente | Pilote limité` ×5, identique partout. `notifications.txt` : seulement `a_preparer` et `obsolete`. `web.log` : 5 « lien-mot-de-passe non confirmé », comme en passe 1.
8. **Nouveau, sans risque.** `piece_demandee` ×2 : circuit déjà présent en passe 1 (`notifications.ts:1302`), exercé par un nouveau parcours. `relance_report_rdv` et `relance_loyer_manuelle` : fermés en base (migration `20261125110000` l.38 et l.158-160 ; `reception-loyer.ts:144`), jamais tentés sur le banc.

## IA coupée
9. **Verte au premier essai** : E2E_EXIT=0 ; 354 réussis, 3 ignorés, aucun échec ni instable. L'IA est restée coupée (IA_EN_BASE et IA_APRES_SUITE à faux, `ia.log` = f).
10. **Une seule exclusion, justifiée** : `interrupteur-ia.spec.ts:27` (`passe.sh:36`), qui rallume l'IA ; même exclusion qu'en passe 1. Les parcours de la passe 1 sont tous là, plus 45 nouveaux.

**Non vérifié :** un PDF réel de congé pour vendre ou reprendre ; les nouveaux circuits avec interrupteur ouvert ; le nom des 3 parcours ignorés.
**Hors seuil :** `quittance-3` (CAF) laisse la signature seule en page 2 ; « reçu de Fictif Hugo 600 € » alors que 210 € viennent de la CAF (`quittance.ts:211`, inchangé), au juriste.
