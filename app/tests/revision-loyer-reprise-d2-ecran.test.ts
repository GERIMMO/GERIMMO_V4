/**
 * RÉVISION DU LOYER — reprise du lot D2 (24/11/2026) : le formulaire de révision, RENDU (pas seulement relu).
 *
 * Le formulaire n'était vérifié que par lecture de son code : un défaut d'exécution ne se voyait que dans le navigateur.
 * Ici il est rendu avec un bail révisable, pour tenir :
 *  - constat 6 : l'aperçu donne le premier terme révisé comme la base (jour d'enregistrement, dernier terme déjà appelé) ;
 *  - constat 1 : le champ de l'indice de l'année précédente n'apparaît que si l'année de l'indice dépasse de plus d'un an
 *    celle de l'indice de référence ; une révision déjà calculée ainsi le dit sur sa ligne.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ etatRevision: {} as { valeurs?: Record<string, string>; erreur?: string } }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [banc.etatRevision, () => {}, false] }));
vi.mock("@/app/actions/loyers", () => ({
  genererAppels: vi.fn(), ajouterEncaissement: vi.fn(), supprimerEncaissement: vi.fn(), emettreQuittances: vi.fn(), envoyerQuittance: vi.fn(),
  reviserLoyer: vi.fn(), ajouterRelance: vi.fn(), supprimerRelance: vi.fn(), regulariserCharges: vi.fn(),
}));
vi.mock("@/app/actions/indice-revision", () => ({ chercherIndiceRevision: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return { InputDateJour: (props: { name: string }) => createElement("input", { name: props.name, type: "date" }) };
});

import { FormulaireLoyers, type LigneEcheance, type Revision } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";

const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/\s+/g, " ");
const terme = (periode: string): LigneEcheance => ({ appel_id: `a-${periode}`, periode, date_echeance: periode, montant_du: 750, montant_couvert: 750, statut: "paye" });

/** Bail entré le 15/10/2024, indice de référence T2 2024 ; nous sommes le 24/11/2026. */
function rendre(extra: { echeancier?: LigneEcheance[]; revisions?: Revision[]; valeurs?: Record<string, string> } = {}) {
  banc.etatRevision = extra.valeurs ? { valeurs: extra.valeurs, erreur: "Indice du T2 2025 obligatoire" } : {};
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test", bailId: "bail-test", echeancier: extra.echeancier ?? [], encaissements: [], quittances: [],
    revisionIrl: true, irlReference: 100, irlTrimestre: "T2 2024", revisions: extra.revisions ?? [],
    relances: [], regularisations: [], chargesForfait: false, dateDebut: "2024-10-15", aujourdhui: "2026-11-24",
  }));
}

describe("formulaire de révision rendu — aperçu (constat 6)", () => {
  it("demande du jour : la révision prévue le 15/10/2026 s'appliquerait au terme de décembre 2026, date limite le 14/10/2027", () => {
    const html = rendre({ echeancier: [terme("2026-10-01"), terme("2026-11-01")] });
    const texte = texteDe(html);
    expect(texte).toContain("Demandée aujourd'hui, la révision prévue le 15/10/2026 s'appliquerait à partir du terme de décembre 2026 .");
    expect(texte).toContain("Date limite pour la demander : 14/10/2027 .");
  });

  it("terme de décembre déjà appelé : l'aperçu annonce janvier, comme la base", () => {
    const texte = texteDe(rendre({ echeancier: [terme("2026-11-01"), terme("2026-12-01")] }));
    expect(texte).toContain("s'appliquerait à partir du terme de janvier 2027 .");
  });
});

describe("formulaire de révision rendu — indice de l'année précédente (constat 1)", () => {
  it("avant toute saisie : pas de champ de l'année précédente", () => {
    const html = rendre();
    expect(html).not.toContain("data-irl-precedent");
    expect(html).not.toContain("data-revision-annee-sautee");
    expect(html).toContain('name="irl_nouveau"');
  });

  it("année de l'indice 2026 contre une référence de 2024 (saisie refusée puis reposée) : le champ « IRL du T2 2025 » et l'explication", () => {
    const html = rendre({ valeurs: { irl_nouveau: "106", irl_trimestre_numero: "2", irl_trimestre_annee: "2026", date_demande: "2026-11-24", irl_precedent: "103" } });
    expect(html).toContain("data-irl-precedent");
    expect(html).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 2025<\/label>/);
    expect(html).toMatch(/name="irl_precedent"[^>]*value="103"/);
    // Le rendu sépare les valeurs calculées du texte par des commentaires : on compare sans les espaces.
    expect(texteDe(html).replace(/\s/g, "")).toContain("L'indice de référence de ce bail est celui de 2024 : la révision d'une année au moins n'a pas été faite. Elle n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente (2025), à saisir ci-dessus. Le calcul devient : loyer actuel × IRL 2026 / IRL 2025.".replace(/\s/g, ""));
  });

  it("année de l'indice 2025 (un an d'écart) : cas normal, pas de champ", () => {
    const html = rendre({ valeurs: { irl_nouveau: "103", irl_trimestre_numero: "2", irl_trimestre_annee: "2025", date_demande: "2026-11-24" } });
    expect(html).not.toContain("data-irl-precedent");
  });

  it("après une révision, la référence est celle de la dernière révision ; une révision calculée sur un an le dit sur sa ligne", () => {
    const revision: Revision = { id: "r1", date_effet: "2026-11-24", date_echeance: "2026-10-15", date_demande: "2026-11-24", premier_terme: "2026-12-01",
      irl_trimestre: "T2 2026", ancien_loyer: 700, nouveau_loyer: 720.39, irl_reference: 103, irl_nouveau: 106, irl_reference_trimestre: "T2 2025" };
    const texte = texteDe(rendre({ revisions: [revision] }));
    expect(texte).toContain("calcul sur un an, avec l'indice du T2 2025 (révision de l'année précédente non faite)");
    expect(texte).toContain("loyer révisé appliqué à partir du terme de décembre 2026");
    // Référence T2 2026 : une saisie de 2027 est le cas normal.
    expect(rendre({ revisions: [revision], valeurs: { irl_trimestre_annee: "2027" } })).not.toContain("data-irl-precedent");
    expect(rendre({ revisions: [revision], valeurs: { irl_trimestre_annee: "2028" } })).toContain("data-irl-precedent");
  });
});
