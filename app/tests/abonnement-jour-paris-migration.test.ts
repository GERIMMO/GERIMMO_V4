import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const nom = '20261018231827_abonnement_jour_paris';
const aller = readFileSync(`supabase/migrations/${nom}.sql`, 'utf8');
const retour = readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, 'utf8');
const signatures = [
  'public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)',
  'public.abonnement_relance_envoyee(uuid)', 'public.abonnements_a_relancer(integer)',
  'public.etat_abonnement(uuid)', 'public.mon_abonnement(uuid)',
];

describe.skipIf(!url)('abonnement : un même jour de Paris pour les droits et les relances', () => {
  let db: Client;
  const definition = async (s: string) => (await db.query('select pg_get_functiondef($1::regprocedure) as d', [s])).rows[0].d as string;
  const empreinte = async () => (await db.query('select oid::regprocedure::text as signature, md5(pg_get_functiondef(oid)) as definition, proacl::text as droits, proowner, prosecdef, proconfig from pg_proc where oid=any($1::regprocedure[]) order by 1', [signatures])).rows;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query('begin'); });
  afterAll(async () => { await db?.query('rollback'); await db?.end(); });
  beforeEach(async () => { await db.query('savepoint cas'); await db.query("set local timezone = 'UTC'"); });
  afterEach(async () => { await db.query('rollback to cas'); await db.query('release cas'); });

  it('les cinq fonctions ne dépendent plus du fuseau de session', async () => {
    for (const s of signatures) {
      expect(await definition(s), s).not.toMatch(/\bcurrent_date\b/i);
      expect(await definition(s), s).toContain('aujourdhui_paris()');
    }
  });
  it('rejeu, retour et réapplication conservent définitions et droits', async () => {
    const attendu = await empreinte();
    await db.query(aller); expect(await empreinte()).toEqual(attendu);
    await db.query(retour); await db.query(retour);
    for (const s of signatures) expect(await definition(s), s).toMatch(/\bcurrent_date\b/i);
    await db.query(aller); expect(await empreinte()).toEqual(attendu);
  });
  it('une définition divergente arrête la migration', async () => {
    await db.query((await definition(signatures[4])).replace('a.stripe_statut,', 'a.stripe_statut || current_date::text,'));
    await expect(db.query(aller)).rejects.toThrow(/définition inattendue/);
  });
  it('minuit Paris : même jour pour le défaut, J+7, J+14, J+15 et le marquage de la relance', async () => {
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path='' as $$ select current_date + 1 $$");
    const { rows: [o] } = await db.query("insert into public.organizations(name,type,status,email_contact) values ('Essai dates fictif','proprietaire_direct','active','dates@example.test') returning id");
    const client = `cus_date_${o.id}`;
    await db.query('insert into public.abonnements(organization_id,stripe_customer_id,quantite,montant_mensuel_cents,premiere_facture_payee) values ($1,$2,3,999,true)', [o.id, client]);
    await db.query("select public.abonnement_appliquer($1,'sub_date_essai','past_due',3,now(),false)", [client]);
    expect((await db.query('select paiement_en_defaut_depuis=public.aujourdhui_paris() as bon from public.abonnements where organization_id=$1', [o.id])).rows[0].bon).toBe(true);
    for (const [jours, relances, palier, ouverte] of [[6,1,null,true],[7,1,1,true],[14,2,2,true],[15,3,3,false]] as const) {
      await db.query('update public.abonnements set paiement_en_defaut_depuis=public.aujourdhui_paris()-$2::integer,relances_paiement=$3,derniere_relance_le=public.aujourdhui_paris()-1 where organization_id=$1', [o.id, jours, relances]);
      const r = await db.query('select * from public.abonnements_a_relancer(200) where organization_id=$1', [o.id]);
      expect(r.rows[0]?.palier ?? null, `J+${jours}`).toBe(palier);
      expect((await db.query('select public.org_ecriture_ouverte($1) as ouverte',[o.id])).rows[0].ouverte, `J+${jours}`).toBe(ouverte);
    }
    await db.query('select public.abonnement_relance_envoyee($1)', [o.id]);
    expect((await db.query('select derniere_relance_le=public.aujourdhui_paris() as bon from public.abonnements where organization_id=$1', [o.id])).rows[0].bon).toBe(true);
  });
});
