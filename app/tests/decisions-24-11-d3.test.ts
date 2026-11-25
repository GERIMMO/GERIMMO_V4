/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D3 — dossier du bail et sortie. Tests sans base ni réseau.
 *
 *  - Q46 : le bailleur dépose lui-même la notice d'information officielle ; la signature électronique du bail est bloquée
 *    sans elle et la joint comme annexe ; le résumé de Gerimmo reste un document d'information ; un circuit déjà préparé
 *    garde son empreinte (elle se recalcule avec la notice que CE circuit portait).
 *  - Q28 : avertissement quand plusieurs diagnostics de performance énergétique existent ; la règle de choix ne change pas.
 *  - Q49 : les deux décomptes exigent de la même façon un justificatif par retenue (un devis suffit).
 *  - Q38 : la source du contrôle des repères fiscaux est enregistrée avec la date et affichée.
 * Les règles de la base ont leurs tests (reperes-fiscaux-source-base, notice-information-deposee-base).
 * Chaque cas échouait avant le lot.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import { assemblerDecompteRestitution, libelleJustificatifRetenue } from "@/lib/documents/modeles/decompte-restitution";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { manqueJustificatifRetenue, retenueJustifiee } from "@/lib/justificatif-retenue";
import { ajouterPagesSignature, annexesSignatureBail, MANQUE_NOTICE_DEPOSEE, type AnnexeSignature } from "@/lib/signature-bail";
import { nomsFichiersPiecesJointes } from "@/lib/signature-envoi";
import { carteNoticeDeposee, classerPiecesBail, estNoticeDeposeeJointe, estResumeNoticeJoint, noticeDeposeeRetenue, TITRE_GED_NOTICE_DEPOSEE, TITRE_GED_RESUME_NOTICE, TYPE_GED_NOTICE_DEPOSEE } from "@/lib/documents-bail";
import { lireRecapitulatifPiecesBail } from "@/lib/recapitulatif-pieces-bail";
import { indexEtapeBail } from "@/lib/champs-etape-bail";
import { TYPES_DOCUMENT } from "@/lib/ged";
import { ecartDpe, phrasesEcartDpe, type DpeEnregistre } from "@/lib/avertissement-dpe";
import { AvertissementDpe } from "@/components/avertissement-dpe";
import { lireReponseReperes, lireSourceSaisie, phrasesMicroFoncier } from "@/lib/reperes-fiscaux";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
const source = (chemin: string) => readFileSync(chemin, "utf8");
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/[\s  ]+/g, " ");

