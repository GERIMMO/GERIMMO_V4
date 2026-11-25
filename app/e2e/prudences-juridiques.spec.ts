import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// PRUDENCES SUR QUATRE POINTS JURIDIQUES DONT LE TEXTE OFFICIEL N'A PAS PU ÊTRE RELU
// (audit palier 1 du 22/11/2026, lot 33 : P0-04, P0-07, P0-08, P0-09).
//
// Un espace fictif propre à l'essai : un candidat sans bail, et un logement loué à Camille avec un garant.
// Sur téléphone, le propriétaire :
//   1. ouvre la fiche du candidat : la pièce à demander se choisit dans la liste du décret n° 2015-1437 (lot T3) ; ni
//      « RIB », ni libellé libre ;
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
    // Textes officiels, lot T3 (R19-A1) : le rappel « encadrées par la réglementation », le libellé libre et les trois
    // raccourcis laissent la place, avant tout bail signé, au choix dans la liste du décret n° 2015-1437 (texte lu dans le
    // recueil). Ce passage affirmait l'ancien état ; rien n'est envoyé ici non plus.
    const rappelPieces = page.locator("[data-rappel-pieces-avant-bail]:visible");
    await expect(rappelPieces).toContainText("Avant la signature du bail, et pour une caution, seules les pièces de la liste ci-dessous peuvent être exigées (décret n° 2015-1437 du 5 novembre 2015, annexe I, en vigueur depuis le 1er janvier 2023).");
    await tientDansLEcran(page, rappelPieces);
    const formulaire = page.locator("form:visible").filter({ has: page.locator('select[name="piece_decret"]') });
    await expect(formulaire.locator('input[name="libelle"]')).toHaveCount(0);
    await expect(formulaire.getByRole("button", { name: /RIB|Avis d'imposition|Justificatif de domicile/ })).toHaveCount(0);
    const choix = formulaire.locator('select[name="piece_decret"]');
    await expect(choix.locator("option")).toHaveCount(19); // « Choisir… » et les 18 choix de l'annexe I
    await expect(choix.locator("option", { hasText: /bancaire|\bRIB\b/ })).toHaveCount(0);
    await choix.selectOption("I-B");
    await expect(formulaire.locator("[data-texte-piece-decret]")).toContainText("Une seule pièce justificative de domicile parmi les documents suivants : 1. Trois dernières quittances de loyer ou, à défaut, attestation du précédent bailleur");
    await tientDansLEcran(page, formulaire.locator("[data-texte-piece-decret]"));
    await choix.selectOption("");
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

    // ── 4. Le cautionnement. Textes officiels, lot T2 (R03-A1, R17-A3) : ce parcours affirmait un simple rappel (« Gerimmo ne
    // contrôle pas ce point »). L'article 22-1 a été lu : l'écran donne la règle, annonce les deux refus et propose la déclaration.
    await page.goto(`/espace/${ORG}/baux/${bail}#inventaire`);
    const rappelCaution = page.locator("[data-rappel-caution-societe]:visible");
    await expect(rappelCaution).toContainText("Bailleur en société (SCI non familiale, autre personne morale) : la loi ne lui permet de demander la caution d’une personne que si le logement est loué à un étudiant qui ne bénéficie pas d’une bourse de l’enseignement supérieur.");
    await expect(rappelCaution).toContainText("Hors de ce cas, Gerimmo ne prépare pas l’acte.");
    await tientDansLEcran(page, rappelCaution);
    const rappelColocation = page.locator("[data-rappel-caution-colocation]:visible");
    await expect(rappelColocation).toContainText("Bail à plusieurs locataires : l’acte nomme le locataire pour lequel la caution s’engage.");
    await tientDansLEcran(page, rappelColocation);
    await expect(page.locator("#inventaire:visible").getByLabel(/je déclare que le logement est loué à un étudiant qui ne bénéficie pas d'une bourse/)).not.toBeChecked();
    // Le garant rattaché au bail est proposé, sous son nom puis son prénom (comme partout dans l'espace).
    await expect(page.locator("#inventaire:visible")).toContainText("Garant Paul");
    await page.locator("#inventaire:visible").screenshot({ path: info.outputPath("prudences-cautionnement.png") });

    // ── 5. Le congé du bailleur : « à faire relire » pour la vente et la reprise.
    await page.goto(`/espace/${ORG}/baux/${bail}#conge-b-motif`);
    const motif = page.locator("#conge-b-motif:visible");
    await expect(motif).toBeVisible({ timeout: 30_000 });
    await expect(motif).toHaveValue("vente");
    const aRelire = page.locator("[data-conge-a-faire-relire]:visible");
    await expect(aRelire).toHaveAttribute("data-conge-a-faire-relire", "vente");
    // Textes officiels, lot T1 : le rappel ne dit plus « Gerimmo n’a pas pu comparer ce modèle au texte officiel » (le modèle a
    // été rapproché du recueil fourni par le dirigeant) ; il reste « à faire relire » et sans garantie.
    await expect(aRelire).toContainText("À faire relire avant de notifier. Faites relire ce congé pour vente (ADIL, avocat, commissaire de justice).");
    await expect(aRelire).toContainText("Gerimmo ne garantit pas que ce modèle soit complet ni à jour.");
    await tientDansLEcran(page, aRelire);
    // Lot T1 : la date limite de réception du terme en cours, la notice à joindre soi-même, « réception » et non « présentation ».
    const dateLimite = page.locator("[data-conge-date-limite]:visible");
    await expect(dateLimite).toContainText("le locataire doit avoir reçu le congé au plus tard le");
    await expect(dateLimite).toContainText("une lettre présentée mais non retirée ne fait pas courir le délai");
    await tientDansLEcran(page, dateLimite);
    const noticeConge = page.locator("[data-conge-notice-a-joindre]:visible");
    await expect(noticeConge).toContainText("Gerimmo ne l’imprime pas : joignez-la vous-même.");
    await tientDansLEcran(page, noticeConge);
    await expect(page.locator("label[for='conge-b-presentation']:visible")).toContainText("Réception prévue par le locataire");
    await expect(page.locator("body")).not.toContainText("première présentation, dont la date");

    await motif.selectOption("reprise");
    await expect(aRelire).toHaveAttribute("data-conge-a-faire-relire", "reprise");
    await expect(aRelire).toContainText("Faites relire ce congé pour reprise");
    await expect(aRelire).toContainText("Gerimmo ne génère pas la lettre tant que le nom du bénéficiaire, son lien avec vous, son adresse et les raisons de la reprise ne sont pas renseignés.");
    const adresse = page.locator("#conge-b-adresse:visible");
    const raisons = page.locator("#conge-b-raisons:visible");
    // Par exécution : nom et lien saisis, adresse et raisons vides → la lettre est refusée. L'écran nomme ce qui manque,
    // sans envoyer chercher l'adresse du bénéficiaire sur la fiche du locataire. Un refus ne crée rien.
    await page.locator("#conge-b-beneficiaire:visible").fill("Marie Dupont");
    await page.locator("#conge-b-lien:visible").fill("fille du bailleur");
    // Lot T1 : en location nue, la question « logement acheté déjà loué ? » attend une réponse avant toute lettre.
    await page.locator("button:visible", { hasText: "Générer le congé (PDF)" }).click();
    await expect(page.locator("span.text-destructive:visible", { hasText: "Indiquez si le logement a été acheté alors qu’il était déjà loué" })).toBeVisible({ timeout: 30_000 });
    const acheteOccupe = page.locator("#conge-b-achete-occupe:visible");
    await acheteOccupe.selectOption("oui");
    await expect(page.locator("#conge-b-acquisition:visible")).toBeVisible();
    await acheteOccupe.selectOption("non");
    await expect(page.locator("#conge-b-acquisition")).toHaveCount(0);
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
