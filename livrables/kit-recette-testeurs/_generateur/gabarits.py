"""Gabarits HTML des pièces du kit : fiches (charte Gerimmo) et documents fictifs."""

from __future__ import annotations

import html as _html
import re

from rendu import css_polices

ENCRE = "#0f2352"
MARQUE = "#2457f5"
CORPS = "#151b2b"
SECONDAIRE = "#4b5870"
FILET = "#d9e1ef"
FOND = "#f2f5fb"

COULEURS_PERSONA = {
    "agence": "#2457f5",
    "locataire-agence": "#15803d",
    "proprietaire": "#7c3aed",
    "locataire-proprietaire": "#be185d",
    "artisan": "#c2410c",
    "coordinateur": "#0f2352",
    "commun": "#2457f5",
}


def e(texte: str) -> str:
    """Échappe un texte pour le HTML."""
    return _html.escape(str(texte), quote=True)


# ------------------------------------------------------------------ Markdown -> HTML

# Raccourcis utilisés dans les textes du kit : ⟦b|Créer le bien⟧ (bouton),
# ⟦m|Parc⟧ (menu), ⟦f|fichier.pdf⟧ (fichier du dossier), ⟦v|890 €⟧ (valeur à
# saisir), ⟦c|Code postal⟧ (libellé de champ). Le Markdown du dépôt les rend en
# texte simple ; le PDF les met en forme.
_RACCOURCI = re.compile(r"⟦([bmfvc])\|([^⟧]+?)⟧")

_HTML_RACCOURCI = {
    "b": '<span class="bouton">{}</span>',
    "m": '<span class="menu">{}</span>',
    "f": '<code class="fichier">{}</code>',
    "v": '<span class="valeur">{}</span>',
    "c": '<span class="champ">{}</span>',
}
_MD_RACCOURCI = {
    "b": "**[{}]**",
    "m": "**{}**",
    "f": "`{}`",
    "v": "**{}**",
    "c": "*{}*",
}

_ENCADRES = {"note": "", "info": "", "tip": "ok", "success": "ok", "warning": "alerte",
             "danger": "danger", "important": "danger", "paiement": "danger"}


def _une_ligne(texte: str) -> str:
    return re.sub(r"\s*\n\s*", " ", texte)


def raccourcis_md(texte: str) -> str:
    """Le texte pour le dépôt (Obsidian, GitHub) : raccourcis rendus en Markdown."""
    return _RACCOURCI.sub(lambda m: _MD_RACCOURCI[m.group(1)].format(_une_ligne(m.group(2))), texte)


def _raccourcis_html(texte: str) -> str:
    return _RACCOURCI.sub(lambda m: _HTML_RACCOURCI[m.group(1)].format(e(_une_ligne(m.group(2)))), texte)


def _encadres(texte: str) -> str:
    """Les encadrés Obsidian `> [!warning] Titre` deviennent des <div> mis en forme."""
    lignes = texte.split("\n")
    sortie: list[str] = []
    i = 0
    while i < len(lignes):
        m = re.match(r"^> \[!(\w+)\]\s*(.*)$", lignes[i])
        if not m:
            sortie.append(lignes[i])
            i += 1
            continue
        genre, titre = m.group(1).lower(), m.group(2).strip()
        i += 1
        contenu = []
        while i < len(lignes) and lignes[i].startswith(">"):
            contenu.append(lignes[i][1:].lstrip(" ") if lignes[i] != ">" else "")
            i += 1
        classe = _ENCADRES.get(genre, "")
        entete = f'<div class="titre">{titre}</div>\n' if titre else ""
        sortie.append(f'<div class="encadre {classe}" markdown="1">\n{entete}\n' + "\n".join(contenu) + "\n</div>\n")
    return "\n".join(sortie)


def md_vers_html(texte: str) -> str:
    import markdown

    return markdown.markdown(
        _encadres(_raccourcis_html(texte)),
        extensions=["tables", "attr_list", "md_in_html", "sane_lists", "fenced_code"],
        output_format="html5",
    )


# ------------------------------------------------------------------ fiches

