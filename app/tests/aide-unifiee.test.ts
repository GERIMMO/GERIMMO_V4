import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContenuAssistance, type ParametresAssistance } from "@/app/assistance/contenu-assistance";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.auth } }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/retours", () => ({ envoyerRetour: vi.fn(), soutenirRetour: vi.fn() }));

type Requete = { table: string; filtres: [string, unknown][]; plage?: [number, number] };
let requetes: Requete[];
let role: string;
let erreurDemandes: boolean;
let compteDemandes: number;

beforeEach(() => {
  vi.clearAllMocks();
  requetes = []; role = "proprietaire_direct"; erreurDemandes = false; compteDemandes = 0;
  mocks.auth.mockResolvedValue({ data: { user: { id: "compte-proprietaire" } } });
  mocks.rpc.mockImplementation(async (nom: string) => {
    if (nom !== "mes_adhesions_navigation") throw new Error("RPC inattendue");
    return { data: [{ role, organization: { id: "org-1", name: "Mon parc" } }], error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    const r: Requete = { table, filtres: [] }; requetes.push(r);
    const resoudre = () => table === "artisans" ? { data: null, error: null }
      : { data: [], error: erreurDemandes && table === "retours_utilisateurs" ? { message: "indisponible" } : null, count: table === "retours_utilisateurs" ? compteDemandes : 0 };
    const q = { select: () => q, order: () => q, eq: (champ: string, valeur: unknown) => { r.filtres.push([champ, valeur]); return q; }, in: (champ: string, valeur: unknown) => { r.filtres.push([champ, valeur]); return q; }, range: (de: number, a: number) => { r.plage = [de, a]; return q; }, maybeSingle: async () => resoudre(), then: (ok: (r: unknown) => unknown) => Promise.resolve(resoudre()).then(ok) };
    return q;
  });
});
const rendre = async (params: ParametresAssistance = {}, integre = true) => renderToStaticMarkup(await ContenuAssistance({ searchParams: Promise.resolve(params), orgIdIntegre: integre ? "org-1" : undefined }));

describe("aide propriétaire regroupée en sections", () => {
  it("affiche ensemble formulaire, suivi et idées, sans onglets de page", async () => {
    const html = await rendre({ vue: "idees" });
    expect(html).toContain('id="nouvelle"');
    expect(html).toContain('id="mes-demandes"');
    expect(html).toContain('id="idees"');
    expect(html).not.toContain('aria-label="Suivi des demandes"');
    const lectures = requetes.filter(r => r.table === "retours_utilisateurs");
    expect(lectures).toHaveLength(2);
    expect(lectures[0].filtres).toContainEqual(["auteur_id", "compte-proprietaire"]);
    expect(lectures[1].filtres).toContainEqual(["nature", "idee"]);
  });
  it("conserve deux paginations indépendantes et le contexte anonymisé", async () => {
    compteDemandes = 80;
    const html = await rendre({ page: "2", pageIdees: "3", ecran: "/espace/identifiant/baux/dossier?secret=test", retour: "/espace/org-1/parc" });
    expect(requetes.filter(r => r.table === "retours_utilisateurs").map(r => r.plage)).toEqual([[20, 39], [40, 59]]);
    // Décision D27 : l'aide du propriétaire direct vit sous /espace/<id>/faq.
    expect(html).toContain("/espace/org-1/faq?pageIdees=3&amp;page=1");
    expect(html).toContain("/espace/org-1/faq?page=2&amp;pageIdees=4");
    expect(html).not.toContain("/agence/org-1/faq");
    expect(html).not.toContain("secret=test");
  });
  it("redirige l'ancien lien propriétaire vers la section du formulaire", async () => {
    await expect(rendre({ retour: "/agence/org-1/abonnement", type: "idee" }, false)).rejects.toThrow(/REDIRECT:\/espace\/org-1\/faq\?.*type=idee#nouvelle/);
  });
  it("reconnaît la page d'où l'aide est ouverte sous l'une ou l'autre racine (ancien lien /agence, adresse /espace)", async () => {
    await expect(rendre({ retour: "/espace/org-1/abonnement", type: "idee" }, false)).rejects.toThrow(/REDIRECT:\/espace\/org-1\/faq\?.*type=idee#nouvelle/);
    await expect(rendre({ retour: "/agence/org-1/abonnement", type: "idee" }, false)).rejects.toThrow(/REDIRECT:\/espace\/org-1\/faq\?.*type=idee#nouvelle/);
  });
  it("conserve la page des idées d'un ancien lien", async () => {
    await expect(rendre({ retour: "/agence/org-1/parc", vue: "idees", page: "2" }, false)).rejects.toThrow(/pageIdees=2#idees/);
  });
  it("préserve l'aide indépendante pour un autre portail", async () => {
    role = "admin_agence";
    const html = await rendre({ retour: "/agence/org-1/parc" }, false);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain('aria-label="Suivi des demandes"');
  });
  it("distingue deux bailleurs dans le formulaire du locataire avec la projection du portail", async () => {
    mocks.rpc.mockResolvedValue({ data: ["Pins","Ormes"].map(nom => ({
      role: "locataire", organization: { id: nom.toLowerCase(), name: nom },
    })), error: null });
    const html = await rendre({}, false);
    for (const nom of ["Pins", "Ormes"]) expect(html).toContain(nom);
    expect(mocks.rpc).toHaveBeenCalledWith("mes_adhesions_navigation");
    expect(mocks.from).not.toHaveBeenCalledWith("organizations");
    expect(mocks.from).not.toHaveBeenCalledWith("memberships");
  });
  it("ne présente pas un échec de lecture comme un suivi vide", async () => {
    erreurDemandes = true;
    const html = await rendre();
    expect(html).toContain("Le suivi n’a pas pu être chargé complètement");
    expect(html).not.toContain("Vous n’avez pas encore de demande");
    expect(html).toContain("Les idées n’ont pas pu être chargées");
  });
  it("exige une session avant toute lecture des demandes", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    await expect(rendre()).rejects.toThrow("REDIRECT:/connexion");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
