/**
 * Décision D23 (option A) : les écrans du règlement déclaratif, RENDUS (pas lus comme du texte source).
 *
 *  - La fiche de l'incident (FacturesIncident) avec ses vrais formulaires : règlements actifs, retirés, facture soldée,
 *    imputation au locataire. Le client Supabase est le faux client qui honore select, eq et in (faux-postgrest.ts).
 *  - La facturation de l'artisan : l'étiquette et la phrase d'état que son client déclare, date et moyen de chaque règlement.
 *  - Accessibilité (constat de relecture du 15/10/2026) : sur un règlement total ou un retrait, l'action revalide la page.
 *    Les composants restent donc montés (formulaire soldé, règlement retiré) et gardent leur région de statut hors du
 *    formulaire : le message de succès est affiché et annoncé au lieu de disparaître avec le formulaire.
 *
 * L'état de l'action est simulé (useActionStateProtegee) : on rend ce que l'écran montre après une réponse donnée.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type Ligne } from "./faux-postgrest";

const sim = vi.hoisted(() => ({
  supabase: null as unknown,
  etat: {} as Record<string, unknown>,
  agenda: [] as Record<string, unknown>[],
  reglementsArtisan: { lignes: [] as Record<string, unknown>[], erreur: false },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sim.supabase }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [sim.etat, () => {}] }));
vi.mock("@/app/actions/reglement-facture", () => ({ declarerReglementFacture: () => ({}), retirerReglementFacture: () => ({}) }));
vi.mock("../src/app/agence/[orgId]/incidents/validation-facture", () => ({ ValidationFacture: () => null }));
vi.mock("../src/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: sim.agenda, erreur: false }),
  chargerReglementsFactures: async () => sim.reglementsArtisan,
}));
vi.mock("../src/app/artisan/clients/resumes", () => ({ ReglementsDansFacturation: () => null }));

import { FormulaireReglement, RetraitReglement } from "../src/app/agence/[orgId]/incidents/reglement-facture";
import { FacturesIncident } from "../src/app/agence/[orgId]/incidents/factures-incident";
import PageFacturation from "../src/app/artisan/facturation/page";
import { MESSAGE_IMPUTATION_LOCATAIRE } from "@/lib/reglement-facture";

const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** Le contenu de chaque région role="status" (vides comprises). */
const statuts = (html: string) => [...html.matchAll(/<p[^>]*role="status"[^>]*>([^<]*)<\/p>/g)].map((m) => texte(m[1]));

const SUCCES_REGLEMENT = "Règlement de 239,68 € enregistré et écrit au journal comptable. Aucun paiement bancaire n’a été effectué par Gerimmo ; l’artisan est prévenu de votre déclaration.";
const SUCCES_RETRAIT = "Règlement retiré : la contre-écriture est passée au journal et l’état de la facture est recalculé. Le règlement reste visible, marqué « retiré ».";

beforeEach(() => { sim.etat = {}; });

describe("le formulaire de règlement garde son message quand la facture est soldée", () => {
  const rendre = (resteCents: number, imputationLocataire = false) =>
    renderToStaticMarkup(createElement(FormulaireReglement, { orgId: "org", factureId: "f1", resteCents, imputationLocataire }));

  it("facture ouverte : le formulaire, le montant prérempli au reste, une région de statut vide et prête", () => {
    const html = rendre(13968);
    expect(html).toContain('name="montant"');
    expect(html).toContain('value="139,68"');
    expect(statuts(html)).toEqual([""]);
    expect(texte(html)).not.toContain("réglée en totalité");
  });

  it("règlement total réussi : plus de formulaire, mais la phrase « réglée » ET le message de succès, focalisable", () => {
    sim.etat = { succes: SUCCES_REGLEMENT };
    const html = rendre(0);
    expect(html).not.toContain('name="montant"');
    expect(html).not.toContain("<form");
    expect(texte(html)).toContain("La facture est réglée en totalité");
    expect(statuts(html)).toEqual([SUCCES_REGLEMENT]);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*tabindex="-1"/i);
  });

  it("imputation au locataire : la note est posée au-dessus du formulaire", () => {
    expect(texte(rendre(13968, true))).toContain(MESSAGE_IMPUTATION_LOCATAIRE);
    expect(texte(rendre(13968, false))).not.toContain(MESSAGE_IMPUTATION_LOCATAIRE);
  });

  it("une erreur reste dans le formulaire, avec la saisie reprise", () => {
    sim.etat = { erreur: "Le montant dépasse le reste à régler (139,68 €)", valeurs: { montant: "200,00", moyen: "cheque", reference: "CHQ 1" } };
    const html = rendre(13968);
    expect(html).toContain('role="alert"');
    expect(html).toContain('value="200,00"');
    expect(html).toContain('value="CHQ 1"');
    expect(statuts(html)).toEqual([""]);
  });
});

