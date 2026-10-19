/**
 * Décision D27 : les liens des COURRIERS envoyés au gestionnaire d'un propriétaire direct mènent à /espace/<id>, ceux
 * d'une agence à /agence/<id> — jamais l'inverse (une agence envoyée sur /espace/<agence> tombe sur « introuvable »).
 *
 * Couvre les deux courriers ajoutés par main après la base du lot (#187 D18 « devis reçu », #188 D22-B « annulation du
 * rendez-vous par le locataire »), exécutés de bout en bout avec un client en mémoire ; seul l'envoi est simulé.
 * La racine est lue d'après le TYPE de l'organisation (baseDeLOrganisation), jamais d'après le formulaire.
 *
 * Relecture du 15/10 (mutations survivantes) : une assertion par courrier restant — incident urgent déclaré par le
 * locataire, mission refusée par l'artisan, relances de paiement, avis de reconduction, avis de fin d'essai (envoyé
 * par le webhook Stripe, exécuté par sa route avec Stripe et le client de service simulés).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const sim = vi.hoisted(() => ({ envoyer: vi.fn(), service: null as unknown, stripe: null as unknown }));

vi.mock("@/lib/email", () => ({ envoyerEmail: sim.envoyer }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
// Le webhook : réglages prêts, client de service et Stripe simulés (la signature est le sujet d'un autre test).
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => sim.service }));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
  clientStripe: () => sim.stripe,
}));

import { notifierAnnulationRdvLocataire, notifierDevisRecu, notifierIncidentUrgentDeclare, notifierMissionRefusee } from "@/lib/notifications";
import { envoyerRelancesDues } from "@/lib/relances-paiement";
import { envoyerAvisReconduction } from "@/lib/avis-abonnement";
import { POST as webhookStripe } from "@/app/api/stripe/webhook/route";

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

const PROFILS_COURRIER = [
  { nom: "propriétaire direct", type: "proprietaire_direct", attendu: `${SITE}/espace/${ORG}`, interdit: `/agence/${ORG}` },
  { nom: "agence", type: "agence", attendu: `${SITE}/agence/${ORG}`, interdit: "/espace/" },
] as const;
const seulCourrier = () => {
  expect(sim.envoyer).toHaveBeenCalledOnce();
  return sim.envoyer.mock.calls[0][0] as { to: string; html: string };
};

describe("incident URGENT déclaré par le locataire : le courrier au gestionnaire", () => {
  for (const p of PROFILS_COURRIER) {
    it(`${p.nom} : ${p.attendu}/incidents?sel=…`, async () => {
      // Le client est celui du LOCATAIRE : le gestionnaire et le numéro viennent de ses deux fonctions dédiées.
      const db = client(base(p.type), {
        mon_gestionnaire_locataire: [{ agence: "Organisation TEST", email_contact: null, agent_email: "gerant@example.invalid" }],
        mes_incidents_locataire: [{ id: "inc-1", numero: "INC-1", lot_nom: "Lot TEST" }],
      });
      const r = await notifierIncidentUrgentDeclare(db as never, ORG, "inc-1", { categorie: "plomberie_canalisation", piece: null, description: "Fuite TEST" });
      expect(r).toEqual({ envoyee: true });
      const courrier = seulCourrier();
      expect(courrier.to).toBe("gerant@example.invalid");
      expect(courrier.html).toContain(`${p.attendu}/incidents?sel=inc-1`);
      expect(courrier.html).not.toContain(p.interdit);
    });
  }
});

describe("mission refusée par l'artisan : le courrier au gestionnaire", () => {
  for (const p of PROFILS_COURRIER) {
    it(`${p.nom} : ${p.attendu}/incidents?sel=…`, async () => {
      expect(await notifierMissionRefusee(service(p.type) as never, ORG, "iv-1")).toEqual({ envoyee: true });
      const [courrier] = envoisAuGestionnaire();
      expect(courrier.html).toContain(`${p.attendu}/incidents?sel=inc-1`);
      expect(courrier.html).not.toContain(p.interdit);
    });
  }
});

describe("relance d'un paiement d'abonnement refusé", () => {
  for (const p of PROFILS_COURRIER) {
    it(`${p.nom} : ${p.attendu}/abonnement`, async () => {
      const db = client(base(p.type), {
        abonnements_a_relancer: [{
          organization_id: ORG, organisation: "Organisation TEST", destinataire: "facturation@example.invalid", palier: 1,
          jours_ecoules: 3, jours_restants: 12, lecture_seule_le: "2026-10-30", montant_mensuel: "12.00", periodicite: "mensuel", montant_periode_cents: 1200,
        }],
      });
      expect(await envoyerRelancesDues(db as never)).toEqual({ envoyees: 1, sans_adresse: [], echecs: [] });
      const courrier = seulCourrier();
      expect(courrier.html).toContain(`${p.attendu}/abonnement`);
      expect(courrier.html).not.toContain(p.interdit);
    });
  }
});

describe("avis de reconduction de l'abonnement", () => {
  for (const p of PROFILS_COURRIER) {
    it(`${p.nom} : ${p.attendu}/abonnement`, async () => {
      const db = client(base(p.type), {
        abonnements_avis_reconduction_dus: [{
          organization_id: ORG, organisation: "Organisation TEST", destinataire: "facturation@example.invalid",
          periode_fin: "2026-12-01T00:00:00Z", montant_periode_cents: 14400, formule: null,
        }],
      });
      expect(await envoyerAvisReconduction(db as never)).toEqual({ envoyes: 1, sans_adresse: [], echecs: [] });
      const courrier = seulCourrier();
      expect(courrier.html).toContain(`${p.attendu}/abonnement`);
      expect(courrier.html).not.toContain(p.interdit);
    });
  }
});

describe("avis de fin d'essai (webhook Stripe « trial_will_end »)", () => {
  for (const p of PROFILS_COURRIER) {
    it(`${p.nom} : ${p.attendu}/abonnement`, async () => {
      const finEssai = Math.floor(Date.parse("2026-11-01T00:00:00Z") / 1000);
      const souscription = {
        id: "sub_test", customer: "cus_test", status: "trialing", trial_end: finEssai, metadata: {},
        items: { data: [{ quantity: 1, price: { unit_amount: 1200, recurring: { interval: "month" } } }] },
      };
      const evenement = { id: "evt_fin_essai", type: "customer.subscription.trial_will_end", data: { object: souscription } };
      sim.stripe = {
        webhooks: { constructEventAsync: async () => evenement },
        subscriptions: { retrieve: async () => souscription },
      };
      sim.service = client(base(p.type), {
        abonnement_evenement_a_traiter: true,
        abonnement_par_client: [{
          organization_id: ORG, organisation: "Organisation TEST", public_tarif: p.type, grille: "2026-09-28",
          stripe_subscription_id: "sub_test", stripe_statut: "trialing", destinataire: "facturation@example.invalid",
        }],
      });
      const reponse = await webhookStripe(new Request("https://gerimmo.test/api/stripe/webhook", {
        method: "POST", headers: { "stripe-signature": "t=1,v1=simulee" }, body: JSON.stringify(evenement),
      }));
      expect(await reponse.json()).toMatchObject({ traite: "customer.subscription.trial_will_end", organisation: ORG, avis: "envoye" });
      const courrier = seulCourrier();
      expect(courrier.html).toContain(`${p.attendu}/abonnement`);
      expect(courrier.html).not.toContain(p.interdit);
    });
  }
});
