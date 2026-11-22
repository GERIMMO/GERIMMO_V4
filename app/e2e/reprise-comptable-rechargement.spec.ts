import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// REPRISE DES COMPTES : UN RECHARGEMENT NE BLOQUE PLUS L'ÉCRAN (audit palier 1 du 22/11/2026, P1-02).
//
// Le défaut : après un premier « Contrôler la balance », recharger la page perdait la reprise ouverte ; le contrôle
// suivant tentait d'en ouvrir une seconde, que la base refuse (« une reprise est déjà en cours »), sans aucun bouton
// pour l'abandonner. Ici, le propriétaire contrôle, recharge, retrouve sa reprise annoncée, la poursuit, change la
// trésorerie (le contrôle repart d'une reprise neuve), puis l'abandonne.
//
// Rien n'est basculé : un contrôle n'écrit rien dans les comptes. Les reprises créées (reconnues au nom du fichier)
// sont supprimées à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("reprise des comptes : après un rechargement, la reprise en cours se retrouve, se poursuit et s'abandonne", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const fichier = `balance-test-${Date.now()}.csv`;
  const reprises = async () => (await db.query(
    "select id, statut, tresorerie_annoncee::float8 t from reprises_portefeuille where organization_id=$1 and source=$2 order by cree_le", [ORG, fichier])).rows as { id: string; statut: string; t: number }[];
  const ouvertesDeLEspace = async () => (await db.query(
    "select count(*)::int n from reprises_portefeuille where organization_id=$1 and statut in ('en_cours','controle')", [ORG])).rows[0].n as number;
  const deposer = (p: Page) => p.locator('input[type="file"][name="fichier"]').setInputFiles({
    name: fichier, mimeType: "text/csv", buffer: Buffer.from("type,montant\ndepot_garantie,700\n", "utf8"),
  });
  const controler = async (p: Page) => {
    await p.getByRole("button", { name: "Contrôler la balance", exact: true }).click();
    await expect(p.getByText("Fichier lu :", { exact: false })).toBeVisible();
  };
  const bandeau = page.locator("[data-reprise-en-cours]");
  try {
    test.skip(await ouvertesDeLEspace() > 0, "Une reprise est déjà ouverte dans cet espace : le parcours ne la touche pas");

    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/comptabilite/reprise`);
    await expect(page.getByRole("heading", { level: 1, name: "Reprendre mes comptes" })).toBeVisible();
    await expect(bandeau).toHaveCount(0);

    // ── Premier contrôle : la reprise s'ouvre.
    await page.getByLabel("Trésorerie reprise (€)", { exact: true }).fill("700");
    await deposer(page);
    await controler(page);
    const premieres = await reprises();
    expect(premieres).toHaveLength(1);
    expect(premieres[0].t).toBe(700);
    expect(["en_cours", "controle"]).toContain(premieres[0].statut);

    // ── Rechargement : la reprise est annoncée, ses valeurs reprises ; le contrôle suivant la poursuit.
    await page.reload();
    await expect(bandeau).toBeVisible();
    await expect(bandeau).toContainText("Une reprise est en cours");
    await expect(bandeau).toContainText(/trésorerie annoncée 700,00\s€/);
    await expect(page.getByLabel("Trésorerie reprise (€)", { exact: true })).toHaveValue("700");
    await deposer(page);
    await controler(page);
    await expect(page.getByText(/déjà en cours|deja en cours/i)).toHaveCount(0);
    const apresRechargement = await reprises();
    expect(apresRechargement.map((r) => r.id)).toEqual([premieres[0].id]);

    // ── Trésorerie changée : le contrôle repart d'une reprise neuve, l'ancienne est abandonnée.
    await page.getByLabel("Trésorerie reprise (€)", { exact: true }).fill("800");
    await page.getByRole("button", { name: "Contrôler la balance", exact: true }).click();
    // « Fichier lu » est déjà à l'écran depuis le contrôle précédent : on attend le fait lui-même, en base.
    await expect.poll(async () => (await reprises()).length, { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await reprises())[0].statut, { timeout: 15_000 }).toBe("abandonnee");
    const apresChangement = await reprises();
    expect(apresChangement[0]).toMatchObject({ id: premieres[0].id, statut: "abandonnee" });
    expect(apresChangement[1].t).toBe(800);
    expect(await ouvertesDeLEspace()).toBe(1);

    // ── Abandon : annoncé, puis la place est libre.
    await page.reload();
    await expect(bandeau).toContainText(/trésorerie annoncée 800,00\s€/);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("reprise-en-cours.png"), fullPage: true });
    await bandeau.getByRole("button", { name: "Abandonner cette reprise", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Reprise abandonnée" })).toBeVisible();
    await expect(bandeau).toHaveCount(0);
    expect(await ouvertesDeLEspace()).toBe(0);
    expect((await reprises()).map((r) => r.statut)).toEqual(["abandonnee", "abandonnee"]);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Reprendre mes comptes" })).toBeVisible();
    await expect(bandeau).toHaveCount(0);
  } finally {
    try {
      await db.query("begin"); await db.query("select public.tache_systeme()");
      // Aucune de ces reprises n'a basculé : elles ne portent ni solde ni écriture.
      await db.query("update reprises_portefeuille set statut='abandonnee' where organization_id=$1 and source=$2 and statut in ('en_cours','controle')", [ORG, fichier]);
      await db.query("delete from reprises_portefeuille where organization_id=$1 and source=$2 and statut='abandonnee'", [ORG, fichier]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage des reprises de test incomplet :", (e as Error).message); }
    await db.end();
  }
});
