<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# Guide du coordinateur

<div class="couverture"><div class="sur">Kit de recette Gerimmo · pour le coordinateur</div>
<h1>Guide du coordinateur</h1>
<div class="sous">Ce que toi seul peux faire : préparer la plateforme, ouvrir l'agence, valider l'artisan, répondre
aux signalements, encadrer les paiements réels, puis tout remettre en ordre.</div></div>

## 1. Le dispositif en un coup d'œil

| Dossier | Personnage | Comment le compte naît | Dépend de toi pour… |
|---|---|---|---|
| 01 Agence immobilière | Nadia Bensaïd (Horizon Gestion) | **Toi**, depuis la console : « Ouvrir une organisation » | l'ouverture de l'organisation |
| 02 Locataire de l'agence | Camille Roussel | Invitée par l'agence depuis sa fiche | — |
| 03 Propriétaire bailleur | Sophie Lemaire | Inscription en ligne sur https://www.gerimmo.app/inscription | le remboursement de l'abonnement |
| 04 Locataire du propriétaire | Thomas Girard | Invité par la propriétaire depuis sa fiche | — |
| 05 Artisan | Karim Haddad (Haddad Plomberie Chauffage) | Inscription en ligne sur https://www.gerimmo.app/artisan/inscription | **la validation** (SIRET puis inscription) |

Le testeur agence fait aussi vivre trois personnages secondaires, par alias « + » de son adresse : **Bernard
Fontaine** (mandant, reçoit le rapport de gestion), **Philippe Roussel** (garant) et, s'il le souhaite, **Julien
Marchetti** (agent). Remplis `Tableau-d-affectation.xlsx` avant tout.

## 2. Avant de lancer (J-2 → J0)

> [!warning] Deux vérifications qui conditionnent les paiements réels
> 1. **Stripe en mode réel** : dans **Santé** (`/admin/sante`), la clé Stripe doit apparaître comme **clé réelle** —
>    une clé de test afficherait « aucun paiement réel ne passera ». Le webhook doit être posé.
> 2. **Portail client Stripe activé** dans le tableau de bord Stripe (réglage à faire une fois) : sans lui, le bouton
>    **[Gérer mon abonnement]** (changer de carte, résilier) échoue.

1. `/admin/sante` : aucun manque ; les tâches du matin « à l'heure ».
2. Courriels d'authentification : un « mot de passe oublié » sur ton propre compte arrive bien.
3. **Pages légales** : les mentions légales et les CGU gardent des passages à compléter (éditeur, SIRET, médiateur,
   facturation). Sans incidence pour une recette entre amis ; à compléter avant d'encaisser de vrais clients.
4. **Tableau d'affectation** rempli : un testeur par dossier, son adresse, ses appareils ; vérifie que l'adresse du
   testeur agence accepte les alias « + ».
5. **Prise en charge des paiements** décidée et annoncée : propriétaire 5,99 €/mois
   (2 biens), agence 39 €/mois jusqu'à 10 lots sous mandat actif si tu l'ouvres en essai.
6. **Ouvrir l'agence** : **Clients** → `/admin/organisations/nouvelle` (« Ouvrir une organisation ») :

    - *Nom de l'organisation* : **Horizon Gestion (recette)**
    - *Type* : **Agence de gestion**
    - *Adresse du premier responsable* : l'adresse **réelle** du testeur agence
    - *Démarrage* : **essai de 14 jours** (l'agence pourra souscrire pour de vrai, débit à la fin de l'essai)
      **ou** « Contrat déjà signé — ouvrir directement en abonnement actif » (aucun paiement agence).
      Astuce : pour voir un débit réel **pendant** la recette, mets un essai court (3 jours) : quand il reste moins
      de 48 h d'essai, Stripe débite dès la souscription.
    - **[Ouvrir l'organisation]** → le testeur reçoit « Votre accès Gerimmo ».

7. **Envoyer les dossiers** : un ZIP par testeur (`zips/`), avec le message du § 8.

## 3. Pendant la recette — chaque jour

> [!danger] Les signalements ne te préviennent pas
> Aucune notification n'arrive quand un testeur écrit dans « Aide et retours ». Les nouveaux problèmes sont classés
> **« Majeur » par défaut** et n'apparaissent pas dans **Aujourd'hui** (seuls les « Bloquant » y remontent).
> Ouvre ****Développement** → **Retours des utilisateurs**** (`/admin/retours`) **matin et soir**.

**Traiter un signalement** : lire « Écran » et le titre (les testeurs y mettent `[BLOQUANT]`, `[GÊNANT]` ou
`[DÉTAIL]`) → *Gravité* → *Décision* (En examen / En cours de traitement / Résolu) → *Réponse visible dans le suivi* → **[Enregistrer la décision]**. Gerimmo **n'envoie pas de courriel** au testeur : préviens-le (WhatsApp) qu'une
réponse l'attend. Les signalements de problème sont supprimés au bout de six mois : recopie ce qui mérite un ticket.

**Valider l'artisan (J1, dès qu'il a déposé ses attestations)** — **Artisans à valider** (`/admin/artisans`) :

