/**
 * Audit final (PUB-05, relecture adverse du 28/10) : les pages publiques sont relues toutes les heures (ISR). Une lecture
 * Supabase en échec au build ou à la régénération ne doit JAMAIS produire un rendu dégradé mis en cache (journal « Le
 * premier article arrive », mentions légales « en cours de finalisation ») : la page LÈVE, Next garde la dernière version
 * réussie et un build sans base échoue. Sans configuration (aucun client public), le rendu habituel reste possible.
 * La supervision garde l'ancienne lecture de l'identité (sans option), qui ne lève pas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ client: null as unknown, serveur: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public", () => ({ createClientPublic: () => banc.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => banc.serveur }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));

/** Un client PostgREST factice : toute chaîne aboutit à `reponse` (erreur réseau simulée par défaut). */
function client(reponse: { data: unknown; error: unknown }) {
  const q: unknown = new Proxy(() => {}, {
    get(_c, prop) {
      if (prop === "then") return (ok: (r: unknown) => unknown) => Promise.resolve(reponse).then(ok);
      if (prop === "maybeSingle" || prop === "single") return async () => reponse;
      return () => q;
    },
  });
  return { from: () => q, rpc: () => q };
}
const PANNE = { data: null, error: { message: "TypeError: fetch failed" } };

beforeEach(() => { banc.client = client(PANNE); banc.serveur = client(PANNE); vi.resetModules(); });

describe("lectures publiques en panne : la page lève au lieu de figer un état dégradé", () => {
  it("identité de l'éditeur pour une page publique : rejet ; pour la supervision : « indisponible », comme avant", async () => {
    const { lireEditeur } = await import("@/lib/editeur-serveur");
    await expect(lireEditeur({ pagePublique: true })).rejects.toThrow(/Identité de l'éditeur illisible/);
    await expect(lireEditeur()).resolves.toMatchObject({ indisponible: true });
  });

  it("durées de conservation : rejet", async () => {
    const { lireDureesPubliques } = await import("@/lib/conservation-publique");
    await expect(lireDureesPubliques()).rejects.toThrow(/Durées de conservation illisibles/);
  });

  it("journal, accueil et versions archivées : rejet", async () => {
    const journal = (await import("@/app/journal/page")).default;
    await expect(journal()).rejects.toThrow(/Articles du journal illisibles/);
    const accueil = (await import("@/app/page")).default;
    await expect(accueil()).rejects.toThrow(/l'accueil n'est pas mis en cache/);
    const versions = (await import("@/app/conditions/versions/page")).default;
    await expect(versions()).rejects.toThrow(/Versions archivées illisibles/);
  });

  it("sans configuration (aucun client public), aucune lecture ne lève", async () => {
    banc.client = null;
    const { lireDureesPubliques } = await import("@/lib/conservation-publique");
    await expect(lireDureesPubliques()).resolves.toMatchObject({ regles: [], indisponible: true });
    const { lireEditeur } = await import("@/lib/editeur-serveur");
    banc.serveur = client({ data: { valeurs: {} }, error: null });
    await expect(lireEditeur({ pagePublique: true })).resolves.toMatchObject({ indisponible: false });
  });
});
