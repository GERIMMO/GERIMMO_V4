# Plan de correction des défauts restants — 26/11/2026

*Établi en lecture seule par cinq agents (trois relevés, une synthèse, une critique de complétude) sur le code de production `1dca28b`. Rien n'est appliqué par ce document. La critique, en fin de document, corrige plusieurs points du plan : la lire avant de coder un lot.*

# Plan de correction : Gerimmo, production `main` = 1dca28b (26/11/2026)

J'ai travaillé en lecture seule : aucune écriture git, aucun accès à la production. J'ai relu moi-même dans 1dca28b les points suivants, qui sont confirmés :
- `quittance.ts:118-125` et `:211-212` ;
- `reception-loyer.ts:43` et `:186-192`, ainsi que la base, qui refuse aussi « caf » : `20261026110449_reception_loyer_idempotence_durable.sql:77` ;
- `auth.ts:227` et `:254-256`, `compte.ts:93-103` ;
- `sante-service.ts:269-274`, `admin/parametres/page.tsx:36` et `:78`, `admin/journaux/preuves.tsx:17` ;
- `formulaire-profil.tsx:397-451` et `e2e/playwright.webkit.config.ts:30` ;
- `liste_attente` : aucun écran n'y écrit (seule mention : `admin/journaux/bouton-purge.tsx:17`).

J'ai aussi lu les PR #136, #139, #144 et #360 par l'API REST de GitHub.

## 0. Avant tout

- **PR #360 (Q126)** : elle est ouverte et non fusionnée. Elle attend l'approbation du dirigeant dans GitHub.
  - Une fois fusionnée, l'agent recompte les fiches, en lecture seule, comme décidé à Q126 le 26/11. Résultat attendu : une seule fiche, celle d'un compte fictif, donc rien à reprendre.
  - Les lots L2 et L7 touchent aux documents : ils partiront de `main` après #360.
- **« Sans défaut »** : l'agent seul ne peut pas l'atteindre. Une partie des défauts dépend :
  - du juriste (Q62 : 44 points à la partie 9) ;
  - d'un expert-comptable ;
  - de Stripe et du médiateur ;
  - de gestes du dirigeant dans la console.

  Le plan corrige tout ce qui se code. Le reste est en partie 3, avec ce que l'agent prépare pour chaque point.
- **Ce que couvre la délégation** (« débrouille-toi ») : les choix d'affichage sans enjeu juridique, sans argent réel et sans effacement. Pour ceux-là, l'agent applique l'option recommandée et l'écrit dans la PR, et le dirigeant peut la refuser à l'approbation. La délégation ne vaut ni pour le droit, ni pour les suppressions, ni pour Stripe ou la console.

## 1. Tri

### 1a. Déjà corrigés : écartés du plan

| Id | Ce qui est corrigé | Preuve |
|---|---|---|
| E141 | La confidentialité ne promet plus le téléchargement à tous | `confidentialite/page.tsx:741-760` |
| Q100, Q101, notes-majeurs (question 4) | L'outil IRL est vide au départ ; Facebook est masqué et n'est pas diffusé tant que la Page est à vérifier | `calculateur-irl.tsx:98-116`, `missions-planifiees/marketing.ts:74-97` |
| Q21 / D5 | L'écran de l'ancien parcours de signature est retiré | Ses fonctions en base restent : voir L8 |
| T3R-1 à T3R-8 | Les huit points de la relecture T3 | `recu-depot.ts:59-60`, notes-T3 § 1 |
| NON-FAIT § 6 (décompte, Q49) | Le parcours existe : `e2e/decisions-24-11-d3.spec.ts:113-161` | Reste : le registre à corriger et le PDF à vérifier (L5) |
| Lot 60 R3 (E002) et R7 | Les onglets de 421 à 470 px ; « Aide en cas de problème » | `onglets-dossier.module.css:5`, `nav-artisan.tsx:45-48` |
| Q125, réserve 2 | Vercel transmet bien l'en-tête Sec-Fetch-Mode | JOURNAL du 26/11, sonde en production |
| Q126 / PR #360 | En cours de publication | Non recompté |

### 1b. Doublons fusionnés

- Q124 : relevés 1 et 2.
- Q123 : quittance plus trois autres outils.
- E057/E170 : relevés 1 et 2.
- L63 (E024, E025, E026, E027, E040, E049) : le relevé 1 les regroupe, le relevé 2 les détaille.
- Console (E094 à E097, E107, E109, E189, E213, compteurs, barre « Enregistrer », 390 px) : relevés 1 et 2.
- E132, E135 et le motif « zone tendue » du congé.
- Lot 60 et Q88/Q89 ; D1 (aperçu Facebook) ; D2 (indice égal) ; Q87.
- Q125 hors périmètre : relevés 1 et 3.
- NON-FAIT § 6 et « #139 » du relevé 3 (actions jamais testées).

### 1c. Écarts entre les relevés, et ce que je retiens

| Point | Écart | Retenu | Pourquoi |
|---|---|---|---|
| Q124 | majeur M contre mineur S | **majeur, M** | La quittance, document légal, attribue au locataire de l'argent versé par la CAF. La base doit aussi accepter « caf » : il faut une migration. |
| Q73 | majeur contre mineur | **majeur, L** | Le récapitulatif fiscal est faux quand les paiements sont saisis dans le désordre. Les totaux restent justes, mais pas la part loyer ni la part charges. |
| Q87 | VÉRIFIÉ contre SUPPOSÉ | **VÉRIFIÉ, cosmétique** | Le code a été relu (`20261024140000:1234` contre `20261125103000:104-130`). L'écart exact n'a pas été rejoué. |
| D2, indice égal | VÉRIFIÉ contre SUPPOSÉ | **VÉRIFIÉ** | `20261124150000_revision_loyer_seconde_reprise_d2.sql:85-90` |

