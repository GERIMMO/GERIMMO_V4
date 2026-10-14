/**
 * Décision D34 (SOR-04) — l'écran de clôture du bail : date de sortie réelle,
 * confirmation d'une clôture avant la fin du préavis, et ce que l'action envoie
 * à la base. La base (terminer_bail) reste seule juge : voir bail-sortie-lot.test.ts.
 *
 * Le vrai champ de date (InputDateJour) est monté, avec un mini-environnement
 * d'exécution des hooks : le rendu serveur seul ne joue ni l'hydratation (qui pose
 * la date du jour) ni le rappel `surChangement` qui la transmet au formulaire, et
 * c'est précisément ce chemin qui fait apparaître l'avertissement chez l'agent.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatBail } from "@/app/actions/baux";

const banc = vi.hoisted(() => ({
  etat: {} as EtatBail,
  rpc: vi.fn(),
}));

// Mini-environnement : un état par appel de useState (stable d'un tour à l'autre) et les
// effets mis de côté pour être joués après chaque rendu, comme le fait le navigateur.
const rt = vi.hoisted(() => ({
  cases: [] as unknown[],
  indice: 0,
  effets: [] as Array<() => void>,
  saisie: null as null | ((e: { target: { value: string } }) => void),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useActionState: () => [banc.etat, () => {}, false],
    useState: (initial: unknown) => {
      const i = rt.indice++;
      if (!(i in rt.cases)) rt.cases[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const poser = (v: unknown) => {
        rt.cases[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(rt.cases[i]) : v;
      };
      return [rt.cases[i], poser];
    },
    useEffect: (effet: () => void) => {
      rt.effets.push(effet);
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: { rpc: banc.rpc } }),
}));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/app/actions/edl", () => ({ creerEdl: vi.fn() }));
// Le champ de saisie lui-même : rend un <input> simple et garde le gestionnaire de frappe,
// pour que le test tape une date comme le ferait l'agent.
vi.mock("@/components/ui/input", async () => {
  const { createElement } = await import("react");
  return {
    Input: (props: { onChange?: (e: { target: { value: string } }) => void } & Record<string, unknown>) => {
      rt.saisie = props.onChange ?? null;
      const { onChange: _onChange, className: _className, ...reste } = props;
      return createElement("input", { ...reste, readOnly: true });
    },
  };
});

import { terminerBail } from "@/app/actions/baux";
import { BoutonTerminerBail } from "@/app/agence/[orgId]/baux/[bailId]/formulaires-bail";
import {
  CODE_CONFIRMATION_CLOTURE,
  clotureAnticipee,
  confirmationAAfficher,
  lireDateSortie,
} from "@/lib/cloture-bail";

const AUJOURDHUI = "2026-10-14";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date("2026-10-14T10:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
  banc.etat = {};
  banc.rpc.mockResolvedValue({ error: null });
  rt.cases = [];
});
afterEach(() => {
  vi.useRealTimers();
});

let dateEffetMontee: string | null = "2027-01-14";

/** Joue des tours « rendu, puis effets » jusqu'à ce que l'écran se stabilise (hydratation comprise). */
function tourner(): string {
  let html = "";
  for (let tour = 0; tour < 5; tour++) {
    rt.indice = 0;
    rt.effets = [];
    html = renderToStaticMarkup(
      createElement(BoutonTerminerBail, { orgId: "org-test", bailId: "bail-test", dateEffet: dateEffetMontee })
    );
    for (const effet of rt.effets) effet();
    vi.runAllTimers();
  }
  return html;
}

/** L'écran tel que l'agent le voit une fois la page hydratée. */
function ecran(dateEffet: string | null = "2027-01-14") {
  rt.cases = [];
  dateEffetMontee = dateEffet;
  return tourner();
}

/** L'agent tape une date dans le champ. */
function saisir(date: string) {
  expect(rt.saisie, "le champ de date doit être monté").not.toBeNull();
  rt.saisie?.({ target: { value: date } });
  return tourner();
}

function champ(html: string, nom: string) {
  return html.match(/<input\b[^>]*>/g)?.find((i) => i.includes(`name="${nom}"`)) ?? "";
}

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  return f;
}

