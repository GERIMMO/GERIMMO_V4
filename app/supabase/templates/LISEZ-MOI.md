# Modèles d'e-mails d'authentification (Supabase Auth)

Les e-mails d'**inscription**, de **réinitialisation de mot de passe** et
d'**invitation** ne partent pas de l'application : Supabase Auth les envoie,
avec ses propres modèles. Par défaut, ces modèles sont **en anglais**
(« Confirm your signup », « Reset Password ») et signés Supabase. Un locataire
invité par son agence recevrait donc un courrier anglais titré « Reset
Password » : c'est ce que ce dossier corrige.

## Où les coller

Tableau de bord Supabase → projet **Gerimmo V4** → *Authentication* →
*Email Templates*. Pour chaque modèle : coller le **sujet** et le **corps**
ci-dessous, puis *Save*. Aucun déploiement de l'application n'est nécessaire.

| Modèle Supabase | Fichier | Sujet à saisir | Quand il part |
|---|---|---|---|
| **Confirm signup** | `confirmation.html` | `Confirmez votre adresse — Gerimmo` | Inscription d'un propriétaire bailleur ou d'un artisan |
| **Reset password** | `recovery.html` | `Votre accès Gerimmo` | Mot de passe oublié **et invitation** (locataire, agent, organisation ouverte par la supervision) — l'application utilise le même flux pour les deux, d'où un texte qui couvre les deux cas |
| **Change email address** | `email_change.html` | `Confirmez votre nouvelle adresse — Gerimmo` | Changement d'adresse depuis « Mon compte » |
| Magic link, Invite user | — | — | Non utilisés par l'application ; laisser tels quels |

## Réglages qui vont avec (même écran, *Authentication* → *URL Configuration*)

- **Site URL** : `https://gerimmo.app`
- **Redirect URLs** : `https://gerimmo.app/auth/confirm` (et l'adresse Vercel
  de prévisualisation si l'on veut tester une branche). Sans cette entrée,
  le lien du courrier est refusé et la personne atterrit sur
  `/connexion?raison=lien-invalide`.
- **SMTP personnalisé** (*Project Settings* → *Authentication* → *SMTP
  Settings*) : le service d'envoi intégré de Supabase est limité à quelques
  courriers par heure — un après-midi d'inscriptions le sature. Renseigner le
  SMTP de Resend (`smtp.resend.com`, port 465, utilisateur `resend`, mot de
  passe = clé d'API) avec l'expéditeur `Gerimmo <no-reply@gerimmo.app>`, une
  fois le domaine vérifié chez Resend.

## Ce que les modèles contiennent

- `{{ .ConfirmationURL }}` : le lien signé par Supabase. Il passe par
  `/auth/confirm`, qui établit la session puis mène à la bonne page
  (`/espaces` après inscription, `/nouveau-mot-de-passe` pour un accès).
- Aucune image, aucun style externe : un courrier d'accès doit passer les
  filtres et se lire dans n'importe quel client.
- Le ton est celui du produit : on dit ce qui se passe et quoi faire si l'on
  n'a rien demandé.
