---
type: process
tags: [abonnement, resiliation, reconduction, stripe, consommateur, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Cycle de vie de l'abonnement]]", "[[Conditions générales]]", "log.md — entrées « decision » du 23/10/2026 et « deploy » du 24/10/2026 (PR #246)", "app/src/app/agence/[orgId]/abonnement/resiliation/page.tsx", "app/src/lib/courriers-contrat.ts", "app/src/lib/avis-abonnement.ts", "app/src/lib/non-reconduction-conditions.ts", "app/src/lib/stripe.ts"]
---

# Résiliation de l'abonnement

**En une phrase :** depuis le 24/10/2026, le titulaire résilie **uniquement** par la page
« Résilier votre contrat » de « Mon abonnement » : un récapitulatif dit la date de fin, le
bouton « Notifier la résiliation » enregistre la résiliation pour la prochaine échéance, et
**un seul accusé de réception** part par courriel.

> [!info] En production depuis le 24/10/2026
> PR #246 (`f79674c`). La résiliation est **retirée du portail client Stripe** (nouvelle
> configuration `portail-2026-10-24`, `subscription_cancel` désactivé, anciennes
> configurations Gerimmo désactivées) : il ne reste qu'un chemin, conforme (choix 8 du plan
> du 23/10). La configuration par défaut du compte Stripe ne se désactive pas : contrôle
> manuel.

## Déclencheur
Le titulaire de l'espace clique le lien « Résilier votre contrat » dans « Mon abonnement ».

## Étapes
1. **Page récapitulative** (`/espace/<id>/abonnement/resiliation`) : nom et adresse de
   l'accusé **préremplis et modifiables** ; contrat (formule, date de souscription,
   espace) ; « Date de fin du contrat : {fin de période} (prochaine échéance) » ; puis :
   « Votre abonnement prendra fin le {date}. Jusque-là, votre accès payé reste entier.
   Ensuite, votre compte passe en lecture seule : vos données restent consultables et
   exportables ; rien n'est supprimé du seul fait de la résiliation. La période en cours
   n'est pas remboursée. »
2. **« Notifier la résiliation »** (`resilierAbonnement`) : résiliation à l'échéance chez
   Stripe (`cancel_at_period_end`), journal d'audit `abonnement_resiliation_notifiee`.
3. **Accusé de réception** (sujet « Votre résiliation Gerimmo est enregistrée ») : « Nous
   avons bien reçu, le {date} à {heure} (heure de Paris), la résiliation de votre abonnement
   Gerimmo ({formule}, espace {organisation}). Votre contrat prend fin le {date}. D'ici là,
   votre accès payé reste entier et aucun nouveau prélèvement n'aura lieu. Ensuite, votre
   compte passe en lecture seule ; rien n'est supprimé du seul fait de la résiliation. Vous
   pouvez annuler cette résiliation depuis « Mon abonnement » jusqu'au {date}. »
   - **Un seul accusé**, que la résiliation vienne de la page ou du webhook : clé
     `resiliation-{souscription}-{fin de période, jour de Paris}` ; une nouvelle
     notification après une levée reçoit sa propre clé (suffixe de rang `-2`…) ; l'écran
     dit « déjà envoyé » ou « échec » au lieu d'affirmer un envoi.
   - **Jamais d'accusé** pour une fin posée par une **fermeture de compte** (marque
     `gerimmo_fermeture`) ou par une **non-reconduction faute d'accord** (marque
     `gerimmo_non_reconduction`).
4. **Annuler la résiliation** : possible depuis « Mon abonnement » jusqu'à la fin de
   période ; la levée efface la marque d'accusé (`abonnement_resiliation_levee`). Dès la
   date d'effet d'une version des conditions qui exige l'accord exprès, la reprise demande
   d'abord cet accord, dans le même geste. Tant qu'une fermeture est programmée, ni
   « Résilier » ni « Annuler la résiliation » ne sont proposés.

## Reconduction de l'annuel : l'avis préalable
- Pour un abonnement **annuel**, un courriel automatique part **entre trois mois et un
  mois avant la date limite de non-reconduction**, qui est la **veille de l'échéance** (jour
  de Paris ; fenêtre comptée en mois civils, et non plus « entre 90 et 30 jours »).
- Il contient un **encadré apparent** : « Date limite de non-reconduction : {veille de
  l'échéance} — Pour ne pas reconduire votre abonnement, résiliez-le depuis « Mon
  abonnement » au plus tard à cette date. » Le montant annoncé est celui de la **période
  suivante**.
- Plus d'avis pendant une fermeture programmée.

## Non-reconduction faute d'accord à une nouvelle version
Quand une version **substantielle** des conditions exige l'accord exprès (règle prévue par
la V1) et que sa date d'effet est atteinte, la tâche quotidienne des abonnements pose
`cancel_at_period_end` sur chaque abonnement dont aucun responsable n'a accepté cette
version : la période payée court jusqu'à son terme, rien n'est bloqué. **Garde du préavis** :
rien ne part avant l'archivage de la version, ni avant un mois plein après cet archivage.
Les versions publiées avant cette règle (2026-09-30) n'y donnent jamais lieu. Journal
d'audit : `abonnement_non_reconduit_conditions`. Voir [[Conditions générales]].

## Résiliation pour impayé
Elle relève de [[Impayé de l'abonnement]] : jamais automatique avant J+30, courrier propre,
facture restée impayée annulée.

## Résultat / sorties
- Souscription arrêtée à l'échéance, compte en **lecture seule** ensuite (données
  consultables et exportables) ; la suppression éventuelle relève de la règle des 24 mois
  ([[Fermeture de compte]]), jamais de la résiliation seule.
- Preuves (notification, accusé, levée) gardées dix ans (`journal:audit_preuve_contrat`).

## Relations
[[Cycle de vie de l'abonnement]] · [[Souscription de l'abonnement]] ·
[[Rétractation en ligne]] · [[Impayé de l'abonnement]] · [[Fermeture de compte]] ·
[[Abonnement]] · [[Conditions générales]]

> [!warning] Points à trancher / contradictions
> - **Fonctionnalité de résiliation en ligne** (accès, rubriques, accusé sur support durable)
>   et **avis de reconduction** (fenêtre, encadré) : à confirmer sur Légifrance (source non
>   ouverte le 23/10/2026) — C. conso L. 215-1, L. 215-1-1, D. 215-1 à D. 215-3, L. 241-3.
> - **Fenêtre de l'avis** comptée depuis la veille de l'échéance (relecture du 24/10, M8), au
>   lieu de l'échéance elle-même (texte du plan) : choix plus protecteur, à confirmer sur
>   Légifrance (source non ouverte le 23/10/2026).
> - **Avis non parti** : la résiliation immédiate avec remboursement au prorata (R22) n'est
>   pas encore outillée (lot 5, avant fin 2027).
> - **Annulation par l'équipe dans Stripe** : le webhook ne distingue pas une annulation de
>   l'équipe de celle du client ; procédure « Annuler immédiatement », jamais « à la fin de la
>   période », rappelée dans Finances de la console.
> - **Accord exprès et non-reconduction** (R212-1 3°, R212-4, R212-5) : appliqués à tout
>   client, sans chercher s'il est consommateur — à confirmer sur Légifrance (source non
>   ouverte le 23/10/2026).

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.
