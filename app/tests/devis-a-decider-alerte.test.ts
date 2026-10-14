/**
 * Audit du 13/10/2026, PRO2-13, décision D19 (option A) : à la réception d'un devis, une alerte dans l'application
 * (type `devis_a_decider`) est créée dans la transaction du dépôt, puis fermée à la décision, sur le patron de
 * l'avenant (`avenant_devis_a_decider`). Avant, le propriétaire n'avait qu'un e-mail : s'il était perdu, le dossier
 * dormait.
 *
 * Appels réels sous RLS, scénarios indépendants, transaction finale annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Devis reçu : alerte « à décider » (PRO2-13, D19-A)", () => {
  let db: Client;
  let org = "", autreOrg = "";
  let gerant = "", autreGerant = "", cptArtisan = "", cptArtisan2 = "", cptLoc = "";
  let artisan = "", artisan2 = "";
  let incident = "", numeroIncident = "", lotIncident = "";

  const connecte = (id: string) =>
    db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [id]
    );
  const role = (r: string) => db.query(r === "reset" ? "reset role" : `set local role ${r}`);
  const agir = async (compte: string) => {
    await role("reset");
    await connecte(compte);
    await role("authenticated");
  };
  const enTantQuePostgres = () => role("reset");
  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  };

  async function nouveauCompte(prefixe: string): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  }

  async function nouvelArtisan(compte: string, nom: string, siret: string): Promise<string> {
    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email,
         statut_plateforme, siret_etat, visibilite, account_id)
       values ($1,$2,'0611111111',$3,'valide','verifie','publique',$4) returning id`,
      [nom, siret, `${siret}@test.local`, compte]
    );
    await db.query(`insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)`, [org, a.id]);
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [a.id]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [a.id]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,$3, current_date + 300)`,
      [a.id, `artisans/${a.id}/decennale.pdf`, `emp-dec-${siret}`]
    );
    return a.id as string;
  }

  /** Une consultation ouverte avec les deux artisans sollicités. */
  async function consulter() {
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',false,30) as id`,
      [org, incident]
    );
    const { rows: [{ id: s1 }] } = await db.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan]);
    const { rows: [{ id: s2 }] } = await db.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan2]);
    return { consultation: consultation as string, s1: s1 as string, s2: s2 as string };
  }

  const LIGNES = (centimes: number) =>
    `jsonb_build_array(jsonb_build_object('libelle','Travaux','quantite',1,'prix_unitaire_ht_cents',${centimes},'tva_bps',0))`;

  async function deposer(compte: string, sollicitation: string, centimes = 48000): Promise<string> {
    await agir(compte);
    const { rows: [{ id }] } = await db.query(
      `select public.deposer_devis_structure($1, ${LIGNES(centimes)}, 'Diagnostic de test', 'Remplacement du joint', 'Sous 7 jours', 'Une journée', null, null) as id`,
      [sollicitation]
    );
    return id as string;
  }

  const alertes = async (devis?: string) => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select * from public.alerts where type = 'devis_a_decider' and organization_id = $1
         ${devis ? "and details->>'devis_id' = $2" : ""} order by created_at, id`,
      devis ? [org, devis] : [org]
    );
    return rows;
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status)
       values ('Devis à décider — Agence','active'), ('Devis à décider — Autre agence','active') returning id, name`
    );
    org = orgs.find((o) => !o.name.includes("Autre")).id;
    autreOrg = orgs.find((o) => o.name.includes("Autre")).id;
    gerant = await nouveauCompte("gerant");
    autreGerant = await nouveauCompte("autre-gerant");
    cptArtisan = await nouveauCompte("artisan");
    cptArtisan2 = await nouveauCompte("artisan2");
    cptLoc = await nouveauCompte("loc");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,$2,'locataire')`,
      [gerant, org, autreGerant, autreOrg, cptLoc]
    );

    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`, [org]);
    const { rows: [lot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot 1','loue') returning id`, [bien.id, org]);
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`, [org, cptLoc]);
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`, [org, lot.id, personne.id]);
    const { rows: [inc] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id, canal, categorie,
         description, etat, imputation, imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire','Joint usé par le temps')
       returning id, numero`, [org, lot.id, bail.id, personne.id]);
    incident = inc.id;
    numeroIncident = inc.numero;
    lotIncident = lot.id;

    artisan = await nouvelArtisan(cptArtisan, "Plomberie Durand", "12345678901234");
    artisan2 = await nouvelArtisan(cptArtisan2, "Plomberie Martin", "22345678901234");
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  beforeEach(async () => {
    await enTantQuePostgres();
    await db.query("savepoint scenario");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint scenario");
  });

  it("le dépôt d'un devis crée une alerte ouverte « Devis reçu, à décider » pour l'agence", async () => {
    const { s1 } = await consulter();
    expect(await alertes()).toHaveLength(0);
    const devis = await deposer(cptArtisan, s1);
    const lignes = await alertes();
    expect(lignes).toHaveLength(1);
    const a = lignes[0];
    expect(a.statut).toBe("ouverte");
    expect(a.criticite).toBe("normale");
    expect(a.assigned_all).toBe(true);
    expect(a.titre).toBe(`Devis reçu, à décider — ${numeroIncident}`);
    expect(a.details.incident_id).toBe(incident);
    expect(a.details.lot_id).toBe(lotIncident);
    expect(a.details.devis_id).toBe(devis);
    expect(a.details.sollicitation_id).toBe(s1);
    expect(a.details.montant_ttc_cents).toBe(48000);
    // Le nom de l'artisan n'est pas copié dans l'alerte : elle ne porte que des identifiants et des montants.
    expect(JSON.stringify(a.details)).not.toContain("Plomberie");
    expect(a.origine_type).toBe("devis");
    expect(a.origine_id).toBe(devis);
  });

  it("le gérant de l'agence la lit, le gérant d'une autre agence et le locataire non", async () => {
    const { s1 } = await consulter();
    await deposer(cptArtisan, s1);
    for (const [compte, attendu] of [[gerant, 1], [autreGerant, 0], [cptLoc, 0]] as const) {
      await agir(compte);
      const { rows } = await db.query(`select id from public.alerts where type = 'devis_a_decider' and organization_id = $1`, [org]);
      expect(rows).toHaveLength(attendu);
    }
  });

  it("un second dépôt refusé ne laisse pas de seconde alerte (même transaction que le dépôt)", async () => {
    const { s1 } = await consulter();
    await deposer(cptArtisan, s1);
    await agir(cptArtisan);
    await expect(
      essai(
        `select public.deposer_devis_structure($1, ${LIGNES(50000)}, 'Diagnostic', 'Travaux', 'Sous 7 jours', 'Une journée', null, null)`,
        [s1]
      )
    ).rejects.toThrow(/n'attend plus de devis/);
    expect(await alertes()).toHaveLength(1);
  });

  it("un dépôt invalide (montant nul) ne crée aucune alerte", async () => {
    const { s1 } = await consulter();
    await agir(cptArtisan);
    await expect(
      essai(`select public.deposer_devis($1, 0, 'Description', null, null, null, null, null)`, [s1])
    ).rejects.toThrow();
    expect(await alertes()).toHaveLength(0);
  });

  it("retenir un devis ferme son alerte et celle de l'autre devis, avec la raison écrite", async () => {
    const { s1, s2 } = await consulter();
    const d1 = await deposer(cptArtisan, s1, 48000);
    const d2 = await deposer(cptArtisan2, s2, 52000);
    expect(await alertes()).toHaveLength(2);
    await agir(gerant);
    await db.query(`select public.retenir_devis($1,$2)`, [org, d1]);
    const [a1] = await alertes(d1);
    const [a2] = await alertes(d2);
    expect(a1.statut).toBe("fermee");
    expect(a1.closed_action).toBe("Devis retenu");
    expect(a1.closed_by).toBe(gerant);
    expect(a1.closed_at).not.toBeNull();
    expect(a2.statut).toBe("fermee");
    expect(a2.closed_action).toBe("Un autre devis a été retenu");
  });

  it("un devis annulé (artisan écarté) ferme son alerte, l'autre reste ouverte", async () => {
    const { s1, s2 } = await consulter();
    const d1 = await deposer(cptArtisan, s1);
    const d2 = await deposer(cptArtisan2, s2);
    await agir(gerant);
    await db.query(`select public.artisan_blacklist_locale($1,$2,'Motif de test suffisamment long')`, [org, artisan]);
    expect((await alertes(d1))[0].statut).toBe("fermee");
    expect((await alertes(d1))[0].closed_action).toBe("Devis annulé");
    expect((await alertes(d2))[0].statut).toBe("ouverte");
  });

  it("un devis expiré ferme son alerte", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await enTantQuePostgres();
    await db.query(`update public.incident_devis set statut = 'expire' where id = $1`, [devis]);
    const [a] = await alertes(devis);
    expect(a.statut).toBe("fermee");
    expect(a.closed_action).toBe("Devis expiré");
  });

  it("clôturer l'incident ferme l'alerte (comportement existant, conservé)", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await agir(gerant);
    await db.query(`select public.cloturer_incident($1,$2,'resolu','Réglé au téléphone')`, [org, incident]);
    expect((await alertes(devis))[0].statut).toBe("fermee");
  });

  it("l'alerte ne se ferme pas tant que le devis attend (aucune autre mise à jour du devis ne la touche)", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await enTantQuePostgres();
    await db.query(`update public.incident_devis set description = description || ' (précision)' where id = $1`, [devis]);
    expect((await alertes(devis))[0].statut).toBe("ouverte");
  });
});
