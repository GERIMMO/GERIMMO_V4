/**
 * Audit du 13/10/2026, ART-21, décision D20 (option B) : le dossier d'incident (PaneIncident) écrit l'écart avec le
 * rendez-vous confirmé dans la chronologie, pour le démarrage, le compte rendu et la facture de l'artisan ; et la
 * section « Clôturer l'incident » est la cible des liens `#cloture` (dont celui de la voie de sortie du réseau, D17).
 *
 * Le dossier est RENDU avec des événements, et non lu comme du texte source : retirer la mention d'un seul de ces
 * événements, ou renommer l'ancre, fait tomber un test. Chaque événement porte un écart différent (2 h, 2 jours,
 * 4 jours) pour qu'une mention ne puisse pas être prise pour celle d'un autre.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type BancFaux, type Ligne } from "./faux-postgrest";

const etat = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({
    supabase: etat.supabase,
    user: { id: "gerant-1" },
    role: "admin_agence",
    estProprietaire: false,
  }),
}));
// Ces blocs ont leurs propres lectures et leurs propres tests ; ils ne sont pas l'objet ici.
vi.mock("../src/app/agence/[orgId]/incidents/factures-incident", () => ({ FacturesIncident: () => null }));
vi.mock("../src/app/agence/[orgId]/incidents/volet-artisan", () => ({ VoletArtisan: () => null }));
vi.mock("@/components/bilan-contact-incident", () => ({ BilanContactIncident: () => null }));
vi.mock("../src/app/agence/[orgId]/incidents/[incidentId]/actions-incident", () => ({
  FormulaireAttribution: () => null,
  FormulaireCloture: () => null,
  FormulairePhotoIncident: () => null,
  FormulaireQualification: () => null,
  FormulaireReouverture: () => null,
}));
vi.mock("@/app/actions/reseau", () => ({
  confirmerCommuneBien: vi.fn(),
  confirmerCommunesEvidentes: vi.fn(),
  signalerInteretReseau: vi.fn(),
}));

import { VoieDeSortieReseau } from "@/components/disponibilite-reseau";
import { PaneIncident } from "../src/app/agence/[orgId]/incidents/pane-incident";

const ORG = "org-a";
const INCIDENT = "inc-1";
const RENDEZ_VOUS = "2026-10-19T07:00:00.000Z"; // 09:00 à Paris

const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const evenement = (n: number, type: string, details: Ligne): Ligne => ({
  id: `e${n}`,
  organization_id: ORG,
  incident_id: INCIDENT,
  type,
  acteur_account_id: null,
  details,
  created_at: `2026-10-14T0${n}:00:00Z`,
});

const ecart = (minutes: number): Ligne => ({ avant_rendez_vous: true, debut_prevu: RENDEZ_VOUS, ecart_minutes: minutes });

function banc(etatIncident: string, evenements: Ligne[]): BancFaux {
  return {
    incidents: table("incidents", [
      {
        id: INCIDENT,
        organization_id: ORG,
        lot_id: "lot-1",
        numero: "INC-0001",
        categorie: "plomberie_canalisation",
        urgence: "normale",
        etat: etatIncident,
        created_at: "2026-10-01T08:00:00Z",
        responsable_account_id: null,
        declarant_person_id: null,
        canal: "espace_locataire",
        piece: null,
        description: "Fuite sous l'évier",
        anciennete: null,
        imputation: etatIncident === "declare" ? null : "proprietaire",
        imputation_justification: "Usure normale",
        imputation_contestation: null,
        imputation_contestee_le: null,
        cloture_motif: null,
        cloture_commentaire: null,
        clos_le: null,
        lot: { id: "lot-1", nom: "Lot 1", bien_id: "bien-1" },
        declarant: null,
      },
    ]),
    incident_evenements: table("incident_evenements", evenements),
    document_liens: table("document_liens", []),
  };
}

async function afficher(etatIncident = "termine", evenements: Ligne[] = []): Promise<string> {
  etat.supabase = fauxClient(banc(etatIncident, evenements));
  const dossier = await PaneIncident({
    orgId: ORG,
    incidentId: INCIDENT,
    monCompte: "gerant-1",
    estResponsable: true,
    membres: [],
  });
  return renderToStaticMarkup(dossier as never);
}

describe("la chronologie du dossier écrit l'écart avec le rendez-vous (D20)", () => {
  const evenements = [
    evenement(1, "intervention_demarree", ecart(150)),
    evenement(2, "compte_rendu", { cause_reelle: "Joint usé", ...ecart(3000) }),
    evenement(3, "facture_deposee", { montant_ttc_cents: 48000, numero: "F-2026-1", ...ecart(7199) }),
  ];

  it("démarrage : « 2 h avant le rendez-vous prévu le … »", async () => {
    const t = texte(await afficher("termine", evenements));
    expect(t).toContain("Intervention démarrée 2 h avant le rendez-vous prévu le 19/10/2026 09:00");
  });

  it("compte rendu : la cause constatée, puis l'écart (2 jours)", async () => {
    const t = texte(await afficher("termine", evenements));
    expect(t).toContain(
      "Compte rendu de l'artisan cause constatée : « Joint usé » · 2 jours avant le rendez-vous prévu le 19/10/2026 09:00"
    );
  });

  it("facture : le numéro et le montant, puis l'écart (4 jours)", async () => {
    const t = texte(await afficher("termine", evenements));
    expect(t).toContain(
      "Facture de l'artisan déposée n° F-2026-1 · 480,00 € · 4 jours avant le rendez-vous prévu le 19/10/2026 09:00"
    );
  });

  it("sans écart, rien n'est ajouté : le montant de la facture et la cause du compte rendu restent seuls", async () => {
    const t = texte(
      await afficher("termine", [
        evenement(1, "intervention_demarree", { intervention_id: "m1" }),
        evenement(2, "compte_rendu", { cause_reelle: "Joint usé" }),
        evenement(3, "facture_deposee", { montant_ttc_cents: 12000, numero: "F-0" }),
      ])
    );
    expect(t).not.toContain("avant le rendez-vous");
    expect(t).toContain("cause constatée : « Joint usé »");
    expect(t).toContain("n° F-0 · 120,00 €");
  });

  it("un geste fait à l'heure (avant_rendez_vous faux) n'écrit aucune mention", async () => {
    const t = texte(
      await afficher("termine", [
        evenement(1, "intervention_demarree", { avant_rendez_vous: false, debut_prevu: RENDEZ_VOUS }),
      ])
    );
    expect(t).not.toContain("avant le rendez-vous");
  });
});

describe("la section « Clôturer l'incident » est la cible des liens #cloture (D17, D20)", () => {
  const cibles = (html: string) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const identifiants = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  it.each(["declare", "qualifie", "affecte", "en_cours", "termine", "clos"])(
    "dossier %s : la section de clôture existe, repliable, avec son titre",
    async (etatIncident) => {
      const html = await afficher(etatIncident);
      expect(html).toMatch(/<details id="cloture"/);
      expect(texte(html)).toMatch(etatIncident === "clos" ? /Incident clos · consulter/ : /Clôturer l’incident/);
    }
  );

  it("le lien « Passer à la clôture » de la carte de prise en charge mène à cette section", async () => {
    const html = await afficher("qualifie");
    expect(cibles(html)).toContain("cloture");
    expect(identifiants(html)).toContain("cloture");
  });

  it.each(["declare", "qualifie", "termine", "clos"])(
    "dossier %s : chaque lien d'ancre de la fiche a sa cible dans la fiche",
    async (etatIncident) => {
      const html = await afficher(etatIncident);
      const ids = identifiants(html);
      const liens = cibles(html);
      expect(liens.length).toBeGreaterThan(0);
      expect(liens.filter((c) => !ids.has(c))).toEqual([]);
    }
  );

  it("la voie de sortie du réseau (propriétaire sans artisan) renvoie à une ancre qui existe dans la fiche", async () => {
    const voie = renderToStaticMarkup(createElement(VoieDeSortieReseau, { orgId: "org-1", interetEnregistre: false }));
    const liens = cibles(voie);
    expect(liens).toContain("cloture");
    const ids = identifiants(await afficher("qualifie"));
    expect(liens.filter((c) => !ids.has(c))).toEqual([]);
  });
});

beforeEach(() => {
  etat.supabase = null;
});
