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
  un artisan du réseau : « Suspendre la validation » sur sa fiche. La liste noire globale
  existe en base (`artisan_decider_plateforme`) mais aucun écran ne la pose.
- **Coordonnées** : le téléphone et l'e-mail d'un artisan du réseau ne sont rendus qu'à
  une organisation qui l'a dans son carnet. Le propriétaire les lit une fois sa demande
  envoyée (la sollicitation ouvre la fiche). Avant, il voit le nom de l'entreprise, ses
  métiers et sa note. Le texte « Profil public » de l'artisan le dit.
- **Traçabilité** : chaque ajout ou retrait de zone ou de métier, par n'importe quel
  chemin (inscription, réclamation, « Mon entreprise », fiche sans compte d'une agence,
  supervision), est inscrit au journal d'audit (`artisan_zone_modifiee`,
  `artisan_metiers_modifies`) avec l'auteur, la liste avant et après, et l'état de la
  fiche (statut, SIRET, visibilité).

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
- **Côté artisan** : carte « Suis-je proposé dans le réseau ? » dans « Mon entreprise »
  (exclusion par Gerimmo comprise) et rappel sur « Aujourd'hui » tant qu'une condition
  manque : « Il vous manque : … », ou un simple repère quand seul le profil privé
  l'écarte (rester privé est un choix).
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
> - **Écart à ratifier par le dirigeant avant la mise en production** : la décision dit
>   « communes » ; le lot livre la zone **déjà** choisie par l'artisan, par **code postal ou
>   département**, la même pour tous ses métiers (la conception d'une seconde liste de
>   communes INSEE par métier a été écartée : double saisie, plafond de 1 000 communes sans
>   source, deux notions de zone à l'écran). Conséquences constatées : un artisan qui
>   choisit `51300` est proposé dans les 46 communes de ce code postal ; il ne peut pas en
>   retenir une seule ; Paris paraît « couverte » dans la supervision dès qu'un
>   arrondissement l'est (le bien, lui, est contrôlé sur son code postal exact). Si
>   l'écart est refusé : ajouter le choix d'une commune (code INSEE) à l'intérieur d'un code
>   postal, voire des communes par métier.
> - **Téléphone avant sollicitation — choix de prudence du 23/10 (relecture sécurité), à
>   confirmer** : un compte tout juste créé pouvait, en déplaçant l'adresse d'un bien, lire
>   les numéros de tous les artisans de France. Le téléphone n'est plus rendu qu'après la
>   demande (ou pour un contact du carnet). Le dirigeant peut demander l'inverse ; une
>   limite d'appels par organisation n'est pas livrée.
> - **Aucun levier ciblé de la supervision** (par artisan et par zone, ou suspension d'une
>   commune × métier) : non livré, la décision ne le prévoit pas. Levier restant à l'écran :
>   la suspension de la validation ; la liste noire globale n'a pas d'écran.
> - **Aucun plafond de zone** : un artisan peut déclarer toute la France, et une fiche
>   (même non validée) peut porter un très grand nombre de lignes de zone. Risque de
>   dilution du réseau et de volume ; pas de chiffre dans une source. À trancher si besoin
>   (un plafond technique, par exemple 200 entrées, ne dépend pas de la décision métier).
> - **Réclamation d'une fiche créée par une agence** : la zone et les métiers que l'agence
>   avait posés s'**ajoutent** à ceux que l'artisan déclare en réclamant ; il en hérite
>   sans les avoir choisis. Atténué : la réclamation remet l'inscription en attente
>   (Gerimmo revoit la zone avant de valider), seul l'artisan rend son profil public, et il
>   voit sa zone dans « Mon entreprise ». Remplacer au lieu d'additionner : à trancher.
> - **Aucun message à la validation** : un artisan validé n'est pas prévenu qu'il doit
>   encore rendre son profil public ; la carte et le rappel de son espace le lui disent.
>   Un avis (e-mail) à la validation : à décider.
> - **Artisans de test** (bêta, recette G6) : validés, publics et dotés d'une zone, ils sont
>   proposés aux vrais propriétaires de cette zone. Réponse du dirigeant du 23/10 (point 7) :
>   les comptes des amis sont gardés, ce sont « des clients comme les autres » ; c'est donc
>   le comportement attendu. Pour l'éviter pendant la bêta : les garder privés (et passer
>   par l'invitation) ou limiter leur zone à la commune du bien de test. Le document
>   « Dossiers de test par persona » (hors dépôt) reste à compléter pour l'artisan :
>   voir [[Calendrier de lancement — 30 novembre 2026]].
> - **Carnet du propriétaire direct** (relevé du 16/10/2026, inchangé) : ajout par SIRET
>   réservé aux agences ; le propriétaire **invite** un artisan
>   ([[Invitation d'un artisan par un propriétaire]]). L'invité reste privé par défaut : il
>   n'est pas proposé au réseau des autres propriétaires tant qu'il ne se rend pas public.
> - [[Expansion territoriale autonome]] (19/09) raisonnait en « départements ouverts » :
>   empreinte commerciale, sans lien avec le réseau.
