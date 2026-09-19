---
type: synthesis
tags: [audit, personas, parcours, automatisation, clics, bugs]
status: stable
created: 2026-09-20
updated: 2026-09-20
sources: ["[[Fonctionnalités par persona]]", "[[État des lieux du design et des parcours]]", "[[Agenda et échéances]]", "[[Quittancement des loyers]]", "[[Relances et mise en demeure]]", "[[Cycle de vie d'un incident]]"]
---
# Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)

Commande du porteur du projet (19/09, au soir) : « un audit complet sur les
fonctionnalités, un audit complet sur les personas et leurs sessions — mets-toi
à leur place : ce que je souhaite voir, faire, prioriser, ce qui manque,
comment améliorer. Bugs et manquements : carte blanche. L'objectif : que la
gestion se fasse un maximum automatiquement, et que le nombre de clics soit le
minimum possible. »

**Méthode.** Chaque persona du banc a été traversé écran par écran, au gabarit
qui est le sien (bureau pour l'agence et la console, téléphone pour le
locataire et l'artisan), avec capture, relevé des erreurs (console, serveur,
hydratation, bandeaux) et mesures de densité. Puis lecture du code des gestes
clés pour compter les clics et repérer ce qui pourrait se faire seul. Ce relevé
**complète** celui du 11/09 ([[État des lieux du design et des parcours]] : 254
trouvailles de design) — il ne le refait pas ; il regarde le produit après la
refonte v4 et sous l'angle « automatique ou clic ».

Règle tenue malgré la carte blanche : **rien n'a été appliqué en production ni
fusionné dans `main`**. Les corrections sont sur la branche, testées ; les
migrations éventuelles sont écrites et testées sur le banc, pas appliquées.

---

## 1. Ce qui se fait déjà tout seul — et ce qui attend un clic

| Geste | Aujourd'hui | Qui clique |
|---|---|---|
| Créer les appels de loyer le 1er du mois | **automatique** (cycle mensuel en base) | personne |
| Avis d'échéance au locataire | automatique **si** `appels_envoi_auto` (faux par défaut) | l'agence coche une fois dans son profil |
| Émettre la quittance à l'encaissement | **automatique** (déclencheur) | — |
| Envoyer la quittance | automatique **si** `quittances_envoi_auto` (faux par défaut) | sinon « Envoyer les quittances (n) » chaque mois |
| Encaisser un loyer | **clic** (déclaratif, choix assumé : pas de synchro bancaire) | gérant, ~2 clics |
| Relancer un impayé (relance 1, 2, mise en demeure) | **clic** — formulaire sur la fiche du bail | gérant, ~4 clics par relance |
| Rappel de rendez-vous (veille, J-7) | **automatique** | — |
| Révision IRL annuelle | **automatique** (proposition) | validation |
| Alertes (diagnostic périmé, EDL à faire, rapport à valider…) | **automatiques**, 12 types se referment seuls | traitement des autres |
| Qualifier un incident (qui paie) | **clic** + justification obligatoire (RM-7.2.1 : pas de proposition automatique) | gérant |
| Doublon d'incident | **détecté** et signalé dans la chronologie | mais chaque doublon reste à qualifier à la main |
| Aligner la facturation Stripe sur le parc | **automatique** (nuit) | — |
| Relances de paiement d'abonnement | **automatiques** (paliers) | — |
| Avoirs de parrainage | **automatiques** (nuit) | — |
| Rapport de gestion mensuel | **clic** par mandant et par mois (« Générer le rapport »), puis envoi | admin |
| Clôture du mois comptable | **clic** | admin |

Deux réglages gouvernent l'essentiel de l'automatisation locative
(`appels_envoi_auto`, `quittances_envoi_auto`) et sont **faux par défaut**,
enfouis dans « Profil de l'agence ». Le référentiel veut la quittance
« validée par l'agence » — d'où le choix ; mais rien ne propose ces réglages
au bon moment (au premier bail actif, au premier encaissement).

---

## 2. Admin d'agence et agent — ce que je veux quand j'ouvre Gerimmo

*(23 écrans traversés en admin, 16 en agent, bureau 1 280 px.)*

**Ce qui va.** Le tableau de bord v4 dit en une phrase combien de choses
attendent ; la fiche du bail ouvre sur « À faire maintenant » (impayé, EDL à
signer, dépôt à encaisser) — c'est exactement la bonne idée ; l'incident se
lit en une colonne avec sa décision « qui paie » en évidence ; le Parc dit ce
qui bloque chaque lot.

