---
type: process
tags: [devis, incident, artisan]
status: in-progress
created: 2026-07-21
updated: 2026-09-11
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Demande et sélection de devis

**En une phrase :** mettre des [[Artisan|artisans]] en concurrence sur un [[Incident]] et
retenir un [[Devis]].

## Déclencheur
- Le gestionnaire crée une demande de devis pour un incident.

## Acteurs
- Gestionnaire ([[Agent immobilier]]/[[Administrateur d'agence]] ou [[Propriétaire bailleur]]),
  [[Artisan|artisans]] destinataires.

## Étapes
1. **Création** (`createQuoteRequest`) — statut `demande` + insertion des destinataires (`incident_quote_recipients`).
2. **Envoi** (`sendQuoteRequest`) — pose `sent_at`. L'artisan reçoit la demande (dashboard ou **bot**).
3. **Réception** — `receiveQuote`, ou côté artisan `submitArtisanQuote` (montant TTC en euros) → destinataire `recu`.
4. **Comparaison** — `incident_quote_comparisons` avec **score de recommandation**
   (prix 45 %, note artisan 35 %, justificatifs validés) — voir [[Devis]].
5. **Sélection** (`selectQuote`) — le devis retenu passe `retenu`, les autres reviennent à `recu` ;
   demande et destinataire passent `retenu` (contrôles stricts sur le nombre de lignes touchées).

## Résultat / sorties
- Un [[Devis]] `retenu` désignant l'artisan pour la suite → [[Planification d'intervention]].

## Automatisations
- L'artisan répond aux demandes par **bot** (`showArtisanQuoteRequests`, `startQuoteAnswer`).

## Règles et contraintes
- `allow_single_private_artisan = false` par défaut (mise en concurrence par défaut).

## État dans l'application au 11/09/2026

La mise en concurrence est en place : consultation ouverte sur un incident
**qualifié** (aucune affectation sans imputation, RM-7.2.7), **deux artisans au
maximum en parallèle** (RM-9.1.1), devis daté avec sa **validité** (caduc passé
l'échéance, RM-9.2.3), et un seul devis retenu par incident.

La liste des artisans proposables est calculée **par la base** — métier
(RM-8.3), zone par code postal exact, décennale selon la **nature des travaux**
(RM-8.2.9, sans interrupteur), validation plateforme et listes noires locale et
globale. L'écran n'en refait aucun morceau.

> [!warning] Deux pièges constatés le 11/09
> - Un artisan **sans aucun code postal n'est proposé nulle part** : la
>   comparaison est exacte et le bien en porte toujours un. Le formulaire
>   conseillait l'inverse ; il exige désormais la zone.
> - **Retirer une mission** laissait le devis « retenu » et rendait l'incident
>   inaffectable définitivement. L'annulation libère maintenant le devis, comme
>   le fait le refus de l'artisan.
