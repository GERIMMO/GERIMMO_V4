/**
 * D07 (AUD-C-02) : l'écran Santé lit le dernier passage du cycle mensuel et alerte au-delà de 32 jours.
 *
 * Le cycle mensuel des appels de loyer est une tâche pg_cron (le 1er à 5 h UTC). Sa fonction écrit une ligne
 * `cycle_mensuel` dans le journal technique, jamais `tache_…` : Santé ne la lisait pas. Après une restauration dans
 * un projet neuf (qui ne rejoue pas pg_cron) ou un arrêt silencieux de pg_cron, plus aucun appel de loyer n'était
 * généré sans aucun signal. Ces tests gardent la lecture, le seuil, le décompte et l'écran.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  chargerCycleMensuel,
  chargerSante,
  etatCycleMensuel,
  etatConfiguration,
  etatTaches,
  pointsBloquants,
  SEUIL_CYCLE_MENSUEL_JOURS,
} from "../src/lib/sante-service";

const JOUR = 24 * 3_600_000;
const maintenant = new Date("2026-11-20T10:00:00.000Z");
const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * JOUR).toISOString();
const bilan = { baux: 12, appels_crees: 12, quittances: 9, recus: 1, echecs: 0, detail_echecs: [] };
const REGIME = { nature: "franchise" } as const;
const COMPLET = {
  STRIPE_SECRET_KEY: "sk_live_xxx", STRIPE_WEBHOOK_SECRET: "whsec_xxx", STRIPE_PRIX_BIEN: "price_1", STRIPE_PRIX_LOT_AGENCE: "price_2",
  RESEND_API_KEY: "re_xxx", RESEND_EXPEDITEUR: "Gerimmo <no-reply@gerimmo.app>", YOUTRUST_API_KEY: "yt_xxx", YOUTRUST_ENV: "production",
  YOUTRUST_WEBHOOK_SECRET: "ytwh_xxx", CRON_SECRET: "un-secret", SUPABASE_SERVICE_ROLE_KEY: "service", OPENAI_API_KEY: "sk-xxx",
  NEXT_PUBLIC_SITE_URL: "https://gerimmo.app",
};

type Tables = Record<string, unknown[] | null>;
/** Un faux client qui note chaque appel de la chaîne, comme celui de sante-service.test.ts. */
function client(tables: Tables, erreurs: Record<string, unknown> = {}) {
  const appels: unknown[][] = [];
  const db = {
    from: (table: string) => {
      appels.push(["from", table]);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "like", "in", "is", "gte", "order", "limit"]) q[m] = (...a: unknown[]) => { appels.push([m, table, ...a]); return q; };
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: erreurs[table] ?? null }).then(ok);
      return q;
    },
  };
  return { db, appels };
}
const passage = (jours: number, details: unknown = bilan, extra: Record<string, unknown> = {}) => ({ evenement: "cycle_mensuel", details, created_at: ilYa(jours), ...extra });

describe("l'état du cycle mensuel", () => {
  it("le seuil est de 32 jours", () => {
    expect(SEUIL_CYCLE_MENSUEL_JOURS).toBe(32);
  });

  it("un passage récent est à l'heure, avec son bilan en français", () => {
    const c = etatCycleMensuel({ le: ilYa(19), details: bilan }, false, maintenant);
    expect(c).toMatchObject({ etat: "ok", joursDepuis: 19, arretEnCours: false });
    expect(c.bilan).toBe("12 baux examinés, appels créés : 12, quittances : 9, reçus : 1, actions à reprendre : 0");
  });

  it("à 32 jours pile il est encore à l'heure ; au-delà il est en retard", () => {
    expect(etatCycleMensuel({ le: ilYa(32), details: bilan }, false, maintenant).etat).toBe("ok");
    const retard = etatCycleMensuel({ le: ilYa(32.1), details: bilan }, false, maintenant);
    expect(retard.etat).toBe("retard");
    expect(retard.joursDepuis).toBe(32);
    expect(etatCycleMensuel({ le: ilYa(45), details: bilan }, false, maintenant)).toMatchObject({ etat: "retard", joursDepuis: 45 });
  });

  it("aucun passage : « jamais », et un arrêt d'urgence le dit suspendu plutôt qu'en panne", () => {
    expect(etatCycleMensuel(null, false, maintenant)).toMatchObject({ etat: "jamais", le: null, joursDepuis: null, bilan: "aucun passage enregistré" });
    expect(etatCycleMensuel(null, true, maintenant).etat).toBe("suspendu");
    expect(etatCycleMensuel({ le: ilYa(50), details: bilan }, true, maintenant).etat).toBe("suspendu");
    // Un arrêt en cours n'efface pas un passage récent.
    expect(etatCycleMensuel({ le: ilYa(5), details: bilan }, true, maintenant)).toMatchObject({ etat: "ok", arretEnCours: true });
  });

  it("n'affiche jamais un texte libre du journal : seuls des nombres entiers positifs", () => {
    const c = etatCycleMensuel({ le: ilYa(3), details: { baux: "12 rue Secrète", appels_crees: -4, echecs: 1.5, detail_echecs: [{ erreur: "x" }] } }, false, maintenant);
    expect(c.bilan).toBe("résultat détaillé indisponible");
    expect(etatCycleMensuel({ le: ilYa(3), details: null }, false, maintenant).bilan).toBe("résultat détaillé indisponible");
    expect(etatCycleMensuel({ le: ilYa(3), details: { baux: 1 } }, false, maintenant).bilan).toBe("1 bail examiné");
  });
});

