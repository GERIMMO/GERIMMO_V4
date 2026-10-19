/**
 * Audit du 19/10/2026, lot B5 — migration 20261019124000 (sort du devis signé, index des offres, jour de Paris des devis) :
 * rejeu sans effet, retour arrière exact (texte d'origine du déclencheur, blocs retirés, jour de session, index d'origine,
 * version retirée), gardes du retour et de la migration, droits, et jour de Paris de retenir_devis et deposer_devis (horloge
 * de Paris figée). En série : drop/create de l'index (verrou exclusif sur bail_signature_circuits) et réécriture temporaire
 * d'aujourdhui_paris(), annulées à la fin de chaque cas.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const NOM = '20261019124000_devis_signes_sort_et_jour_de_paris';
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, 'utf8');
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, 'utf8');
const ORIGINE = readFileSync('supabase/migrations/20261018193308_signature_devis_accord_client.sql', 'utf8');
const MARQUEUR = 'B5 (19/10/2026)';
const GARDER = 'public.garder_devis_en_signature()';
const RESERVER = 'public.reserver_envoi_signature_bail(uuid,uuid)';
const LIRE = 'public.lire_signature_devis(uuid,uuid)';
const RETENIR = 'public.retenir_devis(uuid,uuid)';
const DEPOSER = 'public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)';
const FONCTIONS = [GARDER, RESERVER, LIRE, RETENIR, DEPOSER];
const CURRENT_DATE = /\bcurrent_date\b/gi;
const PARIS = /\b(public\.)?aujourdhui_paris\(\)/g;
const compter = (texte: string, motif: RegExp) => (texte.match(motif) ?? []).length;
/** Le corps d'une fonction tel que pg_get_functiondef le rend, entre ses `$function$`. */
const corps = (def: string) => def.slice(def.indexOf('AS $function$') + 'AS $function$'.length, def.lastIndexOf('$function$'));
/** Le corps EXACT du déclencheur d'origine (20261018193308, l. 60-70), entre ses `$$`. */
const CORPS_ORIGINE = (() => {
  const m = ORIGINE.match(/create function public\.garder_devis_en_signature\(\)[^\n]*as \$\$([\s\S]*?)\$\$;/);
  if (!m) throw new Error('Le déclencheur d’origine n’est plus dans 20261018193308.');
  return m[1];
})();

it('le retour se joue dans une transaction externe et ne retire que sa version ; la migration cite le jour de Paris et ferme anon', () => {
  expect(RETOUR).not.toMatch(/^\s*(begin|commit|rollback);\s*$/im);
  expect(RETOUR).toContain("delete from supabase_migrations.schema_migrations where version='20261019124000'");
  expect(RETOUR).toContain(CORPS_ORIGINE);
  expect(MIGRATION).toMatch(/^select public\.fermer_fonctions_a_anon\(\);\s*$/m);
  // Hors commentaire : la migration entre dans la chaîne « Ordre complet » des retours du jour de Paris (son retour l'ouvre).
  expect(MIGRATION.replace(/--.*$/gm, '')).toContain('aujourdhui_paris()');
});

