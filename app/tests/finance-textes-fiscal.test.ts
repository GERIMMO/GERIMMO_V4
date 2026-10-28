import { avecDetenteursAuReel } from "./fixtures/profil-fiscal";
/**
 * Relevés de la relecture finance du 13/10/2026 (FIN-05, FIN-06, FIN-08) : trois textes du récapitulatif fiscal
 * affirmaient ce que les chiffres ne disent pas.
 *  · FIN-05 : « Montant net à qualifier » additionne des recettes et des dépenses : ce n'est pas un net ;
 *  · FIN-06 : « Retrouver la ventilation historique » annonçait un succès sans rien changer quand la pièce a déjà
 *    sa capture (avance, part non ventilée) ;
 *  · FIN-08 : toute dépense « Hors revenus fonciers » était présentée comme de la TEOM, toute recette comme des
 *    provisions de charges.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const banc = vi.hoisted(() => ({
  donnees: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  role: "proprietaire_direct",
}));

function requete(table: string) {
  const q: Record<string, unknown> = {};
  for (const methode of ["select", "eq", "order", "limit", "gte", "lte", "in"]) q[methode] = () => q;
  q.maybeSingle = async () => ({ data: (banc.donnees[table] ?? [])[0] ?? null, error: null });
  q.then = (suite: (r: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: banc.donnees[table] ?? [], error: null }).then(suite);
  return q;
}
const supabase = { from: requete, rpc: (...args: unknown[]) => banc.rpc(...args) };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase, estProprietaire: true, role: "proprietaire_direct", user: { id: "u" } }),
}));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ supabase, user: { id: "u" }, role: banc.role }),
}));

import { RecapitulatifFiscal as PageRecap } from "../src/components/recapitulatif-fiscal";
import { recapitulatifFiscal, type EcritureFiscale } from "../src/lib/fiscal";
import { csvRecapitulatifFiscal } from "../src/lib/fiscal-export";
import { retrouverVentilation } from "../src/app/actions/fiscalite";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");
const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ");

const EXERCICE = {
  lot_id: "lot", annee: 2026, version: 1, justification: "Acte et bail vérifiés", regularisation230: 0,
  quote_part230: 100, justification230: "Décompte N−1 : zéro confirmé",
  periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }],
};
const ecriture = (id: string, categorie: string, sens: string, montant: number, extra: Partial<EcritureFiscale> = {}) =>
  ({ id, categorie, sens, montant, date_piece: "2026-10-12", lot_id: "lot", bail_id: null, encaissement_id: null, libelle: null, ...extra });
const horsRevenusFonciers = (ecriture_id: string) =>
  ({ ecriture_id, lot_id: "lot", nature: "hors_2044", rubrique: null, justification: "Pièce vérifiée", version: 1 });

async function page() {
  return texteDe(renderToStaticMarkup(await PageRecap({ params: Promise.resolve({ orgId: "org" }), searchParams: Promise.resolve({ annee: "2026" }) })));
}
function fixture(ecritures: unknown[], qualifications: unknown[] = [], composantes: unknown[] = []) {
  banc.donnees = avecDetenteursAuReel({
    ecritures: ecritures as Record<string, unknown>[],
    fiscal_qualifications_ecritures: qualifications as Record<string, unknown>[],
    fiscal_encaissements_composantes: composantes as Record<string, unknown>[],
    fiscal_exercices_lots: [EXERCICE],
    lots: [{ id: "lot", nom: "Lot A" }],
    biens: [],
  });
}

beforeEach(() => {
  banc.rpc.mockReset().mockResolvedValue({ data: "ecriture", error: null });
  banc.role = "proprietaire_direct";
  fixture([]);
});

describe("FIN-05 : le cumul des pièces à qualifier n'est pas un « net »", () => {
  // Un loyer de 900 € et une dépense de 800 €, ni l'un ni l'autre qualifiés : le cumul vaut 1 700 €, le net réel +100 €.
  const pieces = [ecriture("l1", "Loyer", "recette", 900), ecriture("d1", "Divers", "depense", 800)];

  it("le chiffre ne change pas : c'est bien la somme des deux pièces", () => {
    const recap = recapitulatifFiscal(pieces, 2026, { exigerPerimetre: true, exercices: new Map([["lot", EXERCICE as never]]) });
    expect(recap.aQualifier).toBe(1700);
  });

  it("l'export CSV dit « cumul » et « sans compensation », plus « net »", () => {
    const recap = recapitulatifFiscal(pieces, 2026, { exigerPerimetre: true, exercices: new Map([["lot", EXERCICE as never]]) });
    const csv = csvRecapitulatifFiscal(recap, 2026);
    expect(csv).not.toMatch(/Montant net/i);
    expect(csv).toContain('"2026";"HORS TOTAL";"Cumul des pièces à qualifier (recettes et dépenses additionnées, sans compensation)";"1700,00"');
  });

  it("l'écran dit la même chose que l'export", async () => {
    fixture(pieces);
    const texte = await page();
    expect(texte).not.toMatch(/Montant net/i);
    expect(texte).toContain("Cumul des pièces ou parts à qualifier (recettes et dépenses additionnées, sans compensation) : 1 700,00 €");
  });
});

describe("FIN-08 : les montants « hors revenus fonciers » ne sont plus décrits comme de la TEOM ou des provisions", () => {
  // Frais de comptable de 800 € qualifiés hors revenus fonciers, indemnité d'assurance de 300 € qualifiée hors 2044.
  const pieces = [ecriture("c1", "Frais de comptable", "depense", 800), ecriture("a1", "Indemnité d'assurance", "recette", 300)];
  const qualifications = [horsRevenusFonciers("c1"), horsRevenusFonciers("a1")];

  it("les montants restent exclus à bon droit, et chiffrés", async () => {
    fixture(pieces, qualifications);
    const texte = await page();
    expect(texte).toContain("300,00 €");
    expect(texte).toContain("800,00 €");
  });

  it("la carte n'affirme plus que 800 € sont de la taxe d'enlèvement des ordures ménagères", async () => {
    fixture(pieces, qualifications);
    const texte = await page();
    expect(texte).not.toMatch(/800,00 € de taxe d/);
    expect(texte).not.toMatch(/300,00 € de provisions et régularisations de charges encaissées\b(?! ou)/);
    expect(texte).toContain("300,00 € de recettes exclues (provisions et régularisations de charges encaissées, ou recettes que vous avez qualifiées « hors revenus fonciers »)");
    expect(texte).toContain("800,00 € de dépenses que vous avez qualifiées « hors revenus fonciers » (par exemple la taxe d'enlèvement des ordures ménagères)");
  });

  it("le CSV ne nomme plus « provisions et charges récupérées » ce qui peut être n'importe quelle recette exclue", () => {
    const recap = recapitulatifFiscal(pieces, 2026, {
      exigerPerimetre: true,
      exercices: new Map([["lot", EXERCICE as never]]),
      qualifications: new Map(qualifications.map((q) => [q.ecriture_id, q as never])),
    });
    expect(recap.chargesRecuperees).toBe(300);
    expect(recap.teomExclue).toBe(800);
    const csv = csvRecapitulatifFiscal(recap, 2026);
    expect(csv).not.toContain("Provisions et charges récupérées");
    expect(csv).toContain('"HORS TOTAL";"Recettes exclues de la 2044 (charges récupérées, recettes hors revenus fonciers)";"300,00"');
  });

  it("le document généré reprend la même description", () => {
    const source = lire("src/lib/documents/modeles/catalogue-gestion.ts");
    expect(source).not.toContain("de provisions et régularisations de charges encaissées${fiscal.teomExclue");
    expect(source).not.toContain("de taxe d’enlèvement des ordures ménagères` : \"\"");
    expect(source).toContain("LIBELLE_RECETTES_EXCLUES");
    expect(source).toContain("LIBELLE_DEPENSES_EXCLUES");
  });
});

describe("FIN-06 : « Retrouver la ventilation historique » ne promet plus ce qu'il ne fait pas", () => {
  // Paiement de 700 € pour un appel de 540 € : la capture porte 500 + 40, et 160 € ne sont pas ventilés.
  const avance = ecriture("p1", "Loyer", "recette", 700, { encaissement_id: "enc-1" });
  const captureAvecReste = { ecriture_id: "p1", loyer_hc: 500, charges: 40, non_ventile: 160 };
  const bouton = "Retrouver la ventilation historique";

  it("le bouton n'est pas proposé quand la pièce a déjà sa capture : il dit ce qui reste à faire", async () => {
    fixture([avance], [], [captureAvecReste]);
    const texte = await page();
    expect(texte).toContain("Qualifier les pièces");
    expect(texte).not.toContain(bouton);
    expect(texte).toContain("déjà conservée");
    expect(texte).toContain("160,00 € non ventilés");
  });

  it("le bouton reste proposé tant qu'aucune capture n'existe", async () => {
    fixture([avance]);
    expect(await page()).toContain(bouton);
  });

  it("l'action refuse d'annoncer un succès quand une capture existe déjà, et n'appelle pas la base", async () => {
    fixture([avance], [], [captureAvecReste]);
    const retour = await retrouverVentilation("org", "p1", {}, new FormData());
    expect(retour.succes).toBeUndefined();
    expect(retour.erreur).toContain("déjà");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("sans capture, l'action fait la reprise et l'annonce", async () => {
    fixture([avance]);
    const retour = await retrouverVentilation("org", "p1", {}, new FormData());
    expect(banc.rpc).toHaveBeenCalledWith("retrouver_ventilation_fiscale", { p_ecriture: "p1" });
    expect(retour.succes).toContain("Ventilation historique retrouvée");
  });
});
