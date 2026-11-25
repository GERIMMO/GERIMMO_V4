/**
 * UNE NATURE « RÉCUPÉRABLE » PROPOSÉE PAR LA MACHINE DOIT ÊTRE CONFIRMÉE AVANT LA VALIDATION — audit palier 1 du
 * 22/11/2026, P0-03 (relevé C1), côté base.
 *
 * Le défaut : `valider_ventilation` ne retenait que les postes « à qualifier ». Un poste deviné « récupérable » d'après
 * son intitulé (`propose = true`) passait sans confirmation et entrait dans la régularisation du locataire.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. un appel dont un poste est « récupérable » par proposition est refusé, et dit pourquoi ; confirmer ce poste
 *     (le geste « Qualifier » pose `propose = false`) ou le corriger lève le refus ;
 *  2. une proposition « non récupérable » non confirmée ne bloque pas (elle ne met rien à la charge du locataire) ;
 *  3. les contrôles d'avant restent : poste « à qualifier », total inexact, appel figé, compte étranger, visiteur ;
 *  4. la migration se rejoue sans effet ; son retour rend le corps exact de la migration d'origine, sans toucher aux
 *     postes ni aux appels.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122230000_charges_proposees_a_confirmer";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("charges proposées à confirmer — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/charges-proposees-a-confirmer-base.test.ts"');
  });

  it("la migration ne modifie aucune donnée, ne lit pas le jour de la session et n'ouvre rien aux visiteurs", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\.appel_charges_postes/i);
    expect(sql).not.toMatch(/current_date|aujourdhui_paris/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toContain("poser_gardes_abonnement");
    expect(sql).toContain("revoke execute on function public.valider_ventilation(uuid) from public, anon;");
  });
});

describe.skipIf(!url)("validation d'un appel de charges : les propositions « récupérable » se confirment (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", etranger = "", lot = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  async function compte() {
    return id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const appel = (total: number) => id("insert into public.appels_charges(organization_id,lot_id,exercice,total) values($1,$2,2025,$3) returning id", [org, lot, total]);
  const poste = (a: string, libelle: string, montant: number, nature: string, propose: boolean) =>
    id("insert into public.appel_charges_postes(organization_id,appel_id,libelle,montant,nature,propose) values($1,$2,$3,$4,$5,$6) returning id", [org, a, libelle, montant, nature, propose]);
  const valider = (a: string) => refus("select public.valider_ventilation($1)", [a]);
  const statut = async (a: string) => { await base(); const s = (await db.query("select statut from public.appels_charges where id=$1", [a])).rows[0].statut as string; await agir(gerant); return s; };

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai charges fictif','proprietaire_direct','active') returning id");
    const autre = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    gerant = await compte(); etranger = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [gerant, org, etranger, autre]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Copropriété fictive','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id", [org, bien]);
    await agir(gerant);
  });

  it("un poste « récupérable » par proposition bloque la validation ; le confirmer la débloque", async () => {
    const a = await appel(1000);
    const devine = await poste(a, "Travaux ascenseur", 600, "recuperable", true);
    await poste(a, "Honoraires du syndic", 400, "non_recuperable", false);
    expect(await valider(a)).toMatch(/1 poste\(s\) proposé\(s\) « récupérable » attendent votre confirmation/);
    expect(await statut(a)).toBe("brouillon");
    // Tant que l'appel n'est pas validé, rien n'est récupérable pour l'exercice.
    expect(Number((await db.query("select public.charges_recuperables_exercice($1,2025) r", [lot])).rows[0].r)).toBe(0);

    // Le geste « Qualifier » : la nature choisie est enregistrée et la proposition est levée.
    await db.query("update public.appel_charges_postes set nature='non_recuperable', propose=false where id=$1", [devine]);
    expect(await valider(a)).toBe("");
    expect(await statut(a)).toBe("ventile");
    expect(Number((await db.query("select public.charges_recuperables_exercice($1,2025) r", [lot])).rows[0].r)).toBe(0);
  });

  it("confirmé « récupérable » par le gestionnaire : la validation passe et la part récupérable est comptée", async () => {
    const a = await appel(1000);
    const p = await poste(a, "Ascenseur — entretien", 700, "recuperable", true);
    await poste(a, "Honoraires du syndic", 300, "non_recuperable", false);
    expect(await valider(a)).toMatch(/attendent votre confirmation/);
    await db.query("update public.appel_charges_postes set propose=false where id=$1", [p]);
    expect(await valider(a)).toBe("");
    expect(Number((await db.query("select public.charges_recuperables_exercice($1,2025) r", [lot])).rows[0].r)).toBe(700);
  });

  it("le message compte les postes en attente ; une proposition « non récupérable » ne bloque pas", async () => {
    const a = await appel(900);
    await poste(a, "Ascenseur", 300, "recuperable", true);
    await poste(a, "Eau froide", 300, "recuperable", true);
    await poste(a, "Assurance immeuble", 300, "non_recuperable", true);
    expect(await valider(a)).toMatch(/^2 poste\(s\) proposé\(s\) « récupérable »/);
    await db.query("update public.appel_charges_postes set propose=false where appel_id=$1 and nature='recuperable'", [a]);
    // Reste la proposition « non récupérable », jamais confirmée : elle ne met rien à la charge du locataire.
    expect(await valider(a)).toBe("");
    expect(await statut(a)).toBe("ventile");
  });

  it("les contrôles d'avant restent, dans leur ordre : à qualifier, total, appel figé, droits", async () => {
    const a = await appel(1000);
    await poste(a, "Poste mystère", 400, "a_qualifier", true);
    await poste(a, "Ascenseur", 500, "recuperable", true);
    // Le poste « à qualifier » est dit en premier.
    expect(await valider(a)).toMatch(/1 poste\(s\) restent à qualifier/);
    await db.query("update public.appel_charges_postes set nature='non_recuperable', propose=false where appel_id=$1 and libelle='Poste mystère'", [a]);
    expect(await valider(a)).toMatch(/attendent votre confirmation/);
    await db.query("update public.appel_charges_postes set propose=false where appel_id=$1", [a]);
    expect(await valider(a)).toMatch(/différent du total/);
    await db.query("update public.appel_charges_postes set montant=600 where appel_id=$1 and libelle='Ascenseur'", [a]);
    expect(await valider(a)).toBe("");

    await agir(etranger);
    expect(await refus("select public.valider_ventilation($1)", [a])).toMatch(/Accès refusé|Appel introuvable/);
    await agir(null, "anon");
    expect(await refus("select public.valider_ventilation($1)", [a])).toMatch(/permission denied|droit refusé/i);
    await base();
    await db.query("update public.appels_charges set statut='fige' where id=$1", [a]);
    await agir(gerant);
    expect(await valider(a)).toMatch(/Appel figé/);
  });

  it("rejeu sans effet ; le retour rend le corps de la migration d'origine sans toucher aux données ; la migration se rejoue", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const corps = async () => (await db.query("select prosrc, prosecdef, proconfig from pg_proc where oid = 'public.valider_ventilation(uuid)'::regprocedure")).rows[0];
    const droits = async () => (await db.query("select has_function_privilege('anon','public.valider_ventilation(uuid)','execute') anon, has_function_privilege('authenticated','public.valider_ventilation(uuid)','execute') connecte")).rows[0];

    const a = await appel(500);
    const p = await poste(a, "Ascenseur", 500, "recuperable", true);
    await base();
    const migre = await corps();
    expect(migre.prosrc).toContain("attendent votre confirmation");
    await db.query(migration);
    expect(await corps()).toEqual(migre);
    expect(await droits()).toEqual({ anon: false, connecte: true });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122230000','charges_proposees_a_confirmer') on conflict do nothing");
    await db.query(retour);
    const origine = /create function public\.valider_ventilation\(p_appel uuid\)\nreturns void language plpgsql security definer set search_path = '' as \$\$([\s\S]*?)\$\$;/.exec(readFileSync("supabase/migrations/20260801_s8_copropriete_appels_charges.sql", "utf8"))?.[1];
    expect(origine, "corps d'origine introuvable").toBeTruthy();
    expect(await corps()).toEqual({ prosrc: origine, prosecdef: true, proconfig: ['search_path=""'] });
    expect(await droits()).toEqual({ anon: false, connecte: true });
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122230000'")).rows[0].n).toBe(0);
    // Les données n'ont pas bougé : le poste est toujours « récupérable » par proposition, l'appel toujours brouillon.
    expect((await db.query("select nature, propose from public.appel_charges_postes where id=$1", [p])).rows[0]).toEqual({ nature: "recuperable", propose: true });
    // Après le retour, la validation laisse de nouveau passer la proposition non confirmée (c'est ce que dit le retour).
    await agir(gerant);
    await db.query("savepoint essai");
    expect(await valider(a)).toBe("");
    await db.query("rollback to savepoint essai");

    await base();
    await db.query(retour);
    await db.query(migration);
    expect(await corps()).toEqual(migre);
    await agir(gerant);
    expect(await valider(a)).toMatch(/attendent votre confirmation/);
  });
});
