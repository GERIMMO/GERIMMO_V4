---
type: process
tags: [devis, incident, artisan]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
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
