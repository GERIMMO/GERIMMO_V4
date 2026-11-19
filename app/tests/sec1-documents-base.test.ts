import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)('SEC-1 — fichiers réels du banc, deux organisations distinctes', () => {
  const db = new Client({ connectionString: url });
  let a: string, b: string, owner: string, tenant: string, person: string, session: string, tenantSession: string, path: string, original: string;
  beforeAll(async () => { await db.connect(); });
  beforeEach(async () => {
    await db.query('begin');
    [a,b,owner,tenant,person,session,tenantSession] = Array.from({length:7},()=>randomUUID());
    path = `${b}/${randomUUID()}.pdf`;
    await db.query("insert into organizations(id,name,status) values($1,'SEC1 A','active'),($2,'SEC1 B','active')",[a,b]);
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())",[owner,owner+'@example.invalid',tenant,tenant+'@example.invalid']);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$2,'locataire')",[owner,a,tenant]);
    await db.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,now()),($3,$4,now())",[session,owner,tenantSession,tenant]);
    await db.query("insert into persons(id,organization_id,account_id,nom,prenom) values($1,$2,$3,'Locataire','Fictif')",[person,a,tenant]);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('documents',$1,'{\"size\":1000}')",[path]);
    original=(await db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Fichier privé B',$2,'application/pdf',1000,'sec1-victime') returning id",[b,path])).rows[0].id;
  });
  afterEach(async () => { await db.query('rollback'); });
  afterAll(async () => { await db.end(); });
  async function as(uid: string, sid: string) {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','session_id',$2::text,'aal','aal1')::text,true)",[uid,sid]);
    await db.query('set local role authenticated');
  }
  async function admin() { await db.query('reset role');await db.query("select set_config('request.jwt.claims','',true)"); }
  async function forge(type='justificatif') {
    return (await db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,retention_reference_date) values($1,$2::document_type,'Référence étrangère',$3,'application/pdf',1000,'sec1-sonde',current_date-400) returning id",[a,type,path])).rows[0].id;
  }
  // Fixture historique locale ; les contrôles sont remis en place avant
  // d'exercer les fonctions et politiques de l'application.
  async function historique(type='justificatif') {
    await admin();await db.query("set local session_replication_role='replica'");
    const id=await forge(type);
    await db.query("set local session_replication_role='origin'");
    return id;
  }
  it('refuse au propriétaire A la création d’une référence au fichier existant de B',async()=>{
    await as(owner,session);await expect(forge()).rejects.toMatchObject({code:'42501'});
  });
  it('ne sert pas au locataire A une référence étrangère historique',async()=>{
    const id=await historique();
    await db.query("set local session_replication_role='replica'");
    await db.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'personne',$3)",[id,a,person]);
    await db.query("set local session_replication_role='origin'");
    await as(tenant,tenantSession);
    expect((await db.query("select name from storage.objects where bucket_id='documents' and name=$1",[path])).rows).toEqual([]);
    expect((await db.query('select * from public.mon_document_locataire($1,$2)',[a,id])).rows).toEqual([]);
  });
  it('la conservation ne met pas en suppression le fichier vivant de B à cause d’une référence A',async()=>{
    await historique('document_test');await admin();await db.query('select public.appliquer_retention()');
    expect((await db.query('select id from purge_fichiers where storage_path=$1 and deleted_at is null',[path])).rows).toEqual([]);
    expect((await db.query('select purged_at from documents where id=$1',[original])).rows[0].purged_at).toBeNull();
    expect((await db.query("select id from storage.objects where bucket_id='documents' and name=$1",[path])).rowCount).toBe(1);
  });
  it('conserve la lecture du locataire pour un fichier de sa propre organisation',async()=>{
    const own=`${a}/${randomUUID()}.pdf`;
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('documents',$1,'{\"size\":1000}')",[own]);
    await as(owner,session);
    const id=(await db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Pièce autorisée',$2,'application/pdf',1000,'sec1-propre') returning id",[a,own])).rows[0].id;
    await db.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'personne',$3)",[id,a,person]);
    await as(tenant,tenantSession);
    expect((await db.query("select name from storage.objects where bucket_id='documents' and name=$1",[own])).rows).toEqual([{name:own}]);
  });
  it('refuse de rattacher le document de B à un dossier de A', async () => {
    await as(owner, session);
    await expect(db.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'personne',$3)",
      [original,a,person])).rejects.toThrow(/document.*(?:agence|dossier)/i);
  });
  async function mettreEnFile(chemin: string): Promise<string> {
    return (await db.query('insert into purge_fichiers(storage_path) values($1) returning id',[chemin])).rows[0].id;
  }
  async function reserver(ids: string[]) {
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    await db.query('set local role service_role');
    const result = await db.query('select * from reserver_fichiers_purge($1)',[ids]);
    await admin();
    return result.rows;
  }
  it('conserve une entrée de purge historique si le fichier est encore référencé', async () => {
    const entree = await mettreEnFile(path);
    expect(await reserver([entree])).toEqual([]);
    expect((await db.query('select deleted_at,reserve_le from purge_fichiers where id=$1',[entree])).rows)
      .toEqual([{ deleted_at: null, reserve_le: null }]);
  });
  it('ne traite qu’un objet identifié et préserve une entrée dont le chemin a été réutilisé', async () => {
    const remplacement = `${a}/${randomUUID()}.pdf`;
    const eligible = `${a}/${randomUUID()}.pdf`;
    const ancienneEntree = await mettreEnFile(remplacement);
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1),('documents',$2)",[remplacement,eligible]);
    const entreeValide = await mettreEnFile(eligible);
    const result = await reserver([ancienneEntree,entreeValide]);
    expect(result).toEqual([expect.objectContaining({ id: entreeValide, storage_path: eligible, objet_present: true })]);
    await as(owner,session);
    await expect(db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Pièce',$2,'application/pdf',1000,'sec1-reserve')",
      [a,eligible])).rejects.toMatchObject({code:'42501'});
  });
});
