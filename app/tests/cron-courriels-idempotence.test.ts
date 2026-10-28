/**
 * Les quatre tâches d'e-mail portent une clé anti-doublon, et leur appel au
 * service a un délai maximal : quittances, avis d'échéance, relances, rappels
 * (décision D47, fiches IA-04 et IA-05).
 *
 * Le vrai `envoyerEmail` tourne ; seul `fetch` est remplacé par un faux
 * fournisseur qui connaît les clés (tests/fixtures/faux-fournisseur-email.ts).
 * Deux scénarios par tâche :
 *  1. le marquage échoue après l'envoi, la passe suivante reprend l'objet :
 *     le service ne reçoit qu'un message par destinataire ;
 *  2. le délai maximal coupe l'attente d'un envoi pourtant accepté : l'échec
 *     est consigné sans marquer l'objet, et la passe suivante n'envoie rien de
 *     plus (le délai seul aurait provoqué le doublon).
 *
 * LA CLÉ SUIT LE CONTENU (relecture du 14/10). Quand l'état de l'objet change
 * entre deux passes — un reçu partiel promu en quittance, un règlement qui
 * réduit le montant dû — le courrier n'est plus le même : le service refuse
 * (409) une clé réutilisée avec un autre contenu, et l'envoi serait bloqué
 * jusqu'à l'oubli de la clé. La clé porte donc ce qui fait le contenu.
 *
 * LA LIMITE DE 24 H. La clé n'est retenue que 24 h (hypothèse, voir le faux
 * fournisseur), et ces tâches tournent une fois par jour : une reprise « le
 * lendemain » tombe au bord de la fenêtre. Les tests « dans les 24 h » et
 * « au-delà de 24 h » montrent les deux côtés ; le second est un DOUBLON
 * ATTENDU, risque résiduel connu de la décision D47, pas un comportement voulu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";

const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => ({
    rpc: (...a: unknown[]) => (["verifier_arret_supervision", "relance_loyer_envoi_confirme"].includes(String(a[0])) ? Promise.resolve({ data: true, error: null }) : rpc(...a)),
  }),
}));
// Pas de marque d'agence à lire : l'envoi part avec l'expéditeur par défaut.
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
// Les rappels de gestes ont leur propre test (rappels-gestes-idempotence.test.ts).
vi.mock("@/lib/notifications", () => ({
  envoyerRappelsGestes: async () => ({
    envoyes: 0, echecs: 0, sans_adresse: 0, non_consignes: 0,
    par_type: { creneau_non_choisi: 0, mission_non_acceptee: 0, piece_demandee: 0, devis_non_chiffre: 0 },
  }),
}));

const SECRET = "secret-de-recette-suffisamment-long";
const appel = (chemin: string) =>
  new Request(`https://exemple.fr/api/cron/${chemin}`, { headers: { authorization: `Bearer ${SECRET}` } });

/** Le dernier bilan consigné par la tâche (`log_tech`). */
function bilanConsigne(): Record<string, unknown> {
  const consignations = rpc.mock.calls.filter(([fn]) => fn === "log_tech");
  return (consignations[consignations.length - 1][1] as { details: Record<string, unknown> }).details;
}
const appelsDe = (fn: string) => rpc.mock.calls.filter(([nom]) => nom === fn);

let fournisseur = fauxFournisseurEmail();

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  rpc.mockReset();
  fournisseur = fauxFournisseurEmail();
  vi.stubGlobal("fetch", fournisseur.fetch);
  // Le délai de 15 s est ramené à 25 ms : le test ne l'attend pas.
  const reel = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => reel(25));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MOTIF_DELAI = /n’a pas répondu à temps/;

