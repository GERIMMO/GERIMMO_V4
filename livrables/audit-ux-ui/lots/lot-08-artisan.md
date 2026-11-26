# Lot 8 — Artisan (A01–A25)

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 25 écrans vus. Planches : `../captures/A01.jpg` à `A25.jpg`.

> **Sur le banc, la seule mission complète était déjà terminée.** Le compte rendu, le bilan et la facture renvoyaient
> donc vers la fiche de la mission. Pour les voir réellement, j'ai fait avancer une mission fictive du banc local :
> passage « en cours » par une écriture sur la base locale isolée, puis photo et bilan déposés par l'interface,
> comme le ferait un artisan. Aucune donnée réelle n'est concernée. Les écrans A09, A10, A12 et A21–A25 viennent de ce
> parcours.

## Test des 10 secondes

| Écran | Où suis-je ? | Que dois-je faire ? | Où cliquer ? |
|---|---|---|---|
| Aujourd'hui (A01) | Oui | Oui : « Devis à chiffrer (1) » | Lien texte « Répondre à cette demande » |
| Mission en cours (A24) | Oui | Oui | Oui : un grand bouton « Rendre compte du travail » |
| Photo du travail (A23) | Oui : « Étape 1 sur 2 » | Oui | Oui : la zone appareil photo, puis « Continuer — le bilan » |
| Préparer un devis (A05) | Oui : « Étape 1 sur 4 » | Oui | Oui, mais le total reste à 0,00 € |
| Ma facturation (A07) | Oui | **Non** : un registre de règlements avant tout le reste | Pas évident |
| Chantier externe (A18) | Oui | **Non** : trois formulaires sur la même page | Pas évident |

## Ce qui fonctionne

- **Le parcours de mission au téléphone est le meilleur de Gerimmo.** Chaque état de la mission a son grand
  bouton :
  - en cours : « Rendre compte du travail » (A24) ;
  - photo : grande zone « Photographier le travail terminé », envoi dès la prise, puis « Continuer — le bilan » (A23) ;
  - terminée : « Compte rendu enregistré » puis « Déposer ma facture » (A25).

  C'est exactement ce qu'il faut à un artisan sur un chantier : des actions courtes et une seule à la fois.
- **Les renvois sont expliqués.** Un bilan demandé trop tôt ramène à la mission avec « Le bilan ne s'ouvre qu'une fois
  l'intervention démarrée : le bouton est ci-dessous » (A22, A09).
- **La barre du bas** (Aujourd'hui, Agenda, Devis, Mon entreprise) est bien choisie pour le terrain.
- **Préparer un devis (A05)** : assistant en 4 étapes, base « Proposition Gerimmo » à ajuster, sélecteur d'étape au
  téléphone, lien « Je ne peux pas chiffrer cette demande ».
- **Mes attestations (A03)** et **Mon entreprise (A06)** : on voit tout de suite ce qui manque (« Assurance décennale —
  À déposer ») et l'enjeu (« Déposez votre décennale pour être proposé sur les travaux qui l'exigent »).
- **L'état d'erreur (A14)** est rassurant : « Rien n'est perdu — ni vos attestations, ni vos missions », « Réessayer ».
- **Mes évaluations (A13)** est transparent : seuil de publication, part du client et du locataire, droit de
  contestation.

## Ce qui complique l'utilisation

- **Ma facturation (A07)** répond mal à la question de l'artisan : « Combien me doit-on, et qui ? ».
  - Le premier bloc est un registre : « Mes règlements déclarés — Gerimmo et clients externes », « FA-2026-da086839 »,
    « Déclaré reçu 0,00 € · Solde 100,00 € », répété pour chaque facture.
  - Aucun total « On vous doit 300 € » n'apparaît.
  - Les trois compteurs et la liste des factures viennent ensuite.
  - Au téléphone, la page fait 3 676 px et 416 mots ; le mode d'emploi « Facturer en 3 étapes » est tout en bas.
- **La facturation n'est pas dans la barre du bas.** Au téléphone, elle ne s'atteint que par « Mon entreprise » ou
  par les boutons de l'agenda, à deux niveaux. Être payé est pourtant au cœur de son activité.
