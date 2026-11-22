import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

// ÉTAT DES LIEUX : UNE PHOTO PAR ÉLÉMENT, REPRISE DANS LE DOCUMENT (audit palier 1 du 22/11/2026, P2-01).
//
// Dans le navigateur d'un propriétaire fictif, sur un état des lieux d'entrée en cours de saisie :
//   1. une photo est ajoutée à un élément de la grille, sans que la saisie en cours (non enregistrée) soit perdue ;
//      elle est déposée dans les documents du bail et se rouvre par « Voir la photo » ;
//   2. le PDF est RÉELLEMENT généré puis relu : la photo y est imprimée, numérotée, avec sa légende, et la ligne de
//      l'élément y renvoie ;
//   3. la photo se remplace, puis se retire (le fichier reste dans les documents du bail) ;
//   4. une fois l'état des lieux signé, la photo se consulte mais ne se modifie plus.
// Espace, compte, logement et bail fictifs, propres à ce parcours (ils restent dans la base du banc, comme ceux des
// autres parcours à espace dédié).

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 });

async function lirePdf(octets: Buffer): Promise<{ texte: string; images: number }> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chargement = getDocument({ data: new Uint8Array(octets), useSystemFonts: false });
  const pdf = await chargement.promise;
  try {
    const pages: string[] = [];
    let images = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const feuille = await pdf.getPage(n);
      const contenu = await feuille.getTextContent();
      pages.push(contenu.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      const operations = await feuille.getOperatorList();
      images += operations.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageXObjectRepeat).length;
    }
    return { texte: pages.join(" ").replace(/\s+/g, " "), images };
  } finally { await chargement.destroy(); }
}

async function ouvrirEtape(page: Page, rang: string, bouton: RegExp) {
  const navigation = page.getByRole("navigation", { name: "Étapes : État des lieux", exact: true });
  await expect(navigation).toBeVisible();
  const choix = navigation.getByLabel("Aller à une étape", { exact: true });
  if (await choix.isVisible()) await choix.selectOption(rang);
  else await navigation.getByRole("button", { name: bouton }).click();
}

/** Une image PNG fabriquée dans la page (aucun fichier réel) : un aplat de couleur avec un motif. */
async function imageFictive(page: Page, couleur: string): Promise<Buffer> {
  const donnees = await page.evaluate((teinte) => {
    const toile = document.createElement("canvas");
    toile.width = 640; toile.height = 480;
    const trait = toile.getContext("2d")!;
    trait.fillStyle = teinte; trait.fillRect(0, 0, 640, 480);
    trait.fillStyle = "#ffffff"; trait.fillRect(80, 80, 200, 120);
    trait.fillStyle = "#222222"; trait.fillRect(320, 240, 240, 160);
    return toile.toDataURL("image/png").split(",")[1];
  }, couleur);
  return Buffer.from(donnees, "base64");
}

