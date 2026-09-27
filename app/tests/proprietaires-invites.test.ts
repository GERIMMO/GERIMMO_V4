import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({path:".env.local"});const DB=process.env.SUPABASE_DB_URL;verifierBaseDeTest(DB);

describe.skipIf(!DB)("Propriétaires invités — accès séparé, gratuit pour l’invité et cloisonné",()=>{
 let db:Client;let org:string,autreOrg:string,admin:string,agent:string,invite:string,autreInvite:string,nonConfirme:string;
 let personne:string,autrePersonne:string,lot:string,autreLot:string,rapport:string,autreRapport:string,document:string,autreDocument:string,jeton:string;
 const id=async(sql:string,params:unknown[]=[])=>String((await db.query(sql,params)).rows[0].id);
 const compte=async(email:string,confirme=true)=>id("insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),$1,case when $2 then now() else null end) returning id",[email,confirme]);
 const postgres=async()=>{await db.query('reset role');await db.query("select set_config('request.jwt.claims','',true)");};
 const agir=async(qui:string)=>{await db.query('reset role');await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[qui]);await db.query('set local role authenticated');};
 const essayer=async(sql:string,params:unknown[]=[])=>{await db.query('savepoint essai_invite');try{const r=await db.query(sql,params);await db.query('release savepoint essai_invite');return r;}catch(e){await db.query('rollback to savepoint essai_invite');await db.query('release savepoint essai_invite');throw e;}};
 const construire=async(nom:string,email:string)=>{
  const p=await id("insert into public.persons(organization_id,nom,email) values($1,$2,$3) returning id",[org,nom,email]);
  const b=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'appartement','1 rue fictive','69003','Lyon') returning id",[org,nom]);
  const l=await id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,$3) returning id",[org,b,nom]);
  await db.query("insert into public.detentions(organization_id,person_id,lot_id,quote_part,date_debut) values($1,$2,$3,100,current_date-90)",[org,p,l]);
  const m=await id("insert into public.mandats(organization_id,person_id,date_debut) values($1,$2,current_date-90) returning id",[org,p]);
  await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,date_debut,taux_honoraires) values($1,$2,$3,current_date-90,7)",[org,m,l]);
  await db.query("update public.mandats set etat='actif' where id=$1",[m]);
  const r=await id("insert into public.rapports_gestion(organization_id,mandat_id,mois,statut,net) values($1,$2,date_trunc('month',current_date),'envoye',500) returning id",[org,m]);
  const d=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'rapport_gestion',$2,$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',100,'test-'||gen_random_uuid()) returning id",[org,`Compte rendu mensuel · ${r}`]);
  await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'personne',$3),($1,$2,'mandat',$4)",[org,d,p,m]);
  return{p,l,r,d};
 };
 const accepter=async()=>{await agir(invite);await db.query('select public.accepter_invitation_proprietaire($1)',[jeton]);};
 const espace=async()=> (await db.query('select public.espace_proprietaire_invite($1) as espace',[org])).rows[0].espace;
 beforeAll(async()=>{
  db=new Client({connectionString:DB});await db.connect();await db.query('begin');
  const suffix=crypto.randomUUID();
  [admin,agent,invite,autreInvite,nonConfirme]=[await compte(`admin-${suffix}@test.local`),await compte(`agent-${suffix}@test.local`),await compte(`invite-${suffix}@test.local`),await compte(`autre-${suffix}@test.local`),await compte(`sansconfirmation-${suffix}@test.local`,false)];
  org=await id("insert into public.organizations(tarification_version,name,type,status) values('historique','Agence invités test','agence','active') returning id");
  autreOrg=await id("insert into public.organizations(tarification_version,name,type,status) values('historique','Agence étrangère test','agence','active') returning id");
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$3,'admin_agence'),($2,$3,'agent')",[admin,agent,org]);
  const a=await construire('Lot invité',`invite-${suffix}@test.local`);const b=await construire('Lot autre propriétaire',`autre-${suffix}@test.local`);
  personne=a.p;lot=a.l;rapport=a.r;document=a.d;autrePersonne=b.p;autreLot=b.l;autreRapport=b.r;autreDocument=b.d;
  await agir(admin);jeton=String((await db.query('select public.preparer_invitation_proprietaire($1,$2) as jeton',[org,personne])).rows[0].jeton);await postgres();
 });
 beforeEach(async()=>{await db.query('savepoint cas_invite');});afterEach(async()=>{await db.query('rollback to savepoint cas_invite');await db.query('release savepoint cas_invite');});
 afterAll(async()=>{await db?.query('rollback');await db?.end();});
 it('réserve les invitations au responsable et ne stocke pas le lien en clair',async()=>{
  expect(jeton).toMatch(/^[0-9a-f]{64}$/);await agir(agent);
  await expect(essayer('select public.preparer_invitation_proprietaire($1,$2)',[org,personne])).rejects.toThrow(/responsable/);
  await agir(admin);await expect(essayer('select public.preparer_invitation_proprietaire($1,$2)',[autreOrg,personne])).rejects.toThrow(/responsable/);
  await postgres();const r=(await db.query('select jeton_empreinte,compte_id from public.proprietaires_invites where agence_id=$1',[org])).rows[0];expect(r.jeton_empreinte).not.toBe(jeton);expect(r.compte_id).toBeNull();
 });
 it('refuse le lien à une autre adresse puis donne seulement les lots et rapports du destinataire',async()=>{
  await agir(autreInvite);await expect(essayer('select public.accepter_invitation_proprietaire($1)',[jeton])).rejects.toThrow(/adresse e-mail vérifiée/);
  await accepter();const e=await espace();expect(e.lots.map((l:{id:string})=>l.id)).toEqual([lot]);expect(e.lots.map((l:{id:string})=>l.id)).not.toContain(autreLot);expect(e.rapports.map((r:{id:string})=>r.id)).toEqual([rapport]);expect(e.rapports.map((r:{id:string})=>r.id)).not.toContain(autreRapport);
  await expect(essayer('select public.espace_proprietaire_invite($1)',[autreOrg])).rejects.toThrow(/pas accessible/);
 });
 it('ne crée ni rôle gestionnaire, ni organisation, ni abonnement personnel',async()=>{
  await postgres();const avant=(await db.query('select count(*)::int as n from public.organizations')).rows[0].n;
  await accepter();await postgres();expect((await db.query('select count(*)::int as n from public.organizations')).rows[0].n).toBe(avant);
  expect((await db.query('select * from public.memberships where account_id=$1',[invite])).rows).toHaveLength(0);
  await agir(invite);expect((await db.query('select * from public.mes_espaces_proprietaire_invite()')).rows).toEqual([{agence_id:org,agence_nom:'Agence invités test'}]);
  expect((await db.query('select id from public.biens where organization_id=$1',[org])).rows).toHaveLength(0);
  await expect(essayer("insert into public.biens(organization_id,nom,type) values($1,'Intrusion','appartement')",[org])).rejects.toThrow();
 });
 it('contrôle et journalise les PDF, refuse un rapport tiers et tout fichier sans rattachement',async()=>{
  await accepter();expect((await db.query('select * from public.proprietaire_invite_fichier($1,$2)',[org,document])).rows).toHaveLength(1);
  await expect(essayer('select * from public.proprietaire_invite_fichier($1,$2)',[org,autreDocument])).rejects.toThrow(/inaccessible/);
  await expect(essayer('select * from public.proprietaire_invite_fichier($1,$2)',[autreOrg,document])).rejects.toThrow(/inaccessible/);
  await postgres();expect((await db.query('select count(*)::int as n from public.acces_pieces_log where account_id=$1 and document_id=$2',[invite,document])).rows[0].n).toBe(1);
  await db.query("delete from public.document_liens where document_id=$1 and entite='personne'",[document]);await agir(invite);
  await expect(essayer('select * from public.proprietaire_invite_fichier($1,$2)',[org,document])).rejects.toThrow(/inaccessible/);
 });
 it('ne dépend pas de l’abonnement du propriétaire ni des droits d’écriture de l’agence',async()=>{
  await postgres();await db.query("select set_config('gerimmo.systeme','on',true)");await db.query("update public.organizations set status='suspendue' where id=$1",[org]);await db.query("select set_config('gerimmo.systeme','',true)");
  await accepter();expect((await espace()).rapports).toHaveLength(1);expect((await db.query('select * from public.proprietaire_invite_fichier($1,$2)',[org,document])).rows).toHaveLength(1);
 });
 it('refuse une adresse non vérifiée et un compte bloqué, puis révoque immédiatement l’accès',async()=>{
  await postgres();await db.query('update auth.users set email_confirmed_at=null where id=$1',[invite]);await agir(invite);await expect(essayer('select public.accepter_invitation_proprietaire($1)',[jeton])).rejects.toThrow(/vérifiée/);
  await postgres();await db.query('update auth.users set email_confirmed_at=now() where id=$1',[invite]);await accepter();await postgres();await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[invite]);await agir(invite);await expect(essayer('select public.espace_proprietaire_invite($1)',[org])).rejects.toThrow(/pas accessible/);
  await postgres();await db.query('update auth.users set banned_until=null where id=$1',[invite]);await agir(admin);await db.query('select public.revoquer_invitation_proprietaire($1,$2)',[org,personne]);await agir(invite);await expect(essayer('select public.espace_proprietaire_invite($1)',[org])).rejects.toThrow(/pas accessible/);
 });
 it('un lien remplacé ou expiré ne s’accepte plus, une acceptation répétée ne double rien',async()=>{
  await accepter();await db.query('select public.accepter_invitation_proprietaire($1)',[jeton]);await postgres();expect((await db.query('select count(*)::int as n from public.proprietaires_invites where agence_id=$1 and person_id=$2',[org,personne])).rows[0].n).toBe(1);
  await agir(admin);const suivant=String((await db.query('select public.preparer_invitation_proprietaire($1,$2) jeton',[org,personne])).rows[0].jeton);await agir(invite);await expect(essayer('select public.accepter_invitation_proprietaire($1)',[jeton])).rejects.toThrow(/invalide/);
  await postgres();await db.query("update public.proprietaires_invites set expire_le=now()-interval '1 second' where agence_id=$1 and person_id=$2",[org,personne]);await agir(invite);await expect(essayer('select public.accepter_invitation_proprietaire($1)',[suivant])).rejects.toThrow(/expirée/);
 });
 it('préserve les rapports historiques sans exposer un lot sorti de détention',async()=>{
  await accepter();await postgres();await db.query('update public.detentions set date_fin=current_date-1 where person_id=$1',[personne]);await agir(invite);const e=await espace();expect(e.lots).toHaveLength(0);expect(e.rapports).toHaveLength(1);
 });
 it('refuse le contournement par modification de table ou appel de fonction interne',async()=>{
  await agir(invite);await expect(essayer('update public.proprietaires_invites set compte_id=$1 where person_id=$2',[invite,autrePersonne])).rejects.toThrow(/permission denied/);
  await expect(essayer('select public.proprietaire_invite_personnes($1)',[org])).rejects.toThrow(/permission denied/);
  await expect(essayer('select public.proprietaire_invite_document_lisible($1)',[document])).rejects.toThrow(/permission denied/);
  await db.query('reset role');await db.query('set local role anon');await expect(essayer('select public.accepter_invitation_proprietaire($1)',[jeton])).rejects.toThrow(/permission denied/);
 });
});
