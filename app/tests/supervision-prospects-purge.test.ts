/**
 * Audit du 19/10 (lot mineurs, i, M18 ; migration 20261019121000) : la purge d'une demande de contact ne bloque plus
 * sur le prospect qui la cite.
 *
 * Constat : la clé `supervision_prospects.demande_id → demandes_devis` était sans action référentielle. La rétention
 * quotidienne (`appliquer_retention`, demandes de contact de plus de 24 mois, une seule transaction) échouait entière
 * dès qu'un prospect citait une demande à purger. Désormais ON DELETE SET NULL sur cette seule clé.
 *
 * Décision du 19/10 (Q2, retour au plan) : les clés vers les comptes (responsable, auteur ; auteur du registre) ne
 * changent pas et `auteur` reste obligatoire sur les deux tables. Le déclencheur de traçage reconnaît la mise à jour
 * « système » — révision inchangée ET (aucune session OU déclencheur imbriqué, ce qu'est l'action référentielle, y compris
 * sous la session du super admin qui lance la purge à la main) — : il ne contrôle pas la version et n'écrit RIEN au
 * registre. Une mise à jour directe par une session garde exactement la règle d'avant. Aucune ligne sans auteur n'étant
 * jamais écrite, le retour arrière reste toujours jouable.
 *
 * Transaction annulée, un point de sauvegarde par cas. Rejoue la migration et son retour (DDL) : fichier en série.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);

const NOM = "20261019121000_droits_anon_contact_articles_et_prospects";
const aller = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8")
  .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
  .replace(/^begin;$/m, "")
  .replace(/^commit;$/m, "");

const CLE_DEMANDE = ["public.supervision_prospects", "supervision_prospects_demande_id_fkey"] as const;
/** Les clés vers les comptes : inchangées (décision Q2 du 19/10). */
const CLES_COMPTES = [
  ["public.supervision_prospects", "supervision_prospects_responsable_fkey", "responsable"],
  ["public.supervision_prospects", "supervision_prospects_auteur_fkey", "auteur"],
  ["public.supervision_registre", "supervision_registre_auteur_fkey", "auteur"],
] as const;
const AUTEURS_OBLIGATOIRES = "supervision_prospects.auteur:true,supervision_registre.auteur:true";

