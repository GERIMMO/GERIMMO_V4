import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

const cible = process.env.SUPALOCAL_DB;
test.describe("Propriétaire invité — lien accepté, séparation et révocation", () => {
  test.skip(!cible, "La base API locale jetable est requise.");
  test.use({ storageState: "e2e/.auth/admin.json" });
  let db: Client;
  const org = randomUUID(), bien = randomUUID(), lot = randomUUID(), personne = randomUUID(), mandat = randomUUID();
  test.beforeAll(async () => {
    const url = new URL(cible!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base locale isolée obligatoire.");
    db = new Client({ connectionString: cible }); await db.connect();
    await db.query("insert into public.organizations(id,tarification_version,name,type,status) values($1,'historique','Agence invitation recette','agence','active')", [org]);
    await db.query("insert into public.memberships(account_id,organization_id,role) select id,$1,'admin_agence' from public.accounts where email='admin.alpha@gerimmo-demo.fr'", [org]);
    await db.query("insert into public.persons(id,organization_id,nom,email) values($1,$2,'Bailleur invité recette','proprietaire@gerimmo-demo.fr')", [personne,org]);
    await db.query("insert into public.biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'Bien confié recette','appartement','3 rue fictive','69003','Lyon')", [bien,org]);
    await db.query("insert into public.lots(id,organization_id,bien_id,nom) values($1,$2,$3,'Lot confié recette')", [lot,org,bien]);
    await db.query("insert into public.detentions(organization_id,person_id,lot_id,quote_part,date_debut) values($1,$2,$3,100,current_date-90)", [org,personne,lot]);
    await db.query("insert into public.mandats(id,organization_id,person_id,date_debut) values($1,$2,$3,current_date-90)", [mandat,org,personne]);
    await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,date_debut,taux_honoraires) values($1,$2,$3,current_date-90,7)", [org,mandat,lot]);
    await db.query("update public.mandats set etat='actif' where id=$1", [mandat]);
    await db.query("insert into public.rapports_gestion(organization_id,mandat_id,mois,statut,net) values($1,$2,date_trunc('month',current_date),'envoye',500)", [org,mandat]);
  });
  test.afterAll(async () => { await db?.end(); });
  test("l’agence partage un lien, le bailleur consulte sans double abonnement et l’accès se ferme", async ({ page,browser }) => {
    test.setTimeout(120_000);
    await sansSyntheseAlertes(page);
    await page.goto(`/agence/${org}/personnes/${personne}`);
    const section = page.locator('section[aria-labelledby="acces-proprietaire"]');
    await expect(section).toBeVisible();
    await section.getByLabel(/Je confirme l’accès en consultation/).check();
    await section.getByRole("button",{name:"Préparer le lien propriétaire"}).click();
    const lien = section.getByLabel("Lien à copier et transmettre");
    await expect(lien).toHaveValue(/\/proprietaire-invite\/accepter\?invitation=[0-9a-f]{64}$/);
    await expect(section.getByRole("status")).toContainText("Aucun e-mail n’a été envoyé");
    const contexte = await browser.newContext({ storageState: "e2e/.auth/proprietaire.json" });
    const invite = await contexte.newPage();
    try {
      await sansSyntheseAlertes(invite);
      await invite.goto(await lien.inputValue());
      await invite.getByLabel(/Ouvrir mon accès en consultation/).check();
      await invite.getByRole("button",{name:"Accepter l’invitation"}).click();
      await expect(invite).toHaveURL(new RegExp(`/proprietaire-invite/${org}$`));
      await expect(invite.getByRole("heading",{name:"Mes biens confiés",exact:true})).toBeVisible();
      await expect(invite.locator("main")).toContainText("Lot confié recette");
      await expect(invite.locator("main")).toContainText(/500,00\s*€/);
      await expect(invite.getByRole("button",{name:/souscrire|payer/i})).toHaveCount(0);
      expect(await debordementHorizontal(invite)).toBe(0);
      await invite.getByRole("link",{name:"Mes espaces",exact:true}).click();
      await expect(invite.locator(`a[href="/proprietaire-invite/${org}"]`)).toBeVisible();
      await expect(invite.locator('a[href="/agence/3c1d1e95-3570-400b-8012-44530be145b1"]')).toBeVisible();
      await invite.goto('/proprietaire-invite/b6332d4f-1ef8-45d7-b1cb-9628381a7527');
      await expect(invite.getByRole("heading",{name:"Accès propriétaire indisponible"})).toBeVisible();
      await page.reload();
      await section.getByLabel("Fermer l’accès et invalider le lien de cette personne.").check();
      await section.getByRole("button",{name:"Fermer l’accès propriétaire"}).click();
      await expect(section.getByRole("status")).toContainText("ont été fermés");
      await invite.goto(`/proprietaire-invite/${org}`);
      await expect(invite.getByRole("heading",{name:"Accès propriétaire indisponible"})).toBeVisible();
      expect((await db.query("select count(*)::int as n from public.memberships m join public.accounts a on a.id=m.account_id where m.organization_id=$1 and a.email='proprietaire@gerimmo-demo.fr'",[org])).rows[0].n).toBe(0);
    } finally { await contexte.close(); }
  });
});
