<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->

# À lire en premier

<div class="couverture"><div class="sur">Kit de recette Gerimmo · pour tous les testeurs</div>
<h1>Merci de tester Gerimmo !</h1>
<div class="sous">Tout est prêt pour vous : un personnage fictif, tous ses documents, et une fiche qui dit quoi
faire, écran par écran. Vous n'avez rien à fournir de personnel — sauf votre adresse e-mail.</div></div>

## 1. Gerimmo en deux phrases

Gerimmo est une application de **gestion locative** : une agence immobilière ou un propriétaire y gère ses biens,
ses baux, ses loyers et quittances, ses incidents et les artisans qui les réparent ; le locataire y retrouve son
bail, ses quittances et signale ses problèmes ; l'artisan y reçoit ses missions. Elle est en ligne sur
**https://www.gerimmo.app**, et c'est **la vraie application** que vous allez tester.

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
>   **5,99 € par mois**. Avec deux biens, l'abonnement est donc de
>   5,99 € par mois.
> - **Agence** : facturée selon les lots sous mandat actif — **39 € par mois** jusqu'à
>   10 lots — seulement si le coordinateur a ouvert l'agence en période d'essai.
> - **Locataires et artisan** : ne paient jamais rien dans Gerimmo.
>
> Le paiement se fait par carte sur la page sécurisée de Stripe. Pendant l'essai (14 jours,
> 30 avec un code de parrainage), la carte est enregistrée et **débitée à la fin de
> l'essai** — la date exacte est affichée ; l'abonnement apparaît « actif » tout de suite. On résilie à tout moment
> depuis **Mon abonnement** → **[Gérer mon abonnement]**. **Le coordinateur vous dit, avant le test, comment ces
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
