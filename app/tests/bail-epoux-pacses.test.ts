/**
 * Case « mariés ou pacsés » au bail (décision du dirigeant du 24/11/2026) — ce que le bail imprime, ce que les écrans et les
 * actions disent. La base (colonne, départ, appels, relances, droits) : bail-epoux-pacses-base.test.ts.
 *
 * Article 8-1 de la loi du 6 juillet 1989 (recueil fourni par le dirigeant, non recontrôlé) : une location consentie
 * exclusivement à des époux ou à des partenaires de PACS au moment de la conclusion initiale du contrat n'est pas une
 * colocation (I) ; la fin de la solidarité du VI vise les colocataires.
 *
 *  - Case non cochée (tous les baux existants) : le contrat est rendu octet pour octet comme avant. Les empreintes
 *    ci-dessous ont été relevées le 25/11/2026 sur le code d'avant ce lot (commit 7180794e, identique pour les baux à
 *    4a410eda), pour 24 dossiers à deux et trois locataires (nu, meublé, colocation ; avec ou sans garant ; rendu du jour et
 *    rendu archivé). Les empreintes des baux signés (signature-empreinte-avant-g8, -avant-24-octobre, lot 53) ne changent pas.
 *  - Case cochée : la clause dit que la location n'est pas une colocation et que la règle de fin de la solidarité de
 *    l'article 8-1 ne s'applique pas ; la règle des six mois n'est plus imprimée. Un bail qui n'a pas deux locataires n'est
 *    pas produit. Le rendu archivé (baux préparés avant g8) ne change pas.
 *  - Rendu PDF réel (Chrome du banc ou de la CI) : la clause tient sur sa page, case cochée ou non ; avec SORTIE_PDF, les PDF
 *    sont écrits pour être regardés.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

const m = vi.hoisted(() => ({ acces: vi.fn(), contexte: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({ ...(await original<typeof import("@/lib/documents/modeles/communs")>()), chargerContexteBail: m.contexte }));

import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import type { ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerBailNu, construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerBailMeuble, construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerBailColocation } from "@/lib/documents/modeles/bail-colocation";
import { CLAUSE_EPOUX_PACS, EXCEPTION_EPOUX_PACS, refusEpouxPacs } from "@/lib/documents/modeles/mentions-location";
import { documentSignatureBail, partiesSignatureBail } from "@/lib/signature-bail";
import { enregistrerDepartColocataire, enregistrerLocatairesEpouxPacs, supprimerBailPersonne } from "@/app/actions/baux";
import {
  AIDE_CASE_EPOUX_PACS, AIDE_DEPART_EPOUX_PACS, AIDE_GARANTS_EPOUX_PACS, LIBELLE_CASE_EPOUX_PACS, OPTION_SANS_REMPLACANT_EPOUX_PACS,
  REFUS_RETRAIT_BAIL_SIGNE, REFUS_RETRAIT_BAIL_SIGNE_EPOUX_PACS, SOLIDAIRE_SANS_FIN_EPOUX_PACS, SUCCES_DEPART_EPOUX_PACS, refusCaseEpouxPacsNombre,
} from "@/lib/solidarite-colocation";

/** Empreintes (circuit de signature) des contrats, relevées sur le code d'avant ce lot : case absente. */
const AVANT: Record<string, string> = {
  "2-nu-seul-jour": "7f0e3222cf4a99885b863365236eca41c443dac67980f95e9a99b1633063eb54",
  "2-nu-seul-archivee": "eda5f78d65277c1127c4e253f0dd1080e0db7afdc75bd27401be30050a5f4645",
  "2-nu-garant-jour": "2b78f6a8786ca111f0478bf0d17247a8d8ca809706f3af853b3c1608ec447ccd",
  "2-nu-garant-archivee": "32a7e6eebf0e7486dc829b0fc090b63f6386739b57ea21ec1f980f949386f72f",
  "2-meuble-seul-jour": "703aec98878cf33c89867e0a16c2779e1548e26e8fe0683096db7525e0711dd3",
  "2-meuble-seul-archivee": "79149fb5f9cb7726a266e530ea45f9c3c4bc0f109363b43f7c279779e00ac496",
  "2-meuble-garant-jour": "9600de1bccb4a3dbae7c00619f66cc6c6c523a0b73a122d9bda3208f08dcc093",
  "2-meuble-garant-archivee": "92b2430567c82a5328ca7e9fa796dd82838b8f17a80a99cd1e90a02651e8466c",
  "2-colocation-seul-jour": "2c1523bc59de7a30467c42e481deafea561532eeb36e6092db4f56f8e680efae",
  "2-colocation-seul-archivee": "c574a5b0bd0b8cb4eefc75ee83073f8871c2e5a66308e155992cbcd0cf7aa664",
  "2-colocation-garant-jour": "a46502308013105540edaeb919724d1273d555c75dd27580a828ca41131dec53",
  "2-colocation-garant-archivee": "18182138138d1ac2c0989592ab3f06034af54d0d8210dd9b0ccf3a3138861e47",
  "3-nu-seul-jour": "500ec42197de2c0566d2feed39f4f78ba898211aed9313b73c773d2344d834dc",
  "3-nu-seul-archivee": "065a98294a6cc6ddc14f15ad93b53cf96e6f8778b408a8a5a0d23e2158d55c2a",
  "3-nu-garant-jour": "bd41902c548c8ea04f13aa52c6b77017aaf616dd5e236fc3945ff3ea05c0a71e",
  "3-nu-garant-archivee": "5d878a1c26d5fe2eb164995ed0c8e083c5f81ee2fe69fed46d0d78b19591a7a2",
  "3-meuble-seul-jour": "1cc9d014321dbe796c69552b24f739a01e134005184a554f524fbcdc10dbff41",
  "3-meuble-seul-archivee": "24f5368c49bce7a60c7e5e7a118d32d6ff884ecccb28accc3f864b6e04143dc5",
  "3-meuble-garant-jour": "4f37dd302c60ddd1c4dc18d45699084500925be3848761aa4ac4470cbc6da025",
  "3-meuble-garant-archivee": "fd284b6863a963110a609a59a2d7c837c5252845a35fa5d5b35b66abe1ad5a9a",
  "3-colocation-seul-jour": "30d885b3253f03956db767e23d5d70949706bd387bf0c0744b494971788863ba",
  "3-colocation-seul-archivee": "8fd6d5b82629f2e178e8ddfaf415cdfcae3ebdb6b8fc4191417ba66bd542182c",
  "3-colocation-garant-jour": "90b71902633b43e83d0f5d78d05e016e642f89797f48aee1c5bcfc66def7fc65",
  "3-colocation-garant-archivee": "447618c1453a43b84bc1de8b83b31dc6e430c267f9b35a1d3caafa52f92d403b",
};
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const SIX_MOIS = "au plus tard à l’expiration d’un délai de six mois après la date d’effet du congé";

