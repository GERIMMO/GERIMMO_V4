---
type: source
tags: [identite, compte, adhesion, multi-tenant, artisan, audit]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-A1-Modele-identite.md
source-type: livrable-transverse (référentiel V3, issu de l'audit externe du 2026-07-24, point P0.2)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Livrable A1 : Modèle canonique d'identité

**En une phrase :** livrable transverse du référentiel V3 qui tranche la question laissée
ouverte par les vingt-deux modules — *que se passe-t-il quand une même personne existe dans
plusieurs agences ?* — par une **décision structurante : compte global, adhésion par agence**.

**Statut affiché : à valider avant tout développement.** Conditionne les 22 modules.

## Le problème traité

L'audit externe reproche au référentiel de séparer la personne et le compte sans définir le
comportement multi-agences : email « unique dans une agence » vs compte « parfois global »,
six cas non traités (locataire dans deux agences, artisan public multi-agences, cumul de
rôles, agent qui change d'agence, propriétaire direct devenant mandant, frontière
données globales/privées).

**Argument d'irréversibilité :** migrer de comptes cloisonnés vers un compte global est une
fusion d'identités a posteriori (doublons révélés) ; l'inverse est trivial. D'où le choix du
compte global **dès le départ**.

## Affirmations clés

1. **Cinq entités** : **Personne** (identité métier, *par agence*), **Compte**
   (authentification, *global*), **Agence** (tenant, racine d'isolation), **Adhésion**
   (compte + agence + rôle + état), **Relation métier** (locataire, garant, propriétaire,
   artisan — par agence). → [[Compte, personne et adhésion]]
2. **Unicité** : email de compte **strictement unique sur toute la plateforme** ;
   personne dédupliquée par nom + date de naissance (alerte non bloquante, par agence) ;
   SIRET unique si vérifié ; une seule adhésion par couple compte × agence.
3. **Le rôle applicatif est porté par l'adhésion, pas par la personne** (RM-A1.5) —
   une personne peut être locataire ici et propriétaire ailleurs.
4. **Artisan à deux niveaux** : profil global qui circule (SIRET, métiers, pièces, note
   agrégée, blacklist globale) vs relation d'agence privée (commentaires, blacklist locale,
   historique d'interventions, devis/factures). SIRET à **trois états** (vérifié / non
   vérifié / invalide) ; non vérifié = utilisable localement, **non publiable**. → [[Artisan]]
5. **Trois niveaux de données** : données d'agence (cloisonnées strictement), données
   partagées (visibilité choisie), données globales (comptes, personnes, indices IRL).
   → [[Isolation multi-organisation]]
6. **Discipline technique** : `organization_id` sur toute table de données d'agence,
   filtrage systématique, **un test d'isolation automatisé par table**, traversée super
   admin journalisée, identifiants non séquentiels.
7. **Les pièces d'un dossier locataire ne franchissent jamais une frontière d'agence**
   (RM-A1.10, confirme RM-0b.7.3) : compte unique, mais un dossier par agence.

## Les 11 règles RM-A1

| Code | Règle | Bloquant |
|---|---|---|
| RM-A1.1 | Compte global ; email unique sur la plateforme | **Oui** |
| RM-A1.2 | Adhésion = compte + agence + rôle + état | Structurel |
| RM-A1.3 | Une adhésion max par couple compte × agence | **Oui** |
| RM-A1.5 | Rôle applicatif porté par l'adhésion | Structurel |
| RM-A1.6 | `organization_id` sur toute table de données d'agence | **Oui** |
| RM-A1.7 | Un test d'isolation automatisé par table | **Oui** |
| RM-A1.8 | Profil artisan global, relation d'agence privée | Structurel |
| RM-A1.9 | SIRET non vérifié = pas de publication globale | **Oui** |
| RM-A1.10 | Les pièces d'un dossier ne franchissent pas les agences | **Oui** |
| RM-A1.11 | Super admin traverse, avec journalisation | Structurel |
| RM-A1.12 | Identifiants techniques jamais séquentiels | Structurel |

## Corrections apportées au référentiel V3

| Règle | Avant | Après |
|---|---|---|
| RM-0b.1.3 | Email unique dans l'agence | **Email unique sur la plateforme** |
| RM-8.1.1 | SIRET clé d'unicité, invalide accepté | **Trois états : vérifié / non vérifié / invalide** |
| RM-8.5.2 | Blacklist locale vaut pour son agence | Structurel — donnée de **relation** |
| RM-11.2.2 | Commentaire privé à son agence | Structurel — donnée de **relation** |

## Impacts sur les modules

Module 0b (email global), module 8 (états SIRET), module 16 (**l'invitation crée une
adhésion, pas un compte**), module 18 (rôles portés par l'adhésion), tous modules
(`organization_id` partout).

## Points laissés ouverts (phase B)

- **P1.1** — suppléance entre agents et transfert de portefeuille (module 18).
- **P1.2** — portail propriétaire par lien sécurisé ; touche la décision structurante
  « le mandant reçoit, il ne consulte pas ».

## Pages mises à jour par cet ingest

[[Compte, personne et adhésion]] (créée) · [[Isolation multi-organisation]] ·
[[Organisation]] · [[Artisan]] · [[Locataire]] · [[Propriétaire bailleur]] ·
[[Agent immobilier]] · [[Modèle de rôles et permissions]] ·
[[État du projet et décisions ouvertes]]
