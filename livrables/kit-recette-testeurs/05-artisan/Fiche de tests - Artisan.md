<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# Fiche de tests — Artisan

*Karim Haddad, plombier-chauffagiste (Haddad Plomberie Chauffage)* · 16 tests


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
  (ex. `[GÊNANT] ART-03 — …`), puis notez la **référence** donnée par Gerimmo.
- Un écart entre le résultat attendu et ce que vous voyez est **toujours** bon à signaler, même petit.

## Les tests

### J1 · Inscription

#### ART-01 — Créer son compte artisan

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. www.gerimmo.app/connexion → « Artisan ? Inscrire mon entreprise » (…/artisan/inscription).
2. « 1. Votre compte » : *Adresse e-mail* (la vôtre), *Mot de passe* et *Confirmer le mot de passe* (12 caractères ou plus), CGU cochées → **[Créer mon compte]**.
3. Courriel **« Confirmez votre adresse — Gerimmo »** → **[Confirmer mon adresse]** (1 heure).

**Résultat attendu :** Retour sur …/artisan/inscription, à l'étape « Inscrire mon entreprise ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-02 — Inscrire son entreprise

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. *SIRET* **0000731480001** (13 chiffres, exprès) → le formulaire doit refuser.
2. *Nom de votre entreprise* **Haddad Plomberie Chauffage** ; *SIRET* **00007314800017** ; *Mobile* **06 39 98 73 14** ; *Adresse e-mail* : **la vôtre** (sans elle, aucune notification ne vous parvient) ; *Vos métiers* **Plomberie** et **Chauffage** ; *Votre zone d'intervention* **91000, 91100, 91120, 91150, 91200, 91300** → **[Inscrire mon entreprise]**.

> [!warning]
> Si Gerimmo répond que ce SIRET est déjà inscrit, prenez le SIRET de secours **00007315500012** et prévenez le coordinateur (les agences devront utiliser celui-là).

**Résultat attendu :** « Votre entreprise est inscrite. Déposez maintenant votre décennale et votre RC pro… » ; bandeau permanent « Inscription en cours de validation par Gerimmo… ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-03 — Déposer ses quatre attestations

💻 📱 Ordinateur ou téléphone · ⏱ 10 min

**Fichiers :** `01-attestations/ (décennale, RC pro, URSSAF, Kbis)`