function dossier(n: number, type: string, garant: boolean, epouxPacs?: boolean): ContexteBail {
  const c = contexte() as ContexteBail;
  c.locataires = Array.from({ length: n }, (_, i) => personne({ id: `l${i + 1}`, nom: ["Martin", "Durand", "Petit"][i], prenom: ["Léa", "Hugo", "Inès"][i], email: `l${i + 1}@example.invalid` }));
  Object.assign(c.bail, { locataire_principal: "l1", type });
  if (epouxPacs !== undefined) Object.assign(c.bail, { locataires_epoux_pacses: epouxPacs });
  c.garants = garant ? [{ ...personne({ id: "g1", nom: "Garant", prenom: "Paul", email: "g1@example.invalid" }), garant_de: "l2" } as never] : [];
  return c;
}
function rendre(ctx: ContexteBail, type: string, archivee: boolean): DocumentAssemble {
  const o = { dpeClasse: "D", f: new Fusion(), typographieArchivee: archivee };
  return type === "meuble" ? construireBailMeuble(ctx, { ...o, inventaire: [] }) : construireBailNu(ctx, o);
}
function empreinte(ctx: ContexteBail, doc: DocumentAssemble): string {
  const { signataires } = partiesSignatureBail(ctx as never);
  return documentSignatureBail(doc, signataires, [], ctx.garants.length).empreinte;
}
const CAS = Object.keys(AVANT).map((cle) => { const [n, type, g, rendu] = cle.split("-"); return { cle, n: Number(n), type, garant: g === "garant", archivee: rendu === "archivee" }; });

