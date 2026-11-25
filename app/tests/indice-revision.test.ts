/**
 * L'INDICE DE LA RÉVISION ANNUELLE, PROPOSÉ DEPUIS LA SÉRIE OFFICIELLE — audit palier 1 du 22/11/2026, P1-13.
 *
 * Le défaut : le bailleur relevait l'indice sur le site de l'Insee et le tapait à chaque révision, alors que l'outil
 * public de Gerimmo lisait déjà la série. Tient :
 *  1. le choix de l'indice : même trimestre que l'indice de référence, année de la DATE DE RÉVISION à laquelle la demande
 *     est rattachée (troisième reprise du lot D2, 24/11/2026 : plus « la dernière année publiée ») ; la référence est
 *     celle de la dernière révision, à défaut celle du bail — comme la base ; rien n'est proposé quand le bail ne dit
 *     pas quel trimestre chercher, quand l'indice de l'échéance n'est pas publié, ou quand la série est illisible ;
 *  2. l'action : réservée à qui gère le bail, lecture seule, ne lit l'Insee que si le bail dit quoi chercher, et rend
 *     le jour de la lecture ;
 *  3. le message : l'indice, sa source et sa date ; l'écart avec l'indice de référence du bail quand il y en a un ;
 *     chaque cas sans proposition renvoie à la saisie à la main ;
 *  4. AUCUNE valeur d'indice n'est écrite dans le code de l'application : les valeurs de ce fichier sont fictives.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type Ligne } from "./faux-postgrest";

const banc = vi.hoisted(() => ({ acces: vi.fn(), serie: vi.fn(), aujourdhui: "2026-11-22" }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: banc.acces }));
vi.mock("@/lib/outils/irl-insee", async () => ({
  ...await vi.importActual<typeof import("@/lib/outils/irl-insee")>("@/lib/outils/irl-insee"),
  chargerSerieIrl: banc.serie,
}));
vi.mock("@/lib/ged", async () => ({ ...await vi.importActual<typeof import("@/lib/ged")>("@/lib/ged"), aujourdhuiParis: () => banc.aujourdhui }));

import { chercherIndiceRevision } from "@/app/actions/indice-revision";
import { MessageIndicePropose } from "@/app/agence/[orgId]/baux/[bailId]/indice-propose";
import { anneeTrimestreIrl, indiceAttendu, indiceEnClair, lendemainDuTrimestre, memeIndice, proposerIndice } from "@/lib/indice-revision";
import { indicePrecedentExige } from "@/lib/baux";
import type { ObservationIrl } from "@/lib/outils/irl-insee";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
// Série FICTIVE (valeurs rondes, sans rapport avec les indices publiés) : on teste le choix, pas les chiffres.
const SERIE: ObservationIrl[] = [
  { trimestre: "T1", annee: 2024, valeur: 200.1 }, { trimestre: "T2", annee: 2024, valeur: 200.2 },
  { trimestre: "T3", annee: 2024, valeur: 200.3 }, { trimestre: "T4", annee: 2024, valeur: 200.4 },
  { trimestre: "T1", annee: 2025, valeur: 210.1 }, { trimestre: "T2", annee: 2025, valeur: 210.2 },
  { trimestre: "T3", annee: 2025, valeur: 210.3 }, { trimestre: "T4", annee: 2025, valeur: 210.4 },
  { trimestre: "T1", annee: 2026, valeur: 220.1 }, { trimestre: "T2", annee: 2026, valeur: 220.25 },
];
const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

describe("choix de l'indice dans la série", () => {
  it("l'année se lit dans le libellé du trimestre, comme le fait la base", () => {
    expect(anneeTrimestreIrl("T2 2025")).toBe(2025);
    expect(anneeTrimestreIrl("2e trimestre 2024")).toBe(2024);
    expect(anneeTrimestreIrl("deuxième trimestre")).toBeNull();
    expect(anneeTrimestreIrl(null)).toBeNull();
    expect(anneeTrimestreIrl("T2 3025")).toBeNull();
  });

  // Troisième reprise du lot D2 (24/11/2026) : `proposerIndice` reçoit le début du bail et la date de la demande, et
  // propose l'indice de la date de révision à laquelle la demande est rattachée. Les tests d'avant affirmaient « la
  // dernière année publiée » : c'était le défaut relevé par le relecteur (preuve J1), ils sont réécrits sur la règle.
  const proposer = (o: Partial<Parameters<typeof proposerIndice>[0]>) =>
    proposerIndice({ serie: SERIE, irlTrimestreBail: "T2 2025", irlValeurBail: 210.2, revisions: [], dateDebut: "2025-07-20", dateDemande: "2026-11-22", ...o });

  it("sans révision passée : même trimestre que le bail, année de la date de révision (une année après l'indice du bail)", () => {
    expect(proposer({})).toEqual({
      etat: "propose", trimestre: 2, annee: 2026, valeur: 220.25, referencePubliee: 210.2, referenceBail: 210.2, anneeReference: 2025,
      echeance: "2026-07-20", precedent: null,
    });
    expect(proposer({ irlTrimestreBail: "3e trimestre 2024", irlValeurBail: 200.3, dateDebut: "2024-11-10", dateDemande: "2025-11-22" }))
      .toMatchObject({ etat: "propose", trimestre: 3, annee: 2025, valeur: 210.3, echeance: "2025-11-10" });
  });

  it("preuve J1 du relecteur : demande tardive — l'indice proposé est celui de l'échéance, PAS le dernier publié", () => {
    // Bail du 01/01/2025, indice du bail T3 2024. Le 28/10/2026, la révision encore possible est celle du 01/01/2026 :
    // son indice est le T3 2025. Le T3 2026, déjà publié, est celui de la révision suivante (01/01/2027).
    const serie: ObservationIrl[] = [...SERIE, { trimestre: "T3", annee: 2026, valeur: 220.3 }];
    const bail = { serie, irlTrimestreBail: "T3 2024", irlValeurBail: 200.3, dateDebut: "2025-01-01" };
    expect(proposer({ ...bail, dateDemande: "2026-10-28" })).toMatchObject({ etat: "propose", trimestre: 3, annee: 2025, valeur: 210.3, echeance: "2026-01-01", precedent: null });
    // À l'heure et le dernier jour du délai : le même indice. Le lendemain (échéance suivante) : celui de l'année d'après.
    for (const jour of ["2026-01-01", "2026-12-31"]) expect(proposer({ ...bail, dateDemande: jour })).toMatchObject({ etat: "propose", annee: 2025 });
    expect(proposer({ ...bail, dateDemande: "2027-01-01" })).toMatchObject({ etat: "propose", annee: 2026, valeur: 220.3, echeance: "2027-01-01", precedent: { annee: 2025, valeur: 210.3 } });
    // Avant la première date de révision : l'indice de cette première date.
    expect(proposer({ ...bail, dateDemande: "2025-06-01" })).toMatchObject({ etat: "propose", annee: 2025, echeance: "2026-01-01" });
  });

  it("preuve J2 : libellé du bail sans année (« T3 ») — rien n'est proposé, comme avant (la saisie reste à la main)", () => {
    expect(proposer({ irlTrimestreBail: "T3", dateDebut: "2025-01-01", dateDemande: "2026-10-28" })).toEqual({ etat: "sans_reference" });
  });

  it("après une révision : la référence est l'indice de la DERNIÈRE révision, son année aussi", () => {
    const revisions = [
      { date_effet: "2025-07-20", irl_trimestre: "T2 2025", irl_nouveau: "210.20" },
      { date_effet: "2024-07-20", irl_trimestre: "T2 2024", irl_nouveau: 200.2 },
    ];
    expect(proposer({ irlTrimestreBail: "T2 2023", irlValeurBail: 190, dateDebut: "2023-07-20", revisions })).toEqual({
      etat: "propose", trimestre: 2, annee: 2026, valeur: 220.25, referencePubliee: 210.2, referenceBail: 210.2, anneeReference: 2025,
      echeance: "2026-07-20", precedent: null, // une révision par an : cas normal, rien de plus à fournir
    });
  });

  it("reprise D2 — année sautée : l'indice du même trimestre de l'année précédente est rendu ; absent de la série, il reste à saisir", () => {
    // Bail du 20/07/2024 (T2 2024), aucune révision : le 22/11/2026, la révision est celle du 20/07/2026 (T2 2026) et la
    // base exige l'indice du T2 2025, lu dans la série.
    const bail = { irlTrimestreBail: "T2 2024", irlValeurBail: 200.2, dateDebut: "2024-07-20" };
    expect(proposer(bail)).toMatchObject({ etat: "propose", annee: 2026, anneeReference: 2024, precedent: { annee: 2025, valeur: 210.2 } });
    // Série amputée de 2025 : l'année précédente est dite, sans valeur supposée.
    expect(proposer({ ...bail, serie: SERIE.filter((i) => i.annee !== 2025) })).toMatchObject({ etat: "propose", annee: 2026, precedent: { annee: 2025, valeur: null } });
    // La même demande un an plus tôt (première date de révision) : rien de plus.
    expect(proposer({ ...bail, dateDemande: "2025-11-22" })).toMatchObject({ etat: "propose", annee: 2025, precedent: null });
  });

  it("bail ancien sans trimestre lisible : sa première révision a fixé le trimestre ; l'année est la dernière terminée à la date de révision", () => {
    const revisions = [{ date_effet: "2025-04-01", irl_trimestre: "T1 2025", irl_nouveau: 210.1 }];
    expect(proposer({ irlTrimestreBail: null, irlValeurBail: null, dateDebut: "2020-04-01", revisions }))
      .toMatchObject({ etat: "propose", trimestre: 1, annee: 2026, valeur: 220.1, anneeReference: 2025, echeance: "2026-04-01", precedent: null });
  });

  it("point 3 — bail repris en cours, révisé ailleurs l'an dernier, indice du bail à jour : indice de l'échéance, sans indice précédent", () => {
    // Bail du 01/02/2021 repris avec l'indice T4 2025 (révision de 02/2026 faite ailleurs). Le 10/02/2027 : T4 2026.
    const serie: ObservationIrl[] = [...SERIE, { trimestre: "T4", annee: 2026, valeur: 220.4 }];
    const bail = { serie, irlTrimestreBail: "T4 2025", irlValeurBail: 210.4, dateDebut: "2021-02-01" };
    expect(proposer({ ...bail, dateDemande: "2027-02-10" })).toMatchObject({ etat: "propose", trimestre: 4, annee: 2026, valeur: 220.4, echeance: "2027-02-01", precedent: null });
    // Avant cette date, l'indice de l'échéance en cours (01/02/2026) est déjà celui du bail : rien à réviser.
    expect(proposer({ ...bail, dateDemande: "2026-11-22" })).toEqual({ etat: "deja_applique", trimestre: 4, annee: 2025, echeance: "2026-02-01" });
    // Le même bail gardé à son indice d'origine (T4 2020) : même indice proposé, et l'indice précédent rendu.
    expect(proposer({ ...bail, irlTrimestreBail: "T4 2020", dateDemande: "2027-02-10" })).toMatchObject({ etat: "propose", annee: 2026, precedent: { annee: 2025, valeur: 210.4 } });
  });

  it("rien à proposer : trimestre, année ou début du bail illisibles, indice de l'échéance non publié ou déjà appliqué, série illisible", () => {
    expect(proposer({ irlTrimestreBail: null })).toEqual({ etat: "sans_reference" });
    expect(proposer({ irlTrimestreBail: "deuxième trimestre" })).toEqual({ etat: "sans_reference" });
    expect(proposer({ dateDebut: null })).toEqual({ etat: "sans_reference" });
    // Après une révision dont le trimestre n'a pas d'année lisible, la base non plus ne sait pas situer la référence.
    expect(proposer({ irlTrimestreBail: "T2 2024", dateDebut: "2024-07-20", revisions: [{ date_effet: "2025-07-20", irl_trimestre: "T2", irl_nouveau: 210 }] }))
      .toEqual({ etat: "sans_reference" });
    expect(proposer({ irlTrimestreBail: "T2 2026", dateDebut: "2026-07-20", dateDemande: "2027-08-01" })).toEqual({ etat: "pas_encore_publie", trimestre: 2, annee: 2027, anneeReference: 2026 });
    // La révision de cette date est déjà enregistrée : son indice est la référence.
    expect(proposer({ revisions: [{ date_effet: "2026-07-20", irl_trimestre: "T2 2026", irl_nouveau: 220.25 }] })).toEqual({ etat: "deja_applique", trimestre: 2, annee: 2026, echeance: "2026-07-20" });
    expect(proposer({ serie: null })).toEqual({ etat: "indisponible" });
    expect(proposer({ serie: [] })).toEqual({ etat: "indisponible" });
  });

  it("l'indice de référence du bail absent de la série, ou non renseigné : la proposition reste, sans comparaison", () => {
    const p = proposer({ serie: SERIE.slice(8), irlValeurBail: null });
    expect(p).toMatchObject({ etat: "propose", valeur: 220.25, referencePubliee: null, referenceBail: null });
  });

  it("indice attendu, pour chaque trimestre et chaque mois de début de bail : celui du même trimestre, une année de plus par année de bail", () => {
    // Le bail porte le dernier indice de ce trimestre terminé à son début (repère de calendrier). À chaque échéance,
    // l'indice attendu est celui de l'année suivante, que la demande soit faite à l'heure, en retard ou le dernier jour.
    for (const q of [1, 2, 3, 4]) for (let mois = 1; mois <= 12; mois++) {
      const debut = `2024-${String(mois).padStart(2, "0")}-15`;
      const anneeBail = lendemainDuTrimestre(q, 2024) <= debut ? 2024 : 2023;
      const mm = debut.slice(4);
      for (const [demande, n] of [[`2025${mm}`, 1], [`2025-12-31`, 1], [`2026${mm}`, 2]] as const) {
        if (demande < `2025${mm}`) continue;
        const attendu = indiceAttendu({ dateDebut: debut, irlTrimestreBail: `T${q} ${anneeBail}`, revisions: [], dateDemande: demande });
        expect(attendu, `T${q} ${anneeBail}, bail du ${debut}, demande du ${demande}`).toEqual({ trimestre: q, annee: anneeBail + n, echeance: `${2024 + n}${mm}`, exact: true });
        // Libellé sans année : la même année est retrouvée par le calendrier, mais elle n'est plus la seule acceptée.
        expect(indiceAttendu({ dateDebut: debut, irlTrimestreBail: `T${q}`, revisions: [], dateDemande: demande }))
          .toEqual({ trimestre: q, annee: anneeBail + n, echeance: `${2024 + n}${mm}`, exact: false });
      }
    }
    expect(lendemainDuTrimestre(1, 2025)).toBe("2025-04-01");
    expect(lendemainDuTrimestre(4, 2025)).toBe("2026-01-01");
    // Bail du 29 février : échéance le 28 les années ordinaires.
    expect(indiceAttendu({ dateDebut: "2024-02-29", irlTrimestreBail: "T4 2023", revisions: [], dateDemande: "2025-02-28" })).toEqual({ trimestre: 4, annee: 2024, echeance: "2025-02-28", exact: true });
    expect(indiceAttendu({ dateDebut: null, irlTrimestreBail: "T4 2023", revisions: [], dateDemande: "2025-02-28" })).toBeNull();
  });

  it("point 3 — l'indice précédent n'est pas exigé quand l'indice du bail est déjà celui de l'année précédente et qu'aucune révision n'est enregistrée", () => {
    // Bail du 15/10/2020 repris en cours, le 15/10/2026 (sixième année de bail, aucune révision dans Gerimmo).
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [])).toBe(true); // sans les années : comme avant
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [], { anneeIndice: 2026, anneeIndiceBail: 2025 })).toBe(false);
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [], { anneeIndice: 2026, anneeIndiceBail: 2024 })).toBe(true);
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [], { anneeIndice: 2026, anneeIndiceBail: null })).toBe(true);
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [], { anneeIndice: null, anneeIndiceBail: 2025 })).toBe(true);
    // Dès qu'une révision est enregistrée dans Gerimmo, la dispense ne joue plus : c'est l'année de bail précédente qui compte.
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [{ date_effet: "2024-10-15" }], { anneeIndice: 2026, anneeIndiceBail: 2025 })).toBe(true);
    expect(indicePrecedentExige("2020-10-15", "2026-10-15", [{ date_effet: "2025-10-15" }], { anneeIndice: 2026, anneeIndiceBail: 2025 })).toBe(false);
  });

  it("deux indices se comparent au centième, et s'écrivent avec deux décimales", () => {
    expect(memeIndice(200.2, 200.2)).toBe(true);
    expect(memeIndice(200.2, 200.204)).toBe(true);
    expect(memeIndice(200.2, 200.21)).toBe(false);
    expect(memeIndice(null, 200.2)).toBe(false);
    expect(indiceEnClair(220.2)).toBe("220,20");
    expect(indiceEnClair(220.25)).toBe("220,25");
  });
});

describe("action chercherIndiceRevision", () => {
  const bail = (plus: Ligne = {}): Ligne => ({ id: BAIL, organization_id: ORG, revision_irl: true, irl_trimestre: "T2 2024", irl_valeur: 200.2, date_debut: "2024-07-20", ...plus });
  const supabase = (o: { baux?: Ligne[]; revisions?: Ligne[]; erreurBaux?: string; erreurRevisions?: string } = {}) => fauxClient({
    baux: table("baux", o.baux ?? [bail()], o.erreurBaux),
    revisions_loyer: table("revisions_loyer", o.revisions ?? [], o.erreurRevisions),
  });
  beforeEach(() => {
    vi.clearAllMocks();
    banc.aujourdhui = "2026-11-22";
    banc.serie.mockResolvedValue(SERIE);
    banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: supabase() });
  });

  it("sans compte gestionnaire, identifiant invalide ou bail d'un autre espace : accès refusé, l'Insee n'est pas interrogé", async () => {
    expect(await chercherIndiceRevision("org", BAIL)).toEqual({ erreur: "Accès refusé." });
    expect(await chercherIndiceRevision(ORG, "bail")).toEqual({ erreur: "Accès refusé." });
    banc.acces.mockResolvedValue({ user: null, supabase: supabase() });
    expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({ erreur: "Accès refusé." });
    banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: supabase({ baux: [bail({ organization_id: "33333333-3333-4333-8333-333333333333" })] }) });
    expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({ erreur: "Accès refusé." });
    expect(banc.serie).not.toHaveBeenCalled();
  });

  it("bail sans clause de révision, ou bail illisible : dit, sans interroger l'Insee", async () => {
    banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: supabase({ baux: [bail({ revision_irl: false })] }) });
    expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({ erreur: "Ce bail ne prévoit pas de révision annuelle du loyer." });
    for (const panne of [{ erreurBaux: "panne" }, { erreurRevisions: "panne" }]) {
      banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: supabase(panne) });
      expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({ erreur: "Le bail n’a pas pu être relu. Rechargez la page, ou saisissez l’indice vous-même." });
    }
    expect(banc.serie).not.toHaveBeenCalled();
  });

  it("le bail ne dit pas quel trimestre chercher : réponse immédiate, l'Insee n'est pas interrogé", async () => {
    banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: supabase({ baux: [bail({ irl_trimestre: null })] }) });
    expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({ proposition: { etat: "sans_reference" }, luLe: "2026-11-22" });
    expect(banc.serie).not.toHaveBeenCalled();
  });

  it("proposition : l'indice du trimestre du bail, avec le jour de la lecture ; les révisions du bail (et d'elles seules) sont prises en compte", async () => {
    expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({
      proposition: { etat: "propose", trimestre: 2, annee: 2026, valeur: 220.25, referencePubliee: 200.2, referenceBail: 200.2, anneeReference: 2024, echeance: "2026-07-20", precedent: { annee: 2025, valeur: 210.2 } },
      luLe: "2026-11-22",
    });
    expect(banc.serie).toHaveBeenCalledTimes(1);
    // Troisième reprise du lot D2 : la date de la demande saisie dit de quelle date de révision on cherche l'indice ;
    // illisible, c'est aujourd'hui.
    expect(await chercherIndiceRevision(ORG, BAIL, "2025-08-01")).toMatchObject({ proposition: { etat: "propose", annee: 2025, valeur: 210.2, echeance: "2025-07-20", precedent: null } });
    expect(await chercherIndiceRevision(ORG, BAIL, "hier")).toMatchObject({ proposition: { etat: "propose", annee: 2026, echeance: "2026-07-20" } });
    banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: supabase({ revisions: [
      { id: "r1", organization_id: ORG, bail_id: BAIL, date_effet: "2025-07-20", irl_trimestre: "T2 2025", irl_nouveau: 210.2 },
      // La révision d'un autre bail, ou d'un autre espace, ne doit rien changer.
      { id: "r2", organization_id: ORG, bail_id: "44444444-4444-4444-8444-444444444444", date_effet: "2026-07-01", irl_trimestre: "T2 2026", irl_nouveau: 220.25 },
      { id: "r3", organization_id: "33333333-3333-4333-8333-333333333333", bail_id: BAIL, date_effet: "2026-07-01", irl_trimestre: "T2 2026", irl_nouveau: 220.25 },
    ] }) });
    expect(await chercherIndiceRevision(ORG, BAIL)).toMatchObject({ proposition: { etat: "propose", annee: 2026, anneeReference: 2025, referenceBail: 210.2, precedent: null } });
  });

  it("l'Insee ne répond pas : « indisponible », jamais une valeur supposée", async () => {
    banc.serie.mockResolvedValue(null);
    expect(await chercherIndiceRevision(ORG, BAIL)).toEqual({ proposition: { etat: "indisponible" }, luLe: "2026-11-22" });
  });
});

describe("message de la recherche", () => {
  const rendre = (retour: Parameters<typeof MessageIndicePropose>[0]["retour"]) => renderToStaticMarkup(createElement(MessageIndicePropose, { retour }));

  it("avant toute recherche : une zone d'annonce vide", () => {
    const html = rendre(null);
    expect(html).toMatch(/^<div role="status" aria-live="polite"[^>]*><\/div>$/);
  });

  it("proposition : l'indice, la consigne de vérifier, la source et le jour de lecture", () => {
    const html = rendre({ proposition: { etat: "propose", trimestre: 2, annee: 2026, valeur: 220.2, referencePubliee: 200.2, referenceBail: 200.2, anneeReference: 2025, echeance: "2026-07-20", precedent: null }, luLe: "2026-11-22" });
    const t = texte(html);
    expect(t).toContain("Indice du T2 2026 publié par l’Insee : 220,20.");
    expect(t).toContain("Il est reporté dans le formulaire : vérifiez-le avant de réviser.");
    expect(t).toContain("C’est l’indice de la révision prévue le 20/07/2026.");
    expect(t).toContain("Source : série n° 001515333 de l’Insee (indice de référence des loyers), lue le 22/11/2026.");
    expect(html).toContain('href="https://www.insee.fr/fr/statistiques/serie/001515333"');
    expect(html).not.toContain("data-indice-ecart");
    expect(html).not.toContain("data-indice-annee-sautee");
  });

  it("reprise D2 — année sautée : le message dit que la révision non faite n'est pas rattrapée et donne l'indice de l'année précédente", () => {
    const avec = rendre({ proposition: { etat: "propose", trimestre: 2, annee: 2026, valeur: 220.25, referencePubliee: 200.2, referenceBail: 200.2, anneeReference: 2024, echeance: "2026-07-20", precedent: { annee: 2025, valeur: 210.2 } }, luLe: "2026-11-22" });
    expect(avec).toContain("data-indice-annee-sautee");
    // Troisième reprise : même phrase que le formulaire et la base, qui n'affirment plus qu'une révision « n'a pas été faite ».
    expect(texte(avec)).toContain("Aucune révision n’est enregistrée pour l’année de bail précédente, ou l’indice de référence de ce bail est plus ancien. Une révision qui n’a pas été faite n’est pas rattrapée : le loyer se révise sur un an, avec l’indice du T2 2025 (210,20 selon l’Insee, reporté dans le formulaire : vérifiez-le).");
    const sans = rendre({ proposition: { etat: "propose", trimestre: 2, annee: 2026, valeur: 220.25, referencePubliee: 200.2, referenceBail: 200.2, anneeReference: 2024, echeance: "2026-07-20", precedent: { annee: 2025, valeur: null } }, luLe: "2026-11-22" });
    expect(texte(sans)).toContain("avec l’indice du T2 2025, que l’Insee ne publie pas dans cette série : saisissez-le vous-même.");
  });

  it("l'indice de référence du bail n'est pas celui que publie l'Insee : c'est dit, avec les deux valeurs", () => {
    const html = rendre({ proposition: { etat: "propose", trimestre: 2, annee: 2026, valeur: 220.25, referencePubliee: 200.2, referenceBail: 199.5, anneeReference: 2024, echeance: "2026-07-20", precedent: null }, luLe: "2026-11-22" });
    expect(html).toContain("data-indice-ecart");
    expect(texte(html)).toContain("Attention : pour le T2 2024, l’Insee publie 200,20, alors que l’indice de référence de ce bail est 199,50. Vérifiez-le avant de réviser.");
  });

  it.each([
    // Troisième reprise : l'indice cherché est nommé (celui de la date de révision), et le cas « déjà appliqué » est dit.
    [{ proposition: { etat: "pas_encore_publie" as const, trimestre: 3 as const, annee: 2027, anneeReference: 2026 }, luLe: "2026-11-22" }, "L’indice du T3 2027 n’est pas dans la série publiée par l’Insee : il n’y a rien à proposer pour l’instant."],
    [{ proposition: { etat: "deja_applique" as const, trimestre: 4 as const, annee: 2025, echeance: "2026-02-01" }, luLe: "2026-11-22" }, "L’indice de la révision prévue le 01/02/2026 (T4 2025) est déjà l’indice de référence de ce bail : il n’y a rien à réviser pour cette date."],
    [{ proposition: { etat: "sans_reference" as const }, luLe: "2026-11-22" }, "Le trimestre de l’indice de référence ne se lit pas sur ce bail : saisissez l’indice vous-même."],
    [{ proposition: { etat: "indisponible" as const }, luLe: "2026-11-22" }, "L’Insee ne répond pas pour le moment. Saisissez l’indice vous-même : il se lit sur la série officielle de l’Insee ."],
    [{ erreur: "Accès refusé." }, "Accès refusé."],
  ])("sans proposition : le message dit pourquoi et renvoie à la saisie à la main", (retour, attendu) => {
    expect(texte(rendre(retour))).toBe(attendu);
  });
});

describe("garde-fous", () => {
  const SOURCES = ["src/lib/indice-revision.ts", "src/app/actions/indice-revision.ts", "src/app/agence/[orgId]/baux/[bailId]/indice-propose.tsx"];

  it("aucune valeur d'indice n'est écrite dans le code : tout vient de la série lue chez l'Insee", () => {
    for (const f of SOURCES) {
      const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      // Un indice s'écrit « 1xx,xx » ou « 1xx.xx » : aucun nombre de cette forme, hormis le numéro de la série.
      expect(code.replace(/001515333/g, "").match(/\b1[0-9]{2}[.,][0-9]{1,2}\b/g) ?? [], f).toEqual([]);
    }
  });

  it("la recherche ne se lance qu'au clic : la fiche du bail ne dépend jamais de la réponse de l'Insee", () => {
    const page = readFileSync("src/app/agence/[orgId]/baux/[bailId]/page.tsx", "utf8");
    expect(page).not.toContain("chargerSerieIrl");
    const formulaire = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8");
    expect(formulaire).not.toContain("chargerSerieIrl");
    expect(formulaire).toContain("<IndicePropose orgId={orgId} bailId={bailId} dateDemande={demandeApercu} surProposition={reporterIndice} />");
    const bouton = readFileSync(SOURCES[2], "utf8");
    expect(bouton).toContain('type="button"');
    expect(bouton).toContain("onClick={chercher}");
  });

  it("le geste est une lecture : il n'écrit rien et n'appelle aucune fonction de la base", () => {
    const action = readFileSync(SOURCES[1], "utf8");
    expect(action).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(action).not.toContain("revalidatePath");
  });

  it("aucun article de loi n'est cité par ce lot", () => {
    for (const f of SOURCES) expect(readFileSync(f, "utf8"), f).not.toMatch(/\b(art\.|article|loi n°|décret)\s*\d/i);
  });
});
