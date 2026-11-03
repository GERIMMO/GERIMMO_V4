---
type: process
tags: [loyer, impaye, relance, mise-en-demeure]
status: in-progress
created: 2026-07-21
updated: 2026-11-02
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]"]
---

# Relances et mise en demeure

**En une phrase :** escalade automatique des [[Période de loyer|loyers impayés]], des
relances jusqu'à la mise en demeure.

## Déclencheur
- Loyer non reçu → `confirmRent(received: false)` → statut `impaye` ; puis `sendRentReminder`.

## Acteurs
- Gestionnaire, [[Locataire]] ; alerte au gestionnaire pour le recommandé.

## Étapes (escalade)
1. **Relance 1** puis **Relance 2** : courrier PDF (`document_type: courrier`, `kind: relance`) +
   e-mail au locataire, `reminder_count++`.
2. **Après 2 relances** (`reminder_count >= 2`), la suivante devient une **mise en demeure** :
   PDF `mise_en_demeure`, statut de période `mise_en_demeure`, + **e-mail d'alerte au gestionnaire**
   l'invitant à envoyer le courrier en **recommandé avec AR** (valeur de preuve).

## Résultat / sorties
- Courriers PDF, e-mails, statut de période escaladé.

## Règles et contraintes
- Le courrier officiel exige l'**identité légale du bailleur** sur l'[[Organisation]]
  (`legal_name`, `siren`, adresse) — voir [[Quittance conforme]].
- Idempotence : n'agit que sur les périodes `impaye`.
- **Notification et preuve (Livrable A3, 2026-07-24)** : la mise en demeure est un **acte à
  effet juridique** → **LRAR obligatoire**, notifiée par l'agence (jamais par Gerimmo,
  RM-A3.1). Le délai court depuis la **première présentation**, dont la date est **saisie
  par l'agent** (champ imposé au module 3) ; n° de recommandé et avis scanné stockables
  pour prouver les diligences. La **relance simple**, elle, reste un document courant
  (email/WhatsApp, trace GED suffit). Voir [[Notification et valeur probante]].

## Implications pour l'application
- Génération PDF (`relance-loyer`, `mise-en-demeure`) + file d'envoi e-mail. Voir [[Canaux de communication]].

## Cible V3 (module 3, 2026-07-24) — circuit paramétrable par agence
Le référentiel tranche l'ancienne divergence v0 ↔ code par un **circuit à seuils
paramétrés par agence** (module 18) :
- **Montant plancher** (~50 €) : en dessous, aucune relance — « un locataire devant
  douze euros d'arrondi ne doit pas recevoir une mise en demeure » (le solde reste
  visible).
- **Délais paramétrables** : relance 1 (~5 j après échéance) → relance 2 (~+15 j) →
  **mise en demeure** (~+15 j) ; **le garant est informé dès la relance 2**
  (paramétrable).
- **Chaque relance est horodatée, destinataire et contenu figés** (RM-3.6.3) — la
  preuve des diligences qui fonde le recours (garantie, tribunal, clause résolutoire).
- **Plan d'apurement** : relances suspendues tant qu'il est respecté (RM-3.6.6) ;
  reprise au premier manquement. Trêve hivernale : pas d'expulsion, les relances
  continuent. Colocation solidaire : la relance vise **tous** les colocataires.
- **La dette survit au bail** (RM-3.6.8) ; un impayé **suspend la purge RGPD** du
  locataire (RM-3.6.7). Mise en demeure sans relances préalables : alerte (formalisme
  contestable). Escalade contentieux structurée : **V2** ; procédure judiciaire :
  hors périmètre.

> [!warning] Divergence historique v0 ↔ code — tranchée par le référentiel
> ~~« Validé par défaut + mise en demeure à 7 j » (v0) vs « 2 relances fixes » (code)~~
> → **le module 3 impose des seuils et délais paramétrables par agence** (montant
> plancher + 3 délais). Le code actuel (2 relances codées en dur, `reminder_count`)
> devra migrer vers ce paramétrage. → [[État du projet et décisions ouvertes]]

## État dans l'application au 11/09/2026

Depuis le 11/09, une tâche quotidienne **constate** l'impayé : elle pose une
alerte par bail (une seule, quel que soit le nombre de termes dus) portant le
montant restant dû, la date du plus ancien terme échu et le nombre de termes.
L'alerte est rattachée au bail et **se ferme d'elle-même** quand la dette est
soldée, en restant à l'historique avec son motif.

