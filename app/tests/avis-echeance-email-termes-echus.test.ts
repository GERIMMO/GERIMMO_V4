/**
 * Phase 3, lot 44 (reprise, C49) : l'avis d'échéance PAR E-MAIL annonce un total vrai le jour de son envoi.
 *
 * Le lot 44 avait corrigé l'avis en PDF, pas l'e-mail des missions planifiées, qui a la même cause : son arriéré vient de
 * appels_a_envoyer, qui ne compte que les termes ANTÉRIEURS. Un avis parti après son échéance — mois manquants créés d'un
 * coup par le rattrapage après un arrêt, ou bail saisi avec une date d'entrée passée — disait « vous solderez votre
 * compte, soit X au total » alors qu'un terme suivant était déjà échu.
 *
 * Ici : la phrase du courrier, la règle partagée avec le PDF, la clé anti-doublon, et une passe de la mission sur un
 * rattrapage de trois mois (seul `envoyerEmail` et la base sont remplacés ; aucun envoi, aucune base).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { corpsAvisEcheance, resteTermesSuivantsEchus, type AvisEcheance } from "../src/lib/appel-email";
import { cleAvisEcheance } from "../src/lib/cles-idempotence-courriels";

const rpc = vi.fn();
const envois = vi.hoisted(() => [] as { to: string; html: string; cleIdempotence?: string }[]);
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  envoyerEmail: async (p: { to: string; html: string; cleIdempotence?: string }) => { envois.push(p); return { id: `fictif-${envois.length}` }; },
}));

const texte = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/ | /g, " ");

describe("le courrier : solde des autres termes échus", () => {
  const base: AvisEcheance = {
    periode: "2026-10-01", loyerHc: 700, charges: 60, resteDu: 760, dateEcheance: "2026-10-05", prorata: false,
    arriere: 0, emetteur: "Bailleur fictif", prenom: "Zoé", lien: "https://exemple.test/loyers",
  };

  it("sans terme suivant échu, la phrase d'avant ne change pas (avis d'un terme à venir)", () => {
    const html = corpsAvisEcheance({ ...base, arriere: 360 });
    expect(texte(html)).toContain("Solde antérieur restant dû : 360,00 €. En le réglant avec ce terme, vous solderez votre compte, soit 1 120,00 € au total.");
    expect(corpsAvisEcheance({ ...base, arriere: 360, suivantsEchus: 0 })).toBe(html);
    expect(texte(corpsAvisEcheance(base))).not.toMatch(/Solde|solderez/);
  });

  it("termes antérieurs ET suivants déjà échus : les deux sont dits, le total est celui du compte à la date de l'avis", () => {
    const t = texte(corpsAvisEcheance({ ...base, arriere: 360, suivantsEchus: 770.5 }));
    expect(t).toContain("Solde des autres termes échus restant dû : 1 130,50 € (termes antérieurs : 360,00 € ; termes suivants déjà échus : 770,50 €).");
    expect(t).toContain("vous solderez votre compte à la date de cet avis, soit 1 890,50 € au total.");
    // Le total trop bas d'avant (760 + 360) n'est plus annoncé.
    expect(t).not.toContain("1 120,00");
    expect(t).not.toContain("Solde antérieur");
  });

  it("seulement des termes suivants déjà échus : le solde est dit, sans « antérieur »", () => {
    const t = texte(corpsAvisEcheance({ ...base, suivantsEchus: 770.5 }));
    expect(t).toContain("Solde des autres termes échus restant dû : 770,50 € (termes suivants déjà échus).");
    expect(t).toContain("soit 1 530,50 € au total.");
  });
});

describe("la règle partagée avec l'avis en PDF", () => {
  const termes = [
    { periode: "2026-09-01", date_echeance: "2026-09-05", montant_du: 360, montant_couvert: 0, statut: "impaye" },
    { periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 760, montant_couvert: 0, statut: "impaye" },
    { periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 770.5, montant_couvert: 0, statut: "impaye" },
    { periode: "2026-12-01", date_echeance: "2026-12-05", montant_du: 770.5, montant_couvert: 0, statut: "attendu" },
    { periode: "2027-01-01", date_echeance: "2027-01-05", montant_du: 0, montant_couvert: 0, statut: "non_du" },
  ];
  it("compte les termes postérieurs dont l'échéance est passée, ni le terme lui-même, ni un terme à venir, ni un terme non dû", () => {
    expect(resteTermesSuivantsEchus(termes, "2026-10-01", "2026-11-23")).toBe(770.5);
    expect(resteTermesSuivantsEchus(termes, "2026-09-01", "2026-11-23")).toBe(1530.5);
    expect(resteTermesSuivantsEchus(termes, "2026-11-01", "2026-11-23")).toBe(0);
    // Le jour de l'échéance, le terme n'est pas encore échu (comme « impayé » en base : échéance < aujourd'hui).
    expect(resteTermesSuivantsEchus(termes, "2026-10-01", "2026-11-05")).toBe(0);
  });
  it("ne compte que ce qui reste dû sur un terme réglé en partie", () => {
    expect(resteTermesSuivantsEchus([{ ...termes[2], montant_couvert: 400 }], "2026-10-01", "2026-11-23")).toBe(370.5);
  });
});

describe("la clé anti-doublon suit le solde annoncé", () => {
  const base = { appelId: "a-1", destinataire: "marc@exemple.fr", resteDu: 760, arriere: 360 };
  it("sans terme suivant échu, la clé est celle d'avant", () => {
    expect(cleAvisEcheance({ ...base, suivantsEchus: 0 })).toBe(cleAvisEcheance(base));
    expect(cleAvisEcheance(base)).toMatch(/^avis-echeance\/a-1\/76000\/36000\/[0-9a-f]{64}$/);
  });
  it("un terme suivant échu change le courrier, donc la clé", () => {
    expect(cleAvisEcheance({ ...base, suivantsEchus: 770.5 })).toMatch(/^avis-echeance\/a-1\/76000\/36000\/s77050\/[0-9a-f]{64}$/);
    expect(cleAvisEcheance({ ...base, suivantsEchus: 770.5 })).not.toBe(cleAvisEcheance({ ...base, suivantsEchus: 400 }));
  });
});

describe("la mission, sur un rattrapage de trois mois envoyé le 23/11", () => {
  const SECRET = "secret-de-recette-suffisamment-long";
  const ORG = "0d6f2c1e-58a4-4f0b-9a51-2f1f4a6f0001";
  const BAIL = "0d6f2c1e-58a4-4f0b-9a51-2f1f4a6f0003";
  const ligne = (appel: string, periode: string, echeance: string, reste: number, arriere: number) => ({
    appel_id: appel, organization_id: ORG, bail_id: BAIL, destinataire: "locataire@exemple.fr", prenom: "Zoé", emetteur: "Bailleur fictif",
    periode, loyer_hc: reste - 60, charges: 60, montant_du: reste, reste_du: reste, date_echeance: echeance, prorata: false, arriere,
    autres_destinataires: [],
  });
  // appels_a_envoyer : l'arriéré ne compte que les termes antérieurs (preuve du relecteur : `e.periode < a.periode`).
  const lignes = [
    ligne("a-sept", "2026-09-01", "2026-09-05", 360, 0),
    ligne("a-oct", "2026-10-01", "2026-10-05", 760, 360),
    ligne("a-nov", "2026-11-01", "2026-11-05", 770.5, 1120),
  ];
  const echeancier = [
    { appel_id: "a-sept", periode: "2026-09-01", date_echeance: "2026-09-05", montant_du: 360, cumul_du: 360, montant_couvert: 0, statut: "impaye" },
    { appel_id: "a-oct", periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 760, cumul_du: 1120, montant_couvert: 0, statut: "impaye" },
    { appel_id: "a-nov", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 770.5, cumul_du: 1890.5, montant_couvert: 0, statut: "impaye" },
  ];
  let lectureEcheancier: { data: unknown; error: { message: string } | null } = { data: echeancier, error: null };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T08:30:00Z"));
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
    envois.length = 0;
    lectureEcheancier = { data: echeancier, error: null };
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "appels_a_envoyer") return { data: lignes, error: null };
      if (fn === "etat_loyers_bail_brut") return lectureEcheancier;
      if (fn === "verifier_arret_supervision" || fn === "marquer_appel_envoye") return { data: true, error: null };
      if (fn === "envoi_automatique_ouvert") return { data: false, error: null };
      return { data: null, error: null };
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  const passe = async () => {
    const { traiterAppels } = await import("../src/lib/missions-planifiees/appels");
    const r = await traiterAppels(new Request("https://exemple.fr/api/cron/appels", { headers: { authorization: `Bearer ${SECRET}` } }));
    return r.json() as Promise<{ envoyes: number; echecs: number; echecs_detail?: { appel_id: string; motif: string }[] }>;
  };
  const avisDe = (periodeEnClair: RegExp) => texte(envois.find((e) => periodeEnClair.test(e.html))!.html);

  it("chaque avis annonce le solde du compte au 23/11 : les trois avis du même jour s'accordent", async () => {
    const bilan = await passe();
    expect(bilan).toMatchObject({ envoyes: 3, echecs: 0 });
    // Septembre : octobre et novembre sont échus (1 530,50 €) ; total 1 890,50 €.
    expect(avisDe(/septembre 2026/)).toContain("Solde des autres termes échus restant dû : 1 530,50 € (termes suivants déjà échus).");
    expect(avisDe(/septembre 2026/)).toContain("soit 1 890,50 € au total.");
    // Octobre : avant ce lot, « soit 1 120,00 € au total » alors que novembre était échu.
    expect(avisDe(/octobre 2026/)).toContain("(termes antérieurs : 360,00 € ; termes suivants déjà échus : 770,50 €)");
    expect(avisDe(/octobre 2026/)).toContain("soit 1 890,50 € au total.");
    expect(avisDe(/octobre 2026/)).not.toContain("1 120,00 € au total");
    // Novembre : aucun terme suivant : la phrase d'avant, déjà juste.
    expect(avisDe(/novembre 2026/)).toContain("Solde antérieur restant dû : 1 120,00 €. En le réglant avec ce terme, vous solderez votre compte, soit 1 890,50 € au total.");
    // L'échéancier du bail n'est relu qu'une fois pour la passe.
    expect(rpc.mock.calls.filter(([fn]) => fn === "etat_loyers_bail_brut")).toEqual([["etat_loyers_bail_brut", { p_bail: BAIL }]]);
    // La clé de l'avis d'octobre porte le solde des termes suivants qu'il annonce ; celle de novembre est celle d'avant.
    expect(envois.find((e) => /octobre 2026/.test(e.html))!.cleIdempotence).toMatch(/^avis-echeance\/a-oct\/76000\/36000\/s77050\//);
    expect(envois.find((e) => /novembre 2026/.test(e.html))!.cleIdempotence).toMatch(/^avis-echeance\/a-nov\/77050\/112000\/[0-9a-f]{64}$/);
  });

  it("un avis dont l'échéance est à venir ne relit rien : l'envoi ordinaire du début du mois ne change pas", async () => {
    // Le 2 novembre, l'avis de novembre (échéance le 5) part comme avant.
    vi.setSystemTime(new Date("2026-11-02T07:30:00Z"));
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "appels_a_envoyer") return { data: [lignes[2]], error: null };
      if (fn === "verifier_arret_supervision" || fn === "marquer_appel_envoye") return { data: true, error: null };
      if (fn === "envoi_automatique_ouvert") return { data: false, error: null };
      return { data: null, error: null };
    });
    expect(await passe()).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(rpc.mock.calls.some(([fn]) => fn === "etat_loyers_bail_brut")).toBe(false);
    expect(texte(envois[0].html)).toContain("Solde antérieur restant dû : 1 120,00 €. En le réglant avec ce terme, vous solderez votre compte, soit 1 890,50 € au total.");
  });

  it("échéancier illisible : aucun avis échu ne part avec un total peut-être faux, chacun reste à envoyer", async () => {
    lectureEcheancier = { data: null, error: { message: "indisponible" } };
    const bilan = await passe();
    expect(bilan).toMatchObject({ envoyes: 0, echecs: 3 });
    expect(bilan.echecs_detail!.map((e) => e.appel_id)).toEqual(["a-sept", "a-oct", "a-nov"]);
    expect(bilan.echecs_detail![0].motif).toMatch(/Échéancier du bail illisible/);
    expect(envois).toEqual([]);
    expect(rpc.mock.calls.some(([fn]) => fn === "marquer_appel_envoye")).toBe(false);
  });
});
