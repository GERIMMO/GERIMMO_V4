import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// PROPRIÉTAIRE : POINTER SES LOYERS AVEC UN RELEVÉ DE BANQUE (audit palier 1 du 22/11/2026, P2-05).
//
// Un espace fictif propre à l'essai : deux logements loués, deux locataires. Camille doit deux loyers de 800 €
// (le mois dernier et ce mois-ci), Zoé un loyer de 650 € ; son loyer suivant n'est pas échu.
//   1. depuis ses finances, le propriétaire ouvre le pointage et donne un relevé CSV exporté « à la française »
//      (point-virgule, virgule décimale, encodage Windows-1252, un débit, une ligne illisible) ;
//   2. l'écran propose : les deux virements de Camille, sûrs et cochés ; celui de Zoé, sans nom au libellé, à vérifier
//      et décoché ; le reste est écarté et expliqué ;
//   3. décocher le plus ancien loyer de Camille bloque l'envoi (le plus ancien d'abord) ; le recocher le débloque ;
//   4. il enregistre : deux règlements créés à la date du relevé, avec le libellé en note, aucun e-mail ;
//   5. il coche Zoé et enregistre ; puis redonne LE MÊME relevé : tout est « déjà enregistré », rien à confirmer ;
//   6. rien du fichier n'est parti au serveur avant l'enregistrement (aucune requête ne porte les autres libellés).
// L'espace, son compte, ses logements et ses loyers sont fictifs ; tout est retiré à la fin.

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 });

/** Rien de ce contenu n'est plus large que l'écran, ni coupé par une carte. */
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

