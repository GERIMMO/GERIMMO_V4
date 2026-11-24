/**
 * Phase 3 de la mission palier 1, reprise du lot 48 — derniers constats des contre-relectures du troisième tour.
 *
 *  - U07 : la quittance délivrée au locataire d'un propriétaire qui gère lui-même imprimait le nom et l'adresse des
 *    bailleurs, mais l'e-mail et le téléphone du profil de l'espace ; le PDF de la même quittance imprime ceux des détenteurs
 *    (ou « Contact de gestion : » et l'e-mail de l'espace). Les bailleurs n'étaient pas non plus rangés de même (page : par la
 *    base ; PDF : dans l'ordre des détentions) : avec deux bailleurs, noms, adresses et « Fait à » pouvaient différer.
 *  - U04 : en agence, l'adresse électronique de l'agence seule manquante menait à la fiche du locataire, complète ; chez un
 *    propriétaire, un détenteur sans e-mail (espace sans contact de gestion) aussi.
 *  - U06 : en agence, le contrat d'un lot sans détenteur menait l'adresse électronique du bailleur à la fiche du locataire et
 *    son domicile à la liste Personnes ; la qualité vide d'un détenteur EXISTANT menait à la détention du lot, où elle ne se
 *    saisit pas (elle se corrige sur sa fiche).
 *  - U02 : un duplex dont le niveau bas est le rez-de-chaussée (« RDC et 1er ») redisait l'étage déjà nommé par le lot.
 * Chaque cas ci-dessous échouait avant la reprise, sauf les témoins signalés.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

const mocks = vi.hoisted(() => ({ charger: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: mocks.charger,
  signatureOrganisation: vi.fn(async () => null),
}));
import { assemblerBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerBailNu, construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { assemblerQuittance, ordreBailleursQuittance } from "@/lib/documents/modeles/quittance";
import { Fusion } from "@/lib/documents/gabarit";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { mentionEtage } from "@/lib/etage";
import { assemblerQuittanceDelivree, manquantsQuittance, motifQuittanceIncomplete, type DonneesQuittanceDocument } from "@/lib/quittance-conforme";
import type { Assemblage } from "@/lib/documents/modeles";

beforeEach(() => {
  vi.clearAllMocks();
});

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[\s  ]+/g, " ").trim();
/** Le bloc de l'émetteur (nom, adresse, contact), sans le cartouche de référence. */
const emetteurDe = (html: string) => texte(html.split('<div class="cartouche-ref">')[0].split('<header class="entete">')[1] ?? "");
const bailleurDe = (html: string) => /Bailleur\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];
const faitA = (html: string) => /Fait à [^,]+?,? le \d{2}\/\d{2}\/\d{4}/.exec(texte(html))?.[0];