/** Une base simulée qui applique les filtres (eq, is, in), les tris et la limite ; `single` et `maybeSingle` rendent la première ligne. */
function base(tables: Record<string, Ligne[]>): SupabaseClient {
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    const tris: { cle: string; croissant: boolean }[] = [];
    let limite = Infinity;
    const lignes = () => {
      let r = (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      if (tris.length) r = [...r].sort((a, b) => {
        for (const t of tris) {
          const x = String(a[t.cle] ?? ""), y = String(b[t.cle] ?? "");
          if (x !== y) return (x < y ? -1 : 1) * (t.croissant ? 1 : -1);
        }
        return 0;
      });
      return r.slice(0, limite);
    };
    const q: Record<string, unknown> = {
      select: () => q, or: () => q,
      eq: (cle: string, v: unknown) => { filtres.push((l) => l[cle] === v); return q; },
      is: (cle: string, v: unknown) => { filtres.push((l) => (l[cle] ?? null) === v); return q; },
      in: (cle: string, v: unknown[]) => { filtres.push((l) => v.includes(l[cle])); return q; },
      order: (cle: string, o?: { ascending?: boolean }) => { tris.push({ cle, croissant: o?.ascending !== false }); return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
      single: async () => ({ data: lignes()[0] ?? null, error: null }),
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok, ko),
    };
    return q;
  };
  return { from, rpc: async () => ({ data: [], error: null }) } as unknown as SupabaseClient;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Q46 — la notice d'information déposée par le bailleur", () => {
  const ORG = "org", BAIL = "bail", LOT = "lot", BIEN = "bien";
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-24T12:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  const fichier = (id: string, titre: string, type: string, created_at: string, plus: Ligne = {}): Ligne => ({
    id, organization_id: ORG, titre, type, created_at, purged_at: null, expire_le: null, mime_type: "application/pdf",
    storage_path: `${ORG}/${id}.pdf`, empreinte: `e-${id}`, versions: [], ...plus });
  const resume = fichier("resume", TITRE_GED_RESUME_NOTICE, "courrier", "2026-11-20T10:00:00+00:00");
  const notice = (id = "notice", le = "2026-11-21T10:00:00+00:00", plus: Ligne = {}) => fichier(id, TITRE_GED_NOTICE_DEPOSEE, TYPE_GED_NOTICE_DEPOSEE, le, plus);
  /** Un bail hors copropriété, un ERP déposé, le résumé de Gerimmo, et les pièces données, toutes liées au bail. */
  const dossier = (pieces: Ligne[]): Record<string, Ligne[]> => ({
    baux: [{ id: BAIL, organization_id: ORG, lot_id: LOT, type: "nu", date_debut: "2026-12-01", reglement_copropriete: null }],
    lots: [{ id: LOT, organization_id: ORG, bien_id: BIEN, meuble: false }],
    biens: [{ id: BIEN, organization_id: ORG, type: "appartement", annee_construction: 2010, copropriete: false }],
    diagnostics: [{ id: "g1", organization_id: ORG, lot_id: LOT, bien_id: BIEN, type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", document_id: "erp", classe_dpe: null, archived_at: null }],
    document_liens: [resume, ...pieces].map((d) => ({ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: d.id })),
    documents: [resume, ...pieces, fichier("erp", "ERP — état des risques", "diagnostic", "2026-11-05T09:00:00+00:00")],
  });
  const ctx = () => { const c = contexte(); c.lot = { ...c.lot, id: LOT }; c.bien = { ...c.bien, id: BIEN, copropriete: false }; return c; };
  const annexes = (pieces: Ligne[], noticeDuCircuit?: string | null) => annexesSignatureBail(base(dossier(pieces)), ORG, BAIL, ctx(), noticeDuCircuit);

  it("sans notice déposée, la signature électronique est bloquée par une consigne claire ; rien d'autre ne manque", async () => {
    const r = await annexes([]);
    expect(r.manquants).toEqual([MANQUE_NOTICE_DEPOSEE]);
    expect(MANQUE_NOTICE_DEPOSEE).toBe("Déposez la notice d’information officielle à l’étape Documents : l’envoi en signature électronique est bloqué sans elle.");
    // Le résumé de Gerimmo est là, mais il ne remplace pas la notice.
    expect(r.annexes.map((a) => a.id).sort()).toEqual(["erp", "resume"]);
  });

  it("la notice déposée lève le blocage et rejoint le dossier ; la plus récente est retenue ; une notice supprimée ne compte pas", async () => {
    const r = await annexes([notice()]);
    expect(r.manquants).toEqual([]);
    expect(r.annexes.map((a) => a.id).sort()).toEqual(["erp", "notice", "resume"]);
    const deux = await annexes([notice("ancienne", "2026-11-21T10:00:00+00:00"), notice("recente", "2026-11-23T10:00:00+00:00")]);
    expect(deux.annexes.map((a) => a.id).sort()).toEqual(["erp", "recente", "resume"]);
    const supprimee = await annexes([notice("n", "2026-11-21T10:00:00+00:00", { purged_at: "2026-11-22T00:00:00+00:00" })]);
    expect(supprimee.manquants).toEqual([MANQUE_NOTICE_DEPOSEE]);
  });

  it("un PDF d'un autre type portant le même titre n'est pas la notice : seul le dépôt dédié compte", async () => {
    const r = await annexes([fichier("faux", TITRE_GED_NOTICE_DEPOSEE, "autre", "2026-11-22T10:00:00+00:00")]);
    expect(r.manquants).toEqual([MANQUE_NOTICE_DEPOSEE]);
    expect(r.annexes.map((a) => a.id)).not.toContain("faux");
  });

  it("empreinte d'un circuit déjà préparé : le recalcul prend la notice que le circuit portait, pas celle du jour", async () => {
    // Circuit d'avant la décision (aucune notice) : la notice déposée depuis n'entre pas, et rien n'est réclamé.
    const avant = await annexes([notice()], null);
    expect(avant.manquants).toEqual([]);
    expect(avant.annexes.map((a) => a.id).sort()).toEqual(["erp", "resume"]);
    // Circuit préparé avec « ancienne » : une notice déposée de nouveau après l'envoi ne la remplace pas dans le recalcul.
    const apres = await annexes([notice("ancienne", "2026-11-21T10:00:00+00:00"), notice("recente", "2026-11-23T10:00:00+00:00")], "ancienne");
    expect(apres.annexes.map((a) => a.id).sort()).toEqual(["ancienne", "erp", "resume"]);
    // L'activation du bail signé transmet bien cette notice aux quatre recalculs.
    const action = source("src/app/actions/signature-bail.ts");
    expect(action).toContain("const noticeDuCircuit = circuit.annexes.find(estNoticeDeposeeJointe)?.id ?? null;");
    expect(action.match(/assemblerSignatureBail\([^)]*noticeDuCircuit \}\)/g)).toHaveLength(4);
  });

  it("page de garde du dossier : la notice est une annexe du contrat, le résumé reste un document d'information à part", () => {
    const doc = { html: "<html><body><p>Contrat</p></body></html>", reference: "BAIL-1" } as Parameters<typeof ajouterPagesSignature>[0];
    const pieces: AnnexeSignature[] = [
      { id: "erp", titre: "ERP — état des risques", storage_path: "x", empreinte: "aaa" },
      { id: "notice", titre: TITRE_GED_NOTICE_DEPOSEE, storage_path: "y", empreinte: "bbb" },
      { id: "resume", titre: TITRE_GED_RESUME_NOTICE, storage_path: "z", empreinte: "ccc" },
    ];
    const texte = texteDe(ajouterPagesSignature(doc, [], pieces).html);
    const iAnnexes = texte.indexOf("Annexes remises avec le contrat"), iInfo = texte.indexOf("Document d’information joint");
    expect(iAnnexes).toBeGreaterThan(-1);
    expect(iInfo).toBeGreaterThan(iAnnexes);
    expect(texte.slice(iAnnexes, iInfo)).toContain("Notice d'information (déposée par le bailleur)");
    expect(texte.slice(iAnnexes, iInfo)).not.toContain("Résumé de la notice");
    expect(texte.slice(iInfo)).toContain("Résumé de la notice d'information");
    expect(texte.slice(iInfo)).toContain("Il n’est pas une annexe du contrat et ne remplace pas la notice d’information officielle");
    expect(estNoticeDeposeeJointe(pieces[1])).toBe(true);
    expect(estResumeNoticeJoint(pieces[1])).toBe(false);
    // Chez le prestataire : la notice est une annexe numérotée, le résumé garde son nom à lui.
    expect(nomsFichiersPiecesJointes(pieces)).toEqual(["annexe-1.pdf", "annexe-2.pdf", "resume-notice-information.pdf"]);
  });

  it("le titre de classement dit d'où vient le fichier et ne le dit ni « conforme » ni « en vigueur »", () => {
    expect(TITRE_GED_NOTICE_DEPOSEE).toBe("Notice d'information (déposée par le bailleur)");
    expect(TYPES_DOCUMENT[TYPE_GED_NOTICE_DEPOSEE]).toBe(TITRE_GED_NOTICE_DEPOSEE);
    expect(TITRE_GED_RESUME_NOTICE).toBe("Résumé de la notice d'information");
  });

  it("fiche du bail : la notice déposée n'est ni un résumé ni un « autre fichier » ; la plus récente est retenue", () => {
    type Piece = { id: string; titre: string | null; type: string; purged_at: string | null; created_at: string };
    const pieces = [notice("a", "2026-11-21T10:00:00+00:00"), notice("b", "2026-11-23T10:00:00.5+00:00"), resume] as unknown as Piece[];
    const { notices, autres } = classerPiecesBail(pieces, [], null);
    expect(notices.map((p) => p.id)).toEqual(["resume"]);
    expect(autres).toEqual([]);
    expect(noticeDeposeeRetenue(pieces)?.id).toBe("b");
    expect(noticeDeposeeRetenue([resume] as unknown as Piece[])).toBeUndefined();
  });

  it("récapitulatif des pièces : la notice officielle a sa ligne, à déposer puis prête, qui mène au dépôt et rappelle la voie papier", async () => {
    const lire = async (pieces: Ligne[]) => (await lireRecapitulatifPiecesBail(base({ ...dossier(pieces), qualifications_diagnostics_lot: [], pieces_attendues_bail: [], inventaire_lignes: [], bail_personnes: [], etats_des_lieux: [], bail_signature_circuits: [] }),
      { orgId: ORG, bailId: BAIL, estProprietaire: true, aujourdhui: "2026-11-24" })).pieces;
    const sans = (await lire([])).find((p) => p.id === "notice-deposee");
    expect(sans).toMatchObject({ titre: "Notice d’information officielle", statut: "a_completer", moment: "signature", href: `/espace/${ORG}/baux/${BAIL}#notice-deposee`,
      detail: "À déposer : la signature électronique est bloquée sans elle. Sur papier, annexez-la au contrat." });
    const avec = await lire([notice()]);
    expect(avec.find((p) => p.id === "notice-deposee")).toMatchObject({ statut: "pret", detail: "Déposée par vous ; jointe à la signature électronique. Sur papier, annexez-la au contrat." });
    // Le résumé garde sa propre ligne, sous son nom de résumé.
    expect(avec.find((p) => p.id === "notice")?.titre).toBe("Résumé de la notice d’information");
  });

  it("écrans : le lien de la consigne ouvre l'étape Documents sur la carte du dépôt ; la voie papier n'est pas bloquée mais rappelée", () => {
    expect(indexEtapeBail("#notice-deposee")).toBe(4);
    const signature = source("src/components/signature-electronique-bail.tsx");
    expect(signature).toContain('if (/notice d’information officielle/i.test(champ)) return "#notice-deposee";');
    const parcours = source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx");
    expect(parcours).toContain('<article id="notice-deposee"');
    expect(parcours).toContain("Gerimmo ne fournit pas ce texte et ne vérifie pas le fichier déposé");
    // Reprise du lot D3 (M4) : la phrase n'a pas changé pour un bien d'habitation ; elle vit maintenant dans
    // carteNoticeDeposee (documents-bail.ts), qui porte aussi le texte des biens hors habitation.
    expect(parcours).toContain("<p data-notice-effet>{carteNotice.effet}</p>");
    expect(carteNoticeDeposee(true, false).effet).toBe("Sans elle, l’envoi du bail en signature électronique est bloqué. Pour une signature sur papier, annexez-la vous-même au contrat.");
    // Le résumé ne porte jamais le nom de la notice ; aucune adresse officielle n'est ajoutée, aucune version affirmée.
    expect(parcours).toContain("<h4>Résumé de la notice (document d’information)</h4>");
    expect(parcours).not.toMatch(/legifrance|version en vigueur est|conforme/i);
    const page = source("src/app/agence/[orgId]/baux/[bailId]/page.tsx");
    expect(page).toContain("data-rappel-notice-papier");
    expect(page).toContain("Signature sur papier : annexez vous-même au contrat la notice d’information officielle, en entier.");
    // Le dépôt du bail signé sur papier ne lit pas la notice : il n'est pas bloqué par elle.
    expect(source("src/app/actions/baux.ts")).not.toMatch(/notice_information|NOTICE_DEPOSEE/);
  });

  it("le dépôt est réservé à un PDF, sur un bail en préparation, sous le type dédié et le titre fixe", () => {
    const action = source("src/app/actions/annexe-bail.ts");
    const depot = action.slice(action.indexOf("export async function deposerNoticeBail"), action.indexOf("export async function corrigerClasseDpeBail"));
    expect(depot).toContain('bail?.etat!=="brouillon"');
    expect(depot).toContain('!=="application/pdf")return {erreur:"La notice d’information se dépose en PDF complet."}');
    expect(depot).toContain("deposerFichierGed(supabase,user,orgId,fichier,TYPE_GED_NOTICE_DEPOSEE,TITRE_GED_NOTICE_DEPOSEE)");
    // Le même fichier déjà déposé comme notice pour un autre bail est rattaché, pas refusé comme doublon.
    expect(depot).toContain("existant.type===TYPE_GED_NOTICE_DEPOSEE&&!existant.purged_at");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Q28 — avertissement quand plusieurs diagnostics de performance énergétique existent", () => {
  const dpe = (id: string, classe: string | null, etabli: string, enregistre: string, archive = false): DpeEnregistre =>
    ({ id, classe_dpe: classe, date_realisation: etabli, created_at: `${enregistre}T10:00:00+00:00`, archived_at: archive ? "2026-11-20T10:00:00+00:00" : null });

  it("rien à signaler : aucun DPE, un seul, ou un nouveau DPE plus récent qui a remplacé l'ancien", () => {
    expect(ecartDpe([])).toBeNull();
    expect(ecartDpe([dpe("a", "D", "2024-05-02", "2024-05-10")])).toBeNull();
    expect(ecartDpe([dpe("ancien", "G", "2019-03-01", "2019-03-05", true), dpe("nouveau", "D", "2026-10-01", "2026-10-03")])).toBeNull();
    // Aucun DPE en vigueur : rien n'est retenu, l'absence est dite ailleurs.
    expect(ecartDpe([dpe("ancien", "G", "2019-03-01", "2019-03-05", true)])).toBeNull();
  });

  it("un diagnostic plus ancien saisi après coup : Gerimmo retient le dernier enregistré, et le dit ; la règle n'est pas changée", () => {
    const e = ecartDpe([dpe("recent", "D", "2026-10-01", "2026-10-03", true), dpe("ancien-saisi-apres", "G", "2023-06-15", "2026-11-20")]);
    expect(e).toMatchObject({ retenu: { id: "ancien-saisi-apres" }, plusRecent: { id: "recent" }, enVigueur: 1 });
    const p = phrasesEcartDpe(e!);
    expect(p.retenu).toBe("Gerimmo retient aujourd’hui le diagnostic établi le 15/06/2023 (classe G) : c’est le dernier enregistré pour ce logement.");
    expect(p.plusRecent).toBe("Le plus récent par sa date d’établissement est le diagnostic établi le 01/10/2026 (classe D), remplacé depuis dans Gerimmo.");
    expect(p.suite).toBe("La règle qui dit lequel décide sera fixée après lecture du texte officiel. D’ici là, vérifiez que la classe retenue est la bonne.");
    expect(Object.values(p).join(" ")).not.toMatch(/conforme|article|décret|loi /i);
  });

  it("plusieurs diagnostics en vigueur (données anciennes) : signalé même si celui qui est retenu est le plus récent", () => {
    const e = ecartDpe([dpe("a", "E", "2022-01-10", "2022-01-12"), dpe("b", null, "2025-03-04", "2025-03-06")]);
    expect(e).toMatchObject({ retenu: { id: "b" }, plusRecent: { id: "b" }, enVigueur: 2 });
    const p = phrasesEcartDpe(e!);
    expect(p.retenu).toBe("Gerimmo retient aujourd’hui le diagnostic établi le 04/03/2025 (classe non renseignée) : c’est le plus récent des diagnostics en vigueur pour ce logement.");
    expect(p.plusRecent).toBe("C’est aussi le plus récent par sa date d’établissement, mais 2 diagnostics sont en vigueur pour ce logement.");
  });

  it("le bandeau s'affiche seulement s'il y a un écart, avec l'usage de la classe sur cet écran", () => {
    expect(renderToStaticMarkup(createElement(AvertissementDpe, { ecart: null, usage: "x" }))).toBe("");
    const e = ecartDpe([dpe("recent", "D", "2026-10-01", "2026-10-03", true), dpe("ancien", "G", "2023-06-15", "2026-11-20")]);
    const html = renderToStaticMarkup(createElement(AvertissementDpe, { ecart: e, usage: "Sa classe est celle que le contrat imprime." }));
    expect(html).toContain("data-avertissement-dpe");
    expect(texteDe(html)).toContain("Plusieurs diagnostics de performance énergétique pour ce logement");
    expect(texteDe(html)).toContain("c’est le dernier enregistré pour ce logement. Sa classe est celle que le contrat imprime.");
  });

  it("il est posé là où Gerimmo s'appuie sur la classe : bail, révision du loyer, fiche du logement ; aucun choix de DPE n'est modifié", () => {
    expect(source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx")).toContain('<AvertissementDpe ecart={ecartDpe} usage="Sa classe est celle que le contrat imprime." />');
    expect(source("src/app/agence/[orgId]/baux/[bailId]/page.tsx")).toContain("Sa classe décide si la révision du loyer est possible : elle est refusée en classe F ou G.");
    expect(source("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx")).toContain("{avertissementDpe}");
    // Reprise du lot D3 (M5) : l'ancienne phrase (« … et à l'alerte sur les classes F et G ») était inexacte : le contrôle
    // de la mise en location regarde tous les DPE en vigueur, et aucune alerte ne porte sur la classe F sur cette fiche.
    // La phrase est maintenant choisie par usageDpeFicheLogement (decisions-24-11-d3-reprise.test.ts).
    expect(source("src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx")).toContain("<AvertissementDpe ecart={ecartDpe} usage={usageDpeFicheLogement(ecartDpe)} />");
    // La règle de choix reste celle d'avant : le contrat lit toujours le DPE non archivé (bail nu pris en témoin).
    const bailNu = source("src/lib/documents/modeles/bail-nu.ts");
    expect(bailNu).toMatch(/\.eq\("type", "dpe"\)\s*\.is\("archived_at", null\)\s*\.order\("date_realisation", \{ ascending: false \}\)\s*\.limit\(1\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Q49 — les deux décomptes exigent de la même façon un justificatif par retenue", () => {
  let ctx: ContexteBail;
  beforeEach(() => {
    ctx = contexte();
    ctx.bail.etat = "termine";
    ctx.bailleurs = [{ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile" }), quote_part: 100 }];
    vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const organisation = { id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: null, email_contact: null };
  const restitution = { id: "r1", bail_id: "b1", organization_id: "org", date_remise_cles: "2026-10-08", delai_mois: 2, depot: 680, impayes: 0, trop_percu: 0, statut: "finalise", solde: 262.13, date_emission: "2026-11-24", sans_edl_entree: false };
  const retenue = (libelle: string, justificatif: string | null, plus: Ligne = {}): Ligne =>
    ({ restitution_id: "r1", organization_id: "org", libelle, cout: 260, duree_vie_ans: 10, age_ans: 8, montant_retenu: 52, justificatif_document: justificatif, sans_justificatif: !justificatif, created_at: "2026-11-01", ...plus });
  const tables = (retenues: Ligne[]) => ({ organizations: [organisation], restitutions: [restitution], retenues, regularisations_charges: [] });
  const succes = (r: Assemblage) => { if ("erreur" in r) throw new Error(r.erreur); return r; };
  const lesDeux = async (retenues: Ligne[]) => ({
    restitution: succes(await assemblerDecompteRestitution(base(tables(retenues)), "org", "b1")),
    retenues: succes(await assemblerComplementBail("decompte_retenues", base(tables(retenues)), "org", "b1")),
  });

  it("la règle : une pièce déposée justifie la retenue, quelle que soit sa nature ; l'ancien indicateur « sans justificatif » l'emporte", () => {
    expect(retenueJustifiee({ justificatif_document: "devis", sans_justificatif: false })).toBe(true);
    expect(retenueJustifiee({ justificatif_document: "facture" })).toBe(true);
    expect(retenueJustifiee({ justificatif_document: null, sans_justificatif: true })).toBe(false);
    expect(retenueJustifiee({ justificatif_document: null })).toBe(false);
    expect(retenueJustifiee({ justificatif_document: "piece", sans_justificatif: true })).toBe(false);
    expect(manqueJustificatifRetenue("Plan de travail")).toBe("justificatif de la retenue « Plan de travail » (un devis suffit)");
  });

  it("retenues justifiées (un devis, une facture) : les deux PDF sont produits, sans « Non fourni »", async () => {
    const d = await lesDeux([retenue("Peinture (devis)", "devis-1"), retenue("Douchette (facture)", "facture-1")]);
    expect(refusDocumentIncomplet(d.restitution.document)).toBeNull();
    expect(refusDocumentIncomplet(d.retenues.document)).toBeNull();
    const texte = texteDe(d.restitution.document.html);
    expect(texte.match(/Déposé — sur demande/g)).toHaveLength(2);
    expect(texte).not.toMatch(/Non fourni|À déposer/);
  });

  it("une retenue sans justificatif bloque LES DEUX décomptes, avec la même ligne « À renseigner » par retenue", async () => {
    const d = await lesDeux([retenue("Peinture (devis)", "devis-1"), retenue("Plan de travail", null), retenue("Rideaux", null)]);
    const attendu = ["justificatif de la retenue « Plan de travail » (un devis suffit)", "justificatif de la retenue « Rideaux » (un devis suffit)"];
    expect(refusDocumentIncomplet(d.restitution.document)?.manquants).toEqual(attendu);
    expect(refusDocumentIncomplet(d.retenues.document)?.manquants).toEqual(attendu);
    // Le décompte de restitution n'imprime plus « Non fourni » ni sa légende.
    expect(texteDe(d.restitution.document.html)).not.toMatch(/Non fourni|n'est appuyée d'aucune pièce/);
    expect(libelleJustificatifRetenue({ sans_justificatif: true, justificatif_document: null })).toBe("À déposer");
  });

  it("un ancien indicateur « sans justificatif » resté à vrai bloque aussi les deux (le décompte des retenues l'ignorait)", async () => {
    const d = await lesDeux([retenue("Plan de travail", "piece", { sans_justificatif: true })]);
    expect(refusDocumentIncomplet(d.restitution.document)?.manquants).toEqual(["justificatif de la retenue « Plan de travail » (un devis suffit)"]);
    expect(refusDocumentIncomplet(d.retenues.document)?.manquants).toEqual(["justificatif de la retenue « Plan de travail » (un devis suffit)"]);
  });

  it("la ligne « À renseigner » mène à la restitution du dépôt, dans les deux espaces", () => {
    const liens = [{ entite: "bail" as const, entiteId: "b1" }];
    const m = manqueJustificatifRetenue("Plan de travail");
    expect(lienPourManquant(m, "org", liens, "decompte_restitution", "/espace")).toEqual({ href: "/espace/org/baux/b1#restitution", ecran: "restitution du dépôt de garantie" });
    expect(lienPourManquant(m, "org", liens, "decompte_retenues")).toEqual({ href: "/agence/org/baux/b1#restitution", ecran: "restitution du dépôt de garantie" });
  });

  it("écran de la restitution : même règle, dite avant le geste ; le justificatif se joint encore après la finalisation", () => {
    const ecran = source("src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx");
    // Reprise du lot D3 (M1) : ce test figeait le filtre « montant > 0 », alors que le blocage des décomptes vaut pour
    // toutes les retenues. La fenêtre de finalisation les liste maintenant toutes (decisions-24-11-d3-reprise.test.ts).
    expect(ecran).toContain("retenuesSansPiece={retenues.filter(r => !retenueJustifiee(r))}");
    expect(ecran).toContain("{!retenueJustifiee(r) && (");
    expect(ecran).toContain("data-retenues-sans-justificatif");
    expect(ecran).toContain("Chaque retenue demande un justificatif : un devis suffit, comme une facture, un état des lieux ou des photos.");
    expect(ecran).toContain("data-justificatif-attendu");
    expect(ecran).toContain("Sans justificatif pour chaque retenue (un devis suffit), le décompte ne pourra pas être généré");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Q38 — la source du contrôle des repères fiscaux", () => {
  const REPONSE = { micro_foncier_plafond_euros: 15300, micro_foncier_abattement_pourcent: 31, verifie_le: "2026-11-24" };
  const SOURCE = "Site officiel fictif, page d’essai mise à jour le 01/01/2026";

  it("la source saisie : une ligne de 10 à 300 caractères, sans retour à la ligne ; sinon refusée", () => {
    expect(lireSourceSaisie(`  ${SOURCE}  `)).toBe(SOURCE);
    for (const refus of [undefined, null, 12, "", "trop peu", "a".repeat(301), "ligne une\nligne deux", "avec\ttabulation ici"]) {
      expect(lireSourceSaisie(refus), String(refus)).toBeNull();
    }
    expect(lireSourceSaisie("a".repeat(300))).toHaveLength(300);
  });

  it("la lecture rend la source enregistrée ; une source qui n'a pas la forme attendue rend l'ensemble illisible", () => {
    expect(lireReponseReperes({ ...REPONSE, source: SOURCE })).toEqual({ plafondEuros: 15300, abattementPourcent: 31, verifieLe: "2026-11-24", source: SOURCE });
    expect(lireReponseReperes({ ...REPONSE, source: null })?.source).toBeNull();
    expect(lireReponseReperes(REPONSE)?.source).toBeNull();
    expect(lireReponseReperes({ ...REPONSE, source: 42 })).toBeNull();
    expect(lireReponseReperes({ ...REPONSE, source: "court" })).toBeNull();
    expect(lireReponseReperes({ ...REPONSE, source: `${SOURCE}\n<script>` })).toBeNull();
  });

  it("le propriétaire lit la date ET la source ; sans source, la phrase d'avant ; sans date, aucune source n'est citée", () => {
    const base = { plafondEuros: 15300, abattementPourcent: 31 };
    expect(phrasesMicroFoncier({ ...base, verifieLe: "2026-11-24", source: SOURCE }).verification)
      .toBe(`Plafond et abattement vérifiés par Gerimmo le 24/11/2026 (source : ${SOURCE}). Une loi de finances peut les modifier : la notice officielle fait foi.`);
    expect(phrasesMicroFoncier({ ...base, verifieLe: "2026-11-24", source: null }).verification)
      .toBe("Plafond et abattement vérifiés par Gerimmo le 24/11/2026. Une loi de finances peut les modifier : la notice officielle fait foi.");
    expect(phrasesMicroFoncier({ ...base, verifieLe: null, source: SOURCE }).verification).not.toContain(SOURCE);
  });

  it("aucune valeur de production n'est écrite dans le code : ni date de contrôle, ni source", () => {
    for (const f of ["src/lib/reperes-fiscaux.ts", "src/app/actions/reperes-fiscaux.ts", "src/app/admin/parametres/reperes-fiscaux.tsx", "supabase/migrations/20261124190000_reperes_fiscaux_source.sql"]) {
      const sans = source(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
      expect(sans, f).not.toMatch(/bofip|impots\.gouv|06\/03\/2025|10\/07\/2026/i);
    }
    // La migration ne pose aucune ligne : elle ajoute une colonne vide et deux fonctions.
    const horsFonctions = source("supabase/migrations/20261124190000_reperes_fiscaux_source.sql").replace(/^\s*--.*$/gm, "").replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(horsFonctions).not.toMatch(/insert into|update public\./i);
  });
});