- **Le chantier externe (A18)** empile trois formulaires sur 2 800 px :
  1. consigner l'accord du client (date, commentaire, preuve) ;
  2. préparer une nouvelle version du devis ;
  3. annuler le chantier.

  Le vocabulaire est juridique (« Consigner l'acceptation avec sa preuve »).
- **Le devis affiche « Total TTC : 0,00 € »** tant que la TVA n'est pas choisie, alors qu'une ligne 1 × 65,00 € HT est
  remplie (A05). L'artisan croit à une erreur de calcul.
- **Proposer des créneaux (A11)** demande neuf champs pour trois créneaux (jour, matin/après-midi, de, à), avec un
  paragraphe dense (« Votre interlocuteur peut arbitrer un maintien justifié »).

## Ce qui surcharge les écrans

- **Agenda (A02)** : le bloc « Mes chantiers externes » (des brouillons) passe avant le calendrier de la semaine.
- **Clients externes (A16)** : recherche, liste et formulaire de création sur la même page, plus cinq boutons-pastilles
  (Clients externes, Nouveau chantier et devis, Agenda, Facturation, Exporter mon registre) qui doublent le menu.
- **Le bilan (A10)** : un long paragraphe sur la cause réelle (« … votre interlocuteur décide de l'imputation ») et deux
  cases à cocher.
- **Aujourd'hui (A01)** : au téléphone, quatre compteurs (dont trois à zéro) occupent le premier écran avant la seule
  action utile.

## Incohérences de design

- **Bouton principal doré** (« Suivant » du devis, A05), alors qu'il est bleu nuit partout ailleurs.
- **Actions en liens texte** sur la fiche d'une mission en attente (« Proposer d'autres créneaux », « Je démarre
  l'intervention », A21), alors que les autres états ont de grands boutons.
- **Références techniques** visibles : « dossier 727efb3a », « FA-2026-c31103cd », « ESSAI identité 81c13b3b ».
- **Volets natifs à triangles** : « Votre profil est privé » (A01), « Le client refuse le devis », « Annuler ce
  chantier » (A18).
- **Données personnelles (A20)** : hors gabarit, avec un texte écrit pour les locataires (« ne résilie pas un bail »,
  « votre propriétaire ou gestionnaire reste le responsable de traitement »).
- **Facture (A12)** : les choix « Créer une facture pour un particulier / pour une SCI » apparaissent pour une mission
  commandée par une agence ; on ne sait pas à quoi ils correspondent.
- **Les règles à connaître (A15)** sont ici dans le gabarit, mais hors gabarit chez le propriétaire et le locataire.

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| A07 Ma facturation | `A07.jpg` | Le registre des règlements passe en premier ; aucun total dû ; 3 676 px au téléphone. | L'artisan ne voit pas ce qu'on lui doit ; il doit additionner lui-même les soldes. | En tête : « On vous doit 300 € — 3 factures en attente de règlement », puis une ligne par facture (client, montant, état, « Déclarer un règlement reçu »). Le registre et l'export vont dans un onglet « Mon registre ». | P1 |
| Barre du bas (téléphone) | `A01.jpg` | Pas de « Facturation » ; pas de « Menu ». | Facturation, clients externes et évaluations à deux niveaux de profondeur. | Barre en cinq entrées : Aujourd'hui · Agenda · Devis · Factures · Menu (Entreprise, Attestations, Clients externes, Évaluations, Aide). | P2 |
| A18 Chantier externe | `A18.jpg` | Trois formulaires sur une page ; vocabulaire juridique. | L'artisan ne sait pas quoi faire ensuite ; risque d'erreur. | Un seul bloc « Étape suivante » selon l'état (« Votre client a accepté ? → Joindre son accord »). « Nouvelle version » et « Annuler » derrière deux boutons secondaires. « Consigner l'acceptation » → « Enregistrer l'accord du client ». | P2 |
| A05 Préparer un devis | `A05.jpg` | Total TTC à 0,00 € tant que la TVA n'est pas choisie. | Impression de bug ; perte de confiance. | Afficher tout de suite le total HT (« 65,00 € HT — choisissez la TVA pour le TTC ») ; mettre en évidence le champ TVA manquant. Bouton « Suivant » en bleu nuit. | P2 |
| A11 Créneaux | `A11.jpg` | Neuf champs pour trois créneaux ; paragraphe dense. | Saisie longue sur chantier, au téléphone. | Une grille de la semaine où l'on touche des demi-journées (matin / après-midi) ; heures précises facultatives. Une phrase : « Proposez trois moments, le locataire en choisit un. » | P2 |
| A02 Agenda | `A02.jpg` | Brouillons de chantiers externes avant le calendrier. | Le rendez-vous du jour est poussé vers le bas. | Calendrier et rendez-vous d'abord ; les chantiers externes dans leur propre entrée. | P3 |
| A21 Mission en attente | `A21.jpg` | Les deux actions sont des liens texte. | Actions peu visibles au téléphone. | Deux boutons : « Proposer d'autres dates » (secondaire) et « Démarrer maintenant (dépannage) » (secondaire, avec confirmation). | P3 |
| A16, A19 Clients externes | `A16.jpg`, `A19.jpg` | Cinq boutons-pastilles qui doublent le menu ; choix du client en deux temps (« Choisir »). | Navigation confuse ; un clic inutile. | Supprimer les pastilles (le menu suffit) ; choisir le client dans une liste avec recherche, sans bouton de validation. | P3 |
| A10 Bilan | `A10.jpg` | Paragraphe long, mot « imputation ». | Lecture inutile sur chantier. | « Vous avez trouvé une autre cause ? Cochez et décrivez-la. » ; le détail dans un volet. | P3 |
| A20 Données | `A20.jpg` | Hors gabarit ; texte pour locataires. | Rupture et confusion. | Gabarit artisan ; texte adapté au profil. | P3 |

## Bilan de l'espace artisan

**Le cœur du métier, la mission au téléphone, est excellent** : un état, un bouton, une phrase. Les écrans qui
entourent la mission (facturation, chantiers externes, clients externes) sont, eux, construits comme des outils de
gestion, avec des formulaires empilés et un vocabulaire juridique ou comptable. Trois corrections suffiraient :

1. une facturation qui commence par « On vous doit … » ;
2. « Factures » dans la barre du bas ;
3. un chantier externe qui ne montre que l'étape suivante.
