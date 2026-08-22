# Recette — test par sprint et persona

> Mis à jour le **2026-08-23**, à dérouler sur **https://gerimmo-v4.vercel.app**.
> **Fichier central de recette**, en deux parties :
> **1. Recetté OK** — ce qui est validé, on n'y revient plus.
> **2. Reste à recetter** — d'abord les **re-tests des correctifs du 23/08**
> (étape 4), puis le **Sprint 7 — Incidents** (nouveau, mergé), puis ce qui
> reste des étapes précédentes et les sprints jamais déroulés.
>
> Mot de passe commun : `Gerimmo-Demo-2026`.
> Périmètre réel : S3 → S8 **incidents inclus** — le S7 est développé et
> mergé sur main le 23/08 (branche `sprint7-incidents`).
>
> **Méthode itérative** : re-tests des correctifs d'abord, puis un sprint à la
> fois, persona par persona. Les numéros reprennent ceux du document du 05/08
> ([[Recette S3-S8 - scenarios]]).
> Limite connue (pas une anomalie) : SMTP non configuré → constater que l'écran
> propose l'envoi et l'enregistre suffit.

---

# Partie 1 — Recetté OK (ne plus re-tester)

> Trace des scénarios **validés en recette humaine**, gardée ici pour la vision
> d'ensemble. Le détail des scénarios sortis du corps du document reste dans
> git et dans `log.md`.

- **08/08 — Bloc 0 (non-régression S0–S2)** : 0.1, 0.2, 0.3 **validés**.
- **13/08 — Étape correctifs + début du Sprint 3** : **validés** C.2, C.3,
  C.4, C.5 (étapes 1-3 et 5), C.7 ; 3.2 (étapes 1 et 3) ; 3.3 (étapes 1-4).
- **22/08 — Re-tests des correctifs du 13/08 (étape 1)** : **validés** C.1,
  C.5.4, C.6 (1, 2 et 3 considéré OK), C.8, 3.2.2, 3.3.5 — l'étape 1 est
  soldée.
- **22/08 — Passe charte du 19/08 (étape 2, partiel)** : **validés** G.1
  (journal comptable), G.5 (espace locataire dans la charte), G.6 (console).
  Restent G.2, G.3, G.4 (jamais déroulés — voir Partie 2).
- **22/08 — Améliorations UX du 21/08** : **validés** B.1 (étapes 2 et 3),
  B.2 (combobox lot), B.3 (EDL par section). B.1.1 restait à tester ; B.4 a
  été refondu le 23/08 (voir étape 4).
- **22/08 — Sprint 3 (partiel)** : **validés** 3.4.1 (alerte critique défaut
  d'assurance), 3.5.1 (invitation — contenu de la notification : voir note en
  Partie 2), 3.4 côté locataire (étapes 1 et 2).
- **22/08 — Sprint 4 (le gros du sprint)** : **validés** 4.1 (chaîne
  d'activation complète), 4.2 (garde-fous juridiques), 4.3 (bail meublé),
  4.5 (étapes 1, 2 et 4), 4.6 (étapes 4 et 5 ; étape 3 OK sauf l'alerte,
  restée à vérifier), 4.7 côté agent (comparatif EDL).

---

# Partie 2 — Reste à recetter

## 2.A — Étape 4 : re-tests des correctifs du 23/08

> Corrections des retours de recette du 22/08, **déployées sur main le 23/08**
> (1 migration appliquée, scénarios rejoués par l'agent en base réelle avec
> transaction annulée — tous verts ; 85 tests unitaires, lint, build OK).
> **À dérouler en premier.**

#### Persona : Agent immobilier (agent.alpha@)

**Re-test D.1 — EDL créé avant les pièces (scénario 4.5.3)**
> Correctif : la grille savait se régénérer en base, aucun écran ne
> l'appelait — le bouton est maintenant sur l'écran d'EDL lui-même.
1. Créer un bail sur un lot **sans pièces déclarées** → ouvrir l'EDL d'entrée
   → l'encart « Cet état des lieux ne détaille aucune pièce » propose de
   déclarer les pièces (lien vers le lot).
2. Fiche du lot → « Proposer les pièces » → revenir sur l'EDL → l'encart
   propose désormais **« Régénérer la grille depuis les pièces du lot »** →
   un clic → la grille passe en pièce par pièce (7 éléments par pièce).
3. Sur un EDL **signé** → aucune régénération proposée.

**Re-test D.2 — Les formulaires ne se vident plus**
> Correctif de fond : React réinitialisait les champs après chaque action,
> y compris en erreur. La grille d'EDL est désormais pilotée de bout en bout,
> et ~25 formulaires (personnes, mandats, baux, parc, compta…) reposent la
> saisie quand le serveur refuse.
1. EDL non signé : remplir des états et des commentaires → « Enregistrer la
   grille » → **tout reste affiché** (plus de formulaire vidé).
2. Personnes → « Nouvelle personne » : remplir la fiche avec un **email déjà
   pris dans l'agence** → refus → **toute la saisie est encore là**, seule
   l'erreur s'affiche.
3. Même vérification sur un formulaire au choix (mandat, bail, dépôt…) :
   provoquer un refus → la saisie survit.

**Re-test D.3 — Mandat : lot et taux vraiment obligatoires**
> Correctifs : taux sans valeur par défaut silencieuse ; un mandat sans lot ni
> taux ne change **plus d'état du tout** (garde aussi en base, migration
> `mandat_vide_ne_change_plus_detat`) ; le combobox ne propose plus les lots
> déjà couverts par un mandat actif.
1. Créer un mandat (brouillon) → dans « Ajouter un lot », le champ **Taux %**
   est vide et obligatoire (plus de 7 posé en silence).
