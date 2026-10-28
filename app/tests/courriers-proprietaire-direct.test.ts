/**
 * Audit final du 27/10 (LOY-06, LOY-17) — les courriers d'un propriétaire direct sont écrits et signés par le bailleur.
 *
 * LOY-06 : la quittance et l'avis d'échéance PDF portaient en en-tête, pied et signature le nom de l'organisation (« Parc de
 * Claire Moreau ») alors que le cartouche et le « Je soussigné(e) » disaient « Moreau Claire » : le même document signait deux
 * noms. Et le bloc de signature, insécable mais seul, basculait en page 2. LOY-17 : relances, information de la caution et avis
 * d'échéance parlaient de « votre gestionnaire » à un locataire qui n'en a pas. Sans base ; le rendu PDF ne tourne qu'avec un
 * Chrome local (GERIMMO_CHROME), comme tests/documents-generes.test.ts.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Fusion } from "@/lib/documents/gabarit";
import { expediteur, expediteurCourrier } from "@/lib/documents/modeles/communs";
import { construireQuittance, type DonneesQuittance } from "@/lib/documents/modeles/quittance";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { corpsInformationCaution, corpsRelanceLoyer } from "@/lib/relance-loyer-email";
import { contexte, personne } from "./fixtures/contexte-document";

const deuxBailleurs = () => contexte({
  bailleurs: [
    { ...personne({ id: "b1", nom: "Moreau", prenom: "Claire" }), quote_part: 50 },
    { ...personne({ id: "b2", nom: "Moreau", prenom: "Jean" }), quote_part: 50 },
  ],
});

describe("expediteurCourrier", () => {
  it("chez un propriétaire direct, le courrier est au nom des détenteurs ; l'adresse et le « Fait à » restent ceux du profil", () => {
    const ctx = deuxBailleurs();
    const exp = expediteurCourrier(ctx);
    expect(exp.nom).toBe("Moreau Claire, Moreau Jean");
    expect(exp).toMatchObject({ adresse: expediteur(ctx).adresse, ville: "Lyon", email: "claire@exemple.fr" });
  });
  it("une agence signe de son nom ; un propriétaire sans détenteur renseigné garde le nom de son espace", () => {
    const base = contexte();
    expect(expediteurCourrier(contexte({ organisation: { ...base.organisation, type: "agence", name: "Agence Alpha" } })).nom).toBe("Agence Alpha");
    expect(expediteurCourrier(contexte({ bailleurs: [] })).nom).toBe("Parc de Claire Moreau");
  });
});

function quittance(exp: ReturnType<typeof expediteur>): DonneesQuittance {
  return {
    estQuittance: true,
    reference: "QUIT-1",
    dateEmission: "2026-02-03",
    periode: "2026-01-01",
    loyerHc: 650,
    charges: 90,
    montant: 740,
    montantDu: 740,
    chargesMode: "provision",
    encaissements: [{ date: "2026-01-05", mode: "virement", montant: 740 }],
    bailleurNom: "Moreau Claire",
    locatairesNoms: "Leblanc Julie",
    logementAdresse: "12 rue Voltaire, 75011 Paris, étage 3",
    referenceBail: "BAIL-1",
    dateBail: "2026-01-16",
    exp,
    f: new Fusion(),
  };
}

describe("quittance et avis PDF d'un propriétaire direct (LOY-06)", () => {
  const exp = expediteurCourrier(contexte());

  it("en-tête et signature portent le nom du bailleur, jamais celui du parc", () => {
    const doc = construireQuittance(quittance(exp));
    expect(doc.html).not.toContain("Parc de Claire Moreau");
    expect(doc.html).toContain('<div class="sig-nom">Moreau Claire</div>');
    // L'en-tête (tout ce qui précède le titre du document) est au nom du bailleur.
    expect(doc.html.slice(doc.html.indexOf("<body"), doc.html.indexOf("<h1>"))).toContain("Moreau Claire");
  });

  it("« Fait à » et la signature forment une rangée insécable", () => {
    const html = construireQuittance(quittance(exp)).html;
    expect(html).toMatch(/<div class="deux-col fait-signe"[^>]*><p>Fait à [\s\S]*?<\/p><div class="sig-emetteur"/);
    const avis = construireAvisEcheance({
      reference: "AVIS-1", periode: "2026-10-01", dateEcheance: "2026-10-05", loyerHc: 650, charges: 50, montantDu: 700, prorata: false,
      chargesMode: "provision", bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie", logementAdresse: "1 rue", referenceBail: "BAIL-1",
      dateBail: "2026-01-16", exp, jour: "2026-10-01", f: new Fusion(),
    }).html;
    expect(avis).toMatch(/<div class="deux-col fait-signe"[^>]*><p>Fait à [\s\S]*?<\/p><div class="sig-emetteur"/);
    expect(avis).toContain('<div class="sig-nom">Moreau Claire</div>');
  });
});

describe("avis d'échéance et courriers de relance : « bailleur » chez un propriétaire direct (LOY-17)", () => {
  const avis = (proprietaireDirect?: boolean) => construireAvisEcheance({
    reference: "AVIS-1", periode: "2026-10-01", dateEcheance: "2026-10-05", loyerHc: 650, charges: 50, montantDu: 700, prorata: false,
    bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie", logementAdresse: "1 rue", referenceBail: "BAIL-1", dateBail: "2026-01-16",
    exp: { nom: "Moreau Claire", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: null, telephone: null, ville: "Lyon" },
    jour: "2026-10-01", proprietaireDirect, f: new Fusion(),
  }).html;
  const relance = {
    prenom: "Paul", emetteur: "Moreau Claire", lot: "Appt 1", periode: "2026-09-01", dateEcheance: "2026-09-01", reste: 500, totalDu: 1400,
    lien: "https://gerimmo.fr/locataire/x/loyers",
  };

  it("l'avis PDF renvoie au bailleur ; en agence, au gestionnaire", () => {
    expect(avis(true)).toContain("rapprochez-vous sans attendre de votre bailleur");
    expect(avis(true)).not.toMatch(/gestionnaire/i);
    expect(avis()).toContain("rapprochez-vous sans attendre de votre gestionnaire");
  });

  it("les deux relances et l'information de la caution ne disent jamais « gestionnaire » à un locataire de propriétaire direct", () => {
    for (const niveau of ["relance_1", "relance_2"] as const) {
      const html = corpsRelanceLoyer({ ...relance, niveau, proprietaireDirect: true });
      expect(html, niveau).not.toMatch(/gestionnaire/i);
      expect(html).toContain("votre bailleur");
      expect(corpsRelanceLoyer({ ...relance, niveau })).toContain("votre gestionnaire");
    }
    const caution = corpsInformationCaution({ emetteur: "Moreau Claire", locataire: "Paul Durand", lot: "Appt 1", periode: "2026-10-01", dateEcheance: "2026-10-01", totalDu: 1400, proprietaireDirect: true });
    expect(caution).toContain("écrivez au bailleur.");
    expect(caution).not.toMatch(/gestionnaire/i);
  });
});

const CHROME = [process.env.GERIMMO_CHROME, "/usr/bin/google-chrome"].find((c): c is string => Boolean(c && existsSync(c)));

describe.skipIf(!CHROME)("rendu PDF (Chrome local) : une quittance standard tient sur une page", () => {
  it("quittance et avis d'échéance : une page A4 chacun", { timeout: 90_000 }, async () => {
    process.env.GERIMMO_CHROME = CHROME;
    const { rendrePdf } = await import("@/lib/documents/rendu");
    const exp = expediteurCourrier(contexte());
    const pages = (octets: Uint8Array) => (new TextDecoder("latin1").decode(octets).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages(await rendrePdf(construireQuittance(quittance(exp))))).toBe(1);
    const avis = construireAvisEcheance({
      reference: "AVIS-1", periode: "2026-10-01", dateEcheance: "2026-10-05", loyerHc: 800, charges: 100, montantDu: 900, prorata: false,
      chargesMode: "provision", arriere: 500, lieuPaiement: "Virement bancaire", iban: "FR76 3000 4000 0500 0012 3456 789",
      bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie", logementAdresse: "12 rue Voltaire, 75011 Paris, étage 3",
      referenceBail: "BAIL-1", dateBail: "2026-01-16", exp, jour: "2026-10-01", proprietaireDirect: true, f: new Fusion(),
    });
    expect(pages(await rendrePdf(avis))).toBe(1);
  });
});
