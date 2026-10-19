/**
 * D46-B, suite (décision du dirigeant du 15/10/2026, « envoi immédiat pour les urgences ») — le serveur.
 *
 *  — le contenu : la nature de chaque urgence (libellé constant), son heure de Paris, un lien vers /admin ; jamais le
 *    texte de l'alerte, une adresse, un nom ni un montant ;
 *  — l'envoi : un e-mail par adresse, en parallèle, une clé d'envoi stable pour l'envoi et l'adresse ; une reprise
 *    (même envoi) ne fait pas partir de second message chez le service ; plafond atteint : rien ne part, la file reste ;
 *  — relais non configuré : « relais non configuré », la base n'est même pas appelée, la file est conservée ;
 *  — l'arrêt d'urgence ne coupe pas l'e-mail immédiat : aucun contrôle d'arrêt n'est consulté ;
 *  — il ne lève jamais : base indisponible, service muet, connexion coupée ;
 *  — il part de chaque endroit qui pose une urgence : passage de mission (avant le contrôle d'arrêt), passage de 5 h,
 *    gestes « Actualiser » et « Signaler une urgence interne » de la console (après la réponse, `after`) ;
 *  — l'e-mail de 5 h rappelle les urgences des dernières 24 h, y compris celles déjà envoyées ;
 *  — à l'écran, deux adresses du même domaine restent distinctes, jamais entières ;
 *  — aucun envoi réel : `fetch` est remplacé par le faux fournisseur (tests/fixtures/faux-fournisseur-email.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";

const m = vi.hoisted(() => ({ after: vi.fn(), createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("@/lib/point-du-matin", () => ({ genererPointsDuMatin: vi.fn(async () => ({ enregistres: 0 })) }));

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import {
  DELAI_URGENCE_MAX_MINUTES,
  HORAIRE_PASSAGE_URGENCES,
  htmlUrgencesRelais,
  INTERVALLE_PASSAGE_URGENCES_MINUTES,
  libelleSortEmail,
  libelleUrgence,
  PASSAGES_DU_MATIN_PARIS,
  PHRASE_CANAUX_RELAIS,
  PHRASE_CONSTAT_URGENCES,
  PLAFOND_URGENCES_PAR_HEURE,
  sujetUrgencesRelais,
} from "../src/lib/relais-urgences";
import { envoyerUrgencesRelais, passerUrgencesRelais } from "../src/lib/relais-urgences-envoi";
import { descriptionRelais, htmlAlerteRelais, lireAdressesRelais, masquerAdresse, sujetAlerteRelais, type ConstatRelais } from "../src/lib/relais-alerte";
import { passerAlerteRelais } from "../src/lib/relais-alerte-envoi";
import { executerMission } from "../src/lib/execution-mission";
import { commanderRelais } from "../src/app/actions/consignes-vacances";

const ADRESSES = lireAdressesRelais("relais@example.com, second@example.org");
const SITE = "https://gerimmo.test";
const ENVOI = "11111111-2222-4333-8444-555555555555";
const URGENCE = { nature: "passage_a_reprendre", posee_le: "2026-10-15T12:34:00Z" };

type Reponse = { data: unknown; error: unknown };
/** Une base simulée : chaque fonction répond selon sa file de réponses (la dernière se répète), chaque appel est noté. */
function base(reponses: Record<string, Reponse[]> = {}, leve?: string) {
  const appels: [string, Record<string, unknown> | undefined][] = [];
  const restes: Record<string, Reponse[]> = Object.fromEntries(Object.entries(reponses).map(([k, v]) => [k, [...v]]));
  const rpc = vi.fn(async (nom: string, args?: Record<string, unknown>): Promise<Reponse> => {
    appels.push([nom, args]);
    if (leve === nom) throw new Error("connexion coupée");
    const file = restes[nom];
    if (file?.length) return file.length > 1 ? file.shift()! : file[0];
    if (nom === "terminer_urgences_relais") return { data: { termine: true, statut: "envoye" }, error: null };
    if (nom === "prendre_urgences_relais") return { data: { pris: false, motif: "rien", en_attente: 0 }, error: null };
    return { data: null, error: null };
  });
  return { appels, rpc, db: { rpc } };
}
const pris = (o: Partial<{ envoi: string; reprise: boolean; urgences: unknown[]; en_attente: number; tentative: number }> = {}): Reponse => ({
  data: { pris: true, envoi: ENVOI, tentative: 1, reprise: false, urgences: [URGENCE], en_attente: 0, ...o }, error: null,
});
const RIEN: Reponse = { data: { pris: false, motif: "rien", en_attente: 0 }, error: null };
const noms = (appels: [string, unknown][]) => appels.map(([n]) => n);

/** Le faux fournisseur, branché à la place de `fetch`, qui garde aussi le corps de chaque message accepté. */
function fournisseur(refuser: (to: string) => boolean = () => false) {
  const faux = fauxFournisseurEmail();
  const corps: string[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
    const brut = String(init.body ?? "");
    const { to } = JSON.parse(brut) as { to: string[] };
    if (refuser(to[0])) return new Response(JSON.stringify({ name: "validation_error" }), { status: 422 });
    corps.push(brut);
    return faux.fetch(url, init);
  });
  return { faux, corps: () => corps.map((c) => JSON.parse(c) as { to: string[]; subject: string; html: string }) };
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  m.after.mockReset();
  m.createClient.mockReset();
  m.revalidate.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Le contenu ─────────────────────────────────────────────────────────────

