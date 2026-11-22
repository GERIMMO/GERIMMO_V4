import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

// DEVIS : LA GARANTIE ANNONCÉE PAR L'ARTISAN (audit palier 1 du 22/11/2026, P2-02, seconde partie).
//
// L'écart : rien, ni sur le devis ni au dossier, ne disait quelle garantie l'artisan annonce. Ici, dans deux navigateurs :
//   1. l'artisan prépare son devis, écrit la garantie qu'il annonce, valide (le PDF est RÉELLEMENT généré) et envoie ;
//   2. la garantie est recopiée sur le devis déposé et imprimée sur le PDF, relu ;
//   3. le propriétaire ouvre le dossier de l'incident : il lit la garantie sur la carte du devis, avec la mention
//      « Engagement de l'artisan, pas de Gerimmo ».
// L'espace, le compte du propriétaire, le logement et l'incident sont fictifs et propres à ce parcours (ils restent dans
// la base du banc, comme ceux des autres parcours à espace dédié). L'artisan est celui du banc : sa demande, son devis
// et l'adresse d'entreprise posée pour l'essai sont retirés à la fin.

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 15_000 });

async function etape(page: Page, n: number) {
  const choix = page.getByLabel("Aller à une étape", { exact: true });
  if (await choix.isVisible()) await choix.selectOption(String(n - 1));
  else await page.getByRole("button", { name: new RegExp(`^Étape ${String(n).padStart(2, "0")} `) }).click();
}

async function texteDuPdf(octets: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chargement = getDocument({ data: new Uint8Array(octets), useSystemFonts: false });
  const pdf = await chargement.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const contenu = await (await pdf.getPage(n)).getTextContent();
      pages.push(contenu.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join(" ").replace(/\s+/g, " ");
  } finally { await chargement.destroy(); }
}

