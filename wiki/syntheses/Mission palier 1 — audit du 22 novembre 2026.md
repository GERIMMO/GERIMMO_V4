---
type: synthesis
tags: [audit, palier-1, conformite, securite, ia, plan-de-correction, documents]
status: in-progress
created: 2026-11-22
updated: 2026-11-26
sources: ["log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)"]
---

# Mission palier 1 — audit du 22 novembre 2026

**En une phrase :** à la demande du dirigeant, Gerimmo est audité puis corrigé en autonomie pour le palier 1
([[Propriétaire bailleur]], [[Locataire]], [[Artisan]], incidents, gestion administrative, [[Super Admin]]) ; la
production a été gelée jusqu'à sa validation écrite, puis la version issue de la mission (`062296e2`) est en
production depuis le 25/11/2026 ; l'audit complet est dans `AUDIT.md`, à la racine du dépôt.

> [!info] Publication du 25/11/2026
> Après le message du dirigeant « Je valide la publication », la version préparée `062296e2` (branche réunie
> `claude/palier-1-fusion` `89cb87ff`, complétée jusqu'à `062296e2`) est en production depuis le 25/11/2026 à 23:17Z
> (26/11 à 00 h 17, heure de Paris), par la PR #358 : `main` = `8f9dd9ce`, identique à `062296e2`. Elle remplace
> `81740dec` (version du 21/11). Ses 52 migrations sont appliquées (25/11, 22:09Z) ; la recette de production n° 58 a
> réussi. Les souscriptions payantes restent **fermées** (`/tarifs` relue le 25/11 après la publication).
> **Pas encore fait au 26/11** : les réglages de la console, à faire par le dirigeant (plan de publication, § 4, R1 à
> R8 : identité du vendeur, archivage des conditions du 24/11, contrôle du mode IA, repères fiscaux, parcours manuel
> de 15 minutes, ouverture des cinq envois automatiques, en-tête Stripe, puis l'ouverture des souscriptions si le
> dirigeant la décide). Ce qui en dépend est en ligne mais pas encore réglé ni ouvert. Ce qui était « non vérifié », « supposé » ou « à trancher par le juriste » le reste : la
> publication ne vérifie rien de juridique. Source : `log.md`, entrée « deploy » du 25/11/2026 ; `JOURNAL.md`, entrée
> du 25/11 (nuit).

## Où lire quoi

| Fichier (racine du dépôt) | Contenu |
|---|---|
| `AUDIT.md` | État de chaque module, conformité légale, écart avec les plateformes de référence, dépendance à l'IA, plan fermé P0 / P1 / P2 |
| `QUESTIONS.md` | Les choix qui appartiennent au dirigeant, avec l'option prudente prise en attendant |
| `JURISTE.md` | Les questions fermées à poser à un juriste ou à un expert-comptable ; aucun de ces points n'est présenté comme conforme |
| `JOURNAL.md` | Cinq lignes par lot de travail |
| `audit-palier-1/` | Huit relevés détaillés (fichiers, lignes, requêtes, sources) et les avis de sécurité de la production |

## Ce que l'audit établit (première version, 22/11/2026)

- **Version auditée** : `e1e442dc`, contrôle automatique complet vert. Rien n'a été modifié pendant l'audit.
- **Aucun module n'est une simple maquette** ; aucune fonction appelée par un écran n'est absente de la base.
- **Sécurité** : cloisonnement actif sur les 227 tables, prouvé par requête ; aucun défaut grave
  ([[Isolation multi-organisation]], [[Socle de sécurité]]). Restent : antivirus non relié, reprise d'activité non
  prouvée de bout en bout ([[Plan de reprise d'activité]]), 16 règles de conservation inactives sur 58
  ([[Durées de conservation]]).
- **Un risque d'argent compté deux fois** entre la [[Régularisation des charges]] et la
  [[Restitution du dépôt de garantie]], à confirmer en exécution.
- **IA** : un seul fournisseur ; le cœur du métier n'appelle jamais l'IA ; la déclaration d'incident est déjà un
  formulaire et le créneau se choisit déjà à la main ([[Cycle de vie d'un incident]],
  [[Planification d'intervention]]). Aucun réglage ne coupe aujourd'hui l'IA proprement : un interrupteur super admin
  est au plan. *(Constat du 22/11 ; l'interrupteur du lot 2, migration `20261122120000`, est en production depuis le
  25/11/2026.)*
- **Envois suspendus** : avis d'échéance, relances, rappels de rendez-vous sont codés mais fermés par la liste fermée
  du pilote ([[Quittancement des loyers]], [[Relances et mise en demeure]]).

> [!warning] Points à trancher / contradictions
> - **Les textes officiels n'ont pas été ouverts** : le réseau de l'environnement de travail refuse Légifrance,
>   service-public, l'ANIL, la CNIL et l'INSEE. Tout le volet juridique repose sur des extraits de recherche du
>   22/11/2026 ; **aucun point n'est noté conforme**. Les écarts relevés ([[Bail]], [[État des lieux]],
>   [[Mentions obligatoires du bail]], [[Vétusté et décote]], [[RGPD]]) sont « à confirmer à la source ».
> - **Deux textes signalés par les extraits et absents du wiki** : un décret n° 2026-596 du 6 juillet 2026 (contrat
>   type applicable aux baux conclus à partir du 1er octobre 2026) et un arrêté du 9 octobre 2026 sur la notice
>   d'information. Aucune source déposée dans `raw/` ne les porte : à lire avant toute affirmation.
> - **« Référentiel du palier 1 »** : aucun document de ce nom ; le cahier Gerimmo V3 (`raw/assets/`) et les décisions
>   du wiki en tiennent lieu, dans le périmètre donné par le dirigeant.
> - Les pages [[Planification d'intervention]] et [[Intervention et clôture]] sont en retard sur le code.

## Phase 2 — corrections en autonomie (état au 23/11/2026, lot 34)

Le détail, lot par lot (ce qui est fait, vérifié, non vérifié, retour arrière), est dans `JOURNAL.md` à la racine.
Chaque lot est vérifié sur une base d'essai remise à neuf (migrations rejouées, tests, parcours navigateur) avant
d'être poussé sur la branche de préproduction ; rien n'était publié en production pendant la mission. *Mise à jour
du 26/11 :* la version qui réunit ces lots (`062296e2`) est en production depuis le 25/11/2026 (encadré du début de
page).

| Lot | Point du plan | Ce qui change pour l'utilisateur |
|---|---|---|
| 1 | P0-02 | Un complément de charges réglé par échéancier n'est plus compté impayé au décompte de sortie ([[Régularisation des charges]], [[Dépôt de garantie]]) |
| 2 | Interrupteur IA | Le [[Super Admin]] coupe toute l'IA d'un réglage ; chaque fonction garde son équivalent manuel |
| 3 | P0-10 | Les envois à OpenAI sont déclarés (confidentialité, liste des prestataires) — voir [[RGPD]] |
| 4 | P1-17, P1-19 | Route planifiée refusée sans jeton avant toute lecture ; « Les règles à connaître » liée depuis l'aide |
| 5 | P1-01 | Signature électronique d'un [[Bail]] avec garant : le lien de confirmation part au garant |
| 6 | P1-04 | Le bailleur corrige l'urgence d'un incident après la déclaration ([[Déclaration d'incident]]) |
| 7 | P1-07 | Le [[Super Admin]] examine et retire une évaluation d'[[Artisan]] contestée |
| 8 | P1-18 | Le recommandé électronique est masqué tant qu'aucun service n'est relié |
| 9 | P1-02 | La reprise comptable se retrouve après un rechargement et peut être abandonnée |
| 10 | P1-06 | Le [[Locataire]] voit l'état de la signature électronique qui le concerne |
| 11 | P1-03 | Une facture d'[[Artisan]] erronée se refuse avec un motif ; l'artisan en dépose une autre ([[Intervention et clôture]]) |
| 12 | P1-05 | Un nouveau message dans la discussion d'une intervention est signalé à chacun ([[Intervention et clôture]]) |
| 13 | P1-14 | L'avenant signé s'enregistre et modifie le loyer et la provision à sa date d'effet ([[Bail]]) |
| 14 | P1-13 | La révision annuelle du loyer est rappelée à la date anniversaire ; l'indice se cherche chez l'Insee, ou se saisit ([[Révision annuelle IRL]]) |
| 15 | P1-08 | Avis d'échéance, relance amiable, rappel de rendez-vous, relance d'invitation : quatre e-mails prêts, **fermés**, que le [[Super Admin]] ouvre un par un |
| 16 | P1-16 | L'[[Artisan]] refusé ou suspendu reçoit les motifs par e-mail ; la fiche dit si l'e-mail est parti et permet de le renvoyer |
| 17 | P1-19 (fin) | Un [[Incident]] déclaré depuis la fiche du bien a sa catégorie et son urgence, comme depuis l'écran « Incidents » ([[Déclaration d'incident]]) |
| 18 | P0-06 | L'[[État des lieux]] de sortie imprime la date de celui d'entrée ; à défaut, un blanc à compléter à la main |
| 19 | P0-03 | Un poste d'[[Appel de charges]] naît « à qualifier » : plus rien n'est « récupérable » sans la confirmation du gestionnaire ([[Régularisation des charges]]) |
| 20 | P1-09, P1-12 | L'écran de [[Restitution du dépôt de garantie]] dit que le décompte finalisé est figé, sans rectificatif, et que les durées de vie proposées sont indicatives |
| 21 | P1-10, P1-11 | Un numéro d'article non vérifiable est retiré de l'écran des loyers ; le point de l'audit sur le [[Diagnostic]] remplacé est écarté (erratum) |
| 22 | P2-02 | Le [[Locataire]] indique ses disponibilités dès qu'il signale un incident ; le gestionnaire les lit au dossier |
| 23 | P2-01 | Une photo par élément de l'[[État des lieux]], imprimée et numérotée dans le document ; figée à la signature |
| 24 | P2-02 (fin) | L'[[Artisan]] écrit la garantie qu'il annonce sur son [[Devis]] ; le gestionnaire la lit au dossier et sur le PDF, avec « Engagement de l'artisan, pas de Gerimmo » |
| 25 | P2-03 | L'[[Artisan]] déclare ses absences (aucune nouvelle demande ne lui est envoyée pendant) et sa semaine type (elle préremplit ses créneaux) ([[Demande et sélection de devis]]) |
| 26 | P2-04 (deux parties) | Un rendez-vous manqué se consigne (qui était absent, qui le dit) ; l'[[Artisan]] relance son client pour une facture déposée depuis 30 jours, sans e-mail ([[Intervention et clôture]]) |
| 27 | P2-04 (fin) | L'[[Artisan]] garde ses lignes de [[Devis]] (libellé, prix, TVA) et les reprend d'un geste dans ses devis suivants ; lui seul les lit |
| 28 | P2-05 | Le [[Propriétaire bailleur]] pointe ses loyers à partir du relevé exporté par sa banque : lu sur son appareil, rapproché des loyers à recevoir, enregistré seulement après confirmation ([[Quittancement des loyers]], [[Comptabilité]]) |
| 29 | P2-06 | L'agenda du [[Propriétaire bailleur]] montre aussi ses échéances : loyers appelés et leur état, états des lieux, départ annoncé par un congé, date de fin inscrite au bail ; lecture seule ([[Agenda et échéances]]) |
| 30 | P2-07 | Avant de solliciter un [[Artisan]], le [[Propriétaire bailleur]] lit un repère de prix sourcé pour le métier (trois métiers), avec « ni un tarif, ni un prix maximum, ni un engagement » ([[Devis]]) |
| 31 | P2-08 (base) | Rien de visible : 46 droits d'écriture sans règle retirés sur 21 tables ; aucune table, fonction ni donnée supprimée |
| 32 | P2-09 | Le plafond et l'abattement du micro-foncier cités par l'aide du récapitulatif fiscal ([[Fiscalité]]) ne sont plus écrits dans le code : le [[Super Admin]] les règle et date leur vérification ; le [[Propriétaire bailleur]] lit la date, ou qu'il n'y en a pas |
| 33 | P0-04, P0-07, P0-08, P0-09, P0-11 | Faute d'avoir pu relire les textes, Gerimmo avertit au lieu d'affirmer : pièces demandées à un candidat (plus de « RIB » d'un clic, rappel), notice d'information dite « résumé », congé pour vente ou reprise « à faire relire » (et lettre de reprise refusée tant que le bénéficiaire, son lien, son adresse et les raisons manquent), caution d'un bailleur en société, numérotation des factures d'artisan ([[Dossier locataire]], [[Mentions obligatoires du bail]], [[Garantie]]) |
| 34 | P1-08 (complément) | Le [[Locataire]] ne lit plus « nous vous le rappellerons la veille » tant que le rappel de rendez-vous est fermé : « Notez bien cette date : aucun rappel ne vous sera envoyé. » ([[Planification d'intervention]]) |

**Règle métier posée au lot 11** (source : cahier Gerimmo V3, module 9, variante V5 — « l'agent la refuse, l'artisan
la corrige ou la justifie ») : une intervention ne porte qu'**une facture en vigueur** ; une facture refusée reste au
dossier, intacte, avec son motif ; refus et validation s'excluent. La question de l'avoir et de la numérotation est
posée à l'expert-comptable (`JURISTE.md`, partie 4) : elle n'est pas tranchée.

**Règle posée au lot 15** (décision de prudence de l'agent, à confirmer par le dirigeant : `QUESTIONS.md`, Q6 et
Q24) : aucun e-mail automatique ne part tant que le Super Admin n'a pas ouvert l'envoi correspondant ; pour l'avis
d'échéance et la relance d'un loyer, chaque espace doit en plus donner son accord ; même ouvert, un e-mail ne part que
si la base confirme, juste avant, qu'il est toujours dû. Aucun e-mail réel n'a été envoyé pendant la vérification.
*26/11 : en production depuis le 25/11/2026, les cinq envois automatiques (les quatre du lot 15 et la relance d'une
demande de report, Q37) restent fermés tant que le dirigeant ne les ouvre pas un par un dans la console (réglage R5 du
plan de publication, pas encore fait).*

**Règles posées aux lots 17 à 34** (prudences de l'agent ; aucune n'affirme une conformité) :

- *Charges de copropriété (lot 19)* : Gerimmo ne classe plus aucun poste de lui-même. La suggestion tirée de
  l'intitulé s'affiche, le gestionnaire choisit, poste par poste ; un intitulé de travaux, de gardien ou de
  désinsectisation ne reçoit aucune suggestion. La part récupérable en pourcentage reste une question au juriste
  (`JURISTE.md`, partie 2, points 9, 10 et 17).
- *Diagnostic de performance énergétique (lot 21)* : enregistrer un nouveau diagnostic archive le précédent, qui ne
  bloque plus la location. C'est le dernier diagnostic **enregistré** qui décide, pas le plus récent par sa date
  (constaté par exécution ; décision laissée au dirigeant, `QUESTIONS.md`, Q28).
- *Photos de l'état des lieux (lot 23)* : la photo est un document de l'espace, rangé dans les documents du bail ;
  elle se modifie tant que l'état des lieux n'est pas signé ni envoyé en signature, puis se consulte seulement.
  Aucune valeur juridique particulière n'est affirmée.
- *Garantie annoncée (lot 24)* : texte libre de l'artisan, facultatif, jamais vérifié ni complété par Gerimmo ;
  aucune garantie légale n'est citée ; le [[Locataire]] ne la lit pas, parce qu'il ne lit aucun devis (`QUESTIONS.md`,
  Q29 ; `JURISTE.md`, partie 4, point 7).
- *Absences de l'artisan (lot 25)* : pendant une absence déclarée, la demande est **refusée** (écran et base), pas
  seulement signalée ; ce qui est en cours continue. Le gestionnaire ne lit que « absent jusqu'au … » (Q30).
- *Rendez-vous manqué (lot 26)* : il se consigne seulement une fois l'heure passée ; l'artisan ne peut dire que
  l'absence du locataire, le gestionnaire celle de l'un ou de l'autre ; le locataire lit ce qui est dit de lui. Le
  compte des absences de l'artisan est affiché, il **n'entre pas** dans sa note (Q32 ; écart avec le cahier V3,
  modules 10 et 11, laissé au dirigeant).
- *Relance d'une facture (lot 26)* : possible 30 jours après le dépôt, puis tous les 15 jours ; ce sont des choix de
  produit, pas une règle de droit (Q31 ; `JURISTE.md`, partie 4, point 8). Aucun e-mail ne part.
- *Pointage par relevé de banque (lot 28)* : le fichier n'est ni transmis ni conservé ; une ligne n'est cochée
  d'avance que si son montant est le reste dû **et** que le nom du locataire figure au libellé ; les loyers d'un bail
  se pointent du plus ancien au plus récent ; une même ligne de relevé ne s'enregistre qu'une fois ; aucun e-mail ne
  part. L'enregistrement passe par la réception déclarée (mêmes garanties) et garde le libellé de la ligne dans la
  note du règlement (`QUESTIONS.md`, Q33 ; `JURISTE.md`, partie 3, A19quater). Aucune connexion bancaire.
- *Échéances de l'agenda (lot 29)* : l'agenda lit, il ne crée rien et n'envoie rien ; un loyer dont l'état ne peut
  pas être lu s'affiche sans état, jamais « reçu » ; « date de fin inscrite au bail » est la date du contrat, sans
  rien dire de la reconduction ni du préavis (`QUESTIONS.md`, Q34).
- *Repère de prix (lot 30)* : aucun chiffre nouveau (ce sont les repères d'octobre, datés du 12/10/2026) ; trois
  métiers seulement ; montré au propriétaire, jamais comparé au devis reçu ; la formulation est soumise au juriste et
  n'est pas présentée comme validée (`QUESTIONS.md`, Q35 ; `JURISTE.md`, partie 4, point 9).
- *Ménage de la base (lot 31)* : on ne retire que des droits déjà sans effet, et la modification le revérifie au
  moment de s'appliquer ; rien n'est supprimé (ni table abandonnée, ni fonction sans appelant, ni code inatteignable) :
  ces suppressions sont laissées au dirigeant (`QUESTIONS.md`, Q36).
- *Repères fiscaux (lot 32)* : une valeur fiscale affichée porte la date de sa dernière vérification, ou dit qu'il
  n'y en a pas ; une valeur illisible n'est pas affichée ; seul le Super Admin en double vérification la règle, et
  chaque réglage est journalisé avec la valeur d'avant. Les deux valeurs livrées n'ont **pas** été contrôlées à la
  source par l'agent : elles sont livrées sans date de vérification (`QUESTIONS.md`, Q38). Aucun calcul ne s'en sert.
  *26/11 : en production depuis le 25/11/2026 ; la saisie des repères (15 000 €, 30 %) avec leur source dans la
  console (réglage R4 du plan de publication) n'est pas encore faite.*
- *Prudences sans texte (lot 33)* : quand un point de droit n'a pas pu être relu, l'écran avertit et dit ce que Gerimmo
  ne vérifie pas ; il ne cite aucun article et ne bloque rien, **sauf** la lettre de reprise, qui n'est pas préparée
  avec des blancs (choix de prudence de l'agent). Les questions sont posées au juriste (`JURISTE.md`, partie 1, points
  36 à 40 ; `QUESTIONS.md`, Q39). La conservation des données (P1-15) n'est pas activée : elle supprime des données.
- *Une promesse suit l'envoi (lot 34)* : un écran ou un e-mail ne promet un envoi automatique que si cet envoi est
  ouvert ; fermé ou illisible, il dit le contraire. Un test parcourt tout le code à la recherche d'une promesse écrite
  en dur.
- *Un audit se réexécute* : l'audit du 22/11 est une lecture du code. Trois de ses points se sont révélés faux ou
  trop optimistes à l'exécution (le diagnostic remplacé, le réglage de la tâche de nuit des fermetures de compte, la
  relance d'un report de rendez-vous) ; ils sont rectifiés dans la section « Errata » de `AUDIT.md`, pas réécrits en
  silence.
- *Un cinquième e-mail retenu, hors plan* : la relance de l'[[Artisan]] avant l'échéance d'une demande de report
  ([[Planification d'intervention]]) est retenue par la liste fermée des e-mails, comme les quatre envois du lot 15.
  Trouvé le 22/11 en mettant le wiki à jour ; non corrigé (le plan est fermé), signalé au dirigeant (`QUESTIONS.md`,
  Q37) ; tous les e-mails seront repris un par un en phase 3.

**En attente du dirigeant** : « ok pour la copie de base » (Q1) et « ok pour les sites officiels » (Q5). Sans le
second, les corrections qui touchent une règle de droit (P0-03 à P0-09, P0-11, P1-09 à P1-12, P1-15) restent en
attente ou partent dans `JURISTE.md`.

## Phase 3 — documents générés (état au 24/11/2026, lots 35 à 49)

**État dans l'application au 24/11/2026 (préproduction ; en production depuis le 25/11/2026 avec la version
`062296e2`).** Le détail, lot par lot, est dans `JOURNAL.md`
(entrées du 23 et du 24/11, à partir de « Phase 3, vérification des documents »). **Aucun document n'est présenté comme
conforme** : les points de droit sont posés au juriste (`JURISTE.md`, partie 5, points 1 à 19) et les choix du
dirigeant dans `QUESTIONS.md` (Q40 à Q53) ; dans les deux cas, l'option la plus prudente est appliquée en attendant.

- **Ce qui a été produit** : six espaces de propriétaire fictifs complets (baux, colocation, dépôt et sortie, loyers,
  impayés, charges et travaux), aux données inventées, chaque geste passant par l'application ; les **46 modèles** de
  documents du palier 1 avec leurs variantes, soit environ 150 PDF, relus page par page, en texte et en image.
- **Relecture contradictoire** : chaque défaut relevé a été soumis à trois contradicteurs chargés de prouver qu'il n'en
  était pas un ; seuls ceux qui ont résisté sont gardés : **97 défauts confirmés**, dont 1 bloquant (un prorata faux)
  et une trentaine de majeurs.
- **Correction** : un lot par cause commune. Chaque lot est relu par deux relecteurs indépendants (l'un défaut par
  défaut, l'autre à la recherche de régressions), repris sur leurs constats, puis contre-relu ; les lots 43 à 49
  traitent ce que les contre-relectures ont encore trouvé. Chaque défaut a son test, qui échouait avant la correction.
- **Rendu des six espaces après les lots 48 et 49** (`JOURNAL.md`, entrée « Lots 48 et 49 ») : 108 documents au même
  état, textes et 148 images identiques, hors ce qui était visé.
- **Vérification complète** (24/11, base d'essai remise à neuf, commit 5f8cf977 ; `JOURNAL.md`, entrée « Entre deux
  lots : la vérification complète après les lots 35 à 49 ») : compilation, types et style sans erreur ; 14 961 tests
  réussis (31 mis de côté par conception) ; 309 parcours navigateur réussis du premier coup, 3 mis de côté par
  conception et 1 réussi au second essai (expliqué, corrigé). Poussé sur la branche de préproduction (d43eb1a0) ;
  rien n'était publié en production au 24/11. *Mise à jour du 26/11 :* repris dans la version `062296e2`, **en
  production depuis le 25/11/2026** (PR #358, `main` = `8f9dd9ce`).

| Lot | Thème | Ce qui change pour l'utilisateur |
|---|---|---|
| 35 | Mise en forme commune | L'étage écrit une fois (« 2e étage »), surfaces et index à la française (« 45 m² », « 4 521,3 »), signatures et « Fait à » jamais seuls sur une page, « le 1er du mois » ; les baux préparés avant la publication gardent leur ancienne mise en page pour s'activer (Q40, Q41) |
| 36 | Libellés lisibles | Les mots des écrans au lieu des codes de la base (« Usagé », « Absent », mode de règlement, période d'un terme au prorata) ; documents d'[[Incident]] sans consignes internes |
| 37 | Émetteur et destinataire | Chez un [[Propriétaire bailleur]] qui gère lui-même, les documents d'un [[Bail]] sont émis et signés par le bailleur ; « gestionnaire » seulement en agence ; courriers de recouvrement à l'adresse postale du [[Locataire]], ou à son nom seul (Q42 ; juriste, partie 5, point 1) |
| 38 | Dossiers proposés | Plus d'avenant ni de congé du bailleur sur un bail terminé, d'avis d'échéance sur un terme payé, d'acte de cautionnement pendant le préavis ; l'avis d'un terme passé le dit au passé (juriste, points 3 à 5) |
| 39 | Loyers et impayés | Le prorata imprime le loyer du mois concerné (défaut bloquant) ; IBAN du profil exigé quand un virement est demandé (Q45) ; protocole tiré du plan enregistré ; aucune relance proposée ni préparée sous [[Plan d'apurement]] (enregistrement : voir l'encadré ; Q44) ; la lettre de révision dit ce qui se passe pour le mois de l'effet (Q43) ([[Relances et mise en demeure]], [[Révision annuelle IRL]]) |
| 40 | Baux, notice, inventaires, avenants | Notice présentée comme un résumé ; inventaires datés à la signature ; « Sans objet — première location » ; avenant de remplacement d'un colocataire avec ses vraies signatures ; référence d'avenant stable ; plafond de la colocation dit « loyer maximal applicable au logement entier » (migration 20261123170000) ([[Mentions obligatoires du bail]], Q47, Q53) |
| 41 | Dépôt, états des lieux, clés, congé | L'[[État des lieux]] de sortie imprime la pièce de chaque écart et **n'imprime plus les retenues** (elles sont dans les décomptes) ; daté du jour du constat ; bordereau des clés daté de la remise ; « — » pour un numéro non saisi (Q49 ; juriste, points 13 et 14) ([[Restitution du dépôt de garantie]]) |
| 42 | Charges, travaux, comptabilité | Ordre d'intervention avec les heures du créneau et les travaux du devis, refusé sans devis (Q51) ; première mensualité d'une régularisation étalée au moins un mois après l'émission (migration 20261123150000, Q50) ([[Intervention et clôture]], [[Régularisation des charges]]) |
| 43 | Contre-relectures | « non déposé » pour une mission terminée sans compte rendu (récapitulatif d'incident) ; dates des documents de mandat en clair ; protocole et autorisation de travaux datés à la signature |
| 44 | Avis et relances (majeur) | L'avis d'un terme passé annonce le total vrai à sa date (1 890,50 € au lieu de 1 120 € dans le jeu d'essai) ; plus aucun écran ne propose de relance sous plan d'apurement ([[Quittancement des loyers]]) |
| 45 | Notice et état des lieux signé (majeur) | Le même résumé de notice, le plus récent, sur la fiche, le récapitulatif et la signature (Q46) ; un état des lieux signé sans index ni nombre de clés imprime « non relevé » / « non compté » (Q49 ; juriste, point 16) ([[Signature électronique]]) |
| 46 | Catalogue | Plus aucun document proposé puis refusé pour l'état du dossier ; un colocataire parti n'est plus traité comme locataire ; chaque « À renseigner » mène à l'écran qui corrige ([[Document]]) |
| 47 | Mots du locataire (majeur) | Chez un propriétaire, les e-mails et les écrans du locataire disent « votre bailleur » ; « gestionnaire » reste en agence. Aucun e-mail réel envoyé |
| 48 et 49 | Derniers constats, un retrait | Tests figés dans le temps ; « Gestionnaire » dans le fil d'une intervention en agence ; étage d'un duplex non redit ; contrat signé de première location renvoyé au texte du contrat (Q53) ; **alignement de la quittance en ligne (lot 48) retiré au lot 49** : elle reste telle qu'elle était en production (`81740dec`) (Q52 ; juriste, point 19) ([[Quittance conforme]]) |

**Règles posées par la phase 3** (prudences de l'agent ; aucune n'affirme une conformité) :

- *Un document ne dit que ce que fait l'application* : le protocole d'apurement promettait une suspension des relances
  que l'application n'appliquait qu'aux relances automatiques (écrans et courriers en proposaient encore) ; écrans et
  courriers la respectent désormais (Q44). La lettre de révision et le courrier de régularisation ne disent un délai
  ou un montant que si les dates du dossier le rendent vrai.
- *Le bon émetteur* : hors agence, les documents d'un bail partent des détenteurs du lot ; « gestionnaire » est réservé
  à l'agence. Une adresse inconnue n'est jamais inventée : le courrier porte le nom seul (Q42).
- *Ce qui est signé reste ce qui a été constaté* : l'état des lieux de sortie ne porte plus les retenues décidées après
  sa signature ; un état des lieux signé incomplet dit « non relevé », au lieu d'être bloqué pour toujours (Q49).
- *Alignement de la quittance en ligne retiré par prudence (lot 49)* : chez un propriétaire direct, la quittance
  consultée en ligne et son PDF n'ont pas la même adresse de bailleur. L'alignement du lot 48 (une modification de la
  base) faisait lire à un locataire, même ancien colocataire, l'adresse, l'e-mail et le téléphone des propriétaires
  **actuels**, même après une vente, et rendait inaccessibles des quittances déjà émises tant que la fiche du
  propriétaire n'avait pas d'adresse. Il a été retiré, le retour arrière joué sur le banc ; la version complète reste
  dans l'historique de la branche. Choix laissé au dirigeant (Q52) et question posée au juriste (partie 5, point 19).
- *Signature électronique* : un circuit préparé mais **pas encore envoyé** avant la publication (25/11/2026) est
  refusé à l'envoi (« Le dossier a changé depuis la préparation ») et à préparer de nouveau ; les circuits envoyés ou
  signés ne sont pas touchés ; une vérification en lecture seule était prévue au plan de publication (contrôle C3,
  Q40) : son résultat n'est pas repris dans le compte rendu de la publication (`JOURNAL.md`, entrée du 25/11 (nuit)).

> [!warning] Points à trancher / contradictions (phase 3, 24/11/2026)
> - **Relance datée d'avant le plan d'apurement** : le code de la préproduction (reprise du lot 44), en production
>   depuis le 25/11/2026 avec la version `062296e2`, ne refuse qu'une
>   relance datée du jour de l'activation ou après ; une relance envoyée avant (une mise en demeure et sa date de
>   première présentation) peut encore être consignée. `QUESTIONS.md` (Q44, point 2) et `JOURNAL.md` (lot 39) disaient
>   d'abord le contraire : relevé par la relecture du wiki, ils ont été rectifiés le 24/11. Reste au dirigeant à dire
>   s'il veut, au contraire, tout refuser pendant un plan (Q44). Voir [[Relances et mise en demeure]].
> - **Limites connues laissées ouvertes** : le décompte des retenues reste bloqué sans justificatif, alors que le
>   décompte de restitution imprime « Non fourni » (Q49) ; un même devis a deux références (Q51) ; un seul IBAN par
>   espace, pas par bailleur (Q45) ; des saisies rares d'un duplex répètent encore un niveau (Q41).
>   → *26/11 : pour Q49, tranché le 24/11 (lot D3) : sans pièce, les deux décomptes sont bloqués ; en production
>   depuis le 25/11/2026 avec la version `062296e2` ([[Restitution du dépôt de garantie]]).*
> - La synthèse [[Etat des lieux generation de documents]] décrit le catalogue d'août et de septembre ; elle n'est pas
>   réécrite et renvoie ici.

## Liens

[[État du projet et décisions ouvertes]] · [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]] ·
[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] · [[Recette de production]]
