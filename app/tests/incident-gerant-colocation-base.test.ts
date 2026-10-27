/**
 * Audit de la PR #264, FL-01 (critique, exposition à un tiers) — l'incident ouvert par le gérant en colocation à baux
 * individuels.
 *
 * Avant 20261027100100, `ouvrir_incident_agence` rattachait l'incident au bail vivant le plus récent du lot et
 * enregistrait son locataire comme déclarant : le colocataire de la chambre B voyait comme le sien l'incident de la
 * chambre A et pouvait en contester l'imputation ; l'occupante de la chambre A ne voyait rien. Désormais : le bail choisi,
 * ou le seul bail vivant du lot, sinon aucun ; jamais de déclarant pour le canal « agence » ; le locataire du bail
 * rattaché garde l'information, la contestation et la réouverture (RM-7.2.4, RM-7.2.5).
 *
 * Une seule transaction pour tout le fichier, annulée à la fin ; la migration (et son retour) y sont joués, d'où le
 * classement en série (vitest.config.ts). Nécessite SUPABASE_DB_URL.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const NOM = "20261027100100_incident_gerant_bail_explicite";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const releve = readFileSync("supabase/retours-arriere/releve-incidents-gerant-colocation.sql", "utf8");

describe.skipIf(!url)("incident ouvert par le gérant : bail choisi ou seul bail en cours, jamais de déclarant (FL-01)", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  /** Comptes et fiches des colocataires A (bail ancien) et B (bail récent), et du locataire d'un lot entier. */
  let compteA: string, compteB: string, compteSeul: string;
  let personneA: string, personneB: string, personneSeul: string;
  let lotColoc: string, lotEntier: string, lotVide: string;
  let bailA: string, bailB: string, bailSeul: string;

  async function compte(prefixe: string): Promise<string> {
    const { rows: [{ id, email }] } = await db.query<{ id: string; email: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(),
         '', '', '', '', '')
       returning id, email`,
      [prefixe]
    );
    await db.query("insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
    return id;
  }
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;

  async function session(compteId: string) {
    await db.query("reset role");
    await db.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
      [compteId]
    );
    await db.query("set local role authenticated");
  }
  async function postgres() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
  async function refus(motif: RegExp, sql: string, args: unknown[] = []) {
    await db.query("savepoint refus");
    await expect(db.query(sql, args)).rejects.toThrow(motif);
    await db.query("rollback to savepoint refus");
  }
  /** Ouvre un incident comme le gérant ; `bail` absent = appel à sept arguments (l'ancien écran). */
  async function ouvrir(lot: string, bail?: string | null): Promise<string> {
    await session(gerant);
    const sql = bail === undefined
      ? "select public.ouvrir_incident_agence($1,$2,'serrurerie_porte','La porte de la chambre A ne ferme plus','Chambre A',null,'normale') as id"
      : "select public.ouvrir_incident_agence($1,$2,'serrurerie_porte','La porte de la chambre A ne ferme plus','Chambre A',null,'normale',$3) as id";
    return id(sql, bail === undefined ? [org, lot] : [org, lot, bail]);
  }
  async function rattachement(incident: string) {
    await postgres();
    return (await db.query<{ bail_id: string | null; declarant_person_id: string | null; canal: string }>(
      "select bail_id, declarant_person_id, canal from public.incidents where id = $1", [incident])).rows[0];
  }
  async function vu(compteId: string, incident: string) {
    await session(compteId);
    return (await db.query<{ id: string; est_declarant: boolean }>(
      "select id, est_declarant from public.mes_incidents_locataire($1) where id = $2", [org, incident])).rows;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    org = await id(`insert into public.organizations (name, status, type)
      values ('Cabinet FL-01', 'active'::public.organization_status, 'agence'::public.organization_type) returning id`);
    gerant = await compte("fl01-gerant");
    compteA = await compte("fl01-coloc-a");
    compteB = await compte("fl01-coloc-b");
    compteSeul = await compte("fl01-seul");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1, $2, 'admin_agence'), ($3, $2, 'locataire'), ($4, $2, 'locataire'), ($5, $2, 'locataire')`,
      [gerant, org, compteA, compteB, compteSeul]
    );
    const mandant = await id("insert into public.persons (organization_id, nom) values ($1, 'Bailleur FL-01') returning id", [org]);
    personneA = await id("insert into public.persons (organization_id, nom, prenom, account_id) values ($1, 'Coloc', 'Alice', $2) returning id", [org, compteA]);
    personneB = await id("insert into public.persons (organization_id, nom, prenom, account_id) values ($1, 'Coloc', 'Benoît', $2) returning id", [org, compteB]);
    personneSeul = await id("insert into public.persons (organization_id, nom, prenom, account_id) values ($1, 'Seul', 'Sami', $2) returning id", [org, compteSeul]);
    const bien = await id(`insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, copropriete)
      values ($1, 'Maison FL-01', 'maison'::public.bien_type, '1 rue de la Colocation', '69001', 'Lyon', false) returning id`, [org]);
    lotColoc = await id(`insert into public.lots (organization_id, bien_id, nom, etat, surface_m2, pieces, meuble, colocation_loyer_reference)
      values ($1, $2, 'Colocation', 'disponible', 90, 4, true, 1000) returning id`, [org, bien]);
    lotEntier = await id(`insert into public.lots (organization_id, bien_id, nom, etat, surface_m2, pieces)
      values ($1, $2, 'Studio', 'disponible', 25, 1) returning id`, [org, bien]);
    lotVide = await id(`insert into public.lots (organization_id, bien_id, nom, etat, surface_m2, pieces)
      values ($1, $2, 'Lot vacant', 'disponible', 30, 1) returning id`, [org, bien]);
    for (const lot of [lotColoc, lotEntier, lotVide]) {
      await db.query("insert into public.detentions (organization_id, lot_id, person_id, quote_part) values ($1, $2, $3, 100)", [org, lot, mandant]);
    }
    const chambreA = await id(`insert into public.lot_chambres (organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
      values ($1, $2, 'Chambre A', 12, 30, 'Meublée', 'Cuisine') returning id`, [org, lotColoc]);
    const chambreB = await id(`insert into public.lot_chambres (organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
      values ($1, $2, 'Chambre B', 11, 28, 'Meublée', 'Cuisine') returning id`, [org, lotColoc]);
    const bail = (lot: string, personne: string, chambre: string | null, type: string, loyer: number) => id(
      `insert into public.baux (organization_id, lot_id, type, etat, locataire_principal, chambre_id, date_debut, loyer_hc, charges, depot_garantie, jour_echeance)
       values ($1, $2, $3::public.bail_type, 'brouillon', $4, $5, date '2026-01-01', $6, 50, 800, 5) returning id`,
      [org, lot, type, personne, chambre, loyer]);
    bailA = await bail(lotColoc, personneA, chambreA, "colocation", 450);
    bailB = await bail(lotColoc, personneB, chambreB, "colocation", 420);
    bailSeul = await bail(lotEntier, personneSeul, null, "meuble", 500);
    await db.query("update public.baux set etat = 'actif' where id = any($1::uuid[])", [[bailA, bailB, bailSeul]]);
    // Le bail de B est le plus récent : c'est lui que l'ancienne règle choisissait.
    await db.query("update public.baux set created_at = now() - interval '300 days' where id = $1", [bailA]);
    await db.query("update public.baux set created_at = now() - interval '200 days' where id = $1", [bailB]);
    // La base de test peut précéder la migration : on la joue ici, dans la transaction du fichier.
    await db.query(migration);
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("reset role");
  });

  it("colocation, aucune chambre choisie : l'incident reste sur le lot, sans bail ni déclarant, vu d'aucun colocataire", async () => {
    for (const incident of [await ouvrir(lotColoc), await ouvrir(lotColoc, null)]) {
      expect(await rattachement(incident)).toEqual({ bail_id: null, declarant_person_id: null, canal: "agence" });
      expect(await vu(compteA, incident)).toEqual([]);
      expect(await vu(compteB, incident)).toEqual([]);
    }
  });

  it("chambre A choisie : seule A le voit, comme le sien ; B ne le voit pas et ne peut pas contester, A le peut", async () => {
    const incident = await ouvrir(lotColoc, bailA);
    expect(await rattachement(incident)).toEqual({ bail_id: bailA, declarant_person_id: null, canal: "agence" });
    expect(await vu(compteA, incident)).toEqual([{ id: incident, est_declarant: true }]);
    expect(await vu(compteB, incident)).toEqual([]);

    await session(gerant);
    await db.query("select public.qualifier_incident($1, $2, 'degradation_fautive', 'Porte de la chambre A forcée')", [org, incident]);
    await session(compteB);
    await refus(/Incident introuvable/, "select public.contester_imputation($1, $2, 'Ce n''est pas ma chambre')", [org, incident]);
    await session(compteA);
    await db.query("select public.contester_imputation($1, $2, 'La porte était déjà abîmée à mon entrée')", [org, incident]);
    await postgres();
    const { rows: [i] } = await db.query("select imputation_contestation from public.incidents where id = $1", [incident]);
    expect(i.imputation_contestation).toBe("La porte était déjà abîmée à mon entrée");
  });

  it("un bail qui n'est pas en cours sur ce lot est refusé : celui d'un autre lot, ou un brouillon", async () => {
    await session(gerant);
    await refus(/pas en cours sur ce lot/,
      "select public.ouvrir_incident_agence($1,$2,'serrurerie_porte','Test','Chambre A',null,'normale',$3)", [org, lotColoc, bailSeul]);
    await postgres();
    await db.query("update public.baux set etat = 'brouillon' where id = $1", [bailB]);
    await session(gerant);
    await refus(/pas en cours sur ce lot/,
      "select public.ouvrir_incident_agence($1,$2,'serrurerie_porte','Test','Chambre B',null,'normale',$3)", [org, lotColoc, bailB]);
  });

  it("seul bail en cours du lot : rattaché sans choix, sans déclarant ; son locataire le voit, conteste et rouvre", async () => {
    const incident = await ouvrir(lotEntier);
    expect(await rattachement(incident)).toEqual({ bail_id: bailSeul, declarant_person_id: null, canal: "agence" });
    expect(await vu(compteSeul, incident)).toEqual([{ id: incident, est_declarant: true }]);
    expect(await vu(compteA, incident)).toEqual([]);

    await session(gerant);
    await db.query("select public.qualifier_incident($1, $2, 'locataire', 'Décret 87-712')", [org, incident]);
    await session(compteSeul);
    await db.query("select public.contester_imputation($1, $2, 'Usure normale')", [org, incident]);
    await session(gerant);
    await db.query("select public.qualifier_incident($1, $2, 'proprietaire', 'Vétusté reconnue')", [org, incident]);
    await db.query("select public.cloturer_incident($1, $2, 'resolu', 'Serrure changée')", [org, incident]);
    // Un colocataire étranger au bail ne rouvre pas ; le locataire du bail, oui.
    await session(compteA);
    await refus(/Accès refusé/, "select public.rouvrir_incident($1, $2, 'Toujours cassé')", [org, incident]);
    await session(compteSeul);
    await db.query("select public.rouvrir_incident($1, $2, 'La serrure accroche de nouveau')", [org, incident]);
    await postgres();
    expect((await db.query("select etat from public.incidents where id = $1", [incident])).rows[0].etat).toBe("rouvert");
  });

  it("lot sans bail en cours : ni bail ni déclarant, comme avant", async () => {
    expect(await rattachement(await ouvrir(lotVide))).toEqual({ bail_id: null, declarant_person_id: null, canal: "agence" });
  });

  it("la déclaration du locataire ne change pas : il en reste le déclarant, son colocataire de bail commun n'agit pas", async () => {
    await session(compteA);
    const incident = await id(
      "select public.declarer_mon_incident($1, 'plomberie_joint', 'Fuite sous le lavabo', null, null, 'normale') as id", [org]);
    expect(await rattachement(incident)).toEqual({ bail_id: bailA, declarant_person_id: personneA, canal: "espace_locataire" });
    expect(await vu(compteA, incident)).toEqual([{ id: incident, est_declarant: true }]);
    expect(await vu(compteB, incident)).toEqual([]);
  });

  it("une seule signature, SECURITY DEFINER, search_path vide ; le titulaire n'est pas appelable par un compte", async () => {
    const { rows } = await db.query(
      `select p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authentifie
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('ouvrir_incident_agence', 'titulaire_incident')
       order by 1`
    );
    expect(rows).toEqual([
      { signature: "ouvrir_incident_agence(uuid,uuid,text,text,text,text,incident_urgence,uuid)", prosecdef: true,
        proconfig: ['search_path=""'], anon: false, authentifie: true },
      { signature: "titulaire_incident(uuid,incident_canal,uuid)", prosecdef: true,
        proconfig: ['search_path=""'], anon: false, authentifie: false },
    ]);
  });

  it("le relevé (lecture seule) liste l'incident rattaché par l'ancienne règle, pas ceux d'après la migration", async () => {
    const choisi = await ouvrir(lotColoc, bailA);
    await postgres();
    // L'état que laissait l'ancienne règle : bail le plus récent (B) et son locataire comme déclarant.
    const ancien = await id(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id, canal, categorie, description)
       values ($1, 'INC-FL01-ANCIEN', $2, $3, $4, 'agence', 'serrurerie_porte', 'Porte de la chambre A') returning id`,
      [org, lotColoc, bailB, personneB]);
    const resultats = (await db.query(releve)) as unknown as { rows: Record<string, unknown>[] }[];
    const liste = resultats[1].rows.filter((r) => r.organization_id === org);
    expect(liste.map((r) => r.incident_id)).toEqual([ancien]);
    expect(liste[0]).toMatchObject({ bail_rattache: bailB, autres_baux_en_cours: "1" });
    expect(liste.map((r) => r.incident_id)).not.toContain(choisi);
  });

  it("avant / après : le retour rétablit le défaut (bail le plus récent, colocataire B déclarant), la migration rejouée deux fois le referme", async () => {
    await postgres();
    await db.query(retour);
    // Le défaut FL-01, rejoué : l'incident de la chambre A part chez B, qui le voit et peut le contester.
    const avant = await ouvrir(lotColoc);
    expect(await rattachement(avant)).toEqual({ bail_id: bailB, declarant_person_id: personneB, canal: "agence" });
    expect(await vu(compteB, avant)).toEqual([{ id: avant, est_declarant: true }]);
    expect(await vu(compteA, avant)).toEqual([]);
    await postgres();
    await db.query(migration);
    await db.query(migration);
    const apres = await ouvrir(lotColoc);
    expect(await rattachement(apres)).toEqual({ bail_id: null, declarant_person_id: null, canal: "agence" });
    expect(await vu(compteB, apres)).toEqual([]);
  });
});
