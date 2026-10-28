/**
 * Les alertes manuelles du gérant : créer, confier (escalade nominative, module 14), marquer traitée. Audit final
 * (COD-15, relecture du 28/10) : aucun test n'importait ces actions. Sans base : accès, saisies obligatoires, « tout le
 * monde » réservé au responsable, alerte confiée à un autre intouchable, écriture conditionnée à l'assignation lue
 * (deux « Confier » simultanés), refus de la base en français.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Alerte = { assignee_account_id: string | null; assigned_all: boolean; escalades?: unknown[]; statut: string; criticite?: string };
const m = vi.hoisted(() => ({
  acces: { user: { id: "moi" }, role: "agent" } as { user: { id: string } | null; role: string | null },
  alerte: null as Alerte | null, inserts: [] as Record<string, unknown>[], updates: [] as { valeurs: Record<string, unknown>; filtres: unknown[][] }[],
  modifiees: [{ id: "a" }] as { id: string }[], erreur: null as null | { message: string }, revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    ...m.acces,
    supabase: {
      from: () => ({
        insert: async (v: Record<string, unknown>) => { m.inserts.push(v); return { error: m.erreur }; },
        select: () => { const q = { eq: () => q, maybeSingle: async () => ({ data: m.alerte }) }; return q; },
        update: (valeurs: Record<string, unknown>) => {
          const u = { valeurs, filtres: [] as unknown[][] }; m.updates.push(u);
          const q = {
            eq: (...a: unknown[]) => { u.filtres.push(["eq", ...a]); return q; },
            is: (...a: unknown[]) => { u.filtres.push(["is", ...a]); return q; },
            select: async () => ({ data: m.modifiees, error: m.erreur }),
            then: (ok: (r: unknown) => unknown) => Promise.resolve({ error: m.erreur }).then(ok),
          };
          return q;
        },
      }),
    },
  }),
}));

import { creerAlerte, escaladerAlerte, fermerAlerte } from "@/app/actions/alertes";

const ORG = "org", ALERTE = "alerte";
const form = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };

beforeEach(() => {
  vi.clearAllMocks();
  m.acces = { user: { id: "moi" }, role: "agent" };
  m.alerte = { assignee_account_id: "moi", assigned_all: false, escalades: [], statut: "ouverte", criticite: "normale" };
  m.inserts.length = 0; m.updates.length = 0; m.modifiees = [{ id: "a" }]; m.erreur = null;
});

describe("créer une alerte", () => {
  it("refuse sans accès, sans titre, avec une criticité inconnue ou sans destinataire ; la saisie est reposée", async () => {
    m.acces = { user: null, role: null };
    expect(await creerAlerte(ORG, {}, form({ titre: "x", assignee: "moi" }))).toEqual({ erreur: "Accès refusé." });
    m.acces = { user: { id: "moi" }, role: "agent" };
    expect((await creerAlerte(ORG, {}, form({ titre: " ", assignee: "moi" }))).erreur).toBe("Le titre est obligatoire.");
    expect((await creerAlerte(ORG, {}, form({ titre: "Clés", criticite: "extreme", assignee: "moi" }))).erreur).toBe("Criticité invalide.");
    const sans = await creerAlerte(ORG, {}, form({ titre: "Clés" }));
    expect(sans.erreur).toBe("Choisir à qui l'alerte est assignée.");
    expect(sans.valeurs).toEqual({ titre: "Clés" });
    expect(m.inserts).toEqual([]);
  });

  it("« tout le monde » est réservé au responsable", async () => {
    expect((await creerAlerte(ORG, {}, form({ titre: "Clés", assignee: "tous" }))).erreur).toContain("Seul le responsable");
    m.acces = { user: { id: "moi" }, role: "admin_agence" };
    expect((await creerAlerte(ORG, {}, form({ titre: "Clés", assignee: "tous", echeance: "2026-11-02" }))).succes).toBe("Alerte créée.");
    expect(m.inserts[0]).toMatchObject({ organization_id: ORG, type: "manuelle", titre: "Clés", criticite: "normale", echeance: "2026-11-02", assignee_account_id: null, assigned_all: true });
  });

  it("un refus de la base est rendu en français", async () => {
    m.erreur = { message: "L’écriture est fermée pour ce compte." };
    expect((await creerAlerte(ORG, {}, form({ titre: "Clés", assignee: "moi" }))).erreur).toBe("Création impossible : L’écriture est fermée pour ce compte.");
  });
});

describe("confier une alerte", () => {
  it("exige un destinataire et un message", async () => {
    expect((await escaladerAlerte(ORG, ALERTE, {}, form({ message: "Urgent" }))).erreur).toBe("Choisir à qui confier l'alerte.");
    expect((await escaladerAlerte(ORG, ALERTE, {}, form({ vers: "autre" }))).erreur).toBe("Le message au destinataire est obligatoire.");
    expect(m.updates).toEqual([]);
  });

  it.each([
    ["informative", { criticite: "informative" }, "Cette alerte ne peut pas être confiée."],
    ["fermée", { statut: "fermee" }, "Cette alerte ne peut pas être confiée."],
    ["confiée à un autre", { assignee_account_id: "autre" }, "Cette alerte est confiée à quelqu'un d'autre."],
  ])("refuse une alerte %s", async (_cas, sur, attendu) => {
    m.alerte = { ...m.alerte!, ...sur };
    expect((await escaladerAlerte(ORG, ALERTE, {}, form({ vers: "collegue", message: "À toi" }))).erreur).toBe(attendu);
    expect(m.updates).toEqual([]);
  });

  it("déplace l'alerte, garde l'historique, et n'écrit que si l'assignation lue n'a pas bougé", async () => {
    expect((await escaladerAlerte(ORG, ALERTE, {}, form({ vers: "collegue", message: "À toi" }))).succes).toBe("Alerte confiée.");
    const u = m.updates[0];
    expect(u.valeurs).toMatchObject({ assignee_account_id: "collegue", assigned_all: false });
    expect(u.valeurs.escalades).toEqual([expect.objectContaining({ de: "moi", vers: "collegue", par: "moi", message: "À toi" })]);
    expect(u.filtres).toContainEqual(["eq", "assignee_account_id", "moi"]);
    expect(u.filtres).toContainEqual(["eq", "statut", "ouverte"]);
  });

  it("un « Confier » concurrent passé avant : aucune ligne modifiée, la liste est rechargée et l'erreur le dit", async () => {
    m.modifiees = [];
    expect((await escaladerAlerte(ORG, ALERTE, {}, form({ vers: "collegue", message: "À toi" }))).erreur).toContain("a changé entre-temps");
    expect(m.revalidate).toHaveBeenCalledWith(`/agence/${ORG}/alertes`);
  });
});

describe("marquer une alerte traitée", () => {
  it("exige de dire ce qui a été fait, et une alerte encore ouverte qui me revient", async () => {
    expect((await fermerAlerte(ORG, ALERTE, {}, form({}))).erreur).toBe("Dire ce qui a été fait est obligatoire.");
    m.alerte = { ...m.alerte!, statut: "fermee" };
    expect((await fermerAlerte(ORG, ALERTE, {}, form({ action_effectuee: "Appelé" }))).erreur).toBe("Cette alerte n'est plus ouverte.");
    m.alerte = { ...m.alerte!, statut: "ouverte", assignee_account_id: "autre" };
    expect((await fermerAlerte(ORG, ALERTE, {}, form({ action_effectuee: "Appelé" }))).erreur).toBe("Cette alerte est confiée à quelqu'un d'autre.");
    expect(m.updates).toEqual([]);
  });

  it("le responsable ferme toute alerte ; le compte et l'action sont enregistrés", async () => {
    m.acces = { user: { id: "moi" }, role: "proprietaire_direct" };
    m.alerte = { ...m.alerte!, assignee_account_id: "autre" };
    expect((await fermerAlerte(ORG, ALERTE, {}, form({ action_effectuee: " Locataire rappelé " }))).succes).toBe("Alerte traitée.");
    expect(m.updates[0].valeurs).toMatchObject({ statut: "fermee", closed_by: "moi", closed_action: "Locataire rappelé" });
  });
});
