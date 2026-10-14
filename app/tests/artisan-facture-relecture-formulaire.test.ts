/**
 * D24-B (fiche ARC-07) : le formulaire de dépôt d'une facture externe ne part qu'après la relecture.
 *
 * Les crochets de React sont simulés (même méthode que artisan-prive-session-expiree.test.ts) pour appeler le vrai
 * gestionnaire d'envoi de `FormulairePrive` sans navigateur : on observe ce qu'il range dans l'état et si l'action
 * serveur est appelée. Ordre des états : 0 résultat affiché, 1 envoi en cours, 2 relecture ouverte, 3 saisie relue.
 */
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  enregistrer: vi.fn(),
  appels: [] as [number, unknown][],
  indice: 0,
  etats: {} as Record<number, unknown>,
  champs: {} as Record<string, unknown>,
}));

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  return {
    ...reel,
    useState: (initial: unknown) => {
      const i = sim.indice++;
      return [i in sim.etats ? sim.etats[i] : initial, (valeur: unknown) => { sim.appels.push([i, valeur]); }];
    },
    useRef: () => ({ current: null }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/app/artisan/clients/actions", () => ({ enregistrerActivitePrivee: sim.enregistrer }));

import { FormulairePrive } from "@/app/artisan/clients/formulaire";
import { resumerFacture, type EntreesRelectureFacture } from "@/lib/artisan-prive-facture";

class FormDataSimule {
  private champs = new Map<string, unknown>(Object.entries(sim.champs));
  get(nom: string) { return this.champs.get(nom) ?? null; }
  set(nom: string, valeur: unknown) { this.champs.set(nom, valeur); }
}

const releve = (surcharge: Partial<EntreesRelectureFacture> = {}): EntreesRelectureFacture => ({
  numero: "ART-2026-0001", montant: "55,00", justification: "", fichier: { nom: "facture.pdf", taille: 2048 }, devisTtcCents: 5500, ...surcharge,
});

function rendre(avecRelecture = true) {
  sim.indice = 0;
  return FormulairePrive({
    action: "facture", id: "h1", revision: 7, libelle: "Confirmer et déposer ma facture", children: null,
    ...(avecRelecture ? { relectureFacture: { devisTtcCents: 5500 } } : {}),
  });
}
async function envoyer(avecRelecture = true) {
  const formulaire = rendre(avecRelecture) as unknown as { props: { onSubmit: (e: unknown) => Promise<void> } };
  await formulaire.props.onSubmit({ preventDefault() {}, currentTarget: { elements: [] } });
}

beforeEach(() => {
  sim.enregistrer.mockReset();
  sim.appels = [];
  sim.etats = {};
  sim.champs = { numero: "ART-2026-0001", montant: "55,00", justification: "" };
  vi.stubGlobal("FormData", FormDataSimule);
  vi.stubGlobal("location", { href: "https://exemple.test/artisan/chantiers/h1" });
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});
afterEach(() => vi.unstubAllGlobals());

describe("premier envoi : il relit, il ne dépose pas", () => {
  it("n'appelle pas l'action serveur, range la saisie et ouvre la relecture", async () => {
    await envoyer();
    expect(sim.enregistrer).not.toHaveBeenCalled();
    expect(sim.appels).toContainEqual([2, true]);
    const [, saisie] = sim.appels.find(([i]) => i === 3)!;
    expect(saisie).toEqual({ numero: "ART-2026-0001", montant: "55,00", justification: "", fichier: null, devisTtcCents: 5500 });
    expect(sim.appels.find(([i]) => i === 1)).toBeUndefined();
  });

  it("garde le nom et la taille de la pièce choisie pour la relecture", async () => {
    sim.champs.fichier = new File([new Uint8Array(2048)], "facture.pdf", { type: "application/pdf" });
    await envoyer();
    const [, saisie] = sim.appels.find(([i]) => i === 3)! as [number, EntreesRelectureFacture];
    expect(saisie.fichier).toEqual({ nom: "facture.pdf", taille: 2048 });
  });

  it("un formulaire sans relecture (client, chantier, devis…) envoie tout de suite", async () => {
    sim.enregistrer.mockResolvedValue({ succes: "Enregistré dans votre espace privé." });
    await envoyer(false);
    expect(sim.enregistrer).toHaveBeenCalledTimes(1);
  });
});

describe("second envoi, depuis la relecture : il dépose", () => {
  beforeEach(() => { sim.etats = { 2: true, 3: releve() }; });

  it("appelle l'action serveur une seule fois, avec la clé de la demande", async () => {
    sim.enregistrer.mockResolvedValue({ succes: "Enregistré dans votre espace privé.", href: "/artisan/chantiers/h1" });
    await envoyer();
    expect(sim.enregistrer).toHaveBeenCalledTimes(1);
    const form = sim.enregistrer.mock.calls[0][0] as FormDataSimule;
    expect(form.get("cle")).toBe("11111111-1111-4111-8111-111111111111");
    expect(sim.appels).toContainEqual([1, true]);
  });

  it("un refus du serveur (numéro déjà utilisé) ramène à la saisie et affiche le message", async () => {
    sim.enregistrer.mockResolvedValue({ erreur: "Ce numéro de facture est déjà utilisé dans votre registre." });
    await envoyer();
    expect(sim.appels).toContainEqual([0, { erreur: "Ce numéro de facture est déjà utilisé dans votre registre." }]);
    expect(sim.appels).toContainEqual([2, false]);
  });

  it("une coupure du réseau garde la relecture ouverte : on peut confirmer de nouveau, avec la même clé", async () => {
    sim.enregistrer.mockRejectedValue(new Error("réseau"));
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200 }));
    await envoyer();
    expect(sim.appels.some(([i, v]) => i === 2 && v === false)).toBe(false);
    expect(sim.appels.some(([i, v]) => i === 0 && typeof (v as { erreur?: string }).erreur === "string")).toBe(true);
  });
});

