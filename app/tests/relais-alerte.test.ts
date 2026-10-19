/**
 * D46-B, partie « alerte e-mail du relais » (décision du dirigeant du 15/10/2026) — le serveur.
 *
 *  — l'heure : l'envoi ne part que s'il est 5 h à Paris ; Vercel appelle à 03 h et 04 h UTC, l'une des deux tombe à 5 h
 *    à Paris, été comme hiver, y compris les jours de changement d'heure ;
 *  — les adresses : une variable du serveur (GERIMMO_RELAIS_EMAILS), virgules, espaces tolérés, invalides ignorées et
 *    comptées ; à l'écran, toujours masquées ;
 *  — le contenu : des compteurs et des libellés de tâche, un lien vers la console ; rien à signaler, rien ne part ;
 *  — l'idempotence : au plus un e-mail par jour de Paris (réservation en base, clé d'envoi stable par adresse) ;
 *  — l'arrêt d'urgence ne coupe pas l'alerte : il en est l'un des sujets ;
 *  — aucun envoi réel : `fetch` est remplacé par le faux fournisseur (tests/fixtures/faux-fournisseur-email.ts).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";
import {
  descriptionRelais,
  estHeureDuRelais,
  htmlAlerteRelais,
  lireAdressesRelais,
  masquerAdresse,
  pointsDuRelais,
  type ConstatRelais,
} from "../src/lib/relais-alerte";
import { constaterRelais, passerAlerteRelais } from "../src/lib/relais-alerte-envoi";
import { TACHES } from "../src/lib/sante-service";
import { composantesParis } from "../src/lib/heure-paris-calcul";

const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── L'heure de Paris ───────────────────────────────────────────────────────

describe("5 h à Paris, été comme hiver", () => {
  it("en heure d'été, 03 h UTC est 5 h à Paris ; en heure d'hiver, 04 h UTC", () => {
    expect(estHeureDuRelais(new Date("2026-10-15T03:00:00Z"))).toBe(true);
    expect(estHeureDuRelais(new Date("2026-10-15T04:00:00Z"))).toBe(false);
    expect(estHeureDuRelais(new Date("2026-12-15T03:00:00Z"))).toBe(false);
    expect(estHeureDuRelais(new Date("2026-12-15T04:00:00Z"))).toBe(true);
    // L'heure entière compte : 5 h 59 oui, 6 h non, 4 h 59 non.
    expect(estHeureDuRelais(new Date("2026-10-15T03:59:59Z"))).toBe(true);
    expect(estHeureDuRelais(new Date("2026-10-15T04:00:00Z"))).toBe(false);
    expect(estHeureDuRelais(new Date("2026-10-15T02:59:59Z"))).toBe(false);
  });

  it("le 25 octobre 2026 (retour à l'heure d'hiver à 3 h) : 5 h à Paris tombe à 04 h UTC", () => {
    expect(estHeureDuRelais(new Date("2026-10-24T03:00:00Z"))).toBe(true);
    expect(estHeureDuRelais(new Date("2026-10-25T03:00:00Z"))).toBe(false);
    expect(composantesParis(new Date("2026-10-25T03:00:00Z")).heure).toBe(4);
    expect(estHeureDuRelais(new Date("2026-10-25T04:00:00Z"))).toBe(true);
    expect(estHeureDuRelais(new Date("2026-10-26T04:00:00Z"))).toBe(true);
  });

  it("le 28 mars 2027 (passage à l'heure d'été à 2 h) : 5 h à Paris tombe à 03 h UTC", () => {
    expect(estHeureDuRelais(new Date("2027-03-27T04:00:00Z"))).toBe(true);
    expect(estHeureDuRelais(new Date("2027-03-28T03:00:00Z"))).toBe(true);
    expect(estHeureDuRelais(new Date("2027-03-28T04:00:00Z"))).toBe(false);
    expect(composantesParis(new Date("2027-03-28T04:00:00Z")).heure).toBe(6);
  });

  it("vercel.json appelle la route du relais à 03 h et 04 h UTC : chaque jour, exactement une des deux tombe à 5 h à Paris", () => {
    const relais = vercel.crons.filter((c) => new URL(`https://x${c.path}`).pathname === "/api/cron/relais");
    expect(relais.map((c) => c.schedule).sort()).toEqual(["0 3 * * *", "0 4 * * *"]);
    // Deux années pleines, dont les quatre changements d'heure (même avec une gigue de 59 minutes de Vercel).
    for (let jour = Date.UTC(2026, 0, 1); jour < Date.UTC(2028, 0, 1); jour += 86_400_000) {
      for (const gigue of [0, 59 * 60_000]) {
        const a = estHeureDuRelais(new Date(jour + 3 * 3_600_000 + gigue));
        const b = estHeureDuRelais(new Date(jour + 4 * 3_600_000 + gigue));
        expect(Number(a) + Number(b), new Date(jour).toISOString()).toBe(1);
      }
    }
  });
});

// ── Les adresses ───────────────────────────────────────────────────────────

describe("les adresses du relais", () => {
  it("variable absente ou vide : relais non configuré", () => {
    for (const v of [undefined, null, "", "   ", ", ,"]) {
      expect(lireAdressesRelais(v), String(v)).toEqual({ valides: [], invalides: 0, configure: false });
    }
  });

  it("lit une liste séparée par des virgules, espaces tolérés, doublons retirés", () => {
    expect(lireAdressesRelais(" relais@example.com ,second@example.org,RELAIS@example.com ")).toEqual({
      valides: ["relais@example.com", "second@example.org"], invalides: 0, configure: true,
    });
  });

  it("ignore et compte les adresses invalides", () => {
    expect(lireAdressesRelais("pas-une-adresse, relais@example.com, @example.com")).toEqual({
      valides: ["relais@example.com"], invalides: 2, configure: true,
    });
    expect(lireAdressesRelais("pas-une-adresse")).toEqual({ valides: [], invalides: 1, configure: false });
  });

  it("au plus dix adresses : les suivantes sont ignorées et comptées", () => {
    const liste = Array.from({ length: 12 }, (_, i) => `relais${i}@example.com`).join(",");
    const lu = lireAdressesRelais(liste);
    expect(lu.valides).toHaveLength(10);
    expect(lu.invalides).toBe(2);
  });

  // Décision du 15/10 : les deux premiers et les deux derniers caractères avant @ (deux adresses du même domaine restent
  // distinctes), jamais l'adresse entière ; voir aussi tests/relais-urgences.test.ts.
  it("masque une adresse : deux premiers et deux derniers caractères avant @, puis le domaine", () => {
    expect(masquerAdresse("relais@example.com")).toBe("re•••is@example.com");
    expect(masquerAdresse("t@example.org")).toBe("•••@example.org");
  });

  it("la description dit vrai : nombre d'adresses masquées, ou relais non configuré", () => {
    expect(descriptionRelais(lireAdressesRelais("relais@example.com, second@example.org"))).toBe(
      "Alerte e-mail quotidienne à 5 h (heure de Paris) vers 2 adresses : re•••is@example.com, se•••nd@example.org."
    );
    expect(descriptionRelais(lireAdressesRelais("relais@example.com"))).toBe(
      "Alerte e-mail quotidienne à 5 h (heure de Paris) vers 1 adresse : re•••is@example.com."
    );
    expect(descriptionRelais(lireAdressesRelais(undefined))).toMatch(/^Relais non configuré/);
    expect(descriptionRelais(lireAdressesRelais("relais@example.com, second@example.org"))).not.toContain("relais@");
  });
});

// ── Le contenu ─────────────────────────────────────────────────────────────

const RIEN: ConstatRelais = {
  arrets: [],
  alertes: { ouvertes: 0, escaladees: 0, non_acheminees: 0 },
  taches: [],
  lecturesImpossibles: [],
  relaisNonActualise: false,
};

describe("le contenu de l'alerte", () => {
  it("rien à signaler : zéro point", () => {
    expect(pointsDuRelais(RIEN)).toBe(0);
  });

  it("compte chaque arrêt, chaque alerte non accusée, chaque tâche et chaque contrôle impossible", () => {
    expect(pointsDuRelais({
      arrets: [{ cle: "global", depuis: "2026-10-14T20:10:00Z" }],
      alertes: { ouvertes: 2, escaladees: 1, non_acheminees: 0 },
      taches: [{ libelle: "Quittances", etat: "echec" }],
      lecturesImpossibles: ["x"],
      relaisNonActualise: true,
    })).toBe(1 + 3 + 1 + 1 + 1);
  });

  it("ne porte que des libellés, des compteurs et le lien de la console", () => {
    const html = htmlAlerteRelais({
      ...RIEN,
      arrets: [{ cle: "global", depuis: "2026-10-14T20:10:00Z" }],
      alertes: { ouvertes: 2, escaladees: 1, non_acheminees: 0 },
      taches: [
        { libelle: "Quittances", etat: "echec" },
        { libelle: "Purge quotidienne des données dont la durée de conservation est échue", etat: "absente" },
        { libelle: "Expiration des devis d’artisans", etat: "non_programmee" },
      ],
    }, new Date("2026-10-15T03:00:00Z"), "https://gerimmo.test/admin");
    expect(html).toContain("jeudi 15 octobre 2026");
    expect(html).toContain("Arrêt d’urgence en cours : Tous les traitements contrôlés");
    expect(html).toContain("14/10/2026 22:10");
    expect(html).toContain("À examiner : 2");
    expect(html).toContain("Escaladées (délai dépassé) : 1");
    expect(html).toContain("Quittances : en échec");
    expect(html).toContain("absente (pas passée à l’heure prévue)");
    expect(html).toContain("plus programmée dans la base");
    expect(html).toContain('href="https://gerimmo.test/admin"');
    expect(html).toContain("ni nom ni montant");
    expect(html).not.toMatch(/€|@/);
  });

  // M16 (audit du 19/10) : les demandes de contact du site vitrine non traitées, en nombre. Décision : UN point au
  // total dès qu'il en reste au moins une, quel que soit leur nombre (pas un point par demande) ; aucune urgence.
  it("des demandes de contact en attente : un seul point au total, aucun quand il n'en reste pas", () => {
    expect(pointsDuRelais({ ...RIEN, contacts: { en_attente: 0, depuis_plus_de_48h: 0 } })).toBe(0);
    expect(pointsDuRelais({ ...RIEN, contacts: { en_attente: 1, depuis_plus_de_48h: 0 } })).toBe(1);
    expect(pointsDuRelais({ ...RIEN, contacts: { en_attente: 7, depuis_plus_de_48h: 3 } })).toBe(1);
    // Il s'ajoute aux autres points, qui restent comptés un à un.
    expect(pointsDuRelais({ ...RIEN, taches: [{ libelle: "Quittances", etat: "echec" }], contacts: { en_attente: 2, depuis_plus_de_48h: 1 } })).toBe(2);
  });

  it("le corps dit « En attente de réponse : 2 (dont 1 depuis plus de 48 h) », sans nom ni adresse ; rien quand il n'y en a pas", () => {
    const html = htmlAlerteRelais({ ...RIEN, contacts: { en_attente: 2, depuis_plus_de_48h: 1 } }, new Date("2026-10-19T03:00:00Z"), "https://gerimmo.test/admin");
    expect(html).toContain("1 point à vérifier");
    expect(html).toContain("Demandes de contact du site vitrine");
    expect(html).toContain("En attente de réponse : 2 (dont 1 depuis plus de 48 h)");
    expect(html).not.toMatch(/€|@/);
    const sans = htmlAlerteRelais({ ...RIEN, contacts: { en_attente: 0, depuis_plus_de_48h: 0 } }, new Date("2026-10-19T03:00:00Z"), "https://gerimmo.test/admin");
    expect(sans).not.toContain("Demandes de contact du site vitrine");
    expect(sans).toContain("0 point à vérifier");
  });
});

// ── Le passage complet, avec un faux client de base et un faux fournisseur ───

type Reponse = { data: unknown; error: unknown };
type Options = {
  reservation?: Reponse;
  sentinelle?: Reponse;
  vacances?: Reponse;
  passages?: unknown[];
  journal?: unknown[];
  missions?: unknown[];
  /** Les tables dont la lecture échoue (`{ data: null, error }`). */
  tablesEnErreur?: string[];
  /** La fonction de la base dont l'appel lève une exception (connexion coupée). */
  leve?: string;
  /** Les urgences des dernières 24 h (`urgences_relais_recentes`). */
  recentes?: Reponse;
  /** Les demandes de contact du site vitrine non traitées (`demandes_contact_en_attente`, M16). */
  contacts?: Reponse;
};
const MATIN = new Date("2026-10-15T03:05:00Z"); // 5 h 05 à Paris
const JOUR = "2026-10-15";
const SAINE = {
  alertes: { ouvertes: 0, escaladees: 0, non_acheminees: 0 },
  arrets: [],
  taches_base_lisibles: true,
  taches_base: [{ tache: "retention-quotidienne", etat: "ok", echecs: 0 }],
};
/** Un passage réussi de chaque mission, deux heures avant le matin du relais. */
function passagesSains(maintenant = MATIN) {
  const le = new Date(maintenant.getTime() - 2 * 3_600_000).toISOString();
  return ["veille", "appels", "quittances", "relances", "rappels", "abonnements", "signatures", "marketing", "territoire", "purge"].map((mission) => ({
    mission, debut: le, fin: le, expiration: null, etat: "termine", compte: 0, bilan: { envoyees: 0 },
  }));
}
/** Les deux tâches suivies hors missions (journal technique) : le suivi des dossiers et la sauvegarde, passés à l'heure. */
function journalSain(maintenant = MATIN) {
  const le = new Date(maintenant.getTime() - 2 * 3_600_000).toISOString();
  return [
    { evenement: "tache_orchestrateur", details: { dossiers: 3, rapports_prepares: 0 }, created_at: le },
    { evenement: "tache_sauvegarde", details: { echecs: 0, octets: 1024, fichiers: 3, taches: 9 }, created_at: le },
  ];
}
function base(o: Options = {}) {
  const appels: [string, Record<string, unknown> | undefined][] = [];
  const reponses: Record<string, Reponse> = {
    reserver_alerte_relais: o.reservation ?? { data: { reserve: true, jour: JOUR, tentative: 1 }, error: null },
    sentinelle_relais: o.sentinelle ?? { data: SAINE, error: null },
    traiter_vacances: o.vacances ?? { data: {}, error: null },
    terminer_alerte_relais: { data: null, error: null },
    // L'e-mail immédiat des urgences (décision du 15/10) : la file est vide, aucune urgence dans les dernières 24 h.
    prendre_urgences_relais: { data: { pris: false, motif: "rien", en_attente: 0 }, error: null },
    urgences_relais_recentes: o.recentes ?? { data: { urgences: [], total: 0 }, error: null },
    // M16 : aucune demande de contact en attente (une demande traitée n'est pas comptée par la base).
    demandes_contact_en_attente: o.contacts ?? { data: { en_attente: 0, depuis_plus_de_48h: 0 }, error: null },
  };
  const tables: Record<string, unknown[]> = {
    tech_log: o.journal ?? journalSain(),
    agent_passages: o.passages ?? passagesSains(),
    agent_missions: o.missions ?? [],
  };
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "like", "in", "is", "gte", "order", "limit", "eq"]) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) =>
      Promise.resolve(o.tablesEnErreur?.includes(table) ? { data: null, error: { message: "lecture refusée" } } : { data: tables[table] ?? [], error: null }).then(ok);
    return q;
  };
  return {
    appels,
    db: {
      from,
      rpc: async (nom: string, args?: Record<string, unknown>) => {
        appels.push([nom, args]);
        if (o.leve === nom) throw new Error("connexion coupée");
        return reponses[nom] ?? { data: null, error: { message: `fonction inattendue ${nom}` } };
      },
    },
  };
}
const ADRESSES = lireAdressesRelais("relais@example.com, second@example.org");
const terminaison = (appels: [string, Record<string, unknown> | undefined][]) => appels.find(([n]) => n === "terminer_alerte_relais")?.[1];

