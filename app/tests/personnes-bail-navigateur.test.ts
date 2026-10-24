/** Régression observée : corriger une société en particulier révèle immédiatement son identité, sans rouvrir la fiche. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {} from "./fixtures/navigateur/banc-personnes-bail";
const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
async function assembler() {
  const paquet = await rolldown({
    input: resolve(racine, "tests/fixtures/navigateur/banc-personnes-bail.tsx"), platform: "browser",
    plugins: [{ name: "serveur-isole", resolveId(id) {
      if (id === "@/app/actions/personnes-bail") return "\0actions";
      if (id === "next/navigation") return "\0navigation";
      if (id.endsWith("depot-direct-client")) return "\0depot";
      if (id.endsWith(".module.css")) return "\0css";
    }, load(id) {
      if (id === "\0actions") return `async function enregistrer(...args) { window.__personnesBailEnvois.push(Object.fromEntries(args.at(-1))); return {succes: "Enregistré", personneCreee: {id:"nouvelle"}}; }
        export const modifierPersonneBail = enregistrer, creerPersonneBail = enregistrer, choisirPersonneBail = enregistrer, retirerPersonneBail = enregistrer;`;
      if (id === "\0navigation") return 'export function useRouter(){return {refresh(){}}} export function unstable_rethrow(){}';
      if (id === "\0depot") return 'export async function preparerDepotsDirects(){} export class ErreurDepotDirect extends Error{}';
      if (id === "\0css") return 'export default {}';
    } }],
    resolve: { alias: { "@": resolve(racine, "src"), "next/link": resolve(racine, "tests/fixtures/navigateur/next-link-neutre.tsx") } },
    transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } }, logLevel: "silent",
  });
  try { return (await paquet.generate({format:"iife"})).output[0].code; } finally { await paquet.close(); }
}
describe.skipIf(!chrome)("Personnes du bail : parcours sans détour", () => {
  let browser: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  beforeAll(async () => { script = await assembler(); browser = await chromium.launch({ executablePath: chrome }); }, 120000);
  afterAll(async () => { await browser?.close(); });
  beforeEach(async () => {
    contexte = await browser.newContext({ locale:"fr-FR" }); page = await contexte.newPage(); page.setDefaultTimeout(3000); erreurs=[];
    page.on("pageerror", e => erreurs.push(e.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? {contentType:"text/javascript; charset=utf-8",body:script}
      : {contentType:"text/html; charset=utf-8",body:'<!doctype html><html lang="fr"><body><div id="racine"></div><script src="/banc.js"></script></body></html>'}));
    await page.goto("http://localhost/banc");
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });
  it.each(["Personne physique", "Indivision (personnes physiques)"])("%s : identité enregistrée en un passage", async qualite => {
    await page.getByRole("button", {name:"Modifier la fiche de Bailleur exemple"}).click();
    await page.getByLabel("Qualité du propriétaire *",{exact:true}).selectOption(qualite);
    await page.getByLabel("Prénom *",{exact:true}).fill("Jeanne");
    await page.getByLabel("Date de naissance *",{exact:true}).fill("1990-01-01");
    await page.getByLabel("Commune de naissance *",{exact:true}).fill("Poitiers");
    await page.getByRole("button", {name:"Enregistrer la fiche",exact:true}).click();
    await page.waitForFunction(() => window.__personnesBailEnvois.length === 1);
    const [envoi] = await page.evaluate(() => window.__personnesBailEnvois);
    expect(envoi).toMatchObject({qualite,prenom:"Jeanne",date_naissance:"1990-01-01",commune_naissance:"Poitiers"});
    expect(envoi.morale).toBeUndefined();
    expect(await page.getByLabel("Prénom *",{exact:true}).count()).toBe(0);
  });
  it("revenir à SCI familiale rétablit les champs de société avant l'envoi", async () => {
    await page.getByRole("button", {name:"Modifier la fiche de Bailleur exemple"}).click();
    const qualite = page.getByLabel("Qualité du propriétaire *",{exact:true});
    await qualite.selectOption("Personne physique");
    await page.getByLabel("Prénom *",{exact:true}).fill("Jeanne");
    await qualite.selectOption("SCI familiale");
    expect(await page.getByLabel("Prénom *",{exact:true}).count()).toBe(0);
    await page.getByLabel("Raison sociale *",{exact:true}).fill("SCI Exemple");
    await page.getByRole("button", {name:"Enregistrer la fiche",exact:true}).click();
    await page.waitForFunction(() => window.__personnesBailEnvois.length === 1);
    expect((await page.evaluate(() => window.__personnesBailEnvois))[0]).toMatchObject({qualite:"SCI familiale",morale:"on",nom:"SCI Exemple"});
  });
  it("sans personne disponible, ouvre la création ; Annuler quitte sans créer de fiche", async () => {
    await page.getByRole("button",{name:"Choisir un locataire",exact:true}).click();
    await page.getByLabel("Prénom *",{exact:true}).waitFor();
    expect(await page.getByLabel("Choisir un locataire enregistré").count()).toBe(0);
    await page.getByRole("button",{name:"Annuler",exact:true}).click();
    expect(await page.getByLabel("Prénom *",{exact:true}).count()).toBe(0);
    expect(await page.evaluate(() => window.__personnesBailEnvois)).toEqual([]);
  });
});