2. Le combobox de lot **ne propose plus** un lot déjà couvert par un mandat
   actif ; si tous les lots de la personne sont couverts, le formulaire le
   dit (« rien à ajouter ici »).
3. Sur un mandat **vide** (dont l'ancien mandat résilié du retour de recette) :
   plus aucun bouton d'état ne passe — message « Un mandat sans lot ni taux ne
   change pas d'état ».

**Re-test D.4 — « Traiter » ouvre la pop-up, partout**
> Correctif : depuis le tableau de bord et la cloche, « Traiter » posait
> l'agent devant la liste des alertes ; il ouvre maintenant directement la
> pop-up de traitement de **cette** alerte.
1. Tableau de bord → « Traiter » sur une alerte → arrivée sur Alertes **avec
   la pop-up déjà ouverte** sur la bonne alerte.
2. Cloche → « Traiter » → même comportement.
3. Page Alertes → « Traiter » → la pop-up s'ouvre sur place (comme avant).
4. Toutes les pop-up ont le **même design** (maquette) : voile encre, angles
   vifs, en-tête encre — ou **rouge** pour le critique — avec surtitre mono.

**Re-test D.5 — Doublon GED : message explicite**
1. Déposer un fichier au **contenu identique** à une pièce existante (même
   sous un autre nom) → le message dit désormais : « Un fichier au contenu
   strictement identique existe déjà dans la GED, sous le nom “…” ». C'est
   l'empreinte du **contenu** qui est comparée — comportement voulu.

**Re-test D.6 — Vue macro des baux (fiche lot)**
1. Fiche lot → « Baux & état des lieux » : chaque rang affiche l'état (puce),
   **« Bail nu — {locataire} »**, et dessous **le loyer cc et les dates**
   (entrée / fin) — on sait quel bail on ouvre.

#### Persona : Locataire (locataire.alpha@)

**Re-test D.7 — Espace locataire aligné maquette (remplace B.4)**
> Refonte : bandeau encre assombri **à deux étages** avec **onglets**
> (Mon logement / Mes demandes / Mes loyers), nom du **locataire** dans
> l'en-tête (plus celui de l'agence), page « Mon logement » en deux colonnes
> avec lignes libellé ↔ valeur, cartes à liseré.
1. Connexion locataire → bandeau à onglets, liseré laiton sous l'onglet
   actif ; l'en-tête porte votre nom.
2. « Mon logement » : eyebrow avec le nom du lot, carte « Mon bail » en
   lignes Type / Depuis le / Loyer + charges / Dépôt ; bouton « Mes
   quittances » → onglet « Mes loyers ».
3. Carte « Un problème dans le logement ? » (liseré laiton) → CTA « Signaler
   un problème » + lien « Mes demandes ».
4. L'attestation validée porte la puce **« Validée »** (libellé générique —
   plus de « Validée par votre agence »).

