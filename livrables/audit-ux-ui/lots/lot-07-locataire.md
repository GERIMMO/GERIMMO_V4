# Lot 7 — Locataire (L00–L24)

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 24 écrans vus, plus le parcours d'invitation (L00, lot 1).
Planches : `../captures/L01.jpg` à `L24.jpg`.

Deux situations réelles ont été regardées, parce que l'espace locataire change complètement de l'une à l'autre :

- **sans bail actif** (L01–L13) : un locataire invité dont le bail n'est pas encore activé ;
- **avec bail actif** (L14–L24) : un locataire arrivé par le vrai parcours d'invitation, avec un loyer payé, une
  quittance et un état des lieux prévu.

## Test des 10 secondes

| Écran | Où suis-je ? | Que dois-je faire ? | Où cliquer ? |
|---|---|---|---|
| Accueil, bail actif (L14) | Oui : adresse du logement en tête | Oui : « 1 à faire — Votre attestation d'assurance manque » | Oui : « Déposer » |
| Accueil, sans bail (L03) | Oui | **Non** : rien ne dit en tête que le bail n'est pas encore actif | Pas d'action proposée |
| Mes paiements (L15) | Oui | Oui : « Tous vos loyers sont à jour » | Oui : la quittance |
| Mes documents (L16) | Oui | Ambigu : « 2 documents disponibles », mais on voit un formulaire d'assurance | Il faut deviner l'onglet « Mes fichiers » |
| Signaler un problème (L20) | Oui | Oui | Oui |
| Mon gestionnaire (L19) | Partiellement : « Parc d'Élise Morel » n'est pas un nom de personne | Oui | L'assistant passe avant le contact humain |

## Ce qui fonctionne

- **C'est l'espace le plus abouti de Gerimmo.** Vocabulaire simple, pas de jargon comptable, une action principale
  par écran.
- **L'accueil avec bail actif (L14)** est le bon modèle : adresse et surface du logement, un seul « à faire » avec son
  bouton, puis loyer, documents, demandes.
- **Mes paiements (L15)** : « Tous vos loyers sont à jour », la quittance de novembre téléchargeable et l'attestation
  de bon paiement à côté. C'est exactement ce qu'un locataire vient chercher.
- **Signaler un problème (L20)** : les photos d'abord, la pièce, « Est-ce urgent ? », et « Qui paiera ? » expliqué
  avant l'envoi. Meilleur formulaire de l'application.
- **Mon logement (L18)** : préavis, loyer, dépôt de garantie (avec la règle de restitution en une phrase), état des
  lieux et « Annoncer mon départ ». Un locataire comprend sa situation sans aide.
- **La quittance et l'attestation (L23, L24)** : des documents nets, imprimables, au niveau d'un cabinet.
- **Les états vides sans bail** sont bien rédigés : « Aucun bail actif — votre logement apparaîtra ici dès la
  signature de votre bail », « La déclaration nécessite un bail actif ».
- **La barre du bas au téléphone** (Accueil, Documents, Paiements, Demandes, Menu) est constante et bien choisie.

## Ce qui complique l'utilisation

- **« Mon gestionnaire » pour un propriétaire particulier.** Le locataire de Mme Morel lit « Mon gestionnaire —
  Parc d'Élise Morel » (L14, L19) et « Écrire à Parc d'Élise Morel ». « Parc d'… » est le nom interne de
  l'organisation : il ne correspond à personne. Un locataire de particulier cherche « Ma propriétaire » ou « Élise
  Morel ».
- **L'assistant avant l'humain.** Sur « Mon gestionnaire » (L04, L19), le premier bloc est « Demander à Gerimmo »
  (assistant automatique). Le locataire qui vient écrire à son bailleur doit passer dessous ; au téléphone, les
  coordonnées du bailleur n'arrivent que sous le formulaire.
- **Mes documents s'ouvre sur le mauvais onglet (L06, L16).** L'en-tête annonce « 2 documents disponibles », mais
  l'écran montre l'onglet « À transmettre » et un formulaire d'assurance ; le bail et la quittance sont sous
  « Mes fichiers ». Même défaut que les Incidents côté propriétaire (P13) : la vue par défaut cache ce qui existe.
- **Sans bail actif, l'accueil ne dit pas la situation (L03).** Il affiche « Tout est en ordre ✓ » et
  « Rien à régler », et c'est dans une petite phrase sous « Mes demandes » qu'on apprend que le bail n'est pas actif.
  Le locataire ne sait pas s'il doit attendre ou agir.
- **Préavis indéterminé (L18)** : « 1 mois si le logement est en zone tendue, 3 mois sinon (zone en cours de
  vérification par votre gestionnaire) ». Le locataire ne sait pas quel délai s'applique à lui.

## Ce qui surcharge les écrans

- **Le bloc « En cas d'urgence »** (gaz, 112, robinet d'arrêt) est répété sur l'accueil, les demandes et le contact
  (L03, L04, L05, L14, L17, L19). Utile une fois ; répété, il pousse le contenu de la page vers le bas et banalise
  l'alerte.
