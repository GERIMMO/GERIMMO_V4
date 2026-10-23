/**
 * Relecture adverse du socle (24/10/2026, M3) : si le code est déployé AVANT la migration 20261024090000, la colonne
 * `acceptations_cgu.document` n'existe pas encore. La lecture de la garde de souscription échouait alors (42703) et
 * comptait « non acceptée » : la case était redemandée, l'acceptation enregistrée par l'ancienne fonction, et la garde
 * échouait de nouveau — plus personne ne pouvait payer. Sans la colonne, toutes les acceptations sont des acceptations
 * des conditions clients : la garde relit sans le filtre. Toute autre erreur ferme toujours par défaut.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => ({ editeur: {}, indisponible: false }) }));
vi.mock("@/lib/reglage-souscription-serveur", () => ({ lireReglageSouscription: async () => ({ blocageIdentiteActif: true }) }));
import { conditionsEnVigueurAccepteesPar } from "../src/lib/garde-souscription-serveur";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

type Reponse = { data: unknown; error: { code?: string; message: string } | null };

/** Un client dont chaque lecture de acceptations_cgu rend la réponse suivante, et qui note les filtres posés. */
function client(reponses: Reponse[]) {
  const lectures: [string, unknown][][] = [];
  return {
    lectures,
    from: (table: string) => {
      expect(table).toBe("acceptations_cgu");
      const filtres: [string, unknown][] = [];
      lectures.push(filtres);
      const q = {
        select: () => q,
        eq: (colonne: string, valeur: unknown) => (filtres.push([colonne, valeur]), q),
        limit: () => q,
        maybeSingle: async () => reponses.shift() ?? { data: null, error: { message: "aucune réponse prévue" } },
      };
      return q;
    },
  };
}

const COLONNE_ABSENTE = { data: null, error: { code: "42703", message: "column acceptations_cgu.document does not exist" } };

describe("M3 : garde de souscription déployée avant sa migration", () => {
  it("colonne « document » absente : la garde relit sans ce filtre et retrouve l'acceptation", async () => {
    const c = client([COLONNE_ABSENTE, { data: { id: "a-1" }, error: null }]);
    expect(await conditionsEnVigueurAccepteesPar(c as never, "compte-1")).toBe(true);
    expect(c.lectures).toHaveLength(2);
    expect(c.lectures[0]).toContainEqual(["document", "conditions_clients"]);
    expect(c.lectures[1]).toEqual([["account_id", "compte-1"], ["version", CONDITIONS_VERSION]]);
  });

  it("colonne absente et aucune acceptation : non acceptée", async () => {
    const c = client([COLONNE_ABSENTE, { data: null, error: null }]);
    expect(await conditionsEnVigueurAccepteesPar(c as never, "compte-1")).toBe(false);
  });

  it("migration appliquée : une seule lecture, bornée aux conditions clients", async () => {
    const c = client([{ data: { id: "a-1" }, error: null }]);
    expect(await conditionsEnVigueurAccepteesPar(c as never, "compte-1")).toBe(true);
    expect(c.lectures).toEqual([[["account_id", "compte-1"], ["document", "conditions_clients"], ["version", CONDITIONS_VERSION]]]);
  });

  it("toute autre erreur ferme par défaut, sans seconde lecture", async () => {
    const c = client([{ data: null, error: { code: "42501", message: "permission denied" } }, { data: { id: "a-1" }, error: null }]);
    expect(await conditionsEnVigueurAccepteesPar(c as never, "compte-1")).toBe(false);
    expect(c.lectures).toHaveLength(1);
  });
});