describe("Clôture du bail : la date de sortie réelle (D34)", () => {
  it("demande le jour où le locataire a réellement quitté le logement, pré-rempli à aujourd'hui, jamais dans le futur", () => {
    const html = ecran();
    expect(html).toContain("Date de sortie réelle du locataire");
    expect(html).toContain("ne pourra pas commencer avant cette date");
    expect(html).toContain("Clôturer le bail");
    const date = champ(html, "date_sortie");
    expect(date).toContain('type="date"');
    expect(date).toContain('required=""');
    expect(date).toContain(`value="${AUJOURDHUI}"`);
    expect(date).toContain(`max="${AUJOURDHUI}"`);
    // Le libellé désigne bien ce champ
    const id = date.match(/id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
  });

  it("dès l'ouverture, la date du jour posée par défaut précède la fin du préavis : l'avertissement et la case sont là", () => {
    const html = ecran("2027-01-14");
    expect(champ(html, "date_sortie")).toContain(`value="${AUJOURDHUI}"`);
    expect(html).toContain('name="confirmer_anticipee"');
    expect(html).toContain("14/01/2027");
    expect(html).toContain("Je confirme la clôture avant la fin du préavis.");
    // La confirmation ne promet rien sur l'argent : elle dit seulement que rien ne change
    expect(html).toContain("ne change ni la date de fin du bail ni les montants appelés");
    expect(champ(html, "confirmer_anticipee")).toContain('required=""');
  });

  it("préavis échu, ou échu aujourd'hui : aucune confirmation à donner", () => {
    expect(ecran("2026-09-01")).not.toContain("confirmer_anticipee");
    expect(ecran(AUJOURDHUI)).not.toContain("confirmer_anticipee");
  });

  it("sans date d'effet connue, l'écran ne réclame rien de lui-même", () => {
    expect(ecran(null)).not.toContain("confirmer_anticipee");
  });

  it("l'agent change la date : la case suit (avant la fin du préavis, elle apparaît ; le jour de l'effet ou après, elle part)", () => {
    expect(ecran("2027-01-14")).toContain('name="confirmer_anticipee"');
    expect(saisir("2027-01-14")).not.toContain("confirmer_anticipee");
    expect(saisir("2027-02-01")).not.toContain("confirmer_anticipee");
    const de_nouveau = saisir("2026-12-24");
    expect(de_nouveau).toContain('name="confirmer_anticipee"');
    expect(champ(de_nouveau, "date_sortie")).toContain('value="2026-12-24"');
  });

  it("une saisie refusée est reposée dans le champ, et la case reste là si la sortie reste anticipée", () => {
    banc.etat = { erreur: "Une autre raison de refus", valeurs: { date_sortie: "2026-10-12" } };
    const html = ecran("2027-01-14");
    expect(champ(html, "date_sortie")).toContain('value="2026-10-12"');
    expect(html).toContain('name="confirmer_anticipee"');
  });

  it("la base exige la confirmation alors que l'écran croyait le préavis échu : la case apparaît, avec la date renvoyée", () => {
    // La date d'effet que l'écran connaît (14/10) n'est pas celle que la base a lue : le refus fait foi.
    banc.etat = {
      erreur: "Clôture avant la fin du préavis : le préavis court jusqu'au 14/01/2027, la sortie réelle serait datée du 14/10/2026.",
      valeurs: { date_sortie: AUJOURDHUI },
      confirmationRequise: true,
    };
    const html = ecran(AUJOURDHUI);
    expect(champ(html, "date_sortie")).toContain(`value="${AUJOURDHUI}"`);
    expect(html).toContain('name="confirmer_anticipee"');
    expect(champ(html, "confirmer_anticipee")).toContain('required=""');
    // L'écran ne dit pas ce qu'il ne sait pas : pas de « le préavis court jusqu'au 14/10/2026 : antérieure »
    expect(html).toContain("Cette sortie est antérieure à la fin du préavis.");
    expect(html).not.toContain("Le préavis court jusqu&#x27;au");
    // La phrase de la base, elle, dit la vraie date
    expect(html).toContain("le préavis court jusqu&#x27;au 14/01/2027");
  });

  it("quand la base demande la confirmation sans rendre la saisie, la case apparaît quand même", () => {
    banc.etat = {
      erreur: "Clôture avant la fin du préavis : le préavis court jusqu'au 14/01/2027 …",
      confirmationRequise: true,
    };
    const html = ecran(null);
    expect(html).toContain('name="confirmer_anticipee"');
    expect(html).toContain("Cette sortie est antérieure à la fin du préavis.");
    expect(html).toContain("Clôture avant la fin du préavis");
  });

  it("après un refus, une date changée depuis ne garde pas une confirmation qui ne la concerne plus", () => {
    banc.etat = {
      erreur: "Clôture avant la fin du préavis : …",
      valeurs: { date_sortie: AUJOURDHUI },
      confirmationRequise: true,
    };
    expect(ecran(AUJOURDHUI)).toContain('name="confirmer_anticipee"');
    // L'agent choisit une autre date, que l'écran juge sans écart : la case part
    expect(saisir("2026-12-01")).not.toContain("confirmer_anticipee");
    // Il revient à la date refusée : la demande de la base s'applique de nouveau
    expect(saisir(AUJOURDHUI)).toContain('name="confirmer_anticipee"');
  });
});

describe("Action terminerBail : ce qui part à la base", () => {
  it("envoie la date de sortie et la confirmation cochée", async () => {
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "2026-10-12", confirmer_anticipee: "on" }));
    expect(banc.rpc).toHaveBeenCalledWith("terminer_bail", {
      p_bail: "bail-test",
      p_date_sortie: "2026-10-12",
      p_confirmer_anticipee: true,
    });
    expect(r.succes).toMatch(/Bail clôturé/);
  });

  it("sans date saisie, laisse la base prendre le jour de Paris ; sans case, pas de confirmation", async () => {
    await terminerBail("org-test", "bail-test", {}, formulaire({}));
    expect(banc.rpc).toHaveBeenCalledWith("terminer_bail", {
      p_bail: "bail-test",
      p_date_sortie: null,
      p_confirmer_anticipee: false,
    });
  });

  it("une date mal formée est refusée avant tout appel, la saisie est rendue", async () => {
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "14/10/2026" }));
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(r.erreur).toMatch(/pas une date valide/);
    expect(r.valeurs).toEqual({ date_sortie: "14/10/2026" });
  });

  it("le refus « confirmation requise » de la base fait apparaître la case et garde la saisie", async () => {
    banc.rpc.mockResolvedValue({
      error: { code: CODE_CONFIRMATION_CLOTURE, message: "Clôture avant la fin du préavis : le préavis court jusqu'au 14/01/2027, la sortie réelle serait datée du 14/10/2026. Confirmez la clôture anticipée pour l'enregistrer (la date de fin du bail ne change pas)." },
    });
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "2026-10-14" }));
    expect(r.confirmationRequise).toBe(true);
    expect(r.erreur).toContain("avant la fin du préavis");
    expect(r.valeurs).toEqual({ date_sortie: "2026-10-14" });
  });

  it("un autre refus ne demande pas de confirmation", async () => {
    banc.rpc.mockResolvedValue({ error: { code: "P0001", message: "Clôture impossible sans état des lieux de sortie signé (RM-3.11.2)" } });
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "2026-10-14" }));
    expect(r.confirmationRequise).toBeUndefined();
    expect(r.erreur).toBe("Clôture impossible sans état des lieux de sortie signé");
  });
});