test("devis : l'artisan annonce sa garantie ; elle est sur le PDF et le propriétaire la lit dans le dossier", async ({ page, context, browser }, info) => {
  test.setTimeout(300_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const org = randomUUID(), compte = randomUUID(), bailleur = randomUUID(), bien = randomUUID(), lot = randomUUID();
  const incident = randomUUID(), consultation = randomUUID(), demande = randomUUID(), marque = org.slice(0, 8);
  const email = `garantie-${org}@example.invalid`, motDePasse = randomUUID(), nom = `ESSAI Garantie ${marque}`;
  const GARANTIE = `Un an, pièces et main-d’œuvre (essai ${marque})`;
  let artisanId = "";
  // L'adresse d'entreprise de l'artisan du banc avant l'essai : absente (null), vide, ou déjà renseignée.
  let adresseAvant: string | null | undefined;
  try {
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    artisanId = a.id;
    await db.query("begin");
    await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"prenom":"Propriétaire","nom":"Essai garantie"}',now(),now(),'','','','','')`, [compte, email, motDePasse]);
    await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription','conditions_clients')", [compte, CONDITIONS_VERSION]);
    await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75001','Paris',$3)", [org, nom, email]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$2,$3,'Essai garantie','Propriétaire',$4,'Personne physique','1 rue des Essais','75001','Paris')", [bailleur, org, compte, email]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Essais','75001','Paris')", [bien, org, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'disponible',40)", [lot, org, bien, `${nom} A`]);
    await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-30)", [lot, org, bailleur]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat) values($1,$2,$3,$4,'agence','plomberie_canalisation',$5,'declare')", [incident, org, lot, `ESSAI-${marque}`, `ESSAI garantie : fuite fictive ${marque}`]);
    await db.query("insert into incident_consultations(id,organization_id,incident_id,metier,nature_travaux) values($1,$2,$3,'plomberie','entretien_courant')", [consultation, org, incident]);
    await db.query("insert into incident_sollicitations(id,organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,$5,'envoyee')", [demande, org, consultation, incident, artisanId]);
    await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,saisie,revision) values($1,$2,$3,1)", [demande, artisanId, {
      diagnostic: `Joint usé (essai ${marque})`, delai: "Sous cinq jours", duree: "Une heure", contraintes: "", observations: "", valideJusquAu: "2099-01-30",
      lignes: [{ code: "", libelle: "Remplacement du joint", quantite: 1, prix_unitaire_ht_cents: 5000, tva_bps: 1000 }] }]);
    // Le PDF d'un devis exige l'adresse de l'entreprise : posée pour l'essai si l'artisan du banc n'en a pas, puis rendue.
    adresseAvant = (await db.query("select adresse from artisan_profils_documents where artisan_id=$1", [artisanId])).rows[0]?.adresse ?? null;
    if (adresseAvant === null) await db.query("insert into artisan_profils_documents(artisan_id,adresse,mentions) values($1,'1 rue des Artisans, 75011 Paris','')", [artisanId]);
    else if (adresseAvant === "") await db.query("update artisan_profils_documents set adresse='1 rue des Artisans, 75011 Paris' where artisan_id=$1", [artisanId]);
    await db.query("commit");

    // ── 1. L'artisan écrit la garantie qu'il annonce, valide et envoie.
    await context.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
    await sansSyntheseAlertes(page);
    await page.goto(`/artisan/devis/${demande}`);
    await expect(page.getByRole("textbox", { name: "Votre diagnostic", exact: true })).toHaveValue(`Joint usé (essai ${marque})`);
    await etape(page, 2);
    const champ = page.locator("#garantie-annoncee");
    await expect(champ).toBeVisible();
    await expect(champ).toHaveAttribute("maxlength", "300");
    await expect(champ).not.toHaveAttribute("required", /.*/);
    await expect(page.getByLabel("Garantie que vous annoncez", { exact: false })).toHaveValue("");
    await expect(page.locator("#garantie-annoncee-aide")).toHaveText("Reprise telle quelle sur votre devis et montrée au demandeur. C’est votre engagement : Gerimmo ne garantit rien à votre place.");
    await champ.fill(GARANTIE);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await champ.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("devis-garantie-saisie.png") });

    await etape(page, 3);
    await expect(page.locator("[data-garantie-annoncee]")).toContainText(`Garantie annoncée : ${GARANTIE}`);
    await page.locator('[name="validation_artisan"]').check();
    await page.getByRole("button", { name: "Valider et générer le PDF", exact: true }).click();
    await expect(page.getByText("PDF validé et enregistré. Passez à l’envoi", { exact: false })).toBeVisible({ timeout: 120_000 });
    // La saisie validée, celle que la base recopie à l'envoi, porte la garantie.
    const { rows: [prepare] } = await db.query("select statut, saisie->>'garantie' garantie from artisan_devis_preparations where sollicitation_id=$1", [demande]);
    expect(prepare).toEqual({ statut: "valide", garantie: GARANTIE });

    await etape(page, 4);
    await page.getByRole("button", { name: "Transmettre le devis et prévenir le demandeur", exact: true }).click();
    await page.waitForURL(/[?&]envoye=1/, { timeout: 60_000 });

    // ── 2. Le devis déposé porte la garantie ; le PDF classé l'imprime.
    const { rows: devis } = await db.query("select id, garantie_annoncee, statut::text, document_id, montant_ttc_cents::int ttc from incident_devis where sollicitation_id=$1", [demande]);
    expect(devis).toHaveLength(1);
    expect(devis[0]).toMatchObject({ garantie_annoncee: GARANTIE, statut: "depose", ttc: 5500 });
    expect(devis[0].document_id).toMatch(/^[0-9a-f-]{36}$/);

    // ── 3. Le propriétaire lit la garantie sur la carte du devis, et sur le PDF.
    const proprietaire = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    try {
      await proprietaire.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
      const p = await proprietaire.newPage();
      await sansSyntheseAlertes(p);
      await connecterVers(p, email, motDePasse, `/espace/${org}/incidents?sel=${incident}`);
      await expect(p.locator(".incident-dossier")).toBeVisible();
      const lue = p.locator("[data-garantie-annoncee]").first();
      if (!(await lue.isVisible())) await p.getByText("Devis et facture", { exact: true }).first().click();
      await expect(lue).toBeVisible();
      await expect(lue).toContainText("Garantie annoncée par l’artisan");
      await expect(lue).toContainText(GARANTIE);
      await expect(lue).toContainText("Engagement de l’artisan, pas de Gerimmo.");
      expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
      await lue.scrollIntoViewIfNeeded();
      await p.screenshot({ path: info.outputPath("dossier-garantie-annoncee.png"), fullPage: true });

      const manifeste = await p.request.get(`/espace/${org}/documents/${devis[0].document_id}/fichier?apercu=integre`);
      expect(manifeste.status()).toBe(200);
      const lecture = await manifeste.json() as { url: string; mime: string };
      expect(lecture.mime).toBe("application/pdf");
      const octets = await (await p.request.get(lecture.url)).body();
      expect(octets.subarray(0, 5).toString()).toBe("%PDF-");
      const texte = await texteDuPdf(octets);
      expect(texte).toContain("Devis de travaux");
      expect(texte).toContain(`Garantie annoncée par l’entreprise : ${GARANTIE}`);
      expect(texte).not.toMatch(/Gerimmo garantit|garantie? par Gerimmo/i);
    } finally { await proprietaire.close(); }
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      // La demande et le devis de l'essai quittent les listes de l'artisan du banc ; l'espace de l'essai, lui, reste.
      await db.query("delete from artisan_devis_preparations where sollicitation_id=$1", [demande]);
      await db.query("delete from notification_intentions where organization_id=$1", [org]);
      await db.query("delete from alerts where organization_id=$1", [org]);
      await db.query("delete from incident_devis where sollicitation_id=$1", [demande]);
      await db.query("delete from incident_sollicitations where id=$1", [demande]);
      await db.query("delete from incident_consultations where id=$1", [consultation]);
      await db.query("delete from incident_evenements where incident_id=$1", [incident]);
      await db.query("delete from incidents where id=$1", [incident]);
      if (adresseAvant === null) await db.query("delete from artisan_profils_documents where artisan_id=$1", [artisanId]);
      else if (adresseAvant === "") await db.query("update artisan_profils_documents set adresse='' where artisan_id=$1", [artisanId]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
