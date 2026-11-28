/**
 * Phase 3 de la mission palier 1, lot 48 (troisième tour) — le lien « renseigner » suit l'information qui manque vraiment.
 *
 *  - U04 : en agence, « domicile ou siège social » menait toujours à la fiche du propriétaire, même quand c'était l'adresse de
 *    l'AGENCE (en-tête, même libellé) qui manquait et que le mandant était complet ;
 *  - U05 : la liste des pièces d'un bail sans locataire principal mais avec un colocataire menait à la fiche du colocataire,
 *    où le principal ne se désigne pas ;
 *  - U06 : le contrat d'un lot sans détenteur laissait la qualité du bailleur sans lien et envoyait son adresse électronique
 *    à la fiche du locataire (ou du bail), au lieu de la détention du lot.
 * Chaque cas ci-dessous échouait avant le correctif. Les liens sont ceux que rendent les assembleurs réels.
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
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { enTete, Fusion } from "@/lib/documents/gabarit";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import type { Assemblage } from "@/lib/documents/modeles";

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

beforeEach(() => {
  vi.clearAllMocks();
});

/** Les liens « renseigner » de chaque manquant, tels que les écrans les calculent avec le document assemblé. */
// Reprise du lot 48 : les écrans passent aussi les manquants du bloc du bailleur (`videsBailleur`) ; ces cas les passent de même.
const liensDe = (r: Exclude<Assemblage, { erreur: string }>, modele: string, racine: string) =>
  Object.fromEntries(r.document.manquants.map((m) => [m, lienPourManquant(m, "org", r.liens, modele, racine, r.document.emetteur, r.document.seulementEnTete, r.document.videsBailleur)?.href ?? null]));

describe("U04 — espace d'agence : « domicile ou siège social » suit l'adresse qui manque (en-tête ou corps)", () => {
  const agence = (sur: { agenceSansAdresse?: boolean; mandantSansAdresse?: boolean }) => {
    const ctx = contexte();
    Object.assign(ctx.organisation, { type: "agence", name: "Agence Essai", carte_pro: "CPI 6901 2026 000 000 001" });
    if (sur.agenceSansAdresse) Object.assign(ctx.organisation, { address_line1: null, postal_code: null, city: null });
    if (sur.mandantSansAdresse) ctx.bailleurs[0].address_line1 = null;
    ctx.garants = [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }];
    return ctx;
  };
  const assembler = async (modele: "bail_nu" | "bail_meuble" | "cautionnement", ctx: ReturnType<typeof contexte>) => {
    if (modele === "bail_meuble") {
      Object.assign(ctx.bail, { type: "meuble" });
      ctx.lot.meuble = true;
    }
    mocks.charger.mockResolvedValue(ctx);
    if (modele === "bail_nu") return succes(await assemblerBailNu(base(), "org", "b1"));
    if (modele === "bail_meuble") return succes(await assemblerBailMeuble(base(), "org", "b1"));
    return succes(await assemblerCautionnement(base(), "org", "b1", { garant: "g1", montant_max: "10000", sans_garantie_cumulee: "oui" }));
  };

  it.each(["bail_nu", "bail_meuble", "cautionnement"] as const)("%s : agence sans adresse, mandant complet — le libellé mène au profil de l'agence", async (modele) => {
    const r = await assembler(modele, agence({ agenceSansAdresse: true }));
    expect(r.document.seulementEnTete).toContain("domicile ou siège social");
    const liens = liensDe(r, modele, "/agence");
    expect(liens["domicile ou siège social"]).toBe("/agence/org/profil");
    expect(liens["adresse du mandataire"]).toBe("/agence/org/profil");
  });

  it.each(["bail_nu", "bail_meuble", "cautionnement"] as const)("%s : mandant sans adresse, agence complète — le libellé mène à sa fiche, dans Personnes", async (modele) => {
    const r = await assembler(modele, agence({ mandantSansAdresse: true }));
    expect(r.document.seulementEnTete ?? []).not.toContain("domicile ou siège social");
    const liens = liensDe(r, modele, "/agence");
    expect(liens["domicile ou siège social"]).toBe("/agence/org/personnes");
    expect(r.document.manquants).not.toContain("adresse du mandataire");
  });

  it.each(["bail_nu", "bail_meuble", "cautionnement"] as const)("%s : les deux adresses manquent — la fiche du mandant ET le profil de l'agence sont proposés", async (modele) => {
    const r = await assembler(modele, agence({ agenceSansAdresse: true, mandantSansAdresse: true }));
    const liens = liensDe(r, modele, "/agence");
    expect(liens["domicile ou siège social"]).toBe("/agence/org/personnes");
    expect(liens["adresse du mandataire"]).toBe("/agence/org/profil");
  });

  it("l'en-tête imprime les mêmes champs, dans le même ordre ; seuls ses manques sont notés à part", () => {
    const f = new Fusion();
    const html = enTete(f, { nom: "Agence Essai", adresse: null, email: null }, { libelle: "Contrat", reference: "BAIL-1", etabliLe: "2026-11-23" });
    expect(html).toContain('<div><span class="fusion">domicile ou siège social</span></div>');
    expect(f.manquants).toEqual(["domicile ou siège social", "adresse électronique"]);
    expect(f.seulementEnTete).toEqual(["domicile ou siège social", "adresse électronique"]);
    f.champ(null, "domicile ou siège social");
    expect(f.manquants).toEqual(["domicile ou siège social", "adresse électronique"]);
    expect(f.seulementEnTete).toEqual(["adresse électronique"]);
    // Sans l'information (écran resté sur un ancien état), le libellé garde la règle du corps.
    expect(lienPourManquant("domicile ou siège social", "org", [], "bail_nu", "/agence", "espace")?.href).toBe("/agence/org/personnes");
  });

  it("chez un propriétaire, la règle des détenteurs ne change pas", () => {
    const ctx = contexte();
    ctx.bailleurs[0].address_line1 = null;
    const doc = construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() });
    expect(doc.emetteur).toBe("detenteurs");
    expect(lienPourManquant("domicile ou siège social", "org", [{ entite: "bail", entiteId: "b1" }], "bail_nu", "/espace", doc.emetteur, doc.seulementEnTete)?.href).toBe("/espace/org/personnes");
  });
});

