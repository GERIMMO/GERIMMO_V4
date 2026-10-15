/**
 * Décision D27 : au retour de Stripe et après la confirmation d'une hausse, le client revient sous la racine de SON
 * profil — /agence/<id> pour une agence, /espace/<id> pour un propriétaire direct. Une inversion enverrait une agence,
 * juste après avoir payé, sur /espace/<agence>, que le proxy sert en « introuvable » (404).
 *
 * Sans Stripe ni base réels : Stripe, la session et les lectures d'état sont simulés ; on lit les adresses de retour
 * transmises à la page de paiement, et l'adresse de redirection après la hausse.
 *
 * Relecture du 15/10 (mutations survivantes) : la résiliation, la demande de périodicité, le passage à la grille
 * actuelle et le retour du portail de facturation lisent la racine d'après le TYPE de l'organisation
 * (baseDeLOrganisation) ; une adresse /espace mise en dur y enverrait l'agence sur « introuvable ».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { offreAgence, offreParticulier } from "@/lib/tarifs";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  typeOrganisation: "agence",
  creerSession: vi.fn(),
  appliquerHausse: vi.fn(),
  resilier: vi.fn(),
  portail: vi.fn(),
  service: null as unknown,
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "www.gerimmo.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { id: "org-1", name: "Organisation TEST", type: m.typeOrganisation, email_contact: null }, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.service }));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
  clientStripe: () => ({}),
  assurerClientStripe: async () => ({ ok: true, customer: "cus_test", remplace: false }),
  verifierClientDeLOrganisation: async () => ({ ok: true }),
  ouvrirPortailFacturation: m.portail,
}));
vi.mock("@/lib/stripe-offres", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe-offres")>()),
  creerSessionOffre: m.creerSession,
  apercuChangement: async () => ({ ok: true, immediatCents: 250 }),
  appliquerHausse: m.appliquerHausse,
  resilierAEcheance: m.resilier,
  libererEcheancierDe: async () => ({ ok: true }),
}));

import { confirmerHausse, demanderPeriodicite, demarrerAbonnement, ouvrirPortailAbonnement, resilierAbonnement } from "@/app/actions/abonnement";
import { GRILLE } from "@/lib/stripe-offres";

const PROFILS = [
  { nom: "agence", publicTarif: "agence", attendu: "/agence/org-1", interdit: "/espace/" },
  { nom: "propriétaire direct", publicTarif: "proprietaire_direct", attendu: "/espace/org-1", interdit: "/agence/" },
] as const;

function etat(publicTarif: string, souscrit: boolean, grille: string = GRILLE) {
  m.typeOrganisation = publicTarif;
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "etat_abonnement") {
      return { data: [{ statut: "essai", essai_fin: null, public_tarif: publicTarif, unites_facturees: 1, en_ligne_possible: true, grille, unites_a_couvrir: 1, unites_souscrites: souscrit ? 1 : null }], error: null };
    }
    if (nom === "mon_abonnement") {
      return { data: [{ souscrit, periodicite: "mensuel", formule: null, unites_souscrites: souscrit ? 1 : null, montant_periode_cents: souscrit ? 1 : null, stripe_statut: souscrit ? "active" : null }], error: null };
    }
    if (nom === "ma_souscription_stripe") return { data: "sub_test", error: null };
    if (nom === "mon_client_stripe") return { data: "cus_test", error: null };
    return { data: null, error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.creerSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.test/session" });
  m.appliquerHausse.mockResolvedValue({ ok: true, echeancierLibere: false });
  m.resilier.mockResolvedValue({ ok: true, echeancierLibere: false });
  m.portail.mockResolvedValue({ ok: true, url: "https://billing.stripe.test/session" });
  m.service = null;
});

describe("demarrerAbonnement : les adresses de retour de la page de paiement", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/abonnement?paiement=…`, async () => {
      etat(p.publicTarif, false);
      const offre = p.publicTarif === "agence" ? offreAgence(1) : offreParticulier(1, "mensuel");
      const f = new FormData();
      f.set("confirmation", "oui");
      f.set("periodicite", "mensuel");
      if (p.publicTarif !== "agence") f.set("formule", offreParticulier(1, "mensuel").formule.code);
      f.set("montant_attendu_cents", String(offre.montantCents));
      await expect(demarrerAbonnement("org-1", {}, f)).rejects.toMatchObject({ url: "https://checkout.stripe.test/session" });
      const { retourOk, retourAnnule } = m.creerSession.mock.calls[0][1] as { retourOk: string; retourAnnule: string };
      expect(retourOk).toBe(`https://www.gerimmo.test${p.attendu}/abonnement?paiement=ok`);
      expect(retourAnnule).toBe(`https://www.gerimmo.test${p.attendu}/abonnement?paiement=annule`);
      expect(retourOk + retourAnnule).not.toContain(p.interdit);
    });
  }
});

describe("confirmerHausse : la redirection après la hausse appliquée", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/abonnement?changement=ok`, async () => {
      etat(p.publicTarif, true);
      const offre = p.publicTarif === "agence" ? offreAgence(4) : offreParticulier(4, "mensuel");
      const f = new FormData();
      f.set("confirmation", "oui");
      f.set("unites", "4");
      if (p.publicTarif !== "agence") f.set("formule", offreParticulier(4, "mensuel").formule.code);
      f.set("montant_attendu_cents", String(offre.montantCents));
      f.set("proration_date", "1792000000");
      f.set("immediat_attendu_cents", "250");
      const echec = await confirmerHausse("org-1", {}, f).then((r) => r, (e: { url?: string }) => e);
      expect(m.appliquerHausse).toHaveBeenCalledOnce();
      expect((echec as { url?: string }).url).toBe(`${p.attendu}/abonnement?changement=ok`);
      expect((echec as { url?: string }).url).not.toContain(p.interdit);
    });
  }
});

/** L'adresse de redirection d'une action (Next la signale en levant une erreur qui porte l'URL). */
async function redirection(promesse: Promise<unknown>): Promise<string | undefined> {
  return promesse.then((r) => { throw new Error(`aucune redirection : ${JSON.stringify(r)}`); }, (e: { url?: string }) => e.url);
}

