import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
config({path:'.env.local'});const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
const declaration="select public.declarer_mon_incident_reprise($1,$2,'plomberie_canalisation',$3,'Cuisine',null,'normale') r";
describe.skipIf(!url)('LOC002/003 — droits et répétitions en base',()=>{
 let db:Client,org:string,user:string,foreign:string,commande:string;
 async function agir(id=user){await db.query('reset role');await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[id]);await db.query('set local role authenticated');}
 async function essayer(sql:string,args:unknown[]=[]){await db.query('savepoint essai');try{const r=await db.query(sql,args);await db.query('release savepoint essai');return r.rows;}catch(e){await db.query('rollback to savepoint essai');throw e;}}
 async function declarer(description='Fuite fictive'){return (await essayer(declaration,[org,commande,description]))[0].r;}
 async function reserver(incident:string,hash='a'.repeat(64)){return (await essayer("select public.preparer_photo_incident($1,$2,$3,'image/jpeg',12) r",[org,incident,hash]))[0].r;}
 async function objet(path:string,owner=user){await db.query('reset role');await db.query("insert into storage.objects(bucket_id,name,owner,metadata) values('documents',$1,$2,'{\"size\":12}')",[path,owner]);await agir();}
 async function finaliser(depot:string){return (await essayer('select public.finaliser_photo_incident($1) r',[depot]))[0].r;}
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();await db.query('begin');if(!(await db.query("select to_regclass('public.commandes_incidents_locataire') r")).rows[0].r)await db.query(readFileSync('supabase/migrations/20261013100000_incidents_reprise.sql','utf8'));if(!(await db.query("select 1 from pg_trigger where tgname='photo_incident_destination_signature'")).rowCount)await db.query(readFileSync('supabase/migrations/20261013105000_incidents_destinations.sql','utf8'));});
 afterAll(async()=>{await db.query('rollback');await db.end();});
 beforeEach(async()=>{
  await db.query('reset role');await db.query('savepoint cas');commande=randomUUID();user=randomUUID();foreign=randomUUID();
  org=(await db.query("insert into organizations(name,status) values('TEST reprise incidents','active') returning id")).rows[0].id;
  for(const id of[user,foreign])await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')",[id,`${id}@test.local`]);
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$3,'locataire'),($2,$3,'locataire')",[user,foreign,org]);
  const person=(await db.query("insert into persons(organization_id,account_id,nom) values($1,$2,'TEST locataire') returning id",[org,user])).rows[0].id;
  const bien=(await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST','appartement','1 rue fictive','75001','Paris') returning id",[org])).rows[0].id;
  const lot=(await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id",[org,bien])).rows[0].id;
  await db.query("insert into baux(organization_id,lot_id,etat,locataire_principal) values($1,$2,'actif',$3)",[org,lot,person]);await agir();
 });
 afterEach(async()=>{await db.query('rollback to savepoint cas');});
 it('une même commande donne un seul incident, événement et alerte',async()=>{const a=await declarer(),b=await declarer();expect(b).toEqual({...a,rejoue:true});await db.query('reset role');for(const q of ['select count(*)::int n from incidents where id=$1',"select count(*)::int n from incident_evenements where incident_id=$1 and type='declaration'","select count(*)::int n from alerts where details->>'incident_id'=$1"]){expect((await db.query(q,[a.incident_id])).rows[0].n).toBe(1);}});
 it('refuse une commande déjà enregistrée avec un contenu différent',async()=>{await declarer();await expect(declarer('Autre problème')).rejects.toThrow(/autre saisie/);});
 it('refuse le rejeu et la photo par un autre locataire de la même agence',async()=>{const a=await declarer();await agir(foreign);await expect(declarer()).rejects.toThrow(/Accès refusé/);await expect(reserver(a.incident_id)).rejects.toThrow(/Accès refusé/);expect((await db.query('select * from commandes_incidents_locataire')).rows).toHaveLength(0);});
 it('une validation refusée ne consomme pas la commande',async()=>{await expect(essayer("select public.declarer_mon_incident_reprise($1,$2,'inconnue','test',null,null,'normale')",[org,commande])).rejects.toThrow();expect((await declarer()).rejoue).toBe(false);});
 it('le même dépôt et son lien sont rejoués sans double photo',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);expect((await reserver(i)).id).toBe(p.id);await objet(p.storage_path);const a=await finaliser(p.id),b=await finaliser(p.id);expect(a.document_id).toBeTruthy();expect(b).toEqual({...a,rejoue:true});expect((await reserver(i)).document_id).toBe(a.document_id);expect((await db.query('select public.photo_incident_supprimable($1) r',[p.storage_path])).rows[0].r).toBe(false);await db.query('reset role');expect((await db.query("select count(*)::int n from document_liens where entite='incident' and entite_id=$1",[i])).rows[0].n).toBe(1);});
 it('un objet absent ne produit pas de document ; le nouveau dépôt a un autre chemin',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);expect(await finaliser(p.id)).toMatchObject({nettoyage:true});const q=await reserver(i);expect(q.storage_path).not.toBe(p.storage_path);expect(q.etat).toBe('en_attente');});
 it('un objet d’un autre propriétaire ne peut être lié ni supprimé',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);await objet(p.storage_path,foreign);expect(await finaliser(p.id)).toMatchObject({nettoyage:true});expect((await db.query('select public.photo_incident_supprimable($1) r',[p.storage_path])).rows[0].r).toBe(false);});
 it('un échec métier autorise uniquement le retrait de son propre objet sans fiche',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);await objet(p.storage_path);await db.query('reset role');await db.query("update incidents set etat='clos',clos_le=now(),cloture_motif='sans_suite' where id=$1",[i]);await agir();expect(await finaliser(p.id)).toMatchObject({nettoyage:true});expect((await db.query('select public.photo_incident_supprimable($1) r',[p.storage_path])).rows[0].r).toBe(true);const autre=org+'/'+randomUUID()+'.jpg';await objet(autre);expect((await db.query('select public.photo_incident_supprimable($1) r',[autre])).rows[0].r).toBe(false);await agir(foreign);expect((await db.query('select public.photo_incident_supprimable($1) r',[p.storage_path])).rows[0].r).toBe(false);});
 it('un dépôt abandonné ne peut pas être transformé en document concurrent',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);await objet(p.storage_path);await db.query('reset role');await db.query("update incidents set etat='clos',clos_le=now(),cloture_motif='sans_suite' where id=$1",[i]);await agir();await finaliser(p.id);await db.query('reset role');await expect(essayer("insert into documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident',$2,'image/jpeg',12,$3)",[org,p.storage_path,'b'.repeat(64)])).rejects.toThrow(/abandonné/);});
 it('le locataire ne transforme pas un dépôt en signature d’organisation',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);await essayer('update organizations set signature_path=$1 where id=$2',[p.storage_path,org]).catch(()=>{});await db.query('reset role');expect((await db.query('select signature_path from organizations where id=$1',[org])).rows[0].signature_path).not.toBe(p.storage_path);});
 it('même le responsable ne transforme pas un chemin réservé en signature ; les chemins ordinaires restent permis',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);await db.query('reset role');await db.query("update memberships set role='admin_agence' where account_id=$1 and organization_id=$2",[foreign,org]);await agir(foreign);await expect(essayer('update organizations set signature_path=$1 where id=$2',[p.storage_path,org])).rejects.toThrow(/réservée au signalement/);await essayer('select public.definir_signature_organisation($1,$2)',[org,org+'/signature-test.png']);await db.query('reset role');expect((await db.query('select signature_path from organizations where id=$1',[org])).rows[0].signature_path).toBe(org+'/signature-test.png');});
 it('le préfixe imposé aux pièces artisan exclut tout chemin réservé d’incident',async()=>{const i=(await declarer()).incident_id,p=await reserver(i);await expect(essayer("insert into artisan_pieces(artisan_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'certification',$2,'image/jpeg',12,$3)",[randomUUID(),p.storage_path,'c'.repeat(64)])).rejects.toThrow(/permission|Accès|row-level/i);await db.query('reset role');await expect(essayer("insert into artisan_pieces(artisan_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'certification',$2,'image/jpeg',12,$3)",[randomUUID(),p.storage_path,'c'.repeat(64)])).rejects.toThrow(/artisan_pieces_chemin_cloisonne/);});
 it('aucun droit global de mutation des réservations ni accès anonyme',async()=>{await expect(essayer('delete from depots_photos_incident')).rejects.toThrow(/permission/);await db.query('reset role');expect((await db.query("select has_function_privilege('anon','public.preparer_photo_incident(uuid,uuid,text,text,bigint)','EXECUTE') r")).rows[0].r).toBe(false);});
});

