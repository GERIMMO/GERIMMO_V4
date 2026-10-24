/**
 * Décision du dirigeant du 23/10/2026 — migration 20261023180000 (le réseau d'artisans suit la zone et les métiers choisis
 * par l'artisan) et son retour arrière.
 *
 *  - rejouée deux fois, la migration ne change ni les définitions, ni les droits, ni l'index, ni les déclencheurs ;
 *  - le retour rend aux huit fonctions du réseau leur corps EXACT de 20260928081000 (lu dans le fichier), retire les trois
 *    morceaux marqués de `artisan_definir_metiers_zones` (la ligne de 20261014841000 reste), l'aide de pré-filtre,
 *    l'index, les déclencheurs du journal des zones et des métiers et leur fonction, les commentaires et la version ;
 *    rejoué, il ne fait rien ; l'ancienne règle revient (commune « fermée ») ;
 *  - le retour est atomique : une erreur après lui, dans la même transaction, annule tout ;
 *  - une définition inattendue de `artisan_definir_metiers_zones` arrête la migration en nommant la fonction, y compris
 *    au rejeu : la marque présente ne suffit pas, chacun des trois morceaux doit y être une fois ;
 *  - aller, retour, aller redonne l'état migré.
 *
 * La version est enregistrée au format de la production (« 20261023180000 ») : la CI (e2e/local/preparer-ci.mjs)
 * l'enregistre sous le nom complet du fichier, que le retour ne retire pas ; le test pose donc lui-même la ligne au
 * format de la production, sans dépendre de la façon dont la base a été montée.
 *
 * Une seule transaction pour le fichier, annulée à la fin ; la migration et son retour y sont joués (DDL : index, fonctions,
 * commentaires), d'où le classement en série (vitest.config.ts). Nécessite SUPABASE_DB_URL, base migrée.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const NOM = "20261023180000_reseau_zone_choisie_par_artisan";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const origine = readFileSync("supabase/migrations/20260928081000_ouverture_reseau_par_commune_metier.sql", "utf8");
/**
 * Les migrations postérieures qui réécrivent une fonction du réseau, rejouées après celle-ci pour que l'état « migré »
 * reste celui de toute la chaîne : 20261024100000 (plan de conformité du 23/10, R10) ne trie plus par note qu'à partir
 * de trois évaluations dans `artisans_disponibles_bien`. Rejouable, elle accepte sa forme déjà convertie.
 */
const SUITE = [readFileSync("supabase/migrations/20261024100000_acceptation_conditions_et_classement_artisans.sql", "utf8")];

/** Les huit fonctions du réseau rendues par le retour, et leur corps dans 20260928081000. */
const RESEAU = [
  "reseau_artisan_eligible(uuid,text,public.artisan_metier)",
  "reseau_disponibilite(uuid,uuid,public.artisan_metier,public.nature_travaux)",
  "artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux)",
  "solliciter_artisan(uuid,uuid,uuid)",
  "ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer)",
  "reseau_regler_ouverture(text[],public.artisan_metier,boolean,boolean)",
  "reseau_rattacher_artisan(uuid,text[],public.artisan_metier,boolean)",
  "reseau_pilotage(text,public.artisan_metier)",
];
const ZONES = "artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])";
const MARQUE = "RESEAU_ZONE_ARTISAN_20261023";

