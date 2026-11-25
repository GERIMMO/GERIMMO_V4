# Parcours de vérification après la publication

**Pour :** le dirigeant, qui le fait lui-même, en production, juste après la publication.
**Rédigé le :** 25/11/2026, à partir du code de `89cb87ff` (lu en lecture seule, rien exécuté). La version préparée est maintenant `062296e2` : ses changements ne touchent aucun écran de ce parcours (seules changent la carte « Mon logement » et l'aide du locataire, la façon dont une rubrique d'un dossier suit son ancre, et la balise de l'avertissement de l'artisan, sans changer aucun libellé ; `git diff 89cb87ff 062296e2 -- app/src`).
**Rien de ce parcours n'a été essayé en production.** Les libellés viennent du code. Un libellé que je n'ai pas pu lire est écrit entre crochets, « à vérifier ».

---

## En bref

- **Quand :** après votre message écrit « je valide la publication », une fois la publication faite. Dans le plan de publication (`livrables/PLAN-DE-PUBLICATION.md`, § 4) : c'est l'étape **R4 bis**, **après R1 à R4** (identité du vendeur saisie, conditions du 24 novembre archivées, mode vérifié, repères fiscaux) et **avant R5** (ouverture des envois automatiques).
- **Durée réelle :** tout ce qui est demandé ne tient pas en 15 minutes. Je préfère vous le dire.
  - **Partie A, l'essentiel : environ 17 minutes.**
  - **Partie B, documents du bail et espace locataire : environ 17 minutes de plus.** Elle demande un bail « actif », donc plus de saisie. Faites-la juste après, ou le lendemain.
  - Ces durées sont estimées. Je ne les ai pas chronométrées.
- **Ce parcours ne publie rien.** Il ne remplace pas la recette automatique (workflow GitHub « Recette de production avec nettoyage ») : elle reste à lancer comme d'habitude.
- **Ce que vous voyez à l'écran prouve ce que Gerimmo affiche. Cela ne prouve pas que le texte est juste en droit.** Les points de droit restent ouverts (`JURISTE.md`, partie 9).

## Les règles de ce parcours

1. **Que des données fictives.** Tout ce que vous saisissez commence par « TEST ». Aucune vraie personne, aucune vraie adresse.
2. **Aucun paiement.** Dans l'espace de test, ne cliquez jamais sur « Abonnement », « Abonnement et factures » ni sur un bouton de paiement. Ne lancez pas de signature électronique (service payant).
3. **Les e-mails ne vont qu'à vous.** Toutes les adresses du test sont **votre propre adresse e-mail avec un « + »** (explication ci-dessous). Ainsi, tout e-mail parti arrive dans votre boîte, et chez personne d'autre.
4. **Deux fenêtres séparées.** La console du super admin dans votre navigateur habituel. Le compte de test dans une **fenêtre de navigation privée**. Pour le locataire (partie B) : **un autre navigateur** (par exemple Firefox, ou votre téléphone).
5. **Aucun mot de passe écrit nulle part.** Choisissez les mots de passe du test dans votre gestionnaire de mots de passe. Ne les notez dans aucun document.
6. **À la moindre différence : vous arrêtez et vous prévenez.** Voir la section « Si une étape ne donne pas ce qui est écrit ».

## Avant de commencer (environ 3 minutes, hors chrono)

**L'adresse « + ».** Si votre adresse est `prenom.nom@gmail.com`, l'adresse `prenom.nom+gp-proprio@gmail.com` arrive dans la même boîte. Gerimmo accepte le « + » (lu dans le code). Gmail le fait d'habitude ; je ne l'ai pas essayé sur votre boîte.