**Bugs relevés (corrigés cette nuit, voir §8).**
- **P1 — Menu v4 : « Comptabilité & fiscalité » mène à une 404** pour
  l'admin d'agence : `/comptabilite/fiscal` est réservé au propriétaire
  direct (`notFound()` sinon). Régression de la refonte du 19/09.
- **P2 — Alertes : erreur d'hydratation** (`liste-alertes.tsx:170`) : le
  « Dépassée de N j » est calculé avec l'horloge du navigateur dans un
  composant rendu côté serveur ; à cheval sur minuit, ou d'un fuseau à
  l'autre, serveur et client ne comptent pas le même jour, et React rejette
  tout l'arbre (clignotement, et un chiffre qui dépend de la machine).

**Manques et clics, par ordre d'importance.**
- **Relances d'impayé à la main.** Le geste le plus répétitif de la gestion
  locative : constater l'impayé, ouvrir le bail, choisir « Relance 1 »,
  dater, enregistrer — puis recommencer quinze jours plus tard. Rien ne
  l'automatise alors que le référentiel prévoit des seuils paramétrables
  ([[Relances et mise en demeure]]). → Proposition §7.
- **Rapport de gestion : un clic par mandant et par mois**, sur un écran
  qui n'est pas celui du mandant. Le rapport pourrait se générer seul à la
  clôture du mois et n'attendre que l'envoi.
- **Doublons d'incident** : cinq « Fuite / robinetterie » signalés « doublon
  possible » attendent chacun une qualification complète (radio + texte).
  Un geste « rattacher au dossier INC-0001 » en un clic fermerait les quatre
  autres.
- **Alertes et Incidents disent la même chose deux fois** : chaque incident
  à qualifier crée une alerte « Incident à qualifier » dans Agenda & alertes,
  avec ses propres boutons « Traiter / Assigner ». Le gérant voit six alertes
  dont cinq sont les incidents qu'il voit déjà à côté.
- **Personnes** : une liste de noms sans contexte (pas de lot, pas de solde,
  pas de dernier échange). La fiche « à la Attio » est la phase suivante de
  la refonte.
- **Comptabilité** : un seul écran porte le quittancement du mois, la
  saisie d'écriture, la ventilation, la clôture, les rapports et le journal.
  La scission « Loyers & charges » / « Comptabilité » est validée depuis le
  19/09 ; le menu v4 l'anticipe déjà — d'où la 404 ci-dessus.
- Les champs de date des formulaires suivent la locale du navigateur
  (`mm/dd/yyyy` sur un poste anglais) : pas un bug, mais un point d'attention
  pour les captures.

---

## 3. Propriétaire-bailleur en gestion directe — « mes biens, tenus au carré »

*(15 écrans traversés, bureau. Aucune erreur, aucune 404.)*

**Ce que je veux voir en ouvrant** : ai-je été payé ce mois-ci, qu'est-ce qui
bloque une mise en location, où en est ma déclaration. L'accueil le donne
presque : « Encaissé en septembre », « Fiscalité — Récap 2044 », « Mes lots
0 / 1 », « Mon abonnement », puis « À faire » avec le lot et ses deux points à
régler (DPE, ERP). Le parcours de démarrage dit clairement ce qui manque avant
le premier bail.

