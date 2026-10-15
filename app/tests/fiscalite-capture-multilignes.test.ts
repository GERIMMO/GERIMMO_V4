// X11 (FIN-09) : la capture fiscale d'un encaissement de loyer ne doit pas dépendre de
// l'ordre dans lequel le moteur déclenche les lignes d'un INSERT multi-lignes.
//
// Avant correction, « déjà encaissé avant » était la somme de TOUS les autres encaissements
// du bail visibles à cet instant. Dans un INSERT à plusieurs lignes, toutes les lignes existent
// quand la première est captée : chacune comptait les autres comme « avant » et la ventilation
// était fausse (680 € affectés au lieu de 840 € pour deux paiements de 500 € sur un appel de 840 €).
//
// Ces tests tournent dans une transaction annulée, sur une base locale jetable (gerimmo_ci_…).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {config} from 'dotenv';
import {Client} from 'pg';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
import {supprimerOrganisationDeTest} from './fixtures/nettoyer-organisation';
config({path:'.env.local'});const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);

type Composante={encaissement_id:string;montant:string;loyer_hc:string;charges:string;non_ventile:string};
const centimes=(v:string|number)=>Math.round(Number(v)*100);

describe.skipIf(!url)('X11 / FIN-09 : capture fiscale indépendante de l\'ordre des lignes d\'un INSERT',()=>{
 let db:Client,org:string,lot:string,bail:string,bail2:string;
 const COLONNES='organization_id,bail_id,montant,date_paiement';
 // Une ligne = un paiement ; l'ordre de la liste est l'ordre des lignes de l'INSERT. `horodatages` (facultatif) fixe le
 // created_at de chaque ligne, comme un import qui préserve la chronologie d'origine ; sinon now() (identique pour toutes).
 const inserer=async(montants:number[],bailCible=bail,horodatages?:string[])=>{
  const valeurs=montants.map((_,i)=>horodatages?`($1,$2,$${i+3},'2026-10-12',$${montants.length+3+i})`:`($1,$2,$${i+3},'2026-10-12')`).join(',');
  const r=await db.query(`insert into public.encaissements(${COLONNES}${horodatages?',created_at':''}) values ${valeurs} returning id`,[org,bailCible,...montants,...(horodatages??[])]);
  return r.rows.map(x=>x.id as string);
 };
 const unParUn=async(montants:number[],bailCible=bail,horodatages?:string[])=>{const ids:string[]=[];for(const[i,m]of montants.entries())ids.push(...await inserer([m],bailCible,horodatages&&[horodatages[i]]));return ids;};
 const composantes=async(ids:string[]):Promise<Composante[]>=>{
  const r=await db.query(`select e.encaissement_id,e.montant::text,c.loyer_hc::text,c.charges::text,c.non_ventile::text
   from public.ecritures e join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id
   where e.encaissement_id=any($1::uuid[]) and e.categorie='loyer' and e.contre_ecriture_de is null`,[ids]);
  // Dans l'ordre demandé, pas dans celui de la base.
  return ids.map(id=>r.rows.find(x=>x.encaissement_id===id) as Composante);
 };
 const somme=(l:Composante[],cle:'loyer_hc'|'charges'|'non_ventile'|'montant')=>l.reduce((s,x)=>s+centimes(x[cle]),0);
 const resume=(l:Composante[])=>l.map(x=>[x.loyer_hc,x.charges,x.non_ventile]);
 const heure=(h:number)=>`2026-10-12T${String(h).padStart(2,'0')}:00:00Z`;
 // Ce que la ventilation doit donner quel que soit l'ordre : tout ce qui peut l'être est affecté (appel de 840 €), le reste est non ventilé.
 const attendu=(montants:number[])=>{const total=centimes(montants.reduce((a,b)=>a+b,0));return {affecte:Math.min(total,84000),nonVentile:Math.max(0,total-84000)};};
 const verifierTotaux=(c:Composante[],montants:number[])=>{
  const {affecte,nonVentile}=attendu(montants);
  expect(somme(c,'loyer_hc')+somme(c,'charges')).toBe(affecte);
  expect(somme(c,'non_ventile')).toBe(nonVentile);
  // Aucun paiement n'est ventilé au-delà de son montant.
  for(const x of c)expect(centimes(x.loyer_hc)+centimes(x.charges)+centimes(x.non_ventile)).toBe(centimes(x.montant));
 };
 // Encaissements saisis SANS leurs écritures (le déclencheur est suspendu), puis écritures importées en un seul INSERT.
 const encaissementsSansEcriture=async(montants:number[],enUnInsert:boolean,horodatages?:string[])=>{
  await db.query('alter table public.encaissements disable trigger encaissement_ecritures');
  const ids=enUnInsert?await inserer(montants,bail,horodatages):await unParUn(montants,bail,horodatages);
  await db.query('alter table public.encaissements enable trigger encaissement_ecritures');
  expect((await db.query('select count(*)::int n from public.ecritures where encaissement_id=any($1::uuid[])',[ids])).rows[0].n).toBe(0);
  return ids;
 };
 const importerEcritures=(ids:string[],montants:number[])=>db.query(
  `insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,encaissement_id)
   values ${ids.map((_,i)=>`($1,$2,$3,'loyer','recette',$${4+i},'2026-10-12','2026-10-12','Import',$${4+ids.length+i})`).join(',')}`,
  [org,bail,lot,...montants,...ids]);
 // Un paiement d'avant la mise en service de la capture : saisi, jamais capté, d'un autre jour.
 const ancienSansCapture=async(montant:number)=>{
  await db.query('alter table public.ecritures disable trigger z_capturer_fiscalite');
  const [ancien]=await inserer([montant]);
  await db.query("update public.encaissements set created_at=now()-interval '40 days' where id=$1",[ancien]);
  await db.query('alter table public.ecritures enable trigger z_capturer_fiscalite');
  return ancien;
 };
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
  // 500 + 500 par bail : l'ancien défaut (chaque ligne compte l'autre) change le total de CHAQUE bail (680 au lieu de 840 ; 200 au lieu de 600).
  const valeurs=[[bail,500],[bail2,500],[bail,500],[bail2,500]];
  const r=await db.query(`insert into public.encaissements(${COLONNES}) values ${valeurs.map((_,i)=>`($1,$${2*i+2},$${2*i+3},'2026-10-12')`).join(',')} returning id,bail_id`,[org,...valeurs.flat()]);
  const c=await composantes(r.rows.map(x=>x.id));
  const duBail=(b:string)=>c.filter((_,i)=>r.rows[i].bail_id===b);
  expect([somme(duBail(bail),'loyer_hc'),somme(duBail(bail),'charges'),somme(duBail(bail),'non_ventile')]).toEqual([78000,6000,16000]);
  // Bail B : appel de 600 € (500 + 100), 1 000 € versés = 500 + 100 affectés, 400 € non ventilés.
  expect([somme(duBail(bail2),'loyer_hc'),somme(duBail(bail2),'charges'),somme(duBail(bail2),'non_ventile')]).toEqual([50000,10000,40000]);
 });

 it('un paiement antérieur sans capture (avant la fonction) compte toujours comme « déjà encaissé »',async()=>{
  await ancienSansCapture(300);
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
  // 500 + 500 sur un appel de 840 € : l'ancien défaut donnait 680 € affectés (300 + 540 ne le révélait pas : même total).
  const ids=await encaissementsSansEcriture([500,500],true);
  await importerEcritures(ids,[500,500]);
  const c=await composantes(ids);
  expect(somme(c,'loyer_hc')).toBe(78000);
  expect(somme(c,'charges')).toBe(6000);
  expect(somme(c,'non_ventile')).toBe(16000);
 });

 // Constat de relecture : le critère ne doit pas se fier à created_at. Un import qui préserve la chronologie d'origine
 // fournit des created_at explicites, dans n'importe quel ordre ; la première ligne peut être la plus récente.
 it.each([
  [[500,500],[10,11]],
  [[500,500],[11,10]],
  [[300,300,300],[11,9,10]],
  [[300,300,300],[9,11,10]],
  [[200,200,440],[12,10,11]],
  [[250,250,250,250],[3,1,4,2]],
  [[300,300],[11,10]],
 ] as [number[],number[]][])(
  'un INSERT %j aux created_at explicites %j ventile comme la même suite en INSERT successifs, sans rien compter deux fois',
  async(montants,heures)=>{
   const horodatages=heures.map(heure);
   const enBloc=await composantes(await inserer(montants,bail,horodatages));
   verifierTotaux(enBloc,montants);
   await db.query('rollback to savepoint scenario');await db.query('savepoint scenario');
   const successifs=await composantes(await unParUn(montants,bail,horodatages));
   expect(resume(enBloc)).toEqual(resume(successifs));
  });

 it('le cas du constat : 500 € + 500 € dans un seul INSERT dont la 1re ligne est la plus récente = 780 + 60 affectés, 160 € non ventilés',async()=>{
  const c=await composantes(await inserer([500,500],bail,[heure(11),heure(10)]));
  expect(somme(c,'loyer_hc')).toBe(78000);
  expect(somme(c,'charges')).toBe(6000);
  expect(somme(c,'non_ventile')).toBe(16000);
 });

 it('un paiement ancien sans capture compte toujours, même avec un INSERT multi-lignes aux created_at inversés',async()=>{
  await ancienSansCapture(300);
  const montants=[300,300];
  const c=await composantes(await inserer(montants,bail,[heure(11),heure(10)]));
  // 300 € déjà couverts avant : il reste 540 € à affecter sur les deux lignes, 60 € restent non ventilés.
  expect(somme(c,'loyer_hc')+somme(c,'charges')).toBe(54000);
  expect(somme(c,'non_ventile')).toBe(6000);
  for(const x of c)expect(centimes(x.loyer_hc)+centimes(x.charges)+centimes(x.non_ventile)).toBe(centimes(x.montant));
 });

 it.each([
  ['les encaissements saisis en un INSERT, created_at inversés',true,[11,10]],
  ['les encaissements saisis un par un, created_at inversés',false,[11,10]],
  ['les encaissements saisis un par un, sans created_at explicite',false,undefined],
 ] as [string,boolean,number[]|undefined][])(
  'import : un INSERT multi-lignes sur les écritures, %s',
  async(_nom,enUnInsert,heures)=>{
   const ids=await encaissementsSansEcriture([500,500],enUnInsert,heures?.map(heure));
   await importerEcritures(ids,[500,500]);
   const c=await composantes(ids);
   expect(somme(c,'loyer_hc')).toBe(78000);
   expect(somme(c,'charges')).toBe(6000);
   expect(somme(c,'non_ventile')).toBe(16000);
  });

 it('seule l\'écriture de LOYER du même INSERT met un encaissement en attente (une autre catégorie ou un loyer en dépense, importés avec, ne changent rien)',async()=>{
  // Un paiement ancien de 500 € jamais capté ; l'import apporte, dans le même INSERT, le loyer d'un nouveau paiement de 500 €
  // et deux lignes rattachées à l'ancien paiement qui ne sont pas son loyer encaissé (autre catégorie en recette ; loyer en dépense).
  // L'ancien paiement reste « déjà encaissé » : 340 € affectés, 160 € non ventilés.
  const ancien=await ancienSansCapture(500);
  const [nouveau]=await encaissementsSansEcriture([500],true);
  await db.query(`insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,systeme,encaissement_id)
   values($1,$2,$3,'loyer','recette',500,'2026-10-12','2026-10-12','Import',false,$4),
         ($1,$2,$3,'honoraires','recette',40,'2026-10-12','2026-10-12','Import honoraires',true,$5),
         ($1,$2,$3,'loyer','depense',500,'2026-10-12','2026-10-12','Import en dépense',false,$5)`,[org,bail,lot,nouveau,ancien]);
  const [c]=await composantes([nouveau]);
  expect(centimes(c.loyer_hc)+centimes(c.charges)).toBe(34000);
  expect(centimes(c.non_ventile)).toBe(16000);
 });

 it('un paiement seul reste figé à 780 + 60 (comportement inchangé)',async()=>{
  const [k]=await inserer([840]);
  const [avant]=await composantes([k]);
  expect(avant).toMatchObject({loyer_hc:'780.00',charges:'60.00',non_ventile:'0.00'});
 });
});

