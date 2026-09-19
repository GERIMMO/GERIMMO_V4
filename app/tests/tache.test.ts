import { afterEach, describe, expect, it, vi } from "vitest";
import { consignerTache, depuisHeures, dernieresTaches, porteurDuSecret } from "../src/lib/tache";

describe("la borne d'une fenêtre de journal", () => {
  it("rend l'instant d'il y a n heures, en ISO", () => {
    const maintenant = new Date("2026-09-19T12:00:00.000Z");
    expect(depuisHeures(24, maintenant)).toBe("2026-09-18T12:00:00.000Z");
    expect(depuisHeures(0.5, maintenant)).toBe("2026-09-19T11:30:00.000Z");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consigner le bilan d'une passe", () => {
  it("écrit un événement préfixé, avec le bilan tel quel", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await consignerTache({ rpc }, "appels", { envoyes: 3, echecs: 1 });
    expect(rpc).toHaveBeenCalledWith("log_tech", {
      evenement: "tache_appels",
      details: { envoyes: 3, echecs: 1 },
    });
  });

  it("ne lève jamais : ni sur une erreur rendue, ni sur un rejet", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      consignerTache({ rpc: vi.fn().mockResolvedValue({ error: { message: "refusé" } }) }, "x", {})
    ).resolves.toBeUndefined();
    await expect(
      consignerTache({ rpc: vi.fn().mockRejectedValue(new Error("réseau")) }, "x", {})
    ).resolves.toBeUndefined();
    expect(erreur).toHaveBeenCalledTimes(2);
  });
});

describe("le secret des tâches", () => {
  const requete = (entete?: string) =>
    new Request("https://exemple.fr/api/sante", { headers: entete ? { authorization: entete } : {} });
  const SECRET = "un-secret-de-recette-assez-long";

  it("accepte le bon secret, en schéma Bearer", () => {
    expect(porteurDuSecret(requete(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it.each([
    ["sans en-tête", undefined],
    ["secret nu", SECRET],
    ["mauvais secret", "Bearer faux"],
    ["bonne longueur, faux", `Bearer ${"x".repeat(SECRET.length)}`],
  ])("refuse — %s", (_, entete) => {
    expect(porteurDuSecret(requete(entete), SECRET)).toBe(false);
  });

  it("refuse tout quand aucun secret n'est configuré", () => {
    expect(porteurDuSecret(requete(`Bearer ${SECRET}`), undefined)).toBe(false);
    expect(porteurDuSecret(requete("Bearer "), "")).toBe(false);
  });
});

describe("la dernière passe de chaque tâche", () => {
  it("garde la plus récente par tâche, sans le préfixe, et ignore le reste", () => {
    const lignes = [
      { evenement: "tache_appels", details: { envoyes: 2 }, created_at: "2026-09-19T05:30:00Z" },
      { evenement: "erreur_ecran", details: {}, created_at: "2026-09-19T05:00:00Z" },
      { evenement: "tache_appels", details: { envoyes: 9 }, created_at: "2026-09-18T05:30:00Z" },
      { evenement: "tache_rappels", details: { rappeles: 0 }, created_at: "2026-09-19T04:00:00Z" },
    ];
    expect(dernieresTaches(lignes)).toEqual({
      appels: { le: "2026-09-19T05:30:00Z", bilan: { envoyes: 2 } },
      rappels: { le: "2026-09-19T04:00:00Z", bilan: { rappeles: 0 } },
    });
  });

  it("rend un objet vide sans passe", () => {
    expect(dernieresTaches([])).toEqual({});
  });
});
