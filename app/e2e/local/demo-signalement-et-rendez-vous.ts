import { expect, type Browser, type Page } from "@playwright/test";
import type { Client } from "pg";
import { connecterVers, sansSyntheseAlertes } from "../aides";
import { baseEspace } from "../../src/lib/racine-espace";
import { imageFuite } from "./demo-image-fuite";
import { baseApiFictive } from "./base-api-fictive";

// Les trois rôles jouent les gestes dans des sessions séparées sur le banc.
type EtapesDemo = {
  signalement: (page: Page) => Promise<void>;
  alerte: (page: Page, incident: string) => Promise<void>;
  devis: (page: Page) => Promise<void>;
  creneaux: (page: Page) => Promise<void>;
  rendezVous: (page: Page) => Promise<void>;
};
export async function jouerLeSignalementEtLeRendezVous(db: Client, browser: Browser, artisan: Page, organisation: string, artisanId: string, loc: {email:string;mot:string;description:string}, demo: EtapesDemo) {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const locataire = await browser.newContext({storageState:{cookies:[],origins:[]}, viewport:artisan.viewportSize()});
  try {
    const page = await locataire.newPage();
    page.setDefaultNavigationTimeout(45_000);
    artisan.setDefaultNavigationTimeout(45_000);
    await sansSyntheseAlertes(page);
    await connecterVers(page,loc.email,loc.mot,`/locataire/${organisation}/incident`);
    await expect(page.getByRole("button",{name:"Envoyer le signalement",exact:true})).toBeEnabled();
    const description = loc.description;
    await page.locator("#categorie").selectOption("plomberie_joint");
    await page.locator("textarea").first().fill(description);
    await page.locator("#photos").setInputFiles({
      name: "fuite-sous-evier.png", mimeType: "image/png", buffer: await imageFuite(page, description.slice(-8)),
    });
    await expect(page.getByText(/1 photo jointe/)).toBeVisible();
    await demo.signalement(page);
    await page.getByRole("button",{name:"Envoyer le signalement"}).click();
    await expect(page.getByText(/^Signalement envoyé/)).toBeVisible();
    const {rows:[incident]} = await db.query("select id from incidents where organization_id=$1 and description=$2",[organisation,description]);
    await expect.poll(async () => (await db.query(`select d.mime_type from document_liens l
      join documents d on d.id=l.document_id and d.organization_id=l.organization_id
      where l.organization_id=$1 and l.entite='incident' and l.entite_id=$2 and d.type='photo_incident'`,
    [organisation, incident.id])).rows.map(ligne => ligne.mime_type)).toEqual([expect.stringMatching(/^image\/(png|jpeg)$/)]);
    const racine = baseEspace(organisation, true);
    const responsable=await browser.newContext({storageState:"e2e/.auth/proprietaire.json", viewport:artisan.viewportSize()});
    try {
      const gestion=await responsable.newPage();
      gestion.setDefaultNavigationTimeout(45_000);
      await sansSyntheseAlertes(gestion);
      await demo.alerte(gestion, incident.id);
      const prise=gestion.locator("form").filter({has:gestion.locator("input[name=imputation][value=proprietaire]")});
      await prise.locator("input[value=proprietaire]").check();
      await prise.locator("textarea[name=justification]").fill("Vétusté du joint sur le réseau du logement.");
      await prise.getByRole("button",{name:"Confirmer la prise en charge"}).click();
      await expect.poll(async ()=>(await db.query("select imputation from incidents where id=$1",[incident.id])).rows[0].imputation).toBe("proprietaire");
      await gestion.goto(`${racine}/incidents/${incident.id}#intervention`, { waitUntil: "domcontentloaded" });
      const recherche=gestion.locator("form").filter({has:gestion.locator("select[name=metier]")});
      // Les champs serveur précèdent parfois la prise en charge de React.
      await expect(recherche.locator("select[name=metier]")).toBeVisible();
      await expect(recherche.locator('button[title="La page finit de se charger."]')).toHaveCount(0);
      await recherche.locator("select[name=metier]").selectOption("plomberie");
      const nature=recherche.locator("select[name=nature]");

      await nature.selectOption("entretien_courant");
      await recherche.getByText("Options du devis", {exact:true}).click();
      await recherche.getByLabel("Demander un seul devis", {exact:false}).check();
      await recherche.getByRole("button",{name:/Ouvrir avec mon carnet|Chercher un artisan/}).click();
      await gestion.getByRole("link", {name:"Devis et facture", exact:true}).click();
      await gestion.getByRole("button",{name:/Demander un devis/}).first().click();
      const demande=async ()=>(await db.query("select s.id from incident_sollicitations s join incident_consultations c on c.id=s.consultation_id where c.incident_id=$1 and s.artisan_id=$2",[incident.id,artisanId])).rows[0]?.id;
      await expect.poll(demande).toBeTruthy();
      const devis = "/artisan/devis/" + await demande();
      await artisan.goto(devis, { waitUntil: "domcontentloaded" });
      // Le chargement peut encore montrer le squelette après goto. L’absence
      // du lien d’adresse n’est significative qu’une fois le formulaire affiché.
      const diagnostic = artisan.getByRole("textbox", {name:"Votre diagnostic", exact:true});
      await expect(diagnostic).toBeVisible();
      const completer = artisan.getByRole("link", {name:"Compléter mon adresse"});
      if (await completer.isVisible()) {
        await completer.click();
        await artisan.getByRole("textbox", {name:"Adresse complète de l’entreprise",exact:true}).fill("8 rue des Tilleuls, 75012 Paris");
        await artisan.getByRole("button", {name:"Enregistrer mes informations de devis",exact:true}).click();
        await expect(artisan.getByText(/Informations enregistrées pour vos nouveaux devis/)).toBeVisible();
        await artisan.goto(devis, { waitUntil: "domcontentloaded" });
        await expect(diagnostic).toBeVisible();
        await expect(completer).toHaveCount(0);
      }
      await artisan.getByLabel("Ligne 1 : prestation",{exact:true}).fill("Réparation du joint de l’évier");
      await artisan.getByLabel("Ligne 1 : prix unitaire HT",{exact:true}).fill("100");
      await artisan.getByLabel("Ligne 1 : TVA",{exact:true}).selectOption("0");
      async function etape(n:number) {
        const menu=artisan.getByLabel("Aller à une étape",{exact:true});
        if (await menu.isVisible()) await menu.selectOption(String(n-1));
        else await artisan.getByRole("button",{name:new RegExp("^Étape "+String(n).padStart(2,"0")+" ")}).click();
        // La navigation place le focus au prochain rendu. Attendre ce geste
        // évite qu’il interrompe la saisie immédiate du navigateur automatisé.
        await expect(artisan.locator("[data-corps-etapes] > h2")).toBeFocused();
      }
      await diagnostic.fill("Joint usé");
      await etape(2);
      for(const [champ,valeur] of Object.entries({delai:"Sous sept jours",duree:"Une heure",valide_jusqu_au:new Date(Date.now()+30*86400000).toISOString().slice(0,10)})) {
        const saisie = artisan.locator("[name="+champ+"]:visible");
        await saisie.fill(valeur);
        await expect(saisie).toHaveValue(valeur);
      }
      await etape(3);
      await artisan.locator("input[name=validation_artisan]").check();
      await artisan.getByRole("button",{name:"Valider et générer le PDF",exact:true}).click();
      await expect(artisan.getByText(/^PDF validé et enregistré\. Passez/)).toBeVisible();
      await etape(4);
      await artisan.getByRole("button",{name:"Transmettre le devis et prévenir le demandeur",exact:true}).click();
      await expect(artisan).toHaveURL(/envoye=1/);
      await gestion.reload();
      await gestion.getByRole("link", {name:"Devis et facture",exact:true}).click();
      const telecharger = gestion.getByRole("link", {name:"Télécharger le détail du devis (PDF)",exact:true});
      await expect(telecharger).toBeVisible();
      await demo.devis(gestion);
      await gestion.getByRole("button",{name:/Retenir ce devis/}).click();
      await expect.poll(async ()=>(await db.query("select count(*)::int n from incident_interventions where organization_id=$1 and incident_id=$2 and devis_id is not null",[organisation,incident.id])).rows[0].n).toBe(1);
    } finally { await responsable.close(); }
    const {rows:[intervention]}=await db.query("select id from incident_interventions where organization_id=$1 and incident_id=$2",[organisation,incident.id]);
    const mission = intervention.id as string;
    await artisan.goto(`/artisan/missions/${mission}`, { waitUntil: "domcontentloaded" });
    await artisan.getByRole("button",{name:"Accepter la mission"}).click();
    await expect(artisan).toHaveURL(new RegExp(mission+"/creneaux"));
    // Plusieurs exécutions peuvent partager le calendrier de cet artisan.
    const {rows:jours}=await db.query("select to_char(j,'YYYY-MM-DD') jour from generate_series(current_date+2,current_date+55,'1 day') j where not public.plage_artisan_occupee($1,j,j+interval '1 day',null,null) order by j limit 3",[artisanId]);
    expect(jours).toHaveLength(3);
    for (const [i,{jour}] of jours.entries()) {
      const proposition=artisan.locator("fieldset").nth(i);
      await proposition.getByLabel("Date",{exact:true}).fill(jour);
      await proposition.getByRole("button",{name:"Matin 09:00 – 11:00",exact:true}).click();
    }
    await demo.creneaux(artisan);
    await artisan.getByRole("button",{name:"Envoyer les créneaux"}).click();
    await expect.poll(async()=>(await db.query("select count(*)::int n from intervention_creneaux where intervention_id=$1 and statut='propose'",[mission])).rows[0].n).toBe(3);
    await page.goto(`/locataire/${organisation}/demandes`, { waitUntil: "domcontentloaded" });
    const dossier=page.locator("#demande-"+incident.id);
    await dossier.locator("input[type=radio] + label").first().click();
    await dossier.getByRole("button",{name:"Confirmer ce rendez-vous"}).click();
    await expect.poll(async()=>(await db.query("select statut from incident_interventions where id=$1",[mission])).rows[0].statut).toBe("planifiee");
    await expect(page.getByRole("region",{name:"Rendez-vous confirmé"})).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(dossier.getByRole("radio")).toHaveCount(0);
    expect((await db.query("select count(*)::int n from intervention_creneaux where intervention_id=$1 and statut='retenu'",[mission])).rows[0].n).toBe(1);
    await demo.rendezVous(page);
    return { incidentId: String(incident.id), mission };
  } finally { await locataire.close(); }
}