describe("le contenu de l'e-mail immédiat", () => {
  it("chaque nature a son libellé constant ; une nature inconnue reste générique, jamais le texte reçu", () => {
    expect(libelleUrgence("responsable_non_habilite")).toMatch(/perdu son habilitation/);
    expect(libelleUrgence("passage_a_reprendre")).toBe("Un passage des équipes est à reprendre");
    expect(libelleUrgence("lecture_bloquee")).toMatch(/lecture autorisée/);
    expect(libelleUrgence("signalement_manuel")).toMatch(/signalée à la main/);
    expect(libelleUrgence("Mme Exemple, 12 rue Exemple")).toBe("Une urgence du relais");
    expect(libelleUrgence("constructor")).toBe("Une urgence du relais");
  });

  it("le sujet compte les urgences", () => {
    expect(sujetUrgencesRelais(1)).toBe("Gerimmo — urgence du relais");
    expect(sujetUrgencesRelais(3)).toBe("Gerimmo — 3 urgences du relais");
  });

  it("le corps : natures et heures de Paris, lien vers /admin ; ni adresse, ni montant", () => {
    const html = htmlUrgencesRelais([URGENCE, { nature: "signalement_manuel", posee_le: "2026-10-15T12:40:00Z" }], `${SITE}/admin`);
    expect(html).toContain("2 urgences à examiner");
    expect(html).toContain("15/10/2026 14:34 — Un passage des équipes est à reprendre");
    expect(html).toContain("15/10/2026 14:40 — Une urgence a été signalée à la main dans la console");
    expect(html).toContain(`href="${SITE}/admin"`);
    expect(html).toContain(`au plus ${PLAFOND_URGENCES_PAR_HEURE} fois par heure`);
    expect(html).toContain("l’arrêt d’urgence ne le coupe pas");
    expect(html).not.toMatch(/€|@/);
  });

  it("la phrase de la console : le délai réel, depuis l'événement (passage toutes les 10 minutes, plus l'envoi)", () => {
    expect(PHRASE_CANAUX_RELAIS).toBe("Urgences : e-mail immédiat, au plus 11 min après l’événement ; autres alertes : e-mail quotidien à 5 h (Paris).");
    expect(INTERVALLE_PASSAGE_URGENCES_MINUTES).toBe(10);
    expect(DELAI_URGENCE_MAX_MINUTES).toBe(INTERVALLE_PASSAGE_URGENCES_MINUTES + 1);
    expect(PLAFOND_URGENCES_PAR_HEURE).toBe(6);
  });
});

// ── Le délai annoncé (relecture du 15/10) ──────────────────────────────────
//
// Premier constat de relecture : « délai au plus 1 min » n'était vrai qu'à partir de la POSE de l'urgence. Second
// constat : les tâches Vercel ne passant qu'une fois par jour, un événement de l'après-midi n'était constaté, et son
// e-mail parti, que le lendemain matin, jusqu'à environ 18 h plus tard. Depuis la migration 20261014812000, pg_cron
// appelle toutes les 10 minutes, jour et nuit, le passage des urgences (constat, puis envoi) : au plus 11 minutes entre
// l'événement et l'e-mail, en marche normale. L'écran et les deux e-mails le disent exactement.

/** Les heures de Paris (décimales) d'une tâche Vercel « m h * * * », un jour d'hiver et un jour d'été. */
function heuresParis(schedule: string): number[] {
  const [minute, heure] = schedule.split(" ");
  return ["2026-01-15", "2026-07-15"].map((jour) => {
    const instant = new Date(`${jour}T${heure.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`);
    const parties = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).formatToParts(instant);
    const valeur = (type: string) => parseInt(parties.find((p) => p.type === type)!.value, 10);
    return valeur("hour") + valeur("minute") / 60;
  });
}

const MIGRATION_PASSAGE = "supabase/migrations/20261014812000_relais_urgences_passage_frequent.sql";

