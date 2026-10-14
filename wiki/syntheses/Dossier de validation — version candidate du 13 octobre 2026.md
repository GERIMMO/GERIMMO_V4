---
type: synthesis
tags: [audit, livraison, validation, v1, migrations, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-14
sources: []
---

# Dossier de validation — version candidate du 13 octobre 2026

Ce dossier dit **ce que contient la livraison**, **ce qui a été vérifié**, **ce qui reste à décider** et **ce qui ne part en production qu'avec une
autorisation explicite**. Rien n'est déployé à ce jour : la branche `claude/compassionate-euler-qpqjp6` n'est ni fusionnée ni déployée, et aucune migration n'a été
appliquée en production. État : **version prête pour validation, production non déployée** — pas « mission terminée » (voir § 8).

Version contrôlée : commit `b9a7107` (batterie complète du 14/10/2026). Tête de la branche au moment de la génération : `7d57f2f`.
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

Bilan du registre : **233 anomalies** (P0 : 0 ; P1 : 1 ; P2 : 69 ; P3 : 163) ; **99 corrigées en branche**, **100 à trancher**, 32 ouvertes, 2 réfutées/acceptées.

## 2. Migrations à appliquer en production

État de la production relevé en lecture seule le 14/10/2026 : la dernière migration appliquée est `20261013107000`. Ni `20261013110000` ni `20261013120000` n'y figurent.

1. `20261013110000_marketing_preparation_du_soir_cron.sql` — crée une fonction interne sans garde, fermée à tous les rôles, et une enveloppe qui garde la garde `service_role` ; `preparation_marketing_due()` lit la version interne. **Effet réel : à partir du premier passage de la tâche après application (jeudi 15/10, 18 h Paris, si l'accord arrive avant), la préparation de la publication du lendemain redevient possible depuis `pg_cron`** (automatisme déjà approuvé avec sa fenêtre de veto, mais jamais exécuté jusqu'ici).
2. `20261013120000_correctifs_audit_13_octobre.sql` — modifie **neuf** fonctions en relisant leur définition en vigueur (`pg_get_functiondef`), chacune avec une marque de rejeu ; si la définition n'est pas celle attendue, la migration s'arrête et ne change rien. Elle ajoute `mission_annulee` à la liste des types d'événement d'incident. Aucune ligne existante n'est touchée.

**Simulation** : exécution n° 71 de `migrations.yml` (14/10, 02 h 52 UTC, tête `2235d73`) : les deux fichiers joués dans l'ordre contre la production, puis `ROLLBACK`. Les fichiers de migration n'ont **pas changé depuis** cette exécution.
**Retour arrière** : `app/supabase/retours-arriere/` (un script par migration, essayé A → B → C sur base jetable : catalogues identiques) ; voir [[Dossier sécurité et restauration — retour arrière des migrations du 13 octobre 2026]]. Il réintroduit les défauts corrigés et ne défait pas les lignes `mission_annulee` déjà écrites.
**Procédure** : sauvegarde (« Sauvegarde quotidienne » déclenchée à la main), `migrations.yml` en simulation, application réelle, contrôles non destructifs. Aucune de ces étapes n'est faite sans votre autorisation.

## 3. Contrôles de la version candidate

| Contrôle | Résultat sur `b9a7107` |
|---|---|
| Lint, build de production, types | réussi, réussi, réussi |
| Tests unitaires et de base (vitest) | 365 passed, 1 skipped (366) ; 3889 passed, 14 skipped (3903) (référence `e9f31ac` : 3 333 réussis, 14 ignorés) |
| Parcours navigateur (Playwright) | 1 failed, 1 flaky, 1 skipped, 161 passed — voir la note ci-dessous |
| Matrice des écrans | réussi |
| Audit des écrans à 768 px et à 1440 px (tous profils) | réussi, réussi |
| Simulation des migrations contre la production | réussie (n° 71, tout annulé) |
| CI GitHub Actions (Postgres 18) | réussie le 13/10 sur `8b558c8` ; **non rejouée sur la tête** (à relancer avant l'autorisation) |
| Vérification en navigateur des corrections d'interface (construction finale) | 12 cas réussis, 2 partiels, 6 constats P3, 0 P1/P2 ; 291 captures « après » ; voir [[Registre d'exécution — scénarios, audit du 13 octobre 2026]] |
| Vérification en navigateur de la saisie et de la protection (construction finale) | 46 formulaires examinés, 0 écart au classement ; 2 P2 relevés puis corrigés ou décidés (VFL-03, VFL-07) |

