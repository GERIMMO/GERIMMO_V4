---
type: synthesis
tags: [maquette, charte, ui, recette]
status: stable
created: 2026-08-14
updated: 2026-08-30
sources: ["[[2026-08-08-maquette-prototype-cliquable]]"]
---

# Cohérence maquette ↔ application

Audit ligne à ligne du 14/08/2026 (**Tableau de bord**, **Parc**, **Personnes**)
**étendu le 19/08/2026 à tous les écrans** : le prototype cliquable
(`raw/maquettes/2026-08-08-gerimmo-prototype.html`) comparé au code. Objectif :
plus aucun écart non documenté — ce qui diffère de la maquette ci-dessous est
un **choix assumé**, pas un oubli.

## Passe globale du 19/08 (tous les écrans restants)

Trois revues (2 charte + 1 qualité) puis corrections sur ~35 fichiers,
lint/tests/build verts. Alignements livrés : en-têtes charte partout (h1 serif
nu dans `entete-page` + compteur `mono-discret`) ; **table stylée du journal
comptable branchée** (th mono, catégories en puces, crédits `+` verts) + tuiles
KPI compta ; **états d'objets en puces** via `lib/baux.ts`
(bail/mandat/EDL/appels de loyer — fin des statuts gris) ; encadrés
d'avertissement uniformisés (fond doux + liseré gauche 3 px) ; états vides
`.vide` guidants ; **bandeau encre** pour l'espace locataire et la console
admin ; libellés français centralisés (`lib/libelles.ts`) ; formats fr-FR
(dates, montants via `eur()` unique — 10 copies locales supprimées) ; quittance
imprimable propre (`print:hidden`). Côté fond : `aujourdhuiParis()` généralisé
(bug UTC/mois clôturé), erreurs d'écriture plus jamais avalées (quittance,
création de bien PD, suppressions d'encaissement), gardes d'accès dédupliquées,
requêtes parallélisées (fiches personne/bail, espace locataire), `ilike`
échappé.

## Conforme à la maquette (après les alignements du 14/08)

