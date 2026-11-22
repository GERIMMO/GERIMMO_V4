/**
 * LE GESTIONNAIRE CORRIGE L'URGENCE D'UN INCIDENT — audit palier 1 du 22/11/2026, P1-04.
 *
 * Le défaut : l'urgence était fixée une fois pour toutes à la déclaration ; aucune fonction ne la modifiait ensuite.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. le propriétaire de l'espace corrige dans les deux sens, tant que l'incident n'est pas clos ; l'ancien niveau, le
 *     nouveau et le motif sont au fil du dossier, sous son nom ;
 *  2. motif obligatoire et borné ; même niveau refusé ; incident clos refusé ; incident d'un autre espace introuvable ;
 *  3. ni le locataire, ni un compte étranger à l'espace, ni un visiteur ne peuvent corriger ;
 *  4. la liste fermée des types d'événement gagne un type et n'en perd aucun ; la migration se rejoue sans effet ;
 *     son retour supprime la fonction, et ne retire le type que si aucun dossier ne le porte.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { MOTIF_CORRECTION_URGENCE, TYPES_EVENEMENT_INCIDENT, URGENCES_INCIDENT } from "../src/lib/incidents";

const NOM = "20261122140000_incident_urgence_corrigee";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const MOTIF = "La fuite est arrêtée, le logement reste utilisable.";

describe("correction de l'urgence — manifeste, retour et libellés (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/incident-urgence-corrigee-base.test.ts"');
  });

  it("le fil du dossier sait nommer l'événement, et l'écran borne le motif comme la base", () => {
    expect(TYPES_EVENEMENT_INCIDENT.urgence_corrigee).toBe("Urgence corrigée par le gestionnaire");
    expect(URGENCES_INCIDENT).toEqual({ normale: "Normale", urgente: "Urgente" });
    expect(MOTIF_CORRECTION_URGENCE).toEqual({ min: 5, max: 500 });
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    expect(sql).toContain("not between 5 and 500");
    expect(sql.replace(/^\s*--.*$/gm, "")).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
  });
});

describe.skipIf(!url)("correction de l'urgence d'un incident (avec base)", () => {
  let db: Client;
  let org = "", autreOrg = "", proprietaire = "", locataire = "", etranger = "", incident = "", incidentAilleurs = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  async function compte() {
    return id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const corriger = (urgence: string | null, motif: string | null = MOTIF, cible = incident, espace = org) =>
    refus("select public.corriger_urgence_incident($1,$2,$3::public.incident_urgence,$4)", [espace, cible, urgence, motif]);
  const urgence = async (cible = incident) => { await base(); return (await db.query("select urgence::text u from public.incidents where id=$1", [cible])).rows[0].u as string; };
  const fil = async () => { await base(); return (await db.query("select type, acteur_account_id, details from public.incident_evenements where incident_id=$1 and type='urgence_corrigee' order by created_at, id", [incident])).rows; };

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai urgence fictif','proprietaire_direct','active') returning id");
    autreOrg = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    proprietaire = await compte(); locataire = await compte(); etranger = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire'),($4,$5,'proprietaire_direct')", [proprietaire, org, locataire, etranger, autreOrg]);
    const creer = async (espace: string, numero: string) => {
      const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [espace]);
      const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id", [espace, bien]);
      return id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description,etat,urgence) values($1,$2,$3,'agence','plomberie_canalisation','TEST urgence fictif','declare','urgente') returning id", [espace, lot, numero]);
    };
    incident = await creer(org, `TEST-URG-${Date.now()}`);
    incidentAilleurs = await creer(autreOrg, `TEST-URG-A-${Date.now()}`);
  });

  it("le propriétaire corrige dans les deux sens ; ancien niveau, nouveau niveau et motif sont au fil, sous son nom", async () => {
    await agir(proprietaire);
    expect(await corriger("normale")).toBe("");
    expect(await urgence()).toBe("normale");
    await agir(proprietaire);
    expect(await corriger("urgente", "  Plus d’eau chaude depuis deux jours.  ")).toBe("");
    expect(await urgence()).toBe("urgente");
    // Les deux corrections sont dans la même transaction de test : même horodatage, donc pas d'ordre garanti entre elles.
    const lignes = await fil();
    expect(lignes).toHaveLength(2);
    expect(lignes).toEqual(expect.arrayContaining([
      { type: "urgence_corrigee", acteur_account_id: proprietaire, details: { urgence: "normale", urgence_precedente: "urgente", motif: MOTIF } },
      { type: "urgence_corrigee", acteur_account_id: proprietaire, details: { urgence: "urgente", urgence_precedente: "normale", motif: "Plus d’eau chaude depuis deux jours." } },
    ]));
  });

  it("motif obligatoire et borné, niveau obligatoire, même niveau refusé : rien n'est écrit", async () => {
    await agir(proprietaire);
    for (const motif of [null, "", "   ", "abcd", "x".repeat(501)]) expect(await corriger("normale", motif), String(motif).slice(0, 8)).toMatch(/motif de la correction/);
    expect(await corriger(null)).toMatch(/niveau d'urgence/);
    expect(await corriger("urgente")).toMatch(/déjà à ce niveau/);
    expect(await corriger("normale", "abcde")).toBe("");
    await agir(proprietaire);
    expect(await corriger("normale", "x".repeat(500))).toMatch(/déjà à ce niveau/);
    expect(await urgence()).toBe("normale");
    expect(await fil()).toHaveLength(1);
  });

  it("un incident clos ne se corrige plus ; les autres états, oui", async () => {
    for (const etat of ["qualifie", "affecte", "en_cours", "termine", "rouvert"]) {
      await base();
      // Un dossier qualifié ou plus avancé porte son imputation et sa justification (contrainte de la table).
      await db.query("update public.incidents set etat=$2::public.incident_etat, urgence='urgente', imputation='proprietaire', imputation_justification='TEST fictif' where id=$1", [incident, etat]);
      await agir(proprietaire);
      expect(await corriger("normale"), etat).toBe("");
    }
    await base();
    await db.query("update public.incidents set etat='clos', clos_le=now(), cloture_motif='resolu' where id=$1", [incident]);
    await agir(proprietaire);
    expect(await corriger("urgente")).toMatch(/clos/);
    expect(await urgence()).toBe("normale");
  });

  it("ni le locataire, ni un compte d'un autre espace, ni un visiteur ne corrigent ; un autre espace reste hors de portée", async () => {
    await agir(locataire);
    expect(await corriger("normale")).toMatch(/Accès refusé|hors de votre portefeuille/);
    await agir(etranger);
    expect(await corriger("normale")).toMatch(/Accès refusé|hors de votre portefeuille/);
    // Le propriétaire d'un espace ne touche pas l'incident d'un autre, même en donnant son propre espace.
    await agir(proprietaire);
    expect(await corriger("normale", MOTIF, incidentAilleurs, org)).toMatch(/Incident introuvable|hors de votre portefeuille/);
    expect(await corriger("normale", MOTIF, incidentAilleurs, autreOrg)).toMatch(/Accès refusé|hors de votre portefeuille/);
    await agir(null, "anon");
    expect(await corriger("normale")).toMatch(/permission denied/);
    expect(await urgence()).toBe("urgente");
    expect(await urgence(incidentAilleurs)).toBe("urgente");
    expect(await fil()).toEqual([]);
  });

  it("la liste des types gagne un type sans en perdre ; rejeu sans effet ; le retour garde le type tant qu'un dossier le porte", async () => {
    await base();
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const contrainte = async () => (await db.query("select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.incident_evenements'::regclass and conname='incident_evenements_type_check'")).rows[0].d as string;
    const types = (definition: string) => [...definition.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    const fonction = async () => (await db.query("select count(*)::int n from pg_proc where oid = to_regprocedure('public.corriger_urgence_incident(uuid,uuid,public.incident_urgence,text)')")).rows[0].n === 1;

    const avec = await contrainte();
    expect(types(avec)).toContain("urgence_corrigee");
    // Chaque type que l'écran sait nommer est admis par la base, et inversement pour le nouveau.
    for (const t of Object.keys(TYPES_EVENEMENT_INCIDENT)) expect(types(avec), t).toContain(t);
    await db.query(migration);
    expect(await contrainte()).toBe(avec);
    expect(await fonction()).toBe(true);

    // Un dossier porte une correction : le retour supprime la fonction, pas le type.
    await agir(proprietaire);
    expect(await corriger("normale")).toBe("");
    await base();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122140000','incident_urgence_corrigee') on conflict do nothing");
    await db.query(retour);
    expect(await fonction()).toBe(false);
    expect(await contrainte()).toBe(avec);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122140000'")).rows[0].n).toBe(0);
    expect(await urgence()).toBe("normale");
    expect(await fil()).toHaveLength(1);

    // Plus aucun dossier ne le porte : le retour rend la liste d'avant, exactement, et se rejoue sans effet.
    await db.query("delete from public.incident_evenements where type='urgence_corrigee'");
    await db.query(retour);
    const sans = await contrainte();
    expect(types(sans)).toEqual(types(avec).filter((t) => t !== "urgence_corrigee"));
    await db.query(retour);
    expect(await contrainte()).toBe(sans);

    await db.query(migration);
    expect(await contrainte()).toBe(avec);
    expect(await fonction()).toBe(true);
    expect((await db.query("select has_function_privilege('anon','public.corriger_urgence_incident(uuid,uuid,public.incident_urgence,text)','execute') a, has_function_privilege('authenticated','public.corriger_urgence_incident(uuid,uuid,public.incident_urgence,text)','execute') c")).rows[0]).toEqual({ a: false, c: true });
  });
});