1. Carte « Haddad Plomberie Chauffage », SIRET **000 073 148 00017** (fictif, 14 chiffres) : **[Enregistrer le SIRET comme vérifié]** après avoir coché « J'ai vérifié l'existence et l'identité de l'entreprise correspondant à ce SIRET ».
   Pour la recette, l'entreprise est fictive : c'est le geste qu'on teste, pas l'entreprise.
2. Ouvrir les justificatifs : décennale et RC pro (obligatoires, en cours jusqu'au 31/12/2026), URSSAF, Kbis.
3. Cocher « J'ai relu les justificatifs… » puis **[Valider l'inscription]**. Sans décennale **et** RC pro en cours,
   Gerimmo refuse.

**Faire avancer le fil** : quand un testeur termine une étape dont un autre dépend (invitation envoyée, incident
qualifié, devis retenu…), préviens le suivant. Le fil rouge est au § 6 de « À lire en premier ».

**Surveiller** : `/admin/sante` (tâches du matin), et les journaux Vercel quand un testeur cite une « réf. » d'erreur.

## 4. Les paiements réels

| Qui | Montant | Quand la carte est débitée |
|---|---|---|
| Propriétaire (2 biens) | 5,99 €/mois (1ᵉʳ bien offert, quantité = biens − 1) | à la fin de son essai de 14 jours (30 avec un code de parrainage) |
| Agence ouverte en essai | 39 €/mois jusqu'à 10 lots sous mandat actif | à la fin de l'essai (tout de suite s'il reste moins de 48 h) |

- Pendant l'essai, la souscription enregistre la carte et passe le compte « Abonnement actif » **sans rien
  débiter** : c'est normal, préviens les testeurs.
- La console n'affiche aucun montant : paiements, factures et remboursements se voient dans **Stripe**.
- **Rembourser** : Stripe → Paiements → le paiement → Rembourser. **Résilier** : Stripe → Abonnements → Annuler, ou
  le testeur via **[Gérer mon abonnement]**. À la fin de la période, le compte repasse en lecture seule.
- Point connu : une réactivation venue de Stripe peut rouvrir une organisation que tu avais suspendue à la main.

## 5. Après la recette

1. Rembourser et résilier ce qui doit l'être.
2. Trier les signalements restants ; transformer les vrais défauts en tickets de correction.
3. Décider du sort des données : organisations « Horizon Gestion (recette) » et « Parc de Sophie Lemaire », comptes
   des testeurs, artisan fictif (SIRET 000 073 148 00017). L'archivage se fait depuis la fiche de l'organisation
   (« Contrôle de l'abonnement » → Archiver) ; une purge complète suit la procédure du 25/09 (données de
   développement) consignée dans `log.md`.
4. Récupérer les tableaux de suivi, remplir le suivi consolidé, et consigner le bilan dans `log.md`
   (`## [date] recette | Recette avec les testeurs`).

## 6. Pièges connus à garder en tête

- **Doublons refusés** : Gerimmo refuse un fichier déjà rangé dans la même organisation — c'est pourquoi chaque pièce
  du kit est unique, et qu'un « bail signé » distinct est fourni (redéposer le bail généré serait refusé).
- **Échec d'un diagnostic** dont l'échéance précède la réalisation : message générique, et le fichier reste dans
  les documents ; d'où les copies de secours.
- **Photo du compte rendu de l'artisan au téléphone** : l'appareil photo s'ouvre directement (pas la galerie) ;
  l'artisan photographie n'importe quel objet — ou fait le compte rendu depuis un ordinateur avec les photos du kit.
- **Reprise comptable** : le montant et la date annoncés sont figés au premier « Contrôler la balance », il n'y a pas
  de bouton d'abandon, et une seule reprise par organisation. Le test est facultatif et placé en fin de parcours.
- **Imports CSV** : UTF-8 obligatoire ; chiffres et dates ne sont vérifiés qu'à l'import, avec un message brut.
- **Taille des fichiers** : au-delà d'environ 4,5 Mo, la plateforme d'hébergement peut refuser l'envoi ; les
  pièces à déposer du kit font moins de 150 Ko (sauf le logo trop lourd, fait exprès : environ 550 Ko).
- **« Mon abonnement »** n'existe que pour le responsable (agence ou propriétaire) ; un agent y obtient une page
  introuvable, c'est voulu.

## 7. Suivi consolidé

`Suivi-consolide.xlsx` reprend les tests des cinq dossiers, une feuille par persona : recopie-y les statuts des
testeurs et les références de signalement, pour voir d'un coup d'œil ce qui reste rouge.

## 8. Message à envoyer avec chaque dossier

```
Salut ! Voici ton dossier pour tester Gerimmo (ZIP joint).
1. Ouvre « 00-A-lire-en-premier.pdf » (5 minutes).
2. Tu joues : [PERSONNAGE]. Tout ce que tu dois saisir est dans « 02-Mon-personnage ».
3. Tu suis « 01-Fiche-de-tests » dans l'ordre et tu coches au fur et à mesure.
4. Le moindre souci, tu le signales DANS Gerimmo : bouton « Aide et retours » (voir « 03-Fiche-de-remontee »).
Seule ta vraie adresse e-mail sert ; tout le reste est fictif. Paiement : [À PRÉCISER].
Top départ : [DATE]. Merci !!
```
