---
type: synthesis
tags: [autonomie, exploitation, debogage, evolution, routines, securite, france, rgpd]
status: draft
created: 2026-09-19
updated: 2026-09-19
sources: ["[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "[[2026-07-24-gerimmo-v3-module-14-agenda-et-alertes]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]"]
---

# Gerimmo en autonomie — exploitation, débogage, évolution

**En une phrase :** « se gérer seul » recouvre trois choses qui n'ont pas le
même plafond. **Exploiter** (faire tourner la journée métier) : l'application
doit le faire à 100 %, et le fait déjà en grande partie. **Déboguer** (voir ce
qui casse, le réparer) : autonome jusqu'à la correction testée et
prévisualisée, jamais jusqu'à la mise en ligne — par les règles du projet
lui-même. **Évoluer** (nouveaux services, veille du droit) : autonome pour
écouter, instruire et construire ; humain pour décider ce qui part et quand.

Réponse à la question du porteur du projet le 19/09/2026 : « comment faire
pour que Gerimmo se gère seul — évolution dans les services, débogage,
développement en France en autonomie ». Le constat s'appuie sur le code et la
base de production tels qu'ils sont ce jour.

## Ce que le projet a déjà décidé — et qui borne l'autonomie

Trois règles écrites fixent la ligne d'arrêt. Elles ne sont pas des obstacles à
contourner : ce sont elles qui rendent l'autonomie acceptable.

- **« Gerimmo transmet et suit, il ne corrige jamais »** (RM-20.3.1/2,
  [[Retours utilisateurs]]) : la correction est un processus d'ingénierie hors
  application — branche isolée, relecture, **tests + préproduction + déploiement
  progressif jamais optionnels**, surveillance, rollback. L'application ne se
  modifie pas elle-même en production.
- **« Aucun bouton applicatif ne restaure directement la production »**
  ([[Plan de reprise d'activité]]) : toute restauration, tout SQL, toute
  migration, toute permission, tout Storage **exige une validation humaine**.
- **Le classement éclaire, la décision reste humaine** (RM-20.5,
  [[Retours utilisateurs]]) : ce qui devient un service, et à quelle date, se
  décide ; une échéance annoncée n'est « jamais un engagement ».

Corollaire : l'autonomie visée, c'est **tout jusqu'au dernier clic** — et le
dernier clic reste au porteur du projet. C'est exactement le partage pratiqué
ce matin : simulation et application des migrations, vérification en base,
fusion — après un « Accord » explicite.

## Ce qui tourne déjà seul

| Boucle | Ce qui existe | Preuve |
|---|---|---|
| Journée métier | Quatre tâches quotidiennes : quittances (7 h), abonnements (4 h), avis d'échéance (7 h 30, sur accord de l'agence), rappels de rendez-vous (6 h) | `app/vercel.json` |
| Alertes | Douze types se referment d'eux-mêmes quand l'objet d'origine bouge ; escalade 7 j / 15 j | [[Agenda et échéances]] |
| Qualité du code | Lint, types, build, tests sur un Postgres jetable avec émulateur d'API, audit des dépendances (`npm audit --audit-level=high`) à chaque poussée | `.github/workflows/ci.yml` |
| Schéma | Chantier « Migrations Supabase » : simulation en transaction annulée, puis application, garde contre le rejeu | `.github/workflows/migrations.yml` |
| Écoute | Module de retours : signalements avec contexte capturé anonymisé, idées, tri par le super admin, revue mensuelle | [[Retours utilisateurs]] |
| Sessions planifiées | Le mécanisme de routines de l'environnement de développement (sessions à heure fixe, ou déclenchées) — celui qui a tenu le point de contrôle horaire de la PR #60 | ce journal, 18–19/09 |

Divergence à noter : le socle avait tranché **pg_cron** pour les tâches
planifiées ([[Architecture du socle V3]]) ; le code les porte sur Vercel. Les
tâches vivent donc avec l'hébergeur du code, pas avec les données. Pas urgent,
mais à trancher un jour : si Vercel change, les crons partent avec lui.

## Ce qui manque — et qui rend l'autonomie impossible aujourd'hui

**L'application est aveugle à ses propres pannes.** Relevé du 19/09 :

- **aucune frontière d'erreur** — pas un `error.tsx`, pas un
  `global-error.tsx`, aucune capture côté navigateur ;
- `tech_log` n'est écrit qu'à **un seul endroit** (l'authentification) et lu
  par une page d'administration que personne n'est alerté d'ouvrir ;
- les tâches quotidiennes ne rendent compte de rien : combien d'avis sont
  partis, combien ont été refusés, si Resend a répondu — invisible ;
- **aucun point de santé** (`/api/sante`) ; les journaux Supabase des 24
  dernières heures ne contiennent aucune entrée de niveau erreur, mais sans
  capteur, **le silence n'est pas la santé**.

**Il n'y a pas de préproduction.** Supabase n'a qu'une branche, `main`,
non persistante. Les prévisualisations Vercel par PR existent — c'est sur
l'une d'elles que la charte a été validée — mais, sauf configuration contraire
à vérifier dans le projet Vercel, elles lisent **la base de production**. Une
prévisualisation qui écrit dans les vraies données n'est pas une préproduction,
et RM-20.3.2 la rend obligatoire.

**Le pont entre les retours et le développement n'existe pas.** La page
[[Retours utilisateurs]] le dit en toutes lettres : « le raccordement à l'outil
de développement reste un chantier distinct, non livré ». Un bug confirmé
n'arrive nulle part.

**Les jalons d'infrastructure ont été reportés « après les devs »** (décision
2026-07-25, [[État du projet et décisions ouvertes]]) — antivirus, configuration
d'hébergement, procédure de notification d'incident, **premier test de
restauration avant mise en production** (RM-A4.12, bloquant, jamais fait). Les
développements sont faits. Ces jalons sont dus.

**Ce que Supabase sait déjà dire, et que personne ne lit.** Les deux rapports
de conseils, lus et analysés en totalité le 19/09 :

| Niveau | Avis | Portée |
|---|---|---|
| WARN sécurité | Fonctions `security definer` exécutables par `authenticated` via l'API REST | **205 fonctions** — c'est le patron même du projet (toute la logique métier est en RPC avec contrôle de rôle interne). Le risque n'est pas le patron, c'est **la fonction qui oublierait son contrôle**. |
| INFO sécurité | RLS activée sans aucune politique | 7 tables : `abonnements`, `abonnement_evenements`, `artisan_candidatures`, `controles_solvabilite`, `invitations`, `signature_circuits`, `signature_signataires` — le cas « coquille fermée » trouvé sur la reprise comptable le 18/09. Voulu (service seul) ou oublié ? À documenter table par table. |
| WARN performance | Plusieurs politiques permissives pour la même action | `persons` et `publications` : chaque lecture évalue deux politiques. Juste, mais deux fois plus cher. |
| INFO performance | Clés étrangères sans index / index jamais utilisés | 130 / 43. Sans conséquence à la taille actuelle ; à traiter quand un écran ralentira. |

## Cinq boucles, chacune avec sa ligne d'arrêt

### 1. Voir — les capteurs (préalable à tout le reste)

- `error.tsx` et `global-error.tsx` sur les espaces ; toute erreur serveur non
  rattrapée écrit dans `tech_log` **avec la même règle d'anonymisation que les
  signalements** : la route avec ses identifiants remplacés, jamais un champ.
- Chaque tâche quotidienne consigne son bilan (envoyés, refusés, échoués,
  durée) ; une tâche qui n'a pas consigné à l'heure prévue est elle-même une
  alerte.
- Un point de santé `/api/sante` : base joignable, version de migration, heure
  du dernier passage de chaque tâche.
- Les rapports de conseils et les journaux Supabase lus à heure fixe.

Ligne d'arrêt : aucune — lire ne coûte rien et ne casse rien.

### 2. Veiller — la routine du matin

Une session planifiée, chaque matin, qui lit tout ce que la boucle 1 produit
depuis la veille (tech_log, bilans des tâches, delta des conseils Supabase, CI
sur `main`, audit des dépendances, état du déploiement, signalements ouverts),
et rend **un seul compte rendu** au super admin. Pour ce qu'elle sait corriger
seule et prouver par un test, elle **ouvre une branche et une PR** — jamais
plus d'une par jour sur un même sujet, pour tenir le coût.

Hebdomadaire : le lint du wiki. Trimestriel : le **test de restauration** dans
un projet Supabase isolé (le PRA l'autorise : « restaurer dans un projet isolé,
jamais en prod ») avec son rapport consigné ; et l'ingest de l'**IRL** du
trimestre, publié par l'INSEE — l'exemple même d'une évolution de service
dictée par le calendrier, sans décision à prendre.

Ligne d'arrêt : **fusionner, appliquer une migration, toucher aux données, aux
permissions ou au Storage de production** — humain, à chaque fois.

### 3. Corriger — le pont qui manque

Le chantier que le wiki nomme « non livré ». Un signalement **confirmé par le
super admin** part, avec son contexte capturé, vers une session de
développement qui : reproduit d'abord (un test qui échoue), corrige sur une
branche, passe la CI, produit une prévisualisation, ouvre la PR. Le statut
reçu / en cours / corrigé (RM-20.3.2) se déduit de l'état de la PR, sans
ressaisie ; l'utilisateur est prévenu à la fusion.

Le trou à combler d'abord est la préproduction : soit une branche Supabase
persistante (payante), soit l'émulateur de la CI promu en base de
prévisualisation avec un jeu de données de démonstration. Sans elle, la boucle
viole RM-20.3.2 dès le premier bug.

Ligne d'arrêt : la fusion. « Tests + préproduction + déploiement progressif
jamais optionnels » — le vrai garde-fou « quand relecteur et super admin sont
la même personne ».

### 4. Évoluer — les idées et le droit

La revue mensuelle est déjà spécifiée (RM-20.5). La routine y ajoute deux
choses : pour chaque idée en tête de classement, **une fiche d'une page
confrontée au référentiel** (une règle la couvre-t-elle déjà ? la contredit-elle ?)
— et, pour l'idée retenue, une construction **derrière un drapeau par
organisation**, testée, prévisualisée, prête à être ouverte agence par agence.

La veille du droit français est une évolution de service comme une autre :
IRL trimestriel, plafonds, décrets d'application (ALUR, ELAN et leurs suites),
doctrine CNIL. Une routine mensuelle lit les sources officielles (Légifrance,
INSEE, service-public) et **dépose ce qui a changé dans `raw/`** — puis
l'ingest se fait selon la règle du wiki : une source à la fois, avec l'humain.
L'agent ne décide pas seul qu'une règle métier a changé.

Ligne d'arrêt : ce qui devient un service, et sa date.

### 5. Rester en France, et le prouver

- **Données** : Supabase en `eu-west-3` (Paris) — acquis.
- **Code et tâches** : `vercel.json` ne fixe **aucune région** ; sans réglage
  du projet, les fonctions tournent dans la région par défaut de Vercel, hors
  UE. Une ligne de configuration (Paris existe chez Vercel) et une vérification.
- **Le tableau des sous-traitants** (RM-A4.13, bloquant) dit « hébergeur (UE) ».
  Il faut y écrire les entités réelles — l'hébergeur du code, celui de la base,
  le service d'e-mail, Stripe, Yousign, Meta — avec, pour chacune, où sont les
  données et sur quel fondement le transfert repose. Ce fondement est à
  qualifier ; il n'est pas établi ici.
- **Le test de restauration**, dû avant la production. **L'antivirus** sur les
  dépôts. **La procédure de notification** (72 h CNIL).
- **Les 205 fonctions** : un test mécanique qui énumère toutes les fonctions
  `security definer` accordées à `authenticated` et vérifie que chacune commence
  par un contrôle d'appartenance — joué par la CI, donc à chaque migration.
- **Les 7 tables sans politique** : une phrase par table dans le wiki disant si
  c'est voulu.

## Ce que l'autonomie ne peut pas être

Une application qui se modifie en production ; une migration, une permission ou
une restauration sans validation humaine ; une décision de service prise par
l'agent ; une validation juridique — l'audit externe a été écarté le 25/07,
**limite documentée**, et elle demeure. Un projet qui prétendrait dépasser ces
lignes ne serait pas plus autonome, il serait sans garde-fou.

## Par quoi commencer

1. **Voir** (boucle 1) — quelques jours : frontières d'erreur, bilans des
   tâches, point de santé. Sans capteurs, tout le reste veille dans le noir.
2. **Veiller** (boucle 2) — une journée : la routine du matin, avec le
   mécanisme déjà éprouvé.
3. **Le pont retours → développement et la préproduction** (boucle 3) — le
   chantier que le wiki réclame.
4. **Les jalons A4 dus** (boucle 5) — région, sous-traitants, restauration,
   antivirus, notification.
5. **Évoluer** (boucle 4) — une fois que 1 à 3 tournent.

> [!warning] Points à trancher
> - **Préproduction** : branche Supabase persistante (coût récurrent) ou
>   émulateur promu (travail, pas de coût) ?
> - **Crons** : rester sur Vercel ou revenir à la décision pg_cron du socle ?
> - **Budget de la routine** : combien de sessions par jour, et un plafond de
>   PR automatiques — le porteur du projet a déjà dit sa vigilance sur les
>   crédits.
> - **Les 7 tables sans politique** : lesquelles sont voulues ainsi ?
> - **Le fondement juridique des transferts** hors UE, entité par entité :
>   à qualifier, pas à supposer.

## Relations

Borne posée par [[Retours utilisateurs]] (RM-20.3) et
[[Plan de reprise d'activité]] · capteurs et fermeture automatique :
[[Agenda et échéances]] · cadre d'hébergement et sous-traitants :
[[Socle de sécurité]], [[RGPD]] · décisions reportées :
[[État du projet et décisions ouvertes]] · tâches planifiées :
[[Architecture du socle V3]] · ce qui reste à construire par ailleurs :
[[Récapitulatif fonctionnel et lacunes de spécification]].
