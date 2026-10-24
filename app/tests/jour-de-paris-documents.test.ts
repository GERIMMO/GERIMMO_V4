/**
 * Lot « fuseau-suite », décision du dirigeant du 15/10/2026, point 5 : la date « Fait le » (et « Établi le ») des documents de
 * contrat est le jour de PARIS, partout.
 *
 * LE DÉFAUT. Les modèles passent l'instant de production (`new Date().toISOString()`) ou un horodatage de la base (signature
 * d'un état des lieux) à `formaterDateFr`, qui l'écrivait dans le fuseau du SERVEUR (UTC chez Vercel). Un document produit à
 * 0 h 30 à Paris portait la date de la veille ; le 1er janvier, celle de l'année précédente. Une date seule (« AAAA-MM-JJ »)
 * s'écrivait déjà telle quelle et ne change pas. Le congé du bailleur calculait en outre le terme du bail à la date UTC
 * (`new Date().toISOString().slice(0, 10)`) quand aucune date de présentation n'était donnée.
 *
 * Le temps est simulé par l'horloge de vitest (jamais la machine) : on pose un INSTANT UTC et on vérifie le jour de Paris, en
 * heure d'été (UTC+2) et en heure d'hiver (UTC+1), juste après et juste avant minuit à Paris.
 */
