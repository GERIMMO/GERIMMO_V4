/**
 * D16 (fiche ART-15), décision du dirigeant du 14/10/2026, option A : la photo jointe par le locataire est visible de l'artisan dès
 * la demande de devis, en lecture seule, par URL signée de courte durée ; aucune lecture ni écrasement par d'autres ; la politique
 * de stockage ne change pas.
 *
 * Deux parties :
 *   1. la base (transaction annulée à la fin, base locale jetable déjà migrée) : qui voit quelles photos, la trace d'accès, la
 *      politique de stockage inchangée ;
 *   2. le serveur (clients simulés) : l'URL signée de 60 secondes n'est délivrée qu'après le contrôle du droit.
 * Ce qui n'est PAS essayé ici : le vrai service Storage de Supabase (voir le rapport de lot).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "supabase/migrations/20261014233000_photos_demande_devis_artisan.sql";

describe.skipIf(!DB_URL)("D16 — photos du locataire visibles de l'artisan : la base", () => {
  let db: Client;
  let org: string, incident: string, autreIncident: string, consultation: string, sollicitation: string, intervention: string;
  let compteArtisan: string, compteAutreArtisan: string, compteLocataire: string, compteProprietaire: string, compteSa: string;
  let artisan: string;
  let photo1: string, photo2: string, photoAgence: string, photoPurgee: string, piece: string, photoAutreIncident: string;

  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  const utilisateur = () => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-d16-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
  const postgres = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const agir = async (compte: string | null, role = "authenticated", aal = "aal2") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role, aal })]);
    await db.query(`set local role ${role}`);
  };
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
    finally { await db.query("release savepoint refus"); }
  };
  const photosDeLaDemande = async () => (await db.query("select * from public.mes_photos_incident_artisan($1, null)", [sollicitation])).rows;
  const accesLog = async () => (await db.query("select * from public.acces_pieces_log where account_id=$1 order by created_at", [compteArtisan])).rows;
  const document = async (type: string, deposePar: string | null, cible: string, extra = "") => {
    const doc = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by ${extra ? ",purged_at" : ""})
      values($1,$2::public.document_type,'Photo de test',$3,'image/jpeg',1000,md5(random()::text),$4 ${extra ? ",now()" : ""}) returning id`,
      [org, type, `${org}/${cible}.jpg`, deposePar]);
    return doc;
  };
  const lier = (doc: string, inc: string) => db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'incident',$3)", [doc, org, inc]);

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL }); await db.connect(); await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Agence D16','active','agence') returning id");
    [compteArtisan, compteAutreArtisan, compteLocataire, compteProprietaire, compteSa] = [await utilisateur(), await utilisateur(), await utilisateur(), await utilisateur(), await utilisateur()];
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'locataire'),($3,$2,'admin_agence'),($4,null,'super_admin')", [compteLocataire, org, compteProprietaire, compteSa]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'TESTD16','Locataire',$2) returning id", [org, compteLocataire]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien D16','appartement','1 rue du Test','75001','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot D16') returning id", [org, bien]);
    incident = await id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description,declarant_person_id) values($1,$2,'INC-D16-1','espace_locataire','plomberie_canalisation','Fuite de test',$3) returning id", [org, lot, locataire]);
    autreIncident = await id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description,declarant_person_id) values($1,$2,'INC-D16-2','espace_locataire','plomberie_canalisation','Autre fuite',$3) returning id", [org, lot, locataire]);
    artisan = await id("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme) values($1,'Artisan D16',lpad((random()*10^13)::bigint::text,14,'0'),'0600000000','valide') returning id", [compteArtisan]);
    await db.query("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme) values($1,'Autre artisan D16',lpad((random()*10^13)::bigint::text,14,'0'),'0600000001','valide') returning id", [compteAutreArtisan]);
    consultation = await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [org, incident]);
    sollicitation = await id("insert into public.incident_sollicitations(organization_id,incident_id,consultation_id,artisan_id) values($1,$2,$3,$4) returning id", [org, incident, consultation, artisan]);
    intervention = await id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id", [org, incident, artisan]);
    // Les photos : deux du locataire (visibles), puis tout ce qui ne doit pas l'être.
    photo1 = await document("photo_incident", compteLocataire, "loc-1"); await lier(photo1, incident);
    photo2 = await document("photo_incident", compteLocataire, "loc-2"); await lier(photo2, incident);
    photoAgence = await document("photo_incident", compteProprietaire, "agence-1"); await lier(photoAgence, incident);
    photoPurgee = await document("photo_incident", compteLocataire, "loc-purgee", "purgee"); await lier(photoPurgee, incident);
    piece = await document("piece_identite", compteLocataire, "piece-identite"); await lier(piece, incident);
    photoAutreIncident = await document("photo_incident", compteLocataire, "loc-autre"); await lier(photoAutreIncident, autreIncident);
    // L'ordre d'affichage ne dépend que de la date de dépôt : photo1 avant photo2.
    await db.query("update public.documents set created_at = now() - interval '2 minutes' where id=$1", [photo1]);
    await db.query("update public.documents set created_at = now() - interval '1 minute' where id=$1", [photo2]);
    for (const doc of [photo1, photo2, photoAgence, piece, photoAutreIncident]) {
      await db.query("insert into storage.objects(bucket_id,name) values('documents',(select storage_path from public.documents where id=$1))", [doc]);
    }
  });
  beforeEach(async () => { await postgres(); await db.query("savepoint cas"); });
  afterEach(async () => { await postgres(); await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("la liste des photos visibles", () => {
    it("l'artisan destinataire de la demande voit les deux photos du locataire, dans l'ordre de dépôt, sans chemin ni auteur", async () => {
      await agir(compteArtisan);
      const photos = await photosDeLaDemande();
      expect(photos.map((p) => p.document_id)).toEqual([photo1, photo2]);
      expect(photos.map((p) => p.rang)).toEqual([1, 2]);
      expect(Object.keys(photos[0]).sort()).toEqual(["document_id", "mime_type", "rang"]);
      expect(photos[0].mime_type).toBe("image/jpeg");
    });

    it("ne rend ni la photo de l'agence, ni la photo purgée, ni une pièce d'identité, ni la photo d'un autre incident", async () => {
      await agir(compteArtisan);
      const ids = (await photosDeLaDemande()).map((p) => p.document_id);
      for (const interdit of [photoAgence, photoPurgee, piece, photoAutreIncident]) expect(ids).not.toContain(interdit);
    });

    it("les autres comptes ne voient rien : autre artisan, locataire, gérant, supervision, anonyme", async () => {
      for (const compte of [compteAutreArtisan, compteLocataire, compteProprietaire, compteSa]) {
        await agir(compte);
        expect(await photosDeLaDemande(), String(compte)).toHaveLength(0);
      }
      await agir(null, "anon");
      expect(await refus("select * from public.mes_photos_incident_artisan($1, null)", [sollicitation])).toMatch(/permission denied/);
    });

    it.each([["envoyee", 2], ["devis_depose", 2], ["retenue", 2], ["declinee", 0], ["non_retenue", 0], ["expiree", 0], ["annulee", 0]])(
      "demande de devis « %s » : %i photo(s)", async (statut, attendu) => {
        await db.query("update public.incident_sollicitations set statut=$2::public.sollicitation_statut where id=$1", [sollicitation, statut]);
        await agir(compteArtisan);
        expect(await photosDeLaDemande()).toHaveLength(attendu);
      }
    );

    it.each([["proposee", 2], ["acceptee", 2], ["planifiee", 2], ["en_cours", 2], ["terminee", 0], ["refusee", 0], ["annulee", 0]])(
      "mission « %s » : %i photo(s)", async (statut, attendu) => {
        await postgres();
        await db.query("set local session_replication_role = replica");
        // Les motifs et dates que les contraintes exigent selon l'état (refus motivé, annulation motivée, fin).
        await db.query(
          `update public.incident_interventions set statut=$2::public.intervention_statut,
             refus_motif = case when $2 = 'refusee' then 'Motif de test' else refus_motif end,
             annulee_le = case when $2 = 'annulee' then now() else annulee_le end,
             annulation_motif = case when $2 = 'annulee' then 'Motif de test' else annulation_motif end,
             terminee_le = case when $2 = 'terminee' then now() else terminee_le end
           where id=$1`,
          [intervention, statut]
        );
        await agir(compteArtisan);
        const { rows } = await db.query("select * from public.mes_photos_incident_artisan(null, $1)", [intervention]);
        expect(rows).toHaveLength(attendu);
      }
    );

    it("la mission d'un autre artisan ne donne rien", async () => {
      await agir(compteAutreArtisan);
      expect((await db.query("select * from public.mes_photos_incident_artisan(null, $1)", [intervention])).rows).toHaveLength(0);
      expect((await db.query("select * from public.mes_photos_incident_artisan($1, $2)", [sollicitation, intervention])).rows).toHaveLength(0);
    });

    it("un incident clos ne montre plus de photo", async () => {
      await db.query("set local session_replication_role = replica");
      await db.query("update public.incidents set etat='clos', clos_le=now(), cloture_motif='sans_suite' where id=$1", [incident]);
      await agir(compteArtisan);
      expect(await photosDeLaDemande()).toHaveLength(0);
    });

    // Défense en profondeur : un déclencheur (`document_liens_meme_agence`) interdit déjà qu'un lien relie un document à une autre
    // organisation. Si des données incohérentes existaient malgré tout (import, correction à la main), la fonction ne doit pas les
    // rendre : le document, le lien et l'incident doivent appartenir à la MÊME organisation.
    it("un document ou un lien d'une AUTRE organisation, même rattaché à l'incident, n'est jamais rendu", async () => {
      await postgres();
      const autreOrg = await id("insert into public.organizations(name,status,type) values('Autre agence D16','active','agence') returning id");
      await db.query("set local session_replication_role = replica");
      // (1) le document appartient à l'autre organisation, le lien à celle de l'incident
      const docEtranger = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by)
        values($1,'photo_incident','Photo étrangère',$2,'image/jpeg',1000,md5(random()::text),$3) returning id`, [autreOrg, `${autreOrg}/etrangere.jpg`, compteLocataire]);
      await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'incident',$3)", [docEtranger, org, incident]);
      // (2) le document appartient à l'organisation de l'incident, mais le lien porte l'autre organisation
      const docLienEtranger = await document("photo_incident", compteLocataire, "lien-etranger");
      await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'incident',$3)", [docLienEtranger, autreOrg, incident]);
      await agir(compteArtisan);
      const ids = (await photosDeLaDemande()).map((p) => p.document_id);
      expect(ids).toEqual([photo1, photo2]);
      expect(ids).not.toContain(docEtranger);
      expect(ids).not.toContain(docLienEtranger);
      // Et la lecture d'une telle photo est refusée, sans trace.
      for (const doc of [docEtranger, docLienEtranger]) {
        expect(await refus("select public.lire_photo_incident_artisan($1, $2, null)", [doc, sollicitation])).toMatch(/Accès refusé/);
      }
      await postgres();
      expect(await accesLog()).toHaveLength(0);
    });

    it("la demande ou la mission d'une autre organisation que celle de l'incident ne donne rien", async () => {
      await postgres();
      const autreOrg = await id("insert into public.organizations(name,status,type) values('Autre agence D16 bis','active','agence') returning id");
      await db.query("set local session_replication_role = replica");
      await db.query("update public.incident_sollicitations set organization_id=$2 where id=$1", [sollicitation, autreOrg]);
      await db.query("update public.incident_interventions set organization_id=$2 where id=$1", [intervention, autreOrg]);
      await agir(compteArtisan);
      expect(await photosDeLaDemande()).toHaveLength(0);
      expect((await db.query("select * from public.mes_photos_incident_artisan(null, $1)", [intervention])).rows).toHaveLength(0);
    });

    it("sans locataire déclarant identifié, aucune photo n'est attribuée au locataire", async () => {
      await db.query("set local session_replication_role = replica");
      await db.query("update public.incidents set declarant_person_id=null where id=$1", [incident]);
      await agir(compteArtisan);
      expect(await photosDeLaDemande()).toHaveLength(0);
    });
  });

  describe("la lecture d'une photo : droit revérifié, accès tracé", () => {
    it("rend le chemin d'une photo visible et écrit UNE ligne au journal d'accès, au nom de l'artisan", async () => {
      await agir(compteArtisan);
      const { rows } = await db.query("select public.lire_photo_incident_artisan($1, $2, null) as chemin", [photo1, sollicitation]);
      expect(rows[0].chemin).toBe(`${org}/loc-1.jpg`);
      await postgres();
      const traces = await accesLog();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({ organization_id: org, account_id: compteArtisan, document_id: photo1, action: "consultation" });
    });

    it("fonctionne aussi par la mission", async () => {
      await agir(compteArtisan);
      expect((await db.query("select public.lire_photo_incident_artisan($1, null, $2) as chemin", [photo2, intervention])).rows[0].chemin).toContain("loc-2");
    });

    it.each([["photo de l'agence", () => photoAgence], ["photo purgée", () => photoPurgee], ["pièce d'identité", () => piece], ["photo d'un autre incident", () => photoAutreIncident]])(
      "refuse %s, sans trace ni chemin", async (_nom, doc) => {
        await agir(compteArtisan);
        expect(await refus("select public.lire_photo_incident_artisan($1, $2, null)", [doc(), sollicitation])).toMatch(/Accès refusé/);
        await postgres();
        expect(await accesLog()).toHaveLength(0);
      }
    );

    it("refuse un autre artisan, le locataire, le gérant et la supervision, sans trace", async () => {
      for (const compte of [compteAutreArtisan, compteLocataire, compteProprietaire, compteSa]) {
        await agir(compte);
        expect(await refus("select public.lire_photo_incident_artisan($1, $2, null)", [photo1, sollicitation])).toMatch(/Accès refusé/);
      }
      await postgres();
      expect((await db.query("select count(*) n from public.acces_pieces_log where document_id=$1", [photo1])).rows[0].n).toBe("0");
    });

    it("refuse l'anonyme, et exige d'indiquer la demande OU la mission (jamais les deux, jamais aucune)", async () => {
      await agir(null, "anon");
      expect(await refus("select public.lire_photo_incident_artisan($1, $2, null)", [photo1, sollicitation])).toMatch(/permission denied/);
      await agir(compteArtisan);
      expect(await refus("select public.lire_photo_incident_artisan($1, null, null)", [photo1])).toMatch(/Indiquez/);
      expect(await refus("select public.lire_photo_incident_artisan($1, $2, $3)", [photo1, sollicitation, intervention])).toMatch(/Indiquez/);
    });

    // Sans trace possible, pas de chemin : ici la trace est refusée par la garde de lecture seule d'une session de diagnostic
    // (le journal d'accès ne s'écrit pas), et la fonction échoue entièrement.
    it("pendant un diagnostic de la supervision (session en lecture seule), la liste se lit mais aucune photo n'est servie, faute de trace", async () => {
      await agir(compteSa);
      await db.query("select public.ouvrir_session_artisan($1,'Diagnostic de la demande de devis D16')", [artisan]);
      expect(await photosDeLaDemande()).toHaveLength(2);
      expect(await refus("select public.lire_photo_incident_artisan($1, $2, null)", [photo1, sollicitation])).toMatch(/lecture seule/);
      await postgres();
      expect((await db.query("select count(*) n from public.acces_pieces_log where document_id=$1", [photo1])).rows[0].n).toBe("0");
    });
  });

  describe("la politique de stockage ne change pas : aucune lecture ni écrasement directs", () => {
    it("la migration ne crée, ne modifie ni ne supprime aucune politique de stockage", () => {
      const sql = readFileSync(MIGRATION, "utf8").replace(/--.*$/gm, "");
      expect(sql).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
      expect(sql).not.toMatch(/storage\.objects|storage\.buckets/i);
      expect(sql).not.toMatch(/\bgrant\s+(select|insert|update|delete|all)\b/i);
    });

    it("l'artisan, avec ses propres droits, ne lit pas l'objet : seule l'URL signée du serveur le permet", async () => {
      // Témoin : le gérant de l'agence, lui, lit ces objets — le refus de l'artisan vient bien de la politique, pas d'un banc vide.
      await agir(compteProprietaire);
      expect((await db.query("select name from storage.objects where bucket_id='documents' and name like $1", [`${org}/loc-%`])).rows).toHaveLength(3);
      await agir(compteArtisan);
      const { rows } = await db.query("select name from storage.objects where bucket_id='documents' and name like $1", [`${org}/loc-%`]);
      expect(rows).toHaveLength(0);
    });

    it("ni lui ni un autre artisan ne peuvent modifier, remplacer ou supprimer le fichier du locataire", async () => {
      // Refus par la politique : aucune ligne touchée (ou une erreur de droit, ce qui vaut aussi refus).
      const touchees = async (sql: string) => {
        await db.query("savepoint ecriture");
        try { return (await db.query(sql, [`${org}/loc-%`])).rowCount ?? 0; }
        catch { await db.query("rollback to savepoint ecriture"); return 0; }
        finally { await db.query("release savepoint ecriture"); }
      };
      for (const compte of [compteArtisan, compteAutreArtisan]) {
        await agir(compte);
        expect(await touchees("update storage.objects set name = name || '.x' where bucket_id='documents' and name like $1"), "update").toBe(0);
        expect(await touchees("delete from storage.objects where bucket_id='documents' and name like $1"), "delete").toBe(0);
      }
      await postgres();
      expect((await db.query("select count(*) n from storage.objects where bucket_id='documents' and name like $1", [`${org}/loc-%`])).rows[0].n).toBe("3");
    });

    it("déposer un fichier sous le même nom est impossible (pas d'écrasement)", async () => {
      const existant = (await db.query("select storage_path from public.documents where id=$1", [photo1])).rows[0].storage_path as string;
      await agir(compteArtisan);
      expect(await refus("insert into storage.objects(bucket_id,name) values('documents',$1)", [existant])).not.toBe("");
    });
  });

  describe("les fonctions sont fermées à anon et ne rendent rien de plus", () => {
    it("droits d'exécution : authenticated oui, anon non", async () => {
      const { rows } = await db.query(`select
        has_function_privilege('anon','public.mes_photos_incident_artisan(uuid,uuid)','EXECUTE') liste_anon,
        has_function_privilege('anon','public.lire_photo_incident_artisan(uuid,uuid,uuid)','EXECUTE') lecture_anon,
        has_function_privilege('authenticated','public.mes_photos_incident_artisan(uuid,uuid)','EXECUTE') liste_auth,
        has_function_privilege('authenticated','public.lire_photo_incident_artisan(uuid,uuid,uuid)','EXECUTE') lecture_auth`);
      expect(rows[0]).toEqual({ liste_anon: false, lecture_anon: false, liste_auth: true, lecture_auth: true });
    });

    it("se rejoue sans effet", async () => {
      const avant = (await db.query("select md5(pg_get_functiondef('public.mes_photos_incident_artisan(uuid,uuid)'::regprocedure) || pg_get_functiondef('public.lire_photo_incident_artisan(uuid,uuid,uuid)'::regprocedure)) m")).rows[0].m;
      await db.query(readFileSync(MIGRATION, "utf8"));
      expect((await db.query("select md5(pg_get_functiondef('public.mes_photos_incident_artisan(uuid,uuid)'::regprocedure) || pg_get_functiondef('public.lire_photo_incident_artisan(uuid,uuid,uuid)'::regprocedure)) m")).rows[0].m).toBe(avant);
    });
  });
});

// ── 2. Le serveur : l'URL signée n'est délivrée qu'après le contrôle du droit ───────────────────────────────────────
const UUID_DEMANDE = "11111111-1111-4111-8111-111111111111";
const UUID_PHOTO = "22222222-2222-4222-8222-222222222222";
const UUID_MISSION = "33333333-3333-4333-8333-333333333333";

describe("D16 — photos du locataire visibles de l'artisan : le serveur", () => {
  type Appel = { fn: string; args: Record<string, unknown> };
  function clients(options: { chemin?: string | null; rpcErreur?: { code?: string; message: string } | null; signeErreur?: boolean; utilisateur?: boolean; service?: boolean } = {}) {
    const rpc: Appel[] = [];
    const signatures: { bucket: string; chemin: string; secondes: number }[] = [];
    const supabase = {
      auth: { getUser: async () => ({ data: { user: options.utilisateur === false ? null : { id: "compte-artisan" } } }) },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpc.push({ fn, args });
        return { data: options.chemin === undefined ? `org/${UUID_PHOTO}.jpg` : options.chemin, error: options.rpcErreur ?? null };
      },
    };
    const service = options.service === false ? null : {
      storage: { from: (bucket: string) => ({ createSignedUrl: async (chemin: string, secondes: number) => {
        signatures.push({ bucket, chemin, secondes });
        return options.signeErreur ? { data: null, error: { message: "boom" } } : { data: { signedUrl: `https://stockage.test/signe/${chemin}?token=abc` }, error: null };
      } }) },
    };
    return { supabase, service, rpc, signatures };
  }
  async function route(nom: "devis" | "mission", c: ReturnType<typeof clients>) {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => c.supabase }));
    vi.doMock("@/lib/supabase/service", () => ({ clientDeService: () => c.service }));
    const route = nom === "devis"
      ? await import("../src/app/artisan/devis/[sollicitationId]/photos/[documentId]/route")
      : await import("../src/app/artisan/missions/[interventionId]/photos/[documentId]/route");
    const params: Record<string, string> = nom === "devis" ? { sollicitationId: UUID_DEMANDE, documentId: UUID_PHOTO } : { interventionId: UUID_MISSION, documentId: UUID_PHOTO };
    const reponse = await (route.GET as (r: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>)(new Request("https://gerimmo.test/x"), { params: Promise.resolve(params) });
    vi.doUnmock("@/lib/supabase/server"); vi.doUnmock("@/lib/supabase/service");
    return reponse;
  }

  afterEach(() => { vi.doUnmock("@/lib/supabase/server"); vi.doUnmock("@/lib/supabase/service"); });

  it("demande de devis : droit contrôlé en base d'abord, puis URL signée de 60 secondes, rendue par redirection privée", async () => {
    const c = clients();
    const r = await route("devis", c);
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe(`https://stockage.test/signe/org/${UUID_PHOTO}.jpg?token=abc`);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(c.rpc).toEqual([{ fn: "lire_photo_incident_artisan", args: { p_document: UUID_PHOTO, p_sollicitation: UUID_DEMANDE, p_intervention: null } }]);
    expect(c.signatures).toEqual([{ bucket: "documents", chemin: `org/${UUID_PHOTO}.jpg`, secondes: 60 }]);
  });

  it("mission : même contrôle, par l'identifiant de la mission", async () => {
    const c = clients();
    const r = await route("mission", c);
    expect(r.status).toBe(302);
    expect(c.rpc[0]).toEqual({ fn: "lire_photo_incident_artisan", args: { p_document: UUID_PHOTO, p_sollicitation: null, p_intervention: UUID_MISSION } });
  });

  it("droit refusé par la base : aucune URL n'est signée", async () => {
    const c = clients({ chemin: null, rpcErreur: { code: "42501", message: "Accès refusé" } });
    const r = await route("devis", c);
    expect(r.status).toBe(403);
    expect(r.headers.get("Location")).toBeNull();
    expect(c.signatures).toHaveLength(0);
    expect(await r.text()).not.toContain(`org/${UUID_PHOTO}`);
  });

  it("session absente : 403 sans appel à la base ni au stockage", async () => {
    const c = clients({ utilisateur: false });
    const r = await route("devis", c);
    expect(r.status).toBe(403);
    expect(c.rpc).toHaveLength(0);
    expect(c.signatures).toHaveLength(0);
  });

  it("photo introuvable : 404, aucune signature", async () => {
    const c = clients({ chemin: null });
    const r = await route("devis", c);
    expect(r.status).toBe(404);
    expect(c.signatures).toHaveLength(0);
  });

  it("panne de la base ou du stockage : 503 lisible, jamais d'URL à moitié construite", async () => {
    for (const options of [{ rpcErreur: { message: "connexion perdue" }, chemin: null }, { signeErreur: true }, { service: false }]) {
      const r = await route("devis", clients(options));
      expect(r.status).toBe(503);
      expect(r.headers.get("Location")).toBeNull();
    }
  });

  it("identifiant mal formé : 404 sans interroger la base", async () => {
    vi.resetModules();
    const c = clients();
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => c.supabase }));
    vi.doMock("@/lib/supabase/service", () => ({ clientDeService: () => c.service }));
    const { GET } = await import("../src/app/artisan/devis/[sollicitationId]/photos/[documentId]/route");
    const r = await (GET as (r: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>)(new Request("https://gerimmo.test/x"), { params: Promise.resolve({ sollicitationId: "pas-un-uuid", documentId: UUID_PHOTO }) });
    expect(r.status).toBe(404);
    expect(c.rpc).toHaveLength(0);
  });

  it("la clé de service ne sert qu'à signer, après le contrôle : lecture seule, durée courte, bucket des documents", () => {
    const source = readFileSync("src/lib/photos-demande-artisan.ts", "utf8");
    expect(source).toMatch(/DUREE_LIEN_PHOTO_SECONDES = 60/);
    expect(source).toMatch(/\.createSignedUrl\(/);
    expect(source).not.toMatch(/createSignedUploadUrl|\.upload\(|\.remove\(|\.update\(|\.move\(/);
  });
});

// ── 3. L'écran de l'artisan ─────────────────────────────────────────────────────────────────────────────────────────
describe("D16 — photos du locataire visibles de l'artisan : l'écran", () => {
  const photos = [
    { document_id: UUID_PHOTO, mime_type: "image/jpeg", rang: 1 },
    { document_id: "44444444-4444-4444-8444-444444444444", mime_type: "image/png", rang: 2 },
  ];
  async function rendre(props: { photos: typeof photos; erreur: boolean; base: string }) {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PhotosDeLaDemande } = await import("../src/app/artisan/photos-demande");
    return renderToStaticMarkup(createElement(PhotosDeLaDemande, props));
  }

  it("montre chaque photo par une adresse Gerimmo (jamais un chemin de stockage), en lecture seule, avec un texte alternatif", async () => {
    const html = await rendre({ photos, erreur: false, base: `/artisan/devis/${UUID_DEMANDE}/photos` });
    expect(html).toContain("Photos jointes par le locataire");
    expect(html).toContain(`src="/artisan/devis/${UUID_DEMANDE}/photos/${UUID_PHOTO}"`);
    expect(html).toContain(`href="/artisan/devis/${UUID_DEMANDE}/photos/${UUID_PHOTO}"`);
    expect(html).toContain('alt="Photo 1 jointe par le locataire"');
    expect(html).toContain('alt="Photo 2 jointe par le locataire"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("Chaque consultation est enregistrée");
    expect(html).not.toMatch(/supabase|storage|signed|token=|\.jpg|\.png|<form|<input|download/i);
  });

  it("sans photo, rien n'est annoncé ; en cas d'échec de lecture, on le dit", async () => {
    expect(await rendre({ photos: [], erreur: false, base: "/x" })).toBe("");
    const panne = await rendre({ photos: [], erreur: true, base: "/x" });
    expect(panne).toContain('role="alert"');
    expect(panne).toContain("Les photos n&#x27;ont pas pu être chargées");
  });

  it("la demande de devis et la mission affichent le bloc, chargé par la liste que la base ouvre", () => {
    const devis = readFileSync("src/app/artisan/devis/[sollicitationId]/page.tsx", "utf8");
    expect(devis).toMatch(/chargerPhotosDemande\(sollicitationId, null\)/);
    expect(devis).toMatch(/<PhotosDeLaDemande photos=\{photos\.photos\} erreur=\{photos\.erreur\} base=\{`\/artisan\/devis\/\$\{sollicitationId\}\/photos`\}/);
    const mission = readFileSync("src/app/artisan/missions/[interventionId]/page.tsx", "utf8");
    expect(mission).toMatch(/chargerPhotosDemande\(null, interventionId\)/);
    expect(mission).toMatch(/<PhotosDeLaDemande photos=\{photos\.photos\} erreur=\{photos\.erreur\} base=\{`\/artisan\/missions\/\$\{mission\.intervention_id\}\/photos`\}/);
    expect(readFileSync("src/app/artisan/acces.ts", "utf8")).toMatch(/rpc\("mes_photos_incident_artisan"/);
  });
});
