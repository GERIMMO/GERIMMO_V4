import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Messagerie propriétaire : suivre le dernier échange sans interrompre la lecture", () => {
  let navigateur: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  const css = readFileSync(resolve(racine, "src/app/agence/[orgId]/messages/messagerie.module.css"), "utf8");
  const historique = () => page.getByRole("region", { name: "Historique des messages" });
  const ecartDuBas = () => historique().evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop);
  const remonter = async () => {
    await historique().evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  };
  beforeAll(async () => {
    const paquet = await rolldown({
      input: resolve(racine, "tests/fixtures/navigateur/banc-conversation-proprietaire.tsx"), platform: "browser",
      plugins: [{ name: "aucun-envoi-externe", resolveId(id) {
        if (id.endsWith("/actions/messages")) return "\0messages";
        if (id.endsWith("depot-direct-client")) return "\0depots";
        if (id === "next/navigation") return "\0navigation";
        if (id.endsWith(".module.css")) return "\0css";
      }, load(id) {
        if (id === "\0messages") return 'export async function repondreMessagePersonne(_org,_personne,_etat,donnees){const texte=String(donnees.get("texte"));if(texte==="refus")return {erreur:"Refus fictif"};window.dispatchEvent(new CustomEvent("reponse-fictive",{detail:texte}));return {succes:"Réponse fictive enregistrée"};}';
        if (id === "\0depots") return 'export class ErreurDepotDirect extends Error {}; export async function preparerDepotsDirects() {}';
        if (id === "\0navigation") return 'export function unstable_rethrow() {}';
        if (id === "\0css") return 'export default new Proxy({},{get:(_,cle)=>cle})';
      } }],
      resolve: { alias: { "@": resolve(racine, "src") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } }, logLevel: "silent",
    });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    navigateur = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await navigateur?.close(); });
  beforeEach(async () => {
    contexte = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 390, height: 844 } });
    page = await contexte.newPage(); page.setDefaultTimeout(3000);
    erreurs = []; page.on("pageerror", erreur => erreurs.push(erreur.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? { contentType: "text/javascript; charset=utf-8", body: script }
      : { contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="fr"><head><title>Conversation fictive</title><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui}main{max-width:700px;margin:auto;padding:16px}button{min-height:44px}${css}</style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>` }));
    await page.goto("http://localhost/espace/fictif/messages");
    await historique().waitFor();
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });

  it("ouvre une longue conversation sur le dernier message, sans déplacer la page", async () => {
    await expect.poll(ecartDuBas).toBeLessThanOrEqual(1);
    expect(await historique().evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
  it("suit un nouveau message si le lecteur est déjà en bas", async () => {
    await page.getByRole("button", { name: "Recevoir un message fictif" }).click();
    await expect.poll(() => historique().getByText("Nouveau message du locataire", { exact: true }).count()).toBe(1);
    await expect.poll(ecartDuBas).toBeLessThanOrEqual(1);
  });
  it("conserve la position de lecture quand une mise à jour arrive", async () => {
    await remonter();
    await page.getByRole("button", { name: "Recevoir un message fictif" }).click();
    await expect.poll(() => historique().getByText("Nouveau message du locataire", { exact: true }).count()).toBe(1);
    expect(await historique().evaluate(element => element.scrollTop)).toBe(0);
    expect(await ecartDuBas()).toBeGreaterThan(100);
  });
  it("montre notre réponse confirmée même après la lecture de messages anciens", async () => {
    await remonter();
    await page.getByLabel("Votre message", { exact: true }).fill("Réponse propriétaire fictive");
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await page.getByText("Réponse fictive enregistrée", { exact: true }).waitFor();
    expect(await historique().getByText("Réponse propriétaire fictive", { exact: true }).count()).toBe(1);
    await expect.poll(ecartDuBas).toBeLessThanOrEqual(1);
    expect(await page.getByLabel("Votre message", { exact: true }).inputValue()).toBe("");
  });
  it("un refus conserve la saisie et la position de lecture", async () => {
    await remonter();
    await page.getByLabel("Votre message", { exact: true }).fill("refus");
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await page.getByRole("alert").waitFor();
    expect(await historique().evaluate(element => element.scrollTop)).toBe(0);
    expect(await page.getByLabel("Votre message", { exact: true }).inputValue()).toBe("refus");
  });
});