CSS_KIT = """
:root{--accent:#2457f5;--encre:#0f2352;--corps:#151b2b;--second:#4b5870;--filet:#d9e1ef;--fond:#f2f5fb;
--ok:#15803d;--ko:#b91c1c;--alerte:#b45309}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Figtree',sans-serif;font-size:10.2pt;line-height:1.45;color:var(--corps)}
h1,h2,h3,h4{font-family:'Manrope',sans-serif;color:var(--encre);line-height:1.2;margin:0}
h1{font-size:23pt;font-weight:800;letter-spacing:-.4px}
h2{font-size:14.5pt;font-weight:800;margin:20px 0 8px;padding-bottom:5px;border-bottom:2px solid var(--accent);break-after:avoid}
h3{font-size:11.5pt;font-weight:700;margin:14px 0 6px;break-after:avoid}
h4{font-size:10.4pt;font-weight:700;margin:10px 0 4px;break-after:avoid}
p{margin:0 0 7px}
ul,ol{margin:0 0 8px;padding-left:20px}
li{margin:0 0 3px}
a{color:var(--accent);text-decoration:none}
code,.fichier{font-family:'DejaVu Sans Mono',Menlo,monospace;font-size:8.6pt;background:#eef2fa;border:1px solid #dfe6f3;border-radius:4px;padding:0 4px;color:#1a2d5a}
.fichier{white-space:nowrap}
pre{background:#0f2352;color:#e8eefc;border-radius:10px;padding:10px 13px;margin:6px 0 10px;font-family:'DejaVu Sans Mono',Menlo,monospace;font-size:8.6pt;line-height:1.5;white-space:pre-wrap;break-inside:avoid}
pre code{background:none;border:none;color:inherit;padding:0;font-size:inherit}
.fichier::before{content:"📎 ";font-family:'Figtree'}
kbd{font-family:'Figtree';font-weight:700;font-size:9.2pt;background:#fff;border:1px solid #c9d3e6;border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--encre);white-space:nowrap}
.bouton{display:inline-block;font-weight:700;font-size:9.2pt;background:var(--accent);color:#fff;border-radius:6px;padding:0 6px;white-space:nowrap}
.menu{font-weight:700;color:var(--encre);white-space:nowrap}
.valeur{font-weight:700;color:#0b3d91;background:#eaf1ff;border-radius:4px;padding:0 4px}
.champ{font-weight:600;color:#1a2d5a;border-bottom:1px dashed #9fb3d9;white-space:nowrap}
.couverture{background:linear-gradient(135deg,var(--encre),#1d3a7e);color:#fff;border-radius:18px;padding:26px 28px 22px;margin-bottom:16px;position:relative;overflow:hidden}
.couverture::after{content:"";position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:var(--accent);opacity:.55}
.couverture h1{color:#fff;position:relative;z-index:1}
.couverture .sur{font-family:'Manrope';font-weight:700;font-size:9.5pt;letter-spacing:2px;text-transform:uppercase;color:#bcd0ff;position:relative;z-index:1;margin-bottom:6px}
.couverture .sous{color:#dbe6ff;font-size:11pt;margin-top:8px;position:relative;z-index:1;max-width:80%}
.pastille{display:inline-block;background:var(--accent);color:#fff;font-weight:700;font-size:8.6pt;border-radius:999px;padding:2px 9px;margin-right:4px;white-space:nowrap}
.pastille.claire{background:#eaf1ff;color:#1a44cf}
.pastille.alerte{background:#fff4e5;color:#9a3412}
.pastille.ok{background:#e7f7ec;color:#166534}
.pastille.paiement{background:#fde8e8;color:#991b1b}
.encadre{border:1px solid var(--filet);border-left:5px solid var(--accent);background:#f7f9fe;border-radius:10px;padding:10px 12px;margin:10px 0;break-inside:avoid}
.encadre.alerte{border-left-color:#d97706;background:#fffaf0}
.encadre.danger{border-left-color:#dc2626;background:#fff5f5}
.encadre.ok{border-left-color:#16a34a;background:#f3fbf5}
.encadre .titre{font-family:'Manrope';font-weight:800;color:var(--encre);margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:9.4pt}
th{background:var(--encre);color:#fff;font-family:'Manrope';font-weight:700;text-align:left;padding:5px 7px;font-size:9pt}
td{border-bottom:1px solid var(--filet);padding:5px 7px;vertical-align:top}
tr:nth-child(even) td{background:#f8fafd}
table.donnees td:first-child{width:36%;color:var(--second);font-weight:600}
table.donnees td:last-child{font-weight:700;color:#0b2b6b}
.grille2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.carte{border:1px solid var(--filet);border-radius:12px;padding:10px 12px;background:#fff;break-inside:avoid}
.test{border:1px solid var(--filet);border-radius:12px;margin:12px 0;break-inside:avoid-page;background:#fff;overflow:hidden}
.test .entete{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f3f6fc;border-bottom:1px solid var(--filet)}
.test .id{font-family:'Manrope';font-weight:800;color:#fff;background:var(--accent);border-radius:7px;padding:3px 8px;font-size:9.6pt;white-space:nowrap}
.test .nom{font-family:'Manrope';font-weight:800;color:var(--encre);font-size:11pt;flex:1}
.test .duree{color:var(--second);font-size:8.8pt;white-space:nowrap}
.test .corps{padding:8px 12px 10px}
.test .meta{font-size:9pt;color:var(--second);margin-bottom:6px}
.test .meta b{color:var(--corps)}
.test ol.etapes{margin:4px 0 6px;padding-left:22px}
.test ol.etapes li{margin-bottom:4px}
.test .attendu{background:#f3fbf5;border:1px solid #cdeed8;border-radius:8px;padding:6px 9px;margin-top:6px;font-size:9.4pt}
.test .attendu b{color:var(--ok)}
.test .verdict{display:flex;gap:14px;align-items:center;margin-top:8px;font-size:9.2pt;color:var(--second);flex-wrap:wrap}
.case{display:inline-block;width:12px;height:12px;border:1.6px solid #6b7a96;border-radius:3px;vertical-align:-2px;margin-right:4px}
.ligne-ecrire{display:inline-block;border-bottom:1px dotted #8a97b0;min-width:130px;height:12px}
.brouillon td{height:62px}
.sommaire td:first-child{width:70px;font-weight:800;color:var(--accent);font-family:'Manrope'}
.petit{font-size:8.8pt;color:var(--second)}
.saut{break-before:page}
.garder{break-inside:avoid}
.col2{columns:2;column-gap:18px}
.col2 li{break-inside:avoid}
.chrono{display:grid;grid-template-columns:78px 1fr;gap:6px 12px;margin:6px 0}
.chrono .j{font-family:'Manrope';font-weight:800;color:#fff;background:var(--accent);border-radius:8px;text-align:center;padding:4px 0;height:fit-content}
.fil{counter-reset:fil}
.fil > div{position:relative;padding-left:34px;margin-bottom:8px;break-inside:avoid}
.fil > div::before{counter-increment:fil;content:counter(fil);position:absolute;left:0;top:0;width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-family:'Manrope';font-weight:800;font-size:10pt;display:flex;align-items:center;justify-content:center}
"""