import { readFileSync, readdirSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { Fusion, enTete, faitA, formaterDateFr } from "@/lib/documents/gabarit";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { construireRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { construireProrata } from "@/lib/documents/modeles/prorata";
import { construireRappelAssurance, assemblerRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { construireEdl } from "@/lib/documents/modeles/edl";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { assemblerCongeBailleur } from "@/lib/documents/modeles/conge-bailleur";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));

const exp = { nom: "Agence Alpha", adresse: "5 place du Marché, 69001 Lyon", email: "a@b.fr", telephone: "04", ville: "Lyon" };

/** [instant UTC simulé, jour de Paris attendu (jj/mm/aaaa), le même en AAAA-MM-JJ, ce qui se passe] */
const INSTANTS: [string, string, string, string][] = [
  ["2026-07-31T22:30:00.000Z", "01/08/2026", "2026-08-01", "heure d'été : 22 h 30 UTC = 00 h 30 à Paris, le lendemain (le serveur UTC écrivait le 31/07)"],
  ["2026-07-31T21:30:00.000Z", "31/07/2026", "2026-07-31", "heure d'été : 21 h 30 UTC = 23 h 30 à Paris, encore le 31"],
  ["2026-12-31T23:30:00.000Z", "01/01/2027", "2027-01-01", "heure d'hiver : 23 h 30 UTC = 00 h 30 à Paris le 1er janvier (le serveur UTC écrivait 2026)"],
  ["2026-12-31T22:30:00.000Z", "31/12/2026", "2026-12-31", "heure d'hiver : 22 h 30 UTC = 23 h 30 à Paris, encore le 31"],
];

/** Les dates de « Établi le » (en-tête) et de « Fait à …, le » (pied), dans l'ordre du document. */
function datesDuDocument(html: string): string[] {
  return [...html.matchAll(/(?:Établi le|Fait à <span class="v">[^<]*<\/span>, le) <span class="v">(\d{2}\/\d{2}\/\d{4})<\/span>/g)].map((m) => m[1]);
}

describe("formaterDateFr : un instant s'écrit au jour de Paris, un jour s'écrit tel quel", () => {
  it.each(INSTANTS)("instant %s → %s (%s)", (instant, attendu) => {
    expect(formaterDateFr(instant)).toBe(attendu);
    // Le même instant écrit comme la base le rend (décalage explicite).
    expect(formaterDateFr(instant.replace(".000Z", "+00:00"))).toBe(attendu);
  });

  it("un horodatage déjà exprimé à Paris garde son jour", () => {
    expect(formaterDateFr("2026-08-01T00:30:00+02:00")).toBe("01/08/2026");
    expect(formaterDateFr("2027-01-01T00:30:00+01:00")).toBe("01/01/2027");
  });

  it.each(["2026-08-01", "2026-12-31", "2027-01-01", "2028-02-29"])("le jour %s s'écrit tel quel", (jour) => {
    expect(formaterDateFr(jour)).toBe(jour.split("-").reverse().join("/"));
  });

  it("enTete et faitA écrivent l'instant de production au jour de Paris", () => {
    const f = new Fusion();
    const instant = "2026-12-31T23:30:00.000Z";
    const html = `${enTete(f, exp, { libelle: "Contrat", reference: "BAIL-1", etabliLe: instant })}${faitA(f, "Lyon", instant)}`;
    expect(datesDuDocument(html)).toEqual(["01/01/2027", "01/01/2027"]);
  });
});

describe.each(INSTANTS)("documents de contrat produits à %s : « Établi le » et « Fait le » valent %s", (instant, attendu, jourIso) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bail nu et bail meublé (« Établi le » ; le « Fait le » est laissé à la signature)", () => {
    expect(datesDuDocument(construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() }).html)).toEqual([attendu]);
    expect(datesDuDocument(construireBailMeuble(contexte(), { dpeClasse: "D", inventaire: [], f: new Fusion() }).html)).toEqual([attendu]);
  });

  it("révision du loyer (IRL)", () => {
    const doc = construireRevisionIrl({
      reference: "IRL-1",
      dateEffet: "2026-09-15",
      dateEcheance: "2026-03-01",
      dateDemande: "2026-09-15",
      trimestreNouveau: "T2 2026",
      ancienLoyer: 700,
      nouveauLoyer: 725,
      irlReference: 140,
      irlNouveau: 145,
      trimestre: "2e trimestre 2025",
      charges: 50,
      bailleurNom: "Moreau Claire",
      locatairesNoms: "Leblanc Julie",
      logementAdresse: "1 rue A",
      referenceBail: "BAIL-1",
      exp,
      f: new Fusion(),
    });
    expect(datesDuDocument(doc.html)).toEqual([attendu, attendu]);
  });

  it("décompte de prorata", () => {
    const doc = construireProrata({
      reference: "PRO-1",
      motif: "entrée",
      periode: "2026-09-01",
      dateDebutOccupation: "2026-09-16",
      dateFinOccupation: null,
      loyerHcPlein: 700,
      chargesPleines: 50,
      loyerHcProrate: 350,
      chargesProratees: 25,
      montantDu: 375,
      bailleurNom: "Moreau Claire",
      locatairesNoms: "Leblanc Julie",
      logementAdresse: "1 rue A",
      referenceBail: "BAIL-1",
      exp,
      f: new Fusion(),
    });
    expect(datesDuDocument(doc.html)).toEqual([attendu, attendu]);
  });

  it("rappel d'attestation d'assurance", () => {
    const doc = construireRappelAssurance({
      reference: "ASSU-1",
      echeance: "2026-09-30",
      expiree: true,
      locataireNom: "Leblanc Julie",
      logementAdresse: "1 rue A",
      referenceBail: "BAIL-1",
      canalReponse: null,
      exp,
      f: new Fusion(),
    });
    expect(datesDuDocument(doc.html)).toEqual([attendu, attendu]);
  });

  it("état des lieux non signé (date du jour) ; signé à 00 h 30 à Paris, il porte le jour de la signature à Paris", () => {
    const donnees = (signeLe: string | null) => ({
      type: "entree" as const,
      reference: "EDL-1",
      dateEdl: null,
      signeLe,
      personnesPresentes: null,
      detecteurFumeePresent: true,
      detecteurFumeeEtat: "bon",
      attestationAssuranceFournie: true,
      adresseRestitutionDepot: null,
      observations: null,
      lignes: [],
      compteurs: [],
      cles: [],
      comparatif: [],
      retenues: [],
      bailleurNom: "Moreau Claire",
      locatairesNoms: "Leblanc Julie",
      logementAdresse: "1 rue A",
      referenceBail: "BAIL-1",
      exp,
      f: new Fusion(),
    });
    expect(datesDuDocument(construireEdl(donnees(null)).html)).toEqual([attendu, attendu]);
    // Horodatage de signature tel que la base le rend : 22 h 30 UTC le 31/07 = 00 h 30 à Paris le 1er août, quelle que soit l'horloge.
    const signe = datesDuDocument(construireEdl(donnees("2026-07-31T22:30:00+00:00")).html);
    expect(signe[signe.length - 1]).toBe("01/08/2026");
  });

  it("acte de cautionnement", async () => {
    const ctx = contexte();
    ctx.garants = [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }];
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx);
    const doc = await assemblerCautionnement({} as SupabaseClient, "org", "b1", { garant: "g1", montant_max: "15000", sans_garantie_cumulee: "oui" });
    // Plan du 23/10, R28 : « Fait le » porte la date effective de la signature, à compléter ; seule reste « Établi le ».
    expect("document" in doc && datesDuDocument(doc.document.html)).toEqual([attendu]);
  });

  it("congé du bailleur : sans date de présentation, le terme est calculé au jour de Paris ; « Établi le » et « Fait le » au jour de Paris", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const rpc = vi.fn(async () => ({ data: "2029-08-31", error: null }));
    const doc = await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", { motif: "vente", prix_vente: "245000" });
    expect(rpc).toHaveBeenCalledWith("terme_bail", { p_bail: "b1", p_date: jourIso });
    expect("document" in doc && datesDuDocument(doc.document.html)).toEqual([attendu, attendu]);
  });

  it("le rappel d’assurance compare son échéance et nomme son fichier au jour de Paris", async () => {
    const donnees: Record<string, unknown> = {
      documents: { id: "d1", type: "attestation_assurance", expire_le: "2026-07-31" },
      organizations: { name: "Organisation fictive", type: "proprietaire_direct", city: "Lyon" },
      document_liens: { entite_id: "p1" },
      persons: personne({ id: "p1" }),
      baux: null,
    };
    const from = (table: string) => {
      const q = { select: () => q, eq: () => q, in: () => q, limit: () => q,
        maybeSingle: async () => ({ data: donnees[table] }) };
      return q;
    };
    const resultat = await assemblerRappelAssurance({ from } as unknown as SupabaseClient, "org", "d1");
    expect("nomFichier" in resultat && resultat.nomFichier).toBe(`rappel-assurance-${jourIso}`);
    if (!("document" in resultat)) throw new Error("Rappel non construit");
    expect(resultat.document.html.includes("arrivée à échéance")).toBe(jourIso > "2026-07-31");
  });
});

describe("garde : la date « Fait le » des modèles passe par faitA (formaterDateFr), jamais par une date UTC calculée à la main", () => {
  const dossier = "src/lib/documents/modeles";
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith(".ts"));

  it.each(fichiers)("%s", (fichier) => {
    const source = readFileSync(`${dossier}/${fichier}`, "utf8");
    // « Fait à … le » écrit à la main : seul le bail (date laissée à compléter lors de la signature) le fait.
    for (const ligne of source.split("\n").filter((l) => /Fait à \$\{/.test(l)))
      expect(ligne, fichier).toContain("date effective à compléter lors de la signature");
  });

  it("le congé du bailleur ne calcule plus « aujourd'hui » en UTC", () => {
    const source = readFileSync(`${dossier}/conge-bailleur.ts`, "utf8");
    expect(source).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
    expect(source).toContain("aujourdhuiParis()");
  });
});
