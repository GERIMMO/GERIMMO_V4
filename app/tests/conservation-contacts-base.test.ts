import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const url=process.env.SUPABASE_DB_URL;
if(url&&(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)||!new URL(url).pathname.includes('ci_')))throw Error('Base fictive locale obligatoire');
const nom='20261022213731_conservation_preuves_et_invitations';
const migration=readFileSync(`supabase/migrations/${nom}.sql`,'utf8');
const retour=readFileSync(`supabase/retours-arriere/${nom}.retour.sql`,'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'');
describe.skipIf(!url)('Conservation : données réelles simulées et rôles',()=>{
 let db:Client,org:string,owner:string,person:string,bail:string;
 const id=async(sql:string,p:unknown[]=[])=>String((await db.query(sql,p)).rows[0].id);
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 beforeEach(async()=>{
  await db.query('begin');await db.query(migration);
  // La recette a pu suspendre les tâches : levée uniquement dans cette transaction locale annulée.
  await db.query("update public.supervision_arrets set arrete=false where cle in ('global','purge')");
  org=await id("insert into public.organizations(name,type,status) values('Conservation fictive','proprietaire_direct','active') returning id");
  owner=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.invalid') returning id");
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[owner,org]);
  const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Fictif','appartement','Rue fictive','69001','Lyon',false) returning id",[org]);
  const lot=await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id",[org,bien]);
  person=await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictive','Personne') returning id",[org]);
  bail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',public.aujourdhui_paris(),500,20) returning id",[org,lot,person]);
 });
 afterEach(async()=>{await db.query('rollback');});
 const document=()=>id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,retention_reference_date) values($1,'autre','Fictif',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',100,repeat(md5(gen_random_uuid()::text),2),current_date-interval '7 years') returning id",[org]);
 const invitation=(etat:string)=>id("insert into public.invitations_locataires(organization_id,person_id,account_id,email,etat,cree_par,cree_le,expire_le,repondu_le) values($1,$2,$3,'fictif@example.invalid',$4,$3,now()-interval '8 months',now()-interval '7 months',now()-interval '7 months') returning id",[org,person,owner,etat]);
 it('protège original, signé, annexe et certificat, sans protéger un fichier sans lien',async()=>{
  const ids:string[]=[]; for(let i=0;i<5;i++)ids.push(await document());
  await db.query("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,document_signe,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,annexes,etat) values($1,$2,$3,$4,$5,'zoho','production',repeat('a',64),repeat('a',64),$6,$7,'pret')",[org,bail,ids[0],ids[1],owner,JSON.stringify([{preuveDocumentId:ids[3]},{}]),JSON.stringify([{id:ids[2]}])]);
  const controles=await db.query('select id,public.document_preuve_signature(id) protege from public.documents where id=any($1::uuid[])',[ids]);
  expect(controles.rows.filter(r=>r.protege).map(r=>r.id).sort()).toEqual(ids.slice(0,4).sort());
  await db.query("select public.appliquer_retention()");
  expect((await db.query('select count(*)::int n from public.documents where id=any($1::uuid[]) and purged_at is null',[ids])).rows[0].n).toBe(4);
 });
 it('une signature ancienne ne perd pas son suivi après deux ans',async()=>{
  const original=await document(),signe=await document(),preuve=await document();
  await db.query("alter table public.demandes_signature disable trigger signature_manuelle_fin_nouveaux_envois");
  const demande=await id("insert into public.demandes_signature(organization_id,document_id,document_retour_id,preuve_document_id,person_id,created_by,signee_le) values($1,$2,$3,$4,$5,$6,now()-interval '7 years') returning id",[org,original,signe,preuve,person,owner]);
  await db.query('select public.appliquer_retention()');
  expect((await db.query('select count(*)::int n from public.demandes_signature where id=$1',[demande])).rows[0].n).toBe(1);
  expect((await db.query('select count(*)::int n from public.documents where id=any($1::uuid[]) and purged_at is null',[[original,signe,preuve]])).rows[0].n).toBe(3);
 });
 it('la nouvelle règle désactivée conserve les invitations ; activée, elle garde les invitations acceptées et les comptes',async()=>{
  const ancienne=await invitation('expiree'),acceptee=await invitation('acceptee');
  await db.query('select public.purger_contacts_echus()');
  expect((await db.query('select count(*)::int n from public.invitations_locataires where id=any($1::uuid[])',[[ancienne,acceptee]])).rows[0].n).toBe(2);
  await db.query("update public.retention_rules set actif=true where data_type='invitation:locataire'");
  await db.query('select public.purger_contacts_echus()');
  expect((await db.query('select id from public.invitations_locataires where id=any($1::uuid[])',[[ancienne,acceptee]])).rows.map(r=>r.id)).toEqual([acceptee]);
  expect((await db.query('select count(*)::int n from public.accounts where id=$1',[owner])).rows[0].n).toBe(1);
 });
 it('le dernier échange repousse la date et la désactivation du devis est respectée',async()=>{
  const vieux=await id("insert into public.demandes_devis(nom,email,created_at) values('Fictif',gen_random_uuid()||'@example.invalid',now()-interval '3 years') returning id");
  const recent=await id("insert into public.demandes_devis(nom,email,created_at,traitee_le) values('Fictif',gen_random_uuid()||'@example.invalid',now()-interval '3 years',now()) returning id");
  await db.query("update public.demandes_devis set created_at=now()-interval '3 years' where id=any($1::uuid[])",[[vieux,recent]]);
  await db.query("update public.demandes_devis set traitee_le=now() where id=$1",[recent]);
  await db.query("update public.retention_rules set actif=false where data_type='contact:devis'");await db.query('select public.appliquer_retention()');
  expect((await db.query('select count(*)::int n from public.demandes_devis where id=any($1::uuid[])',[[vieux,recent]])).rows[0].n).toBe(2);
  await db.query("update public.retention_rules set actif=true where data_type='contact:devis'");await db.query('select public.appliquer_retention()');
  expect((await db.query('select id from public.demandes_devis where id=any($1::uuid[])',[[vieux,recent]])).rows.map(r=>r.id)).toEqual([recent]);
 });
 it('les invitations artisans gardent les acceptations et les réponses récentes',async()=>{
  const invitationArtisan=async(etat:string)=>id("insert into public.invitations_artisans(organization_id,email,etat,cree_par,expire_le,repondu_le) values($1,gen_random_uuid()||'@example.invalid',$2,$3,now()-interval '7 months',now()-interval '7 months') returning id",[org,etat,owner]);
  const vieille=await invitationArtisan('expiree'),acceptee=await invitationArtisan('acceptee'),recente=await invitationArtisan('refusee');
  await db.query('update public.invitations_artisans set repondu_le=now() where id=$1',[recente]);
  await db.query('select public.purger_contacts_echus()');
  expect((await db.query('select count(*)::int n from public.invitations_artisans where id=any($1::uuid[])',[[vieille,acceptee,recente]])).rows[0].n).toBe(3);
  await db.query("update public.retention_rules set actif=true where data_type='invitation:artisan'");
  await db.query('select public.purger_contacts_echus()');
  expect((await db.query('select id from public.invitations_artisans where id=any($1::uuid[])',[[vieille,acceptee,recente]])).rows.map(r=>r.id).sort()).toEqual([acceptee,recente].sort());
 });
 it('les listes d’attente restent inactives par défaut et respectent le dernier contact agence',async()=>{
  const particulier=await id("insert into public.liste_attente(email) values(gen_random_uuid()||'@example.invalid') returning id");
  const agence=()=>id("insert into public.liste_attente_agences(email,agence,contact,code_postal,nb_lots) values(gen_random_uuid()||'@example.invalid','Agence fictive','Contact fictif','69001','moins_de_50') returning id");
  const vieille=await agence(),recente=await agence();
  await db.query("update public.liste_attente set created_at=now()-interval '4 years' where id=$1",[particulier]);
  await db.query("update public.liste_attente_agences set created_at=now()-interval '4 years' where id=any($1::uuid[])",[[vieille,recente]]);
  await db.query('update public.liste_attente_agences set contactee_le=now() where id=$1',[recente]);
  await db.query('select public.purger_contacts_echus()');
  expect((await db.query('select count(*)::int n from public.liste_attente_agences where id=any($1::uuid[])',[[vieille,recente]])).rows[0].n).toBe(2);
  await db.query("update public.retention_rules set actif=true where data_type in ('contact:attente','contact:attente_agences')");
  await db.query('select public.purger_contacts_echus()');
  expect((await db.query('select id from public.liste_attente_agences where id=any($1::uuid[])',[[vieille,recente]])).rows.map(r=>r.id)).toEqual([recente]);
  expect((await db.query('select count(*)::int n from public.liste_attente where id=$1',[particulier])).rows[0].n).toBe(0);
 });
 it('l’arrêt d’urgence empêche aussi le nettoyage direct des invitations',async()=>{
  const ancienne=await invitation('expiree');
  await db.query("update public.retention_rules set actif=true where data_type='invitation:locataire'");
  await db.query("insert into public.supervision_arrets(cle,arrete,motif,auteur) values('purge',true,'Essai local', $1) on conflict(cle) do update set arrete=true",[owner]);
  expect((await db.query('select public.purger_contacts_echus() r')).rows[0].r).toEqual({});
  expect((await db.query('select count(*)::int n from public.invitations_locataires where id=$1',[ancienne])).rows[0].n).toBe(1);
 });
 it.each(['anon','authenticated'])('refuse le nettoyage direct au rôle %s',async role=>{
  await db.query('set local role '+role);await expect(db.query('select public.purger_contacts_echus()')).rejects.toMatchObject({code:'42501'});
 });
 it('la simulation exige le superadmin avec MFA et ne supprime rien',async()=>{
  const i=await invitation('expiree');
  await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[owner]);
  await db.query('savepoint sans_droit');await expect(db.query('select public.simuler_conservation_contacts()')).rejects.toMatchObject({code:'42501'});await db.query('rollback to sans_droit');
  await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')",[owner]);
  await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal1')::text,true)",[owner]);
  await db.query('savepoint sans_mfa');await expect(db.query('select public.simuler_conservation_contacts()')).rejects.toMatchObject({code:'42501'});await db.query('rollback to sans_mfa');
  await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[owner]);
  const r=(await db.query('select public.simuler_conservation_contacts() r')).rows[0].r;
  expect(r.suppressions).toBe(0);expect(r.categories.find((c:{categorie:string})=>c.categorie==='invitation:locataire').echus).toBeGreaterThan(0);
  expect((await db.query('select count(*)::int n from public.invitations_locataires where id=$1',[i])).rows[0].n).toBe(1);
 });
 it('rejoue et revient sans perdre les durées ni réintroduire la purge des signatures',async()=>{
  await db.query("update public.retention_rules set duree_mois=6 where data_type='invitation:locataire'");
  await db.query(migration);await db.query(retour);await db.query(migration);
  expect((await db.query("select duree_mois,actif from public.retention_rules where data_type='invitation:locataire'")).rows[0]).toEqual({duree_mois:6,actif:false});
  expect((await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) f")).rows[0].f).toContain('not public.document_preuve_signature(d.id)');
 });
});
