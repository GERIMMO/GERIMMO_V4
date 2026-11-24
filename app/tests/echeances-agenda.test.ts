/**
 * Audit palier 1, P2-06 — les échéances du propriétaire dans son agenda.
 *
 * Ce que ce fichier prouve :
 *  1. chaque échéance dit ce qu'elle est, pour qui, où en est-on, et mène au bon écran ;
 *  2. l'état d'un loyer n'est jamais inventé : inconnu, il ne s'affiche pas ;
 *  3. la lecture est bornée au mois et à l'espace ; un échec ou une lecture coupée n'est pas « aucune échéance » ;
 *  4. le calendrier du propriétaire porte les échéances (case du jour, panneau du jour), l'agence garde son écran ;
 *  5. décision Q34 du 24/11/2026 : le calendrier porte aussi la date limite pour demander la révision du loyer (un an
 *     après la date de révision, décision Q23), tant que cette révision n'est pas enregistrée.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compteEcheances, construireEcheances, echeancesParJour } from "@/lib/echeances-agenda";
import { chargerEcheancesAgenda } from "@/lib/echeances-agenda-lecture";

const BASE = "/espace/org";
const JOUR = "2026-11-22";
const qui = { lotNom: "Appartement T2", locataire: "Camille Fictif" };

describe("échéances : ce que dit chaque ligne", () => {
  it("un loyer dit son montant, son état et mène aux loyers du bail", () => {
    const loyer = (jour: string, couvert: number | null) => ({ appelId: `a-${jour}-${couvert}`, bailId: "bail", jour, duCentimes: 80000, couvertCentimes: couvert, ...qui });
    const liste = construireEcheances(BASE, JOUR, {
      loyers: [loyer("2026-11-05", 80000), loyer("2026-11-06", 30000), loyer("2026-11-07", 0), loyer("2026-11-22", 0), loyer("2026-11-28", 0), loyer("2026-11-29", null)],
      edls: [], finsDeBail: [], conges: [],
    });
    expect(liste.map((e) => [e.jour.slice(8), e.etat, e.aFaire])).toEqual([
      ["05", "Reçu", false],
      ["06", "Reçu en partie — reste 500,00 €", true],
      ["07", "Pas encore reçu — échéance passée", true],
      ["22", "À recevoir", true],
      ["28", "À recevoir", false],
      ["29", null, false],
    ]);
    expect(liste[0]).toMatchObject({ nature: "loyer", titre: "Loyer attendu : 800,00 €", detail: "Camille Fictif · Appartement T2", href: "/espace/org/baux/bail#loyers" });
  });

  it("un état des lieux dit son type et s'il est signé ; un congé dit qui l'a donné ; la fin de bail ne dit que la date du contrat", () => {
    const liste = construireEcheances(BASE, JOUR, {
      loyers: [],
      edls: [
        { id: "e1", bailId: "b1", jour: "2026-11-10", type: "entree", signe: true, ...qui },
        { id: "e2", bailId: "b1", jour: "2026-11-12", type: "sortie", signe: false, ...qui },
        { id: "e3", bailId: "b1", jour: "2026-11-30", type: "sortie", signe: false, lotNom: null, locataire: null },
      ],
      finsDeBail: [{ bailId: "b2", jour: "2026-11-30", ...qui }],
      conges: [{ id: "c1", bailId: "b1", jour: "2026-11-30", par: "locataire", ...qui }, { id: "c2", bailId: "b3", jour: "2026-11-30", par: "bailleur", ...qui }],
    });
    expect(liste.map((e) => [e.jour.slice(8), e.titre, e.etat, e.aFaire, e.href])).toEqual([
      ["10", "État des lieux d’entrée", "Signé", false, "/espace/org/baux/b1/edl/e1"],
      ["12", "État des lieux de sortie", "Pas encore signé — date passée", true, "/espace/org/baux/b1/edl/e2"],
      ["30", "État des lieux de sortie", "À établir et signer", false, "/espace/org/baux/b1/edl/e3"],
      ["30", "Départ prévu : congé donné par le locataire", null, false, "/espace/org/baux/b1"],
      ["30", "Départ prévu : congé donné par le bailleur", null, false, "/espace/org/baux/b3"],
      ["30", "Date de fin inscrite au bail", null, false, "/espace/org/baux/b2"],
    ]);
    expect(liste[2].detail).toBe("Locataire non renseigné · Logement du bail");
    // Aucune règle de droit n'est affirmée : ni préavis, ni reconduction, ni renouvellement.
    expect(JSON.stringify(liste)).not.toMatch(/préavis|reconduction|renouvel|article|loi /i);
  });

  it("regroupe par jour et compte au singulier comme au pluriel", () => {
    const liste = construireEcheances(BASE, JOUR, {
      loyers: [{ appelId: "a", bailId: "b", jour: "2026-11-05", duCentimes: 100, couvertCentimes: 0, ...qui }],
      edls: [{ id: "e", bailId: "b", jour: "2026-11-05", type: "entree", signe: false, ...qui }],
      finsDeBail: [], conges: [],
    });
    const parJour = echeancesParJour(liste);
    expect([...parJour.keys()]).toEqual(["2026-11-05"]);
    expect(parJour.get("2026-11-05")!.map((e) => e.nature)).toEqual(["loyer", "edl"]);
    expect([compteEcheances(0), compteEcheances(1), compteEcheances(2)]).toEqual(["0 échéance", "1 échéance", "2 échéances"]);
  });

  it("le module ne dépend d'aucune API serveur", () => {
    expect(readFileSync("src/lib/echeances-agenda.ts", "utf8")).not.toMatch(/^import /m);
  });
});

describe("échéances : la lecture", () => {
  type Appel = { table: string; filtres: [string, string, unknown][] };
  type Reponse = { data?: unknown[]; error?: { message: string } | null };
  // Décision Q34 : « baux » est lue deux fois (fins de bail du mois, baux révisables) : une réponse peut dépendre des filtres.
  function faux(reponses: Record<string, Reponse | ((appel: Appel) => Reponse)>, rpc: (nom: string, args: Record<string, string>) => { data?: unknown[]; error?: { message: string } | null } = () => ({ data: [], error: null })) {
    const appels: Appel[] = [];
    const rpcs: Record<string, string>[] = [];
    const client = {
      from(table: string) {
        const appel: Appel = { table, filtres: [] };
        appels.push(appel);
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "is", "gte", "lt", "order", "limit"])
          q[m] = (...a: unknown[]) => { appel.filtres.push([m, String(a[0]), a[1]]); return q; };
        q.then = (ok: (v: unknown) => unknown) => {
          const prevue = reponses[table];
          const reponse = typeof prevue === "function" ? prevue(appel) : prevue;
          return Promise.resolve({ data: reponse?.data ?? [], error: reponse?.error ?? null }).then(ok);
        };
        return q;
      },
      rpc(nom: string, args: Record<string, string>) { rpcs.push(args); return Promise.resolve(rpc(nom, args)); },
    };
    return { client: client as never, appels, rpcs };
  }
  const MOIS = { premier: "2026-11-01", suivant: "2026-12-01" };
  const bail = (etat = "actif") => ({ id: "bail", etat, locataire: { nom: "Fictif", prenom: "Camille" }, lot: [{ id: "lot", nom: "Appartement T2" }] });

  it("borne chaque lecture à l'espace et au mois, et rassemble les quatre natures", async () => {
    const f = faux({
      appels_loyer: { data: [{ id: "a1", bail_id: "bail", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: "800.00", bail: bail() }] },
      etats_des_lieux: { data: [{ id: "e1", bail_id: "bail", type: "sortie", etat: "brouillon", date_edl: "2026-11-28", bail: bail("preavis") }] },
      baux: { data: [{ ...bail(), date_fin: "2026-11-30" }] },
      conges: { data: [{ id: "c1", bail_id: "bail", par: "locataire", date_effet: "2026-11-28", bail: bail("preavis") }] },
    }, () => ({ data: [{ appel_id: "a1", montant_couvert: "800.00" }], error: null }));
    const r = await chargerEcheancesAgenda(f.client, "org", MOIS, BASE, JOUR);
    expect(r.erreur).toBe(false);
    expect(r.liste.map((e) => [e.nature, e.jour, e.etat])).toEqual([
      ["loyer", "2026-11-05", "Reçu"], ["edl", "2026-11-28", "À établir et signer"], ["conge", "2026-11-28", null], ["fin_bail", "2026-11-30", null],
    ]);
    expect(r.liste[0].detail).toBe("Camille Fictif · Appartement T2");
    // Décision Q34 du 24/11/2026 : une cinquième lecture, celle des baux en cours qui prévoient la révision. Elle n'est pas
    // bornée au mois (la date limite se calcule à partir de l'entrée du bail) ; elle l'est à l'espace et plafonnée.
    expect(f.appels.map((a) => a.table).sort()).toEqual(["appels_loyer", "baux", "baux", "conges", "etats_des_lieux"]);
    const revisables = f.appels.find((a) => a.table === "baux" && a.filtres.some(([m, c]) => m === "eq" && c === "revision_irl"))!;
    expect(revisables.filtres).toContainEqual(["eq", "organization_id", "org"]);
    expect(revisables.filtres).toContainEqual(["eq", "etat", "actif"]);
    expect(revisables.filtres).toContainEqual(["eq", "revision_irl", true]);
    expect(revisables.filtres.some(([m]) => m === "limit")).toBe(true);
    for (const a of f.appels.filter((x) => x !== revisables)) {
      expect(a.filtres, a.table).toContainEqual(["eq", "organization_id", "org"]);
      const colonne = { appels_loyer: "date_echeance", etats_des_lieux: "date_edl", baux: "date_fin", conges: "date_effet" }[a.table]!;
      expect(a.filtres, a.table).toContainEqual(["gte", colonne, "2026-11-01"]);
      expect(a.filtres, a.table).toContainEqual(["lt", colonne, "2026-12-01"]);
      expect(a.filtres.some(([m]) => m === "limit"), a.table).toBe(true);
    }
    expect(f.appels.find((a) => a.table === "baux")!.filtres).toContainEqual(["in", "etat", ["actif", "preavis"]]);
    expect(f.appels.find((a) => a.table === "conges")!.filtres).toContainEqual(["is", "annule_le", null]);
    expect(f.rpcs).toEqual([{ p_org: "org", p_mois: "2026-11-01" }]);
  });

  it("un loyer échu ce mois-ci mais appelé pour un autre mois lit l'état de SON mois", async () => {
    const f = faux({ appels_loyer: { data: [
      { id: "a1", bail_id: "bail", periode: "2026-10-01", date_echeance: "2026-11-02", montant_du: 800, bail: bail() },
      { id: "a2", bail_id: "bail", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 800, bail: bail() },
    ] } }, (_n, args) => ({ data: args.p_mois === "2026-10-01" ? [{ appel_id: "a1", montant_couvert: 800 }] : [{ appel_id: "a2", montant_couvert: 0 }], error: null }));
    const r = await chargerEcheancesAgenda(f.client, "org", MOIS, BASE, JOUR);
    expect(f.rpcs.map((a) => a.p_mois).sort()).toEqual(["2026-10-01", "2026-11-01"]);
    expect(r.liste.map((e) => e.etat)).toEqual(["Reçu", "Pas encore reçu — échéance passée"]);
  });

  it("l'état des règlements illisible, ou absent pour un loyer : le loyer s'affiche sans état, jamais « reçu »", async () => {
    const donnees = { appels_loyer: { data: [{ id: "a1", bail_id: "bail", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 800, bail: bail() }] } };
    const panne = await chargerEcheancesAgenda(faux(donnees, () => ({ data: undefined, error: { message: "panne" } })).client, "org", MOIS, BASE, JOUR);
    expect(panne).toMatchObject({ erreur: false });
    expect(panne.liste.map((e) => [e.titre, e.etat, e.aFaire])).toEqual([["Loyer attendu : 800,00 €", null, false]]);
    const absent = await chargerEcheancesAgenda(faux(donnees).client, "org", MOIS, BASE, JOUR);
    expect(absent.liste[0].etat).toBeNull();
  });

  it("une lecture en échec ou coupée n'est pas « aucune échéance »", async () => {
    for (const table of ["appels_loyer", "etats_des_lieux", "baux", "conges"]) {
      const r = await chargerEcheancesAgenda(faux({ [table]: { error: { message: "panne" } } }).client, "org", MOIS, BASE, JOUR);
      expect(r, table).toEqual({ liste: [], erreur: true });
    }
    const plein = Array.from({ length: 500 }, (_, i) => ({ id: `e${i}`, bail_id: "bail", type: "entree", etat: "signe", date_edl: "2026-11-10", bail: bail() }));
    expect(await chargerEcheancesAgenda(faux({ etats_des_lieux: { data: plein } }).client, "org", MOIS, BASE, JOUR)).toEqual({ liste: [], erreur: true });
  });

  it("un congé sur un bail terminé ou un loyer de bail en brouillon ne s'affichent pas", async () => {
    const f = faux({
      appels_loyer: { data: [{ id: "a1", bail_id: "bail", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 800, bail: bail("brouillon") }] },
      conges: { data: [{ id: "c1", bail_id: "bail", par: "locataire", date_effet: "2026-11-28", bail: bail("termine") }] },
    });
    expect((await chargerEcheancesAgenda(f.client, "org", MOIS, BASE, JOUR)).liste).toEqual([]);
    expect(f.rpcs).toEqual([]);
  });

  // Décision Q34 du 24/11/2026 : « ajoute au calendrier la date limite de révision du loyer ».
  describe("date limite de révision du loyer (décision Q34 du 24/11)", () => {
    const estRevisables = (a: Appel) => a.filtres.some(([m, c]) => m === "eq" && c === "revision_irl");
    // Bail entré le 15/11/2024 : révision prévue le 15/11/2025, date limite le 14/11/2026 (dans le mois affiché).
    const revisable = (champs: Record<string, unknown> = {}) => ({ ...bail(), lot_id: "lot", date_debut: "2024-11-15", ...champs });
    const lire = (tables: Record<string, Reponse>, baux: unknown[] = [revisable()]) => {
      const f = faux({ ...tables, baux: (a) => (estRevisables(a) ? { data: baux } : { data: [] }) });
      return chargerEcheancesAgenda(f.client, "org", MOIS, BASE, JOUR).then((r) => ({ r, f }));
    };

    it("s'affiche le jour de la date limite, avec la date de révision qu'elle clôt, et mène au formulaire de révision", async () => {
      const { r, f } = await lire({});
      expect(r).toEqual({ erreur: false, liste: [{
        cle: "limite-revision-bail-2026-11-14", jour: "2026-11-14", nature: "limite_revision",
        titre: "Date limite pour demander la révision du loyer",
        detail: "Camille Fictif · Appartement T2",
        etat: "Révision prévue le 15/11/2025 : non demandée, délai passé",
        aFaire: false,
        href: "/espace/org/baux/bail#revision-loyer",
      }] });
      // Les révisions et les DPE ne sont relus que pour les baux concernés, dans l'espace.
      expect(f.appels.find((a) => a.table === "revisions_loyer")!.filtres).toEqual(expect.arrayContaining([["eq", "organization_id", "org"], ["in", "bail_id", ["bail"]]]));
      expect(f.appels.find((a) => a.table === "diagnostics")!.filtres).toEqual(expect.arrayContaining([["eq", "organization_id", "org"], ["eq", "type", "dpe"], ["is", "archived_at", null], ["in", "lot_id", ["lot"]]]));
    });

    it("avant la date limite : « pas encore demandée » ; le dernier jour du mois et le premier comptent, pas le mois voisin", async () => {
      const aVenir = await lire({}, [revisable({ date_debut: "2024-12-01" })]);
      expect(aVenir.r.liste.map((e) => [e.jour, e.etat])).toEqual([["2026-11-30", "Révision prévue le 01/12/2025 : pas encore demandée"]]);
      expect((await lire({}, [revisable({ date_debut: "2024-11-02" })])).r.liste.map((e) => e.jour)).toEqual(["2026-11-01"]);
      // Date limite le 31/10 ou le 01/12 : hors du mois affiché, et rien d'autre n'est lu.
      for (const debut of ["2024-11-01", "2024-12-02"]) {
        const hors = await lire({}, [revisable({ date_debut: debut })]);
        expect(hors.r.liste, debut).toEqual([]);
        expect(hors.f.appels.map((a) => a.table), debut).not.toContain("revisions_loyer");
      }
    });

    it("aucune date limite avant la première date de révision, ni sans date d'entrée", async () => {
      // Entré le 15/11/2025 : le 14/11/2026 est la veille de la PREMIÈRE date de révision, pas une date limite.
      expect((await lire({}, [revisable({ date_debut: "2025-11-15" })])).r.liste).toEqual([]);
      expect((await lire({}, [revisable({ date_debut: null })])).r.liste).toEqual([]);
    });

    it("ne s'affiche pas si la révision de cette année-là est enregistrée ; celle d'une autre année ne compte pas", async () => {
      const dansLeDelai = await lire({ revisions_loyer: { data: [{ id: "r", bail_id: "bail", date_effet: "2026-03-02" }] } });
      expect(dansLeDelai.r.liste).toEqual([]);
      for (const effet of ["2025-11-14", "2026-11-15"]) {
        const autre = await lire({ revisions_loyer: { data: [{ id: "r", bail_id: "bail", date_effet: effet }] } });
        expect(autre.r.liste.map((e) => e.nature), effet).toEqual(["limite_revision"]);
      }
      const autreBail = await lire({ revisions_loyer: { data: [{ id: "r", bail_id: "autre", date_effet: "2026-03-02" }] } });
      expect(autreBail.r.liste).toHaveLength(1);
    });

    it("ne s'affiche pas quand la base refuserait la révision : dernier DPE du logement classé F ou G", async () => {
      const dpe = (classe: string, le: string, lot = "lot") => ({ id: `d-${le}`, lot_id: lot, classe_dpe: classe, date_realisation: le });
      expect((await lire({ diagnostics: { data: [dpe("G", "2024-05-01")] } })).r.liste).toEqual([]);
      expect((await lire({ diagnostics: { data: [dpe("F", "2020-05-01"), dpe("D", "2025-05-01")] } })).r.liste).toHaveLength(1);
      expect((await lire({ diagnostics: { data: [dpe("F", "2025-05-01", "autre-lot")] } })).r.liste).toHaveLength(1);
    });

    it("révisions ou DPE illisibles : l'écran dit que les échéances n'ont pas pu être lues, jamais une date supposée", async () => {
      for (const table of ["revisions_loyer", "diagnostics"]) {
        expect((await lire({ [table]: { error: { message: "panne" } } })).r, table).toEqual({ liste: [], erreur: true });
      }
      const panneBaux = faux({ baux: (a) => (estRevisables(a) ? { error: { message: "panne" } } : { data: [] }) });
      expect(await chargerEcheancesAgenda(panneBaux.client, "org", MOIS, BASE, JOUR)).toEqual({ liste: [], erreur: true });
    });
  });
});

describe("échéances : le calendrier du propriétaire", () => {
  const rendre = async (echeances: { liste: ReturnType<typeof construireEcheances>; erreur: boolean } | null, jour = "2026-11-22") => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { moisAgenda, semaineAgenda } = await import("@/lib/agenda-gestion");
    const { AgendaProprietaire } = await import("@/app/agence/[orgId]/agenda/agenda-proprietaire");
    const maintenant = new Date("2026-11-22T10:00:00Z");
    const agenda = { lignes: [], total: 0, semaine: semaineAgenda(undefined, maintenant), mois: moisAgenda("2026-11", maintenant), jour, vue: "mois" as const, page: 1, erreur: false };
    return renderToStaticMarkup(createElement(AgendaProprietaire, { agenda, comptesVues: { "a-planifier": 0, "a-verifier": 0 }, base: BASE, aujourdhui: JOUR, echeances }));
  };
  const liste = construireEcheances(BASE, JOUR, {
    loyers: [{ appelId: "a1", bailId: "bail", jour: JOUR, duCentimes: 80000, couvertCentimes: 0, ...qui }],
    edls: [{ id: "e1", bailId: "bail", jour: JOUR, type: "entree", signe: false, ...qui }],
    finsDeBail: [{ bailId: "b2", jour: "2026-11-30", lotNom: "Studio", locataire: "Zoé Lambert" }],
    conges: [],
  });

  it("compte les échéances du mois, marque les jours concernés et détaille celles du jour ouvert", async () => {
    const html = await rendre({ liste, erreur: false });
    // Décision Q34 du 24/11/2026 : l'en-tête nomme aussi les dates limites de révision du loyer.
    expect(html).toContain("Vos rendez-vous d’intervention et vos échéances : loyers, états des lieux, fins de bail, dates limites de révision du loyer.");
    expect(html).toMatch(/<p data-compte-mois="true">0 rendez-vous ce mois-ci · 3 échéances<\/p>/);
    expect(html).toContain('aria-label="dimanche 22 novembre 2026, aujourd’hui, 0 rendez-vous, 2 échéances"');
    expect(html).toContain('aria-label="lundi 30 novembre 2026, 0 rendez-vous, 1 échéance"');
    expect(html).toContain('aria-label="lundi 23 novembre 2026, 0 rendez-vous"');
    expect(html.match(/data-echeances-jour="/g)).toHaveLength(2);
    const panneau = html.slice(html.indexOf("data-echeances-du-jour"), html.indexOf("Aucun rendez-vous d’intervention ce jour."));
    expect(panneau).toContain("<h3>Échéances du jour</h3>");
    expect(panneau.match(/<a [^>]*data-echeance="(loyer|edl)"/g)).toHaveLength(2);
    expect(panneau).toMatch(/<a [^>]*data-echeance="loyer" data-a-faire="true" href="\/espace\/org\/baux\/bail#loyers">/);
    expect(panneau).toContain("Loyer attendu : 800,00 €");
    expect(panneau).toMatch(/data-etat-echeance="true">À recevoir</);
    expect(panneau).toContain("Camille Fictif · Appartement T2");
    expect(panneau).not.toContain("Date de fin inscrite au bail");
    expect(html).toContain("Aucun rendez-vous d’intervention ce jour.");
    expect(html).toContain("Échéance</span>");
    expect(html).toContain("Les échéances viennent de vos baux");
    expect(html).not.toContain("data-echeances-illisibles");
  });

  it("un jour sans échéance garde l'état vide d'origine ; le jour d'une fin de bail la détaille", async () => {
    const vide = await rendre({ liste, erreur: false }, "2026-11-23");
    expect(vide).toContain("Aucun rendez-vous ce jour");
    expect(vide).not.toContain("data-echeances-du-jour");
    const fin = await rendre({ liste, erreur: false }, "2026-11-30");
    expect(fin).toMatch(/<a [^>]*data-echeance="fin_bail" data-a-faire="false" href="\/espace\/org\/baux\/b2">/);
    expect(fin).toContain("Zoé Lambert · Studio");
  });

  it("des échéances illisibles sont dites, sans compte ni fausse absence ; hors calendrier, l'écran d'origine est intact", async () => {
    const panne = await rendre({ liste: [], erreur: true });
    expect(panne).toContain("data-echeances-illisibles");
    expect(panne).toMatch(/<p data-compte-mois="true">0 rendez-vous ce mois-ci<\/p>/);
    expect(panne).not.toContain("data-echeances-jour=");
    const sans = await rendre(null);
    expect(sans).toContain("Vos interventions, leurs dates et les rendez-vous à venir.");
    expect(sans).not.toMatch(/Échéance<\/span>|échéance/);
  });

  it("la date limite de révision se lit dans le panneau du jour, sans être « à faire » (décision Q34 du 24/11)", async () => {
    const avecLimite = construireEcheances(BASE, JOUR, {
      loyers: [], edls: [], finsDeBail: [], conges: [],
      limitesRevision: [{ bailId: "bail", jour: "2026-11-30", revisionPrevueLe: "2025-12-01", ...qui }],
    });
    const html = await rendre({ liste: avecLimite, erreur: false }, "2026-11-30");
    expect(html).toMatch(/<a [^>]*data-echeance="limite_revision" data-a-faire="false" href="\/espace\/org\/baux\/bail#revision-loyer">/);
    expect(html).toContain("Date limite pour demander la révision du loyer");
    expect(html).toMatch(/data-etat-echeance="true">Révision prévue le 01\/12\/2025 : pas encore demandée</);
    // Aucun article de loi n'est cité dans le calendrier.
    expect(JSON.stringify(avecLimite)).not.toMatch(/article|loi /i);
  });

  it("seul le propriétaire bailleur reçoit les échéances, et seulement dans la vue du mois", () => {
    const page = readFileSync("src/app/agence/[orgId]/agenda/page.tsx", "utf8");
    const bloc = page.slice(page.indexOf('if (role === "proprietaire_direct") {'), page.indexOf("return <main"));
    expect(bloc).toContain('agenda.vue === "mois" && !agenda.erreur');
    expect(bloc).toContain("await chargerEcheancesAgenda(supabase, orgId, agenda.mois, base, aujourdhui)");
    expect(page.match(/chargerEcheancesAgenda\(/g)).toHaveLength(1);
    // La lecture ne fait qu'interroger : aucune écriture, aucune action serveur.
    const lecture = readFileSync("src/lib/echeances-agenda-lecture.ts", "utf8");
    expect(lecture).not.toMatch(/\.(insert|update|delete|upsert)\(|use server/);
  });
});
