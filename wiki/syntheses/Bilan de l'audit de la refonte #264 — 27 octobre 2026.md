---
type: synthesis
tags: [audit, refonte, proprietaire, publication, qualite]
status: stable
created: 2026-10-27
updated: 2026-10-27
sources: []
---

# Bilan de l'audit de la refonte #264 — 27 octobre 2026

> Bilan simple, à lire avant de décider la mise en production. Le rapport complet (méthode, 70 constats, corrections
> chantier par chantier, tests, migrations) est dans le dépôt : `app/docs/audit-refonte-264-20261027.md` ; les preuves
> (47 captures avant/après, constats et rapports des chantiers) dans `app/docs/preuves-audit-264/`.

## Mise en production du 27 octobre (après le feu vert)

Publié le 27/10 à 15 h 12 UTC : migrations `20261027100000` → `100500` appliquées à 15 h 02 (run 40526954680) après
simulation (40518220377), sauvegarde (40520623873) et CI verte (40518225925) ; PR #267 fusionnée → `main` `79a7aadd` ;
déploiement Vercel `dpl_4jYuA3ToD7V8KC2fbUqEH2tNr39a` READY, pages publiques en 200, aucune erreur d'exécution.
Recette de production : 65 réussis, 2 échecs imputables aux tests (titre du parcours de démarrage changé par #264 ;
course du test de dépôt sur l'adresse « ?sel=depot »), specs corrigées ensuite. Détail dans `log.md` (entrées `deploy`
et `audit` du 27/10).

## Verdict avant publication : prêt à publier, avec réserves

La refonte publiée le 27/10 (`555c5282`) fonctionne, mais elle contenait **70 défauts confirmés** (2 critiques,
20 majeurs, 41 mineurs, 7 cosmétiques). Ils sont tous traités sur la branche `claude/compassionate-euler-qpqjp6`
(tête `42cc254e`, fusionnée en squash le 27/10 → `79a7aadd`) : 53 corrigés, 12 corrigés pour l'essentiel avec un reste décrit, 5
renvoyés à une décision produit. La batterie complète est au niveau de l'état d'avant correction, et **aucune donnée
réelle n'est touchée en production** (relevé en lecture seule du 27/10 : 0 DPE ancien affiché valide, 0 alerte
d'impayé ouverte, 0 incident sur un lot à plusieurs baux, 0 relance, 2 brouillons de bail, 7 documents).

Les réserves : cinq migrations à passer par le chantier « Migrations Supabase » (simulation d'abord, sauvegarde, puis
application, **avant le code**) ; les cinq décisions ci-dessous ; WebKit mobile non rejoué ; le comportement de
Supabase Storage réel à confirmer en recette pour la reprise d'un dépôt refusé.

## Les problèmes, par gravité

**Critiques (2, corrigés)**
- En colocation à baux individuels, un incident déclaré par le propriétaire était rattaché au colocataire le plus
  récent, qui le voyait et pouvait le contester, pendant que l'occupant concerné ne voyait rien. Désormais le
  propriétaire choisit la chambre ou la pièce ; sans choix, l'incident reste au lot et aucun locataire n'est désigné
  déclarant à sa place. Un relevé en lecture seule listera, après déploiement, les incidents déjà mal rattachés (0 à ce jour).
- Un rapport déjà rangé dans « Documents » ne pouvait plus devenir un diagnostic : impasse. Il peut maintenant être
  « utilisé comme rapport » depuis la fiche du lot, sauf s'il est partagé au locataire ou en signature (refus expliqué).

**Majeurs (20 : 17 corrigés, 3 partiels)** — les plus sensibles pour un propriétaire :
- Loyers : après réception complète, l'alerte « Loyer impayé » restait allumée jusqu'au lendemain et devenait l'action
  prioritaire ; elle se ferme désormais immédiatement (et se rouvre si le règlement est retiré). La relance et l'accueil
  disent la dette totale du bail, plus seulement le mois le plus ancien.
- Création du bail : deux onglets n'écrasent plus une saisie enregistrée ; changer d'étape sans enregistrer prévient et
  propose d'enregistrer ; « Commencer un bail » reprend le brouillon existant au lieu d'en créer un vide ; un bail en
  préparation reste visible dans les tâches et le parc ; le bouton Retour revient à l'étape précédente.
- Diagnostics : un DPE réalisé entre 2018 et juin 2021 n'est plus présenté valide jusqu'en 2029 (il est échu depuis le
  31/12/2024, décret n° 2020-1610) et ne lève plus le blocage de mise en location ; la bibliothèque affiche l'état réel
  des rapports et leur bien ou lot ; « Nouvelle version » d'un rapport renvoie vers la fiche du lot.
- Documents : un dépôt depuis la fiche d'un lot reste rattaché au lot ; une nouvelle version ne naît plus « Expirée » ;
  un fichier vide ou une image illisible est refusé avant transfert.
- Fiche du lot : un propriétaire sans prénom n'est plus classé « Personne morale » (ce qui faisait passer le bail nu à
  6 ans) : la qualité du bailleur est un choix explicite ; la dépense du lot demande sa date de pièce et la part de TEOM.
- L'assurance du locataire classée pendant la préparation est reprise après l'activation (espace locataire, alertes).

**Mineurs et cosmétiques (48 : 33 corrigés, 9 partiels, 5 décisions)** — frictions, textes, accessibilité (nom accessible de la carte « À vérifier »,
contrastes du menu supervision, zoom 400 %, focus des fenêtres), performance (icône du site 287 Ko → 5 Ko), ambiances
(rafraîchissement à minuit). Détail dans le rapport, § 4 et annexe B.

## Ce qui a été vérifié après correction

