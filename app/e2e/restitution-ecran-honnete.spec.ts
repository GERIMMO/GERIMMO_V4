import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// L'ÉCRAN DE RESTITUTION DU DÉPÔT DIT CE QUI EST (audit palier 1 du 22/11/2026, P1-09 et P1-12, parties sans texte
// officiel).
//
// Deux phrases de l'écran n'étaient pas vraies : la confirmation de « Finaliser » promettait un « décompte rectificatif
// envoyé au locataire » qu'aucun geste ne produit, et les durées de vie proposées pouvaient passer pour une grille de
// vétusté. Ici, dans le navigateur du propriétaire bailleur, sur un bail fictif terminé dont la restitution est en
// cours : l'écran dit que les durées sont indicatives ; la confirmation dit qu'il n'y a pas de décompte rectificatif ;
// on annule, rien n'est figé. Logement, bail et restitution fictifs, retirés à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("restitution du dépôt : durées de vie dites indicatives, pas de décompte rectificatif promis, rien n'est figé si l'on annule", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const bien = randomUUID(), lot = randomUUID(), personne = randomUUID(), bail = randomUUID(), restitution = randomUUID(), marque = bien.slice(0, 8);
  try {
    const { rows: [d] } = await db.query(`select (public.aujourdhui_paris() - 400)::text debut, (public.aujourdhui_paris() - 10)::text fin`);
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue ESSAI restitution','75001','Paris')", [bien, ORG, `ESSAI Restitution ${marque}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible')", [lot, ORG, bien, `ESSAI Lot ${marque}`]);
    await db.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')", [personne, ORG, `ESSAI ${marque}`]);
    // Bail terminé, sans dépôt encaissé ni impayé : la restitution porte les mêmes montants que la réalité du bail.
    await db.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,date_fin,date_sortie_reelle,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
      values($1,$2,$3,'nu','termine',$4,$5,$5,600,40,0,5,$6,'provision','echoir')`, [bail, ORG, lot, d.debut, d.fin, personne]);
    await db.query("insert into restitutions(id,organization_id,bail_id,date_remise_cles,delai_mois,depot,impayes) values($1,$2,$3,$4,2,0,0)", [restitution, ORG, bail, d.fin]);
    await db.query("commit");
    const etat = async () => (await db.query("select statut, solde from restitutions where id=$1", [restitution])).rows[0];

    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/baux/${bail}#restitution`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const carte = page.locator("#restitution");
    // La restitution vit dans la rubrique du départ : on l'ouvre si l'ancre ne l'a pas fait.
    await expect(async () => {
      if (!(await carte.isVisible())) {
        const depart = page.locator("#sortie-bail").getByRole("button").first();
        if (await depart.count()) await depart.click({ timeout: 2_000 });
      }
      await expect(carte).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(carte).toContainText("Restitution du dépôt de garantie");

    // ── 1. Les durées de vie proposées sont dites pour ce qu'elles sont.
    const indicatif = carte.locator("[data-bareme-indicatif]");
    await expect(indicatif).toBeVisible();
    await expect(indicatif).toHaveText("Les durées de vie proposées dans la liste sont indicatives : c'est vous qui les retenez. Elles ne viennent d'aucune grille de vétusté convenue avec le locataire.");
    await expect(carte).not.toContainText(/réglementaire/i);

    // ── 2. La confirmation de « Finaliser » ne promet plus de décompte rectificatif.
    await carte.getByRole("button", { name: "Finaliser le décompte", exact: true }).click();
    const modale = page.getByRole("dialog");
    await expect(modale).toBeVisible();
    const fige = modale.locator("[data-decompte-fige]");
    await expect(fige).toContainText("Une fois finalisé, le décompte est figé");
    await expect(fige).toContainText("Gerimmo ne produit pas de décompte rectificatif");
    await expect(fige).toContainText("Une correction ultérieure se ferait par un écrit au locataire, hors de Gerimmo.");
    await expect(modale).not.toContainText("passera par un décompte rectificatif");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await modale.screenshot({ path: info.outputPath("restitution-confirmation.png") });

    // ── 3. On annule : rien n'est figé.
    await modale.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(modale).toHaveCount(0);
    expect(await etat()).toEqual({ statut: "en_cours", solde: null });
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from retenues where restitution_id=$1", [restitution]);
      await db.query("delete from restitutions where id=$1", [restitution]);
      await db.query("delete from alerts where organization_id=$1 and details->>'bail_id'=$2", [ORG, bail]);
      await db.query("delete from baux where id=$1", [bail]);
      await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("delete from persons where id=$1", [personne]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
