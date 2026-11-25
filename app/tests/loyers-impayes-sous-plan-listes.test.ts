/**
 * Phase 3, lot 44 (reprise, C65) : les listes de loyers sous plan d'apurement en cours.
 *
 * Constat des relecteurs : dans un espace d'agence, la page « Loyers & charges » listait chaque terme non couvert avec
 * « Relancer sur le bail → » (carte « Impayés à relancer » et tableau du quittancement), sans lire aucun plan. Pour un bail
 * sous plan actif ou en défaut, l'écran invitait donc à relancer, puis le bail refusait d'enregistrer la relance (datée de
 * l'activation ou après) — la même incohérence que celle corrigée dans la fenêtre du lot et dans le suivi des loyers. Le même
 * tableau du quittancement sert les Finances du propriétaire (mois en cours).
 *
 * Désormais : chaque terme non couvert porte l'état du plan de son bail (marquerPlansApurement, même lecture que le suivi) ;
 * sous plan en cours, la liste dit « relances suspendues » et mène au plan ; plan illisible, aucune relance n'est proposée ;
 * sans plan, rien ne change. Rendu serveur (sans navigateur), base simulée.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LigneQuittancement } from "@/app/agence/[orgId]/comptabilite/quittancement-mois";

const banc = vi.hoisted(() => ({
  lignes: [] as Record<string, unknown>[],
  plans: [] as { bail_id: string }[],
  erreurPlans: null as { message: string } | null,
  lecturesPlans: [] as unknown[][],
}));

/** Une base simulée : le quittancement du mois (rpc) et les plans d'apurement en cours (table), filtres consignés. */
function base() {
  return {
    rpc: async (nom: string) => (nom === "quittancement_mois" ? { data: banc.lignes, error: null } : { data: [], error: null }),
    from: (table: string) => {
      const filtres: unknown[] = [];
      const chaine: Record<string, unknown> = {
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          if (table === "plans_apurement") banc.lecturesPlans.push(filtres);
          const r = table === "plans_apurement"
            ? { data: banc.erreurPlans ? null : banc.plans, error: banc.erreurPlans }
            : { data: [], error: null };
          return Promise.resolve(r).then(ok, ko);
        },
      };
      for (const op of ["select", "eq", "in", "limit", "order"]) chaine[op] = (...a: unknown[]) => { filtres.push([op, ...a]); return chaine; };
      return chaine;
    },
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: () => {},
}));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: base(), user: { id: "gerant" }, role: "admin_agence", estProprietaire: false }),
}));
vi.mock("@/app/actions/quittancement", () => ({
  encaisserReste: vi.fn(), emettreQuittanceBail: vi.fn(), envoyerQuittancesMois: vi.fn(),
}));
vi.mock("@/components/page-finances", () => ({ PageFinances: () => null }));

import PageLoyers from "@/app/agence/[orgId]/loyers/page";
import { marquerPlansApurement } from "@/lib/quittancement-du-mois";
import { gesteImpayeSelonPlan } from "@/lib/paliers-reception-loyer";

const ORG = "11111111-1111-4111-8111-111111111111";
const SOUS_PLAN = "22222222-2222-4222-8222-222222222222";
const SANS_PLAN = "33333333-3333-4333-8333-333333333333";
const PAYE = "44444444-4444-4444-8444-444444444444";

function ligne(bail: string, appel: string, locataire: string, du: number, couvert: number, statut: string): LigneQuittancement {
  return {
    bail_id: bail, appel_id: appel, lot_id: `lot-${appel}`, lot_nom: `Lot ${locataire}`, locataire, montant_du: du,
    montant_couvert: couvert, statut, quittance_id: null, est_quittance: null, email_envoye_at: null,
    dette_anterieure_periode: null, dette_anterieure_reste: null,
  };
}

const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/\s+/g, " ");