Note sur les parcours : sur `b9a7107`, un parcours (« fiche personne et justificatif », 1440 px) est en échec et un autre instable. Le test attendait un statut « conservé » périmé avant de fermer l'onglet ; il attend maintenant une nouvelle révision réellement écrite (commit `9396669`) et a passé 3 fois de suite seul (5 tests sur 5). **La suite complète n'a pas été rejouée sur ce commit.**

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
| Aucune anomalie P1 ouverte dans la version à livrer | respecté : la seule P1 (FIN-01) est corrigée en branche, test rouge puis vert, oracle SQL ; **elle demandait l'aval du dirigeant (R1)** |
| Risques « montant faux » classés P2 | à confirmer par vous : Q3 (VER-TS-02 résiduel, PR178-B-06) et Q5 (CHF-01, CHF-02) — si vous les jugez bloquants, ils passent P1 |
| Sauvegarde avant migration | à faire juste avant l'application |
| Simulation des migrations | faite sur la version finale (n° 71) |
| Contrôles en production non destructifs | faits pour l'état courant (§ 4) ; à refaire après application |
| Autorisation explicite du dirigeant | **en attente** |

Question à vous poser, dans les termes de la mission, **quand vous aurez tranché Q1 à Q5 et répondu à R1 à R10** : « Autorises-tu le déploiement de la branche `claude/compassionate-euler-qpqjp6` au commit `<SHA à figer>` sur la production (fusion, déploiement Vercel), avec les migrations `20261013110000` et `20261013120000` appliquées dans cet ordre après sauvegarde, **et l'activation de fait de la préparation du soir du marketing par `pg_cron` (premier passage jeudi 15/10 à 18 h Paris si l'accord arrive avant ; sinon à la date suivante)**, avec les corrections R1 à R10 que tu auras ratifiées ? ». Tant que la réponse n'est pas donnée : **version prête pour validation, production non déployée**.

## 6. Ce qui attend une décision du dirigeant