## 2.B — Sprint 7 : Incidents (nouveau — à dérouler entièrement)

> Développé sur la branche `sprint7-incidents`, revu (2 revues), **mergé sur
> main le 23/08**. Le détail complet des scénarios est dans
> [[Recette S7 - incidents]] — ci-dessous l'essentiel par persona.
> Machine à états défendue en base : déclaré → qualifié → clos, réouverture
> possible ; les états affecté / en cours / terminé attendent le module
> devis-artisans (S13) — le **profil artisan n'est volontairement pas créé** :
> sans devis ni planning, ce serait un écran mort.

#### Persona : Locataire (locataire.alpha@)

**Scénario 7.1 — Déclarer un problème**
1. « Mes demandes » (ou la carte de l'accueil) → « Signaler un problème » :
   photos d'abord (5 max), catégorie en liste fermée, description
   obligatoire, urgence en deux choix parlants → envoi → confirmation.
2. La demande apparaît dans « Mes demandes » avec un statut **dans vos
   mots** (« Reçu — votre gérant l'examine »), jamais le vocabulaire interne.
3. Provoquer un refus (description vide) → **la saisie reste affichée**.

**Scénario 7.2 — Suivre, contester, rouvrir**
1. Après qualification par l'agence : « Qui prend en charge » s'affiche avec
   la justification ; si c'est à votre charge → lien « Contester cette
   imputation » (message obligatoire, transmis, non suspensif, une fois).
2. Sur un incident clos → « Le problème persiste » (motif) → il repart chez
   le gérant. Contestation et réouverture : **réservées au déclarant** (un
   colocataire lit seulement).

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 7.3 — La pop-up de traitement (cœur du re-test)**
1. Une déclaration locataire crée l'alerte « Incident à qualifier — INC-… »
   (critique si urgente) : cloche + tableau de bord + page Alertes.
2. « Traiter » — **depuis n'importe lequel des trois endroits** — ouvre la
   **pop-up incident** : en-tête maquette (rouge si critique), n° d'incident,
   description, lignes catégorie / déclarant / date / pièce, puis **le
   contenu de la fiche** : repère juridique, imputation (rien de pré-coché),
   justification obligatoire → « Qualifier » → la pop-up se referme,
   l'alerte est **soldée automatiquement**.
3. Le lien « Ouvrir la fiche complète » mène au dossier (photos, chronologie,
   attribution).
4. Onglet Incidents : vues En cours / À traiter / Clos / Tous, badge sur
   l'onglet, n° INC-AAAA-NNNN, tri « ce qui attend l'agence d'abord ».

**Scénario 7.4 — Qualifier, clôturer, rouvrir**
1. Qualifier : le locataire voit l'imputation immédiatement (revérifier en
   locataire.alpha@).
2. Clôturer : motifs selon l'état (un déclaré se classe sans suite ou part au
   syndic, un qualifié se résout) ; la clôture solde **toutes** les alertes
   de l'incident.
3. Une contestation locataire crée l'alerte « Imputation contestée » ; une
   réouverture recrée « à requalifier ».
4. Saisie agence : « Ouvrir un incident » (appel téléphonique) — lot
   obligatoire, mêmes règles ; doublon possible signalé sans bloquer.
5. Attribution : le responsable attribue ; un agent « le prend en charge »
   ou le « remet au pot commun ».

> Note propriétaire bailleur : le rôle `proprietaire_direct` passe par les
> **mêmes écrans et les mêmes fonctions** que l'agence (vérifié en base) — le
> jour où l'espace bailleur s'ouvre, le workflow incident est déjà générique
> (libellés côté locataire déjà neutres : « Validée », « votre gérant »).

## 2.C — Reste des étapes précédentes

### Étape 2 (19/08) — jamais déroulés

**Vérif G.2 — Fiche bail : nouvel en-tête** · persona AG
1. Sur un bail actif → sur-titre « BAIL NU/MEUBLÉ… » en petites capitales, **le nom du locataire en titre**, l'état du bail en **puce colorée** (actif = vert doux, préavis = ambre, terminé = gris).
2. Sur un bail **brouillon sans locataire** → le titre replie sur le nom du lot, rien ne casse.
3. Le bloc « À faire maintenant » est un aplat ardoise à liseré or, coins carrés.

