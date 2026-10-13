import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { etatInvitation } from "../src/lib/invitations-locataire";
config({ path: ".env.local", quiet: true });
const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)("LOC008 - accès accordé uniquement après consentement", () => {
 let db: Client, org: string, owner: string, other: string, person: string, invite: string, target: string;
 const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
 const as = async (id: string) => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:"authenticated",aal:"aal2"})]); await db.query("set local role authenticated"); };
 const account = async () => (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-invit-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
 const prepare = async () => (await db.query("select public.preparer_invitation_locataire($1,$2) r",[org,person])).rows[0].r;
 const reply = async (yes=true) => (await db.query("select public.repondre_invitation_locataire($1,$2) r",[invite,yes])).rows[0].r;
 const fail = async (sql: string,args: unknown[]=[]) => { await db.query("savepoint refusal");try {await db.query(sql,args);return "";}catch(e){await db.query("rollback to savepoint refusal");return (e as Error).message;}finally{await db.query("release savepoint refusal");}};
 beforeAll(async()=>{
  if(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url)) throw Error("Base locale dédiée requise");
  db=new Client({connectionString:url});await db.connect();await db.query("begin");
  if(process.env.INVITATIONS_PREVIEW==="1") { await db.query(readFileSync("supabase/migrations/20261013101000_invitations_locataire_cycle.sql","utf8")); await db.query(readFileSync("supabase/migrations/20261013104000_gardes_reprises_invitations.sql","utf8")); }
  if(process.env.INVITATIONS_PREVIEW==="1" || process.env.INVITATIONS_ANNULATION_PREVIEW==="1") await db.query(readFileSync("supabase/migrations/20261013106000_invitation_annulation_confirmee.sql","utf8"));
  if(process.env.INVITATIONS_STATUT_PREVIEW==="1" || process.env.INVITATIONS_PREVIEW==="1") await db.query(readFileSync("supabase/migrations/20261013107000_invitation_statut_et_perimetre.sql","utf8"));
 });
 beforeEach(async()=>{
  await admin();await db.query("savepoint scenario");owner=await account();other=await account();
  org=(await db.query("insert into organizations(name,type,status) values('TEST invitations','proprietaire_direct','active') returning id")).rows[0].id;
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[owner,org]);
  person=(await db.query("insert into persons(organization_id,nom,email) values($1,'TEST locataire','test-new-'||gen_random_uuid()||'@example.invalid') returning id",[org])).rows[0].id;
  await as(owner);invite=(await prepare()).id;await admin();target=(await db.query("select account_id from invitations_locataires where id=$1",[invite])).rows[0].account_id;
 });
 afterEach(async()=>{await db.query("rollback to savepoint scenario");});afterAll(async()=>{await db?.query("rollback");await db?.end();});
 it("statut d’accès lisible par propriétaire sans accès à l’annuaire des adhésions",async()=>{
  await as(owner);expect((await db.query("select statut_acces_locataire($1,$2) s",[org,person])).rows[0].s).toBeNull();
  await as(target);await reply();await as(owner);
  expect((await db.query("select * from memberships where account_id=$1",[target])).rows).toHaveLength(0);
  expect((await db.query("select statut_acces_locataire($1,$2) s",[org,person])).rows[0].s).toEqual({role:"locataire",status:"active"});
  await admin();await db.query("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[target,org]);await as(owner);
  expect((await db.query("select statut_acces_locataire($1,$2) s",[org,person])).rows[0].s).toEqual({role:"locataire",status:"inactive"});
  await as(other);expect(await fail("select statut_acces_locataire($1,$2)",[org,person])).toMatch(/Accès refusé/);
  await as(target);expect(await fail("select statut_acces_locataire($1,$2)",[org,person])).toMatch(/Accès refusé/);
 });
 it("agent hors portefeuille : invitation et statut inaccessibles, pas d’effet",async()=>{
  await admin();await db.query("select tache_systeme()");await db.query("update organizations set type='agence' where id=$1",[org]);await db.query("select set_config('gerimmo.systeme','',true)");
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'agent')",[other,org]);
  await as(other);expect((await db.query("select person_hors_portefeuille($1,$2) refuse",[org,person])).rows[0].refuse).toBe(true);
  expect((await db.query("select * from invitations_locataires where person_id=$1",[person])).rows).toHaveLength(0);
  for(const [sql,args] of [
    ["select preparer_invitation_locataire($1,$2)",[org,person]],
    ["select inviter_locataire($1,$2)",[org,person]],
    ["select annuler_invitation_locataire($1)",[invite]],
    ["select noter_envoi_invitation_locataire($1,true)",[invite]],
    ["select statut_acces_locataire($1,$2)",[org,person]],
  ] as [string,string[]][]) expect(await fail(sql,args)).toMatch(/hors de votre portefeuille/);
  await admin();expect((await db.query("select etat,envoye_le from invitations_locataires where id=$1",[invite])).rows).toEqual([{etat:"en_attente",envoye_le:null}]);
 });
 it("prépare compte et invitation sans lien de fiche ni adhésion",async()=>{
  expect((await db.query("select account_id from persons where id=$1",[person])).rows[0].account_id).toBeNull();
  expect((await db.query("select * from memberships where account_id=$1",[target])).rows).toHaveLength(0);
  await as(owner);expect((await prepare()).id).toBe(invite);expect((await db.query("select id from invitations_locataires where person_id=$1",[person])).rows).toHaveLength(1);
 });
 it("l’acceptation rattache une seule fois et se rejoue sans doubler",async()=>{
  await as(target);expect(await reply()).toMatchObject({etat:"acceptee",organization_id:org});expect(await reply()).toMatchObject({etat:"acceptee"});
  await admin();expect((await db.query("select account_id from persons where id=$1",[person])).rows[0].account_id).toBe(target);
  expect((await db.query("select * from memberships where account_id=$1 and organization_id=$2",[target,org])).rows).toHaveLength(1);
  expect((await db.query("select * from audit_log where organization_id=$1 and action='invitation_locataire_acceptee'",[org])).rows).toHaveLength(1);
 });
 it("le refus est définitif pour ce lien et ne donne aucun accès",async()=>{
  await as(target);expect(await reply(false)).toMatchObject({etat:"refusee"});expect(await reply()).toMatchObject({etat:"refusee",erreur:expect.any(String)});
  await admin();expect((await db.query("select * from memberships where account_id=$1",[target])).rows).toHaveLength(0);
  await as(owner);expect((await prepare()).id).not.toBe(invite);
 });
 it("l’expiration est visible avant réponse et empêche d’accepter",async()=>{
  await db.query("update invitations_locataires set expire_le=now()-interval '1 second' where id=$1",[invite]);
  await as(target);expect((await db.query("select * from mes_invitations_locataire($1)",[invite])).rows[0].etat).toBe("expiree");expect(await reply()).toMatchObject({etat:"expiree",erreur:expect.any(String)});
  await admin();expect((await db.query("select * from memberships where account_id=$1",[target])).rows).toHaveLength(0);
 });
 it("une nouvelle invitation conserve l’ancienne expirée",async()=>{
  await db.query("update invitations_locataires set expire_le=now()-interval '1 day' where id=$1",[invite]);await as(owner);expect((await prepare()).id).not.toBe(invite);
  expect((await db.query("select etat from invitations_locataires where id=$1",[invite])).rows[0].etat).toBe("expiree");
 });
 it("annulation gestionnaire et acceptation ensuite refusée",async()=>{
  await as(owner);await db.query("select annuler_invitation_locataire($1)",[invite]);await as(target);expect(await reply()).toMatchObject({etat:"annulee"});
 });
 it("annuler après acceptation ne prétend pas révoquer l’accès",async()=>{
  await as(target);await reply();await as(owner);
  expect(await fail("select annuler_invitation_locataire($1)",[invite])).toMatch(/déjà été acceptée/);
  await admin();expect((await db.query("select status from memberships where account_id=$1 and organization_id=$2",[target,org])).rows).toEqual([{status:"active"}]);
  expect((await db.query("select etat from invitations_locataires where id=$1",[invite])).rows[0].etat).toBe("acceptee");
  expect((await db.query("select id from audit_log where organization_id=$1 and action='invitation_locataire_annulee'",[org])).rows).toHaveLength(0);
 });
 it("refus et expiration annoncés sans fausse annulation ; répétition annulée stable",async()=>{
  await as(target);await reply(false);await as(owner);
  expect(await fail("select annuler_invitation_locataire($1)",[invite])).toMatch(/déjà été refusée/);
  invite=(await prepare()).id;await admin();await db.query("update invitations_locataires set expire_le=now()-interval '1 second' where id=$1",[invite]);await as(owner);
  expect(await fail("select annuler_invitation_locataire($1)",[invite])).toMatch(/expiré/);
  invite=(await prepare()).id;await db.query("select annuler_invitation_locataire($1)",[invite]);await db.query("select annuler_invitation_locataire($1)",[invite]);await admin();
  expect((await db.query("select id from audit_log where organization_id=$1 and action='invitation_locataire_annulee'",[org])).rows).toHaveLength(1);
 });
 it("autre compte : aucune lecture ni réponse ni annulation",async()=>{
  await as(other);expect((await db.query("select * from invitations_locataires")).rows).toHaveLength(0);expect((await db.query("select * from mes_invitations_locataire($1)",[invite])).rows).toHaveLength(0);
  expect(await fail("select repondre_invitation_locataire($1,true)",[invite])).toMatch(/introuvable/);expect(await fail("select annuler_invitation_locataire($1)",[invite])).toMatch(/Accès refusé/);
  expect(await fail("select preparer_invitation_locataire($1,$2)",[org,person])).toMatch(/Accès refusé/);
 });
 it("le destinataire ne modifie jamais directement l’état",async()=>{
  await as(target);expect(await fail("update invitations_locataires set etat='acceptee' where id=$1",[invite])).toMatch(/permission denied/);
  expect(await fail("select noter_envoi_invitation_locataire($1,true)",[invite])).toMatch(/Accès refusé/);
 });
 it("adresse de la fiche modifiée après invitation : refus",async()=>{
  await db.query("update persons set email='autre@example.invalid' where id=$1",[person]);await as(target);expect(await fail("select repondre_invitation_locataire($1,true)",[invite])).toMatch(/fiche a changé/);
 });
 it("adresse Auth modifiée ou non confirmée : refus",async()=>{
  await db.query("update auth.users set email_confirmed_at=null where id=$1",[target]);await as(target);expect(await fail("select repondre_invitation_locataire($1,true)",[invite])).toMatch(/adresse/);
  expect((await db.query("select * from mes_invitations_locataire($1)",[invite])).rows).toHaveLength(0);
 });
 it("un rôle existant différent n’est jamais remplacé",async()=>{
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'agent')",[target,org]);await as(target);
  expect(await fail("select repondre_invitation_locataire($1,true)",[invite])).toMatch(/autre accès/);
 });
 it("un accès désactivé n’est pas réactivé par une invitation",async()=>{
  await db.query("insert into memberships(account_id,organization_id,role,status) values($1,$2,'locataire','inactive')",[target,org]);await as(target);
  expect(await fail("select repondre_invitation_locataire($1,true)",[invite])).toMatch(/autre accès/);
 });
 it("ne change pas les accès déjà actifs",async()=>{
  await as(target);await reply();await as(owner);expect(await prepare()).toMatchObject({etat:"deja_actif"});
 });
 it("trace un échec d’envoi sans prétendre avoir envoyé",async()=>{
  await as(owner);await db.query("select noter_envoi_invitation_locataire($1,false)",[invite]);
  expect((await db.query("select envoye_le,erreur_envoi from invitations_locataires where id=$1",[invite])).rows[0]).toEqual({envoye_le:null,erreur_envoi:true});
  await db.query("select noter_envoi_invitation_locataire($1,true)",[invite]);expect((await db.query("select envoye_le,erreur_envoi from invitations_locataires where id=$1",[invite])).rows[0]).toMatchObject({envoye_le:expect.any(Date),erreur_envoi:false});
 });
 it("un espace en essai ouvert peut inviter",async()=>{
  await db.query("select tache_systeme()");await db.query("update organizations set status='essai',essai_fin=now()+interval '10 days' where id=$1",[org]);await db.query("select set_config('gerimmo.systeme','',true)");await as(owner);expect((await prepare()).id).toBe(invite);
 });
 it("suspension : préparation gérant refusée, réponse locataire conservée",async()=>{
  await db.query("select tache_systeme()");await db.query("update organizations set status='suspendue' where id=$1",[org]);await db.query("select set_config('gerimmo.systeme','',true)");await as(owner);expect(await fail("select preparer_invitation_locataire($1,$2)",[org,person])).toMatch(/invitations/);await as(target);expect(await reply()).toMatchObject({etat:"acceptee"});
 });
 it("les fonctions restent interdites à l’anonyme",async()=>{
  await db.query("set local role anon");expect(await fail("select preparer_invitation_locataire($1,$2)",[org,person])).toMatch(/permission denied/);expect(await fail("select mes_invitations_locataire(null)")).toMatch(/permission denied/);
 });
});
it("l’état visuel expire à la frontière exacte",()=>{expect(etatInvitation({id:"x",etat:"en_attente",cree_le:"2026-01-01",expire_le:"2026-01-31T00:00:00Z"},Date.parse("2026-01-31T00:00:00Z"))).toBe("expiree");});
