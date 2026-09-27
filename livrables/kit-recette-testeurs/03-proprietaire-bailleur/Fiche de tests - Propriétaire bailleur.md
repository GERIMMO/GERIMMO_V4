<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# Fiche de tests — Propriétaire bailleur

*Sophie Lemaire, propriétaire de deux biens, gère seule sans agence* · 26 tests


## Comment utiliser cette fiche

- **Dans l'ordre** : les tests suivent le déroulé de la recette (J1, J2…). Chaque carte dit sur quel appareil la
  faire, combien de temps elle prend, et quel test doit avoir été fait avant.
- **Les données** à saisir sont dans la carte ou dans « Mon personnage » ; les **fichiers** partent du dossier
  `documents/` de votre dossier.
- <span class="pastille alerte">⏳ Dépend d'un autre testeur</span> : attendez que la personne citée ait fait son test
  (le coordinateur vous prévient). <span class="pastille paiement">💳 Paiement réel</span> : votre carte est
  réellement débitée — seulement avec l'accord du coordinateur. <span class="pastille claire">Facultatif</span> : à
  faire si vous avez le temps.
- **Cochez** OK, KO, Bloqué ou Non fait. **KO ou Bloqué** : signalez-le tout de suite dans Gerimmo par
  « Aide et retours » (voir la fiche de remontée), en commençant le titre par le numéro du test
  (ex. `[GÊNANT] PRO-03 — …`), puis notez la **référence** donnée par Gerimmo.
- Un écart entre le résultat attendu et ce que vous voyez est **toujours** bon à signaler, même petit.

## Les tests

### J1 · Inscription et installation

#### PRO-01 — S'inscrire en ligne et confirmer son adresse

💻 Ordinateur · ⏱ 10 min