describe("le retrait d'un règlement garde son message une fois le règlement retiré", () => {
  const rendre = (retrait: string | null) => renderToStaticMarkup(createElement(RetraitReglement, { orgId: "org", reglementId: "r1", retrait }));

  it("règlement actif : « Retirer ce règlement », motif obligatoire, région de statut vide", () => {
    const html = rendre(null);
    expect(texte(html)).toContain("Retirer ce règlement");
    expect(html).toMatch(/<textarea[^>]*name="motif"[^>]*required/);
    expect(statuts(html)).toEqual([""]);
  });

  it("retrait réussi : la phrase « Retiré le … » remplace le formulaire, et le message de succès reste affiché", () => {
    sim.etat = { succes: SUCCES_RETRAIT };
    const html = rendre("Retiré le 15/10/2026 : « Virement rejeté » (contre-écriture passée au journal).");
    expect(html).not.toContain("<textarea");
    expect(texte(html)).toContain("Retiré le 15/10/2026 : « Virement rejeté »");
    expect(statuts(html)).toEqual([SUCCES_RETRAIT]);
  });
});

describe("la fiche de l'incident : factures, règlements actifs et retirés, facture soldée", () => {
  const ORG = "org-a";
  const INCIDENT = "inc-1";
  const facture = (id: string, numero: string, surcharge: Partial<Ligne> = {}): Ligne => ({
    id, organization_id: ORG, intervention_id: "m1", numero, montant_ttc_cents: 23968, montant_reference_cents: 23968,
    ecart_justification: null, document_id: "d1", validee_le: "2026-10-09T10:00:00Z", decision_motif: "Pièce et prix vérifiés.",
    imputation_validee: null, reglee_le: null, ...surcharge,
  });
  const reglement = (id: string, factureId: string, montant: number, surcharge: Partial<Ligne> = {}): Ligne => ({
    id, organization_id: ORG, facture_id: factureId, montant_cents: montant, date_reglement: "2026-10-10", moyen: "virement",
    reference: null, created_at: "2026-10-10T08:00:00Z", retire_le: null, retrait_motif: null, ...surcharge,
  });
  async function afficher(factures: Ligne[], reglements: Ligne[], imputation: string | null = null) {
    sim.supabase = fauxClient({
      incident_interventions: table("incident_interventions", [{ id: "m1", organization_id: ORG, incident_id: INCIDENT, debut_prevu: null, terminee_le: null }]),
      intervention_factures: table("intervention_factures", factures),
      intervention_facture_reglements: table("intervention_facture_reglements", reglements),
    });
    return renderToStaticMarkup((await FacturesIncident({ orgId: ORG, incidentId: INCIDENT, imputation })) as never);
  }
  /** Le HTML de la section d'une facture (les sections se suivent, une par facture). */
  const section = (html: string, numero: string) => html.split("<section").find((s) => s.includes(`Facture ${numero}`)) ?? "";

  it("facture soldée : « Réglée », plus de champ de montant, mais le formulaire reste monté avec sa région de statut", async () => {
    const html = await afficher(
      [facture("f1", "F-SOLDEE", { reglee_le: "2026-10-10" })],
      [reglement("r1", "f1", 23968, { reference: "VIR 1234" })],
    );
    const t = texte(html);
    expect(t).toContain("Réglée le 10/10/2026");
    expect(t).toContain("La facture est réglée en totalité");
    expect(html).not.toContain('name="montant"');
    expect(t).toContain("10/10/2026 · Virement · 239,68");
    expect(t).toContain("réf. VIR 1234");
    expect(t).toContain("Retirer ce règlement");
    // Une région de statut pour le formulaire soldé, une pour le règlement actif.
    expect(statuts(html)).toEqual(["", ""]);
  });

  it("règlement retiré puis partiel : le retiré est barré et motivé, le reste se règle, l'imputation au locataire est rappelée", async () => {
    const html = await afficher(
      [facture("f1", "F-PARTIELLE")],
      [
        reglement("r1", "f1", 23968, { retire_le: "2026-10-12T09:00:00Z", retrait_motif: "Virement rejeté par la banque" }),
        reglement("r2", "f1", 10000, { date_reglement: "2026-10-13", moyen: "cheque", created_at: "2026-10-13T08:00:00Z" }),
      ],
      "locataire",
    );
    const t = texte(html);
    expect(t).toContain("Partiellement réglée");
    expect(t).toContain("Retiré le 12/10/2026 : « Virement rejeté par la banque » (contre-écriture passée au journal).");
    expect(html).toMatch(/class="line-through"[^>]*>10\/10\/2026 · Virement · 239,68/);
    // Le reste (239,68 − 100,00) prérempli ; une seule offre de retrait (le règlement actif).
    expect(html).toContain('value="139,68"');
    expect(t.match(/Retirer ce règlement/g)).toHaveLength(1);
    expect(t).toContain(MESSAGE_IMPUTATION_LOCATAIRE);
    // Formulaire + règlement retiré + règlement actif : trois régions de statut, toujours présentes.
    expect(statuts(html)).toHaveLength(3);
  });

  it("deux factures de la même mission : chacune son état, son reste et ses règlements", async () => {
    const html = await afficher(
      [facture("f1", "F-A", { reglee_le: "2026-10-10" }), facture("f2", "F-B", { montant_ttc_cents: 5000 })],
      [reglement("r1", "f1", 23968)],
    );
    expect(texte(section(html, "F-A"))).toContain("La facture est réglée en totalité");
    expect(section(html, "F-B")).toContain('value="50,00"');
    expect(texte(section(html, "F-B"))).not.toContain("Retirer ce règlement");
  });
});

