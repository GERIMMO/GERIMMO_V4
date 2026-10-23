/**
 * LOT CONSOLE — liste d'attente des agences (20/10/2026).
 *
 * Le dirigeant voit les agences inscrites depuis /agences, note celles qu'il a contactées, exporte la liste. Ici, sans
 * base (client Supabase simulé) : l'onglet de la rubrique « Développement commercial », la mise en forme CSV, l'action
 * de statut et la route d'export. Le parcours au navigateur est dans e2e/console-liste-attente.spec.ts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { RUBRIQUES, ongletActif, rubriqueActive } from "../src/lib/rubriques-supervision";
import {
  BOM_UTF8,
  champCsv,
  csvListeAttenteAgences,
  ENTETE_CSV_LISTE_ATTENTE,
  nomFichierExportListeAttente,
  type LigneListeAttente,
} from "../src/lib/liste-attente-agences-csv";
import { changerStatutAgence } from "../src/app/actions/liste-attente-agences-admin";
import { GET as exporter } from "../src/app/admin/liste-attente/export/route";
import PageListeAttenteAgences from "../src/app/admin/liste-attente/page";
import { GESTES_LISTE_ATTENTE } from "../src/app/admin/liste-attente/boutons-statut";
import { libelleActionAudit } from "../src/lib/libelles-journaux";
import { STATUTS_LISTE_ATTENTE } from "../src/lib/liste-attente-agences";

const ID = "11111111-1111-4111-8111-111111111111";

const LIGNE: LigneListeAttente = {
  agence: "Agence du Canal",
  contact: "Camille Martin",
  email: "contact@agence-canal.test",
  telephone: "+33 1 23 45 67 89",
  code_postal: "75011",
  nb_lots: "50_a_199",
  message: 'Bonjour ;\nnous gérons "deux" agences.',
  statut: "en_attente",
  contactee_le: null,
  created_at: "2026-10-20T06:05:00Z",
};

type Reponse = { data?: unknown; error?: { message: string } | null };

/** Le plafond de lignes par réponse de l'API (réglage « Max rows » de Supabase). */
const PLAFOND_API = 1000;

/**
 * Un client de session simulé : `rpc` répond à is_super_admin et journaliser_supervision ; `from` rend une requête
 * chaînable dont la lecture (`maybeSingle`), la mise à jour (`update … select`) et la liste entière (export) sont
 * réglées par `options`. Les filtres `.eq()` et les champs mis à jour sont relevés.
 */
function client(options: { estSuperAdmin?: unknown; lecture?: Reponse; miseAJour?: Reponse; journal?: Reponse; lignes?: Reponse } = {}) {
  const miseAJour = vi.fn();
  const filtres: [string, unknown][] = [];
  const exclusions: [string, unknown][] = [];
  const journal: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "is_super_admin") return { data: options.estSuperAdmin ?? true, error: null };
    if (fn === "journaliser_supervision") {
      journal.push(args ?? {});
      return { data: null, error: options.journal?.error ?? null };
    }
    return { data: null, error: { message: `fonction inconnue ${fn}` } };
  });
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.eq = (colonne: string, valeur: unknown) => {
      filtres.push([colonne, valeur]);
      return q;
    };
    q.neq = (colonne: string, valeur: unknown) => {
      exclusions.push([colonne, valeur]);
      return q;
    };
    q.maybeSingle = async () => ({ data: options.lecture?.data ?? null, error: options.lecture?.error ?? null });
    // La liste entière : la page la lit d'un bloc ; l'export page par page (`range`), avec le compte exact.
    let bornes: [number, number] | null = null;
    q.range = (debut: number, fin: number) => {
      bornes = [debut, fin];
      return q;
    };
    q.then = (ok: (r: unknown) => unknown) => {
      const toutes = Array.isArray(options.lignes?.data) ? options.lignes.data.filter((ligne) => !exclusions.some(([colonne, valeur]) => ligne[colonne] === valeur)) : [];
      const data = bornes ? toutes.slice(bornes[0], Math.min(bornes[1] + 1, bornes[0] + PLAFOND_API)) : toutes.slice(0, PLAFOND_API);
      return Promise.resolve({ data, count: toutes.length, error: options.lignes?.error ?? null }).then(ok);
    };
    q.update = (champs: unknown) => {
      miseAJour(champs);
      q.then = (ok: (r: unknown) => unknown) =>
        Promise.resolve({ data: options.miseAJour?.data ?? [{ id: ID }], error: options.miseAJour?.error ?? null }).then(ok);
      return q;
    };
    return q;
  });
  mocks.createClient.mockResolvedValue({ rpc, from });
  return { miseAJour, filtres, exclusions, journal, rpc, from };
}

