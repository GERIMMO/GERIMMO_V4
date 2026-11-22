---
type: synthesis
tags: [audit, palier-1, conformite, securite, ia, plan-de-correction]
status: in-progress
created: 2026-11-22
updated: 2026-11-22
sources: []
---

# Mission palier 1 — audit du 22 novembre 2026

**En une phrase :** à la demande du dirigeant, Gerimmo est audité puis corrigé en autonomie pour le palier 1
([[Propriétaire bailleur]], [[Locataire]], [[Artisan]], incidents, gestion administrative, [[Super Admin]]) ; la
production est gelée jusqu'à sa validation écrite ; l'audit complet est dans `AUDIT.md`, à la racine du dépôt.

## Où lire quoi

| Fichier (racine du dépôt) | Contenu |
|---|---|
| `AUDIT.md` | État de chaque module, conformité légale, écart avec les plateformes de référence, dépendance à l'IA, plan fermé P0 / P1 / P2 |
| `QUESTIONS.md` | Les choix qui appartiennent au dirigeant, avec l'option prudente prise en attendant |
| `JURISTE.md` | Les questions fermées à poser à un juriste ou à un expert-comptable ; aucun de ces points n'est présenté comme conforme |
| `JOURNAL.md` | Cinq lignes par lot de travail |
| `audit-palier-1/` | Huit relevés détaillés (fichiers, lignes, requêtes, sources) et les avis de sécurité de la production |

## Ce que l'audit établit (première version, 22/11/2026)

