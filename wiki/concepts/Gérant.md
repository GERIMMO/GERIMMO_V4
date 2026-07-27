---
type: concept
tags: [vocabulaire, gerant, roles]
status: in-progress
created: 2026-07-22
updated: 2026-07-22
aliases: [Gestionnaire]
sources: []
---

# Gérant

**Définition (vocabulaire produit, décidé par l'humain le 2026-07-22) :** terme générique
désignant **la partie qui gère le bien face au [[Locataire]]**, c'est-à-dire indifféremment :
- l'**[[Agent immobilier]]** (et l'[[Administrateur d'agence]], « agent ++ ») quand le bien
  est géré par une **agence** ;
- le **[[Propriétaire bailleur]]** quand il gère en **direct** (organisation
  `independent_owner`).

## Usage
- Employé dans les pages cibles [[Bail]], [[Régularisation des charges]], [[Comptabilité]]
  pour éviter de répéter « agent immobilier ou propriétaire bailleur ».
- **Ce n'est pas un rôle technique** : aucun rôle `gerant` en base — les rôles réels restent
  ceux du [[Modèle de rôles et permissions]].
- **Synonyme : « Gestionnaire »** (tranché par l'humain le 2026-07-22) — le « Gestionnaire »
  de la note v0 ([[2026-07-21-fonctionnalites-par-persona-v0]]) désigne **le même concept** :
  propriétaire bailleur ou agent immobilier. Ce n'était pas un 7ᵉ persona → divergence n°9
  **résolue** ([[État du projet et décisions ouvertes]]).

## Relations
- Recouvre [[Agent immobilier]], [[Administrateur d'agence]], [[Propriétaire bailleur]].
- Cohérent avec la règle « un [[Bien]] = une seule org » (propriétaire OU agence, décision n°12).
