"""Images fictives : logo d'agence, signatures, photos d'incident et d'intervention.

Tout est dessiné (SVG rendu par Chrome), rien n'est une vraie photo : chaque
image porte un bandeau « Photo fictive — recette Gerimmo ». Format 1600 × 1200
(4:3, celui d'un téléphone), exporté en JPEG comme une photo prise sur place.

Pas de photo d'état des lieux : dans Gerimmo, l'état des lieux est une grille
saisie à l'écran (état et commentaire par élément, compteurs et clés tapés).
Chaque photo a des octets différents, car Gerimmo refuse de ranger deux fois
le même fichier dans une même organisation.
"""

from __future__ import annotations

import random
from pathlib import Path

from rendu import png_vers_jpg, svg_vers_png

L, H = 1600, 1200

DEFS = """
<defs>
  <linearGradient id="mur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset="1" stop-color="#e6e1d6"/></linearGradient>
  <linearGradient id="murG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9d3c6"/><stop offset="1" stop-color="#ebe6dc"/></linearGradient>
  <linearGradient id="murD" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#d3ccbe"/><stop offset="1" stop-color="#e8e2d7"/></linearGradient>
  <linearGradient id="plafond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfaf7"/><stop offset="1" stop-color="#efece5"/></linearGradient>
  <linearGradient id="parquet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98a5a"/><stop offset="1" stop-color="#8f643b"/></linearGradient>
  <linearGradient id="carrelage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd6db"/><stop offset="1" stop-color="#aab4bb"/></linearGradient>
  <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8e8"/><stop offset="1" stop-color="#d7e8f7"/></linearGradient>
  <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d949b"/><stop offset=".45" stop-color="#f2f4f6"/><stop offset="1" stop-color="#7c848b"/></linearGradient>
  <linearGradient id="pvc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa0a6"/><stop offset=".5" stop-color="#d7dadd"/><stop offset="1" stop-color="#8c9298"/></linearGradient>
  <linearGradient id="bois" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9d9bf"/><stop offset="1" stop-color="#cdb593"/></linearGradient>
  <linearGradient id="blanc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e6ea"/></linearGradient>
  <linearGradient id="sombre" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3a37"/><stop offset="1" stop-color="#1f1e1c"/></linearGradient>
  <radialGradient id="flaque" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9cc9ee" stop-opacity=".9"/><stop offset="1" stop-color="#6fa3cf" stop-opacity=".35"/></radialGradient>
  <radialGradient id="tache" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3f4a2e" stop-opacity=".85"/><stop offset=".6" stop-color="#58603b" stop-opacity=".45"/><stop offset="1" stop-color="#6f7348" stop-opacity="0"/></radialGradient>
  <radialGradient id="aureole" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#b59a6a" stop-opacity=".55"/><stop offset="1" stop-color="#b59a6a" stop-opacity="0"/></radialGradient>
  <radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
  <filter id="flou" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="ombre" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".25"/></filter>
</defs>
"""


def _bandeau(libelle: str) -> str:
    return (
        f'<rect x="0" y="{H - 64}" width="{L}" height="64" fill="#0f2352" fill-opacity=".82"/>'
        f'<text x="28" y="{H - 23}" font-family="Figtree, sans-serif" font-size="30" font-weight="700" fill="#ffffff">'
        f'PHOTO FICTIVE — RECETTE GERIMMO</text>'
        f'<text x="{L - 28}" y="{H - 23}" text-anchor="end" font-family="Figtree, sans-serif" font-size="28" fill="#dfe9ff">{libelle}</text>'
    )


def _cadre(contenu: str, libelle: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {L} {H}" width="{L}" height="{H}">{DEFS}'
        f'{contenu}<rect width="{L}" height="{H}" fill="url(#vignette)"/>{_bandeau(libelle)}</svg>'
    )


# ---------------------------------------------------------------- pièces

def _radiateur(x: int, y: int, l: int, h: int) -> str:
    ailettes = "".join(
        f'<rect x="{x + 10 + i * 26}" y="{y + 8}" width="16" height="{h - 16}" rx="7" fill="#ffffff" stroke="#d5d8dc"/>'
        for i in range(int((l - 20) / 26))
    )
    return f'<rect x="{x}" y="{y}" width="{l}" height="{h}" rx="10" fill="#eef0f2" filter="url(#ombre)"/>{ailettes}'


