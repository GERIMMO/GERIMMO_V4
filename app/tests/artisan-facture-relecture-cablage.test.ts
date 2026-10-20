/**
 * D24-B (fiche ARC-07) : le câblage entre la fiche du chantier et l'écran de relecture de la facture.
 *
 * La page passe au formulaire le total TTC du devis accepté (en centimes) ; la relecture s'en sert pour dire si le
 * montant saisi s'écarte du devis. Les propriétés React ne figurent pas dans le HTML rendu : ce test remplace le
 * formulaire par un espion pour lire ce que la page lui transmet, puis rejoue la chaîne réelle avec ce qu'elle a
 * transmis (gestionnaire d'envoi du vrai `FormulairePrive`, état de relecture, `RelectureFacture`), sans rien saisir
 * à la main du côté du devis. Les crochets de React sont simulés (même méthode que
 * artisan-facture-relecture-formulaire.test.ts). Ordre des états : 0 résultat, 1 envoi, 2 relecture ouverte, 3 saisie relue.
 */
process.env.TZ = "UTC";

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProprietesFormulaire = ComponentProps<typeof import("@/app/artisan/clients/formulaire").FormulairePrive>;

const sim = vi.hoisted(() => ({
  activite: null as unknown,
  formulaires: [] as unknown[],
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/clients/actions", () => ({ enregistrerActivitePrivee: sim.enregistrer }));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: [] }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return {
    ...reel,
    environnementArtisanLocal: () => true,
    activationArtisanLocale: () => true,
    chargerActivitePrivee: async () => ({ data: sim.activite }),
  };
});
// L'espion : la page rend ce « formulaire » à la place du vrai et lui confie ses propriétés telles que la page les a écrites.
vi.mock("@/app/artisan/clients/formulaire", () => ({
  FormulairePrive: (proprietes: unknown) => { sim.formulaires.push(proprietes); return null; },
  LignesDevis: () => null,
}));

import PageChantier from "@/app/artisan/chantiers/[chantierId]/page";

class FormDataSimule {
  private champs = new Map<string, unknown>(Object.entries(sim.champs));
  get(nom: string) { return this.champs.get(nom) ?? null; }
  getAll(nom: string) { return this.champs.has(nom) ? [this.champs.get(nom)] : []; }
  delete(nom: string) { this.champs.delete(nom); }
  set(nom: string, valeur: unknown) { this.champs.set(nom, valeur); }
}

type DevisFixture = { id: string; version: number; statut: string; ttc: number };
function activite(devis: DevisFixture[]) {
  return {
    clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le: null }],
    chantiers: [{ id: "h1", client_id: "c1", titre: "Chantier TEST", adresse: "1 rue des Tests", description: "Fuite sous l’évier", statut: "termine", revision: 7, bilan: "Fuite réparée", photo_id: "p9" }],
    devis: devis.map((d) => ({
      id: d.id, chantier_id: "h1", version: d.version, statut: d.statut, description: "Réparation", lignes: [], montant_ht_cents: Math.round(d.ttc / 1.2),
      montant_tva_cents: d.ttc - Math.round(d.ttc / 1.2), montant_ttc_cents: d.ttc,
      entreprise: { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" },
      client: { nom: "Mme Test" }, valide_jusqu_au: "2026-11-12", pdf_id: null, preuve_acceptation_id: null, created_at: "2026-10-13T20:00:00.000Z",
    })),
    rendez_vous: [], factures: [], pieces: [], reglements: [], evenements: [],
    activation: { clients: true, reglements: true },
  };
}

/** Rend la fiche du chantier et rend les propriétés que la page a transmises au formulaire de dépôt de la facture. */
async function formulaireFacture() {
  sim.formulaires = [];
  renderToStaticMarkup((await PageChantier({ params: Promise.resolve({ chantierId: "h1" }) })) as never);
  const trouves = (sim.formulaires as ProprietesFormulaire[]).filter((f) => f.action === "facture");
  expect(trouves).toHaveLength(1);
  return trouves[0];
}

/**
 * Ce que fait l'artisan : il remplit, puis appuie sur « Relire avant de déposer ». Renvoie le HTML du formulaire à la relecture,
 * construit par le vrai composant avec la saisie que son gestionnaire d'envoi a rangée.
 */
async function relire(proprietes: ProprietesFormulaire, saisie: Record<string, unknown>) {
  const { FormulairePrive } = await vi.importActual<typeof import("@/app/artisan/clients/formulaire")>("@/app/artisan/clients/formulaire");
  const { children, ...autres } = proprietes;
  sim.champs = saisie;
  sim.etats = {};
  sim.appels = [];
  sim.indice = 0;
  const formulaire = FormulairePrive({ ...autres, children: null }) as unknown as { props: { onSubmit: (e: unknown) => Promise<void> } };
  await formulaire.props.onSubmit({ preventDefault() {}, currentTarget: { elements: [] } });
  expect(sim.enregistrer).not.toHaveBeenCalled();
  const rangee = sim.appels.find(([i]) => i === 3);
  expect(rangee, "le premier envoi range la saisie à relire").toBeDefined();
  sim.etats = { 2: true, 3: rangee![1] };
  sim.indice = 0;
  return renderToStaticMarkup(createElement(FormulairePrive, autres as ComponentProps<typeof FormulairePrive>, children as ReactNode));
}

