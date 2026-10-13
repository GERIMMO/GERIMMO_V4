import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';

config({ path: '.env.local' });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const saisie = { nom: 'TEST MISSION Creation concurrente', type: 'appartement', address_line1: '1 rue TEST', address_line2: null, postal_code: '75001', city: 'Paris', annee_construction: 1990, copropriete: false, zone_tendue: null, parties_communes: 'Hall', acces_tic: 'Fibre', commune_insee: null, lots: [{ nom: 'TEST Lot', surface_m2: 42, pieces: 2 }] };

describe.skipIf(!url)('Creation bien : concurrence reelle, fixtures locales nettoyees', () => {
  let admin: Client, premier: Client, second: Client, org: string, compte: string;
  beforeAll(async () => {
    if (!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url)) throw Error('Base locale dediee requise');
    admin = new Client({ connectionString: url }); premier = new Client({ connectionString: url }); second = new Client({ connectionString: url });
    await Promise.all([admin.connect(), premier.connect(), second.connect()]);
    compte = (await admin.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-creation-concurrente-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
    org = (await admin.query("insert into organizations(name,status,type,address_line1,postal_code,city,email_contact) values('TEST MISSION Creation concurrente','active','proprietaire_direct','1 rue TEST','75001','Paris','test@example.invalid') returning id")).rows[0].id;
    await admin.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
  });
  afterAll(async () => {
    await premier?.query('rollback'); await second?.query('rollback');
    if (org) {
      await admin.query('begin');
      await admin.query('select public.tache_systeme()');
      for (const table of ['detentions', 'lots', 'biens', 'persons', 'memberships', 'audit_log']) await admin.query(`delete from public.${table} where organization_id=$1`, [org]);
      await admin.query('delete from organizations where id=$1', [org]);
      await admin.query('delete from audit_log where account_id=$1', [compte]);
      await admin.query('delete from auth.users where id=$1', [compte]);
      await admin.query('commit');
    }
    await Promise.all([admin?.end(), premier?.end(), second?.end()]);
  });
  const ouvrir = async (db: Client) => {
    await db.query('begin');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: 'authenticated', aal: 'aal2' })]);
    await db.query('set local role authenticated');
  };
  const creer = async (db: Client, cle: string) => (await db.query('select public.creer_bien_complet($1,$2,$3) r', [org, cle, saisie])).rows[0].r;
  const scenario = async (memeCle: boolean, annulerPremier = false) => {
    const cleA = randomUUID(), cleB = memeCle ? cleA : randomUUID();
    await ouvrir(premier); await ouvrir(second);
    const a = await creer(premier, cleA);
    const pid = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
    const attente = creer(second, cleB);
    try {
      await expect.poll(async () => (await admin.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type, { timeout: 3000, interval: 20 }).toBe('Lock');
      await premier.query(annulerPremier ? 'rollback' : 'commit');
      const b = await attente; await second.query('commit');
      const dossiers = (await admin.query('select id from biens where organization_id=$1 and creation_cle=any($2::uuid[])', [org, [cleA, cleB]])).rows;
      expect(dossiers).toHaveLength(memeCle || annulerPremier ? 1 : 2);
      expect(b.rejoue).toBe(memeCle && !annulerPremier);
      expect(b.bien_id === a.bien_id).toBe(memeCle && !annulerPremier);
      expect((await admin.query('select count(*)::int n from persons where organization_id=$1 and account_id=$2', [org, compte])).rows[0].n).toBe(1);
      for (const dossier of dossiers) expect((await admin.query('select count(*)::int n from lots l join detentions d on d.lot_id=l.id where l.bien_id=$1', [dossier.id])).rows[0].n).toBe(1);
    } finally {
      await premier.query('rollback'); await attente.catch(() => undefined); await second.query('rollback');
    }
  };
  it('deux demandes simultanees identiques ne creent qu’un dossier', () => scenario(true));
  it('deux demandes distinctes ne dedoublent pas la fiche du proprietaire', () => scenario(false));
  it('la demande en attente reussit si la premiere transaction est annulee', () => scenario(true, true));
});
