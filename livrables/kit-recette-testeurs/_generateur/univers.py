"""L'univers fictif de la recette : qui est qui, où, avec quels montants.

Une seule source pour les documents, les fiches « Mon personnage » et les
fiches de tests : changer une valeur ici la change partout au prochain
`python3 generer_kit.py`.

Règles suivies :
- personnes, entreprises et adresses FICTIVES (les rues « des Essais », « du
  Prototype »… n'existent pas ; les communes et codes postaux sont réels pour
  que l'autocomplétion et les règles par commune se comportent normalement) ;
- identifiants bien formés mais fictifs (voir identifiants.py) ;
- aucune adresse e-mail inventée : chaque testeur utilise LA SIENNE ; les
  personnes secondaires (mandant, garant) reçoivent un alias « + » de
  l'adresse du testeur qui les fait vivre.
"""

from __future__ import annotations

from identifiants import (
    format_siren,
    format_siret,
    iban_fr,
    siren,
    siret,
    telephone_fixe,
    telephone_mobile,
    tva_intracom,
)

CAMPAGNE = "Recette Gerimmo — octobre 2026"
SITE = "https://www.gerimmo.app"
ANNEE = 2026

# ----------------------------------------------------------------- entreprises

_siren_agence = siren(4217)
_siren_employeur_camille = siren(5120)
_siren_employeur_thomas = siren(6031)
_siren_artisan = siren(7314)
_siren_diagnostiqueur = siren(8402)
_siren_syndic = siren(8813)

AGENCE = {
    "nom": "Horizon Gestion",
    "nom_organisation": "Horizon Gestion (recette)",
    "forme": "SAS au capital de 10 000 €",
    "siren": _siren_agence,
    "siren_lisible": format_siren(_siren_agence),
    "siret": siret(_siren_agence),
    "siret_lisible": format_siret(siret(_siren_agence)),
    "rcs": f"RCS Évry {format_siren(_siren_agence)}",
    "tva": tva_intracom(_siren_agence),
    "adresse": "8 place de la Recette",
    "code_postal": "91000",
    "ville": "Évry-Courcouronnes",
    "telephone": telephone_fixe(4210),
    "carte_pro": "CPI 9101 2026 000 000 042",
    "carte_pro_delivree": "CCI Paris Île-de-France (délivrance fictive)",
    "garantie": "Caisse de Garantie Fictive — 120 000 €",
    "rcp": "Assurances Fictives du Val — contrat RCP-2026-0042",
    "iban": iban_fr(1, 4217001),
    "couleur": "#1f5fbf",
    "couleur_accent": "#f2a541",
}

PROPRIETAIRE_ORG = {
    "nom_organisation": "Parc de Sophie Lemaire",
    "iban": iban_fr(2, 6031777),
}

ARTISAN_ENTREPRISE = {
    "raison_sociale": "Haddad Plomberie Chauffage",
    "forme": "SARL au capital de 5 000 €",
    "siren": _siren_artisan,
    "siren_lisible": format_siren(_siren_artisan),
    "siret": siret(_siren_artisan),
    "siret_lisible": format_siret(siret(_siren_artisan)),
    "rcs": f"RCS Évry {format_siren(_siren_artisan)}",
    "tva": tva_intracom(_siren_artisan),
    "naf": "43.22A — Travaux d'installation d'eau et de gaz en tous locaux",
    "adresse": "17 rue de l'Établi",
    "code_postal": "91200",
    "ville": "Athis-Mons",
    "telephone": telephone_mobile(7314),
    "metiers": ["Plomberie", "Chauffage"],
    "zone": ["91000", "91100", "91120", "91150", "91200", "91300"],
    "creation": "12/03/2019",
    "iban": iban_fr(3, 7314002),
    "assureur_decennale": "Assurances Fictives du Bâtiment (AFB)",
    "police_decennale": "AFB-DEC-2026-7314",
    "siret_secours": siret(siren(7315)),
    "assureur_rc": "Assurances Fictives du Bâtiment (AFB)",
    "police_rc": "AFB-RCP-2026-7314",
}

