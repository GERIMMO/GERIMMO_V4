/**
 * Décision D27 : les liens des COURRIERS envoyés au gestionnaire d'un propriétaire direct mènent à /espace/<id>, ceux
 * d'une agence à /agence/<id> — jamais l'inverse (une agence envoyée sur /espace/<agence> tombe sur « introuvable »).
 *
 * Couvre les deux courriers ajoutés par main après la base du lot (#187 D18 « devis reçu », #188 D22-B « annulation du
 * rendez-vous par le locataire »), exécutés de bout en bout avec un client en mémoire ; seul l'envoi est simulé.
 * La racine est lue d'après le TYPE de l'organisation (baseDeLOrganisation), jamais d'après le formulaire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const sim = vi.hoisted(() => ({ envoyer: vi.fn() }));

vi.mock("@/lib/email", () => ({ envoyerEmail: sim.envoyer }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));

import { notifierAnnulationRdvLocataire, notifierDevisRecu } from "@/lib/notifications";

const SITE = "https://gerimmo.test";
const ORG = "org-1";

/** Un client Supabase en mémoire : `from(table)` filtre par égalité ; `rpc(nom)` lit `rpcs[nom]`. */
function client(tables: Record<string, Ligne[]>, rpcs: Record<string, unknown> = {}) {
  return {
    rpc: async (nom: string) => ({ data: rpcs[nom] ?? null, error: null }),
    from(table: string) {
      const filtres: ((l: Ligne) => boolean)[] = [];
      const lignes = () => (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtres.push((l) => l[c] === v); return q; },
        in: (c: string, v: unknown[]) => { filtres.push((l) => v.includes(l[c])); return q; },
        insert: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
        then: (suite: (r: { data: Ligne[]; error: null }) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(suite),
      };
      return q;
    },
  };
}

function base(typeOrganisation: string): Record<string, Ligne[]> {
  return {
    organizations: [{ id: ORG, type: typeOrganisation, name: "Organisation TEST" }],
    intervention_demandes_rdv: [{
      id: "d1", organization_id: ORG, intervention_id: "iv-1", type: "annulation", statut: "acceptee",
      motif_code: "travail", motif_texte: "Réunion imprévue", rdv_debut: "2026-10-22T07:00:00Z", rdv_fin: "2026-10-22T09:00:00Z",
      expire_le: null, tardive: false, reponse_motif: null, creneau_accepte_id: null,
    }],
    incident_interventions: [{ id: "iv-1", organization_id: ORG, incident_id: "inc-1", artisan_id: "art-1", debut_prevu: null, fin_prevue: null, refus_motif: null }],
    incidents: [{ id: "inc-1", organization_id: ORG, numero: "INC-1", categorie: "plomberie_canalisation", piece: null, description: null, bail_id: null, declarant_person_id: null, responsable_account_id: null, lot_id: "lot-1" }],
    artisans: [{ id: "art-1", email: "artisan@example.invalid", raison_sociale: "TEST" }],
    incident_devis: [{ id: "dv-1", organization_id: ORG, incident_id: "inc-1", artisan_id: "art-1", montant_ttc_cents: 12000, sollicitation_id: "so-1", version: 2, note_revision: "Pièce changée" }],
    incident_sollicitations: [{ id: "so-1", organization_id: ORG, created_by: null }],
  };
}
const service = (type: string) => client(base(type), { org_membres_gerants: [{ account_id: "g-1", email: "gerant@example.invalid", role: type === "agence" ? "admin_agence" : "proprietaire_direct" }] });
const envoisAuGestionnaire = () =>
  sim.envoyer.mock.calls.map(([p]) => p as { to: string; html: string }).filter((p) => p.to === "gerant@example.invalid");

beforeEach(() => {
  sim.envoyer.mockReset();
  sim.envoyer.mockResolvedValue({ id: "courriel-1" });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
});

describe("D22-B : l'annulation du rendez-vous par le locataire, copie au gestionnaire", () => {
  it("propriétaire direct : le lien mène à /espace/<id>, jamais à /agence", async () => {
    const r = await notifierAnnulationRdvLocataire(service("proprietaire_direct") as never, ORG, "d1");
    expect(r.agence).toEqual({ envoyee: true });
    const [courrier] = envoisAuGestionnaire();
    expect(courrier.html).toContain(`${SITE}/espace/${ORG}/incidents?sel=inc-1`);
    expect(courrier.html).not.toContain(`/agence/${ORG}`);
  });

  it("agence : le lien reste sous /agence/<id>, jamais /espace (qui y répondrait « introuvable »)", async () => {
    const r = await notifierAnnulationRdvLocataire(service("agence") as never, ORG, "d1");
    expect(r.agence).toEqual({ envoyee: true });
    const [courrier] = envoisAuGestionnaire();
    expect(courrier.html).toContain(`${SITE}/agence/${ORG}/incidents?sel=inc-1`);
    expect(courrier.html).not.toContain("/espace/");
  });
});

describe("D18 : le courrier « devis reçu » (version révisée comprise)", () => {
  it("propriétaire direct : /espace/<id>", async () => {
    expect(await notifierDevisRecu(service("proprietaire_direct") as never, ORG, "dv-1")).toEqual({ envoyee: true });
    const [courrier] = envoisAuGestionnaire();
    expect(courrier.html).toContain(`${SITE}/espace/${ORG}/incidents?sel=inc-1`);
    expect(courrier.html).not.toContain(`/agence/${ORG}`);
  });

  it("agence : /agence/<id>, jamais /espace", async () => {
    expect(await notifierDevisRecu(service("agence") as never, ORG, "dv-1")).toEqual({ envoyee: true });
    const [courrier] = envoisAuGestionnaire();
    expect(courrier.html).toContain(`${SITE}/agence/${ORG}/incidents?sel=inc-1`);
    expect(courrier.html).not.toContain("/espace/");
  });
});