describe("rendu des deux étapes", () => {
  const html = (avecRelecture = true) => {
    sim.indice = 0;
    // Les enfants passent en troisième argument (règle react/no-children-prop) : le type du composant les exige dans les propriétés.
    const proprietes = {
      action: "facture", id: "h1", revision: 7, libelle: "Confirmer et déposer ma facture",
      ...(avecRelecture ? { relectureFacture: { devisTtcCents: 5500 } } : {}),
    } as ComponentProps<typeof FormulairePrive>;
    return renderToStaticMarkup(createElement(FormulairePrive, proprietes, createElement("input", { name: "numero" })));
  };

  it("à la saisie : un seul bouton, « Relire avant de déposer » ; les champs sont visibles", () => {
    const page = html();
    expect(page).toContain("Relire avant de déposer");
    expect(page).not.toContain("Confirmer et déposer ma facture");
    expect(page).not.toContain("Modifier la saisie");
    expect(page).not.toMatch(/<div hidden/);
  });

  it("à la relecture : le résumé, « Modifier la saisie » et le bouton qui dépose ; les champs restent dans la page, masqués", () => {
    sim.etats = { 2: true, 3: releve() };
    const page = html();
    expect(page).toContain("Relisez votre facture avant de la déposer");
    expect(page).toContain("Modifier la saisie");
    expect(page).toContain("Confirmer et déposer ma facture");
    expect(page).not.toContain("Relire avant de déposer");
    expect(page).toMatch(/<div hidden=""[^>]*><input name="numero"\/>/);
  });

  it("à la relecture, un blocage (montant illisible) désactive le dépôt mais laisse corriger", () => {
    sim.etats = { 2: true, 3: releve({ montant: "abc" }) };
    const page = html();
    expect(resumerFacture(releve({ montant: "abc" })).pret).toBe(false);
    expect(page).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Confirmer et déposer ma facture<\/button>/);
    expect(page).toMatch(/<button[^>]*type="button"[^>]*>Modifier la saisie<\/button>/);
  });

  it("à la relecture, un résumé prêt laisse le dépôt ouvert", () => {
    sim.etats = { 2: true, 3: releve() };
    expect(html()).not.toMatch(/disabled=""[^>]*>Confirmer et déposer/);
  });

  it("sans relecture, le formulaire reste celui d'avant : aucun bouton de relecture, aucun masquage", () => {
    const page = html(false);
    expect(page).toContain("Confirmer et déposer ma facture");
    expect(page).not.toContain("Relire avant de déposer");
    expect(page).not.toContain(' hidden=""');
  });
});
