import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// L'INTERRUPTEUR IA, DE BOUT EN BOUT (mission palier 1, 22/11/2026).
//
// Le superviseur coupe l'IA dans les paramètres généraux ; la console le dit partout où l'IA servait ; le propriétaire,
// le locataire et l'artisan gardent chacun leur équivalent manuel ; puis le superviseur la réactive.
//
// Le banc n'a pas de clé de fournisseur et tourne en mode pilote : « IA activée » y vaut « activée, non connectée »
// (aucun appel ne peut partir, lib/verrou-pilote.ts). L'aller-retour avec le fournisseur est tenu par les tests
// unitaires, où il est simulé (interrupteur-ia.test.ts, conversation-privee.test.ts, plafond-ia-appels.test.ts).
//
// Ce parcours modifie un réglage commun à toute la base du banc : il le remet « activé » quoi qu'il arrive. Aucun
// autre parcours ne dépend des écrans que la coupure change.

const ORG_PROPRIETAIRE = "3c1d1e95-3570-400b-8012-44530be145b1";

async function ouvrir(browser: Browser, session: string): Promise<Page> {
  const contexte = await browser.newContext({ storageState: `e2e/.auth/${session}.json` });
  const page = await contexte.newPage();
  await sansSyntheseAlertes(page);
  return page;
}

