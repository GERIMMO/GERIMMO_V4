import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {} from "./fixtures/navigateur/banc-navigation-bail";
const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Navigation du bail : entrer dans une étape sans l’envoyer", () => {
  let browser: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  beforeAll(async () => {
    const paquet = await rolldown({
      input: resolve(racine, "tests/fixtures/navigateur/banc-navigation-bail.tsx"), platform: "browser",
      plugins: [{ name: "serveur-isole", resolveId(id) {
        if (id.endsWith("verifier-dossier")) return "\0verification";
        if (id.endsWith(".module.css")) return "\0css";
      }, load(id) {
        if (id === "\0verification") return 'export async function verifierDossierBail(){return {manquants:[]}}';
        if (id === "\0css") return 'export default {}';
      } }],
      resolve: { alias: { "@": resolve(racine, "src"), "next/link": resolve(racine, "tests/fixtures/navigateur/next-link-neutre.tsx") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development"), "process.env": "{}" } }, logLevel: "silent",
    });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    browser = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await browser?.close(); });
  beforeEach(async () => {
    contexte = await browser.newContext({ locale: "fr-FR" }); page = await contexte.newPage(); page.setDefaultTimeout(3000); erreurs = []; page.on("pageerror", error => erreurs.push(error.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? { contentType: "text/javascript; charset=utf-8", body: script }
      : { contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><body><div id="racine"></div><script src="/banc.js"></script></body></html>' }));
    await page.goto("http://localhost/banc#etape-bail-3");
    await page.getByRole("heading", { name: "Le logement", exact: true }).waitFor();
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });
  it.each(["clic", "clavier"])("Suivant (%s) ouvre le loyer sans erreur prématurée ; le bouton d’enregistrement le valide", async geste => {
    const suivant = page.getByRole("button", { name: "Suivant", exact: true });
    if (geste === "clavier") await suivant.press("Enter"); else await suivant.click();
    await page.getByLabel("Loyer d’essai").waitFor();
    expect(await page.evaluate(() => window.__navigationBail)).toEqual({ invalides: 0, envois: 0 });
    await page.getByRole("button", { name: "Enregistrer et continuer", exact: true }).click();
    expect(await page.evaluate(() => window.__navigationBail)).toEqual({ invalides: 1, envois: 0 });
    await page.getByLabel("Loyer d’essai").fill("750");
    await page.getByRole("button", { name: "Enregistrer et continuer", exact: true }).click();
    expect(await page.evaluate(() => window.__navigationBail)).toEqual({ invalides: 1, envois: 1 });
  });
  it.each([
    ["Corriger la date","Date d’entrée d’essai"],
    ["Corriger le loyer","Loyer d’essai"],
    ["Corriger le DPE","Dépenses DPE d’essai"],
  ])("le récapitulatif ouvre et focalise directement le champ : %s",async(lien,label)=>{
    await page.getByRole("button",{name:/Étape 07 Récapitulatif/}).click();
    await page.getByRole("link",{name:lien,exact:true}).click();
    const champ=page.getByLabel(label,{exact:true});
    await champ.waitFor();
    await page.waitForFunction(id=>document.activeElement?.id===id,await champ.getAttribute("id"));
    expect(await page.evaluate(()=>window.__navigationBail)).toEqual({invalides:0,envois:0});
  });
  it("déplie les options, conserve la saisie et refocalise une ancre déjà courante",async()=>{
    await page.getByRole("button",{name:/Étape 07 Récapitulatif/}).click();
    await page.getByRole("link",{name:"Corriger l’indice",exact:true}).click();
    const indice=page.getByLabel("Indice d’essai");
    await indice.waitFor();
    await page.waitForFunction(()=>document.activeElement?.id==="parcours-irl_valeur");
    await indice.fill("145,50");
    await page.getByLabel("Loyer d’essai").click();
    await page.getByRole("link",{name:"Revenir à l’indice"}).click();
    await page.waitForFunction(()=>document.activeElement?.id==="parcours-irl_valeur");
    await page.getByRole("button",{name:/Étape 07 Récapitulatif/}).click();
    await page.getByRole("link",{name:"Corriger l’indice",exact:true}).click();
    expect(await indice.inputValue()).toBe("145,50");
    expect(await page.evaluate(()=>window.__navigationBail)).toEqual({invalides:0,envois:0});
  });
  it("ne quitte pas l’étape pendant un enregistrement",async()=>{
    await page.getByRole("button",{name:/Étape 07 Récapitulatif/}).click();
    await page.getByRole("button",{name:"Simuler un enregistrement"}).click();
    await page.getByRole("link",{name:"Corriger le loyer",exact:true}).click();
    expect(await page.getByRole("heading",{name:"Récapitulatif",exact:true}).isVisible()).toBe(true);
    expect(new URL(page.url()).hash).toBe("#etape-bail-7");
    await page.getByRole("button",{name:"Terminer l’enregistrement"}).click();
    await page.getByRole("link",{name:"Corriger le loyer",exact:true}).click();
    await page.getByLabel("Loyer d’essai").waitFor();
  });
  it("focalise le titre exact de la rubrique propriétaire sans ouvrir de formulaire",async()=>{
    await page.getByRole("button",{name:/Étape 07 Récapitulatif/}).click();
    await page.getByRole("link",{name:"Corriger le propriétaire",exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==="titre-proprietaires-bail");
    expect(await page.getByRole("heading",{name:"Propriétaire d’essai"}).isVisible()).toBe(true);
  });
});
