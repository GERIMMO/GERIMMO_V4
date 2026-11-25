/**
 * FACTURE D'ARTISAN ERRONÉE : REFUS MOTIVÉ, PUIS FACTURE CORRIGÉE — audit palier 1 du 22/11/2026, P1-03.
 *
 * Le défaut : une intervention ne portait qu'une facture, et le gestionnaire ne pouvait que la valider. Devant une
 * facture fausse, aucune issue : ni refus, ni remplacement. Le référentiel (module 9, variante V5) : « L'agent la
 * refuse. L'artisan la corrige ou la justifie. »
 *
 * Ces tests tiennent, sous les vrais rôles et par les vraies fonctions (dépôt, validation, règlement) :
 *  1. le gestionnaire refuse avec un motif : la facture reste au dossier, intacte ; trace au fil et au journal ;
 *     l'alerte « facture à contrôler » se ferme — et seulement alors ;
 *  2. l'artisan lit le motif, son dépôt et son dossier de pièces se rouvrent, il dépose une autre facture ; il n'y a
 *     jamais qu'UNE facture en vigueur par intervention ;
 *  3. refus et validation s'excluent : une facture validée ne se refuse plus, une facture refusée ne se valide ni ne se
 *     règle ; un second refus ne réécrit rien ;
 *  4. ni le locataire, ni l'artisan, ni un autre espace, ni un visiteur ne refusent ;
 *  5. la migration se rejoue ; son retour rend les fonctions d'avant sans rien effacer, et garde l'unicité « en
 *     vigueur » quand une intervention porte déjà deux factures.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { TYPES_EVENEMENT_INCIDENT } from "../src/lib/incidents";
import { libelleActionAudit } from "../src/lib/libelles-journaux";
import { etatReglementFacture, LIBELLES_ETAT_REGLEMENT, MOTIF_REFUS_FACTURE, phraseEtatPourArtisan, phraseEtatReglement } from "../src/lib/reglement-facture";

const NOM = "20261122170000_facture_artisan_refus";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const MOTIF = "Le montant ne correspond pas au devis accepté : merci de reprendre la ligne de main-d'œuvre.";
const RETOUCHEES = ["valider_facture_artisan", "deposer_facture_artisan", "dossiers_de_mes_factures_a_deposer", "mon_agenda_artisan", "garder_alerte_facture_ouverte"];

describe("refus d'une facture d'artisan — manifeste, retour et libellés (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/facture-artisan-refus-base.test.ts"');
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // Rien n'est effacé ni réécrit dans les factures existantes.
    expect(sql).not.toMatch(/delete\s+from\s+public\.intervention_factures|drop\s+column/i);
  });

  it("l'écran et la base parlent du même état, avec les mêmes bornes", () => {
    expect(MOTIF_REFUS_FACTURE).toEqual({ min: 5, max: 2000 });
    expect(readFileSync(`supabase/migrations/${NOM}.sql`, "utf8")).toContain("between 5 and 2000");
    expect(etatReglementFacture({ montant_ttc_cents: 120000, validee_le: null, refusee_le: "2026-11-22T10:00:00Z" }, []))
      .toEqual({ etat: "refusee", totalRegleCents: 0, resteCents: 0 });
    expect(etatReglementFacture({ montant_ttc_cents: 120000, validee_le: null }, []).etat).toBe("deposee");
    expect(LIBELLES_ETAT_REGLEMENT.refusee).toBe("Refusée, à corriger");
    expect(phraseEtatReglement("refusee", 0, null)).toBe("Facture refusée : l’artisan peut en déposer une autre");
    expect(phraseEtatPourArtisan({ etat: "refusee", reglee_le: null, reglements: [] })).toBe("Refusée par votre client : à corriger");
    expect(TYPES_EVENEMENT_INCIDENT.facture_refusee).toBe("Facture refusée, à corriger par l'artisan");
    expect(libelleActionAudit("facture_refusee")).toBe("Facture d’artisan refusée, à corriger");
  });
});

describe.skipIf(!url)("refus d'une facture d'artisan (avec base)", () => {
  let db: Client;
  let orgA = "", orgB = "", gerantA = "", gerantB = "", cptLoc = "", cptArtisan = "", cptAutreArtisan = "";
  let artisan = "", incident = "", intervention = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const unique = () => Math.random().toString(36).slice(2, 10);
  async function compte(prefixe: string) {
    const c = await id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
        $1||gen_random_uuid()||'@test.local','x',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','') returning id`, [prefixe]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$1)", [c]);
    return c;
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2", session_id: compteId } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };

  /** L'artisan dépose une facture par la vraie fonction, pièce comprise. */
  async function deposer(numero: string, montant = 120000, justification: string | null = "Pièce supplémentaire") {
    await agir(cptArtisan);
    const chemin = `${orgA}/factures-artisan/${intervention}/${randomUUID()}.pdf`;
    const stockage = await refus("insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)", [chemin, cptArtisan]);
    if (stockage) return { erreur: `stockage : ${stockage}`, id: "" };
    await db.query("savepoint depot");
    try {
      const { rows: [{ f }] } = await db.query(
        "select public.deposer_facture_artisan($1,$2,$3,$4,$5,'application/pdf',10,$6) f", [intervention, numero, montant, justification, chemin, `emp-${unique()}`]);
      await db.query("release savepoint depot");
      return { erreur: "", id: String(f) };
    } catch (e) { await db.query("rollback to savepoint depot"); return { erreur: (e as Error).message, id: "" }; }
  }
  const refuser = async (facture: string, motif: string | null = MOTIF, parCompte = gerantA, espace = orgA) => {
    await agir(parCompte);
    return refus("select public.refuser_facture_artisan($1,$2,$3)", [espace, facture, motif]);
  };
  const valider = async (facture: string) => {
    await agir(gerantA);
    return refus("select public.valider_facture_artisan($1,$2,'Pièce et montant vérifiés')", [orgA, facture]);
  };
  const ligne = async (facture: string) => {
    await base();
    return (await db.query("select numero, montant_ttc_cents::int montant, document_id, refusee_le is not null refusee, refusee_par, refus_motif, validee_le is not null validee from public.intervention_factures where id=$1", [facture])).rows[0];
  };
  const alerte = async (facture: string) => {
    await base();
    return (await db.query("select statut::text, closed_action from public.alerts where organization_id=$1 and type='facture_artisan_a_valider' and details->>'facture_id'=$2", [orgA, facture])).rows[0];
  };
  const agenda = async () => {
    await agir(cptArtisan);
    return (await db.query("select facture_deposee from public.mon_agenda_artisan() where intervention_id=$1", [intervention])).rows[0].facture_deposee as boolean;
  };
  const dossierOuvert = async () => {
    await agir(cptArtisan);
    return (await db.query("select count(*)::int n from public.dossiers_de_mes_factures_a_deposer() d where d = $1", [`${orgA}/factures-artisan/${intervention}/`])).rows[0].n === 1;
  };

  beforeEach(async () => {
    await db.query("begin");
    orgA = await id("insert into public.organizations(name,status) values('Agence fictive des factures A','active') returning id");
    orgB = await id("insert into public.organizations(name,status) values('Agence fictive des factures B','active') returning id");
    gerantA = await compte("gerant-a"); gerantB = await compte("gerant-b"); cptLoc = await compte("locataire");
    cptArtisan = await compte("artisan"); cptAutreArtisan = await compte("autre-artisan");
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,$2,'locataire')`, [gerantA, orgA, gerantB, orgB, cptLoc]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Résidence fictive','immeuble','1 rue du Test','75011','Paris') returning id", [orgA]);
    const lot = await id("insert into public.lots(bien_id,organization_id,nom,etat) values($1,$2,'Lot 1','loue') returning id", [bien, orgA]);
    const personne = await id("insert into public.persons(organization_id,account_id,nom,prenom,telephone) values($1,$2,'Martin','Léa','0600000000') returning id", [orgA, cptLoc]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50) returning id", [orgA, lot, personne]);
    incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,'INC-'||substr(gen_random_uuid()::text,1,8),$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite sous évier','qualifie','proprietaire','Joint usé par le temps') returning id`, [orgA, lot, bail, personne]);
    artisan = await id(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Plomberie fictive',lpad((floor(random()*99999999999999))::text,14,'0'),'0611111111','valide','verifie') returning id`, [cptArtisan]);
    await db.query(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Autre artisan fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0622222222','valide','verifie')`, [cptAutreArtisan]);
    const consultation = await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [orgA, incident]);
    const sollicitation = await id("insert into public.incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'retenue') returning id", [orgA, consultation, incident, artisan]);
    const devis = await id(`insert into public.incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,statut)
      values($1,$2,$3,$4,100000,'Remplacement du joint',current_date+30,'retenu') returning id`, [orgA, sollicitation, incident, artisan]);
    intervention = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,devis_id,nature_travaux,statut,acceptee_le,demarree_le)
      values($1,$2,$3,$4,'entretien_courant','en_cours',now(),now()) returning id`, [orgA, incident, artisan, devis]);
    const cheminPhoto = `${orgA}/apres-${unique()}.jpg`;
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [cheminPhoto]);
    const photo = await id("insert into public.documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident',$2,'image/jpeg',10,$3) returning id", [orgA, cheminPhoto, `emp-${unique()}`]);
    await db.query("insert into public.intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')", [orgA, intervention, photo]);
    await agir(cptArtisan);
    await db.query("select public.deposer_compte_rendu($1,'Joint remplacé',null,null,100000,false)", [intervention]);
    await base();
  });

  it("le gestionnaire refuse avec un motif : la facture reste intacte, tracée, et son alerte se ferme", async () => {
    const f = await deposer("F-2026-12");
    expect(f.erreur).toBe("");
    const avant = await ligne(f.id);
    expect(await alerte(f.id)).toMatchObject({ statut: "ouverte" });

    expect(await refuser(f.id, `  ${MOTIF}  `)).toBe("");
    const apres = await ligne(f.id);
    expect(apres).toEqual({ ...avant, refusee: true, refusee_par: gerantA, refus_motif: MOTIF });
    expect(apres).toMatchObject({ numero: "F-2026-12", montant: 120000, validee: false });
    expect(await alerte(f.id)).toEqual({ statut: "fermee", closed_action: "Facture refusée, à corriger par l’artisan" });

    await base();
    const fil = (await db.query("select acteur_account_id, details from public.incident_evenements where incident_id=$1 and type='facture_refusee'", [incident])).rows;
    expect(fil).toEqual([{ acteur_account_id: gerantA, details: { facture_id: f.id, numero: "F-2026-12", montant_ttc_cents: 120000, motif: MOTIF } }]);
    const journal = (await db.query("select organization_id, details from public.audit_log where account_id=$1 and action='facture_refusee'", [gerantA])).rows;
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ organization_id: orgA, details: { facture_id: f.id, numero: "F-2026-12", intervention_id: intervention, incident_id: incident } });
  });

  it("tant que rien n'est décidé, l'alerte ne se ferme pas à la main ; le refus, lui, la ferme", async () => {
    const f = await deposer("F-ALERTE");
    await agir(gerantA);
    await db.query("update public.alerts set statut='fermee', closed_at=now(), closed_action='Fermée à la main' where organization_id=$1 and type='facture_artisan_a_valider' and details->>'facture_id'=$2", [orgA, f.id]);
    expect(await alerte(f.id)).toMatchObject({ statut: "ouverte" });
    expect(await refuser(f.id)).toBe("");
    expect(await alerte(f.id)).toMatchObject({ statut: "fermee" });
  });

  it("l'artisan lit le motif, son dépôt se rouvre, il dépose une facture corrigée : une seule en vigueur", async () => {
    const premiere = await deposer("F-2026-12");
    expect(await agenda()).toBe(true);
    expect(await dossierOuvert()).toBe(false);
    // Tant que la première est en vigueur, un second dépôt reste refusé (dossier de pièces fermé, puis fonction).
    expect((await deposer("F-BIS", 100000, null)).erreur).not.toBe("");

    expect(await refuser(premiere.id)).toBe("");
    expect(await agenda()).toBe(false);
    expect(await dossierOuvert()).toBe(true);
    // L'artisan lit ce qu'on lui demande de corriger, par sa propre lecture de la table.
    await agir(cptArtisan);
    expect((await db.query("select numero, refus_motif from public.intervention_factures where refusee_le is not null")).rows)
      .toEqual([{ numero: "F-2026-12", refus_motif: MOTIF }]);
    // La fonction de règlement (20261014610000, non retouchée) rend toujours la ligne : l'écran y lit le refus par la facture.
    expect((await db.query("select count(*)::int n from public.mes_reglements_factures_artisan() where facture_id=$1", [premiere.id])).rows[0].n).toBe(1);

    const seconde = await deposer("F-2026-13", 100000, null);
    expect(seconde.erreur).toBe("");
    expect(await agenda()).toBe(true);
    expect(await dossierOuvert()).toBe(false);
    await base();
    const toutes = (await db.query("select numero, refusee_le is not null refusee from public.intervention_factures where intervention_id=$1 order by deposee_le, numero", [intervention])).rows;
    expect(toutes).toEqual(expect.arrayContaining([{ numero: "F-2026-12", refusee: true }, { numero: "F-2026-13", refusee: false }]));
    expect(toutes).toHaveLength(2);
    expect(await alerte(seconde.id)).toMatchObject({ statut: "ouverte" });
    // Jamais deux factures en vigueur : la fonction refuse, et l'index aussi si on la contournait.
    expect((await deposer("F-2026-14", 100000, null)).erreur).not.toBe("");
    await base();
    expect(await refus(`insert into public.intervention_factures(organization_id,intervention_id,artisan_id,numero,montant_ttc_cents,document_id)
      select organization_id,intervention_id,artisan_id,'F-DOUBLE',100000,document_id from public.intervention_factures where id=$1`, [seconde.id]))
      .toMatch(/intervention_factures_une_en_vigueur/);
    // La facture corrigée suit le parcours normal.
    expect(await valider(seconde.id)).toBe("");
    expect(await ligne(seconde.id)).toMatchObject({ validee: true, refusee: false });
  });

  it("le locataire et un autre artisan ne lisent ni la facture ni le motif", async () => {
    const f = await deposer("F-PRIVEE");
    expect(await refuser(f.id)).toBe("");
    for (const autre of [cptLoc, cptAutreArtisan, gerantB]) {
      await agir(autre);
      expect((await db.query("select count(*)::int n from public.intervention_factures")).rows[0].n, autre).toBe(0);
    }
  });

  it("motif obligatoire et borné", async () => {
    const f = await deposer("F-MOTIF");
    for (const motif of [null, "", "    ", "abcd", "x".repeat(2001)]) {
      expect(await refuser(f.id, motif), String(motif).slice(0, 8)).toMatch(/Indiquez à l’artisan ce qui est à corriger/);
    }
    expect((await ligne(f.id)).refusee).toBe(false);
    expect(await refuser(f.id, "x".repeat(2000))).toBe("");
  });

  it("refus et validation s'excluent ; une facture refusée ne se règle pas ; un second refus ne réécrit rien", async () => {
    const f = await deposer("F-EXCLUSION");
    expect(await refuser(f.id)).toBe("");
    expect(await valider(f.id)).toMatch(/a été refusée : l’artisan doit en déposer une nouvelle/);
    await agir(gerantA);
    expect(await refus("select public.enregistrer_reglement_facture($1,$2,1000,current_date,'virement',null,gen_random_uuid())", [orgA, f.id])).not.toBe("");
    // Second refus : sans effet, le premier motif reste.
    expect(await refuser(f.id, "Un autre motif, écrit après coup")).toBe("");
    expect((await ligne(f.id)).refus_motif).toBe(MOTIF);
    await base();
    expect((await db.query("select count(*)::int n from public.incident_evenements where incident_id=$1 and type='facture_refusee'", [incident])).rows[0].n).toBe(1);
    // La base elle-même refuse l'incohérence, quel que soit le chemin.
    expect(await refus("update public.intervention_factures set validee_le=now() where id=$1", [f.id])).toMatch(/intervention_factures_refus_ou_validation/);

    // À l'inverse : une facture validée ne se refuse plus.
    await db.query("delete from public.alerts where organization_id=$1", [orgA]);
    const g = await deposer("F-VALIDEE", 100000, null);
    expect(g.erreur).toBe("");
    expect(await valider(g.id)).toBe("");
    expect(await refuser(g.id)).toMatch(/déjà validée : elle ne se refuse plus/);
    expect(await ligne(g.id)).toMatchObject({ validee: true, refusee: false });
    await base();
    expect(await refus("update public.intervention_factures set refusee_le=now() where id=$1", [g.id])).toMatch(/intervention_factures_refus_motive|intervention_factures_refus_ou_validation/);
  });

  it("ni le locataire, ni l'artisan, ni un autre espace, ni un visiteur ne refusent", async () => {
    const f = await deposer("F-DROITS");
    expect(await refuser(f.id, MOTIF, cptLoc)).toMatch(/Accès refusé/);
    expect(await refuser(f.id, MOTIF, cptArtisan)).toMatch(/Accès refusé/);
    expect(await refuser(f.id, MOTIF, gerantB)).toMatch(/Accès refusé/);
    expect(await refuser(f.id, MOTIF, gerantB, orgB)).toMatch(/Accès refusé/);
    await agir(null, "anon");
    expect(await refus("select public.refuser_facture_artisan($1,$2,$3)", [orgA, f.id, MOTIF])).toMatch(/permission denied|Accès refusé/);
    expect((await ligne(f.id)).refusee).toBe(false);
    expect(await alerte(f.id)).toMatchObject({ statut: "ouverte" });
  });

  it("la migration se rejoue ; son retour rend les fonctions d'avant sans rien effacer", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const retouchees = async () => Number((await db.query(
      "select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = any($1) and pg_get_functiondef(p.oid) like '%refusee_le%'", [RETOUCHEES])).rows[0].n);
    const existe = async (objet: string) => (await db.query("select to_regprocedure($1) is not null ok", [objet])).rows[0].ok as boolean;
    const unicite = async () => (await db.query(`select
        exists(select 1 from pg_constraint where conrelid='public.intervention_factures'::regclass and conname='intervention_factures_intervention_id_key') stricte,
        exists(select 1 from pg_indexes where schemaname='public' and indexname='intervention_factures_une_en_vigueur') en_vigueur`)).rows[0];
    const typeAdmis = async () => (await db.query("select pg_get_constraintdef(oid) like '%facture_refusee%' ok from pg_constraint where conname='incident_evenements_type_check'")).rows[0].ok as boolean;
    const REFUSER = "public.refuser_facture_artisan(uuid,uuid,text)";

    await base();
    expect(await retouchees()).toBe(5);
    expect(await unicite()).toEqual({ stricte: false, en_vigueur: true });
    await db.query(migration);
    expect(await retouchees()).toBe(5);
    expect((await db.query("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') u", [REFUSER])).rows[0]).toEqual({ a: false, u: true });

    // ── Retour SANS facture refusée : tout revient, unicité stricte comprise.
    await db.query("savepoint sans_refus");
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122170000','facture_artisan_refus') on conflict do nothing");
    await db.query(retour);
    expect([await retouchees(), await existe(REFUSER), await typeAdmis()]).toEqual([0, false, false]);
    expect(await unicite()).toEqual({ stricte: true, en_vigueur: false });
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122170000'")).rows[0].n).toBe(0);
    await db.query(retour);
    expect(await unicite()).toEqual({ stricte: true, en_vigueur: false });
    await db.query(migration);
    expect([await retouchees(), await existe(REFUSER), await typeAdmis()]).toEqual([5, true, true]);
    expect(await unicite()).toEqual({ stricte: false, en_vigueur: true });
    await db.query("rollback to savepoint sans_refus");

    // ── Retour AVEC une facture refusée et sa remplaçante : rien n'est effacé, l'unicité « en vigueur » reste.
    const premiere = await deposer("F-RETOUR-1");
    expect(await refuser(premiere.id)).toBe("");
    const seconde = await deposer("F-RETOUR-2", 100000, null);
    expect(seconde.erreur).toBe("");
    await base();
    await db.query(retour);
    expect([await retouchees(), await existe(REFUSER), await typeAdmis()]).toEqual([0, false, true]);
    expect(await unicite()).toEqual({ stricte: false, en_vigueur: true });
    expect(await ligne(premiere.id)).toMatchObject({ refusee: true, refus_motif: MOTIF });
    expect(await ligne(seconde.id)).toMatchObject({ refusee: false });
    // La facture refusée reste non validable, même avec les fonctions d'avant.
    expect(await valider(premiere.id)).toMatch(/intervention_factures_refus_ou_validation/);

    await base();
    await db.query(migration);
    expect([await retouchees(), await existe(REFUSER)]).toEqual([5, true]);
    expect(await valider(premiere.id)).toMatch(/a été refusée/);
    expect(await valider(seconde.id)).toBe("");
  });
});
