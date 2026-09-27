"""Rendu HTML -> PDF / PNG / JPEG par Chrome sans interface.

Même moteur que les documents de l'application (Chrome), piloté ici en ligne
de commande pour ne dépendre d'aucun paquet Node. Chrome est cherché dans
l'ordre : variable KIT_CHROME, Chromium de Playwright, Chrome de macOS,
Chrome/Chromium de Linux.
"""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ICI = Path(__file__).resolve().parent
POLICES = ICI / "polices"

CHEMINS_CHROME = [
    os.environ.get("KIT_CHROME"),
    "/opt/pw-browsers/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


def chrome() -> str:
    for chemin in CHEMINS_CHROME:
        if chemin and Path(chemin).exists():
            return chemin
    trouve = shutil.which("google-chrome") or shutil.which("chromium")
    if trouve:
        return trouve
    raise SystemExit("Chrome introuvable : installez Google Chrome ou renseignez KIT_CHROME.")


def _police(fichier: str) -> str:
    donnees = (POLICES / fichier).read_bytes()
    return "data:font/woff2;base64," + base64.b64encode(donnees).decode("ascii")


def css_polices() -> str:
    """@font-face de Manrope (titres) et Figtree (texte), embarquées en base64."""
    regles = []
    for graisse in (400, 500, 600, 700, 800):
        regles.append(
            "@font-face{font-family:'Manrope';font-style:normal;font-weight:%d;"
            "src:url(%s) format('woff2');}" % (graisse, _police(f"manrope-latin-{graisse}-normal.woff2"))
        )
        regles.append(
            "@font-face{font-family:'Figtree';font-style:normal;font-weight:%d;"
            "src:url(%s) format('woff2');}" % (graisse, _police(f"figtree-latin-{graisse}-normal.woff2"))
        )
    regles.append(
        "@font-face{font-family:'Figtree';font-style:italic;font-weight:400;"
        "src:url(%s) format('woff2');}" % _police("figtree-latin-400-italic.woff2")
    )
    # Écriture manuscrite des signatures fictives (bail signé, mandat, attestations).
    regles.append(
        "@font-face{font-family:'Paraphe';font-style:normal;font-weight:400;"
        "src:url(%s) format('woff2');}" % _police("mrs-saint-delafield-latin-400-normal.woff2")
    )
    return "\n".join(regles)


def _lancer(args: list[str]) -> None:
    resultat = subprocess.run(
        [chrome(), "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         "--no-first-run", "--disable-extensions", "--mute-audio",
         "--run-all-compositor-stages-before-draw", "--virtual-time-budget=4000", *args],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if resultat.returncode != 0:
        raise RuntimeError(f"Chrome a échoué ({resultat.returncode}) : {resultat.stderr[-800:]}")


def html_vers_pdf(html: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as dossier:
        source = Path(dossier) / "page.html"
        source.write_text(html, encoding="utf-8")
        _lancer(["--no-pdf-header-footer", f"--print-to-pdf={destination}", source.as_uri()])
    if not destination.exists() or destination.stat().st_size == 0:
        raise RuntimeError(f"PDF non produit : {destination}")
    return destination


def html_vers_png(html: str, destination: Path, largeur: int, hauteur: int, transparent: bool = False) -> Path:
    """Capture la page au format exact demandé.

    En mode sans interface, la zone peinte est plus basse que la fenêtre
    (la barre d'outils fantôme garde sa place) : on capture une fenêtre plus
    haute, puis on recadre au pixel près.
    """
    from PIL import Image

    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as dossier:
        source = Path(dossier) / "page.html"
        source.write_text(html, encoding="utf-8")
        capture = Path(dossier) / "capture.png"
        args = [f"--screenshot={capture}", f"--window-size={largeur},{hauteur + 240}",
                "--force-device-scale-factor=1"]
        if transparent:
            args.append("--default-background-color=00000000")
        _lancer([*args, source.as_uri()])
        if not capture.exists():
            raise RuntimeError(f"Image non produite : {destination}")
        with Image.open(capture) as image:
            image.crop((0, 0, largeur, hauteur)).save(destination, optimize=True)
    return destination


def svg_vers_png(svg: str, destination: Path, largeur: int, hauteur: int, transparent: bool = False) -> Path:
    fond = "transparent" if transparent else "#ffffff"
    html = (
        "<!doctype html><html><head><meta charset='utf-8'><style>"
        f"html,body{{margin:0;padding:0;background:{fond};width:{largeur}px;height:{hauteur}px;overflow:hidden}}"
        f"svg{{display:block;width:{largeur}px;height:{hauteur}px}}"
        f"{css_polices()}</style></head><body>{svg}</body></html>"
    )
    return html_vers_png(html, destination, largeur, hauteur, transparent=transparent)


def png_vers_jpg(source: Path, destination: Path, qualite: int = 84) -> Path:
    """Convertit en JPEG (le format d'une photo de téléphone) et retire le PNG."""
    from PIL import Image

    with Image.open(source) as image:
        image.convert("RGB").save(destination, "JPEG", quality=qualite, optimize=True, progressive=True)
    source.unlink()
    return destination
