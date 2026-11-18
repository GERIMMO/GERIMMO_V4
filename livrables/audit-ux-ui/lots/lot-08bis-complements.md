# Lot 8 bis — Compléments : navigation réelle, onglets, tablette

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 13 écrans ajoutés, une correction.

## 1. Confrontation de l'inventaire avec la navigation réelle

L'inventaire a été construit à partir des routes du code. Pour vérifier qu'il ne manquait rien, un robot a parcouru
les liens réellement affichés dans chaque espace, en lecture seule (aucun formulaire envoyé), depuis la page
d'accueil de chaque profil :

| Profil | Chemins distincts rencontrés | Hors inventaire |
|---|---|---|
| Propriétaire (SCI, plusieurs biens) | 29 | `/espace/…/incidents/…` (redirige vers P30) ; `/conditions` (page publique) |
| Propriétaire débutant | 30 | `/conditions` (page publique) |
| Locataire avec bail actif | 12 | aucun |
| Artisan | 17 | `/artisan/facturation/…` (détail d'une facture) |
| Super-admin | 47 | `/admin/brief/qualite` ; pages publiques (`/`, `/conditions`, `/confidentialite`, `/mentions-legales`, `/journal/…`) ; pages d'agence (`/agence/…`, `/agences`) |

Les pages publiques et les pages d'agence sont hors du périmètre demandé : elles ne sont pas auditées. Le robot a aussi
relevé les onglets (paramètre `?vue=`) qui n'avaient été vus que dans leur état par défaut. Ils ont été capturés et
évalués ici.

## 2. Écrans ajoutés

| Écran | Constat | Notes /5 |
|---|---|---|
| P54 Incident par son adresse directe | Redirige vers la liste avec le dossier ouvert (= P30). | — |
| P55 Incidents, onglet « Tous » | Les deux incidents apparaissent et, à 1440, le premier s'ouvre à côté. **C'est la vue qui devrait s'ouvrir par défaut** (P13 ouvre sur une vue vide). | 4 / 4 / 3 |
| P56, P57 Agenda, « Dates à confirmer » et « À vérifier » | États vides clairs, retour au calendrier. | 4 / 4 / 4 |
| P58 Agenda, vue du mois | Calendrier lisible, détail du jour à côté ou dessous. | 4 / 4 / 4 |
| P59 Livre, « Ajouter une écriture » | Formulaire de comptable : « écriture », « date d'imputation », « son mois comptable », champ « dont enlèvement des ordures ménagères » dans un formulaire générique. | 2 / 3 / 3 |
| P60 Livre, « Clôture » | « Fige les écritures du dernier mois révolu ; irréversible. Recommandé, jamais imposé. » Le bailleur ne sait pas ce que cela change pour lui. | 3 / 3 / 3 |
| P61 Livre, « Journal » | Mêmes remarques que P12. | 3 / 3 / 3 |
| P62 Messages, onglet « Interventions » | Volets natifs titrés par référence (« INC-2026-0002 · E2E Plomberie Dubois · terminée »). | 3 / 3 / 3 |
| S39 Équipes et comptes rendus | Liste des sept « équipes » automatiques ; le libellé ne correspond pas au renvoi « Travail des équipes » (S21). | 3 / 4 / 3 |
| S40 Activité et dossiers | Compteurs et état vide clairs. | 4 / 4 / 4 |
| S41 Équipe « Qualité et corrections » | État vide clair, « Préparer le point maintenant ». | 4 / 4 / 4 |
| A26 Détail d'une facture (artisan) | Trois montants clairs (facturé, reçu, solde), mais vocabulaire juridique (« Registre privé et déclaratif… ni rapprochement bancaire, ni validation comptable ») et cinq boutons-pastilles en tête. | 3 / 3 / 3 |

## 3. Correction : la fenêtre de synthèse des alertes (P38)

Au lot 5, j'avais noté cette fenêtre « non déclenchée sur le banc ». C'était une erreur de lecture : elle figure sur
les trois captures (planche `../captures/P38.jpg`). Évaluation :

- elle interrompt la première visite pour dire seulement « 6 demandes à traiter — Retrouvez vos échéances et vos
  actions sur les dossiers dans Toutes les demandes » ;
- elle ne nomme aucune demande ;
- le bouton principal est « Fermer » ; l'accès aux demandes n'est qu'un petit lien.

C'est une fenêtre qui coûte un clic sans rien apprendre. **Solution** : la supprimer et faire du bloc « À faire
maintenant » de l'accueil (voir P07) le seul point d'entrée. À défaut, lister les trois demandes les plus urgentes avec
leur logement, et faire de « Voir les 6 demandes » le bouton principal. Priorité P2. Notes : 3 / 4 / 3.

## 4. Revue à la largeur tablette (768 px)

Les 162 écrans capturés ont été revus à 768 px (planches `../captures/tablette-01.jpg` à `tablette-09.jpg`, dans
l'ordre A, E, L, P, S). **Aucune mise en page n'est cassée** ; aucun débordement horizontal n'a été mesuré, à aucune
largeur. En revanche, la tablette révèle que **chaque espace a sa propre navigation** :

| Espace | Navigation à 768 px |
|---|---|
| Propriétaire | Rail d'icônes avec libellés à gauche |
| Locataire | Rail d'icônes avec libellés à gauche |
| Artisan | Barre du bas du téléphone, contenu étiré, moitié droite souvent vide |
| Super-admin | Bouton « Menu » en haut ; l'en-tête passe sur deux lignes (l'adresse e-mail est renvoyée seule à la ligne) |

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| Tous les espaces à 768 | `tablette-01.jpg`, `tablette-07.jpg` | Trois modèles de navigation différents à la même largeur. | Sur iPad, l'utilisateur à plusieurs casquettes (propriétaire et artisan, par exemple) ne retrouve pas ses repères. | Un seul modèle tablette : le rail d'icônes avec libellés du propriétaire, pour les quatre espaces. | P3 |
| Super-admin à 768 | `tablette-07.jpg` | En-tête sur deux lignes, adresse e-mail isolée. | Impression de page mal finie. | Remplacer l'adresse par l'initiale (comme ailleurs) sous 1 000 px. | P3 |
| Artisan à 768 | `tablette-01.jpg` | Cartes à demi-largeur et grand vide à droite. | Espace perdu sur tablette, outil courant des artisans en camionnette. | Deux colonnes : actions du jour à gauche, agenda de la semaine à droite. | P3 |

Les petites cibles tactiles (éléments cliquables de moins de 32 px de haut ou de large, seuil volontairement bas) ont
été mesurées sur chaque écran : 45 écrans en ont au téléphone, surtout des volets natifs à triangles et des liens en
petit texte. La recommandation courante pour le doigt est de 44 px.