describe("le contrat : case non cochée, rendu identique à avant ; case cochée, la clause des époux ou partenaires de PACS", () => {
  it.each(CAS)("$cle — case absente ou non cochée : empreinte d'avant, à l'octet", ({ cle, n, type, garant, archivee }) => {
    for (const epouxPacs of [undefined, false, null]) {
      const ctx = dossier(n, type, garant, epouxPacs as boolean | undefined);
      expect(empreinte(ctx, rendre(ctx, type, archivee)), `${cle} ${epouxPacs}`).toBe(AVANT[cle]);
    }
  });
  it.each(CAS.filter((c) => c.archivee))("$cle — rendu archivé (bail préparé avant g8) : la case ne change rien", ({ cle, n, type, garant }) => {
    const ctx = dossier(n, type, garant, true);
    expect(empreinte(ctx, rendre(ctx, type, true))).toBe(AVANT[cle]);
  });
  it.each(["nu", "meuble", "colocation"])("bail %s à deux locataires, case cochée : la clause des époux, plus la règle des six mois", (type) => {
    const sans = texte(rendre(dossier(2, type, true, false), type, false).html);
    expect(sans).toContain(SIX_MOIS);
    expect(sans).toContain(EXCEPTION_EPOUX_PACS);
    expect(sans).not.toContain(CLAUSE_EPOUX_PACS);
    const ctx = dossier(2, type, true, true);
    const doc = rendre(ctx, type, false);
    const avec = texte(doc.html);
    expect(avec).toContain("Les locataires sont tenus solidairement et indivisiblement de l’exécution du présent contrat.");
    expect(avec).toContain(CLAUSE_EPOUX_PACS);
    expect(avec).not.toContain(SIX_MOIS);
    expect(avec).not.toContain(EXCEPTION_EPOUX_PACS);
    expect(empreinte(ctx, doc)).not.toBe(AVANT[`2-${type}-garant-jour`]);
    // Pas une colocation : ni le titre, ni le pied, ni les cadres de signature ne le disent plus (case cochée seulement).
    if (type === "colocation") {
      expect(sans).toContain("Contrat commun de colocation");
      expect(sans).toContain("Colocataire 2");
    }
    expect(avec).not.toMatch(/Contrat commun de colocation|Colocation — bail commun|Colocataire \d/);
    expect(avec).toContain("Contrat de location");
    expect(avec).toContain("Locataire 1");
    expect(avec).toContain("Locataire 2");
    // La clause reste un alinéa insécable, comme la règle qu'elle remplace (T2R-3).
    expect(doc.html).toMatch(new RegExp(`<p[^>]*break-inside:\\s*avoid[^>]*>${CLAUSE_EPOUX_PACS.slice(0, 40)}`));
  });
  it("la clause : les mots de l'article 8-1 (I et VI), aucune autre référence, rien de « conforme », pas de terme inventé", () => {
    expect(CLAUSE_EPOUX_PACS).toBe("La location est consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat : elle n’est pas une colocation au sens de l’article 8-1 de la loi du 6 juillet 1989, et la règle de cet article sur la fin de la solidarité d’un colocataire qui donne congé, et de celle de sa caution, ne s’applique pas.");
    for (const t of [CLAUSE_EPOUX_PACS, LIBELLE_CASE_EPOUX_PACS, AIDE_CASE_EPOUX_PACS, AIDE_DEPART_EPOUX_PACS, REFUS_RETRAIT_BAIL_SIGNE_EPOUX_PACS, SUCCES_DEPART_EPOUX_PACS, OPTION_SANS_REMPLACANT_EPOUX_PACS, AIDE_GARANTS_EPOUX_PACS, SOLIDAIRE_SANS_FIN_EPOUX_PACS]) {
      expect(t).not.toMatch(/conforme|fin du bail|jusqu.à la fin/i);
      expect(t.match(/art(?:icle|\.) [\d-]+/g) ?? []).toEqual(expect.arrayContaining([]));
      for (const ref of t.match(/art(?:icle|\.) [\d-]+/g) ?? []) expect(ref, t).toMatch(/8-1$/);
    }
  });
});

