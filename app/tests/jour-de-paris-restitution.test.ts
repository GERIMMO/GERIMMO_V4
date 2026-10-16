/**
 * Décision du dirigeant du 15/10/2026, point 1 de la suite du jour de Paris (« dépôt de garantie et journal comptable général
 * au jour de Paris »), complétée par le tour final de vérification du 16/10 : la RESTITUTION du dépôt de garantie date
 * « aujourd'hui » du jour de Paris (migration 20261014851000).
 *
 * LE DÉFAUT. `finaliser_decompte` datait le décompte (`restitutions.date_emission`) et ses deux écritures du journal
 * (« Restitution du dépôt de garantie », « Restitution d'un trop-perçu ») de `current_date`, le jour du fuseau de la SESSION
 * (UTC chez Supabase) ; `marquer_decompte_envoye` prenait ce même jour par défaut et refusait une date d'envoi postérieure.
 * Entre minuit et 1 h (hiver) ou 2 h (été) à Paris, la base était encore la veille : un décompte finalisé le 1er janvier à
 * 0 h 30 était daté du 31 décembre, donc de l'année précédente du journal, et un envoi daté du jour même était refusé.
 *
 * COMMENT ON LE TESTE SANS DÉPENDRE DE L'HEURE DE LA MACHINE (même méthode que tests/jour-de-paris-suite.test.ts) :
 *  - INSTANTS FIXES : `aujourdhui_paris()` reçoit, le temps de la transaction, son propre corps où l'horloge est un instant
 *    donné ; la session est en UTC. Bascule de minuit en heure d'été (22 h 30 UTC = 0 h 30 à Paris) et d'hiver (23 h 30 UTC
 *    = 0 h 30 à Paris, le 1er janvier), et une heure plus tôt (encore la veille à Paris).
 *  - FUSEAU DE SESSION : l'horloge réelle, avec un fuseau de session choisi pour que `current_date` soit la veille du jour de
 *    Paris, le même jour, ou le lendemain.
 * Dans tous les cas, chaque date « du jour » de la restitution doit être le jour de Paris.
 *
 * Nécessite SUPABASE_DB_URL. Tout est joué dans une transaction annulée à la fin de chaque essai.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

type Temps =
  | { nom: string; mode: "instant"; instant: string; jour: string }
  | { nom: string; mode: "session"; ecart: -1 | 0 | 1 };

const TEMPS: Temps[] = [
  { nom: "heure d'été, 22 h 30 UTC le 31 juillet = 00 h 30 à Paris le 1er août", mode: "instant", instant: "2026-07-31 22:30:00+00", jour: "2026-08-01" },
  { nom: "heure d'été, 21 h 30 UTC le 31 juillet = 23 h 30 à Paris, encore le 31", mode: "instant", instant: "2026-07-31 21:30:00+00", jour: "2026-07-31" },
  { nom: "heure d'hiver, 23 h 30 UTC le 31 décembre = 00 h 30 à Paris le 1er janvier", mode: "instant", instant: "2026-12-31 23:30:00+00", jour: "2027-01-01" },
  { nom: "heure d'hiver, 22 h 30 UTC le 31 décembre = 23 h 30 à Paris, encore le 31", mode: "instant", instant: "2026-12-31 22:30:00+00", jour: "2026-12-31" },
  { nom: "horloge réelle, session en retard d'un jour sur Paris (comme à 23 h 30 UTC)", mode: "session", ecart: -1 },
  { nom: "horloge réelle, session au même jour que Paris", mode: "session", ecart: 0 },
  { nom: "horloge réelle, session en avance d'un jour sur Paris", mode: "session", ecart: 1 },
];

let db: Client;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-restit-paris-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

/** Agit en gérant (compte connecté) ou en administrateur de la base. */
async function agir(compte: string | null) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [compte ? JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" }) : ""]);
  if (compte) await db.query("set local role authenticated");
}

/** Fuseau POSIX de décalage `h` heures par rapport à UTC (positif à l'est). */
function fuseauPosix(h: number): string {
  if (h === 0) return "UTC";
  return h > 0 ? `<+${h}>-${h}` : `<-${-h}>${-h}`;
}

