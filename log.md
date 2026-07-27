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