describe("un bail qui n'a pas deux locataires n'est pas produit case cochée (refus plutôt qu'une clause fausse)", () => {
  const supabaseInterdit = new Proxy({}, { get: () => { throw new Error("aucune lecture attendue avant le refus"); } }) as SupabaseClient;
  it("refusEpouxPacs : deux locataires ou case non cochée, rien ; trois, un refus qui dit quoi corriger ; rendu archivé, jamais", () => {
    expect(refusEpouxPacs(dossier(2, "colocation", false, true))).toBeNull();
    expect(refusEpouxPacs(dossier(3, "colocation", false, false))).toBeNull();
    expect(refusEpouxPacs(dossier(3, "colocation", false, true))?.erreur).toContain("mais il compte 3 locataires : la case ne vaut que pour deux personnes");
    expect(refusEpouxPacs(dossier(1, "colocation", false, true))?.erreur).toContain("mais il compte 1 locataire :");
    expect(refusEpouxPacs(dossier(3, "colocation", false, true), true)).toBeNull();
  });
  it.each([
    ["colocation", assemblerBailColocation],
    ["nu", assemblerBailNu],
    ["meuble", assemblerBailMeuble],
  ] as const)("assembleur du bail %s : refus avant toute autre lecture", async (type, assembler) => {
    m.contexte.mockResolvedValue(dossier(3, type, false, true));
    const r = await assembler(supabaseInterdit, "org", "bail");
    expect(r).toEqual({ erreur: expect.stringContaining("la case ne vaut que pour deux personnes") });
  });
});

/** Une base imitée pour les actions : les tables lues rendent `lignes[table]`, les mises à jour sont notées. */
function baseImitee(lignes: Record<string, unknown>, rpc: unknown = null) {
  const majs: { table: string; valeurs: unknown }[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "in", "or", "order", "limit"]) q[op] = () => q;
    q.maybeSingle = async () => ({ data: lignes[table] ?? null, error: null });
    q.single = q.maybeSingle;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: Array.isArray(lignes[table]) ? lignes[table] : [], error: null }).then(ok);
    q.update = (valeurs: unknown) => { majs.push({ table, valeurs }); const u: Record<string, unknown> = {}; for (const op of ["eq", "is"]) u[op] = () => u; u.select = async () => ({ data: [{ id: "bail" }], error: null }); return u; };
    q.delete = () => q;
    return q;
  };
  m.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { from, rpc: vi.fn(async () => rpc) } });
  return majs;
}
const coche = (oui: boolean) => { const f = new FormData(); if (oui) f.set("locataires_epoux_pacses", "on"); return f; };
beforeEach(() => vi.clearAllMocks());

