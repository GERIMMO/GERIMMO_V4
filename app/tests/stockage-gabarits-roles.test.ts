import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)("Dépôts par rôle : parcours et cloisonnement",()=>{
 let db:Client,org:string,orgAutre:string,artisan:string,compte:string,locataire:string,autre:string,incident:string,mission:string,demande:string;
 const uuid=randomUUID;
 const id=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows[0].id as string;
 const agir=async(c:string)=>{await db.query('reset role');await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)",[c]);await db.query('set local role authenticated');};
 const essai=async(sql:string,args:unknown[]=[])=>{await db.query('savepoint essai');try{const r=await db.query(sql,args);await db.query('release savepoint essai');return r;}catch(e){await db.query('rollback to savepoint essai');throw e;}};
 const depot=(path:string)=>essai("insert into storage.objects(bucket_id,name,owner) values('documents',$1,auth.uid())",[path]);
 const preparation=async(path:string)=>{await db.query('reset role');await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,statut,entreprise,pdf_path,pdf_sha,pdf_taille,valide_le) values($1,$2,'valide','{}',$3,$4,10,now()) on conflict(sollicitation_id) do update set pdf_path=excluded.pdf_path,statut='valide'",[demande,artisan,path,'a'.repeat(64)]);await agir(compte);};
 beforeAll(async()=>{
  db=new Client({connectionString:url});await db.connect();await db.query('begin');
  org=await id("insert into organizations(name,status) values('TEST gabarits','active') returning id");
  orgAutre=await id("insert into organizations(name,status) values('TEST autre gabarits','active') returning id");
  compte=uuid();locataire=uuid();autre=uuid();
  for(const c of[compte,locataire,autre])await db.query("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1::uuid,concat($1::text,'@','test.local'),'{}','{}')",[c]);
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$3,'locataire'),($2,$3,'locataire')",[locataire,autre,org]);
  artisan=await id("insert into artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'TEST gabarits','55555555500333','0600000000','valide','verifie') returning id",[compte]);
  const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST','appartement','1 rue fictive','75001','Paris') returning id",[org]);
  const lot=await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','disponible') returning id",[org,bien]);
  incident=await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','TEST','declare') returning id",[org,lot]);
  const consultation=await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,incident]);
  demande=await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'envoyee') returning id",[org,consultation,incident,artisan]);
  mission=await id("insert into incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id",[org,incident,artisan]);
 });
 afterAll(async()=>{await db.query('rollback');await db.end();});
 beforeEach(async()=>{await db.query('reset role');await db.query('savepoint cas');});
 afterEach(async()=>{await db.query('rollback to savepoint cas');});
 it.each(['pdf','jpg','png'])('conserve les attestations artisan et locataire : %s',async(ext)=>{await agir(compte);await depot(`artisans/${artisan}/${uuid()}.${ext}`);await agir(locataire);await depot(`${org}/${uuid()}.${ext}`);});
 it.each(['jpg','png'])('conserve les photos chantier : %s',async(ext)=>{await agir(compte);await depot(`${org}/${uuid()}.${ext}`);});
 it.each(['envoyee','revision_demandee'])('conserve le PDF validé du devis %s',async(statut)=>{await db.query("update incident_sollicitations set statut=$1 where id=$2",[statut,demande]);const path=`${org}/devis-gerimmo/${uuid()}.pdf`;await preparation(path);await depot(path);});
 it('refuse un autre PDF que la préparation validée et une demande close',async()=>{await preparation(`${org}/devis-gerimmo/${uuid()}.pdf`);await expect(depot(`${org}/devis-gerimmo/${uuid()}.pdf`)).rejects.toThrow(/row-level/);await db.query('reset role');await db.query("update incident_sollicitations set statut='declinee' where id=$1",[demande]);const path=`${org}/devis-gerimmo/${uuid()}.pdf`;await preparation(path);await expect(depot(path)).rejects.toThrow(/row-level/);});
 it('conserve la facture après clôture documentée, refuse la mauvaise mission',async()=>{
  const doc=await id("insert into documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident',$2,'image/png',10,$3) returning id",[org,`${org}/${uuid()}.png`,'b'.repeat(64)]);
  await db.query("insert into intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')",[org,mission,doc]);
  await db.query("insert into intervention_comptes_rendus(organization_id,intervention_id,artisan_id,travaux_realises) values($1,$2,$3,'TEST terminé')",[org,mission,artisan]);
  await db.query("update incident_interventions set statut='terminee',terminee_le=now() where id=$1",[mission]);
  await agir(compte);await depot(`${org}/factures-artisan/${mission}/${uuid()}.pdf`);await expect(depot(`${org}/factures-artisan/${uuid()}/${uuid()}.pdf`)).rejects.toThrow(/row-level/);
  await expect(depot(`${org}/${uuid()}.jpg`)).rejects.toThrow(/row-level/);
 });
 it('la reprise de photo exige sa réservation propre et encore en attente',async()=>{
  const reservation=uuid(),path=`${org}/incidents-reprise/${locataire}/${reservation}.jpg`;
  await db.query("insert into depots_photos_incident(id,organization_id,account_id,incident_id,empreinte,mime,taille,storage_path) values($1,$2,$3,$4,$5,'image/jpeg',10,$6)",[reservation,org,locataire,incident,'c'.repeat(64),path]);
  await agir(autre);await expect(depot(path)).rejects.toThrow(/row-level/);
  await agir(locataire);await depot(path);
  await expect(depot(`${org}/incidents-reprise/${locataire}/${uuid()}.jpg`)).rejects.toThrow(/row-level/);
  await db.query('reset role');await db.query("delete from storage.objects where name=$1",[path]);await db.query("update depots_photos_incident set etat='abandonne' where id=$1",[reservation]);await agir(locataire);await expect(depot(path)).rejects.toThrow(/row-level/);
 });
 it.each(['compte','locataire'])('refuse les autres organisations et chemins inattendus (%s)',async(role)=>{
  await agir(role==='compte'?compte:locataire);
  for(const path of[`${orgAutre}/${uuid()}.jpg`,`${org}/sous-dossier/${uuid()}.jpg`,`${org}/${uuid()}.html`,`${org}/${uuid()}.pdf/ajout`, `artisans/${uuid()}/${uuid()}.pdf`])await expect(depot(path)).rejects.toThrow(/row-level/);
 });
 it('ne permet ni écrasement ni lecture de fichiers sans fiche',async()=>{const path=`${org}/${uuid()}.jpg`;await agir(compte);await depot(path);expect((await essai('update storage.objects set metadata=$1 where name=$2',[{test:true},path])).rowCount).toBe(0);expect((await db.query('select name from storage.objects where name=$1',[path])).rows).toEqual([]);});
 it('rejeu et retour préservent les politiques et tous les objets',async()=>{
  const nom='20261020030000_stockage_gabarits_roles';const avant=(await db.query("select policyname,with_check from pg_policies where schemaname='storage' and policyname in('ged_insert_artisan','ged_insert_locataire') order by policyname")).rows;
  const n=(await db.query('select count(*) from storage.objects')).rows[0].count;
  const source=readFileSync(`supabase/migrations/${nom}.sql`,'utf8');await db.query(source);
  const retour=readFileSync(`supabase/retours-arriere/${nom}.retour.sql`,'utf8');
  await db.query(retour);await db.query(source);
  expect((await db.query("select policyname,with_check from pg_policies where schemaname='storage' and policyname in('ged_insert_artisan','ged_insert_locataire') order by policyname")).rows).toEqual(avant);
  expect((await db.query('select count(*) from storage.objects')).rows[0].count).toBe(n);
  for(const f of['ged_depot_artisan_autorise(text)','ged_depot_locataire_autorise(text)'])expect((await db.query("select has_function_privilege('anon',$1,'execute') as ok",[`public.${f}`])).rows[0].ok).toBe(false);
 });
});
