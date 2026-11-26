---
type: process
tags: [intervention, cloture, rapport, incident]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Propositions de fonctions majeures — version candidate du 13 octobre 2026]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)"]
---

# Intervention et clôture

**En une phrase :** exécuter l'[[Intervention]], produire le rapport officiel, clôturer
l'[[Incident]] et évaluer l'[[Artisan]].

## Déclencheur
- Rendez-vous validé ([[Planification d'intervention]]) → `createIntervention` (statut `planifiee`).

## Acteurs
- [[Artisan]] (exécute), gestionnaire (valide/clôture), [[Locataire]].

## Étapes
> [!warning] Ces cinq étapes décrivent l'ancien dépôt (Gerimmo V3), pas l'application d'aujourd'hui
> Relu le 22/11/2026 dans le code et la base d'essai : les transitions, le rapport PDF, les matériaux et les cinq
> critères de note ci-dessous **n'existent pas sous cette forme** dans l'application. Ce qui existe est décrit plus
> bas, section « État dans l'application au 22/11/2026 ». Les étapes sont gardées comme trace du cahier d'origine.

1. **Transitions** : `planifiee → confirmee → en_cours → terminee` (+ `suspendue`/`a_reprogrammer`/`annulee`).
   Par bot, l'artisan applique `confirmer`/`demarrer`/`terminer`.
2. **Matériaux** (`addInterventionMaterial`) + photos avant/pendant/après.
3. **Rapport** (`createInterventionReport`) : génère un [[Document]] PDF officiel (`rapport_incident`,
   `official_document = true`). Cycle : `previsualise → modifie → genere → valide` (+ download/print/email/archive).
4. **Clôture** (`createIncidentClosure`) : `validation` / `correction` / `nouvelle_intervention` /
   `cloture_reserve` / `cloture_normale`.
5. **Évaluation** (`createArtisanEvaluation`) : note multi-critères (qualité, respect RDV,
   communication, propreté, global) → `incident_artisan_rating_statistics`.

## Résultat / sorties
- Rapport PDF officiel archivé, incident clôturé, statistiques de notation de l'artisan mises à jour.

## Implications pour l'application
- La note artisan alimente le **score de recommandation** des futurs [[Devis]].

> [!warning] Notation : intention 3 niveaux vs code
> Précision humaine (2026-07-22) : la notation cible distingue **3 niveaux et 3 évaluateurs** —
> taux de réponse 24 h (automatique GERIMMO), qualité du travail ([[Locataire]]), prestation
> ([[Gérant]]). Le code actuel n'a qu'**une** évaluation multi-critères à la clôture, évaluateur
> non distingué, sans taux de réponse automatique. À spécifier/aligner — détail dans [[Artisan]].

## Ce que fait le code aujourd'hui : règlement déclaratif de la facture (depuis le 15/10/2026)
Décision D23 du dirigeant (14/10/2026, option A, fiches PRO2-21 et CHN-02, point X06),
**en production depuis le 15/10/2026** (PR #188, fusion `98f3fd7`, migration
`20261014610000_reglement_facture_intervention.sql`). Avant : la facture validée restait
« validée » sans date de règlement, l'écriture saisie à part au journal n'était liée ni à la
facture ni à l'incident, et l'artisan ne voyait rien.
- **Déclarer un règlement** sur une facture **validée**, depuis l'incident (gérant ou
  propriétaire) : montant, date, moyen, référence facultative. **Gerimmo n'effectue aucun
  paiement** (ni virement ni prélèvement) : le règlement est déclaratif, et l'écran le dit.
- Dans la même transaction, la base écrit l'**écriture de dépense** (catégorie « travaux »,
  lot de l'incident, pièce datée du règlement, imputée au jour de Paris) et le règlement ;
  un même envoi n'écrit qu'une fois (clé d'envoi).
- **Règlement partiel admis** ; le total ne dépasse jamais le montant de la facture ; une
  date future est refusée. États de la facture : déposée → validée → partiellement réglée →
  réglée (date du dernier règlement quand elle est réglée en totalité).
- **Imputation « locataire » admise** : le propriétaire règle l'artisan, **aucune créance
  sur le bail n'est créée**, l'écran le dit.
- **Retrait motivé** par contre-écriture, jamais par suppression ; l'écriture née d'un
  règlement ne s'annule pas depuis le journal (l'écran dit où agir).
- **Côté artisan** : pour ses factures seulement, l'état et la **date et le moyen** de chaque
  règlement, jamais la référence bancaire ni le détail des montants.
- La validation d'une facture est désormais écrite au journal d'audit (X06).

> [!warning] Points à trancher / contradictions (D23-A)
> - **Code ≠ spécification V3 sur l'imputation locataire** : le module 9 prévoit que la
>   validation d'une facture imputée au locataire crée une **créance sur le bail** (voir
>   [[Devis]]) ; D23-A, ratifiée, n'en crée aucune (réponse 2 de la fiche B.15). La
>   refacturation au locataire reste donc hors de ce geste.
> - **Non vérifié** : le parcours complet dans un navigateur (règlement noté par le gérant)
>   n'a pas été joué ; la recette de production ne le couvre pas (journal `log.md`, entrées
>   du 15/10).

