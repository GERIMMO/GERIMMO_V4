/**
 * Phase 3 de la mission palier 1, lot 45 (second tour) — bail, résumé de la notice, compléments du contrat.
 *
 *  - T14 (C01, majeur) : après « Actualiser le résumé », la fiche du bail pouvait rester sur « Résumé à actualiser » et ouvrir
 *    l'ANCIEN résumé : elle lisait les liens du bail sans ordre et prenait le premier, quand le récapitulatif des pièces et la
 *    signature électronique retenaient le plus récent. Les trois écrans retiennent désormais le même document.
 *  - T15 (C01) : dans l'enveloppe Zoho, le résumé était transmis sous le nom « annexe-N.pdf », alors que la page de garde dit
 *    qu'il n'est pas une annexe du contrat. Aucun appel réseau : le prestataire, le stockage et la base sont des doublures.
 *  - T16 (C08) : les « Compléments du contrat » d'un bail signé affichaient les travaux et leur montant pour une première
 *    location, et un montant sans travaux, quand le contrat imprime « Sans objet — première location » ou « Néant. ».
 * Reprise du lot 45 (contre-relecture) :
 *  - T15 : la page de garde, l'envoi au prestataire et l'écran de signature (tests/signature-ecran-resume-notice.test.ts)
 *    reconnaissent le résumé par la même règle (estResumeNoticeJoint).
 *  - T16 : un contrat préparé avant les modèles actuels (version g8) imprime les travaux saisis même pour une première location ;
 *    la vue en lecture seule ne peut pas savoir lequel a été signé : dans ce seul cas, elle montre la saisie et renvoie au contrat.
 *  - T14 : le départage par date comparait les chaînes avec localeCompare ; une date sans fraction (la base omet une fraction
 *    nulle) passait pour plus récente qu'une date de la même seconde avec fraction. Comparaison par instant, comme la base.
 * Chaque cas échouait avant le correctif.
 */
import { createHash } from "node:crypto";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { verifierBaseDeTest } from "./garde-base";

const URL_BASE = process.env.SUPABASE_DB_URL;

type Ligne = Record<string, unknown>;
const banc = vi.hoisted(() => ({ tables: {} as Record<string, Ligne[]>, assembler: vi.fn() }));

/**
 * Une base simulée qui applique les filtres (eq, is, in), les tris (plusieurs clés, dans l'ordre des appels) et la limite.
 * Sans tri demandé, les lignes sortent dans l'ordre d'insertion, comme Postgres le fait en général sur une petite table :
 * c'est ce qui faisait sortir l'ancien résumé en premier. La jointure `document:documents(…)` est servie par `document_id`.
 */
function base(tables: Record<string, Ligne[]>) {
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    const tris: { cle: string; croissant: boolean }[] = [];
    let limite = Infinity;
    let champs = "";
    const lignes = () => {
      let r = (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      if (tris.length) r = [...r].sort((a, b) => {
        for (const t of tris) {
          const x = String(a[t.cle] ?? ""), y = String(b[t.cle] ?? "");
          if (x !== y) return (x < y ? -1 : 1) * (t.croissant ? 1 : -1);
        }
        return 0;
      });
      r = r.slice(0, limite);
      if (champs.includes("document:documents(")) r = r.map((l) => ({ ...l, document: (tables.documents ?? []).find((d) => d.id === l.document_id) ?? null }));
      return r;
    };
    const q: Record<string, unknown> = {
      select: (c: string) => { champs = c; return q; },
      eq: (cle: string, v: unknown) => { filtres.push((l) => l[cle] === v); return q; },
      is: (cle: string, v: unknown) => { filtres.push((l) => (l[cle] ?? null) === v); return q; },
      in: (cle: string, v: unknown[]) => { filtres.push((l) => v.includes(l[cle])); return q; },
      or: () => q,
      order: (cle: string, o?: { ascending?: boolean }) => { tris.push({ cle, croissant: o?.ascending !== false }); return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
      single: async () => ({ data: lignes()[0] ?? null, error: null }),
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok, ko),
    };
    return q;
  };
  return { from, rpc: async () => ({ data: true, error: null }) };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => base(banc.tables) }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: async () => ({ estProprietaire: true }) }));
