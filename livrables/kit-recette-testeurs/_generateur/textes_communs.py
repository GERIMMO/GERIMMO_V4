"""« À lire en premier » (tous les testeurs) et « Guide du coordinateur » (le porteur).

Faits relevés dans le code et le wiki au 27/09/2026 : prix et essai
(app/src/lib/stripe.ts), ouverture d'organisation (/admin/organisations/nouvelle),
validation artisan (/admin/artisans), retours (/admin/retours), santé
(/admin/sante), courriels (app/src/lib/*-email.ts).
"""

import univers as U

A_LIRE_TITRE = "À lire en premier"
GUIDE_TITRE = "Guide du coordinateur"


def a_lire() -> str:
    t = U.TARIFS
    return f"""
<div class="couverture"><div class="sur">Kit de recette Gerimmo · pour tous les testeurs</div>
<h1>Merci de tester Gerimmo !</h1>
<div class="sous">Tout est prêt pour vous : un personnage fictif, tous ses documents, et une fiche qui dit quoi
faire, écran par écran. Vous n'avez rien à fournir de personnel — sauf votre adresse e-mail.</div></div>

## 1. Gerimmo en deux phrases

Gerimmo est une application de **gestion locative** : une agence immobilière ou un propriétaire y gère ses biens,
ses baux, ses loyers et quittances, ses incidents et les artisans qui les réparent ; le locataire y retrouve son
bail, ses quittances et signale ses problèmes ; l'artisan y reçoit ses missions. Elle est en ligne sur
**{U.SITE}**, et c'est **la vraie application** que vous allez tester.

## 2. Ce qu'on vous demande

- **Jouer un rôle** pendant environ une semaine : 3 à 6 heures au total, par petites séances.
- **Dérouler votre fiche de tests** dans l'ordre, et cocher OK, KO ou Bloqué (sur papier ou dans le tableau Excel).
- **Signaler tout ce qui cloche** — un bug, une phrase incompréhensible, un bouton introuvable, une idée — avec
  la fonction **« Aide et retours »** de Gerimmo (voir la fiche de remontée). Un doute compte : signalez-le.

## 3. Ce que contient votre dossier

| Fichier | À quoi il sert |
|---|---|
| `00-A-lire-en-premier.pdf` | Ce document |
| `01-Fiche-de-tests-….pdf` | Vos tests numérotés, pas à pas, avec le résultat attendu |
| `02-Mon-personnage-….pdf` | Qui vous êtes, et **toutes les données à saisir** (noms, adresses, montants, dates) |
| `03-Fiche-de-remontee.pdf` | Comment signaler un problème depuis Gerimmo |
| `04-Suivi-des-tests-….xlsx` | Votre tableau de suivi (statut, référence de signalement, commentaire) |
| `documents/` | Les pièces fictives à déposer dans Gerimmo, rangées dans l'ordre des tests |

## 4. Les cinq rôles et comment ils se croisent

<div class="grille2">
<div class="carte"><b>🏢 L'agence immobilière</b> — Nadia Bensaïd, gérante d'Horizon Gestion (Évry-Courcouronnes).
Elle gère les lots de <b>Bernard Fontaine</b> (propriétaire « mandant », sans compte) dans la Résidence Les Essais à
Massy, et loue le T2 A12 à Camille.</div>
<div class="carte"><b>🔑 Le locataire de l'agence</b> — Camille Roussel. Elle entre dans le T2 A12, retrouve son
bail et ses quittances, signale une fuite sous l'évier.</div>
<div class="carte"><b>🏠 Le propriétaire bailleur</b> — Sophie Lemaire gère seule ses deux biens (Corbeil-Essonnes et
Étampes), sans agence. Elle loue son T2 à Thomas et <b>paie son abonnement pour de vrai</b>.</div>
<div class="carte"><b>🔑 Le locataire du propriétaire</b> — Thomas Girard. Il entre dans le T2 de Sophie, reçoit ses
quittances, signale un radiateur en panne.</div>
<div class="carte"><b>🔧 L'artisan</b> — Karim Haddad, plombier-chauffagiste. Il s'inscrit, est validé par Gerimmo,
puis répare la fuite (pour l'agence) et le radiateur (pour Sophie).</div>
<div class="carte"><b>🛡 Le coordinateur</b> — Tahir, côté supervision de Gerimmo : il ouvre l'agence, valide
l'artisan, lit et répond à vos signalements. C'est lui qu'on prévient en cas de blocage.</div>
</div>

Les tests sont **enchaînés** : Camille ne peut pas se connecter avant que l'agence l'ait invitée, l'artisan ne peut
pas faire de devis avant qu'un incident existe… Chaque test qui attend quelqu'un porte la pastille
<span class="pastille alerte">⏳ Dépend d'un autre testeur</span> et dit qui attendre.

## 5. Les règles du jeu

1. **Vous êtes votre personnage.** Nom, date de naissance, adresse, pièces : tout vient de « Mon personnage ».
   Ne saisissez jamais vos vraies pièces, vos vrais bulletins ni votre vrai RIB.
2. **Seule votre adresse e-mail est réelle** : Gerimmo envoie de vrais courriels (invitation, confirmation,
   quittances…). Pour les personnages secondaires, on utilise des **alias « + »** de votre adresse, par exemple
   `prenom.nom+mandant@gmail.com` : le courriel arrive dans votre boîte habituelle. Ça marche avec Gmail, Outlook et
   Hotmail ; si votre messagerie ne l'accepte pas, dites-le au coordinateur.
3. **Mot de passe : 12 caractères minimum**, et pas un mot de passe connu des fuites de données (Gerimmo le refuse).
   Prenez-en un nouveau, que vous n'utilisez nulle part ailleurs.
4. **Ordinateur ET téléphone** : certains tests se font au téléphone (déclarer un incident avec une photo, faire le
   compte rendu d'une intervention). Transférez les photos du dossier sur votre téléphone à l'avance (AirDrop,
   e-mail à vous-même, Drive…).
5. **Aucun virement de loyer** : le loyer ne se paie pas dans Gerimmo. Les IBAN affichés sont **fictifs** (banque
   99999). C'est le gestionnaire qui saisit le paiement « comme s'il avait été reçu ».
6. **Un fichier = un dépôt** : Gerimmo refuse de ranger deux fois le même fichier. Si un dépôt échoue, ne
   réessayez pas le même fichier en boucle : utilisez la copie de secours prévue, ou signalez-le.
7. **Ne cassez pas le travail des autres** : ne supprimez rien qui ne vous appartient pas, sauf si le test le dit.
   Pour le reste, n'ayez pas peur : trouver ce qui casse, c'est le but.
8. **Certaines choses arrivent le lendemain matin** : envoi automatique des quittances, rappels de rendez-vous,
   relances. Si un résultat « n'arrive pas », vérifiez le lendemain avant de signaler.
9. **Les CSV du dossier ne s'ouvrent pas dans Excel pour être enregistrés** : Excel en change l'encodage et
   Gerimmo ne les lirait plus. Déposez-les tels quels.

## 6. Le calendrier de la recette

<div class="chrono">
<div class="j">J0</div><div><b>Coordinateur</b> : vérifie la plateforme, ouvre l'agence, envoie les dossiers.</div>
<div class="j">J1</div><div><b>Chacun s'installe, en parallèle.</b> Agence : compte, profil, résidence, lots,
diagnostics, mandat. Propriétaire : inscription, profil, deux biens, diagnostics, abonnement (paiement réel).
Artisan : inscription et attestations — puis le coordinateur le valide. Locataires : rien encore.</div>
<div class="j">J2</div><div><b>Mise en location.</b> L'agence invite Camille, la propriétaire invite Thomas ; baux,
bail signé, état des lieux d'entrée, dépôt de garantie. Les locataires ouvrent leur espace, déposent leurs pièces
et leur assurance. L'agence et la propriétaire ajoutent l'artisan à leur réseau.</div>
<div class="j">J3</div><div><b>Loyers.</b> Terme d'octobre appelé, paiements saisis, quittances et reçus envoyés ;
les locataires les retrouvent dans leur espace.</div>
<div class="j">J3–J5</div><div><b>Incidents.</b> Camille signale une fuite, Thomas un radiateur froid ; qualification,
devis de l'artisan, choix du créneau par le locataire, intervention, compte rendu, facture, clôture, évaluations.</div>
<div class="j">J5–J7</div><div><b>Gestion courante et fin.</b> Messages, documents, charges, comptabilité et clôture
du mois, rapport de gestion, aide fiscale, imports ; pour finir, congé de Camille, état des lieux de sortie et
restitution du dépôt.</div>
</div>

Le coordinateur fixe les vraies dates et prévient chacun quand son tour arrive.

## 7. Les paiements sont réels

> [!paiement] Qui paie quoi
> - **Propriétaire bailleur** : le premier bien est offert à vie, chaque bien suivant coûte
>   **{str(t['proprietaire_par_bien']).replace('.', ',')} € par mois**. Avec deux biens, l'abonnement est donc de
>   {str(t['proprietaire_par_bien']).replace('.', ',')} € par mois.
> - **Agence** : facturée selon les lots sous mandat actif — **{int(t['agence_forfait_10_lots'])} € par mois** jusqu'à
>   10 lots — seulement si le coordinateur a ouvert l'agence en période d'essai.
> - **Locataires et artisan** : ne paient jamais rien dans Gerimmo.
>
> Le paiement se fait par carte sur la page sécurisée de Stripe. Pendant l'essai ({t['essai_jours']} jours,
> {t['essai_parrainage_jours']} avec un code de parrainage), la carte est enregistrée et **débitée à la fin de
> l'essai** — la date exacte est affichée ; l'abonnement apparaît « actif » tout de suite. On résilie à tout moment
> depuis ⟦m|Mon abonnement⟧ → ⟦b|Gérer mon abonnement⟧. **Le coordinateur vous dit, avant le test, comment ces
> sommes sont prises en charge** (il peut rembourser depuis Stripe) : en cas de doute, demandez-lui avant de payer.

## 8. Les courriels que vous allez recevoir

Expéditeur Gerimmo (ou le nom de l'agence, pour les locataires de l'agence). **Regardez aussi dans les
indésirables** et ajoutez l'expéditeur à vos contacts.

| Courriel | Qui le reçoit |
|---|---|
| « Votre accès Gerimmo » (lien pour choisir son mot de passe) | agence, locataires invités, agent |
| « Confirmez votre adresse » | propriétaire, artisan (inscription en ligne) |
| Avis d'échéance, quittance ou reçu, relance d'impayé | locataires |
| Rappel d'intervention (la veille) | locataire et artisan |
| Votre bail signé est disponible | locataires |
| Votre rapport de gestion | le mandant (alias « +mandant » du testeur agence) |
| Reçus Stripe, prélèvement non passé | propriétaire (et agence si elle paie) |

## 9. En cas de souci

- **Un problème, une question, une idée** : « Aide et retours », dans Gerimmo (fiche de remontée).
- **Vous êtes bloqué et ne pouvez même pas signaler** : prévenez le coordinateur (plan B de la fiche de remontée).
- **Vous avez un doute sur une donnée** : tout est dans « Mon personnage ».
"""