EMPLOYEURS = {
    "camille": {
        "nom": "Studio Pixel Fictif",
        "forme": "SARL",
        "siret": format_siret(siret(_siren_employeur_camille)),
        "naf": "73.11Z — Activités des agences de publicité",
        "adresse": "30 rue des Maquettistes, 44000 Nantes",
        "convention": "Convention collective nationale de la publicité",
    },
    "thomas": {
        "nom": "Maintenance Fictive Industrie",
        "forme": "SAS",
        "siret": format_siret(siret(_siren_employeur_thomas)),
        "naf": "33.12Z — Réparation de machines et équipements mécaniques",
        "adresse": "2 avenue des Prototypes, 91100 Corbeil-Essonnes",
        "convention": "Convention collective de la métallurgie",
    },
}

DIAGNOSTIQUEUR = {
    "nom": "Diag'Essai Expertises",
    "siret": format_siret(siret(_siren_diagnostiqueur)),
    "adresse": "4 rue du Mètre-Étalon, 91300 Massy",
    "technicien": "Lucie Vernet",
    "certification": "Certification fictive n° CERT-RCT-2026-0918",
    "assurance": "Assurances Fictives du Val — RCP-DIAG-2026-18",
}

SYNDIC = {
    "nom": "Syndic Fictif de l'Essonne",
    "siret": format_siret(siret(_siren_syndic)),
    "adresse": "11 cours des Copropriétés, 91300 Massy",
}

# ----------------------------------------------------------------- personnages

# `alias` : suffixe de l'alias « + » à ajouter à l'adresse du testeur désigné.
PERSONNES = {
    "nadia": {
        "civilite": "Mme", "prenom": "Nadia", "nom": "BENSAÏD", "nom_fichier": "nadia-bensaid",
        "role": "Gérante de l'agence Horizon Gestion (administratrice d'agence)",
        "naissance": "1983-06-21", "lieu_naissance": "Évry (91)",
        "telephone": telephone_mobile(4211), "testeur": "agence",
    },
    "julien": {
        "civilite": "M.", "prenom": "Julien", "nom": "MARCHETTI", "nom_fichier": "julien-marchetti",
        "role": "Gestionnaire locatif chez Horizon Gestion (agent immobilier)",
        "naissance": "1991-02-02", "lieu_naissance": "Ajaccio (2A)",
        "telephone": telephone_mobile(4212), "testeur": "agence", "alias": "agent",
    },
    "bernard": {
        "civilite": "M.", "prenom": "Bernard", "nom": "FONTAINE", "nom_fichier": "bernard-fontaine",
        "role": "Propriétaire mandant (confie ses lots à Horizon Gestion — n'a pas de compte)",
        "naissance": "1956-11-03", "lieu_naissance": "Orléans (45)",
        "adresse": "22 avenue des Maquettes", "code_postal": "75012", "ville": "Paris",
        "telephone": telephone_mobile(4230), "testeur": "agence", "alias": "mandant",
    },
    "camille": {
        "civilite": "Mme", "prenom": "Camille", "nom": "ROUSSEL", "nom_fichier": "camille-roussel",
        "role": "Locataire de l'agence — T2 A12, Résidence Les Essais (Massy)",
        "naissance": "1994-03-12", "lieu_naissance": "Nantes (44)",
        "adresse": "5 rue des Brouillons", "code_postal": "44000", "ville": "Nantes",
        "telephone": telephone_mobile(5120), "testeur": "locataire-agence",
        "profession": "Chargée de communication (CDI depuis le 04/01/2021)",
        "employeur": "camille", "salaire_brut": 3150.00, "salaire_net": 2451.37,
        "revenu_fiscal": 29870, "impot": 1946,
    },
    "philippe": {
        "civilite": "M.", "prenom": "Philippe", "nom": "ROUSSEL", "nom_fichier": "philippe-roussel",
        "role": "Garant de Camille (caution solidaire — son père)",
        "naissance": "1961-09-30", "lieu_naissance": "Rennes (35)",
        "adresse": "9 rue des Épreuves", "code_postal": "35000", "ville": "Rennes",
        "telephone": telephone_mobile(5121), "testeur": "agence", "alias": "garant",
        "profession": "Retraité", "pension_mensuelle": 2684.00, "revenu_fiscal": 33400, "impot": 2870,
    },
    "sophie": {
        "civilite": "Mme", "prenom": "Sophie", "nom": "LEMAIRE", "nom_fichier": "sophie-lemaire",
        "role": "Propriétaire bailleuse en gestion directe (2 biens)",
        "naissance": "1981-04-17", "lieu_naissance": "Versailles (78)",
        "adresse": "40 boulevard du Test", "code_postal": "91100", "ville": "Corbeil-Essonnes",
        "telephone": telephone_mobile(6030), "testeur": "proprietaire",
    },
    "thomas": {
        "civilite": "M.", "prenom": "Thomas", "nom": "GIRARD", "nom_fichier": "thomas-girard",
        "role": "Locataire du propriétaire — T2, 27 rue du Banc-d'Essai (Corbeil-Essonnes)",
        "naissance": "1998-08-25", "lieu_naissance": "Lille (59)",
        "adresse": "12 rue des Ébauches", "code_postal": "59000", "ville": "Lille",
        "telephone": telephone_mobile(6031), "testeur": "locataire-proprietaire",
        "profession": "Technicien de maintenance (CDI depuis le 01/09/2022)",
        "employeur": "thomas", "salaire_brut": 2690.00, "salaire_net": 2098.20,
        "revenu_fiscal": 24650, "impot": 1183,
    },
    "karim": {
        "civilite": "M.", "prenom": "Karim", "nom": "HADDAD", "nom_fichier": "karim-haddad",
        "role": "Artisan plombier-chauffagiste, gérant de Haddad Plomberie Chauffage",
        "naissance": "1987-12-09", "lieu_naissance": "Corbeil-Essonnes (91)",
        "telephone": telephone_mobile(7314), "testeur": "artisan",
    },
}