describe("le passage du relais", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  });

  it("hors de 5 h à Paris : ne réserve rien, ne lit rien, n'envoie rien", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const b = base();
    const r = await passerAlerteRelais({ db: b.db, maintenant: new Date("2026-10-15T04:05:00Z"), adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toEqual({ ignore: true, motif: "hors_creneau", heure_paris: 6 });
    expect(b.appels).toEqual([]);
    expect(fournisseur.appels).toEqual([]);
  });

  it("tout va bien : rien ne part, le passage est consigné « rien à signaler »", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const b = base();
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ jour: JOUR, statut: "rien_a_signaler", points: 0, envoyes: 0 });
    expect(fournisseur.appels).toEqual([]);
    expect(terminaison(b.appels)).toMatchObject({ p_jour: JOUR, p_statut: "rien_a_signaler", p_destinataires: 2, p_envoyes: 0, p_points: 0 });
    // Le relais du mode vacances est actualisé avant la lecture, comme à chaque passage de mission.
    // Puis la file des urgences est vidée (e-mail immédiat, décision du 15/10), les urgences des dernières 24 h sont lues,
    // et les demandes de contact du site vitrine comptées (M16).
    expect(b.appels.map(([n]) => n)).toEqual(["reserver_alerte_relais", "traiter_vacances", "prendre_urgences_relais", "sentinelle_relais", "urgences_relais_recentes", "demandes_contact_en_attente", "terminer_alerte_relais"]);
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ demandes_contact_en_attente: 0, demandes_contact_48h: 0 });
  });

  // M16 (audit du 19/10) : les demandes de contact du site vitrine non traitées font partir l'e-mail (un point au total).
  it("deux demandes de contact non traitées, dont une ancienne : un point, les compteurs les consignent en nombres, le corps dit « 2 (dont 1 depuis plus de 48 h) »", async () => {
    const fournisseur = fauxFournisseurEmail();
    const corps: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
      corps.push(String(init.body ?? ""));
      return fournisseur.fetch(url, init);
    });
    const b = base({ contacts: { data: { en_attente: 2, depuis_plus_de_48h: 1 }, error: null } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1, envoyes: 1 });
    expect(fournisseur.acceptes[0].subject).toBe("Gerimmo — relais de 5 h : 1 point à vérifier");
    expect(terminaison(b.appels)).toMatchObject({
      p_points: 1,
      p_compteurs: expect.objectContaining({ demandes_contact_en_attente: 2, demandes_contact_48h: 1, lectures_impossibles: 0 }),
    });
    const { html } = JSON.parse(corps[0]) as { html: string };
    expect(html).toContain("Demandes de contact du site vitrine");
    expect(html).toContain("En attente de réponse : 2 (dont 1 depuis plus de 48 h)");
    expect(html).not.toMatch(/€|@/);
  });

  it("le comptage des demandes de contact illisible, ou d'un type inattendu : contrôle impossible, l'e-mail part et le dit", async () => {
    const fournisseur = fauxFournisseurEmail();
    const corps: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
      corps.push(String(init.body ?? ""));
      return fournisseur.fetch(url, init);
    });
    const b = base({ contacts: { data: null, error: { message: "fonction absente" } } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ lectures_impossibles: 1, demandes_contact_en_attente: 0, demandes_contact_48h: 0 });
    const { html } = JSON.parse(corps[0]) as { html: string };
    expect(html).toContain("Les demandes de contact du site vitrine n’ont pas pu être comptées.");
    expect(html).not.toContain("En attente de réponse");

    // Un nombre rendu en texte n'est jamais lu par Number() : c'est un comptage illisible.
    const texte = base({ contacts: { data: { en_attente: "3", depuis_plus_de_48h: "1" }, error: null } });
    const r2 = await passerAlerteRelais({ db: texte.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r2).toMatchObject({ points: 1 });
    expect(terminaison(texte.appels)?.p_compteurs).toMatchObject({ lectures_impossibles: 1, demandes_contact_en_attente: 0 });
  });

  it("variable absente : relais non configuré, rien ne part même s'il y a à signaler", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const b = base({ sentinelle: { data: { ...SAINE, arrets: [{ cle: "global", depuis: "2026-10-14T20:10:00Z" }] }, error: null } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais(undefined), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "non_configure", points: 1, envoyes: 0, destinataires: 0 });
    expect(fournisseur.appels).toEqual([]);
  });

  it("une mission en échec : un e-mail par adresse, chacun avec sa clé d'envoi du jour", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const passages = passagesSains().map((p) => (p.mission === "quittances" ? { ...p, etat: "a_reprendre" } : p));
    const b = base({ passages });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1, envoyes: 2, destinataires: 2 });
    expect(fournisseur.acceptes.map((m) => m.to)).toEqual([["relais@example.com"], ["second@example.org"]]);
    expect(fournisseur.acceptes[0].subject).toBe("Gerimmo — relais de 5 h : 1 point à vérifier");
    const cles = fournisseur.cles();
    expect(cles).toHaveLength(2);
    expect(new Set(cles).size).toBe(2);
    for (const cle of cles) {
      expect(cle).toMatch(/^relais-2026-10-15-[0-9a-f]{16}$/);
      expect(cle).not.toContain("example");
    }
    expect(terminaison(b.appels)).toMatchObject({ p_statut: "envoye", p_envoyes: 2, p_points: 1, p_compteurs: expect.objectContaining({ taches_en_echec: 1 }) });
  });

  it("une mission absente (aucun passage depuis plus de 26 h) est signalée ; une mission en pause ne l'est pas", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const vieux = new Date(MATIN.getTime() - 30 * 3_600_000).toISOString();
    const passages = passagesSains().map((p) => (p.mission === "relances" || p.mission === "veille" ? { ...p, debut: vieux, fin: vieux } : p));
    const b = base({ passages, missions: [{ cle: "veille", active: false }] });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1 });
    const corps = String(fournisseur.appels.length);
    expect(corps).toBe("2");
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ taches_absentes: 1, taches_en_echec: 0 });
  });

  it("une tâche pg_cron absente ou en échec, et des journaux illisibles, sont signalés", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const b = base({
      sentinelle: {
        data: { ...SAINE, taches_base: [
          { tache: "retention-quotidienne", etat: "absente", echecs: 0 },
          { tache: "alertes-impayes-quotidiennes", etat: "echec", echecs: 2 },
          { tache: "maintenance-artisans", etat: "non_programmee", echecs: 0 },
          { tache: "cycle-mensuel", etat: "ok", echecs: 0 },
        ] },
        error: null,
      },
    });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 3, envoyes: 1 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ taches_absentes: 2, taches_en_echec: 1 });

    const illisible = base({ sentinelle: { data: { ...SAINE, taches_base_lisibles: false, taches_base: [] }, error: null } });
    const r2 = await passerAlerteRelais({ db: illisible.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r2).toMatchObject({ points: 1 });
    expect(terminaison(illisible.appels)?.p_compteurs).toMatchObject({ lectures_impossibles: 1 });
  });

  // Relecture du 15/10 (migration 20261014812000) : le passage des urgences toutes les 10 minutes. Absent de pg_cron, il
  // est « plus programmé » ; appelé à l'heure mais jamais reçu par le serveur depuis 30 minutes, « sans passage ».
  it("le passage des urgences du relais, plus programmé ou sans passage reçu, est signalé sous son nom", async () => {
    const sujets: string[] = [];
    for (const etat of ["non_programmee", "sans_passage", "absente", "echec"] as const) {
      // Un fournisseur neuf à chaque cas : la clé d'envoi du jour est la même, le contenu non.
      const fournisseur = fauxFournisseurEmail();
      vi.stubGlobal("fetch", fournisseur.fetch);
      const b = base({ sentinelle: { data: { ...SAINE, taches_base: [{ tache: "relais-urgences", etat, echecs: 0 }] }, error: null } });
      const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
      expect(r, etat).toMatchObject({ statut: "envoye", points: 1 });
      expect(terminaison(b.appels)?.p_compteurs, etat).toMatchObject(
        etat === "echec" || etat === "sans_passage" ? { taches_en_echec: 1, taches_absentes: 0 } : { taches_en_echec: 0, taches_absentes: 1 }
      );
      sujets.push(...fournisseur.acceptes.map((a) => a.subject));
    }
    // Sous son nom (miroir TACHES_SQL_HORS_ARRET), pas sous « Tâche de la base « relais-urgences » ».
    expect(constaterRelais({ ...SAINE, taches_base: [{ tache: "relais-urgences", etat: "sans_passage" }] }, [], false).taches)
      .toEqual([{ libelle: "Vérification des urgences du relais (toutes les 10 minutes)", etat: "sans_passage" }]);
    const html = htmlAlerteRelais({ ...RIEN, taches: [{ libelle: "Vérification des urgences du relais (toutes les 10 minutes)", etat: "sans_passage" }] }, MATIN, "https://gerimmo.test/admin");
    expect(html).toContain("Vérification des urgences du relais (toutes les 10 minutes) : lancée à l’heure, mais le serveur n’a reçu aucun passage depuis plus de 30 minutes (extension pg_net, adresse du site ou jeton à vérifier)");
    expect(sujets).toEqual(Array(4).fill("Gerimmo — relais de 5 h : 1 point à vérifier"));
  });

  it("appelé deux fois le même jour : le second passage n'envoie rien", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const passages = passagesSains().map((p) => (p.mission === "quittances" ? { ...p, etat: "a_reprendre" } : p));
    await passerAlerteRelais({ db: base({ passages }).db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(fournisseur.acceptes).toHaveLength(2);
    const second = base({ passages, reservation: { data: { reserve: false, jour: JOUR, statut: "envoye", tentative: 1 }, error: null } });
    const r = await passerAlerteRelais({ db: second.db, maintenant: new Date("2026-10-15T03:40:00Z"), adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toEqual({ ignore: true, motif: "deja_traite", jour: JOUR, statut: "envoye" });
    expect(fournisseur.acceptes).toHaveLength(2);
    expect(second.appels.map(([n]) => n)).toEqual(["reserver_alerte_relais"]);
  });

  it("une reprise après échec réutilise les mêmes clés : le fournisseur ne renvoie pas ce qu'il a déjà accepté", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const passages = passagesSains().map((p) => (p.mission === "quittances" ? { ...p, etat: "a_reprendre" } : p));
    fournisseur.definirMode("accepte-puis-muet");
    const premier = base({ passages });
    const r1 = await passerAlerteRelais({ db: premier.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test", delaiMaxMs: 20 });
    expect(r1).toMatchObject({ statut: "echec", envoyes: 0 });
    fournisseur.definirMode("normal");
    const reprise = base({ passages, reservation: { data: { reserve: true, jour: JOUR, tentative: 2 }, error: null } });
    const r2 = await passerAlerteRelais({ db: reprise.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r2).toMatchObject({ statut: "envoye", envoyes: 1 });
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("l'arrêt d'urgence ne coupe pas l'alerte : il en est le sujet, et le contrôle d'arrêt n'est jamais consulté", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    // Sous un arrêt global, les missions ne passent plus : leur absence n'est pas comptée deux fois.
    const vieux = new Date(MATIN.getTime() - 40 * 3_600_000).toISOString();
    const passages = passagesSains().map((p) => ({ ...p, debut: vieux, fin: vieux }));
    const b = base({ passages, sentinelle: { data: { ...SAINE, arrets: [{ cle: "global", depuis: "2026-10-13T20:10:00Z" }] }, error: null } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1, envoyes: 2 });
    expect(b.appels.some(([n]) => n === "verifier_arret_supervision")).toBe(false);
    expect(fournisseur.acceptes).toHaveLength(2);
  });

  it("un arrêt propre à une mission ne masque que l'absence de cette mission", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const vieux = new Date(MATIN.getTime() - 40 * 3_600_000).toISOString();
    const passages = passagesSains().map((p) => (p.mission === "relances" || p.mission === "appels" ? { ...p, debut: vieux, fin: vieux } : p));
    const b = base({ passages, sentinelle: { data: { ...SAINE, arrets: [{ cle: "relances", depuis: "2026-10-13T20:10:00Z" }] }, error: null } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ points: 2 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ arrets_actifs: 1, taches_absentes: 1 });
  });

  it("le contrôle du relais indisponible : rien ne part", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const b = base({ reservation: { data: null, error: { message: "indisponible" } } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toEqual({ erreur: "Le contrôle du relais est indisponible.", status: 503 });
    expect(fournisseur.appels).toEqual([]);
  });

  it("le corps de l'e-mail ne contient ni adresse, ni texte d'alerte, ni montant", async () => {
    const fournisseur = fauxFournisseurEmail();
    const corps: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
      corps.push(String(init.body ?? ""));
      return fournisseur.fetch(url, init);
    });
    const b = base({ sentinelle: { data: { ...SAINE, alertes: { ouvertes: 1, escaladees: 0, non_acheminees: 1 } }, error: null } });
    await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(corps).toHaveLength(1);
    const { html } = JSON.parse(corps[0]) as { html: string };
    expect(html).toContain("À examiner : 1");
    expect(html).toContain("Non acheminées (responsable sans habilitation) : 1");
    expect(html).not.toMatch(/€|@/);
  });
});

// ── Toutes les tâches de l'écran Santé, pas seulement les missions (relecture du 15/10) ──

describe("les tâches suivies par l'écran Santé", () => {
  it("chaque tâche de Santé en échec donne un point, sous son nom : sauvegarde quotidienne et suivi des dossiers compris", () => {
    expect(TACHES.map((t) => t.nom)).toEqual(expect.arrayContaining(["orchestrateur", "sauvegarde"]));
    for (const t of TACHES) {
      const constat = constaterRelais(SAINE, TACHES.map((x) => ({ nom: x.nom, etat: x.nom === t.nom ? "echec" : "ok" })), false);
      expect(constat.taches, t.nom).toEqual([{ libelle: t.libelle, etat: "echec" }]);
      expect(pointsDuRelais(constat), t.nom).toBe(1);
    }
  });

  it("chaque tâche de Santé absente (en retard ou jamais passée) donne un point, hors arrêt", () => {
    for (const etat of ["retard", "jamais"]) {
      for (const t of TACHES) {
        const constat = constaterRelais(SAINE, TACHES.map((x) => ({ nom: x.nom, etat: x.nom === t.nom ? etat : "ok" })), false);
        expect(constat.taches, `${t.nom} ${etat}`).toEqual([{ libelle: t.libelle, etat: "absente" }]);
      }
    }
  });

  it("la sauvegarde nocturne en échec : l'alerte part et la nomme", async () => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    const fournisseur = fauxFournisseurEmail();
    const corps: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
      corps.push(String(init.body ?? ""));
      return fournisseur.fetch(url, init);
    });
    const le = new Date(MATIN.getTime() - 2 * 3_600_000).toISOString();
    const journal = journalSain().map((l) => (l.evenement === "tache_sauvegarde" ? { ...l, details: { echecs: 1, etape: "failure" }, created_at: le } : l));
    const b = base({ journal });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1, envoyes: 1 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ taches_en_echec: 1, taches_absentes: 0 });
    const { html } = JSON.parse(corps[0]) as { html: string };
    expect(html).toContain("Sauvegarde quotidienne : en échec");
  });

  it("le suivi des dossiers et la sauvegarde absents sont signalés ; un arrêt masque l'absence du suivi, jamais celle de la sauvegarde (qui ne lit aucun arrêt)", async () => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const vieux = new Date(MATIN.getTime() - 30 * 3_600_000).toISOString();
    const journal = journalSain().map((l) => ({ ...l, created_at: vieux }));
    const b = base({ journal });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 2 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ taches_absentes: 2, taches_en_echec: 0 });

    for (const cle of ["global", "orchestrateur"]) {
      const sousArret = base({ journal, sentinelle: { data: { ...SAINE, arrets: [{ cle, depuis: "2026-10-13T20:10:00Z" }] }, error: null } });
      const r2 = await passerAlerteRelais({ db: sousArret.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
      // Un point pour l'arrêt, un pour la sauvegarde absente ; le suivi des dossiers, retenu par l'arrêt, n'est pas compté.
      expect(r2, cle).toMatchObject({ points: 2 });
      expect(terminaison(sousArret.appels)?.p_compteurs, cle).toMatchObject({ arrets_actifs: 1, taches_absentes: 1 });
    }
    // La clé « sauvegarde » n'a aucun lecteur : enregistrée, elle ne masque rien.
    const cleSansEffet = base({ journal, sentinelle: { data: { ...SAINE, arrets: [{ cle: "sauvegarde", depuis: "2026-10-13T20:10:00Z" }] }, error: null } });
    const r3 = await passerAlerteRelais({ db: cleSansEffet.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(terminaison(cleSansEffet.appels)?.p_compteurs).toMatchObject({ arrets_actifs: 1, taches_absentes: 2 });
    expect(r3).toMatchObject({ points: 3 });
  });
});

