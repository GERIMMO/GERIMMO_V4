---
type: synthesis
tags: [audit, ged, documents, recette]
status: stable
created: 2026-10-02
updated: 2026-10-02
sources: []
---

# Audit des refus de doublon du 2 octobre 2026

La [[GED]] applique « un fichier = un dépôt » : un contenu déjà rangé dans
l'organisation (empreinte identique) est refusé. Un testeur a buté sur une
notice regénérée à l'identique ; l'audit passe en revue les vingt circuits de
dépôt pour trouver les cas où ce refus bloque un geste légitime, ment, ou
laisse des fichiers orphelins. Rien n'est automatique : aucun cron ne range de
PDF, les courriels portent des liens et jamais de pièce jointe.

## Déjà corrigé (PR #156)
- Document généré sans changement (bail, notice, mandat, décompte…) : montré
  au lieu d'être refusé.

## Bloquants
| Circuit | Qui | Problème |
|---|---|---|
| Diagnostics (fiche du lot) | gérant | un rapport unique (DPE + amiante + plomb dans un PDF) ne peut servir qu'à un seul diagnostic ; si l'enregistrement échoue après le rangement, le même rapport n'est plus jamais acceptable |
| Règlement de copropriété sur le bail | gérant | même PDF pour tous les baux de l'immeuble : refusé dès le deuxième bail |
| Pièce réclamée déposée par le locataire | locataire | aucun contrôle avant montée : le refus arrive après, sous un message faux (« réessayez »), un fichier orphelin contenant des données personnelles à chaque essai, jamais purgé |
| Attestation d'assurance du locataire | locataire | même profil (colocataires sur une seule attestation, attestation déjà rangée par le gérant) |
| Facture d'artisan | artisan | une facture couvrant deux missions est refusée sur la seconde ; fichier orphelin |

## Gênants
- Justificatif d'appel de charges : un appel du syndic couvre plusieurs lots.
- Pièce de dossier d'une personne : même justificatif pour deux personnes, ou
  déjà déposé par le locataire depuis son espace.
- Justificatif de retenue à la restitution : un devis multi-postes ventilé en
  deux retenues.
- Preuve de signature de l'état des lieux : impossible si le PDF est déjà en
  GED (la signature exige un fichier).
- Photos d'incident : même photo sur deux incidents ; pour un locataire, le
  pré-contrôle est inopérant et l'incident peut être créé sans photo ni
  description.
- Compte rendu mensuel : si le même PDF a été généré depuis Documents, la
  remise échoue avec « réessayez » alors que le rapport est déjà figé.
- Attestation d'artisan déposée sous un autre type : message générique faux,
  orphelin impossible à purger.
- Photos de chantier d'un artisan : même photo avant/après refusée, orphelin.

## Détails
- Régularisation de charges et congé avec justificatif : purge propre, cas
  rare.
- Remplacement d'une version dans Documents : orphelin seulement en cas de
  course entre deux onglets.
- Retour d'un document signé par le locataire : message juste, orphelin.
- Devis d'artisan : message juste, pièce facultative.
- Visuel marketing : géré, borné, journalisé.

## Cause commune et remède
Deux défauts se répètent :
1. Côté gérant, le document est rangé avant la ligne métier, et aucun appelant
   ne réutilise l'identifiant du doublon que la GED renvoie pourtant. Remède :
   traiter le doublon comme un dépôt réussi (réutiliser le document existant),
   comme le fait déjà la génération de documents.
2. Côté locataire et artisan, le fichier est monté avant tout contrôle, la
   fonction SQL n'attrape pas la violation d'unicité, et la purge des orphelins
   est réservée aux gérants. Remède : contrôle d'empreinte dans la fonction,
   message clair, rattachement de la pièce existante quand c'est légitime, et
   purge ouverte au propriétaire du fichier.

> [!warning] Points à trancher / contradictions
> - Facture d'artisan couvrant plusieurs missions : réutiliser le même
>   document pour chaque intervention, ou exiger une facture par intervention ?
> - Pièce réclamée déjà rangée par le gérant : la rattacher d'office à la
>   demande du locataire, ou la lui signaler ?