def page_kit(titre: str, pied: str, corps: str, couleur: str = MARQUE) -> str:
    """Une fiche du kit, au format A4, numérotée, à la charte Gerimmo."""
    pied_css = pied.replace('"', "'")
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{e(titre)}</title><style>
{css_polices()}
{CSS_KIT}
:root{{--accent:{couleur}}}
@page{{size:A4;margin:14mm 13mm 16mm;
  @bottom-left{{content:"{pied_css}";font:8pt 'Figtree',sans-serif;color:#4b5870}}
  @bottom-right{{content:"Page " counter(page) " / " counter(pages);font:8pt 'Figtree',sans-serif;color:#4b5870}}}}
</style></head><body>{corps}</body></html>"""


# ------------------------------------------------------------------ documents fictifs

CSS_FICTIF = """
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Liberation Sans',Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:#1d2330}
.serif{font-family:'Liberation Serif','Times New Roman',serif}
h1{font-size:16pt;margin:0 0 4px;color:#1d2330}
h2{font-size:11.5pt;margin:14px 0 6px;color:#1d2330;border-bottom:1px solid #b9c0cc;padding-bottom:3px}
p{margin:0 0 6px}
table{width:100%;border-collapse:collapse;margin:6px 0 10px}
th,td{border:1px solid #b9c0cc;padding:4px 6px;text-align:left;vertical-align:top;font-size:9.4pt}
th{background:#eef0f4}
td.n,th.n{text-align:right;white-space:nowrap}
.entete{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #1d2330;padding-bottom:8px;margin-bottom:12px}
.entete .emetteur{font-size:9pt;line-height:1.35}
.entete .emetteur b{font-size:11pt}
.logo-fictif{width:54px;height:54px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18pt;flex:none}
.cadre{border:1px solid #9aa3b2;border-radius:6px;padding:8px 10px;margin:8px 0}
.gris{color:#5b6475}
.petit{font-size:8.4pt}
.signature{margin-top:14px;display:flex;justify-content:flex-end}
.signature .bloc{text-align:center;font-size:9pt}
.tampon{display:inline-block;border:2px solid #9f1239;color:#9f1239;border-radius:8px;padding:4px 10px;font-weight:700;transform:rotate(-6deg);font-size:9pt;letter-spacing:.5px}
.filigrane{position:fixed;top:36%;left:-10%;right:-10%;text-align:center;transform:rotate(-32deg);
  font-family:'Liberation Sans',Arial,sans-serif;font-weight:700;font-size:58pt;color:rgba(185,28,28,.13);white-space:nowrap;z-index:0;pointer-events:none}
.filigrane small{display:block;font-size:22pt;margin-top:6px}
.contenu{position:relative;z-index:1}
"""


def doc_fictif(titre: str, corps: str, filigrane: str = "SPÉCIMEN — DOCUMENT FICTIF") -> str:
    """Un document fictif : filigrane sur chaque page, mention en pied, aucune valeur."""
    pied = "Document FICTIF créé pour la recette de Gerimmo — sans aucune valeur — ne pas utiliser hors de la recette"
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{e(titre)}</title><style>
{css_polices()}
{CSS_FICTIF}
@page{{size:A4;margin:15mm 15mm 17mm;
  @bottom-center{{content:"{pied}";font:7.6pt 'Liberation Sans',Arial,sans-serif;color:#9f1239}}
  @bottom-right{{content:counter(page) "/" counter(pages);font:7.6pt 'Liberation Sans',Arial,sans-serif;color:#5b6475}}}}
</style></head><body><div class="filigrane">{e(filigrane)}<small>RECETTE GERIMMO — SANS VALEUR</small></div>
<div class="contenu">{corps}</div></body></html>"""
