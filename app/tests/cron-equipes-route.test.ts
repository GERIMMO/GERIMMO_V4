/**
 * X04 — le COMPORTEMENT de la route d'équipes, devenue l'entrée unique des dix missions planifiées.
 *
 * Constat de relecture (14/10/2026) : aucun test n'appelait le GET de `/api/cron/equipes`. Les tests de mission
 * appellent directement `traiterX`, jamais le verrou ; et `cron-entree-unique.test.ts` ne lisait que le texte du
 * fichier. Trois mutations survivaient : relances et rappels échangés dans la table `traitements`, la purge retirée de
 * cette table, la ligne qui refuse un appel sans secret supprimée.
 *
 * Ici, le GET est exécuté pour de bon avec un client de service simulé et les dix traitements simulés (chacun répond
 * en se nommant) : on regarde ce qui est appelé, dans quel ordre, et ce qui ne l'est jamais. `executerMission`, le
 * verrou, n'est PAS simulé : c'est lui qui doit se retrouver sur le chemin de chaque mission.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOMS = ["veille", "appels", "quittances", "relances", "rappels", "abonnements", "signatures", "marketing", "territoire", "purge"] as const;

const m = vi.hoisted(() => {
  const traiter: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const nom of ["veille", "appels", "quittances", "relances", "rappels", "abonnements", "signatures", "marketing", "territoire", "purge"]) {
    traiter[nom] = vi.fn();
  }
  return { traiter, db: null as unknown, rpc: vi.fn(), appelAutorise: vi.fn() };
});

vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.db }));
vi.mock("@/lib/point-du-matin", () => ({ genererPointsDuMatin: vi.fn(async () => ({ enregistres: 0 })) }));
vi.mock("@/lib/missions-planifiees/veille", () => ({ traiterVeille: m.traiter.veille }));
vi.mock("@/lib/missions-planifiees/appels", () => ({ traiterAppels: m.traiter.appels }));
vi.mock("@/lib/missions-planifiees/quittances", () => ({ traiterQuittances: m.traiter.quittances }));
vi.mock("@/lib/missions-planifiees/relances", () => ({ traiterRelances: m.traiter.relances }));
vi.mock("@/lib/missions-planifiees/rappels", () => ({ traiterRappels: m.traiter.rappels }));
vi.mock("@/lib/missions-planifiees/abonnements", () => ({ traiterAbonnements: m.traiter.abonnements }));
vi.mock("@/lib/missions-planifiees/signatures", () => ({ traiterSignatures: m.traiter.signatures }));
vi.mock("@/lib/missions-planifiees/territoire", () => ({ traiterTerritoire: m.traiter.territoire }));
vi.mock("@/lib/missions-planifiees/purge", () => ({ traiterPurge: m.traiter.purge }));
vi.mock("@/lib/missions-planifiees/marketing", () => ({ traiterMarketing: m.traiter.marketing, appelAutorise: m.appelAutorise }));

import { GET } from "../src/app/api/cron/equipes/route";
import { MISSIONS } from "../src/lib/missions";

const SECRET = "secret-de-recette-suffisamment-long";

type Reglage = { arret?: boolean; enPause?: boolean };

/** Le client de service simulé : chaque appel de fonction de base est consigné, la réponse dépend du nom. */
function brancherBase({ arret = false, enPause = false }: Reglage = {}) {
  m.rpc.mockImplementation(async (nom: string, args?: { p_cle?: string }) => {
    if (nom === "verifier_arret_supervision") return { data: !arret, error: null };
    if (nom === "commencer_mission") return { data: enPause ? null : `passage_${args?.p_cle}`, error: null };
    return { data: null, error: null };
  });
  m.db = { rpc: m.rpc };
}

const appel = (mission: string | null, secret: string | null = SECRET) => {
  const url = new URL("https://gerimmo.test/api/cron/equipes");
  if (mission !== null) url.searchParams.set("mission", mission);
  return new Request(url, secret === null ? undefined : { headers: { authorization: `Bearer ${secret}` } });
};

