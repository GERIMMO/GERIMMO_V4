import { baseApiFictive } from "./local/base-api-fictive";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LE LOCATAIRE DIT SES DISPONIBILITÉS DÈS QU'IL SIGNALE UN INCIDENT (audit palier 1 du 22/11/2026, P2-02).
//
// L'écart : le formulaire de signalement ne demandait pas au locataire quand il peut recevoir un artisan. Ici, dans
// deux navigateurs : le locataire signale une fuite fictive en indiquant ses disponibilités ; le propriétaire ouvre le
// dossier et les lit. Logement, bail et signalement fictifs, retirés à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const LOCAUX = ["localhost", "127.0.0.1"];

test("signalement du locataire avec ses disponibilités : enregistrées, lues par le propriétaire dans le dossier", async ({ page, context, browser }, info) => {
  test.setTimeout(150_000);
  const cible = process.env.SUPALOCAL_DB;
  baseApiFictive(cible);
  const db = new Client({ connectionString: cible });
  await db.connect();
  const bien = randomUUID(), lot = randomUUID(), bail = randomUUID(), marque = bien.slice(0, 8);
  const DESCRIPTION = `ESSAI disponibilités : fuite fictive ${marque}`;
  const DISPONIBILITES = `En semaine après 18 h, samedi matin (essai ${marque})`;
  const signalement = async () => (await db.query(
    "select id, disponibilites_locataire texte, disponibilites_locataire_le is not null date from incidents where organization_id=$1 and description=$2", [ORG, DESCRIPTION])).rows;
  try {
    const { rows: [{ id: personne }] } = await db.query("select p.id from persons p join auth.users u on u.id=p.account_id where p.organization_id=$1 and u.email='locataire.pd@example.com'", [ORG]);
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','5 rue ESSAI disponibilités','69003','Lyon')", [bien, ORG, `ESSAI Disponibilités ${marque}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, `ESSAI Logement ${marque}`]);
    // Le bail le plus récent du locataire : c'est lui que la base retient pour un signalement.
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,$4,'actif',current_date-10,600,40)", [bail, ORG, lot, personne]);
    await db.query("commit");

    // ── 1. Le locataire signale, et dit quand il est disponible.
    await context.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
    await connecterVers(page, "locataire.pd@example.com", "Gerimmo-Demo-2026", `/locataire/${ORG}`);
    await page.goto(`/locataire/${ORG}/incident`);
    await expect(page.locator("#photos")).toBeAttached();
    await page.waitForLoadState("networkidle");
    await page.locator("#categorie").selectOption("plomberie_joint");
    await page.locator("#piece").selectOption({ index: 1 });
    await page.locator("textarea").first().fill(DESCRIPTION);
    const champ = page.getByLabel("Vos disponibilités pour une intervention (facultatif)", { exact: true });
    await expect(champ).toBeVisible();
    await expect(champ).toHaveAttribute("maxlength", "300");
    await expect(page.locator("#disponibilites-aide")).toHaveText("Transmises à votre gestionnaire pour préparer le rendez-vous. Cela ne réserve aucun créneau.");
    await champ.fill(DISPONIBILITES);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await champ.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("signalement-disponibilites.png") });
    await page.getByRole("button", { name: "Envoyer le signalement", exact: true }).click();
    await expect(page.getByText(/^Signalement envoyé —/)).toBeVisible();
    await expect(page.getByText("Vos disponibilités n’ont pas pu être enregistrées")).toHaveCount(0);

    const enregistres = await signalement();
    expect(enregistres).toHaveLength(1);
    expect(enregistres[0]).toMatchObject({ texte: DISPONIBILITES, date: true });

    // ── 2. Le propriétaire ouvre le dossier : les disponibilités du locataire y sont.
    const proprietaire = await browser.newContext({ ...info.project.use });
    try {
      await proprietaire.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
      const p = await proprietaire.newPage();
      await sansSyntheseAlertes(p);
      await connecterVers(p, "proprietaire@example.com", "Gerimmo-Demo-2026", `/espace/${ORG}/incidents?sel=${enregistres[0].id}`);
      const dossier = p.locator(".incident-dossier");
      await expect(dossier).toBeVisible();
      const lues = dossier.locator("[data-disponibilites-locataire]").first();
      await expect(lues).toBeVisible();
      await expect(lues).toContainText("Disponibilités du locataire");
      await expect(lues).toContainText(DISPONIBILITES);
      expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
      await p.screenshot({ path: info.outputPath("dossier-disponibilites.png"), fullPage: true });
    } finally { await proprietaire.close(); }
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from depots_photos_incident where incident_id in (select id from incidents where organization_id=$1 and description=$2)", [ORG, DESCRIPTION]);
      await db.query("delete from commandes_incidents_locataire where incident_id in (select id from incidents where organization_id=$1 and description=$2)", [ORG, DESCRIPTION]);
      await db.query("delete from incident_evenements where incident_id in (select id from incidents where organization_id=$1 and description=$2)", [ORG, DESCRIPTION]);
      await db.query("delete from alerts where organization_id=$1 and details->>'incident_id' in (select id::text from incidents where organization_id=$1 and description=$2)", [ORG, DESCRIPTION]);
      await db.query("delete from incidents where organization_id=$1 and description=$2", [ORG, DESCRIPTION]);
      await db.query("delete from baux where id=$1", [bail]);
      await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
