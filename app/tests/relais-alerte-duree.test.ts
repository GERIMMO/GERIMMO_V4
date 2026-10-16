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
 *  — en temps réel, par le vrai `envoyerEmail` et un faux `fetch` lent : la durée réelle reste sous la durée donnée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lireAdressesRelais } from "../src/lib/relais-alerte";
import { passerAlerteRelais } from "../src/lib/relais-alerte-envoi";
import { DELAI_MAX_FOURNISSEUR_MS } from "../src/lib/email";
import { maxDuration } from "../src/app/api/cron/relais/route";

const MATIN = new Date("2026-10-15T03:05:00Z"); // 5 h 05 à Paris (heure d'été)
const JOUR = "2026-10-15";
const ADRESSES = lireAdressesRelais("relais@example.com, second@example.org");
const DUREE_ROUTE_MS = maxDuration * 1000;

type Reponse = { data: unknown; error: unknown };

/**
 * Une base simulée où, à chaque tour, une urgence attend son e-mail immédiat et d'autres restent en file (le pire cas :
 * les trois tours ont lieu), et où un arrêt d'urgence actif donne un point à signaler (l'e-mail de 5 h part).
 */
function basePireCas() {
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
        return reponses[nom]?.() ?? { data: null, error: { message: `fonction inattendue ${nom}` } };
      },
    },
  };
}
const terminaison = (appels: [string, Record<string, unknown> | undefined][]) => appels.find(([n]) => n === "terminer_alerte_relais")?.[1];

/**
 * Une horloge simulée et un faux service d'e-mail qui la fait avancer. Chaque appel dure, sur l'horloge simulée :
 *  — « lent » : juste moins que son délai maximal (puis il réussit) ;
 *  — « muet » : tout son délai maximal (puis il échoue, envoi incertain, comme `envoyerEmail` à l'expiration du délai).
 * Sans délai maximal, l'appel dure le délai par défaut d'`envoyerEmail`. Deux appels lancés ensemble se recouvrent.
 */
function serviceSimule(mode: "lent" | "muet") {
  let t = 1_000_000;
  const delais: (number | undefined)[] = [];
  const horloge = () => t;
  const envoyer = async (p: { delaiMaxMs?: number }) => {
    delais.push(p.delaiMaxMs);
    const debut = t;
    const duree = p.delaiMaxMs ?? DELAI_MAX_FOURNISSEUR_MS;
    await Promise.resolve();
    t = Math.max(t, debut + (mode === "lent" ? duree - 1 : duree));
    return mode === "lent" ? { id: "message" } : { erreur: "Le service d’e-mail n’a pas répondu à temps.", incertain: true as const };
  };
  return { horloge, envoyer, delais, debut: t };
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
  it("la route est coupée à 60 s", () => {
    expect(DUREE_ROUTE_MS).toBe(60_000);
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
    // Chaque appel au service d'e-mail porte un délai maximal borné.
    expect(s.delais.length).toBeGreaterThanOrEqual(3);
    for (const d of s.delais) {
      expect(d).toBeDefined();
      expect(d!).toBeGreaterThan(0);
      expect(d!).toBeLessThanOrEqual(10_000);
    }
  });

  it("pire cas, service muet : chaque appel est coupé à son délai, fini sous 60 s, la ligne du jour est close « echec »", async () => {
    const s = serviceSimule("muet");
    const b = basePireCas();
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test", envoyer: s.envoyer as never, horloge: s.horloge });
    expect(s.horloge() - s.debut).toBeLessThanOrEqual(DUREE_ROUTE_MS * 0.75);
    expect(r).toMatchObject({ statut: "echec", envoyes: 0 });
    expect(terminaison(b.appels)).toMatchObject({ p_statut: "echec", p_envoyes: 0 });
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
