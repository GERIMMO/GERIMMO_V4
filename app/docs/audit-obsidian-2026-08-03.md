# Récapitulatif — incompréhensions et manquements

*Audit du référentiel Obsidian confronté au code, nuit du 2 au 3 août 2026.*

Trois familles : ce que le référentiel décrit et que le code ne fait pas (**manquements**),
ce sur quoi les deux se contredisent (**incompréhensions**), et ce que le code fait sans
que le wiki le sache (**dette documentaire**).

---

## A. Manquements — décrit, pas construit

### A1. Sprint 7 — incidents, devis, artisans *(le plus gros bloc)*

Quatre processus et un persona entiers sont documentés, **aucune table n'existe** :

| Documenté | Table attendue | En base |
|---|---|---|
| [[Incident]] · [[Cycle de vie d'un incident]] | `incidents` | absente |
| [[Devis]] · [[Demande et sélection de devis]] | `devis` | absente |
| [[Intervention]] · [[Planification d'intervention]] · [[Intervention et clôture]] | `interventions` | absente |
| [[Artisan]] (persona complet, notation à 3 sources 25/50/25) | `artisans` | absente |

C'est le prochain sprint prévu. Rien d'anormal — mais c'est **le quart du référentiel
métier qui n'a aucune contrepartie**.

### A2. Récapitulatif fiscal 2044 — arbitré « V1 », non construit

[[Fiscalité]] tranche explicitement : **2044 (location nue) en V1**, les autres régimes en
V2. Aucun écran, aucune fonction. Le module 6 est bâti (rapports de gestion) mais s'arrête
avant le volet fiscal. **À planifier avant d'ouvrir aux utilisateurs**, puisque la décision
le range en V1.

### A3. Espace locataire — un seul écran au lieu de quatre

Décision du 2026-08-01 : le locataire doit avoir **Mon bien · Mes documents · Mon Chat ·
Paramètres**. Aujourd'hui : une page unique qui empile bail, loyers et assurance. Le
contenu existe, la **navigation** manque.

### A4. Bot WhatsApp — direction actée, zéro ligne

Décision : bot **conversationnel**, pour **tous les personas**, présenté comme le
différenciateur face aux concurrents. La synthèse *Documents à générer et automatisation
WhatsApp* classe déjà chaque champ en AUTO / ASK. Rien n'est commencé — et c'est le seul
sujet où le référentiel parle d'avantage concurrentiel.

### A5. Reports assumés du module 0c

Relances du propriétaire à cinq seuils (dépend de l'agenda, module 14) · grille de
récupérables éditable par agence (module 18) · appel commun réparti aux tantièmes ·
extraction automatique des postes depuis le PDF (V2). **Décidés comme reports** le
2026-08-02, pas des oublis.

---

## B. Incompréhensions — le wiki se contredit ou contredit le code

### B1. [[Patrimoine et résidences]] décrit un modèle qui n'existe plus ⚠️

La page pose une hiérarchie à quatre niveaux :

```
Organisation → Patrimoine (obligatoire) → Résidence (optionnel) → Bien (lot : appartement…)
```

Or **[[Bien]] documente lui-même la « Redéfinition V3 »** : le bien est l'unité *physique*,
le lot l'unité *locative*. Les deux pages se contredisent — celle-ci confond bien et lot
(« Bien (lot : appartement…) ») et ajoute deux niveaux au-dessus.

En base : ni `patrimoines`, ni `residences`. **La page est un vestige d'avant le module 0**
et n'a jamais été alignée. C'est la contradiction la plus trompeuse du wiki, parce qu'elle
est écrite au présent.

**À trancher :** supprimer la page, ou réintroduire les deux niveaux — une agence à gros
portefeuille peut vouloir regrouper. Rien dans le code ne le prépare aujourd'hui.

### B2. Signature électronique — cohérent, mais la V1 est bloquée

Pas une contradiction : le wiki séquence proprement **V0 hors plateforme + dépôt PDF**
(l'état actuel) puis **Yousign en V1**. À retenir : la V1 est définie comme *« la première
version ouverte aux utilisateurs »*. **Ouvrir sans Yousign, c'est sortir du cadre acté.**

### B3. Le type « Immeuble » que j'ai ajouté n'est pas dans le référentiel

[[Bien]] liste six types : *appartement, maison, local, parking, terrain, autre*. J'ai
ajouté **immeuble** le 2026-08-02 sur votre demande, et l'application conseillait
auparavant de contourner par « maison, local ou autre ». Le code et le wiki divergent
depuis. **La page [[Bien]] est à mettre à jour** — je ne l'ai pas fait sans votre accord.

---

## C. Dette documentaire — construit, non documenté

| Notion en base | Statut wiki |
|---|---|
| `baux.charges_mode` (provision / forfait) | absent — alors que [[Régularisation des charges]] dit « charges au forfait : aucune régularisation » |
| Type de bien **immeuble** | absent (voir B3) |
| Blocage **DPE classe G** (loi Climat) | présent dans [[Diagnostic]], pas dans [[Lot]] |
| Zone tendue / préavis d'un mois | mentionné 6 fois, jamais spécifié comme règle |
| Charte visuelle de l'espace agent | rédigée le 2026-08-03, **à confronter à la charte graphique PDF** que vous m'avez transmise ensuite |

---

## D. Ce qui va bien

- Les **arbitrages sont tous clos** : *« Plus aucun arbitrage en attente (2026-07-25).
  Feu vert au développement. »* Aucune décision ne bloque le développement.
- Les contradictions restantes du wiki sont **signalées par le wiki lui-même** (callouts
  `[!warning]`), sauf B1.
- Les règles métier critiques sont **défendues en base**, pas seulement à l'écran : clé à
  100 %, fonds ALUR jamais récupérable, mois clôturé, DPE G, retenue sans état des lieux
  d'entrée. Un contournement par l'API échoue aussi.

---

## E. Ce que je propose

| # | Sujet | Pourquoi maintenant |
|---|---|---|
| 1 | **Trancher B1** (patrimoines/résidences) | Une page fausse au présent contamine toute lecture du modèle |
| 2 | **Sprint 7** (incidents/artisans) | Le plus gros manque fonctionnel, déjà spécifié |
| 3 | **Menu locataire à 4 onglets** | Petit effort, décision déjà prise, visible immédiatement |
| 4 | **Récap fiscal 2044** | Rangé en V1 par arbitrage — l'oublier, c'est sortir du périmètre annoncé |
| 5 | **Yousign** | Conditionne l'ouverture aux utilisateurs |
| 6 | **Bot WhatsApp** | Le différenciateur ; à cadrer avant qu'il ne devienne un chantier de fin |

Les points 1 et 3 se règlent en une séance. Les autres sont des sprints.
