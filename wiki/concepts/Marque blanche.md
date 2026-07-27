---
type: concept
tags: [marque-blanche, charte, agence]
status: draft
created: 2026-07-25
updated: 2026-07-25
sources: ["[[2026-07-24-gerimmo-v3-module-17-marque-blanche]]"]
---

# Marque blanche

**Définition :** l'habillage de la plateforme aux couleurs de l'agence — objet
**Charte** (logo + couleur principale + couleur secondaire). **Aucun parcours, écran
ni libellé n'est modifié** (RM-17.3.3) : seul l'habillage change.
Source : [[2026-07-24-gerimmo-v3-module-17-marque-blanche|Module 17]].

## Fonctionnement

- **Activée par le [[Super Admin]]** selon le plan souscrit (RM-17.1.1) ;
  **personnalisée par l'[[Administrateur d'agence]]** (RM-17.2.1) au module 18 :
  logo (PNG/SVG transparent < 500 Ko), deux couleurs, **contrôle de contraste en
  alerte non bloquante**, prévisualisation, application immédiate, retour au défaut
  en un clic.
- **S'applique à** : espaces locataire/artisan/agent, **documents générés** (le logo
  et les couleurs sont injectés à la génération — la structure des modèles figés du
  module 12 **ne change jamais**, RM-17.2.4), emails, écran de connexion.
- **La mention Gerimmo reste visible** en pied de page — jamais supprimée
  (RM-17.2.6).
- **Pas de nom de domaine propre en V1** (V2) — coût support (DNS, TLS, SPF/DKIM)
  disproportionné pour un gain cosmétique.
- **Artisan multi-agences** : chaque ligne de son agenda consolidé porte le logo de
  l'agence concernée (RM-17.3.2) — il identifie son mandant d'un coup d'œil.

## Relations

Consomme [[Document]] (injection à la génération, module 12) et le paramétrage du
module 18 ; activée au plan ([[Grille tarifaire]], [[Abonnement]]) ; variables de
fusion « marque blanche » dans les modèles. Personnalisation du bot WhatsApp :
**abandonnée** (trop complexe).
