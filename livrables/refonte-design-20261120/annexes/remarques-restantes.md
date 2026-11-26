# Annexe C — Remarques laissées par les lots d'harmonisation

Chaque lot a noté, page par page, ce qu'il a vu et **choisi de ne pas faire** : le plus souvent parce que le changement touchait la structure d'une page, un composant partagé, un libellé vérifié par un test automatique, ou sortait d'un chantier de présentation. **338 remarques** au total. Aucune n'empêche une page de fonctionner ; ce sont des pistes pour la suite, à trier avec le dirigeant.

Elles sont reproduites telles que chaque lot les a écrites. Quelques-unes ont été traitées ensuite par les règles communes et le lot des composants partagés (taille unique des titres d'écran, texte sous 12 px, bouton de recherche de 44 px) : le parcours « après » fait foi.

## Propriétaire et agence — accueil, biens, lots, baux, personnes (47)

**`/agence/[orgId]`**

- Tuiles et bandeau de l'accueil agence : classes globales (.tuile, .accueil-bandeau dans globals.css), hors périmètre ; le h1 du bandeau n'est pas à var(--titre-1).
- Textes « À faire », « à qualifier » et « appelés » laissés tels quels : ils figurent dans les tests.
- Les 16 liens écrits « /agence/${orgId}/… » ne sont pas passés par baseEspace : un test en fixe le nombre.
- Côté propriétaire, l'essentiel reste dans des blocs repliés (étapes, loyers, automatismes) : le déplier changerait la structure vérifiée par les tests.
- articles-accueil.tsx : composant sans appelant (un test l'exige), non touché.

**`/agence/[orgId]/parc`**

- Vue agence : tuiles .kpi et liste en classes globales, non modifiées ; la tuile « En location » reste verte en permanence (classe fixe).
- À l'arrivée sur téléphone, la liste des biens du propriétaire porte l'anneau de focus : le composant lui donne le focus par programme (comportement existant, logique non touchée) ; l'anneau est désormais celui du Design System.
- Vue du propriétaire avec un bien sélectionné : regardée à 1440 px seulement.
- « Catalogue d'équipements » toujours replié en bas de page.

**`/agence/[orgId]/parc/[bienId]`**

- Contraste : plus aucune alerte axe sur cet écran (propriétaire, agent, administrateur à 1440 px après le passage aux jetons ; propriétaire et agent à 375 px après la réécriture). La vue de l'administrateur n'a pas été repassée à axe après la réécriture de la feuille.
- Titre « Dépenses et charges » en gras : il vient de consommations.module.css, partagé, hors périmètre.
- Pas d'action principale sur cet écran : deux boutons de navigation en contour.
- Termes « clé de répartition » et « découpage » conservés.

**`/agence/[orgId]/parc/[bienId]/lots/[lotId]`**

- 942 lignes et deux jeux d'onglets selon le rôle : logique et structure non touchées.
- Onglets regardés : « Résumé » (agent et propriétaire, 375 et 1440 px) et « Logement » (agent, 1440 px). Les onglets Documents, Contrats, Location, Argent et Caractéristiques n'ont pas été capturés.
- Mode « Compléter le lot » regardé à 1440 px seulement, côté propriétaire.
- « Retour au logement » conservé (vérifié par un test de bout en bout).
- Jargon « détention », « quote-part », « appel de charges » conservé.
- Actions rangées dans des dépliants (« Gérer le statut du lot », « Gérer la propriété ») inchangées.

**`/agence/[orgId]/parc/nouveau`**

- Titres « Créer un lot » et « Ajouter un bien » conservés (présents dans les tests).
- L'en-tête de chaque étape du formulaire garde un léger dégradé : il vient de presentation-parcours.module.css, partagé avec d'autres espaces.
- Regardé à 1440 px côté propriétaire et à 375 px côté agent ; l'encart de dépassement de formule n'a pas été vu (le compte de test ne dépasse pas sa formule).

**`/agence/[orgId]/parc/import`**

- Écran déjà aux jetons. Les trois temps de l'import sont visibles (Fichier, Aperçu, Résultat).
- Le bouton plein reste « Télécharger le gabarit » (texte présent dans les tests).
- Regardé avec le compte administrateur ; la variante propriétaire n'a pas été capturée.

**`/agence/[orgId]/baux/[bailId]`**

- Le h1 reste le nom du lot, identique à celui de la fiche du lot : le changer touche un écran de 1 296 lignes parcouru par les tests de bout en bout ; proposition : « Bail de {locataire} ».
- Seul un bail actif a été regardé (onglet Contrat). L'assistant de brouillon, les onglets Documents, Suivi et Départ et le bilan avant signature n'ont pas été capturés : leurs feuilles sont passées aux jetons sans contrôle visuel.
- Actions lourdes (congé, restitution, avenant) toujours dans des sections dépliantes.
- Quittances ouvertes sur /quittance, hors de la coquille : inchangé (route).

**`/agence/[orgId]/baux/[bailId]/edl/[edlId]`**

- Seul un état des lieux en cours de saisie a été regardé : la puce et le bouton modifiés n'apparaissent que sur un état des lieux signé, non capturé.
- h1 nu dans .entete-page (taille commune, sans icône TitreEcran).
- « Générer le PDF » à deux endroits : inchangé (texte présent dans les tests).

**`/agence/[orgId]/personnes`**

- Les six boutons de moins de 44 px relevés à 768 px sont corrigés dans la feuille, mais non remesurés à 768 px (serveur arrêté).
- Liste de l'agence : classes globales, non modifiée ; la puce « Locataire » y reste verte (classe fournie par src/lib, hors périmètre).
- « Retour à mes fiches » conservé (bouton vérifié par les tests), avec son icône au lieu de « ← ».
- Vue de création regardée à 1440 px seulement ; état vide non capturé (le compte de test a des fiches).
- Deux h1 dans le document, dont un seul affiché à la fois : inchangé.

**`/agence/[orgId]/personnes/[personId]`**

- 982 lignes : la navigation par ancres et la carte « Mandats de gestion » ne sont pas restructurées.
- Regardé avec une fiche de locataire ; la fiche d'un propriétaire mandant (carte des mandats) n'a pas été capturée.
- Le lien du téléphone est corrigé comme celui de l'e-mail, mais la fiche de test n'a pas de téléphone : non vérifié par axe.
- Pas d'action principale ; l'archivage reste dans « Autres actions ».

**`/agence/[orgId]/mandats`**

- Le bandeau de versements en attente et l'état vide n'ont pas été vus : les deux mandats de test n'ont aucun rapport.
- « Fiche mandant », « rapport de gestion », « versement attendu » conservés dans les rangs.
- Écran sans action, par nature.

**`/agence/[orgId]/diagnostics/[diagnosticId]`**

- Page de renvoi sans rendu, non modifiée. Le renvoi a été suivi à 1440 px : il mène bien à la fiche du lot.

**`/agence/[orgId]/lots/[lotId]`**

- Page de renvoi sans rendu, non modifiée. Le renvoi a été suivi à 1440 px (avec ?vers=caracteristiques) : il mène bien à la fiche du lot, onglet « Logement ».
- Un lot introuvable renvoie à la liste sans message : c'est une redirection (logique), à traiter côté commun.

### Textes laissés tels quels parce qu'un test automatique les vérifie

- « Bonjour » (h1 des deux accueils)
- « Votre patrimoine en bref » (aria-label de la région des indicateurs, contrôlée par axe dans e2e/alerte-impaye-proprietaire.spec.ts)
- « À faire », « à qualifier », « appelés », « Tout voir » (accueil agence)
- « Mon portefeuille », « Parc de l'agence », « Biens & locations » (titres et menu)
- « Créer un lot », « Ajouter un bien », « Reprendre le parc », « Télécharger le gabarit »
- « Retour au logement » (e2e/reseau-couverture.spec.ts)
- « Retour à mes fiches »
- « Votre lot » (fiche d'un bien)
- « Mandats & versements »
- « État des lieux d'entrée », « État des lieux de sortie », « En cours de saisie », « Générer le PDF »
- Le nombre de liens « /agence/${orgId}/… » dans page.tsx (16) et la forme des appels de AccueilProprietaire (tests/racine-pages-espace.test.ts)

## Propriétaire et agence — loyers, comptabilité, documents, incidents, réglages (51)

**`/agence/[orgId]/loyers`**

- Tuile neutre .kpi : son liseré gauche gris-bleu vient de globals.css (voir demandes_communes).
- Côté propriétaire, les dépliants imbriqués de « Finances » restent nombreux (structure non modifiée).

**`/agence/[orgId]/comptabilite`**

- Tuiles « Dépenses » et « Net » : liseré gauche neutre hérité de .kpi (demande commune).
- « Ajouter une écriture » reste un onglet : le lien et les titres de carte sont vérifiés par e2e/comptabilite-vues.spec.ts.

**`/agence/[orgId]/comptabilite/fiscal`**

- Seule la variante « situation fiscale à confirmer » s'affiche avec le jeu de données : la vue complète (montants, ligne « En clair ») n'a pas été vue.
- Largeur max-w-4xl conservée.

**`/agence/[orgId]/comptabilite/reprise`**

- Une lecture en échec de l'historique des reprises n'est toujours pas signalée (logique, hors mission).

**`/agence/[orgId]/documents`**

- La fiche d'un document côté propriétaire (liste groupée, panneau d'actions, renouvellements) n'a pas pu être vue : aucun document dans le jeu de données du propriétaire. Feuille relue et validée à l'analyseur, pas à l'écran.
- « ← Retour aux documents » et « ← Retour au lot » gardés tels quels (vérifiés par e2e).

**`/agence/[orgId]/documents/catalogue`**

- Vue « modèle choisi » et liste des modèles d'une situation non capturées (seul le premier écran l'a été).
- Les modèles « En préparation » restent cliquables (logique).
- Largeur max-w-6xl conservée.

**`/agence/[orgId]/incidents`**

- Le dossier d'incident côté PROPRIÉTAIRE n'a pas pu être vu : aucun incident dans son jeu de données. Seuls sa liste vide et ses filtres ont été vus.
- « À attribuer à un gestionnaire » modifié après l'arrêt du serveur : non recapturé.
- Largeur max-w-7xl et bascule à 1100 px conservées (géométrie liée aux classes Tailwind du composant).
- « Suivi par jdupont » (début d'adresse) : vient des données.

**`/agence/[orgId]/incidents/[incidentId]`**

- L'adresse de redirection elle-même n'a pas été capturée ; sa cible (/incidents?sel=…) a été vue à 375 px côté agent.
- Le filtre par défaut après redirection relève de la logique.

**`/agence/[orgId]/incidents/nouveau`**

- Sur téléphone, la carte d'explication reste après le formulaire.

**`/agence/[orgId]/alertes`**

- Agence à 1440 px vue avant le passage des filtres à 44 px ; le résultat a été vu à 375 px.
- Vocabulaire différent selon le rôle (Alertes / À faire) et création hors en-tête sur ordinateur : inchangés, textes couverts par des tests.

**`/agence/[orgId]/agenda`**

- Deux retouches de rayon (pastille du jour) faites après l'arrêt du serveur : non recapturées.
- Côté agence : classes globales .agenda-*, rien à reprendre. Calendrier à 7 colonnes sur téléphone conservé.

**`/agence/[orgId]/messages`**

- Les onglets en .dossier-nav ont été posés juste avant l'arrêt du serveur : les captures montrent encore les anciens boutons. À regarder.
- Conversation ouverte côté propriétaire non vue (aucune conversation dans le jeu de données).
- Côté agence, on ne peut toujours ni lire ni répondre ici (logique).

**`/agence/[orgId]/statistiques`**

- 1440 px vu avant ces deux textes (vus à 375 px).
- Tuiles neutres : liseré gauche hérité de .kpi (demande commune).
- Jauges toujours masquées sous 640 px ; pas de filtre de période.

**`/agence/[orgId]/artisans`**

- Même icône de rubrique que « Incidents » : TitreEcran est partagé (demande commune).
- Fiche d'un artisan (pane-artisan) non ouverte.

**`/agence/[orgId]/profil`**

- 1440 px vu avant le passage h4 → h3 (vu à 375 px).
- Titres en double dans les dépliants conservés : tests/titres-hierarchie-espaces.test.ts compte les <h2 class=titre-carte> de ce fichier.
- Le dégradé sous l'étape active du parcours vient d'un composant partagé.

**`/agence/[orgId]/abonnement`**

- Agence à 1440 px vue avant le passage h3 → h2 (vu à 375 px). Propriétaire vu à 1440 px, pas à 375 px après la reprise du module.
- États « essai », « changement de formule », « droit de rétractation », « paiement en attente » et grille historique non affichables avec le jeu de données : non vus.
- Deux implémentations de l'écran conservées.

**`/agence/[orgId]/abonnement/resiliation`**

- Capturée à 1440 px AVANT ces changements (états « aucun abonnement » agence et propriétaire) ; le serveur s'est arrêté avant la recapture. Le récapitulatif complet n'est pas affichable sans abonnement en cours.
- À regarder à 375 et 1440 px.

**`/agence/[orgId]/abonnement/retractation`**

- Capturée à 1440 px AVANT ces changements (état « aucun délai en cours ») ; non recapturée. Le formulaire de déclaration n'est pas affichable sans délai ouvert.
- À regarder à 375 et 1440 px.

**`/agence/[orgId]/journal`**

- Non capturée à 375 px.
- Page hors menu ; largeur max-w-6xl conservée.

**`/agence/[orgId]/journal/[slug]`**

- Non capturée à 375 px.
- Titre d'onglet générique « Article du journal » (logique de métadonnées).

**`/agence/[orgId]/faq`**

- Non capturée à 375 ni 768 px.
- Le bas de page (« Contacter Gerimmo », « Mes demandes », « Les idées ») vient de src/app/assistance/assistance.module.css, hors périmètre : ses bords hauts colorés restent.

**`/agence/[orgId]/reseau`**

- Vue à 1440 px (admin et propriétaire) avant la retouche du dépliant ; non capturée à 375 px. Résultats de recherche non affichés.
- Page hors menu, titre à la première personne : inchangés (titre vérifié ailleurs).

**`/agence/[orgId]/administration`**

- Vue à 1440 px avant ces deux retouches ; non recapturée, non vue à 375 px.
- Membres identifiés par leur seule adresse e-mail (données).

### Textes laissés tels quels parce qu'un test automatique les vérifie

- « ← Retour aux documents » et « ← Retour au lot » (e2e/depot-direct.spec.ts, depot-document-lot.spec.ts, contre-audit-proprietaire.spec.ts) : gardés, non ramenés à « ← Documents ».
- h1 « Loyers & charges » (e2e/recette-production/admin-agence.spec.ts) : texte gardé, seulement enveloppé dans TitreEcran.
- « Saisir une écriture », « Clôturer un mois », « Rapports de gestion », « Fige les écritures … irréversible », lien « Ajouter une écriture » (e2e/comptabilite-vues.spec.ts) : inchangés ; les explications sont ajoutées ailleurs.
- « Devis à décider » (tests/incidents-liste-a-traiter.test.ts) ; « Enregistrer un artisan » (e2e/supervision-consultation.spec.ts) ; « Détail par propriétaire et SCI » (e2e/lot3-loyer-facture.spec.ts).
- « Tarifs à titre d’information », « Changer de formule », « Renoncer au contrat ici », « Résilier votre contrat » (tests/abonnement-proprietaire.test.ts, e2e/abonnement.spec.ts, tests de conditions) : inchangés.
- Nombre de <h2 class=titre-carte> dans profil/page.tsx, comptabilite/reprise/page.tsx et documents/page.tsx (tests/titres-hierarchie-espaces.test.ts, 39 au total) : aucun ajouté ni retiré.
- messagerie.module.css est chargée par tests/conversation-proprietaire-navigateur.test.ts : géométrie du fil (.historique) conservée.

## Locataire, quittance, attestation, invitation, signature (31)

**`(coquille de l'espace) /locataire/[orgId]/** — menu, en-tête, squelette`**

- La barre basse du téléphone (BarreBasse, src/components/barre-laterale.tsx) et le menu du compte (MenuCompte) sont partagés : non modifiés.
- Le squelette garde la forme de l'accueil pour toutes les pages filles (constat de l'inventaire, non traité).

**`/locataire/[orgId]`**

- « Décompte de charges AAAA » reste un h2 sans la classe titre-carte : tests/titres-hierarchie-espaces fige à 39 le nombre de h2.titre-carte du périmètre.
- La carte « Rendez-vous confirmé » et la carte « Votre dépôt de garantie » n'apparaissent pas avec le jeu d'essai : non vues à l'écran.
- Doublons d'accès du héros (« Mes documents », « Écrire à mon gestionnaire ») conservés : ce sont des liens existants, pas du décor.

**`/locataire/[orgId]/logement`**

- La carte de congé dépliée et la fenêtre du lot (composant partagé fenetre-lot) n'ont pas été ouvertes.

**`/locataire/[orgId]/documents`**

- « Justificatifs de loyer rectifiés » reste un h2 sans titre-carte (compte de 39 figé par le test, et aucun h3 admis).
- Onglet « À transmettre » et fenêtre d'aperçu non ouverts ; l'ordre et les libellés des onglets sont vérifiés par les tests, non modifiés.

**`/locataire/[orgId]/loyers`**

- Le serveur de développement du port 3200 s'est arrêté vers 01 h 44 (processus disparu, connexion refusée) ; je n'en ai pas relancé (consigne). La page a été regardée à 375 px AVANT la retouche de la pastille (le recouvrement y est visible) ; le correctif (max-sm:basis-full) n'a pas pu être recapturé.
- Cartes « Relances reçues », « Mon plan de paiement » et « Votre dépôt de garantie » absentes du jeu d'essai : non vues.
- La frise des douze mois reste sans légende des couleurs (constat de l'inventaire).

**`/locataire/[orgId]/demandes`**

- Les discussions d'intervention (EchangesIntervention, composant partagé) restent en bas de page, détachées de leur demande.
- État vide (.vide-guide) et encadré d'état d'un rendez-vous planifié absents du jeu d'essai : non vus.

**`/locataire/[orgId]/incident`**

- L'encart adaptatif après choix d'une catégorie n'a pas été déclenché (aucune saisie dans le formulaire).
- À 375 px, le libellé de l'option « Non, cela peut attendre quelques jours » est tronqué par le champ (état antérieur, sans débordement).

**`/locataire/[orgId]/contact`**

- Le serveur de développement du port 3200 s'est arrêté vers 01 h 44 (processus disparu, connexion refusée) ; je n'en ai pas relancé (consigne). Regardée à 375 px avant la retouche des pastilles ; la retouche n'a pas été recapturée.
- « Demander à Gerimmo » (AssistantPrive, partagé) nomme Gerimmo dans un espace en marque blanche : voir demandes_communes.
- Titre de repli « Identité à confirmer » conservé (texte métier).

**`/locataire/[orgId]/faq`**

- <details> natifs sans chevron dessiné (constat de l'inventaire, non traité).

**`/locataire/[orgId]/releves`**

- Le formulaire d'un relevé attendu n'apparaît pas avec le jeu d'essai : non vu. Il est dessiné par consommations.module.css (partagé, rayons et couleurs en dur) : voir demandes_communes.
- Page toujours absente du menu : aucune entrée allumée (non traité, la navigation est partagée avec la barre basse).

**`/quittance/[quittanceId]`**

- L'état délivré n'existe pas dans le jeu d'essai (identité de l'émetteur incomplète). Je l'ai regardé à 1440 et 375 px en forçant l'affichage le temps d'une capture, fichiers restaurés aussitôt (vues/locataire/essai-delivre/) ; il n'a pas été vu avec de vraies données.
- Dans la fenêtre d'aperçu de « Mes documents », le bouton d'impression reste secondaire (propriété actionPrincipale absente) : non vu, même raison.
- Vue gestionnaire non capturée (aucun lien vers une quittance dans les écrans de gestion du jeu d'essai).

**`/attestation-loyer/[orgId]`**

- L'attestation délivrée n'existe pas dans le jeu d'essai (deux loyers dus). Écran et impression (emulateMedia print, 794 px) regardés en forçant l'état le temps d'une capture, fichiers restaurés (vues/locataire/essai-delivre/).
- États d'indisponibilité : titres en paragraphe .titre du motif .vide-guide, pas en h2 (inchangé).

**`/invitations/[invitationId]`**

- Seuls deux états ont pu être regardés : lien mal formé et invitation inaccessible avec ce compte. Les états « en attente » (formulaire), « acceptée » et « expirée » demandent une invitation réelle : non vus.
- Le serveur de développement du port 3200 s'est arrêté vers 01 h 44 (processus disparu, connexion refusée) ; je n'en ai pas relancé (consigne). La retouche de l'adresse du compte (retour à la ligne) est postérieure aux captures.
- La marque Gerimmo et l'encart d'aide viennent de CoquilleAuth et AideInvitation (partagés).

**`/signature/caution/[jeton]`**

- Seul l'état « lien non valable » est atteignable sans jeton réel : le récapitulatif et le formulaire de mobile n'ont pas été vus.
- À 375 px, le titre touche la carte (gabarit CoquilleAuth, partagé).

### Textes laissés tels quels parce qu'un test automatique les vérifie

- « Imprimer ou enregistrer en PDF » (e2e/parcours-locataire, e2e/premiere-location-continue) : conservé ; le bouton de l'attestation a été aligné dessus.
- Nombre de <h2 … titre-carte> du périmètre figé à 39 et aucun <h3> admis (tests/titres-hierarchie-espaces) : « Décompte de charges AAAA » (accueil) et « Justificatifs de loyer rectifiés » (documents) restent des h2 sans la classe.
- Accueil : « Votre bail n’est pas encore actif », « Ce qui vous attend » (h2.titre-carte), « Aucun bail n’est encore rattaché », « Responsable de la prochaine étape : votre bailleur », « Le contrat signé n’est pas encore disponible », « Rien à régler pour l’instant », « Loyer restant à régler », « Votre dépôt de garantie », « Restitution en cours », « Décompte établi », « Suivre ma restitution », « Voir le décompte » (tests/ux-locataire-priorites, tests/accueil-locataire-depot) : inchangés.
- Documents : onglets « Mes fichiers » / « À transmettre », identifiants documents-disponibles et documents-a-transmettre, lien href="#documents-a-transmettre", « Bail signé » (tests/ux-locataire-priorites, e2e/parcours-locataire) : inchangés.
- Contact : « Écrire à <nom> », « Votre message » (tests/ux-locataire-priorites) : inchangés.
- Relevés : bouton « Transmettre mon relevé », libellé « Index affiché (m³) », carte en <section> (e2e/consommations-patrimoine) : inchangés.
- Quittance, vue gestionnaire : les seules adresses de gestion du rendu doivent être « …/profil » et « …/baux/<id> » (tests/racine-rendus-serveur) : pas de lien de retour vers la gestion, le retour par l'historique est conservé.
- Invitation : « Accepter l’invitation », « Refuser », « Expirée » (texte exact), « Ouvrir mon espace locataire », « Votre invitation locataire », « Proposée par … », « Ce lien n’est pas valable », « Cette invitation n’est pas accessible avec ce compte » (e2e/invitations-cycle, e2e/lot2-invitations, tests/ux-invitations-premiere-connexion) : inchangés.
- Signature du garant : « Confirmer votre numéro de mobile », « Bonjour <prénom> <nom> », « <bailleur>, bailleur », « en qualité de garant », « acte de cautionnement », champ name="mobile" type="tel" (tests/ux-invitations-premiere-connexion) : inchangés.
- Squelette : « Chargement de la page… », role="status", aria-busy (tests/ux-harmonisation) : inchangés.
- Menu : un seul <BarreBasse> sans racine (tests/racine-pages-espace) et aucun mot « conseils » dans nav-locataire.tsx (tests/conseils-locataire) : respectés.

## Artisan (56)

**`(coquille) /artisan/* — layout, navigation, primitives`**

- L'entrée « Aide en cas de problème » du tiroir mène toujours à /artisan/panne : tests/audit-artisan-public-ecrans-2026-09-27.test.ts exige ce chemin dans nav-artisan.tsx.
- Boutons : 56 px sur téléphone (choix de terrain documenté dans ui.tsx), 44 px au bureau comme ailleurs. Le bouton secondaire garde un contour bleu nuit (lisibilité en plein soleil), là où .btn-secondaire a un contour --filet-champ.
- Vue sur toutes les captures ci-dessous. Non revus après capture : le bouton du geste d'un état vide (il était souligné par « p a » ; passé de <p> à <div>), la limite de 26 rem des boutons au bureau sur la porte publique, et le tiroir « Menu » du téléphone (jamais ouvert en capture).

**`/artisan`**

- Le compteur « Rendez-vous à traiter » additionne toujours reports et rendez-vous à fixer et ne mène qu'à la première section (logique de lien, non touchée).
- Titre de section « Rendre compte (N) — sans cela, pas de facture » inchangé (texte présent dans tests/rendez-vous-anticipe.test.ts).

**`/artisan/agenda`**

- La case du jour garde bg-[var(--marque-clair)] (exigé par tests/artisan-agenda-jour-paris.test.ts).
- Les rendez-vous des chantiers externes ne sont toujours pas dans le semainier (ce serait une requête à croiser : hors périmètre).
- Historique sans pagination ni repli.
- À 375 px, regardée avant le déplacement du bloc « Mes chantiers externes » ; l'ordre final n'a été vu qu'à 1440 px.

**`/artisan/attestations`**

- Le formulaire de dépôt s'ouvre toujours par navigation (?type=…#deposer).
- Trois accès au même dépôt (en-tête, ligne, « Prochaine action »).
- Vue avec le formulaire de dépôt ouvert (?type=decennale), dossier vide.

**`/artisan/chantiers/[chantierId]`**

- Jusqu'à douze actions sur l'écran, dont les destructrices dans le même dépliant « Autres actions » : structure de ParcoursChantier inchangée (tests/artisan-avoir-ecran.test.ts lit les boutons).
- Rendez-vous toujours saisi en datetime-local natif.
- Non capturée : la persona artisan n'a ni client externe, ni chantier, ni facture dans le jeu de données, et le serveur de développement (port 3200) s'est arrêté à 01 h 44 avant que je puisse créer un client de recette par l'interface. Validée par eslint, tsc et les tests qui rendent cette page (artisan-prive-affichage, artisan-avoir-ecran, artisan-ergonomie-des-b, artisan-exclusion-ecran-et-action…), pas à l'œil.

**`/artisan/clients`**

- Menu « Clients externes », h1 « Mes clients externes » : le h1 est dans e2e/.audit et les libellés du menu dans des tests, laissés.
- La recherche recharge toujours la page (formulaire GET).
- Vue sans client (état vide). La liste remplie et la recherche sans résultat n'ont pas pu être vues.

**`/artisan/clients/[clientId]`**

- Non capturée : la persona artisan n'a ni client externe, ni chantier, ni facture dans le jeu de données, et le serveur de développement (port 3200) s'est arrêté à 01 h 44 avant que je puisse créer un client de recette par l'interface. Validée par eslint, tsc et les tests qui rendent cette page (artisan-prive-affichage, artisan-avoir-ecran, artisan-ergonomie-des-b, artisan-exclusion-ecran-et-action…), pas à l'œil.

**`/artisan/devis`**

- Pas d'accès à « Nouveau chantier et devis » depuis cette page.
- Menu « Demandes de devis », onglet du téléphone « Devis » (libellés de navigation, laissés).
- À 1440 px, regardée seulement avant mes changements ; elle ne contient que des composants vus sur l'accueil à cette largeur. Dernière passe de captures impossible : le serveur de développement du port 3200 ne répond plus depuis 01 h 44 (signalé au pilote).

**`/artisan/devis/[sollicitationId]`**

- Page dense sur téléphone (demande, assistant en quatre étapes, suivi, versions) : pas de sommaire ajouté.
- Étape 1 (Proposition) vue ; les étapes 2 à 4 et la demande close n'ont pas été ouvertes en capture.

**`/artisan/devis/nouveau`**

- La page reste rangée sous /artisan/devis : l'onglet « Devis » s'allume (route, non touchée).
- Le choix du client recharge la page (formulaire GET).
- Vue sans client actif (état vide) à 375 px ; la capture à 1440 px existe mais je ne l'ai pas ouverte, et le formulaire avec client n'a pas pu être vu.

**`/artisan/entreprise`**

- Raccourcis de bas de page redondants avec le menu du bureau.
- Corriger SIRET ou raison sociale passe toujours par /assistance.
- Onglet « Coordonnées » vu ; « Zone et métiers » et « Mes devis » n'ont pas été ouverts en capture.

**`/artisan/facturation`**

- Les interventions à facturer restent dans le dépliant sous la vue des factures : le test audit-oct28-rendu lit <details …><summary> sans attribut.
- Deux fiches pour une facture (mission, suivi).
- Onglet « Mes factures » vu, sans facture ; le dépliant des interventions et l'onglet « Mon registre » n'ont pas été ouverts en capture.

**`/artisan/facturation/[factureId]`**

- La mention « Déclarant : votre compte artisan… » reste sur chaque ligne (texte laissé).
- Non capturée : la persona artisan n'a ni client externe, ni chantier, ni facture dans le jeu de données, et le serveur de développement (port 3200) s'est arrêté à 01 h 44 avant que je puisse créer un client de recette par l'interface. Validée par eslint, tsc et les tests qui rendent cette page (artisan-prive-affichage, artisan-avoir-ecran, artisan-ergonomie-des-b, artisan-exclusion-ecran-et-action…), pas à l'œil.

**`/artisan/inscription`**

- Pas d'indicateur de progression entre compte, entreprise et attestations.
- Nouvel en-tête vu à 1440 px (sans session) ; à 375 px je n'ai vu que l'ancien bandeau. Dernière passe de captures impossible : le serveur de développement du port 3200 ne répond plus depuis 01 h 44 (signalé au pilote).

**`/artisan/invitation/[invitationId]`**

- La création de compte reste dans un dépliant.
- AideInvitation est un composant partagé (hors périmètre).
- Variante « sans session » vue à 1440 px avec le nouvel en-tête ; à 375 px je n'ai vu que l'ancien bandeau. Les variantes connectées demandent une invitation réelle. Dernière passe de captures impossible : le serveur de développement du port 3200 ne répond plus depuis 01 h 44 (signalé au pilote).

**`/artisan/missions/[interventionId]`**

- Le h1 reste la catégorie d'incident.
- Lien d'itinéraire vers Google Maps (choix de fournisseur non tranché, hors périmètre).
- Vue dans l'état « dates proposées, en attente du locataire » (seul état du jeu de données).

**`/artisan/missions/[interventionId]/compte-rendu`**

- « Continuer — le bilan » reste un <a> (e2e/artisan-fin-mission.spec.ts le cherche par son nom exact).
- Onglet « Photo du travail » différent du h1.
- Vue dans l'état « intervention non démarrée » ; les zones de photo ne s'affichent pas dans cet état.

**`/artisan/missions/[interventionId]/compte-rendu/bilan`**

- Bandeau « Photo du travail réalisé : envoyée. » et libellé de retour « La photo » laissés.
- Non capturable avec les données actuelles : la garde de la page redirige vers la fiche de mission (intervention non démarrée / non terminée). Changements de classes seulement, vérifiés par eslint et tsc.

**`/artisan/missions/[interventionId]/creneaux`**

- Le texte de l'avertissement n'est pas modifié.

**`/artisan/missions/[interventionId]/facture`**

- Non capturable avec les données actuelles : la garde de la page redirige vers la fiche de mission (intervention non démarrée / non terminée). Changements de classes seulement, vérifiés par eslint et tsc.

**`/artisan/note`**

- Route /artisan/note, menu « Mes évaluations » (noms laissés).

**`/artisan/panne`**

- « Réessayer » reste un lien vers /artisan.
- Nouvel en-tête vu à 1440 px ; pas à 375 px. Dernière passe de captures impossible : le serveur de développement du port 3200 ne répond plus depuis 01 h 44 (signalé au pilote).

**`/artisan/regles`**

- Le retour reste « ← Mon entreprise » même quand on arrive par le menu.
- Vue sans règle publiée (état vide).

**`(garde) Conditions de l'espace artisan — rendue par le layout à la place d'une page`**

- Vue à 1440 px avec la persona agent (compte sans fiche artisan). Dernière passe de captures impossible : le serveur de développement du port 3200 ne répond plus depuis 01 h 44 (signalé au pilote).

### Textes laissés tels quels parce qu'un test automatique les vérifie

- Classes lues par tests/artisan-ergonomie-des-b.test.ts : bg-[var(--marque)], bg-[var(--ivoire)], border-2, min-h-14, min-h-12, inline-flex, items-center, min-[1000px]:hidden — conservées dans les constantes de ui.tsx et dans clients/.
- tests/artisan-agenda-jour-paris.test.ts : la case du jour doit porter bg-[var(--marque-clair)] — j'étais passé à --survol, je suis revenu en arrière.
- tests/illustrations-referencees.test.ts : /illustrations/quartier-gerimmo-2026.jpg doit rester référencée dans src/ — je l'avais retirée du menu, elle est revenue en repli hors écran, sous un voile écrit en jetons.
- tests/ui-clavier-et-rail.test.ts : règles « .content :global(.artisan-liste) { display: grid; grid-template-columns: minmax(0, 1fr) » (avant le premier @media) et « .page { display: grid; grid-template-columns: minmax(0, 1fr) » en tête de devis.module.css — conservées.
- tests/audit-oct28-rendu.test.ts : « <details …><summary>Interventions indisponibles » sans attribut sur <summary> — aucune classe ajoutée.
- tests/audit-artisan-public-ecrans-2026-09-27.test.ts : nav-artisan.tsx doit contenir "/artisan/panne" — l'entrée « Aide en cas de problème » est laissée.
- Suites de mots lues telles quelles par tests/artisan-prive-affichage, artisan-avoir-ecran, artisan-prive-facture-relecture, artisan-exclusion-ecran-et-action : « Client externe · {nom} · {état} », « Rendez-vous actuel : … », « {numéro} · {client} », « Facturé … · Déclaré reçu … · Solde … », <dt>…</dt><dd> — je n'ai ajouté que des classes.
- Noms exacts cherchés par e2e/ (parcours-artisan, artisan-fin-mission, devis-reprise, lot2-artisan, protection-saisie) : libellés de champ, boutons, liens (« Créer un chantier et son devis », « Continuer — le bilan », « Autres actions », « La mission »…) et titres — inchangés ; la flèche du retour est aria-hidden pour ne pas changer le nom du lien.
- h1 inchangés partout (« Aujourd'hui », « Mes clients externes », « Lecture momentanément impossible », « Conditions de l’espace artisan »…).

## Supervision, relais, veille (96)

**`/admin`**

- Vu à 1440 px : onglet « Clients et abonnements » dans son état final. Onglet « Encaissements et coûts » (tableau Stripe retouché) non capturé. Non regardé à 375 px.
- /admin n'est pas l'accueil de la console (c'est /admin/brief) : routage hors périmètre
- onglets internes OngletsDossier (composant partagé avec d'autres espaces) non retouchés
- les indicateurs de revenus restent dans la section repliée « Revenus, répartition et prochaines échéances » (libellé vérifié par tests/ux-abonnements-admin) : non déplacés
- le titre d'onglet garde son suffixe écrit à la main (exigé par tests/titres-de-page)

**`/admin/artisans`**

- Regardé à 1440 px dans un état intermédiaire (avant la réécriture de relation-clients.module.css et le retrait du surtitre) ; non recapturé ensuite (serveur de développement 3200 arrêté à 01 h 44). Non regardé à 375 px.
- h1 « Réseau d’artisans » identique à /admin/couverture : les deux sont vérifiés par e2e (reseau-couverture.spec.ts) et c'est le nom de l'entrée de menu
- la validation reste au bas de chaque carte d'inscription (ordre des trois étapes conservé)

**`/admin/autonomie`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- une seule route sert deux entrées de menu (?vue=dossiers / ?vue=ameliorations) : structure non modifiée
- le nom de route « autonomie » et le paramètre « equipe » restent (routes hors périmètre)

**`/admin/brief`**

- Regardé à 1440 px dans un état intermédiaire (vue d'ensemble seulement, après les modules CSS et avant les retouches du composant (surtitre, colonne d'appui, ValeurVivante)) ; non recapturé ensuite (serveur de développement 3200 arrêté à 01 h 44). Non regardé à 375 px.
- l'entrée de menu dit « Vue d’ensemble » et le h1 « Aujourd’hui » : les DEUX sont vérifiés par e2e (navigation-matin.spec.ts lignes 11 et 36) et le menu vit dans src/lib (hors périmètre)
- en vue d'ensemble, le détail reste dans la section repliée « Détails » (e2e console-clients.spec.ts clique son titre pour l'ouvrir)
- pour un jour passé, le h1 reste « Bureau de direction » alors que l'onglet dit « Aujourd’hui »

**`/admin/brief/[equipe]`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.

**`/admin/clients`**

- Vu à 1440 px : vue « Personnes » dans son état final. Vue « Espaces et entreprises » (constat de contraste) non recapturée : correction faite dans les jetons, non remesurée avec axe. Non regardé à 375 px.
- trois niveaux de navigation (menu, onglets de rubrique, sous-onglets) : structure non modifiée
- jusqu'à trois paginations en vue « tous »

**`/admin/clients/artisans/[artisanId]`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- la décision et l'entrée dans l'espace restent dans leurs sections (gestes sensibles : non déplacés)
- commentaire d'en-tête du fichier périmé (voir alerte_securite)

**`/admin/clients/personnes/[personId]`**

- Vu à 1440 px dans son état final. Non regardé à 375 px.

**`/admin/comptes/[accountId]`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- le h1 reste l'adresse e-mail du compte (vérifié par e2e support-bailleur.spec.ts)
- vocabulaire « second facteur », « adhésion » conservé (gestes de sécurité et tests e2e)
- deux journaux longs sans pagination

**`/admin/conservation`**

- Regardé à 1440 px dans un état intermédiaire (avant la règle qui ramène les titres de liste à la taille des titres de carte) ; non recapturé ensuite (serveur de développement 3200 arrêté à 01 h 44). Non regardé à 375 px.
- la confirmation de sortie avec saisie non enregistrée reste une boîte native du navigateur (logique)

**`/admin/consignes`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- les deux paragraphes d'introduction et les libellés des boutons sont vérifiés par tests/consigne-activation-ecran et e2e supervision-consignes : inchangés
- pas de hiérarchie entre activer / refuser / suspendre (libellés protégés)

**`/admin/couverture`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- h1 « Réseau d’artisans » gardé (e2e reseau-couverture.spec.ts) : même titre que /admin/artisans
- département 91 et métier « plomberie » par défaut (logique)
- au téléphone le tableau défile dans son cadre (pas de variante en cartes)

**`/admin/devis`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- ni filtre ni pagination (requête inchangée)
- la route s'appelle toujours « devis »

**`/admin/donnees`**

- Vu à 1440 px dans son état final. Non regardé à 375 px.
- la procédure en six étapes garde sa rédaction juridique

**`/admin/equipes`**

- Regardé à 1440 px dans un état intermédiaire (avant le retrait du surtitre et le renommage du bouton d'en-tête) ; non recapturé ensuite (serveur de développement 3200 arrêté à 01 h 44). Non regardé à 375 px.
- h1 « Automatismes et consignes » (e2e equipes.spec.ts) alors que l'onglet de rubrique dit « Tâches automatiques »
- vocabulaire missions / tâches / passages

**`/admin/journaux`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- le filtre « type » attend toujours un code interne (filtres vérifiés par e2e navigation-matin)
- liens GitHub comme preuve de sauvegarde

**`/admin/liste-attente`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- ni filtre par statut ni pagination

**`/admin/marketing`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- jargon « veto », « Phase éditoriale », « Meta Ads » (libellés liés aux actions et aux tests)
- le canal « Instagram — Non proposé » reste affiché
- réglages en bas de page dans un repli

**`/admin/marque-blanche`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- limite silencieuse à 100 agences (requête)
- étapes rédigées pour un profil technique

**`/admin/organisations/[orgId]`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- aucun lien vers le support de la même organisation : la page de support est réservée au superviseur permanent, l'afficher demanderait une condition d'accès (non touchée)
- huit sections repliables sans ordre de priorité

**`/admin/organisations/[orgId]/support`**

- Regardé à 1440 px dans un état intermédiaire (avant le retour du triangle natif sur le résumé de chaque appel) ; non recapturé ensuite (serveur de développement 3200 arrêté à 01 h 44). Non regardé à 375 px.
- introuvable depuis la console (voir fiche organisation)

**`/admin/organisations/nouvelle`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- le mot « organisation » reste (bouton et e2e)

**`/admin/parametres`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- compteur « N / M fournis » inchangé (tests/console-identite-mediateur)
- « Ouvrir une organisation » toujours rangé ici aussi

**`/admin/publications`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- regroupement par état appliqué à une seule page de résultats
- vocabulaire « journal »

**`/admin/publications/[id]`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- cinq actions de nature différente dans l'éditeur
- l'erreur Facebook peut s'afficher deux fois

**`/admin/publications/nouvelle`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.

**`/admin/relais`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- quatre sujets dans un écran, dont la limite des appels IA
- section « Règles notées… non appliquées automatiquement » (texte vérifié par tests/arret-urgence-ecrans)

**`/admin/retours`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.

**`/admin/sante`**

- Regardé à 1440 px dans un état intermédiaire (avant la fusion des deux barres d'ancres et les libellés en clair) ; non recapturé ensuite (serveur de développement 3200 arrêté à 01 h 44). Non regardé à 375 px.
- libellés de pastilles en minuscules (« à l'heure », « en retard ») vérifiés par tests/sante-cycle-mensuel
- paragraphe sur les trois e-mails d'alerte vérifié par tests/relais-alerte-ecrans
- page longue (une dizaine de sections)

**`/admin/securite`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- droits de délégation affichés bruts (pas de dictionnaire de libellés dans src/lib)
- les cartes d'accès répètent les onglets de la rubrique

**`/admin/territoire`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- h1 « Développement commercial » = entrée de menu, onglet de rubrique « Développement territorial » (src/lib)
- écran très long ; la tuile « Départements présents » apparaît deux fois

**`/admin/territoire/prospects/[id]`**

- Vu à 1440 px en création (« nouveau ») ; fiche d'un prospect existant non capturée. Non regardé à 375 px.
- historique brut « avant → après »

**`/admin/veille`**

- Non capturé après modification (serveur de développement 3200 arrêté à 01 h 44) : validé par eslint, tsc et les tests seulement. Non regardé à 375 px.
- le repli de décision reste fermé à l'arrivée (e2e finalisation.spec.ts clique pour l'ouvrir)

**`/relais`**

- Vu à 1440 px dans son état final. Non regardé à 375 px.
- page hors coquille ; les cartes de familles ne sont pas cliquables (données de la fonction resume_relais_supervision)
- aucune date de fin de délégation affichée

**`/veille`**

- Vu à 1440 px avec la persona locataire (état final). Non capturé avec agent ni artisan. Non regardé à 375 px.
- page servie hors de la coquille de l'espace (routage hors périmètre) ; le lien « ← Revenir à mon espace » est vérifié par e2e

### Textes laissés tels quels parce qu'un test automatique les vérifie

- /admin/brief : h1 « Aujourd’hui » (e2e navigation-matin, console-clients) ET entrée de menu « Vue d’ensemble » (e2e navigation-matin) ; titre de section « Détails » ; lien « Donner une consigne » ; structure main > header > bouton « Préparer le point | Actualiser »
- /admin/couverture et /admin/artisans : h1 « Réseau d’artisans » (e2e reseau-couverture) ; « Aucune ouverture n’est à décider »
- /admin/equipes : h1 « Automatismes et consignes » ; « Mettre en pause », « Reprendre », « Lancer maintenant », « Aucune exécution enregistrée. » (e2e equipes)
- /admin/consignes : h1, titre « Créer une consigne », les deux paragraphes d'introduction, « Activer la version N », « Refuser cette version », « Suspendre les nouvelles exécutions », « Reprendre explicitement », « Préparer une révision », « Historique des versions précédentes » (e2e supervision-consignes, tests/consigne-activation-ecran, tests/consigne-sans-tache)
- /admin/sante : pastilles « à l'heure », « en retard », « arrêt d’urgence » ; « pg_cron », « sauvegarde-et-restauration », « GERIMMO_RELAIS_EMAILS », « veto », « Cet écran ne prévient personne », phrases sur les e-mails du relais (tests/sante-cycle-mensuel, relais-alerte-ecrans, relais-alerte-suivi)
- /admin/parametres : « N / M fournis » et les phrases sur l'identité et le médiateur (tests/console-identite-mediateur)
- /admin/relais : « Règles notées pour mon absence — non appliquées automatiquement », titre « Préparer une absence », « Délai d’absence et consignes », libellés du plan de continuité (tests/arret-urgence-ecrans, e2e equipes, e2e supervision-consignes)
- /admin/veille : « Relire la présentation aux utilisateurs et décider », « Valider et informer les utilisateurs », « Écarter ou retirer » (e2e finalisation) — le repli reste donc fermé à l'arrivée
- /admin/liste-attente : « N en attente · N inscrite(s) » suivi de la balise fermante, « Impossible de charger la page », « Opposition enregistrée : ne lui écrivez pas. », formulaire d'export (tests/liste-attente-agences-console, e2e console-liste-attente)
- /admin/clients : h1 « Utilisateurs », « Espaces et entreprises », « Personnes trouvées », « Aucun utilisateur trouvé », « Effacer les filtres », « Inscriptions à valider » (e2e utilisateurs, console-clients)
- /admin/comptes/[id] : h1 = adresse e-mail (e2e support-bailleur) ; /admin/conservation : « Historique des durées », « Catégories de conservation », « Enregistrer la durée » (e2e conservation-reglages)
- /admin (finances) : onglets « Clients et abonnements » / « Encaissements et coûts », titre « Encaissements et coûts réels », « Revenus, répartition et prochaines échéances » (e2e utilisateurs, tests/ux-abonnements-admin) ; suffixe « — Gerimmo » écrit dans le titre (tests/titres-de-page)
- /veille : lien « ← Revenir à mon espace », « Tout voir », aria-label « Informations par public » (e2e navigation-matin, tests/veille-onglets)
- menu de la console : libellés et nombre d'entrées (tests/rubriques-supervision, src/lib/rubriques-supervision.ts hors périmètre)

## Pages publiques (36)

**`/`**

- Aucun data-appel-inscription ajouté sur cette page : ses appels sont des liens isolés vers /inscription et /connexion, déjà masqués par la règle commune (vérifié avec html[data-depuis-espace]).
- ValeurVivante non posée : l'accueil public n'a pas de chiffre réel (l'aperçu du tableau de bord est une image fictive) et le prix du simulateur est déjà annoncé par sa zone aria-live atomique ; l'envelopper aurait doublé l'annonce.
- Sous 600 px l'en-tête garde « Se connecter » et le menu ; « Créer mon compte » reste dans le menu et dans le héros (comportement inchangé).
- La section #agences reste imbriquée dans #espaces (balisage vérifié par tests/vitrine-agences.test.ts).
- Les prix restent recopiés dans la FAQ et le simulateur (hors champ : aucune modification de prix).

**`/tarifs`**

- La mention de taxes est toujours affichée deux fois et l'indentation du JSX reste irrégulière : non touché (page dont le texte est vérifié ligne à ligne par tests/vitrine-agences.test.ts et tests/essai-deux-mois.test.ts).
- Aucun prix, aucune offre, aucun état d'ouverture modifié.

**`/agences`**

- États d'erreur et de succès du formulaire non déclenchés à l'écran (ils écrivent en base) ; leur rendu serveur est couvert par tests/vitrine-agences.test.ts, vert.

**`/outils/calcul-irl`**

- Le champ d'adresse et sa liste de suggestions viennent de src/components/outils/champ-adresse.tsx, partagé avec l'espace agence : non modifié (voir demandes_communes).

**`/journal`**

- État vide non visible sur le banc (un article publié).
- Une panne de lecture s'affiche toujours comme une liste vide (logique de requête, hors champ).
- L'illustration de repli (public/illustrations/journal-repli.svg, partagée avec l'espace propriétaire) est en bleu vif dégradé, hors palette : voir demandes_communes.

**`/journal/[slug]`**

- La colonne « sources » lue en base n'est toujours pas affichée (contenu, hors champ).

**`/conditions`**

- Seul le haut de la page (titre, encadré, trois premiers articles) a été regardé sur les captures ; le reste n'a été vérifié que par mesure (aucun débordement à 375 px, aucun saut de niveau de titre).
- Les liens « Informations officielles » du tableau des prestataires font 16 px de haut : ils sont dans le balisage empreinté, non touché.
- Toujours ni sommaire ni ancres (interdits dans l'élément marqué).
- L'encadré « Document en cours de finalisation » garde sa classe de bord gauche rouge, sans effet à l'écran (la règle commune des cartes l'emporte).

**`/conditions/artisans`**

- Seul le haut de la page a été regardé ; le reste par mesure.
- Mêmes liens de tableau de 16 px que /conditions (balisage empreinté).

**`/conditions/versions`**

- Le banc n'a aucune version archivée : la liste des versions et leur empreinte n'ont pas été vues à l'écran.

**`/conditions/versions/[document]/[version]`**

- NON CAPTURÉE : aucune version n'est archivée sur le banc (toute adresse répond 404). Changement limité à un lien ; rendu couvert par tests/conditions-versions-pages.test.ts, vert.
- Dans les états d'erreur la page n'a toujours pas de h1 (il vient du texte archivé).

**`/confidentialite`**

- Regardés : le haut de la page et le tableau des prestataires aux deux largeurs ; le reste par mesure.
- Liens « Informations officielles » de 16 px dans les tableaux (composant partagé avec le texte empreinté des conditions).
- Toujours ni sommaire ni ancres.

**`/mentions-legales`**

- Les deux liens de fin doublent toujours le pied de page (non retirés).

**`/connexion`**

- Aucune validation, redirection ni message d'erreur modifié.
- Pas de lien vers les pages légales depuis cet écran : non ajouté (ce serait de la navigation, pas de la présentation).

**`/inscription`**

- La liste « Vous louez en tant que » garde ses classes : la règle commune des champs lui donne déjà hauteur, filet et rayon (vu : alignée sur les champs voisins).
- États « société » et « message de confirmation » non déclenchés à l'écran.

**`/mot-de-passe-oublie`**

- Message de succès non déclenché à l'écran (il envoie un courriel).

**`/nouveau-mot-de-passe`**

- FORMULAIRE NON VU : sans session de récupération la page renvoie vers /connexion?raison=lien-invalide ; c'est cet écran (connexion avec son message d'attention) qui a été capturé et regardé. Le formulaire lui-même n'a reçu que deux changements de classe.
- Formulaire de première activation toujours long dans une colonne de 340 px (structure et champs hors champ).

**`/auth/confirmer`**

- Seul l'état « lien incomplet » est visible sans jeton ; les états « lien prêt » et « cookie manquant » n'ont pas été vus.
- Le champ e-mail natif de l'état « sans adresse » garde ses classes (présentation donnée par la règle commune des champs).

**`/auth/confirm`**

- Gestionnaire de route sans écran (vérification du jeton et redirections) : rien à harmoniser, non modifié.

### Textes laissés tels quels parce qu'un test automatique les vérifie

- src/app/page.tsx : id="contact" className="… scroll-mt-…" (tests/audit-artisan-public-ecrans-2026-09-27.test.ts) — je l'avais retiré, je l'ai rétabli ; test vert.
- src/app/page.tsx : section #agences (sur-titre, h2, lien btn-secondaire), « Essayer nos outils gratuits », aria-labelledby="outils-gratuits", « Commencez par {duree} d'essai gratuit, sans carte bancaire. », questions de la FAQ (tests/vitrine-agences, outils-routes, essai-deux-mois).
- src/app/agences/page.tsx : className="public-page-intro", <p className="eyebrow">Agences de gestion</p>, <h1>Gerimmo pour les agences arrive.</h1>, puces <li><Check aria-hidden />… (en préparation) (tests/vitrine-agences.test.ts) — fichier laissé intact.
- Formulaires de contact et de liste d'attente : ordre et attributs des champs, pot de miel class="hidden", data-saisie-libre, role="alert", libellés, bouton, phrase d'information (tests/vitrine-agences.test.ts, e2e/agences.spec.ts).
- src/components/chrome-public.tsx : ["/outils", "Outils gratuits"], ["/conditions", "Conditions générales"], ["/agences", "Agences"] dans le pied seulement, NAVIGATION.map(, <MenuPublicMobile liens={NAVIGATION} /> ; menu mobile : aria-label="Navigation mobile", liens.map(, classe .public-menu-mobile (tests/outils-routes, vitrine-agences, pages-legales ; e2e/vitrine.spec.ts).
- src/components/outils/coquille-outil.tsx : href="/inscription", « Créer mon compte — {duree} d'essai », {badgeEssai()}, const duree = dureeEssai(); (tests/outils-routes, essai-deux-mois ; e2e/outils.spec.ts).
- Outils : h1 « Outils gratuits », h2 portant le nom de chaque outil, data-testid des résultats, cibles de 44 px dans main, pied et appel masqués à l'impression (e2e/outils.spec.ts).
- Simulateur de tarif : région « Simuler mon abonnement », .offre-prix, boutons Mensuel/Annuel, lien « Commencer mon essai gratuit » (e2e/vitrine.spec.ts) — composant non modifié.
- src/components/coquille-auth.tsx : <h1>{titre}</h1> sans classe (« <h1>Connexion</h1> », tests/connexion-squelette-cls.test.ts), logo en tuile (tests/marque-tuile.test.ts).
- Formulaires d'authentification : <AlerteFormulaire>, aucun <p role="alert"> écrit à la main, titres d'onglet distincts, bouton « Chargement… » (tests/formulaires-auth-focus-titres, connexion-attente-chargement, lien-mot-de-passe).
- src/app/tarifs/page.tsx : article « Agences de gestion » à deux puces et son lien (tests/vitrine-agences.test.ts).
- Conditions : texte et balisage de l'élément marqué (tests/conditions-empreinte, conditions-v1-textes, conditions-versions-archivage) ; href="/conditions/versions" hors de cet élément.

## Pages transversales (3)

**`/compte`**

- La marque affichée dans l'en-tête fait 84 px de haut : l'en-tête est plus haut que celui des espaces.

**`/compte/donnees`**

- Pas d'en-tête de marque sur cet écran (la marque dépend de l'agence du locataire ; non repris ici pour ne pas ajouter de requête).

**`/espaces`**

- Les comptes fictifs du banc n'ont qu'un espace : l'écran redirige aussitôt, il n'a pas pu être regardé.

## Composants partagés (18)

**`composant RappelsLoyers — src/components/rappels-loyers.module.css`**

- États vus sur banc seulement : le jeu d'essai n'a aucun loyer à confirmer. À revoir sur un parc avec loyers en retard.
- Les fonds d'état des jetons -soft sont plus soutenus que les teintes d'origine (voir demandes_communes).

**`composants de dépenses, charges et relevés — src/components/consommations.module.css`**

- La page d'un décompte et la carte d'un relevé attendu n'ont été vues que sur banc : le jeu d'essai n'a ni facture ni relevé demandé.
- Le résumé « Calcul à vérifier » reste étroit à 375 px quand le texte est long (géométrie d'origine, élargie par flex-basis).

**`parcours par étapes — src/components/presentation-parcours.module.css`**

- L'assistant de bail (.parcoursBail) et le formulaire d'une personne n'ont pas été ouverts : le bail du jeu d'essai est signé. Ils partagent les mêmes règles que les écrans vus.
- Dans /agence/[orgId]/parc/formulaire-bien.tsx (hors lot), l'avis « Votre saisie sera conservée… » garde un fond bleuté (bg-primary/5).

**`carte « à vérifier » — src/components/carte-verifications.module.css`**

- 4 hexadécimaux conservés parce que tests/carte-verifications.test.ts les lit dans la feuille.
- Composant sans appelant : à supprimer ou à rebrancher (voir demandes_communes).
- Sur le banc à 375 px, l'icône de la carte rouge recouvre le début de son libellé : la classe d'indicateur de l'accueil (refaite depuis par l'agent de l'espace) place maintenant l'icône en absolu, et la règle « sous 600 px » de cette feuille retire la marge qui lui faisait place. Sans effet aujourd'hui (aucun appelant) ; à reprendre si la carte est rebranchée.

**`lecteur de document — src/components/lecteur-document.module.css`**

- La présentation en ligne dans /espace/[orgId]/documents (propriétaire) n'a pas été vue : le jeu d'essai du propriétaire n'a aucun document.

**`B1 — TitreEcran, src/components/titre-ecran.tsx`**

- /admin/veille garde « journal » (journal : une veille d'actualité, pas un emprunt).
- /admin/artisans et /admin/couverture inchangés : le menu de la console montre déjà la clé pour « Réseau d'artisans ».

**`B2 — SuiviEcheanciersCharges, src/components/suivi-echeanciers-charges.tsx`**

- Vu sur banc seulement, faute d'échéancier dans le jeu d'essai.

**`B4 — AideInvitation, src/components/aide-invitation.tsx`**

- Le gabarit CoquilleAuth de ces deux écrans affiche toujours le logo Gerimmo (voir demandes_communes).

**`B4 — AssistantPrive, src/components/assistant-prive.tsx`**

- Non corrigé : ce n'est pas faisable par un simple paramètre de l'appelant. e2e/assistant-prive.spec.ts exige « Demander à Gerimmo » et « Envoyer à Gerimmo » pour le locataire d'Agence Alpha (agence sans marque propre) : le texte neutre doit donc dépendre de la marque du portail, que /locataire/[orgId]/contact ne lit pas. Correctif décrit dans demandes_communes.

**`B5 — ChampFichier, src/components/champ-fichier.tsx`**

- L'espace artisan encadre le champ (classe passée par ses pages), l'agence non : le composant est le même, l'écart vient des appelants. À arbitrer si l'on veut un seul dessin.

**`B5 — EtapesSaisie, src/components/etapes-saisie.tsx`**

- /agence/[orgId]/profil n'active pas le parcours par étapes pour les personas du banc : non vu sur cet écran.

**`B5 — EchangesIntervention (« Discussion de l'intervention »), src/components/echanges-intervention.tsx`**

- Le titre reste un <h3> : sur la mission de l'artisan il suit des cartes en <h2>, sans saut de niveau.

### Textes laissés tels quels parce qu'un test automatique les vérifie

- carte-verifications.module.css : « button.carte[data-importante='true'] { background: #9d343b; border-color: #8b2930; » et « 0%, 100% { background-color: #9d343b; border-color: #8b2930; » — tests/carte-verifications.test.ts lit ces deux paires d'hexadécimaux dans la feuille et vérifie qu'elles sont égales. 4 hexadécimaux conservés ; la déclaration « animation: respirationAlerte 2.4s ease-in-out 2; » et sa place dans la requête média sont inchangées.
- AssistantPrive : « Demander à Gerimmo » (tests/conversation-privee.test.ts, e2e/assistant-prive.spec.ts) et « Envoyer à Gerimmo » (e2e/assistant-prive.spec.ts, profils propriétaire ET locataire d'Agence Alpha). Composant non modifié.
- AideInvitation : « Copier mon message » et href="/assistance?type=probleme#nouvelle" (tests/ux-invitations-premiere-connexion.test.ts) : inchangés. Les mots « invitation Gerimmo », « lien Gerimmo », « assistance Gerimmo » ne figurent dans aucun test.
- rappels-loyers.module.css est injectée telle quelle par tests/feuilles-espaces-navigateur.test.ts (classes carte, entete, compteur, ligne, resume, identite, titreLigne, prioritaire, arriere, montant, total, signale, succes, precision, et contrôle de contraste axe) : noms de classe inchangés, contraste vert.
- onglets-dossier.module.css (tests/dossiers-mobiles-navigateur, tests/ux-fiche-logement-navigateur) et lecteur-document.module.css (tests/lecteur-document-navigateur) sont injectées dans des bancs SANS les jetons : les replis hexadécimaux sont retirés et les 21 tests restent verts.
- EtapesSaisie : sélecteur « [data-corps-etapes] > h2 » (e2e/local/fuite-trois-acteurs.ts) : attribut et structure conservés.
- « Ajouter une facture » (lien et bouton, e2e/consommations-patrimoine.spec.ts, e2e/contre-audit-proprietaire.spec.ts) : inchangé ; seul le niveau du titre « Facture et informations » change (aucun test ne le cible).
- Aucun test ne lit les attributs rubrique="…" ni les titres de SuiviEcheanciersCharges ; tests/titres-hierarchie-espaces.test.ts (39 <h2 titre-carte>, aucun <h3> dans les pages) n'est pas touché : les pages ne reçoivent qu'un paramètre.
