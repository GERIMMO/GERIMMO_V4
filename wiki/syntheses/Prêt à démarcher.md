---
type: synthesis
tags: [demarchage, lancement, production, v1, pilotage, promesses]
status: draft
created: 2026-10-16
updated: 2026-10-23
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Invitation d'un artisan par un propriétaire]]", "[[Dossier de validation — version candidate du 13 octobre 2026]]", "[[Registre des anomalies — audit du 13 octobre 2026]]", "[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]", "[[Audit d'acquisition du 3 octobre 2026]]", "[[Expansion territoriale autonome]]", "[[Parrainage]]", "[[Choisir son locataire selon les conditions des assurances loyers impayés]]", "[[Recette de production]]", "[[Relais du dirigeant]]", "[[Le jour de référence est le jour de Paris]]"]
---

# Prêt à démarcher

> [!warning] Point du 22 octobre — ce que le 21/10 a changé en production
> Depuis les livraisons de Codex des 21 et 22/10 (PR #230 à #236, `main` = `cc53dd7`) : les modules artisans **« clients externes » et « règlements » sont ouverts** en production (migration `20261021140836`) ; le **cautionnement est rouvert** (`ZOHO_SIGN_CAUTIONNEMENT_FERME` à faux) et les **relances Zoho sont activées** (`ZOHO_SIGN_RELANCES_ACTIVES`) alors que les envois aux clients étaient dits désactivés ; tous les comptes sauf le super-administrateur ont été **effacés** ; la boîte professionnelle `contact@gerimmo.app` existe. Le § 5 et l'encadré du 19/10 ci-dessous (« clients externes désactivé », « envois aux clients désactivés ») ne décrivent plus l'état réel. Aucune recette de production depuis le 21/10 à 18 h 54. Constats, preuves et points à trancher : [[Contrôle des livraisons de Codex — 22 octobre 2026]].

> [!info] Point du 21 octobre — identité de l'éditeur et pages légales
> La PR #226 (Codex, 20/10, `efcee5e`) a adapté les mentions légales à l'entrepreneur individuel (immatriculation RNE/RCS, franchise de TVA) et précisé la confidentialité ; d'après son corps, les coordonnées publiques confirmées par le dirigeant sont enregistrées par l'écran des paramètres. **Reste** : l'adhésion à un médiateur de la consommation et sa saisie, puis la relecture des trois pages en ligne. Les § 1.2 et § 5 ci-dessous, qui disent l'identité « non fournie », datent d'avant cette PR. Vue d'ensemble : [[Point d'étape — 21 octobre 2026]].

> [!info] Point du 20 octobre — liste d'attente des agences et échéance de sortie
> **20/10** : liste d'attente des agences — lot préparé (site `/agences`, table `liste_attente_agences`, console `/admin/liste-attente`), **déployé le 20/10 au soir** (PR #227, fusion `4ba53f5`, recette 39508957256 ; [[Liste d'attente des agences]]) ; échéance de sortie officielle visée par le dirigeant : **30 novembre 2026** (premier client particulier le 30/11 au soir). L'offre aux agences reste hors du site public (§ 5) ; la liste d'attente n'annonce ni prix ni date.

> [!info] Point du 19 octobre — production au 19/10 ; complément du soir : correctifs de l'audit déployés et recette n° 25 verte
> Les PR #198 à #211 sont en production ; dernière fusion : PR #211 (`2fffec6`), le 19/10 à 02 h 33 heure de Paris, déploiement Vercel `dpl_Fktqsq11AQ6tbmddNHCDaL28jxFp`. La base compte 386 versions de migration enregistrées. Dernière recette de production : n° 24 ([39022945703](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39022945703), 17/10, sur `406ad8a`) : 49 réussis, 1 sauté (`/cgu`), 0 instable ; les quatre P1 (D04, D05, D37, D38) réussis au premier essai. Au matin, **aucune recette de production n'avait suivi les PR #202 à #211** (pilotage superadmin, signature Zoho, abonnement au jour de Paris : dix fusions des 18 et 19/10). **Le soir** : les dix lots de correctifs de l'[[Audit final avant publication — 19 octobre 2026|audit final]] sont en production (PR #212, `e25c0f7`, 20 h 47 Paris, six migrations, 392 versions, Vercel `dpl_QeFZ7UYW812iYwrAGPFoZuea6Qtf`) et la **recette n° 25** ([39306114779](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39306114779), sur `e25c0f7`) est verte : 49 réussis, 1 sauté, 0 instable, P1 au premier essai, comptes de recette bloqués entre deux passages ; elle couvre les PR #202 à #212. La signature électronique Zoho Sign est publiée (circuit, migrations, webhook) mais **les envois aux clients sont désactivés** ([[Signature électronique]]). L'e-mail de 5 h du [[Relais du dirigeant]] est parti les 17 et 19/10 (statut `envoye` dans `relais_alertes_envois`) ; le 18/10 : `rien_a_signaler` ; l'arrivée dans la boîte n'est pas constatée.

