---
type: synthesis
tags: [concurrence, marche, positionnement]
status: in-progress
created: 2026-07-22
updated: 2026-11-27
sources: ["[[2026-07-22-rentila-site-web]]", "[[2026-07-22-smovin-site-web]]", "[[2026-07-22-oskar-la-boite-immo]]", "[[Vision de l'écosystème Gerimmo]] (sections 1 à 3)", "[[Vision de l'écosystème Gerimmo]] (section 11)", "[[Canaux de communication]]", "[[Référentiel du palier 1]] (R-ADM-11, C-38)", "[[Grille tarifaire]]", "log.md — entrée « query » du 20/09/2026 (lancement sans WhatsApp)", "recherche dans app/src et app/supabase/migrations le 26/11/2026 (aucun code Telegram ni WhatsApp)"]
---

> [!important] Mise à jour du 26/11/2026 — lire d'abord la feuille de route
> Cette analyse date du 22/07/2026. Le marché, les concurrents, leurs prix et la place libre sont repris et actualisés
> dans les **sections 2 (« Le marché ») et 3 (« La concurrence » : ce sans quoi on ne vend pas, prix pratiqués, place
> libre, canaux d'acquisition)** de la [[Vision de l'écosystème Gerimmo]]. L'état réel de
> Gerimmo au 26/11 est dans sa section 1. Ici, seules deux erreurs sont corrigées :
> - **Aucun bot n'est construit.** Ni Telegram (abandonné le 25/07/2026, [[Canaux de communication]]) ni WhatsApp
>   (reporté le 20/09/2026 à après le lancement, jamais construit ; question C-38 du [[Référentiel du palier 1]]). Les canaux
>   sont l'e-mail et l'espace personnel (règle R-ADM-11). Le code ne contient aucun envoi Telegram ou WhatsApp
>   (recherche du 26/11/2026) ; il ne reste qu'une valeur par défaut `email_whatsapp` dans une colonne de la table
>   `demandes_pieces` (migration `20260903205800`).
> - **Les prix cités dans les enseignements** renvoient désormais à la [[Grille tarifaire]] (abonnement unique du
>   11/11/2026).

> [!info] Légende tableau 2 : ✅ existant · 🎯 décidé au périmètre (non implémenté) · ⚠️ partiel · ❌ absent

# Analyse concurrentielle

Panorama des concurrents de GERIMMO sur la gestion locative (France + Belgique).
Sources : 3 concurrents déposés par l'humain (pages sources liées ci-dessus) + recherche
web du 2026-07-22 pour les tarifs, les limites et les concurrents non mentionnés.

## Tableau 1 — Concurrents : recouvrement et différences avec GERIMMO

