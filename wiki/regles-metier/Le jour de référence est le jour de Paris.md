---
type: business-rule
tags: [dates, fuseau, loyers, comptabilite, documents, socle]
status: draft
created: 2026-10-16
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Prompt de passation à Codex — état du 14 octobre 2026]]"]
---

# Le jour de référence est le jour de Paris

**Énoncé :** quand une règle de Gerimmo parle d'« aujourd'hui » (échéance passée, date
d'un règlement, date d'un document, délai en jours), le jour retenu est **la date du
calendrier à Paris** (fuseau `Europe/Paris`, heure d'été comprise), jamais le jour UTC de la
base de données ou du serveur.

## Fondement
- **Ce n'est pas une règle juridique** : c'est une convention du produit, décidée par le
  dirigeant pour que la base, l'application et les documents disent la même date.
- **X13** (décision du 14/10/2026, fiche FIN-13, vague 4a, PR #185, fusion `5ff849b`) :
  « Encaisser » et la quittance qui en découle sont datés du jour de Paris.
- **« Corrige proprement »** (décision du dirigeant du 15/10/2026, lot « fuseau-paris »,
  PR #186, fusion `6b2a130`) : toutes les règles de loyer.
- **« Recommandations »** (décision du dirigeant du 15/10/2026 sur les cinq questions du lot,
  PR #189, fusion `0c9328a`) : points 1, 2 et 5 faits, points 3 et 4 laissés tels quels.
- Traces : journal `log.md` (entrées « deploy » du 15/10 pour #185, #186 et #189 ; entrée
  « decision » du 15/10, point 3) ; en-têtes des migrations `20261014410000`,
  `20261014416000`, `20261014500000` à `20261014504000`, `20261014820000` et
  `20261014821000` ; `app/supabase/retours-arriere/LISEZ-MOI.md`, sections « Lot
  fuseau-paris » et « Lot fuseau-suite ».

## Pourquoi
La base comparait les dates à `current_date`, le jour du fuseau de la **session** (UTC chez
Supabase), et le serveur de l'application écrit ses instants en UTC (Vercel). Entre minuit et
1 h (hiver) ou 2 h (été) à Paris, la base était encore la veille. Exemples relevés dans les
migrations :
- un loyer échu la veille à Paris restait « attendu » au lieu d'« impayé », pendant que
  d'autres fonctions le comptaient déjà impayé (reproduit le 15/10) ;
- le 1er janvier à 0 h 30, un encaissement saisi sans date était daté du 31 décembre, donc
  de l'année précédente dans le récapitulatif fiscal et le livre ;
- une révision IRL datée d'aujourd'hui, saisie après minuit, était refusée comme « datée
  de demain » ;
- un document produit à 0 h 30 portait la date de la veille dans « Fait le » et « Établi le ».

## Mécanisme
- Côté base : une fonction unique, `public.aujourdhui_paris()`
  (`(now() at time zone 'Europe/Paris')::date`, indépendante du fuseau de la session ;
  migration `20261014500000`). Côté application : `aujourdhuiParis()`.
- **Aucune ligne existante n'est réécrite** : appels, quittances, encaissements, dépôts,
  écritures, révisions et régularisations déjà enregistrés gardent leur date. Corriger une
  date passée relève d'une décision écrite du dirigeant (en-têtes des migrations X13).

## Portée : ce qui est au jour de Paris (état au 16/10/2026)
| Lot | Ce qui lit le jour de Paris |
|---|---|
| X13 (#185) | Date du règlement par « Encaisser » ; date d'émission d'une quittance ou d'un reçu (création et réémission) |
| fuseau-paris (#186) | État d'un loyer (« impayé ») ; suivi des impayés et son alerte ; relances de loyer dues et consignées (un courrier par jour de Paris) ; dossier de loyer impayé de l'orchestration ; brief de la direction (échéances de loyer, et compteur « alertes en retard / dans 7 jours », toutes natures d'alertes) ; fiche du lot, contrats et historique du lot ; génération des appels de loyer et cycle mensuel (baux terminés) ; quittances et appels à envoyer ; contre-écriture d'un encaissement supprimé ; date d'un encaissement ou d'une relance saisis sans date. Côté application : « Établi le » et « Fait à … le » de l'avis d'échéance, mois suivant de « Mes paiements » du locataire |
| fuseau-suite (#189), point 1 | Dépôt de garantie (encaissement, sa pièce, contre-passation) ; journal comptable général (date de pièce et d'imputation par défaut, contre-écriture passée depuis le journal) |
| fuseau-suite (#189), point 2 | [[Révision annuelle IRL]] (date de demande, refus d'une demande « future ») ; terme du bail (écran du bail, congé du bailleur) ; [[Régularisation des charges]] (exercice commencé, prescription, régularisation tardive, étalement, date d'émission) ; [[Rapport de gestion]] (mois couvert, échéance du versement au propriétaire à 15 jours, rapports préparés automatiquement) |
| fuseau-suite (#189), point 5 | « Fait le » et « Établi le » des documents produits à partir d'un instant (`formaterDateFr`) ; date de présentation par défaut du congé du bailleur |
| Fonctions nées au jour de Paris (15-16/10) | Échéance de sept jours d'une révision de devis (D18, #187) ; règlement déclaré d'une facture d'intervention : date future refusée, imputation (D23-A, #188) ; relances d'invitation J+3/J+10 (X16, #190) ; compteur quotidien des appels payants à l'IA (X19, #190) ; jour d'émission d'un avoir sur facture externe (D24-C, #190) ; jour de l'e-mail de 5 h du [[Relais du dirigeant]] (#192) |

Les délais du report ou de l'annulation d'un rendez-vous par le locataire (24 h, 48 h,
D22-B, #188) se comptent sur des **instants**, pas sur des jours : ils ne dépendent d'aucun
fuseau.

## Implications pour l'application
- Toute nouvelle règle qui parle d'« aujourd'hui » lit `public.aujourdhui_paris()` (ou
  `aujourdhuiParis()`), jamais `current_date` ni le jour UTC du serveur.
- Les tests du jour de Paris simulent le fuseau de la session et figent la fonction le temps
  d'une transaction ; l'horloge réelle n'est jamais simulée (limite déclarée par les lots).

> [!warning] Ce qui n'est pas encore au jour de Paris / points à trancher
> - **Laissé tel quel par décision du 15/10 (point 3)** : l'heure du cycle mensuel des
>   appels de loyer (tâche `cycle-mensuel`, le 1er de chaque mois à 05 h UTC ; à cette
>   heure, jour de Paris et jour UTC coïncident). Le point 4 (compteur « alertes en retard »
>   du brief, passé au jour de Paris par #186 pour toutes les natures d'alertes) est
>   lui aussi laissé tel quel.
> - **Hors décision, toujours au jour de la session** (liste des lots
>   `fuseau-suite` et `relances-invitation`) : restitution du dépôt de garantie
>   (`finaliser_decompte`, `marquer_decompte_envoye`, alertes de restitution), mandats,
>   abonnement (dont `org_ecriture_ouverte` : fin d'essai, défaut de paiement, réutilisée
>   par les relances X16), artisans, diagnostics, assurances (dont l'indicateur
>   « expirée » du courrier de rappel d'assurance, calculé sur le jour UTC du serveur dans
>   `app/src/lib/documents/modeles/rappel-assurance.ts`), factures d'honoraires (`factures_honoraires.emise_le`), appels de
>   charges de copropriété (`appels_charges.date_reception`), clés de répartition
>   (`cles_repartition.date_effet`).
> - **Ordre de grandeur** : après #186, 51 fonctions du schéma `public` lisaient encore
>   `current_date` (relevé en base du 15/10) ; #189 en a rattaché neuf de plus. Aucun
>   relevé consolidé après #189 n'est consigné.
> - **Question au dirigeant** (tour final de vérification) : étendre le jour de Paris à la
>   restitution, aux honoraires, aux appels de copropriété, aux clés de répartition, au
>   rappel d'assurance et à `org_ecriture_ouverte` (recommandation des lots : oui, même
>   mécanique à compte exact). Non tranché.
> - **Non vérifié en production** : la recette ne joue aucune saisie faite entre minuit et
>   2 h à Paris (encaissement, dépôt, révision IRL) ; le premier cycle mensuel après ces lots
>   aura lieu le 01/11.
