/**
 * Décision D31 (PR178-A-03, audit du 13/10/2026) : la création d'une fiche personne porte une clé d'idempotence
 * (`creation_id`, colonne `persons.creation_cle`). Après une réponse perdue, renvoyer la MÊME demande retrouve la fiche
 * déjà créée au lieu d'en créer une seconde ; une demande différente sous la même clé est refusée sans rien écrire ;
 * deux envois simultanés ne donnent qu'une fiche. La base fictive ci-dessous reproduit les deux index uniques réels
 * (adresse email par organisation, clé de création par organisation) ; la garantie réelle est vérifiée sur Postgres par
 * tests/creation-fiche-personne-base.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fiche = Record<string, unknown> & { id: string; organization_id: string; email: string; creation_cle?: string };
const banc = vi.hoisted(() => ({
  personnes: [] as Record<string, unknown>[],
  detentions: [] as { lot_id: string; person_id: string }[],
  lots: [{ id: "lot-1", organization_id: "org" }] as { id: string; organization_id: string }[],
  inserts: [] as Record<string, unknown>[],
  // Rend la lecture par clé indisponible (panne de lecture).
  lectureEnPanne: false,
  // Simule un envoi concurrent : juste avant l'insertion, une autre demande de même clé vient d'être validée.
  concurrente: null as null | (() => void),
  revalider: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// Un client minimal : filtres d'égalité, `ilike`, `neq`, `is`, lecture d'une ligne ou de plusieurs, insertion avec index uniques.
function table(nom: string) {
  const filtres: ((l: Record<string, unknown>) => boolean)[] = [];
  const lignes = () => (nom === "persons" ? banc.personnes : nom === "detentions" ? banc.detentions : nom === "lots" ? banc.lots : []) as Record<string, unknown>[];
  let lectureParCle = false;
  const resultat = () => lignes().filter((l) => filtres.every((f) => f(l)));
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (colonne: string, valeur: unknown) => {
    if (colonne === "creation_cle") lectureParCle = true;
    filtres.push((l) => l[colonne] === valeur);
    return q;
  };
  q.neq = (colonne: string, valeur: unknown) => { filtres.push((l) => l[colonne] !== valeur); return q; };
  q.is = (colonne: string, valeur: unknown) => { filtres.push((l) => (l[colonne] ?? null) === valeur); return q; };
  q.ilike = (colonne: string, motif: string) => { filtres.push((l) => String(l[colonne] ?? "").toLowerCase() === motif.toLowerCase()); return q; };
  q.maybeSingle = async () => (lectureParCle && banc.lectureEnPanne
    ? { data: null, error: { message: "lecture impossible" } }
    : { data: resultat()[0] ?? null, error: null });
  q.then = (suite: (r: unknown) => unknown) => Promise.resolve({ data: resultat(), error: null }).then(suite);
  q.insert = (valeurs: Record<string, unknown>) => {
    if (nom === "detentions") { banc.detentions.push(valeurs as { lot_id: string; person_id: string }); return Promise.resolve({ error: null }); }
    return {
      select: () => ({
        single: async () => {
          banc.inserts.push(valeurs);
          banc.concurrente?.();
          banc.concurrente = null;
          const existants = banc.personnes as Fiche[];
          const memeCle = valeurs.creation_cle && existants.some((p) => p.organization_id === valeurs.organization_id && p.creation_cle === valeurs.creation_cle);
          const memeEmail = existants.some((p) => p.organization_id === valeurs.organization_id && String(p.email).toLowerCase() === String(valeurs.email).toLowerCase());
          if (memeCle || memeEmail) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${memeEmail ? "persons_email_unique_par_agence" : "persons_creation_cle_unique"}"` } };
          }
          const ligne = { id: `fiche-${banc.personnes.length + 1}`, ...valeurs };
          banc.personnes.push(ligne);
          return { data: { id: ligne.id }, error: null };
        },
      }),
    };
  };
  return q;
}

vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant" }, supabase: { from: table, rpc: vi.fn() }, role: "proprietaire_direct" }),
}));

import { creerPersonne } from "../src/app/actions/personnes";

const CLE = "7f1d6c7e-9b0a-4a54-8f31-0c2f4a6d9a10";
const AUTRE_CLE = "0b9f1c2e-5d34-4e0f-9a5e-3d6a7c8b9e21";
const fiche = (surcharge: Record<string, string> = {}) => {
  const f = new FormData();
  const valeurs: Record<string, string> = {
    nom: "Martin", prenom: "Jeanne", email: "jeanne@exemple.fr", date_naissance: "1985-03-02", commune_naissance: "Lyon",
    address_line1: "1 rue des Lilas", postal_code: "69003", city: "Lyon", rester_dans_parcours: "1", creation_id: CLE, ...surcharge,
  };
  for (const [k, v] of Object.entries(valeurs)) if (v !== "") f.set(k, v);
  return f;
};

beforeEach(() => {
  banc.personnes = [];
  banc.detentions = [];
  banc.inserts = [];
  banc.lectureEnPanne = false;
  banc.concurrente = null;
  banc.revalider.mockReset();
});

describe("D31 : la création d'une fiche personne est rejouable", () => {
  it("crée la fiche et enregistre la clé avec elle", async () => {
    const retour = await creerPersonne("org", {}, fiche());
    expect(retour.personneCreee?.id).toBe("fiche-1");
    expect(banc.inserts).toHaveLength(1);
    expect(banc.inserts[0].creation_cle).toBe(CLE);
  });

  it("rejeu après une réponse perdue : retrouve la même fiche, sans en créer une seconde ni se dire « email déjà pris »", async () => {
    const premiere = await creerPersonne("org", {}, fiche());
    const rejeu = await creerPersonne("org", {}, fiche());
    expect(rejeu.erreur).toBeUndefined();
    expect(rejeu.personneCreee?.id).toBe(premiere.personneCreee?.id);
    expect(rejeu.succes).toBe("Fiche créée.");
    expect(banc.personnes).toHaveLength(1);
    expect(banc.inserts).toHaveLength(1);
  });

  it("le rejeu ne prend pas la fiche déjà créée pour son propre homonyme", async () => {
    await creerPersonne("org", {}, fiche());
    const rejeu = await creerPersonne("org", {}, fiche());
    expect(rejeu.avertissement).toBeUndefined();
  });

  it("un vrai homonyme reste signalé au rejeu", async () => {
    banc.personnes.push({ id: "ancienne", organization_id: "org", nom: "Martin", prenom: "Jeanne", email: "autre@exemple.fr", date_naissance: "1985-03-02", archived_at: null });
    const premiere = await creerPersonne("org", {}, fiche());
    expect(premiere.avertissement).toMatch(/mêmes nom et date de naissance/);
    const rejeu = await creerPersonne("org", {}, fiche());
    expect(rejeu.personneCreee?.id).toBe(premiere.personneCreee?.id);
    expect(rejeu.avertissement).toMatch(/mêmes nom et date de naissance/);
  });

  it("une demande différente sous la même clé est refusée : rien n'est écrit, la fiche existante est désignée", async () => {
    const premiere = await creerPersonne("org", {}, fiche());
    const retour = await creerPersonne("org", {}, fiche({ email: "faute-corrigee@exemple.fr" }));
    expect(retour.erreur).toMatch(/déjà créé la fiche avec les informations précédentes/);
    expect(retour.ficheExistante?.id).toBe(premiere.personneCreee?.id);
    expect(retour.personneCreee).toBeUndefined();
    expect(banc.personnes).toHaveLength(1);
    expect(banc.personnes[0].email).toBe("jeanne@exemple.fr");
  });

  it("une valeur facultative absente et une valeur vide sont la même demande", async () => {
    await creerPersonne("org", {}, fiche({ telephone: "" }));
    const rejeu = await creerPersonne("org", {}, fiche());
    expect(rejeu.personneCreee?.id).toBe("fiche-1");
    expect(banc.personnes).toHaveLength(1);
  });

  it("deux demandes de clés différentes et de même adresse email : la seconde garde son refus d'unicité", async () => {
    await creerPersonne("org", {}, fiche());
    const retour = await creerPersonne("org", {}, fiche({ creation_id: AUTRE_CLE }));
    expect(retour.erreur).toMatch(/déjà portée par une autre fiche/);
    expect(banc.personnes).toHaveLength(1);
  });

  it("envoi concurrent : la demande qui perd la course retrouve la fiche de la gagnante", async () => {
    // La gagnante est validée entre la lecture par clé (vide) et l'insertion de la perdante.
    banc.concurrente = () => {
      banc.personnes.push({ id: "gagnante", organization_id: "org", creation_cle: CLE, nom: "Martin", prenom: "Jeanne", email: "jeanne@exemple.fr", telephone: null, date_naissance: "1985-03-02", commune_naissance: "Lyon", address_line1: "1 rue des Lilas", postal_code: "69003", city: "Lyon", qualite: "Personne physique" });
    };
    const retour = await creerPersonne("org", {}, fiche());
    expect(retour.erreur).toBeUndefined();
    expect(retour.personneCreee?.id).toBe("gagnante");
    expect(banc.personnes).toHaveLength(1);
  });

  it("envoi concurrent avec une saisie différente : refusé, la fiche de la gagnante est désignée", async () => {
    banc.concurrente = () => {
      banc.personnes.push({ id: "gagnante", organization_id: "org", creation_cle: CLE, nom: "Martin", prenom: "Jeanne", email: "ancien@exemple.fr", telephone: null, date_naissance: "1985-03-02", commune_naissance: "Lyon", address_line1: "1 rue des Lilas", postal_code: "69003", city: "Lyon", qualite: "Personne physique" });
    };
    const retour = await creerPersonne("org", {}, fiche());
    expect(retour.ficheExistante?.id).toBe("gagnante");
    expect(banc.personnes).toHaveLength(1);
  });

  it("une panne de lecture de la clé n'écrit rien et le dit", async () => {
    banc.lectureEnPanne = true;
    const retour = await creerPersonne("org", {}, fiche());
    expect(retour.erreur).toMatch(/ne sera pas créée deux fois/);
    expect(banc.inserts).toHaveLength(0);
  });

  it("une clé illisible est refusée avant toute écriture", async () => {
    const retour = await creerPersonne("org", {}, fiche({ creation_id: "pas-un-uuid" }));
    expect(retour.erreur).toMatch(/référence de cette demande est illisible/);
    expect(banc.inserts).toHaveLength(0);
  });

  it("sans clé (création depuis l'étape bail), le comportement d'avant est inchangé : aucune colonne de clé écrite", async () => {
    const sansCle = fiche({ creation_id: "" });
    const retour = await creerPersonne("org", {}, sansCle);
    expect(retour.personneCreee?.id).toBe("fiche-1");
    expect("creation_cle" in banc.inserts[0]).toBe(false);
    const second = await creerPersonne("org", {}, fiche({ creation_id: "" }));
    expect(second.erreur).toMatch(/déjà portée par une autre fiche/);
  });

  it("le rejeu ne pose pas deux fois le rattachement au lot d'un propriétaire mandant", async () => {
    const mandant = () => fiche({ role: "proprietaire_mandant", lot_id: "lot-1" });
    await creerPersonne("org", {}, mandant());
    expect(banc.detentions).toHaveLength(1);
    const rejeu = await creerPersonne("org", {}, mandant());
    expect(rejeu.personneCreee?.id).toBe("fiche-1");
    expect(rejeu.erreur).toBeUndefined();
    expect(banc.detentions).toHaveLength(1);
  });

  it("le rejeu pose le rattachement s'il manque (réponse perdue avant qu'il ait été posé)", async () => {
    const mandant = () => fiche({ role: "proprietaire_mandant", lot_id: "lot-1" });
    await creerPersonne("org", {}, mandant());
    banc.detentions = [];
    await creerPersonne("org", {}, mandant());
    expect(banc.detentions).toHaveLength(1);
  });
});
