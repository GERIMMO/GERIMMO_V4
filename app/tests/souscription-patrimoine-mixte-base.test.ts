import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

it.skipIf(!url)("un propriétaire gère ses deux patrimoines dans un espace et retrouve la même intention de souscription", async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("begin");
    const compte = randomUUID();
    const email = compte + "@example.test";
    await db.query("insert into auth.users(id,email,aud,role) values($1,$2,'authenticated','authenticated')", [compte, email]);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing", [compte, email]);
    const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id;
    const org = await id("insert into public.organizations(name,type,status) values('Espace mixte fictif','proprietaire_direct','essai') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    for (const qualite of ["Personne physique", "SCI"]) {
      const bailleur = await id("insert into public.persons(organization_id,nom,qualite) values($1,$2,$2) returning id", [org, qualite]);
      const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'appartement','1 rue du Test','69001','Lyon') returning id", [org, qualite]);
      const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Logement','disponible') returning id", [org, bien]);
      await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, bailleur]);
    }
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:compte,role:"authenticated"})]);
    expect((await db.query("select public.initialiser_espace_proprietaire() as espace")).rows[0].espace).toBe(org);
    expect((await db.query("select unites_a_couvrir from public.etat_abonnement($1)", [org])).rows[0].unites_a_couvrir).toBe(2);
    await db.query("reset role");
    await db.query("set local role service_role");
    const reserver = async () => (await db.query(
      "select intention,reprise from public.intention_souscription_reserver($1,repeat('a',64),45,120)", [org]
    )).rows[0];
    const premiere = await reserver();
    expect(premiere.reprise).toBe(false);
    expect(await reserver()).toEqual({ intention: premiere.intention, reprise: true });
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