test("interrupteur IA : coupée par le superviseur, chaque espace garde son équivalent manuel, puis réactivée", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || Boolean(process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY)
      || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé sans clé fournisseur uniquement"
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const incident = randomUUID(), consultation = randomUUID(), demande = randomUUID();
  const admin = await ouvrir(browser, "superadmin");
  const panneau = admin.locator("[data-interrupteur-ia]");

  /** Met l'interrupteur dans l'état voulu depuis l'écran du superviseur, quel que soit l'état trouvé. */
  async function regler(active: boolean) {
    await admin.goto("/admin/parametres#ia");
    await expect(panneau).toBeVisible();
    const bouton = panneau.getByRole("button", { name: active ? "Réactiver l’IA" : "Désactiver l’IA", exact: true });
    if (await bouton.count()) await bouton.click();
    await expect(panneau).toHaveAttribute("data-interrupteur-ia", active ? "activee" : "desactivee");
  }
  const reglageEnBase = async () => (await db.query("select ia_active from public.ia_plafond_reglage where singleton")).rows[0].ia_active as boolean;
  const appelsDuJour = async () => (await db.query("select coalesce(sum(appels),0)::int n from public.ia_appels_jour where jour = public.aujourdhui_paris()")).rows[0].n as number;

  try {
    // ── 1. IA activée (réglage par défaut). Sans clé sur le banc, le panneau dit qu'aucun appel ne peut partir.
    await regler(true);
    expect(await reglageEnBase()).toBe(true);
    await expect(panneau.getByText("IA activée", { exact: true })).toBeVisible();
    await expect(panneau.locator("[data-ia-non-connectee]")).toBeVisible();
    await panneau.getByText("Les dix fonctions concernées et ce qui les remplace", { exact: true }).click();
    await expect(panneau.getByRole("listitem")).toHaveCount(10);
    const appelsAvant = await appelsDuJour();

    // ── 2. Le superviseur coupe l'IA : l'état tient après rechargement, et le geste est au journal.
    await regler(false);
    await expect(panneau.getByRole("status")).toContainText("désactivée");
    expect(await reglageEnBase()).toBe(false);
    await admin.reload();
    await expect(panneau).toHaveAttribute("data-interrupteur-ia", "desactivee");
    await expect(panneau.getByText("IA désactivée", { exact: true })).toBeVisible();
    await expect(panneau.getByRole("button", { name: "Réactiver l’IA", exact: true })).toBeEnabled();
    await expect(panneau.locator("[data-ia-non-connectee]")).toHaveCount(0);
    expect(await debordementHorizontal(admin)).toBe(0);
    await admin.screenshot({ path: info.outputPath("interrupteur-ia-desactivee.png"), fullPage: true });

    // ── 3. La console le dit partout où l'IA servait, et offre la voie manuelle.
    await admin.goto("/admin/relais#limite-ia");
    await expect(admin.locator("[data-ia-desactivee]")).toBeVisible();
    await admin.goto("/admin/veille");
    await expect(admin.locator("[data-veille-ia-desactivee]")).toBeVisible();
    await admin.goto("/admin/equipes");
    await expect(admin.locator("[data-atelier-ia-desactivee]")).toHaveCount(1);
    await expect(admin.getByRole("button", { name: "Préparer une proposition", exact: true })).toHaveCount(0);
    await admin.goto("/admin/sante");
    // La clé du fournisseur n'est plus un point à traiter : la ligne reste, marquée « Désactivé ».
    await expect(admin.locator("li, tr, article, div").filter({ hasText: /^.{0,40}Assistant IA : veille réglementaire/ }).filter({ hasText: "Désactivé" }).first()).toHaveCount(1);
    await admin.goto("/admin/brief");
    await expect(admin.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(admin.getByText(/analyse (par l’|de l’)?IA/i)).toHaveCount(0);

    await admin.goto("/admin/publications/nouvelle");
    await expect(admin.getByText("L’IA est désactivée dans les paramètres", { exact: false })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Créer le brouillon avec Gerimmo", exact: true })).toHaveCount(0);
    const titre = `TEST brouillon vierge ${demande.slice(0, 8)}`;
    await admin.getByLabel("Titre de l’article", { exact: true }).fill(titre);
    await admin.getByRole("button", { name: "Créer un brouillon vierge", exact: true }).click();
    await admin.waitForURL(/\/admin\/publications\/[0-9a-f-]{36}$/);
    await expect(admin.locator("#titre")).toHaveValue(titre);
    expect(await debordementHorizontal(admin)).toBe(0);

    // ── 4. Le propriétaire : l'aide écrite à la place de l'assistant, la saisie sans préremplissage.
    const proprietaire = await ouvrir(browser, "proprietaire");
    await proprietaire.goto(`/espace/${ORG_PROPRIETAIRE}/messages`);
    const aideProprietaire = proprietaire.locator("[data-assistant-remplace]");
    await expect(aideProprietaire).toBeVisible();
    await expect(proprietaire.getByText("Demander à Gerimmo", { exact: true })).toHaveCount(0);
    await expect(aideProprietaire.getByRole("link", { name: "Aide et questions fréquentes", exact: true })).toHaveAttribute("href", `/espace/${ORG_PROPRIETAIRE}/faq`);
    expect(await debordementHorizontal(proprietaire)).toBe(0);
    await aideProprietaire.getByRole("link", { name: "Les règles à connaître", exact: true }).click();
    await proprietaire.waitForURL(new RegExp(`/espace/${ORG_PROPRIETAIRE}/regles$`));
    await expect(proprietaire.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await proprietaire.context().close();

    // ── 5. Le locataire : même remplacement, sur sa page de contact.
    const locataire = await ouvrir(browser, "locataire");
    await locataire.goto("/espaces");
    await locataire.waitForURL(/\/locataire\/[0-9a-f-]{36}(?:\/|$)/, { timeout: 30_000 });
    const orgLocataire = new URL(locataire.url()).pathname.split("/")[2];
    await locataire.goto(`/locataire/${orgLocataire}/contact`);
    const aideLocataire = locataire.locator("[data-assistant-remplace]");
    await expect(aideLocataire).toBeVisible();
    await expect(locataire.getByText("Demander à Gerimmo", { exact: true })).toHaveCount(0);
    await expect(aideLocataire.getByRole("link", { name: "Aide et questions fréquentes", exact: true })).toHaveAttribute("href", `/locataire/${orgLocataire}/faq`);
    expect(await debordementHorizontal(locataire)).toBe(0);
    await locataire.context().close();

    // ── 6. L'artisan : une base du catalogue, sans IA, et le devis vierge à tout moment.
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    const { rows: [lot] } = await db.query("select i.organization_id,i.lot_id from incident_sollicitations s join incidents i on i.id=s.incident_id where s.artisan_id=$1 limit 1", [a.id]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat) values($1,$2,$3,$4,'agence','plomberie_canalisation','TEST interrupteur IA : fuite au robinet','declare')", [incident, lot.organization_id, lot.lot_id, `TEST-${demande.slice(0, 8)}`]);
    await db.query("insert into incident_consultations(id,organization_id,incident_id,metier,nature_travaux) values($1,$2,$3,'plomberie','entretien_courant')", [consultation, lot.organization_id, incident]);
    await db.query("insert into incident_sollicitations(id,organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,$5,'envoyee')", [demande, lot.organization_id, consultation, incident, a.id]);
    const artisan = await ouvrir(browser, "artisan");
    await artisan.goto(`/artisan/devis/${demande}`);
    await expect(artisan.getByRole("heading", { name: "Proposition Gerimmo", exact: true })).toBeVisible({ timeout: 30_000 });
    const diagnostic = artisan.getByRole("textbox", { name: "Votre diagnostic", exact: true });
    await expect(diagnostic).not.toHaveValue("");
    await expect(artisan.getByLabel("Ligne 1 : prestation", { exact: true })).not.toHaveValue("");
    await artisan.getByText("Origine des prix et points à vérifier", { exact: true }).click();
    await expect(artisan.getByText("Proposition issue du catalogue de références", { exact: false }).first()).toBeVisible();
    await artisan.getByRole("button", { name: "Repartir d’un devis vierge", exact: true }).click();
    await expect(artisan.getByRole("heading", { name: "Devis vierge", exact: true })).toBeVisible();
    await expect(diagnostic).toHaveValue("");
    await expect(artisan.getByLabel("Ligne 1 : prestation", { exact: true })).toHaveValue("");
    await expect(artisan.getByLabel("Ligne 2 : prestation", { exact: true })).toHaveCount(0);
    await expect(artisan.getByRole("button", { name: "Repartir d’un devis vierge", exact: true })).toHaveCount(0);
    // Le devis vierge se remplit et s'enregistre comme tout autre brouillon.
    await diagnostic.fill("TEST : joint du robinet à remplacer");
    await artisan.getByLabel("Ligne 1 : prestation", { exact: true }).fill("Remplacement du joint");
    await artisan.getByLabel("Ligne 1 : prix unitaire HT", { exact: true }).fill("45");
    await artisan.getByRole("button", { name: /^Enregistrer/ }).first().click();
    await expect(artisan.getByRole("status").filter({ hasText: "Brouillon enregistré sur Gerimmo" })).toBeVisible();
    expect(await debordementHorizontal(artisan)).toBe(0);
    await artisan.screenshot({ path: info.outputPath("devis-vierge.png"), fullPage: true });
    await artisan.context().close();

    // IA coupée : aucun appel n'a été compté pendant tout le parcours.
    expect(await appelsDuJour()).toBe(appelsAvant);
  } finally {
    // Quoi qu'il arrive, le banc repart IA activée : par l'écran, sinon directement en base.
    try { await regler(true); } catch { await db.query("update public.ia_plafond_reglage set ia_active = true where singleton"); }
    try {
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from artisan_devis_preparations where sollicitation_id=$1", [demande]);
      await db.query("delete from incident_sollicitations where id=$1", [demande]);
      await db.query("delete from incident_consultations where id=$1", [consultation]);
      await db.query("delete from incident_evenements where incident_id=$1", [incident]);
      await db.query("delete from incidents where id=$1", [incident]);
      await db.query("delete from publications where titre like 'TEST brouillon vierge %'");
      await db.query("commit");
    } catch { await db.query("rollback").catch(() => {}); }
  }

  // ── 7. Réactivée : l'état est rendu, les deux gestes sont au journal de la console.
  expect(await reglageEnBase()).toBe(true);
  await expect(panneau.getByText("IA activée", { exact: true })).toBeVisible();
  const gestes = (await db.query("select details->>'active' active from public.supervision_operations where action='ia_active' order by cree_le desc limit 2")).rows.map((r) => r.active);
  expect(gestes).toEqual(["true", "false"]);
  await admin.goto("/admin/consignes");
  await admin.getByText("Dernières opérations", { exact: true }).click();
  await expect(admin.getByText("IA activée ou désactivée", { exact: false }).first()).toBeVisible();
  await admin.context().close();
  await db.end();
});
