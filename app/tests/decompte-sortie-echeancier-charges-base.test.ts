/**
 * LE DÉCOMPTE DE SORTIE NE RETIENT PAS DEUX FOIS UN COMPLÉMENT DE CHARGES DÉJÀ PAYÉ — audit palier 1, P0-02 (22/11/2026).
 *
 * Le défaut, rejoué sur le banc : un complément de charges réglé par l'échéancier de charges est consigné dans
 * l'échéancier (et en écriture de recette), jamais dans `encaissements`. `montants_reels_bail` ne retranchait que les
 * `encaissements` : la somme reçue restait comptée « impayée » et aurait été retenue sur le dépôt de garantie.
 *
 * Ces tests jouent la VRAIE chaîne, sous les vrais rôles : régularisation (propriétaire), proposition et transmission
 * de l'échéancier (propriétaire), accord (locataire, depuis son espace), réception confirmée (propriétaire), puis
 * décompte de sortie. Ils tiennent :
 *  1. sans échéancier, ou avec un échéancier dont rien n'a été reçu : le complément reste dû, comme avant ;
 *  2. chaque somme reçue par l'échéancier sort de la dette, à l'euro près, y compris une réception partielle ;
 *  3. le décompte de restitution démarré ensuite ne retient plus rien du complément payé ;
 *  4. un trop-perçu de régularisation n'est pas touché ;
 *  5. la migration se rejoue sans effet, son retour rend la définition d'avant à l'identique, une définition
 *     inattendue arrête tout.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122110000_decompte_sortie_echeancier_charges";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("décompte de sortie et échéancier de charges — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé au LISEZ-MOI", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261101152354_echeanciers_charges_suivi.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
  });

  it("la migration ne réécrit pas la fonction depuis un fichier : elle relit la définition en vigueur, et n'ouvre aucun droit", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("pg_get_functiondef('public.montants_reels_bail(uuid)'::regprocedure)");
    expect(sql).not.toMatch(/create or replace function/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });
});

describe.skipIf(!url)("le décompte de sortie retranche ce qui a été reçu par un échéancier de charges (avec base)", () => {
  let db: Client, org: string, proprietaire: string, locataire: string, bail: string;
  const annee = new Date().getFullYear() - 1;

  async function utilisateur() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  /** La dette du bail telle que la restitution la lit. */
  async function dette() {
    await db.query("reset role");
    const { rows } = await db.query<{ impayes: string; trop_percu: string }>(
      "select impayes::text, trop_percu::text from public.montants_reels_bail($1)", [bail]);
    return rows[0];
  }
  /** Régularisation de l'an dernier par le propriétaire, avec son justificatif. Rend l'écart (négatif = complément dû). */
  async function regulariser(chargesReelles: number) {
    await agir(proprietaire);
    const { rows } = await db.query<{ ecart: string }>(
      `select public.regulariser_charges_avec_justificatif($1,$2,$3,null,$4::uuid::text||'/decompte-'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text)::text as ecart`,
      [bail, annee, chargesReelles, org]);
    return Number(rows[0].ecart);
  }
  /** Échéancier proposé et transmis par le propriétaire, accepté par le locataire depuis son espace. Rend son identifiant et ses lignes. */
  async function echeancierAccepte(mensualites: number) {
    await agir(proprietaire);
    const reg = (await db.query("select id from public.regularisations_charges where bail_id=$1 and annee=$2", [bail, annee])).rows[0].id;
    const plan = (await db.query(
      "select public.preparer_echeancier_charges($1,$2,(public.aujourdhui_paris() + interval '1 month' + interval '1 day')::date) id", [reg, mensualites])).rows[0].id as string;
    await db.query("select public.publier_echeancier_charges($1,$2::uuid::text||'/echeancier-'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text)", [plan, org]);
    await agir(locataire);
    await db.query("select public.agir_echeancier_charges($1,'accepter')", [plan]);
    await db.query("reset role");
    const lignes = (await db.query<{ echeances: { rang: number; du_cents: number }[] }>("select echeances from public.echeanciers_charges where id=$1", [plan])).rows[0].echeances;
    return { plan, lignes };
  }
  /** Le propriétaire confirme avoir reçu, au total, `centimes` sur la mensualité `rang`. */
  async function recevoir(plan: string, rang: number, centimes: number) {
    await agir(proprietaire);
    await db.query("select public.agir_echeancier_charges($1,'confirmer',$2,$3,public.aujourdhui_paris())", [plan, rang, centimes]);
  }

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    proprietaire = await utilisateur();
    locataire = await utilisateur();
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST décompte et échéancier','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [proprietaire, org]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')", [locataire, org]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris',true) returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appartement','loue') returning id", [org, bien])).rows[0].id;
    const personne = (await db.query("insert into persons(organization_id,nom,prenom,account_id) values($1,'TEST Locataire','Awa',$2) returning id", [org, locataire])).rows[0].id;
    // Entré le 1er, treize mois plus tôt : 450 € de loyer, 50 € de provisions, tous les termes réglés.
    bail = (await db.query(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue)
      values($1,$2,$3,'nu','actif',(date_trunc('month', public.aujourdhui_paris()) - interval '13 months')::date,450,50,450,1,true) returning id`, [org, lot, personne])).rows[0].id;
    await db.query("select public.generer_appels_loyer_interne($1)", [bail]);
    await db.query(`insert into encaissements(organization_id,bail_id,montant,date_paiement,mode)
      select $1,$2,a.montant_du,a.date_echeance,'virement' from appels_loyer a where a.bail_id=$2`, [org, bail]);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("sans échéancier, puis avec un échéancier accepté dont rien n'a été reçu : le complément reste dû, comme avant", async () => {
    expect(await dette()).toEqual({ impayes: "0.00", trop_percu: "0.00" });
    const ecart = await regulariser(5000);
    expect(ecart).toBeLessThan(0);
    const complement = (-ecart).toFixed(2);
    expect(await dette()).toEqual({ impayes: complement, trop_percu: "0.00" });
    await echeancierAccepte(2);
    expect(await dette()).toEqual({ impayes: complement, trop_percu: "0.00" });
  });

  it("chaque mensualité reçue sort de la dette ; les deux reçues, il ne reste rien à retenir", async () => {
    const complementCents = Math.round(-(await regulariser(5000)) * 100);
    const { plan, lignes } = await echeancierAccepte(2);
    expect(lignes.map((l) => l.du_cents).reduce((a, b) => a + b, 0)).toBe(complementCents);

    await recevoir(plan, 1, lignes[0].du_cents);
    expect(await dette()).toEqual({ impayes: ((complementCents - lignes[0].du_cents) / 100).toFixed(2), trop_percu: "0.00" });

    await recevoir(plan, 2, lignes[1].du_cents);
    expect(await dette()).toEqual({ impayes: "0.00", trop_percu: "0.00" });
    // La recette reste écrite une seule fois par réception : la comptabilité n'est pas touchée par le correctif.
    const { rows } = await db.query("select count(*)::int n, sum(montant)::numeric(12,2)::text total from public.ecritures where bail_id=$1 and categorie='regularisation_charges'", [bail]);
    expect(rows[0]).toEqual({ n: 2, total: (complementCents / 100).toFixed(2) });
  });

  it("réception partielle d'une mensualité : seule la somme reçue sort de la dette", async () => {
    const complementCents = Math.round(-(await regulariser(5000)) * 100);
    const { plan, lignes } = await echeancierAccepte(1);
    expect(lignes).toHaveLength(1);
    await recevoir(plan, 1, 1000);
    expect(await dette()).toEqual({ impayes: ((complementCents - 1000) / 100).toFixed(2), trop_percu: "0.00" });
    // Le total reçu se confirme en une ou plusieurs fois : le second geste donne le total, pas un ajout.
    await recevoir(plan, 1, lignes[0].du_cents);
    expect(await dette()).toEqual({ impayes: "0.00", trop_percu: "0.00" });
  });

  it("le décompte de restitution démarré après réception complète ne retient rien du complément ; sans réception, il le retient", async () => {
    await regulariser(5000);
    const { plan, lignes } = await echeancierAccepte(1);
    await agir(proprietaire);
    const avant = (await db.query<{ impayes: string }>("select impayes::text from public.montants_restitution_a_jour($1)", [bail])).rows[0];
    expect(Number(avant.impayes)).toBe(lignes[0].du_cents / 100);

    await recevoir(plan, 1, lignes[0].du_cents);
    const apres = (await db.query<{ impayes: string; trop_percu: string }>("select impayes::text, trop_percu::text from public.montants_restitution_a_jour($1)", [bail])).rows[0];
    expect(apres).toEqual({ impayes: "0.00", trop_percu: "0.00" });

    const rst = (await db.query("select public.demarrer_restitution($1, public.aujourdhui_paris(), true) id", [bail])).rows[0].id;
    await db.query("reset role");
    const decompte = (await db.query<{ impayes: string }>("select impayes::numeric(12,2)::text impayes from public.restitutions where id=$1", [rst])).rows[0];
    expect(decompte.impayes).toBe("0.00");
  });

  it("un trop-perçu de régularisation revient toujours au locataire : rien n'en est retranché", async () => {
    const ecart = await regulariser(0);
    expect(ecart).toBeGreaterThan(0);
    expect(await dette()).toEqual({ impayes: "0.00", trop_percu: ecart.toFixed(2) });
  });

  it("migration rejouable sans effet ; retour à l'identique ; définition inattendue refusée", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const empreinte = async () => (await db.query("select md5(pg_get_functiondef('public.montants_reels_bail(uuid)'::regprocedure)) e")).rows[0].e as string;
    const droits = async () => (await db.query("select coalesce(proacl::text,'') d from pg_proc where oid='public.montants_reels_bail(uuid)'::regprocedure")).rows[0].d as string;

    const corrigee = await empreinte();
    const droitsAvant = await droits();
    await db.query(migration);
    expect(await empreinte()).toBe(corrigee);
    expect(await droits()).toBe(droitsAvant);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122110000','decompte_sortie_echeancier_charges') on conflict do nothing");
    await db.query(retour);
    const ancienne = await empreinte();
    expect(ancienne).not.toBe(corrigee);
    expect((await db.query("select position('echeanciers_charges' in pg_get_functiondef('public.montants_reels_bail(uuid)'::regprocedure)) p")).rows[0].p).toBe(0);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122110000'")).rows[0].n).toBe(0);
    await db.query(retour);
    expect(await empreinte()).toBe(ancienne);
    expect(await droits()).toBe(droitsAvant);

    // Sur la définition d'avant, le défaut est bien là : c'est lui que la migration corrige.
    const complementCents = Math.round(-(await regulariser(5000)) * 100);
    const { plan, lignes } = await echeancierAccepte(1);
    await recevoir(plan, 1, lignes[0].du_cents);
    expect(await dette()).toEqual({ impayes: (complementCents / 100).toFixed(2), trop_percu: "0.00" });

    await db.query(migration);
    expect(await empreinte()).toBe(corrigee);
    expect(await dette()).toEqual({ impayes: "0.00", trop_percu: "0.00" });

    // Une définition qui n'a plus la ligne attendue arrête la migration sans rien changer.
    await db.query(retour);
    await db.query("savepoint inattendue");
    await db.query(`do $$ declare d text; begin
      d := replace(pg_get_functiondef('public.montants_reels_bail(uuid)'::regprocedure), 'from public.encaissements where bail_id = p_bail), 0) as solde', 'from public.encaissements  where bail_id = p_bail), 0) as solde');
      execute d; end $$`);
    await expect(db.query(migration)).rejects.toThrow("P0-02 : définition inattendue de montants_reels_bail");
    await db.query("rollback to savepoint inattendue");
  });
});
