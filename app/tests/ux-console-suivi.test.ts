import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VueTraitementsDurables } from "../src/app/admin/sante/vue-traitements-durables";
const props={pilote:true,chiffrement:true,indisponible:false,factures:[],courriels:[],intentions:[]};
const courrier={id:"fictif",organization_id:"organisation-fictive",etat:"inconnu",tentatives:1,updated_at:"2026-11-18T12:00:00Z",expire_le:null,circuit:"confirmation-abonnement",finalisation_etat:"a_verifier",reprise_autonome:false,motif:"Preuve à vérifier"};
describe("Suivi : absence d’invention et conservation des preuves",()=>{
 it("une lecture impossible ne devient pas une file vide saine",()=>{
  const html=renderToStaticMarkup(createElement(VueTraitementsDurables,{...props,indisponible:true}));
  expect(html).toContain("Impossible de confirmer l’absence de blocage");expect(html).not.toContain("Aucun courriel bloqué");
 });
 it("conserve l’incertitude, les motifs et toutes les références sous un détail",()=>{
  const donnees=structuredClone(courrier),html=renderToStaticMarkup(createElement(VueTraitementsDurables,{...props,courriels:[donnees]}));
  expect(html).toContain("1 courriel bloqué ou à vérifier");expect(html).toContain("Ne pas renvoyer sans preuve");expect(html).toContain("Confirmation d’abonnement");expect(html).toContain("Preuve à vérifier");expect(html).toContain("organisation-fictive");expect(html).toContain("L’enregistrement du résultat de 1 courriel reste à vérifier");expect(donnees).toEqual(courrier);
 });
 it("précise la limite de lecture et ne présente pas les 50 lignes comme un total exact",()=>{
  const html=renderToStaticMarkup(createElement(VueTraitementsDurables,{...props,courriels:Array.from({length:50},(_,i)=>({...courrier,id:String(i)}))}));
  expect(html).toContain("Au moins 50");expect(html).toContain("50 premiers éléments");
 });
 it("garde les erreurs de factures, notifications et chiffrement visibles avant les détails",()=>{
  const html=renderToStaticMarkup(createElement(VueTraitementsDurables,{...props,chiffrement:false,factures:[{id:"f",organization_id:"o",etat:"echec",tentatives:1,dernier_resultat:"Refus",disponible_le:"2026-11-18"}],intentions:[{id:"n",organization_id:"o",etat:"a_verifier",tentatives:1,evenement:"test",motif:"À vérifier"}]}));
  const principal=html.split("<details")[0];expect(principal).toContain("Les nouveaux envois ponctuels sont bloqués");expect(principal).toContain("1 facture nécessite une vérification");expect(principal).toContain("1 notification nécessite une vérification");
 });
});
const {session}=vi.hoisted(()=>({session:{rpc:vi.fn(),from:vi.fn()}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>session}));
import TraitementsDurables from "../src/app/admin/sante/traitements-durables";
describe("La présentation conserve le contrôle d’accès existant",()=>{
 it.each([{data:false,error:null},{data:null,error:{message:"lecture refusée"}}])("refuse une session sans autorisation explicite",async retour=>{
  vi.clearAllMocks();session.rpc.mockResolvedValue(retour);expect(await TraitementsDurables()).toBeNull();expect(session.rpc).toHaveBeenCalledWith("is_super_admin");expect(session.from).not.toHaveBeenCalled();
 });
});
