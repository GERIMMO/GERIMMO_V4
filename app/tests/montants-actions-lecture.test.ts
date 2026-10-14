/**
 * Vérification finale du 14/10/2026 (VFL-07, recoupe VER-TS-02) : un champ `type="number"` donne « 84000 » à un
 * navigateur non francophone qui reçoit « 840,00 ». Les champs de montant passent en texte brut
 * (`type="text" inputMode="decimal"`) ; pour que ce texte soit lu comme il a été tapé, chaque action serveur qui le
 * reçoit lit la valeur avec `lireMontant` / `lireMontantFacultatif` / `lireDecimal` (src/lib/saisie-montant.ts)
 * et non plus avec `Number(valeur)`, qui refuserait la virgule (`Number("840,00")` vaut `NaN`).
 *
 * Un cas par action et par forme de saisie : « 840,00 », « 840.00 », « 840 » valent la même chose ; « abc », un
 * négatif et le format à milliers (« 1 234,50 ») sont refusés AVANT toute écriture ; le vide et le zéro suivent la
 * règle propre à chaque champ (obligatoire, facultatif, zéro admis ou non), inchangée.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => {
  type Ecriture = { table: string; op: "insert" | "update"; valeur: Record<string, unknown> };
  type Rpc = { nom: string; args: Record<string, unknown> };
  const etat = { ecritures: [] as Ecriture[], rpcs: [] as Rpc[], lectures: {} as Record<string, unknown> };

  // Un faux client PostgREST : chaque méthode de filtre rend la requête, l'écriture est enregistrée, et la
  // requête attendue (`await`) rend « une ligne écrite ». Seul ce qui est écrit nous intéresse.
  function requete(table: string) {
    let ecriture = false;
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "eq", "is", "in", "order", "limit", "ilike", "neq"]) q[methode] = () => q;
    const ecrire = (op: Ecriture["op"]) => (valeur: Record<string, unknown>) => {
      ecriture = true;
      etat.ecritures.push({ table, op, valeur });
      return q;
    };
    q.insert = ecrire("insert");
    q.update = ecrire("update");
    q.single = async () => ({ data: { id: "nouveau" }, error: null });
    q.maybeSingle = async () => ({ data: etat.lectures[table] ?? null, error: null });
    q.then = (suite: (v: unknown) => unknown) => suite({ data: ecriture ? [{ id: "ligne" }] : [], error: null });
    return q;
  }
  const supabase = {
    from: requete,
    rpc: async (nom: string, args: Record<string, unknown>) => {
      etat.rpcs.push({ nom, args });
      return { data: 0, error: null };
    },
  };
  return { etat, supabase };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://recette.test" }) }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/ged-depot", () => ({
  deposerFichierGed: vi.fn(),
  abandonnerPieceGed: vi.fn(),
  preparerFichierGed: async () => ({
    fichier: { chemin: "org-test/justificatif.pdf", mime: "application/pdf", taille: 3, empreinte: "empreinte" },
  }),
}));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, role: "admin", supabase: banc.supabase }),
}));

import { lireEtapeBail } from "@/lib/champs-etape-bail";
import { creerBail, modifierBail, modifierComplementsBail } from "@/app/actions/baux";
import { regulariserCharges, reviserLoyer } from "@/app/actions/loyers";
import { enregistrerVersement } from "@/app/actions/compta";
import { ajouterPosteCharge, creerAppelCharges } from "@/app/actions/appels-charges";
import { ajouterRetenue } from "@/app/actions/restitution";
import { creerMandat } from "@/app/actions/mandats";
import { enregistrerPlafondColocation } from "@/app/actions/chambres";

const ORG = "org-test";

beforeEach(() => {
  banc.etat.ecritures.length = 0;
  banc.etat.rpcs.length = 0;
  banc.etat.lectures = {};
});

/** Le message central de VFL-04, dit une seule fois, mis en minuscule quand un champ est nommé. */
const FORMAT_MONTANT = /montant invalide : écrivez 1234,50, sans espace ni point de milliers/i;
const FORMAT_DECIMAL = /valeur invalide : écrivez 145,17, sans espace/i;

