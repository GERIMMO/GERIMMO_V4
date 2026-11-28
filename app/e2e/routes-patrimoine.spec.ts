import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { entrerDansEspace, sansSyntheseAlertes } from "./aides";

test.use({ storageState: "e2e/.auth/admin.json" });

test("les anciennes adresses du diagnostic, du lot et de l’incident ouvrent leur dossier", async ({ page }) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  expect(cible).toMatch(/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/);
  const db = new Client({ connectionString: cible });
  await sansSyntheseAlertes(page);
  const org = await entrerDansEspace(page, "agence");
  const base = `/agence/${org}`;
  await db.connect();
  try {
    const { rows: [diagnostic] } = await db.query<{ id: string; bien_id: string; lot_id: string }>(
      `select d.id, coalesce(d.bien_id, l.bien_id) bien_id, d.lot_id
       from diagnostics d left join lots l on l.id = d.lot_id
       where d.organization_id = $1 and d.archived_at is null
       order by d.created_at limit 1`, [org],
    );
    const { rows: [lot] } = await db.query<{ id: string; bien_id: string }>(
      "select id, bien_id from lots where organization_id = $1 order by created_at limit 1", [org],
    );
    const { rows: [incident] } = await db.query<{ id: string }>(
      "select id from incidents where organization_id = $1 order by created_at limit 1", [org],
    );
    expect(diagnostic?.bien_id).toBeTruthy();
    expect(lot?.id).toBeTruthy();
    expect(incident?.id).toBeTruthy();

    await page.goto(`${base}/diagnostics/${diagnostic.id}`);
    await expect(page).toHaveURL(new RegExp(
      `${base}/parc/${diagnostic.bien_id}${diagnostic.lot_id ? `/lots/${diagnostic.lot_id}` : ""}#diagnostics$`,
    ));

    await page.goto(`${base}/lots/${lot.id}?vers=caracteristiques`);
    await expect(page).toHaveURL(new RegExp(`${base}/parc/${lot.bien_id}/lots/${lot.id}(?:[?#]|$)`));

    await page.goto(`${base}/incidents/${incident.id}`);
    await expect(page).toHaveURL((url) => url.pathname === `${base}/incidents` && url.searchParams.get("sel") === incident.id);
  } finally {
    await db.end();
  }
});
