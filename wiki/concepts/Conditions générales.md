---
type: concept
tags: [conditions-generales, cgu, cgv, versions, acceptation, preuve, accord-expres, mediateur, vendeur]
status: in-progress
created: 2026-10-24
updated: 2026-11-25
sources: ["[[Abonnement]]", "[[Registre des traitements]]", "[[Relecture adverse et publication conformité V1 — 24 octobre 2026]]", "[[Audit final indépendant — PR 335 — 15 novembre 2026]]", "[[Recueil des textes officiels (v6)]]", "log.md — entrées « decision » des 23/10/2026 et 24/10/2026, « deploy » du 24/10/2026 (PR #246, PR #248 : publication de la V1)", "DECISIONS-2026-11-24.md (Q7, Q15, Q76)", "QUESTIONS.md (Q75, Q78 à Q83, Q85, Q91 à Q98, Q119, Q120)", "JURISTE.md, partie 9 (points 26 à 38, 42 et 43)", "JOURNAL.md — lots D7, T4, D4 et D5 (24-25/11/2026)", "livrables/notes-banc/notes-D7.md, notes-T4.md, notes-D4.md, fusion/corrections-fusion-notes.md", "livrables/recueil/analyse-refs-25-37.md", "code en production : 81740dec (branche repère claude/production-2026-11-22) — app/src/lib/editeur.ts, app/src/lib/conditions-versions.json, app/src/app/conditions/page.tsx", "version préparée : 89cb87ff (branche claude/palier-1-fusion) — mêmes fichiers, app/src/lib/garde-souscription-serveur.ts, app/src/lib/nouvelle-version-conditions.ts"]
---

# Conditions générales

**Définition :** le contrat entre l'Éditeur et le Client (propriétaire, ou SCI, qui gère ses propres biens), publié
sur `/conditions` : les **conditions générales d'utilisation et de vente**. Chaque version a une date
(`CONDITIONS_VERSION`) ; chaque version publiée est **archivée sans modification possible** (`versions_conditions`),
et chaque acceptation dit **quel document** a été accepté, dans quelle version et quand. Les artisans ont leurs propres
conditions (`/conditions/artisans`).

> [!info] Deux états à ne pas confondre
> - **En production aujourd'hui** : code `81740dec`, servi depuis le 21/11/2026 ; la production est gelée depuis le
>   22/11 (`QUESTIONS.md`, Q3 et Q4).
> - **Version préparée, à publier** : branche fusionnée `89cb87ff`, complétée par `ee28d874`, relue deux fois, vérifiée en entier sur le banc et
>   poussée le 25/11 sur la branche de préproduction `claude/palier-1-preproduction` (`JOURNAL.md`, entrée du 25/11),
>   **non publiée en production** ; rien ne part sans le message « je valide la publication » du dirigeant
>   (`DECISIONS-2026-11-24.md`).

## Les versions des conditions clients