function formulaire(champs: Record<string, string>, fichier = false): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  if (fichier) f.set("justificatif", new File(["justificatif"], "justificatif.pdf", { type: "application/pdf" }));
  return f;
}

type Resultat = { erreur?: string; succes?: string };
type Observation = { resultat: Resultat; lu: unknown; ecrit: boolean };

/** Un champ de montant d'une action : comment le remplir, et où retrouver ce que l'action a écrit. */
type Cas = {
  action: string;
  champ: string;
  /** Joue l'action avec ce texte dans le champ ; `lu` est la valeur que l'action a transmise à la base. */
  jouer: (saisie: string) => Promise<Observation>;
  /** Le montant que valent « 840,00 », « 840.00 » et « 840 » (840 par défaut). */
  attendu?: number;
  formes?: [string, string, string];
  /** Le vide : refusé (avec ce message) ou accepté comme « non renseigné ». */
  vide: { erreur: RegExp } | { lu: unknown };
  /** Le zéro : refusé, ou accepté tel quel. */
  zero: "refuse" | "accepte";
  /** Le message d'un texte illisible : le format du montant, ou celui d'un décimal non monétaire. */
  format?: RegExp;
};

function ecritureDe(table: string): Record<string, unknown> | undefined {
  return banc.etat.ecritures.find((e) => e.table === table)?.valeur;
}
function rpcDe(nom: string): Record<string, unknown> | undefined {
  return banc.etat.rpcs.find((r) => r.nom === nom)?.args;
}
const observer = (resultat: Resultat, lu: unknown, ecrit: boolean): Observation => ({ resultat, lu, ecrit });

// Le bail : trois montants obligatoires dans le même formulaire, un type nu (dépôt plafonné à un mois de loyer).
const BAIL = { locataire_principal: "locataire-test", type: "nu", date_debut: "2026-11-01", loyer_hc: "1000", charges: "50", depot_garantie: "500", jour_echeance: "1" };
function cas_bail(action: string, champ: "loyer_hc" | "charges" | "depot_garantie", obligatoire: RegExp): Cas {
  return {
    action,
    champ,
    jouer: async (saisie) => {
      // Un loyer nul impose un dépôt nul (plafond : un mois de loyer) ; sinon c'est le plafond que le test mesurerait.
      const f = formulaire({ ...BAIL, ...(champ === "loyer_hc" ? { depot_garantie: "0" } : {}), [champ]: saisie });
      banc.etat.lectures.baux = { etat: "brouillon", lot_id: "lot-test" };
      const resultat = action === "creerBail"
        ? await creerBail(ORG, "lot-test", "bien-test", {}, f)
        : await modifierBail(ORG, "bail-test", {}, f);
      const ecrit = ecritureDe("baux");
      return observer(resultat, ecrit?.[champ], Boolean(ecrit));
    },
    vide: { erreur: obligatoire },
    zero: "accepte",
  };
}

// Les huit champs du complément de contrat (brouillon) : tous facultatifs, un champ vide s'écrit NULL.
function cas_complement(champ: string, extra: Record<string, string> = {}, formes?: [string, string, string], attendu?: number): Cas {
  return {
    action: "modifierComplementsBail",
    champ,
    jouer: async (saisie) => {
      banc.etat.lectures.baux = { lot: { surface_m2: 50 } };
      const resultat = await modifierComplementsBail(ORG, "bail-test", {}, formulaire({ ...extra, [champ]: saisie }));
      const ecrit = ecritureDe("baux");
      return observer(resultat, ecrit?.[champ], Boolean(ecrit));
    },
    attendu,
    formes,
    vide: { lu: null },
    zero: "accepte",
    format: champ === "irl_valeur" ? FORMAT_DECIMAL : undefined,
  };
}

