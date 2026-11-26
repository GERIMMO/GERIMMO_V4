---
type: concept
tags: [abonnement, saas, stripe, facturation]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Grille tarifaire]]", "[[2026-09-28-decision-tarification]]", "[[Dépôt Gerimmo-V3]]", "[[Cycle de vie de l'abonnement]]", "[[Vision de l'écosystème Gerimmo]]", "[[Passation — état du 26 novembre 2026]]", "log.md — entrées « decision » des 23 et 24/10/2026, « deploy » du 24/10/2026 (PR #246, PR #247)", "app/src/lib/tarifs.ts (montantAbonnementUnique, TRANCHES_AGENCE, MOIS_ESSAI), lu le 26/11/2026", "app/src/lib/conditions-versions.json (versions des 11/11 et 15/11/2026)", "app/supabase/migrations/20261111151500_abonnement_unique_fondateurs.sql", "app/supabase/migrations/20260911300000_encaissement_stripe.sql", "app/src/lib/parrainage.ts (commentaire de tête)"]
---

# Abonnement

> [!info] Modèle en vigueur (code du 11/11/2026, essai du 15/11/2026) — détail dans [[Grille tarifaire]]
> - **Particuliers et SCI** : **abonnement unique « Gerimmo »**, dont le prix dépend du nombre de biens actifs
>   (`montantAbonnementUnique`, `app/src/lib/tarifs.ts` ; même calcul en base, `montant_proprietaire_unique`,
>   migration `20261111151500`). Mensuel, ou annuel à dix mensualités. Une seule ligne de facture.
> - **Agences** : 49 € HT jusqu'à 10 lots, puis 4,90 € par lot (`TRANCHES_AGENCE`). Grille **non publiée** : les
>   agences sont sur [[Liste d'attente des agences|liste d'attente]].
> - **Essai** : **2 mois calendaires**, sans carte, sans échéance de lancement et sans souscription automatique
>   (`MOIS_ESSAI = 2` ; conditions du 15/11/2026, article 8.2).
> - Les prix, les tranches et les règles d'application (hausse, baisse, périodicité, révision) ne sont tenus qu'à un
>   endroit du wiki : [[Grille tarifaire]]. Cette page ne les recopie pas.
> - **Ventes fermées au 26/11** : souscriptions payantes fermées, ouverture fixée au 30/11 par le dirigeant ; les gestes
>   R6 à R8 lui reviennent ([[Passation — état du 26 novembre 2026]], section a ; `DECISIONS-2026-11-24.md`, réponses du
>   26/11).


**Définition :** la souscription d'une [[Organisation]] à GERIMMO (facturation **SaaS**, via
Stripe). À **ne pas confondre** avec les [[Période de loyer|loyers]] des locataires
(facturation locative).

## Objets liés
- **Code V4** (vérifié le 26/11/2026) : la souscription d'une organisation est tenue dans la table `abonnements`,
  « miroir local de la souscription Stripe » (migration `20260911300000_encaissement_stripe.sql`) ; les formules et
  tranches de la base sont dans `tarif_formules` et `tarif_tranches` ; les mois offerts dans `mois_offerts` ; l'avantage
  « fondateur » dans `avantages_fondateurs` (migration `20261111151500`).
