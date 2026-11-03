import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("plan d'apurement : dette gelée, tranches, suspension des relances", () => {
  let db: Client;
  let org: string, bien: string, lot: string, gerant: string, locataire: string, locataireCompte: string, bailId: string;
  const un = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as Record<string, string>;
  async function compte(email: string) {
    const r = await un(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',$1||'-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','') returning id,email`, [email]);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [r.id, r.email]);
    return r.id;
  }
  async function postgres() { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); }
  async function session(c: string) {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)`, [c]);
    await db.query("set local role authenticated");
  }
  async function echoue(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint essai");
    try { await expect(db.query(sql, params)).rejects.toThrow(motif); } finally { await db.query("rollback to savepoint essai"); }
  }
  async function appel(periode: string, montant = 650) {
    await postgres();
    await db.query(`insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance) values ($1,$2,$3,$4,0,$4,$3)`, [org, bailId, periode, montant]);
  }
  async function encaisser(montant: number) {
    await postgres();
    await db.query(`insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,$3,public.aujourdhui_paris())`, [org, bailId, montant]);
  }
  const dette = async () => Number((await un("select public.dette_echue_bail($1) d", [bailId])).d);
  const plan = async (id: string) => un("select p.*, (select jsonb_agg(t.statut order by t.rang) from public.plan_apurement_tranches t where t.plan_id=p.id) statuts from public.plans_apurement p where p.id=$1", [id]);
  const relancesDues = async () => (await db.query("select bail_id from public.relances_loyer_dues(50) where bail_id=$1", [bailId])).rows.length;

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    org = (await un(`insert into public.organizations (name, status, type, relances_envoi_auto, relance_1_jours, relance_2_jours) values ('TEST plan apurement','active','agence',true,1,15) returning id`)).id;
    gerant = await compte("gerant"); locataireCompte = await compte("locataire");
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$3,'admin_agence'),($2,$3,'locataire')`, [gerant, locataireCompte, org]);
    bien = (await un(`insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1,'TEST immeuble','immeuble'::public.bien_type,'1 rue A','91360','Epinay-sur-Orge') returning id`, [org])).id;
    lot = (await un(`insert into public.lots (organization_id, bien_id, nom, etat, surface_m2) values ($1,$2,'TEST lot','loue',50) returning id`, [org, bien])).id;
    locataire = (await un(`insert into public.persons (organization_id, nom, prenom, email, account_id) values ($1,'Locataire','Test','locataire-plan@test.local',$2) returning id`, [org, locataireCompte])).id;
    bailId = (await un(`insert into public.baux (organization_id, lot_id, type, etat, date_debut, loyer_hc, charges, charges_mode, jour_echeance, locataire_principal) values ($1,$2,'nu','actif','2025-01-01',650,0,'provision',5,$3) returning id`, [org, lot, locataire])).id;
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await postgres(); });

  it("refuse un plan sans dette, puis fige la dette échue en tranches égales", async () => {
    await session(gerant);
    await echoue(/Aucune dette échue/, "select public.proposer_plan_apurement($1,$2,4,public.aujourdhui_paris())", [org, bailId]);
    await appel("2026-08-05"); await appel("2026-09-05");
    expect(await dette()).toBe(1300);
    await session(gerant);
    await echoue(/acompte couvre/i, "select public.proposer_plan_apurement($1,$2,4,public.aujourdhui_paris(),1300)", [org, bailId]);
    const { id } = await un("select public.proposer_plan_apurement($1,$2,4,public.aujourdhui_paris(),100,'Suivi mensuel') id", [org, bailId]);
    const p = await plan(id);
    expect(p.etat).toBe("propose");
    expect(Number(p.dette_initiale)).toBe(1300);
    expect(Number(p.mensualite)).toBe(300);
    expect(p.statuts).toEqual(["a_venir", "a_venir", "a_venir", "a_venir"]);
    const tranches = (await db.query("select echeance::text, montant from public.plan_apurement_tranches where plan_id=$1 order by rang", [id])).rows;
    expect(tranches.map((t) => Number(t.montant))).toEqual([300, 300, 300, 300]);
    expect(tranches[1].echeance > tranches[0].echeance).toBe(true);
    await echoue(/déjà en cours/, "select public.proposer_plan_apurement($1,$2,2,public.aujourdhui_paris())", [org, bailId]);
  });

  it("suspend les relances automatiques pendant le plan vivant, les reprend après annulation", async () => {
    await appel("2026-08-05");
    await postgres();
    expect(await relancesDues()).toBe(1);
    await session(gerant);
    const { id } = await un("select public.proposer_plan_apurement($1,$2,3,public.aujourdhui_paris()) id", [org, bailId]);
    await postgres();
    expect(await relancesDues()).toBe(1);
    await session(gerant);
    expect((await un("select public.activer_plan_apurement($1,$2,public.aujourdhui_paris()) e", [org, id])).e).toBe("actif");
    await postgres();
    expect(await relancesDues()).toBe(0);
    expect((await un("select public.plan_apurement_suspend_relances($1) s", [bailId])).s).toBe(true);
    await session(gerant);
    await db.query("select public.annuler_plan_apurement($1,$2,'Le locataire a réglé par ailleurs')", [org, id]);
    await postgres();
    expect((await plan(id)).etat).toBe("annule");
    expect(await relancesDues()).toBe(1);
  });

  it("constate les tranches sur la dette totale : honorée à l'encaissement, manquée après tolérance, caduc au seuil", async () => {
    await appel("2026-08-05"); await appel("2026-09-05");
    await session(gerant);
    const { id } = await un("select public.proposer_plan_apurement($1,$2,4,public.aujourdhui_paris(),0,null,5,2) id", [org, bailId]);
    await db.query("select public.activer_plan_apurement($1,$2,public.aujourdhui_paris())", [org, id]);
    expect((await plan(id)).statuts).toEqual(["a_venir", "a_venir", "a_venir", "a_venir"]);
    await encaisser(325);
    expect((await plan(id)).statuts).toEqual(["honoree", "a_venir", "a_venir", "a_venir"]);
    expect((await plan(id)).etat).toBe("actif");
    // Le temps passe : la deuxième tranche est échue depuis plus de cinq jours sans règlement.
    await postgres();
    await db.query("update public.plan_apurement_tranches set echeance=public.aujourdhui_paris()-10 where plan_id=$1 and rang=2", [id]);
    await db.query("select public.suivre_plan_apurement($1)", [id]);
    let p = await plan(id);
    expect(p.etat).toBe("en_defaut");
    expect(p.statuts).toEqual(["honoree", "manquee", "a_venir", "a_venir"]);
    expect((await db.query("select 1 from public.alerts where organization_id=$1 and type='plan_apurement_defaut' and statut='ouverte' and origine_id=$2", [org, id])).rows.length).toBe(1);
    expect(await relancesDues()).toBe(0);
    // Le locataire rattrape : la tranche manquée devient honorée en retard, le plan redevient actif, l'alerte se ferme.
    await encaisser(325);
    p = await plan(id);
    expect(p.etat).toBe("actif");
    expect(p.statuts).toEqual(["honoree", "honoree", "a_venir", "a_venir"]);
    expect((await un("select en_retard from public.plan_apurement_tranches where plan_id=$1 and rang=2", [id])).en_retard).toBe(true);
    expect((await db.query("select 1 from public.alerts where organization_id=$1 and type='plan_apurement_defaut' and statut='ouverte'", [org])).rows.length).toBe(0);
    // Deux tranches manquées : caducité, relances de retour.
    await postgres();
    await db.query("update public.plan_apurement_tranches set echeance=public.aujourdhui_paris()-10 where plan_id=$1 and rang in (3,4)", [id]);
    await db.query("select public.suivre_plan_apurement($1)", [id]);
    p = await plan(id);
    expect(p.etat).toBe("caduc");
    expect(p.statuts).toEqual(["honoree", "honoree", "manquee", "manquee"]);
    expect((await db.query("select 1 from public.alerts where organization_id=$1 and type='plan_apurement_caduc' and statut='ouverte'", [org])).rows.length).toBe(1);
    expect(await relancesDues()).toBe(1);
  });

  it("solde le plan quand la dette échue tombe à zéro, même par anticipation", async () => {
    await appel("2026-08-05");
    await session(gerant);
    const { id } = await un("select public.proposer_plan_apurement($1,$2,3,public.aujourdhui_paris()) id", [org, bailId]);
    await db.query("select public.activer_plan_apurement($1,$2,public.aujourdhui_paris())", [org, id]);
    await encaisser(650);
    const p = await plan(id);
    expect(p.etat).toBe("solde");
    expect(p.statuts).toEqual(["honoree", "honoree", "honoree"]);
    expect((await db.query("select 1 from public.alerts where organization_id=$1 and type='plan_apurement_solde'", [org])).rows.length).toBe(1);
  });

  it("la tâche quotidienne suit les plans vivants et respecte l'arrêt d'urgence", async () => {
    await appel("2026-08-05");
    await session(gerant);
    const { id } = await un("select public.proposer_plan_apurement($1,$2,2,public.aujourdhui_paris()) id", [org, bailId]);
    await db.query("select public.activer_plan_apurement($1,$2,public.aujourdhui_paris())", [org, id]);
    await postgres();
    await db.query("update public.plan_apurement_tranches set echeance=public.aujourdhui_paris()-10 where plan_id=$1 and rang=1", [id]);
    expect(Number((await un("select public.suivre_plans_apurement_interne() n")).n)).toBeGreaterThanOrEqual(1);
    expect((await plan(id)).etat).toBe("en_defaut");
    expect((await db.query("select 1 from cron.job where jobname='plans-apurement-quotidiens'")).rows.length).toBe(1);
    expect((await db.query("select 1 from public.supervision_taches_arret where tache='plans-apurement-quotidiens' and cle='relances'")).rows.length).toBe(1);
  });

  it("le locataire demande un plan, voit le sien, et seulement le sien", async () => {
    await appel("2026-08-05");
    await session(locataireCompte);
    await echoue(/Accès refusé|42501/, "select public.proposer_plan_apurement($1,$2,3,public.aujourdhui_paris())", [org, bailId]);
    const { m } = await un("select public.demander_plan_apurement($1,'Je peux régler en trois fois.') m", [org]);
    expect(m).toBeTruthy();
    expect((await un("select public.ma_demande_plan_apurement($1) d", [org])).d).toBe(true);
    await postgres();
    expect((await db.query("select 1 from public.alerts where organization_id=$1 and type='plan_apurement_demande' and statut='ouverte'", [org])).rows.length).toBe(1);
    expect((await un("select texte from public.messages where id=$1", [m])).texte).toMatch(/Demande de plan d'apurement \(dette échue : 650\.00 €\)/);
    await session(gerant);
    const { id } = await un("select public.proposer_plan_apurement($1,$2,3,public.aujourdhui_paris()) id", [org, bailId]);
    await db.query("select public.activer_plan_apurement($1,$2,public.aujourdhui_paris())", [org, id]);
    await postgres();
    expect((await db.query("select 1 from public.alerts where organization_id=$1 and type='plan_apurement_demande' and statut='ouverte'", [org])).rows.length).toBe(0);
    await session(locataireCompte);
    const mien = (await db.query("select * from public.mon_plan_apurement($1)", [org])).rows;
    expect(mien.length).toBe(1);
    expect(mien[0].etat).toBe("actif");
    expect(Number(mien[0].dette_restante)).toBe(650);
    expect(mien[0].tranches.length).toBe(3);
    await echoue(/déjà proposé ou en cours/, "select public.demander_plan_apurement($1,'encore')", [org]);
    await postgres();
    const autre = await compte("autre");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,$2,'locataire')", [autre, org]);
    await db.query("insert into public.persons (organization_id, nom, account_id) values ($1,'Autre',$2)", [org, autre]);
    await session(autre);
    expect((await db.query("select * from public.mon_plan_apurement($1)", [org])).rows.length).toBe(0);
    expect((await db.query("select id from public.plans_apurement where id=$1", [id])).rows.length).toBe(0);
  });
});
