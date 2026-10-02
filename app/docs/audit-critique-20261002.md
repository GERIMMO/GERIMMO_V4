# Audit critique Gerimmo — 2 octobre 2026

## Conclusion provisoire

Gerimmo ne peut pas être déclaré entièrement validé sur la seule base de sa CI. La revue associe lecture du code, tests métier/SQL, navigation mobile et captures de profils. Les services réels et les cas non reproduits restent explicitement ouverts. Les modifications ci-dessous sont locales à ce stade, sans déploiement confirmé.

## Corrections réalisées et vérifiées

| Référence | Défaut | Correction | Preuve |
|---|---|---|---|
| A01 | Protection SQL manquante contre les dates incohérentes ; validation serveur à compléter pour les dates impossibles | Renforcement de la validation calendrier existante et garde SQL pour les écritures directes. Référence temporelle Europe/Paris. Aucun historique réécrit | 4 tests unitaires, 3 tests PostgreSQL réels en transaction annulée |
| A02 | Après un dépôt refusé, le nom du fichier pouvait rester affiché alors que le champ natif était vide | Synchronisation du composant partagé avec la remise à zéro du formulaire | Test navigateur : PDF invalide refusé, nom effacé et champ réellement vide ; date future refusée |
| A03 | Le même règlement de copropriété ne pouvait pas être utilisé pour plusieurs baux | Réutilisation explicite du document de même empreinte, même organisation et même catégorie, sans seconde copie. Les autres doublons et nouvelles versions conservent leurs contrôles | 3 tests : réutilisation autorisée, mauvaise catégorie refusée, autres usages toujours protégés |

La migration `20261002200000_dates_attestations_artisans.sql` est préparée ; son application en production n'est pas confirmée.

## Priorités restantes

| Priorité | Sujet | État / prochaine vérification |
|---|---|---|
| P1 | Identité de l'éditeur et médiateur | Les champs de `src/lib/editeur.ts` sont vides, y compris dans main. Les faits doivent être fournis ; aucune identité ne sera inventée |
| P1 | Dépôt du bail signé et de la notice signalé par le testeur | Pas encore reproduit avec son dossier et ses fichiers. Distinguer défaut de dépôt, doublon et refus d'activation pour dossier incomplet ; ne pas supprimer les contrôles pour faire passer le test |
| P1 | Réinitialisation du mot de passe | Délai de 24 h explicitement reporté à demain par l'utilisateur ; aucun changement Supabase effectué dans cet audit |
| P1 | Tests navigateur agence | Des pages ont dépassé 20 secondes sur le serveur local. Mesurer à nouveau sur build et base propre avant de conclure à une panne ou une régression de performance |
| P2 | Zone d'intervention artisan | Main accepte déjà les départements : la copie locale de recette était en retard. Conserver cette évolution et vérifier la correspondance avec les communes, notamment Corse et outre-mer, sans ouverture commerciale automatique |
| P2 | Métiers effacés à l'inscription | Main bloque déjà la remise à zéro du formulaire après refus. Correction antérieure conservée ; retest de cette version encore nécessaire |
| P2 | Documents non applicables | Clarifier les pièces attendues et les motifs de non-applicabilité (retour sur les termites), sans inventer une obligation ni un document |
| P2 | Recette reproductible | Le portefeuille de démonstration enrichi fausse deux attentes Solo dans les tests d'abonnement. Isoler les fixtures et vérifier sur base neuve ; ne pas modifier les prix pour satisfaire une attente devenue fausse |
| P2 | Lisibilité des informations manquantes | Poursuivre la distinction entre conseil, information à compléter et véritable refus. Les couleurs douces du parcours sont déjà dans main, pas une nouveauté de cet audit |

## Vérifications enregistrées

- Suite logique locale : 2 543 tests passés, 89 ignorés, avant ajout des 10 tests ciblés. Les tests ignorés ne sont pas validés.
- Nouveaux tests ciblés : 7 unitaires et 3 PostgreSQL passés ; 1 scénario navigateur passé.
- Contrôles TypeScript et lint ciblés : passés lors du développement ; contrôle final passé avant rapprochement avec main ; à rejouer après rapprochement.
- Audit accessibilité automatisé : 67 pages visitées, aucune violation grave/critique ni commande sans nom détectée. Cela ne remplace pas une expertise complète clavier/lecteur d'écran.
- Matrice de navigation générée : 146 écrans, 3 exclus faute de dossier EDL/sollicitation dans la base. La suite navigateur complète est en cours et comporte déjà des échecs : elle n'est pas verte.
- Audit mobile public (18 écrans), propriétaire (20), locataire (12) : passés à ce stade.
- Captures manuelles enregistrées pour superadmin, artisan et locataire dans `work/audit-critique-02octobre` à la racine de l'espace de travail.

## Limites et sécurité

Les comptes et données employés ici sont ceux de la recette locale isolée. Aucun paiement, SMS, signature réelle ou modification de données métier de production n'a été déclenché. Les alertes de santé de la recette reflètent notamment des services non configurés localement : elles ne prouvent pas des pannes de production.

À vérifier séparément avec accès externes : délivrabilité et récupération de compte réelle, cycle Stripe réel et webhooks, signatures Yousign réelles, restauration des sauvegardes et antivirus. Les anciens résultats ne sont pas présentés comme une nouvelle validation.

## Écart de version constaté

La comparaison avec main `24af224` montre que la copie locale de recette ne contient pas toutes les corrections du 2 octobre : départements, maintien des métiers et identification des doublons de documents générés. Les corrections proposées sont rapprochées de main pour ne pas les retirer. Les résultats locaux ne constituent donc pas une certification de la version actuellement publiée.
