// X11 (FIN-09) : la capture fiscale d'un encaissement de loyer ne doit pas dépendre de
// l'ordre dans lequel le moteur déclenche les lignes d'un INSERT multi-lignes.
//
// Avant correction, « déjà encaissé avant » était la somme de TOUS les autres encaissements
// du bail visibles à cet instant. Dans un INSERT à plusieurs lignes, toutes les lignes existent
// quand la première est captée : chacune comptait les autres comme « avant » et la ventilation
// était fausse (680 € affectés au lieu de 840 € pour deux paiements de 500 € sur un appel de 840 €).
//
// Ces tests tournent dans une transaction annulée, sur une base locale jetable (gerimmo_ci_…).
import {config} from 'dotenv';
import {Client} from 'pg';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
config({path:'.env.local'});const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);

type Composante={encaissement_id:string;montant:string;loyer_hc:string;charges:string;non_ventile:string};
const centimes=(v:string|number)=>Math.round(Number(v)*100);

describe.skipIf(!url)('X11 / FIN-09 : capture fiscale indépendante de l\'ordre des lignes d\'un INSERT',()=>{
 let db:Client,org:string,lot:string,bail:string,bail2:string;
 const COLONNES='organization_id,bail_id,montant,date_paiement';
 // Une ligne = un paiement ; l'ordre de la liste est l'ordre des lignes de l'INSERT.
 const inserer=async(montants:number[],bailCible=bail)=>{
  const valeurs=montants.map((_,i)=>`($1,$2,$${i+3},'2026-10-12')`).join(',');
  const r=await db.query(`insert into public.encaissements(${COLONNES}) values ${valeurs} returning id`,[org,bailCible,...montants]);
  return r.rows.map(x=>x.id as string);
 };
 const unParUn=async(montants:number[],bailCible=bail)=>{const ids:string[]=[];for(const m of montants)ids.push(...await inserer([m],bailCible));return ids;};
 const composantes=async(ids:string[]):Promise<Composante[]>=>{
  const r=await db.query(`select e.encaissement_id,e.montant::text,c.loyer_hc::text,c.charges::text,c.non_ventile::text
   from public.ecritures e join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id
   where e.encaissement_id=any($1::uuid[]) and e.categorie='loyer' and e.contre_ecriture_de is null`,[ids]);
  // Dans l'ordre demandé, pas dans celui de la base.
  return ids.map(id=>r.rows.find(x=>x.encaissement_id===id) as Composante);
 };
 const somme=(l:Composante[],cle:'loyer_hc'|'charges'|'non_ventile'|'montant')=>l.reduce((s,x)=>s+centimes(x[cle]),0);
 const resume=(l:Composante[])=>l.map(x=>[x.loyer_hc,x.charges,x.non_ventile]);
 const lot_et_bail=async(nom:string,loyer:number,charges:number)=>{
  const bien=(await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'immeuble','1 rue TEST','75001','Paris') returning id",[org,nom])).rows[0].id;
  const l=(await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'loue') returning id",[org,bien,nom])).rows[0].id;
  const personne=(await db.query("insert into persons(organization_id,nom,prenom) values($1,'TEST',$2) returning id",[org,nom])).rows[0].id;
  const b=(await db.query("insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif','2026-10-01',$4,$5) returning id",[org,l,personne,loyer,charges])).rows[0].id;
  await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,'2026-10-01','2026-10-05',$3,$4,$5)",[org,b,loyer,charges,loyer+charges]);
  return {l,b};
 };

 beforeAll(async()=>{
  if(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url))throw Error('Base locale dédiée requise');
  db=new Client({connectionString:url});await db.connect();await db.query('begin');
  org=(await db.query("insert into organizations(name,status,type) values('TEST X11','active','proprietaire_direct') returning id")).rows[0].id;
  ({l:lot,b:bail}=await lot_et_bail('TEST X11 A',780,60));
  ({b:bail2}=await lot_et_bail('TEST X11 B',500,100));
 });
 beforeEach(async()=>{await db.query('savepoint scenario');});
 afterEach(async()=>{await db.query('rollback to savepoint scenario');});
 afterAll(async()=>{await db?.query('rollback');await db?.end();});

 it('le cas du registre : 500 € + 500 € dans un seul INSERT sur un appel de 840 € = 780 + 60 affectés et 160 € non ventilés',async()=>{
  const c=await composantes(await inserer([500,500]));
  expect(somme(c,'loyer_hc')).toBe(78000);
  expect(somme(c,'charges')).toBe(6000);
  expect(somme(c,'non_ventile')).toBe(16000);
 });

 it.each([[[500,500]],[[300,540]],[[540,300]],[[200,200,440]],[[440,200,200]],[[1000]]] as [number[]][])(
  'un INSERT %j donne exactement le résultat de la même suite en INSERT successifs, quel que soit l\'ordre',
  async(montants)=>{
   const enBloc=resume(await composantes(await inserer(montants)));
   await db.query('rollback to savepoint scenario');await db.query('savepoint scenario');
   const successifs=resume(await composantes(await unParUn(montants)));
   expect(enBloc).toEqual(successifs);
  });

 it.each([[[300,540]],[[540,300]],[[250,250,340]],[[340,250,250]]] as [number[]][])(
  'le total affecté ne dépend pas de l\'ordre des lignes (%j) : tout l\'appel est ventilé, rien n\'est compté deux fois',
  async(montants)=>{
   const c=await composantes(await inserer(montants));
   expect(somme(c,'loyer_hc')).toBe(78000);
   expect(somme(c,'charges')).toBe(6000);
   expect(somme(c,'non_ventile')).toBe(0);
   // Aucun paiement n'est ventilé au-delà de son montant.
   for(const x of c)expect(centimes(x.loyer_hc)+centimes(x.charges)+centimes(x.non_ventile)).toBe(centimes(x.montant));
  });

 it('deux appels : un INSERT de trois paiements ventile les deux échéances sans double compte',async()=>{
  await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,'2026-11-01','2026-11-05',900,60,960)",[org,bail]);
  const c=await composantes(await inserer([840,960,100]));
  expect(somme(c,'loyer_hc')).toBe(78000+90000);
  expect(somme(c,'charges')).toBe(6000+6000);
  expect(somme(c,'non_ventile')).toBe(10000);
 });

 it('un INSERT sur deux baux : chaque bail est ventilé comme s\'il était seul',async()=>{
  const valeurs=[[bail,300],[bail2,200],[bail,540],[bail2,400]];
  const r=await db.query(`insert into public.encaissements(${COLONNES}) values ${valeurs.map((_,i)=>`($1,$${2*i+2},$${2*i+3},'2026-10-12')`).join(',')} returning id,bail_id`,[org,...valeurs.flat()]);
  const c=await composantes(r.rows.map(x=>x.id));
  const duBail=(b:string)=>c.filter((_,i)=>r.rows[i].bail_id===b);
  expect([somme(duBail(bail),'loyer_hc'),somme(duBail(bail),'charges'),somme(duBail(bail),'non_ventile')]).toEqual([78000,6000,0]);
  expect([somme(duBail(bail2),'loyer_hc'),somme(duBail(bail2),'charges'),somme(duBail(bail2),'non_ventile')]).toEqual([50000,10000,0]);
 });

 it('un paiement antérieur sans capture (avant la fonction) compte toujours comme « déjà encaissé »',async()=>{
  await db.query('alter table public.ecritures disable trigger z_capturer_fiscalite');
  const [ancien]=await inserer([300]);
  await db.query("update public.encaissements set created_at=now()-interval '40 days' where id=$1",[ancien]);
  await db.query('alter table public.ecritures enable trigger z_capturer_fiscalite');
  const [c]=await composantes(await inserer([540]));
  // 300 € déjà couverts avant, 540 € ensuite : l'appel de 840 € est soldé, charges = 60 − 21,43 pour les 300 premiers.
  expect(c).toMatchObject({loyer_hc:'501.43',charges:'38.57',non_ventile:'0.00'});
  const detail=(await db.query("select (appels->0->>'couvert_avant')::numeric as avant from public.fiscal_encaissements_composantes where ecriture_id=(select id from public.ecritures where encaissement_id=$1 and categorie='loyer')",[c.encaissement_id])).rows[0];
  expect(centimes(detail.avant)).toBe(30000);
 });

 it('une saisie déjà captée compte toujours, même si son horodatage est plus tardif (deux transactions concurrentes)',async()=>{
  // La première transaction (horodatage plus récent) est validée avant la seconde (horodatage plus ancien).
  const [premier]=await inserer([500]);
  await db.query("update public.encaissements set created_at=now()+interval '2 hours' where id=$1",[premier]);
  const [second]=await inserer([500]);
  const c=await composantes([premier,second]);
  // 1 000 € versés pour un appel de 840 € : 840 affectés, 160 non ventilés, aucun montant compté deux fois.
  expect(somme(c,'loyer_hc')).toBe(78000);
  expect(somme(c,'charges')).toBe(6000);
  expect(somme(c,'non_ventile')).toBe(16000);
 });

 it('un INSERT multi-lignes directement sur les écritures (import) est aussi indépendant de l\'ordre',async()=>{
  await db.query('alter table public.encaissements disable trigger encaissement_ecritures');
  const ids=await inserer([300,540]);
  await db.query('alter table public.encaissements enable trigger encaissement_ecritures');
  expect((await db.query('select count(*)::int n from public.ecritures where encaissement_id=any($1::uuid[])',[ids])).rows[0].n).toBe(0);
  await db.query(`insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,encaissement_id)
   values($1,$2,$3,'loyer','recette',300,'2026-10-12','2026-10-12','Import',$4),($1,$2,$3,'loyer','recette',540,'2026-10-12','2026-10-12','Import',$5)`,[org,bail,lot,ids[0],ids[1]]);
  const c=await composantes(ids);
  expect(somme(c,'loyer_hc')).toBe(78000);
  expect(somme(c,'charges')).toBe(6000);
  expect(somme(c,'non_ventile')).toBe(0);
 });

 it('un paiement seul reste figé à 780 + 60 (comportement inchangé)',async()=>{
  const [k]=await inserer([840]);
  const [avant]=await composantes([k]);
  expect(avant).toMatchObject({loyer_hc:'780.00',charges:'60.00',non_ventile:'0.00'});
 });
});
