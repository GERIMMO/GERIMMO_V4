---
type: process
tags: [agences, liste-attente, site-vitrine, console, rgpd, lancement, prospects]
status: draft
created: 2026-10-20
updated: 2026-10-24
sources: ["[[Audit final avant publication — 19 octobre 2026]]", "[[Registre des traitements]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Prospection commerciale]]", "[[Durées de conservation]]", "log.md — entrées « decision » du 23/10/2026 (valeurs par défaut du plan) et « deploy » du 24/10/2026 (PR #246)"]
---

# Liste d'attente des agences

**En une phrase :** une agence de gestion locative qui visite le site vitrine laisse ses
coordonnées pour être prévenue de l'ouverture de l'offre « agences » ; rien ne lui est
envoyé, et c'est le dirigeant qui la recontacte lui-même depuis la console.

> [!info] État au 20/10/2026 au soir : déployé en production (PR #227, fusion `4ba53f5`, migration `20261020120000` appliquée à 21 h 48 UTC, déploiement Vercel `dpl_FSd8B1L4vbodoQkXpAPUdMZ9BWpR`, recette 39508957256)
> Cette page décrit la fonctionnalité **telle que le contrat commun du 20/10 la définit**
> (quatre lots : table, action serveur, console, site) et telle qu'elle est préparée dans
> le dépôt. Elle a été déployée le 20/10 au soir par le protocole habituel (sauvegarde
> 39501178106, simulation 39501366981, application 39503252285, fusion `4ba53f5`, recette
> 39508957256 — [[Recette de production]]). Les points qui relèvent du droit sont signalés
> « à relire par le juriste » ; aucun n'est tranché ici.

## Contexte

- **Les agences sont hors de la V1 publique depuis le 13/10/2026.** L'audit du 13/10 a
  retiré l'offre aux agences du site public (fiches PUB-01 et PUB-02 du
  [[Registre des anomalies — audit du 13 octobre 2026]], mise en production du 14/10) ; le
  code et l'espace `/agence` sont conservés. La V1 publique s'adresse aux propriétaires
  bailleurs et aux SCI ([[Prêt à démarcher]], § 5 : « Offre aux agences : hors du site
  public de la V1 »).
- **Décision du dirigeant du 20/10/2026** : il commence la publicité dans son entourage ;
  la **sortie officielle est visée le 30 novembre 2026**, et le **premier client particulier
  doit pouvoir s'inscrire le 30/11 au soir** ([[Calendrier de lancement — 30 novembre 2026]] :
  jalons semaine par semaine). D'ici là, les agences doivent pouvoir
  **s'inscrire sur une liste d'attente** pour être prévenues quand leur offre sera
  disponible (site vitrine et formulaire à mettre à jour).
- **Ce que la liste d'attente n'est pas** : aucun prix ni aucune date d'ouverture ne sont
  annoncés à l'agence ; aucun e-mail de confirmation ne lui est envoyé ; ce n'est pas la
  demande de contact commerciale du site (`demandes_devis`, écran « Demandes de contact »
  de la console, [[Registre des traitements]] P4), ni la liste d'attente des visiteurs du
  29/09 (`liste_attente`, voir plus bas).