const CAS: Cas[] = [
  cas_bail("creerBail", "loyer_hc", /loyer hors charges est obligatoire/i),
  cas_bail("creerBail", "charges", /montant des charges est obligatoire/i),
  cas_bail("creerBail", "depot_garantie", /dépôt de garantie est obligatoire/i),
  cas_bail("modifierBail", "loyer_hc", /loyer hors charges est obligatoire/i),
  cas_bail("modifierBail", "charges", /montant des charges est obligatoire/i),
  cas_bail("modifierBail", "depot_garantie", /dépôt de garantie est obligatoire/i),
  {
    action: "regulariserCharges",
    champ: "charges_reelles",
    jouer: async (saisie) => {
      const resultat = await regulariserCharges(ORG, "bail-test", {}, formulaire({ annee: "2025", charges_reelles: saisie }, true));
      const args = rpcDe("regulariser_charges_avec_justificatif");
      return observer(resultat, args?.p_charges_reelles, Boolean(args));
    },
    vide: { erreur: /indiquez les charges réelles/i },
    zero: "accepte",
  },
  {
    action: "reviserLoyer",
    champ: "irl_nouveau",
    jouer: async (saisie) => {
      const resultat = await reviserLoyer(
        ORG, "bail-test", {},
        formulaire({ irl_nouveau: saisie, irl_trimestre_numero: "2", irl_trimestre_annee: "2026", date_demande: "2026-10-01" })
      );
      const args = rpcDe("reviser_loyer");
      return observer(resultat, args?.p_irl_nouveau, Boolean(args));
    },
    attendu: 145.17,
    formes: ["145,17", "145.17", "145.17"],
    vide: { erreur: /indice irl, trimestre et année de l'indice, et date de la demande obligatoires/i },
    // Un indice nul n'en est pas un : refusé comme avant, avec le message « obligatoires ».
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  cas_complement("irl_valeur", {}, ["145,17", "145.17", "145.17"], 145.17),
  cas_complement("travaux_recents_montant"),
  cas_complement("honoraires_bailleur"),
  cas_complement(
    "honoraires_locataire",
    // Part locataire : plafonnée par celle du bailleur, par la zone et par la surface (50 m² ici, 10,09 €/m² : 504,50 €).
    { honoraires_bailleur: "1000", date_conclusion_prevue: "2026-10-01", zone_honoraires: "tendue" },
    ["84,00", "84.00", "84"],
    84
  ),
  cas_complement("loyer_reference"),
  cas_complement("loyer_reference_majore"),
  cas_complement("complement_loyer"),
  cas_complement("dernier_loyer"),
  {
    action: "enregistrerVersement",
    champ: "montant",
    jouer: async (saisie) => {
      const resultat = await enregistrerVersement(ORG, "rapport-test", {}, formulaire({ montant: saisie, date: "2026-10-12" }));
      const args = rpcDe("enregistrer_versement");
      return observer(resultat, args?.p_montant, Boolean(args));
    },
    vide: { erreur: /montant et date du versement obligatoires/i },
    zero: "refuse",
  },
  {
    action: "creerAppelCharges",
    champ: "total",
    jouer: async (saisie) => {
      const resultat = await creerAppelCharges(ORG, "bien-test", "lot-test", {}, formulaire({ exercice: "2026", total: saisie }));
      const ecrit = ecritureDe("appels_charges");
      return observer(resultat, ecrit?.total, Boolean(ecrit));
    },
    vide: { erreur: FORMAT_MONTANT },
    zero: "refuse",
  },
  {
    action: "ajouterPosteCharge",
    champ: "montant",
    jouer: async (saisie) => {
      const resultat = await ajouterPosteCharge(ORG, "bien-test", "lot-test", "appel-test", {}, formulaire({ libelle: "Ascenseur", montant: saisie }));
      const ecrit = ecritureDe("appel_charges_postes");
      return observer(resultat, ecrit?.montant, Boolean(ecrit));
    },
    vide: { erreur: FORMAT_MONTANT },
    zero: "refuse",
  },
  {
    action: "ajouterRetenue",
    champ: "cout",
    jouer: async (saisie) => {
      const resultat = await ajouterRetenue(ORG, "bail-test", "restitution-test", {}, formulaire({ libelle: "Peinture", cout: saisie }));
      const args = rpcDe("ajouter_retenue");
      return observer(resultat, args?.p_cout, Boolean(args));
    },
    vide: { erreur: FORMAT_MONTANT },
    zero: "refuse",
  },
  {
    action: "creerMandat",
    champ: "seuil_delegation",
    jouer: async (saisie) => {
      const resultat = await creerMandat(ORG, "personne-test", {}, formulaire({ date_debut: "2026-11-01", seuil_delegation: saisie }));
      const ecrit = ecritureDe("mandats");
      return observer(resultat, ecrit?.seuil_delegation, Boolean(ecrit));
    },
    vide: { lu: null },
    zero: "accepte",
  },
  {
    action: "enregistrerPlafondColocation",
    champ: "plafond",
    jouer: async (saisie) => {
      banc.etat.lectures.lots = { id: "lot-test" };
      const resultat = await enregistrerPlafondColocation(ORG, "lot-test", "bien-test", {}, formulaire({ plafond: saisie }));
      const ecrit = ecritureDe("lots");
      return observer(resultat, ecrit?.colocation_loyer_reference, Boolean(ecrit));
    },
    vide: { erreur: /indiquez le loyer hors charges/i },
    zero: "refuse",
  },
];

const NOM = (c: Cas) => `${c.action} : ${c.champ}`;

describe.each(CAS.map((c) => [NOM(c), c] as const))("%s", (_nom, cas) => {
  const [virgule, point, entier] = cas.formes ?? ["840,00", "840.00", "840"];
  const attendu = cas.attendu ?? 840;

  it.each([virgule, point, entier])("« %s » est lu tel que tapé, jamais mille fois plus", async (saisie) => {
    const { resultat, lu, ecrit } = await cas.jouer(saisie);
    expect(resultat.erreur, `${saisie} refusé : ${resultat.erreur}`).toBeUndefined();
    expect(ecrit).toBe(true);
    expect(lu).toBe(attendu);
  });

  // « abc », un négatif, et le format à milliers (VFL-04) : refus net, aucune écriture.
  it.each(["abc", "-5", "1 234,50", "1.234,50"])("refuse « %s » avant toute écriture, en disant le format attendu", async (saisie) => {
    const { resultat, ecrit } = await cas.jouer(saisie);
    expect(resultat.erreur).toBeDefined();
    expect(resultat.succes).toBeUndefined();
    expect(resultat.erreur).toMatch(cas.format ?? FORMAT_MONTANT);
    expect(ecrit).toBe(false);
  });

  it("le champ vide suit la règle du champ", async () => {
    const { resultat, lu, ecrit } = await cas.jouer("");
    if ("erreur" in cas.vide) {
      expect(resultat.erreur).toMatch(cas.vide.erreur);
      expect(ecrit).toBe(false);
    } else {
      expect(resultat.erreur).toBeUndefined();
      expect(ecrit).toBe(true);
      expect(lu).toBe(cas.vide.lu);
    }
  });

  it(`« 0 » est ${cas.zero === "accepte" ? "accepté (zéro explicite)" : "refusé"}`, async () => {
    const { resultat, lu, ecrit } = await cas.jouer("0");
    if (cas.zero === "accepte") {
      expect(resultat.erreur).toBeUndefined();
      expect(ecrit).toBe(true);
      expect(lu).toBe(0);
    } else {
      expect(resultat.erreur).toBeDefined();
      expect(ecrit).toBe(false);
    }
  });
});

describe("le champ fautif est nommé quand un formulaire porte plusieurs montants", () => {
  it("bail : « Loyer hors charges », « Charges », « Dépôt de garantie »", async () => {
    const reponses = await Promise.all([
      creerBail(ORG, "lot-test", "bien-test", {}, formulaire({ ...BAIL, loyer_hc: "abc" })),
      creerBail(ORG, "lot-test", "bien-test", {}, formulaire({ ...BAIL, charges: "abc" })),
      creerBail(ORG, "lot-test", "bien-test", {}, formulaire({ ...BAIL, depot_garantie: "abc" })),
    ]);
    expect(reponses.map((r) => r.erreur?.split(" : ")[0])).toEqual(["Loyer hors charges", "Charges", "Dépôt de garantie"]);
  });

  it("complément de contrat : le libellé du champ en erreur", async () => {
    const r = await modifierComplementsBail(ORG, "bail-test", {}, formulaire({ honoraires_bailleur: "1 000" }));
    expect(r.erreur).toMatch(/^Honoraires du bailleur : montant invalide : écrivez 1234,50/);
  });

  it("une saisie refusée est rendue au formulaire pour qu'il la repose", async () => {
    const r = await creerBail(ORG, "lot-test", "bien-test", {}, formulaire({ ...BAIL, loyer_hc: "1 234,50" }));
    expect(r.valeurs?.loyer_hc).toBe("1 234,50");
  });
});

describe("règles de calcul inchangées", () => {
  it("le plafond du dépôt de garantie (un mois de loyer en nu) se contrôle sur le montant lu", async () => {
    const trop = await creerBail(ORG, "lot-test", "bien-test", {}, formulaire({ ...BAIL, loyer_hc: "840,00", depot_garantie: "840,01" }));
    expect(trop.erreur).toMatch(/plafond légal/i);
    expect(banc.etat.ecritures).toHaveLength(0);
    const pile = await creerBail(ORG, "lot-test", "bien-test", {}, formulaire({ ...BAIL, loyer_hc: "840,00", depot_garantie: "840,00" }));
    expect(pile.erreur).toBeUndefined();
    expect(ecritureDe("baux")).toMatchObject({ loyer_hc: 840, depot_garantie: 840 });
  });

  it("charges réelles : la régularisation transmet le montant lu et l'année, rien d'autre ne change", async () => {
    const r = await regulariserCharges(ORG, "bail-test", {}, formulaire({ annee: "2025", charges_reelles: "840,00" }, true));
    expect(r.erreur).toBeUndefined();
    expect(rpcDe("regulariser_charges_avec_justificatif")).toMatchObject({ p_bail: "bail-test", p_annee: 2025, p_charges_reelles: 840 });
  });

  it("indice IRL : la révision transmet l'indice lu et le trimestre, 145,17 n'est pas 14517", async () => {
    const r = await reviserLoyer(
      ORG, "bail-test", {},
      formulaire({ irl_nouveau: "145,17", irl_trimestre_numero: "2", irl_trimestre_annee: "2026", date_demande: "2026-10-01" })
    );
    expect(r.erreur).toBeUndefined();
    expect(rpcDe("reviser_loyer")).toMatchObject({ p_bail: "bail-test", p_irl_nouveau: 145.17, p_irl_trimestre: "T2 2026", p_date_demande: "2026-10-01" });
  });
});

// Le parcours de bail lit l'indice IRL par `lireEtapeBail` (FormData, texte tapé) : sa lecture accepte déjà la
// virgule, ce qui rend sûr le passage du champ en texte.
describe("lireEtapeBail : l'indice IRL du parcours de bail", () => {
  const actuel = { type: "nu", loyer_hc: 500, charges: 40, depot_garantie: 400, charges_mode: "provision", locataire_principal: "locataire", jour_echeance: 1 };
  const loyer = { loyer_hc: "500", charges: "40", depot_garantie: "400", jour_echeance: "1", charges_mode: "provision", revision_irl: "true", paiement_echeance: "echoir" };
  const lire = (irl: string) => lireEtapeBail("loyer", formulaire({ ...loyer, irl_valeur: irl }), actuel, { meuble: false, surface: 46 });

  it.each(["145,17", "145.17"])("« %s » vaut 145,17, pas 14517", (saisie) => {
    const r = lire(saisie);
    expect(r.erreur).toBeUndefined();
    expect(r.patch?.irl_valeur).toBe(145.17);
  });
  it("« 145 » vaut 145 et le vide « non renseigné »", () => {
    expect(lire("145").patch?.irl_valeur).toBe(145);
    expect(lire("").patch?.irl_valeur).toBeNull();
  });
  it.each(["abc", "-5"])("refuse « %s »", (saisie) => {
    expect(lire(saisie).erreur).toBeDefined();
  });
});
