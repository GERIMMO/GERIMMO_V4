# Recommandés électroniques AR24

Implémentation locale du 28 octobre 2026. Contrat API vérifié dans la [documentation officielle AR24](https://developers.ar24.fr/doc/). Aucune opération réelle n’a été envoyée pendant les tests.

## Activation

Le fournisseur doit délivrer un accès API après contractualisation et validation de sa recette. L’expéditeur doit disposer d’une identité AR24 vérifiée, d’une adresse confirmée, de conditions acceptées et d’un moyen de paiement ou de la facturation contractuelle prévue. Gerimmo ne crée pas ces comptes et n’accepte pas les conditions en leur nom.

Le serveur doit disposer des trois variables `AR24_ENVIRONMENT` (`sandbox` ou `production`, obligatoire), `AR24_TOKEN` et `AR24_PRIVATE_KEY`. Ne jamais exposer ces valeurs au navigateur. L’absence de configuration affiche une explication et laisse la préparation du PDF disponible.

La table `connexions_ar24`, modifiable uniquement par l’opérateur avec le rôle de service, relie **chaque organisation** à l’identifiant d’expéditeur AR24 vérifié. Renseigner l’environnement, le tarif TTC contractuel en centimes, puis activer la connexion après contrôle du contrat. Aucun tarif n’est déduit du prix public ou inventé. La recette fournisseur doit confirmer le tarif applicable avant ouverture ; l’API documentée n’offre pas de devis préalable par courrier électronique. Une modification de cette configuration invalide les préparations existantes au moment d’envoyer.

## Parcours

Le propriétaire prépare le courrier depuis le loyer en retard, avec un délai de règlement de 1 à 90 jours. Le modèle existant de mise en demeure remplit le bailleur, le logement, les échéances et les modalités connues. Un champ obligatoire absent bloque la préparation et son libellé est indiqué.

La fenêtre présente le destinataire, son adresse électronique, le montant échu, le délai, le coût TTC et le texte intégral. L’accord LRE du locataire est distinct de celui des quittances et doit correspondre à son adresse actuelle. Le propriétaire confirme personnellement le solde non reçu, le courrier et le coût, puis fournit son code d’authentification AR24. Ce code n’est pas enregistré.

Le corps du modèle est limité aux balises de texte et de tableau, sans attributs, scripts, images ni ressources externes. L’aperçu isolé, l’empreinte de confirmation et le contenu transmis utilisent exactement cette même chaîne. Le PDF reste disponible pour la voie postale, mais n’est pas envoyé automatiquement en pièce jointe de la LRE.

## Fiabilité

- Une commande persistante est réservée atomiquement **avant** le POST fournisseur. Elle fige le destinataire, le courrier, le coût et toutes les échéances. Un double clic ne produit pas de second envoi.
- Un changement de règlement, d’identité, de consentement ou de tarif, ou une préparation de plus de 30 minutes, demande une nouvelle lecture avant réservation.
- Une réponse réseau perdue ou illisible conserve l’état « à vérifier ». Aucun nouvel envoi automatique. L’actualisation recherche la référence exacte via `GET /user/mail`, puis vérifie expéditeur et destinataire ; zéro ou plusieurs correspondances restent à vérifier.
- `to_valid` est un brouillon AR24 à authentifier sous 7 jours, jamais un succès d’expédition. Les états pris en charge, envoyé, reçu, refusé et non réclamé restent distincts.
- Un signal `send_fail` ne suffit pas à autoriser une nouvelle expédition. La documentation ne garantit pas qu’il constitue une attestation d’échec définitif. Après vérification explicite auprès d’AR24, l’opérateur peut appeler `attester_echec_definitif_ar24` avec la référence de cette confirmation ; ce geste est réservé au rôle de service et journalisé. Une issue ambiguë, un courrier sans identifiant fournisseur ou une preuve de transmission interdisent cette attestation.
- Une reprise ainsi autorisée crée une nouvelle commande liée au courrier échoué et conserve l’ancien suivi. Le propriétaire relit et confirme de nouveau dette, destinataire, contenu, tarif et identité AR24. Un second clic retrouve la même préparation. Aucun envoi ne repart automatiquement, et un changement de la vérification de l’ancien courrier bloque la nouvelle réservation.
- Seul le serveur peut enregistrer l’état et les liens de preuve retournés par AR24. Chaque nouvelle réponse enrichit les preuves conservées, même si le fournisseur ne renvoie que la dernière preuve. Les liens sont contrôlés sur le domaine fournisseur et restent accessibles uniquement aux gestionnaires autorisés. Ils ne sont pas recopiés en fichiers dans la GED à ce stade ; leur disponibilité dépend de l’archivage AR24 prévu au contrat.
- Le suivi reste consultable dans les loyers du bail après disparition de l’alerte du tableau de bord. Les courriers déjà engagés suspendent les relances automatiques pour les termes concernés.

La LRE actuellement préparée vise le locataire principal identifié et consentant. Elle ne simule pas un envoi distinct aux autres colocataires ou garants. Une notification individuelle à un autre destinataire nécessite son propre courrier et son propre accord.

## Vérifications

`tests/ar24.test.ts` reproduit les vecteurs de signature/chiffrement officiels et teste les échanges avec un transport simulé. `tests/recommandes-ar24-actions.test.ts` vérifie l’ordre réservation/envoi, les états incertains, les modifications et la configuration manquante. `tests/recommandes-ar24-base.test.ts` vérifie sur PostgreSQL les droits intercomptes, consentements, réservations, preuves non falsifiables et conservation des preuves lors d’un suivi partiel.

`e2e/recommandes-consentements.spec.ts` décrit le parcours navigateur à 390 et 1440 pixels : accords distincts, retrait après rechargement et après désactivation de l’accès locataire, absence de faux envoi lorsque la configuration manque, puis consultation d’un courrier fictif à vérifier dans l’historique du bail. Il utilise exclusivement la base API locale de recette et nettoie ses propres données. Une simulation mobile ne remplace pas une recette sur téléphone réel.

Les deux migrations sont rejouables : `20261028143628_loyers_confirmation_consentements.sql` puis `20261028150004_recommandes_ar24_durables.sql`. Le retour arrière désactive les nouveaux envois sans effacer les commandes, consentements ni preuves.

Reste indispensable avant activation en production : recette sur l’environnement AR24 autorisé avec comptes fictifs, contrôle du tarif et du parcours d’identité, confirmation des preuves avec le fournisseur. Les tests locaux ne prétendent pas valider ces opérations externes.
