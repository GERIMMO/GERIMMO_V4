import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detailRapportGestion, syntheseOperations } from "@/lib/documents/modeles/detail-rapport-gestion";
import { Fusion } from "@/lib/documents/gabarit";

describe("Rapport de gestion par bien", () => {
  it("calcule le net sur les seules écritures et arrondit en centimes", () => {
    expect(syntheseOperations([{sens:"recette",montant:0.1},{sens:"recette",montant:0.2},{sens:"depense",montant:0.03}])).toEqual({recettes:0.3,depenses:0.03,net:0.27});
  });
  it("sépare recettes, dépenses, impayés et incidents, sans ajouter les impayés au net", async () => {
    const tables:Record<string,Record<string,unknown>[]> = {
      biens:[{id:"bien",nom:"Maison <test>",address_line1:"Rue du Parc"}],
      baux:[{id:"bail",lot_id:"lot"}],
      incidents:[{lot_id:"lot",numero:"INC-01",description:"Robinet",etat:"en_cours"}],
      etat_loyers_bail:[{periode:"2026-08-01",montant_du:500,montant_couvert:200},{periode:"2027-01-01",montant_du:1000,montant_couvert:0}],
    };
    const query=(table:string)=>{
      const q={select:()=>q,eq:()=>q,in:()=>q,is:()=>q,lt:()=>q,order:()=>q,then:(resoudre:(r:unknown)=>unknown)=>Promise.resolve({data:tables[table]??[],error:null}).then(resoudre)};
      return q;
    };
    const html=await detailRapportGestion({from:query,rpc:query} as unknown as SupabaseClient,"org",new Fusion(),
      [{id:"lot",nom:"Studio",bien_id:"bien"}],[{lot_id:"lot",date_debut:"2026-01-01",taux_honoraires:7}],
      [{lot_id:"lot",sens:"recette",montant:200},{lot_id:"lot",sens:"depense",montant:14,categorie:"honoraires"}],"2026-08-01","2026-09-01");
    expect(html).toContain("Récapitulatif consolidé"); expect(html).toContain('class="saut"');
    expect(html).toContain("Maison &lt;test&gt;"); expect(html).toContain("186,00"); expect(html).toContain("300,00");
    expect(html).not.toContain("1 000,00"); expect(html).toContain("Robinet"); expect(html).toContain("ne sont pas comptées dans le net");
    expect(html).toContain("Annexe — détail des écritures");
  });
});
