/**
 * Fiche d'un incident, liste « Artisans proposables » (seconde relecture du 15/10/2026 du lot « invitation-artisan ») :
 * un propriétaire direct ne peut pas « enregistrer une entreprise » (l'ajout par SIRET est réservé aux agences) ; il
 * INVITE un artisan. Le texte qui l'envoyait vers un geste impossible dit « inviter un (autre) artisan » et mène au
 * formulaire d'invitation de son carnet. Les agences gardent leur texte. Et, pour le propriétaire, les artisans de son
 * carnet qui ne peuvent pas être sollicités pour ce bien sont nommés, avec la raison.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/actions/incidents", () => ({
  annulerMission: vi.fn(), deciderAvenant: vi.fn(), evaluerArtisan: vi.fn(), fixerRendezVous: vi.fn(),
  ouvrirConsultation: vi.fn(), refuserDevis: vi.fn(), demanderRevisionDevis: vi.fn(), retenirDevis: vi.fn(), reviserImputation: vi.fn(), solliciterArtisan: vi.fn(),
}));

import { ConsultationOuverte } from "@/app/agence/[orgId]/incidents/volet-artisan";

const consultation = {
  id: "c1", metier: "plomberie", nature_travaux: "gros_oeuvre", decennale_requise: true,
  devis_unique_assume: false, validite_jusqu_au: null, validite_jours: 30, statut: "ouverte", created_at: "2026-09-20T08:00:00.000Z",
};
const affectable = {
  artisan_id: "a1", raison_sociale: "Plomberie Martin", telephone: "0611111111", email: null, rattache: true,
  note_publiee: null, nb_evaluations: 0, publiable: false, decennale_valide: true,
};
const sollicite = { id: "s1", consultation_id: "c1", artisan_id: "a1", statut: "refusee", envoyee_le: "2026-09-21T08:00:00.000Z", repondue_le: "2026-09-22T08:00:00.000Z", refus_motif: "Indisponible" };

function rendre(estProprietaire: boolean, affectables: unknown[], sollicitations: unknown[] = [], carnetBien: unknown[] | null = null) {
  const html = renderToStaticMarkup(createElement(ConsultationOuverte, {
    orgId: "o1", consultation, sollicitations: sollicitations as never, devis: [], affectables: affectables as never,
    noteDe: new Map(), nom: () => "Plomberie Martin", aujourdhui: "2026-10-15", commune: "Bordeaux",
    estProprietaire, carnetBien: carnetBien as never,
  }));
  return { html, texte: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

describe("aucun artisan proposable", () => {
  it("propriétaire : « Invitez un artisan », vers le formulaire d'invitation de son carnet", () => {
    const { html, texte } = rendre(true, []);
    expect(texte).toContain("Invitez un artisan");
    expect(html).toContain('href="/agence/o1/artisans#inviter-un-artisan"');
    expect(texte).not.toMatch(/enregistrez une (autre )?entreprise/i);
  });

  it("agence : son texte d'origine", () => {
    const { texte } = rendre(false, []);
    expect(texte).toContain("Enregistrez une entreprise dans votre carnet");
    expect(texte).not.toContain("Invitez un artisan");
  });
});

describe("tous les artisans proposables déjà sollicités", () => {
  it("propriétaire : « invitez un autre artisan »", () => {
    const { html, texte } = rendre(true, [affectable], [sollicite]);
    expect(texte).toContain("invitez un autre artisan");
    expect(html).toContain('href="/agence/o1/artisans#inviter-un-artisan"');
    expect(texte).not.toMatch(/enregistrez une autre entreprise/i);
  });

  it("agence : son texte d'origine", () => {
    const { texte } = rendre(false, [affectable], [sollicite]);
    expect(texte).toContain("enregistrez une autre entreprise dans votre carnet");
  });
});

describe("le carnet du propriétaire vu pour ce bien", () => {
  it("nomme l'artisan validé qui n'est pas proposé, avec la raison (zone, décennale)", () => {
    const { texte } = rendre(true, [], [], [{
      artisan_id: "a9", raison_sociale: "Toitures Durand", metiers: ["plomberie"], sollicitable_plateforme: true,
      relation_active: true, zone_couvre: false, decennale_valide: false, code_postal: "33000",
    }]);
    expect(texte).toContain("Dans votre carnet, ne peuvent pas être sollicités pour ce bien");
    expect(texte).toContain("Toitures Durand : sa zone d’intervention ne couvre pas le 33000 ; pas de garantie décennale valide, exigée pour ces travaux.");
  });
});