describe("Règles pures de la clôture", () => {
  it("clotureAnticipee compare des dates AAAA-MM-JJ, sans date = pas d'avertissement", () => {
    expect(clotureAnticipee("2026-10-14", "2027-01-14")).toBe(true);
    expect(clotureAnticipee("2027-01-14", "2027-01-14")).toBe(false);
    expect(clotureAnticipee("2027-01-15", "2027-01-14")).toBe(false);
    expect(clotureAnticipee("", "2027-01-14")).toBe(false);
    expect(clotureAnticipee("2026-10-14", null)).toBe(false);
  });

  it("confirmationAAfficher : le calcul de l'écran, ou le refus de la base tant que la date n'a pas changé", () => {
    const base = { dateSortie: "2026-10-14", dateEffet: "2027-01-14", confirmationRequise: false, dateRefusee: undefined };
    // Calcul de l'écran seul
    expect(confirmationAAfficher(base)).toBe(true);
    expect(confirmationAAfficher({ ...base, dateEffet: "2026-10-14" })).toBe(false);
    expect(confirmationAAfficher({ ...base, dateEffet: null })).toBe(false);
    // Refus de la base : sa demande prime sur l'écran, pour la date refusée
    const refus = { ...base, dateEffet: "2026-10-14", confirmationRequise: true, dateRefusee: "2026-10-14" };
    expect(confirmationAAfficher(refus)).toBe(true);
    // Date changée depuis : seul le calcul de l'écran compte
    expect(confirmationAAfficher({ ...refus, dateSortie: "2026-12-01" })).toBe(false);
    expect(confirmationAAfficher({ ...refus, dateSortie: "2026-12-01", dateEffet: "2027-01-14" })).toBe(true);
    // Refus sans date rendue, ou champ encore vide : la demande de la base s'applique
    expect(confirmationAAfficher({ ...refus, dateRefusee: undefined, dateSortie: "2026-12-01" })).toBe(true);
    expect(confirmationAAfficher({ ...refus, dateSortie: "" })).toBe(true);
    // Pas de refus : un champ vide n'avertit pas
    expect(confirmationAAfficher({ ...base, dateSortie: "" })).toBe(false);
  });

  it("lireDateSortie n'accepte que le format du champ de date", () => {
    expect(lireDateSortie("2026-10-14")).toBe("2026-10-14");
    expect(lireDateSortie(" 2026-10-14 ")).toBe("2026-10-14");
    expect(lireDateSortie("")).toBeNull();
    expect(lireDateSortie("14/10/2026")).toBeNull();
    expect(lireDateSortie(null)).toBeNull();
  });
});