> [!info] Point du 17 octobre — publication et recette vérifiées
> PR #198 publiée, sauvegardes avant/après et huit migrations vérifiées, 31 anciens fichiers fictifs supprimés. PR201 publiée (`406ad8a`) : recette n°24 réussie, 49 scénarios validés, un chemin facultatif ignoré, aucun échec ni test instable. Vérification SQL après clôture : les cinq mêmes comptes fixes sont conservés ; zéro privilège/session superadmin temporaire et zéro inscription ponctuelle restante. CI candidate : 8 136 tests logique/PDF et 199 tests navigateur réussis. Preuves et limites : [[Mission du 16 octobre — suivi vérifié]].
>
> Les sections du 16 octobre qui suivent sont le relevé historique avant cette publication : leurs mentions « candidat » ne décrivent plus l'état de la PR #198. Le paiement complet, les signatures, l'identité légale et les avis spécialisés ne sont pas déclarés validés par la publication.


Ce que Gerimmo peut montrer et promettre à un prospect, d'après l'état réel de la production (**relevé du 16/10/2026, complété le 19/10** : les constats datés du 16/10 sont conservés comme historique et les compléments portent leur date) : ce qui
est en ligne, ce qui est fragile, ce qu'on peut promettre et ce qu'on ne doit pas promettre. Chaque ligne renvoie à sa
preuve (PR et SHA de fusion, entrée du journal `log.md`, page du wiki). Rien n'est promis sans preuve ; ce qui n'a pas été
vérifié est écrit tel quel. La décision de démarcher appartient au dirigeant.

> [!warning] Qui démarcher : une règle déjà posée
> D'après le wiki, **les particuliers ne sont jamais démarchés directement** (décision du porteur du 19/09/2026 :
> [[Expansion territoriale autonome]]) ; les leviers autorisés vers eux sont la publicité Instagram et Facebook et le
> [[Parrainage]]. Les agences sont hors du site public de la V1 (fiches PUB-01, PUB-02 du
> [[Registre des anomalies — audit du 13 octobre 2026]]). Un « prospect », ici, est donc d'abord une personne qui
> arrive par la publicité, le journal ou une recommandation. Le démarchage d'artisans n'est pas tranché dans le wiki :
> **à préciser par le dirigeant**.

## 1. Préalables avant le premier prospect

Relevés dans le journal, le code et les réglages documentés du dépôt ; aucun n'est tranché ici.

1. **Réglages d'authentification effectués le 16/10 au soir** : inscription publique fermée, confirmation obligatoire,
   trois modèles de courrier enregistrés et liens limités à une heure. La recette n°20
   ([38950274565](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38950274565)) passe après ces réglages : 39 réussites,
   un test ignoré, aucun test instable et nettoyage réussi. Le modèle de changement d'adresse est conservé.
   La PR #198 est publiée le 17/10 (`d31a952`) et recettée (recette n° 24, après les n° 21 à 23 sur les PR #198 à #200) ;
   la remise effective d'un courrier à une boîte humaine n'est pas vérifiée. Détail : [[Mission du 16 octobre — suivi vérifié]].
2. **Identité de l'éditeur et textes légaux** (D32, H1) : l'identité de l'éditeur n'est pas fournie ; les conditions
   générales, les mentions légales et la politique de confidentialité décrivent encore l'offre des agences. Toute
   modification des conditions après les premiers inscrits demande un préavis d'un mois (CGU art. 16, d'après
   [[Décisions groupées — version candidate du 13 octobre 2026]]). Relecture juridique recommandée.
