---
type: synthesis
tags: [vision, proposition-de-valeur, strategie]
status: stable
created: 2026-09-10
updated: 2026-11-26
sources: ["[[Analyse concurrentielle]]", "[[2026-09-04-maquette-v3-prototype]]", "[[2026-09-08-maquette-espace-agence-v6]]", "[[2026-07-21-fonctionnalites-par-persona-v0]]", "[[Vision de l'écosystème Gerimmo]]", "[[Passation — état du 26 novembre 2026]] (sections a et d.3)", "[[Feuille de route — plateforme de référence, 26 novembre 2026]] (section 1)", "[[Signature électronique]]", "[[Canaux de communication]]", "[[Référentiel du palier 1]] (C-38)", "log.md — entrées du 18/10/2026 (Zoho Sign Europe choisi) et du 20/09/2026 (lancement sans WhatsApp)", "app/src/lib/envois-suspendus.ts", "recherche dans app/ le 26/11/2026 (aucun code Telegram, WhatsApp ni application native)"]
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

> [!note] Ambition élargie le 26/11/2026 — « toute la gestion immobilière sur Gerimmo »
> Le dirigeant fixe l'objectif de devenir la plateforme principale de gestion immobilière en France, puis
> potentiellement en Europe, avec toutes les portes d'entrée (carnet du locataire, aide pour les aides, administratif,
> incidents, artisans, factures, finances) et un objectif de revenu explicite. La frontière du 10/09 (pas
> d'encaissement pour compte de tiers) n'est pas remise en cause. Analyse et stratégie :
> [[Feuille de route — plateforme de référence, 26 novembre 2026]].

> [!note] Signature électronique non activée au lancement (30/09/2026, décision du 27/09) → [[Signature électronique]]

> [!info] État au 26/11/2026 — ce qui ne tient plus dans le texte du 10/09
> L'énoncé fondateur et ses trois promesses restent la référence ; la vision à jour est la
> [[Vision de l'écosystème Gerimmo]]. Ce que le texte ci-dessus annonce et qui n'est pas, ou plus, vrai :
> - **Yousign → Zoho Sign** : le prestataire de signature est **Zoho Sign** (centre de données européen), choisi par le
>   dirigeant le **18/10/2026** (`log.md`) ; aucun circuit Yousign en production ([[Signature électronique]]). Le
>   point 3 des conséquences (« Yousign, Stripe, WhatsApp, mobile ») est donc à lire avec Zoho Sign.
> - **WhatsApp et « bots » : non construits.** Le « bot WhatsApp (V1) » de la promesse « plus rapide » et les « bots
>   conversationnels » de la note produit v0 n'existent pas : Telegram est abandonné depuis le 25/07, WhatsApp a été
>   reporté le 20/09 à après le lancement (« trop long », `log.md`) et n'a jamais été construit (C-38 du [[Référentiel du palier 1]]). Le code ne contient aucun
>   envoi Telegram ni WhatsApp (recherche du 26/11/2026). Les canaux sont l'e-mail et l'espace personnel.
> - **Envois automatiques codés mais fermés.** L'avis d'échéance, la relance amiable d'un loyer, le rappel de
>   rendez-vous, la relance d'invitation et la relance d'une demande de report ont chacun un interrupteur, **fermé**
>   (`app/src/lib/envois-suspendus.ts` ; cinq interrupteurs fermés, vérifié en base le 26/11, [[Passation — état du 26 novembre 2026]],
>   sections a et d.3). Le dirigeant a décidé de les ouvrir « à la publication » (Q6, Q37) ; le geste R5 n'est pas
>   fait. Tant qu'ils sont fermés, « relances à seuils automatiques » et le travail qui « se fait tout seul » ne sont
>   pas tenus pour ces envois.
> - **Pas d'application mobile native.** Le site est adapté au mobile ; une application installable est seulement
>   envisagée ([[Feuille de route — plateforme de référence, 26 novembre 2026]], section 1 ;
>   [[Vision de l'écosystème Gerimmo]], section 11). Le dépôt ne contient aucun projet iOS ou Android.
> - **Stripe** sert à l'abonnement à Gerimmo, pas aux loyers (frontière du 10/09, rappelée plus bas) ; les
>   souscriptions payantes sont fermées au 26/11, ouverture fixée au 30/11 par le dirigeant
>   (`DECISIONS-2026-11-24.md`, réponses du 26/11).

> [!warning] Points à trancher / contradictions
> - **26/11/2026 — à trancher** : WhatsApp revient-il dans la promesse (C-38 ; question 4 de la
>   [[Vision de l'écosystème Gerimmo]]) ? Sans réponse, la promesse « plus rapide » ne doit plus le citer.
> - **26/11/2026 — non vérifié** : l'état d'ouverture de la signature Zoho Sign en production (interrupteurs
>   `ZOHO_SIGN_*`). La [[Feuille de route — plateforme de référence, 26 novembre 2026]] la range parmi les automatismes
>   « éteints par défaut », alors que le dirigeant l'a laissée ouverte pendant la bêta le 23/10 (`log.md`).
> - **26/11/2026 — vitrine** : elle promet des quittances envoyées d'elles-mêmes, alors que les envois automatiques
>   sont fermés ([[Vision de l'écosystème Gerimmo]], encadré final). À aligner, ou à tenir en ouvrant les envois.
> - ~~**Jusqu'où « faire le travail d'une agence » ?**~~ → **tranché par Tahir
>   le 2026-09-10 : Gerimmo reste l'outil qui exécute le travail** — il n'a pas
>   vocation à devenir l'agence (pas de gérance en ligne opérée, pas
>   d'encaissement pour compte de tiers). La frontière RM-A6.1 (« journal de
>   gestion, jamais comptabilité de gérance », pas de fonds mandants ni
>   séquestre — [[Comptabilité]]) est **confirmée**, et la contradiction n°1 de
>   la [[2026-09-08-maquette-espace-agence-v6|maquette v6]] est **close** : les
>   écrans « fonds mandants » de la maquette s'intègrent dans les limites du
>   journal de gestion (T8), sans révision du référentiel.
> - Les honoraires réels du marché (taux d'une gérance classique) ne sont
>   documentés dans aucune source : à sourcer pour chiffrer « moins cher ». *26/11/2026 : premiers chiffres dans la
>   [[Feuille de route — plateforme de référence, 26 novembre 2026]], section 2 (de 4,9 % TTC à 8,40 % TTC des
>   encaissements, recherches web du 26/11).*
