import { test, expect } from "@playwright/test";
import { Client } from "pg";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

/**
 * G-19 (recette du 11/11/2026) : dans « Gérer cette détention », le bouton « Fermer » mettait fin à la propriété
 * du lot au premier clic, sans avertissement. Le bouton dit maintenant ce qu'il fait et demande une confirmation ;
 * « Annuler » ne change rien.
 */
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const NOM = "Détention — essai local";
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

test("G-19 : mettre fin à une détention exige une confirmation explicite", async ({ page }) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, "Base API locale fictive obligatoire.");
  const url = new URL(cible!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  let lot = "";
  // La synthèse des alertes s'ouvre à l'arrivée si d'autres parcours ont laissé des alertes : à poser AVANT la navigation.
  await sansSyntheseAlertes(page);
  const nettoyer = async (id: string) => {
    for (const sql of ["delete from public.detentions where lot_id=$1", "delete from public.lots where id=$1"]) await db.query(sql, [id]).catch(() => {});
  };
  try {
    // Rejouable : un passage interrompu (délai dépassé) a pu laisser son lot fictif.
    for (const { id } of (await db.query("select id from public.lots where organization_id=$1 and nom=$2", [ORG, NOM])).rows) await nettoyer(id);
    const source = (await db.query("select id, bien_id from public.lots where organization_id=$1 and nom='Appartement T2 — 12 rue des Lilas'", [ORG])).rows[0];
    lot = (await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid()::text, 'nom', $2::text, 'etat', 'disponible'))).* from public.lots l where l.id=$1 returning id`, [source.id, NOM])).rows[0].id;
    // Une détention commencée hier : la clore aujourd'hui est possible (une détention future se supprime).
    const detention = (await db.query("insert into public.detentions(organization_id, lot_id, person_id, quote_part, date_debut) select organization_id, $2, person_id, quote_part, current_date - 1 from public.detentions where lot_id=$1 and date_fin is null limit 1 returning id", [source.id, lot])).rows[0].id;
    const fin = async () => (await db.query("select date_fin from public.detentions where id=$1", [detention])).rows[0].date_fin;

    await page.goto(`/espace/${ORG}/parc/${source.bien_id}/lots/${lot}?parcours=1&etape=proprietaires`);
    await page.getByText("Gérer cette détention").click();
    await expect(page.getByRole("button", { name: "Fermer", exact: true })).toHaveCount(0);
    const bouton = page.getByRole("button", { name: "Mettre fin à la détention…" });
    await expect(bouton).toBeVisible();

    // Un clic n'enregistre rien : il ouvre la confirmation, qui nomme le propriétaire et la quote-part.
    await bouton.click();
    const dialogue = page.getByRole("dialog", { name: "Mettre fin à cette détention" });
    await expect(dialogue).toBeVisible();
    await expect(dialogue).toContainText("cessera d’être propriétaire de ce lot".replace("’", "'"));
    await expect(dialogue).toContainText("%");
    await dialogue.getByRole("button", { name: "Annuler" }).click();
    await expect(dialogue).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(await fin()).toBeNull();

    // Confirmation explicite : la détention prend fin aujourd'hui et reste dans l'historique.
    await bouton.click();
    await page.getByRole("dialog", { name: "Mettre fin à cette détention" }).getByRole("button", { name: "Mettre fin à la détention" }).click();
    await expect.poll(fin, { timeout: 20_000 }).not.toBeNull();
    await page.reload();
    await expect(page.getByText("Anciens propriétaires")).toBeVisible();
  } finally {
    if (lot) await nettoyer(lot);
    await db.end();
  }
});
