/**
 * L'INTERRUPTEUR IA ET LES TÂCHES DE FOND — mission palier 1 (22/11/2026), points IA-04 et IA-05.
 *
 * IA désactivée par le superviseur, les deux tâches qui s'appuient sur l'IA ne doivent ni échouer, ni alerter :
 *  · la veille continue sa collecte et suspend l'étude automatique (aucune lecture de source, aucun appel, aucun
 *    échec consigné) ; les sujets restent à étudier ;
 *  · le marketing ne crée ni brouillon ni réservation de visuel, et le dit ; un article déjà illustré suit son cours.
 * Une lecture impossible de l'interrupteur ne suspend rien : la tâche se comporte comme avant.
 *
 * Sans base ni réseau : tout est simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bilanMission } from "@/lib/missions";

const m = vi.hoisted(() => ({ etudier: vi.fn(), lireSource: vi.fn(), rpc: vi.fn(), insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), article: null as Record<string, unknown> | null }));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: vi.fn(), ArretSupervision: class extends Error {} }));
vi.mock("@/lib/veille-reglementaire", () => ({ FLUX_VEILLE: [], lireFluxVeille: vi.fn(), chargerFluxVeille: vi.fn() }));
vi.mock("@/lib/analyse-veille", () => ({ lireSourceEtude: m.lireSource, etudierVeille: m.etudier }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => base() }));

/** Une base simulée : la file de veille porte un sujet à étudier ; `publications` rend l'article du jour s'il existe. */
function base() {
  return { rpc: m.rpc, from: (table: string) => {
    let ecriture = false;
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "is", "or", "not", "neq", "gte", "order", "limit", "range"]) q[k] = () => q;
    q.insert = (v: unknown) => { m.insert(table, v); ecriture = true; return q; };
    q.update = (v: unknown) => { m.update(table, v); ecriture = true; return q; };
    q.upsert = (v: unknown) => { m.upsert(table, v); ecriture = true; return Promise.resolve({ data: null, error: { message: "arrêt du scénario après la fiche de suivi" } }); };
    q.maybeSingle = async () => ({ data: table === "publications" ? m.article : null, error: null });
    q.single = async () => ({ data: null, error: { message: "non simulé" } });
    q.then = (f: (v: unknown) => unknown) => Promise.resolve({
      data: !ecriture && table === "regulatory_watch" ? [{ id: "source", titre: "DPE des logements", source_url: "https://example.invalid/source" }] : [],
      count: 0, error: null,
    }).then(f);
    return q;
  } };
}
const interrupteur = (reponse: { data: unknown; error: unknown }) =>
  m.rpc.mockImplementation(async (nom: string) => (nom === "ia_disponible" ? reponse : { data: null, error: null }));

import { IADesactivee } from "@/lib/plafond-ia";
import { traiterVeille } from "@/lib/missions-planifiees/veille";
import { RAISON_IA_DESACTIVEE, preparerPostDu } from "@/lib/missions-planifiees/marketing";

beforeEach(() => {
  vi.clearAllMocks(); m.article = null;
  m.lireSource.mockResolvedValue("Source fictive");
  vi.stubEnv("CRON_SECRET", "secret-local");
});
afterEach(() => vi.unstubAllEnvs());

