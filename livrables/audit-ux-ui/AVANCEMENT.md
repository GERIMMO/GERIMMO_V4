# Audit UX/UI — suivi d'avancement (reprise possible)

Version auditée : **dca396418053c9edb01351a6dd5b39dd9a087dc4**. Banc fictif local (base `gerimmo_ci_lottrois`,
données de parcours et recette v1-bailleurs, comptes fictifs). Téléphone (390) et tablette (768) simulés.

## Méthode de reprise

1. Les écrans à auditer sont listés dans `donnees/liste-ecrans.json` (identifiant, profil, adresse, nom).
2. Chaque écran évalué a sa ligne dans `donnees/evaluations.json` et sa planche dans `captures/<id>.jpg`.
3. Un écran sans ligne dans `evaluations.json` reste **à faire** : reprendre à partir du premier identifiant manquant.
4. Les observations détaillées de chaque lot sont dans `lots/`.

## Lots

| Lot | Écrans | État |
|---|---|---|
| 1 — Entrée (inscription, connexion, liens) | E01–E09, + E04 et L00 (parcours d'invitation) | Fait |
| 2 — Super-admin, partie 1 | S01–S19 | Fait |
| 3 — Super-admin, partie 2 | S20–S38 | Fait |
| 4 — Propriétaire, partie 1 | P01–P19 | Fait |
| 5 — Propriétaire, partie 2 | P20–P38 | Fait |
| 6 — Propriétaire débutant, compte vide, fiches | P39–P53 | Fait |
| 7 — Locataire | L01–L24 (sans bail actif L01–L13, bail actif L14–L24) | Fait |
| 8 — Artisan | A01–A25 (dont A21–A25 : états de mission obtenus sur le banc local) | Fait |
| 9 — Synthèse, recommandations, plan, verdict | — | En cours |
