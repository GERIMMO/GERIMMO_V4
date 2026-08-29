/**
 * Tests d'intégration — Alertes liées à leur événement d'origine (29/08).
 * Une alerte automatique porte la référence de l'objet qui l'a créée et se
 * ferme d'elle-même quand cet objet est traité dans son module, avec un motif,
 * en restant dans l'historique.
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-ao-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Alertes liées à leur événement d'origine", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let proprietaire: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [{ id }],
    } = await db.query(`insert into public.organizations (name, status) values ('AO','active') returning id`);
    org = id;
    gerant = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Prop'),($1,'Loc') returning id, nom`,
      [org]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Prop")!.id;
    locataire = pers.rows.find((p) => p.nom === "Loc")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function alerte(id: string) {
    const {
      rows: [a],
    } = await db.query(
      `select statut, closed_action, closed_by, origine_type, origine_id from public.alerts where id=$1`,
      [id]
    );
    return a as {
      statut: string;
      closed_action: string | null;
      closed_by: string | null;
      origine_type: string | null;
      origine_id: string | null;
    };
  }

  async function insererAlerte(type: string, details: Record<string, unknown>): Promise<string> {
    await db.query("reset role");
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.alerts (organization_id, type, criticite, titre, details)
       values ($1,$2,'normale',$3,$4::jsonb) returning id`,
      [org, type, `Alerte ${type}`, JSON.stringify(details)]
    );
    return id;
  }

  async function document(type = "justificatif"): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,$2::public.document_type,'Doc', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'ao-'||gen_random_uuid())
       returning id`,
      [org, type]
    );
    return id;
  }

  async function lot(): Promise<string> {
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'1 rue AO','appartement'::public.bien_type,'1 rue AO',null,'75001','Paris',1990,false,45,2) as id`,
      [org]
    );
    const {
      rows: [{ id }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [id, org, proprietaire]
    );
    return id;
  }

  async function bailAvecEdlEntree(depot = 900): Promise<string> {
    const l = await lot();
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, depot_garantie, loyer_hc)
       values ($1,$2,$3,$4,700) returning id`,
      [org, l, locataire, depot]
    );
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [org, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    return bail;
  }

  it("l'origine est déduite des détails à l'insertion", async () => {
    const doc = await document("attestation_assurance");
    const id = await insererAlerte("assurance_expiration", { document_id: doc, seuil: "j-30" });
    const a = await alerte(id);
    expect(a.origine_type).toBe("document");
    expect(a.origine_id).toBe(doc);
    // Une alerte manuelle n'a pas d'origine
    const m = await alerte(await insererAlerte("manuelle", {}));
    expect(m.origine_id).toBeNull();
  });

  it("versement au propriétaire : l'appel se ferme, l'écart se signale une fois puis se régularise", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: mandat }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'actif') returning id`,
      [org, proprietaire]
    );
    const {
      rows: [{ id: rapport }],
    } = await db.query(
      `insert into public.rapports_gestion (organization_id, mandat_id, mois, statut, net, envoye_le)
       values ($1,$2,date_trunc('month',current_date)::date,'envoye',100,now()) returning id`,
      [org, mandat]
    );
    const appel = await insererAlerte("versement_proprietaire", { rapport_id: rapport, mandat_id: mandat, net: 100 });

    await simuler(db, gerant);
    await db.query(`select public.enregistrer_versement($1, 90, current_date)`, [rapport]);
    await db.query("reset role");
    const a = await alerte(appel);
    expect(a.statut).toBe("fermee");
    expect(a.closed_action).toMatch(/Versement de 90 €/);
    expect(a.closed_by).toBe(gerant);

    const ecarts = async () =>
      (
        await db.query(
          `select id, statut, details from public.alerts where type='ecart_versement' and origine_id=$1 order by created_at`,
          [rapport]
        )
      ).rows as { id: string; statut: string; details: { verse: number } }[];
    expect((await ecarts()).filter((e) => e.statut === "ouverte")).toHaveLength(1);

    // Deuxième versement encore faux : l'écart se met à jour, ne s'empile pas
    await simuler(db, gerant);
    await db.query(`select public.enregistrer_versement($1, 95, current_date)`, [rapport]);
    await db.query("reset role");
    const ouverts = (await ecarts()).filter((e) => e.statut === "ouverte");
    expect(ouverts).toHaveLength(1);
    expect(Number(ouverts[0].details.verse)).toBe(95);

    // Versement corrigé : l'écart est régularisé
    await simuler(db, gerant);
    await db.query(`select public.enregistrer_versement($1, 100, current_date)`, [rapport]);
    await db.query("reset role");
    const regularise = await alerte(ouverts[0].id);
    expect(regularise.statut).toBe("fermee");
    expect(regularise.closed_action).toMatch(/Écart régularisé/);
  });

  it("diagnostic renouvelé : les alertes d'expiration de l'ancien se ferment", async () => {
    const l = await lot();
    await db.query("reset role");
    const {
      rows: [{ id: ancien }],
    } = await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'dpe',current_date-3600,current_date+10) returning id`,
      [org, l]
    );
    const j30 = await insererAlerte("diagnostic_expiration", { diagnostic_id: ancien, seuil: "j-30", type_diagnostic: "dpe" });
    const j0 = await insererAlerte("diagnostic_expiration", { diagnostic_id: ancien, seuil: "j0", type_diagnostic: "dpe" });

    await simuler(db, gerant);
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'dpe',current_date,current_date+3650)`,
      [org, l]
    );
    await db.query("reset role");
    for (const id of [j30, j0]) {
      const a = await alerte(id);
      expect(a.statut).toBe("fermee");
      expect(a.closed_action).toMatch(/renouvelé/);
    }
  });

  it("attestation remplacée par une nouvelle version : les alertes de l'ancienne se ferment", async () => {
    const ancienne = await document("attestation_assurance");
    const exp = await insererAlerte("assurance_expiration", { document_id: ancienne, seuil: "j-15" });
    const verif = await insererAlerte("attestation_a_verifier", { document_id: ancienne, person_id: locataire });
    const autre = await insererAlerte("manuelle", {});

    await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, remplace_id)
       values ($1,'attestation_assurance','Attestation v2', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'ao-'||gen_random_uuid(),$2)`,
      [org, ancienne]
    );
    expect((await alerte(exp)).statut).toBe("fermee");
    expect((await alerte(verif)).closed_action).toMatch(/Nouvelle version déposée/);
    expect((await alerte(autre)).statut).toBe("ouverte");
  });

  it("restitution : justificatif fourni, retenue retirée, décompte envoyé", async () => {
    const bail = await bailAvecEdlEntree();
    await simuler(db, gerant);
    const {
      rows: [{ id: restitution }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    await db.query(`select public.ajouter_retenue($1,'Peinture',300,7,2,null)`, [restitution]);
    await db.query(`select public.ajouter_retenue($1,'Moquette',200,null,null,null)`, [restitution]);
    await db.query("reset role");
    const retenues = (
      await db.query(`select id, libelle from public.retenues where restitution_id=$1 order by created_at`, [restitution])
    ).rows as { id: string; libelle: string }[];
    const alertes = (
      await db.query(
        `select id, origine_type, origine_id from public.alerts where type='retenue_sans_justificatif' and details->>'restitution_id'=$1`,
        [restitution]
      )
    ).rows as { id: string; origine_type: string; origine_id: string }[];
    expect(alertes).toHaveLength(2);
    // L'alerte porte désormais la retenue elle-même
    expect(alertes.map((a) => a.origine_type)).toEqual(["retenue", "retenue"]);

    // Justificatif joint après coup → l'alerte de cette retenue se ferme, l'autre reste
    const justificatif = await document("justificatif");
    await simuler(db, gerant);
    await db.query(`select public.justifier_retenue($1,$2)`, [retenues[0].id, justificatif]);
    await attendreEchec(db, /déjà un justificatif/, `select public.justifier_retenue($1,$2)`, [retenues[0].id, justificatif]);
    await db.query("reset role");
    const parRetenue = (id: string) => alertes.find((a) => a.origine_id === id)!.id;
    expect((await alerte(parRetenue(retenues[0].id))).closed_action).toMatch(/Justificatif fourni/);
    expect((await alerte(parRetenue(retenues[1].id))).statut).toBe("ouverte");
    const r0 = await db.query(`select sans_justificatif from public.retenues where id=$1`, [retenues[0].id]);
    expect(r0.rows[0].sans_justificatif).toBe(false);

    // Retenue retirée → supprimée pour de bon, alerte fermée
    await simuler(db, gerant);
    await db.query(`select public.supprimer_retenue($1)`, [retenues[1].id]);
    await db.query("reset role");
    const reste = await db.query(`select count(*)::int as n from public.retenues where id=$1`, [retenues[1].id]);
    expect(reste.rows[0].n).toBe(0);
    expect((await alerte(parRetenue(retenues[1].id))).closed_action).toMatch(/retirée/);

    // Décompte : envoi impossible avant finalisation ; finalisé → l'alerte d'envoi
    // se ferme quand l'envoi est enregistré
    await simuler(db, gerant);
    await attendreEchec(db, /finalisé avant/, `select public.marquer_decompte_envoye($1, current_date)`, [restitution]);
    await db.query(`select public.finaliser_decompte($1)`, [restitution]);
    await db.query("reset role");
    const {
      rows: [envoi],
    } = await db.query(
      `select id from public.alerts where type in ('decompte','decompte_lrar') and origine_id=$1 and statut='ouverte'`,
      [restitution]
    );
    expect(envoi).toBeTruthy();
    await simuler(db, gerant);
    await attendreEchec(db, /invalide/, `select public.marquer_decompte_envoye($1, current_date+1)`, [restitution]);
    await db.query(`select public.marquer_decompte_envoye($1, current_date)`, [restitution]);
    await attendreEchec(db, /déjà envoyé/, `select public.marquer_decompte_envoye($1, current_date)`, [restitution]);
    await db.query("reset role");
    expect((await alerte(envoi.id)).closed_action).toMatch(/Décompte envoyé au locataire/);
    const r = await db.query(`select envoye_le from public.restitutions where id=$1`, [restitution]);
    expect(r.rows[0].envoye_le).not.toBeNull();
  });

  it("état des lieux de sortie signé : l'alerte de sortie se ferme", async () => {
    const bail = await bailAvecEdlEntree();
    const sortie = await insererAlerte("edl_sortie", { bail_id: bail, date_effet: "2026-09-30" });
    await simuler(db, gerant);
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'sortie') returning id`,
      [org, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    await db.query("reset role");
    const a = await alerte(sortie);
    expect(a.statut).toBe("fermee");
    expect(a.closed_action).toBe("État des lieux de sortie signé");
  });
});