Les décisions sont regroupées, avec options, recommandation, coût estimé (non mesuré), risque et retour arrière, dans [[Décisions groupées — version candidate du 13 octobre 2026]] (D01 à D33, Q1 à Q4, R1 à R6) et [[Complément à la page « Décisions groupées » — fiches de la vague 6]] (D34 à D49, Q5, R7 à R10). Trois fonctions majeures sont proposées dans [[Propositions de fonctions majeures — version candidate du 13 octobre 2026]] ; six équipes IA dans [[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]. **Aucune décision n'est présumée acceptée ; zéro aval enregistré à ce jour.**

Le premier point est de **figer la version** (Q1) : toute modification de code après le commit contrôlé rend la batterie périmée.

## 7. Ce qui attend le dirigeant, hors code

- Identité de l'éditeur (`src/lib/editeur.ts` est vide) : nécessaire aux mentions légales et à l'adresse de contact des pages légales.
- Durée de validité du code à usage unique dans Supabase (e-mail OTP) : 86 400 secondes aujourd'hui.
- Suppression de deux dossiers de stockage d'organisations purgées.
- Validation des six articles réécrits du journal.
- Validation spécialisée (fiscale, juridique) des règles de la fiscalité et des textes légaux : **aucune source officielle n'a pu être consultée** depuis l'environnement de l'audit (politique réseau) ; pour qu'une confrontation soit refaite, il faut autoriser service-public.fr, impots.gouv.fr, legifrance.gouv.fr, anil.org, cnil.fr et eur-lex.europa.eu dans les réglages réseau de l'environnement.

## 8. Critères de clôture de la mission (cochés séparément)

Tout critère non rempli interdit une affirmation globale de fin de mission. **Aujourd'hui : « mission intégralement terminée » serait faux.**

| Critère | État | Justification |
|---|---|---|
| Audit couvert | **partiel** | Les six rôles, la sécurité, les automatismes, le design, la chaîne d'intervention, la sortie de bail, les charges et la fiscalité ont été parcourus sur le banc. Non couverts : lecteur d'écran réel, Safari et Firefox, mode sombre, impression, volumétrie, pg_cron, envoi réel d'e-mails, Stripe, signature, restauration d'une sauvegarde de production, renouvellement de bail (fonction absente), la plupart des variantes de la sortie de bail (invitation expirée, fichiers refusés, rejeu). Voir [[Registre d'exécution — audit du 13 octobre 2026]] § 3. |
| Six rôles testés | **partiel** | Les six rôles (propriétaire, locataire, artisan, super-administrateur, designer, auditeur) ont chacun un rapport, mais ils sont joués par des agents (sessions séparées d'un même modèle), pas par de vrais utilisateurs. Le locataire n'a pas de passe dédiée complète : il est couvert par la chaîne d'intervention, la sortie de bail et les vérifications d'isolation. |
| Scénarios inter-rôles réussis | **partiel** | Chaîne locataire → propriétaire → artisan → facture → trace : 18 scénarios réussis, 6 partiels, 1 en échec sur la première passe ; la chaîne a révélé des manques de fonction (devis refusable, règlement de facture, report de rendez-vous : propositions D18, D22, D23) qui empêchent un scénario « refus puis révision » complet. Sortie de bail : jouée, un P2 (SOR-03) et cinq P3. |
| Corrections sûres confirmées | **partiel** | Chaque correction a un test vu rouge puis vert ; 3 889 tests passent sur la tête contrôlée et 161 parcours sur 163. Les effets d'interface sont revérifiés en navigateur sur la construction finale (vague 8, voir § 3). Plusieurs corrections ne sont que partielles et restent « à trancher » (VER-TS-02, VER-SECURITE-01, DES-A-07…). Les corrections dont la fiche demandait l'aval (R1 à R10) ne sont pas ratifiées. |
| Fonctions majeures approuvées réalisées | **non rempli** | Aucune fonction majeure n'a été approuvée par le dirigeant : zéro aval enregistré. Trois propositions concrètes sont rédigées (devis révisable et refusable, règlement de la facture, report de rendez-vous) ; rien n'est implémenté. |
| Design vérifié | **partiel** | Passes automatiques (axe-core, mesures) à 390, 768 et 1280 px sur les écrans de tous les profils, regard sur les écrans clés, 21 défauts P2 de design corrigés puis revérifiés en navigateur. Non couvert : lecteur d'écran réel, appareils réels, écrans demandant des données absentes du banc. |
| Automatisations installées et testées | **non rempli** | Aucune équipe IA n'est installée : les propositions des six équipes sont rédigées pour aval. Les tâches planifiées existantes (11 Vercel, 8 pg_cron) n'ont pas pu être exécutées sur le banc ; elles sont observées en production en lecture seule (aucun échec sur trois jours). |
| Sécurité et restauration vérifiées | **partiel** | Isolation : 631 requêtes croisées entre profils refusées, 0 fuite, 0 P0 et 0 P1 ; retour arrière des deux migrations essayé (état revenu identique, 13 catalogues). Non rempli : aucune restauration d'une sauvegarde de production, pg_cron absent des sauvegardes (AUD-C-02), arrêt d'urgence incomplet (SUP-01). |
| Version autorisée déployée | **non rempli** | Aucune autorisation reçue : rien n'est déployé, aucune migration n'est appliquée en production. |
| Production vérifiée | **non rempli** | Seules des lectures SELECT ont été faites (14/10) ; la production ne contient aucune écriture comptable, donc les corrections financières n'ont pas été éprouvées sur des données réelles. Aucune vérification après déploiement n'est possible avant le déploiement. |

## 9. Écarts de livrable relevés par la critique de complétude

Une relecture indépendante (agent « critique de complétude ») a confronté le dossier au texte de la mission et listé 19 écarts. État :

| N° | Écart | État | Suite |
|---|---|---|---|
| 01 | Observations de production sans pièce, production presque vide non dite | fait | Relevé du 14/10 archivé ; le § 4 dit que la production ne contient ni écriture comptable ni encaissement. |
| 02 | Version à autoriser non figée, tests refaits | fait | SHA figé et batterie complète rejouée (voir § 3). |
| 03 | Dossier de validation périmé | fait | Dossier régénéré (cette page). |
| 04 | Registre des anomalies incomplet (55 anomalies absentes, fiches incomplètes) | fait | 209 anomalies, fiche complète pour chacune. |
| 05 | Registre d'exécution hors format | fait | Douze colonnes de la mission, vocabulaire de la mission, annexe des scénarios. |
| 06 | Preuves seulement dans le dossier temporaire de la session | partiel | Archive textuelle expurgée et scannée (voir § 10) ; les captures complètes restent dans le dossier de la session. |
| 07 | Cartographie, matrice globale, inventaire de couverture absents | VAGUE9 | VAGUE9 |
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
| 18 | Captures « après » et test clavier non refaits | VAGUE8 | VAGUE8 |
| 19 | Question d'autorisation inexacte sur l'activation marketing | fait | La question nomme l'effet réel de la migration 20261013110000 (voir § 5). |

## 10. Preuves

Les preuves sont dans le dossier de travail de la session (`preuves/…`, plusieurs centaines de Mo de captures) et dans une **archive textuelle expurgée** (rapports, journaux, SQL, scripts, tableaux, documents d'exemple) : les clés, jetons et le mot de passe de démonstration y sont remplacés, un scan automatique ne trouve plus aucun motif de secret, et `SHA256SUMS.txt` donne l'empreinte de chaque fichier. **Les captures complètes ne sont pas dans l'archive** ; si la session est recyclée, elles disparaissent avec elle.

> [!warning] Ce que ce dossier ne couvre pas
> Les rôles ont été joués par des agents (sessions séparées d'un même modèle) sur un banc local, sans service externe : ni envoi réel d'e-mails, ni paiement, ni signature, ni `pg_cron`, ni sauvegarde de production restaurée. Ils ne remplacent ni un test utilisateur ni une recette par le dirigeant. Plusieurs agents ont été interrompus par la limite de session ou un redémarrage du conteneur puis repris ; le registre d'exécution dit ce qui a réellement été joué.

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]], [[Registre d'exécution — audit du 13 octobre 2026]], [[Audit d'acquisition du 3 octobre 2026]].
