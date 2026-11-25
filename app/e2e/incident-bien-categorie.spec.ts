import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LA DÉCLARATION D'INCIDENT DEPUIS LA FICHE DU BIEN DEMANDE LA CATÉGORIE ET L'URGENCE (audit palier 1 du 22/11/2026,
// P1-19 : « une seule déclaration d'incident côté gestionnaire »).
//
// Le défaut : cette porte écrivait toujours « Autre problème » et « Normal ». Ici, dans le navigateur du propriétaire
// bailleur, sur un immeuble fictif à deux logements : le formulaire propose les mêmes catégories et les mêmes niveaux
// d'urgence que l'écran « Incidents » ; sans catégorie, rien ne part ; un dégât urgent déclaré sur un logement arrive
// au dossier avec sa catégorie et sa puce « Urgent » ; un incident des parties communes garde sa catégorie.
// Immeuble, logements et incidents fictifs, retirés à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("fiche du bien : l'incident se déclare avec sa catégorie et son urgence, sur un logement comme sur les parties communes", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const bien = randomUUID(), lotA = randomUUID(), lotB = randomUUID(), marque = bien.slice(0, 8);
  const TITRE_URGENT = `ESSAI dégât des eaux ${marque}`, TITRE_COMMUN = `ESSAI porte du hall ${marque}`;
  const incidentsDuBien = async () => (await db.query(
    "select id, titre, categorie, urgence::text urgence, lot_id, bien_id from incidents where organization_id=$1 and bien_id=$2 order by created_at, id", [ORG, bien])).rows;
  try {
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'immeuble','1 rue ESSAI incident','75001','Paris')", [bien, ORG, `ESSAI Immeuble ${marque}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$3,$4,$5,'brouillon'),($2,$3,$4,$6,'brouillon')", [lotA, lotB, ORG, bien, `ESSAI Logement A ${marque}`, `ESSAI Logement B ${marque}`]);
    await db.query("commit");

    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/parc/${bien}`);
    const rubrique = page.locator(`section[aria-labelledby="incidents-${bien}"]`);
    await expect(rubrique.getByRole("heading", { name: "Incidents", exact: true })).toBeVisible();
    await expect(rubrique).toContainText("Aucun incident pour ce bien.");

    // ── 1. Le formulaire pose les mêmes questions que l'écran « Incidents ».
    await rubrique.getByRole("button", { name: "Déclarer un incident", exact: true }).click();
    const formulaire = rubrique.locator("form");
    // Les champs sont pris par leur nom : un <label> qui enveloppe un <select> porte aussi le texte de ses options.
    const categorie = formulaire.locator('select[name="categorie"]');
    const urgence = formulaire.locator('select[name="urgence"]');
    for (const libelle of ["Concerne", "Titre", "Catégorie", "Urgence", "Date"]) await expect(formulaire.locator("label").filter({ hasText: new RegExp(`^${libelle}`) })).toBeVisible();
    await expect(categorie).toHaveValue("");
    await expect(categorie.locator("option:not([disabled])")).toHaveText([
      "Plomberie — joint, siphon, robinetterie", "Plomberie — canalisation encastrée, colonne", "Chauffage — entretien annuel de la chaudière",
      "Chauffage — remplacement de l'appareil", "Chauffage — radiateur ou eau chaude en panne", "Électricité — interrupteur, prise, ampoule",
      "Électricité — mise aux normes du tableau", "Menuiserie — vitre brisée", "Humidité — infiltration, tache au plafond",
      "Serrurerie — clé perdue, cylindre", "Serrurerie — serrure de porte palière grippée", "Nuisibles — punaises, cafards, rongeurs", "Autre problème",
    ]);
    await expect(urgence).toHaveValue("normale");
    await expect(urgence.locator("option")).toHaveText(["Normal — sous quelques jours", "Urgent — dégât en cours"]);
    await expect(formulaire).toContainText("Urgent : un dégât est en cours ou le logement est inutilisable.");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await formulaire.screenshot({ path: info.outputPath("incident-bien-formulaire.png") });

    // ── 2. Sans catégorie, le navigateur retient l'envoi : rien n'est créé.
    await formulaire.locator('select[name="lot"]').selectOption(lotA);
    await formulaire.locator('input[name="titre"]').fill(TITRE_URGENT);
    await formulaire.getByRole("button", { name: "Déclarer", exact: true }).click();
    expect(await categorie.evaluate((e: HTMLSelectElement) => e.validity.valueMissing)).toBe(true);
    expect(await incidentsDuBien()).toHaveLength(0);

    // ── 3. Un dégât urgent sur un logement : catégorie et urgence arrivent au dossier.
    await categorie.selectOption("humidite_infiltration");
    await urgence.selectOption("urgente");
    await formulaire.locator('textarea[name="note"]').fill("L’eau coule du plafond de la cuisine.");
    await formulaire.getByRole("button", { name: "Déclarer", exact: true }).click();
    const ligneUrgente = rubrique.getByRole("link").filter({ hasText: TITRE_URGENT });
    await expect(ligneUrgente).toBeVisible();
    await expect(rubrique.locator("form")).toHaveCount(0);
    const [premier] = await incidentsDuBien();
    expect(premier).toMatchObject({ titre: TITRE_URGENT, categorie: "humidite_infiltration", urgence: "urgente", lot_id: lotA, bien_id: bien });
    expect((await db.query("select criticite::text c from alerts where organization_id=$1 and details->>'incident_id'=$2", [ORG, premier.id])).rows).toEqual([{ c: "critique" }]);

    // ── 4. Les parties communes : la catégorie choisie est gardée, l'urgence reste « normale » si l'on n'y touche pas.
    await rubrique.getByRole("button", { name: "Déclarer un incident", exact: true }).click();
    const second = rubrique.locator("form");
    await expect(second.locator('select[name="lot"]')).toHaveValue("");
    await expect(second.locator('select[name="lot"] option').first()).toHaveText("Tout le bien / parties communes");
    await second.locator('input[name="titre"]').fill(TITRE_COMMUN);
    await second.locator('select[name="categorie"]').selectOption({ label: "Serrurerie — serrure de porte palière grippée" });
    await second.getByRole("button", { name: "Déclarer", exact: true }).click();
    const ligneCommune = rubrique.getByRole("link").filter({ hasText: TITRE_COMMUN });
    await expect(ligneCommune).toBeVisible();
    await expect(ligneCommune).toContainText("Parties communes");
    const tous = await incidentsDuBien();
    expect(tous).toHaveLength(2);
    expect(tous.find((i) => i.titre === TITRE_COMMUN)).toMatchObject({ categorie: "serrurerie_porte", urgence: "normale", lot_id: null, bien_id: bien });

    // ── 5. Le dossier urgent, ouvert depuis la fiche du bien : puce « Urgent » et dossier au bon titre.
    await ligneUrgente.click();
    const dossier = page.locator(".incident-dossier");
    await expect(dossier).toBeVisible();
    await expect(dossier).toContainText(TITRE_URGENT);
    await expect(dossier.getByText("Urgent", { exact: true }).first()).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("incident-bien-dossier-urgent.png"), fullPage: true });
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from incident_evenements where incident_id in (select id from incidents where bien_id=$1)", [bien]);
      await db.query("delete from alerts where organization_id=$1 and details->>'incident_id' in (select id::text from incidents where bien_id=$2)", [ORG, bien]);
      await db.query("delete from incidents where bien_id=$1", [bien]);
      await db.query("delete from lots where bien_id=$1", [bien]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
