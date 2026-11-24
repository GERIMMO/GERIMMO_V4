/**
 * RÉVISION DU LOYER — reprise du lot D2 (24/11/2026) : le formulaire de révision, RENDU (pas seulement relu).
 *
 * Le formulaire n'était vérifié que par lecture de son code : un défaut d'exécution ne se voyait que dans le navigateur.
 * Ici il est rendu avec un bail révisable, pour tenir :
 *  - constat 6 : l'aperçu donne le premier terme révisé comme la base (jour d'enregistrement, dernier terme déjà appelé) ;
 *  - constat 1 : le champ de l'indice de l'année précédente n'apparaît que si l'année de l'indice dépasse de plus d'un an
 *    celle de l'indice de référence ; une révision déjà calculée ainsi le dit sur sa ligne.
 *
 * Seconde reprise du lot D2 (24/11/2026) : ce champ apparaît aussi, avant toute saisie, quand la révision de l'année de bail
 * précédente manque (même règle que la base, migration 20261124150000). Le bail rendu par défaut ici (entré le 15/10/2024,
 * vu le 24/11/2026, sans révision) est justement dans ce cas : les tests du « cas normal » lui donnent désormais la
 * révision de sa première année, et le cas de l'année de bail non révisée a ses propres tests à la fin.
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

/** La révision de la première année de bail (15/10/2025), faite à l'heure avec l'indice T2 2025 : le bail est alors à jour. */
const premiereAnnee: Revision = { id: "r0", date_effet: "2025-10-15", date_echeance: "2025-10-15", date_demande: "2025-10-15", premier_terme: "2025-11-01",
  irl_trimestre: "T2 2025", ancien_loyer: 686, nouveau_loyer: 700, irl_reference: 98, irl_nouveau: 100, irl_reference_trimestre: null };

/** Bail entré le 15/10/2024, indice de référence T2 2024 ; nous sommes le 24/11/2026. */
function rendre(extra: { echeancier?: LigneEcheance[]; revisions?: Revision[]; valeurs?: Record<string, string>; aujourdhui?: string } = {}) {
  banc.etatRevision = extra.valeurs ? { valeurs: extra.valeurs, erreur: "Indice du T2 2025 obligatoire" } : {};
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test", bailId: "bail-test", echeancier: extra.echeancier ?? [], encaissements: [], quittances: [],
    revisionIrl: true, irlReference: 100, irlTrimestre: "T2 2024", revisions: extra.revisions ?? [],
    relances: [], regularisations: [], chargesForfait: false, dateDebut: "2024-10-15", aujourdhui: extra.aujourdhui ?? "2026-11-24",
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
  it("bail à jour (première année révisée), avant toute saisie : pas de champ de l'année précédente", () => {
    const html = rendre({ revisions: [premiereAnnee] });
    expect(html).not.toContain("data-irl-precedent");
    expect(html).not.toContain("data-revision-annee-sautee");
    expect(html).toContain('name="irl_nouveau"');
  });

  it("année de l'indice 2027 contre une référence de 2025 (saisie refusée puis reposée) : le champ « IRL du T2 2026 » et l'explication", () => {
    const html = rendre({ revisions: [premiereAnnee], valeurs: { irl_nouveau: "106", irl_trimestre_numero: "2", irl_trimestre_annee: "2027", date_demande: "2026-11-24", irl_precedent: "103" } });
    expect(html).toContain("data-irl-precedent");
    // Le rendu sépare les valeurs calculées du texte par des commentaires : on les retire avant de comparer.
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 2026<\/label>/);
    expect(html).toMatch(/name="irl_precedent"[^>]*value="103"/);
    expect(texteDe(html).replace(/\s/g, "")).toContain("Aucune révision n'est enregistrée pour l'année de bail précédente, ou l'indice de référence de ce bail est plus ancien. Une révision qui n'a pas été faite n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente (2026), à saisir ci-dessus. Le calcul devient : loyer actuel × IRL 2027 / IRL 2026.".replace(/\s/g, ""));
  });

  it("année de l'indice 2026 (un an d'écart avec la référence de 2025) : cas normal, pas de champ", () => {
    const html = rendre({ revisions: [premiereAnnee], valeurs: { irl_nouveau: "103", irl_trimestre_numero: "2", irl_trimestre_annee: "2026", date_demande: "2026-11-24" } });
    expect(html).not.toContain("data-irl-precedent");
  });

  it("première année de bail (vue le 24/11/2025), sans aucune révision : cas normal, pas de champ", () => {
    expect(rendre({ aujourdhui: "2025-11-24" })).not.toContain("data-irl-precedent");
    expect(rendre({ aujourdhui: "2025-11-24", valeurs: { irl_trimestre_annee: "2025" } })).not.toContain("data-irl-precedent");
  });

  it("après une révision, la référence est celle de la dernière révision ; une révision calculée sur un an le dit sur sa ligne", () => {
    const revision: Revision = { id: "r1", date_effet: "2026-11-24", date_echeance: "2026-10-15", date_demande: "2026-11-24", premier_terme: "2026-12-01",
      irl_trimestre: "T2 2026", ancien_loyer: 700, nouveau_loyer: 720.39, irl_reference: 103, irl_nouveau: 106, irl_reference_trimestre: "T2 2025" };
    const texte = texteDe(rendre({ revisions: [revision] }));
    // Seconde reprise : la ligne dit ce qui a servi au calcul, sans affirmer qu'une révision « n'a pas été faite ».
    expect(texte).toContain("calcul sur un an, avec l'indice du T2 2025 (même trimestre, année précédente)");
    expect(texte).toContain("loyer révisé appliqué à partir du terme de décembre 2026");
    // Un an plus tard (24/11/2027), la deuxième année de bail est révisée (référence T2 2026) : une saisie de 2027 est le
    // cas normal, une saisie de 2028 dépasse la référence de plus d'un an.
    expect(rendre({ revisions: [revision], aujourdhui: "2027-11-24", valeurs: { irl_trimestre_annee: "2027" } })).not.toContain("data-irl-precedent");
    expect(rendre({ revisions: [revision], aujourdhui: "2027-11-24", valeurs: { irl_trimestre_annee: "2028" } })).toContain("data-irl-precedent");
  });
});

describe("formulaire de révision rendu — seconde reprise : l'année non faite se reconnaît à l'année de bail", () => {
  it("deuxième année de bail sans révision la première : le champ paraît avant toute saisie, sans année devinée", () => {
    const html = rendre();
    expect(html).toContain("data-irl-precedent");
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 de l’année précédente<\/label>/);
    const texte = texteDe(html).replace(/\s/g, "");
    expect(texte).toContain("Aucune révision n'est enregistrée pour l'année de bail précédente, ou l'indice de référence de ce bail est plus ancien. Une révision qui n'a pas été faite n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente, à saisir ci-dessus.".replace(/\s/g, ""));
    expect(texte).not.toContain("NaN");
  });

  it("même bail, année de l'indice 2025 saisie (un an après la référence lue, T2 2024) : le champ reste, la base l'exigerait", () => {
    const html = rendre({ valeurs: { irl_nouveau: "103", irl_trimestre_numero: "2", irl_trimestre_annee: "2025", date_demande: "2026-11-24" } });
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 2024<\/label>/);
    expect(texteDe(html).replace(/\s/g, "")).toContain("Le calcul devient : loyer actuel × IRL 2025 / IRL 2024.".replace(/\s/g, ""));
  });
});
