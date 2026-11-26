# Ouvrir la vente le lundi 30 novembre 2026 — pas-à-pas

- **Votre décision** (26/11, mot pour mot) : « Oui, on ouvre le 30/11, entrepreneur individuel, sans médiateur ».
- **Rédigé le** 26/11/2026 par l'agent, à partir de `livrables/PLAN-DE-PUBLICATION.md` (§ 4, R6 à R8), du code de la
  console (`app/src/app/actions/reglage-souscription.ts`) et de la note `wiki/syntheses/Passation — état du 26 novembre 2026.md`.
- Les libellés entre guillemets sont ceux du code. L'agent ne les a pas revus à l'écran : il les relira avec vous.

## 1. Ce que l'ouverture change

- Dès l'ouverture, un particulier ou une SCI peut s'inscrire et souscrire en ligne.
- **Il garde ses 2 mois d'essai.** Une souscription faite pendant l'essai ne prélève rien tout de suite : le premier
  prélèvement tombe à la fin de l'essai (écran de souscription : « Premier prélèvement le …, à la fin de votre essai »).
  Pour un client inscrit le 30/11, **le premier euro arrive donc vers la fin janvier 2027.**
- Les pages légales, l'écran d'abonnement et les courriels diront qu'aucun médiateur de la consommation n'est désigné.
- **Restent fermés** :
  - les agences, qui restent sur liste d'attente ;
  - les cinq envois automatiques d'e-mails (R5) : décision à part, à prendre après la fermeture des comptes de test ;
  - le lot 1 de corrections : publication à part, sur votre accord écrit.

## 2. Ce qui est déjà fait

- Identité du vendeur (R1), conditions du 24/11 archivées (R2), IA (R3), repères fiscaux (R4) : faits par vous le 26/11
  et vérifiés.
- Version en ligne : `f9e874b`. Dernière recette de production : n° 62, réussie le 26/11.

## 3. Vos gestes, dans l'ordre (environ 30 minutes, avec l'agent en direct)

Connectez-vous à la console avec votre compte de supervision et la double vérification.

1. **Stripe : en-tête des factures (R7).** Dans votre compte Stripe, saisissez le nom (avec la mention « EI »),
   l'adresse et le SIREN indiqués au plan de publication, § 4, R7. Gerimmo n'écrit que le pied de facture (« TVA non
   applicable, article 293 B du CGI »). L'agent vous guide écran par écran.
2. **Vente sans médiateur (R6).**
   1. Ouvrez `/admin/parametres`, carte « Blocage des abonnements », rubrique « Vente aux particuliers sans médiateur
      de la consommation ».
   2. Lisez les deux articles affichés.
   3. Cochez « J'ai lu les deux articles… ».
   4. Cliquez « Ouvrir la vente aux particuliers sans médiateur ».

   La base date la décision et l'inscrit à l'historique. **Ne cliquez pas** « Lever le blocage » : laissez « Règle
   active ».
3. **Ouvrir les souscriptions (R8), le 30/11.** Sur la même carte, cliquez « Ouvrir les souscriptions » et cochez la
   confirmation. Message attendu : « Ouverture enregistrée. Les contrôles avant paiement s'appliquent. » Si un message
   dit que l'identité du vendeur est incomplète, arrêtez-vous et prévenez l'agent.
4. **Souscription d'essai, avec votre propre carte.**
   1. Depuis un espace de test encore en essai, souscrivez pour 1 bien. Rien n'est prélevé : la carte est enregistrée
      et le prélèvement est fixé à la fin de l'essai.
   2. Vérifiez trois choses : l'e-mail de confirmation, l'abonnement dans Stripe, l'écran « Abonnement » de l'espace.
   3. **Résiliez ensuite** par « Résilier votre contrat » sur l'écran « Abonnement », sinon le prélèvement partira à
      la fin de l'essai. L'agent vérifiera avec vous dans Stripe que l'abonnement s'arrête bien avant tout prélèvement.

## 4. Ce que fait l'agent

- **Le matin du 30/11** : il contrôle la santé du site (version servie, base) et lance la recette de production. Si
  elle n'est pas verte, on n'ouvre pas.
- **Pendant la séance** : il relit les pages publiques et `/admin/sante` après chacun de vos gestes.
- **Après** : il consigne la séance au journal (`log.md`, `JOURNAL.md`) et surveille les erreurs du site pendant 48 heures.

## 5. Le premier vrai prélèvement (conseil COM-2 de l'audit du 19/11)

Le 30/11, la souscription d'essai vérifie tout le parcours, sauf le débit réel. Le premier débit réel peut être vérifié
**fin décembre**, quand l'essai d'un espace de test se termine (entre le 24 et le 29/12, d'après le relevé du 15/11) :
1. souscrivez depuis cet espace : le prélèvement part tout de suite ;
2. rétractez-vous ensuite pour être remboursé intégralement.

Un vrai débit aura ainsi été vérifié avant celui du premier client, vers la fin janvier. Gardez donc un espace de test
pour cet essai quand vous fermerez les autres.

## 6. En cas de problème

- « Fermer les souscriptions » referme la vente tout de suite.
- « Retirer cette décision » défait la vente sans médiateur.
- Une souscription faite pendant l'essai se résilie par « Résilier votre contrat », sur l'écran « Abonnement ».

## 7. Point de droit ouvert

Vendre aux particuliers sans médiateur n'est **jamais présenté comme conforme**. Le recueil cite les articles L612-1 et
L616-1 du code de la consommation, sans exception lue (`JURISTE.md`, partie 7, point 6, et partie 9, point 26).
Adhérer plus tard à un médiateur reste possible. Il faudra alors vérifier si cela demande une nouvelle version des
conditions : changer l'identité affichée après l'archivage du 26/11 peut l'exiger (`PLAN-DE-PUBLICATION.md`, § 4, R1).