**Chrome commun** — bandeau encre, marque serif espacée, filet, contexte
d'agence, navigation laiton (onglet actif souligné, 60 % d'opacité au repos),
badge rouge sur Alertes. **Cloche retirée le 30/08** (doublon de l'onglet) —
la maquette la garde ; écart assumé à la demande de Tahir.

**Tableau de bord**
- En-tête : h1 + date/heure en mono (`entete-page`).
- **4 tuiles KPI à jauge** : À traiter (rouge, jauge critiques/normales),
  **Occupation en %** (or, jauge loués/reste — le chiffre est le taux, comme la
  maquette), **Encaissé du mois** (bleu, « x % du quittancement du mois »),
  Documents (neutre). Liseré gauche, chiffre Cormorant 29 px, chevron au survol.
- **Rangée graphique** : donut « Répartition du parc » (loués / disponibles /
  en préparation, % au centre) + barres doubles « Encaissements et dépenses »
  sur 6 mois (écritures réelles), **infobulle au survol** de chaque mois
  (encaissé + dépenses, 30/08). SVG pur, sans bibliothèque. **Curseur main** sur
  tout ce qui se clique (boutons compris, 30/08).
- Deux colonnes : alertes à gauche, cartes contextuelles à droite.

**Parc**
- En-tête : h1 charte + bouton laiton « + Ajouter un bien » + compteur mono
  « N biens · N lots ».
- **Maître-détail** (`.split`) : colonne de liste sticky à gauche
  (`tete-liste`, en-têtes d'adresse `tete-groupe` fond ardoise avec
  ville/type en mono et puce « x/y loués », lots indentés `rang-lot` avec
  surface et puce d'état) ; à droite l'**aperçu du parc** : 3 KPI
  (Occupation %, À finaliser avec le compte d'éléments manquants,
  Quittancement mensuel des baux en cours), donut de répartition, carte
  « **Éléments à compléter** » (motifs de blocage agrégés, barres triées du
  plus fréquent).
- État vide guidant (`.vide`) avec bouton de création.

**Personnes**
- En-tête : h1 + compteur mono « N fiches ».
- Colonne de liste unique (`colonne-liste` + `tete-liste`) : rangs à **avatar
  d'initiales** (fond ardoise), nom en 13,5 px, contact en small, rôles en
  **puces** à fond doux (fin du « texte coloré » v1 sur cet écran).
- Assistant en 2 étapes : fil à ronds (attente/courant/fait), cartes de rôle
  avec icône ardoise et liseré de sélection, avance automatique.
- États vides guidants (liste vide, recherche sans résultat avec bouton
  « Réinitialiser »).

**Composants charte disponibles dans `globals.css`** : `eyebrow`,
`mono-discret`, `kpi` (+jauge), `puce` (5 déclinaisons), `rang-alerte`,
`filtre`, `barre`, `rang`, `avatar`, `tete-groupe`, `rang-lot`,
`colonne-liste`, `tete-liste`, `vide`, `btn-or`, `entete-page`,
`entete-carte`, `lien-discret`, `bloc-graph`, `libelle-champ`, `badge-statut`.

## Écarts assumés (choix documentés — pas des oublis)

| Élément maquette | Décision | Pourquoi |
|---|---|---|
| **Recherche globale** dans le bandeau (Ctrl-K, modale de résultats) | Non implémentée | Fonctionnalité transverse à part entière — à planifier comme incrément, pas comme habillage. La recherche locale existe sur Personnes. |
| **Avatar + menu compte** dans le bandeau | « Mes espaces / Se déconnecter » en liens | Même service ; le menu déroulant viendra avec les préférences de compte. |
| KPI **Incidents** + donut « Incidents par payeur » | Tuile Incidents conservée ; **donut retiré le 30/08** (demande de Tahir : un incident est une alerte, la carte n'apportait rien) — la rangée graphique passe à 2 cartes | La file « à qualifier » reste lisible sur la tuile ; le détail par payeur vit dans l'onglet Incidents. |
| Carte **« À lire »** (articles) | Absente | Le module éditorial n'est pas au périmètre V0. |
| **« Prochains rendez-vous »** avec pastille jour ardoise | Carte « Cette semaine » (libellé jour mono) | Même contenu, rendu plus sobre ; la pastille date viendra avec le planning (S7). |
| Rangs d'alerte du tableau de bord = `ligneAlerte` maquette | Liste **plus riche** que la maquette | Le tableau réel groupe dépassé/à venir et montre lot + montant — on ne l'appauvrit pas pour ressembler au prototype. La page Alertes, elle, utilise `rang-alerte` conforme. |
| « Lots en préparation » avec **barre de complétude + %** | Motif de blocage cliquable, sans % | Aucune métrique « % de complétude » n'existe en base — en inventer une serait un faux chiffre. Le nombre d'éléments manquants est dans l'aperçu du Parc. À trancher : définir une vraie complétude (critères pondérés) ou en rester au motif. |
| Bouton « action groupée » (rattacher N lots à X) | Absent | Action de masse à spécifier (règle métier de détention) avant d'exister en un clic. |
| ~~**Sélection dans le panneau** (clic = détail à droite, `paneDe`)~~ | **Aligné le 30/08 sur le Parc** : clic sur un bien ou un lot = panneau de droite (`?sel=bien:…` / `lot:…`, `pane-parc.tsx`), « ‹ Vue d'ensemble » pour revenir, « Ouvrir la fiche » pour la page complète | Retour recette 30/08 (« ouvrir un bien m'emmenait ailleurs »). Les pages profondes restent liables ; le panneau reprend `paneLot`/`pageBien` de la maquette (éléments manquants, propriétaire, occupant, lots du bien). Personnes et Incidents : Incidents est déjà scindé (`?sel=`) ; **Personnes reste en navigation** — à aligner de la même façon si le retour se confirme. |
| **Sous-onglets Lots / Biens** du Parc | Vue unique « Lots groupés par bien » | Les en-têtes d'adresse mènent déjà à la fiche bien : les deux vues en une. À revoir si le parc dépasse ~30 biens. |
| Barre + « compl % » sur chaque `rang-lot` | Puce d'état seule | Même raison que la complétude ci-dessus. |
| **Assistant plein écran** 760 px + colonne « récap vivant » + « Quitter » | Assistant en panneau latéral de la page Personnes | Le panneau suffit à 2 étapes ; le plein écran + récap prendra son sens sur les assistants longs (bail S4). À trancher. |
| Carte « **À vérifier** » (fiches en anomalie, liseré rouge) + « Par rôle » (barre empilée) | Absentes | Aucun critère d'« anomalie de fiche » n'est défini en base (le `p.ok` de la maquette est fictif). Définir la règle métier d'abord, l'écran ensuite. |
| `Card` shadcn (anneau gris) vs `.carte` maquette (filet crème) | Card shadcn conservée | Écart de teinte marginal ; unifier = retoucher ~20 fichiers pour un gain faible. À reprendre lors d'un lot « polish » global. |
| Boutons `.btn` / `.btn-encre` de la maquette | Variantes shadcn (`default`, `outline`, `destructive`) | Mêmes rôles, tokens charte déjà appliqués aux variantes. `btn-or` (laiton), lui, est repris tel quel. |
| ~~Table stylée (th mono, `tr.cliquable`)~~ | **Branchée le 19/08** sur le journal comptable et la matrice A2 (console) | L'écart est levé. |
| Graphie « email » (maquette : « e-mail ») | « email » conservé partout | Cohérence interne de l'app (formulaires personnes, invitations) ; changer = retoucher tous les libellés pour un gain nul. |
| Formulaire de connexion dans une `Card` | Conservé | La maquette pose les champs nus ; la Card ne nuit pas et l'écran de connexion sera revu à la passe d'identité visuelle (jalon V0). |
| Avatar « Mes espaces » encre/laiton | Conservé | Variante d'entrée d'espace, distincte de l'`.avatar` ardoise des listes ; contraste vérifié (≈ 5:1). |
| Animations d'entrée (`monte`, décalées) | Non reprises | Choix de sobriété ; les transitions au survol de la charte sont là. |

## Module Incidents (S7, incrément 1 — 21/08)

Développé sur la branche `sprint7-incidents` (voir
[[Cycle de vie d'un incident]] et `livrables/Recette S7 - incidents.md`).
Repris de la maquette : libellés des statuts locataire (`LIB_LOC`), grammaire de
couleur (rouge = action agence, encre = en cours, vert = clos), catégories avec
repère juridique, urgence à deux niveaux, onglet Incidents en 3ᵉ position avec
badge, donut « par payeur », attribution des dossiers, formulaire « Nouvel
incident » avec carte « Ce qui va se passer ». Écarts assumés propres au S7 :

| Élément maquette | Décision | Pourquoi |
|---|---|---|
| **Conseil d'imputation** pré-sélectionné (« Suivre le conseil ») | Repère juridique affiché en **information**, rien de pré-coché | RM-7.2.1 (décision actée 25/07) : imputation décidée par l'agent **sans proposition automatique** — le référentiel prime sur la maquette. **Confirmé par l'humain le 21/08** (les 4 écarts métier de ce tableau sont actés — voir `log.md`). |
| Carte « **Qui paiera la réparation** » dès la déclaration locataire | Absente — statut « votre gérant l'examine » jusqu'à qualification | RM-7.2.4 : le locataire est informé **après** la décision de l'agent. |
| 9 statuts maquette (devis, créneaux, planifié…) | **Registre A5** (7 états), seuls les états sans artisan sont servis | Les statuts artisans/devis/planning arrivent avec les incréments S7 suivants ; le vocabulaire V3 fait foi ([[Machines à états et événements]]). |
| Description facultative (bot : « 2 photos + la pièce suffisent ») | Description **obligatoire** (comme le formulaire maquette) | RM-19.2.2 est une règle du module 19 (mobile, S13) — à assouplir à ce moment-là. |
| Liste `.split` (liste 340 px + panneau de suivi) | Liste pleine page + fiche navigable | Même choix que Parc/Personnes : pages profondes liables. |
| Bouton WhatsApp / bot locataire | Absent | Canaux bot hors périmètre V1 ([[Canaux de communication]]). |
| Vignettes photos côté locataire | Compteur seul (« 2 photos ») | La route de consultation de fichiers n'existe que côté agence (journalisation d'accès) — route locataire à un prochain incrément. |
| Files d'attente « À qualifier / Devis à valider / Terminé » | Filtres « En cours / À traiter / Clos / Tous » | Les files devis/terminé n'ont pas d'objet sans artisans ; le filtre « À traiter » couvre déclaré + rouvert + terminé. |
| Imputation `Bailleur` / `Locataire` | locataire / propriétaire / **dégradation fautive** + clôture « transmis au syndic » | Le module 7 (RM-7.2, RM-7.1.4) est plus riche que la maquette ; le plan de livraison disait « copro » — module 7 retenu. |

## Ce que ça garantit pour la recette

Sur Tableau de bord, Parc et Personnes : **tout ce qui est visible correspond
soit à la maquette, soit à une ligne du tableau ci-dessus.** Si un élément
d'écran ne colle ni à l'un ni à l'autre, c'est une anomalie à remonter.

> [!warning] Points à trancher
> - Définir (ou renoncer à) une **métrique de complétude** par lot — elle
>   conditionne 3 éléments maquette (barres des rangs, % du panneau, tri).
> - Critère d'**anomalie de fiche personne** pour la carte « À vérifier ».
> - **Assistant plein écran** avec récap vivant : à décider au moment du
>   formulaire de bail (S4), le plus long de l'app.
> - **Recherche globale** : prioriser dans un sprint dédié ou après V0.
