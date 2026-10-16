/**
 * Relais de 5 h : le passage finit toujours avant la coupure de la route (tour final de vérification du 16/10/2026).
 *
 * Constat : /api/cron/relais est coupée à 60 s (maxDuration) et appelait `passerAlerteRelais({ db })` sans délai
 * maximal. Le passage enchaînait l'e-mail immédiat des urgences (jusqu'à 3 tours, 15 s au plus par appel) puis l'e-mail
 * de 5 h, adresse après adresse (15 s au plus chacune) : environ 75 s dans le pire cas. Avec un service d'e-mail lent,
 * la fonction était coupée avant `terminer_alerte_relais` ; la ligne du jour restait « en_cours » et, l'appel de 04 h UTC
 * répondant « hors créneau » en été, l'alerte du jour était perdue sans bruit.
 *
 * Ces tests jouent le pire cas avec un faux fournisseur lent (aucun envoi réel) :
 *  — sur une horloge simulée, avec les réglages de production : un service qui répond juste avant chaque délai maximal,
 *    puis un service muet ; le passage finit sous 60 s et consigne son résultat ;
 *  — sur la même horloge, une base lente (relecture du 16/10 : avec une base qui répond en 0 ms, le pire cas tient sous
 *    45 s par construction et l'échéance n'est jamais atteinte) : les urgences s'arrêtent à leur échéance, l'e-mail de
 *    5 h est borné au temps restant avant les trois quarts de la durée (45 s), jamais en dessous d'une seconde ;
 *  — `envoyerUrgencesRelais` seul, avec une échéance : aucun tour commencé à moins d'une seconde, chaque appel borné au
 *    temps restant ;
 *  — en temps réel, par le vrai `envoyerEmail` et un faux `fetch` lent : la durée réelle reste sous la durée donnée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lireAdressesRelais } from "../src/lib/relais-alerte";
import { DELAI_APPEL_RELAIS_MS, DUREE_MAX_PASSAGE_RELAIS_MS, passerAlerteRelais } from "../src/lib/relais-alerte-envoi";
import { envoyerUrgencesRelais } from "../src/lib/relais-urgences-envoi";
import { DELAI_MAX_FOURNISSEUR_MS } from "../src/lib/email";
import { maxDuration } from "../src/app/api/cron/relais/route";

const MATIN = new Date("2026-10-15T03:05:00Z"); // 5 h 05 à Paris (heure d'été)
const JOUR = "2026-10-15";
const ADRESSES = lireAdressesRelais("relais@example.com, second@example.org");
const DUREE_ROUTE_MS = maxDuration * 1000;

type Reponse = { data: unknown; error: unknown };

/** Une horloge simulée, en millisecondes, que la base et le service d'e-mail simulés font avancer. */
function horlogeSimulee() {
  let t = 1_000_000;
  return { debut: t, lire: () => t, avancer: (ms: number) => { t += ms; }, porterA: (v: number) => { t = Math.max(t, v); } };
}
type HorlogeSimulee = ReturnType<typeof horlogeSimulee>;

/**
 * Une base simulée où, à chaque tour, une urgence attend son e-mail immédiat et d'autres restent en file (le pire cas :
 * les trois tours ont lieu), et où un arrêt d'urgence actif donne un point à signaler (l'e-mail de 5 h part).
 * `lenteurs` : ce que dure chaque fonction, sur l'horloge simulée (0 ms par défaut).
 */
function basePireCas(lenteurs: Record<string, number> = {}, h?: HorlogeSimulee) {
  const appels: [string, Record<string, unknown> | undefined][] = [];
  let envoi = 0;
  const reponses: Record<string, () => Reponse> = {
    reserver_alerte_relais: () => ({ data: { reserve: true, jour: JOUR, tentative: 1 }, error: null }),
    traiter_vacances: () => ({ data: {}, error: null }),
    prendre_urgences_relais: () => ({
      data: { pris: true, envoi: `envoi-${++envoi}`, tentative: 1, reprise: false, urgences: [{ nature: "signalement_manuel", posee_le: "2026-10-15T02:58:00Z" }], en_attente: 5 },
      error: null,
    }),
    terminer_urgences_relais: () => ({ data: { termine: true, statut: "envoye" }, error: null }),
    sentinelle_relais: () => ({
      data: { alertes: { ouvertes: 0, escaladees: 0, non_acheminees: 0 }, arrets: [{ cle: "global", depuis: "2026-10-14T20:00:00Z" }], taches_base_lisibles: true, taches_base: [] },
      error: null,
    }),
    urgences_relais_recentes: () => ({ data: { urgences: [], total: 0 }, error: null }),
    terminer_alerte_relais: () => ({ data: null, error: null }),
    urgences_relais_au_quotidien: () => ({ data: null, error: null }),
  };
  const from = () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "like", "in", "is", "gte", "order", "limit", "eq"]) q[k] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
  };
  return {
    appels,
    db: {
      from,
      rpc: async (nom: string, args?: Record<string, unknown>) => {
        appels.push([nom, args]);
        h?.avancer(lenteurs[nom] ?? 0);
        return reponses[nom]?.() ?? { data: null, error: { message: `fonction inattendue ${nom}` } };
      },
    },
  };
}
const terminaison = (appels: [string, Record<string, unknown> | undefined][]) => appels.find(([n]) => n === "terminer_alerte_relais")?.[1];
const nombreDAppels = (appels: [string, Record<string, unknown> | undefined][], nom: string) => appels.filter(([n]) => n === nom).length;

