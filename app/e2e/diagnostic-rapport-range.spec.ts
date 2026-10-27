import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// DOC-02 (audit de la refonte #264) : un rapport d'abord rangé dans Documents en « Autre » était refusé comme doublon
// quand on le déclarait ensuite comme DPE du lot, sans aucune issue — le lot restait bloqué sur « DPE absent ». Le même
// fichier se déclare désormais comme rapport : la pièce est reclassée « Diagnostic » et le blocage DPE tombe.
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const BLOCAGE_DPE = "DPE absent ou expiré (obligatoire en habitation)";
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

async function ligneDpe(page: Page) {
  const ligne = page.locator("li").filter({ has: page.locator("strong", { hasText: /^DPE$/ }) }).first();
  if (!(await ligne.isVisible().catch(() => false))) {
    await page.locator("summary, button").filter({ has: page.locator("h2#documents-fiche") }).first().click();
  }
  await expect(ligne).toBeVisible();
  return ligne;
}

test("un rapport rangé en « Autre » se déclare comme DPE du lot et lève le blocage", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, "Base API locale fictive obligatoire.");
  const url = new URL(cible!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
  const db = new Client({ connectionString: cible }); await db.connect();
  const lot = randomUUID();
  const nom = `rapport-dpe-range-${randomUUID().slice(0, 8)}`;
  try {
    const source = (await db.query("select id,bien_id from public.lots where organization_id=$1 and nom='Appartement T2 — 12 rue des Lilas'", [ORG])).rows[0];
    expect(source).toBeTruthy();
    await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,to_jsonb(l)||jsonb_build_object('id',$1::text,'nom','Diagnostic rangé — essai local','etat','brouillon'))).* from public.lots l where id=$2`, [lot, source.id]);
    expect((await db.query("select public.lot_blocages_location($1) b", [lot])).rows[0].b).toContain(BLOCAGE_DPE);
    await sansSyntheseAlertes(page);
    const fichier = { name: `${nom}.pdf`, mimeType: "application/pdf", buffer: pdfFictif() };

    // 1. Le rapport est d'abord rangé dans Documents, en « Autre » (« Diagnostic » n'y est pas proposé).
    await page.goto(`/espace/${ORG}/documents?sel=depot`);
    const depot = page.locator("form").filter({ has: page.getByRole("button", { name: "Déposer le document", exact: true }) });
    await depot.locator('input[type="file"]').setInputFiles(fichier);
    await depot.getByLabel("Type de document", { exact: true }).selectOption("autre");
    await depot.getByRole("button", { name: "Déposer le document", exact: true }).click();
    await expect(page.getByText("Document déposé.")).toBeVisible({ timeout: 30_000 });

    // 2. Le même fichier, déclaré comme DPE du lot : la proposition remplace l'impasse.
    await page.goto(`/espace/${ORG}/parc/${source.bien_id}/lots/${lot}`);
    let ligne = await ligneDpe(page);
    await ligne.getByRole("button", { name: "Ajouter le fichier" }).click();
    await ligne.locator('input[type="file"]').setInputFiles(fichier);
    await ligne.getByLabel("Réalisé le").fill("2022-03-15");
    await ligne.getByLabel("Classe énergétique (DPE)").selectOption("C");
    await ligne.getByRole("button", { name: "Déposer", exact: true }).click();
    const proposition = ligne.getByRole("status").filter({ hasText: "déjà dans vos documents" });
    await expect(proposition).toContainText("rangé en « Autre »");
    await expect(proposition).toContainText("classé en « Diagnostic »");
    await expect(ligne.getByRole("alert")).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath("proposition.png") });
    await ligne.getByRole("button", { name: "Utiliser ce fichier comme rapport" }).click();
    await expect(page.getByRole("status").filter({ hasText: /sans copie supplémentaire\. Elle est désormais classée en « Diagnostic »/ })).toBeVisible({ timeout: 20_000 });

    // 3. Le lot a son DPE, la pièce n'a pas été copiée, elle est reclassée, et le blocage est levé.
    await page.reload();
    ligne = await ligneDpe(page);
    await expect(ligne).toContainText("Valide");
    await expect(ligne).toContainText("Échéance le 15/03/2032");
    const pieces = (await db.query("select d.type::text type from public.documents d where d.organization_id=$1 and d.titre=$2", [ORG, nom])).rows;
    expect(pieces).toEqual([{ type: "diagnostic" }]);
    expect((await db.query("select public.lot_blocages_location($1) b", [lot])).rows[0].b).not.toContain(BLOCAGE_DPE);
  } finally {
    const docs = (await db.query("select id from public.documents where organization_id=$1 and titre=$2", [ORG, nom])).rows.map(r => r.id);
    await db.query("delete from public.diagnostics where lot_id=$1", [lot]);
    await db.query("delete from public.document_liens where document_id=any($1::uuid[])", [docs]);
    await db.query("delete from public.acces_pieces_log where document_id=any($1::uuid[])", [docs]);
    await db.query("delete from public.documents where id=any($1::uuid[])", [docs]);
    await db.query("delete from public.lots where id=$1", [lot]);
    await db.end();
  }
});
