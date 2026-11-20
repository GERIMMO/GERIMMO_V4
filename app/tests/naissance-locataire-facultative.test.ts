/**
 * Décision du dirigeant du 20/11/2026 : la fiche d'un LOCATAIRE n'exige plus sa date ni sa commune de naissance.
 *
 * Le frein constaté : un propriétaire qui arrive avec un locataire déjà en place devait retrouver sa date et sa commune
 * de naissance pour créer sa fiche, alors que son bail est signé depuis longtemps. Ces deux mentions ne servent qu'au
 * contrat que Gerimmo rédige : le récapitulatif du bail les réclame alors (tests/completude-brouillon-bail.test.ts).
 *
 * Ce que ces tests tiennent :
 *  1. création : facultatives pour le rôle « locataire », toujours exigées pour un garant, un propriétaire mandant ou une
 *     fiche sans rôle ; une date saisie reste contrôlée ; une naissance absente s'enregistre NULL, jamais « » ;
 *  2. modification : une fiche sans naissance se modifie sans elle ; une naissance déjà enregistrée ne s'efface pas ;
 *  3. étape « Personnes » du bail : le formulaire dit pour qui la fiche est créée, et seul « locataire » est repris ;
 *  4. les trois écrans : le champ n'est plus obligatoire pour un locataire, et le reste pour les autres.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  personnes: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  majs: [] as { id?: string; valeurs: Record<string, unknown> }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

function table(nom: string) {
  const filtres: ((l: Record<string, unknown>) => boolean)[] = [];
  const lignes = () => (nom === "persons" ? banc.personnes : []);
  const resultat = () => lignes().filter((l) => filtres.every((f) => f(l)));
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (colonne: string, valeur: unknown) => { filtres.push((l) => l[colonne] === valeur); return q; };
  q.neq = (colonne: string, valeur: unknown) => { filtres.push((l) => l[colonne] !== valeur); return q; };
  q.is = (colonne: string, valeur: unknown) => { filtres.push((l) => (l[colonne] ?? null) === valeur); return q; };
  q.ilike = (colonne: string, motif: string) => { filtres.push((l) => String(l[colonne] ?? "").toLowerCase() === motif.toLowerCase()); return q; };
  q.maybeSingle = async () => ({ data: resultat()[0] ?? null, error: null });
  q.then = (suite: (r: unknown) => unknown) => Promise.resolve({ data: resultat(), error: null }).then(suite);
  q.insert = (valeurs: Record<string, unknown>) => ({
    select: () => ({
      single: async () => {
        banc.inserts.push(valeurs);
        const ligne = { id: `fiche-${banc.personnes.length + 1}`, ...valeurs };
        banc.personnes.push(ligne);
        return { data: { id: ligne.id }, error: null };
      },
    }),
  });
  q.update = (valeurs: Record<string, unknown>) => {
    const maj: { id?: string; valeurs: Record<string, unknown> } = { valeurs };
    banc.majs.push(maj);
    const fin = {
      eq: (colonne: string, valeur: string) => { if (colonne === "id") maj.id = valeur; return fin; },
      then: (suite: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(suite),
    };
    return fin;
  };
  return q;
}

vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant" }, supabase: { from: table, rpc: vi.fn() }, role: "proprietaire_direct" }),
}));

import { creerPersonne, modifierPersonne } from "../src/app/actions/personnes";

const EXIGENCE = "La date et la commune de naissance sont obligatoires pour établir les contrats.";

function saisie(surcharge: Record<string, string> = {}) {
  const f = new FormData();
  const valeurs: Record<string, string> = {
    nom: "Martin", prenom: "Léa", email: "lea.martin@exemple.fr",
    address_line1: "12 rue des Lilas", postal_code: "33000", city: "Bordeaux", rester_dans_parcours: "1", ...surcharge,
  };
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
}

beforeEach(() => {
  banc.personnes = [];
  banc.inserts = [];
  banc.majs = [];
});

describe("création d'une fiche : la naissance d'un locataire est facultative", () => {
  it("un locataire se crée sans date ni commune de naissance, et rien de vide n'est écrit à leur place", async () => {
    const retour = await creerPersonne("org", {}, saisie({ role: "locataire" }));
    expect(retour.erreur).toBeUndefined();
    expect(retour.personneCreee?.id).toBe("fiche-1");
    expect(banc.inserts).toHaveLength(1);
    expect(banc.inserts[0]).toMatchObject({ nom: "Martin", prenom: "Léa", date_naissance: null, commune_naissance: null, qualite: "Personne physique" });
  });

  it("un locataire peut n'en donner qu'une des deux : l'autre reste vide", async () => {
    await creerPersonne("org", {}, saisie({ role: "locataire", date_naissance: "1992-03-04" }));
    expect(banc.inserts[0]).toMatchObject({ date_naissance: "1992-03-04", commune_naissance: null });
  });

  it("une naissance saisie pour un locataire est enregistrée, et toujours contrôlée", async () => {
    await creerPersonne("org", {}, saisie({ role: "locataire", date_naissance: "1992-03-04", commune_naissance: "Nantes" }));
    expect(banc.inserts[0]).toMatchObject({ date_naissance: "1992-03-04", commune_naissance: "Nantes" });
    banc.inserts = [];
    expect((await creerPersonne("org", {}, saisie({ role: "locataire", email: "autre@exemple.fr", date_naissance: "2992-03-04" }))).erreur)
      .toBe("La date de naissance ne peut pas être dans le futur.");
    expect((await creerPersonne("org", {}, saisie({ role: "locataire", email: "autre@exemple.fr", date_naissance: "1992-13-45" }))).erreur)
      .toBe("La date de naissance n'est pas valide.");
    expect(banc.inserts).toEqual([]);
  });

  it.each([["garant"], ["proprietaire_mandant"], [""], ["LOCATAIRE"]])(
    "le rôle « %s » garde l'exigence : aucune fiche sans naissance",
    async (role) => {
      const retour = await creerPersonne("org", {}, saisie(role ? { role } : {}));
      expect(retour.erreur).toBe(EXIGENCE);
      expect(banc.inserts).toEqual([]);
    },
  );

  it("le reste de la fiche d'un locataire reste exigé : nom, prénom, e-mail, adresse", async () => {
    for (const [champ, motif] of [["prenom", /prénom est obligatoire/], ["email", /adresse email est obligatoire/], ["city", /adresse complète/]] as const) {
      const retour = await creerPersonne("org", {}, saisie({ role: "locataire", [champ]: "" }));
      expect(retour.erreur, champ).toMatch(motif);
    }
    expect(banc.inserts).toEqual([]);
  });
});

describe("modification d'une fiche : ce qui n'a jamais été renseigné peut le rester, ce qui l'est ne s'efface pas", () => {
  const fiche = (naissance: { date_naissance: string | null; commune_naissance: string | null }) => {
    banc.personnes.push({ id: "p1", organization_id: "org", nom: "Martin", prenom: "Léa", email: "lea.martin@exemple.fr", siren: null, qualite: "Personne physique", archived_at: null, ...naissance });
  };

  it("une fiche créée sans naissance se modifie sans elle (un téléphone ajouté, par exemple)", async () => {
    fiche({ date_naissance: null, commune_naissance: null });
    const retour = await modifierPersonne("org", "p1", {}, saisie({ telephone: "06 12 34 56 78" }));
    expect(retour).toEqual({ succes: "Fiche mise à jour." });
    expect(banc.majs).toHaveLength(1);
    expect(banc.majs[0]).toMatchObject({ id: "p1", valeurs: { telephone: "06 12 34 56 78", date_naissance: null, commune_naissance: null } });
  });

  it("on peut la compléter plus tard, en tout ou en partie", async () => {
    fiche({ date_naissance: null, commune_naissance: null });
    expect((await modifierPersonne("org", "p1", {}, saisie({ date_naissance: "1992-03-04", commune_naissance: "Nantes" }))).succes).toBe("Fiche mise à jour.");
    expect(banc.majs[0].valeurs).toMatchObject({ date_naissance: "1992-03-04", commune_naissance: "Nantes" });
  });

  it.each([
    [{ date_naissance: "1992-03-04", commune_naissance: "Nantes" }, {}],
    [{ date_naissance: "1992-03-04", commune_naissance: "Nantes" }, { date_naissance: "1992-03-04" }],
    [{ date_naissance: "1992-03-04", commune_naissance: "Nantes" }, { commune_naissance: "Nantes" }],
    [{ date_naissance: "1992-03-04", commune_naissance: null }, { commune_naissance: "Nantes" }],
  ])("une naissance enregistrée (%o) ne s'efface pas par une saisie %o", async (enregistree, saisieNaissance) => {
    fiche(enregistree);
    const retour = await modifierPersonne("org", "p1", {}, saisie(saisieNaissance as Record<string, string>));
    expect(retour.erreur).toMatch(/déjà enregistrées ne s'effacent pas/);
    expect(banc.majs).toEqual([]);
  });

  it("une naissance enregistrée se corrige", async () => {
    fiche({ date_naissance: "1992-03-04", commune_naissance: "Nantes" });
    expect((await modifierPersonne("org", "p1", {}, saisie({ date_naissance: "1992-04-03", commune_naissance: "Rezé" }))).succes).toBe("Fiche mise à jour.");
    expect(banc.majs[0].valeurs).toMatchObject({ date_naissance: "1992-04-03", commune_naissance: "Rezé" });
  });
});

describe("les écrans", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");

  it("assistant de création : facultatives pour le rôle locataire, avec le mot qui dit pourquoi", () => {
    const assistant = lire("src/app/agence/[orgId]/personnes/formulaire-personne.tsx");
    expect(assistant).toContain('const naissanceFacultative = role === "locataire";');
    expect(assistant).toContain('naissanceFacultative ? ["nom","prenom"] : ["nom","prenom","date_naissance","commune_naissance"]');
    expect(assistant).toContain('champ("date_naissance","Date de naissance",{type:"date",autoComplete:"bday",facultatif:naissanceFacultative})');
    expect(assistant).toContain("Facultatif pour un locataire déjà en place.");
  });

  it("étape Personnes du bail : le formulaire dit pour qui la fiche est créée ; garant et propriétaire gardent l'exigence", () => {
    const etape = lire("src/app/agence/[orgId]/baux/[bailId]/personnes-bail.tsx");
    expect(etape).toContain("const naissanceFacultative = !proprietaire && !garant;");
    expect(etape).toContain('name="usage_bail" value={proprietaire ? "proprietaire" : garant ? "garant" : "locataire"}');
    expect(etape).toContain('required: !naissanceFacultative || Boolean(personne?.date_naissance)');
    expect(etape).toContain('required: !naissanceFacultative || Boolean(personne?.commune_naissance)');
  });

  it("modification d'une fiche : obligatoire seulement si déjà renseignée", () => {
    const identite = lire("src/app/agence/[orgId]/personnes/[personId]/formulaire-identite.tsx");
    expect(identite).toContain("required={Boolean(prenom) && Boolean(dateNaissance)}");
    expect(identite).toContain("required={Boolean(prenom) && Boolean(communeNaissance)}");
  });

  it("le contrat rédigé par Gerimmo réclame toujours la naissance du locataire", () => {
    for (const modele of ["bail-nu", "bail-meuble"]) {
      const source = lire(`src/lib/documents/modeles/${modele}.ts`);
      expect(source, modele).toContain('f.date(p.date_naissance, "Date de naissance du locataire")');
      expect(source, modele).toContain('f.champ(p.commune_naissance, "commune de naissance")');
    }
  });
});