describe("le délai annoncé est le délai réel depuis l'événement : passage toutes les 10 minutes, plus l'envoi", () => {
  it("la console ne promet plus un délai « après leur constat » : elle le compte depuis l'événement", () => {
    expect(PHRASE_CANAUX_RELAIS).not.toContain("délai au plus");
    expect(PHRASE_CANAUX_RELAIS).not.toContain("après leur constat");
    expect(PHRASE_CANAUX_RELAIS).toContain("au plus 11 min après l’événement");
  });

  it("la console dit le passage toutes les 10 minutes, le geste manuel, et le filet du matin si le passage est en panne", () => {
    expect(PHRASE_CONSTAT_URGENCES).toBe(
      "Un passage automatique constate les urgences toutes les 10 minutes, jour et nuit, et envoie leur e-mail dans la foulée : il part au plus 11 minutes après l’événement. Une urgence signalée à la main dans cette console part aussitôt. Si ce passage ne fonctionne pas, l’e-mail de 5 h le signale, et les urgences ne sont plus constatées qu’au passage des équipes, chaque matin entre 4 h et 12 h (heure de Paris), ou quand on actualise le relais."
    );
    expect(PHRASE_CONSTAT_URGENCES).not.toContain("lendemain matin");
  });

  it("l'horaire annoncé est celui de la tâche pg_cron de la migration : toutes les 10 minutes, jour et nuit", () => {
    const sql = readFileSync(MIGRATION_PASSAGE, "utf8");
    expect(HORAIRE_PASSAGE_URGENCES).toBe("*/10 * * * *");
    expect(sql).toContain(`select cron.schedule('relais-urgences', '${HORAIRE_PASSAGE_URGENCES}', $$select public.declencher_relais_urgences()$$);`);
    expect(sql).toContain("url := d.site_url || '/api/cron/relais?mode=urgences'");
    expect(60 % INTERVALLE_PASSAGE_URGENCES_MINUTES).toBe(0);
    expect(HORAIRE_PASSAGE_URGENCES.startsWith(`*/${INTERVALLE_PASSAGE_URGENCES_MINUTES} `)).toBe(true);
  });

  // Sur l'offre Hobby de Vercel, une tâche « 0 9 * * * » part à l'heure près (entre 09 h 00 et 09 h 59 UTC) : la fenêtre
  // annoncée pour le filet va jusqu'à la fin de l'heure du dernier passage.
  it("le filet annoncé suit vercel.json : chaque passage de mission qui actualise le relais tombe entre 4 h et 12 h à Paris, été comme hiver, même à l'heure près", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    const passages = vercel.crons.filter((c) => c.path.startsWith("/api/cron/equipes?") || c.path.startsWith("/api/cron/relais?"));
    expect(passages.length).toBeGreaterThan(0);
    for (const c of passages) expect(c.schedule, c.path).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    // Le passage fréquent n'est PAS une tâche Vercel (le plan n'en permet que de quotidiennes) : pg_cron l'appelle.
    expect(vercel.crons.map((c) => c.path)).not.toContain("/api/cron/relais?mode=urgences");
    const heures = passages.flatMap((c) => heuresParis(c.schedule));
    expect(Math.min(...heures)).toBe(PASSAGES_DU_MATIN_PARIS.debut);
    expect(Math.floor(Math.max(...heures)) + 1).toBe(PASSAGES_DU_MATIN_PARIS.fin);
    expect(PHRASE_CONSTAT_URGENCES).toContain(`chaque matin entre ${PASSAGES_DU_MATIN_PARIS.debut} h et ${PASSAGES_DU_MATIN_PARIS.fin} h (heure de Paris)`);
  });

  it("ce qui actualise le relais : les missions, le passage de 5 h, le passage fréquent et le geste « Actualiser » ; pg_cron passe par la route, jamais directement", () => {
    const fichiers = (readdirSync("src", { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /rpc\(\s*['"]traiter_vacances['"]|appel\(\s*['"]traiter_vacances['"]/.test(readFileSync(join("src", f), "utf8")))
      .map((f) => f.split(sep).join("/"))
      .sort();
    expect(fichiers).toEqual(["app/actions/consignes-vacances.ts", "lib/execution-mission.ts", "lib/relais-alerte-envoi.ts", "lib/relais-urgences-envoi.ts"]);
    for (const f of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(join("supabase/migrations", f), "utf8");
      expect(sql, f).not.toMatch(/cron\.schedule\([^;]*traiter_vacances/);
    }
  });

  it("l'e-mail immédiat dit le délai depuis l'événement, le passage toutes les 10 minutes, et que l'heure est celle du constat", () => {
    const html = htmlUrgencesRelais([URGENCE], `${SITE}/admin`).replace(/\s+/g, " ");
    expect(html).toContain("Heures du constat (heure de Paris).");
    expect(html).toContain("Cet e-mail part au plus 11 min après l’événement : un passage automatique constate les urgences toutes les 10 minutes, jour et nuit, et l’heure indiquée est celle de ce constat ; une urgence signalée à la main dans la console part aussitôt.");
    expect(html).toContain("au-delà, ou si l’envoi échoue, les urgences en attente partent groupées au passage suivant ou dans l’e-mail de 5 h (heure de Paris)");
    expect(html).not.toContain("au passage des équipes (chaque matin)");
    expect(html).not.toContain("après le constat d’une urgence");
  });

  it("l'e-mail de 5 h dit le délai de l'e-mail immédiat depuis l'événement", () => {
    const constat: ConstatRelais = { arrets: [], alertes: { ouvertes: 1, escaladees: 0, non_acheminees: 0 }, taches: [], lecturesImpossibles: [], relaisNonActualise: false };
    const html = htmlAlerteRelais(constat, new Date("2026-10-15T03:00:00Z"), `${SITE}/admin`);
    expect(html).not.toContain("sur le moment");
    expect(html).toContain("Les urgences partent aussi dans un e-mail immédiat, au plus 11 minutes après l’événement (un passage automatique les constate toutes les 10 minutes) ; il les rappelle ici.");
  });

  it("le rappel de 5 h ne dit jamais « en cours d'envoi » d'un e-mail immédiat en échec", () => {
    expect(libelleSortEmail("echec_reprise")).toBe("e-mail immédiat en échec pour au moins une adresse : nouvel essai au passage suivant");
    expect(libelleSortEmail("echec_reprise")).not.toContain("en cours");
    expect(libelleUrgence("inconnue")).toBe("Une urgence du relais");
  });
});

// ── L'envoi ────────────────────────────────────────────────────────────────

describe("l'envoi immédiat des urgences", () => {
  it("variable absente : « relais non configuré », la base n'est pas appelée, la file reste, rien ne part", async () => {
    const f = fournisseur();
    const b = base({ prendre_urgences_relais: [pris()] });
    for (const adresses of [lireAdressesRelais(undefined), lireAdressesRelais(""), lireAdressesRelais("pas-une-adresse")]) {
      expect(await envoyerUrgencesRelais({ db: b.db, adresses, site: SITE })).toEqual({ arret: "non_configure", envois: [] });
    }
    // Sans le paramètre : la variable du serveur, absente ici.
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "");
    expect(await envoyerUrgencesRelais({ db: b.db, site: SITE })).toEqual({ arret: "non_configure", envois: [] });
    expect(b.appels).toEqual([]);
    expect(f.corps()).toEqual([]);
  });

  it("rien en attente : rien ne part", async () => {
    const f = fournisseur();
    const b = base();
    expect(await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE })).toEqual({ arret: "rien", envois: [] });
    expect(noms(b.appels)).toEqual(["prendre_urgences_relais"]);
    expect(b.appels[0][1]).toEqual({ p_plafond: 6 });
    expect(f.corps()).toEqual([]);
  });

  it("une urgence : un e-mail par adresse, une clé par envoi et par adresse, puis le résultat consigné", async () => {
    const f = fournisseur();
    const b = base({ prendre_urgences_relais: [pris(), RIEN] });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(r).toEqual({ arret: "rien", envois: [{ urgences: 1, destinataires: 2, envoyes: 2, reprise: false, statut: "envoye" }] });
    expect(f.corps().map((c) => c.to).sort()).toEqual([["relais@example.com"], ["second@example.org"]]);
    expect(f.corps()[0].subject).toBe("Gerimmo — urgence du relais");
    const cles = f.faux.cles();
    expect(cles).toHaveLength(2);
    expect(new Set(cles).size).toBe(2);
    for (const cle of cles) {
      expect(cle).toMatch(new RegExp(`^relais-urgence-${ENVOI}-[0-9a-f]{16}$`));
      expect(cle).not.toContain("example");
    }
    expect(b.appels.find(([n]) => n === "terminer_urgences_relais")?.[1]).toEqual({ p_envoi: ENVOI, p_destinataires: 2, p_envoyes: 2 });
  });

  it("rejeu : la reprise d'un envoi incomplet réutilise les mêmes clés ; le service ne renvoie pas ce qu'il a déjà accepté", async () => {
    let refuserSecond = true;
    const f = fournisseur((to) => refuserSecond && to === "second@example.org");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = base({
      prendre_urgences_relais: [pris({ en_attente: 1 }), pris({ reprise: true, tentative: 2 }), RIEN],
      terminer_urgences_relais: [{ data: { termine: true, statut: "a_reprendre" }, error: null }, { data: { termine: true, statut: "envoye" }, error: null }],
    });
    const premier = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    // Un envoi incomplet se reprend au passage suivant, jamais dans la foulée.
    expect(premier).toEqual({ arret: "echec", en_attente: 1, envois: [{ urgences: 1, destinataires: 2, envoyes: 1, reprise: false, statut: "a_reprendre" }] });
    expect(noms(b.appels).filter((n) => n === "prendre_urgences_relais")).toHaveLength(1);
    refuserSecond = false;
    const second = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(second.envois[0]).toMatchObject({ envoyes: 2, reprise: true, statut: "envoye" });
    // Trois appels au service pour la première adresse ? Non : deux appels, un seul message accepté par adresse.
    const parAdresse = f.faux.acceptes.map((a) => a.to[0]).sort();
    expect(parAdresse).toEqual(["relais@example.com", "second@example.org"]);
    const cles = f.faux.cles();
    expect(new Set(cles).size).toBe(2);
  });

  it("plafond atteint : rien ne part, la file reste (« en attente »)", async () => {
    const f = fournisseur();
    const b = base({ prendre_urgences_relais: [{ data: { pris: false, motif: "plafond", en_attente: 4, envois_dans_l_heure: 6 }, error: null }] });
    expect(await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE })).toEqual({ arret: "plafond", envois: [], en_attente: 4 });
    expect(f.corps()).toEqual([]);
    expect(noms(b.appels)).toEqual(["prendre_urgences_relais"]);
  });

  it("le surplus part groupé : un envoi de plusieurs urgences, un seul e-mail par adresse", async () => {
    const f = fournisseur();
    const groupe = [URGENCE, { nature: "lecture_bloquee", posee_le: "2026-10-15T12:35:00Z" }, { nature: "signalement_manuel", posee_le: "2026-10-15T12:36:00Z" }];
    const b = base({ prendre_urgences_relais: [pris({ urgences: groupe }), RIEN] });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(r.envois).toEqual([{ urgences: 3, destinataires: 2, envoyes: 2, reprise: false, statut: "envoye" }]);
    expect(f.corps()).toHaveLength(2);
    expect(f.corps()[0].subject).toBe("Gerimmo — 3 urgences du relais");
  });

  it("l'arrêt d'urgence actif ne le coupe pas : aucun contrôle d'arrêt n'est consulté, l'e-mail part", async () => {
    const f = fournisseur();
    const b = base({
      prendre_urgences_relais: [pris(), RIEN],
      verifier_arret_supervision: [{ data: false, error: null }],
    });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(r.envois[0]).toMatchObject({ envoyes: 2 });
    expect(noms(b.appels)).not.toContain("verifier_arret_supervision");
    expect(f.corps()).toHaveLength(2);
  });

  it("aucune donnée personnelle : ni adresse, ni texte d'alerte, ni montant dans le message ou le compte rendu", async () => {
    const f = fournisseur();
    const b = base({ prendre_urgences_relais: [pris({ urgences: [{ nature: "signalement_manuel", posee_le: "2026-10-15T12:34:00Z", titre: "Mme Exemple, 12 rue Exemple, 1 250 €" }] }), RIEN] });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    for (const c of f.corps()) {
      expect(c.html).not.toMatch(/Exemple|1 250|€/);
      expect(c.html.replace(`${SITE}/admin`, "")).not.toContain("@");
      expect(c.subject).not.toMatch(/Exemple|@/);
    }
    expect(JSON.stringify(r)).not.toMatch(/@|Exemple/);
    expect(JSON.stringify(b.appels)).not.toMatch(/@|Exemple/);
  });

  it("ne lève jamais : base indisponible, connexion coupée, service muet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fournisseur();
    expect(await envoyerUrgencesRelais({ db: base({ prendre_urgences_relais: [{ data: null, error: { message: "panne" } }] }).db, adresses: ADRESSES, site: SITE }))
      .toEqual({ arret: "indisponible", envois: [] });
    expect(await envoyerUrgencesRelais({ db: base({}, "prendre_urgences_relais").db, adresses: ADRESSES, site: SITE }))
      .toEqual({ arret: "indisponible", envois: [] });
    expect(await envoyerUrgencesRelais({ db: null, adresses: ADRESSES, site: SITE })).toEqual({ arret: "indisponible", envois: [] });
    // Service muet : le délai maximal coupe l'attente, l'envoi reste à reprendre (mêmes clés au passage suivant).
    const muet = fauxFournisseurEmail();
    muet.definirMode("muet");
    vi.stubGlobal("fetch", muet.fetch);
    const b = base({ prendre_urgences_relais: [pris()], terminer_urgences_relais: [{ data: { termine: true, statut: "a_reprendre" }, error: null }] });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE, delaiMaxMs: 20 });
    expect(r).toMatchObject({ arret: "echec", envois: [{ envoyes: 0, statut: "a_reprendre" }] });
    expect(muet.appels.every((a) => a.avecDelai)).toBe(true);
    expect(b.appels.find(([n]) => n === "terminer_urgences_relais")?.[1]).toEqual({ p_envoi: ENVOI, p_destinataires: 2, p_envoyes: 0 });
    // Un envoyeur qui lève (imprévu) : compté comme un échec, rien ne remonte.
    const c = base({ prendre_urgences_relais: [pris()] });
    const r2 = await envoyerUrgencesRelais({ db: c.db, adresses: ADRESSES, site: SITE, envoyer: async () => { throw new Error("imprévu"); } });
    expect(r2.envois[0]).toMatchObject({ envoyes: 0 });
  });

  it("le résultat de l'envoi ne peut pas être consigné : arrêt « indisponible », sans autre tour", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fournisseur();
    const b = base({ prendre_urgences_relais: [pris({ en_attente: 2 })], terminer_urgences_relais: [{ data: null, error: { message: "panne" } }] });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(r.arret).toBe("indisponible");
    expect(noms(b.appels).filter((n) => n === "prendre_urgences_relais")).toHaveLength(1);
  });

  it("un envoi sans urgence lisible est clos sans e-mail et n'est jamais consigné « envoyé » (relecture du 15/10)", async () => {
    const f = fournisseur();
    const b = base({
      prendre_urgences_relais: [pris({ urgences: [{ nature: 3 }] }), RIEN],
      clore_envoi_urgences_vide: [{ data: { termine: true, statut: "abandonne" }, error: null }],
    });
    expect(await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE })).toEqual({ arret: "rien", envois: [] });
    expect(f.corps()).toEqual([]);
    // Ni « terminer » avec des destinataires (qui le consignerait « envoyé »), ni e-mail : la clôture sans objet.
    expect(noms(b.appels)).toEqual(["prendre_urgences_relais", "clore_envoi_urgences_vide", "prendre_urgences_relais"]);
    expect(b.appels.find(([n]) => n === "clore_envoi_urgences_vide")?.[1]).toEqual({ p_envoi: ENVOI });
  });

  it("un envoi sans urgence lisible que la base refuse de clore (urgences encore attachées) : rien ne part, il sera repris", async () => {
    const f = fournisseur();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = base({
      prendre_urgences_relais: [pris({ urgences: "illisible" as unknown as unknown[] })],
      clore_envoi_urgences_vide: [{ data: { termine: false, motif: "urgences" }, error: null }],
    });
    expect(await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE })).toEqual({ arret: "indisponible", envois: [] });
    expect(f.corps()).toEqual([]);
    expect(noms(b.appels)).not.toContain("terminer_urgences_relais");
  });

  it("le passage fréquent : constater d'abord, envoyer ensuite, consigner le passage ; un appel au service borné à 10 s", async () => {
    const f = fournisseur();
    const b = base({ prendre_urgences_relais: [pris(), RIEN] });
    const r = await passerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(r).toEqual({ constat: "fait", envoi: { arret: "rien", envois: [{ urgences: 1, destinataires: 2, envoyes: 2, reprise: false, statut: "envoye" }] } });
    expect(noms(b.appels)).toEqual(["traiter_vacances", "prendre_urgences_relais", "terminer_urgences_relais", "consigner_passage_urgences_relais"]);
    expect(f.corps()).toHaveLength(2);
    expect(f.faux.appels.every((a) => a.avecDelai)).toBe(true);
  });

  it("le passage fréquent, file vide : aucun appel au service d'e-mail", async () => {
    const f = fournisseur();
    const b = base();
    expect(await passerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE })).toEqual({ constat: "fait", envoi: { arret: "rien", envois: [] } });
    expect(f.faux.appels).toEqual([]);
  });

  it("le passage fréquent ne lève jamais : constat coupé, consignation en erreur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fournisseur();
    const coupe = base({}, "traiter_vacances");
    expect(await passerUrgencesRelais({ db: coupe.db, adresses: ADRESSES, site: SITE })).toEqual({ constat: "indisponible", envoi: { arret: "rien", envois: [] } });
    expect(noms(coupe.appels)).not.toContain("consigner_passage_urgences_relais");
    const consignation = base({}, "consigner_passage_urgences_relais");
    expect(await passerUrgencesRelais({ db: consignation.db, adresses: ADRESSES, site: SITE })).toEqual({ constat: "fait", envoi: { arret: "rien", envois: [] } });
  });

  it("trois tours au plus par passage (reprise, puis urgences en attente)", async () => {
    fournisseur();
    const b = base({ prendre_urgences_relais: [pris({ en_attente: 60 })] });
    const r = await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE });
    expect(r.arret).toBe("tours");
    expect(r.envois).toHaveLength(3);
  });
});

