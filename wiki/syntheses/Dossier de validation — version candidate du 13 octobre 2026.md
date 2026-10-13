---
type: synthesis
tags: [audit, livraison, validation, v1, migrations, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-13
sources: []
---

# Dossier de validation — version candidate du 13 octobre 2026

Ce dossier dit **ce que contient la livraison**, **ce qui a été vérifié**, **ce qui reste à décider** et **ce qui ne part
en production qu'avec une autorisation explicite**. Rien n'est déployé à ce jour : la branche
`claude/compassionate-euler-qpqjp6` n'est ni fusionnée, ni déployée, et aucune migration n'a été appliquée en production.
Il complète le [[Registre des anomalies — audit du 13 octobre 2026]] et le [[Registre d'exécution — audit du 13 octobre 2026]].

## 1. Ce que contient la livraison

| Lot | Anomalies | Nature | Migration |
|---|---|---|---|
| Agences retirées du site public de la V1 (code et composants conservés, espace `/agence` inchangé) | PUB-01, PUB-02, PROP-06 | pages publiques, formulaire de contact général, pages légales | non |
| Préparation du soir du marketing | MKT-01 | le déclencheur `pg_cron` n'a jamais pu appeler la préparation (`auth.role()` vide hors requête) | `20261013110000` |
| Récapitulatif fiscal « location nue » | FIN-01 (P1) | le document imprimait des zéros | non |
| Courriers : valeurs saisies échappées | AUD-B-01 | quatre courriers | non |
| Inscription : longueur des champs | AUD-B-02 | un nom de 24 000 caractères rendait le compte inutilisable (erreur 431) | non |
| Fiches : code postal, année, naissance, téléphone, surface | PROP-02, PROP-04, PROP-07 | contrôles côté serveur | non |
| Encaissements : centime, date | PROP-12, PROP-13, AUD-C-01 (saisie) | contrôles côté serveur | non |
| Portefeuille, traces, arrêt d'urgence, reprise des créneaux | AUD-A-01 à A-04, SUP-02, SUP-08, REP-01 | sept fonctions SQL modifiées, une valeur de plus au fil des incidents | `20261013120000` |

## 2. Migrations à appliquer en production

État de la production relevé en lecture seule le 13/10/2026 (liste des migrations du projet) : la dernière migration
appliquée est `20261013107000_invitation_statut_et_perimetre`. Ni `20261013110000` ni `20261013120000` n'y figurent.

1. `20261013110000_marketing_preparation_du_soir_cron.sql` — crée une fonction interne sans garde, fermée à tous les
   rôles, et une enveloppe qui garde la garde `service_role` ; `preparation_marketing_due()` lit la version interne.
   Aucun droit élargi. Premier effet réel attendu : jeudi 15/10, 18 h (Paris), préparation de la publication du vendredi 16/10.
2. `20261013120000_correctifs_audit_13_octobre.sql` — modifie sept fonctions **en relisant leur définition en vigueur**
   (`pg_get_functiondef`) et en y ajoutant un morceau ; si la définition en vigueur n'est pas celle attendue, la migration
   s'arrête et ne change rien. Elle ajoute aussi `mission_annulee` à la liste des types d'événement d'incident.
   Aucune ligne existante n'est touchée.

Procédure : sauvegarde (« Sauvegarde quotidienne » déclenchée à la main), puis `migrations.yml` en **simulation** avec
les deux fichiers dans cet ordre, puis application réelle, puis contrôles non destructifs (§ 3). Retour arrière : les
deux migrations ne modifient aucune donnée ; un retour revient à recréer les anciennes définitions de fonctions (les
définitions antérieures sont dans les migrations d'origine ; les fonctions modifiées sont énumérées en tête du fichier).

## 2 bis. Contrôles de la version candidate

La version candidate est la tête de la branche après fusion de `main` (PR #178, protection et reprise des formulaires,
fusionnée après le commit audité sans conflit textuel). Contrôles passés sur le banc local, base remise dans son état
d'avant les parcours à la fin :

| Contrôle | Résultat |
|---|---|
| Lint, build de production, types | réussis |
| Tests unitaires et de base (vitest) | 3 460 réussis, 14 ignorés (référence e9f31ac : 3 333 réussis, 14 ignorés) |
| Parcours navigateur (Playwright) | 163 réussis, 1 ignoré (référence : 147 réussis) |
| Audit des écrans à 768 px et à 1440 px | réussi pour tous les profils |
| Tests ajoutés par la branche | rouges avant la correction, verts après (courriers, inscription, fiches, encaissements, huit tests SQL) |

Un échec d'outillage est apparu en chemin et a été corrigé : la matrice d'écrans prenait pour « parc du propriétaire »
une organisation de test laissée par d'autres essais, d'où une redirection et une ressource 404 à l'audit des écrans
(aucun défaut du produit).

## 3. Observation de la production (lecture seule, 13/10/2026)

| Contrôle | Résultat |
|---|---|
| Encaissements avec un montant au-delà du centime | 0 |
| Encaissements datés du futur | 0 |
| Écritures avec un montant au-delà du centime | 0 |
| Comptes dont les métadonnées dépassent 4 000 caractères (maximum : 341) | 0 |
| Biens dont le code postal n'a pas cinq chiffres | 0 |
| Biens construits avant 1600 | 0 |
| Personnes nées dans le futur | 0 |
| Alertes d'arbitrage de créneaux (REP-01) | 0 |
| Arrêts d'urgence actifs, diagnostics artisan ouverts | 0, 0 |
| Tâches `pg_cron` actives | 8 ; `marketing-declencheur` : 540 exécutions réussies en trois jours, dernière à 19 h 55 UTC |
| Publications | 1 proposition, 8 publiées, 2 refusées |

Aucune donnée de production n'a donc été abîmée par les anomalies relevées, et rien ne bloque l'application des deux migrations.

## 4. Porte de validation

| Critère de la mission | État |
|---|---|
| Aucune anomalie P0 ouverte | respecté : aucune P0 relevée |
| Aucune anomalie P1 ouverte dans la version à livrer | respecté : la seule P1 (FIN-01) est corrigée en branche, avec test rouge puis vert |
| Sauvegarde avant migration | à faire : déclenchement de « Sauvegarde quotidienne » juste avant l'application |
| Simulation des migrations | **faite le 13/10 à 21 h 43 UTC** : `migrations.yml` (exécution n° 70) a joué les deux fichiers dans l'ordre contre la production, puis tout annulé (« SIMULATION : tout a été joué puis annulé »). Les sept blocs de `20261013120000` ont retrouvé leurs ancres dans les définitions de production, donc ces fonctions y sont bien celles que le test a vues sur le banc |
| Contrôles en production non destructifs | faits pour l'état courant (§ 3) ; à refaire après application |
| Autorisation explicite du dirigeant | **en attente** |

La question à poser, dans les termes de la mission : « Autorises-tu le déploiement de la branche
`claude/compassionate-euler-qpqjp6` sur la production, avec les migrations `20261013110000` et `20261013120000` et aucune
activation de fonctionnalité ? ». Tant que la réponse n'est pas donnée, l'état est : **version prête pour validation,
production non déployée**.

## 5. Ce qui attend une décision du dirigeant

- **PROP-14** : le premier terme calculé au prorata est exigible avant l'entrée du locataire (règle de date d'échéance).
- **FIN-11** : aucun loyer existant n'est rétro-capturé, la déclaration 2044 repart de zéro tant que chaque pièce n'est pas qualifiée.
- **FIN-07** : le mot-clé « fonds travaux » prime sur une qualification justifiée.
- **SUP-01** : l'arrêt d'urgence ne couvre pas les huit tâches SQL planifiées (rétention, cycle mensuel, alertes, marketing).
- **SUP-05** : les faits de direction copient des données personnelles de toutes les organisations.
- **SUP-03 / SUP-04** : accusé de réception d'une alerte adressée à un autre responsable ; auto-approbation d'une consigne.
- **PRO2-01** : un propriétaire dont la commune n'est pas ouverte au réseau ne peut solliciter aucun artisan.
- **SA-01** : l'entrée dans un espace client reste sans motif ni durée (limite déjà actée au wiki).
- **PUB-03** : les textes juridiques sont encore rédigés au régime « agence ».
- **EDI-01** : la ligne éditoriale de la veille.
- **AUD-C-02** : les tâches `pg_cron` ne sont ni sauvegardées ni décrites dans la restauration.

## 6. Ce qui attend le dirigeant, hors code

- Identité de l'éditeur (`src/lib/editeur.ts` est vide) : nécessaire aux mentions légales et à l'adresse de contact des pages légales.
- Durée de validité du code à usage unique dans Supabase (e-mail OTP) : 86 400 secondes.
- Suppression de deux dossiers de stockage d'organisations purgées.
- Validation des six articles réécrits du journal.

> [!warning] Ce que ce dossier ne couvre pas
> Les rôles ont été joués par des agents sur un banc local, sans service externe : ni envoi réel d'e-mails, ni paiement,
> ni signature, ni `pg_cron`. Les vagues d'audit sur les rôles locataire, artisan et super-administrateur sont
> partielles (voir le registre d'exécution) ; la relecture adverse de la PR #178 (formulaires), fusionnée après le
> commit audité, n'est pas faite.

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]], [[Registre d'exécution — audit du 13 octobre 2026]].
