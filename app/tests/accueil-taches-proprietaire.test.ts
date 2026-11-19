import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { preparerVerificationsProprietaire } from "@/lib/verifications-proprietaire";

const m = vi.hoisted(() => ({ pilotage: vi.fn(), verifications: vi.fn(), demarrage: vi.fn(), rpc: vi.fn(), consommations: vi.fn() }));
vi.mock("@/lib/taches-consommations", () => ({ chargerTachesConsommations: m.consommations }));
vi.mock("@/lib/pilotage-proprietaire", () => ({ chargerPilotageProprietaire: m.pilotage }));
vi.mock("@/lib/lecture-verifications-proprietaire", () => ({ chargerVerificationsProprietaire: m.verifications }));
vi.mock("@/lib/incidents-verifications", () => ({ chargerIncidentsVerifications: async () => ({ incidents: new Map(), indisponible: false }) }));
vi.mock("@/components/suivi-echeanciers-charges", () => ({ SuiviEcheanciersCharges: () => null }));
vi.mock("@/components/conseils-accueil-proprietaire", () => ({ ConseilsAccueilProprietaire: () => null }));
vi.mock("@/components/accueil-bienvenue", () => ({ AccueilBienvenue: () => null }));
vi.mock("@/components/parcours-demarrage", () => ({ ParcoursDemarrage: (props: { premierBien?: boolean }) => { m.demarrage(props); return createElement("p", null, "GUIDE PREMIÈRE LOCATION"); } }));
vi.mock("@/components/actions-rapides-incident", () => ({ ActionsRapidesIncident: () => null }));
vi.mock("@/components/rappels-loyers", () => ({ RappelsLoyers: () => null }));
import { AccueilProprietaire } from "@/app/agence/[orgId]/accueil-proprietaire";

const lot = { id: "lot", bien_id: "bien", nom: "Studio des Lilas", etat: "disponible" };
const action = (cle: string, critique = false): ActionDuJour => ({
  source: "bail", cle, nature: "Sur un bail", titre: cle, criticite: critique ? "critique" : "normale",
  href: `/espace/org/baux/${cle}#edl`, detail: null, echeance: null,
});
function lecture(actions: ActionDuJour[] = [], loyers = false, error = false) {
  return { erreurs: { baux: error }, lectureLoyers: { error: null },
    verifications: preparerVerificationsProprietaire({ actions, aujourdHui: "2026-10-27", loyersIndisponibles: false,
      lignesLoyers: loyers ? [{ appel_id: "appel", bail_id: "bail", lot_nom: lot.nom, locataire: "Camille", periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 800, montant_couvert: 0, non_recu_signale_le: null }] : [],
    }),
  };
}
const pilotage = () => ({
  patrimoine: { biens: 1, lots: [lot], contrats: 0, lotsOccupes: 0, lotsSansBail: [], chambresSansBail: 0 },
  encaisse: 0, diagnostics: [], reglages: { appels_envoi_auto: false, quittances_envoi_auto: false, relances_envoi_auto: false },
});
beforeEach(() => {
  vi.clearAllMocks(); m.pilotage.mockResolvedValue(pilotage()); m.verifications.mockResolvedValue(lecture());
  m.rpc.mockResolvedValue({ data: [], error: null });
  m.consommations.mockResolvedValue({ taches: [], indisponible: false });
});
async function rendre() {
  return renderToStaticMarkup(await AccueilProprietaire({ supabase: { rpc: m.rpc } as never, orgId: "org", userId: "gerant",
    organisation: { name: "SCI", status: "active", essai_fin: null } }));
}

