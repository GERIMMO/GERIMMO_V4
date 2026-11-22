import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// L'AVENANT SIGNÉ S'ENREGISTRE, S'APPLIQUE LE MOIS VENU, ET PEUT S'ANNULER TANT QU'IL ATTEND (audit palier 1 du
// 22/11/2026, P1-14).
//
// Le défaut : l'avenant n'était qu'un PDF à faire signer. Rien n'était enregistré, et le loyer appelé chaque mois
// restait celui d'avant. Ici, dans le navigateur du propriétaire bailleur : il enregistre l'avenant signé (pièce
// jointe), qui attend sa date d'effet sans rien changer ; le mois venu, le loyer appelé est le nouveau et le bail est
// à jour ; un second avenant est enregistré puis annulé, avec son motif.
//
// Bail, logement et locataire fictifs, créés pour ce parcours dans l'espace du propriétaire fictif ; retirés à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("avenant au bail : enregistré avec sa pièce, appliqué au loyer du mois venu, puis un second annulé", async ({ page }, info) => {
  test.setTimeout(180_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const bien = randomUUID(), lot = randomUUID(), personne = randomUUID(), bail = randomUUID();
  const nom = `ESSAI avenant ${lot.slice(0, 8)}`;
  const leBail = async () => (await db.query("select loyer_hc::float8 loyer, charges::float8 charges from baux where id=$1", [bail])).rows[0];
  const avenants = async () => (await db.query(`select objet, date_effet::text, nouveau_loyer_hc::float8 loyer, nouvelles_charges::float8 charges,
      applique_le is not null applique, annule_le is not null annule, annulation_motif, document_id from avenants_bail where bail_id=$1 order by enregistre_le`, [bail])).rows;
  try {
    // ── Décor : un bail en cours depuis le mois dernier (700 € + 50 €), dont les loyers sont appelés jusqu'à ce mois.
    const { rows: [d] } = await db.query(`select public.aujourdhui_paris()::text aujourdhui,
        (date_trunc('month', public.aujourdhui_paris()) - interval '1 month')::date::text debut,
        (date_trunc('month', public.aujourdhui_paris()) + interval '1 month')::date::text suivant,
        (date_trunc('month', public.aujourdhui_paris()) + interval '2 months')::date::text surlendemain`);
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue ESSAI avenant','75001','Paris')", [bien, ORG, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')", [personne, ORG, nom]);
    await db.query("insert into baux(id,organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,$3,'nu','actif',700,50,$4,5,$5)", [bail, ORG, lot, d.debut, personne]);
    await db.query("select public.generer_appels_loyer_interne($1)", [bail]);
    await db.query("commit");
    expect((await db.query("select count(*)::int n from appels_loyer where bail_id=$1", [bail])).rows[0].n).toBe(2);
    const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    const premierDu = (iso: string) => `1er ${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

    // ── Le propriétaire ouvre la rubrique « Avenant au bail » de son bail.
    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/baux/${bail}#avenant`);
    const rubrique = page.locator("#avenant");
    await expect(rubrique.getByRole("heading", { name: "2. Enregistrer l’avenant signé" })).toBeVisible();
    const formulaire = rubrique.locator("[data-enregistrer-avenant]");
    await expect(formulaire).toBeVisible();
    // La première date proposée est le 1er du mois prochain : le loyer de ce mois est déjà appelé.
    await expect(formulaire.getByLabel("S’applique à partir du")).toHaveValue(d.suivant);
    await expect(formulaire.getByLabel("Loyer hors charges après l’avenant (€)")).toHaveValue("700");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await rubrique.screenshot({ path: info.outputPath("avenant-formulaire.png") });

    // ── Sans la pièce signée, rien ne s'enregistre.
    await formulaire.getByLabel("Objet de l’avenant").fill("Baisse du loyer convenue avec le locataire");
    await formulaire.getByLabel("Signé le").fill(d.aujourdhui);
    await formulaire.getByLabel("Loyer hors charges après l’avenant (€)").fill("650");
    await formulaire.getByLabel("Provision pour charges après l’avenant (€)").fill("60");
    await formulaire.getByRole("button", { name: "Enregistrer l’avenant signé" }).click();
    expect(await avenants()).toEqual([]);

    // ── Avec la pièce : l'avenant est enregistré, et attend sa date d'effet sans rien changer.
    await formulaire.locator("input[type=file]").setInputFiles({ name: "avenant-signe-fictif.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await formulaire.getByRole("button", { name: "Enregistrer l’avenant signé" }).click();
    await expect(rubrique.getByRole("status")).toContainText(`Avenant enregistré. Il s’appliquera de lui-même au loyer du ${premierDu(d.suivant)} ; d’ici là, rien ne change.`);
    const attente = rubrique.locator("[data-avenant-en-attente]");
    await expect(attente).toBeVisible();
    await expect(attente).toContainText("Baisse du loyer convenue avec le locataire");
    await expect(attente).toContainText(/Loyer hors charges : 700,00\s€ → 650,00\s€/);
    await expect(attente).toContainText(/Provision pour charges : 50,00\s€ → 60,00\s€/);
    await expect(rubrique.locator("[data-enregistrer-avenant]")).toHaveCount(0);
    expect(await avenants()).toMatchObject([{ date_effet: d.suivant, loyer: 650, charges: 60, applique: false, annule: false }]);
    expect(await leBail()).toEqual({ loyer: 700, charges: 50 });
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await rubrique.screenshot({ path: info.outputPath("avenant-en-attente.png") });
    // La pièce signée s'ouvre depuis le dossier.
    const lienPiece = attente.getByRole("link", { name: "Consulter l’avenant signé" });
    const manifeste = await page.request.get(`${await lienPiece.getAttribute("href")}?apercu=integre`);
    expect(manifeste.status()).toBe(200);
    const lecture = await manifeste.json() as { url: string; mime: string };
    expect(lecture.mime).toBe("application/pdf");
    const octets = await page.request.get(lecture.url);
    expect(octets.status()).toBe(200);
    expect((await octets.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // ── Le mois suivant arrive : le loyer est appelé (comme le fera la tâche automatique, qui a lu l'ancien montant).
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance,prorata)
      values($1,$2,$3::date,700,50,750,$3::date + 4,false)`, [ORG, bail, d.suivant]);
    expect((await db.query("select loyer_hc::float8 loyer, charges::float8 charges, montant_du::float8 du from appels_loyer where bail_id=$1 and periode=$2", [bail, d.suivant])).rows[0])
      .toEqual({ loyer: 650, charges: 60, du: 710 });
    expect(await leBail()).toEqual({ loyer: 650, charges: 60 });
    // Les loyers déjà appelés n'ont pas bougé.
    expect((await db.query("select count(*)::int n from appels_loyer where bail_id=$1 and periode < $2 and (loyer_hc <> 700 or charges <> 50)", [bail, d.suivant])).rows[0].n).toBe(0);

    await page.goto(`/espace/${ORG}/baux/${bail}#avenant`);
    const historique = rubrique.locator("[data-avenants-enregistres]");
    await expect(historique.locator('[data-etat-avenant="applique"]')).toContainText("Appliqué au bail");
    await expect(rubrique.locator("[data-avenant-en-attente]")).toHaveCount(0);
    // Le formulaire revient, prérempli aux NOUVEAUX montants, pour le mois d'après.
    const second = rubrique.locator("[data-enregistrer-avenant]");
    await expect(second.getByLabel("Loyer hors charges après l’avenant (€)")).toHaveValue("650");
    await expect(second.getByLabel("S’applique à partir du")).toHaveValue(d.surlendemain);

    // ── Un second avenant, enregistré puis annulé avec son motif.
    await second.getByLabel("Objet de l’avenant").fill("Provision pour charges ramenée à 55 euros");
    await second.getByLabel("Signé le").fill(d.aujourdhui);
    await second.getByLabel("Provision pour charges après l’avenant (€)").fill("55");
    await second.locator("input[type=file]").setInputFiles({ name: "second-avenant-fictif.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await second.getByRole("button", { name: "Enregistrer l’avenant signé" }).click();
    await expect(rubrique.locator("[data-avenant-en-attente]")).toContainText("Provision pour charges ramenée à 55 euros");
    await rubrique.locator("[data-annuler-avenant] summary").click();
    await rubrique.getByLabel("Pourquoi l’annuler").fill("Erreur de saisie sur le montant.");
    await rubrique.getByRole("button", { name: "Annuler l’avenant" }).click();
    await expect(rubrique.getByRole("status")).toContainText("Avenant annulé : le loyer et les charges du bail restent ceux d’avant. Sa pièce reste au dossier.");
    await expect(historique.locator('[data-etat-avenant="annule"]')).toContainText("Erreur de saisie sur le montant.");
    await expect(rubrique.locator("[data-avenant-en-attente]")).toHaveCount(0);
    await expect(rubrique.locator("[data-enregistrer-avenant]")).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await rubrique.screenshot({ path: info.outputPath("avenant-historique.png") });

    expect(await avenants()).toMatchObject([
      { objet: "Baisse du loyer convenue avec le locataire", applique: true, annule: false },
      { objet: "Provision pour charges ramenée à 55 euros", applique: false, annule: true, annulation_motif: "Erreur de saisie sur le montant." },
    ]);
    expect(await leBail()).toEqual({ loyer: 650, charges: 60 });
    // Les deux pièces sont au dossier du bail, y compris celle de l'avenant annulé.
    expect((await db.query("select count(*)::int n from document_liens where entite='bail' and entite_id=$1", [bail])).rows[0].n).toBe(2);
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      const docs = (await db.query("select document_id from avenants_bail where bail_id=$1", [bail])).rows.map((r) => r.document_id as string);
      await db.query("delete from avenants_bail where bail_id=$1", [bail]);
      await db.query("delete from document_liens where document_id = any($1::uuid[])", [docs]);
      await db.query("delete from appels_loyer where bail_id=$1", [bail]);
      await db.query("delete from baux where id=$1", [bail]);
      await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("delete from persons where id=$1", [personne]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
