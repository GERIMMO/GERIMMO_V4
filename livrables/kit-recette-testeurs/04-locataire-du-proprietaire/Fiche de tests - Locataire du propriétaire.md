<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# Fiche de tests — Locataire du propriétaire

*Thomas Girard, locataire du T2 de Sophie Lemaire (sans agence)* · 15 tests


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
  (ex. `[GÊNANT] LOP-03 — …`), puis notez la **référence** donnée par Gerimmo.
- Un écart entre le résultat attendu et ce que vous voyez est **toujours** bon à signaler, même petit.

## Les tests

### J2 · Arrivée

#### LOP-01 — Recevoir l'invitation et créer son mot de passe

📱 Téléphone · ⏱ 5 min

> ⏳ La propriétaire vous invite (PRO-10) ; elle vous prévient juste avant.

1. Courriel **« Votre accès Gerimmo »** → **[Choisir mon mot de passe]** **dans l'heure** → mot de passe de 12 caractères ou plus → **[Changer le mot de passe]**.
2. Connectez-vous sur www.gerimmo.app/connexion.

> [!warning]
> Plus d'une heure ? « Mot de passe oublié ? » sur la page de connexion.

**Résultat attendu :** « Bonjour Thomas » ; barre du bas Accueil, Documents, Paiements, Demandes, Menu.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-02 — Découvrir son espace

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. **Accueil** (« Ce qui vous attend »), **Mon logement**, **Mes documents**, **Mes paiements**, **Mes demandes**, **Mon gestionnaire**, **Les règles à connaître**, **Questions fréquentes**.
2. **Mon gestionnaire** : c'est Sophie Lemaire (une particulière), pas une agence.

**Résultat attendu :** Aucune page d'erreur ; les textes conviennent à un bailleur particulier (pas de mention d'agence qui n'existe pas). Signalez toute formulation qui supposerait une agence.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-03 — Déposer son attestation d'assurance

📱 Téléphone · ⏱ 4 min

**Fichiers :** `attestation-assurance-habitation-thomas-girard.pdf`

1. **Mes documents** → « Votre assurance habitation » → *Fichier* `attestation-assurance-habitation-thomas-girard.pdf` ; *Date d'expiration* **30/09/2027** ; *Assureur* **Mutuelle Fictive de l'Essonne — contrat MFE-MRH-2026-60311** → **[Déposer]**.

**Résultat attendu :** « En cours de vérification », puis « Validée » quand la propriétaire l'aura validée (PRO-22).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-04 — Déposer les trois pièces réclamées

📱 Téléphone · ⏱ 5 min

> ⏳ La propriétaire vous les réclame (PRO-10).

**Fichiers :** `pieces-reclamees/ (justificatif de domicile, avis d'impôt, RIB)`

1. **Mes documents** → « Des pièces vous sont demandées » → pour chaque ligne, le fichier correspondant → **[Déposer]**.

**Résultat attendu :** Les trois demandes se referment une à une ; la propriétaire est prévenue.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-05 — Signer le bail (circuit manuel)

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

> ⏳ La propriétaire vous envoie le bail à signer (PRO-11).

**Fichiers :** `document-a-renvoyer-signe/exemplaire-signe-par-thomas-girard.pdf`

1. Courriel « Document à signer : … » → **Mes documents** → « Documents à signer » → **[Télécharger]** : relisez (entrée le 16/09/2026, 720 € + 60 €, dépôt 720 €).
2. **[Déposer le signé]** avec `exemplaire-signe-par-thomas-girard.pdf`.

**Résultat attendu :** « ✓ … signé et déposé — votre gestionnaire est notifié ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-06 — Retrouver bail signé, état des lieux et dépôt

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

> ⏳ La propriétaire a activé le bail et fait l'état des lieux (PRO-11, PRO-12).

1. Courriel « Votre bail signé est disponible » → **Mon logement** → **[Consulter mon bail signé]**.
2. « Mes états des lieux » : relevés gaz 8 412, électricité 20 115, eau 311,020 ; 2 clés + boîte aux lettres + bip.
3. **Mes paiements** → « Votre dépôt de garantie » : 720 €.

**Résultat attendu :** Tout concorde avec « Mon personnage ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3 · Loyers

#### LOP-07 — Échéancier, avis, relance

📱 Téléphone · ⏱ 5 min

> ⏳ La propriétaire a généré l'échéancier (PRO-14).

1. Courriels du matin : avis d'échéance, puis relance(s) tant que rien n'est encaissé.
2. **Mes paiements** : septembre au prorata (environ 390 €), octobre 780 € ; « Relances reçues » ; IBAN de Sophie (fictif : **aucun virement**).
3. « Attestation de bon paiement » : essayez-la **avant** vos paiements.

