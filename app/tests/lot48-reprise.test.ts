/**
 * Phase 3 de la mission palier 1, reprise du lot 48 — derniers constats des contre-relectures du troisième tour.
 *
 *  - U04 : en agence, l'adresse électronique de l'agence seule manquante menait à la fiche du locataire, complète ; chez un
 *    propriétaire, un détenteur sans e-mail (espace sans contact de gestion) aussi.
 *  - U06 : en agence, le contrat d'un lot sans détenteur menait l'adresse électronique du bailleur à la fiche du locataire et
 *    son domicile à la liste Personnes ; la qualité vide d'un détenteur EXISTANT menait à la détention du lot, où elle ne se
 *    saisit pas (elle se corrige sur sa fiche).
 *  - U02 : un duplex dont le niveau bas est le rez-de-chaussée (« RDC et 1er ») redisait l'étage déjà nommé par le lot.
 * Chaque cas ci-dessous échouait avant la reprise, sauf les témoins signalés.
 *
 * Phase 3, lot 49 : la partie U07 de ce fichier (quittance délivrée composée avec les coordonnées des détenteurs, migration
 * 20261123230000) est retirée avec U07 lui-même, non livré dans cette publication (décision du dirigeant attendue) ; la
 * quittance délivrée revient à son comportement d'avant le lot 48, vérifié dans tests/lot49-reprise.test.ts.
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
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { Fusion } from "@/lib/documents/gabarit";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { mentionEtage } from "@/lib/etage";
import type { Assemblage } from "@/lib/documents/modeles";

beforeEach(() => {
  vi.clearAllMocks();
});

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}

// Une base minimale : chaque table rend ses lignes (maybeSingle : la première), sans appliquer les filtres.
function base(tables: Record<string, unknown[]> = {}) {
  const from = (table: string) => {
    const lignes = tables[table] ?? (table === "diagnostics" ? [{ classe_dpe: "D" }] : []);
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
    };
    for (const op of ["select", "eq", "in", "is", "not", "or", "order", "limit", "range", "gte"]) q[op] = () => q;
    return q;
  };
  return { from, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
}

type Modele = "bail_nu" | "bail_meuble" | "cautionnement";
async function assembler(modele: Modele, ctx: ReturnType<typeof contexte>) {
  if (modele === "bail_meuble") {
    Object.assign(ctx.bail, { type: "meuble" });
    ctx.lot.meuble = true;
  }
  ctx.garants = [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }];
  mocks.charger.mockResolvedValue(ctx);
  if (modele === "bail_nu") return succes(await assemblerBailNu(base(), "org", "b1"));
  if (modele === "bail_meuble") return succes(await assemblerBailMeuble(base(), "org", "b1"));
  return succes(await assemblerCautionnement(base(), "org", "b1", { garant: "g1", montant_max: "10000", sans_garantie_cumulee: "oui" }));
}
/** Les liens « renseigner » de chaque manquant, tels que les écrans les calculent avec le document assemblé. */
const liensDe = (r: Exclude<Assemblage, { erreur: string }>, modele: string, racine: string) =>
  Object.fromEntries(r.document.manquants.map((m) => [m, lienPourManquant(m, "org", r.liens, modele, racine, r.document.emetteur, r.document.seulementEnTete, r.document.videsBailleur)?.href ?? null]));
const agence = (ctx = contexte()) => {
  Object.assign(ctx.organisation, { type: "agence", name: "Agence Essai", carte_pro: "CPI 6901 2026 000 000 001" });
  return ctx;
};
const QUALITE_NU = "personne physique, indivision, SCI familiale, SCI, personne morale";
const QUALITE_MEUBLE = "personne physique, SCI, indivision…";

describe("U04 — « adresse électronique » suit l'information qui manque vraiment (en-tête, bailleur, locataire)", () => {
  it.each(["bail_nu", "bail_meuble"] as const)("%s, agence sans e-mail, tout le reste complet : le profil de l'agence", async (modele) => {
    const ctx = agence();
    ctx.organisation.email_contact = null;
    const r = await assembler(modele, ctx);
    expect(r.document.seulementEnTete).toContain("adresse électronique");
    expect(r.document.videsBailleur ?? []).not.toContain("adresse électronique");
    expect(liensDe(r, modele, "/agence")["adresse électronique"]).toBe("/agence/org/profil");
  });

  it.each(["bail_nu", "bail_meuble"] as const)("%s, agence, mandant sans e-mail : sa fiche dans Personnes, plus celle du locataire", async (modele) => {
    const ctx = agence();
    ctx.bailleurs[0].email = null;
    const r = await assembler(modele, ctx);
    expect(r.document.videsBailleur).toContain("adresse électronique");
    expect(liensDe(r, modele, "/agence")["adresse électronique"]).toBe("/agence/org/personnes");
  });

  it.each(["bail_nu", "bail_meuble"] as const)("%s, propriétaire, détenteur sans e-mail dans un espace sans contact de gestion : sa fiche", async (modele) => {
    const ctx = contexte();
    ctx.bailleurs[0].email = null;
    ctx.organisation.email_contact = null;
    const r = await assembler(modele, ctx);
    expect(r.document.emetteur).toBe("detenteurs");
    expect(liensDe(r, modele, "/espace")["adresse électronique"]).toBe("/espace/org/personnes");
  });

  it("témoin : seul l'e-mail du locataire manque — la fiche du locataire, comme avant", async () => {
    const ctx = agence();
    ctx.locataires[0].email = null;
    const r = await assembler("bail_nu", ctx);
    expect(r.document.seulementEnTete ?? []).not.toContain("adresse électronique");
    expect(r.document.videsBailleur ?? []).not.toContain("adresse électronique");
    expect(liensDe(r, "bail_nu", "/agence")["adresse électronique"]).toBe(`/agence/org/personnes/${ctx.locataires[0].id}`);
  });
});

