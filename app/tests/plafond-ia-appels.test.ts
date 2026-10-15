/**
 * Décision X19 (fiche SA-10) : chaque appel payant à l'IA consulte, juste avant de partir, l'arrêt d'urgence et la
 * limite quotidienne (reserver_appel_ia, migration 20261014730000). Refus = l'appel n'a pas lieu, et l'écran le dit.
 *
 * Inventaire vérifié dans le code le 15/10/2026, sept chemins :
 *   tâches planifiées — étude de la veille (analyse-veille.ts), rédaction d'un post depuis une actualité
 *   (redaction-veille.ts), visuel du post (visuel-marketing.ts) ;
 *   gestes — analyse du brief et rédaction d'un article (console), proposition de devis d'un artisan
 *   (proposition-devis-ia.ts), lancement de l'atelier de corrections (console, modèle appelé par GitHub).
 *
 * AUCUN appel réel : `fetch` est toujours simulé, la base aussi. Les règles de la base (atomicité, jour de Paris,
 * droits) ont leur propre test : plafond-appels-ia-base.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ createClient: vi.fn(), charger: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/parcours-devis-serveur", () => ({ chargerPreparationDevis: m.charger }));
vi.mock("@/app/artisan/acces", () => ({ verifierArtisanAction: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifierDevisRecu: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import {
  lirePlafondIA, MESSAGE_ARRET_IA, MESSAGE_CONTROLE_IA_INDISPONIBLE, MESSAGE_LIMITE_IA, PlafondIAAtteint, reserverAppelIA,
} from "@/lib/plafond-ia";
import { etudierVeille } from "@/lib/analyse-veille";
import { redigerArticleVeille } from "@/lib/redaction-veille";
import { creerVisuelMarketing } from "@/lib/visuel-marketing";
import { proposerDevis } from "@/lib/proposition-devis-ia";
import { verificationCreditIA } from "@/lib/sante-service";
import { analyserBriefIA } from "@/app/admin/brief/actions";
import { creerArticleIA } from "@/app/admin/publications/nouvelle/actions";
import { preparerPropositionDevis } from "@/app/artisan/devis/actions-preparation";
import { reglerPlafondIA } from "@/app/actions/plafond-ia";
import { LimiteAppelsIA } from "@/app/admin/relais/limite-ia";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const fetchSimule = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchSimule);
  fetchSimule.mockReset();
  // Toute réponse simulée est un refus du fournisseur : jamais un appel réel, et le test vérifie seulement qu'il est PARTI.
  fetchSimule.mockResolvedValue(new Response(JSON.stringify({ error: { code: "server_error" } }), { status: 500 }));
  vi.stubEnv("OPENAI_API_KEY", "cle-de-test-jamais-reelle");
  m.createClient.mockReset(); m.charger.mockReset(); m.revalidate.mockReset(); m.redirect.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const appelsOpenAI = () => fetchSimule.mock.calls.filter(([url]) => String(url).startsWith("https://api.openai.com/"));
const refusLimite = async () => { throw new PlafondIAAtteint(); };
const refusArret = async () => { throw new ArretSupervision(MESSAGE_ARRET_IA); };
const accord = vi.fn(async () => {});

/** Une base simulée : `rpc` rend le statut demandé pour la réservation, `true` pour les contrôles d'accès. */
function base(statutIA: string | Error, autres: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (nom: string) => {
    if (nom === "reserver_appel_ia") {
      if (statutIA instanceof Error) throw statutIA;
      return { data: statutIA, error: null };
    }
    return { data: nom in autres ? autres[nom] : true, error: null };
  });
  const chaine = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "is", "order", "limit"]) q[k] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(ok);
    q.insert = () => ({ select: () => ({ single: async () => ({ data: { id: "publication-test" }, error: null }) }) });
    return q;
  };
  return { rpc, from: vi.fn(chaine) };
}

// ── La garde elle-même ───────────────────────────────────────────────────────