**Vérif G.3 — Échéancier et suppression d'encaissement** · persona AG
1. Les statuts d'échéancier sont des **puces** : payé vert doux, partiel ambre, **impayé rouge doux**, à échoir gris.
2. Supprimer un encaissement refusé (mois clôturé) → **le refus s'affiche** sous le bouton.

**Vérif G.4 — EDL et fiches** · persona AG
1. Grille d'EDL : noms de pièces en mono, états des éléments en puces ; en-tête avec « ENTRÉE · date » et puce Signé/En cours.
2. Fiche bien et fiche lot : sur-titre « TYPE · VILLE » au-dessus du titre.
3. Fiche personne : **avatar à initiales** dans l'en-tête ; état du mandat en puce.
4. Documents : liste en rangs charte, compteur « N pièces » ; la recherche traite « % » et « _ » comme des caractères normaux.

### Étape 3 (21/08) — re-tests A.1 à A.6 non déroulés

> Les scénarios détaillés restent ceux du 21/08 (git, commit dddffa7 et
> antérieurs). En résumé, à balayer :
- **A.1 Mandat sans lot** · AA — renforcé le 23/08 (voir D.3, le dérouler
  suffit).
- **A.2 + A.3 Attestation d'assurance** · LO puis AG — dépôt → alerte
  « Attestation déposée » → échéance colorée → Valider → côté LO la puce
  passe à **« Validée »** (libellé générique depuis le 23/08) ; le
  renouvellement ne montre qu'**une** attestation courante (v2).
- **A.4 Baux** · AG — date d'entrée le 12 conservée à l'activation, brouillon
  corrigeable pré-rempli, bail signé en PDF uniquement.
- **A.5 Alerte EDL nominative** · AG — « État des lieux d'entrée — {lot} ·
  {locataire} ».
- **A.6 Terminologie « propriétaire mandant »** · AA — puces et sections.
- **B.1.1 Fiche bien** · AG/AA — rubrique **« Propriétaires mandants »** :
  une ligne par personne (cliquable) avec ses lots et quote-parts.

### Sprint 3 — reste à dérouler

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 3.4 — Attestation d'assurance expirée (suite)**
1. ~~Étape 1 validée le 22/08.~~
2. Redéposer une attestation valide → l'ancienne alerte critique est
   **conservée** (preuve), pas effacée. *(Couvert par les tests
   d'intégration ; un coup d'œil humain suffit.)*

**Scénario 3.5 — Invitation locataire (suite)**
1. **Contenu de la notification** (ta question du 22/08) : l'email envoyé est
   celui de **définition du mot de passe** (flux « mot de passe oublié » de
   Supabase, lien vers `/nouveau-mot-de-passe`). SMTP non configuré → rien ne
   part réellement ; l'écran signale « SMTP à configurer (Resend) ». Le
   **gabarit de l'email est celui de Supabase par défaut (en anglais)** : à
   franciser dans le tableau de bord Supabase (Auth → Email Templates) au
   moment du branchement SMTP — action de configuration à planifier.
2. Réinviter la même personne → **pas de doublon** de compte.

### Sprint 4 — reste à dérouler

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 4.4 — Colocation : garants nominatifs**
1. Créer un bail **colocation** avec 2 colocataires → les deux figurent au bail (solidarité).
2. Ajouter un garant rattaché à **un colocataire nommé** (jamais au bail en bloc) → le lien garant→colocataire s'affiche.

