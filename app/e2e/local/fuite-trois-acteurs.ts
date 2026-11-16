import { expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { sansSyntheseAlertes } from "../aides";
import { baseApiFictive } from "./base-api-fictive";

// Les décisions de consultation utilisent les mêmes RPC que le portail, sous le
// rôle de chaque participant. Les étapes logement, rendez-vous et travaux sont
// parcourues dans le navigateur. Toutes les données appartiennent au banc local.
export async function preparerEtPlanifierFuite(db: Client, browser: Browser, artisan: Page, organisation: string, artisanId: string) {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const locataire = await browser.newContext({storageState:"e2e/.auth/locataire.json", viewport:artisan.viewportSize()});
  try {
    const page = await locataire.newPage();
    await sansSyntheseAlertes(page);
    await page.goto(`/locataire/${organisation}/incident`);
    await page.waitForLoadState("networkidle");
    const description = "Essai fuite sous évier " + randomUUID();
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
    const role = async (email:string) => {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) from auth.users where email=$1",[email]);
      await db.query("set local role authenticated");
    };
    await db.query("begin");
    let mission: string;
    try {
      await role("admin.alpha@example.com");
      await db.query("select qualifier_incident($1,$2,'proprietaire','Vétusté du joint sur le réseau')",[organisation,incident.id]);
      const {rows:[c]}=await db.query("select ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) id",[organisation,incident.id]);
      const {rows:[s]}=await db.query("select solliciter_artisan($1,$2,$3) id",[organisation,c.id,artisanId]);
      await role("artisan.alpha@example.com");
      const lignes=JSON.stringify([{libelle:"Travaux de plomberie",quantite:1,prix_unitaire_ht_cents:10000,tva_bps:0}]);
      const {rows:[d]}=await db.query("select deposer_devis_structure($1,$2::jsonb,'Joint usé','Remplacer le joint','Sous sept jours','Une heure',null,null,current_date+30) id",[s.id,lignes]);
      await role("admin.alpha@example.com");
      const {rows:[m]}=await db.query("select retenir_devis($1,$2) id",[organisation,d.id]);
      mission=m.id;
      await db.query("commit");
    } catch (err) { await db.query("rollback"); throw err; }
    await artisan.goto(`/artisan/missions/${mission}`);
    await artisan.getByRole("button",{name:"Accepter la mission"}).click();
    await expect(artisan).toHaveURL(new RegExp(mission+"/creneaux"));
    // Plusieurs exécutions peuvent partager le calendrier de cet artisan.
    const {rows:jours}=await db.query("select to_char(j,'YYYY-MM-DD') jour from generate_series(current_date+2,current_date+55,'1 day') j where not public.plage_artisan_occupee($1,j,j+interval '1 day',null,null) order by j limit 3",[artisanId]);
    expect(jours).toHaveLength(3);
    for (const [i,{jour}] of jours.entries()) {
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
    await page.reload();
    await expect(dossier.getByRole("radio")).toHaveCount(0);
    expect((await db.query("select count(*)::int n from intervention_creneaux where intervention_id=$1 and statut='retenu'",[mission])).rows[0].n).toBe(1);
    return {incidentId:String(incident.id), mission};
  } finally { await locataire.close(); }
}
