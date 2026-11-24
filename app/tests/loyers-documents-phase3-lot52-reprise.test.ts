/**
 * Phase 3 de la mission palier 1, reprise du lot 52 — constats du relecteur sur le lot 52.
 *
 *  - W23 (bloquant) : le décompte de prorata ne tenait sur une page qu'avec la zone de signature vierge (marge d'environ 7 pt) ;
 *    une signature enregistrée, un second locataire ou une adresse sur trois lignes renvoyaient « Fait à » et la signature en
 *    page 2. L'avis d'échéance laissait sa mention, « Fait à » et la signature seuls en page 2. Vérifié par un VRAI rendu PDF
 *    (Chrome local), avec une image de signature 3:1 et carrée : une seule page.
 *  - ibanLisible regroupait par quatre n'importe quelle saisie (« FR76… BIC AGRIFRPP » imprimait un IBAN faux).
 *  - Révision du loyer : la date du courrier comparée à la date d'effet au jour UTC, pas au jour de Paris qu'il imprime.
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import { existsSync } from "node:fs";
import zlib from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, ibanLisible, signatureOrganisation, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerProrata } from "@/lib/documents/modeles/prorata";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { construireRevisionIrl, type DonneesRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";

type Ligne = Record<string, unknown>;
function base(tables: Record<string, Ligne[]>) {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = () => q;
    return q;
  };
  return { from: requete, rpc: (nom: string) => requete(nom) } as unknown as SupabaseClient;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>|<\/(td|th|div|p|h1|h2)>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

/** Une image PNG opaque de `largeur` × `hauteur` pixels, en data-URI : la taille d'une signature enregistrée. */
function signaturePng(largeur: number, hauteur: number): string {
  const morceau = (type: string, donnees: Buffer) => {
    const longueur = Buffer.alloc(4); longueur.writeUInt32BE(donnees.length);
    const corps = Buffer.concat([Buffer.from(type, "ascii"), donnees]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(corps));
    return Buffer.concat([longueur, corps, crc]);
  };
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0); entete.writeUInt32BE(hauteur, 4); entete[8] = 8; entete[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(largeur * 3, 0x30)]);
  const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: hauteur }, () => ligne)));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", entete), morceau("IDAT", pixels), morceau("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// Rendu PDF réel : seulement si un Chrome local est disponible (le banc fournit GERIMMO_CHROME).
const CHROME = [process.env.GERIMMO_CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].find((c): c is string => Boolean(c && existsSync(c)));
async function pages(doc: DocumentAssemble): Promise<number> {
  const { rendrePdf } = await import("@/lib/documents/rendu");
  const octets = Buffer.from(await rendrePdf(doc)).toString("latin1");
  return (octets.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});
afterEach(() => vi.useRealTimers());

const SIGNATURES = [["3:1 (300 × 100)", signaturePng(300, 100)], ["carrée (200 × 200)", signaturePng(200, 200)]] as const;

