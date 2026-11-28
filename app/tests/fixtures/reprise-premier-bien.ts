import { randomUUID } from "node:crypto";
import type { Client } from "pg";

export async function preparerEssaiExpireSansBien(db: Client) {
  const compte = randomUUID();
  const email = compte + "@example.test";
  await db.query("insert into auth.users(id,email,aud,role) values($1,$2,'authenticated','authenticated')", [compte, email]);
  await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing", [compte, email]);
  const nouvelEspace = async () => (await db.query(
    "insert into public.organizations(name,type,status,essai_fin,grille_tarifaire,address_line1,postal_code,city,email_contact) values('Espace fictif','proprietaire_direct','essai',public.aujourdhui_paris()+1,'2026-09-28','1 rue du Test','69001','Lyon',$1) returning id", [email],
  )).rows[0].id;
  const org = await nouvelEspace();
  const autre = await nouvelEspace();
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
  await db.query("select set_config('gerimmo.systeme','on',true)");
  await db.query("update public.organizations set essai_fin=public.aujourdhui_paris()-1 where id in ($1,$2)", [org, autre]);
  await db.query("select set_config('gerimmo.systeme','off',true)");

  async function commeTitulaire() {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated" })]);
  }
  return { compte, org, autre, commeTitulaire };
}

export async function creerPremierBienFictif(db: Client, org: string) {
  const creation = await db.query("select public.creer_bien_verifie($1,$2,$3::jsonb,null) as bien", [
    org, randomUUID(), JSON.stringify({
      nom: "Premier logement fictif", type: "appartement", address_line1: "1 rue du Test",
      postal_code: "69001", city: "Lyon", annee_construction: 1998,
      parties_communes: "Hall", acces_tic: "Fibre", lots: [{ surface_m2: 42, pieces: 2 }],
    }),
  ]);
  return creation.rows[0].bien;
}