// Les composants client de la fiche : seul l'aperçu importe ici, il montre le fichier qu'il ouvrirait.
vi.mock("@/app/agence/[orgId]/baux/[bailId]/piece-attendue-bail", () => ({
  ApercuPieceBail: (p: { fichier: string; titre: string }) => createElement("a", { "data-apercu": p.titre, href: p.fichier }),
  ChoisirPieceAttendueBail: () => null,
}));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/formulaires-bail", () => ({ FormulaireReglementCopropriete: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/choisir-reglement-bail", () => ({ ChoisirReglementBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/formulaire-annexe-bail", () => ({ FormulaireAnnexeBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/diagnostics-bail", () => ({ DiagnosticsBail: () => null }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: (p: { libelle: string }) => createElement("button", null, p.libelle) }));
// Compléments du contrat : l'enregistrement n'est pas en cause (lecture seule).
vi.mock("@/lib/suivi-enregistrement", () => ({ CompletudeBail: {}, useActionStateSuivi: () => [{}, () => {}, false] }));
vi.mock("@/app/actions/baux", () => ({ modifierComplementsBail: vi.fn() }));
// Envoi en signature : prestataire configuré, client de service présent, dossier inchangé depuis la préparation.
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({}) }));
vi.mock("@/lib/signature-document", async (original) => ({ ...(await original<object>()), assemblerSignatureDocument: banc.assembler }));
vi.mock("@/lib/signature-bail", async (original) => ({
  ...(await original<object>()),
  configurationSignatureBail: () => ({ prestataire: "zoho", environnement: "production", clientId: "x", clientSecret: "x", refreshToken: "x" }),
}));

