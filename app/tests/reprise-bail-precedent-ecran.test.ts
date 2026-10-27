import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatBail } from "@/app/actions/baux";
// Décision du 27/10 (CB-08) : à l’étape Loyer, les valeurs reprises du bail précédent sont signalées
// avec sa période et un lien les efface ; le type repris est signalé à l’étape « Le bail ».
const m = vi.hoisted(() => ({ etape: "loyer", soumettre: vi.fn(), sauvegarder: vi.fn() }));
vi.mock("react", async (original) => {
  const reel = await original<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  const remplacement = { ...hooks, useContext: () => ({ etape: m.etape, ouvrir: vi.fn() }) };
  return { ...reel, ...remplacement, default: { ...reel, ...remplacement } };
});
vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: () => ({ etat: {} as EtatBail, soumettre: m.soumettre, enCours: false }) }));
vi.mock("@/lib/suivi-enregistrement", () => ({ CompletudeBail: {} }));
vi.mock("@/app/actions/etapes-bail", () => ({ modifierEtapeBail: m.sauvegarder }));
import { FormulaireParcoursBail } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-parcours-bail";
import { monter, trouver, texte } from "./aide/hooks-sans-dom";
import type { BailPrecedent } from "@/lib/reprise-bail-precedent";

const bailPrecedent: BailPrecedent = { id: "ancien", chambre_id: null, type: "nu", date_debut: "2023-09-01", date_fin: "2026-08-31", date_sortie_reelle: "2026-08-31", loyer_hc: 930, charges: 65, charges_mode: "provision", jour_echeance: 5, paiement_echeance: "echoir", revision_irl: true, irl_trimestre: "T2", irl_valeur: 140.59 };
// Le brouillon tel que commencerBail l’a créé : les valeurs du bail précédent, sans dépôt ni dates.
const defauts = { type: "nu", loyer_hc: 930, charges: 65, charges_mode: "provision", jour_echeance: 5, paiement_echeance: "echoir", revision_irl: true, irl_trimestre: "T2", irl_valeur: 140.59, depot_garantie: null, date_debut: null };
const props = { orgId: "o", bailId: "b", defauts, bailPrecedent, agence: false, meuble: false, chambres: [] as { id: string; nom: string }[], surfaceHabitable: 62 };
const mention = (rendu: unknown) => trouver(rendu as Parameters<typeof trouver>[0], e => e.props.id === "reprise-bail-precedent")[0];
const valeur = (rendu: unknown, nom: string) => trouver(rendu as Parameters<typeof trouver>[0], e => e.props.name === nom)[0]?.props.value;

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { vi.stubGlobal("location", { hash: "" }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("document", new EventTarget()); vi.clearAllMocks(); m.etape = "loyer"; });

describe("CB-08 — mention « Repris du bail précédent » à l’étape Loyer", () => {
  it("nomme la période et les champs repris, puis les efface sur demande", async () => {
    const i = monter(FormulaireParcoursBail, props);
    i.stabiliser();
    const p = mention(i.rendu);
    expect(texte(p)).toBe("Repris du bail précédent (du 01/09/2023 au 31/08/2026), à vérifier : loyer hors charges, charges mensuelles, mode de charges, jour d’échéance, paiement du loyer, révision annuelle du loyer, trimestre IRL, valeur de l’IRL de référence. Effacer ces valeurs");
    expect(valeur(i.rendu, "depot_garantie")).toBe("");
    const effacer = trouver(p, e => e.type === "button")[0];
    expect(effacer.props.type).toBe("button");
    (effacer.props.onClick as () => void)();
    await i.vider();
    expect(mention(i.rendu)).toBeUndefined();
    expect(["loyer_hc", "charges", "jour_echeance", "irl_trimestre", "irl_valeur"].map(nom => valeur(i.rendu, nom))).toEqual(["", "", "", "", ""]);
    expect(["charges_mode", "paiement_echeance", "revision_irl"].map(nom => valeur(i.rendu, nom))).toEqual(["provision", "echoir", "false"]);
    // Le type, saisi à l’étape « Le bail », n’est pas touché par l’effacement.
    expect(valeur(i.rendu, "type")).toBe("nu");
    i.demonter();
  });
  it("disparaît dès que le loyer et les charges ne sont plus ceux du bail précédent, et ne liste que les champs encore identiques", async () => {
    const i = monter(FormulaireParcoursBail, props);
    i.stabiliser();
    const saisir = async (nom: string, v: string) => { (trouver(i.rendu, e => e.props.name === nom)[0].props.onChange as (e: unknown) => void)({ target: { value: v } }); await i.vider(); };
    await saisir("loyer_hc", "950");
    expect(texte(mention(i.rendu))).toContain("à vérifier : charges mensuelles, mode de charges");
    expect(texte(mention(i.rendu))).not.toContain("loyer hors charges");
    await saisir("charges", "70");
    expect(mention(i.rendu)).toBeUndefined();
    await saisir("charges", "65,00");
    expect(texte(mention(i.rendu))).toContain("charges mensuelles");
    i.demonter();
  });
  it("sans bail précédent, ou sur un brouillon aux montants différents, rien n’est affiché", () => {
    const sans = monter(FormulaireParcoursBail, { ...props, bailPrecedent: null });
    sans.stabiliser(); expect(mention(sans.rendu)).toBeUndefined(); sans.demonter();
    const differents = monter(FormulaireParcoursBail, { ...props, defauts: { ...defauts, loyer_hc: 1000, charges: 80 } });
    differents.stabiliser(); expect(mention(differents.rendu)).toBeUndefined(); differents.demonter();
    const vide = monter(FormulaireParcoursBail, { ...props, defauts: { type: "nu", loyer_hc: null, charges: null } });
    vide.stabiliser(); expect(mention(vide.rendu)).toBeUndefined(); vide.demonter();
  });
  it("à l’étape « Le bail », le type repris est signalé avec la période du bail précédent", () => {
    m.etape = "bail";
    const i = monter(FormulaireParcoursBail, props);
    i.stabiliser();
    const introduction = texte(trouver(i.rendu, e => e.type === "p")[0]);
    expect(introduction).toContain("Le type de bail est repris du bail précédent (du 01/09/2023 au 31/08/2026), à vérifier.");
    expect(mention(i.rendu)).toBeUndefined();
    i.demonter();
    const colocation = monter(FormulaireParcoursBail, { ...props, bailPrecedent: { ...bailPrecedent, type: "colocation" } });
    colocation.stabiliser();
    expect(texte(trouver(colocation.rendu, e => e.type === "p")[0])).not.toContain("repris du bail précédent");
    colocation.demonter();
  });
});
