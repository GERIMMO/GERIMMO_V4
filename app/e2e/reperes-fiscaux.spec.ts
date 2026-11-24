import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LES REPÈRES FISCAUX, SORTIS DU CODE (audit palier 1 du 22/11/2026, P2-09).
//
// L'aide du récapitulatif fiscal citait « 15 000 € » et « 30 % » écrits en dur. Ces deux valeurs du micro-foncier se
// règlent maintenant dans la console, avec la date de leur dernière vérification. Ici, dans deux navigateurs :
//  - le superviseur voit les valeurs de livraison, « Jamais vérifiés », et la phrase exacte que lisent les propriétaires ;
//  - le propriétaire lit ces valeurs dans son récapitulatif, avec la consigne de les contrôler (aucune date) ;
//  - une saisie avec une virgule, puis un enregistrement sans la case de confirmation : le navigateur retient le geste ;
//  - confirmation cochée : les valeurs sont enregistrées, datées du jour, journalisées avec les valeurs d'avant ;
//  - le propriétaire recharge : il lit les nouvelles valeurs et la date de leur vérification.
//
// Les valeurs saisies (15 300 €, 31 %) sont FICTIVES : elles servent à voir le réglage changer, pas à dire le droit.
// Le parcours modifie un réglage commun à toute la base du banc : il le remet à la livraison quoi qu'il arrive.
// Aucun autre parcours ne lit cette phrase d'aide.

test.use({ storageState: "e2e/.auth/superadmin.json", actionTimeout: 10_000 });

const ORG_PROPRIETAIRE = "3c1d1e95-3570-400b-8012-44530be145b1";
async function ouvrirSession(browser: Browser, session: string): Promise<Page> {
  const contexte = await browser.newContext({ storageState: `e2e/.auth/${session}.json` });
  const page = await contexte.newPage();
  await sansSyntheseAlertes(page);
  return page;
}

