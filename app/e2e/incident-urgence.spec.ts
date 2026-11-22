import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LE BAILLEUR CORRIGE L'URGENCE D'UN INCIDENT (audit palier 1 du 22/11/2026, P1-04).
//
// Le défaut : l'urgence était fixée à la déclaration, sans aucun moyen de la corriger ensuite. Ici, un incident déclaré
// en urgence normale est marqué urgent par le propriétaire, avec son motif ; la puce « Urgent » apparaît, la correction
// se lit dans l'historique du dossier ; puis il le repasse en urgence normale.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("incident : le propriétaire marque urgent puis repasse en normal, motif à l'historique", async ({ page }, info) => {
  test.setTimeout(90_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const incident = randomUUID();
  const numero = `TEST-URG-${incident.slice(0, 8)}`;
  try {
    const { rows: [lot] } = await db.query("select id from lots where organization_id=$1 and archived_at is null order by created_at limit 1", [ORG]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,urgence) values($1,$2,$3,$4,'agence','plomberie_canalisation','TEST urgence : robinet qui goutte','declare','normale')", [incident, ORG, lot.id, numero]);
    const urgenceEnBase = async () => (await db.query("select urgence::text u from incidents where id=$1", [incident])).rows[0].u as string;

    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/incidents?sel=${incident}`);
    const dossier = page.locator(".incident-dossier");
    await expect(dossier).toBeVisible();
    await expect(dossier).toContainText(numero);
    await expect(dossier.getByText("Urgent", { exact: true })).toHaveCount(0);

    // ── Normal → urgent
    const correction = dossier.locator("[data-correction-urgence]");
    await expect(correction).toHaveAttribute("data-correction-urgence", "normale");
    await correction.locator("summary").click();
    // Sans motif, le navigateur retient l'envoi : rien ne change.
    await correction.getByRole("button", { name: "Marquer urgent", exact: true }).click();
    expect(await urgenceEnBase()).toBe("normale");
    await correction.getByLabel("Motif de la correction", { exact: true }).fill("TEST : la fuite s’aggrave, l’eau atteint le sol.");
    await correction.getByRole("button", { name: "Marquer urgent", exact: true }).click();
    await expect(dossier.locator("[data-correction-urgence]")).toHaveAttribute("data-correction-urgence", "urgente");
    expect(await urgenceEnBase()).toBe("urgente");
    await expect(dossier.getByText("Urgent", { exact: true }).first()).toBeVisible();
    await expect(dossier).toContainText("Urgence corrigée par le gestionnaire");
    await expect(dossier).toContainText("Normale → Urgente — « TEST : la fuite s’aggrave, l’eau atteint le sol. »");
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath("incident-urgent.png"), fullPage: true });

    // ── Urgent → normal, après rechargement : l'état est bien celui de la base.
    await page.reload();
    const retour = page.locator(".incident-dossier [data-correction-urgence]");
    await expect(retour).toHaveAttribute("data-correction-urgence", "urgente");
    await retour.locator("summary").click();
    await retour.getByLabel("Motif de la correction", { exact: true }).fill("TEST : fuite arrêtée par le locataire.");
    await retour.getByRole("button", { name: "Repasser en urgence normale", exact: true }).click();
    await expect(page.locator(".incident-dossier [data-correction-urgence]")).toHaveAttribute("data-correction-urgence", "normale");
    expect(await urgenceEnBase()).toBe("normale");
    await expect(page.locator(".incident-dossier").getByText("Urgent", { exact: true })).toHaveCount(0);
    await expect(page.locator(".incident-dossier")).toContainText("Urgente → Normale — « TEST : fuite arrêtée par le locataire. »");

    // Deux corrections au fil, sous le compte du propriétaire.
    const fil = (await db.query("select details->>'urgence' u, acteur_account_id is not null signe from incident_evenements where incident_id=$1 and type='urgence_corrigee' order by created_at, id", [incident])).rows;
    expect(fil).toEqual([{ u: "urgente", signe: true }, { u: "normale", signe: true }]);
  } finally {
    try {
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from incident_evenements where incident_id=$1", [incident]);
      await db.query("delete from alerts where details->>'incident_id'=$1", [incident]);
      await db.query("delete from incidents where id=$1", [incident]);
      await db.query("commit");
    } catch { await db.query("rollback").catch(() => {}); }
    await db.end();
  }
});
