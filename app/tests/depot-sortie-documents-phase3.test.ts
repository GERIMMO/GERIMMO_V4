/**
 * Phase 3 de la mission palier 1, lot 41 — dépôt de garantie, états des lieux, clés.
 *
 * Défauts relevés sur les PDF des dossiers fictifs (famille « dépôt et sortie ») :
 *  - C35 : le décompte des retenues disait les justificatifs « joints au décompte de restitution », qui les dit seulement tenus
 *    à la disposition du locataire ;
 *  - C37 : un âge ou une durée de vie laissés vides (l'écran de restitution le permet : coût retenu en intégralité) rendaient le
 *    décompte des retenues « incomplet » ;
 *  - C42 : le bordereau de remise des clés était daté du jour de génération, pas du jour de la remise ;
 *  - S20 : une clé sans référence (facultative à la saisie) rendait le bordereau impossible ;
 *  - S21 : un état des lieux enregistré ou signé dans Gerimmo après coup portait « Fait à …, le » du jour d'enregistrement.
 * Chaque cas échouait avant le correctif.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/** Une base simulée : chaque table rend toutes ses lignes (les filtres sont ignorés), `maybeSingle` la première. */
function base(tables: Record<string, Ligne[]>): SupabaseClient {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = () => q;
    return q;
  };
  return { from: requete, rpc: requete } as unknown as SupabaseClient;
}
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1");
/** Les lignes d'un tableau (en-tête compris), cellules séparées par « | », espaces insécables ramenées à des espaces. */
const lignesDe = (html: string) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/[\u00a0\u202f]/g, " ").trim()).join("|"));

let ctx: ContexteBail;
const organisation = { id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: null, email_contact: null };
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "termine";
  ctx.bailleurs = [{ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile" }), quote_part: 100 }];
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  // Le jour de génération est postérieur à tout : une date de génération imprimée à la place de la date de l'acte se verrait.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("C35, C37 — décompte des retenues", () => {
  const tables = (retenues: Ligne[]) => ({
    organizations: [organisation],
    restitutions: [{ id: "r1", statut: "finalise" }],
    retenues,
  });
  const avecVetuste = { libelle: "Plan de travail", cout: 260, duree_vie_ans: 10, age_ans: 2.5, montant_retenu: 195, justificatif_document: "d2" };
  const sansVetuste = { libelle: "Remise en peinture du séjour", cout: 520, duree_vie_ans: null, age_ans: null, montant_retenu: 520, justificatif_document: "d1" };

  it("C37 : âge et durée de vie vides s'impriment « — » (coût intégral) sans rendre le décompte incomplet", async () => {
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([sansVetuste, avecVetuste])), "org", "b1")).document;
    expect(doc.manquants).toEqual([]);
    const lignes = lignesDe(doc.html);
    expect(lignes).toContain("Remise en peinture du séjour|520,00 €|—|—|520,00 €");
    // Une valeur saisie s'imprime au format français.
    expect(lignes).toContain("Plan de travail|260,00 €|2,5|10|195,00 €");
    expect(texteDe(doc.html)).toContain("« — » : âge ou durée de vie non renseigné ; aucune décote de vétusté n’est appliquée, le coût est retenu en intégralité.");
  });

  it("C37 : la mention du « — » n'apparaît que s'il y en a un", async () => {
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document;
    expect(texteDe(doc.html)).not.toContain("« — »");
  });

  it("C35 : les justificatifs sont tenus à la disposition du locataire, comme le dit le décompte de restitution — rien n'est « joint »", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document.html);
    expect(texte).toContain("Les justificatifs déposés (devis, facture, constat comparé des états des lieux) sont tenus à la disposition du locataire sur demande.");
    expect(texte).not.toMatch(/joint/);
  });

  it("une retenue sans justificatif déposé reste signalée, avec le mot de l'écran (« déposer »)", async () => {
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([{ ...avecVetuste, justificatif_document: null }])), "org", "b1")).document;
    expect(doc.manquants).toEqual(["justificatifs de retenues à déposer"]);
  });
});

