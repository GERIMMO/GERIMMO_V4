import { createHash, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';

config({ path: '.env.local', quiet: true });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)('Renvoi volontaire d’une invitation artisan', () => {
  it('deux transactions sur le même carnet réservent une seule émission ; une réponse perdue bloque tout renvoi', async () => {
    if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw Error('Base de recette locale requise');
    const admin = new Client({ connectionString: url });
    const premier = new Client({ connectionString: url });
    const second = new Client({ connectionString: url });
    await Promise.all([admin.connect(),premier.connect(),second.connect()]);
    const compte = randomUUID(), org = randomUUID();
    const email = 'artisan-' + randomUUID() + '@example.invalid';
    const devenir = async (db: Client) => {
      await db.query('begin');
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub:compte, role:'authenticated' })]);
      await db.query('set local role authenticated');
    };
    const premierBloqueSecond = async () => {
      const a = (await admin.query('select pid from pg_stat_activity where application_name=$1', [compte])).rows[0].pid;
      const b = (await admin.query('select pid from pg_stat_activity where application_name=$1', [org])).rows[0].pid;
      await expect.poll(async () => (await admin.query('select $1::int=any(pg_blocking_pids($2)) bloque',[a,b])).rows[0].bloque,
        { timeout:3500, interval:20 }).toBe(true);
    };
    let attente: Promise<unknown> | undefined;
    try {
      await premier.query("select set_config('application_name',$1,false)",[compte]);
      await second.query("select set_config('application_name',$1,false)",[org]);
      await admin.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
        raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
        values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now(),'','','','','')`,
        [compte,'proprietaire-'+compte+'@example.invalid']);
      await admin.query("insert into organizations(id,name,status,type) values($1,'Parc fictif de renvoi','active','proprietaire_direct')",[org]);
      await admin.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[compte,org]);
      await devenir(premier);
      const invitation = (await premier.query("select public.preparer_invitation_artisan($1,$2,null,null) r",[org,email])).rows[0].r.id;
      await premier.query('commit');
      const contexte = { type:'invitation_artisan', id:invitation, acteur:compte, destinataire:createHash('sha256').update(email).digest('hex') };
      const initial = createHash('sha256').update(randomUUID()).digest('hex');
      await admin.query(`insert into courriels_durables(id,organization_id,empreinte,etat,contexte_metier,accepte_le)
        values($1,$2,'original','accepte',$3,now())`,[initial,org,contexte]);
      expect((await admin.query("select public.finaliser_courriel_metier($1) ok",[initial])).rows[0].ok).toBe(true);
      const vu = (await admin.query('select envoye_le::text t from invitations_artisans where id=$1',[invitation])).rows[0].t;
      const decision = async (client: Client) => (await client.query(
        'select public.preparer_renvoi_invitation_artisan($1,$2,$3) r',[org,invitation,vu])).rows[0].r;

      await devenir(premier); await devenir(second);
      const a = await decision(premier); const b = decision(second); attente = b;
      await premierBloqueSecond();
      await premier.query('commit');
      expect((await b).envoi_precedent).toBe(a.envoi_precedent);
      expect(a.envoi_precedent).toMatch(/^\d+$/);
      await second.query('commit');
      // Même construction que l'action et le transport durable, pour les deux demandes.
      const cle = 'invitation-artisan-'+invitation+'-apres-'+a.envoi_precedent;
      const id = createHash('sha256').update(JSON.stringify([org,cle,email])).digest('hex');
      const reservation = (db: Client, jeton: string) => db.query('select prendre_courriel($1,$2,$3,$4) r',[id,org,'contenu-identique',jeton]);
      await premier.query('begin'); await second.query('begin');
      const jeton = randomUUID();
      expect((await reservation(premier,jeton)).rows[0].r.etat).toBe('pris');
      await premier.query('update courriels_durables set contexte_metier=$2 where id=$1',[id,contexte]);
      const bis = reservation(second,randomUUID()); attente=bis;
      await premierBloqueSecond();
      await premier.query("select finir_courriel($1,$2,'inconnu',null)",[id,jeton]);
      await premier.query('commit');
      expect((await bis).rows[0].r.etat).toBe('inconnu');
      await second.query('commit');
      await devenir(premier);
      expect((await decision(premier)).erreur).toMatch(/vérification/);
      await premier.query('commit');
      expect((await admin.query('select etat,tentatives from courriels_durables where id=$1',[id])).rows).toEqual([{etat:'inconnu',tentatives:1}]);
    } finally {
      await premier.query('rollback'); await attente?.catch(() => undefined); await second.query('rollback');
      await admin.query('begin'); await admin.query('select public.tache_systeme()');
      await admin.query('delete from courriels_evenements e using courriels_durables c where c.organization_id=$1 and e.courrier_id=c.id',[org]);
      for (const table of ['courriels_durables','invitations_artisans','memberships','audit_log']) {
        await admin.query('delete from public.'+table+' where organization_id=$1',[org]);
      }
      await admin.query('delete from organizations where id=$1',[org]);
      await admin.query('delete from audit_log where account_id=$1',[compte]);
      await admin.query('delete from auth.users where id=$1',[compte]);
      await admin.query('commit');
      await Promise.all([admin.end(),premier.end(),second.end()]);
    }
  });
});
