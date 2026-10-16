---
type: synthesis
tags: [fonctions, devis, facture, rendez-vous, artisan, locataire, proprietaire, proposition, mission-operationnelle]
status: draft
created: 2026-10-14
updated: 2026-10-16
sources: ["[[Registre des anomalies — audit du 13 octobre 2026]]", "[[Dossier de validation — version candidate du 13 octobre 2026]]", "[[Fiches des anomalies P3 — audit du 13 octobre 2026]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Invitation d'un artisan par un propriétaire]]"]
---

# Propositions de fonctions majeures — version candidate du 13 octobre 2026

> [!success] Décidé le 14/10/2026, livré le 15/10/2026 (état au 16/10)
> Les trois fonctions ont été ratifiées par le dirigeant le 14/10 et sont en production depuis le 15/10 :
> - **A — devis refusable et révisable** (D18, PR #187, `8a168dd`) : refus motivé (motif montré à l'artisan), puis
>   demande de révision, trois versions au plus, sept jours (jour de Paris) pour répondre. Non livrés : l'alerte au
>   propriétaire quand l'artisan devient non affectable pendant la révision (A.7) et le PDF de chaque version (A.9).
> - **B — règlement de la facture d'intervention** (D23-A, avec X06, PR #188, `98f3fd7`) : règlement déclaratif,
>   partiel admis, aucun paiement exécuté, état et date visibles de l'artisan.
> - **C — report ou annulation par le locataire** (D22-B, PR #188, `98f3fd7`) : report avec accord de l'artisan
>   (demande 24 h avant le rendez-vous au moins, deux demandes au plus, réponse sous 48 h, sinon expiration et alerte),
>   annulation immédiate avec alerte au gérant. Non livrés : la relance de l'artisan avant l'échéance de 48 h, le geste
>   « J'en prends acte » et le bandeau dans l'agenda de l'artisan (C.4, C.8).
>
> **Non vérifié** : aucun des trois parcours complets n'a été joué dans un navigateur (refus puis révision d'un devis,
> règlement noté par le gérant, report demandé par le locataire puis accepté par l'artisan) ; la recette de production ne
> les exerce pas. État par décision : [[Décisions groupées — version candidate du 13 octobre 2026]].

> [!note] Proposition d'origine (13–14/10/2026)
> Le texte ci-dessous est la proposition soumise au dirigeant avant sa décision, conservée telle quelle. Trois fonctions
> y sont proposées, chacune au gabarit de la mission (section 15 : acteur, déclencheur, résultat, données, droits, états
> d'erreur, critères d'acceptation) complété par les intégrations, la migration, les tests, le retour arrière et
> l'estimation. Au moment de la rédaction, rien n'était implémenté ; les écrans sont décrits en liste, sans maquette.
> Les décisions correspondantes de la page [[Décisions groupées — version candidate du 13 octobre 2026]] sont D18
> (fonction A), D23 (B) et D22 (C).

Les trois fonctions s'ajoutent à la chaîne **incident → consultation → devis → mission → rendez-vous → intervention →
facture** (wiki : [[Demande et sélection de devis]], [[Planification d'intervention]], [[Intervention et clôture]],
[[Devis]]). Ce qui existe déjà est cité avec son fichier : les propositions se greffent dessus, elles ne le remplacent pas.

## Socle commun aux trois propositions

**Prérequis produit.** La chaîne n'est atteignable par un propriétaire que si sa commune est ouverte au réseau pour le
métier (wiki [[Ouverture du réseau d'artisans]]) ; or le code interdit au propriétaire direct d'ajouter un artisan
(migration `20261007190000`, décision D17). Sans D17 ou sans ouverture de commune, aucune des trois fonctions n'est
utilisable en V1 hors banc. *État au 16/10 : D17-A (voie de sortie affichée) est en production (PR #184) ;
l'ajout d'un artisan par le propriétaire passe par l'invitation d'un artisan décidée le 15/10, **en production depuis le
16/10** (PR #194, `f24dfb0`) : un artisan invité qui s'inscrit, accepte et que Gerimmo valide est sollicitable par ce
propriétaire même en commune fermée, pour les biens que couvre sa zone d'intervention
([[Invitation d'un artisan par un propriétaire]]). Le prérequis est donc levé pour ce cas, mais le parcours n'a été
joué de bout en bout que sur le banc, jamais en production.*

**Conventions du dépôt réutilisées (vérifiées dans le code) :**

- Fonctions SQL `security definer`, `set search_path = ''`, privilèges retirés à `public` et `anon`, test
  `aucune-fonction-ouverte-a-anon` ; lecture par politique `org_ids_avec_roles(...)`, **écriture uniquement par fonction**.
- Fonction existante à modifier : relire sa définition en vigueur (`pg_get_functiondef`) et y ajouter un morceau, comme le
  font `20260913150000` et `20261013120000`, pour ne pas écraser les gardes ajoutées par les migrations suivantes. Changement
  de type de retour : `drop function` puis `create`, puis `fermer_fonctions_a_anon()` (patron de `20260927123000`).
- Garde de portefeuille des agents : `incident_hors_portefeuille`, `intervention_hors_portefeuille`, `devis_hors_portefeuille`
  (`20260913150000`) ; garde d'abonnement : `org_ecriture_ouverte`.
- Fil d'événements de l'incident : liste fermée `incident_evenements_type_check` (à étendre dans la migration), libellés dans
  `TYPES_EVENEMENT_INCIDENT` (`src/lib/incidents.ts`), détail dans `pane-incident.tsx`. Un type sans libellé s'affiche en
  clair technique (cf. SA-08).
- Alertes : table `alerts` (type, criticité, détails, origine), fermée à la décision (patron de `decider_avenant_devis`).
- Notifications : `notifierEnCoulisses` **après** le succès de la fonction ; un e-mail qui échoue est consigné et ne défait
  jamais le geste. Aucune clé d'envoi sur le banc : l'échec est le comportement attendu en test.
- Rejeu sûr : clé d'envoi `uuid` unique par formulaire monté (patron `retours_utilisateurs.cle_envoi`).
- Jour et heure : toujours Europe/Paris (`aujourdhuiParis`, `(now() at time zone 'Europe/Paris')::date`, cf. ARC-10).
- Limites du banc : aucun e-mail réel ; aucun PDF généré (Chrome absent, VER-COMPLETUDE-09) ; stockage émulé : les
  parties PDF et stockage se testent en préproduction.

---

## A. Devis révisable et refusable, avec contre-proposition de l'artisan

*Fiches : ART-13, PRO2-12, PRO2-13. Chaîne : « Demande et sélection de devis ». Décision : D18 (alerte seule : D19).*

### A.1 Problème et comportement cible

Aujourd'hui un devis reçu ne peut qu'être **retenu** (écran propriétaire : « Télécharger », « Ouvrir », « Retenir ce devis »).
Il n'y a ni refus motivé, ni demande de révision, et l'artisan ne peut pas déposer de version 2 : la demande close devient
lecture seule. Le wiki prévoit « déposé → validé, refusé ou expiré » ; le code compte `depose, retenu, non_retenu, expire,
annule`.

Comportement cible : le propriétaire **retient**, **refuse** (définitif, motif obligatoire) ou **demande une révision**
(motif obligatoire). Après une demande de révision, l'artisan dépose une **version suivante** en expliquant ce qui change
(c'est sa contre-proposition) ou renonce. Toutes les versions restent consultables ; seule la dernière peut être retenue.
Chaque devis reçu crée une **alerte dans l'application** (PRO2-13).

### A.2 Ce qui existe déjà, et ce qui est à construire

| Élément | Existant (fichier) | À construire |
|---|---|---|
| Tables | `incident_consultations`, `incident_sollicitations`, `incident_devis` (`20260911180000`), colonnes de détail `lignes, diagnostic, montants HT/TVA, délai, durée…` (`20260922120000`) | colonnes `version`, `devis_precedent_id`, `note_revision`, `decision`, `decide_par`, `decide_le`, `decision_motif` sur `incident_devis` |
| Contrainte | `unique (sollicitation_id)` (une seule réponse par demande) ; index partiel `incident_devis_un_retenu` | remplacer par `unique (sollicitation_id, version)` + index partiel « un seul devis vivant (`depose` ou `retenu`) par sollicitation » |
| États | `devis_statut` : `depose, retenu, non_retenu, expire, annule` ; `sollicitation_statut` : `envoyee, declinee, devis_depose, retenue, non_retenue, expiree, annulee` | valeurs `refuse`, `revise` (devis) et `refusee`, `revision_demandee` (sollicitation) ; `alter type … add value if not exists`, valeurs utilisées seulement dans des corps de fonction |
| Dépôt artisan | `deposer_devis_structure` → `deposer_devis` (exige la sollicitation à l'état `envoyee`) ; `calculer_devis_lignes` (centimes entiers) | accepter aussi `revision_demandee` ; calculer `version`, relier à la version précédente ; « ce qui change » obligatoire |
| Décision propriétaire | `retenir_devis` (exige `depose`, validité, incident `qualifie`, artisan affectable ; crée la mission) | `refuser_devis(p_org, p_devis, p_motif, p_cle)` et `demander_revision_devis(p_org, p_devis, p_motif, p_avant, p_cle)` |
| Renoncement artisan | `decliner_sollicitation` | l'autoriser depuis `revision_demandee` |
| Plafond de deux artisans | `solliciter_artisan_interne` (corps d'origine de `20260911180000`, enveloppé par `solliciter_artisan` depuis `20260928081000`) compte `envoyee, devis_depose, retenue` | ajouter `revision_demandee` au compte ; `refusee` libère la place |
| Brouillon artisan | `artisan_devis_preparations` (une ligne par sollicitation : brouillon, validé, envoyé, `revision`, PDF, e-mail) | à la demande de révision : remettre la ligne en `brouillon`, `revision + 1`, `devis_id` et PDF vidés (les PDF des versions envoyées restent portés par `incident_devis.document_id`) |
| Avenant après acceptation | `devis_avenants`, `demander_avenant_devis`, `decider_avenant_devis` (motif ≥ 10 caractères, alerte `avenant_devis_a_decider` fermée à la décision) | rien : **ne pas fusionner**. L'avenant couvre un dépassement *après* acceptation ; la révision couvre l'*avant* |
| Alerte de réception | `notifierDevisRecu` : e-mail seul | alerte `devis_a_decider` créée dans la transaction du dépôt, fermée à la décision |
| Écrans | propriétaire : `BoutonRetenirDevis` (`incidents/formulaires-artisan.tsx`), `volet-artisan.tsx` ; artisan : `/artisan/devis/[sollicitationId]` (lecture seule dès que la demande n'est plus `envoyee`), `FormulaireAvecReprise`, `/api/devis/[id]/pdf` | voir A.8 |
| Expiration | `maintenance_artisans()` marque les devis périmés (RM-9.2.3) mais **aucun appelant** et exige un super-administrateur (DEC-11, hypothèse) | tâche planifiée interne (X22) pour l'échéance de réponse à une révision |

### A.3 Acteurs et déclencheurs

| Acteur | Geste | Déclencheur |
|---|---|---|
| Propriétaire (`proprietaire_direct`) ; en V1 non publique agence `admin_agence` / `agent` avec garde de portefeuille | Retenir, refuser, demander une révision | Devis au statut `depose`, incident `qualifie`, devis non expiré |
| Artisan sollicité | Déposer la version suivante, ou renoncer | Sollicitation à l'état `revision_demandee` (e-mail + bandeau) |
| Locataire | Aucun (« ni le locataire ni Gerimmo n'approuvent l'intervention ») | — |
| Super-administrateur | Lecture, via la traversée tracée (SA-01, D08) | — |

### A.4 États et transitions

| De | Geste | Vers | Effets |
|---|---|---|---|
| sollicitation `envoyee` | l'artisan dépose v1 | `devis_depose` ; devis v1 `depose` | événement `devis`, alerte `devis_a_decider`, e-mail existant |
| devis `depose` | le propriétaire retient | devis `retenu`, sollicitation `retenue` | existant : mission créée, autres devis `non_retenu` |
| devis `depose` | le propriétaire **refuse** (motif ≥ 10 car.) | devis `refuse`, sollicitation `refusee` | événement `devis_refuse`, alerte fermée, e-mail à l'artisan avec le motif ; la consultation reste ouverte, la place est libérée |
| devis `depose` | le propriétaire **demande une révision** (motif ≥ 10 car., échéance de réponse, 7 jours proposés) | devis `revise`, sollicitation `revision_demandee` | événement `devis_revision_demandee`, alerte fermée, e-mail à l'artisan, brouillon réouvert |
| sollicitation `revision_demandee` | l'artisan dépose v(n+1) avec « ce qui change » | `devis_depose` ; devis v(n+1) `depose` | événement `devis_revise`, nouvelle alerte, e-mail au propriétaire |
| sollicitation `revision_demandee` | l'artisan renonce | `declinee` | existant, motif conservé |
| sollicitation `revision_demandee` | échéance dépassée | `expiree` | tâche planifiée (X22) ; événement et alerte au propriétaire |
| devis `depose` v3 (maximum proposé) | — | seuls « retenir » et « refuser » restent proposés | message : « Dernière version possible » |

### A.5 Données persistées

- `incident_devis` : `version int not null default 1`, `devis_precedent_id uuid` (clé étrangère composite avec l'organisation),
  `note_revision text` (≤ 4 000), `decision text` (`refus` / `revision`), `decide_par uuid`, `decide_le timestamptz`,
  `decision_motif text`, avec une contrainte de cohérence calquée sur `devis_avenants_decision_coherente`.
- `incident_sollicitations` : `revision_avant timestamptz` (échéance de réponse à une révision).
- `incident_evenements` : trois types (`devis_refuse`, `devis_revision_demandee`, `devis_revise`) à ajouter à la liste
  fermée et à `TYPES_EVENEMENT_INCIDENT`.
- `alerts` : type `devis_a_decider` (criticité normale ; détails : incident, lot, devis, version, montant).
- Idempotence : `cle_envoi uuid` sur les deux gestes du propriétaire ; rejouer la même décision avec la même clé ne
  produit ni erreur, ni doublon d'événement, ni second e-mail.
- Valeur par défaut des anciennes lignes : `version = 1`, aucune réécriture.

### A.6 Droits

- Décider : `p_org in org_ids_avec_roles(admin_agence, agent, proprietaire_direct)` et `not devis_hors_portefeuille(p_org, p_devis)`.
- Déposer / renoncer : `mon_artisan_id()` = artisan de la sollicitation et `exiger_artisan_reel()` (comme aujourd'hui).
- Lecture : politique de sélection existante (organisation). L'artisan lit **ses** versions et les motifs de décision par
  `mes_sollicitations()` (type de retour étendu : `version`, `revision_motif`, `revision_avant`, `refus_motif`) ; il ne voit
  jamais le montant d'un concurrent. Le formulaire du propriétaire **dit** que le motif est transmis à l'artisan
  (même précaution que PRO2-14).
- Le locataire n'a aucun accès aux nouvelles fonctions ; `mon_suivi_intervention` compte `revision_demandee` parmi les
  artisans consultés (sinon l'écran dirait « aucun artisan » à tort).

### A.7 États d'erreur

| Cas | Comportement attendu |
|---|---|
| Devis expiré, déjà retenu, déjà décidé | message précis, aucun effet ; même décision rejouée avec la même clé : succès silencieux |
| Incident plus `qualifie` (mission déjà confiée) | refus de décider, message « dossier déjà affecté » |
| Motif absent ou < 10 caractères | refus, saisie conservée |
| Révision demandée au-delà du maximum de versions | refus ; seules « retenir » et « refuser » |
| Artisan devenu non affectable (décennale expirée, liste noire) pendant la révision | refus du dépôt v(n+1) avec la raison ; le propriétaire est alerté |
| Deux gestes simultanés (retenir v1 / demander une révision de v1) | un seul réussit : ordre de verrou fixe **devis → sollicitation → incident** ; le dépôt de la v2 n'est possible que depuis `revision_demandee`, où la v1 est déjà fermée : aucune attente croisée |
| Organisation suspendue (abonnement) | message d'abonnement, comme les autres écritures |
| Réponse perdue | la clé d'envoi rend le renvoi sûr (cf. PR178-B-06) |
| E-mail non parti | consigné ; le geste reste acquis ; l'alerte dans l'application garantit que le dossier ne dort pas |
| PDF de la v(n+1) non généré (moteur indisponible) | brouillon conservé, message référencé (patron ARC-01) |

### A.8 Écrans (schéma en liste, sans maquette)

- **Propriétaire, fiche de l'incident, bloc « Devis reçus »** : une ligne par artisan ; étiquette de version (« v2 ») ; montant TTC ;
  validité ; boutons [Télécharger le détail] [Ouvrir] **[Retenir]** **[Demander une révision]** **[Refuser]** ;
  « Demander une révision » ouvre un champ « Ce que vous demandez » (obligatoire) et une échéance (7 jours par défaut) ;
  « Refuser » ouvre « Motif (transmis à l'artisan) » et une confirmation ; historique repliable des versions précédentes avec
  leur décision, leur motif et leur date.
- **Propriétaire, alertes et accueil** : « Devis reçu — à décider » ; l'incident est compté dans « À traiter » tant qu'un devis
  `depose` attend.
- **Artisan, liste des demandes** : pastille « Révision demandée » (ton alerte) avec l'échéance ; « Refusé » (ton neutre).
- **Artisan, détail d'une demande en révision** : rappel de la demande du propriétaire ; formulaire de devis **prérempli par la
  version précédente** (reprise du brouillon existant) ; champ obligatoire « Ce qui change » ; boutons [Envoyer la version 2]
  [Je renonce à cette demande] ; en bas, la version précédente en lecture seule.
- **Artisan, demande refusée** : motif en lecture seule, PDF de ses versions.
- **Chronologie de l'incident** : trois libellés (« Devis refusé », « Révision de devis demandée », « Nouvelle version du devis »).
- **E-mails** : « Votre devis a été refusé » / « Une révision de votre devis est demandée » (motif inclus) ; « Nouvelle version du devis » au propriétaire.

### A.9 Intégrations

E-mail (Resend, deux modèles nouveaux) ; PDF du devis (rendu Chrome ; `/api/devis/[id]/pdf` à rendre multi-versions) ; stockage
(le PDF de chaque version reste dans `documents`, chemin `<org>/…`) ; `mon_suivi_intervention` et `mon_agenda_artisan`
(comptages) ; console `/admin/devis` (libellés des nouveaux états) ; `reperes_devis_realises` (ne lit que le devis lié à la
préparation envoyée : inchangé) ; tâche planifiée d'expiration (X22).

### A.10 Migration

Additive : colonnes facultatives, nouvelles valeurs d'énumération (ne se retirent pas, inoffensives), nouvelles fonctions,
remplacement de la contrainte d'unicité (verrou bref sur une petite table), types de retour étendus (`drop` + `create` +
`fermer_fonctions_a_anon`). Aucune ligne existante modifiée. Relevé de contrôle à lancer en **lecture seule** avant
l'application : nombre de lignes de `incident_devis` par statut. Sauvegarde préalable comme pour toute migration.

### A.11 Retour arrière

Désactiver les trois boutons (drapeau) ; réécrire les fonctions modifiées avec leur définition antérieure (listées en tête
de la migration) ; les colonnes et valeurs d'énumération ajoutées restent sans effet. Les devis déjà refusés ou révisés
resteraient lisibles.

### A.12 Critères d'acceptation

1. Le propriétaire refuse un devis `depose` avec un motif ≥ 10 caractères : devis `refuse`, sollicitation `refusee`, événement tracé, artisan prévenu, motif lisible par lui seul.
2. Après un refus, une nouvelle sollicitation d'un autre artisan est possible sans dépasser deux artisans simultanés.
3. Le propriétaire demande une révision : v1 passe `revise` et n'est plus retenable (`retenir_devis` répond « n'est plus sélectionnable »).
4. L'artisan ne peut déposer la v2 que depuis `revision_demandee`, avec « Ce qui change » ; la v1 reste consultable ; `version = 2` ; troisième version possible, quatrième refusée.
5. Chaque version déposée crée une alerte « Devis reçu — à décider » ; l'incident est compté « À traiter » ; la décision ferme l'alerte.
6. Retenir la v2 crée la mission avec `devis_id` = v2 ; `plafond_intervention` et l'écart de facture se calculent sur la v2.
7. Rejeu : même décision, même clé : aucun doublon (événement, e-mail, alerte). Décision différente sur un devis décidé : erreur claire.
8. Concurrence : « retenir v1 » et « demander une révision de v1 » simultanés : exactement un succès, état final cohérent.
9. Un autre artisan, un locataire, un agent hors portefeuille et un autre propriétaire échouent en appel direct des cinq fonctions.
10. Échéance dépassée : la sollicitation passe `expiree` et le propriétaire est alerté.
11. Aucun écran ne montre à un artisan le montant d'un concurrent ; aucun écran ne montre au locataire un montant.
12. Mobile 390 px et bureau 1280 px sans défilement horizontal ; clavier et focus visibles sur les trois formulaires (axe, zéro violation).

### A.13 Tests

- SQL d'intégration (modèles : `sprint7-artisans.test.ts`, `devis-structure.test.ts`, `devis-assiste-base.test.ts`) : environ 25 cas
  (transitions, maximum de versions, motifs, rejeu, concurrence à deux sessions, isolation entre artisans, portefeuille d'agent,
  échéance, compteurs du suivi locataire) ; test statique « aucune fonction ouverte à anon ».
- Unitaires TypeScript : actions du propriétaire et de l'artisan avec RPC simulée (message de succès, e-mail seulement si la
  décision est nouvelle), libellés des nouveaux événements.
- Parcours navigateur à deux comptes (modèle : `devis-reprise.spec.ts`, `parcours-artisan.spec.ts`) : dépôt v1, révision, v2,
  refus, acceptation ; audit axe sur les écrans nouveaux ; captures 390 et 1280.
- Non testable sur le banc : e-mail réel, génération du PDF : à vérifier en préproduction.

### A.14 Estimation

| Poste | Jours |
|---|---|
| Migration et fonctions SQL | 3,5–4 |
| Écrans propriétaire | 2 |
| Écrans artisan et reprise du brouillon | 2–3 |
| E-mails, alertes, libellés | 1 |
| Tests | 3 |
| Wiki et registre d'exécution | 0,5 |
| **Total version complète** | **11–14** |
| Version minimale (refus motivé seul, sans version 2, avec alerte) | 4–5 |

### A.15 Questions au dirigeant

1. Version complète (refus + révision + versions) ou minimale (refus seul) ? 2. Nombre maximal de versions (3 proposé).
3. Échéance de réponse de l'artisan à une révision (7 jours proposé). 4. Le motif de refus est-il montré à l'artisan (oui proposé) ?
5. Un refus libère-t-il la place pour un autre artisan (oui proposé) ? 6. Dépend de D17 (réseau fermé).

**Hors périmètre :** négociation par messagerie libre, comparaison automatique entre versions, signature du devis, avenant
(déjà existant), devis des clients externes de l'artisan (autre domaine).

---

## B. Règlement de la facture d'intervention : côté propriétaire, trace côté artisan

*Fiches : PRO2-21, CHN-02 (journal d'audit). Chaîne : « Intervention et clôture ». Décision : D23.*

### B.1 Problème et comportement cible

Le propriétaire peut **valider** la facture déposée (`valider_facture_artisan`) mais l'écran dit seulement « Le paiement reste à
effectuer et à enregistrer dans la comptabilité ». Le formulaire d'écriture n'a ni champ facture ni champ incident : l'écriture
libre n'est liée à rien, la facture reste « validée » sans date de règlement, et l'artisan ne voit rien. Le seul « payé » du
produit est le registre **privé et déclaratif** de l'artisan (`artisan_reglements`, module désactivé en production), confirmé
par personne : les deux états peuvent diverger sans que personne le sache.

Comportement cible : sur une facture validée, le propriétaire **enregistre le règlement** (déclaratif, aucun virement exécuté ;
date, moyen, référence, montant, partiel possible). Une **écriture de dépense liée** est créée dans la même transaction. La
facture affiche « partiellement réglée » puis « réglée le … », visible du propriétaire et de l'artisan, avec la mention
« déclaré par votre client ». Le registre privé de l'artisan reste privé et distinct.

### B.2 Ce qui existe déjà, et ce qui est à construire

| Élément | Existant (fichier) | À construire |
|---|---|---|
| Facture | `intervention_factures` (numéro, montant TTC, montant de référence, écart justifié, document, `validee_le`, `validee_par`, `decision_motif`, `imputation_validee`) — `20260927123000`, `20260930220000` | rien sur cette table (l'état de règlement se calcule) |
| Validation | `valider_facture_artisan` (exige imputation décidée, contestation traitée, motif) ; alerte `facture_artisan_a_valider` ; événement `facture_validee` | — |
| Écritures | `ecritures` (catégorie, sens, montant, `date_piece`, `date_imputation`, libellé immuable, `lot_id`, `systeme`, `contre_ecriture_de`, `encaissement_id`, `depot_encaissement_id`) ; mois clos refusé par `ecriture_mois_ouvert` | aucune colonne nouvelle : le lien est porté par la table des règlements |
| Annulation | `contre_ecriture` refuse les écritures nées d'un geste de gestion ; `ecriture_annulable_depuis_le_journal` dit où agir ; `contre_passer_encaissement` est le geste inverse de l'encaissement | une branche « règlement de facture » dans `ecriture_annulable_depuis_le_journal` et la fonction `retirer_reglement_facture` |
| Registre privé de l'artisan | `artisan_reglements` (facture Gerimmo ou externe, moyen, référence, pièce, annulation motivée), `artisan_reglement_ecrire` avec clé d'envoi, module `reglements` désactivé en production | rien : **conservé tel quel** (décision de registre privé, sans confirmation du client) |
| Lecture artisan | `mon_agenda_artisan` (rend `facture_deposee`) ; page « Ma facturation » ; export `mon_activite_artisan_privee` | colonnes d'état de règlement ; page « Ma facturation » et fiche de la mission |
| Écran propriétaire | `FacturesIncident` (`incidents/factures-incident.tsx`), `ValidationFacture` | bloc « Règlement » |
| Traces | chronologie de l'incident ; journal d'audit **sans** ligne pour la validation (CHN-02) | événements `facture_reglee`, `reglement_retire` ; ligne d'audit pour validation et règlement |

### B.3 Acteurs et déclencheurs

| Acteur | Geste | Déclencheur |
|---|---|---|
| Propriétaire (ou gérant, avec garde de portefeuille) | Enregistrer un règlement ; le retirer avec motif | Facture validée (`validee_le` non nul), solde > 0 |
| Artisan | Voir l'état et les règlements de **ses** factures | Facture déposée |
| Super-administrateur | Lecture, traversée tracée ; toute écriture porte l'auteur (D08) | — |
| Locataire | Aucun | — |

### B.4 États de la facture (calculés)

`deposee` → `validee` → `partiellement_reglee` → `reglee`. Le retrait d'un règlement ramène à l'état précédent. Une colonne
`reglee_le` mise à jour par les fonctions (jamais par trigger caché) sert aux filtres et à l'écran Santé.

### B.5 Données persistées

- Table `intervention_facture_reglements` : `id`, `organization_id`, `facture_id` (clé étrangère composite), `montant_cents bigint > 0`,
  `date_reglement date`, `moyen` (`virement, cheque, especes, carte, autre`, mêmes valeurs que le registre privé), `reference text`
  (1–200), `ecriture_id uuid unique` (écriture de dépense créée), `cle_envoi uuid` avec `unique (facture_id, cle_envoi)`,
  `cree_par`, `created_at`, et le retrait (`retire_le`, `retire_par`, `retrait_motif`, `contre_ecriture_id`) avec contrainte de cohérence.
- `ecritures` : une dépense par règlement (`categorie` = « travaux », `sens` = dépense, `montant` en euros à deux décimales,
  `date_piece` = date du règlement, `date_imputation` = jour de Paris, `lot_id` de l'incident, libellé « Règlement facture n° … — incident INC-… »).
  Le libellé ne doit contenir aucun mot qui déclenche le classement « fonds de travaux » (FIN-07) : test dédié.
- `incident_evenements` : `facture_reglee`, `reglement_retire` (liste fermée et libellés).
- `audit_log` : lignes `facture_validee`, `reglement_facture_enregistre`, `reglement_facture_retire` (auteur, facture, montant) — répond à CHN-02.
- Aucune règle fiscale nouvelle : la dépense entre dans le circuit existant, comme pièce **à qualifier** du récapitulatif 2044.

### B.6 Droits

- Écriture : `org_ids_avec_roles(admin_agence, agent, proprietaire_direct)`, `not intervention_hors_portefeuille`, `org_ecriture_ouverte`.
- Lecture propriétaire : politique de l'organisation. Lecture artisan : fonction dédiée qui ne rend que ses factures (montant,
  date, moyen, état) — **pas la référence bancaire**. Locataire : aucun accès. Pas d'accès direct aux tables (`revoke all`).

### B.7 États d'erreur

| Cas | Comportement attendu |
|---|---|
| Facture non validée | refus : « validez d'abord la facture » |
| Montant > solde, nul, au-delà du centime, hors borne | refus, message clair ; lecture de la virgule (VER-TS-02) |
| Date future ou date de Paris mal calculée (00 h–02 h) | refus avec la date de Paris ; sélecteur plafonné à aujourd'hui |
| Mois comptable clos | le message existant du journal (« Mois clôturé : imputez au mois ouvert ou passez une contre-écriture ») est repris ; l'écriture s'impute au jour de Paris |
| Abonnement suspendu | message d'abonnement, comme les autres écritures |
| Réponse perdue, double clic | `cle_envoi` : un seul règlement ; message de succès au renvoi |
| Imputation « locataire » ou « dégradation fautive » | autorisé avec bandeau : « La refacturation au locataire n'est pas gérée dans cette version » (question 3) |
| Retrait d'un règlement déjà retiré | refus, état inchangé |
| Artisan avec règlement privé déclaré différent | affichage côte à côte, signalement de l'écart, sans correction automatique |

### B.8 Écrans (schéma en liste)

- **Propriétaire, fiche de l'incident, bloc Facture** : « Facture n° … — … € TTC — validée le … » ; **[Enregistrer le règlement]**
  (formulaire : montant prérempli au solde, date du jour, moyen, référence, pièce facultative ; texte « Aucun paiement bancaire
  n'est effectué par Gerimmo ») ; liste des règlements (date, moyen, montant, [Retirer] avec motif) ; étiquette « Réglée le … » ou
  « Reste à régler : … ».
- **Propriétaire, comptabilité** : la dépense apparaît au journal avec « née du règlement de la facture n° … » ; le bouton
  « Annuler l'écriture » renvoie vers le geste inverse (comme pour l'encaissement).
- **Artisan, « Ma facturation » et fiche de la mission** : étiquette « Réglée le … (déclaré par votre client) » ou « Partiellement
  réglée : … reçus sur … » ; à côté, son état privé s'il utilise le registre : « Déclaré par vous : payée le … » ; alerte si les deux divergent.
- **E-mail à l'artisan** : « Votre client a déclaré le règlement de la facture n° … ».
- **Chronologie** : « Règlement de facture enregistré » / « Règlement retiré ».

### B.9 Intégrations

Comptabilité (journal, mois clos, retrait par contre-écriture), récapitulatif fiscal (pièce à qualifier), GED (pièce facultative),
e-mail, journal d'audit, `mon_agenda_artisan` et `mon_activite_artisan_privee` (export), tableau de bord financier. Aucun
paiement, virement ni prélèvement n'est déclenché : le règlement est **déclaratif**, comme la validation.

### B.10 Migration

Additive : une table, une fonction d'état, trois fonctions d'écriture/lecture, une branche dans
`ecriture_annulable_depuis_le_journal`, deux types d'événement. Aucune ligne existante modifiée ; aucun rattachement rétroactif
des écritures libres déjà saisies (en option : action « rattacher une écriture existante » si des propriétaires ont déjà saisi
des règlements à la main ; le relevé de production indique 0 écriture comptable au 13/10, non revérifié ici). Types de retour
étendus (`drop` + `create` + `fermer_fonctions_a_anon`).

### B.11 Retour arrière

Masquer le bloc par drapeau ; supprimer les fonctions ; conserver la table (les écritures déjà créées restent valides et
annulables par contre-écriture). Les règlements enregistrés restent visibles dans le journal.

### B.12 Critères d'acceptation

1. Règlement total d'une facture validée : une ligne de règlement, une dépense du bon montant, du bon lot, à la bonne date ; l'état passe à « réglée ».
2. Règlement partiel puis solde : « partiellement réglée » puis « réglée » ; dépassement du solde refusé.
3. Facture non validée, abonnement suspendu, mois clos, date future, montant invalide : refus avec message exact, aucune écriture.
4. Même clé d'envoi rejouée : un seul règlement ; clé différente : deux règlements (comportement voulu et affiché).
5. Retrait avec motif : contre-écriture, état recalculé, événement tracé ; une contre-écriture ne se contre-passe pas.
6. L'artisan voit l'état et les règlements de ses factures et d'elles seules ; jamais la référence bancaire ; un autre artisan, un locataire, un agent hors portefeuille, un autre propriétaire échouent en appel direct.
7. Chronologie et journal d'audit contiennent la validation et le règlement avec l'auteur (CHN-02 clos).
8. Le libellé de l'écriture n'est pas classé « fonds de travaux » ; la dépense apparaît « à qualifier » au récapitulatif fiscal, sans qu'aucune qualification ne soit présumée.
9. Le registre privé de l'artisan n'est pas modifié par un règlement du propriétaire ; l'écart éventuel est signalé.
10. Aucun appel à un fournisseur de paiement n'existe dans le code de la fonction (vérification statique).
11. Mobile 390 px et bureau 1280 px, clavier, axe sans violation.

### B.13 Tests

SQL d'intégration (modèles : `facture-honoraires-base.test.ts`, `artisan-externe-reglements.test.ts`, `encaissement-reste.spec.ts`) :
une quinzaine de cas (états, bornes, centimes, jour de Paris, mois clos, clé d'envoi, retrait, isolation, portefeuille) ; test
du libellé contre l'expression de classement « fonds de travaux » ; test fiscal (une pièce à qualifier) ; parcours navigateur à
deux comptes (valider, régler, voir côté artisan) ; audit axe ; test statique d'absence de fournisseur de paiement.

### B.14 Estimation

| Poste | Jours |
|---|---|
| Migration et fonctions SQL | 2–2,5 |
| Écrans propriétaire | 1,5 |
| Écrans artisan | 1–1,5 |
| E-mail, audit, libellés | 0,5 |
| Tests | 2–2,5 |
| Wiki et registre d'exécution | 0,5 |
| **Total** | **7–9** (lien simple facture ↔ écriture existante, sans états : 3) |

### B.15 Questions au dirigeant

1. Règlements partiels autorisés (oui proposé) ? 2. Règlement permis quand l'imputation est « locataire » (oui, avec bandeau, car le
propriétaire règle l'artisan ; la créance sur le bail n'existe pas) ? 3. L'artisan voit-il la date et le moyen seulement (proposé) ?
4. L'e-mail à l'artisan est-il automatique (oui proposé) ? 5. Faut-il rattacher les écritures libres déjà saisies (non proposé, 0 en production) ?

**Hors périmètre :** paiement réel, rapprochement bancaire, avoir ou litige de facture, refacturation au locataire (créance sur le
bail, module 3 non construit), TVA de l'artisan, outil clients externes.

---

## C. Report ou annulation d'un rendez-vous par le locataire, avec accord de l'artisan

*Fiches : LOC-21, CHN-01 (préalable), REP-04. Chaîne : « Planification d'intervention ». Décisions : D22 et D21.*

### C.1 Problème et comportement cible

Une fois le rendez-vous confirmé, le locataire ne dispose d'aucun geste : l'écran dit seulement « Prévoyez d'être présent… ». Le
report n'existe que côté artisan (« Déplacer le rendez-vous »), l'annulation que côté propriétaire (« Retirer la mission »). Le
contournement est un message libre au gestionnaire. Le wiki prévoit pourtant la machine « confirmé → reporté → proposé ».

Comportement cible : sur une mission planifiée, le locataire peut **demander un report** (motif et trois nouvelles
disponibilités) ou **annuler le rendez-vous** (motif). Le **rendez-vous actuel reste valable tant que l'artisan n'a pas répondu** :
il n'y a jamais de « trou ». L'artisan accepte l'une des dates ou refuse (motif) ; un refus ou un silence prolongé met le
propriétaire dans la boucle pour arbitrer.

### C.2 Ce qui existe déjà, et ce qui est à construire

| Élément | Existant (fichier) | À construire |
|---|---|---|
| Créneaux | `intervention_creneaux` (auteur `artisan/locataire/agence`, tour, statut `propose/retenu/refuse/caduc`, un seul `retenu` par mission) — `20260911180000` | colonne `demande_id` |
| Choix et contre-proposition | `choisir_creneau` (locataire, mission `acceptee` ou `planifiee`), `contre_proposer_creneaux` (locataire, **mission `acceptee` seulement**, trois dates, rejeu non sûr REP-01 corrigé en branche), `proposer_creneaux` (artisan, y compris depuis `planifiee` : défait le rendez-vous) | `demander_report_rdv`, `annuler_rdv_locataire`, `retirer_demande_rdv` |
| Réponse artisan | `accepter_creneau_locataire` (autorise déjà `acceptee` **et** `planifiee`, conflit de planning vérifié), `refuser_creneaux_locataire` (motif, alerte d'arbitrage) | `accepter_creneau_locataire` doit rendre `caduc` l'ancien créneau `retenu` (sinon l'index « un seul retenu » échoue : déduit de la lecture, non exécuté) |
| Arbitrage | `fixer_creneau_arbitrage` (propriétaire, rend caducs les créneaux `propose` et `retenu`) ; alerte `creneaux_arbitrage` ; `conflit_planning_artisan` (verrou par artisan) | réutilisés tels quels |
| Décompte des refus | `choisir_creneau` et `accepter_creneau_locataire` passent les créneaux **non choisis** à `refuse` ; six `refuse` déclenchent l'arbitrage (CHN-01) | préalable : passer ces créneaux à `caduc` (D21) ; sinon trois reports bloquent l'artisan |
| Rejeu | `choisir_creneau` et `accepter_creneau_locataire` ne sont pas rejouables (REP-04) | renvoyer un succès silencieux si le même acteur a déjà retenu ce créneau |
| Suivi du locataire | `mon_suivi_intervention` (étapes), `suivi-intervention.tsx`, saisie « date + demi-journée » (`creneaux.ts`), actions `incidents-locataire.ts` | étapes et textes « report demandé », « report accepté/refusé », « rendez-vous annulé » ; formulaire |
| Agenda artisan | `mon_agenda_artisan` (`creneaux_en_attente`, `dates_locataire_en_attente`) | état de la demande ; boutons |
| Rappels | `intervention_rappels` avec `unique (intervention_id, echeance, destinataire)` ; `rendez_vous_a_rappeler` exclut tout rappel déjà tracé **quelle que soit la date** (DEC-09, hypothèse : code lu) | clé étendue à la date du rendez-vous, sinon un rendez-vous reporté après un rappel n'est plus rappelé |
| Relances de gestes | tâche `rappels` (créneau non choisi J+3, mission non acceptée J+2…) | relance « demande de report sans réponse » |

### C.3 Acteurs et déclencheurs

| Acteur | Geste | Déclencheur |
|---|---|---|
| Locataire (titulaire ou colocataire, bail `actif` ou `preavis`) | Demander un report ; annuler ; retirer sa demande | Mission `planifiee`, rendez-vous à venir (délai minimal avant le rendez-vous : 24 h proposé), intervention non démarrée |
| Artisan de la mission | Accepter une date ou prendre acte ; refuser avec motif | Demande en attente |
| Propriétaire | Reçoit les alertes, arbitre avec le formulaire existant de rendez-vous | Refus de l'artisan, silence au-delà de l'échéance, annulation tardive |

### C.4 États de la demande

`en_attente` → `acceptee` | `refusee` | `expiree` | `retiree` | `arbitree`. Une seule demande `en_attente` par mission
(index partiel). Le rendez-vous (`retenu`) ne change qu'à l'acceptation.

| Geste | Report | Annulation (variante B proposée) | Annulation (variante A) |
|---|---|---|---|
| Locataire envoie | demande `en_attente`, trois créneaux `propose` (auteur locataire), rendez-vous inchangé | rendez-vous `caduc` **immédiatement**, mission `acceptee` (à replanifier), demande `acceptee` | demande `en_attente` jusqu'à l'accord |
| Artisan accepte | date choisie `retenu`, ancienne `caduc`, autres `caduc`, mission `planifiee` avec les nouvelles dates | — (il en est informé) | rendez-vous `caduc`, mission `acceptee` |
| Artisan refuse (motif) | demande `refusee`, rendez-vous maintenu, alerte d'arbitrage au propriétaire | — | demande `refusee`, rendez-vous maintenu, alerte d'arbitrage |
| Silence | relance à 48 h, alerte propriétaire à l'échéance ; rendez-vous maintenu | — | idem |
| Annulation à moins de 24 h | — | alerte « annulation tardive » au propriétaire (information, pas de sanction) | idem |
| Propriétaire arbitre | `fixer_creneau_arbitrage` : demande `arbitree` | idem | idem |

Plafond de demandes de report par mission (2 proposées) : au-delà, « votre gestionnaire va vous appeler » (même ton que l'arbitrage actuel).
Une demande de report **n'est pas un refus** : elle ne compte pas dans les six refus.

### C.5 Données persistées

- Table `intervention_demandes_rdv` : `id`, `organization_id`, `intervention_id` (clé étrangère composite), `creneau_retenu_id`
  (le rendez-vous concerné), `type` (`report` / `annulation`), `motif_code` (liste fermée) et `motif_texte` (≤ 1 000), `statut`,
  `demandee_par`, `demandee_le`, `repondu_par`, `repondu_le`, `reponse_motif`, `expire_le`, `cle_envoi uuid`, avec
  `unique (intervention_id, cle_envoi)`, index partiel `une demande en_attente par mission`, contrainte de cohérence du statut.
- `intervention_creneaux.demande_id` pour relier les trois dates à la demande (affichage et expiration).
- `incident_evenements` : `rdv_report_demande`, `rdv_report_accepte`, `rdv_report_refuse`, `rdv_annule_par_locataire` (+ libellés).
- `alerts` : réutilisation de `creneaux_arbitrage` ; nouveau type `rdv_demande_sans_reponse`, `rdv_annule_tardif`.
- `intervention_rappels` : colonne `debut_prevu` ajoutée à la clé d'unicité (conserve la trace des rappels envoyés).

### C.6 Droits

- Locataire : mêmes gardes que `choisir_creneau` (`ma_personne_locataire(p_org)`, incident de **son** bail, titulaire ou colocataire) ;
  bail terminé : lecture seule (le suivi actuel le fait déjà). Il n'accède à aucune table : il lit par `mon_suivi_intervention`.
- Artisan : `mon_artisan_id()` = artisan de la mission, `exiger_artisan_reel()`, verrou `conflit_planning_artisan` avant toute confirmation.
- Propriétaire : lecture par l'organisation ; arbitrage par la fonction existante, avec garde de portefeuille.
- Le propriétaire et l'artisan voient le motif du locataire ; le locataire voit le motif de refus de l'artisan (déjà le cas pour les
  refus de dates) ; aucune coordonnée supplémentaire n'est échangée.

### C.7 États d'erreur

| Cas | Comportement attendu |
|---|---|
| Rendez-vous passé, démarré, ou à moins du délai minimal | report refusé avec invitation à appeler le gestionnaire ; l'annulation tardive reste possible (variante B) avec alerte |
| Moins de trois dates, doublons, dates passées | mêmes contrôles que `contre_proposer_creneaux` (instants comparés, pas leur écriture) |
| Date proposée en conflit avec un rendez-vous confirmé de l'artisan | l'acceptation est refusée avec le message existant ; l'artisan choisit une autre date ou refuse |
| Demande déjà en attente | refus ; possibilité de la retirer |
| Double envoi, réponse perdue | `cle_envoi` : succès silencieux, pas de second e-mail |
| Deux acteurs simultanés (le locataire retire pendant que l'artisan accepte) | verrou par artisan puis par mission : un seul résultat ; l'autre reçoit « demande déjà traitée » |
| Mission annulée ou refusée entre-temps | demande close, message clair |
| Artisan injoignable | échéance de réponse (48 h, ou la veille du rendez-vous si plus proche) → alerte propriétaire ; rendez-vous maintenu |

### C.8 Écrans (schéma en liste)

- **Locataire, « Mes demandes », étape « Rendez-vous »** : plage du rendez-vous ; bouton secondaire **[Je ne peux plus être là]** →
  choix **Reporter** / **Annuler le rendez-vous** ; report : motif (liste), trois disponibilités (date + demi-journée, composant
  existant), [Envoyer à l'artisan], phrase « Votre rendez-vous du … reste valable tant que l'artisan n'a pas répondu » ;
  annulation : motif, confirmation à deux temps ; ensuite : « Report demandé le …, réponse attendue avant le … » + [Retirer ma
  demande] ; « L'artisan a accepté : nouveau rendez-vous … » ; « L'artisan ne peut pas : votre gestionnaire va vous appeler ».
- **Artisan, agenda et fiche de la mission** : bandeau « Le locataire demande un report » avec le motif ; trois dates avec
  **[Accepter cette date]** ; **[Aucune ne convient]** (motif obligatoire) ; pour une annulation : « Le locataire annule le
  rendez-vous du … » avec [J'en prends acte] (variante B : information, sans bouton bloquant).
- **Propriétaire, fiche de l'incident** : ligne « Report demandé le … (motif) — en attente / accepté / refusé » ; alertes
  « Rendez-vous à arbitrer », « Annulation tardive », « Demande sans réponse » ; formulaire de rendez-vous existant.
- **E-mails** : trois modèles (demande de report à l'artisan, réponse au locataire, annulation à l'artisan et au propriétaire).
- **Rappels** : le rappel de la veille et de J-7 suit la nouvelle date.

### C.9 Intégrations

E-mail (trois modèles, `notifierEnCoulisses`) ; tâche `rappels` (relance de demande sans réponse, rappel de la nouvelle date) ;
agenda artisan ; planning (`conflit_planning_artisan`) ; chronologie ; alertes du propriétaire ; wiki : la machine « confirmé →
reporté → proposé » du registre A5 reçoit enfin son implémentation.

### C.10 Migration

Additive : une table, une colonne sur les créneaux, une colonne et une clé d'unicité modifiée sur `intervention_rappels`, types d'événement,
fonctions nouvelles. Fonctions existantes modifiées par relecture de leur définition en vigueur (`accepter_creneau_locataire`,
`choisir_creneau` et `rendez_vous_a_rappeler` / `marquer_rappel_envoye`) ; `mon_suivi_intervention` et `mon_agenda_artisan` : `drop` +
`create` + `fermer_fonctions_a_anon`. Aucune donnée à reprendre. **Préalable D21** (passer les créneaux non retenus à `caduc`) :
reprise de l'historique facultative, après un relevé en lecture seule du nombre de missions ayant à la fois un créneau `retenu`
et des créneaux `refuse`.

### C.11 Retour arrière

Drapeau de masquage du bouton ; fonctions nouvelles supprimables ; les fonctions modifiées reprennent leur définition antérieure
(listée en tête de migration) ; la table reste sans effet. Une demande en cours au moment du retour arrière laisse le rendez-vous
d'origine intact (il n'a pas été modifié avant l'accord).

### C.12 Critères d'acceptation

1. Le locataire d'une mission planifiée demande un report avec motif et trois dates valides : demande `en_attente`, rendez-vous inchangé, artisan prévenu.
2. L'artisan accepte une date : ancien rendez-vous `caduc`, nouveau `retenu`, mission `planifiee` aux nouvelles dates, locataire et propriétaire informés, rappels envoyés pour la **nouvelle** date même si un rappel de l'ancienne a déjà été tracé.
3. L'artisan refuse avec motif : rendez-vous maintenu, alerte d'arbitrage, locataire informé du refus et du motif.
4. Silence : relance, puis alerte au propriétaire à l'échéance ; rendez-vous maintenu.
5. Annulation (variante retenue) : rendez-vous `caduc`, mission `acceptee`, artisan et propriétaire prévenus ; à moins de 24 h, alerte « annulation tardive » ; aucune sanction.
6. Trois reports successifs ne déclenchent pas l'arbitrage « six refus » (préalable D21) ; le plafond de deux demandes mène à « votre gestionnaire va vous appeler ».
7. Rejeu : même clé, aucun doublon (créneaux, événement, e-mail) ; clic de l'artisan répété sur « Accepter » : succès silencieux (REP-04).
8. Conflit de planning : l'acceptation d'une date en conflit est refusée ; deux acceptations simultanées pour deux missions de l'artisan : une seule passe.
9. Un autre locataire, un ancien locataire (bail terminé), un autre artisan, un autre propriétaire, un agent hors portefeuille échouent en appel direct.
10. Le rendez-vous passé ou démarré ne peut ni être reporté ni annulé par ce circuit.
11. Mobile 390 px, bureau 1280 px, clavier, axe sans violation sur les écrans nouveaux.

### C.13 Tests

SQL d'intégration (modèles : `creneaux-locataire.test.ts`, `planning-conflits.test.ts`, `planning-conflits-concurrence.test.ts`,
`sprint7-locataire-intervention.test.ts`) : une vingtaine de cas (transitions, validations de dates, conflit, concurrence à deux
sessions, plafond, expiration, rappels, isolation, bail terminé) ; tests des textes de suivi (étapes) ; parcours navigateur à trois
comptes (locataire, artisan, propriétaire) pour report accepté, report refusé, annulation ; test de la tâche de rappel avec date
déplacée ; audit axe ; captures 390 et 1280. Non testable sur le banc : e-mails et planification réelle des tâches.

### C.14 Estimation

| Poste | Jours |
|---|---|
| Migration et fonctions SQL (dont rappels) | 3–4 |
| Écrans locataire | 1,5–2 |
| Écrans artisan | 1–1,5 |
| Propriétaire (alertes, ligne de chronologie) | 0,5 |
| E-mails, relance, libellés | 0,75–1 |
| Tests | 2,5–3 |
| Wiki et registre d'exécution | 0,25–0,5 |
| **Total (D21 non compris : 1–2 j)** | **9–12** |

### C.15 Questions au dirigeant

1. Annulation : prend effet immédiatement avec alerte (B, proposé) ou exige l'accord de l'artisan (A) ? 2. Délai minimal avant le
rendez-vous pour reporter (24 h proposé). 3. Nombre de reports par mission (2 proposé). 4. Échéance de réponse de l'artisan (48 h
proposé). 5. L'annulation tardive est-elle seulement tracée (proposé) ou signalée à l'artisan comme déplacement perdu ? 6. D21 : accord
sur la correction des créneaux « non retenus » avant cette fonction. 7. Dépend de D17 (réseau fermé).

**Hors périmètre :** report à l'initiative du propriétaire, pénalités ou frais de déplacement, notation du locataire, rendez-vous
d'état des lieux ou de visite (même mécanique, plus tard), SMS, moteur de disponibilités (parti pris du module 10 conservé).

---

## Ordre de réalisation proposé

1. **D21** (créneaux `caduc`) et **X22** (tâche planifiée interne) : petits, nécessaires aux fonctions A et C.
2. **D19** (alerte de réception d'un devis) : isolée, un jour.
3. Fonction **A**, version minimale (refus motivé), puis versions.
4. Fonction **B** (le règlement dépend de rien d'autre).
5. Fonction **C** (dépend de D21 et du correctif des rappels).

Chaque livraison passerait par la porte de validation habituelle (tests, simulation de migration, sauvegarde, autorisation explicite
de déploiement) ; aucune n'est comprise dans la version candidate actuelle.

Voir aussi : [[Décisions groupées — version candidate du 13 octobre 2026]], [[Registre des anomalies — audit du 13 octobre 2026]].
