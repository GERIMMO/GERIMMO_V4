# Recette — test par sprint et persona

> Mis à jour le **2026-08-26**, à dérouler sur **https://gerimmo-v4.vercel.app**.
> **Fichier central de recette**, en deux parties :
> **1. Recetté OK** — ce qui est validé, on n'y revient plus.
> **2. Reste à recetter** — d'abord l'**anomalie du 26/08** (bail signé
> invisible côté locataire), puis le reliquat du **Sprint 7 — Incidents**,
> puis ce qui reste des étapes précédentes et les sprints jamais déroulés.
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
- **24/08 — Étape 4 (correctifs du 23/08)** : **validés** D.1 (régénération
  de grille d'EDL), D.2 (formulaires qui ne se vident plus), D.3 (mandat :
  lot et taux obligatoires), D.5 (doublon GED), D.6 (vue macro des baux),
  D.7 (espace locataire refondu). D.4 validé sur le fond mais refondu le
  24/08 (pop-up sur l'écran courant — re-test en étape 5).
- **24/08 — Sprint 7 (partiel)** : **validés** 7.1 (étapes 2 et 3), 7.2
  (étape 1 ; étape 2 hors colocataire), 7.3 (étapes 1 et 3), 7.4 (étapes
  1 à 4 ; étape 5 restant à tester en responsable d'agence). Les points UI
  remontés (7.1.1, 7.3.2, 7.3.4) sont traités le 24/08 — re-tests en étape 5.
- **26/08 — Étape 5 (correctifs du 24/08)** : **validés** E.1, E.2, E.3
  (étapes 1 et 3 ; étape 2 acceptée en l'état — point d'alignement gardé
  pour plus tard, voir « Points gardés pour plus tard »), E.4 — **l'étape 5
  est soldée**.
- **26/08 — Sprint 7** : **validé** 7.4.5 (attribution en responsable) —
  ne reste que 7.2.2 (colocataire).
- **26/08 — Étape 2 (passe charte du 19/08)** : **validés** G.2, G.4 et
  G.3.1 ; G.3.2 (suppression d'encaissement refusée sur mois clôturé) testé
  partiellement — semble OK, pas assez de recul en mois clôturés, à
  confirmer au sprint 6. **L'étape 2 est soldée.**
- **26/08 — Sprint 3** : **validé** 3.4.2 (l'ancienne alerte critique est
  conservée après redépôt) — le scénario 3.4 est soldé.
- **26/08 — Sprint 5 (début)** : **validés** 5.1 (étapes 1 et 2 — prorata au
  centime conforme ; à repasser en non-régression), 5.3 (étapes 1 et 2,
  côté locataire).

---

# Partie 2 — Reste à recetter

## 2.A — Anomalie du 26/08 : bail signé invisible côté locataire (4.7.1)

> Constat de recette du 26/08, persona LO : « Mon bail » ne permet **pas de
> consulter le bail signé** — la pièce n'est pas disponible. À corriger,
> puis re-tester :
1. « Mon bail » → le bail **signé** est consultable (jamais un brouillon),
   avec ses documents.

### Points gardés pour plus tard (non bloquants)

- **E.3.2** — le bandeau d'erreur de « Signaler un problème » n'est pas
  tout à fait conforme à l'attendu ; accepté en l'état le 26/08, à
  reprendre plus tard.
- **G.3.2** — refus de suppression d'encaissement sur mois clôturé : testé
  partiellement (pas assez de recul en mois clôturés), à confirmer au
  sprint 6.
- **5.1 (prorata au centime)** — validé le 26/08, à repasser lors des
  passes de **non-régression** des prochains sprints.

## 2.B — Sprint 7 : Incidents — reliquat

> L'essentiel du S7 est **validé les 24 et 26/08** (voir Partie 1). Reste :

**7.2.2 (colocataire)** · persona LO — un colocataire voit le bail et les
incidents du bail, mais ne peut ni contester ni rouvrir (réservé au
déclarant). *(Correctif du 23/08 : le colocataire voyait « aucun bail
actif » — RPC corrigées, à vérifier d'un coup d'œil.)*

> Note propriétaire bailleur : le rôle `proprietaire_direct` passe par les
> **mêmes écrans et les mêmes fonctions** que l'agence (vérifié en base) — le
> jour où l'espace bailleur s'ouvre, le workflow incident est déjà générique.
> Le **profil artisan** attend le module devis-artisans (S13) : sans devis ni
> planning, ce serait un écran mort.

## 2.C — Reste des étapes précédentes

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

> Le scénario 4.7 côté locataire (consultation du bail signé) est sorti en
> **anomalie du 26/08** — voir 2.A.

### Sprint 5 — Loyers, quittances, relances, IRL

#### Persona : Agent immobilier (agent.alpha@)

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

> 5.1 (prorata au centime) et 5.3 (échéancier locataire) sont **validés le
> 26/08** — voir Partie 1 ; 5.1 à repasser en non-régression.

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
