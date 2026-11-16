import { expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { connecterVers, sansSyntheseAlertes } from "../aides";
import { baseApiFictive } from "./base-api-fictive";

// Les décisions sont prises dans trois sessions séparées. Les lectures SQL
// vérifient le résultat sur les données synthétiques, sans créer de mission.
export async function preparerEtPlanifierFuite(db: Client, browser: Browser, artisan: Page, organisation: string, artisanId: string, loc: {email:string;mot:string;description?:string}) {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const locataire = await browser.newContext({storageState:{cookies:[],origins:[]}, viewport:artisan.viewportSize()});
  try {
    const page = await locataire.newPage();
    page.setDefaultTimeout(12_000);
    artisan.setDefaultTimeout(12_000);
    await sansSyntheseAlertes(page);
    await connecterVers(page,loc.email,loc.mot,`/locataire/${organisation}/incident`);
    await page.waitForLoadState("networkidle");
    const description = loc.description ?? "Fuite sous évier · dossier " + randomUUID().slice(0,8);
    await page.locator("#categorie").selectOption("plomberie_joint");
    await page.locator("textarea").first().fill(description);
    const image = await page.evaluate(texte => {
      const canvas = document.createElement("canvas");
      canvas.width=440; canvas.height=120;
      canvas.getContext("2d")!.fillText(texte, 10, 60);
      return canvas.toDataURL("image/png").split(",")[1];
    }, description);
    await page.locator("#photos").setInputFiles({name:"fuite.png",mimeType:"image/png",buffer:Buffer.from(image,"base64")});
    await expect(page.getByText(/1 photo jointe/)).toBeVisible();
    await page.getByRole("button",{name:"Envoyer le signalement"}).click();
    await expect(page.getByText(/^Signalement envoyé/)).toBeVisible();
    const {rows:[incident]} = await db.query("select id from incidents where organization_id=$1 and description=$2",[organisation,description]);
    const responsable=await browser.newContext({storageState:"e2e/.auth/proprietaire.json", viewport:artisan.viewportSize()});
    try {
      const gestion=await responsable.newPage();
      gestion.setDefaultTimeout(12_000);
      await sansSyntheseAlertes(gestion);
      await gestion.goto(`/espace/${organisation}/incidents/${incident.id}#qualification`);
      const prise=gestion.locator("form").filter({has:gestion.locator("input[name=imputation][value=proprietaire]")});
      await prise.locator("input[value=proprietaire]").check();
      await prise.locator("textarea[name=justification]").fill("Vétusté du joint sur le réseau du logement.");
      await prise.getByRole("button",{name:"Confirmer la prise en charge"}).click();
      await expect.poll(async ()=>(await db.query("select imputation from incidents where id=$1",[incident.id])).rows[0].imputation).toBe("proprietaire");
      await gestion.goto(`/espace/${organisation}/incidents/${incident.id}#intervention`);
      const recherche=gestion.locator("form").filter({has:gestion.locator("select[name=metier]")});
      await recherche.locator("select[name=metier]").selectOption("plomberie");
      const nature=recherche.locator("select[name=nature]");

      await nature.selectOption("entretien_courant");
      await recherche.getByText("Options du devis", {exact:true}).click();
      await recherche.getByLabel("Demander un seul devis", {exact:false}).check();
      await recherche.getByRole("button",{name:/Ouvrir avec mon carnet|Chercher un artisan/}).click();
      await gestion.getByRole("button",{name:/Demander un devis/}).first().click();
      const demande=async ()=>(await db.query("select s.id from incident_sollicitations s join incident_consultations c on c.id=s.consultation_id where c.incident_id=$1 and s.artisan_id=$2",[incident.id,artisanId])).rows[0]?.id;
      await expect.poll(demande).toBeTruthy();
      const devis = "/artisan/devis/" + await demande();
      await artisan.goto(devis);
      const completer = artisan.getByRole("link", {name:"Compléter mon adresse"});
      if (await completer.isVisible()) {
        await completer.click();
        await artisan.getByRole("textbox", {name:"Adresse complète de l’entreprise",exact:true}).fill("8 rue des Tilleuls, 75012 Paris");
        await artisan.getByRole("button", {name:"Enregistrer mes informations de devis",exact:true}).click();
        await expect(artisan.getByText(/Informations enregistrées pour vos nouveaux devis/)).toBeVisible();
        await artisan.goto(devis);
      }
      await artisan.getByLabel("Ligne 1 : prestation",{exact:true}).fill("Réparation du joint de l’évier");
      await artisan.getByLabel("Ligne 1 : prix unitaire HT",{exact:true}).fill("100");
      await artisan.getByLabel("Ligne 1 : TVA",{exact:true}).selectOption("0");
      async function etape(n:number) {
        const menu=artisan.getByLabel("Aller à une étape",{exact:true});
        if (await menu.isVisible()) await menu.selectOption(String(n-1));
        else await artisan.getByRole("button",{name:new RegExp("^Étape "+String(n).padStart(2,"0")+" ")}).click();
      }
      await artisan.getByRole("textbox",{name:"Votre diagnostic",exact:true}).fill("Joint usé");
      await etape(2);
      for(const [champ,valeur] of Object.entries({delai:"Sous sept jours",duree:"Une heure",valide_jusqu_au:new Date(Date.now()+30*86400000).toISOString().slice(0,10)})) {
        await artisan.locator("[name="+champ+"]:visible").fill(valeur);
      }
      await etape(3);
      await artisan.locator("input[name=validation_artisan]").check();
      await artisan.getByRole("button",{name:"Valider et générer le PDF",exact:true}).click();
      await expect(artisan.getByText(/^PDF validé et enregistré\. Passez/)).toBeVisible();
      await etape(4);
      await artisan.getByRole("button",{name:"Envoyer le devis par e-mail",exact:true}).click();
      await expect(artisan).toHaveURL(/envoye=1/);
      await gestion.reload();
      await gestion.getByRole("button",{name:/Retenir ce devis/}).click();
      await expect.poll(async ()=>(await db.query("select count(*)::int n from incident_interventions where organization_id=$1 and incident_id=$2 and devis_id is not null",[organisation,incident.id])).rows[0].n).toBe(1);
    } finally { await responsable.close(); }
    const {rows:[intervention]}=await db.query("select id from incident_interventions where organization_id=$1 and incident_id=$2",[organisation,incident.id]);
    const mission = intervention.id as string;
    await artisan.goto(`/artisan/missions/${mission}`);
    await artisan.getByRole("button",{name:"Accepter la mission"}).click();
    await expect(artisan).toHaveURL(new RegExp(mission+"/creneaux"));
    // Plusieurs exécutions peuvent partager le calendrier de cet artisan.
    const {rows:jours}=await db.query("select to_char(j,'YYYY-MM-DD') jour from generate_series(current_date+2,current_date+55,'1 day') j where not public.plage_artisan_occupee($1,j,j+interval '1 day',null,null) order by j limit 6",[artisanId]);
    expect(jours).toHaveLength(6);
    for (const [i,{jour}] of jours.slice(0,3).entries()) {
      const proposition=artisan.locator("fieldset").nth(i);
      await proposition.getByLabel("Jour",{exact:true}).fill(jour);
      await proposition.getByRole("button",{name:"Matin",exact:true}).click();
    }
    await artisan.getByRole("button",{name:"Envoyer les créneaux"}).click();
    await expect.poll(async()=>(await db.query("select count(*)::int n from intervention_creneaux where intervention_id=$1 and statut='propose'",[mission])).rows[0].n).toBe(3);
    await page.goto(`/locataire/${organisation}/demandes`);
    const dossier=page.locator("#demande-"+incident.id);
    await dossier.locator("input[type=radio] + label").first().click({timeout:12000});
    await dossier.getByRole("button",{name:"Confirmer ce rendez-vous"}).click();
    await expect.poll(async()=>(await db.query("select statut from incident_interventions where id=$1",[mission])).rows[0].statut).toBe("planifiee");
    await expect(page.getByRole("region",{name:"Rendez-vous confirmé"})).toBeVisible();
    await page.reload();
    await expect(dossier.getByRole("radio")).toHaveCount(0);
    expect((await db.query("select count(*)::int n from intervention_creneaux where intervention_id=$1 and statut='retenu'",[mission])).rows[0].n).toBe(1);
    const rendezVous=async ()=>(await db.query("select debut_prevu from incident_interventions where id=$1",[mission])).rows[0].debut_prevu.toISOString();
    const premier=await rendezVous();
    await dossier.getByRole("button",{name:"Je ne peux plus être là",exact:true}).click();
    await dossier.getByRole("button",{name:"Demander un report",exact:true}).click();
    await dossier.locator("select[name=motif]").selectOption("travail");
    for(const [i,{jour}] of jours.slice(3).entries()) await dossier.locator(`[name="date-${i}"]`).fill(jour);
    await dossier.getByRole("button",{name:"Envoyer à l'artisan",exact:true}).click();
    await expect.poll(async()=>(await db.query("select statut from intervention_demandes_rdv where intervention_id=$1 and type='report'",[mission])).rows[0]?.statut).toBe("en_attente");
    expect(await rendezVous()).toBe(premier);
    await artisan.goto("/artisan/agenda");
    await expect(artisan.getByText("Report demandé · rendez-vous maintenu",{exact:true}).first()).toBeVisible();
    await artisan.goto("/artisan/missions/"+mission);
    await artisan.getByRole("button",{name:"Je retiens cette date",exact:true}).first().click();
    await expect.poll(rendezVous).not.toBe(premier);
    expect((await db.query("select statut from intervention_demandes_rdv where intervention_id=$1 and type='report'",[mission])).rows[0].statut).toBe("acceptee");
    return {incidentId:String(incident.id), mission,sessionLocataire:await locataire.storageState()};
  } finally { await locataire.close(); }
}
