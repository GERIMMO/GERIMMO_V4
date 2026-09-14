import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { chargerCiblesCatalogue } from "@/lib/documents/catalogue-cibles";
import { MODELES, type CodeModele } from "@/lib/documents/modeles";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
describe.skipIf(!url||!key)("Catalogue — lecture réelle par l’API et les droits d’accès",()=>{
  let db:SupabaseClient,orgId:string;
  beforeAll(async()=>{
    db=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await db.auth.signInWithPassword({email:process.env.TEST_ADMIN_A??"admin.alpha@gerimmo-demo.fr",password:process.env.TEST_MOT_DE_PASSE??"Gerimmo-Demo-2026"});expect(error).toBeNull();
    const org=await db.from("memberships").select("organization_id").eq("account_id",data.user!.id).eq("role","admin_agence").eq("status","active").limit(1).single();expect(org.error).toBeNull();orgId=org.data!.organization_id;
  });
  afterAll(async()=>{await db?.auth.signOut();});
  it.each(CATALOGUE_DOCUMENTS.filter(m=>Object.hasOwn(MODELES,m.code)))("charge les dossiers compatibles : $nom",async modele=>{
    const cibles=await chargerCiblesCatalogue(db,orgId,modele);
    expect(cibles.choix.length).toBeLessThanOrEqual(50);
    // Lecture seule : l’assemblage ne dépose et n’envoie aucun document.
    if(cibles.choix.length){
      const r=await MODELES[modele.code as CodeModele].assembler(db,orgId,cibles.choix[0].id,{annee:"2026",mois:"2026-01",delai:"15",mensualites:"3",premiere_echeance:"2026-10-01"});
      if("erreur" in r) expect(r.erreur).not.toMatch(/données du dossier n’ont pas pu être chargées/);
      else expect(r.document.html).not.toMatch(/NaN|Invalid Date/);
    }
  });
  it("ne propose aucun dossier d’une organisation étrangère",async()=>{
    const r=await chargerCiblesCatalogue(db,"00000000-0000-0000-0000-000000000000",CATALOGUE_DOCUMENTS[0]);expect(r.choix).toEqual([]);
  });
});
