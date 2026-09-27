"""Produit tout le kit de recette : `python3 generer_kit.py`.

Sortie dans le dossier parent (livrables/kit-recette-testeurs/) :
  00-commun/                 à lire en premier, fiche de remontée
  01-agence-immobiliere/     … un dossier par persona, avec ses documents
  02-locataire-de-l-agence/
  03-proprietaire-bailleur/
  04-locataire-du-proprietaire/
  05-artisan/
  06-coordinateur/           guide, tableau d'affectation, suivi consolidé
  zips/                      une archive par dossier, prête à envoyer
"""

from __future__ import annotations

import hashlib
import shutil
import sys
import zipfile
from pathlib import Path

import documents as D
import images as I
import univers as U

ICI = Path(__file__).resolve().parent
KIT = ICI.parent

PERSONAS = {
    "agence": {"dossier": "01-agence-immobiliere", "titre": "Agence immobilière", "personnage": "nadia"},
    "locataire-agence": {"dossier": "02-locataire-de-l-agence", "titre": "Locataire de l'agence", "personnage": "camille"},
    "proprietaire": {"dossier": "03-proprietaire-bailleur", "titre": "Propriétaire bailleur", "personnage": "sophie"},
    "locataire-proprietaire": {"dossier": "04-locataire-du-proprietaire", "titre": "Locataire du propriétaire", "personnage": "thomas"},
    "artisan": {"dossier": "05-artisan", "titre": "Artisan", "personnage": "karim"},
}

BIENS = {b["cle"]: b for b in U.BIENS_AGENCE + U.BIENS_PROPRIETAIRE}


def lot_de(cle_bien: str, cle_lot: str) -> dict:
    return next(l for l in BIENS[cle_bien]["lots"] if l["cle"] == cle_lot)


def adresse_html(p: dict) -> str:
    return f"{p['adresse']}<br>{p['code_postal']} {p['ville']}"


# ------------------------------------------------------------------ diagnostics

def _diagnostic_html(cle_bien: str, cle_lot: str | None, d: dict, numero: str) -> str:
    bien = BIENS[cle_bien]
    lot = lot_de(cle_bien, cle_lot) if cle_lot else None
    if d["cle"] == "dpe":
        return D.dpe(bien, lot, numero, d["realise"], d["expire"])
    if d["cle"] == "erp":
        return D.erp(bien, numero, d["realise"])
    if d["cle"] == "amiante":
        return D.amiante(bien, lot, numero, d["realise"])
    if d["cle"] == "plomb":
        return D.crep(bien, lot, numero, d["realise"])
    if d["cle"] == "electricite":
        return D.electricite(bien, lot, numero, d["realise"], d["expire"])
    if d["cle"] == "gaz":
        return D.gaz(bien, lot, numero, d["realise"], d["expire"])
    raise ValueError(d["cle"])


def _nom_fichier_diag(d: dict, suffixe: str) -> str:
    base = {"dpe": "DPE", "erp": "ERP", "amiante": "amiante", "plomb": "plomb-CREP",
            "electricite": "electricite", "gaz": "gaz"}[d["cle"]]
    if d["cle"] == "amiante":
        base = "amiante-parties-communes" if suffixe == "immeuble" else "amiante-privatif"
    return f"{base}-{suffixe}.pdf"


def produire_diagnostics(cle_bien: str, dossier: Path, prefixe_numero: str) -> list[Path]:
    produits = []
    compteur = 0
    for porte, liste in U.DIAGNOSTICS[cle_bien].items():
        suffixe = "immeuble" if porte == "bien" else f"lot-{porte}"
        for d in liste:
            compteur += 1
            numero = f"{prefixe_numero}-{compteur:02d}"
            html = _diagnostic_html(cle_bien, None if porte == "bien" else porte, d, numero)
            produits.append(D.produire(html, dossier / _nom_fichier_diag(d, suffixe)))
    return produits


# ------------------------------------------------------------------ par persona

