import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commanderConsigne } from "@/app/actions/consignes-vacances";

// SA-03 : une consigne sans aucune tâche (texte vague, aucune lecture cochée)
// affichait « Aucune tâche proposée » mais offrait quand même « Autoriser », et
// la base enregistrait l'accord. Sans tâche, il n'y a rien à autoriser.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), taches: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({ eq: (colonne: string, valeur: string) => ({ limit: async () => mocks.taches(table, colonne, valeur) }) }),
    }),
  }),
}));

const formulaire = (commande: string, id = "version-1") => {
  const f = new FormData(); f.set("commande", commande); f.set("id", id); return f;
};
const appelsDecision = () => mocks.rpc.mock.calls.filter(([nom]) => nom === "decider_consigne");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: null, error: null }));
  mocks.taches.mockResolvedValue({ data: [], error: null });
});

describe("SA-03 : autoriser une version qui n’a aucune tâche", () => {
  it("refuse d’autoriser et ne contacte pas la base pour décider", async () => {
    const retour = await commanderConsigne({}, formulaire("approuver"));
    expect(retour.erreur).toMatch(/aucune tâche/i);
    expect(retour.erreur).toMatch(/nouvelle version/i);
    expect(retour.succes).toBeUndefined();
    expect(appelsDecision()).toHaveLength(0);
    expect(mocks.taches).toHaveBeenCalledWith("supervision_consignes_taches", "version_id", "version-1");
  });

  it("autorise une version qui a au moins une tâche", async () => {
    mocks.taches.mockResolvedValue({ data: [{ id: "t1" }], error: null });
    const retour = await commanderConsigne({}, formulaire("approuver"));
    expect(retour.erreur).toBeUndefined();
    expect(appelsDecision()).toEqual([["decider_consigne", { p_version: "version-1", p_accepter: true }]]);
  });

  it("ne dit pas « aucune tâche » quand la lecture des tâches échoue", async () => {
    mocks.taches.mockResolvedValue({ data: null, error: { message: "panne" } });
    const retour = await commanderConsigne({}, formulaire("approuver"));
    expect(retour.erreur).toBeTruthy();
    expect(retour.erreur).not.toMatch(/aucune tâche/i);
    expect(appelsDecision()).toHaveLength(0);
  });

  it("laisse refuser une version sans tâche (rien à craindre d’un refus)", async () => {
    const retour = await commanderConsigne({}, formulaire("refuser"));
    expect(retour.erreur).toBeUndefined();
    expect(appelsDecision()).toEqual([["decider_consigne", { p_version: "version-1", p_accepter: false }]]);
  });

  it("n’examine pas les tâches avant la vérification du superviseur", async () => {
    mocks.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: false, error: null } : { data: null, error: null }));
    const retour = await commanderConsigne({}, formulaire("approuver"));
    expect(retour.erreur).toMatch(/superviseur permanent/);
    expect(mocks.taches).not.toHaveBeenCalled();
  });
});

describe("SA-03 : l’écran", () => {
  const page = readFileSync("src/app/admin/consignes/page.tsx", "utf8");
  it("n’offre le bouton « Autoriser » que s’il y a au moins une tâche", () => {
    expect(page).toMatch(/!accord&&!c\.suspendue&&<div[^>]*>\{travail\.length>0&&<CommandeConsigne[^>]*commande="approuver"/);
  });
  it("garde « Refuser » et l’explication « Aucune tâche proposée »", () => {
    expect(page).toContain('commande="refuser"');
    expect(page).toContain("Aucune tâche proposée. Précisez les lectures dans une nouvelle version.");
  });
});