/** Le jour de Paris attendu dans ce « temps » (pour l'horloge réelle, calculé SANS la fonction de la base). */
async function jourDuTemps(t: Temps): Promise<string> {
  if (t.mode === "instant") return t.jour;
  return (await db.query<{ p: string }>("select (now() at time zone 'Europe/Paris')::date::text as p")).rows[0].p;
}

/** Met la session dans le « temps » voulu. Sans effet sur l'horloge réelle. */
async function activerTemps(t: Temps, jour: string): Promise<void> {
  await agir(null);
  if (t.mode === "instant") {
    const {
      rows: [{ corps }],
    } = await db.query<{ corps: string }>("select prosrc as corps from pg_proc where oid = 'public.aujourdhui_paris()'::regprocedure");
    expect(corps, "aujourdhui_paris() doit lire l'horloge par now()").toMatch(/\bnow\(\)/i);
    const fige = corps.replace(/\bnow\(\)/gi, `timestamptz '${t.instant}'`);
    await db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path to '' as $f$ ${fige} $f$`);
    await db.query("select set_config('TimeZone', 'UTC', true)");
    const {
      rows: [{ j }],
    } = await db.query<{ j: string }>("select public.aujourdhui_paris()::text as j");
    expect(j, `à ${t.instant}, Paris doit être le ${t.jour}`).toBe(t.jour);
    return;
  }
  const {
    rows: [{ h }],
  } = await db.query<{ h: number }>(
    // Jusqu'à ±48 h : entre minuit et 2 h à Paris, une session « en avance d'un jour sur Paris » demande plus de 24 h d'avance sur UTC.
    `select h from generate_series(-48, 48) h
      where ((now() at time zone 'UTC') + h * interval '1 hour')::date = ($1::date + $2::int)
      order by abs(h), h limit 1`,
    [jour, t.ecart]
  );
  await db.query("select set_config('TimeZone', $1, true)", [fuseauPosix(h)]);
  const {
    rows: [{ j, attendu }],
  } = await db.query<{ j: string; attendu: string }>("select current_date::text as j, ($1::date + $2::int)::text as attendu", [jour, t.ecart]);
  expect(j, "le fuseau de session simulé ne donne pas le jour voulu").toBe(attendu);
}

type Monde = { jour: string; gerant: string; bail: string; restitution: string };

/**
 * Un logement sous mandat, un bail meublé terminé, et sa restitution en cours : dépôt de 700 €, aucun impayé, 50 € de trop-perçu,
 * clés remises la veille du jour de Paris. Le décompte finalisé rend 750 € : 700 € sortent du dépôt, 50 € remboursent le trop-perçu
 * (deux écritures du journal).
 */
async function monter(jour: string): Promise<Monde> {
  await agir(null);
  const {
    rows: [{ id: org }],
  } = await db.query<{ id: string }>("insert into public.organizations (name, status) values ('Restitution au jour de Paris', 'active') returning id");
  const gerant = await creerUtilisateur();
  await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')", [gerant, org]);
  await agir(gerant);
  const {
    rows: [{ id: bien }],
  } = await db.query<{ id: string }>(
    "select public.creer_bien_avec_lot($1,'4 rue du Dépôt','appartement'::public.bien_type,'4 rue du Dépôt',null,'75003','Paris',1990,false,40,2) as id",
    [org]
  );
  await agir(null);
  const lot = (await db.query<{ id: string }>("select id from public.lots where bien_id = $1", [bien])).rows[0].id;
  // Un mandat actif depuis longtemps sur le lot (déclencheurs suspendus le temps d'écrire).
  await db.query("set session_replication_role = replica");
  await db.query(
    `with p as (insert into public.persons (organization_id, nom, prenom, email) values ($1, 'Mandant', 'Banc', 'mandant-' || gen_random_uuid() || '@exemple.fr') returning id),
          m as (insert into public.mandats (organization_id, person_id, etat, date_debut) select $1, id, 'actif', date '2000-01-01' from p returning id)
     insert into public.mandat_lignes (organization_id, mandat_id, lot_id, date_debut) select $1, m.id, $2, date '2000-01-01' from m`,
    [org, lot]
  );
  await db.query("set session_replication_role = origin");
  const {
    rows: [{ id: locataire }],
  } = await db.query<{ id: string }>("insert into public.persons (organization_id, nom, prenom, email) values ($1,'Martin','Claire','claire.martin@exemple.fr') returning id", [org]);
  const {
    rows: [{ id: bail }],
  } = await db.query<{ id: string }>(
    `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, depot_garantie, etat, date_debut, jour_echeance, type)
     values ($1,$2,$3,700,50,700,'termine', ($4::date - interval '2 years')::date, 1, 'meuble') returning id`,
    [org, lot, locataire, jour]
  );
  const {
    rows: [{ id: restitution }],
  } = await db.query<{ id: string }>(
    `insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, trop_percu, statut)
     values ($1,$2,$3::date - 1,1,700,0,50,'en_cours') returning id`,
    [org, bail, jour]
  );
  return { jour, gerant, bail, restitution };
}

/** Une date calculée par la base (évite tout calcul de date côté JavaScript). */
async function date(expression: string, params: unknown[] = []): Promise<string> {
  return (await db.query<{ d: string }>(`select (${expression})::date::text as d`, params)).rows[0].d;
}

async function echoue(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint essai");
  try {
    await db.query(sql, params);
    return "";
  } catch (e) {
    return (e as Error).message;
  } finally {
    await db.query("rollback to savepoint essai");
    await db.query("release savepoint essai");
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

describe.skipIf(!DB_URL).each(TEMPS)("restitution du dépôt au jour de Paris — $nom", (temps) => {
  async function preparer(): Promise<Monde> {
    const jour = await jourDuTemps(temps);
    const m = await monter(jour);
    await activerTemps(temps, jour);
    return m;
  }

  it("décompte finalisé : sa date d'émission et ses deux écritures du journal (dépôt, trop-perçu) portent le jour de Paris", async () => {
    const m = await preparer();
    await agir(m.gerant);
    const {
      rows: [{ solde }],
    } = await db.query<{ solde: string }>("select public.finaliser_decompte($1)::text as solde", [m.restitution]);
    expect(solde).toBe("750.00");
    await agir(null);
    const {
      rows: [{ emission }],
    } = await db.query<{ emission: string }>("select date_emission::text as emission from public.restitutions where id = $1", [m.restitution]);
    expect(emission, "date d'émission du décompte").toBe(m.jour);
    const { rows: ecritures } = await db.query<{ categorie: string; montant: string; piece: string; imputation: string }>(
      `select categorie::text as categorie, round(montant, 2)::text as montant, date_piece::text as piece, date_imputation::text as imputation
         from public.ecritures where bail_id = $1 and categorie::text in ('depot_garantie', 'trop_percu_restitue') and sens::text = 'depense' order by 1`,
      [m.bail]
    );
    expect(ecritures).toEqual([
      { categorie: "depot_garantie", montant: "700.00", piece: m.jour, imputation: m.jour },
      { categorie: "trop_percu_restitue", montant: "50.00", piece: m.jour, imputation: m.jour },
    ]);
  });

  it("envoi du décompte : sans date, daté du jour de Paris ; daté du jour de Paris, accepté ; daté du lendemain, refusé", async () => {
    const m = await preparer();
    await agir(m.gerant);
    await db.query("select public.finaliser_decompte($1)", [m.restitution]);

    // Sans date (valeur par défaut du paramètre) : le jour de Paris. Essai annulé ensuite (un seul envoi par décompte).
    await db.query("savepoint sans_date");
    await db.query("select public.marquer_decompte_envoye($1)", [m.restitution]);
    await agir(null);
    expect((await db.query<{ e: string }>("select envoye_le::text as e from public.restitutions where id = $1", [m.restitution])).rows[0].e).toBe(m.jour);
    await db.query("rollback to savepoint sans_date");

    await agir(m.gerant);
    const lendemain = await date("$1::date + 1", [m.jour]);
    expect(await echoue("select public.marquer_decompte_envoye($1, $2::date)", [m.restitution, lendemain])).toMatch(/Date d'envoi invalide/);
    // Le défaut corrigé : entre minuit et 2 h à Paris, l'envoi daté du jour même était refusé (« postérieur » au jour UTC).
    await db.query("select public.marquer_decompte_envoye($1, $2::date)", [m.restitution, m.jour]);
    await agir(null);
    expect((await db.query<{ e: string }>("select envoye_le::text as e from public.restitutions where id = $1", [m.restitution])).rows[0].e).toBe(m.jour);
  });
});
