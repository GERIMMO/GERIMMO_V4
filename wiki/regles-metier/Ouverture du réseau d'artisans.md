---
type: business-rule
tags: [artisan, reseau, territoire, couverture, super-admin, devis]
aliases: ["Réseau d'artisans choisi par l'artisan", "Couverture du réseau d'artisans"]
status: in-progress
created: 2026-09-29
updated: 2026-10-23
sources: ["[[2026-09-28-reseau-national-ouvertures-locales]]", "[[Invitation d'un artisan par un propriétaire]]", "[[Informations manquantes — 23 octobre 2026]]"]
---

# Ouverture du réseau d'artisans

> Le titre est gardé pour ne pas casser les liens. Depuis la décision du 23/10/2026, le
> réseau ne « s'ouvre » plus : il suit ce que chaque artisan choisit.

**Énoncé (décidé le 23/10/2026) :** la gestion locative est **nationale**. Le **réseau
d'artisans Gerimmo** propose, pour un bien, les artisans qui ont **eux-mêmes choisi** une
zone d'intervention couvrant ce bien et le **métier** demandé, dès que Gerimmo a **validé**
leur inscription (SIRET vérifié) et que leur profil est **public**. Plus d'ouverture
commune × métier par le [[Super Admin]].

**État au 23/10/2026 :** décision prise ; livrée par la migration
`20261023180000_reseau_zone_choisie_par_artisan` et le code qui l'accompagne, **non
appliquée en production**. Jusqu'à sa mise en production, c'est la règle du 28/09 (section
« Règle supplantée ») qui s'applique : production à 0 ouverture, donc aucun propriétaire ne
peut solliciter un artisan du réseau.

## Fondement
- Décision du dirigeant du 23/10/2026 (`log.md`, entrée « decision » du 23/10) : « la
  communes et les métiers à ouvriers seront choisi par l'artisan (même lors du test) » — en
  réponse à la question « Réseau d'artisans : aucune commune ouverte ; communes et métiers à
  choisir pour que la persona Artisan fonctionne » ([[Informations manquantes — 23 octobre 2026]]).
- Pas de fondement réglementaire propre : règle commerciale et de qualité de service.

