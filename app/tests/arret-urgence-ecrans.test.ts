/**
 * D06 et D46 (option A) : les écrans du dirigeant disent vrai sur ce que l'arrêt d'urgence, le relais et les règles font.
 *
 *  — D06 : l'arrêt couvre aussi les tâches SQL planifiées (la table des périmètres affichée est celle de la migration) ;
 *  — D46 / IA-01 : les règles « Ce qui peut continuer seul » sont des décisions enregistrées, non appliquées automatiquement ;
 *  — D46 / IA-02 : l'urgence et l'escalade du mode vacances ne préviennent pas le responsable ; depuis D46-B
 *    (15/10/2026), celles qui ne sont pas accusées sont comptées dans l'alerte e-mail quotidienne de 5 h, et une urgence
 *    part aussi tout de suite par e-mail immédiat (décision du 15/10), si le relais est configuré ; l'écran le dit
 *    (adresses masquées) ;
 *  — D46 / IA-06 : la clé « sauvegarde » n'est plus proposée (aucun lecteur) et, si elle existe, elle est marquée sans effet ;
 *    le traitement immédiat des signatures n'est pas couvert, et l'écran le dit ;
 *  — D46 / IA-07 : la liste des prochaines étapes ne lance rien.
 *
 * Aucun effet nouveau : seuls des textes, et le refus d'enregistrer un arrêt « sauvegarde » qui ne retiendrait rien.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BandeauArretSupervision } from "../src/components/bandeau-arret-supervision";
import { arretSansEffet, nomArret, TACHES_SQL, tachesSqlArretees } from "../src/lib/nom-arret-supervision";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/app/admin/autonomie/formulaire-delegation", () => ({ FormulaireDelegation: () => null, RevoquerDelegation: () => null, ActualiserDossiers: () => null, DecisionAmelioration: () => null }));
import { commanderRelais } from "../src/app/actions/consignes-vacances";
import { Vacances } from "../src/app/admin/relais/vacances";
import { FormulaireArret, FormulaireVacances, UrgenceInterne } from "../src/app/admin/relais/vacances-formulaires";

/** Un client où chaque lecture rend les lignes de sa table (ou une erreur), quelle que soit la chaîne. */
function client(tables: Record<string, unknown[]>, rpc: (nom: string, args?: Record<string, unknown>) => unknown = async () => ({ data: true, error: null })) {
  const appels: [string, Record<string, unknown> | undefined][] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq", "is", "in", "limit", "neq"]) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok);
    return q;
  };
  const auth = { getUser: async () => ({ data: { user: { id: "admin-test" } }, error: null }) };
  return { from, auth, rpc: async (nom: string, args?: Record<string, unknown>) => { appels.push([nom, args]); return rpc(nom, args); }, appels };
}

beforeEach(() => { mocks.createClient.mockReset(); mocks.revalidate.mockReset(); });

describe("D06 : le périmètre des tâches SQL affiché est celui de la migration", () => {
  const migration = readFileSync("supabase/migrations/20261014200000_arret_urgence_taches_planifiees.sql", "utf8");
  const paires = [...migration.matchAll(/^\s*\('([a-z-]+)', '([a-z]+)'\)[,]?\s*$/gm)].map((m) => [m[1], m[2]] as const);

  it("chaque couple tâche / clé de la table SQL figure dans la liste de l'écran, et inversement", () => {
    expect(paires.length).toBe(9);
    const sql = paires.map(([t, c]) => `${t}:${c}`).sort();
    const ecran = Object.entries(TACHES_SQL).flatMap(([t, v]) => v.cles.map((c) => `${t}:${c}`)).sort();
    expect(ecran).toEqual(sql);
  });

  it("le périmètre « purge » dit qu'il retient aussi la purge des données, pas seulement celle des fichiers", () => {
    expect(nomArret("purge")).toBe("Purge des données échues et suppression des fichiers");
    const liste = renderToStaticMarkup(createElement(FormulaireArret, {}));
    expect(liste).toContain("Purge des données échues et suppression des fichiers");
    expect(liste).not.toContain("Suppression des fichiers purgés");
    // Les autres périmètres gardent le nom de leur mission.
    expect(nomArret("quittances")).toBe("Quittances");
    expect(liste).toContain("Avis d’échéance");
  });

  it("l'arrêt global les arrête toutes ; une clé n'arrête que les siennes", () => {
    expect(tachesSqlArretees("global")).toHaveLength(8);
    expect(tachesSqlArretees("purge")).toEqual(["Purge quotidienne des données dont la durée de conservation est échue"]);
    expect(tachesSqlArretees("rappels")).toHaveLength(3);
    expect(tachesSqlArretees("marketing")).toHaveLength(2);
    expect(tachesSqlArretees("territoire")).toEqual([]);
  });
});

