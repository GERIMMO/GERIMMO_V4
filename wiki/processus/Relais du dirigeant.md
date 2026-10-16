---
type: process
tags: [supervision, relais, alerte, e-mail, arret-urgence, automatisation]
status: draft
created: 2026-10-16
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Complément à la page « Décisions groupées » — fiches de la vague 6]]", "[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]", "[[Prompt de passation à Codex — état du 14 octobre 2026]]"]
---

# Relais du dirigeant

**En une phrase :** quand la supervision n'a pas l'écran sous les yeux, Gerimmo prévient
le dirigeant par e-mail : un e-mail quotidien à 5 h (heure de Paris) s'il y a quelque
chose à signaler, et un e-mail immédiat pour chaque urgence du mode vacances.

> [!info] Statut au 16/10/2026
> Décision D46-B, **partie alerte** : tranchée par le dirigeant le 15/10/2026 (journal
> `log.md`, entrée « decision » du 15/10, point 2), **en production depuis le 16/10/2026**
> (PR #192, fusion `a722f94`, migrations `20261014810000`, `20261014811000` et
> `20261014812000`). Le premier passage de la tâche des urgences (16/10, 05 h 10 UTC) a
> reçu une réponse HTTP 200 du serveur. **Aucun e-mail de 5 h n'est parti le 16/10** : le
> relais n'était pas encore en ligne à cette heure (journal, entrée « deploy » du 16/10).
> Le premier e-mail de 5 h est donc attendu le 17/10 au plus tôt, et **aucun envoi réel
> d'e-mail du relais n'a encore été constaté**.

## Déclencheurs
- **Chaque matin** : Vercel appelle la route `/api/cron/relais` à 03 h et à 04 h UTC
  (`app/vercel.json`, entrées `?creneau=ete` et `?creneau=hiver`). Seul l'appel qui tombe
  **à 5 h à Paris** agit (03 h UTC en heure d'été, 04 h UTC en heure d'hiver) ; l'autre
  répond « hors créneau ». La décision vient de l'horloge, pas de l'étiquette.
- **Toutes les 10 minutes, jour et nuit** : la tâche `pg_cron` `relais-urgences`
  (« `*/10 * * * *` ») appelle la même route en mode « urgences » par `pg_net`, avec son
  propre jeton généré en base (jamais affiché). C'est la **dixième tâche `pg_cron`** de la
  base.
- **Ailleurs, dans la foulée d'une urgence posée** : chaque passage de mission
  (`/api/cron/equipes`), le passage de 5 h, et les deux gestes de la console qui en posent
  (« Actualiser », « Signaler une urgence interne »).

## Acteurs
- **Le dirigeant**, responsable du relais (décision du 15/10) et seul destinataire, sur
  **deux adresses fournies par le dirigeant, gardées hors du dépôt** (le dépôt GitHub est
  public) dans une variable d'environnement du serveur. Il est aussi le
  [[Super Admin]] qui lit la console.
- Le système : la route serveur, la tâche `pg_cron`, la base (sentinelle, files, registres).

## Étapes

### 1. L'e-mail quotidien de 5 h
1. L'appel vérifie qu'il est 5 h à Paris, puis **réserve le jour de Paris** en base : appelé
   deux fois, il n'envoie qu'une fois par jour. Une reprise n'est permise qu'après un échec
   d'envoi, un relais non configuré ou une passe restée « en cours » plus de 10 minutes,
   trois tentatives au plus.
2. Il actualise le relais du mode vacances (comme chaque passage de mission), envoie tout de
   suite les urgences que cela vient de poser, puis lit ce qu'il faut signaler.
3. **Rien à signaler ni à rappeler : aucun e-mail.** Sinon, un e-mail par adresse, chacun
   avec une clé d'envoi stable pour le jour (une reprise ne fait pas partir un second
   message chez le fournisseur). Objet : « Gerimmo — relais de 5 h : N point(s) à
   vérifier ».
4. Le résultat est consigné (nombres seulement) dans le registre `relais_alertes_envois`.

### 2. L'e-mail immédiat des urgences
1. Une **urgence du relais** est une **alerte nouvelle du mode vacances**
   (`supervision_alertes_internes`) : un responsable qui perd son habilitation, un passage
   des équipes « à reprendre » ou « interrompu », une lecture autorisée bloquée, ou un
   signalement fait à la main par un superviseur dans la console.
2. Un déclencheur la met en file (`relais_urgences`) avec sa seule **nature** et son heure,
   jamais son titre (que la console laisse écrire librement).
3. Le passage suivant envoie un e-mail qui regroupe les urgences en attente (50 au plus),
   **une seule fois** par urgence, objet « Gerimmo — urgence du relais » (ou « N urgences
   du relais »).
4. **Plafond anti-rafale** : 6 envois au plus par heure glissante. Le surplus attend et part
   groupé dans l'envoi suivant ou dans l'e-mail de 5 h : **jamais perdu**. Un envoi en échec
   est repris (trois tentatives au plus), puis abandonné ; ses urgences restent au rappel
   de 5 h.
5. **Délai** : au plus **11 minutes** entre l'événement et l'e-mail en marche normale
   (10 minutes entre deux passages, plus le passage lui-même). Une urgence signalée à la
   main dans la console part aussitôt.

## Ce que l'e-mail contient, et ce qu'il ne contient pas
| L'e-mail de 5 h signale (en nombres) | Jamais dans aucun des deux e-mails |
|---|---|
| Les alertes du mode vacances non accusées (ouvertes, escaladées, non acheminées) | Un nom, une adresse, un montant |
| Les tâches en échec ou absentes sur les dernières 24 h : tâches `pg_cron` (dont le passage des urgences s'il n'atteint plus le serveur depuis 30 minutes), missions planifiées, suivi des dossiers, **sauvegarde quotidienne** | Le titre d'une alerte (texte libre) |
| Les arrêts d'urgence actifs (clé et date) | Le motif d'un arrêt (texte libre) |
| Le rappel des urgences des dernières 24 h (nature, heure, sort de leur e-mail immédiat), même déjà envoyées | Une donnée de locataire |
| Un lien vers la console | — |

