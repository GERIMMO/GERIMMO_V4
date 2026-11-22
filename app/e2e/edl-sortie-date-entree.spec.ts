import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

// L'ÉTAT DES LIEUX DE SORTIE RAPPELLE LA DATE DE CELUI D'ENTRÉE (audit palier 1 du 22/11/2026, P0-06, relevé A11).
//
// Le défaut : le PDF de sortie n'imprimait pas la date de l'état des lieux d'entrée. Ici, dans le navigateur d'un
// propriétaire fictif, le PDF est RÉELLEMENT généré puis relu :
//   1. un bail dont l'état des lieux d'entrée est signé dans Gerimmo : le PDF de sortie porte « État des lieux d'entrée
//      établi le … » avec la date de l'entrée ;
//   2. un bail sans état des lieux d'entrée dans Gerimmo : la mention reste, à compléter à la main, et le PDF se génère
//      quand même (ce blanc n'est pas une « information à renseigner » : aucun écran ne permettrait de le remplir).
//
// Le texte officiel n'a pas été ouvert : ce parcours tient que la date connue est imprimée, pas que le document est
// conforme. Espace, comptes, logements et baux fictifs, propres à ce parcours (ils restent dans la base du banc, comme
// ceux des autres parcours à espace dédié).

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 });

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

/** Ouvre l'étape « Validation » de l'état des lieux, génère le PDF et rend son texte. */
async function genererEtLire(page: Page, chemin: string): Promise<string> {
  await page.goto(chemin);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("État des lieux de sortie");
  const navigation = page.getByRole("navigation", { name: "Étapes : État des lieux", exact: true });
  await expect(navigation).toBeVisible();
  const choix = navigation.getByLabel("Aller à une étape", { exact: true });
  if (await choix.isVisible()) await choix.selectOption("3");
  else await navigation.getByRole("button", { name: /^Étape 04 Validation / }).click();
  const generer = page.getByRole("button", { name: "Générer le PDF", exact: true });
  await expect(generer).toBeVisible();
  await generer.click();
  const lien = page.getByRole("link", { name: "Ouvrir le PDF", exact: true });
  await expect(lien).toBeVisible({ timeout: 90_000 });
  // Aucune « information à renseigner » : le document est complet.
  await expect(page.getByText("À renseigner avant de générer le PDF")).toHaveCount(0);
  const manifeste = await page.request.get(`${await lien.getAttribute("href")}?apercu=integre`);
  expect(manifeste.status()).toBe(200);
  const lecture = await manifeste.json() as { url: string; mime: string };
  expect(lecture.mime).toBe("application/pdf");
  const fichier = await page.request.get(lecture.url);
  expect(fichier.status()).toBe(200);
  const octets = await fichier.body();
  expect(octets.subarray(0, 5).toString()).toBe("%PDF-");
  return texteDuPdf(octets);
}