# ---------------------------------------------------------------- incidents

def scene_fuite_evier() -> str:
    c = f'<rect width="{L}" height="{H}" fill="#e8e4dc"/>'
    c += '<rect x="160" y="80" width="1280" height="1040" rx="10" fill="#f6f4f0" stroke="#d2cdc2" stroke-width="6"/>'
    c += '<rect x="220" y="140" width="1160" height="900" fill="url(#sombre)"/>'
    c += '<rect x="220" y="140" width="1160" height="120" fill="#2b2a28"/>'
    c += '<rect x="620" y="120" width="360" height="90" rx="12" fill="url(#chrome)"/>'
    c += '<rect x="775" y="200" width="50" height="210" fill="url(#pvc)"/>'
    c += '<path d="M800 410 L800 520 Q800 600 880 600 Q960 600 960 520 L960 470" stroke="url(#pvc)" stroke-width="56" fill="none" stroke-linecap="round"/>'
    c += '<rect x="930" y="430" width="400" height="56" rx="10" fill="url(#pvc)"/>'
    c += '<ellipse cx="800" cy="415" rx="44" ry="16" fill="#b8bdc2"/>'
    c += '<path d="M770 420 Q740 520 760 640" stroke="#9fd0f5" stroke-width="10" fill="none" stroke-opacity=".9"/>'
    for (x, y, r) in ((752, 660, 12), (748, 720, 10), (755, 790, 14), (760, 860, 11)):
        c += f'<ellipse cx="{x}" cy="{y}" rx="{r * .7}" ry="{r}" fill="#a8d7f7" fill-opacity=".9"/>'
    c += '<ellipse cx="760" cy="960" rx="360" ry="70" fill="url(#flaque)"/>'
    c += '<ellipse cx="700" cy="950" rx="120" ry="18" fill="#ffffff" fill-opacity=".35"/>'
    c += '<rect x="1060" y="820" width="180" height="200" rx="18" fill="#2f6fbd"/><rect x="1080" y="800" width="140" height="30" rx="10" fill="#3a7fd0"/>'
    c += '<text x="1150" y="940" text-anchor="middle" font-family="Figtree" font-size="34" fill="#fff" font-weight="700">seau</text>'
    c += '<g font-family="Figtree" font-size="34" font-weight="700" fill="#ffd166"><text x="300" y="330">Fuite au raccord du siphon</text></g>'
    c += '<circle cx="800" cy="440" r="90" fill="none" stroke="#ffd166" stroke-width="8" stroke-dasharray="18 12"/>'
    return _cadre(c, "Cuisine — fuite sous l'évier")