const traitementsAppeles = () => NOMS.filter((nom) => m.traiter[nom].mock.calls.length > 0);
const appelsDeBase = (nom: string) => m.rpc.mock.calls.filter(([n]) => n === nom);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  brancherBase();
  m.appelAutorise.mockResolvedValue(false);
  for (const nom of NOMS) m.traiter[nom].mockImplementation(async () => Response.json({ mission: nom, traites: 1 }));
});

describe("garde de la liste des missions", () => {
  it("les dix missions simulées ici sont exactement celles de la table des missions", () => {
    expect([...NOMS].sort()).toEqual(Object.keys(MISSIONS).sort());
  });
});

describe("accès : le secret d'abord, le reste ensuite", () => {
  it.each([
    ["sans en-tête d'autorisation", null],
    ["avec un mauvais secret", "autre-secret-de-meme-longueur-que-vrai"],
    ["avec un secret vide", ""],
  ])("refuse (401) %s, sans rien lancer ni toucher la base", async (_libelle, secret) => {
    for (const nom of NOMS) {
      const r = await GET(appel(nom, secret));
      expect(r.status, nom).toBe(401);
      // Audit final (COD-16) : aucune réponse de tâche ne se met en cache.
      expect(r.headers.get("Cache-Control"), nom).toBe("no-store");
      expect(await r.json()).toEqual({ erreur: "Non autorisé." });
    }
    expect(traitementsAppeles()).toEqual([]);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuse (401) tout appel quand aucun secret n'est configuré, même avec un en-tête plausible", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const porteur of ["", "undefined", "null", SECRET]) {
      const r = await GET(appel("relances", porteur));
      expect(r.status, porteur).toBe(401);
    }
    expect(traitementsAppeles()).toEqual([]);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("répond 401 avant 400 : sans secret, on ne dit pas si la mission existe", async () => {
    const r = await GET(appel("mission-qui-n-existe-pas", null));
    expect(r.status).toBe(401);
  });

  it("avec le secret, une mission inconnue ou absente donne 400, sans rien lancer ni toucher la base", async () => {
    for (const cle of ["mission-qui-n-existe-pas", "", "orchestrateur", "constructor", "__proto__", "toString", "VEILLE", "veille "]) {
      const r = await GET(appel(cle));
      expect(r.status, cle).toBe(400);
      expect(await r.json()).toEqual({ erreur: "Mission inconnue." });
    }
    expect((await GET(appel(null))).status).toBe(400);
    expect(traitementsAppeles()).toEqual([]);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("avec le secret mais sans client de service, répond 503 pour chaque mission, sans rien lancer", async () => {
    m.db = null;
    for (const nom of NOMS) {
      const r = await GET(appel(nom));
      expect(r.status, nom).toBe(503);
      expect(await r.json()).toEqual({ erreur: "Connexion du traitement indisponible." });
    }
    expect(traitementsAppeles()).toEqual([]);
  });

  it("sans client de service, un appel sans secret reste un 401 et n'interroge pas le jeton de la base", async () => {
    m.db = null;
    const r = await GET(appel("marketing", null));
    expect(r.status).toBe(401);
    expect(m.appelAutorise).not.toHaveBeenCalled();
  });
});

describe("le jeton généré en base ne vaut que pour la mission marketing", () => {
  it("marketing : sans secret mais avec le jeton de la base, la mission s'exécute", async () => {
    m.appelAutorise.mockResolvedValue(true);
    const requete = appel("marketing", null);
    const r = await GET(requete);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ mission: "marketing" });
    expect(m.appelAutorise).toHaveBeenCalledTimes(1);
    expect(m.appelAutorise.mock.calls[0][0]).toBe(requete);
    expect(m.appelAutorise.mock.calls[0][1]).toBe(m.db);
    expect(traitementsAppeles()).toEqual(["marketing"]);
  });

  it("marketing : sans secret et sans jeton valide, 401", async () => {
    const r = await GET(appel("marketing", null));
    expect(r.status).toBe(401);
    expect(traitementsAppeles()).toEqual([]);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it.each(NOMS.filter((nom) => nom !== "marketing"))("%s : le jeton de la base ne suffit pas, 401", async (nom) => {
    m.appelAutorise.mockResolvedValue(true);
    const r = await GET(appel(nom, null));
    expect(r.status).toBe(401);
    expect(traitementsAppeles()).toEqual([]);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("chaque mission passe par le verrou, puis par SON traitement", () => {
  it.each(NOMS)("%s : commencer_mission, puis le traitement de cette mission seule, puis terminer_mission", async (nom) => {
    const requete = appel(nom);
    const r = await GET(requete);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    // Le traitement exécuté est celui de la mission demandée, pas celui d'une autre.
    expect(await r.json()).toEqual({ mission: nom, traites: 1 });
    expect(traitementsAppeles()).toEqual([nom]);
    expect(m.traiter[nom]).toHaveBeenCalledTimes(1);
    expect(m.traiter[nom].mock.calls[0][0]).toBe(requete);
    // Le verrou est pris pour cette mission, une seule fois, et rendu avec le passage obtenu.
    expect(appelsDeBase("commencer_mission")).toEqual([["commencer_mission", { p_cle: nom }]]);
    expect(appelsDeBase("terminer_mission")).toHaveLength(1);
    expect(appelsDeBase("terminer_mission")[0][1]).toMatchObject({ p_id: `passage_${nom}`, p_ok: true, p_compte: 1 });
    // Les arrêts sont consultés au nom de la mission avant de commencer.
    expect(appelsDeBase("verifier_arret_supervision")[0][1]).toMatchObject({ p_mission: nom });
    // Ordre : veille de continuité, arrêts, verrou, (traitement), clôture.
    const ordre = m.rpc.mock.calls.map(([n]) => n);
    expect(ordre.indexOf("surveiller_continuite")).toBe(0);
    expect(ordre.indexOf("commencer_mission")).toBeGreaterThan(ordre.indexOf("verifier_arret_supervision"));
    expect(ordre.lastIndexOf("terminer_mission")).toBeGreaterThan(ordre.indexOf("commencer_mission"));
  });

  it("deux missions de suite lancent chacune la leur, jamais la précédente", async () => {
    await GET(appel("rappels"));
    await GET(appel("relances"));
    expect(m.traiter.rappels).toHaveBeenCalledTimes(1);
    expect(m.traiter.relances).toHaveBeenCalledTimes(1);
    expect(m.rpc.mock.calls.filter(([n]) => n === "commencer_mission").map(([, a]) => a.p_cle)).toEqual(["rappels", "relances"]);
  });

  it.each(NOMS)("%s : mission en pause ou déjà en cours, rien n'est lancé", async (nom) => {
    brancherBase({ enPause: true });
    const r = await GET(appel(nom));
    expect(await r.json()).toEqual({ ignore: true, motif: "Mission en pause ou déjà en cours." });
    expect(traitementsAppeles()).toEqual([]);
    expect(appelsDeBase("commencer_mission")).toEqual([["commencer_mission", { p_cle: nom }]]);
    expect(appelsDeBase("terminer_mission")).toHaveLength(0);
  });

  it.each(NOMS)("%s : arrêt d'urgence demandé, 503 et aucun passage commencé", async (nom) => {
    brancherBase({ arret: true });
    const r = await GET(appel(nom));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ arret: "arret" });
    expect(traitementsAppeles()).toEqual([]);
    expect(appelsDeBase("commencer_mission")).toHaveLength(0);
  });

  it("un traitement qui échoue est consigné comme échec, jamais comme succès", async () => {
    m.traiter.purge.mockImplementation(async () => Response.json({ erreur: true }, { status: 500 }));
    const r = await GET(appel("purge"));
    expect(r.status).toBe(500);
    expect(appelsDeBase("terminer_mission")[0][1]).toMatchObject({ p_id: "passage_purge", p_ok: false });
  });
});
