/**
 * SCI-2 (audit après publication de la PR #347, 19/11/2026) — en base : migrations 20261119200000 (index par nature)
 * et 20261119200100 (fiche de la société à la création, recopie du profil).
 *
 *  — à l'ouverture de l'espace d'une société, sa fiche titulaire reçoit l'e-mail du compte, partagé avec la fiche de la
 *    personne qui la gère, et les coordonnées des métadonnées d'inscription ;
 *  — un particulier garde sa fiche unique, inchangée ;
 *  — `completer_fiche_societe_depuis_profil` recopie l'adresse, le téléphone et l'e-mail du profil dans les seuls champs
 *    vides de la fiche titulaire de la société, sans jamais écraser une saisie ni mêler deux adresses ;
 *  — l'index : une société peut partager l'adresse d'une personne physique ; deux personnes physiques, ou deux sociétés,
 *    jamais.
 *
 * Transaction annulée après chaque test. Nécessite SUPABASE_DB_URL (base de test locale), sinon ignoré.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)('SCI-2 : coordonnées de la fiche titulaire de la société', () => {
  const db = new Client({ connectionString: url });
  beforeAll(async () => { await db.connect(); });
  beforeEach(async () => { await db.query('begin'); });
  afterEach(async () => { await db.query('rollback'); });
  afterAll(async () => { await db.end(); });

  async function agir(uid: string | null) {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [uid]);
    await db.query('set local role authenticated');
  }
  async function enTantQuePostgres() { await db.query('reset role'); }
  async function refus(sql: string, params: unknown[] = []): Promise<string> {
    await db.query('savepoint essai');
    try { await db.query(sql, params); await db.query('release savepoint essai'); return ''; }
    catch (e) { await db.query('rollback to savepoint essai'); return (e as Error).message; }
  }

  // Fixture SQL uniquement : ce n'est pas une preuve du parcours e-mail.
  async function inscription(meta: Record<string, string>) {
    const uid = randomUUID();
    await enTantQuePostgres();
    await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)`,
      [uid, `${uid}@example.invalid`, JSON.stringify({ nom: 'Martin', ...meta })]);
    await agir(uid);
    return uid;
  }
  async function ouvrir(): Promise<string> {
    return (await db.query('select public.initialiser_espace_proprietaire() id')).rows[0].id;
  }
  const SCI = { prenom: 'Camille', qualite: 'SCI', raison_sociale: 'SCI du Tilleul' };
  const fiches = async (org: string) => (await db.query(
    `select nom, prenom, email, telephone, address_line1, postal_code, city, qualite, account_id
       from public.persons where organization_id=$1 order by qualite, nom`, [org])).rows;
  const societe = async (org: string) => (await fiches(org)).find((p) => p.qualite !== 'Personne physique');
  async function profil(org: string, uid: string, valeurs: Record<string, string | null>) {
    await enTantQuePostgres();
    await db.query(`update public.organizations set address_line1=$2, postal_code=$3, city=$4, telephone=$5, email_contact=$6 where id=$1`,
      [org, valeurs.address_line1, valeurs.postal_code, valeurs.city, valeurs.telephone, valeurs.email_contact]);
    await agir(uid);
  }
  const completer = async (org: string): Promise<number> =>
    (await db.query('select public.completer_fiche_societe_depuis_profil($1) n', [org])).rows[0].n;
  const PROFIL = { address_line1: '5 rue des Lilas', postal_code: '69003', city: 'Lyon', telephone: '0400000000', email_contact: 'contact@tilleul.example.invalid' };

  it.each(['SCI', 'SCI familiale', 'Personne morale'])('%s : la fiche de la société naît avec l’e-mail du compte et les coordonnées saisies, partagés avec la fiche du gérant', async (qualite) => {
    const uid = await inscription({ ...SCI, qualite, telephone: '0600000000', adresse: '1 rue Fictive', code_postal: '75001', ville: 'Paris' });
    const org = await ouvrir();
    const email = `${uid}@example.invalid`;
    expect(await fiches(org)).toEqual(expect.arrayContaining([
      { nom: 'SCI du Tilleul', prenom: null, email, telephone: '0600000000', address_line1: '1 rue Fictive', postal_code: '75001', city: 'Paris', qualite, account_id: uid },
      expect.objectContaining({ nom: 'Martin', prenom: 'Camille', email, qualite: 'Personne physique', account_id: null }),
    ]));
    expect(await fiches(org)).toHaveLength(2);
    // Idempotente : un second appel rend le même espace, sans nouvelle fiche.
    expect(await ouvrir()).toBe(org);
    expect(await fiches(org)).toHaveLength(2);
  });

  it('particulier : une seule fiche, avec l’e-mail du compte, comme avant', async () => {
    const uid = await inscription({ prenom: 'Paul', qualite: 'Personne physique' });
    const org = await ouvrir();
    expect(await fiches(org)).toEqual([expect.objectContaining({ nom: 'Martin', prenom: 'Paul', email: `${uid}@example.invalid`, qualite: 'Personne physique', account_id: uid })]);
    // Rien à compléter pour un particulier.
    await profil(org, uid, PROFIL);
    expect(await completer(org)).toBe(0);
    expect((await fiches(org))[0]).toMatchObject({ address_line1: null, telephone: null });
  });

  it('le profil complète les champs vides de la fiche de la société, sans écraser la saisie', async () => {
    const uid = await inscription(SCI);
    const org = await ouvrir();
    await enTantQuePostgres();
    await db.query(`update public.persons set telephone='0711111111' where organization_id=$1 and account_id=$2`, [org, uid]);
    await profil(org, uid, PROFIL);
    expect(await completer(org)).toBe(1);
    expect(await societe(org)).toMatchObject({
      address_line1: '5 rue des Lilas', postal_code: '69003', city: 'Lyon',
      telephone: '0711111111', // saisi sur la fiche : gardé
      email: `${uid}@example.invalid`, // déjà là depuis la création : gardé
    });
    // La fiche du gérant n'est pas touchée.
    expect((await fiches(org)).find((p) => p.qualite === 'Personne physique')).toMatchObject({ address_line1: null });
    // Rejouer ne change rien.
    expect(await completer(org)).toBe(0);
  });

  it('une adresse déjà commencée n’est complétée que si elle concorde avec le profil', async () => {
    const uid = await inscription({ ...SCI, adresse: '12 autre rue' });
    const org = await ouvrir();
    await profil(org, uid, PROFIL);
    await completer(org);
    expect(await societe(org)).toMatchObject({ address_line1: '12 autre rue', postal_code: null, city: null, telephone: '0400000000' });

    await enTantQuePostgres();
    await db.query(`update public.persons set address_line1='5 RUE DES LILAS' where organization_id=$1 and account_id=$2`, [org, uid]);
    await agir(uid);
    expect(await completer(org)).toBe(1);
    expect(await societe(org)).toMatchObject({ address_line1: '5 RUE DES LILAS', postal_code: '69003', city: 'Lyon' });
  });

  it('espace ouvert avant le correctif (société sans e-mail) : le profil lui donne l’adresse de contact, même partagée avec la gérante', async () => {
    const uid = await inscription(SCI);
    const org = await ouvrir();
    await enTantQuePostgres();
    await db.query(`update public.persons set email=null where organization_id=$1 and account_id=$2`, [org, uid]);
    await profil(org, uid, { ...PROFIL, email_contact: `${uid}@example.invalid` });
    expect(await completer(org)).toBe(1);
    expect((await fiches(org)).map((p) => p.email)).toEqual([`${uid}@example.invalid`, `${uid}@example.invalid`]);
  });

  it('l’adresse d’une autre société de l’espace n’est pas recopiée ; le reste l’est, sans erreur', async () => {
    const uid = await inscription(SCI);
    const org = await ouvrir();
    await enTantQuePostgres();
    await db.query(`update public.persons set email=null where organization_id=$1 and account_id=$2`, [org, uid]);
    await db.query(`insert into public.persons(organization_id,nom,email,qualite) values($1,'SCI Voisine',$2,'SCI')`, [org, PROFIL.email_contact]);
    await profil(org, uid, PROFIL);
    expect(await completer(org)).toBe(1);
    expect((await fiches(org)).find((p) => p.nom === 'SCI du Tilleul')).toMatchObject({ email: null, address_line1: '5 rue des Lilas' });
  });

  it('réservée au propriétaire de l’espace ; fermée à anon', async () => {
    const uid = await inscription(SCI);
    const org = await ouvrir();
    const autre = await inscription({ prenom: 'Paul', qualite: 'Personne physique' });
    await agir(autre);
    expect(await refus('select public.completer_fiche_societe_depuis_profil($1)', [org])).toMatch(/Accès refusé/);
    await enTantQuePostgres();
    await db.query('set local role anon');
    expect(await refus('select public.completer_fiche_societe_depuis_profil($1)', [org])).toMatch(/permission denied/);
    await agir(uid);
    expect(await completer(org)).toBe(0);
  });

  it('index par nature : société et personne physique partagent une adresse ; deux de même nature, jamais', async () => {
    const uid = await inscription(SCI);
    const org = await ouvrir();
    await enTantQuePostgres();
    const email = `${uid}@example.invalid`;
    expect(await refus(`insert into public.persons(organization_id,nom,prenom,email,qualite) values($1,'Durand','Paul',upper($2),'Personne physique')`, [org, email])).toMatch(/persons_email_unique_par_agence_et_nature/);
    expect(await refus(`insert into public.persons(organization_id,nom,prenom,email,qualite) values($1,'Durand','Paul',$2,null)`, [org, email])).toMatch(/persons_email_unique_par_agence_et_nature/);
    expect(await refus(`insert into public.persons(organization_id,nom,email,qualite) values($1,'SCI Voisine',$2,'SCI familiale')`, [org, email])).toMatch(/persons_email_unique_par_agence_et_nature/);
    // Une fiche archivée ne compte pas ; l'ancien index strict a disparu.
    await db.query(`update public.persons set archived_at=now() where organization_id=$1 and qualite='Personne physique'`, [org]);
    expect(await refus(`insert into public.persons(organization_id,nom,prenom,email,qualite) values($1,'Durand','Paul',$2,'Personne physique')`, [org, email])).toBe('');
    expect((await db.query(`select to_regclass('public.persons_email_unique_par_agence') r`)).rows[0].r).toBeNull();
  });
});
