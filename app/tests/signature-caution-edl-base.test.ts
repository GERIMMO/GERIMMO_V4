/**
 * Plan de conformité du 23/10/2026, lot 1D, tel que la décision du dirigeant du 23/10 « Cautionnement et état des lieux
 * signés dans Gerimmo » le remplace : migration 20261024120000_signature_caution_mobile_et_edl_sur_place.sql et son
 * retour arrière.
 *
 * Sans base : conventions des fichiers (rejouable sans transaction interne, fermeture à anon, retour atomique nommé,
 * manifeste, LISEZ-MOI, classement en série).
 *
 * Sur une vraie base (SUPABASE_DB_URL), dans une transaction annulée à la fin, la migration rejouée d'abord :
 *  · lien de la caution : jeton gardé en empreinte, un seul lien ouvert par acte (le précédent est annulé), cinq par
 *    jour au plus, propriétaire actif seulement, acte de cautionnement prêt seulement ;
 *  · consommation : le numéro saisi par la caution remplace celui du bailleur sur le seul garant ; lien réutilisé,
 *    expiré, annulé, inconnu, ou acte qui n'est plus prêt : refusés ;
 *  · garde de l'envoi : un cautionnement ne part jamais avec le numéro saisi par le bailleur, un état des lieux jamais
 *    sans la confirmation « établi contradictoirement, sur place » de moins d'une heure ;
 *  · garant qui signe aussi le bail (décision du 24/10) : jamais le numéro saisi par le bailleur ni une coordonnée d'une
 *    autre partie ; numéro confirmé pour l'acte de cautionnement du même bail repris sans lien ; un lien par garant, le
 *    bail part quand tous ont confirmé ; renvoi, limite par garant et par bail, expiration, clôture des liens ;
 *  · droits : ni anon ni authenticated ne lisent la table ni n'appellent les fonctions ; une ligne close ne change plus ;
 *  · retour arrière : table vide retirée, rejeu sans effet, table non vide conservée, colonne conservée, marche avant.
 * Rejoue la migration et son retour (DDL) : classé en série (vitest.config.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.includes("ci_"))) throw new Error("Une base CI locale fictive est obligatoire.");
const VERSION = "20261024120000";
const NOM = `${VERSION}_signature_caution_mobile_et_edl_sur_place`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");
const jeton = () => randomBytes(32).toString("base64url");

describe("confirmation du mobile de la caution et de l'état des lieux sur place — fichiers (sans base)", () => {
  it("la migration est rejouable sans transaction interne, sans jour de Paris nommé, et ferme les fonctions à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code).not.toContain("aujourdhui_paris");
    expect(code).not.toMatch(/security definer/);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    // Le jeton n'est jamais une colonne : seule son empreinte est gardée.
    expect(code).not.toMatch(/\bjeton\s+text\b/);
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version d'historique et garde la colonne", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where left(version, 14) = '${VERSION}'`);
    expect(RETOUR.replace(/--.*$/gm, "")).not.toMatch(/drop column/i);
  });

  it("manifeste, procédure de retour et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261024090000_versions_conditions_et_archives_comptes.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/signature-caution-edl-base.test.ts"');
  });
});

describe.skipIf(!url)("confirmation du mobile de la caution et de l'état des lieux sur place (avec base)", () => {
  let db: Client;
  let org = "", owner = "", autre = "", bail = "", doc = "", circuit = "", lot = "";
  const MOBILE_BAILLEUR = "+33600000009";
  const MOBILE_CAUTION = "+33611223344";
  const parties = (telephoneGarant: string) => [
    { personId: "garant", qualite: "Garant", prenom: "Gaston", nom: "Garant", email: "gaston@example.invalid", telephone: telephoneGarant, mentionCaution: "mention" },
    { personId: "owner", qualite: "Propriétaire", prenom: "Paule", nom: "Proprio", email: "paule@example.invalid", telephone: "+33600000002" },
  ];
  const id = async (sql: string, params: unknown[] = []) => String((await db.query(sql, params)).rows[0].id);

  async function serviceRole() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true)");
    await db.query("set local role service_role");
  }
  async function role(r: "anon" | "authenticated", sub?: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: r, ...(sub ? { sub, aal: "aal2" } : {}) })]);
    await db.query(`set local role ${r}`);
  }
  async function proprietaireBase() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
  /** Le message d'une requête attendue en échec, sans avorter la transaction ; « » si elle passe. */
  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      return (e as Error).message;
    }
  }
  const demander = (j: string, acteur = owner, c = circuit) =>
    db.query<{ expire: Date }>("select public.demander_confirmation_mobile_caution($1, $2, $3) as expire", [c, acteur, empreinte(j)]);
  const consommer = (j: string, telephone = MOBILE_CAUTION) =>
    db.query("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(j), telephone]);
  const reserver = (c = circuit) => db.query("select (public.reserver_envoi_signature_bail($1, $2)).id", [c, owner]);
  const garant = async (c = circuit) =>
    (await db.query("select s from public.bail_signature_circuits, jsonb_array_elements(signataires) s where id = $1 and s->>'qualite' = 'Garant'", [c])).rows[0].s;
  async function circuitEdl() {
    await proprietaireBase();
    // « Établi le 01/10/2026 » : la date de la visite confirmée doit être celle-là (relecture du 24/10).
    const edl = await id("insert into public.etats_des_lieux(organization_id,bail_id,type,date_edl) values($1,$2,'entree','2026-10-01') returning id", [org, bail]);
    await db.query("insert into public.edl_lignes(organization_id,edl_id,libelle,etat) values($1,$2,'Porte','bon')", [org, edl]);
    await db.query("update public.documents set type='etat_des_lieux' where id=$1", [doc]);
    await db.query(
      "update public.bail_signature_circuits set modele='edl', cible_id=$2, options='{}'::jsonb, signataires=$3 where id=$1",
      [circuit, edl, JSON.stringify([{ ...parties("+33600000001")[0], qualite: "Locataire" }, parties("")[1]])],
    );
    return edl;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(MIGRATION);
    // Finitions du 24/10 (relecture transverse 2, point 4) : le retour refuse tant qu'une migration plus récente du plan
    // de conformité est inscrite (la base de la CI les inscrit toutes). Retirées de l'historique, dans la transaction
    // du fichier, annulée à la fin.
    await db.query("delete from supabase_migrations.schema_migrations where left(version, 14) > $1 and left(version, 14) <= '20261024140000'", [VERSION]);
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
    await proprietaireBase();
    await db.query("update public.signature_budget set plafond_demi_credits = 800");
    org = await id("insert into public.organizations(name,type,status) values('Essai caution fictif','proprietaire_direct','active') returning id");
    owner = await id("insert into auth.users(id,email) values(gen_random_uuid(), gen_random_uuid()||'@example.invalid') returning id");
    autre = await id("insert into auth.users(id,email) values(gen_random_uuid(), gen_random_uuid()||'@example.invalid') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [owner, org]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id", [org, bien]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Test','Alice','alice@example.invalid') returning id", [org]);
    bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',current_date,500,20) returning id", [org, lot, locataire]);
    doc = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Acte fictif',$1::uuid::text||'/acte.pdf','application/pdf',100,repeat('a',64)) returning id", [org]);
    circuit = await id(
      "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,options) values($1,$2,$3,$4,'production',repeat('b',64),repeat('a',64),$5,'zoho','cautionnement',jsonb_build_object('garant','garant')) returning id",
      [org, bail, doc, owner, JSON.stringify(parties(MOBILE_BAILLEUR))],
    );
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
  });

  describe("lien envoyé à la caution", () => {
    it("garde l'empreinte du jeton, jamais le jeton, avec une échéance de sept jours au plus", async () => {
      const j = jeton();
      await serviceRole();
      const { rows: [{ expire }] } = await demander(j);
      await proprietaireBase();
      const ligne = (await db.query("select * from public.confirmations_mobile_caution where circuit_id = $1", [circuit])).rows[0];
      expect(ligne.jeton_empreinte).toBe(empreinte(j));
      expect(JSON.stringify(ligne)).not.toContain(j);
      expect(new Date(expire).getTime() - new Date(ligne.cree_le).getTime()).toBeLessThanOrEqual(7 * 86_400_000);
      expect((await db.query("select count(*)::int n from public.audit_log where action='signature_caution_mobile_demande' and details->>'circuit_id'=$1", [circuit])).rows[0].n).toBe(1);
    });

    it("un nouveau lien annule le précédent, qui ne sert plus", async () => {
      const premier = jeton(), second = jeton();
      await serviceRole();
      await demander(premier);
      await demander(second);
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(premier), MOBILE_CAUTION])).toMatch(/plus valable/);
      await consommer(second);
      expect((await garant()).telephone).toBe(MOBILE_CAUTION);
    });

    it("refuse un autre compte que le propriétaire, un autre acte, un acte déjà envoyé, et plus de cinq liens par jour", async () => {
      await serviceRole();
      expect(await echec("select public.demander_confirmation_mobile_caution($1, $2, $3)", [circuit, autre, empreinte(jeton())])).toMatch(/Accès refusé/);
      for (let i = 0; i < 5; i++) await demander(jeton());
      expect(await echec("select public.demander_confirmation_mobile_caution($1, $2, $3)", [circuit, owner, empreinte(jeton())])).toMatch(/Cinq liens/);
      await proprietaireBase();
      await db.query("update public.bail_signature_circuits set modele = 'avenant' where id = $1", [circuit]);
      await serviceRole();
      expect(await echec("select public.demander_confirmation_mobile_caution($1, $2, $3)", [circuit, owner, empreinte(jeton())])).toMatch(/Seul un acte de cautionnement/);
      await proprietaireBase();
      // Un avenant peut partir sans confirmation : on le marque envoyé, puis on lui rend son modèle.
      await db.query("update public.bail_signature_circuits set etat = 'en_cours' where id = $1", [circuit]);
      await db.query("update public.bail_signature_circuits set modele = 'cautionnement' where id = $1", [circuit]);
      await serviceRole();
      expect(await echec("select public.demander_confirmation_mobile_caution($1, $2, $3)", [circuit, owner, empreinte(jeton())])).toMatch(/déjà été envoyé/);
    });
  });

  describe("confirmation par la caution", () => {
    it("pose le numéro saisi par la caution sur le seul garant, une seule fois", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      const { rows: [r] } = await consommer(j);
      expect(r).toMatchObject({ circuit_id: circuit, organization_id: org, demande_par: owner });
      const g = await garant();
      expect(g.telephone).toBe(MOBILE_CAUTION);
      expect(g.telephone).not.toBe(MOBILE_BAILLEUR);
      expect(g.telephoneConfirmeLe).toBeTruthy();
      const proprio = (await db.query("select s from public.bail_signature_circuits, jsonb_array_elements(signataires) s where id=$1 and s->>'qualite'='Propriétaire'", [circuit])).rows[0].s;
      expect(proprio.telephone).toBe("+33600000002");
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(j), "+33699999999"])).toMatch(/déjà été utilisé/);
      expect((await garant()).telephone).toBe(MOBILE_CAUTION);
    });

    it("refuse un lien expiré, inconnu, un numéro mal formé, et un acte qui n'est plus prêt", async () => {
      const expire = jeton();
      await proprietaireBase();
      await db.query(
        "insert into public.confirmations_mobile_caution(organization_id,circuit_id,garant_id,acte,jeton_empreinte,demande_par,cree_le,expire_le) values($1,$2,'garant','cautionnement',$3,$4,now()-interval '8 days',now()-interval '1 day')",
        [org, circuit, empreinte(expire), owner],
      );
      await serviceRole();
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(expire), MOBILE_CAUTION])).toMatch(/expiré/);
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(jeton()), MOBILE_CAUTION])).toMatch(/plus valable/);
      const j = jeton();
      await demander(j);
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(j), "0611223344"])).toMatch(/numéro de mobile valide/);
      await proprietaireBase();
      await db.query("update public.bail_signature_circuits set etat = 'annule' where id = $1", [circuit]);
      await serviceRole();
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(j), MOBILE_CAUTION])).toMatch(/plus valable/);
      expect((await garant()).telephone).toBe(MOBILE_BAILLEUR);
    });

    it("finitions du 24/10 (I7) : la preuve de la confirmation ne part pas avec le compte du bailleur qui a envoyé le lien", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      await consommer(j);
      await proprietaireBase();
      expect(await db.query("select confdeltype from pg_constraint where conrelid = 'public.confirmations_mobile_caution'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass").then((r) => r.rows))
        .toEqual([{ confdeltype: "a" }]);
      // Supprimer le compte du demandeur échoue (le ménage des fermetures le laisse alors neutralisé) ; la preuve reste.
      // Le circuit est rattaché à un autre auteur : seule la confirmation retient le compte.
      await db.query("alter table public.bail_signature_circuits disable trigger user");
      await db.query("update public.bail_signature_circuits set created_by = $2 where id = $1", [circuit, autre]);
      await db.query("alter table public.bail_signature_circuits enable trigger user");
      expect(await echec("delete from auth.users where id = $1", [owner])).toMatch(/confirmations_mobile_caution/);
      expect((await db.query("select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1 and utilise_le is not null", [circuit])).rows[0].n).toBe(1);
      // Elle part avec son circuit (cascade), jamais avec le demandeur.
      await db.query("alter table public.bail_signature_circuits disable trigger user");
      await db.query("delete from public.bail_signature_circuits where id = $1", [circuit]);
      await db.query("alter table public.bail_signature_circuits enable trigger user");
      expect((await db.query("select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1", [circuit])).rows[0].n).toBe(0);
    });

    it("une ligne close ne change plus, et une ligne ouverte ne change pas d'échéance", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      expect(await echec("update public.confirmations_mobile_caution set expire_le = expire_le + interval '1 day' where circuit_id = $1", [circuit])).toMatch(/ne se modifie pas/);
      await consommer(j);
      expect(await echec("update public.confirmations_mobile_caution set annulee_le = now() where circuit_id = $1", [circuit])).toMatch(/close/);
    });
  });

  describe("garde de l'envoi", () => {
    it("le numéro saisi par le bailleur n'est jamais envoyé pour un cautionnement", async () => {
      await serviceRole();
      expect(await echec("select (public.reserver_envoi_signature_bail($1, $2)).id", [circuit, owner])).toMatch(/confirmer elle-même son numéro/);
      expect((await db.query("select etat from public.bail_signature_circuits where id = $1", [circuit])).rows[0].etat).toBe("pret");
    });

    it("le numéro confirmé par la caution ouvre l'envoi ; un numéro remplacé ensuite le referme", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      await consommer(j);
      await db.query("savepoint avant_envoi");
      await reserver();
      expect((await db.query("select etat from public.bail_signature_circuits where id = $1", [circuit])).rows[0].etat).toBe("preparation");
      await db.query("rollback to savepoint avant_envoi");
      await db.query(
        "update public.bail_signature_circuits set signataires = (select jsonb_agg(case when s->>'qualite'='Garant' then s || jsonb_build_object('telephone', $2::text) else s end) from jsonb_array_elements(signataires) s) where id = $1",
        [circuit, MOBILE_BAILLEUR],
      );
      expect(await echec("select (public.reserver_envoi_signature_bail($1, $2)).id", [circuit, owner])).toMatch(/confirmer elle-même son numéro/);
    });

    it("un état des lieux ne part pas sans la confirmation sur place, ni avec une date future, ni avec une confirmation périmée", async () => {
      const edl = await circuitEdl();
      await serviceRole();
      expect(await echec("select (public.reserver_envoi_signature_bail($1, $2)).id", [circuit, owner])).toMatch(/établi contradictoirement, sur place/);
      expect(await echec("select public.confirmer_edl_sur_place($1, $2, ((now() at time zone 'Europe/Paris')::date + 1))", [circuit, owner])).toMatch(/postérieure/);
      expect(await echec("select public.confirmer_edl_sur_place($1, $2, null)", [circuit, owner])).toMatch(/date de la visite/);
      expect(await echec("select public.confirmer_edl_sur_place($1, $2, '2026-10-01')", [circuit, autre])).toMatch(/Accès refusé/);
      const { rows: [{ c }] } = await db.query("select public.confirmer_edl_sur_place($1, $2, '2026-10-01') as c", [circuit, owner]);
      expect(c.texte).toBe("Je confirme que cet état des lieux a été établi contradictoirement, sur place, le 01/10/2026, en présence du locataire ou de son représentant.");
      expect(c).toMatchObject({ visite_le: "2026-10-01", confirme_par: owner });
      expect(c.confirme_le).toBeTruthy();
      await proprietaireBase();
      const trace = (await db.query("select details from public.audit_log where action='signature_edl_confirmation_sur_place' and details->>'circuit_id'=$1", [circuit])).rows;
      expect(trace).toHaveLength(1);
      expect(trace[0].details).toMatchObject({ edl_id: edl, visite_le: "2026-10-01" });
      await db.query("savepoint perimee");
      await db.query("update public.bail_signature_circuits set confirmation_sur_place = confirmation_sur_place || jsonb_build_object('confirme_le', now() - interval '2 hours') where id = $1", [circuit]);
      await serviceRole();
      expect(await echec("select (public.reserver_envoi_signature_bail($1, $2)).id", [circuit, owner])).toMatch(/sur place/);
      await db.query("rollback to savepoint perimee");
      await serviceRole();
      await reserver();
      expect((await db.query("select etat, confirmation_sur_place->>'visite_le' v from public.bail_signature_circuits where id = $1", [circuit])).rows[0]).toEqual({ etat: "preparation", v: "2026-10-01" });
    });

    it("la confirmation sur place ne concerne que l'état des lieux prêt", async () => {
      await serviceRole();
      expect(await echec("select public.confirmer_edl_sur_place($1, $2, '2026-10-01')", [circuit, owner])).toMatch(/ne concerne que l’état des lieux/);
    });
  });

  describe("relectures adverses du 24/10", () => {
    const MOBILE_PROPRIETAIRE = "+33600000002";
    const demanderSql = "select public.demander_confirmation_mobile_caution($1, $2, $3)";
    const consommerSql = "select * from public.consommer_confirmation_mobile_caution($1, $2)";
    const reserverSql = "select (public.reserver_envoi_signature_bail($1, $2)).id";
    async function garantAvec(champs: Record<string, string>, c = circuit) {
      await db.query(
        "update public.bail_signature_circuits set signataires = (select jsonb_agg(case when e.s->>'qualite'='Garant' then e.s || $2::jsonb else e.s end order by e.r) from jsonb_array_elements(signataires) with ordinality e(s, r)) where id = $1",
        [c, JSON.stringify(champs)],
      );
    }
    const liensOuverts = async (c = circuit) =>
      (await db.query("select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1 and utilise_le is null and annulee_le is null", [c])).rows[0].n;

    it("le lien ne part ni à l'adresse d'un propriétaire signataire ni à celle d'un compte gestionnaire de l'espace (casse ignorée)", async () => {
      await proprietaireBase();
      await garantAvec({ email: "Paule@Example.invalid" });
      await serviceRole();
      expect(await echec(demanderSql, [circuit, owner, empreinte(jeton())])).toMatch(/adresse e-mail de la caution/);
      await proprietaireBase();
      const compte = (await db.query("select email from auth.users where id = $1", [owner])).rows[0].email as string;
      await garantAvec({ email: ` ${compte.toUpperCase()} ` });
      await serviceRole();
      expect(await echec(demanderSql, [circuit, owner, empreinte(jeton())])).toMatch(/adresse e-mail de la caution/);
      await proprietaireBase();
      expect((await db.query("select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1", [circuit])).rows[0].n).toBe(0);
      await garantAvec({ email: "gaston@example.invalid" });
      await serviceRole();
      await demander(jeton());
    });

    it("la caution ne confirme ni le mobile d'un propriétaire signataire, ni celui d'un détenteur du lot, d'un compte gestionnaire ou de l'organisation ; le lien reste utilisable", async () => {
      await proprietaireBase();
      const detenteur = await id("insert into public.persons(organization_id,nom,prenom,email,telephone) values($1,'Proprio','Paul','paul@example.invalid','06 00 00 00 07') returning id", [org]);
      await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, detenteur]);
      await db.query("update auth.users set phone = '33600000005' where id = $1", [owner]);
      await db.query("update public.organizations set telephone = '06.00.00.00.06' where id = $1", [org]);
      const j = jeton();
      await serviceRole();
      await demander(j);
      for (const t of [MOBILE_PROPRIETAIRE, "+33600000007", "+33600000005", "+33600000006"]) {
        expect(await echec(consommerSql, [empreinte(j), t])).toMatch(/autre personne de ce dossier/);
      }
      expect(await liensOuverts()).toBe(1);
      await consommer(j);
      expect((await garant()).telephone).toBe(MOBILE_CAUTION);
    });

    it("garde : le mobile d'un propriétaire posé sur le garant ne part pas, même avec un lien utilisé qui le porte", async () => {
      await proprietaireBase();
      await db.query(
        "insert into public.confirmations_mobile_caution(organization_id,circuit_id,garant_id,acte,jeton_empreinte,demande_par,expire_le,utilise_le,telephone_confirme) values($1,$2,'garant','cautionnement',$3,$4,now()+interval '1 day',now(),$5)",
        [org, circuit, empreinte(jeton()), owner, MOBILE_PROPRIETAIRE],
      );
      await garantAvec({ telephone: MOBILE_PROPRIETAIRE, telephoneConfirmeLe: new Date().toISOString() });
      await serviceRole();
      expect(await echec(reserverSql, [circuit, owner])).toMatch(/confirmer elle-même son numéro/);
    });

    it("après la confirmation de la caution, aucun nouveau lien ne lui est envoyé", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      await consommer(j);
      expect(await echec(demanderSql, [circuit, owner, empreinte(jeton())])).toMatch(/déjà confirmé son numéro/);
      expect(await liensOuverts()).toBe(0);
    });

    it("cinq liens par caution et par bail en vingt-quatre heures, même à travers une nouvelle préparation", async () => {
      await serviceRole();
      for (let i = 0; i < 3; i++) await demander(jeton());
      await proprietaireBase();
      await db.query("update public.bail_signature_circuits set etat = 'annule' where id = $1", [circuit]);
      const second = await id(
        "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,options) values($1,$2,$3,$4,'production',repeat('c',64),repeat('a',64),$5,'zoho','cautionnement',jsonb_build_object('garant','garant')) returning id",
        [org, bail, doc, owner, JSON.stringify(parties(""))],
      );
      await serviceRole();
      for (let i = 0; i < 2; i++) await demander(jeton(), owner, second);
      expect(await echec(demanderSql, [second, owner, empreinte(jeton())])).toMatch(/Cinq liens/);
    });

    it("un circuit qui quitte l'état « prêt » clôt le lien encore ouvert", async () => {
      await serviceRole();
      await demander(jeton());
      await proprietaireBase();
      expect(await liensOuverts()).toBe(1);
      await db.query("update public.bail_signature_circuits set etat = 'annule' where id = $1", [circuit]);
      expect(await liensOuverts()).toBe(0);
      expect((await db.query("select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1 and annulee_le is not null", [circuit])).rows[0].n).toBe(1);
    });

    it("abonnement suspendu : l'annulation d'un acte prêt par le serveur passe toujours ; le lien, refusé à l'écriture, reste inutilisable", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      await proprietaireBase();
      await db.query("select public.tache_systeme()");
      await db.query("update public.organizations set status = 'suspendue' where id = $1", [org]);
      await db.query("select set_config('gerimmo.systeme', '', true)");
      await serviceRole();
      await db.query("update public.bail_signature_circuits set etat = 'annule', updated_at = now() where id = $1 and etat = 'pret'", [circuit]);
      expect((await db.query("select etat from public.bail_signature_circuits where id = $1", [circuit])).rows[0].etat).toBe("annule");
      expect(await echec(consommerSql, [empreinte(j), MOBILE_CAUTION])).not.toBe("");
    });

    it("garde : le téléphone du garant ne change plus une fois l'acte réservé ; les autres mises à jour passent", async () => {
      const j = jeton();
      await serviceRole();
      await demander(j);
      await consommer(j);
      await reserver();
      expect(await echec(
        "update public.bail_signature_circuits set signataires = (select jsonb_agg(case when e.s->>'qualite'='Garant' then e.s || jsonb_build_object('telephone', $2::text) else e.s end order by e.r) from jsonb_array_elements(signataires) with ordinality e(s, r)) where id = $1",
        [circuit, MOBILE_BAILLEUR],
      )).toMatch(/ne change plus/);
      await db.query(
        "update public.bail_signature_circuits set signataires = (select jsonb_agg(e.s || jsonb_build_object('statut', 'initiated') order by e.r) from jsonb_array_elements(signataires) with ordinality e(s, r)) where id = $1",
        [circuit],
      );
      expect((await garant()).telephone).toBe(MOBILE_CAUTION);
    });

    it("garde : un acte de cautionnement ou un état des lieux ne s'enregistre que « prêt »", async () => {
      await proprietaireBase();
      const inserer = (modele: string, garant: string) => echec(
        "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,options,etat,cible_id) values($1,$2,$3,$4,'production',repeat('d',64),repeat('a',64),$5,'zoho',$6,jsonb_build_object('garant',$7::text),'en_cours',gen_random_uuid())",
        [org, bail, doc, owner, JSON.stringify(parties(MOBILE_BAILLEUR)), modele, garant],
      );
      expect(await inserer("cautionnement", "autre")).toMatch(/ne s’enregistre que prêt/);
      expect(await inserer("edl", "")).toMatch(/ne s’enregistre que prêt/);
    });

    it("état des lieux : la date de la visite est celle portée par l'état des lieux, en base comme à la garde", async () => {
      await circuitEdl();
      await serviceRole();
      expect(await echec("select public.confirmer_edl_sur_place($1, $2, '1990-01-01')", [circuit, owner])).toMatch(/celle portée par l’état des lieux \(01\/10\/2026\)/);
      await db.query("select public.confirmer_edl_sur_place($1, $2, '2026-10-01')", [circuit, owner]);
      await proprietaireBase();
      await db.query("savepoint autre_date");
      await db.query("update public.bail_signature_circuits set confirmation_sur_place = confirmation_sur_place || jsonb_build_object('visite_le', '1990-01-01') where id = $1", [circuit]);
      await serviceRole();
      expect(await echec(reserverSql, [circuit, owner])).toMatch(/sur place/);
      await db.query("rollback to savepoint autre_date");
      await serviceRole();
      await reserver();
    });

    it("garde : une confirmation sur place sans instant est refusée", async () => {
      await circuitEdl();
      await proprietaireBase();
      await db.query("update public.bail_signature_circuits set confirmation_sur_place = jsonb_build_object('confirme_par', $2::text, 'visite_le', '2026-10-01') where id = $1", [circuit, owner]);
      await serviceRole();
      expect(await echec(reserverSql, [circuit, owner])).toMatch(/sur place/);
    });
  });

  // Décision du 24/10 (choix logique délégué à Claude) : le garant qui signe aussi le BAIL confirme lui-même son mobile,
  // comme la caution (même table de liens, mêmes fonctions). Son numéro confirmé pour l'acte de cautionnement du même
  // bail est repris sans nouvelle demande ; sinon un lien lui part et le circuit attend. Jamais le numéro saisi par le
  // bailleur, jamais une coordonnée d'une autre partie.
  describe("garant qui signe aussi le bail (décision du 24/10)", () => {
    const MOBILE_GARANT_B = "+33622334455";
    const MOBILE_PROPRIETAIRE = "+33600000002";
    const MOBILE_LOCATAIRE = "+33600000001";
    const signatairesBail = () => [
      { personId: "locataire", qualite: "Locataire", prenom: "Alice", nom: "Test", email: "alice@example.invalid", telephone: MOBILE_LOCATAIRE },
      { personId: "garant", qualite: "Garant", prenom: "Gaston", nom: "Garant", email: "gaston@example.invalid", telephone: "" },
      { personId: "garant-b", qualite: "Garant", prenom: "Berthe", nom: "Garante", email: "berthe@example.invalid", telephone: "" },
      { personId: "owner", qualite: "Propriétaire", prenom: "Paule", nom: "Proprio", email: "paule@example.invalid", telephone: MOBILE_PROPRIETAIRE },
    ];
    let circuitBail = "";
    const demanderGarant = (j: string, garantId: string, c = circuitBail) =>
      db.query<{ expire: Date }>("select public.demander_confirmation_mobile_caution($1, $2, $3, $4) as expire", [c, owner, empreinte(j), garantId]);
    const demanderGarantSql = "select public.demander_confirmation_mobile_caution($1, $2, $3, $4)";
    const consommerSql = "select * from public.consommer_confirmation_mobile_caution($1, $2)";
    const reserverSql = "select (public.reserver_envoi_signature_bail($1, $2)).id";
    const reprendre = async (c = circuitBail) =>
      (await db.query<{ s: Record<string, string>[] }>("select public.reprendre_mobiles_garants_bail($1) as s", [c])).rows[0].s;
    const signataire = async (personId: string, c = circuitBail) =>
      (await db.query("select s from public.bail_signature_circuits, jsonb_array_elements(signataires) s where id = $1 and s->>'personId' = $2", [c, personId])).rows[0].s;
    const liensBail = async (garantId: string, ouverts = false) =>
      (await db.query(
        `select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1 and garant_id = $2${ouverts ? " and utilise_le is null and annulee_le is null" : ""}`,
        [circuitBail, garantId],
      )).rows[0].n;
    const etat = async (c = circuitBail) => (await db.query("select etat from public.bail_signature_circuits where id = $1", [c])).rows[0].etat;
    async function poserSurSignataire(personId: string, champs: Record<string, string>, c = circuitBail) {
      await db.query(
        "update public.bail_signature_circuits set signataires = (select jsonb_agg(case when e.s->>'personId' = $2 then e.s || $3::jsonb else e.s end order by e.r) from jsonb_array_elements(signataires) with ordinality e(s, r)) where id = $1",
        [c, personId, JSON.stringify(champs)],
      );
    }
    /** La caution « garant » confirme MOBILE_CAUTION pour son acte de cautionnement (circuit du beforeEach général). */
    async function cautionConfirmee(telephone = MOBILE_CAUTION) {
      const j = jeton();
      await serviceRole();
      await demander(j);
      await consommer(j, telephone);
    }

    beforeEach(async () => {
      await proprietaireBase();
      circuitBail = await id(
        "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,cible_id) values($1,$2,$3,$4,'production',repeat('e',64),repeat('a',64),$5,'zoho','bail',$2) returning id",
        [org, bail, doc, owner, JSON.stringify(signatairesBail())],
      );
    });

    it("jamais le numéro saisi par le bailleur : un garant du bail sans numéro confirmé par lui-même ne part pas", async () => {
      await proprietaireBase();
      // Le numéro de la fiche du garant (saisi par le bailleur) posé sur le circuit : refusé à l'envoi.
      await poserSurSignataire("garant", { telephone: MOBILE_BAILLEUR });
      await poserSurSignataire("garant-b", { telephone: MOBILE_GARANT_B, telephoneConfirmeLe: new Date().toISOString() });
      await serviceRole();
      expect(await echec(reserverSql, [circuitBail, owner])).toMatch(/Chaque garant doit confirmer lui-même son numéro/);
      expect(await etat()).toBe("pret");
    });

    it("jamais une coordonnée d'une autre partie : ni par le lien, ni par un lien utilisé qui la porterait", async () => {
      const j = jeton();
      await serviceRole();
      await demanderGarant(j, "garant");
      // Le propriétaire signataire, le locataire du bail : refusés, le lien reste ouvert.
      for (const t of [MOBILE_PROPRIETAIRE, MOBILE_LOCATAIRE]) {
        expect(await echec(consommerSql, [empreinte(j), t])).toMatch(/autre personne de ce dossier/);
      }
      expect(await liensBail("garant", true)).toBe(1);
      await consommer(j, MOBILE_CAUTION);
      // L'autre garant ne confirme pas le numéro du premier.
      const jb = jeton();
      await demanderGarant(jb, "garant-b");
      expect(await echec(consommerSql, [empreinte(jb), MOBILE_CAUTION])).toMatch(/autre personne de ce dossier/);
      // Un lien « utilisé » fabriqué avec le numéro du propriétaire ne fait pas partir le bail.
      await proprietaireBase();
      await db.query(
        "insert into public.confirmations_mobile_caution(organization_id,circuit_id,garant_id,acte,jeton_empreinte,demande_par,expire_le,utilise_le,telephone_confirme) values($1,$2,'garant-b','bail',$3,$4,now()+interval '1 day',now(),$5)",
        [org, circuitBail, empreinte(jeton()), owner, MOBILE_PROPRIETAIRE],
      );
      await poserSurSignataire("garant-b", { telephone: MOBILE_PROPRIETAIRE, telephoneConfirmeLe: new Date().toISOString() });
      await serviceRole();
      expect(await echec(reserverSql, [circuitBail, owner])).toMatch(/Chaque garant doit confirmer lui-même son numéro/);
    });

    it("réutilisation : le numéro confirmé par la caution pour l'acte de cautionnement du même bail est repris, sans nouveau lien", async () => {
      await cautionConfirmee();
      const apres = await reprendre();
      const g = apres.find((s) => s.personId === "garant")!;
      expect(g.telephone).toBe(MOBILE_CAUTION);
      expect(g.telephoneConfirmeLe).toBeTruthy();
      expect(g.confirmationMobile).toMatch(/^[0-9a-f-]{36}$/);
      expect((await signataire("garant")).telephone).toBe(MOBILE_CAUTION);
      // L'autre garant n'a rien confirmé : il reste à confirmer.
      expect((await signataire("garant-b")).telephone).toBe("");
      expect(await liensBail("garant")).toBe(0);
      await proprietaireBase();
      expect((await db.query("select count(*)::int n from public.audit_log where action = 'signature_garant_bail_mobile_repris' and details->>'circuit_id' = $1 and details->>'garant_id' = 'garant'", [circuitBail])).rows[0].n).toBe(1);
      await serviceRole();
      // Plus de lien pour ce garant sur ce bail.
      expect(await echec(demanderGarantSql, [circuitBail, owner, empreinte(jeton()), "garant"])).toMatch(/déjà confirmé son numéro/);
    });

    it("réutilisation refusée : un numéro devenu celui d'une autre partie, ou confirmé pour un autre bail, n'est pas repris", async () => {
      await cautionConfirmee();
      await proprietaireBase();
      await poserSurSignataire("locataire", { telephone: MOBILE_CAUTION });
      await serviceRole();
      expect((await reprendre()).find((s) => s.personId === "garant")!.telephone).toBe("");
      // Un autre bail du même garant : sa confirmation ne vaut pas pour celui-ci.
      await proprietaireBase();
      await poserSurSignataire("locataire", { telephone: MOBILE_LOCATAIRE });
      const autreBail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) select organization_id,lot_id,locataire_principal,'brouillon','nu',current_date,500,20 from public.baux where id = $1 returning id", [bail]);
      await db.query("update public.bail_signature_circuits set bail_id = $2, cible_id = $2 where id = $1", [circuitBail, autreBail]);
      await serviceRole();
      expect((await reprendre()).find((s) => s.personId === "garant")!.telephone).toBe("");
    });

    it("attente puis envoi : un lien par garant, le bail part quand tous ont confirmé", async () => {
      const ja = jeton(), jb = jeton();
      await serviceRole();
      const { rows: [{ expire }] } = await demanderGarant(ja, "garant");
      expect(new Date(expire).getTime()).toBeGreaterThan(Date.now());
      await demanderGarant(jb, "garant-b");
      expect(await liensBail("garant", true)).toBe(1);
      expect(await liensBail("garant-b", true)).toBe(1);
      await proprietaireBase();
      const ligne = (await db.query("select acte, garant_id from public.confirmations_mobile_caution where jeton_empreinte = $1", [empreinte(ja)])).rows[0];
      expect(ligne).toEqual({ acte: "bail", garant_id: "garant" });
      await serviceRole();
      expect(await echec(reserverSql, [circuitBail, owner])).toMatch(/Chaque garant doit confirmer lui-même son numéro/);
      await consommer(ja, MOBILE_CAUTION);
      expect((await signataire("garant")).telephone).toBe(MOBILE_CAUTION);
      expect((await signataire("garant-b")).telephone).toBe("");
      expect(await echec(reserverSql, [circuitBail, owner])).toMatch(/Chaque garant doit confirmer lui-même son numéro/);
      await consommer(jb, MOBILE_GARANT_B);
      await db.query(reserverSql, [circuitBail, owner]);
      expect(await etat()).toBe("preparation");
      // Une fois parti, le numéro d'un garant du bail ne change plus.
      expect(await echec(
        "update public.bail_signature_circuits set signataires = (select jsonb_agg(case when e.s->>'personId' = 'garant-b' then e.s || jsonb_build_object('telephone', $2::text) else e.s end order by e.r) from jsonb_array_elements(signataires) with ordinality e(s, r)) where id = $1",
        [circuitBail, MOBILE_BAILLEUR],
      )).toMatch(/ne change plus/);
    });

    it("le numéro repris de la caution et celui confirmé par le lien du bail ouvrent ensemble l'envoi", async () => {
      await cautionConfirmee();
      await reprendre();
      const jb = jeton();
      await demanderGarant(jb, "garant-b");
      await consommer(jb, MOBILE_GARANT_B);
      await db.query(reserverSql, [circuitBail, owner]);
      expect(await etat()).toBe("preparation");
    });

    it("renvoi : un nouveau lien annule le précédent du même garant, pas celui de l'autre ; garant étranger au bail refusé", async () => {
      const premier = jeton(), second = jeton(), deB = jeton();
      await serviceRole();
      await demanderGarant(premier, "garant");
      await demanderGarant(deB, "garant-b");
      await demanderGarant(second, "garant");
      expect(await echec(consommerSql, [empreinte(premier), MOBILE_CAUTION])).toMatch(/plus valable/);
      expect(await liensBail("garant", true)).toBe(1);
      expect(await liensBail("garant-b", true)).toBe(1);
      await consommer(second, MOBILE_CAUTION);
      expect(await echec(demanderGarantSql, [circuitBail, owner, empreinte(jeton()), "inconnu"])).toMatch(/ne signe pas ce bail/);
      expect(await echec("select public.demander_confirmation_mobile_caution($1, $2, $3)", [circuitBail, owner, empreinte(jeton())])).toMatch(/ne signe pas ce bail/);
      expect(await echec(demanderGarantSql, [circuitBail, autre, empreinte(jeton()), "garant-b"])).toMatch(/Accès refusé/);
    });

    it("renvoi borné : cinq liens par garant et par bail en vingt-quatre heures, acte de cautionnement et bail confondus", async () => {
      await serviceRole();
      for (let i = 0; i < 3; i++) await demander(jeton());
      for (let i = 0; i < 2; i++) await demanderGarant(jeton(), "garant");
      expect(await echec(demanderGarantSql, [circuitBail, owner, empreinte(jeton()), "garant"])).toMatch(/Cinq liens/);
      // L'autre garant a son propre compteur.
      await demanderGarant(jeton(), "garant-b");
    });

    it("expiration : un lien expiré est refusé ; le bail qui quitte l'état « prêt » clôt les liens ouverts", async () => {
      const expire = jeton();
      await proprietaireBase();
      await db.query(
        "insert into public.confirmations_mobile_caution(organization_id,circuit_id,garant_id,acte,jeton_empreinte,demande_par,cree_le,expire_le) values($1,$2,'garant','bail',$3,$4,now()-interval '8 days',now()-interval '1 day')",
        [org, circuitBail, empreinte(expire), owner],
      );
      await serviceRole();
      expect(await echec(consommerSql, [empreinte(expire), MOBILE_CAUTION])).toMatch(/expiré/);
      const j = jeton();
      await demanderGarant(j, "garant-b");
      await proprietaireBase();
      await db.query("update public.bail_signature_circuits set etat = 'annule' where id = $1", [circuitBail]);
      expect(await liensBail("garant-b", true)).toBe(0);
      await serviceRole();
      expect(await echec(consommerSql, [empreinte(j), MOBILE_GARANT_B])).toMatch(/plus valable/);
    });

    it("un bail sans garant part comme avant ; un bail avec garant ne s'enregistre que prêt", async () => {
      await proprietaireBase();
      await db.query("update public.bail_signature_circuits set signataires = (select jsonb_agg(s) from jsonb_array_elements(signataires) s where s->>'qualite' <> 'Garant') where id = $1", [circuitBail]);
      await serviceRole();
      await db.query(reserverSql, [circuitBail, owner]);
      expect(await etat()).toBe("preparation");
      await proprietaireBase();
      expect(await echec(
        "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,cible_id,etat) values($1,$2,$3,$4,'production',repeat('f',64),repeat('a',64),$5,'zoho','bail',$2,'en_cours')",
        [org, bail, doc, owner, JSON.stringify(signatairesBail())],
      )).toMatch(/ne s’enregistre que prêt/);
    });
  });

  it("droits : ni anon ni un compte connecté ne lisent la table ni n'appellent les fonctions", async () => {
    await serviceRole();
    await demander(jeton());
    for (const r of ["anon", "authenticated"] as const) {
      await role(r, r === "authenticated" ? owner : undefined);
      expect(await echec("select count(*) from public.confirmations_mobile_caution")).toMatch(/permission denied/);
      expect(await echec("select public.demander_confirmation_mobile_caution($1, $2, $3)", [circuit, owner, empreinte(jeton())])).toMatch(/permission denied/);
      expect(await echec("select * from public.consommer_confirmation_mobile_caution($1, $2)", [empreinte(jeton()), MOBILE_CAUTION])).toMatch(/permission denied/);
      expect(await echec("select public.confirmer_edl_sur_place($1, $2, '2026-10-01')", [circuit, owner])).toMatch(/permission denied/);
      expect(await echec("select public.reprendre_mobiles_garants_bail($1)", [circuit])).toMatch(/permission denied/);
    }
    await proprietaireBase();
    const ouvertes = (await db.query(
      "select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))",
      [["demander_confirmation_mobile_caution", "consommer_confirmation_mobile_caution", "confirmer_edl_sur_place", "garder_envoi_signature_caution_edl", "confirmations_mobile_caution_garde", "coordonnees_autres_parties_caution", "fermer_liens_caution_hors_pret", "reprendre_mobiles_garants_bail"]],
    )).rows;
    expect(ouvertes).toEqual([]);
  });

  it("retour arrière : table vide retirée, colonne gardée, rejeu sans effet, puis marche avant", async () => {
    await proprietaireBase();
    await db.query("delete from public.confirmations_mobile_caution");
    await db.query(RETOUR);
    expect((await db.query("select to_regclass('public.confirmations_mobile_caution') t")).rows[0].t).toBeNull();
    for (const f of ["public.demander_confirmation_mobile_caution(uuid,uuid,text,text)", "public.consommer_confirmation_mobile_caution(text,text)", "public.confirmer_edl_sur_place(uuid,uuid,date)", "public.garder_envoi_signature_caution_edl()", "public.fermer_liens_caution_hors_pret()", "public.coordonnees_autres_parties_caution(uuid,uuid,jsonb,text)", "public.reprendre_mobiles_garants_bail(uuid)"]) {
      expect((await db.query("select to_regprocedure($1) p", [f])).rows[0].p).toBeNull();
    }
    expect((await db.query("select count(*)::int n from pg_trigger where tgrelid = 'public.bail_signature_circuits'::regclass and tgname in ('signature_garde_caution_edl', 'signature_liens_caution_clos')")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from information_schema.columns where table_name='bail_signature_circuits' and column_name='confirmation_sur_place'")).rows[0].n).toBe(1);
    // Sans la garde, le comportement d'avant revient (le numéro du bailleur passe) : c'est ce que dit le LISEZ-MOI.
    await serviceRole();
    await db.query("savepoint sans_garde");
    await reserver();
    await db.query("rollback to savepoint sans_garde");
    await proprietaireBase();
    await db.query(RETOUR);
    await db.query(MIGRATION);
    await serviceRole();
    expect(await echec("select (public.reserver_envoi_signature_bail($1, $2)).id", [circuit, owner])).toMatch(/confirmer elle-même/);
  });

  it("retour arrière : une table qui porte des liens envoyés est conservée", async () => {
    await serviceRole();
    await demander(jeton());
    await proprietaireBase();
    await db.query(RETOUR);
    expect((await db.query("select count(*)::int n from public.confirmations_mobile_caution where circuit_id = $1", [circuit])).rows[0].n).toBe(1);
    expect((await db.query("select to_regprocedure('public.consommer_confirmation_mobile_caution(text,text)') p")).rows[0].p).toBeNull();
    await db.query(MIGRATION);
    expect((await db.query("select to_regprocedure('public.consommer_confirmation_mobile_caution(text,text)') p")).rows[0].p).not.toBeNull();
  });
});
