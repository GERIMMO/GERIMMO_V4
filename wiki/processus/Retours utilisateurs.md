---
type: process
tags: [retours, bugs, idees, support]
status: in-progress
created: 2026-07-25
updated: 2026-09-14
sources: ["[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]", "[[Référentiel vérifiable Gerimmo du 12 septembre 2026]]"]
---

# Retours utilisateurs

**En une phrase :** comment Gerimmo écoute ses utilisateurs — deux objets, deux
circuits : le **Signalement** (bug, traitement immédiat) et l'**Idée** (évolution,
revue mensuelle). « Les mélanger produirait soit des bugs traités trop lentement,
soit des évolutions décidées dans l'urgence. »
Source : [[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs|Module 20]].

## Le signalement de bug

- Tout utilisateur connecté, menu permanent ; description attendu/constaté
  obligatoire ; **contexte technique capturé automatiquement** (écran, action,
  navigateur, appareil, agence/rôle, horodatage, erreurs) — **jamais de donnée
  personnelle** : champs, noms, montants et pièces affichées **floutés
  automatiquement**, avec **prévisualisation** avant envoi (RM-20.1.5/6).
- Support **séparé des données métier** (RM-20.1.7), conservation **6 mois**
  (RM-A2.6, [[RGPD]]) ; accusé de réception immédiat.
- **Tri par le [[Super Admin]]** : bug confirmé (bloquant/majeur/mineur),
  **incompréhension d'usage** (→ pistes de documentation — un signal de conception),
  ou idée déguisée. **Une réponse dans tous les cas.**

## La frontière avec le code (correction post-audit)

**« Gerimmo transmet et suit, il ne corrige jamais »** (RM-20.3.1/2) : le bug confirmé
part, avec son contexte, vers une file de l'environnement de développement (Claude
Code) ; la correction relève d'un **processus d'ingénierie** hors application —
branche isolée (jamais la production), relecture, **tests automatisés + préproduction
+ déploiement progressif jamais optionnels** (« le vrai garde-fou » quand relecteur et
super admin sont la même personne), surveillance, rollback. Le SA suit l'avancement
(reçu/en cours/corrigé, référence technique, version) mais **ne valide pas le
correctif** ; l'utilisateur est notifié à la confirmation puis à la correction.

## Les idées

- **Décrire le besoin, pas la solution** (formulaire guidé) ; idées similaires
  proposées avant création, doublons fusionnés (soutiens additionnés).
- Visibilité : l'auteur + **son agence** (soutien, anti-doublons) — **jamais les
  autres agences** ; le SA voit tout.
- **Revue mensuelle** (alerte module 14) avec **classement automatique** : soutiens
  (fort), **agences distinctes (le plus fort)**, ancienneté (modéré) — il éclaire,
  la décision reste humaine.
- **Trois statuts, jamais le rejet** (RM-20.5.5) : **retenue** → notification +
  **article** diffusé à toute la plateforme via les annonces
  ([[Agenda et échéances]], 14.6 — échéance indicative, jamais un engagement) ;
  **non retenue pour le moment** → **motif compréhensible + date de réexamen
  automatique** ; **déjà couverte** → explication. Archivée après deux ans, auteur
  informé.

## Relations

Console et files du [[Super Admin]] (module 18) ; alerte de revue et annonces au
module 14 ; conservation [[RGPD]] 6 mois. **Plan de livraison** : signalement dès le
**lot 1** (« c'est ainsi qu'on découvre ce qui ne va pas »), idées au lot 2.


## Réalisation et preuves au 14 septembre 2026

Le module en préparation enregistre les problèmes, questions, idées et contestations artisan. Un signalement exige le constat et le résultat attendu. Le contexte automatique contient uniquement une route dont les identifiants sont remplacés et une catégorie d'interaction ; il ne lit aucun champ ni contenu de dossier. Les textes saisis volontairement restent soumis à la consigne de ne pas inclure de données personnelles inutiles.

L'auteur et la supervision voient leurs échanges. L'administrateur de l'organisation concernée voit les signalements de son agence ; ses membres voient les idées de cet espace. Une contestation artisan reste entre l'artisan et la supervision. La réponse de support ne retire pas une évaluation automatiquement.

Les soutiens sont dédupliqués, le classement est calculé sur tout l'historique avant pagination. Le rapprochement d'idées ne partage pas leurs descriptions entre organisations. Une idée non retenue reste dans la file avec motif et date de réexamen. Chaque mois ouvre une nouvelle revue dont la supervision conserve le bilan. Retenir une idée crée une seule fois un brouillon d'article, sans recopier le texte privé ; sa publication demande une rédaction et la validation humaine habituelle.

Le support reste utilisable si l'abonnement est suspendu. Cette exception ne modifie aucun droit sur le parc, les baux ou la comptabilité.

Preuves locales : migration `20260914120000_retours_utilisateurs.sql`, 13 scénarios SQL et sept scénarios de serveur et contexte ; suite globale de 927 tests réussis. Interface compilée et contrôlée par lint. La publication de la base et la recette visuelle restent à faire ; le verrouillage du Mac empêche temporairement les essais dans le navigateur. La conservation à six mois et le raccordement à l'outil de développement restent des chantiers distincts, non déclarés livrés.
