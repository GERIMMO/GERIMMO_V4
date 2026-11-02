---
type: concept
tags: [impaye, loyer, relance, plan-apurement]
status: in-progress
created: 2026-11-02
updated: 2026-11-02
sources: ["[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[Audit complet du 29 septembre 2026]]"]
---

# Plan d'apurement

**Définition :** accord amiable entre le bailleur (ou son mandataire) et un [[Locataire]] en
difficulté, qui **gèle une dette locative échue à une date** et l'étale en **tranches mensuelles**
venant s'ajouter au loyer et aux charges courants. Il ne modifie ni le [[Bail de location|bail]] ni
le loyer ; il suspend les relances tant qu'il est respecté (RM-3.6.6) sans que le bailleur renonce à
ses droits ni à la clause résolutoire.

## Caractéristiques / attributs
- **Dette initiale** arrêtée en base au jour de Paris (somme des termes échus non couverts,
  `etat_loyers_bail_brut`), jamais saisie à la main ; **acompte** facultatif à la signature.
- **Tranches** : 1 à 60, mensuelles à partir d'une première échéance située sous trois mois ;
  montants égaux au centime près (reste sur les premières).
- **Tolérance** (jours après l'échéance avant de constater une tranche manquée, 5 par défaut) et
  **seuil de caducité** (tranches manquées, 2 par défaut).
- **États** : `propose` · `actif` · `en_defaut` · `caduc` · `solde` · `annule`. Un seul plan vivant
  (proposé, actif ou en défaut) par bail.
- **Documents** : protocole généré depuis le plan (modèle `protocole_apurement`), protocole signé
  (circuit Zoho ou retour papier) rattachés au plan et au bail.

## Rôle dans le métier
- Évite l'escalade (mise en demeure, commandement) quand le locataire peut régler en plusieurs fois.
- Fixe une règle de suivi objective : après la tranche *k*, la dette échue totale du bail doit être
  au plus égale à `dette_initiale − acompte − Σ tranches 1..k`. Le loyer courant impayé fait monter
  la dette et casse le plan.
- Suivi quotidien (tâche `plans-apurement-quotidiens`) et à chaque encaissement : tranche honorée,
  manquée (puis rattrapée « en retard »), plan en défaut, caduc, soldé.

## Relations
- Concepts liés : [[Période de loyer]], [[Encaissement]], [[Relance]], [[Caution (garant)]].
- Processus où il apparaît : [[Relances et mise en demeure]], [[Quittancement]].
- Règles associées : RM-3.6.6 (relances suspendues pendant le plan), RM-3.3.2 (imputation du plus
  ancien au plus récent, inchangée), RM-3.6.8 (la dette survit au bail).

## Implications pour le modèle de données
- Tables `plans_apurement` (dette, acompte, mensualité, états, documents, dates) et
  `plan_apurement_tranches` (rang, échéance, montant, statut, constatée le, en retard).
- Fonctions `proposer_plan_apurement`, `activer_plan_apurement`, `annuler_plan_apurement`,
  `rattacher_document_plan_apurement`, `suivre_plan_apurement` (interne), `demander_plan_apurement`
  et `mon_plan_apurement` (locataire), `plan_apurement_bail` (gérant), prédicat
  `plan_apurement_suspend_relances` injecté dans `relances_loyer_dues`.
- Alertes : `plan_apurement_demande`, `plan_apurement_defaut`, `plan_apurement_caduc`,
  `plan_apurement_solde` (origine `plan_apurement`).
- Aucun appel de loyer, écriture ou encaissement créé par le module.

> [!warning] Points à trancher / contradictions
> - Information de la caution à la proposition du plan (art. 2303 C. civ. : dès le premier incident
>   non régularisé) : aujourd'hui seulement à la relance de niveau 2.
> - Garde-fou de soutenabilité (tranche + loyer courant rapportés aux revenus du dossier) :
>   non implémenté, la soutenabilité reste à l'appréciation du gérant.
> - Rappel du locataire à J-3 de chaque tranche par e-mail : non implémenté (le plan est visible
>   dans son espace).