// ── D'où il part ───────────────────────────────────────────────────────────

describe("l'e-mail immédiat part de chaque endroit qui pose une urgence", () => {
  function baseMission(o: { arret?: boolean } = {}) {
    return base({
      prendre_urgences_relais: [pris(), RIEN],
      verifier_arret_supervision: [{ data: !o.arret, error: null }],
      commencer_mission: [{ data: "passage-1", error: null }],
    });
  }

  it("passage de mission : juste après traiter_vacances, avant le contrôle d'arrêt", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com, second@example.org");
    const f = fournisseur();
    const b = baseMission();
    const r = await executerMission(b.db as unknown as SupabaseClient, "appels", async () => Response.json({ envoyes: 0 }));
    expect(r.status).toBe(200);
    const ordre = noms(b.appels);
    expect(ordre.slice(0, 3)).toEqual(["traiter_vacances", "prendre_urgences_relais", "terminer_urgences_relais"]);
    expect(ordre.indexOf("verifier_arret_supervision")).toBeGreaterThan(ordre.indexOf("terminer_urgences_relais"));
    expect(f.corps()).toHaveLength(2);
  });

  it("passage de mission sous arrêt d'urgence : la mission est retenue, l'e-mail immédiat part quand même", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const f = fournisseur();
    const b = baseMission({ arret: true });
    const traiter = vi.fn();
    const r = await executerMission(b.db as unknown as SupabaseClient, "appels", traiter);
    expect(r.status).toBe(503);
    expect(traiter).not.toHaveBeenCalled();
    expect(f.corps()).toHaveLength(1);
  });

  it("passage de mission, relais non configuré : aucun appel de plus ; une panne de l'envoi ne fait pas échouer la mission", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "");
    const b = baseMission();
    await executerMission(b.db as unknown as SupabaseClient, "appels", async () => Response.json({ envoyes: 0 }));
    expect(noms(b.appels)).not.toContain("prendre_urgences_relais");

    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = base({ verifier_arret_supervision: [{ data: true, error: null }], commencer_mission: [{ data: "passage-2", error: null }] }, "prendre_urgences_relais");
    const r = await executerMission(c.db as unknown as SupabaseClient, "appels", async () => Response.json({ envoyes: 3 }));
    expect(r.status).toBe(200);
    expect(noms(c.appels)).toContain("terminer_mission");
  });

  it("console, « Signaler une urgence interne » et « Actualiser » : l'envoi est programmé APRÈS la réponse, avec la session", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com");
    const f = fournisseur();
    const session = base({ is_permanent_super_admin: [{ data: true, error: null }], prendre_urgences_relais: [pris(), RIEN] });
    m.createClient.mockResolvedValue(session.db);
    const formulaire = (commande: string) => { const d = new FormData(); d.set("commande", commande); d.set("plan", "plan-1"); d.set("cle", "ref-1"); d.set("titre", "Urgence fictive"); return d; };

    const retour = await commanderRelais({}, formulaire("urgence"));
    expect(retour.succes).toBeTruthy();
    expect(m.after).toHaveBeenCalledTimes(1);
    // Rien n'est parti pendant le geste : l'envoi attend la fin de la réponse.
    expect(noms(session.appels)).not.toContain("prendre_urgences_relais");
    expect(f.corps()).toEqual([]);
    await m.after.mock.calls[0][0]();
    expect(noms(session.appels)).toContain("prendre_urgences_relais");
    expect(f.corps()).toHaveLength(1);

    await commanderRelais({}, formulaire("actualiser"));
    expect(m.after).toHaveBeenCalledTimes(2);
    expect(noms(session.appels)).toContain("traiter_vacances");
  });

  it("console : un geste refusé ne programme aucun envoi ; accuser ou arrêter non plus", async () => {
    const session = base({ is_permanent_super_admin: [{ data: true, error: null }], signaler_urgence_vacances: [{ data: null, error: { message: "Aucun plan actif pour cette urgence" } }] });
    m.createClient.mockResolvedValue(session.db);
    const d = new FormData(); d.set("commande", "urgence"); d.set("plan", "plan-1"); d.set("cle", "ref-1"); d.set("titre", "Urgence fictive");
    expect((await commanderRelais({}, d)).erreur).toBe("Aucun plan actif pour cette urgence");
    const a = new FormData(); a.set("commande", "accuser"); a.set("id", "alerte-1");
    await commanderRelais({}, a);
    expect(m.after).not.toHaveBeenCalled();
  });
});