def guide() -> str:
    t = U.TARIFS
    a = U.ARTISAN_ENTREPRISE
    return f"""
<div class="couverture"><div class="sur">Kit de recette Gerimmo · pour le coordinateur</div>
<h1>Guide du coordinateur</h1>
<div class="sous">Ce que toi seul peux faire : préparer la plateforme, ouvrir l'agence, valider l'artisan, répondre
aux signalements, encadrer les paiements réels, puis tout remettre en ordre.</div></div>

## 1. Le dispositif en un coup d'œil

| Dossier | Personnage | Comment le compte naît | Dépend de toi pour… |
|---|---|---|---|
| 01 Agence immobilière | Nadia Bensaïd (Horizon Gestion) | **Toi**, depuis la console : « Ouvrir une organisation » | l'ouverture de l'organisation |
| 02 Locataire de l'agence | Camille Roussel | Invitée par l'agence depuis sa fiche | — |
| 03 Propriétaire bailleur | Sophie Lemaire | Inscription en ligne sur {U.SITE}/inscription | le remboursement de l'abonnement |
| 04 Locataire du propriétaire | Thomas Girard | Invité par la propriétaire depuis sa fiche | — |
| 05 Artisan | Karim Haddad (Haddad Plomberie Chauffage) | Inscription en ligne sur {U.SITE}/artisan/inscription | **la validation** (SIRET puis inscription) |

Le testeur agence fait aussi vivre trois personnages secondaires, par alias « + » de son adresse : **Bernard
Fontaine** (mandant, reçoit le rapport de gestion), **Philippe Roussel** (garant) et, s'il le souhaite, **Julien
Marchetti** (agent). Remplis `Tableau-d-affectation.xlsx` avant tout.

## 2. Avant de lancer (J-2 → J0)

> [!warning] Deux vérifications qui conditionnent les paiements réels
> 1. **Stripe en mode réel** : dans ⟦m|Santé⟧ (`/admin/sante`), la clé Stripe doit apparaître comme **clé réelle** —
>    une clé de test afficherait « aucun paiement réel ne passera ». Le webhook doit être posé.
> 2. **Portail client Stripe activé** dans le tableau de bord Stripe (réglage à faire une fois) : sans lui, le bouton
>    ⟦b|Gérer mon abonnement⟧ (changer de carte, résilier) échoue.

1. `/admin/sante` : aucun manque ; les tâches du matin « à l'heure ».
2. Courriels d'authentification : un « mot de passe oublié » sur ton propre compte arrive bien.
3. **Pages légales** : les mentions légales et les CGU gardent des passages à compléter (éditeur, SIRET, médiateur,
   facturation). Sans incidence pour une recette entre amis ; à compléter avant d'encaisser de vrais clients.
4. **Tableau d'affectation** rempli : un testeur par dossier, son adresse, ses appareils ; vérifie que l'adresse du
   testeur agence accepte les alias « + ».
5. **Prise en charge des paiements** décidée et annoncée : propriétaire {str(t['proprietaire_par_bien']).replace('.', ',')} €/mois
   (2 biens), agence {int(t['agence_forfait_10_lots'])} €/mois jusqu'à 10 lots sous mandat actif si tu l'ouvres en essai.
6. **Ouvrir l'agence** : ⟦m|Clients⟧ → `/admin/organisations/nouvelle` (« Ouvrir une organisation ») :

    - ⟦c|Nom de l'organisation⟧ : ⟦v|{U.AGENCE['nom_organisation']}⟧
    - ⟦c|Type⟧ : ⟦v|Agence de gestion⟧
    - ⟦c|Adresse du premier responsable⟧ : l'adresse **réelle** du testeur agence
    - ⟦c|Démarrage⟧ : **essai de {t['essai_jours']} jours** (l'agence pourra souscrire pour de vrai, débit à la fin de l'essai)
      **ou** « Contrat déjà signé — ouvrir directement en abonnement actif » (aucun paiement agence).
      Astuce : pour voir un débit réel **pendant** la recette, mets un essai court (3 jours) : quand il reste moins
      de 48 h d'essai, Stripe débite dès la souscription.
    - ⟦b|Ouvrir l'organisation⟧ → le testeur reçoit « Votre accès Gerimmo ».

7. **Envoyer les dossiers** : un ZIP par testeur (`zips/`), avec le message du § 8.

## 3. Pendant la recette — chaque jour

> [!danger] Les signalements ne te préviennent pas
> Aucune notification n'arrive quand un testeur écrit dans « Aide et retours ». Les nouveaux problèmes sont classés
> **« Majeur » par défaut** et n'apparaissent pas dans ⟦m|Aujourd'hui⟧ (seuls les « Bloquant » y remontent).
> Ouvre **⟦m|Développement⟧ → ⟦m|Retours des utilisateurs⟧** (`/admin/retours`) **matin et soir**.

**Traiter un signalement** : lire « Écran » et le titre (les testeurs y mettent `[BLOQUANT]`, `[GÊNANT]` ou
`[DÉTAIL]`) → ⟦c|Gravité⟧ → ⟦c|Décision⟧ (En examen / En cours de traitement / Résolu) → ⟦c|Réponse visible dans le
suivi⟧ → ⟦b|Enregistrer la décision⟧. Gerimmo **n'envoie pas de courriel** au testeur : préviens-le (WhatsApp) qu'une
réponse l'attend. Les signalements de problème sont supprimés au bout de six mois : recopie ce qui mérite un ticket.

**Valider l'artisan (J1, dès qu'il a déposé ses attestations)** — ⟦m|Artisans à valider⟧ (`/admin/artisans`) :

1. Carte « {a['raison_sociale']} », SIRET ⟦v|{a['siret_lisible']}⟧ (fictif, 14 chiffres) : ⟦b|Enregistrer le SIRET comme
   vérifié⟧ après avoir coché « J'ai vérifié l'existence et l'identité de l'entreprise correspondant à ce SIRET ».
   Pour la recette, l'entreprise est fictive : c'est le geste qu'on teste, pas l'entreprise.
2. Ouvrir les justificatifs : décennale et RC pro (obligatoires, en cours jusqu'au 31/12/2026), URSSAF, Kbis.
3. Cocher « J'ai relu les justificatifs… » puis ⟦b|Valider l'inscription⟧. Sans décennale **et** RC pro en cours,
   Gerimmo refuse.

**Faire avancer le fil** : quand un testeur termine une étape dont un autre dépend (invitation envoyée, incident
qualifié, devis retenu…), préviens le suivant. Le fil rouge est au § 6 de « À lire en premier ».

**Surveiller** : `/admin/sante` (tâches du matin), et les journaux Vercel quand un testeur cite une « réf. » d'erreur.

## 4. Les paiements réels

| Qui | Montant | Quand la carte est débitée |
|---|---|---|
| Propriétaire (2 biens) | {str(t['proprietaire_par_bien']).replace('.', ',')} €/mois (1ᵉʳ bien offert, quantité = biens − 1) | à la fin de son essai de {t['essai_jours']} jours ({t['essai_parrainage_jours']} avec un code de parrainage) |
| Agence ouverte en essai | {int(t['agence_forfait_10_lots'])} €/mois jusqu'à 10 lots sous mandat actif | à la fin de l'essai (tout de suite s'il reste moins de 48 h) |

- Pendant l'essai, la souscription enregistre la carte et passe le compte « Abonnement actif » **sans rien
  débiter** : c'est normal, préviens les testeurs.
- La console n'affiche aucun montant : paiements, factures et remboursements se voient dans **Stripe**.
- **Rembourser** : Stripe → Paiements → le paiement → Rembourser. **Résilier** : Stripe → Abonnements → Annuler, ou
  le testeur via ⟦b|Gérer mon abonnement⟧. À la fin de la période, le compte repasse en lecture seule.
- Point connu : une réactivation venue de Stripe peut rouvrir une organisation que tu avais suspendue à la main.

## 5. Après la recette

1. Rembourser et résilier ce qui doit l'être.
2. Trier les signalements restants ; transformer les vrais défauts en tickets de correction.
3. Décider du sort des données : organisations « {U.AGENCE['nom_organisation']} » et « {U.PROPRIETAIRE_ORG['nom_organisation']} », comptes
   des testeurs, artisan fictif (SIRET {a['siret_lisible']}). L'archivage se fait depuis la fiche de l'organisation
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
"""
