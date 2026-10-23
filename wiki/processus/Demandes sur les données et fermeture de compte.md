# Demandes sur les données et fermeture de compte

État au 21 octobre 2026 : réalisation locale vérifiée ; publication suivie dans la PR et le journal de déploiement.

## Parcours

`/compte/donnees` permet au titulaire connecté de demander une copie, une rectification, un effacement ou la fermeture de son compte. La demande et les réponses restent privées entre lui et la supervision, même lorsqu’il appartient à une organisation. Le formulaire ne supprime rien et ne résilie pas d’abonnement.

La file paginée `/admin/donnees` sépare les demandes ouvertes et terminées, affiche l’échéance initiale d’un mois civil (jour de Paris), les réponses et leur historique. Une demande avec réponse n’est plus signalée comme sans première réponse. Le classement Résolu ne doit être utilisé qu’après contrôle des résultats. L’alerte de délai est indicative : une réponse intermédiaire ne suffit pas nécessairement à accomplir l’obligation juridique.

La réalisation réutilise `retours_utilisateurs` et `soumettre_retour` : nature question, organisation nulle, auteur issu de la session et clé stable. Les politiques existantes protègent également `retours_historique`. Aucune nouvelle permission ni migration.

## Traitement contrôlé

1. Qualifier le titulaire, le responsable du traitement et les catégories demandées ; demander une preuve complémentaire uniquement en cas de doute justifié.
2. Séparer ce qui peut être effacé de ce qui doit être conservé : motif, périmètre réduit, accès limité et échéance pour chaque catégorie.
3. Fournir les exports par un canal privé. Avant toute suppression, faire un inventaire approuvé, vérifier la sauvegarde, simuler puis faire valider l’opération. Vérifier séparément l’abonnement et les dossiers partagés.
4. Pour Zoho, vérifier la copie signée et son certificat dans le stockage privé Gerimmo, leur lisibilité et leurs empreintes avant toute purge prestataire. L’API de suppression documentée déplace en corbeille : elle ne prouve pas un effacement définitif. Contrôler aussi les autres prestataires et les sauvegardes.
5. Révoquer sessions et accès, traiter les références partagées et vérifier les fichiers physiques. Une suppression Auth seule n’invalide pas tous les JWT déjà délivrés. Une anonymisation doit être irréversible, pas un simple changement de nom. Réappliquer les effacements après restauration.
6. Répondre précisément : effacé, conservé avec motif/durée, copies encore en attente. Conserver seulement les preuves nécessaires.

Les suppressions sont des interventions qualifiées, pas une suppression automatique depuis ce formulaire. Les 29 règles de conservation existantes restent inchangées. La durée générale de cinq ans mentionnée dans certains anciens documents ne doit pas être présentée comme la prescription universelle des baux d’habitation : la source Service-Public distingue notamment le délai de trois ans. Une revue catégorie par catégorie reste à faire avant de modifier les règles de purge.

## Courriels et signatures

Accords explicites du dirigeant le 21 octobre : adresse professionnelle `contact@gerimmo.app`, un seul essai vers son adresse professionnelle approuvée, réception MX Resend et DMARC en observation ; rappels Zoho par e-mail J+7 et J+21 puis alerte interne J+28, SMS de vérification conservés. Aucun circuit de signature en production au moment du contrôle.

Réception MX et domaine vérifiés par Resend ; e-mail d’essai marqué Delivered. La réponse entrante n’a pas encore été constatée. DMARC `p=none` sert à observer, ne rejette pas les messages. Les enregistrements SPF/DKIM existants restent en place.

`RESEND_REPONDRE_A=contact@gerimmo.app` et `ZOHO_SIGN_RELANCES_ACTIVES=true` enregistrés pour Production dans Vercel ; leur activation effective dépend du prochain déploiement. Le contact propre à une organisation reste prioritaire. Un échec réseau après l’appel d’envoi est désormais déclaré incertain, pour éviter de proposer un renvoi aveugle.

Le circuit Gerimmo désactive les rappels natifs lors de la création Zoho afin d’éviter le cumul avec les réglages généraux du compte. Le rapprochement vérifie l’identité des signataires et archive PDF signé et certificat avant de terminer le circuit ; les réservations d’envoi incertaines ne sont pas répétées automatiquement. Aucun nouvel essai de signature envoyé.

La rétention automatique globale Zoho reste désactivée : elle concernerait aussi des documents anciens dont l’archivage local n’est pas démontré. Les copies sont à examiner selon la procédure ci-dessus avant une purge qualifiée.

## Vérifications

161 tests ciblés sur les demandes, le courrier et les signatures réussis ; 130 tests sur base fictive couvrant suivi, atomicité et supervision ; 21 tests de support/actions réussis après ajout du contrôle privé (recouvrement partiel avec les 130). Aucun droit supplémentaire, aucune modification des données métier de production.

Parcours utilisateur local : dépôt, confirmation, persistance après rechargement, historique, refus d’accès superadmin pour un gestionnaire. Vue ordinateur et téléphone de 390 px, sans débordement. Réponse du superadmin fictif enregistrée, retrouvée après rechargement et dans l’historique ; supervision vérifiée à 390 px également. La CI de publication complète ces contrôles ; ne pas confondre les tests locaux avec une recette humaine complète des prestataires externes.

## Sources consultées

- [CNIL — exercice des droits et délai](https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees).
- [CNIL — effacement](https://www.cnil.fr/fr/comprendre-mes-droits/le-droit-leffacement-supprimer-vos-donnees-en-ligne).
- [CNIL — durées de conservation](https://www.cnil.fr/sites/default/files/atoms/files/guide_durees_de_conservation.pdf).
- [Service-Public — conservation des papiers](https://www.service-public.gouv.fr/particuliers/vosdroits/F19134) et [prescription locative](https://www.service-public.gouv.fr/particuliers/vosdroits/F479).
- [Zoho — rétention des documents](https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/account-settings/document-retention/articles/document-retention) et [suppression API vers la corbeille](https://www.zoho.com/sign/api/document-managment/delete-document.html).
- [Resend — DMARC](https://resend.com/docs/dashboard/domains/dmarc).

## Décision du 22 octobre — expéditeur des signatures

Le dirigeant demande de conserver son adresse personnelle pour le moment, puis de la changer plus tard. Cette décision remplace l’objectif d’adresse professionnelle immédiate pour les signatures, sans modifier le courriel de contact général du site. Envoi standard Zoho conservé ; aucun SMTP ajouté. Les changements locaux de conservation sont décrits dans [le bilan du 22 octobre](../../app/docs/signatures-conservation-22-octobre.md).
