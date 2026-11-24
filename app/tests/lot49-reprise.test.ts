/**
 * Phase 3 de la mission palier 1, lot 49 — quatrième tour des documents.
 *
 *  - V01 : U07 (lots 48 et 48 reprise, migration 20261123230000) est RETIRÉ de cette publication. La migration faisait lire au
 *    locataire, même ancien, les coordonnées des détenteurs ACTUELS du lot (après une cession aussi), et rendait inaccessibles
 *    des quittances déjà émises et consultées quand un détenteur n'avait pas d'adresse. Ces deux effets reviennent au dirigeant
 *    et au juriste, non tranchés. La quittance délivrée (page /quittance, « Mes documents », envoi) revient à son comportement
 *    d'avant le lot 48 (355195b7) : le nom des bailleurs avec les coordonnées du PROFIL DE L'ESPACE, la liste « À renseigner »
 *    vers ce profil. La version complète reste dans l'historique de la branche (a3f9440e, cf2142f7).
 *  - V02 : un seul des niveaux qu'un nom de duplex nomme déjà (« 1er » sous « Duplex RDC et 1er étage ») était redit :
 *    « Duplex RDC et 1er étage, 1er étage ».
 * Chaque cas ci-dessous échouait au commit cf2142f7, sauf les témoins signalés ; ceux de la reprise (dernier bloc) échouaient
 * au commit 446c7fe6, sauf les témoins.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";
import { verifierBaseDeTest } from "./garde-base";

const mocks = vi.hoisted(() => ({ charger: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: mocks.charger,
  signatureOrganisation: vi.fn(async () => null),
}));
import { adresseLogement } from "@/lib/documents/modeles/communs";
import { assemblerQuittance } from "@/lib/documents/modeles/quittance";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { mentionEtage } from "@/lib/etage";
import { assemblerQuittanceDelivree, manquantsQuittance, motifQuittanceIncomplete } from "@/lib/quittance-conforme";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

beforeEach(() => {
  vi.clearAllMocks();
});

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[\s  ]+/g, " ").trim();
/** Le bloc de l'émetteur (nom, adresse, contact), sans le cartouche de référence. */
const enTeteDe = (html: string) => texte(html.split('<div class="cartouche-ref">')[0].split('<header class="entete">')[1] ?? "");
const faitA = (html: string) => /Fait à [^,]+?,? le \d{2}\/\d{2}\/\d{4}/.exec(texte(html))?.[0];
const lire = (fichier: string) => readFileSync(fichier, "utf8");

const ESPACE = {
  type: "proprietaire_direct", nom: "Parc de Claire Moreau", siret: null, carte_pro: null,
  adresse: "8 avenue des Tilleuls", code_postal: "69006", ville: "Lyon", telephone: "0400000000", email: "parc@exemple.fr",
};
/**
 * La quittance d'un propriétaire direct telle qu'une base portant ENCORE la migration retirée la rendait : chaque bailleur avec
 * l'adresse, l'adresse électronique et le téléphone de sa fiche. Le code ne lit plus ces clés.
 */
const avecCoordonnees = (adresse: string | null, espace: Partial<typeof ESPACE> = {}) =>
  quittanceDocumentComplete({
    organisation: { ...ESPACE, ...espace },
    bailleurs: [{
      nom: "Moreau", prenom: "Claire",
      adresse, code_postal: adresse ? "69100" : null, ville: adresse ? "Villeurbanne" : null,
      email: "claire@exemple.fr", telephone: "0611111111",
    }] as never,
  });