**Ce qui cloche.**
- **P3 — « Bonjour, »** : la virgule reste quand le prénom manque (l'accueil
  propriétaire est un composant à part de celui de l'agence). Le nom est
  pourtant connu (« Parc de Claire Moreau »).
- **Deux tableaux de bord** : l'accueil propriétaire n'a pas reçu la refonte
  v4 (tuiles, assistant, activité) — il vit dans la nouvelle coquille avec
  l'ancien contenu. Ce n'est pas faux, c'est une seconde grammaire.
- **Le livre recettes-dépenses** montre à un particulier la même page qu'à
  une agence : saisie d'écriture à six champs, ventilation par bien, clôture
  du mois. Pour un propriétaire d'un lot, l'essentiel tient en trois choses :
  ce qui est encaissé, une dépense à ajouter (facture de travaux, assurance,
  taxe foncière), et le récapitulatif 2044 — déjà excellent.
- **Rien n'automatise la dépense récurrente** : assurance PNO, taxe foncière,
  charges de copropriété reviennent chaque année ou chaque trimestre ; chacune
  se ressaisit à la main. Une « dépense récurrente » (montant, période, lot)
  qui s'inscrit seule à échéance retirerait la plupart des saisies d'un
  propriétaire.
- **Le récapitulatif fiscal s'arrête aux intérêts d'emprunt** (« à compléter
  par vos soins ») : une ligne de saisie annuelle suffirait pour que la 2044
  sorte complète.

**Ce qui est bien pensé** : l'essai en une ligne au pied de la barre, le
prix par bien lisible sur l'accueil (1ᵉʳ bien offert), le « Reprendre un
parc » à côté de « Ajouter un bien ».

---

## 4. Locataire — « qu'est-ce qu'on attend de moi, et où en est mon loyer »

*(10 écrans, téléphone 390 px. Aucune erreur.)*

**Ce qui va, et même très bien** : l'accueil ouvre sur « Ce qui vous attend »
— trois points, chacun avec son bouton (choisir un créneau, régler, déposer
l'attestation) — puis le loyer restant, les documents, les demandes, le
gestionnaire, l'urgence. Le signalement met la photo en premier et dit qui
paiera avant l'envoi. « Mon logement » tient en un écran. C'est l'espace le
plus abouti du produit.

**Ce qui cloche.**
- **P2 — Le bouton flottant « Aide et retours » recouvre les gestes.** Sur
  téléphone il masque le bouton « Régler » du loyer, la ligne « Devis
  retenu » de l'artisan, un champ du formulaire de signalement. Un widget
  d'aide ne doit jamais se poser sur une action.
- **Le loyer se règle « par virement à votre gestionnaire »** : la mention
  est honnête, mais rien ne dit au locataire l'IBAN ni la référence à
  indiquer, et rien ne lui permet de dire « c'est fait » (ce qui éviterait au
  gérant de découvrir le virement trois jours plus tard sur son relevé). Une
  déclaration « J'ai réglé N € le J » côté locataire, à confirmer par le
  gérant en un clic, retirerait un aller-retour par mois et par locataire.
- **Six demandes en cours** pour un seul lot : cinq sont les doublons du même
  incident (voir §2). Le locataire les voit toutes.

---

## 5. Artisan — « où je vais, quand, et quoi faire »

*(9 écrans, téléphone. Aucune erreur.)*

**Ce qui va** : « Aujourd'hui » n'affiche que ce qui attend une réponse ;
la mission dit où (itinéraire en un geste), quoi, qui, et propose le seul
geste utile (« Proposer des créneaux », ou « Je démarre l'intervention »
si on intervient sans rendez-vous). Les attestations, la facturation, la
note vivent chacune sur leur écran.

**Ce qui cloche** : le même bouton flottant masque la ligne « Devis retenu »
(§4). Rien d'autre à signaler sur le banc — le portail est sobre et à sa
place.

---

## 6. Super-admin — « qu'est-ce qui attend ma décision »

*(18 écrans, bureau. Aucune erreur produit ; une alerte « justificatifs
indisponibles » sur la fiche artisan tient au banc, qui n'émule pas le
stockage.)*

La console du 19/09 fait ce qu'il faut : « Ce qui attend une décision » en
cinq blocs, « Clients » en trois familles, l'entrée dans chaque espace. Rien
de bloquant. Deux remarques :
- les organisations ouvertes par les tests (« Parc de Camille Recette » × 10)
  encombrent le banc, pas la production — mais un compteur « en essai : 11 »
  qui compte des fantômes rappelle qu'un nettoyage des recettes serait
  bienvenu dans le seed ;
- rien ne dit à la supervision **quelles agences ont activé l'envoi
  automatique** (quittances, avis) ni combien de relances partent : c'est
  pourtant l'indicateur d'adoption de l'automatisation.

---

## 7. Automatiser, et supprimer des clics — les propositions

Classées par ce qu'elles retirent de gestes, à règle métier constante.

1. **Relances d'impayé automatiques** (agence et propriétaire). Un réglage
   d'organisation `relances_envoi_auto` (faux par défaut, comme les deux
   autres), deux délais paramétrables (relance 1 à J+5 de l'échéance,
   relance 2 à J+15), et la tâche du matin envoie la relance par e-mail au
   locataire, la consigne sur le bail exactement comme si le gérant l'avait
   saisie (même preuve, même chronologie), et laisse la mise en demeure —
   acte recommandé — à la main. → **Écrite cette nuit** (migration testée sur
   le banc, non appliquée ; tâche ; e-mail ; réglage dans le profil).
2. **Proposer l'automatisation au bon moment.** Le tableau de bord (bloc
   « Gerimmo a repéré… ») suggère d'activer l'envoi automatique des
   quittances et des avis quand un bail est actif et que le réglage est
   éteint — un clic pour accepter, dans la règle « l'assistant propose,
   l'humain décide ». → **Fait cette nuit.**
3. **Rattacher un doublon en un clic** : depuis un incident signalé
   « doublon possible », clore comme doublon du dossier d'origine sans
   qualification ni justification — la qualification vit sur l'original.
