/**
 * D10 (audit du 13/10, SUP-04), option C — l'écran « Consignes du dirigeant ».
 *
 * Tant que les tâches d'une version ne font que lire un compteur : on parle d'ACTIVATION (« Activer la
 * version 1 », « Version activée »), jamais d'approbation ni d'autorisation, et le rédacteur peut activer.
 * Dès qu'une tâche peut agir : on parle d'APPROBATION, le rédacteur ne se voit plus proposer le bouton
 * (il peut seulement refuser) et l'écran dit qu'une autre personne doit approuver.
 * La base tient la règle (tests/consigne-activation.test.ts) ; l'écran ne promet pas ce qu'elle refuserait.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decisionConsigne, exigeApprobateurDistinct } from "../src/lib/consignes-regles";

const MOI = "00000000-0000-4000-8000-000000000001";
const AUTRE = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, utilisateur: "" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({}), usePathname: () => "/admin/consignes" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, eq: () => q, is: () => q, limit: () => q,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.tables[table] ?? [], error: null }).then(resolve),
      };
      return q;
    },
    auth: { getUser: async () => ({ data: { user: { id: mocks.utilisateur } }, error: null }) },
  }),
}));

import Consignes from "../src/app/admin/consignes/page";

const version = (auteur: string) => ({
  id: "v1", consigne_id: "c1", numero: 1, titre: "Lecture des quittances", texte: "Observer la mission de quittances.",
  mission: "quittances", debut: "2026-10-14T08:00:00Z", fin: "2026-10-20T08:00:00Z", responsable: AUTRE, budget_total: 2, budget_mensuel: 2, auteur,
});
const tache = (type: string, etat = "proposee") => ({ id: `t-${type}`, version_id: "v1", type, etat, preuve: null });

function donnees(auteur: string, types: string[], accord?: { accepte: boolean; auteur: string }) {
  mocks.tables = {
    supervision_consignes: [{ id: "c1", version_courante: 1, suspendue: false, cree_le: "2026-10-14T08:00:00Z" }],
    supervision_consignes_versions: [version(auteur)],
    supervision_consignes_accords: accord ? [{ version_id: "v1", cree_le: "2026-10-14T09:00:00Z", ...accord }] : [],
    supervision_consignes_taches: types.map((t) => tache(t, accord?.accepte ? "approuvee" : "proposee")),
    accounts: [{ id: MOI, email: "moi@exemple.test" }, { id: AUTRE, email: "autre@exemple.test" }],
    memberships: [{ account_id: MOI }, { account_id: AUTRE }],
    supervision_operations: [],
  };
}
async function ecran() {
  return renderToStaticMarkup(createElement("div", null, await Consignes()));
}
/** Le texte que lit la personne : sans balises ni attributs (le code interne « approuver » reste dans les champs cachés). */
const texte = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
/** Le seul « approuver » admis sur l'écran d'une consigne de lecture : la phrase qui annonce la règle à venir. */
const sansAnnonce = (html: string) => texte(html).replace("une autre personne que son rédacteur devra l’approuver", "");

beforeEach(() => { mocks.utilisateur = MOI; });

describe("D10 — le vocabulaire suit ce que la consigne peut faire", () => {
  it("lecture seule : les mots de l'écran sont ceux d'une activation", () => {
    expect(exigeApprobateurDistinct(["lecture_missions", "lecture_passages"])).toBe(false);
    expect(decisionConsigne(["lecture_missions"])).toMatchObject({ distincte: false, verbe: "Activer", participe: "activée", attente: "Cette version attend son activation" });
  });
  it("une tâche qui peut agir, même seule parmi des lectures, impose l'approbation par un autre", () => {
    expect(exigeApprobateurDistinct(["lecture_missions", "envoi_courriel"])).toBe(true);
    expect(decisionConsigne(["lecture_missions", "envoi_courriel"])).toMatchObject({ distincte: true, verbe: "Approuver", participe: "approuvée" });
  });
  it("une version sans tâche n'impose rien de plus (rien n'est à activer, voir SA-03)", () => {
    expect(exigeApprobateurDistinct([])).toBe(false);
  });
});

describe("D10 — consigne de lecture rédigée par moi : j'active, sans le mot « approbation »", () => {
  it("dit « activation » partout et propose « Activer la version 1 »", async () => {
    donnees(MOI, ["lecture_missions", "lecture_passages"]);
    const html = await ecran();
    expect(html).toContain("Cette version attend son activation");
    expect(html).toContain("Activer la version 1");
    expect(html).toContain("Tâches proposées à l’activation");
    expect(html).toContain("À activer");
    expect(html).toContain("puis activez cette version précise");
    expect(sansAnnonce(html)).not.toMatch(/Autoris|autoris|approuv|Approuv|Votre accord/);
  });

  it("explique pourquoi ce n'est pas une double vérification", async () => {
    donnees(MOI, ["lecture_missions"]);
    const html = await ecran();
    expect(html).toContain("l’activer n’est pas une seconde vérification");
    expect(html).toContain("une autre personne que son rédacteur devra l’approuver");
  });

  it("une fois décidée : « Version activée » et ses tâches « Activée »", async () => {
    donnees(MOI, ["lecture_missions"], { accepte: true, auteur: MOI });
    const html = await ecran();
    expect(html).toContain("Version activée");
    expect(html).toContain("Activée");
    expect(sansAnnonce(html)).not.toMatch(/Autoris|autoris|approuv|Approuv/);
  });

  it("refuser reste proposé", async () => {
    donnees(MOI, ["lecture_missions"]);
    expect(await ecran()).toContain("Refuser cette version");
  });
});

describe("D10 — consigne qui peut agir : un approbateur distinct du rédacteur", () => {
  it("le rédacteur n'a pas le bouton d'approbation, seulement celui de refus, et l'écran dit pourquoi", async () => {
    donnees(MOI, ["lecture_missions", "envoi_courriel"]);
    const html = await ecran();
    expect(html).not.toContain("Approuver la version 1");
    expect(html).not.toContain("Activer la version 1");
    expect(html).toContain("Refuser cette version");
    expect(html).toContain("Vous avez rédigé cette version et elle peut agir au-delà de la lecture : une autre personne doit l’approuver.");
    expect(html).toContain("À approuver");
  });

  it("un autre superviseur voit « Approuver la version 1 » et la raison", async () => {
    donnees(AUTRE, ["lecture_missions", "envoi_courriel"]);
    const html = await ecran();
    expect(html).toContain("Approuver la version 1");
    expect(html).toContain("Une autre personne que le rédacteur doit approuver cette version");
    expect(html).toContain("son approbation doit venir d’une autre personne que son rédacteur");
  });

  it("une fois approuvée : « Version approuvée »", async () => {
    donnees(AUTRE, ["envoi_courriel"], { accepte: true, auteur: MOI });
    const html = await ecran();
    expect(html).toContain("Version approuvée");
    expect(html).toContain("Approuvée");
  });
});
