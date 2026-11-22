/**
 * REPRISE DES COMPTES : LA REPRISE OUVERTE SE RETROUVE ET S'ABANDONNE — audit palier 1 du 22/11/2026, P1-02.
 *
 * Le défaut : l'identifiant de la reprise ouverte ne vivait que dans le formulaire. Après un premier « Contrôler »,
 * un rechargement le perdait ; le clic suivant tentait d'en ouvrir une seconde, que la base refuse — écran bloqué,
 * sans bouton pour abandonner. Second défaut, trouvé en corrigeant : la reprise garde la date et la trésorerie de son
 * ouverture (seules lues par la base), alors que l'écran laissait les modifier et calculait l'écart sur la saisie.
 *
 * Sans base (les règles de la base ont leur test : reprise-comptable.test.ts). Tient :
 *  1. le contrôle retrouve la reprise ouverte en base, même sans identifiant dans le formulaire ;
 *  2. date ou trésorerie changée : un contrôle repart d'une reprise neuve (l'ancienne est abandonnée d'abord) ;
 *     une bascule est refusée, sans rien écrire, tant qu'on n'a pas recontrôlé ;
 *  3. on ne bascule que la reprise ouverte qu'on vient de contrôler ;
 *  4. l'abandon : réservé au responsable, honnête quand rien n'a été abandonné, écran rafraîchi ;
 *  5. l'écran annonce la reprise en cours, avec sa date et sa trésorerie, et propose de l'abandonner.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ouverte = { id: string; date_bascule: string; tresorerie_annoncee: number | string };
const banc = vi.hoisted(() => ({
  rpc: vi.fn(), revalidatePath: vi.fn(), role: "proprietaire_direct" as string | null,
  ouvertes: [] as unknown[], erreurLecture: null as { message: string } | null, filtres: [] as unknown[][],
}));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => {
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "eq", "in", "order"]) q[methode] = (...args: unknown[]) => { banc.filtres.push([methode, ...args]); return q; };
    q.limit = async () => ({ data: banc.erreurLecture ? null : banc.ouvertes, error: banc.erreurLecture });
    return { user: { id: "responsable" }, role: banc.role, supabase: { rpc: banc.rpc, from: (table: string) => { banc.filtres.push(["from", table]); return q; } } };
  },
}));

import { abandonnerReprise, reprendreSoldes } from "@/app/actions/reprise-comptable";
import { FormulaireReprise } from "@/app/agence/[orgId]/comptabilite/reprise/formulaire-reprise";

const ORG = "3c1d2f4a-0000-4000-8000-000000000001";
const ANCIENNE = "3c1d2f4a-0000-4000-8000-0000000000a1";
const NEUVE = "3c1d2f4a-0000-4000-8000-0000000000b2";
const CSV = "type,montant\ndepot_garantie,700";
const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const jouer = (champs: Record<string, string> = {}) =>
  reprendreSoldes(ORG, {}, formulaire({ contenu: CSV, nom_fichier: "balance.csv", date_bascule: "2026-11-01", tresorerie: "42000,50", ...champs }));
const appels = (fonction?: string) => banc.rpc.mock.calls.filter(([nom]) => !fonction || nom === fonction).map(([nom, args]) => [nom, args]);
const ouverte = (patch: Partial<Ouverte> = {}): Ouverte => ({ id: ANCIENNE, date_bascule: "2026-11-01", tresorerie_annoncee: "42000.50", ...patch });

beforeEach(() => {
  vi.clearAllMocks();
  banc.role = "proprietaire_direct"; banc.ouvertes = []; banc.erreurLecture = null; banc.filtres = [];
  banc.rpc.mockImplementation(async (nom: string) => nom === "ouvrir_reprise" ? { data: NEUVE, error: null }
    : nom === "abandonner_reprise" ? { data: true, error: null } : { data: [], error: null });
});

describe("contrôle : la reprise ouverte se lit en base", () => {
  it("aucune reprise ouverte : elle s'ouvre, puis se contrôle", async () => {
    const r = await jouer();
    expect(r.erreur).toBeUndefined();
    expect(appels().map(([nom]) => nom)).toEqual(["ouvrir_reprise", "reprendre_soldes"]);
    expect(appels("ouvrir_reprise")[0][1]).toEqual({ p_org: ORG, p_date_bascule: "2026-11-01", p_tresorerie: 42000.5, p_source: "balance.csv" });
    expect(appels("reprendre_soldes")[0][1]).toMatchObject({ p_org: ORG, p_reprise: NEUVE, p_controle_seulement: true });
    expect(r).toMatchObject({ reprise: NEUVE, controle: true, basculee: false });
    // La lecture ne porte que sur les reprises ouvertes de CET espace.
    expect(banc.filtres).toEqual(expect.arrayContaining([["from", "reprises_portefeuille"], ["eq", "organization_id", ORG], ["in", "statut", ["en_cours", "controle"]]]));
  });

  it("après un rechargement (aucun identifiant dans le formulaire) : la reprise ouverte est reprise, pas rouverte", async () => {
    banc.ouvertes = [ouverte()];
    const r = await jouer();
    expect(r.erreur).toBeUndefined();
    expect(appels().map(([nom]) => nom)).toEqual(["reprendre_soldes"]);
    expect(appels("reprendre_soldes")[0][1]).toMatchObject({ p_reprise: ANCIENNE, p_controle_seulement: true });
    expect(r.reprise).toBe(ANCIENNE);
  });

  it("la trésorerie se compare au centime, quelle que soit l'écriture", async () => {
    for (const stockee of [42000.5, "42000.50", "42000.5"]) {
      vi.clearAllMocks();
      banc.ouvertes = [ouverte({ tresorerie_annoncee: stockee })];
      await jouer({ tresorerie: "42000.50" });
      expect(appels().map(([nom]) => nom), String(stockee)).toEqual(["reprendre_soldes"]);
    }
  });

  it.each([
    ["la trésorerie", { tresorerie: "42500" }, { p_date_bascule: "2026-11-01", p_tresorerie: 42500 }],
    ["la date de bascule", { date_bascule: "2026-12-01" }, { p_date_bascule: "2026-12-01", p_tresorerie: 42000.5 }],
  ])("%s a changé : l'ancienne reprise est abandonnée, puis une neuve s'ouvre sous les nouvelles valeurs", async (_libelle, champs, attendu) => {
    banc.ouvertes = [ouverte()];
    const r = await jouer({ ...champs, reprise: ANCIENNE });
    expect(r.erreur).toBeUndefined();
    expect(appels().map(([nom]) => nom)).toEqual(["abandonner_reprise", "ouvrir_reprise", "reprendre_soldes"]);
    expect(appels("abandonner_reprise")[0][1]).toEqual({ p_org: ORG, p_reprise: ANCIENNE });
    expect(appels("ouvrir_reprise")[0][1]).toMatchObject(attendu);
    expect(appels("reprendre_soldes")[0][1]).toMatchObject({ p_reprise: NEUVE });
    expect(r.reprise).toBe(NEUVE);
  });

  it("si l'abandon de l'ancienne échoue, rien d'autre n'est tenté", async () => {
    banc.ouvertes = [ouverte()];
    banc.rpc.mockImplementation(async (nom: string) => nom === "abandonner_reprise" ? { data: null, error: { message: "Abandon impossible pour le moment" } } : { data: NEUVE, error: null });
    const r = await jouer({ tresorerie: "1" });
    expect(r.erreur).toBe("Abandon impossible pour le moment");
    expect(appels().map(([nom]) => nom)).toEqual(["abandonner_reprise"]);
  });

  it("si la reprise en cours ne peut pas être lue, rien n'est ouvert ni contrôlé, et la saisie est rendue", async () => {
    banc.erreurLecture = { message: "panne" };
    const r = await jouer();
    expect(r.erreur).toMatch(/n’a pas pu être vérifiée/);
    expect(r).toMatchObject({ contenu: CSV, fichier: "balance.csv", dateBascule: "2026-11-01", tresorerieAnnoncee: 42000.5 });
    expect(banc.rpc).not.toHaveBeenCalled();
  });
});

describe("bascule : seulement la reprise qu'on vient de contrôler, sous les valeurs contrôlées", () => {
  it("reprise ouverte, mêmes valeurs, même identifiant : la bascule part", async () => {
    banc.ouvertes = [ouverte()];
    const r = await jouer({ bascule: "1", reprise: ANCIENNE });
    expect(r.erreur).toBeUndefined();
    expect(appels()).toEqual([["reprendre_soldes", expect.objectContaining({ p_reprise: ANCIENNE, p_controle_seulement: false })]]);
    expect(r).toMatchObject({ basculee: true, controle: false });
    expect(banc.revalidatePath).toHaveBeenCalled();
  });

  it.each([
    ["la trésorerie a changé depuis le contrôle", [ouverte()], { tresorerie: "42500", reprise: ANCIENNE }, /ont changé depuis le dernier contrôle/],
    ["la date a changé depuis le contrôle", [ouverte()], { date_bascule: "2026-12-01", reprise: ANCIENNE }, /ont changé depuis le dernier contrôle/],
    ["aucune reprise n'est plus ouverte", [], { reprise: ANCIENNE }, /n’est plus celle que vous avez contrôlée/],
    ["le formulaire porte une autre reprise", [ouverte()], { reprise: NEUVE }, /n’est plus celle que vous avez contrôlée/],
  ])("%s : refus, aucune écriture, la saisie est rendue", async (_libelle, ouvertes, champs, attendu) => {
    banc.ouvertes = ouvertes;
    const r = await jouer({ bascule: "1", ...champs });
    expect(r.erreur).toMatch(attendu);
    expect(r.contenu).toBe(CSV);
    expect(r.basculee).toBeUndefined();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("abandonner une reprise", () => {
  it("réservé au responsable : un agent ne peut pas, la base n'est pas appelée", async () => {
    banc.role = "agent";
    expect(await abandonnerReprise(ORG, ANCIENNE)).toEqual({ erreur: "Réservé au responsable de l'organisation." });
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("abandonnée : l'écran est rafraîchi sous ses deux adresses", async () => {
    expect(await abandonnerReprise(ORG, ANCIENNE)).toEqual({});
    expect(appels()).toEqual([["abandonner_reprise", { p_org: ORG, p_reprise: ANCIENNE }]]);
    expect(banc.revalidatePath.mock.calls.map(([chemin]) => chemin)).toEqual([`/agence/${ORG}/comptabilite/reprise`, `/espace/${ORG}/comptabilite/reprise`]);
  });

  it("rien n'a été abandonné (déjà basculée, déjà abandonnée) : l'action le dit, sans rafraîchir", async () => {
    banc.rpc.mockResolvedValue({ data: false, error: null });
    expect((await abandonnerReprise(ORG, ANCIENNE)).erreur).toMatch(/n’est plus en cours/);
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it("un refus de la base est rendu en clair", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Abandon refusé pour cet espace" } });
    expect(await abandonnerReprise(ORG, ANCIENNE)).toEqual({ erreur: "Abandon refusé pour cet espace" });
  });
});

describe("écran", () => {
  it("reprise en cours : annoncée avec sa date et sa trésorerie, champs repris, bouton « Abandonner »", () => {
    const html = renderToStaticMarkup(createElement(FormulaireReprise, { orgId: ORG, ouverte: { id: ANCIENNE, dateBascule: "2026-11-01", tresorerie: 42000.5 } }));
    expect(html).toContain("data-reprise-en-cours");
    expect(html).toContain("Une reprise est en cours");
    expect(html).toContain("date de bascule du 01/11/2026");
    expect(html).toMatch(/trésorerie annoncée 42[\s  ]000,50[\s ]€/);
    expect(html).toContain("Rien n’est encore écrit");
    expect(html).toContain("Abandonner cette reprise");
    expect(html).toMatch(/<input[^>]*name="date_bascule"[^>]*value="2026-11-01"/);
    expect(html).toMatch(/<input[^>]*name="tresorerie"[^>]*value="42000.5"/);
  });

  it("aucune reprise en cours : ni annonce ni bouton", () => {
    for (const html of [renderToStaticMarkup(createElement(FormulaireReprise, { orgId: ORG })), renderToStaticMarkup(createElement(FormulaireReprise, { orgId: ORG, ouverte: null }))]) {
      expect(html).not.toContain("Une reprise est en cours");
      expect(html).not.toContain("Abandonner cette reprise");
      expect(html).toContain("Contrôler la balance");
    }
  });

  it("la page transmet au formulaire la reprise ouverte qu'elle a lue", () => {
    const page = readFileSync("src/app/agence/[orgId]/comptabilite/reprise/page.tsx", "utf8");
    expect(page).toContain('passees.find((r) => r.statut === "en_cours" || r.statut === "controle")');
    expect(page).toMatch(/<FormulaireReprise\s+orgId=\{orgId\}\s+ouverte=\{ouverte \? \{/);
  });
});
