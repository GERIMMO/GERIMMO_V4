import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerBauxActifsDuParc, chargerChambresDuParc, chargerPatrimoineDuParc, verifierLectureDuParc, totalLoyersDuParc } from "@/lib/locations-parc";

describe("Les loyers du parc suivent uniquement ses lots visibles", () => {
  const connus = new Set(["visible"]);
  it("écarte les archives et additionne les centimes sans arrondi cumulatif", () => {
    expect(totalLoyersDuParc([
      { lot_id: "visible", loyer_hc: "0.10", charges: "0.20" },
      { lot_id: "visible", loyer_hc: "100.29", charges: 0 },
      { lot_id: "lot-archive", loyer_hc: 999, charges: 10 },
      { lot_id: "bien-archive", loyer_hc: null, charges: null },
    ], connus)).toBe(100.59);
    expect(totalLoyersDuParc([], connus)).toBe(0);
  });
  it.each([null, "", "inconnu", "Infinity", -1, 0.004, 100_000_000_000_000])("un montant %s ne devient pas un total rassurant", loyer_hc => {
    expect(totalLoyersDuParc([{ lot_id: "visible", loyer_hc, charges: 10 }], connus)).toBeNull();
  });
});

type Ligne = { id: string; organization_id: string; etat?: string; [cle: string]: unknown };
function client(tables: Record<string, Ligne[]>, erreurTable?: string) {
  const lectures: { table: string; compte?: string; ordre?: string; debut?: number; org?: string; etats?: string[] }[] = [];
  return { lectures, db: { from(table: string) {
    const lecture: typeof lectures[number] = { table }; lectures.push(lecture);
    const q = {
      select(_champs: string, config?: { count: string }) { lecture.compte = config?.count; return q; },
      eq(_champ: string, valeur: string) { lecture.org = valeur; return q; },
      in(_champ: string, valeurs: string[]) { lecture.etats = valeurs; return q; },
      order(champ: string) { lecture.ordre = champ; return q; },
      range(debut: number) { lecture.debut = debut; return q; },
      then<R>(resolve: (valeur: { data: Ligne[] | null; count: number; error: { message: string } | null }) => R, reject?: (e: unknown) => R) {
        const lignes = tables[table].filter(l => l.organization_id === lecture.org && (!lecture.etats || lecture.etats.includes(l.etat!))).sort((a, b) => a.id.localeCompare(b.id));
        const erreur = table === erreurTable && (lecture.debut ?? 0) > 0;
        return Promise.resolve({ data: erreur ? null : lignes.slice(lecture.debut ?? 0, (lecture.debut ?? 0) + 333), count: lignes.length, error: erreur ? { message: "Seconde page refusée" } : null }).then(resolve, reject);
      },
    }; return q;
  } } as unknown as SupabaseClient };
}
const lignes = () => Array.from({ length: 1001 }, (_, n) => ({ id: `id-${String(n).padStart(4, "0")}`, organization_id: "org", etat: n % 2 ? "preavis" : "actif" }));

describe("Les locations du parc sont lues entièrement", () => {
  it("lit plus de 1000 contrats et chambres malgré un plafond de 333, avec portée et ordre stables", async () => {
    const baux = [...lignes(), { id: "autre-org", organization_id: "autre", etat: "actif" }, { id: "termine", organization_id: "org", etat: "termine" }];
    const { db, lectures } = client({ baux, lot_chambres: lignes() });
    const resultats = await Promise.all([chargerBauxActifsDuParc(db, "org"), chargerChambresDuParc(db, "org")]);
    for (const r of resultats) { expect(r.error).toBeNull(); expect(r.data).toHaveLength(1001); }
    for (const table of ["baux", "lot_chambres"]) expect(lectures.filter(l => l.table === table).map(l => l.debut)).toEqual([0, 333, 666, 999]);
    for (const lecture of lectures) expect(lecture).toMatchObject({ compte: "exact", ordre: "id", org: "org" });
  });
  it.each(["baux", "lot_chambres"])("ne livre aucune donnée partielle après un refus dans %s", async table => {
    const { db } = client({ baux: lignes(), lot_chambres: lignes() }, table);
    const resultat = table === "baux" ? await chargerBauxActifsDuParc(db, "org") : await chargerChambresDuParc(db, "org");
    expect(resultat.data).toBeNull(); expect(resultat.error).toMatchObject({ motif: "erreur" });
  });
});


describe("Patrimoine propriétaire : biens et lots indépendamment complets", () => {
  it("reconstruit 1001 biens et 1001 lots dans un même bien sans plafonner la jointure", async () => {
    const tables = { biens: lignes().map(b => ({ ...b, nom: b.id })), lots: lignes().map(l => ({ ...l, bien_id: "id-0000" })) };
    const { db, lectures } = client(tables);
    const resultat = await chargerPatrimoineDuParc(db, "org");
    expect(resultat.error).toBeNull(); expect(resultat.data).toHaveLength(1001);
    expect(resultat.data![0].lots).toHaveLength(1001);
    expect(resultat.data!.slice(1).every(b => b.lots.length === 0)).toBe(true);
    for (const table of ["biens", "lots"]) expect(lectures.filter(l => l.table === table).map(l => l.debut)).toEqual([0, 333, 666, 999]);
  });
  it("ne transforme pas une lecture refusée des lots en biens vides", async () => {
    const { db } = client({ biens: lignes(), lots: lignes() }, "lots");
    const resultat = await chargerPatrimoineDuParc(db, "org");
    expect(resultat.data).toBeNull(); expect(resultat.error).toMatchObject({ motif: "erreur" });
  });
  it.each([null, 1001])("invalide une complétude sans compte fiable (%s) au lieu de produire de faux manquants", async count => {
    const retour = await verifierLectureDuParc(Promise.resolve({ data: [{ id: "a" }], error: null, count }));
    expect(retour.data).toBeNull(); expect(retour.error).not.toBeNull();
  });
  it("conserve une lecture complète et le comportement agence", async () => {
    const lignes = [{ id: "a" }];
    expect((await verifierLectureDuParc(Promise.resolve({ data: lignes, error: null, count: 1 }))).data).toEqual(lignes);
    expect((await verifierLectureDuParc(Promise.resolve({ data: lignes, error: null, count: null }), false)).data).toEqual(lignes);
  });
});
