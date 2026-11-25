/**
 * Phase 3, lot 47 (second tour) — « votre gestionnaire » seulement dans un espace d'agence, sur les écrans et courriers
 * que le premier passage n'avait pas couverts.
 *
 * Le premier passage du lot 47 avait appliqué la règle du lot 37 (interlocuteurLocataire) à l'espace locataire. Il
 * restait, dites au locataire d'un propriétaire qui gère lui-même et n'a pas de gestionnaire :
 *  1. la quittance pas encore délivrable (« Votre gestionnaire doit d'abord compléter… »), sur sa page et dans l'aperçu
 *     de « Mes documents » (route /quittance/[id]/document) ;
 *  2. l'attestation de bon paiement refusée (« Écrire à mon gestionnaire », « Demandez à votre gestionnaire… ») ;
 *  3. la page Compte, hors de tout espace (« Demandez-la à votre gestionnaire », « écrivez à votre gestionnaire depuis
 *     Mon gestionnaire ») ;
 *  4. la signature de repli des courriers au locataire quand la marque de l'espace ne se lit pas (« — Votre
 *     gestionnaire », « Votre gestionnaire vous demande une pièce ») ;
 *  5. les refus de la réponse à une invitation, écrits en base (« Contactez votre gestionnaire »).
 * Chaque cas est rendu pour un propriétaire ET pour une agence, qui garde son texte. Aucun e-mail n'est envoyé : le
 * service d'e-mail est remplacé par une doublure qui garde le message.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const m = vi.hoisted(() => ({
  client: null as unknown,
  quittance: null as unknown,
  envoyes: [] as { to: string; subject: string; html: string }[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => m.client }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => null }));
// La marque de l'espace ne se lit pas : les pages retombent sur le nom de l'émetteur, les courriers sur leur repli.
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/email", () => ({
  envoyerEmail: async (p: { to: string; subject: string; html: string }) => {
    m.envoyes.push({ to: p.to, subject: p.subject, html: p.html });
    return { id: `fictif-${m.envoyes.length}` };
  },
}));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async (orgId: string) => ({
    supabase: m.client,
    user: { id: "compte-1" },
    organisation: { id: orgId, name: "ESSAI espace" },
    personne: { id: "personne-1", nom: "Martin", prenom: "Zoé" },
    adhesionActive: true,
  }),
}));
// Une quittance à laquelle il manque une information obligatoire : elle n'est pas délivrée au locataire.
vi.mock("@/lib/quittance-conforme", () => ({
  chargerQuittanceDocument: async () => m.quittance,
  assemblerQuittanceDelivree: () => ({ html: "<html><head></head><body></body></html>", emetteur: null }),
  manquantsQuittance: () => ["Adresse de l'émetteur"],
}));
// Témoins des composants sans texte d'interlocuteur.
vi.mock("@/components/marque-organisation", () => ({ MarqueOrganisation: () => null }));
vi.mock("@/components/marque-gerimmo", () => ({ MarqueGerimmo: () => null }));
vi.mock("@/components/bouton-retour", () => ({ BoutonRetour: () => null }));
vi.mock("@/components/bouton-imprimer", () => ({ BoutonImprimer: () => null }));
vi.mock("@/components/formulaire-deconnexion", () => ({ FormulaireDeconnexion: () => null }));
vi.mock("@/components/purger-copies-autres-comptes", () => ({ PurgerCopiesAutresComptes: () => null }));
vi.mock("@/app/quittance/[quittanceId]/document-quittance", () => ({ DocumentQuittance: () => null }));
vi.mock("@/app/compte/formulaire-mot-de-passe", () => ({ FormulaireMotDePasse: () => null }));
vi.mock("@/app/compte/second-facteur", () => ({ SecondFacteur: () => null }));
vi.mock("@/app/compte/conditions-acceptees", () => ({ ConditionsAcceptees: () => null }));

import PageQuittance from "@/app/quittance/[quittanceId]/page";
import { GET as documentQuittance } from "@/app/quittance/[quittanceId]/document/route";
import PageAttestationLoyer from "@/app/attestation-loyer/[orgId]/page";
import PageCompte from "@/app/compte/page";
import { notifierPieceDemandee, notifierRendezVousFixe, envoyerRappelsGestes } from "@/lib/notifications";
import { repondreInvitation } from "@/app/actions/invitations";
import { messageDeLaBasePourInvite } from "@/lib/interlocuteur-locataire";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();

const ORG = "11111111-2222-4333-8444-555555555555";
const QUITTANCE = "9ccce3bb-7fd2-43c8-9962-2deb6f45497b";
const TYPES = [
  { nom: "propriétaire", type: "proprietaire_direct", qui: "bailleur" },
  { nom: "agence", type: "agence", qui: "gestionnaire" },
] as const;

beforeEach(() => {
  m.client = null;
  m.quittance = null;
  m.envoyes = [];
  vi.unstubAllEnvs();
});

// ─── 1. La quittance pas encore délivrable ───────────────────────────────────────────────────────────────────────────
describe("quittance pas encore délivrable, vue par le locataire", () => {
  const quittance = (type: string) => ({
    organization_id: ORG, bail_id: "bail-1", organisation: { nom: "ESSAI espace", type },
    est_quittance: true, periode: "2026-09-01", montant: "650.00", vue_gestionnaire: false,
  });

  for (const t of TYPES) {
    it(`${t.nom} : la page renvoie au ${t.qui}, phrase et bouton`, async () => {
      m.client = {};
      m.quittance = quittance(t.type);
      const html = texteDe(renderToStaticMarkup((await PageQuittance({
        params: Promise.resolve({ quittanceId: QUITTANCE }), searchParams: Promise.resolve({}),
      })) as never));
      expect(html).toContain(`Votre ${t.qui} doit d'abord compléter les informations obligatoires du document`);
      expect(html).toContain(`Écrire à mon ${t.qui}`);
      if (t.qui === "bailleur") expect(html).not.toMatch(/gestionnaire/i);
    });

    it(`${t.nom} : l'aperçu de « Mes documents » (409) le dit de même`, async () => {
      m.client = {};
      m.quittance = quittance(t.type);
      const r = await documentQuittance(new Request(`https://exemple.invalid/quittance/${QUITTANCE}/document`), {
        params: Promise.resolve({ quittanceId: QUITTANCE }),
      } as never);
      expect(r.status).toBe(409);
      const { erreur } = (await r.json()) as { erreur: string };
      expect(erreur).toBe(`Votre quittance n'est pas encore disponible : votre ${t.qui} doit d'abord compléter les informations obligatoires du document.`);
    });
  }
});

// ─── 2. L'attestation de bon paiement refusée ────────────────────────────────────────────────────────────────────────
describe("attestation de bon paiement refusée : à qui écrire", () => {
  const emetteur = (type: string, adresse: string | null) => ({
    type, nom: "ESSAI espace", adresse, code_postal: "75012", ville: "Paris", email: null, siret: null,
    bailleurs: [{ nom: "Moreau", prenom: "Claire" }],
  });
  const client = (echeancier: unknown[], identite: unknown) => ({
    rpc: async (nom: string) => {
      if (nom === "mon_bail_locataire") return { data: [{ lot_nom: "Lot A", adresse: "18 rue des Acacias", loyer_hc: 650, charges: 50, date_debut: "2026-01-01" }], error: null };
      if (nom === "mon_echeancier_locataire") return { data: echeancier, error: null };
      if (nom === "attestation_emetteur_locataire") return { data: identite, error: null };
      return { data: null, error: null };
    },
  });
  const page = async () =>
    texteDe(renderToStaticMarkup((await PageAttestationLoyer({ params: Promise.resolve({ orgId: ORG }) } as never)) as never));

  for (const t of TYPES) {
    it(`${t.nom} : un loyer reste dû → « Écrire à mon ${t.qui} »`, async () => {
      m.client = client([{ periode: "2026-09-01", montant_du: 700, statut: "impaye" }], emetteur(t.type, "3 place de la Mairie"));
      const html = await page();
      expect(html).toContain("Attestation indisponible pour l'instant");
      expect(html).toContain(`Une difficulté ? Écrire à mon ${t.qui}`);
      if (t.qui === "bailleur") expect(html).not.toMatch(/gestionnaire/i);
    });

    it(`${t.nom} : l'identité de l'émetteur est incomplète → « Demandez à votre ${t.qui} de la compléter »`, async () => {
      m.client = client([{ periode: "2026-09-01", montant_du: 700, statut: "paye" }], emetteur(t.type, null));
      const html = await page();
      expect(html).toContain("(il manque son adresse)");
      expect(html).toContain(`Demandez à votre ${t.qui} de la compléter.`);
      expect(html).toContain(`Écrire à mon ${t.qui}`);
      if (t.qui === "bailleur") expect(html).not.toMatch(/gestionnaire/i);
    });
  }
});

// ─── 3. La page Compte, hors de tout espace ──────────────────────────────────────────────────────────────────────────
describe("page Compte : à qui s'adresse le locataire", () => {
  function clientCompte(adhesions: { role: string; organization_id: string }[], identite: unknown) {
    const chaine = (table: string) => {
      const c: Record<string, unknown> = {};
      for (const k of ["select", "eq", "limit", "in", "order"]) c[k] = () => c;
      c.maybeSingle = async () => ({ data: null, error: null });
      c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve({ data: table === "memberships" ? adhesions : [], error: null }).then(ok, ko);
      return c;
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: "compte-1", email: "zoe@exemple.invalid", last_sign_in_at: null } } }) },
      from: chaine,
      rpc: async (nom: string) => (nom === "attestation_emetteur_locataire" ? { data: identite, error: null } : { data: [], error: null }),
    };
  }
  const page = async () => texteDe(renderToStaticMarkup((await PageCompte()) as never));
  const locataire = { role: "locataire", organization_id: ORG };

  it("locataire d'un propriétaire : « votre bailleur », depuis « Mon bailleur »", async () => {
    m.client = clientCompte([locataire], { type: "proprietaire_direct", nom: "ESSAI espace", bailleurs: [{ prenom: "Claire", nom: "Moreau" }] });
    const html = await page();
    expect(html).toContain("Demandez-la à votre bailleur, ou à l’assistance pour un compte propriétaire.");
    expect(html).toContain("Pour tout ce qui concerne votre location, écrivez à votre bailleur depuis Mon bailleur : c'est lui qui y répond, sous un mois.");
    expect(html).not.toMatch(/gestionnaire/i);
  });

  it("locataire d'une agence : le texte d'avant, « votre gestionnaire », depuis « Mon gestionnaire »", async () => {
    m.client = clientCompte([locataire], { type: "agence", nom: "Agence des Lilas" });
    const html = await page();
    expect(html).toContain("Demandez-la à votre gestionnaire, ou à l’assistance pour un compte propriétaire.");
    expect(html).toContain("écrivez à votre gestionnaire depuis Mon gestionnaire : c'est lui qui y répond, sous un mois.");
  });

  it("identité illisible : « bailleur », comme le titre « Mon bailleur » de l'espace", async () => {
    m.client = clientCompte([locataire], null);
    const html = await page();
    expect(html).toContain("écrivez à votre bailleur depuis Mon bailleur");
    expect(html).not.toMatch(/gestionnaire/i);
  });

  it("locataire de plusieurs espaces : la tournure de l'écran des espaces, vraie dans les deux cas", async () => {
    m.client = clientCompte([locataire, { role: "locataire", organization_id: "66666666-7777-4888-9999-aaaaaaaaaaaa" }], null);
    const html = await page();
    expect(html).toContain("Demandez-la à votre bailleur ou à son gestionnaire, ou à l’assistance pour un compte propriétaire.");
    expect(html).toContain("Pour les données d'une location, adressez-vous à son bailleur ou à son gestionnaire ;");
    // « gestionnaire » n'y figure qu'en second terme d'une alternative (« ou son gestionnaire », « ou à son gestionnaire »).
    expect(html).not.toMatch(/(?<!ou )(?<!ou à )(votre|son) gestionnaire\b/);
  });

  it("un compte qui n'est pas que locataire garde la phrase de l'adresse de connexion d'avant", async () => {
    m.client = clientCompte([{ role: "proprietaire_direct", organization_id: ORG }], null);
    const html = await page();
    expect(html).toContain("Demandez-la à votre gestionnaire, ou à l’assistance pour un compte propriétaire.");
    expect(html).toContain("adressez-vous à son bailleur ou à son gestionnaire ;");
  });
});

// ─── 4. La signature de repli des courriers au locataire ─────────────────────────────────────────────────────────────
describe("courriers au locataire sans marque lisible : la signature suit le type de l'espace", () => {
  /** Un client de gérant fictif : la marque ne se lit pas (chargerMarque → null), le type de l'espace se lit. */
  function clientGerant(type: string | null, lignes: Record<string, unknown> = {}) {
    const donnees: Record<string, unknown> = {
      persons: { email: "zoe@exemple.invalid", prenom: "Zoé" },
      organizations: { type },
      ...lignes,
    };
    // Chaque requête rend la ligne de sa table (lecture unique) ou ses lignes (liste), quels que soient ses filtres.
    const chaine = (table: string): unknown => {
      const requete: unknown = new Proxy({}, {
        get(_cible, propriete) {
          if (propriete === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve({ data: Array.isArray(donnees[table]) ? donnees[table] : [], error: null }).then(ok, ko);
          }
          if (propriete === "maybeSingle") return async () => ({ data: donnees[table] ?? null, error: null });
          return () => requete;
        },
      });
      return requete;
    };
    return {
      from: chaine,
      rpc: async (nom: string) => {
        if (nom === "org_ecriture_ouverte") return { data: true, error: null };
        if (nom === "releves_a_rappeler") return { data: [], error: null };
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;
  }

  for (const t of TYPES) {
    it(`${t.nom} : pièce demandée, « Votre ${t.qui} vous demande une pièce » et « — Votre ${t.qui} »`, async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.invalid");
      expect(await notifierPieceDemandee(clientGerant(t.type), ORG, "p-1", { id: "piece-1", libelle: "Attestation d'assurance" }, false))
        .toMatchObject({ envoyee: true });
      const html = texteDe(m.envoyes[0].html);
      expect(html).toContain(`Votre ${t.qui} vous demande une pièce : Attestation d'assurance.`);
      expect(html).toContain(`— Votre ${t.qui}`);
      if (t.qui === "bailleur") expect(html).not.toMatch(/gestionnaire/i);
    });
  }

  it("rendez-vous fixé chez un propriétaire : le locataire lit « Votre bailleur », l'artisan garde son repli", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.invalid");
    const db = clientGerant("proprietaire_direct", {
      incident_interventions: { id: "iv-1", incident_id: "inc-1", artisan_id: "art-1", debut_prevu: "2026-12-03T08:00:00Z", fin_prevue: "2026-12-03T10:00:00Z", refus_motif: null },
      incidents: { id: "inc-1", numero: "INC-1", categorie: "plomberie_canalisation", piece: null, description: null, lot_id: "lot-1", bail_id: null, declarant_person_id: "p-1", responsable_account_id: null },
      artisans: { email: "artisan@exemple.invalid", raison_sociale: "Plomberie ESSAI" },
      lots: { nom: "Lot A", bien_id: "bien-1" },
      biens: { address_line1: "18 rue des Acacias", postal_code: "75012", city: "Paris" },
    });
    await notifierRendezVousFixe(db, ORG, "iv-1");
    const pour = (to: string) => texteDe(m.envoyes.find((e) => e.to === to)?.html ?? "");
    const locataire = pour("zoe@exemple.invalid");
    expect(locataire).toContain("— Votre bailleur");
    expect(locataire).not.toMatch(/gestionnaire/i);
    expect(pour("artisan@exemple.invalid")).toContain("Votre gestionnaire a fixé le rendez-vous");
  });

  it("rappel automatique d'une pièce chez un propriétaire : « Votre bailleur attend toujours la pièce »", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.invalid");
    const db = clientGerant("proprietaire_direct", {
      pieces_demandees: [{ id: "piece-1", organization_id: ORG, person_id: "p-1", libelle: "Attestation d'assurance", demandee_le: "2026-10-01T06:00:00Z" }],
    });
    const bilan = await envoyerRappelsGestes(db, new Date("2026-10-20T06:00:00Z"));
    expect(bilan.par_type.piece_demandee).toBe(1);
    const rappel = m.envoyes.find((e) => e.to === "zoe@exemple.invalid");
    expect(texteDe(rappel?.html ?? "")).toContain("Votre bailleur attend toujours la pièce suivante : Attestation d'assurance.");
    expect(texteDe(rappel?.html ?? "")).toContain("— Votre bailleur");
    expect(texteDe(rappel?.html ?? "")).not.toMatch(/gestionnaire/i);
  });
});

