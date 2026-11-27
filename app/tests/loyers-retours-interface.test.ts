import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatLoyers } from "@/app/actions/loyers";

const etatSimule = vi.hoisted(() => ({ valeur: {} as EtatLoyers }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [etatSimule.valeur, () => {}, false] };
});
vi.mock("@/app/actions/loyers", () => ({
  ajouterEncaissement: vi.fn(),
  reviserLoyer: vi.fn(),
  ajouterRelance: vi.fn(),
  regulariserCharges: vi.fn(),
}));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
// Le bouton d'envoi commun est inerte tant que la page n'est pas hydratée (D30 B, audit du 13/10) : le simple rendu
// serveur le montrerait donc toujours désactivé. Ces tests parlent de l'état APRÈS hydratation, celui où ce sont le
// retour de l'action et l'envoi en cours qui décident du bouton : on le reproduit comme pour la date ci-dessous.
vi.mock("@/lib/use-hydrate", () => ({ useHydrate: () => true, AIDE_BOUTON_EN_ATTENTE: "La page finit de se charger." }));
// Reproduire le contrat du composant APRÈS hydratation : il renseigne le
// jour courant. Le simple rendu serveur laisserait le champ vide et ne
// détecterait pas son utilisation erronée pour la première présentation.
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return {
    InputDateJour: ({ valeurSoumise, ...props }: { valeurSoumise?: string; name: string }) =>
      createElement("input", { ...props, type: "date", defaultValue: valeurSoumise ?? "2026-09-13" }),
  };
});

import { FormulaireLoyers } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";

beforeEach(() => { etatSimule.valeur = {}; });

function rendre(options: Partial<ComponentProps<typeof FormulaireLoyers>> = {}) {
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test",
    bailId: "bail-test",
    echeancier: [{ appel_id: "appel-test", periode: "2026-08-01", date_echeance: "2026-08-05", montant_du: 500, montant_couvert: 500, statut: "paye" }],
    encaissements: [],
    quittances: [{ id: "quittance-test", appel_id: "appel-test", montant: 500, date_emission: "2026-08-05", email_envoye_at: null, est_quittance: true }],
    revisionIrl: false,
    irlReference: null,
    irlTrimestre: null,
    revisions: [],
    relances: [],
    regularisations: [],
    chargesForfait: false,
    ...options,
  }));
}

function champ(html: string, nom: string) {
  return html.match(/<input\b[^>]*>/g)?.find((input) => input.includes(`name="${nom}"`)) ?? "";
}

function formulaireEnvoi(html: string) {
  // Le même état simulé sert aux autres formulaires : regarder uniquement
  // le formulaire du bouton d'envoi évite un succès trouvé ailleurs.
  // Le bouton nomme le document (24/09) : « Envoyer la quittance » /
  // « Envoyée » pour une quittance, « Envoyer le reçu » / « Envoyé » pour un reçu.
  return html.match(/<form\b[\s\S]*?<\/form>/g)?.find((form) => />(?:Envoyer (?:la quittance|le reçu)|Envoyée?)<\/button>/.test(form)) ?? "";
}

describe("Loyers : les saisies et retours restent compréhensibles", () => {
  it("préremplit l'envoi du jour mais laisse la première présentation vide", () => {
    const html = rendre();
    expect(champ(html, "date_envoi")).toContain('value="2026-09-13"');
    expect(champ(html, "date_premiere_presentation")).not.toMatch(/value="[^"]+"/);
  });

  it("repose une première présentation confirmée après un refus", () => {
    etatSimule.valeur = { erreur: "Erreur de recette", valeurs: { date_premiere_presentation: "2026-09-12" } };
    expect(champ(rendre(), "date_premiere_presentation")).toContain('value="2026-09-12"');
  });

  it("demande explicitement le montant réel avant une régularisation", () => {
    expect(champ(rendre(), "charges_reelles")).toContain('required=""');
  });

  it("affiche l'envoi déjà parti et désactive son bouton même si sa mémorisation a échoué", () => {
    etatSimule.valeur = { succes: "Quittance envoyée, mais la mémorisation a échoué." };
    const envoi = formulaireEnvoi(rendre());
    expect(envoi).toContain("Quittance envoyée, mais la mémorisation a échoué.");
    expect(envoi).toMatch(/<button\b[^>]*disabled=""[^>]*>Envoyée<\/button>/);
    expect(envoi).toContain('role="status"');
  });

  it("garde une nouvelle tentative possible après un véritable refus d'envoi", () => {
    etatSimule.valeur = { erreur: "Envoi refusé" };
    const envoi = formulaireEnvoi(rendre());
    expect(envoi).toContain("Envoi refusé");
    expect(envoi).toContain(">Envoyer la quittance</button>");
    expect(envoi).not.toContain('disabled=""');
  });
});

describe("Le résumé propriétaire distingue le loyer reçu de l’avance", () => {
  const options: Partial<ComponentProps<typeof FormulaireLoyers>> = {
    proprietaire: true,
    echeancier: [{ appel_id: "appel-test", periode: "2026-08-01", date_echeance: "2026-08-05", montant_du: 840, montant_couvert: 840, statut: "paye" }],
    encaissements: [
      { id: "loyer", montant: 840, date_paiement: "2026-08-05", mode: "virement", note: null },
      { id: "avance", montant: 15, date_paiement: "2026-08-06", mode: "virement", note: null },
    ],
  };

  it("affiche 840 € reçus sur l’échéance et 15 € versés d’avance", () => {
    const texte = rendre(options).replace(/<[^>]+>|<!--.*?-->/g, " ").replace(/\s+/g, " ");
    expect(texte).toContain("Versé d’avance : 15,00 €");
    expect(texte).toContain("Attendu 840,00 € Reçu 840,00 € Reste dû 0,00 €");
  });

  it("n’annonce pas d’avance quand la liste des règlements est incomplète ou quand le décompte est finalisé", () => {
    expect(rendre({ ...options, encaissementsIndisponibles: true })).not.toContain("Versé d’avance");
    expect(rendre({ ...options, decompteSortie: "finalise" })).not.toContain("Versé d’avance");
  });
});
