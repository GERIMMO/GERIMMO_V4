# Lot 5 — Propriétaire, partie 2 (P20–P38) — documents, fiches, incident, compte

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 16 écrans vus. Deux adresses ne font que rediriger : `/espaces`
vers l'accueil, `/assistance` vers l'Aide. La fenêtre de synthèse des alertes (P38) avait été
notée ici « non déclenchée » ; c'était une erreur de lecture de ma part : elle figure bien sur les captures, aux trois
largeurs. Elle est évaluée au lot 8 bis.
Planches : `../captures/P20.jpg` à `P36.jpg`.

## Ce qui fonctionne

- **La quittance (P34)** : un document élégant, structuré, avec mentions légales ; c'est le meilleur écran de Gerimmo.
- **Le catalogue « Préparer un document » (P21)** : sept situations de vie, sans jargon.
- **Le bail (P28)** : un bloc « À faire maintenant » numéroté et des onglets clairs (Contrat, Documents, Suivi, Départ).
- **La fiche personne (P29)** et **le carnet d'artisans (P22)** : lisibles, avec l'action principale visible.

## Ce qui complique l'utilisation

- **Le détail d'un incident (P30)** tient en une seule page de 4 300 px au téléphone, dans cet ordre :
  1. bilan ;
  2. détails ;
  3. intervention ;
  4. six créneaux ;
  5. compte rendu ;
  6. photos ;
  7. notation de l'artisan sur trois critères ;
  8. échanges ;
  9. facture ;
  10. formulaire de règlement ;
  11. réouverture ;
  12. historique de 19 événements.

  Le propriétaire doit faire défiler tout cela pour trouver la seule chose à faire (« Régler la facture » ou « Noter
  l'artisan »).
- **La fiche logement (P26)** empile douze blocs. La carte « Incidents » est rose même sans incident.
- **La reprise des comptes (P33)** est un écran de comptable : « balance d'ouverture », « bascule », codes
  `depot_garantie`, `fonds_mandant`, « écritures rectificatives ».
- **Les écrans de compte** (P25 données personnelles, P36 sécurité) sortent du gabarit de l'espace : plus de menu ni
  de barre du bas.

## Ce qui surcharge les écrans

- **Documents (P20)** : les titres de fichiers sont des références internes (« Facture FA-2026-c31103cd — incident
  INC-2026-0002 », « Chantier (apres) »), et chaque document porte une pastille grise « À vérifier ».
- **Bail (P28)** : des volets dans des volets (Informations du contrat > Compléments du contrat > Garants).

## Incohérences de design

- Couleurs de cartes sans signification constante : rose pour « Incidents », vert pour « Dépenses », sable pour
  « À compléter ».
- Bandeau sombre « Logements · 1 » (P27) d'un style unique.
- « Journal » désigne à la fois le blog (P23) et le registre comptable (P12).
- « Demandez-la à votre gestionnaire » sur le compte d'un propriétaire (P36).

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| P30 Incident | `P30.jpg` | Douze sections sur une seule page, sans mise en avant de l'action attendue. | Le propriétaire ne sait pas ce qu'on attend de lui ; il risque de ne pas régler la facture ni noter l'artisan. | Un en-tête « Ce qu'il vous reste à faire » (une ou deux actions : régler 100 €, noter l'artisan). Le reste passe en onglets : Suivi · Devis et facture · Échanges · Historique. Les six créneaux se résument en « Rendez-vous retenu : 23/11 à 8 h ». | P1 |
| P26 Fiche logement | `P26.jpg` | Douze blocs, 3 750 px au téléphone, couleurs sans sens. | Effort de lecture, impression de complexité. | Des onglets : Résumé · Location · Argent · Documents · Caractéristiques. Une seule couleur d'accent ; le rose réservé aux incidents ouverts. | P2 |
| P20 Documents | `P20.jpg` | Noms de fichiers techniques ; pastille « À vérifier » partout. | Les documents ne se reconnaissent pas d'un coup d'œil. | Des titres humains (« Facture du plombier — fuite sous évier, 100 € ») ; la pastille réservée aux documents qui demandent réellement une action. | P2 |
| P33 Reprise des comptes | `P33.jpg` | Écran de comptable, avec des codes bruts. | Inutilisable par un particulier ; risque d'erreur. | Le réserver aux comptables, derrière un lien « Pour mon comptable ». Sinon, un assistant en questions simples (« Votre locataire vous doit-il de l'argent aujourd'hui ? »). | P2 |
| P25, P36 Compte | `P36.jpg` | Pages hors gabarit, longues, avec un mot d'agence. | Sensation de quitter l'application. | Les afficher dans le gabarit de l'espace ; raccourcir les textes ; « contactez l'assistance » pour les propriétaires. | P3 |
| P28 Bail | `P28.jpg` | Volets imbriqués ; « Dépôt de garantie : À renseigner — Montant prévu au contrat » ; « Fin non renseignée ». | Le bailleur doute que son bail soit bien saisi. | Aplatir les volets ; écrire le montant du dépôt ou « Non versé » ; calculer la date de fin d'un bail nu. | P2 |
