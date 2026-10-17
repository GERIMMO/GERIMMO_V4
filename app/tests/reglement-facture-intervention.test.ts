/**
 * Décision D23 (14/10/2026, option A), fiches PRO2-21 et CHN-02 (X06) : le règlement DÉCLARATIF de la facture
 * d'intervention, côté propriétaire ou gérant, et sa trace côté artisan. Aucun paiement n'est exécuté.
 *
 * Joué sur les fonctions réelles de la base locale (SUPABASE_DB_URL), sous l'identité des comptes (set role authenticated),
 * dans une transaction annulée à la fin. Décor : une organisation, un lot sous mandat d'un agent, un incident imputé au
 * propriétaire, une intervention terminée avec compte rendu et photo, une facture déposée par l'artisan.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { etatReglementFacture } from "../src/lib/reglement-facture";
import { proposerNature } from "../src/lib/charges";
import { estFondsTravauxAlur, recapitulatifFiscal } from "../src/lib/fiscal";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D23 — règlement déclaratif de la facture d'intervention", () => {
  let db: Client;
  let org: string, autreOrg: string;
  let admin: string, agentA: string, agentB: string, sa: string, locataireCompte: string, artisanCompte: string, autreArtisanCompte: string, autreOrgAdmin: string;
  let lot: string, incident: string, artisan: string, intervention: string, document: string, facture: string;
  // Le jour de Paris, celui que la base compare : le jour d'UTC en diffère de 22 h à minuit UTC.
  const jourParis = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  const devenir = async (compte: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [compte]);
    await db.query("set local role authenticated");
  };
  const postgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const compte = async (prefixe: string) => id(`
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
      email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
  /** Un essai qui peut échouer sans casser la transaction du test. */
  async function essai<T>(f: () => Promise<T>): Promise<T> {
    await db.query("savepoint essai");
    try { const r = await f(); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); throw e; }
  }
  const regler = (montantCents: number, options: { date?: string; moyen?: string; reference?: string | null; cle?: string; factureId?: string; orgId?: string } = {}) =>
    essai(() => db.query<{ id: string }>("select public.enregistrer_reglement_facture($1,$2,$3,$4,$5,$6,$7) id",
      [options.orgId ?? org, options.factureId ?? facture, montantCents, options.date ?? jourParis(), options.moyen ?? "virement", options.reference ?? "VIR-TEST", options.cle ?? randomUUID()]))
      .then((r) => r.rows[0].id);
  const retirer = (reglement: string, motif = "Saisi deux fois") =>
    essai(() => db.query<{ id: string }>("select public.retirer_reglement_facture($1,$2,$3) id", [org, reglement, motif])).then((r) => r.rows[0].id);
  const etatSql = async (f = facture) => {
    await postgres();
    return (await db.query("select e.*, e.reglee_le::text from public.etat_facture_intervention($1) e", [f])).rows[0];
  };
  const valider = async (f = facture) => { await devenir(admin); await db.query("select public.valider_facture_artisan($1,$2,'Pièce et prix vérifiés')", [org, f]); };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Recette règlement facture','active','agence') returning id");
    autreOrg = await id("insert into public.organizations(name,status,type) values('Autre agence règlement','active','agence') returning id");
    [admin, agentA, agentB, sa, locataireCompte, artisanCompte, autreArtisanCompte, autreOrgAdmin] = [
      await compte("admin"), await compte("agentA"), await compte("agentB"), await compte("sa"),
      await compte("locataire"), await compte("artisan"), await compte("autreartisan"), await compte("autreadmin"),
    ];
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'admin_agence'),($3,$2,'agent'),($4,$2,'agent'),($5,null,'super_admin'),($6,$2,'locataire'),($7,$2,'artisan'),($8,$9,'admin_agence')`,
      [admin, org, agentA, agentB, sa, locataireCompte, artisanCompte, autreOrgAdmin, autreOrg]);
    const mandant = await id("insert into public.persons(organization_id,nom) values($1,'Bailleur fictif') returning id", [org]);
    const locataire = await id("insert into public.persons(organization_id,nom,account_id) values($1,'Locataire fictif',$2) returning id", [org, locataireCompte]);
    const bien = await id(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
      values($1,'Bien règlement','appartement','1 rue de la Recette','75001','Paris') returning id`, [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot règlement','loue') returning id", [org, bien]);
    await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, mandant]);
    const mandat = await id(`insert into public.mandats(organization_id,person_id,etat,date_debut,agent_account_id)
      values($1,$2,'brouillon',current_date-30,$3) returning id`, [org, mandant, agentA]);
    await db.query(`insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,current_date-30)`, [org, mandat, lot]);
    await db.query("update public.mandats set etat='actif' where id=$1", [mandat]);
    const bail = await id(`insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges)
      values($1,$2,$3,'actif',current_date-200,700,50) returning id`, [org, lot, locataire]);
    incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,'INC-RECETTE-REGLEMENT',$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite colonne','termine','proprietaire','Vétusté') returning id`, [org, lot, bail, locataire]);
    artisan = await id(`insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id,email)
      values('Artisan recette règlement',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000','valide','verifie','publique',$1,'artisan-reglement@test.local') returning id`, [artisanCompte]);
    await db.query(`insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id)
      values('Autre artisan',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000001','valide','verifie','publique',$1)`, [autreArtisanCompte]);
    intervention = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut)
      values($1,$2,$3,'entretien_courant','en_cours') returning id`, [org, incident, artisan]);
    await db.query(`insert into public.intervention_comptes_rendus(organization_id,intervention_id,artisan_id,travaux_realises,montant_final_cents)
      values($1,$2,$3,'Colonne réparée',23968)`, [org, intervention, artisan]);
    const photo = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'photo_incident','Photo après',$1::text||'/recette/photo.png','image/png',10,'recette-photo-reglement') returning id`, [org]);
    await db.query("insert into public.intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')", [org, intervention, photo]);
    await db.query("update public.incident_interventions set statut='terminee', terminee_le=now() where id=$1", [intervention]);
    document = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'facture_artisan','Facture A',$1::text||'/recette/facture.pdf','application/pdf',10,'recette-facture') returning id`, [org]);
    facture = await id(`insert into public.intervention_factures(organization_id,intervention_id,artisan_id,numero,montant_ttc_cents,montant_reference_cents,document_id,deposee_par)
      values($1,$2,$3,'F-2026-17',23968,23968,$4,$5) returning id`, [org, intervention, artisan, document, artisanCompte]);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  // ── B.12-1 : règlement total ─────────────────────────────────────────────────────────────────────────────────────
  it("une facture validée se règle en une fois : un règlement, une dépense « travaux » du bon lot à la bonne date, état « réglée »", async () => {
    await valider();
    const avant = await etatSql();
    expect(avant.etat).toBe("validee");
    await devenir(admin);
    const reglement = await regler(23968, { date: "2026-10-10", moyen: "virement", reference: "VIR 1234" });
    await postgres();
    const r = (await db.query("select * from public.intervention_facture_reglements where id=$1", [reglement])).rows[0];
    expect(Number(r.montant_cents)).toBe(23968);
    expect(r.moyen).toBe("virement");
    expect(r.reference).toBe("VIR 1234");
    expect(r.cree_par).toBe(admin);
    expect(r.retire_le).toBeNull();
    const e = (await db.query("select e.*, e.date_piece::text, e.date_imputation::text from public.ecritures e where id=$1", [r.ecriture_id])).rows[0];
    expect(e.organization_id).toBe(org);
    expect(e.lot_id).toBe(lot);
    expect(e.bail_id).toBeNull();
    expect(e.categorie).toBe("travaux");
    expect(e.sens).toBe("depense");
    expect(Number(e.montant)).toBe(239.68);
    expect(e.date_piece).toEqual("2026-10-10");
    expect(e.date_imputation).toEqual(jourParis());
    expect(e.libelle).toBe("Règlement facture n° F-2026-17 — incident INC-RECETTE-REGLEMENT");
    expect(e.contre_ecriture_de).toBeNull();
    expect(e.encaissement_id).toBeNull();
    const apres = await etatSql();
    expect(apres.etat).toBe("reglee");
    expect(Number(apres.total_regle_cents)).toBe(23968);
    expect(Number(apres.reste_cents)).toBe(0);
    expect(apres.reglee_le).toEqual("2026-10-10");
    expect((await db.query("select reglee_le::text from public.intervention_factures where id=$1", [facture])).rows[0].reglee_le).toEqual("2026-10-10");
  });

  // ── B.12-2 : règlement partiel puis solde, dépassement refusé ──────────────────────────────────────────────────
  it("partiel puis solde : « partiellement réglée » puis « réglée » ; le total ne dépasse jamais la facture", async () => {
    await valider();
    await devenir(agentA);
    await regler(10000, { date: "2026-10-01" });
    let etat = await etatSql();
    expect(etat.etat).toBe("partiellement_reglee");
    expect(Number(etat.reste_cents)).toBe(13968);
    expect(etat.reglee_le).toBeNull();
    await devenir(agentA);
    await expect(regler(13969)).rejects.toThrow("Le montant dépasse le reste à régler (139,68 €)");
    await regler(13968, { date: "2026-10-12", moyen: "cheque", reference: null });
    etat = await etatSql();
    expect(etat.etat).toBe("reglee");
    expect(etat.reglee_le).toEqual("2026-10-12");
    await devenir(agentA);
    await expect(regler(1)).rejects.toThrow("déjà réglée en totalité");
    await postgres();
    expect((await db.query("select count(*)::int n from public.ecritures where lot_id=$1 and categorie='travaux'", [lot])).rows[0].n).toBe(2);
  });

  it("la règle d'état de l'écran (lib/reglement-facture.ts) et celle de la base disent la même chose", async () => {
    const lignes = async () => (await db.query("select montant_cents, retire_le from public.intervention_facture_reglements where facture_id=$1", [facture])).rows;
    const f = async () => (await db.query("select montant_ttc_cents, validee_le from public.intervention_factures where id=$1", [facture])).rows[0];
    const comparer = async () => {
      const sql = await etatSql();
      const ts = etatReglementFacture(await f(), await lignes());
      expect(ts.etat).toBe(sql.etat);
      expect(ts.totalRegleCents).toBe(Number(sql.total_regle_cents));
      expect(ts.resteCents).toBe(Number(sql.reste_cents));
    };
    await comparer(); // deposee
    await valider();
    await comparer(); // validee
    await devenir(admin);
    const r = await regler(5000);
    await comparer(); // partiellement_reglee
    await devenir(admin);
    await regler(18968);
    await comparer(); // reglee
    await devenir(admin);
    await retirer(r);
    await comparer(); // de nouveau partiellement_reglee
  });

  // ── B.12-3 : refus avec message exact, aucune écriture ─────────────────────────────────────────────────────────
  it("facture non validée : refus « validez d'abord », aucune écriture", async () => {
    await devenir(admin);
    await expect(regler(1000)).rejects.toThrow("Validez d'abord la facture");
    await postgres();
    expect((await db.query("select count(*)::int n from public.ecritures where organization_id=$1", [org])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.intervention_facture_reglements where organization_id=$1", [org])).rows[0].n).toBe(0);
  });

  it("date future (au jour de Paris), montant nul ou négatif, moyen inconnu, référence trop longue : refus clair, rien d'écrit", async () => {
    await valider();
    await devenir(admin);
    const demain = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await expect(regler(1000, { date: demain })).rejects.toThrow(/La date du règlement ne peut pas être dans le futur \(aujourd'hui : \d{2}\/\d{2}\/\d{4}\)/);
    await expect(regler(0)).rejects.toThrow("Indiquez le montant réglé");
    await expect(regler(-5)).rejects.toThrow("Indiquez le montant réglé");
    await expect(regler(1000, { moyen: "bitcoin" })).rejects.toThrow("Choisissez le moyen de règlement");
    await expect(regler(1000, { reference: "x".repeat(201) })).rejects.toThrow("200 caractères au plus");
    await expect(essai(() => db.query("select public.enregistrer_reglement_facture($1,$2,1000,$3,'virement',null,null)", [org, facture, jourParis()]))).rejects.toThrow("La référence de cet envoi manque");
    await postgres();
    expect((await db.query("select count(*)::int n from public.ecritures where organization_id=$1", [org])).rows[0].n).toBe(0);
  });

  it("le jour de Paris est accepté même quand la session est ailleurs : aujourd'hui à Paris n'est jamais « dans le futur »", async () => {
    await valider();
    await devenir(admin);
    await db.query("set local timezone to 'Pacific/Honolulu'");
    const reglement = await regler(1000, { date: jourParis() });
    expect(reglement).toBeTruthy();
  });

  it("mois comptable clos : le message du journal est repris, rien n'est écrit", async () => {
    await valider();
    await postgres();
    await db.query("insert into public.clotures_comptables(organization_id,mois) values($1,date_trunc('month',public.aujourdhui_paris())::date)", [org]);
    await devenir(admin);
    await expect(regler(1000, { date: "2026-01-05" })).rejects.toThrow("Mois clôturé : imputez au mois ouvert ou passez une contre-écriture");
    await postgres();
    expect((await db.query("select count(*)::int n from public.intervention_facture_reglements where organization_id=$1", [org])).rows[0].n).toBe(0);
  });

  it("abonnement suspendu : le message d'abonnement, comme toute écriture", async () => {
    await valider();
    await postgres();
    await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set status='suspendue' where id=$1", [org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    await devenir(admin);
    await expect(regler(1000)).rejects.toThrow("Abonnement suspendu");
    await postgres();
    expect((await db.query("select count(*)::int n from public.intervention_facture_reglements where organization_id=$1", [org])).rows[0].n).toBe(0);
  });

  it("imputation « locataire » : le règlement est permis (le propriétaire règle l'artisan) et n'ouvre aucune créance sur le bail", async () => {
    await postgres();
    await db.query("update public.incidents set imputation='locataire' where id=$1", [incident]);
    await valider();
    await devenir(admin);
    const reglement = await regler(23968);
    await postgres();
    const e = (await db.query("select e.* from public.ecritures e join public.intervention_facture_reglements r on r.ecriture_id=e.id where r.id=$1", [reglement])).rows[0];
    expect(e.bail_id).toBeNull();
    expect(e.sens).toBe("depense");
    // Ni appel de loyer, ni encaissement, ni ligne de charges : rien côté locataire.
    expect((await db.query("select count(*)::int n from public.appels_loyer where organization_id=$1", [org])).rows[0].n).toBe(0);
  });

  // ── B.12-4 : clé d'envoi ────────────────────────────────────────────────────────────────────────────────────────
  it("même clé d'envoi rejouée : un seul règlement, refus reconnu comme un rejeu (23505, « cle_envoi ») ; clé différente : deux règlements", async () => {
    await valider();
    await devenir(admin);
    const cle = randomUUID();
    const premier = await regler(5000, { cle });
    const rejeu = await regler(5000, { cle }).catch((e: Error & { code?: string }) => e);
    expect(rejeu).toBeInstanceOf(Error);
    expect((rejeu as Error & { code?: string }).code).toBe("23505");
    expect((rejeu as Error).message).toContain("cle_envoi");
    // Même après règlement total, le rejeu reste reconnu comme tel (pas « dépasse le reste »).
    const cleSolde = randomUUID();
    await regler(18968, { cle: cleSolde });
    const rejeuSolde = await regler(18968, { cle: cleSolde }).catch((e: Error & { code?: string }) => e);
    expect((rejeuSolde as Error & { code?: string }).code).toBe("23505");
    await postgres();
    const lignes = (await db.query("select id from public.intervention_facture_reglements where facture_id=$1 order by created_at", [facture])).rows;
    expect(lignes).toHaveLength(2);
    expect(lignes[0].id).toBe(premier);
    expect((await db.query("select count(*)::int n from public.ecritures where lot_id=$1", [lot])).rows[0].n).toBe(2);
  });

  // ── B.12-5 : retrait motivé ─────────────────────────────────────────────────────────────────────────────────────
  it("retrait motivé : contre-écriture datée du jour de Paris, état recalculé, événement tracé ; un retrait déjà fait est refusé ; une contre-écriture ne se contre-passe pas", async () => {
    await valider();
    await devenir(admin);
    const reglement = await regler(23968, { date: "2026-10-10" });
    expect((await etatSql()).etat).toBe("reglee");
    await devenir(agentA);
    await expect(retirer(reglement, "   ")).rejects.toThrow("Indiquez le motif du retrait");
    const contre = await retirer(reglement, "Virement rejeté par la banque");
    await postgres();
    const r = (await db.query("select * from public.intervention_facture_reglements where id=$1", [reglement])).rows[0];
    expect(r.retire_le).toBeTruthy();
    expect(r.retire_par).toBe(agentA);
    expect(r.retrait_motif).toBe("Virement rejeté par la banque");
    expect(r.contre_ecriture_id).toBe(contre);
    const c = (await db.query("select e.*, e.date_piece::text, e.date_imputation::text from public.ecritures e where id=$1", [contre])).rows[0];
    expect(c.contre_ecriture_de).toBe(r.ecriture_id);
    expect(c.sens).toBe("recette");
    expect(Number(c.montant)).toBe(239.68);
    expect(c.lot_id).toBe(lot);
    expect(c.date_piece).toEqual(jourParis());
    expect(c.date_imputation).toEqual(jourParis());
    expect(c.motif).toBe("Virement rejeté par la banque");
    expect(c.libelle).toContain("règlement de la facture n° F-2026-17 retiré");
    // Le règlement reste en base (jamais supprimé) ; l'état redevient « validée », la date de règlement total disparaît.
    const etat = await etatSql();
    expect(etat.etat).toBe("validee");
    expect(Number(etat.total_regle_cents)).toBe(0);
    expect(etat.reglee_le).toBeNull();
    expect((await db.query("select count(*)::int n from public.intervention_facture_reglements where facture_id=$1", [facture])).rows[0].n).toBe(1);
    await devenir(agentA);
    await expect(retirer(reglement)).rejects.toThrow("Ce règlement a déjà été retiré");
    // La contre-écriture ne s'annule pas à son tour depuis le journal.
    await expect(essai(() => db.query("select public.contre_ecriture($1,'tentative')", [contre]))).rejects.toThrow("déjà une annulation");
    await postgres();
    expect((await db.query("select acteur_account_id, details from public.incident_evenements where incident_id=$1 and type='reglement_retire'", [incident])).rows).toMatchObject([
      { acteur_account_id: agentA, details: expect.objectContaining({ facture_id: facture, reglement_id: reglement, motif: "Virement rejeté par la banque" }) },
    ]);
  });

  it("après le retrait d'un règlement (virement rejeté), la facture se règle de nouveau : le règlement retiré ne compte plus", async () => {
    await valider();
    await devenir(admin);
    const premier = await regler(23968, { date: "2026-10-05", moyen: "virement" });
    expect((await etatSql()).etat).toBe("reglee");
    await devenir(admin);
    await retirer(premier, "Virement rejeté par la banque");
    await devenir(admin);
    const second = await regler(23968, { date: "2026-10-12", moyen: "cheque", reference: "CHQ 0042" });
    expect(second).not.toBe(premier);
    const etat = await etatSql();
    expect(etat.etat).toBe("reglee");
    expect(Number(etat.total_regle_cents)).toBe(23968);
    expect(Number(etat.reste_cents)).toBe(0);
    expect(etat.reglee_le).toEqual("2026-10-12");
    expect((await db.query("select reglee_le::text from public.intervention_factures where id=$1", [facture])).rows[0].reglee_le).toEqual("2026-10-12");
    // Et rien au-delà : la facture est de nouveau réglée en totalité.
    await devenir(admin);
    await expect(regler(1)).rejects.toThrow("déjà réglée en totalité");
  });

  it("l'écriture d'un règlement ne s'annule pas seule depuis le journal : la base dit où agir", async () => {
    await valider();
    await devenir(admin);
    const reglement = await regler(23968);
    await postgres();
    const { ecriture_id } = (await db.query("select ecriture_id from public.intervention_facture_reglements where id=$1", [reglement])).rows[0];
    await devenir(admin);
    const refus = (await db.query("select public.ecriture_annulable_depuis_le_journal($1) r", [ecriture_id])).rows[0].r;
    expect(refus).toContain("règlement d'une facture d'intervention");
    expect(refus).toContain("Retirer ce règlement");
    await expect(essai(() => db.query("select public.contre_ecriture($1,'depuis le journal')", [ecriture_id]))).rejects.toThrow("règlement d'une facture d'intervention");
    // Un INSERT direct d'une contre-écriture par le client est refusé (droit de colonne absent, puis même règle).
    await expect(essai(() => db.query(
      "insert into public.ecritures(organization_id,lot_id,categorie,sens,montant,libelle,contre_ecriture_de) values($1,$2,'travaux','recette',239.68,'x',$3)", [org, lot, ecriture_id]
    ))).rejects.toThrow(/permission denied|règlement d'une facture d'intervention/);
    // Après le retrait, la contre-écriture est elle aussi hors du journal.
    const contre = await retirer(reglement);
    expect((await db.query("select public.ecriture_annulable_depuis_le_journal($1) r", [contre])).rows[0].r).toContain("déjà une annulation");
  });

  // ── B.12-6 : droits ─────────────────────────────────────────────────────────────────────────────────────────────
  it("locataire, artisan, agent hors portefeuille, administrateur d'une autre organisation : refus en appel direct, rien d'écrit", async () => {
    await valider();
    for (const [compteId, orgId] of [[locataireCompte, org], [artisanCompte, org], [agentB, org], [autreOrgAdmin, org], [autreOrgAdmin, autreOrg]] as const) {
      await devenir(compteId);
      await expect(regler(1000, { orgId })).rejects.toThrow("Accès refusé");
    }
    await postgres();
    expect((await db.query("select count(*)::int n from public.intervention_facture_reglements")).rows[0].n).toBe(0);
    await devenir(admin);
    const reglement = await regler(1000);
    for (const compteId of [locataireCompte, artisanCompte, agentB, autreOrgAdmin]) {
      await devenir(compteId);
      await expect(retirer(reglement)).rejects.toThrow("Accès refusé");
    }
    // D08-C : une traversée ne permet plus ce retrait. Ce geste n'est pas
    // l'encaissement de support explicitement préparé et motivé.
    await devenir(sa);
    await expect(retirer(reglement, "Retrait par la supervision")).rejects.toThrow(/Traversée en lecture seule/);
    await postgres();
    expect((await db.query("select retire_par from public.intervention_facture_reglements where id=$1", [reglement])).rows[0].retire_par).toBeNull();
    expect((await db.query("select account_id from public.audit_log where action='reglement_facture_retire' and details->>'reglement_id'=$1", [reglement])).rows).toHaveLength(0);
  });

  it("la table se lit par les gérants de l'organisation (portefeuille compris), jamais par l'artisan ni le locataire, et ne s'écrit que par fonction", async () => {
    await valider();
    await devenir(admin);
    await regler(1000, { reference: "IBAN-SECRET-0001" });
    await devenir(agentA);
    expect((await db.query("select reference from public.intervention_facture_reglements where facture_id=$1", [facture])).rows).toHaveLength(1);
    for (const compteId of [agentB, artisanCompte, locataireCompte, autreOrgAdmin]) {
      await devenir(compteId);
      expect((await db.query("select id from public.intervention_facture_reglements where facture_id=$1", [facture])).rows, compteId).toHaveLength(0);
    }
    await postgres();
    expect((await db.query("select has_table_privilege('authenticated','public.intervention_facture_reglements','INSERT,UPDATE,DELETE,TRUNCATE') permis")).rows[0].permis).toBe(false);
    for (const signature of [
      "public.enregistrer_reglement_facture(uuid,uuid,bigint,date,text,text,uuid)",
      "public.retirer_reglement_facture(uuid,uuid,text)",
      "public.mes_reglements_factures_artisan()",
      "public.etat_facture_intervention(uuid)",
    ]) {
      expect((await db.query("select has_function_privilege('anon',$1,'EXECUTE') ok", [signature])).rows[0].ok, signature).toBe(false);
    }
    expect((await db.query("select has_function_privilege('authenticated','public.etat_facture_intervention(uuid)','EXECUTE') ok")).rows[0].ok).toBe(false);
  });

  it("l'artisan voit l'état et, pour chaque règlement, la date et le moyen de SES factures seulement ; jamais la référence ni le détail des montants", async () => {
    await devenir(artisanCompte);
    let lignes = (await db.query("select r.*, r.reglee_le::text from public.mes_reglements_factures_artisan() r")).rows;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ facture_id: facture, intervention_id: intervention, numero: "F-2026-17", etat: "deposee", reglements: [] });
    await valider();
    await devenir(admin);
    await regler(10000, { date: "2026-10-01", moyen: "virement", reference: "IBAN-SECRET-0001" });
    await devenir(artisanCompte);
    lignes = (await db.query("select r.*, r.reglee_le::text from public.mes_reglements_factures_artisan() r")).rows;
    expect(lignes[0].etat).toBe("partiellement_reglee");
    expect(lignes[0].reglee_le).toBeNull();
    expect(lignes[0].reglements).toEqual([{ date_reglement: "2026-10-01", moyen: "virement" }]);
    expect(JSON.stringify(lignes[0])).not.toContain("IBAN-SECRET");
    expect(JSON.stringify(lignes[0].reglements)).not.toContain("10000");
    expect(Object.keys(lignes[0]).sort()).toEqual(["etat", "facture_id", "intervention_id", "montant_ttc_cents", "numero", "organization_id", "reglee_le", "reglements", "validee_le"]);
    await devenir(admin);
    await regler(13968, { date: "2026-10-12", moyen: "cheque" });
    await devenir(artisanCompte);
    lignes = (await db.query("select r.*, r.reglee_le::text from public.mes_reglements_factures_artisan() r")).rows;
    expect(lignes[0].etat).toBe("reglee");
    expect(lignes[0].reglee_le).toEqual("2026-10-12");
    expect(lignes[0].reglements).toHaveLength(2);
    // Un règlement retiré (chèque rejeté) disparaît de la vue de l'artisan ; l'état et la date sont recalculés.
    await postgres();
    const cheque = (await db.query("select id from public.intervention_facture_reglements where facture_id=$1 and moyen='cheque'", [facture])).rows[0].id;
    await devenir(admin);
    await retirer(cheque, "Chèque rejeté");
    await devenir(artisanCompte);
    lignes = (await db.query("select r.*, r.reglee_le::text from public.mes_reglements_factures_artisan() r")).rows;
    expect(lignes[0].etat).toBe("partiellement_reglee");
    expect(lignes[0].reglee_le).toBeNull();
    expect(lignes[0].reglements).toEqual([{ date_reglement: "2026-10-01", moyen: "virement" }]);
    // Un autre artisan, un locataire, un gérant : rien par cette fonction.
    for (const compteId of [autreArtisanCompte, locataireCompte, admin]) {
      await devenir(compteId);
      expect((await db.query("select r.*, r.reglee_le::text from public.mes_reglements_factures_artisan() r")).rows, compteId).toHaveLength(0);
    }
  });

  // ── B.12-7 : chronologie et journal d'audit (CHN-02 clos) ──────────────────────────────────────────────────────
  it("la validation, le règlement et le retrait laissent chacun un événement au fil ET une ligne d'audit avec leur auteur", async () => {
    await devenir(agentA);
    await db.query("select public.valider_facture_artisan($1,$2,'Pièce et prix vérifiés')", [org, facture]);
    await devenir(admin);
    const reglement = await regler(23968, { date: "2026-10-10" });
    await devenir(agentA);
    await retirer(reglement, "Erreur de saisie");
    await postgres();
    const fil = (await db.query("select type, acteur_account_id, details from public.incident_evenements where incident_id=$1 and type in ('facture_validee','facture_reglee','reglement_retire') order by created_at", [incident])).rows;
    expect(fil.map((e) => e.type)).toEqual(["facture_validee", "facture_reglee", "reglement_retire"]);
    expect(fil[1].acteur_account_id).toBe(admin);
    expect(fil[1].details).toMatchObject({ facture_id: facture, numero: "F-2026-17", montant_cents: 23968, date_reglement: "2026-10-10", moyen: "virement", reglee: true, total_regle_cents: 23968 });
    expect(JSON.stringify(fil[1].details)).not.toContain("VIR-TEST");
    const audit = (await db.query("select action, account_id, details from public.audit_log where organization_id=$1 and action in ('facture_validee','reglement_facture_enregistre','reglement_facture_retire') order by created_at", [org])).rows;
    expect(audit.map((a) => a.action)).toEqual(["facture_validee", "reglement_facture_enregistre", "reglement_facture_retire"]);
    expect(audit[0].account_id).toBe(agentA);
    expect(audit[0].details).toMatchObject({ facture_id: facture, numero: "F-2026-17", montant_ttc_cents: 23968, imputation: "proprietaire", incident_id: incident });
    expect(audit[1].account_id).toBe(admin);
    expect(audit[1].details).toMatchObject({ facture_id: facture, reglement_id: reglement, montant_cents: 23968, moyen: "virement", reglee: true });
    expect(audit[2].account_id).toBe(agentA);
    expect(audit[2].details).toMatchObject({ reglement_id: reglement, motif: "Erreur de saisie" });
    // Valider deux fois n'écrit toujours qu'une décision et une ligne d'audit.
    await devenir(admin);
    await db.query("select public.valider_facture_artisan($1,$2,'Second clic')", [org, facture]);
    await postgres();
    expect((await db.query("select count(*)::int n from public.audit_log where organization_id=$1 and action='facture_validee'", [org])).rows[0].n).toBe(1);
  });

  // ── B.12-8 : libellé et récapitulatif fiscal ───────────────────────────────────────────────────────────────────
  it("le libellé de la dépense n'est pas classé « fonds de travaux » ; la dépense apparaît « à qualifier » au récapitulatif fiscal", async () => {
    await valider();
    await devenir(admin);
    await regler(23968, { date: "2026-10-10" });
    await postgres();
    const e = (await db.query("select * from public.ecritures where lot_id=$1 and categorie='travaux'", [lot])).rows[0];
    expect(proposerNature(e.libelle).fonds_alur).toBe(false);
    expect(estFondsTravauxAlur(e.categorie)).toBe(false);
    expect(estFondsTravauxAlur(e.libelle)).toBe(false);
    const recap = recapitulatifFiscal([{ id: e.id, categorie: e.categorie, sens: e.sens, montant: e.montant, date_piece: "2026-10-10", lot_id: e.lot_id, libelle: e.libelle }], 2026);
    expect(recap.fondsTravauxAlur).toBe(0);
    expect(recap.aQualifier).toBe(239.68);
    expect(recap.ecrituresAQualifier).toEqual([e.id]);
    expect(recap.rubriques.find((r) => r.code === "224")?.montant).toBe(0);
  });

  // ── B.12-9 : le registre privé de l'artisan n'est pas touché ───────────────────────────────────────────────────
  it("un règlement du propriétaire ne modifie pas le registre privé de l'artisan", async () => {
    await valider();
    await postgres();
    const avant = (await db.query("select count(*)::int n from public.artisan_reglements where artisan_id=$1", [artisan])).rows[0].n;
    await devenir(admin);
    await regler(23968);
    await postgres();
    expect((await db.query("select count(*)::int n from public.artisan_reglements where artisan_id=$1", [artisan])).rows[0].n).toBe(avant);
  });

  it("une facture d'une autre organisation ne se règle pas en passant son identifiant d'organisation à soi", async () => {
    await valider();
    await devenir(autreOrgAdmin);
    await expect(regler(1000, { orgId: autreOrg })).rejects.toThrow("Accès refusé");
    await devenir(admin);
    await expect(essai(() => db.query("select public.retirer_reglement_facture($1,$2,'x')", [org, randomUUID()]))).rejects.toThrow("Accès refusé");
  });
});
