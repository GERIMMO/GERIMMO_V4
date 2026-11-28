import { expect, it, vi } from "vitest";
import { importerParc } from "@/app/actions/import-parc";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    supabase: { rpc },
    user: { id: "fictif" },
    role: "proprietaire_direct",
  }),
}));

it("repère deux doublons sur 100 biens et conserve la correction avant validation", async () => {
  rpc.mockImplementation(async (_nom, { p_lignes }) => ({
    data: p_lignes.map((_: unknown, i: number) => ({ ligne: i + 1, statut: "ok" })),
  }));
  const entete = "bien;type;adresse;code_postal;ville;lot;proprietaire_nom";
  const biens = Array.from({ length: 100 }, (_, i) =>
    `Bien ${i + 1};appartement;${i + 1} rue Fictive;75001;Paris;Logement;Martin`
  );
  const depot = new FormData();
  depot.set("contenu", [entete, ...biens, biens[9], biens[23]].join("\n"));
  const apercu = await importerParc("fictif", {}, depot);
  expect(rpc.mock.calls[0][1].p_controle_seulement).toBe(true);
  expect(apercu.resultats?.slice(-2)).toEqual([
    expect.objectContaining({ ligne: 101, statut: "doublon", message: expect.stringContaining("10") }),
    expect.objectContaining({ ligne: 102, statut: "doublon", message: expect.stringContaining("24") }),
  ]);

  depot.set("corriger", "100");
  depot.set("correction-adresse", '100 rue "Épreuve"; bâtiment A');
  const correction = await importerParc("fictif", apercu, depot);
  expect(rpc.mock.calls[1][1].p_controle_seulement).toBe(true);
  expect(correction.lignes?.[99].adresse).toBe('100 rue "Épreuve"; bâtiment A');

  const confirmation = new FormData();
  confirmation.set("contenu", correction.contenu!);
  confirmation.set("bascule", "1");
  await importerParc("fictif", correction, confirmation);
  const { p_lignes, p_controle_seulement } = rpc.mock.calls[2][1];
  expect(p_controle_seulement).toBe(false);
  expect(p_lignes).toHaveLength(100);
  expect(p_lignes[99].adresse).toBe('100 rue "Épreuve"; bâtiment A');
});
