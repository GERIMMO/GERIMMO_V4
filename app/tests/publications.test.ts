/**
 * Journal public et moteur de propositions (2026-09-11).
 *
 * Ce qui est vérifié ici n'est pas « la file se remplit » — c'est la règle qui
 * donne sa valeur au dispositif : le journal n'affirme rien qu'un humain n'ait
 * vérifié. Une proposition naît avec des TROUS explicites, et la publication
 * est refusée tant qu'il en reste un.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Journal — propositions de publication", () => {
  let db: Client;
  let superAdmin: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'sa-'||gen_random_uuid()||'@test.local','x', now(),'{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    superAdmin = id;
    // Un super admin n'appartient à aucune organisation (contrainte du socle)
    await db.query(
      `insert into public.memberships (account_id, organization_id, role, status)
       values ($1, null, 'super_admin', 'active')`,
      [superAdmin]
    );
  });

  async function enSuperAdmin() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [superAdmin]
    );
    await db.query("set local role authenticated");
  }

  it("le moteur propose les veines du mois, et ne les propose qu'une fois", async () => {
    await enSuperAdmin();
    const premier = await db.query(`select public.proposer_publications('2026-01-15'::date) as n`);
    expect(Number(premier.rows[0].n)).toBeGreaterThan(0);

    // Rejoué le même mois : le moteur peut tourner toutes les nuits sans
    // empiler de doublons (unicité veine + période).
    const second = await db.query(`select public.proposer_publications('2026-01-20'::date) as n`);
    expect(Number(second.rows[0].n)).toBe(0);

    const file = await db.query(
      `select veine, periode, statut from public.publications order by veine`
    );
    expect(file.rows.length).toBeGreaterThan(0);
    for (const p of file.rows) expect(p.statut).toBe("proposition");
    // La cadence trimestrielle date sa période, l'annuelle non
    const irl = file.rows.find((r) => r.veine === "revision-irl");
    if (irl) expect(irl.periode).toBe("2026-T1");
  });

  it("une publication ne paraît pas tant qu'un fait daté manque", async () => {
    await enSuperAdmin();
    await db.query(`select public.proposer_publications('2026-01-15'::date)`);
    const {
      rows: [prop],
    } = await db.query(`select id, corps from public.publications limit 1`);
    expect(prop.corps).toMatch(/\[\[à compléter/);

    await db.query("savepoint s");
    await expect(
      db.query(
        `update public.publications set statut='publiee', slug='essai',
           chapo='Un chapô assez long pour passer le contrôle de longueur du déclencheur.'
         where id = $1`,
        [prop.id]
      )
    ).rejects.toThrow(/attend encore un fait daté/i);
    await db.query("rollback to savepoint s");

    // Le trou comblé, la publication passe — et s'horodate toute seule.
    await db.query(
      `update public.publications
          set statut='publiee', slug='essai-'||substr(md5(random()::text),1,8),
              chapo='Un chapô assez long pour passer le contrôle de longueur du déclencheur.',
              corps = regexp_replace($2, '\\[\\[à compléter[^\\]]*\\]\\]', 'Le fait vérifié, écrit par un humain.', 'g')
        where id = $1`,
      [prop.id, prop.corps]
    );
    const {
      rows: [paru],
    } = await db.query(`select statut, publie_le from public.publications where id = $1`, [prop.id]);
    expect(paru.statut).toBe("publiee");
    expect(paru.publie_le).not.toBeNull();
  });

  it("le visiteur anonyme ne lit que ce qui est paru", async () => {
    await enSuperAdmin();
    await db.query(`select public.proposer_publications('2026-01-15'::date)`);
    const {
      rows: [prop],
    } = await db.query(`select id, corps from public.publications limit 1`);
    // Une seule des deux est publiée
    await db.query(
      `update public.publications
          set statut='publiee', slug='paru-'||substr(md5(random()::text),1,8),
              chapo='Un chapô assez long pour passer le contrôle de longueur du déclencheur.',
              corps = regexp_replace($2, '\\[\\[à compléter[^\\]]*\\]\\]', 'Fait vérifié.', 'g')
        where id = $1`,
      [prop.id, prop.corps]
    );

    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await db.query("set local role anon");
    const vus = await db.query(`select id, statut from public.publications`);
    expect(vus.rows).toHaveLength(1);
    expect(vus.rows[0].statut).toBe("publiee");

    // …et il n'écrit rien (audit du 10/09 : anon n'écrit nulle part)
    await db.query("savepoint s");
    await expect(
      db.query(`update public.publications set titre = 'détourné' where id = $1`, [prop.id])
    ).rejects.toThrow(/permission denied|denied/i);
    await db.query("rollback to savepoint s");
  });

  it("un compte ordinaire ne voit pas la file de propositions", async () => {
    // Un gérant d'agence, membre actif, mais pas super admin
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Agence Journal','active') returning id`
    );
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'g-'||gen_random_uuid()||'@test.local','x', now(),'{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [compte, org]
    );

    await enSuperAdmin();
    await db.query(`select public.proposer_publications('2026-01-15'::date)`);

    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
    const vus = await db.query(`select id from public.publications`);
    expect(vus.rows).toHaveLength(0);

    await db.query("savepoint s");
    await expect(
      db.query(`select public.proposer_publications('2026-01-15'::date)`)
    ).rejects.toThrow(/Super Admin/i);
    await db.query("rollback to savepoint s");
  });
});