/**
 * Une horloge simulée et un faux service d'e-mail qui la fait avancer. Chaque appel dure, sur l'horloge simulée :
 *  — « lent » : juste moins que son délai maximal (puis il réussit) ;
 *  — « muet » : tout son délai maximal (puis il échoue, envoi incertain, comme `envoyerEmail` à l'expiration du délai).
 * Sans délai maximal, l'appel dure le délai par défaut d'`envoyerEmail`. Deux appels lancés ensemble se recouvrent.
 * Chaque appel est noté : l'e-mail immédiat (`urgence`) ou celui de 5 h (`quotidien`, d'après sa clé d'envoi), l'heure de
 * son début, son délai maximal et l'heure de sa fin.
 */
function serviceSimule(mode: "lent" | "muet", h: HorlogeSimulee = horlogeSimulee()) {
  const delais: (number | undefined)[] = [];
  const appels: { sorte: "urgence" | "quotidien"; debut: number; delai: number | undefined; fin: number }[] = [];
  const envoyer = async (p: { delaiMaxMs?: number; cleIdempotence?: string }) => {
    delais.push(p.delaiMaxMs);
    const debut = h.lire();
    const duree = p.delaiMaxMs ?? DELAI_MAX_FOURNISSEUR_MS;
    await Promise.resolve();
    const fin = Math.max(debut, debut + (mode === "lent" ? duree - 1 : duree));
    h.porterA(fin);
    appels.push({ sorte: p.cleIdempotence?.startsWith("relais-urgence-") ? "urgence" : "quotidien", debut, delai: p.delaiMaxMs, fin });
    return mode === "lent" ? { id: "message" } : { erreur: "Le service d’e-mail n’a pas répondu à temps.", incertain: true as const };
  };
  return { horloge: h.lire, envoyer, delais, appels, debut: h.debut };
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("relais de 5 h : le passage finit avant la coupure de la route", () => {
  it("la route est coupée à 60 s, la durée que le passage prend par défaut ; chaque appel au service d'e-mail, 10 s au plus", () => {
    expect(DUREE_ROUTE_MS).toBe(60_000);
    expect(DUREE_MAX_PASSAGE_RELAIS_MS).toBe(DUREE_ROUTE_MS);
    expect(DELAI_APPEL_RELAIS_MS).toBe(10_000);
  });

  it("pire cas, service lent qui répond juste avant chaque délai : fini sous 60 s, trois tours d'urgences, résultat consigné", async () => {
    const s = serviceSimule("lent");
    const b = basePireCas();
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, horloge: s.horloge });
    const duree = s.horloge() - s.debut;
    expect(duree).toBeLessThan(DUREE_ROUTE_MS);
    // Une marge reste pour les lectures et l'écriture du résultat en base : un quart de la durée de la route.
    expect(duree).toBeLessThanOrEqual(DUREE_ROUTE_MS * 0.75);
    expect(r).toMatchObject({ jour: JOUR, statut: "envoye", envoyes: 2, destinataires: 2 });
    expect(terminaison(b.appels)).toMatchObject({ p_jour: JOUR, p_statut: "envoye", p_envoyes: 2 });
    // Les trois tours d'urgences ont lieu (deux adresses chacun), puis l'e-mail de 5 h (deux adresses) : huit appels,
    // chacun borné au délai maximal d'un appel (10 s), aucun au-delà des 45 s.
    expect(nombreDAppels(b.appels, "prendre_urgences_relais")).toBe(3);
    expect(s.delais).toEqual(Array(8).fill(10_000));
    expect(s.appels.map((a) => a.sorte)).toEqual([...Array(6).fill("urgence"), ...Array(2).fill("quotidien")]);
    for (const a of s.appels) expect(a.fin).toBeLessThanOrEqual(s.debut + DUREE_ROUTE_MS * 0.75);
  });

  it("pire cas, service muet : chaque appel est coupé à son délai, fini sous 60 s, la ligne du jour est close « echec »", async () => {
    const s = serviceSimule("muet");
    const b = basePireCas();
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, horloge: s.horloge });
    expect(s.horloge() - s.debut).toBeLessThanOrEqual(DUREE_ROUTE_MS * 0.75);
    expect(r).toMatchObject({ statut: "echec", envoyes: 0 });
    expect(terminaison(b.appels)).toMatchObject({ p_statut: "echec", p_envoyes: 0 });
  });

  it("base lente : les urgences s'arrêtent à leur échéance, l'e-mail de 5 h est borné au temps restant avant 45 s, le résultat est consigné", async () => {
    // Sur l'horloge simulée, réglages de production (60 s, 10 s par appel) ; la base met 12 s à actualiser le relais, 4 s
    // à prendre un envoi et 4 s à lire la sentinelle. Échéance des urgences : 45 s moins un appel, soit 35 s.
    //   0 s → 12 s     traiter_vacances
    //   tour 1         reste 23 s avant 35 s : appel borné à 10 s ; prise 12 → 16 s ; e-mails 16 → 25,999 s
    //   tour 2         reste 9,001 s : appel borné à 9,001 s ; prise → 29,999 s ; e-mails → 38,999 s
    //   tour 3         reste moins d'une seconde : pas commencé (la file attend le passage suivant)
    //   sentinelle     38,999 → 42,999 s ; e-mail de 5 h borné aux 2,001 s qui restent avant 45 s ; fini à 44,999 s
    const h = horlogeSimulee();
    const s = serviceSimule("lent", h);
    const b = basePireCas({ traiter_vacances: 12_000, prendre_urgences_relais: 4_000, sentinelle_relais: 4_000 }, h);
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, horloge: s.horloge });
    const finDesEnvois = s.debut + DUREE_ROUTE_MS * 0.75;

    // Les urgences : deux tours seulement, le second borné au temps restant avant leur échéance.
    expect(nombreDAppels(b.appels, "prendre_urgences_relais")).toBe(2);
    expect(s.appels.filter((a) => a.sorte === "urgence").map((a) => a.delai)).toEqual([10_000, 10_000, 9_001, 9_001]);
    // L'e-mail de 5 h : chaque appel borné au temps restant avant 45 s (moins que les 10 s d'un appel).
    const quotidiens = s.appels.filter((a) => a.sorte === "quotidien");
    expect(quotidiens).toHaveLength(2);
    for (const a of quotidiens) {
      expect(a.delai).toBe(finDesEnvois - a.debut);
      expect(a.delai!).toBeLessThan(DELAI_APPEL_RELAIS_MS);
    }
    // Aucun appel au service d'e-mail ne dépasse les 45 s ; le résultat est consigné.
    for (const a of s.appels) expect(a.fin).toBeLessThanOrEqual(finDesEnvois);
    expect(s.horloge() - s.debut).toBeLessThan(DUREE_ROUTE_MS);
    expect(r).toMatchObject({ jour: JOUR, statut: "envoye", envoyes: 2, destinataires: 2 });
    expect(terminaison(b.appels)).toMatchObject({ p_jour: JOUR, p_statut: "envoye", p_envoyes: 2 });
  });

  it("base très lente : 45 s dépassées, l'e-mail de 5 h part quand même avec une seconde, jamais un délai négatif ; le résultat est consigné", async () => {
    // 7 s pour actualiser le relais, prendre un envoi et lire la sentinelle : les e-mails de 5 h commencent à 47,998 s,
    // après la fin des envois. L'appel garde une seconde (un délai négatif ferait échouer l'envoi à coup sûr :
    // `AbortSignal.timeout` le refuse).
    const h = horlogeSimulee();
    const s = serviceSimule("lent", h);
    const b = basePireCas({ traiter_vacances: 7_000, prendre_urgences_relais: 7_000, sentinelle_relais: 7_000 }, h);
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, horloge: s.horloge });

    expect(nombreDAppels(b.appels, "prendre_urgences_relais")).toBe(2);
    const quotidiens = s.appels.filter((a) => a.sorte === "quotidien");
    expect(quotidiens.map((a) => a.delai)).toEqual([1_000, 1_000]);
    expect(quotidiens[0].debut).toBeGreaterThan(s.debut + DUREE_ROUTE_MS * 0.75);
    expect(s.horloge() - s.debut).toBeLessThan(DUREE_ROUTE_MS);
    expect(r).toMatchObject({ statut: "envoye", envoyes: 2 });
    expect(terminaison(b.appels)).toMatchObject({ p_jour: JOUR, p_statut: "envoye", p_envoyes: 2 });
  });

  it("en temps réel, par le vrai envoi : un service lent n'empêche pas de finir sous la durée donnée", async () => {
    // Un faux service qui répond en 450 ms (réellement), ou échoue quand le délai maximal de l'appelant expire avant.
    const recus: { avecDelai: boolean }[] = [];
    vi.stubGlobal("fetch", (_url: unknown, init: RequestInit = {}) => new Promise<Response>((ok, ko) => {
      recus.push({ avecDelai: Boolean(init.signal) });
      const minuterie = setTimeout(() => ok(new Response(JSON.stringify({ id: "message" }), { status: 200 })), 450);
      init.signal?.addEventListener("abort", () => { clearTimeout(minuterie); ko(init.signal!.reason); }, { once: true });
    }));
    const b = basePireCas();
    const debut = Date.now();
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test", delaiMaxMs: 600, dureeMaxMs: 2_000 });
    const duree = Date.now() - debut;
    // Sans borne, trois tours d'urgences puis deux adresses l'une après l'autre : 5 × 450 ms, au-delà des 2 s données.
    expect(duree).toBeLessThan(2_000);
    expect(terminaison(b.appels)).toMatchObject({ p_statut: "envoye", p_envoyes: 2 });
    expect(r).toMatchObject({ statut: "envoye" });
    expect(recus.length).toBeGreaterThanOrEqual(3);
    expect(recus.every((x) => x.avecDelai)).toBe(true);
  }, 10_000);
});

