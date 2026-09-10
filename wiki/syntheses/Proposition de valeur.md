---
type: synthesis
tags: [vision, proposition-de-valeur, strategie]
status: draft
created: 2026-09-10
updated: 2026-09-10
sources: ["[[Analyse concurrentielle]]", "[[2026-09-04-maquette-v3-prototype]]", "[[2026-09-08-maquette-espace-agence-v6]]", "[[2026-07-21-fonctionnalites-par-persona-v0]]"]
---

# Proposition de valeur

> **« Faire le travail d'une agence de gestion locative — en mieux, plus rapide,
> et moins cher. »**
> — Tahir, 2026-09-10. L'énoncé fondateur du projet, recueilli en séance.

## Ce que l'énoncé change

Le critère de réussite de Gerimmo n'est pas d'**enregistrer** la gestion
(écrans, formulaires, dossiers) mais de l'**exécuter**. Un module n'est pas
terminé quand son écran existe : il est terminé quand le travail qu'il couvre
**se fait tout seul** — ou en un clic là où une agence classique y passe une
heure. C'est l'aune à laquelle mesurer chaque chantier restant.

Les trois promesses, adossées à l'existant :

- **En mieux** — zéro oubli et zéro non-conformité : les ~27 types d'alertes et
  l'escalade nominative ([[Agenda et échéances]]), les blocages réglementaires
  (diagnostic expiré, DPE F/G, plafond du dépôt), les documents conformes
  générés ([[Etat des lieux generation de documents]]), la traçabilité
  probatoire ([[Notification et valeur probante]]).
- **Plus rapide** — le travail en flux : quittancement en un clic et envoi
  groupé (maquette v3, T1), relances à seuils automatiques
  ([[Relances et mise en demeure]]), IRL proposée à date anniversaire,
  déclaration d'incident par le locataire lui-même, créneaux négociés 3+3 sans
  téléphone ([[Planification d'intervention]]), bots WhatsApp (V1).
- **Moins cher** — l'abonnement ([[Grille tarifaire]]) reste sans commune mesure
  avec le coût du temps humain qu'il remplace. L'[[Analyse concurrentielle]]
  l'avait posé en condition : le prix « ne tiendra que si le module
  incidents/artisans est perçu comme la valeur principale ».

## Par audience

- **L'agence** ([[Agent immobilier]], [[Administrateur d'agence]]) : gérer plus
  de mandats par gérant — l'outil absorbe le quotidien (quittances, relances,
  incidents, documents), le gérant garde les décisions (imputation, arbitrages,
  seuil de délégation).
- **Le bailleur indépendant** ([[Propriétaire bailleur]]) : faire seul, sans y
  perdre, ce qu'une agence lui facturerait — c'est le sens de l'espace PD né au
  S9a et du récapitulatif fiscal.
- **Locataire et artisan** : le travail passe *par eux* sans friction —
  déclaration photo à l'appui, choix de créneau, compte rendu mobile — au lieu
  d'être ressaisi par le gérant.

## Le wiki l'avait en creux

L'énoncé confirme et durcit des signaux déjà documentés : le différenciateur
« cycle incident → artisan complet, que personne ne fait » et le positionnement
« gérer les *problèmes* là où les autres gèrent les *papiers* »
([[Analyse concurrentielle]]) ; le pivot **réseau artisan** de la
[[2026-09-04-maquette-v3-prototype|maquette v3]] — la conformité artisan
« vérifiée et tenue à jour par Gerimmo », la plateforme commence à faire le
travail elle-même ; les bots conversationnels de la note produit v0.

## Conséquences sur l'ordre des travaux

1. Le bloc **artisans – devis – interventions** (suite du S7) est le **cœur du
   produit**, pas un module parmi d'autres : c'est la part la plus chronophage
   du métier ([[Cycle de vie d'un incident]]) et le différenciateur assumé.
2. À périmètre égal, **l'automatisation prime sur l'écran** : brancher la chaîne
   qui fait le travail (appel → encaissement → quittance → relance → écriture)
   avant de peaufiner sa présentation.
3. La **V1 (Yousign, Stripe, WhatsApp, mobile)** n'est pas du confort : c'est ce
   qui ferme les dernières boucles « sans intervention humaine » (signature,
   paiement, conversation).
4. Métrique de réussite à instrumenter : **le temps de gérant par lot et par
   mois** — c'est elle que « mieux, plus vite, moins cher » engage.

> [!warning] Points à trancher / contradictions
> - **Jusqu'où « faire le travail d'une agence » ?** Deux lectures : Gerimmo
>   reste l'**outil** qui exécute (frontière actuelle : « journal de gestion,
>   jamais comptabilité de gérance », RM-A6.1, pas de fonds mandants ni
>   séquestre — [[Comptabilité]]) ; ou Gerimmo a vocation à **devenir
>   l'agence** (gérance en ligne opérée, mandats, encaissement pour compte de
>   tiers → loi Hoguet, carte G, garantie financière) — la
>   [[2026-09-08-maquette-espace-agence-v6|maquette v6]] (contradiction n°1)
>   réserve explicitement ce choix à l'humain : « une révision majeure du
>   référentiel, pas un écran à copier ». **Question posée à Tahir le
>   2026-09-10 — réponse attendue.**
> - Les honoraires réels du marché (taux d'une gérance classique) ne sont
>   documentés dans aucune source : à sourcer pour chiffrer « moins cher ».
