# Recette — test par sprint et persona

> Mis à jour le **2026-08-30**, à dérouler sur **https://gerimmo-v4.vercel.app**.
> **Fichier central de recette**, en deux parties :
> **1. Recetté OK** — ce qui est validé, on n'y revient plus.
> **2. Reste à recetter** — d'abord la **livraison du 30/08** (Sprint 9a
> propriétaire direct + sprint « Alertes & documents »), puis la **livraison
> du 29/08** (alertes liées à leur événement — le scénario 29.1 « Valider »
> est remplacé par 30.5), puis l'**anomalie du 26/08** (bail
> signé) et la **livraison du 26/08 au soir** (« Mes documents » locataire +
> refonte « Documents » agence), puis le reliquat du **Sprint 7 — Incidents**,
> puis ce qui reste des étapes précédentes et les sprints jamais déroulés.
>
> Mot de passe commun : `Gerimmo-Demo-2026`.
> Périmètre réel : S3 → S8 **incidents inclus** — le S7 est développé et
> mergé sur main le 23/08 (branche `sprint7-incidents`).
>
> **Méthode itérative** : re-tests des correctifs d'abord, puis un sprint à la
> fois, persona par persona. Les numéros reprennent ceux du document du 05/08
> ([[Recette S3-S8 - scenarios]]).
> Limite connue (pas une anomalie) : SMTP non configuré → constater que l'écran
> propose l'envoi et l'enregistre suffit.
> **Cloche retirée le 30/08** : partout où un scénario antérieur dit « la cloche »,
> lire « l'onglet Alertes (badge) » dans l'espace agence, et le lien « Alertes »
> de l'en-tête sur « Mes espaces » et la console SA.

---

# Partie 1 — Recetté OK (ne plus re-tester)

> Trace des scénarios **validés en recette humaine**, gardée ici pour la vision
> d'ensemble. Le détail des scénarios sortis du corps du document reste dans
> git et dans `log.md`.

- **08/08 — Bloc 0 (non-régression S0–S2)** : 0.1, 0.2, 0.3 **validés**.
- **13/08 — Étape correctifs + début du Sprint 3** : **validés** C.2, C.3,
  C.4, C.5 (étapes 1-3 et 5), C.7 ; 3.2 (étapes 1 et 3) ; 3.3 (étapes 1-4).
- **22/08 — Re-tests des correctifs du 13/08 (étape 1)** : **validés** C.1,
  C.5.4, C.6 (1, 2 et 3 considéré OK), C.8, 3.2.2, 3.3.5 — l'étape 1 est
  soldée.
- **22/08 — Passe charte du 19/08 (étape 2, partiel)** : **validés** G.1
  (journal comptable), G.5 (espace locataire dans la charte), G.6 (console).
  Restent G.2, G.3, G.4 (jamais déroulés — voir Partie 2).
- **22/08 — Améliorations UX du 21/08** : **validés** B.1 (étapes 2 et 3),
  B.2 (combobox lot), B.3 (EDL par section). B.1.1 restait à tester ; B.4 a
  été refondu le 23/08 (voir étape 4).
- **22/08 — Sprint 3 (partiel)** : **validés** 3.4.1 (alerte critique défaut
  d'assurance), 3.5.1 (invitation — contenu de la notification : voir note en
  Partie 2), 3.4 côté locataire (étapes 1 et 2).
