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
        export async function creerPersonneBail(...args) { const resultat=await enregistrer(...args); if(window.__personnesBailEchecCreation-- > 0) return {erreur:"Réponse interrompue. Votre saisie reste disponible."}; return resultat; }
        export const modifierPersonneBail = enregistrer, choisirPersonneBail = enregistrer, retirerPersonneBail = enregistrer;`;
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
  it("retrouve une fiche sans accents et reprend ses informations sans les ressaisir", async () => {
    await page.goto("http://localhost/banc?scenario=annuaire");
    await page.getByRole("button",{name:"Choisir un locataire",exact:true}).click();
    await page.getByLabel("Rechercher une personne",{exact:true}).fill("helene leroy");
    const choix=page.getByLabel("Choisir un locataire enregistré",{exact:true});
    expect(await choix.locator("option").count()).toBe(2);
    await choix.selectOption("existante");
    await page.getByText("Identité et coordonnées reprises de votre annuaire.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Utiliser ce locataire",exact:true}).click();
    await page.waitForFunction(()=>window.__personnesBailEnvois.length===1);
    expect((await page.evaluate(()=>window.__personnesBailEnvois))[0]).toMatchObject({person_id:"existante",role:"principal"});
  });
  it("propose la fiche connue dès que son e-mail est saisi et empêche de la créer en double", async () => {
    await page.goto("http://localhost/banc?scenario=annuaire");
    await page.getByRole("button",{name:"Choisir un locataire",exact:true}).click();
    await page.getByRole("button",{name:"Créer une personne",exact:true}).click();
    await page.getByLabel("Adresse e-mail *",{exact:true}).fill("HELENE@example.test");
    await page.getByRole("button",{name:"Réutiliser cette fiche",exact:true}).waitFor();
    expect(await page.getByRole("button",{name:"Créer et ajouter au bail",exact:true}).isDisabled()).toBe(true);
    await page.getByRole("button",{name:"Réutiliser cette fiche",exact:true}).click();
    expect(await page.getByLabel("Choisir un locataire enregistré",{exact:true}).inputValue()).toBe("existante");
    expect(await page.evaluate(()=>window.__personnesBailEnvois)).toEqual([]);
  });
  it("reprend un e-mail recherché et ne copie une adresse qu'après un choix explicite", async () => {
    await page.goto("http://localhost/banc?scenario=colocation");
    await page.getByRole("button",{name:"Ajouter un colocataire",exact:true}).click();
    await page.getByLabel("Rechercher une personne",{exact:true}).fill("nouveau@example.test");
    await page.getByRole("button",{name:"Créer une personne",exact:true}).click();
    expect(await page.getByLabel("Adresse e-mail *",{exact:true}).inputValue()).toBe("nouveau@example.test");
    expect(await page.getByLabel("Adresse *",{exact:true}).inputValue()).toBe("");
    await page.getByLabel("Nom *",{exact:true}).fill("Nouveau");
    await page.getByRole("button",{name:"Utiliser cette adresse",exact:true}).click();
    expect(await page.getByLabel("Adresse *",{exact:true}).inputValue()).toBe("18 rue des Acacias");
    expect(await page.getByLabel("Code postal *",{exact:true}).inputValue()).toBe("69003");
    expect(await page.getByLabel("Ville *",{exact:true}).inputValue()).toBe("Lyon");
    expect(await page.getByLabel("Nom *",{exact:true}).inputValue()).toBe("Nouveau");
    expect(await page.evaluate(()=>window.__personnesBailEnvois)).toEqual([]);
  });
  it.each([["colocation","principal"],["colocation_plusieurs",""]])("garant : présélection déterministe dans %s", async (scenario,attendu) => {
    await page.goto(`http://localhost/banc?scenario=${scenario}`);
    await page.getByRole("button",{name:"Ajouter un garant",exact:true}).click();
    expect(await page.getByLabel("Ce garant couvre",{exact:true}).inputValue()).toBe(attendu);
  });
  it("une réponse perdue conserve la saisie et la même clé de création", async () => {
    await page.getByRole("button",{name:"Choisir un locataire",exact:true}).click();
    for(const [label,valeur] of Object.entries({"Nom *":"Test","Prénom *":"Alice","Adresse e-mail *":"alice@example.test","Date de naissance *":"1990-01-01","Commune de naissance *":"Lyon","Adresse *":"1 rue Test","Code postal *":"69003","Ville *":"Lyon"}))await page.getByLabel(label,{exact:true}).fill(valeur);
    await page.evaluate(()=>{window.__personnesBailEchecCreation=1;});
    await page.getByRole("button",{name:"Créer et ajouter au bail",exact:true}).click();
    await page.getByText("Réponse interrompue. Votre saisie reste disponible.",{exact:true}).waitFor();
    expect(await page.getByLabel("Prénom *",{exact:true}).inputValue()).toBe("Alice");
    await page.getByRole("button",{name:"Créer et ajouter au bail",exact:true}).click();
    await page.waitForFunction(()=>window.__personnesBailEnvois.length===2);
    const envois=await page.evaluate(()=>window.__personnesBailEnvois);
    expect(envois[0].creation_id).toMatch(/^[0-9a-f-]{36}$/i);expect(envois[1].creation_id).toBe(envois[0].creation_id);
    // Audit final, BAIL-24 : la fiche créée depuis l'assistant est rattachée au bail dans le même envoi.
    expect(envois[1]).toMatchObject({ role: "principal" });
  });
});
