import { describe, expect, it } from "vitest";
import { envoisEteints, toutManuel } from "../src/lib/envois-automatiques";
import fs from "node:fs";
import path from "node:path";

describe("les envois encore manuels", () => {
  it("nomme ceux qui sont éteints, dans l'ordre du mois", () => {
    expect(
      envoisEteints({ quittances_envoi_auto: false, appels_envoi_auto: false, relances_envoi_auto: true })
    ).toEqual(["les avis d'échéance", "les quittances"]);
    expect(envoisEteints(null)).toEqual([]);
    expect(toutManuel({ quittances_envoi_auto: null, appels_envoi_auto: null, relances_envoi_auto: null })).toBe(true);
    expect(toutManuel({ quittances_envoi_auto: true, appels_envoi_auto: false, relances_envoi_auto: false })).toBe(false);
  });

  it("le parcours de démarrage propose l'automatique vers le profil, et le tableau de bord partage la liste", () => {
    const src = path.resolve(__dirname, "..", "src");
    const parcours = fs.readFileSync(path.join(src, "components/parcours-demarrage.tsx"), "utf8");
    expect(parcours).toContain("toutManuel(");
    expect(parcours).toContain("/profil#relances");
    const tableau = fs.readFileSync(path.join(src, "app/agence/[orgId]/page.tsx"), "utf8");
    expect(tableau).toContain('from "@/lib/envois-automatiques"');
  });
});
