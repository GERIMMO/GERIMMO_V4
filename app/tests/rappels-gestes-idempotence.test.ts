/**
 * Les rappels de gestes (créneau non choisi, mission non acceptée, pièce
 * demandée, devis non chiffré) partent par la même tâche que les rappels de
 * rendez-vous : ils portent donc eux aussi une clé anti-doublon (décision D47).
 *
 * On envoie, PUIS on trace. Si le délai maximal coupe l'attente d'un envoi
 * accepté, la trace manque et le rappel repart à la passe suivante : sans clé,
 * ce serait un second e-mail. La clé reprend celle de la trace
 * (`type:objet`), préfixée pour ne pas se confondre avec une autre famille.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

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
