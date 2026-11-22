/**
 * LES TROIS TÂCHES PLANIFIÉES DANS LES DEUX POSITIONS DE L'INTERRUPTEUR (audit palier 1 du 22/11/2026, P1-08).
 *
 * Avis d'échéance, relances amiables, rappels de rendez-vous : chaque tâche lit l'interrupteur du superviseur une
 * fois par passe.
 *  - FERMÉ (le défaut), illisible ou en erreur : la tâche ne joint AUCUN contexte métier à ses e-mails. C'est
 *    exactement son comportement d'avant ce lot : la liste fermée suspend l'envoi.
 *  - OUVERT : chaque e-mail porte le contexte qui désigne précisément ce qui est envoyé (l'appel ; le bail, le
 *    niveau, le terme et les montants, la cible ; le rendez-vous, l'échéance et le destinataire). C'est sur ce
 *    contexte que la base refait la preuve avant l'envoi (tests/envois-suspendus-base.test.ts).
 *
 * Ici seul `envoyerEmail` est remplacé : on lit ce que chaque tâche lui confie. Aucun envoi, aucune base.
 * (La quatrième, la relance d'invitation, a ses cas dans tests/relances-invitations-mission.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const envois = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  envoyerEmail: async (p: Record<string, unknown>) => { envois.push(p); return { id: `fictif-${envois.length}` }; },
}));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/notifications", () => ({
  envoyerRappelsGestes: async () => ({
    envoyes: 0, echecs: 0, sans_adresse: 0, non_consignes: 0,
    par_type: { creneau_non_choisi: 0, mission_non_acceptee: 0, piece_demandee: 0, devis_non_chiffre: 0 },
  }),
}));

const SECRET = "secret-de-recette-suffisamment-long";
const appel = (chemin: string) => new Request(`https://exemple.fr/api/cron/${chemin}`, { headers: { authorization: `Bearer ${SECRET}` } });
const ORG = "0d6f2c1e-58a4-4f0b-9a51-2f1f4a6f0001";
const APPEL = "0d6f2c1e-58a4-4f0b-9a51-2f1f4a6f0002";
const BAIL = "0d6f2c1e-58a4-4f0b-9a51-2f1f4a6f0003";
const INTERVENTION = "0d6f2c1e-58a4-4f0b-9a51-2f1f4a6f0004";

type Reponse = { data?: unknown; error?: { message: string } | null };
/** Le banc : l'interrupteur tel que la base le dirait, puis les lectures propres à chaque tâche. */
function banc(interrupteur: (flux: string) => Reponse | Promise<Reponse>, lectures: Record<string, Reponse>) {
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "envoi_automatique_ouvert") return interrupteur(String(args?.p_flux));
    if (fn === "verifier_arret_supervision" || fn === "relance_loyer_envoi_confirme") return { data: true, error: null };
    return lectures[fn] ?? { data: null, error: null };
  });
}
const lecturesInterrupteur = () => rpc.mock.calls.filter(([fn]) => fn === "envoi_automatique_ouvert").map(([, a]) => (a as { p_flux: string }).p_flux);
const contextes = () => envois.map((e) => e.contexteMetier);
const FERME = () => ({ data: false, error: null });
const ouvertPour = (...flux: string[]) => (f: string) => ({ data: flux.includes(f), error: null });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  rpc.mockReset();
  envois.length = 0;
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("avis d'échéance", () => {
  const ligne = {
    appel_id: APPEL, organization_id: ORG, bail_id: BAIL, destinataire: "locataire@exemple.fr", prenom: "Marc", emetteur: "Bailleur fictif",
    periode: "2026-11-01", loyer_hc: 700, charges: 50, montant_du: 750, reste_du: 750, date_echeance: "2026-11-05", prorata: false, arriere: 0,
    autres_destinataires: ["colocataire@exemple.fr"],
  };
  const lectures = { appels_a_envoyer: { data: [ligne], error: null }, marquer_appel_envoye: { data: true, error: null } };
  const passe = async () => { const { traiterAppels } = await import("../src/lib/missions-planifiees/appels"); return traiterAppels(appel("appels")); };

  it.each([
    ["fermé", FERME],
    ["ouvert pour les trois autres envois seulement", ouvertPour("relance_loyer", "rappel_rendez_vous", "relance_invitation")],
    ["en erreur", () => ({ data: true, error: { message: "lecture impossible" } })],
    ["illisible (valeur inattendue)", () => ({ data: "true", error: null })],
    ["sans réponse", () => ({})],
    ["indisponible (exception)", () => { throw new Error("réseau"); }],
  ])("interrupteur %s : aucun contexte n'est joint — l'envoi reste suspendu par la liste fermée, comme avant", async (_libelle, interrupteur) => {
    banc(interrupteur, lectures);
    await passe();
    expect(envois.map((e) => e.to)).toEqual(["locataire@exemple.fr", "colocataire@exemple.fr"]);
    for (const e of envois) expect("contexteMetier" in e).toBe(false);
    expect(lecturesInterrupteur()).toEqual(["avis_echeance"]);
  });

  it("interrupteur ouvert : chaque avis désigne son appel ; l'interrupteur n'est lu qu'une fois par passe", async () => {
    banc(ouvertPour("avis_echeance"), lectures);
    await passe();
    expect(envois.map((e) => e.to)).toEqual(["locataire@exemple.fr", "colocataire@exemple.fr"]);
    expect(contextes()).toEqual([{ type: "avis_echeance", id: APPEL }, { type: "avis_echeance", id: APPEL }]);
    for (const e of envois) expect(e.organisation).toMatchObject({ id: ORG });
    expect(lecturesInterrupteur()).toEqual(["avis_echeance"]);
  });

  it("sans avis à envoyer, l'interrupteur n'est même pas lu", async () => {
    banc(ouvertPour("avis_echeance"), { appels_a_envoyer: { data: [], error: null } });
    await passe();
    expect(envois).toHaveLength(0);
    expect(lecturesInterrupteur()).toEqual([]);
  });
});

