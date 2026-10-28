/**
 * La vérification par la supervision du site ou de l'expéditeur d'une agence en marque blanche. Audit final (COD-15,
 * relecture du 28/10) : aucun test n'importait l'action (seule la bibliothèque src/lib/verification-marque l'était). Sans
 * base ni fournisseur : supervision exigée, entrée bornée, connexion renseignée, résultat enregistré seulement si le
 * profil n'a pas changé, et une vérification négative n'active rien.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  superadmin: true, org: { id: "", domaine_personnalise: "gestion.agence.fr", email_expediteur: "contact@agence.fr" } as Record<string, string | null>,
  service: true, modifie: true, site: vi.fn(), expediteur: vi.fn(), journal: vi.fn(), mises: [] as Record<string, unknown>[], filtres: [] as unknown[][], revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/verification-marque", () => ({ verifierSiteMarque: m.site, verifierExpediteurMarque: m.expediteur }));
vi.mock("@/lib/journal-supervision", () => ({ journaliserSupervision: m.journal }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: m.superadmin, error: null }),
    from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: m.org, error: null }) }; return q; },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => m.service ? {
    from: () => ({ update: (v: Record<string, unknown>) => { m.mises.push(v); const q = { eq: (...a: unknown[]) => { m.filtres.push(a); return q; }, select: () => q, maybeSingle: async () => ({ data: m.modifie ? { id: "x" } : null, error: null }) }; return q; } }),
  } : null,
}));

import { verifierConnexionMarque } from "@/app/actions/verification-marque";

const ORG = "00000000-0000-4000-8000-000000000001";
const form = (type = "site", organisation = ORG) => { const f = new FormData(); f.set("type", type); f.set("organisation", organisation); return f; };

beforeEach(() => {
  vi.clearAllMocks(); m.mises.length = 0; m.filtres.length = 0;
  Object.assign(m, { superadmin: true, service: true, modifie: true });
  m.org = { id: ORG, domaine_personnalise: "gestion.agence.fr", email_expediteur: "contact@agence.fr" };
  m.site.mockResolvedValue(true); m.expediteur.mockResolvedValue(true);
});

describe("vérifier une connexion de marque blanche", () => {
  it("refuse hors supervision, puis une connexion mal formée", async () => {
    m.superadmin = false;
    expect((await verifierConnexionMarque({}, form())).erreur).toContain("réservée à la supervision");
    m.superadmin = true;
    expect((await verifierConnexionMarque({}, form("ftp"))).erreur).toBe("Choisissez une connexion valide.");
    expect((await verifierConnexionMarque({}, form("site", "org"))).erreur).toBe("Choisissez une connexion valide.");
    expect(m.site).not.toHaveBeenCalled();
  });

  it("refuse une connexion non renseignée dans le profil, et un service indisponible", async () => {
    m.org = { ...m.org, domaine_personnalise: null };
    expect((await verifierConnexionMarque({}, form())).erreur).toContain("Renseignez cette connexion");
    m.org = { ...m.org, domaine_personnalise: "gestion.agence.fr" };
    m.service = false;
    expect((await verifierConnexionMarque({}, form())).erreur).toBe("Le service de vérification est indisponible.");
    expect(m.site).not.toHaveBeenCalled();
  });

  it("site confirmé : journalisé, daté seulement si le domaine n'a pas changé, écrans rafraîchis", async () => {
    expect((await verifierConnexionMarque({}, form())).succes).toContain("confirmée");
    expect(m.site).toHaveBeenCalledWith("gestion.agence.fr");
    expect(m.journal).toHaveBeenCalledWith(expect.anything(), "marque_verifiee", { connexion: "site", confirmee: true }, ORG);
    expect(m.mises[0]).toEqual({ domaine_personnalise_verifie_le: expect.any(String) });
    expect(m.filtres).toContainEqual(["domaine_personnalise", "gestion.agence.fr"]);
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual(["/admin/marque-blanche", `/agence/${ORG}/profil`]);
  });

  it("expéditeur non confirmé : la date est effacée, l'erreur le dit ; profil modifié pendant la vérification : rien n'est confirmé", async () => {
    m.expediteur.mockResolvedValue(false);
    expect((await verifierConnexionMarque({}, form("email"))).erreur).toContain("ne confirme pas encore");
    expect(m.mises[0]).toEqual({ email_expediteur_verifie_le: null });
    m.modifie = false;
    expect((await verifierConnexionMarque({}, form())).erreur).toContain("La connexion a changé");
  });

  it("une panne du fournisseur ne divulgue pas de détail technique", async () => {
    m.site.mockRejectedValue(new Error("getaddrinfo ENOTFOUND gestion.agence.fr"));
    expect((await verifierConnexionMarque({}, form())).erreur).toBe("La connexion n’a pas pu être vérifiée. Consultez les réglages du fournisseur.");
  });
});