- Chaque chantier : défaut reproduit avant, absent après ; lint, types, tests des modules, parcours navigateur au
  téléphone (390×844) et à l'ordinateur (1440×900) ; relecture adverse indépendante, reprise si point bloquant.
- Intégration : relecture adverse de la fusion (migrations rejouées et défaites, 124 fichiers de tests, 4 conflits),
  qui a trouvé deux interactions entre chantiers — corrigées — et la batterie complète :
  lint 0 · typecheck 0 · build OK · parcours navigateur **250 réussis, 0 échec, 0 instable** (1 ignoré) · Vitest **11 674 réussis**, 1 échec (`fichier-signe-navigateur`, banc Chromium, identique à la référence d'avant correction), 17 ignorés. Soit, par rapport à la référence : +15 parcours et +176 cas unitaires, aucun nouvel échec.
- Référence d'avant correction, pour comparaison : lint 0, types 0, 11 498 tests unitaires, 235 parcours. Le seul
  échec unitaire restant (`fichier-signe-navigateur`) existe à l'identique **avant** la refonte : version du navigateur du
  banc, pas un défaut de l'application.
- 101 cas de test ajoutés (22 fichiers), dont 6 parcours navigateur et 5 tests SQL des migrations.

## Les cinq décisions du 27 octobre : tranchées et réalisées (non publié)

Le 27/10 en fin de journée, vous avez tranché les cinq décisions ; les cinq chantiers sont faits, relus par relecture
adverse et intégrés sur la branche `claude/compassionate-euler-qpqjp6`, **non fusionnée** : votre accord est attendu
avant publication. Aucune migration : seulement du code.

| Décision | Ce que fait l'application maintenant | Relecture |
|---|---|---|
| **CB-08 Relocation** | Sur un lot dont le bail est terminé ou en préavis, le nouveau brouillon reprend type, loyer, charges, mode de charges, jour et terme de paiement, révision IRL du bail précédent ; l'étape Loyer le dit (« Repris du bail précédent (du … au …), à vérifier ») avec « Effacer ces valeurs ». Jamais repris : locataire, garants, dates, dépôt. | 1 bloquant repris (un second « Préparer un autre contrat » créait un doublon), puis ok |
| **CB-14 Inventaire du meublé** | « Ajouter les 11 éléments obligatoires » crée les lignes du décret 2015-981 en un geste (sans doublon, éléments déjà saisis sautés) ; chaque ligne sans état se complète sur place. | ok |
| **TRV-09 Grand parc** | Au-delà de 24 tâches, une ligne dépliable par obligation (« 300 lots : DPE absent ou expiré », « 320 baux : État des lieux à signer ») ; 80 % de nœuds en moins sur 300 lots ; un petit parc ne change pas. | 1 bloquant repris (le titre comptait les baux en les appelant lots), puis ok |
| **ED-04 Documents du locataire** | Un seul geste : le titre de chaque pièce, bail ou quittance ouvre l'aperçu en fenêtre, téléchargement ou impression depuis la fenêtre, plus aucun nouvel onglet. | ok |
| **TRV-05 Images inutilisées** | 14 photos et le composant BandeauAccueil supprimés (−2,4 Mo) ; un test empêche qu'une illustration non référencée revienne. | ok |

Vérification : {{INTEG5_BILAN}}

Restent à votre choix, signalés par les relectures : marquer aussi « repris du bail précédent » sur la fiche du lot ;
rendre l'inventaire du meublé « à vérifier » tant qu'un état manque (migration) ; appliquer le geste unique aux liens vers
une quittance hors de « Mes documents » ; paginer la page Alertes sur un grand parc (hors périmètre).

Et douze corrections partielles de l'audit dont le reste est un choix de produit ou de droits (détail au § 7 du rapport), par
exemple : l'assurance du locataire rattachée à tous les colocataires présents ou au seul principal (ED-01) ; conserver le
résultat du CREP (DOC-07) ; seuil du quota de dépôts (DOC-13) ; décor saisonnier sous une charte d'agence (ED-03).

## Limites de l'audit

- Le site de production, le fichier `etat.json` et le dossier local du poste n'étaient pas joignables depuis
  l'environnement : la correspondance code/production a été établie par GitHub, Vercel et la base (lecture seule).
- WebKit mobile non rejoué ; stockage et planificateur émulés ; CREP et durées de bail repris du code et du wiki sans
  revérification en ligne (le DPE, lui, est sourcé).
- Les espaces artisan et supervision ont été parcourus avec moins de profondeur que l'espace propriétaire.

## Pour publier les cinq décisions (après votre accord)

Sans migration : PR de la branche vers `main`, CI verte sur la révision exacte, fusion squash, déploiement Vercel,
« Recette de production avec nettoyage », journal. Le protocole complet ci-dessous reste celui de la première publication.

## Pour publier (rappel de la première publication, faite)

1. Ouvrir la PR de la branche vers `main` ; CI verte sur la révision exacte.
2. « Migrations Supabase » en simulation, puis sauvegarde, puis application des cinq fichiers dans l'ordre
   `20261027100000`, `100100`, `100200`, `100300`, `100500` — **avant la fusion du code**.
3. Fusion squash, déploiement Vercel, « Recette de production avec nettoyage », relevé des incidents
   (`releve-incidents-gerant-colocation.sql`, lecture seule), journal.
4. Wiki à mettre à jour ensuite : Incident (règle du rattachement), Diagnostic (régime transitoire du DPE), alertes
   d'impayé (suivent les encaissements).

Sources : décret n° 2020-1610 du 17/12/2020, art. 1 — https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000042695192 ;
ministère de la Transition écologique — https://www.ecologie.gouv.fr/politiques-publiques/diagnostic-performance-energetique-dpe
