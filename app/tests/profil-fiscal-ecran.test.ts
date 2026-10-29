import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { baseSimulee, type BaseSimulee, type Ligne } from "./fixtures/base-simulee";
import { avecDetenteursAuReel } from "./fixtures/profil-fiscal";

const banc = vi.hoisted(() => ({ base: null as unknown, lectureSeule: false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: async () => ({ supabase: (banc.base as BaseSimulee).client, estProprietaire: true, traverseeLectureSeule: banc.lectureSeule, role: "proprietaire_direct", user: { id: "u" } }) }));

import { RecapitulatifFiscal } from "../src/components/recapitulatif-fiscal";
import { chargerRecapitulatifNu } from "../src/lib/documents/modeles/catalogue-gestion";
const o = { organization_id: "org" };
function dossier(): Record<string, Ligne[]> {
  return avecDetenteursAuReel({
    lots: [{ ...o, id: "lot", nom: "TEST appartement", bien_id: "bien" }], biens: [{ ...o, id: "bien", nom: "TEST immeuble" }],
    ecritures: [{ ...o, id: "e", lot_id: "lot", categorie: "loyer", sens: "recette", montant: 840, date_piece: "2026-03-05", encaissement_id: "enc" }],
    fiscal_encaissements_composantes: [{ ...o, ecriture_id: "e", loyer_hc: 780, charges: 60, non_ventile: 0 }],
    fiscal_qualifications_ecritures: [],
    fiscal_exercices_lots: [{ ...o, lot_id: "lot", annee: 2026, version: 1, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }], regularisation230: 0, quote_part230: 100, justification230: "Néant" }],
  });
}
const afficher = async (compact = false) => renderToStaticMarkup(await RecapitulatifFiscal({ params: Promise.resolve({ orgId: "org" }), searchParams: Promise.resolve({ annee: "2026" }), compact }));
beforeEach(() => { banc.lectureSeule = false; banc.base = baseSimulee(dossier()); });
describe("Déclaration adaptée : garde effective écran, export et document", () => {
  it("la traversée de consultation ne propose aucune modification de situation fiscale", async () => {
    banc.lectureSeule = true;
    const html = await afficher();
    expect(html).toContain("Consultation uniquement");
    expect(html).not.toContain('name="location_nue"');
    expect(html).not.toContain('name="location_meublee"');
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("780,00");
  });
  it("le particulier confirmé au réel conserve ses montants et son export 2044", async () => {
    const html = await afficher(); expect(html).toContain("Exporter les montants (CSV)"); expect(html).toContain("780,00");
  });
  it.each([["SCI", "ir", "2072"], ["SCI", "is", "2065"], ["Personne physique", "ir", "2042 — micro-foncier"]])("%s %s n’affiche aucun tableau ou export 2044", async (qualite, imposition, attendu) => {
    const tables = dossier(); tables.persons[0].qualite = qualite; Object.assign(tables.fiscal_profils_detenteurs[0], { qualite, imposition, location_nue: qualite === "SCI" ? "non_concerne" : "micro" });
    banc.base = baseSimulee(tables); const html = await afficher();
    expect(html).toContain(attendu); expect(html).not.toContain("Exporter les montants (CSV)"); expect(html).not.toContain('download="recapitulatif-fiscal');
    expect(html).toContain("Exporter le dossier de préparation");
    expect(html).not.toContain("780,00");
  });
  it("la vignette des finances ne conserve pas une 2044 pour une SCI IS", async () => {
    const tables = dossier(); tables.persons[0].qualite = "SCI"; Object.assign(tables.fiscal_profils_detenteurs[0], { qualite: "SCI", imposition: "is" }); banc.base = baseSimulee(tables);
    const html = await afficher(true); expect(html).not.toContain("780,00"); expect(html).toContain("Préparer ma déclaration");
  });
  it("l’URL directe du document ne contourne pas le régime fiscal incompatible", async () => {
    const tables = dossier(); tables.persons[0].qualite = "SCI"; Object.assign(tables.fiscal_profils_detenteurs[0], { qualite: "SCI", imposition: "is" }); const b = baseSimulee(tables);
    await expect(chargerRecapitulatifNu(b.client, "org", "lot", 2026)).rejects.toThrow(/ne relève pas de l’aide 2044/);
  });
  it("préserve le document existant des agences sans leur imposer un profil propriétaire inaccessible", async () => {
    const tables = dossier(); tables.organizations[0].type = "agence"; tables.fiscal_profils_detenteurs = [];
    await expect(chargerRecapitulatifNu(baseSimulee(tables).client, "org", "lot", 2026)).resolves.toHaveProperty("rubriques");
  });
  it("un type d’espace illisible ne contourne pas la garde du propriétaire", async () => {
    const tables = dossier(); tables.organizations = [];
    await expect(chargerRecapitulatifNu(baseSimulee(tables).client, "org", "lot", 2026)).rejects.toThrow();
  });
  it("profil non renseigné : un seul formulaire de situation, aucun montant fiscal inventé", async () => {
    const tables = dossier(); tables.fiscal_profils_detenteurs = []; banc.base = baseSimulee(tables);
    const html = await afficher(); expect(html).toContain("À confirmer"); expect(html).not.toContain("Exporter les montants (CSV)");
    expect((html.match(/name="location_nue"/g) ?? [])).toHaveLength(1);
  });
  it("lecture du profil en erreur : ni tableau ni export de préparation apparemment réussi", async () => {
    banc.base = baseSimulee(dossier(), { lecturesEnErreur: { fiscal_profils_detenteurs: "indisponible" } });
    const html = await afficher(); expect(html).toContain("n’a pas pu être vérifiée"); expect(html).not.toContain("Exporter les montants (CSV)"); expect(html).not.toContain("Exporter le dossier de préparation");
  });
});
