import { debordementHorizontal, expect, jugerEcran, test } from "./outils";

// RECETTE — LES PAGES PUBLIQUES, SANS SESSION.
//
// Ce que voit quiconque arrive sur le site : chaque page répond, porte un
// titre, n'affiche aucun message d'erreur, ne lève rien dans la console et
// tient dans la largeur d'un téléphone.
//
// Les conditions d'utilisation vivent sous /conditions (lien des formulaires
// d'inscription) : c'est l'adresse vérifiée ; /cgu est essayée en plus, et
// n'est exigée que si elle existe. /tarifs existe depuis la grille du
// 28/09/2026 : elle est recettée comme les autres.

const PAGES = [
  "/",
  "/mentions-legales",
  "/conditions",
  "/confidentialite",
  "/tarifs",
  "/outils",
  "/outils/calcul-irl",
  "/outils/quittance-de-loyer",
  "/outils/comparateur-gli-visale",
  "/outils/simulateur-lmnp",
  "/outils/rentabilite-locative",
  "/connexion",
  "/inscription",
  "/artisan/inscription",
];

const PAGES_FACULTATIVES = ["/cgu"];

for (const chemin of PAGES) {
  test(`page publique ${chemin} : répond, titrée, sans erreur ni débordement`, async ({ page, surveillance }) => {
    const defauts = await jugerEcran(page, chemin, surveillance);
    expect(defauts, `Défauts relevés sur ${chemin}`).toEqual([]);
    expect(await debordementHorizontal(page), `Débordement horizontal sur ${chemin}`).toBeLessThanOrEqual(0);
  });
}

for (const chemin of PAGES_FACULTATIVES) {
  test(`page publique facultative ${chemin} : recettée si elle existe`, async ({ page, request, surveillance }) => {
    // Sans suivre les redirections : le proxy renvoie toute adresse qu'il ne
    // connaît pas comme publique vers /connexion — ce n'est pas une page.
    const reponse = await request.get(chemin, { maxRedirects: 0 });
    const cible = reponse.headers()["location"] ?? "";
    test.skip(
      reponse.status() === 404 || (reponse.status() >= 300 && reponse.status() < 400 && cible.includes("/connexion")),
      `${chemin} n'existe pas comme page publique sur ce site`,
    );
    const defauts = await jugerEcran(page, chemin, surveillance);
    expect(defauts, `Défauts relevés sur ${chemin}`).toEqual([]);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
  });
}

// Sans session, une adresse qui ne désigne aucun écran affiche la page
// « introuvable » avec un vrai 404 (corrigé après la recette du 27/09 : elle
// menait à la connexion). Une adresse privée qui existe mène, elle, à la
// connexion en gardant la destination.
test("sans session, une adresse inconnue affiche « Cette page est introuvable »", async ({ page }) => {
  const reponse = await page.goto(`/recette-adresse-inconnue-${Date.now()}`);
  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Cette page est introuvable" })).toBeVisible();
});

test("sans session, un écran privé mène à la connexion en gardant la destination", async ({ page }) => {
  const chemin = "/espaces";
  const reponse = await page.goto(chemin);
  expect(reponse?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(new RegExp(`/connexion\\?suite=${encodeURIComponent(chemin)}`));
  await expect(page.locator("h1").first()).toBeVisible();
});
