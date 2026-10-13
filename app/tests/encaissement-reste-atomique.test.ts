import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
config({ path: '.env.local' });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const sql = 'select public.encaisser_reste_atomique($1,$2,$3,$4,$5,$6) as resultat';
type Fixture = { org: string; bail: string; user: string; autre: string; appels: string[] };
async function creer(db: Client): Promise<Fixture> {
  const org = (await db.query("insert into public.organizations(name,type,status) values ('TEST encaissement atomique','proprietaire_direct','active') returning id")).rows[0].id;
  const user = randomUUID(), autre = randomUUID();
  for (const id of [user, autre]) await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values ($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')", [id, `${id}@test.local`]);
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [user,org]);
  const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST paiement','appartement','1 rue de Test','75001','Paris') returning id", [org])).rows[0].id;
  const lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST paiement','loue') returning id", [org,bien])).rows[0].id;
  const loc = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Locataire') returning id",[org])).rows[0].id;
  const bail = (await db.query("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',780,60,'2026-01-01',5,$3) returning id",[org,lot,loc])).rows[0].id;
  const appels = (await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) select $1,$2,d::date,(d+interval '4 days')::date,780,60,840 from generate_series('2026-01-01'::date,'2026-02-01'::date,interval '1 month') d returning id",[org,bail])).rows.map(r=>r.id);
  return { org,bail,user,autre,appels };
}
async function agir(db: Client, user: string) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,false)",[user]);
  await db.query('set role authenticated');
}
async function essai(db:Client, args:unknown[]) {
  await db.query('savepoint essai');
  try { const r=await db.query(sql,args); await db.query('release savepoint essai'); return r.rows[0].resultat; }
  catch(e) { await db.query('rollback to savepoint essai'); throw e; }
}
describe.skipIf(!url)('Encaisser le reste — transaction et répétitions',()=>{
  let db:Client, f:Fixture;
  beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
  beforeEach(async()=>{await db.query('reset role');await db.query('begin');f=await creer(db);await agir(db,f.user);});
  afterEach(async()=>{await db.query('rollback');await db.query('reset role');});
  afterAll(async()=>{await db?.end();});
  const args=(commande=randomUUID(),appel=0,reste=840,dette=0)=>[f.org,f.bail,f.appels[appel],commande,reste,dette];
  it('une réponse perdue peut être rejouée sans nouvelle écriture',async()=>{
    const a=args(), premier=await essai(db,a), second=await essai(db,a);
    expect(premier).toMatchObject({statut:'enregistre',montant:840,rejoue:false});
    expect(second).toMatchObject({statut:'enregistre',montant:840,rejoue:true,encaissement_id:premier.encaissement_id});
    expect((await db.query('select count(*)::int n,sum(montant)::float montant from public.encaissements where bail_id=$1',[f.bail])).rows[0]).toEqual({n:1,montant:840});
  });
  it('deux commandes distinctes sur un solde déjà couvert ne doublent pas le paiement',async()=>{
    await essai(db,args());expect(await essai(db,args())).toMatchObject({statut:'deja_couvert',montant:0});
  });
  it('un terme ultérieur inchangé ne permet pas un second paiement sur une ancienne vue',async()=>{
    await essai(db,args(randomUUID(),1,840,840));
    expect(await essai(db,args(randomUUID(),1,840,840))).toMatchObject({statut:'solde_modifie',montant:0});
    expect(await essai(db,args(randomUUID(),1,840,0))).toMatchObject({statut:'enregistre',montant:840});
    expect((await db.query('select sum(montant)::float m from public.encaissements where bail_id=$1',[f.bail])).rows[0].m).toBe(1680);
  });
  it('une saisie détaillée partielle impose de relire le solde, puis encaisse exactement le complément',async()=>{
    await db.query('insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,300)',[f.org,f.bail]);
    expect(await essai(db,args())).toMatchObject({statut:'solde_modifie'});
    expect(await essai(db,args(randomUUID(),0,540))).toMatchObject({statut:'enregistre',montant:540});
  });
  it('refuse un compte étranger et une commande changée',async()=>{
    const a=args();await essai(db,a);
    await expect(essai(db,[...a.slice(0,4),100,0])).rejects.toThrow(/déjà été utilisée/);
    await agir(db,f.autre);await expect(essai(db,args())).rejects.toThrow(/Accès refusé/);
    expect((await db.query('select * from public.commandes_encaissement_reste where organization_id=$1',[f.org])).rows).toHaveLength(0);
  });
  it('un échec ne consomme pas la commande, le journal reste cohérent',async()=>{
    const a=args();await expect(essai(db,[...a.slice(0,4),-1,0])).rejects.toThrow(/incomplète/);
    expect(await essai(db,a)).toMatchObject({statut:'enregistre',rejoue:false});
    const q=(await db.query('select est_quittance,montant::float from public.quittances where appel_id=$1',[f.appels[0]])).rows[0];
    expect(q).toEqual({est_quittance:true,montant:840});
  });
  it('une annulation normale conserve la commande et interdit de ressusciter le paiement',async()=>{
    const a=args(), r=await essai(db,a);
    await db.query("select public.supprimer_encaissement($1,$2)",[r.encaissement_id,'TEST annulation du règlement fictif']);
    expect(await essai(db,a)).toMatchObject({statut:'annule',montant:0,rejoue:true});
    expect((await db.query('select id from public.quittances where appel_id=$1',[f.appels[0]])).rows).toHaveLength(0);
  });
  it('deux sessions concurrentes relisent le solde après le verrou',async()=>{
    // Fixture explicitement fictive conservée pour la preuve des deux transactions.
    await db.query('commit');
    const autre=new Client({connectionString:url});await autre.connect();
    const observateur=new Client({connectionString:url});await observateur.connect();
    const pid=(await autre.query("select pg_backend_pid() as pid")).rows[0].pid;
    try {
      await agir(autre,f.user);
      await db.query('begin');await autre.query('begin');
      await db.query('select id from public.baux where id=$1 for update',[f.bail]);
      const premier=await db.query(sql,args());
      const secondPromesse=autre.query(sql,args());
      let bloque=false;
      for(let i=0;i<100;i++) {
        const attente=(await observateur.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0];
        if(attente?.wait_event_type==='Lock'){bloque=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(bloque).toBe(true);
      await db.query('commit');
      const second=await secondPromesse;await autre.query('commit');
      expect(premier.rows[0].resultat.statut).toBe('enregistre');
      expect(second.rows[0].resultat.statut).toBe('deja_couvert');
      expect((await db.query('select count(*)::int n,sum(montant)::float m from public.encaissements where bail_id=$1',[f.bail])).rows[0]).toEqual({n:1,m:840});
    } finally {await db.query('rollback');await autre.query('rollback');await autre.end();await observateur.end();}
  });
});
