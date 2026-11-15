import { test, expect } from "@playwright/test";
import path from "node:path";

const portails = [
  { role: "locataire", page: "/locataire/c14c3187-1258-4e58-8822-368c6007e3fa" },
  { role: "artisan", page: "/artisan" },
  { role: "superadmin", page: "/admin" },
];

for (const portail of portails) {
  test.describe(portail.role, () => {
    test.use({ storageState: path.join(__dirname, ".auth", portail.role + ".json") });
    test("atteint le contenu au premier geste clavier", async ({ page }) => {
      await page.goto(portail.page);
      const lien = page.getByRole("link", { name: "Aller au contenu", exact: true });
      await expect(lien).toBeAttached();
      await page.keyboard.press("Tab");
      await expect(lien).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#contenu-espace")).toBeFocused();
    });
  });
}
