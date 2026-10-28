/**
 * Audit final du 28/10/2026 — migration 20261028100600_attestations_et_photos_en_double.sql.
 *  · DOC-04 : le même fichier, déjà actif comme décennale, se dépose aussi comme RC pro (deux pièces actives) ; le même type
 *    le remplace toujours.
 *  · DOC-10 : une photo d'incident déjà connue de l'espace est RATTACHÉE au second dossier (une seule fois), sans fichier
 *    renvoyé ; le locataire ne rattache que ses propres photos ; un document d'un autre type reste refusé.
 *  · DOC-12 : la photo de chantier s'intitule « Photo de chantier après travaux — INC-… ».
 *
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (sinon ignoré).
 */
import { readFileSync } from "node:fs";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "20261028100600_attestations_et_photos_en_double";
const empreinte = (c: string) => c.repeat(64);

describe("attestations et photos en double (fichiers)", () => {
  it("la migration ferme ses fonctions à anon, figure une fois au manifeste et a son retour documenté", () => {
    const sql = readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8");
    expect(sql).toContain("set search_path = ''");
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${MIGRATION}.sql`)).toHaveLength(1);
    const retour = readFileSync(`supabase/retours-arriere/${MIGRATION}.retour.sql`, "utf8");
    expect(retour).toContain("artisan_pieces_empreinte_unique");
    expect(retour).toContain("'Chantier (' || p_moment || ') — ' || v_numero");
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`${MIGRATION}.retour.sql`);
  });
});

describe.skipIf(!DB_URL)("attestations et photos en double (base)", () => {
  let db: Client;
  let org = "", gerant = "", locataire = "", cptArtisan = "", artisan = "";
  let lot = "", personne = "", bail = "";
  let incident1 = "", incident2 = "", incident3 = "", numero1 = "";

  const agir = async (compte: string) => {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
  };
  const enTantQuePostgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', true)");
  };
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
  const nouveauCompte = async (prefixe: string) => {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
       returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  };
  const nouvelIncident = async () => {
    const { rows: [i] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id, canal, categorie,
         description, etat, imputation, imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire','plomberie_canalisation',
         'Fuite sous évier','qualifie','proprietaire','Joint usé') returning id, numero`,
      [org, lot, bail, personne]
    );
    return i as { id: string; numero: string };
  };
  // Hors gérant, la base exige que le fichier ait été déposé par l'appelant (garde_document_fichier_depose).
  const objetDepose = async (nom: string, compte: string) => {
    await enTantQuePostgres();
    await db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('documents', $1, $2, $3)`,
      [nom, compte, { size: 100, mimetype: "image/jpeg" }]);
  };
  const liensIncident = async (incident: string) => {
    const { rows } = await db.query(
      `select document_id from public.document_liens where entite='incident' and entite_id=$1`, [incident]);
    return rows.map((r) => r.document_id as string);
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status) values ('AF double','active') returning id`);
    org = o.id;
    gerant = await nouveauCompte("af-double-gerant");
    locataire = await nouveauCompte("af-double-loc");
    cptArtisan = await nouveauCompte("af-double-artisan");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$3,'admin_agence'),($2,$3,'locataire')`,
      [gerant, locataire, org]);
    const { rows: [b] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`, [org]);
    const { rows: [l] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot 1','loue') returning id`, [b.id, org]);
    lot = l.id;
    const { rows: [p] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom) values ($1,$2,'Martin','Léa') returning id`,
      [org, locataire]);
    personne = p.id;
    const { rows: [bl] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`, [org, lot, personne]);
    bail = bl.id;
    const i1 = await nouvelIncident();
    incident1 = i1.id; numero1 = i1.numero;
    incident2 = (await nouvelIncident()).id;
    incident3 = (await nouvelIncident()).id;
    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, statut_plateforme, siret_etat, visibilite, account_id)
       values ('AF Double Plomberie','48291763500017','0611111111','valide','verifie','privee',$1) returning id`, [cptArtisan]);
    artisan = a.id;
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("DOC-04 : le même fichier vaut pour la décennale ET la RC pro ; le même type le remplace", async () => {
    await agir(cptArtisan);
    const deposer = (type: string, nom: string) => db.query(
      `select public.deposer_ma_piece_artisan($1::public.artisan_piece_type, $2, 'application/pdf', 1000, $3, null, current_date + 300)`,
      [type, `artisans/${artisan}/${nom}.pdf`, empreinte("a")]);
    await deposer("decennale", "d1");
    await deposer("rc_pro", "r1");
    await enTantQuePostgres();
    const actives = async () => (await db.query(
      `select type::text from public.artisan_pieces where artisan_id=$1 and retiree_le is null order by type`, [artisan])).rows.map((r) => r.type);
    expect(await actives()).toEqual(["decennale", "rc_pro"]);
    await agir(cptArtisan);
    await deposer("rc_pro", "r2");
    await enTantQuePostgres();
    expect(await actives()).toEqual(["decennale", "rc_pro"]);
    const { rows } = await db.query(
      `select count(*)::int as n from public.artisan_pieces where artisan_id=$1 and type='rc_pro'`, [artisan]);
    expect(rows[0].n).toBe(2);
  });

  it("DOC-10 : la photo déjà connue est rattachée au second dossier, une seule fois, sans fichier renvoyé", async () => {
    await agir(gerant);
    const { rows: [{ doc }] } = await db.query(
      `select public.joindre_photo_incident($1,$2,$3,'image/jpeg',100,$4) as doc`,
      [org, incident1, `${org}/p1.jpg`, empreinte("b")]);
    const { rows: [{ doc: meme }] } = await db.query(
      `select public.joindre_photo_incident($1,$2,null,'image/jpeg',100,$3) as doc`, [org, incident2, empreinte("b")]);
    expect(meme).toBe(doc);
    // Rejoué (double clic) : pas de second lien.
    await db.query(`select public.joindre_photo_incident($1,$2,null,'image/jpeg',100,$3)`, [org, incident2, empreinte("b")]);
    await enTantQuePostgres();
    expect(await liensIncident(incident1)).toEqual([doc]);
    expect(await liensIncident(incident2)).toEqual([doc]);
    const { rows: ev } = await db.query(
      `select details from public.incident_evenements where incident_id=$1 and type='photo'`, [incident2]);
    expect(ev).toHaveLength(1);
    expect(ev[0].details).toMatchObject({ document_id: doc, deja_connue: true });
    const { rows: docs } = await db.query(`select count(*)::int as n from public.documents where empreinte=$1`, [empreinte("b")]);
    expect(docs[0].n).toBe(1);
  });

  it("DOC-10 : sans fichier et sans photo connue, rien n'est créé", async () => {
    await agir(gerant);
    await expect(essai(`select public.joindre_photo_incident($1,$2,null,'image/jpeg',100,$3)`, [org, incident3, empreinte("c")]))
      .rejects.toThrow(/Photo introuvable/);
  });

  it("DOC-10 : le locataire rattache sa propre photo, jamais celle d'un autre ni un document d'un autre type", async () => {
    // La photo du gérant (empreinte b) n'est pas la sienne.
    for (const n of ["l0", "l1", "l2"]) await objetDepose(`${org}/${n}.jpg`, locataire);
    await agir(locataire);
    await expect(essai(`select public.joindre_photo_incident($1,$2,$3,'image/jpeg',100,$4)`,
      [org, incident3, `${org}/l0.jpg`, empreinte("b")])).rejects.toThrow(/déjà été déposée/);
    const { rows: [{ doc }] } = await db.query(
      `select public.joindre_photo_incident($1,$2,$3,'image/jpeg',100,$4) as doc`, [org, incident1, `${org}/l1.jpg`, empreinte("d")]);
    const { rows: [{ doc: meme }] } = await db.query(
      `select public.joindre_photo_incident($1,$2,$3,'image/jpeg',100,$4) as doc`, [org, incident3, `${org}/l2.jpg`, empreinte("d")]);
    expect(meme).toBe(doc);
    // Un document d'un autre type, même pour le gérant, n'est jamais réutilisé comme photo.
    await enTantQuePostgres();
    await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'bail','Bail signé',$2,'image/jpeg',100,$3)`, [org, `${org}/bail.jpg`, empreinte("e")]);
    await agir(gerant);
    await expect(essai(`select public.joindre_photo_incident($1,$2,null,'image/jpeg',100,$3)`, [org, incident3, empreinte("e")]))
      .rejects.toThrow(/déjà été déposée/);
    await enTantQuePostgres();
    expect(await liensIncident(incident3)).toEqual([doc]);
  });

  it("DOC-12 : la photo de chantier porte un titre en français", async () => {
    await enTantQuePostgres();
    const { rows: [iv] } = await db.query(
      `insert into public.incident_interventions (organization_id, incident_id, artisan_id, nature_travaux, statut)
       values ($1,$2,$3,'entretien_courant','en_cours') returning id`, [org, incident1, artisan]);
    await objetDepose(`${org}/chantier.jpg`, cptArtisan);
    await agir(cptArtisan);
    const { rows: [{ doc }] } = await db.query(
      `select public.deposer_photo_intervention($1,'apres',$2,'image/jpeg',100,$3) as doc`, [iv.id, `${org}/chantier.jpg`, empreinte("f")]);
    await enTantQuePostgres();
    const { rows } = await db.query(`select titre from public.documents where id=$1`, [doc]);
    expect(rows[0].titre).toBe(`Photo de chantier après travaux — ${numero1}`);
  });
});
