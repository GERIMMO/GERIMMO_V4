# Relecture adverse du lot T3 — commit 978be58b (parent 13495037)

**Rien de bloquant.** Deux défauts importants, six mineurs. Base de sonde `gerimmo_ci_sonde_ttrois` (564 migrations du parent, puis la migration, son retour, puis de nouveau la migration). Preuves : `T3R/tmp/` (sondes SQL, instantanés avant/après), `T3R/pdf/`.

## Important
- **T3R-1 — R16-A1 : la confirmation du complément ancien se contourne par appel direct ; régression par rapport au parent.** Preuve (`tmp/sonde1.sql`, rôle `authenticated`, propriétaire de l'espace) : `select public.regulariser_charges(bail, 2012, 5000, doc, null, false)` rend `-5000.00` et enregistre la ligne, sans aucune confirmation ; sur le parent, même appel : « Exercice 2012 prescrit… ». Les deux fonctions et leurs enveloppes publiques sont ouvertes à `authenticated`. L'auteur dit « comme pour l'exercice non terminé » : vrai pour la saisie à la main, faux pour la voie des factures, où la base exige déjà `p_exercice_en_cours`. Seul le gérant de l'espace peut le faire (pas d'élévation de droits). Correction minimale : un paramètre `p_exercice_ancien boolean default false` dans les deux fonctions et leurs deux enveloppes ; sans lui, la base lève « confirmation nécessaire » (et non « prescrit »).
- **T3R-2 — R19-A1 : le libellé libre est aussi retiré à des personnes qui ne sont ni candidates ni cautions.** `regimePieces({false,false,false})` rend `annexes:["I"]`, et `lireRegimePieces` ne lit que les baux brouillon, actif ou préavis. Un locataire sorti (bail `termine`) et un propriétaire mandant qui a un compte (la carte s'affiche dès `personne.account_id`) n'ont plus que la liste « candidat » : plus de RIB pour restituer le dépôt, plus d'attestation du propriétaire. Le parent laissait le libellé libre. Aucun test ne couvre ces deux cas. Correction minimale : régime libre quand la personne a un bail signé, même terminé, ou détient un lot ou un mandat, et n'est ni caution ni locataire en préparation.

## Mineur
- **T3R-3 — Refus du libellé libre : action serveur seulement, pas la base.** `tmp/sonde2.sql` : insertion directe par le gérant de « RIB et trois relevés de compte » pour un candidat sans bail, acceptée (aucune contrainte ; politiques inchangées). Ce n'est pas une régression, mais le titre du test « requête directe comprise » ne vaut que pour l'action. Correction : le dire, ou ajouter un déclencheur.
- **T3R-4 — Le texte du décret est coupé à 300 caractères dans l'e-mail** (`notifications.ts:565`, `extrait(p.note, 300)`). Sept pièces dépassent : I-A 494, I-B 606, I-D-1 411, II-A 302, II-B-1 344, II-C 324, II-E-1 374. Pour le domicile, l'e-mail ne cite qu'une partie des quatre documents admis ; l'espace du locataire affiche tout. Correction : pas de coupe pour ces notes, ou renvoi à l'espace.
- **T3R-5 — Deux noms de pièce ne sont pas mot pour mot.** II-B-1 finit par « ou toute autre pièce équivalente » (mot absent du décret) ; I-D-6 est reformulé. Les 34 `texte` complets, les 9 intitulés de rubrique et les 2 titres sont, eux, exacts (`tmp/verif.mjs`). Les autres noms sont des débuts de phrase exacts.
- **T3R-6 — Une « pièce unique » déjà reçue ne peut plus être redemandée.** L'annulation ne supprime que les demandes non satisfaites ; une identité illisible ou périmée reste donc bloquée. Autre effet : I-B et II-C portent le même nom alors que leurs listes diffèrent, et une personne à la fois candidate et caution n'a qu'une demande de domicile.
- **T3R-7 — Reçu de dépôt : « deux mois » sous le seul en-tête « Article 22 »,** qui dit un mois. L'article 25-6 n'est pas dans le recueil (l'auteur l'a noté). Le plafond suit bien le bail, aucun montant ne change (diff et PDF). Le bail mobilité n'existe pas dans l'application (`bail_type` : nu, meublé, colocation).
- **T3R-8 — Message du commit et en-tête de la migration incomplets sur le terme du bail.** Ils ne citent que le 29 février ; changent aussi les baux étudiants de neuf mois (liste ci-dessous). Les notes le disent (question 6), les tests ne le couvrent pas.

## Constats sans défaut
- **Article 7-1** : le recueil dit trois ans à compter du jour où le titulaire a connu ou aurait dû connaître les faits. L'avertissement le reprend sans dire « prescrit ». Seuil identique à l'ancien refus (2022 et avant au 24/11/2026).
- **Migration** : les trois fonctions gardent `SECURITY DEFINER`, `search_path=""`, propriétaire, volatilité et droits (`tmp/avant.acl`). L'instantané de toutes les fonctions, politiques et droits de tables ne montre que trois corps de fonction changés. Aucune donnée écrite. Rejeu sans effet ; le retour rend les trois empreintes du parent. Le diff des corps se limite au bloc retiré.
- **Terme du bail** (balayage de tous les débuts de 2019 à 2032, sept périodes) : +1 jour pour tout bail commencé un 29/02 (1, 3 ou 6 ans, toutes périodes : 27/02 → 28/02) et pour un bail étudiant de 9 mois commencé un 30/05, 31/05, 31/07, 31/12, ou un 29/05 hors année bissextile à l'arrivée. Les baux d'un, trois ou six ans commencés un 30 ou un 31 ne bougent pas. Rien n'est stocké : `date_fin` et les congés enregistrés restent. Bougent le terme affiché, la lettre de congé et la date limite du congé du bailleur (29/02/2024, 3 ans : 27/08/2026 → 31/08/2026). La révision n'utilise pas ce terme.
- **Caution, identité (annexe II, A)** : trois documents imprimés, finissant par « ; », comme le recueil (lignes 1889-1893).
- **Isolation** : aucune politique touchée ; le gérant d'un autre espace lit 0 ligne, `anon` est refusé.
- **État des lieux de sortie** : libellé identique au décret 2016-382, article 2, 2°, a (recueil ligne 1160). Un circuit préparé et non envoyé est refusé à l'envoi (« Préparez et relisez un nouveau PDF »).
- **Article 2303** : la date affichée (échéance + un mois, « par prudence ») n'est pas plus tardive que le texte. Le rappel ne distingue pas une caution personne morale.
- **Références** : toutes dans le recueil (7-1, 7 g, 22, 2303, décrets 2015-1437 et 2016-382). « Conforme » n'apparaît qu'au sens de l'article 22.
- **PDF** (6 rendus, pages regardées) : reçus d'une et deux pages, états des lieux de 2, 3 et 9 pages. Pas de coupure fautive ; signatures et adresse longue en place.
- **Tests** : 11 fichiers rejoués sur ma base, 171 réussis, 39 sautés. Les assertions modifiées suivent le nouvel état sans s'affaiblir.

## Non vérifié
- Les textes sur Légifrance (dont un éventuel 4e document de l'annexe II, A).
- Le bien-fondé du 28 février et du 31 août : question au juriste. La date limite recule de quatre jours ; si le terme juste était le 27, un congé reçu du 28 au 31 août serait tardif.
- Les définitions de fonctions en production (la migration échoue proprement si elles diffèrent).
- Les écrans dans un navigateur, les parcours Playwright, PostgREST réel (sondes en SQL sous `set role authenticated`), la suite complète.
- Les 39 tests sautés : je n'ai pas cherché lesquels.

Nettoyage : base de sonde et sa copie `_api` supprimées, `T3R/src` supprimé, aucun processus laissé, rien écrit dans `palier1` ni sur le banc.
