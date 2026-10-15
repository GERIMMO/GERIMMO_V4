/**
 * X02 (AUD-A-06, décision du 14/10/2026) — la base, côté formulaire de contact du site vitrine.
 *
 * Teste, sur une vraie base (SUPABASE_DB_URL, transaction annulée), la migration
 * 20261014400000_devis_vitrine_par_action_serveur.sql :
 *  · `anon` et `authenticated` n'ont plus aucun droit d'insertion dans `demandes_devis` (table ni colonnes) ;
 *  · la politique `demandes_devis_insert_public` n'existe plus ;
 *  · `service_role` (l'action serveur) insère, et le déclencheur de limite s'applique à lui comme à tout rôle :
 *    doublon ignoré, 3 demandes par adresse et par heure, 30 par heure en tout, avec un message en français ;
 *  · l'horodatage et l'état de traitement restent forcés par le déclencheur ;
 *  · la lecture reste réservée au super-administrateur (politiques inchangées, couvertes aussi par console-supervision-base.test.ts) ;
 *  · la migration est rejouable.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
config({ path: '.env.local' }); const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
const MIGRATION = 'supabase/migrations/20261014400000_devis_vitrine_par_action_serveur.sql';

describe.skipIf(!url)('X02 — demandes_devis : plus d\'insertion directe, plafonds conservés (base)', () => {
  let db: Client;
  async function role(r: 'anon' | 'authenticated' | 'service_role' | 'postgres') {
    await db.query('reset role');
    if (r === 'postgres') return;
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(r === 'authenticated' ? { sub: randomUUID(), role: r } : { role: r })]);
    await db.query(`set local role ${r}`);
  }
  async function essayer(sql: string, args: unknown[] = []) {
    await db.query('savepoint essai');
    try { const r = await db.query(sql, args); await db.query('release savepoint essai'); return r; }
    catch (e) { await db.query('rollback to savepoint essai'); throw e; }
  }
  const ecrire = (email: string, message: string | null = 'Bonjour') =>
    essayer("insert into public.demandes_devis (nom, email, agence, telephone, nb_lots, message) values ('Visiteur', $1, 'Agence', '0102030405', '10', $2)", [email, message]);

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query('begin');
    // Base préparée par le manifeste : la migration est là. Sinon (base plus ancienne), elle s'applique dans la transaction.
    if ((await db.query("select 1 from pg_policy where polrelid='public.demandes_devis'::regclass and polname='demandes_devis_insert_public'")).rowCount)
      await db.query(readFileSync(MIGRATION, 'utf8'));
  });
  afterAll(async () => { await db.query('rollback'); await db.end(); });
  beforeEach(async () => { await db.query('reset role'); await db.query('savepoint cas'); });
  afterEach(async () => { await db.query('rollback to savepoint cas'); });

  it('anon (la clé publique du navigateur) ne peut plus insérer, quelles que soient les colonnes', async () => {
    await role('anon');
    await expect(ecrire('direct@exemple.test')).rejects.toThrow(/permission denied for table demandes_devis/);
    await expect(essayer("insert into public.demandes_devis (nom, email) values ('X','x@exemple.test')")).rejects.toThrow(/permission denied/);
    await expect(essayer("insert into public.demandes_devis (id, nom, email) values (gen_random_uuid(),'X','x@exemple.test')")).rejects.toThrow(/permission denied/);
    await role('postgres');
    expect((await db.query("select count(*)::int n from public.demandes_devis where email like '%@exemple.test'")).rows[0].n).toBe(0);
  });

  it('un compte connecté non plus', async () => {
    await role('authenticated');
    await expect(ecrire('connecte@exemple.test')).rejects.toThrow(/permission denied for table demandes_devis/);
  });

  it('aucun droit d\'insertion ne subsiste, table ou colonne, pour anon et authenticated ; aucune politique d\'insertion', async () => {
    const q = (sql: string) => db.query(sql).then((r) => r.rows[0]);
    expect(await q("select has_any_column_privilege('anon','public.demandes_devis','INSERT') a, has_any_column_privilege('authenticated','public.demandes_devis','INSERT') b")).toEqual({ a: false, b: false });
    expect((await db.query("select polname from pg_policy where polrelid='public.demandes_devis'::regclass and polcmd='a'")).rows).toEqual([]);
    // La lecture et le traitement restent réservés au super-administrateur.
    expect((await db.query("select polname from pg_policy where polrelid='public.demandes_devis'::regclass order by 1")).rows.map((r) => r.polname))
      .toEqual(['demandes_devis_select_sa', 'demandes_devis_update_sa']);
  });

  it('invariant : anon n\'a aucune écriture nulle part dans public (aucune exception)', async () => {
    const { rows } = await db.query(
      `select c.relname || '/' || p.priv as reste
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         cross join lateral (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as p(priv)
        where n.nspname = 'public' and c.relkind in ('r','p') and has_table_privilege('anon', c.oid, p.priv)
        order by 1`);
    expect(rows).toEqual([]);
  });

  it('service_role (l\'action serveur) insère ; l\'horodatage et l\'état de traitement restent forcés par la base', async () => {
    await role('service_role');
    await essayer("insert into public.demandes_devis (nom, email, message, created_at, traitee_le) values ('Visiteur','Forcee@Exemple.test','Bonjour', now() - interval '3 hours', now())");
    await role('postgres');
    const { rows: [l] } = await db.query("select email, created_at > now() - interval '1 minute' as recente, traitee_le from public.demandes_devis where email='forcee@exemple.test'");
    expect(l).toEqual({ email: 'forcee@exemple.test', recente: true, traitee_le: null });
  });

  it('le même message envoyé deux fois en moins de 24 h n\'écrit qu\'une ligne, sans erreur', async () => {
    await role('service_role');
    expect((await ecrire('doublon@exemple.test', 'identique')).rowCount).toBe(1);
    expect((await ecrire('doublon@exemple.test', 'identique')).rowCount).toBe(0);
  });

  it('plafond par adresse : la quatrième demande de l\'heure est refusée, en français', async () => {
    await role('service_role');
    for (const n of [1, 2, 3]) await ecrire('trois@exemple.test', `message ${n}`);
    await expect(ecrire('trois@exemple.test', 'message 4')).rejects.toThrow('Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées.');
  });

  it('plafond horaire général : la 31e demande de l\'heure est refusée, en français', async () => {
    await role('postgres');
    const { rows: [{ n }] } = await db.query("select count(*)::int n from public.demandes_devis where created_at > now() - interval '1 hour'");
    await role('service_role');
    for (let i = 0; i < 30 - n; i++) await ecrire(`foule${i}@exemple.test`, `message ${i}`);
    await expect(ecrire('derniere@exemple.test', 'trop tard')).rejects.toThrow('Le formulaire reçoit beaucoup de demandes en ce moment : réessayez dans une heure.');
  });

  it('un compte ordinaire ne lit pas les demandes (lecture réservée au super-administrateur, politique inchangée)', async () => {
    await role('service_role');
    await ecrire('lue@exemple.test');
    await role('authenticated');
    expect((await db.query("select count(*)::int n from public.demandes_devis where email='lue@exemple.test'")).rows[0].n).toBe(0);
  });

  it('la migration est rejouable', async () => {
    await role('postgres');
    await db.query(readFileSync(MIGRATION, 'utf8'));
    await db.query(readFileSync(MIGRATION, 'utf8'));
    await role('anon');
    await expect(ecrire('apres-rejeu@exemple.test')).rejects.toThrow(/permission denied/);
  });
});
