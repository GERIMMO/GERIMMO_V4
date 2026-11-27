# Décembre 2026 — les gestes du dirigeant

Inventaire lu en production le 27 novembre 2026. Les boutons Gerimmo ont été relus dans le code. Les fermetures, les ouvertures d’envoi, le paiement et le remboursement sont à exécuter par le dirigeant.

## 1. Avant le 24 décembre, programmer la fermeture des comptes de test

Gardez **ESSAI SIGNATURE GERIMMO — SANS ENGAGEMENT** pour le paiement. Son essai se termine le **24 décembre**, il a **un bien facturable**, aucun abonnement Stripe rattaché et les deux réglages d’envoi automatique étaient désactivés lors du relevé. Vérifiez que vous pouvez vous connecter avec ce compte et que sa boîte vous appartient. Gardez les deux réglages désactivés et vérifiez qu’aucun rappel de rendez-vous, d’invitation ou de report n’y est dû.

Les six autres espaces de test relevés apparaissent ci-dessous. Le classement s’appuie sur les essais recensés le 15 novembre, la décision Q64 et le compte fictif identifié dans la passation du 26 novembre. Les fiches permettent de reconnaître les comptes dans la console sans recopier leurs coordonnées.

| Espace à fermer | Fin d’essai | Fiche du compte bailleur |
| --- | --- | --- |
| ESSAI SIGNATURE GERIMMO CONTACT — SANS ENGAGEMENT | 24/12/2026 | [Compte](https://www.gerimmo.app/admin/comptes/2f38cdde-1a65-4d19-b328-a4b1f0cd0f03) |
| Parc de test d’audit, créé le 24 octobre | 25/12/2026 | [Compte](https://www.gerimmo.app/admin/comptes/00de7d3b-9f9b-46ec-8dcd-b84f1a5f3947) |
| Parc d’essai créé le 26 octobre | 26/12/2026 | [Compte](https://www.gerimmo.app/admin/comptes/3e959439-5b6f-4674-a13a-cbace3f79eef) |
| Parc d’essai créé le 29 octobre | 29/12/2026 | [Compte](https://www.gerimmo.app/admin/comptes/7b1ba612-e78f-4e0a-816e-5acfb06d7b9b) |
| Parc de Camille Recette Gerimmo | 19/01/2027 | [Compte](https://www.gerimmo.app/admin/comptes/bb30482a-7acc-47cd-a82f-3aa6c0a28f3d) |
| Parc de TEST-PUBLICATION | 26/01/2027 | [Compte](https://www.gerimmo.app/admin/comptes/571f65a2-8a44-4084-871b-55ba31fdca61) |

1. Ouvrez [Demandes de données — À traiter](https://www.gerimmo.app/admin/donnees?etat=ouvert) avec votre compte de supervision et la double vérification. Pour TEST-PUBLICATION, cherchez d’abord la demande déjà signalée dans la passation.
2. Si la demande manque, connectez-vous avec le compte fictif concerné et ouvrez [Mes données](https://www.gerimmo.app/compte/donnees). Dans « Votre demande », choisissez « Fermer mon compte », précisez qu’il s’agit de la fin du test, puis cliquez « Enregistrer ma demande ».
3. De retour dans la console, ouvrez « Afficher le bilan sans rien effacer ». Comparez la fiche avec la liste ci-dessus. Contrôlez les espaces effacés, les accès retirés et les dossiers liés à des tiers. Vérifiez séparément les comptes locataire et artisan liés aux parcs d’audit et de recette avant toute demande à leur nom. Au moindre doute sur un vrai compte, un autre espace ou un abonnement payé, arrêtez-vous sur ce dossier.
4. Cliquez « Programmer la fermeture ». Vérifiez que le compte et la date d’effet figurent dans « Fermetures de comptes ». Sans abonnement payé, l’effacement intervient quatorze jours après la programmation. Si l’effacement doit être terminé avant le 24, programmez au plus tard le 9 décembre et contrôlez la date affichée. Après la date d’effet, vérifiez le résultat avant de passer aux envois.

## 2. Ouvrir les envois un par un

Les cinq étaient fermés le 27 novembre. Le plan R5 prévoit une ouverture progressive après la fermeture des tests et la vérification du [parcours de référence, partie A](PARCOURS-15-MINUTES.md).

| Ordre | Libellé de la console | Ce que le code exige |
| --- | --- | --- |
| 1 | Avis d’échéance du loyer | Accord dans les réglages de l’espace et avis dû à l’adresse vérifiée. |
| 2 | Relance amiable d’un loyer impayé | Accord dans les réglages de l’espace pour l’automatique et relance due. Ce bouton ouvre aussi la relance envoyée d’un clic par le bailleur, sur décision Q24. |
| 3 | Rappel d’un rendez-vous d’intervention | Rendez-vous à rappeler et destinataire dû. Le code ne demande aucun accord distinct de l’espace. |
| 4 | Relance d’une invitation de locataire | Invitation en attente, relance arrivée à échéance et réservée. Le code ne demande aucun accord distinct de l’espace. |
| 5 | Relance d’une demande de report de rendez-vous | Demande de report ouverte, relance arrivée à échéance et réservée. Le code ne demande aucun accord distinct de l’espace. |

**Laissez les lignes 3 à 5 fermées tant que vous n’avez pas confirmé si l’action initiale suffit ou si un accord distinct doit être ajouté.** Dans les trois cas, la base vérifie le destinataire et que le rappel est toujours dû juste avant l’envoi. Cette vérification ne vaut pas accord explicite.

Pour chaque ligne autorisée, dans l’ordre du tableau :

1. Ouvrez [Paramètres](https://www.gerimmo.app/admin/parametres#titre-envois-automatiques), carte « Envois automatiques d’e-mails ». Pour les deux premières lignes, relevez le nombre d’espaces qui ont donné leur accord. Si le nombre surprend ou si une adresse de test reste concernée, arrêtez-vous.
2. Cochez « Je confirme : de vrais e-mails partiront aux personnes concernées dès la prochaine passe. », puis cliquez « Ouvrir cet envoi ». Rechargez et vérifiez que cette ligne indique « Ouvert ».
3. Ouvrez [Consignes du dirigeant](https://www.gerimmo.app/admin/consignes), puis « Dernières opérations ». Vérifiez une nouvelle ligne « Envoi automatique ouvert ou fermé » à l’heure du geste. Pour identifier précisément le geste, contrôlez dans la base la ligne `supervision_operations` où `action = 'envoi_automatique'`, `details.ouvert = true` et où `details.flux` correspond à la ligne ouverte. Attendez une nouvelle ligne par ouverture.
4. Après le passage de la tâche, vérifiez son résultat dans [Tâches automatiques](https://www.gerimmo.app/admin/equipes). Si un message était attendu vers une boîte de contrôle que vous maîtrisez, vérifiez sa réception et l’absence de doublon. Un passage réussi ou une ligne au journal établit le passage ou le réglage, respectivement. La réception se constate dans la boîte. Si un message attendu manque, vérifiez les erreurs et l’état d’envoi avant toute reprise. En cas d’écart, cliquez « Fermer cet envoi » et suspendez l’ouverture suivante. Un message déjà parti ne peut pas être rappelé.

## 3. À partir du 25 décembre, vérifier le premier débit et son remboursement

1. Connectez-vous comme bailleur de l’espace conservé et ouvrez [Mon abonnement](https://www.gerimmo.app/espace/aeea28b4-0ec5-4277-8442-42756d3912fa/abonnement). Vérifiez que l’essai est expiré, qu’un bien est à couvrir et que le récapitulatif annonce « Premier prélèvement à la validation du paiement ». Si Gerimmo annonce une date de débit ultérieure, un autre montant ou une souscription bloquée, arrêtez-vous.
2. Choisissez le mensuel pour un bien. Lisez et acceptez les conditions affichées et cochez l’accord de paiement. Cliquez « Continuer vers le paiement sécurisé ». Vérifiez le montant sur la page Stripe et validez une seule fois avec votre carte.
3. Après le retour, vérifiez l’état de l’abonnement dans Gerimmo. Dans le [tableau de bord Stripe](https://dashboard.stripe.com/), ouvrez le paiement du même client en mode réel. Vérifiez qu’il a réussi, que le montant correspond au récapitulatif et que la facture est payée. Relevez l’heure, le montant et les références de paiement, de facture et d’abonnement. En base, vérifiez sur la ligne `abonnements` de cet espace les mêmes identifiants Stripe, `stripe_statut = 'active'` et `premiere_facture_payee` renseignée. Si le retour est incertain, cherchez d’abord le paiement avant toute nouvelle tentative.
4. Depuis « Mon abonnement », cliquez « Renoncer au contrat ici ». Vérifiez le nom et l’« Adresse électronique de l’accusé de réception », puis cliquez « Confirmer la rétractation ». Vérifiez « Rétractation enregistrée » au retour et la réception de l’accusé. Le bouton de résiliation suit un autre parcours.
5. Ouvrez à nouveau le même paiement Stripe. Vérifiez que le remboursement a réussi, que son total égale le débit et que l’abonnement est annulé sans prochaine échéance. En base, vérifiez la ligne de `retractations_abonnement` pour le même espace et le même abonnement, avec `nature = 'abonnement'`, `executee_le` renseignée, le montant intégral dans `montant_rembourse_cents` et les références Stripe dans `refunds`. Contrôlez aussi l’état final de l’abonnement dans Gerimmo. Si les données divergent ou si le remboursement est en attente, conservez les références et faites rapprocher les états avant toute autre opération. [Documentation Stripe sur les remboursements](https://docs.stripe.com/refunds)
6. Après rapprochement du débit et du remboursement, programmez la fermeture du dernier compte fictif avec la procédure de la première partie.

Sources internes : [plan de publication, R5 et R8](PLAN-DE-PUBLICATION.md) et [audit du 19 novembre, COM-2](audit-complet-20261119/RAPPORT.md). La qualification juridique du parcours reste **à vérifier**.