test("état des lieux : photo ajoutée à un élément, imprimée et numérotée dans le PDF, remplacée, retirée, figée après signature", async ({ page }, info) => {
  test.setTimeout(300_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const org = randomUUID(), compte = randomUUID(), bailleur = randomUUID(), locataire = randomUUID(), bien = randomUUID();
  const lot = randomUUID(), bail = randomUUID(), edl = randomUUID(), sols = randomUUID(), murs = randomUUID();
  const email = `edl-photos-${org}@example.invalid`, motDePasse = randomUUID(), nom = `ESSAI EDL photos ${org.slice(0, 8)}`;
  const chemin = `/espace/${org}/baux/${bail}/edl/${edl}`;
  const ligne = async (id: string) => (await db.query("select photo_document_id p, commentaire c from edl_lignes where id=$1", [id])).rows[0] as { p: string | null; c: string | null };
  try {
    const { rows: [d] } = await db.query("select (public.aujourdhui_paris() - 3)::text debut");
    await db.query("begin");
    await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"prenom":"Propriétaire","nom":"Essai photos"}',now(),now(),'','','','','')`, [compte, email, motDePasse]);
    await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription','conditions_clients')", [compte, CONDITIONS_VERSION]);
    await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75001','Paris',$3)", [org, nom, email]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    await db.query(`insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city)
      values($1,$3,$4,'Essai photos','Propriétaire',$5,'Personne physique','1 rue des Essais','75001','Paris'),
            ($2,$3,null,'Essai photos','Locataire',null,'Personne physique','2 rue des Essais','75001','Paris')`, [bailleur, locataire, org, compte, email]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'immeuble','1 rue des Essais','75001','Paris')", [bien, org, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'loue',40)", [lot, org, bien, `${nom} A`]);
    await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,$4)", [lot, org, bailleur, d.debut]);
    await db.query("insert into baux(id,organization_id,lot_id,type,etat,loyer_hc,charges,charges_mode,date_debut,locataire_principal) values($1,$2,$3,'nu','actif',600,40,'provision',$4,$5)", [bail, org, lot, d.debut, locataire]);
    await db.query(`insert into etats_des_lieux(id,organization_id,bail_id,type,etat,date_edl,personnes_presentes,detecteur_fumee_present,detecteur_fumee_etat,attestation_assurance_fournie,observations)
      values($1,$2,$3,'entree','brouillon',$4,'Le bailleur et le locataire',true,'Fonctionnel',true,'Néant')`, [edl, org, bail, d.debut]);
    await db.query(`insert into edl_lignes(id,organization_id,edl_id,categorie,piece,libelle,etat,ordre) values
      ($1,$3,$4,'piece','Séjour','Sols','bon',1),($2,$3,$4,'piece','Séjour','Murs','bon',2)`, [sols, murs, org, edl]);
    await db.query("insert into edl_compteurs(organization_id,edl_id,type,numero,releve) values($1,$2,'Électricité','ESSAI-1',1234)", [org, edl]);
    await db.query("insert into edl_cles(organization_id,edl_id,libelle,nombre) values($1,$2,'Clé de la porte d’entrée',2)", [org, edl]);
    await db.query("commit");

    await sansSyntheseAlertes(page);
    await connecterVers(page, email, motDePasse, chemin);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/État des lieux d.entrée/);
    await ouvrirEtape(page, "1", /^Étape 02 Les pièces /);
    await expect(page.getByRole("heading", { name: "Les pièces", exact: true })).toBeVisible();

    // ── 1. Ajouter une photo à « Sols », saisie en cours non enregistrée.
    const blocs = page.locator("[data-photo-ligne]");
    await expect(blocs).toHaveCount(2);
    await expect(blocs.first()).toHaveAttribute("data-photo-ligne", "non");
    await expect(page.getByRole("button", { name: "Ajouter une photo — Sols", exact: true })).toBeVisible();
    const observation = page.locator(`input[name="commentaire_${sols}"]`);
    await observation.fill("Rayure près de la fenêtre");
    await page.getByLabel("Photo — Sols", { exact: true }).setInputFiles({ name: "sols.png", mimeType: "image/png", buffer: await imageFictive(page, "#b5651d") });
    await expect(blocs.first().getByRole("status")).toHaveText("Photo ajoutée.", { timeout: 30_000 });
    await expect(blocs.first()).toHaveAttribute("data-photo-ligne", "oui");
    await expect(blocs.nth(1)).toHaveAttribute("data-photo-ligne", "non");
    // La saisie en cours n'a été ni envoyée ni perdue par l'ajout de la photo.
    await expect(observation).toHaveValue("Rayure près de la fenêtre");
    expect((await ligne(sols)).c).toBeNull();
    const premiere = (await ligne(sols)).p;
    expect(premiere).toMatch(/^[0-9a-f-]{36}$/);
    const { rows: [piece] } = await db.query("select type, titre, mime_type, organization_id from documents where id=$1", [premiere]);
    expect(piece).toMatchObject({ type: "autre", titre: "Photo d’état des lieux — Séjour — Sols", organization_id: org });
    expect(piece.mime_type).toMatch(/^image\/(?:jpeg|png)$/);
    expect((await db.query("select entite, entite_id from document_liens where document_id=$1", [premiere])).rows).toEqual([{ entite: "bail", entite_id: bail }]);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await blocs.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("edl-photo-ajoutee.png"), fullPage: true });

    // « Voir la photo » rouvre l'image déposée.
    const voir = page.getByRole("link", { name: "Voir la photo — Sols", exact: true });
    await expect(voir).toHaveAttribute("href", `/espace/${org}/documents/${premiere}/fichier`);
    const manifeste = await page.request.get(`/espace/${org}/documents/${premiere}/fichier?apercu=integre`);
    expect(manifeste.status()).toBe(200);
    const lecture = await manifeste.json() as { url: string; mime: string };
    expect(lecture.mime).toBe(piece.mime_type);
    const image = await page.request.get(lecture.url);
    expect(image.status()).toBe(200);
    expect((await image.body()).length).toBeGreaterThan(500);

    // La grille s'enregistre comme avant : l'observation part en base, la photo reste.
    await page.getByRole("button", { name: "Enregistrer la grille" }).click();
    await expect(async () => expect((await ligne(sols)).c).toBe("Rayure près de la fenêtre")).toPass({ timeout: 20_000 });
    expect((await ligne(sols)).p).toBe(premiere);

    // ── 2. Le PDF généré imprime la photo, numérotée, et la ligne y renvoie.
    await page.goto(chemin);
    await ouvrirEtape(page, "3", /^Étape 04 Validation /);
    const generer = page.getByRole("button", { name: "Générer le PDF", exact: true });
    await expect(generer).toBeVisible();
    await generer.click();
    const lien = page.getByRole("link", { name: "Ouvrir le PDF", exact: true });
    await expect(lien).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("À renseigner avant de générer le PDF")).toHaveCount(0);
    const manifestePdf = await page.request.get(`${await lien.getAttribute("href")}?apercu=integre`);
    expect(manifestePdf.status()).toBe(200);
    const pdf = await manifestePdf.json() as { url: string; mime: string };
    expect(pdf.mime).toBe("application/pdf");
    const octets = await (await page.request.get(pdf.url)).body();
    expect(octets.subarray(0, 5).toString()).toBe("%PDF-");
    const document = await lirePdf(octets);
    expect(document.texte).toMatch(/État des lieux d.entrée/);
    expect(document.texte).toMatch(/Rayure près de la fenêtre\s*\(photo n° 1\)/);
    expect(document.texte).toContain("Une photo est jointe au présent état des lieux");
    expect(document.texte).toMatch(/Photo n° 1 — Séjour — Sols/);
    expect(document.texte).not.toContain("image indisponible");
    expect(document.texte).not.toMatch(/Photo n° 2/);
    // L'image elle-même est dans le PDF, pas seulement sa légende.
    expect(document.images).toBeGreaterThanOrEqual(1);

    // ── 3. Remplacer, puis retirer.
    await page.goto(chemin);
    await ouvrirEtape(page, "1", /^Étape 02 Les pièces /);
    await expect(blocs.first()).toHaveAttribute("data-photo-ligne", "oui");
    await expect(page.getByRole("button", { name: "Remplacer la photo — Sols", exact: true })).toBeVisible();
    await page.getByLabel("Photo — Sols", { exact: true }).setInputFiles({ name: "sols-2.png", mimeType: "image/png", buffer: await imageFictive(page, "#2e6f95") });
    await expect(blocs.first().getByRole("status")).toHaveText("Photo remplacée.", { timeout: 30_000 });
    const seconde = (await ligne(sols)).p;
    expect(seconde).toMatch(/^[0-9a-f-]{36}$/);
    expect(seconde).not.toBe(premiere);
    await expect(page.getByRole("link", { name: "Voir la photo — Sols", exact: true })).toHaveAttribute("href", `/espace/${org}/documents/${seconde}/fichier`);

    // Un fichier qui n'est pas une image est refusé, la photo en place reste.
    await page.getByLabel("Photo — Murs", { exact: true }).setInputFiles({ name: "note.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") });
    await expect(blocs.nth(1).getByRole("alert")).toHaveText("Une photo doit être une image JPEG ou PNG.", { timeout: 30_000 });
    expect((await ligne(murs)).p).toBeNull();

    await page.getByRole("button", { name: "Retirer la photo — Sols", exact: true }).click();
    await expect(blocs.first().getByRole("status")).toHaveText("Photo retirée de l’état des lieux. Le fichier reste dans les documents du bail.", { timeout: 30_000 });
    await expect(blocs.first()).toHaveAttribute("data-photo-ligne", "non");
    expect((await ligne(sols)).p).toBeNull();
    // Les deux fichiers restent dans les documents de l'espace.
    expect((await db.query("select count(*)::int n from documents where id = any($1::uuid[])", [[premiere, seconde]])).rows[0].n).toBe(2);

    // ── 4. Signé : la photo se consulte, ne se modifie plus.
    await page.getByLabel("Photo — Murs", { exact: true }).setInputFiles({ name: "murs.png", mimeType: "image/png", buffer: await imageFictive(page, "#6a994e") });
    await expect(blocs.nth(1).getByRole("status")).toHaveText("Photo ajoutée.", { timeout: 30_000 });
    const photoMurs = (await ligne(murs)).p;
    await db.query("update etats_des_lieux set etat='signe', signe_le=now() where id=$1", [edl]);
    await page.goto(chemin);
    await expect(page.getByRole("link", { name: "Voir la photo — Murs", exact: true })).toHaveAttribute("href", `/espace/${org}/documents/${photoMurs}/fichier`, { timeout: 20_000 });
    await expect(page.locator("[data-photo-ligne]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^(?:Ajouter une|Remplacer la|Retirer la) photo/ })).toHaveCount(0);
    await expect(page.locator('input[type="file"][aria-label^="Photo — "]')).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("edl-photo-signe.png"), fullPage: true });
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
});
