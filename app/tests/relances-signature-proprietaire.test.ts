/**
 * Relecture du 28/10 (LOY-17) — les relances automatiques d'un propriétaire direct sont signées du bailleur.
 *
 * La relance envoyée depuis le tableau de bord signait déjà du nom des détenteurs du lot ; la mission de relances signait
 * « — Parc de … » (le nom de l'espace, rendu par relances_loyer_dues). Les deux courriers d'un même bailleur portent
 * désormais la même signature ; une agence signe toujours de son nom, et une lecture impossible garde le nom de l'espace.
 * Faux client, aucune base.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  envois: [] as { to: string; html: string }[],
  lignes: [] as Record<string, unknown>[],
  organisations: [] as { id: string; type: string }[],
  baux: [] as { id: string; lot_id: string }[],
  detentions: [] as { lot_id: string; organization_id: string; date_fin: string | null; person: { nom: string; prenom: string | null } }[],
  panne: false,
}));

vi.mock("@/lib/email", () => ({
  envoyerEmail: vi.fn(async (p: { to: string; html: string }) => { banc.envois.push(p); return { id: "ok" }; }),
}));
vi.mock("@/lib/tache", () => ({ consignerTache: vi.fn(async () => undefined) }));
vi.mock("@/lib/site", async (importOriginal) => ({ ...(await importOriginal<object>()), adresseDuSite: () => "https://gerimmo.test" }));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => ({
    from(table: string) {
      if (banc.panne) throw new Error("lecture impossible");
      const filtres: [string, string, unknown][] = [];
      const q = {
        select: () => q,
        in: (c: string, v: unknown[]) => { filtres.push(["in", c, v]); return q; },
        is: (c: string, v: unknown) => { filtres.push(["is", c, v]); return q; },
        eq: (c: string, v: unknown) => { filtres.push(["eq", c, v]); return q; },
        then<R>(resolve: (r: { data: unknown[]; error: null }) => R) {
          const source = (table === "organizations" ? banc.organisations : table === "baux" ? banc.baux : table === "detentions" ? banc.detentions : []) as Record<string, unknown>[];
          const data = source.filter((l) => filtres.every(([op, c, v]) => op === "in" ? (v as unknown[]).includes(l[c]) : l[c] === v));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
    rpc: async (nom: string) => {
      if (nom === "verifier_arret_supervision") return { data: true, error: null };
      if (nom === "relances_loyer_dues") return { data: banc.lignes, error: null };
      return { data: "id", error: null };
    },
  }),
}));

const ligne = (organisation: string, bail: string, emetteur: string) => ({
  bail_id: bail, organization_id: organisation, niveau: "relance_2", destinataire: `${bail}@exemple.fr`, prenom: "Paul", emetteur,
  lot: "Appt 1", periode: "2026-09-01", date_echeance: "2026-09-01", reste: 500, jours_retard: 30, total_du: 500,
  autres_destinataires: [], garants: [`caution-${bail}@exemple.fr`], locataire: "Paul Durand",
});

async function passer() {
  const { traiterRelances } = await import("@/lib/missions-planifiees/relances");
  return traiterRelances(new Request("https://x/api/cron/relances", { headers: { authorization: "Bearer secret-de-recette" } }));
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secret-de-recette");
  banc.envois = [];
  banc.panne = false;
  banc.lignes = [ligne("pd", "b-pd", "Parc de Claire Moreau"), ligne("ag", "b-ag", "Agence Alpha")];
  banc.organisations = [{ id: "pd", type: "proprietaire_direct" }, { id: "ag", type: "agence" }];
  banc.baux = [{ id: "b-pd", lot_id: "lot-pd" }, { id: "b-ag", lot_id: "lot-ag" }];
  banc.detentions = [
    { lot_id: "lot-pd", organization_id: "pd", date_fin: null, person: { nom: "Moreau", prenom: "Claire" } },
    { lot_id: "lot-pd", organization_id: "pd", date_fin: null, person: { nom: "Moreau", prenom: "Jean" } },
    { lot_id: "lot-ag", organization_id: "ag", date_fin: null, person: { nom: "Mandant", prenom: "Paul" } },
  ];
});
afterEach(() => vi.unstubAllEnvs());

describe("relances automatiques : signature", () => {
  it("propriétaire direct : la relance et l'information de la caution sont signées des détenteurs ; l'agence signe de son nom", async () => {
    await passer();
    const pour = (to: string) => banc.envois.find((e) => e.to === to)!.html;
    expect(pour("b-pd@exemple.fr")).toContain("— Moreau Claire, Moreau Jean");
    expect(pour("b-pd@exemple.fr")).not.toContain("Parc de Claire Moreau");
    expect(pour("b-pd@exemple.fr")).toContain("votre bailleur");
    expect(pour("caution-b-pd@exemple.fr")).toContain("— Moreau Claire, Moreau Jean");
    expect(pour("b-ag@exemple.fr")).toContain("— Agence Alpha");
    expect(pour("b-ag@exemple.fr")).toContain("votre gestionnaire");
  });
  it("lecture impossible : les courriers partent quand même, signés du nom de l'espace", async () => {
    banc.panne = true;
    await passer();
    expect(banc.envois.find((e) => e.to === "b-pd@exemple.fr")!.html).toContain("— Parc de Claire Moreau");
  });
});
