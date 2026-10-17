import { cliquer, contextePersona, expect, test } from './outils';
import { avecBaseRecette, preparerDossierIncident } from './fixtures-metier';

test.use({ persona: 'admin', trace: 'off', screenshot: 'off', video: 'off' });
test.describe('règlement déclaré par le gérant et lu par l’artisan', { tag: '@parcours-metier' }, () => {
  test.skip(process.env.RECETTE_AUTONOME !== '1', 'Uniquement les comptes temporaires du chantier autonome.');
  test('D23 : déclaration, dépense unique et date/moyen visibles sans la référence privée', async ({ page, browser }) => {
    const fixture = await avecBaseRecette(async base => {
      const dossier = await preparerDossierIncident(base, 'd23');
      const { db, artisanCompteId, gerantId } = base;
      const { orgId, incidentId, artisanId } = dossier;
      const id = async (sql: string, args: unknown[]) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
      const interventionId = await id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','en_cours') returning id", [orgId, incidentId, artisanId]);
      await db.query("insert into public.intervention_comptes_rendus(organization_id,intervention_id,artisan_id,travaux_realises,montant_final_cents) values($1,$2,$3,'Réparation fictive de recette',23968)", [orgId, interventionId, artisanId]);
      // Le dossier terminé est une fixture SQL ; ce parcours éprouve le règlement,
      // pas le dépôt des pièces. Aucune lecture de ces chemins fictifs n'est demandée.
      const photo = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident','Photo fictive de recette',$2,'image/png',10,$3) returning id", [orgId, `${orgId}/recette/${interventionId}/photo.png`, `recette-photo-${interventionId}`]);
      await db.query("insert into public.intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')", [orgId, interventionId, photo]);
      await db.query("update public.incident_interventions set statut='terminee',terminee_le=now() where id=$1", [interventionId]);
      await db.query("update public.incidents set etat='termine' where id=$1", [incidentId]);
      const document = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'facture_artisan','Facture fictive de recette',$2,'application/pdf',10,$3) returning id", [orgId, `${orgId}/recette/${interventionId}/facture.pdf`, `recette-facture-${interventionId}`]);
      const factureId = await id("insert into public.intervention_factures(organization_id,intervention_id,artisan_id,numero,montant_ttc_cents,montant_reference_cents,document_id,deposee_par) values($1,$2,$3,'RECETTE-D23',23968,23968,$4,$5) returning id", [orgId, interventionId, artisanId, document, artisanCompteId]);
      await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [gerantId]);
      await db.query('set local role authenticated');
      await db.query("select public.valider_facture_artisan($1,$2,'Facture fictive préparée pour la recette D23')", [orgId, factureId]);
      await db.query('reset role');
      const jour = (await db.query('select public.aujourdhui_paris()::text jour')).rows[0].jour as string;
      return { ...dossier, interventionId, factureId, jour };
    });
    await page.goto(`/agence/${fixture.orgId}/incidents/${fixture.incidentId}`);
    await page.waitForLoadState('networkidle');
    const montant = page.getByLabel('Montant réglé (€)', { exact: true });
    await expect(montant).toBeVisible();
    await expect(montant).toHaveValue('239,68');
    await page.getByLabel('Date du règlement', { exact: true }).fill(fixture.jour);
    await page.getByLabel('Moyen de règlement', { exact: true }).selectOption('virement');
    const reference = `PRIVE-RECETTE-${fixture.factureId}`;
    await page.getByLabel('Référence (facultative)', { exact: true }).fill(reference);
    await cliquer(page.getByRole('button', { name: 'Enregistrer le règlement', exact: true }));
    await expect(page.getByText(/La facture est réglée en totalité/)).toBeVisible();
    await avecBaseRecette(async ({ db, gerantId }) => {
      const { rows } = await db.query("select r.montant_cents::int montant,r.date_reglement::text jour,r.moyen,r.cree_par,e.montant::text montant_ecriture,e.categorie from public.intervention_facture_reglements r join public.ecritures e on e.id=r.ecriture_id where r.facture_id=$1 and r.retire_le is null", [fixture.factureId]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ montant: 23968, jour: fixture.jour, moyen: 'virement', cree_par: gerantId, categorie: 'travaux' });
      expect(Number(rows[0].montant_ecriture)).toBe(239.68);
    });
    const context = await contextePersona(browser, 'artisan');
    try {
      const artisan = await context.newPage();
      const dateLisible = fixture.jour.split('-').reverse().join('/');
      for (const chemin of [`/artisan/missions/${fixture.interventionId}`, '/artisan/facturation']) {
        await artisan.goto(chemin);
        await expect(artisan.getByText(`Règlement déclaré le ${dateLisible} par virement`, { exact: true })).toBeVisible();
        await expect(artisan.getByText(`Réglée le ${dateLisible} par virement (déclaré par votre client)`, { exact: true })).toBeVisible();
        await expect(artisan.locator('body')).not.toContainText(reference);
      }
    } finally { await context.close(); }
  });
});