describe("la lecture du journal", () => {
  it("lit le dernier cycle_mensuel écrit par le service, sans la fenêtre de 30 jours du journal", async () => {
    const c = client({
      tech_log: [
        { evenement: "tache_appels", details: {}, created_at: ilYa(1) },
        passage(40, { ...bilan, baux: 1 }),
        passage(10, { ...bilan, baux: 2 }),
      ],
    });
    const cycle = await chargerCycleMensuel(c.db, maintenant);
    expect(cycle).toMatchObject({ etat: "ok", joursDepuis: 10 });
    expect(cycle!.bilan).toMatch(/^2 baux examinés/);
    expect(c.appels).toContainEqual(["in", "tech_log", "evenement", ["cycle_mensuel"]]);
    // Seules les lignes écrites par le service valent passage (comme pour les tâches de nuit).
    expect(c.appels).toContainEqual(["is", "tech_log", "account_id", null]);
    // Le cycle est mensuel : une fenêtre de 30 jours le ferait disparaître le 31e jour.
    expect(c.appels.some((a) => a[0] === "gte")).toBe(false);
  });

  it("rend le cycle en retard quand le dernier passage a plus de 32 jours, et jamais quand le journal n'en a aucun", async () => {
    expect((await chargerCycleMensuel(client({ tech_log: [passage(40)] }).db, maintenant))!.etat).toBe("retard");
    expect((await chargerCycleMensuel(client({ tech_log: [] }).db, maintenant))!.etat).toBe("jamais");
  });

  it("repère un arrêt « global », « appels » ou « quittances » ; pas un autre", async () => {
    const lire = async (arrets: unknown[]) => (await chargerCycleMensuel(client({ tech_log: [passage(40)], supervision_arrets: arrets }).db, maintenant))!;
    expect((await lire([{ cle: "global", arrete: true }])).etat).toBe("suspendu");
    expect((await lire([{ cle: "appels", arrete: true }])).etat).toBe("suspendu");
    expect((await lire([{ cle: "quittances", arrete: true }])).etat).toBe("suspendu");
    expect((await lire([{ cle: "relances", arrete: true }])).etat).toBe("retard");
    expect((await lire([{ cle: "global", arrete: false }])).etat).toBe("retard");
  });

  it("une lecture en échec n'invente rien : null pour le journal, pas de suspension pour les arrêts", async () => {
    expect(await chargerCycleMensuel(client({}, { tech_log: { message: "indisponible" } }).db, maintenant)).toBeNull();
    const sansArrets = await chargerCycleMensuel(client({ tech_log: [passage(40)] }, { supervision_arrets: { message: "indisponible" } }).db, maintenant);
    expect(sansArrets!.etat).toBe("retard");
    expect(await chargerCycleMensuel({ from: () => { throw new Error("boum"); } }, maintenant)).toBeNull();
  });
});

