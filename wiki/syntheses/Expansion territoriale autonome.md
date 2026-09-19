---
type: synthesis
tags: [expansion, territoire, croissance, acquisition, publicite, parrainage, france, autonomie]
status: draft
created: 2026-09-19
updated: 2026-09-19
sources: ["[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]"]
---

# Expansion territoriale autonome

**En une phrase :** Gerimmo doit **gagner du terrain toute seule sur la carte
de France** — bien installée en Essonne, elle ouvre le département voisin,
puis toute la région, puis **choisit elle-même la région suivante** là où
c'est le plus pertinent, et recommence. Décision du porteur du projet le
19/09/2026, avec trois consignes : le passage à une nouvelle région est
**automatique** (sur score, pas sur validation) ; **les particuliers ne sont
jamais démarchés directement** (interdit sans consentement) mais Gerimmo est
**autorisée à faire de la publicité sur Instagram et Facebook** ; tout se fait
**dans des limites** — d'argent, de loi, de santé, de rythme.

## Ce que l'expansion n'est pas

Ce n'est pas l'entretien technique (capteurs, réparation, préproduction) — voir
[[Gerimmo en autonomie]] — même si l'un conditionne l'autre : **on n'ouvre pas
un département quand le produit va mal là où il est déjà.** Et ce n'est pas la
prospection d'individus : pour les propriétaires, les seuls leviers sont la
visibilité (pages locales, publicité) et le [[Parrainage|parrainage]].

## La boucle, chaque mois

1. **Mesurer où l'on est.** Les organisations et les biens portent déjà un
   code postal : l'empreinte par département (agences, propriétaires directs,
   biens, lots, baux en cours, inscriptions du mois, résiliations) se calcule
   **sans rien ajouter à la base**. S'y ajoute la **santé** locale : signalements
   ouverts, erreurs, délai de réponse du support, abandons d'essai.