def documents_agence(racine: Path) -> None:
    doc = racine / "documents"
    a = U.AGENCE
    P = U.PERSONNES
    essais = BIENS["essais"]
    a12 = lot_de("essais", "A12")

    # 1. identité de l'agence
    ident = doc / "01-identite-de-l-agence"
    ident.mkdir(parents=True, exist_ok=True)
    I.produire_logo_agence(ident)
    I.produire_signature("signature-nadia-bensaid.png", "N. Bensaïd", 3, ident)

    # 2. la résidence et ses diagnostics
    diag = doc / "02-residence-les-essais-diagnostics"
    produire_diagnostics("essais", diag, "DE-2026-091")
    perime = dict(U.DIAGNOSTICS["essais"]["bien"][0], **U.ERP_PERIME)
    D.produire(D.erp(essais, "DE-2026-0017", perime["realise"]), diag / "test-negatif" / "ERP-immeuble-PERIME.pdf")
    D.produire(D.variante_secours(D.dpe(essais, a12, "DE-2026-091-01", "18/11/2025", "17/11/2035")),
               diag / "secours" / "DPE-lot-A12-copie-de-secours.pdf")
    D.produire(D.variante_secours(D.erp(essais, "DE-2026-091-00", "15/09/2026")),
               diag / "secours" / "ERP-immeuble-copie-de-secours.pdf")

    # 3. le mandant
    mandant = doc / "03-mandant-bernard-fontaine"
    b = P["bernard"]
    D.produire(D.piece_identite("bernard"), mandant / "piece-identite-bernard-fontaine.pdf")
    D.produire(D.rib(f"M. {b['prenom']} {b['nom']}", adresse_html(b), U.iban_fr(4, 4230001)), mandant / "RIB-bernard-fontaine.pdf")

    # 4. dossier de la locataire (les pièces que l'AGENCE dépose ; Camille dépose les autres elle-même)
    dossier = doc / "04-dossier-camille-roussel"
    D.produire(D.piece_identite("camille"), dossier / "piece-identite-camille-roussel.pdf")
    for mois in (6, 7, 8):
        D.produire(D.bulletin_salaire("camille", 2026, mois), dossier / f"bulletin-salaire-2026-{mois:02d}-camille-roussel.pdf")
    D.produire(D.attestation_employeur("camille"), dossier / "attestation-employeur-camille-roussel.pdf")
    D.produire(D.justificatif_domicile("camille"), dossier / "justificatif-domicile-camille-roussel.pdf")

    # 5. le garant
    garant = doc / "05-garant-philippe-roussel"
    D.produire(D.piece_identite("philippe"), garant / "piece-identite-philippe-roussel.pdf")
    D.produire(D.avis_impot("philippe"), garant / "avis-impot-2026-philippe-roussel.pdf")
    D.produire(D.attestation_pension("philippe"), garant / "attestation-pension-philippe-roussel.pdf")

    # 6. bail signé (à déposer à la place du PDF généré, refusé comme doublon)
    bail = doc / "06-bail-signe"
    D.produire(D.bail_signe(f"M. {b['prenom']} {b['nom']}", f"{a['nom']}, {a['forme']}, carte {a['carte_pro']}",
                            adresse_html(b), "camille", essais, a12, "1ᵉʳ octobre 2026", "Évry-Courcouronnes",
                            "28 septembre 2026", 3, 5),
               bail / "bail-signe-lot-A12-camille-roussel.pdf")

    # 7. incident : la photo que l'agence ajoute, et l'incident qu'elle déclare elle-même
    inc = doc / "07-incidents"
    inc.mkdir(parents=True, exist_ok=True)
    I.produire_photo("incident-fuite-evier-detail", inc)
    I.produire_photo("incident-moisissure-plafond", inc)

    # 8. copropriété et charges
    copro = doc / "08-copropriete-et-charges"
    D.produire(D.appel_fonds_syndic(essais, a12["designation"], f"M. {b['prenom']} {b['nom']}", adresse_html(b), [
        ("Charges générales (entretien, ménage, espaces verts)", 96.40, True),
        ("Ascenseur (contrat d'entretien)", 38.20, True),
        ("Eau froide collective", 52.10, True),
        ("Assurance de l'immeuble", 31.75, False),
        ("Honoraires du syndic", 44.30, False),
        ("Fonds de travaux (loi ALUR)", 27.50, False),
    ]), copro / "appel-de-fonds-syndic-T4-2026-lot-A12.pdf")
    html, _ = D.decompte_charges(essais, a12, 2026, [
        ("Eau froide", 214.00), ("Entretien et ménage des parties communes", 362.00),
        ("Électricité des parties communes", 96.00), ("Ascenseur (entretien courant)", 178.00),
        ("Taxe d'enlèvement des ordures ménagères", 150.00),
    ])
    D.produire(html, copro / "decompte-charges-2026-lot-A12.pdf")

    # 9. fin de bail
    fin = doc / "09-fin-de-bail"
    D.produire(D.lettre_conge_locataire("camille", f"{essais['adresse']}, {a12['designation']}, {essais['code_postal']} {essais['ville']}",
                                        a["nom"], f"{a['adresse']}<br>{a['code_postal']} {a['ville']}", "à dater du jour du test",
                                        "au terme du préavis d'un mois"), fin / "lettre-conge-camille-roussel.pdf")
    D.produire(D.devis_peintre(f"M. {b['prenom']} {b['nom']} — c/o {a['nom']}", f"{a['adresse']}<br>{a['code_postal']} {a['ville']}",
                               f"{essais['adresse']}, {essais['code_postal']} {essais['ville']} — lot A12", 381.82),
               fin / "devis-remise-en-peinture-lot-A12.pdf")

    # 10. tests négatifs : un logo trop lourd, un « PDF » qui n'en est pas un
    neg = doc / "11-tests-negatifs"
    neg.mkdir(parents=True, exist_ok=True)
    logo_trop_lourd(neg / "logo-trop-lourd.png")
    (neg / "faux-document.pdf").write_text("Ceci n'est pas un PDF : un simple texte renommé en .pdf pour la recette de Gerimmo.\n", encoding="utf-8")

    # 11. imports
    imp = doc / "10-imports"
    ecrire_csv_import(imp / "import-parc-ateliers-du-prototype.csv", avec_erreurs=False)
    ecrire_csv_import(imp / "import-parc-avec-erreurs.csv", avec_erreurs=True)
    ecrire_csv_reprise(imp / "reprise-comptable-horizon.csv")


