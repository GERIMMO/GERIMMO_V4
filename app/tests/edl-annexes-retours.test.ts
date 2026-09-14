import { isValidElement, type ReactNode, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  autorise: true,
  compteurs: [{ id: "compteur-test" }],
  cles: [{ id: "cle-test" }],
  erreurCompteurs: false,
  erreurCles: false,
  rpc: vi.fn(),
  revalider: vi.fn(),
  from: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useId: () => "form-annexes-test",
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("@/lib/use-action-formulaire", () => ({
  useActionFormulaire: () => ({ etat: { erreur: "EDL signé : les annexes sont figées" }, soumettre: vi.fn(), enCours: false, version: 0 }),
}));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.autorise ? { id: "agent-test" } : null,
    supabase: { rpc: banc.rpc, from: banc.from },
  }),
}));

import { enregistrerAnnexesEdl } from "@/app/actions/edl";
import { EdlAnnexes } from "@/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-annexes";

beforeEach(() => {
  vi.clearAllMocks();
  banc.autorise = true;
  banc.compteurs = [{ id: "compteur-test" }];
  banc.cles = [{ id: "cle-test" }];
  banc.erreurCompteurs = false;
  banc.erreurCles = false;
  banc.rpc.mockResolvedValue({ error: null });
  banc.from.mockImplementation((table: string) => {
    const compteurs = table === "edl_compteurs";
    const lecture = {
      select: () => lecture,
      eq: () => lecture,
      then: (resoudre: (valeur: unknown) => unknown) => Promise.resolve({
        data: compteurs ? banc.compteurs : banc.cles,
        error: (compteurs ? banc.erreurCompteurs : banc.erreurCles) ? { message: "lecture indisponible" } : null,
      }).then(resoudre),
    };
    return lecture;
  });
});

function saisie() {
  const form = new FormData();
  form.set("releve_compteur-test", " 123.456 ");
  form.set("nombre_cle-test", "2");
  return form;
}
const enregistrer = (form = saisie()) => enregistrerAnnexesEdl("org-test", "bail-test", "edl-test", {}, form);

describe("Annexes EDL : enregistrement sans faux succès ni perte de saisie", () => {
  it.each(["compteurs", "cles"])("refuse toute mutation si la lecture des %s échoue", async (lecture) => {
    if (lecture === "compteurs") banc.erreurCompteurs = true;
    else banc.erreurCles = true;
    const resultat = await enregistrer();
    expect(resultat.erreur).toContain("Impossible de lire les relevés et les clés");
    expect(resultat.succes).toBeUndefined();
    expect(resultat.valeurs).toMatchObject({ "releve_compteur-test": " 123.456 ", "nombre_cle-test": "2" });
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalider).not.toHaveBeenCalled();
  });

  it("transmet les relevés décimaux et le nombre de clés ensemble", async () => {
    expect(await enregistrer()).toEqual({ succes: "Relevés enregistrés." });
    expect(banc.rpc).toHaveBeenCalledWith("enregistrer_annexes_edl", {
      p_edl: "edl-test", p_compteurs: [{ id: "compteur-test", releve: 123.456 }], p_cles: [{ id: "cle-test", nombre: 2 }],
    });
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org-test/baux/bail-test/edl/edl-test");
  });

  it("ne touche pas aux lignes ajoutées après l’ouverture du formulaire", async () => {
    banc.compteurs.push({ id: "nouveau-compteur" });
    banc.cles.push({ id: "nouvelle-cle" });
    await enregistrer();
    expect(banc.rpc).toHaveBeenCalledWith("enregistrer_annexes_edl", {
      p_edl: "edl-test", p_compteurs: [{ id: "compteur-test", releve: 123.456 }], p_cles: [{ id: "cle-test", nombre: 2 }],
    });
  });

  it("distingue relevé vidé, clé non comptée et zéro clé", async () => {
    const form = saisie();
    form.set("releve_compteur-test", "");
    form.set("nombre_cle-test", "");
    await enregistrer(form);
    expect(banc.rpc).toHaveBeenLastCalledWith("enregistrer_annexes_edl", {
      p_edl: "edl-test", p_compteurs: [{ id: "compteur-test", releve: null }], p_cles: [],
    });
    form.set("nombre_cle-test", "0");
    await enregistrer(form);
    expect(banc.rpc).toHaveBeenLastCalledWith("enregistrer_annexes_edl", expect.objectContaining({ p_cles: [{ id: "cle-test", nombre: 0 }] }));
  });

  it.each([
    ["releve_compteur-test", "Infinity", "Relevé de compteur invalide."],
    ["nombre_cle-test", "abc", "Nombre de clés invalide."],
    ["nombre_cle-test", "-1", "Nombre de clés invalide."],
  ])("refuse %s=%s avant tout enregistrement", async (champ, valeur, message) => {
    const form = saisie();
    form.set(champ, valeur);
    const resultat = await enregistrer(form);
    expect(resultat.erreur).toBe(message);
    expect(resultat.valeurs?.[champ]).toBe(valeur);
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("rend le refus métier et les valeurs sans annoncer d’enregistrement", async () => {
    banc.rpc.mockResolvedValue({ error: { message: "EDL signé : les annexes sont figées" } });
    const resultat = await enregistrer();
    expect(resultat.erreur).toBe("EDL signé : les annexes sont figées");
    expect(resultat.succes).toBeUndefined();
    expect(resultat.valeurs).toMatchObject({ "releve_compteur-test": " 123.456 ", "nombre_cle-test": "2" });
    expect(banc.revalider).not.toHaveBeenCalled();
  });

  it("refuse la session sans accès avant les lectures", async () => {
    banc.autorise = false;
    expect(await enregistrer()).toEqual({ erreur: "Accès refusé." });
    expect(banc.from).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("le formulaire affichant le refus empêche le reset de ses relevés et clés associés", () => {
    function elements(noeud: ReactNode): ReactElement<Record<string, unknown>>[] {
      if (Array.isArray(noeud)) return noeud.flatMap(elements);
      if (!isValidElement<{ children?: ReactNode }>(noeud)) return [];
      return [noeud as ReactElement<Record<string, unknown>>, ...elements(noeud.props.children)];
    }
    const arbre = EdlAnnexes({
      orgId: "org-test", bailId: "bail-test", edlId: "edl-test", signe: false, entree: null,
      compteurs: [{ id: "compteur-test", type: "Eau froide", numero: null, releve: 100 }],
      cles: [{ id: "cle-test", libelle: "Porte", reference: null, nombre: 1 }],
      enregistrer: vi.fn(),
    });
    const controles = elements(arbre);
    const formulaire = controles.find((e) => e.type === "form" && e.props.id);
    expect(formulaire).toBeDefined();
    expect(controles.filter((e) => e.props.form === formulaire!.props.id).map((e) => e.props.name))
      .toEqual(["releve_compteur-test", "nombre_cle-test"]);
    expect(elements(formulaire).some((e) => e.props.children === "EDL signé : les annexes sont figées")).toBe(true);
    const remiseAZero = new Event("reset", { cancelable: true });
    (formulaire!.props.onReset as (event: Event) => void)(remiseAZero);
    expect(remiseAZero.defaultPrevented).toBe(true);
  });
});
