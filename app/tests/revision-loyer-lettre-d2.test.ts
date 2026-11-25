/**
 * LETTRE DE RÉVISION DU LOYER ET ÉCRAN — décisions du dirigeant du 24/11/2026, lot D2.
 *
 * Q43 : « la révision ne s'applique jamais à des jours antérieurs à la demande du bailleur. Applique-la au premier terme
 * qui suit la demande et écris-le dans la lettre. » La lettre d'une révision enregistrée depuis cette décision (elle porte
 * son premier terme) dit la date de révision, la date de la demande, le premier terme au loyer révisé et que les termes
 * d'avant ne changent pas — de la même façon en cas de hausse et en cas de baisse. Elle ne parle plus d'une « date d'effet »
 * en cours de mois. Une révision d'avant (sans premier terme) garde sa lettre d'avant, mot pour mot.
 * Q23 : l'écran affiche la date limite et dit le refus au-delà, sans citer d'article nouveau.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/documents/modeles/communs", async (original) => ({
  ...(await original<typeof import("@/lib/documents/modeles/communs")>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerRevisionIrl, construireRevisionIrl, phrasePremierTerme, type DonneesRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { Fusion } from "@/lib/documents/gabarit";
import { contexte as fabriquerContexte } from "./fixtures/contexte-document";

const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>|<\/(td|th|div|p|h1|h2)>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

/** Bail révisable le 15/10 : 700 € → 714 € (indice 100,00 → 102,00). */
const donnees = (sur: Partial<DonneesRevisionIrl> = {}): DonneesRevisionIrl => ({
  reference: "IRL-1", dateEffet: "2026-10-15", dateEcheance: "2026-10-15", dateDemande: "2026-10-15", premierTerme: "2026-11-01", trimestreNouveau: "T2 2026",
  ancienLoyer: 700, nouveauLoyer: 714, irlReference: 100, irlNouveau: 102, trimestre: "T2 2025", charges: 50, chargesMode: "provision",
  bailleurNom: "Fictive Jeanne", locatairesNoms: "Fictif Hugo", logementAdresse: "3 place des Essais, 69007 Lyon", referenceBail: "BAIL-1",
  exp: { nom: "Fictive Jeanne", adresse: "12 rue des Essais, 69003 Lyon", email: null, telephone: null, ville: "Lyon", emetteur: "detenteurs" },
  f: new Fusion(), ...sur,
});
const lettre = (sur: Partial<DonneesRevisionIrl> = {}) => texteDe(construireRevisionIrl(donnees(sur)).html);
const le = (jour: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(`${jour}T10:00:00Z`)); };
afterEach(() => { vi.useRealTimers(); });

