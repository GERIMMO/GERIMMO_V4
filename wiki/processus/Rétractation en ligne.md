---
type: process
tags: [abonnement, retractation, consommateur, stripe, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Cycle de vie de l'abonnement]]", "[[Conditions générales]]", "log.md — entrées « decision » des 23 et 24/10/2026, « deploy » du 24/10/2026 (PR #246)", "app/src/lib/delai-retractation.ts", "app/src/lib/courriers-contrat.ts", "app/src/app/actions/retractation.ts", "app/supabase/migrations/20261024110000_vente_et_impaye.sql"]
---

# Rétractation en ligne

**En une phrase :** depuis le 24/10/2026, le titulaire d'un abonnement renonce à son
contrat **en ligne**, sans motif, pendant quatorze jours, avec le bouton « Renoncer au
contrat ici » de « Mon abonnement » ; il est **remboursé intégralement** et reçoit un accusé
de réception qui reprend sa déclaration.

> [!info] En production depuis le 24/10/2026
> PR #246 (`f79674c`), migration `20261024110000_vente_et_impaye.sql` (table
> `retractations_abonnement`, colonne `abonnements.souscrit_le`). Le texte contractuel en
> vigueur (conditions du 30/09/2026) a déjà un article 8.10 « Rétractation » avec son
> formulaire : c'est lui que les courriels citent. La réécriture de l'article 8.10 dans la
> V1 (« Commandé le », extension à toutes les formules) est **prévue avec la publication des
> conditions V1 le 24/10**.

## Déclencheur
Le titulaire de l'espace (propriétaire, ou administrateur d'agence) clique « Renoncer au
contrat ici » dans « Mon abonnement », ou envoie une déclaration par courriel que le
super-administrateur saisit pour lui.

## Qui y a droit
- **Toutes les formules** (Solo, Bailleur, Investisseur, Patrimoine), **sans chercher si le
  client est un consommateur** (choix 2 du plan du 23/10 : la solution la plus protectrice).
- Le **passage d'un abonnement mensuel à l'annuel** ouvre un **nouveau délai** de quatorze
  jours à compter de la demande de passage.
- Le bloc reste **visible même en lecture seule** (compte gelé).

## Le délai
- Point de départ : la **conclusion** — date de souscription confirmée par Stripe
  (`subscription.start_date`, enregistrée par le webhook dans `souscrit_le`) ; pour une
  souscription antérieure au 24/10 non encore datée, la date est relue chez Stripe.
- Le jour de la conclusion n'est **pas compté** ; on ajoute **14 jours** ; une échéance un
  samedi, un dimanche ou un **jour férié** (les onze jours fériés nationaux, Pâques
  calculé) passe au premier jour suivant qui n'est ni l'un ni l'autre.
- La déclaration est reçue jusqu'à **23 h 59 min 59 s, heure de Paris**, ce dernier jour
  (toute la dernière seconde compte : comparaison à minuit du lendemain).
- La période d'essai gratuite ne réduit pas le délai.

## Étapes
1. **Bloc « Droit de rétractation — jusqu'au {date limite} inclus »** dans « Mon
   abonnement », avec le bouton « Renoncer au contrat ici ».
2. **Page de déclaration** (`/espace/<id>/abonnement/retractation`) : contrat visé
   (formule, date de souscription, espace), date limite, nom et adresse de l'accusé
   **préremplis et modifiables**. La déclaration est montrée telle que l'accusé la
   reprendra : « Je renonce à mon abonnement Gerimmo, formule {formule}, souscrit le {date}
   pour l'espace {organisation}. Nom : {nom}. » (ou, pour le passage à l'annuel, « Je renonce
   au passage de mon abonnement Gerimmo à la formule annuelle, demandé le {date}… »).
