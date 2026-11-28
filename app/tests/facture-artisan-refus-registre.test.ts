/**
 * LA FACTURE REFUSÉE DANS LE REGISTRE DE L'ARTISAN — audit palier 1 du 22/11/2026, P1-03.
 *
 * Une facture que le client a refusée reste dans le registre privé de l'artisan (rien n'est effacé), mais elle n'est
 * plus présentée comme une somme attendue :
 *  1. la synthèse ne la compte ni dans les factures attendues, ni dans le reste à recevoir ;
 *  2. la liste la dit « Refusée par votre client », sans lien pour déclarer un règlement ;
 *  3. « Mon registre » le dit à côté du solde ;
 *  4. la fiche de suivi le dit, renvoie au dossier d'origine, et ne propose plus de déclarer un règlement reçu.
 * Les pages sont des composants serveur : on les appelle comme Next le fait, puis on rend l'arbre obtenu.
 */
process.env.TZ = "UTC";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ activite: null as unknown, clients: { lignes: [] as unknown[], erreur: false } }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  usePathname: () => "/artisan/facturation",
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: [] }),
  chargerReglementsFactures: async () => sim.clients,
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return { ...reel, environnementArtisanLocal: () => true, activationModuleArtisan: () => true, chargerActivitePrivee: async () => ({ data: sim.activite }) };
});

import PageFacture from "@/app/artisan/facturation/[factureId]/page";
import { ReglementsDansFacturation } from "@/app/artisan/clients/resumes";
import { preparerVueFactures, VueFactures } from "@/app/artisan/facturation/vue-factures";
import type { ActiviteArtisanPrivee, FactureArtisanPrivee } from "@/lib/artisan-prive";
import type { FactureVueParArtisan } from "@/lib/reglement-facture";

const facture = (id: string, montant = 120000): FactureArtisanPrivee => ({ id, client: "Agence du Port", montant_ttc_cents: montant, numero: `F-${id}`, origine: "gerimmo", created_at: "2026-11-20T09:00:00.000Z", intervention_id: `m-${id}` });
const client = (id: string, etat: FactureVueParArtisan["etat"]): FactureVueParArtisan => ({ facture_id: id, intervention_id: `m-${id}`, organization_id: "org", numero: `F-${id}`, montant_ttc_cents: 120000, validee_le: etat === "validee" ? "2026-11-21T10:00:00Z" : null, etat, reglements: [], reglee_le: null });
const activite = (factures: FactureArtisanPrivee[]): ActiviteArtisanPrivee =>
  ({ factures, reglements: [], avoirs: [], clients: [], chantiers: [], devis: [], rendez_vous: [], pieces: [], evenements: [], activation: { clients: true, reglements: true } }) as unknown as ActiviteArtisanPrivee;
const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const html = async (element: unknown) => renderToStaticMarkup((await element) as never);

beforeEach(() => {
  sim.activite = activite([facture("refusee"), facture("corrigee", 100000)]);
  sim.clients = { erreur: false, lignes: [client("refusee", "refusee"), client("corrigee", "validee")] };
});

describe("la synthèse de la facturation", () => {
  it("une facture refusée n'est ni attendue, ni comptée dans le reste à recevoir", () => {
    const v = preparerVueFactures(sim.activite as ActiviteArtisanPrivee, sim.clients.lignes as FactureVueParArtisan[]);
    expect(v.lignes.map((l) => l.statut)).toEqual(["Refusée par votre client", "À régler"]);
    expect([v.attendues, v.reste, v.enValidation]).toEqual([1, 100000, 0]);
    // Une facture déposée figure uniquement dans le compteur de validation.
    const sans = preparerVueFactures(sim.activite as ActiviteArtisanPrivee, [client("refusee", "deposee"), client("corrigee", "validee")]);
    expect([sans.attendues, sans.reste, sans.enValidation]).toEqual([1, 100000, 1]);
  });

  it("la liste la dit refusée, sans lien pour déclarer un règlement reçu", () => {
    const page = renderToStaticMarkup(createElement(VueFactures, { data: sim.activite as ActiviteArtisanPrivee, clients: sim.clients.lignes as FactureVueParArtisan[], erreurClients: false, agenda: [] }));
    const lignes = page.split("<li").slice(1);
    const refusee = lignes.find((l) => l.includes("F-refusee")) ?? "";
    const corrigee = lignes.find((l) => l.includes("F-corrigee")) ?? "";
    expect(texte(refusee)).toContain("Refusée par votre client");
    expect(texte(refusee)).toContain("Refusée par votre client : à corriger");
    expect(refusee).not.toContain("#declarer-reglement");
    expect(texte(refusee)).toContain("Voir le détail et l’historique");
    expect(corrigee).toContain("#declarer-reglement");
  });
});

describe("« Mon registre »", () => {
  it("le refus se lit à côté du solde, pour la facture refusée seulement", async () => {
    const page = await html(ReglementsDansFacturation({ lecture: { data: sim.activite } as never, refusees: new Set(["refusee"]) }));
    const lignes = page.split("<li").slice(1);
    expect(texte(lignes.find((l) => l.includes("F-refusee")) ?? "")).toContain("Gerimmo · Aucun règlement déclaré · Refusée par votre client");
    expect(texte(lignes.find((l) => l.includes("F-corrigee")) ?? "")).not.toContain("Refusée");
  });

  it("sans information de refus, le registre reste celui d'avant", async () => {
    const page = texte(await html(ReglementsDansFacturation({ lecture: { data: sim.activite } as never })));
    expect(page).not.toContain("Refusée par votre client");
  });
});

describe("la fiche de suivi de la facture", () => {
  const fiche = (factureId: string) => html(PageFacture({ params: Promise.resolve({ factureId }) }));

  it("refusée : dit le refus, renvoie au dossier d'origine, et ne propose plus de déclarer un règlement", async () => {
    const page = await fiche("refusee");
    const t = texte(page);
    expect(t).toContain("Déclaré par votre client");
    expect(t).toContain("Refusée par votre client : à corriger");
    expect(page).toContain("data-facture-refusee");
    expect(t).toContain("Le motif du refus se lit dans le dossier d’origine, où vous pouvez déposer une facture corrigée. Cette facture reste dans votre registre.");
    expect(page).toContain('href="/artisan/missions/m-refusee"');
    expect(page).not.toContain('id="declarer-reglement"');
    expect(t).not.toContain("Déclarer un règlement reçu");
  });

  it("en vigueur : la déclaration d'un règlement reste proposée", async () => {
    const page = await fiche("corrigee");
    expect(page).toContain('id="declarer-reglement"');
    expect(page).not.toContain("data-facture-refusee");
  });
});