// ── L'e-mail de 5 h rappelle les urgences des dernières 24 h ──────────────────

describe("l'e-mail de 5 h et le rappel des urgences", () => {
  const MATIN = new Date("2026-10-15T03:05:00Z");
  const SAINE = { alertes: { ouvertes: 0, escaladees: 0, non_acheminees: 0 }, arrets: [], taches_base_lisibles: true, taches_base: [] };
  function base5h(recentes: Reponse, prendre: Reponse[] = [RIEN]) {
    const b = base({
      reserver_alerte_relais: [{ data: { reserve: true, jour: "2026-10-15", tentative: 1 }, error: null }],
      traiter_vacances: [{ data: {}, error: null }],
      sentinelle_relais: [{ data: SAINE, error: null }],
      urgences_relais_recentes: [recentes],
      prendre_urgences_relais: prendre,
      urgences_relais_au_quotidien: [{ data: 1, error: null }],
      // M16 : aucune demande de contact du site vitrine en attente.
      demandes_contact_en_attente: [{ data: { en_attente: 0, depuis_plus_de_48h: 0 }, error: null }],
    });
    // Les tâches de l'écran Santé, toutes passées à l'heure (rien d'autre à signaler).
    const le = new Date(MATIN.getTime() - 2 * 3_600_000).toISOString();
    const tables: Record<string, unknown[]> = {
      agent_passages: ["veille", "appels", "quittances", "relances", "rappels", "abonnements", "signatures", "marketing", "territoire", "purge"]
        .map((mission) => ({ mission, debut: le, fin: le, expiration: null, etat: "termine", compte: 0, bilan: {} })),
      tech_log: [
        { evenement: "tache_orchestrateur", details: { dossiers: 0 }, created_at: le },
        { evenement: "tache_sauvegarde", details: { echecs: 0, octets: 1, fichiers: 1, taches: 9 }, created_at: le },
      ],
      agent_missions: [],
    };
    const from = (table: string) => {
      const q: Record<string, unknown> = {};
      for (const x of ["select", "like", "in", "is", "gte", "order", "limit", "eq"]) q[x] = () => q;
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok);
      return q;
    };
    return { ...b, db: { rpc: b.rpc, from } };
  }
  const recente = (alerte: string, email: string, posee = "2026-10-14T20:00:00Z") => ({ alerte, nature: "passage_a_reprendre", posee_le: posee, email });

  it("rien d'autre à signaler, mais des urgences en 24 h : l'e-mail de 5 h part et les rappelle, envoyées ou non", async () => {
    const f = fournisseur();
    const b = base5h({ data: { urgences: [recente("a-1", "envoye"), recente("a-2", "en_attente", "2026-10-15T02:00:00Z")], total: 2 }, error: null });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: SITE });
    expect(r).toMatchObject({ statut: "envoye", points: 0, envoyes: 2 });
    const [message] = f.corps();
    expect(message.subject).toBe("Gerimmo — relais de 5 h : rappel, 2 urgences en 24 h");
    expect(message.html).toContain("Rappel : 2 urgences des dernières 24 h");
    expect(message.html).toContain("14/10/2026 22:00 — Un passage des équipes est à reprendre : e-mail immédiat envoyé");
    expect(message.html).toContain("15/10/2026 04:00 — Un passage des équipes est à reprendre : e-mail immédiat pas encore parti");
    // Ordre : la file est vidée juste après traiter_vacances, avant les lectures.
    const ordre = noms(b.appels);
    expect(ordre.indexOf("prendre_urgences_relais")).toBe(ordre.indexOf("traiter_vacances") + 1);
    expect(ordre.indexOf("urgences_relais_recentes")).toBeGreaterThan(ordre.indexOf("prendre_urgences_relais"));
    // Parti vers toutes les adresses : l'urgence qui attendait ne repartira pas en e-mail immédiat.
    expect(b.appels.find(([n]) => n === "urgences_relais_au_quotidien")?.[1]).toEqual({ p_alertes: ["a-2"] });
    expect(b.appels.find(([n]) => n === "terminer_alerte_relais")?.[1]).toMatchObject({ p_statut: "envoye", p_points: 0, p_compteurs: expect.objectContaining({ urgences_24h: 2 }) });
  });

  it("envoi partiel : les urgences en attente ne sont pas marquées comme reprises", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fournisseur((to) => to === "second@example.org");
    const b = base5h({ data: { urgences: [recente("a-2", "en_attente")], total: 1 }, error: null });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: SITE });
    expect(r).toMatchObject({ statut: "envoi_partiel" });
    expect(noms(b.appels)).not.toContain("urgences_relais_au_quotidien");
  });

  it("aucune urgence en 24 h et rien à signaler : rien ne part", async () => {
    const f = fournisseur();
    const b = base5h({ data: { urgences: [], total: 0 }, error: null });
    expect(await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: SITE })).toMatchObject({ statut: "rien_a_signaler" });
    expect(f.corps()).toEqual([]);
  });

  it("le rappel illisible : compté comme contrôle impossible, l'e-mail part et le dit", async () => {
    const f = fournisseur();
    const b = base5h({ data: null, error: { message: "fonction absente" } });
    const r = await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: SITE });
    expect(r).toMatchObject({ statut: "envoye", points: 1 });
    expect(f.corps()[0].html).toContain("Les urgences des dernières 24 h n’ont pas pu être lues.");
  });

  it("une urgence posée par le passage de 5 h part en e-mail immédiat, puis est rappelée à 5 h", async () => {
    const f = fournisseur();
    const b = base5h({ data: { urgences: [recente("a-3", "envoye", "2026-10-15T03:05:00Z")], total: 1 }, error: null }, [pris(), RIEN]);
    await passerAlerteRelais({ db: b.db, maintenant: MATIN, adresses: ADRESSES, site: SITE });
    const sujets = f.corps().map((c) => c.subject);
    expect(sujets.filter((s) => s === "Gerimmo — urgence du relais")).toHaveLength(2);
    expect(sujets.filter((s) => s.startsWith("Gerimmo — relais de 5 h"))).toHaveLength(2);
  });

  it("le sujet et le corps quand il y a des points ET des urgences ; plus de 50 urgences : « et N autres »", () => {
    expect(sujetAlerteRelais(2, 3)).toBe("Gerimmo — relais de 5 h : 2 points à vérifier, 3 urgences en 24 h");
    expect(sujetAlerteRelais(1)).toBe("Gerimmo — relais de 5 h : 1 point à vérifier");
    const constat: ConstatRelais = {
      arrets: [], alertes: { ouvertes: 1, escaladees: 0, non_acheminees: 0 }, taches: [], lecturesImpossibles: [], relaisNonActualise: false,
      urgences: { liste: [recente("a-1", "hors_file")], total: 53 },
    };
    const html = htmlAlerteRelais(constat, MATIN, `${SITE}/admin`);
    expect(html).toContain("1 point à vérifier");
    expect(html).toContain("Urgences des dernières 24 h (rappel)");
    expect(html).toContain("pas d’e-mail immédiat");
    expect(html).toContain("Et 52 autres, à lire dans la console");
  });
});

