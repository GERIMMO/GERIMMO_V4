import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const empreinte = (texte:string) => createHash("sha256").update(texte).digest("hex");

it.skipIf(!url)("un préavis exige la bonne adresse confirmée et sa livraison avant de compter pour une fermeture", async () => {
  const db = new Client({connectionString:url});
  await db.connect();
  try {
    await db.query("begin");
    const compte=randomUUID(), email=compte+"@example.invalid";
    await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
      raw_user_meta_data,created_at,updated_at,last_sign_in_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'x',now(),'{}','{"cgu_version":"2026-11-15"}',
      now()-interval '23 months',now(),now()-interval '23 months','','','','','')`,[compte,email]);
    const {rows:[r]}=await db.query(`select etape,nature,organisation,titulaire,derniere_activite_le::text activite,suppression_le::text suppression
      from public.comptes_inactifs_a_prevenir('2026-10-24',1000) where account_id=$1`,[compte]);
    expect(r?.etape).toBe("j60");
    const c={...r,id:compte,type:"avertissement_inactivite",version:"2026-10-24",destinataire:empreinte(email)};
    const calcul=async(contexte:unknown)=>(await db.query("select public.empreinte_metier_courriel(null,$1) preuve",[contexte])).rows[0].preuve;
    expect(await calcul({...c,destinataire:empreinte("autre@example.invalid")})).toBeNull();
    const preuve=await calcul(c);
    expect(preuve).toMatch(/^[a-f0-9]{64}$/);
    const id=empreinte(compte);
    await db.query(`insert into public.courriels_durables(id,empreinte,etat,fournisseur_id,contexte_metier,empreinte_metier,finalisation_etat)
        values ($1,$1,'accepte',$2,$3,$4,'en_attente')`,[id,"test-"+compte,c,preuve]);
    const finaliser=async()=>(await db.query("select public.finaliser_courriel_metier($1) ok",[id])).rows[0].ok;
    expect(await finaliser()).toBe(false);
    const impaye=empreinte(compte+"-impaye");
    await db.query(`insert into public.courriels_durables(id,empreinte,etat,fournisseur_id,contexte_metier,finalisation_etat)
       values ($1,$1,'accepte',$2,'{"type":"relance_abonnement","palier":0}','en_attente')`,[impaye,"impaye-"+compte]);
    expect((await db.query("select id from public.courriels_finalisations_a_reprendre() where id=any($1)",[[id,impaye]])).rows).toEqual([]);
    const marques=()=>db.query("select etape from public.avertissements_inactivite where account_id=$1",[compte]);
    expect((await marques()).rows).toEqual([]);
    await db.query("update public.courriels_durables set etat='livre' where id=$1",[id]);
    expect(await finaliser()).toBe(true);
    expect(await finaliser()).toBe(true);
    expect((await marques()).rows).toEqual([{etape:"j60"}]);
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