def nom_complet(cle: str) -> str:
    p = PERSONNES[cle]
    return f"{p['prenom']} {p['nom']}"


# ----------------------------------------------------------------- biens et lots

BIENS_AGENCE = [
    {
        "cle": "essais",
        "reference": "Résidence Les Essais",
        "type": "Immeuble collectif",
        "type_gerimmo": "Immeuble", "copropriete": True, "zone_tendue": True,
        "adresse": "14 allée des Essais", "code_postal": "91300", "ville": "Massy",
        "annee": 1972,
        "parties_communes": "Hall, ascenseur, cave, local vélos, espaces verts",
        "tic": "Fibre optique et antenne TNT collective",
        "chauffage": "Individuel électrique",
        "eau_chaude": "Individuelle électrique (ballon)",
        "lots": [
            {
                "cle": "A12", "designation": "Lot A12 — T2, 2ᵉ étage, porte gauche", "type": "Appartement", "id_fiscal": "9999913770012",
                "usage": "Habitation — location vide (bail nu)",
                "surface": 45.6, "pieces": 2, "etage": "2", "annexes": "Cave n° 12",
                "loyer": 890.00, "charges": 90.00, "depot": 890.00,
                "dpe": {"energie": "D", "ges": "B", "conso": 212, "emissions": 8, "cout_min": 980, "cout_max": 1360},
                "proprietaire": "bernard", "quote_part": 100,
                "locataire": "camille",
                "equipements": ["Cuisine équipée (plaques, hotte, four)", "Ballon d'eau chaude 150 L", "Volets roulants électriques"],
            },
            {
                "cle": "A05", "designation": "Lot A05 — studio meublé, rez-de-chaussée", "type": "Appartement", "id_fiscal": "9999913770005",
                "usage": "Habitation — location meublée",
                "surface": 24.3, "pieces": 1, "etage": "RDC", "annexes": "—",
                "loyer": 640.00, "charges": 55.00, "depot": 1280.00,
                "dpe": {"energie": "E", "ges": "B", "conso": 268, "emissions": 9, "cout_min": 690, "cout_max": 960},
                "proprietaire": "bernard", "quote_part": 100,
                "locataire": None,
                "equipements": ["Lit double", "Plaques 2 feux", "Réfrigérateur", "Four micro-ondes", "Table et 2 chaises", "Rangements"],
            },
        ],
    },
]

