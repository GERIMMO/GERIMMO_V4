/**
 * Les relances de paiement d'abonnement (`lib/relances-paiement.ts`) reçoivent,
 * comme les tâches d'envoi, le délai maximal de `envoyerEmail` : elles portent
 * donc aussi une clé anti-doublon (décision D47, relecture du 14/10).
 *
 * Deux chemins les envoient — le webhook Stripe, dès l'échec du prélèvement, et
 * la tâche de nuit, qui rattrape ce que le webhook n'a pas pu faire partir. Si
 * l'attente d'un envoi pourtant accepté est coupée par le délai, la base n'est
 * pas marquée et l'autre chemin reprend la relance : sans clé, un second e-mail.
 *
 * Le vrai `envoyerEmail` tourne contre le faux fournisseur (aucun envoi réel).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";
import { envoyerRelancesDues } from "../src/lib/relances-paiement";
import { cleRelanceAbonnement } from "../src/lib/cles-idempotence-courriels";
import { corpsRelance, type Palier } from "../src/lib/relance-paiement-email";
import type { Periodicite } from "../src/lib/tarifs";

type Due = {
  organization_id: string; organisation: string; destinataire: string | null; palier: number;
  jours_ecoules: number; jours_restants: number; lecture_seule_le: string; montant_mensuel: number;
  periodicite: string; montant_periode_cents: number | null;
};
const due = (surcharge: Partial<Due> = {}): Due => ({
  organization_id: "org-1", organisation: "Agence Alpha", destinataire: "gerant@exemple.fr", palier: 0,
  jours_ecoules: 0, jours_restants: 14, lecture_seule_le: "2026-10-28", montant_mensuel: 49, periodicite: "mensuel", montant_periode_cents: 4900, ...surcharge,
});

function banc(lignes: () => Due[], marquage: { erreur: boolean } = { erreur: false }) {
  const marques: string[] = [];
  const supabase = {
    rpc: async (fn: string, args?: { p_org?: string }) => {
      if (fn === "abonnements_a_relancer") return { data: lignes(), error: null };
      // Plan du 23/10 (R06) : le marquage passe par abonnement_relance_consigner (marque et preuve d'audit).
      if (fn === "abonnement_relance_consigner") {
        if (marquage.erreur) return { data: null, error: { message: "verrou" } };
        marques.push(String(args?.p_org));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { supabase: supabase as never, marques };
}

let fournisseur = fauxFournisseurEmail();

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  fournisseur = fauxFournisseurEmail();
  vi.stubGlobal("fetch", fournisseur.fetch);
  // Le délai de 15 s est ramené à 25 ms : le test ne l'attend pas.
  const reel = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => reel(25));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("la relance d'abonnement porte une clé anti-doublon", () => {
  it("la clé est envoyée au service, sans adresse en clair, et l'appel a un délai maximal", async () => {
    const { supabase } = banc(() => [due()]);
    const bilan = await envoyerRelancesDues(supabase);
    expect(bilan).toMatchObject({ envoyees: 1, echecs: [] });
    const [cle] = fournisseur.cles();
    expect(cle).toMatch(/^relance-abonnement\/org-1\/0\/2026-10-28\//);
    expect(cle).not.toMatch(/gerant|exemple|@/);
    expect(fournisseur.appels.every((a) => a.avecDelai)).toBe(true);
  });

  it("un envoi accepté mais coupé par le délai, repris par l'autre chemin dans les 24 h : un seul message", async () => {
    // Le webhook envoie (palier 0) ; le service accepte puis ne répond plus.
    const { supabase, marques } = banc(() => [due()]);
    fournisseur.definirMode("accepte-puis-muet");
    const webhook = await envoyerRelancesDues(supabase, { org: "org-1" });
    expect(webhook.envoyees).toBe(0);
    expect(webhook.echecs[0]).toMatch(/n’a pas répondu à temps/);
    expect(marques).toHaveLength(0);

    // La tâche de nuit rattrape l'alerte : même clé, même texte.
    fournisseur.definirMode("normal");
    fournisseur.avancer(20 * 3_600_000);
    const nuit = await envoyerRelancesDues(supabase);
    expect(nuit).toMatchObject({ envoyees: 1, echecs: [] });
    expect(marques).toEqual(["org-1"]);
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("le marquage perdu après un envoi réussi ne fait pas repartir le courrier à la passe suivante", async () => {
    const { supabase } = banc(() => [due()], { erreur: true });
    await envoyerRelancesDues(supabase);
    fournisseur.avancer(3_600_000);
    await envoyerRelancesDues(supabase);
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("deux organisations, ou deux paliers, ou deux destinataires ne se confondent pas", async () => {
    const lignes = [
      due(),
      due({ organization_id: "org-2", organisation: "Agence Beta" }),
      due({ palier: 2, jours_restants: 1 }),
      due({ destinataire: "autre@exemple.fr" }),
    ];
    await envoyerRelancesDues(banc(() => lignes).supabase);
    expect(fournisseur.acceptes).toHaveLength(4);
    expect(new Set(fournisseur.cles()).size).toBe(4);
  });

  it("le palier 1 dit « il vous reste N jours » : le jour qui passe change le texte, donc la clé (pas de refus 409)", async () => {
    let restants = 5;
    const { supabase } = banc(() => [due({ palier: 1, jours_restants: restants })], { erreur: true });
    await envoyerRelancesDues(supabase);
    restants = 4;
    fournisseur.avancer(24 * 3_600_000 - 2_000);
    const bilan = await envoyerRelancesDues(supabase);
    expect(bilan.echecs).toEqual([]);
    expect(fournisseur.acceptes).toHaveLength(2);
    expect(new Set(fournisseur.cles()).size).toBe(2);
  });

  it("un abonnement mensuel garde exactement la clé d'avant (centimes seuls) ; l'annuel la distingue, comme son courrier", async () => {
    // Lot mineurs du 19/10 (a) : le courrier dit désormais le montant de la période et sa périodicité. La clé le suit,
    // sans changer celle des abonnements mensuels : aucun doublon au déploiement.
    const { supabase } = banc(() => [due(), due({ organization_id: "org-2", periodicite: "annuel", montant_periode_cents: 5990, montant_mensuel: 4.99 })]);
    const bilan = await envoyerRelancesDues(supabase);
    expect(bilan).toMatchObject({ envoyees: 2, echecs: [] });
    const cles = fournisseur.cles();
    expect(cles[0]).toMatch(/^relance-abonnement\/org-1\/0\/2026-10-28\/4900\//);
    expect(cles[1]).toMatch(/^relance-abonnement\/org-2\/0\/2026-10-28\/5990an\//);
  });

  it("plan du 23/10 (R23, R06) : le premier prélèvement a son courrier et sa clé ; la preuve est consignée avec l'identifiant du message", async () => {
    const consignes: Record<string, unknown>[] = [];
    const supabase = {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        if (fn === "abonnements_a_relancer")
          return { data: [due({ premier_prelevement: true, en_defaut_depuis: "2026-10-13", resiliable_le: "2026-11-12" } as Partial<Due>)], error: null };
        if (fn === "abonnement_relance_consigner") consignes.push(args ?? {});
        return { data: true, error: null };
      },
    };
    const bilan = await envoyerRelancesDues(supabase as never);
    expect(bilan).toMatchObject({ envoyees: 1, echecs: [] });
    expect(fournisseur.cles()[0]).toMatch(/^relance-abonnement\/org-1\/0\/2026-10-28\/4900p\//);
    expect(consignes).toEqual([{ p_org: "org-1", p_palier: 0, p_message: expect.any(String), p_premier_prelevement: true }]);
    expect(JSON.stringify(consignes)).not.toContain("@");
  });

  it("sans montant de période lisible (fonction SQL antérieure), la relance est rapportée en échec plutôt qu'envoyée fausse", async () => {
    const { supabase, marques } = banc(() => [{ ...due(), montant_periode_cents: undefined as unknown as number }]);
    const bilan = await envoyerRelancesDues(supabase);
    expect(bilan.envoyees).toBe(0);
    expect(bilan.echecs[0]).toMatch(/montant du prélèvement illisible/);
    expect(fournisseur.acceptes).toHaveLength(0);
    expect(marques).toHaveLength(0);
  });

  it("un abonnement annuel dont la base ne connaît pas le montant de la période (NULL) : échec rapporté, aucun courrier « par mois »", async () => {
    // Relecture du 19/10 : la base rend NULL plutôt que le douzième mensuel pour un annuel sans montant de période.
    const { supabase, marques } = banc(() => [due({ periodicite: "annuel", montant_periode_cents: null, montant_mensuel: 4.99 })]);
    const bilan = await envoyerRelancesDues(supabase);
    expect(bilan).toMatchObject({ envoyees: 0, echecs: [expect.stringMatching(/montant du prélèvement illisible/)] });
    expect(fournisseur.acceptes).toHaveLength(0);
    expect(marques).toHaveLength(0);
  });

  it("le palier 0 ne dépend pas du jour : sa reprise du lendemain garde la même clé", async () => {
    let ecoules = 0;
    const { supabase } = banc(() => [due({ palier: 0, jours_ecoules: ecoules, jours_restants: 14 - ecoules })], { erreur: true });
    await envoyerRelancesDues(supabase);
    ecoules = 1;
    fournisseur.avancer(24 * 3_600_000 - 2_000);
    await envoyerRelancesDues(supabase);
    expect(fournisseur.acceptes).toHaveLength(1);
  });
});

describe("la clé de la relance d'abonnement suit exactement ce que le courrier dit", () => {
  const base = { organisationId: "org-1", palier: 0 as Palier, lectureSeuleLe: "2026-10-28", joursRestants: 14, periodicite: "mensuel" as Periodicite, montantPeriodeCents: 4900, destinataire: "gerant@exemple.fr" };
  const courrier = (r: typeof base) =>
    corpsRelance({ palier: r.palier, organisation: "Agence Alpha", periodicite: r.periodicite, montantPeriodeCents: r.montantPeriodeCents, joursRestants: r.joursRestants, lectureSeuleLe: r.lectureSeuleLe, lien: null });

  // Si le courrier change quand on varie un champ, la clé doit changer aussi (sinon le service
  // refuse la réutilisation) ; s'il ne change pas, la clé doit rester (sinon le doublon repart).
  for (const palier of [0, 1, 2, 3] as Palier[]) {
    for (const [champ, variante] of [
      ["joursRestants", { joursRestants: 9 }],
      ["montantPeriodeCents", { montantPeriodeCents: 7900 }],
      ["periodicite", { periodicite: "annuel" as Periodicite }],
    ] as const) {
      it(`palier ${palier}, ${champ} : la clé change si et seulement si le courrier change`, () => {
        const a = { ...base, palier };
        const b = { ...a, ...variante };
        expect(cleRelanceAbonnement(b) !== cleRelanceAbonnement(a)).toBe(courrier(b) !== courrier(a));
      });
    }
  }
});