| Version | Ce qu'elle a changé (résumé archivé dans `conditions-versions.json`) | État |
|---|---|---|
| 2026-09-30 | Essai porté à 2 mois jusqu'au 31/12/2026, 1 mois ensuite (article 8.2) | Archivée le 24/10 à 08:13 UTC |
| **2026-10-24 (V1)** | Offre réservée aux propriétaires qui gèrent leurs biens ; rétractation en ligne (8.10) ; résiliation en ligne (8.6) ; impayé (15) ; garanties légales (14 bis) ; signature électronique (4.7) ; conservation et inactivité de 24 mois (9) ; accord exprès (8.9, 16) ; médiation (17) ; annexes 1 et 2 | **Publiée le 24/10/2026** (PR #248) ; archivée à 09:23:25 UTC avec les conditions artisans ([[Relecture adverse et publication conformité V1 — 24 octobre 2026]]) |
| 2026-11-11 | Abonnement unique pour les nouvelles souscriptions des propriétaires et SCI, calcul par unité locative active, deux mois offerts en annuel ([[Grille tarifaire]]) | Publiée ; « nouvelles souscriptions uniquement » ; archivée d'après [[Audit final indépendant — PR 335 — 15 novembre 2026]] |
| **2026-11-15** | Deux mois calendaires gratuits pour toute nouvelle inscription, sans échéance de lancement (8.2) | **Version en vigueur en production** ; « nouvelles souscriptions uniquement » ; archivage non constaté dans les sources lues |
| **2026-11-24** | Voir ci-dessous | **Version préparée, non publiée, non archivée** ; « accord au prochain acte » |

Conditions de l'espace artisan : version **2026-10-24**, publiée et archivée le 24/10 avec la V1 ; **inchangées** dans
la version préparée (même empreinte, vérifié par les tests du lot T4). Leur annexe ne cite d'OpenAI que les
propositions de devis.

## La version préparée du 24 novembre 2026

Faite par les lots D7 (vendeur) et T4 (vente et données), reprise deux fois le 24/11 ; empreinte de garde
`67391a33…` (l'empreinte `d8c690ed…` du premier jet n'a jamais été publiée). Nature : **substantielle**. Ce qu'elle
change :
- **Article 2** : l'Éditeur est « **l'entreprise** identifiée aux mentions légales » (et non plus « l'entrepreneur
  individuel », écrit en dur).
- **Article 9** : les factures émises par l'Éditeur sont gardées « **au moins dix ans** » (au lieu de six). Texte
  appuyé sur la loi n° 2026-534, article 36, qui modifie l'article L. 102 B du livre des procédures fiscales —
  **texte du [[Recueil des textes officiels (v6)]], fourni par le dirigeant, non recontrôlé sur Légifrance**. La preuve
  de l'acceptation reste gardée dix ans après la fin du dernier abonnement payé. Voir [[Durées de conservation]].
- **Article 15.3** : « Le passage en lecture seule est appliqué automatiquement, à l'échéance prévue ci-dessus. » Une
  phrase sur le réexamen par une personne a été ajoutée puis **retirée** le même jour (Q82).
- **Article 17 (médiation)** : un seul texte, vrai avec ou sans médiateur. Le « Client consommateur » a le droit de
  recourir gratuitement à un médiateur de la consommation après une réclamation écrite restée sans solution ; le nom
  et les coordonnées figurent aux mentions légales dès qu'un médiateur est désigné, et la réponse qui clôt une
  réclamation faite depuis « Aide et retours » les rappelle ; tant qu'aucun n'est désigné, les mentions légales et
  cette réponse l'indiquent. L'ancienne phrase (« qui sera désigné aux mentions légales dès l'adhésion de
  l'Éditeur ») et le « non-professionnel » sont retirés. Saisir le médiateur ne change plus le texte du contrat.
  Fondement cité : code de la consommation, L612-1 et L616-1 (**recueil, non recontrôlé**).
- **Annexe 1 (sous-traitance)** : le rôle d'OpenAI décrit les trois envois réels — assistant « Demander à Gerimmo »
  (sujet et messages), lecture assistée d'une facture ou d'une photo de compteur (le fichier entier), propositions de
  devis (catégorie, symptômes d'une liste fermée, catalogue). Décision Q15 du 24/11 : « nouvelle version des
  conditions, accord exprès du client ». Voir [[Registre des traitements]].
- **Formulaire de rétractation** : la réserve « adresse du siège (à venir) » devient « adresse de l'éditeur (à
  venir) ».

Inchangés dans la version préparée : l'article 4.7 ([[Signature électronique]] : bail, avenants, acte de
cautionnement, état des lieux, accords d'échelonnement et de travaux, acceptation d'un devis ; Zoho Sign, code à usage
unique, aucune présomption de fiabilité) ; il ne décrivait pas l'ancien parcours « télécharger, signer, redéposer »,
retiré de l'application par le lot D5 (décision Q21). La phrase de l'état des lieux (« dans les dix jours qui suivent
son établissement ») correspond au mot du texte fourni (loi de 1989, art. 3-2, recueil, non recontrôlé).

## Le vendeur et le médiateur (version préparée)

- **Vendeur** : entrepreneur individuel, nom commercial SAUVEXPERT (avis Sirene du 24/11, `DECISIONS-2026-11-24.md`) ;
  ce n'est pas une société. Les conditions lisent son identité en base (`supervision_identite`), saisie par le super
  admin le jour de la publication (Q76) ; aucune valeur n'est écrite dans le code. Un « **type de vendeur** » se
  choisit dans la console (entrepreneur individuel, ou société ou autre personne morale) ; pour un entrepreneur
  individuel, le nom doit porter « EI » ou « entrepreneur individuel » (code de commerce, R526-27, **recueil, non
  recontrôlé**). Le nom commercial ne paraît que sur les mentions légales et la confidentialité, pas dans les
  conditions ni sur le formulaire de rétractation (Q79). Voir [[Entrepreneur individuel (EI)]] (page à créer).
- **Identité imprimée dans le contrat** : seuls le nom, l'adresse, l'e-mail de contact et l'encadré « Document en
  cours de finalisation » entrent dans l'identité archivée. Les changer après l'archivage met les **premières
  souscriptions** (particulier comme agence) en attente d'une nouvelle version. En production, la comparaison porte
  encore sur toute l'identité saisie, médiateur compris, et pour les seuls particuliers.
- **Médiateur** : aucun n'est désigné (Q7, Q75). Version préparée : la première souscription d'un **particulier**
  reste fermée tant qu'aucun médiateur n'est saisi, sauf décision datée du dirigeant (« Vente aux particuliers sans
  médiateur de la consommation », case « j'ai lu les deux articles », inscrite à l'historique, retirable). Détail :
  [[Souscription de l'abonnement]], [[Médiation de la consommation]] (page à créer).

## L'accord exprès à une nouvelle version (décision Q15, version préparée)

- La version du 24/11 est déclarée **« accord au prochain acte »** (les versions du 11/11 et du 15/11 étaient
  « nouvelles souscriptions uniquement » : un abonné n'était ni informé ni sollicité).
- Dès son archivage, l'écran « **Nos conditions générales évoluent** » s'affiche au responsable d'un espace dont la
  dernière acceptation porte une autre version : rappel à chaque connexion, « Plus tard » gardé. L'accord se donne par
  une **case non cochée par défaut** dont le libellé porte le lien vers le texte ; le serveur refuse sans la case.
- L'accord est redemandé au **prochain acte** : hausse de formule ou de capacité, changement de périodicité, reprise
  après résiliation (Q92). La résiliation et le renouvellement tacite ne demandent rien. Sans réponse, **rien n'est
  coupé et l'abonnement n'est jamais mis en non-reconduction** pour cette version (Q91). L'écran ne dit plus « rien
  ne change » : il renvoie à l'article 16.
- **Preuve** : seul compte un accord qui porte l'**empreinte du texte archivé** (recopiée par la base). Un accord donné
  avant l'archivage, une ligne forgée ou sans empreinte ne vaut pas preuve : la case est redemandée à la souscription
  (relectures D4R-01 et R-01). La fonction de la base qui enregistre l'accord ne refuse plus rien (texte du 24/10
  gardé) ; seule la non-reconduction exige l'empreinte.
- **Garde d'archivage** : une nouvelle version des conditions clients ne peut pas être archivée tant qu'il existe un
  abonné actif, parce que l'annonce par courriel promise par l'article 16 n'est pas écrite (Q93) ; un client en essai
  n'est pas compté comme abonné (Q98). Aucun abonné à ce jour (Q64 : les deux comptes du 19/11 sont des tests).
- **À chaque nouvelle version** : ajouter son identifiant aux deux listes du courrier d'impayé (code et base,
  migration `20261125104000` pour le 24/11), sans quoi un client souscrit sous cette version ne recevrait pas le
  courrier de l'article 15 ([[Impayé de l'abonnement]]).

