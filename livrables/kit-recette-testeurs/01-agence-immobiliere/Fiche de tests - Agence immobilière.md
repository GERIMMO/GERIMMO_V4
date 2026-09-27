<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# Fiche de tests — Agence immobilière

*Nadia Bensaïd, gérante d'Horizon Gestion — administratrice d'agence* · 50 tests


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
  (ex. `[GÊNANT] AGC-03 — …`), puis notez la **référence** donnée par Gerimmo.
- Un écart entre le résultat attendu et ce que vous voyez est **toujours** bon à signaler, même petit.

## Les tests

### J1 · Arrivée et installation

#### AGC-01 — Recevoir son accès et choisir son mot de passe

💻 Ordinateur · ⏱ 10 min

> ⏳ Le coordinateur ouvre l'organisation « Horizon Gestion (recette) » avec votre adresse e-mail (vous recevez alors le courriel).

1. Ouvrez le courriel **« Votre accès Gerimmo »** (regardez aussi dans les indésirables).
2. Cliquez **[Choisir mon mot de passe]**. Le lien vaut **1 heure** et ne sert qu'une fois.
3. Essayez d'abord le mot de passe **password1234** (12 caractères mais présent dans toutes les fuites de données) : Gerimmo doit le refuser.
4. Saisissez un vrai mot de passe de 12 caractères ou plus dans *Nouveau mot de passe* et *Confirmation*, puis **[Changer le mot de passe]**.
5. Connectez-vous sur **www.gerimmo.app/connexion** avec votre adresse et ce mot de passe.

> [!warning]
> Lien expiré ? Page de connexion → « Mot de passe oublié ? » → un nouveau lien arrive.

**Résultat attendu :** Vous arrivez sur le **Tableau de bord** (« Bonjour … ») avec le bloc « Mettre votre premier lot en location » et ses 6 étapes. Si l'agence est en essai, la barre latérale affiche « Essai gratuit — N jours restants ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-02 — Compléter l'identité de l'agence

💻 Ordinateur · ⏱ 10 min

