import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assemblerFactureHonoraires } from "@/lib/documents/modeles/facture-honoraires";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { MODELES } from "@/lib/documents/modeles";
import type { Assemblage } from "@/lib/documents/modeles";

// Le mois facturé doit être révolu : on vise l'avant-dernier mois pour que
// l'épreuve ne bascule pas le 1er du mois suivant.
const MOIS = (() => {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2);
  return d.toISOString().slice(0, 7);
})();
const jour = (n: number) => `${MOIS}-${String(n).padStart(2, "0")}`;

type Row = Record<string, unknown>;
function fixture(): Record<string, Row[]> {
  return {
    organizations: [{
      id: "org", name: "Agence des Lilas", type: "agence", status: "active",
      address_line1: "12 rue du Parc", postal_code: "75012", city: "Paris",
      email_contact: "contact@lilas.test", telephone: "0102030405",
      siret: "12345678901234", tva_intracom: "FR12345678901", tva_franchise: false,
      carte_pro: "CPI 7501 2026 000", garantie_financiere: "Galian, 120 000 €", iban: "FR76 1234",
    }],
    mandats: [{ id: "mandat", organization_id: "org", person_id: "mandant", etat: "actif" }],
    persons: [{
      id: "mandant", organization_id: "org", nom: "Marchand", prenom: "Claire",
      address_line1: "3 allée des Roses", postal_code: "92100", city: "Boulogne", qualite: "SCI",
    }],
    lots: [{ id: "lot", nom: "Appartement Jardin" }],
    ecritures: [
      { id: "e1", lot_id: "lot", mandat_id: "mandat", categorie: "honoraires", sens: "depense", montant: 56.35, date_imputation: jour(5), libelle: "Honoraires de gestion" },
      { id: "e2", lot_id: "lot", mandat_id: "mandat", categorie: "honoraires", sens: "depense", montant: 43.65, date_imputation: jour(12), libelle: "Honoraires de gestion" },
    ],
    // 100,00 TTC → 83,33 HT + 16,67 de TVA (ce que rend la fonction d'émission)
    emettre_facture_honoraires: [{
      id: "f1", numero: "FH-2026-0001", emise_le: jour(28),
      total_ht: 83.33, taux_tva: 20, tva: 16.67, total_ttc: 100,
    }],
  };
}

function mockDb(tables = fixture(), panne?: string) {
  const calls: { table: string; ops: [string, ...unknown[]][] }[] = [];
  const query = (table: string) => {
    const call = { table, ops: [] as [string, ...unknown[]][] }; calls.push(call);
    const q: Record<string, unknown> = {
      then: (resolve: (x: unknown) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: table === panne ? { message: "indisponible" } : null }).then(resolve),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt"]) {
      q[op] = (...args: unknown[]) => { call.ops.push([op, ...args]); return q; };
    }
    return q;
  };
  return { db: { from: query, rpc: query } as unknown as SupabaseClient, calls };
}

const options = { mois: MOIS };
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const erreur = async (r: Promise<Assemblage>) => {
  const a = await r;
  if (!("erreur" in a)) throw new Error("la génération aurait dû être refusée");
  return a.erreur;
};