describe("la facturation de l'artisan : le règlement que son client déclare", () => {
  const mission = (id: string, numero: string): Record<string, unknown> => ({
    intervention_id: id, organization_id: "org", agence_nom: "Agence du Port", incident_numero: numero, statut: "terminee",
    debut_prevu: null, fin_prevue: null, categorie: "plomberie", description: null, urgence: "normale", piece: null,
    nature_travaux: "reparation", adresse: null, code_postal: null, ville: "Nantes", lot_nom: null, etage: null,
    occupant_nom: null, occupant_prenom: null, occupant_telephone: null, montant_ttc_cents: 23968, montant_plafond_cents: null,
    compte_rendu_depose: true, photo_apres_deposee: true, facture_deposee: true,
  });
  const etatArtisan = (intervention: string, numero: string, etat: string, reglements: { date_reglement: string; moyen: string }[], reglee_le: string | null = null) => ({
    facture_id: `f-${intervention}`, intervention_id: intervention, organization_id: "org", numero, montant_ttc_cents: 23968,
    validee_le: "2026-10-09T10:00:00Z", etat, reglee_le, reglements,
  });
  const afficher = async () => texte(renderToStaticMarkup((await PageFacturation({ searchParams: Promise.resolve({}) } as never)) as never));

  beforeEach(() => {
    sim.agenda = [mission("m1", "INC-1"), mission("m2", "INC-2"), mission("m3", "INC-3")];
    sim.reglementsArtisan = {
      erreur: false,
      lignes: [
        etatArtisan("m1", "F-1", "reglee", [{ date_reglement: "2026-10-12", moyen: "virement" }], "2026-10-12"),
        etatArtisan("m2", "F-2", "partiellement_reglee", [{ date_reglement: "2026-10-01", moyen: "cheque" }]),
        etatArtisan("m3", "F-3", "validee", []),
      ],
    };
  });

  it("chaque facture porte l'état déclaré par le client, la date et le moyen de chaque règlement, jamais de montant de règlement", async () => {
    const t = await afficher();
    expect(t).toContain("Réglée (déclaré par votre client)");
    expect(t).toContain("Réglée le 12/10/2026 par virement (déclaré par votre client)");
    expect(t).toContain("Règlement déclaré le 12/10/2026 par virement");
    expect(t).toContain("Partiellement réglée : 1 règlement déclaré par votre client");
    expect(t).toContain("Règlement déclaré le 01/10/2026 par chèque");
    expect(t).toContain("Validée, règlement à venir");
    expect(t).toContain("facture n° F-1");
    expect(t).toContain("pas un virement de Gerimmo");
  });

  it("une lecture en échec se dit : elle ne passe pas pour « aucun règlement »", async () => {
    sim.reglementsArtisan = { erreur: true, lignes: [] };
    const t = await afficher();
    expect(t).toContain("L’état de règlement de vos factures n’a pas pu être lu");
    expect(t).not.toContain("Réglée (déclaré par votre client)");
  });
});
