---
type: business-rule
tags: [artisan, reseau, territoire, couverture, super-admin, devis]
status: stable
created: 2026-09-29
updated: 2026-09-29
sources: ["[[2026-09-28-reseau-national-ouvertures-locales]]"]
---

# Ouverture du réseau d'artisans

**Énoncé :** la gestion locative est **nationale** ; seul le **réseau d'artisans
Gerimmo** s'ouvre, **explicitement**, **commune (code INSEE) × métier**, par le
[[Super Admin]] — et un artisan n'y est proposé que s'il est validé, public et
rattaché à la commune pour ce métier.

## Fondement
- Décision produit livrée par la PR #132 (27–28/09/2026) —
  [[2026-09-28-reseau-national-ouvertures-locales]].
- Pas de fondement réglementaire propre : règle commerciale et de qualité de service.

## Portée
- S'applique à : [[Artisan]], [[Demande et sélection de devis]], [[Incident]],
  [[Bien]], [[Super Admin]], [[Gérant]] ([[Agent immobilier]],
  [[Administrateur d'agence]], [[Propriétaire bailleur]] en gestion directe).
- Ne s'applique **pas** à la gestion des biens, baux, documents, finances et
  incidents : un propriétaire ou une agence gère des biens **partout en France**.
- Contrôle fait sur l'**adresse du bien**, jamais sur celle du compte ou du siège.

## Paramètres / valeurs
- **Aucune ouverture par défaut** : ni département, ni commune, ni métier. Le
  **filtre Essonne** de l'administration est un réglage d'affichage, **pas une
  ouverture**.
- **Où** : Supervision → Couverture (`/admin/couverture`) : choisir département et
  métier, cocher les communes, rattacher les artisans, puis « Ouvrir ce métier »
  avec **confirmation explicite**.
- **Une ouverture par métier** : ouvrir la plomberie n'ouvre pas l'électricité.
- **Tout ou rien par sélection** : chaque commune sélectionnée doit avoir au moins
  un artisan éligible pour le métier, sinon aucune n'est ouverte.
- **Artisan éligible** : statut plateforme valide, **SIRET vérifié**, **visibilité
  publique**, un compte, pas de blacklist globale, et **rattaché à la commune pour
  le métier**. La décennale selon la nature des travaux et les autres filtres de
  l'[[Artisan]] continuent de s'appliquer.
- **Adresse du bien** : complète, et **commune confirmée** parmi celles du code
  postal (un code postal peut couvrir plusieurs communes) ; modifier l'adresse
  invalide la confirmation.
- **Référentiel** : communes officielles (geo.api.gouv.fr, 27/09/2026, 34 969
  communes) embarquées dans la base.

## Conséquences si non respectée
- Commune fermée, artisan inéligible ou adresse non confirmée : la base **refuse**
  la sollicitation d'un artisan du réseau (message explicite ; aucun
  professionnel sollicité, aucune demande sans destinataire créée).
- **Fermeture** d'une commune × métier : plus de nouvelles mises en relation ; les
  devis et interventions déjà engagés se poursuivent.
- Si le dernier artisan éligible disparaît (privé, non validé, exclu, sans compte,
  détaché), les nouvelles demandes sont refusées même si la décision d'ouverture
  reste active.

## Implications pour l'application
- Côté gérant : « Vérifier les artisans disponibles pour ce bien » (fiche du bien
  ou carnet d'artisans) ; la demande de devis reste **dans l'incident, après
  qualification**.
- **Commune fermée** : bouton « **Signaler mon intérêt** » (compte, bien, commune,
  métier ; sans doublon) — aucun artisan contacté, aucune date promise. Les
  intérêts sont visibles dans Couverture (« Où le réseau est attendu », toute la
  France).
- **Carnet personnel** : les contacts personnels éligibles du gérant restent
  **toujours sollicitables**, même dans une commune fermée.
- Contrôles **refaits en base** au moment de l'envoi (une page restée ouverte ne
  les contourne pas).
- Traçabilité : chaque sollicitation porte son origine (`historique`, `carnet`,
  `reseau`) et la commune de départ ; rien n'est supprimé.

> [!warning] Points à trancher / contradictions
> - Supplante, pour le réseau, la « zone par codes postaux » du module 8 V3
>   ([[Artisan]], [[Demande et sélection de devis]]).
> - [[Expansion territoriale autonome]] (19/09) raisonnait en « départements
>   ouverts » : ne pas confondre avec cette ouverture du réseau ; la gestion n'est
>   jamais fermée par territoire.
> - Aucune commune n'étant ouverte par défaut, le réseau est **vide au lancement**
>   tant que le super admin n'a pas validé, rattaché et ouvert.
