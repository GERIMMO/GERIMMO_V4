---
type: synthesis
tags: [audit, publication, contre-verification, abonnement, courriels, facebook, atelier, securite, novembre-2026]
status: stable
created: 2026-11-15
updated: 2026-11-15
sources: []
---

# Contre-vérification ciblée — PR 335 — candidat 962f2c76

**Candidat vérifié : `962f2c76744e52b5c674d2c5a220a2060ea5c841`** (tête de la PR [335](https://github.com/GERIMMO/GERIMMO_V4/pull/335)), comparé au candidat audité précédemment `cbf316793e825352a6a63d7a9074456bbbe801a4` ([[Audit final indépendant — PR 335 — 15 novembre 2026]]). Base `main` = production = `b470bf1b`. Écart : trois commits (7345ca9b, 60d2e537, 962f2c76), 35 fichiers, une migration additive `20261115130412_cloture_audit_contrats_marketing.sql`. Périmètre : uniquement les changements depuis le premier rapport et les points B1, B2, R1, A1 à A3, N1 à N3 et N10. Rien fusionné, rien publié ; production lue en SELECT seulement.

## Verdict

**Publication technique : GO.**

Tous les défauts ciblés sont corrigés. Les corrections ont été vérifiées dans le code et rejouées en base, et aucune régression n'a été trouvée. La CI complète et le banc Stripe TEST sont verts sur le SHA exact. Le code aujourd'hui en ligne fonctionne sur le schéma migré.

Sur N10, la PR **n'augmente pas** le risque existant, elle le réduit pour les migrations. Le risque résiduel est antérieur à la PR et ne dépend pas d'elle : le mot de passe Supabase reste un secret partagé au niveau du dépôt. Il ne bloque pas cette publication.

Ce verdict ne change pas les deux autres :
- **ouverture des ventes : NO GO**, pour des obligations externes inchangées (médiateur, archivage des conditions, décision du dirigeant) ;
- **exploitation autonome :** nettement améliorée, voir le § 5.

## 1. Preuves

- **CI « Lint, types, tests, build »** [43719537672](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/43719537672) sur 962f2c76, succès (journal brut relu) :
  - Vitest : **891 fichiers réussis, 1 sauté ; 12 534 tests réussis, 18 sautés** ;
  - parcours navigateur : **274 réussis, 1 instable, 3 sautés** ;
  - WebKit : **73 réussis** ;
  - PostgREST réel, boîte fictive et invitation isolée : réussis.
  - Le parcours instable, `mois-offerts.spec.ts`, porte sur `/admin/comptes`, page que le candidat ne modifie pas. Le texte du cadeau y apparaît deux fois au rechargement (violation stricte du sélecteur), puis le parcours réussit à la reprise.
  - Les CI des deux commits intermédiaires étaient rouges ; la tête est verte.
- **Banc Stripe TEST** [43719558066](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/43719558066) : **16/16**.
- **Banc fictif local** :
  - les 499 migrations s'appliquent sur une base vide ;
  - 14 fichiers de tests modifiés ou concernés rejoués : **193/193** ;
  - **fenêtre de bascule** : les tests base de `main` (code en ligne) passent sur le schéma migré du nouveau candidat (**147 + 23**).
- **Production** (lecture seule, à l'instant de la vérification) : dernière migration `20261114090412` ; 0 abonnement Stripe ; 0 courrier contractuel ; 0 tentative Facebook ouverte ; 0 article programmé ; ventes fermées ; validation obligatoire active ; 5 organisations.

## 2. Corrections vérifiées

| Réf. | Correction | Preuve |
|---|---|---|
| **B1** accusé de résiliation | Le recalcul de l'échéancier passe **après** `confirmer_geste_resiliation` (`abonnement.ts:669-693`), et le geste doit être consigné avant tout appel Stripe. Le webhook reprend l'accusé d'une résiliation notifiée par la page grâce à `resiliation_page_a_reprendre` : 23 h au plus, adresse vérifiée du responsable qui a résilié. | Rejoué en base, en transactions séparées : `annulation_demandee = t` après libération de l'échéancier (`f` sur cbf31679). La reprise rend la ligne attendue quand l'adresse de facturation est celle de connexion, et rien si l'accusé est déjà parti, après une levée, ou si l'adresse ne peut pas être vérifiée. **Corrigé.** |
| **B2** confirmation, adresse distincte | `abonnement_courrier_contexte(org, true)` prend pour destinataire l'adresse de connexion **vérifiée** du compte qui a accepté les conditions à la commande. Ce compte doit être responsable actif, ni supprimé ni banni. La fiche client propose en plus un geste super-administrateur journalisé, « Vérifier et reprendre ». | Rejoué : avec une facturation distincte, la confirmation vise le signataire et l'accusé reste à l'adresse de facturation. Si le signataire est inactif, le destinataire est nul, donc aucun envoi. Droits : `service_role` seul. **Corrigé.** |
| **R1** suivi de l'atelier | Le suivi accepte la branche stable `gerimmo/proposition-<id>` comme les branches historiques suffixées. Le numéro d'exécution est inscrit dans le commit (`Atelier-GitHub: <n>`), puis vérifié : l'exécution doit être celle d'`atelier-code.yml` sur `main`, et son SHA doit être le parent du commit. | Nouveau test d'enchaînement ; les six tests Node de l'atelier réussissent. Les propositions restent limitées à `app/src/components/**`. **Corrigé.** |
| **A1** tentative Facebook incertaine | Nouvelle fonction `resoudre_tentative_facebook`, exposée par « Vérifier et consigner le résultat » dans la fiche article. Elle accepte soit la preuve trouvée sur la Page, soit l'absence constatée par le super-administrateur (constat de 12 à 300 caractères, tentative vieille d'au moins 10 minutes). Chaque résolution est journalisée. | Rejoué : refusée pour un non-super-administrateur et pour une session AAL1 ; refusée pour un constat trop court ou un identifiant invalide ; résolution AAL2 acceptée, réservation libérée, article retiré de la file automatique, 1 ligne au journal. **Corrigé.** |
| **A2** échec manuel | Le chemin manuel réserve juste avant l'envoi. Il libère la réservation sur un refus Meta certain, et la diffusion doit être journalisée avant l'envoi. | Code (`publications.ts:149-182`) et tests du refus et de la réponse perdue. **Corrigé.** |
| **A3** parution sans validation | Une parution manuelle n'arme Facebook que si l'article est validé ou si la validation n'est pas obligatoire. Un refus de réservation devient une **attente** (réponse 200), plus une erreur 503. | Rejoué : article non validé → `facebook_a_diffuser = f` ; article validé → `t`. **Corrigé.** |
| **N1** preuve de commande | `lier_preuve_commande` ne lève plus d'erreur : une absence ou un conflit de preuve est consigné dans `tech_log` et le webhook continue. Les identifiants des métadonnées Stripe sont filtrés (UUID). | Rejoué : appel sans preuve → aucune exception, 1 trace `preuve_commande_a_verifier`. **Corrigé.** |
| **N2** preuve plus stricte | L'intention de commande est réservée **avant** Checkout. Son identifiant est inscrit au journal (`commande`), puis exigé par la jointure. | Code et test `abonnement-souscription-et-hausse-stripe`. **Corrigé.** |
| **N3** messages | Un refus métier renvoie son propre message (`RefusContexteCourriel`). Un envoi incertain ou une finalisation en attente s'affiche comme « en cours de vérification », et non plus comme un échec. | Code (`email.ts`, `reprise-courriels.ts`, `courriers-contrat-envoi.ts`, `abonnement-2026.tsx`). **Corrigé.** |

Également corrigés au passage (hors demande) :
- **N4** : plancher de deux mois pour un propriétaire ouvert depuis la console. Rejoué : 14 jours demandés → 61 jours ; 120 → 120 ; agence 14 → 14. Seule cette ligne diffère de la définition précédente ; les droits sont conservés.
- **N7** : `seo_description`, `sources` et `veille_source_id` retirent maintenant la validation (rejoué). Un INSERT est forcé non armé et non validé (rejoué). Un armement manuel par UPDATE est neutralisé (rejoué). L'affiche marketing doit être l'URL de stockage Gerimmo de l'empreinte validée.
- **N8** : plafond et pause traités comme une attente ; erreur avant réservation distinguée.
- **N11** : `lock_timeout = 5s` dans le lot de migrations.

## 3. N10 — accès privilégiés Supabase

**Ce que la PR change** (`.github/workflows/migrations.yml`) : le job ne s'exécute que si `github.ref == 'refs/heads/main'`, et il passe par l'environnement `gerimmo-production`.

L'API GitHub des environnements m'est fermée par le proxy de ce poste. La configuration de `gerimmo-production` est toutefois contrôlée par le dépôt lui-même à chaque publication (`approbationGerimmoConforme`, `scripts/deploiement/controle.mjs:133-141`, appelée par `publier.mjs`) :
- relecteur unique « GERIMMO » ;
- aucun contournement par les administrateurs ;
- déploiement limité aux branches protégées.

La dernière publication contrôlée, réussie le 14/11 ([43588638159](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/43588638159)), a passé ce contrôle. Codex indique qu'il l'a de nouveau constaté le 15/11.

**Effet :** une migration ne peut plus être appliquée depuis la branche d'une PR, ni sans approbation humaine.

**Ce que la PR ne change pas** (risque antérieur, inchangé) :
- `SUPABASE_DB_PASSWORD` reste un **secret de dépôt**, lu aussi par `sauvegarde.yml` et `recette-production-autonome.yml`, sans environnement. `recette-production-autonome.yml` lit en plus `SUPABASE_SERVICE_ROLE_KEY`.
- Toute personne ayant le droit d'écrire sur le dépôt peut donc encore faire lire ces secrets par un workflow : par exemple en lançant l'un de ces deux workflows depuis une autre branche, ou en poussant une branche qui contient un workflow déclenché par `push`.

**La PR n'étend pas ce risque :**
- aucun workflow nouveau ;
- aucun nouveau secret ;
- aucun nouveau lecteur des secrets Supabase ;
- l'atelier, seul écrivain automatisé, reste confiné à `app/src/components/**` et ne peut pas créer de workflow ;
- les nouvelles fonctions SQL ont `search_path` fixé, sont réservées à `service_role`, ou vérifient elles-mêmes le super-administrateur AAL2.

**Conclusion N10 : publiable sans augmenter le risque existant**, avec les protections GitHub actuelles. La réserve ne pourra être levée qu'une fois ces actions faites, à mener avec la réponse du support Supabase et hors de cette PR :
1. placer le mot de passe et la clé de service dans des secrets de l'environnement protégé (ou d'un environnement dédié aux données) ;
2. ajouter `if: github.ref == 'refs/heads/main'` et cet environnement aux jobs de sauvegarde et de recette, en vérifiant que la sauvegarde planifiée continue de passer ;
3. faire tourner le mot de passe ;
4. relire la liste des personnes ayant un accès en écriture au dépôt.

## 4. Risques résiduels (non bloquants)

1. **A1, cas ambigu.** Si le post existe sur la Page mais que la recherche automatique ne le désigne pas de façon unique, le super-administrateur ne peut pas saisir l'identifiant lui-même. L'article reste « à vérifier », avec une erreur à chaque passage, et il ne faut surtout pas déclarer une absence. Cas rare.
2. **B1, cas étroit.** La reprise par webhook ne vise que l'adresse vérifiée du responsable. Si l'envoi de la page échoue pour une raison de transport alors que l'adresse de facturation est distincte et qu'aucune adresse n'a été saisie, aucune reprise automatique n'a lieu ; l'écran affiche alors « en vérification » ou un échec explicite.
3. **Conditions du 15/11** (N5 et N6, inchangés). Avant la bascule : aligner la version et l'empreinte sur la date réelle de mise en ligne, archiver la page publiée et examiner le préavis prévu à l'article 16.
4. **Parcours instable `mois-offerts.spec.ts`.** Il concerne une page non modifiée par le candidat ; il est à stabiliser à part.

## 5. Ordre de bascule (inchangé) et effet sur l'autonomie

**Ordre de bascule :**
1. Fusion, puis CI verte sur `main`.
2. Sauvegarde de moins de 90 minutes.
3. « Migrations Supabase » depuis `main`, avec l'approbation de GERIMMO : cinq fichiers.
4. Publication contrôlée du code.
5. Santé publique, archivage des conditions, restauration vérifiée.

Ventes et validation obligatoire inchangées.

**Autonomie.** R1, A1 à A3, B1, B2 et N1 à N3 étant corrigés, la note indépendante passe d'environ **56 à environ 66/100** :

| Domaine | Avant | Après |
|---|---|---|
| Courriers | 3 | 6 |
| Reprise | 5 | 7 |
| Marketing | 4 | 6 |
| Correction assistée | 2 | 5 |

Les autres domaines sont inchangés.

Ce qui reste humain relève de la décision, plus de manipulations SQL :
- valider les affiches ;
- donner son accord sur les propositions ;
- constater l'absence d'un post incertain ;
- ouvrir les ventes ;
- décider du sort des cinq essais qui se terminent entre le 24 et le 29/12/2026.
