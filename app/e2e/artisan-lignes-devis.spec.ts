import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// ARTISAN : SES LIGNES DE DEVIS RÉUTILISABLES (audit palier 1 du 22/11/2026, P2-04, troisième partie).
//
// L'écart : l'artisan ressaisissait à chaque devis les mêmes prestations. Ici, sur un devis fictif :
//   1. il garde la ligne de son devis (libellé, prix, TVA) : elle apparaît dans « Mes lignes gardées » ;
//   2. il repart d'un devis vierge et la reprend d'un geste : la ligne est recopiée, le total se calcule, le brouillon
//      se sait modifié et s'enregistre ;
//   3. après rechargement, la ligne gardée est toujours là (elle vit en base, pas dans la page) ;
//   4. il la retire de sa liste : le devis en cours, lui, garde sa ligne.
// L'espace, le logement et l'incident sont fictifs et propres à ce parcours (ils restent dans la base du banc).
// L'artisan est celui du banc : sa demande, son brouillon et ses lignes gardées de l'essai sont retirés à la fin.

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 15_000 });

test("devis : l'artisan garde une ligne, la reprend dans un devis vierge, la retrouve après rechargement, puis la retire", async ({ page, context }, info) => {
  test.setTimeout(240_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const org = randomUUID(), bien = randomUUID(), lot = randomUUID(), incident = randomUUID(), consultation = randomUUID(), demande = randomUUID();
  const marque = org.slice(0, 8), nom = `ESSAI Lignes ${marque}`, LIBELLE = `Remplacement du joint ${marque}`;
  let artisanId = "";
  const gardees = async () => (await db.query("select libelle, prix_unitaire_ht_cents::int prix, tva_bps tva from artisan_lignes_devis where artisan_id=$1 and libelle like $2 order by libelle", [artisanId, `%${marque}%`])).rows;
  try {
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    artisanId = a.id;
    const avant = Number((await db.query("select count(*)::int n from artisan_lignes_devis where artisan_id=$1", [artisanId])).rows[0].n);
    await db.query("begin");
    await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75001','Paris')", [org, nom]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Essais','75001','Paris')", [bien, org, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'disponible',40)", [lot, org, bien, `${nom} A`]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation',$5,'qualifie','proprietaire','Essai fictif')", [incident, org, lot, `ESSAI-${marque}`, `ESSAI lignes : fuite fictive ${marque}`]);
    await db.query("insert into incident_consultations(id,organization_id,incident_id,metier,nature_travaux) values($1,$2,$3,'plomberie','entretien_courant')", [consultation, org, incident]);
    await db.query("insert into incident_sollicitations(id,organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,$5,'envoyee')", [demande, org, consultation, incident, artisanId]);
    await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,saisie,revision) values($1,$2,$3,1)", [demande, artisanId, {
      diagnostic: `Joint usé (essai ${marque})`, delai: "Sous cinq jours", duree: "Une heure", contraintes: "", observations: "", valideJusquAu: "2099-01-30",
      lignes: [{ code: "", libelle: LIBELLE, quantite: 2, prix_unitaire_ht_cents: 4500, tva_bps: 1000 }] }]);
    await db.query("commit");

    await context.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
    await sansSyntheseAlertes(page);
    await page.goto(`/artisan/devis/${demande}`);
    await expect(page.getByRole("textbox", { name: "Votre diagnostic", exact: true })).toHaveValue(`Joint usé (essai ${marque})`, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const bloc = page.locator("[data-lignes-devis]");
    const mesLignes = bloc.locator("[data-mes-lignes]");
    const avis = bloc.locator("[data-avis-lignes-gardees]");

    // ── 1. Il garde la ligne de son devis.
    await expect(bloc.getByLabel("Ligne 1 : prestation", { exact: true })).toHaveValue(LIBELLE);
    await expect(mesLignes).toBeVisible();
    await mesLignes.locator("summary").click();
    if (avant === 0) await expect(mesLignes).toContainText("Aucune ligne gardée pour l’instant.");
    await expect(mesLignes.locator("[data-ligne-gardee]").filter({ hasText: LIBELLE })).toHaveCount(0);
    await bloc.locator("[data-garder-ligne]").first().click();
    await expect(avis).toHaveText(`« ${LIBELLE} » est gardée : vous la retrouverez dans vos prochains devis.`);
    expect(await gardees()).toEqual([{ libelle: LIBELLE, prix: 4500, tva: 1000 }]);
    const gardee = mesLignes.locator("[data-ligne-gardee]").filter({ hasText: LIBELLE });
    await expect(gardee).toHaveCount(1);
    await expect(gardee).toContainText("45,00 € HT · TVA 10 %");
    await expect(mesLignes.locator("summary")).toHaveText(`Mes lignes gardées (${avant + 1})`);
    // Garder n'est pas modifier le devis : le brouillon reste « enregistré », rien n'est envoyé.
    await expect(page.locator('[role="status"][data-etat]')).toHaveAttribute("data-etat", "enregistre");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await gardee.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("ligne-gardee.png"), fullPage: true });

    // ── 2. Il repart d'un devis vierge et reprend la ligne d'un geste.
    await page.getByRole("button", { name: "Repartir d’un devis vierge", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Devis vierge", exact: true })).toBeVisible();
    await expect(bloc.getByLabel("Ligne 1 : prestation", { exact: true })).toHaveValue("");
    // Le bloc des lignes vient d'être remonté avec le devis vierge : la ligne gardée l'instant d'avant, sans
    // rechargement, y est toujours proposée.
    await mesLignes.locator("summary").click();
    await expect(mesLignes.locator("summary")).toHaveText(`Mes lignes gardées (${avant + 1})`);
    await page.getByRole("button", { name: `Ajouter au devis : ${LIBELLE}`, exact: true }).click();
    await expect(bloc.getByLabel("Ligne 1 : prestation", { exact: true })).toHaveValue(LIBELLE);
    await expect(bloc.getByLabel("Ligne 1 : quantité", { exact: true })).toHaveValue("1");
    await expect(bloc.getByLabel("Ligne 1 : prix unitaire HT", { exact: true })).toHaveValue("45,00");
    await expect(bloc.locator('select[aria-label="Ligne 1 : TVA"]')).toHaveValue("1000");
    await expect(bloc.getByLabel("Ligne 2 : prestation", { exact: true })).toHaveCount(0);
    await expect(bloc.locator("[data-totaux-devis]")).toContainText("Total HT : 45,00 €");
    await expect(bloc.locator("[data-totaux-devis]")).toContainText("Total TTC : 49,50 €");
    // La reprise est une modification du devis : le brouillon le sait.
    await expect(page.locator('[role="status"][data-etat]')).toHaveAttribute("data-etat", "modifie");
    // Une seconde reprise s'ajoute à la suite, sans écraser la première.
    await page.getByRole("button", { name: `Ajouter au devis : ${LIBELLE}`, exact: true }).click();
    await expect(bloc.getByLabel("Ligne 2 : prestation", { exact: true })).toHaveValue(LIBELLE);
    await expect(bloc.locator("[data-totaux-devis]")).toContainText("Total HT : 90,00 €");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("ligne-reprise.png"), fullPage: true });
    await page.getByRole("textbox", { name: "Votre diagnostic", exact: true }).fill(`Joint à remplacer (essai ${marque})`);
    await page.getByRole("button", { name: /^Enregistrer/ }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Brouillon enregistré sur Gerimmo" })).toBeVisible({ timeout: 30_000 });
    const { rows: [brouillon] } = await db.query("select saisie from artisan_devis_preparations where sollicitation_id=$1", [demande]);
    expect((brouillon.saisie.lignes as { libelle: string; quantite: number; prix_unitaire_ht_cents: number; tva_bps: number }[]).map((l) => [l.libelle, l.quantite, l.prix_unitaire_ht_cents, l.tva_bps]))
      .toEqual([[LIBELLE, 1, 4500, 1000], [LIBELLE, 1, 4500, 1000]]);

    // ── 3. Après rechargement, la ligne gardée est toujours proposée.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Votre diagnostic", exact: true })).toHaveValue(`Joint à remplacer (essai ${marque})`, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await mesLignes.locator("summary").click();
    await expect(mesLignes.locator("[data-ligne-gardee]").filter({ hasText: LIBELLE })).toHaveCount(1);

    // ── 4. Il la retire de sa liste : le devis en cours garde ses lignes.
    await page.getByRole("button", { name: `Retirer de ma liste : ${LIBELLE}`, exact: true }).click();
    await expect(avis).toHaveText(`« ${LIBELLE} » est retirée de vos lignes gardées. Les devis déjà préparés ne changent pas.`);
    await expect(mesLignes.locator("[data-ligne-gardee]").filter({ hasText: LIBELLE })).toHaveCount(0);
    expect(await gardees()).toEqual([]);
    await expect(bloc.getByLabel("Ligne 1 : prestation", { exact: true })).toHaveValue(LIBELLE);
    await expect(bloc.getByLabel("Ligne 2 : prestation", { exact: true })).toHaveValue(LIBELLE);
    expect(Number((await db.query("select count(*)::int n from artisan_lignes_devis where artisan_id=$1", [artisanId])).rows[0].n)).toBe(avant);
    // Rien n'est parti chez le client : aucun devis n'a été déposé par ce parcours.
    expect(Number((await db.query("select count(*)::int n from incident_devis where sollicitation_id=$1", [demande])).rows[0].n)).toBe(0);
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      // La demande, le brouillon et les lignes gardées de l'essai quittent l'espace de l'artisan du banc.
      if (artisanId) await db.query("delete from artisan_lignes_devis where artisan_id=$1 and libelle like $2", [artisanId, `%${marque}%`]);
      await db.query("delete from artisan_devis_preparations where sollicitation_id=$1", [demande]);
      await db.query("delete from notification_intentions where organization_id=$1", [org]);
      await db.query("delete from alerts where organization_id=$1", [org]);
      await db.query("delete from incident_sollicitations where id=$1", [demande]);
      await db.query("delete from incident_consultations where id=$1", [consultation]);
      await db.query("delete from incident_evenements where incident_id=$1", [incident]);
      await db.query("delete from incidents where id=$1", [incident]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
