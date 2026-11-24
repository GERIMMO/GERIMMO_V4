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
function rendre(extra: { echeancier?: LigneEcheance[]; revisions?: Revision[]; valeurs?: Record<string, string>; aujourdhui?: string; irlTrimestre?: string | null; dateDebut?: string } = {}) {
  banc.etatRevision = extra.valeurs ? { valeurs: extra.valeurs, erreur: "Indice du T2 2025 obligatoire" } : {};
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test", bailId: "bail-test", echeancier: extra.echeancier ?? [], encaissements: [], quittances: [],
    revisionIrl: true, irlReference: 100, irlTrimestre: extra.irlTrimestre === undefined ? "T2 2024" : extra.irlTrimestre, revisions: extra.revisions ?? [],
    relances: [], regularisations: [], chargesForfait: false, dateDebut: extra.dateDebut ?? "2024-10-15", aujourdhui: extra.aujourdhui ?? "2026-11-24",
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

  // Troisième reprise du lot D2 (24/11) : ce bail porte son indice d'origine (T2 2024, bail du 15/10/2024). La base n'accepte
  // plus que l'indice de la date de révision (T2 2026 pour le 15/10/2026) : une saisie de 2027 est refusée pour cette
  // raison, jamais faute d'indice précédent. Le formulaire n'affiche donc plus le champ « IRL du T2 2026 » ; il dit
  // l'indice attendu. (Avant : le champ paraissait, pour une saisie que la base acceptait encore.)
  it("année de l'indice 2027 saisie alors que la révision du 15/10/2026 attend T2 2026 : pas de champ de l'année précédente, l'indice attendu est dit", () => {
    const html = rendre({ revisions: [premiereAnnee], valeurs: { irl_nouveau: "106", irl_trimestre_numero: "2", irl_trimestre_annee: "2027", date_demande: "2026-11-24", irl_precedent: "103" } });
    expect(html).not.toContain("data-irl-precedent");
    expect(html).toContain("data-indice-attendu");
    expect(texteDe(html).replace(/\s/g, "")).toContain("Pour la révision prévue le 15/10/2026, l'indice attendu est celui du T2 2026 : le trimestre de l'indice du bail, une année de plus par année de bail écoulée. Un indice d'une autre année est refusé.".replace(/\s/g, ""));
  });

  it("bail repris en cours sans indice d'origine (début 15/10/2020, indice du bail T2 2023) : année 2026 saisie, deux ans après — le champ « IRL du T2 2025 » et l'explication", () => {
    const html = rendre({ dateDebut: "2020-10-15", irlTrimestre: "T2 2023", valeurs: { irl_nouveau: "106", irl_trimestre_numero: "2", irl_trimestre_annee: "2026", date_demande: "2026-11-24", irl_precedent: "103" } });
    expect(html).toContain("data-irl-precedent");
    // Le rendu sépare les valeurs calculées du texte par des commentaires : on les retire avant de comparer.
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 2025<\/label>/);
    expect(html).toMatch(/name="irl_precedent"[^>]*value="103"/);
    expect(texteDe(html).replace(/\s/g, "")).toContain("Aucune révision n'est enregistrée pour l'année de bail précédente, ou l'indice de référence de ce bail est plus ancien. Une révision qui n'a pas été faite n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente (2025), à saisir ci-dessus. Le calcul devient : loyer actuel × IRL 2026 / IRL 2025.".replace(/\s/g, ""));
    // Pour ce bail, la base accepte plusieurs années : aucun indice « attendu » n'est affirmé.
    expect(html).not.toContain("data-indice-attendu");
  });

  it("point 3 — bail repris en cours, révisé ailleurs l'an dernier (indice du bail T2 2025) : pas de champ, avant toute saisie comme avec l'année 2026 saisie", () => {
    const repris = { dateDebut: "2020-10-15", irlTrimestre: "T2 2025" };
    expect(rendre(repris)).not.toContain("data-irl-precedent");
    expect(rendre({ ...repris, valeurs: { irl_trimestre_annee: "2026" } })).not.toContain("data-irl-precedent");
    // Une année de plus : l'indice du bail n'est plus celui de l'année précédente, le champ revient.
    expect(rendre({ ...repris, valeurs: { irl_trimestre_annee: "2027" } })).toContain("data-irl-precedent");
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
    // Un an plus tard (24/11/2027), la deuxième année de bail est révisée (référence T2 2026) : cas normal, pas de champ,
    // quelle que soit l'année saisie. Troisième reprise : pour ce bail (indice d'origine), une saisie de 2028 n'affiche
    // plus le champ — la base la refuse parce que la révision du 15/10/2027 attend T2 2027, que le formulaire annonce.
    for (const annee of ["2027", "2028"]) {
      const html = rendre({ revisions: [revision], aujourdhui: "2027-11-24", valeurs: { irl_trimestre_annee: annee } });
      expect(html, annee).not.toContain("data-irl-precedent");
      expect(texteDe(html), annee).toContain("l'indice attendu est celui du T2 2027");
    }
    // La révision de la date en cours est enregistrée : le loyer porte déjà son indice, rien n'est annoncé.
    expect(rendre({ revisions: [revision] })).not.toContain("data-indice-attendu");
  });
});