describe("U05 — liste des pièces sans locataire principal, avec un colocataire", () => {
  it("« nom et prénom(s) du ou des locataires » mène à la fiche du bail, pas à celle du colocataire", async () => {
    const ctx = contexte();
    Object.assign(ctx.bail, { type: "colocation", locataire_principal: null });
    ctx.locataires = [personne({ id: "p2", nom: "Martin", prenom: "Léo" })];
    mocks.charger.mockResolvedValue(ctx);
    const r = succes(await assemblerComplementBail("liste_dossier", base(), "org", "b1"));
    expect(r.liens).toContainEqual({ entite: "personne", entiteId: "p2" });
    expect(r.document.manquants).toEqual(["nom et prénom(s) du ou des locataires"]);
    expect(lienPourManquant("nom et prénom(s) du ou des locataires", "org", r.liens, "liste_dossier", "/espace", r.document.emetteur, r.document.seulementEnTete))
      .toEqual({ href: "/espace/org/baux/b1", ecran: "fiche du bail" });
    // Hors de cette liste, le libellé garde sa règle (fiche de la personne quand elle est rattachée).
    expect(lienPourManquant("nom et prénom(s) du ou des locataires", "org", r.liens, "quittance", "/espace")?.ecran).toBe("fiche de la personne");
  });
});

describe("U06 — contrat d'un lot sans détenteur : tout le bloc du bailleur mène à la détention du lot", () => {
  it("bail nu : la qualité du bailleur mène à la détention, comme son adresse et son nom", async () => {
    const ctx = contexte({ bailleurs: [] });
    mocks.charger.mockResolvedValue(ctx);
    const r = succes(await assemblerBailNu(base(), "org", "b1"));
    expect(r.document.emetteur).toBe("espace");
    const qualite = "personne physique, indivision, SCI familiale, SCI, personne morale";
    expect(r.document.manquants).toEqual(expect.arrayContaining([qualite, "domicile ou siège social", "nom et prénom(s), ou dénomination"]));
    expect(r.liens).toContainEqual({ entite: "personne", entiteId: "p1" });
    const detention = `/espace/org/lots/${ctx.lot.id}?vers=detention`;
    const liens = liensDe(r, "bail_nu", "/espace");
    for (const m of [qualite, "domicile ou siège social", "nom et prénom(s), ou dénomination"]) expect(liens[m], m).toBe(detention);
  });

  it("bail meublé : la qualité mène à la détention et l’adresse électronique reste facultative", async () => {
    const ctx = contexte({ bailleurs: [] });
    Object.assign(ctx.bail, { type: "meuble" });
    ctx.lot.meuble = true;
    mocks.charger.mockResolvedValue(ctx);
    const r = succes(await assemblerBailMeuble(base(), "org", "b1"));
    const liens = liensDe(r, "bail_meuble", "/espace");
    expect(liens["adresse électronique"]).toBeUndefined();
    expect(liens["personne physique, SCI, indivision…"]).toBe(`/espace/org/lots/${ctx.lot.id}?vers=detention`);
  });

  // Reprise du lot 48 : ce cas disait voulu que la qualité vide mène à la détention même AVEC un détenteur, où elle ne se saisit
  // pas (la détention ne la demande qu'à un nouveau propriétaire ; elle se corrige sur sa fiche). Avec le document assemblé
  // (`videsBailleur`), elle mène à la fiche du détenteur, et l'adresse électronique suit le bloc où elle manque
  // (tests/lot48-reprise.test.ts). Ne restent ici que les règles appliquées SANS cette information (écran resté sur un état
  // calculé avant la reprise), où l'on ne sait pas si le lot a un détenteur.
  it("sans l'information du document (état d'avant la reprise) : les règles d'avant, faute de savoir si le lot a un détenteur", () => {
    const liens = [{ entite: "bail" as const, entiteId: "b1" }, { entite: "lot" as const, entiteId: "l1" }, { entite: "personne" as const, entiteId: "p1" }];
    expect(lienPourManquant("adresse électronique", "org", liens, "bail_nu", "/espace", "detenteurs")?.href).toBe("/espace/org/personnes/p1");
    expect(lienPourManquant("personne physique, indivision, SCI familiale, SCI, personne morale", "org", liens, "bail_nu", "/agence", "espace")?.href).toBe("/agence/org/lots/l1?vers=detention");
    // L'acte de cautionnement n'imprime pas l'adresse électronique du bailleur : celle de l'en-tête (espace) reste au profil.
    expect(lienPourManquant("adresse électronique", "org", liens, "cautionnement", "/espace", "espace")?.href).toBe("/espace/org/profil");
  });
});
