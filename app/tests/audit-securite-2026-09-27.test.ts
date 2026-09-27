/**
 * Audit sécurité et données du 27/09 — une vérification par correction.
 *
 * Chaque bloc rejoue la preuve du relevé (qui passait avant la correction) et
 * vérifie qu'elle échoue désormais, puis que le chemin légitime fonctionne
 * toujours. Nécessite SUPABASE_DB_URL (base locale). Transaction annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit sécurité du 27/09", () => {
  let db: Client;
  let orgA: string;
  let orgB: string;
  let adminA: string;
  let agentA: string;
  let locA: string;
  let adminB: string;
  let personneLoc: string;

  async function utilisateur(email = `audit27-${crypto.randomUUID()}@test.local`, meta: object = {}): Promise<string> {
    const { rows: [{ id }] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, $2::jsonb, now(), now(), '', '', '', '', '')
       returning id`,
      [email, JSON.stringify(meta)]
    );
    return id;
  }

  async function agir(compte: string | null, role = "authenticated") {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      compte ? JSON.stringify({ sub: compte, role }) : JSON.stringify({ role }),
    ]);
    await db.query(`set local role ${role}`);
  }

  async function postgres() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }

  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint e");
    try {
      await db.query(sql, params);
      await db.query("release savepoint e");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint e");
      return e instanceof Error ? e.message : String(e);
    }
  }

  const un = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows[0] as T;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    orgA = (await un<{ id: string }>(`insert into public.organizations (name, status) values ('Audit A','active') returning id`)).id;
    orgB = (await un<{ id: string }>(`insert into public.organizations (name, status) values ('Audit B','active') returning id`)).id;
    [adminA, agentA, locA, adminB] = [await utilisateur(), await utilisateur(), await utilisateur(), await utilisateur()];
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$5,'admin_agence'),($2,$5,'agent'),($3,$5,'locataire'),($4,$6,'admin_agence')`,
      [adminA, agentA, locA, adminB, orgA, orgB]
    );
    personneLoc = (await un<{ id: string }>(
      `insert into public.persons (organization_id, nom, email, account_id) values ($1,'Locataire','loc@test.local',$2) returning id`,
      [orgA, locA]
    )).id;
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  // ── Bloquant ───────────────────────────────────────────────────────────────
  it("fermer_alertes_origine n'est plus appelable : ni par une autre agence, ni par le locataire", async () => {
    const incident = crypto.randomUUID();
    const alerte = (await un<{ id: string }>(
      `insert into public.alerts (organization_id, type, titre, origine_type, origine_id)
       values ($1,'incident_a_qualifier','Incident à qualifier','incident',$2) returning id`,
      [orgA, incident]
    )).id;
    for (const compte of [adminB, locA, adminA]) {
      await agir(compte);
      expect(await echec(`select public.fermer_alertes_origine($1,'incident',$2,'x',null)`, [orgA, incident]))
        .toMatch(/permission denied|droit/i);
    }
    await postgres();
    expect((await un<{ statut: string }>(`select statut from public.alerts where id=$1`, [alerte])).statut).toBe("ouverte");
    const { rows } = await db.query(
      `select p.proname, p.prosecdef from pg_proc p where p.proname in
         ('diagnostic_archive_ferme_alertes','document_remplace_ferme_alertes','edl_signe_ferme_alertes')`
    );
    expect(rows.every((r) => r.prosecdef)).toBe(true);
  });

  it("les déclencheurs qui ferment une alerte fonctionnent toujours pour le gestionnaire", async () => {
    await postgres();
    await db.query("set local session_replication_role = replica");
    const bien = (await un<{ id: string }>(`insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1,'Audit','appartement','1 rue Audit','75001','Paris') returning id`, [orgA])).id;
    const diag = (await un<{ id: string }>(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation) values ($1,$2,'dpe',current_date - 400) returning id`, [orgA, bien])).id;
    await db.query("set local session_replication_role = origin");
    const alerte = (await un<{ id: string }>(
      `insert into public.alerts (organization_id, type, titre, origine_type, origine_id)
       values ($1,'diagnostic_expiration','DPE à renouveler','diagnostic',$2) returning id`, [orgA, diag])).id;
    await agir(adminA);
    await db.query(`update public.diagnostics set archived_at = now() where id = $1`, [diag]);
    await postgres();
    expect((await un<{ statut: string }>(`select statut from public.alerts where id=$1`, [alerte])).statut).toBe("fermee");
  });

  it("aucune fonction definer ouverte à authenticated ne reste sans garde (hors liste motivée)", async () => {
    // Heuristique DIRECTE sur le corps : une fonction qui ne cite aucun
    // marqueur d'identité ni aucune garde connue doit être justifiée ici.
    const { rows } = await db.query<{ f: string }>(
      `select p.oid::regprocedure::text as f
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and p.prorettype <> 'trigger'::regtype
          and p.prosrc !~* '(auth\\.(uid|role|jwt)|is_super_admin|is_permanent_super_admin|org_ids_avec_roles|has_org_role|ma_personne|mon_artisan_id|mes_publics|_hors_portefeuille|artisan_supervise|orgs_de_mes_missions|est_agent_restreint|verifier_|garde_|exiger_|controler_mise_en_location|creer_fiche_justificatif|has_supervision_power|mon_|mes_|ma_)'`
    );
    const motivees = new Set([
      "montant_abonnement_cents(text,integer)", // calcul pur du tarif, sans donnée
      // Prédicat booléen (l'artisan a-t-il une assurance à jour ?) posé le 27/09
      // par la console de contrôle ; ne rend aucune donnée — à confirmer par son auteur.
      "artisan_assurance_deposee(uuid)",
    ]);
    const sansGarde = rows.map((r) => r.f).filter((f) => !motivees.has(f) && !f.startsWith("montant_abonnement_cents("));
    expect(sansGarde, `Fonctions definer sans garde apparente :\n${sansGarde.join("\n")}`).toEqual([]);
  });

  // ── log_tech ───────────────────────────────────────────────────────────────
  it("log_tech : un compte connecté n'écrit ni une passe de tâche, ni une clé de rappel, ni un bloc géant", async () => {
    await agir(locA);
    expect(await echec(`select public.log_tech('tache_quittances','{"emises":999}')`)).toMatch(/réservé au service/);
    expect(await echec(`select public.log_tech('tache_sauvegarde','{"echecs":0}')`)).toMatch(/réservé au service/);
    expect(await echec(`select public.log_tech('notification_rappel','{"cle":"x"}')`)).toMatch(/réservé au service/);
    expect(await echec(`select public.log_tech('erreur_ecran', jsonb_build_object('x', repeat('a', 5000)))`)).toMatch(/volumineux/);
    expect(await echec(`select public.log_tech('Erreur Écran','{}')`)).toMatch(/invalide/);
    expect(await echec(`select public.log_tech('erreur_ecran','{"ecran":"/locataire"}')`)).toBe("");
    // La preuve d'envoi d'un compte rendu ne se pose pas pour une autre agence.
    await agir(adminB);
    expect(await echec(`select public.log_tech('remise_rapport_mensuel', jsonb_build_object('organization_id',$1::text,'resultat','accepte_prestataire'))`, [orgA]))
      .toMatch(/périmètre/);
    await agir(adminA);
    expect(await echec(`select public.log_tech('remise_rapport_mensuel', jsonb_build_object('organization_id',$1::text,'resultat','echec'))`, [orgA])).toBe("");
    // Le service (tâches, sauvegarde GitHub par l'API REST) écrit toujours.
    await agir(null, "service_role");
    expect(await echec(`select public.log_tech('tache_quittances','{"envoyees":1}')`)).toBe("");
    expect(await echec(`insert into public.tech_log (evenement, details) values ('tache_sauvegarde','{"echecs":0}')`)).toBe("");
    await postgres();
    const { rows } = await db.query(`select evenement, account_id from public.tech_log where evenement in ('tache_quittances','tache_sauvegarde') and created_at >= now() - interval '1 minute'`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.account_id === null)).toBe(true);
  });

  // ── Conservation ───────────────────────────────────────────────────────────
  async function bailEtDocument(etat: string, fin: string | null) {
    await postgres();
    await db.query("set local session_replication_role = replica");
    const bien = (await un<{ id: string }>(`insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1,'Audit','appartement','1 rue Audit','75001','Paris') returning id`, [orgA])).id;
    const lot = (await un<{ id: string }>(`insert into public.lots (organization_id, bien_id, nom, etat) values ($1,$2,'Lot audit','loue') returning id`, [orgA, bien])).id;
    const doc = (await un<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, retention_reference_date)
       values ($1,'bail','Bail Dupont',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'audit-'||gen_random_uuid(), current_date - interval '61 months')
       returning id`, [orgA])).id;
    const bail = (await un<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, date_fin, document_signe, updated_at)
       values ($1,$2,$3,$4::public.bail_etat, current_date - interval '8 years', $5::date, $6, coalesce($5::timestamptz, now()))
       returning id`, [orgA, lot, personneLoc, etat, fin, doc])).id;
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1,$2,'bail',$3),($1,$2,'personne',$4),($1,$2,'lot',$5)`, [doc, orgA, bail, personneLoc, lot]);
    await db.query("set local session_replication_role = origin");
    return { doc, bail, lot };
  }

  it("conservation : un bail ACTIF n'est jamais purgé, même déposé il y a 61 mois", async () => {
    const { doc } = await bailEtDocument("actif", null);
    expect((await un<{ d: string | null }>(`select public.debut_conservation_document($1) as d`, [doc])).d).toBeNull();
    await db.query(`select public.appliquer_retention()`);
    const d = await un<{ purged_at: string | null; storage_path: string | null }>(`select purged_at, storage_path from public.documents where id=$1`, [doc]);
    expect(d.purged_at).toBeNull();
    expect(d.storage_path).not.toBeNull();
  });

  it("conservation : bail terminé depuis 4 ans conservé ; depuis 5 ans et plus, ANONYMISÉ (la fiche subsiste, sans personne)", async () => {
    const recent = await bailEtDocument("termine", new Date(Date.now() - 4 * 365 * 86_400_000).toISOString().slice(0, 10));
    const ancien = await bailEtDocument("termine", new Date(Date.now() - 61 * 30.5 * 86_400_000).toISOString().slice(0, 10));
    const chemin = (await un<{ storage_path: string }>(`select storage_path from public.documents where id=$1`, [ancien.doc])).storage_path;
    const r = await un<{ r: { documents_anonymises: number } }>(`select public.appliquer_retention() as r`);
    expect(r.r.documents_anonymises).toBeGreaterThanOrEqual(1);
    expect((await un<{ purged_at: string | null }>(`select purged_at from public.documents where id=$1`, [recent.doc])).purged_at).toBeNull();
    const d = await un<{ anonymise_le: string | null; titre: string; empreinte: string | null; storage_path: string | null }>(
      `select anonymise_le, titre, empreinte, storage_path from public.documents where id=$1`, [ancien.doc]);
    expect(d.anonymise_le).not.toBeNull();
    expect(d.titre).not.toMatch(/Dupont/);
    expect(d.empreinte).not.toBeNull();
    expect(d.storage_path).toBeNull();
    const liens = (await db.query(`select entite from public.document_liens where document_id=$1 `, [ancien.doc])).rows.map((l) => String(l.entite)).sort();
    expect(liens).toEqual(["bail", "lot"]);
    expect((await db.query(`select 1 from public.purge_fichiers where storage_path=$1`, [chemin])).rows).toHaveLength(1);
  });

  // ── Dépôts liés à l'appelant ───────────────────────────────────────────────
  it("deposer_ma_piece : le locataire ne déclare plus le chemin d'un autre fichier de l'agence", async () => {
    await postgres();
    const diag = `${orgA}/${crypto.randomUUID()}.pdf`;
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('documents',$1,$2)`, [diag, adminA]);
    await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'diagnostic','DPE',$2,'application/pdf',10,'audit-diag-'||gen_random_uuid())`, [orgA, diag]);
    const nonClasse = `${orgA}/${crypto.randomUUID()}.pdf`;
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('documents',$1,$2)`, [nonClasse, adminA]);
    const mien = `${orgA}/${crypto.randomUUID()}.pdf`;
    await db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('documents',$1,$2,'{"size":4242}')`, [mien, locA]);
    const demande = async () => (await un<{ id: string }>(
      `insert into public.pieces_demandees (organization_id, person_id, type, libelle) values ($1,$2,'justificatif','Avis') returning id`,
      [orgA, personneLoc])).id;
    const [d1, d2, d3] = [await demande(), await demande(), await demande()];
    await agir(locA);
    expect(await echec(`select public.deposer_ma_piece($1,$2,$3,'application/pdf',1,'fausse-empreinte')`, [orgA, d1, diag])).toMatch(/déjà classé/);
    expect(await echec(`select public.deposer_ma_piece($1,$2,$3,'application/pdf',1,'fausse-2')`, [orgA, d2, nonClasse])).toMatch(/pas été déposé par votre compte/);
    expect(await echec(`select public.deposer_ma_piece($1,$2,$3,'application/pdf',1,'vraie')`, [orgA, d3, mien])).toBe("");
    await postgres();
    expect((await un<{ taille_octets: string }>(`select taille_octets from public.documents where storage_path=$1`, [mien])).taille_octets).toBe("4242");
  });

  it("purger_fichier_sans_fiche : ni la signature de l'organisation, ni le fichier d'un autre (hors responsable)", async () => {
    await postgres();
    const signature = `${orgA}/signature-${crypto.randomUUID()}.png`;
    await db.query(`update public.organizations set signature_path=$1 where id=$2`, [signature, orgA]);
    const orphelinAdmin = `${orgA}/${crypto.randomUUID()}.pdf`;
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('documents',$1,$2)`, [orphelinAdmin, adminA]);
    const orphelinAgent = `${orgA}/${crypto.randomUUID()}.pdf`;
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('documents',$1,$2)`, [orphelinAgent, agentA]);
    await agir(agentA);
    expect((await un<{ r: boolean }>(`select public.purger_fichier_sans_fiche($1) as r`, [signature])).r).toBe(false);
    expect((await un<{ r: boolean }>(`select public.purger_fichier_sans_fiche($1) as r`, [orphelinAdmin])).r).toBe(false);
    expect((await un<{ r: boolean }>(`select public.purger_fichier_sans_fiche($1) as r`, [orphelinAgent])).r).toBe(true);
    await agir(adminA);
    expect((await un<{ r: boolean }>(`select public.purger_fichier_sans_fiche($1) as r`, [signature])).r).toBe(false);
    expect((await un<{ r: boolean }>(`select public.purger_fichier_sans_fiche($1) as r`, [orphelinAdmin])).r).toBe(true);
  });

  // ── Invitation, adhésions ──────────────────────────────────────────────────
  it("inviter_locataire : adresse en casse mixte acceptée, rattachement d'un compte existant tracé", async () => {
    await postgres();
    const email = `audit27.${crypto.randomUUID().slice(0, 8)}@test.local`;
    const compte = await utilisateur(email);
    const fiche = (await un<{ id: string }>(`insert into public.persons (organization_id, nom, email) values ($1,'Invité',$2) returning id`,
      [orgB, email.replace("audit27", "Audit27").toUpperCase()])).id;
    await agir(adminB);
    expect((await un<{ e: string }>(`select public.inviter_locataire($1,$2) as e`, [orgB, fiche])).e).toBe(email);
    await postgres();
    const trace = await un<{ details: { compte: string; compte_existant: boolean } }>(
      `select details from public.audit_log where action='invitation_locataire' and organization_id=$1`, [orgB]);
    expect(trace.details).toMatchObject({ compte, compte_existant: true });
  });

  it("memberships : plus d'ajout ni de changement de compte par l'API ; tout changement de rôle est journalisé", async () => {
    await agir(adminA);
    expect(await echec(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'agent')`, [adminB, orgA]))
      .toMatch(/permission denied/);
    expect(await echec(`update public.memberships set account_id=$1 where account_id=$2 and organization_id=$3`, [adminB, agentA, orgA]))
      .toMatch(/permission denied/);
    await db.query(`update public.memberships set role='admin_agence' where account_id=$1 and organization_id=$2`, [agentA, orgA]);
    await postgres();
    const t = await un<{ account_id: string; details: Record<string, string> }>(
      `select account_id, details from public.audit_log where action='role_modifie' and organization_id=$1`, [orgA]);
    expect(t.account_id).toBe(adminA);
    expect(t.details).toMatchObject({ role_avant: "agent", role: "admin_agence", compte: agentA });
  });

  // ── Encaissements ──────────────────────────────────────────────────────────
  it("encaissement : DELETE direct refusé sans motif ; la fonction avec motif passe et journalise", async () => {
    const { bail } = await bailEtDocument("actif", null);
    await postgres();
    await db.query("set local session_replication_role = replica");
    const enc = (await un<{ id: string }>(
      `insert into public.encaissements (organization_id, bail_id, montant) values ($1,$2,100) returning id`,
      [orgA, bail])).id;
    await db.query("set local session_replication_role = origin");
    await agir(adminA);
    expect(await echec(`delete from public.encaissements where id=$1`, [enc])).toMatch(/Motif obligatoire/);
    expect(await echec(`select public.supprimer_encaissement($1, 'Saisie en double')`, [enc])).toBe("");
    await postgres();
    const t = await un<{ details: { motif: string } }>(`select details from public.audit_log where action='suppression_encaissement' and organization_id=$1`, [orgA]);
    expect(t.details.motif).toBe("Saisie en double");
  });

  // ── Youtrust ───────────────────────────────────────────────────────────────
  it("Youtrust : l'agent rattache sa demande une fois ; réécrire les identifiants est réservé au responsable", async () => {
    await postgres();
    const doc = (await un<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'courrier','Courrier',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'audit-yt-'||gen_random_uuid()) returning id`, [orgA])).id;
    const demande = (await un<{ id: string }>(
      `insert into public.demandes_signature (organization_id, document_id, person_id, created_by) values ($1,$2,$3,$4) returning id`,
      [orgA, doc, personneLoc, agentA])).id;
    // Le signataire est dans le portefeuille de l'agent (mandat dont il est titulaire).
    await db.query("set local session_replication_role = replica");
    await db.query(`insert into public.mandats (organization_id, person_id, etat, agent_account_id) values ($1,$2,'actif',$3)`, [orgA, personneLoc, agentA]);
    await db.query("set local session_replication_role = origin");
    const appel = `select public.rattacher_signature_youtrust($1,$2,$3,'doc','sig','ongoing')`;
    await agir(agentA);
    expect(await echec(appel, [orgA, demande, "req-1"])).toBe("");
    expect(await echec(appel, [orgA, demande, "req-2"])).toMatch(/responsable/);
    await agir(adminA);
    expect(await echec(appel, [orgA, demande, "req-3"])).toBe("");
    await postgres();
    expect((await un<{ external_request_id: string }>(`select external_request_id from public.demandes_signature where id=$1`, [demande])).external_request_id).toBe("req-3");
    expect((await db.query(`select 1 from public.audit_log where action='signature_rattachement_modifie' and organization_id=$1`, [orgA])).rows).toHaveLength(1);
  });

  // ── CGU ────────────────────────────────────────────────────────────────────
  it("CGU : l'acceptation est inscrite à la création du compte, à l'heure du serveur, et ne se réécrit pas", async () => {
    await postgres();
    const compte = await utilisateur(undefined, { cgu_version: "2026-09-24", cgu_acceptee_le: "2020-01-01T00:00:00Z" });
    const a = await un<{ version: string; source: string; recent: boolean }>(
      `select version, source, acceptee_le > now() - interval '1 minute' as recent from public.acceptations_cgu where account_id=$1`, [compte]);
    expect(a).toEqual({ version: "2026-09-24", source: "inscription", recent: true });
    await agir(compte);
    expect(await echec(`update public.acceptations_cgu set version='autre' where account_id=$1`, [compte])).toMatch(/permission denied|ne se modifie/);
    expect(await echec(`select public.accepter_cgu('2026-09-24','espace_proprietaire')`)).toBe("");
    expect((await db.query(`select 1 from public.acceptations_cgu where account_id=$1`, [compte])).rows).toHaveLength(2);
    await postgres();
    expect(await echec(`update public.acceptations_cgu set version='autre' where account_id=$1`, [compte])).toMatch(/ne se modifie/);
    expect(await echec(`delete from public.acceptations_cgu where account_id=$1`, [compte])).toMatch(/ne se modifie/);
  });

  // ── Veille ─────────────────────────────────────────────────────────────────
  it("veille publiée : la vue n'est plus SECURITY DEFINER et `publics` s'applique", async () => {
    await postgres();
    const info = (await un<{ id: string }>(
      `insert into public.regulatory_watch (source_url, titre, source_nom, statut, publics, resume, action_conseillee, valide_par, valide_le)
       values ('https://www.service-public.gouv.fr/professionnels/actualites/'||gen_random_uuid(),'Règle pour les agences','Service Public',
               'publie', array['agence'], 'Résumé de test suffisamment long', 'Action de test à prévoir', $1, now()) returning id`,
      [adminA])).id;
    expect((await un<{ o: string[] }>(`select reloptions as o from pg_class where relname='regulatory_watch_published'`)).o)
      .toContain("security_invoker=true");
    await agir(adminA);
    expect((await db.query(`select id from public.regulatory_watch_published where id=$1`, [info])).rows).toHaveLength(1);
    expect(await echec(`select etude from public.regulatory_watch_published`)).toMatch(/column|colonne/i);
    await agir(locA);
    expect((await db.query(`select id from public.regulatory_watch_published where id=$1`, [info])).rows).toHaveLength(0);
    // La diffusion suit la fiche : changer ses publics la déplace.
    await postgres();
    await db.query(`update public.regulatory_watch set publics=array['locataire'] where id=$1`, [info]);
    await agir(adminA);
    expect((await db.query(`select id from public.regulatory_watch_published where id=$1`, [info])).rows).toHaveLength(0);
    await agir(locA);
    expect((await db.query(`select id from public.regulatory_watch_published where id=$1`, [info])).rows).toHaveLength(1);
  });

  // ── Détails ────────────────────────────────────────────────────────────────
  it("détails : anon ne lit plus les tables de gestion ; mfa_actif n'est plus modifiable par son titulaire", async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.role_table_grants where grantee='anon' and table_schema='public' and privilege_type='SELECT'`);
    const lisibles = rows.map((r) => r.table_name).sort();
    expect(lisibles.filter((t) => !["publications", "site_pages", "tarif_tranches", "demandes_devis"].includes(t))).toEqual([]);
    expect((await un<{ p: boolean }>(`select has_column_privilege('authenticated','public.accounts','mfa_actif','UPDATE') as p`)).p).toBe(false);
  });

  it("purge : la mission planifiée existe et peut être mise en pause comme les autres", async () => {
    expect((await db.query(`select active from public.agent_missions where cle='purge'`)).rows).toEqual([{ active: true }]);
  });
});
