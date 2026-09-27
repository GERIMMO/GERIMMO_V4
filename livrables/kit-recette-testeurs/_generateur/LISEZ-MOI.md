# Générateur du kit de recette

Tout le kit (`../`) est **produit par ce dossier** : documents fictifs, images,
fiches de tests, fiches « Mon personnage », fiche de remontée, guide du
coordinateur, tableaux de suivi Excel et archives ZIP à envoyer.

## Régénérer

```bash
cd livrables/kit-recette-testeurs/_generateur
pip3 install pillow openpyxl markdown pymupdf   # une fois
python3 generer_kit.py
```

Chrome est nécessaire (rendu HTML → PDF et PNG, comme les documents de
l'application). Il est trouvé seul sur macOS et Linux ; sinon, indiquer son
chemin dans la variable `KIT_CHROME`.

## Où modifier quoi

| Fichier | Contenu |
|---|---|
| `univers.py` | Les personnages, entreprises, biens, lots, montants : **la seule source des données**. |
| `identifiants.py` | SIREN/SIRET, IBAN et téléphones fictifs, avec des clés de contrôle justes. |
| `documents.py` | Les documents fictifs (pièces d'identité spécimens, bulletins, avis, assurances, diagnostics, Kbis, attestations, factures…). |
| `images.py` | Logos, signatures manuscrites, photos fictives d'état des lieux, d'incident et d'intervention. |
| `tests_*.py` | Les fiches de tests, une par persona. |
| `textes_*.py` | Les textes : à lire en premier, fiche de remontée, guide du coordinateur, fiches « Mon personnage ». |
| `fiches.py`, `gabarits.py`, `rendu.py` | La mise en forme (charte Gerimmo : Manrope, Figtree, bleu `#2457f5`) et le rendu. |

Polices embarquées : Manrope, Figtree et Mrs Saint Delafield, sous licence SIL
Open Font License (textes dans `polices/`).

## Garde-fous

- Tous les documents portent un filigrane « SPÉCIMEN — DOCUMENT FICTIF » et une
  mention en pied ; aucun ne reprend l'apparence d'un titre officiel.
- Aucune adresse e-mail n'est inventée : chaque testeur utilise la sienne
  (alias `+` pour les personnages secondaires), pour ne jamais faire rebondir
  un envoi de Gerimmo sur une adresse inexistante.
