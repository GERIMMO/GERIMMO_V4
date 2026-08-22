# Recette S3→S8 — sujets en cours

> Mis à jour le 2026-08-22, à dérouler sur **https://gerimmo-v4.vercel.app**.
> **Fichier central de recette**, en deux parties :
> **1. Recetté OK** — ce qui est validé, on n'y revient plus.
> **2. Reste à recetter** — d'abord les **re-tests suite à tes retours**
> (étapes 1 à 3), puis les sprints **jamais déroulés**.
>
> Mot de passe commun : `Gerimmo-Demo-2026`.
> Périmètre réel : S3, S4, S5, S6 et S8 — le **S7 (incidents) n'est pas encore
> développé** (constat du 19/08, à planifier après le S9a).
>
> **Méthode itérative** : re-tests des correctifs d'abord, puis un sprint à la
> fois, persona par persona. Les numéros reprennent ceux du document du 05/08
> ([[Recette S3-S8 - scenarios]]).
> Limite connue (pas une anomalie) : SMTP non configuré → constater que l'écran
> propose l'envoi et l'enregistre suffit.

---

# Partie 1 — Recetté OK (ne plus re-tester)

> Trace des scénarios **validés en recette humaine**, gardée ici pour la vision
> d'ensemble. Le détail des scénarios sortis du corps du document reste dans
> git (commit b14f4fe) et dans `log.md`.

- **08/08 — Bloc 0 (non-régression S0–S2)** : 0.1, 0.2, 0.3 **validés**.
- **13/08 — Étape correctifs + début du Sprint 3** : **validés** C.2, C.3,
  C.4, C.5 (étapes 1-3 et 5), C.7 ; 3.2 (étapes 1 et 3) ; 3.3 (étapes 1-4).
  Question C.7.1 : pas une anomalie — vérifié en base, la clôture de la
  détention future a bien été refusée (`date_fin` vide).
- **14/08 — Recette automatisée (agent)** des 6 re-tests du 13/08 (C.1, C.5.4,
  C.6.1, C.6.2, 3.2.2, 3.3.5) : tous passés en conditions réelles, mais **ne
  vaut pas validation humaine** → à confirmer d'un coup d'œil via l'étape 1.
