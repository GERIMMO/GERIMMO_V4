import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

// ARTISAN : ABSENCES ET SEMAINE TYPE (audit palier 1 du 22/11/2026, P2-03).
//
// L'écart : un artisan en congé restait sollicité, et il ressaisissait ses trois créneaux à chaque intervention.
// Ici, dans deux navigateurs :
//   1. l'artisan règle sa semaine type et déclare une absence (aujourd'hui et demain) dans « Mon entreprise » ;
//   2. pour une intervention fictive, « Préremplir avec ma semaine type » pose trois créneaux qui sautent son absence ;
//   3. le propriétaire, qui l'a dans son carnet, le voit proposé mais « Absent jusqu'au … », sans bouton de demande ;
//   4. l'artisan retire son absence : le propriétaire retrouve le bouton « Demander un devis ».
// L'espace, le compte du propriétaire, le logement et les deux incidents sont fictifs et propres à ce parcours (ils
// restent dans la base du banc). L'artisan est celui du banc : son absence, sa semaine type, l'intervention fictive
// et sa présence dans le carnet de l'essai sont retirées à la fin.

const LOCAUX = ["localhost", "127.0.0.1"];
const ARTISAN = "E2E Plomberie Dubois";
test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 15_000 });

/** Ouvre l'onglet « Devis et facture » du dossier si la liste des artisans n'est pas déjà visible. */
async function ouvrirArtisansProposables(p: Page) {
  await expect(p.locator(".incident-dossier")).toBeVisible();
  const liste = p.getByText("Artisans proposables", { exact: false }).first();
  if (!(await liste.isVisible())) await p.getByText("Devis et facture", { exact: true }).first().click();
  await expect(liste).toBeVisible();
}

