// Socle de rendu des documents (sprint « Documents-0 »).
//
// L'ADN vient des épreuves `pdf-vierges/` (version 2026.11) : A4, encre
// #14304f, laiton #9a7b3f, corps Caladea 10,5 pt, titres en capitales très
// espacées entre deux filets, cartouches méta en deux colonnes, tableaux à
// filets fins, pied « Réf · Modèle · Empreinte · Généré avec Gerimmo ».
//
// Règle de fusion (décision Tahir 31/08) : une donnée absente n'arrête jamais
// la génération — le champ s'imprime comme dans l'épreuve, libellé en italique
// gris sur pointillés, et il est ajouté à la liste des manquants remise à
// l'utilisateur et à la recette.

import { createHash } from "node:crypto";
import { CSS_POLICES } from "./polices";

export const VERSION_MODELES = "2026.11-g1";

// ------------------------------------------------------------------
// Collecte des champs : valeur ou libellé d'épreuve
// ------------------------------------------------------------------
export class Fusion {
  manquants: string[] = [];

  // Une valeur présente s'imprime ; absente, le libellé de l'épreuve reste
  // en réserve et le champ est compté manquant (une seule fois par libellé).
  champ(valeur: string | number | null | undefined, libelle: string): string {
    const v = valeur === null || valeur === undefined ? "" : String(valeur).trim();
    if (v !== "") return `<span class="v">${echapper(v)}</span>`;
    if (!this.manquants.includes(libelle)) this.manquants.push(libelle);
    return `<span class="fusion">${echapper(libelle)}</span>`;
  }

  date(iso: string | null | undefined, libelle = "jj/mm/aaaa"): string {
    return this.champ(iso ? formaterDateFr(iso) : null, libelle);
  }

  montant(n: number | string | null | undefined, libelle = "montant"): string {
    if (n === null || n === undefined || n === "") return this.champ(null, libelle);
    return this.champ(eur(Number(n)), libelle);
  }
}

