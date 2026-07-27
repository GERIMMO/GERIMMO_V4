---
type: persona
tags: [role, plateforme]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-12-documents-et-ged]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]", "[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Super Admin

**En une phrase :** administrateur de la plateforme GERIMMO elle-même (l'éditeur),
au-dessus de toutes les [[Organisation|organisations]] clientes.

Nom technique : rôle `super_admin` (scope `global`) + drapeau `profiles.is_super_admin`.
Fonction SQL `is_super_admin()` qui court-circuite quasi toutes les policies RLS.

## Rôle et objectifs
- Superviser l'ensemble du réseau (toutes organisations).
- Piloter le business : abonnements, revenus, paiements, offres, codes promo.
- Valider les nouveaux entrants ([[Artisan|artisans]]) et administrer le système.

## Responsabilités / activités
- Gestion des agences, propriétaires, artisans ; **validation des artisans** (réservée).
- Imports de biens/utilisateurs ; statistiques (croissance, acquisition, rétention).
- Support (bugs, idées), communication (articles, alertes), système (bots, sécurité,
  journal d'audit, centre IA).
- Supervision/**impersonation de tous les types de personas** (précision humaine, 2026-07-22) :
  il peut se mettre à la place d'une agence, d'un [[Propriétaire bailleur]], d'un [[Artisan]],
  d'un [[Locataire]] — de n'importe quel persona (console dédiée `/admin/*`).

## Import en masse du parc (référentiel V3 — parcours 0.12)
« **Parcours décisif commercialement** : aucune agence ne migre si elle doit ressaisir
300–800 lots à la main — sinon le produit est invendable. » Réservé au super admin
(RM-0.12.9 ; l'admin agence a le 16.3 pour les ajouts ponctuels) :
- gabarit Excel **à format imposé** (décision actée), 9 feuilles importées dans l'ordre
  des dépendances (personnes → biens → lots → détentions → clés → diagnostics →
  mandats → baux en cours → soldes de départ) ;
- **import à blanc** (contrôles sans écriture), prévisualisation avec compteurs,
  exécution en **transaction atomique** (RM-0.12.1), > 20 % de lignes en erreur =
  refus en bloc (RM-0.12.4) ;
- chaque donnée porte l'**identifiant de son import** → **annulation complète**
  possible tant que rien n'a été modifié (RM-0.12.6/7) ; rapport conservé **3 ans**
  (aligné sur le journal d'audit — décision du 2026-07-25, corrige l'« indéfiniment »
  contraire à RM-A2.2).
- Connecteurs vers les logiciels concurrents : reconsidérés en V2 (argument commercial).

## Administration V3 (module 18)
- **Console de supervision unique** : indicateurs (agences actives/essai/suspendues,
  lots gérés = base de facturation, volumes) et **six files d'attente** (demandes de
  modèles, contestations de notes, modèles WhatsApp, bugs, correctifs, idées).
- **Facturation (18.6)** : comptage automatique des lots sous mandat au dernier jour
  du mois → Stripe prélève et facture ; paliers agences / par bien PD ; mise en
  route + mensuel + redevance annuelle ; échec → relance puis **suspension en lecture
  seule** (export toujours possible), résiliation → **archivage jamais suppression**,
  réactivation par lui seul.
- Met à jour les **seuils légaux** des alertes (RM-14.2.5) et crée les agences (16.1).
- **[[Retours utilisateurs]]** (module 20) : trie les signalements (bug /
  incompréhension / idée — réponse dans tous les cas), **transmet les bugs confirmés
  au suivi technique sans jamais corriger depuis l'administration** (RM-20.3.1/2 —
  « il pilote le produit, pas le code »), anime la **revue mensuelle des idées**
  (classement auto, trois statuts jamais le rejet) et publie les articles.

## Autres prérogatives V3
- **Modèles de documents** (module 12) : les modèles sont **figés** — c'est lui qui
  valide et génère tout modèle propre demandé par une agence (vérification des
  mentions obligatoires) et met à jour les modèles réglementaires pour toutes.
- **Blacklist globale d'artisan** (module 8) et **arbitrage des contestations de
  note** (module 11 — accès exceptionnel au détail, tracé).

## Sécurité : le rôle le plus contraint (A4, 2026-07-24)
Le compromis de son compte exposerait **toutes les agences** — d'où le régime le plus
strict du [[Socle de sécurité]] : **MFA obligatoire** (RM-A4.1, bloquant — seul rôle
où il l'est), session la plus courte (**30 min d'inactivité / 8 h absolu**), toute
**traversée d'agence journalisée** (RM-A1.11, audit 3 ans). Il pilote la **chaîne
d'incident de sécurité** (qualification 2 h, confinement 4 h, information des agences
sans délai) et décide des **restaurations** de sauvegarde (plateforme entière, ou une
agence/une table sur demande — [[Plan de reprise d'activité]]).

## Permissions clés
- Accès total : `is_super_admin()` bypass global sur SELECT/INSERT/UPDATE/DELETE.
- **Seul** habilité à valider/refuser un artisan (`artisan_validations`).
- **Seul** habilité au `DELETE` réel des données métier (les autres archivent).

## Relations
- Chapeaute [[Administrateur d'agence]], [[Propriétaire bailleur]] indépendants et [[Artisan|artisans]].
- Voir [[Modèle de rôles et permissions]], [[Isolation multi-organisation]].

> [!warning] Points à trancher / contradictions
> - `docs/02-roles-permissions.md` liste des rôles fictifs (Gestionnaire, Collaborateur,
>   Lecteur…) absents du code. La vérité = 6 rôles du `seed.sql`.
>