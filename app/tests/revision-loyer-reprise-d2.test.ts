/**
 * RÉVISION DU LOYER — décisions du dirigeant du 24/11/2026, lot D2, REPRISE après relecture : lettre, écran, affichages.
 * (La base est tenue par tests/revision-loyer-reprise-d2-base.test.ts.)
 *
 *  1. Lettre d'une révision calculée sur un an avec l'indice de l'année précédente (révision d'une année non faite) : elle
 *     imprime les deux indices réellement utilisés et le dit de façon neutre ; la lettre du cas normal ne change pas.
 *  3. Demande antidatée : la lettre dit que le premier terme révisé suit aussi l'enregistrement, avec sa date.
 *  4. Tant que le premier terme révisé n'est pas commencé, l'attestation de loyer, le dossier CAF, l'attestation du
 *     locataire et son espace affichent le loyer du terme en cours et annoncent le suivant (une seule fonction partagée).
 *  5. Le courrier adressé au locataire ne renvoie plus à la fiche Service-Public ; établi après le début du premier terme
 *     révisé, il le dit avec les dates réelles.
 *  6. L'aperçu du formulaire calcule comme la base ; le champ de l'indice de l'année précédente n'apparaît que s'il faut.
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/documents/modeles/communs", async (original) => ({
  ...(await original<typeof import("@/lib/documents/modeles/communs")>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerRevisionIrl, construireRevisionIrl, type DonneesRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { Fusion } from "@/lib/documents/gabarit";
import { loyerDuTermeEnCours } from "@/lib/baux";
import { contexte as fabriquerContexte } from "./fixtures/contexte-document";

type Ligne = Record<string, unknown>;
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>|<\/(td|th|div|p|h1|h2)>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");
/** Une base simulée : chaque table rend ses lignes (filtres ignorés), `maybeSingle` la première. */
const base = (tables: Record<string, Ligne[]>) => {
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
};
const le = (jour: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(`${jour}T10:00:00Z`)); };
afterEach(() => { vi.useRealTimers(); });

/**
 * Le cas du relecteur : bail du 15/10/2023, indice de référence T2 2023 = 100, aucune révision en 2024. Le 24/11/2025,
 * révision avec l'indice T2 2025 = 106 et l'indice T2 2024 = 103 : 700 × 106 / 103 = 720,39 € (plus 742 €).
 */
const anneeSautee = (sur: Partial<DonneesRevisionIrl> = {}): DonneesRevisionIrl => ({
  reference: "IRL-1", dateEffet: "2025-11-24", dateEcheance: "2025-10-15", dateDemande: "2025-11-24", premierTerme: "2025-12-01", enregistreLe: "2025-11-24",
  trimestreNouveau: "T2 2025", referenceAnneePrecedente: "T2 2024",
  ancienLoyer: 700, nouveauLoyer: 720.39, irlReference: 103, irlNouveau: 106, trimestre: "T2 2023", charges: 50, chargesMode: "provision",
  bailleurNom: "Fictive Jeanne", locatairesNoms: "Fictif Hugo", logementAdresse: "3 place des Essais, 69007 Lyon", referenceBail: "BAIL-1",
  exp: { nom: "Fictive Jeanne", adresse: "12 rue des Essais, 69003 Lyon", email: null, telephone: null, ville: "Lyon", emetteur: "detenteurs" },
  f: new Fusion(), ...sur,
});
/** La même révision faite chaque année : référence T2 2024 (révision précédente), un an d'écart. */
const aLHeure = (sur: Partial<DonneesRevisionIrl> = {}) => anneeSautee({
  referenceAnneePrecedente: null, trimestre: "T2 2023", irlReference: 103, irlNouveau: 106, ancienLoyer: 721, nouveauLoyer: 742,
  origineReference: { revisionDu: "2024-10-15", trimestre: "T2 2024" }, dateDemande: "2025-10-15", dateEffet: "2025-10-15", premierTerme: "2025-11-01", enregistreLe: "2025-10-15", ...sur,
});
const lettre = (d: DonneesRevisionIrl) => texteDe(construireRevisionIrl(d).html);