describe("resilierAbonnement : retour sur « Mon abonnement » sous la racine du profil", () => {
  for (const p of PROFILS) {
    for (const [choix, issue] of [["oui", "programmee"], ["non", "annulee"]] as const) {
      it(`${p.nom}, résilier=${choix} → ${p.attendu}/abonnement?resiliation=${issue}`, async () => {
        etat(p.publicTarif, true);
        const f = new FormData();
        f.set("resilier", choix);
        const url = await redirection(resilierAbonnement("org-1", {}, f));
        expect(m.resilier).toHaveBeenCalledOnce();
        expect(url).toBe(`${p.attendu}/abonnement?resiliation=${issue}`);
        expect(url).not.toContain(p.interdit);
      });
    }
  }
});

describe("demanderPeriodicite : retour sur « Mon abonnement » sous la racine du profil", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/abonnement?periodicite=programmee`, async () => {
      etat(p.publicTarif, true);
      const f = new FormData();
      f.set("periodicite", "annuel");
      const url = await redirection(demanderPeriodicite("org-1", {}, f));
      expect(m.rpc).toHaveBeenCalledWith("demander_periodicite_suivante", { p_org: "org-1", p_periodicite: "annuel" });
      expect(url).toBe(`${p.attendu}/abonnement?periodicite=programmee`);
      expect(url).not.toContain(p.interdit);
    });
  }
});

describe("ouvrirPortailAbonnement : l'adresse de retour du portail de facturation", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → https://…${p.attendu}/abonnement`, async () => {
      etat(p.publicTarif, true);
      const url = await redirection(ouvrirPortailAbonnement("org-1", {}, new FormData()));
      expect(url).toBe("https://billing.stripe.test/session");
      const { retour } = m.portail.mock.calls[0][1] as { retour: string };
      expect(retour).toBe(`https://www.gerimmo.test${p.attendu}/abonnement`);
      expect(retour).not.toContain(p.interdit);
    });
  }
});

describe("passage à la grille actuelle (ancienne grille sans souscription) : retour sous la racine du profil", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/abonnement?grille=actuelle`, async () => {
      etat(p.publicTarif, false, "historique");
      const bascule = vi.fn(async () => ({ data: null, error: null }));
      // Le client de service lit le type de l'organisation comme le client de la session.
      m.service = {
        rpc: bascule,
        from: () => {
          const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { type: p.publicTarif }, error: null }) };
          return q;
        },
      };
      const url = await redirection(demarrerAbonnement("org-1", {}, new FormData()));
      expect(bascule).toHaveBeenCalledWith("abonnement_basculer_grille", { p_org: "org-1" });
      expect(url).toBe(`${p.attendu}/abonnement?grille=actuelle`);
      expect(url).not.toContain(p.interdit);
    });
  }
});
