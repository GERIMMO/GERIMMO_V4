import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { baseApiFictive } from "./base-api-fictive";

// Un nouveau dossier indépendant par scénario. Le signalement, les décisions et
// les documents de la mission sont ensuite créés depuis les portails.
export async function locationIntervention(db: Client, artisan: string, sci: boolean, nouveauDossier = false) {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const id = async (sql: string, args: unknown[]) => String((await db.query(sql,args)).rows[0].id);
  await db.query("begin");
  try {
    const responsable = await id("select id from auth.users where email=$1",["proprietaire@example.com"]);
    const demonstration = !nouveauDossier && new URL(process.env.SUPALOCAL_DB!).pathname === "/gerimmo_ci_demo_vente_api";
    const email = demonstration ? (sci ? "sam.riviere" : "jeanne.martin") + "@example.invalid" : "sam.riviere+"+randomUUID()+"@example.invalid";
    const mot=demonstration ? "Gerimmo-Demo-2026" : randomUUID()+"!A";
    if (demonstration) {
      const precedent = await db.query(`select b.organization_id, b.lot_id, b.id as bail_id from baux b
        join persons p on p.id=b.locataire_principal and p.organization_id=b.organization_id
        join auth.users u on u.id=p.account_id where u.email=$1 and b.etat='actif'`,[email]);
      if (precedent.rowCount === 1) {
        await db.query("commit");
        return {...precedent.rows[0],email,mot};
      }
    }
    const occupant=await id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,
      extensions.crypt($2,extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','') returning id`,[email,mot]);
    const nom = sci ? "SCI des Amandiers" : "Élise Morel";
    // Un seul espace direct par compte ; les titulaires sont portés par les détentions.
    const organisation = await id("select organization_id as id from memberships where account_id=$1 and role='proprietaire_direct' and status='active'", [responsable]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'locataire') on conflict do nothing",[organisation,occupant]);
    const bien = await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Maison des Amandiers','maison','6 rue des Amandiers','75012','Paris') returning id",[organisation]);
    const lot = await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Maison des Amandiers','loue') returning id",[organisation,bien]);
    const titulaire = await id("insert into persons(organization_id,nom,qualite,siren,address_line1,postal_code,city) values($1,$2,$3,$4,'6 rue des Amandiers','75012','Paris') returning id",[organisation,nom,sci?"SCI":"Personne physique",sci?"123456789":null]);
    const personne = await id("insert into persons(organization_id,account_id,nom,prenom,email) values($1,$2,$3,$4,$5) returning id",[organisation,occupant,sci?'Rivière':'Martin',sci?'Sam':'Jeanne',email]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)",[organisation,lot,titulaire]);
    const bail = await id("insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-90,600,40) returning id",[organisation,lot,personne]);
    await db.query("insert into artisan_agences(organization_id,artisan_id) values($1,$2) on conflict do nothing",[organisation,artisan]);
    await db.query("commit");
    return {organization_id:organisation,lot_id:lot,bail_id:bail,email,mot};
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}