describe("C42, S20 — bordereau de remise des clés", () => {
  const tables = (cles: Ligne[], edl: Ligne = {}) => ({
    organizations: [organisation],
    etats_des_lieux: [{ id: "edl1", bail_id: "b1", type: "entree", etat: "signe", date_edl: "2023-09-01", ...edl }],
    edl_cles: cles,
  });
  const cles = [
    { libelle: "Porte d'entrée", nombre: 3, reference: "Clé sécurisée n° 4521-A" },
    { libelle: "Boîte aux lettres", nombre: 1, reference: null },
  ];

  it("C42 : daté du jour de la remise (l'état des lieux), en en-tête comme au « Fait à », jamais du jour de génération", async () => {
    const html = succes(await assemblerComplementGestion("restitution_cles", base(tables(cles)), "org", "edl1")).document.html;
    const texte = texteDe(html);
    expect(texte).toContain("Date du constat : 01/09/2023.");
    expect(texte).toMatch(/Fait à Lyon, le 01\/09\/2023\./);
    expect(texte).toContain("Établi le 01/09/2023");
    expect(texte).not.toContain("23/11/2026");
  });

  it("C42 : à la sortie, daté de la restitution", async () => {
    const html = succes(await assemblerComplementGestion("restitution_cles", base(tables(cles, { type: "sortie", date_edl: "2026-10-07" })), "org", "edl1")).document.html;
    expect(texteDe(html)).toMatch(/Fait à Lyon, le 07\/10\/2026\./);
  });

  it("S20 : une clé sans référence s'imprime « — » et ne bloque pas le bordereau", async () => {
    const doc = succes(await assemblerComplementGestion("restitution_cles", base(tables(cles)), "org", "edl1")).document;
    expect(doc.manquants).toEqual([]);
    expect(lignesDe(doc.html)).toContain("Boîte aux lettres|1|—");
  });

  it("un nombre de clés non compté reste exigé (comme dans l'état des lieux)", async () => {
    const doc = succes(await assemblerComplementGestion("restitution_cles", base(tables([{ libelle: "Cave", nombre: null, reference: "Cave n° 4" }])), "org", "edl1")).document;
    expect(doc.manquants).toEqual(["Nombre"]);
  });
});

describe("S21 — « Fait à …, le » d'un état des lieux : la date du constat", () => {
  const donnees = (sur: Partial<DonneesEdl>): DonneesEdl => ({
    type: "entree", reference: "EDL-1", dateEdl: "2023-09-01", signeLe: null, personnesPresentes: "Les parties",
    detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true, adresseRestitutionDepot: null,
    observations: "Néant", lignes: [], compteurs: [], cles: [], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: null, telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(), ...sur,
  });

  it("enregistré et signé dans Gerimmo le 23/11/2026, l'état des lieux du 01/09/2023 reste daté du 01/09/2023", () => {
    const texte = texteDe(construireEdl(donnees({ signeLe: "2026-11-23T09:30:00+00:00" })).html);
    expect(texte).toContain("Fait à Lyon, le 01/09/2023, en autant d'exemplaires que de parties.");
    expect(texte).not.toContain("23/11/2026");
  });

  it("de même pour la sortie", () => {
    const texte = texteDe(construireEdl(donnees({ type: "sortie", dateEdl: "2026-10-07", dateEdlEntree: "2023-09-01", signeLe: "2026-11-23T09:30:00+00:00", adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon" })).html);
    expect(texte).toContain("Fait à Lyon, le 07/10/2026, en autant d'exemplaires que de parties.");
  });

  it("sans date de constat, la date de signature sert encore", () => {
    const texte = texteDe(construireEdl(donnees({ dateEdl: null, signeLe: "2026-10-08T09:30:00+00:00" })).html);
    expect(texte).toContain("Fait à Lyon, le 08/10/2026");
  });
});