describe("quittances", () => {
  const ligne = {
    quittance_id: "q-1", organization_id: "org-1", bail_id: "bail-1", destinataire: "locataire@exemple.fr",
    prenom: "Léa", emetteur: "Agence Alpha", periode: "septembre 2026", loyer_hc: 650, charges: 50, montant: 700, est_quittance: true,
  };
  function banc(marquage: { erreur: boolean }) {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "quittances_a_envoyer") return { data: [ligne], error: null };
      if (fn === "quittance_envoi_autorise") return { data: true, error: null };
      if (fn === "quittance_document") return { data: quittanceDocumentComplete(), error: null };
      if (fn === "marquer_quittance_envoyee") return { error: marquage.erreur ? { message: "verrou" } : null };
      return { data: null, error: null };
    });
  }

  it.each(["retrait", "adresse modifiée", "lecture indisponible"])("refuse l'envoi si %s pendant la préparation du document", async (changement) => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    let prepare = false;
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "quittances_a_envoyer") return { data: [ligne], error: null };
      if (fn === "quittance_document") { prepare = true; return { data: quittanceDocumentComplete(), error: null }; }
      if (fn === "quittance_envoi_autorise") {
        if (!args.p_destinataire) return { data: true, error: null };
        expect(prepare).toBe(true);
        expect(args).toEqual({ p_org: ligne.organization_id, p_bail: ligne.bail_id, p_destinataire: ligne.destinataire });
        return { data: false, error: changement === "lecture indisponible" ? { message: "indisponible" } : null };
      }
      return { data: null, error: null };
    });
    await GET(appel("quittances"));
    expect(fournisseur.appels).toHaveLength(0);
    expect(appelsDe("marquer_quittance_envoyee")).toHaveLength(0);
    expect(bilanConsigne()).toMatchObject({ envoyees: 0, echecs: 1 });
    expect(appelsDe("quittance_envoi_autorise")).toHaveLength(2);
  });

  it("une quittance non marquée, reprise dans les 24 h (relance manuelle, seconde passe), n'est envoyée qu'une fois", async () => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    banc({ erreur: true });
    await GET(appel("quittances"));
    const premiere = fournisseur.cles();
    expect(premiere).toHaveLength(1);
    expect(premiere[0]).toMatch(/^quittance\/q-1\/q\/70000\/[0-9a-f]{64}$/);
    expect(premiere[0]).not.toContain("@");
    fournisseur.avancer(23 * 3_600_000);
    await GET(appel("quittances"));
    expect(fournisseur.cles()).toEqual([premiere[0], premiere[0]]);
    expect(fournisseur.acceptes).toHaveLength(1);
    expect(fournisseur.appels.every((a) => a.avecDelai)).toBe(true);
  });

  it("à la cadence réelle (une passe par jour), la reprise est au bord de la fenêtre de 24 h : un peu avant, pas de doublon", async () => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    banc({ erreur: true });
    await GET(appel("quittances"));
    // 07:00:03 un jour, 07:00:01 le suivant : 23 h 59 min 58 s.
    fournisseur.avancer(24 * 3_600_000 - 2_000);
    await GET(appel("quittances"));
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("RISQUE RÉSIDUEL DE D47 : un peu après les 24 h, la clé est oubliée et la reprise renvoie la quittance", async () => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    banc({ erreur: true });
    await GET(appel("quittances"));
    // 07:00:03 un jour, 07:00:05 le suivant : 24 h et 2 s. La gigue de lancement
    // d'une tâche quotidienne suffit à passer de l'autre côté de la limite.
    fournisseur.avancer(24 * 3_600_000 + 2_000);
    await GET(appel("quittances"));
    expect(fournisseur.acceptes).toHaveLength(2);
    expect(fournisseur.acceptes.map((m) => m.to[0])).toEqual(["locataire@exemple.fr", "locataire@exemple.fr"]);
  });

  it("un reçu partiel envoyé, puis la MÊME ligne promue en quittance : la quittance part à la passe suivante, sans refus du service", async () => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    // `resynchroniser_quittances` révise la même ligne (même id) quand l'encaissé
    // change : elle passe de reçu à quittance, change de montant et redevient « à envoyer ».
    let courante = { ...ligne, est_quittance: false, montant: 400 };
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "quittances_a_envoyer") return { data: [courante], error: null };
      if (fn === "quittance_envoi_autorise") return { data: true, error: null };
      if (fn === "quittance_document") return { data: quittanceDocumentComplete(), error: null };
      return { data: null, error: null };
    });
    await GET(appel("quittances"));
    expect(bilanConsigne()).toMatchObject({ envoyees: 1, echecs: 0 });

    courante = { ...courante, est_quittance: true, montant: 700 };
    fournisseur.avancer(3_600_000);
    await GET(appel("quittances"));
    expect(bilanConsigne()).toMatchObject({ envoyees: 1, echecs: 0 });
    expect(bilanConsigne().echecs_detail).toBeUndefined();
    expect(fournisseur.acceptes).toHaveLength(2);
    const [recu, quittance] = fournisseur.acceptes;
    expect(recu.subject).not.toBe(quittance.subject);
    expect(new Set(fournisseur.cles()).size).toBe(2);
    expect(recu.cle).toMatch(/^quittance\/q-1\/r\/40000\//);
    expect(quittance.cle).toMatch(/^quittance\/q-1\/q\/70000\//);
  });

  it("la même ligne, inchangée, reste un seul courrier même si une passe la reprend (la clé ne bouge pas sans raison)", async () => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    banc({ erreur: true });
    await GET(appel("quittances"));
    await GET(appel("quittances"));
    await GET(appel("quittances"));
    expect(new Set(fournisseur.cles()).size).toBe(1);
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("un envoi accepté mais coupé par le délai : échec consigné, rien de marqué, pas de doublon à la passe suivante", async () => {
    const { traiterQuittances: GET } = await import("../src/lib/missions-planifiees/quittances");
    banc({ erreur: false });
    fournisseur.definirMode("accepte-puis-muet");
    const r1 = await GET(appel("quittances"));
    expect(r1.status).toBe(200);
    expect(bilanConsigne()).toMatchObject({ envoyees: 0, echecs: 1 });
    expect((bilanConsigne().echecs_detail as { motif: string }[])[0].motif).toMatch(MOTIF_DELAI);
    expect(appelsDe("marquer_quittance_envoyee")).toHaveLength(0);

    fournisseur.definirMode("normal");
    await GET(appel("quittances"));
    expect(bilanConsigne()).toMatchObject({ envoyees: 1, echecs: 0 });
    expect(appelsDe("marquer_quittance_envoyee")).toHaveLength(1);
    expect(fournisseur.acceptes).toHaveLength(1);
  });
});

