---
type: synthesis
tags: [audit, publication, autonomie, abonnement, stripe, courriels, facebook, marketing, essai, novembre-2026]
status: stable
created: 2026-11-15
updated: 2026-11-15
sources: []
---

# Audit final indépendant — PR 335 — 15 novembre 2026

**SHA audité : `cbf316793e825352a6a63d7a9074456bbbe801a4`** (tête de la PR [335](https://github.com/GERIMMO/GERIMMO_V4/pull/335), branche `codex/reprise-contrats-facebook-20261114`), comparé à `main` = production = `b470bf1b5878607584503e45b7f88388cca00e78`. Quatorze commits, 69 fichiers, quatre migrations additives. Audit conduit le 15/11/2026, indépendamment des conclusions de Codex (`ETAT-AUTONOMIE-GERIMMO.md` lu comme une liste d'affirmations à vérifier). Aucune donnée réelle modifiée, rien fusionné, rien publié : production consultée en lecture seule (SELECT), écritures uniquement sur des bases fictives locales.

Pages liées : [[Audit final avant publication — 19 octobre 2026]], [[Contrôle des livraisons de Codex — 22 octobre 2026]], [[Calendrier de lancement — 30 novembre 2026]].

## 1. Verdicts

| Décision | Verdict | En une phrase |
|---|---|---|
| **Publication technique** du candidat (migrations puis code) | **GO** | Rien de dangereux à publier : aucune faille, aucun doublon externe possible, migrations sûres sur les données réelles et compatibles avec le code en ligne pendant la bascule. Les défauts trouvés ne s'expriment pas tant que les ventes sont fermées et que Facebook reste sous validation. Deux petites régressions (R1 atelier, A2 Facebook manuel) sont à corriger de préférence dans la PR avant fusion ; si elles partent telles quelles, les corriger avant la première préparation d'atelier et avant toute publication Facebook manuelle. |
| **Exploitation autonome** (minimum d'intervention quotidienne) | **NO GO** en l'état | Le suivi de l'atelier ne retrouve plus les nouvelles propositions, plusieurs états bloqués ne se dénouent qu'en SQL (tentative Facebook incertaine, échec d'une publication manuelle, courriers contractuels refusés) et les essais en cours se figent en lecture seule à partir du 24/12/2026 sans décision commerciale. Score indépendant : **56/100** (§ 8), contre 65 annoncés par Codex et 55 pour la production. |
| **Souscriptions payantes** | **NO GO** | Deux défauts applicatifs bloquants (accusé de résiliation perdu, confirmation non envoyée pour une adresse de facturation distincte) et des obligations externes non remplies (médiateur de la consommation, archivage des conditions du 15/11, ouverture décidée par le dirigeant, configuration Stripe réelle, preuve de délivrabilité). |

Les défauts bloquants des souscriptions et de l'autonomie sont décrits au § 4 avec un scénario reproductible et la correction minimale attendue de Codex. Ils **n'empêchent pas** la publication technique : en production, les ventes sont fermées (`souscriptions_payantes_ouvertes = false`, blocage d'identité actif), il n'existe aucun abonnement Stripe ni aucun courrier contractuel, aucune proposition d'atelier n'est en préparation et la validation obligatoire des affiches est active.

## 2. Ce qui a été vérifié, et comment

- **CI sur le SHA exact** — journaux bruts téléchargés, pas le résumé de la PR :
  - CI « Lint, types, tests, build » [43702924844](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/43702924844) : succès. Vitest **891 fichiers réussis, 1 sauté ; 12 525 tests réussis, 18 sautés**. Parcours navigateur par profil **275 réussis, 3 sautés** (démonstration et les deux parcours G-25 qui exigent un paiement configuré). WebKit mobile **72 réussis, 1 réussi à la reprise** (`recommandes-consentements`, 390 px : « Load failed » du portail locataire au premier passage). Étapes PostgREST 14.5 réel, activations concurrentes, boîte fictive à réseau bloqué, invitation artisan en base jetable : réussies.
  - Banc Stripe TEST [43702941289](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/43702941289) : **16/16** contre l'API Stripe en mode test ; la clé est refusée si elle ne commence pas par `sk_test_`/`rk_test_`. Couvre paiement accepté et idempotence, carte refusée, 3-D Secure, remboursement, hausse au prorata, baisse et passage à l'annuel à l'échéance, résiliation à l'échéance, webhook signé reçu par relais, portail client sans résiliation.
  - Les deux CI précédentes de la branche (5c0489b6, 80f4e5af) avaient échoué ; la tête cbf31679 corrige les deux écarts annoncés (version des conditions du scénario, comparaison des champs du déclencheur après restauration).
- **Banc fictif local (PostgreSQL 16)** :
  - les 498 migrations (494 de `main` + 4 candidates) s'appliquent sur une base vide ;
  - tests ciblés du candidat rejoués : **127/127** (essai, contrats durables, contre-audit 335, marketing, Facebook, Stripe/courriers, résiliation, manifeste) ;
  - **fenêtre de bascule** : les tests base de `main` (le code aujourd'hui en ligne) passent sur le schéma migré du candidat : **169 + 23 réussis**, un seul écart attendu (l'ancienne règle « 1 mois à partir de 2027 », volontairement remplacée) ;
  - rejeux de scénarios d'attaque (§ 4).
- **Production en lecture seule** (SELECT seulement) : 5 organisations, toutes en essai (fins du 24 au 29/12/2026, 61 jours chacune) ; 0 abonnement Stripe ; 0 courrier contractuel ; 18 articles dont 11 déjà diffusés sur Facebook, 0 tentative Facebook incertaine, 0 article programmé ; validation obligatoire active ; souscriptions payantes fermées ; version des conditions du 11/11 archivée ; 5 acceptations, toutes sur la version du 24/10 ; aucun article publié ne mentionne l'ancienne « offre de lancement ». Sauvegarde quotidienne réussie le 15/11 à 07 h 55 UTC, dernière restauration réelle vérifiée le 14/11, contrôles de disponibilité réussis. Les migrations de `main` récentes (depuis le 08/11) sont toutes appliquées ; l'écart de numérotation des migrations d'août à octobre est historique et sans effet sur ce candidat.
- **Revue de code** en quatre volets indépendants (courriers et Stripe ; Facebook et affiches ; essai, conditions et portails ; atelier, sécurité et procédures), chaque constat important ensuite **contre-vérifié** dans le code et, quand c'était possible, rejoué en base.

Non vérifié : livraison réelle d'un courriel, publication réelle sur Meta, rendu visuel des écrans par un humain (les 275 parcours CI et les captures de Codex n'ont pas été refaits), délais réels des webhooks Stripe en production, appréciation juridique.

## 3. Résultats par point demandé

| # | Point | Résultat |
|---|---|---|
| 1 | Confidentialité et sécurité des données | **Conforme pour le candidat** (détail § 3.1). |
| 2 | Deux mois d'essai permanents, sans limite globale de dix | **Conforme.** `essai_ordinaire_fin()` = jour de Paris + 2 mois calendaires, sans date de bascule ; seuls appelants : inscription propriétaire et ouverture par la console. Aucune limite du nombre d'inscrits ou d'essais dans le code, les déclencheurs ni les migrations. La seule limite « dix » concerne l'avantage fondateur de 6 mois accordé à la main par le super-administrateur (distinct de l'essai, annoncé à l'article 8.1). Réserve : la console peut ouvrir un propriétaire avec un essai plus court (0 à 365 jours), ce que l'article 8.2 ne prévoit plus (§ 5). |
| 3 | Absence de conversion automatique | **Conforme.** Un abonnement ne naît que d'un Checkout Stripe lancé par le client, après acceptation de la version en vigueur des conditions ; aucune tâche ne traite la fin d'essai ; sans souscription, l'espace passe en lecture seule (`org_ecriture_ouverte`). |
| 4 | Confirmations, résiliations, conditions, reprises des courriers | **Non conforme pour les ventes** : deux défauts bloquants (§ 4, B1 et B2) et un prérequis d'archivage (§ 6). Conforme sur l'absence de doublon : identifiant durable, index unique par épisode, verrou de ligne, refus d'un second chemin, état « inconnu » jamais réémis. |
| 5 | Stripe en environnement TEST | **Conforme** : 16/16 sur la vraie API en mode test au SHA exact ; aucune clé réelle possible sur ce banc. Réserve : `lier_preuve_commande` peut faire échouer en boucle les webhooks d'une souscription si sa preuve disparaît (§ 5). |
| 6 | Facebook et reprise sans doublon | **Sans doublon : conforme** (verrou consultatif, `FOR UPDATE`, réservation conditionnelle juste avant l'appel, tentative incertaine jamais renvoyée, index unique sur l'identifiant de post, lien propre à l'article préservé). **Reprise : incomplète** — états bloqués sans issue applicative (§ 4, A1 et A2). |
| 7 | Validation des affiches par le super-administrateur | **Conforme** : la parution sur le site et la réservation Facebook relisent la validation ; toute modification du titre, du slug, du chapô, du corps, du texte Facebook, de l'image ou de son empreinte retire la validation. Réserves non bloquantes : quelques colonnes non couvertes (§ 5). |
| 8 | Surveillance, reprises automatiques, propositions de correction | **Surveillance et reprises sûres** (aucun effet externe répété), **mais incomplètes** : états bloqués A1 à A3 (§ 3.2, § 4). |
| 9 | Propositions d'évolution au super-administrateur | **Garde-fous conformes** (aucune fusion ni publication sans décision humaine), **mais régression R1** : le suivi des nouvelles propositions ne fonctionne plus (§ 4). |
| 10 | Cohérence UX des quatre portails | **Conforme pour ce qui change** : lien « Aller au contenu » commun, cible `#contenu-espace` unique dans chaque portail, règle CSS déplacée à l'identique ; textes publics de l'essai cohérents (« 2 mois d'essai gratuit » partout). 275 parcours CI réussis ; pas de nouvel examen visuel humain. |
| 11 | Migrations, sauvegardes, restaurations, publication | **Conforme, sous conditions d'ordre** : migrations additives et sûres sur les données réelles ; migrations d'abord, depuis `main`, puis code ; restauration d'une base migrée à vérifier après la bascule (§ 3.3, § 7). |
| 12 | Régressions gestion locative et finances | **Aucune régression trouvée** : factures, paiements, baux et quittances non modifiés ; suite complète CI verte ; tests base de `main` verts sur le nouveau schéma. |

### 3.1 Sécurité et confidentialité

- Nouvelle table `preuves_commandes_abonnement` : RLS activée, aucun droit pour `public`, `anon`, `authenticated` ni `service_role` ; accès uniquement par fonctions `SECURITY DEFINER`.
- Nouvelles fonctions : `search_path` fixé, exécution réservée à `service_role` (`lier_preuve_commande`, `confirmer_geste_resiliation`, `finaliser_courriel_metier`, `titres_editoriaux_utilises`) ou fermée à tous (`empreinte_metier_courriel`, anciennes versions renommées). `abonnement_courrier_contexte`, redéfinie par `create or replace`, garde ses droits d'origine (service_role seul).
- `reserver_diffusion_facebook` reste ouverte à `authenticated`, mais le chemin manuel exige `is_permanent_super_admin()` (adhésion super-admin et session AAL2) et le chemin automatique `service_role` : vérifié dans la fonction compilée du banc.
- Métadonnées Stripe : identifiants techniques seulement (commande, acceptation), aucune donnée personnelle ; le journal des gestes refuse toute arobase.
- Avis de sécurité Supabase de la production (antérieurs au candidat) : une alerte « ERROR » sur la vue `organisations_portail` en `SECURITY DEFINER` ; vérifié : la vue filtre par `user_org_ids()` et ne donne l'IBAN qu'au locataire actif de l'organisation. Pas de fuite.

### 3.2 Surveillance, atelier et propositions

- **Surveillance** (conforme) : `disponibilite.yml` lit seulement, puis ouvre un seul ticket après deux échecs, avec dédoublonnage ; les dernières exécutions planifiées sont réussies. Reprise des courriels chaque minute : contexte relu en base, filtre du pilote, expiration à 23 h, état « inconnu » jamais réémis. Facebook : le rapprochement ne fait que lire la Page ; une réservation n'est libérée que sur un refus Meta explicite (HTTP 4xx et codes 4, 17, 32, 190, 200, 613). Les reprises automatiques sont donc **sûres** : aucune ne peut répéter un effet externe. Elles ne sont pas **complètes** : voir A1 à A3.
- **Propositions de correction et d'évolution** :
  - garde-fous conformes : aucune fusion automatique dans `.github` ni dans les scripts ; PR créée en brouillon ; publication soumise à l'environnement `gerimmo-production` avec relecteur unique, sans contournement par les administrateurs ; jeton d'écriture limité au job qui propose, sans persistance ; aucun secret dans les corps de PR ni les journaux ; exécutions sérialisées ; accusé perdu, exécutions concurrentes et branche divergente correctement traités (53/53 contrôles `node --test`).
  - **régression bloquante pour l'autonomie (R1, § 4)** : le suivi dans l'application ne retrouve plus les nouvelles propositions.
  - En production, 58 propositions attendent « à étudier » (la plus récente du 25/10) ; aucune n'a encore été préparée par l'atelier.

### 3.3 Migrations, sauvegardes, restauration et publication

- Les quatre migrations sont **additives** : colonnes avec valeur par défaut, nouvelle table, déclencheurs ; la migration de l'essai ne remplace qu'un calcul. Elles s'appliquent sur base vide et ne heurtent aucune donnée de production (0 courrier contractuel pour l'index unique, 0 tentative Facebook ouverte, 18 articles historiques laissés hors file Facebook par la valeur par défaut). Manifeste : 498 fichiers, égal à `ordre-migrations.txt` ; `conditionner-migration verifier` et `lot` réussissent.
- **Ordre** : migrations d'abord, code ensuite. Le code en ligne (`b470bf1b`) fonctionne sur le schéma migré (tests de `main` rejoués). L'inverse est faux : le nouveau code sans les migrations ferait échouer le webhook (`lier_preuve_commande` absente) et la préparation marketing (`titres_editoriaux_utilises` absente). Un retour au code `b470bf1b` sur le schéma migré reste possible ; aucun script SQL de retour arrière n'existe pour ces quatre migrations (Codex prévoit une « correction en avant »).
- Gardes du workflow « Migrations Supabase » : CI verte sur la révision exacte et sauvegarde de moins de 90 minutes, applicables à un lancement depuis `main` après fusion. Le workflow n'impose pas d'être lancé depuis `main` (constat préexistant, § 5).
- Sauvegardes et restauration : quotidiennes et réussies ; restauration réelle vérifiée le 14/11 sur la version en ligne. La restauration d'une base **migrée par ce candidat** n'a été éprouvée que sur un banc local (Codex) : à refaire juste après la bascule.

## 4. Défauts bloquants

### Bloquants pour les souscriptions payantes

**B1 — L'accusé de résiliation ne part pas quand un changement programmé est annulé au même moment.** Certain (rejoué en base).
- Scénario : un abonné a une baisse de capacité ou un passage à l'annuel programmé à l'échéance (échéancier Stripe). Il clique « Résilier ».
- Déroulé (`app/src/app/actions/abonnement.ts:654-711`) : le geste est consigné (instant T1) ; Stripe libère l'échéancier ; `abonnement_changements_a_recalculer` pose `updated_at = now()` (T2 > T1) ; `confirmer_geste_resiliation` (migration `20261115081330`, ligne 157) exige `updated_at <= geste.created_at` et ne fait donc rien : `annulation_demandee` reste à faux ; l'empreinte de l'accusé exige `annulation_demandee` (ligne 116) et renvoie null ; le courriel est marqué « reprise_autonome = false — nouvelle validation nécessaire » ; l'écran affiche « n'a pas pu partir ». Le webhook qui suit s'abstient, parce que la résiliation vient de la page (`stripe-evenements.ts:335`). Aucune reprise.
- Rejeu sur base fictive (transactions séparées comme dans l'application) : sans libération d'échéancier, `annulation_demandee = t` ; avec libération, `annulation_demandee = f`.
- Impact : l'accusé de réception de la résiliation, obligatoire sur support durable, n'est pas envoyé.
- Correction minimale : appeler `abonnement_changements_a_recalculer` **après** `confirmer_geste_resiliation`, ou comparer à `derniere_synchro` (posée seulement par la synchronisation Stripe) au lieu de `updated_at` ; ajouter le cas `echeancierLibere: true` à `resiliation-action.test.ts` (aujourd'hui forcé à `false`, ligne 89) et une reprise pour une notification « page » restée sans accusé.

**B2 — La confirmation de souscription ne part pas si l'adresse de facturation diffère de l'adresse de connexion vérifiée.** Mécanisme certain ; fréquence mesurée en production : **1 organisation sur 5**.
- `destinataire_facturation` prend d'abord `organizations.email_contact`, champ obligatoire du profil ; l'empreinte exige un responsable actif dont l'adresse de connexion vérifiée est égale à ce destinataire (`20261115081330`, lignes 133-136). Sinon la confirmation est refusée.
- Codex l'annonce (« une adresse de facturation différente nécessite une intervention »), mais l'intervention n'a pas d'outil : le motif affiché est « Conservation sécurisée indisponible », le courriel passe en « reprise_autonome = false », l'index unique par épisode et l'identifiant (organisation, clé, adresse) interdisent ensuite tout nouvel envoi automatique, même vers une adresse corrigée.
- Impact : pour un client sur cinq aujourd'hui, la confirmation du contrat, obligatoire, dépendrait d'une intervention technique.
- Correction minimale : envoyer la confirmation au responsable vérifié qui a commandé (adresse de connexion), avec copie éventuelle à l'adresse de facturation une fois vérifiée ; à défaut, alerte explicite au super-administrateur et geste « renvoyer après vérification » journalisé.

### Bloquants pour l'exploitation autonome

**R1 — Le suivi de l'atelier ne retrouve plus les nouvelles propositions (régression de ce candidat).** Certain (code ; enchaînement des deux modules rejoué par la revue).
- `app/scripts/atelier/proposition-github.mjs:3` crée désormais la branche `gerimmo/proposition-<id>` sans suffixe. `app/src/lib/suivi-corrections.ts:22-28` ne cherche que `gerimmo/proposition-<id>-<numéro d'exécution>`, et utilise ce numéro pour prouver l'origine (`actions/runs/<n>`).
- Scénario : le super-administrateur lance la préparation d'une proposition ; l'atelier crée la branche et la PR brouillon ; dans l'application, « Actualiser » répond indéfiniment « La préparation n'a pas encore produit de version ». La proposition ne passe jamais au statut « autorisation » : l'accord du super-administrateur dans l'application devient impossible (rien n'est contourné ; c'est un blocage, pas une faille).
- La CI ne le voit pas : `tests/suivi-corrections.test.ts` utilise encore une branche suffixée `-123`.
- Correction minimale : accepter aussi la branche exacte dans le suivi et retrouver l'exécution d'origine autrement (exécutions d'`atelier-code.yml` filtrées sur `display_title = "Amélioration <id>"`, ou `GITHUB_RUN_ID` inscrit dans le commit puis vérifié) ; ajouter un test qui enchaîne `assurerProposition` puis `recueillirCorrection`.

**A1 — Une tentative Facebook incertaine reste bloquée indéfiniment, sans outil pour la solder.** Certain (code et banc).
- Scénario : Meta ne répond pas (délai, 5xx, codes 100/324). L'article garde `facebook_envoi_demarre_le` sans identifiant de post. À chaque passage du traitement marketing : recherche en lecture sur la Page ; si elle échoue (ou si la Page ne permet pas une correspondance unique), erreur « un envoi a déjà été engagé » et réponse 503 (`missions-planifiees/marketing.ts:70-76, 258-266`).
- Aucune issue dans l'application : le bouton manuel refuse (réservation impossible), la modification est refusée par le nouveau déclencheur `reverifier_affiche_modifiee` (« Vérifiez la tentative Facebook en cours… »). Restent : retirer l'article du journal, ou SQL.
- Correction minimale : une fonction réservée au super-administrateur, journalisée, `solder_tentative_facebook(id, post_id | null)` (rattacher l'identifiant constaté sur la Page, ou déclarer « non publié » et libérer), exposée dans `/admin/marketing`.

**A2 — L'échec d'une publication Facebook manuelle verrouille l'article (régression de ce candidat).** Certain (code).
- Le chemin manuel (`app/src/app/actions/publications.ts:168-171`) n'efface jamais la réservation, même sur un refus certain (jeton expiré, code 190 ; configuration absente). Avant ce candidat, l'article restait modifiable ; désormais le déclencheur `reverifier_affiche_modifiee` refuse toute modification tant que la réservation reste ouverte.
- Correction minimale : reproduire dans le chemin manuel la libération de `marketing.ts:108` sur `RefusFacebookCertain` ; même outil que A1 pour les autres cas.

**A3 — Erreurs répétées sans fin sur un article paru sans validation.** Certain (rejoué en base). Si le super-administrateur fait paraître lui-même un article marketing programmé non validé, il devient « à diffuser » ; à chaque passage la réservation est refusée (validation absente), le traitement répond 503. La validation a posteriori est impossible (`decider_publication_marketing` n'accepte que l'état programmé). Issue applicative : modifier le texte ou publier à la main sur Facebook. Correction : ne pas armer la diffusion automatique lors d'une parution manuelle non validée, ou classer ce refus en « attente » sans erreur.

**A4 — Les essais en cours se figent à partir du 24/12/2026.** Constat d'exploitation, pas un défaut de code : les cinq organisations de production terminent leur essai entre le 24 et le 29/12/2026 ; sans ouverture des ventes ni prolongation décidée, elles passent en lecture seule. Décision du dirigeant à prendre avant le 24/12.

## 5. Défauts non bloquants

À traiter par Codex sans retarder la publication technique ; ceux marqués « avant ventes » doivent l'être avant d'ouvrir les souscriptions payantes.

| Réf. | Constat | Où | Correction minimale |
|---|---|---|---|
| N1 (avant ventes) | `lier_preuve_commande` lève une erreur (`select … into strict`, « Commande différente », 23505) : si la preuve disparaît (compte supprimé en cascade, métadonnée modifiée dans Stripe), chaque événement suivant de la souscription répond 500 et la fin du traitement est sautée (marques de levée, alerte d'impayé, accusé). L'activation n'est pas bloquée. | `stripe-evenements.ts:183-187`, migration `20261115081330:17` | Ne lier qu'en l'absence de preuve ; en cas d'échec, tracer et continuer. |
| N2 (avant ventes) | Preuve de commande plus faible qu'annoncé : la ligne du journal `abonnement_commande_confirmee` n'est pas reliée à l'intention de commande (son identifiant n'y est pas inscrit) ; la preuve peut viser un geste antérieur d'un autre montant. Les conditions citées restent justes. Aucun test du chemin webhook vers la preuve, ni de `confirmer_geste_resiliation`, ni des métadonnées Checkout. | migration `20261115081330:17-26`, `abonnement.ts:317-325` | Inscrire l'identifiant d'intention dans le journal et joindre dessus ; ajouter les tests. |
| N3 (avant ventes) | Messages trompeurs : « Conservation sécurisée indisponible » pour un refus métier ; « l'accusé n'a pas pu partir » alors qu'il est parti si seule la finalisation échoue. | `email.ts:179`, `courriers-contrat-envoi.ts:314`, `abonnement.ts:711` | Distinguer refus métier, envoi incertain et finalisation à reprendre. |
| N4 | La console peut ouvrir un propriétaire avec un essai de 0 à 365 jours, alors que l'article 8.2 promet deux mois sans réserve. | `organisations-admin.ts:64`, `formulaire-ouverture.tsx:111` | Pour `proprietaire_direct`, n'autoriser que l'allongement, ou ajouter « sauf accord particulier écrit » à l'article 8.2. |
| N5 | Version des conditions datée du 15/11/2026 en dur : si la mise en ligne a lieu plus tard, la page dira « en vigueur depuis le 15 novembre » sans l'avoir été. | `editeur.ts:414-417`, `conditions-versions.json` | Publier le 15/11 ou caler la date (et l'empreinte) sur le jour réel. |
| N6 | Article 16 (versions déjà acceptées) : notification par courriel un mois avant toute nouvelle version ; la version du 15/11 prend effet le jour même, sans courriel aux clients. Atténué : contrats en cours inchangés, modification favorable. | `conditions/page.tsx:1002-1007` | Avis du juriste ; à défaut, notifier les cinq comptes. |
| N7 | Facebook : colonnes non couvertes par le retrait de validation (`seo_description` = description Open Graph, `sources`, `veille_source_id` — le mettre à null fait sauter le contrôle de veto) ; image validée par URL, pas par contenu. Le super-administrateur peut aussi poser `facebook_a_diffuser` à la main (droit UPDATE large), et un INSERT n'est pas contrôlé. | migration `20261115095339:21`, `20261114210623:84-117` | Étendre le déclencheur ; exiger l'URL `marketing-visuels/<id>/<empreinte>.jpg` ; forcer ces champs en INSERT et hors transition. |
| N8 | Facebook : « Faire paraître » arme désormais la diffusion automatique (changement non documenté) ; un article refusé pour plafond reste armé et passe en premier la semaine suivante ; une erreur survenue avant toute réservation est consignée comme « confirmation manquante ». | `marketing.ts:105-113`, migration `20261114210623:84-85` | Documenter ; tester `reserve` avant de consigner ; classer plafond et pause en « attente ». |
| N9 | Atelier : une reprise échoue si `main` a avancé entre la création de la branche et celle de la PR (branche orpheline) ; une PR fermée est renvoyée comme un succès. Échecs sûrs. | `proposition-github.mjs:4-20` | Vérifier la branche existante avant `main` ; erreur explicite si la PR est close. |
| N10 | Le workflow « Migrations Supabase » peut être lancé depuis une autre branche que `main` (la CI de PR verte suffirait à la garde). Préexistant. | `.github/workflows/migrations.yml` | `if: github.ref == 'refs/heads/main'` et environnement protégé. |
| N11 | Lot de migrations en une transaction sans `lock_timeout` (verrous sur `publications`, `abonnements`, `courriels_durables`). Impact faible avec cinq clients. | quatre migrations | `set local lock_timeout`. |
| N12 | Empreinte SHA-256 sans sel de l'adresse de l'accusé inscrite dans `audit_log`, retrouvable par dictionnaire (même procédé déjà dans `courriels_durables`). | `abonnement.ts:663` | HMAC avec une clé serveur. |
| N13 | Kit de recette interne et quelques commentaires encore sur « offre de lancement / 1 mois », formules Solo/Bailleur et carte « débitée à la fin de l'essai ». Pages de conditions de test compilées par webpack et non Turbopack. | `scripts/kit-recette/`, `formulaire-inscription.tsx:14-15`, `tests/fixtures/conditions-next-start*.html` | Réécrire les textes ; régénérer les pages avec la compilation de production. |
| N14 | Une erreur WebKit « Load failed » du portail locataire à 390 px, réussie à la reprise. | CI, `recommandes-consentements.spec.ts` | À surveiller ; aucun défaut reproduit. |

## 6. Souscriptions payantes : ce qui manque

**Corrections applicatives (Codex)** : B1 et B2 (§ 4), N1 à N3 (§ 5), puis un nouveau passage du banc Stripe TEST avec ces scénarios (échéancier libéré au moment de la résiliation ; adresse de facturation distincte).

**Obligations externes et décisions (dirigeant)**, à remplir avant d'ouvrir les ventes :
1. Médiateur de la consommation : en production, les huit faits obligatoires de l'identité de l'éditeur sont renseignés, mais **le nom, l'adresse et le site du médiateur sont vides** (obligatoires pour vendre à des particuliers), et le blocage de souscription de la supervision est **actif** (`blocage_souscription_identite = true`). Voir [[Informations manquantes — 23 octobre 2026]].
2. Archiver la version des conditions du 15/11 **avant** la première souscription : tant qu'elle ne l'est pas, le lien des confirmations mène à une page introuvable et le PDF des conditions manque (`courriers-contrat-envoi.ts:183-185`, `[version]/page.tsx`). La version du 11/11 est bien archivée.
3. Relecture juridique des articles 8.2 et 16 (§ 5, N4 à N6).
4. Configuration Stripe réelle (clés et webhook de production, mode commercial) : non vérifiée ici, par construction (le banc refuse les clés réelles).
5. Preuve de délivrabilité réelle des courriels contractuels (domaine, réception) : aucun test ne la démontre ; seules des boîtes fictives ont été utilisées.
6. Décision d'ouverture (`souscriptions_payantes_ouvertes`) par le dirigeant.

## 7. Conditions de la publication technique

1. Fusionner la PR 335 (de préférence après correction de R1 et A2, avec la CI verte sur le nouveau SHA).
2. Attendre la CI verte sur `main` (push) et une sauvegarde de moins de 90 minutes.
3. Lancer « Migrations Supabase » **depuis `main`** (simulation, puis application des quatre fichiers dans l'ordre du manifeste).
4. Promouvoir ensuite le code par « Publication contrôlée ». Jamais l'inverse : le nouveau code sans les migrations ferait échouer le webhook Stripe et la préparation marketing.
5. Après promotion : santé et version publiques ; archivage de la version des conditions du 15/11 ; restauration de la sauvegarde suivante vérifiée par le workflow dédié (première restauration d'une base migrée par ce candidat).
6. Garder les ventes fermées et la validation obligatoire des affiches active.

## 8. Autonomie : ce qui reste humain

Grille de Codex (dix domaines de dix points), notée ici indépendamment :

| Domaine | Note | Pourquoi |
|---|---|---|
| Confidentialité | 9 | Aucune exposition nouvelle ; réserve N12. |
| Inscription et abonnements | 7 | Essai et absence de conversion conformes ; essais figés le 24/12 sans décision ; N4. |
| Courriers | 3 | B1, B2, archivage des conditions, messages trompeurs. |
| Reprise | 5 | Aucun doublon possible, mais états bloqués sans outil (A1 à A3, N1). |
| Marketing | 4 | Validation et anti-doublon conformes ; Facebook exige du SQL après une tentative incertaine ou un échec manuel. |
| Correction assistée | 2 | R1 : le suivi des nouvelles propositions est rompu ; aucune proposition n'a encore été préparée en production. |
| Ergonomie | 6 | 275 parcours CI et WebKit ; pas de nouvel examen visuel humain dans cet audit. |
| Sauvegarde et livraison | 8 | Sauvegardes et restauration réelles réussies ; restauration du schéma migré non encore faite ; N10, N11. |
| Risques premiers clients | 5 | Fin des essais le 24/12 ; ventes impossibles en l'état. |
| Non-régression | 7 | CI complète et fenêtre de bascule vérifiées ; deux régressions trouvées par la revue et non par la CI. |
| **Total** | **56/100** | Le candidat n'améliore pas l'autonomie de façon mesurable tant que R1, A1 et A2 restent ouverts. |

Après le seul correctif de R1, A1 et A2 (outil de soldage Facebook, libération sur refus manuel, suivi de l'atelier), le dirigeant n'interviendrait plus que pour des décisions : validation des affiches, accord sur les propositions, ouverture des ventes. Il n'aurait plus à faire de manipulation technique. Le score atteindrait alors environ 63/100. Les courriers contractuels ne compteront qu'à l'ouverture des ventes.

**Décisions du dirigeant, indépendantes du code :**
- avant le 24/12/2026 : ouvrir les ventes ou prolonger les cinq essais ;
- choisir la date de mise en ligne (N5) ;
- garder ou lever la validation obligatoire des affiches (elle reste recommandée).