describe("lettre de révision — le loyer révisé s'applique au premier terme qui suit la demande (Q43)", () => {
  it("demande le jour de la date de révision (15/10) : novembre est le premier terme, octobre n'est pas modifié", () => {
    le("2026-10-15");
    const texte = lettre();
    expect(texte).toContain("La révision se rattache à la date de révision annuelle du 15/10/2026. Le bailleur l'a demandée le 15/10/2026.");
    expect(texte).toContain("Le loyer révisé ne s'applique à aucun jour antérieur à la demande. Il s'applique à partir du terme de novembre 2026 (période commençant le 01/11/2026), premier terme dont la période commence après la date de la demande.");
    expect(texte).toContain("Le terme d’octobre 2026 et les termes antérieurs ne sont pas modifiés par cette révision (loyer avant révision : 700,00 €).");
    expect(texte).toContain("Loyer hors charges révisé, appelé à compter du terme de novembre 2026 714,00 €");
    // La formulation d'avant (décision Q43 d'origine : le mois de la date d'effet) n'est plus imprimée.
    expect(texte).not.toMatch(/prend effet|date d'effet|pour le mois entier|aucun complément|aucune déduction|après cette date/);
    expect(texte).not.toContain("Le présent courrier est établi le");
  });

  it("demande tardive (03/12) : la lettre le dit, janvier est le premier terme, décembre n'est pas modifié", () => {
    le("2026-12-03");
    const texte = lettre({ dateEffet: "2026-12-03", dateDemande: "2026-12-03", premierTerme: "2027-01-01" });
    expect(texte).toContain("La révision se rattache à la date de révision annuelle du 15/10/2026. Le bailleur l'a demandée le 03/12/2026, après cette date.");
    expect(texte).toContain("Il s'applique à partir du terme de janvier 2027 (période commençant le 01/01/2027), premier terme dont la période commence après la date de la demande.");
    expect(texte).toContain("Le terme de décembre 2026 et les termes antérieurs ne sont pas modifiés par cette révision (loyer avant révision : 700,00 €).");
    expect(texte).toContain("appelé à compter du terme de janvier 2027");
    expect(texte).not.toMatch(/prend effet|date d'effet/);
  });

  it("termes déjà appelés à l'enregistrement : le premier terme est plus tardif et la lettre dit pourquoi", () => {
    le("2027-02-20");
    const texte = lettre({ dateEffet: "2026-12-03", dateDemande: "2026-12-03", premierTerme: "2027-03-01" });
    expect(texte).toContain("Il s'applique à partir du terme de mars 2027 (période commençant le 01/03/2027), premier terme dont la période commence après la date de la demande et qui n'était pas déjà appelé lorsque la révision a été enregistrée.");
    expect(texte).toContain("Le terme de février 2027 et les termes antérieurs ne sont pas modifiés par cette révision");
    // Le courrier est établi après la demande : il le dit, avec sa propre date.
    expect(texte).toContain("Le bailleur l'a demandée le 03/12/2026, après cette date. Le présent courrier est établi le 20/02/2027.");
  });

  it("baisse de l'indice : les mêmes phrases, sans « complément » ni « déduction »", () => {
    le("2026-12-03");
    const hausse = phrasePremierTerme({ premierTerme: "2027-01-01", dateDemande: "2026-12-03", ancienLoyer: 700, nouveauLoyer: 714 });
    const baisse = phrasePremierTerme({ premierTerme: "2027-01-01", dateDemande: "2026-12-03", ancienLoyer: 700, nouveauLoyer: 686 });
    expect(baisse).toBe(hausse);
    const texte = lettre({ dateEffet: "2026-12-03", dateDemande: "2026-12-03", premierTerme: "2027-01-01", nouveauLoyer: 686, irlNouveau: 98 });
    expect(texte).toContain("Il s'applique à partir du terme de janvier 2027");
    expect(texte).toContain("Le terme de décembre 2026 et les termes antérieurs ne sont pas modifiés par cette révision (loyer avant révision : 700,00 €).");
    expect(texte).toContain("Loyer hors charges révisé, appelé à compter du terme de janvier 2027 686,00 €");
    expect(texte).not.toMatch(/complément|déduction|supérieur au loyer révisé/);
  });

  it("loyer révisé égal à l'ancien : aucun terme ne change ; bail qui finit avant le premier terme : aucun terme au loyer révisé", () => {
    le("2026-12-03");
    const egal = lettre({ dateDemande: "2026-12-03", premierTerme: "2027-01-01", nouveauLoyer: 700, irlNouveau: 100 });
    expect(egal).toContain("Le loyer révisé est égal au loyer avant révision : la révision ne modifie le montant d'aucun terme.");
    expect(egal).not.toContain("appelé à compter du terme");
    const fini = lettre({ dateDemande: "2026-12-03", premierTerme: "2027-01-01", dateFinBail: "2026-12-20" });
    expect(fini).toContain("Il s'appliquerait à partir du terme de janvier 2027 ; le bail prend fin le 20/12/2026, avant ce terme : aucun terme n'est appelé au loyer révisé.");
    expect(fini).not.toContain("appelé à compter du terme");
  });

  // Reprise du lot D2 : le renvoi à la fiche Service-Public est retiré du courrier adressé au locataire (constat 5 du
  // relecteur) ; il reste dans le message de refus et dans l'aide du formulaire, lus par le gérant. Ce test attendait le renvoi.
  it("mentions : ce que fait Gerimmo et le délai d'un an, sans renvoi à une fiche ni formule d'un article non lu", () => {
    le("2026-10-15");
    const texte = lettre();
    expect(texte).toContain("Le loyer révisé ne s'applique jamais à des jours antérieurs à la demande du bailleur : il s'applique au premier terme dont la période commence après la date de cette demande, et un terme déjà appelé n'est pas modifié.");
    expect(texte).toContain("La révision d'une année peut être demandée pendant un an à compter de la date de révision ; passé ce délai, elle n'est plus possible pour cette année-là. Fait à");
    expect(texte).not.toMatch(/Service-Public|fiche officielle|consultée le/);
    expect(texte).not.toMatch(/réputé y avoir renoncé|17-1 I|rédaction issue|sans rétroactivité|conforme/);
    // La seule référence d'article est celle que le document portait déjà dans son titre.
    expect(texte.match(/article/gi)).toHaveLength(1);
    expect(texte).toContain("Article 17-1 de la loi n° 89-462 du 6 juillet 1989 — indice de référence des loyers (IRL)");
  });

  it("une révision d'avant la décision (sans premier terme) garde sa lettre d'avant, mot pour mot", () => {
    le("2026-12-03");
    const avant = lettre({ premierTerme: null, dateEffet: "2026-12-03", dateDemande: "2026-12-03", application: { premierTerme: "2026-12-01", nonComplete: null, avantEffet: { du: "2026-12-01", au: "2026-12-02" } } });
    expect(avant).toContain("elle prend effet à la date de la demande, soit le 03/12/2026, sans effet rétroactif");
    expect(avant).toContain("Le loyer révisé est appelé à compter du terme de décembre 2026, pour le mois entier, y compris du 01/12/2026 au 02/12/2026, avant la date d'effet.");
    expect(avant).toContain("il est réputé y avoir renoncé pour l'année écoulée");
    expect(avant).not.toContain("ne s'applique à aucun jour antérieur");
  });
});

describe("lettre de révision — assemblage depuis la base", () => {
  type Ligne = Record<string, unknown>;
  const base = (tables: Record<string, Ligne[]>) => {
    const requete = (table: string) => {
      const lignes = tables[table] ?? [];
      const q: Record<string, unknown> = {
        then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
        maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
      };
      for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = () => q;
      return q;
    };
    return { from: requete } as unknown as SupabaseClient;
  };
  const contexte = fabriquerContexte();
  const revision = (sur: Ligne = {}) => ({
    id: "rev-0001", bail_id: contexte.bail.id, date_effet: "2026-12-03", date_echeance: "2026-10-15", date_demande: "2026-12-03", premier_terme: "2027-01-01",
    irl_trimestre: "T2 2026", ancien_loyer: 700, nouveau_loyer: 714, irl_reference: 100, irl_nouveau: 102, ...sur,
  });

  it("le premier terme lu sur la révision est imprimé et classe le document ; sans lui, le classement d'avant", async () => {
    le("2026-12-03");
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte as never);
    const r = await assemblerRevisionIrl(base({ revisions_loyer: [revision()] }), "org", "rev-0001");
    if (!("document" in r)) throw new Error(JSON.stringify(r));
    expect(texteDe(r.document.html)).toContain("Il s'applique à partir du terme de janvier 2027 (période commençant le 01/01/2027)");
    expect(r.titreGed).toBe("Révision IRL — loyer appliqué à partir du 01/01/2027");
    const avant = await assemblerRevisionIrl(base({ revisions_loyer: [revision({ premier_terme: null })] }), "org", "rev-0001");
    if (!("document" in avant)) throw new Error(JSON.stringify(avant));
    expect(avant.titreGed).toBe("Révision IRL — effet au 03/12/2026");
    expect(texteDe(avant.document.html)).toContain("elle prend effet à la date de la demande, soit le 03/12/2026");
    // La lecture demande bien la nouvelle colonne.
    expect(readFileSync("src/lib/documents/modeles/revision-irl.ts", "utf8")).toContain('"id, bail_id, date_effet, date_echeance, date_demande, premier_terme, irl_trimestre,');
  });
});

describe("écran de la révision — date limite, premier terme, refus (Q23, Q43)", () => {
  const formulaire = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8");

  it("le formulaire affiche la date limite et le premier terme d'une demande faite aujourd'hui", () => {
    expect(formulaire).toContain("const limiteDuJour = datesDuJour ? dateLimiteRevision(dateDebut, datesDuJour.echeance) : null;");
    expect(formulaire).toContain("data-revision-limite>{formaterDate(limiteDuJour)}</span>");
    // Reprise du lot D2 (constat 6) : l'aperçu ne calcule plus « le mois qui suit aujourd'hui » de son côté ; il suit la date
    // de demande saisie et calcule comme la base (`premierTermeRevise` : demande, jour d'enregistrement, dernier terme appelé).
    expect(formulaire).toContain("const premierTermeApercu = premierTermeRevise(demandeApercu, aujourdhui, dernierTermeAppele);");
    expect(formulaire).toContain("terme {deElide(moisDuTerme(premierTermeApercu))}");
    expect(formulaire).not.toContain("premierTermeApresDemande(aujourdhui)");
    expect(formulaire).not.toContain("prendrait effet le");
  });

  it("l'aide dit la règle du premier terme et le refus au-delà d'un an, sans article nouveau", () => {
    const aide = formulaire.slice(formulaire.indexOf("Nouveau loyer = loyer actuel"), formulaire.indexOf("{datesDuJour && ("));
    expect(aide).toContain("premier terme dont la période commence après la date de la demande");
    expect(aide).toContain("passé ce délai, elle est refusée (selon la fiche officielle Service-Public");
    expect(aide).toContain("consultée le 24/11/2026)");
    expect(aide).not.toMatch(/art\.|article|prend effet à la date/);
  });

  it("chaque révision enregistrée depuis la décision dit à partir de quel terme elle s'applique", () => {
    expect(formulaire).toContain("{r.premier_terme ? ` · loyer révisé appliqué à partir du terme ${deElide(moisDuTerme(r.premier_terme))}` : \"\"}");
    const page = readFileSync("src/app/agence/[orgId]/baux/[bailId]/page.tsx", "utf8");
    expect(page).toContain('.select("id, date_effet, date_echeance, date_demande, premier_terme, irl_trimestre,');
  });

  it("le refus de la base arrive entier à l'écran (aucun mot technique à retirer, aucun article cité)", async () => {
    const { sansJargon } = await import("@/lib/erreurs");
    const message = "Révision refusée : la révision prévue le 15/10/2025 pouvait être demandée jusqu'au 14/10/2026. Ce délai d'un an est passé : la révision de cette année-là n'est plus possible (selon la fiche officielle Service-Public consultée le 24/11/2026). Pour la révision de l'année en cours, datez la demande d'aujourd'hui";
    expect(sansJargon(message)).toBe(message);
    expect(message).not.toMatch(/art\.|article/i);
  });
});
