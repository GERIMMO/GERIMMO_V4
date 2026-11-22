/**
 * ARTISAN : ABSENCES ET SEMAINE TYPE — audit palier 1 du 22/11/2026, P2-03. Sans base.
 *
 * Ces tests tiennent :
 *  1. les calculs : la semaine type lue du formulaire, le jour de la semaine sans dépendre du fuseau, les prochains
 *     créneaux (jours non travaillés et absences sautés, bornes comprises ; jamais un créneau inventé pour atteindre
 *     trois) ;
 *  2. les actions : aucune n'accepte d'artisan en paramètre ; dates illisibles refusées avant la base ; le message de
 *     la base (chevauchement, etc.) est rendu tel quel ;
 *  3. l'écran du gestionnaire : un artisan absent garde sa ligne, perd le bouton « Demander un devis », et la date de
 *     son retour est écrite ; les autres artisans ne changent pas ;
 *  4. les écrans de l'artisan : le formulaire des créneaux propose le préremplissage, ou renvoie au réglage ; la page
 *     « Mon entreprise » porte l'onglet des disponibilités.
 * La base est tenue par tests/artisan-absences-semaine-type-base.test.ts, les parcours par
 * e2e/artisan-absences-semaine-type.spec.ts.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  fiche: { artisan_id: "artisan-test" } as null | Record<string, unknown>,
  appels: [] as [string, Record<string, unknown>][],
  erreur: null as null | string,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/artisan/acces", () => ({
  verifierArtisanAction: async () => ({
    fiche: banc.fiche,
    supabase: { rpc: async (nom: string, args: Record<string, unknown>) => { banc.appels.push([nom, args]); return { data: null, error: banc.erreur ? { message: banc.erreur } : null }; } },
  }),
}));
vi.mock("@/app/artisan/devis/actions-preparation", () => ({ envoyerDevisValide: vi.fn() }));
vi.mock("@/app/actions/incidents", () => ({
  annulerMission: vi.fn(), deciderAvenant: vi.fn(), evaluerArtisan: vi.fn(), fixerRendezVous: vi.fn(),
  ouvrirConsultation: vi.fn(), refuserDevis: vi.fn(), demanderRevisionDevis: vi.fn(), retenirDevis: vi.fn(), reviserImputation: vi.fn(), solliciterArtisan: vi.fn(),
}));

import { declarerMonAbsence, enregistrerMaSemaineType, retirerMonAbsence } from "@/app/actions/artisan";
import { ConsultationOuverte } from "@/app/agence/[orgId]/incidents/volet-artisan";
import { JOURS_SEMAINE, jourDeLaSemaine, libelleAbsence, lireSemaineType, prochainsCreneaux, type PlageJour } from "@/lib/semaine-type-artisan";

const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const SEMAINE: PlageJour[] = [1, 2, 3, 4, 5].map((jour) => ({ jour, debut: "08:00", fin: "18:00" }));

describe("les calculs", () => {
  it("sept jours, du lundi (1) au dimanche (7), quel que soit le fuseau", () => {
    expect(JOURS_SEMAINE).toHaveLength(7);
    // Le 23/11/2026 est un lundi ; le 29/11/2026 un dimanche ; le 29/02/2028 un mardi (année bissextile).
    expect(["2026-11-23", "2026-11-24", "2026-11-28", "2026-11-29", "2028-02-29"].map(jourDeLaSemaine)).toEqual([1, 2, 6, 7, 2]);
  });

  it("semaine type lue du formulaire : seuls les jours cochés comptent ; heures manquantes ou inversées refusées en français", () => {
    expect(lireSemaineType(formulaire({ jour_1: "on", debut_1: "08:00", fin_1: "12:00", debut_2: "09:00", fin_2: "17:00", jour_6: "on", debut_6: "09:30", fin_6: "12:30" })))
      .toEqual({ jours: [{ jour: 1, debut: "08:00", fin: "12:00" }, { jour: 6, debut: "09:30", fin: "12:30" }] });
    expect(lireSemaineType(formulaire({}))).toEqual({ jours: [] });
    expect(lireSemaineType(formulaire({ jour_2: "on", debut_2: "08:00" }))).toEqual({ erreur: "Indiquez l’heure de début et l’heure de fin du mardi." });
    expect(lireSemaineType(formulaire({ jour_7: "on", debut_7: "8h", fin_7: "12:00" }))).toEqual({ erreur: "Indiquez l’heure de début et l’heure de fin du dimanche." });
    expect(lireSemaineType(formulaire({ jour_3: "on", debut_3: "14:00", fin_3: "14:00" }))).toEqual({ erreur: "Le mercredi, l’heure de fin doit suivre l’heure de début." });
    expect(lireSemaineType(formulaire({ jour_3: "on", debut_3: "25:00", fin_3: "26:00" }))).toHaveProperty("erreur");
  });

  it("prochains créneaux : un par jour travaillé, deux heures à partir du début de la plage, week-end sauté", () => {
    // Départ un vendredi 27/11/2026 : vendredi, puis lundi et mardi.
    expect(prochainsCreneaux({ semaine: SEMAINE, absences: [], aPartirDe: "2026-11-27" })).toEqual([
      { jour: "2026-11-27", debut: "08:00", fin: "10:00" }, { jour: "2026-11-30", debut: "08:00", fin: "10:00" }, { jour: "2026-12-01", debut: "08:00", fin: "10:00" },
    ]);
    // Le créneau ne déborde jamais de la plage du jour.
    expect(prochainsCreneaux({ semaine: [{ jour: 6, debut: "11:00", fin: "12:00" }], absences: [], aPartirDe: "2026-11-23", nombre: 1 })).toEqual([{ jour: "2026-11-28", debut: "11:00", fin: "12:00" }]);
    expect(prochainsCreneaux({ semaine: [{ jour: 1, debut: "22:30", fin: "23:45" }], absences: [], aPartirDe: "2026-11-23", nombre: 1 })).toEqual([{ jour: "2026-11-23", debut: "22:30", fin: "23:45" }]);
  });

  it("les absences sont sautées, bornes comprises ; passage de mois et d'année sans erreur", () => {
    const absences = [{ du: "2026-12-24", au: "2027-01-03" }];
    expect(prochainsCreneaux({ semaine: SEMAINE, absences, aPartirDe: "2026-12-22" }).map((c) => c.jour)).toEqual(["2026-12-22", "2026-12-23", "2027-01-04"]);
    // Le premier et le dernier jour d'absence sont bien des jours d'absence.
    expect(prochainsCreneaux({ semaine: SEMAINE, absences: [{ du: "2026-11-23", au: "2026-11-23" }], aPartirDe: "2026-11-23", nombre: 1 })[0].jour).toBe("2026-11-24");
  });

  it("rien n'est inventé : sans semaine type, sans jour libre dans les deux mois, ou sur une date illisible, la liste est courte ou vide", () => {
    expect(prochainsCreneaux({ semaine: [], absences: [], aPartirDe: "2026-11-23" })).toEqual([]);
    expect(prochainsCreneaux({ semaine: SEMAINE, absences: [{ du: "2026-11-01", au: "2027-06-30" }], aPartirDe: "2026-11-23" })).toEqual([]);
    expect(prochainsCreneaux({ semaine: SEMAINE, absences: [{ du: "2026-11-25", au: "2027-06-30" }], aPartirDe: "2026-11-23" }).map((c) => c.jour)).toEqual(["2026-11-23", "2026-11-24"]);
    expect(prochainsCreneaux({ semaine: SEMAINE, absences: [], aPartirDe: "demain" })).toEqual([]);
    // Une plage illisible ou inversée, venue d'ailleurs, est ignorée plutôt que proposée.
    expect(prochainsCreneaux({ semaine: [{ jour: 1, debut: "18:00", fin: "08:00" }, { jour: 2, debut: "x", fin: "y" }], absences: [], aPartirDe: "2026-11-23" })).toEqual([]);
  });

  it("libellé d'une absence", () => {
    expect(libelleAbsence({ du: "2026-12-24", au: "2027-01-03" })).toBe("du 24/12/2026 au 03/01/2027");
    expect(libelleAbsence({ du: "2026-12-24", au: "2026-12-24" })).toBe("le 24/12/2026");
  });
});

describe("les actions de l'artisan", () => {
  beforeEach(() => { banc.fiche = { artisan_id: "artisan-test" }; banc.appels = []; banc.erreur = null; });

  it("déclarer une absence : les deux dates partent à la base, qui décide ; un seul jour si la fin est laissée vide", async () => {
    expect((await declarerMonAbsence({}, formulaire({ du: "2026-12-24", au: "2027-01-03" }))).succes).toMatch(/^Absence enregistrée du 24\/12\/2026 au 03\/01\/2027\. Aucune nouvelle demande ne vous sera envoyée pendant cette période ; vos demandes et interventions en cours ne changent pas\.$/);
    expect((await declarerMonAbsence({}, formulaire({ du: "2026-12-24", au: "" }))).succes).toMatch(/^Absence enregistrée le 24\/12\/2026\./);
    expect(banc.appels).toEqual([
      ["declarer_mon_absence", { p_du: "2026-12-24", p_au: "2027-01-03" }],
      ["declarer_mon_absence", { p_du: "2026-12-24", p_au: "2026-12-24" }],
    ]);
  });

  it("dates illisibles : refus avant la base ; refus de la base : sa phrase est rendue", async () => {
    for (const champs of [{}, { du: "24/12/2026", au: "2027-01-03" }, { du: "2026-12-24", au: "bientôt" }, { du: "", au: "2027-01-03" }]) {
      expect(await declarerMonAbsence({}, formulaire(champs as Record<string, string>))).toEqual({ erreur: "Indiquez le premier et le dernier jour de votre absence." });
    }
    expect(banc.appels).toEqual([]);
    banc.erreur = "Cette période chevauche une absence déjà déclarée, du 20/12/2026 au 26/12/2026 : retirez-la d'abord";
    expect(await declarerMonAbsence({}, formulaire({ du: "2026-12-24", au: "2027-01-03" }))).toEqual({ erreur: banc.erreur });
  });

  it("retirer une absence, enregistrer ou effacer la semaine type", async () => {
    expect(await retirerMonAbsence("pas-un-identifiant", {}, new FormData())).toEqual({ erreur: "Absence introuvable." });
    expect(await retirerMonAbsence("11111111-1111-4111-8111-111111111111", {}, new FormData())).toEqual({ succes: "Absence retirée." });
    expect(await enregistrerMaSemaineType({}, formulaire({ jour_1: "on", debut_1: "08:00", fin_1: "12:00" }))).toEqual({ succes: "Semaine type enregistrée. Elle vous sert à préremplir vos créneaux ; elle ne réserve rien." });
    expect(await enregistrerMaSemaineType({}, formulaire({}))).toEqual({ succes: "Semaine type effacée." });
    expect(await enregistrerMaSemaineType({}, formulaire({ jour_1: "on", debut_1: "12:00", fin_1: "08:00" }))).toEqual({ erreur: "Le lundi, l’heure de fin doit suivre l’heure de début." });
    expect(banc.appels).toEqual([
      ["retirer_mon_absence", { p_absence: "11111111-1111-4111-8111-111111111111" }],
      ["enregistrer_ma_semaine_type", { p_jours: [{ jour: 1, debut: "08:00", fin: "12:00" }] }],
      ["enregistrer_ma_semaine_type", { p_jours: [] }],
    ]);
  });

  it("sans fiche d'artisan, rien ne part ; aucune de ces actions ne nomme un artisan (la base prend celui du compte)", async () => {
    banc.fiche = null;
    for (const r of [await declarerMonAbsence({}, formulaire({ du: "2026-12-24", au: "2026-12-26" })), await retirerMonAbsence("11111111-1111-4111-8111-111111111111", {}, new FormData()), await enregistrerMaSemaineType({}, formulaire({}))]) {
      expect(r.erreur).toBeTruthy();
      expect(r.succes).toBeUndefined();
    }
    expect(banc.appels).toEqual([]);
    const source = readFileSync("src/app/actions/artisan.ts", "utf8");
    const bloc = source.slice(source.indexOf("// 1 bis. Absences et semaine type"), source.indexOf("// 2. Attestations"));
    expect(bloc).not.toMatch(/p_artisan|artisan_id/);
  });
});

describe("l'écran du gestionnaire : artisan proposable mais absent", () => {
  const consultation = { id: "c1", metier: "plomberie", nature_travaux: "entretien_courant", decennale_requise: false, devis_unique_assume: false, validite_jusqu_au: null, validite_jours: 30, statut: "ouverte", created_at: "2026-11-20T08:00:00.000Z" };
  const artisan = (id: string, nom: string) => ({ artisan_id: id, raison_sociale: nom, telephone: "0611111111", email: null, rattache: true, note_publiee: null, nb_evaluations: 0, publiable: false, decennale_valide: true });
  const rendre = (absents?: Map<string, string>) => renderToStaticMarkup(createElement(ConsultationOuverte, {
    orgId: "o1", consultation: consultation as never, sollicitations: [], devis: [], affectables: [artisan("a1", "Plomberie Martin"), artisan("a2", "Plomberie Durand")] as never,
    noteDe: new Map(), nom: () => "", aujourdhui: "2026-11-22", commune: "Lyon", ...(absents ? { absentsJusquAu: absents } : {}),
  }));

  it("l'artisan absent garde sa ligne, perd le bouton, et la date de son retour est écrite ; l'autre ne change pas", () => {
    const html = rendre(new Map([["a1", "2026-12-04"]]));
    const texte = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(texte).toContain("Plomberie Martin");
    expect(texte).toContain("Absent jusqu’au 04/12/2026 — aucune demande ne peut lui être envoyée d’ici là");
    expect(html.match(/data-artisan-absent/g)).toHaveLength(1);
    expect(texte.match(/Demander un devis/g)).toHaveLength(1);
    expect(texte).toContain("Demander un devis à Plomberie Durand");
    expect(texte).not.toContain("Demander un devis à Plomberie Martin");
  });

  it("personne d'absent, ou lecture des absences indisponible : la liste est celle d'avant", () => {
    for (const html of [rendre(), rendre(new Map())]) {
      expect(html).not.toContain("data-artisan-absent");
      expect(html.replace(/<[^>]+>/g, " ").match(/Demander un devis/g)).toHaveLength(2);
    }
    expect(rendre()).toBe(rendre(new Map()));
  });
});

describe("les écrans de l'artisan", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");

  it("formulaire des créneaux : préremplissage proposé, jamais envoyé seul ; sans semaine type, renvoi au réglage", () => {
    const ecran = lire("src/app/artisan/missions/[interventionId]/creneaux/formulaire-creneaux.tsx");
    expect(ecran).toContain('<button type="button" className={CLASSE_BOUTON_SOBRE} onClick={preremplir}>Préremplir avec ma semaine type</button>');
    expect(ecran).toContain("prochainsCreneaux({ semaine: semaineType ?? [], absences, aPartirDe: minimum })");
    expect(ecran).toContain('<Link href="/artisan/entreprise#entreprise-disponibilites"');
    expect(ecran).toContain("Relisez-les : ils ne tiennent pas compte de vos autres rendez-vous.");
    // Le préremplissage ne soumet rien : seul le bouton d'envoi du formulaire le fait.
    expect(ecran.match(/type="submit"/g)).toHaveLength(1);
    const page = lire("src/app/artisan/missions/[interventionId]/creneaux/page.tsx");
    expect(page).toContain('supabase.rpc("ma_semaine_type"), supabase.rpc("mes_absences_artisan")');
    expect(page).toContain("semaineType={semaineType} absences={absences}");
  });

  it("« Mon entreprise » : onglet « Disponibilités », lu sous les droits de l'artisan ; chaque formulaire confirme sa saisie", () => {
    const page = lire("src/app/artisan/entreprise/page.tsx");
    expect(page).toContain('{ id: "entreprise-disponibilites", titre: "Disponibilités", contenu: <>');
    expect(page).toContain('supabase.rpc("mes_absences_artisan"), supabase.rpc("ma_semaine_type")');
    const ecran = lire("src/app/artisan/entreprise/disponibilites-artisan.tsx");
    expect(ecran.startsWith('"use client";')).toBe(true);
    const formulaires = ecran.match(/<form\b[^>]*>/g) ?? [];
    expect(formulaires).toHaveLength(3);
    for (const f of formulaires) expect(f).toContain("data-saisie-confirmee");
    expect(ecran).toContain("Pendant une absence, aucun client ne peut vous envoyer de nouvelle demande");
    expect(ecran).toContain("Elle ne réserve rien : vous relisez");
  });
});
