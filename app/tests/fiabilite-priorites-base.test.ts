import { rendrePdf } from '../src/lib/documents/rendu';
import { documentPartFacture } from '../src/lib/decompte-facture';
import type { RepartitionFourniture } from '../src/lib/proposition-repartition';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,it,expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientSurPg } from './fixtures/supabase-sur-pg';
import { envoyerCourrielDurable,empreinteCourriel } from '../src/lib/courriels-durables';
const url=process.env.SUPABASE_DB_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||!['/gerimmo_ci_priorites1','/gerimmo_ci_sql','/gerimmo_ci_vun'].includes(new URL(url).pathname))throw new Error('Base isolée priorites1 obligatoire');
let db:Client;const ouverts:Client[]=[];
const ouvrir=async()=>{const c=new Client({connectionString:url});await c.connect();ouverts.push(c);return c;};
beforeAll(async()=>{db=await ouvrir();});afterAll(async()=>{await Promise.all(ouverts.map(c=>c.end()));});
const cle=()=>randomUUID();
const params=(k=cle(),to='locataire@example.invalid')=>({cle:k,destinataire:to,organisation:null,contenu:'Montant fictif 500 EUR'});
const client=(c=db)=>clientSurPg(c,{transactionnel:false}) as unknown as SupabaseClient;
it('courriel accepté : une seule émission, même après reprise et concurrence',async()=>{
 const p=params();let envois=0;const envoyer=async()=>{envois++;return {id:cle()};};
 const autres=await Promise.all(Array.from({length:5},ouvrir));
 await Promise.all(autres.map(c=>envoyerCourrielDurable(client(c),p,envoyer)));
 expect(envois).toBe(1);expect((await envoyerCourrielDurable(client(),p,envoyer)).id).toBeTruthy();expect(envois).toBe(1);
});
it('réponse perdue : aucune réémission après 24 heures',async()=>{
 const p=params();let n=0;const envoyer=async()=>{n++;return {erreur:'coupure après acceptation',incertain:true as const};};
 await envoyerCourrielDurable(client(),p,envoyer);
 await db.query("update courriels_durables set cree_le=now()-interval '2 days',updated_at=now()-interval '2 days' where etat='inconnu'");
 expect((await envoyerCourrielDurable(client(),p,envoyer)).incertain).toBe(true);expect(n).toBe(1);
});
it('refus temporaire : reprise ; destinataires indépendants et livraison distincte',async()=>{
 const k=cle(),a=params(k,'a@example.invalid'),b=params(k,'b@example.invalid');let na=0,nb=0;
 const ea=async()=>{na++;return {id:'a-'+k};};const eb=async()=>{nb++;return nb===1?{erreur:'429',recuperable:true}:{id:'b-'+k};};
 await envoyerCourrielDurable(client(),a,ea);await envoyerCourrielDurable(client(),b,eb);
 await db.query("update courriels_durables set reprendre_apres=now() where etat='en_attente'");
 await envoyerCourrielDurable(client(),a,ea);await envoyerCourrielDurable(client(),b,eb);
 expect([na,nb]).toEqual([1,2]);
 const m=(await db.query('select id,etat from courriels_durables where fournisseur_id=$1',['b-'+k])).rows[0];expect(m.etat).toBe('accepte');
 await db.query("select rapprocher_courriel($1,$2,'livre')",[m.id,'b-'+k]);
 await db.query("select rapprocher_courriel($1,$2,'accepte')",[m.id,'b-'+k]);
 expect((await db.query('select etat from courriels_durables where id=$1',[m.id])).rows[0].etat).toBe('livre');
});
it('arrêt avant retour : réservation expirée reste inconnue et refuse le renvoi',async()=>{
 const p=params(),id=empreinteCourriel(JSON.stringify([null,p.cle,p.destinataire]));
 await db.query('select prendre_courriel($1,null,$2,$3)',[id,empreinteCourriel(p.contenu),cle()]);
 await db.query("update courriels_durables set verrou_jusqua=now()-interval '1 minute' where id=$1",[id]);
 let n=0;const r=await envoyerCourrielDurable(client(),p,async()=>{n++;return {id:cle()};});expect(r.incertain).toBe(true);expect(n).toBe(0);
});
it('refus définitif et contenu changé ne sont pas réémis',async()=>{
 const p=params();let n=0;const send=async()=>{n++;return {erreur:'destinataire refusé'};};
 await envoyerCourrielDurable(client(),p,send);await envoyerCourrielDurable(client(),p,send);await envoyerCourrielDurable(client(),{...p,contenu:'autre montant'},send);expect(n).toBe(1);
});
it('les utilisateurs ne peuvent ni réserver ni lire le journal privilégié',async()=>{
 const c=await ouvrir();await c.query('set role authenticated');
 await expect(c.query('select * from courriels_durables')).rejects.toThrow(/permission/);
 await expect(c.query('select prendre_facture_automatique($1)',[cle()])).rejects.toThrow(/permission/);
 await expect(c.query('select prendre_courriel($1,null,$2,$3)',['a'.repeat(64),'b',cle()])).rejects.toThrow(/permission/);
});
it('100 factures concurrentes : réservation unique, équité, attente, reprise et fencing',async()=>{
 // Nouvelles factures fictives sans effet externe ; règles de charges testées séparément.
 const autorise=(await db.query("insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,'fictif','{}','{}') returning id",[cle()+'@example.invalid'])).rows[0].id;
 await db.query("update factures_automatiques set disponible_le=now()+interval '1 day'");
 const ids:string[]=[];const orgs:string[]=[];
 for(let o=0;o<5;o++){
  const org=(await db.query("insert into organizations(name,status,type) values($1,'active','proprietaire_direct') returning id",['TEST PRIORITES '+o])).rows[0].id;orgs.push(org);
  const bailleur=(await db.query("insert into persons(organization_id,nom,qualite) values($1,$2,$3) returning id",[org,o%2?'SCI fictive '+o:'Propriétaire fictif '+o,o%2?'SCI':'Personne physique'])).rows[0].id;
  const bien=(await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'SCI fictive','maison','1 rue fictive','69001','Lyon') returning id",[org])).rows[0].id;
  const logement=(await db.query("insert into lots(organization_id,bien_id,nom,etat,surface_m2,pieces,meuble) values($1,$2,'Logement fictif','disponible',40,2,false) returning id",[org,bien])).rows[0].id;
  await db.query('insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)',[org,logement,bailleur]);
  const contrat=(await db.query("insert into contrats_fourniture(organization_id,bien_id,fournisseur,categorie) values($1,$2,'Test eau','eau') returning id",[org,bien])).rows[0].id;
  // Le document de fixture est copié dans sa propre organisation.
  for(let i=0;i<20;i++){
  const doc=(await db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Facture fictive',$2,'application/pdf',123,$3) returning id",[org,org+'/'+cle()+'.pdf',empreinteCourriel(cle())])).rows[0].id;

   const id=(await db.query("insert into factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents) values($1,$2,$3,$4,'2026-10-01','2026-10-31',18000) returning id",[org,contrat,doc,cle()])).rows[0].id;ids.push(id);
   await db.query('insert into factures_automatiques(id,organization_id,autorise_par) values($1,$2,$3)',[id,org,autorise]);
  }
 }
 const avecPdf=process.env.GERIMMO_BENCH_PDF==='1';const pdfs=new Set<string>();const latences:number[]=[];
 const produire=async(id:string,org:string)=>{
  if(!avecPdf)return;expect(pdfs.has(id)).toBe(false);
  const r={id,motif:'Consommations réelles — facture fictive',source:{compteurs:[{id,periode_debut:'2026-10-01',periode_fin:'2026-10-31',debut:100,fin:175,unite:'m3'}]},lignes:[{bail_id:id,compteur_id:id,periode_debut:'2026-10-01',periode_fin:'2026-10-31',recuperable:true,montant_cents:18000}]} as unknown as RepartitionFourniture;
  const octets=await rendrePdf(documentPartFacture(r,id,{bailleur:'SCI fictive '+org,locataire:'Locataire fictif '+id,logement:'Lot fictif',adresse:'1 rue fictive, 69001 Lyon',reference:id,fournisseur:'Eau fictive',debut:'2026-10-01',fin:'2026-10-31'}));
  expect(Buffer.from(octets).subarray(0,4).toString()).toBe('%PDF');
  const fs=await import('node:fs');fs.mkdirSync('output/cloture-lot1/pdf',{recursive:true});fs.writeFileSync('output/cloture-lot1/pdf/'+id+'.pdf',octets);pdfs.add(id);
 };
 const workers=await Promise.all(Array.from({length:5},ouvrir));const pris=new Set<string>();const premiers:string[]=[];const debut=performance.now();
 await Promise.all(workers.map(async c=>{for(;;){const t=cle();const f=(await c.query('select prendre_facture_automatique($1) as f',[t])).rows[0].f;if(!f)break;expect(pris.has(f.id)).toBe(false);pris.add(f.id);if(premiers.length<5)premiers.push(f.organization_id);
 const etat=pris.size%10===0?'releves_attendus':'terminee';if(etat==='terminee'){await produire(f.id,f.organization_id);latences.push(performance.now()-debut);}expect((await c.query('select finir_facture_automatique($1,$2,$3) as ok',[f.id,t,etat])).rows[0].ok).toBe(true);
 }}));
 expect(pris.size).toBe(100);expect(new Set(premiers).size).toBe(5);
 const attente=(await db.query("select id from factures_automatiques where id=any($1::uuid[]) and etat='releves_attendus'",[ids])).rows;expect(attente).toHaveLength(10);
 // Dernière information reçue réveille le dossier (trigger de facture).
 await db.query('update factures_fourniture set reference=reference where id=$1',[attente[0].id]);
 const t=cle();const f=(await db.query('select prendre_facture_automatique($1) as f',[t])).rows[0].f;expect(f.id).toBe(attente[0].id);
 await db.query("update factures_automatiques set verrou_jusqua=now()-interval '1 second' where id=$1",[f.id]);const t2=cle();expect((await db.query('select prendre_facture_automatique($1) as f',[t2])).rows[0].f.id).toBe(f.id);
 expect((await db.query("select finir_facture_automatique($1,$2,'terminee') as ok",[f.id,t])).rows[0].ok).toBe(false);
 await db.query("select finir_facture_automatique($1,$2,'reprise')",[f.id,t2]);
 if(avecPdf){
  // Complète toutes les attentes puis rejoue la réservation interrompue, sans réécrire les PDF achevés.
  await db.query('update factures_fourniture set reference=reference where id=any($1::uuid[])',[attente.map(a=>a.id)]);
  const repris=performance.now();
  await Promise.all(workers.map(async c=>{for(;;){const token=cle();const f=(await c.query('select prendre_facture_automatique($1) as f',[token])).rows[0].f;if(!f)break;await produire(f.id,f.organization_id);await c.query("select finir_facture_automatique($1,$2,'terminee')",[f.id,token]);latences.push(performance.now()-repris);}}));
  expect(pdfs.size).toBe(100);
  const fs=await import('node:fs');const sorted=latences.sort((a,b)=>a-b);
  fs.writeFileSync('output/cloture-lot1/performance-pdf.json',JSON.stringify({factures:100,pdf:pdfs.size,organisations:5,concurrence:5,dureeMs:performance.now()-debut,p95EligibiliteMs:sorted[Math.ceil(sorted.length*.95)-1],maxEligibiliteMs:sorted.at(-1),limite:'Réservations SQL et rendu PDF réels ; calcul métier, Storage réseau et ordonnanceur hébergé non mesurés ensemble'},null,2));
  await (globalThis as typeof globalThis & {gerimmoMoteurPdf?:Promise<{close:()=>Promise<void>}>}).gerimmoMoteurPdf?.then(b=>b.close());
 }
 const mesure={factures:100,organisations:5,concurrence:5,reservationsUniques:pris.size,attentes:attente.length,dureeMs:Math.round(performance.now()-debut),perimetre:'Réservations et transitions SQL réelles ; pas le temps du rendu PDF ni des prestataires'};
 const fs=await import('node:fs');fs.mkdirSync('output/priorites1',{recursive:true});fs.writeFileSync('output/priorites1/mesure-file.json',JSON.stringify(mesure,null,2));
},120000);

it('preuve de refus définitif prioritaire sur un retour HTTP tardif',async()=>{
 const p=params(),id=empreinteCourriel(JSON.stringify([null,p.cle,p.destinataire])),token=cle(),provider=cle();
 await db.query('select prendre_courriel($1,null,$2,$3)',[id,empreinteCourriel(p.contenu),token]);
 await db.query("select rapprocher_courriel($1,$2,'echec')",[id,provider]);
 await db.query("select finir_courriel($1,$2,'accepte',$3)",[id,token,provider]);
 expect((await db.query('select etat from courriels_durables where id=$1',[id])).rows[0].etat).toBe('echec');
});

it('surveille les interruptions et ne contrôle pas toujours les mêmes messages',async()=>{
 const p=params(),id=empreinteCourriel(JSON.stringify([null,p.cle,p.destinataire]));
 await db.query('select prendre_courriel($1,null,$2,$3)',[id,empreinteCourriel(p.contenu),cle()]);
 await db.query("update courriels_durables set verrou_jusqua=now()-interval '1 minute' where id=$1",[id]);
 await db.query('select surveiller_courriels_interrompus()');
 expect((await db.query('select etat from courriels_durables where id=$1',[id])).rows[0].etat).toBe('inconnu');
 for(let i=0;i<12;i++) await envoyerCourrielDurable(client(),params(),async()=>({id:cle()}));
 const a=(await db.query('select id from courriels_a_rapprocher()')).rows.map(r=>r.id);
 const b=(await db.query('select id from courriels_a_rapprocher()')).rows.map(r=>r.id);
 expect(a.length).toBe(10);expect(b.length).toBeGreaterThan(0);expect(a.some(id=>b.includes(id))).toBe(false);
});