test("repères fiscaux : livrés sans date, réglés et datés par le superviseur, lus aussitôt par le propriétaire", async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé uniquement",
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const livraison = () => db.query("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 15000, micro_foncier_abattement_pourcent = 30, verifie_le = null, modifie_le = null, modifie_par = null where singleton");
  const reglage = async () => (await db.query("select micro_foncier_plafond_euros plafond, micro_foncier_abattement_pourcent abattement, verifie_le::text verifie from public.reperes_fiscaux_reglage where singleton")).rows[0];
  const debut = (await db.query("select now() t")).rows[0].t;
  const journal = async () => (await db.query("select details from public.supervision_operations where action = 'reperes_fiscaux' and cree_le >= $1 order by cree_le", [debut])).rows.map((r) => r.details);
  const { jour, annee } = (await db.query<{ jour: string; annee: number }>("select public.aujourdhui_paris()::text jour, extract(year from public.aujourdhui_paris())::int annee")).rows[0];
  const jourFr = `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;

  // Un bien fictif détenu par une personne déclarée au réel : c'est dans ce cas que le récapitulatif affiche l'aide.
  const bien = randomUUID(), lot = randomUUID(), personne = randomUUID();
  const nom = `TEST Repères ${lot.slice(0, 8)}`;
  const nettoyer = async () => {
    await db.query("delete from fiscal_profils_detenteurs where person_id = $1", [personne]);
    await db.query("delete from detentions where person_id = $1", [personne]);
    await db.query("delete from persons where id = $1", [personne]);
    await db.query("delete from lots where id = $1", [lot]);
    await db.query("delete from biens where id = $1", [bien]);
  };

  try {
    await livraison();
    const auteur = (await db.query<{ id: string }>("select id from auth.users where email = 'proprietaire@example.com'")).rows[0].id;
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'immeuble','1 rue TEST','75001','Paris')", [bien, ORG_PROPRIETAIRE, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible')", [lot, ORG_PROPRIETAIRE, bien, nom]);
    await db.query("insert into persons(id,organization_id,nom,qualite) values($1,$2,$3,'Personne physique')", [personne, ORG_PROPRIETAIRE, `TEST Propriétaire ${lot.slice(0, 8)}`]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,make_date($4,1,1))", [ORG_PROPRIETAIRE, lot, personne, annee]);
    await db.query(
      "insert into fiscal_profils_detenteurs(organization_id,person_id,annee,version,qualite,imposition,location_nue,location_meublee,justification,auteur) values($1,$2,$3,1,'Personne physique','ir','reel','non_concerne','Déclaration TEST au réel',$4)",
      [ORG_PROPRIETAIRE, personne, annee, auteur]);

    // ── 1. Console, à la livraison : les valeurs que le code affichait, « Jamais vérifiés », et la phrase des propriétaires.
    await sansSyntheseAlertes(page);
    await page.goto("/admin/parametres#reperes-fiscaux");
    const panneau = page.locator("[data-reperes-fiscaux]");
    await expect(panneau).toBeVisible();
    await expect(panneau).toHaveAttribute("data-reperes-fiscaux", "jamais");
    await expect(panneau.locator("[data-etat-verification]")).toHaveText("Jamais vérifiés");
    await expect(page.locator('a[href="#reperes-fiscaux"]')).toContainText("Jamais vérifiés");
    const plafond = panneau.locator("#repere-plafond");
    const abattement = panneau.locator("#repere-abattement");
    const confirmation = panneau.locator("#repere-confirmation");
    const enregistrer = panneau.getByRole("button", { name: "Enregistrer et dater la vérification", exact: true });
    await expect(plafond).toHaveValue("15000");
    await expect(abattement).toHaveValue("30");
    await expect(panneau.locator("[data-phrase-affichee]")).toContainText(/n’excèdent pas 15\s000\s€/);
    await expect(panneau.locator("[data-phrase-affichee]")).toContainText("Aucune date de vérification n’est enregistrée");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    // Même précaution que la capture après rechargement (plus bas).
    await expect(async () => {
      await expect(panneau).toBeVisible();
      await panneau.screenshot({ path: info.outputPath("reperes-fiscaux-livraison.png") });
    }).toPass({ timeout: 15_000 });

    // ── 2. Le propriétaire lit ces valeurs dans son récapitulatif, sans qu'elles soient présentées comme vérifiées.
    const proprietaire = await ouvrirSession(browser, "proprietaire");
    await proprietaire.goto(`/espace/${ORG_PROPRIETAIRE}/comptabilite/fiscal?annee=${annee}&bien=${bien}`);
    await proprietaire.getByText("Références fiscales et limites de cette aide", { exact: true }).click();
    const aide = proprietaire.locator("[data-micro-foncier]:visible");
    await expect(aide).toHaveAttribute("data-micro-foncier", "non_date");
    await expect(aide).toContainText(/Régime micro-foncier\s: si vos recettes brutes n’excèdent pas 15\s000\s€/);
    await expect(aide).toContainText(/abattement automatique de 30\s%/);
    await expect(aide).toContainText("Aucune date de vérification n’est enregistrée pour ce plafond et cet abattement");
    await expect(aide).not.toContainText("vérifiés par Gerimmo");

    // ── 3. Une virgule dans le plafond : le navigateur retient le geste, rien n'est enregistré.
    await plafond.fill("15300,50");
    await confirmation.check();
    await enregistrer.click();
    await expect(panneau.locator("#repere-plafond:invalid")).toHaveCount(1);
    await expect(panneau.getByRole("status")).toHaveCount(0);
    expect(await reglage()).toEqual({ plafond: 15000, abattement: 30, verifie: null });

    // ── 4. Valeurs correctes, mais sans la case de confirmation : rien n'est enregistré non plus.
    await plafond.fill("15300");
    await abattement.fill("31");
    await confirmation.uncheck();
    await enregistrer.click();
    await expect(confirmation).toBeFocused();
    expect(await reglage()).toEqual({ plafond: 15000, abattement: 30, verifie: null });
    expect(await journal()).toEqual([]);

    // ── 5. Confirmation cochée : enregistré, daté du jour, journalisé avec les valeurs d'avant.
    await confirmation.check();
    await enregistrer.click();
    await expect(panneau.getByRole("status")).toContainText(/Enregistré : plafond de 15\s300\s€, abattement de 31\s%, vérifiés aujourd’hui/);
    await expect(panneau).toHaveAttribute("data-reperes-fiscaux", "verifie");
    await expect(panneau.locator("[data-etat-verification]")).toHaveText(`Vérifiés le ${jourFr}`);
    await expect(panneau.locator("[data-phrase-affichee]")).toContainText(`Plafond et abattement vérifiés par Gerimmo le ${jourFr}.`);
    expect(await reglage()).toEqual({ plafond: 15300, abattement: 31, verifie: jour });
    expect(await journal()).toEqual([
      { plafond_euros: 15300, abattement_pourcent: 31, verifie_le: jour, plafond_precedent: 15000, abattement_precedent: 30, verification_precedente: null },
    ]);

    // ── 6. Après rechargement : les champs repartent des valeurs enregistrées, la case est de nouveau à cocher.
    await page.reload();
    await expect(panneau).toHaveAttribute("data-reperes-fiscaux", "verifie");
    await expect(plafond).toHaveValue("15300");
    await expect(abattement).toHaveValue("31");
    await expect(confirmation).not.toBeChecked();
    await expect(page.locator('a[href="#reperes-fiscaux"]')).toContainText(`Vérifiés le ${jourFr}`);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    // Après un rechargement, la page se met encore en place quand les vérifications ci-dessus ont abouti : le panneau a pu
    // être remplacé dans la page pendant la capture (« élément détaché », vu une fois sur la passe 1 du 24/11). La capture
    // attend un panneau visible et se reprend si elle tombe sur ce remplacement ; les vérifications ne changent pas.
    await expect(async () => {
      await expect(panneau).toBeVisible();
      await panneau.screenshot({ path: info.outputPath("reperes-fiscaux-verifies.png") });
    }).toPass({ timeout: 15_000 });

    // ── 7. Le propriétaire recharge : les nouvelles valeurs, et la date de leur vérification.
    await proprietaire.reload();
    await proprietaire.getByText("Références fiscales et limites de cette aide", { exact: true }).click();
    await expect(aide).toHaveAttribute("data-micro-foncier", "verifie");
    await expect(aide).toContainText(/n’excèdent pas 15\s300\s€/);
    await expect(aide).toContainText(/abattement automatique de 31\s%/);
    await expect(aide).toContainText(`Plafond et abattement vérifiés par Gerimmo le ${jourFr}. Une loi de finances peut les modifier : la notice officielle fait foi.`);
    await expect(aide).not.toContainText(/15\s000/);
    expect(await debordementHorizontal(proprietaire)).toBeLessThanOrEqual(1);
    await aide.scrollIntoViewIfNeeded();
    await proprietaire.screenshot({ path: info.outputPath("reperes-fiscaux-proprietaire.png") });
    await proprietaire.context().close();

    // ── 8. Le journal de la supervision nomme le geste en clair.
    await page.goto("/admin/consignes");
    await page.getByText("Dernières opérations", { exact: true }).click();
    await expect(page.getByText("Repères fiscaux enregistrés").first()).toBeVisible();
  } finally {
    await livraison().catch((e) => console.warn("Remise à la livraison impossible :", (e as Error).message));
    await nettoyer().catch((e) => console.warn("Nettoyage du bien fictif impossible :", (e as Error).message));
    await db.end();
  }
});