def scene_moisissure() -> str:
    c = f'<rect width="{L}" height="{H}" fill="#e9e6df"/>'
    c += f'<polygon points="0,0 {L},0 {L},520 0,720" fill="url(#plafond)"/>'
    c += f'<polygon points="0,720 {L},520 {L},{H} 0,{H}" fill="#dfe6ea"/>'
    for y in range(560, H, 70):
        c += f'<line x1="0" y1="{y + 200 - y * .12:.0f}" x2="{L}" y2="{y:.0f}" stroke="#ffffff" stroke-width="3"/>'
    random.seed(7)
    for _ in range(26):
        x = random.randint(820, 1480)
        y = random.randint(120, 540)
        r = random.randint(40, 150)
        c += f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * .7:.0f}" fill="url(#tache)"/>'
    c += '<ellipse cx="1150" cy="330" rx="420" ry="250" fill="url(#aureole)"/>'
    c += '<g filter="url(#ombre)"><circle cx="420" cy="300" r="90" fill="#f5f6f7" stroke="#cfd3d7" stroke-width="5"/>'
    for i in range(5):
        c += f'<line x1="360" y1="{260 + i * 20}" x2="480" y2="{260 + i * 20}" stroke="#bfc4c9" stroke-width="5"/>'
    c += '</g><text x="330" y="440" font-family="Figtree" font-size="30" fill="#5d6770">VMC</text>'
    c += '<text x="900" y="640" font-family="Figtree" font-size="36" font-weight="700" fill="#b3261e">Moisissures au plafond</text>'
    return _cadre(c, "Salle d'eau — tache d'humidité au plafond")


def scene_radiateur() -> str:
    c = f'<rect width="{L}" height="{H}" fill="url(#mur)"/>'
    c += f'<rect x="0" y="980" width="{L}" height="220" fill="url(#parquet)"/>'
    c += _radiateur(260, 420, 1000, 460)
    c += '<rect x="1260" y="780" width="120" height="44" fill="url(#chrome)"/><rect x="1380" y="770" width="40" height="230" fill="url(#chrome)"/>'
    c += '<g transform="rotate(-28 1320 700)"><rect x="1270" y="600" width="100" height="160" rx="30" fill="#ffffff" stroke="#c9cdd2" stroke-width="5"/>'
    c += '<text x="1320" y="690" text-anchor="middle" font-family="Figtree" font-size="40" font-weight="700" fill="#8a9097">3</text></g>'
    c += '<path d="M1250 760 L1290 800 M1300 740 L1340 790" stroke="#b3261e" stroke-width="8"/>'
    c += '<text x="260" y="360" font-family="Figtree" font-size="38" font-weight="700" fill="#b3261e">Radiateur froid — tête thermostatique cassée</text>'
    c += '<g font-family="Figtree" font-size="32" fill="#2c3e50"><rect x="260" y="920" width="360" height="54" rx="10" fill="#ffffff" fill-opacity=".85"/><text x="280" y="958">Température : 14 °C</text></g>'
    return _cadre(c, "Chambre — radiateur hors service")


def scene_volet() -> str:
    c = f'<rect width="{L}" height="{H}" fill="url(#mur)"/>'
    c += '<rect x="330" y="130" width="940" height="900" fill="#fbfbfa" filter="url(#ombre)"/>'
    c += '<rect x="370" y="170" width="860" height="820" fill="url(#ciel)"/>'
    for i in range(12):
        y = 170 + i * 42
        angle = 0 if i < 10 else (7 if i == 10 else -9)
        c += f'<rect x="370" y="{y}" width="860" height="38" fill="#e3e6e9" stroke="#c4c9ce" stroke-width="2" transform="rotate({angle} 800 {y + 19})"/>'
    c += '<rect x="370" y="700" width="860" height="290" fill="#8db0cf" fill-opacity=".35"/>'
    c += '<rect x="1300" y="520" width="60" height="140" rx="12" fill="#f4f5f6" stroke="#cdd2d6" stroke-width="4"/><circle cx="1330" cy="560" r="14" fill="#9aa1a8"/><circle cx="1330" cy="620" r="14" fill="#9aa1a8"/>'
    c += '<text x="400" y="1090" font-family="Figtree" font-size="36" font-weight="700" fill="#b3261e">Volet roulant bloqué à mi-hauteur, lames sorties du rail</text>'
    return _cadre(c, "Séjour — volet roulant bloqué")


def scene_prise() -> str:
    c = f'<rect width="{L}" height="{H}" fill="url(#mur)"/>'
    c += '<g filter="url(#ombre)"><rect x="560" y="360" width="480" height="480" rx="40" fill="#fbfbfb" stroke="#d3d6da" stroke-width="6"/></g>'
    c += '<g transform="rotate(14 800 600)"><rect x="620" y="420" width="360" height="360" rx="30" fill="#f1f2f3" stroke="#c9cdd1" stroke-width="5"/>'
    c += '<circle cx="740" cy="600" r="22" fill="#2b2b2b"/><circle cx="860" cy="600" r="22" fill="#2b2b2b"/></g>'
    c += '<path d="M700 840 C720 900 690 960 720 1010" stroke="#b5651d" stroke-width="10" fill="none"/><path d="M760 840 C780 910 750 950 780 1020" stroke="#2f6fbd" stroke-width="10" fill="none"/>'
    c += '<path d="M600 380 L660 330 L630 420" fill="#3a3a3a" fill-opacity=".35"/>'
    c += '<text x="440" y="300" font-family="Figtree" font-size="40" font-weight="700" fill="#b3261e">Prise arrachée, fils apparents — ne pas toucher</text>'
    return _cadre(c, "Chambre — prise électrique arrachée")


def scene_apres_reparation() -> str:
    c = f'<rect width="{L}" height="{H}" fill="#e8e4dc"/>'
    c += '<rect x="160" y="80" width="1280" height="1040" rx="10" fill="#f6f4f0" stroke="#d2cdc2" stroke-width="6"/>'
    c += '<rect x="220" y="140" width="1160" height="900" fill="url(#sombre)"/>'
    c += '<rect x="620" y="120" width="360" height="90" rx="12" fill="url(#chrome)"/>'
    c += '<rect x="775" y="200" width="50" height="210" fill="url(#chrome)"/>'
    c += '<path d="M800 410 L800 520 Q800 600 880 600 Q960 600 960 520 L960 470" stroke="url(#chrome)" stroke-width="56" fill="none" stroke-linecap="round"/>'
    c += '<rect x="930" y="430" width="400" height="56" rx="10" fill="url(#chrome)"/>'
    c += '<rect x="700" y="640" width="220" height="70" rx="8" fill="#ffffff"/><text x="810" y="686" text-anchor="middle" font-family="Figtree" font-size="30" font-weight="700" fill="#1f7a3d">NEUF</text>'
    c += '<rect x="240" y="940" width="1120" height="80" fill="#2b2a28"/>'
    c += '<text x="300" y="330" font-family="Figtree" font-size="34" font-weight="700" fill="#9be7b0">Siphon remplacé — plus de fuite, fond du meuble sec</text>'
    c += '<circle cx="1220" cy="780" r="90" fill="#1f7a3d"/><path d="M1175 780 L1210 815 L1270 745" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round"/>'
    return _cadre(c, "Cuisine — après intervention")


def scene_radiateur_repare() -> str:
    c = f'<rect width="{L}" height="{H}" fill="url(#mur)"/>'
    c += f'<rect x="0" y="980" width="{L}" height="220" fill="url(#parquet)"/>'
    c += _radiateur(260, 420, 1000, 460)
    c += '<rect x="1260" y="780" width="120" height="44" fill="url(#chrome)"/><rect x="1380" y="770" width="40" height="230" fill="url(#chrome)"/>'
    c += '<rect x="1270" y="600" width="100" height="160" rx="30" fill="#ffffff" stroke="#9aa3ad" stroke-width="5"/>'
    c += '<text x="1320" y="690" text-anchor="middle" font-family="Figtree" font-size="40" font-weight="700" fill="#1f7a3d">4</text>'
    c += '<text x="260" y="360" font-family="Figtree" font-size="38" font-weight="700" fill="#1f7a3d">Tête thermostatique neuve, circuit purgé</text>'
    c += '<g font-family="Figtree" font-size="32" fill="#2c3e50"><rect x="260" y="920" width="360" height="54" rx="10" fill="#ffffff" fill-opacity=".85"/><text x="280" y="958">Température : 20 °C</text></g>'
    c += '<circle cx="1180" cy="330" r="80" fill="#1f7a3d"/><path d="M1140 330 L1172 362 L1225 300" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round"/>'
    return _cadre(c, "Chambre — après intervention")


def scene_fuite_detail() -> str:
    """Même fuite, vue rapprochée : la photo que l'agence ajoute à l'incident."""
    return scene_fuite_evier().replace("Fuite au raccord du siphon", "Le joint du siphon goutte en continu").replace(
        "Cuisine — fuite sous l'évier", "Cuisine — détail du raccord qui fuit")


def scene_avant_siphon() -> str:
    """La photo « avant » de l'artisan (octets différents de celle du locataire)."""
    return scene_fuite_evier().replace("Fuite au raccord du siphon", "Avant intervention : siphon d'origine fissuré").replace(
        "Cuisine — fuite sous l'évier", "Cuisine — avant intervention")


PHOTOS = {
    # incidents (déclaration du locataire, photo ajoutée par le gestionnaire)
    "incident-fuite-evier": scene_fuite_evier,
    "incident-fuite-evier-detail": scene_fuite_detail,
    "incident-moisissure-plafond": scene_moisissure,
    "incident-radiateur-froid": scene_radiateur,
    "incident-volet-bloque": scene_volet,
    "incident-prise-arrachee": scene_prise,
    # compte rendu de l'artisan (dépôt depuis un ordinateur)
    "intervention-avant-siphon": scene_avant_siphon,
    "intervention-apres-siphon": scene_apres_reparation,
    "intervention-apres-radiateur": scene_radiateur_repare,
}


def produire_photo(nom: str, dossier: Path) -> Path:
    png = svg_vers_png(PHOTOS[nom](), dossier / f"{nom}.png", L, H)
    return png_vers_jpg(png, dossier / f"{nom}.jpg")


# ---------------------------------------------------------------- logos

def svg_logo_agence(horizontal: bool, couleur: str = "#1f5fbf", accent: str = "#f2a541") -> str:
    embleme = (
        f'<circle cx="0" cy="0" r="120" fill="{couleur}"/>'
        f'<path d="M-78 18 A78 78 0 0 1 78 18 Z" fill="{accent}"/>'
        f'<rect x="-96" y="30" width="192" height="12" rx="6" fill="#ffffff"/>'
        f'<rect x="-72" y="54" width="144" height="10" rx="5" fill="#ffffff" fill-opacity=".8"/>'
        f'<rect x="-44" y="76" width="88" height="8" rx="4" fill="#ffffff" fill-opacity=".6"/>'
    )
    if horizontal:
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 500">'
            f'<g transform="translate(250 250) scale(1.25)">{embleme}</g>'
            f'<text x="470" y="240" font-family="Manrope" font-weight="800" font-size="150" fill="#0f2352" letter-spacing="-3">Horizon</text>'
            f'<text x="476" y="350" font-family="Manrope" font-weight="600" font-size="84" fill="{couleur}" letter-spacing="14">GESTION</text>'
            '</svg>'
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
        f'<g transform="translate(512 400) scale(2)">{embleme}</g>'
        f'<text x="512" y="820" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="128" fill="#0f2352" letter-spacing="-2">Horizon</text>'
        f'<text x="512" y="930" text-anchor="middle" font-family="Manrope" font-weight="600" font-size="72" fill="{couleur}" letter-spacing="12">GESTION</text>'
        '</svg>'
    )


