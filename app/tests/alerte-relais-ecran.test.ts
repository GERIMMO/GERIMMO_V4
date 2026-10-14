/**
 * D09 (audit du 13/10, SUP-03) — l'écran « Alertes et accusés » de /admin/relais :
 * - dit PAR QUI une alerte a été accusée ;
 * - ne propose le bouton « Accuser la prise en compte » qu'à celui qui peut s'en servir (le destinataire ;
 *   pour une alerte non acheminée dont le destinataire n'est plus habilité, un autre superviseur permanent) ;
 * - sinon, dit pourquoi il n'y a pas de bouton.
 * La base tient la règle (tests/alerte-relais-destinataire.test.ts) ; l'écran ne promet pas ce qu'elle refuserait.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MOI = "00000000-0000-4000-8000-000000000001";
const AUTRE = "00000000-0000-4000-8000-000000000002";
const ANCIEN = "00000000-0000-4000-8000-000000000003";

const alerte = (id: string, statut: string, destinataire: string, extra: Record<string, unknown> = {}) => ({
  id, plan_id: "plan", cle: id, titre: `Urgence ${id}`, destinataire, statut,
  cree_le: "2026-10-14T08:00:00Z", echeance: "2026-10-14T09:00:00Z", escalade_le: null, accusee_le: null, accusee_par: null, ...extra,
});

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, utilisateur: "" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({}), usePathname: () => "/admin/relais" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, eq: () => q, is: () => q,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.tables[table] ?? [], error: null }).then(resolve),
      };
      return q;
    },
    auth: { getUser: async () => ({ data: { user: { id: mocks.utilisateur } }, error: null }) },
  }),
}));

import { Vacances } from "../src/app/admin/relais/vacances";

async function ecran() {
  return renderToStaticMarkup(createElement("div", null, await Vacances()));
}
/** Le bloc d'une alerte : de son titre au suivant. */
function bloc(html: string, id: string) {
  const debut = html.indexOf(`Urgence ${id}`);
  expect(debut, `alerte ${id} absente`).toBeGreaterThan(-1);
  const fin = html.indexOf("</article>", debut);
  return html.slice(debut, fin);
}

beforeEach(() => {
  mocks.utilisateur = MOI;
  mocks.tables = {
    accounts: [{ id: MOI, email: "moi@exemple.test" }, { id: AUTRE, email: "autre@exemple.test" }, { id: ANCIEN, email: "ancien@exemple.test" }],
    // MOI et AUTRE sont habilités ; ANCIEN a perdu son habilitation.
    memberships: [{ account_id: MOI }, { account_id: AUTRE }],
    supervision_alertes_internes: [
      alerte("A1", "ouverte", MOI),
      alerte("A2", "ouverte", AUTRE),
      alerte("A3", "accusee", AUTRE, { accusee_le: "2026-10-14T09:30:00Z", accusee_par: AUTRE }),
      alerte("A4", "non_acheminee", ANCIEN),
      alerte("A5", "non_acheminee", AUTRE),
      alerte("A6", "escalade", MOI, { escalade_le: "2026-10-14T09:00:00Z" }),
      alerte("A7", "accusee", MOI, { accusee_le: "2026-10-14T09:31:00Z", accusee_par: null }),
    ],
  };
});

describe("D09 — l'écran des alertes de relais", () => {
  it("propose le bouton au destinataire", async () => {
    const html = await ecran();
    expect(bloc(html, "A1")).toContain("Accuser la prise en compte");
    expect(bloc(html, "A6")).toContain("Accuser la prise en compte");
  });

  it("ne propose pas le bouton pour une alerte adressée à un autre responsable, et le dit", async () => {
    const html = await ecran();
    expect(bloc(html, "A2")).not.toContain("Accuser la prise en compte");
    expect(bloc(html, "A2")).toContain("Seul le destinataire de l’alerte peut en accuser réception.");
    expect(bloc(html, "A2")).toContain("Destinataire : autre@exemple.test");
  });

  it("dit par qui l'alerte a été accusée", async () => {
    const html = await ecran();
    expect(bloc(html, "A3")).toMatch(/Accusé reçu le 14\/10\/2026 11:30 par autre@exemple\.test/);
    expect(bloc(html, "A3")).not.toContain("Accuser la prise en compte");
  });

  it("n'invente pas de nom quand l'ancien accusé n'en a pas", async () => {
    const html = await ecran();
    expect(bloc(html, "A7")).toMatch(/Accusé reçu le 14\/10\/2026 11:31(?! par)/);
  });

  it("une alerte non acheminée (destinataire plus habilité) reste reprenable par un autre superviseur permanent", async () => {
    const html = await ecran();
    expect(bloc(html, "A4")).toContain("Non acheminée : responsable non habilité");
    expect(bloc(html, "A4")).toContain("Accuser la prise en compte");
  });

  it("une alerte non acheminée dont le destinataire est de nouveau habilité n'est pas reprenable par un autre", async () => {
    const html = await ecran();
    expect(bloc(html, "A5")).not.toContain("Accuser la prise en compte");
    expect(bloc(html, "A5")).toContain("Seul le destinataire");
  });

  it("vu par le destinataire d'une alerte, l'autre superviseur n'a pas de bouton", async () => {
    mocks.utilisateur = AUTRE;
    const html = await ecran();
    expect(bloc(html, "A2")).toContain("Accuser la prise en compte");
    expect(bloc(html, "A1")).not.toContain("Accuser la prise en compte");
    expect(bloc(html, "A5")).toContain("Accuser la prise en compte");
  });
});
