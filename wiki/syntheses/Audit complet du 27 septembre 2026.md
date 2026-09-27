---
type: synthesis
tags: [audit, securite, metier, console, agence, locataire, proprietaire, artisan, production]
status: stable
created: 2026-09-27
updated: 2026-09-27
sources: ["[[Audit complet du 25 septembre 2026]]", "[[Registre des traitements]]", "[[Plan de reprise d'activité]]", "[[Révision annuelle IRL]]", "[[Restitution du dépôt de garantie]]", "[[Relances et mise en demeure]]", "[[Quittance conforme]]", "[[Machines à états et événements]]", "[[Isolation multi-organisation]]", "[[Artisan]]"]
---
# Audit complet du 27 septembre 2026

Trois jours avant le lancement visé ([[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]),
après la mise en production de la console à sept entrées. Six relevés en parallèle,
chacun confronté au wiki, puis six lots de correction. **41 migrations**, toutes
rejouées sur une base neuve dans l'ordre de leur date, **2 086 tests unitaires verts**.

## 1. Ce qui a été relevé

| Périmètre | Bloquants | Majeurs | L'essentiel |
|---|---|---|---|
| Métier (calculs et documents) | 2 | 14 | Régularisation au sens inversé dans le PDF ; révision IRL composée (loyer surévalué dès la 2ᵉ révision) |
| Artisan, pages publiques, compte | 3 | 7 | Réclamation d'une fiche artisan sans preuve ; devis PDF déposable hors mission ; facture impossible à déposer |
| Sécurité et données | 1 | 7 | `fermer_alertes_origine` appelable par tout compte connecté ; conservation comptée depuis la création du document et non depuis la fin du contrat |
| Espace agence | 1 | 7 | La machine à états du bail contournable par écriture directe ; cloison du portefeuille agent absente sur 17 tables |
| Propriétaire et locataire | 0 | 6 | Quittance délivrée au locataire non conforme ([[Quittance conforme]]) ; créneaux passés encore retenables |
| Console de supervision | 0 | 9 | Décision du point du matin prise sur un état périmé ; gestes de la console absents du journal d'audit |

La production elle-même était saine (tâches planifiées actives, sauvegarde du 27/09
réussie), sauf la **veille réglementaire du 26/09**, tombée sur une citation-preuve
abrégée : l'étude d'une source rejetée n'emporte plus les autres.

## 2. Ce qui est corrigé

**Métier**
- [[Révision annuelle IRL]] : le calcul part de l'indice de la dernière révision (plus de composition) ; une baisse reste possible avec un dépôt d'un mois (plafond vérifié à la fixation seulement).
- Loyer « à terme échu » appelé en fin de mois ; forfait de charges refusé sur un bail nu.
- Zone tendue **figée au bail** (`baux.zone_tendue`) ; congé du bailleur au seul terme du bail, avec prix et bénéficiaire.
- [[Restitution du dépôt de garantie]] : trop-perçu restitué, date limite juste, « sur demande » réservé aux pièces qui existent.
- [[Relances et mise en demeure]] : avis et relances à **chaque** colocataire solidaire, montant de la dette totale.
- Quittance : règlement du **terme** quittancé (et non du dernier encaissement), ligne de régularisation additionnée.

**Sécurité et données** ([[Socle de sécurité]], [[RGPD]])
- Fonctions sensibles réservées au service ; événements techniques réservés filtrés en lecture.
- Conservation comptée depuis la **fin** du bail, du mandat ou de la gestion ; anonymisation distincte de la suppression (voir § 4).
- Purge physique quotidienne des fichiers (tâche `purge`, 03:40) ; sauvegarde **quotidienne** avec les droits de la base, exercice de restauration outillé ([[Plan de reprise d'activité]]).
- Dépôts de fichiers liés à l'appelant, adhésions et suppressions d'encaissement journalisées (motif obligatoire), acceptations de CGU en ajout seul, cookie d'inactivité signé, veille diffusée selon son public (l'alerte Supabase sur la vue est levée).

**Espace agence** ([[Machines à états et événements]], [[Isolation multi-organisation]])
- Bail : créé en brouillon, état changé seulement par les fonctions métier, contenu figé une fois signé.
- Cloison du portefeuille agent sur les 17 tables restantes et sur le tableau du mois.
- « Annuler l'écriture » refusé sur une écriture née d'un encaissement ; justificatif et décision dans la même transaction (plus de pièce orpheline).
- L'administrateur d'agence invite ses agents ; titulaire du mandat contrôlé.

**Propriétaire et locataire**
- Page `/quittance` sur le modèle conforme, émetteur complet ou document retenu.
- « Retirer ce bien » : archivage réel, exclu de la facturation ([[Archivage plutôt que suppression]]).
- Parcours de démarrage jusqu'au premier loyer encaissé ; page 404 en français ; motifs de préavis réduit dans « Annoncer mon départ ».

**Artisan et pages publiques** ([[Artisan]], [[Devis]])
- Réclamation de fiche prouvée, devis PDF seulement sur mission, **dépôt de facture** (dans le seul dossier de sa facture), demandes de devis protégées contre l'abus.

**Console**
- Décisions du point du matin relues à l'état courant ; un seul chiffre « À décider ».
- Santé et Travail des équipes sur une même source ; chaque geste de la console journalisé.
- Gestes de contrôle : suspendre, réactiver, prolonger l'essai, archiver une organisation ; bloquer un compte ; suspendre un artisan.

## 3. Ce qui reste structurel (non traité)

- Régularisation de charges : le solde n'est ni appelé ni remboursé en cours de bail (appel complémentaire ou avoir à concevoir).
- Grille de vétusté ([[Vétusté et décote]]) et table historisée des indices IRL.
- Antivirus des dépôts (RM-A4.8) : demande un service ClamAV hébergé en France.
- Invitation avec acceptation, relances J+3/J+10 et expiration J+30 : seule la trace est faite.
- Une réactivation Stripe peut rouvrir une organisation suspendue à la main.

## 4. Ce qui ne dépend que du porteur

- Les **faits légaux de l'éditeur** (page Paramètres de la console).
- La localisation de Resend et le fondement du transfert hors UE par GitHub Actions ([[Registre des traitements]]).
- La durée de conservation des factures d'artisan.
- ~~La durée de conservation des sauvegardes~~ — **tranché le 27/09 : 90 jours** ([[Plan de reprise d'activité]]).

> [!warning] Points à trancher / contradictions
> - **Anonymisation au terme de la conservation** : la fiche est gardée et neutralisée, mais le fichier est détruit, faute de savoir expurger un PDF nominatif (RM-A2.5 exige l'irréversible). À valider.
> - ~~Assurance de l'artisan~~ — **tranché le 27/09 : décennale ET RC pro en cours** pour valider une inscription (migration `20260927210000`, [[Artisan]]).
> - ~~Sauvegardes : 90 j contre 30 j~~ — **tranché le 27/09 : 90 jours**.
> - **Lacunes du wiki relevées par l'audit métier** : plafonnement de l'IRL et arrondi du loyer révisé, majoration de 10 % pour restitution tardive, borne du dernier jour de préavis, sort d'une quittance dont l'encaissement est annulé, délai de communication du décompte de charges, liste des communes en zone tendue.
