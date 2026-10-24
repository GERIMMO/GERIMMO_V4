import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { executerMission } from "@/lib/execution-mission";
import { alerterSuperviseurDuPost, type ApercuPost } from "@/lib/alerte-veto-marketing";
import { traiterRappels as rappels } from "@/lib/missions-planifiees/rappels";
import { traiterVeille as veille } from "@/lib/missions-planifiees/veille";

const m = vi.hoisted(() => ({ db: null as unknown, rpc: vi.fn(), envois: vi.fn(), etudier: vi.fn(), statutIA: "accorde" }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.db }));
vi.mock("@/lib/point-du-matin", () => ({ genererPointsDuMatin: vi.fn(async () => ({ enregistres: 7 })) }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: vi.fn(async () => null) }));
vi.mock("@/lib/email", () => ({ envoyerEmail: async (p: { avantEnvoi?: () => Promise<void> }) => {
  await p.avantEnvoi?.();
  m.envois();
  return { id: "email_test" };
} }));
vi.mock("@/lib/veille-reglementaire", () => ({ FLUX_VEILLE: [], lireFluxVeille: vi.fn(), chargerFluxVeille: vi.fn() }));
vi.mock("@/lib/analyse-veille", () => ({ lireSourceEtude: async () => "Source TEST", etudierVeille: m.etudier }));

type Resultat = { data: unknown; error: null };
class Lecture implements PromiseLike<Resultat> {
  constructor(private rows: unknown[]) {}
  select() { return this; } eq() { return this; } lte() { return this; } order() { return this; }
  limit() { return this; } not() { return this; } is() { return this; } gte() { return this; } or() { return this; }
  update() { return this; } insert() { return this; }
  range(de: number, a: number) { return new Lecture(this.rows.slice(de, a + 1)); }
  maybeSingle() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
  then<T = Resultat, E = never>(ok?: ((r: Resultat) => T | PromiseLike<T>) | null, ko?: ((e: unknown) => E | PromiseLike<E>) | null): PromiseLike<T | E> {
    return Promise.resolve({ data: this.rows, error: null }).then(ok, ko);
  }
}

function client(arretAuControle: number) {
  let controle = 0;
  m.rpc.mockImplementation(async (nom: string) => ({ data: nom === "verifier_arret_supervision" ? ++controle < arretAuControle
    : nom === "commencer_mission" ? "mission_test"
    : nom === "reserver_appel_ia" ? m.statutIA
    : nom === "rendez_vous_a_rappeler" ? []
    : nom === "org_ecriture_ouverte" ? true
    : nom === "email_superviseur_permanent" ? "superviseur@example.invalid" : null, error: null }));
  const db = { rpc: m.rpc, from: (table: string) => new Lecture(table === "pieces_demandees"
    ? [{ id: "piece_test", organization_id: "org_test", person_id: "person_test", libelle: "Pièce TEST", demandee_le: "2026-01-01T00:00:00Z" }]
    : table === "persons" ? [{ email: "personne@example.invalid", prenom: "TEST" }]
    : table === "regulatory_watch" ? [{ id: "source_test", titre: "Loyer : révision annuelle TEST", source_url: "https://source.invalid" }] : []) };
  m.db = db;
  return db as unknown as SupabaseClient;
}

const requete = (mission: string) => new Request(`http://localhost/api/cron/${mission}`, { headers: { authorization: "Bearer secret_test" } });
beforeEach(() => { vi.clearAllMocks(); m.statutIA = "accorde"; vi.stubEnv("CRON_SECRET", "secret_test"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("L’arrêt atteint le journal de mission", () => {
  it.each([3, 4])("rappel : arrêt au contrôle %i, jamais un succès ni un échec fournisseur", async (arretAuControle) => {
    // 1/2 : contrôles de mission. 3 : avant préparation d’envoi. 4 : garde terminale email.
    const db = client(arretAuControle);
    const r = await executerMission(db, "rappels", () => rappels(requete("rappels")));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ arret: "arret", compte_inconnu: true });
    expect(m.rpc).toHaveBeenCalledWith("interrompre_mission_supervision", { p_id: "mission_test", p_indisponible: false, p_bilan: null });
    expect(m.rpc.mock.calls.some(([nom]) => nom === "terminer_mission")).toBe(false);
    expect(m.rpc.mock.calls.some(([nom, args]) => nom === "log_tech" && args?.evenement === "notification_echec")).toBe(false);
    expect(m.envois).not.toHaveBeenCalled();
  });

  it("veille : l’arrêt n’est pas enregistré comme une analyse IA échouée", async () => {
    const db = client(3);
    const r = await executerMission(db, "veille", () => veille(requete("veille")));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ arret: "arret" });
    expect(m.etudier).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.some(([nom]) => nom === "terminer_mission")).toBe(false);
  });

  // X19 (SA-10) : l'étude simulée appelle la garde qu'on lui passe, comme la vraie (juste avant l'appel payant).
  const etudeGardee = () => m.etudier.mockImplementation(async (_s: unknown, garde: () => Promise<void>) => { await garde(); return { analyses: [], rejets: [] }; });

  it("veille : l'étude réserve son appel (usage « veille ») ; un arrêt d'urgence à ce moment interrompt la mission", async () => {
    etudeGardee();
    m.statutIA = "arret";
    const db = client(99);
    const r = await executerMission(db, "veille", () => veille(requete("veille")));
    expect(m.rpc).toHaveBeenCalledWith("reserver_appel_ia", { p_usage: "veille" });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ arret: "arret" });
    expect(m.rpc.mock.calls.some(([nom]) => nom === "terminer_mission")).toBe(false);
  });

  it("veille : limite du jour atteinte, l'étude n'a pas lieu et le passage le dit (échec à reprendre, pas un arrêt)", async () => {
    etudeGardee();
    m.statutIA = "plafond";
    const db = client(99);
    const r = await executerMission(db, "veille", () => veille(requete("veille")));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ echecs: ["Analyse des conséquences à reprendre"] });
    expect(m.rpc.mock.calls.some(([nom]) => nom === "terminer_mission")).toBe(true);
    expect(m.rpc.mock.calls.some(([nom]) => nom === "interrompre_mission_supervision")).toBe(false);
  });

  const post: ApercuPost = { id: "post_test", titre: "TEST", chapo: null, facebook_texte: null, facebook_image_url: null, programmee_pour: "2026-10-20T09:00:00Z", veille: false, rattrapage: false, validation_obligatoire: true };
  it("alerte marketing : garde terminale après premier contrôle ne devient pas un motif ordinaire", async () => {
    const db = client(99);
    let n = 0;
    const arret = new ArretSupervision();
    await expect(alerterSuperviseurDuPost(db, post, async () => { if (++n === 2) throw arret; })).rejects.toBe(arret);
    expect(m.envois).not.toHaveBeenCalled();
  });
  it("alerte marketing : une erreur ordinaire conserve son motif", async () => {
    const db = client(99);
    await expect(alerterSuperviseurDuPost(db, post, async () => { throw new Error("source indisponible"); })).resolves.toEqual({ envoye: false, motif: "source indisponible" });
  });
});
