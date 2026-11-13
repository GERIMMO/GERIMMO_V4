import { beforeEach,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const calcul=vi.fn(),pdf=vi.fn();
vi.mock("../src/lib/calcul-facture-existant",()=>({calculerFactureExistante:(...p:unknown[])=>calcul(...p)}));
vi.mock("../src/lib/pdf-facture-existant",()=>({preparerPdfFactureExistant:(...p:unknown[])=>pdf(...p)}));
import { traiterFactureAutomatique } from "../src/lib/automatisation-factures";
function base(categorie="eau",manquant=false,validee=false){
 const appels:{geste:string;args:Record<string,unknown>}[]=[];
 const tables:Record<string,unknown[]>={
  repartitions_fourniture:validee?[{id:"rep",statut:"validee",lignes:[{bail_id:"bail",recuperable:true}]}]:[],
  factures_fourniture:[{id:"f",contrat_id:"c",periode_debut:"2026-10-01",periode_fin:"2026-10-31"}],
  contrats_fourniture:[{id:"c",bien_id:"bien",lot_id:null,categorie}],
  lots:[{id:"a",nom:"A"},{id:"b",nom:"B"}],
  baux:[{id:"bail",lot_id:"a",date_debut:"2026-01-01",date_fin:null,charges_mode:"provision",etat:"actif"}],
  compteurs_consommation:["a","b"].map(id=>({id,lot_id:id,type:"eau_froide",unite:"m3",actif:true,date_index_initial:"2026-10-01",index_initial:100})),
  releves_consommation:manquant?[]:["a","b"].map(id=>({id,compteur_id:id,date_releve:"2026-10-31",index_releve:120})),
 };
 const db={from(nom:string){const lignes=tables[nom]??[];const q:unknown=new Proxy({}, {get(_t,k){if(k==="then")return (f:(v:unknown)=>unknown)=>Promise.resolve({data:lignes,count:lignes.length,error:null}).then(f);if(k==="single"||k==="maybeSingle")return async()=>({data:lignes[0]??null,error:null});return ()=>q;}});return q;},async rpc(_n:string,p:{p_geste:string;p_args:Record<string,unknown>}){appels.push({geste:p.p_geste,args:p.p_args});return {data:true,error:null};}} as unknown as SupabaseClient;
 return {db,appels,tables};
}
beforeEach(()=>{calcul.mockReset();pdf.mockReset();calcul.mockResolvedValue({repartition:{id:"rep",empreinte:"hash",lignes:[{bail_id:"bail",recuperable:true},{bail_id:null,recuperable:false}]}});pdf.mockResolvedValue({documentId:"doc"});});
it("prépare les montants et attend la décision explicite avant validation ou partage",async()=>{
 const {db,appels}=base();expect((await traiterFactureAutomatique(db,"org","f")).etat).toBe("a_verifier");
 expect(pdf).not.toHaveBeenCalled();expect(appels.map(a=>a.geste)).toEqual(["controle","suivi"]);
});
it("demande les index manquants et reprend après leur réception",async()=>{
 const attente=base("eau",true);expect((await traiterFactureAutomatique(attente.db,"org","f")).etat).toBe("releves_attendus");
 expect(attente.appels.filter(a=>a.geste==="demander_index_facture")).toHaveLength(2);expect(calcul).not.toHaveBeenCalled();expect(pdf).not.toHaveBeenCalled();
 const pret=base();expect((await traiterFactureAutomatique(pret.db,"org","f")).etat).toBe("a_verifier");
});
it("une prestation ambiguë ou un calcul refusé ne produit aucun partage",async()=>{
 const entretien=base("entretien");expect((await traiterFactureAutomatique(entretien.db,"org","f")).etat).toBe("a_verifier");expect(calcul).not.toHaveBeenCalled();
 calcul.mockResolvedValue({erreur:"Index incohérent"});const r=base();expect((await traiterFactureAutomatique(r.db,"org","f")).etat).toBe("a_verifier");expect(pdf).not.toHaveBeenCalled();expect(r.appels.some(a=>a.geste==="diffuser_pdf_repartition")).toBe(false);
});
it("un PDF indisponible laisse une action au propriétaire sans faux succès d’envoi",async()=>{
 pdf.mockResolvedValue({erreur:"Identité à compléter"});const {db,appels}=base("eau",false,true);expect((await traiterFactureAutomatique(db,"org","f")).etat).toBe("a_verifier");expect(appels.some(a=>a.geste==="diffuser_pdf_repartition")).toBe(false);
});
it('100 factures fictives : dossiers complets et index tardifs, calcul et PDF une fois par traitement',async()=>{
 const debut=performance.now();let terminees=0,attentes=0;
 for(let i=0;i<100;i++){
  const manquant=i%10===0;const {db}=base('eau',manquant);
  const r=await traiterFactureAutomatique(db,`proprietaire-${i%5}`,`facture-${i}`,async()=>{},`jeton-${i}`);
  if(r.etat==='a_verifier')terminees++;else if(r.etat==='releves_attendus')attentes++;
 }
 expect([terminees,attentes]).toEqual([90,10]);expect(calcul).toHaveBeenCalledTimes(90);expect(pdf).not.toHaveBeenCalled();
 for(let i=0;i<10;i++)expect((await traiterFactureAutomatique(base().db,`proprietaire-${i%5}`,`attente-${i}`,async()=>{},`jeton-reprise-${i}`)).etat).toBe('a_verifier');
 for(let i=0;i<100;i++){const {db,appels}=base('eau',false,true);expect((await traiterFactureAutomatique(db,'org','f')).etat).toBe('terminee');expect(appels.some(a=>a.geste==='diffuser_pdf_repartition')).toBe(false);}
 expect(calcul).toHaveBeenCalledTimes(100);expect(pdf).toHaveBeenCalledTimes(100);
 expect(performance.now()-debut).toBeLessThan(300000);
});

it("calcule une facture ancienne avec les index de son compteur arrêté", async () => {
  const { db, tables, appels } = base();
  tables.compteurs_consommation = tables.compteurs_consommation.map(m => ({ ...(m as object), actif: false }));
  await traiterFactureAutomatique(db, "org", "f");
  expect(calcul).toHaveBeenCalledOnce();
  expect(appels.some(a => a.geste === "demander_index_facture")).toBe(false);
});

it("une ancienne colocation terminée avant la facture ne demande pas de clé entre chambres", async () => {
  const { db, tables } = base();
  tables.baux.push({ id: "ancien", lot_id: "a", chambre_id: "ancienne-chambre", date_debut: "2024-01-01", date_fin: "2024-10-01", charges_mode: "provision", etat: "termine" });
  await traiterFactureAutomatique(db, "org", "f");
  expect(calcul).toHaveBeenCalledOnce();
});

it("attend la date du relevé futur sans annoncer une demande déjà transmise", async () => {
  const { db, tables, appels } = base("eau", true);
  tables.factures_fourniture = [{ id: "f", contrat_id: "c", periode_debut: "2026-10-01", periode_fin: "2099-10-31" }];
  const resultat = await traiterFactureAutomatique(db, "org", "f");
  expect(resultat.etat).toBe("releves_attendus");
  expect(resultat.detail).toContain("31/10/2099");
  expect(resultat.detail).not.toContain("aux locataires");
  expect(appels.some(a => a.geste === "demander_index_facture")).toBe(false);
  expect(calcul).not.toHaveBeenCalled();
});

it.each([
  ["baisse intermédiaire", "m3", 130, /décroissant/i],
  ["unité de facture différente", "kwh", 110, /unité/i],
] as const)("refuse le calcul manuel avant toute écriture pour un compteur autonome : %s", async (_cas, unite, index, message) => {
  const { calculerFactureExistante } = await vi.importActual<typeof import("../src/lib/calcul-facture-existant")>("../src/lib/calcul-facture-existant");
  const { db, tables, appels } = base();
  tables.factures_fourniture = [{ id: "f", contrat_id: "c", periode_debut: "2026-10-01", periode_fin: "2026-10-31", unite_consommation: unite, frais_fixes_cents: 0 }];
  tables.releves_consommation.push({ id: "intermediaire", compteur_id: "a", date_releve: "2026-10-15", index_releve: index });
  const formulaire = new FormData();
  formulaire.set("mode", "consommations");
  const resultat = await calculerFactureExistante(db, "org", "f", formulaire);
  expect(resultat.erreur).toMatch(message);
  expect(appels).toHaveLength(0);
});
