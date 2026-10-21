import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatBail } from "@/app/actions/baux";
const m = vi.hoisted(() => ({ differer: false, enAttente: [] as (() => void)[], etat: {} as EtatBail, etape: "clauses", soumettre: vi.fn(), sauvegarder: vi.fn(), action: null as null | ((ancien: EtatBail, f: FormData) => Promise<EtatBail>) }));
vi.mock("react", async (original) => {
  const reel = await original<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  const useState = <T,>(initial: T | (() => T)) => {
    const [valeur, poser] = hooks.useState(initial);
    return [valeur, (suivant: T | ((precedent: T) => T)) => {
      if (m.differer && typeof suivant === "function") m.enAttente.push(() => poser(suivant));
      else poser(suivant);
    }] as const;
  };
  const remplacement = { ...hooks, useState, useContext: () => ({ etape: m.etape, ouvrir: vi.fn() }) };
  return { ...reel, ...remplacement, default: { ...reel, ...remplacement } };
});
vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: (a: typeof m.action) => { m.action = a; return { etat: m.etat, soumettre: m.soumettre, enCours: false }; } }));
vi.mock("@/lib/suivi-enregistrement", () => ({ useActionStateSuivi: (a: typeof m.action) => { m.action = a; return [m.etat, m.soumettre, false]; } }));
vi.mock("@/app/actions/etapes-bail", () => ({ modifierEtapeBail: m.sauvegarder }));
vi.mock("@/app/actions/baux", () => ({ modifierComplementsBail: m.sauvegarder }));
import { FormulaireParcoursBail } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-parcours-bail";
import { FormulaireComplementsBail } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail";
import { AvertissementsLoyer } from "@/components/avertissements-loyer";
import { monter, trouver, texte } from "./aide/hooks-sans-dom";
import type { ReactNode } from "react";
const defauts = { travaux_recents: null, encadrement_loyer: true, loyer_hc: 1200, loyer_reference: 20, loyer_reference_majore: 24, complement_loyer: 0, type: "nu" };
const avertissement = (rendu: ReactNode) => trouver(rendu, e => e.type === AvertissementsLoyer)[0];
const codes = (rendu: ReactNode) => (avertissement(rendu)?.props.avertissements as { code: string }[] ?? []).map(a => a.code);
beforeEach(() => { vi.clearAllMocks(); m.differer = false; m.enAttente = []; m.etat = {}; m.etape = "clauses"; m.sauvegarder.mockResolvedValue({ succes: "Étape enregistrée.", avertissements: [{ code: "base_superieure", message: "Montant à vérifier" }] }); });
describe("X08 — avertissement réactif, sans empêcher l’enregistrement", () => {
  it("parcours courant : référence majorée modifiée puis corrigée et encadrement désactivé", async () => {
    const i = monter(FormulaireParcoursBail, { orgId: "o", bailId: "b", defauts, agence: false, meuble: false, chambres: [], surfaceHabitable: 50 });
    i.stabiliser(); expect(codes(i.rendu)).toEqual([]);
    const saisir = async (nom: string, valeur: string) => {
      const champ = trouver(i.rendu, e => e.props.name === nom)[0];
      (champ.props.onChange as (e: unknown) => void)({ target: { value: valeur } });
      await i.vider();
    };
    await saisir("loyer_reference_majore", "25"); expect(codes(i.rendu)).toContain("reference_majoree");
    await saisir("loyer_reference_majore", "24"); expect(codes(i.rendu)).toEqual([]);
    await saisir("loyer_hc", "1400"); expect(codes(i.rendu)).toContain("base_superieure");
    await saisir("type", "colocation_individuelle"); expect(codes(i.rendu)).toContain("colocation_individuelle"); expect(codes(i.rendu)).not.toContain("base_superieure");
    await saisir("chambre_id", "ancienne-chambre");
    await saisir("type", "nu"); expect(codes(i.rendu)).not.toContain("colocation_individuelle"); expect(codes(i.rendu)).toContain("base_superieure");
    await saisir("encadrement_loyer", "false"); expect(codes(i.rendu)).toEqual([]);
    expect(trouver(i.rendu, e => Boolean(e.props.enCoursTexte))[0].props.enCours).toBe(false);
    i.demonter();
  });
  it("préserve le montant saisi quand React applique la mise à jour après la restauration du champ", async () => {
    m.etape = "loyer";
    const i = monter(FormulaireParcoursBail, { orgId: "o", bailId: "b", defauts, agence: false, meuble: false, chambres: [] });
    i.stabiliser(); m.differer = true;
    const champ = trouver(i.rendu, e => e.props.name === "charges")[0];
    const evenement = { target: { value: "50" } };
    (champ.props.onChange as (e: unknown) => void)(evenement);
    evenement.target.value = "";
    for (const appliquer of m.enAttente.splice(0)) appliquer();
    await i.vider();
    expect(trouver(i.rendu, e => e.props.name === "charges")[0].props.value).toBe("50");
    i.demonter();
  });
  it("le retour serveur reste visible après sauvegarde, puis la saisie reprend le contrôle", async () => {
    const i = monter(FormulaireParcoursBail, { orgId: "o", bailId: "b", defauts, agence: false, meuble: false, chambres: [], surfaceHabitable: 50 });
    i.stabiliser(); m.etat = await m.action!({}, new FormData()); await i.vider(); i.stabiliser();
    expect(codes(i.rendu)).toContain("base_superieure"); expect(avertissement(i.rendu).props.enregistre).toBe(true);
    (trouver(i.rendu, e => e.type === "form")[0].props.onChange as () => void)(); await i.vider();
    expect(codes(i.rendu)).toEqual([]); expect(avertissement(i.rendu).props.enregistre).toBe(false);
    i.demonter();
  });
  it("compléments : le texte saisi réactualise le calcul sans attendre la sauvegarde", async () => {
    const i = monter(FormulaireComplementsBail, { orgId: "o", bailId: "b", defauts: defauts as never, agence: false, meuble: false, zoneTendue: true, modifiable: true, loyerHc: 1200, surfaceHabitable: 50 });
    i.stabiliser(); expect(codes(i.rendu)).toEqual([]);
    const form = trouver(i.rendu, e => e.type === "form")[0];
    (form.props.onChangeCapture as (e: unknown) => void)({ target: { name: "complement_loyer", value: "100" } }); await i.vider();
    expect(codes(i.rendu)).toContain("base_inferieure_avec_complement"); expect(codes(i.rendu)).toContain("complement_sans_justification");
    expect(trouver(i.rendu, e => Boolean(e.props.enCoursTexte))[0].props.disabled).toBeUndefined();
    i.demonter();
  });
  it("le message est informatif et ne contient aucun contrôle bloquant", () => {
    const r = AvertissementsLoyer({ avertissements: [{ code: "test", message: "À vérifier" }], enregistre: true });
    expect(texte(r)).toContain("Enregistré"); expect(texte(r)).toContain("ne bloque pas");
    expect(trouver(r, e => e.type === "input" || e.type === "button")).toHaveLength(0);
    expect(AvertissementsLoyer({ avertissements: [] })).toBeNull();
  });
});