describe.skipIf(!url)('B5 — devis signé : rejeu, retour arrière, gardes, droits et jour de Paris', () => {
  let db: Client;
  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const definition = async (s: string) => (await db.query('select pg_get_functiondef($1::regprocedure) d', [s])).rows[0].d as string;
  const texte = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].v);
  async function empreinte() {
    const fonctions = (await db.query('select oid::regprocedure::text signature, md5(pg_get_functiondef(oid)) definition, proacl::text droits, prosecdef, proconfig from pg_proc where oid=any($1::regprocedure[]) order by 1', [FONCTIONS])).rows;
    const index = (await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='signature_devis_une_offre'")).rows[0]?.indexdef ?? 'absent';
    const declencheur = (await db.query("select pg_get_triggerdef(t.oid) d from pg_trigger t where t.tgname='devis_signature_verrou' and t.tgrelid='public.incident_devis'::regclass")).rows[0]?.d ?? 'absent';
    return { fonctions, index, declencheur };
  }
  /** Un script qui échoue n'a rien modifié : l'erreur annule sa transaction (ici, jusqu'au point de reprise). */
  const refuse = async (sql: string, motif: RegExp) => { await db.query('savepoint refus'); await expect(db.query(sql)).rejects.toThrow(motif); await db.query('rollback to refus'); };
  async function role(user: string | null, r = 'authenticated') { await db.query('reset role'); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: r, aal: 'aal2' })]); if (r !== 'postgres') await db.query('set local role ' + r); }
  /** L'horloge de Paris figée à un instant local (AAAA-MM-JJ HH:MM:SS, heure de Paris) ; annulée avec le point de reprise. */
  async function horloge(parisLocal: string) {
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path='' as $$ select (current_setting('gerimmo.horloge_essai',true)::timestamptz at time zone 'Europe/Paris')::date $$");
    await db.query("select set_config('gerimmo.horloge_essai',(($1::timestamp) at time zone 'Europe/Paris')::text,true)", [parisLocal]);
  }
  async function dossier() {
    const org = await id("insert into organizations(name,type,status) values('B5 fictive','proprietaire_direct','active') returning id");
    const owner = await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [owner, org]);
    const bien = await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Fictif','appartement','1 rue Test','75011','Paris') returning id", [org]);
    const lot = await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Fictif','disponible') returning id", [org, bien]);
    const incident = await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','Essai B5','qualifie','proprietaire','Essai fictif') returning id", [org, lot]);
    const consultation = await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [org, incident]);
    const doc = await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'devis','Offre fictive',$1::uuid::text||'/offre.pdf','application/pdf',100,repeat('a',64)) returning id", [org]);
    return { org, owner, incident, consultation, doc };
  }
  async function artisan(telephone: string) {
    const compte = await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
    const a = await id("insert into artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite) values($1,'Fictif',floor(random()*9e13+1e13)::bigint::text,$2,'valide','verifie','publique') returning id", [compte, telephone]);
    await db.query("insert into artisan_metiers values($1,'plomberie')", [a]);
    return { compte, id: a };
  }
  /** Un circuit devis_artisan du dossier, 'termine' (avec son archive signée) ou 'pret' (en attente d'envoi, sans archive). */
  const circuit = (d: Awaited<ReturnType<typeof dossier>>, etat: 'termine' | 'pret') =>
    id("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,etat,document_signe) values($1,$2,'devis_artisan',gen_random_uuid(),$3,$4,'zoho','production',repeat('b',64),repeat('a',64),$5,$6,case when $6::text='termine' then $3::uuid end) returning id",
      [d.org, d.incident, d.doc, d.owner, JSON.stringify([{ qualite: 'Propriétaire', prenom: 'Client', nom: 'Test', email: 'client@example.test', externalId: 's1', statut: etat === 'termine' ? 'signed' : 'pending' }]), etat]);
  const circuitTermine = (d: Awaited<ReturnType<typeof dossier>>) => circuit(d, 'termine');

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query('begin'); });
  afterAll(async () => { await db?.query('rollback'); await db?.end(); });
  beforeEach(async () => { await db.query('savepoint cas'); });
  afterEach(async () => { await db.query('rollback to cas'); });

  it('la base migrée : sort décidable et contenu figé (marqueur B5), index sans circuits terminés, validité au jour de Paris', async () => {
    for (const s of [GARDER, RESERVER, LIRE]) expect(await definition(s), s).toContain(MARQUEUR);
    const retenir = await definition(RETENIR);
    expect(compter(retenir, CURRENT_DATE)).toBe(0); expect(compter(retenir, PARIS)).toBe(1);
    const deposer = await definition(DEPOSER);
    expect(compter(deposer, CURRENT_DATE)).toBe(0); expect(compter(deposer, PARIS)).toBe(3);
    const { index, declencheur } = await empreinte();
    expect(index).not.toContain('termine'); expect(index).toContain("'a_verifier'");
    expect(declencheur).toMatch(/BEFORE DELETE OR UPDATE ON public\.incident_devis FOR EACH ROW EXECUTE FUNCTION garder_devis_en_signature\(\)/);
  });

  it('rejouée deux fois sur une base déjà migrée, la migration ne change rien (définitions, droits, index, déclencheur)', async () => {
    const avant = await empreinte();
    await db.query(MIGRATION); expect(await empreinte()).toEqual(avant);
    await db.query(MIGRATION); expect(await empreinte()).toEqual(avant);
  });

  it("anon reste fermé ; les rôles de l'application gardent exactement leurs droits d'avant", async () => {
    const { rows } = await db.query("select s signature, has_function_privilege('anon',s,'execute') anon, has_function_privilege('authenticated',s,'execute') connecte, has_function_privilege('service_role',s,'execute') service from unnest($1::text[]) s", [FONCTIONS]);
    expect(rows.map((r) => [r.signature, r.anon, r.connecte, r.service])).toEqual([
      [GARDER, false, false, true], [RESERVER, false, false, true], [LIRE, false, true, true], [RETENIR, false, true, true], [DEPOSER, false, false, true],
    ]);
  });

  it("le retour rétablit l'état d'avant (déclencheur au texte exact, blocs retirés, jour de session, index avec 'termine', version retirée), se rejoue sans effet ; la migration ramène l'état migré", async () => {
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key)');
    await db.query("insert into supabase_migrations.schema_migrations(version) values('20261019124000'),('20000101000000') on conflict do nothing");
    const migre = await empreinte();
    await db.query(RETOUR);
    const garder = await definition(GARDER);
    expect(garder).not.toContain(MARQUEUR); expect(corps(garder)).toBe(CORPS_ORIGINE);
    for (const s of [RESERVER, LIRE]) expect(await definition(s), s).not.toContain(MARQUEUR);
    expect(compter(await definition(RESERVER), /La signature des devis est encore en préparation/g)).toBe(1);
    expect(compter(await definition(LIRE), /Ce dossier n’est plus en attente d’affectation/g)).toBe(1);
    const retenir = await definition(RETENIR);
    expect(compter(retenir, CURRENT_DATE)).toBe(1); expect(compter(retenir, PARIS)).toBe(0);
    const deposer = await definition(DEPOSER);
    expect(compter(deposer, CURRENT_DATE)).toBe(2); expect(compter(deposer, PARIS)).toBe(1);
    expect((await empreinte()).index).toContain("'termine'");
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ('20261019124000','20000101000000') order by 1")).rows).toEqual([{ version: '20000101000000' }]);
    const avant = await empreinte();
    expect(avant.fonctions.map((f) => [f.signature, f.droits, f.prosecdef, f.proconfig])).toEqual(migre.fonctions.map((f) => [f.signature, f.droits, f.prosecdef, f.proconfig]));
    expect(avant.declencheur).toBe(migre.declencheur);
    await db.query(RETOUR); expect(await empreinte()).toEqual(avant);
    await db.query(MIGRATION); expect(await empreinte()).toEqual(migre);
  });

  it('le retour refuse, sans rien modifier, si deux circuits terminés partagent un dossier (l’ancien index ne peut pas être reposé) et nomme le dossier', async () => {
    const d = await dossier();
    await circuitTermine(d); await circuitTermine(d);
    const avant = await empreinte();
    await refuse(RETOUR, new RegExp(`plusieurs circuits de signature terminés ou actifs : ${d.incident}`));
    expect(await empreinte()).toEqual(avant);
  });

  it('le retour refuse aussi un circuit terminé et un circuit « pret » sur le même dossier (prédicat exact de l’ancien index), nomme le dossier et ne modifie rien', async () => {
    const d = await dossier();
    await circuitTermine(d); await circuit(d, 'pret');
    // La correction B5 autorise cette coexistence (l'index migré ne retient plus 'termine') ; l'ancien index la refuserait.
    expect((await db.query("select count(*)::int n from bail_signature_circuits where incident_id=$1 and modele='devis_artisan' and etat in ('pret','termine')", [d.incident])).rows[0].n).toBe(2);
    const avant = await empreinte();
    await refuse(RETOUR, new RegExp(`plusieurs circuits de signature terminés ou actifs : ${d.incident}`));
    expect(await empreinte()).toEqual(avant);
  });

  it('le retour refuse si le déclencheur a été réécrit autrement (ni marqueur B5, ni texte d’origine)', async () => {
    await db.query("create or replace function public.garder_devis_en_signature() returns trigger language plpgsql security definer set search_path='' as $$ begin if tg_op='DELETE' then return old; end if; return new; end $$");
    await refuse(RETOUR, /garder_devis_en_signature\(\) a une définition inattendue/);
  });

  it('le retour refuse une réécriture du déclencheur qui ne garde que le message d’origine : seul le corps exact de 20261018193308 vaut « rien à faire »', async () => {
    await db.query("create or replace function public.garder_devis_en_signature() returns trigger language plpgsql security definer set search_path='' as $$ begin if tg_op='DELETE' then return old; end if; raise exception 'Annulez le circuit en cours avant de modifier le devis. Une offre déjà signée doit être conservée.'; end $$");
    const avant = await empreinte();
    await refuse(RETOUR, /garder_devis_en_signature\(\) a une définition inattendue \(ni marqueur B5, ni corps exact de 20261018193308\)/);
    expect(await empreinte()).toEqual(avant);
  });

  it('la migration refuse une définition inattendue de retenir_devis et la nomme', async () => {
    await db.query((await definition(RETENIR)).replace('public.aujourdhui_paris()', 'public.aujourdhui_paris() + 0 * (current_date - current_date)'));
    await refuse(MIGRATION, /retenir_devis\(uuid,uuid\) contient 2 occurrence\(s\) de current_date et 1 du jour de Paris, au lieu de 1 et 0/);
  });

  describe('jour de Paris : un devis « valable jusqu’au » J le reste toute la journée de Paris, et plus après', () => {
    let d: Awaited<ReturnType<typeof dossier>>, a: Awaited<ReturnType<typeof artisan>>, b: Awaited<ReturnType<typeof artisan>>, devis: string, sollB: string, J: string;
    beforeEach(async () => {
      d = await dossier(); a = await artisan('0600000001'); b = await artisan('0600000002');
      const soll = await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'devis_depose') returning id", [d.org, d.consultation, d.incident, a.id]);
      sollB = await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'envoyee') returning id", [d.org, d.consultation, d.incident, b.id]);
      // J : le jour de la SESSION (UTC sur le banc comme chez Supabase) ; l'ancien code comparait la validité à ce jour-là.
      J = await texte('select current_date::text v');
      devis = await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,document_id) values($1,$2,$3,$4,11000,'Fictif',$5::date,$6) returning id", [d.org, soll, d.incident, a.id, J, d.doc]);
      // Sans signature exigée : la règle « signer avant de confier » ne concerne pas ce cas.
      await db.query('update signature_budget set devis_actif=false');
    });
    it('retenir_devis : encore valable à 23 h 30 à Paris le jour J', async () => {
      await horloge(`${J} 23:30:00`);
      expect(await texte('select public.aujourdhui_paris()::text v')).toBe(J);
      await role(d.owner);
      const intervention = await id('select public.retenir_devis($1,$2) id', [d.org, devis]);
      await db.query('reset role');
      expect(await texte('select statut::text v from incident_devis where id=$1', [devis])).toBe('retenu');
      expect(await texte('select devis_id::text v from incident_interventions where id=$1', [intervention])).toBe(devis);
    });
    it('retenir_devis : caduc le lendemain à 0 h 30 à Paris, alors que le jour de la session est encore J', async () => {
      await horloge(`${J} 23:30:00`);
      await db.query("select set_config('gerimmo.horloge_essai',((($1::date+1)::timestamp+interval '30 minutes') at time zone 'Europe/Paris')::text,true)", [J]);
      expect(await texte('select public.aujourdhui_paris()::text v')).toBe(await texte('select ($1::date+1)::text v', [J]));
      expect(await texte('select current_date::text v')).toBe(J);
      await role(d.owner);
      await db.query('savepoint caduc');
      await expect(db.query('select public.retenir_devis($1,$2)', [d.org, devis])).rejects.toThrow(/Ce devis a expiré le .* — il est caduc/);
      await db.query('rollback to caduc');
    });
    it('deposer_devis : à 0 h 30 à Paris le J+1, une validité « J+1 » n’est plus à venir, et la validité par défaut court depuis J+1', async () => {
      await horloge(`${J} 23:30:00`);
      await db.query("select set_config('gerimmo.horloge_essai',((($1::date+1)::timestamp+interval '30 minutes') at time zone 'Europe/Paris')::text,true)", [J]);
      await role(b.compte, 'postgres');
      await db.query('savepoint depot');
      await expect(db.query("select public.deposer_devis($1,10000,'Essai fictif',($2::date+1))", [sollB, J])).rejects.toThrow(/La date de validité du devis doit être à venir/);
      await db.query('rollback to depot');
      const nouveau = await id("select public.deposer_devis($1,10000,'Essai fictif',null) id", [sollB]);
      // validite_jours de la consultation : 30, comptés depuis le jour de Paris (J+1), pas depuis le jour de la session (J).
      expect(await texte('select valide_jusqu_au::text v from incident_devis where id=$1', [nouveau])).toBe(await texte('select ($1::date+31)::text v', [J]));
    });
    it('deposer_devis : à 23 h 30 à Paris le jour J, une validité « J+1 » est acceptée telle quelle', async () => {
      await horloge(`${J} 23:30:00`);
      await role(b.compte, 'postgres');
      const nouveau = await id("select public.deposer_devis($1,10000,'Essai fictif',($2::date+1)) id", [sollB, J]);
      expect(await texte('select valide_jusqu_au::text v from incident_devis where id=$1', [nouveau])).toBe(await texte('select ($1::date+1)::text v', [J]));
    });
  });
});