describe("le décompte des points bloquants", () => {
  const sante = (tables: Tables, erreurs: Record<string, unknown> = {}) => chargerSante(client(tables, erreurs).db, COMPLET, 0, maintenant, REGIME);
  const base = pointsBloquants(etatConfiguration(COMPLET, REGIME), etatTaches({}, maintenant), 0);

  it("un cycle en retard ajoute un point ; à l'heure, jamais passé ou suspendu, aucun", async () => {
    expect((await sante({ tech_log: [passage(40)] })).bloquants).toBe(base + 1);
    expect((await sante({ tech_log: [passage(40)] })).cycleMensuel?.etat).toBe("retard");
    expect((await sante({ tech_log: [passage(10)] })).bloquants).toBe(base);
    expect((await sante({ tech_log: [] })).bloquants).toBe(base);
    expect((await sante({ tech_log: [passage(40)], supervision_arrets: [{ cle: "global", arrete: true }] })).bloquants).toBe(base);
  });

  it("un journal illisible ne compte pas un point inventé", async () => {
    const s = await sante({}, { tech_log: { message: "indisponible" } });
    expect(s.cycleMensuel).toBeNull();
    expect(s.tachesIllisibles).toBe(true);
    expect(s.bloquants).toBe(pointsBloquants(etatConfiguration(COMPLET, REGIME), [], 0));
  });
});

// ── L'écran ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/app/admin/sante/lancer-mission", () => ({ LancerMission: () => null }));
import PageSante from "../src/app/admin/sante/page";

describe("l'écran Santé", () => {
  // La page prend l'instant courant : les lignes sont datées par rapport à lui.
  const maintenantReel = () => Date.now();
  const passageReel = (jours: number) => ({ evenement: "cycle_mensuel", details: bilan, created_at: new Date(maintenantReel() - jours * JOUR).toISOString() });
  async function rendre(tables: Tables, erreurs: Record<string, unknown> = {}) {
    mocks.createClient.mockResolvedValue(client({ organizations: [], ...tables }, erreurs).db);
    return renderToStaticMarkup(await PageSante());
  }
  beforeEach(() => { mocks.createClient.mockReset(); });

  it("montre le cycle mensuel à l'heure avec son dernier passage", async () => {
    const html = await rendre({ tech_log: [passageReel(12)] });
    expect(html).toContain("Cycle mensuel des loyers");
    expect(html).toContain("12 baux examinés");
    expect(html).toContain("Dernière passe le");
    expect(html).toContain("à l&#x27;heure");
    expect(html).not.toContain("Aucun passage depuis");
  });

  it("alerte au-delà de 32 jours, dit quoi vérifier, et compte le point parmi ceux à traiter", async () => {
    const html = await rendre({ tech_log: [passageReel(40)] });
    expect(html).toContain("Cycle mensuel des loyers");
    expect(html).toContain("en retard");
    expect(html).toContain("Aucun passage depuis 40 jours");
    expect(html).toContain("seuil : 32");
    expect(html).toContain("pg_cron");
    expect(html).toContain("sauvegarde-et-restauration");
    expect(html).toContain("cycle mensuel en retard");
  });

  it("sans passage enregistré : à vérifier, sans l'annoncer comme une panne", async () => {
    const html = await rendre({ tech_log: [] });
    expect(html).toContain("Cycle mensuel des loyers");
    expect(html).toContain("Aucun passage enregistré");
    expect(html).not.toContain("Aucun passage depuis");
  });

  it("sous un arrêt d'urgence, dit que le cycle est suspendu volontairement", async () => {
    const html = await rendre({ tech_log: [passageReel(40)], supervision_arrets: [{ cle: "appels", arrete: true }] });
    expect(html).toContain("arrêt d’urgence");
    expect(html).not.toContain("Aucun passage depuis");
  });

  it("dit que le journal du cycle est illisible plutôt que de montrer un état", async () => {
    const html = await rendre({}, { tech_log: { message: "indisponible" } });
    expect(html).toContain("Le dernier passage du cycle mensuel n’a pas pu être lu");
  });

  it("IA-03 : dit que l'écran ne prévient personne et que le veto marketing est la seule alerte par e-mail", async () => {
    const html = await rendre({ tech_log: [passageReel(5)] });
    expect(html).toContain("Cet écran ne prévient personne");
    expect(html).toContain("veto");
  });
});
