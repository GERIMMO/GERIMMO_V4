# Modèles d'e-mails d'authentification (Supabase Auth)

> **État au 30/09/2026 : Supabase n'envoie plus les e-mails de connexion de
> Gerimmo.** Confirmation d'inscription, réinitialisation du mot de passe et
> invitations partent de l'application elle-même (Resend, même expéditeur que
> les quittances), avec des liens fabriqués par `src/lib/lien-mot-de-passe.ts`.
> Seul le **changement d'adresse** depuis « Mon compte » passe encore par
> Supabase Auth et son modèle `email_change.html`.

## Pourquoi l'application envoie elle-même

Les liens de Supabase (flux PKCE) ne marchaient que dans le navigateur qui
avait **demandé** le lien — celui de l'admin qui invite, pas celui du
destinataire — et étaient consommés dès l'ouverture, y compris par les
antivirus de messagerie qui pré-ouvrent les liens. Depuis le 30/09 :

- le jeton est fabriqué par l'API d'administration (`auth.admin.generateLink`,
  type `recovery` pour un mot de passe, type `signup` pour une inscription —
  ce dernier crée aussi le compte, sans qu'aucun e-mail ne parte de Supabase) ;
- le lien est `https://www.gerimmo.app/auth/confirm?token_hash=…&type=…&next=…` ;
- il mène à une page avec un bouton (`/auth/confirmer`) ; c'est le clic (POST)
  qui consomme le jeton, dans n'importe quel navigateur ;
- le courrier est en français, signé Gerimmo, envoyé par Resend
  (`RESEND_API_KEY`, `RESEND_EXPEDITEUR`) — le SMTP de Supabase n'est plus
  sollicité pour ces courriers.

Les fichiers `confirmation.html`, `recovery.html` et `magic_link.html` ne
servent plus aux parcours de Gerimmo. Ils doivent pourtant être **collés dans
Supabase** : voir la section suivante.

## Les courriers que Supabase envoie encore lui-même (15/10/2026, constat P13)

Supabase Auth garde des points d'entrée publics, appelables par n'importe qui
avec la clé publique du site : `/recover` (mot de passe oublié), `/resend`
(nouvel envoi de la confirmation), `/otp` (lien de connexion) et `/signup`.
Chacun fait partir un courrier rédigé d'après le modèle enregistré dans le
tableau de bord.

Avec le lien par défaut (`{{ .ConfirmationURL }}`), le clic mène au `/verify`
de Supabase, qui **confirme l'adresse** sans passer par le bouton de
`/auth/confirm`. Prouvé sur GoTrue v2.197.0 : un tiers qui a inscrit l'adresse
d'un artisan avec SON mot de passe, puis déclenche l'un de ces courriers,
garde un mot de passe qui ouvre le compte dès que le titulaire a cliqué.

Les trois modèles du dossier mènent donc au bouton de Gerimmo
(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`).

Depuis le 16/10/2026, le bouton applique la règle de la **première
confirmation** à tout lien qui confirme une adresse jusque-là non confirmée
(inscription, invitation, mot de passe oublié, connexion), que le compte vienne
d'une inscription de Gerimmo ou du `/signup` public de Supabase : hors du
navigateur d'une inscription de Gerimmo, le mot de passe choisi avant ce clic
est remplacé par un mot de passe que personne ne connaît, posé par la session
que le bouton vient d'ouvrir, et la personne qui a cliqué choisit le sien
(`premiereConfirmation`, `src/lib/lien-mot-de-passe.ts`). Un compte déjà
confirmé avant le clic n'est pas touché. Prouvé sur GoTrue v2.197.0, navigateur
réel, avec ces fichiers servis comme modèles : après le clic, le mot de passe du
tiers est refusé.

Ce que le bouton ne couvre pas, dit tel quel :

- un courrier rendu avec le lien **par défaut** de Supabase mène à son
  `/verify`, qui confirme l'adresse sans passer par le bouton : le collage des
  modèles est un geste humain, en production ; tant qu'il n'est pas fait, ce
  chemin reste ouvert ;
- entre la confirmation par Supabase et la pose du mot de passe provisoire
  (un aller-retour vers Supabase), le mot de passe d'avant vaut encore ; la pose
  ferme ensuite toutes les autres sessions.

La seconde barrière est donc de fermer la création de comptes par le `/signup`
public (voir le tableau ci-dessous) : Gerimmo n'en a pas besoin, ses
inscriptions passent par l'API d'administration.

## Ce qui reste à régler dans Supabase

Tableau de bord Supabase → projet **Gerimmo V4** → *Authentication*.

| Modèle Supabase | Fichier | Sujet à saisir | État |
|---|---|---|---|
| **Change email address** | `email_change.html` | `Confirmez votre nouvelle adresse — Gerimmo` | **Utilisé** : changement d'adresse depuis « Mon compte » |
| Confirm signup | `confirmation.html` | `Confirmez votre adresse — Gerimmo` | **À coller** : courrier que Supabase n'envoie que sur appel direct (constat P13) |
| Reset password | `recovery.html` | `Réinitialisation de votre mot de passe Gerimmo` | **À coller** : idem |
| Magic link | `magic_link.html` | `Votre lien de connexion — Gerimmo` | **À coller** : idem |
| Invite user | — | — | Non utilisé (seule la clé de service le déclenche) |

### *Sign In / Providers* → « Allow new users to sign up »

**À désactiver** (recommandation du 16/10/2026, geste humain en production).
L'application n'appelle jamais le `/signup` public (`supabase.auth.signUp`) :
inscriptions et invitations créent les comptes par l'API d'administration
(`auth.admin.generateLink`), que ce réglage ne bloque pas. Désactivé, il retire
à un tiers le moyen de créer, avec la seule clé publique du site, un compte non
confirmé à l'adresse de quelqu'un d'autre.

### *URL Configuration* (indispensable)

- **Site URL** : `https://www.gerimmo.app`
- **Redirect URLs** : `https://www.gerimmo.app/**` (couvre `/auth/confirm`,
  qui reçoit encore les anciens liens `?code=` envoyés avant le 30/09, et le
  retour du changement d'adresse). Ajouter l'adresse Vercel de
  prévisualisation si l'on veut tester une branche.

### *Email* → « Confirm email »

Laisser **activé** : c'est ce réglage qui fait qu'un compte créé à
l'inscription reste inutilisable tant que le lien envoyé par Gerimmo n'a pas
été cliqué. Il ne déclenche plus d'envoi par Supabase, puisque l'application
ne passe plus par `signUp`.

### SMTP personnalisé

Il ne sert plus qu'au changement d'adresse. Le laisser sur Resend
(`smtp.resend.com`, port 465, utilisateur `resend`, mot de passe = clé d'API,
expéditeur `Gerimmo <no-reply@gerimmo.app>`) évite la limite du service
d'envoi intégré.

## Variables d'environnement côté application

- `NEXT_PUBLIC_SITE_URL` : l'origine des liens envoyés. **Sans elle, aucun
  lien de connexion ne part** (l'action le dit).
- `SUPABASE_SERVICE_ROLE_KEY` : nécessaire à `auth.admin.generateLink`.
- `RESEND_API_KEY`, `RESEND_EXPEDITEUR` : l'envoi (voir `.env.example`).

## Ce que les modèles contiennent (mémoire)

- `{{ .ConfirmationURL }}` (changement d'adresse seulement) : le lien signé
  par Supabase. Il passe par `/auth/confirm?code=…`, qui échange le code puis
  mène à la bonne page.
- `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…`
  (confirmation, mot de passe, connexion) : le lien mène à la page du bouton
  de Gerimmo, comme les courriers que l'application envoie elle-même.
- Aucune image, aucun style externe : un courrier d'accès doit passer les
  filtres et se lire dans n'importe quel client.
- Le ton est celui du produit : on dit ce qui se passe et quoi faire si l'on
  n'a rien demandé. La durée d'un lien s'écrit « pour une durée limitée » :
  la valeur exacte est un réglage du projet, pas une promesse du texte.
