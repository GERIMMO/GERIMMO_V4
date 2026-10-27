/**
 * La cascade des feuilles de style des espaces, éprouvée dans Chromium avec les vraies feuilles, dans l'ordre du
 * layout racine (audit #264). Les règles vérifiées ici ne se voient qu'au rendu :
 *  - ED-02 : au téléphone et à la tablette, le menu de la supervision reste clair et ses liens lisibles (≥ 4,5:1) ;
 *  - ED-05 : au téléphone, l'en-tête du locataire reste blanc (la tuile du nom ne flotte pas sur la photo) ;
 *  - ED-03 : la charte d'une agence colore le bouton d'action principal de l'espace locataire ;
 *  - TRV-12 : le repère saisonnier quitte l'en-tête du propriétaire à ≤ 420 px ;
 *  - TRV-08 : sous 500 px de haut, l'en-tête du propriétaire n'est plus collant ;
 *  - TRV-02 : la recherche ouverte (dialogue natif) bloque le défilement de la page derrière elle ;
 *  - TRV-03 : avant l'hydratation (pas d'ambiance posée), aucune photo de fond n'est demandée pour le menu.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contraste, styleMarque } from "../src/lib/marque-organisation";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
// L'ordre d'import de src/app/layout.tsx : c'est lui qui départage les règles de même spécificité.
const FEUILLES = ["globals", "prestige", "harmonie", "proprietaire", "experience-unifiee", "ambiances"]
  .map(nom => readFileSync(resolve(racine, `src/app/${nom}.css`), "utf8"));
const charte = Object.entries(styleMarque({ couleur_primaire: "#0a6e46", couleur_secondaire: "#3b1f5c" }) as Record<string, string>)
  .map(([cle, valeur]) => `${cle}:${valeur}`).join(";");

const CORPS = `
  <div class="admin-coquille experience-unifiee"><aside class="admin-late"><nav><a class="admin-nav-lien" href="#">Utilisateurs</a></nav></aside></div>
  <div class="loc-app gerimmo-prestige experience-unifiee" id="locataire"><aside class="loc-late"><div class="loc-logo"><a href="#">Agence Alpha</a></div></aside><a class="btn-or" href="#">Signaler un problème</a></div>
  <div class="loc-app gerimmo-prestige experience-unifiee" id="locataire-charte" style="${charte}"><a class="btn-or" href="#">Signaler un problème</a></div>
  <div class="coquille gerimmo-prestige espace-proprietaire"><aside class="coquille-late"></aside><div class="coquille-corps"><header class="coquille-haut"><span class="ambiance-repere"></span></header></div></div>`;

describe.skipIf(!chrome)("feuilles de style des espaces (audit #264)", () => {
  let navigateur: Browser;
  let photos: string[];
  beforeAll(async () => { navigateur = await chromium.launch({ executablePath: chrome }); }, 60000);
  afterAll(async () => { await navigateur?.close(); });

  async function ouvrir(largeur: number, hauteur: number, ambiance: boolean): Promise<Page> {
    const page = await navigateur.newPage({ viewport: { width: largeur, height: hauteur } });
    photos = [];
    await page.route("http://localhost/**", route => {
      const chemin = new URL(route.request().url()).pathname;
      if (chemin.startsWith("/illustrations/")) { photos.push(chemin); return route.fulfill({ status: 204, body: "" }); }
      if (chemin !== "/banc") return route.fulfill({ status: 404, body: "" });
      const html = `<!doctype html><html lang="fr" ${ambiance ? 'data-ambiance-site="automne" style="--ambiance-image:url(/illustrations/accueil-evenements/automne.webp)"' : ""}><head>${FEUILLES.map(f => `<style>${f}</style>`).join("")}</head><body class="gerimmo-prestige">${CORPS}</body></html>`;
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    });
    await page.goto("http://localhost/banc", { waitUntil: "load" });
    return page;
  }
  const style = (page: Page, selecteur: string) => page.locator(selecteur).first().evaluate(e => {
    const s = getComputedStyle(e);
    return { fond: s.backgroundColor, image: s.backgroundImage, couleur: s.color, display: s.display, position: s.position };
  });
  const hexa = (rgb: string) => "#" + (rgb.match(/\d+/g) ?? []).slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("");

  for (const largeur of [390, 900]) {
    it(`ED-02 : à ${largeur} px, le menu de la supervision reste clair et ses liens lisibles`, async () => {
      const page = await ouvrir(largeur, 900, true);
      const menu = await style(page, ".admin-late");
      expect(menu.image).not.toContain("quartier-gerimmo");
      expect(menu.image).not.toContain("accueil-evenements");
      const lien = await style(page, ".admin-nav-lien");
      const fonds = (menu.image.match(/rgba?\([^)]*\)/g) ?? [menu.fond]).map(hexa);
      for (const fond of fonds) expect(contraste(hexa(lien.couleur), fond), `${lien.couleur} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
      await page.close();
    });
  }

  it("ED-02 : à l'ordinateur, la photo voilée du menu de la supervision est conservée", async () => {
    const page = await ouvrir(1440, 900, true);
    expect((await style(page, ".admin-late")).image).toContain("accueil-evenements/automne.webp");
    await page.close();
  });

  it("ED-05 : au téléphone, l'en-tête du locataire reste blanc, sans photo ; à l'ordinateur, le menu garde son décor", async () => {
    const telephone = await ouvrir(390, 844, true);
    expect(await style(telephone, "#locataire .loc-late")).toMatchObject({ fond: "rgb(255, 255, 255)", image: "none" });
    await telephone.close();
    const ordinateur = await ouvrir(1440, 900, true);
    expect((await style(ordinateur, "#locataire .loc-late")).image).toContain("accueil-evenements/automne.webp");
    await ordinateur.close();
  });

  for (const largeur of [390, 1440]) {
    it(`ED-03 : à ${largeur} px, le bouton principal prend la couleur de la charte, l'or de Gerimmo sans charte`, async () => {
      const page = await ouvrir(largeur, 900, true);
      expect(await style(page, "#locataire-charte .btn-or")).toMatchObject({ fond: "rgb(10, 110, 70)", couleur: "rgb(255, 255, 255)" });
      expect(await style(page, "#locataire .btn-or")).toMatchObject({ fond: "rgb(214, 187, 131)", couleur: "rgb(23, 40, 62)" });
      await page.close();
    });
  }

  it("TRV-12 : le repère saisonnier de l'en-tête du propriétaire disparaît à ≤ 420 px", async () => {
    for (const [largeur, masque] of [[320, true], [420, true], [440, false]] as const) {
      const page = await ouvrir(largeur, 800, true);
      expect((await style(page, ".coquille-haut .ambiance-repere")).display === "none", `${largeur} px`).toBe(masque);
      await page.close();
    }
  });

  it("TRV-08 : sous 500 px de haut, l'en-tête du propriétaire défile avec la page", async () => {
    for (const [largeur, hauteur, attendu] of [[320, 256, "relative"], [844, 390, "relative"], [390, 844, "sticky"], [1440, 900, "sticky"]] as const) {
      const page = await ouvrir(largeur, hauteur, true);
      expect((await style(page, ".coquille-haut")).position, `${largeur}×${hauteur}`).toBe(attendu);
      await page.close();
    }
  });

  it("TRV-02 : la page derrière la recherche ouverte ne défile plus, et défile de nouveau à sa fermeture", async () => {
    const page = await ouvrir(1440, 600, true);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML("beforeend", '<div style="height:3000px"></div><dialog class="recherche-dialog"><input aria-label="Recherche"></dialog>');
      document.querySelector<HTMLDialogElement>(".recherche-dialog")!.showModal();
    });
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
    await page.mouse.move(5, 590); await page.mouse.wheel(0, 800); await page.waitForTimeout(200);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.evaluate(() => document.querySelector<HTMLDialogElement>(".recherche-dialog")!.close());
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
    await page.close();
  });

  it("TRV-03 : avant l'ambiance, le menu ne demande aucune photo ; avec elle, une seule", async () => {
    const avant = await ouvrir(1440, 900, false);
    expect(await style(avant, ".coquille-late")).toMatchObject({ image: "none" });
    expect(photos).toEqual([]);
    await avant.close();
    const apres = await ouvrir(1440, 900, true);
    expect((await style(apres, ".coquille-late")).image).toContain("accueil-evenements/automne.webp");
    await apres.waitForTimeout(200);
    expect(photos.filter(p => p.includes("quartier-gerimmo"))).toEqual([]);
    await apres.close();
  });
});
