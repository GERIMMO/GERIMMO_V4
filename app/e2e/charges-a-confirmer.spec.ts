import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// CHARGES DE COPROPRIÉTÉ : RIEN N'EST « RÉCUPÉRABLE » SANS LA CONFIRMATION DU GESTIONNAIRE (audit palier 1 du
// 22/11/2026, P0-03, relevés C1 et C2).
//
// Le défaut : un poste dont l'intitulé contenait un mot connu naissait « récupérable » et entrait dans la
// régularisation du locataire sans que personne ne le confirme. Ici, dans le navigateur du propriétaire bailleur, sur
// un logement fictif en copropriété :
//   1. un poste saisi naît « à qualifier » ; la suggestion se lit à côté, elle ne s'applique pas seule ;
//   2. un intitulé de travaux ne reçoit aucune suggestion ;
//   3. la validation est refusée tant qu'un poste reste à qualifier ; elle passe une fois chaque poste choisi ;
//   4. un poste « récupérable » proposé avant ce lot, jamais confirmé, bloque lui aussi la validation, et l'écran dit
//      quoi faire ; le confirmer d'un geste la débloque.
// Immeuble, logement et appels fictifs, retirés à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("appel de charges : chaque poste naît « à qualifier », la suggestion se confirme, rien ne passe sans choix", async ({ page }, info) => {
  test.setTimeout(150_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const bien = randomUUID(), lot = randomUUID(), appelNeuf = randomUUID(), appelAncien = randomUUID(), marque = bien.slice(0, 8);
  const postes = async (appel: string) => (await db.query(
    "select libelle, montant::float8 montant, nature, propose from appel_charges_postes where appel_id=$1 order by created_at, id", [appel])).rows;
  const statut = async (appel: string) => (await db.query("select statut from appels_charges where id=$1", [appel])).rows[0].statut as string;
  try {
    const { rows: [{ annee }] } = await db.query("select extract(year from public.aujourdhui_paris())::int annee");
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city,copropriete) values($1,$2,$3,'appartement','1 rue ESSAI charges','75001','Paris',true)", [bien, ORG, `ESSAI Copropriété ${marque}`]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'brouillon')", [lot, ORG, bien, `ESSAI Lot ${marque}`]);
    // Un appel neuf, vide ; et un appel « d'avant » : un poste deviné « récupérable », jamais confirmé.
    await db.query("insert into appels_charges(id,organization_id,lot_id,exercice,total) values($1,$3,$4,$5,500),($2,$3,$4,$6,250)", [appelNeuf, appelAncien, ORG, lot, annee, annee - 1]);
    await db.query("insert into appel_charges_postes(organization_id,appel_id,libelle,montant,nature,propose) values($1,$2,'Création jardin',250,'recuperable',true)", [ORG, appelAncien]);
    await db.query("commit");

    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/parc/${bien}/lots/${lot}#charges`);
    const onglet = page.getByRole("tab", { name: "Argent", exact: true });
    if (await onglet.count()) await onglet.click();
    const rubrique = page.locator("#charges");
    await expect(rubrique).toBeVisible();
    // La section est repliée par défaut : l'ancre de l'adresse l'ouvre ; sinon on l'ouvre.
    const neuf = rubrique.locator(`[data-appel-exercice="${annee}"]`);
    await expect(async () => {
      if (!(await neuf.isVisible())) await rubrique.getByRole("button").first().click({ timeout: 2_000 });
      await expect(neuf).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(rubrique).toContainText("Chacun naît « à qualifier »");

    // ── 1. Un poste au mot connu : « à qualifier », la suggestion à côté.
    const ajouter = async (libelle: string, montant: string) => {
      await neuf.getByLabel("Intitulé du poste de charge", { exact: true }).fill(libelle);
      await neuf.getByLabel("Montant du poste, en euros", { exact: true }).fill(montant);
      await neuf.getByRole("button", { name: "Ajouter le poste", exact: true }).click();
      await expect(neuf.locator("li").filter({ hasText: libelle })).toBeVisible();
    };
    await ajouter("Ascenseur — entretien", "300");
    const ligneAscenseur = neuf.locator("li").filter({ hasText: "Ascenseur — entretien" });
    await expect(ligneAscenseur).toContainText("À qualifier");
    await expect(ligneAscenseur.locator("[data-suggestion-nature]")).toHaveText("Suggestion : récupérable — à confirmer");
    expect(await postes(appelNeuf)).toEqual([{ libelle: "Ascenseur — entretien", montant: 300, nature: "a_qualifier", propose: true }]);

    // ── 2. Un intitulé de travaux : aucune suggestion.
    await ajouter("Travaux ascenseur", "200");
    const ligneTravaux = neuf.locator("li").filter({ hasText: "Travaux ascenseur" });
    await expect(ligneTravaux).toContainText("À qualifier");
    await expect(ligneTravaux.locator("[data-suggestion-nature]")).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await neuf.screenshot({ path: info.outputPath("charges-postes-a-qualifier.png") });

    // ── 3. Tant qu'un poste reste à qualifier, la validation est refusée.
    await neuf.getByRole("button", { name: "Valider la ventilation", exact: true }).click();
    await expect(neuf).toContainText("2 poste(s) restent à qualifier");
    expect(await statut(appelNeuf)).toBe("brouillon");

    // Le gestionnaire choisit, poste par poste.
    await ligneAscenseur.locator('select[name="nature"]').selectOption("recuperable");
    await ligneAscenseur.getByRole("button", { name: "Qualifier", exact: true }).click();
    await expect(ligneAscenseur).toContainText("Récupérable (locataire)");
    await ligneTravaux.locator('select[name="nature"]').selectOption("non_recuperable");
    await ligneTravaux.getByRole("button", { name: "Qualifier", exact: true }).click();
    await expect(ligneTravaux).toContainText("Non récupérable (propriétaire)");
    expect(await postes(appelNeuf)).toEqual([
      { libelle: "Ascenseur — entretien", montant: 300, nature: "recuperable", propose: false },
      { libelle: "Travaux ascenseur", montant: 200, nature: "non_recuperable", propose: false },
    ]);
    await neuf.getByRole("button", { name: "Valider la ventilation", exact: true }).click();
    await expect(neuf).toContainText("Ventilé");
    expect(await statut(appelNeuf)).toBe("ventile");

    // ── 4. Un poste « récupérable » proposé avant ce lot, jamais confirmé : la validation le refuse et dit quoi faire.
    const ancien = rubrique.locator(`[data-appel-exercice="${annee - 1}"]`);
    const ligneJardin = ancien.locator("li").filter({ hasText: "Création jardin" });
    await expect(ligneJardin).toContainText("Récupérable (locataire) (proposé)");
    await expect(ligneJardin.locator("[data-proposition-a-confirmer]")).toContainText("confirmez-la par « Qualifier », ou corrigez-la");
    await ancien.getByRole("button", { name: "Valider la ventilation", exact: true }).click();
    await expect(ancien).toContainText("1 poste(s) proposé(s) « récupérable » attendent votre confirmation");
    expect(await statut(appelAncien)).toBe("brouillon");
    await ancien.screenshot({ path: info.outputPath("charges-proposition-a-confirmer.png") });
    // Le gestionnaire corrige : une création de jardin, il la garde à sa charge.
    await ligneJardin.locator('select[name="nature"]').selectOption("non_recuperable");
    await ligneJardin.getByRole("button", { name: "Qualifier", exact: true }).click();
    await expect(ligneJardin).toContainText("Non récupérable (propriétaire)");
    await ancien.getByRole("button", { name: "Valider la ventilation", exact: true }).click();
    await expect(ancien).toContainText("Ventilé");
    expect(await statut(appelAncien)).toBe("ventile");
    // Seul ce que le gestionnaire a confirmé « récupérable » est compté pour le locataire.
    expect((await db.query("select public.charges_recuperables_exercice($1,$2)::float8 r1, public.charges_recuperables_exercice($1,$3)::float8 r0", [lot, annee, annee - 1])).rows[0]).toEqual({ r1: 300, r0: 0 });
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("update appels_charges set statut='brouillon' where lot_id=$1", [lot]);
      await db.query("delete from appel_charges_postes where appel_id in (select id from appels_charges where lot_id=$1)", [lot]);
      await db.query("delete from appels_charges where lot_id=$1", [lot]);
      await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
