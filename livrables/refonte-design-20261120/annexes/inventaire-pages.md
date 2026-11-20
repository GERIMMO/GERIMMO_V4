# Annexe A — Inventaire exhaustif des pages

Une fiche par page : à quoi elle sert, qui y accède, son action principale, les constats de l'audit du code, puis ce qui a été fait et vérifié.

Priorité : **P1** = écran d'un parcours quotidien (accueil, loyers, documents, incidents, connexion…) ; **P2** = au moins quatre constats ; **P3** = le reste. Les constats viennent de la lecture du code de chaque page (20/11/2026) ; l'état vient du parcours navigateur après modification.

## Espace de gestion et espace propriétaire (agence, propriétaire particulier, SCI) — 36 pages

### 1. `/agence/[orgId]` — Bonjour {prénom}

- **But** : Tableau de bord : dire ce qu'il y a à traiter aujourd'hui (plan du jour), puis les chiffres clés ; le propriétaire direct reçoit un accueil entièrement distinct (accueil-proprietaire.tsx).
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P1 · **Constats** : 5
  - Deux accueils sans parenté visuelle sur la même route : classes globales « tuiles / assistant » pour l'agence, module CSS à couleurs en dur pour le propriétaire.
  - H1 « Bonjour {prénom} » nu (pas de TitreEcran) : le mot du menu « Tableau de bord » n'apparaît nulle part à l'écran.
  - Trois noms pour la même liste : tuile « À faire », section « À traiter aujourd'hui », entrée de menu « Alertes », lien « Tout voir ».
  - Jargon dans les tuiles et rangs : « à qualifier — votre décision lance la suite », « appelés », « Prêt à publier », « Blocages illisibles ».
  - Côté propriétaire, l'essentiel est replié dans 4 <details> empilés ; côté agence, 16 liens écrits en dur /agence/${orgId}/… au lieu de baseEspace.

### 2. `/agence/[orgId]/abonnement` — Mon abonnement

- **But** : Afficher l'état de l'abonnement, la formule et son prix, souscrire, changer de périodicité, accéder aux factures et à la résiliation (deux variantes d'écran selon la grille tarifaire : abonnement-2026.tsx ou abonnement-historique.tsx).
- **Accès** : admin_agence ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Gérer mon abonnement (portail de paiement) une fois abonné ; sinon formulaire de souscription « Choisir la périodicité »
- **Priorité** : P2 · **Constats** : 5
  - Deux implémentations complètes du même écran (756 et 454 lignes) : présentation différente selon l'organisation.
  - Gabarit différent selon le rôle (colonne étroite agence, page large propriétaire).
  - Page très longue : formule, services inclus, signature électronique, mentions légales et médiateur noient l'action principale.
  - Sorties vers /conditions et /assistance qui quittent la coquille sans chemin de retour.
  - L'agent reçoit une page introuvable (notFound) au lieu d'un message « réservé au responsable ».

### 3. `/agence/[orgId]/abonnement/resiliation` — Résilier votre contrat

- **But** : Récapituler le contrat et sa date de fin, puis notifier la résiliation pour la prochaine échéance (seul chemin de résiliation).
- **Accès** : admin_agence ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Notifier la résiliation
- **Priorité** : P2 · **Constats** : 4
  - Pas de lien retour « ← Mon abonnement » en tête : il n'existe que dans les états vides.
  - Vocabulaire mêlé : « contrat » dans le titre, « abonnement » partout ailleurs, « Espace » pour l'organisation.
  - Classe .montant (chiffres) appliquée à des valeurs textuelles du récapitulatif.
  - Paragraphe de conséquences en gris secondaire (text-muted-foreground) alors qu'il porte l'information la plus lourde.

### 4. `/agence/[orgId]/abonnement/retractation` — Renoncer au contrat

- **But** : Déclarer la rétractation de l'abonnement (ou du passage à l'annuel) pendant le délai légal, avec rappel du contrat visé et du texte de la déclaration.
- **Accès** : admin_agence ; proprietaire_direct ; superadmin permanent (saisie pour le compte du client)
- **Action principale** : Confirmer la rétractation
- **Priorité** : P2 · **Constats** : 4
  - Pas de lien retour vers « Mon abonnement » en tête de page.
  - Trois verbes proches pour l'utilisateur : « renoncer », « se rétracter », « résilier ».
  - Blocs de texte juridique longs en gris secondaire ; renvoi aux conditions en 12 px.
  - Le texte de la déclaration est affiché entre guillemets dans un paragraphe, sans mise en forme de citation.

### 5. `/agence/[orgId]/administration` — Administration

- **But** : Voir l'équipe de l'agence et le portefeuille de chacun, inviter un agent, repérer les lots sous mandat confiés à personne, résumer l'abonnement.
- **Accès** : admin_agence ; superadmin_lecture_seule
- **Action principale** : Ajouter un agent
- **Priorité** : P2 · **Constats** : 5
  - Titres de carte en <h3> directement sous le H1 (Profil utilise <h2 class=titre-carte>) : hiérarchie de titres incohérente.
  - Les membres ne sont identifiés que par leur adresse e-mail, sans nom.
  - L'action « Ajouter un agent » est au bas de la première carte, sans bouton dans l'en-tête.
  - La carte « Abonnement de l'agence » double l'écran Abonnement ; « Lots sous mandat actif » et « Lots facturés » côte à côte prêtent à confusion.
  - Jargon : « portefeuille », « mandat laissé à Toute l'agence », « Confié à ».

### 6. `/agence/[orgId]/agenda` — Agenda

- **But** : Calendrier mensuel des rendez-vous d'intervention des artisans, plus deux listes : « Dates à confirmer » et « À vérifier ».
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - Deux rendus différents de la même page selon le rôle (onglets .dossier-nav d'un côté, cartes à icônes de l'autre).
  - L'onglet « À vérifier » ne dit pas quoi vérifier ; « Dates à confirmer » désigne en fait des missions sans rendez-vous.
  - Aucun moyen d'ajouter un rendez-vous : l'état vide doit l'expliquer en quatre lignes.
  - Calendrier à 7 colonnes sur téléphone, où une case ne montre qu'un chiffre.
  - Niveaux de titre variables dans les états vides (h3 en vue calendrier, h2 dans les deux autres vues).

### 7. `/agence/[orgId]/alertes` — Alertes (agence) / À faire (propriétaire) / Alertes du client (superadmin)

