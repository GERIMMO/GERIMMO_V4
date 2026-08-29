# Recette fonctionnelle humaine — Sprints 3 à 8 (partiel)

> Remise le 2026-08-05, à dérouler sur **https://gerimmo-v4.vercel.app**.
> **Contexte** : les sprints 3 → 6 et une partie du 8 ont été développés et passés en
> recette *autonome* (03/08, 16 anomalies corrigées — `app/docs/recette-autonome-s0-s6.md`).
> Décision : **cette recette autonome ne vaut pas validation** — le présent document
> refait la recette humaine de bout en bout, y compris la vérification des 16 correctifs.
> Comptes de démo (mot de passe commun `Gerimmo-Demo-2026`) :
> `superadmin@` · `admin.alpha@` · `agent.alpha@` · `admin.beta@` · `multi@` ·
> `locataire.alpha@gerimmo-demo.fr`.
> Dérouler **bloc par bloc**, remonter les retours par bloc ; un bloc est validé quand
> tous ses scénarios passent.
> Limites connues (pas des anomalies) : SMTP Resend non configuré → les emails réels
> (invitation, quittance) peuvent ne pas partir ; le constat « l'écran propose l'envoi
> et l'enregistre » suffit.

---

## Bloc 0 — Non-régression S0–S2 (déjà validés par l'humain — passage rapide)

### Scénario 0.1 — Socle et alertes !
Persona : Administrateur d'agence (admin.alpha@)
1. Connexion → si des alertes sont ouvertes, la pop-up de synthèse s'affiche (critique → normale → informative) ; Échap la ferme ; la cloche de l'en-tête la rouvre.
2. admin.beta@ → aucune donnée d'Alpha visible nulle part (isolation).

### Scénario 0.2 — GED !
Persona : Agent immobilier (agent.alpha@)
1. Documents → déposer un PDF → il apparaît, s'ouvre, se télécharge sans casser la page.
2. Déposer un fichier renommé (ex. un .txt renommé en .pdf) → refus avec l'extension réelle annoncée.

### Scénario 0.3 — Parc !
Persona : Agent immobilier (agent.alpha@)
1. Créer un bien (questionnaire progressif) → lot unique en Brouillon, encart « Ce qui empêche la mise en location » sur la fiche bien.
2. Vérifier qu'un lot au DPE expiré refuse la mise en location : « DPE absent ou expiré (obligatoire en habitation) ».

---

## Bloc S3 — Personnes, dossier locataire, mandat

### Scénario 3.1 — Personnes : création, doublon, rôles déduits !
Persona : Agent immobilier (agent.alpha@)
1. Personnes → créer « Émile Garant-Test », date de naissance remplie → fiche créée.
2. Recréer le même nom + même date de naissance → **alerte doublon non bloquante** (la création reste possible).
3. Modifier l'email de la fiche → accepté (l'email reste modifiable par l'agent).
4. La liste des personnes affiche des **rôles déduits des données** : une personne avec détention en cours → « Propriétaire » (mention « mandat » si mandat actif) ; avec bail vivant → « Locataire » ; garante d'un bail vivant → « Garant » ; fiche sans lien → aucun badge.
5. Rechercher « emile » (sans accent) → trouve Émile ; rechercher « garant » → liste les garants.

### Scénario 3.2 — Dossier versionné !
Persona : Agent immobilier (agent.alpha@)
1. Fiche personne → déposer une pièce d'identité (PDF) → visible dans le dossier.
2. Déposer une **nouvelle version** de la même pièce → seule la version courante s'affiche ; l'historique conserve l'ancienne (jamais de suppression).
3. Plusieurs catégories de pièces coexistent (identité, justificatif de domicile…).

### Scénario 3.3 — Mandat de gestion !
Persona : Agent immobilier (agent.alpha@)
1. Fiche d'une personne propriétaire (détention en cours) → créer un mandat (brouillon) → taux d'honoraires proposé à **7 %**, date de rapport au **10**, seuil de délégation par défaut.
2. Ajouter des lots au mandat → seuls les lots **détenus par le mandant** sont proposés.
3. Tenter de mettre un même lot dans un **second mandat actif** → refus (un seul mandat actif par lot).
4. Transitions d'état : brouillon → à signer → actif → préavis → résilié ; chaque état s'affiche sur la fiche.

