// Outils communs du kit de recette : rendu HTML → PDF / PNG par Chromium
// (Playwright, déjà présent pour les tests e2e), mise en forme des textes,
// identifiants fictifs mais formellement valides (SIRET, IBAN, TVA).
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
// Les polices sont embarquées en base64 : une page ouverte par setContent()
// (origine about:blank) ne peut pas charger un fichier local.
const police = async (nom) => `data:font/ttf;base64,${(await readFile(path.join(ICI, "polices", nom))).toString("base64")}`;
const INTER = await police("Inter.ttf");
const GREAT_VIBES = await police("GreatVibes.ttf");

// ── Texte ────────────────────────────────────────────────────────────────────
export function echapper(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Mini-balisage des fiches : `{Champ}` libellé de champ, `[valeur]` valeur à
 * saisir, `<<Bouton>>` bouton de l'application, `@@fichier@@` fichier du
 * dossier, `**gras**`, `__code__`, `->` flèche.
 */
export function baliser(texte) {
  let t = echapper(texte);
  const codes = [];
  t = t.replace(/__([^_]+)__/g, (_, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
  t = t.replace(/@@([^@]+)@@/g, '<span class="fichier">📎 $1</span>');
  t = t.replace(/&lt;&lt;([^&]+)&gt;&gt;/g, '<span class="bouton">$1</span>');
  t = t.replace(/\{([^}]+)\}/g, '<span class="champ">$1</span>');
  t = t.replace(/\[([^\]]+)\]/g, '<span class="valeur">$1</span>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/ -&gt; /g, " → ");
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  return t;
}

export const EUR = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n).replace(/ /g, " ");
export const NB = (n, dec = 2) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

// ── Identifiants fictifs, formellement valides ──────────────────────────────
function luhnCle(chiffres) {
  // Chiffre de contrôle Luhn à ajouter à droite de `chiffres`.
  let somme = 0;
  const inv = chiffres.split("").reverse();
  for (let i = 0; i < inv.length; i++) {
    let d = Number(inv[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    somme += d;
  }
  return String((10 - (somme % 10)) % 10);
}

/** SIREN fictif (préfixe 0000…) : 8 chiffres donnés + clé Luhn. */
export function siren(huit) {
  return huit + luhnCle(huit);
}

/** SIRET = SIREN + NIC (4 chiffres donnés + clé Luhn sur les 14). */
export function siret(huit, nic4 = "0001") {
  const s = siren(huit);
  return s + nic4 + luhnCle(s + nic4);
}

export function siretEspace(s) {
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
}

function mod97(chaine) {
  let reste = 0;
  for (const c of chaine) reste = (reste * 10 + Number(c)) % 97;
  return reste;
}

/** IBAN français fictif (banque 99999) avec clé RIB et clé IBAN justes. */
export function iban(guichet, compte11) {
  const banque = "99999";
  const n = `${banque}${guichet}${compte11}`;
  const cleRib = String(97 - mod97(n + "00")).padStart(2, "0");
  const bban = n + cleRib;
  const cleIban = String(98 - mod97(bban + "152700")).padStart(2, "0"); // F=15, R=27
  const brut = `FR${cleIban}${bban}`;
  return { brut, affiche: brut.replace(/(.{4})/g, "$1 ").trim(), banque, guichet, compte: compte11, cleRib };
}

export function tvaIntracom(sirenNum) {
  const cle = (12 + 3 * (Number(sirenNum) % 97)) % 97;
  return `FR${String(cle).padStart(2, "0")}${sirenNum}`;
}

/**
 * Les douze échéances de 2026 d'un prêt amortissable (mensualité constante),
 * `debut` mois étant déjà remboursés avant janvier 2026.
 */
export function calculerAmortissement({ capital, taux, dureeAns, debut }) {
  const r = taux / 12;
  const n = dureeAns * 12;
  const mensualite = (capital * r) / (1 - Math.pow(1 + r, -n));
  let restant = capital;
  for (let i = 0; i < debut; i++) restant -= mensualite - restant * r;
  const lignes = [];
  let interets = 0;
  for (let m = 1; m <= 12; m++) {
    const i = restant * r;
    const amorti = mensualite - i;
    restant -= amorti;
    interets += i;
    lignes.push({ echeance: `${String(m).padStart(2, "0")}/2026`, mensualite, interets: i, amorti, restant });
  }
  return { mensualite, lignes, interets: Math.round(interets * 100) / 100 };
}

// ── Rendu Chromium ──────────────────────────────────────────────────────────
let navigateur;
export async function ouvrirNavigateur() {
  // GERIMMO_CHROMIUM permet de pointer un Chromium déjà installé quand la
  // version attendue par Playwright n'est pas téléchargée (conteneurs).
  const executablePath = process.env.GERIMMO_CHROMIUM || undefined;
  navigateur ??= await chromium.launch(executablePath ? { executablePath } : {});
  return navigateur;
}
export async function fermerNavigateur() {
  await navigateur?.close();
  navigateur = undefined;
}

export async function ecrireFichier(chemin, contenu) {
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, contenu);
}

/** HTML complet → PDF A4 ; `pied` est le gabarit de pied de page Chromium. */
export async function htmlVersPdf(html, chemin, { pied = "", marges = { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } } = {}) {
  const nav = await ouvrirNavigateur();
  const page = await nav.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: false,
    margin: marges,
    displayHeaderFooter: Boolean(pied),
    headerTemplate: "<span></span>",
    footerTemplate: pied || "<span></span>",
  });
  await page.close();
  await ecrireFichier(chemin, pdf);
}

/** HTML → PNG/JPEG de la taille exacte du viewport. */
export async function htmlVersImage(html, chemin, { largeur, hauteur, type = "png", qualite = 88, fondTransparent = false }) {
  const nav = await ouvrirNavigateur();
  const page = await nav.newPage({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const image = await page.screenshot({
    type,
    ...(type === "jpeg" ? { quality: qualite } : {}),
    omitBackground: fondTransparent,
    clip: { x: 0, y: 0, width: largeur, height: hauteur },
  });
  await page.close();
  await ecrireFichier(chemin, image);
}

/** Le CSS partagé : polices embarquées, et rien d'autre. */
export const CSS_POLICES = `
@font-face { font-family: "Inter"; src: url("${INTER}") format("truetype"); font-weight: 100 900; }
@font-face { font-family: "Great Vibes"; src: url("${GREAT_VIBES}") format("truetype"); }
`;