- ~~`subscription_plans` (offres), `organization_subscriptions` (souscription d'une org),
  `subscription_history`, `billing_invoices`, `billing_payments`, `billing_refunds`,
  `promotion_codes` / `promotion_redemptions`, `stripe_webhook_events`~~ — schéma du [[Dépôt Gerimmo-V3]]. Aucune de
  ces tables `subscription_plans` ou `organization_subscriptions` n'existe dans `app/supabase/migrations` ni dans
  `app/src` (recherche du 26/11/2026).

## Attributs métier notables
- ~~`status` : `trial` / `active` / `suspended` / `expired` / `cancelled` ; `billing_interval` : `monthly` / `annual` ;
  essai `trial_days` (14 j)~~ — attributs du [[Dépôt Gerimmo-V3]], non revérifiés dans le code V4.
- ~~3 tarifs par offre : mensuel, frais de mise en place (one-time), gestion annuelle
  (récurrent)~~ — modèle hérité du code (`subscription_plans`), **supplanté le 28/09/2026** :
  une seule redevance, mensuelle ou annuelle (particuliers), sans frais de mise en place
  ([[2026-09-28-decision-tarification]]).
- **Essai** : **2 mois calendaires** pour toute nouvelle inscription, sans carte, **sans échéance de lancement** et
  sans souscription automatique (conditions du 15/11/2026, article 8.2 ; `MOIS_ESSAI = 2` dans `tarifs.ts`, la durée
  affichée ne dépend plus de la date). Ensuite **gel en lecture seule** (consultable, exportable) jusqu'au paiement ;
  **aucun bien offert**, aucune formule gratuite en permanence.
  - ~~Offre de lancement du 30/09/2026 : 2 mois jusqu'au 31/12/2026 inclus, puis 1 mois à compter du 01/01/2027
    (14 jours jusqu'au 29/09/2026)~~ — **supplantée le 15/11/2026** ; elle ne subsiste que dans des commentaires du
    code (`app/src/lib/editeur.ts`, historique des versions des conditions).
  - **Avantage « fondateur »** (migration `20261111151500`) : le super admin, en double vérification, peut porter à
    **6 mois** l'accès d'un propriétaire **en essai, avant toute souscription** ; **10 places au plus** ; le geste est
    inscrit au journal d'audit. Voir [[Super Admin]].

## Rôle dans le métier
- Modèle économique de GERIMMO : la grille en vigueur est l'**abonnement unique du 11/11/2026** pour les particuliers et
  les SCI, et la grille agences du code (non publiée). Les prix et leurs exemples sont dans [[Grille tarifaire]], seule
  page qui les tient à jour ; la source unique côté code est `app/src/lib/tarifs.ts`.
  - **TVA** : franchise en base, aucune TVA facturée ; mention « TVA non applicable, article 293 B du CGI » (`tarifs.ts`,
    fonction `montants`), gardée « pour l'instant » par le dirigeant le 24/11 (`DECISIONS-2026-11-24.md`).
  - **Contrats conclus avant le 11/11** : ils gardent leur formule (« Les conditions des contrats précédents sont
    conservées », version des conditions du 11/11/2026) ; Solo, Bailleur, Investisseur et Patrimoine restent dans le
    code pour les relire ([[Grille tarifaire]]). Aucun contrat payant n'est connu (ventes jamais ouvertes).
  - ~~Grille du 28/09/2026 : Solo, Bailleur, Investisseur, Patrimoine (5,99 € à 29,99 € TTC par mois) ; agences 39 € HT
    jusqu'à 10 lots puis tranches cumulatives ; bascule des organisations existantes dès l'ajout d'un bien~~ —
    **supplantée le 11/11/2026** par l'abonnement unique ([[2026-09-28-decision-tarification]] pour l'historique).
  - Pas de cumul avec le [[Parrainage]], sauf depuis le 30/09 le **mois offert au
    parrain** à la conversion de son filleul : avoir de son mensuel courant (annuel
    ÷ 12) porté au solde client Stripe, ou un mois d'essai de plus ; le filleul garde l'essai ordinaire de 2 mois
    (`app/src/lib/parrainage.ts`, commentaire de tête, qui parle encore de la « grille du 28/09 »).
  - Portail client Stripe imposé par le code : changement de formule désactivé ;
    **résiliation retirée du portail le 24/10** (page « Résilier votre contrat ») ;
    préavis d'au moins un mois avant révision tarifaire (CGU art. 8.9) ; rétractation
    de 14 jours (art. 8.10), **en ligne et pour toutes les formules depuis le 24/10**.

## Conditions d'ouverture du paiement (19/10/2026)
Garde de souscription (lot B3, entrée du journal `[2026-10-19] dev | Garde de
souscription`). En plus des clés Stripe et du régime de TVA, le paiement en ligne ne
s'ouvre que si deux conditions de contrat sont remplies, vérifiées par le serveur avant
tout appel à Stripe et dites par l'écran « Mon abonnement » avec les mêmes phrases :
- **l'identité de l'éditeur est complète** — les huit faits requis des mentions légales
  (dénomination, forme, siège, RCS, SIRET, directeur de publication, e-mail, médiateur),
  lus dans `supervision_identite` par-dessus le code. Tant qu'un fait manque, ni
  souscription ni hausse de capacité ; le détail des faits manquants n'est pas dit au
  client, il est affiché au dirigeant (/admin/sante, /admin/parametres) ;
- **le compte qui clique a accepté la version en vigueur des CGV** (`acceptations_cgu`,
  version 2026-09-30, source `compte` pour la case cochée depuis « Mon abonnement »).
  Exigée pour la souscription initiale seulement : une hausse porte sur un contrat déjà
  formé.

La phrase affichée tant que l'identité manque dépend de l'état du compte (correction du
19/10) : **en essai** (statut essai et écriture ouverte) « Le paiement en ligne n'est pas
encore ouvert : les mentions légales de l'éditeur sont en cours de publication. Votre essai
continue. » ; **gelé en lecture seule** (essai arrivé à son terme, le statut reste
« essai ») ou **déjà abonné** (hausse de capacité) : la même phrase sans « Votre essai
continue. ». Voir [[Conditions generales d'utilisation (projet)|Conditions générales d'utilisation]]
et, pour l'identité de l'éditeur encore à fournir, [[État du projet et décisions ouvertes]].

## Décision du dirigeant du 22 octobre 2026 — bouton de levée

À la demande explicite « Fais que cette règle puisse être annulée avec un bouton dans superadmin », le contrôle d’identité devient réversible par le superadmin permanent, depuis **Paramètres généraux → Blocage des abonnements**. La règle reste active par défaut. Le bouton « Lever le blocage » autorise le parcours malgré les faits manquants ; « Réactiver le blocage » rétablit le contrôle. L’acceptation des conditions, les prix, le consentement au paiement et les réglages Stripe/TVA restent contrôlés.

Chaque décision est datée et attribuée dans le registre de supervision. La lecture côté serveur reste obligatoire ; un compte client ne peut ni modifier le réglage ni le fournir dans son formulaire. Lever ce contrôle ne complète pas les mentions légales. **Préparé et testé localement, non publié** ; migration `20261022210326_reglage_blocage_souscription_identite.sql` à appliquer avant publication du code par le circuit habituel.

## Décision du dirigeant du 23 octobre 2026 — le médiateur ne bloque plus

Demande du dirigeant : « Je veux que tout ce qui peut fonctionner fonctionne sans restriction, les infos importantes manquantes seront remplies plus tard mais ne doivent pas être bloquantes. Il me faut une version fonctionnelle même s'il manque certaines infos type médiateur et autres. »

- Les faits **requis** se réduisent à l'identité : dénomination, forme, siège, immatriculation (RNE ou RCS), SIRET, directeur de la publication, e-mail, téléphone. Tous sont saisis en production (relevé du 23/10).
- Les trois coordonnées du **médiateur de la consommation** deviennent des faits **à compléter** : ils ne ferment plus ni le paiement en ligne ni la hausse de capacité, et ne déclenchent plus l'encadré « Document en cours de finalisation ». Les mentions légales affichent toujours « Adhésion à venir : aucun organisme n'est désigné à ce jour » ; la console (Santé, Paramètres) les montre « à compléter, non bloquant ».
- Le bouton du 22/10 (« Lever le blocage ») reste en place pour les faits requis ; il est sans effet tant que l'identité est complète. La décision du 22/10 a été publiée par la PR #241 (`e53298a`).
- Code : `app/src/lib/editeur.ts` (`REQUIS`, `A_COMPLETER`, `faitsACompleter`), branche `claude/compassionate-euler-qpqjp6`.

## Conformité V1 du code — 24 octobre 2026 (PR #246, `f79674c` ; PR #247, `31377f5`)
Plan juriste/DPO du 23/10 (lots 1 et 2) ; textes contractuels inchangés (version du
30/09/2026), **publication des conditions V1 prévue le 24/10** ([[Conditions générales]]).
- **Souscription** : récapitulatif avec le droit de rétractation et le moyen de paiement,
  case de demande expresse, texte d'obligation de paiement sous le bouton Stripe,
  **confirmation sur support durable** (une fois, avec les conditions en PDF si leur version
  est archivée, et le formulaire de rétractation), même sans médiateur —
  [[Souscription de l'abonnement]]. Colonne `abonnements.souscrit_le`.
- **Rétractation en ligne** (« Renoncer au contrat ici ») : table `retractations_abonnement`
  en ajout seul, remboursement intégral, accusé — [[Rétractation en ligne]].
- **Résiliation** : page unique et accusé unique ; non-reconduction faute d'accord à une
  version substantielle — [[Résiliation de l'abonnement]].
- **Impayé** : mise en demeure à J+0, lecture seule à J+15 après courrier, premier
  prélèvement gelé dès l'échec, résiliation manuelle au plus tôt à J+30 —
  [[Impayé de l'abonnement]].
- **Réclamation** : nature « Faire une réclamation » dans « Aide et retours » ; la réponse
  qui la clôt renvoie au médiateur de la consommation (ou dit que l'adhésion est en cours).
- **Fermeture** : un compte payant ne se supprime pas sans archive de sa preuve ; fermeture à
  la fin de la période payée ou à J+14 avec remboursement au prorata —
  [[Fermeture de compte]].
- **Arrêt d'urgence « Abonnements »** : il arrête aussi les remboursements et les
  suppressions de clients Stripe.

## Relations
- Souscrit par [[Administrateur d'agence]] ou [[Propriétaire bailleur]] ; administré par [[Super Admin]].
- Cycle de vie automatisé — voir [[Cycle de vie de l'abonnement]], [[Onboarding et abonnement]].

> [!warning] Points à trancher / contradictions
> - **26/11/2026 — grille corrigée** : cette page donnait encore la grille du 28/09 et l'offre de lancement comme en
>   vigueur ; elle suit désormais le code (abonnement unique du 11/11, essai de 2 mois du 15/11) et renvoie à
>   [[Grille tarifaire]]. La **décision du dirigeant** qui fonde l'abonnement unique n'est dans aucune page-source du
>   wiki : seuls le code, la PR #286 et le résumé des conditions du 11/11 en témoignent ([[Grille tarifaire]]). À faire
>   confirmer.
> - **Bascule des anciens contrats** : la règle du 28/09 (« bascule sur la nouvelle grille dès l'ajout d'un bien ») et
>   celle du 11/11 (« les conditions des contrats précédents sont conservées ») ne disent pas la même chose. Sans
>   contrat payant à ce jour, l'écart n'a pas d'effet ; la règle à appliquer au premier ancien contrat reste à écrire.
> - **Parrainage** : le mécanisme du mois offert au parrain est décrit pour la grille du 28/09 ; son effet exact sur
>   l'abonnement unique (montant de l'avoir) n'est pas revérifié.
> - **Grille agences** (49 € HT, puis 4,90 € par lot) : entrée dans le code avec la PR #281 (05/11/2026, « révision du
>   29/10/2026 » en tête de `tarifs.ts`) ; jamais publiée, et la décision du dirigeant n'est dans aucune page-source du
>   wiki. À confirmer avant toute ouverture aux agences.
> - **Unité comptée** : l'« unité locative active » de l'abonnement unique (conditions du 11/11) n'a pas été revérifiée
>   face à la règle « lot » du 28/09 ([[Grille tarifaire]]).
> - ~~La facturation annuelle n'est pas lancée (prix à refixer).~~ **Tranché le
>   28/09/2026** : annuel ouvert aux particuliers, deux mois offerts
>   ([[2026-09-28-decision-tarification]]).
> - ~~Le schéma hérité (`subscription_plans` à trois tarifs, frais de mise en place)
>   subsiste dans les tables historiques~~ — ces tables viennent du [[Dépôt Gerimmo-V3]] ; elles n'existent pas dans le
>   code V4 (recherche du 26/11/2026).
> - ~~Identité de l'éditeur encore à fournir (nécessaire au formulaire de
>   rétractation)~~ → saisie en production au relevé du 23/10, sauf le médiateur
>   ([[Informations manquantes — 23 octobre 2026]]).
> - **24/10 — règles de vente au consommateur** codées sans juriste (rétractation,
>   confirmation, résiliation en ligne, impayé) : à confirmer sur Légifrance (source non
>   ouverte le 23/10/2026) ; détail des articles dans chaque page de processus.
> - **23/10 — vendre sans médiateur désigné** : l'information du consommateur sur le
>   médiateur est une obligation (art. L. 616-1 du code de la consommation, déjà citée
>   dans le code) ; ouvrir la vente avant l'adhésion est un choix du dirigeant, dont le
>   risque est **à relire par le juriste**. L'adhésion puis la saisie des trois
>   coordonnées dans `/admin/parametres` suffisent, sans déploiement.
>
## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.
