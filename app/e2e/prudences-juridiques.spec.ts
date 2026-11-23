import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// PRUDENCES SUR QUATRE POINTS JURIDIQUES DONT LE TEXTE OFFICIEL N'A PAS PU ÊTRE RELU
// (audit palier 1 du 22/11/2026, lot 33 : P0-04, P0-07, P0-08, P0-09).
//
// Un espace fictif propre à l'essai : un candidat sans bail, et un logement loué à Camille avec un garant.
// Sur téléphone, le propriétaire :
//   1. ouvre la fiche du candidat : le « RIB » n'est plus proposé d'un clic, et un rappel dit que les pièces qu'on
//      peut demander avant le bail sont encadrées ; le libellé reste libre ;
//   2. ouvre la fiche de la locataire en place : le rappel n'y est pas ;
//   3. ouvre le bail : la notice est dite « résumé », qui ne remplace pas la notice officielle ;
//   4. lit, sur le cautionnement, le rappel pour le bailleur en société ;
//   5. prépare un congé : « à faire relire » pour la vente et la reprise, deux précisions pour la reprise, rien pour
//      le motif légitime et sérieux.
// Le parcours ne génère aucun document et n'envoie rien. Tout est fictif et retiré à la fin.

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

test("pièces demandées, notice, cautionnement et congé : Gerimmo avertit et dit ce qu'il ne vérifie pas", async ({ page }, info) => {
  test.setTimeout(240_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  expect(LOCAUX).toContain(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname);

  const db = new Client({ connectionString: url });
  await db.connect();
  const [ORG, compte, bailleur, bien, lot, camille, garant, candidat, bail] = Array.from({ length: 9 }, () => randomUUID());
  const email = `prudences-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const suffixe = lot.slice(0, 6);
  const compter = async () => (await db.query(
    "select (select count(*) from documents where organization_id=$1)::int documents, (select count(*) from pieces_demandees where organization_id=$1)::int demandes, (select count(*) from conges where organization_id=$1)::int conges",
    [ORG])).rows[0];

  try {
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','essai',current_date+14,'2 rue de recette','75001','Paris')", [ORG, `TEST Prudences ${suffixe}`]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')", [compte, email, motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [ORG, compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,address_line1,postal_code,city) values($1,$2,'Exemple','Jo','2 rue de recette','75001','Paris')", [bailleur, ORG]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, `TEST Prudences ${suffixe}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, `TEST Prudences T2 ${suffixe}`]);
    await db.query(`insert into persons(id,organization_id,nom,prenom,email) values
      ($1,$4,'Fictif','Camille','camille@example.invalid'),($2,$4,'Garant','Paul','paul@example.invalid'),($3,$4,'Candidat','Noé','noe@example.invalid')`, [camille, garant, candidat, ORG]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [ORG, lot, bailleur]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-200,750,50,5)", [bail, ORG, lot, camille]);
    await db.query("insert into bail_personnes(organization_id,bail_id,person_id,role,garant_de) values($1,$2,$3,'garant',$4)", [ORG, bail, garant, camille]);
    await db.query("commit");
    const avant = await compter();

    await page.setViewportSize({ width: 390, height: 950 });
    await sansSyntheseAlertes(page);

    // ── 1. Le candidat, sans bail : plus de « RIB » d'un clic, et le rappel.
    await connecterVers(page, email, motDePasse, `/espace/${ORG}/personnes/${candidat}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Candidat", { timeout: 30_000 });
    await page.getByText("Ajouter ou demander un justificatif", { exact: false }).first().click();
    // Le volet s'ouvre sur « Déposer moi-même » ; le rappel accompagne la demande faite à la personne.
    await page.getByRole("button", { name: /^Demander à la personne/ }).click();
    const rappelPieces = page.locator("[data-rappel-pieces-avant-bail]:visible");
    await expect(rappelPieces).toContainText("Avant la signature du bail, les pièces qu’un bailleur peut demander à un candidat locataire ou à sa caution sont encadrées par la réglementation.");
    await expect(rappelPieces).toContainText("Gerimmo ne contrôle pas ce que vous demandez.");
    await tientDansLEcran(page, rappelPieces);
    const formulaire = page.locator("form:visible").filter({ has: page.locator('input[name="libelle"]') });
    await expect(formulaire.getByRole("button", { name: /Avis d'imposition/ })).toBeVisible();
    await expect(formulaire.getByRole("button", { name: /Justificatif de domicile/ })).toBeVisible();
    await expect(formulaire.getByRole("button", { name: /Pièce d'identité/ })).toBeVisible();
    await expect(formulaire.getByRole("button", { name: /RIB/ })).toHaveCount(0);
    await expect(formulaire.locator('input[name="libelle"]')).toHaveAttribute("placeholder", "Pièce à demander (ex. : avis d’imposition)");
    // Le libellé reste libre : le rappel n'empêche pas d'écrire ce qu'on veut (rien n'est envoyé ici).
    await formulaire.locator('input[name="libelle"]').fill("Dernier bulletin de salaire");
    await expect(formulaire.locator('input[name="libelle"]')).toHaveValue("Dernier bulletin de salaire");
    await formulaire.locator('input[name="libelle"]').fill("");
    await page.screenshot({ path: info.outputPath("prudences-pieces-candidat.png"), fullPage: true });

    // ── 2. La locataire en place : pas de rappel « avant bail ».
    await page.goto(`/espace/${ORG}/personnes/${camille}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Fictif", { timeout: 30_000 });
    await page.getByText("Ajouter ou demander un justificatif", { exact: false }).first().click();
    await page.getByRole("button", { name: /^Demander à la personne/ }).click();
    await expect(page.locator('form:visible input[name="libelle"]')).toBeVisible();
    await expect(page.locator("[data-rappel-pieces-avant-bail]")).toHaveCount(0);

    // ── 3. Le bail : la notice est dite « résumé ».
    await page.goto(`/espace/${ORG}/baux/${bail}#notice-information`);
    const notice = page.locator("#notice-information:visible");
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice.locator("[data-notice-resume]")).toContainText("Gerimmo en prépare un résumé");
    await expect(notice.locator("[data-notice-resume]")).toContainText("il ne remplace pas la notice officielle, dont le texte complet est à remettre au locataire avec le bail");
    await expect(notice.getByRole("button", { name: "Générer le résumé de la notice (PDF)" })).toBeVisible();
    await tientDansLEcran(page, notice);
    await notice.screenshot({ path: info.outputPath("prudences-notice.png") });

    // ── 4. Le cautionnement : rappel pour le bailleur en société ; l'acte reste proposé.
    await page.goto(`/espace/${ORG}/baux/${bail}#inventaire`);
    const rappelCaution = page.locator("[data-rappel-caution-societe]:visible");
    await expect(rappelCaution).toContainText("Bailleur en société (SCI, autre personne morale) : demander une caution n’est pas permis dans tous les cas.");
    await expect(rappelCaution).toContainText("Gerimmo ne contrôle pas ce point.");
    await tientDansLEcran(page, rappelCaution);
    await expect(page.locator("#inventaire:visible")).toContainText("Paul Garant");
    await page.locator("#inventaire:visible").screenshot({ path: info.outputPath("prudences-cautionnement.png") });

    // ── 5. Le congé du bailleur : « à faire relire » pour la vente et la reprise.
    await page.goto(`/espace/${ORG}/baux/${bail}#conge-b-motif`);
    const motif = page.locator("#conge-b-motif:visible");
    await expect(motif).toBeVisible({ timeout: 30_000 });
    await expect(motif).toHaveValue("vente");
    const aRelire = page.locator("[data-conge-a-faire-relire]:visible");
    await expect(aRelire).toHaveAttribute("data-conge-a-faire-relire", "vente");
    await expect(aRelire).toContainText("À faire relire avant de notifier. Un congé pour vente doit comporter des mentions précises et reproduire certains textes ; un congé incomplet peut être annulé.");
    await expect(aRelire).toContainText("Gerimmo n’a pas pu comparer ce modèle au texte officiel");
    await tientDansLEcran(page, aRelire);

    await motif.selectOption("reprise");
    await expect(aRelire).toHaveAttribute("data-conge-a-faire-relire", "reprise");
    await expect(aRelire).toContainText("Un congé pour reprise doit comporter des mentions précises");
    await expect(aRelire).toContainText("Gerimmo ne génère pas la lettre tant que le nom du bénéficiaire, son lien avec vous, son adresse et les raisons de la reprise ne sont pas renseignés.");
    const adresse = page.locator("#conge-b-adresse:visible");
    const raisons = page.locator("#conge-b-raisons:visible");
    // Par exécution : nom et lien saisis, adresse et raisons vides → la lettre est refusée. L'écran nomme ce qui manque,
    // sans envoyer chercher l'adresse du bénéficiaire sur la fiche du locataire. Un refus ne crée rien.
    await page.locator("#conge-b-beneficiaire:visible").fill("Marie Dupont");
    await page.locator("#conge-b-lien:visible").fill("fille du bailleur");
    await page.locator("button:visible", { hasText: "Générer le congé (PDF)" }).click();
    const aRenseigner = page.locator("span:visible", { hasText: "À renseigner avant de générer le PDF" }).last();
    await expect(aRenseigner).toContainText("adresse du bénéficiaire de la reprise", { timeout: 30_000 });
    await expect(aRenseigner).toContainText("raisons de la reprise");
    await expect(aRenseigner).not.toContainText("nom du bénéficiaire de la reprise");
    await expect(aRenseigner.locator("a", { hasText: "fiche de la personne" })).toHaveCount(0);
    await expect(page.locator("span.text-destructive:visible", { hasText: "PDF non généré" })).toBeVisible();
    await tientDansLEcran(page, aRenseigner);
    await page.screenshot({ path: info.outputPath("prudences-conge-reprise-refus.png"), fullPage: true });
    await adresse.fill("12 rue des Lilas, 69003 Lyon");
    await raisons.fill("Elle s’installe à Lyon pour son travail");
    await expect(adresse).toHaveValue("12 rue des Lilas, 69003 Lyon");
    await tientDansLEcran(page, adresse);
    await tientDansLEcran(page, raisons);
    await tientDansLEcran(page, aRelire);
    await page.screenshot({ path: info.outputPath("prudences-conge-reprise.png"), fullPage: true });

    await motif.selectOption("motif_legitime");
    await expect(page.locator("[data-conge-a-faire-relire]")).toHaveCount(0);
    await expect(page.locator("#conge-b-adresse")).toHaveCount(0);

    // Lire ces écrans n'a rien créé : ni document, ni demande de pièce, ni congé.
    expect(await compter()).toEqual(avant);
  } finally {
    await db.query("rollback").catch(() => undefined);
    try {
      await db.query("begin");
      await db.query("delete from bail_personnes where organization_id=$1", [ORG]);
      await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2", [ORG, bail]);
      await db.query("delete from detentions where lot_id=$1", [lot]);
      await db.query("delete from baux where id=$1", [bail]);
      await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("delete from persons where id in ($1,$2,$3)", [camille, garant, candidat]);
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