describe("avis d'échéance", () => {
  const ligne = {
    appel_id: "a-1", organization_id: "org-1", bail_id: "bail-1", destinataire: "locataire@exemple.fr",
    prenom: "Marc", emetteur: "Agence Alpha", periode: "octobre 2026", loyer_hc: 700, charges: 50, montant_du: 750,
    reste_du: 750, date_echeance: "2026-10-01", prorata: false, arriere: 0, autres_destinataires: ["colocataire@exemple.fr"],
  };
  function banc(marquage: { erreur: boolean }) {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "appels_a_envoyer") return { data: [ligne], error: null };
      if (fn === "marquer_appel_envoye") return { error: marquage.erreur ? { message: "verrou" } : null };
      return { data: null, error: null };
    });
  }

  it("chaque destinataire a sa clé (le colocataire n'est pas pris pour un doublon du principal) et la reprise ne double rien", async () => {
    const { traiterAppels: GET } = await import("../src/lib/missions-planifiees/appels");
    banc({ erreur: true });
    await GET(appel("appels"));
    const premiere = fournisseur.cles();
    expect(premiere).toHaveLength(2);
    expect(new Set(premiere).size).toBe(2);
    for (const cle of premiere) {
      expect(cle).toMatch(/^avis-echeance\/a-1\/75000\/0\/[0-9a-f]{64}$/);
      expect(cle).not.toContain("@");
    }
    await GET(appel("appels"));
    expect(fournisseur.cles().slice(2)).toEqual(premiere);
    expect(fournisseur.acceptes.map((m) => m.to[0]).sort()).toEqual(["colocataire@exemple.fr", "locataire@exemple.fr"]);
  });

  it("le montant dû change entre deux passes (un règlement est arrivé) : le nouvel avis part, le service ne refuse pas", async () => {
    const { traiterAppels: GET } = await import("../src/lib/missions-planifiees/appels");
    // Marquage en échec à la première passe : l'avis reste « à envoyer ».
    let courante: typeof ligne = { ...ligne, autres_destinataires: [] };
    let marquageEnErreur = true;
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "appels_a_envoyer") return { data: [courante], error: null };
      if (fn === "marquer_appel_envoye") return { error: marquageEnErreur ? { message: "verrou" } : null };
      return { data: null, error: null };
    });
    await GET(appel("appels"));
    expect(fournisseur.acceptes).toHaveLength(1);

    marquageEnErreur = false;
    courante = { ...courante, reste_du: 250, arriere: 0 };
    fournisseur.avancer(3_600_000);
    await GET(appel("appels"));
    expect(bilanConsigne()).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(bilanConsigne().echecs_detail).toBeUndefined();
    expect(appelsDe("marquer_appel_envoye")).toHaveLength(2);
    expect(fournisseur.acceptes).toHaveLength(2);
    expect(new Set(fournisseur.cles()).size).toBe(2);
  });

  it("le montant dû ne change pas : la reprise ne double rien (la clé ne bouge pas sans raison)", async () => {
    const { traiterAppels: GET } = await import("../src/lib/missions-planifiees/appels");
    banc({ erreur: true });
    await GET(appel("appels"));
    fournisseur.avancer(3_600_000);
    await GET(appel("appels"));
    expect(new Set(fournisseur.cles()).size).toBe(2);
    expect(fournisseur.acceptes).toHaveLength(2);
  });

  it("un envoi accepté mais coupé par le délai : avis non marqué, repris sans doublon", async () => {
    const { traiterAppels: GET } = await import("../src/lib/missions-planifiees/appels");
    banc({ erreur: false });
    fournisseur.definirMode("accepte-puis-muet");
    await GET(appel("appels"));
    expect(bilanConsigne()).toMatchObject({ envoyes: 0, echecs: 1 });
    expect((bilanConsigne().echecs_detail as { motif: string }[])[0].motif).toMatch(MOTIF_DELAI);
    expect(appelsDe("marquer_appel_envoye")).toHaveLength(0);
    // Le principal n'a pas été confirmé : le colocataire n'a pas été écrit non plus.
    expect(fournisseur.acceptes).toHaveLength(1);

    fournisseur.definirMode("normal");
    await GET(appel("appels"));
    expect(bilanConsigne()).toMatchObject({ envoyes: 1, echecs: 0 });
    expect(appelsDe("marquer_appel_envoye")).toHaveLength(1);
    expect(fournisseur.acceptes.map((m) => m.to[0]).sort()).toEqual(["colocataire@exemple.fr", "locataire@exemple.fr"]);
  });
});

