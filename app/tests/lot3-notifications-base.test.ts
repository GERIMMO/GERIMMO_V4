import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {clientSurPg} from './fixtures/supabase-sur-pg';
const shared=vi.hoisted(()=>({service:null as unknown}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>shared.service}));
vi.mock('@/lib/marque-organisation-serveur',()=>({chargerMarque:async()=>null}));
vi.mock('../src/lib/controle-effets',async original=>({...await original<typeof import('../src/lib/controle-effets')>(),verifierAvantEffet:async()=>{}}));
import {traiterNotificationCapturee} from '../src/lib/notifications-transactionnelles';
import {reprendreCourriels} from '../src/lib/reprise-courriels';
import {envoyerEmailTransport} from '../src/lib/email';
const url=process.env.SUPABASE_DB_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/gerimmo_ci_lottrois')throw Error('Base Lot3 fictive obligatoire');
const db=new Client({connectionString:url});
const service=clientSurPg(db,{transactionnel:true}) as unknown as SupabaseClient;
const q=async(sql:string,p:unknown[]=[]) =>(await db.query(sql,p)).rows;
const id=async(sql:string,p:unknown[]=[]) =>(await q(sql,p))[0].id as string;
let org:string,owner:string,tenant:string,person:string,msg:string,intention:string;
const transport=vi.fn();
beforeAll(()=>db.connect());afterAll(()=>db.end());
beforeEach(async()=>{
 await q('begin');await q("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
 vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');vi.stubEnv('COURRIELS_CHIFFREMENT_CLE','cd'.repeat(32));vi.stubEnv('RESEND_API_KEY','fictif');vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://localhost:3579');
 shared.service=service;transport.mockReset().mockImplementation(async()=>new Response(JSON.stringify({id:'fictif-'+randomUUID()}),{status:200}));vi.stubGlobal('fetch',transport);
 const account=()=>id("insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,'fictif',now(),'{}','{}') returning id",[randomUUID()+'@example.invalid']);
 owner=await account();tenant=await account();org=await id("insert into organizations(name,type,status) values('SCI Lot3 fictive','proprietaire_direct','essai') returning id");
 await q("insert into memberships(account_id,organization_id,role) values($1,$3,'proprietaire_direct'),($2,$3,'locataire')",[owner,tenant,org]);
 person=await id("insert into persons(organization_id,nom,email,account_id) select $1,'Fictif',email,id from auth.users where id=$2 returning id",[org,tenant]);
 msg=await id("insert into messages(organization_id,person_id,auteur,auteur_account_id,texte) values($1,$2,'gerant',$3,'Réponse fictive') returning id",[org,person,owner]);
 intention=await id('select id from notification_intentions where objet=$1',[msg]);
});
afterEach(async()=>{await q('rollback');vi.unstubAllEnvs();vi.unstubAllGlobals();});
const state=async()=>(await q('select * from notification_intentions where id=$1',[intention]))[0];
const retry=()=>reprendreCourriels(service,(p,ref)=>envoyerEmailTransport({...p,referenceInterne:ref,organisation:{db:service,id:org}}),async()=>{});
it('capture métier et intention dans la même transaction, rollback sans événement orphelin',async()=>{
 await q('savepoint capture');const m=await id("insert into messages(organization_id,person_id,auteur,auteur_account_id,texte) values($1,$2,'gerant',$3,'Deuxième') returning id",[org,person,owner]);expect(await q('select id from notification_intentions where objet=$1',[m])).toHaveLength(1);await q('rollback to capture');expect(await q('select id from notification_intentions where objet=$1',[m])).toHaveLength(0);
});
it('interruption après événement : le travail est retrouvé sans appel du notificateur historique',async()=>{
 expect((await q('select * from notifications_a_preparer(100)')).some(n=>n.id===intention)).toBe(true);
 expect(await traiterNotificationCapturee(service,intention)).toMatchObject({envoyee:true});expect((await state()).etat).toBe('conservee');
 await traiterNotificationCapturee(service,intention);expect(transport).toHaveBeenCalledTimes(1);
 const c=(await q('select etat,finalisation_etat from courriels_durables where id=$1',[(await state()).courriel_id]))[0];expect(c).toMatchObject({etat:'accepte',finalisation_etat:'terminee'});
});
it('aucune capture supplémentaire pour une modification sans nouvelle notification',async()=>{
 await q('update messages set lu_le=now() where id=$1',[msg]);expect(await q('select id from notification_intentions where objet=$1',[msg])).toHaveLength(1);
 await traiterNotificationCapturee(service,intention);expect((await state()).etat).toBe('obsolete');expect(transport).not.toHaveBeenCalled();
});
it.each(['droits','adresse','banni'])('contrôle du destinataire avant émission : %s',async cas=>{
 if(cas==='droits')await q("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[tenant,org]);
 if(cas==='adresse')await q("update auth.users set email='nouveau@example.invalid' where id=$1",[tenant]);
 if(cas==='banni')await q("update auth.users set banned_until=now()+interval '1 day' where id=$1",[tenant]);
 await traiterNotificationCapturee(service,intention);expect((await state()).etat).toBe('a_verifier');expect(transport).not.toHaveBeenCalled();
});
it('deux prises concurrentes logiques : une seule détient le bail, reprise après expiration',async()=>{
 const first=(await q('select prendre_notification($1,$2) n',[intention,randomUUID()]))[0].n;expect(first.id).toBe(intention);
 expect((await q('select prendre_notification($1,$2) n',[intention,randomUUID()]))[0].n).toBeNull();
 await q("update notification_intentions set verrou_jusqua=now()-interval '1 second' where id=$1",[intention]);
 await traiterNotificationCapturee(service,intention);expect(transport).toHaveBeenCalledTimes(1);
});
it('acceptation puis interruption avant rattachement : retrouve la preuve sans renvoyer',async()=>{
 await traiterNotificationCapturee(service,intention);
 await q("update notification_intentions set etat='preparation',verrou_jusqua=now()-interval '1 second',disponible_le=now(),courriel_id=null where id=$1",[intention]);
 await traiterNotificationCapturee(service,intention);expect(transport).toHaveBeenCalledTimes(1);expect((await state()).etat).toBe('conservee');
});
it('réponse perdue : état inconnu, aucun renvoi aveugle après reprise',async()=>{
 transport.mockRejectedValueOnce(Error('réponse perdue'));await traiterNotificationCapturee(service,intention);await retry();
 expect(transport).toHaveBeenCalledTimes(1);expect((await q('select etat from courriels_durables where id=$1',[(await state()).courriel_id]))[0].etat).toBe('inconnu');
});
it('refus récupérable puis droits retirés : reprise bloquée',async()=>{
 transport.mockResolvedValueOnce(new Response('limite',{status:429}));await traiterNotificationCapturee(service,intention);
 await q("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[tenant,org]);await q('update courriels_durables set reprendre_apres=now() where id=$1',[(await state()).courriel_id]);await retry();expect(transport).toHaveBeenCalledTimes(1);
});
it('source modifiée entre préparation et transport différé : ancien message bloqué',async()=>{
 transport.mockResolvedValueOnce(new Response('limite',{status:429}));await traiterNotificationCapturee(service,intention);
 await q("update messages set texte='Correction' where id=$1",[msg]);await q('update courriels_durables set reprendre_apres=now() where id=$1',[(await state()).courriel_id]);await retry();expect(transport).toHaveBeenCalledTimes(1);expect(await q('select id from notification_intentions where objet=$1',[msg])).toHaveLength(2);
});
it('aucune lecture ni prise par un rôle utilisateur, y compris via API directe',async()=>{
 await q('savepoint droits');await q('set local role authenticated');await expect(q('select * from notification_intentions')).rejects.toThrow();await q('rollback to droits');await q('set local role authenticated');await expect(q('select prendre_notification($1,$2)',[intention,randomUUID()])).rejects.toThrow();await q('rollback to droits');
});
it('un contexte d’une autre organisation est refusé',async()=>{
 const n=(await q('select prendre_notification($1,$2) n',[intention,randomUUID()]))[0].n;
 expect((await q('select empreinte_metier_courriel($1,$2) e',[randomUUID(),n.contexte]))[0].e).toBeNull();
});
it('verrou financier : activation directe interdite et réglage non modifiable par le service',async()=>{
 await q("select set_config('gerimmo.systeme','on',true)");await q("update organizations set status='essai' where id=$1",[org]);await q('savepoint finance');await expect(q("update organizations set status='active' where id=$1",[org])).rejects.toThrow('financière');await q('rollback to finance');
 await q('set local role service_role');await expect(q('update securite_instance_pilote set paiements_bloques=false')).rejects.toThrow();await q('rollback to finance');
});
it('les rappels de pièces suspendus ne créent pas une nouvelle notification initiale',async()=>{
 const piece=await id("insert into pieces_demandees(organization_id,person_id,type,libelle,demandee_par) values($1,$2,'justificatif','Pièce fictive',$3) returning id",[org,person,owner]);
 const n=await id('select id from notification_intentions where objet=$1',[piece]);await traiterNotificationCapturee(service,n);expect(transport).toHaveBeenCalledTimes(1);
 await q('update pieces_demandees set relancee_le=now() where id=$1',[piece]);expect(await q('select id from notification_intentions where objet=$1',[piece])).toHaveLength(1);
});
it('deux connexions simultanées : SKIP LOCKED empêche une seconde prise',async()=>{
 // Ces seules données fictives sont conservées pour rendre visibles les deux transactions concurrentes.
 await q('commit');const a=new Client({connectionString:url}),b=new Client({connectionString:url});await a.connect();await b.connect();
 try {await a.query('begin');await b.query('begin');const first=await a.query('select prendre_notification($1,$2) n',[intention,randomUUID()]);expect(first.rows[0].n.id).toBe(intention);
 const second=await b.query('select prendre_notification($1,$2) n',[intention,randomUUID()]);expect(second.rows[0].n).toBeNull();
 await a.query('rollback');expect((await b.query('select prendre_notification($1,$2) n',[intention,randomUUID()])).rows[0].n.id).toBe(intention);
 }finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();await q('begin');}
});
it('le réseau de repli conserve la confirmation Auth et son quota SQL',async()=>{
 const token='a'.repeat(56),email=(await q('select email from auth.users where id=$1',[tenant]))[0].email;
 await q("update auth.users set recovery_token=$2,recovery_sent_at=now() where id=$1",[tenant,token]);
 await q("insert into auth.one_time_tokens(user_id,token_type,token_hash,relates_to) values($1,'recovery_token',$2,$3)",[tenant,token,email]);
 expect((await q("select autoriser_confirmation_auth($1,'0.0.0.0','recovery',$2) n",[email,token]))[0].n).toMatchObject({user_id:tenant});
});
it('la création directe d’une organisation déjà payante est interdite',async()=>{
 await q('savepoint droits_payants');await expect(q("insert into organizations(name,status) values('Fictive interdite','active')")).rejects.toThrow('financière');await q('rollback to droits_payants');
});
it.each(['incident_urgent','mission_confiee','mission_acceptee','mission_refusee','devis_demande','devis_recu','rendez_vous_fixe','creneaux_proposes','signature_demandee'])('événement %s : objet absent ou d’un autre dossier ne produit aucune source',async evenement=>{
 expect((await q('select source_notification($1,$2,$3) s',[org,evenement,randomUUID()]))[0].s).toBeNull();
});
it('l’insertion ou la modification directe d’un abonnement payant est bloquée',async()=>{
 await q('savepoint payant');await expect(q("insert into abonnements(organization_id,stripe_customer_id) values($1,'cus_fictif')",[org])).rejects.toThrow('financière');await q('rollback to payant');
 await q('insert into abonnements(organization_id) values($1) on conflict do nothing',[org]);await expect(q("update abonnements set stripe_statut='active' where organization_id=$1",[org])).rejects.toThrow('financière');await q('rollback to payant');
});
it('notification capturée différée de six heures : reprise contrôlée sans changer son identité',async()=>{
 transport.mockResolvedValueOnce(new Response('limite',{status:429}));await traiterNotificationCapturee(service,intention);
 const m=(await q('select * from courriels_durables where id=$1',[(await state()).courriel_id]))[0];expect(new Date(m.expire_le).getTime()-Date.now()).toBeGreaterThan(11*60*60_000);
 await q('update courriels_durables set reprendre_apres=now() where id=$1',[m.id]);vi.setSystemTime(new Date(Date.now()+6*60*60_000));
 try{await retry();expect(transport).toHaveBeenCalledTimes(2);expect((await q('select etat from courriels_durables where id=$1',[m.id]))[0].etat).toBe('accepte');}finally{vi.useRealTimers();}
});
it.each(['proprietaire_direct','locataire'])('isolation SQL de deux organisations : rôle %s',async role=>{
 const autre=await id("insert into organizations(name,type,status) values('Autre SCI fictive','proprietaire_direct','essai') returning id");
 const doc=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Privé fictif',$2,'application/pdf',10,$3) returning id",[autre,autre+'/fictif.pdf',randomUUID()]);
 await q('savepoint isolation');await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:role==='locataire'?tenant:owner,role:'authenticated',aal:'aal2'})]);await q('set local role authenticated');
 expect(await q('select id from documents where id=$1',[doc])).toHaveLength(0);expect(await q('select id from persons where organization_id=$1',[autre])).toHaveLength(0);await q('rollback to isolation');
});
