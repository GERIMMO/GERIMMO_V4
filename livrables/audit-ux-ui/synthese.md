# B. Synthèse par espace et verdict

Version **dca39641** · 163 écrans inventoriés, 159 notés, vus à 390, 768 et 1440 px sur un banc fictif. Détail par
écran : `inventaire.md` ; constats détaillés : `lots/`.

## Vue d'ensemble

| Espace | Écrans notés | Simplicité /5 | Esthétique /5 | Cohérence /5 |
|---|---|---|---|---|
| Pages d'entrée | 9 | 3,4 | 3,6 | 3,3 |
| Propriétaire bailleur (SCI, débutant, compte neuf) | 58 | 3,4 | 3,8 | 3,3 |
| Locataire | 25 | 3,7 | 3,6 | 3,1 |
| Artisan | 26 | 3,5 | 3,7 | 3,5 |
| Super-administrateur | 41 | 3,0 | 3,7 | 3,3 |

Gerimmo a **une vraie identité premium** : photographie d'ambiance, titres à empattements, bleu nuit et or, cartes
aérées, salutations personnelles (« Bonjour Claire »). Elle tient sur les quatre espaces ; c'est un acquis à
préserver.

Le problème n'est pas l'apparence, c'est **la quantité de choses montrées en même temps** et **le vocabulaire**.
Trop d'écrans empilent tout au même niveau : une fiche d'incident de 12 sections, une fiche logement de 12 blocs, une
facturation de 3 676 px au téléphone. Les écrans d'argent parlent comme un comptable (« écriture », « imputation »,
« clôture irréversible »). La console parle comme un développeur (« passages », « consignes versionnées »,
identifiants bruts).

**Le meilleur de Gerimmo est dans les gestes courts** :
- la quittance ;
- le parcours de mission de l'artisan au téléphone ;
- la déclaration d'un problème par le locataire ;
- l'accueil d'un propriétaire qui a un vrai loyer encaissé.

Ces écrans montrent le niveau à atteindre partout : **un état, une action, une phrase**.

---

## 1. Propriétaire bailleur (particulier, SCI, multi-patrimoine)

### Ce qui fonctionne
- **L'accueil d'un débutant avec un loyer encaissé (P39)** : « Loyers du mois : 640,00 € sur 640,00 € » avec une
  barre, et trois événements concrets. Les montants concordent entre l'accueil, Finances, le livre et la fiche du
  logement.
- **Les actions rapides** (Ajouter un bien, Créer une location, Ajouter une opération, Déclarer un incident, Ajouter un
  document) et la **barre du bas au téléphone** (Accueil, Biens, Finances, Incidents, Menu).
- **La quittance (P34)**, meilleur écran de l'application, et **le catalogue « Préparer un document » (P21)** : sept
  situations de vie, sans jargon.
- **Les formulaires courts et guidés** : déclaration d'incident (P14), profil en 3 étapes (P19), état des lieux en
  4 étapes (P51).
- **Le bail (P28)** : un bloc « À faire maintenant » numéroté et des onglets clairs.
- **Le multi-patrimoine est pris en charge** : filtre « Propriétaire / société — Tout mon patrimoine » en Finances
  (P11), une carte par propriétaire (nom propre, SCI) dans l'aide fiscale (P04), la SCI comme fiche dans Personnes (P10).

### Ce qui complique l'utilisation
- **Le bandeau ambre** « … les avis d'échéance par courriel restent suspendus », en haut de chaque page, 3 lignes au
  téléphone. Le premier mot qui retient l'attention d'un nouveau client est « suspendus ».
- **Finances en deux pages** (P11 Finances, P12 Livre recettes-dépenses), avec les mêmes totaux, des filtres à valider
  par « Afficher », et des onglets de comptable (Journal, Ajouter une écriture, Clôture : P59–P61).
- **Le détail d'un incident (P30)** : 12 sections et 4 300 px au téléphone, sans dire ce qu'on attend du propriétaire
  (régler 100 €, noter l'artisan).
- **Incidents (P13)** s'ouvre sur une vue vide (« Rien dans cette vue ») alors que deux incidents existent ; l'onglet
  « Tous » (P55) montre ce qu'il faudrait voir d'emblée.
- **L'accueil (P07)** : chiffres contradictoires (« Terminer votre première location 3/6 » avec 2 locations en cours ;
  « 6 demandes » contre « Mes événements 10 ») et une fenêtre « 6 demandes à traiter » (P38) qui ne nomme aucune
  demande.
- **L'abonnement (P01)** : un récapitulatif de paiement complet, sans bouton pour payer.
- **L'aide fiscale (P04)** : « déclaration 2026 » pour des revenus déclarés en 2027 ; « Référence de vérification ».