describe("l'e-mail immédiat des urgences, avec une échéance", () => {
  /** Une base où une urgence attend son e-mail immédiat ; `en_attente` : celles qui restent ensuite en file. */
  function baseUneUrgence(en_attente = 0) {
    const appels: string[] = [];
    let envoi = 0;
    return {
      appels,
      db: {
        rpc: async (nom: string) => {
          appels.push(nom);
          if (nom === "prendre_urgences_relais") {
            return { data: { pris: true, envoi: `envoi-${++envoi}`, reprise: false, urgences: [{ nature: "signalement_manuel", posee_le: "2026-10-15T02:58:00Z" }], en_attente }, error: null };
          }
          if (nom === "terminer_urgences_relais") return { data: { termine: true, statut: "envoye" }, error: null };
          return { data: null, error: { message: `fonction inattendue ${nom}` } };
        },
      },
    };
  }

  it("moins d'une seconde avant l'échéance : arrêt « delai », aucun envoi pris, aucun appel au service d'e-mail", async () => {
    const h = horlogeSimulee();
    const s = serviceSimule("lent", h);
    const b = baseUneUrgence();
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, delaiMaxMs: 10_000, echeance: h.lire() + 999, horloge: h.lire });
    expect(r).toEqual({ arret: "delai", envois: [] });
    expect(b.appels).not.toContain("prendre_urgences_relais");
    expect(s.appels).toHaveLength(0);
  });

  it("une seconde pile avant l'échéance : le tour a lieu, chaque appel borné à cette seconde", async () => {
    const h = horlogeSimulee();
    const s = serviceSimule("lent", h);
    const b = baseUneUrgence();
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, delaiMaxMs: 10_000, echeance: h.lire() + 1_000, horloge: h.lire });
    expect(r.arret).toBe("rien");
    expect(s.delais).toEqual([1_000, 1_000]);
  });

  it("chaque appel est borné au temps restant avant l'échéance, tour après tour ; ensuite, plus aucun tour", async () => {
    // Échéance à 14 s : tour 1 borné à 10 s (le délai d'un appel), fini à 9,999 s ; tour 2 borné aux 4,001 s qui restent,
    // fini à 13,999 s ; tour 3 pas commencé (moins d'une seconde).
    const h = horlogeSimulee();
    const s = serviceSimule("lent", h);
    const b = baseUneUrgence(5);
    const echeance = h.lire() + 14_000;
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, delaiMaxMs: 10_000, echeance, horloge: h.lire });
    expect(r.arret).toBe("delai");
    expect(r.envois).toHaveLength(2);
    expect(b.appels.filter((n) => n === "prendre_urgences_relais")).toHaveLength(2);
    expect(s.delais).toEqual([10_000, 10_000, 4_001, 4_001]);
    for (const a of s.appels) expect(a.fin).toBeLessThanOrEqual(echeance);
  });
});