describe("reserverAppelIA : la réponse de la base décide si l'appel part", () => {
  it.each([
    ["accorde", null],
    ["plafond", PlafondIAAtteint],
    ["arret", ArretSupervision],
    ["inattendu", ArretSupervision],
  ] as const)("« %s »", async (statut, erreur) => {
    const db = base(statut);
    const r = reserverAppelIA(db as unknown as SupabaseClient, "brief");
    if (erreur) await expect(r).rejects.toBeInstanceOf(erreur); else await expect(r).resolves.toBeUndefined();
    expect(db.rpc).toHaveBeenCalledWith("reserver_appel_ia", { p_usage: "brief" });
  });

  it("un contrôle illisible (erreur de la base ou réseau) empêche l'appel, par prudence", async () => {
    const enErreur = { rpc: vi.fn(async () => ({ data: null, error: { message: "indisponible" } })) };
    await expect(reserverAppelIA(enErreur as unknown as SupabaseClient, "devis")).rejects.toMatchObject({ raison: "indisponible", message: MESSAGE_CONTROLE_IA_INDISPONIBLE });
    await expect(reserverAppelIA(base(new Error("réseau")) as unknown as SupabaseClient, "devis")).rejects.toMatchObject({ raison: "indisponible" });
  });

  it("la limite saisie dans la console se lit strictement : entier de 0 à 1 000", () => {
    expect(lirePlafondIA("50")).toEqual({ plafond: 50 });
    expect(lirePlafondIA(" 0 ")).toEqual({ plafond: 0 });
    expect(lirePlafondIA("1000")).toEqual({ plafond: 1000 });
    for (const brut of ["", "1001", "-1", "12,5", "1e3", "0x10", "Infinity", "dix", null]) expect(lirePlafondIA(brut), String(brut)).toHaveProperty("erreur");
  });
});

// ── Tâches planifiées ────────────────────────────────────────────────────────

describe("tâches planifiées : la garde passe juste avant l'appel, après la clé", () => {
  const sources = [{ id: "s1", titre: "Actualité", url: "https://www.service-public.gouv.fr/a", texte: "x".repeat(300) }];
  const info = { id: "v1", titre: "Actualité", source_url: "https://www.service-public.gouv.fr/particuliers/actualites/A1", source_nom: "Service Public", publie_source_le: null };
  const env = { OPENAI_API_KEY: "cle-de-test-jamais-reelle" } as unknown as NodeJS.ProcessEnv;

  it.each([
    ["étude de la veille", (garde: () => Promise<void>) => etudierVeille(sources, garde, env)],
    ["rédaction d'un post", (garde: () => Promise<void>) => redigerArticleVeille(info, "Texte officiel", garde, env)],
    ["visuel d'un post", (garde: () => Promise<void>) => creerVisuelMarketing("p1", "Un titre", garde)],
  ])("%s : limite atteinte ou arrêt = aucun appel, l'erreur remonte telle quelle", async (_nom, appeler) => {
    await expect(appeler(refusLimite)).rejects.toBeInstanceOf(PlafondIAAtteint);
    await expect(appeler(refusArret)).rejects.toBeInstanceOf(ArretSupervision);
    expect(appelsOpenAI()).toHaveLength(0);
    accord.mockClear();
    await expect(appeler(accord)).rejects.toThrow();
    expect(accord).toHaveBeenCalledTimes(1);
    expect(appelsOpenAI()).toHaveLength(1);
  });

  it("sans clé, ni réservation ni appel (une place n'est pas consommée pour rien)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPEN_AI_KEY", "");
    accord.mockClear();
    await expect(etudierVeille(sources, accord, {} as NodeJS.ProcessEnv)).rejects.toThrow(/connexion de l’IA/);
    await expect(redigerArticleVeille(info, "Texte", accord, {} as NodeJS.ProcessEnv)).rejects.toThrow(/connexion de l’IA/);
    await expect(creerVisuelMarketing("p1", "Titre", accord)).rejects.toThrow(/connexion de l’IA/);
    expect(accord).not.toHaveBeenCalled();
    expect(fetchSimule).not.toHaveBeenCalled();
  });
});

// ── Gestes de la console ─────────────────────────────────────────────────────

