/**
 * Phase 3 de la mission palier 1, reprise du lot 49 (relecture de V02, « la même cause ailleurs ») : les deux écrans de
 * l'artisan qui nomment le logement d'une mission (la carte de l'agenda, la fiche de mission) juxtaposaient le nom du lot et
 * le champ Étage tels que saisis, sans la règle commune de lib/etage.ts que suivent les documents, la fenêtre du lot et les
 * écrans du locataire : « Duplex RDC et 1er étage · 1er · Cuisine », « Studio — 1er étage · 1er étage ». Ils l'appliquent.
 * Chaque cas ci-dessous échouait au commit 446c7fe6, sauf les témoins signalés.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LigneAgenda } from "@/app/artisan/acces";

const b = vi.hoisted(() => ({ agenda: { lignes: [] as LigneAgenda[], erreur: false } }));
// Les mêmes doublures que tests/audit-oct28-rendu.test.ts pour rendre la fiche de mission sans base.
vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
  usePathname: () => "/artisan/missions/mission", useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: (_: unknown, initial: unknown) => [initial, () => {}] }));
vi.mock("@/components/ui/bouton-envoi", () => ({ BoutonEnvoi: () => null }));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({ fiche: { statut_plateforme: "valide", visibilite: "public" }, supabase: { rpc: async () => ({ data: null, error: null }) } }),
  chargerAgenda: async () => b.agenda,
  chargerReglementsFactures: async () => ({ lignes: [], erreur: false }),
  chargerFacturesRefusees: async () => ({ lignes: [], erreur: false }),
  chargerEchangesNonLus: async () => ({ lignes: [], erreur: false }),
  chargerDemandesRdv: async () => ({ lignes: [], erreur: false }),
  chargerCreneauxMission: async () => ({ lignes: [], erreur: false }),
  chargerRendezVousManques: async () => ({ lignes: [], erreur: false }),
  chargerRelancesFactures: async () => ({ lignes: [], erreur: false }),
  chargerPhotosDemande: async () => ({ photos: [], erreur: false }),
  chargerSollicitations: async () => ({ lignes: [], erreur: false }),
  chargerPieces: async () => ({ lignes: [], erreur: false }),
}));
vi.mock("@/app/artisan/photos-demande", () => ({ PhotosDeLaDemande: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/accuse-annulation", () => ({ AccuseAnnulation: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/accepter-refuser", () => ({ AccepterOuRefuser: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/avertissement-rendez-vous", () => ({ AvertissementRendezVousAnticipe: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/bouton-demarrer", () => ({ BoutonDemarrer: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/dates-locataire", () => ({ DatesLocataire: () => null }));
vi.mock("@/components/echanges-intervention", () => ({ EchangesIntervention: () => null }));
import { CarteMission } from "@/app/artisan/carte-mission";
import PageMission from "@/app/artisan/missions/[interventionId]/page";

const mission = (surcharge: Partial<LigneAgenda> = {}): LigneAgenda => ({
  intervention_id: "mission", organization_id: "org", agence_nom: "Agence du Port", incident_numero: "INC-1", statut: "planifiee",
  debut_prevu: "2099-01-01T08:00:00Z", fin_prevue: "2099-01-01T10:00:00Z", categorie: "plomberie_canalisation", description: null, urgence: "normale",
  piece: "Cuisine", nature_travaux: "entretien_courant", adresse: "1 rue du Test", code_postal: "44000", ville: "Nantes",
  lot_nom: "Duplex RDC et 1er étage", etage: "1er",
  occupant_nom: null, occupant_prenom: null, occupant_telephone: null, montant_ttc_cents: null, montant_plafond_cents: null,
  compte_rendu_depose: false, photo_apres_deposee: false, facture_deposee: false, creneaux_en_attente: 0, dates_locataire_en_attente: 0,
  ...surcharge,
} as LigneAgenda);

const texte = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/[\s  ]+/g, " ").trim();
const carte = (ligne: LigneAgenda) => texte(renderToStaticMarkup(createElement(CarteMission, { ligne })));
const fiche = async (ligne: LigneAgenda) => {
  b.agenda = { lignes: [ligne], erreur: false };
  return texte(renderToStaticMarkup(await PageMission({ params: Promise.resolve({ interventionId: "mission" }), searchParams: Promise.resolve({}) } as Parameters<typeof PageMission>[0])));
};

beforeEach(() => {
  b.agenda = { lignes: [], erreur: false };
});

describe("écrans de l'artisan : l'étage suit la règle commune, après le nom du lot", () => {
  it("la carte de l'agenda ne redit pas un niveau que le nom du lot nomme déjà", () => {
    expect(carte(mission())).toContain("Nantes · Duplex RDC et 1er étage");
    expect(carte(mission())).not.toContain("· 1er");
    expect(carte(mission({ lot_nom: "Studio — 1er étage", etage: "1er étage" }))).not.toContain("1er étage · 1er étage");
    expect(carte(mission({ lot_nom: "Studio — 1er étage", etage: "1er étage, porte B" }))).toContain("Studio — 1er étage · porte B");
  });

  it("la carte : un niveau que le nom ne dit pas s'affiche comme dans les documents (« 2e étage », plus « 2e » nu)", () => {
    expect(carte(mission({ etage: "2e" }))).toContain("Duplex RDC et 1er étage · 2e étage");
    expect(carte(mission({ lot_nom: "T2", etage: "3" }))).toContain("T2 · étage 3");
    // Témoin (passait déjà) : sans étage, rien après le nom du lot.
    expect(carte(mission({ etage: null }))).toContain("Nantes · Duplex RDC et 1er étage");
  });

  it("la fiche de mission : « Duplex RDC et 1er étage · Cuisine », sans « 1er » redit", async () => {
    const html = await fiche(mission());
    expect(html).toContain("Duplex RDC et 1er étage · Cuisine");
    expect(html).not.toContain("· 1er ·");
    expect(await fiche(mission({ etage: "2e" }))).toContain("Duplex RDC et 1er étage · 2e étage · Cuisine");
    expect(await fiche(mission({ lot_nom: "Studio — 1er étage", etage: "1er étage" }))).not.toContain("1er étage · 1er étage");
  });

  it("la fiche : un étage seul (sans nom de lot ni pièce) s'affiche encore", async () => {
    expect(await fiche(mission({ lot_nom: null, piece: null, etage: "4" }))).toContain("étage 4");
  });
});