// ── Les chemins de défaillance : une panne de lecture n'est jamais « rien à signaler » (relecture du 15/10) ──

/** Le faux fournisseur, avec le corps de chaque message envoyé. */
function fournisseurQuiGardeLeCorps(refuser: (to: string) => boolean = () => false) {
  const fournisseur = fauxFournisseurEmail();
  const corps: string[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
    const brut = String(init.body ?? "");
    const { to } = JSON.parse(brut) as { to: string[] };
    if (refuser(to[0])) return new Response(JSON.stringify({ name: "validation_error" }), { status: 422 });
    corps.push(brut);
    return fournisseur.fetch(url, init);
  });
  return { fournisseur, html: () => corps.map((c) => (JSON.parse(c) as { html: string }).html) };
}

describe("le passage du relais quand une lecture ou un envoi échoue", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  });

  it("la sentinelle de la base illisible : l'alerte part et le dit, au lieu de « rien à signaler »", async () => {
    const f = fournisseurQuiGardeLeCorps();
    const b = base({ sentinelle: { data: null, error: { message: "fonction indisponible" } } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1, envoyes: 1 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ lectures_impossibles: 1, arrets_actifs: 0, alertes_ouvertes: 0 });
    expect(f.html()).toHaveLength(1);
    expect(f.html()[0]).toContain("Les alertes du mode vacances, les arrêts d’urgence et les tâches de la base n’ont pas pu être lus.");
  });

  it("le suivi des missions illisible (agent_passages en erreur) : compté comme contrôle impossible", async () => {
    const f = fournisseurQuiGardeLeCorps();
    const b = base({ tablesEnErreur: ["agent_passages"] });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ lectures_impossibles: 1, taches_absentes: 0, taches_en_echec: 0 });
    expect(f.html()[0]).toContain("Le suivi des missions planifiées n’a pas pu être lu.");
  });

  it("le relais du mode vacances non actualisé (traiter_vacances en erreur) : compté comme contrôle impossible", async () => {
    const f = fournisseurQuiGardeLeCorps();
    const b = base({ vacances: { data: null, error: { message: "indisponible" } } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: lireAdressesRelais("relais@example.com"), site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoye", points: 1 });
    expect(terminaison(b.appels)?.p_compteurs).toMatchObject({ lectures_impossibles: 1 });
    expect(f.html()[0]).toContain("Le relais du mode vacances n’a pas pu être actualisé");
  });

  it("deux adresses, la seconde refusée par le fournisseur : « envoi partiel », une reprise reste permise", async () => {
    const f = fournisseurQuiGardeLeCorps((to) => to === "second@example.org");
    const passages = passagesSains().map((p) => (p.mission === "quittances" ? { ...p, etat: "a_reprendre" } : p));
    const b = base({ passages });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "envoi_partiel", destinataires: 2, envoyes: 1 });
    expect(terminaison(b.appels)).toMatchObject({ p_statut: "envoi_partiel", p_destinataires: 2, p_envoyes: 1 });
    expect(f.fournisseur.acceptes.map((m) => m.to)).toEqual([["relais@example.com"]]);
  });

  it("toutes les adresses refusées : « échec », aucun envoi compté", async () => {
    fournisseurQuiGardeLeCorps(() => true);
    const passages = passagesSains().map((p) => (p.mission === "quittances" ? { ...p, etat: "a_reprendre" } : p));
    const b = base({ passages });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toMatchObject({ statut: "echec", envoyes: 0 });
    expect(terminaison(b.appels)).toMatchObject({ p_statut: "echec", p_envoyes: 0 });
  });

  it("une connexion coupée en cours de passage : erreur 500, rien ne part, la passe n'est pas close (reprise permise)", async () => {
    const f = fournisseurQuiGardeLeCorps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = base({ leve: "sentinelle_relais" });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toEqual({ erreur: "Le passage du relais a été interrompu.", status: 500 });
    expect(f.html()).toEqual([]);
    expect(terminaison(b.appels)).toBeUndefined();
  });
});