test("état des lieux de sortie : le PDF généré porte la date de l'entrée, ou un blanc à compléter si l'entrée n'est pas dans Gerimmo", async ({ page }, info) => {
  test.setTimeout(240_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const org = randomUUID(), compte = randomUUID(), bailleur = randomUUID(), locataire = randomUUID(), bien = randomUUID();
  const avec = { lot: randomUUID(), bail: randomUUID(), entree: randomUUID(), sortie: randomUUID() };
  const sans = { lot: randomUUID(), bail: randomUUID(), sortie: randomUUID() };
  const email = `edl-sortie-${org}@example.invalid`, motDePasse = randomUUID(), nom = `ESSAI EDL sortie ${org.slice(0, 8)}`;
  try {
    const { rows: [d] } = await db.query(`select (public.aujourdhui_paris() - 400)::text debut, to_char(public.aujourdhui_paris() - 400, 'DD/MM/YYYY') debut_fr,
      public.aujourdhui_paris()::text jour`);
    await db.query("begin");
    await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"prenom":"Propriétaire","nom":"Essai EDL"}',now(),now(),'','','','','')`, [compte, email, motDePasse]);
    await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription','conditions_clients')", [compte, CONDITIONS_VERSION]);
    await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75001','Paris',$3)", [org, nom, email]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    await db.query(`insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city)
      values($1,$3,$4,'Essai EDL','Propriétaire',$5,'Personne physique','1 rue des Essais','75001','Paris'),
            ($2,$3,null,'Essai EDL','Locataire',null,'Personne physique','2 rue des Essais','75001','Paris')`, [bailleur, locataire, org, compte, email]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'immeuble','1 rue des Essais','75001','Paris')", [bien, org, nom]);
    for (const [cas, suffixe] of [[avec, "A"], [sans, "B"]] as const) {
      await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'loue',40)", [cas.lot, org, bien, `${nom} ${suffixe}`]);
      await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,$4)", [cas.lot, org, bailleur, d.debut]);
      await db.query("insert into baux(id,organization_id,lot_id,type,etat,loyer_hc,charges,charges_mode,date_debut,locataire_principal) values($1,$2,$3,'nu','actif',600,40,'provision',$4,$5)", [cas.bail, org, cas.lot, d.debut, locataire]);
      await db.query(`insert into etats_des_lieux(id,organization_id,bail_id,type,etat,date_edl,personnes_presentes,adresse_restitution_depot,observations)
        values($1,$2,$3,'sortie','brouillon',$4,'Le bailleur et le locataire','2 rue des Essais, 75001 Paris','Néant')`, [cas.sortie, org, cas.bail, d.jour]);
      await db.query("insert into edl_lignes(organization_id,edl_id,categorie,piece,libelle,etat,ordre) values($1,$2,'piece','Séjour','Sols','bon',1)", [org, cas.sortie]);
      await db.query("insert into edl_compteurs(organization_id,edl_id,type,numero,releve) values($1,$2,'Électricité','ESSAI-1',1234)", [org, cas.sortie]);
      await db.query("insert into edl_cles(organization_id,edl_id,libelle,nombre) values($1,$2,'Clé de la porte d’entrée',2)", [org, cas.sortie]);
    }
    // Seul le premier bail a un état des lieux d'entrée signé dans Gerimmo, établi le jour de l'entrée dans les lieux.
    await db.query("insert into etats_des_lieux(id,organization_id,bail_id,type,etat,date_edl,signe_le,personnes_presentes,observations) values($1,$2,$3,'entree','signe',$4,now(),'Le bailleur et le locataire','Néant')", [avec.entree, org, avec.bail, d.debut]);
    await db.query("commit");

    await sansSyntheseAlertes(page);
    await connecterVers(page, email, motDePasse, `/espace/${org}/baux/${avec.bail}/edl/${avec.sortie}`);

    // ── 1. L'entrée est signée dans Gerimmo : sa date est imprimée dans le PDF de sortie.
    const texteAvec = await genererEtLire(page, `/espace/${org}/baux/${avec.bail}/edl/${avec.sortie}`);
    expect(texteAvec).toContain("État des lieux de sortie");
    expect(texteAvec).toMatch(new RegExp(`État des lieux d['’]entrée établi le ${d.debut_fr.replaceAll("/", "\\/")}\\s?\\.`));
    expect(texteAvec).not.toContain("date à porter à la main");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("edl-sortie-genere.png"), fullPage: true });

    // ── 2. Pas d'entrée dans Gerimmo : la mention reste, à compléter à la main, et le PDF se génère.
    const texteSans = await genererEtLire(page, `/espace/${org}/baux/${sans.bail}/edl/${sans.sortie}`);
    expect(texteSans).toMatch(/État des lieux d['’]entrée établi le date à porter à la main/);
    expect(texteSans).toMatch(/aucun état des lieux d['’]entrée signé n['’]est enregistré dans Gerimmo pour ce bail/);
    expect(texteSans).not.toContain(d.debut_fr);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
});
