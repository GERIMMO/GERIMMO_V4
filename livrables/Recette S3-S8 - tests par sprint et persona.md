# Recette S3→S8 — tests fonctionnels par sprint et persona

> Remis le 2026-08-08, à dérouler sur **https://gerimmo-v4.vercel.app**.
> Mot de passe commun : `Gerimmo-Demo-2026`.
>
> **Méthode itérative** : dérouler **un sprint à la fois**, dans l'ordre. Dans chaque
> sprint, dérouler persona par persona. Un sprint est validé quand tous ses scénarios
> passent → remonter les retours sprint par sprint.
> **Déjà validé** : bloc 0 (non-régression S0–S2, le 08/08).
> Les numéros de scénarios reprennent ceux du document du 05/08
> ([[Recette S3-S8 - scenarios]]) ; les scénarios « C » couvrent les correctifs
> livrés le 08/08.
> Limite connue (pas une anomalie) : SMTP non configuré → constater que l'écran
> propose l'envoi et l'enregistre suffit.

---

## Suivi au 13/08 — recette du jour et correctifs livrés

**Validés le 13/08** : C.2, C.3, C.4 · C.5 (étapes 1, 2, 3, 5) · C.7 · 3.3 (étapes 3 et 4).

**Correctifs livrés le 13/08 — à re-tester** (chaque scénario concerné porte la
mention « ⟳ Re-test 13/08 » avec ce qui a changé) :

| Retour du 13/08 | Correctif | À re-tester |
|---|---|---|
| Confier possible sans destinataire / sans message | Champ « Message au destinataire » ajouté et obligatoire dans « Confier » (écran + serveur) | C.1 |
| C5.4 : liste de lots vide dans l'assistant | Requête corrigée (jointure ambiguë) — lots + recherche de retour | C.5.4 |
| C6.1 jugé KO | **Pas une anomalie** : l'unicité est PAR agence — Alpha et Beta peuvent partager un email. Le refus ne vaut que dans une même agence | C.6.1 |
| C6.2 : aucune alerte doublon | Détection réécrite : nom + prénom comparés **dans les deux sens** (Jean Francois ↔ Francois Jean), accents/casse ignorés | C.6.2 |
| C7.1 : « j'ai pu le faire, problématique ? » | **Non** : vérifié en base, la clôture a bien été refusée (date_fin vide). Créer une détention future est permis, la clore non | — |
| C.8 : création pas en pop-up ; personne non modifiable | Pop-up « Nouveau propriétaire » + bouton « Modifier la fiche » (nom, prénom, email, tél., date de naissance) | C.8 |
| 3.2 : « CNI » et « CNI 2 » côte à côte | Bouton « Déposer une nouvelle version » par pièce + numéro de version + historique dépliable | 3.2 |
| 3.3 : mandat résilié encore modifiable | Mandat résilié **historisé** : grisé, plus aucune action, verrou aussi en base ; taux et lots restent lisibles | 3.3.5 (nouveau) |

Fiches de test à nettoyer (doublons volontaires du 13/08) : « Francois Jean »
×2 (Alpha), « jean luc » (Beta), « Jean Francois » (Alpha) — à archiver après
le re-test de C.6.

---

## Étape 1 — Correctifs du 08/08 : alertes (re-vérification)

### Persona : Agent immobilier (agent.alpha@)

**Scénario C.1 — Assignation obligatoire des alertes** — ⟳ Re-test 13/08
> Correctif : le champ « **Message au destinataire** » existe désormais dans
> « Confier » et est obligatoire (il manquait entièrement).
1. Ouvrir une alerte → « Confier » → tenter de valider **sans destinataire** → refus : au moins une personne est exigée.
2. Dans la liste des destinataires → l'option « **Tout le monde** » n'apparaît **pas** (réservée au responsable).
3. Choisir un destinataire mais valider « Confier » **sans message** → refus, le message est obligatoire. Même règle sur « Marquer traitée ».

