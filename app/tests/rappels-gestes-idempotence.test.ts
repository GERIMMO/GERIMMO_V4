/**
 * Les rappels de gestes (créneau non choisi, mission non acceptée, pièce
 * demandée, devis non chiffré) partent par la même tâche que les rappels de
 * rendez-vous : ils portent donc eux aussi une clé anti-doublon (décision D47).
 *
 * On envoie, PUIS on trace. Si le délai maximal coupe l'attente d'un envoi
 * accepté, la trace manque et le rappel repart à la passe suivante : sans clé,
 * ce serait un second e-mail. La clé reprend celle de la trace
 * (`type:objet`), préfixée pour ne pas se confondre avec une autre famille.
 *
 * LE TEXTE DOIT RESTER LE MÊME D'UNE PASSE À L'AUTRE (relecture du 14/10). Le
 * service refuse (409) une clé réutilisée avec un autre contenu : un rappel qui
 * écrivait « depuis N jours » avec N recalculé chaque matin n'était donc pas
 * repris le lendemain d'un envoi accepté mais non tracé. Les tests de la
 * seconde partie font tourner le VRAI `envoyerEmail` contre le faux fournisseur
 * (le premier groupe le remplace par un simulacre et ne voit pas la dérive).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";

const envoyerEmail = vi.fn();
vi.mock("@/lib/email", () => ({ envoyerEmail: (...a: unknown[]) => envoyerEmail(...a) }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => null }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));

import { envoyerRappelsGestes } from "@/lib/notifications";

/** Un client Supabase minimal : chaque table rend ses lignes, chaque lecture unique sa ligne. */
function base(tables: Record<string, unknown[]>, uniques: Record<string, unknown>) {
  const journal: { evenement: string; details: Record<string, unknown> }[] = [];
  const client = {
    from(nom: string) {
      const requete: Record<string, unknown> = new Proxy({}, {
        get(_cible, propriete) {
          if (propriete === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: tables[nom] ?? [], error: null }).then(ok, ko);
          if (propriete === "maybeSingle") return async () => ({ data: uniques[nom] ?? null, error: null });
          return () => requete;
        },
      });
      return requete;
    },
    async rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === "org_ecriture_ouverte") return { data: true, error: null };
      if (fn === "log_tech") journal.push({ evenement: String(args?.evenement), details: args?.details as Record<string, unknown> });
      return { data: null, error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, journal };
}

const MAINTENANT = new Date("2026-10-14T06:00:00Z");

beforeEach(() => envoyerEmail.mockReset());

describe("rappels de gestes : clé anti-doublon", () => {
  it("une mission non acceptée est envoyée avec la clé « rappel-geste/mission_non_acceptee:<id> »", async () => {
    const { client, journal } = base(
      { incident_interventions: [{ id: "iv-9", organization_id: "org-1", incident_id: "inc-1", artisan_id: "art-1", confiee_le: "2026-10-10T06:00:00Z" }] },
      { incidents: { id: "inc-1", numero: "INC-1", categorie: "plomberie_canalisation", piece: null, description: null, bail_id: null, declarant_person_id: null, responsable_account_id: null, lot_id: "lot-1" },
        artisans: { email: "artisan@exemple.fr", raison_sociale: "Plomberie Durand" } }
    );
    envoyerEmail.mockResolvedValue({ id: "message-1" });
    const bilan = await envoyerRappelsGestes(client, MAINTENANT);
    expect(bilan).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    expect(envoyerEmail.mock.calls[0][0]).toMatchObject({ to: "artisan@exemple.fr", cleIdempotence: "rappel-geste/mission_non_acceptee:iv-9" });
    expect(journal.some((j) => j.evenement === "notification_rappel" && j.details.cle === "mission_non_acceptee:iv-9")).toBe(true);
  });

  it("un échec d'envoi (délai dépassé) ne trace rien : le rappel repart, avec la même clé", async () => {
    const tables = { incident_interventions: [{ id: "iv-9", organization_id: "org-1", incident_id: "inc-1", artisan_id: "art-1", confiee_le: "2026-10-10T06:00:00Z" }] };
    const uniques = {
      incidents: { id: "inc-1", numero: "INC-1", categorie: "plomberie_canalisation", piece: null, description: null, bail_id: null, declarant_person_id: null, responsable_account_id: null, lot_id: "lot-1" },
      artisans: { email: "artisan@exemple.fr", raison_sociale: "Plomberie Durand" },
    };
    const passe1 = base(tables, uniques);
    envoyerEmail.mockResolvedValueOnce({ erreur: "Le service d’e-mail n’a pas répondu à temps." });
    const b1 = await envoyerRappelsGestes(passe1.client, MAINTENANT);
    expect(b1).toMatchObject({ envoyes: 0, echecs: 1 });
    expect(passe1.journal.some((j) => j.evenement === "notification_rappel")).toBe(false);

    const passe2 = base(tables, uniques);
    envoyerEmail.mockResolvedValueOnce({ id: "message-1" });
    const b2 = await envoyerRappelsGestes(passe2.client, MAINTENANT);
    expect(b2).toMatchObject({ envoyes: 1, echecs: 0 });
    const cles = envoyerEmail.mock.calls.map(([p]) => p.cleIdempotence);
    expect(cles).toEqual(["rappel-geste/mission_non_acceptee:iv-9", "rappel-geste/mission_non_acceptee:iv-9"]);
  });
});

