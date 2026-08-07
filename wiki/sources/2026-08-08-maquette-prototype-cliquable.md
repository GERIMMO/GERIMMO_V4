---
type: source
tags: [charte, visuel, maquette, prototype, ux, alertes]
status: stable
created: 2026-08-08
updated: 2026-08-08
sources: []
source-file: raw/maquettes/2026-08-08-gerimmo-prototype.html
source-type: maquette HTML cliquable
source-date: 2026-08-08
---

# Maquette — prototype cliquable Gerimmo (août 2026)

**En une phrase :** prototype HTML autonome (~3 700 lignes) réalisé par l'humain,
couvrant tous les écrans du produit avec données fictives — désigné le 2026-08-08
comme **référence de la charte graphique** (« charte v2 ») à appliquer à
l'application, en remplacement de la [[Charte visuelle de l'espace agent]] du 03/08.

## Ce que la maquette fixe

- **Palette** : encre bleue profonde `#14304F` (bandeau, titres, aplats), laiton
  `#C9A227` (liseré actif, pastilles, boutons d'action), crème `#FAF7F0` (fond de
  page), cartes blanches, filets `#E4DCCA`, ardoise `#E8EEF4` (sélection), bleu
  `#2F6FB0` (liens) ; états : rouge `#A32D2D`, ambre `#BA7517`, vert `#0F6E56`
  chacun avec un fond doux.
- **Polices** : Cormorant Garamond (titres, chiffres clés, marque), Instrument
  Sans (interface — remplace Jost), IBM Plex Mono (libellés capitales, eyebrows).
- **Chrome** : bandeau encre avec marque + contexte d'espace + cloche/compte, puis
  onglets sombres soulignés laiton ; badge rouge sur l'onglet Alertes.
- **Composants** : tuiles KPI à liseré et jauge en segments, puces de statut à
  fond doux, rangs d'alerte à liseré de criticité, filtres en pastilles, modales
  à tête encre, écran de connexion en deux volets (panneau encre / formulaire).
- **Écrans** : connexion, choix d'espace, tableau de bord, alertes, parc, fiches
  bien/lot, personnes, comptabilité, documents, incidents, planning, éditorial…

## Application (2026-08-08)

Charte portée dans `app/` sur le périmètre validé bloc 0 → S3 : jetons de
`globals.css` (marque blanche préservée : les composants ne portent aucune couleur
en dur), layout agence, connexion, espaces, tableau de bord, alertes, parc.
La maquette a aussi servi de spécification au retour recette sur les
[[Module 14 — agenda et alertes|alertes]] : assignation obligatoire, « Tout le
monde », alertes confiées grisées, modale de traitement.

> [!warning] Points à trancher / contradictions
> - La maquette montre des modules non développés (incidents, planning,
>   messagerie, éditorial) : elle sert de cible visuelle, pas de spécification
>   fonctionnelle validée pour ces modules.
> - Le logo reste un repère provisoire redessiné d'après la maquette — les
>   fichiers officiels `logo/` n'ont jamais été transmis.
