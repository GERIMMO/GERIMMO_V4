/**
 * Les commandes des équipes (25/09).
 *
 * B3 : l'échec du lancement de l'atelier remettait la proposition bloquée en
 * « en préparation » sans retour arrière. B4 : « Lancer maintenant » exécutait
 * la mission dans le processus de la page, sans limite de durée adaptée ; elle
 * passe par la route cron et l'écran suit l'état.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), headers: vi.fn(), revalidate: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { commanderMission, demanderCorrection } from "../src/app/actions/equipes";

type Ecriture = { statut?: string; probleme?: string };
function base(statutInitial = "a_etudier") {
  const ecritures: { valeurs: Ecriture; conditions: [string, unknown][] }[] = [];
  let statut = statutInitial;
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    let mode: "select" | "update" = "select";
    let valeurs: Ecriture = {};
    const conditions: [string, unknown][] = [];
    q.select = () => q;
    q.update = (v: Ecriture) => { mode = "update"; valeurs = v; return q; };
    q.insert = () => ({ select: () => ({ single: async () => ({ data: { id: "nouvelle" }, error: null }) }) });
    q.eq = (c: string, v: unknown) => { conditions.push([c, v]); return q; };
    q.in = () => q;
    q.maybeSingle = async () => {
      if (mode === "select") return { data: { statut }, error: null };
      const attendu = conditions.find(([c]) => c === "statut")?.[1];
      if (attendu && attendu !== statut) return { data: null, error: null };
      ecritures.push({ valeurs, conditions });
      if (valeurs.statut) statut = valeurs.statut;
      return { data: { id: "prop" }, error: null };
    };
    q.then = (resolve: (v: unknown) => void) => {
      // Une mise à jour sans lecture (restauration) : appliquée si la condition tient.
      const attendu = conditions.find(([c]) => c === "statut")?.[1];
      if (mode === "update" && (!attendu || attendu === statut)) { ecritures.push({ valeurs, conditions }); if (valeurs.statut) statut = valeurs.statut; }
      resolve({ error: null });
    };
    return q;
  });
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  mocks.createClient.mockResolvedValue({ from, rpc });
  return { ecritures, statut: () => statut };
}

const form = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("GITHUB_AGENT_TOKEN", "gh");
  vi.stubEnv("VERCEL_TOKEN", "vc");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj");
  vi.stubEnv("GERIMMO_CODEX_ENABLED", "true");
  vi.stubEnv("CRON_SECRET", "secret");
  mocks.headers.mockResolvedValue(new Headers({ host: "gerimmo.test", "x-forwarded-proto": "https" }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("l'atelier et la proposition (B3, B13)", () => {
  it("remet la proposition à l'étude quand l'atelier ne confirme pas", async () => {
    const b = base("detectee");
    mocks.fetch.mockResolvedValue({ ok: false });
    const r = await demanderCorrection({}, form({ proposition: "11111111-1111-1111-1111-111111111111", demande: "Corriger le libellé du bouton" }));
    expect(r.erreur).toMatch(/réessayez/);
    expect(b.statut()).toBe("detectee");
  });

  it("remet la proposition à l'étude quand l'appel à l'atelier lève", async () => {
    const b = base("a_etudier");
    mocks.fetch.mockRejectedValue(new Error("réseau"));
    const r = await demanderCorrection({}, form({ proposition: "11111111-1111-1111-1111-111111111111", demande: "Corriger le libellé du bouton" }));
    expect(r.erreur).toMatch(/réessayez/);
    expect(b.statut()).toBe("a_etudier");
  });

  it("laisse la proposition en préparation quand l'atelier a accepté", async () => {
    const b = base("a_etudier");
    mocks.fetch.mockResolvedValue({ ok: true });
    const r = await demanderCorrection({}, form({ proposition: "11111111-1111-1111-1111-111111111111", demande: "Corriger le libellé du bouton" }));
    expect(r.succes).toBeTruthy();
    expect(b.statut()).toBe("en_developpement");
  });

  it("exige les mêmes connexions que l'écran de l'atelier, Vercel compris", async () => {
    base();
    vi.stubEnv("VERCEL_TOKEN", "");
    const r = await demanderCorrection({}, form({ demande: "Corriger le libellé du bouton" }));
    expect(r.erreur).toMatch(/atelier/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("« Lancer maintenant » (B4)", () => {
  it("appelle la route cron de ce déploiement avec le secret, et rend son résultat", async () => {
    base();
    mocks.fetch.mockResolvedValue({ status: 200, json: async () => ({ envoyees: 2, echecs: 0 }) });
    const r = await commanderMission({}, form({ mission: "quittances", commande: "lancer" }));
    expect(r.succes).toMatch(/terminé/);
    const [url, options] = mocks.fetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://gerimmo.test/api/cron/equipes?mission=quittances");
    expect(options.headers.authorization).toBe("Bearer secret");
  });

  it("quand la route travaille encore, dit que le passage se poursuit au lieu d'échouer", async () => {
    base();
    const erreur = new Error("délai");
    erreur.name = "TimeoutError";
    mocks.fetch.mockRejectedValue(erreur);
    const r = await commanderMission({}, form({ mission: "marketing", commande: "lancer" }));
    expect(r.succes).toMatch(/se poursuit/);
    expect(r.erreur).toBeUndefined();
  });

  it("un échec réseau reste un échec, et l'écran est actualisé", async () => {
    base();
    mocks.fetch.mockRejectedValue(new Error("réseau"));
    const r = await commanderMission({}, form({ mission: "marketing", commande: "lancer" }));
    expect(r.erreur).toMatch(/réessayez/);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/equipes");
  });
});