**Scénario C.2 — Alertes des autres : lecture seule** — ✔ Validé le 13/08
1. Liste des alertes → celles confiées à quelqu'un d'autre sont **grisées, regroupées en bas** de liste.
2. Cliquer dessus → aucune action possible (ni traiter, ni confier).

**Scénario C.3 — Pop-up de connexion et KPI** — ✔ Validé le 13/08
1. Se déconnecter/reconnecter → la pop-up de synthèse ne liste que **mes** alertes, un **seul** bouton « Fermer ».
2. Tableau de bord → le KPI « À traiter » = le nombre de **mes** alertes ouvertes (compter pour vérifier).

### Persona : Administrateur d'agence (admin.alpha@)

**Scénario C.4 — Droits du responsable** — ✔ Validé le 13/08
1. Confier une alerte → l'option « **Tout le monde** » est disponible.
2. Ouvrir une alerte confiée à agent.alpha@ → le responsable peut la **réassigner** (là où l'agent ne le peut pas).

> C'est le test le plus important de l'étape : un agent ne doit jamais pouvoir
> toucher une alerte confiée à un autre, et « Tout le monde » ne doit exister
> que pour le responsable.

---

## Sprint 3 — Personnes, dossier locataire, mandat

### Persona : Agent immobilier (agent.alpha@)

**Scénario C.5 — Assistant de création en 2 étapes** — étapes 1, 2, 3, 5 ✔ validées le 13/08 ; étape 4 ⟳ Re-test 13/08
> Correctif : la liste des lots sortait vide (requête cassée en silence) —
> réparée et vérifiée : les 12 lots s'affichent, la recherche filtre.
1. Personnes → « Nouvelle personne » → étape 1 : choisir le rôle « Locataire » → passage **automatique** à l'étape 2 (identité) ; le retour à l'étape 1 fonctionne.
2. Valider sans prénom, puis sans email → refus à chaque fois, champ signalé (nom, prénom, email obligatoires).
3. Créer une **raison sociale** (ex. « SCI Test ») → le prénom n'est **pas** exigé, l'email si.
4. Recommencer avec le rôle « Propriétaire mandant » → l'étape 2 propose le **rattachement facultatif d'un lot** avec recherche (taper « quincy » → le lot de Quincy-sous-Sénart reste seul) → rattacher un lot → une **détention à 100 %** apparaît sur la fiche.
5. Recommencer avec le rôle « Locataire » ou « Garant » → **aucun** rattachement de lot proposé ; l'assistant explique que le lien se fera **par le bail**.

**Scénario C.6 — Email unique par agence** — ⟳ Re-test 13/08
> Point d'attention : la règle est « unique **par** agence ». Le constat du
> 13/08 (même email chez Alpha ET chez Beta) est le comportement **voulu** —
> le refus n'est attendu que pour deux fiches de la **même** agence.
> Correctif doublon : la détection compare désormais nom + prénom **dans les
> deux sens** (« Jean Francois » ↔ « Francois Jean »), accents/casse ignorés.
1. Créer « Paul Unique-Test » **dans Alpha** avec l'email d'une fiche existante **d'Alpha** → **refus** : email déjà utilisé dans l'agence. (Le même email dans **Beta** doit, lui, passer.)
2. Créer une personne avec le **même nom + même date de naissance** qu'une fiche existante mais un email différent → **alerte doublon non bloquante**, la création reste possible. Refaire en **inversant nom et prénom** → l'alerte se déclenche aussi.
3. Nettoyage : archiver les fiches de test en double du 13/08 (« Francois Jean » ×2, « jean luc », « Jean Francois »).

**Scénario C.7 — Détention : clôture à date future** — ✔ Validé le 13/08
> Réponse à la question du 13/08 : rien de problématique — vérifié en base, la
> clôture de la détention future (Quincy) a bien été **refusée** (`date_fin`
> reste vide). Créer une détention à date future est permis ; la clore, non.
1. Créer une détention avec une **date de début dans le futur** → tenter de la clôturer → **plus de jargon SQL** (`detentions_check`) : message en français clair orientant vers « **Corriger** ».

**Scénario C.8 — Propriétaire créé depuis la fiche lot** — ⟳ Re-test 13/08
> Correctifs : la création passe désormais par une **pop-up**, et la fiche
> d'une personne devient **modifiable** (ce qui manquait entièrement).
1. Fiche d'un lot → « + Nouvelle personne… » → une **pop-up** « Nouveau propriétaire » s'ouvre → elle exige nom et **email** ; « Valider » referme la pop-up avec un récapitulatif (lien « modifier » pour rouvrir) → « Enregistrer la détention » crée la fiche « propriétaire mandant ».
2. Fiche de la personne créée → « **Modifier la fiche** » → corriger nom, prénom, email, téléphone ou date de naissance → enregistré. L'email reste unique dans l'agence ; le prénom d'une personne physique ne peut pas être vidé.

**Scénario 3.2 — Dossier versionné** — étapes 1 et 3 ✔ validées le 13/08 ; étape 2 ⟳ Re-test 13/08
> Correctif : le dépôt d'une nouvelle version passe par le bouton dédié
> **« Déposer une nouvelle version »** sous la pièce (le 13/08, un second
> dépôt classique créait un document indépendant — d'où « CNI » et « CNI 2 »
> côte à côte ; ces deux-là restent dissociées, redéposer via le bouton ou me
> demander de les lier en base).
1. Fiche personne → déposer une pièce d'identité (PDF) → visible dans le dossier, dans sa catégorie.
2. Sous la pièce → « **Déposer une nouvelle version** » (fichier différent) → seule la version courante s'affiche, marquée **v2** ; l'ancienne reste dans l'« **Historique** » dépliable (jamais supprimée), consultable.
3. Déposer un justificatif de domicile → les deux catégories coexistent.

**Scénario 3.3 — Mandat de gestion** — étapes 3 et 4 ✔ validées le 13/08 ; étape 5 ajoutée ⟳ Re-test 13/08
> Correctif : un mandat **résilié** est désormais **historisé** — verrouillé
> aussi en base (retour du 13/08 : il restait modifiable).
1. Fiche d'une personne propriétaire (détention en cours) → créer un mandat → brouillon avec honoraires proposés à **7 %**, date de rapport au **10**, seuil de délégation par défaut.
2. Ajouter des lots → seuls les lots **détenus par le mandant** sont proposés.
3. Tenter de mettre un même lot dans un **second mandat actif** → refus (un seul mandat actif par lot).
4. Faire les transitions brouillon → à signer → actif → préavis → résilié → chaque état s'affiche sur la fiche.
5. Sur le mandat **résilié** → l'encart est **grisé**, marqué « Historisé — non modifiable » : plus aucun bouton d'état ni d'ajout de lot ; le **taux** et les **lots** du mandat restent lisibles.

**Scénario 3.4 — Attestation d'assurance expirée (partie agent)**
1. Dossier d'un locataire → déposer une attestation avec une **date d'expiration dépassée** → après génération des alertes (bouton/cron superadmin), une alerte **critique** « défaut d'assurance » existe.
2. Redéposer une attestation valide → l'ancienne alerte est **conservée** (preuve), pas effacée.

**Scénario 3.5 — Invitation locataire**
1. Fiche d'une personne sans compte → « Inviter comme locataire » → état du compte « invité/créé » (l'email réel dépend du SMTP — hors périmètre).
2. Réinviter la même personne → **pas de doublon** de compte.