describe.skipIf(!url)('LOC003 — concurrence réelle, migration déjà installée',()=>{
 it('deux connexions attendent la même commande puis obtiennent un seul incident',async(ctx)=>{
  const a=new Client({connectionString:url}),b=new Client({connectionString:url}),observation=new Client({connectionString:url});await Promise.all([a.connect(),b.connect(),observation.connect()]);let incident:string|undefined;let fixture:{org:string,user:string,bien:string,lot:string,personne:string,bail:string}|undefined;
  try {
   if(!(await a.query("select to_regclass('public.commandes_incidents_locataire') r")).rows[0].r){ctx.skip();return;}
   await a.query('begin');
   const org=(await a.query("insert into organizations(name,status) values('TEST concurrence reprise','active') returning id")).rows[0].id,user=randomUUID();
   await a.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')",[user,`${user}@test.local`]);
   await a.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[user,org]);
   const personne=(await a.query("insert into persons(organization_id,account_id,nom) values($1,$2,'TEST') returning id",[org,user])).rows[0].id;
   const bien=(await a.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST','appartement','1 rue fictive','75001','Paris') returning id",[org])).rows[0].id;
   const lot=(await a.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id",[org,bien])).rows[0].id;
   const bail=(await a.query("insert into baux(organization_id,lot_id,etat,locataire_principal) values($1,$2,'actif',$3) returning id",[org,lot,personne])).rows[0].id;
   await a.query('commit');
   fixture={org,user,bien,lot,personne,bail};const f={account_id:user,organization_id:org};
   const commande=randomUUID(),args=[f.organization_id,commande,'TEST concurrence LOC003 '+commande];
   const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
   for(const db of[a,b]){await db.query('begin');await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[f.account_id]);await db.query('set local role authenticated');}
   const premier=(await a.query(declaration,args)).rows[0].r;incident=premier.incident_id;
   const secondEnAttente=b.query(declaration,args);let bloque=false;
   for(let n=0;n<100;n++){if((await observation.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock'){bloque=true;break;}await new Promise(r=>setTimeout(r,10));}
   expect(bloque).toBe(true);await a.query('commit');const second=(await secondEnAttente).rows[0].r;await b.query('commit');expect(second).toEqual({...premier,rejoue:true});
   expect((await observation.query('select count(*)::int n from commandes_incidents_locataire where id=$1',[commande])).rows[0].n).toBe(1);
  }finally{
   await a.query('rollback');await b.query('rollback');
   if(incident){await observation.query('begin');await observation.query('delete from commandes_incidents_locataire where incident_id=$1',[incident]);await observation.query('delete from incident_evenements where incident_id=$1',[incident]);await observation.query("delete from alerts where details->>'incident_id'=$1",[incident]);await observation.query('delete from incidents where id=$1',[incident]);await observation.query("delete from audit_log where details->>'incident_id'=$1",[incident]);await observation.query('commit');}
   if(fixture){const f=fixture;await observation.query('begin');await observation.query('delete from baux where id=$1',[f.bail]);await observation.query('delete from lots where id=$1',[f.lot]);await observation.query('delete from biens where id=$1',[f.bien]);await observation.query('delete from persons where id=$1',[f.personne]);await observation.query('delete from memberships where organization_id=$1',[f.org]);await observation.query('delete from audit_log where organization_id=$1',[f.org]);await observation.query('delete from organizations where id=$1',[f.org]);await observation.query('delete from auth.users where id=$1',[f.user]);await observation.query('commit');}
   await Promise.all([a.end(),b.end(),observation.end()]);
  }
 });
});