/** Le corps ($$ … $$) d'une fonction créée par 20260928081000 (dernière création du nom dans le fichier). */
function corpsOrigine(signature: string): string {
  const nom = signature.slice(0, signature.indexOf("("));
  const blocs = [...origine.matchAll(new RegExp(`create function public\\.${nom}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "g"))];
  if (blocs.length === 0) throw new Error(`${nom} introuvable dans 20260928081000`);
  return blocs[blocs.length - 1][1];
}

describe.skipIf(!url)("20261023180000 — réseau choisi par l'artisan : rejeu et retour arrière", () => {
  let db: Client;
  /** Cette migration, puis celles qui la suivent sur les mêmes fonctions (SUITE). */
  const migrer = async () => {
    await db.query(migration);
    for (const suite of SUITE) await db.query(suite);
  };
  const corps = async (signature: string) =>
    (await db.query("select prosrc from pg_proc where oid = to_regprocedure($1)", [`public.${signature}`])).rows[0]?.prosrc as string | undefined;
  const definition = async (signature: string) =>
    (await db.query("select pg_get_functiondef(to_regprocedure($1)) d", [`public.${signature}`])).rows[0].d as string;
  /** Définitions, droits et commentaires des fonctions touchées, index et commentaires des tables, version. */
  const empreinte = async () =>
    (await db.query(
      `select coalesce(jsonb_object_agg(s, jsonb_build_array(
           (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.oid = to_regprocedure('public.' || s)),
           (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.' || s)),
           obj_description(to_regprocedure('public.' || s), 'pg_proc'))), '{}'::jsonb)
         || jsonb_build_object(
           'index', (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'artisan_zones_code_postal_idx'),
           'declencheurs', (select coalesce(jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname), '[]'::jsonb) from pg_trigger t
             where not t.tgisinternal and t.tgrelid in ('public.artisan_zones'::regclass, 'public.artisan_metiers'::regclass)
               and t.tgname like '%journal%'),
           'ouvertures', obj_description('public.reseau_ouvertures'::regclass),
           'rattachements', obj_description('public.reseau_artisan_communes'::regclass),
           'version', (select count(*) from supabase_migrations.schema_migrations where version = '20261023180000')) e
       from unnest($1::text[]) s`,
      [[...RESEAU, ZONES, "zones_couvrant_code_postal(text)", "journaliser_metiers_zones_artisan()"]]
    )).rows[0].e as Record<string, unknown>;

  /** Un artisan validé, public, avec compte, plomberie, zone 75011 ; un bailleur et son bien confirmé à Paris 11e. */
  let org: string, bien: string, proprietaire: string;
  const compte = async () =>
    (await db.query(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','rejeu-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`
    )).rows[0].id as string;
  const etat = async () => {
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [proprietaire]);
    await db.query("set local role authenticated");
    const r = (await db.query("select etat, nb_artisans from public.reseau_disponibilite($1,$2,'plomberie')", [org, bien])).rows[0];
    await db.query("reset role");
    return r;
  };

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    // Format de la production ; la CI enregistre le nom complet du fichier (voir l'en-tête).
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261023180000','reseau_zone_choisie_par_artisan') on conflict do nothing");
    proprietaire = await compte();
    org = (await db.query("insert into public.organizations(name,type,status) values('Rejeu réseau','proprietaire_direct','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [proprietaire, org]);
    bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'Bien rejeu','appartement','1 rue du Test','75011','Paris','75056') returning id", [org])).rows[0].id;
    const artisan = (await db.query("insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values('Artisan rejeu','72456789012345','0600000000',$1,'publique','valide','verifie') returning id", [await compte()])).rows[0].id;
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [artisan]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')", [artisan]);
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("la base visée est migrée : réseau par la zone, marque posée une fois, ligne de 20261014841000 intacte", async () => {
    expect(await etat()).toEqual({ etat: "ouverte", nb_artisans: "1" });
    const zones = await definition(ZONES);
    expect(zones.split(MARQUE)).toHaveLength(4);
    expect(zones).toContain("Relecture du 15/10 (invitation d'artisan)");
    expect(zones).toContain("m.role in ('admin_agence','agent'))");
    expect(zones).not.toContain("proprietaire_direct");
    for (const s of RESEAU) expect(await corps(s), s).not.toContain("reseau_ouvertures");
  });

  it("rejouée deux fois, la migration ne change ni définitions, ni droits, ni index, ni commentaires", async () => {
    const avant = await empreinte();
    await migrer();
    await migrer();
    expect(await empreinte()).toEqual(avant);
  });

  it("le retour rend les corps exacts de 20260928081000 et l'ancienne règle ; rejoué, il ne fait rien ; aller, retour, aller", async () => {
    const migre = await empreinte();
    await db.query(retour);
    for (const s of RESEAU) expect(await corps(s), s).toBe(corpsOrigine(s));
    const zones = await definition(ZONES);
    expect(zones).not.toContain(MARQUE);
    expect(zones).toContain("m.role in ('admin_agence','agent')) -- Relecture du 15/10 (invitation d'artisan)");
    const apres = await empreinte();
    expect(apres["zones_couvrant_code_postal(text)"]).toEqual([null, null, null]);
    expect(apres["journaliser_metiers_zones_artisan()"]).toEqual([null, null, null]);
    expect(apres).toMatchObject({ index: 0, declencheurs: [], rattachements: null, version: 0,
      ouvertures: "Décisions explicites du super administrateur. Aucune ouverture créée par l’inscription ou la validation d’un artisan." });
    // L'ancienne règle : validé, public, zone couvrante, mais aucune ouverture décidée → fermée.
    expect(await etat()).toEqual({ etat: "fermee", nb_artisans: "0" });
    await db.query(retour);
    expect(await empreinte()).toEqual(apres);
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261023180000','reseau_zone_choisie_par_artisan')");
    await migrer();
    expect(await empreinte()).toEqual(migre);
    expect(await etat()).toEqual({ etat: "ouverte", nb_artisans: "1" });
  });

  it("le retour est atomique : une erreur après lui dans la même transaction annule tout", async () => {
    const migre = await empreinte();
    await db.query("savepoint essai");
    await expect(db.query(`${retour}; select 1/0;`)).rejects.toMatchObject({ code: "22012" });
    await db.query("rollback to savepoint essai");
    expect(await empreinte()).toEqual(migre);
  });

  it("une définition inattendue de artisan_definir_metiers_zones arrête migration et retour, en nommant la fonction", async () => {
    await db.query(retour);
    // Une ancre disparue (corps réécrit hors migration) : la migration refuse au lieu d'écrire à l'aveugle.
    const d = await definition(ZONES);
    await db.query(d.replace("    raise exception 'Choisissez au moins un métier';", "    raise exception 'Choisissez un métier';"));
    await db.query("savepoint essai");
    await expect(db.query(migration)).rejects.toThrow(/définition inattendue de artisan_definir_metiers_zones/);
    await db.query("rollback to savepoint essai");
    // Et, migrée puis altérée, le retour refuse de même.
    await db.query(d);
    await db.query(migration);
    const m = await definition(ZONES);
    await db.query(m.replace("and aa.statut = 'actif' and aa.blacklist_le is null", "and aa.statut = 'actif'"));
    await db.query("savepoint essai");
    await expect(db.query(retour)).rejects.toThrow(/définition inattendue de artisan_definir_metiers_zones/);
    await db.query("rollback to savepoint essai");
    // Rejouée sur cette forme altérée (marque présente, un morceau amputé), la migration refuse aussi : elle ne se
    // contente plus de trouver sa marque (relecture du 23/10, constat 5).
    await db.query("savepoint essai");
    await expect(db.query(migration)).rejects.toThrow(/définition inattendue de artisan_definir_metiers_zones \(morceau marqué/);
    await db.query("rollback to savepoint essai");
  });
});