- **22/08 — Sprint 4 (le gros du sprint)** : **validés** 4.1 (chaîne
  d'activation complète), 4.2 (garde-fous juridiques), 4.3 (bail meublé),
  4.5 (étapes 1, 2 et 4), 4.6 (étapes 4 et 5 ; étape 3 OK sauf l'alerte,
  restée à vérifier), 4.7 côté agent (comparatif EDL).
- **24/08 — Étape 4 (correctifs du 23/08)** : **validés** D.1 (régénération
  de grille d'EDL), D.2 (formulaires qui ne se vident plus), D.3 (mandat :
  lot et taux obligatoires), D.5 (doublon GED), D.6 (vue macro des baux),
  D.7 (espace locataire refondu). D.4 validé sur le fond mais refondu le
  24/08 (pop-up sur l'écran courant — re-test en étape 5).
- **24/08 — Sprint 7 (partiel)** : **validés** 7.1 (étapes 2 et 3), 7.2
  (étape 1 ; étape 2 hors colocataire), 7.3 (étapes 1 et 3), 7.4 (étapes
  1 à 4 ; étape 5 restant à tester en responsable d'agence). Les points UI
  remontés (7.1.1, 7.3.2, 7.3.4) sont traités le 24/08 — re-tests en étape 5.
- **26/08 — Étape 5 (correctifs du 24/08)** : **validés** E.1, E.2, E.3
  (étapes 1 et 3 ; étape 2 acceptée en l'état — point d'alignement gardé
  pour plus tard, voir « Points gardés pour plus tard »), E.4 — **l'étape 5
  est soldée**.
- **26/08 — Sprint 7** : **validé** 7.4.5 (attribution en responsable) —
  ne reste que 7.2.2 (colocataire).
- **26/08 — Étape 2 (passe charte du 19/08)** : **validés** G.2, G.4 et
  G.3.1 ; G.3.2 (suppression d'encaissement refusée sur mois clôturé) testé
  partiellement — semble OK, pas assez de recul en mois clôturés, à
  confirmer au sprint 6. **L'étape 2 est soldée.**
- **26/08 — Sprint 3** : **validé** 3.4.2 (l'ancienne alerte critique est
  conservée après redépôt) — le scénario 3.4 est soldé.
- **26/08 — Sprint 5 (début)** : **validés** 5.1 (étapes 1 et 2 — prorata au
  centime conforme ; à repasser en non-régression), 5.3 (étapes 1 et 2,
  côté locataire).

---

# Partie 2 — Reste à recetter

## 2.00 — Livraison du 30/08 : Sprint 9a (propriétaire direct) + sprint « Alertes & documents »

> Deux sprints développés, revus, vérifiés en base (scénarios SQL déroulés en
> transaction annulée sur la base de production, 18/18 verts) et déployés le
> 30/08. **Point d'attention** : la CI ne joue pas les tests d'intégration
> (`SUPABASE_DB_URL` absent des secrets — `npm test` dure 9 s) ; les suites
> vitest correspondantes existent (`sprint9a-proprietaire-direct`,
> `sprint4-bail`, `alertes-origine`, `mes-documents-locataire`) et tourneront
> dès que le secret sera renseigné.

#### Persona : Propriétaire bailleur en gestion directe (nouveau compte)

**Scénario 30.1 — S'inscrire seul et ouvrir son espace**
1. Page de connexion → lien « Propriétaire bailleur ? Ouvrir mon espace » → `/inscription` (écran scindé, promesse « 14 jours d'essai, sans carte bancaire »).
2. Renseigner Prénom `Claire`, Nom `Moreau`, une adresse email réelle à vous, mot de passe `Recette-Claire-2026!`, confirmation identique, cocher les conditions → « Ouvrir mon espace ».
3. Résultat attendu : message « Vérifiez votre boîte mail : un lien de confirmation vient de vous être envoyé. Votre espace s'ouvrira au premier clic. » (la confirmation d'email est exigée par le projet).
4. Cliquer le lien reçu → arrivée directe dans l'espace : bandeau « **Espace propriétaire** · Parc de Claire Moreau », bandeau d'essai « Essai gratuit jusqu'au JJ/MM/AAAA (14 jours restants) », onglets **Tableau de bord · Mes lots · Incidents · Locataires · Livre · Documents · Alertes**.
5. Recommencer l'inscription avec la **même adresse** → refus « Un compte existe déjà pour cette adresse : connectez-vous, ou réinitialisez votre mot de passe. »
6. Mot de passe de 8 caractères → refus « Le mot de passe doit compter au moins 12 caractères. » ; confirmation différente → « Les deux saisies ne correspondent pas. » ; sans les conditions → « Acceptez les conditions d'utilisation pour continuer. » (la saisie reste posée).

**Scénario 30.2 — Gérer seul : bien, locataire, bail, loyer (bout en bout)**
1. **Mes lots** → créer un bien (appartement, 45 m², 2 pièces) → le lot naît ; détention : la fiche « Claire Moreau » (créée à l'inscription) à **100 %** ; déposer un DPE et un ERP valides → lot **Disponible**.
2. **Locataires** → « Nouvelle personne » `Julie Leblanc` avec email → la fiche se crée (droit ouvert au S9a ; avant, un propriétaire ne pouvait pas créer de fiche). La fiche **ne montre pas** de carte « Mandats de gestion ».
3. Fiche du lot → créer un bail nu (loyer 650 €, charges 50 €, dépôt 650 €) → brouillon ; carte « Bail signé » → déposer un PDF → « Bail signé déposé — le bail est actif, le lot est loué. L'état des lieux d'entrée reste à signer : une alerte le rappelle. » ; onglet **Alertes** : badge 1, alerte « État des lieux d'entrée — … · Julie Leblanc ».
4. Carte « Loyers » → générer l'échéancier → encaisser l'appel du mois en totalité → **Livre** : une seule écriture « loyer » (recette), **aucune ligne « honoraires »** ; KPI Recettes = montant encaissé.
5. **Livre** → saisir une dépense `Assurance PNO`, 180 €, date de pièce du jour → journal à jour ; « Clôturer le mois » → « Mois clôturé. » ; tenter d'ajouter une écriture imputée sur ce mois → refus « Mois clôturé : imputez au mois ouvert ou passez une contre-écriture (RM-4.4.1) ».
6. Lien « Récapitulatif fiscal AAAA (déclaration 2044) → » : ligne **211** = loyers encaissés, **223** = 180,00 €, **250 Intérêts d'emprunt** = « à compléter par vos soins », revenu foncier net = loyers − 180 ; les liens d'années (AAAA-2, AAAA-1, AAAA) filtrent.
7. Vérification d'isolation : se connecter en `agent.alpha@` → onglet Personnes → **aucune** trace de Claire Moreau ni de Julie Leblanc ; en Claire → **aucune** fiche de l'Agence Alpha.

**Scénario 30.3 — Garde-fous du propriétaire direct**
1. En `admin.alpha@` (Agence Alpha) : créer une personne avec **l'adresse email de Claire** → fiche « Mandats de gestion » → créer un mandat et l'envoyer en signature → refus « Cette personne gère déjà son parc en direct sur Gerimmo : elle ne peut pas être mandante (exclusivité PD/PM) » (le brouillon, lui, reste possible).
2. *(Contrôle en base, non visible)* une adresse déjà mandante d'une agence (mandat actif) qui s'inscrit → l'espace ne s'ouvre pas ; « Mes espaces » affiche « Votre espace propriétaire n'a pas pu être ouvert : Cette adresse est celle d'un propriétaire mandant … (exclusivité PD/PM) ».
3. Le propriétaire ne peut ni prolonger son essai ni s'activer lui-même : seul le super admin modifie statut/type/essai (message « Seul le super admin modifie le statut, le type ou l'essai d'une organisation »).
4. `superadmin@` → console → la fiche de l'organisation « Parc de Claire Moreau » apparaît avec le statut **Essai**.

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 30.4 — Le dépôt du bail signé active le bail (remplace 29.1)**
1. Fiche d'un lot **Disponible** → créer un bail nu → brouillon ; « À faire maintenant » liste : (déclarer les pièces) → signer l'EDL d'entrée (à la remise des clés) → **déposer le bail signé — il active le bail et loue le lot**. **Aucune carte « Valider le bail »** en bas de l'écran.
2. Carte « Bail signé » (libellé « son dépôt active le bail et loue le lot ») → déposer un PDF **sans** EDL d'entrée signé → « Bail signé déposé — le bail est actif, le lot est loué. L'état des lieux d'entrée reste à signer : une alerte le rappelle. » ; bail **Actif**, lot **Loué** ; onglet **Alertes** : « État des lieux d'entrée — <lot> · <locataire> », normale, échéance = date d'effet.
3. Carte « États des lieux » → créer l'EDL d'entrée, remplir, **signer** → l'alerte disparaît des ouvertes ; « Fermées récemment » : « Fermée automatiquement le … — « État des lieux d'entrée signé » » avec sa criticité, son type `edl_entree` et son origine `bail`.
4. Déposer le PDF sur un lot dont un diagnostic est **expiré** → refus **avant** dépôt « Mise en location bloquée — à corriger : » + lignes cliquables « Corriger → » (le PDF n'est pas stocké, le bail reste brouillon).
5. Sur un lot déjà loué, créer un second bail et déposer un PDF → refus « Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci ».
6. Déposer une image JPG → refus « Bail signé se dépose en PDF complet — une image d'une page ne vaut pas le document. »

**Scénario 30.5 — Prévisualiser, Envoyer, Corriger**
1. Bail actif, carte « Bail signé » : « Bail signé déposé — le bail est actif. » + boutons **Prévisualiser** / **Ouvrir dans un onglet**.
2. « Prévisualiser » → modale « Bail signé » (surtitre « Locataire : <email> »), le PDF s'affiche dans la modale ; pied : **Corriger** · **Envoyer au locataire**.
3. « Envoyer au locataire » → SMTP non configuré : message « Envoi email non configuré (…) Le bail reste disponible dans « Mes documents » du locataire. » (attendu tant que Resend n'est pas branché) ; avec SMTP : toast « Bail envoyé à <email>. » et la carte affiche « Envoyé au locataire le … », le bouton devient « Renvoyer ».
4. Locataire sans email → le bouton « Envoyer au locataire » est **grisé** (surtitre « Locataire sans email »).
5. « Corriger » → texte « Le bail revient en brouillon, le lot redevient disponible, le PDF est détaché. » + bouton **Confirmer la correction** → toast « Bail remis en brouillon — corrigez-le, puis redéposez le PDF signé. » ; bail **Brouillon**, lot **Disponible**, carte « Corriger le brouillon » de retour, alerte EDL fermée (« Bail remis en brouillon pour correction »).
6. Sur un bail actif dont l'échéancier a été généré : le bouton **Corriger** n'apparaît plus ; *(en base)* `devalider_bail` refuse « Ce bail a déjà vécu (loyers appelés ou encaissés) : il ne revient pas en brouillon — passez par un avenant ou un congé ».

**Scénario 30.6 — Alertes : une par objet, compteur de restitution, vue « traitées »**
1. Onglet **Alertes** → « Fermées récemment » affiche jusqu'à 30 alertes avec **criticité**, **type** et **origine** (ex. `diagnostic_expiration · diagnostic`), la date et le motif.
2. *(Cron, vérifié en base)* un diagnostic qui passe de J-90 à J-30 **met à jour** son alerte (criticité, titre, échéance) au lieu d'en créer une seconde ; une alerte fermée à la main n'est pas recréée au même seuil ; l'expiration (J+0) rouvre une alerte critique.
3. Restitution : bail en préavis → « Démarrer la restitution » (remise des clés datée de **25 jours** avant, conforme = 1 mois) → *(cron quotidien 4 h 15, ou en base)* alerte « Restitution du dépôt — <lot> · <locataire> : à rendre avant le JJ/MM/AAAA » (normale, échéance = date limite) ; dépassement → la même alerte devient **critique** « délai légal dépassé depuis le … (intérêts de retard dus) » ; « Finaliser le décompte » → elle se ferme (« Décompte finalisé ») et l'alerte « Décompte de restitution à envoyer » porte l'échéance légale.
4. En-tête de l'espace agence : **plus de cloche** ; la pop-up de synthèse s'affiche toujours à la connexion s'il y a des alertes confiées ; `multi@` → « Mes espaces » : lien **« Alertes (n) »** dans l'en-tête qui rouvre la synthèse ; `superadmin@` → console : même lien.

#### Persona : Locataire (locataire.alpha@)

**Scénario 30.7 — Les pièces du bail dans « Mes documents »**
1. L'agent dépose un **règlement de copropriété** (PDF) sur le bail actif de Julie → côté locataire, **Mes documents** liste « Règlement de copropriété · déposé le … » avec Ouvrir / Télécharger, à côté du bail signé.
2. « Ouvrir » affiche le PDF ; *(agence)* fiche de la pièce → visibilité « Agence et locataire ».
3. Une pièce « Courrier » rattachée à sa fiche reste **invisible** (le type pilote seul les droits — non-régression 26/08).
4. Bail **terminé** → le bail signé et le règlement disparaissent de « Mes documents » ; l'URL directe d'une de ces pièces répond « introuvable ».

**Scénario 30.8 — Parc : la sélection s'ouvre à côté de la liste (retour recette 30/08)**
1. Onglet **Parc** → vue d'ensemble à droite (KPI, répartition, éléments à compléter) ; cliquer l'**adresse d'un bien** → le bien s'ouvre **dans le panneau de droite** (type · ville, adresse, KPI Lots / Loyers en cours, liste « Lots du bien »), la liste reste à gauche, l'adresse est surlignée d'un liseré laiton ; l'URL porte `?sel=bien:…`.
2. Cliquer un **lot en préparation** → panneau du lot : puce d'état, encadré « N éléments manquants » avec boutons « … → » vers la bonne section, Propriétaire (quote-part), Occupant « libre » ; boutons **Ouvrir la fiche du lot** (page complète) et **Voir le bien**.
3. Cliquer un **lot loué** → « Lot complet. Bail en cours. », Occupant, ligne **Bail** cliquable (→ fiche bail), Loyer + charges.
4. « ‹ Vue d'ensemble » (ou « Vue d'ensemble » en tête de liste) → retour à l'aperçu. Le bouton « + Ajouter un bien » reste en tête.
5. Propriétaire direct (`proprietaire@gerimmo-demo.fr`) : même écran titré **« Mes lots »**, catalogue « Votre liste… ».

**Compte de démo ajouté le 30/08** : `proprietaire@gerimmo-demo.fr` / `Gerimmo-Demo-2026` (Parc de Claire Moreau, essai jusqu'au 13/09) — pour dérouler 30.2, 30.3 et 30.8.5 sans passer par l'inscription.

**Le test le plus important de la livraison** : 30.4 étape 4 — un PDF refusé au contrôle de mise en location **ne laisse rien derrière lui** (bail brouillon, lot disponible, rien en GED) : c'est ce qui rend acceptable la suppression du bouton « Valider ».

## 2.0 — Livraison du 29/08 : validation du bail + alertes liées à leur événement

> Deux décisions du 29/08, développées, revues, testées en base (CI) et
> déployées le jour même :
> 1. ~~**Le bail se valide** (bouton « Valider »)~~ — **caduc depuis le 30/08** :
>    le dépôt du bail signé active le bail (30.4). Restent vrais : la section
>    « Règlement de copropriété » (facultatif) ; un seul bail actif par lot, un
>    brouillon peut coexister.
> 2. **Une alerte automatique est liée à l'événement qui l'a créée** et se
>    ferme d'elle-même quand il est traité — motif conservé dans « Fermées
>    récemment » avec la mention « fermée automatiquement ».

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 29.1 — ~~Valider un bail~~ (remplacé le 30/08 par 30.4 et 30.5)**
Le bouton « Valider » et le prérequis « EDL d'entrée signé » ont été retirés le
30/08 (sprint « Alertes & documents ») : ne pas dérouler.

**Scénario 29.2 — Alertes fermées par leur événement**
1. Onglet **Alertes** : noter les alertes ouvertes. Chacune des actions ci-dessous doit faire **disparaître** l'alerte concernée des ouvertes et l'ajouter à « Fermées récemment » avec la mention **« fermée automatiquement »** et le motif.
2. **Assurance** : le locataire (locataire.alpha@) dépose une nouvelle attestation → les alertes d'expiration **de l'ancienne** se ferment (« Nouvelle version déposée : … ») ; la nouvelle alerte « Attestation à vérifier » porte la nouvelle version ; la valider la ferme (déjà en place).
3. **Diagnostic** : sur un lot dont un diagnostic expire (alerte J-90/J-30/J0), déposer un diagnostic du même type → toutes les alertes de l'ancien se ferment (« Diagnostic renouvelé ou archivé »).
4. **Versement** (Comptabilité) : envoyer un rapport de gestion → alerte « versement » ; enregistrer le versement du **bon montant** → l'alerte se ferme (« Versement de X € enregistré le … »). Enregistrer un montant **faux** → une alerte critique « Écart » ; ressaisir un autre montant faux → **toujours une seule** alerte d'écart (mise à jour) ; ressaisir le bon montant → « Écart régularisé — … ».
5. **Restitution** (bail en préavis/terminé avec EDL d'entrée signé) : ajouter une retenue **sans justificatif** → alerte ; sur la ligne, **« Joindre le devis / la facture »** → l'alerte se ferme (« Justificatif fourni pour la retenue « … » »). Ajouter une autre retenue sans justificatif puis **« Retirer »** → la ligne disparaît réellement et l'alerte se ferme (« Retenue « … » retirée »).
6. Finaliser le décompte → alerte « décompte à envoyer » ; sous le solde, **« Envoyé au locataire le [date] » → « Décompte envoyé »** → l'alerte se ferme (« Décompte envoyé au locataire le … ») ; date future → refus « Date d'envoi invalide » ; second clic → « Décompte déjà envoyé le … ».
7. **Congé** : bail actif → enregistrer un congé → alerte « EDL de sortie » datée ; créer et signer l'EDL de sortie → l'alerte se ferme (« État des lieux de sortie signé »).

> Non visible mais acté : les fermetures automatiques ne suppriment jamais
> l'alerte (historique 12 mois) ; les alertes **manuelles** ne sont jamais
> fermées automatiquement.

## 2.A — Anomalie du 26/08 : bail signé invisible côté locataire (4.7.1)

> Constat de recette du 26/08, persona LO : « Mon bail » ne permettait **pas
> de consulter le bail signé**. Cause : la consultation n'avait jamais été
> implémentée côté locataire (ni donnée, ni lien, ni route, ni droit de
> lecture). **Corrigé et déployé le 26/08** — à re-tester :
1. Accueil locataire → carte « Mon bail » → bouton **« Consulter mon bail
   signé »** → la pièce s'ouvre dans un nouvel onglet (jamais un brouillon —
   seul le PDF déposé à l'activation est servi).
2. Bonus agence (persona AG) : fiche d'un bail **brouillon** avec bail signé
   déposé → le lien **« Le consulter »** ouvre la pièce.

### Points gardés pour plus tard (non bloquants)

- **E.3.2** — le bandeau d'erreur de « Signaler un problème » n'est pas
  tout à fait conforme à l'attendu ; accepté en l'état le 26/08, à
  reprendre plus tard.
- **G.3.2** — refus de suppression d'encaissement sur mois clôturé : testé
  partiellement (pas assez de recul en mois clôturés), à confirmer au
  sprint 6.
- **5.1 (prorata au centime)** — validé le 26/08, à repasser lors des
  passes de **non-régression** des prochains sprints.

## 2.B — Livraison du 26/08 (soir) : « Mes documents » (LO) + « Documents » (AG)

> Réponse aux deux premiers écarts maquette du livrable
> [[Reste a faire V0 - sprints et ecarts maquette]] — dont ta demande sur les
> **deux attestations** (la validée reste visible pendant la vérification du
> renouvellement). Développée, **revue en deux passes**, testée par **trois
> passes d'intégration en base réelle (transactions annulées)** et déployée
> le 26/08. Le compte démo porte déjà le cas des deux attestations.

#### Persona : Locataire (locataire.alpha@)

**Scénario N.1 — Onglet « Mes documents »**
1. Nouvel onglet **« Mes documents »** (après « Mes loyers ») → la liste des
   pièces avec le compteur « N pièces à votre disposition » : le **bail
   signé**, les **attestations d'assurance**, les **quittances**.
2. « Ouvrir » sur le bail signé → la pièce s'ouvre dans un nouvel onglet ;
   « Télécharger » la télécharge sous son nom.
3. « Ouvrir » sur une quittance → la quittance s'affiche (page dédiée — pas
   de bouton Télécharger sur les quittances, assumé).

**Scénario N.2 — Deux attestations pendant un renouvellement**
> Le cas est en place sur le compte démo : une validée (expire le 28/08) +
> une en cours de vérification.
1. « Mes documents » montre **les deux** attestations : la **validée** (puce
   verte) ET la nouvelle **« En cours de vérification »** (puce ambre), avec
   la note « Votre attestation validée reste en vigueur… ». Une validée mais
   **expirée** porterait la puce rouge « Expirée ».
2. Accueil « Mon logement » → sous la ligne d'assurance, la mention « Votre
   attestation validée reste en vigueur pendant la vérification » + lien
   vers Mes documents.
3. Persona AG : **valider** la nouvelle attestation (fiche personne) → côté
   LO, **une seule** attestation reste : la nouvelle, « Validée ».

**Scénario N.3 — Le type pilote les droits** · AG puis LO
1. AG : déposer une pièce de type **« Courrier »** rattachée à la fiche de
   Leblanc → côté LO, elle **n'apparaît pas** dans « Mes documents » (type
   agence seule — seuls attestation, pièce d'identité et justificatif sont
   des pièces du dossier visibles).

#### Persona : Agent immobilier (agent.alpha@)

**Scénario N.4 — Documents en vue scindée (maquette)**
1. Onglet Documents → **liste à gauche** (rang : titre, type · date · taille
   · rattachements, **puce de conservation** — rouge quand l'échéance est à
   moins de 30 jours), **vue d'ensemble à droite** : carte « Pièces à
   renouveler », carte « Par type » (barre proportionnelle + **types
   cliquables** qui filtrent la liste).
2. Cliquer une pièce → sa **fiche** à droite : sur-titre TYPE · DÉPOSÉE LE,
   **aperçu du document**, carte **Rattachements** (puces des fiches), carte
   **Cycle de vie** (type, conservation, « Visible par »), Consulter /
   Télécharger.
3. « + Déposer une pièce » → le formulaire s'ouvre dans le volet droit.
4. Une pièce **purgée** reste cliquable → sa fiche de traçabilité RGPD.

**Scénario N.5 — Rattacher une pièce**
1. Fiche d'une pièce → « Rattacher à une autre fiche » → personne, lot ou
   bail → toast **« Pièce rattachée — elle apparaît désormais sur cette
   fiche. »**, la puce s'ajoute.
2. Re-rattacher la même fiche → refus : « Cette pièce est déjà rattachée à
   cette fiche. »

**Scénario N.6 — Remplacer : l'historique est conservé**
1. Fiche d'une pièce → « Remplacer » → nouvelle version (nouvelle date
   d'expiration proposée si la pièce en portait une) → la fiche s'ouvre sur
   la **nouvelle** version ; « Versions antérieures » liste l'ancienne.
2. Remplacer le **bail signé** d'un bail → côté LO, « Mes documents » et
   « Consulter mon bail signé » servent la **nouvelle** version (le pointeur
   du bail suit le remplacement).
3. Redéposer un fichier au contenu strictement identique → refus doublon
   avec le nom de la pièce existante.

> Décisions prises en revue, à confirmer en recette :
> - **l'accès du locataire s'éteint avec son adhésion** (un ex-locataire ne
>   consulte plus ses pièces) et le bail signé ne se sert que sur bail
>   **actif ou en préavis** ;
> - l'**aperçu** d'une pièce côté agence compte comme une **consultation
>   tracée** au journal d'accès.

## 2.C — Sprint 7 : Incidents — reliquat

> L'essentiel du S7 est **validé les 24 et 26/08** (voir Partie 1). Reste :

**7.2.2 (colocataire)** · persona LO — un colocataire voit le bail et les
incidents du bail, mais ne peut ni contester ni rouvrir (réservé au
déclarant). *(Correctif du 23/08 : le colocataire voyait « aucun bail
actif » — RPC corrigées, à vérifier d'un coup d'œil.)*

> Note propriétaire bailleur : le rôle `proprietaire_direct` passe par les
> **mêmes écrans et les mêmes fonctions** que l'agence (vérifié en base) — le
> jour où l'espace bailleur s'ouvre, le workflow incident est déjà générique.
> Le **profil artisan** attend le module devis-artisans (S13) : sans devis ni
> planning, ce serait un écran mort.

## 2.D — Reste des étapes précédentes

### Étape 3 (21/08) — re-tests A.1 à A.6 non déroulés

> Les scénarios détaillés restent ceux du 21/08 (git, commit dddffa7 et
> antérieurs). En résumé, à balayer :
- **A.1 Mandat sans lot** · AA — renforcé le 23/08 (voir D.3, le dérouler
  suffit).
- **A.2 + A.3 Attestation d'assurance** · LO puis AG — dépôt → alerte
  « Attestation déposée » → échéance colorée → Valider → côté LO la puce
  passe à **« Validée »** (libellé générique depuis le 23/08) ; le
  renouvellement ne montre qu'**une** attestation courante (v2).
- **A.4 Baux** · AG — date d'entrée le 12 conservée à la validation, brouillon
  corrigeable pré-rempli, bail signé en PDF uniquement.
- ~~**A.5 Alerte EDL nominative**~~ — **sans objet depuis le 29/08** : l'alerte
  d'EDL d'entrée n'existe plus, l'EDL d'entrée signé conditionne la validation
  du bail (voir 2.0).
- **A.6 Terminologie « propriétaire mandant »** · AA — puces et sections.
- **B.1.1 Fiche bien** · AG/AA — rubrique **« Propriétaires mandants »** :
  une ligne par personne (cliquable) avec ses lots et quote-parts.

### Sprint 3 — reste à dérouler

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 3.5 — Invitation locataire (suite)**
1. **Contenu de la notification** (ta question du 22/08) : l'email envoyé est
   celui de **définition du mot de passe** (flux « mot de passe oublié » de
   Supabase, lien vers `/nouveau-mot-de-passe`). SMTP non configuré → rien ne
   part réellement ; l'écran signale « SMTP à configurer (Resend) ». Le
   **gabarit de l'email est celui de Supabase par défaut (en anglais)** : à
   franciser dans le tableau de bord Supabase (Auth → Email Templates) au
   moment du branchement SMTP — action de configuration à planifier.
2. Réinviter la même personne → **pas de doublon** de compte.

### Sprint 4 — reste à dérouler

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 4.4 — Colocation : garants nominatifs**
1. Créer un bail **colocation** avec 2 colocataires → les deux figurent au bail (solidarité).
2. Ajouter un garant rattaché à **un colocataire nommé** (jamais au bail en bloc) → le lien garant→colocataire s'affiche.

**Scénario 4.6 — Congés : préavis, motifs, annulation (reliquat)**
> Les étapes 1 et 2 sont couvertes par les tests d'intégration (zone tendue :
> préavis 1 mois de plein droit ; hors zone tendue : justificatif exigé) —
> re-test humain d'un coup d'œil :
1. Congé **locataire** en **zone tendue** → préavis **1 mois de plein droit**, sans justificatif demandé.
2. Congé locataire **hors zone tendue** avec préavis réduit à 1 mois → refus sans justificatif.
3. (Étape 3 validée le 22/08 **sauf l'alerte**) : congé bailleur avec motif →
   vérifier que l'**alerte d'EDL de sortie datée** est bien créée.

> Le scénario 4.7 côté locataire (consultation du bail signé) est sorti en
> **anomalie du 26/08** — voir 2.A.

### Sprint 5 — Loyers, quittances, relances, IRL

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 5.2 — Encaissement, quittance, reçu (A-03, A-16)**
1. Encaisser le montant **total** d'un appel → **quittance** générée, consultable, imprimable ; l'envoi par email est proposé et enregistré.
2. Encaisser un montant **partiel** sur un autre appel → **reçu** (pas de quittance) ; compléter le solde → le reçu est **promu en quittance**.
3. Le **mode de règlement** se choisit dans une **liste fermée** (virement, chèque, espèces…) — aucun champ libre.
4. **Supprimer un encaissement** → noter ses montants → au sprint 6, vérifier que ses écritures (loyer **et** honoraires) ont disparu du journal.

**Scénario 5.4 — Impayés, relances, régularisation**
1. Un appel non payé à échéance → affiché en retard (**rouge**) ; générer une **relance** → conservée comme preuve ; la mise en demeure s'enregistre (LRAR hors plateforme).
2. Régularisation : saisir les **charges réelles** avec justificatif → décompte provisions vs réel, solde dans le bon sens (vérifier le signe).
3. Sur un bail à charges au **forfait** → **aucune** régularisation proposée.

**Scénario 5.5 — Révision IRL**
1. Bail à la date anniversaire (indice IRL saisi) → **proposition** de révision : nouveau loyer = loyer × IRL nouveau / IRL de référence (recalculer à la main) ; validation **ou** renonciation explicite.
2. Bail au DPE **F ou G** → révision **bloquée**.
3. Vérifier qu'aucun appel **déjà émis** n'est modifié rétroactivement.

> 5.1 (prorata au centime) et 5.3 (échéancier locataire) sont **validés le
> 26/08** — voir Partie 1 ; 5.1 à repasser en non-régression.

### Sprint 6 — Comptabilité et rapport de gestion

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 6.1 — Journal : immuable, contre-écriture, honoraires**
1. Chaque encaissement du sprint 5 a produit ses écritures **automatiquement**, honoraires au taux du mandat inclus ; le nom du **mandant s'affiche** sur chaque écriture (A-08).
2. Tenter de modifier ou supprimer une écriture → impossible ; corriger = **contre-passer** (l'action) → une **écriture d'annulation** liée à l'origine, les deux visibles (A-14).
3. Tenter d'écrire dans un **mois clôturé** → refus.
4. Recoupement 5.2 : les écritures de l'encaissement supprimé (loyer et honoraires) **n'apparaissent plus**.

**Scénario 6.3 — Rapport de gestion**
1. Générer le rapport du mandant sur un mois → le relire → l'**envoyer** → le rapport est **figé** (toute correction passe par un rectificatif).
2. Enregistrer le **versement** au mandant → tracé.

#### Persona : Administrateur d'agence (admin.alpha@)

**Scénario 6.2 — Clôture et ventilation**
1. Clôturer un mois → plus **aucune** écriture possible dessus ; réouverture possible par l'admin, **avec motif** obligatoire.
2. Saisir une dépense sur un **bien multi-lots** → ventilée par la clé de répartition, **une écriture par lot**, les lots à 0 % sautés (vérifier le nombre d'écritures).

**Scénario 6.4 — Export CSV du journal (A-04 → A-07)**
1. Exporter le journal sur une **période** choisie → seule la période sort (pas tout l'historique).
2. Ouvrir dans Excel français → montants à la **virgule** décimale, lisibles directement.
3. Colonnes **lot** et **mandant** présentes → le journal se ventile par tri.
4. La période et les écritures annulées sortent **en français lisible** ; provoquer une lecture en échec → **erreur visible** (jamais un CSV vide silencieux).

> Test le plus important du sprint : l'**immuabilité du journal** (6.1.2) — aucune
> écriture ne doit être modifiable, la seule correction est la contre-passation.

### Sprint 8 (partiel) — Dépôt de garantie et copropriété

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 8.1 — Encaissement du dépôt**
1. Bail actif → enregistrer l'encaissement du dépôt : date, moyen, montant, **versant** (tester avec un tiers payeur) → badge « encaissé » sur le bail + écriture comptable au journal.

**Scénario 8.2 — Restitution : délais, retenues, décote**
1. Enregistrer la **remise des clés** → le compteur légal démarre : **1 mois** si l'EDL de sortie est conforme, **2 mois** s'il y a des écarts (vérifier la date affichée).
2. Les **écarts du comparatif d'EDL** (les 2 dégradations du 4.7) sont repris ; juger l'imputabilité, saisir un coût → la **décote de vétusté** s'applique ; sans justificatif joint → alerte.
3. Sur un bail **sans EDL d'entrée** → **aucune retenue possible**, restitution intégrale imposée. *(Depuis le 29/08 un bail ne se valide plus sans EDL d'entrée signé : ce cas ne concerne que les baux activés avant, ou repris de l'existant — le compte démo en garde un.)*
4. Finaliser le décompte → toute nouvelle retenue → « Décompte finalisé — plus de retenue possible » ; relancer une restitution sur le même bail → « Restitution déjà finalisée pour ce bail ».

**Scénario 8.3 — Copropriété : appel de charges**
1. Lot en copropriété → saisir un **appel de charges du syndic poste à poste**, avec la part **récupérable / non récupérable** par poste.
2. Lancer une régularisation de charges sur ce lot **sans appel saisi** pour l'exercice → **bloquée** (le décompte attend l'appel du syndic).

> Test le plus important du sprint : **sans EDL d'entrée, restitution intégrale**
> (8.2.3) — c'est la règle légale la plus protectrice du locataire.

### Transverse — à vérifier en continu, puis en clôture de recette

#### Persona : Agent immobilier (agent.alpha@) — au fil des sprints

**Scénario T.1 — Charte v2 et vocabulaire (A-11 → A-15)**
1. Sur téléphone (ou fenêtre étroite) : l'**en-tête ne se chevauche plus**, la navigation reste utilisable.
2. La **charte v2** de la maquette est appliquée : bandeau encre, navigation laiton, fond crème, Instrument Sans, KPI à jauges, connexion en deux volets.
3. **Aucun jargon technique** : pas de « blocages en base », pas de mois `2026-06`, pas d'erreur PostgreSQL brute.
4. Le même état de lot porte **le même mot** sur tous les écrans ; « Assignée à » ne se lit plus dans les deux sens.
5. Le **rouge est réservé au critique** ; bandeau « À faire maintenant » sur la fiche bail ; états vides qui guident.

#### Persona : Administrateur d'agence Beta (admin.beta@) — en fin de recette

**Scénario T.2 — Isolation Alpha / Beta**
1. Copier depuis la session Alpha les **URLs directes** d'une fiche personne, d'un mandat, d'un bail, d'un EDL, d'une écriture, d'une quittance **et d'un incident**.
2. Connecté en admin.beta@ → aucune de ces données n'est visible dans les listes, et chaque **URL directe → refus/404**.

#### Persona : Multi-agences (multi@)

**Scénario T.3 — Cloisonnement du compte multi**
1. Se connecter en multi@ → chaque agence s'affiche **séparément**, jamais de données mélangées ; basculer d'une agence à l'autre et vérifier que les listes changent intégralement.

> C'est le test le plus important de toute la recette : **aucune donnée ne doit
> fuir entre agences**, y compris sur les nouvelles tables (mandats, baux, EDL,
> écritures, quittances, dépôts, incidents).

### Deux décisions à trancher pendant la recette

- **Propriétaire = locataire du même lot** : un avertissement non bloquant a été proposé — valider ou ajuster.
- **Rattachement locataire/garant via le bail** (C.5.5) : l'assistant l'explique au lieu d'un lien mort — confirmer cette interprétation.