| Concurrent | Cible | Points communs avec GERIMMO | Ce qu'il a en plus | Ce qu'il n'a pas (forces GERIMMO) |
|---|---|---|---|---|
| **[[2026-07-22-rentila-site-web\|Rentila]]** (FR) | Bailleur particulier en gestion directe | Quittances auto, suivi loyers, relances impayés, GED, espace locataire, suivi de demandes de réparations (simple), multi-biens | **Contrats ALUR**, **EDL**, colocation, **compta + fiscal**, régularisation des charges, sync bancaire, app mobile, **gratuit 1 bien / ~49 €/an** | Pas de portail artisan, pas de mise en concurrence de devis, pas de cycle intervention/évaluation, ~~pas de bot~~ (Gerimmo n'en a pas non plus), pas de multi-tenant agence |
| **[[2026-07-22-smovin-site-web\|Smovin]]** (BE/FR) | Investisseurs, petites structures pro | Tarification **par tranche de biens**, suivi des loyers, quittances/avis d'échéance auto, communications locataires, tableaux de bord | **Bail = objet pivot** (y c. baux commerciaux complexes), **indexation IRL/ILC/ILAT auto**, **vérification bancaire des paiements**, décompte de charges, intégration comptable, TVA | Pas de module incidents/artisans, pas d'EDL, ~~pas de bot~~ (Gerimmo n'en a pas non plus) ; centré propriétaire (pas de portail locataire/artisan riches) |
| **[[2026-07-22-oskar-la-boite-immo\|Oskar]]** (FR, La Boîte Immo) | **Agences** (issues de la transaction) | Cible agence, suivi des impayés, documents juridiques, portail unique | **Paiement intégré** (rapprochement bancaire auto, **reversement propriétaires**), mandats, **signature électronique**, compta de gérance | **Pas de gestion des réparations/incidents** (relevé par Ublo) — le cœur de GERIMMO |
| **GérerSeul** (FR) | Bailleur particulier | Quittances, loyers, relances, documents | Très complet côté bailleur (bail, EDL, fiscal), accompagnement humain | Pas de module incidents/artisans structuré, mono-audience |
| **BailFacile** (FR) | Bailleur autonome | Quittances, suivi, documents | **Mise en location** (annonces, dossiers), bail + signature, référence du segment | Idem : pas d'artisans, pas d'agences |
| **Hestia** (FR) | Bailleur (gratuit) | Quittances, suivi | Bail ALUR + **signature eIDAS** gratuits | Périmètre étroit |
| **Pandaloc** (FR) | Petit propriétaire | Quittances, paiements | **Multidiffusion d'annonces**, tri/certification des dossiers candidats | Pas de gestion d'incidents ni d'agences |
| **Ublo** (FR) | Gestionnaires pro | **Ticketing incidents**, quittancement, portail locataire, CRM, patrimoine | **EDL en ligne**, positionnement pro établi | Ticketing sans mise en concurrence de devis scorée, sans planification par rounds ni évaluation artisan, ~~pas de bot~~ (Gerimmo n'en a pas non plus) |
| **Lockimmo** (FR) | Gestionnaires, syndics | Gestion travaux, EDL, location | Couvre aussi **copropriété/syndic** et transaction | Interface datée ; pas de score devis (~~ni de bots~~ : Gerimmo n'en a pas non plus) |
| **Manerty** (FR) | Gestionnaires (travaux) | Incidents/travaux locatifs, circuit devis→validation | **Seuil d'intervention sans devis** paramétrable, ciblage contacts | Spécialiste travaux uniquement — pas de gestion locative complète |
| **Marvin** (FR) | Propriétaires | Automatisation loyers/rappels | « IA autonome » (paiements, rapports sans intervention) | Pas de patrimoine commercial, pas d'écosystème multi-persona |
| **AppFolio / Buildium / Yardi Breeze** (US) | Property managers | Maintenance, portails, compta | Suites très complètes, très matures | Hors marché FR/BE (droit, langue) — veille seulement |

## Tableau 2 — Lecture par fonctionnalité : GERIMMO vs standard du marché

| Fonctionnalité | GERIMMO | Marché |
|---|---|---|
| Cycle incident complet (déclaration → **devis en concurrence avec score** → planification par rounds → intervention → rapport officiel → **évaluation artisan**) | ✅ cœur du produit ([[Cycle de vie d'un incident]]) | ❌ quasi unique — seuls Ublo (ticketing simple), Manerty et Lockimmo (partiels) |
| **Portail artisan** dédié + validation plateforme des artisans | ✅ ([[Artisan]]) | ❌ unique dans le panel |
| **Bots Telegram/WhatsApp** (locataire ET artisan) | ❌ **non construit** (correction du 26/11/2026 : la ligne disait ✅) — Telegram abandonné le 25/07, WhatsApp jamais construit (C-38) ; Gerimmo passe par l'e-mail et l'espace personnel ([[Canaux de communication]]) | E-mail + portail web, comme Gerimmo |
| Multi-tenant **agences + indépendants** dans un même produit | ✅ ([[Organisation]]) | Rare — chacun choisit un camp |
| Quittances auto + relances/mise en demeure | ✅ ([[Quittancement des loyers]], [[Relances et mise en demeure]]) | ✅ standard partagé |
| Suivi des loyers | ⚠️ déclaratif (« loyer reçu ? ») — **choix assumé** (tranché le 2026-07-22, [[Comptabilité]]) | ✅ **sync bancaire** chez Rentila/Smovin/Oskar |
| Objet **bail/contrat** (génération ALUR, clauses, signature) | 🎯 **décidé le 2026-07-22** ([[Bail]]), à implémenter — aujourd'hui approximé ([[Occupation d'un bien]]) | ✅ standard (pivot chez Smovin, BailFacile, Hestia) |
| **Indexation IRL** automatique | ❌ | ✅ Smovin (cœur), autres partiels |
| **États des lieux** (EDL) | ❌ | ✅ Rentila, Ublo, Lockimmo, GérerSeul |
| Comptabilité (gérance ou revenus fonciers) + fiscal | 🎯 **décidé le 2026-07-22** ([[Comptabilité]] pour le gérant, [[Fiscalité]] pour le propriétaire), à implémenter | ✅ Oskar (gérance), Rentila/GérerSeul (foncier + fiscal) |
| **Paiement intégré** / reversement propriétaires | ❌ | ✅ Oskar (argument n°1) |
| Régularisation des charges | 🎯 **décidé le 2026-07-22** ([[Régularisation des charges]]), à implémenter | ✅ Rentila, Smovin |
| Mise en location (annonces, dossiers candidats) | ❌ | ✅ Pandaloc, BailFacile |
| Signature électronique | 🎯 incluse dans la décision [[Bail]] (modalité à trancher) | ✅ Oskar, Hestia |

*Statuts de Gerimmo au 22/07/2026, non mis à jour ici, sauf la ligne des bots. Plusieurs ❌ et 🎯 sont depuis en
production (bail, état des lieux, révision IRL, régularisation des charges, aide à la 2044 ; signature par Zoho Sign
depuis le 18/10/2026) : voir la section 1 de la [[Vision de l'écosystème Gerimmo]].*

## Enseignements

1. **Le différenciateur de GERIMMO est réel** : personne dans le panel ne fait le cycle
   incident→artisan complet (concurrence scorée des devis, planification par rounds,
   évaluation) ~~ni les bots conversationnels~~ *(corrigé le 26/11/2026 : Gerimmo n'a aucun bot, ce n'est pas un
   différenciateur)*. C'est l'axe à défendre.
2. **Les manques de GERIMMO sont des standards du marché** : bail, EDL, indexation IRL,
   compta/sync bancaire, régularisation des charges. **Suite donnée (2026-07-22)** : l'humain
   a acté au périmètre [[Bail]], [[Régularisation des charges]], [[Comptabilité]] et
   [[Fiscalité]] ; restent ouverts EDL, indexation IRL, sync bancaire et mise en location
   ([[État du projet et décisions ouvertes]], point 13).
3. **Tension tarifaire sur le segment petit bailleur** : Rentila est gratuit (1 bien) puis
   ~49 €/an, GERIMMO facture 19 €/mois + 49 € de mise en place ([[Grille tarifaire]]) —
   soit ~5× plus cher. Le prix ne tiendra que si le module incidents/artisans est perçu
   comme la valeur principale. Côté agences, Oskar ne publie pas ses prix (au mandat).
   *(**Supplanté** : la grille de juillet citée ici n'existe plus, ni celle du 28/09 qui l'avait remplacée. Depuis le
   11/11/2026, le code applique l'**abonnement unique** pour les particuliers et les SCI (5,99 €/mois pour 1 bien, sans
   frais de mise en place ni bien offert) ; prix complets et grille agences du code dans la [[Grille tarifaire]].
   Comparaison des prix du marché à jour : section 3 de la [[Vision de l'écosystème Gerimmo]].
   L'écart avec Rentila (gratuit pour 1 bien) reste à réévaluer.)*
4. **Positionnement gagnant probable** : « l'outil qui gère les *problèmes* (incidents,
   artisans, terrain) là où les autres gèrent les *papiers* (bail, compta) » — au prix
   d'un socle administratif à compléter pour être crédible face aux standards.

## Sources web consultées
- Smovin : [fonctionnalités](https://www.smovin.app/fr-fr/fonctionnalites/), [indexation](https://www.smovin.app/fr-fr/fonctionnalites/indexation-automatique-loyers/), [tarifs](https://www.smovin.app/fr-be/tarifs/)
- Rentila : [tarifs](https://www.rentila.com/pricing), [avis/analyse](https://investissement-locatif-avis.fr/rentila-avis/)
- Oskar : [rachat Tylto → Oskar (Immo Matin)](https://www.immomatin.com/logiciels/logiciels-gestion/logiciel-de-gestion-locative-rachete-par-la-boite-immo-tylto-devient-oskar.html), [lancement (Immo Matin)](https://www.immomatin.com/logiciels/logiciels-gestion/gestion-locative-la-boite-immo-elargit-le-champ-des-possibles-avec-oskar.html)
- Panorama pro : [Top 10 Ublo](https://www.ublo.immo/blog/top-10-des-logiciels-de-gestion-locative-professionnels) ; particuliers : [comparatif investissement-locatif-avis](https://investissement-locatif-avis.fr/meilleurs-logiciels-gestion-locative/), [comparatif decision-immo](https://www.decision-immo.fr/comparatif-logiciels-gestion-locative/), [comparatif Manda](https://www.manda.fr/ressources/articles/comparatif-des-meilleurs-logiciels-de-gestion-locative)
- Incidents/travaux : [outils Journal de l'Agence](https://www.journaldelagence.com/1398772-6-outils-daide-a-la-gestion-locative-et-de-copropriete), [Manerty](https://manerty.com/tutoriels-et-guide/gerer-mes-travaux-et-incidents-locatifs)

> [!warning] Limites de l'analyse
> - Panorama fondé sur les **sites marketing** des concurrents et des comparatifs web — pas
>   d'essai produit ; les périmètres réels peuvent différer des revendications.
> - Tarifs Oskar non publics ; tarifs Smovin non détaillés (formules par lots).
> - Marché mouvant (Tylto→Oskar en 2024) : à rafraîchir périodiquement. Rafraîchi le 26/11/2026 dans la
>   [[Vision de l'écosystème Gerimmo]] (sections 2 et 3), pas dans cette page.

> [!warning] Points à trancher / contradictions
> - **WhatsApp** : y revient-on ? Question ouverte (C-38 du [[Référentiel du palier 1]] ; question 4 de la
>   [[Vision de l'écosystème Gerimmo]], section 12). Tant qu'elle n'est pas tranchée, aucune page ne doit présenter un
>   bot comme existant ou comme différenciateur.
> - **Tableau 2 périmé** : seuls la ligne des bots et l'enseignement n° 3 (prix) sont corrigés ; les autres statuts
>   datent du 22/07. Les refaire demanderait une lecture du code module par module, non faite ici.
> - **Positionnement** : l'enseignement n° 4 (« gérer les problèmes plutôt que les papiers ») est-il encore celui du
>   dirigeant, depuis l'ambition du 26/11 (« toute la gestion immobilière sur Gerimmo ») ? La feuille de route garde le
>   cycle incident → artisan → facture → fiscalité comme première « place libre », sans trancher le positionnement.
> - **Canaux de communication** : la page [[Canaux de communication]] (mise à jour le 25/07) décrit encore le bot
>   Telegram comme « actif dans le code » ; d'après ses sources, il s'agit du code de la V3 ([[Dépôt Gerimmo-V3]]) :
>   le code actuel (`app/`) n'en contient rien.
