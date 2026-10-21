/**
 * Décision D22 (report ou annulation du rendez-vous par le locataire) : ce que disent les écrans, les courriers et les
 * actions, sans base. Le comportement en base est gardé par tests/rendez-vous-locataire.test.ts.
 *
 *  - Les six types d'événement de la migration ont un libellé (un type sans libellé s'afficherait en clair technique).
 *  - Les trois alertes mènent au dossier de l'incident et se ferment d'elles-mêmes.
 *  - Le locataire lit l'état de sa demande dans ses mots ; le refus porte le motif de l'artisan ; l'expiration et
 *    l'accord le rassurent sur le rendez-vous à retenir ; quand le report n'est plus possible, on dit pourquoi.
 *  - Les courriers : l'annulation tardive est dite au gestionnaire, JAMAIS présentée à l'artisan comme un déplacement
 *    perdu (C.15-5) ; aucun code de motif brut.
 *  - Les actions : clé d'envoi exigée, motif de la liste fermée, trois dates différentes et à venir, confirmation de
 *    l'annulation ; un refus de la base ne prévient personne ; un succès prévient en coulisses.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dansNJours, HORLOGES_CRENEAUX } from "./fixtures/jours-creneaux-paris";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  verifier: vi.fn(),
  notifierEnCoulisses: vi.fn(),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierLocataire: m.verifier }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications")>()),
  notifierEnCoulisses: m.notifierEnCoulisses,
}));

import { annulerRdvLocataire, demanderReportRdv, retirerDemandeRdv } from "@/app/actions/incidents-locataire";
import { gesteAlerte } from "@/lib/chemin-alerte";
import { TYPES_EVENEMENT_INCIDENT } from "@/lib/incidents";
import { messageAnnulationRdvLocataire, messageDemandeReportRdv, messageReponseReportRdv } from "@/lib/notifications";
import {
  etatDemandeLocataire,
  libelleMotifRdv,
  MOTIFS_RDV,
  raisonSansReport,
  REGLES_RDV_LOCATAIRE,
  type RendezVousLocataire,
} from "@/lib/rendez-vous-locataire";

const migration = readFileSync(
  new URL("../supabase/migrations/20261014620000_rendez_vous_locataire_report_annulation.sql", import.meta.url),
  "utf8"
);
const CLE = "0b5c1d2e-3f40-4a51-8b62-7c83d94e0f15";

function rv(partiel: Partial<RendezVousLocataire> = {}): RendezVousLocataire {
  return {
    intervention_id: "iv", incident_id: "inc", statut_mission: "planifiee",
    rdv_debut: "2026-10-22T07:00:00Z", rdv_fin: "2026-10-22T09:00:00Z",
    report_possible: true, annulation_possible: true, reports_restants: 2,
    demande_id: null, demande_type: null, demande_statut: null, demande_motif_code: null,
    demandee_le: null, expire_le: null, repondu_le: null, reponse_motif: null,
    demande_rdv_debut: null, demande_rdv_fin: null, nouveau_debut: null, nouvelle_fin: null, tardive: false, annulation_tardive: false,
    ...partiel,
  };
}

describe("libellés, motifs et alertes", () => {
  it("chaque type d'événement de la migration a un libellé lisible", () => {
    const types = [...migration.matchAll(/'(rdv_[a-z_]+)'/g)].map((x) => x[1]).filter((t) => !t.startsWith("rdv_annule_t") && !t.startsWith("rdv_annule_l") && t !== "rdv_demande_sans_reponse");
    const evenements = [...new Set(types)].filter((t) => t.startsWith("rdv_report_") || t === "rdv_annule_par_locataire");
    expect(evenements.sort()).toEqual([
      "rdv_annule_par_locataire", "rdv_report_accepte", "rdv_report_demande", "rdv_report_expire", "rdv_report_refuse", "rdv_report_retire",
    ]);
    for (const t of evenements) {
      expect(TYPES_EVENEMENT_INCIDENT[t], t).toBeTruthy();
      expect(TYPES_EVENEMENT_INCIDENT[t]).not.toContain("_");
    }
  });

  it("la liste des motifs est celle de la contrainte de la table, et un code inconnu ne s'affiche jamais brut", () => {
    const contrainte = /motif_code in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    expect(MOTIFS_RDV.map((x) => `'${x.valeur}'`).join(", ")).toBe(contrainte);
    expect(libelleMotifRdv("sante")).toBe("Un problème de santé");
    expect(libelleMotifRdv("code_inconnu")).toBe("Autre raison");
    expect(libelleMotifRdv(null)).toBe("Autre raison");
  });

  it("les trois nombres affichés sont ceux de la décision, tels que la base les applique", () => {
    expect(REGLES_RDV_LOCATAIRE).toEqual({ delaiReportHeures: 24, reportsMax: 2, reponseArtisanHeures: 48 });
    expect(migration).toContain("select 24, 2, 48");
  });

  it.each(["rdv_annule_locataire", "rdv_annule_tardif", "rdv_demande_sans_reponse"])(
    "l'alerte « %s » mène au dossier de l'incident et se ferme d'elle-même",
    (type) => {
      const geste = gesteAlerte({ type, details: { incident_id: "inc-1", intervention_id: "iv-1" } }, "org-1");
      expect(geste).toMatchObject({ href: "/agence/org-1/incidents?sel=inc-1", seFermeSeule: true });
      expect(geste?.libelle).not.toBe("Ouvrir le dossier concerné");
    }
  );
});

describe("ce que le locataire lit de sa demande", () => {
  it("en attente : le rendez-vous actuel reste valable, avec l'échéance", () => {
    const e = etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "en_attente", demandee_le: "2026-10-15T08:00:00Z", expire_le: "2026-10-17T08:00:00Z" }));
    expect(e?.detail).toMatch(/reste valable tant que l'artisan n'a pas répondu/);
    expect(e?.detail).toMatch(/réponse attendue avant le samedi 17 octobre à 10 h/);
  });

  it("acceptée : la nouvelle date ; refusée : le motif de l'artisan et le rendez-vous maintenu", () => {
    expect(etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "acceptee", nouveau_debut: "2026-10-24T12:00:00Z", nouvelle_fin: "2026-10-24T16:00:00Z" }))?.titre)
      .toBe("L'artisan a accepté : nouveau rendez-vous le samedi 24 octobre, 14 h – 18 h");
    const refus = etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "refusee", reponse_motif: "Chantier ailleurs" }));
    expect(refus?.titre).toMatch(/votre gestionnaire va vous appeler/);
    expect(refus?.detail).toContain("« Chantier ailleurs »");
    expect(refus?.detail).toMatch(/maintenu/);
  });

  it("expirée : le rendez-vous est maintenu ; retirée : rien à dire", () => {
    expect(etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "expiree" }))?.detail).toMatch(/maintenu/);
    expect(etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "retiree" }))).toBeNull();
  });

  it("annulation : dite tant qu'aucun nouveau rendez-vous n'est fixé, sans un mot de sanction", () => {
    const a = etatDemandeLocataire(rv({ statut_mission: "acceptee", demande_id: "d", demande_type: "annulation", demande_statut: "acceptee", demande_rdv_debut: "2026-10-22T07:00:00Z", demande_rdv_fin: "2026-10-22T09:00:00Z", tardive: true }));
    expect(a?.titre).toMatch(/^Vous avez annulé le rendez-vous du jeudi 22 octobre, 0?9 h – 11 h$/);
    expect(`${a?.titre} ${a?.detail}`).not.toMatch(/pénalit|frais|sanction|tardi/i);
    expect(etatDemandeLocataire(rv({ statut_mission: "planifiee", demande_id: "d", demande_type: "annulation", demande_statut: "acceptee" }))).toBeNull();
  });

  it("report impossible : on dit pourquoi (plafond, ou moins de 24 h), jamais un bouton qui échouerait", () => {
    expect(raisonSansReport(rv({ report_possible: false, reports_restants: 0 }))).toMatch(/déjà fait l'objet de 2 demandes de report/);
    expect(raisonSansReport(rv({ report_possible: false, reports_restants: 1, annulation_tardive: true }))).toMatch(/moins de 24 heures/);
    // La raison du délai n'est jamais devinée : sans le drapeau de la base, aucune phrase (ex. demande échue).
    expect(raisonSansReport(rv({ report_possible: false, reports_restants: 1, demande_id: "d", demande_type: "report", demande_statut: "expiree" }))).toBeNull();
    expect(raisonSansReport(rv())).toBeNull();
  });
});

describe("les courriers", () => {
  const base = {
    emetteur: "Agence TEST", categorie: "plomberie_canalisation", numero: "INC-1", rdvDebut: "2026-10-22T07:00:00Z", rdvFin: "2026-10-22T09:00:00Z",
    motif: libelleMotifRdv("travail"), precision: "Réunion imprévue", lien: "https://exemple.invalid/x",
  };
  it("la demande de report à l'artisan dit le motif en mots, que le rendez-vous tient, et l'échéance", () => {
    const msg = messageDemandeReportRdv({ ...base, expireLe: "2026-10-17T08:00:00Z" });
    expect(msg.html).toContain("Une contrainte de travail");
    expect(msg.html).not.toContain("travail'");
    expect(msg.html).toMatch(/le rendez-vous actuel reste valable/);
    expect(msg.html).toContain("avant le samedi 17 octobre à 10 h 00");
  });

  it("l'annulation tardive est dite au gestionnaire, jamais présentée à l'artisan comme un déplacement perdu", () => {
    const artisan = messageAnnulationRdvLocataire({ ...base, destinataire: "artisan", tardive: true });
    const agence = messageAnnulationRdvLocataire({ ...base, destinataire: "agence", tardive: true });
    expect(artisan.html).not.toMatch(/tardi|24 heures|déplacement perdu|pénalit|frais/i);
    expect(artisan.html).toMatch(/Ne vous déplacez pas/);
    expect(agence.html).toMatch(/moins de 24 heures/);
    expect(agence.html).toMatch(/sans autre suite/);
  });

  it("la réponse au locataire : la nouvelle date, ou le refus avec le motif et le rendez-vous maintenu", () => {
    const ok = messageReponseReportRdv({ emetteur: "Agence TEST", categorie: "plomberie_canalisation", reponse: { type: "acceptee", debut: "2026-10-24T12:00:00Z", fin: "2026-10-24T16:00:00Z" }, rdvDebut: base.rdvDebut, rdvFin: base.rdvFin, lien: null });
    expect(ok.sujet).toContain("samedi 24 octobre");
    const non = messageReponseReportRdv({ emetteur: "Agence TEST", categorie: "plomberie_canalisation", reponse: { type: "refusee", motif: "Chantier ailleurs" }, rdvDebut: base.rdvDebut, rdvFin: base.rdvFin, lien: null });
    expect(non.html).toContain("Chantier ailleurs");
    expect(non.html).toMatch(/est maintenu/);
  });
});

describe.each(HORLOGES_CRENEAUX)("les actions du locataire — $nom", ({ instant, jours, heuresUtc }) => {
  function report(sans: string[] = []) {
    const f = new FormData();
    f.set("cle_envoi", CLE);
    f.set("motif", "travail");
    f.set("precision", "Réunion imprévue");
    [3, 4, 5].forEach((n, i) => { f.set(`date-${i}`, dansNJours(n)); f.set(`moment-${i}`, "matin"); });
    for (const champ of sans) f.delete(champ);
    return f;
  }
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
    m.verifier.mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "locataire-test" } });
    m.notifierEnCoulisses.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it("report : la fonction de base reçoit le motif, la précision, trois dates et la clé ; l'artisan est prévenu", async () => {
    m.rpc.mockResolvedValue({ data: "demande-1", error: null });
    const formulaire = report();
    expect([0, 1, 2].map(i => formulaire.get(`date-${i}`))).toEqual(jours);
    const r = await demanderReportRdv("org-1", "iv-1", {}, formulaire);
    expect(r.succes).toMatch(/reste valable/);
    const [nom, args] = m.rpc.mock.calls[0];
    expect(nom).toBe("demander_report_rdv");
    expect(args).toMatchObject({ p_org: "org-1", p_intervention: "iv-1", p_motif_code: "travail", p_motif_texte: "Réunion imprévue", p_cle: CLE });
    expect(args.p_creneaux).toEqual(jours.map((jour, i) => ({
      debut: `${jour}T0${heuresUtc[i]}:00:00.000Z`,
      fin: `${jour}T${heuresUtc[i] + 4}:00:00.000Z`,
    })));
    expect(m.notifierEnCoulisses).toHaveBeenCalledOnce();
    expect(m.notifierEnCoulisses.mock.calls[0][1]).toMatchObject({ evenement: "rdv_report_demande", objet: "demande-1" });
  });

  it("report : sans clé, sans motif, avec deux dates identiques ou une date passée, rien n'est écrit", async () => {
    expect((await demanderReportRdv("org-1", "iv-1", {}, report(["cle_envoi"]))).erreur).toMatch(/Rechargez la page/);
    expect((await demanderReportRdv("org-1", "iv-1", {}, report(["motif"]))).erreur).toMatch(/motif/);
    const doublon = report(); doublon.set("date-1", dansNJours(3));
    expect((await demanderReportRdv("org-1", "iv-1", {}, doublon)).erreur).toMatch(/différentes/);
    const passee = report(); passee.set("date-2", dansNJours(0));
    expect((await demanderReportRdv("org-1", "iv-1", {}, passee)).erreur).toMatch(/à venir/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("report refusé par la base (moins de 24 h) : le message de la base, et personne n'est prévenu", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Le rendez-vous est dans moins de 24 heures : il ne peut plus être reporté ici. Vous pouvez encore l'annuler, ou appeler votre gestionnaire" } });
    const r = await demanderReportRdv("org-1", "iv-1", {}, report());
    expect(r.erreur).toMatch(/moins de 24 heures/);
    expect(r.valeurs?.motif).toBe("travail");
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
  });

  it("annulation : exige la confirmation cochée ; confirmée, l'artisan et le gestionnaire sont prévenus", async () => {
    const f = new FormData();
    f.set("cle_envoi", CLE);
    f.set("motif", "probleme_resolu");
    expect((await annulerRdvLocataire("org-1", "iv-1", {}, f)).erreur).toMatch(/Confirmez l'annulation/);
    expect(m.rpc).not.toHaveBeenCalled();
    f.set("confirmation", "oui");
    m.rpc.mockResolvedValue({ data: "demande-2", error: null });
    const r = await annulerRdvLocataire("org-1", "iv-1", {}, f);
    expect(r.succes).toMatch(/annulé/);
    expect(m.rpc.mock.calls[0]).toEqual(["annuler_rdv_locataire", { p_org: "org-1", p_intervention: "iv-1", p_motif_code: "probleme_resolu", p_motif_texte: null, p_cle: CLE }]);
    expect(m.notifierEnCoulisses.mock.calls[0][1]).toMatchObject({ evenement: "rdv_annule_par_locataire", objet: "demande-2" });
  });

  it("retrait : la fonction de base tranche ; « déjà traitée » se dit tel quel", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Cette demande a déjà été traitée : rechargez la page pour lire la réponse" } });
    const r = await retirerDemandeRdv("org-1", "demande-1", {}, new FormData());
    expect(r.erreur).toMatch(/déjà été traitée/);
    expect(m.rpc.mock.calls[0]).toEqual(["retirer_demande_rdv", { p_org: "org-1", p_demande: "demande-1" }]);
  });
});