3. **Quatre P1 « montant faux »** (Q3/Q5 : VER-TS-02, PR178-B-06, CHF-01, CHF-02) : corrections en production depuis
   la PR #181. Après l'échec initial de D04 à la recette n°18, les recettes n°19 et n°20 passent sans nouvelle tentative,
   puis la n° 24 (17/10, [39022945703](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39022945703)) : D04, D05, D37,
   D38 réussis au premier essai ; puis la n° 25 (19/10 au soir, [39306114779](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39306114779), sur `e25c0f7`) : 49 réussis, P1 au premier essai.
   La trace du premier échec montre un champ indisponible au moment de la saisie et un montant vide envoyé ; aucun
   montant faux enregistré. Le test corrigé vérifie le champ et sa valeur avant l'envoi. Les limites de production
   concernant le PDF 2044 et le chemin confirmé de régularisation D38 restent distinctes ; leur clôture au registre
   n'est pas déduite de la seule réussite technique ([[Registre des anomalies — audit du 13 octobre 2026]]).

## 2. Ce qui est en ligne au 19/10/2026

Production = `main` à `2fffec630784f705657ee8c4fbc355a4509411f1` (PR #211, 19/10 à 02 h 33 heure de Paris). Dernière recette de production : n° 24 ([39022945703](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39022945703)) sur `406ad8a` (PR #201, 17/10). Les PR #202 à #211 (pilotage superadmin, signature Zoho, abonnement au jour de Paris) n'ont pas été suivies d'une recette. *Relevé du 16/10, pour l'histoire : production = `4a5ddf58f7cefe1cf882777063cb272cb4420ec6` (PR #197), recette n°20 réussie après les réglages hors dépôt, PR #198 alors candidate.* Détail des fusions et des recettes : [[Dossier de validation — version candidate du 13 octobre 2026]] § 5 quater.

| Ce qui est en ligne | Preuve | Limite connue |
|---|---|---|
| Site public (accueil, tarifs, pages légales, outils), inscription et récupération de compte ; page d'inscription des artisans | recettes de production n° 6 et n° 8 à 16 (parcours `public` et `inscription-recuperation` ; la page d'inscription des artisans est seulement ouverte) ; après le changement de `/auth/confirm` (PR #194) : recette n° 17 sur `f24dfb0` (38875612888), inscription d'un compte fictif, confirmation dans le navigateur de l'inscription et récupération réussies ; le remplacement du mot de passe par la « première confirmation » (lien ouvert dans un autre navigateur) n'y est pas joué | le journal (`/journal`) n'est pas parcouru par la recette ; textes légaux incomplets ; réglages Auth effectués et recette n°20 réussie (§ 1) |
| Espace du propriétaire direct sous `/espace/<id>` (biens, lots, baux, loyers, documents, incidents, comptabilité, fiscalité) ; l'ancienne adresse `/agence/<id>` redirige | D27-B, PR #191, `d55f87b` ; recette n° 14 | parcours de base sur données fictives ; aucune validation sur les comptes personnels des utilisateurs |
| Espace du locataire, invitation, et **relances automatiques J+3 et J+10** de l'invitation | X16, PR #190, `f93ec6e` ; recette n° 13 | aucune relance réelle observée ; les invitations en attente avant le 15/10 ne sont pas relancées |
| Règles de loyer au jour de Paris (état des loyers, impayés, relances, quittances, encaissements, dépôt, IRL, charges, rapports) | PR #186, `6b2a130` ; PR #189, `0c9328a` ; restitution du dépôt : PR #195, `db0a95f` | restitution du dépôt (décompte, date d'envoi) au jour de Paris depuis le 16/10 : **interprétation** du point 1 de la décision du 15/10, **à faire ratifier** par le dirigeant ; factures d'honoraires, appels de charges de copropriété : hors décision |
| Chaîne incident → devis → rendez-vous → intervention → facture : devis refusable puis révisable (D18), report ou annulation du rendez-vous par le locataire (D22-B), règlement déclaratif de la facture (D23-A) | PR #187, `8a168dd` ; PR #188, `98f3fd7` | D18, D22 et D23 joués en production par la recette n° 24 (17/10 ; `devis-rendez-vous.spec.ts`, `reglement-facture.spec.ts`) ; compte artisan et compte de supervision (MFA) joués depuis la n° 23 ; *au 16/10 : parcours vérifiés en local seulement* ; le réseau d'artisans ne s'ouvre que commune par commune et métier par métier ([[Ouverture du réseau d'artisans]]) |
| Supervision : arrêt d'urgence étendu aux tâches de la base (neuf sur dix), limite des appels IA (50 par jour par défaut), recherche par référence | PR #182, `8c4aed6` ; PR #190 ; écran des arrêts complété (`maintenance-artisans`) : PR #195 | console vérifiée en local avec MFA réel ; `/admin/relais` et `/admin/sante` ouverts après MFA et recherche par référence joués par la recette n° 24 (17/10 ; `supervision.spec.ts`, lecture seule) |
| Relais du dirigeant : e-mail quotidien à 05 h 00 heure de Paris et e-mail immédiat des urgences du mode vacances, vers deux adresses fournies par le dirigeant et gardées hors du dépôt | D46-B, PR #192, `a722f94` ; passage de 5 h borné sous 60 s et registres du relais conservés six mois au catalogue : PR #195, `db0a95f` | e-mail de 5 h parti le 17/10 et le 19/10 (03 h 25 UTC, `relais_alertes_envois`, statut `envoye`, 1 tentative) ; 18/10 : `rien_a_signaler` ; arrivée dans la boîte non constatée ; *au 16/10 : aucun e-mail encore parti* |
| Invitation d'un artisan par le propriétaire direct (« Mes artisans », sous `/espace`) : l'artisan crée son compte, inscrit son entreprise et accepte ; validé par Gerimmo, il devient sollicitable par ce propriétaire même en commune fermée, pour les biens de sa zone. Avec la « première confirmation » de toute adresse | PR #194, `f24dfb0` (16/10) ; migrations vérifiées en lecture seule ; recette n° 17 verte (38875612888) | **parcours de bout en bout jamais joué en production** (banc local seulement ; la recette n'a pas de parcours d'artisan) ; aucune invitation réelle au journal ; réglages Supabase hors dépôt effectués (§ 1) |
| Sauvegarde quotidienne chiffrée, tâches de la base comprises | D07-A, PR #182 | restauration isolée [38943437206](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38943437206) réussie : 194 tables, 37 108 lignes, 73 fichiers et aucun manquant ; production non restaurée |

## 3. Ce qui est fragile

- **Fonctions peu éprouvées sur des données réelles** : le journal relève aucune écriture comptable en production
  (14/10) et aucun devis en base (15/10) ; la comptabilité et la chaîne des devis n'avaient donc pas encore tourné sur
  des données de client à ces dates.
- **Ce que la recette ne couvre pas** (au 19/10) : l'invitation d'un artisan, les relances d'invitation, les e-mails du
  relais, l'avoir (module désactivé), la limite des appels IA, les signatures Zoho ; l'espace artisan (lecture), la console
  (MFA, lecture seule) et D18/D22/D23 sont joués depuis la recette n° 24 (`app/e2e/recette-production/`). *Au 16/10, la
  recette ne couvrait ni l'espace artisan, ni la console, ni D18, D22-B et D23-A (recettes n° 10 à 13).* Les contrôles des
  quatre P1 y sont depuis la recette n° 18, sans le PDF 2044 ni le chemin confirmé de D38.
- **Échecs au premier essai de la recette** (diagnostic du 16/10, [[Recette de production]]) : « Créer la fiche » d'un
  locataire (admin d'agence, mobile), en échec au premier essai à chacune des recettes depuis la n° 6 (15/10 ; n° 6 à
  18), est un **défaut du test**, prouvé au banc (il attendait une redirection que l'écran ne fait plus depuis la
  PR #170) : aucun défaut de l'écran ; le second essai de ces recettes ne vérifiait pas l'ouverture de la fiche ; test
  corrigé dans la PR #196 puis confirmé par les recettes n°19 et n°20 sans test instable ; n° 24 (17/10) : 49 réussis,
  0 instable. Le bloc des P1 a échoué une
  fois (D04, recette n°18) : la trace a été relue le 16/10, le montant était vide dans la requête. Aucun montant faux
  n'a été enregistré ; le contrôle attend maintenant le champ disponible et vérifie sa valeur avant envoi.
- **Manques déclarés des fonctions livrées** : pas d'alerte au propriétaire quand un artisan devient non affectable
  pendant la révision d'un devis, pas de PDF par version (D18) ; pas de relance de l'artisan avant l'échéance d'une
  demande de report, pas de « J'en prends acte », pas de badge dans son agenda (D22-B).
- **Ajout de son propre artisan par un propriétaire** : possible depuis le 16/10 **par invitation** (PR #194, fiche
  PRO2-01) : l'artisan doit lui-même s'inscrire, accepter et être validé par Gerimmo, et il n'est sollicitable que pour
  les biens situés dans sa zone d'intervention. Parcours **jamais joué de bout en bout en production**
  ([[Invitation d'un artisan par un propriétaire]]).
- **Dépôt de fichiers** : l'écran annonce 10 Mo, la documentation de la plateforme borne le corps d'une requête à 4,5 Mo ;
  la mesure sur un environnement hébergé jetable (D12) reste à réaliser : un fichier de 4,5 à 10 Mo peut échouer sans message clair.
- **Conseils « choisir son locataire »** affichés au propriétaire depuis la PR #182 alors que la page source est en
  brouillon et que les sources primaires (conditions générales des assureurs, textes légaux) n'ont pas été relues
  ([[Choisir son locataire selon les conditions des assurances loyers impayés]]) : à ne pas présenter comme un conseil
  juridique ; le maintien en ligne est une question au dirigeant.
- **Alerte de 5 h du relais** : le risque de dépasser les 60 s de la route est traité par la PR #195 (`db0a95f`,
  16/10) : les appels au service d'e-mail doivent être finis en 45 s, l'e-mail de 5 h part vers les adresses en
  parallèle, chaque appel borné au temps restant (10 s au plus), et les urgences passent d'abord, bornées pour laisser
  son créneau à l'e-mail de 5 h (`app/src/lib/relais-alerte-envoi.ts`). Passages de 5 h constatés en base les 17, 18 et
  19/10 (`relais_alertes_envois` : 1 tentative chacun ; `envoye` les 17 et 19/10, `rien_a_signaler` le 18/10) ; la durée
  du passage et l'arrivée dans la boîte ne sont pas relevées. *Au 16/10 : aucun e-mail de 5 h n'était encore parti.*
- **Liens de connexion** : durée ramenée à 3 600 secondes le 16/10, réglage relu dans Supabase. Les parcours de
  confirmation et de récupération passent dans la recette n°20.
- **Dépendance à une seule personne** pour piloter le code ([[Audit d'acquisition du 3 octobre 2026]]).

## 4. Ce qu'on peut promettre à un prospect

Seulement ce qui est en production et prouvé par une recette ou un test cité ci-dessus, sans chiffre de performance :

- un espace de gestion locative en ligne pour le propriétaire bailleur et un espace pour son locataire (parcours joués sur
  téléphone par la recette de production ; écrans audités à 768 et 1440 px sur le banc) ;
- l'invitation du locataire dans son espace ;
- les dates de loyer, de quittance et d'impayé comptées au jour de Paris ;
- le suivi d'un incident jusqu'à la facture de l'artisan, avec refus motivé et révision d'un devis, report ou annulation
  du rendez-vous par le locataire, et règlement noté par le propriétaire (déclaratif) — **à condition** que le réseau
  d'artisans soit ouvert pour sa commune et le métier (D18, D22 et D23 joués en production par la recette n° 24 du 17/10 ;
  *au 16/10, ces parcours n'avaient pas encore été joués en production*) ;
- l'invitation d'un artisan qu'il connaît, **à condition** que l'artisan s'inscrive, accepte et soit validé par Gerimmo,
  et seulement pour les biens situés dans sa zone d'intervention, en précisant que ce parcours n'a été joué que sur le
  banc (`app/e2e/invitation-artisan.spec.ts`), pas en production ;
- une sauvegarde quotidienne chiffrée des données.

L'offre commerciale (formules, essai, parrainage) est celle de [[Grille tarifaire]] et de [[Cycle de vie de l'abonnement]] ;
l'écran Santé confirme une clé réelle déjà en place. Les sept événements Stripe attendus sont configurés ; aucun
paiement réel n'a été déclenché. Les 14 tests de l'API de test passent, mais le paiement par l'interface et la livraison
HTTP du webhook restent à vérifier avant de promettre un parcours de souscription complet.

## 5. Ce qu'on ne doit pas promettre

- **Encaissement en ligne des loyers ou rapprochement bancaire** : absents (le gérant saisit chaque paiement ;
  [[Audit d'acquisition du 3 octobre 2026]]).
- **Signature électronique Zoho Sign** : circuit et migrations en production depuis le 18/10 (PR #203 à #210 ; migrations
  des PR #203 et #206), compte Zoho Sign Europe ouvert par le dirigeant le 18/10, webhook actif ; **envois aux clients
  désactivés** (`ZOHO_SIGN_BAIL_ACTIF`, `ZOHO_SIGN_DOCUMENTS_ACTIF`, `ZOHO_SIGN_DEVIS_ACTIF` à faux, plafond mensuel à
  zéro) ; les pages publiques la décrivent déjà (PR #210) : ne pas la promettre tant que la recette humaine et l'offre API
  ne sont pas confirmées ([[Signature électronique]]). *Au 16/10 : non activée au lancement.*
- **Mise en location** (annonces, multidiffusion, candidatures) : absente ([[Audit d'acquisition du 3 octobre 2026]]).
- **Offre aux agences** : hors du site public de la V1.
- **Artisans partout** : le réseau ne s'ouvre que commune par commune et métier par métier ; son propre artisan, invité,
  n'est sollicitable qu'après son acceptation et la validation de Gerimmo, et seulement dans sa zone d'intervention.
- **Les relances automatiques de l'invitation (J+3, J+10)**, tant qu'aucune n'a été observée en production : livrées
  (PR #190), mais la recette n° 13 ne joue pas de relance ; seuls les tests du dépôt les exercent, sur une base de test
  (`app/tests/relances-invitations-locataires.test.ts`).
- **Outil « clients externes » de l'artisan** (devis, factures, avoirs pour ses propres clients) : désactivé en production
  jusqu'à la validation comptable de la forme de l'avoir (D24-C).
- **Un engagement de délai de restauration** : une restauration isolée de sauvegarde réelle a réussi le 16/10 ;
  cela ne constitue ni un basculement du service en panne ni un engagement contractuel de délai ([[Plan de reprise d'activité]]).
- **Des conseils juridiques ou fiscaux** : le récapitulatif fiscal est une aide à la déclaration, les conseils de choix du
  locataire ne sont pas relus sur leurs sources.
- **Des mentions légales complètes** tant que l'identité de l'éditeur n'est pas fournie.

> [!warning] Points à trancher / contradictions
> - **Ancien constat remplacé le 16/10 au soir** : les trois modèles de courrier sont enregistrés, l'inscription
>   publique est fermée et les liens valent une heure. La recette n°20 est réussie après ces réglages. PR #198 publiée le
>   17/10 (`d31a952`) ; le constat du 16/10 (« compléments candidats, non livrés ») est conservé pour l'histoire.
> - **Dix fusions sans recette** (18-19/10, *levé le 19/10 au soir par la recette n° 25 sur `e25c0f7`*) : les PR #202 à #211 étaient en production sans qu'une recette de production ait
>   suivi ; la page [[Signature électronique]] est décrite sur le site public (PR #210) alors que les envois aux clients
>   sont désactivés.
> - **Démarchage d'artisans** : ni autorisé ni interdit par le wiki ; la règle « jamais de démarchage direct » ne vise
>   explicitement que les particuliers.
> - **Conseils « choisir son locataire »** : en ligne alors que leur page source est un brouillon non relu sur les
>   sources primaires ; garder, masquer, ou retirer la qualification « règle légale » ?
> - **Paiement** : clé réelle confirmée, mode conservé. Aucun paiement réel testé ; la disponibilité d'une clé et les
>   tests d'API en bac à sable ne prouvent pas le parcours complet de souscription.
> - **Quatre P1** : trois recettes suivantes sans test instable (n° 19, n° 20, n° 24) et cause de D04 documentée ; la
>   n° 24 est la seule recette depuis la publication du 17/10, aucune sur les PR #202 à #211 ; clôture formelle et limites
>   restantes de production (PDF 2044, chemin confirmé de D38) à distinguer.
> - **Restitution du dépôt au jour de Paris** (PR #195) : interprétation du point 1 de la décision du 15/10, à faire
>   ratifier par le dirigeant.

## Relations

[[Décisions groupées — version candidate du 13 octobre 2026]] · [[Dossier de validation — version candidate du 13 octobre 2026]] ·
[[Registre des anomalies — audit du 13 octobre 2026]] · [[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] ·
[[Audit d'acquisition du 3 octobre 2026]] · [[Expansion territoriale autonome]] · [[Parrainage]] · [[Grille tarifaire]] ·
[[Recette de production]] · [[Propriétaire bailleur]] · [[Locataire]] · [[Artisan]] ·
[[Invitation d'un artisan par un propriétaire]]

> [!warning] Changement du 23/10/2026 — réseau d'artisans
> - Décision du dirigeant : les communes et les métiers du réseau sont choisis par l'artisan (sa zone
>   d'intervention et ses métiers), même pendant la bêta ; l'ouverture commune × métier par le super
>   administrateur est supplantée. Migration `20261023180000`, appliquée en production le 23/10 :
>   voir [[Ouverture du réseau d'artisans]].
> - « Artisans partout » : avec cette décision, un artisan validé et public est proposé partout où il a déclaré
>   intervenir ; le discours « le réseau ne s'ouvre que commune par commune » devient faux à la mise en production.