describe("U07 — la quittance délivrée et le PDF de la même quittance ont le même en-tête", () => {
  const CLAIRE = personne({ id: "p1", nom: "Moreau", prenom: "Claire", email: "claire@exemple.fr", telephone: "0611111111", address_line1: "3 rue du Domicile", postal_code: "69100", city: "Villeurbanne", qualite: "Personne physique" });
  const MARC = personne({ id: "p2", nom: "Petit", prenom: "Marc", email: "marc@exemple.fr", telephone: "0622222222", address_line1: "12 quai Perrache", postal_code: "69002", city: "Lyon", qualite: "Personne physique" });
  const ESPACE = { name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: "0400000000", email_contact: "parc@exemple.fr" };

  /** Le PDF : les détenteurs dans l'ordre où la base les rend (ici Petit avant Moreau). */
  async function pdf(bailleurs: typeof CLAIRE[], espace: Partial<typeof ESPACE> = {}) {
    const ctx = contexte();
    ctx.organisation = { ...ctx.organisation, ...ESPACE, ...espace, type: "proprietaire_direct" };
    ctx.bailleurs = bailleurs.map((b) => ({ ...b, quote_part: 50 }));
    mocks.charger.mockResolvedValue(ctx);
    const lignes: Record<string, unknown> = {
      quittances: { id: "q0000000-0000", bail_id: "b1", appel_id: "a1", est_quittance: true, montant: 700, date_emission: "2026-09-05" },
      appels_loyer: [{ id: "a1", periode: "2026-09-01", loyer_hc: 650, charges: 50, montant_du: 700, prorata: false }],
      encaissements: [{ date_paiement: "2026-09-04", mode: "virement", montant: 700, created_at: null }],
    };
    const from = (table: string) => {
      const r = Promise.resolve({ data: lignes[table] ?? null, error: null });
      const q = { select: () => q, eq: () => q, order: () => q, maybeSingle: () => r, then: r.then.bind(r) };
      return q;
    };
    return succes(await assemblerQuittance({ from, rpc: vi.fn() } as unknown as SupabaseClient, "org", "q1")).document;
  }

  /** La page : la même quittance telle que `quittance_document` la rend (rangée par la base : Moreau avant Petit). */
  function page(bailleurs: typeof CLAIRE[], espace: Partial<typeof ESPACE> = {}, sansContact = false) {
    const o = { ...ESPACE, ...espace };
    const d: DonneesQuittanceDocument = quittanceDocumentComplete({
      organisation: { type: "proprietaire_direct", nom: o.name, siret: null, carte_pro: null, adresse: o.address_line1, code_postal: o.postal_code, ville: o.city, telephone: o.telephone, email: o.email_contact },
      bailleurs: [...bailleurs].sort((a, b) => a.nom.localeCompare(b.nom)).map((b) => ({
        nom: b.nom, prenom: b.prenom, adresse: b.address_line1, code_postal: b.postal_code, ville: b.city,
        ...(sansContact ? {} : { email: b.email, telephone: b.telephone }),
      })),
    });
    return assemblerQuittanceDelivree(d);
  }

  it("deux bailleurs : mêmes noms, mêmes adresses, même ligne de contact et même « Fait à », quel que soit l'ordre lu", async () => {
    const lePdf = await pdf([MARC, CLAIRE]);
    const laPage = page([MARC, CLAIRE]);
    expect(emetteurDe(laPage.html)).toBe(emetteurDe(lePdf.html));
    expect(emetteurDe(laPage.html)).toBe(
      "Moreau Claire · Petit Marc 3 rue du Domicile, 69100 Villeurbanne · 12 quai Perrache, 69002 Lyon claire@exemple.fr · marc@exemple.fr · 0611111111 · 0622222222"
    );
    expect(emetteurDe(laPage.html)).not.toContain("0400000000");
    expect(texte(bailleurDe(laPage.html) ?? "")).toBe(texte(bailleurDe(lePdf.html) ?? ""));
    expect(texte(bailleurDe(laPage.html) ?? "")).toBe("Moreau Claire, Petit Marc");
    expect(faitA(laPage.html)).toBe(faitA(lePdf.html));
    expect(faitA(laPage.html)).toMatch(/Fait à Villeurbanne/);
    expect(laPage.emetteur).toBe("detenteurs");
    expect(manquantsQuittance(laPage)).toEqual([]);
  });

  it("espace sans e-mail, détenteur qui en a un : la page est délivrée, comme le PDF est complet", async () => {
    const lePdf = await pdf([CLAIRE], { email_contact: null as never });
    const laPage = page([CLAIRE], { email_contact: null as never });
    expect(lePdf.manquants).toEqual([]);
    expect(manquantsQuittance(laPage)).toEqual([]);
    expect(emetteurDe(laPage.html)).toBe(emetteurDe(lePdf.html));
  });

  it("détenteur sans e-mail : « Contact de gestion : » et l'e-mail de l'espace, son téléphone à lui, comme le PDF", async () => {
    const sansEmail = { ...CLAIRE, email: null };
    const lePdf = await pdf([sansEmail]);
    const laPage = page([sansEmail]);
    expect(emetteurDe(laPage.html)).toBe(emetteurDe(lePdf.html));
    expect(emetteurDe(laPage.html)).toContain("Contact de gestion : parc@exemple.fr · 0611111111");
  });

  it("détenteur sans e-mail, espace sans contact : « adresse électronique » à renseigner, à la fois sur la page et au PDF", async () => {
    const sansEmail = { ...CLAIRE, email: null };
    const lePdf = await pdf([sansEmail], { email_contact: null as never });
    const laPage = page([sansEmail], { email_contact: null as never });
    expect(lePdf.manquants).toContain("adresse électronique");
    expect(manquantsQuittance(laPage)).toContain("adresse électronique");
  });

  it("témoin : sans les clés de contact (première version de la migration), l'adresse des bailleurs et le contact de l'espace", () => {
    const laPage = page([CLAIRE], {}, true);
    expect(emetteurDe(laPage.html)).toBe("Moreau Claire 3 rue du Domicile, 69100 Villeurbanne parc@exemple.fr · 0400000000");
    expect(laPage.emetteur).toBe("detenteurs");
  });

  it("l'ordre des bailleurs est le même partout : nom, puis prénom, à la française", () => {
    const ordre = ordreBailleursQuittance([{ nom: "Émond", prenom: null }, { nom: "Zola", prenom: "Émile" }, { nom: "Dupont", prenom: "Marc" }, { nom: "Dupont", prenom: "Anne" }]);
    expect(ordre.map((b) => `${b.nom} ${b.prenom ?? ""}`.trim())).toEqual(["Dupont Anne", "Dupont Marc", "Émond", "Zola Émile"]);
  });

  it("l'envoi refusé d'une quittance émise par les détenteurs dit où compléter leur adresse", () => {
    const sansAdresse = page([{ ...CLAIRE, address_line1: null, postal_code: null, city: null }]);
    const manquants = manquantsQuittance(sansAdresse);
    expect(manquants).toEqual(expect.arrayContaining(["domicile ou siège social", "commune"]));
    expect(motifQuittanceIncomplete(manquants, true, sansAdresse.emetteur)).toContain("Complétez la fiche du propriétaire (Personnes) ou le profil de l'organisation, puis renvoyez-la.");
    // Témoin : un en-tête de l'espace garde le message d'avant.
    expect(motifQuittanceIncomplete(["adresse électronique"], true, "espace")).toContain("Complétez le profil de l'organisation ou la fiche indiquée, puis renvoyez-la.");
  });
});

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
  ])("« %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });

  it.each([
    // Un autre niveau, ou un seul niveau du duplex : la mention reste.
    ["RDC et 2e", "Duplex RDC et 1er étage", "RDC et 2e"],
    ["RDC", "Duplex RDC et 1er étage", "RDC"],
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