**Scénario 4.6 — Congés : préavis, motifs, annulation (reliquat)**
> Les étapes 1 et 2 sont couvertes par les tests d'intégration (zone tendue :
> préavis 1 mois de plein droit ; hors zone tendue : justificatif exigé) —
> re-test humain d'un coup d'œil :
1. Congé **locataire** en **zone tendue** → préavis **1 mois de plein droit**, sans justificatif demandé.
2. Congé locataire **hors zone tendue** avec préavis réduit à 1 mois → refus sans justificatif.
3. (Étape 3 validée le 22/08 **sauf l'alerte**) : congé bailleur avec motif →
   vérifier que l'**alerte d'EDL de sortie datée** est bien créée.

#### Persona : Locataire (locataire.alpha@)

**Scénario 4.7 — Consultation du bail (suite)**
1. « Mon bail » → le bail **signé** est consultable (jamais un brouillon), avec ses documents.

### Sprint 5 — Loyers, quittances, relances, IRL

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 5.1 — Prorata au centime (A-01, A-02)**
1. Sur le bail entré le 12 (loyer 780 €, charges 90 €, mois de 31 jours) → le premier appel affiche exactement **503,23 € de loyer + 58,06 € de charges = 561,29 €** (arrondi une seule fois, à la fin, par composante — pas 503,26/561,32).
2. Sur tout appel : additionner à la main les lignes affichées → le **montant dû est exactement la somme**.

**Scénario 5.2 — Encaissement, quittance, reçu (A-03, A-16)**
1. Encaisser le montant **total** d'un appel → **quittance** générée, consultable, imprimable ; l'envoi par email est proposé et enregistré.
2. Encaisser un montant **partiel** sur un autre appel → **reçu** (pas de quittance) ; compléter le solde → le reçu est **promu en quittance**.
3. Le **mode de règlement** se choisit dans une **liste fermée** (virement, chèque, espèces…) — aucun champ libre.
4. **Supprimer un encaissement** → noter ses montants → au sprint 6, vérifier que ses écritures (loyer **et** honoraires) ont disparu du journal.

**Scénario 5.4 — Impayés, relances, régularisation**
1. Un appel non payé à échéance → affiché en retard (**rouge**) ; générer une **relance** → conservée comme preuve ; la mise en demeure s'enregistre (LRAR hors plateforme).
2. Régularisation : saisir les **charges réelles** avec justificatif → décompte provisions vs réel, solde dans le bon sens (vérifier le signe).
3. Sur un bail à charges au **forfait** → **aucune** régularisation proposée.

**Scénario 5.5 — Révision IRL**
1. Bail à la date anniversaire (indice IRL saisi) → **proposition** de révision : nouveau loyer = loyer × IRL nouveau / IRL de référence (recalculer à la main) ; validation **ou** renonciation explicite.
2. Bail au DPE **F ou G** → révision **bloquée**.
3. Vérifier qu'aucun appel **déjà émis** n'est modifié rétroactivement.

#### Persona : Locataire (locataire.alpha@)

**Scénario 5.3 — Échéancier et quittances**
1. « Mes loyers » (désormais un **onglet**) → échéancier visible, quittances et reçus **téléchargeables**.
2. Vérifier qu'**aucun commentaire interne** de l'agence n'apparaît nulle part.

> Test le plus important du sprint : le **prorata au centime** (5.1) — les valeurs
> attendues sont exactes au centime, toute autre valeur est une anomalie.

### Sprint 6 — Comptabilité et rapport de gestion

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 6.1 — Journal : immuable, contre-écriture, honoraires**
1. Chaque encaissement du sprint 5 a produit ses écritures **automatiquement**, honoraires au taux du mandat inclus ; le nom du **mandant s'affiche** sur chaque écriture (A-08).
2. Tenter de modifier ou supprimer une écriture → impossible ; corriger = **contre-passer** (l'action) → une **écriture d'annulation** liée à l'origine, les deux visibles (A-14).
3. Tenter d'écrire dans un **mois clôturé** → refus.
4. Recoupement 5.2 : les écritures de l'encaissement supprimé (loyer et honoraires) **n'apparaissent plus**.

**Scénario 6.3 — Rapport de gestion**
1. Générer le rapport du mandant sur un mois → le relire → l'**envoyer** → le rapport est **figé** (toute correction passe par un rectificatif).
2. Enregistrer le **versement** au mandant → tracé.

#### Persona : Administrateur d'agence (admin.alpha@)

**Scénario 6.2 — Clôture et ventilation**
1. Clôturer un mois → plus **aucune** écriture possible dessus ; réouverture possible par l'admin, **avec motif** obligatoire.
2. Saisir une dépense sur un **bien multi-lots** → ventilée par la clé de répartition, **une écriture par lot**, les lots à 0 % sautés (vérifier le nombre d'écritures).

**Scénario 6.4 — Export CSV du journal (A-04 → A-07)**
1. Exporter le journal sur une **période** choisie → seule la période sort (pas tout l'historique).
2. Ouvrir dans Excel français → montants à la **virgule** décimale, lisibles directement.
3. Colonnes **lot** et **mandant** présentes → le journal se ventile par tri.
4. La période et les écritures annulées sortent **en français lisible** ; provoquer une lecture en échec → **erreur visible** (jamais un CSV vide silencieux).

> Test le plus important du sprint : l'**immuabilité du journal** (6.1.2) — aucune
> écriture ne doit être modifiable, la seule correction est la contre-passation.

### Sprint 8 (partiel) — Dépôt de garantie et copropriété

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 8.1 — Encaissement du dépôt**
1. Bail actif → enregistrer l'encaissement du dépôt : date, moyen, montant, **versant** (tester avec un tiers payeur) → badge « encaissé » sur le bail + écriture comptable au journal.

**Scénario 8.2 — Restitution : délais, retenues, décote**
1. Enregistrer la **remise des clés** → le compteur légal démarre : **1 mois** si l'EDL de sortie est conforme, **2 mois** s'il y a des écarts (vérifier la date affichée).
2. Les **écarts du comparatif d'EDL** (les 2 dégradations du 4.7) sont repris ; juger l'imputabilité, saisir un coût → la **décote de vétusté** s'applique ; sans justificatif joint → alerte.
3. Sur un bail **sans EDL d'entrée** → **aucune retenue possible**, restitution intégrale imposée.
4. Finaliser le décompte → toute nouvelle retenue → « Décompte finalisé — plus de retenue possible » ; relancer une restitution sur le même bail → « Restitution déjà finalisée pour ce bail ».

**Scénario 8.3 — Copropriété : appel de charges**
1. Lot en copropriété → saisir un **appel de charges du syndic poste à poste**, avec la part **récupérable / non récupérable** par poste.
2. Lancer une régularisation de charges sur ce lot **sans appel saisi** pour l'exercice → **bloquée** (le décompte attend l'appel du syndic).

> Test le plus important du sprint : **sans EDL d'entrée, restitution intégrale**
> (8.2.3) — c'est la règle légale la plus protectrice du locataire.

### Transverse — à vérifier en continu, puis en clôture de recette

#### Persona : Agent immobilier (agent.alpha@) — au fil des sprints

**Scénario T.1 — Charte v2 et vocabulaire (A-11 → A-15)**
1. Sur téléphone (ou fenêtre étroite) : l'**en-tête ne se chevauche plus**, la navigation reste utilisable.
2. La **charte v2** de la maquette est appliquée : bandeau encre, navigation laiton, fond crème, Instrument Sans, KPI à jauges, connexion en deux volets.
3. **Aucun jargon technique** : pas de « blocages en base », pas de mois `2026-06`, pas d'erreur PostgreSQL brute.
4. Le même état de lot porte **le même mot** sur tous les écrans ; « Assignée à » ne se lit plus dans les deux sens.
5. Le **rouge est réservé au critique** ; bandeau « À faire maintenant » sur la fiche bail ; états vides qui guident.
6. **Toutes les pop-up** (alerte, incident, nouveau propriétaire, cloche)
   partagent le même design maquette : voile encre 35 %, angles vifs,
   en-tête coloré à surtitre mono.

#### Persona : Administrateur d'agence Beta (admin.beta@) — en fin de recette

**Scénario T.2 — Isolation Alpha / Beta**
1. Copier depuis la session Alpha les **URLs directes** d'une fiche personne, d'un mandat, d'un bail, d'un EDL, d'une écriture, d'une quittance **et d'un incident**.
2. Connecté en admin.beta@ → aucune de ces données n'est visible dans les listes, et chaque **URL directe → refus/404**.

#### Persona : Multi-agences (multi@)

**Scénario T.3 — Cloisonnement du compte multi**
1. Se connecter en multi@ → chaque agence s'affiche **séparément**, jamais de données mélangées ; basculer d'une agence à l'autre et vérifier que les listes changent intégralement.

> C'est le test le plus important de toute la recette : **aucune donnée ne doit
> fuir entre agences**, y compris sur les nouvelles tables (mandats, baux, EDL,
> écritures, quittances, dépôts, incidents).

### Deux décisions à trancher pendant la recette

- **Propriétaire = locataire du même lot** : un avertissement non bloquant a été proposé — valider ou ajuster.
- **Rattachement locataire/garant via le bail** (C.5.5) : l'assistant l'explique au lieu d'un lien mort — confirmer cette interprétation.
