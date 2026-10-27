import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { construireTachesAccueil } from "@/lib/taches-accueil-proprietaire";
import { CarteTachesProprietaire } from "@/components/carte-taches-proprietaire";
import { preparerVerificationsProprietaire } from "@/lib/verifications-proprietaire";

const base = "/espace/org";
const lot = { id: "lot", bien_id: "bien", nom: "Studio des Lilas", etat: "disponible" };
const diagnostic = { id: "dpe", lot_id: lot.id, lot, classe_dpe: "F", date_realisation: "2026-01-01" };
const demande = (patch: Partial<Extract<ActionDuJour, { source: "bail" }>> = {}): ActionDuJour => ({
  cle: "edl", source: "bail", nature: "Sur un bail", criticite: "normale", titre: "État des lieux à signer", detail: null,
  echeance: null, href: `${base}/baux/bail#edl`, ...patch,
});
const incident = (id: string, critique = false): Extract<ActionDuJour, { source: "alerte" }> => ({
  cle: id, source: "alerte", type: "incident", nature: "Incident", criticite: critique ? "critique" : "normale", titre: id,
  detail: null, echeance: "2026-10-27", href: `${base}/incidents?sel=incident-1`,
  alerte: { id, type: "incident", titre: id, criticite: critique ? "critique" : "normale", echeance: "2026-10-27", details: { incident_id: "incident-1", lot_id: lot.id }, created_at: "2026-10-26", assignee_account_id: null, assigned_all: true, escalades: null },
});
const preparer = (patch: Partial<Parameters<typeof construireTachesAccueil>[0]> = {}) => construireTachesAccueil({
  base, actions: [], lots: [lot], lotsSansBail: [], diagnostics: [], preparation: [], ...patch,
});

describe("tâches utiles sur l’accueil", () => {
  it("retire les priorités et toute répétition du même incident important", () => {
    expect(preparer({ actions: [incident("normale"), incident("prioritaire", true), demande()] }).map(t => t.cle)).toEqual(["edl"]);
  });

  it("réunit les alertes du même incident en une tâche avec sa fiche exacte", () => {
    const taches = preparer({ actions: [incident("a"), incident("b")] });
    expect(taches).toHaveLength(1);
    expect(taches[0]).toMatchObject({ href: `${base}/incidents?sel=incident-1`, contexte: lot.nom, geste: "Voir l’incident", echeance: "2026-10-27" });
  });

  it("conserve les cibles précises EDL, document et alerte sans destination spécialisée", () => {
    const alerte = { ...incident("sans-fiche"), href: null };
    const taches = preparer({ actions: [demande(), demande({ cle: "piece", href: `${base}/documents?sel=piece` }), alerte] });
    expect(taches.map(t => [t.href, t.geste])).toEqual([
      [`${base}/baux/bail#edl`, "Voir l’état des lieux"], [`${base}/documents?sel=piece`, "Voir le document"], [`${base}/alertes?traiter=sans-fiche`, "Traiter"],
    ]);
  });

  it.each(["normale", "critique"] as const)("ne répète pas un DPE déjà signalé dans une demande %s", criticite => {
    const taches = preparer({ actions: [demande({ cle: "dpe", href: `${base}/parc/bien/lots/lot#diagnostics`, criticite })], diagnostics: [diagnostic] });
    expect(taches).toHaveLength(criticite === "critique" ? 0 : 1);
    expect(taches.some(t => t.cle === "surveillance-dpe")).toBe(false);
  });

  it("regroupe la surveillance DPE et les locations, sans inventer une préparation réussie", () => {
    const lots = [lot, { ...lot, id: "pret" }, { ...lot, id: "illisible" }, { ...lot, id: "non-lu" }];
    const taches = preparer({ lotsSansBail: lots, diagnostics: [diagnostic], preparation: [
      { lot, blocages: ["DPE manquant"] }, { lot: lots[1], blocages: [] }, { lot: lots[2], blocages: null },
    ] });
    expect(taches).toHaveLength(5);
    expect(taches[0]).toMatchObject({ href: `${base}/parc/bien/lots/lot#diagnostics`, contexte: lot.nom, detail: "DPE F" });
    expect(taches.find(t => t.cle === "location-pret")).toMatchObject({ titre: "Créer le bail", href: `${base}/parc/bien/lots/pret#baux` });
    expect(taches.find(t => t.cle === "location-illisible")).toMatchObject({ titre: "Préparer la location", detail: "Préparation à vérifier" });
    expect(taches.find(t => t.cle === "location-non-lu")).toMatchObject({ titre: "Préparer la location", detail: null });
  });

  it("ne réintroduit pas les loyers retirés par la synthèse commune", () => {
    const verifications = preparerVerificationsProprietaire({ aujourdHui: "2026-10-27", loyersIndisponibles: false,
      actions: [demande({ cle: "impaye-bail", criticite: "critique" }), demande()],
      lignesLoyers: [{ appel_id: "appel", bail_id: "bail", lot_nom: lot.nom, locataire: "Camille", periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 800, montant_couvert: 0, non_recu_signale_le: null }],
    });
    expect(verifications.rappels.dus).toHaveLength(1);
    expect(preparer({ actions: verifications.actions }).map(t => t.cle)).toEqual(["edl"]);
  });
});

describe("carte de tâches sans écran intermédiaire", () => {
  const rendre = (patch: Partial<Parameters<typeof CarteTachesProprietaire>[0]> = {}) => renderToStaticMarkup(createElement(CarteTachesProprietaire, {
    taches: [], base, indisponible: false, prioritesPresentes: false, ...patch,
  }));

  it("montre les cinq premières tâches puis conserve les autres dans un dépliage local", () => {
    const taches = preparer({ actions: Array.from({ length: 7 }, (_, i) => demande({ cle: `edl-${i}`, href: `${base}/baux/${i}#edl` })) });
    const html = rendre({ taches });
    expect(html.split("<details")[0].match(/class="[^"]*tache[^"]*" href=|href="\/espace\/org\/baux/g)).toHaveLength(5);
    expect(html).toContain("Voir les 2 autres tâches");
    expect(html).toContain('href="/espace/org/baux/6#edl"');
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('id="taches-proprietaire"');
    expect(html).toContain('tabindex="-1"');
  });

  it("ne prétend jamais qu’il ne reste rien quand la lecture échoue", () => {
    const html = rendre({ indisponible: true });
    expect(html).toContain("La liste peut être incomplète");
    expect(html).not.toContain("Aucune tâche");
    expect(html).not.toContain("0 tâche");
    expect(html).toContain(`href="${base}/alertes"`);
  });

  it("affiche encore les tâches connues quand une autre source est indisponible", () => {
    const html = rendre({ indisponible: true, taches: preparer({ actions: [demande()] }) });
    expect(html).toContain('aria-label="1 tâche connue"');
    expect(html).toContain("État des lieux à signer");
    expect(html).toContain("La liste peut être incomplète");
  });

  it("distingue le repos des autres tâches et conserve les colocations", () => {
    expect(rendre()).toContain("Aucune tâche détectée pour le moment.");
    expect(rendre({ prioritesPresentes: true })).toContain("Aucune autre tâche à traiter pour le moment.");
    const html = rendre({ chambresSansBail: 2 });
    expect(html).toContain("2 chambres sans bail en cours");
    expect(html).toContain(`href="${base}/parc"`);
    expect(html).not.toContain("Aucune tâche");
  });
});