**Résultat attendu :** Montants justes. Tant qu'un mois échu est impayé, l'attestation de bon paiement est indisponible (message clair).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-08 — Reçu partiel, puis quittances

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

> ⏳ La propriétaire saisit vos paiements (PRO-15).

1. Courriels : quittance de septembre, « Reçu de paiement — octobre 2026 » (400 €), puis « Quittance de loyer — octobre 2026 ».
2. Ouvrez le reçu puis la quittance : loyer et charges séparés, période, identité de la bailleuse, montant réglé.
3. « Attestation de bon paiement » → **[Imprimer ou enregistrer]**.

**Résultat attendu :** Le reçu partiel ne vaut pas quittance et le dit ; la quittance d'octobre remplace le reçu au solde. L'attestation est maintenant disponible.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3–J5 · Incidents

#### LOP-09 — Signaler le radiateur en panne, depuis le téléphone

📱 Téléphone · ⏱ 5 min

**Fichiers :** `photos-incident/incident-radiateur-froid.jpg (à copier d'abord sur le téléphone)`

1. **Mes demandes** → **[Signaler un problème →]** : photo `incident-radiateur-froid.jpg` ; *De quoi s'agit-il ?* **Chauffage — radiateur ou eau chaude en panne** ; **Chambre** ; **Le radiateur de la chambre reste froid, la tête thermostatique est cassée** ; **Depuis trois jours** ; urgent : **Non, cela peut attendre quelques jours** → **[Envoyer le signalement]**.

**Résultat attendu :** Signalement enregistré ; son statut s'affiche dans « Mes demandes » et sur l'accueil.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-10 — Proposer vos propres disponibilités à l'artisan

📱 Téléphone · ⏱ 5 min

> ⏳ L'artisan propose trois créneaux (ART-11).

1. Courriel « Choisissez le créneau de votre intervention » → **Mes demandes**.
2. **Ne choisissez pas** ses créneaux : **[Aucun ne me convient — proposer mes disponibilités]** → 3 × *Date* + *Moment* (**Matin (8 h – 12 h)** ou **Après-midi (14 h – 18 h)**), dans les 2 à 5 jours → **[Envoyer mes disponibilités]**.
3. Attendez que l'artisan retienne une de vos dates.

**Résultat attendu :** Vos dates partent à l'artisan (« Le locataire propose d'autres créneaux ») ; quand il en retient une : « Rendez-vous fixé — … », puis le rappel la veille.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-11 — Suivre l'intervention et donner son avis

📱 Téléphone · ⏱ 3 min

> ⏳ L'artisan a terminé et la propriétaire a clôturé (ART-13, PRO-17).

1. **Mes demandes** : suivez le statut jusqu'à « Clos ».
2. « Votre avis sur l'intervention » : **4** étoiles, **Ponctuel, travail propre** → **[Envoyer mon avis]**.

**Résultat attendu :** Avis enregistré.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-12 — Le problème persiste : rouvrir un incident

📱 Téléphone · ⏱ 3 min · facultatif

1. Sur l'incident clos du radiateur : **[Le problème persiste]** → motif **Le radiateur chauffe à peine** → **[Rouvrir]**. Prévenez Sophie.

**Résultat attendu :** L'incident repasse ouvert côté propriétaire, avec votre motif. (Sophie pourra le reclôturer.)

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J5–J7 · Au quotidien

#### LOP-13 — Écrire à sa propriétaire

💻 📱 Ordinateur ou téléphone · ⏱ 3 min

1. **Mon gestionnaire** → « Écrire à … » → **Bonjour, puis-je installer une étagère murale dans le séjour ?** → **[Envoyer le message]**.
2. Attendez la réponse (PRO-22) : courriel « … vous a répondu ».

**Résultat attendu :** La réponse s'affiche dans le fil.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-14 — Contester qui paie (prise arrachée)

📱 Téléphone · ⏱ 3 min

> ⏳ La propriétaire a déclaré la prise arrachée et vous l'a imputée (PRO-18).

1. **Mes demandes** → l'incident « Prise / interrupteur » → **[Contester qui paie]** → **La prise était déjà descellée à mon arrivée** → **[Envoyer]**.

**Résultat attendu :** La contestation est enregistrée et visible par la propriétaire.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOP-15 — Sécurité du compte et données personnelles

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. **Sécurité du compte** : changez le mot de passe.
2. **Mes données personnelles** : lisez ce qui est proposé.
3. **Aide et retours** → **Proposer une idée** : ce qui vous manque comme locataire d'un particulier. Puis **[Se déconnecter]**.

**Résultat attendu :** « Mot de passe modifié… » ; idée enregistrée ; déconnexion effective.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______
