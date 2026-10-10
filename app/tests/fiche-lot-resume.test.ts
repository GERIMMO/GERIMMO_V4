import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mock }));
vi.mock("@/lib/rapports-mensuels", () => ({ remettreRapportMensuel: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { chargerFicheLot } from "@/app/actions/fiche-lot";
const donnees: Record<string, unknown[]> = {};
let erreurTable: string | null;
function init(portee: string | null) {
  mock.rpc.mockImplementation(async (nom: string) => ({ data: nom === "fiche_lot" ? (portee ? [{ portee, bail_id: "b1", lot_id: "lot" }] : []) : nom === "contrats_du_lot" ? [] : null, error: null }));
}
beforeEach(() => {
  vi.clearAllMocks(); erreurTable = null;
  donnees.baux = [{ id: "b1", locataire_principal: "p", date_debut: "2026-01-01", date_fin: "2029-01-01", loyer_hc: 700, charges: 80 }];
  donnees.bail_personnes = [
    { bail_id: "b1", person_id: "p", role: "colocataire", garant_de: null, date_depart: null },
    { bail_id: "b1", person_id: "c", role: "colocataire", garant_de: null, date_depart: null },
    { bail_id: "b1", person_id: "g1", role: "garant", garant_de: "p", date_depart: null },
    { bail_id: "b1", person_id: "g2", role: "garant", garant_de: "c", date_depart: null },
  ];
  donnees.persons = ["p", "c", "g1", "g2"].map(id => ({ id, nom: id, prenom: "Test", date_naissance: "1990-01-01", telephone: "0600000000" }));
  donnees.diagnostics = [{ classe_dpe: "C", date_realisation: "2025-01-01", date_expiration: "2035-01-01" }];
  mock.from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order", "limit"]) q[method] = vi.fn(() => q);
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: donnees[table], error: table === erreurTable ? { message: "Erreur de lecture" } : null }).then(resolve);
    return q;
  });
});
describe("Lecture du résumé du lot", () => {
  it("ne lit aucune identité supplémentaire pour un locataire", async () => {
    init("locataire"); const r = await chargerFicheLot("lot");
    expect(mock.from).not.toHaveBeenCalled();
    expect(r.donnees?.details_resume).toBeUndefined();
  });
  it("ne lit aucune identité lorsque la RPC refuse le lot", async () => {
    init(null); expect((await chargerFicheLot("lot")).erreur).toBeTruthy();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("renvoie deux locataires, deux garants, le DPE et les montants réels", async () => {
    init("gerant"); const r = (await chargerFicheLot("lot")).donnees!;
    expect(r.details_resume?.locataires).toHaveLength(2);
    expect(r.details_resume?.garants).toHaveLength(2);
    expect(r.details_resume?.garants[1].personne?.date_naissance).toBe("1990-01-01");
    expect(r.details_resume?.dpe?.classe_dpe).toBe("C");
    expect(r.details_resume?.baux[0]).toMatchObject({ loyer_hc: 700, charges: 80, date_debut: "2026-01-01", date_fin: "2029-01-01" });
  });
  it("signale une erreur de lecture au lieu de déclarer qu’il n’y a aucun garant", async () => {
    init("gerant"); erreurTable = "bail_personnes";
    const r = (await chargerFicheLot("lot")).donnees!;
    expect(r.erreur_resume).toBeTruthy(); expect(r.details_resume).toBeUndefined();
  });
});