describe("la case à la préparation du bail (enregistrerLocatairesEpouxPacs)", () => {
  const bail = (o: Record<string, unknown> = {}) => ({ etat: "brouillon", type: "colocation", chambre_id: null, locataire_principal: "p1", ...o });
  it("bail commun en préparation, deux locataires : la case s'enregistre (cochée, puis décochée)", async () => {
    const majs = baseImitee({ baux: bail(), bail_personnes: [{ person_id: "p2" }] });
    expect((await enregistrerLocatairesEpouxPacs("org", "bail", {}, coche(true))).succes).toContain("deux époux ou partenaires de PACS");
    expect((await enregistrerLocatairesEpouxPacs("org", "bail", {}, coche(false))).succes).toContain("règle de la colocation");
    expect(majs).toEqual([{ table: "baux", valeurs: { locataires_epoux_pacses: true } }, { table: "baux", valeurs: { locataires_epoux_pacses: false } }]);
  });
  it("trois locataires, ou un seul : refusée cochée (un couple est deux personnes) ; décochée, toujours admise", async () => {
    const majs = baseImitee({ baux: bail(), bail_personnes: [{ person_id: "p2" }, { person_id: "p3" }] });
    expect((await enregistrerLocatairesEpouxPacs("org", "bail", {}, coche(true))).erreur).toBe(refusCaseEpouxPacsNombre(3));
    baseImitee({ baux: bail(), bail_personnes: [] });
    expect((await enregistrerLocatairesEpouxPacs("org", "bail", {}, coche(true))).erreur).toBe(refusCaseEpouxPacsNombre(1));
    expect(majs).toEqual([]);
    const majs2 = baseImitee({ baux: bail(), bail_personnes: [{ person_id: "p2" }, { person_id: "p3" }] });
    expect((await enregistrerLocatairesEpouxPacs("org", "bail", {}, coche(false))).erreur).toBeUndefined();
    expect(majs2).toEqual([{ table: "baux", valeurs: { locataires_epoux_pacses: false } }]);
  });
  it("bail signé, contrat individuel ou bail hors colocation : refusée, rien n'est écrit", async () => {
    for (const b of [bail({ etat: "actif" }), bail({ chambre_id: "c1" }), bail({ type: "nu" })]) {
      const majs = baseImitee({ baux: b, bail_personnes: [{ person_id: "p2" }] });
      expect((await enregistrerLocatairesEpouxPacs("org", "bail", {}, coche(true))).erreur, JSON.stringify(b)).toBeTruthy();
      expect(majs).toEqual([]);
    }
  });
});

describe("les messages des actions suivent la case (actions/baux.ts)", () => {
  it("retrait d'une personne d'un bail signé : la règle de la colocation sous condition, ou le texte des époux", async () => {
    baseImitee({ baux: { etat: "actif", locataires_epoux_pacses: false } });
    expect((await supprimerBailPersonne("org", "bail", "ligne")).erreur).toBe(REFUS_RETRAIT_BAIL_SIGNE);
    baseImitee({ baux: { etat: "actif", locataires_epoux_pacses: true } });
    expect((await supprimerBailPersonne("org", "bail", "ligne")).erreur).toBe(REFUS_RETRAIT_BAIL_SIGNE_EPOUX_PACS);
  });
  it("départ enregistré : la date de fin rendue par la base, ou aucune date et pourquoi", async () => {
    const f = new FormData(); f.set("date_effet_conge", "2026-03-31");
    baseImitee({ baux: { locataires_epoux_pacses: false } }, { data: "2026-09-30", error: null });
    expect((await enregistrerDepartColocataire("org", "bail", "ligne", {}, f)).succes).toBe("Départ enregistré — solidarité (et garant lié) jusqu'au 30/09/2026.");
    baseImitee({ baux: { locataires_epoux_pacses: true } }, { data: null, error: null });
    expect((await enregistrerDepartColocataire("org", "bail", "ligne", {}, f)).succes).toBe(SUCCES_DEPART_EPOUX_PACS);
  });
});

