import { describe, expect, it } from "vitest";
import { consigneIncident, consigneMission } from "../src/lib/consigne-incident";

const mission = { id: "mission", statut: "acceptee", debut_prevu: null as string | null };
describe("prochaine action du propriétaire dans un incident", () => {
  it("demande une décision avant de proposer la recherche d'artisan", () => {
    const c = consigneIncident("declare", true, false, false);
    expect(c?.titre).toContain("qui paie");
    expect(c?.liens).toBeUndefined();
  });
  it("présente la contestation avant la suite de l'intervention", () => {
    expect(consigneIncident("qualifie", true, true, false)?.titre).toContain("contestation");
    expect(consigneIncident("qualifie", false, false, false)?.liens?.map(l=>l.cible)).toEqual(["intervention", "cloture"]);
  });
  it("n'invente pas de locataire dans un dossier de parties communes", () => {
    expect(consigneIncident("declare", true, false, true)?.texte).toContain("répartition éventuelle");
    const c = consigneMission(mission, [{ propose_par: "artisan" }], true, false);
    expect(c.attente).toBe(true);
    expect(c.titre).not.toContain("locataire");
  });
  it("distingue un rendez-vous à organiser d'une proposition attendant le locataire", () => {
    expect(consigneMission(mission, [], false, false).liens?.[0].cible).toBe("rdv-mission");
    const c = consigneMission(mission, [{ propose_par: "artisan" }], false, false);
    expect(c.attente).toBe(true);
    expect(c.titre).toContain("locataire");
    expect(c.liens?.some(l=>l.cible.startsWith("rdv-"))).toBe(false);
  });
  it("ne redemande pas de fixer un rendez-vous déjà confirmé", () => {
    const c = consigneMission({ ...mission, debut_prevu: "2026-11-10T10:00:00Z" }, [], false, false);
    expect(c.attente).toBe(true);
    expect(c.titre).toContain("fixé");
    expect(c.liens).toBeUndefined();
  });
  it("signale une lecture impossible au lieu d'affirmer qu'aucun rendez-vous n'existe", () => {
    const c = consigneMission(mission, [], false, true);
    expect(c.titre).toContain("vérifier");
    expect(c.texte).toContain("indisponibles");
    expect(c.liens).toBeUndefined();
  });
  it("sépare le contrôle avant clôture de la consultation d'un dossier clos", () => {
    expect(consigneIncident("termine", false, false, false)?.liens?.map(l=>l.cible)).toEqual(["intervention", "cloture"]);
    const clos = consigneIncident("clos", false, false, false);
    expect(clos?.repere).toBe("Dossier terminé");
    expect(clos?.liens?.map(l=>l.cible)).toEqual(["chronologie"]);
  });
});
