/**
 * Relecture transverse 3 du 24/10 (B2) : `inscriptions_agences_opposees` rend une table à une colonne `id`. PostgREST la
 * rend en [{"id": …}] ; l'émulateur des parcours de la CI aussi. L'ancienne lecture (`.map(String)` sur un ensemble de
 * valeurs nues) donnait « [object Object] » sous l'émulateur : aucune opposition n'était reconnue.
 */
import { describe, expect, it } from "vitest";
import { identifiantsOpposes } from "@/lib/liste-attente-agences";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("identifiantsOpposes", () => {
  it("lit la forme d'une table à une colonne `id`", () => {
    expect([...identifiantsOpposes([{ id: A }, { id: B }])]).toEqual([A, B]);
  });
  it("accepte encore des valeurs nues", () => {
    expect([...identifiantsOpposes([A, B])]).toEqual([A, B]);
  });
  it("n'invente rien : objets sans `id`, nombres, nul, ou autre chose qu'une liste sont écartés", () => {
    expect([...identifiantsOpposes([{ inscriptions_agences_opposees: A }, 3, null, ""])]).toEqual([]);
    expect(identifiantsOpposes(null).size).toBe(0);
    expect(identifiantsOpposes({ id: A }).size).toBe(0);
    expect(identifiantsOpposes(["[object Object]"]).has(A)).toBe(false);
  });
});