describe("point 1 — lettre d'une révision calculée sur un an (révision de l'année précédente non faite)", () => {
  it("elle imprime les deux indices réellement utilisés, le calcul sur un an, et dit de façon neutre ce qui s'est passé", () => {
    le("2025-11-24");
    const texte = lettre(anneeSautee());
    expect(texte).toContain("La révision annuelle de l'année précédente n'a pas été appliquée ; elle n'est pas rattrapée. Le calcul porte sur une seule année : de l'indice du T2 2024 (même trimestre, année précédente) à l'indice du T2 2025.");
    expect(texte).toContain("Nouvel indice retenu 106,00");
    expect(texte).toContain("Indice de référence (même trimestre de l'année précédente, T2 2024) 103,00");
    expect(texte).toContain("Variation 2,91 %");
    expect(texte).toContain("700,00 € × 106,00 / 103,00 = 720,39 €");
    expect(texte).toContain("Loyer hors charges révisé, appelé à compter du terme de décembre 2025 720,39 €");
    // Ni l'ancien montant du rattrapage, ni l'indice du bail dans le calcul, ni reproche, ni mot de droit ajouté.
    expect(texte).not.toMatch(/742|100,00|renonc|perdu|prescri|faute|oubli/);
    expect(texte.match(/article/gi)).toHaveLength(1);
  });

  it("révision faite chaque année : la lettre ne change pas (aucune phrase sur une année non appliquée)", () => {
    le("2025-10-15");
    const texte = lettre(aLHeure());
    expect(texte).not.toContain("n'a pas été appliquée");
    expect(texte).toContain("Indice de référence (indice de la révision du 15/10/2024, T2 2024) 103,00");
    expect(texte).toContain("721,00 € × 106,00 / 103,00 = 742,00 €");
  });

  it("assemblage depuis la base : le trimestre de l'indice de l'année précédente et le jour d'enregistrement sont lus sur la révision", async () => {
    le("2025-11-24");
    const ctx = fabriquerContexte();
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx as never);
    const revision = { id: "rev-0001", bail_id: ctx.bail.id, date_effet: "2025-11-24", date_echeance: "2025-10-15", date_demande: "2025-11-24", premier_terme: "2025-12-01",
      irl_trimestre: "T2 2025", ancien_loyer: 700, nouveau_loyer: 720.39, irl_reference: 103, irl_nouveau: 106, irl_reference_trimestre: "T2 2024", created_at: "2025-11-24T09:30:00+01:00" };
    const r = await assemblerRevisionIrl(base({ revisions_loyer: [revision] }), "org", "rev-0001");
    if (!("document" in r)) throw new Error(JSON.stringify(r));
    expect(texteDe(r.document.html)).toContain("Indice de référence (même trimestre de l'année précédente, T2 2024) 103,00");
    expect(readFileSync("src/lib/documents/modeles/revision-irl.ts", "utf8")).toContain("irl_reference, irl_nouveau, irl_reference_trimestre, created_at\")");
  });
});