### Persona : Locataire (locataire.alpha@)

**Scénario 3.4 — Assurance côté locataire (suite)**
1. Son espace affiche le **statut de son assurance**.
2. Déposer lui-même une attestation à date d'expiration **future** → acceptée → le statut passe à jour côté agence (revérifier en agent.alpha@).

> Test le plus important du sprint : l'**email unique par agence** (C.6) — c'est
> la nouvelle règle en base ; vérifier aussi qu'elle ne bloque pas deux agences
> différentes d'avoir le même email.

---

## Sprint 4 — Bail et état des lieux

### Persona : Agent immobilier (agent.alpha@)

**Scénario 4.1 — Créer et activer un bail nu (chaîne critique)**
1. Fiche d'un lot **Disponible** → créer un bail nu : locataire, loyer **780 €**, charges **90 €**, dépôt, jour d'échéance ; date d'entrée le **12 du mois** (prépare le prorata du sprint 5).
2. « Activer » sans PDF → refus : « Déposez le bail signé (PDF) avant activation (V0 : signature hors plateforme) ».
3. Déposer le PDF signé → « Activer » → bail **actif**, lot passé à **Loué**, **alerte EDL d'entrée** créée, échéancier de loyers généré.
4. Tenter d'activer un bail sur un lot au **DPE expiré** → refus « Mise en location bloquée : … ».

