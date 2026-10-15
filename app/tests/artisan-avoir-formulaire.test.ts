/**
 * D24-C (fiche ARC-07) : l'annulation d'une facture externe se confirme en deux temps.
 *
 * Premier envoi : rien ne part, l'écran montre ce qui sera enregistré (facture, montant de l'avoir, motif, conséquences).
 * Second envoi, depuis ce résumé : l'action serveur est appelée, une seule fois, avec la clé de la demande.
 * Les crochets de React sont simulés (même méthode que artisan-facture-relecture-formulaire.test.ts). Ordre des états :
 * 0 résultat affiché, 1 envoi en cours, 2 relecture ouverte, 3 facture relue (dépôt), 4 annulation relue.
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
import { MESSAGE_ANNULATION_CONSEQUENCES, type EntreesAnnulationFacture } from "@/lib/artisan-prive-avoir";

class FormDataSimule {
  private champs = new Map<string, unknown>(Object.entries(sim.champs));
  get(nom: string) { return this.champs.get(nom) ?? null; }
  set(nom: string, valeur: unknown) { this.champs.set(nom, valeur); }
}

const MOTIF = "Erreur de numéro sur la pièce jointe";
const proprietes = {
  action: "annuler_facture", id: "h1", revision: 7, libelle: "Confirmer l’annulation et émettre l’avoir",
  relectureAnnulation: { numero: "ART-1", montantCents: 12000 },
};
const releve = (motif = MOTIF): EntreesAnnulationFacture => ({ numero: "ART-1", montantCents: 12000, motif });

async function envoyer() {
  sim.indice = 0;
  const formulaire = FormulairePrive({ ...proprietes, children: null }) as unknown as { props: { onSubmit: (e: unknown) => Promise<void> } };
  await formulaire.props.onSubmit({ preventDefault() {}, currentTarget: { elements: [] } });
}
const html = () => {
  sim.indice = 0;
  return renderToStaticMarkup(createElement(FormulairePrive, proprietes as ComponentProps<typeof FormulairePrive>, createElement("textarea", { name: "motif" })));
};

beforeEach(() => {
  sim.enregistrer.mockReset();
  sim.appels = [];
  sim.etats = {};
  sim.champs = { motif: MOTIF, facture_id: "f1" };
  vi.stubGlobal("FormData", FormDataSimule);
  vi.stubGlobal("location", { href: "https://exemple.test/artisan/chantiers/h1" });
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});
afterEach(() => vi.unstubAllGlobals());

describe("premier temps : relire, sans rien annuler", () => {
  it("n'appelle pas l'action serveur, range la facture, le montant et le motif, et ouvre la relecture", async () => {
    await envoyer();
    expect(sim.enregistrer).not.toHaveBeenCalled();
    expect(sim.appels).toContainEqual([2, true]);
    expect(sim.appels).toContainEqual([4, releve()]);
    expect(sim.appels.find(([i]) => i === 1)).toBeUndefined();
    expect(sim.appels.find(([i]) => i === 3)).toBeUndefined();
  });

  it("à la saisie : un seul bouton, « Relire avant d’annuler » ; le motif est visible", () => {
    const page = html();
    expect(page).toContain("Relire avant d’annuler");
    expect(page).not.toContain("Confirmer l’annulation et émettre l’avoir");
    expect(page).not.toMatch(/<div hidden/);
  });
});

describe("second temps : confirmer depuis le résumé", () => {
  beforeEach(() => { sim.etats = { 2: true, 4: releve() }; });

  it("le résumé, « Modifier la saisie » et le bouton qui annule ; le motif reste dans la page, masqué", () => {
    const page = html();
    expect(page).toContain("Relisez l’annulation avant de la confirmer");
    expect(page).toContain(MESSAGE_ANNULATION_CONSEQUENCES);
    expect(page).toContain("Modifier la saisie");
    expect(page).toContain("Confirmer l’annulation et émettre l’avoir");
    expect(page).not.toContain("Relire avant d’annuler");
    expect(page).toMatch(/<div hidden=""[^>]*><textarea name="motif"><\/textarea>/);
  });

  it("un motif trop court bloque le bouton de confirmation", () => {
    sim.etats = { 2: true, 4: releve("court") };
    expect(html()).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Confirmer l’annulation et émettre l’avoir<\/button>/);
  });

  it("appelle l'action serveur une seule fois, avec la clé de la demande", async () => {
    sim.enregistrer.mockResolvedValue({ succes: "Enregistré dans votre espace privé.", href: "/artisan/chantiers/h1" });
    await envoyer();
    expect(sim.enregistrer).toHaveBeenCalledTimes(1);
    const form = sim.enregistrer.mock.calls[0][0] as FormDataSimule;
    expect(form.get("cle")).toBe("11111111-1111-4111-8111-111111111111");
    expect(form.get("motif")).toBe(MOTIF);
    expect(form.get("facture_id")).toBe("f1");
  });

  it("un refus du serveur (règlement déclaré, déjà annulée…) ramène à la saisie et affiche le message", async () => {
    sim.enregistrer.mockResolvedValue({ erreur: "Cette facture est déjà annulée par un avoir." });
    await envoyer();
    expect(sim.appels).toContainEqual([0, { erreur: "Cette facture est déjà annulée par un avoir." }]);
    expect(sim.appels).toContainEqual([2, false]);
  });

  it("une coupure du réseau garde la relecture ouverte : on confirme de nouveau avec la même clé (rejeu sans second avoir)", async () => {
    sim.enregistrer.mockRejectedValue(new Error("réseau"));
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200 }));
    await envoyer();
    expect(sim.appels.some(([i, v]) => i === 2 && v === false)).toBe(false);
  });
});
