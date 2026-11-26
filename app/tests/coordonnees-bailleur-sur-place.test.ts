/**
 * « Ajouter un bien », profil incomplet (20/11/2026) : les coordonnées du bailleur se remplissent sur place.
 *
 * En production, deux des quatre espaces propriétaires sans aucun bien se sont arrêtés devant le détour par le profil
 * complet. La règle D29 B ne change pas (sans adresse complète ni e-mail de contact, aucun bien) ; seul le chemin change.
 *
 * Ce que ces tests tiennent :
 *  1. l'action n'écrit QUE les quatre colonnes, pour le seul propriétaire direct de l'espace, après validation ;
 *  2. elle complète ensuite la fiche de la société comme le profil (SCI-2), sans qu'un échec de cette recopie bloque ;
 *  2 bis. (26/11/2026) elle reporte aussi l'adresse sur la fiche « personne » du compte d'un particulier, si cette fiche
 *     est la seule du compte et n'a aucune adresse : sans cela, le bail affichait « Adresse à compléter » et refusait
 *     tout PDF (parcours de vérification du jour de publication). Jamais par-dessus une saisie, jamais une autre fiche ;
 *  3. le formulaire : quatre champs étiquetés et obligatoires, valeurs connues reprises, lien vers le profil complet.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  role: "proprietaire_direct" as string | null,
  user: { id: "compte" } as { id: string } | null,
  majs: [] as { table: string; valeurs: Record<string, unknown>; id?: string; vides?: string[] }[],
  lignesFiche: null as null | { id: string }[],
  erreurMaj: null as null | { message: string },
  lignes: [{ id: "org" }] as { id: string }[],
  rpc: vi.fn(),
  revalider: vi.fn(),
  fiches: [] as Record<string, unknown>[],
  erreurLectureFiche: null as null | { message: string },
  erreurEcritureFiche: null as null | { message: string },
  filtresFiche: [] as [string, string, unknown][],
}));

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.user,
    role: banc.role,
    supabase: {
      from: (table: string) => ({
        // Lecture de la fiche du compte (persons) : filtres retenus pour vérifier qu'aucune autre fiche n'est visée.
        select: () => {
          const chaine = {
            eq: (col: string, v: unknown) => { banc.filtresFiche.push(["eq", col, v]); return chaine; },
            is: (col: string, v: unknown) => {
              banc.filtresFiche.push(["is", col, v]);
              return Promise.resolve({ data: banc.erreurLectureFiche ? null : banc.fiches, error: banc.erreurLectureFiche });
            },
          };
          return chaine;
        },
        update: (valeurs: Record<string, unknown>) => {
          const maj: { table: string; valeurs: Record<string, unknown>; id?: string; vides?: string[] } = { table, valeurs };
          banc.majs.push(maj);
          const fin = {
            eq: (col: string, id: string) => { if (col === "id") maj.id = id; return fin; },
            // Conditions « champ encore vide » répétées dans l'écriture de la fiche.
            is: (col: string, _v: null) => { (maj.vides ??= []).push(col); return fin; },
            select: () => table === "persons"
              ? Promise.resolve({ data: banc.erreurEcritureFiche ? null : (banc.lignesFiche ?? [{ id: maj.id }]), error: banc.erreurEcritureFiche })
              : Promise.resolve({ data: banc.erreurMaj ? null : banc.lignes, error: banc.erreurMaj }),
          };
          return fin;
        },
      }),
      rpc: banc.rpc,
    },
  }),
}));

import { completerCoordonneesBailleur, modifierProfilOrganisation } from "@/app/actions/organisation";
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
  banc.fiches = [];
  banc.erreurLectureFiche = null;
  banc.erreurEcritureFiche = null;
  banc.filtresFiche = [];
  banc.lignesFiche = null;
});

const ficheVide = (surcharge: Record<string, unknown> = {}) => ({ id: "fiche-compte", qualite: "Personne physique", address_line1: null, postal_code: null, city: null, ...surcharge });
const ecrituresFiche = () => banc.majs.filter((m) => m.table === "persons");

describe("la fiche « personne » du compte reçoit l'adresse du bailleur (26/11/2026)", () => {
  it.each(["Personne physique", "Indivision (personnes physiques)", null])("%s, fiche sans adresse : rue, code postal et ville recopiés sur CETTE fiche", async (qualite) => {
    banc.fiches = [ficheVide({ qualite })];
    const r = await completerCoordonneesBailleur("org", {}, formulaire());
    expect(r).toEqual({ succes: "Vos coordonnées sont enregistrées : vous pouvez créer votre bien." });
    expect(banc.majs.map((m) => m.table)).toEqual(["organizations", "persons"]);
    expect(ecrituresFiche()).toEqual([{ table: "persons", id: "fiche-compte", valeurs: { address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon" }, vides: ["address_line1", "postal_code", "city"] }]);
    expect(banc.filtresFiche).toEqual([["eq", "organization_id", "org"], ["eq", "account_id", "compte"], ["is", "archived_at", null]]);
    // Le rafraîchissement de tout l'espace (layout) couvre aussi « Personnes ».
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org", "layout");
  });

  it.each(["SCI", "SCI familiale", "Personne morale"])("%s : la fiche de société reste confiée à la base (SCI-2), aucune écriture ici", async (qualite) => {
    banc.fiches = [ficheVide({ qualite })];
    await completerCoordonneesBailleur("org", {}, formulaire());
    expect(ecrituresFiche()).toEqual([]);
    expect(banc.rpc).toHaveBeenCalledWith("completer_fiche_societe_depuis_profil", { p_org: "org" });
  });

  it.each([
    ["adresse complète déjà saisie", { address_line1: "1 place Bellecour", postal_code: "69002", city: "Lyon" }],
    ["ville seule déjà saisie", { city: "Villeurbanne" }],
    ["code postal seul déjà saisi", { postal_code: "69100" }],
  ])("%s : jamais par-dessus une saisie, même partielle", async (_cas, adresse) => {
    banc.fiches = [ficheVide(adresse)];
    await completerCoordonneesBailleur("org", {}, formulaire());
    expect(ecrituresFiche()).toEqual([]);
  });

  it("adresse partielle saisie à l'inscription et qui concorde (casse, espaces) : seuls les champs vides sont complétés", async () => {
    banc.fiches = [ficheVide({ city: "  lyon " })];
    await completerCoordonneesBailleur("org", {}, formulaire());
    expect(ecrituresFiche()).toEqual([{ table: "persons", id: "fiche-compte", valeurs: { address_line1: "5 rue des Lilas", postal_code: "69003" }, vides: ["address_line1", "postal_code"] }]);
  });

  it("une saisie faite entre-temps dans « Personnes » (zéro ligne écrite) n'est pas écrasée, et rien d'alarmant n'est dit", async () => {
    banc.fiches = [ficheVide()];
    banc.lignesFiche = [];
    const r = await completerCoordonneesBailleur("org", {}, formulaire());
    expect(r).toEqual({ succes: "Vos coordonnées sont enregistrées : vous pouvez créer votre bien." });
  });

  it.each([["aucune fiche du compte", 0], ["deux fiches du compte", 2]])("%s : on ne choisit pas, rien n'est écrit, le message ne change pas", async (_cas, n) => {
    banc.fiches = Array.from({ length: n as number }, (_v, i) => ficheVide({ id: `fiche-${i}` }));
    const r = await completerCoordonneesBailleur("org", {}, formulaire());
    expect(r.succes).toBe("Vos coordonnées sont enregistrées : vous pouvez créer votre bien.");
    expect(ecrituresFiche()).toEqual([]);
  });

  it("un code postal qu'une fiche refuserait n'est pas recopié (l'espace, lui, est enregistré comme avant)", async () => {
    banc.fiches = [ficheVide()];
    const r = await completerCoordonneesBailleur("org", {}, formulaire({ postal_code: "AB" }));
    expect(r.succes).toMatch(/vous pouvez créer votre bien/);
    expect(banc.majs.map((m) => m.table)).toEqual(["organizations"]);
  });

  it.each([["lecture", "erreurLectureFiche"], ["écriture", "erreurEcritureFiche"]] as const)("échec de %s de la fiche : l'espace reste enregistré, et c'est dit", async (_cas, cle) => {
    banc.fiches = [ficheVide()];
    banc[cle] = { message: "indisponible" };
    const r = await completerCoordonneesBailleur("org", {}, formulaire());
    expect(r.succes).toMatch(/^Vos coordonnées sont enregistrées : vous pouvez créer votre bien\. Votre fiche de bailleur n'a pas pu être complétée/);
    expect(banc.majs[0].table).toBe("organizations");
  });

  it("refus avant écriture (adresse incomplète) : la fiche n'est même pas lue", async () => {
    banc.fiches = [ficheVide()];
    await completerCoordonneesBailleur("org", {}, formulaire({ city: "" }));
    expect(banc.filtresFiche).toEqual([]);
    expect(banc.majs).toEqual([]);
  });
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

describe("le profil complet recopie aussi l'adresse sur la fiche du particulier (26/11/2026)", () => {
  function profil(surcharge: Record<string, string> = {}) {
    const f = new FormData();
    for (const [k, v] of Object.entries({ name: "Camille Martin", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", email_contact: "camille@exemple.fr", ...surcharge })) f.set(k, v);
    return f;
  }

  it("fiche sans adresse : recopiée, et c'est dit", async () => {
    banc.fiches = [ficheVide()];
    const r = await modifierProfilOrganisation("org", {}, profil());
    expect(r.succes).toMatch(/Votre fiche de bailleur a reçu cette adresse/);
    expect(ecrituresFiche()).toEqual([{ table: "persons", id: "fiche-compte", valeurs: { address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon" }, vides: ["address_line1", "postal_code", "city"] }]);
  });

  it("fiche portant une autre adresse (déménagement) : rien n'est écrit, et c'est dit", async () => {
    banc.fiches = [ficheVide({ address_line1: "1 place Bellecour", postal_code: "69002", city: "Lyon" })];
    const r = await modifierProfilOrganisation("org", {}, profil());
    expect(r.succes).toMatch(/Votre fiche de bailleur garde son adresse actuelle/);
    expect(ecrituresFiche()).toEqual([]);
  });

  it("profil sans adresse complète : la fiche n'est pas lue", async () => {
    banc.fiches = [ficheVide()];
    await modifierProfilOrganisation("org", {}, profil({ city: "" }));
    expect(banc.filtresFiche).toEqual([]);
    expect(ecrituresFiche()).toEqual([]);
  });

  it("agence : aucune fiche lue ni écrite", async () => {
    banc.role = "admin_agence";
    banc.fiches = [ficheVide()];
    await modifierProfilOrganisation("org", {}, profil());
    expect(banc.filtresFiche).toEqual([]);
    expect(ecrituresFiche()).toEqual([]);
  });
});
