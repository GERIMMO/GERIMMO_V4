/**
 * Migration 20261014710000 (avoir d'une facture externe, D24-C) et son retour arrière : la migration se rejoue sans effet,
 * s'arrête sur une définition inattendue, pose ses blocs sur les définitions d'avant ; le retour retire exactement ce
 * qu'elle ajoute (aller, retour, aller), refuse dès qu'un avoir existe, et se rejoue sans effet.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin. Le retour (DDL sur
 * artisan_factures_externes, table des avoirs supprimée puis recréée) pose des verrous de table pendant le fichier : il
 * tourne dans le groupe « serie » de vitest.config.ts. La fermeture à anon est écartée du rejeu (elle réécrit les droits
 * de TOUTES les fonctions de `public`) ; sa présence en fin de fichier est vérifiée.
 */
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const NOM = "20261014710000_artisan_avoir_facture_externe";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const LISEZ_MOI = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");

const rejouable = (sql: string) => sql.replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");
/** Le retour gère sa propre transaction et refuse de se jouer dans un lot : on lui retire cette enveloppe seule. */
const sansEnveloppe = (script: string) =>
  script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "")
    .replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");

const EXTERNE = "public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)";
const REGLEMENT = "public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)";
const LECTURE = "public.mon_activite_artisan_privee()";
const MARQUE = "-- >> Audit du 14/10 (ARC-07, D24-C)";
const GARDE = "not(p_action in ('facture','annuler_facture') and h.statut='termine')";
const GARDE_ORIGINE = "not(p_action='facture' and h.statut='termine')";
const CLE_AVOIRS =
  "'avoirs',coalesce((select jsonb_agg(to_jsonb(av)||jsonb_build_object('facture_numero',fe.numero,'chantier_id',fe.chantier_id) order by av.rang) from public.artisan_avoirs_externes av join public.artisan_factures_externes fe on fe.id=av.facture_id where av.artisan_id=a),'[]'),\n ";
const CLE_ANNULEE = "'annulee_le',f.annulee_le,";

describe("Lot avoir-facture-externe — fichiers de migration et de retour arrière (sans base)", () => {
  it("la migration est au manifeste, une fois, après celles qu'elle relit (310000, 311000) et la fonction du jour de Paris", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    const i = manifeste.indexOf(`${NOM}.sql`);
    expect(i).toBeGreaterThan(0);
    expect(manifeste.filter((m) => m === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261014310000_artisan_facture_numero_unique.sql", "20261014311000_artisan_exclusion_ecritures.sql", "20261014500000_jour_de_paris_fonction.sql"]) {
      expect(manifeste.indexOf(avant), avant).toBeGreaterThanOrEqual(0);
      expect(manifeste.indexOf(avant), avant).toBeLessThan(i);
    }
  });

  it("elle ferme les fonctions à anon, nomme son retour arrière, et ne lit jamais le jour de la session", () => {
    expect(MIGRATION.trimEnd().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    const code = MIGRATION.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/current_date/i);
    expect(code).toContain("public.aujourdhui_paris()");
  });

  it("elle ne réécrit aucune donnée : ni update ni delete de ligne existante, ni truncate", () => {
    const code = MIGRATION.replace(/^\s*--.*$/gm, "").replace(/\$nouveau\$[\s\S]*?\$nouveau\$/g, "");
    // « before truncate on » (le déclencheur qui l'interdit) n'est pas un vidage.
    expect(code).not.toMatch(/\b(update\s+public\.\w+\s+set|delete\s+from|truncate\s+(table\s+)?public\.)/i);
  });

  it("les marques du retour sont celles que la migration pose (et celles-là seulement)", () => {
    expect(MIGRATION).toMatch(/\$nouveau\$-- >> Audit du 14\/10 \(ARC-07, D24-C\)/);
    expect(MIGRATION).toMatch(/  -- << Audit du 14\/10 \(ARC-07, D24-C\)\n  \$nouveau\$ \|\| v_branche\);/);
    expect(MIGRATION).toMatch(/v_ancre \|\| \$nouveau\$\n  -- >> Audit du 14\/10 \(ARC-07, D24-C\)/);
    expect(MIGRATION).toMatch(/  -- << Audit du 14\/10 \(ARC-07, D24-C\)\$nouveau\$\);/);
    expect(RETOUR).toContain("v_fin text := E'-- << Audit du 14/10 (ARC-07, D24-C)\\n  ';");
    expect(RETOUR).toContain("v_debut text := E'\\n  -- >> Audit du 14/10 (ARC-07, D24-C)';");
    expect(RETOUR).toContain(GARDE);
    expect(RETOUR).toContain(GARDE_ORIGINE);
    expect(RETOUR).toContain(CLE_ANNULEE);
  });

  it("le retour refuse de se jouer dans un lot, gère sa transaction, retire sa version, et ferme à anon", () => {
    expect(RETOUR).toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
    expect(RETOUR).toMatch(/^begin;$/m);
    expect(RETOUR).toMatch(/^commit;$/m);
    expect(RETOUR).toContain("where version = '20261014710000'");
    expect(RETOUR).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne réécrit ni ne supprime aucune ligne métier, et rien en cascade", () => {
    const code = RETOUR.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/\b(truncate|update\s+public\.|insert\s+into)\b/i);
    for (const m of code.matchAll(/delete\s+from\s+([\w.]+)/gi)) expect(m[1]).toBe("supabase_migrations.schema_migrations");
    expect(code).not.toMatch(/cascade/i);
    expect(code).toMatch(/RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : % avoir\(s\) émis/);
  });

  it("le LISEZ-MOI des retours arrière cite le script", () => {
    expect(LISEZ_MOI).toContain(`${NOM}.retour.sql`);
  });
});

