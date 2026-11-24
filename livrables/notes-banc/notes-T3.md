# Notes du lot T3 — Dépôt, charges, état des lieux, pièces, impayés

Commit local `978be58b` sur `$S/palier1` (parent `13495037`, lot T2), non poussé. Aucun fichier du lot T2 touché.
Référence : recueil fourni par le dirigeant (`r2-refs10-24.txt`), source et version déclarées, non recontrôlé. Chaque passage a été relu avant correction. Rien n'est écrit « conforme ».

## 1. Tableau identifiant → verdict

| Identifiant | Verdict | Ce qui est fait |
|---|---|---|
| R11-A2 | **corrigé** | Reçu de dépôt : plafond selon le bail, avec la règle de la base (`moisDepotGarantie` = `plafond_depot_mois`). Bail nu sur logement coché meublé : « un mois » (avant « deux mois ») ; bail meublé sur logement non coché : « deux mois » (avant « un mois »). Aucun montant imprimé ne change. |
| R15-A1 | **corrigé** | État des lieux de sortie, saisie, consultation et message d'erreur : « Adresse du nouveau domicile ou du lieu d'hébergement du locataire » (décret du 30 mars 2016, article 2, 2°, a). Même colonne `adresse_restitution_depot`, aucune donnée réécrite. |
| R16-A1 | **corrigé** | Écart réel (article 7-1 relu, L1501-1502). Migration `20261125111000` : le refus « prescrit » est retiré de `regulariser_charges` et de `consommations_interne.emettre_regularisation`. L'application avertit (« peut-être prescrit ») et exige une case cochée, vérifiée côté serveur dans les deux actions. Écran des loyers et écran « depuis les factures » corrigés. |
| R19-A1 | **corrigé** (option minimale) | Avant tout bail signé (annexe I) et pour une caution (annexe II) : choix dans la liste du décret n° 2015-1437, 34 textes recopiés mot pour mot. Le libellé libre est refusé par le serveur. Identité et domicile : une seule demande par rubrique. Locataire d'un bail signé : libellé libre, comme avant. |
| R24-A1 | **corrigé par avertissement** | Le circuit d'envoi n'est pas modifié (fermé, soumis à la confirmation du propriétaire, question B10ter au juriste). Les loyers d'un bail avec caution affichent la date à ne pas dépasser (échéance + un mois) et ce que Gerimmo ne fait pas ; le réglage des relances le dit aussi. |
| R11-A3 (mineur, texte) | corrigé | Espace du locataire (3 endroits) : « 2 mois sinon » (état des lieux non conforme), et non « si des retenues sont justifiées ». |
| R16-A2 (mineur, texte) | corrigé pour le rappel d'assurance | Les deux voies de l'article 7 g sont séparées. La phrase du résumé de la notice (« en justifie chaque année ») reste : fichier du lot T2. |
| R14-A1, R16-A3 | déjà corrigés par le lot T2 | Vérifié dans `notice.ts` et `mentions-location.ts`. |
| T1R-2 | corrigé | `terme_bail_calcule` (même migration) : bail commencé le 29/02/2024 → terme le 28/02/2027 (27 avant) ; date limite du congé le 31/08/2026 (27/08 avant). |
| T1R-3, T1R-6 | corrigés | Texte de la zone inconnue ; « Désignation des locaux loués : ». |
| T1R-5 | corrigé | Empreinte rectifiée dans `notes-T1.md` (`c2cdca5f…`). |

## 2. Preuves

