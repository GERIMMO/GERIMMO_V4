# Modèles d’e-mails d’authentification

Les parcours d’inscription, de récupération de mot de passe et d’invitation de Gerimmo envoient leurs courriers depuis l’application avec Resend. Supabase fabrique les liens ; l’application les envoie avec son expéditeur habituel. Le changement d’adresse utilise encore le courrier de Supabase Auth.

## Parcours courant

L’inscription demande l’adresse e-mail et les informations proposées. Après ouverture du courrier, le destinataire confirme son adresse par un bouton, vérifie ses informations, accepte les conditions générales d’utilisation et de vente et choisit son mot de passe. Une invitation reprend ensuite sa page de réponse.

Les liens d’accès utilisent `/auth/confirm` avec `token_hash`, `type`, `email` et, si nécessaire, `next`. L’adresse est encodée dans le lien. L’ouverture seule affiche une page ; le bouton permet de continuer. Le lien peut être ouvert dans un autre navigateur.

Les anciens liens `token_hash` sans adresse demandent au destinataire de saisir celle qui a reçu le courrier. Les anciens retours `?code=` d’inscription ou de récupération demandent un nouveau lien depuis « Mot de passe oublié ». Le retour du changement d’adresse conserve sa compatibilité pour un compte déjà confirmé avant la demande.

## Modèles à installer dans Supabase

Même si l’application envoie ses propres courriers, conserver les trois modèles d’accès ci-dessous dans Supabase pour ses envois directs.

| Modèle Supabase | Fichier | Sujet |
|---|---|---|
| Confirm signup | `confirmation.html` | `Confirmez votre adresse — Gerimmo` |
| Reset password | `recovery.html` | `Réinitialisation de votre mot de passe Gerimmo` |
| Magic link | `magic_link.html` | `Votre lien de connexion — Gerimmo` |
| Change email address | `email_change.html` | `Confirmez votre nouvelle adresse — Gerimmo` |

Les trois premiers modèles utilisent `{{ .TokenHash }}` et `{{ .Email | urlquery }}` pour rejoindre le bouton de Gerimmo. Leur paramètre d’adresse supplémentaire est ignoré par l’ancienne version de l’application : ils peuvent être installés avant la nouvelle version.

Le modèle **Change email address est conservé intégralement** avec `{{ .ConfirmationURL }}` : ne pas le remplacer. Supabase exige les deux confirmations quand le changement sécurisé est activé. Le premier retour affiche une indication pour ouvrir les deux courriers ; après le second, le retour PKCE ouvre « Mon compte » dans le navigateur qui a fait la demande. Le mot de passe et les informations déjà validées sont conservés. Dans un autre navigateur, la personne peut se reconnecter avec sa nouvelle adresse et son mot de passe existant.

Cette compatibilité nécessite la migration `20261016210000_retour_adresse_confirmee.sql` avant le code applicatif. Le modèle ne change pas, les courriers déjà envoyés gardent leur validité jusqu’à leur expiration. Les deux ordres de confirmation et le retour de session ont été vérifiés avec le rendu SMTP de GoTrue v2.197.0. Aucun écran de Gerimmo ne demande actuellement de changement d’adresse.

## Réglages du projet

Dans le tableau de bord Supabase, rubrique Authentication :

- Désactiver **Allow new users to sign up**. Les créations de comptes de Gerimmo passent par l’API d’administration et restent disponibles.
- Garder **Confirm email** activé, les utilisateurs anonymes désactivés et le changement d’adresse sécurisé activé.
- Régler **Site URL** sur `https://www.gerimmo.app` et autoriser ses adresses de retour avec `https://www.gerimmo.app/**`. Ajouter seulement les prévisualisations nécessaires aux essais.
- La configuration du 16/10 prévoit des codes e-mail de huit chiffres et une expiration de 3 600 secondes. Le texte des courriers dit « pour une durée limitée » afin de rester cohérent avec les réglages du projet.
- Conserver le SMTP personnalisé pour les courriers émis directement par Supabase, notamment le changement d’adresse.

Les anciens courriers ne sont pas réécrits lorsqu’un modèle change. En cas de lien expiré, le destinataire recommence la demande. Les anciens retours d’inscription ou de récupération demandent un nouveau lien.

## Variables de l’application

- `NEXT_PUBLIC_SITE_URL` : origine des liens envoyés ; nécessaire à leur émission.
- `SUPABASE_SERVICE_ROLE_KEY` : génération administrative des liens.
- `RESEND_API_KEY` et `RESEND_EXPEDITEUR` : envoi des courriers par l’application, voir `.env.example`.

Les modèles ne chargent ni image ni style externe. Après installation, vérifier les sujets, le bouton et le retour dans l’application avec des comptes de recette.
