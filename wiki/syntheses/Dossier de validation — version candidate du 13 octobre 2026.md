---
type: synthesis
tags: [audit, livraison, validation, v1, migrations, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Registre des anomalies — audit du 13 octobre 2026]]"]
---

# Dossier de validation — version candidate du 13 octobre 2026

Ce dossier dit **ce que contient la livraison**, **ce qui a été vérifié**, **ce qui reste à décider** et **ce qui ne part en production qu'avec une
autorisation explicite**. **Mise à jour du 14/10/2026 (après autorisation) : la version contrôlée est fusionnée (PR #179, `c99e2c6`), déployée sur Vercel et les deux migrations sont
appliquées en production** (voir § 5 bis ; les paragraphes ci-dessous décrivent la situation avant cette autorisation). État : **version déployée, vérification post-déploiement non destructive faite, mission non terminée** (voir § 8).

> [!info] Mise à jour du 16/10/2026
> Après les réponses du dirigeant du 14/10 et du 15/10, treize fusions ont suivi (PR #181 à #193) : vagues 1 à 4a, jour de Paris, D18, D22-B et D23-A, X16, X18, X19, D24-C, D27-B et le relais du dirigeant (D46-B, partie alerte). Le tableau des déploiements est au § 5 quater, l'état décision par décision dans [[Décisions groupées — version candidate du 13 octobre 2026]]. **La mission n'est toujours pas terminée** : les contrôles en production des quatre P1 ne sont pas joués, et l'invitation d'un artisan par un propriétaire (décision du 15/10) est en cours, non livrée.

Version contrôlée : commit `0ad658a` (batterie complète du 14/10/2026). Tête de la branche au moment de la génération : `0ad658a`.
Aucun fichier de code, de test ni de migration n'a changé depuis le commit contrôlé (seuls le wiki et les registres changent).

Compagnons : [[Registre des anomalies — audit du 13 octobre 2026]], [[Fiches des anomalies P3 — audit du 13 octobre 2026]], [[Registre d'exécution — audit du 13 octobre 2026]],
[[Registre d'exécution — scénarios, audit du 13 octobre 2026]], [[Décisions groupées — version candidate du 13 octobre 2026]].

## 1. Ce que contient la livraison

| Lot | Anomalies (extraits) | Nature | Migration |
|---|---|---|---|
| Agences retirées du site public de la V1 (code, composants et espace `/agence` conservés) ; vocabulaire d'agence retiré des parcours propriétaire, locataire, artisan | PUB-01, PUB-02, PUB-04, PROP-06, PROP-09, PRO2-22, DES-A-02, DES-A-07, DES-B-09 | pages publiques et textes | non |
| Préparation du soir du marketing | MKT-01 | `pg_cron` ne pouvait pas appeler la préparation (`auth.role()` vide hors requête) | `20261013110000` |
| Récapitulatif fiscal « location nue » | FIN-01 (P1), VER-TS-04 | le document imprimait des zéros ; périmètre dit clairement | non |
| Saisie et courriers : échappement HTML, longueur des champs, fiches, montants et dates, élisions | AUD-B-01, AUD-B-02, PROP-02, PROP-04, PROP-07, PROP-12, PROP-13, AUD-C-01, VER-TS-01 à 03, VFL-04 à 07 | contrôles côté serveur et textes | non |
| Portefeuille de l'agent, traces d'audit, événement d'annulation de mission, arrêt d'urgence pendant un diagnostic, alerte escaladée, reprise des créneaux, jour de Paris de l'outil artisan | AUD-A-01 à A-04, SUP-02, SUP-08, REP-01, ARC-10, VER-SQL-01 à 04 | neuf fonctions SQL modifiées (relues dans leur définition en vigueur, rejouables) et une valeur d'énumération | `20261013120000` |
| Protection de sortie des formulaires et copies locales (corrections de la PR #178) | PR178-A-01 à A-08, PR178-B-01, B-02, B-05, VER-PR178-01 à 05, 07, VFL-03 | confirmation de sortie classée sur 51 formulaires, purge à la déconnexion et au changement de compte, statut de copie véridique | non |
| Console de supervision : bandeau d'arrêt, journal nommé, dates à l'heure de Paris | SA-04, SA-05, SA-06, SA-08, SA-03, SA-07 | interface | non |
| Interface et accessibilité : focus sous la barre fixe, débordements à 390 px, menu « Plus », rail tablette, titres, squelette de chargement | DES-A-01 à A-15 (sauf décisions), DES-B-01 à B-11 (sauf décisions), PRF-01 | CSS et composants | non |
| Outil artisan « clients externes » : heures de Paris, messages, état, session expirée | ARC-01, 02, 03, 05, 06, 09, 11, 12 | interface et actions | non |
| Chantier de migrations et export | RET-01, CHF-04, AUD-C-06 | garde de nom de fichier ; formules neutralisées dans le CSV | non |
| Retours arrière des deux migrations | — | `app/supabase/retours-arriere/` : scripts essayés (état revenu identique à l'état d'origine) | non appliqués par le chantier |

Bilan du registre : **237 anomalies** (P0 : 0 ; P1 : 5 ; P2 : 66 ; P3 : 166) ; **109 corrigées en branche**, **1 déployée** (PDM-01, § 5 bis), **100 à trancher**, 24 ouvertes (dont 4 P1), 3 réfutées/acceptées. Les lignes « corrigée en branche » sont déployées depuis le 14/10 (note en tête du registre).

## 2. Migrations à appliquer en production

**Appliquées le 14/10/2026** (exécution n° 72, après sauvegarde n° 23 ; voir § 5 bis). État relevé en lecture seule *avant* application : la dernière migration appliquée était `20261013107000`.

1. `20261013110000_marketing_preparation_du_soir_cron.sql` — crée une fonction interne sans garde, fermée à tous les rôles, et une enveloppe qui garde la garde `service_role` ; `preparation_marketing_due()` lit la version interne. **Effet réel : à partir du premier passage de la tâche après application (jeudi 15/10, 18 h Paris, si l'accord arrive avant), la préparation de la publication du lendemain redevient possible depuis `pg_cron`** (automatisme déjà approuvé avec sa fenêtre de veto, mais jamais exécuté jusqu'ici). *Constaté en production le 14/10/2026 : voir « Passage forcé de la préparation du soir » au § 5 bis.*
2. `20261013120000_correctifs_audit_13_octobre.sql` — modifie **neuf** fonctions en relisant leur définition en vigueur (`pg_get_functiondef`), chacune avec une marque de rejeu ; si la définition n'est pas celle attendue, la migration s'arrête et ne change rien. Elle ajoute `mission_annulee` à la liste des types d'événement d'incident. Aucune ligne existante n'est touchée.

**Simulation** : exécution n° 71 de `migrations.yml` (14/10, 02 h 52 UTC, tête `2235d73`) : les deux fichiers joués dans l'ordre contre la production, puis `ROLLBACK`. Les fichiers de migration n'ont **pas changé depuis** cette exécution.
**Retour arrière** : `app/supabase/retours-arriere/` (un script par migration, essayé A → B → C sur base jetable : catalogues identiques) ; voir [[Dossier sécurité et restauration — retour arrière des migrations du 13 octobre 2026]]. Il réintroduit les défauts corrigés et ne défait pas les lignes `mission_annulee` déjà écrites.
**Procédure** : sauvegarde (« Sauvegarde quotidienne » déclenchée à la main), `migrations.yml` en simulation, application réelle, contrôles non destructifs. Aucune de ces étapes n'est faite sans votre autorisation.

## 3. Contrôles de la version candidate

| Contrôle | Résultat sur `0ad658a` |
|---|---|
| Lint, build de production, types | réussi, réussi, réussi |
| Tests unitaires et de base (vitest) | 370 passed, 1 skipped (371) ; 4207 passed, 14 skipped (4221) (référence `e9f31ac` : 3 333 réussis, 14 ignorés) |
| Parcours navigateur (Playwright) | 1 skipped, 168 passed — voir la note ci-dessous |
| Matrice des écrans | réussi |
| Audit des écrans à 768 px et à 1440 px (tous profils) | réussi, réussi |
| Simulation des migrations contre la production | réussie (n° 71, tout annulé) |
| CI GitHub Actions (Postgres 18, lint, types, tests, build, parcours) | réussie : exécution n° 637, 14/10, tête `0ad658a` |
| Vérification en navigateur des corrections d'interface (construction finale) | 12 cas réussis, 2 partiels, 6 constats P3, 0 P1/P2 ; 291 captures « après » ; voir [[Registre d'exécution — scénarios, audit du 13 octobre 2026]] |
| Vérification en navigateur de la saisie et de la protection (construction finale) | 46 formulaires examinés, 0 écart au classement ; 2 P2 relevés (VFL-03, VFL-07) puis corrigés |
| Dernière vérification en navigateur de ces corrections et de la déconnexion hors ligne (SHA figé) | 0 P0, 0 P1, 0 P2 ; 3 écarts P3 consignés (V10-01 à 03) : lecture des montants du parcours de bail, point décimal dans un message de révision IRL, « Administration » coupé dans le rail de l'agence (hors V1) |

Note sur les parcours : sur la tête contrôlée, les 168 parcours passent, dont les deux cas ajoutés pour la déconnexion hors ligne et la copie locale refusée. La batterie précédente (`b9a7107`) avait un parcours « fiche personne et justificatif » en échec : le test attendait un statut « conservé » périmé avant de fermer l'onglet ; il attend maintenant une nouvelle révision réellement écrite, et le statut affiché est véridique pendant le délai d'écriture.

## 4. Observation de la production (lecture seule, 14/10/2026)

Instructions `SELECT` uniquement ; pièce : `preuves/production-lecture-seule/releve-2026-10-14.json` (voir l'archive des preuves, § 10).

| Contrôle | Résultat |
|---|---|
| Encaissements au-delà du centime / datés du futur / écritures au-delà du centime | 0 / 0 / 0 |
| Comptes dont les métadonnées dépassent 4 000 octets (maximum 343) | 0 |
| Biens au code postal hors 5 chiffres / construits avant 1600 / personnes nées dans le futur | 0 / 0 / 0 |
| Arrêts d'urgence actifs / alertes escaladées | 0 / 0 |
| Tâches `pg_cron` actives | 8, aucune en échec sur 3 jours ; `marketing-declencheur` : 540 exécutions réussies |
| Publications | 1 proposition, 8 publiées, 2 refusées |

> [!warning] Ce que ces « 0 » ne prouvent pas
> La production ne contient **aucune écriture comptable ni aucun encaissement** (0 écritures, 0 encaissements, 0 captures fiscales), 2 organisations (toutes `proprietaire_direct`), 4 biens, 4 personnes, 6 comptes. Les contrôles de montants et de dates sont donc vrais mais **vides**, et FIN-01 (P1) comme FIN-11 n'ont, à ce jour, touché aucune donnée de production. Les corrections financières n'ont été éprouvées que sur le banc.

## 5. Porte de validation et question d'autorisation

| Critère de la mission | État |
|---|---|
| Aucune anomalie P0 ouverte | respecté : 0 P0 |
| Aucune anomalie P1 ouverte dans la version à livrer | **non respecté dans la version déployée le 14/10** : le dirigeant a classé P1 bloquants les quatre risques « montant faux » (VER-TS-02, PR178-B-06, CHF-01, CHF-02) ; FIN-01 (P1) est corrigée et déployée. La correction des quatre est la vague 1 ; **aucun nouveau déploiement ne passe la porte tant qu'elles ne sont pas corrigées** |
| Risques « montant faux » | **classés P1 par le dirigeant le 14/10/2026** (Q3 et Q5, réponse B) ; ouverts en production ; exposition réelle limitée aujourd'hui : la production ne contient aucune écriture comptable (relevé du 13/10, revérifié le 14/10) |
| Sauvegarde avant migration | à faire juste avant l'application |
| Simulation des migrations | faite sur la version finale (n° 71) |
| Contrôles en production non destructifs | faits pour l'état courant (§ 4) ; à refaire après application |
| Autorisation explicite du dirigeant | **en attente** |

Question à vous poser, dans les termes de la mission, **quand vous aurez tranché Q1 à Q5 et répondu à R1 à R10** : « Autorises-tu le déploiement de la branche `claude/compassionate-euler-qpqjp6` au commit `<SHA à figer>` sur la production (fusion, déploiement Vercel), avec les migrations `20261013110000` et `20261013120000` appliquées dans cet ordre après sauvegarde, **et l'activation de fait de la préparation du soir du marketing par `pg_cron` (premier passage jeudi 15/10 à 18 h Paris si l'accord arrive avant ; sinon à la date suivante)**, avec les corrections R1 à R10 que tu auras ratifiées ? ». Tant que la réponse n'est pas donnée : **version prête pour validation, production non déployée**. *Réponse reçue le 14/10/2026 : « oui » — voir § 5 bis.*

## 5 bis. Mise en production du 14 octobre 2026

**Autorisation reçue.** Le dirigeant a répondu « oui » à la question posée au § 5, dans ses termes exacts : déploiement de la branche `claude/compassionate-euler-qpqjp6` au commit contrôlé `0ad658a` sur la production (fusion, déploiement Vercel), migrations `20261013110000` puis `20261013120000` après sauvegarde, activation de fait de la préparation du soir du marketing par `pg_cron`, corrections R1 à R10 ratifiées. **Rien au-delà n'est autorisé par cette réponse** : les autres décisions (D01 à D49, Q1 à Q5, fonctions majeures, équipes IA) ne sont pas enregistrées comme tranchées et rien n'a été activé ni installé en plus.

| Étape | Résultat |
|---|---|
| Sauvegarde avant migration | « Sauvegarde quotidienne » déclenchée à la main, exécution n° 23 : réussie |
| Migrations | `migrations.yml`, application réelle, exécution n° 72 : réussie ; les deux versions sont enregistrées dans `schema_migrations` |
| Fusion | PR #179, CI de la tête `c464fb9` réussie ; fusion « squash » le 14/10/2026, commit `c99e2c6` sur `main` (le code est celui du commit contrôlé `0ad658a` ; seuls le wiki et les registres ont changé depuis) |
| Déploiement Vercel | déploiement `dpl_7w73Ewv2GV2Q3K5GHbqGuJW4JGuB`, cible production, état `READY` en environ deux minutes, alias `www.gerimmo.app` et `gerimmo.app` ; le déploiement précédent (`dpl_4Kx6tXLSSwWZ66ENi3DwZoGEpZa7`, PR #178) reste disponible comme point de retour |

**Contrôles après déploiement, tous en lecture seule (14/10/2026, 10 h 55 à 11 h UTC) :**

- Vercel : 0 erreur d'exécution sur la dernière heure.
- Pages publiques `/`, `/tarifs` et `/connexion` : réponse 200 sur `www.gerimmo.app` (redirection 308 depuis `gerimmo.app`) ; **aucune occurrence du mot « agence »** dans le texte visible de l'accueil et des tarifs ; la page de connexion annonce « propriétaire, locataire ou artisan ».
- Base : les dix migrations du lot du 13 octobre sont enregistrées (de `20261013100000` à `20261013120000`) ; 8 tâches `pg_cron` actives, 0 échec sur la dernière heure ; la tâche `marketing-declencheur` (toutes les 5 minutes, de 5 h à 19 h UTC) est inchangée ; 0 ligne `mission_annulee` ; la fonction interne de ciblage ne désigne aucune préparation « due » à cet instant, ce qui est attendu (publications le mardi et le vendredi à 9 h, préparation la veille à 18 h Paris).
- Alertes de sécurité Supabase : 4 (une information : table à sécurité de ligne sans politique ; trois avertissements : extension dans le schéma public, fonctions `security definer` exécutables par les comptes connectés, durée de validité du code à usage unique). La durée de validité du code (86 400 s) était déjà connue (§ 7) ; les trois autres n'ont **pas été comparées une à une à un relevé antérieur** (le détail n'a pas été fourni par l'outil).

**Ce qui n'est pas vérifié, et pourquoi :**

- Aucun parcours connecté en production (propriétaire, locataire, artisan, super-administrateur) : aucune écriture n'a été faite en production, et les corrections financières restent éprouvées seulement sur le banc (la production ne contient aucune écriture comptable).
- **La préparation du soir du marketing a tourné pour la première fois le 14/10/2026, à la demande du dirigeant** (voir « Passage forcé du 14/10 » ci-dessous). Ce passage a été provoqué par un changement de réglages ; le déroulement sans intervention (jeudi 15/10 à 13 h Paris, pour la publication du vendredi 16/10) reste à observer. Retour arrière de la migration `20261013110000` : `app/supabase/retours-arriere/`.
- Le réseau de l'environnement de l'audit refuse l'accès direct à `gerimmo.app` (réponse 403 du proxy) : les pages ont été lues par l'outil Vercel, sans navigateur ni captures.
- Retour arrière du code : revert de la fusion `c99e2c6` (ou promotion du déploiement précédent) ; de la base : `app/supabase/retours-arriere/LISEZ-MOI.md`, en ordre inverse, après sauvegarde.

### Constat après déploiement : le point du matin ne s'actualisait plus (14/10/2026) — corrigé par la PR #180

- **Observé** : Vercel regroupe 5 erreurs `[point du matin] Le point n'a pas été actualisé : données indisponibles (artisans)` (route `/api/cron/equipes`, première le 13/10 vers 09 h 40 UTC, dernière le 14/10 à 11 h 15 UTC). La dernière décision du point a été créée le 13/10 à 09 h 11 UTC ; **236 décisions restent « en attente »** dans `decisions_du_matin`.
- **Cause établie (lecture du code et de la base)** : le point est regénéré après chaque mission avec le client de service (`genererPointsDuMatin`), qui lit `artisans_a_valider()`. Cette fonction exige `is_super_admin()`, c'est-à-dire une session humaine au second facteur : appelée par le client de service, elle répond « Accès refusé » à chaque fois. Avant la PR #177, l'échec était avalé (liste des artisans vide, sans bruit) ; depuis le commit `d4f3b59` (13/10), une source illisible **bloque tout l'enregistrement** pour ne pas classer des décisions en attente comme « sans objet ». Le point est donc figé depuis le déploiement de la PR #177, **avant** la version de ce dossier : ni la fusion du 14/10 ni les migrations n'y sont pour quelque chose.
- **Effets** : la file de décisions du matin n'est plus mise à jour (y compris pour les nouveaux posts du marketing : leur alerte part bien par e-mail, mais n'apparaît pas dans le point). Le veto reste possible dans `/admin/marketing`. Les validations d'artisans en attente n'ont, de leur côté, jamais figuré dans le point (liste vide silencieuse avant le 13/10).
- **Correction** (autorisée par le dirigeant le 14/10, PR #180 fusionnée en `0f7dbd5`, déployée sur Vercel `dpl_6R5gZqMyEQE1KWWtpWbMkVDxnURy`) : `lireAttentes` lit désormais `artisans` avec ses justificatifs imbriqués, en une seule requête, avec le contenu de la fonction SQL ; aucune migration, aucun droit modifié. Contrôles : tests rouge puis vert (5 échecs avant), sept altérations du code détectées par les tests, équivalence rejouée sur le banc en transaction annulée, requête imbriquée essayée contre l'émulateur local, suite complète en local (3 998 réussis, 230 ignorés faute de base) et CI GitHub verte, relecture indépendante à trois angles sans défaut bloquant. Un écart voulu : l'échéance se compare au jour de Paris, la fonction SQL au jour UTC (1 à 2 h par nuit).
- **Pas encore constaté en production** : la régénération du point par le client de service (prochain passage de mission, cette nuit vers 03 h UTC) ; la requête imbriquée n'a pas pu être essayée sur l'API de production depuis l'environnement (accès réseau refusé). Les 236 décisions déjà en attente ne sont pas touchées ; le prochain passage crée les 7 points du jour (environ 32 décisions neuves), sans e-mail ni notification.
- **Registre** : [[Registre des anomalies — audit du 13 octobre 2026]], fiche `PDM-01` (P2, statut « déployée »).

### Passage forcé de la préparation du soir, 14/10/2026

À la demande du dirigeant (« change l'heure et fais-le maintenant », option « forcer un passage maintenant » choisie après avoir été prévenu des effets), pour constater la correction en production sans attendre jeudi :

1. **Réglages modifiés** (`marketing_reglages`, 13 h 11 Paris) : `heure_preparation_paris` 18 → **13** ; `jours_semaine` {mardi, vendredi} → {mardi, **jeudi**} (la base impose exactement deux jours, `publications_semaine = 2`) afin que le lendemain, jeudi 15/10, soit un jour visé.
2. **Constat avant déclenchement** : `preparation_marketing_due()` renvoyait **vrai** (cible : jeudi 15/10, rang 1, parution 09:00 Paris). C'est la première fois que la fonction corrigée par la migration `20261013110000` désigne une cible depuis la base.
3. **Déclenchement par `pg_cron`** (tick de 13 h 15 Paris, sans appel manuel) : la tâche `marketing` a consigné `agi: true`, `preparees: 1`, `alerte: true`, `rattrapage: false`. Le côté HTTP de `pg_net` a affiché un dépassement de 15 s ; le traitement serveur, lui, est allé au bout (post programmé et alerte envoyée dans la même minute).
4. **Résultat** : publication `6a624ae5-b0ee-42b7-8054-6ecfbcc36ae1`, « Un agenda qui vous prévient avant l'échéance », sujet éditorial (aucune veille relayée), visuel créé, statut `programmee` pour **jeudi 15/10 à 09:00 Paris**, non validée (`validation_obligatoire` est faux). Elle paraîtra sur le site puis sur Facebook sans autre geste, **sauf refus ou report** par le superviseur dans `/admin/marketing` avant 09:00 ; l'e-mail d'alerte est parti à l'adresse du superviseur permanent.
5. **Réglages rétablis** : `jours_semaine` {mardi, vendredi}. `heure_preparation_paris` **reste à 13** (c'était la demande) ; la remettre à 18 est un réglage en base, l'écran `/admin/marketing` ne la modifie pas.

**Conséquences à connaître**
- Le plafond hebdomadaire de diffusion Facebook est de deux envois par semaine (`reserver_diffusion_facebook`) : mardi 13/10 (1) + jeudi 15/10 (2). **Le post de vendredi 16/10 sera préparé jeudi à partir de 13 h et paraîtra sur le site, mais sa diffusion Facebook sera refusée par le plafond** (message « diffusion Facebook non réservée » dans le bilan de la tâche, qui passera en erreur 503 pour ce passage). À trancher : laisser ainsi, ou refuser/reporter le post de jeudi, ou relever le plafond (changement de règle, non fait).
- Coût réel du passage : rédaction du texte éditorial (sans veille) et création du visuel ; non mesuré.
- Les réglages ont été modifiés en SQL direct, hors de l'écran et de son journal de supervision (`modifie_par` inchangé) : cette page et le journal du wiki en tiennent lieu de trace.

## 5 ter. Décisions du dirigeant du 14/10/2026

**Q3 et Q5 : P1 bloquants. Toutes les autres décisions : la recommandation de l'agent est suivie.** Le tableau décision par décision, avec ce qui reste différé (avis spécialisé), à votre choix ou à autoriser (essais de restauration et de stockage), est dans [[Décisions groupées — version candidate du 13 octobre 2026]], section « Réponses du dirigeant ». Le travail a été conduit par vagues, chacune en branche, relue par des agents indépendants, rejouée sur le banc, puis déployée selon le protocole (sauvegarde, simulation, application, fusion, recette). **État au 16/10** : vagues 1 (P1 et finance), 2 (supervision, sécurité, données), 3 (chaîne d'intervention, interface, éditorial ; sans D32) et 4a (points X), puis D18, D22-B, D23-A, X16, X18, X19, D24-C et D27-B en production entre le 14 et le 15/10 ; relais D46-B (partie alerte) le 16/10. Détail au § 5 quater.

**Réponses du dirigeant du 15/10/2026** : invitation d'un artisan par un propriétaire, l'artisan s'inscrivant lui-même (remplace D17-B ; en cours, non livrée) ; relais D46-B (responsable le dirigeant, e-mail vers deux adresses fournies par le dirigeant et gardées hors du dépôt, 05 h 00 heure de Paris, urgences immédiates ; livré le 16/10) ; suite du jour de Paris, points 1, 2 et 5 (livrés) ; D24-C « finis » (livré, module « clients externes » éteint) ; X16, relances J+3/J+10 (livrées).

**Autorisation de déployer (14/10/2026, « tu as l'autorisation »).** Portée retenue : fusion, déploiement et migrations des vagues 1 à 4, chacune seulement après relecture indépendante sans constat bloquant, batterie complète verte sur le commit intégré, simulation des migrations réussie et aucune anomalie P0/P1 ouverte dans ce qui est livré. Hors portée : activation de fonctions désactivées, D17-B, essais de restauration et de stockage, parties soumises à un avis spécialisé, identité de l'éditeur. Chaque déploiement est consigné dans le journal.

## 5 quater. Déploiements du 14 au 16 octobre 2026

Source : journal `log.md` (entrées « deploy » et « audit ») et messages de fusion de `main`. Identifiants des chantiers GitHub Actions : sauvegarde / simulation / application réelle des migrations, puis recette de production à comptes éphémères (avec nettoyage).

| Date | PR, fusion | Contenu | Migrations | Sauvegarde / simulation / application | Recette de production |
|---|---|---|---|---|---|
| 14/10 | #181, `d38487a` | Vague 1 : P1 « montant faux », finance, bail et sortie | `20261014100000` à `…123000` (7) | n° 24 / n° 73 / n° 74 | n° 4 : 32 réussis, 2 échoués (tests périmés), 1 ignoré |
| 15/10 | #182, `8c4aed6` | Vague 2 : arrêt d'urgence, supervision, sécurité, données personnelles, sauvegarde | `20261014200000` à `…233000` (11) | 38658783030 / 38653887523 / 38659131480 | n° 5 : 1 échec (test périmé) |
| 15/10 | #183, `a471512` | Test de recette et wiki | aucune | — | n° 6 (38661886020) : tout réussi |
| 15/10 | #184, `fac0105` | Vague 3 : chaîne d'incident, artisan externe, interface, éditorial (sans D27 ni D32) | `20261014300000` à `…330000` (6) | 38685808300 / 38684510813 / 38686163888 | 38686435654 : réussie |
| 15/10 | #185, `5ff849b` | Vague 4a : points X | `20261014400000` à `…420000` (9) | 38711852253 / 38710304903 / 38712228909 | n° 8 (38712773640) : tout réussi |
| 15/10 | #186, `6b2a130` | Jour de Paris pour les règles de loyer | `20261014500000` à `…504000` (5) | 38718758813 / 38716892903 / 38720172003 | n° 9 (38720668132) : tout réussi |
| 15/10 | #187, `8a168dd` | D18 : devis refusable, puis révisable | `20261014600000` à `…602000` (3) | 38766754561 / 38762699127 / 38767347383 | n° 10 (38767814840) : tout réussi |
| 15/10 | #188, `98f3fd7` | D23-A et D22-B | `20261014610000`, `…620000` | 38774627385 / 38767999868 / 38775207192 | n° 11 (38775647416) : tout réussi |
| 15/10 | #189, `0c9328a` | Suite du jour de Paris | `20261014820000`, `…821000` | 38801999367 / 38793305579 / 38802392366 | n° 12 (38802750219) : tout réussi |
| 15/10 | #190, `f93ec6e` | X16, X18, X19, D24-C | `20261014710000`, `…720000`, `…730000`, `…830000` | 38808894135 / 38803202370 / 38809581425 | n° 13 (38809953785) : tout réussi |
| 15/10 | #191, `d55f87b` | D27-B : adresse `/espace` du propriétaire direct | aucune | — | n° 14 (38818788671) : tout réussi |
| 16/10 | #192, `a722f94` | D46-B, partie alerte : relais du dirigeant par e-mail | `20261014810000`, `…811000`, `…812000` | 38853778608 / 38818526280 / 38854124489 | jouée (38854421819), **non consignée** dans le journal de `main` |
| 16/10 | #193, `bdaf755` | Tests de racine D27-B, repère juridique de la qualification | aucune | — | jouée (38858371065), **non consignée** ; pas d'entrée « deploy » au journal |

Les identifiants des recettes jouées après #192 et #193 viennent du tour final de vérification du 16/10 (chantier « Recette de production avec nettoyage », exécutions réussies) ; leurs entrées de journal existent sur une branche non fusionnée.

**Ce que ces recettes ne couvrent pas** : les contrôles des quatre P1 de la vague 1 ; l'espace artisan et la console de supervision (aucun compte de recette artisan ni super-administrateur) ; les parcours complets de D18, D22-B et D23-A ; une relance d'invitation réelle, la recherche par référence, la limite des appels IA, l'avoir (module désactivé) ; le premier e-mail de 5 h du relais (aucun le 16/10, premier attendu le 17/10 au plus tôt).

## 6. Ce qui attend une décision du dirigeant

Les décisions sont regroupées, avec options, recommandation, coût estimé (non mesuré), risque et retour arrière, dans [[Décisions groupées — version candidate du 13 octobre 2026]] (D01 à D33, Q1 à Q4, R1 à R6) et [[Complément à la page « Décisions groupées » — fiches de la vague 6]] (D34 à D49, Q5, R7 à R10). Trois fonctions majeures sont proposées dans [[Propositions de fonctions majeures — version candidate du 13 octobre 2026]] ; six équipes IA dans [[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]. **Aval enregistré** : le 14/10 (« P1 bloquants, pour le reste faire en fonction des recommandations », puis autorisation de déployer) et le 15/10 (cinq réponses). Restent à demander au 16/10, sans rien trancher à la place du dirigeant : ratification de D42-B (en production sans choix tracé) et des écarts introduits par les lots (relais toutes les 10 minutes hors arrêt d'urgence, exception de D09, invitations en attente non relancées, limite de 50 appels IA) ; D08-C (planifier ou abandonner) ; D36-C ; les questions de l'invitation d'artisan ; la couverture par l'autorisation du 14/10 des décisions du 15/10. Détail : [[Décisions groupées — version candidate du 13 octobre 2026]].

Le premier point est de **figer la version** (Q1) : toute modification de code après le commit contrôlé rend la batterie périmée.

## 7. Ce qui attend le dirigeant, hors code

- Identité de l'éditeur (`src/lib/editeur.ts` est vide) : nécessaire aux mentions légales et à l'adresse de contact des pages légales.
- Durée de validité du code à usage unique dans Supabase (e-mail OTP) : 86 400 secondes aujourd'hui.
- Suppression de deux dossiers de stockage d'organisations purgées.
- Validation des six articles réécrits du journal.
- Validation comptable de la forme de l'avoir (D24-C) avant d'activer le module « clients externes » ; avis spécialisés différés (D02-B, D03-B, D35 (2) B, D38-B, D40-B, D41) ; qualification juridique de la mention d'origine IA (D49 (2)).
- Autorisations d'essai : restauration d'une sauvegarde réelle (D07, D43), politique du vrai stockage (D11), mesure d'un dépôt de 6 Mo (D12).
- Validation spécialisée (fiscale, juridique) des règles de la fiscalité et des textes légaux : **aucune source officielle n'a pu être consultée** depuis l'environnement de l'audit (politique réseau) ; pour qu'une confrontation soit refaite, il faut autoriser service-public.fr, impots.gouv.fr, legifrance.gouv.fr, anil.org, cnil.fr et eur-lex.europa.eu dans les réglages réseau de l'environnement.

## 8. Critères de clôture de la mission (cochés séparément)

Tout critère non rempli interdit une affirmation globale de fin de mission. **Au 16/10/2026 : « mission intégralement terminée » serait faux** (critères encore partiels ou non remplis : audit, rôles, scénarios, corrections, fonctions majeures, design, automatisations, sécurité et restauration, production).

| Critère | État | Justification |
|---|---|---|
| Audit couvert | **partiel** | Les six rôles, la sécurité, les automatismes, le design, la chaîne d'intervention, la sortie de bail, les charges et la fiscalité ont été parcourus sur le banc. Non couverts : lecteur d'écran réel, Safari et Firefox, mode sombre, impression, volumétrie, pg_cron, envoi réel d'e-mails, Stripe, signature, restauration d'une sauvegarde de production, renouvellement de bail (fonction absente), la plupart des variantes de la sortie de bail (invitation expirée, fichiers refusés, rejeu). Voir [[Registre d'exécution — audit du 13 octobre 2026]] § 3. |
| Six rôles testés | **partiel** | Les six rôles (propriétaire, locataire, artisan, super-administrateur, designer, auditeur) ont chacun un rapport, mais ils sont joués par des agents (sessions séparées d'un même modèle), pas par de vrais utilisateurs. Le locataire n'a pas de passe dédiée complète : il est couvert par la chaîne d'intervention, la sortie de bail et les vérifications d'isolation. |
| Scénarios inter-rôles réussis | **partiel** | Chaîne locataire → propriétaire → artisan → facture → trace : 18 scénarios réussis, 6 partiels, 1 en échec sur la première passe ; la chaîne a révélé des manques de fonction (devis refusable, règlement de facture, report de rendez-vous : propositions D18, D22, D23) qui empêchent un scénario « refus puis révision » complet. Sortie de bail : jouée, un P2 (SOR-03) et cinq P3. |
| Corrections sûres confirmées | **partiel** | Chaque correction a un test vu rouge puis vert ; sur le SHA figé `0ad658a` : 4 207 tests unitaires, 168 parcours navigateur (0 échec), audits des écrans à 768 et 1440 px, CI GitHub réussie (n° 637). Les effets d'interface et de saisie ont été revérifiés en navigateur sur la construction finale (deux vagues de vérification : 0 P1, 0 P2 non traité) ; trois écarts P3 résiduels sont consignés (V10-01 à 03). Plusieurs corrections ne sont que partielles et restent « à trancher » (VER-TS-02, VER-SECURITE-01, DES-A-07…). Les corrections dont la fiche demandait l'aval (R1 à R10) ne sont pas ratifiées : c'est pourquoi ce critère est « partiel ». |
| Fonctions majeures approuvées réalisées | **partiel** | D18, D22-B et D23-A approuvés le 14/10 et en production le 15/10 (PR #187, #188) ; manques déclarés : alerte au propriétaire et PDF par version (D18), relance de l'artisan, « J'en prends acte » et badge d'agenda (D22-B) ; parcours complets dans un navigateur non joués, la recette ne les exerce pas (journal, recettes n° 10 et n° 11). Invitation d'un artisan par un propriétaire (15/10) : en cours, non livrée. |
| Design vérifié | **partiel** | Passes automatiques (axe-core, mesures) à 390, 768 et 1280 px sur les écrans de tous les profils, regard sur les écrans clés, défauts P2 de design corrigés puis revérifiés en navigateur sur la construction finale (291 captures « après »). Non couvert : lecteur d'écran réel, appareils réels, Safari et Firefox, mode sombre, impression, écrans demandant des données absentes du banc ; logo dans la tuile (D28-A), adresse `/espace` du propriétaire direct (D27-B) et repli hors ligne (D26-B) livrés ; vérification visuelle sur appareils réels non faite ; D45-B (fichiers allégés) attend une comparaison visuelle. |
| Automatisations installées et testées | **non rempli** | Aucune équipe IA n'est installée. Socle installé depuis : arrêt d'urgence étendu à neuf des dix tâches pg_cron (D06-A), limite des appels IA (X19), relances d'invitation (X16), relais du dirigeant par e-mail (D46-B, 16/10). Au 16/10 : 13 entrées Vercel et 10 tâches pg_cron (11 et 8 au 14/10). Non constatés en production : une relance réelle, un premier e-mail de 5 h, un appel IA compté. |
| Sécurité et restauration vérifiées | **partiel** | Isolation : 631 requêtes croisées entre profils refusées, 0 fuite, 0 P0 et 0 P1 ; retour arrière des deux migrations essayé (état revenu identique, 13 catalogues). Depuis la vague 2 : tâches pg_cron exportées par la sauvegarde (D07-A) et couvertes par l'arrêt d'urgence, neuf sur dix (`relais-urgences` exclue à dessein). Non rempli : aucune restauration d'une sauvegarde de production (essai D07/D43 à autoriser), `--no-comments` toujours en place, politique du vrai stockage non essayée (D11). |
| Version autorisée déployée | **rempli** | Autorisation explicite du dirigeant le 14/10/2026 ; version `0ad658a` (code) fusionnée en `c99e2c6`, déployée sur Vercel (`READY`), migrations `20261013110000` et `20261013120000` appliquées après sauvegarde (§ 5 bis). Portée : uniquement ce que l'autorisation nomme. Depuis, PR #181 à #193 déployées entre le 14 et le 16/10 (§ 5 quater) ; la couverture des décisions du 15/10 par l'autorisation du 14/10 n'est pas écrite au journal. |
| Production vérifiée | **partiel** | Contrôles non destructifs faits après déploiement : 0 erreur d'exécution, pages publiques, migrations enregistrées, tâches `pg_cron`, alertes Supabase (§ 5 bis). Non fait : aucun parcours connecté ni écriture en production, la préparation du soir n'a tourné qu'une fois, provoquée le 14/10 par un changement de réglages (voir « Passage forcé »), pas encore en fonctionnement normal, alertes de sécurité non comparées à un relevé antérieur. Les corrections financières n'ont pas été éprouvées sur des données réelles (aucune écriture comptable en production). Au 16/10 : recettes de production à comptes éphémères réussies après chaque fusion (§ 5 quater), mais contrôles en production des quatre P1 non joués. |

## 9. Écarts de livrable relevés par la critique de complétude

Une relecture indépendante (agent « critique de complétude ») a confronté le dossier au texte de la mission et listé 19 écarts. État :

| N° | Écart | État | Suite |
|---|---|---|---|
| 01 | Observations de production sans pièce, production presque vide non dite | fait | Relevé du 14/10 archivé ; le § 4 dit que la production ne contient ni écriture comptable ni encaissement. |
| 02 | Version à autoriser non figée, tests refaits | fait | SHA figé et batterie complète rejouée (voir § 3). |
| 03 | Dossier de validation périmé | fait | Dossier régénéré (cette page). |
| 04 | Registre des anomalies incomplet (55 anomalies absentes, fiches incomplètes) | fait | 236 anomalies, fiche complète pour chacune. |
| 05 | Registre d'exécution hors format | fait | Douze colonnes de la mission, vocabulaire de la mission, annexe des scénarios. |
| 06 | Preuves seulement dans le dossier temporaire de la session | partiel | Archive textuelle expurgée et scannée (voir § 10) ; les captures complètes restent dans le dossier de la session. |
| 07 | Cartographie, matrice globale, inventaire de couverture absents | fait | Quatre pages publiées (cartographie, matrice fonctions × rôles × droits, inventaire de couverture, référence des tests), générées par scripts rejouables. Couverture : 157 écrans sur 157 ouverts par la passe automatique, 88 à 99 exercés ; 43 actions serveur sur 259 sans aucune trace dans les tests. |
| 08 | Sortie de bail, renouvellement, accès après départ jamais testés | partiel | Sortie de bail jouée ; le renouvellement n'existe pas dans la V1 ; variantes non jouées (invitation expirée, fichiers refusés, rejeu). |
| 09 | Aucun PDF généré sur le banc | partiel | Moteur PDF branché : devis (3), quittances et décompte de restitution, 8 PDF du jeu de référence ; bail, notice et états des lieux non relus. |
| 10 | Charges, fiscalité non exercées ni confrontées aux sources officielles | partiel | Jeu de référence calculé à part : 74 montants sur 77 égaux au centime (3 écarts = variante FIN-07) ; confrontation aux textes officiels impossible (accès réseau bloqué), toutes les règles portent « source officielle non consultée ». |
| 11 | Équipes IA non proposées | fait | Six équipes proposées (rien d'installé) : [[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]. |
| 12 | Zéro aval enregistré, propositions de fonctions absentes | fait | Pages de décisions (D01 à D49) et de trois fonctions ; l'aval lui-même reste à donner. |
| 13 | Dossier sécurité et restauration, retour arrière non essayés | partiel | Retour arrière essayé ; restauration de production non essayée (hors de portée). |
| 14 | Deux risques de « montant faux » sans condition de décision | fait | VER-TS-02 corrigé pour 17 champs ; PR178-B-06 et le seuil de confirmation restent à décider (Q3, D04, D05). |
| 15 | Variantes et jeu de données de la mission non satisfaits | partiel | Variantes jouées : doublons, concurrence, reprise, refus d'accès. Non jouées : invitation expirée, échec fournisseur, document absent. Pas de script de graine commun. |
| 16 | Performances et liens jamais mesurés | fait | 507 chargements mesurés, 733 liens internes explorés : [[Performances et liens — mesures du 14 octobre 2026]]. |
| 17 | Secret du banc dans une pièce de preuve | fait | L'archive est expurgée et scannée (0 motif restant). Le fichier d'origine, dans le dossier de travail non versionné, contient la clé de service jetable de l'émulateur. |
| 18 | Captures « après » et test clavier non refaits | fait | 291 captures « après » (97 écrans × 3 largeurs, 5 profils) et test clavier sur 24 écrans (aucun arrêt entièrement masqué) ; 2 vérifications supplémentaires en navigateur sur la construction finale. |
| 19 | Question d'autorisation inexacte sur l'activation marketing | fait | La question nomme l'effet réel de la migration 20261013110000 (voir § 5). |

## 10. Preuves

Les preuves sont dans le dossier de travail de la session (`preuves/…`, plusieurs centaines de Mo de captures) et dans une **archive textuelle expurgée** (rapports, journaux, SQL, scripts, tableaux, documents d'exemple) : les clés, jetons et le mot de passe de démonstration y sont remplacés, un scan automatique ne trouve plus aucun motif de secret, et `SHA256SUMS.txt` donne l'empreinte de chaque fichier. **Les captures complètes ne sont pas dans l'archive** ; si la session est recyclée, elles disparaissent avec elle.

> [!warning] Ce que ce dossier ne couvre pas
> Les rôles ont été joués par des agents (sessions séparées d'un même modèle) sur un banc local, sans service externe : ni envoi réel d'e-mails, ni paiement, ni signature, ni `pg_cron`, ni sauvegarde de production restaurée. Ils ne remplacent ni un test utilisateur ni une recette par le dirigeant. Plusieurs agents ont été interrompus par la limite de session ou un redémarrage du conteneur puis repris ; le registre d'exécution dit ce qui a réellement été joué.

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]], [[Registre d'exécution — audit du 13 octobre 2026]], [[Audit d'acquisition du 3 octobre 2026]].
