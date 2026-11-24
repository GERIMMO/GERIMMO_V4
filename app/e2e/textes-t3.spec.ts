import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// Textes officiels, lot T3 (25/11/2026) — dépôt, charges, état des lieux, pièces, impayés. Référence : recueil fourni par
// le dirigeant (source et version déclarées, non recontrôlé).
//
// Un espace fictif propre à l'essai : un candidat sans bail ; un logement loué à Camille depuis 2019, avec une caution,
// un loyer impayé et un état des lieux de sortie en préparation. Sur téléphone, le propriétaire :
//   1. demande une pièce au candidat : elle se choisit dans la liste du décret n° 2015-1437 ; la demande s'enregistre sous
//      le nom de la liste ; une seconde « seule pièce justificative de domicile » est refusée (R19-A1) ;
//   2. lit, sur les loyers du bail, la date à ne pas dépasser pour informer la caution (R24-A1) ;
//   3. régularise les charges de 2021 : avertissement « peut-être prescrit », refus du serveur sans confirmation, puis
//      enregistrement du complément au centime (R16-A1, ARGENT) ;
//   4. ouvre l'état des lieux de sortie : le champ porte la mention du décret du 30 mars 2016 (R15-A1).
// Tout est fictif et retiré à la fin. Aucun e-mail ne part (la personne n'a pas d'espace).

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 });

async function tientDansLEcran(p: Page, cible: Locator) {
  await cible.scrollIntoViewIfNeeded();
  const boite = (await cible.boundingBox())!;
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(p.viewportSize()!.width + 1);
  expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
}