import { DocumentsParcoursBail } from "@/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail";
import { FormulaireComplementsBail, type ComplementsBailDefauts } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail";
import { lireRecapitulatifPiecesBail } from "@/lib/recapitulatif-pieces-bail";
import { annexesSignatureBail, type AnnexeSignature, type CircuitBail } from "@/lib/signature-bail";
import { controlerEnvoi, nomsFichiersPiecesJointes } from "@/lib/signature-envoi";
import { estResumeNoticeJoint, plusRecentDAbord, resumeNoticeRetenu, TITRE_GED_RESUME_NOTICE } from "@/lib/documents-bail";
import { ajouterPagesSignature } from "@/lib/signature-bail";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { RENVOI_SANS_TRAVAUX_PREMIERE_LOCATION, RENVOI_TRAVAUX_PREMIERE_LOCATION } from "@/lib/travaux-dernier-contrat";
import { rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
import { travauxDepuisDernierContrat } from "@/lib/documents/modeles/mentions-location";
import { Fusion } from "@/lib/documents/gabarit";
import type { ContexteBail } from "@/lib/documents/modeles/communs";

const ORG = "org", BAIL = "bail", LOT = "lot", BIEN = "bien", JOUR = "2026-11-23";
const ANCIEN_TITRE = "Notice d'information (annexe au bail)";

function document(id: string, titre: string, created_at: string, changements: Ligne = {}): Ligne {
  return { id, organization_id: ORG, titre, type: "courrier", created_at, purged_at: null, expire_le: null, mime_type: "application/pdf",
    storage_path: `${ORG}/${id}.pdf`, empreinte: `e-${id}`, versions: [], ...changements };
}
/** Un bail hors copropriété, un ERP déposé, et les résumés de la notice liés au bail DANS L'ORDRE DE LEUR CRÉATION. */
function dossier(resumes: Ligne[]): Record<string, Ligne[]> {
  return {
    baux: [{ id: BAIL, organization_id: ORG, lot_id: LOT, type: "nu", date_debut: "2026-12-01", reglement_copropriete: null }],
    lots: [{ id: LOT, organization_id: ORG, bien_id: BIEN, meuble: false }],
    biens: [{ id: BIEN, organization_id: ORG, type: "appartement", annee_construction: 2010, copropriete: false }],
    diagnostics: [{ id: "g1", organization_id: ORG, lot_id: LOT, bien_id: BIEN, type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", document_id: "erp", classe_dpe: null, archived_at: null }],
    qualifications_diagnostics_lot: [], pieces_attendues_bail: [], inventaire_lignes: [], bail_personnes: [], etats_des_lieux: [], bail_signature_circuits: [],
    document_liens: resumes.map((d) => ({ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: d.id })),
    documents: [...resumes, document("erp", "ERP — état des risques", "2026-11-05T09:00:00+00:00", { type: "diagnostic" })],
  };
}

/** Ce que retient chaque écran : la fiche (statut et fichier ouvert par l'aperçu), le récapitulatif, la signature. */
async function troisEcrans(tables: Record<string, Ligne[]>) {
  banc.tables = tables;
  const element = await DocumentsParcoursBail({ orgId: ORG, bailId: BAIL, lotId: LOT, bienId: BIEN, annexes: null, copropriete: false, reglementId: null, dateDebut: "2026-12-01", edlEntree: null, erreurEdl: false });
  const { prelude } = await prerender(createElement("div", null, element as ReactNode));
  const html = await new Response(prelude).text();
  const carte = html.slice(html.indexOf("Notice d’information"), html.indexOf("reglement-copro"));
  const fiche = {
    statut: /Résumé (disponible|à actualiser|à générer)/.exec(carte)?.[0],
    ouvre: /href="[^"]*\/documents\/([^/"]+)\/fichier"/.exec(carte)?.[1],
  };
  const recap = (await lireRecapitulatifPiecesBail(base(tables) as unknown as SupabaseClient, { orgId: ORG, bailId: BAIL, estProprietaire: true, aujourdhui: JOUR }))
    .pieces.find((p) => p.id === "notice");
  const ctx = contexte();
  ctx.lot = { ...ctx.lot, id: LOT };
  ctx.bien = { ...ctx.bien, id: BIEN, copropriete: false };
  const signature = await annexesSignatureBail(base(tables) as unknown as SupabaseClient, ORG, BAIL, ctx);
  return { fiche, recap, signature: { resume: signature.annexes.map((a) => a.id).filter((id) => id !== "erp"), manquants: signature.manquants } };
}

describe("T14 (C01) — la fiche du bail, le récapitulatif et la signature retiennent le même résumé", () => {
  // Phase 3, lot 48 (U01) : l'ERP du dossier expire le 05/05/2027 et les écrans comparent cette échéance au jour réel :
  // après cette date, « ERP : le diagnostic est expiré » s'ajoutait aux manquants. Horloge figée au jour JOUR.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("après « Actualiser le résumé » : le nouveau résumé partout, plus « Résumé à actualiser » ni l'ancien PDF sur la fiche", async () => {
    // L'ancien résumé (ancien titre, ancien texte) est lié au bail avant le nouveau : il sort en premier d'une lecture sans tri.
    const r = await troisEcrans(dossier([
      document("ancien", ANCIEN_TITRE, "2026-10-01T10:00:00.5+00:00"),
      document("nouveau", TITRE_GED_RESUME_NOTICE, "2026-11-20T10:00:00.123456+00:00"),
    ]));
    expect(r.fiche).toEqual({ statut: "Résumé disponible", ouvre: "nouveau" });
    expect(r.recap).toMatchObject({ statut: "pret" });
    expect(r.signature).toEqual({ resume: ["nouveau"], manquants: [] });
  });

  it("à date égale, le même départage partout (identifiant le plus grand)", async () => {
    // « a1 » n'est pas un PDF : le récapitulatif le dirait « à compléter » s'il le retenait. « b2 » est lié en second.
    const meme = "2026-11-20T10:00:00+00:00";
    const r = await troisEcrans(dossier([
      document("a1", TITRE_GED_RESUME_NOTICE, meme, { mime_type: "image/jpeg" }),
      document("b2", TITRE_GED_RESUME_NOTICE, meme),
    ]));
    expect(r.fiche).toEqual({ statut: "Résumé disponible", ouvre: "b2" });
    expect(r.recap).toMatchObject({ statut: "pret" });
    expect(r.signature.resume).toEqual(["b2"]);
  });

  it("un seul résumé, sous l'ancien titre : les trois écrans demandent de l'actualiser", async () => {
    const r = await troisEcrans(dossier([document("ancien", ANCIEN_TITRE, "2026-10-01T10:00:00+00:00")]));
    expect(r.fiche).toEqual({ statut: "Résumé à actualiser", ouvre: "ancien" });
    expect(r.recap).toMatchObject({ statut: "a_completer" });
    expect(r.signature.manquants).toEqual([expect.stringContaining("Actualisez le résumé de la notice d’information")]);
  });

  it("le choix commun : le plus récent, puis l'identifiant le plus grand ; un résumé supprimé n'est jamais retenu", () => {
    const p = (id: string, created_at: string, purged_at: string | null = null) => ({ id, titre: TITRE_GED_RESUME_NOTICE, type: "courrier", purged_at, created_at });
    expect(resumeNoticeRetenu([p("x", "2026-10-01T00:00:00+00:00"), p("y", "2026-11-01T00:00:00+00:00")])?.id).toBe("y");
    expect(resumeNoticeRetenu([p("b", "2026-11-01T00:00:00+00:00"), p("a", "2026-11-01T00:00:00+00:00")])?.id).toBe("b");
    expect(resumeNoticeRetenu([p("x", "2026-10-01T00:00:00+00:00"), p("y", "2026-11-01T00:00:00+00:00", JOUR)])?.id).toBe("x");
    expect(resumeNoticeRetenu([])).toBeUndefined();
  });

  // Reprise du lot 45 (T14) : la base omet une fraction de seconde nulle (« …10:00:00+00:00 », vérifié avec to_json). Le tri
  // par localeCompare (classement ICU, « . » avant « + ») prenait cet instant pour plus récent que « …10:00:00.5+00:00 ».
  it("dans la même seconde, une date sans fraction reste la plus ancienne : les trois écrans retiennent le nouveau résumé", async () => {
    // La base simulée trie ces chaînes dans l'ordre des octets, qui est l'ordre des instants pour un même décalage (+00:00).
    const r = await troisEcrans(dossier([
      document("ancien", ANCIEN_TITRE, "2026-11-20T10:00:00+00:00"),
      document("nouveau", TITRE_GED_RESUME_NOTICE, "2026-11-20T10:00:00.5+00:00"),
    ]));
    expect(r.fiche).toEqual({ statut: "Résumé disponible", ouvre: "nouveau" });
    expect(r.recap).toMatchObject({ statut: "pret" });
    expect(r.signature).toEqual({ resume: ["nouveau"], manquants: [] });
  });

  it("les dates se comparent par instant, à la microseconde, quel que soit le décalage écrit", () => {
    const p = (id: string, created_at: string) => ({ id, titre: TITRE_GED_RESUME_NOTICE, type: "courrier", purged_at: null, created_at });
    expect(resumeNoticeRetenu([p("b", "2026-11-20T10:00:00.000001+00:00"), p("a", "2026-11-20T10:00:00+00:00")])?.id).toBe("b");
    expect(resumeNoticeRetenu([p("b", "2026-11-20T10:00:00.12345+00:00"), p("a", "2026-11-20T10:00:00.123451+00:00")])?.id).toBe("a");
    // 11:00 à Paris (+01:00) est 10:00 UTC : même instant, l'identifiant départage ; 10:30 à Paris précède 10:00 UTC.
    expect(resumeNoticeRetenu([p("a", "2026-11-20T11:00:00+01:00"), p("b", "2026-11-20T10:00:00Z")])?.id).toBe("b");
    expect(resumeNoticeRetenu([p("a", "2026-11-20T10:30:00+01:00"), p("b", "2026-11-20T10:00:00+00:00")])?.id).toBe("b");
  });

  it.skipIf(!URL_BASE)("même ordre que la base : created_at puis id, décroissants, sur les dates telles que la base les écrit", async () => {
    verifierBaseDeTest(URL_BASE);
    const db = new Client({ connectionString: URL_BASE });
    await db.connect();
    try {
      // Aucune table : des valeurs littérales, triées par Postgres comme le fait la signature (annexesSignatureBail).
      const r = await db.query<{ id: string; created_at: string }>(`
        select id::text, to_json(t)#>>'{}' as created_at from (values
          ('00000000-0000-4000-8000-00000000000a'::uuid, '2026-11-20 10:00:00+00'::timestamptz),
          ('00000000-0000-4000-8000-00000000000b'::uuid, '2026-11-20 10:00:00.5+00'::timestamptz),
          ('00000000-0000-4000-8000-00000000000c'::uuid, '2026-11-20 10:00:00.000001+00'::timestamptz),
          ('f0000000-0000-4000-8000-000000000000'::uuid, '2026-11-20 10:00:00+00'::timestamptz),
          ('10000000-0000-4000-8000-000000000000'::uuid, '2026-11-20 10:00:00.5+00'::timestamptz),
          ('00000000-0000-4000-8000-00000000000d'::uuid, '2026-11-20 09:59:59.999999+00'::timestamptz)
        ) v(id, t) order by t desc, id desc`);
      expect(r.rows.map((l) => l.created_at)).toContain("2026-11-20T10:00:00+00:00");
      expect([...r.rows].reverse().sort(plusRecentDAbord).map((l) => l.id)).toEqual(r.rows.map((l) => l.id));
    } finally {
      await db.end();
    }
  });
});

describe("T15 (C01) — dans l'enveloppe Zoho, le résumé n'est plus nommé « annexe-N.pdf »", () => {
  const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
  const octets = (texte: string) => new TextEncoder().encode(texte);
  const PDF = octets("%PDF-bail-fictif");
  const fichiers: Record<string, Uint8Array> = { "org/bail.pdf": PDF, "org/dpe.pdf": octets("%PDF-dpe"), "org/resume.pdf": octets("%PDF-resume"), "org/erp.pdf": octets("%PDF-erp") };
  const annexe = (id: string, titre: string): AnnexeSignature => ({ id, titre, storage_path: `org/${id}.pdf`, empreinte: sha(fichiers[`org/${id}.pdf`]) });
  const db = {
    rpc: async () => ({ data: true, error: null }),
    from: () => {
      const q: Record<string, unknown> = { select: () => q, eq: () => q, single: async () => ({ data: { storage_path: "org/bail.pdf", empreinte: "x", mime_type: "application/pdf" }, error: null }) };
      return q;
    },
    storage: { from: () => ({ download: async (chemin: string) => ({ data: new Blob([Uint8Array.from(fichiers[chemin]).buffer]), error: null }) }) },
  } as unknown as SupabaseClient;
  const circuit = (annexes: AnnexeSignature[]): CircuitBail => ({
    id: "circuit", prestataire: "zoho", organization_id: ORG, bail_id: BAIL, cible_id: BAIL, modele: "bail", document_id: "doc", etat: "pret",
    environnement: "production", empreinte: "f".repeat(64), pdf_hash: sha(PDF), signataires: [], external_request_id: null, external_document_id: null,
    annexes, document_signe: null, erreur: null, created_at: new Date().toISOString(), expire_le: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  });
  beforeEach(() => {
    banc.assembler.mockResolvedValue({ manquants: [], empreinte: "f".repeat(64), titreGed: "Bail d'habitation", annexes: [], signataires: [] });
  });
  afterEach(() => vi.clearAllMocks());

  it("le résumé porte le nom de son PDF ; les annexes restent « annexe-N.pdf », numérotées comme la page de garde les liste", async () => {
    // L'ordre des annexes du circuit est celui de la préparation (annexesSignatureBail les trie par identifiant).
    const controle = await controlerEnvoi({ db, org: ORG, bail: BAIL, circuit: circuit([annexe("dpe", "DPE"), annexe("erp", "ERP — état des risques"), annexe("resume", TITRE_GED_RESUME_NOTICE)]) });
    expect(controle.annexes.map((a) => a.nomFichier)).toEqual(["annexe-1.pdf", "annexe-2.pdf", "resume-notice-information.pdf"]);
    // Les octets transmis sont ceux de la préparation (empreintes contrôlées), dans le même ordre.
    expect(controle.annexes.map((a) => sha(a.pdf))).toEqual([fichiers["org/dpe.pdf"], fichiers["org/erp.pdf"], fichiers["org/resume.pdf"]].map(sha));
    expect(controle.contenu).toEqual(PDF);
  });

  it("le résumé placé avant les annexes ne décale pas leur numérotation", () => {
    expect(nomsFichiersPiecesJointes([{ titre: TITRE_GED_RESUME_NOTICE }, { titre: "DPE" }, { titre: "ERP" }])).toEqual(["resume-notice-information.pdf", "annexe-1.pdf", "annexe-2.pdf"]);
  });

  it("sans résumé (autres actes), ou avec un résumé sous l'ancien titre (listé parmi les annexes de la page de garde), rien ne change", () => {
    expect(nomsFichiersPiecesJointes([{ titre: "DPE" }, { titre: "ERP" }])).toEqual(["annexe-1.pdf", "annexe-2.pdf"]);
    expect(nomsFichiersPiecesJointes([{ titre: ANCIEN_TITRE }, { titre: "ERP" }])).toEqual(["annexe-1.pdf", "annexe-2.pdf"]);
  });

  it("reprise : la page de garde et l'envoi rangent les mêmes pièces hors des annexes (estResumeNoticeJoint), page inchangée", () => {
    const pieces = [annexe("dpe", "DPE"), annexe("erp", "ERP — état des risques"), annexe("resume", TITRE_GED_RESUME_NOTICE)];
    const html = ajouterPagesSignature({ html: "<html><body></body></html>", reference: "BAIL-1" } as Parameters<typeof ajouterPagesSignature>[0], [], pieces).html;
    const garde = html.slice(html.indexOf("Annexes remises avec le contrat"));
    const information = garde.slice(garde.indexOf("Document d’information joint"));
    expect(garde.slice(0, garde.indexOf("Document d’information joint"))).not.toContain(TITRE_GED_RESUME_NOTICE);
    expect(information).toContain(TITRE_GED_RESUME_NOTICE);
    expect(pieces.filter(estResumeNoticeJoint).map((a) => a.id)).toEqual(["resume"]);
    expect(nomsFichiersPiecesJointes(pieces)[pieces.findIndex(estResumeNoticeJoint)]).toBe("resume-notice-information.pdf");
    expect(estResumeNoticeJoint({ titre: ANCIEN_TITRE })).toBe(false);
  });
});

describe("T16 (C08) — les écrans des travaux disent ce que le contrat imprime", () => {
  const defauts = (bail: Partial<ComplementsBailDefauts>): ComplementsBailDefauts => ({
    fixation_loyer: null, paiement_echeance: "echoir", lieu_paiement: null, irl_valeur: null, duree_reduite_evenement: null,
    travaux_recents: null, travaux_recents_montant: null, travaux_locataire: null, honoraires_bailleur: null, honoraires_locataire: null,
    clauses_particulieres: null, loyer_reference: null, loyer_reference_majore: null, complement_loyer: null, complement_justification: null,
    dernier_loyer: null, dernier_loyer_versement: null, dernier_loyer_revision: null, meuble_etudiant: false, ...bail,
  });
  /** Les lignes « libellé | valeur » de la vue en lecture seule (bail qui n'est plus en brouillon) qui parlent des travaux récents. */
  const lectureSeule = (bail: Partial<ComplementsBailDefauts>) => {
    const html = renderToStaticMarkup(createElement(FormulaireComplementsBail, { orgId: ORG, bailId: BAIL, defauts: defauts(bail), zoneTendue: false, meuble: false, agence: false, modifiable: false }));
    return [...html.matchAll(/<div class="ligne-info"><span>([^<]*)<\/span><span[^>]*>([^<]*)<\/span><\/div>/g)]
      .map((m) => `${m[1]} | ${m[2]}`.replace(/[  ]/g, " ")).filter((l) => /travaux récents/i.test(l));
  };
  /** Le renvoi au contrat signé affiché sous la rubrique (null s'il n'y en a pas). */
  const renvoi = (bail: Partial<ComplementsBailDefauts>) => {
    const html = renderToStaticMarkup(createElement(FormulaireComplementsBail, { orgId: ORG, bailId: BAIL, defauts: defauts(bail), zoneTendue: false, meuble: false, agence: false, modifiable: false }));
    return /<p data-renvoi-contrat-signe="[^"]*"[^>]*>([^<]*)<\/p>/.exec(html)?.[1].replace(/&#x27;/g, "'").replace(/&quot;/g, "\"") ?? null;
  };
  const recap = (bail: Parameters<typeof rubriquesRecapBail>[0]["bail"]) => rubriquesRecapBail({ bail, lot: { meuble: false }, bien: {}, personnes: [], liens: { lot: "#lot", bien: "#bien" } })
    .find((r) => r.id === "clauses")!.lignes.filter((l) => l.champ.startsWith("bail.travaux_recents")).map((l) => `${l.libelle} | ${l.valeur}`.replace(/[  ]/g, " "));
  const contrat = (bail: Partial<ContexteBail["bail"]>) => travauxDepuisDernierContrat({ bail } as ContexteBail, new Fusion()).replace(/<[^>]+>/g, "").replace(/[  ]/g, " ");

  // Reprise du lot 45 (T16, contre-relecture) : ce cas attendait « Sans objet — première location » dans la vue en lecture seule.
  // C'est vrai d'un contrat préparé avec les modèles actuels, faux d'un contrat préparé avant (version g8) : celui-ci imprime les
  // travaux et leur montant (cas suivant), et la vue sert à tout bail sorti du brouillon. Le récapitulatif, lui, ne s'affiche
  // qu'en brouillon : le contrat qu'il annonce sera préparé avec les modèles actuels.
  it("première location : le contrat et le récapitulatif disent « Sans objet — première location » ; la vue montre la saisie et renvoie au contrat signé", () => {
    const bail = { precedente_location: "premiere", travaux_recents: "Remise en peinture complète du logement", travaux_recents_montant: 2400 };
    expect(contrat(bail)).toBe("Sans objet — première location.");
    expect(recap(bail)).toEqual(["Travaux récents | Sans objet — première location"]);
    expect(lectureSeule(bail)).toEqual(["Travaux récents du bailleur | Remise en peinture complète du logement", "Montant des travaux récents | 2 400,00 €"]);
    expect(renvoi(bail)).toBe(RENVOI_TRAVAUX_PREMIERE_LOCATION);
  });

  it.each(["nu", "meuble"] as const)("reprise : bail %s signé avant les modèles actuels — l'ancien contrat imprime les travaux, le nouveau « Sans objet » ; la vue ne contredit aucun des deux", (type) => {
    const ctx = contexte();
    ctx.bail = { ...ctx.bail, precedente_location: "premiere", travaux_recents: "Remise en peinture", travaux_recents_montant: 2400 } as ContexteBail["bail"];
    const construire = (typographieArchivee: boolean) => type === "nu"
      ? construireBailNu(ctx, { dpeClasse: "C", f: new Fusion(), typographieArchivee })
      : construireBailMeuble(ctx, { dpeClasse: "C", f: new Fusion(), inventaire: [], typographieArchivee });
    const rubrique = (html: string) => {
      const t = html.replace(/<[^>]+>/g, " ").replace(/[\s  ]+/g, " ");
      const i = t.indexOf("depuis la fin du dernier contrat");
      return t.slice(i, t.indexOf("Travaux que le locataire", i));
    };
    expect(rubrique(construire(true).html)).toMatch(/Remise en peinture — montant : 2 400,00 €/);
    expect(rubrique(construire(false).html)).toMatch(/Sans objet — première location\./);
    const vue = lectureSeule(ctx.bail as Partial<ComplementsBailDefauts>);
    expect(vue).toEqual(["Travaux récents du bailleur | Remise en peinture", "Montant des travaux récents | 2 400,00 €"]);
    expect(vue.join(" ")).not.toContain("Sans objet");
    expect(renvoi(ctx.bail as Partial<ComplementsBailDefauts>)).toContain("Reportez-vous au contrat signé.");
  });

  // Phase 3, lot 48 (U03) : ce cas attendait « Sans objet — première location », sans renvoi. C'est ce qu'imprime un contrat
  // préparé avec les modèles actuels, pas un contrat préparé avant g8 (« Néant. — montant : —. ») : la vue sert aux deux. Elle
  // montre la saisie (« Néant ») et renvoie au contrat signé, comme pour des travaux saisis.
  it.each(["nu", "meuble"] as const)("première location sans travaux saisis, bail %s : la vue dit « Néant » et renvoie au contrat signé, qui dit « Néant » (avant g8) ou « Sans objet »", (type) => {
    const bail = { precedente_location: "premiere", travaux_recents: null, travaux_recents_montant: 900 };
    const ctx = contexte();
    ctx.bail = { ...ctx.bail, ...bail } as ContexteBail["bail"];
    const construire = (typographieArchivee: boolean) => (type === "nu"
      ? construireBailNu(ctx, { dpeClasse: "C", f: new Fusion(), typographieArchivee })
      : construireBailMeuble(ctx, { dpeClasse: "C", f: new Fusion(), inventaire: [], typographieArchivee })).html.replace(/<[^>]+>/g, " ").replace(/[\s  ]+/g, " ");
    expect(construire(true)).toContain("depuis la fin du dernier contrat : Néant. — montant : —.");
    expect(construire(false)).toContain("depuis la fin du dernier contrat : Sans objet — première location.");
    expect(lectureSeule(bail)).toEqual(["Travaux récents du bailleur | Néant"]);
    expect(renvoi(bail)).toBe(RENVOI_SANS_TRAVAUX_PREMIERE_LOCATION);
    expect(renvoi(bail)).toContain("« Néant »");
    expect(renvoi(bail)).toContain("« Sans objet — première location »");
  });

  it("un montant saisi sans travaux : « Néant », sans montant", () => {
    const bail = { precedente_location: "recente", travaux_recents: "  ", travaux_recents_montant: 1500 };
    expect(contrat(bail)).toBe("Néant.");
    expect(lectureSeule(bail)).toEqual(["Travaux récents du bailleur | Néant"]);
    expect(recap(bail)).toEqual([]);
  });

  it("hors première location, les travaux et leur montant, comme au contrat", () => {
    const bail = { precedente_location: "ancienne", travaux_recents: "Remise en peinture", travaux_recents_montant: 2400 };
    expect(contrat(bail)).toBe("Remise en peinture — montant : 2 400,00 €.");
    expect(lectureSeule(bail)).toEqual(["Travaux récents du bailleur | Remise en peinture", "Montant des travaux récents | 2 400,00 €"]);
    expect(recap(bail)).toEqual(["Travaux récents | Remise en peinture", "Montant des travaux | 2 400,00 €"]);
    expect(renvoi(bail)).toBeNull();
  });

  it("ni travaux ni montant : « Néant » à l'écran comme au contrat", () => {
    const bail = { precedente_location: "ancienne" };
    expect(contrat(bail)).toBe("Néant.");
    expect(lectureSeule(bail)).toEqual(["Travaux récents du bailleur | Néant"]);
  });
});