describe("relances amiables", () => {
  const ligne = {
    bail_id: BAIL, organization_id: ORG, niveau: "relance_2", destinataire: "locataire@exemple.fr", prenom: "Marc", emetteur: "Bailleur fictif",
    lot: "Lot A", periode: "2026-10-01", date_echeance: "2026-10-05", reste: "700.00", jours_retard: 40, total_du: "1450.50",
    autres_destinataires: ["colocataire@exemple.fr"], garants: ["caution@exemple.fr"], locataire: "Marc Dupont",
  };
  const lectures = (l: Record<string, unknown> = ligne) => ({ relances_loyer_dues: { data: [l], error: null }, relance_loyer_consigner: { data: "id", error: null } });
  const passe = async () => { const { traiterRelances } = await import("../src/lib/missions-planifiees/relances"); return traiterRelances(appel("relances")); };

  it.each([
    ["fermé", FERME],
    ["ouvert pour les trois autres envois seulement", ouvertPour("avis_echeance", "rappel_rendez_vous", "relance_invitation")],
    ["en erreur", () => ({ data: true, error: { message: "lecture impossible" } })],
    ["indisponible (exception)", () => { throw new Error("réseau"); }],
  ])("interrupteur %s : aucun contexte n'est joint, pour le locataire comme pour la caution", async (_libelle, interrupteur) => {
    banc(interrupteur, lectures());
    await passe();
    expect(envois.map((e) => e.to)).toEqual(["locataire@exemple.fr", "colocataire@exemple.fr", "caution@exemple.fr"]);
    for (const e of envois) expect("contexteMetier" in e).toBe(false);
    expect(lecturesInterrupteur()).toEqual(["relance_loyer"]);
  });

  it("interrupteur ouvert : le contexte dit le bail, le niveau, le terme, les montants exacts et la cible de chaque e-mail", async () => {
    banc(ouvertPour("relance_loyer"), lectures());
    await passe();
    const commun = { type: "relance_loyer", id: BAIL, niveau: "relance_2", echeance: "2026-10-05", reste: "700", total: "1450.5" };
    expect(envois.map((e) => [e.to, e.contexteMetier])).toEqual([
      ["locataire@exemple.fr", { ...commun, cible: "locataire" }],
      ["colocataire@exemple.fr", { ...commun, cible: "locataire" }],
      ["caution@exemple.fr", { ...commun, cible: "caution" }],
    ]);
    expect(lecturesInterrupteur()).toEqual(["relance_loyer"]);
  });

  it("interrupteur ouvert, total dû absent : le contexte le dit (null), il n'invente pas un zéro", async () => {
    banc(ouvertPour("relance_loyer"), lectures({ ...ligne, niveau: "relance_1", total_du: null, autres_destinataires: [], garants: [] }));
    await passe();
    expect(contextes()).toEqual([{ type: "relance_loyer", id: BAIL, niveau: "relance_1", echeance: "2026-10-05", reste: "700", total: null, cible: "locataire" }]);
  });

  it("interrupteur ouvert, montant restant illisible : aucun contexte pour cette relance — elle reste suspendue plutôt que prouvée sur un montant douteux", async () => {
    banc(ouvertPour("relance_loyer"), lectures({ ...ligne, reste: "700.001", autres_destinataires: [], garants: [] }));
    await passe();
    expect(envois).toHaveLength(1);
    expect("contexteMetier" in envois[0]).toBe(false);
  });
});

