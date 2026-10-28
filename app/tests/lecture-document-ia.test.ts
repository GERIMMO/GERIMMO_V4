import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { lireDocumentIA } from "@/lib/lecture-document-ia";
const jpeg = () => new File([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0])], "photo.jpg", { type: "image/jpeg" });
const lu = { reference: null, periode_debut: null, periode_fin: null, total: null, frais_fixes: null, frais_gestion: null, consommation: null, date_echeance: null, index: "123.45", numero_compteur: "ABC", avertissements: [] };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("indique la connexion manquante sans appel ni faux résultat", async () => {
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPEN_AI_KEY", ""); const avant = vi.fn();
  await expect(lireDocumentIA(jpeg(), "compteur", avant)).rejects.toThrow(/pas activée/); expect(avant).not.toHaveBeenCalled();
});
it("n’envoie pas le fichier si la limite bloque l’appel", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-local"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(lireDocumentIA(jpeg(), "compteur", async () => { throw new Error("limite"); })).rejects.toThrow("limite"); expect(fetch).not.toHaveBeenCalled();
});
it("envoie uniquement le fichier choisi, sans stockage et sans outil d’action", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-local"); const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(lu) }] }] }) }); vi.stubGlobal("fetch", fetch);
  expect(await lireDocumentIA(jpeg(), "compteur", async () => {})).toMatchObject({ index: "123.45" });
  const body = JSON.parse(fetch.mock.calls[0][1].body); expect(body.store).toBe(false); expect(body.tools).toBeUndefined(); expect(body.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
});
it("ne conserve pas une date impossible ni un index négatif proposés par l’IA", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-local"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ ...lu, periode_debut: "2026-02-30", index: "-12" }) }] }] }) }));
  expect(await lireDocumentIA(jpeg(), "facture", async () => {})).toMatchObject({ index: null, periode_debut: null });
});