**Scénario 4.2 — Garde-fous juridiques**
1. Déposer sur un lot un DPE de **classe G** → mise en location refusée : « DPE classe G : logement interdit à la location (loi Climat) ».
2. Renseigner l'**identifiant fiscal du logement** sur la fiche du lot → conservé après enregistrement.
3. Créer un bail **nu** avec un dépôt de garantie de **2 mois** de loyer HC → refus : « Dépôt de garantie trop élevé : maximum 1 mois de loyer hors charges (soit N €) » ; refaire en **meublé** → 2 mois acceptés.

**Scénario 4.3 — Bail meublé : inventaire**
1. Créer un bail **meublé** → la section **inventaire du mobilier** est proposée, avec les catégories du décret 2015 (literie, plaques, réfrigérateur, vaisselle…).
2. Laisser l'inventaire incomplet → **signalé** (alerte de requalification), mais non bloquant.

**Scénario 4.4 — Colocation : garants nominatifs**
1. Créer un bail **colocation** avec 2 colocataires → les deux figurent au bail (solidarité).
2. Ajouter un garant rattaché à **un colocataire nommé** (jamais au bail en bloc) → le lien garant→colocataire s'affiche.

**Scénario 4.5 — Pièces du lot et grille d'EDL réelle**
1. Bail d'un lot **sans pièces déclarées** → « Déclarer les pièces du lot » apparaît **avant** « faire signer l'état des lieux » dans « À faire maintenant » ; l'écran d'EDL le signale et renvoie vers le lot.
2. Fiche du lot → « Proposer les pièces » → pour un T3 : entrée, séjour, chambre 1, chambre 2, cuisine, salle de bain, WC — **dans cet ordre** (pas alphabétique), en un clic.
3. Régénérer la grille d'EDL → **7 éléments par pièce** (49 lignes pour le T3), plus de section « Général » ; les **compteurs** et les **clés** se saisissent.
4. Signer avec une ligne sans état → refus ; tout compléter → signature acceptée → l'EDL est **figé** (toute modification refusée).

**Scénario 4.6 — Congés : préavis, motifs, annulation**
1. Congé **locataire** en **zone tendue** → préavis **1 mois de plein droit**, sans justificatif demandé.
2. Congé locataire **hors zone tendue** avec préavis réduit à 1 mois → refus sans justificatif : « Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d'emploi, RSA/AAH…) ».
3. Congé **bailleur** sans motif → refus : « Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul » ; avec motif → bail en **préavis**, **alerte d'EDL de sortie datée** créée.
4. **Annuler le congé** → bail redevient actif sans date de fin, lot re-loué, alerte de sortie refermée ; le congé annulé **reste au dossier** avec date et motif.
5. Vérifier les deux verrous : EDL de sortie signé → « L'état des lieux de sortie est signé : le départ a eu lieu, le congé ne s'annule plus » ; restitution engagée → « La restitution du dépôt est engagée : le congé ne s'annule plus ».

**Scénario 4.7 — Comparatif EDL (partie agent)**
1. Faire un EDL de sortie avec **2 états dégradés** par rapport à l'entrée → le **comparatif** met ces 2 écarts en évidence, ligne à ligne.

### Persona : Locataire (locataire.alpha@)

**Scénario 4.7 — Consultation du bail (suite)**
1. « Mon bail » → le bail **signé** est consultable (jamais un brouillon), avec ses documents.

