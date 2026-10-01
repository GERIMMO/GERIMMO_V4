// Les images du kit : signature manuscrite (PNG transparent) et « photos »
// d'incident (illustrations vectorielles rendues en JPEG), toutes marquées
// comme fictives.
import { CSS_POLICES, echapper, htmlVersImage } from "./commun.mjs";

export async function pngSignature(chemin, texte, couleur = "#1e3a8a") {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_POLICES}
html,body{margin:0;background:transparent}
.s{width:660px;height:200px;position:relative;font-family:"Great Vibes",cursive;color:${couleur}}
.t{position:absolute;left:120px;top:18px;font-size:92px;transform:rotate(-5deg);white-space:nowrap}
svg{position:absolute;left:0;top:0}</style></head><body><div class="s">
<svg width="660" height="200" viewBox="0 0 660 200"><path d="M70 160 C 200 150, 330 158, 450 138 S 560 122, 600 112" fill="none" stroke="${couleur}" stroke-width="3.2" stroke-linecap="round"/><path d="M420 150 C 480 140, 520 132, 590 118" fill="none" stroke="${couleur}" stroke-width="2" stroke-linecap="round"/></svg>
<div class="t">${echapper(texte)}</div></div></body></html>`;
  await htmlVersImage(html, chemin, { largeur: 660, hauteur: 200, fondTransparent: true });
}

function cadrePhoto(scene, legende) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_POLICES}
html,body{margin:0}
.p{width:1600px;height:1200px;background:radial-gradient(circle at 50% 40%,#efece6,#cfc9bf);position:relative;font-family:"Inter",sans-serif;overflow:hidden}
.cadre{position:absolute;left:160px;top:80px;width:1280px;height:1040px;background:#f4f2ee;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:60px}
.scene{width:100%;height:100%;background:#2a2a2a;overflow:hidden;position:relative}
.bas{position:absolute;left:0;right:0;bottom:0;height:60px;background:#1e3a8a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:26px}
.bas b{letter-spacing:1px}</style></head><body><div class="p"><div class="cadre"><div class="scene">${scene}</div></div>
<div class="bas"><b>PHOTO FICTIVE — RECETTE GERIMMO</b><span>${echapper(legende)}</span></div></div></body></html>`;
}

/** Une vitre de fenêtre fêlée en étoile, vue depuis l'intérieur. */
export async function jpegVitreFelee(chemin) {
  const scene = `<svg width="1160" height="920" viewBox="0 0 1160 920">
<defs><linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ec5ea"/><stop offset="1" stop-color="#d7e8f5"/></linearGradient>
<linearGradient id="mur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9d2c4"/><stop offset="1" stop-color="#c7bfae"/></linearGradient></defs>
<rect width="1160" height="920" fill="url(#mur)"/>
<rect x="200" y="90" width="760" height="700" fill="#f6f3ec" stroke="#b9b1a2" stroke-width="10"/>
<rect x="240" y="130" width="330" height="620" fill="url(#ciel)" stroke="#eae6dd" stroke-width="14"/>
<rect x="590" y="130" width="330" height="620" fill="url(#ciel)" stroke="#eae6dd" stroke-width="14"/>
<g stroke="#ffffff" stroke-width="3" opacity=".9" fill="none">
<path d="M760 440 L690 360 M760 440 L850 330 M760 440 L870 470 M760 440 L820 560 M760 440 L700 540 M760 440 L640 450"/>
<path d="M720 400 L735 405 L742 388 M800 370 L812 395 L835 392 M820 480 L805 500 L830 512 M735 500 L752 492 L762 515"/>
<circle cx="760" cy="440" r="9" fill="#ffffff" opacity=".8"/></g>
<g stroke="#334155" stroke-width="2.2" opacity=".5" fill="none">
<path d="M760 440 L690 360 M760 440 L850 330 M760 440 L870 470 M760 440 L820 560 M760 440 L700 540 M760 440 L640 450"/></g>
<rect x="200" y="790" width="760" height="40" fill="#cfc6b4"/>
<rect x="120" y="830" width="920" height="90" fill="#8b7355"/>
<circle cx="760" cy="440" r="150" fill="none" stroke="#f59e0b" stroke-width="7" stroke-dasharray="22 14"/>
<text x="120" y="60" font-family="Inter" font-size="40" font-weight="700" fill="#1e3a8a">Vitre intérieure fêlée en étoile — chambre</text></svg>`;
  await htmlVersImage(cadrePhoto(scene, "Chambre — fenêtre côté cour"), chemin, { largeur: 1600, hauteur: 1200, type: "jpeg", qualite: 86 });
}