## État dans l'application au 22/11/2026 (relu dans le code et la base d'essai)
Ce que fait réellement l'application, vérifié le 22/11/2026 sur la branche de préproduction de la mission palier 1
([[Mission palier 1 — audit du 22 novembre 2026]]). Les quatre premiers points étaient déjà en production le 22/11 ; les
lots de la mission, alors non publiés, sont **en production depuis le 25/11/2026** (version `062296e2`).
- **États d'une intervention** : `proposee → acceptee → planifiee → en_cours → terminee`, plus `refusee` et
  `annulee`. Il n'y a ni « confirmée », ni « suspendue », ni « à reprogrammer » : un rendez-vous qui tombe ramène la
  mission à « acceptée — rendez-vous à fixer » ([[Planification d'intervention]]).
- **Compte rendu de l'artisan** (`deposer_compte_rendu`) : les travaux réalisés, la cause constatée, l'imputation
  qu'il suggère (locataire, propriétaire ou dégradation fautive), le montant final, et s'il faut une nouvelle
  intervention. **Aucun rapport PDF officiel** n'est produit et il n'y a pas de saisie de matériaux.
- **Clôture de l'incident** (`cloturer_incident`) : trois motifs — résolu, sans suite, transmis au syndic — avec un
  commentaire ; un incident clos peut être rouvert avec un motif (`rouvrir_incident`).
- **Évaluation de l'artisan, par deux personnes** : le gestionnaire (`evaluer_artisan_gerant`) note **trois critères**
  de 1 à 5 — qualité, délai, prix — avec un commentaire ; le [[Locataire]] (`noter_artisan_locataire`, depuis le socle
  artisans du 11/09/2026) donne **une note globale** de 1 à 5 et un commentaire, facultatifs et jamais bloquants, sans
  critère de prix ni de technique. Deux des trois évaluateurs de l'encadré ci-dessus existent donc ; un « taux de
  réponse » calculé automatiquement n'a pas été trouvé dans le code de l'application (recherche du 23/11/2026).
  *Correction du 23/11/2026 : la première rédaction de cette section, la veille, disait à tort que seul le
  gestionnaire évaluait.*

### Ce que la mission palier 1 ajoute (préproduction le 22/11 ; en production depuis le 25/11/2026, version `062296e2`)
- **Facture refusée puis corrigée (lot 11).** Une facture d'artisan erronée se refuse avec un motif ; l'artisan en
  dépose une autre. Une intervention ne porte qu'**une facture en vigueur** ; la facture refusée reste au dossier,
  intacte ; refus et validation s'excluent (source : cahier Gerimmo V3, module 9, variante V5). L'avoir et la
  numérotation sont une question posée à l'expert-comptable (`JURISTE.md`, partie 4) : non tranchée.
- **Messages de l'intervention signalés (lot 12).** Un nouveau message dans la discussion d'une intervention est
  signalé à chacun de ses participants.
- **Relance d'une facture par l'artisan (lot 26).** Pour une facture déposée depuis 30 jours au moins et pas réglée
  en totalité, l'artisan peut relancer son client, puis une fois tous les 15 jours. La relance se lit sur la
  facture, à la chronologie et dans une alerte qui se ferme quand la facture est réglée en totalité ou refusée.
  **Aucun e-mail ne part.** Les deux délais sont des choix de l'agent, pas une règle de droit (`QUESTIONS.md`, Q31).
- **Rendez-vous manqué consigné (lot 26).** Voir [[Planification d'intervention]].
- **Garantie annoncée par l'artisan (lot 24).** L'artisan écrit sur son [[Devis]] la garantie qu'il annonce ; le
  gestionnaire la lit au dossier et sur le PDF, avec la mention « Engagement de l'artisan, pas de Gerimmo »
  (`QUESTIONS.md`, Q29).
- **Évaluation contestée (lot 7).** Le [[Super Admin]] examine une évaluation contestée par l'artisan et peut la
  retirer, avec un motif ; l'évaluation retirée reste en base, marquée comme telle (`QUESTIONS.md`, Q20).

> [!warning] Points à trancher / contradictions (relus le 22/11/2026)
> - **Cahier V3 ≠ application** sur le rapport d'intervention : le cahier prévoit un rapport PDF officiel avec cycle
>   de validation ; l'application n'a qu'un compte rendu saisi par l'artisan. Aucune décision du dirigeant ne dit si
>   le rapport PDF est attendu pour le palier 1 : il ne figure pas au plan fermé de la mission.
> - **Score de recommandation** : cette page dit que la note « alimente le score de recommandation des futurs
>   devis ». Le nombre de rendez-vous manqués imputés à l'artisan (lot 26) n'entre pas dans sa note (Q32).

## État dans l'application au 24/11/2026 (préproduction le 24/11 ; en production depuis le 25/11/2026, version `062296e2`) — ordre et compte rendu d'intervention

Relu dans le code après les lots 36, 37, 38, 42, 43 et 48 de la phase 3
([[Mission palier 1 — audit du 22 novembre 2026]] ; `QUESTIONS.md`, Q42 et Q51 ; `JURISTE.md`, partie 5, point 2).
- **Émis par le donneur d'ordre** : l'agence dans son espace ; ailleurs les détenteurs du [[Lot]] (pour les parties
  communes, ceux des logements de l'immeuble). L'ordre partait au nom technique de l'espace. Une lecture des détenteurs
  en échec refuse le document. Chez un propriétaire, l'ordre est refusé tant que le domicile ou le siège du bailleur
  n'est pas renseigné (juriste, point 2).
- **L'ordre d'intervention** est adressé à l'entreprise ; il donne le créneau avec ses heures (« le 26/11/2026 de 9 h à
  11 h », heure de Paris) et décrit les travaux commandés : le [[Devis]] rattaché, désigné par son auteur, sa version,
  ses dates, son montant TTC et ses travaux, sans référence (un même devis en a deux : Q51). Il imprime « Seuls les
  travaux du devis ci-dessous sont commandés. Aucun travail supplémentaire n'est autorisé par ce document sans accord
  préalable du donneur d'ordre. » Il est **refusé** pour une mission annulée ou refusée, et pour une mission sans devis
  (cas de données saisies directement en base seulement).
- **Le compte rendu d'intervention** (document du catalogue) est la pièce du donneur d'ordre qui consigne ce que
  l'[[Artisan]] a déclaré ; il n'a pas de destinataire. Il est refusé tant que l'artisan n'a pas déposé son compte
  rendu.
- **Documents d'[[Incident]]** : états neutres pour l'entreprise (« Signalé », « Terminé », « Refusée »…), sans les
  consignes internes de l'écran du gestionnaire ; un incident des parties communes produit ses documents avec
  l'immeuble. Le comparatif de devis et le récapitulatif d'incident, documents internes, gardent l'en-tête de l'espace
  (Q42, point 3). Dans le récapitulatif d'incident (tableau « Suivi des travaux », colonne « Compte rendu »), une
  mission terminée sans compte rendu se lit « non déposé ».
- **Mots des écrans** : en agence, le fil d'une intervention dit « Gestionnaire » ; chez un propriétaire, les écrans de
  l'intervention disent « Votre propriétaire » (Q42, point 4).

> [!warning] Points à trancher / contradictions (24/11/2026)
> - La section du 22/11 ci-dessus dit qu'« aucun rapport PDF officiel n'est produit » : c'est vrai du rapport à cycle de
>   validation du cahier V3. Le catalogue produit pourtant un **compte rendu d'intervention** en PDF, qui reprend la
>   déclaration de l'artisan sans la valider. Précision, pas correction du constat.
> - Faut-il que l'ordre imprime la référence du PDF du devis ? Il faudrait une petite fonction de lecture en base
>   (Q51, point 2).
