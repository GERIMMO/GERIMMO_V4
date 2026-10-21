---
type: synthesis
tags: [pilotage, point-d-etape, lancement, production, verification]
status: draft
created: 2026-10-21
updated: 2026-10-21
sources: ["[[Audit final avant publication — 19 octobre 2026]]", "[[Suites de l'audit — 20 octobre 2026]]", "[[Calendrier de lancement — 30 novembre 2026]]", "[[Prêt à démarcher]]", "[[Liste d'attente des agences]]", "[[Registre des traitements]]", "[[Recette de production]]"]
---

# Point d'étape — 21 octobre 2026

> [!info] Pourquoi cette page
> Demandée par le dirigeant le 21/10 : « un point d'où nous en sommes et un compte rendu pour que Gerimmo vérifie aussi ». Chaque affirmation porte sa preuve (exécution GitHub, SHA, requête, page) ; le § 8 dit comment la revérifier sans rien modifier. Relevé fait le 21/10 à 5 h 24 UTC (7 h 24 à Paris). Ce qui n'a pas pu être revérifié ce matin est dit au § 9.

## 1. En cinq lignes

1. **Production** : `main` = `4ba53f5` (PR #227), déploiement Vercel `dpl_FSd8B1L4vbodoQkXpAPUdMZ9BWpR` à l'état prêt (READY) depuis le 20/10 à 22 h 09 UTC, 400 versions de migration, recette de production n° 28 verte (66 réussis, 1 sauté, 0 échec), 0 erreur d'exécution Vercel sur 12 h, sonde de disponibilité externe verte à chacune de ses exécutions (planifiée deux fois par heure, GitHub ne l'a lancée que quatre fois entre le 20/10 à 17 h 26 et le 21/10 à 5 h 24 UTC).
2. **Depuis l'audit du 19/10** : six PR fusionnées (#212, #213, #223, #224, #226, #227), quatorze migrations appliquées par le chantier (6 + 7 + 1), quatre recettes de production (n° 25 à 28 : trois vertes ; la n° 26 a échoué sur un scénario D38 à cause de la fixture du test, corrigée par la PR #223 et rejouée verte à la n° 27).
3. **Bloquants de l'audit** : B3, B5, B8 levés ; B1 et B2 levés côté code et saisie faite d'après la PR #226, médiateur de la consommation restant ; B7 levé côté code, variable à confirmer ; B4 (offre Vercel) et B6 (relecture juridique) en attente du dirigeant.
4. **Nouveau depuis hier** : la liste d'attente des agences est en ligne (`/agences`, table, console), le [[Calendrier de lancement — 30 novembre 2026]] est écrit, les dossiers de test par persona sont remis au dirigeant (remise aux amis prévue le 23/10, avec la boîte e-mail dédiée et les trois alias).
5. **Cette semaine** : deux butées du calendrier, toutes au dirigeant : mandats du juriste, du DPO et de l'expert-comptable et identité de l'éditeur complète (médiateur compris) avant le 24/10 ; décisions Stripe, cautionnement et signature écrites avant le 23/10 ; plus une tâche du 23/10 : boîte e-mail dédiée, trois alias et remise des dossiers aux amis.

## 2. État de la production (relevé du 21/10, 5 h 24 UTC)

| Élément | Valeur relevée | Preuve |
| --- | --- | --- |
| Code en ligne | `main` à `4ba53f5` (fusion de la PR #227 écrasée en un commit, dit « squash », 20/10 22 h 07 UTC) ; déploiement Vercel `dpl_FSd8B1L4vbodoQkXpAPUdMZ9BWpR`, état prêt, alias `www.gerimmo.app` | Vercel, projet `gerimmo-v4`, onglet Deployments ; `git log origin/main -1` |
| Base de données | 400 versions dans `supabase_migrations.schema_migrations`, dernière `20261020120000` ; table `liste_attente_agences` présente et vide | SELECT du 20/10 à 21 h 50 UTC (§ 8) ; application : exécution GitHub 39503252285 |
| Recette de production | Exécution 39508957256 (recette n° 28, 20/10, 22 h 33-22 h 44 UTC) sur `4ba53f5` : 66 réussis, 1 sauté, 0 échec, 0 instable ; clôture vérifiée (cinq comptes fixes conservés, supervision retirée, sessions révoquées, comptes bloqués) | Actions → « Recette de production avec nettoyage » |
| Sauvegarde | Dernière réussie : exécution 39501178106 (20/10, 21 h 32 UTC, à la demande, ligne `tech_log` écrite à 21 h 35) ; la sauvegarde planifiée du 21/10 (01 h 20 UTC nominal) n'était pas encore passée à 5 h 24 : GitHub la lance habituellement entre 6 h et 8 h UTC | Actions → « Sauvegarde quotidienne » |
| Restauration éprouvée | Exécution 39413640157 (20/10, 11 h 15 UTC, lancée depuis le compte GERIMMO et consignée par Codex) : 209 tables, 43 fichiers, 0 manquant, 399 versions | Actions → « Vérifier la restauration de la sauvegarde réelle » ; `log.md` entrée « livraison PR213 » |
| Disponibilité externe | Contrôle public en lecture seule planifié deux fois par heure (PR #224, minutes 17 et 47) ; quatre exécutions à ce jour, toutes vertes : 39466068441 (20/10 17 h 26, manuelle), 39495994764 (20 h 54), 39518098268 (23 h 55), 39546559980 (21/10 04 h 54 UTC) ; les retards de GitHub sur les plannings expliquent les trous de trois à cinq heures | Actions → « Disponibilité publique Gerimmo » |
| Erreurs d'exécution | Aucune sur les 12 dernières heures | Vercel → Observability → Runtime errors |
| Pages publiques | `/agences` répond, titrée, sans erreur ni débordement, comme `/`, `/tarifs` et `/confidentialite` (ce que le scénario « pages publiques » de la recette contrôle) ; formulaire et lien « Agences » du pied de page constatés par lecture directe, hors recette | Recette 39508957256 ; lecture directe de `https://www.gerimmo.app/agences` le 20/10 à 22 h 33 UTC |

## 3. Livré depuis l'audit du 19 octobre

| PR | Fusion | Par | Contenu | Preuves |
| --- | --- | --- | --- | --- |
| #212 | 19/10 18 h 48 UTC, `e25c0f7` | Claude | Dix lots de correctifs de l'audit : six migrations (`20261019120000` → `20261019124000`), garde de souscription (B3), sort des devis signés (B5), interrupteur du cautionnement (B7), recette durcie, retours arrière, gardes du chantier | CI 39303242371 ; application 39305241960 ; recette n° 25 (39306114779) |
| #213 | 20/10 11 h 00 UTC, `1d19eb8` | Codex | Accès, dépôts directs de fichiers, reprises Stripe, suivi durable des signatures ; sept migrations `20261020010000` → `20261020084651` ; retours arrière atomiques généralisés | CI 751 (39409359284) ; sauvegarde 47 (39411185042), application 116 (39411754784) ; recette n° 26 (39412514859) en échec sur D38 (fixture du test, corrigée par la PR #223), puis recette n° 27 (39418100865) verte sur `d748959` |
| #223 | 20/10 11 h 50 UTC, `d748959` | Codex | PDF complet de recette (D38), contrôle du téléchargement de 6 Mio | CI 762 (39415354033) ; recette n° 27 (39418100865) verte sur `d748959` après fusion |
| #224 | 20/10 17 h 25 UTC, `eec672a` | Codex | Contrôles Stripe en clés de test, 52 contrôles WebKit, sonde de disponibilité externe, prévisualisations Vercel ignorées hors production | CI 766 (39462743679), Stripe 13 (39457950199) |
| #226 | 20/10 18 h 30 UTC, `efcee5e` | Codex | Identité publique adaptée à l'entrepreneur individuel (RNE/RCS, franchise de TVA), confidentialité précisée (responsable, parcours, signatures SMS, brouillons locaux, conservation, droits) ; coordonnées publiques enregistrées par l'écran existant ; **adhésion à un médiateur restant à faire** | Corps de la PR #226 (136 tests ciblés) |
| #227 | 20/10 22 h 07 UTC, `4ba53f5` | Claude | Liste d'attente des agences : page `/agences`, table `liste_attente_agences` (migration `20261020120000`), console `/admin/liste-attente`, wiki ; calendrier de lancement | CI 39501073167 et 39503666940 ; sauvegarde 39501178106 ; simulation 39501366981 ; application 39503252285 ; recette 39508957256 |
| #229 | ouverte le 21/10 | Claude | Journal et wiki du déploiement de la liste d'attente ; cette page | CI 39549226185 verte sur `564f2c1` ; une CI par commit ensuite, dernier état à lire sur la PR avant fusion |

## 4. Les huit bloquants de l'audit du 19 octobre

| Bloquant | État au 21/10 | Preuve | Reste |
| --- | --- | --- | --- |
| B1 — éditeur non identifié | **Largement levé** : les coordonnées publiques confirmées par le dirigeant sont enregistrées par l'écran des paramètres (PR #226) et les mentions légales s'adaptent à l'entrepreneur individuel | Corps de la PR #226 ; pages `/mentions-legales` et `/confidentialite` en ligne | Adhérer à un **médiateur de la consommation** et saisir ses coordonnées (la garde de souscription l'exige) |
| B2 — pages légales figées | **Levé d'après la PR #226** : champs des prestataires et de la Base Adresse Nationale saisissables (migration `20261019123000`), faits des prestataires enregistrés par l'écran | § 10 de l'audit ; corps de la PR #226 | Vérifier en ligne que l'encadré « en cours de finalisation » a disparu des trois pages et que le message de succès de `/admin/parametres` ne trompe plus (non relu ce matin) |
| B3 — vente sans garde | **Levé** : paiement refusé tant que l'identité est incomplète ou que la version en vigueur des CGV n'est pas acceptée | PR #212, tests `garde-souscription` | Décision C1 (clé Stripe réelle ou de test jusqu'à la relecture juridique) à écrire |
| B4 — offre Vercel Hobby | **Non relevé ce matin** | Tableau de bord Vercel → Settings → Billing | Passage en Pro avant le premier encaissement (D1) ; à confirmer par le dirigeant |
| B5 — devis signés figés | **Levé** côté code (migration `20261019124000`) | Application 39305241960 ; recette n° 25 | Vérifier le 29/10 au matin la tâche de nuit des devis (`cron.job_run_details`) |
| B6 — aucune relecture juridique | **En attente** | — | Mandater le juriste avant le 24/10 (butée du calendrier) |
| B7 — cautionnement électronique | **Levé côté code** : interrupteur `ZOHO_SIGN_CAUTIONNEMENT_FERME` | PR #212 | Confirmer que la variable est posée en production (Vercel → Environment variables) ; sinon la poser (D2) |
| B8 — aucune recette depuis le 17/10 | **Levé** : recettes n° 25 (39306114779, 19/10, `e25c0f7`), n° 27 (39418100865, 20/10 11 h 52 UTC, `d748959`) et n° 28 (39508957256, 20/10 22 h 33 UTC, `4ba53f5`) vertes ; la n° 26 (39412514859, 20/10 11 h 05 UTC, `1d19eb8`) a échoué sur D38 (fixture du test), corrigée par la PR #223 | Actions → « Recette de production avec nettoyage » | Une recette après chaque déploiement, comme depuis le 19/10 |

## 5. Travail des 20 et 21 octobre (Claude)

- **Dossiers de test par persona** pour la bêta fermée des amis : document en sept sections (règles, fiche de constat, Propriétaire, Locataire, Artisan, dirigeant, grille de suivi) remis au dirigeant le 20/10 ; hors dépôt.
- **Liste d'attente des agences** ([[Liste d'attente des agences]]) : quatre lots isolés (base, site, console, wiki) relus de façon contradictoire, batterie locale complète (9 209 tests, 199 parcours navigateur, audits d'écrans), un défaut réel du formulaire trouvé et corrigé avant publication, déploiement par le protocole complet, recette verte. Le formulaire n'envoie rien à l'agence ; le dirigeant recontacte depuis la console.
- **[[Calendrier de lancement — 30 novembre 2026]]** : critères de sortie du 30/11 au soir, plan semaine par semaine, butées, règles de la publicité dans l'entourage, risques et plans de repli.
- **Journal et wiki** : entrées `dev`, `decision` et première entrée `deploy` du 20/10 livrées par la PR #227 ; entrée `deploy` de clôture (fusion `4ba53f5`, Vercel, recette), entrée `query` du 21/10 et pages de pilotage datées du déploiement par la PR #229.
- Deux points d'exploitation : GitHub supprime désormais la branche de travail à chaque fusion (réglage posé le 20/10), elle est recréée depuis `main` ; un test de téléchargement livré par Codex (`fichier-signe-navigateur`) échoue sur le banc local de Claude avec le Chromium 141 et passe en CI : sans effet sur la production.

## 6. Décisions attendues du dirigeant

| N° | Décision ou geste | Échéance (du [[Calendrier de lancement — 30 novembre 2026]], ou proposée par cette page) |
| --- | --- | --- |
| 1 | Mandater le juriste, le DPO et l'expert-comptable (H2) | 24/10 |
| 2 | Adhérer à un médiateur de la consommation et saisir ses coordonnées (B1) ; relire les trois pages légales | 24/10 |
| 3 | Écrire dans `log.md` : mode Stripe (C1), cautionnement fermé (D2), liste d'essai de signature (D3), interrupteurs Zoho (D4) | 23/10 |
| 4 | Offre Vercel : confirmer le passage en Pro ou sa date (B4) | Avant le premier encaissement ; D1 confié à Codex pour le 1/11 au calendrier |
| 5 | Liste d'attente des agences : indexation immédiate de `/agences`, base légale et durée de conservation (repère de trois ans après le dernier contact, à confirmer), sort des lignes « retirées » dans l'export, sort de `liste_attente` du 29/09 | Sans date au calendrier ; les durées de conservation sont chez le DPO le 8/11 : proposé 8/11 |
| 6 | Faire une inscription d'essai sur `/agences`, la retrouver dans la console, changer son statut et exporter le CSV (gestes que la recette ne joue pas : elle lit la page et la console sans écrire) | 23/10 (proposé par cette page) |
| 7 | Boîte e-mail dédiée et trois alias pour les amis ; remise des dossiers | 23/10 |
| 8 | Protection de `main` (A1) : GitHub la signale déjà protégée avec le contrôle « Lint, types, tests, build » exigé pour tous ; squash seul et suppression automatique des branches fusionnées posés le 20/10 ; reste à confirmer dans Settings → Branches que la poussée forcée et la suppression sont interdites et la PR exigée (détail non lisible par l'API depuis la session) | 25/10 |

## 7. Prochaines étapes

- **Codex** : semaine du 19 au 25/10, A2–A4 (Dependabot déjà activé le 20/10) et B1–B5 du prompt de passation (réglages Supabase Auth : notifications de sécurité, changement de mot de passe, sessions, limites ; sans rapport avec les bloquants B1–B8 de l'audit) ; semaine du 26/10 au 1/11, C2–C3, D1, F1–F2, E1–E3 et les corrections des constats P0/P1 des amis. F3 (adresse de connexion dédiée du super-administrateur, second superviseur) revient au dirigeant pour le 8/11.
- **Claude** : fusion de la PR #229 par le dirigeant ; relecture du lundi du calendrier ; wiki et journal ; renfort sur les constats des amis si le dirigeant le demande (le calendrier les confie à Codex).
- **Amis** : dossiers J1 à J7 à partir du 26/10.
- **29/10 au matin** : vérifier la tâche de nuit des devis.

## 8. Comment vérifier ce point

| Affirmation | Où regarder | Commande ou requête (lecture seule) |
| --- | --- | --- |
| `main` est à `4ba53f5` | GitHub → Code → main | `git fetch origin main && git log origin/main -1 --oneline` |
| Les exécutions citées existent et sont vertes | GitHub → Actions, par identifiant | `https://github.com/GERIMMO/GERIMMO_V4/actions/runs/<id>` |
| 400 versions, dernière `20261020120000` | Supabase → SQL (lecture) | `select count(*), max(version) from supabase_migrations.schema_migrations;` |
| Table des agences conforme | Supabase → SQL (lecture) | `select count(*) from public.liste_attente_agences;` et `select polname from pg_policy where polrelid = 'public.liste_attente_agences'::regclass;` (attendu : `liste_attente_agences_select_sa`, `liste_attente_agences_update_sa`) |
| Aucune écriture anonyme sur la table | Supabase → SQL (lecture) | `select has_any_column_privilege('anon', 'public.liste_attente_agences', 'INSERT');` (attendu : `false`) |
| Sauvegarde consignée | Supabase → SQL (lecture) | `select created_at from public.tech_log where evenement = 'tache_sauvegarde' order by created_at desc limit 3;` |
| E-mail du relais de 5 h parti ce matin | Supabase → SQL (lecture) | `select * from public.relais_alertes_envois order by jour desc limit 2;` |
| Page `/agences` en ligne | Navigateur | ouvrir `https://www.gerimmo.app/agences` ; le pied de page porte « Agences » |
| Pages légales complètes (B1, B2) | Navigateur | ouvrir `/mentions-legales`, `/conditions`, `/confidentialite` : aucun « à fournir », aucun encadré « en cours de finalisation » ; le médiateur apparaît une fois l'adhésion saisie |
| Console | Navigateur, compte super-administrateur | `/admin/liste-attente` (rubrique Développement commercial) ; `/admin/sante` pour le mode Stripe et les interrupteurs |
| Déploiement Vercel | Vercel → gerimmo-v4 → Deployments | `dpl_FSd8B1L4vbodoQkXpAPUdMZ9BWpR`, commit `4ba53f5`, READY |
| Variables de production | Vercel → Settings → Environment variables | présence de `ZOHO_SIGN_CAUTIONNEMENT_FERME` ; mode de `STRIPE_SECRET_KEY` (test ou réel) sans afficher la valeur |

## 9. Limites de ce point

- Les chiffres de la base datent du 20/10 à 21 h 50 UTC et de la fin de la recette (22 h 45 UTC) : l'outil SQL n'était pas disponible le 21/10 au matin, les requêtes du § 8 sont à rejouer.
- Le formulaire `/agences` n'a pas été soumis en production (la recette relit la page, elle n'inscrit pas d'agence).
- Le mode Stripe, les interrupteurs Zoho, la variable du cautionnement et l'offre Vercel n'ont pas été relevés ce matin.
- Les livraisons de Codex (#213, #223, #224, #226) sont décrites d'après leurs PR et le journal ; elles n'ont pas été revérifiées une à une par Claude.
- L'e-mail du relais de 5 h du 21/10 n'a pas été vérifié.
- [[Prêt à démarcher]] n'était pas à jour de la PR #226 (ses § 1.2 et § 5 disaient encore l'identité de l'éditeur non fournie) : un encadré daté du 21/10 le signale désormais en tête de page ; les sections anciennes restent datées.
- Les exécutions GitHub sont toutes lancées depuis le compte GERIMMO : l'attribution « Codex » ou « Claude » repose sur le journal et les PR, pas sur l'acteur GitHub.

> [!warning] Points à trancher
> - Mandats du juriste, du DPO et de l'expert-comptable (butée du 24/10).
> - Médiateur de la consommation (adhésion, puis saisie).
> - Mode Stripe au 30/11, cautionnement et signature : décisions écrites.
> - Offre Vercel Pro avant le premier encaissement.
> - Liste d'attente des agences : indexation, conservation, base légale, lignes retirées, sort de `liste_attente`.