describe("formulaire de révision rendu — seconde reprise : l'année non faite se reconnaît à l'année de bail", () => {
  // Troisième reprise du lot D2 (24/11) : pour ce bail (indice d'origine T2 2024), l'année attendue est connue avant toute
  // saisie — T2 2026 pour la révision du 15/10/2026. Le champ paraît toujours avant toute saisie, et nomme désormais
  // l'indice demandé (T2 2025) au lieu de « de l'année précédente ».
  it("deuxième année de bail sans révision la première : le champ paraît avant toute saisie, avec l'année de l'indice attendu", () => {
    const html = rendre();
    expect(html).toContain("data-irl-precedent");
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 2025<\/label>/);
    const texte = texteDe(html).replace(/\s/g, "");
    expect(texte).toContain("Aucune révision n'est enregistrée pour l'année de bail précédente, ou l'indice de référence de ce bail est plus ancien. Une révision qui n'a pas été faite n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente (2025), à saisir ci-dessus. Le calcul devient : loyer actuel × IRL 2026 / IRL 2025.".replace(/\s/g, ""));
    expect(texte).toContain("Pour la révision prévue le 15/10/2026, l'indice attendu est celui du T2 2026".replace(/\s/g, ""));
    expect(texte).not.toContain("NaN");
  });

  it("trimestre du bail illisible : le champ paraît avant toute saisie, sans année devinée", () => {
    const html = rendre({ irlTrimestre: null });
    expect(html).toContain("data-irl-precedent");
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du même trimestre de l’année précédente<\/label>/);
    expect(html).not.toContain("data-indice-attendu");
    expect(texteDe(html)).not.toContain("NaN");
  });

  // Avant la troisième reprise, ce test affirmait « IRL du T2 2024 » et « IRL 2025 / IRL 2024 » pour une saisie de 2025 :
  // la base acceptait alors cet indice pour la révision du 15/10/2026. Elle le refuse désormais (la révision du 15/10/2026
  // attend T2 2026) : le formulaire garde le champ et le calcul de l'indice attendu, quelle que soit l'année saisie.
  it("même bail, année de l'indice 2025 saisie (l'indice attendu est T2 2026) : le champ et le calcul restent ceux de l'indice attendu", () => {
    const html = rendre({ valeurs: { irl_nouveau: "103", irl_trimestre_numero: "2", irl_trimestre_annee: "2025", date_demande: "2026-11-24" } });
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<label[^>]*for="irl-precedent"[^>]*>IRL du T2 2025<\/label>/);
    expect(texteDe(html).replace(/\s/g, "")).toContain("Le calcul devient : loyer actuel × IRL 2026 / IRL 2025.".replace(/\s/g, ""));
  });
});