// ── Les adresses à l'écran ─────────────────────────────────────────────────

describe("les adresses masquées restent distinctes", () => {
  it("deux adresses fictives du même domaine, différentes seulement au milieu et à la fin, restent distinctes, jamais entières", () => {
    const a = "direction.relais01@example.com";
    const b = "direction.releve02@example.com";
    expect(masquerAdresse(a)).toBe("di•••01@example.com");
    expect(masquerAdresse(b)).toBe("di•••02@example.com");
    expect(masquerAdresse(a)).not.toBe(masquerAdresse(b));
    const description = descriptionRelais(lireAdressesRelais(`${a}, ${b}`));
    expect(description).toContain("di•••01@example.com, di•••02@example.com");
    expect(description).not.toContain(a);
    expect(description).not.toContain(b);
  });

  it("jamais l'adresse entière, même courte : au moins un caractère reste caché", () => {
    expect(masquerAdresse("relais@example.com")).toBe("re•••is@example.com");
    expect(masquerAdresse("abcde@example.com")).toBe("ab•••de@example.com");
    expect(masquerAdresse("abcd@example.com")).toBe("a•••d@example.com");
    expect(masquerAdresse("abc@example.com")).toBe("a•••c@example.com");
    expect(masquerAdresse("ab@example.com")).toBe("a•••@example.com");
    expect(masquerAdresse("t@example.org")).toBe("•••@example.org");
    expect(masquerAdresse("pas-une-adresse")).toBe("•••");
    for (const adresse of ["relais@example.com", "abcde@example.com", "abcd@example.com", "abc@example.com", "ab@example.com", "t@example.org"]) {
      const nom = adresse.slice(0, adresse.indexOf("@"));
      expect(masquerAdresse(adresse).replace("•••", ""), adresse).not.toContain(nom);
    }
  });
});

