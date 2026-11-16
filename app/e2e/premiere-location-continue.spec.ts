import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { baseApiFictive } from "./local/base-api-fictive";
import { debordementHorizontal } from "./aides";

async function etape(page: Page, numero: string) {
  await page.getByRole("button", { name: new RegExp("^Étape " + numero + " ") }).click();
}

test("Résidence des Acacias : de la première inscription à la quittance du même logement", async ({ page, context, baseURL }, info) => {
  test.setTimeout(240_000);
  baseApiFictive(process.env.SUPALOCAL_DB);
  const origine = new URL(baseURL!).origin;
  expect(origine).toMatch(/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/);
  await context.route("**/*", route => ["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const rappel = page.getByRole("dialog").filter({has:page.getByRole("link",{name:/Toutes les alertes/})});
  await page.addLocatorHandler(rappel, () => rappel.getByRole("button",{name:"Fermer",exact:true}).first().click());
  const email = "acacias-" + randomUUID() + "@example.invalid";
  const date = new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Paris"});
  const debut = date.slice(0,7) + "-01";
  const suivant = () => page.getByRole("button",{name:"Suivant",exact:true}).click();
  const continuer = () => page.getByRole("button",{name:"Enregistrer et continuer",exact:true}).click();
  await page.goto("/inscription");
  for (const [nom,valeur] of [["Prénom","Élise"],["Nom","Morel"],["Adresse e-mail",email],["Adresse postale","3 rue des Acacias"],["Code postal","69003"],["Ville","Lyon"]]) {
    await page.getByLabel(nom,{exact:nom==="Nom"}).fill(valeur);
  }
  await page.getByRole("button",{name:"Ouvrir mon espace"}).click();
  await expect(page.getByText(/Vérifiez votre boîte mail/)).toBeVisible();
  const courriers = await (await page.request.get("http://127.0.0.1:55520/messages")).json() as {to:string[];html:string}[];
  const courrier = courriers.findLast(m => m.to.includes(email));
  const confirmation = new URL(courrier!.html.match(/href="([^"]*\/auth\/confirm[^"]*)"/)![1].replaceAll("&amp;","&"));
  expect(confirmation.origin).toBe(origine);
  await page.goto(confirmation.href);
  await page.getByRole("button",{name:/Confirmer mon adresse|Choisir mon mot de passe/}).click();
  const mot = randomUUID()+"!aA";
  await page.getByLabel("Nouveau mot de passe",{exact:true}).fill(mot);
  await page.getByLabel("Confirmation",{exact:true}).fill(mot);
  const acceptation = page.getByRole("checkbox",{name:/accepte les conditions/});
  if (await acceptation.count()) await acceptation.check();
  await page.getByRole("button",{name:/Changer le mot de passe|Créer mon mot de passe|Valider/}).click();
  await page.waitForURL(/\/espace\/[a-f0-9-]{36}/);
  const espace = new URL(page.url()).pathname;
  await page.goto(espace+"/parc/nouveau");
  for (const [nom,valeur] of [["Nom du bien","Résidence des Acacias"],["Adresse","9 rue des Acacias"],["Code postal","69003"],["Ville","Lyon"],["Année de construction","1998"],["Parties communes","Hall"],["Accès internet","Fibre"]]) {
    await page.getByLabel(nom,{exact:["Nom du bien","Adresse"].includes(nom)}).fill(valeur);
  }
  await suivant();
  await page.getByLabel(/Surface.*m²/).fill("42");
  await page.getByLabel("Nombre de pièces").fill("2");
  await page.getByRole("button",{name:"Créer le lot et continuer"}).click();
  await page.waitForURL(/\/lots\/[a-f0-9-]{36}/);
  const lot = new URL(page.url()).pathname;
  for(const [nom,valeur] of Object.entries({etage:"2",identifiant_fiscal:"123456789012",chauffage:"Électrique individuel",eau_chaude:"Ballon électrique",locaux_privatifs:"Séjour et chambre",description:"Balcon sur cour"})) {
    await page.locator("[name="+nom+"]:visible").fill(valeur);
  }
  await continuer();
  await expect(page.getByText("Étape 3 sur 6",{exact:true})).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.goto(espace+"/personnes");
  await page.getByRole("link",{name:"Créer une fiche"}).click();
  await page.getByRole("button",{name:/Locataire /}).click();
  for (const [id,v] of Object.entries({nom:"Rivière",prenom:"Sam",date_naissance:"1990-04-02",commune_naissance:"Lyon"})) await page.locator("#p-"+id).fill(v);
  await suivant();
  for (const [id,v] of Object.entries({email:"sam@example.invalid",address_line1:"8 rue des Acacias",postal_code:"69003",city:"Lyon"})) await page.locator("#p-"+id).fill(v);
  await suivant(); await suivant();
  await page.getByRole("button",{name:"Créer la fiche",exact:true}).click();
  await expect(page.getByText("La fiche est créée")).toBeVisible();
  await page.goto(lot);
  await page.getByRole("button",{name:"Commencer un bail",exact:true}).first().click();
  await page.waitForURL(/\/baux\/[a-f0-9-]{36}/);
  const bail = new URL(page.url()).pathname;
  await page.locator("[name=date_debut]:visible").fill(debut);
  await page.locator("[name=date_conclusion_prevue]:visible").fill(debut);
  await continuer(); await etape(page,"02");
  await page.getByRole("button",{name:"Choisir un locataire",exact:true}).click();
  const choix=page.locator("#choix-bail-principal");
  await choix.selectOption({label:await choix.locator("option").filter({hasText:"sam@example.invalid"}).innerText()});
  await page.getByRole("button",{name:"Utiliser ce locataire",exact:true}).click();
  await expect(choix).toBeHidden();
  await etape(page,"04");
  for(const [nom,v] of Object.entries({loyer_hc:"600",charges:"40",depot_garantie:"600",jour_echeance:"1"})) await page.locator("[name="+nom+"]:visible").fill(v);
  await page.locator("[name=precedente_location]:visible").selectOption("premiere");
  const fixation=page.locator("[name=fixation_loyer]");
  if (!await fixation.isVisible()) await fixation.locator("xpath=ancestor::details/summary").click();
  await fixation.selectOption("libre");
  await page.locator("[name=revision_irl]:visible").selectOption("false");
  await continuer(); await expect(page.getByText("Étape 5 sur 7",{exact:true})).toBeVisible();

  await page.goto(lot+"?parcours=1&etape=diagnostics");
  for (const [nom,type] of [[/performance énergétique|DPE/i,"dpe"],[/état des risques|ERP/i,"erp"]] as const) {
    const ligne=page.locator("li:visible").filter({has:page.getByRole("button",{name:"Ajouter le fichier",exact:true})}).filter({hasText:nom}).last();
    await ligne.getByRole("button",{name:"Ajouter le fichier"}).click();
    const form=page.locator("form:visible").filter({has:page.locator("input[type=file]")});
    const piece=await context.newPage();
    await piece.setContent("<h1>Rapport "+type+"</h1><p>Résidence des Acacias. Spécimen de démonstration sans valeur contractuelle.</p>");
    await form.locator("input[type=file]").setInputFiles({name:type+".pdf",mimeType:"application/pdf",buffer:await piece.pdf()});
    await piece.close();
    await form.locator("[name=date_realisation]").fill(debut);
    if (type==="dpe") await form.locator("[name=classe_dpe]").selectOption("C");
    await form.getByRole("button",{name:"Déposer",exact:true}).click();await expect(form).toBeHidden();
  }
  await page.goto(lot);
  await page.locator("summary").filter({hasText:"Gérer le statut du lot"}).click();
  await page.getByRole("button",{name:"Mettre en location",exact:true}).click();
  await expect(page.getByText(/Lot passé en « Disponible »/)).toBeVisible();
  await page.goto(bail); await etape(page,"07");
  const depot=page.locator("#bail-signe");
  const papier=await context.newPage();
  await papier.setContent("<h1>Contrat de location</h1><p>Élise Morel et Sam Rivière — 9 rue des Acacias. Spécimen sans valeur contractuelle.</p>");
  await depot.locator("#depot-bail-signe").setInputFiles({name:"Contrat-Acacias.pdf",mimeType:"application/pdf",buffer:await papier.pdf()});
  await papier.close();
  await depot.getByRole("button",{name:"Déposer le bail signé"}).click();
  await expect(page.getByText("Actif",{exact:true}).first()).toBeVisible();
  await page.goto(bail+"#loyers");
  await page.getByRole("button",{name:"Générer l'échéancier",exact:true}).click();
  await expect(page.locator("#loyers")).toContainText("1 terme appelé");
  await page.goto(espace+"/loyers");
  await page.locator("summary").filter({hasText:/Gérer les/}).click();
  await page.getByRole("button",{name:/^Encaisser 640/}).click();
  const lien=page.locator('a[href^="/quittance/"]:visible').first();
  const [document]=await Promise.all([context.waitForEvent("page"), lien.click()]);
  const cadre=document.frameLocator("iframe").last().locator("body");
  await expect(cadre).toContainText("640,00");
  for (const mention of ["Morel","Rivière","Résidence des Acacias","600,00","40,00",bail.split("/").at(-1)!.slice(0,8).toUpperCase()]) await expect(cadre).toContainText(mention);
  await expect(document.getByRole("button",{name:/Imprimer ou enregistrer en PDF/})).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
  await document.screenshot({path:info.outputPath("quittance-acacias.png"),fullPage:true});
  const impression=await context.newPage();
  await impression.setContent(await cadre.locator("..").evaluate(e=>e.outerHTML));
  const pdf=await impression.pdf({path:info.outputPath("quittance-acacias.pdf"),format:"A4"});
  expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
});
