import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { locationIntervention } from "./location-intervention";
import { preparerEtPlanifierFuite } from "./fuite-trois-acteurs";

test.use({storageState:"e2e/.auth/artisan.json"});
test("démonstration · conserver un rendez-vous à venir et son report accepté",async({browser,page},info)=>{
  if(new URL(process.env.SUPALOCAL_DB!).pathname!=="/gerimmo_ci_demo_vente_api") throw new Error("Démonstration locale dédiée requise");
  const db=new Client({connectionString:process.env.SUPALOCAL_DB});
  await db.connect();
  try {
    const {rows:[artisan]}=await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    const lot=await locationIntervention(db,artisan.id,true);
    const description="Une fuite apparaît au niveau du flexible de la douche.";
    const {rows}=await db.query("select i.id,m.id mission,m.statut from incidents i left join incident_interventions m on m.incident_id=i.id where i.lot_id=$1 and i.description=$2",[lot.lot_id,description]);
    if(rows.length===0) {
      await preparerEtPlanifierFuite(db,browser,page,lot.organization_id,artisan.id,{...lot,description});
    } else {
      expect(rows).toHaveLength(1);
      expect(rows[0].statut).toBe("planifiee");
    }
    const {rows:[preuve]}=await db.query("select i.numero,m.debut_prevu from incidents i join incident_interventions m on m.incident_id=i.id join intervention_demandes_rdv r on r.intervention_id=m.id where i.lot_id=$1 and i.description=$2 and m.statut='planifiee' and r.statut='acceptee'",[lot.lot_id,description]);
    expect(preuve?.debut_prevu).toBeTruthy();
    await page.goto("/artisan/agenda");
    await expect(page.getByText(preuve.numero,{exact:false}).first()).toBeVisible();
    await page.screenshot({path:info.outputPath("agenda-artisan.png")});
  } finally {await db.end();}
});