describe("les écrans : la case à la préparation, les libellés de la colocation", () => {
  const source = (chemin: string) => readFileSync(chemin, "utf8");
  it("la préparation propose la case dès deux locataires d'un bail commun ; la fiche la lit à part (tolérante) et la transmet", () => {
    const personnes = source("src/app/agence/[orgId]/baux/[bailId]/personnes-bail.tsx");
    expect(personnes).toContain("{colocation && locataires.length >= 2 && <CaseEpouxPacs");
    expect(personnes).toContain('name="locataires_epoux_pacses" defaultChecked={coche}');
    expect(personnes).toContain("{LIBELLE_CASE_EPOUX_PACS}");
    const page = source("src/app/agence/[orgId]/baux/[bailId]/page.tsx");
    expect(page).toContain('supabase.from("baux").select("locataires_epoux_pacses")');
    expect(page.match(/epouxPacs=\{epouxPacs\}/g)).toHaveLength(2);
  });
  it("formulaire de la colocation : chaque phrase des six mois a sa version pour des époux ou partenaires de PACS", () => {
    const f = source("src/app/agence/[orgId]/baux/[bailId]/formulaire-colocation.tsx");
    expect(f).toContain("{epouxPacs ? <option value=\"\">{OPTION_SANS_REMPLACANT_EPOUX_PACS}</option> : <option value=\"\">{OPTION_SANS_REMPLACANT}</option>}");
    expect(f).toContain("{epouxPacs ? <>{AIDE_DEPART_EPOUX_PACS}</> : <>{AIDE_DEPART_COLOCATAIRE}</>}");
    expect(f).toContain("{epouxPacs ? AIDE_GARANTS_EPOUX_PACS : AIDE_GARANTS_COLOCATION}");
    expect(f).toContain("{!c.date_solidarite_fin && epouxPacs && ` · ${SOLIDAIRE_SANS_FIN_EPOUX_PACS}`}");
    expect(f).not.toContain("Engagement plafonné à 6 mois après le\n");
  });
});

const CHROME = [process.env.GERIMMO_CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].find((c): c is string => Boolean(c && existsSync(c)));
describe.skipIf(!CHROME)("rendu PDF réel du bail à deux locataires, case cochée et non cochée", () => {
  it.each(["colocation", "meuble"])("bail %s : la clause attendue est imprimée, en entier sur une page", async (type) => {
    const { rendrePdf } = await import("@/lib/documents/rendu");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const sortie = process.env.SORTIE_PDF;
    if (sortie) mkdirSync(sortie, { recursive: true });
    for (const epouxPacs of [false, true]) {
      const ctx = dossier(2, type, true, epouxPacs);
      // Le meublé exige l'inventaire des onze éléments du décret pour être rendu : onze lignes fictives.
      const lignes = Array.from({ length: 11 }, (_, i) => ({ piece: ["Séjour", "Cuisine", "Chambre"][i % 3], designation: `Élément fictif n° ${i + 1}`, quantite: 1, etat: "bon", observation: null }));
      const doc = type === "meuble" ? construireBailMeuble(ctx, { dpeClasse: "D", f: new Fusion(), inventaire: lignes as never }) : rendre(ctx, type, false);
      const octets = await rendrePdf(doc);
      if (sortie) writeFileSync(`${sortie}/bail-${type}-2-locataires-${epouxPacs ? "case-cochee" : "case-non-cochee"}.pdf`, octets);
      const chargement = getDocument({ data: new Uint8Array(octets), useSystemFonts: false });
      const pdf = await chargement.promise;
      const pages: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) pages.push(((await (await pdf.getPage(n)).getTextContent()).items as { str: string }[]).map((i) => i.str).join("").replace(/\s+/g, ""));
      await chargement.destroy();
      const serre = (t: string) => t.replace(/\s+/g, "");
      const attendue = serre(epouxPacs ? CLAUSE_EPOUX_PACS : EXCEPTION_EPOUX_PACS);
      expect(pages.filter((p) => p.includes(attendue)), `${type} ${epouxPacs}`).toHaveLength(1);
      expect(pages.some((p) => p.includes(serre(SIX_MOIS))), `${type} ${epouxPacs}`).toBe(!epouxPacs);
      expect(createHash("sha256").update(octets).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
    }
  }, 60_000);
});