describe.skipIf(!CHROME)("W23 (rendu réel) — la clôture reste sur la page du calcul, avec une signature enregistrée", () => {
  it.each(SIGNATURES)("décompte de prorata, deux locataires, adresse sur trois lignes, signature %s : une page", { timeout: 60_000 }, async (_nom, image) => {
    ctx.bail.date_debut = "2025-10-15";
    ctx.locataires = [
      personne({ id: "p1", nom: "Fictive-Lambert", prenom: "Marie-Charlotte" }),
      personne({ id: "p2", nom: "Fictif-Delacroix", prenom: "Jean-Baptiste" }),
    ];
    ctx.lot.nom = "Appartement traversant du bâtiment B, escalier 2, résidence des Essais fictifs";
    vi.mocked(signatureOrganisation).mockResolvedValueOnce(image);
    const appel = { id: "a1", bail_id: "b1", periode: "2025-10-01", loyer_hc: 383.87, charges: 32.9, montant_du: 416.77, prorata: true, base_loyer_hc: 700, base_charges: 60 };
    const r = await assemblerProrata(base({ appels_loyer: [appel] }), "org", "a1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(r.document.html).toContain('class="sig-image"');
    expect(await pages(r.document)).toBe(1);
  });

  it.each(SIGNATURES)("avis d'échéance en rappel d'un terme réglé en partie, deux locataires, signature %s : une page", { timeout: 60_000 }, async (_nom, image) => {
    const doc = construireAvisEcheance({
      reference: "AVIS-1", periode: "2026-09-01", dateEcheance: "2026-09-05", loyerHc: 700, charges: 60, montantDu: 760, prorata: false,
      dejaRegle: 400, suivantsEchus: 1530.5, lieuPaiement: "Virement bancaire", iban: "FR7630006000011234567890189",
      bailleurNom: "Fictive Jeanne", locatairesNoms: "Fictive-Lambert Marie-Charlotte, Fictif-Delacroix Jean-Baptiste",
      logementAdresse: "8 avenue des Essais, 69003 Lyon, Appartement traversant du bâtiment B, escalier 2, résidence des Essais fictifs, 2e étage, porte gauche",
      referenceBail: "BAIL-BACFFE39", dateBail: "2025-10-15",
      exp: { nom: "Fictive Jeanne", adresse: "12 rue des Essais, 69003 Lyon", email: "jeanne@exemple.fr", telephone: "06 00 00 00 00", ville: "Lyon" },
      typeOrganisation: "proprietaire_direct", signatureImg: image, jour: "2026-11-24", f: new Fusion(),
    });
    expect(texteDe(doc.html)).toContain("Déjà reçu sur ce terme");
    expect(await pages(doc)).toBe(1);
  });
});

describe("W23 — la mise en page resserrée ne touche ni les règles de coupure communes ni l'image de signature", () => {
  it("prorata : le resserrement est posé dans le corps, la feuille commune garde .fait-a et p{break-inside:auto}", async () => {
    ctx.bail.date_debut = "2025-10-15";
    const appel = { id: "a1", bail_id: "b1", periode: "2025-10-01", loyer_hc: 383.87, charges: 32.9, montant_du: 416.77, prorata: true, base_loyer_hc: 700, base_charges: 60 };
    const r = await assemblerProrata(base({ appels_loyer: [appel] }), "org", "a1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(r.document.html).toContain("<body><style>.bloc-titre{padding:7pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:10pt 0 6pt}");
    expect(r.document.html).toContain(".fait-a { break-before:avoid-page;");
    expect(r.document.html).toContain("p { break-inside:auto; page-break-inside:auto; }");
    expect(r.document.html).not.toMatch(/sig-image\s*\{[^}]*\}[\s\S]*sig-image\s*\{/);
  });
});

describe("ibanLisible — seul un IBAN est regroupé par quatre", () => {
  it("un IBAN, saisi avec ou sans espaces, se regroupe", () => {
    expect(ibanLisible("fr76 3000 6000 0112 3456 7890 189")).toBe("FR76 3000 6000 0112 3456 7890 189".replace(/ /g, "\u00a0"));
  });
  it("une autre saisie s'imprime telle quelle", () => {
    expect(ibanLisible("FR76 3000 6000 0112 3456 7890 189 BIC AGRIFRPP")).toBe("FR76 3000 6000 0112 3456 7890 189 BIC AGRIFRPP");
    expect(ibanLisible("Compte joint, voir RIB")).toBe("Compte joint, voir RIB");
    expect(ibanLisible(" ")).toBeNull();
  });
  it("l'avis d'échéance imprime la saisie telle quelle (échappée), sans la recouper", () => {
    const doc = construireAvisEcheance({
      reference: "AVIS-1", periode: "2026-12-01", dateEcheance: "2026-12-05", loyerHc: 650, charges: 90, montantDu: 740, prorata: false,
      lieuPaiement: "Virement bancaire", iban: "FR7630006000011234567890189 BIC AGRIFRPP", bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie",
      logementAdresse: "12 rue des Lilas, 69003 Lyon", referenceBail: "BAIL-1", dateBail: "2026-09-01",
      exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "claire@exemple.fr", ville: "Lyon" },
      typeOrganisation: "proprietaire_direct", jour: "2026-11-24", f: new Fusion(),
    });
    expect(doc.html).toContain("Coordonnées bancaires : <span class=\"v\">FR7630006000011234567890189 BIC AGRIFRPP</span>.");
  });
});

describe("Révision du loyer — la date du courrier est le jour de Paris", () => {
  const donnees = (sur: Partial<DonneesRevisionIrl> = {}): DonneesRevisionIrl => ({
    reference: "IRL-1", dateEffet: "2026-11-24", dateEcheance: "2026-11-24", dateDemande: "2026-11-20", trimestreNouveau: "T2 2026",
    ancienLoyer: 700, nouveauLoyer: 710.5, irlReference: 100, irlNouveau: 101.5, trimestre: "T2 2025", charges: 60, chargesMode: "forfait",
    bailleurNom: "Fictive Jeanne", locatairesNoms: "Fictif Hugo", logementAdresse: "3 place des Essais, 69007 Lyon", referenceBail: "BAIL-1",
    exp: { nom: "Fictive Jeanne", adresse: "12 rue des Essais, 69003 Lyon", email: null, telephone: null, ville: "Lyon", emetteur: "detenteurs" },
    f: new Fusion(), ...sur,
  });
  it("à 0 h 30 à Paris (23 h 30 UTC la veille), le lendemain de la date d'effet : établi le 25/11, après cette date d'effet", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T23:30:00Z"));
    const texte = texteDe(construireRevisionIrl(donnees()).html);
    expect(texte).toContain("Établi le 25/11/2026");
    expect(texte).toContain("Le présent courrier est établi le 25/11/2026, après cette date d'effet.");
    expect(texte).toContain("Fait à Lyon, le 25/11/2026.");
  });
  it("le jour même de la date d'effet à Paris : rien de plus", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
    expect(texteDe(construireRevisionIrl(donnees()).html)).not.toContain("après cette date d'effet");
  });
});
