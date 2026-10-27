import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-000000000001";
const BIEN = "00000000-0000-4000-8000-000000000002";
const LOT = "00000000-0000-4000-8000-000000000003";
const AUTRE = "00000000-0000-4000-8000-000000000004";
const banc = vi.hoisted(() => ({
  autorise: true, lot: {} as Record<string, string>,
  lectureErreur: false, ecritureErreur: false, confirmationVide: false, panne: false,
  ecritures: [] as Record<string, unknown>[], revalider: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("@/lib/ged", () => ({ aujourdhuiParis: () => "2026-10-26" }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.autorise ? { id: "utilisateur" } : null,
    supabase: { from(table: string) {
      const filtres: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (cle: string, valeur: string) => { filtres[cle] = valeur; return q; },
        maybeSingle: async () => ({
          data: Object.entries(filtres).every(([cle, valeur]) => banc.lot[cle] === valeur) ? banc.lot : null,
          error: banc.lectureErreur ? { message: "panne" } : null,
        }),
        upsert: (ligne: Record<string, unknown>, options: unknown) => {
          if (table !== "qualifications_diagnostics_lot") throw Error("Table inattendue");
          banc.ecritures.push({ ...ligne, options }); return q;
        },
        single: async () => {
          if (banc.panne) throw Error("connexion interrompue");
          return { data: banc.confirmationVide ? null : { type: "gaz" }, error: banc.ecritureErreur ? { message: "refus" } : null };
        },
      }; return q;
    } },
  }),
}));

import { enregistrerQualificationDiagnostic } from "../src/app/actions/qualification-diagnostic";

function soumettre(champs: Record<string, string> = {}, org = ORG, bien = BIEN, lot = LOT) {
  const form = new FormData();
  Object.entries({ type: "gaz", situation: "absente", ...champs }).forEach(([cle, valeur]) => form.set(cle, valeur));
  return enregistrerQualificationDiagnostic(org, bien, lot, {}, form);
}

beforeEach(() => {
  banc.autorise = true; banc.lot = { id: LOT, bien_id: BIEN, organization_id: ORG };
  banc.lectureErreur = false; banc.ecritureErreur = false; banc.confirmationVide = false; banc.panne = false;
  banc.ecritures.length = 0; banc.revalider.mockClear();
});

describe("qualification gaz/électricité — action", () => {
  it("mémorise une absence de gaz avec la cible liée au formulaire et actualise les deux espaces", async () => {
    expect(await soumettre({ organization_id: AUTRE, lot_id: AUTRE, updated_by: AUTRE })).toEqual({ succes: "Réponse enregistrée." });
    expect(banc.ecritures).toEqual([{ organization_id: ORG, lot_id: LOT, type: "gaz", situation: "absente", date_installation: null, annee_installation: null, options: { onConflict: "organization_id,lot_id,type" } }]);
    expect(banc.revalider).toHaveBeenCalledWith(`/espace/${ORG}/parc/${BIEN}/lots/${LOT}`);
    expect(banc.revalider).toHaveBeenCalledWith(`/agence/${ORG}/parc/${BIEN}/lots/${LOT}`);
  });
  it("conserve la date exacte pour réévaluer l'âge plus tard", async () => {
    expect((await soumettre({ type: "electricite", situation: "date_connue", date_installation: "2020-02-29", annee_installation: "2019" })).succes).toBeTruthy();
    expect(banc.ecritures[0].date_installation).toBe("2020-02-29");
    expect(banc.ecritures[0].annee_installation).toBeNull();
  });
  it.each(["1800", "2015", "2026"])("conserve seulement l'année %s sans inventer une date", async (annee) => {
    expect((await soumettre({ situation: "annee_connue", annee_installation: annee, date_installation: "2020-01-01" })).succes).toBeTruthy();
    expect(banc.ecritures[0].annee_installation).toBe(Number(annee));
    expect(banc.ecritures[0].date_installation).toBeNull();
  });
  it.each(["", "99", "1799", "2027", "2015.5", "201a", "02015"])("refuse une année invalide : %s", async (annee) => {
    const resultat = await soumettre({ situation: "annee_connue", annee_installation: annee });
    expect(resultat.erreur).toContain("année d’installation entre");
    expect(resultat.valeurs?.annee_installation).toBe(annee);
    expect(banc.ecritures).toHaveLength(0);
  });
  it("efface une ancienne date lorsque la réponse change", async () => {
    await soumettre({ situation: "inconnue", date_installation: "2020-01-01", annee_installation: "2015" });
    expect(banc.ecritures[0].date_installation).toBeNull();
    expect(banc.ecritures[0].annee_installation).toBeNull();
  });
  it.each(["", "2026-02-30", "2027-01-01", "1799-12-31", "01/01/2020"])("refuse une date non fiable : %s", async (date) => {
    const resultat = await soumettre({ situation: "date_connue", date_installation: date });
    expect(resultat.erreur).toContain("date d’installation valide");
    expect(resultat.valeurs?.date_installation).toBe(date);
    expect(banc.ecritures).toHaveLength(0);
  });
  it.each<Record<string, string>>([{ type: "electricite", situation: "absente" }, { type: "termites" }, { situation: "moins_15_ans" }])("refuse un choix incohérent : %j", async (champs) => {
    expect((await soumettre(champs)).erreur).toBeTruthy(); expect(banc.ecritures).toHaveLength(0);
  });
  it.each([[AUTRE, BIEN, LOT], [ORG, AUTRE, LOT], [ORG, BIEN, AUTRE]])("vérifie org, bien et lot : %s / %s / %s", async (org, bien, lot) => {
    expect((await soumettre({}, org, bien, lot)).erreur).toContain("inaccessible"); expect(banc.ecritures).toHaveLength(0);
  });
  it("refuse une session non autorisée", async () => {
    banc.autorise = false; expect((await soumettre()).erreur).toBe("Accès refusé."); expect(banc.ecritures).toHaveLength(0);
  });
  it.each(["lectureErreur", "ecritureErreur", "confirmationVide", "panne"] as const)("ne confirme pas en cas de %s", async (champ) => {
    banc[champ] = true; const resultat = await soumettre();
    expect(resultat.erreur).toBeTruthy(); expect(resultat.succes).toBeUndefined();
    expect(resultat.valeurs?.situation).toBe("absente"); expect(banc.revalider).not.toHaveBeenCalled();
  });
});