## Portée
- S'applique à : [[Artisan]], [[Demande et sélection de devis]], [[Incident]],
  [[Bien]], [[Super Admin]], [[Gérant]] ([[Agent immobilier]],
  [[Administrateur d'agence]], [[Propriétaire bailleur]] en gestion directe).
- Ne s'applique **pas** à la gestion des biens, baux, documents, finances et
  incidents : un propriétaire ou une agence gère des biens **partout en France**.
- Contrôle fait sur l'**adresse du bien**, jamais sur celle du compte ou du siège.

## Paramètres / valeurs
- **Ce que l'artisan choisit** : sa **zone d'intervention** — des codes postaux (`91300`)
  ou des départements entiers (`91`, `2A`, `974`) — et ses **métiers** (liste fermée :
  plomberie, chauffage, électricité, menuiserie, serrurerie, nuisibles, autre). Il les
  déclare à l'inscription, puis les modifie dans « Mon entreprise → Mes métiers et ma
  zone ». La zone vaut pour **tous** ses métiers.
- **Quand il est proposé** : statut plateforme **valide** (validation manuelle de Gerimmo,
  inchangée), **SIRET vérifié**, **profil public** (l'artisan le décide seul ; la validation
  ne le rend pas public), un **compte** artisan, pas de **liste noire globale**, le métier
  sur sa fiche, et une zone qui couvre le **code postal du bien** (un département couvre
  tous ses codes postaux).
- **Filtres inchangés** : décennale selon la **nature des travaux**, liste noire locale ou
  relation désactivée avec l'organisation, adresse du bien complète et **commune
  confirmée** (état « adresse incomplète » sinon), contrôles refaits en base à l'envoi.
- **Une seule zone** pour le réseau et pour le carnet personnel (règle du carnet :
  `reseau_contact_dans_zone`, inchangée).
- **Qui peut modifier zone et métiers** : l'artisan titulaire du compte, et la supervision
  (fonction en base, sans écran). **Plus une agence** pour un artisan qui a son compte ;
  une agence garde la main sur une fiche **sans compte** de son carnet **actif** (jamais
  proposée au réseau). Un propriétaire direct ne le peut pas (depuis le 15/10).
- **Supervision** : `/admin/couverture` constate la couverture (artisans proposés et
  déclarés par commune, intérêts, demandes) ; aucune décision n'y est prise. Pour écarter
  un artisan : suspension de l'inscription ou liste noire globale.
- **Coordonnées** : l'e-mail d'un artisan du réseau n'est rendu qu'à une organisation qui
  l'a dans son carnet ; le téléphone est rendu (l'écran l'affiche).

## Conséquences si non respectée
- Artisan inéligible ou hors zone, ou adresse non confirmée : la base **refuse** la
  sollicitation d'un artisan du réseau (« Cet artisan du réseau n'est plus disponible… »,
  « Complétez l'adresse… » ; aucun professionnel sollicité, aucune demande sans
  destinataire créée).
- Si l'artisan retire le bien de sa zone, retire le métier, se remet en privé, est suspendu
  ou exclu : plus de nouvelle demande ; les devis et interventions déjà engagés se
  poursuivent.

## Implications pour l'application
- Côté gérant : « Vérifier les artisans disponibles pour ce bien » ; la demande de devis
  reste **dans l'incident, après qualification**. États : `adresse_incomplete`,
  `sans_artisan`, `ouverte` (plus d'état `fermee`).
- **Sans artisan** : « Signaler mon intérêt » (compte, bien, commune, métier ; sans
  doublon) ; voie de sortie du propriétaire (clôturer, inviter, appeler lui-même) ;
  intérêts visibles dans « Où le réseau est attendu ».
- **Côté artisan** : carte « Suis-je proposé dans le réseau ? » dans « Mon entreprise » et
  rappel sur « Aujourd'hui » tant qu'une condition manque.
- **Côté validation** : `/admin/artisans` montre la zone déclarée de chaque inscription.
- Traçabilité : chaque sollicitation porte son origine (`carnet`, `reseau`) et la commune
  du bien.

## Règle supplantée (28/09/2026 → 23/10/2026)
PR #132 ([[2026-09-28-reseau-national-ouvertures-locales]]) : aucune ouverture par défaut ;
le super administrateur **rattachait** les artisans aux communes (code INSEE) métier par
métier, puis **ouvrait** chaque commune × métier avec une confirmation explicite, tout ou
rien ; une commune non ouverte était « fermée ». Tables `reseau_ouvertures` et
`reseau_artisan_communes` conservées (historique, retour arrière), ni lues ni écrites après
`20261023180000`.

> [!warning] Changement du 23/10/2026 et points à trancher
> - **Supplanté le 23/10/2026** : l'ouverture explicite commune × métier par le super
>   administrateur (PR #132). Le réseau suit désormais la zone et les métiers choisis par
>   l'artisan. Effectif seulement à la mise en production de `20261023180000`.
> - **Choix de mise en œuvre à faire confirmer** : la conception du 23/10 proposait une
>   seconde liste de communes INSEE par métier, saisie par l'artisan ; la relecture a relevé
>   la double saisie (zone déjà déclarée à l'inscription), un plafond inventé (1 000
>   communes) et deux notions de zone contradictoires à l'écran. Le lot retient la zone
>   **déjà** choisie par l'artisan (codes postaux, départements). Conséquence : une zone par
>   artisan, la même pour tous ses métiers. Des communes **par métier** restent possibles
>   plus tard si le dirigeant le demande.
> - **Téléphone avant sollicitation** : rendu à tout propriétaire dont le bien est dans la
>   zone. Un propriétaire peut déplacer un bien vide pour lire les numéros d'une autre zone.
>   Masquer le téléphone tant que l'artisan n'est pas sollicité, ou limiter les changements
>   de commune d'un bien : à trancher.
> - **Aucun levier ciblé de la supervision** (par artisan et par zone, ou suspension d'une
>   commune × métier) : non livré, la décision ne le prévoit pas. Leviers restants :
>   suspension, liste noire globale.
> - **Aucun plafond de zone** : un artisan peut déclarer toute la France. Risque de dilution
>   du réseau ; pas de chiffre dans une source. À trancher si besoin.
> - **Artisans de test** (bêta, recette G6) : validés, publics et dotés d'une zone, ils sont
>   proposés aux vrais propriétaires de cette zone (décision du 23/10 : les comptes des amis
>   sont « des clients comme les autres »). Les garder privés (et passer par l'invitation)
>   ou limiter leur zone à la commune du bien de test.
> - **Carnet du propriétaire direct** (relevé du 16/10/2026, inchangé) : ajout par SIRET
>   réservé aux agences ; le propriétaire **invite** un artisan
>   ([[Invitation d'un artisan par un propriétaire]]). L'invité reste privé par défaut : il
>   n'est pas proposé au réseau des autres propriétaires tant qu'il ne se rend pas public.
> - [[Expansion territoriale autonome]] (19/09) raisonnait en « départements ouverts » :
>   empreinte commerciale, sans lien avec le réseau.