// Les lignes d'une AUTRE transaction n'ont rien à voir avec l'INSERT en cours, même si leurs numéros de commande (cmin)
// coïncident : le numéro de commande repart de zéro à chaque transaction, donc deux transactions différentes ont très souvent
// un encaissement de cmin 0. Seule la comparaison du numéro de transaction (xmin) les distingue. Dans une transaction unique
// (les tests ci-dessus), les numéros de commande ne se répètent jamais : il faut une vraie fixture validée, retirée ensuite.
describe.skipIf(!url)('X11 / FIN-09 : un encaissement validé par une autre transaction compte toujours, même à numéro de commande égal',()=>{
 let admin:Client,essai:Client,org:string,lot:string,bail:string;

 beforeAll(async()=>{
  if(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url))throw Error('Base locale dédiée requise');
  admin=new Client({connectionString:url});await admin.connect();
  essai=new Client({connectionString:url});await essai.connect();
  // Fixture explicitement fictive, validée : une autre session ne la voit qu'après un commit.
  await admin.query('begin');
  org=(await admin.query("insert into organizations(name,status,type) values('TEST X11 TRANSACTIONS','active','proprietaire_direct') returning id")).rows[0].id;
  const bien=(await admin.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST X11 T','immeuble','1 rue TEST','75001','Paris') returning id",[org])).rows[0].id;
  lot=(await admin.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST X11 T','loue') returning id",[org,bien])).rows[0].id;
  const personne=(await admin.query("insert into persons(organization_id,nom,prenom) values($1,'TEST','T') returning id",[org])).rows[0].id;
  bail=(await admin.query("insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif','2026-10-01',780,60) returning id",[org,lot,personne])).rows[0].id;
  await admin.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,'2026-10-01','2026-10-05',780,60,840)",[org,bail]);
  await admin.query('commit');
  // Un paiement d'avant la capture : encaissement + écriture de loyer, jamais captés, validés dans leur propre transaction.
  // Premier ordre d'écriture de la transaction : cmin 0 pour l'encaissement, 1 pour l'écriture (les mêmes numéros que ceux
  // d'un INSERT multi-lignes qui serait lui aussi le premier ordre d'écriture de la sienne).
  await admin.query('begin');
  await admin.query('set local session_replication_role = replica');
  const ancien=(await admin.query("insert into public.encaissements(organization_id,bail_id,montant,date_paiement) values($1,$2,500,'2026-09-30') returning id",[org,bail])).rows[0].id;
  await admin.query(`insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,encaissement_id)
   values($1,$2,$3,'loyer','recette',500,'2026-09-30','2026-09-30','Encaissement de loyer',$4)`,[org,bail,lot,ancien]);
  await admin.query('commit');
 });
 afterAll(async()=>{
  await essai?.query('rollback').catch(()=>undefined);
  await essai?.end();
  await supprimerOrganisationDeTest(admin,org,[]);
  await admin?.end();
 });


 const sommesDe=async(ids:string[])=>{
  const c=(await essai.query(`select e.encaissement_id,c.loyer_hc::text,c.charges::text,c.non_ventile::text
   from public.ecritures e join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id
   where e.encaissement_id=any($1::uuid[]) and e.categorie='loyer' and e.contre_ecriture_de is null`,[ids])).rows as Composante[];
  expect(c).toHaveLength(ids.length);
  return {affecte:c.reduce((t,x)=>t+centimes(x.loyer_hc)+centimes(x.charges),0),nonVentile:c.reduce((t,x)=>t+centimes(x.non_ventile),0)};
 };

 it('INSERT multi-lignes sur les encaissements : le paiement ancien d\'une autre transaction est « déjà encaissé » (500 € + 500 € après lui = 340 € affectés, 660 € non ventilés)',async()=>{
  const ancien=(await admin.query("select xmin::text::bigint as x, cmin::text::int as c from public.encaissements where organization_id=$1",[org])).rows;
  expect(ancien).toHaveLength(1);
  // La coïncidence qui piégerait un critère sans numéro de transaction : même cmin que le premier INSERT de la transaction d'essai.
  expect(ancien[0].c).toBe(0);
  await essai.query('begin');
  try{
   const r=await essai.query("insert into public.encaissements(organization_id,bail_id,montant,date_paiement) values($1,$2,500,'2026-10-12'),($1,$2,500,'2026-10-12') returning id,cmin::text::int as c, xmin::text::bigint as x",[org,bail]);
   expect(r.rows.map(x=>x.c)).toEqual([0,0]);
   expect(r.rows[0].x).not.toBe(ancien[0].x);
   expect(await sommesDe(r.rows.map(x=>x.id))).toEqual({affecte:34000,nonVentile:66000});
  }finally{await essai.query('rollback');}
 });

 it('INSERT multi-lignes sur les écritures (import) : même résultat, l\'écriture ancienne d\'une autre transaction ne met rien en attente',async()=>{
  const ancienne=(await admin.query("select xmin::text::bigint as x, cmin::text::int as c from public.ecritures where organization_id=$1 and categorie='loyer'",[org])).rows;
  expect(ancienne).toHaveLength(1);
  expect(ancienne[0].c).toBe(1);
  await essai.query('begin');
  try{
   // Encaissements saisis sans leurs écritures (déclencheurs suspendus pour la session) : premier ordre d'écriture, cmin 0.
   await essai.query('set local session_replication_role = replica');
   const enc=await essai.query("insert into public.encaissements(organization_id,bail_id,montant,date_paiement) values($1,$2,500,'2026-10-12'),($1,$2,500,'2026-10-12') returning id",[org,bail]);
   await essai.query('set local session_replication_role = origin');
   const ids=enc.rows.map(x=>x.id);
   // Un seul INSERT sur les écritures : deuxième ordre d'écriture, cmin 1 — le même que l'écriture ancienne.
   const ecr=await essai.query(`insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,encaissement_id)
    values($1,$2,$3,'loyer','recette',500,'2026-10-12','2026-10-12','Import',$4),($1,$2,$3,'loyer','recette',500,'2026-10-12','2026-10-12','Import',$5) returning cmin::text::int as c, xmin::text::bigint as x`,[org,bail,lot,ids[0],ids[1]]);
   expect(ecr.rows.map(x=>x.c)).toEqual([1,1]);
   expect(ecr.rows[0].x).not.toBe(ancienne[0].x);
   expect(await sommesDe(ids)).toEqual({affecte:34000,nonVentile:66000});
  }finally{await essai.query('rollback');}
 });
});