// ── Le VRAI envoyerEmail, le faux fournisseur : ce que le service voit d'une passe à l'autre ─────────

describe("rappels de gestes : la reprise du lendemain porte le même texte", () => {
  const tables = { incident_interventions: [{ id: "iv-9", organization_id: "org-1", incident_id: "inc-1", artisan_id: "art-1", confiee_le: "2026-10-10T06:00:00Z" }] };
  const uniques = {
    incidents: { id: "inc-1", numero: "INC-1", categorie: "plomberie_canalisation", piece: null, description: null, bail_id: null, declarant_person_id: null, responsable_account_id: null, lot_id: "lot-1" },
    artisans: { email: "artisan@exemple.fr", raison_sociale: "Plomberie Durand" },
  };
  const matin = (jour: number, seconde: number) => new Date(Date.UTC(2026, 9, jour, 6, 0, seconde));
  let fournisseur = fauxFournisseurEmail();

  beforeEach(async () => {
    const reel = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
    envoyerEmail.mockImplementation((p: Parameters<typeof reel.envoyerEmail>[0]) => reel.envoyerEmail(p));
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** Deux passes quotidiennes, la trace de la première n'ayant pas été posée (marquage perdu ou attente coupée). */
  async function deuxPassesSansTrace(passe1: Date, passe2: Date) {
    const b1 = await envoyerRappelsGestes(base(tables, uniques).client, passe1);
    fournisseur.avancer(passe2.getTime() - passe1.getTime());
    const b2 = await envoyerRappelsGestes(base(tables, uniques).client, passe2);
    return { b1, b2 };
  }

  it("le rappel accepté mais non tracé est repris le lendemain sans nouveau message ni faux échec", async () => {
    // 14/10 06:00:05, puis 15/10 06:00:01 : 23 h 59 min 56 s, dans la fenêtre de la clé.
    const { b1, b2 } = await deuxPassesSansTrace(matin(14, 5), matin(15, 1));
    expect(b1).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(b2).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(fournisseur.acceptes).toHaveLength(1);
    expect(new Set(fournisseur.cles()).size).toBe(1);
  });

  it("le texte ne compte plus les jours écoulés : deux jours d'écart, même message", async () => {
    await deuxPassesSansTrace(matin(14, 5), matin(15, 1));
    const corps = envoyerEmail.mock.calls.map(([p]) => String(p.html));
    expect(corps).toHaveLength(2);
    expect(corps[1]).toBe(corps[0]);
    expect(corps[0]).toMatch(/depuis au moins 2 jours/);
  });

  it("un rappel de plus de dix jours de retard garde le même texte qu'un rappel tout juste dû", async () => {
    const tardif = { incident_interventions: [{ ...tables.incident_interventions[0], confiee_le: "2026-09-01T06:00:00Z" }] };
    await envoyerRappelsGestes(base(tables, uniques).client, matin(12, 0));
    await envoyerRappelsGestes(base(tardif, uniques).client, matin(14, 0));
    const [juste, tard] = envoyerEmail.mock.calls.map(([p]) => String(p.html));
    expect(tard).toBe(juste);
  });

  it("RISQUE RÉSIDUEL DE D47 : si la reprise tombe après les 24 h de la clé, le rappel repart (texte identique, deux messages)", async () => {
    // 14/10 06:00:05, puis 15/10 06:00:09 : 24 h et 4 s.
    const { b2 } = await deuxPassesSansTrace(matin(14, 5), matin(15, 9));
    expect(b2).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(fournisseur.acceptes).toHaveLength(2);
  });
});