## L'archive des versions (en production depuis le 24/10)
- Table `versions_conditions`, **en ajout seul** : document (`conditions_clients` ou `conditions_artisans`), version,
  date d'effet, nature (substantielle ou technique), texte HTML, **identité de l'éditeur figée**, **empreinte
  SHA-256** recalculée par la base, résumé des modifications ; lecture publique, écriture par la seule fonction
  d'archivage.
- **Archivage** depuis la page Santé de la console (super-administrateur permanent, second facteur), après chaque mise
  en ligne : la page servie est relue, reconstituée et normalisée ; une page dégradée ou rendue avec une autre identité
  est refusée ; une même version avec une autre empreinte est refusée avec une alerte au dirigeant.
- Pages publiques **`/conditions/versions`** et **`/conditions/versions/{document}/{version}`**.
- Une garde de tests (`conditions-versions.json`) échoue si le texte change sans nouvelle version.
- **Jour de la publication** (plan de publication) : saisir l'identité du vendeur et son type, contrôler zéro abonné
  actif, puis archiver la version du 24 novembre 2026 ; si l'archivage est refusé, ne rien forcer.

## L'acceptation, selon l'espace
| Espace choisi à l'inscription | Case | Document enregistré |
|---|---|---|
| Propriétaire (Client) | « J'accepte les conditions générales d'utilisation et de vente » | `conditions_clients` |
| Artisan | « J'accepte les conditions de l'espace artisan » (publiées depuis le 24/10/2026) | `conditions_artisans` |
| Personne invitée (locataire) | « J'ai pris connaissance des règles d'utilisation des espaces invités (article 7 des conditions générales) » — l'invité ne contracte pas | `regles_invites` |

