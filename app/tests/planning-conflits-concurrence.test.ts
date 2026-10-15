import { randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
const date=(h:number)=>new Date(Math.ceil((Date.now()+14*86400000)/3600000)*3600000+h*3600000).toISOString();
// Après application coordonnée de la migration : deux vraies transactions,
// fixtures privées commises puis supprimées. Jamais dans le preview DDL annulé.
describe.skipIf(!url||process.env.PLANNING_CONFLITS_CONCURRENCE!=="1")("ART004 — concurrence réelle entre confirmations",()=>{
 let db:Client,a:Client,b:Client,org:string,loc:string,compte:string,artisan:string,artisanB:string;
 let missions:string[],creneaux:string[],chantier:string,comptes:string[];
 const creations:{table:string;id:string}[]=[];
 async function inserer(table:string,sql:string,args:unknown[]=[]){const id=(await db.query(sql,args)).rows[0].id as string;creations.push({table,id});return id;}
 async function user(){return inserer("auth.users","insert into auth.users(id,email,encrypted_password,email_confirmed_at) values(gen_random_uuid(),$1,'x',now()) returning id",[`art004-${randomUUID()}@example.invalid`]);}
 async function role(c:Client,u:string){await c.query("begin");await c.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[u]);await c.query("set local role authenticated");}
 async function decor(art:string){const bien=await inserer("public.biens","insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST concurrence','appartement','1 rue TEST','75001','Paris') returning id",[org]);const lot=await inserer("public.lots","insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id",[org,bien]);const p=(await db.query("select id from public.persons where organization_id=$1 and account_id=$2",[org,loc])).rows[0].id;const bail=await inserer("public.baux","insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-30,500,50) returning id",[org,lot,p]);const inc=await inserer("public.incidents","insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,$5,'espace_locataire','plomberie_canalisation','TEST concurrence','qualifie','proprietaire','TEST') returning id",[org,`TEST-${randomUUID()}`,lot,bail,p]);const m=await inserer("public.incident_interventions","insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id",[org,inc,art]);const cr=await inserer("public.intervention_creneaux","insert into public.intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin) values($1,$2,'artisan',1,$3,$4) returning id",[org,m,date(0),date(2)]);return {m,cr};}
 const choisir=(c:Client,cr:string)=>c.query("select public.choisir_creneau($1,$2)",[org,cr]);
 const prive=(c:Client)=>c.query("select public.artisan_externe_ecrire('planning',$1,1,$2,$3)",[chantier,{debut:date(0),fin:date(2)},randomUUID()]);
 async function deuxConfirmations(privePremier=false,priveSecond=false,memeMission=false){
  await role(a,privePremier?compte:loc);await role(b,priveSecond?compte:loc);
  const pid=(await b.query("select pg_backend_pid() id")).rows[0].id;
  await (privePremier?prive(a):choisir(a,creneaux[0]));
  const seconde=(priveSecond?prive(b):choisir(b,memeMission?creneaux[0]:creneaux[1])).then(()=>({ok:true,message:""}),(e:Error)=>({ok:false,message:e.message}));
  let attente="";const limite=Date.now()+3000;
  while(Date.now()<limite){const r=(await db.query("select wait_event from pg_stat_activity where pid=$1",[pid])).rows[0];attente=r?.wait_event??"";if(attente==="advisory")break;await new Promise(r=>setTimeout(r,20));}
  expect(attente).toBe("advisory");await a.query("commit");const resultat=await seconde;
  // Décision D22 (REP-04) : le même locataire qui confirme à nouveau le créneau déjà retenu (clic répété après une
  // réponse perdue) obtient un succès silencieux, sans second rendez-vous ; les autres conflits restent refusés.
  if(memeMission)expect(resultat).toEqual({ok:true,message:""});
  else{expect(resultat.ok).toBe(false);expect(resultat.message).toMatch(priveSecond?/autre chantier/:/chevauche/);}
  await b.query("rollback");
  const compteRdv=(await db.query("select count(*)::int n from public.incident_interventions where id=any($1::uuid[]) and statut='planifiee'",[missions])).rows[0].n;
  expect(compteRdv).toBe(privePremier?0:1);
 }
 beforeAll(async()=>{db=new Client({connectionString:url});a=new Client({connectionString:url});b=new Client({connectionString:url});await db.connect();await a.connect();await b.connect();expect((await db.query("select to_regprocedure('public.conflit_planning_artisan(uuid,timestamptz,timestamptz,uuid,uuid)') p")).rows[0].p).not.toBeNull();});
 beforeEach(async()=>{
  await db.query("begin");creations.length=0;comptes=[await user(),await user(),await user()];[loc,compte]=comptes;
  org=await inserer("public.organizations","insert into public.organizations(name,status) values('ART004 concurrence TEST','active') returning id");
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'locataire')",[loc,org]);
  await inserer("public.persons","insert into public.persons(organization_id,account_id,nom) values($1,$2,'TEST') returning id",[org,loc]);
  const art=async(u:string)=>inserer("public.artisans","insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'ART004 TEST',$2,'0600000000') returning id",[u,String(randomInt(10000000000000,99999999999999))]);
  artisan=await art(compte);artisanB=await art(comptes[2]);
  const x=await decor(artisan),y=await decor(artisan);missions=[x.m,y.m];creneaux=[x.cr,y.cr];
  const client=await inserer("public.artisan_clients","insert into public.artisan_clients(artisan_id,nom,type,adresse) values($1,'TEST concurrence','particulier','Adresse TEST') returning id",[artisan]);
  chantier=await inserer("public.artisan_chantiers","insert into public.artisan_chantiers(artisan_id,client_id,titre,adresse,description,statut) values($1,$2,'TEST','Adresse TEST','TEST','accepte') returning id",[artisan,client]);
  await db.query("commit");
 });
 afterEach(async()=>{await a.query("rollback");await b.query("rollback");await db.query("rollback");await db.query("begin");await db.query("delete from public.artisan_evenements_prives where artisan_id=$1",[artisan]);await db.query("delete from public.artisan_rendez_vous where artisan_id=$1",[artisan]);await db.query("delete from public.incident_evenements where organization_id=$1",[org]);await db.query("delete from public.memberships where organization_id=$1",[org]);for(const x of [...creations].reverse()){if(x.table==="public.organizations")await db.query("delete from public.audit_log where organization_id=$1",[x.id]);if(x.table==="auth.users")await db.query("delete from public.audit_log where account_id=$1",[x.id]);await db.query(`delete from ${x.table} where id=$1`,[x.id]);}await db.query("commit");});
 afterAll(async()=>{await a?.end();await b?.end();await db?.end();});
 it("deux locataires ne confirment pas simultanément deux missions incompatibles",()=>deuxConfirmations());
 it("deux confirmations du même créneau ne produisent qu'un rendez-vous (la seconde est un succès silencieux, D22)",()=>deuxConfirmations(false,false,true));
 it("un chantier privé confirmé pendant l'attente bloque la mission Gerimmo",()=>deuxConfirmations(true));
 it("une mission Gerimmo confirmée pendant l'attente bloque le chantier privé",()=>deuxConfirmations(false,true));
 it("les confirmations de deux artisans distincts restent indépendantes",async()=>{await db.query("update public.incident_interventions set artisan_id=$1 where id=$2",[artisanB,missions[1]]);await role(a,loc);await role(b,loc);await choisir(a,creneaux[0]);await b.query("set local lock_timeout='1000ms'");await choisir(b,creneaux[1]);await a.query("commit");await b.query("commit");expect((await db.query("select count(*)::int n from public.incident_interventions where id=any($1::uuid[]) and statut='planifiee'",[missions])).rows[0].n).toBe(2);});
});
