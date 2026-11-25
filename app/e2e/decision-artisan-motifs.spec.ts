import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LES MOTIFS D'UN REFUS SONT ENVOYÉS À L'ARTISAN PAR E-MAIL (audit palier 1 du 22/11/2026, P1-16).
//
// Les conditions de l'espace artisan promettent les motifs « par courriel ». Ici, dans le navigateur du superviseur :
// il refuse une inscription fictive en écrivant le motif ; l'écran confirme la décision ET dit ce qu'il en est de
// l'e-mail ; la fiche garde la décision, son motif, l'état de l'e-mail, et offre de le renvoyer tant qu'il n'est pas
// parti.
//
// LE BANC N'A PAS DE SERVICE D'ENVOI : aucun e-mail ne part d'ici. Ce parcours tient donc que l'écran ne prétend
// jamais qu'un e-mail est parti quand il ne l'est pas, et que la décision reste entière. L'envoi lui-même (une fois,
// à la bonne adresse, avec le motif, décision marquée notifiée) est tenu par tests/decision-artisan-base.test.ts, avec
// le vrai code d'envoi et un fournisseur simulé. Si un jour le banc reçoit un service d'envoi, le parcours accepte
// aussi la réponse « envoyés » — et vérifie alors que la base le dit de même.

test.use({ storageState: "e2e/.auth/superadmin.json", actionTimeout: 10_000 });

test("artisan refusé : la décision est enregistrée avec son motif, l'écran dit ce qu'il en est de l'e-mail des motifs", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé uniquement",
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const artisan = randomUUID(), compte = randomUUID(), marque = artisan.slice(0, 8);
  const MOTIF = `Attestation décennale expirée (essai ${marque}).`;
  const systeme = async (f: () => Promise<void>) => {
    await db.query("begin");
    try { await db.query("select public.tache_systeme()"); await f(); await db.query("commit"); }
    catch (e) { await db.query("rollback").catch(() => {}); throw e; }
  };
  const decision = async () => (await db.query(
    "select decision::text decision, motif, notifie_le is not null notifiee from public.artisan_validations where artisan_id = $1 order by created_at desc, id desc limit 1", [artisan])).rows[0];

  try {
    await systeme(async () => {
      await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
          confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
        values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now(),'','','','','')`, [compte, `artisan.essai.${marque}@test.local`]);
      await db.query(`insert into artisans(id,raison_sociale,siret,telephone,email,statut_plateforme,siret_etat,visibilite,account_id)
        values($1,$2,lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000',$3,'en_attente','verifie','privee',$4)`,
        [artisan, `ESSAI Artisan ${marque}`, `atelier.essai.${marque}@example.invalid`, compte]);
    });

    // ── 1. Le superviseur ouvre la fiche et refuse l'inscription, motif écrit.
    await sansSyntheseAlertes(page);
    await page.goto(`/admin/clients/artisans/${artisan}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`ESSAI Artisan ${marque}`);
    await page.getByText("Refuser cette inscription", { exact: true }).click();
    const refus = page.locator("form").filter({ has: page.getByRole("button", { name: "Refuser avec ce motif", exact: true }) });
    await refus.getByLabel("Motif communiqué à l’artisan").fill(MOTIF);
    await refus.getByRole("button", { name: "Refuser avec ce motif", exact: true }).click();

    // ── 2. L'écran confirme la décision et dit, dans la même phrase, ce qu'il en est de l'e-mail.
    const retour = page.getByText(/Inscription refusée avec son motif\./).first();
    await expect(retour).toBeVisible();
    const texte = (await retour.textContent()) ?? "";
    expect(texte).toMatch(/Les motifs ont été envoyés à l’artisan par e-mail\.|L’e-mail des motifs n’est pas parti\./);
    const apres = await decision();
    expect(apres).toMatchObject({ decision: "refus", motif: MOTIF });
    // L'écran et la base disent la même chose : jamais « envoyés » sans notification enregistrée.
    expect(texte.includes("ont été envoyés")).toBe(apres.notifiee);
    expect((await db.query("select statut_plateforme::text s from public.artisans where id = $1", [artisan])).rows[0].s).toBe("refuse");

    // ── 3. La fiche garde la décision, son motif et l'état de l'e-mail.
    await page.reload();
    await page.getByText("Historique des décisions", { exact: true }).click();
    const historique = page.locator("li").filter({ hasText: MOTIF }).first();
    await expect(historique).toBeVisible();
    const etat = historique.locator("[data-motifs-notifies]");
    await expect(etat).toHaveAttribute("data-motifs-notifies", apres.notifiee ? "oui" : "non");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await historique.screenshot({ path: info.outputPath("decision-artisan-historique.png") });

    if (!apres.notifiee) {
      // ── 4. Pas parti : la fiche le dit et offre de renvoyer. Sans service d'envoi, le renvoi échoue et le DIT.
      await expect(etat).toContainText("L’e-mail des motifs n’est pas encore parti.");
      await etat.getByRole("button", { name: "Renvoyer l’e-mail des motifs", exact: true }).click();
      const suite = etat.locator('[role="alert"], [role="status"]').first();
      await expect(suite).toBeVisible();
      const reponse = (await suite.textContent()) ?? "";
      const fin = await decision();
      expect(reponse.includes("ont été envoyés")).toBe(fin.notifiee);
      if (!fin.notifiee) expect(reponse).toContain("n’est pas parti");
      // La décision, elle, n'a pas bougé.
      expect(fin).toMatchObject({ decision: "refus", motif: MOTIF });
    } else {
      await expect(etat).toContainText("Motifs envoyés à l’artisan par e-mail le");
    }
  } finally {
    try {
      await systeme(async () => {
        await db.query("delete from public.courriels_durables where contexte_metier->>'type' = 'decision_artisan' and contexte_metier->>'id' in (select id::text from public.artisan_validations where artisan_id = $1)", [artisan]);
        await db.query("delete from public.artisans where id = $1", [artisan]);
        await db.query("delete from auth.users where id = $1", [compte]);
      });
    } catch (e) { console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