describe("relances de loyer", () => {
  const ligne = {
    bail_id: "bail-1", organization_id: "org-1", niveau: "relance_2", destinataire: "locataire@exemple.fr", prenom: "Marc",
    emetteur: "Agence Alpha", lot: "Lot A", periode: "2026-09-01", date_echeance: "2026-09-05", reste: "700.00", jours_retard: 40,
    total_du: "700.00", autres_destinataires: ["colocataire@exemple.fr"], garants: ["caution@exemple.fr"], locataire: "Marc Dupont",
  };
  function banc(trace: { erreur: boolean }) {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "relances_loyer_dues") return { data: [ligne], error: null };
      if (fn === "relance_loyer_consigner") return { error: trace.erreur ? { message: "verrou" } : null };
      return { data: null, error: null };
    });
  }

  it("locataire, colocataire et caution ont chacun leur clé ; la reprise après une consignation en échec ne double rien", async () => {
    const { traiterRelances: GET } = await import("../src/lib/missions-planifiees/relances");
    banc({ erreur: true });
    await GET(appel("relances"));
    const premiere = fournisseur.cles();
    expect(premiere).toHaveLength(3);
    expect(new Set(premiere).size).toBe(3);
    for (const cle of premiere) {
      expect(cle).toMatch(/^relance\/bail-1\/relance_2\/2026-09-05\/(locataire\/70000\/70000|caution\/70000)\/[0-9a-f]{64}$/);
      expect(cle).not.toContain("@");
    }
    expect(premiere.filter((c) => c.includes("/caution/"))).toHaveLength(1);
    await GET(appel("relances"));
    expect(fournisseur.cles().slice(3)).toEqual(premiere);
    expect(fournisseur.acceptes).toHaveLength(3);
  });

  it("le reste dû change entre deux passes (un règlement partiel est arrivé) : la relance part au bon montant, le service ne refuse pas", async () => {
    const { traiterRelances: GET } = await import("../src/lib/missions-planifiees/relances");
    let courante = { ...ligne, autres_destinataires: [], garants: [] };
    let consignationEnErreur = true;
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "relances_loyer_dues") return { data: [courante], error: null };
      if (fn === "relance_loyer_consigner") return { error: consignationEnErreur ? { message: "verrou" } : null };
      return { data: null, error: null };
    });
    await GET(appel("relances"));
    expect(fournisseur.acceptes).toHaveLength(1);

    consignationEnErreur = false;
    courante = { ...courante, reste: "400.00", total_du: "400.00" };
    fournisseur.avancer(3_600_000);
    await GET(appel("relances"));
    expect(bilanConsigne()).toMatchObject({ envoyees: 1, echecs: 0 });
    expect(bilanConsigne().echecs_detail).toBeUndefined();
    expect(appelsDe("relance_loyer_consigner")).toHaveLength(2);
    expect(fournisseur.acceptes).toHaveLength(2);
    expect(new Set(fournisseur.cles()).size).toBe(2);
  });

  it("l'information de la caution suit aussi le total dû qu'elle annonce", async () => {
    const { traiterRelances: GET } = await import("../src/lib/missions-planifiees/relances");
    let courante = { ...ligne, autres_destinataires: [] };
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "relances_loyer_dues") return { data: [courante], error: null };
      if (fn === "relance_loyer_consigner") return { error: { message: "verrou" } };
      return { data: null, error: null };
    });
    await GET(appel("relances"));
    courante = { ...courante, total_du: "1400.00" };
    await GET(appel("relances"));
    const caution = fournisseur.acceptes.filter((m) => m.to[0] === "caution@exemple.fr");
    expect(caution).toHaveLength(2);
    expect(caution[0].cle).not.toBe(caution[1].cle);
  });

  it("un envoi accepté mais coupé par le délai : rien n'est consigné, la reprise ne double pas", async () => {
    const { traiterRelances: GET } = await import("../src/lib/missions-planifiees/relances");
    banc({ erreur: false });
    fournisseur.definirMode("accepte-puis-muet");
    await GET(appel("relances"));
    expect(bilanConsigne()).toMatchObject({ envoyees: 0, echecs: 1 });
    expect((bilanConsigne().echecs_detail as { motif: string }[])[0].motif).toMatch(MOTIF_DELAI);
    expect(appelsDe("relance_loyer_consigner")).toHaveLength(0);

    fournisseur.definirMode("normal");
    await GET(appel("relances"));
    expect(bilanConsigne()).toMatchObject({ envoyees: 1, echecs: 0 });
    expect(appelsDe("relance_loyer_consigner")).toHaveLength(1);
    expect(fournisseur.acceptes.map((m) => m.to[0]).sort()).toEqual(["caution@exemple.fr", "colocataire@exemple.fr", "locataire@exemple.fr"]);
  });
});

