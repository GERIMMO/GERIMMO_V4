---
type: business-rule
tags: [archivage, audit, gouvernance-donnees]
status: in-progress
created: 2026-07-21
updated: 2026-10-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Durées de conservation]]", "[[Fermeture de compte]]", "log.md — entrée « deploy » du 24/10/2026 (PR #246)"]
---

# Archivage plutôt que suppression

**Énoncé :** les données métier importantes sont **archivées/désactivées** plutôt que
supprimées à chaud ; les actions sensibles sont **journalisées**.

> [!warning] Principe corrigé par le livrable A2 (2026-07-24)
> La formulation d'origine — « jamais supprimé, seulement archivé » — **ne tient pas
> face au droit à l'effacement** ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|A2]],
> issu de l'audit P0.3). Correction actée : **l'archivage est une étape du cycle de
> vie, jamais un sort final** (RM-A2.4). Au terme de l'archivage intermédiaire, la
> donnée est **supprimée, anonymisée ou conservée pour un motif écrit** (RM-A2.3),
> selon la matrice de conservation — voir [[RGPD]]. Exemples de « jamais » abrogés :
> journal d'audit (→ 3 ans), motifs de blacklist (→ 3/5 ans), agence archivée
> (→ 10 ans puis anonymisée), personne du dossier locataire (→ anonymisée).
> Le principe reste valable **en base active** : dans l'UI, on archive, on ne
> supprime pas — mais la purge programmée existe désormais au bout du cycle.

## Fondement
- Principe directeur `docs/00-principes-gerimmo.md`.
- Implémentation réelle (relevé du 15/10/2026 sur les migrations du dépôt, décision X01 :
  [[Décisions groupées — version candidate du 13 octobre 2026]]) :
  - **Archivage** : colonnes d'archivage sur quelques tables seulement — `archived_at` sur
    `biens`, `diagnostics` et `persons` (et `archived_by` sur `biens`), `archive_le` sur
    `artisan_clients` ; une organisation s'archive par son état (`archivee` dans la base). Il n'y a pas de
    colonnes d'archivage « généralisées » à toutes les tables métier.
  - **Suppression** : le droit de supprimer n'est **pas** réservé au [[Super Admin]] partout.
    Il l'est notamment sur `persons`, `memberships`, `organizations`, `alerts` et `retention_rules` ;
    plusieurs tables de gérance (par exemple `encaissements`, `relances`, `depot_encaissements`,
    `annonces`) ouvrent la suppression aux rôles gérants de l'organisation, dans les limites
    de leurs règles d'accès par ligne.
  - **Journal d'audit** : table `audit_log` (au singulier). Chaque ligne porte le compte,
    l'organisation, une `action` (libellé libre) et un `details` en jsonb dont le contenu est
    choisi par la fonction qui écrit. Les lignes sont écrites **à la main, fonction par fonction**
    (une instruction `insert into public.audit_log` dans chaque fonction SQL concernée).
    Il n'existe **aucun déclencheur générique** : ni `audit_table_changes()`, ni table
    `audit_logs`, ni capture automatique de l'ancienne et de la nouvelle valeur d'une ligne
    modifiée. Les comptes connectés n'ont qu'un droit de lecture, que la règle d'accès réserve
    au super administrateur, et aucun droit d'écriture direct ; en revanche les rôles techniques
    du service gardent leurs droits d'écriture et aucun déclencheur ne bloque la modification
    ou la suppression d'une ligne (le journal n'est donc pas « append-only » par construction).
    Une règle de conservation de 36 mois (`retention_rules`, type `journal:audit_log`) purge
    les lignes anciennes ([[RGPD]]). **Depuis le 24/10/2026** : **12 mois** en général,
    36 mois pour le contrôle interne (accès et exports de la supervision, support, purges,
    fermetures, effacements) et **10 ans** pour les preuves du contrat (commande,
    confirmation, résiliation, mise en demeure, rétractation, confirmations de signature)
    — [[Durées de conservation]]. Deux tables nouvelles sont, elles, **en ajout seul par
    construction** (déclencheurs) : `versions_conditions` et `retractations_abonnement`.

## Portée
- Principe visé pour toutes les tables métier ([[Bien]], [[Incident]], [[Document]], [[Organisation]]…) ;
  réalisé aujourd'hui sur les seules tables listées dans « Fondement » ci-dessus.

## Paramètres / valeurs
- Index uniques conditionnés sur `where archived_at is null` (unicité valable pour les actifs).
- Historiques **par module**, tables distinctes : `incident_evenements`, `abonnement_evenements`,
  `signature_evenements`, `artisan_evenements_prives`, `retours_historique`,
  `orchestration_history`, `automation_events`, et les journaux d'accès `acces_pieces_log` et
  `tech_log`. Le journal `audit_log` est transversal mais **partiel** : il ne contient que les
  actions pour lesquelles une fonction écrit une ligne (adhésions, invitations de locataires,
  suppression d'un encaissement, biens retirés ou rétablis, détentions supprimées ou rouvertes,
  contre-écritures, abonnement, ouverture / suspension / archivage d'organisation, traversée
  du super administrateur, relais de supervision, décisions du dirigeant, etc.).

## Conséquences si non respectée
- Perte de traçabilité et de réversibilité ; risque juridique (conservation des preuves).

## Implications pour l'application
- Statut « archivé » plutôt que suppression dans les UI des objets qui ont une colonne
  d'archivage (biens, diagnostics, personnes, organisations).
- Journalisation des actions sensibles : **à écrire explicitement** dans chaque fonction qui
  modifie une donnée sensible. Une nouvelle fonction sensible qui n'écrit pas dans `audit_log`
  ne laisse aucune trace dans ce journal.
- Voir [[Isolation multi-organisation]], [[Plan de reprise d'activité]].

> [!warning] Points à trancher / contradictions
> - **Piste d'audit générique (X01, fiche AUD-A-05).** La version précédente de cette page
>   décrivait une table `audit_logs` alimentée par un déclencheur `audit_table_changes()`
>   (ancienne et nouvelle valeur) et un `DELETE` réservé au super administrateur. Cela n'a
>   jamais été livré : la page est corrigée pour dire ce que fait le code. Décision du
>   dirigeant (14/10/2026) : corriger le wiki maintenant, livrer un déclencheur générique
>   « plus tard » (estimation de 3 à 5 jours, sur les tables sensibles : écritures, détentions,
>   baux, retenues), sans date fixée. Tant qu'il n'existe pas, une suppression ouverte aux
>   gérants sur une table sans ligne d'audit explicite n'est pas tracée.
> - Le principe « on archive, on ne supprime pas » vaut en pratique pour les seules tables
>   qui ont une colonne d'archivage ; ailleurs, la suppression existe selon les droits listés
>   plus haut.
> - **24/10/2026 — la fin du cycle existe désormais pour les comptes** : fermeture sur demande
>   et suppression après 24 mois sans connexion ni abonnement (règle inactive jusqu'à la V1
>   des conditions) ; un compte payant ne se supprime pas sans archive de la preuve de son
>   contrat ([[Fermeture de compte]]). Une simple résiliation ne supprime rien.

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.