describe("console : le brief IA et la rédaction d'un article", () => {
  const formulaireArticle = () => {
    const f = new FormData();
    f.set("sujet", "Expliquer le suivi d’un incident locatif");
    f.set("public", "Agences");
    f.set("faits", "Gerimmo suit les incidents, les devis et les interventions des artisans.");
    return f;
  };

  it.each([
    ["plafond", MESSAGE_LIMITE_IA],
    ["arret", MESSAGE_ARRET_IA],
    ["inattendu", MESSAGE_CONTROLE_IA_INDISPONIBLE],
  ])("brief : réservation « %s » = aucun appel, le message le dit", async (statut, message) => {
    const db = base(statut);
    m.createClient.mockResolvedValue(db);
    expect(await analyserBriefIA()).toEqual({ erreur: message });
    expect(appelsOpenAI()).toHaveLength(0);
    expect(db.rpc).toHaveBeenCalledWith("reserver_appel_ia", { p_usage: "brief" });
  });

  it("brief : réservation accordée = un appel", async () => {
    m.createClient.mockResolvedValue(base("accorde"));
    await analyserBriefIA();
    expect(appelsOpenAI()).toHaveLength(1);
  });

  it("brief : sans accès de supervision, ni réservation ni appel", async () => {
    const db = base("accorde", { is_super_admin: false });
    m.createClient.mockResolvedValue(db);
    expect((await analyserBriefIA()).erreur).toMatch(/réservé à la supervision/);
    expect(db.rpc).not.toHaveBeenCalledWith("reserver_appel_ia", expect.anything());
  });

  it.each([
    ["plafond", MESSAGE_LIMITE_IA],
    ["arret", MESSAGE_ARRET_IA],
  ])("article : réservation « %s » = aucun appel, saisie conservée, le message le dit", async (statut, message) => {
    const db = base(statut);
    m.createClient.mockResolvedValue(db);
    const r = await creerArticleIA({}, formulaireArticle());
    expect(r.erreur).toBe(message);
    expect(r.valeurs?.sujet).toBe("Expliquer le suivi d’un incident locatif");
    expect(appelsOpenAI()).toHaveLength(0);
    expect(db.rpc).toHaveBeenCalledWith("reserver_appel_ia", { p_usage: "article" });
  });

  it("article : réservation accordée = un appel", async () => {
    m.createClient.mockResolvedValue(base("accorde"));
    await creerArticleIA({}, formulaireArticle());
    expect(appelsOpenAI()).toHaveLength(1);
  });
});

// ── La proposition de devis de l'artisan ────────────────────────────────────

describe("artisan : la proposition de devis", () => {
  it.each([
    [refusLimite, /limite du jour/],
    [refusArret, /suspendue/],
  ] as const)("refus de la garde = aucun appel, proposition issue des références, et l'artisan le lit", async (garde, motif) => {
    const p = await proposerDevis("plomberie_canalisation", "Fuite au robinet", [], garde);
    expect(appelsOpenAI()).toHaveLength(0);
    expect(p.moteur).toBe("references");
    expect(p.a_verifier[0]).toMatch(motif);
    expect(p.a_verifier[0]).toContain("catalogue de références");
  });

  it("sans clé, la garde n'est pas consultée", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPEN_AI_KEY", "");
    accord.mockClear();
    await proposerDevis("plomberie_canalisation", "Fuite", [], accord);
    expect(accord).not.toHaveBeenCalled();
  });

  it("l'action de l'artisan réserve par le client de service (usage « devis ») avant l'appel", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const service = { rpc: vi.fn(async (nom: string) => ({ data: nom === "reserver_appel_ia" ? "plafond" : [], error: null })), from: () => ({ upsert }) };
    m.charger
      .mockResolvedValueOnce({ service, fiche: { artisan_id: "a1" }, demande: { statut: "envoyee", categorie: "plomberie_canalisation", description: "Fuite" }, preparation: null })
      .mockResolvedValueOnce({ preparation: { statut: "brouillon", revision: 0 } });
    await preparerPropositionDevis("s1");
    expect(service.rpc).toHaveBeenCalledWith("reserver_appel_ia", { p_usage: "devis" });
    expect(appelsOpenAI()).toHaveLength(0);
    const enregistree = (upsert.mock.calls[0] as unknown as [{ proposition: { moteur: string; a_verifier: string[] } }])[0].proposition;
    expect(enregistree.moteur).toBe("references");
    expect(enregistree.a_verifier[0]).toMatch(/limite du jour/);
  });
});

// ── Le réglage dans la console ───────────────────────────────────────────────

