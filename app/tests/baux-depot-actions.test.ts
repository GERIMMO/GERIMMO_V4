import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerBail, modifierBail } from "@/app/actions/baux";

const mocks = vi.hoisted(() => ({ acces: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: mocks.acces }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

function client({ meuble = true, lotAbsent = false, erreurLot = false, etat = "brouillon", user = true } = {}) {
  const insert = vi.fn();
  const update = vi.fn();
  const filtres: [string, unknown][] = [];
  const from = vi.fn((table: string) => {
    let ecriture = false;
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn((cle: string, valeur: unknown) => { filtres.push([`${table}.${cle}`, valeur]); return q; }),
      insert: vi.fn((valeur: unknown) => { insert(valeur); ecriture = true; return q; }),
      update: vi.fn((valeur: unknown) => { update(valeur); ecriture = true; return q; }),
      maybeSingle: vi.fn(async () => ({
        data: table === "lots" ? lotAbsent ? null : { meuble } : { etat, lot_id: "lot-autorise" },
        error: table === "lots" && erreurLot ? { message: "indisponible" } : null,
      })),
      single: vi.fn(async () => ({ data: { id: "bail" }, error: null })),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: ecriture ? [{ id: "bail" }] : [], error: null }).then(resolve),
    };
    return q;
  });
  mocks.acces.mockResolvedValue({ supabase: { from }, user: user ? { id: "agent" } : null });
  return { from, insert, update, filtres };
}
function donnees(type = "colocation", depot = "1400") {
  const fd = new FormData();
  Object.entries({ type, depot_garantie: depot, loyer_hc: "700", charges: "100", locataire_principal: "locataire", meuble: "true", lot_id: "lot-injecte" })
    .forEach(([k, v]) => fd.set(k, v));
  return fd;
}
beforeEach(() => vi.clearAllMocks());

describe("dépôt du bail : contrôle serveur du logement", () => {
  it("crée une colocation meublée à deux mois HC sur le lot autorisé", async () => {
    const c = client();
    expect(await creerBail("agence", "lot-autorise", "bien", {}, donnees())).toEqual({ succes: "Brouillon créé.", bailCree: "bail" });
    expect(c.filtres).toContainEqual(["lots.id", "lot-autorise"]);
    expect(c.filtres).toContainEqual(["lots.organization_id", "agence"]);
    expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({ lot_id: "lot-autorise", depot_garantie: 1400, etat: "brouillon" }));
  });
  it("refuse le dépassement d'une colocation nue malgré le drapeau meublé du navigateur", async () => {
    const c = client({ meuble: false });
    const retour = await creerBail("agence", "lot-autorise", "bien", {}, donnees());
    expect(retour.erreur).toMatch(/1 mois/);
    expect(retour.valeurs?.depot_garantie).toBe("1400");
    expect(c.insert).not.toHaveBeenCalled();
  });
  it.each([{ lotAbsent: true }, { erreurLot: true }])("ne crée rien si le logement est inaccessible : %j", async (options) => {
    const c = client(options);
    expect((await creerBail("agence", "lot-autorise", "bien", {}, donnees())).erreur).toMatch(/ne peut pas être vérifié/);
    expect(c.insert).not.toHaveBeenCalled();
  });
  it("garde le plafond d'un bail explicitement nu à un mois hors charges", async () => {
    const c = client();
    expect((await creerBail("agence", "lot-autorise", "bien", {}, donnees("nu", "701"))).erreur).toMatch(/1 mois/);
    expect(c.from).not.toHaveBeenCalled();
    expect(c.insert).not.toHaveBeenCalled();
  });
  it("corrige le brouillon sur son logement enregistré et garde la garde de concurrence", async () => {
    const c = client();
    expect(await modifierBail("agence", "bail", {}, donnees())).toHaveProperty("succes");
    expect(c.filtres).toContainEqual(["lots.id", "lot-autorise"]);
    expect(c.filtres).toContainEqual(["lots.organization_id", "agence"]);
    expect(c.filtres).toContainEqual(["baux.etat", "brouillon"]);
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ depot_garantie: 1400 }));
    expect(c.update.mock.calls[0][0]).not.toHaveProperty("lot_id");
  });
  it("refuse le dépassement aussi à la correction", async () => {
    const c = client({ meuble: false });
    expect(await modifierBail("agence", "bail", {}, donnees())).toHaveProperty("erreur");
    expect(c.update).not.toHaveBeenCalled();
  });
  it("ne touche pas un bail actif et ne crée pas de locataire à cette occasion", async () => {
    const c = client({ etat: "actif" });
    const fd = donnees(); fd.set("locataire_principal", "nouvelle");
    expect((await modifierBail("agence", "bail", {}, fd)).erreur).toMatch(/brouillon/);
    expect(c.from.mock.calls.map(([table]) => table)).toEqual(["baux"]);
    expect(c.insert).not.toHaveBeenCalled();
    expect(c.update).not.toHaveBeenCalled();
  });
  it("refuse une session non autorisée avant la lecture du logement", async () => {
    const c = client({ user: false });
    expect(await creerBail("agence", "lot-autorise", "bien", {}, donnees())).toEqual({ erreur: "Accès refusé." });
    expect(c.from).not.toHaveBeenCalled();
  });
});
