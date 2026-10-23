---
type: process
tags: [artisan, invitation, proprietaire, carnet, reseau, securite, authentification]
status: draft
created: 2026-10-16
updated: 2026-10-23
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Registre des anomalies — audit du 13 octobre 2026]]", "[[Ouverture du réseau d'artisans]]"]
---

# Invitation d'un artisan par un propriétaire

> [!info] Relevé de la mission du 16 octobre, en soirée
> État vérifié et preuves : [[Mission du 16 octobre — suivi vérifié]]. PR #197 fusionnée (`4a5ddf5`). Inscription publique et anonyme fermées, confirmation d’adresse active, liens limités à une heure et trois modèles de courrier enregistrés dans Supabase. La recette n°19 passe au premier essai ; la n°20 confirme les nouveaux réglages (39 réussites, 1 ignoré, aucun test instable, nettoyage réussi). La trace D04 a été relue : montant vide envoyé, aucun montant faux enregistré. Les compléments D18, D22, D08-C, X08, relais et dates sont préparés et testés localement, **pas encore publiés**. Les anciens constats ci-dessous sont datés ; cette mission ne clôt ni les avis spécialisés ni les limites de recette restantes.


**En une phrase :** le [[Propriétaire bailleur|propriétaire en gestion directe]] invite par
e-mail un artisan qu'il connaît ; l'artisan crée lui-même son compte, inscrit son entreprise
et accepte l'invitation ; une fois son inscription validée par Gerimmo, il est dans le carnet
du propriétaire et peut être sollicité par lui, même s'il n'est pas proposé par le réseau
(profil resté privé ; avant le 23/10 : « même dans une commune fermée au réseau »), pour
les biens situés dans sa zone d'intervention.

> [!warning] Décision du 23/10/2026 — réseau choisi par l'artisan
> Plus de commune « fermée » : le réseau propose les artisans validés et **publics** dont
> la zone couvre le bien ([[Ouverture du réseau d'artisans]], migration `20261023180000`,
> appliquée en production le 23/10). L'invité reste **privé** par défaut : il n'est
> proposé qu'à ce propriétaire, par le carnet. S'il se rend public, le réseau le propose
> aussi aux autres propriétaires de sa zone. Une agence ne peut plus modifier sa zone ni
> ses métiers.

> [!info] Statut au 16/10/2026
> Décision du dirigeant du 15/10/2026 (journal `log.md`, entrée « decision » du 15/10,
> point 1) : « un propriétaire invite un artisan ; c'est l'artisan qui s'inscrit », en
> remplacement de la question D17-B ([[Décisions groupées — version candidate du 13 octobre 2026]]).
> **En production depuis le 16/10/2026** : PR #194, fusion `f24dfb0` ; les dix migrations
> `20261014840000` à `20261014849000` sont appliquées (sauvegarde 38874805980, application
> 38875231468) ; vérifié en lecture seule : dix versions enregistrées, table
> `invitations_artisans` présente, `statut_motif` fermé à `authenticated`, `raison_sociale`
> lisible, 10 tâches `pg_cron`, aucune fonction ouverte à `anon` ; déploiement Vercel réussi.
> Recette de production n° 17 sur `f24dfb0` : verte (38875612888 ; 34 réussis, 1 instable passé au second essai (« Créer la fiche » d'un locataire : défaut du test, voir [[Recette de production]]), 1 ignoré (page facultative `/cgu`), comptes éphémères retirés).
> **Non fait au 16/10** : les deux réglages de Supabase, hors dépôt, qui achèvent la
> fermeture de la prise de compte (voir « Réglages hors dépôt »). **Jamais joué en
> production** : le parcours de bout en bout dans un navigateur (voir « Limites connues »).

## Déclencheur
- Le propriétaire direct veut pouvoir confier ses incidents à un artisan qu'il connaît. C'est
  la réponse à la fiche PRO2-01 ([[Registre des anomalies — audit du 13 octobre 2026]]) : un
  propriétaire dont la commune n'est pas ouverte au réseau ne pouvait solliciter aucun
  artisan, et le carnet d'un propriétaire direct ne se remplissait plus depuis la PR #170
  (migration `20261007190000`, ajout d'artisan réservé aux agences).
- Points d'entrée dans l'écran : « Mon carnet d'artisans » (`/espace/<id>/artisans`, bouton
  « + Inviter un artisan ») ; la voie de sortie affichée quand la commune est fermée
  (« Inviter un artisan que vous connaissez », `app/src/components/disponibilite-reseau.tsx`) ;
  le volet artisan de la fiche d'un incident (« Invitez un artisan », là où une agence lit
  « Enregistrez une entreprise dans votre carnet »).

## Acteurs
- **[[Propriétaire bailleur]] en gestion directe** : le seul qui invite. La base exige un
  membre actif au rôle `proprietaire_direct` d'une organisation de type `proprietaire_direct`
  (`invitation_artisan_par_proprietaire`). N'invitent pas : une agence (elle garde son ajout
  par SIRET, `artisan_creer_ou_rattacher`, qui refuse toujours les propriétaires directs),
  un agent, un locataire, un artisan, un compte sans organisation, la supervision.
- **[[Artisan]]** : crée son compte, inscrit son entreprise, dépose ses attestations, accepte
  ou refuse. Rien n'est rattaché sans son geste.
- **[[Super Admin]] (Gerimmo)** : valide l'inscription dans `/admin/artisans`, comme pour
  tout artisan ; la file indique « Invité par … » (aide à l'examen, jamais une validation).

## Étapes
1. **Inviter.** Formulaire « Inviter un artisan » : adresse e-mail de l'artisan
   (obligatoire), nom et métier « pour mémoire » (facultatifs ; l'artisan ne les voit pas,
   ils ne sont jamais copiés sur sa fiche). La base (`preparer_invitation_artisan`) vérifie
   le rôle, que l'organisation peut écrire (abonnement non suspendu), la forme de l'adresse,
   qu'il ne s'agit ni de l'adresse du compte qui invite ni de celle de sa propre fiche
   d'artisan, qu'aucune invitation n'est déjà en attente pour cette adresse (sinon :
   « Utilisez « Renvoyer » »), qu'aucune invitation déjà acceptée pour cette adresse ne
   correspond à un artisan encore actif (hors liste noire) dans le carnet (un seul contrôle :
   un artisan qui a accepté puis a été désactivé peut être réinvité ; un artisan actif au
   carnet sous une autre adresse n'est pas détecté), puis les limites anti-abus. Une trace est posée au journal d'audit, **sans
   l'adresse** (l'identifiant de l'invitation suffit).
2. **L'e-mail.** Envoyé par l'application sous la marque Gerimmo (signé « L'équipe
   Gerimmo », sujet « Invitation à rejoindre un carnet d'artisans sur Gerimmo ») : qui
   invite, les étapes (compte, entreprise avec SIRET, métiers et zone, attestations de
   responsabilité civile professionnelle et de garantie décennale, vérification par
   Gerimmo), la date de validité, « Rien ne se fait sans votre accord », « Vous ne connaissez
   pas cette personne ? Ignorez ce message ». Il ne dit rien des biens ni des locataires du
   propriétaire. Le lien mène à `/artisan/invitation/<identifiant>` ; l'adresse invitée
   voyage dans l'**ancre** (`#adresse=…`), qu'aucun serveur ne reçoit : elle ne sert qu'à
   pré-remplir le formulaire de création du compte. L'issue de l'envoi est notée (parti ou
   non) ; si l'e-mail ne part pas, l'invitation reste enregistrée, l'écran le dit et on peut
   la renvoyer.
3. **Suivi par le propriétaire.** La liste « Mes artisans » montre les artisans rattachés et,
   pour chaque adresse, la dernière invitation. Avant l'acceptation, il ne voit que ce qu'il
   a saisi. États affichés : « Invitation envoyée le … », « Invitation envoyée le …, mais le
   dernier envoi n'est pas parti » (un renvoi a échoué après un premier envoi réussi : un échec
   n'est jamais masqué par un envoi plus ancien), « Invitation enregistrée le …, e-mail non
   envoyé », « Invitation enregistrée le …, envoi non confirmé » (l'issue de l'envoi n'a pas
   été notée), « Invitation expirée », « Annulée », « Invitation refusée par l'artisan »,
   « Invitation acceptée », « Inscrit, en attente de validation par Gerimmo », « Validé »,
   « Ne peut pas être sollicité pour le moment », « Inscription refusée par Gerimmo »,
   « Désactivé dans votre carnet », « Sur votre liste noire » (`etatLigneCarnet`,
   `app/src/lib/invitations-artisan.ts`). Gestes : **Renvoyer** (même lien, même échéance), **Annuler
   l'invitation** (en attente et non échue ; l'artisan ne peut plus l'accepter),
   **Inviter de nouveau** (après expiration ou annulation).
4. **L'artisan ouvre le lien, sans session.** La page est publique (ce chemin exact
   seulement, `app/src/proxy.ts`), ne lit rien en base et ne dit rien de l'invitation (ni qui
   invite, ni quelle adresse) : il crée son compte artisan, adresse pré-remplie, ou se
   connecte. La confirmation de son adresse suit la règle de la **première confirmation**
   (voir « Règles de sécurité »).
5. **L'artisan connecté.** L'invitation n'est montrée qu'à la session dont l'adresse
   **confirmée** est celle de l'invitation (`mon_invitation_artisan`). Sinon : « Cette
   invitation n'est pas accessible avec ce compte », sans rien révéler ; un artisan dont
   l'entreprise est déjà inscrite sous une autre adresse doit demander une invitation à
   l'adresse de son compte.
6. **Inscription de l'entreprise.** Sans fiche d'entreprise, il passe par l'inscription
   d'artisan existante (`/artisan/inscription?invitation=…` : SIRET, métiers, mobile, zone
   d'intervention), qui le ramène à l'invitation.
7. **Réponse.** Il **accepte explicitement** ou refuse ; refuser est possible tant que
   l'invitation est en attente et non échue, même avant d'avoir inscrit son entreprise, et ne
   partage rien ; après l'acceptation, le refus n'est plus proposé et ne retire pas du carnet
   (`repondre_invitation_artisan`). Avant d'accepter, la page lui dit ce que le propriétaire verra : le nom
   de l'entreprise, son SIRET et l'état de sa vérification, son téléphone, son adresse
   e-mail professionnelle, ses métiers, sa zone d'intervention, la visibilité de son profil,
   la date de son inscription et son état chez Gerimmo (en attente, validée ou refusée,
   exclusion éventuelle), **jamais les motifs des décisions de Gerimmo**. Accepter le
   rattache au carnet du propriétaire (`artisan_agences`, statut actif ; une relation
   désactivée est réactivée) ; cela n'ouvre **aucune adhésion** à l'organisation et ne
   **valide rien**. L'acceptation peut précéder la validation par Gerimmo.
8. **Attestations et validation par Gerimmo.** La page l'invite ensuite à déposer ses
   attestations de responsabilité civile professionnelle et de garantie décennale ; le
   super administrateur valide (une inscription ne se valide qu'avec une décennale et une RC
   pro en cours, décision du 27/09 : [[Artisan]]). La barrière `artisan_affectable` n'est pas
   touchée par le lot.
9. **Sollicitation.** Depuis la fiche d'un incident, le propriétaire sollicite l'artisan de
   son carnet (origine « carnet »), **même s'il n'est pas proposé par le réseau** (profil privé ; avant le 23/10 : « même si la commune du bien est fermée au réseau »), à
   condition que : la relation soit active (ni désactivé ni sur sa liste noire),
   l'inscription soit validée (validé, SIRET vérifié, pas d'exclusion de la plateforme),
   l'artisan exerce le métier, sa **zone d'intervention couvre le code postal du bien**, et
   sa décennale soit valide quand les travaux l'exigent. Un encart de la fiche de l'incident
   dit pourquoi un artisan du carnet n'est pas proposé pour ce bien (« Dans votre carnet, ne
   peuvent pas être sollicités pour ce bien : … », `carnet_artisans_bien`) ; « Validé » dans
   le carnet ne promet donc pas une sollicitation.

## Entrées / sorties
- **Entrées :** l'adresse e-mail de l'artisan ; facultativement un nom et un métier pour
  mémoire.
- **Sorties :** une invitation (`invitations_artisans`, états `en_attente`, `acceptee`,
  `refusee`, `annulee`, `expiree`) ; à l'acceptation, une ligne de carnet `artisan_agences`
  entre l'organisation et l'artisan ; les traces du journal d'audit (`invitation_artisan`,
  `…_envoyee`, `…_envoi_echec`, `…_annulee`, `…_expiree`, `…_refusee`, `…_acceptee`,
  `…_bloquee`).

## Réglages par défaut (valeurs du code au 16/10/2026)

| Réglage | Valeur | Où |
|---|---|---|
| Validité | fin du 30e jour de Paris après l'envoi (minuit, heure de Paris, au début du 31e jour) ; le carnet et la page de l'artisan disent « valable jusqu'au [date] inclus », l'e-mail « valable jusqu'au [date] » (le même jour) | `20261014847000` ; `valableJusquAu`, `app/src/lib/invitations-artisan.ts` |
| Renvoi | même lien, échéance inchangée ; une invitation échue est notée « expirée » et le dit | `renvoyer_invitation_artisan` |
| Invitations en attente | une seule par organisation et par adresse | index `invitations_artisans_une_en_attente` |
| Par organisation | 30 envois par heure (clé propre, distincte des invitations de locataires depuis `20261014844000`) et 50 par 24 heures | `limiter_envoi_invitation_artisan` |
| Par compte qui invite | 50 par 24 heures, quel que soit son espace | idem |
| Par adresse | 3 par heure et 5 par 24 heures, toutes organisations confondues ; l'adresse est ramenée à sa boîte (sans « +étiquette », sans point final, sans les points de la partie locale pour gmail.com et googlemail.com) | idem ; `adresse_canonique_invitation_artisan` |
| Décompte | avant chaque envoi (invitation et renvoi) ; un refus annule la transaction, rien n'est compté ; clés conservées sous forme d'empreinte, purgées après une journée | `20261014840000` |
| Nom de l'invitant montré à l'artisan | nom de l'organisation sans caractère de contrôle, tronqué à 80 caractères ; remplacé par « un propriétaire » s'il contient un lien, une adresse e-mail, un numéro (six chiffres ou plus) ou le mot « Gerimmo » | `nomInvitant` |
| Saisie | adresse de 254 caractères au plus ; nom pour mémoire de 120 caractères au plus | `invitations-artisan.ts`, contraintes de la table |
| Abonnement suspendu | inviter et renvoyer refusés ; **annuler reste possible** (geste protecteur) | `org_ecriture_ouverte` ; `20261014846000` |
| Relance automatique | aucune (aucune relance d'invitation d'artisan dans le code du lot) | — |
| Durée de conservation des invitations | aucune règle posée (`invitations_artisans` n'apparaît dans aucune règle `retention_rules`) | — |

## Règles de sécurité

### Ce que l'invitation n'ouvre pas
- Table `invitations_artisans` **fermée** : sécurité par ligne active, aucune politique,
  aucun droit pour `anon` ni `authenticated` ; on n'y accède que par huit fonctions
  `SECURITY DEFINER`, ouvertes aux seuls clients connectés, jamais à `anon`.
- **Pas de soi-même** : on ne s'invite pas (adresse du compte ou de sa fiche d'artisan,
  comparées boîte à boîte), et le compte qui a envoyé une invitation ne peut pas l'accepter
  (`20261014845000`).
- **Pas de rattachement d'un artisan exclu** : liste noire globale, liste noire de
  l'organisation ou organisation archivée → « Cette invitation ne peut pas aboutir.
  Contactez la personne qui vous a invité. »
- **Zone et métiers** : un propriétaire direct ne peut pas les modifier (`20261014841000` ;
  constat bloquant de la relecture : sinon le propriétaire pouvait ajouter le code postal de
  son bien et solliciter l'artisan hors de sa zone). Seuls l'artisan, la supervision et les
  membres `admin_agence` ou `agent` d'une agence qui l'a dans son carnet le peuvent
  (`artisan_definir_metiers_zones`, relation désactivée comprise).
- **Colonnes internes de la fiche artisan** fermées à tous les clients (`20261014842000`) :
  motifs de refus et d'exclusion, auteurs et dates des décisions, échéances de purge,
  organisation qui a créé la fiche. Les agences ne voient plus ces motifs ; la supervision
  les lit par deux fonctions dédiées.
- **Liste noire locale** : elle exige une relation préalable réelle (carnet, sollicitation,
  intervention ou devis, `20261014843000`), et sa levée ne fait jamais entrer un artisan
  dans un carnet (`20261014849000`) : pour un propriétaire direct, seule l'acceptation d'une
  invitation le fait (pour une agence : l'ajout par SIRET, `artisan_creer_ou_rattacher`).

### La première confirmation (fermeture de la prise de compte par pré-inscription)
- **Le défaut** (déjà présent en production pour l'invitation de locataire) : un tiers
  créait un compte non confirmé à l'adresse de quelqu'un d'autre, avec son propre mot de
  passe (par le `/signup` public de Supabase ou par l'inscription de Gerimmo), et le gardait
  au premier lien cliqué par le vrai titulaire (récupération, invitation, lien de connexion,
  renvoi de confirmation).
- **La règle, depuis le 16/10** : tout premier lien qui confirme une adresse jusque-là non
  confirmée, passé par le bouton de `/auth/confirm`, remplace le mot de passe d'avant par un
  mot de passe provisoire que personne ne connaît, posé par la session que le bouton vient
  d'ouvrir (les autres sessions sont fermées), puis mène à `/nouveau-mot-de-passe`. Seule
  exception : la confirmation d'une inscription de Gerimmo faite dans le navigateur de
  l'inscription (témoin en cookie `httpOnly`, limité à `/auth`, deux jours) garde le mot de
  passe choisi. Un compte déjà confirmé n'est pas touché, sauf si son inscription de Gerimmo
  n'est pas finie (empreinte du témoin encore présente, par exemple pour une adresse
  confirmée par le `/verify` de Supabase sans passer par le bouton) : la même règle
  s'applique alors à tout lien passé par le bouton (`inscriptionInachevee`). Si Auth refuse
  la pose par la session, le mot de passe provisoire est posé par l'API d'administration et la personne
  redemande un lien (« mot de passe oublié »).
- **Preuves** (journal, entrée « deploy » du 16/10) : les deux derniers tours sont prouvés
  sur un GoTrue réel v2.197.0, en navigateur (20 scénarios). Le second tour avait cassé la
  confirmation de toute inscription avec l'Auth réelle ; corrigé au troisième.
- **Limites dites par le code** (`finirConfirmationInscription`) : entre la confirmation par
  Auth et la pose du mot de passe provisoire (un aller-retour vers Auth), le mot de passe
  d'avant ouvre encore une session ; la pose la ferme, mais son jeton d'accès reste valable
  jusqu'à son échéance pour qui l'appelle directement. Et un courrier que Supabase envoie
  lui-même avec son lien par défaut (points d'entrée publics `/recover`, `/resend`, `/otp`,
  `/signup`) mène à son `/verify`, qui confirme l'adresse sans passer par le bouton : seuls
  les réglages ci-dessous ferment ce chemin.

### Réglages hors dépôt — à faire par le dirigeant, **non faits au 16/10/2026**
Source : `app/supabase/templates/LISEZ-MOI.md` (tableau de bord Supabase → projet Gerimmo V4
→ *Authentication*). Aucune entrée du journal ne dit ces deux gestes faits.
1. **Coller les trois modèles de courrier du dépôt** : *Confirm signup* ←
   `confirmation.html`, *Reset password* ← `recovery.html`, *Magic link* ←
   `magic_link.html` (sujets à saisir indiqués dans le LISEZ-MOI). Ils mènent au bouton de
   Gerimmo au lieu du `/verify` de Supabase. Tant qu'ils ne sont pas collés, le renvoi public
   de confirmation reste un chemin de prise de compte (journal).
2. **Désactiver « Allow new users to sign up »** (*Sign In / Providers*) : Gerimmo n'appelle
   jamais le `/signup` public ; ses inscriptions et invitations créent les comptes par l'API
   d'administration, que ce réglage ne bloque pas (vérifié sur GoTrue réel d'après la
   PR #194).

## Ce que fait le code aujourd'hui (relevé du 16/10/2026, `main` à `f24dfb0`)
- **Base** (migrations appliquées en production le 16/10) :
  - `20261014840000` : table `invitations_artisans`, fonctions d'invitation, de renvoi,
    d'annulation, de suivi de l'envoi, du carnet du propriétaire, de l'invitation vue par
    l'artisan, de la réponse, et de l'aide à la validation (`invitations_des_artisans_a_valider`) ;
  - `20261014841000` : zone et métiers d'un artisan fermés au propriétaire direct ;
  - `20261014842000` : colonnes internes de la fiche artisan fermées aux clients ;
  - `20261014843000` : liste noire locale seulement avec relation préalable ;
  - `20261014844000` : limite horaire distincte de celle des invitations de locataires ;
  - `20261014845000` : pas d'invitation à soi-même ;
  - `20261014846000` : annulation possible abonnement suspendu ;
  - `20261014847000` : échéance à la fin d'un jour de Paris ;
  - `20261014848000` : carnet vu pour un bien (`carnet_artisans_bien`) ;
  - `20261014849000` : la levée de la liste noire ne rattache pas.
  Chaque migration a son retour arrière dans `app/supabase/retours-arriere/`.
- **Application** : `app/src/lib/invitations-artisan.ts` (libellés, lien, états, motifs),
  `app/src/app/actions/invitations-artisan.ts` (inviter, renvoyer, annuler, répondre),
  `app/src/app/agence/[orgId]/artisans/carnet-proprietaire.tsx` et `invitations-artisan.tsx`
  (carnet et formulaire, servis sous `/espace`), `app/src/app/artisan/invitation/[invitationId]/`
  (page de l'artisan), `app/src/components/carnet-non-sollicitable.tsx` (encart de l'incident),
  `app/src/lib/notifications.ts` (`messageInvitationArtisan`), `app/src/app/admin/artisans/page.tsx`
  (« Invité par … »), `app/src/proxy.ts` (chemin public exact).
- **Première confirmation** : `app/src/lib/lien-mot-de-passe.ts` (`premiereConfirmation`,
  `finirConfirmationInscription`), `app/src/app/auth/confirm/route.ts`,
  `app/src/lib/temoin-inscription.ts`, modèles `app/supabase/templates/`.
- **Tests** : `app/tests/invitation-artisan-*.test.ts`, `lien-mot-de-passe.test.ts`,
  `artisans-colonnes-internes.test.ts`, `liste-noire-locale-relation.test.ts`,
  `proxy-invitation-artisan.test.ts` ; parcours navigateur `app/e2e/invitation-artisan.spec.ts`
  (invitation → compte → entreprise → acceptation → attestations → non sollicitable avant
  validation → validation → sollicitation en commune fermée), **sur le banc local seulement**
  (`app/e2e/local/invitation-artisan.config.ts`, aucun envoi réel d'e-mail).
- **Avant la fusion** (journal) : quatre tours, chacun relu à deux ou trois angles puis
  contre-relu ; simulation 38869684158, CI 38869727484 et batterie complète vertes sur
  `f8be051`. Production : aucune ligne `artisan_agences` avant le déploiement (rien à
  rattraper).

## Limites connues
- **Parcours de bout en bout jamais joué en production** : la recette automatisée
  (`app/e2e/recette-production/`) n'a ni parcours d'artisan ni parcours de
  super-administrateur ; le parcours navigateur de l'invitation ne tourne que sur le banc
  local. Recette n° 17 sur `f24dfb0` : verte (38875612888 ; 34 réussis, 1 instable passé au second essai (« Créer la fiche » d'un locataire : défaut du test, voir [[Recette de production]]), 1 ignoré (page facultative `/cgu`)).
- **Aucune invitation réelle** n'est mentionnée au journal au 16/10.
- **Réglages Supabase hors dépôt non faits** (voir ci-dessus).
- L'ajout direct d'un artisan par SIRET reste réservé aux agences : le propriétaire direct
  n'a que l'invitation.

## Implications pour l'application
- Le carnet personnel d'un propriétaire direct se remplit désormais par invitation ; la règle
  de sollicitation du carnet en commune fermée ([[Ouverture du réseau d'artisans]]) n'est pas
  modifiée (`reseau_contact_personnel`, `reseau_contact_dans_zone`).
- Voir aussi [[Demande et sélection de devis]], [[Onboarding et abonnement]] (invitation
  du locataire, même modèle : états, échéance, acceptation par l'adresse confirmée).

> [!warning] Points à trancher / contradictions
> - **Réglages choisis par le lot, sans décision écrite du dirigeant**, proposés à sa
>   ratification (la décision du 15/10 dit seulement « un propriétaire invite un artisan ;
>   c'est l'artisan qui s'inscrit ») : validité de 30 jours (jour de Paris) ; plafonds
>   (30 par heure et 50 par 24 heures par organisation, 50 par 24 heures par compte, 3 par
>   heure et 5 par 24 heures par adresse) ; seul le propriétaire direct invite (ni agence,
>   ni agent) ; acceptation possible avant la validation de Gerimmo ; étendue de la fiche
>   que le propriétaire voit après l'acceptation ; e-mail sous la marque Gerimmo, avec le
>   nom de l'organisation filtré ; **aucune relance** d'une invitation d'artisan en attente
>   (les invitations de locataires ont les relances J+3 et J+10, X16).
> - **Conservation** : aucune durée de conservation n'est posée pour `invitations_artisans`
>   (adresse e-mail, nom pour mémoire) au catalogue `retention_rules`. Les quatre registres
>   du relais et du compteur des appels IA, qui étaient dans la même situation, ont leur
>   règle de six mois en production depuis le 16/10 (PR #195, migration `20261014850000`,
>   [[RGPD]]) ; cette migration ne couvre pas `invitations_artisans`. À décider et à
>   consigner au [[Registre des traitements]].
> - **Réglages Supabase** (modèles de courrier, inscription publique) : non faits au 16/10 ;
>   tant qu'ils ne le sont pas, la fermeture de la prise de compte n'est pas complète.
> - **Autorisation de déployer** : l'autorisation écrite du 14/10 excluait D17-B, que
>   l'invitation remplace ; aucune entrée du journal ne dit le déploiement du 16/10 couvert
>   par une autorisation. À faire confirmer par le dirigeant.

## Relations
[[Propriétaire bailleur]] · [[Artisan]] · [[Super Admin]] · [[Ouverture du réseau d'artisans]] ·
[[Demande et sélection de devis]] · [[Onboarding et abonnement]] · [[Recette de production]] ·
[[Prêt à démarcher]] · [[Décisions groupées — version candidate du 13 octobre 2026]] ·
[[Registre des anomalies — audit du 13 octobre 2026]]