describe("rappels de rendez-vous", () => {
  const base = {
    intervention_id: "iv-1", organization_id: "org-1", echeance: "veille", prenom: null, emetteur: "Agence Alpha", artisan: "Plomberie Durand",
    lot: "Lot 3", adresse_bien: "9 rue du Rappel", debut_prevu: "2026-10-20T08:00:00+00:00", fin_prevue: "2026-10-20T10:00:00+00:00",
    incident_numero: "INC-001", categorie: "plomberie_canalisation",
  };
  const lignes = [
    { ...base, destinataire: "locataire", adresse: "locataire@exemple.fr", prenom: "Marc" },
    { ...base, destinataire: "artisan", adresse: "artisan@exemple.fr" },
  ];
  function banc(trace: { erreur: boolean }) {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "rendez_vous_a_rappeler") return { data: lignes, error: null };
      if (fn === "marquer_rappel_envoye") return { error: trace.erreur ? { message: "verrou" } : null };
      return { data: null, error: null };
    });
  }

  it("le locataire et l'artisan ont chacun leur clé ; un rappel non tracé, repris, n'est envoyé qu'une fois", async () => {
    const { traiterRappels: GET } = await import("../src/lib/missions-planifiees/rappels");
    banc({ erreur: true });
    await GET(appel("rappels"));
    const premiere = fournisseur.cles();
    expect(premiere).toEqual([
      "rappel/iv-1/veille/locataire/2026-10-20T08:00:00.000Z",
      "rappel/iv-1/veille/artisan/2026-10-20T08:00:00.000Z",
    ]);
    await GET(appel("rappels"));
    expect(fournisseur.cles().slice(2)).toEqual(premiere);
    expect(fournisseur.acceptes).toHaveLength(2);
  });

  it("un envoi accepté mais coupé par le délai : rappel non tracé, repris sans doublon", async () => {
    const { traiterRappels: GET } = await import("../src/lib/missions-planifiees/rappels");
    banc({ erreur: false });
    fournisseur.definirMode("accepte-puis-muet");
    await GET(appel("rappels"));
    expect(bilanConsigne()).toMatchObject({ rappeles: 0, echecs: 2 });
    expect(appelsDe("marquer_rappel_envoye")).toHaveLength(0);
    expect(fournisseur.acceptes).toHaveLength(2);

    fournisseur.definirMode("normal");
    await GET(appel("rappels"));
    expect(bilanConsigne()).toMatchObject({ rappeles: 2, echecs: 0 });
    expect(appelsDe("marquer_rappel_envoye")).toHaveLength(2);
    expect(fournisseur.acceptes).toHaveLength(2);
  });
});
