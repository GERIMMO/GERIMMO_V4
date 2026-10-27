import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { entrerDansEspace, sansSyntheseAlertes, debordementHorizontal } from "./aides";

// Audit de la PR #264, FL-08 : « Nouveau message » mène à l'annuaire ; la fiche d'une personne sans espace
// locataire n'offrait aucune zone de rédaction et ne disait pas pourquoi. Elle dit maintenant qu'il faut l'inviter,
// et mène au formulaire d'invitation. Le cas du constat : un locataire en cours, sans compte (relecture du 27/10 : la
// fiche sans aucun rôle ne le couvrait pas). Sa fiche, un lot cloné et son bail sont créés puis retirés par l'essai
// (base locale seulement).
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10000 });

for (const largeur of [390, 1440]) {
  test(`messages : la fiche d'un locataire en cours sans espace explique qu'il faut l'inviter (${largeur}px)`, async ({ page }, info) => {
    const url = process.env.SUPALOCAL_DB;
    test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base fictive locale requise");
    const db = new Client({ connectionString: url });
    await db.connect();
    const email = `sans-espace-${randomUUID()}@example.invalid`;
    const lot = randomUUID();
    try {
      await page.setViewportSize({ width: largeur, height: 1000 });
      await sansSyntheseAlertes(page);
      const org = await entrerDansEspace(page, "espace");
      const { rows: [personne] } = await db.query<{ id: string }>(
        "insert into public.persons (organization_id, nom, prenom, email) values ($1, 'TEST Sans espace', 'Camille', $2) returning id",
        [org, email]
      );
      const { rows: [source] } = await db.query<{ id: string }>(
        "select id from public.lots where organization_id = $1 and nom = 'Appartement T2 — 12 rue des Lilas'", [org]);
      expect(source).toBeTruthy();
      await db.query(
        `insert into public.lots select (jsonb_populate_record(null::public.lots, to_jsonb(l) || jsonb_build_object(
           'id', $1::text, 'nom', 'Sans espace — essai local', 'etat', 'disponible'))).* from public.lots l where id = $2`,
        [lot, source.id]);
      await db.query(
        `insert into public.baux (organization_id, lot_id, type, etat, locataire_principal, date_debut, loyer_hc, charges, depot_garantie, jour_echeance)
         values ($1, $2, 'nu', 'brouillon', $3, date '2026-01-01', 700, 50, 700, 5)`, [org, lot, personne.id]);
      // Le lot suit son bail (contrôle à la validation) : bail en cours et lot « loué » dans la même transaction.
      await db.query("begin");
      await db.query("update public.baux set etat = 'actif' where lot_id = $1", [lot]);
      await db.query("update public.lots set etat = 'loue' where id = $1", [lot]);
      await db.query("commit");

      // « Nouveau message » mène à l'annuaire, où l'on choisit la personne.
      await page.goto(`/espace/${org}/messages`);
      await expect(page.getByRole("link", { name: "Nouveau message" }).first()).toHaveAttribute("href", `/espace/${org}/personnes`);

      await page.goto(`/espace/${org}/personnes/${personne.id}`);
      // Locataire en cours (le bail apparaît sur sa fiche), sans espace : la navigation propose quand même « Messages ».
      await expect(page.getByRole("navigation", { name: "Dans cette fiche" }).getByRole("link", { name: "Biens et baux" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Dans cette fiche" }).getByRole("link", { name: "Messages" })).toBeVisible();
      const carte = page.locator("#messages");
      await expect(carte).toContainText("invitez d'abord cette personne dans son espace locataire");
      await expect(carte.locator("textarea")).toHaveCount(0);
      const inviter = carte.getByRole("link", { name: "Inviter", exact: true });
      await expect(inviter).toHaveAttribute("href", "#acces-locataire");
      await inviter.click();
      await expect(page).toHaveURL(/#acces-locataire$/);
      await expect(page.locator("#acces-locataire")).toContainText("Donnez-lui l'accès à son espace locataire");
      await expect(page.locator("#acces-locataire")).not.toContainText("futur locataire");
      expect(await debordementHorizontal(page)).toBe(0);
      await page.screenshot({ path: info.outputPath("fiche-sans-espace.png"), fullPage: true });
    } finally {
      await db.query("rollback").catch(() => {});
      await db.query("begin");
      await db.query("delete from public.baux where lot_id = $1", [lot]);
      await db.query("delete from public.lots where id = $1", [lot]);
      await db.query("delete from public.persons where email = $1", [email]);
      await db.query("commit");
      await db.end();
    }
  });
}
