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
    // M16 : aucune demande de contact du site vitrine en attente.
    if (nom === "demandes_contact_en_attente") return { data: { en_attente: 0, depuis_plus_de_48h: 0 }, error: null };
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
  vi.restoreAllMocks();
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

  it("à 5 h à Paris, le contrôle du relais indisponible (réservation en erreur) : HTTP 503, rien ne part", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:00:30Z"));
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    m.rpc.mockImplementation(async () => ({ data: null, error: { message: "indisponible" } }));
    const r = await GET(appel());
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ erreur: "Le contrôle du relais est indisponible.", status: 503 });
    expect(fournisseur.appels).toEqual([]);
  });

  it("à 5 h à Paris, une exception en cours de passage : HTTP 500, la tâche planifiée paraît en échec", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:00:30Z"));
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    m.rpc.mockImplementation(async (nom: string) => {
      if (nom === "reserver_alerte_relais") return { data: { reserve: true, jour: "2026-10-15", tentative: 1 }, error: null };
      throw new Error("connexion coupée");
    });
    const r = await GET(appel());
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ erreur: "Le passage du relais a été interrompu." });
    expect(fournisseur.appels).toEqual([]);
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

// ── Le passage fréquent des urgences (relecture du 15/10 : délai réel jusqu'à ~18 h sans lui) ─────────────────────────
//
// pg_cron (tâche `relais-urgences`, toutes les 10 minutes) appelle /api/cron/relais?mode=urgences par pg_net, avec le
// jeton généré en base (migration 20261014812000). La route ne fait que constater (`traiter_vacances`) puis vider la file
// de l'e-mail immédiat ; elle n'ouvre rien d'autre, ne consulte aucun arrêt d'urgence et ne dit jamais le jeton.
describe("/api/cron/relais?mode=urgences (passage fréquent)", () => {
  const JETON = "0123456789abcdef".repeat(4);
  const AUTRE_JETON = "fedcba9876543210".repeat(4);
  const passage = (jeton: string | null, chemin = "/api/cron/relais?mode=urgences") =>
    new Request(`https://gerimmo.test${chemin}`, jeton === null ? undefined : { headers: { authorization: `Bearer ${jeton}` } });
  const URGENCE = { nature: "passage_a_reprendre", posee_le: "2026-10-15T14:02:00Z" };

  /** Une base simulée : le jeton du passage, une file (vide ou une urgence), et un arrêt d'urgence global actif. */
  function brancherPassage(options: { jeton?: unknown; urgence?: boolean; vacancesEnErreur?: boolean } = {}) {
    let prise = options.urgence ? 1 : 0;
    m.rpc.mockImplementation(async (nom: string) => {
      if (nom === "jeton_declencheur_relais_urgences") return { data: "jeton" in options ? options.jeton : JETON, error: null };
      if (nom === "traiter_vacances") return options.vacancesEnErreur ? { data: null, error: { message: "indisponible" } } : { data: { lectures_executees: 0 }, error: null };
      if (nom === "prendre_urgences_relais") {
        if (prise-- > 0) return { data: { pris: true, envoi: "11111111-2222-4333-8444-555555555555", tentative: 1, reprise: false, urgences: [URGENCE], en_attente: 0 }, error: null };
        return { data: { pris: false, motif: "rien", en_attente: 0 }, error: null };
      }
      if (nom === "terminer_urgences_relais") return { data: { termine: true, statut: "envoye" }, error: null };
      if (nom === "sentinelle_relais") return { data: { arrets: [{ cle: "global", depuis: "2026-10-14T20:00:00Z" }] }, error: null };
      return { data: null, error: null };
    });
    m.db = { rpc: m.rpc };
  }
  const appelees = () => m.rpc.mock.calls.map(([nom]) => nom);

  it("refuse sans jeton : 401, ni lecture de la base ni appel au service d'e-mail", async () => {
    brancherPassage({ urgence: true });
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    expect((await GET(passage(null))).status).toBe(401);
    expect((await GET(new Request("https://gerimmo.test/api/cron/relais?mode=urgences", { headers: { authorization: JETON } }))).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(fournisseur.appels).toEqual([]);
  });

  it("refuse un faux jeton (même longueur) et le secret des tâches Vercel : 401, rien n'est constaté ni envoyé", async () => {
    brancherPassage({ urgence: true });
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    for (const faux of [AUTRE_JETON, SECRET, JETON.slice(0, 63)]) {
      const r = await GET(passage(faux));
      expect(r.status, faux.length.toString()).toBe(401);
    }
    expect(new Set(appelees())).toEqual(new Set(["jeton_declencheur_relais_urgences"]));
    expect(fournisseur.appels).toEqual([]);
  });

  it("le jeton du passage n'ouvre pas le passage de 5 h (qui reste réservé au secret des tâches)", async () => {
    brancherPassage();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:00:30Z"));
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    expect((await GET(passage(JETON, "/api/cron/relais?creneau=ete"))).status).toBe(401);
    expect((await GET(passage(JETON, "/api/cron/relais?mode=autre"))).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("jeton non configuré en base (migration absente, ligne vide) : « non configuré », rien n'est constaté ni envoyé", async () => {
    for (const jeton of [null, "", "court"]) {
      vi.clearAllMocks();
      brancherPassage({ jeton, urgence: true });
      vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
      const fournisseur = fauxFournisseurEmail();
      vi.stubGlobal("fetch", fournisseur.fetch);
      const r = await GET(passage(JETON));
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ erreur: "Le passage des urgences n’est pas configuré.", non_configure: true });
      expect(appelees()).toEqual(["jeton_declencheur_relais_urgences"]);
      expect(fournisseur.appels).toEqual([]);
    }
  });

  it("sans client de service : 503, sans rien lire", async () => {
    m.db = null;
    expect((await GET(passage(JETON))).status).toBe(503);
  });

  it("jeton juste, file vide : constat, puis la file est lue une fois, AUCUN appel au service d'e-mail, passage consigné", async () => {
    brancherPassage();
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com, second@example.org");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const r = await GET(passage(JETON));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ constat: "fait", envoi: { arret: "rien", envois: [] } });
    expect(appelees()).toEqual(["jeton_declencheur_relais_urgences", "traiter_vacances", "prendre_urgences_relais", "consigner_passage_urgences_relais"]);
    expect(fournisseur.appels).toEqual([]);
  });

  it("jeton juste, une urgence constatée : un e-mail par adresse, sous l'arrêt d'urgence global, sans contrôle d'arrêt", async () => {
    brancherPassage({ urgence: true });
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com, second@example.org");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const r = await GET(passage(JETON));
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(corps).toEqual({ constat: "fait", envoi: { arret: "rien", envois: [{ urgences: 1, destinataires: 2, envoyes: 2, reprise: false, statut: "envoye" }] } });
    expect(JSON.stringify(corps)).not.toContain("@");
    expect(fournisseur.acceptes.map((a) => a.to[0]).sort()).toEqual(["relais@example.com", "second@example.org"]);
    expect(appelees()).not.toContain("verifier_arret_supervision");
    expect(appelees()).not.toContain("sentinelle_relais");
    expect(appelees()).not.toContain("reserver_alerte_relais");
    expect(appelees().indexOf("traiter_vacances")).toBeLessThan(appelees().indexOf("prendre_urgences_relais"));
  });

  it("le constat en erreur : les urgences déjà en file partent quand même, le passage n'est pas consigné (la sentinelle le verra), HTTP 503", async () => {
    brancherPassage({ urgence: true, vacancesEnErreur: true });
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const r = await GET(passage(JETON));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ constat: "indisponible", envoi: { envois: [{ envoyes: 1 }] } });
    expect(appelees()).not.toContain("consigner_passage_urgences_relais");
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("relais non configuré (variable vide) : le constat a lieu, rien n'est pris dans la file, aucun e-mail", async () => {
    brancherPassage({ urgence: true });
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const r = await GET(passage(JETON));
    expect(await r.json()).toEqual({ constat: "fait", envoi: { arret: "non_configure", envois: [] } });
    expect(appelees()).not.toContain("prendre_urgences_relais");
    expect(fournisseur.appels).toEqual([]);
  });

  it("le jeton n'apparaît jamais dans les journaux ni dans les réponses, juste ou faux", async () => {
    const journal: string[] = [];
    for (const niveau of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, niveau).mockImplementation((...args: unknown[]) => { journal.push(args.map(String).join(" ")); });
    }
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const reponses: string[] = [];
    brancherPassage({ urgence: true, vacancesEnErreur: true });
    reponses.push(await (await GET(passage(JETON))).text());
    brancherPassage();
    reponses.push(await (await GET(passage(AUTRE_JETON))).text());
    brancherPassage({ jeton: null });
    reponses.push(await (await GET(passage(JETON))).text());
    expect(journal.length).toBeGreaterThan(0);
    for (const texte of [...journal, ...reponses]) {
      expect(texte).not.toContain(JETON);
      expect(texte).not.toContain(AUTRE_JETON);
    }
  });
});