describe("D46 / IA-06 : la clé « sauvegarde »", () => {
  it("est reconnue comme sans effet, les autres non", () => {
    expect(arretSansEffet("sauvegarde")).toBe(true);
    for (const cle of ["global", "purge", "appels", "marketing", "orchestrateur"]) expect(arretSansEffet(cle)).toBe(false);
  });

  it("le bandeau d'une ligne « sauvegarde » ne prétend pas qu'un traitement est suspendu", () => {
    const html = renderToStaticMarkup(createElement(BandeauArretSupervision, { arrets: [{ cle: "sauvegarde", motif: "Essai", modifie_le: "2026-10-13T22:42:00Z" }], relais: [] }));
    expect(html).toContain("Arrêt enregistré sans effet : Sauvegarde");
    expect(html).toContain("la sauvegarde ne lit pas cet arrêt et continue");
    expect(html).not.toContain("Les traitements concernés sont suspendus");
    expect(html).not.toContain("Arrêt d’urgence en cours");
  });

  it("le bandeau d'un vrai arrêt est inchangé", () => {
    const html = renderToStaticMarkup(createElement(BandeauArretSupervision, { arrets: [{ cle: "purge", motif: "Essai", modifie_le: "2026-10-13T22:42:00Z" }], relais: [] }));
    expect(html).toContain("Arrêt d’urgence en cours : " + nomArret("purge"));
    expect(html).toContain("Les traitements concernés sont suspendus tant que l’arrêt n’est pas levé");
  });

  it("le formulaire ne propose plus « Sauvegarde », sauf pour lever un arrêt déjà enregistré", () => {
    const sans = renderToStaticMarkup(createElement(FormulaireArret, {}));
    expect(sans).not.toContain("Sauvegarde");
    expect(sans).toContain("Suivi des dossiers");
    expect(sans).toContain("Tous les traitements contrôlés");
    const avec = renderToStaticMarkup(createElement(FormulaireArret, { sauvegardeArretee: true }));
    expect(avec).toContain("Sauvegarde (sans effet, à lever)");
  });

  it("enregistrer un arrêt « sauvegarde » est refusé avec la raison ; le lever reste possible", async () => {
    const c = client({});
    mocks.createClient.mockResolvedValue(c);
    const f = (commande: string) => { const d = new FormData(); d.set("commande", commande); d.set("portee", "sauvegarde"); d.set("motif", "Essai de contrôle"); return d; };
    const refus = await commanderRelais({}, f("arreter"));
    expect(refus.erreur).toMatch(/aucun effet/);
    expect(refus.erreur).toMatch(/sauvegarde nocturne ne lit pas/);
    expect(c.appels.some(([nom]) => nom === "commander_arret_supervision")).toBe(false);
    const levee = await commanderRelais({}, f("reprendre"));
    expect(levee.succes).toBeDefined();
    expect(c.appels).toContainEqual(["commander_arret_supervision", { p_cle: "sauvegarde", p_plan: null, p_arreter: false, p_motif: "Essai de contrôle" }]);
  });
});