def documents_locataire_agence(racine: Path) -> None:
    doc = racine / "documents"
    essais = BIENS["essais"]
    a12 = lot_de("essais", "A12")
    c = U.PERSONNES["camille"]
    adresse_logement = f"{essais['adresse']}, {a12['designation']}, {essais['code_postal']} {essais['ville']}"
    D.produire(D.attestation_assurance_habitation("camille", adresse_logement, "MFE-MRH-2026-51207"),
               doc / "attestation-assurance-habitation-camille-roussel.pdf")
    # pièces que l'agence lui réclamera (jamais déposées par l'agence : pas de doublon)
    D.produire(D.avis_impot("camille"), doc / "pieces-reclamees" / "avis-impot-2026-camille-roussel.pdf")
    D.produire(D.rib(f"Mme {c['prenom']} {c['nom']}", adresse_html(c), U.iban_fr(5, 5120007)),
               doc / "pieces-reclamees" / "RIB-camille-roussel.pdf")
    # document « signé » à renvoyer quand l'agence lui en envoie un à signer
    b = U.PERSONNES["bernard"]
    D.produire(D.bail_signe(f"M. {b['prenom']} {b['nom']}", f"{U.AGENCE['nom']}", adresse_html(b), "camille", essais, a12,
                            "1ᵉʳ octobre 2026", "Massy", "29 septembre 2026", 3, 5,
                            exemplaire="Exemplaire retourné signé par la locataire", signataires=(False, True)),
               doc / "document-a-renvoyer-signe" / "exemplaire-signe-par-camille-roussel.pdf")
    photos = doc / "photos-incident"
    photos.mkdir(parents=True, exist_ok=True)
    I.produire_photo("incident-fuite-evier", photos)
    I.produire_photo("incident-volet-bloque", photos)


