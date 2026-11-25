import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { AIDE_DEPART_EPOUX_PACS, AVERTISSEMENT_AJOUT_EPOUX_PACS, LIBELLE_CASE_EPOUX_PACS, OPTION_SANS_REMPLACANT_EPOUX_PACS, SOLIDAIRE_SANS_FIN_EPOUX_PACS } from "../src/lib/solidarite-colocation";

// Décision du dirigeant du 24/11/2026 — case « mariés ou pacsés » au bail. Article 8-1 de la loi du 6 juillet 1989 (recueil
// fourni par le dirigeant, non recontrôlé) : une location consentie exclusivement à des époux ou à des partenaires de PACS
// n'est pas une colocation ; la fin de la solidarité à six mois vise les colocataires.
//
// Un espace fictif propre à l'essai, sur téléphone (390 px), le propriétaire :
//   1. prépare un bail commun à deux locataires : la case est proposée à l'étape Personnes ; cochée, elle s'enregistre ;
//   2. sur un bail signé dont la case est cochée, enregistre le départ de l'un d'eux : le formulaire et le message disent
//      qu'aucune fin de solidarité n'est enregistrée, et la base n'en enregistre aucune.
// Tout est fictif et retiré à la fin. Aucun e-mail ne part.

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 });

async function tientDansLEcran(p: Page, cible: Locator) {
  await cible.scrollIntoViewIfNeeded();
  const boite = (await cible.boundingBox())!;
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(p.viewportSize()!.width + 1);
  expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
}