> Test le plus important du sprint : la **chaîne d'activation** (4.1) — sans elle,
> rien des sprints 5, 6 et 8 n'est testable. La dérouler en premier.

---

## Sprint 5 — Loyers, quittances, relances, IRL

### Persona : Agent immobilier (agent.alpha@)

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

### Persona : Locataire (locataire.alpha@)

**Scénario 5.3 — Échéancier et quittances**
1. « Mes loyers » → échéancier visible, quittances et reçus **téléchargeables**.
2. Vérifier qu'**aucun commentaire interne** de l'agence n'apparaît nulle part.

> Test le plus important du sprint : le **prorata au centime** (5.1) — les valeurs
> attendues sont exactes au centime, toute autre valeur est une anomalie.

---

## Sprint 6 — Comptabilité et rapport de gestion

### Persona : Agent immobilier (agent.alpha@)

**Scénario 6.1 — Journal : immuable, contre-écriture, honoraires**
1. Chaque encaissement du sprint 5 a produit ses écritures **automatiquement**, honoraires au taux du mandat inclus ; le nom du **mandant s'affiche** sur chaque écriture (A-08).
2. Tenter de modifier ou supprimer une écriture → impossible ; corriger = **contre-passer** (l'action) → une **écriture d'annulation** liée à l'origine, les deux visibles (A-14).
3. Tenter d'écrire dans un **mois clôturé** → refus.
4. Recoupement 5.2 : les écritures de l'encaissement supprimé (loyer et honoraires) **n'apparaissent plus**.

**Scénario 6.3 — Rapport de gestion**
1. Générer le rapport du mandant sur un mois → le relire → l'**envoyer** → le rapport est **figé** (toute correction passe par un rectificatif).
2. Enregistrer le **versement** au mandant → tracé.

### Persona : Administrateur d'agence (admin.alpha@)

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

---

## Sprint 8 (partiel) — Dépôt de garantie et copropriété

### Persona : Agent immobilier (agent.alpha@)

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

---

## Transverse — à vérifier en continu, puis en clôture de recette

### Persona : Agent immobilier (agent.alpha@) — au fil des sprints

**Scénario T.1 — Charte v2 et vocabulaire (A-11 → A-15)**
1. Sur téléphone (ou fenêtre étroite) : l'**en-tête ne se chevauche plus**, la navigation reste utilisable.
2. La **charte v2** de la maquette est appliquée : bandeau encre, navigation laiton, fond crème, Instrument Sans, KPI à jauges, connexion en deux volets.
3. **Aucun jargon technique** : pas de « blocages en base », pas de mois `2026-06`, pas d'erreur PostgreSQL brute.
4. Le même état de lot porte **le même mot** sur tous les écrans ; « Assignée à » ne se lit plus dans les deux sens.
5. Le **rouge est réservé au critique** ; bandeau « À faire maintenant » sur la fiche bail ; états vides qui guident.

### Persona : Administrateur d'agence Beta (admin.beta@) — en fin de recette

**Scénario T.2 — Isolation Alpha / Beta**
1. Copier depuis la session Alpha les **URLs directes** d'une fiche personne, d'un mandat, d'un bail, d'un EDL, d'une écriture et d'une quittance.
2. Connecté en admin.beta@ → aucune de ces données n'est visible dans les listes, et chaque **URL directe → refus/404**.

### Persona : Multi-agences (multi@)

**Scénario T.3 — Cloisonnement du compte multi**
1. Se connecter en multi@ → chaque agence s'affiche **séparément**, jamais de données mélangées ; basculer d'une agence à l'autre et vérifier que les listes changent intégralement.

> C'est le test le plus important de toute la recette : **aucune donnée ne doit
> fuir entre agences**, y compris sur les nouvelles tables (mandats, baux, EDL,
> écritures, quittances, dépôts).

---

## Deux décisions à trancher pendant la recette

- **Propriétaire = locataire du même lot** : un avertissement non bloquant a été proposé — valider ou ajuster.
- **Rattachement locataire/garant via le bail** (C.5.5) : l'assistant l'explique au lieu d'un lien mort — confirmer cette interprétation.