- **Version auditée** : `e1e442dc`, contrôle automatique complet vert. Rien n'a été modifié pendant l'audit.
- **Aucun module n'est une simple maquette** ; aucune fonction appelée par un écran n'est absente de la base.
- **Sécurité** : cloisonnement actif sur les 227 tables, prouvé par requête ; aucun défaut grave
  ([[Isolation multi-organisation]], [[Socle de sécurité]]). Restent : antivirus non relié, reprise d'activité non
  prouvée de bout en bout ([[Plan de reprise d'activité]]), 16 règles de conservation inactives sur 58
  ([[Durées de conservation]]).
- **Un risque d'argent compté deux fois** entre la [[Régularisation des charges]] et la
  [[Restitution du dépôt de garantie]], à confirmer en exécution.
- **IA** : un seul fournisseur ; le cœur du métier n'appelle jamais l'IA ; la déclaration d'incident est déjà un
  formulaire et le créneau se choisit déjà à la main ([[Cycle de vie d'un incident]],
  [[Planification d'intervention]]). Aucun réglage ne coupe aujourd'hui l'IA proprement : un interrupteur super admin
  est au plan.
- **Envois suspendus** : avis d'échéance, relances, rappels de rendez-vous sont codés mais fermés par la liste fermée
  du pilote ([[Quittancement des loyers]], [[Relances et mise en demeure]]).

> [!warning] Points à trancher / contradictions
> - **Les textes officiels n'ont pas été ouverts** : le réseau de l'environnement de travail refuse Légifrance,
>   service-public, l'ANIL, la CNIL et l'INSEE. Tout le volet juridique repose sur des extraits de recherche du
>   22/11/2026 ; **aucun point n'est noté conforme**. Les écarts relevés ([[Bail]], [[État des lieux]],
>   [[Mentions obligatoires du bail]], [[Vétusté et décote]], [[RGPD]]) sont « à confirmer à la source ».
> - **Deux textes signalés par les extraits et absents du wiki** : un décret n° 2026-596 du 6 juillet 2026 (contrat
>   type applicable aux baux conclus à partir du 1er octobre 2026) et un arrêté du 9 octobre 2026 sur la notice
>   d'information. Aucune source déposée dans `raw/` ne les porte : à lire avant toute affirmation.
> - **« Référentiel du palier 1 »** : aucun document de ce nom ; le cahier Gerimmo V3 (`raw/assets/`) et les décisions
>   du wiki en tiennent lieu, dans le périmètre donné par le dirigeant.
> - Les pages [[Planification d'intervention]] et [[Intervention et clôture]] sont en retard sur le code.

## Phase 2 — corrections en autonomie (état au 22/11/2026, lot 16)

Le détail, lot par lot (ce qui est fait, vérifié, non vérifié, retour arrière), est dans `JOURNAL.md` à la racine.
Chaque lot est vérifié sur une base d'essai remise à neuf (migrations rejouées, tests, parcours navigateur) avant
d'être poussé sur la branche de préproduction ; rien n'est publié en production.

| Lot | Point du plan | Ce qui change pour l'utilisateur |
|---|---|---|
| 1 | P0-02 | Un complément de charges réglé par échéancier n'est plus compté impayé au décompte de sortie ([[Régularisation des charges]], [[Dépôt de garantie]]) |
| 2 | Interrupteur IA | Le [[Super Admin]] coupe toute l'IA d'un réglage ; chaque fonction garde son équivalent manuel |
| 3 | P0-10 | Les envois à OpenAI sont déclarés (confidentialité, liste des prestataires) — voir [[RGPD]] |
| 4 | P1-17, P1-19 | Route planifiée refusée sans jeton avant toute lecture ; « Les règles à connaître » liée depuis l'aide |
| 5 | P1-01 | Signature électronique d'un [[Bail]] avec garant : le lien de confirmation part au garant |
| 6 | P1-04 | Le bailleur corrige l'urgence d'un incident après la déclaration ([[Déclaration d'incident]]) |
| 7 | P1-07 | Le [[Super Admin]] examine et retire une évaluation d'[[Artisan]] contestée |
| 8 | P1-18 | Le recommandé électronique est masqué tant qu'aucun service n'est relié |
| 9 | P1-02 | La reprise comptable se retrouve après un rechargement et peut être abandonnée |
| 10 | P1-06 | Le [[Locataire]] voit l'état de la signature électronique qui le concerne |
| 11 | P1-03 | Une facture d'[[Artisan]] erronée se refuse avec un motif ; l'artisan en dépose une autre ([[Intervention et clôture]]) |
| 12 | P1-05 | Un nouveau message dans la discussion d'une intervention est signalé à chacun ([[Intervention et clôture]]) |
| 13 | P1-14 | L'avenant signé s'enregistre et modifie le loyer et la provision à sa date d'effet ([[Bail]]) |
| 14 | P1-13 | La révision annuelle du loyer est rappelée à la date anniversaire ; l'indice se cherche chez l'Insee, ou se saisit ([[Révision annuelle IRL]]) |
| 15 | P1-08 | Avis d'échéance, relance amiable, rappel de rendez-vous, relance d'invitation : quatre e-mails prêts, **fermés**, que le [[Super Admin]] ouvre un par un |
| 16 | P1-16 | L'[[Artisan]] refusé ou suspendu reçoit les motifs par e-mail ; la fiche dit si l'e-mail est parti et permet de le renvoyer |

**Règle métier posée au lot 11** (source : cahier Gerimmo V3, module 9, variante V5 — « l'agent la refuse, l'artisan
la corrige ou la justifie ») : une intervention ne porte qu'**une facture en vigueur** ; une facture refusée reste au
dossier, intacte, avec son motif ; refus et validation s'excluent. La question de l'avoir et de la numérotation est
posée à l'expert-comptable (`JURISTE.md`, partie 4) : elle n'est pas tranchée.

**Règle posée au lot 15** (décision de prudence de l'agent, à confirmer par le dirigeant : `QUESTIONS.md`, Q6 et
Q24) : aucun e-mail automatique ne part tant que le Super Admin n'a pas ouvert l'envoi correspondant ; pour l'avis
d'échéance et la relance d'un loyer, chaque espace doit en plus donner son accord ; même ouvert, un e-mail ne part que
si la base confirme, juste avant, qu'il est toujours dû. Aucun e-mail réel n'a été envoyé pendant la vérification.

**En attente du dirigeant** : « ok pour la copie de base » (Q1) et « ok pour les sites officiels » (Q5). Sans le
second, les corrections qui touchent une règle de droit (P0-03 à P0-09, P0-11, P1-09 à P1-12, P1-15) restent en
attente ou partent dans `JURISTE.md`.

## Liens

[[État du projet et décisions ouvertes]] · [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]] ·
[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] · [[Recette de production]]