test("lot T3 : pièces du décret, information de la caution, complément de charges ancien, adresse du nouveau domicile", async ({ page }, info) => {
  test.setTimeout(300_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  expect(LOCAUX).toContain(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname);

  const db = new Client({ connectionString: url });
  await db.connect();
  const [ORG, compte, bailleur, bien, lot, camille, garant, candidat, bail, edl] = Array.from({ length: 10 }, () => randomUUID());
  const email = `textes-t3-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const suffixe = lot.slice(0, 6);
  const fr = (iso: string) => iso.split("-").reverse().join("/");

  try {
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','essai',current_date+14,'2 rue de recette','75001','Paris')", [ORG, `TEST Textes T3 ${suffixe}`]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')", [compte, email, motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [ORG, compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,address_line1,postal_code,city) values($1,$2,'Exemple','Jo','2 rue de recette','75001','Paris')", [bailleur, ORG]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, `TEST Textes T3 ${suffixe}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, `TEST Textes T3 T2 ${suffixe}`]);
    await db.query(`insert into persons(id,organization_id,nom,prenom,email) values
      ($1,$4,'Fictif','Camille','camille@example.invalid'),($2,$4,'Garant','Paul','paul@example.invalid'),($3,$4,'Candidat','Noé','noe@example.invalid')`, [camille, garant, candidat, ORG]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2018-01-01')", [ORG, lot, bailleur]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,charges_mode,jour_echeance) values($1,$2,$3,$4,'nu','actif','2019-01-01',750,50,'provision',5)", [bail, ORG, lot, camille]);
    await db.query("insert into bail_personnes(organization_id,bail_id,person_id,role,garant_de) values($1,$2,$3,'garant',$4)", [ORG, bail, garant, camille]);
    // Un loyer impayé, échu depuis dix jours : la caution doit être informée dans le mois de cette échéance.
    const echeance = (await db.query("select (public.aujourdhui_paris()-10)::text e, ((public.aujourdhui_paris()-10)+interval '1 month')::date::text limite, date_trunc('month',public.aujourdhui_paris()-10)::date::text periode")).rows[0];
    await db.query("insert into appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,$3,750,50,800,$4)", [ORG, bail, echeance.periode, echeance.e]);
    await db.query(`insert into etats_des_lieux(id,organization_id,bail_id,type,etat,date_edl,personnes_presentes,observations)
      values($1,$2,$3,'sortie','brouillon',public.aujourdhui_paris(),'Le bailleur et la locataire','Néant')`, [edl, ORG, bail]);
    await db.query("commit");

    await page.setViewportSize({ width: 390, height: 950 });
    await sansSyntheseAlertes(page);

    // ── 1. Le candidat : la pièce se choisit dans la liste du décret.
    await connecterVers(page, email, motDePasse, `/espace/${ORG}/personnes/${candidat}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Candidat", { timeout: 30_000 });
    // Le volet des justificatifs s'ouvre sur « Déposer moi-même » ; on passe à la demande faite à la personne. Après un
    // rechargement, le clic peut précéder l'activation de la page : on recommence jusqu'à voir le bouton.
    const ouvrirDemande = async () => {
      const bouton = page.getByRole("button", { name: /^Demander à la personne/ });
      await expect(async () => {
        if (!(await bouton.isVisible())) await page.locator("summary:visible", { hasText: "Ajouter ou demander un justificatif" }).first().click();
        await expect(bouton).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 45_000 });
      await bouton.click();
    };
    await ouvrirDemande();
    const formulaire = page.locator("form:visible").filter({ has: page.locator('select[name="piece_decret"]') });
    const choix = formulaire.locator('select[name="piece_decret"]');
    await expect(formulaire.locator('input[name="libelle"]')).toHaveCount(0);
    await choix.selectOption("I-D-2");
    await expect(formulaire.locator("[data-texte-piece-decret]")).toContainText("Trois derniers bulletins de salaires.");
    await tientDansLEcran(page, choix);
    await page.screenshot({ path: info.outputPath("t3-pieces-candidat-390.png"), fullPage: true });
    await formulaire.getByRole("button", { name: /Préparer la demande|Envoyer la demande/ }).click();
    await expect(page.getByText("Trois derniers bulletins de salaires").first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await db.query("select libelle, type::text, note from pieces_demandees where organization_id=$1 and person_id=$2", [ORG, candidat])).rows)
      .toEqual([{ libelle: "Trois derniers bulletins de salaires", type: "justificatif", note: null }]);
    // « Une seule pièce justificative de domicile » : la première passe, la seconde est refusée.
    const demanderDomicile = async () => {
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Candidat", { timeout: 30_000 });
      await ouvrirDemande();
      const f = page.locator("form:visible").filter({ has: page.locator('select[name="piece_decret"]') });
      await f.locator('select[name="piece_decret"]').selectOption("I-B");
      await f.getByRole("button", { name: /Préparer la demande|Envoyer la demande/ }).click();
      return f;
    };
    const nombre = async () => Number((await db.query("select count(*) n from pieces_demandees where organization_id=$1 and person_id=$2", [ORG, candidat])).rows[0].n);
    await demanderDomicile();
    await expect.poll(nombre, { timeout: 30_000 }).toBe(2);
    const refus = await demanderDomicile();
    await expect(refus.locator("p.text-destructive")).toContainText("Cette demande est déjà faite pour cette personne", { timeout: 30_000 });
    await tientDansLEcran(page, refus.locator("p.text-destructive"));
    expect(await nombre()).toBe(2);
    const domicile = (await db.query("select libelle, note from pieces_demandees where organization_id=$1 and person_id=$2 and libelle like 'Une seule%'", [ORG, candidat])).rows;
    expect(domicile).toHaveLength(1);
    expect(domicile[0].note).toContain("1. Trois dernières quittances de loyer ou, à défaut, attestation du précédent bailleur");

    // ── 2. Les loyers du bail : la date à ne pas dépasser pour informer la caution.
    await page.goto(`/espace/${ORG}/baux/${bail}`);
    await page.getByRole("tab", { name: "Suivi", exact: true }).click();
    await page.locator("#loyers > summary").click();
    const rappelCaution = page.locator("[data-information-caution]:visible");
    await expect(rappelCaution).toContainText(`Ce bail a une caution : par prudence, informez-la du loyer impayé exigible le ${fr(echeance.e)} au plus tard le ${fr(echeance.limite)} (un mois après l’échéance).`, { timeout: 30_000 });
    await expect(rappelCaution).toContainText("Article 2303 du code civil");
    await expect(rappelCaution).toContainText("Gerimmo ne sait pas si cette règle vous concerne");
    await tientDansLEcran(page, rappelCaution);
    await rappelCaution.screenshot({ path: info.outputPath("t3-caution-390.png") });

    // ── 3. Régularisation des charges de 2021 : avertie, refusée sans confirmation, puis enregistrée au centime.
    const annee = page.locator("#reg-annee");
    await annee.fill("2021");
    await page.locator("#reg-reel").fill("1234,56");
    await page.locator('input[name="justificatif"]').setInputFiles({ name: "decompte-2021.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    const regul = page.locator("form").filter({ has: annee });
    const avertissement = regul.locator("[data-exercice-ancien]");
    await expect(avertissement).toContainText("Exercice 2021 clos depuis plus de trois ans : un complément de charges à la charge du locataire est peut-être prescrit.");
    await expect(avertissement).toContainText("Gerimmo ne connaît pas ce jour et ne se prononce pas.");
    await tientDansLEcran(page, avertissement);
    await avertissement.screenshot({ path: info.outputPath("t3-exercice-ancien-390.png") });
    const confirmation = regul.locator('input[name="confirmer_exercice_ancien"]');
    await expect(confirmation).not.toBeChecked();
    // Contrôle du navigateur levé : c'est le serveur qui doit refuser une requête sans confirmation.
    await regul.evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
    await regul.getByRole("button", { name: "Régulariser" }).click();
    await expect(regul).toContainText("Cochez la confirmation pour l’enregistrer malgré tout.", { timeout: 30_000 });
    expect(Number((await db.query("select count(*) n from regularisations_charges where bail_id=$1", [bail])).rows[0].n)).toBe(0);
    // La saisie est reposée ; le justificatif se choisit de nouveau, puis la confirmation est cochée.
    await page.locator('input[name="justificatif"]').setInputFiles({ name: "decompte-2021.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await expect(page.locator("#reg-reel")).toHaveValue("1234,56");
    await regul.locator('input[name="confirmer_exercice_ancien"]').check();
    await regul.getByRole("button", { name: "Régulariser" }).click();
    await expect(page.locator("#loyers")).toContainText(/Complément de 1\s234,56\s€ dû par le locataire\./, { timeout: 30_000 });
    await expect(page.locator("#loyers")).toContainText("Exercice clos depuis plus de trois ans : ce complément est peut-être prescrit");
    expect((await db.query("select annee, round(charges_reelles*100)::int reel_centimes, round(provisions*100)::int prov_centimes, round(ecart*100)::int ecart_centimes from regularisations_charges where bail_id=$1", [bail])).rows)
      .toEqual([{ annee: 2021, reel_centimes: 123456, prov_centimes: 0, ecart_centimes: -123456 }]);

    // ── 4. L'état des lieux de sortie : la mention du décret.
    await page.goto(`/espace/${ORG}/baux/${bail}/edl/${edl}`);
    const champ = page.locator("#edl-adresse-restitution");
    await expect(champ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('label[for="edl-adresse-restitution"]')).toHaveText("Adresse du nouveau domicile ou du lieu d’hébergement du locataire *");
    await expect(page.locator("#edl-adresse-restitution-aide")).toContainText("Indiquée par le locataire à la remise des clés.");
    await expect(page.locator("body")).not.toContainText("Adresse de restitution du dépôt");
    await tientDansLEcran(page, page.locator('label[for="edl-adresse-restitution"]'));
    await page.screenshot({ path: info.outputPath("t3-edl-sortie-390.png"), fullPage: true });
  } finally {
    await db.query("rollback").catch(() => undefined);
    // La base du banc est remise à neuf avant chaque passage : le ménage est fait au mieux, sans faire échouer l'essai.
    try {
      await db.query("begin");
      for (const sql of [
        "delete from pieces_demandees where organization_id=$1", "delete from regularisations_charges where organization_id=$1",
        "delete from alerts where organization_id=$1", "delete from etats_des_lieux where organization_id=$1",
        "delete from appels_loyer where organization_id=$1", "delete from bail_personnes where organization_id=$1",
        "delete from detentions where organization_id=$1", "delete from baux where organization_id=$1",
      ]) await db.query(sql, [ORG]);
      await db.query("commit");
    } catch { await db.query("rollback").catch(() => undefined); }
    await db.end();
  }
});
