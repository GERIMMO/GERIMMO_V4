---
type: persona
tags: [role, artisan, incident]
status: in-progress
created: 2026-07-21
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]", "[[2026-07-24-gerimmo-v3-module-7-incidents]]", "[[2026-07-24-gerimmo-v3-module-8-artisans]]", "[[2026-07-24-gerimmo-v3-module-11-notation]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "[[2026-09-28-reseau-national-ouvertures-locales]]"]
---

# Artisan

**En une phrase :** prestataire/intervenant technique (dépannage, travaux) mobilisé sur
les [[Incident|incidents]].

Nom technique : rôle `artisan` (scope `organization`), `member_type = contractor`,
portail **ARTISAN**.

## Rôle et objectifs
- Recevoir des demandes d'intervention/[[Devis|devis]], intervenir, échanger, déposer des documents.

## Responsabilités / activités
- Traiter les incidents/interventions qui lui sont **partagés** : répondre aux [[Demande et sélection de devis|devis]],
  proposer des créneaux ([[Planification d'intervention]]), faire avancer l'[[Intervention et clôture|intervention]].
- **Module 7 (V3)** : accepter ou refuser une mission (refus = réaffectation) ; sur
  place, rendre compte avec **photo du travail réalisé obligatoire** (RM-7.5.2 — sans
  elle, l'intervention ne peut être terminée) et **signaler une cause différente** de
  celle supposée (RM-7.5.3 — il est le seul à voir la cause réelle ; l'agent révise
  l'imputation avant facturation). N'est proposé à l'affectation que dans **son
  métier**, et écarté des travaux à décennale si son attestation n'est pas valide.

## Permissions clés
- Portail restreint : `view:dashboard/tasks/incidents/documents/communication`.
  Accès **limité aux données qui lui sont partagées**.
- **Non** : aucune gestion d'utilisateurs, d'organisation ni de biens.

## Deux approbations distinctes de l'artisan
L'artisan franchit **deux portes indépendantes**, à ne pas confondre :
1. **Validation globale (droit d'exister sur la plateforme)** — *« proposé par Gerimmo »*.
   Statut dans `artisan_validations` (`en_attente`/`valide`/`refuse`), **au niveau de la personne**
   (pas par organisation), assuré par le **[[Super Admin]] uniquement** (contrôle des justificatifs
   légaux avant activation).
2. **Approbation par intervention (choix opérationnel)** — c'est la **sélection de son devis**
   (`selectQuote`) sur un [[Incident]] donné, décidée par le **[[Propriétaire bailleur]] ou
   l'[[Agent immobilier]]** (l'[[Administrateur d'agence]] le peut aussi, cf. agent ++). Ni le
   [[Locataire]] ni Gerimmo n'approuvent l'intervention. Voir [[Demande et sélection de devis]].

La notion `artisan_scope` sur une sollicitation (`prive` = artisan privé de l'agence vs
`gerimmo_valide` = validé par la plateforme) qualifie **d'où vient** l'artisan sollicité, en amont
de cette sélection.

## Usage mobile : quotidien, « son outil de travail » (module 19)

Contexte : sur le chantier, entre deux interventions — criticité haute. **Le compte
rendu conditionne la facturation** : sans la photo obligatoire (RM-7.5.2),
l'intervention ne peut être terminée, donc pas de facture. Il doit pouvoir la prendre
et l'envoyer depuis le chantier « en quelques secondes — la condition pour qu'il joue
le jeu ». Actée : **compte rendu en deux écrans** (RM-19.3.1), **photo = champ
central** (RM-19.3.2), agenda toutes agences confondues avec **logo de l'agence sur
chaque intervention** (RM-19.3.3, reprend RM-17.3.2 — [[Marque blanche]]).
Contraintes d'écran : mains sales/gants → boutons larges, plein soleil → contrastes
élevés, réseau faible → photo compressée, envoi différé. 8 parcours déclinés :
mission (7.4), créneaux (10.1), agenda (10.7), compte rendu (7.5), devis (9.2),
facture (9.7), attestations (8.2), sa note (11.4). Aucune règle métier modifiée
(RM-19.3.4).

## Contestation de note = un droit (RGPD) — et Gerimmo responsable de traitement
Le [[2026-07-24-gerimmo-v3-a2-conservation-rgpd|livrable A2]] confirme (RM-A2.11) :
la **contestation de note** du module 11 est l'exercice du **droit à l'intervention
humaine** — le score « combine des appréciations humaines et des indicateurs
automatiques, et influence le classement » ; elle doit être **présentée comme telle à
l'artisan**. A2 va plus loin : pour l'annuaire public, le score et la blacklist
globale, **Gerimmo est responsable de traitement** (RM-A2.9 — « l'agence fournit des
évaluations ; Gerimmo décide de ce qu'il en fait »), une **AIPD sur le score
(profilage) reste à évaluer**. Conservation (matrice A2) : évaluations individuelles
**3 ans**, score agrégé tant qu'il est actif, profil et pièces actif + 3 ans.

## Notation à trois niveaux (précision humaine 2026-07-22, confirmée par le module 8)
Le référentiel V3 confirme et chiffre l'intention : **score composite** —
1. **[[Gérant]] : 50 %** (qualité, délai, rapport qualité-prix — « le seul à voir
   l'ensemble »).
2. **[[Locataire]] : 25 %** (satisfaction de l'intervention sur place — on ne lui
   fait pas juger un prix qu'il n'a pas payé).
3. **Plateforme : 25 %** — fiabilité **calculée** : délais d'acceptation et
   d'intervention, taux de refus, RDV manqués, ponctualité documentaire.
L'artisan voit sa moyenne et son score de fiabilité (« le cacher serait déloyal »),
jamais le détail par évaluateur ; pas de réponse publique.
Détails du module 11 (2026-07-24) : note locataire **relancée J+3/J+7 sans jamais
bloquer** son espace (sans réponse : hors calcul) ; **publication au-delà de 3
évaluations** (mention « nouveau » avant) ; **contestation auprès du super admin**
(l'agence est juge et partie) — accès exceptionnel du SA au détail, **tracé** ; retrait
d'une note = recalcul. La matrice qualifie cette contestation de **droit à
l'intervention humaine** (RM-A2.11 — obligation d'information de l'artisan).

## Pièces, décennale et visibilité (module 8, 2026-07-24)
- **L'agence crée la fiche** (SIRET = clé, métiers en liste fermée, zone par codes
  postaux) **puis l'artisan la maîtrise** : il dépose **lui-même** ses pièces
  (RM-8.2.1) et **décide seul de sa visibilité** (RM-8.4.2) — privé par défaut, public
  ou privé à des agences choisies. Un artisan public se **rattache**, jamais ne se
  duplique ; ses pièces valent pour toutes les agences.
- **Seule la décennale bloque, et selon la nature des travaux** (RM-8.2.2/8.2.9,
  décision révisée) : pas requise pour l'entretien courant, requise pour remplacement
  d'équipement, clos et couvert, réseaux encastrés, gros œuvre. Expirée → retrait
  automatique des listes (rétabli au dépôt) ; intervention en cours jamais
  interrompue. Autres pièces (URSSAF, RC pro, Kbis, certifications) : alerte seule.
  **Supplanté le 27/09 pour la validation de l'inscription** : décision du porteur,
  une inscription ne se valide qu'avec une **décennale ET une RC pro en cours**
  (voir la note du 04/09 ci-dessous). La règle d'affectation par nature de travaux
  reste celle-ci.
  Seuils **J-60/J-30/J-7/J+0**.
- **Recherche d'affectation** : métier + zone + décennale (filtre non désactivable) +
  exclusion des blacklistés, **triée par score**.
- **Zone d'intervention — supplanté le 28/09/2026 pour le réseau** : la « zone par
  codes postaux » ci-dessus ne suffit plus à rendre un artisan proposable par le
  réseau. Depuis la PR #132, le réseau s'ouvre **commune (code INSEE) × métier** par
  le [[Super Admin]] ; l'artisan doit être **validé** (statut valide, SIRET vérifié),
  en **visibilité publique**, et **rattaché aux communes** pour chacun de ses
  métiers. Un artisan du carnet personnel d'un gérant reste sollicitable partout.
  Voir [[Ouverture du réseau d'artisans]].
- **Désactivation** (neutre) ≠ **blacklist** (motivée, conservée) : locale (admin
  agence, n'engage que son agence) vs **globale** (super admin seul, faits objectifs,
  réversible par lui seul). Jamais avec intervention en cours ; devis annulés.
  **Correction A2 de RM-8.5.6** : les motifs ne sont plus conservés indéfiniment —
  **3 ans (locale), 5 ans (globale)**, « la sanction la plus lourde justifiant la
  trace la plus longue ; au-delà, un artisan doit pouvoir repartir sans que son passé
  le suive » ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|A2]]).

## Profil global vs relation d'agence (Livrable A1, 2026-07-24)
« Le cas le plus complexe du modèle » d'identité ([[2026-07-24-gerimmo-v3-a1-modele-identite|A1]]) :
l'artisan porte des données qui **circulent entre agences** et d'autres qui restent
**privées à chaque agence** (RM-A1.8). La distinction devient **structurelle** :

| Donnée | Niveau |
|---|---|
| SIRET, raison sociale, métiers, pièces justificatives | **Profil global** |
| Note agrégée, score de fiabilité, blacklist **globale**, visibilité choisie | **Profil global** |
| Commentaires d'évaluation, blacklist **locale** | **Relation d'agence** |
| Historique d'interventions, devis et factures | **Relation d'agence** |

Conséquence : un artisan blacklisté par l'agence A **reste visible** pour l'agence B
(blacklist locale = donnée de relation) ; seule la blacklist globale (RM-8.5.3) vaut partout.

**SIRET à trois états** (RM-A1.9, corrige RM-8.1.1) :
- **vérifié** → publiable, rattachable par d'autres agences ;
- **non vérifié** → utilisable par l'agence créatrice, **non publiable** ;
- **invalide** → alerte, création possible, publication interdite.

## Relations
- Intervient pour les [[Administrateur d'agence|agences]] et/ou [[Propriétaire bailleur|propriétaires]].
- Peut être membre `contractor` de plusieurs organisations (multi-agences) — un compte global,
  une adhésion par agence ([[Compte, personne et adhésion]]).
- Noté après intervention (`incident_artisan_evaluations`). Voir [[Intervention et clôture]].

> [!warning] Points à trancher / contradictions
> - Trois notions de « validé/approuvé » à ne pas confondre : (1) validation **légale globale**
>   ([[Super Admin]]), (2) `artisan_scope` (origine de l'artisan sollicité), (3) approbation
>   **par intervention** = sélection du devis par le bailleur/l'agent.
> - ~~Notation : intention (3 niveaux) ≠ code actuel~~ → **spécifiée par les modules
>   8 et 11** (3 sources 25/50/25, critères par évaluateur, fiabilité à 5 indicateurs).
>   Reste la **migration du code** : `createArtisanEvaluation` (une seule évaluation
>   multi-critères sans distinction d'évaluateur) à refondre.
>
> [!note] Décision 2026-09-04 — pivot assumé : la conformité artisan porte sur Gerimmo
> Arbitrage de Tahir à l'ingest de la [[2026-09-04-maquette-v3-prototype|maquette v3]] :
> le réseau artisan devient un **service de la plateforme**. L'artisan
> **s'auto-inscrit** (SIRET, métier, mobile), dépose RC pro + décennale, et le
> [[Super Admin]] **valide l'inscription avant toute première affectation**
> (purge à 6 mois sans document). En conséquence, la **vigilance de conformité
> sort de l'agence** : plus d'alerte « décennale expirée » ni de blocage de
> devis côté agence — seuls des artisans à jour lui sont proposés ; l'échéance
> de re-collecte d'attestation devient une alerte du périmètre super admin.
> Cela **remplace** les règles S7 du 21/08 sur la vigilance agence ; le SIRET
> à trois états (RM-A1.9) reste, mais « vérifié » devient le seul état
> affectable. Intégration prévue en tranche T5.

## Ce que fait le code aujourd'hui (relevé du 16/10/2026)
- **Devis refusé ou à réviser** (D18, PR #187, fusion `8a168dd`, en production depuis le
  15/10) : l'artisan **lit le motif** d'un refus ; sur une demande de révision, il a **sept
  jours** (jour de Paris) pour déposer la version suivante en disant « ce qui change », ou
  renoncer ; **trois versions au plus** ; il retrouve l'historique de ses versions. Le dépôt
  d'une version exige qu'il soit toujours affectable. Détail : [[Devis]].
- **Report demandé par le locataire** (D22-B, PR #188, depuis le 15/10) : il reçoit trois
  nouvelles dates, en retient une (le rendez-vous change alors) ou refuse (le rendez-vous est
  maintenu, le gérant arbitre) ; sans réponse sous 48 h, la demande expire. Une annulation
  par le locataire rend le créneau caduc : il repropose des créneaux. Détail :
  [[Planification d'intervention]].
- **Règlements de ses factures** (D23-A, PR #188) : pour ses factures seulement, il voit
  l'état et la **date et le moyen** de chaque règlement déclaré par le gestionnaire, jamais
  la référence bancaire ni le détail des montants ([[Intervention et clôture]]).
- **Proposition de devis assistée par l'IA** : comptée dans le plafond quotidien des appels
  payants de la plateforme (X19, PR #190) ; limite atteinte ou arrêt d'urgence, elle n'a pas
  lieu et l'écran le dit ([[Super Admin]]).
- **Avoir sur facture externe** (D24-C, PR #190, fusion `f93ec6e`) : dans l'outil privé
  « clients externes », une facture externe se corrige par une **annulation motivée** qui
  émet un **avoir numéroté** (« AV-0001 », numérotation propre à chaque artisan, continue,
  jamais réutilisée) du même montant TTC ; le numéro de la facture annulée reste réservé ;
  une nouvelle facture devient possible sur le chantier ; pas d'annulation tant qu'un
  règlement déclaré est actif, et plus aucun règlement sur une facture annulée. **Module
  éteint en production** : l'outil privé est désactivé hors d'une base locale
  (`app/src/lib/artisan-prive.ts`), aucun réglage de l'hébergeur ne l'allume ; décision du
  15/10 : « finis », module éteint jusqu'à la validation comptable de la forme de l'avoir.
  D24-B et D25-B, qui portent sur ce même outil, sont donc déployés mais sans effet.
- **Invitation par un propriétaire** (décision du 15/10/2026, remplace D17-B) : **en cours,
  non livrée** (mise en chantier le 15/10 d'après le journal ; aucune de ses migrations
  n'est sur `main` au 16/10).

> [!warning] Points à trancher (relevé du 16/10/2026)
> - **D24-C, avant toute activation, avec l'expert-comptable** (message de fusion de la
>   PR #190) : mentions de l'avoir et numérotation AV- (en-tête de la migration
>   `20261014710000`), document remis au client et avoir partiel (journal `log.md`, entrée
>   « deploy » de la PR #190) ; à valider avec eux, deux choix du code : pas d'annulation
>   tant qu'un règlement déclaré est actif, numéro de la facture annulée réservé à vie.
>   Le journal dit ces questions reprises dans le prompt de passation, mais la page
>   [[Prompt de passation à Codex — état du 14 octobre 2026]] ne les contient pas.
> - **D18 et D22-B partiels** : pas de PDF par version de devis, pas de relance de
>   l'artisan avant l'échéance de 48 h d'un report, pas de badge dans son agenda (constat du
>   tour final de vérification).
> - La recette de production n'a aucun parcours d'artisan (espace artisan jamais parcouru).
