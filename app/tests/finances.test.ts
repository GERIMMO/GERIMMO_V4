import { describe, it, expect, vi } from "vitest";
import { resumerLivre, lireLivreFinances, type EcritureFinances } from "@/lib/finances";
import type { SupabaseClient } from "@supabase/supabase-js";
const ligne = (id: string, extra: Partial<EcritureFinances> = {}): EcritureFinances => ({ id, categorie:"loyer", sens:"recette", montant:100, date_imputation:"2026-10-01", libelle:null, lot_id:"lot-a", contre_ecriture_de:null, ...extra });
describe("Résumé Finances", () => {
  it("exclut les dépôts et les paires annulées, même sur une autre année", () => {
    const r = resumerLivre([ligne("a"),ligne("b",{categorie:"depot_garantie"}),ligne("c"),ligne("d",{contre_ecriture_de:"c",date_imputation:"2027-01-01",sens:"depense"}),ligne("e",{sens:"depense",montant:30})],2026,null);
    expect(r.recettes).toBe(100); expect(r.depenses).toBe(30); expect(r.lignes.map(e=>e.id)).toEqual(["a","e"]);
  });
  it("respecte l’année et les lots du bien, y compris un bien sans lot", () => {
    const lignes=[ligne("a"),ligne("b",{lot_id:"lot-b"}),ligne("c",{date_imputation:"2025-01-01"}),ligne("d",{lot_id:null})];
    expect(resumerLivre(lignes,2026,new Set(["lot-a"])).recettes).toBe(100);
    expect(resumerLivre(lignes,2026,new Set()).recettes).toBe(0);
    expect(resumerLivre(lignes,2026,null).recettes).toBe(300);
  });
  it("lit au-delà de la première page et refuse un total partiel en cas d’erreur", async () => {
    const range=vi.fn().mockResolvedValueOnce({data:Array.from({length:500},(_,i)=>ligne(String(i))),error:null}).mockResolvedValueOnce({data:[ligne("dernier")],error:null});
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range};
    const client={from:vi.fn(()=>query)} as unknown as SupabaseClient;
    expect((await lireLivreFinances(client,"org")).lignes).toHaveLength(501);
    expect(range).toHaveBeenLastCalledWith(500,999);
    range.mockResolvedValueOnce({data:[],error:{message:"indisponible"}});
    expect((await lireLivreFinances(client,"org")).error).toBeTruthy();
  });
});