def documents_proprietaire(racine: Path) -> None:
    doc = racine / "documents"
    s = U.PERSONNES["sophie"]
    banc = BIENS["banc"]
    b3 = lot_de("banc", "B3")
    maquette = BIENS["maquette"]

    ident = doc / "01-mon-identite"
    ident.mkdir(parents=True, exist_ok=True)
    I.produire_signature("signature-sophie-lemaire.png", "S. Lemaire", 9, ident)
    D.produire(D.rib(f"Mme {s['prenom']} {s['nom']}", adresse_html(s), U.PROPRIETAIRE_ORG["iban"]), ident / "RIB-sophie-lemaire.pdf")

    produire_diagnostics("banc", doc / "02-appartement-banc-d-essai-diagnostics", "DE-2026-174")
    produire_diagnostics("maquette", doc / "03-studio-maquette-diagnostics", "DE-2026-222")
    D.produire(D.variante_secours(D.dpe(banc, b3, "DE-2026-174-01", "04/03/2025", "03/03/2035")),
               doc / "02-appartement-banc-d-essai-diagnostics" / "secours" / "DPE-lot-B3-copie-de-secours.pdf")

    dossier = doc / "04-dossier-thomas-girard"
    D.produire(D.piece_identite("thomas"), dossier / "piece-identite-thomas-girard.pdf")
    for mois in (6, 7, 8):
        D.produire(D.bulletin_salaire("thomas", 2026, mois), dossier / f"bulletin-salaire-2026-{mois:02d}-thomas-girard.pdf")
    D.produire(D.attestation_employeur("thomas"), dossier / "attestation-employeur-thomas-girard.pdf")

    D.produire(D.bail_signe(f"Mme {s['prenom']} {s['nom']}", None, adresse_html(s), "thomas", banc, b3,
                            "16 septembre 2026", "Corbeil-Essonnes", "15 septembre 2026", 9, 12),
               doc / "05-bail-signe" / "bail-signe-thomas-girard.pdf")

    inc = doc / "06-incidents"
    inc.mkdir(parents=True, exist_ok=True)
    I.produire_photo("incident-prise-arrachee", inc)

    livre = doc / "07-livre-recettes-depenses"
    adr = adresse_html(s)
    D.produire(D.avis_taxe_fonciere(f"Mme {s['prenom']} {s['nom']}", adr, banc, 1124.00, 168.00), livre / "avis-taxe-fonciere-2026-banc-d-essai.pdf")
    D.produire(D.attestation_pno(f"Mme {s['prenom']} {s['nom']}", adr, banc, "MFE-PNO-2026-6030"), livre / "attestation-assurance-PNO-2026.pdf")
    D.produire(D.echeancier_pret(f"Mme {s['prenom']} {s['nom']}", banc, 148000.00, 0.0215, 758.42, 2846.15), livre / "tableau-amortissement-pret-2026.pdf")
    D.produire(D.facture_fournisseur("Peinture Fictive Pro", "PF", "#7c2d12", "F-2026-0877", "22/09/2026", f"Mme {s['prenom']} {s['nom']}", adr,
                                     "Remise en peinture de la chambre avant location — 27 rue du Banc-d'Essai",
                                     [("Préparation des murs et plafond", 180.00), ("Peinture 2 couches, chambre 11 m²", 470.00)],
                                     "Travaux d'entretien déductibles (dépense de réparation et d'entretien)."),
               livre / "facture-travaux-peinture-2026.pdf")
    D.produire(D.appel_fonds_syndic(banc, b3["designation"], f"Mme {s['prenom']} {s['nom']}", adr, [
        ("Charges générales (entretien, ménage)", 71.30, True),
        ("Eau froide collective", 38.60, True),
        ("Assurance de l'immeuble", 24.10, False),
        ("Honoraires du syndic", 29.80, False),
        ("Fonds de travaux (loi ALUR)", 18.40, False),
    ]), livre / "appel-de-fonds-syndic-T4-2026-banc-d-essai.pdf")
    _ = maquette


