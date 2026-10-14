/**
 * Les quatre migrations du lot « supervision » (14/10/2026 : D08 traversée, D09 alerte de relais puis sa reprise,
 * D10 consigne) se rejouent sans effet, s'arrêtent sur une définition inattendue et, appliquées à l'état d'avant, redonnent
 * exactement l'état d'après. Même méthode que tests/correctifs-audit-13-octobre-rejeu.test.ts : chaque bloc
 * cherche, dans la définition en vigueur, la marque de son propre correctif et, si elle y est, ne fait rien.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}`, "utf8");
const TRAVERSEE = lire("20261014220000_traversee_trace_precise.sql");
const ALERTE = lire("20261014221000_alerte_relais_destinataire.sql");
const REPRISE = lire("20261014223000_alerte_relais_reprise_destinataire_parti.sql");
const CONSIGNE = lire("20261014222000_consigne_activation_approbateur_distinct.sql");
// Dans l'ordre du manifeste (e2e/local/ordre-migrations.txt).
const MIGRATIONS = [TRAVERSEE, ALERTE, CONSIGNE, REPRISE];

const FONCTIONS: [string, string][] = [
  ["public.log_sa_access(uuid,text,jsonb)", "Audit du 14/10 (SA-01)"],
  ["public.accuser_alerte_vacances(uuid)", "Audit du 14/10 (SUP-03)"],
  ["public.decider_consigne(uuid,boolean)", "Audit du 14/10 (SUP-04)"],
];
// La reprise (relecture de D09) ajoute sa propre marque à la fonction de 20261014221000, sans retirer la sienne.
const MARQUE_REPRISE = "Audit du 14/10 (SUP-03, reprise)";

// Les définitions d'AVANT les migrations, telles que les posent 20260927201000 (log_sa_access),
// 20261012221100 (accuser_alerte_vacances) et 20261012221000 (decider_consigne).
const AVANT_LOG = `create or replace function public.log_sa_access(org uuid, sa_action text, sa_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_super_admin() then
    raise exception 'log_sa_access: reserve au super admin';
  end if;
  if sa_action like 'consultation\\_%' and exists (
    select 1 from public.audit_log l
    where l.account_id = (select auth.uid()) and l.action = sa_action
      and l.organization_id is not distinct from org
      and l.details = coalesce(sa_details, '{}'::jsonb)
      and l.created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), org, sa_action, coalesce(sa_details, '{}'::jsonb));
end;
$$`;
const AVANT_ACCUSER = `create or replace function public.accuser_alerte_vacances(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Responsable habilité et double vérification requis'; end if;
 update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee';
 if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid()); end if;
end $$`;
const AVANT_DECIDER = `create or replace function public.decider_consigne(p_version uuid,p_accepter boolean) returns void language plpgsql security definer set search_path='' as $$
declare v public.supervision_consignes_versions;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 select v1.* into v from public.supervision_consignes_versions v1 join public.supervision_consignes c on c.id=v1.consigne_id where v1.id=p_version and c.version_courante=v1.numero and not c.suspendue for update of c;
 if v.id is null or v.fin<=now() or not public.responsable_supervision_habilite(v.responsable) then raise exception 'Version remplacée, suspendue, expirée ou responsable non habilité'; end if;
 if p_accepter is null then raise exception 'Décision requise'; end if;
 if exists(select 1 from public.supervision_consignes_accords where version_id=p_version and accepte is distinct from p_accepter) then raise exception 'Décision déjà enregistrée ; créez une nouvelle version'; end if;
 insert into public.supervision_consignes_accords(version_id,accepte,auteur) values(p_version,p_accepter,auth.uid()) on conflict do nothing;
 update public.supervision_consignes_taches set etat=case when p_accepter then 'approuvee' else 'annulee' end where version_id=p_version and etat='proposee';
 insert into public.supervision_operations(objet,action,auteur,details) values(p_version,'consigne_decision',auth.uid(),jsonb_build_object('accepte',p_accepter));
end $$`;

describe.skipIf(!DB_URL)("Migrations du lot supervision du 14/10 — rejeu", () => {
  let db: Client;

  /** Ce que les migrations peuvent changer : définitions, droits, fonction de classement des tâches. */
  async function empreinte() {
    const etat: Record<string, string> = {};
    for (const [signature] of FONCTIONS) {
      const { rows } = await db.query(
        "select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = $1::text::regprocedure", [signature]
      );
      etat[`fonction ${signature}`] = rows[0].v;
    }
    const { rows } = await db.query(
      "select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = to_regprocedure('public.tache_consigne_lecture_seule(text)')"
    );
    etat["fonction public.tache_consigne_lecture_seule(text)"] = rows[0]?.v ?? "absente";
    return etat;
  }
  async function definition(signature: string) {
    const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
    return rows[0].def as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it.each(FONCTIONS)("%s porte la marque de son correctif", async (signature, marque) => {
    expect(await definition(signature)).toContain(marque);
  });

  it("la fonction de classement des tâches est interne : fermée à anon et aux comptes connectés", async () => {
    const { rows: [r] } = await db.query(
      `select has_function_privilege('anon','public.tache_consigne_lecture_seule(text)','execute') as anon,
              has_function_privilege('authenticated','public.tache_consigne_lecture_seule(text)','execute') as connecte`
    );
    expect(r).toEqual({ anon: false, connecte: false });
  });

  it("la reprise de l'alerte porte sa marque et garde celle de 20261014221000 (leurs retours restent jouables)", async () => {
    const def = await definition("public.accuser_alerte_vacances(uuid)");
    expect(def).toContain(MARQUE_REPRISE);
    expect(def).toContain("Audit du 14/10 (SUP-03)");
  });

  it("rejouées sur une base déjà migrée, elles ne changent rien (deux fois de suite)", async () => {
    const avant = await empreinte();
    for (const migration of MIGRATIONS) await db.query(migration);
    expect(await empreinte()).toEqual(avant);
    for (const migration of MIGRATIONS) await db.query(migration);
    expect(await empreinte()).toEqual(avant);
  });

  it("appliquées aux définitions d'avant, elles redonnent exactement les définitions d'après (marche avant)", async () => {
    const apres = await empreinte();
    for (const avant of [AVANT_LOG, AVANT_ACCUSER, AVANT_DECIDER]) await db.query(avant);
    for (const [signature, marque] of FONCTIONS) expect(await definition(signature), signature).not.toContain(marque);
    expect(await definition("public.accuser_alerte_vacances(uuid)")).not.toContain(MARQUE_REPRISE);
    for (const migration of MIGRATIONS) await db.query(migration);
    for (const [signature, marque] of FONCTIONS) expect(await definition(signature), signature).toContain(marque);
    expect(await definition("public.accuser_alerte_vacances(uuid)")).toContain(MARQUE_REPRISE);
    expect(await empreinte()).toEqual(apres);
  });

  it("une définition inattendue (ni la marque, ni l'ancre) les arrête, une par une", async () => {
    await db.query("savepoint avant_log");
    await db.query("create or replace function public.log_sa_access(org uuid, sa_action text, sa_details jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path to '' as $f$ begin null; end $f$");
    await expect(db.query(TRAVERSEE)).rejects.toThrow(/SA-01 : définition inattendue/);
    await db.query("rollback to savepoint avant_log");

    await db.query("savepoint avant_accuser");
    await db.query("create or replace function public.accuser_alerte_vacances(p_id uuid) returns void language plpgsql security definer set search_path to '' as $f$ begin null; end $f$");
    await expect(db.query(ALERTE)).rejects.toThrow(/SUP-03 : définition inattendue/);
    await db.query("rollback to savepoint avant_accuser");

    // La reprise exige 20261014221000 : sur l'ancienne définition (sans sa marque), elle s'arrête sans rien changer.
    await db.query("savepoint avant_reprise");
    await db.query(AVANT_ACCUSER);
    await expect(db.query(REPRISE)).rejects.toThrow(/SUP-03 \(reprise\) : 20261014221000 doit être appliquée avant/);
    await db.query("rollback to savepoint avant_reprise");

    // Avec la marque de 20261014221000 mais sans la condition attendue, elle s'arrête aussi.
    await db.query("savepoint avant_reprise_ancre");
    await db.query("create or replace function public.accuser_alerte_vacances(p_id uuid) returns void language plpgsql security definer set search_path to '' as $f$ begin /* Audit du 14/10 (SUP-03) */ null; end $f$");
    await expect(db.query(REPRISE)).rejects.toThrow(/SUP-03 \(reprise\) : définition inattendue/);
    await db.query("rollback to savepoint avant_reprise_ancre");

    await db.query("savepoint avant_decider");
    await db.query("create or replace function public.decider_consigne(p_version uuid, p_accepter boolean) returns void language plpgsql security definer set search_path to '' as $f$ begin null; end $f$");
    await expect(db.query(CONSIGNE)).rejects.toThrow(/SUP-04 : définition inattendue/);
    await db.query("rollback to savepoint avant_decider");
  });
});