test("case « mariés ou pacsés » : cochée à la préparation d'un bail à deux locataires ; au départ de l'un d'eux, aucune fin de solidarité", async ({ page }, info) => {
  test.setTimeout(240_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  expect(LOCAUX).toContain(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname);

  const db = new Client({ connectionString: url });
  await db.connect();
  const [ORG, compte, bailleur, bien, lotA, lotB, lea, hugo, ines, paul, bailA, bailB, ligne] = Array.from({ length: 13 }, () => randomUUID());
  const email = `epoux-pacses-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const suffixe = lotA.slice(0, 6);

  try {
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','essai',current_date+14,'2 rue de recette','75001','Paris')", [ORG, `TEST Époux ${suffixe}`]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')", [compte, email, motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [ORG, compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,address_line1,postal_code,city) values($1,$2,'Exemple','Jo','2 rue de recette','75001','Paris')", [bailleur, ORG]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, `TEST Époux ${suffixe}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible'),($5,$2,$3,$6,'loue')", [lotA, ORG, bien, `TEST Époux A ${suffixe}`, lotB, `TEST Époux B ${suffixe}`]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$4,100,'2018-01-01'),($1,$3,$4,100,'2018-01-01')", [ORG, lotA, lotB, bailleur]);
    await db.query(`insert into persons(id,organization_id,nom,prenom,email,address_line1,postal_code,city) values
      ($1,$5,'Martin','Léa','lea@example.invalid','1 rue de recette','75001','Paris'),($2,$5,'Durand','Hugo','hugo@example.invalid','1 rue de recette','75001','Paris'),
      ($3,$5,'Petit','Inès','ines@example.invalid','1 rue de recette','75001','Paris'),($4,$5,'Roux','Paul','paul@example.invalid','1 rue de recette','75001','Paris')`, [lea, hugo, ines, paul, ORG]);
    // A : bail commun en préparation, Léa et Hugo. B : bail commun signé d'Inès et Paul, case cochée à sa préparation.
    // Relecture de la fusion (A-01) : Paul est au bail B À SA SIGNATURE — le bail est préparé (brouillon), Paul y est
    // ajouté, puis le bail sort du brouillon. Une personne ajoutée à un bail déjà signé est, pour la base, entrée après la
    // signature (migration 20261125153000) : à son départ, la règle de la colocation s'applique.
    await db.query(`insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,charges_mode,jour_echeance,locataires_epoux_pacses) values
      ($1,$3,$4,$5,'colocation','brouillon',(date_trunc('month',current_date)+interval '1 month')::date,900,60,'provision',5,false),
      ($2,$3,$6,$7,'colocation','brouillon','2025-01-01',900,60,'provision',5,true)`, [bailA, bailB, ORG, lotA, lea, lotB, ines]);
    await db.query("insert into bail_personnes(organization_id,bail_id,person_id,role,quote_part) values($1,$2,$3,'colocataire',50)", [ORG, bailA, hugo]);
    await db.query("insert into bail_personnes(id,organization_id,bail_id,person_id,role,quote_part) values($1,$2,$3,$4,'colocataire',50)", [ligne, ORG, bailB, paul]);
    await db.query("update baux set etat='actif' where id=$1", [bailB]);
    await db.query("commit");

    await page.setViewportSize({ width: 390, height: 950 });
    await sansSyntheseAlertes(page);

    // ── 1. Préparation du bail A : la case, cochée, s'enregistre.
    await connecterVers(page, email, motDePasse, `/espace/${ORG}/baux/${bailA}#etape-bail-2`);
    const caseEpoux = page.getByLabel(LIBELLE_CASE_EPOUX_PACS, { exact: true });
    await expect(caseEpoux).toBeVisible({ timeout: 45_000 });
    await expect(caseEpoux).not.toBeChecked();
    const formulaire = page.locator("[data-case-epoux-pacs]");
    await expect(formulaire).toContainText("Article 8-1 de la loi du 6 juillet 1989");
    await caseEpoux.check();
    await formulaire.getByRole("button", { name: "Enregistrer ce choix" }).click();
    await expect.poll(async () => (await db.query("select locataires_epoux_pacses v from baux where id=$1", [bailA])).rows[0].v, { timeout: 30_000 }).toBe(true);
    await tientDansLEcran(page, formulaire);
    await formulaire.screenshot({ path: info.outputPath("epoux-pacses-preparation-390.png") });
    // Relue au rechargement : la case est cochée.
    await page.reload();
    await expect(page.getByLabel(LIBELLE_CASE_EPOUX_PACS, { exact: true })).toBeChecked({ timeout: 45_000 });

    // ── 2. Bail B signé, case cochée : départ de Paul, aucune fin de solidarité.
    await page.goto(`/espace/${ORG}/baux/${bailB}`);
    // A-01 : l'ajout d'un colocataire à ce bail signé est précédé de l'avertissement (la personne ajoutée garde la règle
    // de la colocation).
    await expect(page.locator("[data-avertissement-ajout-epoux-pacs]")).toHaveText(AVERTISSEMENT_AJOUT_EPOUX_PACS, { timeout: 45_000 });
    const bouton = page.getByRole("button", { name: "Départ du colocataire" });
    await expect(bouton).toBeVisible({ timeout: 45_000 });
    await bouton.click();
    const depart = page.locator("form").filter({ has: page.locator('input[name="date_effet_conge"]') });
    await expect(depart.locator("[data-aide-depart-colocataire]")).toHaveText(AIDE_DEPART_EPOUX_PACS);
    await expect(depart.locator('select[name="remplacant"] option').first()).toHaveText(OPTION_SANS_REMPLACANT_EPOUX_PACS);
    await tientDansLEcran(page, depart.locator("[data-aide-depart-colocataire]"));
    await depart.locator('input[name="date_effet_conge"]').fill("2026-10-31");
    await depart.getByRole("button", { name: "Enregistrer le départ" }).click();
    // La ligne du colocataire parti remplace le formulaire : elle dit qu'aucune fin de solidarité n'est enregistrée.
    await expect(page.getByText(`parti le 31/10/2026 · ${SOLIDAIRE_SANS_FIN_EPOUX_PACS}`)).toBeVisible({ timeout: 30_000 });
    expect((await db.query("select date_depart::text depart, date_solidarite_fin::text fin from bail_personnes where id=$1", [ligne])).rows).toEqual([{ depart: "2026-10-31", fin: null }]);
    await page.screenshot({ path: info.outputPath("epoux-pacses-depart-390.png"), fullPage: true });
  } finally {
    await db.query("rollback").catch(() => undefined);
    // La base du banc est remise à neuf avant chaque passage : le ménage est fait au mieux, sans faire échouer l'essai.
    try {
      await db.query("begin");
      for (const sql of [
        "delete from bail_personnes where organization_id=$1", "delete from alerts where organization_id=$1",
        "delete from detentions where organization_id=$1", "delete from baux where organization_id=$1",
      ]) await db.query(sql, [ORG]);
      await db.query("commit");
    } catch { await db.query("rollback").catch(() => undefined); }
    await db.end();
  }
});