- **But** : Lister tout ce qui attend un geste (baux à débloquer, rapports de gestion à valider, alertes), le traiter, et créer un rappel personnel.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : + Créer une alerte (bouton d'en-tête visible sous 768 px seulement ; carte latérale au-delà ; <details> « Créer un rappel » côté propriétaire)
- **Priorité** : P2 · **Constats** : 5
  - Le titre et le vocabulaire changent selon le rôle : Alertes / À faire / rappel / demande / action prioritaire.
  - Mention d'en-tête surchargée (« 5 à traiter · 2 sur les baux et rapports, 3 alertes ») suivie d'une phrase « par quoi commencer ».
  - Action de création absente de l'en-tête sur ordinateur (carte latérale) et repliée dans un <details> côté propriétaire.
  - Trois listes de natures différentes à la suite (baux, rapports, alertes) puis un historique : difficile de voir où commencer.
  - Alertes « confiées à d'autres » grisées en bas de la même liste.

### 8. `/agence/[orgId]/artisans` — Carnet d'artisans

- **But** : Consulter les artisans rattachés à l'organisation (actifs, désactivés, liste noire), ouvrir leur fiche et en enregistrer un nouveau ; le propriétaire direct a un carnet d'invitations distinct (carnet-proprietaire.tsx).
- **Accès** : admin_agence ; agent (lecture, ne désactive pas) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : + Enregistrer un artisan (agence) / + Inviter un artisan (propriétaire)
- **Priorité** : P2 · **Constats** : 5
  - Même icône de rubrique et de menu que « Incidents » (TitreEcran rubrique=incidents, icône « outil ») : on ne distingue pas les deux écrans.
  - Bouton secondaire « Vérifier le réseau pour mes biens » posé dans un paragraphe entre l'en-tête et la liste.
  - Deux puces empilées par rang et vocabulaire d'initié : « SIRET vérifié », « Validation Gerimmo », « Liste noire », « Décennale ».
  - Le formulaire de création est dans la colonne de droite : sur téléphone il arrive après toute la liste (ancre).
  - Deux écrans sans rapport selon le rôle (carnet d'agence scindé / carnet d'invitations du propriétaire).

### 9. `/agence/[orgId]/baux/[bailId]` — {nom du lot} (repli : « Fiche du bail ») — surtitre « Contrat de location · {type} »

- **But** : Dossier complet d'un bail : assistant de création par étapes tant qu'il est en brouillon, puis onglets Contrat / Documents / Suivi / Départ (loyers, dépôt, états des lieux, congé, restitution).
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule (onglets de consultation)
- **Action principale** : variable selon l'état : étapes de l'assistant (brouillon) ; sinon liste « Prochaine action » (liens-ancres numérotés)
- **Priorité** : P1 · **Constats** : 5
  - Le H1 est le nom du lot, identique au H1 de la fiche du lot : on ne sait pas si l'on est sur le bail ou sur le logement.
  - 1 296 lignes et environ 25 formulaires : trois modes (assistant, onglets, consultation) réunis dans un seul écran.
  - Vocabulaire mêlé : « bail », « contrat », « location » (« Contrat de location », « Bail signé · location non activée »).
  - Lien retour avec repli « ← Mes lots » même pour une agence ; les quittances s'ouvrent sur /quittance, hors de la coquille.
  - Actions lourdes (congé, restitution du dépôt, avenant) cachées dans des sections dépliantes de l'onglet « Départ » ou « Contrat ».

### 10. `/agence/[orgId]/baux/[bailId]/edl/[edlId]` — État des lieux d'entrée / État des lieux de sortie

- **But** : Saisir un état des lieux en quatre étapes (Informations, Les pièces, Compteurs et clés, Validation) puis générer le PDF à faire signer.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule (EdlConsultation)
- **Action principale** : Générer le PDF
- **Priorité** : P2 · **Constats** : 4
  - H1 nu, sans TitreEcran ni en-tête de fiche commun aux autres dossiers.
  - Puce « Signé — figé » et encadré « grille générique / régénérer » : vocabulaire d'outil.
  - Colonne max-w-3xl pour une grille de saisie à plusieurs colonnes, à vérifier sur téléphone.
  - « Générer le PDF » existe à deux endroits (en-tête si signé, étape Validation sinon) ; le lien « Démarrer la restitution du dépôt » est un simple lien souligné.

### 11. `/agence/[orgId]/comptabilite` — Écritures & rapports de gestion (agence) / Livre recettes-dépenses (propriétaire)

- **But** : Tenir le livre : journal des écritures et exports, saisie d'une écriture, clôture d'un mois, rapports de gestion aux propriétaires mandants.
- **Accès** : admin_agence ; agent (sans l'onglet Clôture) ; proprietaire_direct (sans l'onglet Rapports) ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P1 · **Constats** : 5
  - Quatre noms pour le même écran : menu « Écritures & rapports », H1 « Écritures & rapports de gestion », lien « la comptabilité » depuis Loyers, aria-label « Comptabilité ».
  - « Ajouter une écriture » est une action présentée comme un onglet (et la carte s'appelle « Saisir une écriture »).
  - Tuiles « Recettes / Dépenses / Net depuis l'origine » sans période, à expliquer dans un dépliant.
  - Jargon comptable : « pièce », « date d'imputation », « clôture », « quittancement », « annulation hors journal ».
  - Côté propriétaire, le lien « ← Finances » est dans la barre de titre à côté du H1 au lieu d'être au-dessus comme les autres retours.

### 12. `/agence/[orgId]/comptabilite/fiscal` — Revenus {année} — déclaration en {année+1}

- **But** : Aider le propriétaire à préparer sa déclaration de revenus fonciers : récapitulatif par exercice, situations fiscales des détenteurs, export (rendu par components/recapitulatif-fiscal.tsx).
- **Accès** : proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Exporter les montants (CSV)
- **Priorité** : P2 · **Constats** : 5
  - Le H1 ne reprend ni le titre d'onglet (« Récapitulatif fiscal ») ni les liens qui y mènent (« Fiscalité », « Préparer ma déclaration », « Déclaration fiscale »).
  - H1 nu sans TitreEcran et largeur max-w-4xl propre à cet écran.
  - Lien retour en min-h-9 (36 px) alors que les autres retours de l'espace font 44 px.
  - Jargon fiscal non expliqué (2044, périmètre, qualification, détenteur).
  - Contenu dupliqué avec la section « Déclaration fiscale » de l'écran Finances.

### 13. `/agence/[orgId]/comptabilite/reprise` — Reprendre mes comptes

- **But** : Importer la balance d'ouverture (dépôts, soldes locataires, provisions, fonds propriétaires) depuis un fichier : gabarit, contrôle, puis bascule définitive.
- **Accès** : admin_agence ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Contrôler la balance (dans FormulaireReprise), précédé de « Télécharger le gabarit »
- **Priorité** : P2 · **Constats** : 5
  - Jargon comptable dense : « balance d'ouverture », « bascule », « écart nul », « écritures rectificatives ».
  - L'utilisateur doit recopier des codes techniques (valeurs du champ « type ») dans son tableur.
  - Beaucoup de texte à lire avant d'atteindre l'action ; la carte « À savoir avant de basculer » arrive après le formulaire.
  - Le lien retour (« Livre recettes-dépenses » / « Écritures & rapports ») ne correspond pas exactement au H1 de la page parente.
  - Une lecture en échec de l'historique des reprises n'est pas signalée.

### 14. `/agence/[orgId]/diagnostics/[diagnosticId]` — —

- **But** : Page de renvoi sans rendu : depuis une alerte de diagnostic, redirige vers la fiche du bien ou du lot, ancre #diagnostics.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P3 · **Constats** : 0

### 15. `/agence/[orgId]/documents` — Documents (« Déposer un document » sur la vue de dépôt du propriétaire)

- **But** : Bibliothèque de tous les documents (baux, diagnostics, quittances, justificatifs) : filtrer, ouvrir la fiche d'un document, en déposer un.
- **Accès** : admin_agence ; agent (portefeuille) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : + Déposer un document (« + Déposer » côté propriétaire)
- **Priorité** : P1 · **Constats** : 5
  - Deux interfaces distinctes selon le rôle : liste à plat + vue d'ensemble pour l'agence, liste groupée par bien + fiche plein écran pour le propriétaire.
  - Libellés d'action différents pour la même chose : « + Déposer » / « + Déposer un document », « Préparer » / « Préparer un document ».
  - Filtres en champs natifs stylés à la main, de hauteur 36 px, différents des champs des autres écrans (44 px).
  - Jargon : « purgé », « rattachement », « Le type pilote seul les droits d'accès et la durée de conservation ».
  - Rangs de liste chargés (titre, rattachement, type, taille, puces de signature et d'échéance) dans une colonne étroite.

### 16. `/agence/[orgId]/documents/catalogue` — Préparer un document

- **But** : Choisir une situation puis un modèle de document, puis le dossier (bail, lot, personne) pour lequel le générer.
- **Accès** : admin_agence ; agent (modèles comptables masqués) ; proprietaire_direct (famille « Mandats et agence » masquée) ; superadmin_lecture_seule
- **Action principale** : Choisir → (carte de situation), puis « Choisir un dossier → », puis FormulaireCatalogue
- **Priorité** : P2 · **Constats** : 5
  - Trois styles de lien retour sur la même page : « ← Documents » gris, « ← Choisir un autre document » en couleur primaire, « ← Changer de situation » souligné.
  - Cartes en classes utilitaires avec deux rayons différents au lieu du composant Card.
  - Les modèles « En préparation » restent cliquables et mènent à une impasse.
  - Largeur max-w-6xl alors que la page parente Documents est en max-w-5xl.
  - Message d'erreur en text-destructive nu, sans l'encart .err utilisé ailleurs.

### 17. `/agence/[orgId]/faq` — Aide

- **But** : Aide du propriétaire direct : questions fréquentes filtrables et, à la suite, ses échanges avec le support (ContenuAssistance intégré).
- **Accès** : proprietaire_direct ; superadmin_lecture_seule (organisation de propriétaire)
- **Action principale** : Contacter Gerimmo (ancre #nouvelle)
- **Priorité** : P2 · **Constats** : 4
  - Deux systèmes d'aide selon le rôle : cette page intégrée pour le propriétaire, lien « Aide et retours » vers /assistance (hors coquille) pour l'agence.
  - Adresse /faq, entrée de menu et H1 « Aide », contenu qui mêle FAQ, support et boîte à idées : quatre objets sur un écran.
  - Assemblage de deux feuilles de style de zones différentes : en-têtes et cartes hétérogènes sur la même page.
  - Un agent ou un admin d'agence qui suit ce lien reçoit une page introuvable.

### 18. `/agence/[orgId]/incidents` — Incidents

- **But** : Suivre les incidents : liste filtrée (En cours, À traiter, Clos, Tous) et dossier complet de l'incident sélectionné dans le volet de droite.
- **Accès** : admin_agence ; agent (portefeuille) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Déclarer un incident
- **Priorité** : P1 · **Constats** : 5
  - Feuille incidents.css propre à la zone (143 couleurs en dur) : en-tête et filtres ne ressemblent à aucune autre liste de l'espace (.incidents-entete au lieu de .entete-page).
  - Largeur max-w-7xl et bascule mobile à 1100 px, quand les autres vues scindées sont en max-w-5xl et 900 px.
  - Jargon : « à qualifier », « imputation », « Devis à décider », « À attribuer », « Suivi par jdupont » (début d'adresse e-mail).
  - Rang de liste très chargé : numéro, date, titre, lot, jusqu'à trois puces et le suivi.
  - Sur ordinateur le premier dossier s'ouvre d'office, sur téléphone non : comportement différent pour la même adresse.

### 19. `/agence/[orgId]/incidents/[incidentId]` — —

- **But** : Ancienne adresse de la fiche incident : redirige vers la liste avec le dossier sélectionné (/incidents?sel=…).
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P3 · **Constats** : 1
  - Côté agence, la redirection retombe sur le filtre par défaut « En cours » : un incident clos s'ouvre dans le volet de droite sans figurer dans la liste affichée à gauche.

### 20. `/agence/[orgId]/incidents/nouveau` — Déclarer un incident

- **But** : Saisir un incident sur un lot (logement, pièce, bail concerné, description) pour ouvrir le dossier de suivi.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : bouton d'envoi du FormulaireIncident
- **Priorité** : P2 · **Constats** : 4
  - Carte d'explication au ton juridique : « imputation », « justification opposable », « repère juridique ».
  - La phrase d'aide est hors de l'en-tête commun, dans un enrobage propre à la page.
  - La carte latérale passe sous le formulaire sur téléphone : l'explication arrive après la saisie.
  - Le libellé de l'action principale n'est pas visible dans la page (porté par le composant client).

### 21. `/agence/[orgId]/journal` — Le journal Gerimmo

- **But** : Lister les articles publiés par Gerimmo (actualités et conseils), paginés par 12.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P3 · **Constats** : 3
  - Page absente du menu : aucune entrée ne s'allume, on n'y arrive que par les articles de l'accueil.
  - Lien retour stylé par le module (styles.retour), différent du retour gris standard des autres sous-pages.
  - Contenu éditorial dans l'espace de gestion, avec une largeur (max-w-6xl) différente des écrans voisins.

### 22. `/agence/[orgId]/journal/[slug]` — {titre de l'article}

- **But** : Lire un article du journal Gerimmo.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P3 · **Constats** : 3
  - Aucune entrée de menu active pendant la lecture.
  - Titre d'onglet générique « Article du journal » au lieu du titre de l'article.
  - Lien retour et largeur propres au module (styles.retour, max-w-4xl), différents des autres sous-pages ; H1 nu sans icône de rubrique.

### 23. `/agence/[orgId]/lots/[lotId]` — —

- **But** : Page de renvoi sans rendu : retrouve le bien d'un lot et redirige vers sa fiche (section ?vers=…, formulaire ouvert si ?modifier=1).
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P3 · **Constats** : 1
  - Lot introuvable ou illisible : retour à la liste sans aucun message.

### 24. `/agence/[orgId]/loyers` — Loyers & charges (agence) / Finances (propriétaire, components/page-finances.tsx)

- **But** : L'écran du mois : ce qui est dû, encaissé, restant, avec les gestes encaisser / envoyer les quittances / relancer ; le propriétaire a un écran « Finances » à trois rubriques (Loyers, Dépenses, Bilan de l'année) et sa déclaration.
- **Accès** : admin_agence ; agent (portefeuille) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : agence : aucun bouton d'en-tête (gestes dans la carte QuittancementMois) ; propriétaire : « Ajouter une dépense »
- **Priorité** : P1 · **Constats** : 5
  - Même adresse, deux écrans et deux noms : « Loyers & charges » pour l'agence, « Finances » pour le propriétaire.
  - H1 nu sans TitreEcran côté agence : seul écran de premier niveau sans icône de rubrique.
  - Paragraphe d'introduction de quatre phrases contenant deux ou trois liens en ligne.
  - Jargon de gestionnaire : « appelé », « termes de loyer », « quittancer », « couvert sur la période ».
  - Côté propriétaire : plus de six <details> imbriqués et une grille de trois chiffres côte à côte sur téléphone.

### 25. `/agence/[orgId]/mandats` — Mandats & versements

- **But** : Vue de contrôle des mandats de gestion en cours : mandant, nombre de lots, dernier rapport de gestion et état du versement.
- **Accès** : admin_agence ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 4
  - Écran sans aucune action : générer, envoyer et verser se font sur la fiche du mandant, ce que l'introduction doit expliquer.
  - Jargon : « mandant », « rapport de gestion », « versement à émettre », « validé ».
  - Bandeau d'attention en or, différent des encadrés warning des autres pages pour le même rôle.
  - Un mandat ne se crée pas ici : l'état vide renvoie vers Personnes sans dire quelle fiche ouvrir.

### 26. `/agence/[orgId]/messages` — Messages

- **But** : Voir les conversations avec les locataires et leurs messages non lus ; le propriétaire dispose d'une messagerie complète (lecture et réponse sur place, discussions d'interventions, assistant).
- **Accès** : admin_agence ; agent (portefeuille) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : agence : aucune (chaque rang ouvre la fiche de la personne) ; propriétaire : « Nouveau message »
- **Priorité** : P2 · **Constats** : 4
  - Côté agence on ne peut ni lire ni répondre ici : chaque conversation renvoie à la fiche de la personne, et une note de bas de page doit le justifier.
  - Deux expériences sans rapport selon le rôle pour la même entrée de menu.
  - Onglets du propriétaire dessinés avec des boutons d'action (btn-or = onglet actif, btn-secondaire = inactif).
  - Aucun bouton pour démarrer une conversation côté agence.

### 27. `/agence/[orgId]/parc` — Parc de l'agence (admin) / Mon portefeuille (agent) / Biens & locations (propriétaire)

- **But** : Lister les biens et leurs lots avec leur avancement, ouvrir un bien ou un lot, et donner la vue d'ensemble (loués, en préparation, loyers).
- **Accès** : admin_agence ; agent (portefeuille) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : + Ajouter un bien
- **Priorité** : P1 · **Constats** : 5
  - Trois façons d'ouvrir un élément : un bien s'ouvre dans le panneau de droite, un lot dans une fenêtre modale, et chez le propriétaire dans une page ; une phrase d'aide doit l'expliquer.
  - Titre d'onglet « Parc » différent des trois H1 ; vocabulaire flottant bien / lot / logement / parc / portefeuille.
  - Le « Catalogue d'équipements » (un réglage) est replié tout en bas de la liste.
  - Rang de lot sur quatre lignes (nom, type et surface, adresse, barre d'avancement) dans une colonne de 380 px.
  - Deux rendus complets selon le rôle, avec des branches propriétaire mortes dans le code de la vue agence.

### 28. `/agence/[orgId]/parc/[bienId]` — {nom du bien}

- **But** : Fiche d'un bien (immeuble, maison, appartement) : ses lots, ses caractéristiques, ses diagnostics, sa clé de répartition, ses consommations et ses incidents (rendu par fiche-bien.tsx, 648 lignes).
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - En-tête propre à cette fiche (.bien-visuel-entete), différent de ceux du lot, du bail et de la personne.
  - Badge « Au parc » / « Retiré du parc » et termes « clé de répartition », « découpage » : vocabulaire d'outil.
  - Pas d'action principale : deux boutons de navigation contour (« Documents du bien », « Finances du bien ») ; pour l'agence, « Finances du bien » mène aux loyers de tout le parc.
  - Le même composant sert de page et de panneau intégré dans /parc (titre h1 ou h2 selon le cas).
  - Titre d'onglet générique « Fiche bien ».

### 29. `/agence/[orgId]/parc/[bienId]/lots/[lotId]` — {nom du lot} (« Compléter le lot » en mode ?parcours=1)

- **But** : Fiche complète d'un logement : résumé, caractéristiques, propriétaires, pièces et équipements, diagnostics, baux, charges, incidents ; sert aussi de parcours de complétion par étapes.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : propriétaire : « Commencer un bail » (ou action contextuelle en tête) ; agence : « Modifier » (LienModifierLot)
- **Priorité** : P2 · **Constats** : 5
  - 942 lignes et deux jeux d'onglets différents selon le rôle (5 onglets propriétaire, 4 onglets agence).
  - Lien retour « ← Mon portefeuille » affiché aussi à l'admin d'agence, dont le menu dit « Parc de l'agence ».
  - Jargon : « détention », « quote-part », « appel de charges ventilé récupérable / non récupérable ».
  - Actions importantes cachées dans des <details> : « Gérer le statut du lot », « Gérer la propriété », « Gérer cette détention ».
  - Trois modes sur la même adresse (fiche, ?modifier=1, ?parcours=1) ; largeur max-w-7xl propre à cet écran.

### 30. `/agence/[orgId]/parc/import` — Reprendre le parc (agence) / Importer mes lots (propriétaire)

- **But** : Importer un parc existant depuis un tableur (une ligne par lot) : télécharger le gabarit, contrôler le fichier, puis importer.
- **Accès** : admin_agence ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Télécharger le gabarit (bouton plein), puis « Importer » dans FormulaireImport
- **Priorité** : P2 · **Constats** : 5
  - Le bouton plein de la page est « Télécharger le gabarit » et non l'import ; la page sœur « Reprendre mes comptes » fait le choix inverse.
  - Lien retour « ← Mes lots » alors que le menu du propriétaire dit « Biens & locations ».
  - Titre d'onglet « Import des lots » différent des deux H1 ; « reprendre » et « importer » désignent la même opération.
  - Carte « Importer en trois temps » sans que les trois temps soient visibles avant d'avoir choisi un fichier.
  - Largeur max-w-2xl unique dans l'espace.

### 31. `/agence/[orgId]/parc/nouveau` — Créer un lot (agence) / Ajouter un bien (propriétaire) — surtitre « Nouveau logement »

- **But** : Créer un bien et son ou ses lots par un formulaire à étapes avec brouillon local ; pour le propriétaire, vérifie d'abord le profil bailleur et la capacité de la formule.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : « Créer le bien et son lot unique » / « Créer le lot et continuer » (FormulaireBien) ; « Compléter mon profil » si le profil est incomplet
- **Priorité** : P2 · **Constats** : 4
  - Quatre mots pour le même objet sur un écran : « Nouveau logement », « Créer un lot », « Ajouter un bien », « Créer le bien et son lot unique ».
  - Liens retour incohérents avec le menu : « ← Mes lots » pour le propriétaire (menu : « Biens & locations »), « ← Parc de l'agence » même pour l'agent (menu : « Mon portefeuille »).
  - En-tête de parcours (module CSS) différent de l'en-tête commun .entete-page et de TitreEcran.
  - Un encart tarifaire s'intercale avant le formulaire pour le propriétaire qui dépasse sa formule.

### 32. `/agence/[orgId]/personnes` — Personnes (second H1 « Créer une fiche » dans la vue de création)

- **But** : Annuaire des personnes (propriétaires, mandants, locataires, garants) avec leurs rôles déduits, et création d'une fiche par étapes.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Créer une fiche
- **Priorité** : P1 · **Constats** : 4
  - Deux <h1> dans la même page (liste et création, l'une masquée) et une création qui ne change pas d'adresse lisible.
  - Vocabulaire : « personne », « fiche », « Retour à mes fiches », « dossier » pour le même objet.
  - Gabarit de page (pageCreation) différent du max-w-5xl des autres listes : la largeur change en arrivant.
  - Rôles affichés en puces longues (« Locataire · bail en préparation », « Fiche à rattacher… »).

### 33. `/agence/[orgId]/personnes/[personId]` — {nom de la personne}

- **But** : Dossier d'une personne : identité, biens et baux, justificatifs, messages, mandats de gestion, accès à l'espace locataire.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - 982 lignes : jusqu'à six cartes et une colonne de repères sur un seul écran.
  - Navigation interne par ancres maison, alors que les fiches lot et bail utilisent des onglets.
  - Carte « Mandats de gestion » très dense (états, dates, lignes de lots, documents, boutons).
  - Pas d'action principale ; l'archivage est caché dans un dépliant « Autres actions ».
  - Jargon : « mandat », « ligne de mandat », « détention », « attestation », « pièces demandées ».

### 34. `/agence/[orgId]/profil` — Profil de l'agence (agence) / Paramètres (propriétaire) / Profil du propriétaire (superadmin)

- **But** : Renseigner l'identité de l'organisation reprise sur les documents, les réglages d'envoi, le parrainage et la signature préenregistrée.
- **Accès** : admin_agence ; agent (lecture seule) ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Enregistrer mon profil
- **Priorité** : P2 · **Constats** : 5
  - Trois noms pour l'écran : titre d'onglet « Profil », H1 « Paramètres » ou « Profil de l'agence » selon le rôle.
  - Titres en double dans les dépliants : résumé « Parrainage — 2 filleuls » puis H2 « Parrainage » et sa mention.
  - Le parrainage (commercial) est mêlé à l'identité légale et à la signature.
  - Pour l'agent, « Mon compte » du menu sort vers /compte tandis que ce profil lui est présenté en lecture seule.
  - D'autres écrans pointent vers des ancres de cette page (#quittances, #envois) qui sont enfouies dans le formulaire.

### 35. `/agence/[orgId]/reseau` — Réseau d'artisans pour mes biens

- **But** : Vérifier quels artisans du réseau Gerimmo couvrent l'adresse d'un bien pour un métier et une nature de travaux, et signaler son intérêt.
- **Accès** : admin_agence ; agent ; proprietaire_direct ; superadmin_lecture_seule
- **Action principale** : Rechercher des artisans
- **Priorité** : P2 · **Constats** : 5
  - Page absente du menu : on n'y arrive que depuis le carnet d'artisans ou la fiche d'un lot.
  - Titre à la première personne (« pour mes biens ») même pour une agence.
  - Parcours différent selon le rôle sur le même écran : deux étapes numérotées pour le propriétaire, un formulaire unique pour l'agence.
  - La recherche n'aboutit à aucune action : il faut ensuite « ouvrir l'incident concerné » pour demander un devis.
  - Champs en classes utilitaires locales et jusqu'à cinq messages d'erreur possibles sur l'écran.

### 36. `/agence/[orgId]/statistiques` — Statistiques

- **But** : Mesurer les incidents : part résolue sous 15 jours, délai moyen de clôture, répartition de qui paie, coût des interventions, lots les plus signalés.
- **Accès** : admin_agence ; agent (portefeuille) ; proprietaire_direct (hors menu) ; superadmin_lecture_seule
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - Le titre promet des statistiques générales alors que l'écran ne mesure que les incidents : une phrase en tête doit s'en excuser et renvoyer ailleurs.
  - Aucun filtre de période : tous les chiffres portent sur tout l'historique.
  - Jargon : « imputation », « coût constaté », « écart devis → réalisé », « pas encore qualifié ».
  - Les jauges disparaissent sous 640 px (hidden sm:block) : il ne reste que des chiffres.
  - Écran accessible au propriétaire mais sans entrée dans son menu.

## Supervision, relais et veille — 35 pages

### 37. `/admin` — Abonnements et finances

- **But** : Suivre les abonnements des organisations clientes, les revenus et échéances, puis les encaissements Stripe et les coûts des services.
- **Accès** : Super-administrateur actif (adhésion super_admin + second facteur AAL2) : garde du proxy et de admin/layout.tsx, sinon redirection vers /espaces. Aucune garde propre à la page.
- **Action principale** : Ouvrir une organisation (bouton or) ; secondaire : Actualiser
- **Priorité** : P1 · **Constats** : 5
  - L'adresse racine /admin n'est pas l'accueil de la console (c'est /admin/brief) mais l'écran finances : repère trompeur.
  - Les indicateurs de revenus sont cachés dans une section repliée, sous la liste des clients.
  - Onglets internes (OngletsDossier) différents des onglets de rubrique de la coquille : deux systèmes d'onglets.
  - Tableau Stripe à 6 colonnes sans variante carte pour le téléphone ; onglet trésorerie en utilitaires Tailwind, onglet abonnements en module : deux rendus dans la même page.
  - Seul titre d'onglet navigateur avec suffixe écrit à la main (« — Gerimmo »).

### 38. `/admin/artisans` — Réseau d’artisans

- **But** : Examiner les inscriptions d'artisans en attente (SIRET, justificatifs, zone), les valider ou les refuser, et retrouver les décisions déjà prises.
- **Accès** : Super-administrateur actif (layout) + contrôle is_super_admin dans la page (affiche « Accès réservé à la supervision » sinon).
- **Action principale** : Couverture du réseau (bouton or de l'en-tête) ; l'action métier réelle, la validation, est dans chaque carte (DecisionArtisan)
- **Priorité** : P2 · **Constats** : 5
  - Même h1 « Réseau d’artisans » que /admin/couverture : deux écrans, un seul titre.
  - Le bouton or de l'en-tête est une navigation vers l'onglet voisin ; l'action principale (valider) se trouve au bas d'une carte longue.
  - Carte d'inscription très dense : trois sous-sections, pastilles, mentions en petit, bloc de refus replié.
  - Colonne latérale décorative qui répète des liens déjà présents (couverture, annuaire).
  - Textes à 10–11 px (surtitres, filtres) et palette en dur, hors jetons de la charte.

### 39. `/admin/autonomie` — Activité et dossiers (ou « Améliorations du produit » avec ?vue=ameliorations)

- **But** : Deux écrans dans un fichier : la file des prochaines actions sur les dossiers clients (lecture seule) et le suivi des propositions de correction ou d'évolution du produit à autoriser.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Actualiser les prochaines étapes (vue dossiers) ; aucune en vue améliorations (boutons de décision dans chaque proposition)
- **Priorité** : P2 · **Constats** : 5
  - Une seule route sert deux entrées de menu ; sans ?vue les deux sections s'empilent sous le titre « Activité et dossiers ».
  - Nom de route « autonomie » et paramètre « equipe » utilisé comme filtre de catégorie : vocabulaire hérité, sans rapport avec les libellés.
  - Rupture de style entre le haut (module, tuiles) et la section « Corrections et idées » (carte nue en utilitaires).
  - Les cartes font sortir de la console vers l'espace du client ; seul un paragraphe en bas de liste le dit.
  - Tuiles « urgentes » et « à débloquer » calculées sur les 25 dossiers affichés, mention en petit facile à manquer.

### 40. `/admin/brief` — Aujourd’hui (ou « Décisions à prendre », « Équipes et comptes rendus », « Bureau de direction » pour un jour p

- **But** : Accueil de la console : état du service, décisions en attente, comptes rendus des équipes et historique sur 14 jours, en trois vues (?vue=decisions, ?vue=equipes).
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Préparer le point / Actualiser (vue d'ensemble du jour) ; Donner une consigne (bouton or des deux autres vues)
- **Priorité** : P1 · **Constats** : 5
  - Trois entrées de menu rendues par un seul fichier à conditions imbriquées ; le h1 change selon la vue et la date et ne reprend jamais le libellé de menu « Vue d’ensemble ».
  - En vue d'ensemble, tout sauf le résumé est enfermé dans une section repliée « Détails » : équipes et décisions à un clic de plus.
  - Densité : tuiles, file, poste de commande, relais, équipes, faits, historique ; slogans décoratifs (« Gardez la main. », « Partez l’esprit plus tranquille. »).
  - Même compteur nommé « Demandes à examiner », « Sujets à traiter », « Décisions à prendre » et « À traiter » (bandeau).
  - Balise <aside> imbriquée dans une <aside> ; surtitre « Gerimmo / Direction générale » sans utilité.

### 41. `/admin/brief/[equipe]` — Équipe {nom de l'équipe}

- **But** : Détail du compte rendu quotidien d'une équipe : décisions soumises, résultats, incidents et passages ; l'ouvrir le marque comme lu.
- **Accès** : Super-administrateur actif (layout) ; notFound si l'équipe est inconnue.
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 4
  - Titre d'onglet navigateur « Point du matin d’une équipe », h1 « Équipe X », lien retour « Équipes et comptes rendus » : trois noms.
  - La section « Résultats », cœur du compte rendu, est repliée par défaut.
  - Statut « N incidents » non accordé (« 1 incidents »).
  - Aucune action dans l'en-tête ; les deux boutons utiles sont tout en bas.

### 42. `/admin/clients` — Utilisateurs

- **But** : Annuaire de la plateforme : par défaut les personnes (comptes, fiches, rôles) ; avec ?vue=espaces les organisations (agences, propriétaires) et les artisans, avec recherche et filtres.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Ouvrir une organisation (vue espaces seulement) ; Rechercher en vue personnes
- **Priorité** : P1 · **Constats** : 4
  - Trois niveaux de navigation : menu latéral, onglets de rubrique (Utilisateurs / Personnalisation des agences), sous-onglets Personnes / Espaces.
  - Vocabulaire instable : « Utilisateurs », « clients » (liens retour), « Espaces et entreprises », « organisations », « annuaire ».
  - Le bouton « Ouvrir une organisation » n'existe que dans la vue espaces ; en vue personnes l'en-tête ne porte qu'un compteur.
  - Jusqu'à trois paginations indépendantes sur la même page en vue « tous ».

### 43. `/admin/clients/artisans/[artisanId]` — {raison sociale de l'artisan}

- **But** : Fiche d'un artisan : entreprise, justificatifs, agences clientes, décision d'inscription, historique, et entrée tracée dans son portail.
- **Accès** : Super-administrateur actif (layout + is_super_admin dans la page, sinon /espaces).
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - Lien retour « ← Tous les clients » vers l'annuaire alors que la rubrique active du menu est « Réseau d’artisans ».
  - Compteurs orphelins : un chiffre seul dans un « entete-carte » sans titre en haut de section.
  - Pas d'action dans l'en-tête ; la décision est dans la quatrième section, l'entrée dans l'espace tout en bas.
  - Le texte promet un accès « en lecture seule » alors que le commentaire du fichier décrit une session avec écritures : promesse à clarifier.
  - Bandeaux d'alerte composés à la main (bordure + fond) au lieu d'un composant commun.

### 44. `/admin/clients/personnes/[personId]` — {prénom nom de la personne}

- **But** : Fiche minimale d'une personne sans compte : coordonnées, rattachement, renvois vers l'organisation et le compte.
- **Accès** : Superviseur permanent uniquement (is_permanent_super_admin, sinon notFound).
- **Action principale** : Ouvrir l’espace d’origine (bouton secondaire)
- **Priorité** : P2 · **Constats** : 4
  - Lien retour sans classe alors que les autres fiches utilisent « lien-discret » ; pas d'en-tête commun ni de sous-titre.
  - h1 vide si la personne n'a ni prénom ni nom.
  - « Ouvrir l’espace d’origine » mène à la fiche console de l'organisation, pas à l'espace.
  - Deux boutons collés sans conteneur ni espacement ; écran d'erreur rendu hors gabarit.

### 45. `/admin/comptes/[accountId]` — {adresse e-mail du compte}

- **But** : Fiche de diagnostic d'un compte : état de connexion, mois offerts, blocage et second facteur, rôles et espaces, journal des actions et événements techniques.
- **Accès** : Super-administrateur actif (layout + is_super_admin, sinon /espaces) ; la lecture ne rend rien à une supervision déléguée (notFound).
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - Le h1 est une adresse e-mail (longue, peu lisible au téléphone) ; l'onglet navigateur dit « Fiche d’un compte ».
  - Jargon : « second facteur », « adhésion », « Fiche console », « Événements techniques ».
  - Compteurs doublés : statut dans le bandeau de section + puce orpheline dans le corps.
  - Deux journaux longs sans pagination ni filtre.
  - Aucune action dans l'en-tête ; les gestes sont répartis dans des sections repliées.

### 46. `/admin/conservation` — Durées de conservation

- **But** : Régler la durée de conservation de chaque catégorie de données, avec motif, et consulter l'historique des changements.
- **Accès** : Superviseur permanent (is_permanent_super_admin) ; sinon redirection vers /admin/donnees.
- **Action principale** : Enregistrer la durée (dans ReglagesConservation)
- **Priorité** : P2 · **Constats** : 4
  - En-tête hors gabarit : pas d'icône de rubrique ni de filet, contrairement aux pages voisines.
  - Lien retour « ← Paramètres généraux » alors que la page est un onglet de « Sécurité et conformité ».
  - Messages d'erreur sans le style « err » commun.
  - Confirmation par boîte native du navigateur.

### 47. `/admin/consignes` — Consignes du dirigeant

- **But** : Rédiger, versionner, activer ou refuser et suspendre des consignes (tâches de lecture), puis suivre leurs exécutions et leur historique.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Créer une consigne (section repliée contenant le formulaire)
- **Priorité** : P2 · **Constats** : 5
  - Introduction très technique (« lire deux compteurs », « toucher un droit », distinction « activer » / « approuver »).
  - En-tête sans gabarit : titre, deux paragraphes et un lien nu empilés.
  - Boutons de commande sans hiérarchie (activer, refuser, suspendre au même niveau) et libellés lourds (« Suspendre les nouvelles exécutions », « Reprendre explicitement »).
  - État vide et états de version rendus en simples paragraphes, sans puce ni couleur.
  - Titre d'onglet navigateur « Consignes » alors que le h1 et l'onglet de rubrique disent « Consignes du dirigeant ».

### 48. `/admin/couverture` — Réseau d’artisans

- **But** : Constater la couverture du réseau d'artisans par département, métier et commune, ainsi que la demande exprimée (intérêts).
- **Accès** : Super-administrateur actif (layout + is_super_admin dans la page, sinon message « Accès réservé à la supervision »).
- **Action principale** : Afficher la couverture (formulaire) ; en-tête : Artisans à valider (secondaire)
- **Priorité** : P2 · **Constats** : 5
  - h1 et titre d'onglet identiques à /admin/artisans.
  - Département 91 et métier « plomberie » par défaut, codés en dur : l'écran s'ouvre sur un cas arbitraire.
  - Deux blocs d'explication (paragraphe d'en-tête + bandeau) avant tout contenu.
  - Tableau en défilement horizontal au téléphone, sans variante carte.
  - Trois paginations en liens soulignés nus, sans numéro de page cohérent.

### 49. `/admin/devis` — Demandes de contact

- **But** : Traiter les messages reçus par le formulaire de contact du site : lire, orienter la suite, marquer traité.
- **Accès** : Super-administrateur actif (layout ; RLS en garde de fond).
- **Action principale** : Marquer traitée (dans chaque demande)
- **Priorité** : P2 · **Constats** : 4
  - Route « devis » et icône de rubrique « finances » pour des demandes de contact : étiquetage incohérent.
  - Ni filtre ni pagination ; les demandes traitées sont seulement grisées à 60 %.
  - L'erreur de lecture a l'apparence d'un état vide.
  - Pas d'action dans l'en-tête, seulement un compteur.

### 50. `/admin/donnees` — Demandes sur les données

- **But** : File privée des demandes sur les données personnelles (accès, effacement, fermeture de compte) : répondre, programmer une fermeture, contrôler les archives et simuler le nettoyage.
- **Accès** : Super-administrateur actif (layout + is_super_admin, sinon /espaces) ; la programmation d'une fermeture est réservée au superviseur permanent.
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - Trois noms : onglet « Demandes sur les données », titre navigateur « Données personnelles et fermeture des comptes », bouton « Données personnelles » depuis l'assistance.
  - En-tête hors gabarit (pas de TitreEcran) et lien retour vers /admin/securite alors que la page est un onglet de cette rubrique.
  - Bascule d'état en boutons secondaires, mêlée à deux liens sans rapport (durées, sauvegarde).
  - Procédure en six pavés très juridiques et techniques (Zoho, Stripe, corbeille, sauvegardes).
  - Aucune action d'en-tête ; les gestes sont au bas de chaque carte.

### 51. `/admin/equipes` — Automatismes et consignes

- **But** : Surveiller les tâches automatiques, lire leur dernière exécution, les mettre en pause ou les lancer ; atelier de corrections et mesures de l'automatisation.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Mes consignes (bouton or) ; secondaire : Actualiser
- **Priorité** : P2 · **Constats** : 5
  - h1 « Automatismes et consignes » alors que l'onglet actif s'appelle « Tâches automatiques » et que les consignes ont leur page ; ailleurs l'écran est nommé « Commandes des équipes » ou « Travail des équipes ».
  - Vocabulaire mêlé : missions, tâches, passages, exécutions, équipes.
  - Le bouton or est une navigation ; les vraies actions (pause, lancer) sont dans la troisième colonne de chaque ligne.
  - « Détails techniques » omniprésents et note de bas de section technique (200 derniers passages).
  - Atelier de corrections et mesures rangés ici, loin de « Améliorations du produit ».

### 52. `/admin/journaux` — Historique et sauvegardes

- **But** : Retrouver une action sensible, un incident du travail automatique ou une consultation de document, vérifier les preuves de sauvegarde, et gérer les règles de conservation et le nettoyage manuel.
- **Accès** : Super-administrateur actif (layout + is_super_admin, sinon /espaces).
- **Action principale** : Filtrer (bouton or du formulaire) ; en-tête : Vérifier la sauvegarde (secondaire)
- **Priorité** : P2 · **Constats** : 5
  - Les trois journaux sont repliés par défaut : la page d'historique s'ouvre sans une ligne d'historique.
  - Le filtre « type » attend un fragment de code interne et un repli affiche « Code interne : … ».
  - Quatre sujets dans un écran : journaux, preuves de sauvegarde, règles de conservation, purge manuelle.
  - Liens GitHub comme preuve de sauvegarde : outil de développeur dans un écran de dirigeant.
  - L'erreur de lecture ressemble à un état vide.

### 53. `/admin/liste-attente` — Liste d’attente des agences

- **But** : Suivre les agences inscrites sur la liste d'attente du site, noter où en est le contact et exporter la liste en CSV.
- **Accès** : Super-administrateur actif (layout ; RLS en garde de fond).
- **Action principale** : Exporter en CSV (bouton secondaire) ; par agence : Marquer comme contactée
- **Priorité** : P2 · **Constats** : 4
  - Introduction d'environ 90 mots mêlant mode d'emploi, règles d'opposition et journal d'audit.
  - Ni filtre par statut ni pagination ; les lignes closes sont seulement grisées.
  - Aucune action principale mise en avant (tout est en bouton secondaire).
  - L'erreur de lecture ressemble à un état vide.

### 54. `/admin/marketing` — Marketing et contenus

- **But** : Piloter la communication : contenus à relire, posts programmés avec droit de veto, intentions éditoriales, canaux reliés, réglages automatiques et résultats publicitaires Meta.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Créer un article (bouton or) ; secondaire : Tous les articles
- **Priorité** : P2 · **Constats** : 5
  - Page très dense : sept blocs et deux repliables ; surtitres en capitales de 10 px sur chaque panneau.
  - Jargon : « veto », « Phase éditoriale », « Meta Ads », « intentions éditoriales ».
  - Un canal « Instagram — Non proposé » est affiché alors qu'il n'existe pas.
  - Tableau Meta sans style commun ni variante téléphone.
  - Les réglages, pourtant structurants, sont dans un repli en bas de page.

### 55. `/admin/marque-blanche` — Personnalisation des agences

- **But** : Voir, agence par agence, l'état du domaine personnalisé et de l'adresse d'envoi des e-mails, et lancer leur vérification.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Vérifier (par agence, seulement s'il y a quelque chose à vérifier)
- **Priorité** : P2 · **Constats** : 4
  - Route « marque-blanche », titre « Personnalisation des agences » : deux noms.
  - Limite silencieuse à 100 agences, sans recherche ni pagination.
  - Étapes rédigées pour un profil technique (hébergeur, nom de domaine, domaine d'envoi).
  - La plupart des cartes disent « rien à vérifier » : beaucoup de lecture pour peu de gestes.

### 56. `/admin/organisations/[orgId]` — {nom de l'organisation}

- **But** : Fiche d'un client (agence ou propriétaire bailleur) : abonnement, identité, facturation, parc, parrainage, comptes, invitation, contrôle d'accès ; point d'entrée dans son espace.
- **Accès** : Super-administrateur actif (layout + is_super_admin, sinon /espaces) ; chaque ouverture est journalisée (log_sa_access).
- **Action principale** : Entrer dans son espace (bouton or)
- **Priorité** : P2 · **Constats** : 5
  - Quatre mots pour le même objet : onglet navigateur « Client », retour « Tous les clients », rubrique « Utilisateurs », entité « organisation ».
  - Valeurs brutes et jargon : statut Stripe entre parenthèses, « Grille tarifaire historique — à migrer », « adhésion », « traversée ».
  - Aucun lien vers la page « Geste de support » de la même organisation.
  - L'alerte « Abonnement et facturation : lecture indisponible » est placée dans la section « Identité ».
  - Huit sections repliables sans ordre de priorité clair (invitation et contrôle d'accès tout en bas).

### 57. `/admin/organisations/[orgId]/support` — Support — {nom de l'organisation}

- **But** : Enregistrer, avec motif et confirmation en deux temps, un virement déjà reçu pour un appel de loyer précis d'un client.
- **Accès** : Superviseur permanent (is_permanent_super_admin, sinon /espaces).
- **Action principale** : Préparer ce seul encaissement, puis Exécuter ce geste de support
- **Priorité** : P2 · **Constats** : 4
  - Hors gabarit : pas de TitreEcran, pas d'entete-page, lien retour brut.
  - Introuvable depuis la console : le seul lien entrant est le bandeau de l'espace client (/agence/[orgId]).
  - « Geste de support » est un terme interne ; paragraphe d'explication dense.
  - Titre de section « Appels {mois} » sans le mot « loyer ».

### 58. `/admin/organisations/nouvelle` — Ouvrir une organisation

- **But** : Créer l'espace d'une agence ou d'un propriétaire et inviter son responsable, éventuellement prérempli depuis une demande de contact.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Ouvrir l'organisation
- **Priorité** : P3 · **Constats** : 3
  - « Organisation » alors que le reste de la console dit « client », « espace » ou « utilisateur ».
  - État « demande introuvable » sans mise en forme (paragraphe et lien nus).
  - Phrase peu claire : « à confirmer comme commerciale ».

### 59. `/admin/parametres` — Paramètres généraux

- **But** : Régler l'identité légale de l'éditeur et l'ouverture des abonnements ; renvoyer vers la conservation, la sécurité du compte et la création d'organisation.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 4
  - Le sous-titre annonce la « conservation des données », qui n'est qu'un lien vers une autre page.
  - Cartes-sommaire cliquables sans indice visuel de lien (une seule porte une flèche).
  - « Ouvrir une organisation » rangé dans les paramètres, en plus de deux autres entrées ailleurs.
  - Compteur « N / M fournis » sans objet nommé.

### 60. `/admin/publications` — Articles du site

- **But** : Lister tous les articles par état, filtrer, demander des propositions de sujets et ouvrir un article.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Nouvel article (bouton or)
- **Priorité** : P2 · **Constats** : 4
  - Trois libellés pour la même action : « Nouvel article » ici, « Créer un article » sur la page marketing et en h1 de la page cible.
  - Regroupement par état appliqué à une seule page de résultats (« Parus · 3 sur cette page ») : sections fragmentées.
  - Un paragraphe d'explication vide est rendu sous chaque titre de section.
  - Vocabulaire résiduel « journal » (« Retiré du journal ») à côté de « Articles du site ».

### 61. `/admin/publications/[id]` — Modifier l’article

- **But** : Modifier un article (titre, chapô, corps, description, texte et image Facebook), le faire paraître, le retirer, l'écarter ou le diffuser sur Facebook.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Enregistrer / faire paraître (dans EditeurPublication)
- **Priorité** : P3 · **Constats** : 3
  - h1 générique : le titre de l'article n'apparaît que dans son champ.
  - Cinq actions de nature différente dans un seul écran (enregistrer, paraître, retirer, Facebook, écarter) sans hiérarchie évidente.
  - L'erreur Facebook peut s'afficher deux fois (bandeau de page + éditeur).

### 62. `/admin/publications/nouvelle` — Créer un article

- **But** : Demander la rédaction d'un brouillon d'article à partir de faits fournis ; rien n'est publié sans relecture.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Créer le brouillon avec Gerimmo
- **Priorité** : P3 · **Constats** : 2
  - Titre d'onglet navigateur « Nouvel article », h1 « Créer un article ».
  - Espacements d'en-tête propres à cette page (mt-3) : léger écart avec les autres fiches.

### 63. `/admin/relais` — Vacances et relais

- **But** : Préparer une absence : période de vacances et arrêts d'urgence, accès de remplacement, plan de continuité, et plafond quotidien des appels à l'IA.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 5
  - Quatre sujets peu liés dans un écran ; la « Limite des appels IA » est inattendue ici.
  - L'écran est nommé ailleurs « Relais et arrêts », « Relais et vacances », « Limites et arrêt d’urgence », « Préparer mon absence ».
  - Section « Règles notées pour mon absence — non appliquées automatiquement » : une fonction qui précise qu'elle ne fait rien.
  - Titre « Accès de remplacement » répété (section puis sous-titre).
  - Aucune action dans l'en-tête ; trois niveaux de repli à ouvrir.

### 64. `/admin/retours` — Assistance clients

- **But** : Traiter les demandes des utilisateurs (problèmes, questions, idées, réclamations, contestations d'artisans), répondre, décider, et tenir la revue mensuelle des idées.
- **Accès** : Super-administrateur actif (layout + is_super_admin, sinon /espaces).
- **Action principale** : Revue des idées (bouton or) ; par demande : Répondre et décider → Enregistrer la décision
- **Priorité** : P2 · **Constats** : 5
  - Quatre noms : route « retours », menu « Assistance clients », onglet « Demandes et suivi », titre de bloc « Les demandes clients ».
  - Deux boutons posés directement dans l'en-tête en « space-between » : le secondaire flotte au milieu.
  - Le bouton or filtre la liste (idées) au lieu de porter l'action de l'écran.
  - Liste de toutes les organisations dans un menu déroulant non borné ; références et écran d'origine techniques.
  - Colonne latérale décorative (« Écouter. Puis améliorer. »).

### 65. `/admin/sante` — Santé et connexions

- **But** : Vérifier que les services externes sont reliés, que les tâches automatiques et la sauvegarde tournent, et suivre informations légales, archive des conditions, envois, contrôle Stripe et budget de signatures.
- **Accès** : Super-administrateur actif (layout) ; l'archivage des conditions est réservé au superviseur permanent.
- **Action principale** : —
- **Priorité** : P1 · **Constats** : 5
  - Jargon technique au premier plan : noms de variables d'environnement, Vercel, pg_cron, pg_net, chemin de fichier de documentation, « Run workflow ».
  - Noms d'écrans périmés dans les liens : « Développement du site », « Relais et arrêts ».
  - Page très longue (une dizaine de sections) ; SuiviStripe et BudgetSignatures collés en fin de page.
  - Deux barres d'ancres redondantes (liens du résumé puis rangée de boutons).
  - Paragraphe d'environ 120 mots sur les trois e-mails d'alerte.

### 66. `/admin/securite` — Sécurité et conformité

- **But** : Vue d'ensemble de la sécurité : comptes de supervision, accès de remplacement, dernières actions sensibles, et portail de liens vers données, conservation, veille et journaux.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 4
  - Les cartes d'accès répètent les onglets de la rubrique (données, conservation, veille) : navigation en double.
  - Ces cartes sont dans une section repliée par défaut.
  - Droits de délégation affichés bruts (« lecture, incidents, qualite »).
  - Titres de cartes en h2 à l'intérieur d'une section déjà titrée en h2.

### 67. `/admin/territoire` — Développement commercial

- **But** : Suivre prospects et demandes entrantes, voir les derniers espaces créés, puis choisir où développer le réseau : présence par département, données de marché, classement des candidats et études.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Demandes reçues (bouton or) ; dans le bloc prospects : + Ajouter un prospect
- **Priorité** : P2 · **Constats** : 5
  - h1 « Développement commercial » alors que l'onglet actif s'appelle « Développement territorial » ; la page mêle suivi de prospects et étude de marché.
  - Écran le plus long de la console (une douzaine de blocs) ; la tuile « Départements présents » apparaît deux fois.
  - Noms périmés ou internes : « Agent marketing », « Santé du service », « ronde du territoire ».
  - Rupture visuelle à mi-page entre le style « module » et le style « utilitaires ».
  - Explication du classement (pondérations en pourcentage) rédigée pour un expert.

### 68. `/admin/territoire/prospects/[id]` — Ajouter un prospect (ou {nom du prospect})

- **But** : Créer ou suivre un prospect (étape, prochaine action, notes), préparer la mention du premier message, enregistrer une opposition et consulter l'historique.
- **Accès** : Superviseur permanent uniquement (is_permanent_super_admin, sinon notFound).
- **Action principale** : Enregistrer le suivi
- **Priorité** : P2 · **Constats** : 4
  - Lien retour sans classe ; un lien et un bouton posés entre deux cartes, sans alignement.
  - Titre d'onglet navigateur fixe « Suivi du prospect » même en création.
  - Historique brut « avant → après », échéance affichée telle qu'en base.
  - Les textes de conformité (opposition, empreinte gardée trois ans) dominent la fiche.

### 69. `/admin/veille` — Veille réglementaire

- **But** : Examiner les informations réglementaires collectées et l'étude préparée, puis les diffuser aux utilisateurs ou les écarter.
- **Accès** : Super-administrateur actif (layout). Aucune garde propre à la page.
- **Action principale** : Valider et informer les utilisateurs (dans un repli par information)
- **Priorité** : P2 · **Constats** : 4
  - L'état vide renvoie à « Travail des équipes », un nom d'écran qui n'existe plus.
  - L'action principale est cachée dans un repli « Relire la présentation aux utilisateurs et décider ».
  - Pagination sans style ni numéro de page.
  - Le sous-titre parle du « bureau de direction », autre nom de l'accueil.

### 70. `/relais` — Relais de supervision

- **But** : Page du remplaçant : résumé, par famille de dossiers, de ce qui attend une étape pendant une délégation temporaire de supervision.
- **Accès** : Tout compte connecté (sinon /connexion?suite=/relais) ; contenu réservé au titulaire d'une délégation active (has_supervision_power « lecture ») ; second facteur exigé s'il existe (/securite) ; sinon message « Aucun relais actif ».
- **Action principale** : —
- **Priorité** : P3 · **Constats** : 3
  - Les cartes de familles ne sont pas cliquables : le remplaçant voit des compteurs sans pouvoir ouvrir les dossiers.
  - Page nue, hors de toute coquille : un seul lien « ← Mes espaces ».
  - Aucune indication de la marche à suivre ni de la date de fin de la délégation.

### 71. `/veille` — Les règles à connaître

- **But** : Présenter aux utilisateurs connectés (agences, propriétaires, locataires) les informations réglementaires validées par la supervision, filtrables par public.
- **Accès** : Tout utilisateur connecté (sinon /connexion?suite=/veille) ; le public « artisan » est redirigé vers /artisan/regles. Ce n'est pas un écran de supervision.
- **Action principale** : —
- **Priorité** : P2 · **Constats** : 4
  - Page hors de la coquille de l'espace : l'utilisateur perd son menu et n'a qu'un lien « ← Revenir à mon espace ».
  - h1 plus petit que le standard des autres pages.
  - Pagination « Précédente / Suivante » sans numéro de page.
  - Rangée à la racine comme un écran de supervision alors qu'elle s'adresse aux clients.

## Espace locataire, quittance, attestation, invitation, signature — 13 pages

### 72. `/locataire/[orgId]` — Bonjour {prénom}, (bloc .portail-hero, sous la date du jour)

- **But** : Accueil du locataire : ce qui l'attend (liste de gestes), son logement, le prochain loyer ou le dépôt de garantie, ses documents, ses demandes et son interlocuteur.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Traiter « Ce qui vous attend » : chaque rang mène au geste (relevé à transmettre, créneau à choisir, loyer à régler, attestation d'assurance, document à signer, pièce demandée, imputation à contester)
- **Priorité** : P1 · **Constats** : 5
  - Le H1 « Bonjour … » n'est pas le premier bloc : rendez-vous confirmés, sections « Décompte de charges AAAA » (h2) et rappels d'échéanciers (h3) passent AVANT lui — hiérarchie de titres inversée.
  - « Dernier document — quittance … → » ouvre /quittance/<id> hors coquille (plus de menu ni de barre basse) alors que la même quittance s'ouvre en fenêtre depuis « Mes documents ».
  - Erreur des avis de charges rendue en <p role=alert> nu (sans classe .err) et carte « Décompte de charges » en <section><h2> sans les classes titre-carte des cartes voisines.
  - Doublons d'accès : boutons « Mes documents » et « Écrire à mon gestionnaire » du héros répétés par la tuile documents et la carte gestionnaire ; trois familles de boutons (outline buttonVariants, pastille ad hoc « action › », .lien-discret).
  - Menu du compte : « Mes espaces » ne mène nulle part pour un locataire à un seul espace (redirection vers l'accueil), et « Sécurité du compte » sort de la coquille.

### 73. `/locataire/[orgId]/logement` — Mon logement

- **But** : Le logement et le bail en clair (préavis, loyer, dépôt de garantie), le mode d'emploi de l'immeuble, les états des lieux et la déclaration d'intention de congé.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Consulter mon bail signé ; prévenir de mon départ (carte de congé)
- **Priorité** : P2 · **Constats** : 5
  - Le type et la date du bail sont écrits trois fois (mention d'en-tête, ligne « Bail », carte de congé).
  - Valeurs longues ferrées à droite dans .ligne-info (« 1 mois si le logement est en zone tendue, 3 mois sinon (zone en cours de vérification…) ») : colonne étroite sur téléphone.
  - « Tout mon logement en un coup d'œil → » ouvre la fenêtre de lot de l'agence (composant de 1 644 lignes) : deux présentations du même logement sur une page, dont une au gabarit gestionnaire.
  - Le squelette de chargement est celui de l'accueil (héros + 3 tuiles), sans rapport avec cette page.
  - Pastille d'état des lieux utilisée pour une phrase entière (« en préparation — prévu le … (date dépassée : voyez-la avec votre gestionnaire) »).

### 74. `/locataire/[orgId]/documents` — Mes documents

- **But** : Coffre du locataire : pièces et quittances consultables, signatures et pièces à transmettre, attestation d'assurance habitation, préférences de réception électronique.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Ouvrir un document (aperçu en fenêtre) ; déposer l'attestation d'assurance ou une pièce demandée
- **Priorité** : P1 · **Constats** : 5
  - L'onglet ouvert par défaut est « Mes fichiers » alors que les gestes urgents (signature, pièce demandée, assurance) sont dans « À transmettre » : un bandeau « À faire : … Voir les éléments à transmettre → » doit y envoyer.
  - Libellés d'onglets (« Mes fichiers », « À transmettre ») différents des titres de cartes (« Documents disponibles », « Votre assurance habitation ») ; l'ordre des onglets est inversé à l'exécution par un .sort().
  - Deux bandeaux d'alerte de styles différents empilés avant les onglets (fond warning-soft, puis carte bordée), plus les cartes à filet doré à l'intérieur.
  - Second titre « Justificatifs de loyer rectifiés » en <h2> sans classe titre-carte ; bloc des consentements posé hors onglets en bas de page, avec un autre style de titre.
  - Titres de documents en bleu souligné (NOM_RANG) : troisième style de lien de l'espace, avec .lien-discret et les boutons outline.

### 75. `/locataire/[orgId]/loyers` — Mes paiements

- **But** : Prochaine échéance et coordonnées de virement, historique des loyers avec quittances, charges, relances reçues, plan d'apurement et décompte du dépôt de garantie.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Régler par virement (copier l'IBAN), puis ouvrir la quittance du mois
- **Priorité** : P1 · **Constats** : 5
  - Chaque mois de l'historique ouvre /quittance/<id> en pleine page hors coquille (menu et barre basse disparaissent), alors que la même quittance s'ouvre en fenêtre depuis « Mes documents ».
  - « Attestation de bon paiement » quitte aussi la coquille, vers une page à la présentation différente.
  - Le bloc SuiviEcheanciersCharges (titre h3) est rendu AU-DESSUS de l'en-tête de page et du H1.
  - La frise des 12 mois est aria-hidden et ne parle qu'au survol (title) ; aucune légende des trois couleurs.
  - Styles de liens mêlés (.lien-discret, bleu souligné ad hoc, bouton outline, pastille « Ouvrir la quittance › ») ; le justificatif d'une retenue s'ouvre dans un nouvel onglet quand les autres documents s'ouvrent en fenêtre.

### 76. `/locataire/[orgId]/demandes` — Mes demandes

- **But** : Suivi de chaque signalement et de son intervention (étapes, créneaux à choisir, rendez-vous, imputation, notation, discussion), avec accès au nouveau signalement.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Choisir un créneau proposé par l'artisan (seul geste attendu du locataire) ; sinon « Signaler un problème »
- **Priorité** : P1 · **Constats** : 4
  - Bouton principal en .btn-or ici, alors que les autres pages de l'espace utilisent buttonVariants outline : deux familles de boutons pour le même rôle.
  - Les discussions d'intervention (EchangesIntervention) sont rendues en bas de page, détachées de la carte de la demande à laquelle elles appartiennent.
  - La carte d'alerte est un <a> entier qui contient un faux bouton <span class=btn-or> : double affordance.
  - L'entrée « Mes demandes » reste allumée sur /incident : aucun repère distinct pour le formulaire.

### 77. `/locataire/[orgId]/incident` — Signaler un problème

- **But** : Déclarer un incident dans le logement, après rappel des réflexes d'urgence.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces) ; le formulaire n'est offert que sur un bail actif
- **Action principale** : Envoyer le signalement (catégorie, description, urgence, photos)
- **Priorité** : P1 · **Constats** : 4
  - Page absente du menu (rattachée à « Mes demandes ») : le bouton « Urgence » de l'en-tête y mène sur une ancre, sans entrée de navigation propre.
  - La carte « En cas d'urgence » précède toujours le formulaire : sur téléphone, le premier champ est sous la ligne de flottaison.
  - Phrase d'introduction en <p> nu entre l'en-tête et la carte, hors gabarit .entete-page.
  - Deux rendus du même geste d'urgence : bouton d'en-tête (rounded-lg, bordure destructive/30) et boutons d'appel (rounded-md, bordure destructive pleine).

### 78. `/locataire/[orgId]/contact` — Mon gestionnaire (organisation de type agence) ou Mon bailleur (propriétaire direct) — identiteContact.titre

- **But** : Fil de messages avec le gestionnaire ou le bailleur, ses coordonnées, et un assistant privé.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Écrire un message au gestionnaire
- **Priorité** : P2 · **Constats** : 4
  - Titre d'onglet « Contact » alors que le menu et le H1 disent « Mon gestionnaire » / « Mon bailleur » : trois noms pour un écran.
  - L'assistant privé est posé sous la grille : deux zones de saisie sur la page, risque de confondre « écrire au gestionnaire » et « demander à l'assistant ».
  - Colonne de droite vide (grille à deux colonnes conservée) quand aucun gestionnaire n'est rendu.
  - Titre de carte de repli « Identité à confirmer » affiché tel quel au locataire.

### 79. `/locataire/[orgId]/faq` — Questions fréquentes

- **But** : Six réponses aux questions courantes du locataire, avec liens vers les rubriques de l'espace.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces) (garde portée par le layout ; la page ne lit rien)
- **Action principale** : Déplier une réponse ; « Écrire à mon gestionnaire »
- **Priorité** : P2 · **Constats** : 4
  - Deux entrées d'aide voisines dans le menu — « Questions fréquentes » (dans la coquille) et « Aide et retours » (/assistance, hors coquille, marque Gerimmo) — sans passerelle entre elles.
  - Dans le tiroir du téléphone, cette page s'appelle « Aide » (libellé court) à côté de « Aide et retours ».
  - <details> natifs sans chevron ni état ouvert stylé ; tout est replié à l'arrivée.
  - Contenu figé dans le code (six questions), non administrable par l'agence.

### 80. `/locataire/[orgId]/releves` — Mes relevés

- **But** : Transmettre l'index de ses compteurs en réponse aux demandes de relevé du gestionnaire.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Saisir et envoyer un index (une photo peut le préremplir)
- **Priorité** : P2 · **Constats** : 5
  - <main> imbriqué dans le <main id=contenu-espace> de la coquille (deux repères principaux) et double gouttière (marges de la coquille + p-4 sm:p-7).
  - Seule page de l'espace sans TitreEcran ni .entete-page : H1 nu, autre largeur (max-w-3xl) — elle a l'allure d'une page hors coquille.
  - Lien de retour « ← Mon logement » qui mène à l'accueil (/locataire/{orgId}) et non à /logement.
  - Page absente du menu et de la barre basse : aucune entrée allumée ; on n'y arrive que par le rang « relevés à transmettre » de l'accueil.
  - Message d'erreur sans style (.err absent).

### 81. `/quittance/[quittanceId]` — {Quittance de loyer / Reçu de paiement partiel} — {mois année}

- **But** : Afficher la quittance ou le reçu conforme d'un mois, à imprimer ou à enregistrer en PDF.
- **Accès** : locataire du bail, OU gestionnaire / propriétaire de l'organisation (contrôle porté par la RPC quittance_document ; drapeau vue_gestionnaire) — route racine partagée entre les espaces
- **Action principale** : Imprimer ou enregistrer en PDF
- **Priorité** : P2 · **Constats** : 5
  - Page servie hors de la coquille locataire : ni menu latéral, ni barre basse, ni bouton Urgence, ni menu du compte — rupture de navigation depuis l'accueil et « Mes paiements ».
  - Le retour dépend de l'historique (router.back) ; ouverte depuis un e-mail, la page renvoie sur /espaces (bandeau Gerimmo).
  - Libellé « Retour à mes paiements » même quand on arrive de l'accueil ou d'un e-mail.
  - État « pas encore disponible » : renvoie à la rubrique « Mon gestionnaire » sans lien.
  - La 404 de cette route est la page Gerimmo (marque blanche rompue pour le locataire d'une agence).

### 82. `/attestation-loyer/[orgId]` — Attestation de bon paiement

- **But** : Délivrer au locataire à jour de ses loyers une attestation imprimable, ou expliquer pourquoi elle ne peut pas l'être.
- **Accès** : locataire rattaché à l'organisation (adhésion active, ou locataire sorti en lecture seule) — garde verifierAccesEspaceLocataire(orgId) (sans session → /connexion ; sans accès → /espaces)
- **Action principale** : Imprimer ou enregistrer (BoutonImprimer)
- **Priorité** : P2 · **Constats** : 5
  - Hors coquille locataire alors que la page applique la même garde que l'espace (verifierAccesEspaceLocataire) : elle pourrait vivre dans le layout et n'imprimer que le document.
  - Attestation rendue comme une page web (pas de cadre A4 ni de feuille d'impression dédiée), à la différence de la quittance en iframe.
  - Trois graphies du retour selon la page : « ‹ Mes paiements » ici, « ← Retour à mes paiements » sur la quittance, « ← Revenir à mon espace » sur /veille.
  - États d'indisponibilité sans titre de niveau 2 ; libellé du bouton or différent selon le motif.
  - Bouton désactivé sur « Mes paiements » quand un loyer est dû, mais la page reste atteignable par son adresse et réexplique le refus.

### 83. `/invitations/[invitationId]` — Votre invitation locataire (ou « Ce lien n'est pas valable »)

- **But** : Accepter ou refuser l'invitation à rejoindre un espace locataire.
- **Accès** : compte connecté dont l'adresse a reçu l'invitation (sans session → /connexion?suite=…) ; futur locataire
- **Action principale** : Accepter l'invitation
- **Priorité** : P2 · **Constats** : 5
  - Marque et promesse Gerimmo pour le futur locataire d'une agence en marque blanche (l'espace, lui, sera à la marque de l'agence).
  - Titre d'onglet « Invitation locataire - Gerimmo » (trait d'union au lieu du tiret « — » des autres pages).
  - Après acceptation : un simple lien discret « Ouvrir mon espace locataire », ni bouton principal ni redirection.
  - Statut de l'invitation en <p> gras sans pastille ; erreur de lecture sans style.
  - « Retour à mes espaces » proposé à quelqu'un qui n'a encore aucun espace.

### 84. `/signature/caution/[jeton]` — Confirmer votre numéro de mobile (ou « Votre numéro est déjà confirmé » / « Vérifier votre lien de signature »

- **But** : Page publique du lien reçu par le garant : confirmer lui-même le mobile qui recevra le code de signature (acte de cautionnement, ou bail signé en qualité de garant).
- **Accès** : garant / caution SANS compte (lien à jeton à usage unique ; public, noindex, no-store) — ce n'est pas une page du locataire
- **Action principale** : Confirmer mon numéro
- **Priorité** : P2 · **Constats** : 4
  - Marque Gerimmo seule : le garant ne voit pas le logo du bailleur ou de l'agence qui lui demande de signer (seulement son nom dans le texte).
  - Le bloc d'aide réutilise AideInvitation, dont le message type parle d'« invitation Gerimmo » alors qu'il s'agit d'un lien de signature.
  - Le panneau de promesse est masqué sous 1024 px : sur téléphone, seul le titre dit de quoi il s'agit.
  - Rangée sous /signature mais destinée au garant : à ne pas rattacher à la coquille locataire dans la refonte.

## Espace artisan — 22 pages

### 85. `/artisan` — Aujourd'hui

- **But** : File de ce qui attend l'artisan, par ordre d'urgence : attestations, comptes rendus, missions à accepter, rendez-vous, devis à chiffrer, puis prochaines interventions.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Ouvrir la mission ou la demande en tête de file (CarteMission / CarteSollicitation)
- **Priorité** : P1 · **Constats** : 5
  - Tuiles-compteurs colorées en dur dans le CSS module (#eaf0f8/#335980, #f6ecd7/#80612c…) : hors jetons, donc hors de la marque blanche annoncée dans ui.tsx.
  - Le compteur « Rendez-vous à traiter » additionne reports et rendez-vous à fixer, mais son lien ne mène qu'à la première des deux sections.
  - Ancres inégales : « Reports… » et « Devis à chiffrer » n'ont pas le scroll-mt-28 des autres sections ; titre de section à rallonge « Rendre compte (N) — sans cela, pas de facture ».
  - Liens soulignés ad hoc (« Déposer une attestation à jour », « Voir tout mon agenda ») à côté des boutons de 56 px : deux poids pour des actions équivalentes.
  - Tiroir « Menu » du téléphone : l'entrée « Aide en cas de problème » mène à /artisan/panne, l'écran d'erreur « Lecture momentanément impossible ».

### 86. `/artisan/agenda` — Mon agenda

- **But** : Agenda toutes agences confondues : sept prochains jours, rendez-vous par jour, missions sans date, historique, et chantiers des clients externes.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Ouvrir une mission (CarteMission)
- **Priorité** : P1 · **Constats** : 4
  - La carte « Mes chantiers externes » (liste brute, liens soulignés) est placée AVANT le semainier : premier contenu de l'agenda, même vide.
  - Les rendez-vous des chantiers externes ne figurent ni dans le semainier ni dans les jours : deux agendas séparés sur une même page.
  - Semainier à 7 colonnes sur 390 px : libellé « N rdv » à 11 px ; cases cliquables et non cliquables indiscernables hors survol.
  - Historique complet sans pagination ni repli.

### 87. `/artisan/attestations` — Mes attestations

- **But** : Dossier professionnel de l'artisan (décennale, RC pro, URSSAF, Kbis, certification) : état, échéance, dépôt et renouvellement.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Déposer un document (lien ?type=…#deposer, qui fait apparaître le formulaire)
- **Priorité** : P2 · **Constats** : 4
  - Le formulaire de dépôt n'apparaît qu'après une navigation (?type=…#deposer) et s'insère entre les indicateurs et la liste : « Déposer un document » recharge la page au lieu d'ouvrir un volet.
  - Boutons propres au module (styles.principal / .secondaire), différents des CLASSE_BOUTON_* du reste de l'espace.
  - Trois indicateurs non cliquables qui ressemblent aux tuiles cliquables de l'accueil et de la facturation.
  - Trois accès au même dépôt : bouton d'en-tête, bouton de la ligne, bouton « Prochaine action ».

### 88. `/artisan/chantiers/[chantierId]` — {titre du chantier}

- **But** : Piloter de bout en bout le chantier d'un client externe : devis, accord, rendez-vous, démarrage, bilan, facture, avoir.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne) ; écriture soumise au module « clients » (LectureSeule sinon)
- **Action principale** : L'« étape suivante » calculée par ParcoursChantier (valider le devis, enregistrer l'accord, fixer le rendez-vous, démarrer, terminer, déposer la facture)
- **Priorité** : P2 · **Constats** : 5
  - Aucun lien de retour en tête : la NavigationPrivee est tout en bas ; sur téléphone, la barre basse ne contient pas « Clients externes » (seulement dans le tiroir « Menu »).
  - Jusqu'à douze actions sur un écran, dont les destructrices (annuler la facture, annuler le chantier) dans le même dépliant « Autres actions » que les gestes courants.
  - Texte non hiérarchisé : paragraphes, listes et libellés de champs sans classes typographiques, séparateurs « · » partout.
  - Erreur de chargement rendue seule, sans titre ni chemin de sortie.
  - Rendez-vous saisi en champs datetime-local natifs, différents du formulaire de créneaux des missions Gerimmo.

### 89. `/artisan/clients` — Mes clients externes

- **But** : Carnet privé des clients propres de l'artisan (sans compte Gerimmo) : recherche, liste, création.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne) ; écriture soumise au module « clients »
- **Action principale** : Créer le client (ou ouvrir une fiche)
- **Priorité** : P2 · **Constats** : 5
  - Menu et onglet « Clients externes », H1 « Mes clients externes ».
  - Liste en liens soulignés + paragraphe « adresse · Actif » : ni carte ni état vide soigné, à l'inverse des CarteMission.
  - Recherche sans résultat muette ; la recherche recharge la page pour filtrer une liste déjà chargée.
  - Libellés de champs en <span> nus (pas CLASSE_LIBELLE).
  - Icône de rubrique par défaut « incidents » (clé à molette) pour une page de clients.

### 90. `/artisan/clients/[clientId]` — {nom du client}

- **But** : Fiche d'un client externe : coordonnées modifiables, archivage, chantiers rattachés.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne) ; écriture soumise au module « clients »
- **Action principale** : Enregistrer les coordonnées ; « Créer un chantier et son devis »
- **Priorité** : P2 · **Constats** : 4
  - Pas de <Retour> vers la liste : seule la pastille NavigationPrivee y ramène (masquée à partir de 1000 px).
  - Formulaire d'archivage dans la même carte que les coordonnées, à la suite, sans séparation.
  - Liste des chantiers vide sans message ; liens soulignés nus.
  - <label> du select « Type » sans la classe block des autres champs.

### 91. `/artisan/devis` — Demandes de devis

- **But** : Boîte de réception des demandes de devis, toutes agences : à chiffrer, devis envoyés, sans suite.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Ouvrir une demande à chiffrer (CarteSollicitation)
- **Priorité** : P1 · **Constats** : 3
  - Aucun accès à « Nouveau chantier et devis » (/artisan/devis/nouveau), qui partage pourtant le préfixe /devis et allume le même onglet.
  - Menu du bureau « Demandes de devis », onglet du téléphone « Devis » : deux noms.
  - Listes « Devis envoyés » et « Sans suite » sans pagination ni filtre.

### 92. `/artisan/devis/[sollicitationId]` — {titre de l'incident (catégorie)} — surtitre « Préparer votre devis » / « Préparer la version N » / « Votre de

- **But** : Lire la demande du client (désordre, commune, photos) et y répondre par un devis préparé en quatre étapes, ou relire sa réponse une fois la demande close.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Valider puis envoyer le devis (ou décliner la demande)
- **Priorité** : P2 · **Constats** : 5
  - generateMetadata renvoie un élément JSX (<LectureImpossibleArtisan/>) quand la lecture échoue, au lieu d'un objet de métadonnées (ligne 49).
  - En-tête maison (H1 = catégorie d'incident) différent de l'en-tête standard EnteteSousPage / TitreEcran des autres pages.
  - Couleurs Tailwind en dur (emerald-800, amber-900/950, amber-50) pour les états d'envoi, hors jetons success / warning.
  - Encadré « révision demandée » en rouge destructive (bordure 2 px et fond) pour une simple demande de modification.
  - Page très dense sur téléphone : demande, photos, avertissements, assistant en quatre étapes, suivi de signature, versions précédentes — sans sommaire.

### 93. `/artisan/devis/nouveau` — Nouveau chantier et devis

- **But** : Créer un chantier pour un client externe choisi, avant de préparer son devis.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne) ; écriture soumise au module « clients »
- **Action principale** : Créer le chantier et préparer le devis
- **Priorité** : P2 · **Constats** : 4
  - Rangée sous /artisan/devis : l'onglet « Demandes de devis » s'allume alors qu'il s'agit du module Clients externes ; absente de tout menu (seule une pastille NavigationPrivee y mène).
  - Choix du client par <select> + bouton « Choisir » qui recharge la page.
  - <label> nu « Choisir un client » collé au select ; lien « Créer un client » en underline brut.
  - Mention d'en-tête « aucune sollicitation Gerimmo nécessaire » : vocabulaire interne.

### 94. `/artisan/entreprise` — Mon entreprise

- **But** : Fiche professionnelle : identité et statuts, coordonnées, présence dans le réseau, métiers et zone, personnalisation des devis, raccourcis.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Personnaliser mes devis ; régler métiers, zone et visibilité
- **Priorité** : P2 · **Constats** : 5
  - Raison sociale en <h2> sous un H1 « Mon entreprise » dont la mention est vide (mention="").
  - Raccourcis Attestations / Facturation / Évaluations en bas de page, redondants avec le menu latéral du bureau.
  - « Personnaliser mes devis » n'est qu'une ancre vers un onglet ; l'onglet ouvert par défaut (Coordonnées) est en lecture seule.
  - Corriger le SIRET ou la raison sociale impose de sortir de la coquille vers /assistance.
  - 55 couleurs en dur dans le module de la page.

### 95. `/artisan/facturation` — Ma facturation

- **But** : Vue des factures (Gerimmo et clients externes) et de leurs règlements déclarés, interventions à facturer, dossiers à compléter, registre privé.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Déposer ma facture (intervention prête) ; déclarer un règlement reçu
- **Priorité** : P1 · **Constats** : 5
  - Les interventions « à facturer » — l'action principale — sont dans un <details> replié sous la vue des factures.
  - Trois niveaux d'imbrication (onglets › dépliant › indicateurs-ancres › sections) ; les ancres #a-facturer visent un contenu replié.
  - L'onglet « Mon registre » est une liste brute (liens soulignés, paragraphes), très différente de l'onglet voisin stylé par le module.
  - Bouton d'en-tête « Mon agenda » en guise d'action ; boutons du module différents des CLASSE_BOUTON_*.
  - Deux fiches pour une facture : « Voir la mission » et « Suivi de la facture » (/artisan/facturation/{id}).

### 96. `/artisan/facturation/[factureId]` — Facture {numéro}

- **But** : Suivi d'une facture : montants, déclaration du client, avoir, déclaration et annulation de règlements reçus avec preuves.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne) ; écriture soumise au module « règlements »
- **Action principale** : Déclarer un règlement reçu
- **Priorité** : P2 · **Constats** : 4
  - Pas de <Retour> vers « Ma facturation ».
  - Historique en paragraphes séparés par « · » ; mention « Déclarant : votre compte artisan. Identifiant conservé dans l'export. » répétée sur chaque ligne.
  - Tuiles de chiffres ad hoc, différentes des indicateurs des autres pages de l'espace.
  - Avertissement juridique (« Registre privé et déclaratif… ») en <p> nu dans la carte de synthèse.

### 97. `/artisan/inscription` — Inscrire mon entreprise

- **But** : Porte d'entrée de l'artisan : créer son compte (sans session), puis inscrire son entreprise (SIRET, métiers, mobile, zone).
- **Accès** : public sans session (étape « compte ») ; compte connecté sans fiche artisan (étape « entreprise ») ; avec fiche → redirigé vers /artisan (ou vers l'invitation d'origine)
- **Action principale** : Créer mon compte, puis inscrire mon entreprise
- **Priorité** : P2 · **Constats** : 4
  - Deux en-têtes selon la session (bandeau réduit de 960 px, ou barre de la coquille sans menu) pour le même écran.
  - Étapes numérotées de deux façons : « 1. Votre compte » (titre de carte) et la liste « Ce qui vient ensuite » 1-2-3, qui ne correspond pas aux étapes de saisie.
  - Mention lourde de conséquence en 13 px : « Sans document déposé dans les six mois, votre inscription est supprimée ».
  - Aucun indicateur de progression entre compte, entreprise et attestations.

### 98. `/artisan/invitation/[invitationId]` — Invitation à rejoindre un carnet d'artisans (ou « Vérifier votre invitation artisan » sans session, « Ce lien 

- **But** : Page du lien reçu par e-mail : accepter ou refuser d'entrer dans le carnet d'artisans d'un propriétaire.
- **Accès** : public sans session (connexion ou création de compte) ; compte dont l'adresse confirmée est celle de l'invitation, avec ou sans fiche artisan
- **Action principale** : Accepter l'invitation (après avoir inscrit son entreprise si besoin)
- **Priorité** : P2 · **Constats** : 4
  - Variante « lien non valable » : <h1> et <p> nus dans une Carte, sans .portail-hero — rendu différent des autres variantes.
  - Sept états dans un fichier, chacun avec sa combinaison de boutons de 56 px, sans hiérarchie constante.
  - Création de compte cachée dans un <details> « Première visite ? ».
  - AideInvitation est le seul bloc de la page stylé hors des primitives de l'espace.

### 99. `/artisan/missions/[interventionId]` — {titre de l'incident (catégorie)}

- **But** : Fiche de mission : le geste attendu maintenant, l'adresse et l'itinéraire, la description, les photos, le contact sur place, puis le bilan et la facture.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne) ; la mission doit figurer dans mon_agenda_artisan (sinon 404)
- **Action principale** : Selon le statut : Accepter / Refuser · Proposer des créneaux · Démarrer l'intervention · Rendre compte du travail · Déposer ma facture
- **Priorité** : P2 · **Constats** : 5
  - Le H1 arrive en quatrième position : lien de retour, bandeaux éventuels, puis marque de l'agence et étiquette de statut le précèdent.
  - Jusqu'à trois boutons pleine largeur de 56 px empilés (Démarrer, Déplacer le rendez-vous, Ouvrir l'itinéraire) avant toute information.
  - H1 = catégorie d'incident : plusieurs missions portent le même titre ; onglet « Ma mission ».
  - Fichier de 479 lignes à huit branches de statut ; filet orange (border-l-4 warning) pour des états simplement informatifs.
  - Lien externe vers Google Maps, fournisseur non tranché (commentaire « À CONFIRMER » dans le code).

### 100. `/artisan/missions/[interventionId]/compte-rendu` — La photo du travail réalisé

- **But** : Étape 1 sur 2 du compte rendu : photographier le travail terminé (condition du bilan et de la facture), photos avant et pendant facultatives.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Envoyer la photo « après », puis « Continuer — le bilan »
- **Priorité** : P2 · **Constats** : 4
  - « Continuer — le bilan » est un <a> (rechargement complet) alors que les autres navigations sont des <Link>.
  - Le composant Vide (cadre pointillé d'état vide) sert de consigne d'étape.
  - Progression réduite à une étiquette « Étape 1 sur 2 », alors que EtapesSaisie existe pour le devis.
  - Titre d'onglet « Photo du travail » différent du H1.

### 101. `/artisan/missions/[interventionId]/compte-rendu/bilan` — Le bilan

- **But** : Étape 2 sur 2 : décrire le travail réalisé, ajuster le montant (demande d'avenant) et terminer l'intervention.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Déposer le compte rendu et terminer l'intervention
- **Priorité** : P3 · **Constats** : 3
  - Bandeau Succes permanent « Photo du travail réalisé : envoyée. » : un message de succès employé comme rappel d'état.
  - Budget illisible : le formulaire disparaît entièrement, sans bouton « Réessayer ».
  - Libellé de retour elliptique « La photo ».

### 102. `/artisan/missions/[interventionId]/creneaux` — Proposer des créneaux / Proposer d'autres créneaux / Déplacer le rendez-vous (selon le statut)

- **But** : Proposer au locataire au moins trois créneaux, ou déplacer un rendez-vous déjà fixé.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Envoyer mes créneaux
- **Priorité** : P3 · **Constats** : 3
  - Avertissement écrit en capitales dans le texte (« En proposer d'autres L'ANNULE »).
  - Ligne d'en-tête qui ne contient que la marque de l'agence (flex justify-between à un seul enfant).
  - Les règles du ping-pong de dates (sixième refus…) sont cachées dans un dépliant en bas de page.

### 103. `/artisan/missions/[interventionId]/facture` — Déposer ma facture

- **But** : Déposer la facture d'une intervention terminée, préremplie d'après le devis ou l'avenant accepté.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Déposer ma facture
- **Priorité** : P3 · **Constats** : 3
  - MarqueAgence posée seule entre le retour et le titre (pas de ligne d'en-tête comme sur la mission).
  - Si le client de service est absent, adresse et mentions de l'entreprise arrivent vides sans message.
  - Carte de montants sans titre.

### 104. `/artisan/note` — Mes évaluations

- **But** : Note Gerimmo de l'artisan (publiée à partir de trois évaluations), indicateurs de fiabilité privés, explication du calcul et recours.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Consulter sa note ; « Déposer une contestation » (dès une évaluation reçue)
- **Priorité** : P2 · **Constats** : 4
  - « Déposer une contestation » quitte la coquille vers /assistance SANS paramètre retour : pas de « Retour à ma page ».
  - Trois noms pour un écran : route /artisan/note, menu « Mes évaluations », composant PageNote.
  - Bouton d'en-tête « Ma fiche entreprise → » en action principale d'une page de consultation.
  - 40 couleurs en dur dans le module de la page.

### 105. `/artisan/panne` — Lecture momentanément impossible

- **But** : Écran de repli quand la fiche artisan n'a pas pu être lue (évite d'envoyer à tort vers l'inscription).
- **Accès** : compte connecté (aucune garde dans la page ; atteinte par redirection de verifierAccesArtisan, et par l'entrée « Aide en cas de problème » du tiroir du téléphone)
- **Action principale** : Réessayer (lien vers /artisan)
- **Priorité** : P3 · **Constats** : 3
  - L'entrée « Aide en cas de problème » du tiroir « Menu » (téléphone) mène ici : l'artisan qui cherche de l'aide lit « Votre fiche n'a pas pu être lue à l'instant » alors que rien n'est en panne.
  - H1 sans EnteteSousPage ni TitreEcran, à la différence de toutes les autres pages.
  - « Réessayer » est un lien vers /artisan, pas une relance de la lecture.

### 106. `/artisan/regles` — Les règles à connaître

- **But** : Veille réglementaire filtrée pour les artisans, servie dans la coquille de l'espace.
- **Accès** : artisan ayant une fiche — garde verifierAccesArtisan() (sans session → /connexion?suite=/artisan ; sans fiche → /artisan/inscription, ou /espaces s'il a un autre espace ; lecture en échec → /artisan/panne)
- **Action principale** : Lire une règle ; « Consulter {source} »
- **Priorité** : P3 · **Constats** : 3
  - Retour fixe « Mon entreprise », même quand on arrive par le menu.
  - Incohérence entre espaces : la même veille est servie HORS coquille au locataire (/veille?public=locataire).
  - La carte finale de mise en garde a le même poids visuel que les règles.

## Pages publiques et transversales — 27 pages

### 107. `/` — Vos locations, l’esprit tranquille.

- **But** : Vitrine du produit : promesse, fonctions, espaces par rôle, tarif, derniers articles, FAQ et formulaire de contact.
- **Accès** : public uniquement : un utilisateur connecté est redirigé vers /espaces par src/proxy.ts
- **Action principale** : « Créer mon compte » → /inscription (en-tête, hero, cartes d’espaces, carte tarif)
- **Priorité** : P1 · **Constats** : 5
  - Prix recopiés en dur dans la FAQ (page.tsx:30) et dans le texte de CartesOffresPubliques (« 5,99 € », « 1,99 € », « 19,90 € », « 0,99 € ») alors que le calcul vient de lib/tarifs : risque d’écart affiché.
  - Sous 600 px le bouton « Créer mon compte » de l’en-tête est masqué (`.public-inscription {display:none}`) : il ne reste que « Se connecter » et le menu.
  - Le formulaire de contact (nommé « devis » dans le code) sert aussi à l’exercice des droits RGPD ; ses champs ont deux définitions de hauteur (h-10 dans le composant, 46 px forcés par `.public-contact input`).
  - `<section id="agences">` avec son propre h2 imbriquée dans `<section id="espaces">`, habillée de la classe `.public-parcours` prévue pour « trois temps » : structure et style détournés.
  - Deux blocs tarif (section #tarifs ici + page /tarifs) et deux listes d’outils (bande « Un calcul à faire ? » + pied) : redites sur une page déjà longue (9 sections).

### 108. `/agences` — Gerimmo pour les agences arrive.

- **But** : Expliquer que l’offre agences est en préparation et recueillir les coordonnées d’une agence sur liste d’attente.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : « Rejoindre la liste d’attente » (envoi du formulaire)
- **Priorité** : P3 · **Constats** : 3
  - Quatre puces à coche verte terminées chacune par « (en préparation) » : l’icône dit « acquis », le texte dit le contraire.
  - Constantes de style du formulaire dupliquées avec le contact de l’accueil (deux fichiers à modifier pour un même champ).
  - Page atteignable seulement par le pied de page et des liens de texte (hors navigation principale, voulu) : aucun fil d’Ariane ni lien retour.

### 109. `/tarifs` — L’abonnement Gerimmo pour votre espace propriétaire.

- **But** : Présenter le prix de l’abonnement (simulateur) et ce qu’il comprend, exclut, et comment changer ou arrêter.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : « Commencer l’essai gratuit » → /inscription
- **Priorité** : P1 · **Constats** : 4
  - La mention de taxes est affichée deux fois (lignes 41 et 104).
  - Deux boutons d’essai aux libellés et styles différents : « Commencer mon essai gratuit » (btn-secondaire, dans la carte) et « Commencer l’essai gratuit » (btn-or, en bas).
  - Cinq cartes de listes à puces juridiques très denses (impayé, rétractation, signature) : la page se lit comme des conditions de vente, pas comme une grille de prix.
  - Le titre h2 des cartes a nécessité un correctif local (25 px) contre la règle globale `.site-public h2` (30–43 px) : symptôme de la règle de titres vitrine appliquée à des contenus de lecture.

### 110. `/outils` — Outils gratuits

- **But** : Catalogue des cinq outils gratuits pour bailleurs, sans compte.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : « Ouvrir l’outil » (cartes) ; secondaire : AppelEssai « Créer mon compte » → /inscription
- **Priorité** : P2 · **Constats** : 4
  - Hero différent des autres pages secondaires de la vitrine (`.vitrine-hero` + grille de tuiles décoratives, contre `.public-page-intro` pour /tarifs, /agences, /journal).
  - Les utilitaires du h1 (`font-heading font-extrabold`, `.outil-vitrine-titre` 30/44 px) sont neutralisés par les règles hors couche `.gerimmo-prestige :is(h1,h2)` (Georgia, graisse 400) et `.gerimmo-prestige .vitrine-hero h1` / `.site-public h1` : classes mortes.
  - Très probable d’après la cascade (à confirmer au rendu) : les h2 de carte `.outil-h2` (19 px) reçoivent `clamp(30px,3.1vw,43px)` de `.gerimmo-prestige .site-public h2` (vitrine.css:6), plus spécifique.
  - Puce « Gratuit / sans compte » répétée sur chaque carte en plus du hero.

### 111. `/outils/calcul-irl` — Calcul de la révision de loyer (IRL)

- **But** : Calculer le loyer révisé selon l’IRL (indices lus chez l’Insee) et préparer la lettre de révision à imprimer.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : « Imprimer la lettre » (window.print)
- **Priorité** : P2 · **Constats** : 4
  - La taille `.outil-titre` (27/36 px) et la graisse extrabold du h1 sont écrasées par `.gerimmo-prestige .site-public h1` (42–68 px, Georgia 400) : titre hero sur une page d’outil, à confirmer au rendu.
  - « Bon à savoir » (h2.outil-h3, 16 px) et « Les autres outils gratuits » (h2.outil-h2) subissent la même règle `.site-public h2` (30–43 px).
  - Bandeau AppelEssai « Créer mon compte » affiché aussi à un utilisateur déjà connecté.
  - Système de champs parallèle à src/components/ui (outil-champ) : deux apparences de formulaire dans le même produit.

### 112. `/outils/comparateur-gli-visale` — Comparateur GLI / Visale

- **But** : Vérifier l’éligibilité Visale d’un locataire et chiffrer le coût brut et net d’une assurance loyers impayés.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Saisie → lecture du panneau « Comparaison » (résultat immédiat, pas de bouton)
- **Priorité** : P3 · **Constats** : 3
  - Mêmes écrasements de titres que les autres outils (`.site-public h1/h2`).
  - Encadré de date de vérification stylé à la main alors qu’un composant Alerte existe dans champs.tsx.
  - AppelEssai « Créer mon compte » montré aux connectés.

### 113. `/outils/quittance-de-loyer` — Quittance de loyer

- **But** : Produire une quittance (ou un reçu de paiement partiel) à imprimer ou enregistrer en PDF.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : « Imprimer la quittance » / « Imprimer le reçu » (window.print)
- **Priorité** : P3 · **Constats** : 3
  - Mêmes écrasements de titres que les autres outils (`.site-public h1/h2`).
  - Bouton principal `btn-or` surchargé en !important, différent du `btn-or` de l’outil IRL (`!px-5`) : deux boutons « Imprimer » dissemblables.
  - AppelEssai « Créer mon compte » montré aux connectés.

### 114. `/outils/rentabilite-locative` — Rentabilité locative

- **But** : Calculer la rentabilité brute, nette de charges et le cash-flow mensuel d’un investissement locatif.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Saisie → lecture du panneau de résultat (immédiat)
- **Priorité** : P3 · **Constats** : 3
  - Mêmes écrasements de titres que les autres outils (`.site-public h1/h2`).
  - Seul outil sans composant Alerte : une saisie incohérente n’est pas signalée comme dans les quatre autres.
  - AppelEssai « Créer mon compte » montré aux connectés.

### 115. `/outils/simulateur-lmnp` — Simulateur LMNP

- **But** : Comparer l’impôt d’une location meublée au micro-BIC et au régime réel.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Saisie → lecture du panneau « Impôt de l’année » (immédiat)
- **Priorité** : P3 · **Constats** : 2
  - Mêmes écrasements de titres que les autres outils (`.site-public h1/h2`).
  - AppelEssai « Créer mon compte » montré aux connectés.

### 116. `/conditions` — Conditions générales d'utilisation et de vente

- **But** : Texte contractuel versionné accepté à l’inscription et à la souscription (17 articles, 14 bis, 2 annexes).
- **Accès** : les deux (public, traversable connecté, lisible même avant validation du second facteur)
- **Action principale** : Lecture ; lien « versions archivées » en bas
- **Priorité** : P2 · **Constats** : 5
  - 1 303 lignes, une vingtaine de cartes empilées, sans sommaire ni ancres (aucun `id`, aucun `href="#…"`) : impossible de pointer « article 8.10 » depuis l’app ou un courriel.
  - Titres surdimensionnés : le h1 sous `.site-public` reçoit clamp(42px,4.8vw,68px) (vitrine.css:5), soit 4 à 5 lignes à 390 px pour ce titre ; les h2 d’article (`text-[length:var(--pas-section)]`, 20 px, en couche) sont très probablement écrasés par `.gerimmo-prestige .site-public h2` (30–43 px) — à confirmer au rendu.
  - Utilisateur connecté (ou locataire en marque blanche) : page qui « appartient à la vitrine », sans retour vers l’espace.
  - Lien « Tarifs » en `<a className="underline">` (ligne 509) quand tous les autres liens utilisent `Link` + `lien-texte`.
  - Contrainte forte pour la refonte : le balisage de l’élément contractuel est empreinté et archivé (lib/conditions-versions.ts) ; seules les classes et styles peuvent changer sans nouvelle version, et la liste blanche n’admet ni `id`, ni `<details>`, ni `<nav>`, ni `<svg>` : un sommaire doit vivre hors de l’élément marqué (prop `apres` ou avant).

### 117. `/conditions/artisans` — Conditions de l'espace artisan

- **But** : Conditions d’utilisation propres aux artisans (14 articles A1–A14 et une annexe RGPD), versionnées à part.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Lecture ; liens « versions archivées » et autres conditions en bas
- **Priorité** : P2 · **Constats** : 4
  - Aucun sommaire ni ancre sur 398 lignes ; mêmes titres surdimensionnés que /conditions.
  - Pas d’entrée dans le pied de page (GROUPES_PIED) : `aria-current` n’est jamais posé et la page n’est atteignable que par l’article 1 de /conditions et l’inscription artisan.
  - La navigation et le pied parlent aux propriétaires (« La solution », « Tarifs », « Créer mon compte ») alors que le lecteur est un artisan.
  - Même contrainte d’empreinte et de liste blanche de balisage que /conditions.

### 118. `/conditions/versions` — Versions archivées des conditions générales

- **But** : Lister les versions archivées de chaque document de conditions avec date d’effet, résumé des modifications et empreinte.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Ouvrir une version archivée (« Version du … »)
- **Priorité** : P3 · **Constats** : 3
  - Empreinte SHA-256 de 64 caractères affichée sous chaque version : bruit pour un lecteur non technique, sans explication de l’usage.
  - Pas de fil d’Ariane ni de lien retour vers /conditions en tête (seulement « Version en vigueur » dans chaque carte).
  - h1 long soumis à la règle hero `.site-public h1` (42–68 px).

### 119. `/conditions/versions/[document]/[version]` — Celui du texte archivé (injecté tel quel par dangerouslySetInnerHTML) ; aucun h1 propre à la page

- **But** : Afficher une version archivée des conditions telle qu’elle a été rangée, avec date d’effet, date d’archivage et empreinte.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Lecture ; liens « Toutes les versions archivées » et « Version en vigueur »
- **Priorité** : P3 · **Constats** : 3
  - Dans les états d’erreur (lecture impossible, balisage refusé) la page n’a aucun h1.
  - Le texte archivé garde les noms de classes de l’époque : une refonte qui renomme ou supprime `loc-carte`, `lien-texte`, `tableau`, `mono-discret` changera ou cassera l’apparence des versions déjà archivées (il faudra conserver des alias).
  - Aucun signal visuel fort distinguant « archive » de « version en vigueur » : même coquille, même mise en page, seul un encart de même style que les articles.

### 120. `/confidentialite` — Confidentialité

- **But** : Politique de confidentialité : responsable, bases légales, données, prestataires, durées de conservation, sécurité, droits.
- **Accès** : les deux (public, traversable connecté, lisible même avant validation du second facteur)
- **Action principale** : Lecture ; exercice des droits renvoyé vers « Aide et retours » ou l’adresse de contact
- **Priorité** : P2 · **Constats** : 4
  - 851 lignes, 9 sections et 7 tableaux sans sommaire ni ancres : « Combien de temps » ou « Vos droits » ne sont pas adressables.
  - Titres surdimensionnés par les règles `.site-public h1/h2/h3` (h3 de tableau forcés à 19 px, h2 30–43 px probables).
  - Six tableaux à trois colonnes dans une colonne de 768 px : défilement horizontal sur mobile (`tableau-defilant`), lecture pénible.
  - Rupture pour un locataire connecté (éventuellement en marque blanche) : marque et marketing Gerimmo, pas de retour.

### 121. `/mentions-legales` — Mentions légales

- **But** : Identité et coordonnées de l’éditeur, hébergeurs, médiation de la consommation.
- **Accès** : les deux (public, traversable connecté, lisible même avant validation du second facteur)
- **Action principale** : Lecture ; liens vers conditions et confidentialité
- **Priorité** : P3 · **Constats** : 3
  - Titres soumis aux règles hero de `.site-public` (h1 42–68 px, h2 d’article probablement 30–43 px) pour trois courtes cartes.
  - La liste de liens en bas (« Conditions générales », « Données personnelles et confidentialité ») double le pied de page situé juste dessous.
  - Tant qu’un seul fait manque, la bordure rouge « destructive » en tête donne à une page légale l’allure d’une erreur.

### 122. `/journal` — Ce qu'il faut savoir, au moment où ça compte

- **But** : Liste des 50 derniers articles publiés du journal.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Ouvrir un article (carte entièrement cliquable)
- **Priorité** : P2 · **Constats** : 5
  - Classes du h1 (`text-3xl sm:text-4xl font-heading`) sans effet : `.site-public .public-page-intro h1` impose clamp(36–54 px) et prestige.css la police Georgia.
  - `group-hover:underline` sur le h2 de carte alors qu’aucun ancêtre ne porte la classe `group` : survol inopérant.
  - Classe `bg-[var(--creme)]` de l’enveloppe sans effet (`.site-public {background:#f8f7f4}` hors couche l’emporte).
  - Panne de lecture affichée comme « Le premier article arrive » : état d’erreur absent.
  - Double implémentation du journal (vitrine et espace propriétaire) à maintenir en parallèle.

### 123. `/journal/[slug]` — Titre de l’article (titreSansDoublon)

- **But** : Lire un article du journal, avec illustration, chapo, corps Markdown et incitation à créer un compte.
- **Accès** : les deux (public, traversable connecté)
- **Action principale** : Lecture ; « Créer mon compte — … d’essai » → /inscription
- **Priorité** : P2 · **Constats** : 4
  - h1 `text-3xl sm:text-4xl` écrasé par `.gerimmo-prestige .site-public h1` (42–68 px) : titres d’article longs très volumineux sur mobile, à confirmer au rendu.
  - La colonne `sources` est lue en base (select ligne 20) mais jamais affichée, alors que la liste promet des règles « sourcées ».
  - Pas d’auteur, de temps de lecture ni d’articles liés ; deux encarts promotionnels consécutifs en fin d’article (« Dans Gerimmo » puis EncartOutils).
  - Rendu différent de la même publication dans l’espace propriétaire (/agence/[orgId]/journal/[slug]).

### 124. `/inscription` — Ouvrir mon espace propriétaire

- **But** : Auto-inscription du propriétaire bailleur (nom, e-mail, qualité, code de parrainage) avant confirmation de l’adresse.
- **Accès** : public uniquement : un connecté est redirigé vers /espaces (REDIRECT_SI_CONNECTE dans src/proxy.ts)
- **Action principale** : « Ouvrir mon espace »
- **Priorité** : P1 · **Constats** : 4
  - `<select>` natif stylé à la main à côté d’`Input` partagés : hauteur et rayon peuvent différer.
  - Hauteurs de champ incohérentes dans le même formulaire : `min-h-11` sur nom, e-mail, prénom mais pas sur « Nom de la société ».
  - Aucun lien vers les pages légales ni vers l’accueil hors du logo ; sur téléphone la mention du panneau (« sans carte ») disparaît avec lui (compensé par le chapo).
  - Le libellé du bouton (« Ouvrir mon espace ») ne dit pas qu’un e-mail de confirmation suivra ; l’information est dans un paragraphe gris au-dessus.

### 125. `/connexion` — Connexion

- **But** : Connexion par e-mail et mot de passe pour tous les rôles, avec message contextuel selon la raison d’arrivée.
- **Accès** : public uniquement : un connecté est redirigé vers /espaces
- **Action principale** : « Se connecter »
- **Priorité** : P1 · **Constats** : 4
  - Trois apparences d’alerte dans la même carte : bandeau de message ad hoc, AlerteFormulaire pour l’erreur, et texte simple ailleurs.
  - Pas d’affichage/masquage du mot de passe.
  - Le pied de carte empile quatre liens textuels (mot de passe oublié, propriétaire, artisan) de 44 px chacun : la carte dépasse la hauteur d’un petit écran.
  - Aucun lien vers les pages légales ou l’assistance depuis l’écran de connexion.

### 126. `/mot-de-passe-oublie` — Mot de passe oublié (ou « Choisissez votre mot de passe » après confirmation d’adresse)

- **But** : Demander l’envoi d’un lien de réinitialisation du mot de passe.
- **Accès** : public uniquement : un connecté est redirigé vers /espaces
- **Action principale** : « Envoyer le lien »
- **Priorité** : P3 · **Constats** : 2
  - Variante « Choisissez votre mot de passe » : chapo de trois longues phrases dans une colonne de 340 px.
  - Le succès ne propose pas de renvoyer le lien ni d’indiquer de vérifier les indésirables.

### 127. `/nouveau-mot-de-passe` — Nouveau mot de passe (ou « Choisir mon mot de passe » à la première activation)

- **But** : Choisir son mot de passe après un lien e-mail et, à la première activation, vérifier son profil et accepter les conditions.
- **Accès** : session de récupération requise (sans session → /connexion?raison=lien-invalide ; second facteur requis → /securite ; non autorisé → /compte)
- **Action principale** : « Changer le mot de passe » / « Choisir mon mot de passe » / « Créer mon espace »
- **Priorité** : P2 · **Constats** : 4
  - À la première activation, jusqu’à 12 champs (profil, coordonnées, qualité, parrainage, conditions, deux mots de passe) dans une colonne de 340 px : formulaire très long pour une étape annoncée comme « choisir mon mot de passe ».
  - `<select>` natifs d’un autre gabarit que les `Input` voisins (rayon md contre lg, pas de min-h-11).
  - Chapo qui répète deux fois la règle des douze caractères, déjà dite dans le panneau et sous le champ.
  - Une panne de vérification lève une exception : l’utilisateur tombe sur la carte d’erreur racine sans coquille.

### 128. `/auth/confirmer` — Accéder à votre compte / Confirmez votre adresse / Votre mot de passe (selon le type de lien)

- **But** : Page intermédiaire d’un lien reçu par e-mail : le jeton n’est consommé qu’au clic sur le bouton (POST vers /auth/confirm).
- **Accès** : les deux (public, traversable connecté) ; noindex, no-referrer, no-store
- **Action principale** : « Confirmer mon adresse » / « Choisir mon mot de passe » / « Continuer »
- **Priorité** : P3 · **Constats** : 3
  - Champ e-mail natif (`rounded-md border bg-background`) au lieu de ui/Input + ui/Label : seul champ d’authentification de ce gabarit.
  - État « autre-adresse » : un paragraphe sans titre ni action, sans indication de la suite.
  - « Recevoir un nouveau lien » renvoie vers /mot-de-passe-oublie même pour un lien d’inscription ou d’invitation.

### 129. `/securite` — Sécurité du compte

- **But** : Sas du second facteur : saisir (ou configurer) le code TOTP avant d’accéder à un espace qui l’exige (supervision).
- **Accès** : connecté (sans session → /connexion) ; atteignable avant la validation du second facteur
- **Action principale** : « Vérifier et continuer » (ou « Configurer mon application » puis « Activer et continuer »)
- **Priorité** : P2 · **Constats** : 5
  - Même titre « Sécurité du compte » (h1 et onglet) que /compte, pour une page au rôle différent (sas de vérification).
  - Seule page connectée sans bandeau : identité réduite à un logo flottant, mise en page distincte de /compte et /espaces.
  - Le bouton dit « Continuer vers mes espaces » même quand la destination est autre (`suite`).
  - « demandez au responsable technique de réinitialiser… » : jargon sans lien ni coordonnées ; le lien « Confidentialité » en bas ouvre la vitrine dans le même onglet.
  - Le composant d’inscription TOTP est dupliqué avec src/app/compte/second-facteur.tsx (deux implémentations du même parcours).

### 130. `/compte` — Sécurité du compte

- **But** : Entretenir son compte : identifiants, mot de passe, double authentification, conditions acceptées, données personnelles.
- **Accès** : connecté (sans session → /connexion)
- **Action principale** : « Changer le mot de passe »
- **Priorité** : P1 · **Constats** : 5
  - Rupture avec l’espace d’origine : plus de barre latérale ni de menu de compte, colonne centrée de 672 px sur fond `--creme` (#f7f8fa) et cartes `.loc-carte` à rayon 12 px et 28 px de marge intérieure (prestige.css:179), contre fond #f4f6f8 et cartes à rayon 14 px et 22–24 px de marge dans les espaces (`.experience-unifiee`, `.espace-proprietaire`).
  - Libellé de retour indirect pour le propriétaire et l’admin (« Mes espaces » au lieu de « ← Mon espace » / « ← Supervision »), et marque Gerimmo affichée à l’agent d’une agence en marque blanche.
  - Le h1 « Sécurité du compte » ne couvre pas le contenu (conditions générales, données personnelles) ; le menu du locataire y mène sous deux libellés (« Sécurité du compte », « Mes données personnelles »).
  - Deux requêtes identiques aux adhésions (lireMarqueLocataire, lireEspaceLocataire) et quatre styles d’alerte dans la page (texte rouge, bandeau vert, role=alert nu, puce).
  - Les liens « Lire la politique de confidentialité » et « consulter » (conditions) ouvrent la vitrine dans le même onglet.

### 131. `/compte/donnees` — Mes données personnelles

- **But** : Déposer et suivre une demande RGPD (accès, correction, effacement, fermeture du compte) et préparer l’archive complète de ses espaces.
- **Accès** : connecté (sans session → /connexion?suite=/compte/donnees)
- **Action principale** : « Enregistrer ma demande »
- **Priorité** : P2 · **Constats** : 5
  - Seule page de compte sans aucune coquille : ni marque, ni bandeau, ni déconnexion — elle paraît étrangère à /compte dont elle dépend.
  - Hiérarchie de titres fautive : chaque demande est un `<h2 class="text-lg!">` sous le h2 « Mes demandes » ; plusieurs h2 de section sans classe héritent du Georgia 24 px.
  - Largeur de colonne différente de /compte (max-w-3xl contre max-w-2xl) : saut de mise en page entre les deux écrans.
  - Titre d’onglet et « Réponse de Gerimmo » codés en dur : la marque blanche du locataire respectée sur /compte est perdue ici.
  - Pagination en liens nus « Précédente / Suivante » sans style ni zone de toucher, et état vide « Aucune demande sur cette page. » sans guidage.

### 132. `/espaces` — Mes espaces (ou « Mes invitations », ou « Que voulez-vous faire ? » pour un compte sans espace)

- **But** : Aiguillage après connexion : redirige vers l’espace unique, sinon liste les espaces, invitations et anciens espaces, ou propose d’en ouvrir un.
- **Accès** : connecté (sans session → /connexion) ; super admin redirigé vers /admin/brief ; espace unique → redirection directe
- **Action principale** : Choisir un espace (carte) ; compte sans espace : « Ouvrir mon espace »
- **Priorité** : P1 · **Constats** : 5
  - Trois gabarits de carte dans la même liste : `.carte-espace` avec pastille (espaces), `.carte-espace` sans pastille (relais, invitations), et carte « ancien espace » en classes ad hoc à angles vifs avec glissement latéral (`hover:translate-x-[3px]`, reste de la charte v2).
  - Pastilles d’initiales génériques (« AR », « PR », « LO ») sans icône de rôle ni marque de l’organisation : rien n’annonce l’identité visuelle de l’espace où l’on va entrer.
  - Formulaire d’ouverture d’espace déplié à l’intérieur d’une carte cliquable, avec un `<select>` natif et une case à cocher d’un autre gabarit que les `Input`.
  - Paragraphe final en 12 px (« Le même compte peut porter plusieurs rôles… ») et libellé « Console d’administration » jamais affiché (redirection préalable).
  - Page écrite comme une suite de redirections (339 lignes) : en cas de lenteur l’utilisateur ne voit que le rond plein écran de loading.tsx, sans marque.

### 133. `/assistance` — Aide et retours

- **But** : Écrire à l’équipe Gerimmo (problème, question, idée, réclamation, contestation d’artisan) et suivre les réponses ; soutenir les idées.
- **Accès** : connecté (sans session → /connexion?suite=/assistance) ; le propriétaire direct est redirigé vers l’aide intégrée /espace/<id>/faq
- **Action principale** : « Envoyer ma demande »
- **Priorité** : P2 · **Constats** : 5
  - Troisième variante du même bandeau (largeur 1 200 px, rembourrage du module) : ni celle de /compte ni celle de /espaces, et jamais la marque de l’organisation (locataire en marque blanche → logo Gerimmo).
  - Typographie propre à la page (corps 12–13 px, mentions 10–11 px, h1 36 px en dur) : plus petite et plus dense que les espaces (corps 14–15 px).
  - Onglets rendus comme de grosses cartes-liens, sans rôle tablist ; l’onglet actif est en or alors que la navigation des espaces est bleu nuit.
  - Deux rendus du même contenu : page autonome ici, version intégrée `orgIdIntegre` dans l’espace propriétaire (styles `.pageIntegree`) — double mise en page à maintenir.
  - Code compacté sur une seule ligne par bloc (contenu-assistance.tsx, 96 lignes de 300 à 1 500 caractères) : très difficile à faire évoluer.