### 1d. #139 et #144 (JOURNAL.md:652, « points reportés »)

D'après GitHub :
- **#139** est « Outils gratuits publics : IRL, quittance, GLI/Visale, LMNP, rentabilité », fusionnée le 29/09. Rattachement probable : Q72 et Q123 (lot L4).
- **#144** est « Liens de création de mot de passe fiables sur tout appareil », fusionnée le 30/09. Rattachement probable : les sessions de `definirNouveauMotDePasse` (lot L1). C'est SUPPOSÉ.

Le relevé 3 rattache #144 à Q73 et #139 aux actions jamais testées. Aucun document ne soutient ce rattachement, mais ces deux défauts sont réels : ils sont traités en L6 et en L5. Il faut confirmer ce que visait la ligne 652 auprès de la session qui l'a écrite. À défaut, L1, L4 et L5 couvrent les trois lectures possibles.

### 1e. Défauts ouverts, dédoublonnés et classés

**A. Bloquent ou faussent un résultat pour un vrai utilisateur (argent, documents, accès)**

| # | Id | Défaut | Statut | Gravité | Effort | Lot |
|---|---|---|---|---|---|---|
| A1 | Q124 et Q36 (4) | La quittance dit « reçu de [locataire] » pour un montant qui inclut la part CAF, et la signature tombe seule en page 2. Le tableau de bord ne propose pas le mode « CAF / APL », et la base le refuse aussi. | VÉRIFIÉ | majeur | M | L2 |
| A2 | Q73 | Le récapitulatif fiscal impute les paiements dans l'ordre de saisie, pas selon leur date | VÉRIFIÉ | majeur | L | L6 |
| A3 | Q80, Q92, R7 | Aucun paiement Stripe réel ; en-tête des factures et portail non réglés | SUPPOSÉ | bloquant (ventes fermées) | M | partie 3 |
| A4 | Q65, Q75, Q81 | Pas de médiateur : la première souscription d'un particulier est refusée | VÉRIFIÉ | majeur | S | partie 3 |
| A5 | Q46, Q77 | La notice du bail n'est pas jointe par Gerimmo ; la signature papier n'est pas bloquée | VÉRIFIÉ | majeur | M | L7 |
| A6 | Q102 | Le congé pour vendre ou reprendre annonce une notice que Gerimmo ne fournit pas | VÉRIFIÉ | majeur | M | L7 |
| A7 | Q112 | La caution n'est pas informée dans le mois d'un impayé | VÉRIFIÉ | majeur | M | L7 |
| A8 | Q93 | Aucune annonce d'une nouvelle version des conditions : l'archivage sera bloqué dès le premier abonné | VÉRIFIÉ | majeur | M | L3 |
| A9 | Q125 hors périmètre, et prolongement | Les fermetures de session ne lisent pas leur erreur. Le compte affirme « autres appareils déconnectés ». Le repli peut laisser vivante la session née du lien (garde PRO-5). | VÉRIFIÉ | mineur (sécurité, cas rare) | S | L1 |
| A10 | Q96 | `demander_periodicite_suivante` peut être appelée directement par tout compte connecté, sans accord aux conditions | VÉRIFIÉ | mineur | S | L3 |
| A11 | Q119, Q120 | Un accord sans l'empreinte du texte archivé est compté | VÉRIFIÉ | mineur | S | L3 |
| A12 | Q123 | Une quittance publique de 850 € + 120 € s'imprime sans rien saisir ; trois autres outils sont préremplis | VÉRIFIÉ | mineur | S | L4 |
| A13 | Q60 | La période d'occupation de la régularisation n'est pas enregistrée : une réimpression peut changer | VÉRIFIÉ | mineur | M | L2 |
| A14 | D2, Q70 | Un indice égal à celui du bail est accepté ; un indice juste peut être refusé sur un bail repris | VÉRIFIÉ | mineur | S/M | L2 |
| A15 | Q45 (2) | L'IBAN est imprimé sans le nom du titulaire | VÉRIFIÉ | mineur | S | L2 |

**B. Majeurs, sans fausser un résultat immédiat**

| # | Id | Défaut | Statut | Effort | Lot |
|---|---|---|---|---|---|
| B1 | Q6, Q37, R5 | Les cinq envois automatiques sont fermés | SUPPOSÉ | S | partie 3 (console) |
| B2 | Q62 | Aucun article de loi lu mot à mot : aucune règle de droit garantie | SUPPOSÉ | L | partie 3 (juriste) |
| B3 | NON-FAIT § 6, « #139 », #136 | 85 actions sur 360 ne sont citées par aucun test. Plusieurs parcours manquent (résiliation, rétractation, export, « Corriger » puis redéposer, relance non confirmée, première location continue, pilote). Le rendez-vous, l'évitement et le brouillon ne sont pas joués sur WebKit. | VÉRIFIÉ | L | L5 |
| B4 | Traçabilité | La liste des mineurs (ECRANS-defauts, L62 à L65) est perdue, alors que DECISIONS:78 dit qu'elle est gardée | VÉRIFIÉ | L | L5 |
| B5 | NON-FAIT § 5 et § 8 | Une trentaine de retours arrière non relus ; captures à 390 et 1 440 px ; restauration jamais essayée | SUPPOSÉ | M | L5, et partie 3 pour la restauration |
| B6 | NON-FAIT § 4 | Services réels jamais essayés (Facebook, Insee, Zoho, IA, AR24, photo, relevé bancaire) | SUPPOSÉ | M | partie 3 |
| B7 | NON-FAIT § 7 | Palier 2 (agences) non revu | SUPPOSÉ | L | partie 3 |

**C. Mineurs et cosmétiques** : leur répartition est donnée dans les lots ci-dessous. Ceux qui attendent le juriste ou le comptable sont en partie 3.