def documents_locataire_proprietaire(racine: Path) -> None:
    doc = racine / "documents"
    banc = BIENS["banc"]
    b3 = lot_de("banc", "B3")
    t = U.PERSONNES["thomas"]
    D.produire(D.attestation_assurance_habitation("thomas", f"{banc['adresse']}, {b3['designation']}, {banc['code_postal']} {banc['ville']}",
                                                  "MFE-MRH-2026-60311"),
               doc / "attestation-assurance-habitation-thomas-girard.pdf")
    D.produire(D.justificatif_domicile("thomas"), doc / "pieces-reclamees" / "justificatif-domicile-thomas-girard.pdf")
    D.produire(D.avis_impot("thomas"), doc / "pieces-reclamees" / "avis-impot-2026-thomas-girard.pdf")
    D.produire(D.rib(f"M. {t['prenom']} {t['nom']}", adresse_html(t), U.iban_fr(6, 6031009)), doc / "pieces-reclamees" / "RIB-thomas-girard.pdf")
    s = U.PERSONNES["sophie"]
    D.produire(D.bail_signe(f"Mme {s['prenom']} {s['nom']}", None, adresse_html(s), "thomas", banc, b3,
                            "16 septembre 2026", "Corbeil-Essonnes", "15 septembre 2026", 9, 12,
                            exemplaire="Exemplaire retourné signé par le locataire", signataires=(False, True)),
               doc / "document-a-renvoyer-signe" / "exemplaire-signe-par-thomas-girard.pdf")
    photos = doc / "photos-incident"
    photos.mkdir(parents=True, exist_ok=True)
    I.produire_photo("incident-radiateur-froid", photos)


def documents_artisan(racine: Path) -> None:
    doc = racine / "documents"
    a = U.ARTISAN_ENTREPRISE
    k = U.PERSONNES["karim"]
    ent = doc / "01-attestations"
    D.produire(D.attestation_decennale(), ent / "attestation-decennale-2026.pdf")
    D.produire(D.attestation_rc_pro(), ent / "attestation-rc-pro-2026.pdf")
    D.produire(D.attestation_urssaf(), ent / "attestation-vigilance-urssaf.pdf")
    D.produire(D.kbis(), ent / "extrait-kbis.pdf")
    D.produire(D.rib(f"{a['raison_sociale']} — {k['prenom']} {k['nom']}", f"{a['adresse']}<br>{a['code_postal']} {a['ville']}", a["iban"]),
               doc / "02-entreprise" / "RIB-haddad-plomberie-chauffage.pdf")

    photos = doc / "03-photos-chantier"
    photos.mkdir(parents=True, exist_ok=True)
    for nom in ("intervention-avant-siphon", "intervention-apres-siphon", "intervention-apres-radiateur"):
        I.produire_photo(nom, photos)

    fact = doc / "04-factures"
    essais = BIENS["essais"]
    banc = BIENS["banc"]
    b = U.PERSONNES["bernard"]
    s = U.PERSONNES["sophie"]
    ag = U.AGENCE
    html, _ = D.facture_artisan("F2026-0142", "à la date de l'intervention",
                                f"M. {b['prenom']} {b['nom']} — c/o {ag['nom']}", f"{ag['adresse']}<br>{ag['code_postal']} {ag['ville']}",
                                f"{essais['adresse']}, {essais['code_postal']} {essais['ville']} — lot A12 (cuisine)",
                                FACTURE_SIPHON)
    D.produire(html, fact / "facture-F2026-0142-fuite-evier-lot-A12.pdf")
    html, _ = D.facture_artisan("F2026-0143", "à la date de l'intervention", f"Mme {s['prenom']} {s['nom']}", adresse_html(s),
                                f"{banc['adresse']}, {banc['code_postal']} {banc['ville']} (chambre)", FACTURE_RADIATEUR)
    D.produire(html, fact / "facture-F2026-0143-radiateur-banc-d-essai.pdf")


def logo_trop_lourd(chemin: Path) -> Path:
    """Une image de plus de 200 Ko : Gerimmo doit la refuser comme logo."""
    import random as _r
    from PIL import Image

    _r.seed(42)
    image = Image.new("RGB", (430, 430))
    image.putdata([(_r.randrange(256), _r.randrange(256), _r.randrange(256)) for _ in range(430 * 430)])
    image.save(chemin, "PNG")
    return chemin