// ─── 5. Les refus de la réponse à une invitation ─────────────────────────────────────────────────────────────────────
describe("réponse à une invitation refusée par la base : un renvoi vrai dans les deux espaces", () => {
  it("la règle : « votre bailleur ou son gestionnaire », le reste du message inchangé", () => {
    expect(messageDeLaBasePourInvite("Un autre accès existe déjà pour ce compte. Contactez votre gestionnaire"))
      .toBe("Un autre accès existe déjà pour ce compte. Contactez votre bailleur ou son gestionnaire");
    expect(messageDeLaBasePourInvite("Cette invitation a expiré. Demandez une nouvelle invitation."))
      .toBe("Cette invitation a expiré. Demandez une nouvelle invitation.");
  });

  for (const message of [
    "Cet espace est indisponible. Contactez votre gestionnaire",
    "Un autre accès existe déjà pour ce compte. Contactez votre gestionnaire",
  ]) {
    it(`l'action le rend ainsi : « ${message} »`, async () => {
      m.client = {
        auth: { getUser: async () => ({ data: { user: { id: "compte-1" } } }) },
        rpc: async () => ({ data: null, error: { message } }),
      };
      const form = new FormData();
      form.set("decision", "accepter");
      const r = await repondreInvitation("9ccce3bb-7fd2-43c8-9962-2deb6f45497b", {}, form);
      expect(r.erreur).toBe(message.replace("votre gestionnaire", "votre bailleur ou son gestionnaire"));
    });
  }
});