test("le propriétaire pointe ses loyers à partir d'un relevé de banque, sans doublon", async ({ page }, info) => {
  test.setTimeout(240_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  expect(LOCAUX).toContain(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname);

  const db = new Client({ connectionString: url });
  await db.connect();
  const [ORG, compte, bailleur, bien, lotA, lotB, camille, zoe, bailA, bailB] = Array.from({ length: 10 }, () => randomUUID());
  const email = `pointage-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const suffixe = lotA.slice(0, 6);
  const nomA = `TEST Pointage T2 ${suffixe}`, nomB = `TEST Pointage Studio ${suffixe}`;
  const jour = async (decalage: number, forme: "iso" | "fr" = "iso") =>
    (await db.query(`select to_char(public.aujourdhui_paris() + $1::int, $2) j`, [decalage, forme === "iso" ? "YYYY-MM-DD" : "DD/MM/YYYY"])).rows[0].j as string;
  const reglements = async () => (await db.query(
    "select b.lot_id, e.montant::float8 montant, e.date_paiement::text date, e.mode, e.note from encaissements e join baux b on b.id=e.bail_id where e.organization_id=$1 order by e.date_paiement, e.montant", [ORG])).rows;

  try {
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','essai',current_date+14,'2 rue de recette','75001','Paris')", [ORG, `TEST Pointage ${suffixe}`]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')", [compte, email, motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [ORG, compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,address_line1,postal_code,city) values($1,$2,'Exemple','Jo','2 rue de recette','75001','Paris')", [bailleur, ORG]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, `TEST Pointage ${suffixe}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$3,$4,$5,'loue'),($2,$3,$4,$6,'loue')", [lotA, lotB, ORG, bien, nomA, nomB]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$3,'Fictif','Camille','camille@example.invalid'),($2,$3,'Lambert','Zoé','zoe@example.invalid')", [camille, zoe, ORG]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$4,100),($1,$3,$4,100)", [ORG, lotA, lotB, bailleur]);
    await db.query(`insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values
      ($1,$3,$4,$6,'nu','actif',public.aujourdhui_paris()-100,750,50,5),($2,$3,$5,$7,'nu','actif',public.aujourdhui_paris()-100,600,50,5)`, [bailA, bailB, ORG, lotA, lotB, camille, zoe]);
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$2,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date,public.aujourdhui_paris()-30,750,50,800),
      ($1,$2,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris()-2,750,50,800),
      ($1,$3,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris()-2,600,50,650),
      ($1,$3,(date_trunc('month',public.aujourdhui_paris())+interval '1 month')::date,public.aujourdhui_paris()+28,600,50,650)`, [ORG, bailA, bailB]);
    await db.query("commit");

    // Le relevé, tel qu'une banque française l'exporte : préambule, point-virgule, virgule décimale, Windows-1252.
    const SECRET = `ACHAT PHARMACIE CONFIDENTIEL ${suffixe}`;
    const releve = Buffer.from([
      "Compte courant;;;",
      "",
      "Date;Libellé;Montant",
      `${await jour(-29, "fr")};VIR SEPA M FICTIF CAMILLE LOYER;800,00`,
      `${await jour(-1, "fr")};VIR SEPA FICTIF CAMILLE LOYER;800,00`,
      `${await jour(-1, "fr")};VIR INST REF 99812 ${"SANSESPACE".repeat(12)};650,00`,
      `${await jour(-3, "fr")};PRLV EDF ${SECRET};-64,20`,
      `${await jour(-5, "fr")};REMBOURSEMENT MUTUELLE Santé ${SECRET};23,10`,
      "31/02/2026;LIGNE ILLISIBLE;10,00",
      "",
    ].join("\r\n"), "latin1");
    const donner = () => page.locator("#releve-banque").setInputFiles({ name: "releve-novembre.csv", mimeType: "text/csv", buffer: releve });

    // Ce que le navigateur envoie au serveur pendant tout le parcours : on y cherchera ce qui ne doit pas partir.
    const envois: string[] = [];
    page.on("request", (r) => { if (r.method() !== "GET") envois.push(`${r.url()}\n${r.postData() ?? ""}`); });

    await page.setViewportSize({ width: 390, height: 950 });
    await sansSyntheseAlertes(page);
    await connecterVers(page, email, motDePasse, `/espace/${ORG}/loyers`);

    // 1. Depuis les finances.
    // « :visible » : pendant le chargement progressif, la page porte un court instant une copie cachée de son contenu.
    const lien = page.locator("[data-lien-pointage]:visible");
    await expect(lien).toBeVisible({ timeout: 30_000 });
    await expect(lien).toHaveText("Pointer mes loyers avec un relevé de banque");
    await tientDansLEcran(page, lien);
    await lien.click();
    await page.waitForURL(`**/espace/${ORG}/loyers/pointage`, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Pointer mes loyers" })).toBeVisible();
    const ecran = page.locator('[data-pointage-releve][data-pret="oui"]:visible');
    await expect(ecran).toBeVisible({ timeout: 30_000 });
    await expect(ecran).toContainText("Il est lu sur votre appareil : il n’est ni envoyé à Gerimmo ni conservé.");
    await expect(ecran.locator("[data-rapprochement]")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("pointage-avant-releve.png"), fullPage: true });

    // Un fichier qui n'est pas un relevé est refusé avec ce qu'il faut faire.
    await page.locator("#releve-banque").setInputFiles({ name: "lettre.csv", mimeType: "text/csv", buffer: Buffer.from("Bonjour,\nceci est une lettre.\n") });
    await expect(ecran.locator("[data-erreur-releve]")).toContainText("colonne « Date »");
    await page.locator("#releve-banque").setInputFiles({ name: "releve.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
    await expect(ecran.locator("[data-erreur-releve]")).toContainText("Un relevé en PDF ne peut pas être lu");

    // 2. Le vrai relevé : ce que l'écran propose.
    await donner();
    await expect(ecran.locator("[data-erreur-releve]")).toHaveCount(0);
    const resume = ecran.locator("[data-resume-releve]");
    await expect(resume).toContainText("4 sommes reçues : 3 à confirmer, 0 déjà enregistrée, 1 sans loyer à pointer.");
    await expect(resume).toContainText("1 sortie d’argent ignorée.");
    await expect(resume).toContainText("1 ligne dont la date ou le montant ne se lit pas : ignorée.");
    const aConfirmer = ecran.locator("[data-a-confirmer] > li");
    await expect(aConfirmer).toHaveCount(3);
    const ancien = aConfirmer.filter({ hasText: "VIR SEPA M FICTIF CAMILLE LOYER" });
    // « VIR SEPA FICTIF… » n'est pas contenu dans « VIR SEPA M FICTIF… » : chaque filtre ne retient qu'une ligne.
    const recent = aConfirmer.filter({ hasText: "VIR SEPA FICTIF CAMILLE LOYER" });
    const deZoe = aConfirmer.filter({ hasText: "VIR INST REF 99812" });
    await expect(ancien).toHaveAttribute("data-statut", "sur");
    await expect(recent).toHaveAttribute("data-statut", "sur");
    await expect(deZoe).toHaveAttribute("data-statut", "probable");
    await expect(ancien.locator("[data-loyer]")).toContainText(`Camille Fictif · ${nomA} · reste dû 800,00 € · Virement`);
    await expect(deZoe.locator("[data-loyer]")).toContainText(`Zoé Lambert · ${nomB} · reste dû 650,00 €`);
    await expect(deZoe).toContainText("le nom du locataire ne figure pas au libellé");
    await expect(ancien.getByRole("checkbox")).toBeChecked();
    await expect(recent.getByRole("checkbox")).toBeChecked();
    await expect(deZoe.getByRole("checkbox")).not.toBeChecked();
    const bouton = ecran.locator("[data-enregistrer-pointage]");
    await expect(bouton).toHaveText("Enregistrer les 2 règlements cochés");
    await expect(bouton).toBeEnabled();
    // Un libellé de cent vingt caractères sans espace tient dans l'écran du téléphone.
    await tientDansLEcran(page, deZoe.locator("[data-libelle]"));
    await tientDansLEcran(page, ancien.locator("[data-loyer]"));
    await tientDansLEcran(page, bouton);
    const autres = ecran.locator("[data-sans-loyer]");
    await autres.locator("summary").click();
    await expect(autres.locator("li")).toHaveCount(1);
    await expect(autres.locator("li")).toContainText("REMBOURSEMENT MUTUELLE Santé");
    await expect(autres.locator("li")).toContainText("Aucun loyer à recevoir ne correspond");
    await page.screenshot({ path: info.outputPath("pointage-propositions-telephone.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 950 });
    await tientDansLEcran(page, deZoe.locator("[data-libelle]"));
    await page.screenshot({ path: info.outputPath("pointage-propositions-ordinateur.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 950 });

    // 3. Le plus ancien d'abord : décocher le loyer du mois dernier bloque celui de ce mois-ci.
    await ancien.getByRole("checkbox").uncheck();
    await expect(recent.locator("[data-faute]")).toContainText("Cochez d’abord le règlement du");
    await expect(bouton).toBeDisabled();
    await ancien.getByRole("checkbox").check();
    await expect(recent.locator("[data-faute]")).toHaveCount(0);
    await expect(bouton).toBeEnabled();

    // Jusqu'ici, RIEN du relevé n'a quitté l'appareil, et rien n'est écrit.
    expect(envois.filter((e) => /CAMILLE LOYER|PHARMACIE|MUTUELLE|99812/.test(e))).toEqual([]);
    expect(await reglements()).toEqual([]);

    // 4. Enregistrer les deux loyers de Camille.
    await bouton.click();
    const bilan = ecran.locator("[data-bilan-pointage]");
    await expect(bilan).toContainText("2 règlements enregistrés.", { timeout: 60_000 });
    await expect(bilan).toContainText("Ce pointage n’envoie aucun e-mail");
    await expect(bilan.locator("[data-refus-pointage]")).toHaveCount(0);
    expect(await reglements()).toEqual([
      { lot_id: lotA, montant: 800, date: await jour(-29), mode: "virement", note: "Pointé sur un relevé de banque : VIR SEPA M FICTIF CAMILLE LOYER" },
      { lot_id: lotA, montant: 800, date: await jour(-1), mode: "virement", note: "Pointé sur un relevé de banque : VIR SEPA FICTIF CAMILLE LOYER" },
    ]);
    // La page relue classe ces deux lignes « déjà enregistré » ; il ne reste que Zoé à confirmer.
    const deja = ecran.locator("[data-deja-enregistres]");
    await expect(deja.locator("li")).toHaveCount(2, { timeout: 30_000 });
    await expect(deja.locator('[data-reponse="enregistre"]')).toHaveCount(2);
    await expect(aConfirmer).toHaveCount(1);
    await expect(bouton).toHaveText("Cochez les règlements à enregistrer");
    await expect(bouton).toBeDisabled();
    // Les quittances des deux mois soldés existent ; aucune n'a été envoyée par ce geste.
    const quittances = (await db.query("select count(*)::int n, count(email_envoye_at)::int envoyees from quittances where bail_id=$1 and est_quittance", [bailA])).rows[0];
    expect(quittances).toEqual({ n: 2, envoyees: 0 });
    // Ce qui est parti au serveur : les deux lignes cochées, rien d'autre du relevé.
    const partis = envois.join("\n");
    expect(partis).toContain("VIR SEPA M FICTIF CAMILLE LOYER");
    expect(partis).not.toMatch(/PHARMACIE|MUTUELLE|99812|EDF/);
    await tientDansLEcran(page, bilan);
    await page.screenshot({ path: info.outputPath("pointage-enregistre.png"), fullPage: true });

    // 5. Zoé : la ligne « à vérifier » se coche à la main.
    await deZoe.getByRole("checkbox").check();
    await expect(bouton).toHaveText("Enregistrer le règlement coché");
    await bouton.click();
    await expect(bilan).toContainText("1 règlement enregistré.", { timeout: 60_000 });
    await expect(deja.locator("li")).toHaveCount(3, { timeout: 30_000 });
    // Dans l'ordre des dates puis des montants : le loyer ancien de Camille, puis, la veille, Zoé (650 €) et Camille (800 €).
    expect((await reglements()).map((r) => [r.lot_id, r.montant, r.mode])).toEqual([[lotA, 800, "virement"], [lotB, 650, "virement"], [lotA, 800, "virement"]]);

    // Le même relevé, redonné après rechargement : tout est reconnu, rien n'est à confirmer, rien ne se double.
    await page.reload();
    await expect(ecran).toBeVisible({ timeout: 30_000 });
    await donner();
    await expect(resume).toContainText("4 sommes reçues : 0 à confirmer, 3 déjà enregistrées, 1 sans loyer à pointer.");
    await expect(ecran.locator("[data-rien-a-confirmer]")).toBeVisible();
    await expect(ecran.locator("[data-enregistrer-pointage]")).toHaveCount(0);
    await deja.locator("summary").click();
    await expect(deja.locator("li").first()).toContainText("Déjà enregistré à partir de ce relevé.");
    expect(await reglements()).toHaveLength(3);
    await page.screenshot({ path: info.outputPath("pointage-releve-redonne.png"), fullPage: true });

    // Le bail de Camille montre les deux règlements avec leur provenance.
    await page.goto(`/espace/${ORG}/baux/${bailA}`);
    await expect(page.locator("body")).toContainText("Pointé sur un relevé de banque : VIR SEPA M FICTIF CAMILLE LOYER", { timeout: 30_000 });
  } finally {
    await db.query("rollback").catch(() => undefined);
    try {
      await db.query("begin");
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
