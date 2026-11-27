import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { baseApiFictive } from "./local/base-api-fictive";

const montant = /640,00\s*€.*240,00\s*€.*0,00\s*€.*400,00\s*€/;
const groupe = 'dl[aria-label="Montants des échéances"]';

for (const largeur of [390, 768, 1440]) test(`suivi des loyers : SCI, 640 € et versement partiel, jusqu’aux exports à ${largeur} px`, async ({ page, baseURL }, info) => {
  baseApiFictive(process.env.SUPALOCAL_DB);
  expect(new URL(baseURL!).hostname).toMatch(/^(?:localhost|127\.0\.0\.1)$/);
  const db = new Client({ connectionString: process.env.SUPALOCAL_DB });
  const [org, compte, titulaire, bien, lot, locataire, bail] = Array.from({ length: 7 }, () => randomUUID());
  const email = `suivi-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const nomSci = "SCI fictive du Verger et des Logements du Centre";
  const espace = `/espace/${org}`;
  await db.connect();
  try {
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,essai_fin) values($1,$2,'proprietaire_direct','essai',current_date+14)", [org, "Recette loyers"]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')", [compte, email, motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [org, compte]);
    await db.query("insert into persons(id,organization_id,nom,qualite) values($1,$3,$4,'SCI'),($2,$3,'Camille Fictive',null)", [titulaire, locataire, org, nomSci]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'Maison de recette','maison','1 rue de recette','75001','Paris')", [bien, org]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,'Logement SCI de recette','loue')", [lot, org, bien]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2020-01-01')", [org, lot, titulaire]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-45,600,40,1)", [bail, org, lot, locataire]);
    await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,date_trunc('month',public.aujourdhui_paris()),date_trunc('month',public.aujourdhui_paris()),600,40,640)", [org, bail]);
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,240,public.aujourdhui_paris(),'virement')", [org, bail]);
    await db.query("commit");
    await page.setViewportSize({ width: largeur, height: 960 });
    await sansSyntheseAlertes(page);
    await connecterVers(page, email, motDePasse, espace);
    await expect(page.locator(groupe).first()).toContainText(montant);
    await expect(page.getByRole("heading", { name: /À faire maintenant.*tâches? dans vos logements/ })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.getByRole("main").screenshot({ scale: "css", path: info.outputPath(`accueil-${largeur}.png`) });
    await page.getByRole("link", { name: "D’où vient ce total ?" }).click();
    const details = page.locator("#detail-total-loyers");
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText("Logement SCI de recette");
    const filtre = page.getByRole("combobox", { name: "Patrimoine", exact: true });
    expect((await filtre.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (largeur === 390) expect((await filtre.boundingBox())!.width).toBeGreaterThanOrEqual(290);
    await filtre.selectOption(titulaire);
    await expect(page.getByText(`Loyers attribuables à ${nomSci}`, { exact: false })).toBeVisible();
    const libelleSelectionne = page.locator("label").filter({ has: filtre }).locator("span[aria-hidden=true]");
    await expect(libelleSelectionne).toHaveText(`${nomSci} · SCI`);
    await expect(libelleSelectionne).toBeVisible();
    await expect(page.locator(groupe).first()).toContainText(montant);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.getByRole("main").screenshot({ scale: "css", path: info.outputPath(`finances-${largeur}.png`) });
    const dl = (format: string) => page.getByRole("link", { name: `Exporter en ${format}`, exact: true }).getAttribute("href");
    const csv = await page.request.get((await dl("CSV"))!);
    expect(csv.ok()).toBeTruthy();
    expect(await csv.text()).toContain("Total;;640,00;240,00;0,00;400,00");
    const pdf = await page.request.get((await dl("PDF"))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const chargement = getDocument({ data: new Uint8Array(await pdf.body()), useSystemFonts: false });
    const document = await chargement.promise;
    try {
      const premiere = await document.getPage(1);
      const texte = (await premiere.getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
      expect(texte).toMatch(/Total\s+640,00\s*€\s+240,00\s*€\s+0,00\s*€\s+400,00\s*€/);
    } finally { await chargement.destroy(); }
    if (!await details.getByRole("link", { name: "Consulter les règlements du bail" }).isVisible()) {
      await details.locator("summary").click();
    }
    await details.getByRole("link", { name: "Consulter les règlements du bail" }).click();
    await expect(page).toHaveURL(new RegExp(`/baux/${bail}#versements-loyers$`));
    await expect(page.locator("#versements-loyers")).toContainText("240,00");
    await expect(page.locator("#loyers").locator(groupe).first()).toContainText(montant);
    await expect(page.locator("#loyers .rang-echeance").locator(groupe)).toContainText(montant);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.locator("#loyers").screenshot({ scale: "css", path: info.outputPath(`bail-${largeur}.png`) });
  } finally { await db.end(); }
});
