# Modèles d’e-mails d’authentification

Les parcours d’inscription, de récupération de mot de passe et d’invitation de Gerimmo envoient leurs courriers depuis l’application avec Resend. Supabase fabrique les liens ; l’application les envoie avec son expéditeur habituel. Le changement d’adresse utilise encore le courrier de Supabase Auth.

## Parcours courant

L’inscription demande l’adresse e-mail et les informations proposées. Après ouverture du courrier, le destinataire confirme son adresse par un bouton, vérifie ses informations, accepte les conditions générales d’utilisation et de vente et choisit son mot de passe. Une invitation reprend ensuite sa page de réponse.

Les liens d’accès utilisent `/auth/confirm` avec `token_hash`, `type`, `email` et, si nécessaire, `next`. L’adresse est encodée dans le lien. L’ouverture seule affiche une page ; le bouton permet de continuer. Le lien peut être ouvert dans un autre navigateur.

Les anciens liens `token_hash` sans adresse demandent au destinataire de saisir celle qui a reçu le courrier. Les anciens retours `?code=` ne sont plus échangés : l’écran indique de demander un nouveau lien depuis « Mot de passe oublié ».

## Modèles à installer dans Supabase

Même si l’application envoie ses propres courriers, conserver les trois modèles d’accès ci-dessous dans Supabase pour ses envois directs.

| Modèle Supabase | Fichier | Sujet |
|---|---|---|
| Confirm signup | `confirmation.html` | `Confirmez votre adresse — Gerimmo` |
| Reset password | `recovery.html` | `Réinitialisation de votre mot de passe Gerimmo` |
| Magic link | `magic_link.html` | `Votre lien de connexion — Gerimmo` |
| Change email address | `email_change.html` | `Confirmez votre nouvelle adresse — Gerimmo` |

Les trois premiers modèles utilisent `{{ .TokenHash }}` et `{{ .Email | urlquery }}` pour rejoindre le bouton de Gerimmo. Leur paramètre d’adresse supplémentaire est ignoré par l’ancienne version de l’application : ils peuvent être installés avant la nouvelle version.

Le modèle `email_change.html` utilise aussi le bouton Gerimmo, avec `type=email_change`, un retour `/compte` et l’adresse exacte du destinataire fournie par `SendingTo`. Si cette variable manque sur une ancienne version de Supabase Auth, le lien omet l’adresse et Gerimmo la demande. Le changement sécurisé exige de confirmer les deux courriers : après le premier, Gerimmo demande d’ouvrir l’autre ; après le second, le compte s’ouvre avec la nouvelle adresse. Le mot de passe et les informations déjà validées sont conservés. Le rendu SMTP et les deux ordres de confirmation ont été vérifiés avec GoTrue v2.197.0.

**Installer ce quatrième modèle après la migration et le code applicatif de confirmation.** L’ancienne application ne présente pas l’étape intermédiaire des deux adresses. Les anciens courriers utilisant `ConfirmationURL` restent valides côté Supabase ; lorsqu’ils proviennent d’un client PKCE, le retour `code` est signalé comme invalide après la confirmation, mais la personne peut se reconnecter avec sa nouvelle adresse et son mot de passe existant. Aucun écran de Gerimmo ne demande actuellement de changement d’adresse.

## Réglages du projet

Dans le tableau de bord Supabase, rubrique Authentication :

- Désactiver **Allow new users to sign up**. Les créations de comptes de Gerimmo passent par l’API d’administration et restent disponibles.
- Garder **Confirm email** activé, les utilisateurs anonymes désactivés et le changement d’adresse sécurisé activé.
- Régler **Site URL** sur `https://www.gerimmo.app` et autoriser ses adresses de retour avec `https://www.gerimmo.app/**`. Ajouter seulement les prévisualisations nécessaires aux essais.
- La configuration du 16/10 prévoit des codes e-mail de huit chiffres et une expiration de 3 600 secondes. Le texte des courriers dit « pour une durée limitée » afin de rester cohérent avec les réglages du projet.
- Conserver le SMTP personnalisé pour les courriers émis directement par Supabase, notamment le changement d’adresse.

Les anciens courriers ne sont pas réécrits lorsqu’un modèle change. En cas de lien expiré ou ancien retour `code`, le destinataire demande un nouveau lien.

## Variables de l’application

- `NEXT_PUBLIC_SITE_URL` : origine des liens envoyés ; nécessaire à leur émission.
- `SUPABASE_SERVICE_ROLE_KEY` : génération administrative des liens.
- `RESEND_API_KEY` et `RESEND_EXPEDITEUR` : envoi des courriers par l’application, voir `.env.example`.

Les modèles ne chargent ni image ni style externe. Après installation, vérifier les sujets, le bouton et le retour dans l’application avec des comptes de recette.
