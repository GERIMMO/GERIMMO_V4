/**
 * La suppression physique des fichiers purgés, chaque nuit (audit du 27/09).
 *
 * pg_cron vide les fiches et met les chemins en file ; seul un clic dans
 * Journaux supprimait les fichiers du Storage. La tâche `purge` le fait
 * désormais : elle ne marque « supprimé » que ce que l'API a réellement
 * supprimé (ou qui n'existe plus), consigne son bilan sous `tache_purge`, et
 * compte en échec une file qui vieillit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ consigner: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/tache", async (importer) => ({
  ...(await importer<typeof import("@/lib/tache")>()),
  consignerTache: mocks.consigner,
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.client }));
import { GET } from "../src/app/api/cron/purge/route";
import { MISSIONS, TACHES_SUIVIES } from "../src/lib/missions";
import { TACHES } from "../src/lib/sante-service";

const SECRET = "secret-de-recette-suffisamment-long";
const appel = (secret = SECRET) =>
  new Request("https://exemple.fr/api/cron/purge", { headers: { authorization: `Bearer ${secret}` } });

type Ligne = { id: string; storage_path: string; queued_at: string };

function faux(file: Ligne[], opts: { supprimes: string[]; presents?: string[]; bloques?: number }) {
  const marques: string[][] = [];
  const retires: string[][] = [];
  const db = {
    from: (table: string) => {
      expect(table).toBe("purge_fichiers");
      const q: Record<string, unknown> = {};
      let compte = false;
      Object.assign(q, {
        select: (_c: string, o?: { count?: string }) => { compte = Boolean(o?.count); return q; },
        is: () => q,
        order: () => q,
        lt: () => Promise.resolve({ count: opts.bloques ?? 0, error: null }),
        limit: () => Promise.resolve({ data: file, error: null }),
        update: () => ({ in: (_c: string, ids: string[]) => { marques.push(ids); return Promise.resolve({ error: null }); } }),
      });
      void compte;
      return q;
    },
    storage: {
      from: () => ({
        remove: async (chemins: string[]) => { retires.push(chemins); return { data: opts.supprimes.map((name) => ({ name })), error: null }; },
        list: async (dossier: string, o: { search: string }) => ({
          data: (opts.presents ?? []).filter((p) => p === `${dossier}/${o.search}`).map(() => ({ name: o.search })),
          error: null,
        }),
      }),
    },
  };
  return { db, marques, retires };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("tâche de suppression physique des fichiers purgés", () => {
  it("refuse sans le secret des tâches", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(appel("mauvais"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("supprime, solde ce qui a disparu, garde ce qui est encore là, et consigne sous `tache_purge`", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const file: Ligne[] = [
      { id: "1", storage_path: "org/a.pdf", queued_at: "2026-09-27T03:00:00Z" },
      { id: "2", storage_path: "org/deja-parti.pdf", queued_at: "2026-09-27T03:00:00Z" },
      { id: "3", storage_path: "org/coince.pdf", queued_at: "2026-09-27T03:00:00Z" },
    ];
    const f = faux(file, { supprimes: ["org/a.pdf"], presents: ["org/coince.pdf"] });
    mocks.client.mockReturnValue(f.db);
    const r = await GET(appel());
    expect(r.status).toBe(200);
    expect(f.retires).toEqual([["org/a.pdf", "org/deja-parti.pdf", "org/coince.pdf"]]);
    expect(f.marques).toEqual([["1", "2"]]);
    const bilan = await r.json();
    expect(bilan).toMatchObject({ traites: 2, echecs: 1, en_attente: 1 });
    expect(mocks.consigner).toHaveBeenCalledWith(f.db, "purge", expect.objectContaining({ traites: 2, echecs: 1 }));
  });

  it("une file qui vieillit au-delà de 48 h passe la tâche en échec", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const f = faux([], { supprimes: [], bloques: 3 });
    mocks.client.mockReturnValue(f.db);
    const bilan = await (await GET(appel())).json();
    expect(bilan).toMatchObject({ traites: 0, echecs: 3, bloques: 3 });
  });

  it("est planifiée, commandable depuis Équipes et suivie par Santé", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf-8")) as { crons: { path: string; schedule: string }[] };
    // Après la purge nocturne de pg_cron (03:00 UTC).
    expect(vercel.crons).toContainEqual({ path: "/api/cron/equipes?mission=purge", schedule: "40 3 * * *" });
    expect(MISSIONS.purge.equipe).toBe("conformite");
    expect(TACHES_SUIVIES.purge.nom).toBe("Suppression des fichiers purgés");
    expect(TACHES.find((t) => t.nom === "purge")).toMatchObject({ periodicite: "quotidienne", commandable: true });
    expect(TACHES.find((t) => t.nom === "sauvegarde")).toMatchObject({ periodicite: "quotidienne", commandable: false });
  });
});
