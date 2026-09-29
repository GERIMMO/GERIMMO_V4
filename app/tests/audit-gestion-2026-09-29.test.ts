/**
 * Audit des flux de gestion du 29/09 — non-régression en base
 * (migration 20260929130000_audit_gestion.sql).
 *
 *  · régularisation : colocation à contrats individuels, prescription
 *    triennale, régularisation tardive payable par douzièmes ;
 *  · agence : ni location ni encaissement sans mandat en cours ;
 *  · EDL : la signature exige sa preuve ;
 *  · zone tendue inconnue : le préavis d'un mois du locataire est accepté,
 *    marqué à vérifier.
 *
 * Transaction annulée à la fin de chaque test. Nécessite SUPABASE_DB_URL.
 */
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit gestion du 29/09 — corrections en base", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let bien: string;
  const annee = new Date().getFullYear();

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  beforeEach(async () => {
    await db.query("begin");
    await db.query("reset role");
    org = (await un(`insert into public.organizations (name, status) values ('Audit 29/09','active') returning id`)).id;
    gerant = (
      await un(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
           'audit29-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
         returning id`
      )
    ).id;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`, [
      gerant,
      org,
    ]);
    bien = (
      await un(
        `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
         values ($1,'Bien audit 29','appartement'::public.bien_type,'1 rue A','69003','Lyon') returning id`,
        [org]
      )
    ).id;
  });

  async function un(sql: string, params: unknown[] = []): Promise<Record<string, string>> {
    const { rows } = await db.query(sql, params);
    return rows[0];
  }

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  async function echoue(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint essai");
    try {
      await expect(db.query(sql, params)).rejects.toThrow(motif);
    } finally {
      await db.query("rollback to savepoint essai");
    }
  }

  async function personne(nom: string): Promise<string> {
    await db.query("reset role");
    return (await un(`insert into public.persons (organization_id, nom, prenom) values ($1,$2,'Test') returning id`, [org, nom])).id;
  }

  async function lot(champs: Record<string, unknown> = {}): Promise<string> {
    await db.query("reset role");
    const donnees: Record<string, unknown> = {
      organization_id: org,
      bien_id: bien,
      nom: "Lot " + Math.random().toString(36).slice(2),
      etat: "loue",
      surface_m2: 80,
      ...champs,
    };
    const cols = Object.keys(donnees);
    return (
      await un(
        `insert into public.lots (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
        Object.values(donnees)
      )
    ).id;
  }

  async function bail(champs: Record<string, unknown>): Promise<string> {
    await db.query("reset role");
    const donnees: Record<string, unknown> = {
      organization_id: org,
      type: "nu",
      etat: "actif",
      loyer_hc: 600,
      charges: 50,
      jour_echeance: 5,
      ...champs,
    };
    if (!donnees.locataire_principal) donnees.locataire_principal = await personne("Locataire");
    const cols = Object.keys(donnees);
    return (
      await un(
        `insert into public.baux (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
        Object.values(donnees)
      )
    ).id;
  }

  async function justificatif(): Promise<string> {
    await db.query("reset role");
    return (
      await un(
        `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
         values ($1::uuid,'justificatif','Décompte',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text)
         returning id`,
        [org]
      )
    ).id;
  }

  // ——— 1. Régularisation ———

  it("colocation à contrats individuels : 3 contrats, 1 200 € de charges → 1 200 € au total", async () => {
    const l = await lot({ colocation_loyer_reference: 1500 });
    const chambres = (
      await db.query(
        `insert into public.lot_chambres (organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
         values ($1,$2,'A',10,25,'Chambre A','Cuisine'),($1,$2,'B',10,25,'Chambre B','Cuisine'),($1,$2,'C',20,50,'Chambre C','Cuisine')
         returning id, surface_m2`,
        [org, l]
      )
    ).rows;
    const baux: string[] = [];
    for (const c of chambres) {
      baux.push(
        await bail({
          lot_id: l,
          chambre_id: c.id,
          type: "colocation",
          loyer_hc: 400,
          date_debut: `${annee - 1}-01-01`,
        })
      );
    }
    for (const b of baux) {
      const doc = await justificatif();
      await enGerant();
      await db.query(`select public.regulariser_charges($1,$2,1200,$3)`, [b, annee - 1, doc]);
    }
    await db.query("reset role");
    const { rows } = await db.query(
      `select charges_reelles, quote_part_colocation from public.regularisations_charges where bail_id = any($1) order by charges_reelles`,
      [baux]
    );
    expect(rows.map((r) => Number(r.charges_reelles))).toEqual([300, 300, 600]);
    expect(rows.reduce((s, r) => s + Number(r.charges_reelles), 0)).toBe(1200);
    expect(Number(rows[0].quote_part_colocation)).toBe(0.25);
  });

  it("prescription triennale : complément refusé au-delà de trois ans, trop-perçu toujours rendu", async () => {
    const vieux = annee - 4;
    const b1 = await bail({ lot_id: await lot(), date_debut: `${vieux - 1}-01-01` });
    const doc1 = await justificatif();
    await enGerant();
    await echoue(/prescrit/, `select public.regulariser_charges($1,$2,100,$3)`, [b1, vieux, doc1]);

    const b2 = await bail({ lot_id: await lot(), date_debut: `${vieux - 1}-01-01` });
    await db.query("reset role");
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
       values ($1,$2,$3,600,50,650,$3)`,
      [org, b2, `${vieux}-03-01`]
    );
    const doc2 = await justificatif();
    await enGerant();
    const {
      rows: [{ ecart }],
    } = await db.query(`select public.regulariser_charges($1,$2,0,$3) as ecart`, [b2, vieux, doc2]);
    expect(Number(ecart)).toBe(50);
  });

  it("régularisation tardive : le complément s'étale sur 12 mois ; à temps, l'étalement est refusé", async () => {
    const b = await bail({ lot_id: await lot(), date_debut: `${annee - 3}-01-01` });
    const doc = await justificatif();
    await enGerant();
    const {
      rows: [{ ecart }],
    } = await db.query(`select public.regulariser_charges($1,$2,1200,$3,null,true) as ecart`, [b, annee - 2, doc]);
    expect(Number(ecart)).toBe(-1200);
    await db.query("reset role");
    const {
      rows: [r],
    } = await db.query(`select tardive, etalement_12_mois from public.regularisations_charges where bail_id=$1`, [b]);
    expect(r.tardive).toBe(true);
    const lignes = r.etalement_12_mois as { rang: number; montant: number }[];
    expect(lignes).toHaveLength(12);
    expect(lignes.reduce((s, x) => s + Number(x.montant), 0)).toBeCloseTo(1200, 2);

    const recent = await bail({ lot_id: await lot(), date_debut: `${annee - 1}-01-01` });
    const doc2 = await justificatif();
    await enGerant();
    await echoue(/réservé à une régularisation tardive/, `select public.regulariser_charges($1,$2,600,$3,null,true)`, [
      recent,
      annee - 1,
      doc2,
    ]);
  });

  // ——— 3. Mandat ———

  it("agence : sans mandat en cours, ni mise en location ni encaissement", async () => {
    const loc = await personne("Durand");
    const l = await lot({ etat: "disponible" });
    const brouillon = await bail({
      lot_id: l,
      etat: "brouillon",
      locataire_principal: loc,
      date_debut: `${annee}-01-01`,
    });
    await enGerant();
    await echoue(/aucun mandat de gestion en cours/, `select public.controler_mise_en_location($1)`, [brouillon]);

    const actif = await bail({ lot_id: await lot() });
    await enGerant();
    await echoue(
      /Encaissement refusé/,
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,100,current_date)`,
      [org, actif]
    );
    await couvrirParMandat(db, actif);
    await enGerant();
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,100,current_date)`,
      [org, actif]
    );

    // Le propriétaire direct gère son propre bien : aucun mandat n'est exigé.
    await db.query("reset role");
    // (réservé au super admin en temps normal : déclencheurs suspendus le temps du banc)
    await db.query("set local session_replication_role = replica");
    await db.query(`update public.organizations set type='proprietaire_direct' where id=$1`, [org]);
    await db.query("set local session_replication_role = origin");
    const direct = await bail({ lot_id: await lot() });
    await enGerant();
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,100,current_date)`,
      [org, direct]
    );
  });

  // ——— 4. EDL ———

  it("EDL : la signature exige une preuve déposée (PDF signé ou constat de commissaire de justice)", async () => {
    const b = await bail({ lot_id: await lot(), date_debut: `${annee}-01-01` });
    await db.query("reset role");
    const edl = (
      await un(`insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`, [
        org,
        b,
      ])
    ).id;
    await enGerant();
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon' where edl_id=$1`, [edl]);

    await echoue(/Preuve de signature obligatoire/, `select public.signer_edl($1,'pdf_signe',null)`, [edl]);
    await echoue(/Indiquez la preuve/, `select public.signer_edl($1,null,null)`, [edl]);
    // Le PATCH direct de l'API ne contourne plus la fonction
    await echoue(/ne se signe qu'avec sa preuve/, `update public.etats_des_lieux set etat='signe' where id=$1`, [edl]);

    await db.query(
      `select public.signer_edl_avec_preuve($1,'constat_commissaire',$2::text||'/constat-'||gen_random_uuid()||'.pdf','application/pdf',2048,gen_random_uuid()::text)`,
      [edl, org]
    );
    await db.query("reset role");
    const {
      rows: [e],
    } = await db.query(
      `select e.etat, e.signature_mode, d.type as type_document,
              exists (select 1 from public.document_liens l where l.document_id = d.id and l.entite='bail' and l.entite_id=e.bail_id) as lie_au_bail
         from public.etats_des_lieux e join public.documents d on d.id = e.preuve_signature_document
        where e.id=$1`,
      [edl]
    );
    expect(e).toEqual({ etat: "signe", signature_mode: "constat_commissaire", type_document: "etat_des_lieux", lie_au_bail: true });
  });

  // ——— 7. Zone tendue ———

  it("zone tendue inconnue : jamais « non » par défaut, alerte à l'activation", async () => {
    await db.query("reset role");
    const {
      rows: [z],
    } = await db.query(`select zone_tendue from public.biens where id=$1`, [bien]);
    expect(z.zone_tendue).toBeNull();
    const b = await bail({ lot_id: await lot(), etat: "brouillon", date_debut: `${annee}-01-01` });
    await db.query("reset role");
    await db.query(`update public.baux set etat='actif' where id=$1`, [b]);
    const {
      rows: [bz],
    } = await db.query(`select zone_tendue from public.baux where id=$1`, [b]);
    expect(bz.zone_tendue).toBeNull();
    const { rows } = await db.query(
      `select titre from public.alerts where organization_id=$1 and type='zone_tendue_a_verifier' and details->>'bail_id'=$2`,
      [org, b]
    );
    expect(rows).toHaveLength(1);
  });

  it("zone tendue inconnue : le congé du locataire à 1 mois est accepté, marqué à vérifier", async () => {
    const b = await bail({ lot_id: await lot(), date_debut: `${annee - 1}-01-01` });
    await enGerant();
    await db.query(`select public.enregistrer_conge($1,'locataire',current_date,1::smallint,null,null)`, [b]);
    await db.query("reset role");
    const {
      rows: [c],
    } = await db.query(`select preavis_mois, zone_tendue_a_verifier from public.conges where bail_id=$1`, [b]);
    expect(c).toEqual({ preavis_mois: 1, zone_tendue_a_verifier: true });
    const { rows } = await db.query(
      `select 1 from public.alerts where organization_id=$1 and type='zone_tendue_a_verifier' and details->>'bail_id'=$2`,
      [org, b]
    );
    expect(rows).toHaveLength(1);
  });

  it("hors zone tendue déclarée : le préavis d'un mois exige toujours un justificatif", async () => {
    await db.query("reset role");
    await db.query(`update public.biens set zone_tendue=false where id=$1`, [bien]);
    const b = await bail({ lot_id: await lot(), date_debut: `${annee - 1}-01-01` });
    await enGerant();
    await echoue(/justificatif est obligatoire/, `select public.enregistrer_conge($1,'locataire',current_date,1::smallint,null,null)`, [b]);
  });
});