describe("U06 — tout le bloc du bailleur mène à l'écran du détenteur, dans les deux types d'espace", () => {
  it.each([["bail_nu", QUALITE_NU], ["bail_meuble", QUALITE_MEUBLE]] as const)("%s, agence, lot sans détenteur : les quatre libellés du bailleur mènent à la détention", async (modele, qualite) => {
    const ctx = agence(contexte({ bailleurs: [] }));
    const r = await assembler(modele, ctx);
    const liens = liensDe(r, modele, "/agence");
    for (const m of ["nom et prénom(s), ou dénomination", qualite, "domicile ou siège social", "adresse électronique"]) {
      expect(liens[m], m).toBe(`/agence/org/lots/${ctx.lot.id}?vers=detention`);
    }
  });

  it("acte de cautionnement, agence, lot sans détenteur : le domicile du bailleur mène là où mène son nom", async () => {
    const ctx = agence(contexte({ bailleurs: [] }));
    const r = await assembler("cautionnement", ctx);
    const liens = liensDe(r, "cautionnement", "/agence");
    // L'acte n'est rattaché qu'au bail et à la caution (pas au lot) : la détention n'a pas d'adresse ici, le lien retombe sur la
    // fiche du bail, d'où le lot s'ouvre. Le domicile menait à la liste Personnes, où l'on n'ajoute pas de détenteur.
    expect(liens["domicile ou siège social"]).toBe(liens["nom et prénom(s), ou dénomination"]);
    expect(liens["domicile ou siège social"]).toBe("/agence/org/baux/b1");
  });

  it("témoin : chez un propriétaire, le lot sans détenteur mène toujours les quatre libellés à la détention", async () => {
    const ctx = contexte({ bailleurs: [] });
    const r = await assembler("bail_nu", ctx);
    const liens = liensDe(r, "bail_nu", "/espace");
    for (const m of ["nom et prénom(s), ou dénomination", QUALITE_NU, "domicile ou siège social", "adresse électronique"]) {
      expect(liens[m], m).toBe(`/espace/org/lots/${ctx.lot.id}?vers=detention`);
    }
  });

  it.each([["bail_nu", QUALITE_NU, "/espace"], ["bail_meuble", QUALITE_MEUBLE, "/espace"], ["bail_nu", QUALITE_NU, "/agence"], ["bail_meuble", QUALITE_MEUBLE, "/agence"]] as const)(
    "%s, détenteur EXISTANT sans qualité (%s, %s) : sa fiche dans Personnes, où la qualité se corrige — plus la détention",
    async (modele, qualite, racine) => {
      const ctx = racine === "/agence" ? agence() : contexte();
      ctx.bailleurs[0].qualite = null;
      const r = await assembler(modele, ctx);
      expect(r.document.manquants).toContain(qualite);
      expect(liensDe(r, modele, racine)[qualite]).toBe(`${racine}/org/personnes`);
    }
  );

  it("le bloc du bailleur s'imprime à l'identique : seuls ses manques sont notés à part", () => {
    const ctx = contexte();
    ctx.bailleurs[0].qualite = null;
    ctx.bailleurs[0].email = null;
    const f = new Fusion();
    const doc = construireBailNu(ctx, { dpeClasse: "D", f });
    expect(doc.html).toContain(`— Qualité : <span class="fusion">${QUALITE_NU}</span><br/>`);
    expect(doc.html).toContain('Adresse électronique : <span class="fusion">adresse électronique</span> — Numéro de');
    expect(doc.videsBailleur).toEqual([QUALITE_NU, "adresse électronique"]);
    // Hors du bloc, rien n'est noté comme venant du bailleur.
    const g = new Fusion();
    g.champ(null, "adresse électronique");
    expect(g.bailleur(() => g.champ(null, "domicile ou siège social"))).toBe('<span class="fusion">domicile ou siège social</span>');
    expect(g.auBailleur).toEqual(["domicile ou siège social"]);
  });
});

describe("U02 — un duplex dont le niveau bas est le rez-de-chaussée n'est plus redit", () => {
  it.each([
    ["RDC et 1er", "Duplex RDC et 1er étage", null],
    ["rez-de-chaussée et 1er", "Maison rez-de-chaussée et 1er étage", null],
    ["RDC et 1er", "Duplex RDC et 1er étages", null],
    ["RDC et premier", "Duplex rez-de-chaussée et 1er étage", null],
    ["RDC et 1er, porte B", "Duplex RDC et 1er étage", "porte B"],
    // Phase 3, lot 49 (V02) : un seul des deux niveaux, que le nom du duplex nomme déjà, n'est pas redit non plus. Attente
    // précédente (témoin « la mention reste ») : « RDC », soit l'adresse « Duplex RDC et 1er étage, RDC ».
    ["RDC", "Duplex RDC et 1er étage", null],
  ])("« %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });

  it.each([
    // Un niveau que le nom du lot ne dit pas : la mention reste.
    ["RDC et 2e", "Duplex RDC et 1er étage", "RDC et 2e"],
    ["RDC et 1er", "Studio RDC", "RDC et 1er"],
    ["RDC et 1er", "Studio 1er étage", "RDC et 1er"],
    // Sans nom de lot, la saisie s'imprime telle quelle ; le rez-de-chaussée seul se lit comme avant.
    ["RDC et 1er", null, "RDC et 1er"],
    ["RDC, porte B", "Studio — RDC", "porte B"],
    ["1er et 2e", "Duplex 1er et 2e étage", null],
  ])("témoin : « %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });
});
