/**
 * Phase 3 de la mission palier 1, reprise du lot 46 (second tour) — constats des relecteurs contradictoires.
 *
 *  - T19 : le bail meublé ne rendait aucun lien vers le lot : « domicile ou siège social » et « ou dénomination » d'un lot sans
 *    détenteur menaient à la fiche du bail, pas à la détention (le test du second passage fabriquait un lien que l'assembleur ne
 *    produisait pas) ;
 *  - T19 : en agence, « domicile ou siège social » d'un contrat (le bailleur au corps) menait au profil de l'agence, déjà complet ;
 *  - T21 : des refus pour une donnée à compléter restaient des refus sans lien (contrat sans locataire principal, colocation sans
 *    second colocataire, liste de pièces sans personne, demande d'attestation d'assurance sans personne) ; ils sont « incomplets »,
 *    avec la liste « À renseigner ».
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

const mocks = vi.hoisted(() => ({ charger: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: mocks.charger,
  signatureOrganisation: vi.fn(async () => null),
}));
import { assemblerBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerBailNu, construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerBailIndividuel } from "@/lib/documents/modeles/bail-individuel";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { Fusion } from "@/lib/documents/gabarit";
import { lienPourManquant, MANQUE_LOCATAIRE_ATTESTATION } from "@/lib/documents/ou-renseigner";
import type { Assemblage } from "@/lib/documents/modeles";

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}

// Une base minimale : chaque table rend ses lignes (maybeSingle : la première), sans appliquer les filtres ; « error » simulé.
function base(tables: Record<string, unknown[]> = {}, enErreur: string[] = []) {
  const lues: string[] = [];
  const from = (table: string) => {
    lues.push(table);
    const lignes = tables[table] ?? (table === "diagnostics" ? [{ classe_dpe: "D" }] : []);
    const error = enErreur.includes(table) ? { message: "indisponible" } : null;
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: error ? null : lignes, error }).then(ok),
      maybeSingle: async () => ({ data: error ? null : lignes[0] ?? null, error }),
    };
    for (const op of ["select", "eq", "in", "is", "not", "or", "order", "limit", "range", "gte"]) q[op] = () => q;
    return q;
  };
  return { db: { from, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient, lues };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T19 — bail meublé : les liens rendus par l'assembleur mènent à la détention du lot", () => {
  it("lot sans détenteur : « domicile ou siège social » et « ou dénomination » vont à la fiche du lot (détention)", async () => {
    const ctx = contexte({ bailleurs: [] });
    ctx.bail.type = "meuble";
    ctx.lot.meuble = true;
    mocks.charger.mockResolvedValue(ctx);
    const r = succes(await assemblerBailMeuble(base().db, "org", "b1"));
    expect(r.liens).toContainEqual({ entite: "lot", entiteId: ctx.lot.id });
    expect(r.document.emetteur).toBe("espace");
    expect(r.document.manquants).toEqual(expect.arrayContaining(["nom et prénom(s), ou dénomination", "domicile ou siège social"]));
    const detention = { href: `/espace/org/lots/${ctx.lot.id}?vers=detention`, ecran: "fiche du lot" };
    // Les liens RÉELS de l'assembleur (le second passage testait des liens fabriqués, avec un lot que le meublé ne rendait pas).
    expect(lienPourManquant("domicile ou siège social", "org", r.liens, "bail_meuble", "/espace", r.document.emetteur)).toEqual(detention);
    expect(lienPourManquant("nom et prénom(s), ou dénomination", "org", r.liens, "bail_meuble", "/espace", r.document.emetteur)).toEqual(detention);
  });
});

describe("T19 — espace d'agence : le bailleur du corps n'est pas l'en-tête de l'agence", () => {
  const agence = () => {
    const ctx = contexte();
    Object.assign(ctx.organisation, { type: "agence", name: "Agence Essai", carte_pro: "CPI 6901 2026 000 000 001" });
    return ctx;
  };
  it("profil de l'agence complet, mandant sans adresse : « domicile ou siège social » mène à sa fiche, dans Personnes", () => {
    const ctx = agence();
    ctx.bailleurs[0].address_line1 = null;
    const doc = construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() });
    expect(doc.emetteur).toBe("espace");
    expect(doc.manquants).toContain("domicile ou siège social");
    expect(doc.manquants).not.toContain("adresse du mandataire");
    const liens = [{ entite: "bail" as const, entiteId: "b1" }, { entite: "lot" as const, entiteId: ctx.lot.id }];
    for (const modele of ["bail_nu", "bail_meuble", "bail_colocation", "bail_individuel", "cautionnement"]) {
      expect(lienPourManquant("domicile ou siège social", "org", liens, modele, "/agence", "espace")).toEqual({ href: "/agence/org/personnes", ecran: "fiche du propriétaire, dans Personnes" });
    }
  });
  it("adresse de l'agence manquante : elle est signalée aussi « adresse du mandataire », qui mène au profil de l'agence", () => {
    const ctx = agence();
    Object.assign(ctx.organisation, { address_line1: null, postal_code: null, city: null });
    const doc = construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() });
    expect(doc.manquants).toContain("adresse du mandataire");
    expect(lienPourManquant("adresse du mandataire", "org", [{ entite: "bail", entiteId: "b1" }], "bail_nu", "/agence", doc.emetteur)?.href).toBe("/agence/org/profil");
    // Un document qui n'imprime l'adresse qu'en en-tête garde le profil de l'agence.
    expect(lienPourManquant("domicile ou siège social", "org", [{ entite: "bail", entiteId: "b1" }], "quittance", "/agence", "espace")?.href).toBe("/agence/org/profil");
  });
});

describe("T21 — une donnée à compléter rend le document incomplet (« À renseigner »), plus refusé", () => {
  it("contrat nu sans locataire principal : incomplet, « nom et prénom(s) » mène à la fiche du bail ; aucun PDF", async () => {
    const ctx = contexte();
    ctx.bail.locataire_principal = null;
    ctx.locataires = [];
    mocks.charger.mockResolvedValue(ctx);
    const r = succes(await assemblerBailNu(base().db, "org", "b1"));
    expect(refusDocumentIncomplet(r.document)?.manquants).toContain("nom et prénom(s)");
    expect(lienPourManquant("nom et prénom(s)", "org", r.liens, "bail_nu", "/espace", r.document.emetteur)).toEqual({ href: "/espace/org/baux/b1", ecran: "fiche du bail" });
  });
  it("principal absent mais un colocataire lu : le contrat reste bloqué (le principal manque toujours)", async () => {
    const ctx = contexte();
    ctx.bail.locataire_principal = null;
    ctx.locataires = [personne({ id: "p2", nom: "Martin", prenom: "Léo" })];
    mocks.charger.mockResolvedValue(ctx);
    const r = succes(await assemblerBailNu(base().db, "org", "b1"));
    expect(r.document.manquants).toContain("nom et prénom(s)");
  });
  it("contrat individuel qui désigne deux locataires : refus inchangé (aucune saisie ne le complète)", async () => {
    const ctx = contexte();
    Object.assign(ctx.bail, { type: "colocation", chambre_id: "ch1", locataire_principal: "p1" });
    ctx.chambre = { id: "ch1", nom: "Chambre 1", surface_m2: 14, volume_m3: 35, description: "Chambre", espaces_partages: "Cuisine", equipements: null };
    ctx.locataires = [personne(), personne({ id: "p2", nom: "Martin", prenom: "Léo" })];
    mocks.charger.mockResolvedValue(ctx);
    expect(await assemblerBailIndividuel(base().db, "org", "b1")).toEqual({ erreur: "Le contrat individuel doit désigner un seul locataire." });
  });
  it("colocation sans second colocataire : « nom du colocataire 2 » mène à la fiche du bail (carte Colocation)", () => {
    expect(lienPourManquant("nom du colocataire 2", "org", [{ entite: "bail", entiteId: "b1" }, { entite: "personne", entiteId: "p1" }], "bail_colocation", "/espace")).toEqual({ href: "/espace/org/baux/b1", ecran: "fiche du bail" });
  });
  it("liste des pièces du dossier sans locataire principal : incomplète, la personne se désigne sur la fiche du bail", async () => {
    const ctx = contexte();
    ctx.bail.locataire_principal = null;
    ctx.locataires = [];
    mocks.charger.mockResolvedValue(ctx);
    const { db, lues } = base();
    const r = succes(await assemblerComplementBail("liste_dossier", db, "org", "b1"));
    expect(r.document.manquants).toEqual(["nom et prénom(s) du ou des locataires"]);
    expect(lues).not.toContain("pieces_demandees");
    expect(lienPourManquant("nom et prénom(s) du ou des locataires", "org", r.liens, "liste_dossier", "/espace", r.document.emetteur)?.ecran).toBe("fiche du bail");
  });
  describe("demande d'attestation d'assurance", () => {
    const tables = (liens: unknown[], persons: unknown[] = []) => ({
      documents: [{ id: "doc1", organization_id: "org", type: "attestation_assurance", expire_le: "2026-12-05" }],
      organizations: [{ name: "Parc de Claire Moreau", type: "proprietaire_direct", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: null, email_contact: "parc@exemple.fr" }],
      document_liens: liens,
      persons,
    });
    it("attestation rattachée à aucune personne : incomplète, le locataire se rattache depuis Documents ; aucun bail cherché", async () => {
      const { db, lues } = base(tables([]));
      const r = succes(await assemblerRappelAssurance(db, "org", "doc1"));
      expect(r.document.manquants).toContain(MANQUE_LOCATAIRE_ATTESTATION);
      expect(lues).not.toContain("baux");
      expect(r.liens).toEqual([]);
      expect(lienPourManquant(MANQUE_LOCATAIRE_ATTESTATION, "org", r.liens, "rappel_assurance", "/espace", r.document.emetteur)).toEqual({ href: "/espace/org/documents", ecran: "Documents" });
    });
    it("personne rattachée mais illisible, ou rattachements illisibles : refus qui le dit (ce n'est pas une donnée à compléter)", async () => {
      expect(await assemblerRappelAssurance(base(tables([{ entite_id: "p-archivee" }])).db, "org", "doc1"))
        .toEqual({ erreur: "La fiche de la personne rattachée à l'attestation ne peut pas être lue. Réessayez." });
      expect(await assemblerRappelAssurance(base(tables([]), ["document_liens"]).db, "org", "doc1"))
        .toEqual({ erreur: "Les rattachements de l'attestation ne peuvent pas être lus. Réessayez." });
    });
  });
});