## 2. Lots (8), chacun publiable seul

Ordre conseillé :
1. Tout de suite, sans décision : **L1**, **L5** (le relevé d'écrans démarre), **L4**.
2. Dès les réponses du dirigeant : **L2**, **L3**.
3. Quand les éléments extérieurs arrivent : **L7**, **L6**, **L8**.

| Lot | Thème | Effort | Risque | Décision avant de coder |
|---|---|---|---|---|
| L1 | Sessions et mots de passe | S | moyen (connexion) | Non |
| L2 | Loyers, quittances, documents de gestion | M à L | moyen (documents légaux, empreintes) | Oui (dirigeant ; juriste pour Q124) |
| L3 | Conditions, accords, abonnement (sans rouvrir les ventes) | M | moyen | Oui (dirigeant ; juriste informé) |
| L4 | Écrans justes (mineurs vérifiés) | M | faible | Seulement des choix d'affichage (délégation) |
| L5 | Tests, relevé d'écrans, exploitation | L | faible | Non |
| L6 | Récapitulatif fiscal (Q73) | L | élevé (données fiscales) | Oui (expert-comptable et dirigeant) |
| L7 | Pièces officielles et information de la caution | M | moyen | Oui (textes officiels ; juriste) |
| L8 | Nettoyage de la base (Q36), partie réversible | M | moyen | Oui (décision écrite) |

### L1 : Sessions et mots de passe (sans décision)

- **Défauts couverts** :
  - A9 : `auth.ts:227` (`definirNouveauMotDePasse`, `signOut({scope:"others"})` sans lire l'erreur) ; `compte.ts:93` et `:103` (message toujours affirmatif) ; `auth.ts:254-256` (le repli `signOut()` sans lire l'erreur, puis vers `/connexion`, que `proxy.ts:62` renvoie vers `/espaces`) ; `archive-identite.ts:16-18`.
  - En annexe, en lecture seule : volume des 403 `/user` dans les journaux Auth (Q125, réserve 1).
  - En option, dans un second temps et après une relecture de sécurité PRO-5 : le repli quand Sec-Fetch-Mode est absent (`proxy.ts:138-144`, Q125 réserve 3, effort M).
- **Fichiers** : `app/src/app/actions/auth.ts`, `compte.ts`, `archive-identite.ts` ; tests sous `app/tests/`.
- **Correctif** :
  - Lire l'erreur et l'écrire dans `log_tech`.
  - Si la fermeture échoue : ne plus affirmer que les autres appareils sont déconnectés, proposer « Se déconnecter partout » et réessayer.
  - Dans le repli : effacer les cookies de session avant de rediriger, ou afficher l'échec.
- **Tests** :
  - `signOut` simulé en erreur : le message dit la vérité et la trace est écrite.
  - Repli en échec : la session ne survit pas.
  - Les parcours e2e d'inscription, de mot de passe oublié et de changement de mot de passe restent verts (recette complète).

### L2 : Loyers, quittances, documents de gestion

- **Défauts couverts** :
  - Q124 : la formule, et la signature qui ne doit plus tomber seule en page 2.
  - Q36 (4) : le mode « CAF / APL » au tableau de bord. Il faut une nouvelle définition de `declarer_reception_loyer`, car la base refuse « caf » (`20261026110449:77`). Cela reste un ajout : rien n'est supprimé.
  - Q45 (2), Q54, Q109.
  - Q58 (option B).
  - Q60 : migration additive.
  - D2 : refuser un indice identique, message « rien à réviser », le mot de la lettre.
  - Q70.
  - Lot 54 : « Cause constatée : — » à masquer.
  - Dans un second temps : Q117 et Q118 (relance partielle).
- **Fichiers probables** :
  - `lib/documents/modeles/quittance.ts` ;
  - `actions/reception-loyer.ts` (l. 43 et 186-192) et le composant d'encaissement du tableau de bord ;
  - une migration pour la fonction de réception ;
  - `lib/documents/gabarit.ts:165` (`eur`) ;
  - `modeles/avis-echeance.ts:148`, plus le champ au profil et une migration ;
  - `lib/documents-bail.ts:90-92` ;
  - `incidents/volet-artisan.tsx:1111-1116` ;
  - `modeles/catalogue-gestion.ts:65`, `:276-289` et `:426` ;
  - une nouvelle définition de la fonction de révision (`20261124150000`).
- **Risque** :
  - Documents légaux : double relecture.
  - Q40 : les documents en attente de signature en ligne ne sont pas régénérés.
  - Migrations additives seulement.
- **Tests** :
  - Texte de la quittance dans trois cas : CAF partielle, CAF seule, sans CAF.
  - PDF au banc : signature non isolée.
  - « caf » accepté par l'action et par la base.
  - `eur()` avec une espace insécable dans tous les modèles.
  - Empreinte inchangée pour un document en cours de signature.
  - Régularisation réimprimée après un changement de bail : même période.
  - Indice identique refusé.
  - Drapeau « à actualiser » sur les résumés concernés (Q109).
- **Questions au dirigeant, avec l'option recommandée** :
  - Q124 : « Sur la quittance d'un mois payé en partie par la CAF, Gerimmo écrit-il séparément ce qu'a payé le locataire et ce qu'a versé la CAF ? » **Recommandé : oui.** La formule est marquée « en attente de l'avis du juriste (9·44) » et n'est pas présentée comme conforme.
  - Q36 (4) : « Ajoute-t-on « CAF / APL » aux modes de règlement du tableau de bord ? » **Recommandé : oui** (c'est un ajout).
  - Q45 (2) : « Imprime-t-on le nom du titulaire du compte à côté de l'IBAN ? » **Recommandé : un champ « titulaire » au profil, prérempli avec le nom du bailleur.** Plusieurs IBAN par espace : plus tard.
  - Q54 : « Empêche-t-on le signe € de passer seul à la ligne dans tous les documents ? » **Recommandé : oui, pour les documents produits après la mise en ligne seulement.**
  - Q109 : « Signale-t-on « à actualiser » les résumés qui gardent la phrase fausse ? » **Recommandé : oui.**
  - Q58 : « Le devis unique : l'imprime-t-on (A) ou retire-t-on la promesse de l'écran (B) ? » **Recommandé : B maintenant** ; A plus tard si besoin.
  - Q60 : « Enregistre-t-on la période d'occupation au moment de la régularisation ? » **Recommandé : oui** (petite migration, rien n'est effacé).
  - Q70 : « Ajoute-t-on une case « indice d'origine ou déjà mis à jour » pour un bail repris ? » **Recommandé : oui.**
  - Q117 et Q118 : « Après une relance partielle, propose-t-on un geste « terminer l'envoi » vers les seules personnes non servies ? » **Recommandé : oui, dans un second temps.**

### L3 : Conditions, accords et abonnement (rien n'est rouvert à la vente)

- **Défauts couverts** : Q96, Q119 et Q120, Q93, E024/E145.
- **Fichiers** :
  - une migration qui retire `execute` sur `demander_periodicite_suivante` au rôle `authenticated` (`20260928090000_tarification_2026.sql:802`), après avoir vérifié le chemin serveur ;
  - `lib/nouvelle-version-conditions.ts:117-128` ;
  - `lib/conditions-versions-serveur.ts:123-147`, avec un nouveau modèle de courriel derrière un interrupteur fermé ;
  - `abonnement/retractation/page.tsx:66` et `:82-85`.
- **Risque** : redemander un accord pourrait bloquer des comptes existants. On essaie d'abord sur des comptes de test. Aucun geste Stripe.
- **Tests** :
  - Appel direct à la fonction refusé (test SQL).
  - Une empreinte inconnue est refusée, et un accord donné avant l'archivage est redemandé.
  - Annonce : contenu, délai d'un mois, rien ne part tant que l'interrupteur est fermé, archivage permis après l'annonce.
  - Page de rétractation dans trois cas : en essai, abonné dans le délai, hors délai.
- **Questions** :
  - Q96 : « Ferme-t-on l'appel direct à la fonction qui change la périodicité ? » **Recommandé : oui.**
  - Q119 et Q120 : « Ne compte-t-on que les accords portant l'empreinte du texte archivé, et redemande-t-on ceux donnés avant l'archivage ? » **Recommandé : oui**, et le juriste en est informé (9·42).
  - Q93 : « Écrit-on maintenant le courriel d'annonce, sous interrupteur fermé, texte à faire relire ? » **Recommandé : oui, avant le premier abonné.**
  - E024/E145 : pas de décision, seulement un affichage selon l'état du compte. Double relecture, sans rien présenter comme conforme.

### L4 : Écrans justes (mineurs vérifiés dans 1dca28b)

- **Propriétaire** :
  - E040/E154 (`compte/donnees/page.tsx:57-60` et `:73`) : l'affichage suit le profil. La tournure sur le responsable de traitement reste au juriste.
  - E049/E160 (`boutons-etat-lot.tsx:24`, `:78-80`, `:105`).
  - E026 (`faq/questions.ts:29`).
  - E027/E146 (`abonnement-2026.tsx:114`, `:434-454`, `:543-565`).
  - Profil, relances : texte contradictoire quand l'envoi est fermé (`formulaire-profil.tsx:397` contre `:442-451`).
  - E025/E147 : SUPPOSÉ, à localiser grâce au relevé de L5.
- **Console** :
  - E096/E204 (`sante-service.ts:269-274`, qui ne lit pas `ZOHO_SIGN_DOCUMENTS_ACTIF`).
  - E107/E214 (`admin/parametres/page.tsx:78` : utiliser `etatDeLIA`).
  - E189 (`preuves.tsx:17` : pastille verte écrite en dur).
  - Compteurs légaux (`admin/sante/page.tsx:336-344`).
  - Barre « Enregistrer » (`editeur-publication.tsx:260`).
  - Couverture à 390 px (`tableau-couverture.tsx:26`).
  - Q87 (`20261024140000:1234`).
  - D1 : l'aperçu montre le lien et la mention IA (`veto-post.tsx:58` et `:74`, `facebook.ts:29-30`).
- **Locataire** :
  - E132 (`locataire/[orgId]/faq/page.tsx:50`).
  - Motif « zone tendue » quand la zone est inconnue (`logement/page.tsx:86`, `carte-conge.tsx:147-152`) : texte sur le préavis, à relire.
  - E135 : SUPPOSÉ.
- **Artisan** :
  - Carte « Dates proposées » : afficher les dates, sans les dates passées (`artisan/page.tsx:267-279`, R6).
  - Volet sans chevron (`chantiers/[chantierId]/page.tsx:45`).
  - `/facture` renvoie sans message (`facture/page.tsx:38`).
  - Garde-fou contre la boucle R9 (`panne/page.tsx:28-29`).
  - `.lien-discret` souligné (`globals.css:1128-1131` et `:1327`, effort M).
  - Q88/Q89 (`nav-artisan.tsx:102`, `:111`, `:114`, `:115`).
  - Lot 61 (reste) : nom coupé, calcul de fond si l'espace est supprimé, et les trois questions à numéroter dans QUESTIONS.md.
- **Public** :
  - E057/E170 (`confidentialite/page.tsx:273-274`, ajouter `{" "}`). Il faut relever ensemble `CONFIDENTIALITE_DATE` et l'empreinte `confidentialite-v1` (règle Q99).
  - Q123 et Q72 (#139).
- **Divers** :
  - A10 : avertir sur un code postal improbable comme « 75000 » (`validation-fiches.ts:11`). Avertir seulement, sans refuser.
  - A12 : délai de la case « mariés ou pacsés », à examiner.
  - Lot 7 : la photo de l'évaluation contestée est montrée au super admin (SUPPOSÉ, à localiser).
- **Risque** : faible. Deux textes à relire : la confidentialité et le préavis.
- **Tests** : rendu conditionnel pour chaque composant ; présence de « mois après » ; captures à 390 et 1 440 px de la console et de l'espace artisan ; e2e du congé avec une zone inconnue.
- **Choix d'affichage**, appliqués par délégation et signalés dans la PR :
  - Q123 : « Vide-t-on les quatre outils publics (exemple en grisé, impression bloquée sans saisie) ? » **Recommandé : oui.**
  - Q72 : « Aligne-t-on l'outil IRL public sur l'application (plus d'un an refusé, effet au terme suivant, garde 0,8 à 1,25) ? » **Recommandé : oui.**
  - Q88 et Q89 : **Recommandé : les titres des pages partout**, « Ma facturation » et « Ma fiche entreprise ».
  - E049/E160 : **Recommandé : bouton désactivé, avec la raison affichée.**
  - Q87 : **Recommandé : corriger le compte.**

### L5 : Tests, relevé d'écrans, exploitation (aucun changement visible pour l'utilisateur)

- **Défauts couverts** : B3, B4, B5 (sauf la restauration), et le registre NON-FAIT à rectifier (§ 1 et § 6 ; DECISIONS:78).
- **Contenu** :
  1. Refaire le relevé des écrans public, propriétaire, console, locataire et artisan, à 390 et 1 440 px. Remettre la liste dans le dépôt (`livrables/`). Les mineurs retrouvés alimentent un lot L4 bis.
  2. Écrire des tests pour les 85 actions non citées (liste : `livrables/notes-banc/actions-non-citees-2026-11-26.txt`). Ordre : propriétaire, locataire et artisan d'abord, console ensuite, agences en dernier.
  3. Écrire les parcours e2e : résiliation, rétractation, `/compte/donnees` (export), « Corriger » puis redéposer, relance non confirmée, première location continue, pilote, révision D2, génération du PDF du décompte.
  4. WebKit : ajouter `rendez-vous-report-annulation-locataire`, `acces-clavier-portails` et `brouillon-bail-saisie` à `playwright.webkit.config.ts:30` (#136).
  5. Relire un par un la trentaine de retours arrière à plusieurs instructions.
- **Risque** : faible. La CI sera plus longue. L'effort passe à M si WebKit révèle un défaut propre à Safari.

### L6 : Récapitulatif fiscal (Q73), soumis à l'expert-comptable

- **Fichiers** :
  - une nouvelle définition de `capturer_composantes_fiscales` (`20261112120300:997-1070`) et de `retrouver_ventilation_fiscale` (`20261012224000`) ;
  - `lib/fiscal.ts:74` et `:96-101` ;
  - `actions/loyers.ts:489-497`.
- **Risque** : élevé. Les parts déjà figées ne sont pas réécrites sans décision écrite séparée, dans l'esprit de Q36. La nouvelle règle s'applique aux nouvelles saisies, ou à un recalcul fait après une sauvegarde vérifiée. D'après Q64 (SUPPOSÉ), la production n'a que des comptes de test : on compte d'abord, en lecture seule.
- **Tests** :
  - Termes de 700 € et 720 € saisis dans le désordre : mêmes parts que dans l'ordre.
  - Cas du prorata, de la régularisation, du dernier terme, d'un paiement partiel et de deux paiements à la même date.
  - Totaux annuels inchangés.
  - Aucune part déjà figée modifiée.
- **Questions** :
  - « Un paiement est-il imputé selon sa date de paiement, l'ordre de saisie ne servant qu'à départager deux dates égales ? » **Recommandé : oui**, à confirmer par l'expert-comptable.
  - « Recalcule-t-on les parts déjà figées ? » **Recommandé : seulement après le comptage, une sauvegarde et une décision écrite.**

### L7 : Pièces officielles et information de la caution

- **Défauts couverts** : Q46/Q77 (`lib/documents-bail.ts:99-101`), Q102 (`catalogue-options.ts:27`, `generer-conge-bailleur.tsx:21`), Q112 (`information-caution.ts:3`, `formulaire-loyers.tsx:838-846`, `formulaire-profil.tsx:64-66`).
- **Contenu** : Gerimmo joint lui-même la notice officielle, avec sa version et son empreinte. La signature (y compris sur papier) et l'envoi du congé sont bloqués sans notice.
- **Risque** : moyen. Si le PDF manque, un blocage pourrait gêner tous les baux : le blocage n'est activé qu'une fois le fichier en place.
- **Tests** :
  - Refus sans notice.
  - Notice jointe automatiquement.
  - Un congé pour vendre ou pour reprendre contient la notice.
  - La caution est informée dès le premier mois, mais l'envoi reste fermé tant que son interrupteur l'est.
- **Questions** :
  - « Pouvez-vous fournir les PDF officiels de la notice du bail et de la notice du congé (arrêté du 13/12/2017), pris sur Légifrance avec leur date de version ? »
  - « Sans notice, bloque-t-on la signature et le congé ? » **Recommandé : oui.**
  - Q112 : « Si le bail a une caution, l'informe-t-on dès le premier mois d'impayé ? » **Recommandé : oui, sous réserve du juriste (B10ter).**

### L8 : Nettoyage de la base (Q36), partie réversible seulement

- **Étape 1, réversible, sur décision** :
  - Retirer la lecture publique de `site_pages` (`20260904132719:11`).
  - Retirer l'écriture anonyme sur `liste_attente` (`20261019120000:136` et `:141` ; aucun écran n'y écrit).
  - Retirer le droit d'exécution des 17 fonctions jamais appelées et de l'ancien parcours de signature (`mes_demandes_signature`, `20260908120000:40`).
  - Ne jamais toucher `liste_attente_agences`.
- **Étape 2, les suppressions** : traitée en partie 3.
- **Risque** : une fonction qu'on croit inutile peut être appelée par une mission planifiée, une fonction Edge ou un workflow. On cherche dans `app/src`, `supabase/functions`, `.github/workflows` et `pg_cron` avant de retirer quoi que ce soit.
- **Tests** : tests SQL de droits (l'anonyme est refusé), puis la recette complète.
- **Question** : « Ferme-t-on ces accès inutiles, ce qui est réversible et n'efface rien ? » **Recommandé : oui.**

## 3. Ce que l'agent ne peut pas faire

| Sujet | Qui | Ce que l'agent prépare |
|---|---|---|
| Approuver et publier chaque PR, dont #360 | Dirigeant, dans GitHub | La PR, la CI et le plan de vérification. Le recompte Q126 se fait en lecture seule après la fusion. |
| Stripe (R7, Q80, Q92) : en-tête des factures, portail, premier paiement remboursé | Dirigeant, sur son compte. Les souscriptions restent fermées. | Une marche à suivre pas à pas et la relecture des pages ensuite |
| Médiateur (Q65, Q75, Q81) | Dirigeant (adhésion), juriste (7·6, 9·26) | Le texte des pages une fois le nom connu |
| Ouvrir les cinq envois (Q6, Q37, R5) | Dirigeant, dans la console : double vérification, un envoi à la fois, après un essai avec une vraie boîte | L'ordre d'ouverture et le contrôle après chaque geste |
| Fermer les comptes de test (Q64) | Dirigeant, dans la console : bilan, puis « Programmer la fermeture » | La liste des comptes et le contrôle des compteurs |
| Droit (Q62) : lecture des textes et JURISTE.md | Juriste ; compte PISTE ou textes copiés par le dirigeant | Les questions, une par point |
| Points qui attendent le juriste : Q121, Q116, Q122 ; Q28 ; T3 R16-A4 (classes F et G, outre-mer, **avant le 01/01/2028**) ; Q107, Q104, Q110, Q108 ; Q111 ; Q82 ; Q85 ; lot 54 (autorisation de travaux) ; lots 50 et 53 (avenant, protocole, avec Q40) ; T3 mineurs (R12-A1, R14-A2, R15-A3, R23-A1, aide CAF gardée pour non-décence) ; D3 et Q49 (reste) ; tournure RGPD de E040 | Juriste, puis dirigeant | Un lot par sujet, une fois l'avis rendu |
| Comptabilité : la règle de Q73, Q14 (facture de l'artisan, reportée le 24/11), Q63 et Q66 (activité déclarée, mention de TVA), partie 4 de JURISTE.md | Expert-comptable | Les scénarios chiffrés |
| Gestes irréversibles : durées de conservation (Q39), suppression de tables et de fonctions (Q36 étape 2, après sauvegarde vérifiée), recalcul fiscal de l'historique (Q73), archivage de nouvelles conditions | Décision écrite du dirigeant, et du juriste pour Q39 | Le comptage et la sauvegarde d'abord |
| Essais réels ou payants : Zoho Sign, AR24, Insee, Page Facebook, IA réelle, photo prise au téléphone, vrai relevé de banque | Accord du dirigeant | Un protocole d'essai par service |
| Restauration vers un projet Supabase de secours | Accord du dirigeant | Le protocole et la vérification |
| Antivirus (Q8) | Dirigeant (reporté par décision du 24/11 ; service peut-être payant) | Un comparatif |
| Informations à fournir : Q83 et Q84 (durée de conservation chez OpenAI, modèle de réponse), Q67 (articles écrits à la main), Q79 (nom commercial, avec le juriste 9·29), Q68 et Q69 (motif du retrait d'une note), Q105 et Q86 (accord pour une lecture seule en production), textes officiels de L7 | Dirigeant | La correction dès réception |
| Palier 2, agences (NON-FAIT § 7 ; Q95, Q108, Q110) ; export complet de l'artisan (Q90) | Mission ou lot à part, sur décision | — |
| Choix en attente sans défaut constaté : Q55, Q56, Q57, Q59, Q61, Q91, Q92, Q94, Q95, Q97, Q98, Q103, Q106, Q113, Q114, Q115 (juriste pour Q98, Q113 et Q115) | Dirigeant | L'option la plus prudente reste en place |

Fichiers utiles :
- Liste des 85 actions jamais citées par un test : `livrables/notes-banc/actions-non-citees-2026-11-26.txt`
- Fichiers qui les appellent : `(copie locale de l'agent, non conservée)`
- Documents du dépôt : `/home/user/GERIMMO_V4/JOURNAL.md`, `/home/user/GERIMMO_V4/QUESTIONS.md`, `/home/user/GERIMMO_V4/livrables/NON-FAIT.md`, `/home/user/GERIMMO_V4/DECISIONS-2026-11-24.md`
---

# Critique de complétude du plan

Critique du plan de correction (production `main` = 1dca28b). J'ai tout fait en lecture seule, sans aucune écriture git et sans toucher la production.

## Affirmations du plan relues dans 1dca28b et confirmées
- `lib/documents/modeles/quittance.ts:211-212` (« déclare avoir reçu de ${locatairesNoms} ») et `:118-125` (table MODES avec `caf`).
- `actions/reception-loyer.ts:43` et la base, `20261026110449_…:77` : « caf » est refusé dans les deux.
- `actions/auth.ts:227` et `:254`, `actions/compte.ts:93` et `:101-103`, `archive-identite.ts:16` : aucune erreur de fermeture de session n'est lue.
- `e2e/playwright.webkit.config.ts:30` : les trois parcours cités n'y sont pas, alors que les fichiers existent.
- `confidentialite/page.tsx:273-274` (« 24 moisaprès ») ; `validation-fiches.ts:11` (« 75000 » accepté) ; `admin/parametres/page.tsx:78` (lit `iaActive` et non `etatDeLIA`).
- `lib/conditions-versions-serveur.ts:118-147` : l'archivage est refusé dès qu'il existe un abonné actif (Q93).
- `liste_attente` : aucun écran n'y écrit.

## Ajouts et corrections

1. **Q96 (L3) : le correctif proposé casse le parcours normal.**
   - Preuve : `actions/abonnement.ts:579` appelle `demander_periodicite_suivante` avec la session de l'utilisateur. La fonction contrôle le rôle par `org_ids_avec_roles` et écrit `auth.uid()` au journal (`20260928090000:782-784` et `:798`). Retirer `execute` au rôle connecté bloque donc le vrai changement de périodicité ; l'appeler avec la clé de service fait échouer le contrôle du rôle. D4R-04 a écarté exprès une garde en base (`20261125150000:29-31`).
   - Exposition aujourd'hui : nulle, car seules les lignes avec `stripe_subscription_id` sont visées (`:793`) et il n'y a aucun abonné.
   - VÉRIFIÉ. Gravité mineure. Effort M au lieu de S, avec relecture de sécurité. Pas de décision nécessaire.

2. **L1 (A9) : en partie surestimé.**
   - Preuve : avec auth-js 2.118.0, la version du `package-lock.json:2740-2741` de 1dca28b, `signOut()` en portée globale ou locale efface les cookies même quand l'API répond en erreur (`GoTrueClient.js:3440-3446`, copie dans `(copie locale de l'agent, non conservée)`).
   - Conséquence : le repli `auth.ts:254` et `archive-identite.ts:16` ne produit pas le renvoi de `/connexion` vers `/espaces`, sauf si la lecture de la session échoue elle-même (`:3431-3432`).
   - Défauts réels : les deux appels en portée « others » (`auth.ts:227`, `compte.ts:93`). Rien n'y est fermé en cas d'erreur, et le message affirme le contraire.
   - VÉRIFIÉ. Gravité mineure. Effort S.

3. **L2 (Q36-4) : réécrire `declarer_reception_loyer` d'après `20261026110449` ferait perdre une garde.**
   - Preuve : `20261112195752_relances_apres_decompte.sql:16` a modifié la fonction en place (`pg_get_functiondef` puis `replace`) : elle refuse une échéance qui figure déjà dans un décompte finalisé. Un `create or replace` recopié de l'ancienne version retirerait ce refus sans bruit. `pointer_loyer_releve` l'appelle aussi (`20261122235950:54`).
   - À faire : même méthode de remplacement contrôlé, plus un test « échéance au décompte refusée ».
   - VÉRIFIÉ. Gravité majeure (argent). Effort M.

4. **Q124 (L2) : le pointage par relevé de banque ne produira jamais « caf ».**
   - Preuve : `lib/pointage-loyers.ts:81-88` transforme une ligne « VIR CAF … » en « virement », et `actions/pointage-loyers.ts:91` transmet ce mode. La quittance qui suit attribuerait encore au locataire l'argent de la CAF.
   - À ajouter au lot : `pointage-loyers.ts:81-96`. Les deux quittances partagent `construireQuittance` (`quittance-conforme.ts:161-186`) : un seul correctif de texte suffit.
   - VÉRIFIÉ. Gravité majeure. Effort S. Choix du dirigeant : repérer « CAF » dans le libellé de la ligne, ou faire choisir le mode au propriétaire.

5. **B3 (L5) : le chiffre de 85 « actions jamais testées » repose sur le nom des fonctions, pas sur les tests réels.**
   - Preuve : `restitution finaliserDecompte` est dans `non-citees.txt`, alors que `e2e/restitution-ecran-honnete.spec.ts:54` clique sur « Finaliser le décompte ».
   - À faire : retrier la liste (action déclenchée par un parcours ou non) avant d'écrire des tests. L'effort L peut baisser.

6. **L8 : la recherche des dépendances ne couvre pas tout.**
   - Preuve : `liste_attente` est lue par les fonctions de conservation (`20261024140000_conservation_et_prospection.sql:1152` et `:1215`), par le bouton de purge de la console (`admin/journaux/bouton-purge.tsx:17`), et la page de confidentialité la cite comme finalité (`confidentialite/page.tsx:198-203`).
   - Postgres ne suit pas ces dépendances dans le corps des fonctions : il faut aussi chercher dans `supabase/migrations`. La suppression oblige à réécrire ces fonctions et à modifier la page de confidentialité (règle Q99 : date et empreinte ensemble).
   - 14 des 17 fonctions sont tenues par des tests (Q36) : retirer leurs droits demande d'adapter ces tests.

7. **Q36 : le plan redemande ce qui est déjà décidé, et oublie une partie.**
   - Preuve : `QUESTIONS.md:52`, décision mot pour mot : « liste_attente … à retirer dans un lot à part après la publication … Code inatteignable et « CAF / APL » : même lot à part. »
   - Q36 (4) n'est donc pas une question ouverte.
   - Q36 (3) manque au plan : le code qu'aucun écran n'atteint (ancien formulaire de bail, classe énergétique et diagnostic depuis le bail, envoi par l'ancien service de signature). Ce retrait ne supprime rien en base.

8. **Risque transverse oublié : les conditions archivées le 26/11 figent leur texte.**
   - Preuve : archivage irréversible (`JOURNAL.md:657`). Changer après coup le nom, l'adresse ou l'e-mail imprimés, ou le texte de `/conditions`, crée une « empreinte différente » (`conditions-versions-serveur.ts:208-251`). Les premières souscriptions des particuliers attendent alors une nouvelle version (`notes-T4.md:84-86`), elle-même bloquée par Q93 dès le premier abonné.
   - Points touchés : Q79 (nom commercial, absent après R1, `JOURNAL.md:656`), Q66 (mention de TVA), Q85 (conditions de l'artisan).
   - À faire : une règle pour chaque lot (tout changement de ce texte = nouvelle version), et L3 (Q93) avant.

9. **Lots avec migration (L2, L3, L6, L8) : il n'y a pas de préproduction.**
   - Preuve : `NON-FAIT.md` § 1 (Q1 : « Le premier vrai passage sera la production ») ; `DECISIONS-2026-11-24.md`, P3 : un retour arrière n'est joué par l'agent qu'après un accord écrit du dirigeant, chaque fois.
   - À ajouter à chaque lot :
     - un fichier de retour arrière, avec la chaîne des retours testée (leçon RET-01, `NON-FAIT.md` § 5) ;
     - la publication contrôlée (simulation, sauvegarde, migrations avant le code : `PLAN-DE-PUBLICATION.md`, étapes É5 à É10).

10. **Défauts connus absents de L4.**
    - Pages publiques : E059, E061, E066, E067, E169, E176, E178 (`notes-banc/passe2/p2-relecture-public.md:22`). Leur contenu est perdu avec la liste des défauts d'écran (B4) : à retrouver par le relevé de L5. SUPPOSÉ, mineurs.
    - Console : dates affichées en mm/jj/aaaa (`p2-relecture-superadmin.md:26`), peut-être dû à la langue du navigateur de test.
    - Artisan : photo du locataire affichée cassée (`p2-relecture-artisan.md:9`), à vérifier avec une vraie photo (B6). SUPPOSÉ.

11. **Trou de couverture à ajouter à L5 (et préalable à L7, Q102).**
    - Preuve : `p2-relecture-documents-envois.md`, point 2 : aucun PDF de congé pour vendre ou reprendre n'est produit depuis T1, car le banc n'envoie pas `achete_occupe`.
    - À faire : corriger `zz-phase3-documents.test.ts`, puis relire un PDF. VÉRIFIÉ dans le document. Gravité majeure (document légal jamais rendu). Effort S.

12. **Statuts à corriger.**
    - B1 (cinq envois fermés) : VÉRIFIÉ en base le 26/11 (`JOURNAL.md:679`), pas SUPPOSÉ. Ce n'est pas un défaut : c'est le geste R5 qui reste à faire.
    - A3 et A4 : ce sont des blocages voulus (R6, R8, et la consigne de ne pas rouvrir les souscriptions), pas des défauts du code. À sortir du décompte des défauts majeurs.
    - E096 : `sante-service.ts:257` lit bien `ZOHO_SIGN_DOCUMENTS_ACTIF`. Le défaut est la ligne du cautionnement (`:269-274`), qui affiche « Activé » sans tenir compte de la connexion, de `ZOHO_SIGN_BAIL_ACTIF` ni de `ZOHO_SIGN_DOCUMENTS_ACTIF`, contrairement à `ouverture-signatures.ts:16-20`.

13. **Classé « corrigé » à tort : T3R-3.**
    - Preuve : `notes-T3.md:91` le note « dit dans le test » : le refus n'est tenu que par l'action serveur, pas par la base.
    - Les quatre questions de `notes-T3.md:113-116` ne sont pas numérotées dans `QUESTIONS.md` (aucune mention de « T3R »). À ajouter aux trois questions du lot 61.

14. **Choix en attente oubliés dans la liste de la partie 3.**
    - Q71 : garde de 0,8 à 1,25 sur les indices (`QUESTIONS.md:87`).
    - Q74 : adresse imprimée sur le PDF de la quittance (`QUESTIONS.md:90`). Elle est touchée directement par #360 : le PDF lit l'adresse de la fiche, la quittance en ligne celle de l'espace, et un déménagement signalé sans rien écraser les fait diverger.

15. **Gestes oubliés en partie 3.**
    - Parcours de vérification (R4 bis) pas fini : A7 (libellés de la console), A9 (Facebook), A14 et A15 (couper puis rallumer l'IA), et toute la partie B (`JOURNAL.md:678-690`).
    - Fermeture du compte fictif `TEST-PUBLICATION`, à programmer dans la console (`JOURNAL.md:691`).
    - Accords de traitement signés avec les prestataires (`AUDIT.md:545`, « Hors plan »).

16. **Échéances datées oubliées (le plan ne date que celle du 01/01/2028).**
    - Repères fiscaux à revérifier chaque janvier (Q38).
    - Mention « article 293 B » reportée au 01/01/2027 (`JURISTE.md:495-504`).
    - Nouveau décret des zones tendues n° 2026-831 au 01/01/2027 (`JURISTE.md:687`).
    - Rédaction de l'article L. 102 B au 01/01/2027 (`JURISTE.md:781`).

17. **Identifiants qui se télescopent (cosmétique).**
    - En L4 (« Divers »), « A10 » et « A12 » désignent des étapes du parcours de vérification, alors que dans le tableau 1e, A10 = Q96 et A12 = Q123.
    - « R6 » et « R9 » du lot 60 se confondent avec le réglage R6 de la console (médiateur).
    - À renommer, par exemple « parcours A10 », « L60-R6 ».

Fichiers utiles :
- `/home/user/GERIMMO_V4/livrables/notes-banc/passe2/p2-relecture-public.md`
- `/home/user/GERIMMO_V4/livrables/notes-banc/passe2/p2-relecture-documents-envois.md`
- `/home/user/GERIMMO_V4/livrables/notes-banc/notes-T3.md`
- `/home/user/GERIMMO_V4/livrables/notes-banc/notes-T4.md`
- `livrables/notes-banc/actions-non-citees-2026-11-26.txt`