1. **Mon entreprise** → « Mes attestations » → « Déposer une attestation ».
2. *Quelle attestation* **Assurance décennale** ; *Émise le* **05/01/2026** ; *Valable jusqu'au* **31/12/2026** ; *L'attestation* `attestation-decennale-2026.pdf` → **[Déposer l'attestation]**.
3. **Responsabilité civile professionnelle** : mêmes dates, `attestation-rc-pro-2026.pdf`.
4. **Attestation de vigilance URSSAF** : **15/09/2026** → **15/03/2027**, `attestation-vigilance-urssaf.pdf`.
5. **Extrait Kbis** : **10/09/2026** → **10/12/2026**, `extrait-kbis.pdf`.
6. Prévenez le coordinateur : il doit valider votre inscription.

**Résultat attendu :** Les quatre attestations apparaissent avec leur échéance ; la liste « Encore attendues » se vide.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-04 — Constater la validation par Gerimmo

💻 📱 Ordinateur ou téléphone · ⏱ 2 min

> ⏳ Le coordinateur vérifie votre SIRET et valide votre inscription (aucun courriel ne vous prévient).

1. **Mon entreprise** → « Ma fiche » : statut et « Vérification du SIRET ».

**Résultat attendu :** « Inscription validée », SIRET vérifié, le bandeau « en cours de validation » a disparu. (Qu'aucun courriel ne l'annonce est un point à signaler si cela vous gêne.)

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-05 — Métiers, zone et visibilité

💻 📱 Ordinateur ou téléphone · ⏱ 3 min

1. **Mon entreprise** → « Mes métiers et ma zone » : vérifiez, sans rien changer → **[Enregistrer]**.
2. « Qui peut me solliciter » : **[Rendre mon profil public]**, puis lisez l'explication (privé par défaut : seules les agences qui vous ont ajouté peuvent vous solliciter).

**Résultat attendu :** Les réglages sont enregistrés et expliqués clairement.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3–J5 · Mission pour l'agence

#### ART-06 — Chiffrer la demande de devis de l'agence

💻 📱 Ordinateur ou téléphone · ⏱ 10 min

> ⏳ L'agence vous demande un devis pour la fuite de Camille (AGC-29).

1. Courriel « Nouvelle demande de devis — Horizon Gestion — Plomberie — Massy » → menu **Devis** → « À chiffrer » → la demande.
2. *Votre diagnostic* **Siphon PVC fissuré et joint usé : remplacement du siphon et des joints**.
3. Lignes (**[Ajouter une prestation ou fourniture]**) : **Déplacement et diagnostic** 1 × 45,00 ; **Siphon PVC et joints (fourniture)** 1 × 38,50 ; **Main-d'œuvre** 1,5 × 52,00 — TVA **10 %** sur chaque ligne.
4. *Délai avant intervention* **Sous 48 heures** ; *Durée estimée* **1 h 30** ; *Contraintes et accès* **Vider le meuble sous l'évier avant mon passage** ; *Valable jusqu'au* : laissez la date proposée → **[Envoyer mon devis]**.

**Résultat attendu :** Total 161,50 € HT, 16,15 € de TVA, **177,65 € TTC** ; le devis passe dans « Devis envoyés » et n'est plus modifiable. L'agence reçoit « Devis reçu — … ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-07 — Accepter la mission et proposer trois créneaux

📱 Téléphone · ⏱ 5 min

> ⏳ L'agence retient votre devis (AGC-29).

1. Courriel « Mission confiée — … » → la mission → **[Accepter la mission]**.
2. **[Proposer des créneaux]** : essayez d'abord avec deux créneaux seulement → refus attendu (trois au minimum).
3. Trois créneaux dans les 2 à 4 jours, par exemple 9 h – 11 h (*Jour*, *De*, *À*, **[Ajouter un créneau]**) → **[Envoyer les créneaux]**.

**Résultat attendu :** Mission « Acceptée » ; Camille reçoit « Choisissez le créneau de votre intervention ».

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-08 — Rendez-vous confirmé, agenda et rappel

📱 Téléphone · ⏱ 3 min

> ⏳ Camille confirme un créneau (LOA-12).

1. Courriel « Rendez-vous confirmé par le locataire — … ».
2. Menu **Agenda** : le rendez-vous est dans « Les 7 prochains jours », avec le nom et le logo d'Horizon Gestion.
3. La veille : courriel « Rappel — intervention demain, … » (vers 8 h).

**Résultat attendu :** Le rendez-vous est au bon jour et à la bonne heure, sur la fiche et dans l'agenda.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-09 — Intervenir et faire le compte rendu

📱 Téléphone · ⏱ 8 min

**Fichiers :** `03-photos-chantier/intervention-avant-siphon.jpg`, `03-photos-chantier/intervention-apres-siphon.jpg`

1. Le jour du rendez-vous : la mission → **[Je démarre l'intervention]**.
2. Compte rendu, « Étape 1 sur 2 » : essayez de continuer sans photo → impossible.
3. « Photographier le travail terminé » : **au téléphone, l'appareil photo s'ouvre directement** → photographiez n'importe quel objet (jamais un visage ni un document). **Sur ordinateur**, choisissez `intervention-apres-siphon.jpg`. Facultatif : « Photo avant » `intervention-avant-siphon.jpg`.
4. « Étape 2 sur 2 » : *Ce que vous avez fait* **Remplacement du siphon et des joints, test d'étanchéité concluant** ; *Montant final TTC* **177,65** ; *Avez-vous trouvé autre chose que prévu ?* **Non** → **[Terminer l'intervention]**.

**Résultat attendu :** Sans photo « après », impossible de terminer. Ensuite : mission « Terminée », l'agence voit le compte rendu et la photo.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-10 — Déposer sa facture

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

**Fichiers :** `04-factures/facture-F2026-0142-fuite-evier-lot-A12.pdf`

1. La mission → « Déposer ma facture » : *Numéro de la facture* **F2026-0142** ; *Montant TTC (€)* : tapez **190** → le champ « Pourquoi le montant diffère-t-il du devis ? » apparaît et devient obligatoire.
2. Remettez **177,65** ; *Votre facture* `facture-F2026-0142-fuite-evier-lot-A12.pdf` → **[Déposer ma facture]**.
3. **Mon entreprise** → « Ma facturation ».

**Résultat attendu :** Facture déposée (statut « Facture déposée ») ; une seule facture par intervention. Le paiement se fait hors de Gerimmo.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J3–J5 · Mission pour la propriétaire

#### ART-11 — Chiffrer le radiateur, accepter, proposer des créneaux

💻 📱 Ordinateur ou téléphone · ⏱ 12 min

> ⏳ Sophie Lemaire vous demande un devis (PRO-16).

1. **Devis** → la demande (Chauffage, Corbeil-Essonnes) : diagnostic **Tête thermostatique cassée, circuit à purger** ; lignes **Déplacement et diagnostic** 1 × 45,00 ; **Tête thermostatique (fourniture)** 1 × 29,90 ; **Purge et remise en service du circuit** 1 × 60,00 ; **Main-d'œuvre** 1 × 52,00 ; TVA **10 %** ; délai **Sous 3 jours** ; durée **1 heure** → **[Envoyer mon devis]**.
2. Quand Sophie le retient : **[Accepter la mission]** → **[Proposer des créneaux]** (trois) → **[Envoyer les créneaux]**.

**Résultat attendu :** Devis de **205,59 € TTC** (186,90 € HT). Mission acceptée ; Thomas reçoit vos créneaux.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-12 — Retenir une date proposée par le locataire

📱 Téléphone · ⏱ 3 min

> ⏳ Thomas refuse vos créneaux et propose les siens (LOP-10).

1. Courriel « Le locataire propose d'autres créneaux — … » → la mission.
2. Choisissez une de ses dates → **[Je retiens cette date]**.

**Résultat attendu :** « Rendez-vous fixé — … » pour vous et pour Thomas ; l'agenda le montre avec le nom de Sophie Lemaire.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-13 — Signaler une cause imprévue, terminer et facturer

💻 📱 Ordinateur ou téléphone · ⏱ 10 min

**Fichiers :** `03-photos-chantier/intervention-apres-radiateur.jpg`, `04-factures/facture-F2026-0143-radiateur-banc-d-essai.pdf`

1. **[Je démarre l'intervention]** → photo « après » (appareil photo au téléphone, ou `intervention-apres-radiateur.jpg` sur ordinateur).
2. Bilan : **Tête thermostatique remplacée, circuit purgé** ; montant **205,59** ; « Avez-vous trouvé autre chose que prévu ? » **Oui** → *Ce que vous avez constaté* **Robinet de radiateur grippé, usure normale** ; *Selon vous, qui devrait payer ?* **le propriétaire** (ou « Je ne me prononce pas ») → **[Terminer l'intervention]**.
3. Quand Sophie a tranché (PRO-17) : « Déposer ma facture » → **F2026-0143**, **205,59**, `facture-F2026-0143-radiateur-banc-d-essai.pdf` → **[Déposer ma facture]**.

**Résultat attendu :** Votre constat arrive chez Sophie comme « autre cause — à trancher avant facturation » ; une fois tranchée, la facture se dépose.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

### J5–J7 · Au quotidien

#### ART-14 — Aujourd'hui, agenda et facturation, toutes clientèles confondues

📱 Téléphone · ⏱ 5 min

1. **Aujourd'hui** : sections « Vos attestations », « Missions à accepter », « Rendez-vous à fixer », « Devis à chiffrer », « Prochaines interventions ».
2. **Agenda** : « Les 7 prochains jours », « Sans rendez-vous », « Journées passées » : vos deux missions, chacune au nom de son client.
3. « Ma facturation » : deux factures déposées.

**Résultat attendu :** Tout est rangé par client, lisible au téléphone (gros boutons, contraste suffisant en extérieur).

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-15 — Consulter sa note, puis la contester

💻 📱 Ordinateur ou téléphone · ⏱ 8 min

> ⏳ L'agence et la propriétaire vous ont noté (AGC-31, PRO-17).

1. **Mon entreprise** → « Ma note » : lisez les indicateurs (délai d'acceptation, délai d'intervention, taux de refus, attestations expirées).
2. « Contester votre note est un droit » → formulaire « Contester mon évaluation » (dans « Aide et retours ») : *Titre* **[DÉTAIL] ART-15 — Contestation de test** ; *Quels faits souhaitez-vous faire réexaminer ?* **Test de la contestation : délai compté alors que le locataire a déplacé le rendez-vous** → **[Envoyer ma demande]**.

**Résultat attendu :** Avant trois évaluations, la note porte la mention « nouveau ». La contestation n'est visible que de la supervision Gerimmo, jamais des agences.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______

#### ART-16 — Règles, aide en cas de panne, sécurité

💻 📱 Ordinateur ou téléphone · ⏱ 5 min

1. « Les règles à connaître » et « Aide en cas de panne » (…/artisan/panne) : lisez.
2. « Sécurité du compte » : changez le mot de passe.
3. Bouton rond « Aide et retours » (en bas à droite) → **Proposer une idée** : ce qui vous ferait gagner du temps sur le chantier. Puis « Se déconnecter ».

**Résultat attendu :** Pages claires ; mot de passe changé ; idée enregistrée.

- [ ] OK  - [ ] KO  - [ ] Bloqué — Réf. Gerimmo : ______