describe("console : régler la limite quotidienne", () => {
  const f = (v: string) => { const d = new FormData(); d.set("plafond", v); return d; };

  it("une saisie invalide n'atteint pas la base", async () => {
    const db = base("accorde");
    m.createClient.mockResolvedValue(db);
    for (const v of ["", "1001", "12,5", "1e3", "-3"]) expect((await reglerPlafondIA({}, f(v))).erreur, v).toMatch(/de 0 à 1/);
    expect(db.rpc).not.toHaveBeenCalledWith("regler_plafond_ia", expect.anything());
  });

  it("le superviseur permanent enregistre la limite ; 0 dit qu'aucun appel ne partira", async () => {
    const db = base("accorde");
    m.createClient.mockResolvedValue(db);
    expect((await reglerPlafondIA({}, f("20"))).succes).toMatch(/au plus 20 appels payants à l’IA par jour/);
    expect(db.rpc).toHaveBeenCalledWith("regler_plafond_ia", { p_plafond: 20 });
    expect((await reglerPlafondIA({}, f("0"))).succes).toMatch(/plus aucun appel payant/);
    expect(m.revalidate).toHaveBeenCalledWith("/admin/relais");
  });

  it("sans supervision permanente, rien n'est enregistré", async () => {
    const db = base("accorde", { is_permanent_super_admin: false });
    m.createClient.mockResolvedValue(db);
    expect((await reglerPlafondIA({}, f("20"))).erreur).toMatch(/superviseur permanent/);
    expect(db.rpc).not.toHaveBeenCalledWith("regler_plafond_ia", expect.anything());
  });
});

// ── L'écran « Relais en mon absence » : la limite, le compteur du jour, ce que l'arrêt retient ──

describe("console : l'écran de la limite quotidienne", () => {
  const rendre = (props: Parameters<typeof LimiteAppelsIA>[0]) => renderToStaticMarkup(createElement(LimiteAppelsIA, props)).replace(/\s+/g, " ");

  it("dit le compteur du jour de Paris, les refus, la valeur par défaut, et propose le réglage", () => {
    const html = rendre({ reglage: { plafond_jour: 50, modifie_le: "2026-10-15T08:00:00Z", modifie_par: null }, jour: { appels: 3, refus: 2 }, lisible: true, auteur: null });
    expect(html).toContain("Aujourd’hui : 3 appels sur 50 permis.");
    expect(html).toContain("2 appels n’ont pas eu lieu, faute de place.");
    expect(html).toContain("Limite par défaut : 50 appels par jour.");
    expect(html).toContain("Valeur par défaut, jamais modifiée.");
    expect(html).toContain("y compris ceux lancés à la main");
    expect(html).toContain('name="plafond"');
    expect(html).toContain("Enregistrer la limite");
  });

  it("dit, pour chaque appel, quels arrêts le retiennent ; et ce que l'écran ne couvre pas (l'atelier lancé depuis GitHub)", () => {
    const html = rendre({ reglage: { plafond_jour: 50, modifie_le: "2026-10-15T08:00:00Z", modifie_par: null }, jour: null, lisible: true, auteur: null });
    expect(html).toContain("L’étude des actualités de la veille (tâche planifiée)</b> — arrêté par « Tous les traitements contrôlés » et par « Veille réglementaire »");
    expect(html).toContain("La rédaction assistée d’un article (console)</b> — arrêté par « Tous les traitements contrôlés » et par « Publications et publicité »");
    expect(html).toContain("La proposition de devis préparée pour un artisan</b> — arrêté par « Tous les traitements contrôlés ».");
    expect(html).toContain("Un lancement fait directement depuis GitHub, hors de Gerimmo, n’est ni compté ni arrêté.");
    expect(html).toContain("Aujourd’hui : 0 appel sur 50 permis.");
  });

  it("limite à 0, dernier réglage et auteur", () => {
    const html = rendre({ reglage: { plafond_jour: 0, modifie_le: "2026-10-15T08:00:00Z", modifie_par: "compte-1" }, jour: null, lisible: true, auteur: "superviseur@test.local" });
    expect(html).toContain("La limite est à 0 : aucun appel payant à l’IA ne part.");
    expect(html).toContain("Dernier réglage le");
    expect(html).toContain("par superviseur@test.local");
  });

  it("lecture en erreur : l'écran le dit, sans chiffre inventé", () => {
    const html = rendre({ reglage: { plafond_jour: 50, modifie_le: "2026-10-15T08:00:00Z", modifie_par: null }, jour: null, lisible: false, auteur: null });
    expect(html).toContain("La limite et le compteur du jour ne peuvent pas être lus actuellement.");
    expect(html).not.toContain("Aujourd’hui :");
  });

  it("lecture vide (relais temporaire, que la base ne laisse pas lire) : l'écran dit qui la voit, et qu'elle s'applique", () => {
    const html = rendre({ reglage: null, jour: null, lisible: true, auteur: null });
    expect(html).toContain("ne sont visibles que par un superviseur permanent, avec sa double vérification. Ils s’appliquent à chaque appel.");
    expect(html).not.toContain("Aujourd’hui :");
  });
});

