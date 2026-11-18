# UX 10A — Chantier externe artisan — 18 novembre 2026

Périmètre : recommandation 24, écran A18. Base `5dfe6b936a270ff9093def882b6dc26aff60e4af`, branche locale `codex/ux-accueil-proprietaire-20261118`. Un agent, sans push, fusion ou déploiement.

## Résultat

Le bloc **Étape suivante** décrit l’action adaptée à l’état du chantier. Un seul formulaire est visible : préparation/validation du devis, accord client, rendez-vous, démarrage, compte rendu ou facture. Le récapitulatif du devis reste présenté avant sa validation.

**Autres actions** conserve nouvelle version, actualisation des coordonnées, refus, report et annulations lorsqu’ils existent dans l’état courant. Une action secondaire choisie est clairement identifiée comme telle, avec retour vers l’étape suivante. Les formulaires sont masqués sans démontage : textes, dates, fichiers et écran de relecture restent en mémoire pendant les allers-retours.

Le devis, les justificatifs, les coordonnées et l’historique restent accessibles. « Enregistrer l’accord du client » remplace le libellé technique ; la date, le motif et la preuve obligatoire sont inchangés. Un devis validé n’est jamais présenté comme effectivement envoyé ; la transmission externe reste manuelle. Une facture déposée n’est pas présentée comme réglée.

Sur le cas « accord client », la page initiale passe de **2 726 à 1 397 px à 390 px**, et de **2 152 à 1 152 px à 1440 px**. Identité bleu nuit/or conservée. Captures avant/après : `captures/`, index `captures.json`.

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| Préparation, devis validé/accord attendu, accord client, rendez-vous, intervention, facture | **12 scénarios navigateur réussis**, six situations à 390 et 1440 px ; une seule action/formulaire visible |
| Retours entre accord, nouvelle version et annulation | Texte et fichier d’accord conservés ; motif d’annulation toujours obligatoire |
| Planning / report | Dates conservées après aller-retour ; motif du report toujours obligatoire |
| Intervention | Compte rendu et photo choisis conservés après aller-retour |
| Facture | Saisie → relecture existante → retour à la saisie ; numéro, montant et fichier conservés. Aucune confirmation définitive envoyée |
| Historique, mise en page | Historique accessible dans chaque scénario ; aucun débordement horizontal ni erreur JavaScript détectée |
| Comparaison avant/après | Les champs et le nombre de formulaires sont conservés dans les **12 comparaisons** (`invariants.json`) |
| Vérification du câblage | Les **11 formulaires** conservent exactement actions, paramètres, champs, validations et relectures ; seul le libellé d’accord change (`contrats-formulaires.json`) |
| Tests ciblés | **45 réussis, 0 échoué, 0 ignoré**, cinq fichiers ; couvre notamment les états, chantier sans devis, relecture de facture et interruption de session |
| TypeScript / ESLint ciblé | Réussis, sans erreur |
| Comptes non habilités | Deux comptes fictifs arrêtés par la garde des conditions artisan, sans chantier privé ni formulaire exposé. Ce contrôle ne constitue pas un nouvel audit RLS complet |

Les tests navigateur utilisent Chromium avec téléphone **simulé**, pas un appareil physique. Le script bloque les requêtes d’écriture et les destinations externes : `writes: []` dans `navigation-resultats.json`.

## Préservation et limites

- Présentation uniquement : aucun traitement d’écriture, calcul, règle métier, permission, statut, facture ou migration modifié.
- Recette sur six états fictifs préconfigurés dans la base locale existante. Elle vérifie la présentation, les interactions et la conservation de saisie ; elle ne prétend pas avoir conclu un nouvel accord ni émis une facture de bout en bout.
- Les cas sans devis, écriture désactivée, annulation, facture déjà déposée et état inconnu sont couverts par les tests ciblés ; les six situations principales ont en plus été parcourues dans le navigateur.
- Aucun paiement, envoi au client ou téléchargement de preuve contractuelle réelle n’a été déclenché. Les fichiers sélectionnés dans les formulaires sont fictifs et n’ont pas été soumis.
- Nettoyage vérifié : six clients, six devis, six chantiers et trois rendez-vous de recette supprimés par leurs seuls identifiants ; **zéro facture créée**, états initiaux inchangés avant nettoyage, deux chantiers préexistants et toutes leurs pièces conservés (`nettoyage.json`).

## Rejeu

`navigation.cjs` utilise les identifiants du manifeste et une session fictive locale passée par `GERIMMO_SESSION_FICTIVE` ; aucun secret ni session n’est commité. Les fixtures ont été nettoyées : les reconstituer dans le banc isolé avant de rejouer. `verifier-formulaires.cjs` compare le câblage au commit de départ. Ne pas utiliser ces scénarios en production.