async function rendrePage() {
  const page = await PageLoyers({ params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never);
  return renderToStaticMarkup(page as ReactElement);
}

/** Le rang de la carte des impayés (un lien vers le bail) qui nomme ce locataire. */
function rangImpaye(html: string, locataire: string) {
  const rang = [...html.matchAll(/<li><a [^>]*?href="([^"]+)"[^>]*>(.*?)<\/a><\/li>/g)].find((m) => m[2].includes(locataire));
  expect(rang, locataire).toBeTruthy();
  return { href: rang![1], texte: texteDe(rang![2]) };
}

beforeEach(() => {
  banc.lignes = [
    ligne(SOUS_PLAN, "appel-plan", "Durand Lucie", 770.5, 0, "impaye"),
    ligne(SANS_PLAN, "appel-libre", "Martin Paul", 650, 0, "impaye"),
    ligne(PAYE, "appel-paye", "Petit Anne", 500, 500, "paye"),
  ];
  banc.plans = [{ bail_id: SOUS_PLAN }];
  banc.erreurPlans = null;
  banc.lecturesPlans = [];
});

describe("Le geste proposé pour un terme impayé selon le plan de son bail", () => {
  it("sous plan en cours : le plan, pas la relance", () => {
    expect(gesteImpayeSelonPlan("en_cours")).toEqual({
      ancre: "#plan-apurement", libelle: "Suivre le plan d’apurement dans le bail →", detail: "plan d’apurement en cours : relances suspendues",
    });
  });
  it("plan illisible : aucune relance proposée", () => {
    const geste = gesteImpayeSelonPlan("illisible");
    expect(geste.libelle).not.toMatch(/relancer/i);
    expect(geste.detail).toBe("plan d’apurement non vérifié : aucune relance proposée ici");
  });
  it("sans plan, ou plan non lu par l'appelant : la relance, comme avant", () => {
    for (const plan of ["aucun", undefined] as const) {
      expect(gesteImpayeSelonPlan(plan)).toEqual({ ancre: "#loyers", libelle: "Relancer sur le bail →", detail: null });
    }
  });
});

describe("marquerPlansApurement : l'état du plan sur chaque terme non couvert", () => {
  it("lit les plans en cours des seuls baux à terme non couvert, sous la RLS de l'appelant", async () => {
    const marquees = await marquerPlansApurement(base() as never, ORG, banc.lignes as LigneQuittancement[]);
    expect(marquees.map((l) => [l.locataire, l.plan_apurement])).toEqual([
      ["Durand Lucie", "en_cours"], ["Martin Paul", "aucun"], ["Petit Anne", undefined],
    ]);
    expect(banc.lecturesPlans).toEqual([[
      ["select", "bail_id"], ["eq", "organization_id", ORG], ["in", "bail_id", [SOUS_PLAN, SANS_PLAN]], ["in", "etat", ["actif", "en_defaut"]],
    ]]);
  });
  it("lecture impossible : « illisible » pour chaque terme non couvert", async () => {
    banc.erreurPlans = { message: "indisponible" };
    const marquees = await marquerPlansApurement(base() as never, ORG, banc.lignes as LigneQuittancement[]);
    expect(marquees.map((l) => l.plan_apurement)).toEqual(["illisible", "illisible", undefined]);
  });
  it("tout est couvert : aucune lecture", async () => {
    const lignes = [ligne(PAYE, "appel-paye", "Petit Anne", 500, 500, "paye")];
    expect(await marquerPlansApurement(base() as never, ORG, lignes)).toBe(lignes);
    expect(banc.lecturesPlans).toEqual([]);
  });
});

describe("« Loyers & charges » d'une agence : aucune relance proposée sous plan d'apurement", () => {
  it("le terme sous plan mène au plan et dit la suspension ; l'autre garde « Relancer sur le bail »", async () => {
    const html = await rendrePage();
    const plan = rangImpaye(html, "Durand Lucie");
    expect(plan.href).toBe(`/agence/${ORG}/baux/${SOUS_PLAN}#plan-apurement`);
    expect(plan.texte).toContain("plan d’apurement en cours : relances suspendues");
    expect(plan.texte).toContain("Suivre le plan d’apurement dans le bail →");
    expect(plan.texte).not.toContain("Relancer");
    const libre = rangImpaye(html, "Martin Paul");
    expect(libre.href).toBe(`/agence/${ORG}/baux/${SANS_PLAN}#loyers`);
    expect(libre.texte).toContain("Relancer sur le bail →");
    const texte = texteDe(html);
    // La tuile ne compte plus le terme sous plan « à relancer » ; la carte ne se dit plus « à relancer » et dit pourquoi.
    expect(texte).toContain("1 locataire à relancer · 1 sous plan d’apurement");
    expect(texte).toContain("Impayés du mois");
    expect(texte).not.toContain("Impayés à relancer");
    expect(texte).toContain("Sous un plan d’apurement en cours, les relances sont suspendues jusqu’à sa fin (dette soldée, plan caduc ou annulé).");
    // Le tableau du quittancement : un seul « Relancer sur le bail » (celui du bail sans plan), dans la carte et le tableau.
    expect(html).toContain(`href="/agence/${ORG}/baux/${SOUS_PLAN}#plan-apurement"`);
    const relances = [...html.matchAll(/href="([^"]+)"[^>]*>Relancer sur le bail →/g)].map((m) => m[1]);
    expect(relances.length).toBeGreaterThan(0);
    expect(new Set(relances)).toEqual(new Set([`/agence/${ORG}/baux/${SANS_PLAN}#loyers`]));
  });

  it("sans plan en cours : l'écran d'avant, mot pour mot", async () => {
    banc.plans = [];
    const html = await rendrePage();
    const texte = texteDe(html);
    expect(texte).toContain("Impayés à relancer");
    expect(texte).toContain("2 locataires à relancer");
    expect(texte).not.toMatch(/plan d’apurement/);
    expect(rangImpaye(html, "Durand Lucie").href).toBe(`/agence/${ORG}/baux/${SOUS_PLAN}#loyers`);
    expect(rangImpaye(html, "Durand Lucie").texte).toContain("Relancer sur le bail →");
  });

  it("plans illisibles : aucune relance proposée, et l'écran le dit", async () => {
    banc.erreurPlans = { message: "indisponible" };
    const html = await rendrePage();
    const texte = texteDe(html);
    expect(texte).not.toContain("Relancer sur le bail");
    expect(texte).not.toContain("à relancer ·");
    expect(texte).toContain("2 termes non couverts · plans d’apurement à vérifier");
    expect(texte).toContain("Impossible de vérifier les plans d’apurement : aucune relance n’est proposée ici.");
  });
});
