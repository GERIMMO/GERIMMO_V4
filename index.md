# Index — Wiki métier Gerimmo

Catalogue de tout le wiki : lien + accroche courte. Mis à jour à chaque ingest.
Point d'entrée pour toute recherche. Voir [[Accueil]] pour la vue d'ensemble.

## Personas
- [[Super Admin]] — l'éditeur de la plateforme ; console, modèles, blacklist globale, facturation.
- [[Administrateur d'agence]] — « agent ++ » : administration, paramétrages, vue retards.
- [[Agent immobilier]] — gestion locative quotidienne ; limité à ses mandats (V3).
- [[Propriétaire bailleur]] — deux personas V3 : mandant (aucun accès) vs gestion directe (accès complet).
- [[Artisan]] — intervenant sur incidents ; pièces auto-gérées, décennale, score composite.
- [[Locataire]] — occupant ; incidents, quittances, assurance annuelle, portail restreint.

## Processus
- [[Cycle de vie d'un incident]] — déclaration → qualification → intervention → clôture.
- [[Demande et sélection de devis]] — mise en concurrence des artisans.
- [[Planification d'intervention]] — négociation de créneaux 3+3, arbitrage du gérant.
- [[Intervention et clôture]] — exécution, compte rendu, évaluation.
- [[Quittancement des loyers]] — appel → encaissement → quittance (ou reçu si partiel).
- [[Révision annuelle IRL]] — proposition validée, prescription 1 an, DPE F/G bloqué.
- [[Solde de tout compte]] — décompte final de fin de bail, émis dans les deux sens.
- [[Rapport de gestion]] — le livrable mensuel du mandant, figé après envoi.
- [[Restitution du dépôt de garantie]] — délai légal 1/2 mois, imputabilité des écarts d'EDL.
- [[Régularisation des charges]] — provisions vs réel, année civile, justificatifs bloquants.
- [[Relances et mise en demeure]] — impayés à seuils paramétrables, relances = preuve.
- [[Onboarding et abonnement]] — création d'agence, invitations, essai 14 j.
- [[Retours utilisateurs]] — signalements de bugs et idées ; le code se corrige hors app.

## Concepts
- [[Organisation]] — l'entité cliente, racine de l'isolation multi-tenant.
- [[Compte, personne et adhésion]] — identité V3 : compte global, adhésions par agence.
- [[Dossier locataire]] — pièces versionnées rattachées à la personne ; purge à 5 ans.
- [[Patrimoine et résidences]] — regroupements au-dessus du bien (code actuel).
- [[Bien]] — l'unité physique (adresse, clé, diagnostics communs).
- [[Lot]] — l'unité locative V3 : porte bail, loyer, détention et mandat.
- [[Clé de répartition]] — répartit une dépense commune entre lots ; 100 % exact, datée.
- [[Diagnostic]] — DPE, ERP… ; expiré = création de bail bloquée.
- [[Appel de charges]] — charges de copro : saisie poste à poste, ventilation récupérable.
- [[Mandat de gestion]] — contrat-pivot agence↔propriétaire ; taux par lot, seuil de délégation.
- [[Occupation d'un bien]] — le « bail » simplifié du code actuel.
- [[Gérant]] — terme générique : agent immobilier ou propriétaire bailleur.
- [[Bail]] — nu/meublé/colocation, signature Yousign V1, préavis et congés.
- [[Types de baux]] — panorama des 10 régimes locatifs ; périmètre V3 vs hors périmètre.
- [[Structure du modèle-type de bail]] — les 11 sections du formulaire officiel, blueprint du générateur 1.16 ; 7 champs manquants.
- [[État des lieux]] — constat mobile pièce par pièce ; sans EDL d'entrée, pas de retenue.
- [[Signature électronique]] — circuit Yousign : simple, séquentiel, bailleur en dernier.
- [[Marque blanche]] — logo + couleurs par agence ; mention Gerimmo conservée.
- [[Dépôt de garantie]] — plafonné, jamais révisé, pas un solde comptable.
- [[Garantie]] — caution solidaire (acte Yousign) et garanties externes.
- [[Comptabilité]] — déclarative de caisse ; écritures 2 dates, clôture verrouillante.
- [[Fiscalité]] — aide à la déclaration (récap 2044) ; régimes LMNP/SCI à trancher.
- [[Incident]] — désordre signalé ; l'imputation (qui paie) tranchée par l'agent.
- [[Devis]] — 2 max, validité 30 j, accord du mandant au-delà du seuil.
- [[Intervention]] — mission de l'artisan ; compte rendu + photo obligatoires.
- [[Document]] — GED sans arborescence ; le type pilote droits et conservation.
- [[Période de loyer]] — le loyer attendu du code actuel ; cible : appel/encaissement.
- [[Abonnement]] — souscription SaaS Stripe de l'organisation.
- [[Agenda et échéances]] — écran unique agenda + 27 types d'alertes, escalade nominative.

## Règles métier
- [[Grille tarifaire]] — offres par audience ; V3 : mensuel + mise en route + redevance.
- [[Quittance conforme]] — loyer/charges séparés, identité légale du bailleur.
- [[Mentions obligatoires du bail]] — modèle-type 2015 + ajouts 2024 (identifiant fiscal, DPE) ; trou repéré au module 1.
- [[Clauses abusives et clauses résolutoires]] — 9 clauses non écrites, 4 résolutoires admises.
- [[Cycle de vie de l'abonnement]] — essai 14 j → paiement ou suspension.
- [[Archivage plutôt que suppression]] — on archive, on ne supprime pas.
- [[Isolation multi-organisation]] — RLS partout + test d'isolation par table.
- [[RGPD]] — droits des personnes, durées de conservation, purge encadrée.
- [[Notification et valeur probante]] — Gerimmo ne notifie jamais ; trace GED ≠ preuve.
- [[Machines à états et événements]] — 8 machines, transitions interdites, idempotence.
- [[Vétusté et décote]] — grille de durées de vie, décote linéaire ; amorti = zéro retenue.
- [[Plan de reprise d'activité]] — RPO 24 h / RTO 4 h, test de restauration documenté.
- [[Socle de sécurité]] — MFA par rôle, mots de passe, sessions, chiffrement, fichiers, incidents.

## Sources
- [[Dépôt Gerimmo-V3]] — le code (2026-07-21) : SQL, services, état réel.
- [[2026-07-21-fonctionnalites-par-persona-v0|Fonctionnalités par persona (v0)]] — note produit interne.
- [[2026-07-22-rentila-site-web|Rentila]] — concurrent bailleur particulier.
- [[2026-07-22-smovin-site-web|Smovin]] — concurrent investisseurs (BE/FR).
- [[2026-07-22-oskar-la-boite-immo|Oskar (La Boîte Immo)]] — concurrent agences.
- [[2026-07-24-gerimmo-v3-a1-modele-identite|V3 · A1 — Modèle d'identité]] — compte global, adhésions ; à valider.
- [[2026-07-24-gerimmo-v3-a2-conservation-rgpd|V3 · A2 — Conservation et RGPD]] — matrice des durées, 3 sorts finaux ; corrige 5 règles.
- [[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve|V3 · A3 — Documents, canaux et preuve]] — canal et date d'effet par document.
- [[2026-07-24-gerimmo-v3-a4-socle-securite|V3 · A4 — Socle sécurité]] — MFA, chiffrement, fichiers, sauvegardes, sous-traitants.
- [[2026-07-24-gerimmo-v3-a5-etats-et-evenements|V3 · A5 — États et événements]] — 8 machines, webhooks ; clôt la phase A.
- [[2026-07-24-gerimmo-v3-a6-doctrine-financiere|V3 · A6 — Doctrine financière]] — journal de gestion, immutabilité, exports ; dernier P0 clos.
- [[2026-07-24-gerimmo-v3-architecture-lot-0|V3 · Architecture du lot 0]] — le socle : 9 tables, RLS, pg_cron.
- [[2026-07-24-gerimmo-v3-matrice-tracabilite|V3 · Matrice de traçabilité]] — 71 règles × 23 modules ; clôt la phase B.
- [[2026-07-24-gerimmo-v3-module-0-biens-et-lots|V3 · Module 0 — Biens et lots]] — bien/lot, détention, diagnostics, import.
- [[2026-07-24-gerimmo-v3-module-0b-dossier-locataire|V3 · Module 0b — Dossier locataire]] — pièces, assurance, purge RGPD.
- [[2026-07-24-gerimmo-v3-module-0c-copropriete|V3 · Module 0c — Copropriété]] — appel de charges et ventilation.
- [[2026-07-24-gerimmo-v3-module-1-bail|V3 · Module 1 — Bail]] — création, colocation, signature, congés, EDL.
- [[2026-07-24-gerimmo-v3-module-2-garanties|V3 · Module 2 — Garanties]] — dépôt, caution, restitution, vétusté.
- [[2026-07-24-gerimmo-v3-module-3-loyers-et-charges|V3 · Module 3 — Loyers et charges]] — cycle mensuel, impayés, IRL.
- [[2026-07-24-gerimmo-v3-module-4-comptabilite|V3 · Module 4 — Comptabilité]] — déclaratif assumé, clôture, catégories.
- [[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion|V3 · Module 5 — Mandat]] — multi-lots, paramètres pivots, signature.
- [[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite|V3 · Module 6 — Rapport et fiscalité]] — rapport figé, récap 2044.
- [[2026-07-24-gerimmo-v3-module-7-incidents|V3 · Module 7 — Incidents]] — imputation, compte rendu, réouverture.
- [[2026-07-24-gerimmo-v3-module-8-artisans|V3 · Module 8 — Artisans]] — pièces, décennale, visibilité, blacklist.
- [[2026-07-24-gerimmo-v3-module-9-devis-et-facturation|V3 · Module 9 — Devis et facturation]] — 2 devis, accord mandant, imputation.
- [[2026-07-24-gerimmo-v3-module-10-rdv-et-planning|V3 · Module 10 — RDV et planning]] — créneaux 3+3, arbitrage, rappels.
- [[2026-07-24-gerimmo-v3-module-11-notation|V3 · Module 11 — Notation]] — 3 sources 25/50/25, contestation au SA.
- [[2026-07-24-gerimmo-v3-module-12-documents-et-ged|V3 · Module 12 — Documents et GED]] — sans dossiers, modèles figés.
- [[2026-07-24-gerimmo-v3-module-13-signature-electronique|V3 · Module 13 — Signature électronique]] — Yousign V1, séquentiel.
- [[2026-07-24-gerimmo-v3-module-14-agenda-et-alertes|V3 · Module 14 — Agenda et alertes]] — 27 alertes, escalade, annonces.
- [[2026-07-24-gerimmo-v3-module-15-messagerie|V3 · Module 15 — Messagerie]] — conversations rattachées, WhatsApp.
- [[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations|V3 · Module 16 — Onboarding]] — invitations, consentement WhatsApp.
- [[2026-07-24-gerimmo-v3-module-17-marque-blanche|V3 · Module 17 — Marque blanche]] — logo + couleurs, mention conservée.
- [[2026-07-24-gerimmo-v3-module-18-administration|V3 · Module 18 — Administration]] — 3 rôles, paramétrage, facturation.
- [[2026-07-24-gerimmo-v3-module-19-mobile|V3 · Module 19 — Mobile]] — site adapté, EDL hors ligne ; clôt le référentiel.
- [[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs|V3 · Module 20 — Retours utilisateurs]] — bugs et idées.
- [[2026-08-01-bailpdf-com|bailpdf.com]] — modèles de documents locatifs FR (bail, EDL, congés, caution…) ; reverse-engineering pour la génération Gerimmo.
- [[2026-08-05-bailpdf-contrat-de-bail|BailPDF — Contrat de bail]] — panorama des baux, mentions 2024, clauses ; source de vulgarisation à recouper.
- [[2026-08-05-bailpdf-modele-bail-non-meuble|BailPDF — Modèle bail non meublé (PDF)]] — le formulaire officiel du modèle-type ; base du blueprint 1.16.
- [[2026-08-05-bailpdf-modele-bail-meuble|BailPDF — Modèle bail meublé (PDF)]] — même squelette que le vide ; variantes durée, forfait, dépôt 2 mois, inventaire mobilier.
- [[2026-08-08-maquette-prototype-cliquable|Maquette — prototype cliquable (août 2026)]] — référence charte v2 (encre/laiton/crème, Instrument Sans) appliquée à l'app bloc 0 → S3 ; spécifie aussi la refonte des alertes.

## Synthèses
- [[Modèle de rôles et permissions]] — rôles, portails, autorisation ; 6 (code) vs 3 (V3).
- [[Canaux de communication]] — Telegram (code), WhatsApp (V3), email, messagerie.
- [[Modèle de données]] — schéma du code + cible socle V3.
- [[Architecture du socle V3]] — lot 0 : 9 tables, RLS, pg_cron, séquence en 5 étapes.
- [[Charte visuelle de l'espace agent]] — complète le design-system V3 : 6 patterns validés en recette, états d'interface, formats, accessibilité.
- [[Coherence maquette-application|Cohérence maquette ↔ application]] — audit du 14/08 : conformités des écrans Tableau de bord/Parc/Personnes et **tableau des écarts assumés** (à lire avant toute recette visuelle).
- [[État du projet et décisions ouvertes]] — arbitrages quasi tous clos (25/07) ; reste les montants PD.
- [[Divergences code et référentiel V3]] — les écarts à résorber par la migration.
- [[Analyse concurrentielle]] — panorama FR/BE, différenciateur incidents/artisans.
- [[Fonctionnalités par persona]] — matrice qui-fait-quoi (implémenté vs cible).
- [[Documents a generer et automatisation WhatsApp]] — blueprint des documents (bail, EDL, congés…) : champ par champ AUTO vs à demander, données manquantes, surface de questions minimale pour le bot.
- [[Récapitulatif fonctionnel et lacunes de spécification]] — **archivée** (snapshot du 2026-07-22, supplanté par le référentiel V3).

## Livrables (dossier `livrables/` — projets de documents)
- [[Contrat de sous-traitance RGPD (modele)|Contrat de sous-traitance RGPD]] — annexe art. 28 des contrats d'agence (matrice A2, mesures A4, sous-traitants).
- [[Politique de confidentialite (projet)|Politique de confidentialité]] — traitements plateforme, droits, transfert Meta.
- [[Article CGU - journal de gestion (projet)|Article CGU « journal de gestion »]] — traduit la doctrine A6 en clause contractuelle.
- [[AIPD - Score artisan (projet)|AIPD — Score artisan]] — analyse d'impact du profilage artisan (art. 35 RGPD).
- [[Plan de livraison et sprints]] — **le plan de référence** : 16 sprints, V0 mi-décembre 2026, V1 fin mars 2027.
- [[Reste a faire V0 - sprints et ecarts maquette|Reste à faire V0]] — détail fin S8/S9b + inventaire des écarts maquette ↔ app du 26/08 ; S9a et « Alertes & documents » livrés le 30/08 (§3, §5 bis).
- [[Recette S3-S8 - scenarios]] — les 24 scénarios de recette humaine remis le 05/08 (référence de numérotation).
- [[Recette - test par sprint et persona]] — **le fichier central de recette** (ex « Recette S3-S8 - tests par sprint et persona », renommé le 23/08) : Partie 1 recetté OK / Partie 2 reste à recetter (re-tests du 23/08, Sprint 7 incidents, sprints jamais déroulés, transverse).
- [[Recette S7 - incidents]] — les scénarios détaillés du Sprint 7 (déclaration locataire, qualification, clôture, réouverture, pop-up de traitement).
