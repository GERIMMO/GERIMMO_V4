---
type: process
tags: [abonnement, impaye, relances, lecture-seule, mise-en-demeure, stripe, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Cycle de vie de l'abonnement]]", "log.md — entrées « decision » du 23/10/2026 (valeurs par défaut du plan, point 4) et « deploy » du 24/10/2026 (PR #246)", "app/src/lib/relance-paiement-email.ts", "app/src/lib/relances-paiement.ts", "app/supabase/migrations/20261024110000_vente_et_impaye.sql"]
---

# Impayé de l'abonnement

**En une phrase :** quand un prélèvement de l'abonnement échoue, le client est prévenu **le
jour même** par un courrier qui vaut mise en demeure, rappelé **sept jours après** puis **la
veille** ; la saisie passe en **lecture seule à J+15** — dès l'échec s'il s'agit du tout
premier prélèvement — et l'abonnement ne peut être résilié **qu'à la main, au plus tôt à
J+30**.

> [!info] En production depuis le 24/10/2026
> PR #246 (`f79674c`), migration `20261024110000_vente_et_impaye.sql` (plan du 23/10,
> lot 1C, constats R06, R07, R23, R26, R27). L'article 15 en vigueur (« Suspension et
> résiliation », version du 30/09/2026) prévoit déjà la résiliation par l'Éditeur trente
> jours après une mise en demeure restée sans effet : les courriers citent « l'article 15 ».
> Le nouvel article 15 de la V1 (15.1 à 15.5) est **prévu avec la publication des conditions
> V1 le 24/10**.

## Déclencheur
Stripe annonce l'échec d'un prélèvement (webhook) ; la tâche de nuit envoie les paliers
suivants et rattrape un courrier que le webhook n'aurait pas fait partir. C'est la base
(`abonnements_a_relancer`) qui décide qui relancer et à quel palier.

## Étapes (client qui a déjà réglé au moins une échéance)

| Jour | Courrier (sujet) | Effet |
|---|---|---|
| J+0 | « Votre prélèvement Gerimmo n'est pas passé » — montant de la période, compte ouvert jusqu'à J+15, puis : « Sans règlement au {J+30}, l'abonnement pourra être résilié en application de l'article 15 des conditions générales ; vos données resteront consultables et exportables. » | **Vaut mise en demeure** ; journal d'audit `relance_paiement_envoyee` (palier, date, identifiant du message, **sans l'adresse**), gardé dix ans |
| ≈ J+7 | « Prélèvement Gerimmo : il vous reste {n} jours » | Rappel |
| J+14 (veille) | « Prélèvement Gerimmo : votre saisie s'arrête demain » — « Les envois automatiques à vos locataires s'arrêteront aussi. » | Rappel |
| J+15 | « Votre compte Gerimmo est en lecture seule » — « Tout rouvre dès que le paiement est enregistré, tant que l'abonnement n'est pas résilié… Rien n'est supprimé du fait de l'impayé. » | **Lecture seule**, seulement si au moins un courrier est parti (`relances_paiement >= 1`, R27) |

Chaque courrier rappelle : « vos données restent entières … tout reste consultable et
exportable, même en lecture seule. En lecture seule, les nouvelles saisies et les envois
automatiques à vos locataires (appels de loyer, quittances, relances) sont interrompus
jusqu'au règlement ; ceux de la période d'interruption ne sont pas tous rattrapés. »
Locataires et artisans gardent l'accès à leur espace. Aucune pénalité ni aucun frais de
relance.

## Premier prélèvement après l'essai
S'il n'a encore réglé aucune échéance, le compte passe en lecture seule **dès l'échec**,
comme à la fin d'un essai sans souscription, avec un courrier propre (dans les deux jours
de l'échec, sans fin programmée ni résiliation demandée) : « Votre premier prélèvement
Gerimmo n'est pas passé » — « Votre essai étant terminé, la saisie de nouvelles données et
les envois automatiques à vos locataires sont suspendus depuis le {date}. … Dès que le
paiement aboutit, la saisie et les envois reprennent pour l'avenir. » suivi de la phrase de
mise en demeure.

## Statut « impayé » de Stripe
Le statut `unpaid` ne gèle plus le compte avant J+15 : `abonnement_appliquer` garde le
statut courant (R07). Réglage attendu côté Stripe : **« marquer l'abonnement comme
impayé »**, sans annulation automatique avant J+30 (geste du dirigeant dans le tableau de
bord Stripe ; **non constaté** dans le journal au 24/10).

## Résiliation pour impayé
- **Manuelle**, au plus tôt **trente jours** après la mise en demeure, après avoir vérifié au
  journal que le courrier de J+0 est parti (procédure rappelée dans Finances de la console).
- Sur `customer.subscription.deleted`, seulement si un défaut de paiement est en cours, sans
  résiliation demandée par le client, sans rétractation et sans marque de fermeture : courrier
  « Votre abonnement Gerimmo est résilié faute de règlement ». Il cite l'article 15 **si la
  résiliation tombe à J+30 ou après** ; plus tôt, il dit les faits sans invoquer l'article et
  le dirigeant reçoit une alerte (relais). La **facture restée impayée est annulée**
  (décision 5 du 23/10, remboursements protecteurs). Données consultables et exportables en
  lecture seule ; « Pour reprendre la saisie, souscrivez de nouveau depuis « Mon
  abonnement » » (l'écran le dit aussi).
- Journal d'audit : `abonnement_resiliation_impaye_notifiee` (dix ans).

## Pendant une fermeture programmée
Les relances d'un client qui a déjà payé continuent (la période en cours reste due) ; seuls
le courrier du premier prélèvement et l'avis de reconduction s'arrêtent. Voir
[[Fermeture de compte]].

## Relations
[[Cycle de vie de l'abonnement]] · [[Résiliation de l'abonnement]] ·
[[Souscription de l'abonnement]] · [[Abonnement]] · [[Fermeture de compte]] ·
[[Durées de conservation]]

> [!warning] Points à trancher / contradictions
> - **Lecture seule à J+15, mise en demeure à J+0, résiliation à J+30** : construction
>   contractuelle du plan — à confirmer sur Légifrance (source non ouverte le 23/10/2026) :
>   C. conso L. 211-1, L. 212-1, L. 212-2, R. 212-2 4° ; C. civ. 1219, 1225.
> - **Réglage Stripe « marquer impayé »** : geste non constaté ; le retour d'un abonnement
>   `unpaid` à `active` après paiement depuis le portail n'est pas encore testé en mode test
>   (sinon : passer Stripe sur « laisser en retard »).
> - **Écart de vocabulaire** : les courriers citent « l'article 15 » de la version du
>   30/09 ; la V1 numérotera « 15.4 ». À aligner quand la V1 sera en ligne.