3. **« Confirmer la rétractation »** (action `retracterAbonnement`) : délai revérifié côté
   serveur ; déclaration enregistrée (`retractation_enregistrer`) ; puis, sous le verrou des
   gestes de facturation :
   - **abonnement** : souscription arrêtée chez Stripe et **chaque paiement remboursé** ;
   - **passage à l'annuel** : retour au prix mensuel et remboursement intégral de
     l'échéance annuelle ; si l'annuel était déjà en place, un nouveau cycle mensuel
     commence ce jour et la **première mensualité est prélevée aussitôt** (dit à l'écran et
     dans l'accusé) ;
   - journal d'audit `abonnement_retractation` (preuve gardée dix ans).
4. **Accusé de réception** par courriel (sujet « Accusé de réception de votre
   rétractation ») : « Nous avons bien reçu, le {date} à {heure} (heure de Paris), votre
   déclaration : « … » », puis l'une des variantes : fin de l'abonnement ; remboursement de
   {montant} au plus tard quatorze jours après, sur la carte utilisée, sans frais (ou
   « Aucun prélèvement n'a eu lieu ») ; essai qui continue jusqu'à son terme, **ou** compte
   en lecture seule, données consultables et exportables, rien de supprimé.
5. **Si l'exécution chez Stripe échoue** : un accusé de **réception** part tout de suite
   (« Son exécution auprès de notre prestataire de paiement est en cours… Un second courriel
   vous confirmera l'exécution »), la page invite à réessayer, et la **reprise de nuit**
   (`retractations_a_terminer`) termine l'exécution ; une rétractation restée en chemin
   alerte le dirigeant (relais).
6. **Confirmer de nouveau** n'exécute rien deux fois : l'exécution s'écrit une seule fois
   (une garde refuse toute réécriture), le remboursement est idempotent et une **copie** de
   l'accusé est renvoyée.

## Saisie par la supervision
Une rétractation reçue par courriel est saisie par le **super-administrateur permanent
(second facteur)** sur la même page, avec la date et l'heure de réception (heure de Paris ;
une heure inexistante ou ambiguë au changement d'heure est refusée). « Aide et retours »
ne sert plus à se rétracter.

## Résultat / sorties
- Une ligne `retractations_abonnement` (nature, texte de la déclaration, instant, adresse
  de l'accusé, montant et références des remboursements, envoi de l'accusé), **en ajout
  seul**, gardée **dix ans** (`contrat:retractation`), **même après la fermeture du compte**
  (la ligne est alors détachée de l'espace effacé) ; une fermeture attend qu'une
  rétractation en cours soit remboursée et son accusé parti.
- Abonnement arrêté (ou ramené au mensuel), compte en lecture seule si l'essai est fini.

## Relations
[[Cycle de vie de l'abonnement]] · [[Souscription de l'abonnement]] ·
[[Résiliation de l'abonnement]] · [[Fermeture de compte]] · [[Abonnement]] ·
[[Conditions générales]] · [[Durées de conservation]]

> [!warning] Points à trancher / contradictions
> - **Règle du délai** (jour non compté, prorogation au jour ouvrable, 23 h 59, jours fériés
>   nationaux sans Alsace-Moselle ni outre-mer), **accusé « sans délai »** et contenu de
>   l'accusé : à confirmer sur Légifrance (source non ouverte le 23/10/2026) — C. conso
>   L. 221-18 à L. 221-21, L. 221-24, L. 221-25 et D. 221-5 (réforme du 19/06/2026 connue
>   par des sources secondaires seulement).
> - **Formulaire de rétractation** : celui de la version du 30/09 (« Souscrit le : ») est
>   reproduit dans les courriels ; la V1 écrit « Commandé le : » ; modèle de R. 221-1
>   peut-être modifié par le décret 2026-3 — à confirmer sur Légifrance (source non ouverte
>   le 23/10/2026).
> - **Passage à l'annuel** (nouveau délai, L. 221-18) : application à vérifier — à confirmer
>   sur Légifrance (source non ouverte le 23/10/2026).
> - **Non testé contre Stripe réel** : prélèvement immédiat de la mensualité au retour au
>   mensuel ; ordre des événements « incomplete » puis « active » (recette en mode test à
>   faire).