describe("D06 / D46 : l'écran « Arrêt avant les prochains effets » et le mode vacances", () => {
  async function rendreVacances(arrets: unknown[] = []) {
    mocks.createClient.mockResolvedValue(client({ supervision_arrets: arrets }));
    return renderToStaticMarkup(await (Vacances as unknown as () => Promise<React.ReactElement>)());
  }

  it("dit que l'arrêt couvre les tâches de la base, par périmètre, et que la sauvegarde et les signatures ne sont pas retenues", async () => {
    const html = await rendreVacances();
    expect(html).toContain("L’arrêt couvre aussi les tâches planifiées dans la base de données");
    expect(html).toContain("n’est pas rattrapée quand l’arrêt est levé");
    for (const t of Object.values(TACHES_SQL)) expect(html).toContain(t.libelle);
    expect(html).toContain("Cycle mensuel : appels de loyer et quittances du mois");
    expect(html).toContain("« Avis d’échéance », « Quittances », « Tous les traitements contrôlés »");
    expect(html).toContain("Ce que l’arrêt ne couvre pas.");
    expect(html).toContain("La sauvegarde nocturne ne lit pas l’arrêt et continue");
    expect(html).toContain("traitement immédiat des signatures");
  });

  it("rattrapage d'un 1er du mois sauté : garder « Relances de loyers » arrêtée jusqu'à l'envoi des avis, sans quoi un locataire reçoit avis et relance le même matin", async () => {
    // Constat vérifié sur la base (arret-taches-planifiees.test.ts, « constat : après un cycle sauté… ») : les appels créés au
    // rattrapage portent l'échéance du 1er du mois manqué ; la mission des relances les lit comme des impayés anciens.
    const html = (await rendreVacances()).replace(/\s+/g, " ");
    expect(html).toContain("Si l’arrêt a couvert un 1er du mois");
    expect(html).toContain("l’avis d’échéance et une relance pour le même loyer");
    expect(html).toContain("gardez « Relances de loyers » arrêtée jusqu’à l’envoi des avis du rattrapage");
    expect(html).toContain("décocher « Relancer automatiquement les loyers impayés par e-mail » (rubrique Profil) le temps du rattrapage");
    // Les deux noms sont ceux des missions affichées partout ailleurs, et la case citée est celle du profil de l'agence.
    expect(html).toContain(`« ${nomArret("appels")} »`);
    expect(html).toContain(`« ${nomArret("relances")} »`);
    expect(readFileSync("src/app/agence/[orgId]/profil/formulaire-profil.tsx", "utf8")).toContain("Relancer automatiquement les loyers impayés par e-mail");
  });

  it("la documentation de reprise donne la même consigne que l'écran", () => {
    const doc = readFileSync("docs/sauvegarde-et-restauration.md", "utf8").replace(/\s+/g, " ");
    expect(doc).toContain("Si l'arrêt a couvert un 1er du mois");
    expect(doc).toContain("l'avis d'échéance et une relance pour le même loyer");
    expect(doc).toContain("garder la mission « Relances de loyers » arrêtée jusqu'à l'envoi des avis du rattrapage");
    expect(doc).toContain("décocher « Relancer automatiquement les loyers impayés par e-mail » (rubrique Profil) le temps du rattrapage");
  });

  // D46-B (15/10/2026) : le texte de D46-A (« alerte interne seulement ») dit désormais la vérité de l'alerte e-mail
  // du relais : vers combien d'adresses (masquées), ou « relais non configuré ». Décision du 15/10 (« envoi immédiat
  // pour les urgences ») : une urgence part aussi tout de suite par e-mail vers les adresses du relais, jamais vers le
  // responsable ; une escalade, elle, n'est comptée qu'à 5 h.
  it("IA-02, relais non configuré : personne n'est prévenu sur le moment, aucun e-mail ne reprend les urgences", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "");
    try {
      const html = await rendreVacances();
      expect(html).toContain("aucun e-mail ni message n’est envoyé au responsable");
      expect(html).toContain("Le relais n’étant pas configuré, aucun e-mail ne la reprend, ni immédiat ni quotidien.");
      expect(html).toContain("Ces alertes se lisent ici ; personne n’est prévenu sur le moment. Relais non configuré : aucun e-mail, immédiat ou quotidien, ne les reprend.");
      expect(html).toContain("Un incident urgent ou un impayé ne la déclenche pas");
      expect(html).not.toContain("Pas d’alerte immédiate.");
      expect(html).not.toContain("Alerte interne seulement.");
      expect(html).not.toContain("Les alertes restent internes.");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("IA-02, relais configuré : une urgence part en e-mail immédiat (délai au plus 1 min), comptée aussi à 5 h, adresses masquées", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com, second@example.org");
    try {
      const html = await rendreVacances();
      expect(html).toContain("Une urgence part aussi tout de suite, sans son texte, par e-mail immédiat (délai au plus 1 min) vers 2 adresses du relais : re•••is@example.com, se•••nd@example.org.");
      expect(html).toContain("Tant qu’elle n’est pas accusée, elle est aussi comptée dans l’alerte e-mail quotidienne de 5 h (heure de Paris).");
      expect(html).toContain("Une escalade n’envoie pas d’e-mail immédiat : elle est comptée à 5 h.");
      expect(html).toContain("Chaque nouvelle urgence part aussi par e-mail immédiat vers les adresses du relais ; celles qui ne sont pas accusées sont comptées dans l’alerte e-mail quotidienne de 5 h (heure de Paris).");
      expect(html).not.toContain("Pas d’alerte immédiate.");
      expect(html).not.toContain("relais@example.com");
      expect(html).not.toContain("second@example.org");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("les formulaires du relais ne promettent plus « aucun e-mail sur le moment » : ils disent l'e-mail immédiat, sans le texte saisi", () => {
    const urgence = renderToStaticMarkup(createElement(UrgenceInterne, { plan: "plan-1" }));
    expect(urgence).toContain("La même référence conserve une seule alerte, et un seul e-mail.");
    expect(urgence).toContain("Si le relais est configuré, un e-mail immédiat part vers ses adresses, sans le texte saisi");
    expect(urgence).not.toContain("Aucun e-mail ni message ne part sur le moment");
    const vacances = renderToStaticMarkup(createElement(FormulaireVacances, { comptes: [], versions: [] }));
    expect(vacances).toContain("Le responsable n’est pas prévenu par e-mail ; les urgences partent par e-mail immédiat vers les adresses du relais");
    expect(vacances).not.toContain("Aucune notification immédiate");
  });

  it("l'arrêt d'urgence ne coupe ni l'alerte e-mail de 5 h ni l'e-mail immédiat des urgences, et l'écran le dit", async () => {
    const html = await rendreVacances();
    expect(html).toContain("L’alerte e-mail quotidienne du relais n’est pas coupée non plus : elle signale justement l’arrêt en cours.");
    expect(html).toContain("L’e-mail immédiat des urgences du relais part lui aussi : c’est une alerte au dirigeant, sans effet sur les utilisateurs.");
  });

  it("une ligne « sauvegarde » déjà enregistrée est marquée sans effet et peut être levée", async () => {
    const html = await rendreVacances([{ cle: "sauvegarde", arrete: true, motif: "Essai de contrôle" }, { cle: "purge", arrete: false, motif: "Reprise" }]);
    expect(html).toContain("sans effet : la sauvegarde ne lit pas cet arrêt.");
    expect(html).toContain("Sauvegarde (sans effet, à lever)");
  });
});

describe("D46 / IA-01 et IA-07 : la page « Relais en mon absence » et la liste des étapes", () => {
  it("les règles sont des décisions enregistrées, non appliquées automatiquement", async () => {
    // La page contient le composant serveur asynchrone « Vacances » (testé plus haut) : on le remplace par un vide.
    vi.resetModules();
    vi.doMock("../src/app/admin/relais/vacances", () => ({ Vacances: () => null }));
    const { default: PageRelais } = await import("../src/app/admin/relais/page");
    mocks.createClient.mockResolvedValue(client({
      continuity_rules: [
        { cle: "incident_urgent", libelle: "Sécuriser un incident urgent et prévenir les personnes concernées", decision: "agir_seul", delai_heures: 1, active: true },
        { cle: "paiement", libelle: "Attendre une validation humaine avant tout mouvement d’argent", decision: "delegue_requis", delai_heures: 168, active: true },
        { cle: "x", libelle: "Autre règle", decision: "attendre", delai_heures: 24, active: true },
      ],
    }, async (nom) => ({ data: nom === "etat_continuite" ? { delai_jours: 7, derniere_presence: null, responsable_habilite: false, responsable: null, consignes: "" } : true, error: null })));
    const html = renderToStaticMarkup(await PageRelais());
    expect(html).toContain("Règles notées pour mon absence — non appliquées automatiquement");
    expect(html).not.toContain(">Ce qui peut continuer seul<");
    expect(html).toContain("Aucun traitement automatique ne les lit ni ne les applique");
    expect(html).toContain("Décision enregistrée : agir sans attendre");
    expect(html).toContain("Décision enregistrée : un responsable autorisé décide");
    expect(html).toContain("Décision enregistrée : attendre votre retour");
    expect(html.match(/Non appliquée automatiquement/g)).toHaveLength(3);
    // L'ancienne phrase laissait croire à un traitement prévu.
    expect(html).not.toContain("Traitement prévu dans les autorisations existantes");
  });

  it("le plan de continuité dit que le dépassement du délai ne prévient personne", () => {
    const html = readFileSync("src/app/admin/equipes/continuite.tsx", "utf8");
    expect(html).toContain("aucun e-mail ni message n’est envoyé");
  });

  it("la liste des prochaines étapes dit qu'elle ne lance rien", () => {
    const page = readFileSync("src/app/admin/autonomie/page.tsx", "utf8");
    expect(page).toContain("elle ne la lance pas, l’étape se fait dans le dossier concerné");
  });
});
