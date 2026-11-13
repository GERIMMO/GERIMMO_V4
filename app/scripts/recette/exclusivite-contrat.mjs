// Deux sessions PostgreSQL authentifiées et des lectures locataires par PostgREST officiel.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import pg from "pg";
import { pdfFictif } from "../../e2e/pdf-fictif.ts";

const dbUrl = new URL(process.env.SUPALOCAL_DB);
const rest = new URL(process.env.POSTGREST_REEL_URL);
assert.equal(dbUrl.hostname, "127.0.0.1");
assert.match(dbUrl.pathname, /^\/gerimmo_ci_[a-z_]+_api$/);
assert.equal(rest.hostname, "127.0.0.1");
const secret = process.env.POSTGREST_REEL_JWT_SECRET;
assert.ok(secret);
const connections = [];
async function connect() {
  const db = new pg.Client({connectionString: dbUrl.toString()});
  await db.connect();
  connections.push(db);
  return db;
}
async function id(db, sql, args=[]) { return (await db.query(sql,args)).rows[0].id; }
function bearer(account,key) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({alg:"HS256",typ:"JWT"})+"."+encode({role:"authenticated",sub:account,session_id:account,exp:Math.floor(Date.now()/1000)+300});
  return head+"."+createHmac("sha256",key).update(head).digest("base64url");
}
async function rpc(name, account, payload) {
  const token=bearer(account,secret);
  const res = await fetch(new URL("/rpc/"+name,rest), {method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  return {status:res.status, body:await res.text()};
}
async function ownerSession(db,owner) {
  await db.query("begin");
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,role:"authenticated"})]);
  await db.query("set local role authenticated");
}
try {
  const root=await connect(), a=await connect(), b=await connect();
  const org=await id(root,"insert into organizations(name,status) values ('Recette exclusivité','active') returning id");
  async function person(role) {
    const account=await id(root,"insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,'{}','{}') returning id",[randomUUID()+"@example.invalid"]);
    await root.query("insert into auth.sessions(id,user_id) values($1,$1)",[account]);
    await root.query("insert into memberships(account_id,organization_id,role) values($1,$2,$3)",[account,org,role]);
    return {account,id:await id(root,"insert into persons(organization_id,account_id,nom) values($1,$2,'Recette') returning id",[org,account])};
  }
  const owner=await person("admin_agence"), first=await person("locataire"), second=await person("locataire");
  const agent=await person("agent");
  async function lease(tenant) {
    await ownerSession(a,owner.account);
    const building=await id(a,"select creer_bien_avec_lot($1,'Immeuble fictif','appartement','10 rue fictive',null,'75001','Paris',1990,false,50,3) id",[org]);
    const lot=await id(a,"select id from lots where bien_id=$1",[building]);
    await a.query("insert into detentions(lot_id,organization_id,person_id,quote_part) values($1,$2,$3,100)",[lot,org,owner.id]);
    await a.query("insert into diagnostics(organization_id,lot_id,bien_id,type,date_realisation,date_expiration) values($1,$2,null,'dpe',current_date,current_date+365),($1,null,$3,'erp',current_date,current_date+180)",[org,lot,building]);
    await a.query("update lots set etat='disponible' where id=$1",[lot]);
    const mandat=await id(a,"insert into mandats(organization_id,person_id,etat,agent_account_id) values($1,$2,'actif',$3) returning id",[org,owner.id,agent.account]);
    await a.query("insert into mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires) values($1,$2,$3,7)",[org,mandat,lot]);
    const result=await id(a,"insert into baux(organization_id,lot_id,locataire_principal,loyer_hc,charges,jour_echeance,date_debut) values($1,$2,$3,750,50,5,current_date) returning id",[org,lot,tenant.id]);
    await a.query("commit");
    return result;
  }
  const left=await lease(first), right=await lease(second);
  async function document(type="bail",organisation=org,path=randomUUID()+".pdf") {
    return id(root,"insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,$2,'Fictif',$3,'application/pdf',200,gen_random_uuid()::text) returning id",[organisation,type,organisation+"/"+path]);
  }
  const pdf=await document();
  const activate=(leaseId,doc)=>rpc("activer_bail_papier",owner.account,{p_org:org,p_bail:leaseId,p_document:doc});
  const view=async (tenant,doc)=>{
    const result=await rpc("mon_document_locataire",tenant.account,{p_org:org,p_doc:doc});
    assert.equal(result.status,200,result.body);
    return JSON.parse(result.body);
  };
  async function denied(leaseId,doc) {
    const response=await activate(leaseId,doc);
    assert.ok(response.status>=400 && response.status<500,JSON.stringify(response));
    return response;
  }
  await denied(right,randomUUID());
  await denied(right,await document("autre"));
  const otherOrg=await id(root,"insert into organizations(name,status) values('Autre recette','active') returning id");
  await denied(right,await document("bail",otherOrg));
  const purged=await document();
  await root.query("update documents set purged_at=now(),storage_path=null,mime_type=null,taille_octets=null,empreinte=null where id=$1",[purged]);
  await denied(right,purged);
  const scoped=await document("bail",org,"baux-papier/"+left+"/"+randomUUID()+".pdf");
  await denied(right,scoped);
  const linked=await document();
  await root.query("insert into document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)",[org,linked,left]);
  await denied(right,linked);
  const personal=await document();
  await root.query("insert into document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'personne',$3)",[org,personal,first.id]);
  await denied(right,personal);
  const original=await document();
  await root.query("insert into bail_signature_circuits(organization_id,bail_id,created_by,document_id,environnement,empreinte,pdf_hash,signataires) values($1,$2,$3,$4,'sandbox',repeat('a',64),repeat('b',64),'[{},{}]')",[org,left,owner.account,original]);
  await denied(right,original);
  await denied(left,original);
  await ownerSession(a,owner.account);
  await ownerSession(b,owner.account);
  const sql="select activer_bail_papier($1,$2,$3)";
  await a.query(sql,[org,left,pdf]);
  const result=b.query(sql,[org,right,pdf]).then(()=>null,e=>e);
  let blocked=false;
  for(let i=0;i<100 && !blocked;i++) {
    blocked=(await root.query("select $1::int=any(pg_blocking_pids($2)) blocked",[a.processID,b.processID])).rows[0].blocked;
    if(!blocked) await pause(20);
  }
  await a.query("commit");
  const rejected=await result;
  assert.ok(blocked,"Les deux transactions doivent effectivement se chevaucher");
  assert.equal(rejected?.code,"23505");
  await b.query("rollback");
  assert.deepEqual((await root.query("select etat, document_signe from baux where id=$1",[right])).rows,[{etat:"brouillon",document_signe:null}]);
  assert.equal((await root.query("select count(*)::int n from alerts where details->>'bail_id'=$1",[right])).rows[0].n,0);
  for(const table of ["appels_loyer","encaissements","echeanciers_charges"]) {
    assert.equal((await root.query(`select count(*)::int n from public.${table} where bail_id=$1`,[right])).rows[0].n,0);
  }
  assert.equal((await root.query("select etat from lots where id=(select lot_id from baux where id=$1)",[right])).rows[0].etat,"disponible");
  await assert.rejects(root.query("insert into document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)",[org,pdf,right]),{code:"23505"});
  await assert.rejects(root.query("insert into demandes_signature(organization_id,document_id,person_id) values($1,$2,$3)",[org,pdf,second.id]),/ne figure pas sur le bail/);
  assert.deepEqual(await view(second,pdf),[]);
  assert.equal((await view(first,pdf))[0].document_id,pdf);
  const storage = new URL(process.env.STORAGE_CONTRATS_URL);
  assert.equal(storage.hostname,"127.0.0.1");
  const path = (await view(first,pdf))[0].storage_path;
  const bytes=pdfFictif();
  const headers=account=>({Authorization:"Bearer "+bearer(account,"gerimmo-local-secret")});
  const upload=await fetch(new URL("/storage/v1/object/documents/"+path,storage),{method:"POST",headers:{...headers(owner.account),"Content-Type":"application/pdf"},body:bytes});
  assert.equal(upload.status,200,await upload.text());
  const link=account=>fetch(new URL("/storage/v1/object/sign/documents/"+path,storage),{method:"POST",headers:{...headers(account),"Content-Type":"application/json"},body:JSON.stringify({expiresIn:30})});
  const allowed=await link(first.account);
  assert.equal(allowed.status,200);
  const download=await fetch(new URL("/storage/v1"+(await allowed.json()).signedURL,storage));
  assert.equal(download.status,200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  assert.equal((await link(second.account)).status,404);
  await ownerSession(b,owner.account);
  await assert.rejects(b.query("update baux set document_signe=$1 where id=$2",[pdf,right]),{code:"23505"});
  await b.query("rollback");
  const replacement=await document("bail",org,"baux-papier/"+right+"/"+randomUUID()+".pdf");
  await ownerSession(b,owner.account);
  await b.query("update baux set document_signe=$1 where id=$2",[replacement,right]);
  await b.query("commit");
  const retry=await activate(right,replacement);
  assert.equal(retry.status,204,retry.body);
  assert.equal((await view(second,replacement))[0].document_id,replacement);
  assert.deepEqual(await view(second,pdf),[]);
  // Retour électronique déjà archivé, entièrement fictif : seul le RPC d'activation est exécuté.
  const electronic=await lease(first), source=await document(), archive=await document();
  const signer=await person("proprietaire_direct");
  const circuit=await id(root,"insert into bail_signature_circuits(organization_id,bail_id,created_by,document_id,document_signe,environnement,etat,empreinte,pdf_hash,signataires) values($1,$2,$3,$4,$5,'production','termine',repeat('c',64),repeat('d',64),'[{},{}]') returning id",[org,electronic,signer.account,source,archive]);
  const signed=await rpc("activer_bail_signature_electronique",signer.account,{p_circuit:circuit});
  assert.equal(signed.status,204,signed.body);
  assert.equal((await view(first,archive))[0].document_id,archive);
  assert.deepEqual(await view(second,archive),[]);
  console.log("Deux transactions concurrentes observées, un seul bail activé. Refus SQL 23505, brouillon conservé. PDF visible uniquement du bon locataire via PostgREST. Reprise avec un PDF distinct réussie.");
} finally {
  await Promise.all(connections.map(db=>db.end()));
}
