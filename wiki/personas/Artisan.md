---
type: persona
tags: [role, artisan, incident]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]", "[[2026-07-24-gerimmo-v3-module-7-incidents]]", "[[2026-07-24-gerimmo-v3-module-8-artisans]]", "[[2026-07-24-gerimmo-v3-module-11-notation]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]"]
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
  Seuils **J-60/J-30/J-7/J+0**.
- **Recherche d'affectation** : métier + zone + décennale (filtre non désactivable) +
  exclusion des blacklistés, **triée par score**.
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