import { Client } from "pg";
import { expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { creerPremierBienFictif, preparerEssaiExpireSansBien } from "./fixtures/reprise-premier-bien";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

it.skipIf(!url)("rouvre une seule fois l’essai expiré du titulaire sans bien, avec une trace", async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("begin");
    const { compte, org, autre, commeTitulaire } = await preparerEssaiExpireSansBien(db);
    const fin = (await db.query("select (public.aujourdhui_paris()+6)::text as fin")).rows[0].fin;
    await commeTitulaire();
    const admissible = async (id: string) => (await db.query("select public.reprise_premier_bien_possible($1) as possible", [id])).rows[0].possible;
    const rouvrir = async (id: string) => (await db.query("select public.rouvrir_essai_premier_bien($1)::text as fin", [id])).rows[0].fin;
    const ouvert = async () => (await db.query("select ecriture_ouverte as ouvert from public.etat_abonnement($1)", [org])).rows[0].ouvert;
    expect(await ouvert()).toBe(false);
    expect(await admissible(autre)).toBe(false);
    expect(await rouvrir(autre)).toBeNull();
    expect(await admissible(org)).toBe(true);
    expect(await rouvrir(org)).toBe(fin);
    expect(await ouvert()).toBe(true);
    expect(await rouvrir(org)).toBeNull();

    await db.query("savepoint modification_directe");
    await expect(db.query("update public.organizations set essai_fin=current_date+30 where id=$1", [org]))
      .rejects.toThrow(/seul le super admin|permission denied/i);
    await db.query("rollback to savepoint modification_directe");

    await db.query("savepoint ajout");
    const creation = await creerPremierBienFictif(db, org);
    expect(creation).toMatchObject({ bien_id: expect.any(String), lot_unique_id: expect.any(String) });
    expect((await db.query("select unites_a_couvrir from public.etat_abonnement($1)", [org])).rows[0].unites_a_couvrir).toBe(1);
    await db.query("rollback to savepoint ajout");

    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','{}',true)");
    await db.query("select set_config('gerimmo.systeme','on',true)");
    const trace = await db.query("select account_id, details from public.audit_log where organization_id=$1 and action='reprise_essai_premier_bien'", [org]);
    expect(trace.rows).toEqual([{ account_id: compte, details: { jours: 7, essai_fin: fin } }]);
    await db.query("update public.organizations set essai_fin=public.aujourdhui_paris()-1 where id=$1", [org]);
    await db.query("select set_config('gerimmo.systeme','off',true)");
    await commeTitulaire();
    expect(await ouvert()).toBe(false);
    expect(await admissible(org)).toBe(false);
    expect(await rouvrir(org)).toBeNull();
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