- **Tests** (vitest) : `textes-t3.test.ts` (28), `textes-t3-regularisation.test.ts` et `textes-t3-ecrans.test.ts` (15), `textes-t3-base.test.ts` (9, avec base). Suite complète : 15 693 réussis ; seuls échecs restants, les attendus (`api-isolation`, `lot2-auth-reel`, `lot3-notifications-base`, `ux-*-navigateur`). Les tests « -api » ont été relancés avec l'émulateur démarré (`vitest-2.log`). Journaux : `$S/recueil/T3/vitest-1.log`, `vitest-2.log`.
- **Argent, chiffré avant/après** (`textes-t3-base.test.ts`) : complément de 1 234,56 € sur 2020 et 2022 enregistré au centime, identique à 2023 et 2024 ; étalement de 1 200,05 € en douze mensualités dont la somme est exacte ; trop-perçu de 50 € inchangé ; une régularisation enregistrée traverse rejeu, retour et marche avant sans changer. Le retour rend les trois fonctions à l'identique (empreinte du texte) et le refus « prescrit » revient : c'est la preuve de l'état d'avant.
- **Reçu de dépôt** : six combinaisons bail × logement, avec l'ancien et le nouveau plafond ; versement, dépôt convenu, total et reste inchangés.
- **Isolation** : aucune migration ne touche `pieces_demandees` ni une règle de lecture ; l'action passe par la session du gérant. Droits des trois fonctions inchangés, rien pour les visiteurs.
- **PDF réels** : `$S/phase3/correctifs/T3/apres/` — 34 PDF (reçus avec et sans image de signature, noms longs, versement partiel ; états des lieux de 6 à 48 lignes, adresses courte, longue, hébergement ; rappels d'assurance ; congés pour vendre), 1 « incomplet » attendu (sortie sans adresse). Aucune alerte de mise en page. Pages regardées : reçu d'une page, reçu de deux pages, dernière page d'un état des lieux, rappel d'assurance.
- **Écrans à 390 px** : `e2e/textes-t3.spec.ts` (nouveau) et `prudences-juridiques.spec.ts` (mis à jour). Contrôle `precheck.sh T3 978be58b` : préparation, compilation et 7 parcours réussis (`$S/banc-integ/T3.status`). Captures : `$S/recueil/T3/ecrans/`.
- **Liste du décret** : `$S/recueil/T3/verif-decret.ts` retrouve les 34 textes mot pour mot dans le recueil ; un test garde leur empreinte.
- **Tests mis à jour parce qu'ils affirmaient l'ancien état** : refus « prescrit » (`audit-gestion-2026-09-29`), rappel et libellé libre avant le bail (`prudences-juridiques-sans-texte`, `pieces-demandees-actions`), libellé de l'adresse (`documents-modeles`), empreinte de garde de l'état des lieux de sortie (`impayes-documents-phase3-lot53-reprise`), désignation des locaux (`textes-t1-conges`).

## 3. Mineurs non traités (ce ne sont pas de simples textes)

- R12-A1 : note d'information chauffage et eau chaude collectifs dans le courrier de régularisation (ligne nouvelle, donnée du logement).
- R14-A2 : état des risques exigé partout (message d'une fonction de base, case « hors zone »).
- R15-A2 : domicile du bailleur sur l'état des lieux en mode agence (cartouche nouveau, hors palier 1).
- R15-A3 : date de l'état des lieux d'entrée demandée à la saisie de la sortie.
- R16-A2, partie résumé de la notice : simple texte, mais dans `notice.ts` (lot T2 en relecture) ; change l'empreinte du résumé.
- R16-A4 : message « DPE classe G : logement interdit » et exception outre-mer (fonction de base).
- R23-A1 : gel de la révision pour un bail de six ans antérieur au 24/08/2022 (décision du dirigeant).
- R10, R18, R21, R22 : aucun écart mineur.

## 4. Nouveautés de la section D — notées, non codées

Déjà en vigueur, petites, à décider : phrase du décompte « la majoration n'est pas due si le locataire n'a pas transmis sa nouvelle adresse » (article 22, lien direct avec R15-A1) ; paiement partiel du loyer quand la CAF conserve l'aide d'un logement non décent, qui n'est pas un impayé (article 7 a, depuis le 15/06/2025) : Gerimmo relancerait ce locataire ; plafond du loyer d'une nouvelle location en classe F ou G (aucune alerte) ; récapitulatif des charges transmis sur demande ; interdiction d'imposer la cosignature d'un ascendant ; commission de prévention des expulsions.
À venir : classe F non décente au 1er janvier 2028 (la base ne bloque que « G », écrit en dur) ; rapport au Parlement avant le 1er juillet 2027.
Sans suite pour le code : zone de bruit d'aérodrome, article 3 ter du décret de décence, Mayotte, article 1751 (partenaires pacsés), imputation des paiements sur le principal (article 2303).

## 5. Questions au dirigeant (option prudente appliquée en attendant)

1. **R16-A1 : où vérifier la confirmation ?** Elle est vérifiée par l'application, comme pour l'exercice non terminé (D38), pas par la base. Une requête qui contournerait l'application enregistrerait le complément sans la case. Alternative : un paramètre de plus dans quatre fonctions de base.
2. **R24-A1 : faut-il aller plus loin que l'avertissement ?** Par exemple avancer la seconde relance à 30 jours quand le bail a une caution. Non fait : l'envoi est fermé et dépend de votre confirmation.
3. **R19-A1 : caution après la signature.** Elle reste limitée à l'annexe II, par prudence. Une personne à la fois locataire d'un bail signé et caution garde le libellé libre.
4. **R19-A1 : anciennes demandes.** Une demande au nom libre faite avant ce lot reste relançable ; rien n'est supprimé.
5. **R15-A1 :** un état des lieux de sortie préparé pour la signature et pas encore envoyé se prépare de nouveau (Q40).
6. **T1R-2 :** la règle est générale (jour ramené en fin de mois = dernier jour du bail). Elle change aussi d'un jour le terme d'un bail étudiant de neuf mois commencé un 29, 30 ou 31 de certains mois.

## 6. Points pour JURISTE.md

**À retirer** : partie 2, point 3 (adresse à la sortie : corrigé) ; partie 2, point 12 (attestation d'assurance : absente de l'annexe I, due à la remise des clés).
**À alléger** :
- partie 2, point 6 : « Point de départ tranché par l'article 7-1 ; Gerimmo avertit et fait confirmer. Reste : quelle date le prouve en copropriété ? »
- partie 2, point 11, partie 1, point 36 et partie 3, A9 : « Le RIB n'est pas dans la liste ; Gerimmo ne le laisse plus demander avant le bail. Reste : après la signature. »
- partie 3, B10ter (b) : « Délai lu (article 2303). Restent le moyen de preuve et la qualité de créancier professionnel. »
- Selon analyse-2, non revérifié ici : partie 1, point 30 ; partie 5, points 13 et 16 (a) ; partie 8, point 1 (d).
**À ajouter** :
1. Annexe II, A du décret de 2015 : la liste d'identité de la caution s'arrête au permis de conduire et finit par un point-virgule dans le recueil. Manque-t-il le document de séjour ? Gerimmo s'en tient aux trois documents.
2. Article 2303 : « dans le mois de l'exigibilité » est-il le délai pour informer, ou ce qui caractérise l'incident ? Gerimmo affiche échéance + un mois.
3. Un bailleur particulier, ou une agence qui gère pour lui, est-il un « créancier professionnel » ? Un e-mail simple suffit-il ?
4. La liste du décret s'applique-t-elle encore à la caution après la signature du bail ?
5. Terme d'un bail commencé un 29 février : le 28 février est-il le bon dernier jour ? (s'ajoute à T1R-1.)
6. Textes absents ou anciens dans le recueil : article 25-6 (dépôt de deux mois en meublé ; le reçu garde ce plafond, déjà dans le code, sous l'en-tête « Article 22 ») ; article 22-2 consulté en avril 2023.

## 7. État du banc

Bases remises à neuf par `precheck.sh` ; la migration du lot y est appliquée par la préparation. Émulateur et serveur arrêtés ; aucun fichier de travail dans l'arbre ; arbre propre.

---

# Reprise du lot T3 (relecture T3R, 25/11/2026)

Commit local sur `$S/palier1` (parent `4a410eda`), non poussé. Migration `20261125151000_textes_t3_reprise_exercice_ancien` (retour fourni). Options appliquées : section « REPRISE T3 » de `PETITES-REPRISES.md`.

## 1. Tableau

| Point | Verdict | Ce qui est fait |
|---|---|---|
| T3R-1 (important, ARGENT, régression) | **corrigé** | La base exige la confirmation : à la place exacte de la ligne du lot T3, `regulariser_charges` et `consommations_interne.emettre_regularisation` refusent un complément (écart < 0) d'un exercice dont le 31/12 a plus de trois ans avec « Exercice … clos depuis plus de trois ans : confirmation nécessaire… » (le mot « prescrit » n'est pas dit). `p_exercice_ancien` arrive par une **seconde signature** (un paramètre en dernier) des deux fonctions et des deux enveloppes publiques (`regulariser_charges_avec_justificatif`, `emettre_regularisation_fourniture`). L'ancienne signature vaut « faux » (refus). Droits des secondes signatures = ceux des jumelles (comparés rôle par rôle), rien pour `anon` ni PUBLIC. Les deux actions transmettent la case cochée. |
| T3R-2 (important) | **corrigé** | Nom libre pour une personne qui n'est ni caution ni locataire d'un bail en préparation mais qui a un bail signé terminé (titulaire), un départ enregistré d'un bail signé (colocataire), un lot détenu ou un mandat non résilié. Lecture commune à l'action et à la fiche : `src/lib/pieces-regime.ts` (session du gérant, aucune clé de service). Le locataire d'un bail signé en cours reste libre comme avant. |
| T3R-3 | **dit dans le test** | Titre et commentaire du test : le refus est tenu par l'action serveur (formulaire forgé compris), pas par la base. Pas de déclencheur : il faudrait recopier en SQL toute la lecture de la place de la personne (non simple). Pas d'élévation de droits (le gérant écrit ses propres demandes). |
| T3R-4 | **corrigé** | L'e-mail reproduit en entier le texte du décret joint à une pièce de la liste (sept pièces dépassaient 300 caractères) ; une précision libre reste abrégée à 300. |
| T3R-5 | **corrigé** | II-B-1 : « Extrait K bis original de moins de trois mois de la société ou les statuts » ; I-D-6 : « Attestation de simulation établie par l'organisme payeur ou simulation établie par le locataire » (débuts mot pour mot ; le texte entier reste joint). Le texte complet de I-D-6 (126 caractères) dépasse la limite de 120 de la base. Test : chaque nom est le début mot pour mot de son texte. Empreinte des 34 textes inchangée. |
| T3R-6 | **corrigé** | (a) une pièce « unique » déjà reçue se redemande ; seule une demande en cours bloque. (b) annexe II : « … (caution) » ajouté aux deux rubriques « une pièce » (identité, domicile) : candidat et caution distincts, une demande de domicile pour chacun. Aucune demande à ces noms n'existe hors du banc (lot T3 jamais publié). |
| T3R-7 | **corrigé** | Reçu de dépôt d'un bail meublé (plafond de deux mois) : en-tête « Loi n° 89-462 du 6 juillet 1989 », sans article ; bail nu : « Article 22 » inchangé. Montants inchangés. |
| T3R-8 | **corrigé** | En-tête de la migration `20261125111000` complété (commentaire seul) ; test en base des baux étudiants de neuf mois : 29/05/2025, 30/05, 31/05 → 28/02/2026 (27/02 avant) ; 31/07/2025 → 30/04/2026 ; 31/12/2025 → 30/09/2026 ; 29/05/2027, 31/03, 01/09, 31/10 : inchangés. |

## 2. Preuves (vérifié)

- Sonde de la relecture (`T3R/tmp/sonde1.sql`, rôle `authenticated`) : avant → `2012 | -5000.00` enregistré (`$S/lotT3R2/sonde1-avant.out`) ; après → refus « confirmation nécessaire » (`sonde1-apres.out`).
- `tests/textes-t3-reprise-base.test.ts` (12, avec base) : refus sans confirmation par les quatre voies (fonction, enveloppe, fournitures publique et interne ; la fiche du décompte est annulée avec le refus) ; accepté avec, au centime ; trop-perçu et exercice récent inchangés ; la confirmation ne fuit pas d'un appel à l'autre ; droits identiques ; gérant d'un autre espace refusé même confirmé ; quatre citations du jour de Paris gardées ; rejeu, retour (texte du lot T3 rendu à l'identique, md5 vérifié ; l'appel direct est de nouveau accepté : c'est l'état d'avant), marche avant ; définition inattendue → arrêt sans rien modifier ; T3R-8.
- Tests unitaires lancés sur le code d'avant (src remis à `4a410eda`) : 11 échecs dans `textes-t3.test.ts` (T3R-2, 4, 5, 6, 7), 5 dans `textes-t3-regularisation`/`loyers-saisies-et-envoi` (T3R-1 côté action) ; tous passent après (`$S/lotT3R2/avant-unitaires-2.txt`).
- Tests mis à jour parce qu'ils affirmaient l'état fautif : `textes-t3-base` (complément ancien sans confirmation accepté ; ordre des retours), `audit-gestion-2026-09-29` (idem), `textes-t2-reprises` (« la migration T3 reste la dernière » → « aucune migration suivante ne touche `enregistrer_depart_colocataire` »), `loyers-suivis-depuis-base` (la seconde signature est hors de son périmètre), `prudences-juridiques-sans-texte` (la fiche lit la place par le module commun), mocks de `pieces-demandees-actions` et `textes-t3` (lots, mandats ; filtres d'état et de départ appliqués).
- 157 fichiers liés : 3 136 réussis ; seul échec, l'attendu `lot3-notifications-base`. `tsc` 0, eslint 0.

## 3. Supposé / non vérifié

- PostgREST réel (production) : la sélection d'une signature par les noms de paramètres est supposée identique à l'émulateur du banc (qui fait comme PostgREST 14). Non vérifié hors banc.
- Production : définitions des deux fonctions supposées identiques au banc (sinon la migration s'arrête proprement).

## 4. Questions pour le dirigeant

1. T3R-1 : « default false » a été réalisé par une seconde signature (l'ancienne vaut « faux ») et non par un paramètre à valeur par défaut, qui aurait rendu ambigus les appels existants ; même méthode que la reprise D2. D'accord ?
2. T3R-3 : un contrôle du nom de la pièce en base (déclencheur) est-il voulu ? Il faudrait recopier en SQL la lecture de la place de la personne.
3. T3R-2 : un ancien propriétaire (détention close, aucun mandat) ou une ancienne caution sans autre lien retombe sur la liste des candidats (annexe I). Faut-il aussi lui rendre le nom libre ?
4. T3R-6 : redemander une pièce d'identité déjà reçue est permis sans motif ; faut-il exiger un motif (périmée, illisible) ?

## 5. Points pour JURISTE.md

- À ajouter : redemander « une pièce justificative d'identité » quand celle reçue est périmée ou illisible reste-t-il « une pièce » au sens du décret ?
- À ajouter : le reçu de dépôt d'un bail meublé ne cite plus d'article (l'article 25-6 n'est pas dans le recueil) : faut-il citer l'article exact ?
- Inchangé : terme d'un bail commencé un 29 février (28/02) et, désormais aussi, d'un bail étudiant de neuf mois commencé un 29, 30 ou 31 (fin de mois) : confirmer le dernier jour.

## 6. État du banc

Commit `7180794e`. Contrôle commun aux deux lots : `precheck.sh EPX d9380013` — préparation (toutes les migrations du manifeste, dont `20261125151000`), compilation et 13 parcours réussis, dont `textes-t3.spec.ts` (`$S/banc-integ/EPX.status`). Suite vitest complète : seuls échecs, les attendus. Aucun serveur laissé.
