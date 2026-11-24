---
type: process
tags: [loyer, quittance, facturation-locative]
status: in-progress
created: 2026-07-21
updated: 2026-11-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]", "[[Mission palier 1 — audit du 22 novembre 2026]]"]
---

# Quittancement des loyers

**En une phrase :** générer les échéances mensuelles, confirmer la réception du loyer et
produire la [[Document|quittance]].

## 1. Génération des échéances
- **Déclencheur** : le 1er du mois (Vercel Cron), RPC `generate_rent_periods_for_month`, ou
  `ensureRentPeriodsForMonth` depuis le dashboard.
- Pour chaque **location active** ([[Occupation d'un bien]], `occupant_type = 'locataire'`) :
  upsert **idempotent** sur (bien, locataire, mois), échéance au **4ᵉ jour du mois**,
  montant = `biens.monthly_rent_cents`.
- **Sortie** : lignes [[Période de loyer]] au statut `attendu`.

## 2. Confirmation & quittance
- **Déclencheur** : `confirmRent({periodId, received})` par le gestionnaire.
- Reçu → période `attendu → recu` ; génération d'une **quittance en brouillon** (document `quittance`,
  visibilité `locataire`) + **PDF** (`genererQuittancePdf`), `quittance_status = a_valider`.
- `validateQuittance` → document `actif` (visible locataire). Si le locataire a un e-mail :
  mise en file `document_email_outbox` (`pret`) → `quittance_status = envoyee` ; sinon `validee` (remise papier).

## Acteurs
- Gestionnaire (voir `can_manage_rent` dans [[Période de loyer]]), [[Locataire]].

## Résultat / sorties
- Quittance PDF dans l'espace locataire + e-mail éventuel (via **Resend**, voir [[Canaux de communication]]).

## Règles et contraintes
- Loyer et charges **séparés** sur la quittance (voir [[Quittance conforme]]).
- Non reçu → statut `impaye` → [[Relances et mise en demeure]].
- La quittance est un **document courant** (Livrable A3) : email ou espace personnel,
  date d'émission, **aucune exigence de preuve** — voir [[Notification et valeur probante]].

## Cible V3 (module 3, 2026-07-24) — le cycle mensuel complet
Le référentiel enrichit le flux actuel :
- **Appel de loyer** émis par tâche planifiée au jour paramétré (loyer + provisions,
  prorata d'entrée/sortie, report du solde antérieur), envoyé au locataire.
- **Encaissement saisi manuellement** (pas de sync bancaire, décision actée) et
  **imputé du plus ancien au plus récent** (RM-3.3.2, règle légale — suivi de
  l'ancienneté de la dette), modifiable par l'agent. Le
  [[2026-07-24-gerimmo-v3-a6-doctrine-financiere|livrable A6]] complète (RM-A6.7) :
  **la précision du débiteur prime** sur l'ordre d'ancienneté (règle légale) ; la
  correction de l'agent est tracée ; et **la banque fait foi sur montants et dates
  reçus** — en cas d'écart au rapprochement (manuel), Gerimmo se corrige par
  écriture au réel, saisie rétroactive ou contre-écriture (voir [[Comptabilité]]).
- **La quittance n'est émise qu'après encaissement intégral** (RM-3.4.1) ; **un
  paiement partiel produit un reçu, jamais une quittance** (RM-3.4.2 — la quittance
  libère, le reçu constate ; quittancer un partiel = renoncer au solde). Excédent →
  imputé sur l'appel suivant.
- Fin de bail : trop-perçu et dettes intégrés au [[Solde de tout compte]].
Voir [[Révision annuelle IRL]] pour l'évolution du loyer.

## État dans l'application au 11/09/2026

Le modèle appel / encaissement / quittance de la cible V3 **est en place** :
appels proratisés à l'entrée et à la sortie, encaissement saisi à la main et
imputé du plus ancien au plus récent (RM-3.3.2), quittance après encaissement
intégral et reçu sur paiement partiel (RM-3.4.1, RM-3.4.2).

Depuis le 11/09, la **génération est automatique** : une tâche planifiée
(`cycle_mensuel_interne`, pg_cron, le 1er du mois à 5 h UTC) parcourt les baux
actifs et en préavis, crée les appels manquants et resynchronise quittances et
reçus. Elle ne sert **pas** les organisations dont l'[[Abonnement|abonnement]] est fermé
(lecture seule). Le bouton « Générer l'échéancier » reste, comme rattrapage.

Une seconde tâche, quotidienne, **constate les impayés** sous forme d'alerte par
bail (`generer_alertes_impayes`, 5 h 30 UTC) : montant restant dû sur les termes
échus, depuis quand, et combien de termes. Elle se ferme d'elle-même au
paiement. Voir [[Relances et mise en demeure]] pour ce qu'elle ne fait pas.

Depuis le 18/09, **l'appel est annoncé au locataire**. Une troisième tâche
quotidienne (7 h 30 UTC ; d'abord `/api/cron/appels`, aujourd'hui la mission « appels » de
l'entrée unique `/api/cron/equipes`, `app/vercel.json`) envoie l'avis d'échéance : détail
du terme, date d'échéance, mention du prorata, et **solde antérieur** s'il en
reste un — taire une dette en cours laisserait croire au locataire qu'il sera à
jour en payant le mois. Trois garde-fous : l'agence doit avoir donné son accord
permanent (`organizations.appels_envoi_auto`, faux par défaut, réglable dans le
profil) ; **un terme déjà réglé n'est jamais réclamé** (c'est `etat_loyers_bail_brut`
qui tranche, la même vue que l'écran et que l'alerte d'impayé) ; et cocher la
case n'expédie pas l'historique (appels de moins de 45 jours seulement).
L'avis n'est ni une quittance, qui libère, ni une relance, qui engage un
circuit : il annonce.

> [!warning] Ce qui manque encore
> - **Le jour d'échéance** est celui du bail (`jour_echeance`, 1 par défaut) ;
>   la cible v0 parlait d'un 4ᵉ jour du mois, jamais tranché. **Décision
>   attendue de l'humain** — le code suit le bail, ce qui est défendable ; la
>   question est de savoir si l'agence doit pouvoir imposer un jour unique.

> [!warning] Intention produit v0 (précisions)
> D'après [[2026-07-21-fonctionnalites-par-persona-v0]] : quittance **générique par défaut**, disponible sur la plateforme + e-mail, **validée par l'agence ou le propriétaire** ; l'agence peut générer une quittance **sur-mesure** selon son template (`document_templates`, voir [[Document]]). Voir aussi la divergence « loyer validé par défaut » dans [[Relances et mise en demeure]].

> [!info] Jour de référence (depuis le 15/10/2026)
> « Aujourd'hui » se lit au **jour de Paris** pour la date du règlement par « Encaisser »
> et la date de la quittance (X13, PR #185), puis pour l'état d'un loyer, la génération des
> appels, les quittances et appels à envoyer, la contre-écriture d'un encaissement supprimé
> et la date d'un encaissement saisi sans date (PR #186) ; « Établi le » de l'avis
> d'échéance aussi. L'heure du cycle mensuel (le 1er à 05 h UTC) ne change pas (décision du
> 15/10). Aucune date déjà enregistrée n'est réécrite. Voir [[Le jour de référence est le jour de Paris]].

## État dans l'application au 24/11/2026 (préproduction, non publié) — l'avis d'échéance (mission palier 1, phase 3)

Relu dans le code après les lots 38, 39 et 44 ([[Mission palier 1 — audit du 22 novembre 2026]] ; `QUESTIONS.md`, Q41
et Q45 ; `JURISTE.md`, partie 5, point 5).
- **Un avis ne se prépare que pour un terme encore dû** : sur un terme soldé, Gerimmo refuse et oriente vers la
  quittance ; un terme qui suit la fin du bail n'a pas d'avis.
- **Terme déjà échu** : l'avis se présente comme un rappel (« Avis établi après la date d'échéance : il rappelle un terme
  restant à régler. »), le dit au passé et indique ce qui est déjà reçu et ce qui reste sur ce terme. Le total « pour
  solder votre compte à la date du présent avis » compte les termes antérieurs **et les termes suivants déjà échus** ;
  il oubliait ces derniers (1 120 € au lieu de 1 890,50 € dans le jeu d'essai). L'avis par e-mail suit la même règle,
  au jour de son envoi (envoi fermé depuis le lot 15). Voir [[Relances et mise en demeure]].
- **Virement** : quand les modalités de règlement du bail mentionnent un virement, l'avis imprime l'IBAN du profil de
  l'espace ; sans lui, le PDF est refusé avec un lien vers le profil (un seul IBAN par espace : Q45).
- **Prorata** : le décompte au prorata imprime la base et la formule de l'appel du mois concerné, et non plus le loyer
  actuel du bail (défaut bloquant corrigé au lot 39 : 710,50 € imprimés au lieu de 700 €) ; la période s'écrit
  « février 2025 — prorata du 15/02 au 28/02 » (Q41).
- **Quittance** : l'émetteur et l'écart entre la quittance consultée en ligne et son PDF sont décrits dans
  [[Quittance conforme]] (Q52).

> [!warning] Points à trancher / contradictions (24/11/2026)
> - La section du 18/09 ci-dessus dit que l'avis « annonce » et ne relance pas, avec le seul « solde antérieur ». Un avis
>   établi après l'échéance rappelle désormais un terme restant à régler et compte aussi les termes suivants échus.
>   Peut-il être adressé tel quel au locataire, ou ce rappel doit-il rester aux relances ? (`JURISTE.md`, partie 5,
>   point 5). Rien n'est présenté comme conforme.