describe.skipIf(!DB_URL)("Lot avoir-facture-externe — rejeu et retour arrière sur une base déjà migrée", () => {
  let db: Client;

  const definition = async (signature: string) => (await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature])).rows[0].def as string;
  /** Tout ce que la migration peut changer : définitions et droits des trois fonctions, objets de schéma. */
  async function empreinte() {
    const etat: Record<string, string> = {};
    for (const signature of [EXTERNE, REGLEMENT, LECTURE]) {
      const { rows } = await db.query(
        "select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = $1::text::regprocedure",
        [signature]
      );
      etat[signature] = rows[0].v;
    }
    const { rows } = await db.query(`select
      to_regclass('public.artisan_avoirs_externes') is not null as table_avoirs,
      to_regprocedure('public.artisan_avoirs_externes_garde()') is not null as fonction_garde,
      (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = to_regclass('public.artisan_avoirs_externes') and not tgisinternal) as declencheurs,
      exists(select 1 from pg_attribute where attrelid = 'public.artisan_factures_externes'::regclass and attname = 'annulee_le' and not attisdropped) as colonne,
      (select pg_get_indexdef(to_regclass('public.artisan_factures_externes_chantier_en_vigueur_key'))) as index_en_vigueur,
      exists(select 1 from pg_constraint where conrelid = 'public.artisan_factures_externes'::regclass and conname = 'artisan_factures_externes_chantier_id_key') as contrainte_origine,
      (select relacl::text from pg_class where oid = to_regclass('public.artisan_avoirs_externes')) as droits_table,
      (select string_agg(polname, ',') from pg_policy where polrelid = to_regclass('public.artisan_avoirs_externes')) as politiques`);
    for (const [cle, valeur] of Object.entries(rows[0])) etat[cle] = String(valeur);
    return etat;
  }
  /** Les définitions d'avant la migration, reconstituées à partir de celles d'aujourd'hui (les blocs retirés à la main). */
  async function definitionsAvant() {
    const externe = await definition(EXTERNE);
    const debut = externe.indexOf(MARQUE);
    const fin = externe.indexOf("-- << Audit du 14/10 (ARC-07, D24-C)\n  ") + "-- << Audit du 14/10 (ARC-07, D24-C)\n  ".length;
    const reglement = await definition(REGLEMENT);
    const debutR = reglement.indexOf(`\n  ${MARQUE}`);
    const finR = reglement.indexOf("-- << Audit du 14/10 (ARC-07, D24-C)") + "-- << Audit du 14/10 (ARC-07, D24-C)".length;
    return {
      [EXTERNE]: (externe.slice(0, debut) + externe.slice(fin)).replace(GARDE, GARDE_ORIGINE),
      [REGLEMENT]: reglement.slice(0, debutR) + reglement.slice(finR),
      [LECTURE]: (await definition(LECTURE)).replace(CLE_AVOIRS, "").replace(CLE_ANNULEE, ""),
    };
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it("les trois fonctions portent la marque une seule fois ; la table, le déclencheur et l'index existent", async () => {
    for (const signature of [EXTERNE, REGLEMENT]) expect((await definition(signature)).split(MARQUE), signature).toHaveLength(2);
    expect((await definition(EXTERNE)).split(GARDE)).toHaveLength(2);
    expect((await definition(LECTURE)).split(CLE_AVOIRS)).toHaveLength(2);
    expect((await definition(LECTURE)).split(CLE_ANNULEE)).toHaveLength(2);
    const e = await empreinte();
    expect(e).toMatchObject({ table_avoirs: "true", fonction_garde: "true", colonne: "true", contrainte_origine: "false", declencheurs: "artisan_avoirs_externes_sans_vidage,artisan_avoirs_externes_suite" });
    expect(e.index_en_vigueur).toMatch(/UNIQUE INDEX artisan_factures_externes_chantier_en_vigueur_key .*\(chantier_id\) WHERE \(annulee_le IS NULL\)/);
  });

  it("les ancres des migrations antérieures restent présentes une seule fois (ARC-04, ARC-08, ARC-10 se rejouent)", async () => {
    const externe = await definition(EXTERNE);
    for (const ancre of [
      "insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,justification,piece_id) values(a,h.id,d.id,btrim(p_donnees->>'numero')",
      "raise exception 'Clients externes : saisie désactivée'; end if;",
    ]) expect(externe.split(ancre), ancre).toHaveLength(2);
    expect((await definition(LECTURE)).split("'reglements',public.artisan_module_actif('reglements')")).toHaveLength(2);
    // Le jour de Paris de la branche nouvelle passe par la fonction du lot, jamais par current_date ni l'expression d'ARC-10.
    const bloc = externe.slice(externe.indexOf(MARQUE), externe.indexOf("-- << Audit du 14/10 (ARC-07, D24-C)"));
    expect(bloc).toContain("public.aujourdhui_paris()");
    expect(bloc).not.toMatch(/current_date|at time zone/i);
  });

  it("rejouée deux fois de suite, elle ne change rien", async () => {
    const avant = await empreinte();
    await db.query(rejouable(MIGRATION));
    await db.query(rejouable(MIGRATION));
    expect(await empreinte()).toEqual(avant);
  });

  it("une définition inattendue l'arrête, pour chacune des trois fonctions", async () => {
    const cas: [string, string, RegExp][] = [
      [`create or replace function public.artisan_externe_ecrire(p_action text, p_id uuid, p_revision integer, p_donnees jsonb, p_cle uuid)
        returns uuid language plpgsql security definer set search_path to '' as $f$ begin return null; end $f$`, EXTERNE, /ARC-07 \(écriture\) : définition inattendue/],
      [`create or replace function public.artisan_reglement_ecrire(p_action text, p_origine text, p_facture uuid, p_donnees jsonb, p_cle uuid)
        returns uuid language plpgsql security definer set search_path to '' as $f$ begin return null; end $f$`, REGLEMENT, /ARC-07 \(règlement\) : définition inattendue/],
      [`create or replace function public.mon_activite_artisan_privee() returns jsonb
        language plpgsql stable security definer set search_path to '' as $f$ begin return '{}'::jsonb; end $f$`, LECTURE, /ARC-07 \(lecture\) : définition inattendue/],
    ];
    for (const [remplacante, signature, message] of cas) {
      await db.query("savepoint inattendue");
      await db.query(remplacante);
      await expect(db.query(rejouable(MIGRATION)), signature).rejects.toThrow(message);
      await db.query("rollback to savepoint inattendue");
    }
  });

  it("une garde du chantier terminé répétée (ancre en double) l'arrête aussi, sans rien écrire", async () => {
    const avant = (await definitionsAvant())[EXTERNE];
    const double = avant.replace(GARDE_ORIGINE, `${GARDE_ORIGINE} and ${GARDE_ORIGINE}`);
    await db.query(double);
    await expect(db.query(rejouable(MIGRATION))).rejects.toThrow(/garde du chantier terminé est absente ou répétée/);
  });

  it("sur les définitions d'avant, elle pose ses blocs une seule fois et redonne exactement l'état migré", async () => {
    const migre = await empreinte();
    const avant = await definitionsAvant();
    for (const def of Object.values(avant)) await db.query(def);
    for (const signature of [EXTERNE, REGLEMENT]) expect(await definition(signature)).not.toContain("D24-C");
    expect(await definition(LECTURE)).not.toContain("'avoirs'");
    await db.query(rejouable(MIGRATION));
    expect(await empreinte()).toEqual(migre);
  });

  it("aller, retour, aller : le retour redonne les définitions d'avant et le schéma d'avant ; la migration, l'état migré", async () => {
    const migre = await empreinte();
    const avant = await definitionsAvant();
    await db.query(sansEnveloppe(RETOUR));
    for (const signature of [EXTERNE, REGLEMENT, LECTURE]) expect(await definition(signature), signature).toBe(avant[signature]);
    expect(await empreinte()).toMatchObject({ table_avoirs: "false", fonction_garde: "false", colonne: "false", contrainte_origine: "true", index_en_vigueur: "null" });
    // Rejoué, le retour ne change plus rien.
    const defait = await empreinte();
    await db.query(sansEnveloppe(RETOUR));
    expect(await empreinte()).toEqual(defait);
    await db.query(rejouable(MIGRATION));
    expect(await empreinte()).toEqual(migre);
  });

  it("le retour refuse dès qu'un avoir a été émis, sans rien modifier", async () => {
    // Une facture annulée et son avoir, joués par la fonction elle-même (module activé dans cette transaction).
    await db.query("update public.artisan_modules_locaux set actif=true");
    const uid = randomUUID();
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'x',now())", [uid, `lot-avoir-retour-${uid}@example.invalid`]);
    const artisan = (await db.query("insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'TEST retour avoir',$2,'0600000000') returning id", [uid, String(randomInt(10000000000000, 99999999999999))])).rows[0].id as string;
    const client = (await db.query("insert into public.artisan_clients(artisan_id,nom,type,adresse) values($1,'Client TEST','particulier','1 rue fictive') returning id", [artisan])).rows[0].id as string;
    const piece = (await db.query("insert into public.artisan_pieces_privees(artisan_id,storage_path,nom,mime,taille,sha256,created_by) values($1,$2,'TEST','application/pdf',100,$3,$4) returning id", [artisan, `${artisan}/${randomUUID()}.test`, "a".repeat(64), uid])).rows[0].id as string;
    const chantier = (await db.query("insert into public.artisan_chantiers(artisan_id,client_id,titre,adresse,description,statut,bilan,photo_id) values($1,$2,'TEST','1 rue fictive','TEST','termine','Bilan fictif',$3) returning id", [artisan, client, piece])).rows[0].id as string;
    const devis = (await db.query("insert into public.artisan_devis_externes(artisan_id,chantier_id,version,statut,description,lignes,montant_ht_cents,montant_tva_cents,montant_ttc_cents,entreprise,client,valide_jusqu_au) values($1,$2,1,'accepte','TEST','[]',5000,500,5500,'{}','{}',public.aujourdhui_paris()+30) returning id", [artisan, chantier])).rows[0].id as string;
    const facture = (await db.query("insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,piece_id) values($1,$2,$3,'ART-RETOUR-1',5500,$4) returning id", [artisan, chantier, devis, piece])).rows[0].id as string;
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [uid]);
    await db.query("set local role authenticated");
    await db.query("select public.artisan_externe_ecrire('annuler_facture',$1,1,$2,$3)", [chantier, { facture_id: facture, motif: "Erreur de numéro fictive" }, randomUUID()]);
    await db.query("reset role");
    const avant = await empreinte();
    await expect(db.query(sansEnveloppe(RETOUR))).rejects.toThrow(/RETOUR ARRIÈRE REFUSÉ, rien n'a été modifié : 1 avoir\(s\) émis, 1 facture\(s\) annulée\(s\)/);
    await db.query("rollback to savepoint cas");
    await db.query("savepoint cas");
    expect(await empreinte()).toEqual(avant);
  });

  it("dans un lot (begin; de migrations.yml), le retour refuse de se jouer", async () => {
    await expect(db.query(RETOUR)).rejects.toThrow(/Retour arrière refusé : ce script gère sa propre transaction/);
  });
});
