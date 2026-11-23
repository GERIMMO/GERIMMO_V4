/**
 * Phase 3, lot 44 (C65, second tour) — la fenêtre du lot pendant un plan d'apurement.
 *
 * La reprise du lot 39 avait retiré la relance suivante du tableau de bord et de la liste « Vérifications » sous plan, mais
 * la fenêtre du lot (ouverte depuis le parc) ne lisait aucun plan : dès qu'un impayé était échu, son bandeau proposait
 * « Relancer », « Seconde relance » ou « Mise en demeure (LRAR) », et le clic l'enregistrait. Ici :
 *  - le cran suivant n'est proposé que si le bail n'a AUCUN plan en cours (plan lu, pas illisible, pas en attente) ;
 *  - sous plan, la fenêtre dit la suspension avec la phrase du suivi des loyers et mène au plan dans le bail ;
 *  - la lecture du plan est celle du suivi (lirePlansApurementEnCours), sous la session de l'utilisateur.
 * Chaque cas échouait avant le correctif.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ plans: [] as { bail_id: string }[], erreur: null as { message: string } | null, filtres: [] as unknown[][] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chaine: Record<string, unknown> = {
        then: (ok: (x: unknown) => unknown) =>
          Promise.resolve(table === "plans_apurement" ? { data: banc.erreur ? null : banc.plans, error: banc.erreur } : { data: [], error: null }).then(ok),
      };
      for (const op of ["select", "eq", "in"]) chaine[op] = (...a: unknown[]) => { banc.filtres.push([table, op, ...a]); return chaine; };
      return chaine;
    },
  }),
}));
vi.mock("@/app/actions/loyers", () => ({ ajouterEncaissement: vi.fn(), ajouterRelance: vi.fn() }));

import { GestesImpaye, type EtatPlanDuBail } from "@/components/fenetre-lot";
import { chargerPlanApurementEnCours, type EchelonRelance } from "@/app/actions/fiche-lot";
import { RELANCES_SUSPENDUES_SOUS_PLAN } from "@/lib/paliers-reception-loyer";

const echelon = (niveau: string, rang: number, libelle: string, envoye_le: string | null = null): EchelonRelance =>
  ({ niveau, rang, libelle, envoye_le, premiere_presentation: null, recommande: null });
const echelle = (franchis: number) => [
  echelon("relance_1", 1, "Relance simple", franchis > 0 ? "2026-10-12" : null),
  echelon("relance_2", 2, "Seconde relance", franchis > 1 ? "2026-10-26" : null),
  echelon("mise_en_demeure", 3, "Mise en demeure (LRAR)", franchis > 2 ? "2026-11-09" : null),
];
const rendre = (plan: EtatPlanDuBail | null, franchis = 0) =>
  renderToStaticMarkup(createElement(GestesImpaye, { orgId: "org", bailId: "bail", echelle: echelle(franchis), plan, rafraichir: () => {} }));
const boutonRelance = /<button[^>]*type="submit"[^>]*>[^<]*(Relancer|Seconde relance|Mise en demeure)/;

beforeEach(() => {
  banc.plans = [];
  banc.erreur = null;
  banc.filtres = [];
});

describe("fenêtre du lot : pas de relance proposée sous plan d'apurement (lot 44)", () => {
  it("bail sans plan : le cran suivant reste proposé, comme avant", () => {
    for (const franchis of [0, 1, 2]) expect(rendre("aucun", franchis)).toMatch(boutonRelance);
    expect(rendre("aucun", 0)).toMatch(/>Relancer</);
    expect(rendre("aucun", 1)).toContain(">Seconde relance<");
    const html = rendre("aucun", 2);
    expect(html).toContain(">Mise en demeure (LRAR)<");
    expect(html).toContain("La mise en demeure part en recommandé");
    expect(html).not.toContain(RELANCES_SUSPENDUES_SOUS_PLAN);
  });
  it("plan en cours (actif ou en défaut) : ni bouton de relance ni recommandé, la suspension dite et le plan à suivre dans le bail", () => {
    for (const franchis of [0, 1, 2]) {
      const html = rendre("en_cours", franchis);
      expect(html).not.toMatch(boutonRelance);
      expect(html).not.toContain("La mise en demeure part en recommandé");
      expect(html).toContain(RELANCES_SUSPENDUES_SOUS_PLAN);
      expect(html).toContain('href="/agence/org/baux/bail#plan-apurement"');
      // Le règlement partiel, lui, reste possible.
      expect(html).toContain("Règlement partiel");
    }
  });
  it("plan pas encore lu ou illisible : aucune relance proposée", () => {
    expect(rendre(null)).not.toMatch(boutonRelance);
    const illisible = rendre("illisible");
    expect(illisible).not.toMatch(boutonRelance);
    expect(illisible).toContain("Impossible de vérifier le plan d’apurement de ce bail : aucune relance n’est proposée ici.");
  });
  it("la phrase est celle du suivi des loyers (même fin que le protocole et que le refus au clic)", () => {
    expect(RELANCES_SUSPENDUES_SOUS_PLAN).toBe("Plan d’apurement en cours : les relances sont suspendues jusqu’à sa fin (dette soldée, plan caduc ou annulé).");
    expect(readFileSync(resolve(__dirname, "../src/components/rappels-loyers-interactifs.tsx"), "utf8")).toContain("{RELANCES_SUSPENDUES_SOUS_PLAN}");
  });
  it("le bandeau lit le plan du bail avant de passer les gestes", () => {
    const source = readFileSync(resolve(__dirname, "../src/components/fenetre-lot.tsx"), "utf8");
    expect(source).toContain("chargerPlanApurementEnCours(orgId, bailId)");
    expect(source).toMatch(/<GestesImpaye[\s\S]*?plan=\{plan\}/);
  });
});

describe("chargerPlanApurementEnCours : la lecture du suivi des loyers, pour un bail", () => {
  it("dit si le bail a un plan actif ou en défaut", async () => {
    expect(await chargerPlanApurementEnCours("org", "bail")).toEqual({ donnees: false });
    banc.plans = [{ bail_id: "bail" }];
    expect(await chargerPlanApurementEnCours("org", "bail")).toEqual({ donnees: true });
    expect(banc.filtres).toEqual(expect.arrayContaining([
      ["plans_apurement", "eq", "organization_id", "org"], ["plans_apurement", "in", "bail_id", ["bail"]],
      ["plans_apurement", "in", "etat", ["actif", "en_defaut"]],
    ]));
  });
  it("une lecture impossible est dite, jamais lue comme « aucun plan »", async () => {
    banc.erreur = { message: "indisponible" };
    expect(await chargerPlanApurementEnCours("org", "bail")).toEqual({ erreur: "Impossible de vérifier le plan d’apurement de ce bail." });
  });
});
