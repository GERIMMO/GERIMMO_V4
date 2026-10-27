import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), acces: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: banc.acces,
  verifierLocataire: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  notifierDevisDemande: vi.fn(), notifierDevisRefuse: vi.fn(), notifierIncidentUrgentDeclare: vi.fn(),
  notifierMissionAnnulee: vi.fn(), notifierMissionConfiee: vi.fn(), notifierRendezVousFixe: vi.fn(),
  notifierRevisionDemandee: vi.fn(),
}));
import { cloturerIncident, qualifierIncident } from "@/app/actions/incidents";

beforeEach(() => {
  vi.clearAllMocks();
  banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { rpc: banc.rpc } });
  banc.rpc.mockResolvedValue({ data: null, error: null });
});

function formulaire(champs: Record<string, string>) {
  const formData = new FormData();
  for (const [nom, valeur] of Object.entries(champs)) formData.set(nom, valeur);
  return formData;
}
const gestes: {
  nom: string;
  action: typeof qualifierIncident;
  rpc: string;
  champs: Record<string, string>;
  parametres: Record<string, string>;
}[] = [
  {
    nom: "qualification", action: qualifierIncident, rpc: "qualifier_incident",
    champs: { imputation: "proprietaire", justification: "  Canalisation vétuste  " },
    parametres: { p_imputation: "proprietaire", p_justification: "Canalisation vétuste" },
  },
  {
    nom: "clôture", action: cloturerIncident, rpc: "cloturer_incident",
    champs: { motif: "resolu", commentaire: "  Réparation vérifiée  " },
    parametres: { p_motif: "resolu", p_commentaire: "Réparation vérifiée" },
  },
];

describe.each(gestes)("rafraîchissement des vérifications après $nom", geste => {
  it("rafraîchit les espaces propriétaire et agence après le succès métier", async () => {
    const resultat = await geste.action("org", "incident", {}, formulaire(geste.champs));
    expect(resultat.succes).toBeTruthy();
    expect(banc.rpc).toHaveBeenCalledExactlyOnceWith(geste.rpc, {
      p_org: "org", p_incident: "incident", ...geste.parametres,
    });
    expect(banc.revalidatePath.mock.calls.map(([chemin]) => chemin).sort()).toEqual([
      "/agence/org", "/agence/org/alertes", "/agence/org/incidents",
      "/espace/org", "/espace/org/alertes", "/espace/org/incidents",
    ]);
  });

  it("conserve la demande et la saisie si le geste métier est refusé", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "La situation a changé." } });
    const resultat = await geste.action("org", "incident", {}, formulaire(geste.champs));
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.succes).toBeUndefined();
    expect(resultat.valeurs).toMatchObject(geste.champs);
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it("ne soumet ni ne rafraîchit sans accès autorisé", async () => {
    banc.acces.mockResolvedValue({ user: null, supabase: { rpc: banc.rpc } });
    expect(await geste.action("org", "incident", {}, formulaire(geste.champs)))
      .toEqual({ erreur: "Accès refusé." });
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it("ne fait pas disparaître la demande pour un formulaire incomplet", async () => {
    const resultat = await geste.action("org", "incident", {}, new FormData());
    expect(resultat.erreur).toBeTruthy();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});
