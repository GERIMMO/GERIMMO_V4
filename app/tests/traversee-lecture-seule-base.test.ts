import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { verifierSupportInterne } from "../scripts/sauvegarde/restaurer-archive.mjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Ce lot ne s'exécute que contre un banc explicitement local et fictif.
const url = process.env.SUPABASE_DB_URL;
if (url) {
  const cible = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(cible.hostname) || !cible.pathname.startsWith("/gerimmo_ci_")) throw new Error("T10 exige une base locale fictive gerimmo_ci_…");
}

describe.skipIf(!url)("D08-C — lecture seule en base et support borné", () => {
  let db: Client;
  let sa: string, autreSa: string, gerant: string, org: string, autreOrg: string, bien: string, lot: string, bail: string, appel: string, personne: string;
  async function agir(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text,true)", [id, aal]);
    await db.query("set local role authenticated");
  }
  async function essai(sql: string, params: unknown[] = []) {
    await db.query("savepoint essai");
    try { const r = await db.query(sql, params); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); throw e; }
  }
  async function preparer() {
    return (await essai("select * from public.preparer_encaissement_support($1,$2,$3,840,0,'TEST virement reçu confirmé par le client')", [org,bail,appel])).rows[0].geste_id as string;
  }
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("reset role; begin; select set_config('request.jwt.claims','{}',true)");
    sa=randomUUID(); autreSa=randomUUID(); gerant=randomUUID();
    for (const id of [sa,autreSa,gerant]) await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')", [id,`${id}@test.local`]);
    for (const id of [sa,autreSa]) await db.query("insert into public.memberships(account_id,role) values($1,'super_admin')", [id]);
    org=(await db.query("insert into public.organizations(name,type,status) values('TEST T10','proprietaire_direct','active') returning id")).rows[0].id;
    autreOrg=(await db.query("insert into public.organizations(name,type,status) values('TEST autre T10','proprietaire_direct','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[gerant,org]);
    bien=(await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST T10','appartement','1 rue Test','75001','Paris') returning id",[org])).rows[0].id;
    lot=(await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST T10','loue') returning id",[org,bien])).rows[0].id;
    personne=(await db.query("insert into public.persons(organization_id,nom) values($1,'TEST T10') returning id",[org])).rows[0].id;
    bail=(await db.query("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',780,60,'2026-01-01',5,$3) returning id",[org,lot,personne])).rows[0].id;
    appel=(await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,'2026-01-01','2026-01-05',780,60,840) returning id",[org,bail])).rows[0].id;
    await agir(sa);
  });
  afterEach(async () => { await db.query("rollback; reset role"); });
  afterAll(async () => { await db?.end(); });

  it("la restauration exige le registre privé complet et fermé, avec ses gardes actives", async () => {
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    expect(await verifierSupportInterne(db, true)).toEqual({ present: true, protections: "validées" });
    for (const sql of [
      "grant usage on schema support_interne to authenticated",
      "grant execute on function support_interne.preparer_maintenance_artisans() to anon",
      "grant select on support_interne.gestes_encaissement to authenticated",
      "alter table support_interne.gestes_encaissement disable row level security",
      "alter table public.organizations disable trigger traversee_lecture_seule",
      "drop trigger traversee_auto_habilitation on public.memberships",
      "drop function support_interne.purger_gestes_support()",
      "alter schema support_interne rename to support_incomplet",
    ]) {
      await db.query("savepoint restauration");
      await db.query(sql);
      await expect(verifierSupportInterne(db, true), sql).rejects.toThrow(/registre privé/);
      await db.query("rollback to savepoint restauration; release savepoint restauration");
    }
    expect(await verifierSupportInterne(db, true)).toEqual({ present: true, protections: "validées" });
  });

  // Plan de conformité du 23/10 (lot 2, migration 20261024140000) : le registre de support suit le contrôle interne
  // (journal:audit_controle_interne, 36 mois), pas le journal général ramené à 12 mois.
  it("la rétention du support suit le contrôle interne du journal d’audit et conserve une transaction active", async () => {
    const expire = await preparer(), actif = await preparer(), recent = await preparer();
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    await db.query("update support_interne.gestes_encaissement set cree_le=now()-interval '37 months', expire_le=now()-interval '37 months'+interval '5 minutes' where id=any($1::uuid[])", [[expire, actif]]);
    await db.query("update support_interne.gestes_encaissement set transaction_active=txid_current() where id=$1", [actif]);
    await db.query("update public.retention_rules set actif=false where data_type='journal:audit_controle_interne'");
    expect((await db.query("select support_interne.purger_gestes_support()::int n")).rows[0].n).toBe(0);
    await db.query("update public.retention_rules set actif=true, duree_mois=36 where data_type='journal:audit_controle_interne'");
    expect((await db.query("select support_interne.purger_gestes_support()::int n")).rows[0].n).toBe(1);
    expect((await db.query("select id from support_interne.gestes_encaissement where id=any($1::uuid[]) order by id", [[expire, actif, recent]])).rows.map(r => r.id).sort()).toEqual([actif, recent].sort());
    expect((await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) d")).rows[0].d).toContain("support_interne.purger_gestes_support()");
  });

  it("le fichier brut de migration respecte le ROLLBACK du chantier",async()=>{
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    const transaction=(await db.query("select txid_current()::text id")).rows[0].id;
    // Aucune suppression/réécriture du SQL : c'est exactement le fichier livré.
    await db.query(readFileSync(new URL('../supabase/migrations/20261016172453_traversee_lecture_seule.sql',import.meta.url),'utf8'));
    expect((await db.query("select txid_current()::text id")).rows[0].id).toBe(transaction);
    await db.query("rollback");
    expect((await db.query("select count(*)::int n from public.organizations where id=$1",[org])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from auth.users where id=$1",[sa])).rows[0].n).toBe(0);
  });
  it("le fichier brut de retour reste annulable dans un lot",async()=>{
    await db.query("reset role");
    await db.query('savepoint retour');
    await db.query(readFileSync(new URL('../supabase/retours-arriere/20261016172453_traversee_lecture_seule.retour.sql',import.meta.url),'utf8'));
    await db.query('rollback to savepoint retour');
    expect((await db.query("select to_regprocedure('public.est_traversee_organisation(uuid)') is not null ok")).rows[0].ok).toBe(true);
  });
  it("refuse l'encaissement direct et la RPC SECURITY DEFINER sans effet financier",async()=>{
    await expect(essai("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,10)",[org,bail])).rejects.toThrow(/Traversée en lecture seule/);
    await expect(essai("select public.encaisser_reste_atomique($1,$2,$3,$4,840,0)",[org,bail,appel,randomUUID()])).rejects.toThrow(/Traversée en lecture seule/);
    expect((await db.query("select count(*)::int n from public.encaissements where bail_id=$1",[bail])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.ecritures where bail_id=$1",[bail])).rows[0].n).toBe(0);
  });
  it("préserve la consultation mais refuse les mutations de dossier et du profil client",async()=>{
    expect((await db.query("select id from public.baux where id=$1",[bail])).rowCount).toBe(1);
    await expect(essai("update public.persons set nom='TEST changé' where id=$1",[personne])).rejects.toThrow(/Traversée en lecture seule/);
    await expect(essai("update public.organizations set iban='TEST nouvel IBAN' where id=$1",[org])).rejects.toThrow(/Traversée en lecture seule/);
    await expect(essai("insert into storage.objects(bucket_id,name) values('documents',$1)",[`${org}/test.pdf`])).rejects.toThrow();
  });
  it("ne transforme pas la lecture des messages en accusé de lecture du gérant",async()=>{
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    await db.query("insert into public.messages(organization_id,person_id,auteur,texte) values($1,$2,'locataire','TEST message')",[org,personne]);
    await agir(sa);
    const r=await db.query("select * from public.messages_personne($1,$2)",[org,personne]);
    expect(r.rows).toHaveLength(1);expect(r.rows[0].lu_le).toBeNull();
  });
  it("le gérant conserve son encaissement normal",async()=>{
    await agir(gerant);
    const r=(await essai("select public.encaisser_reste_atomique($1,$2,$3,$4,840,0) r",[org,bail,appel,randomUUID()])).rows[0].r;
    expect(r).toMatchObject({statut:'enregistre',montant:840});
  });
  it("la préparation seule n'ouvre aucun droit, l'exécution est unique et tracée",async()=>{
    const id=await preparer();
    await expect(essai("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,10)",[org,bail])).rejects.toThrow(/Traversée en lecture seule/);
    const r=(await essai("select public.executer_encaissement_support($1) r",[id])).rows[0].r;
    expect(r).toMatchObject({statut:'enregistre',montant:840,rejoue:false});
    expect((await essai("select public.executer_encaissement_support($1) r",[id])).rows[0].r).toMatchObject({statut:'enregistre',rejoue:true});
    expect((await db.query("select count(*)::int n from public.encaissements where bail_id=$1",[bail])).rows[0].n).toBe(1);
    await expect(essai("update public.persons set nom='TEST changé' where id=$1",[personne])).rejects.toThrow(/Traversée en lecture seule/);
    await db.query("reset role");
    const audit=(await db.query("select account_id,action,details from public.audit_log where organization_id=$1 and action like 'support_encaissement_%' order by action",[org])).rows;
    expect(audit).toHaveLength(2);
    expect(audit.every((r)=>r.account_id===sa && r.details.auteur_reel===sa && r.details.motif.length>=10 && r.details.expire_le)).toBe(true);
    expect((await db.query("select transaction_active from support_interne.gestes_encaissement where id=$1",[id])).rows[0].transaction_active).toBeNull();
  });
  it("une préparation ne retient pas un appel supprimé et ne permet plus son exécution",async()=>{
    const id=await preparer();
    // Cycle de vie SQL autorisé, sans identité applicative (aucun contournement du SA).
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    expect((await db.query("delete from public.appels_loyer where id=$1",[appel])).rowCount).toBe(1);
    expect((await db.query("select count(*)::int n from support_interne.gestes_encaissement where id=$1",[id])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from pg_constraint where conrelid='support_interne.gestes_encaissement'::regclass and contype='f'")).rows[0].n).toBe(0);
    await agir(sa);
    await expect(essai("select public.executer_encaissement_support($1)",[id])).rejects.toThrow(/Appel de loyer introuvable/);
    expect((await db.query("select count(*)::int n from public.encaissements where bail_id=$1",[bail])).rows[0].n).toBe(0);
  });
  it("le parrainage reste réservé au membre du filleul, jamais à la traversée de supervision",async()=>{
    const code=(await db.query("select code_parrainage from public.organizations where id=$1",[autreOrg])).rows[0].code_parrainage;
    await expect(essai("select public.enregistrer_parrainage($1,$2)",[org,code])).rejects.toThrow(/Traversée en lecture seule/);
    expect((await db.query("select count(*)::int n from public.parrainages where filleul_organization_id=$1",[org])).rows[0].n).toBe(0);
    await agir(gerant);
    expect((await essai("select public.enregistrer_parrainage($1,$2) id",[org,code])).rows[0].id).toBeTruthy();
  });
  it("refuse expiration, autre auteur, perte du second facteur et motif vide",async()=>{
    await expect(essai("select * from public.preparer_encaissement_support($1,$2,$3,840,0,'')",[org,bail,appel])).rejects.toThrow(/motif/);
    const id=await preparer();
    await agir(autreSa);await expect(essai("select public.executer_encaissement_support($1)",[id])).rejects.toThrow(/introuvable/);
    await agir(sa,'aal1');await expect(essai("select public.executer_encaissement_support($1)",[id])).rejects.toThrow(/double vérification/);
    await db.query("reset role");
    await db.query("update support_interne.gestes_encaissement set cree_le=clock_timestamp()-interval '6 minutes',expire_le=clock_timestamp()-interval '1 minute' where id=$1",[id]);
    await agir(sa);await expect(essai("select public.executer_encaissement_support($1)",[id])).rejects.toThrow(/expiré/);
  });
  it("refuse un mélange d'organisations et n'expose pas l'autorisation interne",async()=>{
    await expect(essai("select * from public.preparer_encaissement_support($1,$2,$3,840,0,'TEST mauvais périmètre')",[autreOrg,bail,appel])).rejects.toThrow(/introuvable/);
    await expect(essai("select * from support_interne.gestes_encaissement")).rejects.toThrow(/permission denied/);
    await agir(gerant);await expect(essai("select * from public.preparer_encaissement_support($1,$2,$3,840,0,'TEST motif client')",[org,bail,appel])).rejects.toThrow(/double vérification/);
  });
  it("le support relit le solde et ne valide pas une ancienne proposition",async()=>{
    const id=await preparer();
    await agir(gerant);await db.query("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,300)",[org,bail]);
    await agir(sa);expect((await essai("select public.executer_encaissement_support($1) r",[id])).rows[0].r).toMatchObject({statut:'solde_modifie',montant:0});
    expect((await db.query("select sum(montant)::int montant from public.encaissements where bail_id=$1",[bail])).rows[0].montant).toBe(300);
  });
  it("préserve les gestes de console sur l'état de l'organisation",async()=>{
    await expect(essai("update public.organizations set status='suspendue' where id=$1",[org])).rejects.toThrow(/Traversée en lecture seule/);
    expect((await essai("select public.controler_organisation($1,'suspendre',null,'TEST suspension motivée') r",[org])).rows[0].r).toBe('suspendue');
    expect((await essai("select public.controler_organisation($1,'reactiver',null,'TEST retour actif') r",[org])).rows[0].r).toBe('active');
  });
  it("la maintenance de console ne laisse aucun permis à un geste utilisateur ou à un autre acteur",async()=>{
    await essai("select * from public.maintenance_artisans()");
    await expect(essai("update public.persons set nom='TEST après maintenance' where id=$1",[personne])).rejects.toThrow(/Traversée en lecture seule/);
    await agir(autreSa);
    await expect(essai("update public.persons set nom='TEST autre acteur' where id=$1",[personne])).rejects.toThrow(/Traversée en lecture seule/);
    await expect(essai("select support_interne.preparer_maintenance_artisans()")).rejects.toThrow(/permission denied/);
    await db.query("reset role");
    expect((await db.query("select count(*)::int n from support_interne.maintenance_lignes where transaction_id=txid_current()")).rows[0].n).toBe(0);
  });
  it("refuse l'auto-attribution de gérance par RPC et par mise à jour directe",async()=>{
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    const agence=(await db.query("insert into public.organizations(name,type,status) values('TEST agence T10','agence','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'agent','inactive')",[sa,agence]);
    await agir(sa);
    await expect(essai("update public.memberships set status='active' where account_id=$1 and organization_id=$2",[sa,agence])).rejects.toThrow(/contourner la lecture seule/);
    await expect(essai("select * from public.inviter_agent($1,$2)",[agence,`${sa}@test.local`])).rejects.toThrow(/contourner la lecture seule/);
  });
  it("couvre les nouvelles tables métier avec l'installateur existant",async()=>{
    await db.query("reset role; select set_config('request.jwt.claims','{}',true)");
    await db.query("create table public.test_d08_nouveau(id uuid,organization_id uuid); select public.poser_gardes_abonnement(); grant insert on public.test_d08_nouveau to authenticated");
    await agir(sa);await expect(essai("insert into public.test_d08_nouveau values(gen_random_uuid(),$1)",[org])).rejects.toThrow(/Traversée en lecture seule/);
  });
});