describe("accueil propriétaire : priorités et tâches à leur place", () => {
  it("inclut une facture à répartir dans les tâches et signale une lecture consommations incomplète", async () => {
    m.consommations.mockResolvedValue({ taches: [{ cle: "repartition:f", type: "facture_repartition", titre: "Répartir la facture EAU-TEST", detail: null, contexte: "Eau", lieu: null, echeance: null, href: "/espace/org/parc/bien#consommations", geste: "Préparer", nature: "demande" }], indisponible: false });
    const html = await rendre();
    expect(html).toContain("Répartir la facture EAU-TEST");
    expect(html).toContain('aria-label="1 tâche"');
    m.consommations.mockResolvedValue({ taches: [], indisponible: true });
    expect(await rendre()).toContain("La liste peut être incomplète");
    expect(await rendre()).not.toContain("Aucune tâche détectée");
  });

  it("compare les loyers du mois dans le même périmètre, sans inclure un autre bien", async () => {
    m.rpc.mockImplementation(async (nom: string) => ({ error: null, data: nom === "quittancement_mois" ? [
      { lot_id: "lot", montant_du: "1000", montant_couvert: "400" },
      { lot_id: "hors-patrimoine", montant_du: "99999", montant_couvert: "99999" },
    ] : [] }));
    const html = await rendre();
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("400,00");
    expect(html).not.toContain("99999");
    expect(html).toContain("Actions rapides");
    expect(html).toContain("À faire maintenant");
  });

  it("n'affiche pas une progression réussie si aucun loyer n'est attendu", async () => {
    const html = await rendre();
    expect(html).toContain("Aucun loyer attendu ce mois-ci");
    expect(html).not.toContain('aria-label="Loyers encaissés');
  });

  it("signale une lecture du mois impossible sans afficher un montant inventé", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const html = await rendre();
    expect(html).toContain("Montants indisponibles");
    expect(html).not.toContain('aria-label="Loyers encaissés');
  });
  it("compte toutes les demandes du même espace et affiche les urgences en premier", async () => {
    m.verifications.mockResolvedValue(lecture([action("Urgence TEST", true), action("Demande courante TEST")], true));
    const html = await rendre();
    expect(html).toContain('aria-label="3 tâches"');
    const carteTaches = html.split('id="taches-proprietaire"')[1];
    expect(carteTaches).toContain("Demande courante TEST");
    expect(carteTaches.indexOf("Urgence TEST")).toBeLessThan(carteTaches.indexOf("Confirmer les loyers reçus"));
    expect(carteTaches.indexOf("Confirmer les loyers reçus")).toBeLessThan(carteTaches.indexOf("Demande courante TEST"));
    expect(html.split('id="taches-proprietaire"')[0]).not.toContain("Demande courante TEST");
  });

  it("oriente les demandes courantes vers la liste visible, puis revient au patrimoine une fois traitées", async () => {
    m.verifications.mockResolvedValue(lecture([action("Demande TEST")]));
    const html = await rendre();
    expect(html).toContain('aria-label="1 tâche"');
    expect(html).toContain('href="/espace/org/alertes"');
    m.verifications.mockResolvedValue(lecture());
    const apres = await rendre();
    expect(apres).toContain("Aucune tâche détectée");
    expect(apres).toContain("Patrimoine");
    expect(apres).not.toContain('aria-label="1 tâche"');
  });

  it("réunit les demandes et préparations dans un seul compteur", async () => {
    const donnees = pilotage();
    const loue = { ...lot, id: "loue", nom: "T2 loué", etat: "loue" };
    m.pilotage.mockResolvedValue({ ...donnees, patrimoine: { ...donnees.patrimoine, lots: [lot, loue], lotsSansBail: [lot] },
      diagnostics: [{ id: "dpe", lot_id: "loue", classe_dpe: "F", date_realisation: "2020-01-01", lot: loue }] });
    m.verifications.mockResolvedValue(lecture([action("Demande TEST")]));
    const html = await rendre();
    expect(html).toContain('href="/espace/org/alertes"');
    expect(html).not.toContain("À vérifier</span>");
    expect(html).toContain('aria-label="3 tâches"');
  });

  it("le montant des échéances du mois mène au suivi des loyers", async () => {
    const html = await rendre();
    expect(html).toContain('href="/espace/org/loyers"');
    expect(html).toContain("Loyers du mois");
    expect(html).toContain("toutes échéances confondues");
  });

  it("garde les tâches fiables sans annoncer un repos quand une source échoue", async () => {
    m.verifications.mockResolvedValue(lecture([action("Demande connue")], false, true));
    const html = await rendre();
    expect(html).toContain("Demande connue");
    expect(html).toContain("La liste peut être incomplète");
    expect(html).not.toContain("Aucune tâche");
    expect(html).toContain('aria-label="1 tâche connue"');
  });

  it("garde la préparation accessible après une rupture de transport du contrôle", async () => {
    const donnees = pilotage();
    m.pilotage.mockResolvedValue({ ...donnees, patrimoine: { ...donnees.patrimoine, lotsSansBail: [lot] } });
    m.rpc.mockRejectedValue(new Error("lecture indisponible"));
    const html = await rendre();
    expect(html).toContain("Préparation à vérifier");
    expect(html).toContain('href="/espace/org/parc/bien/lots/lot"');
    expect(html).not.toContain("Le logement est prêt");
  });

  it("ne fait pas disparaître les autres tâches si le patrimoine ou les diagnostics sont illisibles", async () => {
    m.pilotage.mockResolvedValue({ ...pilotage(), patrimoine: null, diagnostics: null });
    m.verifications.mockResolvedValue(lecture([action("Demande fiable")]));
    const html = await rendre();
    expect(html).toContain("Demande fiable");
    expect(html).toContain("La liste peut être incomplète");
    expect(html).not.toContain("Aucune tâche");
  });
});


