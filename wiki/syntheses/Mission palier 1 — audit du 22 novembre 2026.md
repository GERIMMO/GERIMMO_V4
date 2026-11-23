---
type: synthesis
tags: [audit, palier-1, conformite, securite, ia, plan-de-correction]
status: in-progress
created: 2026-11-22
updated: 2026-11-23
sources: []
---

# Mission palier 1 — audit du 22 novembre 2026

**En une phrase :** à la demande du dirigeant, Gerimmo est audité puis corrigé en autonomie pour le palier 1
([[Propriétaire bailleur]], [[Locataire]], [[Artisan]], incidents, gestion administrative, [[Super Admin]]) ; la
production est gelée jusqu'à sa validation écrite ; l'audit complet est dans `AUDIT.md`, à la racine du dépôt.

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
  est au plan.
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
d'être poussé sur la branche de préproduction ; rien n'est publié en production.

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

## Liens

[[État du projet et décisions ouvertes]] · [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]] ·
[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] · [[Recette de production]]
