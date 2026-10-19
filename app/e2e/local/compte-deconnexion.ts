import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

/** Une déconnexion globale ne doit pas fermer la session partagée des autres tests. */
export async function ouvrirCompteDeconnexion(page: Page, persona: string) {
  const url = process.env.SUPALOCAL_DB ?? "";
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url)
    || !/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(api)) {
    throw new Error("Le compte de déconnexion exige le banc fictif local.");
  }
  const source = [persona === "proprietaire" ? persona : `${persona}.alpha`, "gerimmo-demo.fr"].join("@");
  const id = randomUUID();
  const adresse = [`deconnexion-${id}`, "example.invalid"].join("@");
  const motDePasse = randomUUID();
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rowCount } = await db.query(`insert into auth.users
      (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      select $1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),
        raw_app_meta_data,raw_user_meta_data from auth.users where email=$4`, [id, adresse, motDePasse, source]);
    if (rowCount !== 1) throw new Error("Persona locale absente.");
    await db.query(`insert into public.memberships(account_id,organization_id,role,status)
      select $1,m.organization_id,m.role,m.status from public.memberships m
      join auth.users u on u.id=m.account_id where u.email=$2 and m.status='active'`, [id, source]);
  } finally { await db.end(); }
  // Ce compte sans donnée métier reste dans la base jetable du chantier ; il ne remplace aucun compte permanent.
  await page.context().clearCookies();
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail", { exact: true }).fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/(espaces?|agence|locataire)\b/);
}
