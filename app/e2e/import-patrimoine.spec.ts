import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, sansSyntheseAlertes } from "./aides";

test("100 biens fictifs, deux doublons repérés et une adresse corrigée", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  if (!cible || !/^postgres(?:ql)?:\/\/postgres(?::gerimmo-ci-local)?@127\.0\.0\.1:\d{1,5}\/gerimmo_ci_(?:sql|patrimoine)_api$/.test(cible)) {
    throw new Error("Base API fictive locale obligatoire.");
  }
  const db = new Client({ connectionString: cible });
  await db.connect();
  try {
    const orgId = randomUUID();
    const email = `import-${orgId}@example.invalid`;
    const motDePasse = `${randomUUID()}!A`;
    await db.query("begin");
    await db.query("select public.tache_systeme()");
    const { rows: [compte] } = await db.query<{ id: string }>(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
        email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,
        extensions.crypt($2,extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','') returning id`,
      [email, motDePasse],
    );
    await db.query("insert into organizations(id,name,type,status) values($1,'Import fictif 100 biens','agence','active')", [orgId]);
    await db.query("insert into memberships(organization_id,account_id,role,status) values($1,$2,'admin_agence','active')", [orgId, compte.id]);
    await db.query("commit");

    await sansSyntheseAlertes(page);
    await connecterVers(page, email, motDePasse, `/agence/${orgId}/parc/import`);
    const prefixe = "Recette fictive";
    const biens = Array.from({ length: 100 }, (_, i) =>
      `${prefixe} ${i + 1};appartement;${i + 1} rue Fictive;75001;Paris;Logement;Titulaire fictif`
    );
    const contenu = [
      "bien;type;adresse;code_postal;ville;lot;proprietaire_nom",
      ...biens,
      biens[9],
      biens[23],
    ].join("\n");
    await page.locator('input[type="file"]').setInputFiles({
      name: "100-biens-fictifs.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(contenu),
    });
    const debutApercu = performance.now();
    await page.getByRole("button", { name: "Contrôler le fichier" }).click();
    await expect(page.getByText("2 lignes identiques écartées.")).toBeVisible();
    const apercuMs = performance.now() - debutApercu;

    await page.getByRole("button", { name: "Modifier la ligne 1", exact: true }).click();
    await page.getByRole("group", { name: "Modifier la ligne 1", exact: true }).getByLabel("Adresse", { exact: true }).fill("1 rue de la Recette fictive");
    await page.getByRole("button", { name: "Contrôler la correction" }).click();
    await expect(page.getByText(/1 rue de la Recette fictive/)).toBeVisible();

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("heading", { name: "Ce que dit le contrôle" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`import-apercu-${width}.png`), animations: "disabled" });
    }
    const debutImport = performance.now();
    await page.getByRole("button", { name: "Importer 100 lignes" }).click();
    const resultat = page.getByRole("list", { name: "Résultat ligne par ligne de l'import" });
    await expect(resultat.getByRole("link")).toHaveCount(100, { timeout: 45_000 });
    const importMs = performance.now() - debutImport;
    await info.attach("Mesure du banc local", {
      body: JSON.stringify({ apercuMs: Math.round(apercuMs), importMs: Math.round(importMs) }),
      contentType: "application/json",
    });

    const liens = await resultat.getByRole("link").evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
    expect(new Set(liens).size).toBe(100);
    await resultat.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/parc\/[^/]+\/lots\/[^/]+/);
    const { rows: [bilan] } = await db.query(
      `select count(distinct b.id)::int biens, count(l.id)::int lots,
         count(*) filter (where b.address_line1 = '1 rue de la Recette fictive')::int adresses_corrigees
       from biens b join lots l on l.bien_id = b.id where b.organization_id = $1`, [orgId],
    );
    expect(bilan).toEqual({ biens: 100, lots: 100, adresses_corrigees: 1 });
  } finally {
    await db.end();
  }
});
