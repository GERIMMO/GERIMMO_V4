---
type: business-rule
tags: [pra, sauvegarde, continuite]
status: in-progress
created: 2026-07-21
updated: 2026-10-14
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Plan de reprise d'activité

**Énoncé :** GERIMMO doit pouvoir restaurer son service après un incident majeur, sous
contrôle humain, sans jamais restaurer directement en production.

## Fondement
- En V4 : `app/docs/sauvegarde-et-restauration.md` (procédure), les deux chantiers GitHub de sauvegarde et de restauration, et `app/supabase/retours-arriere/` (retour arrière des migrations du 13/10).
- `docs/plan-reprise-activite.md` et la table `backup_registry` appartiennent à la V3 (`raw/Gerimmo-V3`) : **ils n'existent pas dans le code V4** (audit du 14/10, RET-03).

## Paramètres / valeurs
- **RPO cible : 24 h** (perte de données maximale). **RTO cible : 4 h** (temps de reprise).
- Sauvegarde **quotidienne** (Supabase), vérifiée par GERIMMO ; **vérification hebdomadaire**
  indépendante ; **test de restauration trimestriel**.

## Procédure
1. Déclarer/geler → identifier la dernière sauvegarde saine.
2. **Restaurer dans un projet isolé, jamais en prod.**
3. Vérifier migrations/contraintes/RLS/Storage/volumes + tests critiques + isolation multi-org.
4. **Validation humaine** de la bascule → basculer/surveiller/consigner.

## Règle forte
> « Aucun bouton applicatif ne restaure directement la production. » Toute restauration / SQL /
> migration / permission / Storage exige une validation humaine.

## Confirmations et ajouts du livrable A4 (2026-07-24)

Le [[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] confirme **RPO 24 h**
(RM-A4.11) / RTO 4 h et ajoute :
- ~~rétention 30 jours glissants~~ → **rétention 90 jours glissants**, décision du porteur du 27/09 (règle de cycle de vie du compartiment Scaleway) : elle couvre une erreur découverte tardivement, au prix d'une copie plus longue des données — voir [[Registre des traitements]] ;
- sauvegardes **chiffrées** (RM-A4.6) ;
- **test de restauration annuel, documenté** (RM-A4.12, bloquant) : restaurer
  réellement dans un environnement séparé, vérifier complétude et cohérence,
  consigner — « une sauvegarde jamais testée n'est pas une sauvegarde ».
  **Premier test avant mise en production** ;
- trois cas de restauration : incident technique (plateforme, [[Super Admin]]) ·
  **erreur humaine dans une agence** (une agence, une table — SA sur demande) ·
  suppression accidentelle isolée → **corbeille applicative** (3 mois, RM-0b.8.5),
  qui évite de mobiliser une restauration.

> [!info] État vérifié le 14/10/2026 (audit)
> Voir [[Dossier sécurité et restauration — retour arrière des migrations du 13 octobre 2026]] : la sauvegarde puis la restauration du programme du dépôt
> ont été essayées **sur le banc local** (volumes et droits conservés ; le schéma `cron`, l'historique des migrations et les commentaires SQL sont absents de la copie
> restaurée). **Aucune sauvegarde de production n'est qualifiée de valide** : aucun essai de restauration de production n'a été fait pendant l'audit.

## Implications pour l'application
- Registre de sauvegardes + procédures documentées. Voir [[RGPD]],
  [[Archivage plutôt que suppression]], [[Socle de sécurité]].

> [!warning] Points à trancher / contradictions
> - **Fréquence du test de restauration** : le code prévoit un test **trimestriel**
>   (`docs/plan-reprise-activite.md`), A4 acte un test **annuel** (RM-A4.12). Le code
>   est plus exigeant que la cible — à harmoniser.