// ── L'écran Santé ne confond pas la limite de Gerimmo avec le crédit du fournisseur ──

describe("Santé : un refus de Gerimmo n'est pas un crédit épuisé chez le fournisseur", () => {
  it.each([MESSAGE_LIMITE_IA, MESSAGE_ARRET_IA, MESSAGE_CONTROLE_IA_INDISPONIBLE])("« %s »", (message) => {
    const maintenant = new Date().toISOString();
    for (const ligne of [
      { evenement: "veille_analyse_echec", details: { motif: message.slice(0, 200), sources: 1 }, created_at: maintenant },
      { evenement: "tache_marketing", details: { preparation: { erreur: message }, erreurs: [message] }, created_at: maintenant },
    ]) expect(verificationCreditIA([ligne], true).etat).toBe("ok");
  });
});

// ── Inventaire : aucun appel au fournisseur sans garde juste avant ──────────

describe("inventaire : chaque appel payant de l'application passe par la garde", () => {
  const RACINE = resolve(__dirname, "../src");
  const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((n) => {
    const chemin = join(dossier, n);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(ts|tsx)$/.test(n) ? [chemin] : [];
  });
  const sources = fichiers(RACINE).map((f) => ({ f: relative(RACINE, f), texte: readFileSync(f, "utf8") }));

  it("les appels à l'API du fournisseur sont exactement ceux de l'inventaire", () => {
    expect(sources.filter((s) => s.texte.includes("api.openai.com")).map((s) => s.f).sort()).toEqual([
      "app/admin/brief/actions.ts",
      "app/admin/publications/nouvelle/actions.ts",
      "lib/analyse-veille.ts",
      "lib/proposition-devis-ia.ts",
      "lib/redaction-veille.ts",
      "lib/visuel-marketing.ts",
    ]);
  });

  it("dans chacun, la garde précède chaque appel", () => {
    for (const { f, texte } of sources.filter((s) => s.texte.includes("api.openai.com"))) {
      const appels = [...texte.matchAll(/fetch\(\s*["'`]https:\/\/api\.openai\.com/g)].map((x) => x.index ?? 0);
      expect(appels.length, f).toBeGreaterThan(0);
      const garde = Math.max(texte.indexOf("await avantAppel()"), texte.indexOf("await reserverAppelIA("));
      expect(garde, f).toBeGreaterThan(-1);
      for (const i of appels) expect(garde, `${f} : garde après l'appel`).toBeLessThan(i);
    }
  });

  it("les tâches planifiées et l'action de l'artisan passent la bonne garde", () => {
    const lire = (f: string) => readFileSync(resolve(RACINE, f), "utf8");
    expect(lire("lib/missions-planifiees/veille.ts")).toMatch(/etudierVeille\(sources,\s*\(\)\s*=>\s*reserverAppelIA\(db,\s*'veille'\)\)/);
    expect(lire("lib/missions-planifiees/marketing.ts")).toMatch(/redigerArticleVeille\([^;]*\(\)\s*=>\s*reserverAppelIA\(db,\s*'redaction_veille'\)\)/);
    expect(lire("lib/missions-planifiees/marketing.ts")).toMatch(/creerVisuelMarketing\([^;]*\(\)\s*=>\s*reserverAppelIA\(db,\s*'visuel_marketing'\)\)/);
    expect(lire("app/artisan/devis/actions-preparation.ts")).toMatch(/proposerDevis\([^;]*\(\)\s*=>\s*reserverAppelIA\(service,\s*"devis"\)\)/);
  });

  it("l'atelier de corrections réserve avant de lancer le travail du modèle chez GitHub", () => {
    const texte = readFileSync(resolve(RACINE, "app/actions/equipes.ts"), "utf8");
    const garde = texte.indexOf("reserverAppelIA(db,'atelier')");
    expect(garde).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(texte.indexOf("atelier-code.yml/dispatches"));
  });
});