- La case n'est jamais pré-cochée ; elle est remontrée quand son texte change.
- « Mon compte » affiche « Conditions acceptées : version du {date}, le {date} — consulter ».
- L'acceptation reçoit de la base l'**empreinte** de la version archivée au moment de l'acceptation (nulle tant que la
  version n'est pas archivée) ; `acceptations_sans_version_archivee()` (page Santé) dit ce qui manque.
- La preuve de l'acceptation est copiée dans `archives_comptes` avant la suppression d'un compte payant
  ([[Fermeture de compte]]).
- La règle d'inactivité (24 mois, `compte:inactif`, `VERSION_MIN_INACTIVITE`) est active en production depuis la
  publication de la V1 (migration `20261024150000`, appliquée le 24/10).

## Relations
[[Abonnement]] · [[Souscription de l'abonnement]] · [[Grille tarifaire]] · [[Registre des traitements]] (P1, P2) ·
[[Durées de conservation]] · [[Rétractation en ligne]] · [[Résiliation de l'abonnement]] ·
[[Impayé de l'abonnement]] · [[Fermeture de compte]] · [[Export complet des données]] ·
[[Signature électronique]] · [[Retours utilisateurs]] · [[Artisan]] · [[Locataire]] · [[RGPD]] ·
[[Recueil des textes officiels (v6)]] · [[Médiation de la consommation]] · [[Entrepreneur individuel (EI)]]

> [!warning] Points à trancher / contradictions
> - **Médiateur : la décision contredit la règle générale** (Q75). Le dirigeant a écrit « on peux ouvrir les ventes même
>   sans ce dernier » ; sa règle générale est « tout doit respecter les textes de loi », et le texte fourni (L612-1,
>   L616-1, recueil non recontrôlé) ne prévoit aucune exception. Option appliquée : fermé aux particuliers par défaut,
>   ouverture sur décision datée. Sanction, modalités du décret et cas de l'essai gratuit : au juriste (partie 9,
>   point 26).
> - **Article 17 préparé** : suffit-il tant qu'aucun médiateur n'existe ? Le « non-professionnel » (SCI familiale)
>   n'y figure plus (Q81) ; réclamation reçue par courriel : c'est la personne qui répond qui rappelle le médiateur
>   (Q83). Les contrats conclus sous la version du 15/11 gardent l'article 17 « adhésion » (aucun contrat payant à ce
>   jour, supposé). JURISTE.md, partie 9, point 27.
> - **Article 16, second alinéa, face à l'accord exprès** : les changements autres que prix, durée et caractéristiques
>   essentielles « s'appliquent à la date annoncée », mais Gerimmo demande l'accord au prochain acte. Quelle version
>   régit un abonné qui n'a pas répondu ? (juriste, partie 9, point 35). Le courriel d'annonce et le préavis d'un mois
>   de l'article 16 ne sont pas automatisés (Q93, point 36) ; la preuve de l'accord n'a ni adresse IP ni copie envoyée
>   sur support durable (point 37).
> - **Accord donné avant l'archivage** (relecture de la fusion, R-01) : la section « Preuve » dit qu'il est redemandé à
>   la souscription ; d'après la relecture, l'écran « Nos conditions générales évoluent » se masque pourtant dès qu'une
>   version est acceptée, avec ou sans empreinte, et ne le redemande pas (sans effet aujourd'hui : aucun abonné, archivage
>   refusé s'il en existe un). Exiger l'empreinte aussi pour cet écran et pour le rappel des comptes inactifs ?
>   (`QUESTIONS.md`, Q119 et Q120 ; juriste, partie 9, point 42). Résumé des changements de l'article 16, complété avant
>   l'archivage : `JURISTE.md`, partie 9, point 43.
> - **Contournement connu** : la fonction de la base qui change la périodicité peut être appelée directement, sans
>   l'accord à la nouvelle version (D4R-04, Q96) — non corrigé.
> - **Lecture seule automatique et RGPD, article 22** (15.3 et 8.2) : réexamen par une personne dû ou non ? (Q82 ;
>   juriste, partie 9, point 30).
> - **Annexe 1 élargie** : l'annexe promet une information « par courriel, au moins un mois à l'avance » de tout ajout
>   ou remplacement de prestataire ; due aux abonnés pour une description élargie ? (juriste, partie 9, point 31).
> - **Espace artisan et règlement (UE) 2019/1150** : raisons de chaque critère du classement et motif d'un refus pris
>   dans la liste de l'article A10 non faits ; ils demanderaient une nouvelle version des conditions artisans (Q85).
> - **Textes reproduits ou cités et non recontrôlés** : annexe 2 (L. 215-1 à L. 215-3, L. 241-3), encadré 14 bis
>   (D. 211-4), formulaire de rétractation (R. 221-1), preuve du contrat (L. 213-1) : absents du recueil, à recomparer
>   sur Légifrance. Rétractation en ligne (L221-21, D221-5), dix ans des factures, médiation, mention « EI » : lus dans
>   le recueil fourni par le dirigeant, **non recontrôlé sur Légifrance**.
> - **Production** : état de l'archive de la version du 15/11 et identité saisie non lus. Si la version en vigueur est
>   archivée avec une autre identité, l'archivage refusera après la saisie du vendeur (notes D7, partie 6).
> - **Pages de test du contrat** (`conditions-next-start*.html`) adaptées par script, pas relevées sur un vrai
>   serveur (T4R-09) : à relever avant la publication.
> - Réglés : la publication de la V1 et de son archive (24/10) ; l'activation ensemble de `VERSION_MIN_INACTIVITE` et
>   de `compte:inactif` (24/10) ; la phrase « adhésion à venir » du médiateur (version préparée).
> - *Repris de la version du 24/10 de cette page, non relus un par un dans les sources du 25/11* : les autres points
>   « à aligner avant de publier la V1 » (« Faire une réclamation » à l'article 17, phrase de l'article 9 sur l'archive
>   complète, « Chaque signataire reçoit un exemplaire » hors du texte tant que la recette Zoho à trois signataires
>   n'est pas faite, date réelle de la version, `/conditions/artisans` au plan du site) ; l'encadré 14 bis qui ne couvre
>   pas l'essai gratuit. **Médiateur en production** : saisir ses coordonnées changera encore le texte publié de
>   l'article 17 et demandera une version technique ; la version préparée supprime ce lien (article 17 identique avec
>   ou sans médiateur).

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les
corrections retenues et les réserves de la V1. P2B : les conditions A9/A12 de l'espace artisan ont été complétées pour
l'accès aux données, leur sort après fermeture, les préavis étendus et l'absence de modification rétroactive
défavorable.
