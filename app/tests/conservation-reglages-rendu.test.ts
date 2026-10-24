import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DureesActuelles, ReferenceConservation } from "@/components/conservation-publique";
import { effetConservation, dureeConservation } from "@/lib/conservation-reglages";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc})}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { modifierDureeConservation } from "@/app/actions/retention";
const regle={data_type:"archive:facture",libelle:"Factures archivées",declencheur:"Fin de l’exercice",duree_mois:96,duree_initiale_mois:72,actif:true,sort:"suppression",updated_at:"2026-10-24"};
describe("durées publiques et action superadmin",()=>{
 it("affiche la valeur actuelle et la portée, sans identité ni motif",()=>{const html=renderToStaticMarkup(h(DureesActuelles,{regles:[regle],indisponible:false}));expect(html).toContain("8 ans");expect(html).toContain("prochaines archives");expect(html).not.toContain("6 ans");});
 it("annonce un catalogue indisponible, sans faire passer la référence pour une valeur actuelle",()=>{expect(renderToStaticMarkup(h(DureesActuelles,{regles:[],indisponible:true}))).toContain("momentanément indisponibles");expect(renderToStaticMarkup(h(ReferenceConservation,{modifiee:true,children:"Référence"}))).toContain("<details>");});
 it("ne promet aucun nettoyage pour une règle désactivée",()=>{expect(effetConservation({...regle,actif:false})).toContain("reste désactivé");expect(dureeConservation(0)).toBe("Immédiate");expect(dureeConservation(12)).toBe("1 an");expect(dureeConservation(15)).toBe("15 mois");});
 const input={categorie:"archive:facture",mois:96,revision:2,motif:"Durée décidée pour la recette",confirme:true};
 it("refuse l’accès ou l’absence de confirmation avant toute écriture",async()=>{
   mocks.rpc.mockReset().mockResolvedValue({data:false});expect((await modifierDureeConservation(input)).erreur).toContain("second facteur");expect(mocks.rpc).toHaveBeenCalledTimes(1);
   mocks.rpc.mockReset().mockResolvedValue({data:true});expect((await modifierDureeConservation({...input,confirme:false})).erreur).toContain("confirmation");expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it("traite une révision périmée sans annoncer de succès ni rafraîchir les pages",async()=>{mocks.revalidate.mockClear();mocks.rpc.mockReset().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({error:{code:"40001"}});expect((await modifierDureeConservation(input)).erreur).toContain("autre session");expect(mocks.revalidate).not.toHaveBeenCalled();});
 it("transmet la révision et ne rafraîchit les durées publiques qu’après confirmation de la base",async()=>{mocks.rpc.mockReset().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:{modifiee:true}});expect(await modifierDureeConservation(input)).toEqual({});expect(mocks.rpc).toHaveBeenLastCalledWith("modifier_duree_conservation",{p_categorie:input.categorie,p_duree_mois:96,p_revision:2,p_motif:input.motif});expect(mocks.revalidate).toHaveBeenCalledWith("/confidentialite");});
});