## Déclencheur
- Une agence (dirigeant, gestionnaire ou collaborateur — [[Administrateur d'agence]],
  [[Agent immobilier]]) arrive sur le site vitrine et veut être prévenue de l'ouverture de
  l'offre aux agences.

## Acteurs
- **Le visiteur** : représentant d'une agence de gestion locative (prospect professionnel).
- **Le dirigeant**, en tant que [[Super Admin|super-administrateur]] : seul lecteur de la
  liste, seul à recontacter.
- **Le site et l'action serveur** : enregistrent l'inscription avec la clé de service.

## Étapes — le parcours du visiteur

1. **Arrivée sur `/agences`**, page publique du site vitrine (en-tête `public-page-intro`,
   déclarée dans `PUBLIC_PATHS` de `app/src/proxy.ts` et dans le plan du site
   `app/src/app/sitemap.ts`). Elle est annoncée par une section et une question fréquente
   de l'accueil, un article de la page `/tarifs`, un lien du pied de page, et un paragraphe
   factuel de `/confidentialite` (à relire par le juriste). Aucune promesse de prix ni de
   date.
2. **Le formulaire** (champs du module commun `app/src/lib/liste-attente-agences.ts`) :

   | Champ | Obligatoire ? | Ce qui est accepté |
   |---|---|---|
   | `agence` — nom de l'agence | oui | 1 à 120 caractères une fois les blancs retirés, sans caractère de contrôle |
   | `contact` — nom de la personne | oui | 1 à 120 caractères, sans caractère de contrôle |
   | `email` — adresse électronique | oui | format `quelquechose@domaine.xx`, 254 caractères au plus, une seule arobase, aucun blanc (ASCII ou Unicode), aucun caractère de contrôle ; insensible à la casse |
   | `telephone` | non — « (facultatif) » | 40 caractères au plus |
   | `code_postal` | oui | cinq chiffres (les espaces tapés sont retirés) |
   | `nb_lots` — tranche de lots gérés | oui | « Moins de 50 lots », « De 50 à 199 lots », « De 200 à 499 lots », « 500 lots et plus » (codes `moins_de_50`, `50_a_199`, `200_a_499`, `500_et_plus`) |
   | `message` | non — « (facultatif) » | 1 000 caractères au plus ; le saut de ligne est admis, aucun autre caractère de contrôle |
   | `site` — pot de miel | caché | s'il est rempli (robot), le site affiche le succès **sans rien écrire** |

3. **Ce qui est refusé, et pourquoi** : la validation est faite une première fois par
   l'action serveur (`validerInscriptionAgence`, message en français dans l'ordre des
   champs : « Indiquez le nom de votre agence. », « Indiquez une adresse e-mail valide :
   c'est là que nous vous écrirons. », « Indiquez le code postal de l'agence : cinq
   chiffres. », « Indiquez le nombre de lots que vous gérez. », longueurs dépassées…), puis
   une seconde fois **par la base** (contraintes `check` identiques, voir la table). Les
   bornes protègent la base et l'écran de la console contre les saisies hors format, les
   caractères invisibles et les volumes anormaux ; elles ne portent aucun jugement sur
   l'agence.
4. **Enregistrement** par l'action serveur `inscrireAgence` (`app/src/app/actions/liste-attente-agences.ts`),
   avec la **clé de service** (`clientDeService()`), `source` = `/agences`, `statut` =
   `en_attente`. Aucune écriture anonyme : décision X02 de
   [[Décisions groupées — version candidate du 13 octobre 2026]] (le formulaire de contact
   du site écrit déjà ainsi depuis le 14/10).
5. **Ce que voit le visiteur** :
   - en cas de succès : « Merci ! Votre agence est sur la liste d'attente. Nous vous
     écrirons dès l'ouverture de l'offre aux agences, sans autre sollicitation. » ;
   - si l'adresse est **déjà inscrite** (doublon, code PostgreSQL `23505`) : **le même
     message de succès** — le site ne révèle jamais qu'une adresse est connue ;
   - si la clé de service manque : « Le formulaire est momentanément indisponible.
     Réessayez dans quelques minutes. » ;
   - si le plafond est atteint : « Le formulaire reçoit beaucoup d'inscriptions en ce
     moment : réessayez dans une heure. » (refus de la base, rendu sans jargon) ;
   - toute autre erreur de la base : son message, débarrassé du jargon technique
     (`sansJargon`).
6. **Aucun e-mail n'est envoyé à l'agence** — ni confirmation, ni relance. Le seul contact
   viendra du dirigeant, à l'ouverture de l'offre.

## La table `liste_attente_agences`

Migration `20261020120000_liste_attente_agences.sql` (retour :
`app/supabase/retours-arriere/20261020120000_liste_attente_agences.retour.sql`).

| Colonne | Type | Borne |
|---|---|---|
| `id` | `uuid`, clé primaire | `gen_random_uuid()` |
| `email` | `text not null` | format d'adresse (insensible à la casse), ≤ 254, une seule arobase, ni blanc ASCII ni caractère de contrôle ni blanc Unicode (mêmes caractères littéraux que `liste_attente_email_borne` du 19/10) |
| `agence`, `contact` | `text not null` | ≤ 120, non vides une fois les blancs retirés, sans caractère de contrôle |
| `telephone` | `text` | null ou ≤ 40, non vide, sans caractère de contrôle |
| `code_postal` | `text not null` | cinq chiffres |
| `nb_lots` | `text not null` | l'un des quatre codes de tranche |
| `message` | `text` | null ou ≤ 1 000, non vide, aucun caractère de contrôle sauf le saut de ligne |
| `source` | `text` | null ou ≤ 80 (page d'origine : `/agences`) |
| `statut` | `text not null`, défaut `en_attente` | `en_attente`, `contactee`, `convertie`, `retiree` |
| `contactee_le` | `timestamptz` | date du dernier passage à « Contactée » (posée à chaque marquage, conservée lors d'une remise en attente) |
| `created_at` | `timestamptz not null` | `now()` |

- **Index** : unique sur `lower(email)` (`liste_attente_agences_email_lower_idx` — le doublon
  à casse différente est refusé) ; `liste_attente_agences_recent_idx (created_at desc)`
  pour le comptage de l'heure glissante.
- **Plafond : 30 inscriptions par heure glissante**, toutes adresses confondues, tenu par
  le déclencheur `liste_attente_agences_limiter` (modèle exact de `liste_attente_limiter`
  du 19/10 : verrou transactionnel `pg_advisory_xact_lock`, erreur `P0001`). Seuil
  technique contre les robots, pas règle métier ; il se relève par migration.
- **Déclencheur `diagnostic_artisan_lecture`**, comme sur toute table de `public` depuis le
  12/10.
- **Droits** (RLS activée) : **aucune insertion pour `anon` ni `authenticated`** — seule la
  clé de service écrit, par l'action serveur ; `authenticated` lit (`select`) et met à jour
  **les deux colonnes `statut` et `contactee_le` seulement**, sous les politiques
  `liste_attente_agences_select_sa` et `liste_attente_agences_update_sa`, réservées au
  super-administrateur (`is_super_admin()`, modèle `demandes_devis_select_sa`/`_update_sa`) ;
  `service_role` : lecture, insertion, mise à jour, suppression. Aucun autre rôle ne voit
  la liste ; la **suppression d'une ligne n'est possible qu'avec la clé de service** (aucun
  écran prévu).
- **Pas de règle `retention_rules`** : la durée de conservation est à décider par le
  dirigeant et le DPO (décision à consigner, pas à inventer — [[Registre des traitements]],
  ligne P11).
- **Retour arrière** : refuse sans rien modifier si la table contient au moins une ligne
  (décision du dirigeant requise) ; sinon supprime déclencheurs, fonction, table et la
  ligne d'historique `supabase_migrations.schema_migrations` (version `20261020120000`).

## La console : `/admin/liste-attente`

- Onglet **« Liste d'attente des agences »** de la rubrique `commercial` (« Développement
  commercial », à côté de « Développement territorial » et « Demandes de contact ») dans
  `app/src/lib/rubriques-supervision.ts` — pas de nouvelle rubrique, `RUBRIQUES` reste à 17
  ([[Suites de l'audit — 20 octobre 2026]] : les 17 rubriques sont jouées en lecture seule
  par la recette).
- **Lecture par le client de session** du super-administrateur (RLS), pas par la clé de
  service.
- **Statuts** (libellés du module commun) : `en_attente` « En attente » → `contactee`
  « Contactée » → `convertie` « Devenue cliente » ou `retiree` « Retirée à sa demande ».
- **Gestes** (boutons de la console, un formulaire par agence, sans double clic) :
  « Marquer comme contactée » (pose `contactee_le`), « Remettre en attente », « Devenue
  cliente », « Retirée à sa demande ». Depuis « En attente » ou « Contactée », on peut passer
  à contactée / en attente, devenue cliente ou retirée ; depuis « Devenue cliente » ou
  « Retirée à sa demande », seul le retour en attente est proposé. L'action serveur
  (`changerStatutAgence`) n'admet que les quatre statuts du module commun, relit la ligne
  avant d'écrire et ne tient jamais zéro ligne touchée pour un succès (statut déjà posé,
  ligne disparue ou geste refusé par la RLS : refus lisible, « rechargez la page »). Chaque
  changement est tracé au journal de supervision (`liste_attente_statut_modifie`) ; l'export
  CSV l'est aussi (`liste_attente_exportee`).
- **Export CSV protégé** (super-administrateur, après second facteur comme toute la
  console). **Depuis le 24/10** : l'export ne contient jamais les inscriptions retirées ni
  les adresses opposées (l'option « Inclure les retirées » est retirée) ; pour elles, ni lien
  de courriel ni marquage « contactée » ; si le contrôle des oppositions échoue, rien ne part.
  L'export est tracé comme un accès de la supervision (journal de contrôle interne, 36 mois).

## La différence avec `liste_attente` (29/09)

| | `liste_attente` (29/09/2026) | `liste_attente_agences` (20/10/2026) |
|---|---|---|
| Qui s'inscrit | visiteurs du site vitrine (particuliers, prospects) | représentants d'agences de gestion locative |
| Origine | table créée **hors dépôt** le 29/09 (version `20260929200141`), intégrée et bornée le 19/10 par `20261019120000_liste_attente_bornee.sql` (audit M2) | créée **dans le dépôt** par `20261020120000_liste_attente_agences.sql` |
| Qui écrit | `anon`, par la clé publiable, par colonne (`email`, `biens`, `source`) — seule écriture anonyme restante de `public` | l'action serveur avec la clé de service ; aucune écriture anonyme |
| Données | adresse, nombre de biens, page d'origine | agence, contact, adresse, téléphone, code postal, tranche de lots, message, page d'origine, statut de suivi |
| Lecture | clé de service seulement (aucun écran) | super-administrateur dans la console, export CSV |
| Plafond | 30 par heure glissante | 30 par heure glissante |
| Lignes | 0 au relevé du 19/10 | table nouvelle |
| Registre | [[Registre des traitements]] P10 | [[Registre des traitements]] P11 |
| Sort | **à décider** (décision du 20/10 : conservée pour l'instant ; 24/10 : 0 ligne, fermer l'inscription anonyme si aucun site tiers ne l’utilise — question au dirigeant, non bloquante) | déployé le 20/10 au soir (PR #227, `4ba53f5`) |
| Durée (24/10) | 36 mois depuis l'inscription (`contact:attente`, inactive) | 36 mois depuis l'inscription (`contact:attente_agences`, inactive) |

## Règles d'usage pour le dirigeant

- **Qui recontacte** : le dirigeant lui-même, depuis la liste de la console, par ses propres
  moyens (e-mail ou téléphone) ; l'application n'envoie rien.
- **Quand** : à l'ouverture de l'offre aux agences (date non fixée, non annoncée au
  visiteur). Rien n'interdit un premier contact plus tôt ; le message de succès promet
  seulement d'écrire « dès l'ouverture de l'offre aux agences, sans autre sollicitation ».
- **Pas de relance automatique**, ni de courrier d'attente, ni de lettre d'information : la
  promesse faite au visiteur est un seul courrier à l'ouverture.
- **Trace** : « Marquer comme contactée » pose `contactee_le`, date du dernier passage à
  « Contactée » (posée à chaque marquage, conservée lors d'une remise en attente) ; la
  conversion ou le retrait se notent par le statut (« Devenue cliente », « Retirée à sa
  demande »), et chaque changement de statut est tracé au journal de supervision.
- **Suppression sur demande** : si une agence demande à être retirée, la marquer « Retirée à
  sa demande » depuis la console (statut `retiree`). **Depuis le 24/10**, la ligne est alors
  supprimée et l'empreinte SHA-256 de l'adresse gardée comme opposition (trois ans,
  [[Prospection commerciale]]), même si la règle de conservation n'est pas encore active.
  Le délai et la forme de la réponse à la personne relèvent de [[RGPD]] — à relire par le
  juriste.
- **Base légale et durée (P11), décidées le 23/10** (plan juriste/DPO, valeurs par défaut
  acceptées par le dirigeant) : **intérêt légitime** (donner suite à la demande faite) ;
  **36 mois depuis l'inscription** (règle `contact:attente_agences`, compteur depuis
  l'inscription depuis le 24/10, **inactive** jusqu'à son bilan) ; inscription « devenue
  cliente » supprimée trois mois après la conversion. Le texte du formulaire et de la page
  confidentialité V1 le disent (publication des textes V1 prévue le 24/10).

## Entrées / sorties
- **Entrées :** le formulaire `/agences` (sept champs et le pot de miel).
- **Sorties :** une ligne de `liste_attente_agences` ; la liste et son export CSV dans la
  console ; aucun courrier.

## Implications pour l'application
- Le module commun `app/src/lib/liste-attente-agences.ts` (tranches, statuts, bornes,
  message de succès, validation) est la seule source des libellés et des bornes : site,
  action serveur et console l'importent ; la base porte les mêmes bornes en `check`.
- Le test `tests/robots-sitemap.test.ts` liste les adresses publiques attendues : `/agences`
  s'y ajoute.
- Le [[Relais du dirigeant]] (e-mail de 5 h) ne compte pas ces inscriptions dans le lot du
  20/10 : à décider.

## Relations
- Personas : [[Administrateur d'agence]], [[Agent immobilier]], [[Super Admin]].
- Règles : [[Registre des traitements]] (P10, P11), [[RGPD]], [[Grille tarifaire]] (barème
  agences du 28/09, non annoncé sur `/agences`).
- Synthèses : [[Calendrier de lancement — 30 novembre 2026]] (livraison du lot faite le
  20/10, visée le 23/10 ; § 5 : l'ouverture de l'offre agences est hors de la sortie du 30/11),
  [[Point d'étape — 21 octobre 2026]],
  [[Prêt à démarcher]], [[Audit final avant publication — 19 octobre 2026]] (M2),
  [[Suites de l'audit — 20 octobre 2026]],
  [[Cartographie vérifiable de Gerimmo (pages, actions, base, stockage, authentification, intégrations, rôles)]]
  (relevé des écritures `anon`, à actualiser après déploiement).
- Processus : [[Recette de production]] (le déploiement du lot y passe), [[Relais du dirigeant]].

> [!warning] Points à trancher / contradictions
> - ~~**Base légale et durée de conservation** (P11) : à décider par le dirigeant et le DPO~~ →
>   **tranché le 23/10** : intérêt légitime, 36 mois depuis l'inscription (règle créée,
>   inactive jusqu'à son bilan) — à confirmer sur Légifrance (source non ouverte le 23/10/2026).
> - **Date d'ouverture de l'offre agences** : non fixée ; rien n'est annoncé au visiteur.
> - **Grille tarifaire agences** : le barème du 28/09 ([[Grille tarifaire]], 39 € HT jusqu'à
>   10 lots puis tranches) n'est pas montré sur `/agences` ; à confirmer ou réviser avant
>   l'ouverture.
> - **Sort de `liste_attente`** (29/09, P10) : conservée pour l'instant (20/10) ; supprimer,
>   garder, ou fusionner son usage avec la V1 particuliers ?
> - **E-mail de 5 h du relais** : faut-il y compter les inscriptions d'agences en attente
>   (comme les demandes de contact depuis le 19/10, M16) ? Hors du lot du 20/10.
> - **Effacement physique** d'une ligne à la demande d'une agence : aucun écran ; geste par
>   la clé de service à décrire, ou statut `retiree` suffisant ? À relire par le juriste.
> - **Paragraphe de `/confidentialite`** et libellés du formulaire : factuels et neutres, à
>   relire par le juriste avant déploiement.
