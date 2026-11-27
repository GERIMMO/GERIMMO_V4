---
type: synthesis
tags: [communication, email, notifications, sms, facebook, whatsapp, telegram]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Référentiel du palier 1]]", "[[Passation — état du 26 novembre 2026]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-module-15-messagerie]]", "[[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "app/src/lib/email.ts", "app/src/lib/perimetre-pilote.ts", "app/src/lib/envois-suspendus.ts", "app/src/lib/notifications.ts", "app/src/lib/zoho-sign.ts", "app/src/lib/facebook.ts", "app/src/lib/diffusion-facebook.ts", "app/supabase/templates/LISEZ-MOI.md", "app/vercel.json"]
---

# Canaux de communication

Synthèse des canaux par lesquels Gerimmo échange avec ses utilisateurs, relue dans le code le 26/11/2026.

**La règle du palier 1** (R-ADM-11, [[Référentiel du palier 1]]) : « Les canaux de Gerimmo sont l'e-mail et l'espace
personnel. Pas d'application à installer, donc pas de notification sur le téléphone. Le robot Telegram est
abandonné. » Le sort de WhatsApp reste à trancher (C-38).

## En bref

| Canal | État au 26/11/2026 | Où dans le code |
|---|---|---|
| **E-mail (Resend)** | En service, avec une liste fermée de courriers admis | `app/src/lib/email.ts`, `app/src/lib/perimetre-pilote.ts` |
| **Notifications dans l'espace** | En service : alertes, messages, annonces, discussion d'intervention | tables `alerts`, `messages`, `annonces`, `intervention_messages` |
| **SMS du code de signature** | En service, envoyé par Zoho Sign, pas par Gerimmo | `app/src/lib/zoho-sign.ts` |
| **Facebook (Journal)** | En service quand la Page est reliée ; sinon la diffusion est masquée | `app/src/lib/facebook.ts`, `app/src/lib/diffusion-facebook.ts` |
| Recommandé électronique AR24 | Construit, masqué sans compte (Q10, Passation, b.1) | `app/src/lib/ar24.ts`, `app/src/lib/recommandes.ts` |
| Telegram | **Abandonné** le 25/07/2026 | aucune occurrence dans `app/src` ni dans les migrations |
| WhatsApp | **Non construit** ; question ouverte C-38 | aucune occurrence dans `app/src` |
| Notifications push | Exclues (module 19 : pas d'application native) | aucun service de notification push dans `app/src` |

## E-mail (Resend)

**Le transport.** Tout part par une seule fonction, `envoyerEmail` (`app/src/lib/email.ts`), vers l'API de Resend.
- **Expéditeur** : réglable par l'environnement ; par défaut `Gerimmo <no-reply@gerimmo.app>`.
- **Marque blanche** : pour un courrier envoyé au nom d'un espace, l'expéditeur, l'en-tête et le nom signé sont ceux de
  l'organisation. Le nom « Gerimmo » n'apparaît jamais dans un message au locataire (`app/src/lib/notifications.ts`).
- **Délai et reprise** : chaque appel a un délai maximal. Les envois que reprend une tâche portent une clé
  d'idempotence, pour qu'une reprise ne donne pas un second e-mail (décision D47, `app/src/lib/email.ts`).

**Une liste fermée.** `piloteLimite()` vaut toujours vrai : seuls les courriers reconnus par `circuitAdmisPilote`
partent (`app/src/lib/perimetre-pilote.ts`). Les autres sont suspendus et consignés, avec le message « intervention
humaine requise » (`suspendreCourrielPilote`). Familles admises :
- **accès** : confirmation d'inscription et mot de passe. Supabase fabrique les liens, Gerimmo les envoie
  (`app/src/lib/lien-mot-de-passe.ts`, `app/supabase/templates/LISEZ-MOI.md`). Seul le changement d'adresse passe
  encore par le courrier de Supabase Auth ;
- **invitations** : invitation d'un artisan ; confirmation du mobile du garant avant une signature ;
- **avis d'un geste attendu** : incident urgent, demande de devis, devis reçu, mission confiée, acceptée ou refusée,
  créneaux proposés, rendez-vous fixé, report demandé ou accepté, réponse du gestionnaire, pièce demandée, document à
  vérifier. Le courrier est court, avec un seul lien vers l'écran du geste ; un échec d'envoi ne fait jamais échouer
  l'action métier (`app/src/lib/notifications.ts`, `app/src/lib/notifications-transactionnelles.ts`) ;
- **documents** : quittance (automatique ou envoyée par un geste) et bail signé ;
- **abonnement** : confirmation, fin d'essai, relance et résiliation pour impayé, rétractation, accusé de résiliation,
  avis de reconduction. Tant que les paiements sont interdits (`paiementsInterdits`), tous ces courriers sont refusés,
  sauf l'avis de reconduction ;
- **vie de la plateforme** : avertissement d'inactivité, décision sur un artisan, alertes au dirigeant
  ([[Relais du dirigeant]]).

**Cinq envois automatiques, tous fermés** (`app/src/lib/envois-suspendus.ts`) : avis d'échéance, relance amiable d'un
loyer impayé, rappel de rendez-vous d'intervention, relance d'une invitation de locataire, relance de l'artisan sur une
demande de report. Chacun a son interrupteur, fermé par défaut, que seul le superviseur ouvre. Leur ouverture est le
geste R5 du dirigeant (Passation, section a).

**Courriers entrants.**
- Le transfert des messages reçus à l'adresse de contact est décrit dans [[Courriel de contact Gerimmo]]
  (`app/src/lib/courriel-contact-durable.ts`, route `/api/resend/contact`).
- Le suivi des envois arrive par un webhook signé (`/api/resend/suivi`).

## Notifications dans l'espace

Rien ne s'installe sur le téléphone : tout se lit dans l'espace web.
- **Alertes du gestionnaire** : table `alerts` (`20260728_sprint1_ged_alertes_retention.sql`), page « Alertes » de
  l'espace. Exemples : incident à qualifier, imputation contestée, facture à valider, nouveau message sur une
  intervention.
- **Messagerie locataire ↔ gestionnaire** : table `messages` (`20260905120000_messagerie_annonces_locataire.sql`), un
  fil par personne locataire. Un message du locataire lève une alerte côté agence. Les non-lus sont comptés pour le
  gestionnaire (`messages_non_lus_gerant`, `app/src/lib/messagerie.ts`).
- **Annonces d'immeuble** : table `annonces` (même migration), un mot aux locataires d'un bien ou de toute l'agence,
  avec une date de fin d'affichage.
- **Discussion d'une intervention**, partagée entre le gestionnaire, le locataire et l'artisan : table
  `intervention_messages` (`20261101190943`). Depuis le 25/11, un nouveau message est signalé à chaque participant :
  marqueur de lecture par compte, et une alerte pour le gestionnaire (`20261122180000`). **Aucun e-mail ne part**
  pour ces messages.
- **Statut des dossiers** dans les mots de chacun : par exemple, le locataire lit l'état de son incident
  (`libelleEtatLocataire`, [[Incident]]).

## SMS : seulement le code de signature

Gerimmo n'envoie aucun SMS lui-même. Pour une [[Signature électronique]], Zoho Sign envoie l'invitation par e-mail et
le **code à usage unique par SMS** (`verification_type: "SMS"`, `delivery_mode: "EMAIL"`, `app/src/lib/zoho-sign.ts`).
- Le téléphone mobile de chaque signataire est donc requis (`app/src/lib/signature-bail.ts`).
- Le garant confirme lui-même le numéro qui recevra son code (`app/src/lib/confirmation-mobile-caution.ts`).
- Traitement déclaré : centre de données Zoho dans l'Union européenne ; SMS acheminés par les prestataires de Zoho
  (`app/src/lib/editeur.ts`).

## Facebook : la diffusion du Journal

Les articles du [[Journal éditorial]] peuvent être publiés sur la Page Facebook de Gerimmo, par l'API Graph de Meta
(`app/src/lib/facebook.ts`). C'est un canal public de la marque, pas un canal vers les clients.
- Tant que la Page n'est pas « Relié » dans « Vos canaux de diffusion » (`/admin/marketing`), la diffusion est
  **masquée** et non seulement grisée (`app/src/lib/diffusion-facebook.ts`, décision du dirigeant du 25/11).
- Le post d'un article rédigé avec l'aide de l'IA se termine par la même mention que l'article.
- La vérification de la Page (étape A9 du parcours de vérification) reste à faire par le dirigeant au 26/11
  (Passation, d.6).

## Autres voies

- **Être rappelé** : un visiteur du site laisse lui-même son numéro et son accord ; le dirigeant rappelle
  (`app/src/lib/demande-rappel.ts`, [[Prospection commerciale]]).
- **Recommandé électronique AR24** : construit, appelé seulement si les opérations payantes sont autorisées
  (`exigerOperationsPayantesAutorisees`, `app/src/lib/ar24.ts`). Il reste masqué tant qu'aucun compte n'est relié
  (Q10, Passation, b.1).

## Canaux abandonnés ou non construits

### Telegram : abandonné (décision du dirigeant, 25/07/2026)

« Le bot Telegram n'est pas nécessaire. » Il existait dans l'ancien dépôt ([[Dépôt Gerimmo-V3]]) : webhook, liaison
de compte par jeton, déclaration d'incident et choix de créneaux par le bot. Rien n'en a été repris : aucune occurrence
de « telegram » dans `app/src` ni dans les migrations (recherche du 26/11/2026).

### WhatsApp : non construit (question ouverte C-38)

Le 25/07, WhatsApp était désigné comme le seul robot visé. Le lancement s'est fait sans lui, et le canal n'est pas
construit ([[Référentiel du palier 1]], C-38). **Aucune décision ne dit s'il est attendu au palier 1.** Seule trace
dans le schéma : une colonne `canal` valant par défaut `email_whatsapp` dans `demandes_pieces`
(`20260903205800_ajout_demandes_pieces.sql`), table supprimée le 06/09 (`20260906100000_correctifs_audit.sql`).

Exigences du cahier V3, à reprendre si le canal est construit :
- **Canal optionnel, avec un repli par e-mail systématique** (RM-16.5.1/7) ; « toute alerte doit disposer d'un canal
  de repli ».
- **Consentement préalable** daté, conservé, révocable : case dans l'espace, STOP, ou par l'agence (module 16).
- **Fenêtre de 24 h** : hors de cette fenêtre, seuls des modèles approuvés par Meta. Le module 16 en prévoit huit, gérés
  par le [[Super Admin]].
- **Transfert hors de l'Union européenne** (A4) : Meta serait le seul sous-traitant hors UE. C'est acceptable par le
  triptyque consentement explicite, canal optionnel et repli e-mail permanent, avec des clauses contractuelles types.
  Le transfert doit être déclaré aux agences dans le contrat de sous-traitance (RM-A4.13, [[Socle de sécurité]]).
- **Messagerie** (module 15) : un message WhatsApp entrant irait dans une file d'attente, puis serait rattaché en un
  clic par l'agent (alerte à 48 h). La réponse emprunterait le canal d'origine (RM-15.4.1).

### Notifications push : exclues (module 19)

Décision actée : site adapté au mobile, pas d'application native, donc pas de notification push. Le module 16 impose
de toute façon un repli par e-mail pour toute alerte ([[2026-07-24-gerimmo-v3-module-19-mobile|module 19]]).

## Valeur probante des canaux (Livrable A3)

Aucun canal applicatif (e-mail, espace en ligne) n'a de **valeur probante** pour un acte à effet juridique. Les congés
et mises en demeure partent en **LRAR ou par acte**, hors plateforme, et l'agent saisit la date de première
présentation ([[Notification et valeur probante]]). L'e-mail et l'espace personnel suffisent pour les **documents
courants** : quittances, appels de loyer, rapports (RM-A3.8). Les documents financiers du propriétaire partent en
**pièce jointe à l'e-mail, sans lien sécurisé** (RM-A3.9, décision confirmée contre deux audits).

## La messagerie : règles du module 15 et ce qui est construit

- **Toute conversation est rattachée à un objet** : bail, incident ou lot, jamais de fil général (RM-15.1.1).
- **Fil à trois sur un incident** : l'artisan rejoint le fil à l'affectation et le quitte à la clôture. Il ne voit que
  le prénom et le téléphone de l'occupant. Construit sous la forme de la discussion d'intervention ; la projection
  limitée de l'artisan est posée par `20260911180000_module8_artisans_socle.sql`.
- **Propriétaire** : traçage des échanges qui engagent, sur le mandat.
- **Archivage** des conversations avec le bail : l'agence les conserve, le locataire perd l'accès.

## Webhooks entrants

Routes en service : `/api/stripe/webhook`, `/api/zoho-sign/webhook`, `/api/resend/suivi`. Chacune vérifie une
signature avant tout traitement. Le contrat V3 (Livrable A5, [[Machines à états et événements]]) demande en plus :
idempotence par identifiant unique, conservation 30 jours, rejeu manuel par le super admin, réponse immédiate et
traitement asynchrone. Leur respect route par route n'a pas été relu pour cette page (à vérifier).

## Ce qui déclenche les envois planifiés

Deux mécanismes coexistent :
- **Vercel Cron** (`app/vercel.json`) : missions quotidiennes (quittances, abonnements, appels, rappels, relances,
  signatures, purge, marketing, veille, territoire), orchestrateur, relais du dirigeant, et la file des factures
  chaque minute ;
- **pg_cron**, dans la base : par exemple `cycle-mensuel`, les alertes quotidiennes (impayés, diagnostics, assurance,
  restitutions), `relais-urgences`, `retention-quotidienne` (planifications dans `app/supabase/migrations/`).

L'ancienne opposition « Vercel Cron (code) contre pg_cron (cible du lot 0) » n'a donc plus cours. Les huit workflows
n8n ont été abandonnés le 20/07 ([[Architecture du socle V3]]).

> [!warning] Points à trancher / contradictions
> - **WhatsApp au palier 1 ?** Question ouverte C-38 du [[Référentiel du palier 1]]. Sans décision, le canal reste non
>   construit. L'annonce « loyer reçu ? » par robot au gestionnaire suppose ce canal (voir
>   [[État du projet et décisions ouvertes]]).
> - **Messagerie ≠ RM-15.1.1** : la messagerie locataire ↔ gestionnaire est un fil **par personne**, sans
>   rattachement à un bail, un incident ou un lot (`20260905120000`). Seule la discussion d'intervention est rattachée
>   à un objet. Écart à trancher.
> - **Commentaire périmé dans `app/src/lib/email.ts`** : il dit que « seule la confirmation d'inscription part encore
>   par le SMTP configuré dans Supabase ». Le LISEZ-MOI des modèles et `lien-mot-de-passe.ts` montrent que
>   l'inscription part par Resend ; seul le changement d'adresse passe par Supabase Auth. Le comportement suit le code
>   d'envoi ; le commentaire est à corriger.
> - **Recommandé électronique AR24 et règle A3** : la règle A3 envoie les actes juridiques hors plateforme. Ce que le
>   recommandé électronique AR24 change à cette règle n'est pas tranché ici (à vérifier, avec
>   [[Notification et valeur probante]]).