const piece = () => new File([new Uint8Array(2048)], "facture.pdf", { type: "application/pdf" });
const accepte = (ttc: number, version = 1): DevisFixture => ({ id: `d${version}`, version, statut: "accepte", ttc });

beforeEach(() => {
  sim.enregistrer.mockReset();
  vi.stubGlobal("FormData", FormDataSimule);
  vi.stubGlobal("location", { href: "https://exemple.test/artisan/chantiers/h1" });
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});
afterEach(() => vi.unstubAllGlobals());

describe("la page transmet au formulaire le total TTC du devis accepté, en centimes", () => {
  it("devis accepté de 120,00 € : 12000, ni 120 ni rien", async () => {
    sim.activite = activite([accepte(12000)]);
    expect((await formulaireFacture()).relectureFacture).toEqual({ devisTtcCents: 12000 });
  });

  it("c'est le total du devis accepté, quelle que soit sa place parmi les versions", async () => {
    sim.activite = activite([
      { id: "d1", version: 1, statut: "remplace", ttc: 9000 },
      { id: "d2", version: 2, statut: "accepte", ttc: 12000 },
      { id: "d3", version: 3, statut: "refuse", ttc: 15000 },
    ]);
    expect((await formulaireFacture()).relectureFacture).toEqual({ devisTtcCents: 12000 });
  });

  it("sans devis accepté, la relecture ne calcule aucun écart : le total transmis est null", async () => {
    sim.activite = activite([{ id: "d1", version: 1, statut: "valide", ttc: 12000 }]);
    expect((await formulaireFacture()).relectureFacture).toEqual({ devisTtcCents: null });
  });

  it("le formulaire de facture est le seul à passer par la relecture", async () => {
    sim.activite = activite([accepte(12000)]);
    await formulaireFacture();
    const autres = (sim.formulaires as ProprietesFormulaire[]).filter((f) => f.action !== "facture");
    for (const f of autres) expect(f.relectureFacture, f.action).toBeUndefined();
  });
});

describe("de bout en bout : devis de 120,00 € accepté, l'artisan relit sa facture", () => {
  const saisie = (montant: string, justification = "") => ({ numero: "ART-2026-0001", montant, justification, fichier: piece() });

  it("saisie de 130,00 € : la relecture montre le devis, l'écart de 10,00 € et bloque le dépôt tant que l'écart n'est pas expliqué", async () => {
    sim.activite = activite([accepte(12000)]);
    const page = await relire(await formulaireFacture(), saisie("130,00"));
    expect(page).toContain("Relisez votre facture avant de la déposer");
    expect(page).toMatch(/Devis accepté<\/dt><dd[^>]*>120,00\s€/);
    expect(page).toMatch(/Montant TTC<\/dt><dd[^>]*>130,00\s€/);
    expect(page).toMatch(/Écart avec le devis accepté<\/dt><dd[^>]*>supérieur de 10,00\s€/);
    expect(page).toContain("expliquez l’écart");
    expect(page).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Confirmer et déposer ma facture<\/button>/);
  });

  it("saisie de 130,00 € expliquée : l'écart est rappelé avec sa justification et le dépôt est ouvert", async () => {
    sim.activite = activite([accepte(12000)]);
    const page = await relire(await formulaireFacture(), saisie("130,00", "Fourniture supplémentaire demandée sur place"));
    expect(page).toMatch(/supérieur de 10,00\s€/);
    expect(page).toContain("Fourniture supplémentaire demandée sur place");
    expect(page).not.toContain("expliquez l’écart");
    expect(page).not.toMatch(/disabled=""[^>]*>Confirmer et déposer/);
  });

  it("saisie de 120,00 € : aucun écart n'est affiché, le dépôt est ouvert", async () => {
    sim.activite = activite([accepte(12000)]);
    const page = await relire(await formulaireFacture(), saisie("120,00"));
    expect(page).toMatch(/Devis accepté<\/dt><dd[^>]*>120,00\s€/);
    expect(page).not.toContain("Écart avec le devis");
    expect(page).not.toMatch(/disabled=""[^>]*>Confirmer et déposer/);
  });

  it("saisie de 110,00 € : écart inférieur de 10,00 €", async () => {
    sim.activite = activite([accepte(12000)]);
    expect(await relire(await formulaireFacture(), saisie("110,00"))).toMatch(/inférieur de 10,00\s€/);
  });

  it("sans devis accepté connu, la relecture n'affiche ni devis ni écart", async () => {
    sim.activite = activite([{ id: "d1", version: 1, statut: "valide", ttc: 12000 }]);
    const page = await relire(await formulaireFacture(), saisie("130,00"));
    expect(page).not.toContain("Devis accepté");
    expect(page).not.toContain("Écart avec le devis");
  });
});
