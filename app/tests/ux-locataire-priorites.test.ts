import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { identiteContactLocataire } from "@/lib/identite-contact-locataire";

const banc = vi.hoisted(() => ({ actif: true, donnees: {} as Record<string, unknown>, erreurs: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/locataire/org/documents", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/components/suivi-echeanciers-charges", () => ({ SuiviEcheanciersCharges: () => null }));
vi.mock("@/components/assistant-prive", () => ({ AssistantPrive: () => createElement("div", null, "Assistant facultatif") }));
vi.mock("@/app/locataire/[orgId]/formulaire-attestation", () => ({ FormulaireAttestation: () => createElement("div", null, "Formulaire assurance conservé") }));
vi.mock("@/app/locataire/[orgId]/documents/depot-piece", () => ({ DepotPiece: () => createElement("div", null, "Dépôt demandé conservé") }));
vi.mock("@/app/locataire/[orgId]/documents/depot-signature", () => ({ DepotSignature: () => null }));
vi.mock("@/lib/quittance-conforme", () => ({ disponibilitesQuittances: async () => ({}) }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspaceLocataire: async () => ({
  personne: { id: "loc", prenom: "Sam" }, user: { id: "compte" }, adhesionActive: banc.actif,
  supabase: {
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
    rpc: (nom: string) => { const resultat = { data: banc.donnees[nom] ?? [], error: banc.erreurs[nom] ?? null };
      const q = { order: () => q, range: () => Promise.resolve(resultat), then: (resolve: (r: typeof resultat) => unknown) => Promise.resolve(resultat).then(resolve) }; return q; },
  },
}) }));

import Accueil from "@/app/locataire/[orgId]/page";
import Documents from "@/app/locataire/[orgId]/documents/page";
import Contact from "@/app/locataire/[orgId]/contact/page";
const params = { params: Promise.resolve({ orgId: "org" }) } as never;
const bail = { bail_id: "bail", etat: "actif", type: "nu", date_debut: "2026-01-01", loyer_hc: 650, charges: 50, document_signe: null };
beforeEach(() => { banc.actif = true; banc.donnees = {}; banc.erreurs = {}; });

describe("identité : jamais le nom interne du patrimoine", () => {
  it("utilise les noms des bailleurs particuliers autorisés", () => {
    expect(identiteContactLocataire({ type: "proprietaire_direct", nom: "Parc privé", bailleurs: [{ prenom: "Élise", nom: "Morel" }] })).toEqual({ nom: "Élise Morel", titre: "Mon bailleur", agence: false });
  });
  it("conserve la dénomination SCI et les éventuels cobailleurs", () => {
    expect(identiteContactLocataire({ type: "proprietaire_direct", nom: "Parc privé", bailleurs: [{ nom: "SCI des Amandiers", prenom: null }, { nom: "Martin", prenom: "Alix" }] }).nom).toBe("SCI des Amandiers, Alix Martin");
  });
  it("n’invente aucun bailleur à partir du nom du parc si la preuve manque", () => {
    for (const donnees of [null, [], { type: "proprietaire_direct", nom: "Parc privé", bailleurs: [] }, { type: "inconnu", nom: "Parc privé" }]) expect(identiteContactLocataire(donnees).nom).toBeNull();
  });
  it("réserve gestionnaire à l’agence identifiée", () => {
    expect(identiteContactLocataire({ type: "agence", nom: "Agence des Lilas" })).toEqual({ nom: "Agence des Lilas", titre: "Mon gestionnaire", agence: true });
  });
});

describe("prochaine étape du locataire", () => {
  it("sans bail : dit qui doit rattacher le dossier, sans Tout est en ordre", async () => {
    const html = renderToStaticMarkup(await Accueil(params));
    expect(html).toContain("Votre bail n’est pas encore actif");
    expect(html).toContain("Aucun bail n’est encore rattaché");
    expect(html).toContain("Responsable de la prochaine étape : votre bailleur");
    expect(html).not.toContain("Tout est en ordre");
  });
  it("brouillon sans contrat : ne prétend pas que la signature suffit à activer", async () => {
    banc.donnees.mon_bail_locataire = [{ ...bail, etat: "brouillon" }];
    const html = renderToStaticMarkup(await Accueil(params));
    expect(html).toContain("Le contrat signé n’est pas encore disponible");
    expect(html).toContain("puis activer le bail");
  });
  it("contrat déposé mais brouillon : demande la vérification et l’activation", async () => {
    banc.donnees.mon_bail_locataire = [{ ...bail, etat: "brouillon", document_signe: "document" }];
    expect(renderToStaticMarkup(await Accueil(params))).toContain("Un contrat signé est enregistré. Votre bailleur doit encore vérifier le dossier et activer le bail.");
  });
  it("un bail actif ne reçoit pas l’avertissement de préparation", async () => {
    banc.donnees.mon_bail_locataire = [bail];
    expect(renderToStaticMarkup(await Accueil(params))).not.toContain("Votre bail n’est pas encore actif");
  });
  it("ne transforme ni une erreur de lecture ni une sortie en préparation", async () => {
    banc.erreurs.mon_bail_locataire = { message: "indisponible" };
    expect(renderToStaticMarkup(await Accueil(params))).not.toContain("Aucun bail n’est encore rattaché");
    banc.erreurs = {}; banc.donnees.mon_bail_locataire = [{ ...bail, etat: "termine" }];
    expect(renderToStaticMarkup(await Accueil(params))).not.toContain("Votre bail n’est pas encore actif");
    banc.actif = false;
    expect(renderToStaticMarkup(await Accueil(params))).not.toContain("Votre bail n’est pas encore actif");
  });
});

describe("documents et contact prioritaires", () => {
  it("ouvre les fichiers même si l’assurance et une pièce restent attendues", async () => {
    banc.donnees.mes_pieces_demandees = [{ id: "demande" }];
    banc.donnees.mes_pieces_locataire = [{ document_id: "bail", type: "bail", titre: "Bail signé", mime_type: "application/pdf", depose_le: "2026-11-01" }];
    const html = renderToStaticMarkup(await Documents(params));
    expect(html).toMatch(/role="tab"[^>]*aria-controls="documents-disponibles"[^>]*aria-selected="true"/);
    expect(html).toMatch(/role="tab"[^>]*aria-controls="documents-a-transmettre"[^>]*aria-selected="false"/);
    expect(html).toContain('href="#documents-a-transmettre"');
    expect(html).toContain("Bail signé");
    expect(html).toContain("Dépôt demandé conservé");
    expect(html).toContain("Formulaire assurance conservé");
  });
  it("le contact humain est avant l’assistant et ne nomme jamais le parc", async () => {
    banc.donnees.attestation_emetteur_locataire = { type: "proprietaire_direct", nom: "Parc privé", bailleurs: [{ nom: "SCI des Amandiers" }] };
    banc.donnees.mon_gestionnaire_locataire = [{ agence: "Parc privé", telephone: null, email_contact: null, agent_email: null }];
    const html = renderToStaticMarkup(await Contact(params));
    expect(html).toContain("Écrire à SCI des Amandiers");
    expect(html).not.toContain("Parc privé");
    expect(html.indexOf("Votre message")).toBeLessThan(html.indexOf("Assistant facultatif"));
  });
});
