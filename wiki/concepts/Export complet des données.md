---
type: concept
tags: [export, portabilite, rgpd, reversibilite, archive, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Fermeture de compte]]", "[[RGPD]]", "log.md — entrée « deploy » du 24/10/2026 (PR #246)", "app/src/app/agence/[orgId]/export-complet/route.ts", "app/src/lib/export-complet-serveur.ts", "app/src/lib/export-complet.ts", "app/supabase/migrations/20261024130000_fermeture_comptes.sql"]
---

# Export complet des données

**Définition :** l'**archive complète** d'un espace — un fichier ZIP qui réunit toutes ses
données et tous ses fichiers —, que le titulaire demande depuis « Mes données
personnelles » et télécharge par un lien signé. Elle complète l'export CSV du journal de
gestion et les téléchargements document par document. En production depuis le 24/10/2026
(PR #246, plan du 23/10, constat R49).

## Ce que contient l'archive
- Un fichier **CSV par table** de l'organisation (séparateur « ; », protégé contre les
  formules de tableur) ;
- le **compte** et ses **acceptations des conditions**, en JSON ;
- **tous les fichiers** de l'espace, **documents signés et certificats compris**.
Elle ne contient que ce que le titulaire **lit lui-même** : les droits de chaque table et
les règles d'accès par ligne sont rejoués avec son jeton (`lignes_lisibles_par`,
`export_complet_donnees`). Au-delà de 400 Mo, l'archive n'est pas préparée et la demande
échoue avec un message.

## Qui peut la demander, et comment
- **Le titulaire seul** (propriétaire, ou administrateur de l'agence), avec son **second
  facteur validé** ou un **mot de passe saisi depuis moins de quinze minutes** ; sinon,
  retour à la page avec deux gestes : « Se reconnecter avec mon mot de passe » et « Valider
  mon second facteur ».
- **Une demande à la fois, trois par jour au plus** (`demander_export_complet`).
- La préparation se fait après la réponse ; la mission « purge » de la nuit reprend une
  préparation interrompue ; une préparation restée en plan plus de quinze minutes reprend
  au clic suivant.
- États affichés : Demandée, En préparation, Prête, Échec, Supprimée (sept jours passés).

## Durée et traces
- Archive déposée dans le compartiment privé `exports-complets` ; **lien signé valable
  24 heures** ; **archive supprimée après sept jours**.
- Chaque demande, préparation et téléchargement est inscrit au **journal d'audit** ; chaque
  pièce sensible contenue (pièce d'identité, justificatif) l'est au **journal des accès aux
  pièces**.

## L'artisan
L'export de l'artisan (`api/artisan-prive/export`, registres privés : clients externes,
chantiers, devis, factures, règlements) est étendu à ses données de plateforme ; il passe
par la même lecture filtrée (ni le mémo d'invitation d'un propriétaire, ni le motif d'une
liste noire n'en sortent).

## Relations
[[Fermeture de compte]] (les avertissements d'inactivité renvoient vers l'archive) ·
[[Demandes sur les données et fermeture de compte]] · [[RGPD]] ·
[[Registre des traitements]] · [[Comptabilité]] (export du journal de gestion) ·
[[Artisan]]

> [!warning] Points à trancher / contradictions
> - **Article 9 des conditions** : la V1 rédigée le 23/10 omettait la phrase sur l'archive
>   complète, l'export n'étant pas encore livré ; il l'est depuis le 24/10 : la phrase est à
>   rétablir avant la publication de la V1 (« Il peut aussi télécharger une archive complète
>   de ses données (fichiers CSV) et de ses documents, y compris les documents signés et
>   leurs certificats »).
> - **Annexe article 28 de la V1** : elle prévoit une copie « sur demande écrite » pour les
>   données que les exports ne couvrent pas (geste manuel tant que l'export n'existait pas) ;
>   à relire au regard de l'archive complète.
> - **Droit d'accès et portabilité** (RGPD art. 15, 20, 28.3 g) : à confirmer sur Légifrance
>   (source non ouverte le 23/10/2026).

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.

Point résolu : l’article 9 de la V1 décrit bien l’archive complète et les documents signés. La copie sur demande reste complémentaire pour les données hors export.