describe("Facture d’honoraires", () => {
  it("porte le numéro émis, les mentions obligatoires et le décompte de TVA", async () => {
    const { db, calls } = mockDb();
    const r = succes(await assemblerFactureHonoraires(db, "org", "mandat", options));
    expect(r.document.html).toContain("Facture d’honoraires");
    expect(r.document.html).toContain("FH-2026-0001");
    expect(r.document.reference).toBe("FH-2026-0001");
    // Émetteur, client, et les mentions sans lesquelles ce n'est pas une facture
    expect(r.document.html).toContain("Agence des Lilas");
    expect(r.document.html).toContain("12345678901234");
    expect(r.document.html).toContain("FR12345678901");
    expect(r.document.html).toContain("Marchand Claire");
    expect(r.document.html).toContain("3 allée des Roses");
    expect(r.document.html).toContain("CPI 7501 2026 000");
    expect(r.document.html).toContain("L441-10");
    // Décompte : le TTC est la somme du journal, la TVA en est extraite
    expect(r.document.html).toMatch(/83,33\s€/);
    expect(r.document.html).toMatch(/16,67\s€/);
    expect(r.document.html).toMatch(/100,00\s€/);
    expect(r.document.html).not.toMatch(/NaN|Invalid Date|undefined/);
    // Rattachements : la facture se retrouve depuis le mandat et le mandant
    expect(r.liens).toContainEqual({ entite: "mandat", entiteId: "mandat" });
    expect(r.liens).toContainEqual({ entite: "personne", entiteId: "mandant" });
    // Étanchéité : aucune lecture ne sort de l'organisation. La table
    // `organizations` s'identifie par sa propre clé, pas par `organization_id`.
    expect(calls.find((c) => c.table === "organizations")!.ops).toContainEqual(["eq", "id", "org"]);
    for (const c of calls.filter((c) => !["organizations", "emettre_facture_honoraires"].includes(c.table))) {
      expect(c.ops).toContainEqual(["eq", "organization_id", "org"]);
    }
  });

  it("ne demande un numéro que pour les honoraires du mandat et du mois", async () => {
    const { db, calls } = mockDb();
    await assemblerFactureHonoraires(db, "org", "mandat", options);
    const journal = calls.find((c) => c.table === "ecritures")!;
    expect(journal.ops).toContainEqual(["eq", "mandat_id", "mandat"]);
    expect(journal.ops).toContainEqual(["eq", "categorie", "honoraires"]);
    expect(journal.ops).toContainEqual(["gte", "date_imputation", `${MOIS}-01`]);
  });

  it("déduit les annulations du montant facturé", async () => {
    const t = fixture();
    // Une contre-passation porte le sens inverse : 56,35 + 43,65 − 43,65 = 56,35
    t.ecritures.push({ id: "e3", lot_id: "lot", mandat_id: "mandat", categorie: "honoraires", sens: "recette", montant: 43.65, date_imputation: jour(20), libelle: "Annulation — encaissement supprimé", contre_ecriture_de: "e2" });
    t.emettre_facture_honoraires = [{ id: "f1", numero: "FH-2026-0002", emise_le: jour(28), total_ht: 46.96, taux_tva: 20, tva: 9.39, total_ttc: 56.35 }];
    const r = succes(await assemblerFactureHonoraires(mockDb(t).db, "org", "mandat", options));
    expect(r.document.html).toMatch(/56,35\s€/);
    expect(r.document.html).toContain("Annulation");
  });

  it.each([
    ["siret", "son SIRET"],
    ["address_line1", "son adresse"],
    ["tva_intracom", "son numéro de TVA intracommunautaire"],
  ])("refuse d’émettre tant que %s manque au profil", async (colonne, attendu) => {
    const t = fixture(); t.organizations[0][colonne] = null;
    expect(await erreur(assemblerFactureHonoraires(mockDb(t).db, "org", "mandat", options))).toContain(attendu);
  });

  it("en franchise de TVA, porte la mention 293 B et aucune TVA", async () => {
    const t = fixture();
    t.organizations[0].tva_franchise = true; t.organizations[0].tva_intracom = null;
    t.emettre_facture_honoraires = [{ id: "f1", numero: "FH-2026-0003", emise_le: jour(28), total_ht: 100, taux_tva: 0, tva: 0, total_ttc: 100 }];
    const r = succes(await assemblerFactureHonoraires(mockDb(t).db, "org", "mandat", options));
    expect(r.document.html).toContain("293 B");
    expect(r.document.html).toContain("Non applicable");
  });

  it("refuse un mois absent, mal formé ou non révolu", async () => {
    const { db } = mockDb();
    for (const mois of ["", "2026-13", "septembre"]) {
      expect(await erreur(assemblerFactureHonoraires(db, "org", "mandat", { mois }))).toContain("Choisissez le mois");
    }
    const enCours = new Date().toISOString().slice(0, 7);
    expect(await erreur(assemblerFactureHonoraires(db, "org", "mandat", { mois: enCours }))).toContain("n’est pas révolu");
  });

  it("refuse un mois sans honoraires, et des annulations qui ne laissent rien à facturer", async () => {
    const vide = fixture(); vide.ecritures = [];
    expect(await erreur(assemblerFactureHonoraires(mockDb(vide).db, "org", "mandat", options))).toContain("Aucun honoraire");
    const solde = fixture();
    solde.ecritures.push({ id: "e3", lot_id: "lot", mandat_id: "mandat", categorie: "honoraires", sens: "recette", montant: 100, date_imputation: jour(20), libelle: "Annulation", contre_ecriture_de: "e1" });
    expect(await erreur(assemblerFactureHonoraires(mockDb(solde).db, "org", "mandat", options))).toContain("avoir");
  });

  it("refuse de régénérer une facture que le journal a démentie depuis", async () => {
    const t = fixture();
    // La facture émise valait 100 € ; le journal n'en totalise plus que 60
    t.ecritures = [{ id: "e1", lot_id: "lot", mandat_id: "mandat", categorie: "honoraires", sens: "depense", montant: 60, date_imputation: jour(5), libelle: "Honoraires de gestion" }];
    const message = await erreur(assemblerFactureHonoraires(mockDb(t).db, "org", "mandat", options));
    expect(message).toContain("FH-2026-0001");
    expect(message).toContain("avoir");
  });

  it("refuse une organisation qui n’est pas une agence, et un mandat introuvable", async () => {
    const pd = fixture(); pd.organizations[0].type = "proprietaire_direct";
    expect(await erreur(assemblerFactureHonoraires(mockDb(pd).db, "org", "mandat", options))).toContain("agences de gestion");
    const sansMandat = fixture(); sansMandat.mandats = [];
    expect(await erreur(assemblerFactureHonoraires(mockDb(sansMandat).db, "org", "mandat", options))).toContain("introuvable");
  });

  it("ne transforme pas un refus d’émission en facture sans numéro", async () => {
    expect(await erreur(assemblerFactureHonoraires(mockDb(fixture(), "emettre_facture_honoraires").db, "org", "mandat", options)))
      .toContain("responsable de l’agence");
  });

  it("échappe les saisies reprises dans le PDF", async () => {
    const t = fixture(); t.lots[0].nom = "<script>attaque</script>";
    const r = succes(await assemblerFactureHonoraires(mockDb(t).db, "org", "mandat", options));
    expect(r.document.html).not.toContain("<script>attaque");
    expect(r.document.html).toContain("&lt;script&gt;");
  });

  it("est annoncée au catalogue, rangée pour dix ans et réservée au responsable", () => {
    const entree = CATALOGUE_DOCUMENTS.find((m) => m.id === "facture_honoraires")!;
    expect(entree.cible).toBe("mandat");
    expect(MODELES.facture_honoraires.typeGed).toBe("rapport_gestion");
    // Tout le catalogue est désormais générable : plus aucune entrée orpheline
    expect(CATALOGUE_DOCUMENTS.filter((m) => !Object.hasOwn(MODELES, m.code))).toHaveLength(0);
  });
});

// Épreuve locale du rendu : activée explicitement, sans dépendance Chrome en
// CI, comme les épreuves des autres modèles du catalogue.
it.skipIf(!process.env.GERIMMO_CATALOGUE_PDF_DIR || !process.env.GERIMMO_CHROME)(
  "rend l’épreuve PDF de la facture",
  { timeout: 120000 },
  async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { rendrePdf } = await import("@/lib/documents/rendu");
    const dir = process.env.GERIMMO_CATALOGUE_PDF_DIR!;
    mkdirSync(dir, { recursive: true });
    const r = succes(await assemblerFactureHonoraires(mockDb().db, "org", "mandat", options));
    const pdf = await rendrePdf(r.document);
    expect(pdf.length).toBeGreaterThan(10000);
    writeFileSync(join(dir, "facture-honoraires.pdf"), pdf);
  }
);
