# Lot 3 — Super-administrateur, partie 2 (S20–S38)

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 19 écrans vus. Planches : `../captures/S20.jpg` à `S38.jpg`.

## Ce qui fonctionne

- Les écrans de gestion courante sont clairs : annuaire des espaces (S36), décisions à prendre (S34), fiche personne
  (S32), personnalisation des agences (S25).
- Les paramètres généraux (S28) regroupent proprement l'identité de l'éditeur, le médiateur et les prestataires.
- Marketing et contenus (S24) montre la ligne éditoriale, les canaux et les contenus à relire sur un seul écran.

## Ce qui complique l'utilisation

- **Écrans d'automatisation pensés pour un développeur.**
  - Consignes du dirigeant (S30) : « E2E supervision locale 1794987858419 — version 2 », « Compter les passages — À
    activer », « une consigne ne peut… lire deux compteurs ».
  - Automatismes (S23) : dix cartes qui répètent « Premier passage attendu », « Aucun passage enregistré », « Horaire
    habituel : 11 h (heure de Paris, 10 h en hiver) ».
- **Pages hors gabarit**, sans menu ni en-tête de console : /securite (S20) et /relais (S26). Le dirigeant a
  l'impression d'être sorti de l'application.
- **Renvois vers des écrans qui n'existent pas sous ce nom** : la veille (S21) renvoie à « Travail des équipes ».
- **Blocs en double** : « Corrections et idées » apparaît dans Activité et dossiers (S22) et dans Améliorations du
  produit (S35). Les durées de conservation sont accessibles depuis trois endroits.

## Ce qui surcharge les écrans

- Couverture du réseau (S29) : un paragraphe sur les règles de comptage, puis un tableau de 194 communes, toutes à
  « 0 / 0 ». Au téléphone, les colonnes sont coupées.
- Automatismes (S23) : très long au téléphone pour une information qui tient en une ligne (« 10 tâches, aucune n'a
  encore tourné »).

## Incohérences de design

- Pluriels non accordés : « 1 propositions affichées », « 1 rôles ».
- Suffixes techniques dans les titres : « · da2230 ».
- « Limite des appels IA » rangée sous « Vacances et relais » (S27).
- Onglets coupés sans indice de défilement au téléphone : S31, S37, S08.

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| S23, S30 | `S23.jpg`, `S30.jpg` | Les automatismes et les consignes sont décrits en termes techniques (passages, compteurs, versions, numéros). | Le dirigeant ne peut pas savoir sans aide si un automatisme fait bien son travail. | Une ligne par automatisme, en français : « Quittances : envoyées ce matin à 9 h (3) » ou « en pause ». Les détails techniques vont dans un volet « Détails ». La création d'une consigne passe par un assistant en trois questions. | P2 |
| S20, S26 | `S20.jpg`, `S26.jpg` | Deux pages sortent du gabarit de la console. | Rupture de navigation : pas de menu pour revenir. | Les afficher dans le gabarit de la console. | P2 |
| S29 | `S29.jpg` | Un tableau de 194 communes vides et un long texte de règles. | Lecture inutile ; tableau illisible au téléphone. | N'afficher que les communes où une demande ou un artisan existe ; un résumé (« 0 commune couverte en Essonne pour la plomberie ») ; les règles dans un volet « Comment c'est compté ». | P2 |
| S21, S22, S35 | `S21.jpg`, `S22.jpg` | Renvoi vers un écran absent du menu ; bloc « Corrections et idées » en double. | Impasse de navigation et doute sur le bon endroit. | Corriger les libellés de renvoi ; garder « Corrections et idées » dans « Améliorations » seulement. | P3 |
| S27 | `S27.jpg` | « Limite des appels IA » rangée sous « Vacances et relais ». | Réglage introuvable. | La déplacer dans « Paramètres ». | P3 |
| S31, S37, S08 | `S31.jpg` | Onglets coupés au téléphone, sans indication. | Onglets invisibles. | Faire défiler les onglets avec un dégradé et une flèche, ou les passer en liste. | P3 |

## Bilan de la console (S01–S38)

La console est **complète mais pensée comme un tableau de bord de développeur**. Le dirigeant y trouve tout, mais
n'y voit pas l'essentiel en premier. Trois changements la rendraient nettement plus simple :

1. une page « Aujourd'hui » avec les décisions du jour ;
2. un menu en cinq groupes ;
3. un vocabulaire métier à la place du vocabulaire d'automatisation, le détail technique replié.