FACTURE_SIPHON = U.FACTURE_SIPHON
FACTURE_RADIATEUR = U.FACTURE_RADIATEUR


# ------------------------------------------------------------------ fichiers CSV (UTF-8 avec BOM, « ; », point décimal)

ENTETE_IMPORT = ["Nom du bien", "Type (appartement, maison, immeuble, local, parking, terrain, autre)", "Adresse",
                 "Complément d'adresse", "Code postal", "Ville", "Année de construction", "Nom du lot", "Étage",
                 "Surface (m²)", "Pièces", "Nom du propriétaire", "Prénom du propriétaire", "Email du propriétaire",
                 "Quote-part (%) — 100 si vide", "Nom du locataire", "Prénom du locataire", "Email du locataire",
                 "Loyer hors charges (€)", "Provision pour charges (€)", "Dépôt de garantie (€)",
                 "Date d'entrée (AAAA-MM-JJ)", "Jour d'échéance (1 si vide)"]


def _csv(chemin: Path, entete: list[str], lignes: list[list[str]]) -> Path:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    texte = "﻿" + ";".join(entete) + "\n" + "".join(";".join(l) + "\n" for l in lignes)
    chemin.write_text(texte, encoding="utf-8")
    return chemin


def ecrire_csv_import(chemin: Path, avec_erreurs: bool) -> Path:
    ateliers = ["Les Ateliers du Prototype", "immeuble", "3 rue du Prototype", "", "91120", "Palaiseau", "1988"]
    maison = ["Maison Brouillon", "maison", "11 chemin du Brouillon", "", "91300", "Massy", "1965"]
    lignes = [
        ateliers + ["P01", "RDC", "31.5", "1", "MAQUETTE", "Roger", "", "100", "VERNIER", "Inès", "", "610", "45", "610", "2024-09-01", "5"],
        ateliers + ["P02", "1er", "48.2", "2", "MAQUETTE", "Roger", "", "100", "", "", "", "", "", "", "", ""],
        ateliers + ["P03", "2e", "66", "3", "MAQUETTE", "Roger", "", "50", "OSSELET", "Marc", "", "930", "80", "930", "2025-03-01", "1"],
        ateliers + ["P03", "2e", "66", "3", "BRISSAC", "Line", "", "50", "", "", "", "", "", "", "", ""],
        maison + ["Maison", "", "104", "5", "BRISSAC", "Line", "", "100", "", "", "", "", "", "", "", ""],
    ]
    if avec_erreurs:
        lignes = [
            lignes[0],
            ["Le Petit Essai", "studio", "8 rue du Brouillon", "", "91300", "Massy", "1990", "S1", "", "19", "1", "TEST", "Luc", "", "100", "", "", "", "", "", "", "", ""],
            ["Le Petit Essai", "appartement", "8 rue du Brouillon", "", "9130", "Massy", "1990", "S2", "", "21", "1", "TEST", "Luc", "", "100", "", "", "", "", "", "", "", ""],
            ["Le Petit Essai", "appartement", "8 rue du Brouillon", "", "91300", "Massy", "1990", "S3", "", "23", "1", "", "", "", "100", "", "", "", "", "", "", "", ""],
            ["Le Petit Essai", "appartement", "8 rue du Brouillon", "", "91300", "Massy", "1990", "S4", "", "25", "1", "TEST", "Luc", "", "100", "PILOTE", "Ana", "", "700", "", "", "01/10/2026", ""],
        ]
    return _csv(chemin, ENTETE_IMPORT, lignes)


ENTETE_REPRISE = ["Type (depot_garantie / solde_locataire / provision_charges / fonds_mandant)", "Montant (€)",
                  "Email du locataire", "Nom du bien", "Nom du lot", "Email du propriétaire",
                  "Détenteur du dépôt (agence ou proprietaire)", "Référence (facultatif)"]

