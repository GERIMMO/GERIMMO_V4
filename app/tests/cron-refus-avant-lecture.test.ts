/**
 * UN APPEL SANS JETON EST REFUSÉ AVANT TOUTE LECTURE EN BASE — audit palier 1 du 22/11/2026, P1-17.
 *
 * Le défaut : pour « mission=marketing », la route des missions planifiées laissait `appelAutorise` lire en base le
 * jeton du déclencheur (`jeton_declencheur_marketing`) avant de refuser un appel qui ne présentait AUCUN jeton. Sans
 * fuite (la réponse restait 401), mais n'importe qui pouvait faire travailler la base avec la clé de service.
 *
 * Ces tests exécutent le vrai GET et le vrai `appelAutorise`, avec un client de service simulé qui consigne chaque
 * appel : sans en-tête, ou avec un en-tête qui n'est pas un jeton, la base ne doit recevoir AUCUN appel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: m.rpc, from: m.from }) }));

import { GET } from "../src/app/api/cron/equipes/route";
import { appelAutorise } from "../src/lib/missions-planifiees/marketing";

const JETON_EN_BASE = "a".repeat(64);
const appel = (mission: string, entete?: string) => new Request(`https://gerimmo.test/api/cron/equipes?mission=${mission}`, entete === undefined ? undefined : { headers: { authorization: entete } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "secret-de-recette-suffisamment-long");
  m.rpc.mockImplementation(async (nom: string) => ({ data: nom === "jeton_declencheur_marketing" ? JETON_EN_BASE : null, error: null }));
});
afterEach(() => vi.unstubAllEnvs());

describe("route des missions planifiées : refus avant lecture", () => {
  it.each([
    ["sans en-tête", undefined],
    ["avec un en-tête vide", ""],
    ["avec un en-tête qui n'est pas un jeton", "Basic abcdef"],
  ])("mission marketing %s : 401, et la base ne reçoit aucun appel", async (_libelle, entete) => {
    const r = await GET(appel("marketing", entete));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erreur: "Non autorisé." });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.from).not.toHaveBeenCalled();
  });

  it("les autres missions aussi, et une mission inconnue n'est pas révélée", async () => {
    for (const mission of ["veille", "purge", "inconnue"]) expect((await GET(appel(mission))).status, mission).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("un jeton présenté mais faux reste refusé (401) ; lui seul fait lire le jeton du déclencheur", async () => {
    const r = await GET(appel("marketing", "Bearer mauvais-jeton"));
    expect(r.status).toBe(401);
    expect(m.rpc.mock.calls.map(([nom]) => nom)).toEqual(["jeton_declencheur_marketing"]);
  });
});

describe("appelAutorise (déclencheur marketing)", () => {
  const db = { rpc: m.rpc } as unknown as Parameters<typeof appelAutorise>[1];

  it("sans jeton présenté : refus sans lecture", async () => {
    expect(await appelAutorise(appel("marketing"), db)).toBe(false);
    expect(await appelAutorise(appel("marketing", "Basic abcdef"), db)).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("le secret des tâches, ou le jeton généré en base, autorise toujours l'appel", async () => {
    expect(await appelAutorise(appel("marketing", "Bearer secret-de-recette-suffisamment-long"), db)).toBe(true);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(await appelAutorise(appel("marketing", `Bearer ${JETON_EN_BASE}`), db)).toBe(true);
    expect(await appelAutorise(appel("marketing", `Bearer ${"b".repeat(64)}`), db)).toBe(false);
  });
});
