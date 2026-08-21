# Recette du 21/08 — retours corrigés, scénarios de re-test

> Correctifs déployés sur **https://gerimmo-v4.vercel.app** (main).
> Mot de passe commun : `Gerimmo-Demo-2026`. Méthode habituelle : un sujet à la
> fois, action → résultat attendu, les refus avec leur message exact.
> Les réponses aux trois questions (doublon GED, mandat résilié, échéancier
> G.3) sont dans `log.md` — le doublon GED est un comportement voulu
> (empreinte du contenu), l'accès à l'échéancier reste à traiter dans une
> passe navigation.

## A. Anomalies

### A.1 Mandat sans lot — persona AA (`admin.alpha@`)
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

### A.2 + A.3 Attestation d'assurance — personas LO (`locataire.alpha@`) puis AG (`agent.alpha@`)
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

### A.4 Baux — persona AG
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

### A.5 Alerte EDL — persona AG
1. Après l'activation ci-dessus : l'alerte s'intitule **« État des lieux
   d'entrée — {lot} · {locataire} »** ; sur la page Alertes, la sous-ligne de
   contexte apparaît sous le titre.

### A.6 Terminologie — persona AA
1. Liste des personnes : les puce disent **« Propriétaire mandant »** (ou
   « Propriétaire mandant · sans mandat ») — plus jamais « Propriétaire » nu.
2. Fiche lot : section **« Propriétaires mandants du lot »** ; formulaire de
   détention : libellés « Propriétaire mandant ».

## B. Améliorations UX

### B.1 Parc — personas AG/AA
1. Fiche bien : nouvelle rubrique **« Propriétaires mandants »** — une ligne
   par personne (cliquable vers sa fiche) avec ses lots et quote-parts.
2. Fiche lot → Caractéristiques : le récap commence par **Propriétaire
   mandant** et **Locataire** (bail en cours), et l'**identifiant fiscal** est
   visible sans ouvrir « Modifier le lot ».
3. Section « Baux & état des lieux » : chaque rang affiche **« Bail nu —
   {locataire} »** (type lisible + qui habite) avant d'ouvrir.

### B.2 Combobox lot (C.5.4) — persona AA
1. Nouvelle personne « Propriétaire mandant » → « Rattacher à un lot » est un
   champ unique : taper filtre, cliquer choisit, **le choix reste affiché** ;
   retaper libère le choix. Laisser vide = rattacher plus tard.

### B.3 EDL — persona AG
1. Ouvrir un EDL non signé : chaque section a un sélecteur **« Toute la
   section… »** — choisir « Bon » remplit toutes les lignes de la pièce, puis
   s'ajuste ligne à ligne.
2. Les lignes **sans état sont surlignées en rouge** (liseré gauche) ; le
   bouton **« Enregistrer et signer »** est grisé avec le compteur « N lignes
   sans état (en rouge) — la signature attendra. »
3. Tout remplir → « Enregistrer et signer » en **un seul geste** : la grille
   est enregistrée puis signée (« État des lieux signé — il est figé. »)
   — plus besoin d'enregistrer d'abord.

### B.4 Espace locataire — persona LO
1. La carte s'appelle **« Mon logement »** ; le sous-titre de l'accueil couvre
   logement, loyers et assurance.

## Vérifications déjà faites par l'agent (ne valent pas validation humaine)

- 72 tests Vitest verts (non-régression S0-S8 + libellés mis à jour) ;
  7 tests d'intégration de la passe écrits (`recette-2026-08-21.test.ts`,
  pattern rollback).
- 6 scénarios déroulés en conditions réelles sur la base (transaction
  annulée) : alerte au dépôt, versionnage, validation (v1 remplacée refusée,
  double validation refusée, alerte soldée), échéances exposées côté agence
  et locataire, cron planifié, alerte EDL nominative, date d'entrée du 12
  respectée à l'activation.
- Lint 0 erreur, typecheck OK, build OK. 3 migrations appliquées via MCP.

## Hors de cette passe (assumé)

- Espace locataire « menu maquette » complet et incidents : portés par la
  branche `sprint7-incidents` (sa recette est prête : `Recette S7 -
  incidents.md`).
- Accès à l'échéancier depuis la fiche bail (G.3) : passe navigation à venir.
- UX du message de doublon GED (rattacher en un clic) : amélioration future,
  la mécanique est saine.