- **21/08 — Retours de recette S3-S8** : les 6 anomalies (A.1-A.6) et
  4 chantiers UX (B.1-B.4) remontés ont été **corrigés et déployés sur main**
  (tests/lint/build verts, scénarios rejoués par l'agent en base) → re-tests
  humains via l'étape 3.

---

# Partie 2 — Reste à recetter

## 2.A — Suite à tes retours : re-tests des correctifs

### Étape 1 — Re-tests des correctifs du 13/08

> **Recette automatisée du 14/08** (agent, en conditions réelles sur le site) —
> à confirmer d'un coup d'œil humain, elle ne vaut pas validation :
> - **C.1** ✔ refus sans destinataire, refus sans message, envoi avec message OK
>   (l'alerte « Testy 4 » a été confiée à admin.alpha@ pour ce test — reprends-la).
> - **C.5.4** ✔ liste peuplée, recherche OK, **détention 100 % créée** (fiche
>   « Recette Mandant » sur Lot 1, 3 Rue des Essais) ; la fiche personne affiche
>   désormais une section « **Lots détenus** » (nouveau).
> - **C.6.1** ✔ refus net sur email déjà pris dans Alpha.
> - **C.6.2** ✔ détection OK, mais l'avertissement était **invisible** (masqué
>   par le repli de l'assistant — la cause de ton « aucune alerte ») → corrigé
>   le 14/08 : il s'affiche en orange au-dessus de l'assistant.
> - **3.2.2** : le bouton créait encore un document indépendant (écriture du
>   lien de version interdite en base) → **corrigé le 14/08** (lien posé à
>   l'insertion) puis re-testé : badge **v2** + « Historique — 1 version
>   antérieure (conservée) » sur la pièce d'Alice Dupont.
> - **3.3.5** ✔ mandats résiliés grisés « Historisé — non modifiable », taux et
>   lots lisibles.
> - **Nettoyage** ✔ fait via le nouveau bouton « **Archiver la fiche** » :
>   les 4 doublons d'Alpha sont archivés (reste « jean luc » chez **Beta**,
>   à archiver depuis une session Beta).

#### Persona : Agent immobilier (agent.alpha@)

**Re-test C.1 — Message obligatoire dans « Confier »**
> Correctif : le champ « **Message au destinataire** » existe désormais dans
> « Confier » et est obligatoire (il manquait entièrement).
1. Ouvrir une alerte → « Confier » → valider **sans destinataire** → refus.
2. Choisir un destinataire mais valider **sans message** → refus, le message est obligatoire. Même règle sur « Marquer traitée ».

**Re-test C.5.4 — Rattachement d'un lot dans l'assistant**
> Correctif : la liste des lots sortait vide (requête cassée en silence) —
> réparée : les 12 lots s'affichent, la recherche filtre.
1. Personnes → « Nouvelle personne » → rôle « Propriétaire mandant » → l'étape 2 propose le **rattachement facultatif d'un lot** : la liste est **peuplée** ; taper « quincy » dans la recherche → seul le lot de Quincy-sous-Sénart reste.
2. Rattacher un lot → une **détention à 100 %** apparaît sur la fiche.

**Re-test C.6 — Email unique par agence + alerte doublon**
> Point d'attention : la règle est « unique **par** agence ». Le constat du
> 13/08 (même email chez Alpha ET chez Beta) est le comportement **voulu** —
> le refus n'est attendu que pour deux fiches de la **même** agence.
> Correctif doublon : la détection compare désormais nom + prénom **dans les
> deux sens** (« Jean Francois » ↔ « Francois Jean »), accents/casse ignorés.
1. Créer « Paul Unique-Test » **dans Alpha** avec l'email d'une fiche existante **d'Alpha** → **refus** : email déjà utilisé dans l'agence. (Le même email dans **Beta** doit, lui, passer.)
2. Créer une personne avec le **même nom + même date de naissance** qu'une fiche existante mais un email différent → **alerte doublon non bloquante**, la création reste possible. Refaire en **inversant nom et prénom** → l'alerte se déclenche aussi.
3. Nettoyage : archiver les fiches de test en double du 13/08 (« Francois Jean » ×2, « jean luc », « Jean Francois »).

**Re-test C.8 — Propriétaire depuis la fiche lot + modification de fiche**
> Correctifs : la création passe désormais par une **pop-up**, et la fiche
> d'une personne devient **modifiable** (ce qui manquait entièrement).
1. Fiche d'un lot → « + Nouvelle personne… » → une **pop-up** « Nouveau propriétaire » s'ouvre → elle exige nom et **email** ; « Valider » referme la pop-up avec un récapitulatif (lien « modifier » pour rouvrir) → « Enregistrer la détention » crée la fiche « propriétaire mandant ».
2. Fiche de la personne créée → « **Modifier la fiche** » → corriger nom, prénom, email, téléphone ou date de naissance → enregistré. L'email reste unique dans l'agence ; le prénom d'une personne physique ne peut pas être vidé.

**Re-test 3.2.2 — Nouvelle version d'une pièce**
> Correctif : le dépôt d'une nouvelle version passe par le bouton dédié
> **« Déposer une nouvelle version »** sous la pièce (le 13/08, un second
> dépôt classique créait un document indépendant — d'où « CNI » et « CNI 2 »
> côte à côte ; ces deux-là restent dissociées, redéposer via le bouton ou me
> demander de les lier en base).
1. Fiche personne → sous une pièce existante → « **Déposer une nouvelle version** » (fichier différent) → seule la version courante s'affiche, marquée **v2** ; l'ancienne reste dans l'« **Historique** » dépliable (jamais supprimée), consultable.

**Re-test 3.3.5 — Mandat résilié historisé**
> Correctif : un mandat **résilié** est désormais **historisé** — verrouillé
> aussi en base (retour du 13/08 : il restait modifiable).
1. Sur le mandat **résilié** du 13/08 → l'encart est **grisé**, marqué « Historisé — non modifiable » : plus aucun bouton d'état ni d'ajout de lot ; le **taux** et les **lots** du mandat restent lisibles.

### Étape 2 — Passe globale du 19/08 : alignement charte + optimisations

> Le 19/08, une passe complète (3 revues + corrections) a aligné **tous** les
> écrans sur la charte v2 de la maquette (l'audit du 14/08 ne couvrait que
> Tableau de bord, Parc et Personnes) et corrigé des défauts de fond. Lint,
> tests (72) et build sont verts. À l'œil pendant la recette : tout écran doit
> ressembler aux trois écrans de référence — en-tête serif + compteur mono,
> statuts en **puces colorées** (plus de statuts gris), états vides guidants.

#### Persona : Agent immobilier (agent.alpha@)

**Vérif G.1 — Journal comptable (l'écran le plus retouché)**
1. Comptabilité → le journal est une **vraie table** : en-têtes en petites capitales mono, dates en mono, catégories en puce grise, montants alignés à droite, crédits en **vert avec « + »**.
2. Au-dessus : **3 tuiles KPI** (Recettes, Dépenses, Net) et, dans l'en-tête, la mention mono « {mois} clôturé · {mois} ouvert ».
3. Les liens d'export CSV sont en **bleu** ; l'état vide du journal guide vers la saisie.

**Vérif G.2 — Fiche bail : nouvel en-tête**
1. Sur un bail actif → sur-titre « BAIL NU/MEUBLÉ… » en petites capitales, **le nom du locataire en titre**, l'état du bail en **puce colorée** (actif = vert doux, préavis = ambre, terminé = gris).
2. Sur un bail **brouillon sans locataire** → le titre replie sur le nom du lot, rien ne casse.
3. Le bloc « À faire maintenant » est un aplat ardoise à liseré or, coins carrés.

**Vérif G.3 — Échéancier et suppression d'encaissement**
1. Les statuts d'échéancier sont des **puces** : payé vert doux, partiel ambre, **impayé rouge doux**, à échoir gris.
2. Supprimer un encaissement refusé (mois clôturé) → **le refus s'affiche** désormais sous le bouton (avant, il était silencieux).

**Vérif G.4 — EDL et fiches**
1. Grille d'EDL : noms de pièces en mono, états des éléments en puces (bon = vert, usage = gris, mauvais/absent = rouge) ; en-tête avec « ENTRÉE · date » et puce Signé/En cours.
2. Fiche bien et fiche lot : sur-titre « TYPE · VILLE » au-dessus du titre.
3. Fiche personne : **avatar à initiales** dans l'en-tête ; état du mandat en puce.
4. Documents : liste en rangs charte, compteur « N pièces » ; la recherche traite « % » et « _ » comme des caractères normaux.

#### Persona : Locataire (locataire.alpha@)

**Vérif G.5 — Espace locataire dans la charte**
1. **Bandeau encre** avec la marque GERIMMO + « ESPACE LOCATAIRE » (fini l'en-tête blanc).
2. Dates au format **français** (12/09/2026, plus de 2026-09-12) ; loyers formatés « 780,00 € » ; statut **Impayé en rouge**, Payé en vert.
3. Ouvrir une quittance → **imprimer (aperçu)** : la note technique du bas **ne sort pas** sur le papier.

#### Persona : Super Admin (superadmin@)

**Vérif G.6 — Console dans la charte**
1. Bandeau encre commun (marque + « CONSOLE D'ADMINISTRATION » + cloche + journaux + déconnexion).
2. Fiche d'une agence → rôles et statuts **en français** (« Administrateur d'agence (adhésion active) », plus de « admin_agence (active) »).

> Corrections de fond invisibles à l'œil mais actées (pour info) : date du jour
> calculée en heure de Paris partout (une ventilation saisie avant 2 h du matin
> ne peut plus tomber sur la veille / un mois clôturé) ; l'envoi de quittance
> signale désormais un échec de mémorisation au lieu d'un faux succès ; la
> création de bien en propriétaire direct signale toute écriture échouée ;
> requêtes des fiches personne/bail et de l'espace locataire parallélisées.

### Étape 3 — Re-tests des correctifs du 21/08 (retours de recette S3-S8)

> Correctifs des 6 anomalies et 4 chantiers UX issus des retours de recette,
> déployés sur main le 21/08 (3 migrations appliquées). **À dérouler en
> premier** lors de la prochaine session de recette. Les réponses aux trois
> questions posées (doublon GED, mandat résilié, échéancier G.3) sont dans
> `log.md` — le doublon GED est un comportement voulu (empreinte du contenu),
> l'accès à l'échéancier reste à traiter dans une passe navigation.

#### Anomalies corrigées

**Re-test A.1 — Mandat sans lot** · persona AA (`admin.alpha@`)
1. Fiche d'un propriétaire mandant → créer un mandat (brouillon), **sans lot**.
2. Cliquer « Passer à signer » → **refus** : « Un mandat sans lot ne part pas à
   la signature : ajoutez au moins un lot avec son taux d'honoraires. »
3. Ajouter un lot (le champ est maintenant un **combobox** : taper filtre,
   cliquer choisit, le choix reste affiché) → un lien **« Retirer »** apparaît
   sur la ligne tant que le mandat est en brouillon.
4. « Passer à signer » → accepté ; la zone d'ajout disparaît, remplacée par
   « Lots et taux figés — ils sont ceux du contrat signé. »
5. Tenter d'ajouter une ligne via un vieux formulaire resté ouvert → refus
   « Les lots et taux d'un mandat se composent en brouillon… ».

**Re-test A.2 + A.3 — Attestation d'assurance** · personas LO (`locataire.alpha@`) puis AG (`agent.alpha@`)
1. LO : déposer une attestation (date d'expiration obligatoire) → succès ; la
   carte affiche la puce **« En cours de vérification »** (orange).
2. AG : une alerte **« Attestation d'assurance déposée — {nom} »** est ouverte
   (cloche + page Alertes, avec « Expire le … — à vérifier puis valider » en
   sous-ligne).
3. Fiche personne → Pièces justificatives : l'attestation porte son
   **échéance colorée** (« valide jusqu'au … » / « expire dans N j » /
   « expirée depuis N j ») et la puce **« À vérifier »** + bouton **Valider**.
4. Valider → puce **« Validée »**, l'alerte passe en « Fermées récemment »
   (« Attestation vérifiée et validée »).
5. LO : la puce passe à **« Validée par votre agence »** (vert).
6. LO : redéposer une attestation (renouvellement) → la fiche personne montre
   **une seule** attestation courante (v2), l'ancienne dans l'historique ;
   côté LO c'est bien la **dernière** qui s'affiche (plus l'ancienne).
7. Alertes d'expiration : elles tournent chaque nuit (3 h 45) — pour vérifier
   sans attendre : déposer une attestation expirant sous 30 jours et demander
   au super admin d'exécuter la génération, ou constater l'alerte le lendemain.

**Re-test A.4 — Baux** · persona AG
1. Fiche lot → créer un bail : le formulaire porte un champ **« Date
   d'entrée »**. Saisir le **12** du mois → accepté.
2. Sur la fiche du bail (brouillon) : carte **« Corriger le brouillon »** avec
   tous les champs **pré-remplis** — modifier le loyer, enregistrer →
   « Brouillon corrigé. », l'en-tête reflète le nouveau montant.
3. Déposer un JPG comme bail signé → **refus** : « Le bail signé se dépose en
   PDF complet — une image d'une page ne vaut pas le contrat. » (le champ
   n'accepte plus que .pdf).
4. Déposer un PDF, activer → la date d'entrée reste **le 12** (pas le jour du
   clic) ; l'échéancier démarre au bon mois.

**Re-test A.5 — Alerte EDL nominative** · persona AG
1. Après l'activation ci-dessus : l'alerte s'intitule **« État des lieux
   d'entrée — {lot} · {locataire} »** ; sur la page Alertes, la sous-ligne de
   contexte apparaît sous le titre.

**Re-test A.6 — Terminologie « propriétaire mandant »** · persona AA
1. Liste des personnes : les puces disent **« Propriétaire mandant »** (ou
   « Propriétaire mandant · sans mandat ») — plus jamais « Propriétaire » nu.
2. Fiche lot : section **« Propriétaires mandants du lot »** ; formulaire de
   détention : libellés « Propriétaire mandant ».

#### Améliorations UX

**Re-test B.1 — Parc** · personas AG/AA
1. Fiche bien : nouvelle rubrique **« Propriétaires mandants »** — une ligne
   par personne (cliquable vers sa fiche) avec ses lots et quote-parts.
2. Fiche lot → Caractéristiques : le récap commence par **Propriétaire
   mandant** et **Locataire** (bail en cours), et l'**identifiant fiscal** est
   visible sans ouvrir « Modifier le lot ».
3. Section « Baux & état des lieux » : chaque rang affiche **« Bail nu —
   {locataire} »** (type lisible + qui habite) avant d'ouvrir.

**Re-test B.2 — Combobox lot (C.5.4)** · persona AA
1. Nouvelle personne « Propriétaire mandant » → « Rattacher à un lot » est un
   champ unique : taper filtre, cliquer choisit, **le choix reste affiché** ;
   retaper libère le choix. Laisser vide = rattacher plus tard.

**Re-test B.3 — EDL** · persona AG
1. Ouvrir un EDL non signé : chaque section a un sélecteur **« Toute la
   section… »** — choisir « Bon » remplit toutes les lignes de la pièce, puis
   s'ajuste ligne à ligne.
2. Les lignes **sans état sont surlignées en rouge** (liseré gauche) ; le
   bouton **« Enregistrer et signer »** est grisé avec le compteur « N lignes
   sans état (en rouge) — la signature attendra. »
3. Tout remplir → « Enregistrer et signer » en **un seul geste** : la grille
   est enregistrée puis signée (« État des lieux signé — il est figé. »)
   — plus besoin d'enregistrer d'abord.

**Re-test B.4 — Espace locataire** · persona LO
1. La carte s'appelle **« Mon logement »** ; le sous-titre de l'accueil couvre
   logement, loyers et assurance.

> Vérifications déjà faites par l'agent le 21/08 (ne valent pas validation
> humaine) : 72 tests Vitest verts, 7 tests d'intégration
> (`recette-2026-08-21.test.ts`, pattern rollback), 6 scénarios déroulés en
> conditions réelles sur la base (transaction annulée), lint/typecheck/build OK.
>
> Hors de cette passe (assumé) : espace locataire « menu maquette » complet et
> incidents (branche `sprint7-incidents`, recette prête) ; accès à l'échéancier
> depuis la fiche bail (G.3, passe navigation à venir) ; UX du message de
> doublon GED (rattacher en un clic — la mécanique est saine).

---

## 2.B — Jamais déroulé : sprint par sprint

### Sprint 3 — reste à dérouler

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 3.4 — Attestation d'assurance expirée (partie agent)**
1. Dossier d'un locataire → déposer une attestation avec une **date d'expiration dépassée** → après génération des alertes (bouton/cron superadmin), une alerte **critique** « défaut d'assurance » existe.
2. Redéposer une attestation valide → l'ancienne alerte est **conservée** (preuve), pas effacée.

**Scénario 3.5 — Invitation locataire**
1. Fiche d'une personne sans compte → « Inviter comme locataire » → état du compte « invité/créé » (l'email réel dépend du SMTP — hors périmètre).
2. Réinviter la même personne → **pas de doublon** de compte.

#### Persona : Locataire (locataire.alpha@)

**Scénario 3.4 — Assurance côté locataire (suite)**
1. Son espace affiche le **statut de son assurance**.
2. Déposer lui-même une attestation à date d'expiration **future** → acceptée → le statut passe à jour côté agence (revérifier en agent.alpha@).

> Test le plus important du sprint : l'**email unique par agence** (re-test
> C.6) — c'est la nouvelle règle en base ; vérifier aussi qu'elle ne bloque
> pas deux agences différentes d'avoir le même email.

### Sprint 4 — Bail et état des lieux

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 4.1 — Créer et activer un bail nu (chaîne critique)**
1. Fiche d'un lot **Disponible** → créer un bail nu : locataire, loyer **780 €**, charges **90 €**, dépôt, jour d'échéance ; date d'entrée le **12 du mois** (prépare le prorata du sprint 5).
2. « Activer » sans PDF → refus : « Déposez le bail signé (PDF) avant activation (V0 : signature hors plateforme) ».
3. Déposer le PDF signé → « Activer » → bail **actif**, lot passé à **Loué**, **alerte EDL d'entrée** créée, échéancier de loyers généré.
4. Tenter d'activer un bail sur un lot au **DPE expiré** → refus « Mise en location bloquée : … ».

**Scénario 4.2 — Garde-fous juridiques**
1. Déposer sur un lot un DPE de **classe G** → mise en location refusée : « DPE classe G : logement interdit à la location (loi Climat) ».
2. Renseigner l'**identifiant fiscal du logement** sur la fiche du lot → conservé après enregistrement.
3. Créer un bail **nu** avec un dépôt de garantie de **2 mois** de loyer HC → refus : « Dépôt de garantie trop élevé : maximum 1 mois de loyer hors charges (soit N €) » ; refaire en **meublé** → 2 mois acceptés.

**Scénario 4.3 — Bail meublé : inventaire**
1. Créer un bail **meublé** → la section **inventaire du mobilier** est proposée, avec les catégories du décret 2015 (literie, plaques, réfrigérateur, vaisselle…).
2. Laisser l'inventaire incomplet → **signalé** (alerte de requalification), mais non bloquant.

**Scénario 4.4 — Colocation : garants nominatifs**
1. Créer un bail **colocation** avec 2 colocataires → les deux figurent au bail (solidarité).
2. Ajouter un garant rattaché à **un colocataire nommé** (jamais au bail en bloc) → le lien garant→colocataire s'affiche.

**Scénario 4.5 — Pièces du lot et grille d'EDL réelle**
1. Bail d'un lot **sans pièces déclarées** → « Déclarer les pièces du lot » apparaît **avant** « faire signer l'état des lieux » dans « À faire maintenant » ; l'écran d'EDL le signale et renvoie vers le lot.
2. Fiche du lot → « Proposer les pièces » → pour un T3 : entrée, séjour, chambre 1, chambre 2, cuisine, salle de bain, WC — **dans cet ordre** (pas alphabétique), en un clic.
3. Régénérer la grille d'EDL → **7 éléments par pièce** (49 lignes pour le T3), plus de section « Général » ; les **compteurs** et les **clés** se saisissent.
4. Signer avec une ligne sans état → refus ; tout compléter → signature acceptée → l'EDL est **figé** (toute modification refusée).

**Scénario 4.6 — Congés : préavis, motifs, annulation**
1. Congé **locataire** en **zone tendue** → préavis **1 mois de plein droit**, sans justificatif demandé.
2. Congé locataire **hors zone tendue** avec préavis réduit à 1 mois → refus sans justificatif : « Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d'emploi, RSA/AAH…) ».
3. Congé **bailleur** sans motif → refus : « Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul » ; avec motif → bail en **préavis**, **alerte d'EDL de sortie datée** créée.
4. **Annuler le congé** → bail redevient actif sans date de fin, lot re-loué, alerte de sortie refermée ; le congé annulé **reste au dossier** avec date et motif.
5. Vérifier les deux verrous : EDL de sortie signé → « L'état des lieux de sortie est signé : le départ a eu lieu, le congé ne s'annule plus » ; restitution engagée → « La restitution du dépôt est engagée : le congé ne s'annule plus ».

**Scénario 4.7 — Comparatif EDL (partie agent)**
1. Faire un EDL de sortie avec **2 états dégradés** par rapport à l'entrée → le **comparatif** met ces 2 écarts en évidence, ligne à ligne.

#### Persona : Locataire (locataire.alpha@)

**Scénario 4.7 — Consultation du bail (suite)**
1. « Mon bail » → le bail **signé** est consultable (jamais un brouillon), avec ses documents.

> Test le plus important du sprint : la **chaîne d'activation** (4.1) — sans elle,
> rien des sprints 5, 6 et 8 n'est testable. La dérouler en premier.

### Sprint 5 — Loyers, quittances, relances, IRL

#### Persona : Agent immobilier (agent.alpha@)

**Scénario 5.1 — Prorata au centime (A-01, A-02)**
1. Sur le bail entré le 12 (loyer 780 €, charges 90 €, mois de 31 jours) → le premier appel affiche exactement **503,23 € de loyer + 58,06 € de charges = 561,29 €** (arrondi une seule fois, à la fin, par composante — pas 503,26/561,32).
2. Sur tout appel : additionner à la main les lignes affichées → le **montant dû est exactement la somme**.

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

#### Persona : Locataire (locataire.alpha@)

**Scénario 5.3 — Échéancier et quittances**
1. « Mes loyers » → échéancier visible, quittances et reçus **téléchargeables**.
2. Vérifier qu'**aucun commentaire interne** de l'agence n'apparaît nulle part.

> Test le plus important du sprint : le **prorata au centime** (5.1) — les valeurs
> attendues sont exactes au centime, toute autre valeur est une anomalie.

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
3. Sur un bail **sans EDL d'entrée** → **aucune retenue possible**, restitution intégrale imposée.
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
1. Copier depuis la session Alpha les **URLs directes** d'une fiche personne, d'un mandat, d'un bail, d'un EDL, d'une écriture et d'une quittance.
2. Connecté en admin.beta@ → aucune de ces données n'est visible dans les listes, et chaque **URL directe → refus/404**.

#### Persona : Multi-agences (multi@)

**Scénario T.3 — Cloisonnement du compte multi**
1. Se connecter en multi@ → chaque agence s'affiche **séparément**, jamais de données mélangées ; basculer d'une agence à l'autre et vérifier que les listes changent intégralement.

> C'est le test le plus important de toute la recette : **aucune donnée ne doit
> fuir entre agences**, y compris sur les nouvelles tables (mandats, baux, EDL,
> écritures, quittances, dépôts).

### Deux décisions à trancher pendant la recette

- **Propriétaire = locataire du même lot** : un avertissement non bloquant a été proposé — valider ou ajuster.
- **Rattachement locataire/garant via le bail** (C.5.5) : l'assistant l'explique au lieu d'un lien mort — confirmer cette interprétation.
