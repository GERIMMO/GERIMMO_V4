import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// PROPRIÉTAIRE : SON AGENDA PORTE SES ÉCHÉANCES (audit palier 1 du 22/11/2026, P2-06).
//
// Un espace fictif propre à l'essai : deux logements loués.
//   - Camille : un loyer de 800 € dont l'échéance est aujourd'hui, et un état des lieux d'entrée daté d'aujourd'hui,
//     pas encore signé ;
//   - Zoé : un congé enregistré et une date de fin inscrite au bail, le même autre jour du mois.
// Le parcours vérifie, sur téléphone puis sur ordinateur :
//   1. le calendrier compte les échéances du mois et marque les deux jours concernés ;
//   2. le panneau du jour dit chaque échéance (ce qu'elle est, pour qui, où en est-on) et mène au bon écran ;
//   3. un loyer enregistré entre-temps passe à « Reçu » ;
//   4. rien n'est créé ni modifié par l'agenda (lecture seule).
// L'espace, son compte, ses logements et ses loyers sont fictifs ; tout est retiré à la fin.

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 });

async function tientDansLEcran(p: Page, cible: Locator) {
  await cible.scrollIntoViewIfNeeded();
  const boite = (await cible.boundingBox())!;
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(p.viewportSize()!.width + 1);
  expect(await cible.evaluate((el) => {
    for (let n = el.parentElement; n && n.tagName !== "BODY"; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== "visible" && (n.scrollWidth > n.clientWidth + 1 || n.scrollLeft > 0)) return `${n.tagName}.${n.className}`;
    }
    return null;
  })).toBeNull();
  expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
}

