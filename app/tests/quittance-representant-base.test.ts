/**
 * SCI-3 (audit après publication de la PR #347, 19/11/2026) — en base : migration 20261119200200.
 *
 * `quittance_document` — que le LOCATAIRE appelle (page /quittance/[id], « Mes documents ») — rend, pour une société
 * bailleresse dotée d'un pouvoir actif au bail (`representants_actifs_bail`), la clé `representant` : nom et prénom de la
 * personne physique qui signe pour elle, rien d'autre. Le locataire ne lit toujours pas `representations_bail`. Sans
 * pouvoir actif (aucun, expiré, justificatif remplacé), l'objet du bailleur est IDENTIQUE à avant : la clé est absente.
 * Les contrôles d'accès de la fonction ne changent pas.
 *
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (base de test locale), sinon ignoré.
 */
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)('SCI-3 : la quittance d’une société nomme son représentant', () => {
  const db = new Client({ connectionString: url });
  let org = '', proprietaire = '', locataire = '', etranger = '';
  let societe = '', gerante = '', bail = '', quittance = '', justificatif = '';

  const id = async (sql: string, params: unknown[] = []) => String((await db.query(sql, params)).rows[0].id);
  async function agir(compte: string) {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [compte]);
    await db.query('set local role authenticated');
  }
  async function refus(sql: string, params: unknown[] = []): Promise<string> {
    await db.query('savepoint essai');
    try { await db.query(sql, params); await db.query('release savepoint essai'); return ''; }
    catch (e) { await db.query('rollback to savepoint essai'); return (e as Error).message; }
  }
  async function nouveauCompte(prefixe: string): Promise<string> {
    return id(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
       returning id`, [prefixe]);
  }
  const document = async () => (await db.query('select public.quittance_document($1) d', [quittance])).rows[0].d;

  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => {
    await db.query('begin');
    org = await id(`insert into public.organizations (name, type, status, address_line1, postal_code, city, email_contact)
                    values ('SCI du Tilleul','proprietaire_direct','active','5 rue des Lilas','69003','Lyon','camille@example.invalid') returning id`);
    proprietaire = await nouveauCompte('proprietaire');
    locataire = await nouveauCompte('locataire');
    etranger = await nouveauCompte('etranger');
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct'),($3,$2,'locataire')`, [proprietaire, org, locataire]);
    const bien = await id(`insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
                           values ($1,'Résidence','immeuble','18 rue des Acacias','69003','Lyon') returning id`, [org]);
    const lot = await id(`insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Appartement 2','loue') returning id`, [bien, org]);
    societe = await id(`insert into public.persons (organization_id, account_id, nom, email, qualite, address_line1, postal_code, city)
                        values ($1,$2,'SCI du Tilleul','camille@example.invalid','SCI','5 rue des Lilas','69003','Lyon') returning id`, [org, proprietaire]);
    gerante = await id(`insert into public.persons (organization_id, nom, prenom, email, telephone, qualite)
                        values ($1,'Martin','Camille','camille@example.invalid','0600000000','Personne physique') returning id`, [org]);
    const fiche = await id(`insert into public.persons (organization_id, account_id, nom, prenom, email) values ($1,$2,'Leblanc','Léa','lea@example.invalid') returning id`, [org, locataire]);
    await db.query(`insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut) values ($1,$2,$3,100,current_date - 400)`, [lot, org, societe]);
    bail = await id(`insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
                     values ($1,$2,$3,'actif', current_date - 200, 650, 50) returning id`, [org, lot, fiche]);
    const appel = await id(`insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
                            values ($1,$2,'2026-11-01',650,50,700,'2026-11-05') returning id`, [org, bail]);
    quittance = await id(`insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant, date_emission)
                          values ($1,$2,$3,true,700,'2026-11-05') returning id`, [org, bail, appel]);
    justificatif = await id(`insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
                             values ($1,'justificatif','Pouvoir',$1::uuid::text||'/pouvoir.pdf','application/pdf',100,repeat('b',64)) returning id`, [org]);
    await db.query(`insert into public.document_liens (organization_id, document_id, entite, entite_id) values ($1,$2,'personne',$3)`, [org, justificatif, societe]);
  });
  afterEach(async () => { await db.query('rollback'); });

  /** Le pouvoir confirmé au bail, posé directement (le bail est déjà actif ; `designer_representant_bail` exige un brouillon). */
  async function pouvoir(finValidite: string | null = null) {
    await db.query('reset role');
    await db.query(`insert into public.representations_bail (bail_id, societe_id, personne_id, justificatif_id, empreinte_justificatif, fin_validite, confirme_par)
                    values ($1,$2,$3,$4,repeat('b',64),$5,$6)`, [bail, societe, gerante, justificatif, finValidite, proprietaire]);
  }

  it('sans pouvoir : le bailleur est rendu comme avant, sans clé « representant »', async () => {
    await agir(locataire);
    expect((await document()).bailleurs).toEqual([{ nom: 'SCI du Tilleul', prenom: null }]);
  });

  it('pouvoir actif : le locataire lit le nom et le prénom du représentant, et rien d’autre', async () => {
    await pouvoir();
    await agir(locataire);
    const d = await document();
    expect(d.bailleurs).toEqual([{ nom: 'SCI du Tilleul', prenom: null, representant: { nom: 'Martin', prenom: 'Camille' } }]);
    expect(JSON.stringify(d)).not.toContain('0600000000');
    expect(d.vue_gestionnaire).toBe(false);
    // La table du pouvoir reste fermée au locataire : la fonction seule le lui dit.
    expect((await db.query('select count(*)::int n from public.representations_bail')).rows[0].n).toBe(0);
  });

  it('le propriétaire lit la même chose', async () => {
    await pouvoir();
    await agir(proprietaire);
    const d = await document();
    expect(d.bailleurs[0].representant).toEqual({ nom: 'Martin', prenom: 'Camille' });
    expect(d.vue_gestionnaire).toBe(true);
  });

  it('pouvoir expiré ou justificatif remplacé : plus de représentant', async () => {
    await pouvoir(null);
    await db.query(`update public.representations_bail set fin_validite = current_date - 1 where bail_id=$1`, [bail]);
    await agir(locataire);
    expect((await document()).bailleurs).toEqual([{ nom: 'SCI du Tilleul', prenom: null }]);

    await db.query('reset role');
    await db.query(`update public.representations_bail set fin_validite = null where bail_id=$1`, [bail]);
    await db.query(`insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, remplace_id)
                    values ($1,'justificatif','Pouvoir v2',$1::uuid::text||'/pouvoir-v2.pdf','application/pdf',100,repeat('c',64),$2)`, [org, justificatif]);
    await agir(locataire);
    expect((await document()).bailleurs).toEqual([{ nom: 'SCI du Tilleul', prenom: null }]);
  });

  it('les contrôles d’accès ne changent pas : un compte étranger ne lit rien, anon n’appelle pas', async () => {
    await pouvoir();
    await agir(etranger);
    expect(await document()).toBeNull();
    await db.query('reset role');
    await db.query('set local role anon');
    expect(await refus('select public.quittance_document($1)', [quittance])).toMatch(/permission denied/);
  });

  it('la définition en vigueur porte la clé, une seule fois', async () => {
    const def = (await db.query(`select pg_get_functiondef('public.quittance_document(uuid)'::regprocedure) d`)).rows[0].d as string;
    expect(def.split("jsonb_build_object('representant'").length - 1).toBe(1);
    expect(def).toContain('from public.representants_actifs_bail(b.id) r');
  });
});
