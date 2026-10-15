/**
 * X15 (REP-02, décision du 14/10/2026) — la base mémorise l'envoi de l'e-mail d'urgence.
 *
 * Teste, sur une vraie base (SUPABASE_DB_URL, transaction annulée), la migration
 * 20261014401000_incident_urgent_notifie.sql : `declarer_mon_incident_reprise` dit `notifie`,
 * `marquer_incident_urgent_notifie` mémorise l'envoi une seule fois, pour le seul déclarant.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
config({ path: '.env.local' }); const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
const MIGRATION = 'supabase/migrations/20261014401000_incident_urgent_notifie.sql';
const declaration = "select public.declarer_mon_incident_reprise($1,$2,'plomberie_canalisation',$3,'Cuisine',null,'urgente') r";

describe.skipIf(!url)('X15 — mémoriser l\'envoi de l\'e-mail d\'urgence (base)', () => {
  let db: Client, org: string, user: string, foreign: string, outsider: string, commande: string;
  async function agir(id = user) { await db.query('reset role'); await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [id]); await db.query('set local role authenticated'); }
  async function essayer(sql: string, args: unknown[] = []) { await db.query('savepoint essai'); try { const r = await db.query(sql, args); await db.query('release savepoint essai'); return r.rows; } catch (e) { await db.query('rollback to savepoint essai'); throw e; } }
  async function declarer(description = 'Dégât des eaux') { return (await essayer(declaration, [org, commande, description]))[0].r; }
  async function marquer(c = commande, o = org) { return (await essayer('select public.marquer_incident_urgent_notifie($1,$2) r', [o, c]))[0].r as boolean; }
  async function notifieLe(): Promise<string | null> { await db.query('reset role'); return (await db.query('select notifie_le from commandes_incidents_locataire where id=$1', [commande])).rows[0]?.notifie_le ?? null; }

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query('begin');
    // Base préparée par le manifeste : la colonne existe. Sinon (base plus ancienne), la migration s'applique dans la transaction.
    if (!(await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='commandes_incidents_locataire' and column_name='notifie_le'")).rowCount) await db.query(readFileSync(MIGRATION, 'utf8'));
  });
  afterAll(async () => { await db.query('rollback'); await db.end(); });
  beforeEach(async () => {
    await db.query('reset role'); await db.query('savepoint cas'); commande = randomUUID(); user = randomUUID(); foreign = randomUUID(); outsider = randomUUID();
    org = (await db.query("insert into organizations(name,status) values('TEST urgence notifiée','active') returning id")).rows[0].id;
    for (const id of [user, foreign, outsider]) await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')", [id, `${id}@test.local`]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$3,'locataire'),($2,$3,'locataire')", [user, foreign, org]);
    const person = (await db.query("insert into persons(organization_id,account_id,nom) values($1,$2,'TEST locataire') returning id", [org, user])).rows[0].id;
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST','appartement','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id", [org, bien])).rows[0].id;
    await db.query("insert into baux(organization_id,lot_id,etat,locataire_principal) values($1,$2,'actif',$3)", [org, lot, person]); await agir();
  });
  afterEach(async () => { await db.query('rollback to savepoint cas'); });

  it('première déclaration : pas encore notifié ; reprise avant l\'envoi : rejouée, pas notifié', async () => {
    const a = await declarer();
    expect(a).toMatchObject({ rejoue: false, notifie: false });
    const b = await declarer();
    expect(b).toEqual({ ...a, rejoue: true, notifie: false });
    expect(await notifieLe()).toBeNull();
  });

  it('une fois l\'envoi mémorisé, la reprise le dit ; la mémorisation ne vaut qu\'une fois', async () => {
    const a = await declarer();
    await agir();
    expect(await marquer()).toBe(true);
    expect(await notifieLe()).not.toBeNull();
    await agir();
    expect(await declarer()).toEqual({ incident_id: a.incident_id, rejoue: true, notifie: true });
    const premiere = await notifieLe();
    await agir();
    expect(await marquer()).toBe(false);
    expect(await notifieLe()).toEqual(premiere);
  });

  it('la mémorisation d\'une tentative inconnue ne fait rien', async () => {
    await declarer();
    expect(await marquer(randomUUID())).toBe(false);
    expect(await notifieLe()).toBeNull();
  });

  it('un autre locataire de la même agence ne mémorise rien à la place du déclarant', async () => {
    await declarer();
    await agir(foreign);
    expect(await marquer()).toBe(false);
    expect(await notifieLe()).toBeNull();
  });

  it('sans rôle de locataire dans l\'agence, ou sans compte : accès refusé', async () => {
    await declarer();
    await agir(outsider);
    await expect(marquer()).rejects.toThrow(/Accès refusé/);
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims','{\"role\":\"authenticated\"}',true)");
    await db.query('set local role authenticated');
    await expect(marquer()).rejects.toThrow(/Accès refusé/);
  });

  it('une saisie différente sous la même clé reste refusée (comportement inchangé)', async () => {
    await declarer();
    await expect(declarer('Autre problème')).rejects.toThrow(/autre saisie/);
  });

  it('droits : exécutable par les comptes connectés, jamais par le public ni par anon', async () => {
    await db.query('reset role');
    const q = (role: string, fn: string) => db.query('select has_function_privilege($1,$2,\'EXECUTE\') r', [role, fn]).then((x) => x.rows[0].r);
    const marque = 'public.marquer_incident_urgent_notifie(uuid,uuid)';
    const declare = 'public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence)';
    expect(await q('anon', marque)).toBe(false);
    expect(await q('anon', declare)).toBe(false);
    expect(await q('authenticated', marque)).toBe(true);
    expect(await q('authenticated', declare)).toBe(true);
    // La colonne n'est lisible que par la fonction de lecture existante (select accordé sur la table, RLS du déclarant).
    expect((await db.query("select has_table_privilege('authenticated','public.commandes_incidents_locataire','UPDATE') r")).rows[0].r).toBe(false);
  });

  it('la migration est rejouable', async () => {
    await db.query('reset role');
    await db.query(readFileSync(MIGRATION, 'utf8'));
    await db.query(readFileSync(MIGRATION, 'utf8'));
    await agir();
    expect(await declarer()).toMatchObject({ rejoue: false, notifie: false });
  });
});
