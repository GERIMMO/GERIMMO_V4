import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";
import { supprimerOrganisationDeTest } from "../tests/fixtures/nettoyer-organisation";

test.use({ storageState:path.join(__dirname,".auth","superadmin.json"), viewport:{width:390,height:844} });
test("offrir deux mois : aperçu sans effet, confirmation et preuve après rechargement",async({page},info)=>{
 const cible=process.env.SUPALOCAL_DB;
 test.skip(!cible,"Base API locale fictive requise");
 const url=new URL(cible!);
 if(!["localhost","127.0.0.1"].includes(url.hostname)||!/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base locale isolée uniquement");
 const db=new Client({connectionString:cible});await db.connect();const compte=randomUUID();let org:string|undefined;
 try {
  await db.query("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values($1,$2,'{}','{}',now())",[compte,`${compte}@test.local`]);
  await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing",[compte,`${compte}@test.local`]);
  org=(await db.query("insert into public.organizations(name,type,status,essai_fin) values('Cadeau E2E fictif','proprietaire_direct','essai',public.aujourdhui_paris()+10) returning id")).rows[0].id;
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[compte,org]);
  await sansSyntheseAlertes(page);await page.goto(`/admin/comptes/${compte}`);
  await page.getByLabel("Mois offerts",{exact:true}).fill("2");
  await page.getByLabel("Motif interne",{exact:true}).fill("Compensation après un bug fictif");
  await page.getByRole("button",{name:"Vérifier le cadeau",exact:true}).click();
  await expect(page.getByText(/Accès offert jusqu’au/)).toBeVisible();
  await expect(page.getByLabel("Mois offerts",{exact:true})).toHaveValue("2");
  expect((await db.query("select count(*)::int n from public.mois_offerts where organization_id=$1",[org])).rows[0].n).toBe(0);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  await page.screenshot({path:info.outputPath("mois-offerts-apercu-mobile.png"),fullPage:true});
  await page.getByLabel("Je confirme ce cadeau.",{exact:true}).check();
  await page.getByRole("button",{name:"Confirmer les mois offerts",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"2 mois offerts : accès"})).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Cadeau E2E fictif · 2 mois offerts/)).toBeVisible();
  expect((await db.query("select count(*)::int n from public.mois_offerts where organization_id=$1",[org])).rows[0].n).toBe(1);
 } finally {await supprimerOrganisationDeTest(db,org,[compte]);await db.end();}
});
