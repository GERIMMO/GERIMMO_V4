# Lot 6 — Propriétaire débutant (un logement), compte neuf vide, bail, état des lieux

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 15 écrans vus.

Deux comptes en plus de celui des lots 4 et 5 :
- **propriétaire débutant** : « Parc d'Élise Morel », créé par le vrai parcours d'inscription, avec un logement, un
  bail actif et un loyer encaissé ;
- **compte neuf** : « Parc de Camille Pilote », inscrit mais sans aucun bien.

Planches : `../captures/P39.jpg` à `P52.jpg`.

## Ce que voit un débutant

- **Avec un vrai loyer encaissé, l'accueil est réussi (P39).** « Loyers du mois : 640,00 € sur 640,00 € » avec une
  barre de progression, et trois événements concrets : état des lieux à signer, zone tendue à vérifier, taxe foncière
  à saisir. C'est le niveau à viser partout.
- **Les montants concordent** entre l'accueil, Finances, le livre et la fiche du logement (640 € demandés, 640 € reçus,
  0 € restant).
- **L'état des lieux (P51)** est un assistant en 4 étapes, net, avec un sélecteur d'étape au téléphone.

## Ce que voit un compte neuf

- Un bon guidage sur l'accueil : « Terminer votre première location — 1/6 — Ajouter un bien ».
- De bons états vides pour Biens, Documents et Incidents (P45, P48, P49).
- Mais :
  - **Finances et le Livre (P46, P47)** s'affichent comme des écrans comptables vides : neuf boîtes à « 0,00 € » et
    « Clôturer un mois », sans renvoi vers « Ajouter un bien » ;
  - **quatre actions rapides sur cinq** sont impossibles tant qu'il n'y a pas de bien (créer une location, ajouter
    une opération, déclarer un incident, ajouter un document) ;
  - le **bandeau « suspendus »** est la première chose lue par un client qui vient de s'inscrire.

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| P44 Accueil, compte neuf | `P44.jpg` | Tuiles à zéro, cinq actions rapides dont quatre inutiles, bandeau « suspendus ». | Le nouveau client voit un tableau de bord vide et un avertissement avant de voir la seule action utile. | En compte neuf, n'afficher qu'un grand appel « Ajoutez votre premier bien (2 minutes) », avec les 6 étapes ; masquer les tuiles et les actions inutiles jusqu'au premier bien. | P1 |
| P46, P47 Finances, compte neuf | `P46.jpg`, `P47.jpg` | Écrans comptables vides (boîtes à zéro, « Clôturer un mois »). | Impression de logiciel de comptabilité dès le premier jour. | Un état vide : « Vos loyers apparaîtront ici dès votre première location » et le bouton « Ajouter un bien ». | P2 |
| P40 Biens, un seul bien | `P40.jpg` | Avec un seul bien, la moitié de l'écran reste « Sélectionnez un bien ». | Un clic inutile et une page qui paraît vide. | Ouvrir directement la fiche du bien quand il n'y en a qu'un. | P3 |
| P41 Finances | `P41.jpg` | Chaque montant dans sa propre boîte bordée (9 boîtes) ; « Gérer les 1 loyers ». | Lourdeur visuelle au téléphone. | Une ligne par montant dans une seule carte ; accorder le pluriel. | P3 |
| P39 Accueil | `P39.jpg` | Jargon « TEOM » ; échéance déjà passée en rouge pour la taxe foncière. | Incompréhension, inquiétude. | « Taxe d'enlèvement des ordures (récupérable sur le locataire) » ; ton neutre si l'échéance n'est pas une obligation. | P3 |
| P51 État des lieux | `P51.jpg` | Quatre champs obligatoires dès l'étape 1 (détecteur de fumée, état, attestation, observations). | Blocage pendant la visite des lieux. | Rendre ces champs facultatifs jusqu'à la validation finale, avec un rappel à l'étape 4. | P3 |
