import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

const cible = process.env.SUPALOCAL_DB;
test.describe("Abonnement nouvelle grille — parcours sans débit", () => {
  test.skip(!cible, "La base API locale jetable est requise.");
  test.use({ storageState: { cookies: [], origins: [] } });
  let db: Client;
  const org = randomUUID();
  const compte = randomUUID();
  const email = `recette-tarification-${compte}@test.local`;
  test.beforeAll(async () => {
    const url = new URL(cible!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base locale isolée obligatoire.");
    db = new Client({ connectionString: cible }); await db.connect();
    await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      select instance_id,$1,aud,role,$2,encrypted_password,now(),raw_app_meta_data,'{}'::jsonb,now(),now(),'','','','','' from auth.users where email='proprietaire@gerimmo-demo.fr'`, [compte,email]);
    await db.query("insert into public.organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,'Recette tarification propriétaire','proprietaire_direct','essai','1 rue Fictive','69003','Lyon',$2)", [org,email]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte,org]);
  });
  test.afterAll(async () => { await db?.end(); });
  test.beforeEach(async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto('/connexion');
    await page.locator('#email').fill(email);
    await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE ?? 'Gerimmo-Demo-2026');
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await page.waitForURL(/\/(espaces|agence)(\/|$)/);
  });
  test("essai sans carte et annuel réellement prélevé, refus lisible si paiement non configuré", async ({ page }) => {
    await page.goto(`/agence/${org}/abonnement`);
    await expect(page.getByRole("heading", { name: "14 jours pour essayer" })).toBeVisible();
    await expect(page.locator("main")).toContainText("Aucun prélèvement sans souscription explicite");
    await page.getByLabel("Biens à couvrir", { exact: true }).fill("25");
    await page.getByLabel("Rythme de paiement").selectOption("annuel");
    await expect(page.getByText(/Patrimoine · 349,90/)).toContainText("prélevé en une fois");
    await page.getByRole("button", { name: "Voir le montant et la date avant de confirmer" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("paiement n’est pas encore configurée");
    await expect(page.getByRole("button", { name: "Confirmer ce récapitulatif" })).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBe(0);
    expect((await db.query("select count(*)::integer as n from public.abonnements_v2 where organization_id=$1 and stripe_subscription_id is not null",[org])).rows[0].n).toBe(0);
  });
  test("l’essai terminé à zéro bien reste consultable, sans gratuité permanente ni fausse confirmation", async ({ page }) => {
    await db.query("begin");
    await db.query("select set_config('gerimmo.systeme','on',true)");
    await db.query("update public.organizations set essai_fin_v2=now()-interval '1 day',essai_fin=current_date-1 where id=$1",[org]);
    await db.query("commit");
    await page.goto(`/agence/${org}/abonnement?paiement=ok`);
    await expect(page.locator("main")).toContainText("Lecture seule");
    await expect(page.locator("main")).toContainText("Vos données restent consultables et exportables");
    await expect(page.locator("main")).not.toContainText("votre paiement est enregistré");
    await expect(page.locator("main")).not.toContainText("bien — offert");
    await expect(page.getByText(/Solo · 5,99/)).toBeVisible();
    expect((await db.query("select count(*)::integer as n from public.abonnements_v2 where organization_id=$1 and stripe_subscription_id is not null",[org])).rows[0].n).toBe(0);
    await page.screenshot({path:"e2e/.results/abonnement-v2-lecture-seule.png",fullPage:true});
  });
});
