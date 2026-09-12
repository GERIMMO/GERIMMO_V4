# Journal — Wiki métier Gerimmo

Registre chronologique, append-only. Une entrée par opération (ingest / query / lint).
Préfixe constant pour rester grep-able : `## [AAAA-MM-JJ] type | libellé`.

## [2026-07-20] setup | Initialisation du wiki
Création de l'échafaudage : `CLAUDE.md` (schéma), `index.md`, `log.md`, arborescence
`raw/` + `wiki/{personas,processus,concepts,regles-metier,sources,syntheses}`, et
gabarits dans `_modeles/`. Wiki prêt à recevoir sa première source.

## [2026-07-21] ingest | Dépôt Gerimmo-V3 (code source)
Ingestion du dépôt GitHub GERIMMO/Gerimmo-V3 (branche main). Analyse par 5 lecteurs
parallèles (vision/fonctionnel, rôles, modèle de données, processus/canaux, règles/tarifs).
Constat clé : `docs/` majoritairement vide (« A completer ») → connaissance métier extraite
du SQL (`supabase/migrations/`, ~60 fichiers) et des services (`src/services/`).
**35 pages créées** : 1 source, 6 personas, 10 concepts, 7 processus, 7 règles métier,
4 synthèses. `index.md` reconstruit. Contradictions et décisions ouvertes consignées dans
[[État du projet et décisions ouvertes]].

## [2026-07-21] maintenance | Alignement des conventions sur .claude/commands
Découverte des commandes personnalisées `/ingest`, `/query`, `/lint`, `/save`
(`.claude/commands/`). Réconciliation : frontmatter passé en **anglais**
(`type`/`status`/`created`/`updated` ; valeurs `persona`/`process`/`concept`/`business-rule`/
`source`/`synthesis`) sur les 36 pages + 5 gabarits ; sections « ⚠️ » converties en **callouts
Obsidian `> [!warning]`** (21 pages). `CLAUDE.md` mis à jour en conséquence. Reste : la commande
`/ingest` nomme les sources `YYYY-MM-DD-slug` alors que la page existante utilise un titre lisible
(à trancher).

## [2026-07-21] maintenance | Renommage page source au format YYYY-MM-DD-slug
`wiki/sources/Dépôt Gerimmo-V3.md` → `2026-07-21-depot-gerimmo-v3.md` (conforme à `/ingest`).
Ajout d'un `aliases: ["Dépôt Gerimmo-V3"]` pour que les liens `[[Dépôt Gerimmo-V3]]` des ~35 pages
continuent de résoudre. Discrepancy tranchée (option A).

## [2026-07-21] source | Trace immuable du dépôt dans raw/
Copie partielle et immuable du dépôt dans `raw/Gerimmo-V3/` : `docs/` + `supabase/migrations/*.sql`
+ `seed.sql` + README/AGENTS/package.json (72 fichiers, ~444 Ko). Code applicatif (`src/`) exclu
volontairement. Manifeste : `raw/Gerimmo-V3/LISEZ-MOI.md`.

## [2026-07-21] ingest | Fonctionnalités par persona (note produit v0)
Ingestion de `raw/assets/fonctionalitePersonav0.md`. Apporte l'**intention produit** par persona
(le code = le *comment*, la note = le *pourquoi/pour qui*). Nouvelle page [[Agenda et échéances]] ;
mises à jour : [[Administrateur d'agence]], [[Propriétaire bailleur]], [[Cycle de vie d'un incident]],
[[Quittancement des loyers]], [[Relances et mise en demeure]], [[Document]],
[[État du projet et décisions ouvertes]]. **4 divergences code↔intention** signalées en callouts
(relance loyer, persona « gestionnaire », agenda/RDV, vue 360).

## [2026-07-21] query  | Qui sont mes différents types d'acteur ?
Réponse synthétisée à partir de [[Modèle de rôles et permissions]], [[index]] et des 6 pages
personas. Résultat : 6 personas / 5 portails (+ super admin plateforme). Pas de nouvelle synthèse
créée — déjà couvert par [[Modèle de rôles et permissions]].