describe("accueil : compte neuf et fin du tutoriel", () => {
  it("place les tâches avant les chiffres et conserve un accès aux actions", async () => {
    m.verifications.mockResolvedValue(lecture([action("DPE Lilas")]));
    const html = await rendre();
    expect(html.indexOf("À faire maintenant")).toBeLessThan(html.indexOf("Loyers du mois"));
    expect(html).toContain("Actions rapides");
    expect(html).toContain("À savoir sur vos envois");
    expect(html).toContain("Les relances locatives et les avis d’échéance par courriel restent suspendus");
  });
  it("compte neuf : guide sans faux indicateurs ni raccourcis prématurés", async () => {
    const p = pilotage();
    m.pilotage.mockResolvedValue({ ...p, patrimoine: { ...p.patrimoine, biens: 0, lots: [] } });
    const html = await rendre();
    expect(m.demarrage).toHaveBeenCalledWith(expect.objectContaining({ premierBien: true }));
    expect(html).toContain("GUIDE PREMIÈRE LOCATION");
    expect(html).not.toContain("Votre patrimoine en bref");
    expect(html).not.toContain("Actions rapides");
    expect(html).toContain("À savoir sur vos envois");
  });
  it.each([1, 2])("%i contrats actifs : aucun tutoriel de première location", async contrats => {
    const p = pilotage();
    m.pilotage.mockResolvedValue({ ...p, patrimoine: { ...p.patrimoine, contrats } });
    expect(await rendre()).not.toContain("GUIDE PREMIÈRE LOCATION");
    expect(m.demarrage).not.toHaveBeenCalled();
  });
  it("n’efface pas les encaissements quand le dernier bien est archivé", async () => {
    const p = pilotage();
    m.pilotage.mockResolvedValue({ ...p, encaisse: 700, patrimoine: { ...p.patrimoine, biens: 0, lots: [] } });
    const html = await rendre();
    expect(html).toContain("Votre patrimoine en bref");
    expect(html).toContain("700,00");
  });
  it("montre trois tâches, puis les suivantes sur demande, sans les supprimer", async () => {
    m.verifications.mockResolvedValue(lecture(Array.from({ length: 6 }, (_, i) => action(`Demande ${i + 1}`))));
    const html = await rendre();
    const avantDepliage = html.slice(0, html.indexOf("<details"));
    for (const n of [1, 2, 3]) expect(avantDepliage).toContain(`Demande ${n}`);
    for (const n of [4, 5, 6]) {
      expect(avantDepliage).not.toContain(`Demande ${n}`);
      expect(html).toContain(`Demande ${n}`);
    }
    expect(html).toContain('aria-label="6 tâches"');
    expect(html).toContain("Voir les 3 autres tâches");
  });
});