beforeEach(() => vi.resetAllMocks());

describe("l'onglet de la console", () => {
  it("la rubrique « Développement commercial » porte l'onglet, après « Demandes de contact », et RUBRIQUES reste à 17", () => {
    expect(RUBRIQUES).toHaveLength(17);
    const commercial = RUBRIQUES.find((r) => r.cle === "commercial");
    expect(commercial).toBeDefined();
    const libelles = commercial!.onglets.map((o) => o.libelle);
    // Apostrophe typographique, comme « Réseau d’artisans » dans le même menu et l'inventaire des écrans.
    expect(libelles.indexOf("Liste d’attente des agences")).toBe(libelles.indexOf("Demandes de contact") + 1);
    expect(commercial!.onglets.find((o) => o.libelle === "Liste d’attente des agences")?.href).toBe("/admin/liste-attente");
    expect(rubriqueActive("/admin/liste-attente")?.cle).toBe("commercial");
    expect(ongletActif("/admin/liste-attente")?.href).toBe("/admin/liste-attente");
    expect(ongletActif("/admin/liste-attente/export")?.href).toBe("/admin/liste-attente");
  });
  it("aucune autre rubrique n'a été créée pour l'accueillir", () => {
    expect(RUBRIQUES.filter((r) => r.onglets.some((o) => o.href === "/admin/liste-attente"))).toHaveLength(1);
  });
});