1. www.gerimmo.app/connexion → « Propriétaire bailleur ? Ouvrir mon espace » (ou directement www.gerimmo.app/inscription).
2. *Prénom* **Sophie** ; *Nom* **LEMAIRE** ; *Adresse postale* **40 boulevard du Test** ; *Code postal* **91100** ; *Ville* **Corbeil-Essonnes** ; *Téléphone* **06 39 98 60 30** ; *Vous louez en tant que* **Personne physique** ; *Adresse e-mail* : la vôtre ; *Code de parrainage* : **laissez vide** (sinon l'essai passerait à 30 jours).
3. Mot de passe de 8 caractères seulement → **[Ouvrir mon espace]** : refus attendu. Puis deux mots de passe différents : refus attendu.
4. Mot de passe correct (12 caractères ou plus), confirmé ; cochez les CGU → **[Ouvrir mon espace]**.
5. Avant de confirmer, essayez de vous connecter : refus attendu. Puis ouvrez le courriel **« Confirmez votre adresse — Gerimmo »** → **[Confirmer mon adresse]** (lien valable 1 heure).

**Résultat attendu :** Messages « Le mot de passe doit compter au moins 12 caractères. », « Les deux saisies ne correspondent pas. », puis « Vérifiez votre boîte mail… ». Connexion avant confirmation : « Votre adresse e-mail n'est pas encore confirmée… ». Après confirmation : votre espace « Parc de Sophie Lemaire » s'ouvre.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-02 — Découvrir son espace

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. **Tableau de bord** : « Bonjour Sophie », bloc « Mettre votre premier lot en location ».
2. Barre latérale : « Essai gratuit — 14 jours restants ».
3. Ouvrez chaque entrée : **Mes lots**, **Locataires & garants**, **Loyers & charges**, **Livre recettes-dépenses**, **Incidents**, **Alertes**, **Agenda**, **Statistiques**, **Messages**, et sous « Plus » : **Mon profil**, **Fiscalité**, **Documents**, **Carnet d'artisans**, **Abonnement**, **Aide**.

**Résultat attendu :** Aucune page d'erreur ; chaque écran vide explique quoi faire. Pas de mandat ni d'honoraires : c'est l'espace d'un propriétaire.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-03 — Compléter son profil (condition pour créer un bien)

💻 Ordinateur · ⏱ 8 min

**Fichiers :** `01-mon-identite/signature-sophie-lemaire.png`

1. **Mes lots** → **[Ajouter un bien]** : si le profil est incomplet, l'encadré « Complétez d'abord votre profil » apparaît → **[Compléter mon profil]**.
2. **Mon profil** : *Nom de votre espace* **Parc de Sophie Lemaire** ; *Adresse* **40 boulevard du Test** ; **91100** **Corbeil-Essonnes** ; *Téléphone* **06 39 98 60 30** ; *Email de contact* : votre adresse ; *SIRET* vide ; *IBAN* **FR76 9999 9000 0200 0060 3177 722** (fictif).
3. Cochez les trois envois automatiques (avis d'échéance, quittances, relances) ; relances à **1** et **2** jours → **[Enregistrer]**.
4. Carte « Signature préenregistrée » : `signature-sophie-lemaire.png` → **[Enregistrer]**.

**Résultat attendu :** Profil enregistré ; « Ajouter un bien » s'ouvre désormais sur le formulaire. Pas de rubrique de marque (logo) pour un propriétaire : c'est normal.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J1 · Mes biens

#### PRO-04 — Créer l'appartement du Banc-d'Essai

💻 Ordinateur · ⏱ 10 min

1. **Mes lots** → **[Ajouter un bien]** : *Référence interne* **Appartement Banc-d'Essai** ; *Type* **Appartement** ; *Adresse* **27 rue du Banc-d'Essai** ; **91100** **Corbeil-Essonnes** ; *Année de construction* **1938** ; cochez *En copropriété* et *En zone tendue* ; *Parties communes* **Hall, cour intérieure, local poubelles** ; *TIC* **Fibre optique** ; *Surface (m²)* **41.8** ; *Nombre de pièces* **2** → **[Créer le bien et son lot unique]**.
2. Sur la fiche du lot → **[Modifier le lot]** : *Nom du lot* **B3** ; *Étage* **3** ; *Identifiant fiscal du logement* **9999917410003** ; *Chauffage* **Individuel — chaudière gaz** ; *Eau chaude* **Individuelle — chaudière gaz** ; *Locaux privatifs* **Néant** ; *Autres parties du logement* **Néant** → **[Enregistrer]**.
3. « Pièces (état des lieux) » → **[Proposer les pièces de ce logement]**.

**Résultat attendu :** Le lot est créé et vous êtes déjà propriétaire à 100 % (détention posée d'office sur votre fiche). Il reste « En préparation » tant que les diagnostics manquent.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-05 — Déposer les diagnostics et mettre B3 en location

💻 Ordinateur · ⏱ 15 min

**Données :** Dates : « Mon personnage » § 5 (aussi écrites sur chaque PDF).

**Fichiers :** `02-appartement-banc-d-essai-diagnostics/ (7 fichiers)`

1. Fiche du lot → « Diagnostics du lot » : **DPE** classe **D** (**04/03/2025** → **03/03/2035**) ; **Électricité** et **Gaz** (**10/09/2026** → **09/09/2032**) ; **Plomb (CREP)** (**04/03/2025**, échéance vide) ; **Amiante (privatif)** (**04/03/2025**, échéance vide). Diagnostiqueur : **Diag'Essai Expertises**.
2. « Diagnostics du bien » : **ERP — état des risques** (**16/09/2026** → **16/03/2027**) ; **Amiante (parties communes)** (**03/02/2020**, échéance vide).
3. Carte du haut → **[Mettre en location]**.

> [!warning]
> Si un dépôt échoue avec un message général, ne réessayez pas le même fichier : prenez la copie de secours (dossier `secours/`) et signalez-le.

**Résultat attendu :** Gerimmo attend bien le plomb (construction avant 1949) et l'amiante (avant 1997). « Lot passé en « Disponible ». »

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-06 — Créer le Studio Maquette (deuxième bien)

💻 Ordinateur · ⏱ 10 min

**Fichiers :** `03-studio-maquette-diagnostics/ (3 fichiers)`

1. **[Ajouter un bien]** : **Studio Maquette** ; **Appartement** ; **5 impasse de la Maquette** ; **91150** **Étampes** ; **2004** ; *En copropriété* cochée, *En zone tendue* **non** ; **Hall, parking extérieur** ; **Fibre optique et antenne TNT collective** ; **22.4** m² ; **1** pièce → créer.
2. Lot : nom **M1**, étage **1**, identifiant **9999922230001**, chauffage **Individuel — électricité**, eau chaude **Individuelle — ballon électrique**, locaux privatifs **Place de parking n° 7**, autres parties **Néant**.
3. Diagnostics : DPE classe **C** (**21/06/2024** → **20/06/2034**), électricité (**17/09/2026** → **16/09/2032**), ERP (**17/09/2026** → **17/03/2027**).

**Résultat attendu :** Deux biens dans « Mes lots ». Ni plomb ni amiante demandés (construction de 2004).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J1 · Abonnement

#### PRO-07 — Souscrire l'abonnement

💻 Ordinateur · ⏱ 10 min · 💳 **paiement réel**

1. Plus → **Abonnement** : « Total mensuel » **5,99 €** (premier bien offert, le second payant).
2. **[S'abonner — 5,99 € par mois]** → page de paiement Stripe : revenez d'abord en arrière **sans payer**.
3. Recommencez et payez avec votre carte (adresse de facturation demandée, validation 3D Secure possible).

> [!warning]
> Paiement réel : ne le faites qu'après accord du coordinateur sur la prise en charge.

**Résultat attendu :** Sans payer : « Paiement interrompu : rien n'a été prélevé, et rien n'a changé… ». Après paiement : « Merci, votre paiement est enregistré… », statut « Abonnement actif », et la mention que la carte ne sera débitée qu'à la fin de l'essai (date affichée).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-08 — Gérer son abonnement dans le portail Stripe

💻 Ordinateur · ⏱ 3 min · 💳 **paiement réel**

1. **Abonnement** → **[Gérer mon abonnement]** : regardez carte, factures, adresse. **Ne résiliez pas maintenant.** Revenez dans Gerimmo.

**Résultat attendu :** Le portail Stripe s'ouvre et ramène à Gerimmo. Une erreur à l'ouverture est à signaler en [BLOQUANT].

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J2 · Mise en location

#### PRO-09 — Créer la fiche de Thomas et déposer son dossier

💻 Ordinateur · ⏱ 12 min

**Fichiers :** `04-dossier-thomas-girard/ (5 fichiers)`

1. **Locataires & garants** → **[+ Créer une fiche]** → **Locataire** : **GIRARD** **Thomas** ; *Adresse email* : **l'adresse réelle du testeur « Locataire du propriétaire »** (demandez-la au coordinateur) ; **06 39 98 60 31** ; né le **25/08/1998** à **Lille** ; **12 rue des Ébauches**, **59000** **Lille** → **[Créer la fiche]**.
2. « Pièces justificatives » : **Pièce d'identité** `piece-identite-thomas-girard.pdf` ; **Justificatif** : les 3 bulletins et `attestation-employeur-thomas-girard.pdf`.

**Résultat attendu :** Fiche de Thomas avec 5 pièces.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-10 — Inviter Thomas et lui réclamer trois pièces

💻 Ordinateur · ⏱ 5 min

1. Prévenez le testeur (lien valable 1 heure). Fiche de Thomas → « Accès locataire » → **[Inviter comme locataire]**.
2. Une fois son compte actif (LOP-01) : « Pièces réclamées » → **[Justificatif de domicile]**, **[Avis d'imposition]**, puis **RIB** → **[Demander]** à chaque fois.

**Résultat attendu :** « Invitation envoyée à … » puis « Compte locataire actif » ; Thomas reçoit trois courriels « Pièce demandée : … ». Ses dépôts (LOP-04) rejoignent son dossier.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-11 — Créer le bail de Thomas, le faire signer, le déposer signé

💻 Ordinateur · ⏱ 25 min

**Fichiers :** `05-bail-signe/bail-signe-thomas-girard.pdf`

1. Fiche du lot B3 → « Baux & état des lieux » : **Nu** ; locataire **Thomas GIRARD** ; *Date d'entrée* **16/09/2026** (entrée en cours de mois, exprès) ; *Jour d'échéance* **1** ; **720** € hors charges ; **60** € de charges en **Provision** ; dépôt **720** ; IRL **T2**, révision cochée → **[Créer le bail]**.
2. « Compléments du contrat » : **Librement fixé** ; **À échoir (d'avance)** ; lieu **Virement sur le compte de Sophie Lemaire** ; IRL de référence **146,00** (valeur de test) ; dernier loyer du précédent locataire **700**, dernier versement **31/08/2026**, dernière révision **01/03/2026** (si proposés) → **[Enregistrer les compléments]**. Puis **[Générer le bail (PDF)]** et la notice.
3. **Documents** → le PDF du bail → **[Envoyer pour signature]** (Thomas). Attendez son retour (LOP-05).
4. Fiche du bail → « Bail signé » → `bail-signe-thomas-girard.pdf` → **[Déposer le bail signé]** → **[Envoyer au locataire]**.

**Résultat attendu :** Bail actif, lot « Loué », Thomas reçoit « Votre bail signé est disponible ». Préavis d'un mois affiché (zone tendue).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-12 — État des lieux d'entrée et dépôt de garantie

💻 📱 Ordinateur ou téléphone · ⏱ 20 min

**Données :** « Mon personnage » § 7 (état des pièces, compteurs, clés).

1. « États des lieux » → « Nouvel état des lieux » **Entrée** → **[Préparer cet état des lieux]** → **[Ouvrir la grille]**.
2. Mentions : **Sophie Lemaire (bailleuse) ; Thomas Girard (locataire)** ; détecteur **Présent**, **Fonctionne (testé)** ; assurance fournie **Oui** ; observations **Néant** → **[Enregistrer les mentions]**.
3. Grille : pièce par pièce d'après « Mon personnage » (le séjour en **Usagé** avec son commentaire) ; compteurs gaz **RCT-GZ-0317** **8412**, électricité **0999 7412 0003** **20115**, eau **RCT-0317** **311,020** ; clés 2 + 1 + 1 bip → **[Enregistrer et signer]** → **[Générer le PDF]**.
4. « Dépôt de garantie » → **[Enregistrer un encaissement]** **720**, date du jour, **Virement** → **[Encaisser]**.

**Résultat attendu :** État des lieux « Signé — figé » avec son PDF ; dépôt de 720 € enregistré avec son reçu.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-13 — Enregistrer l'artisan dans votre carnet

💻 Ordinateur · ⏱ 5 min

> ⏳ L'artisan est inscrit et validé (ART-04).

1. Plus → **Carnet d'artisans** → « Enregistrer un artisan » : **Haddad Plomberie Chauffage** ; SIRET **00007314800017** ; mobile **06 39 98 73 14** ; courriel vide ; métiers **Plomberie** et **Chauffage** ; zone **91100** → **[Enregistrer l'artisan]**.

**Résultat attendu :** « Artisan enregistré… sa fiche vous a été rattachée plutôt que dupliquée. » Il apparaît validé par Gerimmo.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3 · Loyers

#### PRO-14 — Générer l'échéancier : un premier mois au prorata

💻 Ordinateur · ⏱ 5 min

1. Fiche du bail → « Loyers & paiements » → **[Générer l'échéancier]**.
2. Ouvrez **[Prorata (PDF)]** de septembre et **[Avis d'échéance (PDF)]** d'octobre.
3. **Loyers & charges** : tuiles « Demandé ce mois », « Encaissé », « Reste dû ».

**Résultat attendu :** Septembre est appelé au prorata (du 16 au 30 : environ 390 €, soit la moitié de 780 €), octobre pour 780 €. Le décompte de prorata explique le calcul. Si les envois automatiques sont cochés, Thomas reçoit l'avis le lendemain matin, puis une relance tant que rien n'est encaissé.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-15 — Encaisser septembre, puis un paiement partiel, puis le solde

💻 Ordinateur · ⏱ 12 min

> ⏳ De préférence le lendemain de PRO-14, après les courriels du matin (Thomas vous dit ce qu'il a reçu).

1. **Loyers & charges** : sur la ligne de Thomas, le bouton « Encaisser … » signale « (septembre d'abord) ». **Ne cliquez pas** : faites les trois paiements depuis la fiche du bail, pour contrôler les montants.
2. Fiche du bail → « Loyers & paiements » → **[Saisir un encaissement]** : le montant exact du prorata de septembre (environ **390** €), date du jour, **Virement** → **[Encaisser]** → septembre « Payé ».
3. **[Saisir un encaissement]** : **400** € → **[Encaisser]** → octobre devient « Partiel » avec un « Reçu partiel ».
4. **[Saisir un encaissement]** : **380** € → **[Encaisser]** → octobre « Payé ».
5. Envoyez ce qui n'est pas encore parti (**[Envoyer le reçu]**, **[Envoyer la quittance]**, ou l'envoi groupé de « Loyers & charges »).

**Résultat attendu :** Quittance de septembre ; reçu de paiement d'octobre (400 €) ; puis quittance d'octobre au solde. Thomas reçoit « Reçu de paiement — octobre 2026 » puis « Quittance de loyer — octobre 2026 ». Le compte rendu d'encaissement dit « imputés du terme le plus ancien au plus récent ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3–J5 · Incidents

#### PRO-16 — Qualifier le radiateur en panne et consulter l'artisan

💻 Ordinateur · ⏱ 12 min

> ⏳ Thomas a signalé son radiateur (LOP-09).

1. **Incidents** → l'incident → « Qualification — qui paie » : **Charge propriétaire** ; **Tête thermostatique défectueuse par usure : charge de la bailleuse** → **[Qualifier l'incident]**.
2. « Confier à un artisan » : *Métier* **Chauffage** ; *Nature des travaux* **Remplacement d'équipement** (décennale exigée) ; validité **30** ; « J'assume un devis unique » → **[Ouvrir la mise en concurrence]** → Haddad → **[Demander un devis]**.
3. Au devis reçu (ART-11 : 205,59 € TTC) → **[Retenir ce devis]**.

**Résultat attendu :** L'artisan est proposé (décennale valide, zone 91100, carnet). Le devis se lit ligne par ligne ; la mission est confiée.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-17 — Trancher une « autre cause » signalée par l'artisan, puis clôturer

💻 Ordinateur · ⏱ 10 min

> ⏳ L'artisan a fait l'intervention et signalé un problème imprévu (ART-13).

1. Carte « L'artisan signale une autre cause — à trancher avant facturation » → *Qui prend en charge, après diagnostic* **Charge propriétaire** ; *Justification* **Robinet de radiateur grippé, usure normale** → **[Réviser l'imputation]**.
2. Si le montant change, décidez : **[Accepter l'avenant]** (ou refuser et garder le montant autorisé).
3. « Noter Haddad Plomberie Chauffage » (5 / 5 / 4) → **[Noter l'artisan]** ; « Clôture » : **Résolu**, **Tête thermostatique remplacée, circuit purgé** → **[Clôturer l'incident]**.

**Résultat attendu :** La révision d'imputation est tracée avant facturation ; l'artisan peut ensuite déposer sa facture ; l'incident est « Clos ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-18 — Déclarer vous-même un incident, imputé au locataire

💻 Ordinateur · ⏱ 8 min

**Fichiers :** `06-incidents/incident-prise-arrachee.jpg`

1. **Incidents** → **[Ouvrir un incident]** (…/incidents/nouveau) : lot **B3** ; **Électricité — interrupteur, prise, ampoule** ; pièce **Chambre** ; urgence **Urgent — dégât en cours ou logement inutilisable** ; description **Prise arrachée dans la chambre, fils apparents** ; photo `incident-prise-arrachee.jpg` → **[Déclarer l'incident]**.
2. Qualifiez : **Dégradation fautive — charge locataire**, **Prise arrachée en déplaçant un meuble**.
3. Attendez la contestation de Thomas (LOP-14), répondez-lui, puis clôturez : **Classé sans suite**, **Le locataire fait intervenir son propre électricien**.

**Résultat attendu :** L'incident est visible par Thomas avec l'imputation ; sa contestation vous parvient ; la clôture « Classé sans suite » est tracée.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J5–J7 · Gestion courante

#### PRO-19 — Tenir le livre recettes-dépenses

💻 Ordinateur · ⏱ 15 min

**Fichiers :** `07-livre-recettes-depenses/ (5 justificatifs)`

1. **Livre recettes-dépenses** : repérez les loyers encaissés, inscrits seuls.
2. « Saisir une écriture » : **Dépense** · **Taxe foncière** · **1124** · date pièce **15/09/2026** · lot **B3** · **Taxe foncière 2026 (dont TEOM 168 €)** → **[Ajouter l'écriture]**.
3. Puis : **Assurance** **118** (**03/01/2026**, **Assurance PNO 2026**) ; **Travaux** **650** (**22/09/2026**, **Peinture de la chambre avant location**) ; **Travaux** **205,59** (date de la facture de l'artisan, **Facture F2026-0143 Haddad — radiateur**).
4. Les intérêts d'emprunt (**2 846,15 €**) : s'il existe une catégorie adaptée, saisissez-les ; sinon, notez où Gerimmo vous propose de les indiquer (voir PRO-21).
5. Plus → **Documents** → **[+ Déposer un document]** : rangez les 5 justificatifs (type **Justificatif** ou **Autre**).

**Résultat attendu :** Chaque écriture s'ajoute au bon lot ; les justificatifs sont rangés. Signalez toute catégorie qui manque pour un propriétaire.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-20 — Charges de copropriété et clôture de septembre

💻 Ordinateur · ⏱ 10 min

**Fichiers :** `07-livre-recettes-depenses/appel-de-fonds-syndic-T4-2026-banc-d-essai.pdf`

1. Fiche du lot B3 → « Charges de copropriété » → « Saisir un appel de charges » : exercice **2026**, reçu le date du jour, total **182,20** (récupérable **109,90**, non récupérable **72,30**), appel `appel-de-fonds-syndic-T4-2026-banc-d-essai.pdf` → **[Créer l'appel]**.
2. **Livre recettes-dépenses** → « Clôturer un mois » : **septembre 2026** → **[Clôturer le mois]** (irréversible).
3. Essayez ensuite une écriture imputée en septembre : refus attendu.

**Résultat attendu :** L'appel est ventilé ; « Mois clôturé. » ; une écriture de septembre est refusée (« Mois clôturé : imputez au mois ouvert ou passez une contre-écriture »).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-21 — Préparer sa déclaration : le récapitulatif fiscal

💻 Ordinateur · ⏱ 10 min

1. Plus → **Fiscalité** → « Récapitulatif fiscal » → *Année du récapitulatif* **2026**.
2. Comparez aux écritures : loyers (lignes 211/212), taxe foncière, assurance, travaux, intérêts d'emprunt « à compléter ».
3. Exportez le livre (« Journal » → **[Exporter 2026]**).

**Résultat attendu :** Les montants correspondent à vos écritures ; les rubriques sont compréhensibles pour un particulier. Signalez un montant faux ou mal rangé (la TEOM, récupérable sur le locataire, en est un bon test).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-22 — Messages, assurance du locataire, alertes

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

> ⏳ Thomas a déposé son assurance (LOP-03) et vous a écrit (LOP-13).

1. Fiche de Thomas → « Pièces justificatives » → attestation « À vérifier » → **[Valider]**.
2. **Messages** → la conversation → fiche de Thomas → **[Répondre]**.
3. **Alertes** et **Agenda** : ouvrez chaque alerte et vérifiez qu'elle mène au bon geste.

**Résultat attendu :** Assurance « Validée » ; Thomas reçoit votre réponse par courriel ; les alertes se referment une fois le geste fait.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-23 — Documents : refuser un doublon

💻 Ordinateur · ⏱ 3 min

1. **Documents** → **[+ Déposer un document]** : redéposez `avis-taxe-fonciere-2026-banc-d-essai.pdf` déjà rangé en PRO-19.

**Résultat attendu :** Refus : « Un fichier au contenu strictement identique existe déjà… ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-24 — Parrainage, aide et règles

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. **Mon profil** → carte « Parrainage » : *Votre code* et *Lien à partager* (copiez le lien).
2. Plus → **Aide** (questions fréquentes) et **Les règles à connaître** : lisez deux ou trois réponses.

**Résultat attendu :** Le lien de parrainage mène à l'inscription avec le code prérempli. La FAQ répond clairement (signalez toute contradiction avec ce que fait l'application).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### Fin de recette

#### PRO-25 — Résilier l'abonnement (sur consigne)

💻 Ordinateur · ⏱ 5 min · 💳 **paiement réel** · facultatif

> ⏳ Uniquement quand le coordinateur le demande.

1. **Abonnement** → **[Gérer mon abonnement]** → résiliez dans le portail Stripe → revenez dans Gerimmo.

**Résultat attendu :** Bandeau « Votre abonnement prend fin le … ». À cette date, le compte repasse en essai ou en lecture seule (vos données restent consultables et exportables).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### PRO-26 — Sécurité du compte et déconnexion

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. Menu du compte → **Sécurité du compte** : changez le mot de passe ; facultatif : activez puis retirez la double authentification.
2. **Aide et retours** → **Proposer une idée** : ce qui vous manquerait pour gérer seule vos biens.
3. **[Se déconnecter]**.

**Résultat attendu :** « Mot de passe modifié… » ; idée enregistrée ; déconnexion effective.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______
