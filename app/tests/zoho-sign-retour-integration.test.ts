import { createHash, createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/zoho-sign/webhook/route";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";

const reception = vi.hoisted(()=>({tasks:[] as (()=>Promise<void>)[]}));
vi.mock("next/server",()=>({after:(task:()=>Promise<void>)=>reception.tasks.push(task)}));
async function recevoir(request:Request) {
  const response=await POST(request);
  for (const task of reception.tasks.splice(0)) await task();
  return response;
}

// Banc facultatif : vraie base et stockage local, fournisseur simulé. Aucune
// requête vers Zoho, aucun compte permanent, aucune base distante autorisée.
const dbUrl = process.env.SIGNATURE_TEST_DB_URL ?? process.env.SUPABASE_DB_URL;
const apiUrl = process.env.SIGNATURE_TEST_API_URL;
if (apiUrl && (!dbUrl || !["localhost","127.0.0.1"].includes(new URL(apiUrl).hostname)
  || !["localhost","127.0.0.1"].includes(new URL(dbUrl).hostname)
  || !new URL(dbUrl).pathname.includes("ci_"))) throw new Error("Banc de signature CI local obligatoire.");

function jeton(role: string, sub?: string) {
  const h = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
  const p = Buffer.from(JSON.stringify({role,sub,aal:"aal2",iss:"supabase-local"})).toString("base64url");
  return `${h}.${p}.${createHmac("sha256","gerimmo-local-secret").update(`${h}.${p}`).digest("base64url")}`;
}
const secret = "secret-webhook-du-banc-fictif";
const requestId = "11000000000001", documentId = "11000000000002";
const pdf = new TextEncoder().encode("%PDF-1.4\nContrat fictif du banc, sans engagement\n%%EOF");
const preuve = new TextEncoder().encode("%PDF-1.4\nCertificat fictif du banc\n%%EOF");

describe.skipIf(!apiUrl)("Retour Zoho → vraie base et stockage fictifs locaux",()=>{
  let db: Client, service: SupabaseClient, org: string, circuit: string, bail: string;
  let users: string[], etat: string, archivesIndisponibles: boolean, storageIndisponible: boolean, appels: string[], diagnostics: string[];
  let parties: {externalId:string;email:string;statut:string;prenom:string;nom:string;personId:string;qualite:string;telephone:string}[];
  const nativeFetch = globalThis.fetch;
  const id = async(sql:string,params:unknown[]=[])=>String((await db.query(sql,params)).rows[0].id);
  const lire = async()=> (await db.query("select * from public.bail_signature_circuits where id=$1",[circuit])).rows[0];
  function evenement(operation="RequestCompleted",signatureValide=true) {
    const body=JSON.stringify({notifications:{operation_type:operation,performed_by_email:"ne-pas-stocker@example.test"},requests:{request_id:requestId,request_status:"completed"}});
    return new Request("https://example.test/api/zoho-sign/webhook",{method:"POST",body,headers:{"x-zs-webhook-signature":signatureValide?createHmac("sha256",secret).update(body).digest("base64"):"faux"}});
  }
  beforeAll(async()=>{
    db=new Client({connectionString:dbUrl}); await db.connect();
    service=createClient(apiUrl!,jeton("service_role"),{auth:{persistSession:false,autoRefreshToken:false}});
  });
  beforeEach(async()=>{
    reception.tasks=[]; org=""; circuit=""; users=[]; appels=[]; diagnostics=[]; etat="inprogress"; archivesIndisponibles=false; storageIndisponible=false;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",apiUrl!);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY",jeton("service_role"));
    vi.stubEnv("ZOHO_SIGN_CLIENT_ID",`fictif-${randomUUID()}`);
    vi.stubEnv("ZOHO_SIGN_CLIENT_SECRET","secret-fictif"); vi.stubEnv("ZOHO_SIGN_REFRESH_TOKEN","refresh-fictif");
    vi.stubEnv("ZOHO_SIGN_WEBHOOK_SECRET",secret); vi.stubEnv("ZOHO_SIGN_ENV","sandbox");
    vi.stubEnv("ZOHO_SIGN_BAIL_ACTIF","false"); vi.stubEnv("VERCEL","");
    vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
      const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
      if (u.origin===new URL(apiUrl!).origin) {
        if(storageIndisponible && u.pathname.startsWith("/storage/") && init?.method==="POST") return Response.json({message:"stockage indisponible"},{status:503});
        const response=await nativeFetch(input,init);
        if(!response.ok && u.pathname.includes("/rpc/")) diagnostics.push(await response.clone().text());
        return response;
      }
      appels.push(`${init?.method??"GET"} ${u.pathname}`);
      if(u.origin==="https://accounts.zoho.eu" && u.pathname==="/oauth/v2/token") return Response.json({access_token:"jeton-fictif",expires_in:3600});
      if(u.origin!=="https://sign.zoho.eu" || (init?.method && init.method!=="GET")) throw new Error("Accès externe interdit dans cette recette.");
      if(u.pathname===`/api/v1/requests/${requestId}`) return Response.json({code:0,requests:{request_id:requestId,description:`gerimmo:circuit:${circuit}`,request_status:etat,is_sequential:true,actions:parties.map(s=>({action_id:s.externalId,recipient_email:s.email,action_status:etat==="completed"?"SIGNED":etat==="rejected"?"REJECTED":"UNOPENED"}))}});
      if(archivesIndisponibles) return new Response("pas encore prêt",{status:503});
      if(u.pathname===`/api/v1/requests/${requestId}/documents/${documentId}/pdf`) return new Response(pdf);
      if(u.pathname===`/api/v1/requests/${requestId}/completioncertificate`) return new Response(preuve);
      throw new Error("Route externe imprévue dans la recette.");
    });
    org=await id("insert into public.organizations(name,type,status) values('Recette retour Zoho fictive','proprietaire_direct','active') returning id");
    for(let i=0;i<2;i++) users.push(await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id"));
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[users[0],org]);
    const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Fictif','appartement','1 rue Test','69001','Lyon',false) returning id",[org]);
    const lot=await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Fictif','brouillon') returning id",[org,bien]);
    const tenant=await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Test','Alice','alice@example.test') returning id",[org]);
    bail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',current_date,500,20) returning id",[org,lot,tenant]);
    const doc=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Contrat fictif',$1::uuid::text||'/bail.pdf','application/pdf',100,repeat('a',64)) returning id",[org]);
    await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)",[org,doc,bail]);
    parties=[{externalId:"11000000000003",email:"alice@example.test",statut:"notified",prenom:"Alice",nom:"Test",personId:tenant,qualite:"Locataire",telephone:"+33600000001"},{externalId:"11000000000004",email:"benoit@example.test",statut:"initiated",prenom:"Benoit",nom:"Test",personId:users[0],qualite:"Propriétaire",telephone:"+33600000002"}];
    circuit=await id("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,etat,external_request_id,external_document_id) values($1,$2,$3,$4,'zoho','sandbox',repeat('b',64),repeat('a',64),$5,'en_cours',$6,$7) returning id",[org,bail,doc,users[0],JSON.stringify(parties),requestId,documentId]);
    // Prouve que l’API et la connexion SQL ciblent la même base fictive.
    expect((await service.from("bail_signature_circuits").select("id").eq("id",circuit).single()).data?.id).toBe(circuit);
  });
  afterEach(async()=>{
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    if(org) {
      // Retire exclusivement la fixture créée dans cet essai ; comptes permanents exclus.
      await db.query("delete from public.bail_signature_circuits where organization_id=$1",[org]);
      const paths=(await db.query("select name from storage.objects where bucket_id='documents' and name like $1",[org+"/%"])).rows.map(r=>r.name);
      if(paths.length) expect((await service.storage.from("documents").remove(paths)).error).toBeNull();
      await db.query("delete from public.document_liens where organization_id=$1",[org]);
      await db.query("delete from public.documents where organization_id=$1",[org]);
      await db.query("delete from public.baux where organization_id=$1",[org]);
      await db.query("delete from public.persons where organization_id=$1",[org]);
      await db.query("delete from public.lots where organization_id=$1",[org]);
      await db.query("delete from public.biens where organization_id=$1",[org]);
      await db.query("delete from public.memberships where organization_id=$1",[org]);
      await db.query("delete from public.alerts where organization_id=$1",[org]);
      await db.query("delete from public.audit_log where organization_id=$1",[org]);
      await db.query("delete from public.organizations where id=$1",[org]);
    }
    if(users.length) {
      await db.query("delete from public.audit_log where account_id=any($1::uuid[])",[users]);
      await db.query("delete from auth.users where id=any($1::uuid[])",[users]);
    }
  });
  afterAll(async()=>{await db?.end();});
  it("rejette un faux retour sans consulter le fournisseur ni changer le circuit",async()=>{
    expect((await recevoir(evenement("RequestCompleted",false))).status).toBe(400);
    expect((await lire()).etat).toBe("en_cours"); expect(appels).toHaveLength(0);
  });
  it("archive le signé et ses preuves une fois, même après deux retours et une suspension des nouveaux envois",async()=>{
    etat="completed";
    expect((await recevoir(evenement())).status,JSON.stringify(diagnostics)).toBe(200);
    const c=await lire(); expect(c.etat).toBe("termine"); expect(c.signataires.every((s:{preuveDocumentId?:string})=>s.preuveDocumentId)).toBe(true);
    expect((await db.query("select etat from public.baux where id=$1",[bail])).rows[0].etat).toBe("brouillon");
    const telecharges=appels.length;
    expect((await recevoir(evenement("RequestViewed"))).status).toBe(200);
    expect(appels).toHaveLength(telecharges);
    expect((await db.query("select count(*)::int n from public.documents where organization_id=$1",[org])).rows[0].n).toBe(3);
    expect(c.signataires[0].preuveDocumentId).toBe(c.signataires[1].preuveDocumentId);
    const chemin=`${org}/signature-bail/${circuit}/contrat.pdf`;
    const owner=createClient(apiUrl!,jeton("authenticated",users[0]),{auth:{persistSession:false}});
    const stranger=createClient(apiUrl!,jeton("authenticated",users[1]),{auth:{persistSession:false}});
    const recu=await owner.storage.from("documents").download(chemin);
    expect(recu.error).toBeNull(); expect(createHash("sha256").update(Buffer.from(await recu.data!.arrayBuffer())).digest("hex")).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect((await stranger.storage.from("documents").download(chemin)).error).not.toBeNull();
  });
  it.each([["rejected","refuse"],["recalled","annule"],["expired","expire"]])("ignore un ancien signal de fin et relit l’état actuel %s",async(distant,local)=>{
    etat=distant; expect((await recevoir(evenement())).status).toBe(200);
    expect((await lire()).etat).toBe(local);
    expect((await db.query("select count(*)::int n from public.documents where organization_id=$1",[org])).rows[0].n).toBe(1);
    expect(appels.some(x=>x.endsWith("/pdf"))).toBe(false);
  });
  it.each(["prestataire","stockage"])("reprend après une panne %s sans renvoyer d’invitation",async(panne)=>{
    etat="completed"; archivesIndisponibles=panne==="prestataire"; storageIndisponible=panne==="stockage";
    expect((await recevoir(evenement())).status).toBe(200);
    expect((await lire()).etat).toBe("en_cours"); expect((await lire()).verrou_jeton).toBeNull();
    archivesIndisponibles=false; storageIndisponible=false;
    // Même fonction que la tâche de rapprochement si le webhook est perdu.
    await synchroniserCircuitSignatureBail(service,{prestataire:"zoho",environnement:"sandbox",clientId:process.env.ZOHO_SIGN_CLIENT_ID!,clientSecret:"secret-fictif",refreshToken:"refresh-fictif"},circuit);
    expect((await lire()).etat).toBe("termine");
    expect(appels.filter(x=>x.startsWith("POST")&&!x.includes("/oauth/"))).toHaveLength(0);
  });
});