describe("V01 — U07 retiré : la quittance délivrée revient à l'en-tête du profil de l'espace (comportement de 355195b7)", () => {
  it("le nom des bailleurs avec l'adresse, l'e-mail et le téléphone du profil ; « Fait à » la commune du profil", () => {
    const doc = assemblerQuittanceDelivree(avecCoordonnees("3 rue du Domicile"));
    expect(enTeteDe(doc.html)).toBe("Moreau Claire 8 avenue des Tilleuls, 69006 Lyon parc@exemple.fr · 0400000000");
    // Aucune coordonnée de la fiche du détenteur n'est imprimée, même si une base les rendait encore.
    expect(texte(doc.html)).not.toContain("3 rue du Domicile");
    expect(texte(doc.html)).not.toContain("claire@exemple.fr");
    expect(texte(doc.html)).not.toContain("0611111111");
    expect(faitA(doc.html)).toMatch(/^Fait à Lyon/);
    expect(doc.emetteur).toBe("espace");
    expect(manquantsQuittance(doc)).toEqual([]);
  });

  it("un détenteur sans adresse ne bloque plus la quittance : l'adresse du profil suffit, comme avant le lot 48", () => {
    const doc = assemblerQuittanceDelivree(avecCoordonnees(null));
    expect(manquantsQuittance(doc)).toEqual([]);
    expect(enTeteDe(doc.html)).toContain("8 avenue des Tilleuls, 69006 Lyon");
  });

  it("profil sans adresse : « domicile ou siège social » et « commune » à renseigner, liens vers le profil de l'espace", () => {
    const q = avecCoordonnees("3 rue du Domicile", { adresse: null, code_postal: null, ville: null } as never);
    const doc = assemblerQuittanceDelivree(q);
    expect(doc.emetteur).toBe("espace");
    const manquants = manquantsQuittance(doc);
    expect(manquants).toEqual(expect.arrayContaining(["domicile ou siège social", "commune"]));
    for (const m of ["domicile ou siège social", "commune"]) {
      expect(lienPourManquant(m, q.organization_id, [{ entite: "bail", entiteId: q.bail_id }], "quittance", "/espace", doc.emetteur)?.href).toBe("/espace/org-1/profil");
    }
    // Le refus d'envoi garde son message d'avant le lot 48 (profil de l'organisation, ou la fiche indiquée).
    expect(motifQuittanceIncomplete(manquants, true)).toContain("Complétez le profil de l'organisation ou la fiche indiquée, puis renvoyez-la.");
  });

  it("témoin : en agence, l'agence émet à l'adresse de son profil (inchangé)", () => {
    const doc = assemblerQuittanceDelivree(quittanceDocumentComplete());
    expect(enTeteDe(doc.html)).toContain("Agence Alpha");
    expect(enTeteDe(doc.html)).toContain("3 place de la Mairie, 75004 Paris");
    expect(doc.emetteur).toBe("espace");
  });

  it("le PDF de la quittance garde l'ordre des détentions, comme les autres documents du bail (tri du lot 48 retiré)", async () => {
    const ctx = contexte();
    ctx.organisation = { ...ctx.organisation, type: "proprietaire_direct" };
    ctx.bailleurs = [
      { ...personne({ id: "p2", nom: "Petit", prenom: "Marc", address_line1: "12 quai Perrache", postal_code: "69002", city: "Lyon", email: "marc@exemple.fr" }), quote_part: 50 },
      { ...personne({ id: "p1", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile", postal_code: "69100", city: "Villeurbanne", email: "claire@exemple.fr" }), quote_part: 50 },
    ];
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
    const r = await assemblerQuittance({ from, rpc: vi.fn() } as unknown as SupabaseClient, "org", "q1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(enTeteDe(r.document.html).startsWith("Petit Marc · Moreau Claire 12 quai Perrache, 69002 Lyon · 3 rue du Domicile")).toBe(true);
    expect(faitA(r.document.html)).toMatch(/^Fait à Lyon/);
  });

  it("la migration 20261123230000 et tous ses satellites sont retirés du dépôt", () => {
    const nom = "20261123230000_quittance_adresse_bailleurs";
    expect(existsSync(`supabase/migrations/${nom}.sql`)).toBe(false);
    expect(existsSync(`supabase/retours-arriere/${nom}.retour.sql`)).toBe(false);
    expect(existsSync("tests/quittance-adresse-bailleurs-base.test.ts")).toBe(false);
    expect(existsSync("tests/quittance-adresse-bailleurs.test.ts")).toBe(false);
    for (const fichier of ["supabase/retours-arriere/LISEZ-MOI.md", "e2e/local/ordre-migrations.txt", "tests/relais-migrations-manifeste.test.ts", "vitest.config.ts"]) {
      expect(lire(fichier), fichier).not.toContain("20261123230000");
      expect(lire(fichier), fichier).not.toContain("quittance-adresse-bailleurs");
    }
    // Le code ne lit aucune coordonnée de bailleur dans `quittance_document`.
    expect(lire("src/lib/quittance-conforme.ts")).not.toMatch(/b\.adresse|b\.telephone|b\.email|"detenteurs"/);
  });

  it.skipIf(!url)("en base de test : quittance_document ne rend plus aucune coordonnée des bailleurs (retour joué)", async () => {
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      const def = String((await db.query("select pg_get_functiondef('public.quittance_document(uuid)'::regprocedure) d")).rows[0].d);
      expect(def).not.toContain("'adresse', p.address_line1");
      expect(def).not.toContain("'telephone', p.telephone");
      expect(def).not.toContain("U07");
      // La liste des bailleurs est celle de 20261119200200 : nom, prénom, représentant d'une société.
      expect(def).toContain("representants_actifs_bail(b.id)");
      const lignes = await db.query("select 1 from supabase_migrations.schema_migrations where version = '20261123230000'");
      expect(lignes.rowCount).toBe(0);
    } finally {
      await db.end();
    }
  });
});

describe("V02 — un niveau que le nom d'un duplex nomme déjà n'est plus redit", () => {
  it.each([
    ["1er", "Duplex RDC et 1er étage", null],
    ["1er étage", "Duplex RDC et 1er étage", null],
    ["RDC", "Duplex RDC et 1er étage", null],
    ["1er, porte B", "Duplex RDC et 1er étage", "porte B"],
    ["1er", "Duplex 1er et 2e étages", null],
    ["2e", "Duplex 1er et 2e étage", null],
    ["premier", "Duplex 1er et 2e étages", null],
  ])("« %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });

  it("l'adresse du logement : « Duplex RDC et 1er étage », sans « 1er étage » redit", () => {
    const ctx = contexte();
    const duplex = { ...ctx.lot, nom: "Duplex RDC et 1er étage", etage: "1er" };
    expect(adresseLogement(duplex, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex RDC et 1er étage");
    expect(adresseLogement({ ...duplex, etage: "1er étage, porte B" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex RDC et 1er étage, porte B");
    // Témoin : le chemin archivé (baux d'avant g8) imprime la saisie comme avant, sans lire le nom (empreintes inchangées).
    expect(adresseLogement(duplex, ctx.bien, true)).toBe("12 rue des Lilas, 69003 Lyon, Duplex RDC et 1er étage, étage 1er");
  });

  it.each([
    // Un niveau que le nom ne dit pas, ou deux niveaux dont un seul est nommé : la mention reste (la saisie contradictoire se voit).
    ["2e", "Duplex RDC et 1er étage", "2e étage"],
    ["RDC et 2e", "Duplex RDC et 1er étage", "RDC et 2e"],
    ["3e", "Duplex 1er et 2e étages", "3e étage"],
    ["2e et 3e", "Duplex 1er et 2e étages", "2e et 3e étages"],
    ["RDC et 1er", "Studio 1er étage", "RDC et 1er"],
    ["1er et 2e", "Lot 5 étage 1", "1er et 2e étages"],
    // « 5e et dernier » est UN étage : un nom qui ne dit que le 5e ne le couvre pas ; le nom « 5e et dernier » couvre le 5.
    ["5e et dernier", "T3 — 5e étage", "5e et dernier étage"],
    ["5", "T3 5e et dernier étage", null],
  ])("témoin : « %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });
});

/**
 * Reprise du lot 49 (relecture de V02) : la règle ne valait que pour la forme « 1er et 2e » de la saisie et pour un nom qui
 * écrit « étage(s) » après deux niveaux. Une saisie « 1 et 2 », « étage 1 et 2 », « 1er étage et 2e » ou « 1er et RDC » n'était
 * comparée que par sa tête ; un nom « Duplex 1er et 2e » (sans « étage »), « Duplex 1er étage et 2e » ou « Triplex 1er, 2e et 3e
 * étages » n'était pas lu en entier. L'adresse imprimait « Duplex 1er et 2e étages, étage 1 et 2 » ou « Duplex 1er et 2e,
 * 2e étage ». La mention entière est désormais comparée au nom entier.
 */
describe("V02 (reprise) — toute énumération de niveaux, dans la saisie comme dans le nom du lot", () => {
  it.each([
    // La saisie prolonge sa tête par d'autres niveaux que le nom nomme tous.
    ["1 et 2", "Duplex 1er et 2e étages", null],
    ["étage 1 et 2", "Duplex 1er et 2e étages", null],
    // Attente précédente (témoin « Un niveau prolongé par « et » n'est jamais coupé ») : « 1er étage et 2e », soit l'adresse
    // « Duplex 1er et 2e étages, 1er étage et 2e », qui redisait deux niveaux que le nom nomme. La mention n'est pas coupée :
    // elle est retirée en entier.
    ["1er étage et 2e", "Duplex 1er et 2e étages", null],
    ["1 et 2, porte B", "Duplex 1er et 2e étages", "porte B"],
    ["1er et RDC", "Duplex RDC et 1er étage", null],
    // Le nom d'un duplex sans « étage(s) », ou avec « étage » au milieu, se lit comme « Duplex RDC et 1er ».
    ["2e", "Duplex 1er et 2e", null],
    ["1er et 2e", "Duplex 1er et 2e", null],
    ["2e, porte A", "Duplex 1er et 2e", "porte A"],
    ["2e", "Duplex 1er étage et 2e", null],
    // Trois niveaux et plus.
    ["1er", "Triplex 1er, 2e et 3e étages", null],
    ["1er, 2e et 3e", "Triplex 1er, 2e et 3e étages", null],
  ])("« %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });

  it("l'adresse du logement : les deux niveaux d'une saisie « 1 et 2 » ne sont pas redits après le nom du duplex", () => {
    const ctx = contexte();
    const duplex = { ...ctx.lot, nom: "Duplex 1er et 2e étages", etage: "1 et 2" };
    expect(adresseLogement(duplex, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex 1er et 2e étages");
    expect(adresseLogement({ ...duplex, nom: "Duplex 1er et 2e", etage: "2e" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex 1er et 2e");
    // Témoin : le chemin archivé (baux d'avant g8) imprime la saisie comme avant, sans lire le nom (empreintes inchangées).
    expect(adresseLogement(duplex, ctx.bien, true)).toBe("12 rue des Lilas, 69003 Lyon, Duplex 1er et 2e étages, étage 1 et 2");
  });

  it.each([
    // Déjà justes avant : la lecture des énumérations ne les change pas.
    ["1er", "Triplex RDC, 1er et 2e étages", null],
    ["5e et dernier", "Duplex 4e et 5e et dernier étage", null],
    // Un seul niveau de la mention manque au nom : elle reste entière (la saisie contradictoire se voit, rien n'est coupé).
    ["1 et 2", "Studio 2 étage 1", "étage 1 et 2"],
    ["1er étage et 2e", "Studio 2 étage 1", "1er étage et 2e"],
    ["4e", "Triplex 1er, 2e et 3e étages", "4e étage"],
    ["4e et dernier", "Duplex 4e et 5e et dernier étage", "4e et dernier étage"],
    // Ce qui n'est pas une liste de niveaux close reste entier : une plage, une fraction, un nombre nu suivi d'un mot.
    ["étage 1 à 2", "Duplex 1er et 2e étages", "étage 1 à 2"],
    ["étage 1/2", "Duplex 1er et 2e étages", "étage 1/2"],
    ["étage 1 et 2 pièces", "Duplex 1er et 2e étages", "étage 1 et 2 pièces"],
    // Des nombres nus dans le nom sont des numéros de lot, pas des niveaux.
    ["5", "Lot 5 et 6", "étage 5"],
    ["5e", "Lot 5 et 6", "5e étage"],
  ])("témoin : « %s » après « %s » → %s", (etage, nom, attendu) => {
    expect(mentionEtage(etage, nom)).toBe(attendu);
  });

  // Corrigé au passage, même cause : seule la tête de la mention était comparée, et une énumération séparée par une virgule
  // perdait sa tête quand le nom nommait le premier niveau : « Studio meublé — 1er étage, 2e et 3e », « Duplex 1er et 2e
  // étages, 2e et 3e ».
  it("une énumération séparée par des virgules n'est jamais coupée de sa tête", () => {
    expect(mentionEtage("1er, 2e et 3e", "Studio meublé — 1er étage")).toBe("1er étage, 2e et 3e");
    expect(mentionEtage("1er, 2e et 3e", "Duplex 1er et 2e étages")).toBe("1er étage, 2e et 3e");
  });
});
