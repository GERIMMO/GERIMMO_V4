# Suivi des loyers du propriétaire

Référence de départ `77e33d7061a507f039768ccc5535244b0768362e`. Toutes les vérifications avec écriture reposent sur un dossier fictif dans le banc local.

## Reproduction

AUD-008 et AUD-009. Sur la version de référence, le test navigateur à 390 px échoue dès l’accueil. Il attend des montants distincts pour les échéances et trouve l’ancienne présentation. Les [captures de l’audit, dans la section Propriétaire](https://github.com/GERIMMO/GERIMMO_V4/blob/codex/audit-produit-20261127/livrables/audit-produit-20261127/RAPPORT.md), montrent le filtre tronqué et l’ancien libellé commun. Les tests de la carte de tâches vérifient le nombre d’obligations, y compris les groupes repliés.

La [première CI](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/46052397938) a validé 360 tests navigateur dans la suite principale. Le parcours Acacias a ensuite échoué dans la suite courriels. L’échéance de 640 € était générée, mais le nouveau résumé du bail avait perdu le nombre de termes appelés. Après rétablissement du nombre, les quatre parcours courriels ont réussi dans la boîte fictive locale, y compris l’inscription, la génération de l’échéance, son encaissement et l’impression de la quittance sur le même bail. Les assertions de ce parcours ont été conservées.

## Captures

| Écran | 390 px | 768 px | 1440 px |
|---|---|---|---|
| Accueil propriétaire | [Capture](accueil-390.png) | [Capture](accueil-768.png) | [Capture](accueil-1440.png) |
| Suivi des loyers, patrimoine SCI sélectionné | [Capture](finances-390.png) | [Capture](finances-768.png) | [Capture](finances-1440.png) |
| Fiche du bail, rubrique Loyers et paiements | [Capture](bail-390.png) | [Capture](bail-768.png) | [Capture](bail-1440.png) |

Les largeurs indiquent celles de la fenêtre du navigateur. Les images cadrent le contenu utile. Le scénario contrôle l’absence de débordement, la sélection SCI, le lien vers les règlements du bail et les montants effectivement téléchargés dans le PDF et le CSV.

## Montants vérifiés

| Cas | Attendu | Reçu | Compensé | Reste dû | Preuve |
|---|---:|---:|---:|---:|---|
| Versement partiel enregistré | 640,00 € | 240,00 € | 0,00 € | 400,00 € | [Test navigateur et téléchargements](../../app/e2e/suivi-montants-loyers.spec.ts) |
| Même échéance avec une imputation fictive explicite | 640,00 € | 240,00 € | 100,00 € | 300,00 € | [Test du calcul et des modèles d’export](../../app/tests/suivi-montants-loyers.test.ts) |

Le premier cas utilise les encaissements enregistrés sur le banc. Le second injecte une imputation dans un jeu de données de test. Les données applicatives actuelles renseignent les versements rattachés à chaque échéance. Une régularisation ou un dépôt repris au décompte de départ ne constitue pas une imputation à une échéance précise. Les avances et les crédits sans imputation restent hors des totaux d’échéance.

Le suivi PDF est un document de gestion distinct de la quittance. Sur un bail dont le décompte est finalisé, la fiche présente l’écart historique et oriente vers le décompte pour connaître la situation de recouvrement.