| Élément fictif | Ce que vous saisissez |
|---|---|
| Compte propriétaire de test | Nom : `TEST-PUBLICATION` · e-mail : `votreadresse+gp-proprio@gmail.com` |
| Vos coordonnées de bailleur | `12 rue de l'Exemple`, `75000`, `Paris` (si le code postal est refusé : `75001`) · e-mail de contact : la même adresse `+gp-proprio` |
| Bien | Nom : `TEST — bien fictif` · même adresse fictive · année de construction : `2015` |
| Lot | Surface : `40` m² · pièces : `2` |
| Locataire 1 | `Alice` `TEST-EPOUX` · `votreadresse+gp-loc1@gmail.com` |
| Locataire 2 | `Bruno` `TEST-EPOUX` · `votreadresse+gp-loc2@gmail.com` |
| Bail | Type : colocation, contrat commun · date d'entrée : `01/12/2026` · loyer `800` € · charges `50` € · dépôt `800` € · jour d'échéance `5` |

**Pour la partie B seulement :** préparez **quatre PDF fictifs différents**. Ouvrez quatre pages publiques de gerimmo.app (par exemple Tarifs, Outils, Journal, Calcul de l'IRL), puis « Imprimer » → « Enregistrer en PDF ». Ils doivent être différents : Gerimmo refuse deux fois le même fichier. Ne prenez pas les pages Mentions légales ou Conditions (elles portent votre identité).

**Dans la console**, connectez-vous comme d'habitude (avec la double vérification).

---

## Partie A — l'essentiel (environ 17 minutes)

Une étape par ligne. Dans la dernière colonne, « Arrêtez et prévenez » veut dire : ne passez pas à l'étape suivante.

| N° | Durée | Ce que vous faites | Ce que vous devez voir | Si ce n'est pas le cas |
|---|---|---|---|---|
| A1 | 30 s | Fenêtre privée. Ouvrez `https://www.gerimmo.app/api/sante`. | Une ligne de texte avec `"ok":true`, `"base":true`, `"maintenance":false`. `"commit"` = les 7 premiers caractères du commit publié (celui donné au workflow « Publication contrôlée Gerimmo »). **Pas `81740de`** (l'ancienne version). | Arrêtez et prévenez. |
| A2 | 1 min | Ouvrez `https://www.gerimmo.app/mentions-legales`. | Titre « Mentions légales ». Ligne « Éditeur » : votre nom et prénom **suivis de « EI »**, tels que saisis (`DECISIONS-2026-11-24.md`, Q76). **Aucune ligne « Capital social ».** Lignes « SIREN » et « SIRET » avec les numéros saisis. Ligne « TVA » : « TVA non applicable, article 293 B du CGI ». Rubrique « Médiation de la consommation » : « Médiateur de la consommation : aucun organisme n'est désigné à ce jour. » **Encadré « Document en cours de finalisation » : attendu tant que les coordonnées de Vercel et de Supabase ne sont pas saisies dans la console** (rubrique « Prestataires » ; le plan, R1, n'en donne pas). Dans ce cas, des « (à venir) » apparaissent dans la rubrique « Hébergement », et **nulle part ailleurs** (lu dans `app/src/app/mentions-legales/page.tsx`). | Un « (à venir) » hors de la rubrique « Hébergement » : arrêtez et prévenez (une information du vendeur manque dans la console). |
| A3 | 30 s | Ouvrez `https://www.gerimmo.app/confidentialite`, puis `https://www.gerimmo.app/conditions`. | Confidentialité : sous le titre, « Dernière mise à jour : 24 novembre 2026. » Conditions : « Version du 24 novembre 2026, en vigueur depuis cette date. » Sur Confidentialité, l'encadré « Document en cours de finalisation » peut rester : il dépend d'une localisation de prestataire à saisir (plan, R1). | Une autre date ou une autre version : arrêtez et prévenez. |
| A4 | 30 s | Ouvrez `https://www.gerimmo.app/outils/calcul-irl`. Ne tapez rien. | Titre « Calcul de la révision de loyer (IRL) ». Champ « Loyer actuel hors charges » **vide**, avec seulement « Ex. 850 » en gris clair. Champ « Date de signature du bail ou de la dernière révision » vide. Aucun trimestre ni aucune classe DPE choisis. **Aucun montant, aucune lettre affichés.** | Arrêtez et prévenez. |
| A5 | 1 min 30 | Ouvrez `https://www.gerimmo.app/inscription`. Titre « Ouvrir mon espace propriétaire ». « Votre nom » : `TEST-PUBLICATION`. « Adresse e-mail » : l'adresse `+gp-proprio`. « Vous louez en tant que » : « Particulier ». Cliquez « Ouvrir mon espace ». | Avant le bouton, la phrase « Confirmez votre e-mail, puis choisissez votre mot de passe et acceptez les conditions générales d'utilisation et de vente. » Après le clic : « Vérifiez votre boîte mail : nous venons de vous écrire pour finir d'ouvrir votre accès. » Dans votre boîte, un e-mail « Confirmez votre adresse — Gerimmo » (regardez aussi les indésirables). | Pas d'e-mail après 3 minutes : arrêtez et prévenez (les e-mails de connexion ne partiraient pas). |
| A6 | 1 min 30 | Dans l'e-mail, cliquez « Confirmer mon adresse ». Sur la page qui s'ouvre, cliquez [« Confirmer mon adresse » ou « Choisir mon mot de passe » : à vérifier]. Page « Choisir mon mot de passe » : « Vous utilisez Gerimmo pour » = « Gérer mes propres biens ». Cochez la case. Tapez deux fois un mot de passe de 12 caractères au moins (« Nouveau mot de passe », « Confirmation »). Cliquez « Créer mon espace ». | La case « J'accepte les conditions générales d'utilisation et de vente. » est **décochée** au départ, et son lien ouvre les conditions. Après le clic, vous arrivez dans votre espace de test (« Tableau de bord »). | Si vous lisez « L'acceptation des conditions n'a pas pu être enregistrée. Réessayez. » : **arrêtez et prévenez tout de suite** (c'est le blocage d'inscription corrigé dans cette version). Tout autre message : arrêtez et prévenez. |
| A7 | 1 min 30 | Console (navigateur habituel) : ouvrez `https://www.gerimmo.app/admin/sante` (« Santé et connexions »). Regardez trois sections. | **« Versions des conditions »** : « Conditions générales d'utilisation et de vente, version du 24 novembre 2026 : archivée le … ». Dans la liste « Acceptations enregistrées pour une version qui n'est pas archivée », **aucune ligne « version du 24 novembre 2026 »** (d'anciennes versions peuvent y figurer : c'est attendu). **« Informations légales »** : « 3 à compléter (médiateur) », et rien en rouge « à fournir ». **« Paiements Stripe »** : si Stripe n'est pas relié, section en **ambre** avec « Stripe non relié ». Si vous l'avez relié : « 0 écarts · 0 réceptions à examiner ». | « pas encore archivée », une ligne « 24 novembre 2026 » non archivée, ou Stripe en vert alors qu'il n'est pas relié : arrêtez et prévenez. |
| A8 | 1 min | Console : ouvrez `https://www.gerimmo.app/admin/parametres` (« Paramètres généraux »). **Ne cliquez sur aucun bouton.** | Section « Envois automatiques d'e-mails » : pastille **« Tous fermés »**. Cinq lignes, chacune marquée **« Fermé »** : « Avis d'échéance du loyer », « Relance amiable d'un loyer impayé », « Rappel d'un rendez-vous d'intervention », « Relance d'une invitation de locataire », « Relance d'une demande de report de rendez-vous ». Section « Fonctions assistées par l'IA » : pastille **« IA activée »**, et **pas** la phrase « Ce serveur est en mode pilote ». | Un envoi « Ouvert » que vous n'avez pas ouvert : arrêtez et prévenez. « mode pilote » affiché : arrêtez et prévenez (le mode commercial n'est pas posé, décision Q16). |
| A9 | 30 s | Console : ouvrez `https://www.gerimmo.app/admin/marketing` (« Marketing et contenus »). | Carte « Vos canaux de diffusion », ligne Facebook. Si elle dit « À relier » ou « À vérifier » : **pas de colonne « À diffuser »**, aucun bouton « Publier maintenant », et une phrase comme « La Page Facebook n'est pas encore reliée à Gerimmo : la diffusion sur Facebook n'est pas proposée. » Si elle dit « Relié » : la colonne « À diffuser » est là, c'est normal. | Un bouton « Publier maintenant » alors que Facebook n'est pas « Relié » : arrêtez et prévenez. |
| A10 | 2 min | Fenêtre privée (compte de test) : menu « Biens & locations », puis « Ajouter un bien ». Encadré « D'abord, vos coordonnées de bailleur » : « Votre adresse », « Code postal », « Ville », « E-mail de contact » (valeurs fictives du tableau). Cliquez « Enregistrer et créer mon bien ». Formulaire du bien : « Nom du bien », « Adresse », « Code postal », « Ville », « Année de construction ». Puis « Suivant ». Lot : surface, « Nombre de pièces ». Cliquez « Créer le lot et continuer ». | Vous arrivez sur la page du lot. Si l'écran réclame d'autres champs, mettez des valeurs fictives. | Un refus que vous ne comprenez pas : arrêtez et prévenez. |
| A11 | 1 min | Sur la page du lot, cliquez « Commencer un bail ». Étape « Le bail » : « Type de bail » = « Colocation · contrat commun ». « Date d'entrée » = `01/12/2026`. Cliquez « Enregistrer et continuer ». | Le bail est créé en préparation. L'étape « Personnes » est accessible. | Arrêtez et prévenez. |
| A12 | 2 min 30 | Étape « Personnes », bloc « Locataires ». Cliquez « Choisir un locataire » : le formulaire « Créer une personne » s'ouvre. Saisissez Alice (Nom, Prénom, Adresse e-mail `+gp-loc1`, Adresse, Code postal, Ville). Cliquez « Créer cette personne », puis « Utiliser ce locataire ». Cliquez « Ajouter un colocataire », puis « Créer une personne ». Saisissez Bruno (e-mail `+gp-loc2`). Pour l'adresse, « Utiliser cette adresse ». Cliquez « Créer cette personne », puis « Ajouter ce locataire ». | Les deux locataires apparaissent dans le bloc « Locataires ». Un cadre apparaît sous eux, avec la case « Les deux locataires sont mariés l'un à l'autre, ou liés l'un à l'autre par un PACS, à la signature du bail (location consentie à eux seuls) », décochée, et un texte qui commence par « Article 8-1 de la loi du 6 juillet 1989 : ». | La case n'apparaît pas avec deux locataires : arrêtez et prévenez. |
| A13 | 1 min | Cochez la case. Cliquez « Enregistrer ce choix ». Rechargez la page. | Après rechargement, la case est **toujours cochée**. Le bouton « Ajouter un colocataire » a disparu. À sa place : « Case « mariés ou pacsés » cochée : ce bail est consenti à deux personnes. Décochez-la avant d'ajouter un troisième locataire. » | Case décochée après rechargement, ou bouton « Ajouter un colocataire » encore là : arrêtez et prévenez. |
| A14 | 1 min | Console, « Paramètres généraux », section « Fonctions assistées par l'IA » : cliquez « Désactiver l'IA ». Puis fenêtre de test : menu « Messages », rechargez la page. | Console : pastille « IA désactivée » et « Aucun appel à l'IA ne part, et rien n'est compté. » Fenêtre de test : **plus de « Demander à Gerimmo »**. À sa place : « Une question sur vos démarches ? », « Ces pages répondent aux questions les plus fréquentes. », et deux liens « Aide et questions fréquentes » et « Les règles à connaître ». | « Demander à Gerimmo » toujours là après rechargement : arrêtez et prévenez. **Rallumez l'IA (étape A15) avant de vous arrêter.** |
| A15 | 30 s | Console : cliquez « Réactiver l'IA ». Fenêtre de test : rechargez « Messages ». **N'envoyez pas de question** (un appel à l'IA coûte). | Console : pastille « IA activée ». Fenêtre de test : le bloc « Demander à Gerimmo » est revenu. | L'IA ne se rallume pas : arrêtez et prévenez (décision Q12 : IA laissée activée). |

**Fin de la partie A.** Si tout est bon, vous pouvez passer à l'étape R5 du plan (ouverture des envois), ou faire d'abord la partie B.

Au banc, la seconde passe complète (IA activée puis coupée) sur `89cb87ff` : 355 puis 354 parcours réussis au premier essai (3 ignorés) ; un seul défaut majeur confirmé (L-01, carte « Mon logement » du locataire), corrigé dans `f78e3a3f` (contenu dans `062296e2`).

---

## Partie B — documents du bail et espace locataire (environ 17 minutes)

Cette partie met le bail fictif « actif ». Elle dépose donc en production des diagnostics et un bail signé **fictifs** (vos PDF de pages publiques). Ils seront effacés avec le compte de test. Si vous ne voulez pas de ces documents fictifs en production, sautez la partie B : ses points restent vérifiés au banc seulement.

| N° | Durée | Ce que vous faites | Ce que vous devez voir | Si ce n'est pas le cas |
|---|---|---|---|---|
| B1 | 3 min | Page du lot, étape « Diagnostics ». Sur la ligne [du DPE : libellé exact à vérifier], cliquez « Ajouter le fichier ». Choisissez le 1er PDF fictif. [Date de réalisation : libellé à vérifier] = `01/11/2026`. [Classe DPE : libellé à vérifier] = `C`. Cliquez « Déposer ». Même chose sur la ligne [de l'ERP, état des risques : à vérifier], avec le 2e PDF. | Les deux lignes passent en « Disponible ». | Arrêtez et prévenez. |
| B2 | 5 min | Ouvrez le bail, étape « Loyer » : loyer `800`, charges `50`, dépôt `800`, jour `5`. « Situation du logement » = « Première location ». « Fixation initiale du loyer » = « Librement fixé ». « Révision annuelle du loyer (IRL) » = non. « Enregistrer et continuer ». Puis étape « Récapitulatif », carte « Contrat de location ». S'il est écrit « Complétez les informations signalées avant de préparer le contrat. », suivez chaque point signalé et mettez des valeurs fictives. Puis « Générer le PDF du bail ». | Le bouton « Générer le PDF du bail » devient cliquable, puis « Relire le contrat » apparaît. | La liste des manques ne se vide pas malgré vos saisies, ou la génération échoue : arrêtez et prévenez. |
| B3 | 1 min | Cliquez « Relire le contrat ». Lisez le titre, puis cherchez la partie « VII — Clause de solidarité ». | Titre : « Contrat de location » (et **pas** « Contrat commun de colocation »). Dans « VII — Clause de solidarité » : « Les locataires sont tenus solidairement et indivisiblement de l'exécution du présent contrat. » puis « La location est consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat : elle n'est pas une colocation au sens de l'article 8-1 de la loi du 6 juillet 1989, … ne s'applique pas. » **Dans cette partie, aucune phrase sur un délai de six mois.** Ce contrat est un spécimen : ne l'envoyez à personne. | Une phrase « six mois » dans la clause, ou le titre « colocation » : arrêtez et prévenez. |
| B4 | 1 min | Page du lot : « Gérer le statut du lot », puis « Mettre en location ». Revenez au bail, étape « Récapitulatif ». **N'utilisez pas** le panneau de signature électronique. Dans la carte « Bail signé », choisissez le 3e PDF fictif, puis « Déposer le bail signé ». | « Lot passé en « Disponible » ». Puis le bail affiche « Actif ». | « Mise en location bloquée — à corriger : … » qui ne disparaît pas après correction : arrêtez et prévenez. |
| B5 | 1 min | Page du bail, rubrique « Départ du locataire », carte « Congé ». **Ne générez aucune lettre.** | La phrase « Pour ce terme, le locataire doit avoir reçu le congé au plus tard le … ». Avec une entrée au 01/12/2026, j'attends un terme au 30/11/2029 et une date limite au **31/05/2029** (calcul fait à la main d'après la règle lue dans le code, non exécuté). | Pas de date limite affichée : arrêtez et prévenez. Date différente : notez-la et prévenez (c'est peut-être mon calcul qui est faux). |
| B6 | 2 min | Page du bail, rubrique « Dépôt de garantie », « Enregistrer un encaissement » : « Montant (€) » `800`, « Date » du jour, « Payé par » virement. Cliquez « Encaisser ». Puis, sur la ligne créée, « Reçu PDF ». **Aucun argent ne bouge : c'est une ligne dans Gerimmo.** | Le reçu s'ouvre. Titre « Reçu de dépôt de garantie ». Dessous : « Article 22 de la loi n° 89-462 du 6 juillet 1989 » (location vide). Dans « Conditions de restitution » : « Le montant du dépôt ne peut excéder un mois de loyer hors charges (plafond légal applicable à ce bail). » | « deux mois » sur ce bail vide : arrêtez et prévenez. |
| B7 | 1 min | Menu « Personnes », fiche d'Alice, carte « Accès locataire » : cliquez « Inviter comme locataire ». | Un e-mail « Votre invitation locataire Gerimmo » arrive dans votre boîte (adresse `+gp-loc1`). | Pas d'e-mail après 3 minutes : arrêtez et prévenez. |
| B8 | 2 min | **Dans un autre navigateur**, ouvrez l'e-mail et cliquez « Créer mon mot de passe ». Choisissez un mot de passe (12 caractères au moins), puis cliquez [« Choisir mon mot de passe » : à vérifier]. Sur la page de l'invitation, cliquez « Accepter l'invitation ». | Vous arrivez dans l'espace locataire. Menu : « Accueil », « Mon logement », « Mes documents », « Mes paiements », « Mes demandes »… | Arrêtez et prévenez. |
| B9 | 30 s | Menu « Mes documents ». | La page s'ouvre sans erreur, avec les onglets « À transmettre » et « Mes fichiers ». **Aucune carte « Documents à signer » ni « Un document à signer ».** | Une de ces cartes apparaît : arrêtez et prévenez. |

**Limite de l'étape B9, à connaître.** L'ancienne carte « Documents à signer » n'apparaissait que s'il restait une ancienne demande de signature (lu dans le code de la version en ligne, `81740dec`). La production n'en a aucune (contrôle en lecture du 24/11, refait le jour J avant la migration). Donc la carte serait absente aussi avec l'ancienne version. B9 prouve surtout que la page s'ouvre. Le retrait lui-même est vérifié au banc (lot D5 : tests et relecture des écrans).

---

## Si une étape ne donne pas ce qui est écrit

1. **Arrêtez-vous.** Ne passez pas à l'étape suivante.
2. **Faites une copie d'écran.** Notez l'heure et le numéro de l'étape.
3. **Prévenez Claude** dans la session de travail, avec la copie d'écran.
4. **N'ouvrez pas les envois automatiques** (étape R5 du plan) tant que le point n'est pas compris.
5. **Ne touchez à rien dans la base, ni chez Vercel.** Un retour en arrière est une décision à vous. Il suit `GUIDE-DE-REPRISE.md`, section 6, et le plan de publication. Il n'est pas automatique.
6. **Laissez le compte de test en place** : il sert à comprendre ce qui s'est passé. Il sera supprimé ensuite.
7. Exception : si vous vous arrêtez à l'étape A14, **rallumez d'abord l'IA** (A15).

---

## À supprimer ensuite (environ 5 minutes de gestes, puis 14 jours d'attente)

L'application n'efface pas un compte au clic. La fermeture se programme. L'effacement a lieu **14 jours plus tard, la nuit**, après la sauvegarde du jour. Elle reste annulable jusque-là (lu dans le code de la console, `/admin/donnees`).

1. **Le compte propriétaire de test** (`+gp-proprio`).
   - Dans la fenêtre de test : menu du compte, « Sécurité du compte », carte « Mes données personnelles », bouton « Gérer mes données et demander la fermeture de mon compte » (ou directement `https://www.gerimmo.app/compte/donnees`).
   - « Votre demande » = « Fermer mon compte ». « Précisions » (15 caractères au moins) : `Compte fictif du parcours de vérification du jour de publication.` Cliquez « Enregistrer ma demande ».
   - L'effacement emporte l'espace `TEST-PUBLICATION` : le bien, le lot, le bail, les fiches d'Alice et de Bruno, les PDF générés et déposés (diagnostics, bail signé fictif), l'encaissement fictif et son reçu, et l'acceptation des conditions de ce compte.
2. **Le compte locataire de test** (`+gp-loc1`), si vous avez fait la partie B. Il est séparé : il faut sa propre demande. Dans l'autre navigateur, espace locataire : « Mes données personnelles », puis la même demande « Fermer mon compte ».
3. **Une invitation restée sans réponse**, si vous n'êtes pas allé jusqu'à B8 : fiche d'Alice, « Annuler l'invitation ». Sinon, une fois l'envoi « Relance d'une invitation de locataire » ouvert, des relances partiraient (vers votre propre adresse).
4. **Dans la console** : `https://www.gerimmo.app/admin/donnees` (« Demandes sur les données »). Pour chaque demande : « Afficher le bilan sans rien effacer ». Vérifiez que le bilan ne parle que de l'espace `TEST-PUBLICATION` (1 bien, 1 lot, 1 bail, quelques personnes et documents). Puis « Programmer la fermeture ». Si le bilan cite autre chose, ne programmez rien et prévenez.
5. **L'IA** : vérifiez dans « Paramètres généraux » qu'elle est bien « IA activée ».
6. **Sur votre ordinateur** : supprimez les PDF fictifs et les PDF téléchargés (contrat spécimen, reçu). Les e-mails reçus aux adresses « + » peuvent être supprimés ; cela ne change rien à Gerimmo.
7. **Dans 15 jours** : `https://www.gerimmo.app/admin/donnees`, section « Fermetures de comptes ». Vérifiez que les deux fermetures sont faites.

**Ce qui reste, et qui est normal :**
- Pendant les 14 jours, l'espace de test compte dans vos chiffres (espaces clients, inscriptions de l'e-mail du matin). Avec un bail actif (partie B), Gerimmo peut aussi appeler un loyer fictif le 1er décembre et le signaler en retard. Aucun e-mail ne part pour ce loyer tant que l'espace de test n'a pas demandé les envois automatiques dans ses réglages : ne les demandez pas.
- Les journaux techniques gardent une trace des gestes du test, selon leur durée de conservation. Ils ne contiennent que des données fictives et vos adresses « + ».

---

## Ce qui est vérifié, ce qui est supposé

### Vérifié (et comment)

- **Les libellés cités sans crochets** : lus dans le code de `89cb87ff`, `git show 89cb87ff:<fichier>`, le 25/11 ; aucun de ces fichiers ne change dans `062296e2`. Principaux fichiers : `app/src/app/inscription/`, `app/src/app/nouveau-mot-de-passe/`, `app/src/lib/conditions-acceptation.ts`, `app/src/lib/lien-mot-de-passe.ts`, `app/src/app/mentions-legales/page.tsx`, `app/src/lib/editeur.ts`, `app/src/app/outils/calcul-irl/calculateur-irl.tsx`, `app/src/app/agence/[orgId]/baux/[bailId]/` (personnes, finalisation, congé, dépôt), `app/src/lib/solidarite-colocation.ts`, `app/src/lib/documents/modeles/` (bail vide, reçu de dépôt), `app/src/app/admin/sante/`, `app/src/app/admin/parametres/`, `app/src/app/admin/marketing/page.tsx`, `app/src/lib/diffusion-facebook.ts`, `app/src/components/assistant-prive.tsx`, `app/src/app/compte/donnees/`, `app/src/app/admin/donnees/`.
- **La version préparée** : `062296e2` vérifié en entier sur un banc local isolé : 16 578 tests réussis, seuls les 2 fichiers en échec attendus du banc ; 355 parcours navigateur réussis au premier essai, 3 ignorés (`JOURNAL.md`, entrée du 25/11 « CI GitHub : deux défauts d'écran qu'elle seule voyait (WebKit mobile, fiche de mission de l'artisan) »).
- **Les parcours navigateur qui couvrent ce parcours au banc** : inscription avec la case des conditions (`compte-securite`), case « mariés ou pacsés » (`bail-epoux-pacses`), dépôt d'un bail signé sur papier (`depot-bail-signe-papier`), envois automatiques (`envois-automatiques`). Source : `livrables/notes-banc/fusion/corrections-fusion-notes.md`, § 2 et § 9.2.
- **Le « + » dans une adresse e-mail est accepté par Gerimmo** : lu dans `app/src/lib/marque-organisation.ts` (`emailValide`).
- **L'ancienne carte « Documents à signer »** n'apparaissait que s'il restait une ancienne demande : lu dans `81740dec:app/src/app/locataire/[orgId]/documents/page.tsx`.
- **La fermeture d'un compte** : 14 jours, la nuit, annulable, lue dans `app/src/app/admin/donnees/programmer-fermeture.tsx` et `app/src/app/actions/fermeture-compte.ts`.

### Supposé ou non vérifié

- **Rien n'a été fait en production.** La production n'a pas été lue pour ce document.
- **Le commit servi après publication** : le plan fusionne en « squash ». Le commit publié sera donc celui de `main` après fusion, pas forcément `062296e2`. Supposé d'après `GUIDE-DE-REPRISE.md`, section 5.
- **L'état réel de Stripe, de la Page Facebook et du mode commercial en production** : inconnu. Les étapes A7, A8 et A9 décrivent les deux cas.
- **Ce qui est déjà saisi dans la console de production** (identité, coordonnées des prestataires) : non lu. L'encadré des mentions légales (A2) en dépend.
- **Les libellés entre crochets** : non lus. Je ne les ai pas trouvés dans le code avec certitude.
- **La date limite du congé (31/05/2029)** : calculée à la main d'après `app/src/lib/delai-conge-bailleur.ts`. Le calcul de la base n'a pas été exécuté pour ce cas.
- **L'enchaînement complet inscription → bien → bail → activation à l'écran** : son parcours navigateur (`premiere-location-continue`) est exclu de la suite générale. Il n'a pas été lancé lors des vérifications du 25/11 (`corrections-fusion-notes.md`, § 2). Les écrans peuvent donc demander un champ de plus que ce qui est écrit ici.
- **Les champs exigés pour générer le contrat (B2)** : ils dépendent de ce qui est déjà saisi. La liste exacte n'a pas été relevée pour un compte neuf.
- **Le code postal fictif `75000`** : peut-être refusé par le formulaire. Non essayé.
- **La réception des adresses « + » dans votre boîte** : comportement habituel de Gmail, non essayé sur votre boîte.
- **Les durées** : estimées, non chronométrées.
- **La CI de GitHub sur la version préparée** : verte sur `062296e2` sans aucune reprise (exécution n° 45591695035 : 16 620 tests, 355 parcours au premier essai, 75 parcours WebKit mobile, envois, vrai PostgREST et invitation artisan). La seconde passe complète porte sur `89cb87ff` (rapports : `livrables/notes-banc/passe2/`).
- **Aucun point de droit n'est présenté comme conforme.** Les textes affichés (mentions légales, clause de solidarité, date limite du congé, plafond du dépôt) suivent le recueil fourni, non recontrôlé sur Légifrance. Les questions ouvertes sont dans `JURISTE.md`, partie 9 (points 39 à 43 pour la case « mariés ou pacsés » et les conditions).

## Sources lues

`livrables/PLAN-DE-PUBLICATION.md` · `livrables/notes-banc/PLAN-PUBLICATION-NOTES.md` · `livrables/notes-banc/fusion/PLAN-PUBLICATION-NOTES.md` · `livrables/notes-banc/fusion/fusion-notes.md` · `livrables/notes-banc/fusion/corrections-fusion-notes.md` · `livrables/notes-banc/fusion/relecture-*.md` · `livrables/notes-banc/notes-majeurs.md` · `GUIDE-DE-REPRISE.md` · `JOURNAL.md` · `QUESTIONS.md` (Q75 à Q123) · `JURISTE.md` (sommaire, partie 9) · `DECISIONS-2026-11-24.md` · code de `89cb87ff` (lecture seule, `git show`).
