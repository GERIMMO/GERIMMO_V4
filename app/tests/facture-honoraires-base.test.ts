import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);

// La facture d'honoraires est le seul document du catalogue qui ÉMET : il
// consomme un numéro dans une séquence chronologique continue (art. L441-9 du
// code de commerce). Ce que ces épreuves vérifient n'est donc pas un gabarit
// mais une mécanique — continuité, unicité, idempotence, droits — que le
// rendu HTML ne peut pas garantir seul.
describe.skipIf(!url)('Facture d’honoraires : numérotation, droits et TVA', () => {
  let db: Client, admin: string, agent: string, etranger: string;
  let org: string, autreOrg: string, mandat: string, autreMandat: string;

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });

  beforeEach(async () => {
    await db.query('begin');
    const users = (await db.query("insert into auth.users(id,email) select gen_random_uuid(),gen_random_uuid()||'@test.local' from generate_series(1,3) returning id")).rows;
    [admin, agent, etranger] = users.map((x) => x.id);
    org = (await db.query("insert into public.organizations(name,status,type,siret) values('Agence recette','active','agence','12345678901234') returning id")).rows[0].id;
    autreOrg = (await db.query("insert into public.organizations(name,status,type) values('Autre agence','active','agence') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$3,'admin_agence'),($2,$3,'agent')", [admin, agent, org]);
    const mandant = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'Marchand','Claire') returning id", [org])).rows[0].id;
    mandat = (await db.query("insert into public.mandats(organization_id,person_id) values($1,$2) returning id", [org, mandant])).rows[0].id;
    const autreMandant = (await db.query("insert into public.persons(organization_id,nom) values($1,'Étranger') returning id", [autreOrg])).rows[0].id;
    autreMandat = (await db.query("insert into public.mandats(organization_id,person_id) values($1,$2) returning id", [autreOrg, autreMandant])).rows[0].id;
  });
  afterEach(async () => { await db.query('rollback'); });

  async function agir(id: string | null, role = 'authenticated') {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role, aal: 'aal2' })]);
    await db.query('set local role ' + role);
  }
  const emettre = (mandatId: string, periode: string, ttc: number, taux = 20, orgId = org) =>
    db.query('select * from public.emettre_facture_honoraires($1,$2,$3,$4,$5)', [orgId, mandatId, periode, ttc, taux]);
  // Une erreur avorte la transaction Postgres : sans point de reprise, le
  // deuxi\u00e8me refus attendu d'un m\u00eame test ne mesurerait plus que « current
  // transaction is aborted ».
  async function refus(sql: Promise<unknown>): Promise<string> {
    try { await sql; } catch (e) { await db.query('rollback to essai'); return (e as Error).message; }
    finally { await db.query('release savepoint essai').catch(() => {}); }
    throw new Error('la requ\u00eate aurait d\u00fb \u00eatre refus\u00e9e');
  }
  const essai = () => db.query('savepoint essai');

  it('attribue des numéros continus par organisation et par année', async () => {
    await agir(admin);
    const premiere = (await emettre(mandat, '2026-01-01', 480)).rows[0];
    expect(premiere.numero).toBe('FH-2026-0001');
    // Un second mandat de la même agence prend le rang suivant
    const autre = (await db.query("insert into public.persons(organization_id,nom) values($1,'Second') returning id", [org])).rows[0].id;
    const mandat2 = (await db.query('insert into public.mandats(organization_id,person_id) values($1,$2) returning id', [org, autre])).rows[0].id;
    expect((await emettre(mandat2, '2026-01-01', 120)).rows[0].numero).toBe('FH-2026-0002');
    // L'année ouvre une nouvelle séquence
    expect((await emettre(mandat, '2027-03-01', 90)).rows[0].numero).toBe('FH-2027-0001');
  });

  it('ne mélange pas les séquences de deux organisations', async () => {
    // L'insertion d'adhésion se fait hors session applicative : sous le rôle
    // « authenticated », la RLS de memberships la refuserait.
    await db.query('reset role');
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence')", [admin, autreOrg]);
    await agir(admin);
    await emettre(mandat, '2026-01-01', 480);
    expect((await emettre(autreMandat, '2026-01-01', 300, 20, autreOrg)).rows[0].numero).toBe('FH-2026-0001');
  });

  it('régénérer le même mois rend la même facture, sans consommer un numéro', async () => {
    await agir(admin);
    const premiere = (await emettre(mandat, '2026-05-01', 480)).rows[0];
    const rejeu = (await emettre(mandat, '2026-05-01', 999)).rows[0];
    expect(rejeu.id).toBe(premiere.id);
    expect(rejeu.numero).toBe(premiere.numero);
    // Le montant du rejeu est ignoré : une facture émise ne se réécrit pas
    expect(Number(rejeu.total_ttc)).toBe(480);
    expect((await db.query('select count(*) as n from public.factures_honoraires')).rows[0].n).toBe('1');
  });

  it('un jour quelconque du mois désigne le même mois facturé', async () => {
    await agir(admin);
    const premiere = (await emettre(mandat, '2026-05-01', 480)).rows[0];
    expect((await emettre(mandat, '2026-05-17', 480)).rows[0].id).toBe(premiere.id);
    // Une date SQL est un jour civil, pas un instant UTC. Lire la valeur
    // stockée évite que pg + le fuseau du poste la déplacent la veille.
    const periode = (await db.query('select periode::text as jour from public.factures_honoraires where id=$1', [premiere.id])).rows[0].jour;
    expect(periode).toBe('2026-05-01');
  });

  it('extrait la TVA du TTC sans perdre un centime', async () => {
    await agir(admin);
    // 100,00 TTC ne se divise pas rond par 1,2 : le HT est arrondi, la TVA
    // prend le reste — sinon la facture et le journal divergeraient d'un cent.
    const f = (await emettre(mandat, '2026-02-01', 100)).rows[0];
    expect(Number(f.total_ht)).toBe(83.33);
    expect(Number(f.tva)).toBe(16.67);
    expect(Number(f.total_ttc)).toBe(100);
    expect(Number(f.total_ht) + Number(f.tva)).toBeCloseTo(Number(f.total_ttc), 2);
  });

  it('en franchise de TVA, le hors taxes égale le toutes taxes', async () => {
    await agir(admin);
    const f = (await emettre(mandat, '2026-02-01', 240, 0)).rows[0];
    expect(Number(f.total_ht)).toBe(240);
    expect(Number(f.tva)).toBe(0);
    expect(Number(f.total_ttc)).toBe(240);
  });

  it.each([
    ['un agent', () => agent],
    ['un étranger à l’organisation', () => etranger],
  ])('refuse l’émission à %s', async (_libelle, qui) => {
    await agir(qui());
    await expect(emettre(mandat, '2026-01-01', 480)).rejects.toThrow(/responsable de l’agence/);
  });

  it('refuse un mandat qui n’appartient pas à l’organisation', async () => {
    await agir(admin);
    await expect(emettre(autreMandat, '2026-01-01', 480)).rejects.toThrow(/Mandat introuvable/);
  });

  it('refuse une facture sans honoraires ou à montant négatif', async () => {
    await agir(admin);
    for (const ttc of [0, -12]) {
      await essai();
      expect(await refus(emettre(mandat, '2026-01-01', ttc))).toMatch(/Aucun honoraire/);
    }
  });

  it('refuse un taux de TVA hors bornes', async () => {
    await agir(admin);
    await essai();
    expect(await refus(emettre(mandat, '2026-01-01', 480, 120))).toMatch(/hors bornes/);
  });

  it('n’est écrivable que par la fonction d’émission', async () => {
    await agir(admin);
    await emettre(mandat, '2026-01-01', 480);
    await essai();
    await refus(db.query(
      "insert into public.factures_honoraires(organization_id,mandat_id,periode,annee,rang,numero,total_ht,taux_tva,tva,total_ttc) values($1,$2,'2026-03-01',2026,99,'FH-2026-0099',100,20,20,120)",
      [org, mandat]
    ));
    // Ni réécriture ni suppression d'une facture émise : le droit n'est pas
    // accordé du tout, la demande est repoussée avant même la RLS.
    for (const sql of [
      'update public.factures_honoraires set total_ttc=1 returning id',
      'delete from public.factures_honoraires returning id',
    ]) {
      await essai();
      expect(await refus(db.query(sql))).toMatch(/permission denied/);
    }
  });

  it('ne montre les factures qu’au responsable de l’agence', async () => {
    await agir(admin);
    await emettre(mandat, '2026-01-01', 480);
    expect((await db.query('select id from public.factures_honoraires')).rows).toHaveLength(1);
    await agir(agent);
    expect((await db.query('select id from public.factures_honoraires')).rows).toHaveLength(0);
    await agir(etranger);
    expect((await db.query('select id from public.factures_honoraires')).rows).toHaveLength(0);
  });
});
