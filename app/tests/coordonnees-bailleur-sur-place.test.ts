/**
 * « Ajouter un bien », profil incomplet (20/11/2026) : les coordonnées du bailleur se remplissent sur place.
 *
 * En production, deux des quatre espaces propriétaires sans aucun bien se sont arrêtés devant le détour par le profil
 * complet. La règle D29 B ne change pas (sans adresse complète ni e-mail de contact, aucun bien) ; seul le chemin change.
 *
 * Ce que ces tests tiennent :
 *  1. l'action n'écrit QUE les quatre colonnes, pour le seul propriétaire direct de l'espace, après validation ;
 *  2. elle complète ensuite la fiche de la société comme le profil (SCI-2), sans qu'un échec de cette recopie bloque ;
 *  3. le formulaire : quatre champs étiquetés et obligatoires, valeurs connues reprises, lien vers le profil complet.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  role: "proprietaire_direct" as string | null,
  user: { id: "compte" } as { id: string } | null,
  majs: [] as { table: string; valeurs: Record<string, unknown>; id?: string }[],
  erreurMaj: null as null | { message: string },
  lignes: [{ id: "org" }] as { id: string }[],
  rpc: vi.fn(),
  revalider: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.user,
    role: banc.role,
    supabase: {
      from: (table: string) => ({
        update: (valeurs: Record<string, unknown>) => {
          const maj: { table: string; valeurs: Record<string, unknown>; id?: string } = { table, valeurs };
          banc.majs.push(maj);
          const fin = {
            eq: (_col: string, id: string) => { maj.id = id; return fin; },
            select: () => Promise.resolve({ data: banc.erreurMaj ? null : banc.lignes, error: banc.erreurMaj }),
          };
          return fin;
        },
      }),
      rpc: banc.rpc,
    },
  }),
}));

import { completerCoordonneesBailleur } from "@/app/actions/organisation";
import { CoordonneesBailleur } from "@/app/agence/[orgId]/parc/nouveau/coordonnees-bailleur";

function formulaire(surcharge: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", email_contact: "camille@exemple.fr", ...surcharge })) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  banc.role = "proprietaire_direct";
  banc.user = { id: "compte" };
  banc.majs = [];
  banc.erreurMaj = null;
  banc.lignes = [{ id: "org" }];
  banc.rpc.mockResolvedValue({ data: 0, error: null });
});

describe("l'action completerCoordonneesBailleur", () => {
  it("n'écrit que l'adresse, le code postal, la ville et l'e-mail de contact de CET espace, nettoyés", async () => {
    const r = await completerCoordonneesBailleur("org", {}, formulaire({ address_line1: "  5 rue des Lilas ", city: " Lyon" }));
    expect(r).toEqual({ succes: "Vos coordonnées sont enregistrées : vous pouvez créer votre bien." });
    expect(banc.majs).toEqual([{ table: "organizations", id: "org", valeurs: { address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", email_contact: "camille@exemple.fr" } }]);
  });

  it("ne touche à rien d'autre du profil, même si le formulaire en porte davantage", async () => {
    await completerCoordonneesBailleur("org", {}, formulaire({ name: "Autre nom", relance_1_jours: "1", quittances_envoi_auto: "on", iban: "FR76" }));
    expect(Object.keys(banc.majs[0].valeurs).sort()).toEqual(["address_line1", "city", "email_contact", "postal_code"]);
  });

  it("complète ensuite la fiche de la société, comme le profil, puis rafraîchit l'espace", async () => {
    await completerCoordonneesBailleur("org", {}, formulaire());
    expect(banc.rpc).toHaveBeenCalledWith("completer_fiche_societe_depuis_profil", { p_org: "org" });
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org", "layout");
  });

  it("un échec de la recopie vers la fiche de la société ne bloque pas la création du bien", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    expect((await completerCoordonneesBailleur("org", {}, formulaire())).succes).toMatch(/vous pouvez créer votre bien/);
  });

  it.each([
    [{ address_line1: "" }, /adresse complète/],
    [{ postal_code: "  " }, /adresse complète/],
    [{ city: "" }, /adresse complète/],
    [{ email_contact: "" }, /e-mail de contact valide/],
    [{ email_contact: "pas-une-adresse" }, /e-mail de contact valide/],
    [{ address_line1: "x".repeat(201) }, /trop longue/],
  ])("refuse %o avant toute écriture, et rend la saisie", async (surcharge, erreur) => {
    const r = await completerCoordonneesBailleur("org", {}, formulaire(surcharge as Record<string, string>));
    expect(r.erreur).toMatch(erreur);
    expect(r.valeurs?.city).toBe((surcharge as Record<string, string>).city ?? "Lyon");
    expect(banc.majs).toEqual([]);
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("réservée au propriétaire direct de l'espace : ni agence, ni agent, ni locataire, ni visiteur", async () => {
    for (const role of ["admin_agence", "agent", "locataire", null]) {
      banc.role = role;
      expect((await completerCoordonneesBailleur("org", {}, formulaire())).erreur, String(role)).toBe("Réservé au propriétaire de cet espace.");
    }
    banc.role = "proprietaire_direct";
    banc.user = null;
    expect((await completerCoordonneesBailleur("org", {}, formulaire())).erreur).toBe("Réservé au propriétaire de cet espace.");
    expect(banc.majs).toEqual([]);
  });

  it("une modification refusée par la base (aucune ligne) est dite, sans prétendre l'avoir faite", async () => {
    banc.lignes = [];
    expect((await completerCoordonneesBailleur("org", {}, formulaire())).erreur).toBe("Modification refusée.");
    expect(banc.rpc).not.toHaveBeenCalled();
  });
});

describe("le formulaire sur la page « Ajouter un bien »", () => {
  const rendre = (initiales = { address_line1: "", postal_code: "", city: "", email_contact: "" }) =>
    renderToStaticMarkup(createElement(CoordonneesBailleur, { orgId: "org", manquants: ["votre adresse"], initiales, lienProfil: "/espace/org/profil?retour=nouveau-lot" }));
  const balise = (html: string, nom: string) => new RegExp(`<input\\b[^>]*\\bname="${nom}"[^>]*>`).exec(html)?.[0] ?? "";

  it("dit ce qui manque et pourquoi, sous un titre de niveau 2", () => {
    const html = rendre();
    expect(html).toContain("D&#x27;abord, vos coordonnées de bailleur");
    expect(html).toContain("Il manque votre adresse.");
    expect(html).not.toContain("<h1");
  });

  it("quatre champs obligatoires, chacun avec son étiquette", () => {
    const html = rendre();
    for (const nom of ["address_line1", "postal_code", "city", "email_contact"]) {
      const champ = balise(html, nom);
      expect(champ, nom).toContain("required");
      const id = /\bid="([^"]+)"/.exec(champ)?.[1];
      expect(html, nom).toContain(`for="${id}"`);
    }
    expect(balise(html, "email_contact")).toContain('type="email"');
  });

  it("reprend les valeurs déjà connues, dont l'e-mail proposé", () => {
    const html = rendre({ address_line1: "", postal_code: "", city: "Lyon", email_contact: "compte@exemple.fr" });
    expect(balise(html, "city")).toContain('value="Lyon"');
    expect(balise(html, "email_contact")).toContain('value="compte@exemple.fr"');
  });

  it("propose toujours le profil complet, sans y obliger", () => {
    const html = rendre();
    expect(html).toContain('href="/espace/org/profil?retour=nouveau-lot"');
    expect(html).toContain("Compléter tout mon profil");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*Enregistrer et créer mon bien/);
  });
});