2. **Noter les candidats.** Pour chaque département non ouvert, un score :
   - **taille du marché** — logements loués dans le parc privé (INSEE,
     recensement, statut d'occupation) ;
   - **densité d'agences** — établissements en activité, codes NAF 68.31Z
     (agences immobilières) et 68.32A/B (administration de biens) — base SIRENE ;
     ce sont à la fois des prospects et des concurrents ;
   - **tension** — communes en zone tendue (liste réglementaire), encadrement
     des loyers le cas échéant ;
   - **niveau des loyers** — observatoires locaux des loyers, quand ils existent ;
   - **proximité** — contiguïté avec un département ouvert, et résultats chez
     les voisins (inscriptions, conversion, résiliations).
   Toutes ces sources sont publiques et françaises. **Aucun chiffre n'est
   estimé** : une donnée absente vaut zéro dans le score, et se dit.
3. **Ouvrir — si les portes sont vertes.** Le département de meilleur score
   s'ouvre quand le territoire courant passe ses seuils de santé et que le
   budget du mois le permet. Un département à la fois.
4. **Agir dans le département ouvert** — ce que l'application fait seule :
   - **pages locales** sur la vitrine et le journal (« gestion locative dans
     les Yvelines », loyers, zone tendue, démarches), construites sur un
     gabarit fixe à partir des seules données officielles — c'est ce que les
     moteurs de recherche indexent ;
   - **publicité Instagram et Facebook**, ciblée sur le département, **à
     budget quotidien plafonné**, avec des annonces produites sur gabarit ;
   - **proposition aux agences** : liste des établissements du département
     (SIRENE), proposition préparée ; **la prise de contact avec des
     professionnels est encadrée** — adresses professionnelles seulement,
     désinscription immédiate, volume plafonné, jamais deux fois sans réponse ;
   - **parrainage** : un propriétaire, un locataire ou une agence satisfaite en
     amène une autre, avec un avantage défini ;
   - **accueil** : l'inscription en ligne et l'essai existent déjà.
5. **Surveiller et rendre compte.** Inscriptions, conversion, résiliations,
   dépense, plaintes — par département. Un compte rendu mensuel au porteur du
   projet : « Essonne : 12 agences (+3), sain. Yvelines ouvertes le 3. Prochain :
   Hauts-de-Seine, score 78. Dépensé : X sur Y. » **Un mot suffit pour tout
   arrêter.**
6. **Changer de région** — automatique : quand tous les départements de la
   région courante sont ouverts (ou que les restants sont sous le seuil de
   pertinence), le score se calcule entre régions, la meilleure est retenue,
   et l'on repart de son département de meilleur score.

## Les limites — écrites avant la première ouverture

| Limite | Règle |
|---|---|
| **Argent** | Un budget mensuel par département, un plafond quotidien par campagne. Jamais dépassés ; un dépassement arrête la campagne, pas l'inverse. |
| **Loi — particuliers** | Aucun contact direct (e-mail, SMS, courrier, message) avec un particulier non inscrit. La publicité sociale ciblée est le seul chemin. |
| **Loi — professionnels** | Prospection encadrée : intérêt en rapport avec la fonction, adresse professionnelle, information et désinscription à chaque message, registre des refus. |
| **Loi — contenu** | Aucun chiffre inventé sur une page ou une annonce : source officielle citée, ou rien. Gerimmo est un **logiciel** ; les pages ne promettent pas un service de gestion que l'entreprise ne rend pas elle-même. Mentions de l'annonceur complètes. |
| **Loi — données** | La mesure des conversions se fait **côté serveur** (code de campagne à l'inscription), pas par pixel de suivi sans consentement. Meta figure déjà au tableau des sous-traitants ([[Socle de sécurité]]) au titre de WhatsApp ; l'usage publicitaire s'y ajoute. |
| **Santé** | Pas d'ouverture tant que, sur le territoire courant : signalements bloquants ouverts, résiliations du mois, délai de réponse du support dépassent leurs seuils. |
| **Rythme** | Un département par ouverture ; pas d'ouverture le mois d'une ouverture précédente tant que ses premiers chiffres ne sont pas lus. |

## Ce qui existe, ce qui manque

| Brique | État |
|---|---|
| Codes postaux des organisations et des biens | **existe** |
| Inscription en ligne, essai, paiement | **existe** |
| Vitrine et journal | **existent** — sans déclinaison locale |
| Tableau de bord par département (empreinte + santé) | **empreinte construite le 19/09** (`/admin/territoire`, console de supervision, sans migration) : organisations là où elles sont domiciliées, biens/lots/baux là où ils sont, inscriptions du mois, remontée par région, non-placés dits. La **santé** a ses signaux depuis le 19/09 (erreurs d'écran, bilans des tâches, `/api/sante` — [[Gerimmo en autonomie]]) ; les **seuils** qui en font une porte fermée restent à fixer. |
| Sources publiques et score | **score construit le 19/09** (`src/lib/score-territoire.ts`, pur, 15 tests) : marché 40 %, agences 20 %, tension 15 %, proximité 25 %, chaque composante en rang parmi les candidats ; on reste dans la région tant qu'un candidat y dépasse le seuil (20), sinon la meilleure région prend le relais — automatiquement. **Contiguïté dérivée du fond de carte** et versionnée (`src/data/departements-voisins.json`, source, empreinte, méthode, contrôles), pas écrite de mémoire. **Marché encore vide** (`src/data/territoires-marche.json`, trois sources nommées) : depuis l'environnement de développement, data.gouv, l'annuaire des entreprises et l'INSEE **ne répondent pas** (politique réseau) ; le script `scripts/territoire/recuperer-marche.mjs` les remplira dès qu'ils seront joignables. Tant qu'il manque, la page le dit ligne par ligne. |
| Pages locales sur gabarit | à construire |
| Parrainage | **n'existe pas** — à construire |
| Publicité Instagram/Facebook pilotée | à construire — demande un compte publicitaire Meta et un accès d'API, au nom de l'entreprise |
| Prospection encadrée des agences | à construire, après cadrage juridique |
| Compte rendu mensuel et interrupteur | **ronde mensuelle construite le 19/09** (`/api/cron/territoire`, le 1er du mois à 5 h) : elle mesure l'empreinte, note les candidats, décide, évalue la **porte de santé** (passes des quatre tâches sous 36 h, erreurs d'écran ≤ 5 sur 24 h, zéro bug N1 ouvert — seuils par défaut, à confirmer) et consigne le tout, daté, dans `tech_log` (`tache_territoire`, avec `agi: false`). Elle **calcule et consigne, elle n'agit pas encore** : c'est ici, derrière la porte, que les gestes d'ouverture se brancheront. Un test lie désormais chaque cron de `vercel.json` à la liste exemptée du proxy — l'oubli du 18/09 ne peut plus se reproduire. L'interrupteur (arrêter d'un mot) reste à poser. |

## Ordre de construction

1. **Le tableau de bord par département** — voir où l'on est, avec les données
   déjà saisies. Console de supervision, sans migration.
2. **Les sources publiques et le score** — la table des territoires, ses
   sources datées, la contiguïté des départements, le calcul.
3. **Les pages locales** — le gabarit, les données, la publication.
4. **Le parrainage** — le produit, l'avantage, la mesure.
5. **La publicité sociale** — une fois le compte annonceur ouvert par le
   porteur du projet ; plafonds posés avant la première campagne.
6. **La boucle mensuelle** — la routine qui mesure, note, ouvre, rend compte.

> [!warning] Points à trancher
> - **Montants** : budget mensuel par département, plafond quotidien par
>   campagne, avantage du parrainage — chiffres du porteur du projet.
> - **Seuils de santé** : des défauts sont posés dans `src/lib/porte-sante.ts`
>   (quatre tâches passées sous 36 h, ≤ 5 erreurs d'écran sur 24 h, aucun bug
>   N1 ouvert) ; un compteur illisible ferme la porte. À confirmer ou à
>   changer — en un seul endroit. Les résiliations et le délai de réponse
>   du support n'y sont pas encore.
> - **Identité de l'annonceur** : les mentions de l'éditeur sont encore
>   incomplètes (`app/src/lib/editeur.ts`) ; sans elles, ni pages légales ni
>   compte publicitaire au nom de l'entreprise.
> - ~~Contiguïté des départements~~ → **dérivée le 19/09** des frontières partagées
>   du fond de carte, avec contrôles connus ; versionnée avec sa source.
> - **Réseau de l'environnement de développement** : pour que le marché se
>   remplisse et que la routine mensuelle tourne seule, autoriser dans la
>   politique réseau `recherche-entreprises.api.gouv.fr`, `api.insee.fr`,
>   `www.insee.fr`, `www.data.gouv.fr`, `static.data.gouv.fr` et
>   `geo.api.gouv.fr`. Sans cela, seule la proximité départage.
> - **Prospection des agences** : le cadre exact (base légale, mentions,
>   registre) est à établir avant le premier envoi ; jusque-là, la liste se
>   prépare, rien ne part.

## Relations

Conditionnée par [[Gerimmo en autonomie]] (santé du produit) · vitrine et
[[Journal éditorial]] pour les pages locales · [[Onboarding et abonnement]]
pour l'accueil · [[Socle de sécurité]] et [[RGPD]] pour Meta et la mesure ·
[[Proposition de valeur]] et [[Analyse concurrentielle]] pour le message ·
[[Grille tarifaire agence — proposition]] pour l'offre.