describe("rappels de rendez-vous", () => {
  const base = {
    intervention_id: INTERVENTION, organization_id: ORG, echeance: "veille", prenom: null, emetteur: "Bailleur fictif", artisan: "Atelier fictif",
    lot: "Lot 3", adresse_bien: "9 rue Essai", debut_prevu: "2026-11-23T08:00:00+00:00", fin_prevue: "2026-11-23T10:00:00+00:00",
    incident_numero: "INC-001", categorie: "plomberie_canalisation",
  };
  const lignes = [
    { ...base, destinataire: "locataire", adresse: "locataire@exemple.fr", prenom: "Marc" },
    { ...base, destinataire: "artisan", adresse: "artisan@exemple.fr", echeance: "j7" },
  ];
  const lectures = { rendez_vous_a_rappeler: { data: lignes, error: null }, marquer_rappel_envoye: { data: true, error: null } };
  const passe = async () => { const { traiterRappels } = await import("../src/lib/missions-planifiees/rappels"); return traiterRappels(appel("rappels")); };
  /** La tâche des rappels en lance d'autres (reports, invitations…) : on ne regarde ici que les rappels de rendez-vous. */
  const rappels = () => envois.filter((e) => ["locataire@exemple.fr", "artisan@exemple.fr"].includes(String(e.to)));

  it.each([
    ["fermé", FERME],
    ["ouvert pour les trois autres envois seulement", ouvertPour("avis_echeance", "relance_loyer", "relance_invitation")],
    ["en erreur", () => ({ data: true, error: { message: "lecture impossible" } })],
    ["indisponible (exception)", () => { throw new Error("réseau"); }],
  ])("interrupteur %s : aucun contexte n'est joint, ni pour le locataire ni pour l'artisan", async (_libelle, interrupteur) => {
    banc(interrupteur, lectures);
    await passe();
    expect(rappels().map((e) => e.to)).toEqual(["locataire@exemple.fr", "artisan@exemple.fr"]);
    for (const e of rappels()) expect("contexteMetier" in e).toBe(false);
    expect(lecturesInterrupteur().filter((f) => f === "rappel_rendez_vous")).toEqual(["rappel_rendez_vous"]);
  });

  it("interrupteur ouvert : le contexte dit le rendez-vous, l'échéance et le destinataire de chaque rappel", async () => {
    banc(ouvertPour("rappel_rendez_vous"), lectures);
    await passe();
    expect(rappels().map((e) => [e.to, e.contexteMetier])).toEqual([
      ["locataire@exemple.fr", { type: "rappel_rendez_vous", id: INTERVENTION, echeance: "veille", role: "locataire" }],
      ["artisan@exemple.fr", { type: "rappel_rendez_vous", id: INTERVENTION, echeance: "j7", role: "artisan" }],
    ]);
    expect(lecturesInterrupteur().filter((f) => f === "rappel_rendez_vous")).toEqual(["rappel_rendez_vous"]);
  });
});
