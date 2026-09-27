import { debordementHorizontal, expect, jugerEcran, test } from "./outils";

// RECETTE — LES PAGES PUBLIQUES, SANS SESSION.
//
// Ce que voit quiconque arrive sur le site : chaque page répond, porte un
// titre, n'affiche aucun message d'erreur, ne lève rien dans la console et
// tient dans la largeur d'un téléphone.
//
// Les conditions d'utilisation vivent sous /conditions (lien des formulaires
// d'inscription) : c'est l'adresse vérifiée ; /cgu est essayée en plus, et
// n'est exigée que si elle existe. De même pour /tarifs, que le site n'a pas
// (les tarifs sont sur l'accueil et sur « Mon abonnement ») : si la route
// apparaît un jour, elle est recettée comme les autres.

const PAGES = [
  "/",
  "/mentions-legales",
  "/conditions",
  "/confidentialite",
  "/connexion",
  "/inscription",
  "/artisan/inscription",
];

const PAGES_FACULTATIVES = ["/tarifs", "/cgu"];

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

// Sans session, le proxy ne sait pas si une adresse inconnue est un écran
// protégé : il renvoie à la connexion en gardant la destination (constat de
// la recette du 27/09 — la page « introuvable » ne s'y voit qu'une fois
// connecté ; voir le test du même nom dans admin-agence.spec.ts).
test("sans session, une adresse inconnue mène à la connexion en gardant la destination", async ({ page }) => {
  const chemin = `/recette-adresse-inconnue-${Date.now()}`;
  const reponse = await page.goto(chemin);
  expect(reponse?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(new RegExp(`/connexion\\?suite=${encodeURIComponent(chemin)}`));
  await expect(page.locator("h1").first()).toBeVisible();
});
