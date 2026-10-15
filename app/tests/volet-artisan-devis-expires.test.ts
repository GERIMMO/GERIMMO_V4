/**
 * Audit du 13/10/2026 (AUT-01), décision D42 option B : la tâche quotidienne passe à « expiré » les devis dont la
 * validité est dépassée. Ce statut les sort de la comparaison (qui ne garde que l'état « déposé ») et le message
 * « Expiré … caduc » de la carte disparaissait avec eux : le devis s'évanouissait de l'écran de l'agence.
 *
 * L'écran doit donc, une fois la tâche passée : garder les devis expirés visibles, en lecture seule (aucun bouton pour
 * les retenir), et ne plus parler d'« attendre » des artisans dont la demande est expirée. Avant le passage de la
 * tâche, le devis encore « déposé » mais périmé reste comparé comme avant, sans bouton.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/actions/incidents", () => ({
  annulerMission: vi.fn(), deciderAvenant: vi.fn(), evaluerArtisan: vi.fn(), fixerRendezVous: vi.fn(),
  ouvrirConsultation: vi.fn(), refuserDevis: vi.fn(), retenirDevis: vi.fn(), reviserImputation: vi.fn(), solliciterArtisan: vi.fn(),
}));

import { ConsultationOuverte } from "@/app/agence/[orgId]/incidents/volet-artisan";

const AUJOURDHUI = "2026-10-14";

const consultation = {
  id: "c1", metier: "plomberie", nature_travaux: "entretien_courant", decennale_requise: false,
  devis_unique_assume: false, validite_jours: 30, statut: "ouverte", created_at: "2026-09-20T08:00:00.000Z",
};

function sollicitation(id: string, artisan: string, statut: string) {
  return { id, consultation_id: "c1", artisan_id: artisan, statut, envoyee_le: "2026-09-21T08:00:00.000Z", repondue_le: null, refus_motif: null };
}

function devis(id: string, sollicitationId: string, artisan: string, statut: string, valideJusquAu: string, montantCents = 34000) {
  return {
    id, sollicitation_id: sollicitationId, artisan_id: artisan, montant_ttc_cents: montantCents, description: "Remplacement du flexible",
    lignes: [], valide_jusqu_au: valideJusquAu, document_id: null, statut, depose_le: "2026-09-22T08:00:00.000Z",
  };
}

const NOMS: Record<string, string> = { a1: "Plomberie Martin", a2: "Dubois Sanitaire", a3: "Atelier Leroy" };

function rendre(props: { sollicitations: ReturnType<typeof sollicitation>[]; devis: ReturnType<typeof devis>[]; affectables?: unknown[] }) {
  return renderToStaticMarkup(createElement(ConsultationOuverte, {
    orgId: "o1", consultation, sollicitations: props.sollicitations, devis: props.devis,
    affectables: (props.affectables ?? []) as never, noteDe: new Map(), nom: (id: string) => NOMS[id] ?? "Artisan",
    aujourdhui: AUJOURDHUI, commune: "Paris",
  }));
}

const affectable = (id: string) => ({
  artisan_id: id, raison_sociale: NOMS[id], telephone: "0611111111", email: null, rattache: true,
  note_publiee: null, nb_evaluations: 0, publiable: false, decennale_valide: true,
});

describe("volet artisan — devis expirés (AUT-01, D42 B)", () => {
  it("après le passage de la tâche : les deux devis expirés restent visibles, en lecture seule", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "expiree"), sollicitation("s2", "a2", "expiree")],
      devis: [devis("d1", "s1", "a1", "expire", "2026-10-05", 34000), devis("d2", "s2", "a2", "expire", "2026-10-12", 41000)],
    });
    expect(html).toContain("2 devis expirés");
    expect(html).toContain("Plomberie Martin");
    expect(html).toContain("Dubois Sanitaire");
    // Valables jusqu'au 05/10 et 12/10, dites en clair, avec le montant et le détail à télécharger.
    expect(html).toContain("Expiré le 05/10/2026 — caduc.");
    expect(html).toContain("Expiré le 12/10/2026 — caduc.");
    expect(html).toContain("340,00");
    expect(html).toContain("410,00");
    expect(html).toContain("/api/devis/s1/pdf");
    expect(html).toContain("/api/devis/s2/pdf");
    // Ils ne se comparent plus et ne se retiennent plus.
    expect(html).not.toContain("Retenir ce devis");
    expect(html).not.toMatch(/devis reçus?</);
    expect(html).not.toContain("Un seul devis");
  });

  it("la place est libre : plus de « deux artisans en lice », les autres artisans sont proposés", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "expiree"), sollicitation("s2", "a2", "expiree")],
      devis: [devis("d1", "s1", "a1", "expire", "2026-10-05"), devis("d2", "s2", "a2", "expire", "2026-10-12")],
      affectables: [affectable("a1"), affectable("a2"), affectable("a3")],
    });
    expect(html).toContain("0 sollicité");
    expect(html).not.toContain("Deux artisans sont déjà en lice");
    expect(html).toContain("Artisans proposables");
    // Seul l'artisan jamais sollicité sur cette mise en concurrence reste proposable.
    expect(html).toContain("Atelier Leroy");
    expect(html).toContain("Demander un devis");
  });

  it("si tous les artisans ont déjà été sollicités et que rien n'est en cours, l'écran ne dit plus d'attendre", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "expiree"), sollicitation("s2", "a2", "expiree")],
      devis: [devis("d1", "s1", "a1", "expire", "2026-10-05"), devis("d2", "s2", "a2", "expire", "2026-10-12")],
      affectables: [affectable("a1"), affectable("a2")],
    });
    expect(html).toContain("ont déjà été sollicités et aucune demande n&#x27;est en cours");
    expect(html).not.toContain("attendez leur devis");
  });

  it("un devis expiré et un devis valable : le valable se compare et se retient, l'expiré se lit seulement", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "expiree"), sollicitation("s2", "a2", "devis_depose")],
      devis: [devis("d1", "s1", "a1", "expire", "2026-10-05"), devis("d2", "s2", "a2", "depose", "2026-11-10", 45000)],
      affectables: [affectable("a3")],
    });
    expect(html).toContain("1 devis reçu<");
    expect(html).toContain("1 devis expiré<");
    expect(html.match(/Retenir ce devis/g)).toHaveLength(1);
    expect(html).toContain("celui de Dubois Sanitaire");
    expect(html).not.toContain("celui de Plomberie Martin");
    // Il ne reste qu'une proposition valable : l'écran invite à en solliciter une seconde — et la place est libre.
    expect(html).toContain("Un seul devis");
    expect(html).toContain("Demander un devis");
  });

  it("avant le passage de la tâche : le devis encore « déposé » mais périmé reste comparé, avec son message et sans bouton", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "devis_depose"), sollicitation("s2", "a2", "devis_depose")],
      devis: [devis("d1", "s1", "a1", "depose", "2026-10-13"), devis("d2", "s2", "a2", "depose", "2026-11-10")],
    });
    expect(html).toContain("2 devis reçus");
    expect(html).toContain("Expiré le 13/10/2026 — caduc.");
    expect(html.match(/Retenir ce devis/g)).toHaveLength(1);
    expect(html).not.toContain("devis expiré");
    // Le plafond de deux compte encore les deux demandes, comme la base : l'écran ne propose pas ce qu'elle refuserait.
    expect(html).toContain("Deux artisans sont déjà en lice");
  });

  it("le jour même de la validité, le devis vaut encore", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "devis_depose")],
      devis: [devis("d1", "s1", "a1", "depose", AUJOURDHUI)],
    });
    expect(html).not.toContain("caduc");
    expect(html.match(/Retenir ce devis/g)).toHaveLength(1);
  });

  it("sans devis expiré, aucune rubrique « expiré » n'apparaît", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "devis_depose")],
      devis: [devis("d1", "s1", "a1", "depose", "2026-11-10")],
    });
    expect(html).not.toContain("devis expiré");
    expect(html).not.toContain("caduc");
  });
});