# ---------------------------------------------------------------- signatures

def svg_signature(nom: str, graine: int, couleur: str = "#1b2a6b") -> str:
    """Un paraphe manuscrit : le nom à la plume, souligné d'un trait libre.

    Format 660 × 200 (rapport 3,3:1, celui de la zone de signature des
    quittances et courriers de Gerimmo), fond transparent.
    """
    rnd = random.Random(graine)
    inclinaison = rnd.uniform(-5, -2)
    depart = rnd.randint(50, 110)
    fin = rnd.randint(470, 600)
    creux = rnd.randint(150, 164)
    trait = (
        f"M{depart} {creux + 6} C {depart + 130} {creux - 14} {fin - 180} {creux + 22} {fin} {creux - 5} "
        f"S {fin + 24} {creux - 24} {fin - 34} {creux - 3}"
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 200">'
        f'<g transform="rotate({inclinaison:.1f} 330 100)">'
        f'<text x="330" y="122" text-anchor="middle" font-family="Paraphe" font-size="112" fill="{couleur}">{nom}</text>'
        f'<path d="{trait}" stroke="{couleur}" stroke-width="3.6" fill="none" stroke-linecap="round"/></g>'
        '</svg>'
    )


def produire_logo_agence(dossier: Path) -> list[Path]:
    """Deux versions du logo, toutes deux sous la limite de 200 Ko de Gerimmo.

    L'affichage se fait dans un cadre de 180 × 44 px : la version large
    (600 × 150) est celle à déposer ; la grande (1 600 × 500) sert à vérifier
    qu'un fichier plus lourd mais sous la limite passe aussi.
    """
    large = svg_vers_png(svg_logo_agence(True), dossier / "logo-horizon-gestion-600x150.png", 600, 150, transparent=True)
    grand = svg_vers_png(svg_logo_agence(True), dossier / "logo-horizon-gestion-1600x500.png", 1600, 500, transparent=True)
    return [large, grand]


def produire_signature(nom_fichier: str, nom: str, graine: int, dossier: Path) -> Path:
    return svg_vers_png(svg_signature(nom, graine), dossier / nom_fichier, 660, 200, transparent=True)


def signature_svg_en_ligne(nom: str, graine: int, largeur_px: int = 220) -> str:
    """Le même paraphe, à poser dans un PDF (attestations, factures, relevés)."""
    svg = svg_signature(nom, graine)
    return svg.replace("<svg ", f'<svg style="width:{largeur_px}px;height:auto" ', 1)


if __name__ == "__main__":
    import sys

    sortie = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/essai-images")
    sortie.mkdir(parents=True, exist_ok=True)
    for nom in PHOTOS:
        print(produire_photo(nom, sortie))
    print(produire_logo_agence(sortie))
    print(produire_signature("signature-essai.png", "N. Bensaïd", 11, sortie))