## [2026-07-21] maintenance | Précisions humaines : approbation artisan + admin = agent ++
Deux clarifications métier apportées par l'humain, cohérentes avec les sources.
1. **Artisan, deux approbations distinctes** : validation *globale* par Gerimmo/[[Super Admin]]
   (droit d'exister) vs approbation *par intervention* = sélection du devis par le
   [[Propriétaire bailleur]] ou l'[[Agent immobilier]] (`selectQuote`), jamais le locataire.
2. **[[Administrateur d'agence]] = « agent immobilier ++ »** : hérite de toutes les capacités de
   l'[[Agent immobilier]] + gestion utilisateurs/organisation.
Pages mises à jour : [[Artisan]], [[Administrateur d'agence]], [[Agent immobilier]],
[[Modèle de rôles et permissions]], [[index]].

## [2026-07-21] maintenance | Précision humaine : un bien = propriétaire OU agence (pas les deux)
Confirmations humaines : (1) l'[[Administrateur d'agence]] peut aussi approuver l'artisan par
intervention (héritage agent ++, déjà reflété). (2) **Décision produit** : pas de « propriétaire
client d'une agence » pour l'instant → un [[Bien]] relève d'une seule org, propriétaire indépendant
**OU** agence, exclusivement. Le schéma anticipe le cas (`member_type='owner'` sur org `agency`) mais
il n'est pas exploité. Pages mises à jour : [[Propriétaire bailleur]] (recadrée en indépendant),
[[Organisation]], [[Bien]], [[index]], [[État du projet et décisions ouvertes]] (point 12).

## [2026-07-22] lint   | Contrôle de santé complet du wiki
Revue des 38 pages `wiki/` + index + log. **Santé globale bonne** : index complet (38/38),
aucun lien `[[…]]` cassé, aucune page orpheline, contradictions déjà toutes consignées dans
[[État du projet et décisions ouvertes]]. **Problèmes relevés** : (1) deux fichiers **vides** à la
racine (`personas.md`, `Dépôt Gerimmo-V3.md`) créés par erreur — le second **masque l'alias** de
[[2026-07-21-depot-gerimmo-v3]] et détourne ~35 liens de sources ; (2) [[Accueil]] périmée
(personas génériques pré-ingestion : syndic, mandat de gestion… ; 2ᵉ ingestion absente) ;
(3) « 7 offres » vs 8 lignes dans [[Grille tarifaire]] ; (4) lien croisé manquant
[[Bien]]→[[Agenda et échéances]] (`bien_echeances`). Corrections proposées à l'humain ;
prochaines sources suggérées (réglementation locative, entretiens, concurrence).

## [2026-07-22] lint   | Second passage + application des corrections
Re-lint : aucun changement de contenu depuis le passage du matin. **Vérification en source**
(`20260712110100_sprint10_official_pricing.sql`) : la base contient bien **8 offres** — 6 achetables
en ligne + 2 `requires_quote = true` (`agency_301_600`, `agency_600_plus`) → le « 7 offres » du wiki
était faux. **Corrections appliquées** : [[Grille tarifaire]] (énoncé 8 offres dont 2 sur devis) +
ligne [[index]] ; [[Accueil]] remise à niveau (personas/concepts réels au lieu des génériques
pré-ingestion, 2ᵉ ingestion mentionnée) ; [[Bien]] → lien croisé vers [[Agenda et échéances]].
**Reste en attente de l'humain** : suppression des deux fichiers vides à la racine (`personas.md`,
`Dépôt Gerimmo-V3.md` — ce dernier masque l'alias de [[2026-07-21-depot-gerimmo-v3]]).

## [2026-07-22] maintenance | Suppression des deux fichiers vides à la racine
Sur accord de l'humain : suppression de `personas.md` et `Dépôt Gerimmo-V3.md` (0 octet chacun,
créés par erreur — probablement en cliquant des liens dans Obsidian). Les liens
`[[Dépôt Gerimmo-V3]]` des ~35 pages résolvent à nouveau vers la vraie page source
[[2026-07-21-depot-gerimmo-v3]] via son alias. Tous les points du lint du 2026-07-22 sont soldés.

## [2026-07-22] lint   | Passage de contrôle après corrections
Vérification complète post-corrections : **wiki sain**. Aucun lien cassé, aucune page orpheline,
index complet, plus aucune trace du « 7 offres », frontmatter cohérent sur les 38 pages.
Aucune nouvelle contradiction — les 12 points ouverts restent dans
[[État du projet et décisions ouvertes]]. Observation : **aucune page n'est en `status: stable`**
(37 `in-progress`, 1 `draft`) — proposition de promouvoir les règles bien sourcées et peu volatiles.
Lacunes et prochaines sources inchangées (réglementation locative, entretiens, concurrence).

## [2026-07-22] ingest | Sources concurrents (Rentila, Smovin, Oskar) + recherche web
Ingestion de 5 clippings déposés dans `raw/assets/` couvrant 3 concurrents, complétée par
recherche web (tarifs, limites, concurrents non mentionnés : GérerSeul, BailFacile, Hestia,
Pandaloc, Ublo, Lockimmo, Manerty, Marvin, US). **3 pages sources** créées
([[2026-07-22-rentila-site-web]], [[2026-07-22-smovin-site-web]], [[2026-07-22-oskar-la-boite-immo]])
+ **1 synthèse** [[Analyse concurrentielle]] (2 tableaux : par concurrent, par fonctionnalité).
Enseignements : différenciateur GERIMMO confirmé (cycle incidents/artisans + bots, quasi unique) ;
**standards de marché manquants** (bail, EDL, indexation IRL, compta/sync bancaire, régularisation
charges, signature) → nouveau point 13 dans [[État du projet et décisions ouvertes]] ; tension
tarifaire vs Rentila ajoutée en callout de [[Grille tarifaire]]. `index.md` mis à jour.
Note : `fonctionalitePersonav0.md` réenregistré ce matin — seul ajout (« soit un propriétaire,
soit une agence ») déjà couvert par la décision n°12, pas d'impact wiki.

## [2026-07-22] maintenance | Décision produit : 4 fonctionnalités actées au périmètre
Suite à l'[[Analyse concurrentielle]], l'humain acte l'ajout au périmètre GERIMMO de :
(1) **objet [[Bail]]** (ALUR, clauses, signature — gérant↔locataire, à l'arrivée du locataire) →
tranche le point 1 ; (2) **[[Régularisation des charges]]** (locataire↔gérant) ;
(3) **[[Comptabilité]]** (gérant : agence ou propriétaire) ; (4) **[[Fiscalité]]**
(propriétaire bailleur uniquement). « Gérant » = [[Agent immobilier]] ou [[Propriétaire bailleur]].
**4 pages cibles créées en `draft`** (aucune implémentation dans le code — chaque page porte un
callout le rappelant + points à trancher). Mises à jour : [[Occupation d'un bien]] (renvoi vers
Bail), [[État du projet et décisions ouvertes]] (point 1 tranché ; point 13 scindé décidés/ouverts :
restent EDL, indexation IRL, sync bancaire, mise en location), [[Analyse concurrentielle]]
(tableau 2 : ❌→🎯 + légende), [[Propriétaire bailleur]] (cibles bail/charges/compta/fiscalité),
[[index]].

## [2026-07-22] maintenance | Précisions humaines sur les 4 fonctionnalités + terme « gérant »
Réponses de l'humain aux points ouverts : (1) **bail préexistant** = dépôt optionnel du PDF signé
par le gérant (décidé) ; signature in-app : reco agent = **SEA eIDAS niveau avancé**, par phases
(V1 dépôt PDF, V2 prestataire type Yousign) — à valider. (2) **Régularisation des charges** :
annuelle + **justificatif obligatoire** + **prorata** au départ (tranché). (3) Compta : **pas de
sync bancaire, déclaratif assumé** (tranché). (4) **Fiscalité : tous les cas de figure**
(particulier nu/meublé, SCI IR/IS, LMNP/LMP) — matrice des régimes 2026 ajoutée (recherche web,
seuils volatils à paramétrer par année) ; reco agent : implémentation par phases, SCI-IS via export
expert-comptable. **Vocabulaire acté : « [[Gérant]] »** = agent immobilier OU propriétaire bailleur
→ nouvelle page concept. Pages mises à jour : [[Bail]], [[Régularisation des charges]],
[[Comptabilité]], [[Fiscalité]], [[État du projet et décisions ouvertes]] (point 13),
[[Analyse concurrentielle]] (suivi loyers « choix assumé »), [[index]].

## [2026-07-22] maintenance | Validations humaines : signature bail V1 + modalités fiscalité
(1) **Signature du [[Bail]] tranchée** : V1 = génération PDF + signature hors plateforme + dépôt
du PDF signé ; V2 (SEA eIDAS avancée via prestataire) gardée en tête, non planifiée.
(2) **[[Fiscalité]]** : proposition agent validée (régime = attribut, implémentation par phases
micro → réel) ; **SCI à l'IS** = **export propre depuis la plateforme** vers l'expert-comptable
(besoins à spécifier) ; **table de paramètres fiscaux par année** : mise à jour par un **agent IA
en V2** + **lecture/écriture [[Super Admin]]** au besoin. Pages mises à jour : [[Bail]],
[[Fiscalité]], [[État du projet et décisions ouvertes]] (point 13 : ne restent ouverts que EDL,
indexation IRL, mise en location).

## [2026-07-22] query  | Liste des personas et fonctionnalités associées
Réponse synthétisée depuis les 6 pages personas + [[Modèle de rôles et permissions]] + pages
cibles du jour : 6 personas / 5 portails, fonctionnalités par persona en distinguant implémenté
(code) vs cible (note v0, décisions 2026-07-22 : bail, charges, compta, fiscalité). Rappels :
[[Gérant]] = terme générique (pas un 7ᵉ persona) ; « Gestionnaire » v0 = divergence n°9 toujours
ouverte. Pas de nouvelle synthèse créée — déjà couvert par [[Modèle de rôles et permissions]].

## [2026-07-22] query  | Personas et fonctionnalités (bis) → synthèse filée
Re-invocation de la question via `/query` → la réponse est **filée** en synthèse durable :
nouvelle page [[Fonctionnalités par persona]] (matrice implémenté ✅ vs cibles décidées 🎯 par
persona + transverse [[Agenda et échéances]]), complémentaire de
[[Modèle de rôles et permissions]] (permissions techniques). [[index]] mis à jour.

## [2026-07-22] query  | Détail des personas en bullet points (clarification)
L'humain trouve « des choses pas très claires » dans la matrice → réponse détaillée en bullet
points par persona, avec explication des 3 confusions récurrentes : « agent ++ » (héritage),
les **deux validations de l'artisan** (globale Super Admin vs sélection du devis par le gérant),
et le vocabulaire ([[Gérant]] = terme générique ≠ persona ; « Gestionnaire » v0 inexistant dans
le code, divergence n°9). Pas de nouvelle page — détail déjà porté par les 6 pages personas.

## [2026-07-22] maintenance | Précisions humaines : impersonation, notation artisan 3 niveaux, Gestionnaire=Gérant
Trois clarifications de l'humain. (1) [[Super Admin]] : **impersonation de tous les personas**
(agence, propriétaire, artisan, locataire…), pas seulement des organisations. (2) [[Artisan]] :
**notation à 3 niveaux** — taux de réponse 24 h (automatique GERIMMO), qualité du travail
([[Locataire]]), prestation ([[Gérant]]) ; **divergence signalée** : le code n'a qu'une évaluation
multi-critères unique à la clôture, sans taux de réponse auto → à spécifier (callouts dans
[[Artisan]] et [[Intervention et clôture]]). (3) **« Gestionnaire » (note v0) = [[Gérant]]** →
**divergence n°9 résolue** ([[État du projet et décisions ouvertes]]) ; alias « Gestionnaire »
ajouté à la page [[Gérant]]. Pages mises à jour : [[Super Admin]], [[Artisan]], [[Locataire]],
[[Intervention et clôture]], [[Gérant]], [[Fonctionnalités par persona]], [[index]].

## [2026-07-22] query  | Récap fonctionnel complet + lacunes de spécification → synthèse filée
Demande : tout ce qui est su sur les fonctionnalités, leurs relations aux personas, et ce qui
manque en spécification pour commencer/corriger les développements de Gerimmo-V3. Réponse filée
en synthèse [[Récapitulatif fonctionnel et lacunes de spécification]] : **12 modules** (statuts
✅/⚠️/🎯/❓) et **17 lacunes** en 3 blocs — B1 specs des nouvelles cibles (bail, charges, compta,
fiscalité, notation 3 niveaux), B2 divergences code↔intention à trancher (relance loyer, agenda,
vue 360, rôles/RBAC, tarifs annuels, WhatsApp/n8n, devis privé unique, can_manage_rent), B3 socle
(tests d'acceptation, docs/ à réécrire, proposition de valeur, non-décidés EDL/IRL/mise en
location). Priorisation suggérée : relance loyer + tarifs annuels (correctif), Bail (socle du
nouveau). [[index]] mis à jour.

## [2026-07-22] export | Document Word du récapitulatif fonctionnel
Export hors wiki, à la demande de l'humain : génération de
`C:\Users\Admin\Documents\Projet\Gerimmo\GERIMMO - Recapitulatif fonctionnel et specifications - 2026-07-22.docx`
(via Word). Contenu : tableau des 6 personas (✅/🎯), les 12 modules, les 17 lacunes de
spécification (B1/B2/B3), priorisation. Snapshot figé du wiki au 2026-07-22 — la référence
vivante reste [[Récapitulatif fonctionnel et lacunes de spécification]].

## [2026-07-24] maintenance | Conversion des sources GERIMMO-V3 en markdown
Les 32 fichiers `raw/GERIMMO-V3-*.docx` (référentiel des parcours clients V3 : modules 0 à 20,
annexes A1–A6, architecture lot 0, matrice de traçabilité, plan de livraison) ont été convertis
en `.md` à côté des originaux via pandoc (docx → GFM). Les schémas embarqués sont extraits dans
`raw/assets/<nom-du-document>/media/` et référencés en chemins relatifs. Les `.docx` d'origine
restent intacts (source de vérité). Aucune ingestion effectuée — les sources restent à traiter.

## [2026-07-24] maintenance | Suppression des .docx GERIMMO-V3
À la demande de l'humain, les 32 originaux `.docx` ont été supprimés de `raw/` après
vérification qu'un `.md` existe pour chacun. Les `.md` (+ images dans `raw/assets/`)
sont désormais la source de vérité du référentiel V3.

## [2026-07-24] maintenance | Suppression des images extraites des .docx
À la demande de l'humain, les 32 dossiers `raw/assets/GERIMMO-V3-*` (schémas .png extraits
lors de la conversion) ont été supprimés. Les `.md` du référentiel V3 conservent des balises
`<img>` désormais mortes ; les légendes des schémas (*Schéma N — …*) restent en place.

## [2026-07-24] maintenance | Réimport du référentiel V3 dans raw/assets
L'humain a réorganisé raw/ (suppression des 32 .md et médias précédents) et fourni les .docx
d'origine dans `C:\Users\Admin\Documents\Projet\Gerimmo\Fonctionalité`. Reconversion pandoc
(docx → GFM) et installation dans `raw/assets/` : 32 fichiers `GERIMMO-V3-*.md` + 32 dossiers
d'images `GERIMMO-V3-*/media/` (131 schémas) référencés en chemins relatifs. Les .docx restent
chez l'humain ; sources toujours à ingérer.

## [2026-07-24] ingest | GERIMMO V3 — Livrable A1 : Modèle canonique d'identité
Première source ingérée du référentiel V3 (raw/assets/GERIMMO-V3-A1-Modele-identite.md,
issu de l'audit externe du 2026-07-24, point P0.2). Décision structurante : **compte global,
adhésion par agence** (irréversibilité de la migration inverse). Créées :
[[2026-07-24-gerimmo-v3-a1-modele-identite]] (source) et [[Compte, personne et adhésion]]
(concept — 5 entités, unicité, 6 cas résolus). Mises à jour : [[Isolation multi-organisation]]
(3 niveaux de données, test d'isolation par table), [[Organisation]] (organization_members ~
adhésion), [[Artisan]] (profil global vs relation d'agence, SIRET 3 états), [[Locataire]]
(multi-agences, dossiers cloisonnés), [[Propriétaire bailleur]] (PD↔mandant), [[Agent
immobilier]] (changement d'agence), [[Modèle de rôles et permissions]] (rôle porté par
l'adhésion), [[État du projet et décisions ouvertes]] (point 14 : A1 à valider, écart
Personne/profiles, P1.1 et P1.2 ouverts), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Livrable A3 : Documents, canaux et preuve
Deuxième livrable transverse ingéré (audit externe 2026-07-24, point P0.4). Corrige une
erreur de droit du module 12 : la trace GED ne prouve rien ; « Gerimmo génère et suit, il
ne notifie jamais ». Créées : [[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]] (source)
et [[Notification et valeur probante]] (règle — 5 niveaux de preuve, 4 dates, 3 familles de
documents, 11 règles RM-A3). Mises à jour : [[Document]] (trace GED = opérationnel, jamais
preuve), [[Canaux de communication]] (valeur probante, pièce jointe sans lien sécurisé),
[[Relances et mise en demeure]] (mise en demeure LRAR, date de première présentation saisie),
[[Quittancement des loyers]] (quittance = document courant), [[Bail]] (**contradiction
signalée** : signature V1 hors plateforme du 2026-07-22 vs Yousign en V1 du référentiel V3
— à confirmer), [[État du projet et décisions ouvertes]] (point 15 ; EDL couvert par le
référentiel ; P1.2 nuancé par RM-A3.9), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Livrable A5 : États et événements
Troisième livrable transverse ingéré (audit externe 2026-07-24, point P0.6). Registre
unifié des 8 machines à états (46 états) + contrats d'événements : transitions interdites
en contrôles, effets immédiats tout-ou-rien vs différés en file, webhooks Yousign/Stripe/
Meta (signature, idempotence, conservation 30 j, rejeu super admin). Créées :
[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]] (source) et [[Machines à états et
événements]] (règle — registre complet). Mises à jour : [[Bien]] (machine du lot + écart
code vacant/travaux vs V3 préavis), [[Bail]] (7 états + chaîne « bail signé »),
[[Cycle de vie d'un incident]] (7 états V3 vs code), [[Devis]] (6 états + facturé),
[[Planification d'intervention]] (RDV : arbitrage vs rounds), [[Agenda et échéances]]
(alerte fermée par l'action, RM-14.3.2), [[Canaux de communication]] (contrat webhooks),
[[État du projet et décisions ouvertes]] (point 16 ; phase A terminée, positionnement
comptable seul point bloquant restant), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Architecture du lot 0 (socle)
Quatrième source du référentiel V3 ingérée : la traduction technique des livrables A1-A6
en socle (Next.js/Supabase/Vercel, 9 tables sans donnée métier, RLS actée, pg_cron,
séquence en 5 étapes). Créées : [[2026-07-24-gerimmo-v3-architecture-lot-0]] (source) et
[[Architecture du socle V3]] (synthèse). Mises à jour : [[Compte, personne et adhésion]]
(tables accounts/persons/memberships, 3 règles portées par contraintes, RM-A1.4 révélée),
[[Isolation multi-organisation]] (politique RLS type, 2 tests par livraison, vigilance
perf), [[Modèle de données]] (écart schéma actuel vs cible), [[Document]] (document_liens,
stockage signé, antivirus), [[Machines à états et événements]] (table events, idempotence
par contrainte), [[Canaux de communication]] (**divergence pg_cron vs Vercel Cron**),
[[RGPD]] (retention_rules, audit_log 3 ans / tech_log 6 mois), [[Organisation]] (état
« essai »), [[État du projet et décisions ouvertes]] (point 17 : antivirus à choisir,
export journal, lien devis), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Matrice de traçabilité transverse
Cinquième source du référentiel V3 : la matrice qui clôt la phase B — 71 règles
transverses (A1-A6) croisées avec les 23 modules. Constat : aucune contradiction, 22
règles reflétées, 29 à rattacher (références/champs à ajouter), 20 architecturales
(lot 0). Créée : [[2026-07-24-gerimmo-v3-matrice-tracabilite]] (source, avec bilan et
rattachements prioritaires). Mises à jour : [[Architecture du socle V3]] (20 règles
architecturales confirmées), [[Notification et valeur probante]] (RM-A3.5 = rattachement
n°1 : champ date de première présentation), [[Machines à états et événements]] (RM-A5
aucune citée par les modules), [[Comptabilité]] (14 règles dont A6 au complet ;
durcissements immutabilité/réouverture/relevé bancaire ; nuance déclaratif vs primauté
du relevé à clarifier), [[Artisan]] (contestation de note = droit à l'intervention
humaine, RM-A2.11), [[État du projet et décisions ouvertes]] (point 18 : décisions
attendues dont calendrier du lot 0), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 0b : Dossier locataire
Premier module de parcours ingéré (8 parcours, 17 règles RM-0b, 14 US, module clos).
Principe fondateur : le dossier appartient à la personne, pas au bail — il la suit dans
l'agence, jamais entre agences. Créées : [[2026-07-24-gerimmo-v3-module-0b-dossier-
locataire]] (source) et [[Dossier locataire]] (concept — pièces, garant, versioning,
assurance J-30/J-15/J+0/J+15, purge 5 ans + corbeille 3 mois). Mises à jour :
[[Locataire]] (dépôt annuel de l'attestation), [[Compte, personne et adhésion]] (module
0b confirme A1 : rôle déduit, email bloquant), [[RGPD]] (purge détaillée), [[Document]]
(versioning des pièces, journal d'accès), [[Agenda et échéances]] (premiers seuils du
module 14), [[Bail]] (dossier en amont, lien de garantie porté par le bail),
[[Propriétaire bailleur]] (mandant sans accès aux pièces), [[Notification et valeur
probante]] (alertes assurance = preuve des diligences), [[État du projet et décisions
ouvertes]] (point 13 : mise en location tranchée hors périmètre), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 0 : Biens et lots
Module racine ingéré (10 parcours + import 0.12, 25 US, module clos). Deux principes
fondateurs : le bail porte sur un LOT, la propriété est au niveau du lot. Scission
officielle PM (mandant, aucun accès, parcours 0.11 supprimé) / PD (gestion directe,
~15 parcours à créer, total global ~164). Créées : [[2026-07-24-gerimmo-v3-module-0-
biens-et-lots]] (source), [[Lot]], [[Clé de répartition]], [[Diagnostic]] (concepts).
Mises à jour : [[Bien]] (redéfini : unité physique ; machine à 5 états ; écart A5 vs
module 0 signalé), [[Propriétaire bailleur]] (scission PM/PD, information du mandant),
[[Bail]] (porte sur un lot, zone tendue figée ; **contradiction interne** : module 0
liste « signature hors plateforme V1 actée » vs révision Yousign), [[Machines à états
et événements]] (écart lot), [[Régularisation des charges]] (clé datée, appel de
charges transmis par le propriétaire), [[Super Admin]] (import 0.12, condition de la
vente), [[État du projet et décisions ouvertes]] (point 19), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 0c : Copropriété
Module 0c ingéré (6 parcours, 12 US, module clos) — le socle 0/0b/0c est entièrement
spécifié, le module 1 (Bail) est débloqué. Cœur : recevoir l'appel de charges du syndic
(circuit syndic → propriétaire → agence), le saisir poste par poste, le ventiler
récupérable/non récupérable via une grille décret 87-713 (fonds ALUR jamais récupérable,
règle système). Régularisation bloquée sans appel saisi ; relances du propriétaire
toutes les 3 semaines puis escalade. Créées : [[2026-07-24-gerimmo-v3-module-0c-
copropriete]] (source) et [[Appel de charges]] (concept). Mises à jour :
[[Régularisation des charges]] (blocage RM-0c.6.4, ventilation figée), [[Lot]]
(tantième), [[Clé de répartition]], [[Agenda et échéances]] (3 jeux de seuils du socle),
[[Administrateur d'agence]] (grille, escalades, renonciation), [[Propriétaire bailleur]]
(devoir de transmission du mandant), [[État du projet et décisions ouvertes]] (point 20),
[[index]]. Aucune contradiction détectée.

## [2026-07-24] ingest | GERIMMO V3 — Module 1 : Bail
Cœur métier ingéré (15 parcours, 22 US, module clos, cible baux au 2026-10-01).
Le module porte lui-même la révision « signature électronique Yousign en V1 »
(parcours 1.6/1.7 fusionnés) — le référentiel est désormais cohérent en interne,
reste la confirmation formelle de l'humain. Créées : [[2026-07-24-gerimmo-v3-module-1-
bail]] (source) et [[État des lieux]] (concept — grille depuis le lot, comparatif
automatique, vétusté ≠ dégradation, sans EDL d'entrée aucune retenue). Consolidée :
[[Bail]] (réécriture complète : nu/meublé, mentions, colocation/solidarité 6 mois,
machine à états, préavis/congés avec justificatifs bloquants, modèles datés, chaîne
« bail signé »). Mises à jour : [[Locataire]] (signature, consultation, congé),
[[Agenda et échéances]] (reconduction 6 mois, préemption 2 mois, extinction de
solidarité, EDL), [[Administrateur d'agence]] (modèles 1.16), [[État du projet et
décisions ouvertes]] (point 21 ; IRL couverte par le module 3 ; V2 : contrats séparés),
[[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 2 : Garanties
Module 2 ingéré (7 parcours, 7 US, module clos — aucune question ouverte). Trois
manières de sécuriser le bailleur : dépôt (seul restituable, « pas un solde comptable »,
plafond bloquant 1 mois nu / 2 meublé), caution (solidaire par défaut, rattachée au
bail, acte Yousign), garanties externes (Visale/GLI/bancaire/employeur, sans
intégration). Cœur : la restitution, criticité MAXIMALE — délai 1/2 mois depuis la
remise des clés, impayés imputés d'abord, décote de vétusté linéaire (grille modifiable
module 18), sans EDL d'entrée aucune retenue, décompte figé après envoi. Créées :
[[2026-07-24-gerimmo-v3-module-2-garanties]] (source), [[Dépôt de garantie]] et
[[Garantie]] (concepts), [[Restitution du dépôt de garantie]] (processus),
[[Vétusté et décote]] (règle métier). Mises à jour : [[Bail]], [[État des lieux]]
(double blocage RM-1.13.4/RM-2.4.3), [[Locataire]] (suivi du dépôt, décompte),
[[Dossier locataire]], [[Agenda et échéances]] (délai de restitution, échéance de
garantie), [[Comptabilité]] (deux écritures), [[État du projet et décisions ouvertes]]
(point 22), [[index]]. Contradiction signalée : décompte « Email + espace » (2.7) vs
« LRAR recommandé » (livrable A3) + champ date de première présentation manquant.

## [2026-07-24] ingest | GERIMMO V3 — Module 3 : Loyers et charges
Module 3 ingéré (12 parcours, 12 US, module clos — « le plus dense en calculs »).
Cycle mensuel : appel de loyer → encaissement manuel (pas de sync bancaire, confirme la
décision humaine du 22/07) imputé du plus ancien au plus récent → quittance seulement
après encaissement intégral (reçu si partiel). Impayés : seuils paramétrables par agence
(plancher + 3 délais, garant dès relance 2) — tranche l'ancienne divergence v0↔code
(point 8). Révision IRL : indice saisi/historisé par l'AA, proposition validée ou
renoncée, prescription 1 an, DPE F/G bloqué. Régularisation : année civile, prorata
jours, justificatifs bloquants, rectificative. Créées : [[2026-07-24-gerimmo-v3-module-
3-loyers-et-charges]] (source), [[Révision annuelle IRL]] et [[Solde de tout compte]]
(processus). Mises à jour : [[Quittancement des loyers]] (cible V3 + divergences code),
[[Relances et mise en demeure]] (circuit paramétrable), [[Régularisation des charges]]
(spécification complète, 2 points résiduels tranchés), [[Période de loyer]] (cible
appel/encaissement), [[Locataire]] (3.12), [[Agenda et échéances]], [[Administrateur
d'agence]] (IRL + seuils), [[Comptabilité]], [[État du projet et décisions ouvertes]]
(points 8 tranché et 23), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 4 : Comptabilité
Module 4 ingéré (8 parcours, 7 US, clos). Comptabilité déclarative de caisse assumée et
annoncée (tranche P0.1, dernier point bloquant de l'audit — les 6 sont couverts).
Écritures catégorie+lot+mandat à deux dates, ventilation multi-propriétaires par la clé,
honoraires en écritures automatiques, clôture mensuelle verrouillante (contre-écritures,
réouverture AA tracée, impossible après rapport envoyé), plan de catégories 2 niveaux,
export CSV (pas de FEC). Créée : [[2026-07-24-gerimmo-v3-module-4-comptabilite]].
Consolidée : [[Comptabilité]]. Mises à jour : [[État du projet et décisions ouvertes]]
(point 24, P0.1 tranché), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 5 : Mandat de gestion
Module 5 ingéré (6 parcours, 7 US, clos). Le mandat porte sur des lots (taux par lot,
dégressif), un lot n'a qu'un mandat actif ; 3 paramètres pivots : taux, date de
rapport, seuil de délégation (agence, surchargeable) ; honoraires de location plafonnés
au m² (alerte) ; renouvellement à 4 mois, résiliation sans fin des baux, dernier rapport
émis avant extinction ; signature Yousign V1, le mandant signe par email sans accès.
Créées : [[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion]] (source), [[Mandat de
gestion]] (concept). Mises à jour : [[Propriétaire bailleur]], [[Agenda et échéances]],
[[État du projet et décisions ouvertes]] (point 25), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 6 : Rapport et fiscalité
Module 6 ingéré (6 parcours, 6 US, clos) — le cœur métier 0-6 est entièrement spécifié.
Rapport mensuel : généré à la date du mandat après clôture (bloquant), un feuillet par
bien, envoi toujours par l'agent, figé après envoi, rectificatif motivé sans effacer ;
versement hors app mais tracé (alerte J+15). Récapitulatif fiscal calé 2044, agrégé sur
la date de pièce, fonds ALUR à part, intérêts d'emprunt non suivis. Créées :
[[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite]] (source), [[Rapport de gestion]]
(processus). Mises à jour : [[Fiscalité]] (forme tranchée = récap 2044 ; écart signalé
avec la décision « tous les régimes » du 22/07 — LMNP/SCI absents du référentiel),
[[État du projet et décisions ouvertes]] (point 26), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 7 : Incidents
Module 7 ingéré (8 parcours, 8 US, clos). L'imputation décide de qui paie : tranchée
par l'agent sans proposition auto (décret 87-712), justifiée, locataire informé
immédiatement, contestation tracée sans blocage. Filtre artisan métier + décennale
selon nature ; compte rendu + photo du travail obligatoires ; l'artisan peut signaler
une cause différente ; clôture sans artisan possible ; mandant informé par le rapport
mensuel seul ; urgence hors horaires en V2. Créée : [[2026-07-24-gerimmo-v3-module-7-
incidents]]. Mises à jour : [[Incident]] (section imputation), [[Cycle de vie d'un
incident]], [[Artisan]], [[État du projet et décisions ouvertes]] (point 27), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 8 : Artisans
Module 8 ingéré (5 parcours, 6 US, clos). Aucun artisan sans assurance chez un
locataire : pièces déposées par l'artisan lui-même, seule la décennale bloque et selon
la nature des travaux (décision révisée), seuils J-60/J-30/J-7/J+0, rétablissement au
dépôt, intervention en cours jamais interrompue. Visibilité décidée par l'artisan seul
(privé par défaut) ; recherche métier+zone+décennale triée par score composite (gérant
50 %, locataire 25 %, plateforme 25 % — confirme la notation 3 niveaux du 22/07) ;
désactivation neutre vs blacklist motivée (locale AA / globale SA réversible). Créée :
[[2026-07-24-gerimmo-v3-module-8-artisans]]. Consolidée : [[Artisan]]. Mises à jour :
[[État du projet et décisions ouvertes]] (point 28 — écart artisan_validations code à
réconcilier), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 9 : Devis et facturation
Module 9 ingéré (8 parcours, 8 US, clos). Deux devis max, validité 30 j (alerte J-7),
non-retenus notifiés, note affichée à côté du prix. Accord du mandant au-delà du seuil :
hors application, tracé (date/canal/sens), relance 5 j, urgence absolue motivée visible
au rapport — tranche le point ouvert des modules 0/5. Facture : écart alerté sans
blocage, validation → écriture selon imputation (propriétaire → rapport, locataire →
créance sur bail) ; le locataire imputé choisit son artisan ou l'agence. Créée :
[[2026-07-24-gerimmo-v3-module-9-devis-et-facturation]]. Consolidée : [[Devis]] (2
points code à réconcilier). Mises à jour : [[Locataire]], [[État du projet et décisions
ouvertes]] (point 29), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 10 : RDV et planning
Module 10 ingéré (7 parcours, 6 US, clos). Pas de moteur de disponibilités : l'artisan
propose 3 créneaux minimum, le locataire choisit ou refuse en proposant 3 à son tour ;
arbitrage téléphonique du gérant après 6 refus (refus persistant tracé et opposable) ;
absences attribuées et pesant sur le score ; rappels veille + J-7 conditionnel ; agenda
cloisonné par persona (mandant : rien). RDV sans artisan (EDL, visites) : même mécanique
à deux. Créée : [[2026-07-24-gerimmo-v3-module-10-rdv-et-planning]]. Consolidée :
[[Planification d'intervention]]. Mises à jour : [[Agenda et échéances]] (modèle de RDV
v0 résolu), [[État du projet et décisions ouvertes]] (point 30), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 11 : Notation
Module 11 ingéré (4 parcours, 5 US, clos) — le bloc intervention 7-11 est terminé.
Trois sources : locataire 25 % (relance J+3/J+7 sans blocage, sans réponse = hors
calcul), gérant 50 % (qualité/délai/prix, commentaire privé), plateforme 25 %
(5 indicateurs mesurés, visibles par l'artisan). Publication à partir de 3 notes
(« nouveau » avant) ; contestation auprès du super admin (accès au détail tracé,
droit à l'intervention humaine RM-A2.11). Créée : [[2026-07-24-gerimmo-v3-module-11-
notation]]. Mises à jour : [[Artisan]] (divergence notation résolue en spec), [[État
du projet et décisions ouvertes]] (point 31), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 12 : Documents et GED
Module 12 ingéré (5 parcours, 5 US, clos). GED sans arborescence : rattachement
multiple, le type pilote droits/conservation/affichage ; modèles figés générés par le
super admin (pas d'éditeur libre, mise à jour réglementaire centrale, version du
modèle conservée) ; mise à disposition ≠ envoi (le mandant ne reçoit que par envoi) ;
trace GED ≠ preuve (correction P0.4) ; conservation par type (5 ans / 10 ans / sans
limite) ; navigation par filtres, consultations tracées. Créée : [[2026-07-24-gerimmo-
v3-module-12-documents-et-ged]]. Consolidée : [[Document]]. Mises à jour : [[Super
Admin]] (modèles), [[État du projet et décisions ouvertes]] (point 32), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 13 : Signature électronique
Module 13 ingéré (4 parcours, 6 US, clos) — source formelle de la révision « signature
en V1 » (Yousign, niveau simple email+SMS). Séquentiel bailleur en dernier, aucun compte
à créer (le mandant signe par email), une demande active par document, non modifiable
pendant signature ; refus = motif obligatoire + circuit interrompu ; relances J+7/J+21,
alerte J+28, expiration J+30, relance sans régénération ; la dernière signature rapatrie
le signé et déclenche le parcours métier ; EDL exclus (tactile sur place). Reprises des
modules 1/2/5 listées (RM-1.7.2 à simplifier). Créées : [[2026-07-24-gerimmo-v3-module-
13-signature-electronique]] (source), [[Signature électronique]] (concept). Mises à
jour : [[Bail]], [[Notification et valeur probante]], [[État du projet et décisions
ouvertes]] (point 33), [[index]].

## [2026-07-24] ingest | GERIMMO V3 — Module 14 : Agenda et alertes
Module 14 ingéré (6 parcours, 6 US, clos). Consolidation des 27 types d'alertes des
13 modules : écran unique à 3 vues (calendrier/alertes/retards), 3 criticités
(escalade 7/15 j, informative jamais), seuils légaux figés (lecture seule avec
fondement, MAJ super admin) vs confort paramétrable, fermeture par l'action (jamais
de marquage), escalade nominative (déplace sans dupliquer), annonces agence et
plateforme (non masquables). Résout le point 10 (agenda v0). Créée : [[2026-07-24-
gerimmo-v3-module-14-agenda-et-alertes]]. Consolidée : [[Agenda et échéances]]. Mises
à jour : [[Administrateur d'agence]], [[État du projet et décisions ouvertes]]
(points 10 barré et 34), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Module 15 : Messagerie
Module 15 ingéré (4 parcours, 5 US, clos). Toute conversation rattachée à un objet
(bail/incident/lot, jamais de fil général) ; le locataire peut ouvrir ; WhatsApp intégré
via file d'attente avec rattachement en un clic (alerte 48 h) ; réponse par le canal
d'origine ; fil à trois sur incident (artisan retiré à la clôture, voit prénom+tél
seulement) ; échanges propriétaire = traçage sur le mandat ; archivage avec le bail.
Contradiction signalée : Telegram (canal actif du code) absent du référentiel V3.
Créée : [[2026-07-24-gerimmo-v3-module-15-messagerie]]. Mises à jour : [[Canaux de
communication]], [[État du projet et décisions ouvertes]] (point 35 — sort de Telegram
à trancher), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Module 16 : Onboarding et invitations
Module 16 ingéré (8 parcours, 4 US, clos). Une personne existe avant d'avoir un
compte ; locataire optionnel, mandant jamais invité ; agence créée par le super admin
avec jeu complet de paramètres par défaut ; invitations J+3/J+10/J+30 avec refus tracé ;
enrôlement WhatsApp par consentement daté/révocable, repli email systématique, 8 modèles
Meta gérés par le SA ; deux imports conservés (0.12 migration vs 16.3 courant, gabarit
commun). Créée : [[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]. Mises à
jour : [[Onboarding et abonnement]] (divergence auto-inscription/essai vs création SA),
[[Compte, personne et adhésion]], [[Canaux de communication]], [[État du projet et
décisions ouvertes]] (point 36), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Module 17 : Marque blanche
Module 17 ingéré (3 parcours, 3 US, clos). Habillage pur : logo + 2 couleurs
personnalisés par l'admin agence (activation SA selon plan), contraste en alerte non
bloquante, application aux espaces/documents/emails, mention Gerimmo non supprimable,
pas de domaine propre en V1, structure des modèles inchangée ; artisan multi-agences :
un logo par ligne d'agenda. Personnalisation du bot WhatsApp abandonnée. Créées :
[[2026-07-24-gerimmo-v3-module-17-marque-blanche]] (source), [[Marque blanche]]
(concept). Mises à jour : [[Administrateur d'agence]], [[État du projet et décisions
ouvertes]] (point 37), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Module 18 : Administration
Module 18 ingéré (6 parcours, 5 US, clos) — point de convergence (11 modules y délèguent
leur paramétrage) et facturation au périmètre (décision révisée). Trois rôles figés sans
permission fine (agent limité à ses mandats — restriction majeure vs code), transfert
temporaire de mandats (résout P1.1), désactivation bloquée avec mandats, paramétrage en
9 familles (IRL et seuil de délégation bloquants), console SA à 6 files, suspension
lecture seule / archivage jamais suppression (export toujours possible), journal
d'audit jamais purgé, facturation Stripe : paliers agences / par bien PD, mensuel
exclusif + mise en route + redevance annuelle, comptage des lots sous mandat au dernier
jour du mois, essai 14 j → lecture seule (clôt le point 3 tarification annuelle).
Créée : [[2026-07-24-gerimmo-v3-module-18-administration]]. Mises à jour : [[Modèle de
rôles et permissions]] (3 vs 6 rôles), [[Grille tarifaire]], [[Super Admin]], [[Agent
immobilier]], [[État du projet et décisions ouvertes]] (points 3 et P1.1 clos, point
38), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Module 20 : Retours utilisateurs
Module 20 ingéré (6 parcours, 6 US, clos) — lacune identifiée après l'audit. Deux
circuits : signalement de bug (contexte technique capturé sans donnée personnelle,
masquage automatique + prévisualisation, conservation 6 mois, tri SA à 3 issues avec
réponse systématique) et idées (besoin pas solution, visibles dans l'agence seulement,
revue mensuelle avec classement — agences distinctes = signal le plus fort —, 3 statuts
jamais le rejet, motif + date de réexamen, article par idée retenue). Correction
post-audit : la modification du code sort du périmètre — Gerimmo transmet au suivi
technique (Claude Code) et suit ; tests + déploiement progressif jamais optionnels.
Signalement en lot 1, idées en lot 2. Créées : [[2026-07-24-gerimmo-v3-module-20-
retours-utilisateurs]] (source), [[Retours utilisateurs]] (processus). Mises à jour :
[[Super Admin]], [[État du projet et décisions ouvertes]] (point 39), [[index]].

## [2026-07-25] lint | Ménage : décisions ouvertes, divergences, index
[[État du projet et décisions ouvertes]] dégraissée (26 → ~7 Ko) : la page ne garde que
ce qui attend une décision — 12 arbitrages humains (Yousign, validation A1, Telegram,
fiscalité 2044 vs tous régimes, tarification PD, canal du décompte, diagnostic expiré
sur lot loué, machine du lot, devis unique, P1.2, propriétaire client d'agence, vue
360), 7 choix techniques restants, connaissance manquante, prochaines sources. Les 26
comptes rendus chronologiques par module (points 14-39) sont supprimés — l'historique
vit dans log.md et les pages sources. Créée : [[Divergences code et référentiel V3]]
(synthèse) qui regroupe tous les écarts code ↔ V3 (identité, rôles, objets manquants,
vocabulaires d'états, infrastructure, onboarding/canaux/tarifs, 29 rattachements de la
matrice, docs/ à réécrire) — matière du futur plan de migration. [[index]] réécrit avec
des accroches courtes (16 → ~9 Ko) et référence les deux synthèses.

## [2026-07-25] ingest | GERIMMO V3 — Module 19 : Mobile
Module 19 ingéré (3 déclinaisons, 3 US, clos — aucune question ouverte) — module
d'adaptation, aucun parcours nouveau. Décision actée : site adapté, pas d'app native
(pas de push — email + WhatsApp suffisent ; pas de hors ligne prolongé). Trois usages
debout/sur place : agent = EDL (criticité MAXIMALE, sauvegarde locale automatique,
sync au retour du réseau, photos compressées, signature pleine largeur, indicateur de
sync bloquant ajouté à l'audit P1.5 + alerte avant fermeture ; limites : cache vidé et
changement d'appareil = perte, EDL ouvert ailleurs signalé sans verrou) ; locataire =
déclaration d'incident (3 écrans max, photo avant description, statut sur l'accueil) ;
artisan = compte rendu (2 écrans, photo centrale, logo agence sur l'agenda). Aucune
règle métier modifiée par le mobile. Ce module clôt le référentiel : 22 modules
spécifiés, base de développement. Créée :
[[2026-07-24-gerimmo-v3-module-19-mobile]]. Mises à jour : [[État des lieux]]
(section mobile/hors ligne), [[Agent immobilier]], [[Locataire]], [[Artisan]],
[[Cycle de vie d'un incident]], [[Canaux de communication]] (pas de push),
[[État du projet et décisions ouvertes]] (29/32, référentiel complet), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Livrable A2 : Conservation et RGPD
Livrable A2 ingéré (11 règles, transverse, issu de l'audit P0.3 — réserve : matrice à
valider par un conseil spécialisé). Trois principes : toute durée découle d'une
finalité écrite, trois sorts finaux (suppression / anonymisation irréversible /
conservation justifiée), un journal a sa propre durée (technique 6 mois, audit 3 ans,
accès aux pièces 1 an). Le principe « jamais supprimé, seulement archivé » est corrigé :
l'archivage est une étape, jamais un sort final ; cycle en 3 étapes, contentieux =
gel. Qualification : Gerimmo sous-traitant pour les données d'agence (contrat de
sous-traitance obligatoire), responsable pour la plateforme (annuaire, score artisan,
blacklist globale, comptes, facturation) ; violation notifiée à l'agence sans délai.
Matrice complète (bail/mandat + 5 ans → anonymisation, comptable + 10 ans, incidents
+ 2 ans, artisan 3 ans…). Cinq corrections au référentiel : RM-0b.8.7 (personne
anonymisée au terme), RM-8.5.6 (blacklist 3/5 ans), RM-12.5.6 (fin du « sans
limite »), RM-18.5.2 (journal d'audit 3 ans), RM-18.4.4 (agence 10 ans puis
anonymisée). Contestation de note = droit à l'intervention humaine (RM-A2.11),
AIPD score artisan à évaluer. Créée : [[2026-07-24-gerimmo-v3-a2-conservation-rgpd]].
Mises à jour : [[RGPD]] (refonte : cadre A2 + matrice), [[Archivage plutôt que
suppression]] (principe corrigé), [[Dossier locataire]], [[Artisan]] (blacklist,
responsable de traitement), [[Document]] (RM-12.5.6), [[Organisation]] (fin de vie
agence), [[Modèle de rôles et permissions]] (journal 3 ans), [[État du projet et
décisions ouvertes]] (30/32, livrables juridiques + point Diagnostic), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Livrable A4 : Socle sécurité
Livrable A4 ingéré (14 règles, transverse, issu de l'audit P0.5 — « aucune exigence de
sécurité dans les 22 modules » ; à valider avant production, audit externe recommandé).
MFA proportionné au risque : obligatoire SA seulement, recommandé admin agence,
optionnel ailleurs (« la sécurité théorique nuirait à la sécurité réelle »). Mots de
passe 12 caractères vérifiés contre les fuites, sans expiration ; sessions par rôle
(SA 30 min/8 h → locataire/artisan 7 j/30 j). Chiffrement transit + repos + sauvegardes
sans exception ; hébergement UE acté ; base non exposée. Fichiers : type réel vérifié,
antivirus systématique, jamais d'URL directe, lien temporaire. Sauvegardes : RPO 24 h /
RTO 4 h confirmés, rétention 30 j, test de restauration annuel documenté (premier avant
production) ; restauration une agence/une table possible. Sous-traitants déclarés aux
agences : hébergeur UE, Yousign FR, Stripe IE, Meta hors UE (consentement + optionnel +
repli email + clauses types), antivirus à choisir. Chaîne d'incident : qualification
2 h, confinement 4 h, agences sans délai, CNIL 72 h selon qualification A2. Créées :
[[2026-07-24-gerimmo-v3-a4-socle-securite]] (source), [[Socle de sécurité]] (règle
métier). Mises à jour : [[Plan de reprise d'activité]] (A4 + contradiction test
trimestriel code vs annuel A4), [[Isolation multi-organisation]], [[Super Admin]]
(rôle le plus contraint), [[Architecture du socle V3]], [[Canaux de communication]]
(Meta hors UE), [[Document]], [[RGPD]], [[État du projet et décisions ouvertes]]
(31/32, jalons sécurité), [[index]].

## [2026-07-25] ingest | GERIMMO V3 — Livrable A6 : Doctrine financière
Livrable A6 ingéré (12 règles — dernier point bloquant P0 de l'audit ; réserve :
validation par un expert-comptable avant commercialisation, aucun identifié).
Position : journal de gestion, jamais comptabilité de gérance (ni comptes mandants ni
séquestre ni tiers de confiance). Ce qui fait foi : Gerimmo sur ce qu'il calcule et
décide (appelé, imputation, honoraires, net dû), la banque sur ce qui circule — en cas
d'écart le relevé prime, Gerimmo se corrige (règle de preuve, pas un retour de la
sync : rapprochement manuel assumé, le journal doit faciliter la comparaison).
Immutabilité des écritures dès la création (étend RM-4.4.1) : correction par
contre-écriture (imputée au jour, motif obligatoire, lien tracé, trois lignes
visibles), suppression impossible, réouverture sans effet sur l'existant. Allocation :
plus ancien d'abord, la précision du débiteur prime. Réversibilité = argument de
vente : trois exports à tout moment sans négociation (journal complet avec liens,
documents indexés, référentiel). Limites annoncées sur cinq supports (dont bandeau
permanent et en-tête d'export). Les six P0 de l'audit ont désormais chacun leur
livrable. Créée : [[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]. Mises à jour :
[[Comptabilité]] (doctrine consolidée, 3 points résiduels tranchés), [[Quittancement
des loyers]] (allocation, écarts), [[Rapport de gestion]] (ce qui fait foi), [[État du
projet et décisions ouvertes]] (toutes sources ingérées sauf Plan de livraison ;
expert-comptable ajouté aux préalables), [[index]].

## [2026-07-25] lint | Contrôle de santé après la fin du référentiel
Analyse automatique des liens (~100 pages) + revue ciblée. **Corrigé** : (1) log.md —
42 apostrophes doublées (résidus d'échappement PowerShell) qui cassaient notamment
[[Administrateur d'agence]] et [[Planification d'intervention]] ; (2) [[Accueil]]
remis à niveau (affichait « 2 sources ingérées » au lieu de 32, prochaines étapes
obsolètes — désormais : référentiel complet, 6 P0 couverts, liens vers [[Socle de
sécurité]] et [[Divergences code et référentiel V3]]) ; (3) [[État du projet et
décisions ouvertes]] — le point « Diagnostic indéfini » devient « résidus
indéfini/sans limite » (ajout du rapport d'import RM-0.12.6/7 et de la consultation
locataire 3.12 vs conservation 10 ans). **Signalé sans correction** : page orpheline
[[Récapitulatif fonctionnel et lacunes de spécification]] (snapshot du 22/07 antérieur
au référentiel — proposer archivage ou bannière « supplanté ») ; durées du code dans
[[RGPD]] (télémétrie 90 j) vs journaux A2 (6 mois) — divergence code↔cible à ranger
dans [[Divergences code et référentiel V3]]. Liens : aucun cassé dans wiki/ (l'alias
« Dépôt Gerimmo-V3 » résout les 38 références). Prochaines sources : Plan de
livraison, entretiens personas, note expert-comptable (A6), veille concurrentielle.

## [2026-07-25] maintenance | Décisions humaines post-lint
Trois décisions appliquées. (1) [[Récapitulatif fonctionnel et lacunes de
spécification]] **archivée** (bannière + status archived, index annoté) — ne sera plus
utilisée. (2) **Divergence RGPD tranchée : la matrice A2 fait foi** sur les durées du
code (`docs/rgpd-production.md`) — [[RGPD]] mise à jour, écart consigné dans
[[Divergences code et référentiel V3]] (avec le test de restauration
trimestriel/annuel). Principe général confirmé par l'humain : en cas de conflit
code ↔ référentiel, la cible V3 prime. (3) **Plan de livraison écarté** — ne sera pas
ingéré ([[État du projet et décisions ouvertes]] et [[Accueil]] mis à jour : toutes
les sources sont ingérées). Prochaine étape annoncée par l'humain : trancher les
points ouverts avant de passer au développement.

## [2026-07-25] maintenance | Séance d'arbitrage : 9 décisions actées + phasage V0/V1
Décisions humaines enregistrées. (1) **Phasage produit** : V0 interne « sans forte
intégration » — GED d'abord (dépôt, consultation, téléchargement), signature hors
plateforme ; **Yousign en V1** = première version ouverte aux utilisateurs
([[Signature électronique]]). (2) **Modèle d'identité A1 VALIDÉ** (page passée
stable ; 4 vigilances : test d'isolation, rattachement email à l'invitation, fusion
de doublons, UX de la re-fourniture des pièces). (3) **Telegram abandonné** — bot
WhatsApp seul ([[Canaux de communication]]). (4) **Fiscalité phasée** : 2044 en V1,
LMNP/LMP/SCI en V2 ([[Fiscalité]]). (7) **Diagnostic expiré non bloquant sur lot
loué confirmé** ([[Diagnostic]]). (9) **Devis unique autorisé avec drapeau visible**
([[Devis]]). (11) Propriétaire client d'agence maintenu désactivé. (12) **Vue
scindée du bien** : sélection → écran en deux, détail + éléments non concernés
assombris ([[Document]]). (13) **Résidus de conservation fixés** : diagnostics =
gestion + 5 ans ([[Diagnostic]]), rapport d'import = 3 ans ([[Super Admin]]),
quittances locataire = 10 ans ([[Locataire]]). Bloc 2 : **audit de sécurité externe
écarté** — revue interne par l'agent, limite documentée ([[Socle de sécurité]]).
Restent ouverts (section A) : tarification PD, canal du décompte, machine du lot,
P1.2 — explications fournies à l'humain pour décision.

## [2026-07-25] maintenance | Fin de la séance d'arbitrage : tout est tranché + 4 livrables
Dernières décisions humaines. **A1** : rattachement personne↔compte = l'agent peut
modifier l'email sur la fiche ; fusion de doublons = fonctionnalité super admin
(backlog). **Tarification** : PD par bien / agences par paliers de lots ; proposition
agent (1er bien gratuit, 2,50 €/bien/mois, sans mise en place ; agences = grille
actuelle) — montants à valider ([[Grille tarifaire]]). **Décompte de restitution** :
intégrale = email + espace ; avec retenues = alerte LRAR au gérant + justificatif en
GED avec date de première présentation ([[Restitution du dépôt de garantie]]).
**Machine du lot** : module 0 fait foi, registre A5 à amender ([[Lot]]). **P1.2 :
non** — mandant sans compte, réception pure ; l'audit externe du 24/07 est
intégralement soldé ([[Propriétaire bailleur]]). **Expert-comptable écarté** :
l'export des écritures suffit, chaque agence a le sien ([[Comptabilité]]).
**Validations juridiques internalisées** ; l'agent a rédigé 4 livrables dans
`livrables/` : contrat de sous-traitance RGPD (modèle), politique de confidentialité,
article CGU « journal de gestion », AIPD score artisan. **Infrastructure (antivirus,
hébergement, jalons A4) : gardée ouverte, à revoir après les devs.** [[index]] :
nouvelle section Livrables. Il ne reste qu'une décision : les montants de la grille
PD. Le projet peut passer au développement.

## [2026-07-25] maintenance | Grille tarifaire validée — plus aucun arbitrage ouvert
Décision humaine : grille PD **validée** telle que proposée (1er bien gratuit,
2,50 €/bien/mois, sans mise en place ni redevance) ; grille agences **actuelle
conservée** (paliers re-libellés en lots sous mandat). [[Grille tarifaire]] et
[[État du projet et décisions ouvertes]] mises à jour — la section A est vide :
**feu vert au développement**.

## [2026-07-25] maintenance | Méthodologie projet et plan de sprints proposé
Cadre acté avec l'humain : méthodologie **agile itérative** sur git, fonctionnalités
validées une à une ; **tests unitaires et d'intégration par l'agent** (dont
isolation par table et « RLS actif partout » à chaque livraison), **tests
fonctionnels par l'humain** (scénarios = les US du référentiel et leurs critères
d'acceptation). Proposition rédigée : [[Plan de livraison et sprints]]
(`livrables/`) — **16 sprints de 2 semaines** : S0–S9 = V0 app web fonctionnelle
interne sans intégration (socle → parc → dossier/mandat → bail/EDL → loyers →
compta/rapport → incidents → garanties → admin/PD), recette V0 **mi-décembre
2026** ; S10–S15 = V1 (Yousign, Stripe/onboarding, WhatsApp, mobile/EDL hors
ligne, import en masse/notation/marque blanche, durcissement production) —
**commercialisable fin mars 2027**. Risques identifiés : templates Meta (soumettre
au S11), EDL hors ligne, migration code vs socle neuf (à trancher au S0). En
attente de validation du calendrier par l'humain.

## [2026-07-25] maintenance | Plan de sprints enrichi : personas et features par sprint
À la demande de l'humain, [[Plan de livraison et sprints]] réécrit avec, pour chaque
sprint : les **personas impactés** (légende SA/AA/AG/PD/PM/LO/AR/GA) et le **détail
des features** (5 à 10 par sprint, rattachées aux règles RM). Le plan devient le
support direct des plannings de sprint.

## [2026-07-25] maintenance | Plan de sprints v3 : personas développés, espaces, sources
Second enrichissement du [[Plan de livraison et sprints]] : (1) **tableau des
personas** avec sigles développés, description et espace de chacun ; (2) nouvelle
section « **Les espaces : quand et comment ils se construisent** » — espace agence
(fil rouge S0→S9), espace locataire (naissance S3, complété S4/S5/S7/S8/S9, mobile
S13), espace artisan (naissance S7), espace PD (S9), console SA (S9→S15), PM sans
espace ; (3) **sources wiki citées à chaque sprint** ; (4) features affinées en
puces. Récap général et 3 questions pratiques posées à l'humain (repo, jour de
démo, accès Supabase/Vercel).

## [2026-07-27] setup | Initialisation Git et liaison GitHub
Installation de Git 2.55 (winget), `git init` dans le vault, remote `origin` relié à
https://github.com/GERIMMO/GERIMMO_V4.git (dépôt vide). Ajout d'un `.gitignore`
(fichiers volatils Obsidian/Claude), premier commit sur `main` avec l'intégralité du
wiki. Push en attente : authentification GitHub interactive requise.

## [2026-07-27] setup | Démarrage des devs : monorepo app/ + projet Supabase « Gerimmo V4 »
Push initial vers GitHub effectué (auth via Git Credential Manager). **Décision : monorepo** —
le code de l'application vit dans `app/` à côté du wiki (extraction en dépôt séparé possible
plus tard sans perte). Scaffold **Next.js** (App Router, TypeScript, Tailwind v4, `src/`,
Turbopack) + **shadcn/ui** initialisé + `@supabase/supabase-js` et `@supabase/ssr` installés.
Côté Supabase : l'organisation GERIMMO est sur plan **Pro (25 $/mois)** ; création du projet
**« Gerimmo V4 »** (`rddlxunppddzpsaatdaz`, eu-west-3, Postgres 17) ; décision humaine :
**supprimer « Gerimmo V3 »** (données perdues, acté — la connaissance métier est dans le wiki)
pour rester à 25 $/mois — suppression à faire par l'humain dans le dashboard (pas d'outil MCP).
`app/CLAUDE.md` créé (conventions de dev + lien wiki→code), `.env.local` (clé publishable),
`.env.example`, exclusion `app/` de l'indexation Obsidian. Vercel : projet à créer au premier
déploiement (racine `app/`).

## [2026-07-27] sprint | Sprint 0 — Socle : identité, isolation, authentification
Démarrage du [[Plan de livraison et sprints|Sprint 0]]. ⚑ Décision de sprint tranchée de fait :
**socle neuf** (nouveau projet Supabase, schéma cible A1 — pas de migration du code V3).
**Base** : migration `socle_identite_isolation` appliquée — types énumérés, 5 tables
(`organizations`, `accounts` miroir de auth.users, `persons` sans référence obligatoire au
compte RM-A1.4, `memberships` avec contraintes RM-A1.1/A1.3/A1.5, `audit_log` dès le S0 pour
RM-A1.11), fonctions d'autorisation stables (`is_super_admin`, `is_active_member`,
`has_org_role`, `log_sa_access`), **RLS + politiques sur les 5 tables**, helpers refusés à
`anon`. **Vérifications en base réussies** : « RLS actif partout » (0 table en défaut) ;
isolation RM-A1.7 (l'admin d'Alpha voit 1 org/1 personne, le super admin voit tout,
l'anonyme rien). **App (Next 16 — nouveautés lues dans les docs embarquées : `proxy.ts`
remplace middleware, APIs async)** : clients Supabase SSR, page /connexion (FR),
`proxy.ts` = garde d'authentification + **sessions par rôle RM-A4.5** (la plus stricte des
adhésions actives, inactivité+absolu), sélecteur d'espace /espaces (entrée directe si
adhésion unique), espace agence (personnes, RLS), console SA (/admin, traversée journalisée
via `log_sa_access` RM-A1.11). **Tests versionnés** (`app/tests/socle.test.ts`, vitest+pg) :
les 2 tests non négociables, auto-ignorés sans `SUPABASE_DB_URL`. **CI GitHub Actions**
(lint, build, typecheck, tests). **Seed de démo** : 2 agences (Alpha, Beta), 4 comptes
(`superadmin@`, `admin.alpha@`, `agent.alpha@`, `admin.beta@gerimmo-demo.fr`), copie dans
`app/supabase/seed.sql` + migration de référence dans `app/supabase/migrations/`.
**Reste (manuel, dashboard Supabase)** : politique de mots de passe 12 caractères +
vérification fuites (RM-A4.3) — non exposée par l'API MCP. MFA super admin : sprint 15.

## [2026-07-28] sprint | Sprint 0 — Revue de code, durcissement RLS, déploiement Vercel
**Revue demandée par l'humain.** Trois défauts corrigés (migration
`socle_durcissement_optimisation_rls`) : (1) **sécurité** — `persons_select` était ouvert
à tout membre actif : un locataire membre aurait vu l'annuaire de son agence → restreint
aux rôles gérants (vérifié en base : locataire = 1 org visible, 0 fiche) ; (2) **perf** —
les politiques appelaient une fonction par ligne (la vigilance du lot 0) → réécriture avec
fonctions stables sans argument de ligne (`user_org_ids`, `org_ids_avec_roles`) évaluées
une fois par requête (InitPlan) ; (3) **privilèges** — écriture `accounts` limitée à la
colonne `mfa_actif`, `audit_log` en lecture seule côté client, `anon` sans aucun privilège.
Côté app : garde de rôle sur /agence (la RLS protège les données, la garde protège la
navigation), cookie d'activité purgé à la déconnexion, test d'isolation étendu au cas
locataire. Seed : compte `multi@gerimmo-demo.fr` à double adhésion (sélecteur d'espaces).
**Déploiement** : app **en production sur Vercel** — https://gerimmo-v4-gerimmo.vercel.app
(projet `gerimmo-v4`, équipe gerimmo, déployé par fichiers via MCP ; à relier au dépôt
GitHub plus tard pour l'auto-déploiement). Recette fonctionnelle transmise à l'humain
(6 scénarios : connexion, isolation Alpha/Beta, rôles, sélecteur, console SA journalisée,
session). La base V4 : 5 tables, RLS partout, 5 comptes de démo, 2 agences.

## [2026-07-28] sprint | Sprint 0 validé en recette + « mot de passe oublié » ajouté au Sprint 1
**Recette fonctionnelle du Sprint 0 déroulée par l'humain : les 6 scénarios passent**
(connexion/accès protégé, isolation Alpha↔Beta dans les deux sens — RM-A1.7, garde de
rôle /admin, sélecteur d'espaces du compte multi, console SA journalisée RM-A1.11,
expiration de session SA 30 min + reconnexion propre RM-A4.5). Sprint 0 terminé au sens
de la définition de « terminé ». **Décision humaine** : la fonctionnalité « mot de passe
oublié » (absente du référentiel V3, constat du 2026-07-28) est **ajoutée au périmètre du
Sprint 1** — flux Supabase Auth (lien email à usage unique, 1 h), réponse neutre sans
énumération de comptes, politique RM-A4.3, invalidation des sessions actives, trace
technique 6 mois ; la mécanique sera réutilisée par la première connexion (16.8) au S11.
[[Plan de livraison et sprints]] mis à jour (périmètre + démo du Sprint 1).

## [2026-07-28] maintenance | Cadence sans dates + design inscrit au plan
Deux décisions humaines intégrées au [[Plan de livraison et sprints]]. (1) **Sprints à durée
variable** : on raisonne en numéros de sprint, plus en dates — dates retirées des 16 titres et
des jalons (recette V0 = fin S9, commercialisable = fin S15) ; un sprint se termine quand sa
démo est validée. (2) **Design en trois niveaux** (proposition agent validée) : design system
figé au S2 (tokens CSS obligatoires — contrainte marque blanche S14, layout de l'espace agence,
responsive de base), maquette rapide validée en début de sprint pour les écrans critiques
(grille d'EDL S4, vue scindée S9, espaces LO/AR), passe d'identité visuelle complète entre la
recette V0 et le S10.

## [2026-07-28] sprint | Sprint 1 — GED, alertes, rétention RGPD, mot de passe oublié
Exécution complète du périmètre validé (8 features). **Base** (4 migrations MCP) : `documents` +
`document_liens` (rattachement multiple sans arborescence, le type pilote — module 12, empreinte
SHA-256 anti-doublon en index unique), `alerts` (3 criticités, escalade nominative en historique
jsonb, fermeture par l'action — module 14), `retention_rules` (**17 règles seedées** de la matrice
A2 avec finalité/déclencheur/sort, dont `document_test` à durée nulle pour la recette de purge),
`tech_log` (6 mois) + `acces_pieces_log` (1 an, alimenté par `log_document_access` definer),
bucket Storage privé (10 Mo, PDF/JPEG/PNG) avec politiques par organisation, purge
`appliquer_retention()` (pg_cron 03h00 + bouton SA) → tombstone « purgé le » + trace audit +
**file `purge_fichiers`** pour la suppression physique via l'API Storage (le DELETE SQL sur
storage.objects est interdit par Supabase — découvert et contourné proprement). **App** : pages
Documents (dépôt type réel vérifié RM-A4.9, filtres RM-12.5.1, liens signés 60 s tracés RM-A4.10)
et Alertes dans l'espace agence, console SA « Journaux et conservation » (règles, journaux, purge
manuelle), flux **mot de passe oublié** (réponse neutre, RM-A4.3, sessions invalidées, trace
tech_log, `/auth/confirm` réutilisable par le 16.8). **Revue/optimisation** : 3 défauts corrigés
(open redirect `next`, extension du nom de téléchargement, course anti-doublon) + 2 correctifs
révélés par les vérifications réelles (politique `ged_select` : le SA doit voir les objets purgés
pour les supprimer — fichier orphelin détecté puis nettoyé ; `lancerPurge` ne marque supprimé que
ce que l'API a confirmé) + advisors (revoke `handle_auth_user_change`, 3 index FK). **Tests** :
19 passants en local (type réel, sessions, API), 11 d'intégration pg (via SUPABASE_DB_URL/CI),
isolation et « RLS actif partout » rejoués en base via MCP (rollback), **purge physique vérifiée
de bout en bout avec un vrai fichier**. Commit `03bcc96`. **Déploiement Vercel : bloqué par le
classifieur de permissions de l'agent — à relancer avec l'accord de l'humain** (l'app est
testable en local : `npm run dev`). Reste manuel (dashboard Supabase) : politique de mots de
passe 12 caractères + protection fuites (confirmée désactivée par l'advisor), et pour le flux
email en production : Site URL + redirect `/auth/confirm` dans Auth → URL Configuration.

## [2026-07-29] sprint | Sprint 1 déployé en production — chaîne GitHub → Vercel opérationnelle
Résolution du blocage de déploiement (le 403 de la veille). Diagnostic : le projet Vercel
`gerimmo-v4` n'avait **jamais été relié à GitHub** (le déploiement S0 était « par fichiers »
via l'intégration, qui a perdu le droit de déployer en production) ; de plus l'intégration
Claude↔Vercel voit un périmètre d'équipe différent de celui du dashboard humain. Remise en
ordre (humain au dashboard, agent au diagnostic et aux déclenchements) : (1) **Root
Directory = `app`** (monorepo : la racine est le wiki, sans package.json) ; (2) **Connect
Git Repository** → GERIMMO/GERIMMO_V4 ; (3) premier build : **500 sur toutes les routes** —
les variables d'environnement du déploiement par fichiers n'avaient jamais été enregistrées
au niveau projet → ajout de NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ;
(4) redéclenchement par commit vide → **Sprint 1 en ligne, confirmé par l'humain**
(lien « Mot de passe oublié ? » visible sur https://gerimmo-v4.vercel.app/connexion).
Péripétie de vérification : le Security Checkpoint anti-bot de Vercel a fini par bloquer les
sondages curl de l'agent (403 « challenge ») — vérification finale au navigateur. **Acquis
durable : chaque push sur `main` déploie désormais automatiquement.** Restent avant la
recette du flux email en prod : Site URL + redirect `/auth/confirm` (Supabase → URL
Configuration), politique 12 caractères + protection fuites (Sign In/Providers), et
décision sur la Deployment Protection du domaine d'équipe (`gerimmo-v4-gerimmo.vercel.app`,
encore derrière SSO — le domaine public `gerimmo-v4.vercel.app` est la référence).

## [2026-07-29] verification | Prérequis Supabase post-Sprint 1 confirmés
L'humain a appliqué au dashboard les 3 réglages manuels restants ; vérification par
l'agent : (1) **politique 12 caractères** — testée en réel sur `/auth/v1/signup` avec un
mot de passe de 8 caractères → rejet 422 `weak_password`, motif `length` (« at least 12
characters ») ; (2) **protection mots de passe fuités** — le même test retourne aussi le
motif `pwned`, et l'advisor « Leaked Password Protection Disabled » a disparu de
`get_advisors` ; (3) **Site URL + redirect `/auth/confirm`** — non vérifiable par API
(config Auth → URL Configuration non exposée) : à confirmer par la recette du flux
« mot de passe oublié » en production (l'email reçu doit pointer vers
`https://gerimmo-v4.vercel.app/auth/confirm`). Advisors sécurité restants : uniquement
les WARN assumés sur les fonctions `SECURITY DEFINER` (helpers RLS + journalisation).

## [2026-07-29] recette | Retours Sprint 1 — téléchargement corrigé, pop-up d'alertes actée, flux email débogué
Recette humaine des scénarios S1/S4/S8 et suites. **Scénario 1** : le téléchargement
cassait la page (« This page couldn't load ») — cause : `window.location.assign()` vers le
lien signé arrachait l'app Next.js ; corrigé par un `<a>` cliqué programmatiquement
(`actions-document.tsx`). **Scénario 4** : nouveau besoin acté au Sprint 2 — pop-up de
synthèse des alertes à la connexion, toutes agences confondues et indépendante du profil
(vision macro → détail → répondre/fermer), badge cloche permanent ; spécification ajoutée
au plan de livraison avec exigences UX/UI. **Scénario 8 (flux email)** : débogage complet —
(1) l'adresse de démo `multi@gerimmo-demo.fr` est rejetée par Supabase (domaine fictif) ;
(2) le service email intégré est limité à 2 emails/heure (429 constatés) → **SMTP
personnalisé inscrit au plan comme prérequis de mise en service réelle**, avec
francisation des modèles (par défaut en anglais) ; (3) le re-clic sur un lien de
réinitialisation consommé semble ouvrir la session existante (bénin a priori) — à
confirmer par une reproduction horodatée, la fenêtre de logs Supabase (100 événements,
~20 min) n'ayant pas couvert le passage réussi. Limite d'observabilité notée : la réponse
neutre (RM-A4.3) masque les échecs d'envoi côté interface ; tracer l'erreur dans
`tech_log` est une amélioration candidate.

## [2026-07-29] recette | GED : fichiers servis par l'app — fin des erreurs « InvalidJWT » en anglais
Retour humain : rouvrir un lien de consultation après 60 s affichait le JSON brut de
Supabase Storage (`InvalidJWT — "exp" claim timestamp check failed`), non personnalisable
car servi depuis leur domaine. Refonte : nouvelle route `GET
/agence/[orgId]/documents/[documentId]/fichier` qui revérifie les droits, trace l'accès
(inchangé : sans trace, pas d'accès) et **sert le fichier elle-même** — l'URL visible est
applicative et stable, un refresh régénère tout en interne, le lien signé ne sort plus
jamais du serveur (RM-A4.10 renforcée). Chaque refresh est retracé (conforme RM-0b.7.5 :
un accès = une trace). Erreurs désormais en pages françaises (403 accès refusé, 404
introuvable, 410 purgé, 500 trace impossible, 502 stockage). `ouvrirDocument` supprimée,
garde `verifierGerant` extraite dans `lib/ged-acces.ts`, boutons remplacés par des liens
(`buttonVariants`, le Button Base UI n'a pas de `asChild`). Lint, build et 19 tests OK.

## [2026-07-29] maintenance | Double build Vercel diagnostiqué + pop-up d'alertes précisée (tous personas)
Deux suites de recette. **Vercel** : l'humain voyait des déploiements partir sur
`next-js-and-shadcn-ui-admin-dashboard` — diagnostic via MCP : ce vieux projet (démo V3,
branché sur le dépôt Gerimmo-V3 jusqu'au 21/07) s'est retrouvé connecté au dépôt
GERIMMO_V4 lors de la remise en ordre du 28/07 ; chaque push déclenche donc deux builds,
celui de `gerimmo-v4` (OK, la prod n'est pas affectée) et celui du vieux projet (ERROR
systématique : ni Root Directory `app` ni variables d'env). Nettoyage côté humain :
Settings → Git → Disconnect sur le vieux projet (voire suppression du projet si la démo
V3 ne sert plus). **Scénario 4 précisé** : la pop-up d'alertes à la connexion concerne
tout utilisateur ayant des alertes, quel que soit son persona (chacun selon ses droits),
agrégation multi-agences le cas échéant — plan de livraison mis à jour.

## [2026-07-30] sprint | Sprint 2 — Le parc : biens, lots, diagnostics, clé, pop-up d'alertes
Exécution complète du [[Plan de livraison et sprints|Sprint 2]], méthodologie S0 confirmée
par l'humain (dev → revues itératives ≤ 3 → tests → déploiement → recette) et **formalisée
dans le plan**. **Base** (3 migrations posées le 29/07 + 2 de revue) : `biens`/`lots`
(lot unique automatique RM-0.1.2, machine à états par trigger, verrouillage du lot loué
RM-0.5.1), `detentions` (quote-parts datées, ≤ 100 % y compris sur les périodes passées,
jamais supprimées), `diagnostics` (bien/lot RM-0.6.2, remplacement = archivage RM-0.8.5,
`lot_blocages_location` : DPE/ERP expiré = mise en location bloquée), `cles_repartition`
(+ lignes, 100,00 % exact, immuables), `equipements_catalogue`/`lot_equipements` (liste
fermée RM-0.5.5), alertes J-90/J-30/J+0 par pg_cron. **App** : espace agence avec layout
définitif (sidebar, en-tête), tableau de bord, pages parc (liste, nouveau, fiche bien,
fiche lot), formulaires (détention, diagnostics pré-remplis par validité, découpage, clé
proposée par mode, équipements), design system en tokens (`warning/success/destructive
-soft`, plus aucune couleur en dur), **pop-up de synthèse des alertes à la connexion pour
tous les personas** (espaces, agence, console SA) + cloche permanente. **Revues (3 it.)** :
(1) advisors → immuabilité des clés au niveau privilège (UPDATE limité à `invalidated_at`)
+ 6 index FK ; (2) relecture à froid (agent indépendant, 16 constats) → **FK composites
`(id, organization_id)`** contre le rattachement inter-agences (constat critique : les
politiques ne contrôlaient que `organization_id`), couverture exacte des lots dans la clé,
interdiction de réactiver une clé invalidée, chevauchements de quote-parts passés, champs
absents du FormData non écrasés (lot loué renommable), date de clôture en Europe/Paris ;
(3) vérification — advisors inchangés, validation SQL en transaction annulée : 26 contrôles
OK. **Tests** : 31 locaux (unitaires parc + non-régression S1 conservée) + suite
d'intégration `sprint2-parc.test.ts` (CI, secret `SUPABASE_DB_URL`). Lint, types, build OK.

## [2026-07-30] sprint | Recette Sprint 2 remise — 9 scénarios au format « persona + étapes → attendu »
Format de scénarios acté avec l''humain (titre, persona avec compte de démo, étapes
numérotées « action → résultat attendu », refus avec message exact). Livrable :
[[Recette Sprint 2 - scenarios]] (`livrables/`) — pop-up d''alertes (tous personas,
multi-agences, console SA), bien → lot unique, démo « bail bloqué par un DPE expiré »,
quote-parts, découpage + clé, équipements, verrouillage du lot loué, machine à états,
isolation, rappel non-régression S1.

## [2026-07-30] recette | Retours Sprint 2 — jointures PostgREST réparées, dépôt du rapport PDF, ergonomie bien
Retour humain : biens créés mais introuvables, pas de PDF au dépôt de diagnostic, adresse
non assistée, découpage proposé pour un appartement. **Cause racine du bug bloquant** : les
FK composites de la revue 2 ont créé une seconde relation biens↔lots et detentions↔persons —
PostgREST refusait les jointures imbriquées (PGRST201) et la liste du Parc revenait vide
(les biens existaient, prouvé par l''API). Correctif : jointures explicites
(`lots!lots_bien_id_fkey`, `persons!detentions_person_id_fkey`). **Ergonomie** : rapport du
diagnostiqueur déposable (helper GED partagé `lib/ged-depot.ts` — type réel, anti-doublon,
lien « Rapport » tracé), date de réalisation pré-remplie à aujourd''hui, autocomplétion
d''adresse (Base Adresse Nationale), appartement/parking non découpables (carte masquée +
garde serveur). **Vérification post-correctif** : 21 requêtes de pages (agent + SA) jouées
contre l''API de prod → toutes OK ; 16 contrôles métier en transaction annulée → OK ;
31 tests locaux + CI verte ; nouveau déploiement confirmé en prod. Leçon actée : toute
revue qui touche le schéma doit rejouer les requêtes PostgREST des pages (les FK multiples
cassent les jointures implicites) — et les parcours écran restent à valider par l''humain.

## [2026-07-31] recette | Retour S2 — validation du bien exposée sur la fiche bien
Retour humain : « je ne peux enregistrer les biens qu''en brouillon, pas de possibilité de
les valider ». Diagnostic : pas un bug — le bien n''a pas de statut, la machine à états vit
sur `lots.etat`, et l''action « Passer en disponible » (avec la checklist des blocages
`lot_blocages_location`) n''existait que sur la **fiche lot**, que personne n''ouvre en
mono-lot (~90 % des cas). Correctif (ergonomie, zéro migration) : la carte des lots de la
**fiche bien** affiche désormais, pour chaque lot, l''encart « Ce qui empêche la mise en
location » (si brouillon) et les boutons de transition — réutilisation telle quelle de
`BoutonsEtatLot` et de l''action `changerEtatLot`. Vérifié : RPC `lot_blocages_location`
rejouée en prod (blocages explicites retournés : détention 0 %, DPE/ERP absent — la
situation exacte du recetteur) ; lint, types, build, 31 tests locaux OK. Scénarios 3 et 4
de [[Recette Sprint 2 - scenarios]] mis à jour (mise en location depuis la fiche bien).
Déploiement confirmé : gerimmo-v4.vercel.app sert le commit du correctif (READY).

## [2026-07-31] decision | Découpage d'un bien avec lot loué — contradiction V3 vs RM-0.3.8 tranchée (interprétation B)
Le module 0 opposait la variante **V3** (découpage autorisé, le lot loué garde son bail, nouveaux lots en brouillon) et **RM-0.3.8** (« lot loué non redécoupable »). Arbitrage humain : les deux visent des opérations distinctes — RM-0.3.8 interdit de scinder le **lot** loué, V3 autorise de découper le **bien**. Le code `decouper_bien` bloquait tout dès qu'un lot était loué → **corrigé** (migration `20260731_sprint2_decoupage_bien_avec_lot_loue_v3.sql`) : le blocage total est levé, le lot loué n'est jamais modifié. Test S2 adapté (le découpage réussit, le lot loué garde son état, le nouveau lot naît en brouillon) ; page [[Lot]] complétée (V3 remise à côté de RM-0.3.8). Suivi : alerte « régularisations en cours » (V3) à implémenter. **Migration à appliquer en prod après validation humaine.**

## [2026-07-31] sprint | Sprint 2 terminé — migration V3 en prod, suite de tests 49/49 verte
Migration `decouper_bien` V3 **appliquée en prod** (interprétation B). Corrections de la suite de tests d'intégration (jusque-là faussée par la prod) : (1) helper `insererDocument` — cast `$1::uuid::text` (bug de type PostgreSQL) ; (2) test alertes diagnostics — tri déterministe J-90→J-30→J+0 ; (3) test journal d'accès — savepoints autour des erreurs attendues ; (4) test socle `anon` — aligné sur le durcissement (anon révoqué = permission denied, plus strict que RLS) ; (5) test isolation API — robuste à la dérive démo (fiche « Le, Proprio » ajoutée en recette le 31/07, non supprimée). Résultat : **7 fichiers, 49 tests verts**.

## [2026-07-31] revue | Revue S0/S1/S2 — advisors Supabase (sécurité + performance)
**Sécurité (11 WARN)** : fonctions `SECURITY DEFINER` exécutables par le rôle `authenticated` via `/rest/v1/rpc/` (helpers RLS, journaux, purge, génération d'alertes). Révoquées de `public`/`anon` mais pas de `authenticated`. À durcir (révoquer `authenticated` ou déplacer les helpers hors schéma exposé) — relève du **Sprint 15 (durcissement production)** ; `org_membres_gerants` et les fonctions de log à regarder plus tôt. **Performance (INFO)** : 10 clés étrangères sans index couvrant (mineur, base vide) ; ~15 index « inutilisés » (faux signal : base de démo quasi vide) ; stratégie de connexions Auth en absolu. Rien d'urgent.

## [2026-07-31] sprint | Sprint 3 (incrément 1) — Fondation du mandat de gestion
Tables `mandats` (mandant, état brouillon→résilié, date de rapport défaut 10, seuil de délégation surchargeable) + `mandat_lignes` (un lot, taux d'honoraires défaut 7 %). Règles en base : lot détenu par le mandant uniquement (RM-5.1.1), un seul mandat actif par lot (RM-5.1.3, trigger), intégrité inter-org (FK composites), RLS par agence (rôles gestion ; le mandant PM n'a pas d'accès), trigger de contrôle non appelable en direct (leçon advisor S2), index couvrant les FK. **Migration appliquée en prod** (`20260731_sprint3_mandat_gestion_fondation.sql`). Test `sprint3-mandat.test.ts` : 5/5 (mandat 3 lots, taux défaut, lot du mandant, unicité mandat actif, isolation). **Suite totale : 54 tests verts.** Reste S3 : dossier locataire versionné, garant, attestation d'assurance + espace LO, invitations, UI.

## [2026-07-31] sprint | Sprint 3 (incrément 2) — Dossier locataire versionné + garant
Versioning des pièces : colonne `documents.remplace_id` (une pièce remplace une version antérieure) + fonction `dossier_personne(person)` (SECURITY INVOKER, respecte la RLS → « le mandant ne voit aucune pièce » RM-0b.7.4) renvoyant les pièces courantes (non remplacées). Le garant est une personne à part entière (RM-0b.3.1), couvert par le même mécanisme. Migration `20260731_sprint3_dossier_locataire_versionne.sql` en prod. Test `sprint3-dossier.test.ts` : 2/2 (version courante seule affichée, tout conservé ; plusieurs catégories coexistent). **Suite : 56 tests verts.**

## [2026-07-31] sprint | Sprint 3 (incrément 3) — UI agence : personnes, dossier, mandat
Écrans construits (App Router, design system S2) : liste des personnes + création (doublon nom+naissance alerté non bloquant, email modifiable) ; fiche personne avec **dossier versionné** (dépôt de pièces, versions, ouverture) et **mandats** (création brouillon, ajout de lots avec taux, transitions d'état brouillon→à signer→actif→préavis→résilié). Actions serveur `personnes.ts` / `mandats.ts` / `dossier.ts` ; entrée « Personnes » dans la nav agence. Build de prod OK, typecheck OK, 56 tests toujours verts. **Reste S3** : espace locataire (attestation d'assurance + dépôt LO, alertes J-30/J-15/J+0/J+15) et invitations LO — nécessitent la création de l'espace locataire (nouvelle zone auth).

## [2026-07-31] sprint | Sprint 3 (incrément 4) — Attestation d'assurance (backend + dépôt agence)
Colonne `documents.expire_le` + fonction `generer_alertes_assurance()` (cron/SA) créant les alertes aux 4 seuils J-30 (informative, rappel locataire) / J-15 (normale, relance agence) / J+0 (critique, défaut constaté) / J+15 (critique, résiliation possible), version courante uniquement, idempotente, chaque alerte conservée comme preuve (RM-0b.6.2). Migration `20260731_sprint3_attestation_assurance.sql` en prod. Le dépôt de pièce (dossier) capture désormais la date d'expiration → attestation testable dès maintenant côté agence. Test `sprint3-attestation.test.ts` : 2/2. **Suite : 58 tests verts.** Reste S3 : espace locataire (dépôt LO en propre) + invitations (comptes LO).

## [2026-07-31] sprint | Sprint 3 (incrément 5) — Espace locataire (naissance)
Nouvelle zone d'auth `/locataire/[orgId]` : garde `verifierAccesEspaceLocataire` (adhésion locataire + fiche), layout dédié, accueil avec statut d'assurance et **dépôt de l'attestation par le locataire lui-même** (RM-0b.5.1). Accès contrôlé sans RLS large : fonctions SECURITY DEFINER `mon_dossier_locataire` (lecture) et `deposer_mon_attestation` (dépôt du document + liens pour sa propre fiche), + policy stockage locataire (upload dans son agence) + policy `persons_select_locataire` (lecture de sa fiche). Routage des locataires depuis `/espaces`. Migration `20260731_sprint3_espace_locataire.sql` en prod. Compte de démo `locataire.alpha@gerimmo-demo.fr` (mdp Gerimmo-Demo-2026, agence Alpha, fiche Leblanc Julie) créé + ajouté au seed. Build + typecheck OK, 58 tests verts. **Reste S3 : invitations (création de comptes LO par l'agence) + test runtime du dépôt (upload storage).**

## [2026-07-31] sprint | Sprint 3 (incrément 6) — Invitations locataire + S3 COMPLET
Fonction SECURITY DEFINER `inviter_locataire(org, person)` réservée aux gérants : crée le compte auth (mdp aléatoire), l'adhésion locataire et rattache la fiche ; l'action agence envoie ensuite l'email de définition du mot de passe (même flux que « mot de passe oublié »). Bouton « Inviter comme locataire » sur la fiche personne (état du compte affiché). Migration `20260731_sprint3_invitation_locataire.sql` en prod. Test `sprint3-invitation.test.ts` : 2/2. **Sprint 3 terminé côté backend + UI : personnes, dossier versionné, garant, mandat, attestation, espace locataire, invitations. Suite : 60 tests verts, 7 migrations S3 en prod.** Reste (hors périmètre livrable, connu) : configuration SMTP Resend pour l'envoi réel des emails d'invitation (item ouvert depuis S1), et validation runtime du dépôt d'attestation (upload storage) au clic.

## [2026-07-31] sprint | Sprint 4 (incrément 1) — Fondation du bail
Tables `baux` (lot, type nu/meublé/colocation, état brouillon→actif→préavis→terminé, locataire principal, loyer/charges/dépôt, jour d'échéance, PDF signé) + `bail_personnes` (colocataires solidaires, garants portés par le bail). Fonction `activer_bail` : contrôles amont (PDF signé requis, lot « disponible », `lot_blocages_location` vide = détention 100 % + diagnostics valides) → bail actif → lot loué → alerte EDL d'entrée. RLS par agence, intégrité inter-org (FK composites). Migration `20260731_sprint4_bail_fondation.sql` en prod. Test `sprint4-bail.test.ts` : 4/4 (activation, refus sans PDF, refus diagnostic expiré, isolation). Reste S4 : EDL (grille, photos, signature, comparatif), congés, consultation LO, UI.

## [2026-07-31] sprint | Sprint 4 (incrément 2) — État des lieux (EDL) : fondation
Tables `etats_des_lieux` (bail, type entrée/sortie, état brouillon/signé, un EDL d'entrée + un de sortie par bail) + `edl_lignes` (catégorie, libellé, état neuf/bon/usagé/mauvais/absent, commentaire, photo). Fonctions : `generer_grille_edl` (grille depuis le lot : 7 éléments standard + équipements cochés), `signer_edl` (refuse si une ligne est sans état — RM ; grille non vide ; fige), trigger `edl_lignes_fige` (RM : figé dès signature — plus aucune modif des lignes). RLS par agence, intégrité inter-org. Migration `20260731_sprint4_edl_fondation.sql` en prod. Test `sprint4-edl.test.ts` : 4/4. Reste S4 : comparatif entrée/sortie, congés, consultation LO du bail, UI (bail + grille d'EDL).

## [2026-07-31] sprint | Sprint 4 (incrément 3) — Comparatif EDL + congés
Fonction `comparatif_edl(bail)` (jointure entrée/sortie par libellé, écarts d'état en évidence). Congés : table `conges` + fonction `enregistrer_conge` (locataire/bailleur, date de première présentation, préavis 1-3 mois, **justificatif obligatoire si préavis réduit**, calcul de la date d'effet → bail en préavis + date_fin). Migration `20260731_sprint4_comparatif_conges.sql` en prod. Test `sprint4-comparatif-conges.test.ts` : 2/2. **Backend S4 complet.** Reste : UI (création de bail, grille d'EDL interactive, comparatif) + consultation LO.

## [2026-07-31] sprint | Sprint 4 TERMINÉ — UI bail + EDL + consultation locataire
UI construite : sur la fiche lot, carte « Baux & état des lieux » (création de bail : type, locataire, loyer, charges, dépôt, échéance). Fiche bail dédiée (`/agence/[orgId]/baux/[bailId]`) : dépôt du bail signé (PDF), **activation** (contrôles en base → lot loué + alerte EDL), **congé** (préavis, date d'effet), liste des EDL + **comparatif entrée/sortie** (écarts en évidence). Grille d'EDL interactive (`/baux/[bailId]/edl/[edlId]`) : état par ligne (neuf/bon/usagé/mauvais/absent) + commentaire, enregistrement en bloc, **signature** (refus si une ligne sans état) puis figée. Espace locataire : section « Mon bail » (consultation du bail signé, fonction `mon_bail_locataire`). Migration `20260731_sprint4_consultation_bail_locataire.sql` en prod. Build + typecheck OK, 73 tests verts. **Sprint 4 complet côté backend ET UI.**

## [2026-08-01] ingest | bailpdf.com — reverse-engineering des documents locatifs
Ingestion du site [[2026-08-01-bailpdf-com|bailpdf.com]] (16 documents types) pour cadrer la **génération de documents** de Gerimmo, sous contrainte forte de l'humain : **tout doit être remplissable via le bot WhatsApp → maximum d'automatisation**. Chaque champ classé **AUTO** (déjà dans Gerimmo) ou **ASK** (question du bot). Synthèse créée : [[Documents a generer et automatisation WhatsApp]] — catalogue, données manquantes (identifiant fiscal, zone tendue, compteurs, clés, inventaire mobilier, quotes-parts colocation, IRL…), et **surface de questions minimale** pour le bot. Contradictions signalées : plafond de dépôt dynamique, blocage DPE G, non-rétroactivité IRL, texte légal exact du cautionnement (réforme 2022), insuffisance de `baux.locataire_principal` pour la colocation. **Décision actée (garant)** : loi + pratique — garant nominatif d'un colocataire, solidarité étendue si clause, plafonnée 6 mois après départ (ALUR). Pages touchées : [[Bail]], [[État des lieux]], [[Garantie]], [[Diagnostic]].


## [2026-08-03] synthese | Charte visuelle de l'espace agent
Le fichier V3 `03-design-system.md` (immuable, sections « à compléter ») est complété
dans le wiki : [[Charte visuelle de l'espace agent]]. Six patterns validés par la
recette du 2026-08-02 (bandeau « À faire maintenant », sections repliées + pastille ⚠,
lignes actionnables, questionnaire progressif, proposé/validé en un clic, alerte =
obligation non tenue), états d'interface (vide qui guide, erreur visible à côté du
bouton, chargement), formats (dates françaises, montants virgule, retards en rouge),
accessibilité (vrais boutons, pas de form imbriqué, confirmations destructives).
Sert de référence à la tranche 1 des améliorations visuelles et aux écrans S7.

## [2026-08-05] ingest | BailPDF — Contrat de bail (panorama des modèles et cadre légal)
Source : https://bailpdf.com/contrat-de-bail (Selectra), déposée en
`raw/bailpdf-contrat-de-bail.md` + 2 modèles PDF en `raw/assets/`. Site de
vulgarisation — à recouper avec Légifrance avant tout gravage dans le modèle 1.16.
**Créé** : [[2026-08-05-bailpdf-contrat-de-bail]] (source), [[Types de baux]]
(panorama des 10 régimes, périmètre V3 vs hors périmètre),
[[Mentions obligatoires du bail]] (8 rubriques du décret 2015-587 + ajouts 2024 du
décret 2023-796), [[Clauses abusives et clauses résolutoires]] (9 non écrites,
4 admises). **Mis à jour** : [[Bail]], [[Dépôt de garantie]],
[[Restitution du dépôt de garantie]], [[Diagnostic]] (calendrier passoires : G interdit
2025, F 2028, E 2034), [[Révision annuelle IRL]], [[Garantie]], [[Quittance conforme]].
**Deux trous repérés** (callouts posés) : l'identifiant fiscal du logement et le bloc
DPE/passoires (obligatoires depuis le 1/1/2024) sont absents des mentions du module 1
et sans champ au lot ; la création de bail n'est pas bloquée/alertée sur DPE G malgré
l'interdiction de louer depuis 2025. À vérifier sur Légifrance puis arbitrer.

## [2026-08-05] ingest | BailPDF — Modèle de contrat de bail non meublé (PDF)
Formulaire officiel du modèle-type (décret 2015-587) téléchargé depuis bailpdf.com,
`raw/assets/contrat-bail-non-meuble.pdf` (texte extrait via pdftotext). Bien plus
fiable que l'article : c'est le modèle-type quasi brut. **Créé** :
[[2026-08-05-bailpdf-modele-bail-non-meuble]] (source),
[[Structure du modèle-type de bail]] — les **11 sections du formulaire, champ par
champ, mappées sur le modèle de données Gerimmo** : le blueprint demandé par l'humain
pour le générateur de baux (1.16). **Mis à jour** : [[Bail]],
[[Mentions obligatoires du bail]] (l'identifiant fiscal figure bien dans le formulaire
officiel — trou du module 1 confirmé), [[Clauses abusives et clauses résolutoires]]
(clause résolutoire exacte : troubles sur décision de justice, assurance pour compte),
[[Diagnostic]] (calendrier décence outre-mer : F 2028, E 2031),
[[Régularisation des charges]] (forfait possible uniquement en colocation pour un bail
vide — restriction absente du module 3), [[Types de baux]] (durée réduite ≥ 1 an).
**7 champs du formulaire sans équivalent Gerimmo** listés dans la page structure
(identifiant fiscal, complément de loyer, durée réduite, réévaluation sous-évaluation,
section travaux, assurance colocataires, descriptifs du bien). **Reste à ingérer** :
le modèle meublé (`contrat-bail-meuble-1.pdf`) pour l'inventaire mobilier.

## [2026-08-05] ingest | BailPDF — Modèle de contrat de bail meublé (PDF)
Troisième source bailpdf.com : `raw/assets/contrat-bail-meuble-1.pdf`, le formulaire
officiel du bail meublé. **Constat clé : même squelette de 11 sections que le modèle
vide** — le générateur 1.16 peut être un gabarit unique à variantes. **Créé** :
[[2026-08-05-bailpdf-modele-bail-meuble]] (source, lue en diff du modèle vide).
**Mis à jour** : [[Structure du modèle-type de bail]] (tableau des variantes
vide/meublé sur 4 sections : durée, forfait de charges, dépôt, annexes — blueprint
désormais complet pour le périmètre V3), [[Bail]] (reconduction 1 an hors étudiant,
inventaire mobilier = annexe légale), [[État des lieux]] (inventaire + état détaillé
du mobilier à la remise des clés), [[Régularisation des charges]] (forfait libre en
meublé vs colocation seule en vide), [[Types de baux]] (bail étudiant jamais reconduit),
[[Dépôt de garantie]] (montant en toutes lettres). Aucune contradiction. La liste des
meubles du décret 2015 n'est pas dans le formulaire — l'inventaire structuré Gerimmo
est plus exigeant, dans le bon sens. Les 3 sources bailpdf sont ingérées.

## [2026-08-05] maintenance | Réconciliation git des deux postes de travail
Constat : le poste Windows était resté sur le commit du 31/07 (fin des retours recette
S2) pendant que l'autre poste avançait jusqu'au 03/08 — 79 commits d'écart, couvrant
les sprints 3 à 6 complets, le S8 partiel (dépôt, restitution, copropriété), une
recette autonome S0→S6 (16 anomalies corrigées) et la charte visuelle. Réconciliation :
travail local du 05/08 commité sur branche `ingest-bailpdf-2026-08-05`, `main` avancé
sur `origin/main`, fusion avec résolution des conflits (double ingestion bailpdf des
01/08 et 05/08 : les deux conservées, journal chronologique, renvois croisés entre
pages sources). **Décision humaine actée : la recette autonome ne vaut pas validation
— une recette humaine complète S3→S8 sera déroulée** (scénarios en préparation),
avec non-régression S0–S2 et revérification des 16 anomalies. Règle de travail :
`git pull` en début de session sur chaque poste.

## [2026-08-05] recette | Scénarios de recette humaine S3→S8 remis
Suite de la réconciliation : poste remis en état (npm install, lint 0 erreur,
typecheck OK après build, build Next vert, tests unitaires 72/72 — les 66 tests
d'intégration se sautent sans SUPABASE_DB_URL sur ce poste, garde-fou anti-prod
vérifié). Advisors Supabase relevés : 63 WARN sécurité (fonctions SECURITY DEFINER
exposées, dont 12 appelables anonymement — au backlog S15, inscrites à la vigilance),
1 WARN perf (double policy SELECT sur persons), le reste = bruit sur base quasi vide.
Branche Supabase de recette payante : déjà supprimée (vérifié). **Livré** :
[[Recette S3-S8 - scenarios]] — 24 scénarios en 7 blocs (non-régression S0-S2, S3
personnes/dossier/mandat, S4 bail/EDL/congés, S5 loyers/quittances/IRL, S6
comptabilité/export, S8 dépôt/restitution/copro, transverse charte+isolation), avec
messages de refus exacts tirés des migrations et matrice de couverture des 16
anomalies de la recette autonome. La validation des sprints 3→8 attend le déroulé
humain de ces scénarios.

## [2026-08-08] recette | Retours bloc 0 + S3 — bloc 0 validé, diagnostic des remarques

Bloc 0 (non-régression S0–S2) : **validé** par l'humain (0.1, 0.2, 0.3 OK).
Remarques S3 traitées : bug de clôture d'une détention à date de début future
(contrainte `detentions_check` remontée en jargon SQL — corrigé : message clair
orientant vers « Corriger ») ; doublon inter-agences confirmé **voulu**
(isolation multi-tenant, détection nom + date de naissance dans la même agence
seulement) ; lien locataire→lot = le bail (S4) ; propriétaire = locataire à
trancher (avertissement non bloquant proposé, en attente).

## [2026-08-08] ingest | Maquette — prototype cliquable (charte v2)

L'humain livre `gerimmo-prototype.html` (copié dans `raw/maquettes/`), désigné
référence de la charte graphique. Page source créée, synthèse
[[Charte visuelle de l'espace agent]] marquée supplantée (palette encre
bleue/laiton/crème, Instrument Sans remplace Jost).

## [2026-08-08] sprint | Charte v2 appliquée (bloc 0 → S3) + refonte des alertes

Appliqué dans `app/` : jetons globals.css, bandeau encre + nav laiton, connexion
en deux volets, espaces, tableau de bord (KPI à jauges), alertes, puces de
statut du parc. Refonte alertes (retour recette) : assignation obligatoire (≥ 1
personne), « Tout le monde » réservé au responsable, alertes confiées à
d'autres grisées en bas et intouchables (le responsable peut réassigner),
modale Confier/Traiter avec message obligatoire, pop-up de connexion limitée à
« mes alertes » avec bouton Fermer unique, KPI « À traiter » calculé sur mes
alertes. Migration `alertes_assignation_obligatoire` appliquée (Supabase).
Typecheck, lint, tests (72 ✓), build ✓, vérification visuelle locale ✓.

## [2026-08-08] sprint | Règles Personnes et Parc (retour recette) + assistant maquette

Personnes : nom, prénom (sauf raison sociale) et **email obligatoires** ;
**email unique par agence** (index en base, doublon de test archivé — jamais
supprimé) ; création refondue en **assistant 2 étapes** façon maquette (rôle →
identité, avance auto, retour possible, rattachement facultatif d'un lot avec
recherche pour le propriétaire mandant → détention 100 %). Parc : la création
inline d'un propriétaire depuis la fiche lot exige l'email (fiche « propriétaire
mandant ») ; espace propriétaire bailleur → bloc « Propriétaires du lot »
masqué, détention posée automatiquement sur sa propre fiche à la création du
bien. Interprétation à valider : le rattachement locataire/garant passe par le
bail (S4) — l'assistant l'explique au lieu de proposer un lien mort.
Migration `persons_email_unique` appliquée. Typecheck, lint, tests, build ✓.

## [2026-08-08] recette | Reste à tester S3→S8 réorganisé par persona

Suppression de `Clippings/` (4 captures ratées du web clipper, 33 octets chacune,
doublons de sources bailpdf.com déjà ingérées). Rédaction de
`livrables/Recette S3-S8 - reste a faire par persona.md` : bloc 0 validé exclu,
re-vérifications des correctifs du 08/08 ajoutées (R1→R5 : assistant 2 étapes,
email unique, clôture de détention, propriétaire inline, refonte alertes),
scénarios S4→S8 + transverse repris avec la numérotation du 05/08, filtrés en
5 sections : agent.alpha@, admin.alpha@, locataire.alpha@, admin.beta@, multi@.
Deux décisions à trancher pendant la recette : propriétaire = locataire,
rattachement locataire/garant via le bail.

## [2026-08-08] recette | Document remplacé : tests SMART par sprint et persona

À la demande de l''humain, le document « reste à faire par persona » est remplacé
par `livrables/Recette S3-S8 - tests par sprint et persona.md` : organisation
itérative sprint par sprint (étape correctifs alertes, puis S3, S4, S5, S6, S8,
transverse), personas à l''intérieur de chaque sprint, scénarios SMART au format
« action → résultat attendu » avec messages de refus exacts et « test le plus
important » signalé par sprint. Index mis à jour.

## [2026-08-13] recette | Retours étape C + Sprint 3 — 8 sujets traités, correctifs livrés

Retours de recette humaine (étape correctifs + Sprint 3). C2/C3/C4/C5.1-3/C5.5
validés. Traitement des 8 sujets remontés :
- **C.1 (KO)** : le champ « message » n''existait pas dans « Confier » — ajouté,
  obligatoire (UI + serveur), historisé dans les escalades. Destinataire déjà
  doublement gardé (required + serveur), à re-vérifier en recette.
- **C5.4 (KO)** : liste de lots vide dans l''assistant — cause prouvée (HTTP 300
  PGRST201 : deux FK lots→biens rendent la jointure PostgREST ambiguë, erreur
  avalée). Remplacée par deux requêtes plates.
- **C6.1 (conforme)** : l''index unique (agence, email) existe et tient ; le cas
  Alpha/Beta au même email est le comportement voulu (unicité PAR agence).
- **C6.2 (KO confirmé en base)** : deux « Francois Jean » identiques créés sans
  alerte. La détection ne comparait que le nom — désormais nom + prénom, dans
  les deux sens (inversion), accents/casse ignorés, archivées exclues.
- **C7.1 (pas d''anomalie)** : la clôture de la détention future (Quincy) a bien
  été refusée — date_fin reste null en base, rien d''incohérent.
- **C.8** : création du propriétaire depuis la fiche lot passée en pop-up ;
  ajout de « Modifier la fiche » (nom, prénom, email, date de naissance, tél.)
  qui manquait entièrement.
- **3.2** : l''UI n''offrait aucun dépôt de « nouvelle version » (remplace_id
  jamais posé → « CNI » et « CNI 2 » côte à côte). Ajout du bouton par pièce +
  historique consultable + numéro de version.
- **3.3** : mandat résilié verrouillé « historisé » — triggers en base
  (20260813_mandat_resilie_historise + correctif anti-re-parentage), gardes
  serveur (transitions légales uniquement), rendu grisé, taux et lots lisibles
  même si la détention est close.
Revue de code : 6 défauts corrigés (concurrence escalades/mandats, prénom
effaçable, pop-up clavier/fond). Test d''immuabilité du mandat résilié ajouté à
la suite. Lint/build/tests OK (suite SQL sautée : pas de SUPABASE_DB_URL sur ce
poste). Déployé sur Vercel via push.

## [2026-08-13] recette | Livrable mis à jour : suivi du 13/08 et re-tests

`livrables/Recette S3-S8 - tests par sprint et persona.md` : ajout d''un bloc
« Suivi au 13/08 » (validés / correctifs livrés / re-tests, tableau retour →
correctif) ; scénarios annotés ✔ (C.2-C.4, C.5.1-3+5, C.7, 3.3.3-4, 3.2.1+3) ou
⟳ Re-test (C.1, C.5.4, C.6, C.8, 3.2.2) ; C.6 précise l''unicité PAR agence et
le test d''inversion nom/prénom ; C.8 réécrit (pop-up + modification de fiche) ;
3.2.2 passe par « Déposer une nouvelle version » ; 3.3 gagne l''étape 5 (mandat
résilié historisé). Fiches de test en double du 13/08 listées à archiver.

## [2026-08-13] recette | Livrable recentré : seuls les sujets en cours

À la demande de l''humain, le livrable ne garde que ce qui reste à faire :
étape 1 = les 6 re-tests des correctifs du 13/08 (C.1, C.5.4, C.6, C.8, 3.2.2,
3.3.5) avec leurs encadrés « ce qui a changé », puis 3.4/3.5, sprints 4→8,
transverse et décisions à trancher. Les scénarios validés (bloc 0, C.2-C.4,
C.5.1-3+5, C.7, 3.2.1+3, 3.3.1-4) sortent du document — l''historique reste
dans git (b14f4fe) et dans ce journal.

## [2026-08-14] recette | Recette automatisée des 6 re-tests + 2 anomalies corrigées + maquette

Recette automatisée en conditions réelles (session agent.alpha, navigateur) sur
les 6 re-tests du 13/08 — ne vaut pas validation humaine :
- C.1, C.5.4, C.6.1, 3.3.5 ✔ ; C.8 ✔ (pop-up + modification de fiche).
- **Anomalie 1 (3.2.2)** : « Déposer une nouvelle version » créait encore un
  document indépendant — l''update posant remplace_id est interdit en base
  (documents immuables, « permission denied »). Corrigé : remplace_id/expire_le
  passés À L''INSERTION (ged-depot + dossier.ts) ; re-testé : badge v2 +
  historique sur la pièce d''Alice Dupont.
- **Anomalie 2 (C.6.2)** : la détection doublon fonctionnait mais son
  avertissement était démonté par le repli de l''assistant vers l''étape 1 —
  la vraie cause du « aucune alerte » du 13/08. Corrigé : message affiché hors
  étape, typé avertissement (orange).
Ajouts : action « Archiver la fiche » (gardes : détention/mandat/bail/compte)
— les 4 fiches doublons d''Alpha archivées via l''UI (« jean luc » reste chez
Beta) ; section « Lots détenus » sur la fiche personne.
Maquette charte v2 appliquée (rapport maquette ↔ écrans) : Personnes (colonne
à rangs + avatars + puces + compteur), Parc (tete-groupe par bien + rangs de
lots + bouton laiton + fin du conflit badge-statut/puce), Tableau de bord
(4e KPI « Encaissé » avec jauge de quittancement), classes maquette ajoutées à
globals.css (rang, avatar, tete-groupe, rang-lot, colonne-liste, vide, btn-or,
entete-page). Reste maquette (proposé) : layout maître-détail .split, donuts
de répartition, barres de complétude des lots, assistant plein écran.
Données de test créées : « Recette Mandant » (détention 100 % Lot 1 Calvisson),
« Testy 4 » confiée à admin.alpha@ (test C.1). Livrable annoté.

## [2026-08-14] synthese | Audit de cohérence maquette ↔ application + alignements

À la demande de l''humain (« pas de surprise, pas 50 recettes ») : comparaison
ligne à ligne du prototype HTML (raw/maquettes) avec les écrans Tableau de
bord, Parc et Personnes. Alignements livrés dans la foulée :
- Tableau de bord : KPI Occupation en % (le chiffre est le taux, comme la
  maquette), Encaissé en bleu avec « x % du quittancement du mois », Documents
  en 4e tuile neutre ; rangée graphique ajoutée — donut « Répartition du
  parc » + barres « Encaissements et dépenses » 6 mois (SVG pur,
  src/components/graphes.tsx, écritures réelles).
- Parc : passage au maître-détail .split de la maquette — colonne de liste
  sticky (tete-liste) + aperçu du parc à droite (KPI Occupation/À finaliser/
  Quittancement, donut, carte « Éléments à compléter » par motif de blocage).
- Personnes : tete-liste (compteur) sur la colonne.
- globals.css : entete-carte, lien-discret, tete-liste, bloc-graph.
Synthèse wiki créée : [[Coherence maquette-application]] — conformités +
**tableau des 16 écarts assumés** (recherche globale, incidents, articles,
complétude des lots, panneau in-page, sous-onglets, assistant plein écran,
carte « À vérifier », Card shadcn…) avec 4 points à trancher. Règle de
recette : un écran qui ne colle ni à la maquette ni à ce tableau = anomalie.
Lint/build/tests OK. Déployé via push.

## [2026-08-19] query | Où est la notion de propriétaire bailleur ? Son « arrivée » semble oubliée
Réponse : la notion vit dans [[Propriétaire bailleur]] (persona bien développé, scission
PM/PD, audit soldé). En revanche l'intuition est juste sur l'arrivée : le module 16 V3
ne décrit que la création d'agence par le super admin (16.1) et les invitations —
aucun parcours d'arrivée du PD (qui crée son organisation `independent_owner`, quand,
essai/abonnement, lien avec la grille 1ᵉʳ bien gratuit). Seule trace : le callout
« Divergence code ↔ V3 » de [[Onboarding et abonnement]], centré sur l'agence.
Lacune signalée à l'humain ; à ajouter au besoin dans [[Récapitulatif fonctionnel et
lacunes de spécification]] / [[État du projet et décisions ouvertes]].

## [2026-08-19] decision | Exclusivité PD / PM assumée + lacune onboarding PD actée
Décision humaine : une même personne ne peut pas être à la fois propriétaire gestion
directe et propriétaire mandant (pas de parc mixte partiellement confié) — angle mort
connu et **accepté pour le moment** ; la bascule d'adhésion (cas n°5 d'A1) reste le
seul mécanisme. Acté dans [[Propriétaire bailleur]], [[Compte, personne et adhésion]]
et [[État du projet et décisions ouvertes]]. Dans la foulée, la lacune « arrivée du
PD » (qui crée l'organisation `independent_owner`, essai/Stripe — module 16 muet)
est rouverte comme arbitrage à trancher avant les sprints 9 et 11 : callout ajouté
dans [[Onboarding et abonnement]] + entrée dans [[État du projet et décisions ouvertes]].

## [2026-08-19] decision | Arrivée du PD tranchée : auto-inscription en ligne
L'arbitrage rouvert le matin même est clos par l'humain : le propriétaire gestion
directe s'inscrit **seul en ligne** (page publique → compte + organisation
`independent_owner` → essai 14 j → abonnement par bien Stripe), sans circuit
commercial ni super admin. Acté dans [[Onboarding et abonnement]] (nouvelle section),
[[Propriétaire bailleur]], [[État du projet et décisions ouvertes]] (« plus aucun
arbitrage en attente », 2026-08-19) et le plan de sprints (S11, livrables). Plus
aucun point ouvert sur ce persona : exclusivité PD/PM assumée + arrivée spécifiée.

## [2026-08-19] decision | Priorisation du PD : scission du sprint 9 (9a dédié, 9b transverses)
Le PD est « le cœur de l'appli » : à l'image du sprint dédié aux incidents (S7),
le S9 est scindé. **S9a — Propriétaire direct** en premier : auto-inscription en
ligne (remontée du S11, essai 14 j, Stripe restant au S11), espace complet,
livre recettes-dépenses, récap fiscal — démo « un PD s'inscrit seul et gère de
bout en bout ». **S9b — Administration et transverses** ensuite : rôles V3,
paramétrage, agenda, messagerie, vue scindée, console SA. Plan de sprints mis à
jour (sections, tableau des espaces, jalons fin S9b) + [[Propriétaire bailleur]],
[[Onboarding et abonnement]], [[État du projet et décisions ouvertes]].
Contexte d'avancement : S0–S8 développés, recette humaine S3–S8 en cours —
le S9a est le prochain sprint de développement.

## [2026-08-19] decision | Le super admin peut créer manuellement tout profil (PD compris)
Précision humaine complétant la décision d'auto-inscription : la page publique
reste la voie normale d'arrivée du PD, mais le super admin dispose d'une voie de
secours/support — création manuelle de n'importe quel profil, propriétaire
bailleur compris (compte + organisation `independent_owner`). Acté dans
[[Super Admin]] (Administration V3), [[Propriétaire bailleur]] (arrivée),
[[Onboarding et abonnement]], [[État du projet et décisions ouvertes]] et le plan
de sprints (console SA, S9b).

## [2026-08-19] sprint | Passe globale : alignement charte v2 + optimisations (S0→S8)
À la demande de l'humain (« refais une passe globale, corrige, optimise, mets à
jour le livrable »). 3 revues parallèles (charte écrans agence / charte hors
agence / qualité-perf du code) puis corrections sur ~35 fichiers :
- Charte : en-têtes serif partout, table stylée du journal comptable branchée
  (+ tuiles KPI compta), états en puces via lib/baux.ts (bail, mandat, EDL,
  loyers — fin des statuts gris), encadrés à liseré, états vides guidants,
  bandeau encre pour l'espace locataire et la console admin, libellés français
  centralisés (lib/libelles.ts), formats fr-FR (dates, eur() unique — 10 copies
  supprimées), quittance imprimable sans note technique.
- Fond : aujourdhuiParis() généralisé (bug date UTC → écriture possible sur un
  mois clôturé avant 2 h), erreurs d'écriture plus jamais avalées (quittance,
  création de bien PD, suppression d'encaissement), gardes d'accès dédupliquées
  (verifierAccesEspace), motifLitteral() sur les ilike, nomComplet() (17
  concat), requêtes parallélisées (fiche personne, fiche bail, espace
  locataire), selects allégés (alertes). Constat de revue invalidé et documenté:
  lot_equipements n'a pas de colonne org (trigger).
- Hors passe (documenté) : N+1 lot_blocages_location → RPC ensembliste à créer
  dans un prochain sprint.
Lint 0 erreur, 72 tests verts, build OK. Livrable de recette mis à jour
(étape 2 « passe globale » + périmètre réel sans S7) ; synthèse
[[Coherence maquette-application]] étendue à tous les écrans. Recette humaine
à suivre par l'humain.

## [2026-08-21] query  | Où en est la mécanique de dépôt et gestion d'incident ?
Réponse : non développée — le S7 (incidents) est le seul sprint manquant du
périmètre livré (S0→S6 + S8), constat acté le 19/08 dans le livrable de recette,
planifié après le S9a (propriétaire direct). La spécification est complète côté
wiki (module 7 ingéré : [[Cycle de vie d'un incident]], [[Demande et sélection
de devis]], [[Planification d'intervention]], [[Intervention et clôture]],
[[Incident]], [[Artisan]]). Seules traces dans le code : type de document
`incident` en GED et mention au tableau de bord agence.

## [2026-08-21] sprint | S7 incidents (incrément 1) : la gestion de l incident, sur branche
À la demande de l'humain (« développe la mécanique d'incident, pas sur main,
rigoureux, optimise, recette unitaire et intégration, focus locataire +
agence/PD, gestion de l'incident »). Branche `sprint7-incidents` (4 commits),
base migrée via MCP (4 migrations : fondation, correctif criticité,
optimisation lecture, garde-fous).
- Périmètre : déclaration (locataire à bail actif / saisie agence),
  qualification-imputation justifiée (RM-7.2), contestation tracée non
  bloquante, clôture (résolu/sans suite/syndic), réouverture, attribution,
  photos GED (plafond 10), alertes chaînées (RM-7.6.2), historique append-only.
  Machine A5 complète (7 états), transitions défendues en base (SECURITY
  DEFINER, aucune policy d'écriture) ; états artisans non servis (incréments
  suivants). Écrans : agence (liste+filtres, fiche, nouveau, donut « par
  payeur », onglet+badge), locataire (carte accueil RM-19.2.3, déclaration
  photo-d'abord RM-19.2.2, contestation, « le problème persiste »).
- Vérifications : 82 tests Vitest verts (10 unitaires S7 + non-régression),
  14 tests d'intégration écrits (pattern rollback, s'activent avec
  SUPABASE_DB_URL), **27 scénarios déroulés en conditions réelles** via MCP en
  transactions annulées (zéro résidu vérifié) — dont un vrai bug attrapé
  (cast enum criticité) et corrigé.
- Revue n°1 (3 angles) : 7 suites appliquées (garde-fous en base — catégories
  fermées, plafond photos, terminé≠sans suite ; verifierLocataire ;
  lib source unique transitions/motifs ; ROLES_RESPONSABLES centralisé ;
  nettoyages), 3 écartées documentées. Advisors Supabase RAS.
- Wiki : [[Cycle de vie d'un incident]] (implémentation + contradiction levée),
  [[Machines à états et événements]] (vocabulaire incident aligné),
  [[Coherence maquette-application]] (section S7, 9 écarts assumés).
  Livrable : `livrables/Recette S7 - incidents.md` (10 scénarios humains).
- **4 arbitrages soumis à l'humain** (réponse en attente) : conseil
  d'imputation maquette vs RM-7.2.1 ; aperçu « qui paiera » locataire vs
  RM-7.2.4 ; description obligatoire vs RM-19.2.2 ; imputations module 7 vs
  « copro » du plan. Implémenté : le référentiel, partout.

## [2026-08-21] decision | S7 : quatre arbitrages maquette/référentiel tranchés — le référentiel prime
L'humain confirme les quatre recommandations (implémentation inchangée) :
1. Qualification : repère juridique informatif, rien de pré-coché (RM-7.2.1
   confirmée — le « conseil pré-sélectionné » de la maquette est écarté).
2. Locataire : « qui paiera » visible seulement après la décision de l'agent
   (RM-7.2.4 confirmée — pas d'aperçu à la déclaration).
3. Description obligatoire à la déclaration ; l'assouplissement « deux photos
   + la pièce suffisent » (RM-19.2.2) attendra le S13 mobile.
4. Imputations du module 7 (locataire / propriétaire / dégradation fautive,
   parties communes → clôture « transmis au syndic ») — la mention « copro »
   du plan de livraison est caduque.
Pages : [[Coherence maquette-application]] (les écarts S7 passent d'« à
trancher » à actés), [[Incident]], [[Cycle de vie d'un incident]].

## [2026-08-21] sprint | S7 revue n°2 : confidentialité inter-locataires et cohérence du cycle
Rapport final de la revue de fond (10 findings, 3 déjà corrigés en n°1).
Correctifs appliqués (migration `s7_incidents_confidentialite` + TS) :
- **mes_incidents_locataire scopée au BAIL, plus au lot** : un nouveau
  locataire voyait les incidents (description, imputation, contestation) de
  l'ancien locataire du même lot — divulgation corrigée ; l'ancien déclarant
  garde son historique ; la fonction expose `est_declarant`.
- Contestation d'un incident clos refusée (l'alerte n'aurait plus de clôture
  pour la solder) + adhésion locataire active exigée.
- La réouverture **efface l'imputation** (l'historique reste en événement) :
  donut « par payeur » et espace locataire ne montrent plus une prise en
  charge périmée pendant la requalification.
- UI : contester/rouvrir réservés au déclarant (les colocataires restent
  informés) ; photos : pré-contrôle d'empreinte avant upload (plus d'objet
  Storage orphelin) + uploads parallèles, RPC en séquence (plafond exact).
Vérifs : 82 tests verts (+2 intégration écrits), build OK, 4 scénarios
réels en base (rollback). Non retenus documentés : badge org-wide (maquette),
micro-optimisations. Itérations de revue closes (2/3).
## [2026-08-21] recette | Retours S3-S8 corrigés : 6 anomalies + 4 chantiers UX, déployés sur main
À la demande de l'humain (« développe et corrige mes retours de recette et
déploie dans main »). Triage issu de ses retours (transmis via l'agent de
revue) ; 3 commits sur main, 3 migrations via MCP.
Anomalies : mandat sans lot bloqué avant signature (lots/taux composables en
brouillon seulement, retrait possible, figés ensuite) ; attestation
d'assurance — cycle complet (dépôt versionné remplace_id, alerte agence à
chaque dépôt — le message « votre agence est notifiée » était faux —,
validation par l'agent avec statut visible des deux côtés, cron des alertes
d'expiration enfin planifié : la fonction existait depuis le S3 mais n'était
jamais appelée, échéance affichée côté agence) ; baux — date d'entrée
saisissable (elle tombait au jour du clic « Activer », le « 12 du mois
impossible » venait de là), brouillon corrigeable (modifierBail), bail signé
PDF uniquement ; alerte EDL nominative (lot + locataire, contexte affiché sur
la page Alertes) ; terminologie « propriétaire mandant » partout côté agence.
UX : fiche bien avec rubrique Propriétaires mandants ; récap lot enrichi
(propriétaire, locataire, identifiant fiscal) ; liste des baux en vue macro ;
combobox lot (C.5.4 + lignes de mandat) ; EDL par section + lignes incomplètes
en rouge + « Enregistrer et signer » en un geste ; « Mon logement » côté
locataire.
Vérifs : 72 tests verts, 7 tests d'intégration écrits, 6 scénarios réels en
base (rollback), lint/build OK. Livrable de re-test :
`livrables/Recette 2026-08-21 - retours corriges.md`. Reste hors passe :
navigation vers l'échéancier (G.3), UX doublon GED, menu locataire complet
(porté par la branche S7).

## [2026-08-22] recette | Livrable central unique : fusion du re-test du 21/08 + historique des validations

À la demande de l'humain : les tests à faire sont centralisés dans un seul
fichier, `livrables/Recette S3-S8 - tests par sprint et persona.md`.
- Le livrable `Recette 2026-08-21 - retours corriges.md` y est fusionné en
  **étape 3** (re-tests A.1-A.6 et B.1-B.4, numérotation conservée), puis
  supprimé.
- Nouvelle section **« Historique — recetté et validé »** en fin de document,
  pour garder la vision de ce qui a déjà été validé : bloc 0 (08/08), C.2-C.4,
  C.5.1-3+5, C.7, 3.2.1+3, 3.3.1-4 (13/08), recette automatisée du 14/08
  (ne vaut pas validation), correctifs du 21/08 (re-tests en étape 3).

## [2026-08-22] recette | Livrable restructuré en deux parties : Recetté OK / Reste à recetter

Suite du réaménagement demandé : le fichier central
`livrables/Recette S3-S8 - tests par sprint et persona.md` est restructuré en
deux parties : **Partie 1 — Recetté OK** (l'historique des validations remonte
en tête) et **Partie 2 — Reste à recetter**, elle-même en deux blocs :
2.A les re-tests suite aux retours de recette (étapes 1 du 13/08, 2 du 19/08,
3 du 21/08), 2.B les sprints jamais déroulés (S3 reste, S4, S5, S6, S8,
transverse, décisions à trancher). Contenu des scénarios inchangé.

## [2026-08-23] dev | Retours de recette du 22/08 : correctifs sur main (1/2)

Retours traités avant le chantier incidents (branche S7) :
- **EDL 4.5.3** : un EDL créé avant la déclaration des pièces restait sur la
  grille générique — bouton « Régénérer la grille depuis les pièces du lot »
  posé sur l'écran d'EDL (la RPC savait faire, aucun écran ne l'appelait).
- **Formulaires vidés** : React 19 réinitialise les champs non contrôlés après
  CHAQUE action, y compris en erreur — la grille d'EDL est passée en champs
  contrôlés, et une mécanique commune (`lib/formulaires.ts`, l'action renvoie
  `valeurs`, le formulaire les repose en `defaultValue`) est appliquée à
  ~30 actions et ~25 formulaires (personnes, mandats, baux, parc, compta…).
- **Mandats** : taux d'honoraires obligatoire (plus de 7 % posé en silence) ;
  un mandat sans lot ni taux ne change plus d'état — garde applicative ET
  migration en base (`20260823_mandat_vide_ne_change_plus_detat.sql`) pour les
  mandats hérités ; le combobox ne propose plus les lots déjà couverts.
- **« Traiter »** : tableau de bord et cloche ouvrent désormais la pop-up de
  traitement directement (`/alertes?traiter=<id>`).
- **Modale unique** (`components/ui/modale.tsx`) : grammaire maquette (voile
  encre 35 %, angles vifs, en-tête encre/rouge, surtitre mono) ; modale
  d'alerte et pop-up de la cloche refactorées dessus.
- **Espace locataire aligné maquette (B.4)** : bandeau deux étages #0F2438,
  onglets (Mon logement / Mes loyers), nom du locataire en en-tête, page
  « Mon logement » en deux colonnes avec lignes libellé↔valeur ; « Mes
  loyers » devient un onglet ; « Validée par votre agence » → « Validée »
  (libellé générique agence/bailleur).
- Divers : message doublon GED explicité (empreinte du CONTENU), vue macro des
  baux de la fiche lot enrichie (loyer cc, dates).
Vérifs : typecheck/lint 0 erreur, 75 tests unitaires verts, build OK ; tests
d'intégration du 22/08 écrits (`tests/recette-2026-08-22.test.ts`).

## [2026-08-23] dev | Retours de recette du 22/08 (2/2) : incidents merges, pop-up unifiee, livrable central

Suite et fin de la session :
- **Branche `sprint7-incidents`** : main mergee dedans (2 conflits resolus :
  page locataire refondue conservee, log concatene), puis completee :
  - pop-up de traitement d'incident : « Traiter » sur une alerte incident
    ouvre le contenu de la fiche (qualification, cloture) dans la modale
    unique de la charte — depuis le tableau de bord, la cloche et la page
    Alertes ; l'alerte se solde en base, la pop-up se referme sur le geste
    abouti (`apresSucces`) ;
  - espace locataire : onglet « Mes demandes » + carte CTA « Un probleme
    dans le logement ? » sur l'accueil (RM-19.2.3 respectee) ;
  - conservation des saisies appliquee aux formulaires incidents ;
  - pop-up « Nouveau proprietaire mandant » refactoree sur la Modale.
  Branche poussee (ebc4443) puis **mergee sur main** (fast-forward) et
  **deployee** (push origin/main → Vercel).
- **Base de production** : les 5 migrations S7 etaient deja appliquees ;
  ajout de `mandat_vide_ne_change_plus_detat`. **8 scenarios rejoues en
  conditions reelles** (transaction annulee) : garde mandat vide, chaine
  mandat complet, regeneration EDL 4.5.3, refus sur EDL signe, chaine
  incident (alerte creee → qualification solde → cloture) — tous OK.
- **Decisions** : profil artisan NON cree (les etats affecte/en_cours/termine
  attendent le module devis S13 — un ecran sans workflow serait mort) ;
  le proprietaire bailleur passe deja par les memes fonctions que l'agence
  (roles generiques, libelles locataire neutralises : « Validee »).
- **Livrable** : `Recette S3-S8 - tests par sprint et persona.md` renomme en
  `Recette - test par sprint et persona.md`, restructure : Partie 1 enrichie
  des validations du 22/08, Partie 2 = etape 4 (re-tests du 23/08 D.1-D.7),
  Sprint 7 complet (7.1-7.4), reliquats (G.2-G.4, A.1-A.6, B.1.1, 3.4.2,
  3.5, 4.4, 4.6 reliquat, 4.7 LO), sprints 5/6/8 et transverse inchanges.
  Reponse a la question 3.5 : la notification d'invitation est l'email
  Supabase de definition de mot de passe (gabarit par defaut en anglais, a
  franciser au branchement SMTP).
Verifs finales : typecheck/lint 0 erreur, 85 tests unitaires verts, build OK.

## [2026-08-23] dev | Passe UX sur la maquette + correctif du selecteur de lot (incidents)

- **Maquette** : nouvelle version datee `raw/maquettes/2026-08-23-gerimmo-prototype.html`
  (l originale du 08/08 reste intacte — raw/ immuable). Quatre chantiers :
  modales irreprochables (fermetures animees, Echap partout, croix, aria-modal,
  piege de focus, verrou de scroll), chargements simules (spinner sur le bouton,
  18 actions), fluidite (scroll conserve, saisies reposees apres re-render,
  entree animee au seul changement de page ; startViewTransition ecarte apres
  mesure ~1 s/navigation), mobile 390 px + cibles 44 px. Verifie : node --check,
  6 personas / 49 ecrans sans erreur console, rendu moyen 2 ms.
- **App — bug reel trouve au test navigateur** : sur « Ouvrir un incident »,
  la liste des lots sortait vide. Cause : l embed `bien:biens(nom)` etait
  ambigu (PGRST201 — deux FK lots→biens : simple + meme-org) et l erreur etait
  avalee. Correctif : `biens!lots_bien_id_fkey` (comme l export compta) +
  erreur journalisee. Audit des autres embeds : seul cet endroit etait touche.
  Page Alertes : lectures parallelisees. Deploye (ea3e401).
- **Livrable** : `Recette - test par sprint et persona.md` allege des items
  purement UI (design des pop-up, details visuels D.7) — la fluidite se juge
  en testant ; note du correctif lot ajoutee au scenario 7.4.

## [2026-08-23] revue | Passe de revue complete des derniers developpements + E2E incidents

Trois revues paralleles (incidents/alertes, espace locataire/EDL, retention
des saisies/mandats) sur tout ce qui a ete developpe les 22-23/08, puis un
parcours E2E reel en production (compte demo agent au navigateur, locataire
via l API comme api-isolation.test.ts).

**E2E incidents joue deux fois en production** (INC-2026-0001, dossier de test
clos) : declaration locataire → alerte → pop-up Traiter depuis le tableau de
bord → qualification → imputation visible locataire → contestation → cloture
→ reouverture → requalification → cloture finale. 7 evenements traces,
0 alerte orpheline.

**9 defauts reels corriges** (details au commit 2de78b1) — les 3 majeurs :
- la pop-up incident retombait sur la modale d alerte generique perimee
  apres un geste aboutit (revalidation dans le meme commit React que le
  succes) — regle sure posee : une alerte disparue ferme sa modale ;
  ?traiter= consomme puis retire de l URL ;
- l alerte « imputation contestee » etait insoldable sans cloturer :
  la REqualification (reponse a la contestation) existe desormais, en base
  et dans la pop-up, et solde l alerte ;
- un EDL signe restait modifiable sur compteurs/cles ; la grille de SORTIE
  ne matchait plus l entree signee si les pieces etaient declarees entre les
  deux (comparatif entierement en ecart) → sortie miroir de l entree.
Plus : colocataire qui voyait « aucun bail actif », zone tendue ignoree a la
creation d un bien, mandat vide en impasse (retour en brouillon), decoupage
qui perdait la saisie, migrations S7 renommees en horodatage complet (chaine
rejouable).

Migration `revue_s7_correctifs` appliquee en prod ; 8 scenarios rejoues en
base reelle (rollback) tous verts ; tests/recette-2026-08-23.test.ts ecrit ;
85 tests unitaires, typecheck/lint 0 erreur, build OK ; correctifs verifies
au navigateur sur le deploye (pop-up se ferme proprement, URL nettoyee,
requalification OK).

## [2026-08-24] dev | Retours de recette du 24/08 : pop-up sur place, incidents dans leur onglet, alignement maquette

Retours traites :
- **« Traiter » sans redirection** : une alerte generique ouvre la pop-up SUR
  L ECRAN COURANT (tableau de bord et cloche compris — ModaleAlerte extraite
  en composant partage, la cloche porte l etat de traitement au-dessus de sa
  synthese) ; une alerte INCIDENT emmene dans l onglet Incidents, positionne
  sur le dossier (?sel=). La modale incident en pop-up est supprimee — les
  incidents se traitent dans leur onglet (decision recette 24/08).
- **Onglet Incidents en vue scindee maquette** : liste a gauche (rangs, puces,
  responsable, legende), dossier a droite (pane-incident.tsx — en-tete mono,
  barre d etapes du flux, « Ce qu a dit le locataire », qualification a
  lisere laiton avec REqualification et encart de contestation, chronologie
  a pastilles). /incidents/[id] redirige vers ?sel= (liens conserves).
- **Locataire aligne maquette** : « Signaler un probleme » en deux colonnes
  avec l encart adaptatif « Qui paiera la reparation » (repere par categorie,
  formulation validee : le proprietaire peut refuser la prise en charge ;
  l agence peut missionner un artisan, refacture apres accord sur devis),
  erreurs en bandeau .err, message « aller-retour avec l agence », succes en
  vert puis redirection auto vers Mes demandes (2,5 s) ; « Mes demandes » en
  cartes a lisere par etat.
- **Bug photos corrige** : la limite serveur des Server Actions (11 Mo)
  bloquait une declaration avec plusieurs vraies photos avant meme notre
  code → 55 Mo (5 photos × 10 Mo max). Flux API verifie compte demo reel.
- Livrable recette : etape 5 (E.1-E.4), validations du 24/08 en Partie 1,
  reliquat S7 reduit a 7.2.2 (colocataire) et 7.4.5 (responsable).
Verifs : typecheck/lint 0 erreur, 85 tests verts, build OK.

## [2026-08-24] revue | Re-test complet + passe de conformite maquette

Suite technique : typecheck/lint 0 erreur, 85 tests unitaires verts, build OK ;
5 flux critiques rejoues en base reelle (rollback) tous verts : alerte
incident, chaine qualification→requalification→cloture, regeneration EDL,
gel EDL signe, mandat vide (retour brouillon).
Conformite maquette (comparaison ecran a ecran, maquette servie en local) :
vue scindee incidents agence conforme (liste, rang actif, barre d etapes,
chronologie), Signaler un probleme et Mes demandes locataire conformes.
Deux ecarts corriges : le CTA « Signaler un probleme » manquait dans le
bandeau locataire (chromeLoc), et la tuile KPI « Incidents » manquait sur le
tableau de bord (remplace la tuile Documents, hors maquette — jauge par
payeur, file a qualifier en sous-ligne, deux requetes documents retirees).

## [2026-08-24] dev | Toast de confirmation apres traitement d une alerte (maquette)
Retour utilisateur suite a la verification UX des workflows : « je veux bien
ce niveau de feedback ». Traiter une alerte generique fermait la pop-up sans
un mot — le seul feedback etait la disparition de la ligne. Ajout d un toast
facon maquette (bandeau encre en bas, ~6 s, fermeture au x) : « Alerte
confiee. » / « Alerte traitee. ». Le composant declencheur etant demonte dans
le meme commit React que le succes, le Toasteur vit dans le layout agence et
se declenche a la resolution de l action (afficherToast), pas dans un effet.
Commit 1b47e55, deploye et verifie en production : deux alertes de test
etiquetees TEST TOAST creees puis traitees (une via la cloche sur le tableau
de bord, une via la page Alertes) — toast visible, modale fermee sur place,
compteurs synchronises, aucune alerte reelle touchee.

## [2026-08-24] dev | Fluidite de navigation : squelettes + indicateurs de lien
Retour utilisateur : « quand on clique, rien ne se passe tant qu'on n'a pas
la reponse — ca peut faire penser a un bug ». Toutes les pages etant
dynamiques (Supabase), le clic restait fige jusqu'au rendu serveur. Doc Next
embarquee lue (linking-and-navigating, loading.js, useLinkStatus). Ajouts :
loading.tsx agence/[orgId] et locataire/[orgId] (navigation d'onglet
immediate, bandeau et onglets en place, squelette charte qui respire),
loading.tsx racine (entree d'espace : rond d'attente au lieu d'un ecran
fige), et IndicateurLien (useLinkStatus) pour ce que loading.tsx ne couvre
pas — un changement de searchParams seul ne le re-declenche pas : lisere
laiton battant sous l'onglet clique, anneau sur la ligne d'incident cliquee,
filtres de vue, « Fermer » de la vue scindee, liens « Traiter ». Apparition
differee de 150 ms (pas de clignotement), espace reserve (pas de decalage),
prefers-reduced-motion respecte. Commit 800d09b, verifie en production :
squelette capture au clic d'onglet, anneau capture sur la ligne cliquee,
liste stable, aucune erreur console.

## [2026-08-26] recette | Point recette du 26/08 : etape 5 soldee, S5 entame, une anomalie
Recette humaine sur https://gerimmo-v4.vercel.app :
- **Etape 5 soldee** : E.1 (1-3), E.2 (1-3), E.3 (1 et 3), E.4 valides.
  E.3.2 (bandeau d erreur maquette) accepte en l etat — point garde pour
  plus tard.
- **Sprint 7** : 7.4.5 (attribution en responsable) valide — reste 7.2.2
  (colocataire).
- **Etape 2 soldee** : G.2 (1-3), G.4 (1-4), G.3.1 valides ; G.3.2 teste
  partiellement (pas assez de recul en mois clotures, semble OK — a
  confirmer au sprint 6).
- **Sprint 3** : 3.4.2 valide (ancienne alerte critique conservee) —
  scenario 3.4 solde.
- **Sprint 5 entame** : 5.1 (prorata au centime, etapes 1-2) valide, a
  repasser en non-regression ; 5.3 (echeancier locataire, etapes 1-2)
  valide.
- **Anomalie 4.7.1** : cote locataire, « Mon bail » ne permet pas de
  consulter le bail signe — la piece n est pas disponible. Passee en tete
  de Partie 2 du livrable, diagnostic en cours.
Livrable central mis a jour (validations en Partie 1, section « Points
gardes pour plus tard » creee, sections soldees retirees de la Partie 2).

## [2026-08-26] dev | Anomalie 4.7.1 : le locataire consulte son bail signe
Diagnostic : la consultation du bail signe cote locataire n avait jamais ete
implementee — quatre maillons manquaient : mon_bail_locataire ne renvoyait
pas baux.document_signe ; aucune route de fichier cote locataire ;
log_document_access refusait le role locataire ; aucune policy de lecture
storage/documents pour ce role (le PDF n est rattache au bail que par la
colonne baux.document_signe, jamais par document_liens).
Correctif (migration bail_signe_locataire, appliquee via MCP + copie de
reference dans app/supabase/migrations) :
- mon_bail_locataire renvoie aussi document_signe ;
- nouvelle RPC definer mon_bail_document_locataire (metadonnees de la piece,
  acces verifie : locataire principal ou colocataire, bail actif/preavis) ;
- log_document_access accepte le locataire pour la piece de SON bail (la
  trace reste obligatoire, RM-0b.7.5) ;
- policy storage ged_select_locataire_bail via une fonction definer
  chemins_pieces_bail_locataire (meme lecon que le correctif attestations
  du sprint 3 : les policies s evaluent sous la RLS des tables referencees).
Cote app : route locataire/[orgId]/bail/fichier calquee sur la route agence
(trace avant acces, fichier servi par le serveur, pas d URL signee exposee,
RM-A4.10) ; bouton « Consulter mon bail signe » dans la carte Mon bail.
Bonus agence (note du diagnostic) : « Bail signe depose. » porte desormais
un lien « Le consulter » vers la piece.
Verifs : build OK, typecheck/lint 0 erreur, 85 tests verts ; en base, le
bail de locataire.alpha@ (preavis) porte bien un PDF signe vivant.

## [2026-08-26] query | Detail des sprints restants + inventaire des manques V0
Demande de l humain (avec 3 ecarts reperes en recette : onglet Mes documents
locataire, agenda agence, section Documents agence). Comparaison ecran par
ecran maquette du 23/08 <-> application : les 3 ecarts confirmes, et
inventaire complet dresse. Points saillants :
- Locataire : Mes documents, Mes rendez-vous et Conseils manquants ; une
  seule attestation d assurance visible (le renouvellement masque la
  validee) ; pas de « Donner mon preavis ».
- Agence : Agenda et Messages manquants (S9b), Documents tres en-deca de la
  maquette (maitre-detail, pieces a renouveler, par type, detail de piece,
  Remplacer, visibilite), comptabilite et parc sans sous-onglets,
  administration agence (8 sous-onglets) absente, recherche globale absente.
- Hors plan (a trancher) : conformite/registres loi Hoguet, pilotage avance,
  editorial/articles, rentabilite du mandat.
Nouveau livrable : « Reste a faire V0 - sprints et ecarts maquette » (detail
fin S8 / S9a / S9b, inventaire par espace avec rattachement au sprint ou
[hors plan], synthese du perimetre V0 restant). Index mis a jour.

## [2026-08-26] dev | Livraison du soir : Mes documents locataire + Documents agence (maquette)
Deux ecarts maquette du livrable « Reste a faire V0 » developpes en parallele
de la recette humaine, selon la methodologie complete (dev -> 2 revues -> 3
passes d integration -> deploiement -> scenarios de recette).
**Feature 1 — « Mes documents » locataire** : nouvel onglet listant bail
signe, attestations et quittances (Ouvrir/Telecharger via une route de
fichier securisee, trace obligatoire). Besoin de recette du 26/08 couvert :
pendant la verification d un renouvellement, la derniere attestation VALIDEE
reste visible (RPC mes_pieces_locataire) ; l accueil l explique et pointe
vers l onglet ; puce « Expiree » si la validee ne couvre plus.
**Feature 2 — « Documents » agence** : vue scindee maquette (liste + vue
d ensemble « Pieces a renouveler » / « Par type » cliquable, stats agregees
en SQL), fiche de piece (apercu, rattachements, cycle de vie avec
conservation et « Visible par »), actions Rattacher (toast) et Remplacer
(RPC transactionnelle : fiche versionnee + liens copies + pointeur
baux.document_signe deplace ; historique des versions sur la fiche).
**Revues** : passe 1 (securite + conformite maquette) — 1 bloquant corrige
(le type pilote seul les droits : whitelist attestation/piece d identite/
justificatif cote locataire), verrou d organisation (trigger
document_liens_meme_agence), adhesion locataire ACTIVE exigee partout,
bail servi seulement actif/preavis, MIME whitelist + nosniff sur les 3
routes de fichiers, index unique sur remplace_id. Passe 2 — stats SQL
(documents_stats_par_type / documents_a_renouveler), adhesion active sur
les fonctions bail du matin, prefixe de chemin storage verrouille,
messages 23505 discrimines.
**Tests** : build/typecheck/lint 0 erreur, 85 tests unitaires verts ;
nouveau fichier tests/mes-documents-locataire.test.ts (6 tests
d integration : cycle des deux attestations, bail signe, traces, courrier
invisible, lien inter-agences, version remplacee) ; 3 passes d integration
en base reelle (transactions annulees) toutes vertes, non-regression des
flux attestation/bail signe/GED comprise.
**Migrations** : mes_documents_locataire, ged_perimetre_locataire_et_
remplacement, documents_courants, revue2_ged — appliquees via MCP, copies
de reference commitees.
Livrable recette : nouvelle section 2.B (scenarios N.1 a N.6 + decisions de
revue a confirmer). Le compte demo porte deja le cas des deux attestations.

## [2026-08-26] revue | Verification en production de la livraison du soir
Deploiement Vercel constate en ligne. Verifie en session agence reelle :
vue scindee Documents (41 pieces, doctrine, filtres), vue d ensemble
(« Pieces a renouveler » : 3, « Par type » avec compteurs exacts,
« 40 pieces conservees, hors pieces purgees »), fiche d une attestation
(eyebrow, puce « a renouveler », apercu PDF rendu par la route fichier,
rattachements « Agence » + « Leblanc Julie », bouton Rattacher). La route
fichier locataire refuse proprement un non-locataire (page « Acces refuse »
en francais). Le clic final locataire (onglet Mes documents, compte demo)
revient a la recette humaine — scenarios N.1 a N.6 du livrable.

## [2026-08-29] dev | Validation du bail : EDL d'entrée prérequis, règlement de copro, un seul bail actif

Décisions de Tahir (29/08) : l'alerte automatique `edl_entree` est retirée ; l'EDL
d'entrée signé devient une **condition** de la validation ; le bouton « Activer le
bail » devient **« Valider »** en bas de la fiche ; section facultative **règlement de
copropriété** ; **un seul bail actif** par lot, un brouillon pouvant coexister.

Livré : migration `20260829100000_bail_validation_edl_entree_reglement_copro`
(appliquée en prod via MCP, vérifiée : 2 alertes edl_entree fermées avec motif, 4
brouillons existants devront passer par l'EDL), `activer_bail` réécrite (nouveaux
refus, plus d'alerte), `baux.reglement_copropriete` + type GED `reglement_copropriete`
+ règle de conservation « Fin du bail / 60 mois » (**hypothèse** à confirmer),
`actions/baux.ts` (`validerBail`, `deposerReglementCopropriete`, dépôt PDF factorisé),
page bail (cartes « Bail signé » / « Règlement de copropriété », carte « Valider le
bail » avec checklist, « À faire » réordonné), 3 fichiers de tests réécrits + 2
scénarios (refus sans EDL signé, second bail en attente). Typecheck/lint OK, 85 tests
unitaires verts ; tests d'intégration via CI (pas de `SUPABASE_DB_URL` local).
Wiki : [[Bail]], [[Agenda et échéances]] ; recette S3-S8 scénario 4.1 révisé.

Concept acté en amont (à développer au S9b) : **une alerte automatique est liée à son
événement d'origine et se ferme quand il est traité**. Inventaire fait ce jour :
11 types automatiques, 9 sans anti-doublon, 6 sans fermeture auto
(`diagnostic_expiration`, `assurance_expiration`, `versement_proprietaire`,
`ecart_versement`, `decompte`/`decompte_lrar`, `retenue_sans_justificatif`) ;
fragilités : dédoublonnage des crons sans filtre `statut`, ordre alphabétique des
migrations `20260801_*` contraire à l'ordre d'application réel.

CI verte sur 063c2a5 (lint, build, typecheck, tests d'intégration inclus) :
https://github.com/GERIMMO/GERIMMO_V4/actions/runs/33267869212 — déploiement Vercel par le push.

## [2026-08-29] dev | Alertes liées à leur événement d'origine (volet 2) + recette 29/08

Livré (migration `20260829120000_alertes_liees_evenement_origine`, appliquée en prod
via MCP, rétro-remplissage vérifié : 100 % des alertes automatiques ont une origine) :
`alerts.origine_type/origine_id` posés par trigger à l'insertion (les fonctions
créatrices ne changent pas), `fermer_alertes_origine(org, type, id, motif, types[])`
(motif obligatoire, alerte conservée, `closed_by` = auteur de l'action ou null en
cron → « fermée automatiquement » à l'écran). Branchements : `enregistrer_versement`
(ferme l'appel de versement ; l'écart se met à jour au lieu de s'empiler et se ferme
à la régularisation), trigger diagnostics (archivage → alertes d'expiration fermées),
trigger documents (nouvelle version → alertes de l'ancienne fermées, y compris via la
GED agence qui laissait l'alerte ouverte), `restitutions.envoye_le` +
`marquer_decompte_envoye`, `ajouter_retenue` porte désormais `retenue_id`,
`justifier_retenue` (nouveau), `supprimer_retenue` (nouveau — l'ancien DELETE direct
ne supprimait rien faute de policy et affichait « Retenue retirée »), trigger EDL de
sortie signé. UI : formulaire de restitution (joindre un justificatif, « Décompte
envoyé »), page Alertes (« fermée automatiquement »). Tests : `alertes-origine.test.ts`
(6 scénarios). Recette : section 2.0 (scénarios 29.1 et 29.2), A.4/A.5/8.2.3 révisés.
Wiki : [[Agenda et échéances]], [[Restitution du dépôt de garantie]].
Décision confirmée par Tahir : on conserve l'alerte fermée avec son motif.

CI verte sur 5078dec (tests d'intégration alertes-origine inclus) :
https://github.com/GERIMMO/GERIMMO_V4/actions/runs/33268639859 — déployé sur Vercel.

## [2026-08-29] backlog | Chantier Bail à prioriser (demande de Tahir, non développé)

Retrait du bouton « Valider » : dépôt du bail signé ⇒ bail actif + lot loué ; EDL
d'entrée non signé ⇒ alerte automatique liée au bail (fermée à la signature).
Section « Bail signé » : prévisualisation en modale avec « Envoyer » (au locataire
renseigné) / « Corriger ». Inscrit dans [[Reste a faire V0 - sprints et ecarts
maquette]] § 5 bis et signalé en contradiction dans [[Bail]]. Rien codé.

## [2026-08-29] plan | Création du sprint « Alertes & documents » (à prioriser)

Sprint ajouté au [[Plan de livraison et sprints]] (avant le jalon V0, position à
fixer) : bail sans « Valider » (dépôt du signé ⇒ actif/loué, EDL en alerte),
prévisualisation/envoi du bail signé, fin de consolidation des alertes, documents du
locataire (règlement de copropriété, pièces du bail). Détail § 5 bis du reste à faire.

## [2026-08-30] plan | Sprint « Alertes & documents » : suppression de la cloche de l'en-tête

Ajout au sprint (demande de Tahir) : retirer la cloche, redondante avec l'entrée
« Alertes » du menu ; pop-up de connexion conservée. Revient sur la décision S2 du
29/07 ; scénarios de recette citant la cloche à reprendre ; point d'accès à garder
pour « Mes espaces » et la console SA. Plan + § 5 bis du reste à faire mis à jour.

## [2026-08-30] dev | Sprint 9a — Propriétaire direct : auto-inscription, espace, livre, récapitulatif fiscal

Livré (commit `64b3669`, migration `20260830100000_s9a_proprietaire_direct`
appliquée en prod via MCP, CI verte) : `organizations.type` (agence |
proprietaire_direct) + `essai_fin` ; `initialiser_espace_proprietaire()`
(definer, idempotente : organisation « Parc de Prénom Nom » en essai J+14,
adhésion, fiche personne) appelée depuis `/espaces` après `signUp` (page
publique `/inscription`, confirmation d'email exigée par le projet — les deux
flux convergent) ; droits du PD sur les personnes et la clôture ; trigger
d'exclusivité PD/PM sur les mandats + contrôle miroir à l'inscription ;
`can_manage_organization` ; statut/type/essai réservés au SA. App : layout
« Espace propriétaire » + bandeau d'essai, onglets Mes lots / Locataires /
Livre, livre sans rapports ni honoraires, page `/comptabilite/fiscal`
(rubriques 2044, `src/lib/fiscal.ts`), fiche personne sans mandats, seed
`proprietaire@gerimmo-demo.fr`. Tests : `fiscal.test.ts` (5, unitaires),
`sprint9a-proprietaire-direct.test.ts` (6 scénarios d'intégration dont le
bout en bout bien → bail → loyer sans honoraires → clôture → récap). Règles
vérifiées contre le wiki : [[Propriétaire bailleur]], [[Onboarding et
abonnement]], [[Fiscalité]], [[Comptabilité]] — pages mises à jour.

## [2026-08-30] dev | Sprint « Alertes & documents » : bail activé au dépôt, Envoyer/Corriger, alertes consolidées, pièces du bail, cloche retirée

Livré (commit `a0bef25`, migration `20260830120000_alertes_documents`
appliquée en prod via MCP, CI verte) : `controler_mise_en_location` (contrôles
avant dépôt) + `activer_bail` sans prérequis EDL (alerte `edl_entree` liée au
bail, fermée à la signature — le trigger EDL couvre entrée et sortie) ;
`devalider_bail` (« Corriger ») avec transition lot loué → disponible sans
bail vivant ; `poser_alerte_seuil` : une alerte par objet pour les crons
diagnostics/assurance ; `generer_alertes_restitution` + cron (J-7, dépassé),
`finaliser_decompte` ferme le compteur et date le décompte ;
`pieces_bail_locataire` partagé par les quatre fonctions du périmètre
locataire (bail signé + règlement de copropriété) ; `baux.signe_envoye_le`.
App : dépôt qui active (blocages actionnables), `CarteBailSigne` (modale de
prévisualisation, Envoyer par email, Corriger avec confirmation), plus de
carte « Valider » ; `SyntheseAlertes` remplace la cloche (rappel texte sur
« Mes espaces » et la console SA) ; « Fermées récemment » enrichie ; règlement
visible du locataire. Tests réécrits/étendus : `sprint4-bail`,
`alertes-origine`, `mes-documents-locataire`.

Recette autonome : 18 scénarios SQL déroulés en transaction annulée sur la
base (activation/alerte/signature, Corriger et ses refus, second bail refusé,
compteur J-7 → dépassé → finalisation, cron diagnostics dédoublonné, pièces
du bail côté locataire) — tous conformes. Recette humaine remise :
[[Recette - test par sprint et persona]] § 2.00 (30.1 à 30.7).

**Constat CI** : l'étape `npm test` dure 9 s sur les runs 82/83 — les tests
d'intégration se sautent (secret `SUPABASE_DB_URL` vraisemblablement absent).
Les mentions « CI verte, tests d'intégration inclus » des entrées précédentes
sont à lire avec cette réserve. À faire : renseigner le secret (base de test,
jamais la prod) pour que les 130 tests d'intégration tournent.
Wiki : [[Bail]] (contradiction soldée), [[Agenda et échéances]],
[[Restitution du dépôt de garantie]], [[Document]] ; plan et reste à faire
mis à jour.

## [2026-08-30] revue | Re-tests, alignement maquette (Parc scindé), recette navigateur

Demande de Tahir : refaire les tests, comparer le fonctionnement à la maquette
(« ouvrir un bien m'ouvre l'autre onglet ») et corriger.
- **Tests** : 90 unitaires verts ; 18 scénarios SQL d'intégration rejoués en
  transaction annulée (bail au dépôt, EDL, Corriger, compteur de restitution,
  crons, pièces du bail) — conformes ; **recette navigateur en local** sur la
  base réelle (admin.alpha@, proprietaire@, multi@) : Parc scindé, carte
  « Bail signé » + modale (Envoyer → message SMTP attendu), Alertes (vue
  « Fermées récemment » enrichie), espace propriétaire (bandeau d'essai, Livre,
  récapitulatif fiscal), lien « Alertes (n) » sur « Mes espaces ».
- **Parc aligné sur la maquette** (`paneDe`/`paneLot`/`pageBien`) : la
  sélection d'un bien ou d'un lot s'ouvre dans le panneau de droite
  (`?sel=`, `pane-parc.tsx`), « Vue d'ensemble » pour revenir, fiche complète
  à un clic. C'était un écart « assumé » du 14/08, désormais levé ; Personnes
  reste en navigation (à aligner si le retour se confirme).
- **Rattrapage** : les doublons d'alertes ouverts des anciens crons (un par
  seuil) sont fermés, migration `20260830130000_alertes_doublons_historiques`
  appliquée en prod. Libellés PD : « Mes lots », « Votre liste ».
- **Compte de démo** `proprietaire@gerimmo-demo.fr` créé en prod (comme les
  autres comptes gerimmo-demo).
- Constaté, non corrigé (donnée, pas code) : le PDF du bail actif de démo
  « Moreau Sofia » répond « Fichier indisponible » (objet absent du stockage).
Recette : scénario 30.8 ajouté ; [[Coherence maquette-application]] mis à jour.

## [2026-08-30] dev | Performance, tableau de bord (retours de Tahir), re-tests

Demande : refaire les tests, optimiser chargement/navigation/cache, retirer
« Incidents par payeur » (un incident est une alerte), infobulles sur les barres
encaissements/dépenses, curseur main sur les boutons.
- **Mesures** (serveur de dev, base réelle, pages chaudes, temps du code
  applicatif) : tableau de bord 420-580 ms → 330-410 ms ; Parc 323 → 258 ms ;
  fiche personne 514 → 369 ms ; fiche bail 524 → 448 ms. Le reste est la
  latence Supabase (≈ 50-100 ms par aller-retour) et le proxy (1 requête
  d'adhésions par page, gardée pour la politique de sessions).
- **Optimisations** : `lots_blocages_location(org, bien)` (migration
  `20260830140000_perf_blocages_org`, en prod) remplace N appels par lot en
  préparation (tableau de bord, Parc, fiche bien) ; fiche personne : 8
  allers-retours en cascade → 3 vagues (lots avec bien embarqué) ; fiche bail :
  comparatif + loyers + restitution (retenues embarquées) en une vague ;
  `verifierAccesEspace` : adhésion + organisation en une requête ;
  `staleTimes { dynamic: 30 }` : retour sur un onglet récent sans aller-retour.
- **Tableau de bord** : carte « Incidents par payeur » retirée (tuile Incidents
  conservée), rangée graphique à 2 cartes ; `BarresDouble` : infobulle charte
  au survol/focus (mois, encaissé, dépenses), ancrée à droite sur les dernières
  colonnes ; `globals.css` : curseur main sur boutons/sélecteurs/fichiers.
- **Tests** : 90 unitaires verts, typecheck/lint 0 erreur ; recette navigateur
  (admin.alpha@) : tableau de bord, Parc scindé, fiche personne, fiche bail,
  infobulle vue. Leçon : un `.next` périmé après changement de config rendait
  tout `/agence/*` en 404 — redémarrage propre (`rm -rf .next`) obligatoire.
Recette : scénario 30.9 ; [[Coherence maquette-application]] mis à jour.

## [2026-08-30] dev | Tableau de bord : tuile « Occupation » retirée (doublon du donut)

Demande de Tahir : la tuile Occupation répétait le taux du donut « Répartition
du parc ». Retirée ; rangée KPI à 3 tuiles (À traiter · Incidents · Encaissé).
Recette 30.9.1 et [[Coherence maquette-application]] mis à jour.

## [2026-08-30] query | Sprint « Documents-0 » : cadrage de la génération PDF (bail nu d'abord)

Demande de Tahir : générer des documents PDF depuis les templates
`C:/Users/Admin/Documents/Projet/Gerimmo/pdf-vierges/` (50 épreuves, ex.
01-bail-nu), auto-remplis depuis la base, rangés dans l'onglet Documents.
Constats : les PDF sont des épreuves de validation (pas des formulaires
AcroForm) issues d'un générateur Handlebars (`{{#if}}`, dictionnaire commun,
`_intitules_par_document.js` cités par AUDIT-corrections-appliquees.md) dont
les sources ne sont pas dans les dossiers fournis. Le wiki couvre déjà le
sujet : [[Documents a generer et automatisation WhatsApp]] (catalogue AUTO/ASK),
[[Structure du modèle-type de bail]] (11 sections, 7 champs manquants),
[[Mentions obligatoires du bail]] (décret 2015-587 + 2023-796). Questions de
cadrage posées (sources des templates, moteur de rendu, périmètre, champs
manquants, cycle de vie du document généré, articulation avec le dépôt signé).

## [2026-08-30] query | Documents-0 : les 50 templates dépouillés, classement par couverture base

Réponses de Tahir au cadrage : templates = design/sections de référence (pas de
sources Handlebars fournies) ; vrai fichier PDF fidèle à la mise en forme ;
champs manquants à déterminer ensemble ; bouton « Générer le bail » sur le bail
en brouillon dès le locataire renseigné (cycle de vie à préciser plus tard).
Analyse livrée : extraction automatique des champs (italiques) des 50 épreuves,
croisée avec le schéma réel. Manques transverses : adresse postale du bailleur
(persons sans adresse), identité réglementaire de l'agence (organizations n'a
que name), IBAN, commune de signature, qualité du bailleur, commune de
naissance. Classement en 4 tiers : 8 docs quasi 100 % auto (notice, quittance,
reçus, IRL, prorata, avis d'échéance, rappel assurance) ; bail nu ≈ 70 %
(manques descriptifs logement + zone tendue détaillée + caution structurée) ;
tier 4 dépendant de modules futurs (Stripe S11, artisans S13, registre S9b).
Proposition : démarrer tier 1 + bail nu avec formulaire de complément.

## [2026-08-30] query | Documents-0 : dictionnaire annoté des baux (01-10) croisé avec la base

Nouveau livrable de Tahir : `pdf-vierges/baux-annotes/` — PDF annotés + 
`champs-baux-et-annexes.md` (459 champs, 147 blocs conditionnels, boucles,
statuts Automatique / À demander / Relevé sur place). Analyse croisée avec le
schéma réel : le « Automatique » du dictionnaire suppose des fiches enrichies
(~16 champs manquants sur bailleur/lot/bien pour le bail nu : adresse+qualité
bailleur, chauffage/eau chaude, TIC, parties communes, dernier loyer, loyers de
référence, permis de louer, servitude…) ; inversement ~11 de ses « à demander »
sont déjà portés par baux (loyer, charges+mode, dépôt, dates, jour, IRL
trimestre). État réel : notice 100 % (table `textes` à créer), DDT ~23/37
(résultats, GES, diagnostiqueur manquants ; type « bruit » absent de l'enum),
inventaire ✓ (version sortie à faire), bail nu ~40 % aujourd'hui, avenant au
bail = questionnaire pur (24 champs). Dette de référentiel consolidée remise à
Tahir. Proposé : ingérer le dictionnaire comme source wiki, puis sprint =
fiches enrichies + moteur de rendu + « Générer le bail » (docs 01/05/06/07).

## [2026-08-30] query | État des lieux global de la génération de documents (50 templates)

Synthèse filée : [[Etat des lieux generation de documents]] — fusion du
classement des 50 épreuves et du dictionnaire annoté 01-10, en 4 vagues
(A : 8 docs quasi 100 % auto ; B : bien couverts ; C : baux + questionnaires ;
D : dépendants S9b/S11/S13), manques transverses, dette de référentiel
consolidée et ordre de réalisation proposé. Index mis à jour.

## [2026-08-31] query | Documents-0 : statuts revérifiés contre le schéma de production

Demande de Tahir : ne pas se fier au dictionnaire annoté pour le « présent en
base » — vérification faite via information_schema (36 tables). Corrections :
diagnostics.diagnostiqueur existe (nom), etats_des_lieux.date_edl/signe_le
existent, biens porte syndic_nom/email + reference_copropriete + zone_tendue,
incidents plus riche qu'annoncé (47 passe en vague B), lots.description
disponible. Confirmés manquants : adresse et lieu de naissance des personnes,
chauffage/eau chaude/TIC/parties communes/permis/servitude/dernier loyer/
loyers de référence (lot), certification+assurance diagnostiqueur, GES,
dépenses d'énergie, date de signature du bail, IBAN, identité agence.
[[Etat des lieux generation de documents]] corrigé (note de vérification).

## [2026-08-31] plan | Sprint « Documents-0 » arrêté : socle de rendu → vague A → bail nu

Décision de Tahir : socle de rendu basé sur les épreuves pdf-vierges, puis
vague A (8 documents 0 question) + bail nu ; toute donnée absente reste en
libellé de champ de fusion dans le PDF et la liste des manquants est remise en
recette. Hors sprint : questionnaire, enrichissement des fiches, baux 02-04,
cycle de vie avancé. Hypothèses posées : génération manuelle (bouton), bail
généré non signé jamais exposé au locataire. Sprint inscrit au
[[Plan de livraison et sprints]] avant la Recette V0.

## [2026-08-31] plan | Documents-0 élargi : EDL, inscription propriétaire enrichie, profil d'organisation

Ajouts de Tahir au sprint : génération des EDL d'entrée/sortie (14/15) depuis
la grille réelle ; formulaire d'inscription du propriétaire complété des infos
nécessaires aux documents (adresse, téléphone, qualité) ; page profil de
l'organisation (agence et PD) éditable par le responsable (adresse, téléphone,
email, SIRET) pour l'en-tête/pied et le « Fait à ». Plan mis à jour.

## [2026-08-31] dev | Sprint « Documents-0 » livré : socle de rendu, vague A, bail nu, EDL, identité

Livré (commits `7d51f80` + suivant, migration `20260831100000_documents0_identite`
appliquée en prod) : socle de rendu fidèle aux épreuves (gabarit encre/laiton,
Caladea embarquée base64, pied « Réf · Modèle 2026.11-g1 · Empreinte » sur
chaque page, rendu Chromium réutilisé — 1,9 s la première génération, ~1,1 s
ensuite) ; action générique (GED + liens bail/personne/lot + revalidation +
liste des manquants) ; bouton commun avec toast et « Ouvrir le PDF ».
Modèles : 18/19 quittance-reçu, 17 avis, 20 reçu de dépôt, 23 révision IRL,
21 prorata, 13 rappel d'assurance, 05 notice (rubriques condensées fidèles),
01 bail nu (sections I→XII conditionnelles, dépôt en toutes lettres, refus
propre du meublé), 14/15 EDL (grille réelle, compteurs, clés, comparatif et
vétusté en sortie). Identité : persons + organizations enrichies, inscription
propriétaire complétée (adresse/tél/qualité), page Profil de l'organisation
(nom du bandeau cliquable), correctif du libellé « Bail signé » sur vieux
brouillons. Tests : 13 unitaires modèles + rendu PDF réel (Chrome) ; recette
navigateur sur base réelle : profil rempli, notice/quittance/avis/bail nu/EDL
générés, tous visibles dans Documents avec leurs règles de conservation.
Recette humaine remise : § 2.000 (D0.1 → D0.5) avec le tableau des parcours et
la liste des champs restés en libellé par document.

## [2026-08-31] revue | Documents-0 : passe qualité, responsive, règles, intégration

Re-tests demandés par Tahir après la livraison Documents-0 :
- **Unitaires** 104 verts · typecheck/lint 0 erreur.
- **Intégration SQL rejouée et étendue : 22/22** (18 scénarios Alertes &
  documents + 3 nouveaux « identité » : profil modifiable par le responsable,
  statut toujours réservé au SA, persons porte adresse/qualité) — importante
  après la migration identité.
- **Règle d'accès vérifiée en prod** : 0 document généré ne fuit vers le
  locataire (mes_pieces_locataire = 4 pièces légitimes, 0 générée).
- **Revue ergonomique navigateur** (bail/loyers, dépôt, fiche personne,
  profil, inscription, documents, grille EDL) : boutons alignés, rien de
  cassé ; ligne d'échéancier lisible (Impayé · quittance · Envoyer · PDF ·
  Avis PDF). Correctifs mobile : les groupes d'actions de l'échéancier et du
  dépôt replient désormais (flex-wrap) — l'audit responsive s'est fait par le
  code, la fenêtre Chrome maximisée refusant le redimensionnement.
- Optimisation déjà en place confirmée : navigateur Chromium réutilisé
  (~1,1 s par PDF après le premier).


## [2026-09-04] maintenance | Fichier de relais reprise-mobile remis à jour

`app/docs/reprise-mobile.md` était figé au 3 août (S7 « non commencé », arbitrage
des 16 propositions visuelles « en cours »). Réécrit à la date du jour depuis le
journal et les livrables : sprints livrés (S7, S9a, Alertes & documents,
Documents-0), 104 + 22 tests, charte v2 actée, sujets ouverts (recette D0,
vagues B→D, reste V0), pointeurs vers les livrables actuels.

## [2026-09-04] ingest | Maquette v3 — prototype cliquable (dépôt de Tahir, à intégrer)

Nouvelle version du prototype déposée (459 Ko, ~1 900 lignes changées contre la
v2 du 23/08), rangée dans `raw/maquettes/2026-09-04-gerimmo-prototype-v3.html`.
Demande : intégrer fonctionnalités et visuel à l'application. Page source créée
(`wiki/sources/2026-09-04-maquette-v3-prototype.md`) : inventaire complet
(réseau artisan porté par Gerimmo, reprise de portefeuille, dossier de pièces,
EDL de sortie guidé, page Quittancement, périmètre « mon portefeuille » agent,
parc accordéon, PD multi-organisations SCI + fiscalité ventilée, préavis/congé/
garanties, fonds mandants enrichis, onglet locataire Loyer & quittances),
partie déjà couverte par l'app, **6 contradictions référentiel à trancher**
(artisan, exclusivité PD/PM, natures de bail, fiscalité V2, Yousign, WhatsApp)
et découpage d'intégration T1 → T8 soumis à arbitrage.

## [2026-09-04] decision | Maquette v3 : trois arbitrages tranchés, intégration lancée par T1+T2

Tahir a tranché : **pivot artisan assumé** (conformité portée par Gerimmo,
auto-inscription + validation super admin, vigilance retirée à l'agence —
[[Artisan]] mis à jour), **exclusivité PD/PM maintenue** (cumul de la démo v3
= facilité de maquette), **démarrage par T1 + T2** (visuel & périmètre agent,
EDL de sortie guidé). Natures de bail et périmètre fiscal PD restent à
trancher avant T4/T6.

## [2026-09-04] dev | Maquette v3 — tranches T1 + T2 livrées (visuel & périmètre agent, EDL guidé)

Six chantiers sur la branche `claude/reprise-mobile-docs-x6ku40`, build de
production vert, 96 tests unitaires verts, 3 migrations appliquées en prod :
- **Parc en accordéon** : biens dépliables → lots → détail complet en ligne
  (état dans l'URL, rendu serveur conservé), puce « N manquants » par lot.
- **EDL de sortie guidé** : rappel de l'état et de l'observation d'entrée par
  ligne, badge « Dégradé depuis l'entrée », « = Entrée » et section conforme,
  barre d'avancement, signature confirmée en annonçant les écarts.
- **Quittancement du mois** (comptabilité) : RPC `quittancement_mois`,
  encaisser le reste en un clic, émettre, envoi groupé des quittances.
- **Fil « Ce qui vient de se passer »** au tableau de bord (encaissements,
  EDL signés, rapports envoyés, incidents), pastille Nouveau, temps relatif.
- **Locataire « Loyer & quittances »** : prochaine échéance détaillée, régime
  de charges (RPC enrichi charges_mode/jour_echeance), historique quittances.
- **« Mon portefeuille »** (RM-18.1.3) : `mandats.agent_account_id` +
  « Confié à » sur la fiche mandant ; parc, tableau de bord et comptabilité
  filtrés sur les mandats confiés ; nav agent sans Documents, compta
  « Loyers & rapports ». Reste à modéliser : suppléance RM-18.1.6/7, blocage
  de désactivation RM-18.1.4.

## [2026-09-04] decision | Carte blanche : natures de bail et fiscalité PD tranchées, merge en production

Tahir donne carte blanche sur les deux points restants de la maquette v3 :
**natures de bail** — V0 = module 1 (nu, meublé, colocation bail unique) ;
contrats séparés en V1, autres natures hors périmètre produit
([[Types de baux]]). **Fiscalité** — phasage du 25/07 maintenu : ventilation
par quote-part (indivision, SCI IR) = présentation 2044 → T6 ; LMNP/BIC = V2
([[Fiscalité]]). Plus aucun arbitrage en attente. La branche
`claude/reprise-mobile-docs-x6ku40` (T1+T2 + wiki) est mergée dans `main`
pour publication Vercel.

## [2026-09-04] recette | Retour de Tahir : le Parc revient à la vue scindée

« Le parc, je préférais avant » : l'accordéon de la maquette v3 est retiré,
la vue scindée liste + panneau (30/08) est restaurée — enrichie du filtre
« mon portefeuille » et du bouton « État des lieux en cours » sur le lot.
L'écart avec la v3 est assumé et tracé ici : sur ce point, l'application
prime sur la maquette.

## [2026-09-05] dev | Espace locataire v10 : montée en gamme intégrée (maquette du jour)

Maquette `raw/maquettes/2026-09-05-espace-locataire-v10.html` intégrée en une
vague, améliorée et uniformisée : navigation latérale encre (rail d'icônes en
mobile), cartes adoucies (rayon 14, ombre douce) sur les jetons de la charte
v2, **nouvelle page Accueil** (hero logement, 3 KPI réels, gestionnaire,
urgence), **Mon logement** (bail en clair, préavis expliqué, dépôt pédagogie,
**congé donné depuis l'espace** — RPC mon_conge_locataire : préavis 1 mois si
meublé/zone tendue sinon 3, bail en préavis, alerte gestionnaire), **Mes
paiements** (12 mois en pastilles), **Mes documents** (assurance en tête),
**Signaler un problème** (urgence sans WhatsApp, suivi), **Mon gestionnaire**
(RPC dédié : agence + titulaire du mandat) et **FAQ**. Uniformisations
assumées : e-mail/espace au lieu de WhatsApp (canal non construit), virement
au lieu de prélèvement, aucune photo ni donnée fictive ; messagerie,
notifications, rendez-vous, annonces d'immeuble et relevé de compteur
attendront leur backend. Au passage, mon_bail_locataire v4 **répare la perte
de document_signe** introduite le 04/09. 96 tests verts, build vert.

## [2026-09-05] dev | Espace locataire : la vague backend (messagerie, annonces, attestation, mode d'emploi)

Ce qui manquait de « vrai » derrière la maquette v10 est construit :
- **Messagerie locataire ↔ gestionnaire** : table `messages` (RLS, accès par
  RPC definer uniquement), fil sur « Mon gestionnaire » avec suggestions,
  badge de non-lus au menu, carte Messages sur la fiche personne côté agence
  (ouvrir la fiche marque lu), alerte « Nouveau message de X » dédoublonnée
  tant que le fil a une alerte ouverte.
- **Annonces d'immeuble** : table `annonces`, carte de publication sur la
  fiche du bien (texte + date de fin, retrait), bandeau « Dans votre
  immeuble » sur l'accueil des locataires du bien.
- **Attestation de bon paiement** : page imprimable `/attestation-loyer`,
  délivrée seulement si le compte est réellement soldé (sinon la page
  explique), liée depuis Mes paiements.
- **Mode d'emploi du logement** : les infos pratiques du bien
  (`bien_infos_pratiques`, déjà saisies côté agence) ouvertes au locataire
  sur « Mon logement » (RPC dédié).
Restent volontairement en attente : rendez-vous (chantier interventions T5),
relevé de compteur (avec la régularisation), attestation CAF officielle
(vague documents). Migrations appliquées en prod, build et tests verts.

## [2026-09-05] dev | Portail locataire fermé : les manques du référentiel comblés

Suite du croisement wiki ↔ application (« fais ce qui manque ») :
- **Pièces réclamées** (RM-0b.2.5) : table `pieces_demandees`, carte
  « Pièces réclamées » sur la fiche personne (demande avec libellés d'un
  clic, relance, annulation), dépôt en un geste depuis « Mes documents »
  du locataire (mêmes contrôles de fichier que l'attestation), demande
  soldée automatiquement, alerte à la réception, badge au menu.
- **Décompte de restitution** (module 2.7) : carte « Votre dépôt de
  garantie » sur Mes paiements — suivi du délai dès la remise des clés,
  puis décompte détaillé UNIQUEMENT une fois finalisé (RM-2.6.2) :
  impayés imputés, chaque retenue avec coût, vétusté déduite et
  **justificatif consultable** (mon_document_locataire étendu).
- **Relances visibles** (module 3.12) : les relances reçues s'affichent
  au locataire, sans les notes internes (RM-3.12.2).
- **Description d'incident facultative** (RM-19.2.2) : report du 21/08
  **levé par Tahir** — la photo était déjà le premier champ ; désormais
  une photo OU une phrase suffit (l'agence, elle, décrit toujours), et
  les écrans replient proprement une description absente.
Migration `portail_locataire_complet` appliquée en prod ; 96 tests
verts, build vert. Le portail locataire du référentiel est couvert, aux
chantiers transverses près (interventions/artisans T5, Yousign V1,
WhatsApp).

## [2026-09-05] dev | Espace propriétaire : montée en gamme intégrée (maquette PC v1)

Maquette `raw/maquettes/2026-09-05-espace-proprietaire-v1.html` intégrée :
- **Chrome premium** : le propriétaire direct quitte l'habillage agence —
  barre latérale encre (même langage que l'espace locataire), menu dédié
  (Accueil, Mes lots, Locataires & baux, Incidents, Livre & fiscalité,
  Documents, Alertes, Mon abonnement, FAQ) avec badges, **sélecteur
  d'organisation** (nom propre / SCI) dès qu'il a plusieurs organisations —
  la bascule change tout : lots, livre, fiscalité (chaque org reste étanche).
- **Accueil dédié** : hero patrimoine (« aucun honoraire, jamais »), KPI
  réels (encaissé du mois, récap 2044, lots loués), « À faire » (alertes),
  **veille réglementaire DPE F/G** (diagnostics.classe_dpe : G interdit,
  F au 01/01/2028) et résumé d'abonnement.
- **Fiscal ventilé** : colonne « votre quote-part » quand un lot est détenu
  en indivision (detentions.quote_part), **lots meublés écartés et totalisés
  à part (BIC)**, note copropriété 229/230 — +3 tests unitaires (99 verts).
- **Mon abonnement** : la grille ACTÉE du 25/07 (1ᵉʳ bien offert,
  2,50 €/bien/mois) — pas le « 12 € » de la maquette — biens décomptés,
  statut d'essai, mention honnête du paiement à venir (S11). **FAQ** réelle.
Écarts assumés : devis d'incident à valider → chantier T5 ; recherche ⌘K,
notifications, bot et « IA lit le bail » → hors vague (canaux/chantiers
dédiés). Uniformisation : mêmes classes premium que le locataire.

## [2026-09-05] decision | Prix de l'abonnement PD : 5,99 €/bien/mois

Décision de l'humain (session mobile) : « l'abonnement sera a 5e99 par bien ».
Le prix par bien supplémentaire passe de **2,50 €** (acté le 25/07) à
**5,99 €/bien/mois**. Inchangés (non revus, hypothèses conservées) : 1ᵉʳ bien
offert à vie, pas de mise en place ni de redevance pour les PD, essai 14 jours,
grille agences. Répercuté :
- app : `abonnement/page.tsx`, `accueil-proprietaire.tsx`, `faq/page.tsx` ;
- wiki : [[Grille tarifaire]] (callout de révision), [[Onboarding et
  abonnement]], [[État du projet et décisions ouvertes]].
Note : le positionnement « moins cher que Rentila » du 25/07 ne tient plus
(2 biens ≈ 72 €/an vs ~49 €/an) — montée en gamme assumée.

## [2026-09-06] lint | Audit des espaces locataire et propriétaire

Audit pré-recette demandé par l'humain (avant ses premiers tests) : quatre
passes exhaustives (espace locataire, espace PD, conformité au référentiel,
flux croisés locataire↔bailleur) + tests machine (99 tests verts, build OK,
78/78 RPC présentes en prod, advisors 0 erreur). Câblage sain — aucun bouton
mort, aucun lien cassé — mais **10 bloquants sémantiques**, dont : congé en
ligne contraire à RM-A3 (valeur probante), colocataire pouvant résilier seul,
préavis annoncé ≠ appliqué, lot non passé en préavis, quittances 404 pour les
colocataires, justificatifs de retenue au téléchargement impossible (policy
storage), déconnexion impossible sur mobile, impasse détention/indivision PD,
« honoraires » affichés au PD, EDL invisible côté locataire. Rapport complet :
[[Audit espaces locataire et proprietaire]] — 4 points à trancher soumis à
l'humain, plan de correction en 3 vagues proposé.

## [2026-09-06] decision | Correctifs de l'audit — carte blanche

L'humain a donné carte blanche sur les 4 points à trancher de
[[Audit espaces locataire et proprietaire|l'audit]]. Décisions prises :
1. **Congé locataire = intention de congé** (conforme [[Notification et valeur
   probante|RM-A3]]) : le portail prévient le gestionnaire (alerte + mot du
   locataire, visible sur le bail), le congé se donne par LRAR et
   `enregistrer_conge` (date de première présentation) solde l'intention.
   Plus de bascule du bail depuis l'espace locataire.
2. **Tout locataire du bail** (principal ou colocataire) peut transmettre une
   intention — elle n'engage rien, le gestionnaire arbitre.
3. **Détention & quotes-parts ouvertes au propriétaire direct** : l'indivision
   promise (quote-part fiscale) devient saisissable ; l'impasse « détention
   incomplète » est levée.
4. **EDL côté locataire différé** (S13 mobile) ; le texte qui promettait des
   créneaux est corrigé.
Également corrigés : lot en préavis + échéance d'alerte (rattrapage en prod),
quittances ouvertes aux colocataires, policy storage des justificatifs de
retenue et de régularisation, alerte messages fermée à la réponse, préavis
unifié écran/serveur (colocation meublée = 1 mois), déconnexion mobile
(les deux espaces), « honoraires » retirés de l'écran PD, vocabulaire
agence/mandant neutralisé chez le PD, badges et compteurs locataire mis en
cohérence, `deposer_mon_attestation` re-vérifie l'adhésion, grants `anon`
révoqués, table héritée `demandes_pieces` supprimée.
Migrations : `20260906100000_correctifs_audit`, `20260906101000_preavis_colocation_meuble`.
Vert : 99 tests, 0 erreur TS/lint, build OK.

## [2026-09-06] decision | Chantiers différés, site vitrine, jeu de démo (carte blanche)

Trois livraisons d'un coup (carte blanche de l'humain) :
1. **Chantiers différés de l'audit soldés** — migration `chantiers_differes` :
   compteur de messages non lus côté gestionnaire (pastilles sur Personnes,
   badge barre latérale PD) ; **locataire sorti = espace en lecture** (adhésion
   désactivée : quittances, décompte de restitution, retenues, justificatifs
   et fil de messages restent consultables ; tout geste reste réservé à
   l'adhésion active — carte « Ancien espace locataire » sur Mes espaces,
   bannière « bail terminé ») ; **EDL visibles côté locataire** (carte « Mes
   états des lieux » sur Mon logement, signature sur place inchangée
   RM-13.1.6). Au passage : l'échéancier gagne le contrôle d'adhésion qui lui
   manquait (S-3) et le justificatif de régularisation s'ouvre dans
   mon_document_locataire.
2. **Site vitrine public** sur `/` (visiteur non connecté ; un connecté est
   renvoyé vers ses espaces) : héros, trois personas, six fonctionnalités
   (toutes réelles — politique « fonctionnalités honnêtes »), tarifs
   ([[Grille tarifaire]] : 1ᵉʳ bien offert, 5,99 €/bien/mois, agences sur
   devis), FAQ, **formulaire de demande de devis agences** (table
   `demandes_devis`, insert public avec pot de miel, lecture super admin —
   à raccorder à la console SA, module 16).
3. **Nettoyage des données d'essai + jeu de démo** : baux brouillon
   « Testeur » purgés (l'EDL signé et son bail conservés — un EDL signé est
   figé), comptes jetables désactivés (yopmail, example.com) ; le
   **Parc de Claire Moreau** reçoit un bien (Résidence des Lilas, Lyon,
   zone tendue) + lot T2 disponible + détention 100 %, et un locataire de
   démo **Lucas Bernard** (`locataire.pd@gerimmo-demo.fr`, mot de passe
   commun des comptes de démo) — le bail reste à créer pendant les essais,
   c'est le parcours à tester. Reflet ajouté à `seed.sql`.
Migrations : `chantiers_differes`, `contexte_espace_locataire`, `demandes_devis`.

## [2026-09-06] lint | Audit de vérification de la vague du soir + corrections

Passe adversariale sur les livraisons du jour (chantiers différés, vitrine,
démo) : 3 critiques et 8 majeures, toutes corrigées dans la foulée
(migration `correctifs_verification`) :
- **Préavis unifié partout** : le formulaire de congé du gérant applique
  enfin la même règle que le serveur (colocation meublée = 1 mois, zone
  tendue de plein droit — la case « préavis réduit » disparaît quand le
  mois est de droit) ; le bailleur d'une colocation meublée est à 3 mois.
- **terminer_bail** : le geste de clôture qui manquait — préavis + EDL de
  sortie signé exigés ; bail « terminé », lot disponible, adhésions
  locataire désactivées (espace en lecture), alertes du bail fermées.
  Bouton « Clôturer le bail » sur la fiche du bail. Les quittances des baux
  terminés restent servies par l'échéancier (10 ans).
- **Fichiers du sorti réellement ouvrables** : la garde applicative des
  routes fichier acceptait seulement l'adhésion active — mode lecture ajouté.
- **Alertes gérables** : les alertes à lien (message, pièce, congé, EDL)
  gardent l'accès à la modale (confier / fermer) via un second bouton, et le
  lien profond depuis « Mes espaces » navigue vers le bon écran.
- **Console SA / devis** : page `/admin/devis` (liste, marquer traitée) —
  la promesse « réponse sous 48 h » a désormais un lecteur.
- **Vitrine honnête** : mention « révision IRL » retirée des alertes (pas
  d'alerte IRL en V0), « reprise de portefeuille » retirée (T7 non livré) ;
  page `/confidentialite`, note RGPD sous le formulaire, champ téléphone ;
  rétention 24 mois des demandes de devis et intentions traitées
  (appliquer_retention).
- Divers : gestionnaire/incidents lisibles par le sorti, dédoublonnage de
  l'intention par personne (le mot du colocataire compte), EDL du seul
  dernier bail, badges messages revalidés à la réponse, gestes masqués au
  sorti (signalement, attestation).
Vert : 99 tests, 0 erreur TS/lint (14 avertissements de référence), build OK.
Restent notés (mineurs assumés) : pas de limite de débit sur le formulaire
public (pot de miel seul), badge messages absent du chrome agence classique
(vague « agence » à venir), mentions légales complètes à publier quand la
raison sociale/SIREN seront fournis par l'humain.

## [2026-09-08] ingest | Maquette espace agence v6 (agent + admin)

Maquette archivée (`raw/maquettes/2026-09-08-espace-agence-v6.html`), page
source créée ([[2026-09-08-maquette-espace-agence-v6]]) avec inventaire et
contradictions — la principale : la « Compta & fonds mandants » de la maquette
contredit RM-A6.1 actée (« journal de gestion, jamais de comptes mandants »),
non reprise en l'état. Intégration vague F :
- **Chrome premium agence** : agent et admin passent sur la barre latérale
  encre (même langage que locataire/propriétaire) — l'agent voit « Mon
  portefeuille », l'admin « Parc de l'agence », badges incidents/alertes/
  messages, sortie mobile ; l'onglet Documents s'ouvre aux agents.
- **Nouvelles pages réelles** : Messages (fils par personne, RPC
  `fils_messages_gerant`), Mandats & rapports (admin — mandats actifs,
  dernier CRG, versements attendus), Administration (admin — équipe et
  portefeuilles réels, abonnement honnête « sur devis », journal d'audit
  documenté), Statistiques (résolution sous 15 j, délai moyen, imputations,
  lots les plus signalés — périmètre portefeuille pour l'agent).
- **Tableau de bord** : salutation + puces (actions, incidents à qualifier,
  messages) façon v6, le reste (tuiles, fil, donut, semaine) déjà conforme.
Écarts assumés (chantiers) : cloche (30/08), ⌘K, bot/WhatsApp (S12), devis
artisans (T5), agenda (S9b), reprise de portefeuille (T7 — la maquette en
fournit la spécification), Stripe agence (S11), factures d'honoraires (18.6),
délégation de portefeuille (S9b).

## [2026-09-08] decision | Chantier documentaire (vague G)

Demande de l'humain : « l'aspect documentaire doit être terminé — savoir où
trouver les infos, les demander si manquantes, remplir automatiquement,
présenter en PDF, envoyer pour signature, signature préenregistrée » — pour
les quatre personas. Livré sur le socle Documents-0 (9 modèles, fusion avec
manquants, PDF charté, GED) :
1. **Où renseigner** : chaque champ resté en libellé dans un PDF généré
   pointe désormais l'écran où la donnée se saisit (profil de l'organisation,
   fiche personne, fiche bail, fiche lot) — résolveur `ou-renseigner` testé.
2. **Signature préenregistrée** : l'organisation dépose une image de
   signature (profil, responsable seul) ; elle s'appose sur les documents
   émis SEULE — quittances, reçus, avis d'échéance, prorata, révision IRL,
   rappel d'assurance. **Jamais sur un bail ni un EDL** : là, la signature
   reste un acte des parties (RM-13).
3. **« Envoyer pour signature »** : depuis la fiche d'un document rattaché à
   une personne — le document apparaît dans « À signer » de son espace, elle
   le télécharge, le signe, dépose le signé ; alerte `signature_retournee`
   au gestionnaire (table `demandes_signature`, circuit du signé déposé —
   Yousign S10 prendra le relais en ligne).
4. **PDF chez le locataire** : ses quittances, reçus et courriers générés
   (liés à sa fiche) arrivent dans « Mes documents » — plus seulement ses
   pièces de dossier ; badge Documents inclut les signatures attendues.
Boutons de génération déjà en place sur les écrans partagés (bail, loyers,
EDL, personnes, dépôt) — agent, admin et propriétaire direct les partagent.
Migrations : `signature_documentaire`, `fils_messages_gerant`.
Vert : 103 tests (+4), 0 erreur TS/lint, build OK.

## [2026-09-09] lint | Audit multi-agents des vagues agence v6 + documentaire, corrections

Trois agents d'audit en parallèle (espace agence, chantier documentaire,
transversal/régressions), constats croisés puis corrections en une vague
(migration `20260909100000_correctifs_audit_documentaire` appliquée en prod +
UI) :

- **Bloquants corrigés** : l'image de signature était illisible (la policy
  Storage `ged_select` exige une ligne `documents` — policy dédiée, et l'ancien
  fichier part en purge au remplacement/retrait) ; la route fichier locataire
  refusait quittances, courriers, retours signés et même le locataire sorti
  (`log_document_access` délègue désormais à `mon_document_locataire` — la
  liste de droits ne vit plus en double).
- **Fuite refermée** : tout `courrier` rattaché à une fiche devenait visible du
  locataire (mise en demeure en préparation comprise). La mise à disposition
  redevient un GESTE (RM-12) : colonne `partage_le`, bouton « Mettre à
  disposition du locataire » sur la fiche de la pièce, réversible. Le test
  « Courrier interne » redevient la règle.
- **« Envoyer pour signature » durci** : RPC unique avec gardes — types
  signables (bail/courrier/quittance, jamais un EDL, RM-13.1.6), signataire
  rattaché au document, espace locataire actif obligatoire, une demande en
  attente par document+personne (index partiel), FK composites même-org ;
  demandes visibles et annulables sur la fiche ; le signé retourné hérite des
  rattachements du document d'origine ; redépôt du fichier non signé → message
  métier ; alerte `signature_retournee` routée vers la fiche GED ; `key` sur le
  circuit (en vue scindée, l'état client visait l'ancien document).
- **Périmètre agent (RM-18.1.3)** : Messages et son badge au portefeuille EN
  SQL (`perimetre_persons_gerant`) ; GED filtrable par lots (`p_lots` sur les
  trois fonctions), page Documents cadrée « Mon portefeuille ».
- **Espace agence** : profil atteignable sous 860 px (icône dans l'en-tête,
  agence ET propriétaire), date de salutation en casse naturelle (l'utilitaire
  `normal-case` perdait contre `.mono-discret`, hors cascade layer),
  Administration honnête (comptage sous mandat actif, portefeuilles alignés sur
  lib/portefeuille, « suspendue » plus jamais en pastille verte, phrase « sans
  titulaire » corrigée), erreurs Supabase affichées au lieu d'écrans faussement
  vides (Messages, Mandats, Administration, Statistiques), libellés menu/pages
  alignés, `nav-agence.tsx` (mort) supprimé, émojis retirés, RPC non-lus mise
  en cache (un aller-retour au lieu de deux par page), états de mandat en
  français, ancre #messages depuis la liste des fils.
- **Où-renseigner refondu** sur les libellés RÉELS des 9 modèles (« commune de
  naissance » ne part plus au profil de l'organisation ; l'identité du bailleur
  part vers les détentions) ; le modèle départage les libellés ambigus ; tests
  réécrits sur ces libellés (105 verts).
- **Colocataires** : les PDF générés se rattachent à tous les locataires du
  bail (`liensLocataires`), plus seulement au principal.
- **Rétention** : `demandes_signature` purgées avec le document ou 24 mois
  après signature ; dates affichées sur l'horloge de Paris (formaterDate).

Pages mises à jour : [[Document]], [[Signature électronique]],
[[Notification et valeur probante]], [[Organisation]], [[RGPD]],
[[Agent immobilier]], [[2026-09-08-maquette-espace-agence-v6]].
Portes : tsc 0 erreur, lint 14 warnings (base), 105 tests, build OK, advisors
sans nouveau signalement.

## [2026-09-09] ingest | Recette Tahir — espace propriétaire (5 retours) + super admin

Cinq retours de recette, traités en une vague (reconnaissance par 4 agents,
balayage par 10 agents + contrôle) :

- **Bandeau propriétaire** : « Espace propriétaire » vit dans la barre
  blanche ; le nom du propriétaire (« Parc de Prénom Nom · Propriétaire
  bailleur ») disparaît — le sélecteur de la barre latérale dit déjà où l'on
  est.
- **Spinner généralisé** : nouveaux composants partagés `Spinner` et
  `BoutonEnvoi` (useFormStatus — le bouton se désactive et affiche la roue
  tout seul dans un formulaire). Balayage des 59 composants de formulaire du
  dépôt : tous les boutons d'envoi (création de bien en tête) montrent la roue
  pendant l'envoi ; les boutons à ellipse nue « … » la remplacent par la roue.
- **ERP & termites** (question) : l'immeuble est le BON niveau — conforme au
  tableau de [[Diagnostic]] et au modèle (contrainte un-seul-niveau ; ERP par
  zonage d'adresse, termites par bâtiment/arrêté préfectoral ; en location le
  termites n'entre pas dans le DDT — veille seulement). Les fiches bien et lot
  rappellent désormais la répartition ; réponse et points à sourcer consignés
  dans [[Diagnostic]].
- **Création rapide d'un locataire** : le select « Locataire principal » du
  bail propose « + Nouveau locataire… » — pop-up (nom, prénom, email unique
  par agence), fiche créée AVEC le bail, même patron que le nouveau
  propriétaire de la détention.
- **Super admin** : le compte de Tahir porte désormais le rôle (adhésion
  super_admin active, sans organisation) ; le compte de démo
  superadmin@gerimmo-demo.fr est désactivé.

Portes : tsc 0 erreur, lint 14 warnings (base), 105 tests, build OK.

## [2026-09-09] ingest | Documents de base terminés (carte blanche) — bail 100 % rempli + 6 nouveaux modèles

Demande : « finir les documents de base — tout se remplit et se change de
manière automatique et structurée ». Une vague en trois temps (reconnaissance
3 agents, construction 10 agents en parallèle, intégration) :

- **Bail 100 % rempli** : migration `20260909140000_bail_complet_champs`
  (appliquée en prod) — 28 nouveaux champs à leur bon niveau : organisation
  (carte professionnelle, garantie financière, IBAN), personne (commune de
  naissance, adresse, qualité), lot (chauffage, eau chaude, locaux
  privatifs), bien (parties communes, accès TIC), bail (fixation et paiement
  du loyer, encadré zone tendue complet, valeur IRL, durée réduite, travaux,
  honoraires, clauses particulières, variante étudiant). Chaque champ a son
  écran : profil, fiche personne, fiche lot/bien, et la nouvelle carte
  « Compléments du contrat » sur le bail (modifiable en brouillon, figée
  ensuite). Les équipements structurés du lot alimentent enfin le contrat ;
  première échéance (avec prorata) et plafond d'honoraires se calculent ;
  les champs facultatifs vides s'impriment « — »/« Néant. » sans compter
  manquants. Un bail aux fiches remplies sort SANS manquant (testé).
- **Six nouveaux modèles** au registre (15 générables au total) : bail
  meublé (inventaire annexé, étudiant 9 mois), acte de cautionnement (par
  garant — et les garants se rattachent désormais à TOUT bail, plus
  seulement en colocation), décompte de restitution, congé du bailleur
  (vente/reprise/motif légitime, préavis 6/3 mois, encadré LRAR RM-A3.1),
  avenant, mandat de gestion (loi Hoguet). La génération accepte des
  « options de geste » (motif, garant, objet) ; boutons posés sur la fiche
  du bail (contrat nu/meublé selon le type, congé bailleur dans la carte
  Congé, avenant, cautionnement) et la fiche du mandant (« Mandat PDF »).
- Où-renseigner étendu (carte pro, garantie financière, inventaire…).

Pages wiki : [[Document]], [[Structure du modèle-type de bail]],
[[Mandat de gestion]]. Portes : tsc 0 erreur, lint 14 warnings (base),
107 tests (+2), build OK.

## [2026-09-09] decision | Super admin transverse (Tahir seul super admin, toutes les autorisations)

Décision de Tahir : son compte est UNIQUEMENT super admin, avec toutes les
autorisations. Mise en œuvre : `org_ids_avec_roles` (le point de passage de
presque toutes les policies RLS et RPC gérants) reconnaît désormais le super
admin — il est réputé porter tous les rôles gérants dans toutes les
organisations (migration `20260909160000_super_admin_acces_transverse`).
Côté application : les gardes (`verifierAccesEspace`, `verifierGerant`) lui
donnent le rôle plein de l'organisation visitée (admin d'agence, ou
propriétaire direct), et « Mes espaces » lui liste toutes les organisations
en supervision, en plus de sa console `/admin`. Son adhésion admin de
l'Agence Alpha est désactivée ; la traçabilité (audit_log, accès aux pièces)
reste au compte. [[Super Admin]]

## [2026-09-09] lint | Audit hors documents (3 agents) + corrections

Trois agents (finances, vie du bail, transverse), puis corrections en une
vague : migration `20260909190000_correctifs_audit_hors_documents` (appliquée
en prod, chaque fonction recréée depuis sa définition de production) + trois
volets applicatifs.

**Critiques corrigées :**
- Finances : la ventilation SANS clé de répartition dupliquait la dépense sur
  chaque lot (désormais refusée ; avec clé, la dernière quote-part rattrape
  l'arrondi) ; la restitution rendait le dépôt CONTRACTUEL au lieu du dépôt
  ENCAISSÉ ; supprimer un encaissement de dépôt ne laissait aucune
  contre-écriture (RM-A6.4 — trigger ajouté, écritures liées à leur
  encaissement) ; la régularisation comparait des provisions proratisées à
  des charges réelles d'exercice entier (RM-3.9.1 — prorata aux jours
  d'occupation) et s'écrasait en silence une fois émise (RM-3.9.7 — refus) ;
  un agent pouvait s'attribuer les mandats ou faire sauter son périmètre
  (trigger : le titulaire ne se change que par le responsable, RM-18.1.4).
- Vie du bail : un EDL de sortie signé avant tout congé rendait le congé
  définitivement inannulable — la sortie ne se crée et ne se signe que
  pendant le préavis ; la grille EDL s'enregistre en une transaction.
- Transverse : la traversée super admin n'était pas journalisée (RM-A1.11) —
  chaque entrée d'espace et chaque action hors adhésion écrit l'audit_log
  (`log_sa_access`) ; décision consignée dans [[Super Admin]] : l'écriture
  totale est voulue (Tahir), la trace est la compensation.

**Majeures corrigées :** périmètre agent sur l'envoi groupé de quittances,
l'export CSV et les rapports de gestion (+ rapports des mandats clos non
versés de nouveau soldables) ; KPI comptables agrégés en base
(`totaux_ecritures`, hors dépôt et contre-passations — ils se calculaient
sur 200 écritures) ; dépôt de garantie sorti du récapitulatif fiscal 2044 ;
lot sélectionnable sur l'écriture manuelle (sinon invisible des rapports) ;
messages honnêtes (encaissement imputé au plus ancien, N quittances émises ;
échec d'envoi de rapport affiché) ; erreurs Supabase visibles (comptabilité,
console admin, supervision, incidents) ; création rapide de locataire durcie
(garde brouillon d'abord, email échappé) ; garants verrouillés sur bail
terminé ; message/motif du locataire conservés en cas d'échec d'envoi ;
équipements du lot transactionnels ; super admin présent dans les listes de
gérants et acceptable comme responsable d'incident ; nom du parc rétabli au
pied de la barre latérale propriétaire ; /nouveau-mot-de-passe accessible.

**Différé (consigné, non corrigé)** : historisation du loyer pour la révision
IRL rétroactive ; circuit de régularisation rectificative ; motif du préavis
réduit structuré ; nom du colocataire dans le bandeau d'intention ;
limitation de débit sur le formulaire public de devis ; arrondis flottants
d'affichage ; refonte de [[Incident]] (callout posé) et compléments
[[État des lieux]] (posés).

Portes : tsc 0 erreur, lint 12 warnings (−2), 107 tests, build OK.

## [2026-09-09] decision | Environnement de test inter-personas (demande Tahir)

Semé en production (données de démo) pour tester les allers-retours entre
espaces : chez « Parc de Claire Moreau », Lucas Bernard a un bail ACTIF
depuis le 01/07 (T2 des Lilas, 780 € + 60 €), trois appels de loyer,
juillet et août encaissés et quittancés (écritures au journal via trigger),
septembre impayé à ce jour, le dépôt de 780 € encaissé, et un fil de
messages avec un non-lu (robinet qui goutte). Chez Agence Alpha, un message
non lu de Julie Leblanc (locataire.alpha). Le mode opératoire du test
multi-personas : deux fenêtres de navigation (une normale, une privée),
un persona par fenêtre.

## [2026-09-09] ingest | Environnement de test complet — « toutes les situations »
Jeu de démo enrichi en production pour couvrir tous les scénarios de recette
(demande Tahir). Côté Parc de Claire Moreau (PD) : profil bailleur complété
(adresse, IBAN, qualité), état civil de Claire/Lucas, candidate **Nadia
Rousseau** (fiche complète, sans compte) avec **bail brouillon 100 % rempli**
sur Appart1 (publié avec DPE C + ERP valides), **ERP expiré** sur la Résidence
des Lilas et **DPE classe G** sur Appart2 (situations bloquantes). Côté Agence
Alpha : **colocation activée** au 2025-09-01 (révision IRL due, dépôt encaissé,
juillet quittancé, **août + septembre impayés**, relance 1 envoyée), **meublé
brouillon avec inventaire** (8 lignes), **dossier locataire sorti complet**
pour Julien Testeur (compte activé, bail terminé mars→août, 6 quittances, EDL
entrée/sortie signés, **restitution finalisée** 780 − 120 de vétusté = 660),
**intention de congé** de Sofia (+ alerte), appel de septembre à encaisser, et
un **mandat actif confié à agent.alpha** sur le lot de Sofia (recette « deux
portefeuilles »). Guide des situations remis en réponse de chat.

## [2026-09-09] ingest | Audit fonctionnel externe — corrections P0/P1/P2 (vague M)
Rapport d'audit manuel reçu (13 anomalies + secondaires). Corrigé le jour même :
- **P0 périmètre agent appliqué en base** : suppression du repli « 0 mandat →
  tout voir », policies RLS restrictives sur ~25 tables, trigger générique
  `garde_portefeuille_agent` sur les mutations, RPC de lecture durcies —
  vérifié par impersonation (agent sans mandat : 0 partout ; admin/PD/locataire
  inchangés). Voir [[Agent immobilier]]. Migration `20260909230000`.
- **P1 PDF Vercel** : `@sparticuz/chromium` externalisé + binaires tracés
  (`serverExternalPackages`, `outputFileTracingIncludes`) ; les erreurs
  techniques de génération sont journalisées sous référence, plus jamais de
  chemin serveur à l'écran.
- **P1 grille EDL** : cast de l'enum `etat_element` dans
  `enregistrer_grille_edl` (la saisie ne se perd plus ; grille déjà pilotée
  côté client). Migration `20260909210000`.
- **P1 fiscal 2044** : ventilation loyers (211) / charges récupérées (212) au
  prorata du bail, réconciliée au centime, 13 tests. Deux choix à valider :
  clé de ventilation au bail actuel (pas historisée par appel) et prorata sur
  paiement partiel.
- **P2 quittances automatiques** : l'encaissement émet/promeut le reçu ou la
  quittance de façon idempotente (unique sur `appel_id`) ; bouton requalifié en
  rattrapage ; solde restant chiffré sur le reçu partiel ; accords sing./pluriel.
- **P2 a11y & mobile** : aria-label complets sur les liens à badge, rail
  repliable + une colonne sous 640 px (page Documents), « Bonjour {prénom} »,
  « Votre gestionnaire » chez le PD, « de juillet à septembre » (élision),
  état vide « Mes paiements » honnête.
- **Nettoyage** : artefacts AUDIT CODEX supprimés (bien/lot/bail/EDL/personne),
  attestation fictive rejetée et retirée (le fichier Storage orphelin
  `21b6ebba….pdf` reste — API Storage requise), typo « rdc cenntre » corrigée.
  Les écritures de test annulées restent au livre (immutabilité).
- Chantier « tableau de bord/alertes = blocages du bail » + plafond du dépôt
  de garantie + compteurs diagnostics unifiés : en cours (même vague).
Restes à faire notés : page Bail en onglets (ergonomie), regroupement des
mandats résiliés, squelettes avec limite de temps, ratio encaissé/appelé
explicité, section « Pièces à renouveler » sous filtre.

## [2026-09-09] ingest | Fin de la vague M — tableau de bord aligné, plafond du dépôt, compteurs diagnostics
Dernier volet des corrections d'audit : source commune `actionsAttendues`
(impayés, EDL d'entrée non signé, diagnostics en défaut, pièces expirées)
partagée entre l'accueil propriétaire, le tableau de bord agence et la fiche
bail — « Rien ne vous attend » ne peut plus contredire un bail bloqué. Plafond
du dépôt de garantie appliqué à la saisie et en base (trigger, migration
`20260909240000`) — voir [[Dépôt de garantie]] (colocation et bail mobilité à
trancher). Compteurs de diagnostics unifiés et étiquetés de leur niveau
(« au lot » / « à l'immeuble ») sur Parc, fiche bien, fiche lot. Fenêtre de
synthèse des alertes redessinée (cartes-rangées cliquables, liseré de
criticité, titres complets) sur demande de Tahir. Donnée de démo corrigée :
dépôt de la colocation Alpha ramené à 300 € (plafond). Publication sur main.

## [2026-09-10] query | Quels spécialistes pour un projet comme Gerimmo ?
Réponse en chat, ancrée sur les réserves déjà documentées dans le wiki :
quatre profils à consulter ponctuellement — praticien de la gestion locative
(entretiens personas, [[Accueil]]), avocat droit des baux / loi Hoguet
(matrice canaux-preuve A3, CGU, [[Notification et valeur probante]]),
expert-comptable immobilier (doctrine A6 « préalable à la commercialisation »,
export SCI-IS, [[Comptabilité]], [[Fiscalité]]), conseil RGPD/DPO (matrice A2,
AIPD score artisan, [[RGPD]]) — plus un audit sécurité avant production
([[Socle de sécurité]]). Rappel du contexte : validations externes **écartées
le 2026-07-25** (revue interne), donc la liste vaut surtout comme jalons
d'avant-commercialisation, pas comme recrutements.

## [2026-09-10] query | Carte blanche pour terminer Gerimmo ?
Tahir, fatigué, demande si l'agent peut finir le projet seul avec carte
blanche. Réponse : oui pour ~90-95 % du restant mesuré (fin S8, S9b,
chantiers maquette T1→T8 et vague F, recette Partie 2, puis V1 S10→S15) —
en tranchant seul les contradictions (documentées, réversibles) et en
convertissant la recette humaine en tests E2E automatisés (Playwright)
pour supprimer le goulot « Tahir testeur ». Résidu incompressible côté
humain : comptes et contrats tiers (Yousign, Stripe KYC, Meta/WhatsApp,
Supabase/Vercel Pro UE, antivirus), go de commercialisation, clients.
Proposition d'un « mode pilote automatique » : l'agent déroule, Tahir ne
lit qu'un digest court avec démos. En attente du « go ».

## [2026-09-10] query | Correction (Tahir) : le module devis-artisans manquait à l'ordre d'attaque
Vérification croisée git + wiki. Fait (S7 incrément 1, validé 24-26/08) :
le cycle de l'incident seul — déclaration, qualification/imputation,
contestation, clôture, réouverture, photos, historique, alertes
([[Cycle de vie d'un incident]] §Implémentation ; tables `incidents`,
`incident_evenements`). Manquant : toute la suite — états artisans
(affecté → en cours → terminé), fiches/réseau artisan (pivot maquette v3),
[[Demande et sélection de devis]], [[Planification d'intervention]] (3+3),
[[Intervention et clôture]] (compte rendu + photo), facture → écriture,
espace artisan (« sans devis ni planning, écran mort » — recette 2.C).
`demandes_devis` en base = formulaire vitrine, pas les devis artisans.
Ambiguïté relevée : les notes du dépôt appellent ce module « S13 » alors
que le plan nomme S13 le mobile ; la maquette v6 le route vers « T5/S9b »
(contradiction n°4). Correction de l'ordre d'attaque carte blanche :
bloc dédié « Artisans-devis-interventions » ajouté — c'est le
différenciateur produit ([[Analyse concurrentielle]]).

## [2026-09-10] ingest | Énoncé fondateur : « faire le travail d'une agence, en mieux, plus vite, moins cher »
Déclaration de vision de Tahir, recueillie en séance — elle comble la lacune
« proposition de valeur » notée à l'[[Accueil]]. Nouvelle page
[[Proposition de valeur]] : le critère de « terminé » devient le travail
exécuté (pas l'écran livré) ; les trois promesses adossées aux pages
existantes ; conséquences sur l'ordre des travaux (artisans-devis-
interventions = cœur, automatisation avant présentation, V1 = fermeture des
boucles sans humain, métrique « temps de gérant par lot/mois »).
Convergence documentée avec [[Analyse concurrentielle]] (« gérer les
problèmes là où les autres gèrent les papiers ») et le pivot réseau artisan
de la maquette v3. Point à trancher posé à Tahir : outil qui exécute
(RM-A6.1 conservée) ou vocation à devenir l'agence (loi Hoguet, carte G,
fonds mandants — contradiction n°1 de la maquette v6). Index et Accueil
mis à jour.

## [2026-09-10] decision | Périmètre de la vision : l'outil fait le travail, pas l'agence
Tahir tranche la question ouverte par l'énoncé fondateur : Gerimmo reste
**l'outil qui exécute le travail** d'une agence — pas de gérance opérée en
ligne, pas d'encaissement pour compte de tiers. Frontière RM-A6.1 confirmée,
contradiction n°1 de la maquette v6 close (les écrans « fonds mandants »
s'intègrent dans les limites du journal de gestion, tranche T8).
[[Proposition de valeur]] passée en stable ; [[État du projet et décisions
ouvertes]] mis à jour — plus aucun arbitrage en attente (2026-09-10).

## [2026-09-10] ingest | Carte blanche : mobile, tests et audit de tout
Tahir donne carte blanche (« je veux une appli mobile qui fonctionne. Fais un
tests et audit de tout par la suite »). Journée en quatre temps.

**1. Une pile de recette hors ligne** (`app/e2e/local/`, mode d'emploi
`app/docs/recette-hors-ligne.md`) : le cloud n'atteignant ni Supabase ni
Vercel, montage d'un Postgres local portant les 128 migrations **dans l'ordre
réel de la production** (l'ordre alphabétique des fichiers est faux) et d'un
émulateur de l'API Supabase où chaque requête passe par le **vrai RLS**.
Au passage : **14 migrations appliquées en prod n'étaient pas dans le dépôt**
— rapatriées.

**2. Mobile** : audit à 390×844 (code + rendu réel), **89 défauts** corrigés
en trois étages (socle transverse, composants partagés, chaque zone), et le
cœur du module 19 livré — brouillon local de la grille d'EDL (RM-19.1.1/2/6/7/9)
et photos compressées à la prise. **44/44 écrans** sans débordement ni erreur.

**3. Tests** : suite Playwright mobile par persona (parcours agence,
locataire, brouillon EDL, audit d'écrans, axe-core) — 16/16 verte ; 48 nœuds
d'accessibilité corrigés ; 21 tests d'intégration ajoutés.

**4. Audit de tout** (4 dimensions en parallèle + vérification adversariale) :
18 trouvailles confirmées, 4 réfutées. **Deux P0 d'étanchéité inter-agences**
(lecture d'un échéancier par un compte sans adhésion ; écriture d'un
encaissement sur le bail d'une autre agence) et **un P0 documentaire** (une
quittance libératoire survivait à la suppression de son encaissement —
4 350 € attestés jamais perçus) : rejoués, corrigés, testés, **appliqués en
production**. Durcissement P1 : encaissement immuable, quittance non
forgeable, contre-écriture et révision IRL non rejouables, un seul bail vivant
par lot, signature d'agence enfin lisible. Synthèse complète et 4 points à
trancher : [[Audit du 10 septembre 2026]].

## [2026-09-10] dev | La suite de tests réapprend le monde du périmètre agent (65 → 1)
L'audit avait réveillé **65 échecs d'intégration antérieurs à lui**, endormis
depuis le 09/09 faute de base de test accessible. Cause unique : la migration
du périmètre du portefeuille (un agent ne touche que les lots des mandats dont
il est titulaire) contre des setups qui montaient tout le parc « en tant
qu'agent ». **Défauts de test, pas de produit.** Réparés par 18 agents (un par
fichier) : c'est un `admin_agence` qui constitue le parc puis confie le mandat
(RM-18.1.3/18.1.4), la session ne repassant en agent que pour le geste testé.
Aucune assertion métier assouplie, aucun test neutralisé, aucune migration
touchée. Trois causes secondaires corrigées au passage (plafond du dépôt,
EDL de sortie signé pendant le préavis seulement, état du lot adossé au bail)
et deux bugs latents des tests eux-mêmes, jusque-là masqués par l'échec du
setup.

**Deux tests encodaient une règle périmée** — le produit avait tranché après
eux : l'activation sans EDL d'entrée (règle du 29/08 **révisée le 30/08**,
[[Bail]]) et la non-requalification d'un incident qualifié (**autorisée le
23/08**, [[Incident]]). Réalignés sur la règle en vigueur, qu'ils vérifient
désormais dans les deux sens.

**Lacune documentaire trouvée** : la règle de requalification du 23/08 n'avait
jamais été écrite au wiki. Écrite ce jour dans [[Incident]] — et elle rend
**RM-7.5.3 inapplicable** en l'état (l'imputation est dite « révisable après
diagnostic », or le diagnostic a lieu à un état où le code refuse désormais
toute requalification). Contradiction signalée, non tranchée.

**État : 261 verts / 1 rouge assumé / 2 ignorés (264)**, typecheck et lint à
0 erreur. Le rouge est la colocation meublée : le produit s'y contredit
lui-même (`encaisser_depot` lit `lots.meuble` et ouvre 2 mois, le déclencheur
`controler_plafond_depot_garantie` ne lit que `baux.type` et refuse à 1 mois).
Le déclencheur étant le plus strict, la règle effective reste 1 mois, conforme
au wiki, et aucune fuite d'argent n'est possible — mais la question est
juridique et revient à Tahir. Test laissé rouge exprès, avec le diagnostic en
commentaire, pour qu'elle ne s'oublie pas.

## [2026-09-10] dev | Second tour de durcissement : les 8 lots restants de l'audit, appliqués en production
Huit défauts P1/P2, un correcteur et un **vérificateur adversarial** par lot.
Le vérificateur a pris le correcteur en défaut **5 fois sur 8** — contournement
par bornes infinies, garde annuelle qui ne bornait rien, correction non durable,
lot quitté par un bail déménagé, quatrième producteur de contre-écritures. Tout
a été rejoué en base avant ET après correction, jamais raisonné sur le code.

**Ce que l'audit avait sous-estimé.** L'advisor disait « non exploitable » pour
trois fonctions déclencheur exécutables par `anon`. Faux : `execute` est aussi
le droit qui autorise à ACCROCHER la fonction à une table à soi, et `anon` a
`temporary`. Rejoué — une contre-écriture de 1 200 € forgée dans l'organisation
d'une victime, RLS hors-jeu puisque la fonction est `SECURITY DEFINER`. Fermé
sur les 31 fonctions déclencheur, pas seulement les trois signalées.
Même famille : `anon` portait `TRUNCATE` sur `encaissements`, `quittances`,
`ecritures`, `clotures_comptables`, `messages` — **la RLS ne couvre pas
TRUNCATE, seul le privilège compte**. Vérifié en production avant correction.
Portée honnête : ces deux voies exigent un accès SQL direct, elles ne passent
pas par PostgREST.

**Appliqué en production**, les 8 migrations, après mesure d'impact préalable :
0 doublon d'espace propriétaire, **1 lot incohérent** (Agence Alpha, bail en
préavis jusqu'au 01/11 sur un lot resté « disponible ») corrigé par la
migration, 0 clôture prématurée. Vérifié après coup : 0 fonction déclencheur
exécutable par anon, `anon` ne garde qu'un seul droit d'écriture
(`demandes_devis/INSERT`, le formulaire de la vitrine), 0 lot incohérent.
Advisors de sécurité : il ne reste que le WARN attendu (l'API applicative est
faite de fonctions `SECURITY DEFINER`) et l'INFO des 8 tables de chantiers non
câblés, fermées sans aucun privilège.

**Une limite, dite franchement.** La révocation faite à `anon` n'est pas
durable : les privilèges par défaut appartiennent à `supabase_admin`, que le
rôle des migrations ne peut pas modifier — la migration a donc échoué là-dessus,
et a été reprise pour AVERTIR au lieu d'échouer. Chaque nouvelle table rouvrira
la brèche. Le garde-fou a été déplacé là où le projet le maîtrise : un test de
socle « anon n'écrit nulle part », prouvé non vacueux (il détecte et nomme la
table fautive). Toute migration créant une table doit révoquer explicitement.

**À savoir côté exploitation** : 4 des 5 baux vivants n'ont pas d'indice IRL
figé et ne seront révisables qu'une fois celui-ci renseigné (RM-3.8.2). Le
formulaire de compléments du bail le permet ; l'écran de révision affiche
désormais l'indice au lieu de le demander, et dit « à renseigner sur le bail ».

**État** : 272 verts / 1 rouge assumé (colocation meublée, arbitrage juridique)
/ 2 ignorés — 275. typecheck et lint à 0 erreur. Les arbitrages soulevés et non
tranchés sont listés dans [[Audit du 10 septembre 2026]].

## [2026-09-11] dev | Design de tout le site, journal éditorial, et deux défauts trouvés à l'écran
Carte blanche sur le design (vitrine comprise), un système de proposition de
publication pour le [[Super Admin]], puis la revue des clics et cheminements.

**1. Socle de design (charte v2.1).** La charte v2 — encre, laiton, crèmes,
Cormorant / Instrument / Plex Mono — ne bouge pas : elle est de bon goût et
documentée. Il lui manquait ce qui l'empêchait de tenir d'un écran à l'autre :
une **échelle typographique nommée** (sept degrés, les tailles de la maquette
conservées à l'identique), un **rythme vertical** unique, un anneau de focus
commun au clavier, et trois primitives que chaque écran refaisait à sa façon —
`.tableau` (cinq variantes de padding recensées), `.vide-guide` (l'état vide
*guide* au lieu de constater), `.section-vitrine` / `.mesure-lecture`.

**2. Marque blanche : plus aucune couleur en dur.** 20 valeurs vivaient en dur
dans `globals.css`. Toutes promues en jetons — quatre nuances nommées
(`--survol`, `--survol-critique`, `--encre-profond`, `--or-sombre`), les
variantes d'opacité passées à `color-mix()` sur le jeton source. Le module 17
fait des variables le SEUL point de personnalisation d'une agence : une valeur
en dur y échappe, et personne ne pense à aller la chercher. Les trois pages
d'erreur des routes de fichier, qui servaient du `system-ui` sur fond gris,
rentrent dans la charte et vivent désormais en un seul exemplaire.

**3. Vitrine.** Le diagnostic tenait en une phrase : elle **ne montrait jamais
le produit**. Trois aperçus — tableau de bord, quittance, espace locataire sur
téléphone — construits avec les VRAIES classes de l'application : ils partagent
sa feuille de style, donc ils ne peuvent pas mentir sur son allure, et ils
suivent la marque blanche. Plus une bande « ce que Gerimmo remplace » qui met
les honoraires d'agence face aux 5,99 €. **Aucun témoignage, aucun chiffre
d'usage, aucun logo client** : nous n'en avons pas, et la politique
« fonctionnalités honnêtes » interdit d'en inventer. Les quatre portes d'entrée,
qui se répartissaient en deux gabarits, partagent une coquille unique.

**4. [[Journal éditorial]]** — la demande « dynamiser le site ». Huit veines
ancrées sur des pages réelles du wiki, file hebdomadaire, et la garantie qui en
fait l'intérêt : une proposition apporte un angle, un plan et sa source, jamais
un chiffre. Les faits datés restent en trou explicite et la base **refuse la
parution** tant qu'il en reste un. En production avec le journal public.

**5. Console de supervision.** L'espace [[Super Admin]] « n'était pas un espace,
c'était six pages posées côte à côte ». Il porte désormais les indicateurs et
les files que le référentiel prescrit — celles qui existent. Les quatre autres
sont annoncées, pas simulées.

**Deux défauts trouvés en REGARDANT, pas en lisant.**
- Sur téléphone, la **modale d'alertes qui s'ouvre à chaque connexion mesurait
  470 px pour un écran de 390** : ses deux boutons « Fermer » tombaient hors
  champ. L'utilisateur arrivait dans une modale dont il ne pouvait pas sortir.
  L'audit mobile du 10/09 l'avait manquée parce que **toute la suite E2E
  désactive cette modale avant chaque test** : on auditait des écrans, jamais
  l'arrivée. Un fichier de test qui ne la neutralise pas verrouille désormais
  cet état.
- Le **reçu de paiement partiel** calculait le solde sur `loyer + charges` là où
  le PDF utilisait le terme dû. Sur un mois au prorata il réclamait **550 € au
  lieu de 116,67 €** — 433 € de dette de trop, sur un document qui écrit « un
  solde de X reste dû » (RM-3.4.2). La cause : la RPC ne renvoyait pas
  `montant_du`, la page ne POUVAIT pas calculer juste. Corrigé en production.

**Deux alertes de l'état des lieux ÉCARTÉES après vérification** plutôt que
corrigées sur parole : la quittance « non publique » (c'est juste — elle porte
des données personnelles, et son destinataire a un compte) et la modale « qui
s'ouvre à chaque page » (non : une fois par session).

**État des lieux complet** (14 lecteurs en parallèle : 8 zones de design,
6 parcours) : **47 P1, 145 P2, 62 P3**. Parcours les plus coûteux : inscription
→ premier bail actif, 50 clics pour 31 au mieux ; état des lieux de sortie →
restitution, 60 pour 51. Correction en cours.

## [2026-09-11] dev | Les écrans qui mentaient : cinq lots corrigés, appliqués en production
Cinq défauts où l'écran promettait ce que la base refusait, ou perdait le
travail de l'utilisateur. Un correcteur et un vérificateur adversarial par lot.
**Le vérificateur a pris le correcteur en défaut sur les CINQ** — ce qui porte
le compte de la session à 13 reprises sur 18 lots. C'est le motif du
dispositif, pas un accident.

1. **Un bail devenait actif sans loyer ni date d'entrée**, deux mentions
   obligatoires du contrat ([[Mentions obligatoires du bail]]). Mesuré :
   `generer_appels_loyer` produisait un premier appel à **0,00 €**,
   quittançable et comptabilisable. Trouvé en chemin, plus grave encore :
   `activer_bail` posait `date_debut = coalesce(date_debut, current_date)` — la
   **date de prise d'effet du contrat devenait le jour du clic**. Ce repli
   datait du 02/08, quand le formulaire n'avait pas de champ de date ; le champ
   existe depuis le 21/08. Supprimé.
   Le vérificateur a trouvé TROIS contournements par écriture directe : la
   policy `baux_update` laissait faire `update baux set etat='actif'` sans
   passer par aucune fonction, et un détour par « préavis » ou « terminé »
   blanchissait un brouillon — deux transitions que [[Machines à états et
   événements]] interdit déjà (RM-A5.1/A5.2) sans que rien ne les contrôle.

2. **Encaisser ne disait jamais ce qu'il venait de faire** — le geste le plus
   répété du produit. Et le libellé promettait un terme que la base n'imputait
   pas : l'imputation va du plus ancien au plus récent (RM-3.3.2, règle légale).
   L'écran ne se trompait pas de calcul : il **taisait une règle juste**.
   Le vérificateur a trouvé que le test du correcteur ne prouvait RIEN sur la
   moitié titre du défaut, et que sa réécriture de `quittancement_mois` avait
   **silencieusement retiré d'un WHERE une garde** qu'une migration antérieure
   y avait posée.

3. **La déclaration d'incident photo seule** était promise à l'écran et refusée
   par la base — sur le parcours mobile phare (RM-19.2.2). La base apprend la
   règle. Et tout échec **effaçait les photos** : au pire endroit possible.

4. **Le justificatif d'une retenue** partait en GED avant que la retenue soit
   acceptée : un refus légitime (élément amorti, [[Vétusté et décote]]) laissait
   une pièce orpheline portant des données du locataire.

5. **Les impayés de la restitution** étaient figés au démarrage. Le wiki ne dit
   PAS à quelle date les arrêter — l'agent ne l'a donc pas décidé à sa place.
   Ce qui est indiscutable est fait : l'écran dit à quelle date les montants ont
   été arrêtés et propose de les réarrêter ; « Finaliser » se confirme.
   Le vérificateur a trouvé une **course** : le réarrêté lisait le statut sans
   verrou et pouvait donc s'appliquer à un décompte finalisé entre-temps.

**Appliqué en production** (7 migrations), impact mesuré d'abord : 0 bail sans
loyer ni date, 0 restitution en cours, rien à rattraper. Huit contrôles verts
après coup.

**Tests : 365, dont 57 ajoutés — 362 verts, 1 rouge assumé, 2 ignorés.**

Cinq arbitrages remontés et NON codés faute de règle tranchée, dont : l'IRL de
référence comme mention exigible à l'activation, et surtout **RM-A6.7 « la
précision du débiteur prime »** sur l'ordre d'ancienneté — aucune colonne du
modèle ne permet aujourd'hui au locataire de désigner le terme qu'il règle.

## [2026-09-11] audit  | Audit et point santé de fin de chantier

**Mesuré, pas estimé.** 107 pages parcourues au navigateur dans les quatre
espaces, 65 passées à axe-core, 7 551 éléments relevés en style calculé avant
et après chaque changement de CSS, base de production interrogée directement.

**Six défauts corrigés.**
1. Trois requêtes que PostgREST refusait d'arbitrer (deux clés étrangères vers
   la même cible, 28 paires concernées) : l'export CSV du journal rendait un
   500, les détentions de la fiche bien échouaient, et **la veille DPE de
   l'accueil propriétaire échouait EN SILENCE** — le propriétaire d'un lot
   classé G ne voyait rien de son interdiction de louer. Test d'intégration qui
   relit les paires ambiguës dans la base.
2. Les classes de la charte, écrites hors couche CSS, battaient **60
   utilitaires Tailwind** — `hidden` qui ne cachait rien, `text-[var(--or)]` qui
   rendait du gris à 2,39:1. Les 12 défauts de contraste venaient tous de là.
3. 29 contrôles sans nom accessible, ou nommés par leur seul placeholder.
4. 12 liens en texte suivi distingués par la seule couleur.
5. 22 tables dont toutes les politiques RLS filtrent sur `organization_id` sans
   index sur cette colonne (les 49 concernées en ont un).
6. 14 variables d'environnement non documentées ; un échafaudage mort retiré.

**Parcours recomptés dans le code**, chaque étape ancrée sur un fichier:ligne,
puis vérifiés par un critique : 19 / 37 / 7 / 8 clics là où le relevé du matin
comptait 50 / 60 / 18 / 13. **La contradiction est consignée, pas moyennée** —
les deux mesures ne comptent pas la même chose, et aucune n'a été faite au
navigateur.

**Cinq défauts bloquants arrêtés par les vérificateurs**, dont la copie des
clés à `nombre = 0` : le document que les deux parties signent l'imprimait
comme un fait — « aucune clé rendue », celui-là même qui fonde une retenue de
serrurerie. La colonne devient nullable.

**Santé** : 370 tests (367 verts, 1 rouge assumé, 2 ignorés), 20 E2E verts,
typecheck et build sans erreur, 0 défaut d'accessibilité sur 107 pages, 0
violation axe-core sérieuse ou critique, 0 avis de sécurité ERROR. Les 123
fonctions `SECURITY DEFINER` exposées atteignent toutes `auth.uid()` — ce qui
prouve qu'elles consultent l'appelant, pas qu'elles le font bien sur chaque
branche.

**Dix points attendent un arbitrage humain**, en tête desquels les conditions
d'utilisation qui n'existent pas alors que l'inscription les fait accepter.

→ [[Audit et point santé du 11 septembre 2026]]

## [2026-09-11] dev   | Conditions d'utilisation et mentions légales : les deux projets

L'audit du jour posait en tête de ses arbitrages que **la case d'inscription
fait accepter des « conditions d'utilisation » qui n'existent nulle part**, et
que le site, marchand et français, ne publie aucune mention légale. Les deux
projets sont écrits.

- [[Conditions generales d'utilisation (projet)]] — 17 articles. Nature du
  service (le journal de gestion, repris du projet du 25/07), rôles et
  habilitations, espaces des locataires, prix et essai, réversibilité,
  responsabilité, résiliation, droit applicable.
- [[Mentions legales (projet)]] — éditeur, directeur de la publication,
  hébergeurs (Supabase eu-west-3, Vercel, Resend), médiation, signalement.

**Aucun des deux n'est publiable en l'état**, et c'est dit en tête de chacun :
ils portent des faits d'entreprise que l'agent n'invente pas (dénomination,
immatriculation, siège, contact) et des choix juridiques qui se décident —
qualification au regard de la loi Hoguet, droit de rétractation du client
particulier, adhésion à un médiateur de la consommation, plafond de
responsabilité.

**La rédaction a révélé un défaut que personne ne cherchait.** Le projet de
CGU du 25/07 engageait l'Éditeur sur l'export « des écritures, des documents
et du référentiel », et sur une suspension qui bascule le compte « en lecture
seule ». Vérification code en main :

| Promesse | Réalité |
|---|---|
| Export du journal | existe (CSV) |
| Archive documentaire indexée | **n'existe pas** |
| Export du référentiel | **n'existe pas** |
| Suspension en lecture seule | **n'existe pas** — le statut d'organisation est une étiquette d'affichage, aucun code ne restreint rien |

Le texte a été corrigé pour n'engager que ce qui existe, et l'écart est posé
comme une décision à prendre : écrire les deux exports manquants (ce que
recommande l'agent — la réversibilité est un argument de la page d'accueil
autant qu'une attente du RGPD), ou cesser d'en promettre davantage. **Signer
la première version et livrer la seconde n'est pas une option.**

Trois autres manques côté produit sont notés dans les projets : la case
d'inscription ne renvoie vers aucun lien, la version acceptée des conditions
n'est pas conservée (la base note que la case a été cochée, pas ce qui a été
accepté), et le locataire n'accepte aujourd'hui aucune condition alors qu'il
dépose des pièces.

## [2026-09-11] dev   | Le cycle mensuel tourne seul, et la garde d'abonnement ne s'oublie plus

**Ce qui ne tournait pas.** Les appels de loyer d'un mois n'existaient que si un
gérant ouvrait le bail et cliquait « Générer l'échéancier » — alors que le wiki
décrit une tâche planifiée depuis le 24/07. Constat chiffré sur la base de
production : **12 appels manquants sur 6 baux**, donc pas de quittance, donc
aucun impayé détectable. On ne vend pas « ça se gère presque tout seul » sur un
échéancier à la main.

**Ce qui a été posé.**
- `cycle_mensuel_interne()` — pg_cron, le 1er du mois à 5 h UTC : appels
  manquants puis resynchronisation des quittances et reçus, bail par bail, un
  échec n'emportant pas le mois des autres, trace au journal technique.
- `generer_alertes_impayes()` — quotidienne à 5 h 30 : une alerte par bail,
  rattachée au bail, qui se ferme au paiement. Elle **constate** et ne relance
  pas : plancher et délais sont paramétrables par agence (module 18) et ne
  s'inventent pas ici.
- `generer_appels_loyer` scindée : le calcul descend dans une fonction interne
  (le cron n'est personne, la garde de rôle l'aurait refusé), la fonction
  publique n'est plus que sa garde. Toutes les internes révoquées de
  `authenticated` et `anon`.

**Deux trous trouvés en chemin.**
1. *La garde d'abonnement ne couvrait pas le module artisan.* Posée le matin par
   un bloc anonyme qui énumère les tables au moment où il s'exécute, elle avait
   raté les **neuf tables** arrivées l'après-midi : une agence suspendue pouvait
   consulter des artisans, faire chiffrer et faire intervenir gratuitement. La
   pose devient une fonction rejouable, et un **test** échoue désormais si une
   table d'organisation échappe au verrou.
2. *Le banc de test local était 26 migrations en retard sur la production.* Le
   manifeste `ordre-migrations.txt` s'arrêtait au 09/09 : tout ce qui a été
   appliqué depuis tournait sur une base qui ne le contenait pas. Manifeste
   reconstruit depuis l'historique de production (157 migrations), base
   reconstruite de zéro.

**Au passage.** Le refus d'écriture ne parle plus d'abonnement aux tiers : un
locataire ou un artisan qui écrit chez une agence suspendue reçoit un message
neutre, pas « Réactivez l'abonnement ». `tache_systeme()` — la seule fonction
qui désarme un garde-fou — a désormais son chemin de recherche figé.

**Vérifié.** 456 tests (453 passent, 1 rouge délibéré RM-2.1.2, 2 ignorés),
typecheck 0, eslint 0 erreur. Migrations appliquées en production ; rattrapage
joué sur les données réelles : 12 appels créés, 1 quittance, 5 alertes
d'impayé, 0 échec.

## [2026-09-11] dev   | Les quittances partent seules, pour qui l'a demandé

Suite du cycle mensuel : les appels se créaient seuls, les quittances
s'émettaient à l'encaissement — et attendaient qu'un gérant ouvre la
comptabilité et clique pour partir. Un client qui oublie a des quittances
émises que personne n'a reçues, alors que la quittance est due au locataire.

**Ce qui a été posé.** Une tâche quotidienne (Vercel Cron → `/api/cron/quittances`,
7 h UTC) envoie les quittances et reçus jamais partis, avec le même corps de
message que le bouton du gérant (`lib/quittance-email.ts`, écrit une fois).

**Ce qui n'est PAS automatique par défaut, et pourquoi.** Le référentiel veut la
quittance « validée par l'agence ou le propriétaire ». L'envoyer d'office
contredirait cette règle. L'option `quittances_envoi_auto` vaut donc **faux** à
l'installation, se coche dans le profil de l'agence, et cocher la case EST la
validation permanente. Les quittances de plus de 45 jours ne partent jamais :
sans cette borne, cocher une case enverrait d'un coup l'arriéré à des
locataires parfois partis depuis.

**Les verrous de la route**, seule du produit à porter la clé `service_role`
(qui contourne la RLS et voit toutes les organisations) : `CRON_SECRET` comparé
à temps constant ; absence d'un des trois réglages = 503, jamais de bascule en
mode ouvert ; côté base, `quittances_a_envoyer` et `marquer_quittance_envoyee`
révoquées de `anon`/`authenticated` et accordées au seul `service_role`, chacune
ne rendant que le nécessaire. On envoie PUIS on marque : dans l'autre sens, un
échec réseau perdrait définitivement une quittance.

**Vérifié.** 469 tests (466 passent, 1 rouge délibéré, 2 ignorés), typecheck 0,
eslint 0 erreur, build vert. Migration appliquée en production.

> [!warning] À faire avant le 1er octobre
> Renseigner `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SITE_URL`
> dans l'environnement Vercel. Sans elles, la route répond 503 et rien ne part.

## [2026-09-11] dev   | Module 8 (artisans) : les huit impasses de la vérification

Le module artisan a été construit par une équipe d'agents, puis relu par des
vérificateurs adversariaux dont c'était le seul travail : **23 constats, dont
huit bloquants**, tous reproduits en SQL ou au navigateur avant d'être écrits.
Aucun n'était cosmétique. Ils avaient tous la même forme — un écran qui propose
un geste que la base refuse ensuite, ou qui laisse le dossier dans un état d'où
l'on ne sort plus.

**Les quatre impasses de base** (migrations 240000 et 250000) :
- Le **locataire fixait le rendez-vous tout seul** : `choisir_creneau`
  vérifiait que le créneau portait sur SON incident, jamais qui l'avait
  proposé. Il pouvait retenir sa propre contre-proposition, plaçant la mission
  à une heure que l'artisan n'a jamais acceptée — et son absence lui aurait été
  comptée comme un rendez-vous manqué (RM-10.5.3).
- **Reproposer des dates tuait le rendez-vous pour toujours** : l'ancien
  créneau restait « retenu » et l'unicité faisait échouer tout choix ultérieur.
- **« Retirer la mission » rendait l'incident inaffectable définitivement** :
  `annuler_mission` laissait le devis « retenu ».
- **La file « interventions à noter » ne pouvait plus se vider** : une note
  retirée après contestation y réinscrivait l'intervention, que l'unicité
  interdit pourtant de remplacer.

**Quatre écrans qui mentaient** : l'heure du rendez-vous rendue dans le fuseau
du SERVEUR côté artisan (UTC) contre Europe/Paris côté locataire — deux heures
d'écart sur le même rendez-vous ; la carte rouge de révision d'imputation qui
ne se fermait jamais quand l'agent tranchait en maintenant son imputation,
c'est-à-dire dans le cas que RM-7.5.3 décrit ; le conseil « laissez vide pour
ne poser aucune limite de zone », alors qu'un artisan sans code postal n'est
proposé nulle part ; et « un rappel vous parviendra la veille », alors
qu'aucun rappel n'existe dans le produit.

**Un défaut trouvé à l'écran, en jouant le parcours** : l'agenda disait
« Proposez trois créneaux au locataire » à un artisan qui venait de les
proposer. Suivre la consigne rendait caduques les dates que le locataire
s'apprêtait à choisir, et faisait avancer le compteur de tours vers l'arbitrage
du gérant sans que personne n'ait rien refusé.

**Ce qui rend la suite vérifiable.** Le parcours artisan complet est désormais
semé par `seed-parcours.mjs` (incident → qualification → consultation →
sollicitation → devis → mission → créneaux), un compte `artisan.alpha` existe
dans le seed de démonstration, `e2e/parcours-artisan.spec.ts` couvre onze cas à
390 px, l'espace artisan entre dans le parcours d'accessibilité, et
`tests/module8-correctifs.test.ts` garde les quatre corrections de base.

**Au passage** : l'émulateur Supabase local ne savait pas passer un tableau à
une RPC (il le sérialisait en JSON) — trois RPC du module étaient intestables
hors ligne.

**Vérifié.** 474 tests (471 passent, 1 rouge délibéré, 2 ignorés), typecheck 0,
eslint 0 erreur, build vert, E2E 30 cas.

> [!warning] Les migrations du module 8 ne sont PAS en production
> Le module attend sa recette complète (le parcours a été joué de bout en bout
> sur le banc local, pas encore en conditions réelles avec un vrai artisan).

## [2026-09-11] dev   | « Mon abonnement » cesse de rassurer à tort

La page promettait « rien ne se ferme sans vous prévenir ». Depuis le matin
même, c'est faux : un essai expiré ferme l'écriture LE JOUR MÊME — la date
suffit, aucun traitement de nuit n'intervient. Elle refaisait par ailleurs le
calcul du montant de son côté (`max(0, n-1) × 5,99`), en parallèle de
`etat_abonnement` : deux additions du même montant finissent toujours par
diverger.

La page lit désormais `etat_abonnement`, annonce ce qui arrive AVANT que ça
n'arrive (« passé cette date, le compte passe en lecture seule »), décompte les
derniers jours quand il en reste sept ou moins, et, une fois le compte fermé,
dit ce qui reste possible : tout consulter, tout exporter, y compris le journal
de gestion. Un test garde la phrase retirée.

## [2026-09-11] dev   | Onboarding : ouvrir une organisation, et voir le chemin

**Le geste qui n'existait pas.** Le site recueille les demandes des agences et
la console les liste — mais créer l'agence qui suit se faisait en SQL : trois
insertions à la main, dont le compte de son responsable. RM-16.1.1 réserve ce
geste au super admin ; il n'avait simplement pas d'écran. Il en a un :
`/admin/organisations/nouvelle`, atteignable depuis la supervision et depuis
une demande de devis (qu'il préremplit et marque traitée).

**Ce que le client voit en arrivant.** Un tableau de bord à zéro, et rien
d'autre. Or entre le premier bien et le premier loyer appelé il y a cinq
gestes, chacun gardé par une règle qui refuse tant que le précédent n'a pas eu
lieu — la détention à 100 %, le DPE en habitation, les mentions obligatoires du
bail. On les rencontrait une par une, sous forme de refus.
`parcours_demarrage` les met dans l'ordre, dit où l'on en est et ce qui bloque,
n'ouvre qu'une porte à la fois, et disparaît une fois le premier bail actif.

Aucune table de progression : tout est constaté sur les données. Un parcours
qu'on coche à la main finit toujours par affirmer une étape que les données
démentent.

**Vérifié.** 484 tests (481 passent, 1 rouge délibéré, 2 ignorés), E2E 33 cas,
typecheck 0, eslint 0 erreur, build vert.

## [2026-09-11] dev   | Reprendre un parc depuis un tableur

**Le vrai frein.** Une agence qui arrive avec cinquante lots les saisit
aujourd'hui un par un : le bien, son lot, le propriétaire, sa détention, le
locataire, le bail. Six écrans, cinquante fois. Aucun essai de quatorze jours
ne survit à ça, et c'est le seul obstacle qui sépare une démonstration réussie
d'un client qui reste. Le module 16.3 le décrit depuis le 24/07 ; il n'existait
pas.

**Une ligne = un lot** — l'unité dans laquelle une agence pense son parc, et
celle de sa facturation. Le fichier est celui du client, pas un format imposé :
séparateur détecté, guillemets honorés, en-têtes reconnus sans accents ni
casse, colonnes inconnues ignorées plutôt que refusées. Le gabarit se
télécharge depuis l'écran et **se relit lui-même** — un test le vérifie, sinon
on livrerait un modèle que l'import refuse.

**Deux passes, délibérément.** Le contrôle n'écrit rien et rend ligne par ligne
ce qui passera ; l'import ne devient possible qu'ensuite. Une ligne qui tombe
est rapportée avec le motif que la base a donné, et les autres passent.
Réimporter un fichier corrigé ne fabrique pas un second parc : bien, lot,
personne et bail sont retrouvés avant d'être créés.

**Les baux arrivent en brouillon, et c'est la règle.** Activer un bail passe
par `controler_mise_en_location` — diagnostics, état des lieux, mentions
obligatoires. Un import qui créerait des baux ACTIFS contournerait ces
contrôles en masse, c'est-à-dire exactement ce qu'ils existent pour empêcher.
L'import pose les montants et les dates ; ce qui manque pour activer est dit
lot par lot par la fonction qui en décide déjà.

**Vérifié.** 497 tests (494 passent, 1 rouge délibéré, 2 ignorés), E2E 35 cas,
typecheck 0, eslint 0 erreur, build vert.

Les trois migrations de l'onboarding (`ouvrir_organisation`,
`parcours_demarrage`, `importer_parc`) sont **appliquées en production** :
aucune n'est exposée à `anon`, `import_personne` ne l'est pas davantage à
`authenticated`, et toutes portent un chemin de recherche figé.

> [!warning] Ce qui reste
> La reprise **comptable** (dépôts de garantie détenus, avances, fonds
> mandants) n'est pas faite : les tables existent depuis le 03/09, aucun code
> ne les utilise. Une agence qui bascule en cours d'exercice saisit encore ses
> soldes à la main.

## [2026-09-11] dev   | L'adresse d'expédition cesse d'être une constante

Relevé en branchant la production : `RESEND_API_KEY` n'avait **jamais** été
posée sur Vercel. Aucun e-mail n'était donc jamais sorti de Gerimmo —
quittances, rapports de gestion, avis de bail signé. La clé est désormais en
place.

Mais une seconde barrière attendait derrière : l'adresse d'expédition était en
dur sur `no-reply@gerimmo.app`, et Resend **refuse tout envoi** tant que le
domaine de l'expéditeur n'est pas vérifié chez lui. Clé valide ou non, le
produit restait bloqué par une constante — et par un domaine qui n'est peut-être
même pas encore acquis.

`RESEND_EXPEDITEUR` la règle par l'environnement (défaut inchangé : l'adresse de
la marque, c'est la cible et non un repli). De quoi démarrer sur l'adresse de
test de Resend en attendant la vérification. Et le refus le plus fréquent est
traduit : le message brut parle de « domain » sans jamais dire quoi faire,
celui qui le lit est un gérant.

501 tests (498 passent, 1 rouge délibéré, 2 ignorés), build vert.


## [2026-09-11] dev   | Le schéma du module 8 rejoint la production, par un chantier

Le code du module artisan avait été fusionné **sans son schéma** : pendant
quelques heures, chaque locataire lisait « l'essentiel de votre logement n'a pas
pu être lu », et aucune agence ne pouvait solliciter qui que ce soit. Les
fonctions que l'application appelait n'existaient pas en base.

Recopier à la main un module de 151 Ko dans un outil n'était pas envisageable :
une dérive d'un caractère y est silencieuse et corrompt la base. Un chantier
GitHub (`.github/workflows/migrations.yml`) lit désormais les **fichiers du
dépôt** et les joue sur la production — personne ne les retape, donc personne ne
les abîme. Déclenchement manuel seulement : une migration change la forme des
données, son ordre par rapport à la mise en ligne du code compte.

La liste des fichiers y est **explicite**, et ce n'est pas une paresse. Les
fichiers du dépôt ont été renommés au fil du temps et leurs horodatages ne
correspondent plus à ceux enregistrés en base — le 11/09, le dépôt porte
`20260911124500_restitution_rearrete…` là où la base a enregistré la même
migration sous `20260911014814`. Une détection automatique la croirait absente
et la **rejouerait**. Tout le lot passe dans une seule transaction : une moitié
appliquée serait pire qu'un échec net, le code trouverait les tables et pas les
fonctions.

Après application, production et banc local sont **identiques** : 252 fonctions,
79 tables, 56 déclencheurs d'abonnement, 167 migrations enregistrées, 7 tâches
planifiées. Les 14 tables artisan portent toutes RLS, aucune table
d'organisation n'est sans verrou, aucune politique ne nomme le rôle artisan,
aucune fonction n'est sans chemin de recherche figé.

## [2026-09-11] dev   | Refaire une fonction cessait de la refermer à anon

Le contrôleur de sécurité de Supabase, passé juste après, signale
`mon_agenda_artisan` **appelable sans être connecté**, en `SECURITY DEFINER`.
Elle avait pourtant été fermée le jour de sa création.

La cause se reproduira : ajouter une colonne au retour d'une fonction impose
`DROP` puis `CREATE` — PostgreSQL ne sait pas faire autrement. Le `DROP` emporte
les droits, et le `CREATE` repart de ceux que Supabase accorde d'office à `anon`
sur tout le schéma `public`. La fonction renaît ouverte, en silence : la
migration passe, les tests passent, l'écran fonctionne. Le même geste avait déjà
rouvert `comparatif_edl` le 01/08, passé inaperçu treize jours parce qu'elle est
`SECURITY INVOKER` — le contrôleur ne la signale pas, RLS s'appliquant encore.

Rien n'était lisible : le corps filtre sur `mon_artisan_id()` et exige qu'il
soit non nul, un appel anonyme rend zéro ligne. Mais la garde tient parce que
**cette** fonction-là se trouve être écrite ainsi, pas par construction.

`fermer_fonctions_a_anon()` énumère le catalogue au moment où elle s'exécute et
retire le droit à `anon` **et** à `PUBLIC` — c'est le second qui revient après un
`DROP`. Comme `PUBLIC` couvre aussi `authenticated` et `service_role`, elle note
d'abord ce qu'ils pouvaient et le leur rend nommément. Cinq fonctions fermées ;
le catalogue n'en laisse plus aucune ouverte.

Le vrai garde-fou est le test : il échoue si une seule fonction de `public`
reste exécutable par `anon`, et porte la réparation dans son message. La
fonction, on peut oublier de l'appeler ; le test, lui, échoue.

505 tests (502 passent, 1 rouge délibéré, 2 ignorés), 35 E2E verts, build vert.

## [2026-09-11] dev   | Les fiches bien et lot remises dans l'ordre où l'on s'en sert

Relevé au navigateur, à la demande : « c'est bâclé ». Ça l'était, et de six
façons qui tenaient toutes à la même cause — l'écran affichait le contenu dans
l'ordre où le code l'avait écrit, pas dans celui où on s'en sert.

**Tout au même poids.** Un diagnostic manquant se lisait exactement comme
« Découpage en lots : non découpable », en quatrième rangée. Ce qui attend un
geste est désormais réuni en haut, une fois, avec le lien qui y mène.

**Le geste à neuf cents pixels de son libellé.** Sept rangées portaient un
bouton « Modifier » calé au bord droit de la carte ; sur un écran de 1280 px,
l'œil traversait toute la largeur pour l'atteindre, et la colonne répétait sept
fois le même mot. La rangée entière est devenue la cible — la distance ne
compte plus, le mot disparaît, il reste un chevron.

**L'objet du travail en dernier.** Sur la fiche bien, le lot — celui qui porte
le bail, le loyer, le locataire — arrivait après le type de construction et
l'année du bâtiment. Sur la fiche lot, le bail était au fond, replié, derrière
neuf caractéristiques. Les deux sont remontés en tête.

**Le même fait, quatre fois.** « Loué » se lisait dans la pastille du titre,
dans un paragraphe expliquant le cycle de vie d'un lot, dans « Ce lot est
loué », puis dans « État actuel : Loué ». Il ne reste que la pastille et la
suite à donner.

**Des lignes vides qui coûtent un tiers de l'écran.** « Étage — », « Tantième
— », « Identifiant fiscal — » : quatre rangées sur neuf n'apprenaient rien. Les
champs non renseignés tiennent maintenant en une phrase, qui dit à la fois
qu'ils manquent et lesquels.

**Un formulaire ouvert pour un geste annuel.** L'annonce aux locataires occupait
une carte entière en bas de page, dépliée en permanence. Elle est à un clic, et
son résumé dit s'il y a quelque chose d'affiché chez les locataires.

Au passage, deux défauts trouvés en regardant : le bandeau d'essai annonçait
« (NaN jour restants) » sur tout l'espace agence — l'émulateur du banc rendait
les colonnes `date` en horodatage complet là où PostgREST rend une date nue, et
la concaténation donnait une date invalide. Un banc qui ment sur la forme des
données laisse passer les défauts qu'il devrait attraper : l'émulateur est
corrigé, et le calcul ne suppose plus la forme courte. Et « créez son bail plus
bas » est devenu un bouton qui y mène.

Neuf tests E2E tiennent l'ordre plutôt que la seule présence : un bloc juste,
placé en bas, ne sert personne — une assertion de présence aurait laissé passer
exactement ce qu'on vient de corriger.

507 tests (504 passent, 1 rouge délibéré, 2 ignorés), 43 E2E verts, build vert.

## [2026-09-11] dev   | Encaisser : le paiement en ligne, de bout en bout

Gerimmo comptait ses biens sans jamais pouvoir encaisser. « Mon abonnement »
savait dire combien le client devait — 1ᵉʳ bien offert à vie, 5,99 €/bien/mois
ensuite (décision humain du 05/09) — mais aucun moyen de payer n'existait. Le
produit savait fermer la porte, pas la rouvrir.

**Le partage des rôles.** Gerimmo compte, Stripe encaisse (RM-18.6.9). La
quantité facturée se calcule dans la base qui tient le parc ; l'état du paiement
vient de Stripe, seule autorité sur « la carte est-elle passée ». Chaque fait a
une source, et une seule.

**La traduction est le cœur métier**, et elle est écrite en clair dans la
migration plutôt que dispersée dans du code : c'est elle qui décide quand un
client perd l'usage de son outil de travail.

| Stripe dit | Le compte |
|---|---|
| `active`, `trialing` | ouvert |
| `past_due` | **inchangé** — Stripe relance des semaines ; une carte expirée n'est pas un impayé |
| `incomplete` | inchangé — la première carte n'est pas confirmée |
| `canceled`, `unpaid`, `incomplete_expired`, `paused` | lecture seule, **sauf si l'essai court encore** : il retombe alors en essai |
| n'importe quoi, sur une organisation archivée | inchangé — l'archivage est un geste humain |

**L'impasse évitée.** Toute table portant `organization_id` est gardée par le
refus d'écriture des comptes fermés. Appliquée à `abonnements`, cette garde fait
une boucle parfaite : le compte est fermé faute de paiement, et il ne peut pas
payer parce qu'il est fermé. Les deux tables d'abonnement en sont exclues — le
défaut ne se serait vu qu'en production, au premier encaissement, et se serait
lu comme un problème de Stripe.

**Le webhook enregistre avant de traiter** (Stripe réessaie trois jours, parfois
deux fois en même temps) et **efface la trace si le traitement échoue** : sans
cela, la relance passerait pour un doublon et le compte resterait fermé alors
que le client a payé. La signature est le seul verrou de cette adresse, qui est
publique et doit l'être.

**La quantité suit le parc avec une nuit de retard, assumée.** La pousser à la
création d'un bien lierait la saisie du parc à la disponibilité d'un tiers ;
Stripe facture en fin de période, le retard ne coûte rien.

**Rien ne marche à moitié.** Sans les trois variables, aucun appel n'est tenté,
l'écran ne propose pas de payer, et les deux routes répondent 503 plutôt que
200 — un 200 les ferait passer pour saines dans le tableau de bord.

557 tests (554 passent, 1 rouge délibéré, 2 ignorés), 49 E2E verts, ESLint à
**zéro avertissement** (18 auparavant), build vert.

> [!warning] Points à trancher
> Cet écran ne s'adresse qu'aux **propriétaires bailleurs**, pour qui la grille
> est actée. Les **agences** relèvent d'une grille par paliers (79/149/249/399
> €/mois + mise en route + redevance annuelle, validée le 25/07) qui n'est
> implémentée nulle part : `etat_abonnement` applique 5,99 €/bien à tout le
> monde. Il n'existe aujourd'hui **aucun chemin d'encaissement pour une
> agence** — voir [[Grille tarifaire]].

## [2026-09-12] dev   | Un prélèvement qui échoue prévient, puis ferme à J+15

**Décision humain du 12/09**, qui remplace la règle posée la veille. Celle-ci
laissait `past_due` sans effet : le produit attendait que Stripe abandonne ses
relances, sans échéance connue ni du client ni de nous. Le client tranche —
alerte immédiate, relances, puis **lecture seule au quinzième jour**, jusqu'à
régularisation.

**La fermeture est portée par la DATE, pas par une tâche de nuit.** Même choix
que l'expiration d'essai, et pour une raison de plus : la **régularisation doit
rouvrir à la seconde**. Un client qui vient de mettre sa carte à jour et qu'on
ferait attendre le passage d'une tâche de nuit nous téléphone — à raison.
`org_ecriture_ouverte` lit la date de défaut ; `abonnement_appliquer` l'efface
dès que Stripe redit « active », et l'écriture rouvre dans la même transaction.

**Le statut de l'organisation ne bouge pas.** Ce client PAIE — c'est sa carte
qui a échoué. `status` reste `active`, c'est l'**écriture** qui se ferme. La
distinction évite qu'une carte expirée laisse au journal la même trace qu'une
résiliation, et fait rouvrir le compte sans qu'aucun statut n'ait à être
redressé. La pastille de l'écran dit « lecture seule » pour ne pas afficher du
vert au-dessus d'un bandeau rouge.

**Le piège de la date qui se repousse.** Stripe réémet `past_due` à chaque
tentative ratée. Réécrire la date à chaque événement repousserait l'échéance
indéfiniment et les quinze jours ne viendraient JAMAIS — le compte resterait
ouvert pour toujours. La date se pose **une seule fois**, et un test l'exige.

**Quatre courriers, et chacun dit autre chose** : l'alerte (J+0, envoyée par le
webhook le jour même — en perdre un à attendre la nuit, c'est en retirer un au
client), le rappel (J+7), l'avis (« demain, la saisie s'arrête »), le constat
(J+15, « voici comment rouvrir »). Le même message répété apprend à ne plus
l'ouvrir, et le dernier — celui qui compte — arriverait dans un fil qu'on ne lit
plus. Aucun n'accuse : une carte qui expire est presque toujours matérielle.
Tous rappellent ce qui reste possible — tout se consulte, tout s'exporte, le
journal de gestion compris. C'est la peur de perdre ses données qui fait partir
un client, pas la facture.

**Le destinataire** est l'adresse de contact de l'organisation, à défaut celle
de son responsable. Une organisation qu'on n'a pas pu prévenir est **rapportée**,
jamais fermée en silence.

582 tests (579 passent, 1 rouge délibéré, 2 ignorés), 48 E2E verts, ESLint à
zéro, build vert.

## [2026-09-12] query  | Proposer une grille tarifaire pour les agences

Constat de départ : la grille agence actée le 25/07 (79/149/249/399 €/mois par
palier, + mise en route, + redevance annuelle) **n'est implémentée nulle part**.
`etat_abonnement` applique 5,99 €/bien à tout le monde et « Mon abonnement » est
masqué aux agences — aucune agence ne peut payer aujourd'hui.

Le défaut rédhibitoire de la grille par paliers est **la marche** : 50 → 51 lots
fait passer la facture de 79 € à 149 €, **+89 % pour un lot de plus**. Une agence
ne saisira pas ce lot, ou appellera pour négocier. Dans les deux cas le prix
abîme la donnée : le parc dans l'outil cesse d'être le parc réel, et les relevés
de gestion, régularisations et états fiscaux qui en découlent deviennent faux.

Proposition filée dans [[Grille tarifaire agence — proposition]] : un **barème
par tranches** (3,90 / 2,00 / 1,30 / 0,80 / 0,50 € par lot selon la tranche),
plancher à 39 €/mois, ni mise en route ni redevance — un seul prélèvement, un
seul abonnement Stripe. Le même passage de palier coûte alors **1,30 €** au lieu
de +70 €.

Elle ressort 25 à 50 % au-dessus de la grille de juillet, et c'est assumé : le
tarif propriétaire direct est déjà passé de 2,50 à 5,99 € le 05/09 (« montée en
gamme »), et la grille de juillet précède le module incident/artisan qui est le
différenciateur du produit ([[Analyse concurrentielle]]).

**Ce qu'elle impose au code** : changer l'unité comptée. `abonnement_quantite_cible`
compte les BIENS ; pour une agence, un immeuble de trente lots compte alors pour
un. Le référentiel dit déjà quoi compter — lot sous mandat actif au dernier jour
du mois (RM-18.6) — et `mandat_lignes` porte ce qu'il faut.

Niveaux, sort de la mise en route et loyer moyen de l'hypothèse : **à trancher
par l'humain**. Tant que rien n'est arbitré, [[Grille tarifaire]] fait foi.

## [2026-09-12] dev   | La grille agence : un barème par tranches, et le lot comme unité

**Grille validée par l'humain le 12/09** ([[Grille tarifaire agence — proposition]]),
et implémentée le jour même. Elle remplace la grille par paliers du 25/07, qui
n'avait jamais été codée.

| Tranche | Par lot et par mois |
|---|---|
| 1ᵉʳ au 10ᵉ lot | 3,90 € (plancher de 39 €) |
| 11ᵉ au 50ᵉ | 2,00 € |
| 51ᵉ au 150ᵉ | 1,30 € |
| 151ᵉ au 400ᵉ | 0,80 € |
| au-delà de 400 | 0,50 € |

Ni mise en route, ni redevance annuelle : un seul prélèvement, un seul
abonnement Stripe. Au-delà de 600 lots, sur devis — mais une agence **déjà
cliente** qui franchit le seuil n'est jamais coupée, sa facture suit la dernière
tranche. On ne punit pas un client qui grandit.

**Le barème est marginal**, comme un barème d'impôt : chaque lot est facturé au
tarif de SA tranche. Franchir 50 lots coûte 1,30 € au lieu de +70 €. Le test ne
vérifie pas des montants mais la PROPRIÉTÉ : sur toute la plage de 1 à 700 lots,
un lot de plus ne coûte jamais plus que le tarif de sa tranche. Un test de
montants aurait laissé revenir la marche.

**L'unité change, et c'était la moitié du travail.** Le calcul comptait les
BIENS : un immeuble de trente lots comptait pour un, soit une facture divisée
par trente sans que rien ne le signale. On compte désormais le **lot sous mandat
actif** (RM-18.6) — vacant compté, sans mandat non, un mandat en préavis compté
car il travaille jusqu'à son terme. Le double comptage n'est pas évité par
prudence : il est structurellement impossible, un lot ne pouvant être couvert
par deux mandats actifs (RM-5.1.3).

**Le barème vit en table**, pas en code : `tarif_tranches`, lisible par tout
compte connecté — c'est le tarif public du produit. L'écran montre le détail
tranche par tranche avec ses sous-totaux, parce qu'une facture qu'on ne peut pas
recalculer soi-même est une facture qu'on appelle pour contester.

**« Mon abonnement » s'ouvre aux agences**, réservé au responsable — un agent
n'a pas à connaître la facture de son agence, et la base refusait déjà de la lui
rendre. Jusqu'ici l'écran leur était simplement masqué : elles n'avaient aucun
moyen de savoir ce qu'elles payaient, ni de payer.

Deux défauts trouvés en chemin : `abonnement_en_ligne_possible` était exposée à
`authenticated` sans contrôle d'appartenance (refermée), et un compteur de
filtre actif tombait sous le seuil de contraste AA sur fond encre — un défaut
**préexistant**, que le portefeuille de démonstration a rendu visible en créant
assez d'alertes pour que le compteur s'affiche.

614 tests (611 passent, 1 rouge délibéré, 2 ignorés), 53 E2E verts, ESLint à
zéro, build vert.

## [2026-09-12] dev   | Les chiffres redeviennent lisibles

Relevé en préparant la refonte visuelle, et corrigé sans attendre : **Cormorant
Garamond dessine des chiffres elzéviriens par défaut**. Le « 1 » y est un
bâtonnet de la hauteur d'un x, le « 0 » descend sous la ligne. Sur les écrans du
produit, « 11 demandes » se lisait *II demandes*, « 1 bail » se lisait *ı bail*,
et « 700,00 € » devenait indéchiffrable.

Ce n'est pas une affaire de goût. Un chiffre qu'on ne peut pas lire dans un
produit qui compte des loyers est un défaut de lisibilité, au même titre qu'un
contraste insuffisant. Il touchait **tous les espaces** — agence, propriétaire,
locataire, artisan — partout où un montant ou un compteur passe par la police de
titrage.

`font-variant-numeric: lining-nums` est posé sur les sept déclarations de la
police de titrage, sur la classe utilitaire `font-heading` que les composants
posent en JSX (aucune règle d'élément ne la couvrait), et la déclaration tardive
de `.montant` qui n'imposait que `tabular-nums` est complétée plutôt que laissée
en contradiction avec la nouvelle.

## [2026-09-12] dev   | La fenêtre du lot : un objet, une fenêtre, une portée par regard

**La demande, en deux temps.** D'abord : « pour l'agent immobilier, il n'y a
plus de page document ou comptabilité ; lorsqu'il clique sur le lot, ça ouvre
une fenêtre sur la page avec toutes les infos du lot, un bouton pour dérouler
les documents, un bouton pour dérouler la comptabilité, et la possibilité
d'envoyer un rapport au propriétaire par mail ». Puis : « j'aimerais que la
vision soit similaire pour tous ceux qui ont accès au lot, et que tu utilises
cette logique pour le site ».

**Le renversement.** Une page « Documents » d'agence oblige à chercher une pièce
au milieu de celles de quatre-vingts autres lots ; une page « Comptabilité »
oblige à filtrer. Or un agent ne se demande jamais « quels documents
avons-nous ? » — il se demande « qu'est-ce que j'ai sur CE lot ? ». L'index
s'efface donc au profit de l'objet. Les deux pages restent celles de
l'**admin d'agence**, dont la question porte bien sur l'ensemble.

**Une fonction, une portée.** `fiche_lot(p_lot)` rend une colonne `portee` qui
dit à quel titre l'appelant regarde ce lot, et TAIT le reste. Le gérant (admin,
agent dans son portefeuille, propriétaire direct) voit tout ; le locataire voit
son logement, son bail et ce qu'il doit — jamais le mandant, son e-mail, le taux
d'honoraires, ni la liste de ce qui bloque une remise en location. Ce n'est pas
l'écran qui masque : l'écran ne peut pas masquer ce qu'on ne lui a pas donné.

**L'artisan n'entre pas, et c'est délibéré.** Son portail ne lit aucune table du
produit — aucune politique RLS ne nomme son rôle, il ne connaît que des RPC qui
déduisent son identité de `auth.uid()`. Lui ouvrir une fonction qui prend un
`p_lot` en paramètre rouvrirait la porte que le socle du 11/09 a condamnée. Sa
fenêtre à lui existe déjà : sa fiche de mission, avec l'adresse, l'accès et le
contact de la visite — et pas le loyer de quelqu'un.

**Ce qui ne devait pas se perdre.** Retirer « Loyers & charges » à l'agent, c'est
lui retirer l'endroit d'où il encaisse un loyer et saisit une dépense — ses deux
gestes quotidiens. Ils sont dans le volet comptabilité, au contact du lot qui
les porte, avec l'envoi du rapport au mandant. Le volet annonce AVANT le clic
combien de lots le rapport couvre : il porte sur le mandat, pas sur le lot.

**Trois défauts trouvés en chemin, tous constatés au navigateur.**

1. **Le mensonge au locataire (grave).** « Mes paiements » annonçait « Tous vos
   loyers sont à jour — rien à régler » à un locataire qui devait 400 €, pendant
   que l'agence voyait l'impayé et que la relance partait.
   `mon_echeancier_locataire` chaînait `etat_loyers_bail`, à qui l'étanchéité du
   10/09 avait ajouté — à juste titre pour ses autres appelants — une garde de
   GÉRANT. Un locataire ne l'est jamais : la jointure latérale ne rendait plus
   rien, pour tout le monde, depuis deux jours. Aucun test ne l'avait vu :
   l'échéancier du locataire n'en avait pas, et « zéro terme » ressemble trait
   pour trait à « aucun loyer appelé ». Corrigé (appel au calcul brut, la
   fonction portant déjà son propre contrôle) et couvert par quatre tests.
2. **Le filet invisible.** `buttonVariants()` appelée nue sur un `<Link>` — à
   quarante-six endroits du produit — rendait `border-transparent` ET
   `border-border` : c'est l'ordre de la feuille compilée qui tranchait, et le
   bouton « outline » perdait son filet. Il devenait un texte flottant. La
   fusion (`cn`/tailwind-merge) vit désormais DANS la fonction : un appelant
   peut l'oublier, la fonction ne le peut pas.
3. **La roue de quatre cents pixels.** `Spinner` n'avait aucune taille et
   comptait sur le `[&_svg]:size-4` des boutons. Posée dans un paragraphe, elle
   prenait toute la largeur de son conteneur. Elle porte sa taille par défaut.

Et deux défauts dans ma propre première écriture, trouvés avant livraison :
`fiche_lot` n'avait pas de `where l.id = p_lot` (elle rendait le premier lot venu
du portefeuille, sous le bon titre), et aucune des quatre fonctions ne posait la
garde de portefeuille (RM-18.1.3) — un agent restreint aurait lu le téléphone du
locataire et l'e-mail du propriétaire d'un lot qu'aucun de ses écrans ne lui
liste.

645 tests (644 passent, 1 rouge délibéré — RM-2.1.2, en attente d'arbitrage —
2 ignorés), 63 E2E verts, ESLint sans erreur, build vert. Migrations posées en
production : `fenetre_du_lot`, `echeancier_locataire_rendu_au_locataire`.

## [2026-09-12] dev   | Un seul libellé en capitales, au lieu de quatre

Premier morceau de la direction « Le registre » appliqué au produit, livré avec
la fenêtre du lot parce qu'elle en dépend.

Le dépôt portait **quatre** métriques de libellé mono en capitales — 9 px/0,18em,
9,5 px/0,12em, 11 px/0,13em, 11,5 px/0,06em — qui revenaient une douzaine de fois
par écran sans qu'aucune différence ne soit signifiante. Ce qui devait signaler
ne signalait plus rien, et les 9 px se lisaient mal à bout de bras (au point
qu'une surcharge mobile les remontait, ce qui n'a plus d'objet).

Une seule métrique désormais, 11 px / 0,12em : ce qui distingue un libellé d'un
autre est sa **couleur**, pas sa taille. Les quatre noms de classe survivent —
`.libelle-champ`, `.badge-statut`, `.eyebrow`, `.mono-discret`, plus les `th` des
tableaux — pour ne pas toucher deux cents composants ; ils désignent maintenant
la même chose. `.badge-statut` garde `color: inherit` pour que sa classe de ton
(succès, attente, critique) l'emporte sur la couleur commune.
