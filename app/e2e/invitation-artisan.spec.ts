import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

/**
 * Invitation d'un artisan par un propriétaire direct (décision du dirigeant du 15/10/2026), de bout en bout, au
 * navigateur, sur le banc local (aucun envoi réel : sans RESEND_API_KEY, l'écran dit « n'a pas été envoyé ») :
 *   le propriétaire invite → l'artisan ouvre le lien, crée son compte, inscrit son entreprise, accepte, dépose RC pro
 *   et décennale → AVANT la validation de Gerimmo il n'est PAS sollicitable (voie de sortie « Inviter un artisan ») →
 *   le super administrateur le valide (la fiche dit « Invité par … ») → le propriétaire le sollicite pour un incident
 *   d'un bien situé dans une commune FERMÉE au réseau (origine « carnet »).
 * Base API fictive locale seulement (SUPALOCAL_DB = …/gerimmo_ci_…_api) : les données du parcours y restent.
 */
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1"; // « Parc de Claire Moreau », seed de démo
const MOT_DE_PASSE_DEMO = "Gerimmo-Demo-2026";
const API_LOCALE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

async function connecter(page: Page, email: string) {
  await sansSyntheseAlertes(page);
  await page.goto("/connexion");
  await page.locator("#email").fill(email);
  await page.locator("#mot-de-passe").fill(MOT_DE_PASSE_DEMO);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

/** Le sas du second facteur, franchi comme dans e2e/auth.setup.ts (facteurs de l'émulateur, en mémoire). */
async function franchirLeSasMfa(page: Page) {
  await page.waitForURL(/\/securite/, { timeout: 15_000 });
  const { totp } = await import("./local/mfa-local.mjs");
  await fetch(`${API_LOCALE}/__banc/oublier-facteurs`, { method: "POST" }).catch(() => {});
  await page.reload();
  await page.getByRole("button", { name: "Configurer mon application" }).click();
  await page.getByText("Saisir une clé à la place du QR code").click();
  const secret = (await page.locator("details p").first().innerText()).trim();
  await page.getByLabel("Code à six chiffres").fill(totp(secret));
  await page.getByRole("button", { name: "Activer et continuer" }).click();
  await page.waitForURL(/\/(admin|espaces)/, { timeout: 20_000 });
}

test("invitation d'un artisan : inviter, s'inscrire, attendre Gerimmo, solliciter en commune fermée", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API fictive locale seulement");
  const db = new Client({ connectionString: url });
  await db.connect();
  const marque = randomUUID().slice(0, 8);
  const email = `artisan-invite-${marque}@example.invalid`;
  const raisonSociale = `Plomberie Invitée ${marque}`;
  const siret = `7${String(Date.now()).slice(-13)}`;

  // Un bien à Bordeaux (commune confirmée, réseau fermé par défaut) et un incident de plomberie qualifié.
  const { rows: [{ id: incident }] } = await db.query(
    `with b as (insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee)
                values($1,$2,'appartement','1 cours de l’Intendance','33000','Bordeaux','33063') returning id),
          l as (insert into public.lots(organization_id,bien_id,nom,etat) select $1,id,'Lot E2E invitation','loue' from b returning id),
          p as (insert into public.persons(organization_id,nom) values($1,'Locataire E2E invitation') returning id),
          ba as (insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges)
                 select $1,l.id,p.id,'actif',current_date-100,600,40 from l,p returning id,lot_id,locataire_principal)
     insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
     select $1,'E2E-'||$3,ba.lot_id,ba.id,ba.locataire_principal,'espace_locataire','plomberie_canalisation','Fuite sous l’évier','qualifie','proprietaire','Usure'
     from ba returning id`,
    [ORG, `Bien E2E invitation ${marque}`, marque]
  );
  // Rejouable sur la même base : les artisans invités par un passage précédent sortent du carnet (désactivés), sans
  // quoi le carnet compterait déjà un contact pour Bordeaux et la voie de sortie ne s'afficherait pas.
  await db.query(
    `update public.artisan_agences set statut='desactive' where organization_id=$1 and statut='actif'
       and artisan_id in (select id from public.artisans where raison_sociale like 'Plomberie Invitée %')`,
    [ORG]
  );
  // La commune reste FERMÉE au réseau pendant tout le parcours.
  expect((await db.query("select count(*)::int n from public.reseau_ouvertures where commune_code='33063' and ouverte")).rows[0].n).toBe(0);

  const proprietaire = await browser.newContext({ ...info.project.use });
  const artisan = await browser.newContext({ ...info.project.use });
  const supervision = await browser.newContext({ ...info.project.use });
  const p = await proprietaire.newPage();
  const a = await artisan.newPage();
  const s = await supervision.newPage();
  try {
    // 1. Le propriétaire invite, depuis son carnet.
    await connecter(p, "proprietaire@gerimmo-demo.fr");
    await p.waitForURL(/\/(espaces|agence)/);
    await p.goto(`/agence/${ORG}/artisans`);
    await expect(p.getByRole("heading", { name: "Mes artisans" })).toBeVisible();
    await p.getByLabel(/Adresse e-mail de l’artisan/).fill(email);
    await p.getByLabel("Nom, pour mémoire").fill("M. Invité");
    await p.getByLabel("Métier, pour mémoire").selectOption("plomberie");
    await p.getByRole("button", { name: "Envoyer l’invitation", exact: true }).click();
    await expect(p.getByRole("alert").filter({ hasText: "n’a pas été envoyé" })).toBeVisible();
    await p.reload();
    const ligneInvitation = p.locator("li").filter({ hasText: email });
    await expect(ligneInvitation).toContainText("e-mail non envoyé");
    await expect(ligneInvitation.getByRole("button", { name: "Renvoyer" })).toBeVisible();
    await expect(ligneInvitation.getByRole("button", { name: "Annuler l’invitation" })).toBeVisible();
    expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
    await p.screenshot({ path: info.outputPath("1-carnet-invitation-envoyee.png"), fullPage: true });

    // 1 bis. Annuler, puis inviter de nouveau (relecture du 15/10) : la ligne change sous le bouton (ses gestes
    // disparaissent, puis la nouvelle invitation remplace l'ancienne), mais l'issue de chaque geste reste annoncée et
    // reçoit le focus : un lecteur d'écran l'entend, le clavier ne se perd pas en haut de la page.
    await ligneInvitation.getByRole("button", { name: "Annuler l’invitation" }).click();
    const annulee = p.getByRole("status").filter({ hasText: `Invitation à ${email} annulée` });
    await expect(annulee).toBeVisible();
    await expect(annulee).toBeFocused();
    await expect(ligneInvitation).toContainText("Annulée");
    await ligneInvitation.getByRole("button", { name: "Inviter de nouveau" }).click();
    const reinvitee = p.getByRole("alert").filter({ hasText: "n’a pas été envoyé" });
    await expect(reinvitee).toBeVisible();
    await expect(reinvitee).toBeFocused();
    await expect(ligneInvitation).toContainText("e-mail non envoyé");
    await expect(ligneInvitation.getByRole("button", { name: "Annuler l’invitation" })).toBeVisible();
    await p.screenshot({ path: info.outputPath("1b-carnet-reinvitation.png"), fullPage: true });
    const { rows: [{ id: invitation }] } = await db.query("select id from public.invitations_artisans where email=$1 and etat='en_attente'", [email]);

    // 2. L'artisan ouvre le lien de l'e-mail : sans compte, l'adresse invitée est pré-remplie (ancre du lien).
    await a.goto(`/artisan/invitation/${invitation}#adresse=${encodeURIComponent(email)}`);
    await expect(a.getByRole("heading", { name: "Vous avez reçu une invitation" })).toBeVisible();
    await expect(a.getByText("Parc de Claire Moreau")).toHaveCount(0); // rien de l'invitation sans session
    await expect(a.getByLabel("Adresse e-mail", { exact: true })).toHaveValue(email);
    await a.getByLabel("Mot de passe", { exact: true }).fill("Artisan-Invite-2026!");
    await a.getByLabel("Confirmer le mot de passe").fill("Artisan-Invite-2026!");
    await a.getByRole("checkbox", { name: /accepte les conditions/ }).check();
    await a.screenshot({ path: info.outputPath("2-artisan-creation-compte.png"), fullPage: true });
    await a.getByRole("button", { name: "Créer mon compte" }).click();
    await a.waitForURL(new RegExp(`/artisan/invitation/${invitation}$`));
    await expect(a.getByText("Proposée par Parc de Claire Moreau")).toBeVisible();

    // 3. Il inscrit son entreprise, revient, et accepte explicitement.
    await a.getByRole("link", { name: "Inscrire mon entreprise" }).click();
    await a.waitForURL(new RegExp(`/artisan/inscription\\?invitation=${invitation}$`));
    await a.locator('[name="raison_sociale"]').fill(raisonSociale);
    await a.locator('[name="siret"]').fill(siret);
    await a.locator('[name="telephone"]').fill("0611223344");
    await a.getByRole("checkbox", { name: "Plomberie" }).check();
    await a.locator('[name="codes_postaux"]').fill("33000");
    await a.getByRole("button", { name: "Inscrire mon entreprise" }).click();
    await a.waitForURL(new RegExp(`/artisan/invitation/${invitation}$`));
    await expect(a.getByRole("button", { name: "Accepter l’invitation" })).toBeVisible();
    expect(await debordementHorizontal(a)).toBeLessThanOrEqual(1);
    await a.screenshot({ path: info.outputPath("3-artisan-accepter.png"), fullPage: true });
    await a.getByRole("button", { name: "Accepter l’invitation" }).click();
    await expect(a.getByRole("heading", { name: "Vous êtes dans le carnet d’artisans de Parc de Claire Moreau" })).toBeVisible();

    // 4. Il dépose RC pro et décennale.
    const dans300Jours = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);
    for (const type of ["rc_pro", "decennale"]) {
      await a.goto(`/artisan/attestations?type=${type}#deposer`);
      const formulaire = a.locator("form").filter({ has: a.getByRole("button", { name: "Déposer l'attestation", exact: true }) });
      await formulaire.locator('[name="expire_le"]').fill(dans300Jours);
      await formulaire.locator('input[type="file"]').setInputFiles({
        name: `${type}.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from(`%PDF-1.7\n% ATTESTATION FICTIVE ${type} ${marque}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`),
      });
      await formulaire.getByRole("button", { name: "Déposer l'attestation", exact: true }).click();
      await expect(formulaire.getByRole("status")).toBeVisible();
    }
    const { rows: [fiche] } = await db.query("select id, statut_plateforme from public.artisans where siret=$1", [siret]);
    expect(fiche.statut_plateforme).toBe("en_attente");
    expect((await db.query("select count(*)::int n from public.artisan_pieces where artisan_id=$1 and retiree_le is null", [fiche.id])).rows[0].n).toBe(2);

    // 5. AVANT la validation de Gerimmo : dans le carnet, mais PAS sollicitable ; la voie de sortie propose d'inviter.
    await p.goto(`/agence/${ORG}/artisans`);
    const ligneArtisan = p.locator("li").filter({ hasText: raisonSociale });
    await expect(ligneArtisan).toContainText("Inscrit, en attente de validation par Gerimmo");
    await expect(ligneArtisan).toContainText("0611223344");
    await p.goto(`/agence/${ORG}/incidents/${incident}`);
    await p.getByLabel("Métier recherché *").selectOption("plomberie");
    await p.getByLabel("Nature des travaux *").selectOption("entretien_courant");
    await expect(p.getByText("Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.")).toBeVisible();
    await expect(p.getByRole("link", { name: "Inviter un artisan" })).toHaveAttribute("href", `/agence/${ORG}/artisans#inviter-un-artisan`);
    await expect(p.getByRole("button", { name: "Ouvrir la mise en concurrence" })).toBeDisabled();
    // Seconde relecture du 15/10 : la fiche dit pourquoi l'artisan du carnet n'est pas proposé pour ce bien.
    const pourquoi = p.locator("li").filter({ hasText: raisonSociale }).filter({ hasText: "inscription pas validée par Gerimmo" });
    await expect(p.getByText("Dans votre carnet, ne peuvent pas être sollicités pour ce bien :")).toBeVisible();
    await expect(pourquoi).toBeVisible();
    await p.screenshot({ path: info.outputPath("4-proprietaire-avant-validation.png"), fullPage: true });

    // 6. Le super administrateur valide : la fiche dit d'où vient l'artisan.
    await connecter(s, "superadmin@gerimmo-demo.fr");
    await franchirLeSasMfa(s);
    // Après « Activer et continuer », la redirection vers l'espace peut encore courir : une navigation lancée trop tôt
    // est interrompue par elle (ERR_ABORTED). On attend le calme du réseau, puis on réessaie une fois au besoin.
    await s.waitForLoadState("networkidle");
    await s.goto("/admin/artisans").catch(() => s.goto("/admin/artisans"));
    const examen = s.locator("section").filter({ has: s.getByRole("heading", { name: raisonSociale }) });
    await expect(examen).toContainText("Invité par Parc de Claire Moreau");
    await s.screenshot({ path: info.outputPath("5-supervision-invite-par.png"), fullPage: true });
    await examen.getByRole("checkbox", { name: /J’ai vérifié l’existence/ }).check();
    await examen.getByRole("button", { name: "Enregistrer le SIRET comme vérifié" }).click();
    await expect.poll(async () => (await db.query("select siret_etat from public.artisans where id=$1", [fiche.id])).rows[0].siret_etat).toBe("verifie");
    await s.reload();
    const examen2 = s.locator("section").filter({ has: s.getByRole("heading", { name: raisonSociale }) });
    await examen2.getByRole("checkbox", { name: /J’ai relu les justificatifs/ }).check();
    await examen2.getByRole("button", { name: "Valider l’inscription" }).click();
    await expect.poll(async () => (await db.query("select statut_plateforme from public.artisans where id=$1", [fiche.id])).rows[0].statut_plateforme).toBe("valide");

    // 7. Le propriétaire le sollicite, commune fermée, depuis son carnet.
    await p.goto(`/agence/${ORG}/artisans`);
    // « Validé », sans promesse : la zone et la décennale se jugent bien par bien (seconde relecture du 15/10).
    const ligneValidee = p.locator("li").filter({ hasText: raisonSociale });
    await expect(ligneValidee.getByText("Validé", { exact: true })).toBeVisible();
    await expect(ligneValidee).not.toContainText("peut être sollicité");
    await p.goto(`/agence/${ORG}/incidents/${incident}`);
    await p.getByLabel("Métier recherché *").selectOption("plomberie");
    await p.getByLabel("Nature des travaux *").selectOption("entretien_courant");
    await expect(p.getByText(/Vous pouvez continuer avec 1 artisan de votre carnet personnel/)).toBeVisible();
    await p.getByRole("checkbox", { name: /J'assume un devis unique|J’assume un devis unique/ }).check();
    await p.getByRole("button", { name: "Ouvrir avec mon carnet" }).click();
    await p.getByRole("button", { name: `Demander un devis à ${raisonSociale}` }).click();
    await expect.poll(async () => (await db.query(
      "select origine_reseau from public.incident_sollicitations where incident_id=$1 and artisan_id=$2", [incident, fiche.id]
    )).rows.map((r) => r.origine_reseau)).toEqual(["carnet"]);
    await p.screenshot({ path: info.outputPath("6-proprietaire-sollicitation.png"), fullPage: true });
  } finally {
    await proprietaire.close();
    await artisan.close();
    await supervision.close();
    await db.end();
  }
});
