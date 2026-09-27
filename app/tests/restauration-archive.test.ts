import { describe, expect, it } from "vitest";
import { verifierDestination, verifierPrefixe } from "../scripts/sauvegarde/restaurer-archive.mjs";

describe("restauration d'une archive réelle dans un banc jetable", () => {
  it.each([
    "postgres://postgres@aws-0-eu-west-3.pooler.supabase.com/gerimmo_restauration_test",
    "postgres://postgres@127.0.0.1/postgres",
    "postgres://postgres@127.0.0.1/gerimmo_restauration_test?host=externe",
    "postgres://postgres.rddlxunppddzpsaatdaz@127.0.0.1/gerimmo_restauration_test",
    "https://127.0.0.1/gerimmo_restauration_test",
  ])("refuse une destination ambiguë ou qui pourrait toucher une base existante : %s", url => {
    expect(() => verifierDestination(url)).toThrow();
  });
  it("accepte seulement les cibles locales explicitement nommées pour l'exercice", () => {
    expect(verifierDestination("postgres://postgres@127.0.0.1:5432/gerimmo_restauration_123").hostname).toBe("127.0.0.1");
  });
  it("refuse un chemin libre dans le préfixe téléchargé", () => {
    expect(verifierPrefixe("20260927-0639")).toBe("20260927-0639");
    for (const v of ["../prod", "20260927-0639/../../x", "", "latest"]) expect(() => verifierPrefixe(v)).toThrow();
  });
});