export function echapper(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formaterDateFr(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function eur(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Un montant dit en toutes lettres (dépôt de garantie du bail — exigence du
// modèle type). Couvre 0 à 999 999,99 €, largement au-delà des loyers réels.
export function montantEnLettres(n: number): string {
  const unites = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const dizaines = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  function centaine(x: number): string {
    const c = Math.floor(x / 100), r = x % 100;
    let s = c ? (c > 1 ? `${unites[c]} cent` : "cent") + (r ? " " : c > 1 && !r ? "s" : "") : "";
    if (r) {
      if (r < 20) s += unites[r];
      else {
        const d = Math.floor(r / 10), u = r % 10;
        const dz = dizaines[d];
        if (d === 7 || d === 9) s += `${dz}${u === 1 && d === 7 ? " et " : "-"}${unites[10 + u]}`;
        else s += dz + (u === 1 && d !== 8 ? " et un" : u ? `-${unites[u]}` : d === 8 ? "s" : "");
      }
    }
    return s;
  }
  const entier = Math.floor(n), cents = Math.round((n - entier) * 100);
  const milliers = Math.floor(entier / 1000), reste = entier % 1000;
  let s = "";
  if (milliers) s += (milliers > 1 ? `${centaine(milliers)} ` : "") + "mille" + (reste ? " " : "");
  if (reste || !milliers) s += centaine(reste) || (milliers ? "" : "zéro");
  s = s.trim() + (entier > 1 ? " euros" : " euro");
  if (cents) s += ` et ${centaine(cents)} centime${cents > 1 ? "s" : ""}`;
  return s;
}

// ------------------------------------------------------------------
// Briques HTML de l'épreuve
// ------------------------------------------------------------------
export type EnTeteExpediteur = {
  nom: string | null | undefined;
  adresse: string | null | undefined;
  email: string | null | undefined;
  telephone?: string | null;
};

// Bloc expéditeur + cartouche référence, sous filet (page 1 de chaque épreuve)
export function enTete(
  f: Fusion,
  exp: EnTeteExpediteur,
  cartouche: { libelle: string; reference: string | null | undefined; etabliLe: string }
): string {
  return `<header class="entete">
    <div class="exp">
      <div class="exp-nom">${f.champ(exp.nom, "nom et prénom(s), ou dénomination")}</div>
      <div>${f.champ(exp.adresse, "domicile ou siège social")}</div>
      <div>${f.champ(exp.email, "adresse électronique")}&nbsp;&nbsp;·&nbsp;&nbsp;${f.champ(exp.telephone, "facultatif")}</div>
    </div>
    <div class="cartouche-ref">
      <div>${echapper(cartouche.libelle)} <span class="mini">n°</span></div>
      <div class="exp-nom">${f.champ(cartouche.reference, "référence")}</div>
      <div>Établi le ${f.date(cartouche.etabliLe)}</div>
    </div>
  </header>`;
}

// Titre du document entre deux filets encre + sous-titre laiton + base légale
export function titre(titrePrincipal: string, sousTitre: string, basesLegales: string[]): string {
  return `<div class="bloc-titre">
    <h1>${echapper(titrePrincipal)}</h1>
    ${sousTitre ? `<div class="sous-titre">${sousTitre}</div>` : ""}
  </div>
  ${basesLegales.length ? `<div class="base-legale">${basesLegales.map(echapper).join("<br/>")}</div>` : ""}`;
}

export function section(t: string): string {
  return `<h2>${echapper(t)}</h2>`;
}

export function sousSection(t: string): string {
  return `<h3>${echapper(t)}</h3>`;
}

// Cartouches méta en 2 colonnes (BAILLEUR / LOCATAIRE…)
export function cartouches(paires: [string, string][]): string {
  const cases = paires
    .map(([lib, contenu]) => `<div class="case"><div class="etiquette">${echapper(lib)}</div><div>${contenu}</div></div>`)
    .join("");
  return `<div class="cartouches">${cases}</div>`;
}

export function tableau(colonnes: { libelle: string; droite?: boolean }[], lignes: string[][]): string {
  const tetes = colonnes
    .map((c) => `<th${c.droite ? ' class="d"' : ""}>${echapper(c.libelle)}</th>`)
    .join("");
  const corps = lignes
    .map((l) => `<tr>${l.map((cell, i) => `<td${colonnes[i]?.droite ? ' class="d"' : ""}>${cell}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${tetes}</tr></thead><tbody>${corps}</tbody></table>`;
}

// Cartouche de signature à bandeau encre
export function cadreSignature(titreCadre: string, contenu: string): string {
  return `<div class="signature"><div class="bandeau">${echapper(titreCadre)}</div><div class="zone">${contenu}</div></div>`;
}

export function faitA(f: Fusion, ville: string | null | undefined, dateIso: string, suite = "."): string {
  return `<p>Fait à ${f.champ(ville, "commune")}, le ${f.date(dateIso)}${suite}</p>`;
}

// ------------------------------------------------------------------
// Page complète
// ------------------------------------------------------------------
export type DocumentAssemble = {
  html: string;
  // Pied puppeteer (répété sur chaque page)
  piedHtml: string;
  titreDocument: string;
  reference: string;
  empreinte: string;
  manquants: string[];
};

export function assemblerPage(params: {
  f: Fusion;
  titreDocument: string;
  nomPied: string;
  reference: string;
  corps: string;
}): DocumentAssemble {
  const empreinte = createHash("sha256").update(params.corps).digest("hex").slice(0, 16);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<title>${echapper(params.titreDocument)}</title>
<style>${CSS_POLICES}${CSS_DOCUMENT}</style></head>
<body>${params.corps}</body></html>`;
  const piedHtml = piedDePage(params.nomPied, params.reference, empreinte);
  return {
    html,
    piedHtml,
    titreDocument: params.titreDocument,
    reference: params.reference,
    empreinte,
    manquants: params.f.manquants,
  };
}

// Pied fidèle à l'épreuve : nom du doc · Réf/Modèle/Empreinte · pagination,
// puis la ligne de marque. Police système serif (les gabarits de pied
// puppeteer ne chargent pas de fonte embarquée).
function piedDePage(nom: string, reference: string, empreinte: string): string {
  return `<div style="width:100%;font-family:Georgia,'Times New Roman',serif;color:#77828e;font-size:6.5px;padding:0 56px;">
    <div style="border-top:0.5px solid #d8d2c4;padding-top:4px;display:flex;justify-content:space-between;align-items:baseline;">
      <span>${echapper(nom)}</span>
      <span>Réf. ${echapper(reference)} · Modèle ${VERSION_MODELES} · Empreinte ${empreinte}</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>
    <div style="text-align:center;padding-top:3px;">
      <span style="color:#14304f;letter-spacing:3px;font-size:7.5px;">G E R I M M O</span>
      <span style="color:#8b96a2;">&nbsp;&nbsp;Document généré avec Gerimmo&nbsp;&nbsp;</span>
      <span style="color:#9a7b3f;">gerimmo.app</span>
    </div>
  </div>`;
}

// La charte de l'épreuve, en CSS d'impression
const CSS_DOCUMENT = `
  :root { --encre:#14304f; --laiton:#9a7b3f; --texte:#1a1a1a; --gris:#77828e;
          --fusion:#93a0ae; --filet:#d8d2c4; --filet-leger:#e7e2d6; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Caladea', Georgia, serif; font-size:10.5pt; color:var(--texte);
         line-height:1.55; padding:44pt 56pt 0; }
  .entete { display:flex; justify-content:space-between; align-items:flex-end;
            border-bottom:0.75pt solid var(--encre); padding-bottom:8pt; margin-bottom:18pt;
            font-size:8pt; color:#6b7580; }
  .entete .exp-nom { font-weight:700; }
  .cartouche-ref { text-align:right; }
  .mini { font-size:6.5pt; color:var(--gris); }
  .bloc-titre { border-top:0.75pt solid var(--encre); border-bottom:0.75pt solid var(--encre);
                text-align:center; padding:16pt 0 14pt; margin-bottom:10pt; }
  h1 { font-size:23pt; color:var(--encre); letter-spacing:0.32em; font-weight:700;
       text-transform:uppercase; }
  .sous-titre { color:var(--laiton); font-size:11pt; letter-spacing:0.22em;
                text-transform:uppercase; margin-top:6pt; }
  .base-legale { text-align:center; font-style:italic; font-size:7pt; color:var(--gris);
                 margin:4pt 0 16pt; }
  h2 { font-size:13pt; color:var(--encre); letter-spacing:0.14em; text-transform:uppercase;
       font-weight:700; border-bottom:0.75pt solid var(--encre); padding-bottom:4pt;
       margin:20pt 0 10pt; page-break-after:avoid; }
  h3 { color:var(--laiton); font-size:10.5pt; font-weight:700; margin:12pt 0 6pt;
       page-break-after:avoid; }
  p { margin:6pt 0; text-align:justify; }
  .fusion { font-style:italic; font-size:8pt; color:var(--fusion);
            border-bottom:0.75pt dotted var(--fusion); padding:0 14pt; white-space:nowrap; }
  .v { border-bottom:0.75pt dotted var(--filet); padding:0 2pt; }
  .cartouches { display:grid; grid-template-columns:1fr 1fr; gap:0 28pt;
                border-top:0.5pt solid var(--filet); margin:14pt 0; }
  .cartouches .case { border-bottom:0.5pt solid var(--filet); padding:7pt 0 8pt; }
  .etiquette { color:var(--laiton); font-size:7.5pt; letter-spacing:0.14em;
               text-transform:uppercase; margin-bottom:3pt; }
  table { width:100%; border-collapse:collapse; margin:8pt 0; }
  th { color:var(--laiton); font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase;
       text-align:left; font-weight:700; border-bottom:0.75pt solid var(--encre);
       padding:4pt 6pt 4pt 0; }
  td { border-bottom:0.5pt solid var(--filet-leger); padding:6pt 6pt 6pt 0;
       vertical-align:top; }
  th.d, td.d { text-align:right; padding-right:0; }
  tr { page-break-inside:avoid; }
  .total { font-weight:700; color:var(--encre); border-top:0.75pt solid var(--encre); }
  .signatures { display:grid; grid-template-columns:1fr 1fr; gap:16pt; margin-top:12pt; }
  .signature { page-break-inside:avoid; }
  .signature .bandeau { background:var(--encre); color:#fdfbf5; font-weight:700;
                        padding:5pt 10pt; font-size:10pt; }
  .signature .zone { border:0.5pt solid var(--filet); border-top:none; min-height:70pt;
                     padding:8pt 10pt; font-size:8pt; color:#6b7580; }
  .mentions { font-size:8.5pt; color:#4a5560; }
  .mentions p { margin:4pt 0; }
  .encadre { border-left:2.25pt solid var(--laiton); background:#faf7ef;
             padding:8pt 12pt; margin:10pt 0; page-break-inside:avoid; }
  .deux-col { display:grid; grid-template-columns:1fr 1fr; gap:0 28pt; }
  .saut { page-break-before:always; }
  .centre { text-align:center; }
`;