### Ce qui surcharge les écrans
- Accueil : bandeau + bonjour + 3 tuiles + 5 actions + parcours guidé + 10 événements + articles.
- Fiche logement (P26) : 12 blocs, 3 750 px au téléphone.
- Reprise des comptes (P33) : « balance d'ouverture », « bascule », codes `depot_garantie`, `fonds_mandant`.
- Documents (P20) : titres techniques (« Facture FA-2026-c31103cd — incident INC-2026-0002 ») et pastille « À
  vérifier » sur chaque document.

### Ce qu'il faut simplifier
- L'accueil : un seul bloc « À faire maintenant » (trois tâches au plus, avec le nom du logement), puis les tuiles.
- Finances : une page, trois onglets (Loyers · Dépenses · Bilan de l'année).
- L'incident : « Ce qu'il vous reste à faire » en tête, le reste en onglets.
- La fiche logement : des onglets (Résumé · Location · Argent · Documents · Caractéristiques).

### Ce qu'il faut supprimer ou regrouper
- Supprimer la fenêtre « 6 demandes à traiter » (P38) au profit du bloc « À faire maintenant ».
- Regrouper Livre, saisie d'écriture, clôture et reprise sous « Pour mon comptable ».
- En compte neuf (P44) : masquer les tuiles à zéro et les quatre actions rapides impossibles tant qu'il n'y a pas de
  bien.
- Masquer « Les règles à connaître » tant que la page est vide.

### Incohérences de design
- Couleurs de cartes sans signification constante (rose pour « Incidents » même sans incident, vert, sable).
- Pages de compte hors du gabarit de l'espace (P25, P36), plus de menu ni de barre du bas.
- Volets natifs à triangles (Paramètres, Messages, P62) à côté des volets maison.
- « Moreau Claire » (Nom Prénom) dans Personnes, « Bonjour Claire » sur l'accueil.
- « Journal » désigne à la fois le blog et le registre comptable.
- Panneaux vides « Sélectionnez un bien » sur la moitié de l'écran à 1440 (P08, P18, P40).

### Les meilleures améliorations
1. Un accueil « À faire maintenant » et un parcours de compte neuf réduit à « Ajoutez votre premier bien ».
2. Le bandeau « suspendus » retiré des pages, remplacé par une information unique et positive.
3. Finances en une page sans vocabulaire comptable.
4. L'incident en « ce qu'il vous reste à faire ».

---

## 2. Locataire

### Ce qui fonctionne
- **C'est l'espace le plus simple de Gerimmo** (simplicité 3,7/5, aucun écran à 2 ou moins).
- **L'accueil avec bail actif (L14)** : adresse et surface, un seul « à faire » avec son bouton (« Votre attestation
  d'assurance manque — Déposer »), puis loyer, documents, demandes.
- **Mes paiements (L15)** : « Tous vos loyers sont à jour », la quittance téléchargeable, l'attestation à côté.
- **Signaler un problème (L20)** : photos d'abord, pièce, urgence, « Qui paiera ? » expliqué.
- **Mon logement (L18)** : préavis, dépôt de garantie expliqué en une phrase, état des lieux, « Annoncer mon départ ».
- **Les états vides sans bail** sont bien rédigés (« Aucun bail actif — votre logement apparaîtra ici dès la signature
  de votre bail »).

### Ce qui complique l'utilisation
- **« Mon gestionnaire — Parc d'Élise Morel »** pour un propriétaire particulier : « Parc d'… » est un nom interne qui
  ne désigne personne.
- **Mes documents** annonce « 2 documents disponibles » mais s'ouvre sur l'onglet « À transmettre » et un formulaire
  d'assurance (L06, L16).
- **Sans bail actif, l'accueil (L03)** ne dit pas la situation et affiche « Tout est en ordre ✓ ».
- **Le contact (L04, L19)** commence par l'assistant « Demander à Gerimmo », avant le moyen d'écrire au bailleur.
- **Le préavis (L18)** reste « 1 mois ou 3 mois (zone en cours de vérification) ».

### Ce qui surcharge les écrans
- Le bloc « En cas d'urgence » répété sur six écrans.
- Les pages de compte (L02, L13) : 308 et 219 mots, ton juridique, phrases destinées à d'autres profils.

### Ce qu'il faut simplifier
- Nommer le bailleur : « Ma propriétaire — Élise Morel », « Mon bailleur — SCI des Amandiers ».
- Ouvrir « Mes documents » sur les documents.
- Mettre un bandeau d'état en tête de l'accueil quand le bail n'est pas actif.

### Ce qu'il faut supprimer ou regrouper
- Regrouper l'urgence en un seul bouton rouge discret ; le bloc complet seulement dans « Signaler un problème ».
- Masquer « Les règles à connaître » tant qu'elle est vide ; retirer le filtre « Propriétaires bailleurs » côté
  locataire.

### Incohérences de design
- Pages hors gabarit : sécurité (L02), règles (L12), données personnelles (L13).
- Volets natifs à triangles dans la FAQ (six petites cibles au téléphone).
- Légende « Pastille rouge : champ obligatoire à compléter ».
- « Morel Élise », « Rivière Sam » sur l'attestation (Nom Prénom).

### Les meilleures améliorations
1. Le nom du bailleur à la place de « Mon gestionnaire — Parc de … ».
2. « Mes documents » ouvert sur les documents.
3. Le bloc d'urgence regroupé en un bouton.

---

## 3. Artisan

### Ce qui fonctionne
- **Le parcours de mission au téléphone est le meilleur de Gerimmo** : chaque état a son grand bouton (« Rendre compte
  du travail », grande zone « Photographier le travail terminé », « Déposer ma facture ») et une phrase d'explication
  (A23, A24, A25).
- **Les renvois sont expliqués** : « Le bilan ne s'ouvre qu'une fois l'intervention démarrée : le bouton est
  ci-dessous » (A22).
- **Préparer un devis (A05)** : assistant en 4 étapes, base proposée, « Je ne peux pas chiffrer cette demande ».
- **Mes attestations, Mon entreprise (A03, A06)** : ce qui manque et pourquoi (« Déposez votre décennale pour être
  proposé sur les travaux qui l'exigent »).
- **L'état d'erreur (A14)** est rassurant.

### Ce qui complique l'utilisation
- **Ma facturation (A07)** ne dit pas « on vous doit 300 € » ; elle commence par un registre de règlements avec des
  références (« FA-2026-da086839 · Déclaré reçu 0,00 € · Solde 100,00 € »).
- **Pas de « Factures » dans la barre du bas** : au téléphone, la facturation est à deux niveaux.
- **Le chantier externe (A18)** : trois formulaires sur 2 800 px, vocabulaire juridique (« Consigner l'acceptation
  avec sa preuve »).
- **Le devis affiche « Total TTC : 0,00 € »** tant que la TVA n'est pas choisie.
- **Proposer des créneaux (A11)** : neuf champs pour trois créneaux.

### Ce qui surcharge les écrans
- Agenda (A02) : les brouillons de chantiers externes avant le calendrier.
- Clients externes (A16) : recherche, liste, formulaire de création et cinq boutons-pastilles sur la même page.
- Le bilan (A10) : un paragraphe long sur l'« imputation ».

### Ce qu'il faut simplifier
- La facturation : « On vous doit … » en tête, puis une ligne par facture.
- Le chantier externe : n'afficher que l'étape suivante.
- Les créneaux : une grille de demi-journées à toucher.

### Ce qu'il faut supprimer ou regrouper
- Supprimer les boutons-pastilles qui doublent le menu (A16, A17, A18, A19, A26).
- Mettre « Factures » dans la barre du bas, le reste dans « Menu ».

### Incohérences de design
- Bouton principal doré (« Suivant » du devis) au lieu du bleu nuit.
- Actions en liens texte sur une mission en attente (A21), grands boutons ailleurs.
- Références techniques (« dossier 727efb3a », « ESSAI identité 81c13b3b »).
- Données personnelles (A20) hors gabarit, avec un texte écrit pour les locataires.
- À 768 px, navigation de téléphone et moitié droite de l'écran vide.

### Les meilleures améliorations
1. Une facturation qui commence par la somme due.
2. « Factures » dans la barre du bas.
3. Un chantier externe qui ne montre que l'étape suivante.

---

## 4. Super-administrateur

### Ce qui fonctionne
- Le même système graphique que le reste de Gerimmo.
- Des états vides bien écrits (S02, S08, S10, S40, S41).
- Les actions sensibles sont encadrées : case à cocher, motif obligatoire, mention du journal d'audit.
- Les écrans de gestion courante sont lisibles : annuaire des espaces (S36), décisions (S34), fiche personne (S32),
  paramètres généraux (S28).

### Ce qui complique l'utilisation
- **Aucune page ne répond à « Comment va Gerimmo aujourd'hui ? »** : l'entrée ouvre les abonnements (S01), le
  « Bureau de direction » (S03) parle d'équipes automatiques et de « point du matin ».
- **Menu de 17 entrées à plat**, avec des doublons (Utilisateurs / Clients ; durées de conservation à trois endroits).
- **Vocabulaire de développeur** : « passages », « consigne version 2 », « compteurs » (S23, S30) ; liste brute
  d'identifiants dans Santé (S18).
- **Pages hors gabarit** (S20 sécurité, S26 relais) et **renvois vers des écrans au mauvais nom** (S21 « Travail des
  équipes » ; le menu dit « Équipes et comptes rendus »).

### Ce qui surcharge les écrans
- Santé (S18) : 3 000 px de codes internes au téléphone.
- Développement commercial (S19) : trois niveaux de tuiles et une dizaine de blocs.
- Couverture du réseau (S29) : 194 communes à « 0 / 0 ».
- Abonnements (S01) : quatre mentions vides par client, 5 200 px pour 8 clients au téléphone.

### Ce qu'il faut simplifier
- Une page « Aujourd'hui » de 4 à 6 chiffres qui appellent une décision, puis la liste « À traiter ».
- Une ligne par automatisme, en français (« Quittances : envoyées ce matin à 9 h (3) »).

### Ce qu'il faut supprimer ou regrouper
- Un menu en cinq groupes : Aujourd'hui · Clients et abonnements · Assistance · Croissance · Exploitation et
  sécurité.
- Supprimer les blocs en double (« Corrections et idées » dans S22 et S35).
- Replier tout le détail technique dans des volets « Pour le développeur ».

### Incohérences de design
- Compteurs isolés sans libellé (S06, S07, S11) ; pluriels non accordés (« 1 rôles », « 1 propositions »).
- Tuile « À préparer » en très gros à la place d'un nombre (S03).
- Pastille « À vérifier » en vert.
- Valeurs par défaut tournées vers les agences (S13, S16).
- Onglets coupés au téléphone (S08, S31, S37) ; en-tête sur deux lignes à 768 px.

### Les meilleures améliorations
1. La page « Aujourd'hui ».
2. Le menu en cinq groupes.
3. Santé et automatismes traduits en phrases de dirigeant, le technique replié.

---

## 5. Pages d'entrée (communes aux quatre espaces)

- **Bien** : connexion et mot de passe oublié sobres, une seule action ; « Propriétaire, locataire ou artisan : la
  même adresse e-mail ouvre votre espace ».
- **Mal** :
  - l'inscription demande neuf champs et un pavé sur le parrainage avant tout essai (E02) ;
  - les liens faux ou expirés laissent sans issue (E07, E08) ou expliquent en termes techniques (E05, E09) ;
  - l'invitation du locataire oblige à se reconnecter après avoir choisi son mot de passe (L00).

---

## Verdict

### Notes sur 10

| Critère | Propriétaire | Locataire | Artisan | Super-admin |
|---|---|---|---|---|
| Compréhension immédiate | 6 | 8 | 7 | 4 |
| Simplicité de navigation | 6 | 8 | 6 | 4 |
| Cohérence visuelle | 6 | 6 | 6 | 6 |
| Esthétique premium | 8 | 7 | 7 | 7 |
| Expérience mobile | 6 | 8 | 8 | 5 |

Lecture des notes :
- **Propriétaire** : très beau, mais trop d'informations au même niveau, des Finances de comptable et des pages très
  longues au téléphone (incident, fiche logement).
- **Locataire** : simple et rassurant ; il perd des points sur la cohérence (bailleur mal nommé, pages hors gabarit,
  volets natifs).
- **Artisan** : excellent sur la mission, faible sur la facturation et les chantiers externes.
- **Super-admin** : complet mais pensé pour un développeur ; le dirigeant n'y voit pas l'essentiel en premier.

### « Si je découvrais Gerimmo aujourd'hui sans aucune explication, aurais-je envie de l'utiliser et serais-je capable de me débrouiller seul ? »

**En propriétaire : oui, j'aurais envie de l'essayer.** L'image est soignée, rassurante, de niveau haut de gamme. Je saurais me débrouiller seul pour les gestes courants : ajouter un bien,
créer une location, voir mon loyer, sortir une quittance, déclarer un incident. Je décrocherais à quatre endroits :
1. l'inscription, trop longue pour un essai ;
2. le bandeau « suspendus », qui me ferait douter du sérieux du service dès la première minute ;
3. les Finances, qui me parlent comme à un comptable ;
4. le détail d'un incident, où je ne trouve pas ce qu'on attend de moi.

**En locataire : oui et oui.** C'est l'espace où l'on se débrouille le mieux seul. Je chercherais seulement qui est
« Parc d'Élise Morel » et où sont mes documents.

**En artisan : oui pour les missions, non pour la facturation.** Sur le chantier, tout est évident. Pour savoir ce
qu'on me doit, il faudrait qu'on m'explique.

**En dirigeant (super-admin) : non, pas sans explication.** Tout y est, mais rien ne me dit d'abord ce qui demande
une décision aujourd'hui.

**En résumé** : Gerimmo donne envie, et ses gestes simples sont réussis. Il faut maintenant **retirer** plus qu'ajouter :
- moins de blocs par écran ;
- moins de vocabulaire de comptable et de développeur ;
- une seule action mise en avant par écran.

Les cinq premières lignes du plan (`plan.md`) suffiraient à rendre l'espace propriétaire aussi simple que l'espace
locataire.