describe("points 3 et 5 — la lettre reste exacte : demande antidatée, courrier établi après le premier terme, pas de renvoi à une fiche", () => {
  it("demande datée du 30/11 enregistrée le 02/12 : le premier terme (janvier) suit la demande ET l'enregistrement, dont la date est dite", () => {
    le("2025-12-02");
    const texte = lettre(aLHeure({ dateDemande: "2025-11-30", dateEffet: "2025-11-30", enregistreLe: "2025-12-02", premierTerme: "2026-01-01" }));
    expect(texte).toContain("Le bailleur l'a demandée le 30/11/2025, après cette date. Le présent courrier est établi le 02/12/2025.");
    expect(texte).toContain("Il s'applique à partir du terme de janvier 2026 (période commençant le 01/01/2026), premier terme dont la période commence après la date de la demande et après l'enregistrement de la révision (02/12/2025).");
    expect(texte).toContain("Le terme de décembre 2025 et les termes antérieurs ne sont pas modifiés par cette révision");
    // Rien n'est attribué à des termes « déjà appelés » : ce n'est pas la raison du décalage.
    expect(texte).not.toContain("qui n'était pas déjà appelé");
  });

  it("demande et enregistrement le même mois : la phrase d'avant, mot pour mot", () => {
    le("2025-12-03");
    const texte = lettre(aLHeure({ dateDemande: "2025-12-02", dateEffet: "2025-12-02", enregistreLe: "2025-12-03", premierTerme: "2026-01-01" }));
    expect(texte).toContain("premier terme dont la période commence après la date de la demande. Le terme de décembre 2025");
    expect(texte).not.toContain("après l'enregistrement");
  });

  it("courrier établi après le début du premier terme révisé : il le dit, avec les dates réelles", () => {
    le("2026-01-08");
    const texte = lettre(aLHeure({ dateDemande: "2025-12-02", dateEffet: "2025-12-02", enregistreLe: "2025-12-02", premierTerme: "2026-01-01" }));
    expect(texte).toContain("Le bailleur l'a demandée le 02/12/2025, après cette date. Le présent courrier est établi le 08/01/2026, après le début du premier terme appelé au loyer révisé (période commençant le 01/01/2026).");
    // Établi avant ce terme : la phrase d'avant.
    le("2025-12-20");
    expect(lettre(aLHeure({ dateDemande: "2025-12-02", dateEffet: "2025-12-02", enregistreLe: "2025-12-02", premierTerme: "2026-01-01" })))
      .toContain("Le présent courrier est établi le 20/12/2025. Le loyer révisé");
  });

  it("aucun renvoi à la fiche Service-Public dans le courrier ; il reste dans l'aide du formulaire et dans le refus de la base", () => {
    le("2025-11-24");
    for (const texte of [lettre(anneeSautee()), lettre(aLHeure())]) expect(texte).not.toMatch(/Service-Public|fiche officielle|consultée le/);
    const modele = readFileSync("src/lib/documents/modeles/revision-irl.ts", "utf8").replace(/\/\/.*$/gm, "");
    expect(modele).not.toMatch(/Service-Public|consultée le/);
    expect(readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8")).toContain("selon la fiche officielle Service-Public");
    expect(readFileSync("supabase/migrations/20261124100000_revision_loyer_delai_et_premier_terme.sql", "utf8")).toContain("selon la fiche officielle Service-Public consultée le 24/11/2026");
  });
});

describe("point 4 — le loyer affiché avant le premier terme révisé", () => {
  const revision = { ancien_loyer: 700, nouveau_loyer: 714, premier_terme: "2026-01-01" };

  it("la fonction partagée : loyer du terme en cours, puis annonce du loyer révisé avec son terme", () => {
    // Révision enregistrée le 03/12/2025, premier terme janvier 2026 : en décembre, le loyer du terme en cours est 700 €.
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03")).toEqual({ loyer: 700, aVenir: { loyer: 714, premierTerme: "2026-01-01", dernierTermeAvant: "2025-12-01" } });
    // Dès le premier terme révisé : le loyer du bail, plus d'annonce.
    expect(loyerDuTermeEnCours(714, [revision], "2026-01-01")).toEqual({ loyer: 714, aVenir: null });
    // Révision d'avant le 24/11 (sans premier terme), ou pas de révision : le loyer du bail.
    expect(loyerDuTermeEnCours(714, [{ ...revision, premier_terme: null }], "2025-12-03")).toEqual({ loyer: 714, aVenir: null });
    expect(loyerDuTermeEnCours(714, [], "2025-12-03")).toEqual({ loyer: 714, aVenir: null });
    // Le bail ne porte pas le loyer de la révision en attente (un avenant est passé depuis) : rien n'est déduit.
    expect(loyerDuTermeEnCours(800, [revision], "2025-12-03")).toEqual({ loyer: 800, aVenir: null });
    // Loyer inchangé par la révision : rien à annoncer. Loyer non fixé : rien non plus.
    expect(loyerDuTermeEnCours(700, [{ ...revision, nouveau_loyer: 700 }], "2025-12-03")).toEqual({ loyer: 700, aVenir: null });
    expect(loyerDuTermeEnCours(null, [revision], "2025-12-03")).toEqual({ loyer: null, aVenir: null });
    // Les montants de la base arrivent en texte.
    expect(loyerDuTermeEnCours("714.00", [{ ancien_loyer: "700.00", nouveau_loyer: "714.00", premier_terme: "2026-01-01" }], "2025-12-31").loyer).toBe(700);
  });

  describe("attestation de loyer et dossier CAF", () => {
    let ctx: ContexteBail;
    beforeEach(() => {
      ctx = fabriquerContexte();
      ctx.bail.etat = "actif";
      ctx.bail.loyer_hc = 714;
      vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
    });
    const options = { destinataire: "CAF du Rhône", allocataire: "1234567" };
    const document = async (code: "attestation_loyer" | "attestation_caf", revisions: Ligne[]) => {
      const r = await assemblerComplementBail(code, base({ revisions_loyer: revisions }), "org", "b1", options);
      if ("erreur" in r) throw new Error(r.erreur);
      return texteDe(r.document.html);
    };

    it.each(["attestation_loyer", "attestation_caf"] as const)("%s : avant le premier terme révisé, le loyer du terme en cours et l'annonce du suivant", async (code) => {
      le("2025-12-03");
      expect(await document(code, [revision])).toContain("Loyer mensuel hors charges : 700,00 € jusqu’au terme de décembre 2025, 714,00 € à compter du terme de janvier 2026 (révision annuelle du loyer) ; charges mensuelles :");
    });

    it.each(["attestation_loyer", "attestation_caf"] as const)("%s : sans révision en attente, ou une fois le premier terme commencé, le loyer du bail comme avant", async (code) => {
      le("2025-12-03");
      expect(await document(code, [])).toContain("Loyer mensuel hors charges : 714,00 € ; charges mensuelles :");
      le("2026-01-02");
      expect(await document(code, [revision])).toContain("Loyer mensuel hors charges : 714,00 € ; charges mensuelles :");
    });
  });

  it("l'attestation du locataire et son espace lisent les révisions du bail et passent par la même fonction", () => {
    for (const page of ["src/app/attestation-loyer/[orgId]/page.tsx", "src/app/locataire/[orgId]/logement/page.tsx"]) {
      const code = readFileSync(page, "utf8");
      expect(code, page).toContain('supabase.rpc("revisions_de_mon_loyer_locataire", { p_org: orgId })');
      expect(code, page).toContain("loyerDuTermeEnCours(");
      expect(code, page).toContain("duTerme.aVenir &&");
    }
    // Le loyer affiché n'est plus lu directement sur le bail.
    expect(readFileSync("src/app/attestation-loyer/[orgId]/page.tsx", "utf8")).toContain("Number(duTerme.loyer ?? 0) + Number(bail.charges ?? 0)");
    expect(readFileSync("src/app/locataire/[orgId]/logement/page.tsx", "utf8")).toContain("{eur(Number(duTerme.loyer ?? 0))} + {eur(Number(bail.charges ?? 0))} de");
  });
});

describe("points 1 et 6 — formulaire de révision", () => {
  const formulaire = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8");

  it("le champ de l'indice de l'année précédente n'apparaît que si l'année saisie dépasse de plus d'un an celle de la référence", () => {
    expect(formulaire).toContain("const anneeSautee = anneeReference !== null && Number.isFinite(anneeSaisie) && anneeSaisie > anneeReference + 1;");
    expect(formulaire).toContain("{anneeSautee && (\n              <div className=\"space-y-1\" data-irl-precedent>");
    expect(formulaire).toContain('name="irl_precedent"');
    expect(formulaire).toContain("Elle n&apos;est pas rattrapée : le loyer se révise sur un an");
  });

  it("l'aperçu suit la date de demande saisie et dit le refus quand la base refuserait", () => {
    expect(formulaire).toContain("surChangement={setDateDemandeSaisie}");
    expect(formulaire).toContain("const datesDuJour = aujourdhui ? datesRevisionIrl(dateDebut, demandeApercu) : null;");
    expect(formulaire).toContain("n&apos;a pas encore eu lieu : elle serait refusée.");
    expect(formulaire).toContain("est passé, elle serait refusée.");
  });
});

describe("refus de la base — ils arrivent entiers à l'écran, sans mot technique ni article", () => {
  it("indice de l'année précédente obligatoire ; bail terminé", async () => {
    const { sansJargon } = await import("@/lib/erreurs");
    const migration = readFileSync("supabase/migrations/20261124130000_revision_loyer_reprise_d2.sql", "utf8");
    expect(migration).toContain("raise exception 'Révision refusée : ce bail est terminé, son loyer ne se révise plus';");
    for (const message of [
      "Indice du T2 2024 obligatoire : l'indice de référence de ce bail est celui de 2023, la révision d'une année au moins n'a pas été faite. Elle n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente (T2 2024). Saisissez cet indice",
      "Révision refusée : ce bail est terminé, son loyer ne se révise plus",
    ]) {
      expect(sansJargon(message)).toBe(message);
      expect(message).not.toMatch(/art\.|article/i);
    }
  });
});
