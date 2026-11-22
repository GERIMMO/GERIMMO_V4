import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

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
// de relances par e-mail est suspendu ». Les tests de ce fichier se suivent, jamais en même temps.

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

// P1-08, complément du 23/11/2026 : trois textes promettaient au locataire « nous vous le rappellerons la veille »,
// alors que le rappel de rendez-vous est fermé par défaut. Ce test tient l'écran du locataire dans les deux états. Il vit
// dans ce fichier parce qu'il lit le même réglage que les deux tests ci-dessus : ils se suivent, jamais en même temps.
test("envois automatiques : le locataire ne lit la promesse du rappel de la veille que si cet envoi est ouvert", async ({ browser }, info) => {
  test.setTimeout(180_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé uniquement",
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const fermerTout = () => db.query("update public.envois_automatiques_reglage set avis_echeance = false, relance_loyer = false, rappel_rendez_vous = false, relance_invitation = false");
  const [org, compte, bailleur, bien, lot, cptLocataire, locataire, bail, incident, mission] = Array.from({ length: 10 }, () => randomUUID());
  const marque = org.slice(0, 8), nom = `ESSAI Rappel ${marque}`;
  const email = `rappel-${org}@example.invalid`, emailLocataire = `rappel-loc-${org}@example.invalid`, motDePasse = randomUUID();
  let artisanId = "";
  const systeme = async (travail: () => Promise<void>) => {
    await db.query("begin");
    try { await db.query("select public.tache_systeme()"); await travail(); await db.query("commit"); }
    catch (e) { await db.query("rollback").catch(() => {}); throw e; }
  };
  const chezLocataire = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const l = await chezLocataire.newPage();
  await sansSyntheseAlertes(l);

  try {
    await fermerTout();
    artisanId = (await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'")).rows[0].id;
    await systeme(async () => {
      for (const [id, adresse, meta] of [[compte, email, '{"prenom":"Propriétaire","nom":"Essai rappel"}'], [cptLocataire, emailLocataire, '{"prenom":"Camille","nom":"Essai rappel"}']] as const) {
        await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
          values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',$4::jsonb,now(),now(),'','','','','')`, [id, adresse, motDePasse, meta]);
      }
      await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75012','Paris',$3)", [org, nom, email]);
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire')", [compte, org, cptLocataire]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$2,$3,'Essai rappel','Propriétaire',$4,'Personne physique','1 rue des Essais','75012','Paris')", [bailleur, org, compte, email]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email) values($1,$2,$3,'Essai rappel','Camille',$4)", [locataire, org, cptLocataire, emailLocataire]);
      await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Essais','75012','Paris')", [bien, org, nom]);
      await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'loue',40)", [lot, org, bien, `${nom} A`]);
      await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-300)", [lot, org, bailleur]);
      await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-200,750,50,5)", [bail, org, lot, locataire]);
      await db.query("insert into artisan_agences(organization_id,artisan_id,statut) values($1,$2,'actif')", [org, artisanId]);
      await db.query(`insert into incidents(id,organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,imputation,imputation_justification)
        values($1,$2,$3,$4,$5,$6,'espace_locataire','plomberie_canalisation',$7,'affecte','proprietaire','Essai fictif')`, [incident, org, lot, bail, locataire, `ESSAI-${marque}-R`, `ESSAI rappel : fuite fictive ${marque}`]);
      // Un rendez-vous confirmé dans trois jours, à midi (heure de Paris).
      await db.query(`insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le,debut_prevu,fin_prevue)
        values($1,$2,$3,$4,'entretien_courant','planifiee',now()-interval '1 day',
          ((public.aujourdhui_paris() + 3) + time '12:00') at time zone 'Europe/Paris', ((public.aujourdhui_paris() + 3) + time '14:00') at time zone 'Europe/Paris')`, [mission, org, incident, artisanId]);
      await db.query("insert into intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin,statut) select organization_id,id,'artisan',1,debut_prevu,fin_prevue,'retenu' from incident_interventions where id=$1", [mission]);
    });

    // ── 1. Envoi fermé (la livraison) : l'écran ne promet rien et dit de noter la date.
    await connecterVers(l, emailLocataire, motDePasse, `/locataire/${org}/demandes`);
    const carte = l.locator("main:visible").first();
    await expect(carte).toContainText("Rendez-vous", { timeout: 30_000 });
    await expect(carte).toContainText("Prévoyez d'être présent, ou de faire ouvrir. Notez bien cette date : aucun rappel ne vous sera envoyé.");
    await expect(carte).not.toContainText("rappellerons");
    expect(await debordementHorizontal(l)).toBeLessThanOrEqual(1);
    await l.screenshot({ path: info.outputPath("locataire-rappel-ferme.png"), fullPage: true });

    // ── 2. Le superviseur a ouvert le rappel de rendez-vous : la promesse revient.
    await db.query("update public.envois_automatiques_reglage set rappel_rendez_vous = true");
    await l.reload();
    await expect(carte).toContainText("Prévoyez d'être présent, ou de faire ouvrir. Nous vous le rappellerons la veille.", { timeout: 30_000 });
    await expect(carte).not.toContainText("aucun rappel ne vous sera envoyé");
    await l.screenshot({ path: info.outputPath("locataire-rappel-ouvert.png"), fullPage: true });

    // ── 3. Refermé : la promesse disparaît de nouveau.
    await fermerTout();
    await l.reload();
    await expect(carte).toContainText("Notez bien cette date : aucun rappel ne vous sera envoyé.", { timeout: 30_000 });
    await expect(carte).not.toContainText("rappellerons");
  } finally {
    await fermerTout().catch((e) => console.warn("Remise à « tout fermé » impossible :", (e as Error).message));
    await db.query("rollback").catch(() => {});
    await chezLocataire.close();
    // L'artisan du banc retrouve son état d'avant ; l'espace de l'essai (comptes, logement, incident) reste dans la base du banc.
    try {
      await systeme(async () => {
        await db.query("delete from alerts where organization_id=$1", [org]);
        await db.query("delete from notification_intentions where organization_id=$1", [org]);
        await db.query("delete from intervention_creneaux where intervention_id=$1", [mission]);
        await db.query("delete from incident_evenements where organization_id=$1", [org]);
        await db.query("delete from incident_interventions where id=$1", [mission]);
        await db.query("delete from artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisanId]);
      });
    } finally { await db.end(); }
  }
});
