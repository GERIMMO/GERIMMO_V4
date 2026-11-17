import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deciderPostProgramme } from "@/app/admin/marketing/actions";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const cible = "11223344-1234-4234-a234-123456789012";
const autre = "22334455-1234-4234-a234-123456789012";
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({data:true,error:null});
  vi.stubEnv("NEXT_PUBLIC_SITE_URL","http://127.0.0.1:3492");
  vi.stubEnv("CRON_SECRET","recette-locale");
});
afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();});

async function publier(bilan: unknown, statut = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(bilan,{status:statut})));
  const donnees = new FormData();
  donnees.set("id", cible);
  donnees.set("action", "publier_maintenant");
  return deciderPostProgramme({}, donnees);
}

it("ne confirme pas l’article demandé lorsque seul un autre a été diffusé", async () => {
  const r = await publier({publiees:1, diffusees:[autre], en_attente:[cible]});
  expect(r.succes).not.toContain("est paru");
  expect(r.succes).toContain("à vérifier");
});
it("réserve la confirmation à l’identifiant demandé dans une réponse réussie", async () => {
  expect((await publier({publiees:2, diffusees:[autre,cible]})).succes).toContain("est paru");
  expect((await publier({publiees:1, diffusees:[cible]},503)).succes).not.toContain("est paru");
});
it("ne confirme aucune parution sur un compteur seul ou une erreur globale", async () => {
  for (const bilan of [{publiees:1},{erreurs:["Traitement indisponible."]}]) {
    const r = await publier(bilan);
    expect(r.succes).not.toMatch(/est paru|[Ll]e site a publié/);
    expect(r.succes).toContain("à vérifier");
  }
});
it("garde l’autorisation de supervision avant de lancer la mission", async () => {
  rpc.mockResolvedValueOnce({data:false,error:null});
  expect((await publier({publiees:1,diffusees:[cible]})).erreur).toContain("supervision");
  expect(fetch).not.toHaveBeenCalled();
});
