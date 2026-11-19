import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)('Inscription : société titulaire et représentant distincts', () => {
  const db = new Client({ connectionString: url });
  beforeAll(async () => { await db.connect(); });
  beforeEach(async () => { await db.query('begin'); });
  afterEach(async () => { await db.query('rollback'); });
  afterAll(async () => { await db.end(); });
  async function inscription(qualite: string, raison_sociale?: string, prenom = 'Camille') {
    const uid = randomUUID();
    // Fixture de test SQL uniquement : ce n'est pas une preuve du parcours e-mail.
    await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values($1,$2,now(),$3)`, [uid, uid+'@example.invalid', JSON.stringify({nom:'Martin',prenom,qualite,raison_sociale,adresse:'1 rue Fictive',code_postal:'75001',ville:'Paris'})]);
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)",[uid]);
    await db.query('set local role authenticated');
    return uid;
  }
  async function ouvrir() {
    return (await db.query('select public.initialiser_espace_proprietaire() id')).rows[0].id;
  }
  it('conserve le particulier comme seul titulaire et deux mois calendaires', async () => {
    const uid=await inscription('Personne physique');const org=await ouvrir();
    expect((await db.query('select nom,qualite,account_id from persons where organization_id=$1',[org])).rows).toEqual([{nom:'Martin',qualite:'Personne physique',account_id:uid}]);
    expect((await db.query('select essai_fin=public.essai_ordinaire_fin() correct from organizations where id=$1',[org])).rows[0].correct).toBe(true);
    expect(await ouvrir()).toBe(org);
  });
  it('le particulier conserve une activation possible sans prénom', async () => {
    const uid = await inscription('Personne physique', undefined, '');
    const org = await ouvrir();
    expect((await db.query('select prenom,account_id from persons where organization_id=$1',[org])).rows)
      .toEqual([{prenom:null,account_id:uid}]);
  });
  it.each(['SCI','SCI familiale','Personne morale'])('%s : société, gérant disponible, bien attribué à la société, aucun pouvoir inventé',async qualite=>{
    const uid=await inscription(qualite,'SCI du Tilleul');const org=await ouvrir();
    const personnes=(await db.query('select id,nom,qualite,account_id from persons where organization_id=$1 order by nom',[org])).rows;
    expect(personnes).toHaveLength(2);
    const gerant=personnes.find(p=>p.nom==='Martin'),societe=personnes.find(p=>p.nom==='SCI du Tilleul');
    expect(gerant).toMatchObject({qualite:'Personne physique',account_id:null});
    expect(societe).toMatchObject({qualite,account_id:uid});
    expect((await db.query('select name from organizations where id=$1',[org])).rows[0].name).toBe('SCI du Tilleul');
    const saisie={nom:'Appartement fictif',type:'appartement',address_line1:'1 rue Fictive',postal_code:'75001',city:'Paris',annee_construction:2000,copropriete:false,parties_communes:'Néant',acces_tic:'Fibre',lots:[{nom:'Appartement',surface_m2:40,pieces:2}]};
    await db.query('select public.creer_bien_verifie($1,$2,$3,null)',[org,randomUUID(),JSON.stringify(saisie)]);
    expect((await db.query('select person_id,quote_part::int from detentions where organization_id=$1',[org])).rows).toEqual([{person_id:societe.id,quote_part:100}]);
    expect((await db.query('select count(*)::int n from representations_bail where societe_id=$1',[societe.id])).rows[0].n).toBe(0);
    expect(await ouvrir()).toBe(org);
    expect((await db.query('select count(*)::int n from persons where organization_id=$1',[org])).rows[0].n).toBe(2);
  });
  it('refuse une société sans raison sociale, sans créer un patrimoine attribué au gérant',async()=>{
    await inscription('SCI');await expect(ouvrir()).rejects.toThrow(/nom de votre société/);
  });
  it.each(['', '  ', 'C'.repeat(101)])('refuse d’ouvrir une société avec un prénom manquant ou invalide',async prenom=>{
    const uid = await inscription('SCI','SCI du Tilleul',prenom);
    await db.query('savepoint ouverture');
    await expect(ouvrir()).rejects.toThrow(/Indiquez votre prénom/);
    await db.query('rollback to savepoint ouverture');
    expect((await db.query('select organization_id from memberships where account_id=$1',[uid])).rows).toEqual([]);
  });
  it('ne modifie aucune identité d’un espace déjà ouvert lorsque les métadonnées changent',async()=>{
    const uid=await inscription('Personne physique');const org=await ouvrir();
    await db.query('reset role');
    await db.query(`update auth.users set raw_user_meta_data=raw_user_meta_data||'{"qualite":"SCI","raison_sociale":"Autre SCI"}'::jsonb where id=$1`,[uid]);
    await db.query('set local role authenticated');expect(await ouvrir()).toBe(org);
    expect((await db.query('select nom,qualite from persons where organization_id=$1',[org])).rows).toEqual([{nom:'Martin',qualite:'Personne physique'}]);
  });
});