# Deux lignes rattachées au bail ACTIF du lot A12 par le nom du bien et du lot
# (les adresses e-mail réelles des testeurs ne peuvent pas être connues d'avance).
REPRISE = [
    ["provision_charges", "180.00", "", "Résidence Les Essais", "A12", "", "", "Provisions reprises de l'ancien logiciel"],
    ["solde_locataire", "50.00", "", "Résidence Les Essais", "A12", "", "", "Avance de la locataire"],
]
TRESORERIE_REPRISE = "230,00"


def ecrire_csv_reprise(chemin: Path) -> Path:
    return _csv(chemin, ENTETE_REPRISE, REPRISE)


# ------------------------------------------------------------------ contrôles et archives

def verifier_unicite(racine: Path) -> list[str]:
    """Deux pièces identiques dans le kit = un dépôt refusé comme doublon dans Gerimmo.

    Seules les pièces à déposer (dossiers documents/) comptent : les fiches
    communes sont copiées exprès dans chaque dossier persona."""
    vus: dict[str, Path] = {}
    doublons = []
    for f in sorted(racine.rglob("*")):
        if f.is_file() and f.suffix.lower() in {".pdf", ".jpg", ".png"} and "documents" in f.parts:
            h = hashlib.sha256(f.read_bytes()).hexdigest()
            if h in vus:
                doublons.append(f"{f.relative_to(racine)} = {vus[h].relative_to(racine)}")
            else:
                vus[h] = f
    return doublons


def verifier_pdf(racine: Path) -> list[str]:
    """Gerimmo exige « %PDF- » au premier octet et « %%EOF » dans le dernier kilo-octet."""
    fautes = []
    for f in racine.rglob("*.pdf"):
        if "_generateur" in f.parts or "11-tests-negatifs" in f.parts:
            continue
        octets = f.read_bytes()
        if not octets.startswith(b"%PDF-") or b"%%EOF" not in octets[-1024:]:
            fautes.append(str(f.relative_to(racine)))
        if len(octets) > 4 * 1024 * 1024:
            fautes.append(f"{f.relative_to(racine)} dépasse 4 Mo")
    return fautes


def zipper(dossier: Path, destination: Path, extras: list[Path]) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(dossier.rglob("*")):
            if f.is_file() and f.suffix.lower() != ".md":
                z.write(f, Path(dossier.name) / f.relative_to(dossier))
        for f in extras:
            z.write(f, Path(dossier.name) / f.name)
    return destination


def nettoyer() -> None:
    for nom in [*(p["dossier"] for p in PERSONAS.values()), "00-commun", "06-coordinateur", "zips"]:
        chemin = KIT / nom
        if chemin.exists():
            shutil.rmtree(chemin)


def main() -> int:
    nettoyer()
    producteurs = {
        "agence": documents_agence,
        "locataire-agence": documents_locataire_agence,
        "proprietaire": documents_proprietaire,
        "locataire-proprietaire": documents_locataire_proprietaire,
        "artisan": documents_artisan,
    }
    for cle, persona in PERSONAS.items():
        racine = KIT / persona["dossier"]
        print(f"· {persona['titre']} — documents")
        producteurs[cle](racine)

    try:
        import fiches_et_textes
    except ImportError:
        fiches_et_textes = None
    if fiches_et_textes:
        fiches_et_textes.produire(KIT, PERSONAS)

    doublons = verifier_unicite(KIT)
    fautes = verifier_pdf(KIT)
    if doublons or fautes:
        print("ERREURS :", *doublons, *fautes, sep="\n  ")
        return 1

    # Chaque dossier persona contient déjà ses copies des fiches communes ; le
    # dossier du coordinateur les reçoit dans son archive.
    communs = sorted((KIT / "00-commun").glob("*.pdf")) if (KIT / "00-commun").exists() else []
    for persona in PERSONAS.values():
        zipper(KIT / persona["dossier"], KIT / "zips" / f"Kit-recette-Gerimmo-{persona['dossier']}.zip", [])
    if (KIT / "06-coordinateur").exists():
        zipper(KIT / "06-coordinateur", KIT / "zips" / "Kit-recette-Gerimmo-06-coordinateur.zip", communs)
    print("Kit produit dans", KIT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
