import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LES QUATRE ENVOIS AUTOMATIQUES, OUVERTS UN PAR UN PAR LE SUPERVISEUR (audit palier 1 du 22/11/2026, P1-08).
//
// Avis d'échéance, relance amiable, rappel de rendez-vous, relance d'invitation : prêts, mais fermés à la livraison.
// Ici, dans le navigateur du superviseur : les quatre sont « Fermé » ; ouvrir demande une confirmation cochée ;
// l'envoi ouvert le reste après rechargement, les trois autres ne bougent pas ; il se referme d'un geste ; chaque
// geste est au journal de la supervision.
//
// CE PARCOURS NE FAIT PARTIR AUCUN E-MAIL : le banc ne lance pas les tâches planifiées. La chaîne d'envoi elle-même
// (interrupteur fermé : rien ne part ; ouvert : la base refait la preuve, l'e-mail part une fois) est tenue par
// tests/envois-suspendus-base.test.ts, avec le vrai code d'envoi et un fournisseur simulé.
//
// Il modifie un réglage commun à toute la base du banc : il le remet « tout fermé » quoi qu'il arrive. Il n'ouvre
// JAMAIS la relance amiable : un autre parcours (reception-loyer-proprietaire) lit au même moment la phrase « l'envoi
// de relances par e-mail est suspendu ». Les deux tests de ce fichier se suivent, jamais en même temps.

test.use({ storageState: "e2e/.auth/superadmin.json", actionTimeout: 10_000 });
test.describe.configure({ mode: "serial" });

const ORG_PROPRIETAIRE = "3c1d1e95-3570-400b-8012-44530be145b1";
async function ouvrirSession(browser: Browser, session: string): Promise<Page> {
  const contexte = await browser.newContext({ storageState: `e2e/.auth/${session}.json` });
  const page = await contexte.newPage();
  await sansSyntheseAlertes(page);
  return page;
}

test("envois automatiques : tous fermés à la livraison, ouverts un par un avec confirmation, refermés d'un geste, tout au journal", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé uniquement",
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const fermerTout = () => db.query("update public.envois_automatiques_reglage set avis_echeance = false, relance_loyer = false, rappel_rendez_vous = false, relance_invitation = false");
  const reglage = async () => (await db.query("select avis_echeance, relance_loyer, rappel_rendez_vous, relance_invitation from public.envois_automatiques_reglage where singleton")).rows[0];
  const journal = async () => (await db.query("select details from public.supervision_operations where action = 'envoi_automatique' and cree_le >= $1 order by cree_le", [debut])).rows.map((r) => r.details);
  const debut = (await db.query("select now() t")).rows[0].t;
  const TOUT_FERME = { avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false };

  try {
    await fermerTout();
    await sansSyntheseAlertes(page);
    await page.goto("/admin/parametres#envois-automatiques");
    const panneau = page.locator("[data-envois-automatiques]");
    await expect(panneau).toBeVisible();

    // ── 1. À la livraison : quatre envois, tous fermés ; la carte de résumé le dit aussi.
    await expect(panneau).toHaveAttribute("data-envois-automatiques", "0");
    await expect(panneau.getByText("Tous fermés", { exact: true })).toBeVisible();
    const envois = panneau.locator("[data-envoi-automatique]");
    await expect(envois).toHaveCount(4);
    for (const flux of Object.keys(TOUT_FERME)) await expect(panneau.locator(`[data-envoi-automatique="${flux}"]`)).toHaveAttribute("data-ouvert", "non");
    await expect(page.locator('a[href="#envois-automatiques"]')).toContainText("Tous fermés");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await panneau.screenshot({ path: info.outputPath("envois-automatiques-fermes.png") });

    // ── 2. Ouvrir sans cocher la confirmation : le navigateur retient le geste, rien n'est enregistré.
    const rappel = panneau.locator('[data-envoi-automatique="rappel_rendez_vous"]');
    await expect(rappel.getByText("Rappel d’un rendez-vous d’intervention", { exact: true })).toBeVisible();
    await rappel.getByRole("button", { name: "Ouvrir cet envoi", exact: true }).click();
    await expect(rappel.getByRole("checkbox")).toBeFocused();
    await expect(rappel).toHaveAttribute("data-ouvert", "non");
    expect(await reglage()).toEqual(TOUT_FERME);
    expect(await journal()).toEqual([]);

    // ── 3. Confirmation cochée : l'envoi s'ouvre, lui seul ; l'écran le dit ; le geste est au journal.
    await rappel.getByRole("checkbox").check();
    await rappel.getByRole("button", { name: "Ouvrir cet envoi", exact: true }).click();
    await expect(rappel).toHaveAttribute("data-ouvert", "oui");
    await expect(rappel.getByRole("status")).toContainText("Ouvert : « Rappel d’un rendez-vous d’intervention »");
    await expect(panneau).toHaveAttribute("data-envois-automatiques", "1");
    await expect(panneau.getByText("1 ouvert sur 4", { exact: true })).toBeVisible();
    expect(await reglage()).toEqual({ ...TOUT_FERME, rappel_rendez_vous: true });
    expect(await journal()).toEqual([{ flux: "rappel_rendez_vous", ouvert: true, precedent: false }]);

    // ── 4. Après rechargement : toujours ouvert, les trois autres toujours fermés, plus de case à cocher pour lui.
    await page.reload();
    await expect(rappel).toHaveAttribute("data-ouvert", "oui");
    for (const flux of ["avis_echeance", "relance_loyer", "relance_invitation"]) await expect(panneau.locator(`[data-envoi-automatique="${flux}"]`)).toHaveAttribute("data-ouvert", "non");
    await expect(rappel.getByRole("checkbox")).toHaveCount(0);
    await expect(page.locator('a[href="#envois-automatiques"]')).toContainText("1 ouvert sur 4");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await panneau.screenshot({ path: info.outputPath("envois-automatiques-un-ouvert.png") });

    // ── 5. Refermer : un geste, sans confirmation ; l'écran, la base et le journal le disent.
    await rappel.getByRole("button", { name: "Fermer cet envoi", exact: true }).click();
    await expect(rappel).toHaveAttribute("data-ouvert", "non");
    await expect(rappel.getByRole("status")).toContainText("Fermé : « Rappel d’un rendez-vous d’intervention » ne part plus");
    await expect(panneau).toHaveAttribute("data-envois-automatiques", "0");
    expect(await reglage()).toEqual(TOUT_FERME);
    expect(await journal()).toEqual([
      { flux: "rappel_rendez_vous", ouvert: true, precedent: false },
      { flux: "rappel_rendez_vous", ouvert: false, precedent: true },
    ]);

    // ── 6. Le journal de la supervision nomme le geste en clair.
    await page.goto("/admin/consignes");
    await page.getByText("Dernières opérations", { exact: true }).click();
    await expect(page.getByText("Envoi automatique ouvert ou fermé").first()).toBeVisible();
  } finally {
    await fermerTout().catch((e) => console.warn("Remise à « tout fermé » impossible :", (e as Error).message));
    await db.end();
  }
});