describe("la mise en forme CSV", () => {
  it("commence par la marque d'ordre des octets, puis l'en-tête français séparé par des points-virgules", () => {
    const csv = csvListeAttenteAgences([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      `${BOM_UTF8}Date d'inscription;Agence;Contact;E-mail;Téléphone;Code postal;Lots gérés;Message;Statut;Contactée le\r\n`,
    );
    expect(ENTETE_CSV_LISTE_ATTENTE).toHaveLength(10);
  });
  it("échappe un champ qui contient le séparateur, des guillemets ou un saut de ligne ; un champ nul est vide", () => {
    expect(champCsv('Bonjour ;\nnous gérons "deux" agences.')).toBe('"Bonjour ;\nnous gérons ""deux"" agences."');
    // Le séparateur SEUL suffit : sans guillemet ni saut de ligne, « Bonjour ; bonsoir » casserait les colonnes du tableur.
    expect(champCsv("Bonjour ; bonsoir")).toBe('"Bonjour ; bonsoir"');
    expect(champCsv(";")).toBe('";"');
    expect(champCsv("Agence du Canal")).toBe("Agence du Canal");
    expect(champCsv("ligne\r\nsuivante")).toBe('"ligne\r\nsuivante"');
    expect(champCsv(null)).toBe("");
    expect(champCsv("")).toBe("");
  });
  it("écrit une ligne complète : date à l'heure de Paris, tranche et statut en français, téléphone protégé du tableur", () => {
    const lignes = csvListeAttenteAgences([LIGNE]).split("\r\n");
    // En-tête, la ligne (son saut de ligne interne est entre guillemets), puis la fin de fichier.
    expect(lignes).toHaveLength(3);
    expect(lignes[2]).toBe("");
    // 06:05 UTC le 20/10 : 08:05 à Paris (heure d'été jusqu'au 25/10). « +33… » commence comme une formule : apostrophe en tête (CHF-04).
    expect(lignes[1]).toBe(
      `20/10/2026 08:05;Agence du Canal;Camille Martin;contact@agence-canal.test;'+33 1 23 45 67 89;75011;De 50 à 199 lots;"Bonjour ;\nnous gérons ""deux"" agences.";En attente;`,
    );
  });
  it("un message qui ne contient que le séparateur, sans guillemet ni saut de ligne, reste dans sa colonne", () => {
    const lignes = csvListeAttenteAgences([{ ...LIGNE, telephone: null, message: "Parc : 120 lots ; 2 agences" }]).split("\r\n");
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toBe(
      '20/10/2026 08:05;Agence du Canal;Camille Martin;contact@agence-canal.test;;75011;De 50 à 199 lots;"Parc : 120 lots ; 2 agences";En attente;',
    );
  });
  it("une agence contactée porte sa date de contact ; téléphone et message absents laissent des champs vides", () => {
    const csv = csvListeAttenteAgences([
      { ...LIGNE, telephone: null, message: null, statut: "contactee", contactee_le: "2026-10-21T15:30:00Z", nb_lots: "inconnue" },
    ]);
    expect(csv.split("\r\n")[1]).toBe("20/10/2026 08:05;Agence du Canal;Camille Martin;contact@agence-canal.test;;75011;—;;Contactée;21/10/2026 17:30");
  });
  it("neutralise une saisie qui commence comme une formule de tableur (audit du 13/10, CHF-04)", () => {
    const csv = csvListeAttenteAgences([{ ...LIGNE, agence: '=HYPERLINK("https://exemple.test")', message: "-1+1", telephone: null }]);
    expect(csv).toContain(`;"'=HYPERLINK(""https://exemple.test"")";`);
    expect(csv).toContain(";'-1+1;");
  });
  it("nomme le fichier au jour de Paris", () => {
    // 22:30 UTC le 20/10 : déjà le 21/10 à Paris.
    expect(nomFichierExportListeAttente(new Date("2026-10-20T22:30:00Z"))).toBe("liste-attente-agences-2026-10-21.csv");
    expect(nomFichierExportListeAttente(new Date("2026-10-20T06:05:00Z"))).toBe("liste-attente-agences-2026-10-20.csv");
  });
});

describe("changerStatutAgence", () => {
  it("refuse un statut inconnu sans ouvrir de client ni toucher la base", async () => {
    const c = client();
    expect(await changerStatutAgence(ID, "archivee")).toEqual({ erreur: "Ce statut n’existe pas : rechargez la page." });
    expect((await changerStatutAgence(ID, "constructor")).erreur).toMatch(/n’existe pas/);
    expect((await changerStatutAgence(ID, "")).erreur).toMatch(/n’existe pas/);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(c.from).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("refuse un identifiant qui n'est pas un UUID, sans toucher la base", async () => {
    client();
    expect(await changerStatutAgence("1 or 1=1", "contactee")).toEqual({ erreur: "Inscription introuvable." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("passe en « contactée » : contactee_le est posé, la ligne d'audit écrite, l'écran revalidé", async () => {
    const c = client({ lecture: { data: { id: ID, statut: "en_attente" } } });
    expect(await changerStatutAgence(ID, "contactee")).toEqual({ succes: "Statut noté : Contactée." });
    expect(c.miseAJour).toHaveBeenCalledTimes(1);
    const champs = c.miseAJour.mock.calls[0][0] as { statut: string; contactee_le?: string };
    expect(champs.statut).toBe("contactee");
    expect(champs.contactee_le).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // La mise à jour vise la ligne ET son statut relu : un changement concurrent ne s'écrase pas en silence.
    expect(c.filtres).toContainEqual(["id", ID]);
    expect(c.filtres).toContainEqual(["statut", "en_attente"]);
    expect(c.journal).toEqual([
      { p_action: "liste_attente_statut_modifie", p_organisation: null, p_details: { avant: "en_attente", apres: "contactee" } },
    ]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/liste-attente");
  });
  it("« remettre en attente » ne touche pas contactee_le", async () => {
    const c = client({ lecture: { data: { id: ID, statut: "contactee" } } });
    expect(await changerStatutAgence(ID, "en_attente")).toEqual({ succes: "Statut noté : En attente." });
    expect(c.miseAJour.mock.calls[0][0]).toEqual({ statut: "en_attente" });
  });
  it("introuvable, ou refusé par la RLS : un refus clair, aucune écriture", async () => {
    const c = client({ lecture: { data: null } });
    expect((await changerStatutAgence(ID, "contactee")).erreur).toMatch(/introuvable, ou geste refusé/);
    expect(c.miseAJour).not.toHaveBeenCalled();
    expect(c.journal).toEqual([]);
  });
  it("déjà dans ce statut : rien ne change, et l'écran le dit", async () => {
    const c = client({ lecture: { data: { id: ID, statut: "contactee" } } });
    expect((await changerStatutAgence(ID, "contactee")).erreur).toMatch(/déjà « Contactée » : rien n’a changé/);
    expect(c.miseAJour).not.toHaveBeenCalled();
  });
  it("zéro ligne touchée n'est jamais un succès (audit console du 27/09, majeur 6)", async () => {
    const c = client({ lecture: { data: { id: ID, statut: "en_attente" } }, miseAJour: { data: [] } });
    expect((await changerStatutAgence(ID, "retiree")).erreur).toMatch(/changé entre-temps, ou le geste a été refusé/);
    expect(c.journal).toEqual([]);
  });
  it("une ligne d'audit qui manque se dit à l'écran", async () => {
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    client({ lecture: { data: { id: ID, statut: "en_attente" } }, journal: { error: { message: "panne" } } });
    const r = await changerStatutAgence(ID, "convertie");
    expect(r.succes).toMatch(/^Statut noté : Devenue cliente\./);
    expect(r.succes).toMatch(/journal d’audit n’a pas pu être écrite/);
    silence.mockRestore();
  });
  it("une erreur de la base arrive en français, sans jargon", async () => {
    client({
      lecture: { data: { id: ID, statut: "en_attente" } },
      miseAJour: { error: { message: 'new row violates row-level security policy for table "liste_attente_agences"' } },
    });
    expect((await changerStatutAgence(ID, "contactee")).erreur).toMatch(/Gerimmo n’a pas pu terminer cette action/);
  });
});

describe("GET /admin/liste-attente/export", () => {
  const AVEC_ID = { ...LIGNE, id: ID };
  const RETIREE = { ...LIGNE, id: "44444444-4444-4444-8444-444444444444", agence: "Agence retirée", statut: "retiree" };
  it("refuse sans contenu quiconque n'est pas super-administrateur, sans lire la table ni rien journaliser", async () => {
    const c = client({ estSuperAdmin: false });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export"));
    expect(r.status).toBe(403);
    expect(await r.text()).toBe("");
    expect(c.from).not.toHaveBeenCalled();
    expect(c.journal).toEqual([]);
  });
  it("sert un CSV UTF-8 avec BOM, en pièce jointe datée, sans cache, et trace l'export", async () => {
    const c = client({ lignes: { data: [AVEC_ID] } });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="liste-attente-agences-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(r.headers.get("cache-control")).toBe("no-store");
    // Les octets bruts : `text()` consommerait la marque d'ordre des octets (EF BB BF) sans la montrer.
    const octets = new Uint8Array(await r.arrayBuffer());
    expect(Array.from(octets.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const corps = new TextDecoder().decode(octets);
    expect(corps).toContain("Date d'inscription;Agence;Contact");
    expect(corps).toContain("Agence du Canal");
    expect(c.journal).toEqual([{ p_action: "liste_attente_exportee", p_organisation: null, p_details: { lignes: 1, inclure_retirees: false } }]);
  });
  it.each(["", "?inclure_retirees=0", "?inclure_retirees=true"])("exclut les retirées sans option explicite (%s)", async (query) => {
    const c = client({ lignes: { data: [AVEC_ID, RETIREE] } });
    const r = await exporter(new Request(`https://gerimmo.test/admin/liste-attente/export${query}`));
    const csv = await r.text();
    expect(csv).toContain("Agence du Canal");
    expect(csv).not.toContain("Agence retirée");
    expect(c.exclusions).toEqual([["statut", "retiree"]]);
  });
  it("inclut les retirées seulement sur choix explicite et consigne ce choix", async () => {
    const c = client({ lignes: { data: [AVEC_ID, RETIREE] } });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export?inclure_retirees=1"));
    expect(await r.text()).toContain("Agence retirée");
    expect(c.exclusions).toEqual([]);
    expect(c.journal[0].p_details).toEqual({ lignes: 2, inclure_retirees: true });
  });
  it("sans ligne d'audit, pas de fichier", async () => {
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    client({ lignes: { data: [AVEC_ID] }, journal: { error: { message: "panne" } } });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export"));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("Agence du Canal");
    silence.mockRestore();
  });
  it("une lecture en échec ne produit pas un fichier vide qui aurait l'air complet", async () => {
    const c = client({ lignes: { error: { message: "panne" } } });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export"));
    expect(r.status).toBe(503);
    expect(r.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(c.journal).toEqual([]);
  });
  // Audit du 23/10 (A04) : une seule lecture s'arrêtait au plafond de l'API, sans le dire.
  it("exporte au-delà du plafond de l'API : 1 001 inscriptions, 1 001 lignes", async () => {
    const lignes = Array.from({ length: 1001 }, (_, i) => ({ ...LIGNE, id: `id-${i}`, agence: `Agence ${i}` }));
    const c = client({ lignes: { data: lignes } });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export"));
    expect(r.status).toBe(200);
    const csv = await r.text();
    expect(csv).toContain("Agence 1000");
    expect(c.journal[0].p_details).toEqual({ lignes: 1001, inclure_retirees: false });
  });
  it("une ligne relue d'une page à l'autre (données qui bougent) : pas de fichier", async () => {
    const lignes = Array.from({ length: 1001 }, (_, i) => ({ ...LIGNE, id: i === 1000 ? "id-0" : `id-${i}` }));
    const c = client({ lignes: { data: lignes } });
    const r = await exporter(new Request("https://gerimmo.test/admin/liste-attente/export"));
    expect(r.status).toBe(503);
    expect(c.journal).toEqual([]);
  });
});

describe("la page /admin/liste-attente", () => {
  const ID_2 = "22222222-2222-4222-8222-222222222222";
  const ID_3 = "33333333-3333-4333-8333-333333333333";
  const INSCRIPTION = { id: ID, source: "/agences", ...LIGNE };
  const page = async () => renderToStaticMarkup(await PageListeAttenteAgences());

  it("compte « en attente » comme les gestes le font : un statut que l'écran ignore encore se traite comme une attente", async () => {
    client({
      lignes: { data: [INSCRIPTION, { ...INSCRIPTION, id: ID_2, statut: "statut_futur" }, { ...INSCRIPTION, id: ID_3, statut: "convertie" }] },
    });
    const html = await page();
    expect(html).toContain("2 en attente · 3 inscrites");
    // Le rang au statut inconnu porte bien la puce et le geste de l'attente.
    expect(html.split("Marquer comme contactée")).toHaveLength(3);
  });
  it("le formulaire GET exporte sans inclure les retirées par défaut et laisse les erreurs lisibles", async () => {
    client({ lignes: { data: [INSCRIPTION] } });
    const html = await page();
    expect(html).toContain("1 en attente · 1 inscrite<");
    expect(html).toContain('action="/admin/liste-attente/export" method="get"');
    expect(html).toContain('name="inclure_retirees" value="1"');
    expect(html).toContain("Inclure les retirées");
    expect(html).not.toContain('checked=""');
    expect(html).not.toMatch(/\bdownload\b/);
  });
  it("le titre porte l'apostrophe typographique, comme l'onglet ; à vide, ni compteur ni export", async () => {
    client({ lignes: { data: [] } });
    const html = await page();
    expect(html).toContain("<h1>Liste d’attente des agences</h1>");
    expect(html).toContain("Aucune agence inscrite");
    expect(html).not.toContain("Exporter en CSV");
  });
  it("une lecture en échec montre l'écran de repli, jamais une liste vide déguisée", async () => {
    client({ lignes: { error: { message: "panne" } } });
    const html = await page();
    expect(html).toContain("Impossible de charger la page");
    expect(html).not.toContain("Aucune agence inscrite");
    expect(html).not.toContain("Exporter en CSV");
  });
});

describe("journal et gestes", () => {
  it("les deux codes écrits au journal ont un libellé en français", () => {
    expect(libelleActionAudit("liste_attente_statut_modifie")).toBe("Statut d’une agence de la liste d’attente modifié");
    expect(libelleActionAudit("liste_attente_exportee")).toBe("Export CSV de la liste d’attente des agences");
  });
  it("chaque statut offre des gestes vers d'autres statuts connus, « Marquer comme contactée » en tête depuis l'attente", () => {
    expect(GESTES_LISTE_ATTENTE.en_attente[0]).toEqual({ statut: "contactee", libelle: "Marquer comme contactée" });
    expect(GESTES_LISTE_ATTENTE.contactee[0]).toEqual({ statut: "en_attente", libelle: "Remettre en attente" });
    for (const statut of Object.keys(STATUTS_LISTE_ATTENTE)) {
      const gestes = GESTES_LISTE_ATTENTE[statut as keyof typeof GESTES_LISTE_ATTENTE];
      expect(gestes.length).toBeGreaterThan(0);
      for (const g of gestes) {
        expect(Object.hasOwn(STATUTS_LISTE_ATTENTE, g.statut)).toBe(true);
        expect(g.statut).not.toBe(statut);
      }
    }
  });
});
