/**
 * Phase 3 de la mission palier 1, lot 48 (U08) — le fil de discussion d'une intervention nomme le gestionnaire en agence.
 *
 * Le défaut : la carte de « Mes demandes » dit « Votre gestionnaire ou l'artisan vous a écrit » au locataire d'une agence
 * (lot 47), mais le fil vers lequel elle renvoie annonçait « Propriétaire · locataire · artisan ». Le composant est partagé :
 * l'écran qui connaît le type d'espace le transmet (locataire : `interlocuteur` ; gestionnaire d'agence : « gestionnaire »).
 * Le premier cas échouait avant le correctif ; les autres sont des témoins.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ statut: "planifiee" }));
// Une base minimale : le contexte de l'échange, un message, l'état du fil.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const requete = (resultat: unknown) => {
      const q: Record<string, unknown> = { then: (ok: (x: unknown) => unknown) => Promise.resolve(resultat).then(ok), maybeSingle: async () => ({ data: null, error: null }) };
      for (const op of ["select", "eq", "order", "limit"]) q[op] = () => q;
      return q;
    };
    return {
      rpc: async () => ({ data: [{ role_participant: "locataire", statut_intervention: m.statut }], error: null }),
      from: (table: string) => requete(table === "intervention_messages"
        ? { data: [{ id: "m1", auteur_role: "gerant", texte: "Bonjour", cree_le: "2026-11-23T10:00:00Z" }], error: null, count: 1 }
        : { data: null, error: null }),
    };
  },
}));
vi.mock("@/components/formulaire-echange-intervention", () => ({ FormulaireEchangeIntervention: () => null }));
vi.mock("@/components/marqueur-lecture-echange", () => ({ MarqueurLectureEchange: () => null }));
import { EchangesIntervention } from "@/components/echanges-intervention";

const enTete = async (props: Parameters<typeof EchangesIntervention>[0]) => {
  const html = renderToStaticMarkup(await EchangesIntervention(props));
  return /<header[^>]*>.*?<span[^>]*>([^<]*)<\/span><\/header>/.exec(html)?.[1] ?? null;
};

describe("U08 — en-tête du fil de discussion d'une intervention", () => {
  it("locataire d'une agence : « Gestionnaire · locataire · artisan »", async () => {
    expect(await enTete({ intervention: "i1", interlocuteur: "gestionnaire" })).toBe("Gestionnaire · locataire · artisan");
  });
  it("chez un propriétaire, ou sans type transmis (type de l'espace illisible) : « Propriétaire · locataire · artisan »", async () => {
    expect(await enTete({ intervention: "i1", interlocuteur: "bailleur" })).toBe("Propriétaire · locataire · artisan");
    expect(await enTete({ intervention: "i1" })).toBe("Propriétaire · locataire · artisan");
  });
  it("fil fermé : « Fermée », quel que soit l'espace", async () => {
    m.statut = "terminee";
    try {
      expect(await enTete({ intervention: "i1", interlocuteur: "gestionnaire" })).toBe("Fermée");
    } finally {
      m.statut = "planifiee";
    }
  });
  it("les écrans qui connaissent le type d'espace le transmettent (Mes demandes ; volet du gestionnaire d'agence)", () => {
    expect(readFileSync("src/app/locataire/[orgId]/demandes/page.tsx", "utf8")).toContain("<EchangesIntervention key={id} intervention={id} interlocuteur={interlocuteur} />");
    expect(readFileSync("src/app/agence/[orgId]/incidents/volet-artisan.tsx", "utf8")).toContain('{mission && !estProprietaire && <EchangesIntervention intervention={mission.id} interlocuteur="gestionnaire" />}');
  });
  // Reprise du lot 48 (U08) : la mission de l'artisan appelait le fil sans type d'espace ; l'artisan d'une mission d'agence
  // lisait « Propriétaire · locataire · artisan ». Elle lit le type de l'espace client dans `organisations_portail` (déjà
  // ouverte à l'artisan membre de l'espace, aucun droit nouveau) et le transmet.
  it("la mission de l'artisan transmet le type de l'espace client, lu avec son propre accès", () => {
    const pageMission = readFileSync("src/app/artisan/missions/[interventionId]/page.tsx", "utf8");
    expect(pageMission).toContain("const { supabase } = await verifierAccesArtisan();");
    expect(pageMission).toContain("const interlocuteur = await lireInterlocuteurLocataire(supabase, mission.organization_id);");
    expect(pageMission).toContain("<EchangesIntervention intervention={interventionId} interlocuteur={interlocuteur} />");
  });
  it("le type de l'espace client donne « gestionnaire » en agence, « bailleur » ailleurs ou illisible", async () => {
    const { lireInterlocuteurLocataire } = await import("@/lib/interlocuteur-locataire-serveur");
    const lecture = (data: unknown, error: unknown = null) => ({
      from: (vue: string) => {
        expect(vue).toBe("organisations_portail");
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data, error }) };
        return q;
      },
    }) as never;
    expect(await lireInterlocuteurLocataire(lecture({ type: "agence" }), "org")).toBe("gestionnaire");
    expect(await lireInterlocuteurLocataire(lecture({ type: "proprietaire_direct" }), "org")).toBe("bailleur");
    expect(await lireInterlocuteurLocataire(lecture(null), "org")).toBe("bailleur");
    expect(await lireInterlocuteurLocataire(lecture(null, { message: "refus" }), "org")).toBe("bailleur");
    expect(await lireInterlocuteurLocataire(undefined as never, "org")).toBe("bailleur");
  });
});