test("envois automatiques : l'accord du propriétaire pour l'avis d'échéance n'est demandé que si le superviseur a ouvert l'envoi", async ({ browser }, info) => {
  test.setTimeout(180_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé uniquement",
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const fermerTout = () => db.query("update public.envois_automatiques_reglage set avis_echeance = false, relance_loyer = false, rappel_rendez_vous = false, relance_invitation = false");
  const accord = async () => (await db.query("select appels_envoi_auto a from public.organizations where id = $1", [ORG_PROPRIETAIRE])).rows[0].a as boolean;
  const accordInitial = await accord();
  // Le profil du propriétaire du banc n'a ni adresse ni e-mail de contact : le formulaire refuserait de s'enregistrer.
  // On les complète le temps du parcours (comme parcours-locataire), puis on rend les valeurs d'origine.
  const profilInitial = (await db.query("select address_line1, postal_code, city, email_contact from public.organizations where id = $1", [ORG_PROPRIETAIRE])).rows[0];
  const poserProfil = async (p: { address_line1: string | null; postal_code: string | null; city: string | null; email_contact: string | null }) => {
    await db.query("begin"); await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set address_line1 = $2, postal_code = $3, city = $4, email_contact = $5 where id = $1",
      [ORG_PROPRIETAIRE, p.address_line1, p.postal_code, p.city, p.email_contact]);
    await db.query("commit");
  };
  const poserAccord = async (valeur: boolean) => {
    await db.query("begin"); await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set appels_envoi_auto = $2 where id = $1", [ORG_PROPRIETAIRE, valeur]);
    await db.query("commit");
  };
  const admin = await ouvrirSession(browser, "superadmin");
  const proprietaire = await ouvrirSession(browser, "proprietaire");
  const panneau = admin.locator("[data-envois-automatiques]");
  const avis = panneau.locator('[data-envoi-automatique="avis_echeance"]');
  const profil = `/espace/${ORG_PROPRIETAIRE}/profil#envois`;

  try {
    await fermerTout();
    await poserAccord(false);
    await poserProfil({
      address_line1: profilInitial.address_line1 ?? "3 place de la Mairie", postal_code: profilInitial.postal_code ?? "75004",
      city: profilInitial.city ?? "Paris", email_contact: profilInitial.email_contact ?? "contact.essai@example.invalid",
    });

    // ── 1. Envoi fermé : le profil du propriétaire dit « suspendu » et ne demande aucun accord.
    await proprietaire.goto(profil);
    await expect(proprietaire.locator("#envois")).toBeVisible();
    await expect(proprietaire.getByText("L’envoi automatique des avis est suspendu.", { exact: false })).toBeVisible();
    await expect(proprietaire.locator("#pr-avis-auto")).toHaveCount(0);
    await expect(proprietaire.getByText("Les courriers de relance automatiques sont suspendus.", { exact: false })).toBeVisible();

    // ── 2. Le superviseur lit qu'aucun accord de CET espace n'existe, puis ouvre l'avis d'échéance.
    await admin.goto("/admin/parametres#envois-automatiques");
    await expect(avis).toHaveAttribute("data-ouvert", "non");
    await expect(avis.locator("[data-accords-espaces]")).toBeVisible();
    const autres = (await db.query("select count(*)::int n from public.organizations where appels_envoi_auto")).rows[0].n as number;
    await expect(avis.locator("[data-accords-espaces]")).toContainText(autres === 0 ? "Aucun espace n’a donné son accord" : `${autres} espace`);
    await avis.getByRole("checkbox").check();
    await avis.getByRole("button", { name: "Ouvrir cet envoi", exact: true }).click();
    await expect(avis).toHaveAttribute("data-ouvert", "oui");

    // ── 3. Le propriétaire retrouve la case d'accord, décochée ; il la coche et enregistre.
    await proprietaire.goto(profil);
    await proprietaire.reload();
    const caseAvis = proprietaire.locator("#pr-avis-auto");
    await expect(caseAvis).toBeVisible();
    await expect(caseAvis).not.toBeChecked();
    await expect(proprietaire.getByText("Une échéance déjà réglée n’est jamais réclamée", { exact: false })).toBeVisible();
    // La relance, elle, n'a pas été ouverte : toujours « suspendue », toujours sans case.
    await expect(proprietaire.getByText("Les courriers de relance automatiques sont suspendus.", { exact: false })).toBeVisible();
    await expect(proprietaire.locator("#pr-relances-auto")).toHaveCount(0);
    expect(await debordementHorizontal(proprietaire)).toBeLessThanOrEqual(1);
    await proprietaire.locator("#envois").screenshot({ path: info.outputPath("profil-avis-propose.png") });
    await caseAvis.check();
    await proprietaire.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
    await expect(proprietaire.getByText(/Profil enregistré à/)).toBeVisible();
    await expect.poll(accord).toBe(true);

    // ── 4. Son accueil ne dit plus « suspendu » pour l'avis ; la relance, si.
    await proprietaire.goto(`/espace/${ORG_PROPRIETAIRE}`);
    await proprietaire.locator("summary").filter({ hasText: "Mes automatismes et outils" }).click();
    const automatismes = proprietaire.getByRole("region", { name: "Envois automatiques" });
    await expect(automatismes.locator("div").filter({ hasText: "Avis d’échéance" }).locator("dd").first()).toHaveText("Activé");
    await expect(automatismes.locator("div").filter({ hasText: "Relances d’impayés" }).locator("dd").first()).toHaveText("Envoi suspendu");

    // ── 5. Le superviseur lit l'accord de plus.
    await admin.reload();
    await expect(avis.locator("[data-accords-espaces]")).toContainText(`${autres + 1} espace`);

    // ── 6. Il referme : le profil redit « suspendu », sans case ; l'accord donné reste en base, sans effet.
    await avis.getByRole("button", { name: "Fermer cet envoi", exact: true }).click();
    await expect(avis).toHaveAttribute("data-ouvert", "non");
    await proprietaire.goto(profil);
    await proprietaire.reload();
    await expect(proprietaire.getByText("L’envoi automatique des avis est suspendu.", { exact: false })).toBeVisible();
    await expect(proprietaire.locator("#pr-avis-auto")).toHaveCount(0);
    expect(await accord()).toBe(true);
    // Enregistrer le profil, envoi fermé, ne touche pas à cet accord.
    await proprietaire.locator("#pr-relance-1").fill(await proprietaire.locator("#pr-relance-1").inputValue());
    await proprietaire.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
    await expect(proprietaire.getByText(/Profil enregistré à/)).toBeVisible();
    expect(await accord()).toBe(true);
  } finally {
    await fermerTout().catch((e) => console.warn("Remise à « tout fermé » impossible :", (e as Error).message));
    await db.query("rollback").catch(() => {});
    await poserAccord(accordInitial).catch(async (e) => { await db.query("rollback").catch(() => {}); console.warn("Accord initial non rétabli :", (e as Error).message); });
    await poserProfil(profilInitial).catch(async (e) => { await db.query("rollback").catch(() => {}); console.warn("Profil initial non rétabli :", (e as Error).message); });
    await db.end();
    await admin.context().close();
    await proprietaire.context().close();
  }
});
