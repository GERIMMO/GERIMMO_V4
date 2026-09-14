import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)('Mentions du contrat en base', () => {
  let db: Client; let org: string; let lot: string;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query('begin');
    org = (await db.query("insert into public.organizations(name,status) values('Recette mentions','active') returning id")).rows[0].id;
    const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Recette','appartement','1 rue du Test','75001','Paris') returning id",[org])).rows[0].id;
    lot = (await db.query("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot recette') returning id",[org,bien])).rows[0].id;
  });
  afterEach(async () => { await db.query('rollback'); });
  async function bail(etat = 'brouillon') {
    return (await db.query("insert into public.baux(organization_id,lot_id,etat) values($1,$2,$3) returning id",[org,lot,etat])).rows[0].id;
  }
  it('conserve inconnus les choix jamais renseignés et accepte une fourchette cohérente', async () => {
    const id = await bail();
    await db.query("update public.baux set dpe_depenses_min=800,dpe_depenses_max=1200,date_conclusion_prevue='2026-10-01' where id=$1",[id]);
    const r = (await db.query('select encadrement_loyer,servitude_residence_principale,dpe_depenses_min from public.baux where id=$1',[id])).rows[0];
    expect(r.encadrement_loyer).toBeNull(); expect(r.servitude_residence_principale).toBeNull(); expect(Number(r.dpe_depenses_min)).toBe(800);
  });
  it.each([
    'dpe_depenses_min=1200,dpe_depenses_max=800',
    'honoraires_edl_locataire=-1',
    "zone_honoraires='imaginaire'",
    'clause_resolutoire_servitude=true,servitude_residence_principale=false',
  ])('refuse une valeur incohérente par appel direct : %s', async affectations => {
    const id = await bail();
    await expect(db.query(`update public.baux set ${affectations} where id=$1`,[id])).rejects.toThrow(/constraint/);
  });
  it('protège les mentions d’un ancien bail sans bloquer une mise à jour sans changement', async () => {
    const id = await bail('termine');
    await db.query('update public.baux set dpe_depenses_min=dpe_depenses_min where id=$1',[id]);
    await expect(db.query('update public.baux set dpe_depenses_min=900 where id=$1',[id])).rejects.toThrow(/figées/);
  });
});