Le message ne porte que des compteurs, des libellés de tâche (constantes de
l'application) et ce lien (`app/src/lib/relais-alerte.ts`). Les registres
(`relais_alertes_envois`, `relais_urgences_envois`) n'acceptent que des nombres.

## L'arrêt d'urgence ne coupe pas le relais
- Ni l'e-mail de 5 h, ni l'e-mail immédiat, ni la tâche `relais-urgences` ne lisent l'arrêt
  d'urgence, **même « global »**. Motif écrit dans le code (`relais-alerte-envoi.ts`) :
  l'arrêt retient les **effets sur les personnes et les tiers** (e-mails aux locataires,
  Facebook, Stripe, suppressions) ; le relais n'écrit qu'au dirigeant, sans nom ni montant,
  et un arrêt actif est justement l'un de ses sujets — coupé par l'arrêt, il ne pourrait
  jamais dire qu'un arrêt oublié tient tout le produit à l'arrêt.
- La tâche `relais-urgences` est donc recensée **à part**, dans
  `supervision_taches_hors_arret` : l'arrêt couvre neuf des dix tâches `pg_cron`
  (`app/docs/sauvegarde-et-restauration.md`). L'écran « Relais et arrêts » le dit dans
  « Ce que l'arrêt ne couvre pas ».

## Où cela se règle
- **Les adresses** : variable `GERIMMO_RELAIS_EMAILS` de Vercel (production), posée hors du
  dépôt le 16/10 (journal, entrée « deploy » du 16/10). Pour faire taire le relais, on vide
  cette variable ; l'écran dit alors « relais non configuré ».
- **La console** : `/admin/relais` (« Relais en mon absence »), section « Alerte e-mail du
  relais » : nombre d'adresses (forme **masquée**), canaux, ce qu'ils signalent, date et
  résultat du dernier passage et du dernier e-mail de 5 h ; avertissement si aucun passage
  depuis plus de 26 heures.
- **La tâche des urgences** : interrupteur en base (table `declencheur_relais_urgences`) ;
  sans `pg_net` ou interrupteur coupé, elle ne fait rien et l'e-mail de 5 h reste le filet.
  Si le passage fréquent ne fonctionne pas, les urgences ne sont plus constatées qu'au
  passage des équipes, chaque matin entre 4 h et 12 h (heure de Paris), ou quand on
  actualise le relais.

## Ce qui n'est pas couvert
- **Ce qui n'est pas une urgence** (reste à l'e-mail de 5 h) : l'escalade d'une alerte déjà
  posée, les tâches en échec ou absentes, l'arrêt d'urgence actif.
- **Les incidents urgents déclarés par un locataire** n'alimentent pas le relais : une
  urgence du relais n'est qu'une alerte interne du mode vacances (en-tête de la migration
  `20261014811000`). L'option B de D46 prévoyait une alerte vacances alimentée par les
  incidents urgents : non livrée.
- **Hors périmètre de la décision du 15/10** : les règles « Ce qui peut continuer seul »
  (décision 7 du document « Équipes IA », non tranchée) et l'arrêt d'urgence du webhook de
  signature.
- Les alertes déjà posées avant le déploiement ne font partir aucun e-mail immédiat.

## Règles et contraintes
- Jour de référence : le **jour de Paris** pour la réservation de l'e-mail quotidien
  ([[Le jour de référence est le jour de Paris]]).
- Conservation : six mois pour les registres du relais, alignée sur la durée des registres
  d'exécution (décision D48) — purge codée dans les fonctions du relais
  ([[RGPD]], section « Durées décidées les 14 et 15/10/2026 »).

## Implications pour l'application
- Voir aussi [[Plan de reprise d'activité]] (la sauvegarde quotidienne fait partie de ce que
  signale l'e-mail de 5 h) et [[Gerimmo en autonomie]].

> [!warning] Points à trancher / contradictions
> - **Non vérifié** : aucun e-mail du relais n'a encore été reçu (premier e-mail de 5 h
>   attendu le 17/10 au plus tôt) ; l'heure réelle d'arrivée reste à constater. Vercel ne
>   lance pas ses tâches à la minute près : l'appel n'agit que s'il est encore 5 h à Paris à
>   son arrivée ; arrivé après 6 h, rien ne part ce jour-là (règle `estHeureDuRelais`).
> - **Non vérifié** : la route de 5 h est bornée à 60 secondes sans délai maximal par envoi
>   (constat du tour final de vérification) ; un fournisseur d'e-mail lent pourrait couper le
>   passage.
> - **À faire ratifier par le dirigeant** (relectures du lot) : le passage toutes les
>   10 minutes, jour et nuit, non coupé par l'arrêt d'urgence, est une interprétation de
>   « envoi immédiat pour les urgences » et une exception à l'arrêt d'urgence (D06-A).
> - **Questions des lots** : un e-mail chaque jour tant qu'une alerte ou un arrêt persiste,
>   est-ce voulu ? Un e-mail immédiat à l'escalade ? Les incidents urgents des locataires
>   doivent-ils déclencher l'e-mail immédiat ? Inscrire les registres du relais au catalogue
>   `retention_rules` (aujourd'hui purgés par leurs propres fonctions) ?
> - **Changement d'heure du 25/10/2026** : l'appel de 04 h UTC prend le relais ; à
>   surveiller.