describe("veille planifiée", () => {
  const lancer = () => traiterVeille(new Request("http://localhost/essai", { headers: { authorization: "Bearer secret-local" } }));
  /** Les événements écrits au journal technique pendant le passage (hors bilan de la tâche). */
  const consigne = () => m.insert.mock.calls.filter(([table]) => table === "tech_log").map(([, v]) => v as { evenement: string; details?: Record<string, unknown> });
  /** Le bilan de la tâche, tel qu'il est consigné (`log_tech`) : c'est lui que lisent la page Santé et l'e-mail du matin. */
  const bilanConsigne = () => m.rpc.mock.calls.filter(([nom]) => nom === "log_tech").map(([, args]) => args as { evenement: string; details: Record<string, unknown> });

  it("IA désactivée : l'étude est suspendue sans lecture de source, sans appel et sans échec", async () => {
    interrupteur({ data: false, error: null });
    const r = await lancer(); const b = await r.json();
    expect(r.status).toBe(200);
    expect(b).toMatchObject({ etudiees: 0, rejetees: 0, echecs: [] });
    expect(m.lireSource).not.toHaveBeenCalled();
    expect(m.etudier).not.toHaveBeenCalled();
    // Le sujet reste à étudier : aucune erreur d'analyse ni date de tentative n'est écrite.
    expect(m.update).not.toHaveBeenCalled();
    expect(consigne().map((l) => l.evenement)).not.toContain("veille_analyse_echec");
    expect(bilanConsigne()).toHaveLength(1);
    expect(bilanConsigne()[0]).toMatchObject({ evenement: "tache_veille", details: { etudiees: 0, echecs: [], etude_suspendue: "IA désactivée" } });
    expect(bilanMission(b, r.status).ok).toBe(true);
  });

  it("IA activée : l'étude a lieu comme avant", async () => {
    interrupteur({ data: true, error: null });
    m.etudier.mockResolvedValue({ analyses: [], rejets: [] });
    const r = await lancer();
    expect(r.status).toBe(200);
    expect(m.etudier).toHaveBeenCalledTimes(1);
    expect(bilanConsigne()[0].details).not.toHaveProperty("etude_suspendue");
  });

  it("interrupteur illisible : la tâche ne se suspend pas d'elle-même, une vraie panne reste une panne", async () => {
    interrupteur({ data: null, error: { message: "panne" } });
    m.etudier.mockRejectedValue(new Error("indisponible"));
    const r = await lancer();
    expect(m.etudier).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(503);
    expect(consigne().map((l) => l.evenement)).toContain("veille_analyse_echec");
  });

  it("IA désactivée entre la lecture de l'état et l'appel : même état neutre, rien à reprendre", async () => {
    interrupteur({ data: true, error: null });
    m.etudier.mockRejectedValue(new IADesactivee());
    const r = await lancer(); const b = await r.json();
    expect(r.status).toBe(200);
    expect(b.echecs).toEqual([]);
    expect(m.update).not.toHaveBeenCalled();
    expect(consigne().map((l) => l.evenement)).not.toContain("veille_analyse_echec");
  });
});

describe("préparation planifiée d'un post", () => {
  const reglages = { actif: true, validation_obligatoire: true, veille_mots_inclus: [], veille_mots_exclus: [] } as unknown as Parameters<typeof preparerPostDu>[1];
  const cible = { jour: "2026-11-24", rang: 1, parution: "2026-11-24T08:00:00Z", rattrapage: false } as unknown as Parameters<typeof preparerPostDu>[2];
  const preparer = () => preparerPostDu(base() as unknown as Parameters<typeof preparerPostDu>[0], reglages, cible);

  it("IA désactivée, aucun article : rien n'est créé, la raison est dite, ce n'est pas une erreur", async () => {
    interrupteur({ data: false, error: null });
    const r = await preparer();
    expect(r).toEqual({ agi: false, ia_desactivee: true, raison: RAISON_IA_DESACTIVEE });
    expect(r).not.toHaveProperty("erreur");
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.map(([nom]) => nom)).toEqual(["ia_disponible"]);
  });

  it("IA désactivée, brouillon sans image : ni réservation de visuel, ni essai décompté", async () => {
    interrupteur({ data: false, error: null });
    m.article = { id: "article", statut: "brouillon", titre: "Sujet", image_empreinte: null, image_essais: 1, image_en_cours_le: null, updated_at: "2026-11-22T08:00:00Z" };
    const r = await preparer();
    expect(r).toEqual({ agi: false, ia_desactivee: true, raison: RAISON_IA_DESACTIVEE, article: "article" });
    expect(m.rpc.mock.calls.map(([nom]) => nom)).not.toContain("reserver_visuel_marketing");
    expect(m.update).not.toHaveBeenCalled();
  });

  it("IA désactivée, article déjà illustré : la préparation suit son cours sans consulter l'IA", async () => {
    interrupteur({ data: false, error: null });
    m.article = { id: "article", statut: "brouillon", titre: "Sujet", facebook_texte: "Texte", image_empreinte: "a".repeat(64), image_essais: 0, image_en_cours_le: null, updated_at: "2026-11-22T08:00:00Z" };
    const r = await preparer();
    expect(r).not.toHaveProperty("ia_desactivee");
    expect(m.rpc.mock.calls.map(([nom]) => nom)).not.toContain("ia_disponible");
    expect(m.upsert).toHaveBeenCalledWith("marketing_campagnes", expect.anything());
  });

  it("la raison consignée est neutre : ni panne, ni limite, ni crédit", () => {
    expect(RAISON_IA_DESACTIVEE).not.toMatch(/panne|échec|indisponible|limite|plafond|crédit/i);
  });
});