Elle **ne relance pas**, et c'est délibéré : le circuit décrit ci-dessus suppose
un **montant plancher** et **trois délais paramétrés par agence** (module 18),
qui n'existent pas encore. Écrire « relance à J+5 » dans le produit reviendrait
à inventer une règle que personne n'a arrêtée — et à l'inscrire dans un acte qui
fonde ensuite un recours. L'escalade reste donc un geste du gérant, tracé dans
`relances` (niveau, date d'envoi, date de première présentation pour la LRAR).

> [!warning] Points à trancher
> - Le **montant plancher** (~50 € dans le référentiel) et les **trois délais**
>   restent à fixer, puis à rendre paramétrables par agence.
> - La criticité de l'alerte suit aujourd'hui le **nombre de termes dus**
>   (1 = normale, 2 et plus = critique). C'est une échelle d'affichage, pas une
>   règle métier : elle ne préjuge pas du circuit à venir.

## Audit de gestion du 29/09/2026 — seuil, caution, plan d'apurement

- **Seuil minimal** : réglage d'organisation « ne pas relancer une dette inférieure à »
  (**5 € par défaut**, 0 à 1 000 €) ; la dette **totale** échue du bail est comparée au
  seuil — plus de relance 1 puis 2 pour quelques centimes.
- **Information de la caution** : à la **relance de niveau 2**, chaque caution du bail
  dont l'e-mail est connu reçoit une information de la défaillance du locataire (terme
  impayé, dette totale) — sans demande de paiement ; l'envoi est consigné sur la
  relance. Référence : information de la caution personne physique dès le premier
  incident de paiement non régularisé (art. 2303 du Code civil, rédaction 2022).
- **Plan d'apurement** : **non implémenté** — aucune table ne porte un plan
  (seul le document « protocole d'apurement » existe, sans échéancier en base) ; les
  relances ne peuvent donc pas être suspendues pendant un plan.

> [!info] Tranché le 02/11/2026 — plan d'apurement modélisé
> Migration `20261102224000_plan_apurement.sql` : tables `plans_apurement` et
> `plan_apurement_tranches`, suivi quotidien (`plans-apurement-quotidiens`, 05 h 35 UTC) et
> réévaluation à chaque encaissement. Voir [[Plan d'apurement]].

## Plan d'apurement — état dans l'application au 02/11/2026

- Le gérant (ou le propriétaire direct) **propose** un plan sur un bail dont la **dette échue**
  (termes échus, calculés en base au jour de Paris) est positive : 1 à 60 tranches mensuelles,
  première échéance sous trois mois, acompte facultatif, tolérance (5 j par défaut) et seuil de
  caducité (2 tranches manquées par défaut). Un seul plan vivant par bail.
- Le **protocole d'apurement** (modèle existant) se génère depuis le plan enregistré (mêmes
  tranches, même dette arrêtée) et peut partir en signature Zoho. Le plan est **activé** par le
  gérant quand le locataire a accepté (date d'acceptation).
- **Mesure du respect** : la dette échue totale du bail doit rester, après la tranche *k*, au plus
  égale à `dette_initiale − acompte − Σ tranches 1..k`. L'imputation « du plus ancien au plus
  récent » (RM-3.3.2) est inchangée ; un loyer courant impayé fait donc monter la dette et casse
  le plan, ce qui est voulu.
- **États** : proposé → actif → (en défaut ⇄ actif) → caduc ; soldé dès que la dette échue est
  nulle ; annulé par le gérant avec motif. Une tranche manquée puis rattrapée reste tracée
  (« honorée en retard »).
- **Relances automatiques** (RM-3.6.6) : suspendues pendant un plan actif ou en défaut, reprise
  là où elles s'étaient arrêtées quand le plan est caduc ou annulé. L'alerte d'impayé, elle, reste
  posée : c'est un constat, pas une relance.
- **Alertes** au gérant : demande du locataire (`plan_apurement_demande`), tranche manquée
  (`plan_apurement_defaut`, critique), plan caduc (`plan_apurement_caduc`, critique), plan soldé
  (informative).
- **Locataire** : demande un plan depuis « Mes paiements » (message au gérant + alerte) ; voit
  son plan, sa progression et sa prochaine tranche.
- Hors périmètre : délais de paiement accordés par le juge (art. 24 loi 1989), FSL, information
  automatique de la caution hors relance de niveau 2.

> [!info] Jour de référence (depuis le 15/10/2026)
> L'état « impayé » d'un loyer, l'alerte d'impayé, les relances dues (jours de retard,
> termes échus, colocataires encore solidaires) et la relance consignée (un courrier par
> jour) se comptent au **jour de Paris** (lot « fuseau-paris », PR #186) : avant, un loyer
> échu la veille à Paris restait « attendu » entre minuit et 2 h. Voir [[Le jour de référence est le jour de Paris]].
