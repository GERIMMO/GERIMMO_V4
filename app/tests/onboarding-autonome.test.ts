/**
 * L'arrivée d'un client, sans personne pour l'accompagner (11/09).
 *
 * Deux moitiés :
 *  — le super admin OUVRE l'organisation depuis la console (RM-16.1.1 : la
 *    création d'agence suit la signature du contrat). Jusqu'ici ce geste
 *    n'existait que sous forme de SQL écrit à la main ;
 *  — le client arrivé voit LE CHEMIN, du compte au premier bail, constaté sur
 *    ses données et non sur des cases cochées.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque cas.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;

async function compte(prefixe: string): Promise<string> {
  // Toujours sous le rôle de service : `authenticated` n'écrit pas dans
  // auth.users, et un test qui crée un compte APRÈS s'être fait passer pour
  // quelqu'un échouerait sur « permission denied ».
  await db.query("reset role");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
       $1 || '-' || gen_random_uuid() || '@test.local','x', now(),
       '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
     returning id`,
    [prefixe]
  );
  return id;
}

async function agir(accountId: string | null) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated" }) : "",
  ]);
  if (accountId) await db.query("set local role authenticated");
}

async function refusee(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint e");
  try {
    await db.query(sql, params);
    await db.query("release savepoint e");
    return "";
  } catch (err) {
    await db.query("rollback to savepoint e");
    return (err as Error).message;
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

describe.skipIf(!DB_URL)("ouvrir une organisation depuis la console", () => {
  async function superAdmin(): Promise<string> {
    const sa = await compte("sa");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`,
      [sa]
    );
    return sa;
  }

  it("crée l'organisation, le compte du responsable et l'adhésion qui les relie", async () => {
    await agir(await superAdmin());
    const {
      rows: [r],
    } = await db.query<{ organization_id: string; email_responsable: string; compte_deja_existant: boolean }>(
      `select * from public.ouvrir_organisation('Cabinet Martin','agence','Patron@Cabinet-Martin.FR',14,false)`
    );
    expect(r.compte_deja_existant).toBe(false);
    // L'adresse est normalisée : deux invitations à « Patron@… » et
    // « patron@… » ne doivent pas fabriquer deux comptes.
    expect(r.email_responsable).toBe("patron@cabinet-martin.fr");

    await db.query("reset role");
    const {
      rows: [org],
    } = await db.query<{ name: string; type: string; status: string; essai_fin: string | null }>(
      `select name, type::text, status::text, essai_fin from public.organizations where id=$1`,
      [r.organization_id]
    );
    expect(org.name).toBe("Cabinet Martin");
    expect(org.type).toBe("agence");
    expect(org.status).toBe("essai");
    expect(org.essai_fin).not.toBeNull();

    const {
      rows: [m],
    } = await db.query<{ role: string; email: string }>(
      `select m.role::text, a.email from public.memberships m
         join public.accounts a on a.id = m.account_id
        where m.organization_id = $1`,
      [r.organization_id]
    );
    // Le rôle découle du type : une agence a un administrateur.
    expect(m.role).toBe("admin_agence");
    expect(m.email).toBe("patron@cabinet-martin.fr");
  });

  it("un parc en gestion directe a un propriétaire, pas un administrateur", async () => {
    await agir(await superAdmin());
    const {
      rows: [r],
    } = await db.query<{ organization_id: string }>(
      `select * from public.ouvrir_organisation('Parc Durand','proprietaire_direct','durand@exemple.fr',30,false)`
    );
    await db.query("reset role");
    const {
      rows: [m],
    } = await db.query<{ role: string }>(
      `select role::text from public.memberships where organization_id=$1`,
      [r.organization_id]
    );
    expect(m.role).toBe("proprietaire_direct");
  });

  it("réutilise le compte d'un responsable déjà connu, au lieu d'en créer un second", async () => {
    // Il gère peut-être déjà une autre agence, ou il est locataire quelque
    // part : un second compte le priverait de son mot de passe.
    const sa = await superAdmin();
    await agir(sa);
    const {
      rows: [premier],
    } = await db.query<{ email_responsable: string }>(
      `select * from public.ouvrir_organisation('Agence Une','agence','double@exemple.fr',14,false)`
    );
    const {
      rows: [second],
    } = await db.query<{ compte_deja_existant: boolean }>(
      `select * from public.ouvrir_organisation('Agence Deux','agence','double@exemple.fr',14,false)`
    );
    expect(second.compte_deja_existant).toBe(true);

    await db.query("reset role");
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      `select count(*)::text as n from auth.users where email=$1`,
      [premier.email_responsable]
    );
    expect(n).toBe("1");
  });

  it("« contrat signé » ouvre directement en actif, sans date d'essai", async () => {
    await agir(await superAdmin());
    const {
      rows: [r],
    } = await db.query<{ organization_id: string }>(
      `select * from public.ouvrir_organisation('Signée','agence','signee@exemple.fr',0,true)`
    );
    await db.query("reset role");
    const {
      rows: [org],
    } = await db.query<{ status: string; essai_fin: string | null }>(
      `select status::text, essai_fin from public.organizations where id=$1`,
      [r.organization_id]
    );
    expect(org.status).toBe("active");
    expect(org.essai_fin).toBeNull();
  });

  it("refuse tout le monde sauf le super admin, et refuse une adresse invalide", async () => {
    const gerant = await compte("gerant");
    await agir(gerant);
    expect(
      await refusee(`select * from public.ouvrir_organisation('X','agence','x@y.fr',14,false)`)
    ).toMatch(/super admin/);

    await agir(await superAdmin());
    expect(
      await refusee(
        `select * from public.ouvrir_organisation('Cabinet Test','agence','pas-une-adresse',14,false)`
      )
    ).toMatch(/invalide/);
    expect(
      await refusee(`select * from public.ouvrir_organisation('  ','agence','x@y.fr',14,false)`)
    ).toMatch(/nom de l'organisation est obligatoire/);
    // Une durée d'essai absurde se refuse aussi : elle finirait en date.
    expect(
      await refusee(`select * from public.ouvrir_organisation('Cabinet Test','agence','x@y.fr',900,false)`)
    ).toMatch(/entre 0 et 365/);
  });
});

describe.skipIf(!DB_URL)("le chemin du compte au premier bail", () => {
  let org = "";
  let gerant = "";

  async function etapes(): Promise<Record<string, { faite: boolean; detail: string | null }>> {
    await agir(gerant);
    const { rows } = await db.query<{ etape: string; faite: boolean; detail: string | null }>(
      `select etape, faite, detail from public.parcours_demarrage($1)`,
      [org]
    );
    return Object.fromEntries(rows.map((r) => [r.etape, { faite: r.faite, detail: r.detail }]));
  }

  beforeEach(async () => {
    await db.query("reset role");
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, essai_fin)
       values ('Toute neuve','essai', current_date + 14) returning id`
    );
    org = id;
    gerant = await compte("gerant");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
  });

  it("une organisation qui vient d'ouvrir n'a aucune étape faite", async () => {
    const e = await etapes();
    expect(Object.keys(e).sort()).toEqual(["bail", "bien", "identite", "locataire", "lot_pret"]);
    expect(Object.values(e).every((x) => !x.faite)).toBe(true);
    // Chaque étape dit ce qu'elle attend, en français.
    expect(e.identite.detail).toMatch(/quittances/);
  });

  it("l'identité se coche quand le nom ET l'adresse sont là", async () => {
    // Le nom seul ne suffit pas : une quittance sans adresse sort avec un
    // émetteur incomplet.
    await db.query("reset role");
    await db.query(`update public.organizations set address_line1='1 rue X' where id=$1`, [org]);
    expect((await etapes()).identite.faite).toBe(false);
    await db.query("reset role");
    await db.query(`update public.organizations set city='Paris' where id=$1`, [org]);
    expect((await etapes()).identite.faite).toBe(true);
  });

  it("« lot prêt » dit CE QUI bloque, et reprend la règle de mise en location", async () => {
    // Pas une seconde liste de conditions : la même que celle qui autorise ou
    // refuse la mise en location (lot_blocages_location).
    await agir(gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query<{ id: string }>(
      `select public.creer_bien_avec_lot($1,'Res','appartement'::public.bien_type,'1 rue X',null,'75001','Paris',1990,false,45,2) as id`,
      [org]
    );
    const e = await etapes();
    expect(e.bien.faite).toBe(true);
    expect(e.lot_pret.faite).toBe(false);
    // La détention manque, et le DPE : ce sont les deux vrais blocages.
    expect(e.lot_pret.detail).toMatch(/Détention incomplète/);
    expect(e.lot_pret.detail).toMatch(/DPE/);
    expect(bien).toBeTruthy();
  });

  it("refuse un compte qui n'est pas de l'organisation", async () => {
    const etranger = await compte("etranger");
    await agir(etranger);
    expect(await refusee(`select * from public.parcours_demarrage($1)`, [org])).toMatch(
      /Accès refusé/
    );
  });
});
