---
type: concept
tags: [conditions-generales, cgu, cgv, versions, acceptation, preuve, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Abonnement]]", "[[Registre des traitements]]", "log.md — entrées « decision » des 23/10/2026 (valeurs par défaut du plan, médiateur non bloquant, statut non commerçant) et 24/10/2026 (choix délégué n° 7), « deploy » du 24/10/2026 (PR #246)", "app/src/lib/editeur.ts", "app/src/lib/conditions-acceptation.ts", "app/src/lib/nouvelle-version-conditions.ts", "app/supabase/migrations/20261024090000_versions_conditions_et_archives_comptes.sql"]
---

# Conditions générales

**Définition :** le contrat entre l'Éditeur et le Client (propriétaire qui gère ses biens),
publié sur `/conditions` : les **conditions générales d'utilisation et de vente**. Chaque
version a une date (`CONDITIONS_VERSION`) ; depuis le 24/10/2026, chaque version publiée est
**archivée sans modification possible**, et chaque acceptation dit **quel document** a été
accepté, dans quelle version et quand.

## La version en vigueur
- **Version du 30 septembre 2026** (`CONDITIONS_VERSION = "2026-09-30"`), inchangée par la
  publication du code du 24/10 (PR #246 : « textes contractuels inchangés »).
- Articles que le code cite avec leur sens actuel : **8.10** « Rétractation » (avec son
  formulaire, « Souscrit le : »), **15** « Suspension et résiliation » (résiliation par
  l'Éditeur trente jours après une mise en demeure restée sans effet), **16** (préavis d'un
  mois avant une modification ; « la poursuite de l'utilisation vaut acceptation »),
  **7** (espaces des locataires et des propriétaires mandants), **11** (répartition des
  rôles), annexe « article 28 » (traitement pour le compte du Client).
- **Médiateur** : coordonnées non saisies au 24/10 ; elles ne bloquent ni la vente ni la
  confirmation (décision du 23/10) ; mentions légales : « Adhésion à venir ».

## La V1 : rédigée, publication prévue le 24/10
Rédigée et relue les 23 et 24/10 sur deux branches parties d'un socle ancien
(`claude/conditions-v1-2410` : conditions clients V1 et **conditions de l'espace artisan**,
articles A1 à A14 et annexe article 28 ; `lot4-confidentialite-2410` : confidentialité,
mentions légales, pages publiques). **Publication des conditions V1 prévue le 24/10** ; elles
ne sont pas en ligne au moment où cette page est écrite. Contenu principal, d'après les
rapports de rédaction :
- offre aux seuls propriétaires qui gèrent leurs biens (**agences retirées de l'offre**) ;
  l'Éditeur est « l'entrepreneur individuel identifié aux mentions légales » ;
- **3** formation du contrat, archivage et preuve (dix ans après le dernier abonnement payé ;
  supprimée avec le compte s'il n'a jamais payé) ;
- **4.7** [[Signature électronique]] (Zoho Sign, code à usage unique, aucune présomption de
  fiabilité, certificat commun ; caution qui confirme son mobile ; état des lieux confirmé
  « établi contradictoirement, sur place ») ; **4.8** compatibilité ;
- **8.6** « Résilier votre contrat » et accusé ; **8.7** avis de reconduction et encadré ;
  **8.9** et **16** accord exprès du consommateur, sinon non-reconduction ; **8.10**
  rétractation en ligne pour toutes les formules (« Commandé le : ») ;
- **9** réversibilité et conservation (24 mois sans connexion ni abonnement, avertissements
  à deux mois et quinze jours ; préavis J-30 et J-15 ; fermeture sur demande ; factures « au
  moins six ans ») ;
- **14** aucun plafond de responsabilité face au consommateur ou au non-professionnel ;
  **14 bis** garanties légales (encadré) ; **15** défaut de paiement (15.1 à 15.5) ;
- **17** médiation : coordonnées du médiateur **lues en base**, sinon « … peut recourir
  gratuitement au médiateur de la consommation, qui sera désigné aux mentions légales dès
  l'adhésion de l'Éditeur » ;
- annexe 1 (article 28 complété, sous-traitants figés) et annexe 2 (C. conso L. 215-1 à
  L. 215-3 et L. 241-3 reproduits).
Le code livré le 24/10 suit déjà ces règles ; ce que le texte promet est décrit dans
[[Souscription de l'abonnement]], [[Rétractation en ligne]],
[[Résiliation de l'abonnement]], [[Impayé de l'abonnement]], [[Fermeture de compte]],
[[Export complet des données]] et [[Durées de conservation]].

## L'archive des versions (en production depuis le 24/10)
- Table `versions_conditions`, **en ajout seul** (aucune modification ni suppression) :
  document (`conditions_clients` ou `conditions_artisans`), version, date d'effet, nature
  (substantielle ou technique), texte HTML, **identité de l'éditeur figée**, **empreinte
  SHA-256** (recalculée par la base à l'insertion), résumé des modifications ; lecture
  publique, écriture par la seule fonction d'archivage.
- **Archivage** depuis la page Santé de la console (super-administrateur permanent, second
  facteur), après chaque mise en ligne : la page servie est relue, reconstituée (flux React)
  et normalisée ; une page dégradée ou rendue avec une autre identité est refusée ; une même
  version avec une autre empreinte est refusée avec une alerte au dirigeant ; une différence
  de présentation seule n'est pas une divergence.
- Pages publiques **`/conditions/versions`** et **`/conditions/versions/{document}/{version}`**.
- Une garde de CI (`conditions-versions.json`) échoue si le texte change sans nouvelle
  version.
- **Version 2026-09-30** : à archiver depuis Santé après la mise en ligne (geste non constaté
  au 24/10) ; elle porte la mention « Archivée après sa date d'effet : texte relevé le … ;
  des corrections ont pu intervenir entre le … et cette date sous la même version » (choix
  délégué n° 7 du 24/10 : 0 acceptation en production).

## L'acceptation, selon l'espace
| Espace choisi à l'inscription | Case | Document enregistré |
|---|---|---|
| Propriétaire (Client) | « J'accepte les conditions générales d'utilisation et de vente » | `conditions_clients` |
| Artisan | « J'accepte les conditions de l'espace artisan » — **dès leur publication** ; d'ici là, l'artisan accepte les conditions clients, et la garde de son espace n'exige rien | `conditions_artisans` |
| Personne invitée (locataire) | « J'ai pris connaissance des règles d'utilisation des espaces invités (article 7 des conditions générales) » — l'invité ne contracte pas | `regles_invites` |

- La case n'est jamais pré-cochée ; elle est remontée quand son texte change (une coche ne
  survit pas à un changement de document).
- « Mon compte » affiche « Conditions acceptées : version du {date}, le {date} —
  consulter ».
- L'acceptation reçoit de la base l'**empreinte** de la version archivée au moment de
  l'acceptation (nulle tant que la version n'est pas archivée). **Pas de clé étrangère** vers
  `versions_conditions` au 24/10 : aucune version n'étant encore archivée en production, elle
  ferait échouer inscriptions et souscriptions ; une version inconnue s'enregistre donc
  toujours, et `acceptations_sans_version_archivee()` (page Santé) dit ce qui manque. La clé
  sera posée par une migration dédiée après l'archivage des versions en vigueur.
- La preuve de l'acceptation est copiée dans `archives_comptes` avant la suppression d'un
  compte payant ([[Fermeture de compte]]).

## Une nouvelle version : l'écran « Nos conditions générales évoluent »
- Affiché au responsable d'un espace dont la **dernière** acceptation porte une autre version
  que celle en vigueur ; « Plus tard » le masque jusqu'à la prochaine connexion ; il ne bloque
  rien. **Inactif au 24/10** : toutes les acceptations portent la version en vigueur.
- Pour une version **substantielle** publiée avec la règle de l'accord exprès (la V1),
  l'abonnement d'un client qui n'a pas accepté à la date d'effet **n'est pas reconduit**,
  jamais avant un mois plein après l'archivage de la version
  ([[Résiliation de l'abonnement]]). Les versions publiées avant cette règle (2026-09-30) n'y donnent jamais
  lieu.

## Relations
[[Abonnement]] · [[Souscription de l'abonnement]] · [[Registre des traitements]] (P1) ·
[[Durées de conservation]] · [[Artisan]] · [[Locataire]] · [[RGPD]]

> [!warning] Points à trancher / contradictions
> - **Textes juridiques reproduits dans la V1** (annexe 2 : L. 215-1 à L. 241-3 ; encadré
>   14 bis : modèle annexé à D. 211-4 ; formulaire de rétractation : R. 221-1) : à recomparer
>   mot pour mot sur Légifrance avant publication (source non ouverte le 23/10/2026).
> - **Durées citées par la V1** (six ans, LPF L. 102 B ; dix ans, C. conso L. 213-1) et
>   **délai de complément de l'état des lieux** (« dans les dix jours qui suivent son
>   établissement ») : à confirmer sur Légifrance (source non ouverte le 23/10/2026).
> - **À aligner avant de publier la V1** (le code a avancé depuis la rédaction) : remettre
>   « Faire une réclamation » à l'article 17 (la nature existe depuis le 24/10) ; rétablir la
>   phrase de l'article 9 sur l'archive complète ; garder « Chaque signataire reçoit un
>   exemplaire » hors du texte tant que la recette Zoho à trois signataires n'est pas faite ;
>   poser la date réelle à la place de la date provisoire « 2026-10-24 » et recalculer les
>   empreintes ; ajouter `/conditions/artisans` au plan du site ; activer ensemble
>   `VERSION_MIN_INACTIVITE` et la règle `compte:inactif`.
> - **Médiateur** : quand ses coordonnées seront saisies, le texte publié de l'article 17
>   changera ; l'archive refusera la même version avec une autre empreinte : publier alors une
>   **version technique**.
> - **Risques signalés par la relecture des textes** : l'encadré 14 bis ne couvre pas l'essai
>   gratuit ; l'article 9 du règlement P2B (2019/1150) n'est pas traité pour l'espace artisan
>   — à confirmer sur Légifrance / EUR-Lex (source non ouverte le 23/10/2026).
