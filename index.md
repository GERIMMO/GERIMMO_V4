# Index — Wiki métier Gerimmo

Catalogue de toutes les pages vivantes du wiki : une ligne par page, rangées par catégorie.
Vue d'ensemble et pages à lire d'abord : [[Accueil]].
Les nouvelles datées (publications, décisions, contrôles) sont dans `log.md`, pas ici.

## Personas
- [[Propriétaire bailleur]] — propriétaire qui gère lui-même ses biens dans sa propre organisation ; un bien relève d'un seul gestionnaire ; deux personas V3, gestion directe et mandant (code relevé le 16/10).
- [[Locataire]] — occupant du logement, rattaché à son bail : l'espace le plus restreint (incidents, quittances, documents, attestation d'assurance annuelle) ; code relevé le 16/10.
- [[Artisan]] — intervenant sur les incidents (devis, créneaux, compte rendu, facture) ; gratuit et sans commission, il choisit sa zone et ses métiers depuis le 23/10, puis Gerimmo le valide.
- [[Super Admin]] — l'éditeur de la plateforme : supervise toutes les organisations sans emprunter d'identité, valide les artisans, pilote la console ; aucun bot n'est construit (26/11).
- [[Agent immobilier]] — collaborateur d'agence pour la gestion locative quotidienne, limité à ses mandats (cible V3) ; agences hors V1 publique depuis le 13/10, sur liste d'attente.
- [[Administrateur d'agence]] — dirigeant d'une agence cliente, « agent ++ » qui administre membres et paramétrages ; agences hors V1 publique depuis le 13/10, sur liste d'attente.

## Processus
- [[Courriel de contact Gerimmo]] — transfert de la boîte de contact de Gerimmo vers la boîte Gmail du dirigeant, approuvé le 22/10 ; préparé, aucune réception réelle confirmée.
- [[Cycle de vie d'un incident]] — du signalement à la clôture : qualification, devis, mission, créneaux, intervention, compte rendu, facture, règlement déclaré ; relu dans le code le 26/11.
- [[Demande et sélection de devis]] — mise en concurrence d'artisans sur un incident et choix d'un devis ; compléments de la mission palier 1 en production depuis le 25/11.
- [[Demandes sur les données et fermeture de compte]] — renvoi vers [[Fermeture de compte]].
- [[Fermeture de compte]] — fermeture sur demande ou après 24 mois d'inactivité, effacement de nuit après la sauvegarde ; demandes sur les données ; en production depuis le 24/10, factures gardées dix ans depuis le 25/11.
- [[Impayé de l'abonnement]] — prélèvement échoué : mise en demeure le jour même, rappels, lecture seule à J+15, résiliation à la main au plus tôt à J+30 ; en production depuis le 24/10.
- [[Intervention et clôture]] — mission de l'artisan, compte rendu, clôture de l'incident et évaluation ; reprend l'ancienne page Intervention ; ordre et compte rendu d'intervention en production depuis le 25/11.
- [[Invitation d'un artisan par un propriétaire]] — le propriétaire direct invite par e-mail un artisan, qui s'inscrit et accepte, puis Gerimmo le valide ; en production depuis le 16/10, brouillon.
- [[Liste d'attente des agences]] — les agences s'inscrivent sur `/agences` pour être prévenues de l'ouverture, rien ne leur est envoyé ; en production depuis le 20/10, base légale et durée décidées le 23/10.
- [[Onboarding et abonnement]] — renvoi vers [[Souscription de l'abonnement]].
- [[Planification d'intervention]] — négociation des créneaux entre artisan et locataire, arbitrage du gestionnaire ; en production depuis le 25/11, rappel de rendez-vous et relance de report fermés.
- [[Quittancement des loyers]] — appel du loyer, encaissement, quittance (ou reçu si le paiement est partiel) ; avis d'échéance revu par la mission palier 1, en production depuis le 25/11.
- [[Rapport de gestion]] — **en sommeil (palier 2)** : compte rendu mensuel au propriétaire mandant, relu et envoyé par l'agent, figé à l'envoi (module 6 du cahier V3).
- [[Recette de production]] — après chaque publication, parcours du site en ligne avec cinq comptes éphémères supprimés ensuite ; dernière recette, n° 62 du 26/11, réussie.
- [[Relais du dirigeant]] — e-mail de 5 h au dirigeant s'il y a quelque chose à signaler, e-mail immédiat des urgences ; en production depuis le 16/10, inscriptions signalées depuis le 25/11.
- [[Relances et mise en demeure]] — relances des loyers impayés jusqu'à la mise en demeure, suspendues sous plan d'apurement ; en production depuis le 25/11, envois par e-mail encore fermés.
- [[Restitution du dépôt de garantie]] — restitution sous un ou deux mois après la remise des clés, retenues justifiées par l'état des lieux ; une pièce par retenue exigée depuis le 25/11.
- [[Retours utilisateurs]] — deux circuits : signalement de bug traité aussitôt, idée revue chaque mois ; réclamations et renvoi au médiateur en production depuis le 24/10.
- [[Régularisation des charges]] — comparaison annuelle des provisions et des charges réelles, justificatifs exigés ; étalement et courrier revus, en production depuis le 25/11.
- [[Résiliation de l'abonnement]] — un seul chemin, la page « Résilier votre contrat », et un seul accusé ; résiliation retirée du portail Stripe ; en production depuis le 24/10.
- [[Rétractation en ligne]] — renonciation en ligne sous quatorze jours, sans motif, avec remboursement intégral et accusé de réception ; en production depuis le 24/10.
- [[Révision annuelle IRL]] — révision du loyer à la date anniversaire selon l'IRL, perdue si elle n'est pas demandée dans l'année ; rappel et date limite en production depuis le 25/11.
- [[Solde de tout compte]] — décompte final de fin de bail, établi après l'état des lieux de sortie et émis quel que soit le sens du solde ; spécification du cahier V3, brouillon.
- [[Souscription de l'abonnement]] — choix de la formule, récapitulatif, paiement Stripe, confirmation unique ; en amont, inscription et essai ; en production, ventes encore fermées au 26/11.

## Concepts
- [[Abonnement]] — souscription d'une organisation à Gerimmo : abonnement unique selon le nombre de biens actifs, essai de deux mois ; ventes fermées, ouverture fixée au 30/11.
- [[Agenda et échéances]] — écran unique agenda et alertes (27 types, criticité, escalade) du cahier V3 ; l'agenda du propriétaire montre ses échéances (mission palier 1).
- [[Appel de charges]] — appel de charges du syndic, saisi poste par poste et ventilé entre récupérable et non récupérable (module 0c) ; brouillon du 24/07.
- [[Bail]] — contrat de location porté par un lot (nu, meublé, colocation) ; reprend l'ancienne page Occupation d'un bien ; congés, contrat et signature revus, en production depuis le 25/11.
- [[Bien]] — unité physique (adresse, copropriété, diagnostics communs) ; ce n'est pas le bien qui est loué, mais son lot ; relu dans le code le 26/11.
- [[Clé de répartition]] — répartit une dépense commune du bien entre ses lots, à 100 % exacts et datée ; parcours le plus critique du module 0 ; brouillon du 24/07.
- [[Comptabilité]] — journal de gestion déclaratif de caisse (module 4), jamais une comptabilité de gérance ; livre du propriétaire direct livré le 30/08.
- [[Compte, personne et adhésion]] — modèle d'identité validé le 25/07 : un compte global, une adhésion par organisation avec son rôle, une fiche personne par organisation.
- [[Conditions générales]] — conditions d'utilisation et de vente sur `/conditions`, chaque version archivée ; version du 24/11 en production depuis le 25/11, archivée le 26/11 ; ventes fermées.
- [[Devis]] — proposition chiffrée d'un artisan sur un incident, comparée par un score de recommandation ; compléments de la mission palier 1 en production depuis le 25/11.
- [[Diagnostic]] — diagnostics réglementaires datés, rattachés au bien ou au lot (DPE, ERP…) ; un diagnostic obligatoire expiré bloque la génération d'un bail ; alertes d'expiration.
- [[Document]] — fichier métier rattaché à toutes les entités qu'il concerne, sans arborescence ; catalogue des documents générés relu et corrigé, en production depuis le 25/11.
- [[Dossier locataire]] — pièces versionnées du locataire et du garant, qui suivent la personne ; pièces d'un candidat limitées à la liste du décret n° 2015-1437 depuis le 25/11.
- [[Dépôt de garantie]] — somme versée à la signature, plafonnée selon le bail, restituée à la sortie moins les retenues justifiées ; reçu et notice revus, en production depuis le 25/11.
- [[Export complet des données]] — archive ZIP de tout l'espace (données, fichiers, certificats), téléchargée par le titulaire par un lien signé ; en production depuis le 24/10.
- [[Fiscalité]] — aide à la déclaration des revenus locatifs du propriétaire (récapitulatif 2044) ; repères du micro-foncier réglés par le Super Admin depuis le 25/11, sans calcul d'impôt.
- [[Garantie]] — caution ou garantie externe (Visale, GLI…) rattachée au bail, éteinte avec lui ; acte de cautionnement relu sur le texte fourni, en production depuis le 25/11.
- [[Guide de ton du journal]] — la voix du journal public et des posts Facebook, un gestionnaire qui explique à un bailleur ; repris dans la consigne de l'IA de rédaction.
- [[Gérant]] — terme générique, non technique : l'agent immobilier ou le propriétaire bailleur qui gère le bien face au locataire ; synonyme « Gestionnaire ».
- [[Incident]] — problème signalé sur un logement ou les parties communes : sept états, trois portes de déclaration, imputation (« qui paie ») ; relu dans le code le 26/11.
- [[Intervention]] — renvoi vers [[Intervention et clôture]].
- [[Journal éditorial]] — le journal public `/journal` et son moteur de propositions ancrées sur le wiki, qui n'invente aucun chiffre ; livré le 11/09.
- [[Lot]] — unité locative qui porte bail, loyer, propriétaires et mandat : « le bail porte toujours sur un lot » ; étage imprimé une seule fois depuis le 25/11.
- [[Mandat de gestion]] — **en sommeil (palier 2)** : contrat entre le propriétaire mandant et l'agence, sur des lots, avec un taux par lot et des avenants signés (module 5 du cahier V3).
- [[Marque blanche]] — **en sommeil (palier 2)** : habillage aux couleurs de l'agence (logo, deux couleurs), mention Gerimmo conservée (module 17 du cahier V3).
- [[Occupation d'un bien]] — renvoi vers [[Bail]].
- [[Organisation]] — l'entité cliente (agence ou propriétaire en gestion directe) et la racine de l'isolation des données ; réécrite d'après le code le 26/11.
- [[Parrainage]] — un code par organisation pour savoir qui a amené qui ; un mois offert au parrain quand son filleul devient client payant (décision du 30/09).
- [[Patrimoine et résidences]] — renvoi vers [[Bien]] et [[Lot]] : notion V3 absente du code actuel.
- [[Plan d'apurement]] — accord qui gèle une dette échue et l'étale en tranches mensuelles, relances suspendues tant qu'il est respecté ; complété en production depuis le 25/11.
- [[Période de loyer]] — le terme mensuel d'un bail, une ligne d'appel de loyer par mois, départ du flux appel → encaissement → quittance ; réécrite d'après le code le 26/11.
- [[Signature électronique]] — signature en ligne par Zoho Sign (bail, avenant, cautionnement, devis…) ; proposée en premier depuis le 25/11, papier toujours possible ; interrupteurs non relus.
- [[Structure du modèle-type de bail]] — les onze sections du modèle-type réglementaire du bail nu et meublé, gabarit du générateur de baux ; brouillon.
- [[Types de baux]] — panorama des régimes locatifs (durée, dépôt, préavis) et périmètre de Gerimmo : bail nu, bail meublé et colocation.
- [[État des lieux]] — constat d'entrée et de sortie pièce par pièce ; sans état des lieux d'entrée, aucune retenue ; signé dans Gerimmo sur place depuis le 24/10, document revu le 25/11.

## Règles métier
- [[Archivage plutôt que suppression]] — archiver ou désactiver plutôt que supprimer à chaud, et journaliser ; corrigé par A2 : l'archivage est une étape du cycle de vie, jamais un sort final.
- [[Clauses abusives et clauses résolutoires]] — les clauses réputées non écrites par la loi de 1989 et les quatre clauses résolutoires admises, à exclure ou à proposer dans le modèle de bail.
- [[Cohérence des loyers de référence]] — contrôle indicatif (X08) du loyer face aux loyers de référence là où l'encadrement s'applique, sur la surface habitable ; sans certification juridique.
- [[Cycle de vie de l'abonnement]] — essai sans carte, souscription, hausse, résiliation, rétractation, lecture seule, suppression après 24 mois d'inactivité ; conformité V1 en production depuis le 24/10.
- [[Durées de conservation]] — catalogue `retention_rules` (58 règles : durée, déclencheur, sort final), seules les règles actives purgées ; factures dix ans depuis le 25/11 ; aucune règle activée (Q39).
- [[Grille tarifaire]] — les prix : abonnement unique selon le nombre de biens actifs depuis le 11/11 (5,99 € par mois pour un bien) ; grille agences non publiée ; ventes fermées au 26/11.
- [[Isolation multi-organisation]] — les données d'une organisation ne sont jamais visibles d'une autre : `organization_id` partout et RLS ; réécrite d'après le code le 26/11.
- [[Le jour de référence est le jour de Paris]] — « aujourd'hui » est la date du calendrier à Paris, jamais le jour UTC ; convention du produit (14-16/10) ; restitution du dépôt : interprétation à ratifier.
- [[Machines à états et événements]] — huit machines à états (46 états) du cahier V3 : toute transition non listée est interdite, un état terminal n'a aucune sortie.
- [[Mentions obligatoires du bail]] — modèle-type du décret n° 2015-587 et ses compléments ; contrat type et notice relus sur le texte fourni (non recontrôlé sur Légifrance), en production depuis le 25/11.
- [[Notification et valeur probante]] — Gerimmo génère et suit, il ne notifie jamais ; une trace GED n'est pas une preuve ; cinq niveaux de preuve, de l'acte de commissaire de justice à la mise en ligne.
- [[Ouverture du réseau d'artisans]] — le réseau propose les artisans validés et publics selon la zone et les métiers qu'ils ont choisis ; en production depuis le 23/10, plus d'ouverture par commune.
- [[Plan de reprise d'activité]] — restaurer le service sous contrôle humain, jamais directement en production : RPO 24 h, RTO 4 h, sauvegarde quotidienne ; relevé au 16/10.
- [[Procédure de notification de violation]] — chaîne en cas de violation de données (qualifier en 2 h, confiner en 4 h, CNIL sous 72 h), qui fait quoi, gabarits ; brouillon du 20/09.
- [[Prospection commerciale]] — Gerimmo n'envoie aucun message commercial ; jamais à un particulier sans consentement, aux professionnels avec opposition possible ; en production depuis le 24/10.
- [[Quittance conforme]] — quittance gratuite qui sépare loyer et charges, courriers à l'identité légale du bailleur ; émetteur et adresse revus, en production depuis le 25/11.
- [[RGPD]] — droits des personnes, durées et purge encadrée, réponse sous un mois civil ; conformité V1 en production depuis le 24/10 ; brouillon à faire valider par un DPO.
- [[Registre des traitements]] — registre de l'article 30 en deux volets (plateforme, gestion locative) ; réécrit le 24/10, mis à jour les 25 et 26/11 ; ni juriste ni DPO mandaté.
- [[Socle de sécurité]] — exigences de sécurité transverses du livrable A4 : MFA obligatoire du super admin, chiffrement, fichiers, incidents ; brouillon.
- [[Vétusté et décote]] — l'usure normale n'est pas une dégradation ; décote linéaire des retenues selon une grille de durées de vie, élément amorti : aucune retenue.

## Sources
- [[2026-07-21-fonctionnalites-par-persona-v0|Fonctionnalités par persona (note produit v0)]] — note produit interne du 21/07 : les fonctionnalités attendues, persona par persona ; plusieurs points divergent du code.
- [[2026-07-22-oskar-la-boite-immo|Oskar (La Boîte Immo)]] — concurrent : logiciel de gestion locative de La Boîte Immo pour les agences (ex-Tylto) ; extrait du site du 22/07.
- [[2026-07-22-rentila-site-web|Rentila]] — concurrent : logiciel des bailleurs particuliers en gestion directe, « les moins chers », gratuit pour un bien ; extrait du site du 22/07.
- [[2026-07-22-smovin-site-web|Smovin]] — concurrent : logiciel belge, décliné pour la France, centré sur le contrat de bail, pour investisseurs et petites structures ; extrait du 22/07.
- [[2026-07-24-gerimmo-v3-a1-modele-identite|V3 · A1 — Modèle d'identité]] — livrable transverse du cahier V3 : un compte global, une adhésion par agence ; conditionne les 22 modules.
- [[2026-07-24-gerimmo-v3-a2-conservation-rgpd|V3 · A2 — Conservation et RGPD]] — corrige les durées de tous les modules ; Gerimmo sous-traitant pour les données d'agence, responsable pour la plateforme.
- [[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve|V3 · A3 — Documents, canaux et preuve]] — canal, date d'effet et preuve exigés document par document ; « Gerimmo génère et suit, il ne notifie jamais ».
- [[2026-07-24-gerimmo-v3-a4-socle-securite|V3 · A4 — Socle sécurité]] — 14 règles de sécurité transverses (MFA, mots de passe, chiffrement, fichiers, sauvegardes) ; à valider avant production.
- [[2026-07-24-gerimmo-v3-a5-etats-et-evenements|V3 · A5 — États et événements]] — registre des huit machines à états (46 états) et des contrats d'événements ; consolide sans rien modifier.
- [[2026-07-24-gerimmo-v3-a6-doctrine-financiere|V3 · A6 — Doctrine financière]] — journal de gestion, jamais comptabilité de gérance ; écritures immuables ; à valider par un expert-comptable.
- [[2026-07-24-gerimmo-v3-architecture-lot-0|V3 · Architecture du lot 0]] — traduction technique des livrables A1 à A6 : socle Next.js, Supabase et Vercel de neuf tables, sans donnée métier.
- [[2026-07-24-gerimmo-v3-matrice-tracabilite|V3 · Matrice de traçabilité]] — 71 règles transverses face aux 23 modules : aucune contradiction, 29 règles appliquées sans être citées ; clôt la phase B.
- [[2026-07-24-gerimmo-v3-module-0-biens-et-lots|V3 · Module 0 — Biens et lots]] — module racine, 10 parcours : le bail porte toujours sur un lot, la propriété est au niveau du lot.
- [[2026-07-24-gerimmo-v3-module-0b-dossier-locataire|V3 · Module 0b — Dossier locataire]] — 8 parcours sur les pièces du locataire et du garant : le dossier appartient à la personne, pas au bail.
- [[2026-07-24-gerimmo-v3-module-0c-copropriete|V3 · Module 0c — Copropriété]] — 6 parcours pour recevoir, saisir et ventiler l'appel de charges du syndic ; clôt le socle.
- [[2026-07-24-gerimmo-v3-module-1-bail|V3 · Module 1 — Bail]] — le cœur métier, 15 parcours (bail, occupant, garantie, état des lieux) ; cible : baux conclus à partir du 01/10/2026.
- [[2026-07-24-gerimmo-v3-module-2-garanties|V3 · Module 2 — Garanties]] — dépôt, caution et garanties externes ; la restitution du dépôt, à criticité maximale ; 7 parcours.
- [[2026-07-24-gerimmo-v3-module-3-loyers-et-charges|V3 · Module 3 — Loyers et charges]] — le cycle financier locatif en 12 parcours (échéancier, appel, encaissement, quittance, régularisation).
- [[2026-07-24-gerimmo-v3-module-4-comptabilite|V3 · Module 4 — Comptabilité]] — comptabilité déclarative de caisse, sans comptabilité de gérance ni comptes mandants ; 8 parcours.
- [[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion|V3 · Module 5 — Mandat]] — le contrat-pivot entre propriétaire et agence, sur des lots, jamais sur des biens ; 6 parcours.
- [[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite|V3 · Module 6 — Rapport et fiscalité]] — le rapport au propriétaire mandant et l'aide fiscale ; clôt le cœur métier (modules 0 à 6).
- [[2026-07-24-gerimmo-v3-module-7-incidents|V3 · Module 7 — Incidents]] — 8 parcours, du signalement à la clôture : « l'imputation décide de qui paie ».
- [[2026-07-24-gerimmo-v3-module-8-artisans|V3 · Module 8 — Artisans]] — pièces et expirations de l'artisan : « aucun artisan sans assurance valide chez un locataire ».
- [[2026-07-24-gerimmo-v3-module-9-devis-et-facturation|V3 · Module 9 — Devis et facturation]] — deux devis au plus ; le module qui relie l'intervention à la comptabilité.
- [[2026-07-24-gerimmo-v3-module-10-rdv-et-planning|V3 · Module 10 — RDV et planning]] — deux tours de trois créneaux, l'artisan propose en premier, sans agenda partagé.
- [[2026-07-24-gerimmo-v3-module-11-notation|V3 · Module 11 — Notation]] — trois sources de notation de l'artisan (gérant 50 %, locataire 25 %, plateforme 25 %) ; clôt le bloc intervention.
- [[2026-07-24-gerimmo-v3-module-12-documents-et-ged|V3 · Module 12 — Documents et GED]] — lieu commun des documents, sans arborescence : droits d'accès et durées de conservation.
- [[2026-07-24-gerimmo-v3-module-13-signature-electronique|V3 · Module 13 — Signature électronique]] — décision « signature en V1 » avec Yousign, en signature simple.
- [[2026-07-24-gerimmo-v3-module-14-agenda-et-alertes|V3 · Module 14 — Agenda et alertes]] — un écran commun pour les 27 types d'alertes, criticité et escalade.
- [[2026-07-24-gerimmo-v3-module-15-messagerie|V3 · Module 15 — Messagerie]] — toute conversation est rattachée à un objet (bail, incident, lot), jamais de fil général.
- [[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations|V3 · Module 16 — Onboarding]] — comptes et consentements : une personne existe avant d'avoir un compte ; import du parc.
- [[2026-07-24-gerimmo-v3-module-17-marque-blanche|V3 · Module 17 — Marque blanche]] — habillage de l'agence (logo, deux couleurs), aucun parcours métier modifié.
- [[2026-07-24-gerimmo-v3-module-18-administration|V3 · Module 18 — Administration]] — trois rôles figés, paramétrage des autres modules, facturation entrée dans le périmètre.
- [[2026-07-24-gerimmo-v3-module-19-mobile|V3 · Module 19 — Mobile]] — site adapté, pas d'application native ; trois déclinaisons mobiles ; clôt le référentiel.
- [[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs|V3 · Module 20 — Retours utilisateurs]] — deux circuits : bug traité aussitôt, idée en revue mensuelle.
- [[2026-08-01-bailpdf-com|bailpdf.com]] — site de modèles de documents locatifs, référence pour le catalogue des documents à générer.
- [[2026-08-05-bailpdf-contrat-de-bail|BailPDF — Contrat de bail]] — article de vulgarisation : panorama des baux, mentions et clauses ; à recouper avec Légifrance.
- [[2026-08-05-bailpdf-modele-bail-meuble|BailPDF — Modèle bail meublé (PDF)]] — le modèle-type réglementaire du bail meublé, rempli à blanc.
- [[2026-08-05-bailpdf-modele-bail-non-meuble|BailPDF — Modèle bail non meublé (PDF)]] — le modèle-type réglementaire du bail nu (décret n° 2015-587), rempli à blanc.
- [[2026-09-04-maquette-v3-prototype|Maquette v3 — prototype cliquable]] — troisième prototype cliquable (04/09) : fonctionnalités et visuel à intégrer à l'application.
- [[2026-09-08-maquette-espace-agence-v6|Maquette espace agence v6]] — maquette interactive du 08/09 de l'espace agence, vues de l'agent et de l'administrateur d'agence.
- [[2026-09-14-service-public-depot-colocation|Service Public — dépôt et colocation]] — source officielle (14/09) : bail commun nu ou meublé et plafond du dépôt hors charges.
- [[2026-09-20-cahier-des-charges-maitre-v3|Cahier maître V3]] — cahier des charges maître V3 (100 sections), adopté le 20/09 comme référence produit prioritaire.
- [[2026-09-28-decision-tarification|Décision tarifaire du 28/09/2026]] — consigne du porteur : nouvelle tarification, le premier bien n'est plus gratuit ; détail dans [[Grille tarifaire]].
- [[Référentiel vérifiable Gerimmo du 12 septembre 2026]] — 465 exigences et neuf parcours de personas ; « le minimum » selon le porteur (14/09).
- [[Décisions du dirigeant]] — `DECISIONS-2026-11-24.md` : les réponses écrites du dirigeant mot pour mot depuis le 24/11, avec ce que l'agent en a fait.
- [[Recueil des textes officiels (v6)]] — recueil de 166 pages fourni par le dirigeant le 24/11 (bail, consommation, RGPD…) ; non recontrôlé sur Légifrance.

## Synthèses
- [[Vision de l'écosystème Gerimmo]] — la seule page de vision : ambition, principes, acteurs, marché et concurrence, étages, revenu, marque, idées abandonnées ; brouillon à valider.
- [[Passation — état du 26 novembre 2026]] — état de la production et du travail en cours, mis à jour le 27/11 (lot 1 publié, recette n° 63 réussie) ; décisions en attente, règles de publication, outillage.
- [[Référentiel du palier 1]] — le document de référence du palier 1 : cahier V3 et wiki fusionnés, règles numérotées, décisions du 24/11, registre des contradictions.
- [[Mission palier 1 — audit du 22 novembre 2026]] — audit puis corrections en autonomie du palier 1, publiés le 25/11 ; réglages de la console encore à faire (en cours).
- [[Premiers clients — acquisition sans budget — 20 novembre 2026]] — chantier du 20/11 : freins d'activation levés ; les inscrits étaient des comptes de test, le premier frein est d'attirer des visiteurs.
- [[Analyse concurrentielle]] — panorama des concurrents en France et en Belgique (22/07) ; marché et prix actualisés par la feuille de route du 26/11.
- [[Canaux de communication]] — l'e-mail et l'espace personnel au palier 1 ; Telegram abandonné, WhatsApp non construit ; relu dans le code le 26/11.
- [[Design system Gerimmo]] — la direction « A — Maison » en production depuis le 20/11 : principes, couleurs, typographie ; en cas de désaccord, le code fait foi.
- [[Refonte visuelle « Maison » et Design System — 20 novembre 2026]] — audit des 133 pages puis harmonisation sous l'identité « Maison », en production depuis le 20/11.
- [[Modèle de données]] — le schéma actuel (576 migrations, environ 235 tables) par domaine et tables pivots ; réécrit d'après le code le 26/11.
- [[Modèle de rôles et permissions]] — un seul axe, le rôle porté par l'adhésion, et ce que chaque rôle peut faire ; réécrit d'après le code le 26/11.
- [[Expansion territoriale autonome]] — idée du 19/09 : gagner du terrain département par département, sans démarcher les particuliers ; gestion nationale précisée le 28/09.
- [[Choisir son locataire selon les conditions des assurances loyers impayés]] — brouillon d'octobre : rapprocher un dossier des conditions d'une GLI ; conseils masqués, sources à relire.
- [[État du projet et décisions ouvertes]] — renvoi vers `QUESTIONS.md`, [[Décisions du dirigeant]] et [[Passation — état du 26 novembre 2026]].

## Archives
- [[Historique des audits]] — recense les 73 pages archivées dans `wiki/archives/AAAA-MM/` (audits, points d'étape, passations, pages remplacées), avec leur date et leur résumé.

## Livrables
- `livrables/OUVERTURE-VENTE-30-NOVEMBRE.md` — le pas-à-pas pour ouvrir la vente aux particuliers et aux SCI le 30/11.
- `livrables/MENAGE-WIKI-2026-11-26.md` — le plan de ménage du wiki du 26/11, en sept décisions.
- `livrables/PLAN-CORRECTIONS-2026-11-26.md` — le plan de correction des défauts restants (lots L1 à L8), établi en lecture seule le 26/11.
- `livrables/NON-FAIT.md` — ce qui n'a pas été fait pour la version du palier 1, pourquoi, le risque et ce qu'il faudrait.
- `livrables/PARCOURS-15-MINUTES.md` — le parcours de vérification que le dirigeant fait lui-même en production après la publication.
- `livrables/PLAN-DE-PUBLICATION.md` — le plan de publication du palier 1 : exécuté le 25/11 ; les réglages de la console R1 à R8 restent à faire.
- `livrables/refonte-design-20261120/DESIGN-SYSTEM.md` — le résumé du Design System « Maison » pour qui ne lit pas le code.
- `livrables/recette-commerciale/VENTES-ET-CONDITIONS.md` — la première souscription d'un particulier : textes contractuels proposés, médiateur, TVA et courriels à valider.
- `livrables/Mentions legales (projet).md` — projet de mentions légales du 11/09 ; les faits d'entreprise attendent une réponse humaine et une relecture juridique.
- `livrables/Politique de confidentialite (projet).md` — projet de politique de confidentialité du 25/07 pour les traitements dont Gerimmo est responsable.
- `livrables/AIPD - Score artisan (projet).md` — projet d'analyse d'impact (art. 35 du RGPD) du score composite de l'artisan.
- `livrables/Contrat de sous-traitance RGPD (modele).md` — modèle de contrat de sous-traitance (art. 28 du RGPD) à annexer au contrat de chaque agence ; à faire relire.
- Autres dossiers de `livrables/` : traces et preuves d'audit, gardées telles quelles.

## Registres de la racine
- `QUESTIONS.md` — le registre unique des questions et décisions (Q1 et suivantes).
- `DECISIONS-2026-11-24.md` — les réponses du dirigeant, mot pour mot ; voir [[Décisions du dirigeant]].
- `JURISTE.md` — les points de droit qu'un juriste, un expert-comptable ou la CNIL doit trancher ; aucun n'est présenté comme conforme.
- `GUIDE-DE-REPRISE.md` — le guide pour qu'un informaticien reprenne le projet : où est quoi, lancer, publier, revenir en arrière.
