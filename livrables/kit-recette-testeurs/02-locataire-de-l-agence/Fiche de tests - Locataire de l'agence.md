<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# Fiche de tests — Locataire de l'agence

*Camille Roussel, locataire du T2 A12 géré par Horizon Gestion* · 20 tests


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
  (ex. `[GÊNANT] LOA-03 — …`), puis notez la **référence** donnée par Gerimmo.
- Un écart entre le résultat attendu et ce que vous voyez est **toujours** bon à signaler, même petit.

## Les tests

### J2 · Arrivée

#### LOA-01 — Recevoir l'invitation et créer son mot de passe

📱 Téléphone · ⏱ 5 min

> ⏳ L'agence vous invite (AGC-16) ; elle vous prévient juste avant.

1. Ouvrez le courriel **« Votre accès Gerimmo »** (vérifiez les indésirables) → **[Choisir mon mot de passe]** **dans l'heure**.
2. Choisissez un mot de passe de 12 caractères ou plus (*Nouveau mot de passe*, *Confirmation*) → **[Changer le mot de passe]**.
3. Connectez-vous sur www.gerimmo.app/connexion.

> [!warning]
> Lien expiré (plus d'une heure) ? Page de connexion → « Mot de passe oublié ? » avec votre adresse : un nouveau lien arrive.

**Résultat attendu :** Vous arrivez dans votre espace : « Bonjour Camille ». Au téléphone, la barre du bas propose Accueil, Documents, Paiements, Demandes et Menu.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-02 — Découvrir son espace avant le bail

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

1. **Accueil** : lisez « Ce qui vous attend » (l'assurance manquante doit y figurer).
2. **Mon logement** : avant la signature, « Aucun bail actif — votre logement apparaîtra ici dès la signature ».
3. Ouvrez chaque entrée du menu : **Mes documents**, **Mes paiements**, **Mes demandes**, **Mon gestionnaire**, **Les règles à connaître**, **Questions fréquentes**.
4. Regardez l'en-tête : le logo et les couleurs d'Horizon Gestion (si l'agence les a déposés en AGC-03).

**Résultat attendu :** Aucune page d'erreur ; des messages clairs quand il n'y a encore rien. L'espace est aux couleurs de l'agence.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-03 — Déposer son attestation d'assurance habitation

📱 Téléphone · ⏱ 5 min

**Fichiers :** `attestation-assurance-habitation-camille-roussel.pdf`

1. **Mes documents** → carte « Votre assurance habitation » → « Déposer mon attestation ».
2. *Fichier* `attestation-assurance-habitation-camille-roussel.pdf` ; *Date d'expiration* **01/09/2026** (exprès, déjà passée) → **[Déposer]** → refus attendu.
3. Corrigez *Date d'expiration* **30/09/2027** ; *Assureur* **Mutuelle Fictive de l'Essonne — contrat MFE-MRH-2026-51207** → **[Déposer]**.

**Résultat attendu :** La date passée est refusée (« Cette attestation est déjà expirée — déposez l'attestation en cours de validité. »). Ensuite : « En cours de vérification », puis « Validée » quand l'agence l'aura validée (AGC-34).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-04 — Déposer les pièces que l'agence vous réclame

📱 Téléphone · ⏱ 5 min

> ⏳ L'agence vous réclame votre avis d'imposition et votre RIB (AGC-17).

**Fichiers :** `pieces-reclamees/avis-impot-2026-camille-roussel.pdf`, `pieces-reclamees/RIB-camille-roussel.pdf`

1. Courriels « Pièce demandée : … » → **Mes documents** → carte « Des pièces vous sont demandées ».
2. Avis d'imposition → `avis-impot-2026-camille-roussel.pdf` → **[Déposer]** ; RIB → `RIB-camille-roussel.pdf` → **[Déposer]**.

**Résultat attendu :** Chaque demande disparaît une fois la pièce déposée ; l'agence est prévenue. Aucun message d'erreur.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-05 — Signer le bail (circuit manuel)

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

> ⏳ L'agence vous envoie le bail à signer (AGC-19).

**Fichiers :** `document-a-renvoyer-signe/exemplaire-signe-par-camille-roussel.pdf`

1. Courriel « Document à signer : … » → **Mes documents** → « Documents à signer » → **[Télécharger]** : relisez le bail (votre nom, l'adresse, 890 € + 90 € de provision, dépôt 890 €, entrée le 01/10/2026).
2. **[Déposer le signé]** avec **le fichier que vous venez de télécharger** → refus attendu (identique au document reçu).
3. **[Déposer le signé]** avec `exemplaire-signe-par-camille-roussel.pdf` (votre exemplaire « signé »).

**Résultat attendu :** Le fichier non signé est refusé (« Ce fichier est identique au document reçu : signez-le d'abord… »). L'exemplaire signé est accepté : « ✓ … signé et déposé — votre gestionnaire est notifié ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-06 — Retrouver son bail signé et son état des lieux d'entrée

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

> ⏳ L'agence a activé le bail (AGC-20) et signé l'état des lieux d'entrée (AGC-21).

1. Courriel « Votre bail signé est disponible ».
2. **Mon logement** : loyer, dépôt, préavis ; **[Consulter mon bail signé]**.
3. « Mes états des lieux » : ouvrez l'état des lieux d'entrée et comparez avec « Mon personnage » (eau 482,315 m³, électricité 12 587 kWh, 3 clés + badge + boîte aux lettres + cave).

**Résultat attendu :** Le bail signé s'ouvre ; le préavis affiché est d'un mois (zone tendue). L'état des lieux reprend les bons relevés et le bon nombre de clés.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3 · Loyers

#### LOA-07 — Avis d'échéance et relance de loyer

📱 Téléphone · ⏱ 5 min

> ⏳ L'agence a appelé le terme d'octobre (AGC-24) ; ces courriels partent le matin (vers 9 h 30 et 9 h 45).

1. Vérifiez vos courriels : « Avis d'échéance — octobre 2026 », puis, tant que l'agence n'a pas saisi le paiement, « Loyer d'octobre — un règlement semble en attente ».
2. **Mes paiements** : « Loyer restant à régler », l'IBAN de l'agence (bouton **[Copier]**), « Vos charges », « Relances reçues ».

**Résultat attendu :** Montant de 980 € (890 + 90), relance visible dans « Relances reçues ». **Ne faites aucun virement** : l'IBAN est fictif, l'agence saisit le paiement pour vous.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-08 — Recevoir et vérifier sa quittance

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

> ⏳ L'agence a encaissé votre loyer (AGC-26).

1. Courriel « Quittance de loyer — octobre 2026 » → « Consulter / imprimer le document » (connexion demandée).
2. Vérifiez : loyer 890 € et charges 90 € séparés, période du 1ᵉʳ au 31 octobre, nom du bailleur (Bernard Fontaine) et de l'agence, signature.
3. **Mes paiements** → « Historique des loyers » : la quittance y est ; « Attestation de bon paiement » → **[Imprimer ou enregistrer]**.

**Résultat attendu :** La quittance est complète et conforme ; l'attestation de bon paiement se génère (elle serait indisponible avec un mois impayé).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-09 — Suivre son dépôt de garantie

📱 Téléphone · ⏱ 2 min

> ⏳ L'agence a encaissé le dépôt (AGC-22).

1. **Mes paiements** → « Votre dépôt de garantie ».

**Résultat attendu :** 890 €, avec sa date d'encaissement.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3–J5 · Incident

#### LOA-10 — Signaler la fuite sous l'évier, depuis le téléphone

📱 Téléphone · ⏱ 5 min

**Fichiers :** `photos-incident/incident-fuite-evier.jpg (à copier d'abord sur le téléphone)`

1. **Mes demandes** → **[Signaler un problème →]**.
2. *Photos (jusqu'à 5)* (premier champ) : `incident-fuite-evier.jpg`.
3. *De quoi s'agit-il ?* **Plomberie — joint, siphon, robinetterie** ; *Dans quelle pièce ?* **Cuisine** ; *Décrivez en quelques mots* **Fuite sous l'évier, ça goutte en continu, j'ai mis un seau** ; *Depuis quand ?* **Depuis hier soir** ; *Est-ce urgent ?* **Oui, dégât en cours ou logement inutilisable** → **[Envoyer le signalement]**.

**Résultat attendu :** Le signalement est enregistré en trois écrans au plus ; son statut s'affiche dans « Mes demandes » et sur l'accueil. L'agence reçoit un courriel « URGENT ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-11 — Voir qui paie la réparation

📱 Téléphone · ⏱ 2 min

> ⏳ L'agence qualifie l'incident (AGC-28).

1. **Mes demandes** → l'incident : lisez la qualification et sa justification.

**Résultat attendu :** « Charge propriétaire » avec la justification de l'agence (vétusté du siphon). Aucun courriel n'est envoyé pour cette étape : c'est normal.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-12 — Choisir le créneau de l'intervention

📱 Téléphone · ⏱ 3 min

> ⏳ L'artisan propose trois créneaux (ART-07).

1. Courriel « Choisissez le créneau de votre intervention » → **Mes demandes** → « Choisissez votre rendez-vous ».
2. Choisissez un créneau → **[Confirmer ce rendez-vous]**.

**Résultat attendu :** Courriel « Rendez-vous fixé — … » ; la veille, « Rappel — intervention demain, … » (vers 8 h).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-13 — Donner son avis sur l'intervention

📱 Téléphone · ⏱ 2 min

> ⏳ L'artisan a terminé (ART-09) et l'agence a clôturé (AGC-31).

1. **Mes demandes** → « Votre avis sur l'intervention » : **5** étoiles, **Rapide et soigneux** → **[Envoyer mon avis]**.

**Résultat attendu :** Avis enregistré. Vous ne jugez pas le prix (vous ne l'avez pas payé).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-14 — Signaler un volet bloqué et contester qui paie

📱 Téléphone · ⏱ 8 min · facultatif

**Fichiers :** `photos-incident/incident-volet-bloque.jpg`

1. **[Signaler un problème →]** : photo `incident-volet-bloque.jpg` ; **Autre problème** ; **Séjour** ; **Volet roulant bloqué à mi-hauteur, les lames sont sorties du rail** ; urgent : **Non** → **[Envoyer le signalement]**.
2. Quand l'agence l'impute « Charge locataire » (AGC-33) : **[Contester qui paie]** → *Motif de votre contestation* **Le volet s'est bloqué tout seul, sans choc : c'est de l'usure** → **[Envoyer]**.

**Résultat attendu :** La contestation est enregistrée et visible par l'agence ; sa décision vous est ensuite affichée.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J5–J7 · Au quotidien

#### LOA-15 — Écrire à son gestionnaire

💻 📱 Ordinateur ou téléphone · ⏱ 3 min

1. **Mon gestionnaire** → « Écrire à Horizon Gestion » → *Votre message* **Bonjour, quand a lieu la régularisation des charges ?** → **[Envoyer le message]**.
2. Attendez la réponse (AGC-35) : courriel « Horizon Gestion vous a répondu » → « Lire la réponse ».

**Résultat attendu :** Le fil de discussion garde la question et la réponse.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-16 — Sécurité du compte et données personnelles

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. Menu → **Sécurité du compte** : changez votre mot de passe (actuel, nouveau, confirmation) → **[Changer le mot de passe]**.
2. Constatez que l'adresse de connexion ne se change pas ici (message explicatif).
3. Menu → **Mes données personnelles** : lisez ce qui est proposé.

**Résultat attendu :** « Mot de passe modifié… » ; les explications sont compréhensibles. Dites-nous si quelque chose vous manque (export de vos données, par exemple).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-17 — Règles et questions fréquentes

📱 Téléphone · ⏱ 5 min

1. **Les règles à connaître** et **Questions fréquentes** : lisez deux ou trois fiches (assurance, préavis, dépôt).

**Résultat attendu :** Les textes sont clairs et justes pour un locataire ; signalez toute phrase obscure ou fausse (« Proposer une idée » ou « Demander une explication »).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### Dernier jour · Départ

#### LOA-18 — Annoncer son départ

📱 Téléphone · ⏱ 3 min

> ⏳ Le coordinateur donne le top de fin.

1. **Mon logement** → « Vous quittez le logement ? » → **[Annoncer mon départ]**.
2. *Un mot pour votre gestionnaire* **Je quitte le logement pour une mutation, ma lettre recommandée est partie ce jour** → **[Prévenir mon gestionnaire]**.

**Résultat attendu :** Gerimmo confirme et rappelle que cette annonce ne remplace pas la lettre recommandée. L'agence voit l'annonce sur votre bail.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-19 — Recevoir le décompte de restitution du dépôt

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

> ⏳ L'agence a fait l'état des lieux de sortie et finalisé le décompte (AGC-48, AGC-49).

1. « Mes états des lieux » : ouvrez l'état des lieux de sortie.
2. **Mes paiements** → « Votre dépôt de garantie » : lisez le décompte (retenue, coût, âge, décote) et ouvrez le justificatif.
3. Après la clôture du bail : reconnectez-vous et vérifiez que vous accédez toujours à vos quittances et documents.

**Résultat attendu :** Chaque retenue est détaillée et justifiée ; le montant rendu = 890 € − retenues. Vos quittances restent consultables après la fin du bail.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### LOA-20 — Signaler ce qui vous a gêné

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. Menu → **Aide et retours** → **Proposer une idée** : ce qui vous a le plus manqué comme locataire.
2. **Aide et retours** → **Mes demandes** : relisez les réponses de la supervision à vos signalements.
3. Menu → **[Se déconnecter]**.

**Résultat attendu :** Votre idée est enregistrée (elle sera visible des membres de l'espace de l'agence) ; vos échanges gardent toutes les réponses.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______
