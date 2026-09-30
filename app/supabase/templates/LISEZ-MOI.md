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

Les fichiers `confirmation.html` et `recovery.html` restent ici pour mémoire
et pour le cas où l'on rebrancherait un envoi par Supabase : ils ne sont
**plus utilisés**.

## Ce qui reste à régler dans Supabase

Tableau de bord Supabase → projet **Gerimmo V4** → *Authentication*.

| Modèle Supabase | Fichier | Sujet à saisir | État |
|---|---|---|---|
| **Change email address** | `email_change.html` | `Confirmez votre nouvelle adresse — Gerimmo` | **Utilisé** : changement d'adresse depuis « Mon compte » |
| Confirm signup | `confirmation.html` | — | Plus utilisé (l'application envoie) |
| Reset password | `recovery.html` | — | Plus utilisé (l'application envoie) |
| Magic link, Invite user | — | — | Non utilisés |

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

- `{{ .ConfirmationURL }}` : le lien signé par Supabase. Il passe par
  `/auth/confirm?code=…`, qui échange le code puis mène à la bonne page.
- Aucune image, aucun style externe : un courrier d'accès doit passer les
  filtres et se lire dans n'importe quel client.
- Le ton est celui du produit : on dit ce qui se passe et quoi faire si l'on
  n'a rien demandé. La durée d'un lien s'écrit « pour une durée limitée » :
  la valeur exacte est un réglage du projet, pas une promesse du texte.