describe.skipIf(!DB)("Prospects : la purge des demandes de contact ne bloque plus", () => {
  let db: Client;
  let superviseur: string, responsable: string, demande: string, prospect: string;

  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (email: string) =>
    id(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,'x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`,
      [email]
    );
  /** `auth.uid()` vaut ce compte, second facteur vérifié (rôle postgres conservé : on éprouve le déclencheur, pas la RLS). */
  const session = async (qui: string) =>
    db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]);
  /** Aucune session : ce que voit la tâche planifiée de 03 h. */
  const systeme = async () => db.query("select set_config('request.jwt.claims','',true)");
  /** Le compte devient super admin (adhésion sans organisation) : ce que `appliquer_retention` exige d'une session. */
  const superAdmin = async (qui: string) => {
    await db.query("select public.tache_systeme()");
    await db.query("insert into public.memberships(account_id,role) values($1,'super_admin')", [qui]);
    await db.query("select set_config('gerimmo.systeme','',true)");
  };
  const echec = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as Error).message;
    }
  };
  const fiche = async () => (await db.query("select demande_id, responsable, auteur, revision from public.supervision_prospects where id=$1", [prospect])).rows[0];
  /** Les traces du prospect, la création d'abord (seule ligne sans « avant ») : `cree_le` est le même pour toute la transaction. */
  const traces = async () =>
    (await db.query("select auteur, apres->>'demande_id' as demande, apres->>'responsable' as responsable from public.supervision_registre where objet='supervision_prospects' and objet_id=$1 order by (avant is null) desc, cree_le, id", [prospect])).rows;
  const demandeExiste = async () => (await db.query("select count(*)::int n from public.demandes_devis where id=$1", [demande])).rows[0].n as number;
  const contrainte = async (table: string, nom: string) =>
    (await db.query("select pg_get_constraintdef(oid) d from pg_constraint where conrelid=$1::regclass and conname=$2", [table, nom])).rows[0]?.d as string | undefined;
  const declencheur = async () => (await db.query("select pg_get_functiondef('public.supervision_tracer_modification()'::regprocedure) d")).rows[0].d as string;
  const empreinte = async () =>
    (
      await db.query(`select
        (select string_agg(conname||' '||pg_get_constraintdef(oid), ' | ' order by conname) from pg_constraint where conrelid in ('public.supervision_prospects'::regclass,'public.supervision_registre'::regclass) and contype='f') as cles,
        (select string_agg(attrelid::regclass::text||'.'||attname||':'||attnotnull, ',' order by attrelid, attname) from pg_attribute where attrelid in ('public.supervision_prospects'::regclass,'public.supervision_registre'::regclass) and attname='auteur') as auteurs,
        md5(pg_get_functiondef('public.supervision_tracer_modification()'::regprocedure)) as declencheur,
        (select proacl::text from pg_proc where oid='public.supervision_tracer_modification()'::regprocedure) as droits`)
    ).rows[0];

  beforeAll(async () => {
    db = new Client({ connectionString: DB });
    await db.connect();
    await db.query("begin");
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
    const s = Math.random().toString(36).slice(2, 10);
    superviseur = await compte(`superviseur-${s}@example.test`);
    responsable = await compte(`responsable-${s}@example.test`);
    // Une demande de contact de plus de 24 mois : la rétention quotidienne doit la purger. Le déclencheur d'insertion
    // (`demandes_devis_limiter`) date la ligne du jour : on la vieillit après coup.
    demande = await id(
      "insert into public.demandes_devis(nom,email,agence,telephone,nb_lots,message) values('Prospect fictif','prospect-'||$1||'@example.test','Agence fictive','0600000000',12,'Demande fictive de recette') returning id",
      [s]
    );
    await db.query("update public.demandes_devis set created_at=now()-interval '25 months' where id=$1", [demande]);
    await session(superviseur);
    prospect = await id(
      "insert into public.supervision_prospects(nom,email,origine,etape,responsable,prochaine_action,echeance,demande_id) values('Prospect fictif QA','prospect-'||$1||'@example.test','Formulaire du site','nouveau',$2,'Rappeler pour une démonstration',current_date+7,$3) returning id",
      [s, responsable, demande]
    );
    await systeme();
  });
  afterEach(async () => {
    await systeme();
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("seule la clé vers la demande d'origine est ON DELETE SET NULL ; celles vers les comptes et l'organisation ne changent pas, l'auteur reste obligatoire", async () => {
    expect(await contrainte(...CLE_DEMANDE)).toBe("FOREIGN KEY (demande_id) REFERENCES demandes_devis(id) ON DELETE SET NULL");
    for (const [table, nom, colonne] of CLES_COMPTES) expect(await contrainte(table, nom), nom).toBe(`FOREIGN KEY (${colonne}) REFERENCES accounts(id)`);
    expect(await contrainte("public.supervision_prospects", "supervision_prospects_organisation_id_fkey")).toBe("FOREIGN KEY (organisation_id) REFERENCES organizations(id)");
    expect((await empreinte()).auteurs).toBe(AUTEURS_OBLIGATOIRES);
  });

  it("la rétention de 03 h (sans session) purge la demande ancienne sans échouer : le prospect reste, sans sa demande, révision inchangée, rien d'écrit au registre", async () => {
    expect(await fiche()).toMatchObject({ demande_id: demande, revision: 0 });
    expect(await echec("select public.appliquer_retention()")).toBe("");
    expect(await demandeExiste()).toBe(0);
    expect(await fiche()).toMatchObject({ demande_id: null, responsable, auteur: superviseur, revision: 0 });
    // La seule trace est celle de la création ; la mise à jour système n'en laisse aucune (décision Q2 du 19/10).
    expect(await traces()).toEqual([expect.objectContaining({ auteur: superviseur, demande })]);
  });

  it("sous la session d'un super admin (second facteur), supprimer une demande citée passe : l'action référentielle est un déclencheur imbriqué, demande_id devient nul", async () => {
    await superAdmin(superviseur);
    await session(superviseur);
    expect((await db.query("select public.is_super_admin() s")).rows[0].s).toBe(true);
    expect(await echec("delete from public.demandes_devis where id=$1", [demande])).toBe("");
    expect(await demandeExiste()).toBe(0);
    expect(await fiche()).toMatchObject({ demande_id: null, responsable, auteur: superviseur, revision: 0 });
    expect(await traces()).toHaveLength(1);
  });

  it("le bouton « lancer la purge » de la console (appliquer_retention sous la session du super admin) purge sans « Version périmée »", async () => {
    await superAdmin(superviseur);
    await session(superviseur);
    expect(await echec("select public.appliquer_retention()")).toBe("");
    expect(await demandeExiste()).toBe(0);
    expect(await fiche()).toMatchObject({ demande_id: null, revision: 0 });
    expect(await traces()).toHaveLength(1);
  });

  it("une mise à jour directe par une session garde la règle d'avant : révision inchangée ou périmée refusée, révision suivante tracée à son nom", async () => {
    await session(superviseur);
    expect(await echec("update public.supervision_prospects set notes='Relu' where id=$1", [prospect])).toMatch(/Version périmée/);
    expect(await echec("update public.supervision_prospects set notes='Relu', revision=5 where id=$1", [prospect])).toMatch(/Version périmée/);
    expect(await echec("update public.supervision_prospects set notes='Relu', revision=1 where id=$1", [prospect])).toBe("");
    expect(await fiche()).toMatchObject({ revision: 1 });
    const t = await traces();
    expect(t).toHaveLength(2);
    expect(t.at(-1)).toMatchObject({ auteur: superviseur });
  });

  it("les clés vers les comptes restent sans action (décision Q2) : supprimer un compte référencé est toujours refusé, la fiche ne bouge pas", async () => {
    expect(await echec("delete from auth.users where id=$1", [responsable])).toMatch(/supervision_prospects_responsable_fkey/);
    expect(await fiche()).toMatchObject({ responsable, auteur: superviseur, revision: 0 });
  });

  it("rejeu sans effet ; retour : clé sans action, déclencheur d'origine, auteur toujours obligatoire ; réapplication identique", async () => {
    const attendu = await empreinte();
    expect(attendu.auteurs).toBe(AUTEURS_OBLIGATOIRES);
    await db.query(aller);
    expect(await empreinte()).toEqual(attendu);
    await db.query(retour);
    expect(await contrainte(...CLE_DEMANDE)).toBe("FOREIGN KEY (demande_id) REFERENCES demandes_devis(id)");
    for (const [table, nom, colonne] of CLES_COMPTES) expect(await contrainte(table, nom), nom).toBe(`FOREIGN KEY (${colonne}) REFERENCES accounts(id)`);
    expect((await empreinte()).auteurs).toBe(AUTEURS_OBLIGATOIRES);
    expect(await declencheur()).not.toMatch(/pg_trigger_depth/);
    // Sans la migration, la purge échoue de nouveau sur la clé : c'est l'état d'avant, rétabli.
    expect(await echec("delete from public.demandes_devis where id=$1", [demande])).toMatch(/supervision_prospects_demande_id_fkey/);
    await db.query(aller);
    expect(await empreinte()).toEqual(attendu);
    expect(await declencheur()).toMatch(/pg_trigger_depth/);
  });

  it("le retour reste jouable après une purge : aucune ligne sans auteur n'est jamais écrite au registre", async () => {
    expect(await echec("select public.appliquer_retention()")).toBe("");
    expect((await db.query("select count(*)::int n from public.supervision_registre where auteur is null")).rows[0].n).toBe(0);
    expect(await echec(retour)).toBe("");
    expect(await contrainte(...CLE_DEMANDE)).toBe("FOREIGN KEY (demande_id) REFERENCES demandes_devis(id)");
  });
});