4. **Rapport de gestion généré à la clôture du mois**, pour chaque mandant,
   en attente d'envoi : le clic restant est l'envoi, qui engage l'agence.
5. **Dépenses récurrentes** (assurance, taxe foncière, charges de copro) qui
   s'inscrivent seules au livre à leur échéance.
6. **« J'ai réglé »** côté locataire, confirmé en un clic côté gérant.
7. **Alertes ↔ Incidents** : ne plus créer d'alerte « incident à qualifier »
   quand l'incident est déjà dans la liste « à traiter » — ou n'en créer
   qu'une par lot et par jour.

---

## 8. Corrections faites cette nuit

Sur la branche `claude/ecstatic-knuth-pcoqz0`, chacune avec ses tests ; rien
n'est appliqué en production ni fusionné.

1. **« Loyers & charges » existe** (`/agence/[orgId]/loyers`) : le mois en
   trois chiffres (appelé, encaissé, reste dû), le quittancement avec ses
   gestes (encaisser, envoyer les quittances), la liste des impayés avec le
   lien « Relancer » vers le bail, et le renvoi des charges vers le lot et
   le bail. La comptabilité de l'admin n'en montre plus qu'un résumé et un
   bouton ; l'agent garde son bloc (sa page n'est pas au menu depuis le
   12/09) ; le propriétaire y accède aussi, et retrouve son livre sous
   « Plus ». Le chargeur du quittancement est partagé
   (`lib/quittancement-du-mois.ts`).
2. **Menu v4 réparé** : « Loyers & charges » → `/loyers` ; « Comptabilité »
   (sans « & fiscalité », qui n'existe que pour le propriétaire) →
   `/comptabilite`. Plus de 404 au menu. Tests de navigation mis à jour.
3. **Alertes : plus d'erreur d'hydratation.** Le serveur passe sa date de
   Paris (`aujourdhui`) à la liste, à la pop-up de connexion et à la modale ;
   `dateDeReference()` dans `lib/echeances.ts`. Vérifié sur le banc : la page
   ne lève plus d'erreur.
4. **Le bouton « Aide et retours » ne recouvre plus les gestes** sur
   téléphone : icône seule (44 px, `aria-label`), libellé à partir de 640 px.
5. **« Bonjour, »** sans prénom ne laisse plus sa virgule.

6. **Les relances d'impayé partent seules — pour qui l'a demandé.**
   Migration `20260920030000_relances_loyer_automatiques` (**écrite et testée
   sur le banc, non appliquée**) : trois réglages d'organisation
   (`relances_envoi_auto` faux par défaut, `relance_1_jours` 5,
   `relance_2_jours` 15, le second après le premier), une colonne `origine`
   sur les relances, la fonction `relances_loyer_dues()` (le terme impayé le
   plus ancien de chaque bail actif, passé le délai, sans relance de ce niveau
   depuis ce terme, jamais deux courriers le même jour, une relance saisie
   par le gérant compte, rien après une mise en demeure, rien sans adresse,
   rien pour une organisation suspendue) et `relance_loyer_consigner()`, toutes
   deux réservées à `service_role`. La tâche `/api/cron/relances` (7 h 45 UTC,
   après les quittances et les avis) envoie l'e-mail puis consigne la relance
   sur le bail — même chronologie, même preuve, étiquetée « automatique ».
   Deux courriers qui ne s'accusent pas (`lib/relance-loyer-email.ts`). Le
   réglage vit dans « Profil » sous « Relances d'impayé ». **La mise en
   demeure reste un geste du gérant.** 12 tests SQL, 3 tests de route, 5
   tests d'e-mail.
7. **L'assistant propose l'automatisation** : dès qu'un lot est loué et qu'un
   des trois envois automatiques (quittances, avis d'échéance, relances) est
   éteint, le bloc « Gerimmo a repéré… » le dit en une ligne turquoise, avec
   « Activer » vers les réglages. Il propose ; le responsable décide.

> [!warning] À trancher au réveil
> - **Appliquer la migration des relances** (« applique et fusionne ») : elle
>   n'ajoute que des réglages à faux et deux fonctions réservées à la tâche —
>   rien ne part tant qu'une agence ne coche pas la case.
> - Les délais par défaut (5 et 15 jours) sont un choix de départ, pas une
>   règle du référentiel : à confirmer.
> - Faut-il proposer ces trois automatisations **dès le parcours de
>   démarrage** (une étape « Laisser Gerimmo envoyer ») plutôt que dans
>   l'assistant seulement ?
