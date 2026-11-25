import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// DISCUSSION D'UNE INTERVENTION : UN NOUVEAU MESSAGE EST SIGNALÉ, PUIS S'ÉTEINT À LA LECTURE (audit palier 1 du
// 22/11/2026, P1-05).
//
// Le défaut : un message de la discussion partagée (gestionnaire, locataire, artisan) n'était signalé à personne.
// Ici, à trois, dans le navigateur : l'artisan écrit ; le gestionnaire le voit dans ses alertes et sur la ligne de
// l'incident, sans ouvrir la fiche ; le locataire le voit en tête de « Mes demandes ». Chacun lit : son signal
// s'éteint, et lui seul. Le gestionnaire répond : l'artisan le voit en tête de son écran d'arrivée.
//
// Incident et mission fictifs, rattachés au bail du locataire fictif ; supprimés à la fin. Aucun e-mail.

test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 10_000 });

test("discussion d'intervention : un nouveau message est signalé aux trois participants, puis s'éteint à la lecture", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const incident = randomUUID(), mission = randomUUID(), marque = randomUUID().slice(0, 8);
  const numero = `INC-${marque}`;
  const MESSAGE_ARTISAN = `Je suis devant l'immeuble : quel est le code de la porte ? (${marque})`;
  const MESSAGE_GERANT = `Le code est affiché dans le hall, le locataire descend vous ouvrir. (${marque})`;
  // Même largeur que le téléphone du parcours : sur grand écran, la liste des incidents ouvre d'office le premier
  // dossier à côté d'elle, et l'on ne saurait plus dire si la fiche a été ouverte ou non.
  const gestion = await browser.newContext({ storageState: "e2e/.auth/admin.json", viewport: page.viewportSize() });
  const chezLocataire = await browser.newContext({ storageState: "e2e/.auth/locataire.json", viewport: page.viewportSize() });
  /** Ce compte a-t-il lu la discussion jusqu'à son dernier message ? (Écrire soi-même avance aussi son marqueur.) */
  const aJour = async (email: string) => (await db.query(
    `select coalesce((select l.lue_le >= (select max(m.cree_le) from intervention_messages m where m.intervention_id=$1)
       from intervention_echanges_lectures l join auth.users u on u.id=l.account_id
      where l.intervention_id=$1 and u.email=$2), false) as ok`, [mission, email])).rows[0].ok as boolean;
  const alertes = async () => (await db.query(
    "select statut::text, (details->>'messages')::int messages, details->>'dernier_role' dernier_role, closed_action, titre, details from alerts where type='message_intervention' and origine_id=$1 order by created_at", [mission])).rows;
  /** Écrit dans la discussion affichée sur cette page, et attend la confirmation. */
  const ecrire = async (p: Page, texte: string) => {
    const discussion = p.locator(`#discussion-${mission}`);
    await discussion.scrollIntoViewIfNeeded();
    await discussion.getByLabel("Votre message").fill(texte);
    await discussion.getByRole("button", { name: "Envoyer dans la discussion" }).click();
    await expect(discussion.getByRole("status")).toContainText("Message ajouté à la discussion.");
    await expect(discussion).toContainText(texte);
  };
  /** Amène la discussion sous les yeux : c'est ce qui la marque lue. */
  const lire = async (p: Page, texte: string) => {
    const discussion = p.locator(`#discussion-${mission}`);
    await expect(discussion).toContainText(texte);
    await discussion.scrollIntoViewIfNeeded();
    await expect(discussion.getByText(texte)).toBeVisible();
  };
  try {
    // ── Décor : un incident du locataire fictif, une mission acceptée par l'artisan fictif.
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    const { rows: [l] } = await db.query(`select p.organization_id org, p.id personne, b.id bail, b.lot_id lot from persons p
      join baux b on b.locataire_principal=p.id and b.organization_id=p.organization_id and b.etat='actif'
      join organizations o on o.id=p.organization_id and o.name='Agence Alpha'
      where p.account_id=(select id from auth.users where email='locataire.alpha@example.com') limit 1`);
    await db.query(`insert into incidents(id,organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,$2,$3,$4,$5,$6,'espace_locataire','plomberie_canalisation','ESSAI discussion fictive','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')`,
      [incident, l.org, l.lot, l.bail, l.personne, numero]);
    await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())", [mission, l.org, incident, a.id]);

    // ── L'artisan écrit depuis sa mission. Son propre message n'est pas « à lire » pour lui.
    await sansSyntheseAlertes(page);
    await page.goto(`/artisan/missions/${mission}`);
    await ecrire(page, MESSAGE_ARTISAN);
    expect(await alertes()).toMatchObject([{ statut: "ouverte", messages: 1, dernier_role: "artisan", titre: `Nouveau message sur l'intervention — ${numero}` }]);
    // L'alerte ne porte que des identifiants : jamais le texte du message.
    expect(JSON.stringify((await alertes())[0])).not.toContain("code de la porte");
    await page.goto("/artisan");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("#messages-a-lire")).toHaveCount(0);

    // ── Le gestionnaire le voit SANS ouvrir la fiche : dans ses alertes, et sur la ligne de l'incident.
    const gerant = await gestion.newPage();
    await sansSyntheseAlertes(gerant);
    await gerant.goto(`/agence/${l.org}/alertes`);
    await expect(gerant.getByText(`Nouveau message sur l'intervention — ${numero}`).first()).toBeVisible();
    await gerant.goto(`/agence/${l.org}/incidents`);
    const rang = gerant.getByRole("link").filter({ hasText: numero });
    await expect(rang.locator("[data-nouveaux-messages]")).toHaveText("Nouveau message");
    expect(await debordementHorizontal(gerant)).toBeLessThanOrEqual(1);
    await gerant.screenshot({ path: info.outputPath("gestionnaire-liste-nouveau-message.png"), fullPage: true });
    expect(await aJour("admin.alpha@example.com")).toBe(false);

    // ── Il ouvre la fiche et lit la discussion : son signal s'éteint, l'alerte se ferme avec sa raison.
    await gerant.goto(`/agence/${l.org}/incidents/${incident}`);
    await lire(gerant, MESSAGE_ARTISAN);
    await expect.poll(() => aJour("admin.alpha@example.com"), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await alertes())[0].statut, { timeout: 15_000 }).toBe("fermee");
    expect((await alertes())[0].closed_action).toBe("Discussion lue");
    await gerant.goto(`/agence/${l.org}/incidents`);
    await expect(gerant.getByRole("link").filter({ hasText: numero })).toBeVisible();
    await expect(gerant.getByRole("link").filter({ hasText: numero }).locator("[data-nouveaux-messages]")).toHaveCount(0);

    // ── Sa lecture n'est que la sienne : le locataire a toujours le message à lire, en tête de « Mes demandes ».
    expect(await aJour("locataire.alpha@example.com")).toBe(false);
    const locataire = await chezLocataire.newPage();
    await sansSyntheseAlertes(locataire);
    await locataire.goto(`/locataire/${l.org}/demandes`);
    const carte = locataire.locator("[data-nouveaux-messages]");
    await expect(carte).toBeVisible();
    await expect(carte).toContainText("Nouveau message sur votre intervention");
    expect(await debordementHorizontal(locataire)).toBeLessThanOrEqual(1);
    await locataire.screenshot({ path: info.outputPath("locataire-nouveau-message.png"), fullPage: true });
    await carte.click();
    await lire(locataire, MESSAGE_ARTISAN);
    await expect.poll(() => aJour("locataire.alpha@example.com"), { timeout: 15_000 }).toBe(true);
    await locataire.reload();
    await expect(locataire.locator(`#discussion-${mission}`)).toContainText(MESSAGE_ARTISAN);
    await expect(locataire.locator("[data-nouveaux-messages]")).toHaveCount(0);

    // ── Le gestionnaire répond : pas d'alerte pour son propre message ; l'artisan le voit en tête de son écran.
    await gerant.goto(`/agence/${l.org}/incidents/${incident}`);
    await ecrire(gerant, MESSAGE_GERANT);
    expect((await alertes()).filter((x) => x.statut === "ouverte")).toEqual([]);
    expect(await aJour("artisan.alpha@example.com")).toBe(false);
    await page.goto("/artisan");
    const aLire = page.locator("#messages-a-lire");
    await expect(aLire).toBeVisible();
    await expect(aLire.getByRole("heading")).toHaveText("Messages à lire (1)");
    await expect(aLire).toContainText(numero);
    await expect(aLire.locator("[data-nouveaux-messages]")).toHaveText("Nouveau message");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("artisan-message-a-lire.png"), fullPage: true });
    // Il ouvre la mission et lit : la file « Messages à lire » se vide.
    await aLire.getByRole("link").first().click();
    await expect(page).toHaveURL((url) => url.pathname === `/artisan/missions/${mission}`);
    await lire(page, MESSAGE_GERANT);
    await expect.poll(() => aJour("artisan.alpha@example.com"), { timeout: 15_000 }).toBe(true);
    await page.goto("/artisan");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("#messages-a-lire")).toHaveCount(0);
  } finally {
    await gestion.close();
    await chezLocataire.close();
    try {
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from intervention_echanges_lectures where intervention_id=$1", [mission]);
      await db.query("delete from intervention_messages where intervention_id=$1", [mission]);
      await db.query("delete from intervention_echanges_etat where intervention_id=$1", [mission]);
      await db.query("delete from alerts where details->>'incident_id'=$1", [incident]);
      await db.query("delete from incident_evenements where incident_id=$1", [incident]);
      await db.query("delete from incident_interventions where id=$1", [mission]);
      await db.query("delete from incidents where id=$1", [incident]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