**Données :** « Mon personnage » § 3 (identité de l'agence).

1. Menu du compte (**[Mon compte]** en haut à droite) → **Profil de l'agence**, ou **[Compléter le profil]** depuis le tableau de bord.
2. Carte « Identité » : *Nom de l'agence* **Horizon Gestion**, *Adresse* **8 place de la Recette**, *Code postal* **91000**, *Ville* **Évry-Courcouronnes**, *Téléphone* **01 99 00 42 10**, *Email de contact* : votre adresse.
3. *SIRET* **000 042 176 00016**, *Carte professionnelle (n° et CCI)* **CPI 9101 2026 000 000 042 — CCI Paris Île-de-France**, *Garantie financière (organisme, montant)* **Caisse de Garantie Fictive — 120 000 €**, *N° de TVA intracommunautaire* **FR52000042176**.
4. *IBAN (modalités de paiement des documents)* **FR76 9999 9000 0100 0042 1700 146** (fictif : c'est ce que vos locataires verront).
5. Videz exprès le champ *Carte professionnelle* et cliquez **[Enregistrer]** : le formulaire doit refuser. Remettez la valeur, puis **[Enregistrer]**.

**Résultat attendu :** Le profil est enregistré ; l'étape « Votre identité » du tableau de bord passe au vert. Un champ obligatoire vide bloque l'enregistrement avec un message clair.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-03 — Habiller l'espace à vos couleurs (logo, couleurs)

💻 Ordinateur · ⏱ 5 min

**Fichiers :** `11-tests-negatifs/logo-trop-lourd.png`, `01-identite-de-l-agence/logo-horizon-gestion-600x150.png`

1. **Profil de l'agence** → sous-section « Votre marque sur Gerimmo ».
2. *Votre logo* : choisissez d'abord `logo-trop-lourd.png` puis **[Enregistrer]** → Gerimmo doit refuser (« Choisissez un logo de moins de 200 Ko. »).
3. Recommencez avec `logo-horizon-gestion-600x150.png` ; *Nom affiché* **Horizon Gestion** ; *Couleur principale* **#1F5FBF** ; *Couleur foncée* **#0F2352** ; laissez vides *Adresse personnalisée* et *Adresse d'envoi des emails* → **[Enregistrer]**.

**Résultat attendu :** L'aperçu « Identité actuellement enregistrée » montre le logo et les couleurs ; l'en-tête de l'espace les reprend. Ils apparaîtront aussi dans l'espace de Camille, sur les documents et dans les courriels aux locataires.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-04 — Activer les envois automatiques (relances au plus court)

💻 Ordinateur · ⏱ 3 min

1. **Profil de l'agence** → cochez « Annoncer chaque échéance au locataire par e-mail », « Envoyer automatiquement les quittances et reçus aux locataires » et « Relancer automatiquement les loyers impayés par e-mail ».
2. *Première relance, jours après l'échéance* **1** ; *Seconde relance…* **2** (au plus court, pour voir les relances pendant la recette) → **[Enregistrer]**.

**Résultat attendu :** Les trois cases restent cochées après rechargement de la page. Les envois partent chaque matin (avis vers 9 h 30, quittances vers 9 h, relances vers 9 h 45, heure de Paris).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-05 — Déposer la signature préenregistrée

💻 Ordinateur · ⏱ 3 min

**Fichiers :** `01-identite-de-l-agence/signature-nadia-bensaid.png`

1. **Profil de l'agence** → carte « Signature préenregistrée » → *Déposer une signature (PNG/JPEG, 1 Mo max)* : `signature-nadia-bensaid.png` → **[Enregistrer]**.
2. Lisez la carte « Parrainage » : notez *Votre code* dans votre suivi (il servira peut-être).

**Résultat attendu :** L'aperçu de la signature s'affiche. Elle sera apposée sur les quittances, reçus et courriers (vérifié en AGC-27), jamais sur un bail ni un état des lieux.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J1 · Le parc

#### AGC-06 — Créer la Résidence Les Essais et ses deux lots

💻 Ordinateur · ⏱ 10 min

1. **Parc de l'agence** → **[Ajouter un bien]**.
2. *Référence interne* **Résidence Les Essais** ; *Type* **Immeuble** ; *Adresse* **14 allée des Essais** (adresse fictive : ignorez les suggestions) ; *Code postal* **91300** ; *Ville* **Massy** ; *Année de construction* **1972**.
3. Cochez *En copropriété* et *En zone tendue*. *Parties communes* **Hall, ascenseur, cave, local vélos, espaces verts** ; *Accès internet, téléphone, TV (TIC)* **Fibre optique et antenne TNT collective**.
4. « Lots de l'immeuble » : *Nom du lot* **A12**, *Surface (m²)* **45.6**, *Pièces* **2** ; **[+ Ajouter un lot]** : **A05**, **24.3**, **1**.
5. **[Créer le bien et ses 2 lots]**.

**Résultat attendu :** Le bien et ses deux lots existent, lots « En préparation ». La fiche du bien signale « Clé de répartition — À valider ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-07 — Valider la clé de répartition

💻 Ordinateur · ⏱ 3 min

1. Fiche du bien → section « Clé de répartition ».
2. Gerimmo propose une répartition à la surface (environ 65 % pour A12, 35 % pour A05). Ouvrez **[Modifier]** pour voir les autres modes, puis revenez à la proposition.
3. **[Valider la clé par surface]**.

**Résultat attendu :** « En vigueur (Surface…, effet au …) », 100 % exactement. Sans clé valide, aucun lot de l'immeuble ne peut passer en disponible.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-08 — Compléter la fiche des deux lots et leurs pièces

💻 Ordinateur · ⏱ 10 min

**Données :** « Mon personnage » § 4 (lots A12 et A05).

1. Fiche du lot A12 → **[Modifier le lot]** : *Étage* **2** ; *Identifiant fiscal du logement* **9999913770012** ; *Surface (m²)* **45.6** ; *Pièces* **2** ; *Chauffage* **Individuel — électricité** ; *Eau chaude* **Individuelle — ballon électrique** ; *Locaux privatifs* **Cave n° 12** ; *Autres parties du logement* **Néant** → **[Enregistrer]**.
2. Section « Pièces (état des lieux) » : **[Proposer les pièces de ce logement]**, puis vérifiez qu'il y a Entrée, Séjour, Cuisine, Chambre, Salle de bain (ajoutez « WC » par **[Autre pièce…]**).
3. Lot A05 → **[Modifier le lot]** : *Étage* **RDC** ; identifiant **9999913770005** ; **24.3** m² ; **1** pièce ; chauffage et eau chaude comme A12 ; *Locaux privatifs* **Néant** ; cochez *Meublé* ; *Autres parties du logement* **Néant** → **[Enregistrer]**.

**Résultat attendu :** Les deux fiches sont complètes. L'encadré « Ce qui empêche la mise en location » ne cite plus que la détention et les diagnostics.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-09 — Créer le mandant Bernard Fontaine et sa détention

💻 Ordinateur · ⏱ 10 min

**Fichiers :** `03-mandant-bernard-fontaine/piece-identite-bernard-fontaine.pdf`, `03-mandant-bernard-fontaine/RIB-bernard-fontaine.pdf`

1. **Personnes** → **[+ Créer une fiche]** → rôle **Propriétaire mandant**.
2. *Nom* **FONTAINE** ; *Prénom* **Bernard** ; *Adresse email* : **votre adresse avec « +mandant »** (ex. **prenom.nom+mandant@gmail.com**) ; *Téléphone* **06 39 98 42 30** ; *Date de naissance* **03/11/1956** ; *Commune de naissance* **Orléans** ; *Adresse* **22 avenue des Maquettes** ; **75012** **Paris** ; *Rattacher à un lot de l'agence* : **A12** → **[Créer la fiche]**.
3. Sur sa fiche, carte « Pièces justificatives » : *Type de pièce* **Pièce d'identité** + `piece-identite-bernard-fontaine.pdf` → **[Déposer]** ; puis **Justificatif** + `RIB-bernard-fontaine.pdf` → **[Déposer]**.
4. Fiche du lot A05 → section « Propriétaires mandants du lot » : *Propriétaire* **Bernard FONTAINE**, *Quote-part (%)* **100**, *Début de détention* **01/09/2026** → **[Enregistrer la détention]**.

**Résultat attendu :** « Détention active : 100 % » sur A12 et A05. Sa fiche n'a pas de carte « Accès locataire » : un mandant n'a jamais de compte, c'est voulu.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-10 — Déposer les diagnostics des lots et de l'immeuble

💻 Ordinateur · ⏱ 15 min

**Données :** Dates de réalisation et d'échéance : « Mon personnage » § 5 (elles sont aussi écrites sur chaque PDF).

**Fichiers :** `02-residence-les-essais-diagnostics/ (DPE, électricité, amiante)`

1. Fiche du lot A12 → « Diagnostics du lot » → ligne DPE → **[Déposer]** : *Diagnostiqueur* **Diag'Essai Expertises**, *Classe énergétique (DPE)* **D**, *Réalisé le* **18/11/2025**, *Expire le* **17/11/2035**, *Rapport du diagnostiqueur* `DPE-lot-A12.pdf` → **[Déposer]**.
2. Même geste pour **Électricité** (**02/09/2026** → **01/09/2032**, `electricite-lot-A12.pdf`) et **Amiante (privatif)** (**12/05/2021**, **Expire le vide** = illimité, `amiante-privatif-lot-A12.pdf`). Pas de gaz dans l'immeuble : laissez la ligne Gaz vide.
3. Lot A05 : DPE classe **E** (mêmes dates que A12, `DPE-lot-A05.pdf`), électricité et amiante (privatif) avec les fichiers « lot-A05 ».
4. Fiche du bien → « Diagnostics de l'immeuble » → **Amiante (parties communes)** : **12/05/2021**, échéance vide, `amiante-parties-communes-immeuble.pdf`. **Ne déposez pas encore l'ERP** (test suivant).

> [!warning]
> Si un dépôt échoue avec un message général, **ne réessayez pas le même fichier** : il est peut-être resté dans les documents et serait refusé comme doublon. Utilisez la copie de secours (dossier `secours/`) et signalez-le.

**Résultat attendu :** Chaque diagnostic apparaît avec sa date et son échéance ; le DPE montre sa classe. Aucun fichier n'est refusé (tous sont différents).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-11 — Un ERP périmé bloque la mise en location, un ERP valide la débloque

💻 Ordinateur · ⏱ 10 min

**Fichiers :** `02-residence-les-essais-diagnostics/test-negatif/ERP-immeuble-PERIME.pdf`, `02-residence-les-essais-diagnostics/ERP-immeuble.pdf`

1. Fiche du bien → « Diagnostics de l'immeuble » → **ERP — état des risques** → **[Déposer]** : *Réalisé le* **03/01/2026**, *Expire le* **03/07/2026** (déjà passé), fichier `ERP-immeuble-PERIME.pdf`.
2. Fiche du lot A12 → **[Mettre en location]**.
3. Constatez le refus, puis revenez à l'ERP → **[Remplacer]** : **15/09/2026** → **15/03/2027**, `ERP-immeuble.pdf`.
4. Fiche du lot A12 → **[Mettre en location]** ; puis faites de même pour A05.

**Résultat attendu :** Avec l'ERP périmé : « Passage en disponible impossible : … » citant l'ERP (ou « Un diagnostic déposé est expiré »). Avec l'ERP valide : « Lot passé en « Disponible ». » pour A12 et A05.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-12 — Créer le mandat de gestion et l'activer

💻 Ordinateur · ⏱ 10 min

1. **Personnes** → fiche de Bernard FONTAINE → carte « Mandats de gestion » → « Nouveau mandat » : *Date de rapport (jour du mois)* **10**, *Seuil de délégation (€)* **500** → **[Créer le mandat]**.
2. Composez-le : *Lot* **A12** + *Taux %* **7** → **[Ajouter]** ; puis **A05** + **7** → **[Ajouter]**.
3. **[Mandat PDF]** : ouvrez le mandat généré et relisez-le (parties, lots, taux).
4. **[Passer à signer]** puis **[Activer]** (il n'y a pas de dépôt de mandat signé : c'est prévu ainsi).
5. Plus → **Mandats & versements** : le mandat y figure. Plus → **Abonnement** : regardez « Lots sous mandat actif ».

**Résultat attendu :** Mandat « Actif » avec 2 lots à 7 %. « Mandats & versements » le liste ; « Abonnement » compte 2 lots sous mandat actif.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-13 — Payer l'abonnement de l'agence

💻 Ordinateur · ⏱ 10 min · 💳 **paiement réel** · facultatif

> ⏳ Uniquement si le coordinateur vous le demande (agence ouverte en essai).

1. Plus → **Abonnement** : le tarif affiché doit correspondre à 2 lots sous mandat actif (39 € par mois jusqu'à 10 lots).
2. **[S'abonner — … par mois]** → page de paiement Stripe : cliquez d'abord la flèche de retour sans payer → Gerimmo doit afficher « Paiement interrompu : rien n'a été prélevé… ».
3. Recommencez et payez avec votre carte (adresse de facturation demandée).
4. **[Gérer mon abonnement]** : vérifiez la carte et les factures dans le portail Stripe, sans résilier.

> [!warning]
> Paiement réel : ne le faites qu'après accord du coordinateur sur la prise en charge.

**Résultat attendu :** Retour « Merci, votre paiement est enregistré… », statut « Abonnement actif ». Pendant l'essai, la page dit que la carte ne sera débitée qu'à la fin de l'essai (date affichée).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J2 · Mise en location

#### AGC-14 — Créer la fiche de Camille et déposer son dossier

💻 Ordinateur · ⏱ 15 min

**Fichiers :** `04-dossier-camille-roussel/ (6 fichiers)`

1. **Personnes** → **[+ Créer une fiche]** → rôle **Locataire**.
2. *Nom* **ROUSSEL** ; *Prénom* **Camille** ; *Adresse email* : **l'adresse réelle du testeur « Locataire de l'agence »** (demandez-la au coordinateur) ; *Téléphone* **06 39 98 51 20** ; *Date de naissance* **12/03/1994** ; *Commune de naissance* **Nantes** ; *Adresse* **5 rue des Brouillons**, **44000** **Nantes** → **[Créer la fiche]**.
3. Carte « Pièces justificatives » : **Pièce d'identité** → `piece-identite-camille-roussel.pdf` ; **Justificatif (revenus, domicile…)** → les 3 bulletins de salaire, `attestation-employeur-camille-roussel.pdf` et `justificatif-domicile-camille-roussel.pdf` (un dépôt par fichier, avec un titre parlant).
4. Créez une seconde fiche avec la **même adresse e-mail** : Gerimmo doit refuser (« Cette adresse email est déjà portée par une autre fiche de l'agence… »). Abandonnez-la.

**Résultat attendu :** La fiche de Camille porte 6 pièces. Le doublon d'adresse est refusé. **Ne déposez pas** son avis d'impôt ni son RIB : Camille les déposera elle-même (AGC-17).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-15 — Créer la fiche du garant Philippe Roussel

💻 Ordinateur · ⏱ 8 min

**Fichiers :** `05-garant-philippe-roussel/ (3 fichiers)`

1. **[+ Créer une fiche]** → rôle **Garant** : **ROUSSEL** **Philippe** ; *Adresse email* : **votre adresse avec « +garant »** ; **06 39 98 51 21** ; né le **30/09/1961** à **Rennes** ; **9 rue des Épreuves**, **35000** **Rennes** → **[Créer la fiche]**.
2. Pièces : **Pièce d'identité** `piece-identite-philippe-roussel.pdf` ; **Justificatif** `avis-impot-2026-philippe-roussel.pdf` et `attestation-pension-philippe-roussel.pdf`.

**Résultat attendu :** Fiche du garant avec 3 pièces. N'utilisez pas « Inviter comme locataire » sur cette fiche.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-16 — Inviter Camille dans son espace

💻 Ordinateur · ⏱ 3 min

1. Prévenez d'abord la testeuse : son lien d'accès ne vaudra qu'une heure.
2. Fiche de Camille → carte « Accès locataire » → **[Inviter comme locataire]**.
3. Après son premier accès (LOA-01), rouvrez la fiche.

**Résultat attendu :** « Invitation envoyée à … » ; puis « Compte locataire actif — la personne accède à son espace ». L'étape « Un locataire » du tableau de bord passe au vert.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-17 — Réclamer à Camille son avis d'imposition et son RIB

💻 Ordinateur · ⏱ 3 min

> ⏳ Camille a activé son compte (LOA-01) : la carte « Pièces réclamées » n'apparaît qu'ensuite.

1. Fiche de Camille → carte « Pièces réclamées » → raccourci **[Avis d'imposition]** (ou tapez-le dans *Pièce à demander*, puis **[Demander]**) ; même geste pour **RIB**.
2. Après son dépôt (LOA-04), rouvrez la fiche.

**Résultat attendu :** Camille reçoit « Pièce demandée : … ». Après son dépôt, les deux pièces rejoignent son dossier et une alerte vous prévient.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-18 — Créer le bail de Camille et le compléter

💻 Ordinateur · ⏱ 20 min

**Données :** « Mon personnage » § 6 (bail et compléments).

1. Fiche du lot A12 → section « Baux & état des lieux » : *Type de bail* **Nu** ; *Locataire principal* **Camille ROUSSEL** ; *Date d'entrée* **01/10/2026** ; *Jour d'échéance* **1** ; *Loyer hors charges (€)* **890** ; *Charges (€)* **90** ; *Mode de charges* **Provision** ; *Dépôt de garantie (€)* **1800** (exprès) ; *Trimestre IRL* **T2** ; *Révision annuelle du loyer (IRL)* cochée → **[Créer le bail]**.
2. Constatez le refus du dépôt (plafond d'un mois de loyer hors charges pour un bail nu), corrigez à **890** → **[Créer le bail]**.
3. Fiche du bail → « Compléments du contrat » : *Fixation initiale du loyer* **Librement fixé** ; *Paiement du loyer* **À échoir (d'avance)** ; *Lieu de paiement* **Virement sur le compte de l'agence Horizon Gestion** ; *Valeur de l'IRL de référence* **146,00** (valeur de test) ; honoraires *part du bailleur* **400** et *part du locataire* **400** ; *Clauses particulières* vide ; *Dernier loyer du précédent locataire* **870**, *Date du dernier versement* **31/07/2026**, *Date de la dernière révision* **01/01/2026** (si ces champs sont proposés) → **[Enregistrer les compléments]**.
4. « Garants » → **[Ajouter le garant]** Philippe ROUSSEL ; « Cautionnement » → **Caution solidaire** → **[Générer l'acte]**.
5. **[Générer le bail (PDF)]**, puis « Notice d'information » → **[Générer la notice (PDF)]**. Ouvrez les deux PDF et relisez-les.

**Résultat attendu :** Bail en brouillon. Le PDF du bail reprend parties, lot, loyer, charges, dépôt, IRL et compléments ; il est rangé dans **Documents**. Si Gerimmo refuse de générer (« PDF non généré : N informations sont encore obligatoires »), la liste dit quoi compléter : notez-le.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-19 — Envoyer le bail à signer à Camille (circuit manuel)

💻 Ordinateur · ⏱ 5 min

> ⏳ Camille a un compte actif (LOA-01).

1. Plus → **Documents** → sélectionnez le PDF du bail → **[Envoyer pour signature]** (*Signataire* : Camille).
2. Après le retour de Camille (LOA-05), rouvrez le document.

**Résultat attendu :** « Envoyé pour signature — le signataire est prévenu par e-mail… ». Après son retour : « ✓ Signé par Camille ROUSSEL le … » et **[Ouvrir le signé]**. Ce retour **n'active pas** le bail : c'est le test suivant.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-20 — Déposer le bail signé : le bail devient actif

💻 Ordinateur · ⏱ 8 min

**Fichiers :** `06-bail-signe/bail-signe-lot-A12-camille-roussel.pdf`

1. Téléchargez depuis **Documents** le PDF du bail généré par Gerimmo (AGC-18).
2. Fiche du bail → carte « Bail signé » → *Bail signé (PDF uniquement)…* : déposez **ce PDF téléchargé** → **[Déposer le bail signé]** → Gerimmo doit le refuser (fichier déjà présent dans les documents).
3. Recommencez avec `bail-signe-lot-A12-camille-roussel.pdf` → **[Déposer le bail signé]**.
4. Dans la fenêtre du bail signé : **[Envoyer au locataire]**.

**Résultat attendu :** Le fichier déjà connu est refusé. Avec l'exemplaire signé : « Bail signé déposé — le contrat est actif… L'état des lieux d'entrée reste à signer : une alerte le rappelle. » Le lot A12 passe « Loué » ; Camille reçoit « Votre bail signé est disponible ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-21 — Faire l'état des lieux d'entrée (tablette ou téléphone si possible)

💻 📱 Ordinateur ou téléphone · ⏱ 25 min

**Données :** « Mon personnage » § 7 : état de chaque pièce, relevés des compteurs, clés. Gerimmo ne prend pas de photo à l'état des lieux : tout se saisit dans la grille.

1. Fiche du bail → carte « États des lieux » → « Nouvel état des lieux » **Entrée** → **[Préparer cet état des lieux]** → **[Ouvrir la grille]**.
2. « Mentions du document » : *Personnes présentes* **Nadia Bensaïd (Horizon Gestion, pour le bailleur) ; Camille Roussel (locataire)** ; *Détecteur de fumée* **Présent** ; *État du détecteur* **Fonctionne (testé)** ; *Attestation d'assurance fournie* **Oui** ; *Observations des parties* **Néant** → **[Enregistrer les mentions]**.
3. « Pièce par pièce » : pour chaque pièce, « Toute la section : » **Bon**, puis ajustez les éléments cités dans « Mon personnage » (ex. salle de bain : joints **Usagé** avec le commentaire). **[Enregistrer la grille]**.
4. Au téléphone, facultatif : passez en mode avion pendant la saisie (« Hors ligne — saisie gardée sur l'appareil »), puis revenez en réseau (« Synchronisé »).
5. « Compteurs & clés » : eau froide **RCT-0482** relevé **482,315** ; électricité **0999 1234 5678** relevé **12587** ; clés : porte palière **3**, badge **1**, boîte aux lettres **1**, cave **1** → **[Enregistrer les relevés]**.
6. **[Enregistrer et signer]**, puis **[Générer le PDF]**.

**Résultat attendu :** « État des lieux signé — il est figé. » (puce « Signé — figé »). Le PDF reprend mentions, grille, compteurs et clés ; Camille le retrouve dans son espace. Signer sans mentions enregistrées est refusé avec un message clair.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-22 — Encaisser le dépôt de garantie

💻 Ordinateur · ⏱ 5 min

1. Fiche du bail → carte « Dépôt de garantie » → **[Enregistrer un encaissement]** : *Montant (€)* **900** (exprès), *Date* du jour, *Payé par* **Virement**, *Versé par* **Le locataire** → **[Encaisser]**.
2. Constatez le refus, puis recommencez avec **890**. Ouvrez le reçu PDF du dépôt.

**Résultat attendu :** 900 € est refusé (plafonné au dépôt du bail) ; 890 € est enregistré avec son reçu. Camille voit son dépôt dans « Mes paiements ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-23 — Enregistrer l'artisan dans votre carnet

💻 Ordinateur · ⏱ 5 min

> ⏳ L'artisan s'est inscrit et le coordinateur l'a validé (ART-01 à ART-04).

1. Plus → **Carnet d'artisans** → « Enregistrer un artisan » : *Raison sociale* **Haddad Plomberie Chauffage** ; *SIRET* **00007314800017** ; *Téléphone mobile* **06 39 98 73 14** ; *Courriel* vide ; *Métiers* **Plomberie** et **Chauffage** ; *Zone d'intervention — codes postaux* **91300, 91000** → **[Enregistrer l'artisan]**.
2. Ouvrez sa fiche dans le carnet.

**Résultat attendu :** « Artisan enregistré. Si ce SIRET existait déjà chez Gerimmo, sa fiche vous a été rattachée plutôt que dupliquée. » La fiche montre un artisan validé par Gerimmo (pas de mention « Gerimmo n'a pas encore validé ce profil »).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3 · Loyers

#### AGC-24 — Appeler le terme d'octobre (avis d'échéance)

💻 Ordinateur · ⏱ 5 min

1. Fiche du bail → « Loyers & paiements ». Si l'échéancier est vide (le bail est devenu actif après le 1ᵉʳ du mois), cliquez **[Générer l'échéancier]**.
2. Ouvrez **[Avis d'échéance (PDF)]** du mois d'octobre.
3. **Loyers & charges** : regardez les tuiles « Appelé ce mois », « Encaissé », « Reste dû » et la carte « Quittancement d'octobre ». **N'encaissez pas encore.**

**Résultat attendu :** Octobre est appelé pour 980 € (890 + 90), puce « Impayé » ou « À échoir ». L'avis PDF porte votre logo et l'IBAN de l'agence. Si l'annonce automatique est cochée, Camille reçoit « Avis d'échéance — octobre 2026 » le lendemain matin.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-25 — Constater la relance automatique d'un loyer impayé

💻 Ordinateur · ⏱ 5 min

> ⏳ Le lendemain matin d'AGC-24 (relance réglée à 1 jour en AGC-04).

1. **Loyers & charges** → carte « Impayés à relancer » ; fiche du bail → rubrique « Relances ».
2. Demandez à Camille si elle a reçu « Loyer d'octobre — un règlement semble en attente » (vers 9 h 45).
3. Facultatif : enregistrez une relance à la main (*Relance 1*, *Envoyée le*) → **[Enregistrer la relance]**.

**Résultat attendu :** La relance automatique est tracée sur le bail et Camille l'a reçue. Une mise en demeure n'est jamais envoyée automatiquement.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-26 — Encaisser le loyer d'octobre : la quittance naît

💻 Ordinateur · ⏱ 5 min

1. **Loyers & charges** → ligne de Camille → **[Encaisser 980,00 €]** (vaut un virement reçu ce jour).
2. Regardez la ligne : lien « quittance », puis **[Envoyer N quittances et M reçus]** si la quittance n'est pas encore partie (sinon elle part seule le lendemain matin).

**Résultat attendu :** Paiement complet → quittance d'octobre émise d'office ; tuiles à jour (Reste dû 0). Camille reçoit « Quittance de loyer — octobre 2026 ». Une ligne « ✉ envoyée » s'affiche après l'envoi.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-27 — Relire la quittance, puis corriger un encaissement

💻 Ordinateur · ⏱ 10 min

1. Fiche du bail → « Loyers & paiements » → **[Quittance (PDF)]** d'octobre : vérifiez loyer (890) et charges (90) séparés, période, identité du bailleur et du mandataire, votre signature et votre logo.
2. Facultatif, **avant** que Camille ne consulte sa quittance : **[Retirer l'encaissement]** (motif **Test de correction**) → **[Confirmer]** ; puis **[Saisir un encaissement]** **980**, date du jour, **Virement** → **[Encaisser]**.

**Résultat attendu :** La quittance est conforme (loyer et charges distincts, signature apposée). Après correction, le mois redevient « Payé » avec une quittance réémise ; le retrait reste tracé.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3–J5 · Incidents

#### AGC-28 — Recevoir et qualifier la fuite signalée par Camille

💻 📱 Ordinateur ou téléphone · ⏱ 10 min

> ⏳ Camille a signalé la fuite, en urgence (LOA-10).

**Fichiers :** `07-incidents/incident-fuite-evier-detail.jpg`

1. Vérifiez le courriel **« URGENT — … »** reçu à la déclaration.
2. **Incidents** → filtre « À traiter » → l'incident → **[Me l'attribuer]**.
3. Carte « Ajouter une photo » → `incident-fuite-evier-detail.jpg` → **[Joindre]**.
4. « Qualification — qui paie » : *Qui prend en charge* **Charge propriétaire** ; *Justification* **Siphon d'origine fissuré par vétusté (pièce de 1998) : réparation à la charge du bailleur** → **[Qualifier l'incident]**.

**Résultat attendu :** L'incident montre la photo de Camille et la vôtre ; il passe « qualifié ». Camille voit la qualification dans « Mes demandes » (sans courriel).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-29 — Consulter l'artisan et retenir son devis

💻 Ordinateur · ⏱ 10 min

1. Carte « Confier à un artisan » : *Métier recherché* **Plomberie** ; *Nature des travaux* **Entretien courant ou réparation simple — sans décennale** ; *Validité demandée aux devis (jours)* **30** ; cochez « J'assume un devis unique » → **[Ouvrir la mise en concurrence]**.
2. « Artisans proposables sur le 91300 » : Haddad Plomberie Chauffage → **[Demander un devis]**.
3. Attendez son devis (ART-06) : courriel « Devis reçu — Haddad Plomberie Chauffage — 177,65 € — … ».
4. **[Voir les quantités, les prix et la TVA]**, puis **[Retenir ce devis]**.

**Résultat attendu :** L'artisan apparaît dans la liste (validé, bon métier, bonne zone, dans votre carnet). Le devis de 177,65 € TTC est lisible ligne par ligne. Après « Retenir », la mission est confiée : « Confiée — l'artisan n'a pas encore répondu ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-30 — Suivre le rendez-vous et l'intervention

💻 📱 Ordinateur ou téléphone · ⏱ 5 min (sur 2 à 3 jours)

> ⏳ L'artisan accepte et propose des créneaux (ART-07), Camille en choisit un (LOA-12), l'artisan intervient (ART-09).

1. Suivez la carte « Intervention — Haddad Plomberie Chauffage » : Acceptée → Planifiée (date du rendez-vous) → En cours → Terminée.
2. **Agenda** : le rendez-vous y figure.
3. Après l'intervention : lisez le compte rendu et la photo « après » ; plus tard, la facture déposée (**Documents**, type « Facture d'artisan »).

**Résultat attendu :** Chaque étape s'inscrit dans le fil de l'incident (« Compte rendu de l'artisan », « Facture de l'artisan déposée »). Vous n'avez rien eu à ressaisir.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-31 — Noter l'artisan et clôturer l'incident

💻 Ordinateur · ⏱ 5 min

1. « Noter Haddad Plomberie Chauffage » : *Qualité du travail* **5**, *Respect du délai* **4**, *Rapport qualité-prix* **4**, *Commentaire — privé à votre agence* **Intervention rapide et propre** → **[Noter l'artisan]**.
2. Carte « Clôture » : *Motif* **Résolu** ; *Ce qui a été fait* **Siphon et joints remplacés, fuite stoppée** → **[Clôturer l'incident]**.

**Résultat attendu :** Incident « Clos ». Camille peut donner son avis (LOA-13). Votre commentaire reste privé à l'agence.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-32 — Déclarer vous-même un incident (humidité) et le transmettre au syndic

💻 Ordinateur · ⏱ 8 min

**Fichiers :** `07-incidents/incident-moisissure-plafond.jpg`

1. **Incidents** → **[Ouvrir un incident]** : *Lot concerné* **A12** ; *Catégorie* **Humidité — infiltration, tache au plafond** ; *Pièce concernée* **Salle d'eau** ; *Urgence* **Normal** ; *Description* **Tache d'humidité au plafond de la salle d'eau, signalée par la voisine du dessus** ; *Depuis quand ?* **Une semaine** ; *Photos* `incident-moisissure-plafond.jpg` → **[Déclarer l'incident]**.
2. Qualifiez : **Charge propriétaire**, justification **Infiltration venant de l'étage supérieur (parties communes)**.
3. Clôturez : *Motif* **Transmis au syndic (parties communes)**, *Ce qui a été fait* **Signalement transmis au syndic le jour même**.

**Résultat attendu :** L'incident est créé « À qualifier », puis clos avec le motif « Transmis au syndic ». Les listes et filtres (En cours, Clos, Tous) le rangent correctement.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-33 — Imputer un incident au locataire, et recevoir sa contestation

💻 Ordinateur · ⏱ 8 min · facultatif

> ⏳ Camille a signalé le volet roulant bloqué (LOA-14).

1. Qualifiez l'incident « volet » : **Charge locataire**, justification **Manœuvre forcée : réparation locative**.
2. Attendez la contestation de Camille (« Contester qui paie »), lisez son motif.
3. Répondez-lui (**Messages** ou fiche) puis décidez : maintenir, ou requalifier en **Charge propriétaire** si le motif vous convainc. Clôturez.

**Résultat attendu :** La contestation est visible sur l'incident ; la requalification (si vous la faites) est tracée et visible par Camille.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J5–J7 · Gestion courante

#### AGC-34 — Valider l'assurance de Camille

💻 Ordinateur · ⏱ 3 min

> ⏳ Camille a déposé son attestation (LOA-03).

1. **Alertes** : repérez l'alerte liée à l'assurance.
2. Fiche de Camille → « Pièces justificatives » → l'attestation « À vérifier » → ouvrez-la → **[Valider]**.

**Résultat attendu :** L'attestation passe « Validée » (Camille voit « Validée »), l'alerte se referme d'elle-même.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-35 — Répondre au message de Camille

💻 📱 Ordinateur ou téléphone · ⏱ 3 min

> ⏳ Camille vous écrit (LOA-15).

1. **Messages** : repérez la conversation (badge). Ouvrez la fiche de Camille → carte « Messages » → **[Répondre]** **Bonjour Camille, la régularisation des charges se fait une fois par an, sur justificatifs.**

**Résultat attendu :** Le badge disparaît ; Camille reçoit « Horizon Gestion vous a répondu ». Note : vous n'êtes pas prévenu par courriel quand un locataire écrit, seulement par le badge.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-36 — Documents : retrouver, déposer, refuser un doublon et un faux fichier

💻 Ordinateur · ⏱ 10 min

**Fichiers :** `09-fin-de-bail/lettre-conge-camille-roussel.pdf`, `02-residence-les-essais-diagnostics/DPE-lot-A12.pdf`, `11-tests-negatifs/faux-document.pdf`

1. Plus → **Documents** : retrouvez le bail signé, l'état des lieux, la quittance, le mandat, les diagnostics.
2. **[+ Déposer un document]** : `DPE-lot-A12.pdf`, type **Autre** → **[Déposer]** → refus attendu (doublon).
3. Même geste avec `faux-document.pdf` (un texte renommé en .pdf) → refus attendu.

**Résultat attendu :** Le doublon est refusé avec « Un fichier au contenu strictement identique existe déjà… sous le nom « … » ». Le faux PDF est refusé (contenu vérifié). Rien n'est rangé en double.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-37 — Saisir l'appel de charges du syndic

💻 Ordinateur · ⏱ 8 min

**Fichiers :** `08-copropriete-et-charges/appel-de-fonds-syndic-T4-2026-lot-A12.pdf`

1. Fiche du lot A12 → « Charges de copropriété » → « Saisir un appel de charges » : *Exercice* **2026** ; *Reçu le* date du jour ; *Total de l'appel (€)* **290,25** ; postes : **Récupérable 186,70** et **Non récupérable 103,55** (ou poste par poste, d'après le PDF) ; *Appel du syndic à joindre* `appel-de-fonds-syndic-T4-2026-lot-A12.pdf` → **[Créer l'appel]**.

**Résultat attendu :** L'appel est enregistré, ventilé récupérable / non récupérable, avec le justificatif joint.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-38 — Régulariser les charges de l'année (exploratoire)

💻 Ordinateur · ⏱ 8 min · facultatif

**Fichiers :** `08-copropriete-et-charges/decompte-charges-2026-lot-A12.pdf`

1. Fiche du bail → « Loyers & paiements » → « Régularisation annuelle des charges » : *Année* **2026** ; *Charges réelles de l'exercice, logement entier (€)* **1000** ; *Justificatif* `decompte-charges-2026-lot-A12.pdf` → **[Régulariser]**.

**Résultat attendu :** Gerimmo calcule la part de Camille sur sa seule période d'occupation et la compare aux provisions déjà appelées ; le solde (à payer ou à rendre) doit être compréhensible. Signalez tout calcul qui vous paraît faux, en donnant les chiffres affichés.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-39 — Écritures : saisir la facture de l'artisan, exporter

💻 Ordinateur · ⏱ 8 min

1. **Écritures & rapports** : repérez les écritures inscrites seules à l'encaissement (loyer d'octobre et honoraires au taux du mandat, 7 %).
2. « Saisir une écriture » : *Recette ou dépense* **Dépense** ; *Catégorie* **Travaux** ; *Montant (€)* **177,65** ; *Date pièce* date de la facture ; *Date d'imputation* date du jour ; *Lot* **A12** ; *Libellé* **Facture F2026-0142 Haddad — remplacement du siphon** → **[Ajouter l'écriture]**.
3. « Journal » → **[Exporter 2026]** : ouvrez le CSV.

**Résultat attendu :** Loyer et honoraires sont déjà là sans saisie ; la dépense s'ajoute au lot A12 ; l'export CSV contient toutes les lignes.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-40 — Clôturer septembre et envoyer le compte rendu au mandant

💻 Ordinateur · ⏱ 10 min

1. **Écritures & rapports** → « Clôturer un mois » : *Mois* **septembre 2026** → **[Clôturer le mois]** (irréversible).
2. Essayez de saisir une écriture datée (imputation) de septembre : elle doit être refusée.
3. « Rapports de gestion » → Bernard FONTAINE → *Mois du rapport de gestion* **septembre 2026** → **[Générer le rapport]** → **[Préparer le PDF pour relecture]** → commentaire **Premier compte rendu (recette)** → **[Valider & envoyer le PDF]**.
4. Ouvrez votre boîte : l'adresse « +mandant » a reçu le compte rendu.
5. Renseignez le versement au mandant (montant **0**, date du jour) → **[Versement]** ; si Gerimmo exige un montant positif, notez le message et passez.

**Résultat attendu :** « Mois clôturé. » ; une écriture de septembre est refusée (« Mois clôturé : imputez au mois ouvert ou passez une contre-écriture »). Le rapport de septembre est à 0 € (le mandat ne court que depuis octobre : c'est normal, on teste le circuit). Courriel « Votre compte rendu de gestion — 2026-09 », expéditeur Horizon Gestion, PDF joint. Statut final « Versé ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-41 — Tour des alertes, de l'agenda et des statistiques

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

1. **Alertes** : ouvrez chaque alerte, suivez son lien, vérifiez qu'elle mène au bon écran.
2. **Agenda** : rendez-vous d'intervention, échéances (diagnostics, assurance, fin d'essai…).
3. **Statistiques** et **Tableau de bord** : les chiffres collent-ils à ce que vous avez saisi ?
4. Plus → **Les règles à connaître** : lisez une fiche. Refaites le tour au téléphone (barre du bas : Accueil, Parc, Loyers, Alertes, Menu).

**Résultat attendu :** Chaque alerte mène à son geste ; les chiffres sont cohérents ; tout reste lisible au téléphone, sans défilement horizontal.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### Facultatif · L'agent et son portefeuille

#### AGC-42 — Inviter un agent et lui confier le mandat

💻 Ordinateur · ⏱ 15 min · facultatif

1. Plus → **Administration** → carte « Équipe & portefeuilles » → *Ajouter un agent* : **votre adresse avec « +agent »** → **[Inviter]**.
2. Dans une **fenêtre de navigation privée**, ouvrez le courriel « Votre accès Gerimmo » de l'agent, choisissez son mot de passe, connectez-vous : vous êtes Julien Marchetti.
3. En agent : le menu montre « Mon portefeuille » ; « Aucun lot ne vous est confié ». L'adresse …/administration doit donner une page introuvable ; « Clôturer un mois » n'est pas proposé.
4. Revenez en administratrice : fiche de Bernard FONTAINE → mandat → *Confié à* : l'agent.
5. En agent : « Mon portefeuille » montre maintenant A12 et A05, et leurs personnes.

**Résultat attendu :** L'agent ne voit que les lots des mandats qui lui sont confiés ; les écrans réservés au responsable lui sont fermés.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-43 — Préparer un bail meublé sur le studio A05 (sans l'activer)

💻 Ordinateur · ⏱ 15 min · facultatif

1. **Personnes** → fiche locataire **PILOTE** **Léo**, adresse **votre adresse avec « +locataire2 »**, né le **05/05/2001** à **Amiens**, **3 rue des Essais** **80000** **Amiens**.
2. Lot A05 → bail **Meublé**, entrée le 1ᵉʳ du mois prochain, loyer **640**, charges **55** en **Forfait**, dépôt **1280** (2 mois : accepté en meublé) → **[Créer le bail]**.
3. « Inventaire du mobilier » : ajoutez le lit, les plaques, le réfrigérateur, la table et 2 chaises → **[Ajouter au mobilier]** ; générez le bail meublé (PDF).
4. Ne déposez aucun bail signé : laissez-le en brouillon.

**Résultat attendu :** Le forfait de charges et le dépôt de 2 mois sont acceptés en meublé ; l'inventaire figure dans le PDF du bail meublé.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### Facultatif · Imports

#### AGC-44 — Contrôler un fichier de parc plein d'erreurs

💻 Ordinateur · ⏱ 5 min · facultatif

**Fichiers :** `10-imports/import-parc-avec-erreurs.csv`

1. **Parc de l'agence** → « Reprendre le parc » (…/parc/import) → **[Télécharger le gabarit]** (pour voir), puis *Votre fichier (CSV)* : `import-parc-avec-erreurs.csv` **sans l'ouvrir dans Excel** → **[Contrôler le fichier]**.
2. Lisez le rapport ligne par ligne. **N'importez pas.**

**Résultat attendu :** 1 ligne « prête » et 4 « à corriger » : « Type de bien inconnu : « studio » … », « Code postal attendu sur cinq chiffres », « Le nom du propriétaire est obligatoire… », « Date d'entrée illisible … (attendu AAAA-MM-JJ) ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-45 — Importer un petit parc depuis un tableur

💻 Ordinateur · ⏱ 10 min · facultatif

**Fichiers :** `10-imports/import-parc-ateliers-du-prototype.csv`

1. « Reprendre le parc » → `import-parc-ateliers-du-prototype.csv` → **[Contrôler le fichier]** → 5 lignes « prêtes ».
2. **[Importer 5 lignes]**.
3. Rejouez le même fichier (contrôle puis import) : rien ne doit être dupliqué.
4. **Parc de l'agence** : ouvrez « Les Ateliers du Prototype » et « Maison Brouillon ».

**Résultat attendu :** 2 biens et 4 lots créés « En préparation » ; le lot P03 est détenu à 50/50 par Roger MAQUETTE et Line BRISSAC ; 2 baux en brouillon (P01 et P03). Le second import ne crée aucun doublon.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-46 — Reprendre une balance comptable d'ouverture (en dernier)

💻 Ordinateur · ⏱ 10 min · facultatif

**Fichiers :** `10-imports/reprise-comptable-horizon.csv`

1. Prérequis : le bail de Camille est actif. **Écritures & rapports** → « Reprendre mes comptes — balance d'ouverture → ».
2. **Avant tout clic**, saisissez : *Date de bascule* date du jour ; *Trésorerie reprise (€)* **230,00** ; *Votre balance (CSV)* `reprise-comptable-horizon.csv`.
3. **[Contrôler la balance]** : l'écart doit être nul. Puis **[Basculer 2 lignes]** (définitif).

> [!warning]
> Les valeurs saisies sont figées au premier contrôle, il n'y a pas de bouton d'abandon et une seule reprise par agence : ne rechargez pas la page entre les deux clics. Si vous êtes bloqué, c'est une trouvaille : signalez-la.

**Résultat attendu :** 2 lignes rattachées au bail du lot A12 (provisions 180 € et avance de 50 €), écart 0, bascule faite. L'avance apparaît au compte de Camille.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### Dernier jour · Départ de Camille

#### AGC-47 — Enregistrer le congé de Camille

💻 Ordinateur · ⏱ 8 min

> ⏳ Le coordinateur donne le top de fin ; Camille a « annoncé son départ » (LOA-18).

**Fichiers :** `09-fin-de-bail/lettre-conge-camille-roussel.pdf`

1. Fiche du bail : repérez l'encadré signalant que la locataire a annoncé son départ.
2. **Documents** → **[+ Déposer un document]** : `lettre-conge-camille-roussel.pdf`, type **Courrier**, rattaché à Camille.
3. Fiche du bail → carte « Congé » : *Donné par* **Locataire** ; *Date de réception du congé* date du jour ; lisez « Préavis appliqué : N mois » → **[Enregistrer le congé]**.

**Résultat attendu :** Préavis d'un mois (zone tendue), bail « Préavis ». Le courrier est rangé et visible par Camille une fois mis à disposition.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-48 — Faire l'état des lieux de sortie

💻 📱 Ordinateur ou téléphone · ⏱ 15 min

1. Carte « États des lieux » → « Nouvel état des lieux » **Sortie** → **[Préparer cet état des lieux]** → **[Ouvrir la grille]** (reprise de l'entrée).
2. Mentions : *Adresse de restitution du dépôt* **12 rue des Nouveaux Départs, 44000 Nantes** ; personnes présentes, détecteur, observations comme à l'entrée.
3. Séjour → murs : **Mauvais** avec **3 trous de cheville, rayures, trace au mur** ; le reste **Bon**. Clés rendues : 3 + 1 + 1 + 1 → **[Enregistrer les relevés et les clés rendues]**.
4. **[Enregistrer et signer]** → fenêtre « Signer l'état des lieux de sortie » → **[Signer]** ; ouvrez le « Comparatif entrée / sortie ».

**Résultat attendu :** Le comparatif fait ressortir le séjour « Dégradé depuis l'entrée ». L'état des lieux de sortie est signé et figé.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-49 — Restituer le dépôt avec une retenue décotée, puis clôturer le bail

💻 Ordinateur · ⏱ 15 min

**Fichiers :** `09-fin-de-bail/devis-remise-en-peinture-lot-A12.pdf`

1. Carte « Restitution du dépôt de garantie » : *Remise des clés* date du jour ; ne cochez pas « Sortie conforme à l'entrée » → **[Démarrer la restitution]**.
2. « Ajouter une retenue (décote de vétusté) » : *Objet de la retenue* **Remise en peinture du séjour (trous et rayures)** ; *Coût (€)* **420** ; *Durée de vie (ans)* **10** ; *Âge (ans)* **3** ; justificatif `devis-remise-en-peinture-lot-A12.pdf` → **[Ajouter la retenue]**.
3. Relisez le décompte → **[Finaliser le décompte]** → **[Finaliser]** ; *Envoyé au locataire le* date du jour → **[Décompte envoyé]**.
4. Carte « Congé en cours » → **[Clôturer le bail]**.

**Résultat attendu :** La retenue est décotée selon l'âge (bien moins que 420 €) et le montant rendu = 890 € − retenue. Le bail passe « terminé », le lot A12 redevient disponible ; l'espace de Camille reste consultable.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### AGC-50 — Sécurité du compte et déconnexion

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. Menu du compte → **Sécurité du compte** : changez votre mot de passe (actuel, nouveau, confirmation) → **[Changer le mot de passe]**.
2. Constatez que l'adresse de connexion ne se change pas depuis cet écran (message explicatif).
3. Facultatif : **[Activer la double authentification]** avec une application d'authentification (Google Authenticator, 1Password…), puis retirez-la.
4. Menu du compte → **[Se déconnecter]** ; essayez d'ouvrir …/espaces : retour à la connexion.

**Résultat attendu :** « Mot de passe modifié. Vos autres appareils connectés ont été déconnectés ; celui-ci reste ouvert. » La déconnexion ferme bien l'accès.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______
