/**
 * Réseau d'artisans choisi par l'artisan (migration 20261023180000) : les verrous entre une sollicitation du réseau et un
 * changement de zone, et la revérification de l'accès d'une agence sous le verrou de la fiche (relectures du 23/10 :
 * « tests et migration », constat 4 ; sécurité, constat 3).
 *
 *  - une sollicitation envoyée pendant que l'artisan retire le bien de sa zone attend la fin de ce changement, puis elle
 *    est refusée (« plus disponible ») ;
 *  - un changement de zone attend la fin d'une sollicitation en cours ;
 *  - une agence dont l'appel commence avant la réclamation de la fiche par son artisan, et finit après, n'écrit rien.
 *
 * Deux connexions réelles : la fixture est VALIDÉE (les sessions ne se voient qu'après un commit), puis nettoyée ; d'où le
 * classement en série (vitest.config.ts). Nécessite SUPABASE_DB_URL (base locale jetable `gerimmo_ci_…`), base migrée.
 */
import { randomInt } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { supprimerOrganisationDeTest } from "./fixtures/nettoyer-organisation";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("Réseau choisi par l'artisan — deux sessions qui se croisent", () => {
  let db: Client, a: Client, b: Client;
  let org: string, agence: string, bailleur: string, gestionnaire: string, artisanCompte: string, reclamant: string;
  let artisan: string, fiche: string, consultation: string;
  const comptes: string[] = [];
  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (nom: string) => {
    const c = await id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [nom]);
    comptes.push(c);
    return c;
  };
  const siret = () => String(randomInt(10000000000000, 99999999999999));
  const devenir = async (c: Client, qui: string) => {
    await c.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]);
    await c.query("set local role authenticated");
  };
  /** Attend que la session `c` soit bloquée sur un verrou (2 s au plus). */
  const bloquee = async (c: Client) => {
    const pid = (await c.query("select pg_backend_pid() pid")).rows[0].pid;
    return async () => {
      for (let n = 0; n < 100; n++) {
        if ((await db.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock") return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    };
  };
  const zones = async (art: string) =>
    (await db.query("select coalesce(array_agg(code_postal order by code_postal), '{}') z from public.artisan_zones where artisan_id=$1", [art])).rows[0].z as string[];

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    a = new Client({ connectionString: url });
    b = new Client({ connectionString: url });
    await Promise.all([db.connect(), a.connect(), b.connect()]);
    await db.query("begin");
    [bailleur, gestionnaire, artisanCompte, reclamant] = [await compte("conc-bailleur"), await compte("conc-agence"), await compte("conc-artisan"), await compte("conc-reclamant")];
    org = await id("insert into public.organizations(name,type,status) values('TEST concurrence réseau','proprietaire_direct','active') returning id");
    agence = await id("insert into public.organizations(name,type,status) values('TEST concurrence agence','agence','active') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'admin_agence')", [bailleur, org, gestionnaire, agence]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'TEST concurrence','appartement','1 rue du Test','75011','Paris','75056') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id", [org, bien]);
    const personne = await id("insert into public.persons(organization_id,nom) values($1,'TEST locataire') returning id", [org]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-100,600,40) returning id", [org, lot, personne]);
    const incident = await id("insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,'TEST-'||gen_random_uuid(),$2,$3,$4,'espace_locataire','plomberie_canalisation','TEST','qualifie','proprietaire','TEST') returning id", [org, lot, bail, personne]);
    artisan = await id("insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values('TEST concurrence réseau',$1,'0600000000',$2,'publique','valide','verifie') returning id", [siret(), artisanCompte]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [artisan]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')", [artisan]);
    // Une fiche SANS compte, dans le carnet actif de l'agence : elle seule peut encore en écrire la zone.
    fiche = await id("insert into public.artisans(raison_sociale,siret,telephone,email) values('TEST fiche à réclamer',$1,'0600000000','reclamation@example.invalid') returning id", [siret()]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [fiche]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')", [fiche]);
    await db.query("insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)", [agence, fiche]);
    await db.query("commit");
    await db.query("begin");
    await devenir(db, bailleur);
    consultation = await id("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) id", [org, incident]);
    await db.query("commit");
  });
  afterEach(async () => {
    await Promise.all([a.query("rollback"), b.query("rollback")]);
  });
  afterAll(async () => {
    await Promise.all([a?.query("rollback"), b?.query("rollback")]);
    await db?.query("rollback");
    await db?.query("reset role");
    // Le journal des zones et des métiers (écrit sans compte pour la fixture), tout ce qui porte les deux fiches, puis
    // les fiches et les organisations. `replica` suspend les clés étrangères : sans suppression explicite des lignes
    // filles, métiers et zones resteraient orphelins (l'exercice de restauration le refuse ensuite).
    if (db) {
      const fiches = [artisan, fiche].filter(Boolean);
      await db.query("begin");
      await db.query("set local session_replication_role = replica");
      await db.query("delete from public.audit_log where details->>'artisan' = any($1::text[])", [fiches]);
      const { rows } = await db.query<{ table_name: string }>(
        `select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
          where c.table_schema = 'public' and c.column_name = 'artisan_id' and t.table_type = 'BASE TABLE'`);
      for (const { table_name } of rows) await db.query(`delete from public."${table_name}" where artisan_id = any($1::uuid[])`, [fiches]);
      await db.query("delete from public.artisans where id = any($1::uuid[])", [fiches]);
      await db.query("commit");
      await supprimerOrganisationDeTest(db, agence, []);
      await supprimerOrganisationDeTest(db, org, comptes);
    }
    await Promise.all([a?.end(), b?.end(), db?.end()]);
  });

  it("une sollicitation envoyée pendant un retrait de zone attend sa fin, puis elle est refusée", async () => {
    await a.query("begin");
    await devenir(a, artisanCompte);
    await a.query("select public.artisan_definir_metiers_zones($1,array['plomberie']::public.artisan_metier[],array['69003'])", [artisan]);
    await b.query("begin");
    await devenir(b, bailleur);
    const attendre = await bloquee(b);
    const envoi = b.query("select public.solliciter_artisan($1,$2,$3) id", [org, consultation, artisan]).then(() => null, (e: Error) => e.message);
    expect(await attendre()).toBe(true);
    await a.query("commit");
    expect(await envoi).toMatch(/plus disponible/);
    await b.query("rollback");
    expect((await db.query("select id from public.incident_sollicitations where consultation_id=$1", [consultation])).rows).toHaveLength(0);
    // Remise en état pour le cas suivant (zone d'origine).
    await a.query("begin");
    await devenir(a, artisanCompte);
    await a.query("select public.artisan_definir_metiers_zones($1,array['plomberie']::public.artisan_metier[],array['75011'])", [artisan]);
    await a.query("commit");
  });

  it("un changement de zone attend la fin d'une sollicitation en cours", async () => {
    await b.query("begin");
    await devenir(b, bailleur);
    expect((await b.query("select public.solliciter_artisan($1,$2,$3) id", [org, consultation, artisan])).rows[0].id).toBeTruthy();
    await a.query("begin");
    await devenir(a, artisanCompte);
    const attendre = await bloquee(a);
    const changement = a.query("select public.artisan_definir_metiers_zones($1,array['plomberie']::public.artisan_metier[],array['69003'])", [artisan]).then(() => "ok", (e: Error) => e.message);
    expect(await attendre()).toBe(true);
    await b.query("rollback");
    expect(await changement).toBe("ok");
    await a.query("rollback");
    expect(await zones(artisan)).toEqual(["75011"]);
  });

  it("une agence entrée avant la réclamation de la fiche par son artisan n'en écrit plus la zone après", async () => {
    // A : la réclamation (inscrire_mon_entreprise_artisan pose account_id sur la fiche), tenue ouverte.
    await a.query("begin");
    await a.query("update public.artisans set account_id=$1 where id=$2", [reclamant, fiche]);
    // B : l'agence passe le contrôle d'accès (fiche encore sans compte pour elle), puis attend le verrou de la fiche.
    await b.query("begin");
    await devenir(b, gestionnaire);
    const attendre = await bloquee(b);
    const ecriture = b.query("select public.artisan_definir_metiers_zones($1,array['plomberie','electricite']::public.artisan_metier[],array['13','69','75'])", [fiche]).then(() => "ok", (e: Error) => e.message);
    expect(await attendre()).toBe(true);
    await a.query("commit");
    expect(await ecriture).toMatch(/lui appartiennent/);
    await b.query("rollback");
    expect(await zones(fiche)).toEqual(["75011"]);
    expect((await db.query("select array_agg(metier::text) m from public.artisan_metiers where artisan_id=$1", [fiche])).rows[0].m).toEqual(["plomberie"]);
  });
});
