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

import {
  DELAI_URGENCE_MAX_MINUTES,
  htmlUrgencesRelais,
  libelleUrgence,
  PHRASE_CANAUX_RELAIS,
  PLAFOND_URGENCES_PAR_HEURE,
  sujetUrgencesRelais,
} from "../src/lib/relais-urgences";
import { envoyerUrgencesRelais } from "../src/lib/relais-urgences-envoi";
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

  it("la phrase de la console", () => {
    expect(PHRASE_CANAUX_RELAIS).toBe(`Urgences : e-mail immédiat (délai au plus ${DELAI_URGENCE_MAX_MINUTES} min) ; autres alertes : e-mail quotidien à 5 h (Paris).`);
    expect(DELAI_URGENCE_MAX_MINUTES).toBe(1);
    expect(PLAFOND_URGENCES_PAR_HEURE).toBe(6);
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

  it("un envoi sans urgence lisible est clos sans e-mail (jamais « 1 urgence » annoncée à tort)", async () => {
    const f = fournisseur();
    const b = base({ prendre_urgences_relais: [pris({ urgences: [{ nature: 3 }] })] });
    expect(await envoyerUrgencesRelais({ db: b.db, adresses: ADRESSES, site: SITE })).toEqual({ arret: "rien", envois: [] });
    expect(f.corps()).toEqual([]);
    expect(b.appels.find(([n]) => n === "terminer_urgences_relais")?.[1]).toEqual({ p_envoi: ENVOI, p_destinataires: 2, p_envoyes: 2 });
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