test("l'agenda du propriétaire montre loyers, états des lieux, congé et fin de bail", async ({ page }, info) => {
  test.setTimeout(240_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  expect(LOCAUX).toContain(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname);

  const db = new Client({ connectionString: url });
  await db.connect();
  const [ORG, compte, bailleur, bien, lotA, lotB, camille, zoe, bailA, bailB, appel, edl, conge] = Array.from({ length: 13 }, () => randomUUID());
  const email = `agenda-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const suffixe = lotA.slice(0, 6);
  const nomA = `TEST Agenda T2 ${suffixe}`, nomB = `TEST Agenda Studio ${suffixe}`;
  const aujourdHui = (await db.query("select public.aujourdhui_paris()::text j")).rows[0].j as string;
  // Un autre jour du même mois, jamais aujourd'hui.
  const autreJour = `${aujourdHui.slice(0, 8)}${aujourdHui.slice(8) === "15" ? "16" : "15"}`;
  const compter = async () => (await db.query(
    "select (select count(*) from appels_loyer where organization_id=$1)::int appels, (select count(*) from encaissements where organization_id=$1)::int reglements, (select count(*) from etats_des_lieux where organization_id=$1)::int edl, (select count(*) from conges where organization_id=$1)::int conges, (select count(*) from alerts where organization_id=$1)::int alertes", [ORG])).rows[0];

  try {
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','essai',current_date+14,'2 rue de recette','75001','Paris')", [ORG, `TEST Agenda ${suffixe}`]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')", [compte, email, motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [ORG, compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,address_line1,postal_code,city) values($1,$2,'Exemple','Jo','2 rue de recette','75001','Paris')", [bailleur, ORG]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, `TEST Agenda ${suffixe}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$3,$4,$5,'loue'),($2,$3,$4,$6,'loue')", [lotA, lotB, ORG, bien, nomA, nomB]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$3,'Fictif','Camille','camille@example.invalid'),($2,$3,'Lambert','Zoé','zoe@example.invalid')", [camille, zoe, ORG]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$4,100),($1,$3,$4,100)", [ORG, lotA, lotB, bailleur]);
    await db.query(`insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,date_fin,loyer_hc,charges,jour_echeance) values
      ($1,$3,$4,$6,'nu','actif',public.aujourdhui_paris()-10,null,750,50,5),
      ($2,$3,$5,$7,'nu','preavis',$8::date - interval '3 years',$8::date,600,50,5)`, [bailA, bailB, ORG, lotA, lotB, camille, zoe, autreJour]);
    await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,$3,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris(),750,50,800)", [appel, ORG, bailA]);
    await db.query("insert into etats_des_lieux(id,organization_id,bail_id,type,date_edl) values($1,$2,$3,'entree',public.aujourdhui_paris())", [edl, ORG, bailA]);
    await db.query("insert into conges(id,organization_id,bail_id,par,date_premiere_presentation,preavis_mois,date_effet) values($1,$2,$3,'locataire',$4::date - 30,1,$4::date)", [conge, ORG, bailB, autreJour]);
    await db.query("commit");
    const avant = await compter();

    await page.setViewportSize({ width: 390, height: 950 });
    await sansSyntheseAlertes(page);
    await connecterVers(page, email, motDePasse, `/espace/${ORG}/agenda`);

    // 1. Le calendrier du mois.
    await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main:visible").first()).toContainText("Vos rendez-vous d’intervention et vos échéances : loyers, états des lieux, fins de bail.");
    await expect(page.locator("[data-compte-mois]:visible")).toHaveText("0 rendez-vous ce mois-ci · 4 échéances");
    const caseDuJour = page.locator('a[aria-current="date"]:visible');
    await expect(caseDuJour).toHaveAttribute("aria-label", /aujourd’hui, 0 rendez-vous, 2 échéances$/);
    await expect(caseDuJour.locator('[data-echeances-jour="2"]')).toBeVisible();
    await tientDansLEcran(page, caseDuJour);
    await expect(page.locator("[data-echeances-illisibles]")).toHaveCount(0);

    // 2. Le panneau du jour : le loyer et l'état des lieux d'aujourd'hui.
    const panneau = page.locator("[data-echeances-du-jour]:visible");
    await expect(panneau.getByRole("heading", { level: 3, name: "Échéances du jour" })).toBeVisible();
    const lignes = panneau.locator("a[data-echeance]");
    await expect(lignes).toHaveCount(2);
    const loyer = panneau.locator('a[data-echeance="loyer"]');
    await expect(loyer).toContainText("Loyer attendu : 800,00 €");
    await expect(loyer).toContainText(`Camille Fictif · ${nomA}`);
    await expect(loyer.locator("[data-etat-echeance]")).toHaveText("À recevoir");
    await expect(loyer).toHaveAttribute("data-a-faire", "true");
    await expect(loyer).toHaveAttribute("href", `/espace/${ORG}/baux/${bailA}#loyers`);
    const etatDesLieux = panneau.locator('a[data-echeance="edl"]');
    await expect(etatDesLieux).toContainText("État des lieux d’entrée");
    await expect(etatDesLieux.locator("[data-etat-echeance]")).toHaveText("À établir et signer");
    await expect(etatDesLieux).toHaveAttribute("href", `/espace/${ORG}/baux/${bailA}/edl/${edl}`);
    await expect(page.locator("#rendez-vous-du-jour")).toContainText("Aucun rendez-vous d’intervention ce jour.");
    await tientDansLEcran(page, loyer);
    await tientDansLEcran(page, etatDesLieux);
    await page.screenshot({ path: info.outputPath("agenda-echeances-telephone.png"), fullPage: true });

    // L'autre jour : le congé de Zoé et la date de fin de son bail.
    const autreCase = page.locator(`a[href*="jour=${autreJour}"]:visible`);
    await expect(autreCase).toHaveAttribute("aria-label", /, 0 rendez-vous, 2 échéances$/);
    await autreCase.click();
    await expect(page).toHaveURL(new RegExp(`jour=${autreJour}`));
    await expect(lignes).toHaveCount(2, { timeout: 30_000 });
    const depart = panneau.locator('a[data-echeance="conge"]');
    await expect(depart).toContainText("Départ prévu : congé donné par le locataire");
    await expect(depart).toContainText(`Zoé Lambert · ${nomB}`);
    await expect(depart).toHaveAttribute("href", `/espace/${ORG}/baux/${bailB}`);
    const fin = panneau.locator('a[data-echeance="fin_bail"]');
    await expect(fin).toContainText("Date de fin inscrite au bail");
    await expect(fin.locator("[data-etat-echeance]")).toHaveCount(0);
    await tientDansLEcran(page, depart);

    // Sur ordinateur, même contenu, rien ne déborde.
    await page.setViewportSize({ width: 1440, height: 950 });
    await tientDansLEcran(page, depart);
    await page.screenshot({ path: info.outputPath("agenda-echeances-ordinateur.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 950 });

    // 4. L'agenda n'a rien écrit.
    expect(await compter()).toEqual(avant);

    // 3. Le loyer est enregistré ailleurs (ici, directement en base) : l'agenda le dit « Reçu ».
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode,note) values($1,$2,800,public.aujourdhui_paris(),'virement','Parcours agenda')", [ORG, bailA]);
    await page.goto(`/espace/${ORG}/agenda`);
    await expect(loyer.locator("[data-etat-echeance]")).toHaveText("Reçu", { timeout: 30_000 });
    await expect(loyer).toHaveAttribute("data-a-faire", "false");

    // Une échéance mène à l'écran concerné.
    await loyer.click();
    await page.waitForURL(`**/espace/${ORG}/baux/${bailA}**`, { timeout: 30_000 });

    // Le mois suivant n'a aucune de ces échéances.
    await page.goto(`/espace/${ORG}/agenda`);
    await page.getByRole("link", { name: "Mois suivant", exact: true }).click();
    await expect(page.locator("[data-compte-mois]:visible")).toHaveText("0 rendez-vous ce mois-ci · 0 échéance", { timeout: 30_000 });
    await expect(page.locator("[data-echeances-du-jour]")).toHaveCount(0);
  } finally {
    await db.query("rollback").catch(() => undefined);
    try {
      await db.query("begin");
      await db.query("delete from conges where organization_id=$1", [ORG]);
      await db.query("delete from etats_des_lieux where organization_id=$1", [ORG]);
      for (const bail of [bailA, bailB]) {
        await db.query("delete from relances where organization_id=$1 and bail_id=$2", [ORG, bail]);
        await db.query("delete from commandes_encaissement_reste where bail_id=$1", [bail]);
        await db.query("delete from fiscal_encaissements_composantes where organization_id=$1 and ecriture_id in (select id from ecritures where bail_id=$2)", [ORG, bail]);
        await db.query("delete from ecritures where bail_id=$1", [bail]);
        await db.query("delete from encaissements where bail_id=$1", [bail]);
        await db.query("delete from quittances where bail_id=$1", [bail]);
        await db.query("delete from appels_loyer where bail_id=$1", [bail]);
        await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2", [ORG, bail]);
      }
      await db.query("delete from detentions where lot_id in ($1,$2)", [lotA, lotB]);
      await db.query("delete from baux where id in ($1,$2)", [bailA, bailB]);
      await db.query("delete from lots where id in ($1,$2)", [lotA, lotB]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("delete from persons where id in ($1,$2)", [camille, zoe]);
      await db.query("delete from memberships where organization_id=$1", [ORG]);
      await db.query("delete from persons where id=$1", [bailleur]);
      await db.query("delete from audit_log where organization_id=$1 or account_id=$2", [ORG, compte]);
      await db.query("delete from alerts where organization_id=$1", [ORG]);
      await db.query("delete from organizations where id=$1", [ORG]);
      await db.query("delete from auth.users where id=$1", [compte]);
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; } finally { await db.end(); }
  }
});
