import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte, personne } from "./fixtures/contexte-document";
import { assemblerBailColocation } from "@/lib/documents/modeles/bail-colocation";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { Fusion } from "@/lib/documents/gabarit";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const mocks = vi.hoisted(() => ({ charger: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/documents/modeles/communs")>(), chargerContexteBail: mocks.charger,
}));
function colocation(meuble = false) {
  const c = contexte();
  c.bail.type = "colocation"; c.lot.meuble = meuble;
  c.bail.depot_garantie = meuble ? 1300 : 650;
  c.locataires.push(personne({ id: "p2", nom: "Martin", prenom: "Léo" }));
  return c;
}
function client(erreur = "", inventaire = true) {
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table);
    const resultat = { data: table === "diagnostics" ? { classe_dpe: "D" } : inventaire ? [{ piece: "Salon", designation: "Table commune", quantite: 1, etat: "bon", observation: null }] : [], error: table === erreur ? { message: "indisponible" } : null };
    const q = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: async () => resultat, then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultat).then(resolve) };
    return q;
  };
  return { supabase: { from } as unknown as SupabaseClient, tables };
}
beforeEach(() => { vi.clearAllMocks(); mocks.charger.mockResolvedValue(colocation()); });
describe("contrat commun de colocation", () => {
  it.each([false, true])("choisit le régime enregistré, garde le loyer total et rattache chaque colocataire : meublé=%s", async meuble => {
    mocks.charger.mockResolvedValue(colocation(meuble));
    const c = client(); const r = await assemblerBailColocation(c.supabase, "org", "b1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(r.titreGed).toContain(meuble ? "meublé" : "nu");
    expect(r.document.html).toContain("Contrat commun de colocation");
    expect(r.document.html).toContain("Leblanc Julie"); expect(r.document.html).toContain("Martin Léo");
    expect(r.document.html).toContain("Colocataire 1"); expect(r.document.html).toContain("Colocataire 2");
    expect(r.document.html).toContain("Clause de solidarité");
    expect(r.document.html).toMatch(/650,00\s€/);
    expect(r.document.html).not.toMatch(/325,00\s€/);
    expect(r.document.html).toContain(meuble ? "au plus deux mois" : "au plus un mois");
    expect(r.liens).toEqual([{ entite: "bail", entiteId: "b1" }, { entite: "lot", entiteId: "l1" }, { entite: "personne", entiteId: "p1" }, { entite: "personne", entiteId: "p2" }]);
    expect(c.tables.includes("inventaire_lignes")).toBe(meuble);
    if (meuble) expect(r.document.html).toContain("Table commune");
  });
  it.each(["nu", "meuble"])("refuse un autre type de bail : %s", async type => {
    const c = colocation(); c.bail.type = type; mocks.charger.mockResolvedValue(c);
    expect(await assemblerBailColocation(client().supabase, "org", "b1")).toHaveProperty("erreur");
  });
  it.each(["actif", "preavis", "termine"])("n'émet pas de nouveau contrat initial pour un bail %s", async etat => {
    const c = colocation(); c.bail.etat = etat; mocks.charger.mockResolvedValue(c);
    expect(await assemblerBailColocation(client().supabase, "org", "b1")).toHaveProperty("erreur", expect.stringContaining("avenant"));
  });
  it("refuse le bail inaccessible et ne lit pas ses annexes", async () => {
    mocks.charger.mockResolvedValue({ erreur: "Bail introuvable." }); const c = client();
    expect(await assemblerBailColocation(c.supabase, "org", "autre")).toEqual({ erreur: "Bail introuvable." });
    expect(c.tables).toEqual([]);
  });
  it("refuse un principal absent ou une personne dupliquée comme second signataire", async () => {
    const c = colocation(); c.bail.locataire_principal = null; mocks.charger.mockResolvedValue(c);
    expect(await assemblerBailColocation(client().supabase, "org", "b1")).toHaveProperty("erreur", expect.stringContaining("principal"));
    c.bail.locataire_principal = "p1"; c.locataires = [personne(), personne()];
    expect(await assemblerBailColocation(client().supabase, "org", "b1")).toHaveProperty("erreur", expect.stringContaining("au moins un colocataire"));
  });
  it.each(["diagnostics", "inventaire_lignes"])("distingue une panne de lecture d'une annexe absente : %s", async erreur => {
    mocks.charger.mockResolvedValue(colocation(true));
    expect(await assemblerBailColocation(client(erreur).supabase, "org", "b1")).toHaveProperty("erreur");
  });
  it("signale honnêtement l'inventaire vide sans inventer son contenu", async () => {
    mocks.charger.mockResolvedValue(colocation(true));
    const r = await assemblerBailColocation(client("", false).supabase, "org", "b1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(r.document.manquants).toContain("inventaire du mobilier — au moins les 11 éléments du décret");
    expect(r.document.html).not.toContain("Table commune");
  });
});
const chrome = process.env.GERIMMO_CHROME;
it.skipIf(!chrome || !existsSync(chrome))("rend les deux contrats communs en PDF pour la recette visuelle", { timeout: 60000 }, async () => {
  const { rendrePdf } = await import("@/lib/documents/rendu");
  const dossier = join(tmpdir(), "gerimmo-recette-colocation"); mkdirSync(dossier, { recursive: true });
  for (const meuble of [false, true]) {
    const options = { f: new Fusion(), dpeClasse: "D", inventaire: [{ piece: "Salon", designation: "Table commune", quantite: 1, etat: "bon", observation: null }] };
    const doc = meuble ? construireBailMeuble(colocation(true), options) : construireBailNu(colocation(), options);
    const pdf = await rendrePdf(doc); expect(new TextDecoder().decode(pdf.slice(0, 8))).toContain("%PDF-");
    writeFileSync(join(dossier, `colocation-${meuble ? "meuble" : "nu"}.pdf`), pdf);
  }
});