### Scénario 3.4 — Attestation d'assurance et alertes !
Personas : Agent immobilier (agent.alpha@) puis Locataire (locataire.alpha@)
1. agent.alpha@ → dossier d'un locataire → déposer une attestation avec une **date d'expiration dépassée** → après génération des alertes (bouton/cron SA), une alerte **critique** « défaut d'assurance » existe ; chaque alerte est conservée (preuve), même une fois l'attestation redéposée.
2. locataire.alpha@ → son espace affiche le **statut de son assurance** ; déposer lui-même une nouvelle attestation (avec date d'expiration future) → acceptée, statut à jour côté agence.

### Scénario 3.5 — Invitation locataire !
Persona : Agent immobilier (agent.alpha@)
1. Fiche d'une personne sans compte → « Inviter comme locataire » → l'état du compte passe à « invité/créé » (l'email réel dépend du SMTP — hors périmètre du constat).
2. Réinviter la même personne → pas de doublon de compte.

---

## Bloc S4 — Bail et état des lieux

### Scénario 4.1 — Créer et activer un bail nu (chaîne critique) !
Persona : Agent immobilier (agent.alpha@)
1. Fiche d'un lot **Disponible** → créer un bail nu : locataire, loyer 780 €, charges 90 €, dépôt, jour d'échéance ; date d'entrée le **12 du mois** (pour le prorata, scénario 5.1).
2. *(révisé le 29/08)* Le bouton **« Valider »** (bas de la fiche) reste grisé tant que la liste de prérequis n'est pas cochée : bail signé déposé, EDL d'entrée signé.
3. Déposer le PDF signé (carte « Bail signé ») ; créer l'EDL d'entrée, remplir la grille, signer ; facultatif : déposer le règlement de copropriété → « Valider » → bail **actif**, lot **Loué**, **aucune alerte** créée ; échéancier de loyers à générer.
4. Tenter de valider un bail sur un lot au DPE expiré → refus « Mise en location bloquée : … ».
5. Sur le lot loué, créer un second bail (brouillon) : accepté ; le valider → refus « Un bail est déjà en cours sur ce lot : il doit être terminé avant de valider celui-ci ».

### Scénario 4.2 — Garde-fous juridiques (DPE G, identifiant fiscal, dépôt) !
Persona : Agent immobilier (agent.alpha@)
1. Sur un lot, déposer un DPE en renseignant la **classe G** → la mise en location est refusée : « DPE classe G : logement interdit à la location (loi Climat) ».
2. La fiche du lot porte un champ **identifiant fiscal du logement** ; le renseigner → conservé.
3. Créer un bail **nu** avec un dépôt de garantie > 1 mois de loyer HC → refus « Dépôt de garantie trop élevé : maximum 1 mois de loyer hors charges (soit N €) » ; en **meublé**, la limite passe à 2 mois.

### Scénario 4.3 — Bail meublé : inventaire !
Persona : Agent immobilier (agent.alpha@)
1. Créer un bail **meublé** → la section **inventaire du mobilier** est proposée ; les catégories du décret 2015 (literie, plaques, réfrigérateur, vaisselle…) se cochent/complètent.
2. L'inventaire incomplet vis-à-vis du mobilier minimum → signalé (alerte de requalification), non bloquant.

### Scénario 4.4 — Colocation : colocataires et garants nominatifs !
Persona : Agent immobilier (agent.alpha@)
1. Créer un bail **colocation** avec 2 colocataires → les deux figurent au bail (solidarité).
2. Ajouter un **garant rattaché à un colocataire nommé** (jamais au bail en bloc) → le lien garant→colocataire s'affiche.

### Scénario 4.5 — Pièces du lot et grille d'EDL réelle !
Persona : Agent immobilier (agent.alpha@)
1. Sur la fiche du bail d'un lot **sans pièces déclarées** : « Déclarer les pièces du lot » apparaît **avant** « faire signer l'état des lieux » dans « À faire maintenant » ; l'écran d'EDL signale qu'il ne détaille aucune pièce et renvoie vers le lot.
2. Fiche du lot → « Proposer les pièces » → la liste entière est créée en un clic, déduite du nombre de pièces (T3 → entrée, séjour, chambre 1, chambre 2, cuisine, salle de bain, WC — dans cet ordre, pas l'ordre alphabétique).
3. Régénérer la grille d'EDL → **7 éléments par pièce** (49 lignes pour un T3), plus de section « Général » ; les **compteurs** (eau, élec…) et les **clés** remises se saisissent.
4. Signer avec une ligne sans état → refus ; compléter toutes les lignes → signature acceptée → l'EDL est **figé** (toute modification refusée).

### Scénario 4.6 — Congés : préavis, motifs, annulation !
Persona : Agent immobilier (agent.alpha@)
1. Congé **locataire** sur un bail actif en **zone tendue** → préavis **1 mois de plein droit, sans justificatif**.
2. Hors zone tendue, préavis réduit à 1 mois → refus sans justificatif : « Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d'emploi, RSA/AAH…) ».
3. Congé **bailleur** sans motif → refus : « Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul » ; avec motif → bail en **préavis**, **alerte d'EDL de sortie datée** créée.
4. **Annuler le congé** → bail redevient actif sans date de fin, lot re-loué, alerte de sortie refermée ; le congé annulé **reste au dossier** avec date et motif.
5. Refus d'annulation dans les deux verrous : EDL de sortie signé → « L'état des lieux de sortie est signé : le départ a eu lieu, le congé ne s'annule plus » ; restitution engagée → « La restitution du dépôt est engagée : le congé ne s'annule plus ».

### Scénario 4.7 — Comparatif EDL et consultation locataire !
Personas : Agent immobilier puis Locataire (locataire.alpha@)
1. Faire un EDL de sortie avec 2 états dégradés par rapport à l'entrée → le **comparatif** met les écarts en évidence, ligne à ligne.
2. locataire.alpha@ → « Mon bail » : consultation du bail **signé** uniquement (jamais le brouillon), et de ses documents.

---

## Bloc S5 — Loyers, quittances, relances, IRL

### Scénario 5.1 — Prorata au centime et montant dû = somme des lignes ! (A-01, A-02)
Persona : Agent immobilier (agent.alpha@)
1. Sur le bail entré le 12 du mois (loyer 780 €, charges 90 €, mois de 31 jours) → le premier appel affiche **503,23 € de loyer + 58,06 € de charges = 561,29 €** (arrondi une seule fois, à la fin, par composante — pas 503,26/561,32).
2. Sur tout appel : le **montant dû est exactement la somme des lignes affichées**.

### Scénario 5.2 — Encaissement, quittance, reçu ! (A-03, A-16)
Persona : Agent immobilier (agent.alpha@)
1. Encaisser le montant **total** d'un appel → **quittance** générée, consultable et imprimable ; l'envoi par email est proposé (constat d'enregistrement suffisant sans SMTP).
2. Encaisser un montant **partiel** sur un autre appel → **reçu** (pas de quittance) ; compléter le solde → le reçu est **promu en quittance**.
3. Le **mode de règlement** se choisit dans une **liste fermée** (virement, chèque, espèces…) — plus de champ libre.
4. **Supprimer un encaissement** → ses écritures comptables disparaissent du journal (loyer ET honoraires) — vérifier au Bloc S6 que le journal ne les montre plus.

### Scénario 5.3 — Espace locataire : échéancier et quittances !
Persona : Locataire (locataire.alpha@)
1. « Mes loyers » → échéancier visible, quittances/reçus téléchargeables ; jamais les commentaires internes de l'agence.

### Scénario 5.4 — Impayés, relances, régularisation !
Persona : Agent immobilier (agent.alpha@)
1. Un appel non payé à échéance → visible en retard (rouge) ; générer une **relance** → conservée comme preuve ; la mise en demeure s'enregistre (LRAR hors plateforme).
2. **Régularisation des charges** : saisir les charges réelles avec justificatif → décompte provisions vs réel, solde dans le bon sens ; charges au **forfait** → aucune régularisation proposée.

### Scénario 5.5 — Révision IRL !
Persona : Agent immobilier (agent.alpha@)
1. Sur un bail à la date anniversaire (indice IRL saisi) → une **proposition** de révision s'affiche : nouveau loyer = loyer × IRL nouveau / IRL de référence ; validation ou renonciation explicite.
2. Bail au DPE **F ou G** → révision **bloquée** (interdite légalement).
3. La révision ne s'applique **jamais rétroactivement** aux appels déjà émis.

---

## Bloc S6 — Comptabilité et rapport de gestion

### Scénario 6.1 — Journal : immuable, contre-écriture, honoraires !
Persona : Agent immobilier (agent.alpha@)
1. Chaque encaissement de loyer produit ses écritures **automatiquement**, honoraires du mandat inclus (taux du mandat) ; le nom du **mandant s'affiche** sur les écritures (A-08).
2. Aucune écriture n'est modifiable ni supprimable ; corriger = **contre-passer** (l'action) → une **écriture d'annulation** liée à l'origine, les deux visibles (vocabulaire distinct action/résultat — A-14).
3. Écrire dans un **mois clôturé** → refus.

### Scénario 6.2 — Clôture et ventilation !
Persona : Administrateur d'agence (admin.alpha@)
1. Clôturer un mois → plus aucune écriture possible dessus ; réouverture par l'admin avec motif.
2. Une dépense saisie sur un **bien multi-lots** → ventilée par la clé de répartition, une écriture par lot (les lots à 0 % sont sautés).

### Scénario 6.3 — Rapport de gestion !
Persona : Agent immobilier (agent.alpha@) — le mandat de démo existe (bloc comptabilité testable)
1. Générer le rapport du mandant sur un mois → relu puis **envoyé** → le rapport est **figé** (toute correction = rectificatif) ; le **versement** au mandant s'enregistre.

### Scénario 6.4 — Export CSV du journal ! (A-04 → A-07)
Persona : Administrateur d'agence (admin.alpha@)
1. Exporter le journal sur une **période** choisie (pas tout l'historique d'office).
2. Ouvrir dans Excel français → montants à la **virgule** décimale, lisibles.
3. Colonnes **lot et mandant** présentes → le journal se ventile.
4. La période et l'écriture annulée sortent **en français lisible** ; une lecture en échec affiche une **erreur visible** (jamais un CSV vide silencieux).

---

## Bloc S8 (partiel) — Dépôt de garantie et copropriété

### Scénario 8.1 — Encaissement du dépôt !
Persona : Agent immobilier (agent.alpha@)
1. Sur un bail actif → enregistrer l'encaissement du dépôt (date, moyen, montant, versant — un tiers payeur est traçable) → badge « encaissé » sur le bail + écriture comptable.

### Scénario 8.2 — Restitution : délais, retenues, décote !
Persona : Agent immobilier (agent.alpha@)
1. Enregistrer la **remise des clés** → le compteur légal démarre : **1 mois** si EDL de sortie conforme, **2 mois** si écarts.
2. Les **écarts du comparatif d'EDL** sont repris ; l'agent juge l'imputabilité, saisit le coût → **décote de vétusté** appliquée ; justificatif joint (alerte si absent).
3. **Sans EDL d'entrée** → aucune retenue possible, restitution intégrale imposée.
4. Finaliser le décompte → figé : « Décompte finalisé — plus de retenue possible » à toute nouvelle retenue ; relancer une restitution sur le même bail → « Restitution déjà finalisée pour ce bail ».

### Scénario 8.3 — Copropriété : appel de charges !
Persona : Agent immobilier (agent.alpha@)
1. Sur un lot en copropriété → saisir un **appel de charges du syndic poste à poste**, avec la part **récupérable / non récupérable** par poste.
2. Lancer une régularisation de charges sur ce lot **sans appel saisi** pour l'exercice → bloquée (le décompte attend l'appel du syndic).

---

## Bloc T — Transverse (charte, responsive, isolation)

### Scénario T.1 — Charte visuelle et vocabulaire ! (A-11 → A-15)
Persona : Agent immobilier (agent.alpha@), au fil des blocs précédents
1. Sur téléphone (ou fenêtre étroite) : l'**en-tête ne se chevauche plus**, la navigation reste utilisable.
2. Aucun jargon technique à l'écran : pas de « blocages en base », pas de mois `2026-06`, pas de messages d'erreur PostgreSQL bruts — tout est en français lisible.
3. Le même état de lot porte **le même mot** sur tous les écrans ; « Assignée à » ne se lit plus dans les deux sens.
4. Tableau de bord : le **rouge est réservé au critique** ; bandeau « À faire maintenant » sur la fiche bail ; états vides qui guident.

### Scénario T.2 — Isolation sur les nouvelles tables !
Personas : admin.beta@ puis multi@
1. admin.beta@ → aucune personne, mandat, bail, EDL, écriture ou quittance d'Alpha n'est visible ou atteignable par URL directe.
2. multi@ → voit chacune de ses agences séparément, jamais mélangées.

---

## Couverture des 16 anomalies de la recette autonome

| Anomalie | Vérifiée au scénario |
|---|---|
| A-01 prorata au centime | 5.1 |
| A-02 montant dû = somme des lignes | 5.1 |
| A-03 suppression d'encaissement → écritures retirées | 5.2 (+ 6.1) |
| A-04 virgule décimale dans l'export | 6.4 |
| A-05 colonnes lot/mandant | 6.4 |
| A-06 erreur d'export visible | 6.4 |
| A-07 export par période | 6.4 |
| A-08 nom du mandant affiché | 6.1 |
| A-09 échéance de l'EDL de sortie | 4.6 (alerte datée) |
| A-10 lot loué sans bail impossible | 4.1 (chaîne d'activation) |
| A-11 en-tête mobile | T.1 |
| A-12 vocabulaire unifié des états | T.1 |
| A-13 jargon hors écran | T.1 |
| A-14 contre-passation vs écriture d'annulation | 6.1 |
| A-15 « Assignée à » | T.1 |
| A-16 mode de règlement en liste fermée | 5.2 |