// Rejeu de la migration elle-même, dans une transaction annulée : sans effet quand le correctif est là ; elle part de la
// définition d'origine comme de la première version du correctif (comparaison des created_at, que certaines bases ont reçue) ;
// elle s'arrête sur une définition inattendue.
describe.skipIf(!url)('X11 / FIN-09 : la migration se rejoue et sait d\'où elle part',()=>{
 let db:Client,migration:string,v2:string,courante:string;
 const FICHIER=resolve(__dirname,'../supabase/migrations/20261014420000_capture_fiscale_ordre_des_lignes.sql');
 const ORIGINE=`select coalesce(sum(montant),0) into avant from public.encaissements
  where bail_id=enc.bail_id and organization_id=enc.organization_id and id<>enc.id;`;
 const VERSION_1=`-- X11 (FIN-09) : « avant » ignore les encaissements qui attendent leur tour (même INSERT,
 -- pas encore captés, pas plus anciens que celui-ci) ; voir la migration 20261014420000.
 select coalesce(sum(o.montant),0) into avant from public.encaissements o
  where o.bail_id=enc.bail_id and o.organization_id=enc.organization_id and o.id<>enc.id
    and (o.created_at<enc.created_at
         or exists(select 1 from public.ecritures x
                   join public.fiscal_encaissements_composantes c on c.ecriture_id=x.id
                   where x.encaissement_id=o.id and x.contre_ecriture_de is null));`;
 const definition=async()=>(await db.query("select pg_get_functiondef('public.capturer_composantes_fiscales()'::regprocedure) d")).rows[0].d as string;
 // Remplace le bloc « avant » de la version 2 (de sa marque jusqu'à la fin de l'instruction) par `texte`.
 const remplacerBloc=(def:string,texte:string)=>{
  const debut=def.indexOf('-- X11 (FIN-09) v2');const finMarque="y.cmin=mn.c)));";const fin=def.indexOf(finMarque,debut)+finMarque.length;
  expect(debut).toBeGreaterThan(0);expect(fin).toBeGreaterThan(debut);
  return def.slice(0,debut)+texte+def.slice(fin);
 };

 beforeAll(async()=>{
  if(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url))throw Error('Base locale dédiée requise');
  migration=readFileSync(FICHIER,'utf8');
  db=new Client({connectionString:url});await db.connect();await db.query('begin');
  courante=await definition();
  expect(courante).toContain('X11 (FIN-09) v2');
  v2=courante;
 });
 beforeEach(async()=>{await db.query('savepoint scenario');});
 afterEach(async()=>{await db.query('rollback to savepoint scenario');});
 afterAll(async()=>{await db?.query('rollback');await db?.end();});

 it('rejouée sur une base à jour, elle ne change rien',async()=>{
  await db.query(migration);
  expect(await definition()).toBe(v2);
 });

 it.each([['la première version (created_at)',VERSION_1],['la définition d\'origine',ORIGINE]])(
  'partie de %s, elle arrive à la même définition que la base à jour',
  async(_nom,ancienne)=>{
   await db.query(remplacerBloc(v2,ancienne));
   expect(await definition()).not.toContain('X11 (FIN-09) v2');
   await db.query(migration);
   expect(await definition()).toBe(v2);
  });

 it('sur une définition inattendue (ancre absente), elle s\'arrête et ne change rien',async()=>{
  await db.query(remplacerBloc(v2,"select coalesce(sum(montant),0) into avant from public.encaissements where bail_id=enc.bail_id;"));
  const avant=await definition();
  await db.query('savepoint refus');
  await expect(db.query(migration)).rejects.toThrow(/définition inattendue/);
  await db.query('rollback to savepoint refus');
  expect(await definition()).toBe(avant);
 });
});