test("artisan : semaine type et absence ; ses créneaux se préremplissent ; le propriétaire le voit absent, puis de nouveau joignable", async ({ page, context, browser }, info) => {
  test.setTimeout(300_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const org = randomUUID(), compte = randomUUID(), bailleur = randomUUID(), bien = randomUUID(), lot = randomUUID();
  const incident = randomUUID(), consultation = randomUUID(), incidentMission = randomUUID(), mission = randomUUID(), marque = org.slice(0, 8);
  const email = `absences-${org}@example.invalid`, motDePasse = randomUUID(), nom = `ESSAI Absences ${marque}`;
  let artisanId = "";
  try {
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    artisanId = a.id;
    // Le jour de Paris, et les suivants : ce sont eux que la base compare.
    const { rows: [d] } = await db.query(`select public.aujourdhui_paris()::text j0, (public.aujourdhui_paris()+1)::text j1, (public.aujourdhui_paris()+2)::text j2,
      (public.aujourdhui_paris()+3)::text j3, (public.aujourdhui_paris()+4)::text j4, to_char(public.aujourdhui_paris()+1,'DD/MM/YYYY') j1_fr, to_char(public.aujourdhui_paris(),'DD/MM/YYYY') j0_fr`);
    await db.query("begin");
    await db.query("delete from artisan_absences where artisan_id=$1", [artisanId]);
    await db.query("delete from artisan_semaine_type where artisan_id=$1", [artisanId]);
    await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"prenom":"Propriétaire","nom":"Essai absences"}',now(),now(),'','','','','')`, [compte, email, motDePasse]);
    await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription','conditions_clients')", [compte, CONDITIONS_VERSION]);
    await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75012','Paris',$3)", [org, nom, email]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$2,$3,'Essai absences','Propriétaire',$4,'Personne physique','1 rue des Essais','75012','Paris')", [bailleur, org, compte, email]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Essais','75012','Paris')", [bien, org, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'disponible',40)", [lot, org, bien, `${nom} A`]);
    await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-30)", [lot, org, bailleur]);
    // L'artisan du banc est dans le carnet de cet espace : il lui est donc proposé.
    await db.query("insert into artisan_agences(organization_id,artisan_id,statut) values($1,$2,'actif')", [org, artisanId]);
    // Un incident pris en charge, mise en concurrence ouverte, personne encore sollicité.
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation',$5,'qualifie','proprietaire','Essai fictif')", [incident, org, lot, `ESSAI-${marque}-1`, `ESSAI absences : fuite fictive ${marque}`]);
    await db.query("insert into incident_consultations(id,organization_id,incident_id,metier,nature_travaux) values($1,$2,$3,'plomberie','entretien_courant')", [consultation, org, incident]);
    // Une intervention déjà confiée à l'artisan : c'est pour elle qu'il propose des créneaux.
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation',$5,'affecte','proprietaire','Essai fictif')", [incidentMission, org, lot, `ESSAI-${marque}-2`, `ESSAI absences : intervention fictive ${marque}`]);
    await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())", [mission, org, incidentMission, artisanId]);
    await db.query("commit");

    // ── 1. L'artisan règle sa semaine type et déclare une absence.
    await context.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
    await sansSyntheseAlertes(page);
    await page.goto("/artisan/entreprise#entreprise-disponibilites");
    await expect(page.getByRole("heading", { name: "Mes absences", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-absences="aucune"]')).toHaveText("Aucune absence déclarée.");
    await page.waitForLoadState("networkidle");
    // Tous les jours, de 9 h à 17 h : le préremplissage ne dépend alors pas du jour de la semaine où tourne l'essai.
    for (let jour = 1; jour <= 7; jour++) {
      const ligne = page.locator(`[data-jour-semaine="${jour}"]`);
      await ligne.getByRole("checkbox").check();
      await ligne.locator(`input[name="debut_${jour}"]`).fill("09:00");
      await ligne.locator(`input[name="fin_${jour}"]`).fill("17:00");
    }
    await page.getByRole("button", { name: "Enregistrer ma semaine type", exact: true }).click();
    await expect(page.getByText("Semaine type enregistrée. Elle vous sert à préremplir vos créneaux ; elle ne réserve rien.", { exact: true })).toBeVisible();
    expect((await db.query("select jour::int, to_char(debut,'HH24:MI') debut, to_char(fin,'HH24:MI') fin from artisan_semaine_type where artisan_id=$1 order by jour", [artisanId])).rows)
      .toEqual([1, 2, 3, 4, 5, 6, 7].map((jour) => ({ jour, debut: "09:00", fin: "17:00" })));

    await page.locator('input[name="du"]').fill(d.j0);
    await page.locator('input[name="au"]').fill(d.j1);
    await page.getByRole("button", { name: "Déclarer cette absence", exact: true }).click();
    await expect(page.getByText(`Absence enregistrée du ${d.j0_fr} au ${d.j1_fr}.`, { exact: false })).toBeVisible();
    const absence = page.locator('[data-absence="en-cours"]');
    await expect(absence).toHaveCount(1);
    await expect(absence).toContainText(`Du ${d.j0_fr} au ${d.j1_fr}`, { ignoreCase: true });
    await expect(absence).toContainText("En cours");
    expect((await db.query("select du::text, au::text from artisan_absences where artisan_id=$1", [artisanId])).rows).toEqual([{ du: d.j0, au: d.j1 }]);
    // Une période qui la chevauche est refusée, avec les dates de celle qui gêne.
    await page.locator('input[name="du"]').fill(d.j1);
    await page.locator('input[name="au"]').fill(d.j3);
    await page.getByRole("button", { name: "Déclarer cette absence", exact: true }).click();
    await expect(page.getByText(`Cette période chevauche une absence déjà déclarée, du ${d.j0_fr} au ${d.j1_fr} : retirez-la d'abord`, { exact: false })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("artisan-disponibilites.png"), fullPage: true });

    // ── 2. Pour l'intervention fictive, ses créneaux se préremplissent en sautant l'absence.
    await page.goto(`/artisan/missions/${mission}/creneaux`);
    const preremplir = page.getByRole("button", { name: "Préremplir avec ma semaine type", exact: true });
    await expect(preremplir).toBeVisible();
    await page.waitForLoadState("networkidle");
    await preremplir.click();
    await expect(page.locator("[data-preremplissage]").getByRole("status")).toContainText("Trois créneaux préremplis d’après votre semaine type.");
    const dates = page.locator('fieldset input[type="date"]');
    await expect(dates).toHaveCount(3);
    // Aujourd'hui et demain sont des jours d'absence : les trois créneaux tombent les trois jours suivants.
    for (const [i, jour] of [d.j2, d.j3, d.j4].entries()) {
      await expect(dates.nth(i)).toHaveValue(jour);
      await expect(page.locator('fieldset input[type="time"]').nth(2 * i)).toHaveValue("09:00");
      await expect(page.locator('fieldset input[type="time"]').nth(2 * i + 1)).toHaveValue("11:00");
    }
    await expect(page.getByText("3 / 3 propositions prêtes", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer les créneaux", exact: true })).toBeEnabled();
    // Rien n'est parti : le préremplissage ne vaut pas envoi.
    expect((await db.query("select count(*)::int n from intervention_creneaux where intervention_id=$1", [mission])).rows[0].n).toBe(0);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("creneaux-preremplis.png"), fullPage: true });

    // ── 3. Le propriétaire le voit proposé, mais absent : pas de bouton, et la date de son retour.
    const proprietaire = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    try {
      await proprietaire.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
      const p = await proprietaire.newPage();
      await sansSyntheseAlertes(p);
      await connecterVers(p, email, motDePasse, `/espace/${org}/incidents?sel=${incident}`);
      await ouvrirArtisansProposables(p);
      const absent = p.locator("[data-artisan-absent]");
      await expect(absent).toHaveCount(1);
      await expect(absent).toHaveText(`Absent jusqu’au ${d.j1_fr} — aucune demande ne peut lui être envoyée d’ici là`);
      await expect(p.getByText(ARTISAN, { exact: true }).first()).toBeVisible();
      await expect(p.getByRole("button", { name: `Demander un devis à ${ARTISAN}` })).toHaveCount(0);
      expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
      await absent.scrollIntoViewIfNeeded();
      await p.screenshot({ path: info.outputPath("proprietaire-artisan-absent.png"), fullPage: true });

      // ── 4. L'artisan retire son absence : le bouton revient chez le propriétaire.
      await page.goto("/artisan/entreprise#entreprise-disponibilites");
      await expect(page.locator('[data-absence="en-cours"]')).toHaveCount(1, { timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await page.locator('[data-absence="en-cours"]').getByRole("button", { name: "Retirer", exact: true }).click();
      await expect(page.locator('[data-absences="aucune"]')).toBeVisible();
      expect((await db.query("select count(*)::int n from artisan_absences where artisan_id=$1", [artisanId])).rows[0].n).toBe(0);

      await p.reload();
      await ouvrirArtisansProposables(p);
      await expect(p.locator("[data-artisan-absent]")).toHaveCount(0);
      await expect(p.getByRole("button", { name: `Demander un devis à ${ARTISAN}` })).toBeVisible();
      // Le parcours s'arrête ici : aucune demande réelle n'est envoyée à l'artisan du banc.
      expect((await db.query("select count(*)::int n from incident_sollicitations where consultation_id=$1", [consultation])).rows[0].n).toBe(0);
    } finally { await proprietaire.close(); }
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      // L'artisan du banc retrouve son état d'avant ; l'espace de l'essai, lui, reste.
      await db.query("delete from artisan_absences where artisan_id=$1", [artisanId]);
      await db.query("delete from artisan_semaine_type where artisan_id=$1", [artisanId]);
      await db.query("delete from intervention_creneaux where intervention_id=$1", [mission]);
      await db.query("delete from incident_interventions where id=$1", [mission]);
      await db.query("delete from incident_consultations where id=$1", [consultation]);
      await db.query("delete from alerts where organization_id=$1", [org]);
      await db.query("delete from incident_evenements where incident_id = any($1::uuid[])", [[incident, incidentMission]]);
      await db.query("delete from incidents where id = any($1::uuid[])", [[incident, incidentMission]]);
      await db.query("delete from artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisanId]);
      await db.query("delete from memberships where organization_id=$1 and role='artisan'", [org]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