BIENS_PROPRIETAIRE = [
    {
        "cle": "banc",
        "reference": "Appartement Banc-d'Essai",
        "type": "Appartement en copropriété",
        "type_gerimmo": "Appartement", "copropriete": True, "zone_tendue": True,
        "adresse": "27 rue du Banc-d'Essai", "code_postal": "91100", "ville": "Corbeil-Essonnes",
        "annee": 1938,
        "parties_communes": "Hall, cour intérieure, local poubelles",
        "tic": "Fibre optique",
        "chauffage": "Chaudière gaz individuelle",
        "eau_chaude": "Chaudière gaz individuelle",
        "lots": [
            {
                "cle": "B3", "designation": "T2, 3ᵉ étage sans ascenseur", "type": "Appartement", "id_fiscal": "9999917410003",
                "usage": "Habitation — location vide (bail nu)",
                "surface": 41.8, "pieces": 2, "etage": "3", "annexes": "—",
                "loyer": 720.00, "charges": 60.00, "depot": 720.00,
                "dpe": {"energie": "D", "ges": "D", "conso": 238, "emissions": 41, "cout_min": 1050, "cout_max": 1440},
                "proprietaire": "sophie", "quote_part": 100,
                "locataire": "thomas",
                "equipements": ["Cuisine équipée (plaques gaz, hotte)", "Chaudière gaz murale", "Radiateurs à eau chaude"],
            },
        ],
    },
    {
        "cle": "maquette",
        "reference": "Studio Maquette",
        "type": "Appartement en copropriété",
        "type_gerimmo": "Appartement", "copropriete": True, "zone_tendue": False,
        "adresse": "5 impasse de la Maquette", "code_postal": "91150", "ville": "Étampes",
        "annee": 2004,
        "parties_communes": "Hall, parking extérieur",
        "tic": "Fibre optique et antenne TNT collective",
        "chauffage": "Individuel électrique",
        "eau_chaude": "Individuelle électrique (ballon)",
        "lots": [
            {
                "cle": "M1", "designation": "Studio, 1ᵉʳ étage", "type": "Appartement", "id_fiscal": "9999922230001",
                "usage": "Habitation — location vide (bail nu)",
                "surface": 22.4, "pieces": 1, "etage": "1", "annexes": "Place de parking n° 7",
                "loyer": 460.00, "charges": 35.00, "depot": 460.00,
                "dpe": {"energie": "C", "ges": "A", "conso": 142, "emissions": 4, "cout_min": 420, "cout_max": 610},
                "proprietaire": "sophie", "quote_part": 100,
                "locataire": None,
                "equipements": ["Kitchenette (plaques, réfrigérateur)", "Ballon d'eau chaude 100 L"],
            },
        ],
    },
]

ASSURANCE_HABITATION = {
    "assureur": "Mutuelle Fictive de l'Essonne (MFE)",
    "adresse": "1 place des Garanties, 91000 Évry-Courcouronnes",
    "debut": "01/10/2026",
    "fin": "30/09/2027",
}

# Prix réels de Gerimmo au 27/09/2026 (app/src/lib/stripe.ts, relu par l'exploration du code).
TARIFS = {
    "proprietaire_par_bien": 5.99,
    "agence_forfait_10_lots": 39.00,
    "essai_jours": 14,
    "essai_parrainage_jours": 30,
}


# ----------------------------------------------------------------- diagnostics
# Libellés et rattachements de Gerimmo (app/src/lib/parc.ts) : DPE, Électricité,
# Gaz, Plomb (CREP), Amiante (privatif) au LOT ; ERP, Amiante (parties
# communes), Termites au BIEN. « Expire le » vide = validité illimitée ; sinon
# l'échéance doit suivre la réalisation. Seuls DPE et ERP bloquent s'ils
# manquent ; tout diagnostic déposé puis expiré bloque aussi.

