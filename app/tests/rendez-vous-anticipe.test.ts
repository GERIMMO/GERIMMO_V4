/**
 * Audit du 13/10/2026, ART-21, décision D20 (option B) : démarrer, terminer ou facturer avant le rendez-vous confirmé
 * est possible (arrivées anticipées légitimes, urgences) mais :
 *   · l'artisan est AVERTI avant le geste, sans blocage (avant `debut_prevu` − 2 h) ;
 *   · l'écart est écrit à la chronologie (la base le fait : ecart-rendez-vous-chronologie.test.ts) et se lit en clair ;
 *   · l'écran de validation de la facture dit « rendez-vous prévu le … / intervention terminée le … ».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  missions: [] as Record<string, unknown>[],
  factures: [] as Record<string, unknown>[],
}));

// Un client minimal : chaque table rend les lignes du banc, quelle que soit la chaîne de filtres.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const lignes = table === "incident_interventions" ? banc.missions : banc.factures;
      const q: Record<string, unknown> = {};
      for (const methode of ["select", "eq", "in", "order"]) q[methode] = () => q;
      q.then = (suite: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: lignes, error: null }).then(suite);
      return q;
    },
  }),
}));
vi.mock("../src/app/agence/[orgId]/incidents/validation-facture", () => ({ ValidationFacture: () => null }));

import {
  avantRendezVous,
  ecartEnMots,
  MARGE_RENDEZ_VOUS_ANTICIPE_MS,
  mentionEcartChronologie,
  phraseAvantLeGeste,
} from "@/lib/rendez-vous-anticipe";
import { AvertissementRendezVousAnticipe } from "../src/app/artisan/missions/[interventionId]/avertissement-rendez-vous";
import { FacturesIncident } from "../src/app/agence/[orgId]/incidents/factures-incident";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");
const heures = (n: number) => n * 3600 * 1000;
const dans = (ms: number) => new Date(Date.now() + ms).toISOString();
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("avantRendezVous : la marge de deux heures", () => {
  const debut = "2026-10-19T09:00:00.000Z";
  const t = (iso: string) => new Date(iso);

  it("avertit plus de deux heures avant le début du rendez-vous", () => {
    expect(avantRendezVous(debut, t("2026-10-14T09:00:00.000Z"))).toBe(true);
    expect(avantRendezVous(debut, t("2026-10-19T06:59:59.000Z"))).toBe(true);
  });
  it("n'avertit plus à deux heures pile, ni après", () => {
    expect(avantRendezVous(debut, t("2026-10-19T07:00:00.000Z"))).toBe(false);
    expect(avantRendezVous(debut, t("2026-10-19T08:30:00.000Z"))).toBe(false);
    expect(avantRendezVous(debut, t("2026-10-19T09:00:00.000Z"))).toBe(false);
    expect(avantRendezVous(debut, t("2026-10-20T09:00:00.000Z"))).toBe(false);
  });
  it("n'avertit pas sans rendez-vous confirmé (dépannage) ni avec une date illisible", () => {
    expect(avantRendezVous(null, t("2026-10-14T09:00:00.000Z"))).toBe(false);
    expect(avantRendezVous(undefined, t("2026-10-14T09:00:00.000Z"))).toBe(false);
    expect(avantRendezVous("pas une date", t("2026-10-14T09:00:00.000Z"))).toBe(false);
  });
  it("la marge est celle de la base : deux heures, écrites dans ecart_rendez_vous", () => {
    expect(MARGE_RENDEZ_VOUS_ANTICIPE_MS).toBe(heures(2));
    expect(lire("supabase/migrations/20261014301000_ecart_rendez_vous_chronologie.sql")).toContain("interval '2 hours'");
  });
});

describe("l'avertissement de l'artisan avant le geste", () => {
  const rendu = (debut: string | null, geste: "demarrer" | "terminer" | "facturer") =>
    renderToStaticMarkup(createElement(AvertissementRendezVousAnticipe, { debutPrevu: debut, finPrevue: debut ? dans(heures(80)) : null, geste }));

  it.each(["demarrer", "terminer", "facturer"] as const)("s'affiche pour « %s » trois jours avant le rendez-vous, et dit que rien n'est bloqué", (geste) => {
    const t = texte(rendu(dans(heures(72)), geste));
    expect(t).toContain("Rendez-vous confirmé avec le locataire");
    expect(t).toContain("rien ne vous en empêche");
    expect(t).toContain("dossier de l’incident");
  });

  it("ne s'affiche pas à moins de deux heures du rendez-vous", () => {
    expect(rendu(dans(heures(1)), "demarrer")).toBe("");
  });
  it("ne s'affiche pas une fois le rendez-vous passé", () => {
    expect(rendu(dans(-heures(3)), "terminer")).toBe("");
  });
  it("ne s'affiche pas sans rendez-vous confirmé", () => {
    expect(rendu(null, "facturer")).toBe("");
  });
  it("la phrase de chaque geste ne parle jamais d'interdiction", () => {
    for (const geste of ["demarrer", "terminer", "facturer"] as const) {
      expect(phraseAvantLeGeste(geste)).not.toMatch(/interdit|impossible|refus|bloqu/i);
    }
  });
});

describe("l'écart écrit à la chronologie", () => {
  const formater = (iso: string) => `[${iso}]`;

  it("se lit en jours quand l'écart dépasse une journée", () => {
    expect(
      mentionEcartChronologie({ avant_rendez_vous: true, debut_prevu: "2026-10-19T09:00:00Z", ecart_minutes: 7199 }, formater)
    ).toBe("4 jours avant le rendez-vous prévu le [2026-10-19T09:00:00Z]");
  });
  it("se lit en heures sous une journée", () => {
    expect(
      mentionEcartChronologie({ avant_rendez_vous: true, debut_prevu: "2026-10-19T09:00:00Z", ecart_minutes: 150 }, formater)
    ).toBe("2 h avant le rendez-vous prévu le [2026-10-19T09:00:00Z]");
  });
  it("ne dit rien d'un événement sans écart", () => {
    expect(mentionEcartChronologie({ intervention_id: "x" }, formater)).toBeNull();
    expect(mentionEcartChronologie(null, formater)).toBeNull();
    expect(mentionEcartChronologie({ avant_rendez_vous: false, debut_prevu: "2026-10-19T09:00:00Z" }, formater)).toBeNull();
    expect(mentionEcartChronologie({ avant_rendez_vous: true }, formater)).toBeNull();
  });
  it("ecartEnMots : 2 h, 23 h, 1 jour, 5 jours", () => {
    expect(ecartEnMots(120)).toBe("2 h");
    expect(ecartEnMots(1439)).toBe("23 h");
    expect(ecartEnMots(1440)).toBe("1 jour");
    expect(ecartEnMots(7200)).toBe("5 jours");
  });
  it("la chronologie de la fiche l'affiche pour le démarrage, le compte rendu et la facture", () => {
    const source = lire("src/app/agence/[orgId]/incidents/pane-incident.tsx");
    expect(source).toMatch(/case "intervention_demarree":\s*return mentionEcartChronologie\(d, formaterDateHeure\)/);
    expect(source).toMatch(/case "compte_rendu":[\s\S]*?mentionEcartChronologie\(d, formaterDateHeure\)/);
    expect(source).toMatch(/case "facture_deposee":[\s\S]*?mentionEcartChronologie\(d, formaterDateHeure\)/);
  });
});

describe("les écrans de l'artisan portent l'avertissement", () => {
  it("la mission : avant « Je démarre l'intervention » et avant « Rendre compte du travail »", () => {
    const source = lire("src/app/artisan/missions/[interventionId]/page.tsx");
    expect(source).toMatch(/<AvertissementRendezVousAnticipe[^>]*geste="demarrer"/);
    expect(source).toMatch(/<AvertissementRendezVousAnticipe[^>]*geste="terminer"/);
  });
  it("le compte rendu : au démarrage proposé et avant la photo du travail", () => {
    const source = lire("src/app/artisan/missions/[interventionId]/compte-rendu/page.tsx");
    expect(source).toMatch(/<AvertissementRendezVousAnticipe[^>]*geste="demarrer"/);
    expect(source).toMatch(/<AvertissementRendezVousAnticipe[^>]*geste="terminer"/);
  });
  it("la facture : avant le formulaire de dépôt", () => {
    const source = lire("src/app/artisan/missions/[interventionId]/facture/page.tsx");
    expect(source).toMatch(/<AvertissementRendezVousAnticipe[^>]*geste="facturer"/);
  });
  it("aucun de ces écrans ne retire le bouton : l'avertissement n'est pas une garde", () => {
    expect(lire("src/app/artisan/missions/[interventionId]/avertissement-rendez-vous.tsx")).not.toMatch(/disabled|redirect|notFound/);
  });
});

describe("l'écran de validation de la facture : rendez-vous prévu / intervention terminée", () => {
  const facture = { id: "f1", intervention_id: "m1", numero: "F-1", montant_ttc_cents: 48000, montant_reference_cents: 48000, ecart_justification: null, document_id: "d1", validee_le: null, decision_motif: null, imputation_validee: null };
  const afficher = async () => texte(renderToStaticMarkup((await FacturesIncident({ orgId: "org", incidentId: "inc" })) as never));

  it("écrit le rendez-vous prévu et la fin de l'intervention", async () => {
    banc.factures = [facture];
    banc.missions = [{ id: "m1", debut_prevu: "2026-10-19T07:00:00.000Z", terminee_le: "2026-10-19T09:30:00.000Z" }];
    const t = await afficher();
    expect(t).toContain("Rendez-vous prévu le");
    expect(t).toContain("Intervention terminée le");
    expect(t).not.toContain("avant le rendez-vous confirmé");
  });

  it("prévient quand l'artisan a terminé plus de deux heures avant le rendez-vous, sans bloquer la validation", async () => {
    banc.factures = [facture];
    banc.missions = [{ id: "m1", debut_prevu: "2026-10-19T07:00:00.000Z", terminee_le: "2026-10-14T10:00:00.000Z" }];
    const t = await afficher();
    expect(t).toContain("avant le rendez-vous confirmé avec le locataire");
    expect(t).toContain("Consulter la facture avant de décider");
  });

  it("sans rendez-vous confirmé, ne dit que la fin de l'intervention", async () => {
    banc.factures = [facture];
    banc.missions = [{ id: "m1", debut_prevu: null, terminee_le: "2026-10-14T10:00:00.000Z" }];
    const t = await afficher();
    expect(t).not.toContain("Rendez-vous prévu");
    expect(t).toContain("Intervention terminée le");
    expect(t).not.toContain("avant le rendez-vous confirmé");
  });
});
