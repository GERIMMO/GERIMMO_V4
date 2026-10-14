/**
 * D04 (1), fiche VER-TS-02 : le champ « Justification du complément » du parcours de bail apparaît dès qu'un complément
 * de loyer est saisi. Il lisait le complément par `Number(...replace(",", "."))` ; il le lit maintenant comme le
 * serveur (`lireMontantFacultatif`) : « 40,50 » compte, « 1e3 » et « abc » ne comptent pas.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/etapes-bail", () => ({ modifierEtapeBail: vi.fn() }));
vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: vi.fn() }));
vi.mock("@/components/pastille-bail", () => ({ LabelBail: () => null }));

import { complementPositif } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-parcours-bail";

describe("complementPositif : un complément saisi fait apparaître sa justification", () => {
  it.each(["40", "40,50", "40.50", "0,01", " 12 "])("« %s » est un complément", (saisie) => {
    expect(complementPositif(saisie)).toBe(true);
  });

  it.each([undefined, "", "  ", "0", "0,00", "abc", "1e3", "0x10", "Infinity", "-5", "12,345", "1 000", "1.000,50"])(
    "« %s » n'est pas un complément (champ vide, zéro, ou texte que le serveur refuserait)",
    (saisie) => {
      expect(complementPositif(saisie)).toBe(false);
    }
  );
});
