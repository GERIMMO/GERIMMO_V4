/**
 * DÉCISION DU DIRIGEANT DU 24/11/2026, LOT D4 — Q24 : « ouvre aussi la relance à la main ».
 *
 * Le composant serveur des loyers à confirmer lit l'interrupteur « relance de loyer » du superviseur et dit à l'écran
 * s'il peut proposer l'envoi immédiat par e-mail. Avant le lot, il répondait toujours non (liste fermée du pilote).
 * L'écran lui-même est tenu par tests/relances-d4-ecrans.test.ts ; ici, seule la décision transmise est observée.
 */
import { expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("@/components/rappels-loyers-interactifs", () => ({ RappelsLoyersInteractifs: (props: Record<string, unknown>) => { m.props.push(props); return null; } }));
vi.mock("@/lib/recommande-disponible", () => ({ recommandeElectroniqueDisponible: async () => false }));

import { RappelsLoyers } from "@/components/rappels-loyers";

const ligne = { appel_id: "appel", bail_id: "bail", lot_nom: "Appartement", locataire: "Camille", periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 800, montant_couvert: 200, non_recu_signale_le: null };
const base = (proposes: unknown) => {
  const requete = (lignes: unknown[]) => {
    const q = { order: () => q, in: () => q, eq: () => q, gte: () => q, or: () => q, limit: () => q,
      range: async () => ({ data: lignes, error: null }),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }) };
    return q;
  };
  return { rpc: (nom: string) => nom === "envois_automatiques_proposes" ? Promise.resolve(proposes) : requete([ligne]), from: () => ({ select: () => requete([]) }) };
};
const CINQ = { avis_echeance: false, relance_loyer: true, rappel_rendez_vous: false, relance_invitation: false, relance_report_rdv: false };
/** Ce que le composant serveur transmet à l'écran. */
const transmis = async (proposes: unknown) => {
  m.props.length = 0;
  const element = await RappelsLoyers({ supabase: base(proposes) as never, orgId: "org", dansFenetre: false });
  // Le composant rend l'écran : on l'appelle pour lire ses propriétés, sans rien afficher.
  (element.type as (p: unknown) => unknown)(element.props);
  expect(m.props).toHaveLength(1);
  return m.props[0];
};

it("relance ouverte par le superviseur : l'écran peut proposer l'envoi immédiat à la main", async () => {
  expect(await transmis({ data: CINQ, error: null })).toMatchObject({ envoiRelanceDisponible: true, relanceAutomatiqueOuverte: true });
});

it.each([
  ["fermée", { data: { ...CINQ, relance_loyer: false }, error: null }],
  ["illisible", { data: CINQ, error: { message: "refus" } }],
  ["connue de quatre réponses seulement (migration non appliquée)", { data: { avis_echeance: true, relance_loyer: true, rappel_rendez_vous: true, relance_invitation: true }, error: null }],
])("relance %s : l'écran ne propose que le PDF", async (_libelle, proposes) => {
  expect(await transmis(proposes)).toMatchObject({ envoiRelanceDisponible: false, relanceAutomatiqueOuverte: false });
});

it("une page qui a déjà lu l'interrupteur le transmet tel quel, sans seconde lecture", async () => {
  m.props.length = 0;
  const rpc = vi.fn((nom: string) => base({ data: { ...CINQ, relance_loyer: false }, error: null }).rpc(nom));
  const element = await RappelsLoyers({ supabase: { ...base(null), rpc } as never, orgId: "org", relanceAutomatiqueOuverte: true });
  (element.type as (p: unknown) => unknown)(element.props);
  expect(m.props[0]).toMatchObject({ envoiRelanceDisponible: true, relanceAutomatiqueOuverte: true });
  expect(rpc).not.toHaveBeenCalledWith("envois_automatiques_proposes");
});
