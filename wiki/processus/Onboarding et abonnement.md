---
type: process
tags: [onboarding, abonnement, saas]
status: in-progress
created: 2026-07-21
updated: 2026-10-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]", "[[2026-09-28-decision-tarification]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Conditions générales]]", "[[Souscription de l'abonnement]]", "log.md — entrée « deploy » du 24/10/2026 (PR #246)"]
---

# Onboarding et abonnement

**En une phrase :** création d'une [[Organisation]], démarrage de l'essai et parcours de
prise en main.

## Déclencheur
- `createOrganization` (type `agency` ou `independent_owner`).

## Acteurs
- Nouvel utilisateur → devient [[Administrateur d'agence]] (`admin`) ou [[Propriétaire bailleur]] (`owner`).

## Étapes
1. Création organisation + membre + rôle (`administrateur_agence` / `proprietaire`).
2. Création d'un **[[Abonnement]] d'essai** (`trial`, 14 j) + historique + événement `trial.started`.
3. Initialisation `organization_onboarding_progress` (étapes `account`/`organization` complétées).
4. **Parcours en 10 étapes** : compte → plan → organisation → identité → import biens →
   utilisateurs → Telegram → 1ʳᵉ connexion → tutoriel → plateforme opérationnelle.
5. Suivi via `getOnboarding` (progression %), `updateOnboardingStep`.

## Résultat / sorties
- Organisation active en essai, parcours d'onboarding suivi.

## Cible V3 (module 16, 2026-07-24)
- **La création d'agence est réservée au super admin** (à la signature du contrat
  commercial — RM-16.1.1), avec un **jeu complet de paramètres par défaut** (modèles,
  grilles, plan comptable, équipements, seuils) : « elle peut travailler
  immédiatement ». Paramétrage initial : identité, agents, **indice IRL obligatoire**,
  seuil de délégation ; marque blanche et WhatsApp optionnels.
- **Invitations** depuis la fiche personne (module 0b) : la spécification V3 prévoit des
  relances J+3/J+10, une expiration J+30 renvoyable et un **refus tracé qui arrête les
  relances** — **les relances J+3/J+10 sont livrées depuis le 15/10/2026** (décision du
  dirigeant du 15/10, PR #190, fusion `f93ec6e`), pour les seules invitations créées après
  le déploiement (voir « Ce que fait le code aujourd'hui » ci-dessous) ; une personne sans
  compte **reste gérable** ; le mandant
  n'est **jamais** invité. À la première connexion :
  mot de passe + CGU, puis proposition d'**enrôlement WhatsApp** (consentement daté,
  révocable, repli email — [[Canaux de communication]]).
- **Import courant 16.3** (admin agence, dizaines de lots, ligne par ligne, sans
  reprise du passé) — gabarit et contrôles **communs** avec l'import de migration
  0.12 du [[Super Admin]].

### Ce que fait le code aujourd'hui pour l'invitation d'un locataire (relevé du 16/10/2026)
Décision X16 : le 14/10, le dirigeant avait retenu d'amender le wiki plutôt que de livrer les
relances ; le 15/10, il revient sur ce choix et fait livrer les relances J+3 et J+10 (journal
`log.md`, entrée « decision » du 15/10, point 5). En production depuis le 15/10 (PR #190,
fusion `f93ec6e`, migration `20261014830000_relances_invitations_locataires.sql`, module
`app/src/lib/relances-invitations.ts`). Voir [[Compte, personne et adhésion]].
- **Premier envoi.** Un e-mail part à l'envoi de l'invitation. L'**invitation** vaut
  **30 jours** ; le **lien** de l'e-mail, lui, est à usage unique et expire au bout de
  **24 h** dans le réglage actuel du projet Supabase (86 400 s, commentaire de
  `lien-mot-de-passe.ts`) : passé ce délai, une relance en apporte un neuf, ou le locataire
  passe par « Mot de passe oublié ». J+0 est le **jour de Paris** du premier envoi confirmé ;
  un renvoi manuel ne le déplace pas.
- **Deux relances au plus**, objet « Rappel : Votre invitation locataire Gerimmo » : le
  rang 1 est dû de J+3 à J+9, le rang 2 de J+10 jusqu'à l'expiration (un rang 1 manqué
  n'est plus envoyé une fois J+10 atteint). Elles partent avec la mission planifiée
  « rappels » (« Rendez-vous et suivi des dossiers », programmée à 06 h 00 UTC), jamais hors
  de la plage 7 h – 21 h à Paris, au plus 50 par passe. Une même relance n'est jamais envoyée
  deux fois (réservée en base avant l'envoi ; un envoi sans réponse du service d'e-mail est
  noté « incertain » et n'est pas renvoyé).
- **Arrêt.** Les relances s'arrêtent dès l'acceptation, le refus, l'annulation ou
  l'expiration. Jamais de relance pour une personne propriétaire ou mandante, une fiche
  archivée ou dont l'adresse a changé, un compte qui a déjà accès à l'organisation, ni pour
  une organisation fermée à l'écriture (abonnement suspendu, essai échu). Jamais deux
  e-mails d'invitation à moins de trois jours : un renvoi manuel retarde la relance, il ne
  relance pas le cycle.
- **Arrêt d'urgence.** L'arrêt « global » ou la clé « rappels » bloque toute relance (lu
  avant chaque réservation et avant chaque envoi).
- **Limite par organisation.** La même que celle des invitations, avec le même compteur :
  30 liens par heure et par organisation, partagés entre relances et envois manuels ;
  chaque organisation passe à son tour.
- **Invitations antérieures au déploiement : jamais relancées** (colonne
  `relances_prevues` à faux pour toutes les invitations déjà en base le 15/10 ; vérifié en
  lecture seule au déploiement : aucune invitation existante marquée pour relance).
- **Trace.** La fiche personne affiche « Relancé le … » ; chaque relance est notée au
  journal d'audit.
- **Le renvoi manuel reste possible** : depuis la fiche personne, le bouton « Renvoyer
  l'invitation » renvoie l'e-mail tant que l'invitation est en attente (même limite de 30
  liens par heure et par organisation) ; le bouton « Annuler l'invitation » la retire.
  L'écran signale « L'envoi de l'e-mail reste à confirmer » quand l'envoi a échoué ou n'est
  pas enregistré.
- **Expiration à 30 jours : oui, mais silencieuse.** Passé le délai, la fiche affiche
  l'invitation comme expirée (calculé à l'affichage) ; l'état enregistré ne passe à
  « expirée » que lorsque le locataire tente d'y répondre ou lorsque l'agent envoie une
  nouvelle invitation. Aucun message n'est envoyé au locataire ni à l'agent à l'échéance
  (les relances s'arrêtent, l'expiration étant relue à l'instant). L'agent doit penser à
  renvoyer lui-même (bouton « Envoyer une nouvelle invitation »).
- **Refus tracé : oui.** Le refus du locataire est enregistré (état « refusée » et ligne
  du journal d'audit) ; il arrête les relances (le courrier de relance le dit : « Si vous la
  refusez, vous ne recevrez plus de rappel »). Rien n'empêche ensuite l'agent d'envoyer une
  nouvelle invitation.
- **Aucun accès n'est accordé avant l'acceptation** par le locataire, connecté avec
  l'adresse qui a reçu l'invitation.

> [!warning] Points à trancher / contradictions
> - **Relances J+3/J+10 (RM-16.6.1, fiche REP-05, décision X16)** : livrées le 15/10/2026
>   (PR #190). **Non vérifié** : aucune relance réelle observée en production (la recette de
>   production ne joue pas de relance ; la première relance possible suppose une invitation
>   envoyée après le déploiement, puis trois jours).
> - **À trancher par le dirigeant** : relancer ou non les invitations déjà en attente au
>   déploiement (choix prudent du lot : non ; « question au dirigeant », journal `log.md`,
>   entrée « deploy » de la PR #190).
> - **Choix relevés dans le code, sans décision consignée** : un renvoi manuel retarde la
>   relance sans relancer le cycle ; la mission « rappels » est programmée à 06 h 00 UTC
>   (`app/vercel.json`), soit 8 h à Paris en été, 7 h en hiver, au bord de la plage
>   7 h – 21 h ; sa clé d'arrêt s'affiche « Rendez-vous et suivi des dossiers »
>   (`nomArret`, `app/src/lib/missions.ts`) et ne dit pas qu'elle coupe aussi les relances.
> - **Durée du lien** : si le code à usage unique passe de 86 400 s à 3 600 s (question H1
>   du dossier de validation), le lien d'une invitation ou d'une relance n'est plus valable
>   qu'une heure.

> [!warning] Divergence code ↔ V3
> Le code : auto-inscription `createOrganization` + essai 14 j + parcours 10 étapes
> (avec **Telegram**). Le V3 : création **par le super admin** après contrat, pas
> d'auto-inscription décrite, enrôlement **WhatsApp**. L'articulation essai/abonnement
> Stripe avec ce circuit commercial est à clarifier (module 18 ?).

## Arrivée du propriétaire direct (décision 2026-08-19)
Le module 16 ne décrivait que la création d'**agence** (par le super admin) ; la
lacune sur l'arrivée du [[Propriétaire bailleur|propriétaire gestion directe]] a été
**tranchée le 2026-08-19 : auto-inscription en ligne**. Une page d'inscription
publique lui permet de créer seul son compte et son organisation
(`independent_owner`), de démarrer l'**essai** (14 jours à l'origine ; **2 mois** pour toute inscription jusqu'au 31/12/2026 — offre de lancement —, **1 mois** à compter du 01/01/2027), puis de souscrire
l'**abonnement** via Stripe (formules Solo à Patrimoine selon le nombre de biens
depuis le 28/09/2026 — [[Grille tarifaire]]). **Règle en vigueur (28/09/2026) :
aucun bien n'est offert, à personne** ; seul l'essai sans carte est offert (2 mois
jusqu'au 31/12/2026 — offre de lancement —, 1 mois ensuite ; 14 jours avant le
30/09/2026), puis l'espace est **gelé en lecture seule** (consultable et exportable)
jusqu'au paiement. Les organisations existantes basculent sur la nouvelle grille
dès l'ajout d'un bien ([[2026-09-28-decision-tarification]]). Pas de circuit commercial : il est indépendant de bout en
bout. En complément, le [[Super Admin]] peut **créer manuellement tout profil**,
PD compris (voie de secours/support — précision du 2026-08-19). **Écran à construire au sprint 9a** (sprint dédié au PD, scission décidée le
2026-08-19), le paiement Stripe restant au sprint 11 — cohérent avec
l'auto-inscription `createOrganization` du code hérité.

## Cycle de vie ensuite
- Voir [[Cycle de vie de l'abonnement]] (essai → paiement/suspension via Stripe + Vercel Cron).
- Depuis le 28/09/2026 : fin d'essai → **gel en lecture seule** jusqu'au paiement ;
  ~~résiliation en fin de période via le portail Stripe~~ (changement de formule
  désactivé) ; préavis d'au moins un mois avant toute révision tarifaire (CGU
  art. 8.9) ; droit de rétractation de 14 jours pour le consommateur (CGU art. 8.10).
  Aucun avantage tarifaire lié au [[Parrainage]].
- **Depuis le 24/10/2026** (PR #246) : à l'inscription, la case des conditions dépend de
  l'espace choisi — propriétaire : conditions générales d'utilisation et de vente ; artisan :
  conditions de l'espace artisan dès leur publication ; personne invitée : « J'ai pris
  connaissance des règles d'utilisation des espaces invités » ([[Conditions générales]]).
  La souscription passe par un récapitulatif avec le droit de rétractation et se confirme
  par courriel ([[Souscription de l'abonnement]]) ; la résiliation par la seule page
  « Résilier votre contrat » ([[Résiliation de l'abonnement]]) ; la rétractation par le
  bouton « Renoncer au contrat ici » ([[Rétractation en ligne]]) ; l'impayé suit
  [[Impayé de l'abonnement]].

## Automatisations
- Événement `trial.started` → e-mail de bienvenue/essai (Resend). Voir [[Canaux de communication]].

## Livré le 2026-08-30 (S9a)

L'auto-inscription du propriétaire direct est en place (`/inscription` →
Supabase Auth → `initialiser_espace_proprietaire`, essai 14 jours porté par
`organizations.essai_fin` — **2 mois** depuis le 30/09/2026, migration
`20260930100000_essai_deux_mois` ; offre de lancement jusqu'au 31/12/2026, puis
**1 mois**, migration `20260930110000_offre_lancement_essai`, date de Paris). La création d'agence reste réservée au super admin.
Détail : [[Propriétaire bailleur]].

## Livré le 2026-09-11 — l'ouverture et le chemin

**Le super admin ouvre une organisation depuis la console.** Jusqu'ici, entre
la demande reçue sur le site (« Demandes de devis », /admin/devis) et le client
qui se connecte, il fallait ouvrir un client SQL : insérer l'organisation,
insérer l'adhésion, fabriquer le compte de son responsable. Le geste le plus
commercial du produit était le seul à ne pas exister.

`ouvrir_organisation(nom, type, email, essai_jours, active_immediatement)` crée
l'organisation, le compte du premier responsable et l'adhésion qui les relie ;
l'application envoie ensuite l'invitation par le même chemin que « mot de passe
oublié ». Le rôle découle du type — une agence a un administrateur, un parc a
son propriétaire. Le compte est **réutilisé** s'il existe déjà (le responsable
gère peut-être une autre agence, ou est locataire ailleurs). L'écran s'ouvre
aussi depuis une demande de devis, qu'il préremplit et marque traitée.

**Le client arrivé voit le chemin.** `parcours_demarrage(org)` rend cinq
étapes, dans l'ordre où la base les exige : identité · premier bien · lot en
état d'être loué · locataire · bail. Chacune est **constatée sur les données**,
jamais cochée à la main — un parcours qu'on coche finit par affirmer une étape
que les données démentent. L'étape « lot prêt » interroge
`lot_blocages_location`, la fonction qui décide déjà de la mise en location :
une seule liste de conditions dans le produit, et elle dit CE QUI bloque
(détention incomplète, DPE absent…). Le bloc n'ouvre qu'une porte à la fois —
la suivante — et **disparaît** une fois le premier bail actif.

### L'import courant (16.3) — livré le même jour

Une agence qui arrive avec cinquante lots les saisissait un par un : six
écrans, cinquante fois. `/agence/<org>/parc/import` reprend le parc depuis un
tableur, **une ligne par lot** — le bien, son lot, son propriétaire et sa
quote-part, le locataire en place s'il y en a un.

- **Deux passes.** Le contrôle n'écrit rien et rend, ligne par ligne, ce qui
  passera ; l'import ne devient possible qu'ensuite. On ne fait pas basculer un
  parc sur un fichier que personne n'a regardé.
- **Le fichier du client, pas un format.** Séparateur détecté (le
  point-virgule d'Excel francophone comme la virgule des exports), guillemets
  honorés, en-têtes reconnus sans accents ni casse, colonnes inconnues ignorées
  et non refusées. Le gabarit se télécharge depuis l'écran et **se relit
  lui-même** (un test le vérifie).
- **Rien n'est dupliqué** : deux lignes du même nom de bien vont dans le même
  immeuble, un propriétaire nommé deux fois n'a qu'une fiche, et rejouer un
  fichier corrigé ne fabrique pas un second parc.
- **Une ligne qui tombe n'emporte pas les autres** : elle est rapportée avec le
  motif que la base a donné, les autres passent.

> [!warning] Les baux arrivent en BROUILLON — et c'est la règle, pas une limite
> Activer un bail passe par `controler_mise_en_location` : diagnostics, état
> des lieux d'entrée, mentions obligatoires. Un import qui créerait des baux
> **actifs** contournerait ces contrôles en masse — exactement ce qu'ils
> existent pour empêcher. L'import pose les montants et les dates ; ce qui
> manque pour activer est dit lot par lot par `lot_blocages_location`.

## La reprise COMPTABLE (depuis le 18/09)

L'import ci-dessus reprend les biens, les lots et les baux — pas l'argent.
Depuis le 18/09, une seconde reprise prend les **soldes** :
`/agence/[orgId]/comptabilite/reprise`, même forme que l'import du parc
(gabarit, contrôle qui n'écrit rien, bascule ensuite).

**Pourquoi les tables ne servaient à rien.** `reprises_portefeuille` et
`reprise_soldes` étaient nées le 03/09 avec leur RLS activée, **aucune
politique et aucun droit de table** : des coquilles fermées à double tour,
qu'aucun code ne pouvait toucher. `mouvements_mandants`, le compte mandant,
était dans le même cas. Les trois sont maintenant lisibles par les
gestionnaires de leur organisation ; l'écriture passe par les fonctions, jamais
en direct, parce que c'est le contrôle d'écart zéro qui donne son sens à la
bascule.

**L'écart zéro, concrètement.** L'agence annonce la trésorerie qu'elle reprend ;
la somme des lignes qui représentent de l'argent qu'elle DÉTIENT doit l'égaler.
N'y entrent donc ni un dépôt gardé par le propriétaire, ni une dette de
locataire — ce n'est pas de l'argent chez elle. Tant que l'écart n'est pas nul,
le bouton de bascule n'existe pas.

**Où chaque euro atterrit** :

| Nature | Ce que la bascule en fait |
|---|---|
| Dépôt de garantie détenu par l'agence | `depot_encaissements` du bail — là où la restitution et le solde de tout compte iront le chercher |
| Dépôt détenu par le propriétaire | Enregistré et signalé ; hors trésorerie |
| Avance du locataire | `encaissements` à la date de bascule : le prochain appel s'impute dessus |
| Dette du locataire | **Non écrite** — voir ci-dessous |
| Provisions et fonds mandants | `mouvements_mandants`, ventilés par propriétaire |

> [!warning] Une dette de locataire n'est pas écrite au compte
> Elle serait un appel de loyer pour une période que Gerimmo n'a pas connue :
> elle polluerait l'échéancier et déclencherait des quittances fausses. Elle
> est enregistrée dans la balance, signalée ligne à ligne, et reste à traiter
> par le parcours de [[Relances et mise en demeure]]. Mieux vaut une dette
> visible hors du compte qu'une écriture inventée dedans.

**Ce qui bloque** (et pourquoi) : un dépôt sans détenteur — personne ne saurait
qui le rend ; un dépôt déjà encaissé dans Gerimmo — le compter deux fois ; une
ligne qu'aucun bail ni aucun propriétaire ne porte ; un type inconnu. La
bascule est **définitive** : après elle, on corrige par écritures
rectificatives.

> [!warning] Ce qui manque encore
> Le **compte mandant ne vit pas encore au quotidien** : la reprise y écrit sa
> balance d'ouverture et l'écran de comptabilité la donne à lire, mais aucun
> mouvement courant (encaissement de loyer, versement au propriétaire,
> honoraires, TVA) ne l'alimente. C'est le chantier suivant du module 16.

