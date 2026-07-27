---
type: source
tags: [personas, produit, note-interne, v0]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
source-file: raw/assets/fonctionalitePersonav0.md
source-type: note produit interne
source-date: 2026-07-21
---

# Fonctionnalités par persona (note produit v0)

**Fichier :** `raw/assets/fonctionalitePersonav0.md` — note de travail v0 (intention produit).

## Résumé
Note décrivant, persona par persona, les fonctionnalités attendues de Gerimmo. Complète le
[[2026-07-21-depot-gerimmo-v3|code source]] côté **intention** (le *pourquoi/pour qui*), là où le
code décrit le *comment*. Plusieurs points **divergent** de l'implémentation actuelle — signalés ci-dessous.

## Points clés
- **Gestionnaire** présenté comme l'« utilisateur principal » (pilotage portefeuille, incidents, artisans,
  documents, échanges locataires, rapports). ⚠️ pas de rôle `gestionnaire` dans le code.
- **Admin agence** : rapports sur les agents, affectation d'un bien à un agent, ajout/suppression d'agents.
- **Incident** : le locataire déclare → Gerimmo génère une **« fiche type »** envoyée au proprio/gestionnaire →
  gestion ou demande de devis (artisan recommandé) → accord dispo artisan ↔ locataire (boucle de propositions) →
  si pas d'accord, **escalade au propriétaire**.
- **Loyer** : Gerimmo demande si reçu, **validé par défaut**, on « dévalide » si non reçu — **3 niveaux** :
  (1) rappel mail, (2) mise en demeure (**7 j paramétrable**), (3) à définir.
- **Quittance** : générique par défaut, disponible sur la plateforme + mail, **validée par l'agence ou le
  proprio** ; l'agence peut générer une quittance **sur-mesure** selon son template.
- **Agenda** transverse à tous : échéances (loyer, assurance, sinistre), alertes documents **2 mois / 1 mois /
  2 semaines** avant terme, **RDV créés automatiquement**, RDV manuels en cas de désaccord.
- **Vue 360 du bien** (proprio & agence) : navigation **Bâtiment > Bien**, infos locataire + bien, et deux
  panneaux côte à côte : **documents** | **échanges**.

## Ce que cette source apporte au wiki
- Pages mises à jour : [[Administrateur d'agence]], [[Propriétaire bailleur]], [[Cycle de vie d'un incident]],
  [[Quittancement des loyers]], [[Relances et mise en demeure]], [[Document]], [[État du projet et décisions ouvertes]].
- Nouvelle page : [[Agenda et échéances]].

## Citations utiles
> « Gerimmo demande si le loyer a bien été recu, par defaut valider et on devalide pour dire que c'est pas recu (3 niveau) »
> « Tout le monde a un agenda : Loyer, assurance, accident … Doc qui arrive a terme alerte et relance (2 mois / 1 mois / 2 semaines avant) »
> « Vue 360 au niveau du bien … Nav : Bâtiment > Bien »

> [!warning] Contradictions avec l'existant (code)
> - **Relance loyer** : la note dit « validé par défaut » + mise en demeure au niveau 2 (7 j paramétrable) ;
>   le code fait l'inverse (statut `attendu` par défaut, **2 relances** puis mise en demeure). → [[Relances et mise en demeure]]
> - **Gestionnaire** : persona central de la note, **absent** du modèle de rôles (code : admin/agent). → [[Modèle de rôles et permissions]]
> - **Agenda unifié + fenêtres 2 mois/1 mois/2 sem** : partiellement couvert (bien_echeances, rappels doc) mais
>   pas comme agenda transverse. → [[Agenda et échéances]]
> - **Vue 360 / Bâtiment > Bien** : spec UX non présente dans le code. → [[Document]]
