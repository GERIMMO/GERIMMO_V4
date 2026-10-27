import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { entrerDansEspace, sansSyntheseAlertes, debordementHorizontal } from "./aides";

// Audit de la PR #264, FL-08 : « Nouveau message » mène à l'annuaire ; la fiche d'une personne sans espace
// locataire n'offrait aucune zone de rédaction et ne disait pas pourquoi. Elle dit maintenant qu'il faut l'inviter,
// et mène au formulaire d'invitation. La fiche fictive est créée puis retirée par l'essai (base locale seulement).
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10000 });

for (const largeur of [390, 1440]) {
  test(`messages : la fiche d'une personne sans espace explique qu'il faut l'inviter (${largeur}px)`, async ({ page }, info) => {
    const url = process.env.SUPALOCAL_DB;
    test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base fictive locale requise");
    const db = new Client({ connectionString: url });
    await db.connect();
    const email = `sans-espace-${randomUUID()}@example.invalid`;
    try {
      await page.setViewportSize({ width: largeur, height: 1000 });
      await sansSyntheseAlertes(page);
      const org = await entrerDansEspace(page, "espace");
      const { rows: [personne] } = await db.query<{ id: string }>(
        "insert into public.persons (organization_id, nom, prenom, email) values ($1, 'TEST Sans espace', 'Camille', $2) returning id",
        [org, email]
      );

      // « Nouveau message » mène à l'annuaire, où l'on choisit la personne.
      await page.goto(`/espace/${org}/messages`);
      await expect(page.getByRole("link", { name: "Nouveau message" }).first()).toHaveAttribute("href", `/espace/${org}/personnes`);

      await page.goto(`/espace/${org}/personnes/${personne.id}`);
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
      await db.query("delete from public.persons where email = $1", [email]);
      await db.end();
    }
  });
}
