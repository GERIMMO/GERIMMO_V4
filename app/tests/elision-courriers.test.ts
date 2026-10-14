/**
 * Vérification adverse du 14/10/2026 (VER-TS-03) : l'élision n'était appliquée que sur la page
 * d'accueil du locataire. Les courriers, la page Documents, les libellés d'agenda et les PDF
 * disaient encore « loyer de octobre 2026 », « échéance de avril 2026 », « Terme de août 2026 ».
 *
 * Deux garde-fous : les courriers sont rendus pour les mois qui commencent par une voyelle (et pour
 * deux mois qui n'en ont pas), puis un balayage des sources interdit d'écrire à la main
 * « de » devant un mois : il faut passer par `deElide` ou `particuleDe` (src/lib/elision.ts).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { corpsAvisEcheance, sujetAvisEcheance, type AvisEcheance } from "../src/lib/appel-email";
import { corpsQuittance, sujetQuittance, type Quittance } from "../src/lib/quittance-email";
import {
  corpsInformationCaution,
  corpsRelanceLoyer,
  sujetRelanceLoyer,
  type InformationCaution,
  type RelanceLoyer,
} from "../src/lib/relance-loyer-email";

const quittance = (periode: string): Quittance => ({
  estQuittance: true, periode, loyerHc: 700, charges: 50, montant: 750, emetteur: "Claire Moreau", prenom: "Zoé", lien: "https://exemple.test/q",
});
const avis = (periode: string): AvisEcheance => ({
  periode, loyerHc: 700, charges: 50, resteDu: 750, dateEcheance: periode, prorata: false, arriere: 0, emetteur: "Claire Moreau", prenom: "Zoé", lien: "https://exemple.test/a",
});
const relance = (periode: string, niveau: RelanceLoyer["niveau"] = "relance_1"): RelanceLoyer => ({
  niveau, prenom: "Zoé", emetteur: "Claire Moreau", lot: "Appartement Jardin", periode, dateEcheance: periode, reste: 750, totalDu: 750, lien: "https://exemple.test/p",
});
const caution = (periode: string): InformationCaution => ({
  emetteur: "Claire Moreau", locataire: "Zoé Martin", lot: "Appartement Jardin", periode, dateEcheance: periode, totalDu: 750,
});

/** Tous les textes que produisent les courriers pour une période. */
function courriers(periode: string): string[] {
  return [
    sujetQuittance(quittance(periode)),
    corpsQuittance(quittance(periode)),
    sujetAvisEcheance(avis(periode)),
    corpsAvisEcheance(avis(periode)),
    sujetRelanceLoyer(relance(periode, "relance_1")),
    sujetRelanceLoyer(relance(periode, "relance_2")),
    corpsRelanceLoyer(relance(periode, "relance_1")),
    corpsRelanceLoyer(relance(periode, "relance_2")),
    corpsInformationCaution(caution(periode)),
  ];
}
const FAUTE = /\b(?:de|De) (?:<strong>)?(?:octobre|avril|août|Octobre|Avril|Août)\b/;

describe("courriers : « de » s'élide devant un mois qui commence par une voyelle", () => {
  it.each(["2026-10-01", "2026-04-01", "2026-08-01"])("aucun « de octobre / avril / août » pour %s", (periode) => {
    for (const texte of courriers(periode)) expect(texte).not.toMatch(FAUTE);
  });

  it("le sujet de la première relance dit « Loyer d’octobre 2026 »", () => {
    expect(sujetRelanceLoyer(relance("2026-10-01", "relance_1"))).toBe("Loyer d’octobre 2026 — un règlement semble en attente");
    expect(sujetRelanceLoyer(relance("2026-04-01", "relance_2"))).toBe("Seconde relance — loyer d’avril 2026 toujours en attente");
  });

  it("le corps garde le mois en gras, derrière l'apostrophe", () => {
    expect(corpsRelanceLoyer(relance("2026-10-01"))).toContain("le loyer d’<strong>octobre 2026</strong>");
    expect(corpsInformationCaution(caution("2026-08-01"))).toContain("le loyer d’<strong>août 2026</strong>");
    expect(corpsQuittance(quittance("2026-04-01"))).toContain("quittance de loyer d’<strong>avril 2026</strong>");
    expect(corpsAvisEcheance(avis("2026-10-01"))).toContain("votre échéance d’<strong>octobre 2026</strong>");
  });

  it.each(["2026-09-01", "2026-12-01", "2026-03-01"])("un mois à consonne garde « de » (%s)", (periode) => {
    const mois = new Date(periode).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
    expect(corpsRelanceLoyer(relance(periode))).toContain(`le loyer de <strong>${mois}</strong>`);
    expect(sujetRelanceLoyer(relance(periode))).toBe(`Loyer de ${mois} — un règlement semble en attente`);
  });
});

// ── Balayage des sources ─────────────────────────────────────────────────
const SRC = resolve(__dirname, "../src");
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

// « de » (ou « De ») suivi, dans la même expression, d'un mois ou d'une période insérés : `de ${mois}`,
// `de {moisLong(…)}`, `de <strong>${mois}</strong>`, `Terme de ${echapper(moisLong(…))}`, y compris
// quand le saut de ligne tombe entre « de » et l'expression.
const DE_DEVANT_UN_MOIS = /\b(?:de|De)\s+(?:<strong>)?(?:\$\{|\{)[^}\n]*?(?:\b[mM]ois|[a-z]Mois|\b[pP][ée]riode)/g;
// Des mois au sens de « durée » : « un délai de ${n} mois », « de ${mois} mois de loyer ».
const NOMBRE_DE_MOIS = /delai_mois|preavis_mois|mois de loyer hors charges/;

describe("sources : aucun « de » écrit à la main devant un mois", () => {
  it("passe par deElide / particuleDe partout où un mois est inséré après « de »", () => {
    const fautes: string[] = [];
    for (const chemin of fichiers(SRC)) {
      const source = readFileSync(chemin, "utf8");
      const lignes = source.split("\n");
      for (const m of source.matchAll(DE_DEVANT_UN_MOIS)) {
        const numero = source.slice(0, m.index).split("\n").length;
        const ligne = lignes[numero - 1];
        if (/deElide|particuleDe/.test(ligne) || NOMBRE_DE_MOIS.test(ligne)) continue;
        fautes.push(`${relative(SRC, chemin)}:${numero}  ${ligne.trim().slice(0, 110)}`);
      }
    }
    expect(fautes).toEqual([]);
  });
});