DIAGNOSTICS = {
    "essais": {
        "bien": [
            {"type": "ERP — état des risques", "cle": "erp", "realise": "15/09/2026", "expire": "15/03/2027"},
            {"type": "Amiante (parties communes)", "cle": "amiante", "realise": "12/05/2021", "expire": ""},
        ],
        "A12": [
            {"type": "DPE", "cle": "dpe", "realise": "18/11/2025", "expire": "17/11/2035"},
            {"type": "Électricité", "cle": "electricite", "realise": "02/09/2026", "expire": "01/09/2032"},
            {"type": "Amiante (privatif)", "cle": "amiante", "realise": "12/05/2021", "expire": ""},
        ],
        "A05": [
            {"type": "DPE", "cle": "dpe", "realise": "18/11/2025", "expire": "17/11/2035"},
            {"type": "Électricité", "cle": "electricite", "realise": "02/09/2026", "expire": "01/09/2032"},
            {"type": "Amiante (privatif)", "cle": "amiante", "realise": "12/05/2021", "expire": ""},
        ],
    },
    "banc": {
        "bien": [
            {"type": "ERP — état des risques", "cle": "erp", "realise": "16/09/2026", "expire": "16/03/2027"},
            {"type": "Amiante (parties communes)", "cle": "amiante", "realise": "03/02/2020", "expire": ""},
        ],
        "B3": [
            {"type": "DPE", "cle": "dpe", "realise": "04/03/2025", "expire": "03/03/2035"},
            {"type": "Électricité", "cle": "electricite", "realise": "10/09/2026", "expire": "09/09/2032"},
            {"type": "Gaz", "cle": "gaz", "realise": "10/09/2026", "expire": "09/09/2032"},
            {"type": "Plomb (CREP)", "cle": "plomb", "realise": "04/03/2025", "expire": ""},
            {"type": "Amiante (privatif)", "cle": "amiante", "realise": "04/03/2025", "expire": ""},
        ],
    },
    "maquette": {
        "bien": [
            {"type": "ERP — état des risques", "cle": "erp", "realise": "17/09/2026", "expire": "17/03/2027"},
        ],
        "M1": [
            {"type": "DPE", "cle": "dpe", "realise": "21/06/2024", "expire": "20/06/2034"},
            {"type": "Électricité", "cle": "electricite", "realise": "17/09/2026", "expire": "16/09/2032"},
        ],
    },
}

# L'ERP périmé du test négatif : déposé d'abord, il doit bloquer la mise en location.
ERP_PERIME = {"realise": "03/01/2026", "expire": "03/07/2026"}

# État des lieux d'entrée : Gerimmo n'accepte pas de photo, tout se saisit dans la grille.
EDL_ENTREE = {
    "A12": {
        "releves": [("Eau froide", "RCT-0482", "482,315 m³"), ("Électricité", "0999 1234 5678", "12 587 kWh (base)")],
        "cles": "3 clés de la porte palière, 1 badge du hall, 1 clé de boîte aux lettres, 1 clé de cave",
        "pieces": [
            ("Entrée", "Bon", "Peinture propre ; interphone fonctionnel"),
            ("Séjour", "Bon", "Parquet légèrement rayé près de la fenêtre ; 2 prises"),
            ("Cuisine", "Bon", "Plaques, hotte et four testés ; joint d'évier à surveiller"),
            ("Chambre", "Bon", "Peinture refaite en 2025"),
            ("Salle de bain", "Bon", "Élément « joints » : Usagé — joints de douche légèrement jaunis"),
            ("WC", "Bon", "Chasse d'eau fonctionnelle"),
        ],
    },
    "B3": {
        "releves": [("Gaz", "RCT-GZ-0317", "8 412 m³"), ("Électricité", "0999 7412 0003", "20 115 kWh (base)"), ("Eau froide", "RCT-0317", "311,020 m³")],
        "cles": "2 clés de la porte palière, 1 clé de boîte aux lettres, 1 bip du portail",
        "pieces": [
            ("Entrée", "Bon", "Porte palière révisée"),
            ("Séjour", "Usagé", "Traces de meubles au mur ; parquet d'origine ciré"),
            ("Cuisine", "Bon", "Plaques gaz et hotte fonctionnelles"),
            ("Chambre", "Bon", "Radiateur à eau chaude avec tête thermostatique"),
            ("Salle de bain", "Bon", "Chaudière murale entretenue en mars 2026"),
        ],
    },
}


# Lignes des devis et factures de l'artisan (libellé, quantité, prix unitaire HT ; TVA 10 %) :
# ce qu'il saisit dans Gerimmo = ce que dit sa facture PDF.
FACTURE_SIPHON = [("Déplacement et diagnostic", 1, 45.00), ("Siphon PVC et joints (fourniture)", 1, 38.50), ("Main-d'œuvre", 1.5, 52.00)]
FACTURE_RADIATEUR = [("Déplacement et diagnostic", 1, 45.00), ("Tête thermostatique (fourniture)", 1, 29.90),
                     ("Purge et remise en service du circuit", 1, 60.00), ("Main-d'œuvre", 1, 52.00)]
