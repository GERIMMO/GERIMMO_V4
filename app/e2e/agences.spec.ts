import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal } from "./aides";
import { MESSAGE_SUCCES_LISTE_ATTENTE } from "../src/lib/liste-attente-agences";

// Liste d'attente des agences (20/10/2026), lot SITE : le parcours du visiteur « agence », au téléphone et au bureau.
// Depuis l'accueil, la section « Agences de gestion » mène à /agences ; le formulaire refuse un code postal faux (sans
// vider la saisie), enregistre une inscription (vérifiée en base par `pg`), et répond la même chose à un doublon.
// Sans la base API fictive locale (SUPALOCAL_DB au format gerimmo_ci_<nom>_api), le parcours se saute : il écrit en base.
test.use({ storageState: { cookies: [], origins: [] } });

const DOMAINE = "@agences-e2e.test";
const BOUTON = /^Rejoindre la liste d(?:'|’)attente$/;

async function remplir(page: Page, valeurs: { email: string; codePostal: string }) {
  await page.getByLabel(/^Nom de l(?:'|’)agence$/).fill("Agence E2E du Parc");
  await page.getByLabel("Votre nom", { exact: true }).fill("Marie Durand");
  await page.getByLabel("Votre e-mail professionnel", { exact: true }).fill(valeurs.email);
  await page.getByLabel("Téléphone (facultatif)", { exact: true }).fill("01 02 03 04 05");
  await page.getByLabel(/^Code postal de l(?:'|’)agence$/).fill(valeurs.codePostal);
  await page.getByLabel("Nombre de lots gérés", { exact: true }).selectOption("200_a_499");
  await page.getByLabel("Votre message (facultatif)", { exact: true }).fill("Parcours E2E : à supprimer.");
}

for (const largeur of [390, 1440]) {
  test(`agences : de l'accueil à la liste d'attente, à ${largeur}px`, async ({ page }) => {
    test.setTimeout(90_000);
    const cible = process.env.SUPALOCAL_DB;
    test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
    const db = new Client({ connectionString: cible });
    await db.connect();
    const email = `agence-${largeur}${DOMAINE}`;
    const compter = async () => (await db.query("select count(*)::int n from public.liste_attente_agences where lower(email) = lower($1)", [email])).rows[0].n as number;
    const nettoyer = () => db.query("delete from public.liste_attente_agences where lower(email) like $1", [`%${DOMAINE}`]);
    try {
      await nettoyer();
      await page.setViewportSize({ width: largeur, height: largeur > 800 ? 1000 : 844 });

      // L'accueil montre la section, et son lien mène à /agences.
      await page.goto("/");
      const section = page.locator("#agences");
      await expect(section.getByRole("heading", { name: "Vous gérez des biens pour des mandants ?" })).toBeVisible();
      await section.getByRole("link", { name: BOUTON }).click();
      await expect(page).toHaveURL(/\/agences$/);
      await expect(page.getByRole("heading", { level: 1, name: "Gerimmo pour les agences arrive." })).toBeVisible();
      await expect(page.getByRole("button", { name: BOUTON })).toBeEnabled();
      expect(await debordementHorizontal(page)).toBe(0);

      // Un code postal faux : l'erreur attendue, la saisie conservée, rien en base.
      await remplir(page, { email, codePostal: "7501" });
      await page.getByRole("button", { name: BOUTON }).click();
      // L'alerte DU FORMULAIRE : la page porte aussi une région d'alerte vide (repli hors ligne), que `getByRole` seul
      // attraperait en plus (mode strict).
      await expect(page.locator("form[data-saisie-libre]").getByRole("alert")).toHaveText("Indiquez le code postal de l'agence : cinq chiffres.");
      await expect(page.getByLabel(/^Nom de l(?:'|’)agence$/)).toHaveValue("Agence E2E du Parc");
      await expect(page.getByLabel("Nombre de lots gérés", { exact: true })).toHaveValue("200_a_499");
      expect(await compter()).toBe(0);

      // Corrigé : le message de succès remplace le formulaire, la ligne est en base.
      await page.getByLabel(/^Code postal de l(?:'|’)agence$/).fill("75 011");
      await page.getByRole("button", { name: BOUTON }).click();
      await expect(page.getByText(MESSAGE_SUCCES_LISTE_ATTENTE)).toBeVisible();
      await expect(page.getByRole("button", { name: BOUTON })).toHaveCount(0);
      const { rows } = await db.query(
        "select agence, contact, email, telephone, code_postal, nb_lots, message, source, statut from public.liste_attente_agences where lower(email) = lower($1)",
        [email],
      );
      expect(rows).toEqual([
        { agence: "Agence E2E du Parc", contact: "Marie Durand", email, telephone: "01 02 03 04 05", code_postal: "75011", nb_lots: "200_a_499", message: "Parcours E2E : à supprimer.", source: "/agences", statut: "en_attente" },
      ]);
      expect(await debordementHorizontal(page)).toBe(0);

      // Le doublon (casse différente) : le même message, toujours une seule ligne.
      await page.goto("/agences");
      await remplir(page, { email: email.toUpperCase(), codePostal: "75011" });
      await page.getByRole("button", { name: BOUTON }).click();
      await expect(page.getByText(MESSAGE_SUCCES_LISTE_ATTENTE)).toBeVisible();
      expect(await compter()).toBe(1);
      expect(await debordementHorizontal(page)).toBe(0);
    } finally {
      await nettoyer();
      await db.end();
    }
  });
}
