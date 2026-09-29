---
type: source
tags: [artisan, reseau, territoire, couverture, super-admin]
status: stable
created: 2026-09-29
updated: 2026-09-29
sources: []
source-file: "app/docs/reseau-national-ouvertures-locales.md ; app/supabase/migrations/20260928081000_ouverture_reseau_par_commune_metier.sql (PR #132, pas de document dans raw/)"
source-type: documentation technique et migration du dépôt
source-date: 2026-09-28
---

# Gestion nationale, réseau d'artisans local (PR #132, 27–28/09/2026)

**Fichiers :** `app/docs/reseau-national-ouvertures-locales.md` et la migration
`app/supabase/migrations/20260928081000_ouverture_reseau_par_commune_metier.sql`
(précédée de `20260928080000_referentiel_communes_reseau.sql`).

## Résumé
La gestion des biens, baux, documents, finances et incidents est **nationale** et
indépendante du réseau d'artisans. Seules les **nouvelles mises en relation du
réseau** sont conditionnées par une **ouverture explicite commune × métier**,
décidée par le super administrateur dans l'écran de couverture
(`/admin/couverture`). Le réseau est contrôlé pour l'**adresse du bien**, jamais
pour celle du compte ou du siège.

## Points clés
- **Aucune ouverture par défaut** (ni département, ni commune, ni métier). Le filtre
  Essonne de l'administration **ne vaut pas ouverture**.
- **Référentiel officiel des communes** (geo.api.gouv.fr, téléchargé le 27/09/2026,
  34 969 communes) embarqué dans la base ; la commune se désigne par son **code
  INSEE** (un code postal peut couvrir plusieurs communes).
- **Ouvrir** (super admin) : valider l'artisan (inscription et SIRET), le
  **rattacher** aux communes pour un métier, puis **ouvrir le métier** avec une
  confirmation explicite. Chaque commune doit avoir au moins un artisan éligible
  pour ce métier, sinon **aucune** commune de la sélection n'est ouverte. Ouvrir la
  plomberie n'ouvre pas l'électricité.
- **Artisan éligible** : statut plateforme `valide`, SIRET `verifie`, visibilité
  `publique`, pas de blacklist globale, un compte, et un rattachement à la commune
  pour le métier. Si le dernier artisan éligible disparaît, les nouvelles demandes
  sont refusées même si la commune reste « ouverte ».
- **Fermer** : arrête les nouvelles mises en relation ; devis et interventions déjà
  engagés se poursuivent.
- **Côté gérant** : « Vérifier les artisans disponibles pour ce bien » ; l'adresse
  doit être complète et la commune **confirmée** (modifier l'adresse invalide la
  confirmation). Une adresse incomplète empêche de vérifier le réseau, **pas de
  gérer le bien**.
- **Commune fermée** : « **Signaler mon intérêt** » enregistre compte, bien,
  commune et métier (sans doublon) ; aucun artisan n'est contacté, aucune date
  promise. Les intérêts sont listés dans « Où le réseau est attendu » (toute la
  France).
- **Carnet personnel** : les contacts personnels éligibles (actifs dans le carnet
  de l'organisation, non blacklistés) restent sollicitables même dans une commune
  fermée.
- La demande de devis reste **dans l'incident, après qualification** ; les
  vérifications sont refaites en base au moment de l'envoi.
- Données : rien n'est supprimé ; les anciennes sollicitations portent l'origine
  « historique », les nouvelles « carnet » ou « réseau » avec la commune.

## Ce que cette source apporte au wiki
- Page créée : [[Ouverture du réseau d'artisans]].
- Pages mises à jour : [[Artisan]], [[Super Admin]], [[Demande et sélection de devis]],
  [[Expansion territoriale autonome]], [[Gerimmo en autonomie]], [[Accueil]].

> [!warning] Contradictions avec l'existant
> - Le module 8 V3 et l'état du 11/09 décrivaient une **zone d'artisan par codes
>   postaux** ; pour le réseau, elle est supplantée par le rattachement commune ×
>   métier ([[Artisan]], [[Demande et sélection de devis]]).
> - [[Expansion territoriale autonome]] parlait d'« ouvrir un département » : la
>   gestion n'est jamais fermée par territoire ; seul le réseau s'ouvre, par
>   commune × métier.