// ── Aucune adresse réelle dans le dépôt (le dépôt est public) ──────────────────────────────────────────────────────

describe("aucune adresse réelle dans le dépôt", () => {
  it("les fichiers du relais ne citent que des adresses d'exemple (domaines réservés), et la variable des adresses est vide dans .env.example", () => {
    const fichiers = [
      ...readdirSync("src/lib").filter((f) => f.startsWith("relais-")).map((f) => join("src/lib", f)),
      "src/app/api/cron/relais/route.ts",
      ...readdirSync("src/app/admin/relais").map((f) => join("src/app/admin/relais", f)),
      "src/app/admin/sante/page.tsx",
      // Les trois paliers du relais (2026101481…) et toute migration du relais nommée depuis (`_relais_`, dont M16 du 19/10).
      ...readdirSync("supabase/migrations").filter((f) => f.startsWith("2026101481") || f.includes("_relais_")).map((f) => join("supabase/migrations", f)),
      ...readdirSync("supabase/retours-arriere").filter((f) => f.startsWith("2026101481") || f.includes("_relais_")).map((f) => join("supabase/retours-arriere", f)),
      ...readdirSync("tests").filter((f) => f.startsWith("relais-") || f === "cron-relais-route.test.ts").map((f) => join("tests", f)),
      "vercel.json",
    ];
    expect(fichiers.length).toBeGreaterThan(20);
    const RESERVES = /@(example\.(com|org|net|invalid)|[a-z0-9.-]+\.(test|invalid|example))$/i;
    for (const f of fichiers) {
      for (const adresse of readFileSync(f, "utf8").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
        expect(adresse, `${f} : ${adresse}`).toMatch(RESERVES);
      }
    }
    const exemple = readFileSync(".env.example", "utf8");
    expect(exemple).toMatch(/^GERIMMO_RELAIS_EMAILS=$/m);
    const commentaire = exemple.slice(exemple.indexOf("# Alerte e-mail quotidienne du relais"), exemple.indexOf("GERIMMO_RELAIS_EMAILS="));
    for (const adresse of commentaire.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) expect(adresse).toMatch(RESERVES);
  });
});
