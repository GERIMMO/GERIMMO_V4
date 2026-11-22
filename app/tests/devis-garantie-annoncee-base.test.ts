/**
 * DEVIS : LA GARANTIE ANNONCÉE PAR L'ARTISAN — audit palier 1 du 22/11/2026, P2-02 (seconde partie), côté base.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. à l'envoi d'un devis préparé, la garantie saisie par l'artisan est recopiée sur le devis déposé, sans espaces
 *     autour, 300 caractères au plus ; un second envoi ne change rien ; aucune notification de plus n'est créée ;
 *  2. sans garantie (clé absente, vide, espaces) : la colonne reste vide, comme pour tous les devis d'avant ;
 *  3. la contrainte refuse un texte vide, entouré d'espaces ou de plus de 300 caractères ;
 *  4. le gestionnaire de l'espace la lit avec le devis ; un autre espace ne lit rien ; l'artisan ne lit pas cette
 *     table (il relit son devis par ses propres écrans) ; personne ne la réécrit directement ;
 *  5. la migration se rejoue sans effet ; son retour rend la fonction mot pour mot et garde ce qui est écrit.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { GARANTIE_ANNONCEE_MAX } from "../src/lib/parcours-devis-artisan";

const NOM = "20261122235000_devis_garantie_annoncee";
const FONCTION = "public.envoyer_mon_devis_prepare(uuid,integer)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("garantie annoncée — manifeste, retour et borne (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/devis-garantie-annoncee-base.test.ts"');
  });

  it("l'écran borne le texte comme la base ; la migration n'ouvre rien et ne réécrit aucun devis existant", () => {
    expect(GARANTIE_ANNONCEE_MAX).toBe(300);
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("between 1 and 300");
    expect(sql).toContain("btrim(left(btrim(s->>'garantie',E' \\t\\n\\r'),300),E' \\t\\n\\r')");
    expect(sql).not.toMatch(/\bgrant\b|\bpolicy\b|disable row level security|poser_gardes_abonnement/i);
    // La seule écriture de données est celle du bloc ajouté à la fonction : aucun devis existant n'est touché.
    expect(sql.match(/update public\.incident_devis/g)).toHaveLength(1);
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop column|drop constraint|delete from public\.|truncate/i);
  });
});

describe.skipIf(!url)("garantie annoncée sur le devis (avec base)", () => {
  let db: Client;
  let org = "", lot = "", compte = "", gerant = "", etranger = "", artisan = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const utilisateur = () => id("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),gen_random_uuid()::text||'@test.local','{}','{}') returning id");
  async function agir(c: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [c]);
    await db.query("set local role authenticated");
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Une demande de devis et sa préparation validée, avec la saisie donnée ; rend l'identifiant de la demande. */
  async function demandePreparee(saisiePlus: Record<string, unknown>) {
    await base();
    const inc = await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','Test garantie','declare') returning id", [org, lot]);
    const cons = await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [org, inc]);
    const demande = await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'envoyee') returning id", [org, cons, inc, artisan]);
    const chemin = `${org}/${demande}.pdf`;
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)", [chemin, compte]);
    const saisie = { lignes: [{ code: "plomberie_heure", libelle: "Main-d’œuvre (h)", quantite: 2, prix_unitaire_ht_cents: 5000, tva_bps: 1000 }], diagnostic: "Joint usé", prestations: "Main-d’œuvre", delai: "Cinq jours", duree: "Deux heures", valideJusquAu: "2099-01-01", ...saisiePlus };
    await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,saisie,statut,entreprise,pdf_path,pdf_sha,pdf_taille,valide_le) values($1,$2,$3,'valide','{}',$4,$5,100,now())", [demande, artisan, JSON.stringify(saisie), chemin, createHash("sha256").update(demande).digest("hex")]);
    return demande;
  }
  async function envoyer(demande: string) {
    await agir(compte);
    const devis = String((await db.query("select public.envoyer_mon_devis_prepare($1,1) id", [demande])).rows[0].id);
    await base();
    return devis;
  }
  const garantie = async (devis: string) => (await db.query("select garantie_annoncee g from public.incident_devis where id=$1", [devis])).rows[0].g as string | null;
  const notifications = async (devis: string) => (await db.query("select count(*)::int n from public.notification_intentions where objet=$1", [devis])).rows[0].n as number;

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,status) values('Essai garantie fictif','active') returning id");
    const autre = await id("insert into public.organizations(name,status) values('Autre espace fictif','active') returning id");
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','immeuble','1 rue Test','75011','Paris') returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','disponible') returning id", [org, bien]);
    compte = await utilisateur(); gerant = await utilisateur(); etranger = await utilisateur();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [gerant, org, etranger, autre]);
    artisan = await id("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'Artisan fictif',$2,'0600000000','valide','verifie') returning id", [compte, `${Math.floor(Math.random() * 9e13) + 1e13}`]);
  });

  it("la garantie saisie est recopiée sur le devis déposé, sans espaces autour ; second envoi sans effet ; aucune notification de plus", async () => {
    const avec = await envoyer(await demandePreparee({ garantie: " \n Un an, pièces et main-d’œuvre \t\n " }));
    expect(await garantie(avec)).toBe("Un an, pièces et main-d’œuvre");
    const sans = await envoyer(await demandePreparee({}));
    expect(await garantie(sans)).toBeNull();
    // L'écriture de la garantie ne crée aucune notification de plus qu'un devis qui n'en porte pas.
    expect(await notifications(avec)).toBe(await notifications(sans));
    // Le reste du devis est celui d'avant.
    const { rows: [d] } = await db.query("select montant_ttc_cents::int ttc, statut::text, delai_intervention, duree_estimee, document_id is not null classe from public.incident_devis where id=$1", [avec]);
    expect(d).toEqual({ ttc: 11000, statut: "depose", delai_intervention: "Cinq jours", duree_estimee: "Deux heures", classe: true });
    expect((await db.query("select statut, devis_id from public.artisan_devis_preparations where devis_id=$1", [avec])).rows).toEqual([{ statut: "envoye", devis_id: avec }]);
  });

  it.each([
    ["clé absente", {}],
    ["texte vide", { garantie: "" }],
    ["espaces, tabulation et retours à la ligne seuls", { garantie: "   \n \t\r\n" }],
    ["valeur nulle", { garantie: null }],
  ])("sans garantie (%s) : la colonne reste vide", async (_cas, saisie) => {
    expect(await garantie(await envoyer(await demandePreparee(saisie)))).toBeNull();
  });

  it("au-delà de 300 caractères, la base ne garde que les 300 premiers, sans espace final", async () => {
    const long = await envoyer(await demandePreparee({ garantie: "g".repeat(400) }));
    expect(await garantie(long)).toBe("g".repeat(300));
    // Une coupe qui tomberait sur un espace ne laisse pas d'espace en fin de texte (la contrainte le refuserait).
    const coupe = await envoyer(await demandePreparee({ garantie: `${"g".repeat(299)} suite` }));
    expect(await garantie(coupe)).toBe("g".repeat(299));
  });

  it("la contrainte refuse un texte vide, entouré d'espaces ou trop long, même hors de l'application", async () => {
    const devis = await envoyer(await demandePreparee({ garantie: "Un an" }));
    for (const valeur of ["", "   ", " Un an", "Un an ", "Un an\n", "\tUn an", "\n", "g".repeat(301)]) {
      expect(await refus("update public.incident_devis set garantie_annoncee=$2 where id=$1", [devis, valeur]), JSON.stringify(valeur)).toMatch(/incident_devis_garantie_annoncee_bornee/);
    }
    expect(await refus("update public.incident_devis set garantie_annoncee=$2 where id=$1", [devis, "g".repeat(300)])).toBe("");
    expect(await refus("update public.incident_devis set garantie_annoncee=null where id=$1", [devis])).toBe("");
  });

  it("le gestionnaire de l'espace lit la garantie avec le devis ; un autre espace et l'artisan ne lisent pas la table ; personne ne la réécrit", async () => {
    const devis = await envoyer(await demandePreparee({ garantie: "Deux ans sur la robinetterie" }));
    await agir(gerant);
    expect((await db.query("select garantie_annoncee g from public.incident_devis where id=$1", [devis])).rows).toEqual([{ g: "Deux ans sur la robinetterie" }]);
    for (const lecteur of [etranger, compte]) {
      await agir(lecteur);
      expect((await db.query("select garantie_annoncee g from public.incident_devis where id=$1", [devis])).rows, lecteur).toEqual([]);
    }
    // Ni le gestionnaire ni l'artisan ne peuvent la réécrire directement.
    for (const acteur of [gerant, compte, etranger]) {
      await agir(acteur);
      const essai = await refus("update public.incident_devis set garantie_annoncee='Dix ans' where id=$1", [devis]);
      await base();
      expect(await garantie(devis), `${acteur} ${essai}`).toBe("Deux ans sur la robinetterie");
    }
  });

  it("rejeu sans effet ; le retour rend la fonction mot pour mot et garde ce qui est écrit ; la migration se rejoue", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const definition = async () => String((await db.query("select pg_get_functiondef($1::regprocedure) d", [FONCTION])).rows[0].d);
    const droits = async () => (await db.query("select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte", [FONCTION])).rows[0];
    const colonne = async () => (await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='incident_devis' and column_name='garantie_annoncee'")).rows[0].n as number;

    const avant = await envoyer(await demandePreparee({ garantie: "Un an" }));
    const posee = await definition();
    expect(posee.match(/P2-02 garantie annoncée/g)).toHaveLength(1);
    await db.query(migration);
    expect(await definition()).toBe(posee);
    expect(await droits()).toEqual({ anon: false, connecte: true });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122235000','devis_garantie_annoncee') on conflict do nothing");
    await db.query(retour);
    const rendue = await definition();
    // Mot pour mot la fonction d'avant : la définition posée, moins les quatre lignes du bloc.
    expect(rendue).not.toContain("garantie");
    expect(rendue).toContain("D18 complément 16/10 conserver la préparation");
    expect(posee.split("\n").filter((l) => !rendue.split("\n").includes(l))).toHaveLength(4);
    expect(rendue.split("\n").filter((l) => !posee.split("\n").includes(l))).toEqual([]);
    expect(await droits()).toEqual({ anon: false, connecte: true });
    expect(await colonne()).toBe(1);
    expect(await garantie(avant)).toBe("Un an");
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122235000'")).rows[0].n).toBe(0);
    // Avec la fonction d'avant, un devis s'envoie comme avant et sa garantie n'est plus recopiée.
    expect(await garantie(await envoyer(await demandePreparee({ garantie: "Un an" })))).toBeNull();
    await db.query(retour);
    expect(await definition()).toBe(rendue);

    await db.query(migration);
    expect(await definition()).toBe(posee);
    expect(await droits()).toEqual({ anon: false, connecte: true });
    expect(await garantie(avant)).toBe("Un an");
    expect(await garantie(await envoyer(await demandePreparee({ garantie: "Six mois" })))).toBe("Six mois");
  });
});
