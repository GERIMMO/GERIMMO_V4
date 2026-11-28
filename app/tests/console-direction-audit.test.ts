import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { echeanceTraitement } from "../src/app/admin/sante/suivi-traitements";

const source = (path: string) => readFileSync(new URL(`../src/app/${path}`, import.meta.url), "utf8");

describe("Corrections de l’audit de la console de direction", () => {
  it("AUD-020 : l’accueil présente les canaux et le réglage des quittances au même endroit", () => {
    const accueil = source("agence/[orgId]/page.tsx");
    expect(accueil).toContain("<CanauxAccueilAgence");
    expect(accueil).not.toContain("Gerimmo peut faire seul");
    expect(source("agence/[orgId]/layout.tsx")).toContain("<BandeauEnvoisHorsAccueil");
  });

  it("AUD-024 : Aujourd’hui et Santé partagent la lecture des quatre repères", () => {
    expect(source("admin/brief/page.tsx")).toContain("<SuiviTraitements");
    expect(source("admin/sante/page.tsx")).toContain("<ReperesTraitement");
    const suivi = source("admin/sante/suivi-traitements.tsx");
    for (const libelle of ["Dernier passage", "Dernier succès", "Preuve de livraison", "Échéance suivante"]) {
      expect(suivi).toContain(libelle);
    }
  });

  it("AUD-025 : les trois priorités sont placées avant les études repliées", () => {
    const page = source("admin/territoire/page.tsx");
    const etudes = page.indexOf("<summary");
    expect(etudes).toBeGreaterThan(0);
    for (const titre of ["Demandes à rappeler", "Échéance la plus proche", ">Suivi<"]) {
      expect(page.slice(0, etudes)).toContain(titre);
    }
    expect(page).toMatch(/<details[^>]*>\s*<summary[^>]*>Études territoriales/);
  });
});

describe("Créneaux suivants des traitements", () => {
  it("prend le prochain créneau UTC sans le déduire du dernier passage", () => {
    expect(echeanceTraitement("quittances", new Date("2026-11-27T06:59:59Z"))).toBe("2026-11-27T07:00:00.000Z");
    expect(echeanceTraitement("quittances", new Date("2026-11-27T07:00:00Z"))).toBe("2026-11-28T07:00:00.000Z");
  });

  it("passe au mois suivant pour le cycle des loyers et distingue la sauvegarde", () => {
    const maintenant = new Date("2026-12-31T23:59:59Z");
    expect(echeanceTraitement("cycle-mensuel", maintenant)).toBe("2027-01-01T05:00:00.000Z");
    expect(echeanceTraitement("sauvegarde", maintenant)).toBe("2027-01-01T01:20:00.000Z");
    expect(echeanceTraitement("inconnu", maintenant)).toBeNull();
  });
});
