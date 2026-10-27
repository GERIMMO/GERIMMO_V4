import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte, personne } from "./fixtures/contexte-document";
import { verifierCompletudeBrouillonBail } from "@/lib/documents/completude-brouillon-bail";
import { Fusion } from "@/lib/documents/gabarit";
import { assemblerBailNu, construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerBailMeuble, construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerBailColocation } from "@/lib/documents/modeles/bail-colocation";
import { assemblerBailIndividuel } from "@/lib/documents/modeles/bail-individuel";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";

const mocks = vi.hoisted(() => ({ charger: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({
  ...await original<typeof import("@/lib/documents/modeles/communs")>(), chargerContexteBail: mocks.charger,
}));

function client(erreur?: string, sansDpe = false) {
  const from = vi.fn((table: string) => {
    const resultat = Promise.resolve({
      data: table === "diagnostics" ? (sansDpe ? null : { classe_dpe: "D" }) : [],
      error: table === erreur ? { message: "indisponible" } : null,
    });
    const q = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: () => resultat, then: resultat.then.bind(resultat) };
    return q;
  });
  return { supabase: { from } as unknown as SupabaseClient, from };
}

function brouillon(type = "nu", individuel = false) {
  const ctx = contexte();
  ctx.bail.type = type;
  ctx.bail.locataire_principal = null;
  ctx.bail.loyer_hc = null;
  ctx.lot.chauffage = null;
  ctx.locataires = [];
  if (individuel) {
    ctx.bail.chambre_id = "ch1";
    ctx.chambre = { id: "ch1", nom: "Chambre 1", surface_m2: 14, volume_m3: 35, description: "Chambre", espaces_partages: "Cuisine", equipements: null };
    ctx.plafondColocation = 650;
  }
  return ctx;
}

beforeEach(() => { vi.clearAllMocks(); mocks.charger.mockResolvedValue(brouillon()); });

it.each(["nu", "meuble", "colocation", "individuel"])("évalue toutes les étapes du brouillon sans locataire : %s", async (type) => {
  const ctx = brouillon(type === "individuel" ? "colocation" : type, type === "individuel");
  mocks.charger.mockResolvedValue(ctx);
  const resultat = await verifierCompletudeBrouillonBail(client().supabase, "org", "b1");
  expect(resultat.erreur).toBeUndefined();
  expect(resultat.manquants).toEqual(expect.arrayContaining(["nom et prénom(s)", "chauffage du logement", "montant mensuel"]));
  expect(new Set(resultat.manquants).size).toBe(resultat.manquants.length);
});

it.each([false, true])("reprend exactement les mentions du contrat quand les signataires sont connus : meublé=%s", async (meuble) => {
  const ctx = contexte();
  ctx.bail.type = meuble ? "meuble" : "nu";
  mocks.charger.mockResolvedValue(ctx);
  const options = { f: new Fusion(), dpeClasse: "D", inventaire: [] };
  const attendu = meuble ? construireBailMeuble(ctx, options) : construireBailNu(ctx, options);
  expect(await verifierCompletudeBrouillonBail(client().supabase, "org", "b1")).toEqual({ manquants: [...new Set(attendu.manquants)] });
});

it("distingue la naissance et l’entrée manquantes dans un meublé, pour corriger chaque étape", async () => {
  const ctx = contexte();
  ctx.bail.type = "meuble";
  ctx.bail.date_debut = null;
  ctx.locataires[0].date_naissance = null;
  mocks.charger.mockResolvedValue(ctx);
  const resultat = await verifierCompletudeBrouillonBail(client().supabase, "org", "b1");
  expect(resultat.manquants).toEqual(expect.arrayContaining(["Date de naissance du locataire", "Date d’entrée"]));
  expect(resultat.manquants).not.toContain("jj/mm/aaaa");
  expect(cibleChampBail("Date de naissance du locataire", "org")).toMatchObject({ etape: "personnes", href: "#titre-locataires-bail" });
  expect(cibleChampBail("Date d’entrée", "org")).toMatchObject({ etape: "bail", href: "#parcours-date_debut" });
  ctx.bail.date_debut = "2026-11-01";
  const naissanceRestante = await verifierCompletudeBrouillonBail(client().supabase, "org", "b1");
  expect(naissanceRestante.manquants).toContain("Date de naissance du locataire");
  expect(naissanceRestante.manquants).not.toContain("Date d’entrée");
  ctx.locataires[0].date_naissance = "1990-02-28";
  const datesCompletes = await verifierCompletudeBrouillonBail(client().supabase, "org", "b1");
  expect(datesCompletes.manquants).not.toContain("Date de naissance du locataire");
});

it("signale le principal absent même si un colocataire est déjà renseigné", async () => {
  const ctx = contexte();
  ctx.bail.type = "colocation";
  ctx.bail.locataire_principal = null;
  mocks.charger.mockResolvedValue(ctx);
  const resultat = await verifierCompletudeBrouillonBail(client().supabase, "org", "b1");
  expect(resultat.erreur).toBeUndefined();
  expect(resultat.manquants).toContain("nom et prénom(s)");
});

it("ne compte pas deux fois le même signataire pour compléter une colocation", async () => {
  const ctx = contexte();
  ctx.bail.type = "colocation";
  ctx.locataires.push(personne());
  mocks.charger.mockResolvedValue(ctx);
  expect((await verifierCompletudeBrouillonBail(client().supabase, "org", "b1")).manquants).toContain("nom du colocataire 2");
  ctx.locataires.push(personne({ id: "p2" }));
  expect((await verifierCompletudeBrouillonBail(client().supabase, "org", "b1")).manquants).not.toContain("nom du colocataire 2");
});

it.each([false, true])("choisit l’inventaire selon le régime enregistré de la colocation : meublé=%s", async (meuble) => {
  const ctx = brouillon("colocation");
  ctx.lot.meuble = meuble;
  mocks.charger.mockResolvedValue(ctx);
  const c = client();
  const resultat = await verifierCompletudeBrouillonBail(c.supabase, "org", "b1");
  expect(c.from.mock.calls.some(([table]) => table === "inventaire_lignes")).toBe(meuble);
  expect(resultat.manquants.includes("inventaire du mobilier — au moins les 11 éléments du décret")).toBe(meuble);
});

it.each(["diagnostics", "inventaire_lignes"])("garde une erreur de lecture distincte d’une annexe absente : %s", async (table) => {
  mocks.charger.mockResolvedValue(brouillon("meuble"));
  expect(await verifierCompletudeBrouillonBail(client(table).supabase, "org", "b1")).toEqual({ erreur: expect.any(String), manquants: [] });
});

it("accepte un DPE et un inventaire absents comme des données à compléter", async () => {
  mocks.charger.mockResolvedValue(brouillon("meuble"));
  const resultat = await verifierCompletudeBrouillonBail(client(undefined, true).supabase, "org", "b1");
  expect(resultat.erreur).toBeUndefined();
  expect(resultat.manquants).toContain("inventaire du mobilier — au moins les 11 éléments du décret");
});

it("n’invente pas de complétude quand le contexte est illisible", async () => {
  mocks.charger.mockResolvedValue({ erreur: "Lecture impossible" });
  const c = client();
  expect(await verifierCompletudeBrouillonBail(c.supabase, "org", "b1")).toEqual({ erreur: "Lecture impossible", manquants: [] });
  expect(c.from).not.toHaveBeenCalled();
});

it("distingue un principal référencé mais introuvable d’un principal non renseigné", async () => {
  const ctx = brouillon();
  ctx.bail.locataire_principal = "p-inaccessible";
  mocks.charger.mockResolvedValue(ctx);
  expect(await verifierCompletudeBrouillonBail(client().supabase, "org", "b1")).toEqual({ erreur: expect.stringContaining("principal"), manquants: [] });
});

it.each([
  ["nu", assemblerBailNu], ["meuble", assemblerBailMeuble],
  ["colocation", assemblerBailColocation], ["individuel", assemblerBailIndividuel],
] as const)("conserve le refus de génération sans locataire : %s", async (type, assembler) => {
  mocks.charger.mockResolvedValue(brouillon(type === "individuel" ? "colocation" : type, type === "individuel"));
  const c = client();
  expect(await assembler(c.supabase, "org", "b1")).toHaveProperty("erreur");
  expect(c.from).not.toHaveBeenCalled();
});
