/**
 * D46-B — la route /api/cron/relais (alerte e-mail quotidienne du relais).
 *
 * Le GET est exécuté pour de bon, avec un client de service simulé et le faux fournisseur d'e-mail (aucun envoi réel) :
 * secret exigé, adresses lues dans GERIMMO_RELAIS_EMAILS, rien hors de 5 h à Paris, et jamais de contrôle d'arrêt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";

const m = vi.hoisted(() => ({ db: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.db }));

import { GET } from "../src/app/api/cron/relais/route";

const SECRET = "secret-de-recette-suffisamment-long";
const appel = (secret: string | null = SECRET) =>
  new Request("https://gerimmo.test/api/cron/relais?creneau=ete", secret === null ? undefined : { headers: { authorization: `Bearer ${secret}` } });

function brancherBase(arret = true) {
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "reserver_alerte_relais") return { data: { reserve: true, jour: "2026-10-15", tentative: 1 }, error: null };
    if (nom === "sentinelle_relais") {
      return {
        data: {
          alertes: { ouvertes: 0, escaladees: 0, non_acheminees: 0 },
          arrets: arret ? [{ cle: "global", depuis: "2026-10-14T20:00:00Z" }] : [],
          taches_base_lisibles: true,
          taches_base: [],
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  const from = () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "like", "in", "is", "gte", "order", "limit"]) q[k] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
  };
  m.db = { rpc: m.rpc, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gerimmo.test");
  brancherBase();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/cron/relais", () => {
  it("refuse sans le secret, et n'appelle rien", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    expect((await GET(appel(null))).status).toBe(401);
    expect((await GET(appel("mauvais-secret-de-la-meme-longueur-x"))).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(fournisseur.appels).toEqual([]);
  });

  it("répond 503 sans client de service", async () => {
    m.db = null;
    expect((await GET(appel())).status).toBe(503);
  });

  it("hors de 5 h à Paris : « hors créneau », rien d'appelé", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T04:00:00Z"));
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const r = await GET(appel());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ignore: true, motif: "hors_creneau", heure_paris: 6 });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("à 5 h à Paris, sous un arrêt d'urgence : l'alerte part vers les adresses du réglage, sans contrôle d'arrêt", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:00:30Z"));
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", " relais@example.com , pas-une-adresse, second@example.org");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const r = await GET(appel());
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(corps).toMatchObject({ jour: "2026-10-15", statut: "envoye", destinataires: 2, envoyes: 2 });
    // La réponse de la route ne dit aucune adresse.
    expect(JSON.stringify(corps)).not.toContain("@");
    expect(fournisseur.acceptes.map((a) => a.to[0])).toEqual(["relais@example.com", "second@example.org"]);
    expect(m.rpc.mock.calls.map(([nom]) => nom)).not.toContain("verifier_arret_supervision");
    const fin = m.rpc.mock.calls.find(([nom]) => nom === "terminer_alerte_relais")?.[1];
    expect(fin).toMatchObject({ p_statut: "envoye", p_compteurs: expect.objectContaining({ arrets_actifs: 1, adresses_ignorees: 1 }) });
  });

  it("à 5 h à Paris, variable absente : rien ne part, le passage dit « relais non configuré »", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T04:10:00Z"));
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const r = await GET(appel());
    expect(await r.json()).toMatchObject({ statut: "non_configure", destinataires: 0, envoyes: 0 });
    expect(fournisseur.appels).toEqual([]);
  });
});
