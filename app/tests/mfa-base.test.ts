import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)('Supervision : second facteur imposé dans les autorisations SQL', () => {
  let db: Client; let sa: string; let autre: string; let org: string;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query('begin');
    const utilisateurs = (await db.query("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@test.local'),(gen_random_uuid(),gen_random_uuid()||'@test.local') returning id")).rows;
    sa = utilisateurs[0].id; autre = utilisateurs[1].id;
    await db.query("insert into public.memberships(account_id,role,status) values($1,'super_admin','active')",[sa]);
    org = (await db.query("insert into public.organizations(name,status) values('Recette MFA','active') returning id")).rows[0].id;
  });
  afterEach(async () => { await db.query('rollback'); });
  async function agir(id: string, aal?: string) {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({ sub:id,role:'authenticated',aal })]);
    await db.query('set local role authenticated');
  }
  it.each([undefined,'aal1','inconnu'])('refuse les accès de supervision sans AAL2 (%s), mais permet la configuration personnelle', async aal => {
    await agir(sa,aal);
    expect((await db.query('select public.is_super_admin() as autorise')).rows[0].autorise).toBe(false);
    expect((await db.query('select id from public.organizations where id=$1',[org])).rows).toHaveLength(0);
    expect((await db.query('select id from public.memberships where account_id=$1',[sa])).rows).toHaveLength(1);
    await expect(db.query("insert into public.organizations(name) values('Interdit sans MFA')")).rejects.toThrow(/row-level security/);
  });
  it('permet lecture et écriture au super administrateur après validation du second facteur', async () => {
    await agir(sa,'aal2');
    expect((await db.query('select public.is_super_admin() as autorise')).rows[0].autorise).toBe(true);
    expect((await db.query('select id from public.organizations where id=$1',[org])).rows).toHaveLength(1);
    expect((await db.query("insert into public.organizations(name) values('Autorisé après MFA') returning id")).rows).toHaveLength(1);
  });
  it('AAL2 ne confère jamais le rôle de super administrateur', async () => {
    await agir(autre,'aal2');
    expect((await db.query('select public.is_super_admin() as autorise')).rows[0].autorise).toBe(false);
    expect((await db.query('select id from public.organizations where id=$1',[org])).rows).toHaveLength(0);
  });
  it('une adhésion suspendue reste refusée, même après MFA', async () => {
    await db.query("update public.memberships set status='inactive' where account_id=$1",[sa]);
    await agir(sa,'aal2');
    expect((await db.query('select public.is_super_admin() as autorise')).rows[0].autorise).toBe(false);
  });
});