- **Les pages de compte** (L02 sécurité, L13 données personnelles) : 308 et 219 mots, des pavés juridiques
  (« Ce qui peut être conservé », perte du second facteur), et des phrases destinées à d'autres profils
  (« … ou à l'assistance pour un compte propriétaire »).
- **Mes paiements sans bail (L11)** : un paragraphe sur la durée de conservation des quittances (« retiré trois ans
  après la fin du bail ») alors qu'aucune quittance n'existe encore.

## Incohérences de design

- **Pages hors gabarit** : L01/L23 attestation, L02 sécurité, L12 règles, L13 données. Le menu locataire et la barre
  du bas disparaissent ; on revient par un petit lien « ← Revenir à mon espace ». Acceptable pour un document à
  imprimer (L23, L24), pas pour les pages de compte et les règles.
- **Volets natifs à triangles** dans la FAQ (L08, L22 : six petites cibles mesurées au téléphone) et sur « Réception
  de mes documents » (L06), à côté des volets maison du reste de l'espace.
- **Légende technique** « Pastille rouge : champ obligatoire à compléter » (L06, L16), au lieu d'un simple
  « obligatoire » à côté du champ.
- **Nom avant prénom** : « Morel Élise », « Rivière Sam » sur l'attestation (L23) ; « Bonjour Sam » ailleurs.
- **Règles à connaître (L12)** : le filtre « Propriétaires bailleurs » est proposé à un locataire, et la page est
  vide.
- **Grands vides à 1440** sur les écrans courts (L01, L07, L09, L10) : une carte étroite au milieu d'une page blanche.

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| L14, L19 Mon gestionnaire | `L14.jpg`, `L19.jpg` | Le bailleur particulier apparaît comme « Mon gestionnaire — Parc d'Élise Morel ». | Le locataire ne reconnaît pas son propriétaire ; impression d'un intermédiaire inconnu. | Pour un compte de propriétaire particulier ou de SCI : « Ma propriétaire — Élise Morel » (ou « Mon bailleur — SCI des Amandiers »). Réserver « Mon gestionnaire » aux agences. Ne jamais afficher le nom interne « Parc de … ». | P1 |
| L06, L16 Mes documents | `L16.jpg` | « 2 documents disponibles », mais l'écran ouvre « À transmettre » et un formulaire. | Le locataire croit que son bail et ses quittances ne sont pas là. | Ouvrir sur « Mes documents » (bail, quittances) ; afficher la demande d'assurance comme une carte « À faire » au-dessus de la liste. | P1 |
| L03 Accueil sans bail | `L03.jpg` | Aucune explication en tête ; « Tout est en ordre ✓ » alors que rien n'est ouvert. | Le locataire ne sait pas s'il doit attendre ou agir ; il appelle son bailleur. | Un bandeau d'état en tête : « Votre bail n'est pas encore activé. Votre espace s'ouvrira dès que votre propriétaire aura déposé le contrat signé. » avec le bouton « Écrire à ma propriétaire ». | P2 |
| L04, L19 Contact | `L19.jpg` | L'assistant « Demander à Gerimmo » passe avant le contact humain ; coordonnées sous le formulaire au téléphone. | Le locataire doit chercher comment écrire à son bailleur. | Mettre « Écrire à … » et le téléphone en premier ; l'assistant en dessous, replié, « Une question générale ? Demandez à Gerimmo ». | P2 |
| L03, L04, L05, L14, L17, L19 Urgence | `L14.jpg` | Le même bloc d'urgence répété sur six écrans. | Pages allongées ; l'alerte perd sa force. | Un seul bouton « Urgence » (rouge, discret) dans l'en-tête ou la barre du bas, qui ouvre le bloc ; le garder en entier seulement dans « Signaler un problème ». | P2 |
| L18 Mon logement | `L18.jpg` | Préavis « 1 ou 3 mois (zone en cours de vérification) ». | Le locataire ne connaît pas son délai de départ. | Afficher le délai réel dès que la commune est connue ; tant qu'il ne l'est pas, « 3 mois, ou 1 mois si votre commune est en zone tendue — votre propriétaire vous le confirmera ». | P3 |
| L02, L13 Compte | `L02.jpg`, `L13.jpg` | Hors gabarit, longues, phrases pour d'autres profils, ton juridique. | Rupture de navigation ; inquiétude inutile. | Les afficher dans le gabarit locataire ; trois blocs courts (mot de passe, double authentification, mes données) ; le texte juridique dans un volet « En savoir plus ». | P3 |
| L08, L22 FAQ | `L22.jpg` | Volets natifs à triangles, petites cibles tactiles. | Moins soigné que le reste ; difficile au doigt. | Reprendre les volets maison des autres écrans, hauteur de cible d'au moins 44 px. | P3 |
| L12 Règles | `L12.jpg` | Hors gabarit, vide, filtre « Propriétaires bailleurs ». | Impasse. | Masquer l'entrée de menu tant que rien n'est publié pour les locataires ; retirer les filtres des autres profils. | P3 |
| L09 Signaler sans bail | `L09.jpg` | « Contactez votre gestionnaire » sans bouton. | Une impasse de plus. | Ajouter le bouton « Écrire à ma propriétaire ». | P3 |

## Bilan de l'espace locataire

L'espace locataire est **simple, rassurant et presque prêt**. Les quatre tâches qu'un locataire fait vraiment
(payer, retrouver une quittance, signaler un problème, prévenir de son départ) se font sans aide. Trois corrections
le rendraient irréprochable :

1. nommer le bailleur par son nom ;
2. ouvrir « Mes documents » sur les documents ;
3. regrouper le bloc d'urgence en un seul bouton.
