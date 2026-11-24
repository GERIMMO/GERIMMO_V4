/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D4 — Q37 ET Q24 (migration 20261125110000).
 *
 *  · Q37 : « oui, cinquième envoi avec son interrupteur, ouvert à la publication ». La relance envoyée à l'artisan qui
 *    n'a pas répondu à une demande de report de rendez-vous devient un cinquième envoi automatique, sur le modèle des
 *    quatre autres : interrupteur du superviseur permanent, FERMÉ PAR DÉFAUT, preuve refaite par la base avant l'envoi.
 *  · Q24 : « accord des espaces conservé ; ouvre aussi la relance à la main ». La relance de loyer qu'un propriétaire
 *    envoie lui-même d'un clic est admise sous l'interrupteur de la relance de loyer, SANS l'accord permanent de
 *    l'espace (qui reste exigé pour la relance automatique, et qu'un espace garde quand l'interrupteur est refermé).
 *
 * Ce que ces tests tiennent :
 *  1. le cinquième interrupteur est fermé à la livraison ; seul le superviseur permanent l'ouvre ; geste journalisé ;
 *  2. fermé : aucune preuve, donc aucun envoi, pour l'un comme pour l'autre ;
 *  3. ouvert : la preuve n'existe que si la base redit elle-même que CET e-mail est dû à CETTE adresse, pour CET
 *     espace (isolation), et — pour la relance à la main — que la personne qui clique est le propriétaire de l'espace ;
 *  4. l'accord d'un espace reste exigé pour la relance automatique, et survit à une fermeture puis réouverture ;
 *  5. un e-mail en file ne repart pas si l'interrupteur a été refermé ;
 *  6. droits : rien pour un visiteur, rien de plus pour un compte ; rejeu sans effet ; retour qui rend l'état d'avant.
 *
 * AUCUN envoi réel : `fetch` est simulé. Nécessite SUPABASE_DB_URL. Chaque test dans une transaction annulée. Le
 * dernier bloc rejoue du DDL : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierBaseDeTest } from "./garde-base";
import { clientSurPg } from "./fixtures/supabase-sur-pg";
import { couvrirParMandat } from "./fixtures/mandat";
import { MAILLONS_CHAINE_COURRIELS, maillonsEnAttente, maillonsPlusRecents } from "./fixtures/chaine-courriels";

const partage = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => partage.service }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));

import { empreinteCourriel } from "../src/lib/courriels-durables";
import { envoyerEmail, envoyerEmailTransport } from "../src/lib/email";
import { envoiAutomatiqueOuvert, FLUX_ENVOIS_AUTOMATIQUES, LIBELLES_ENVOIS_AUTOMATIQUES, montantDeContexte } from "../src/lib/envois-suspendus";
import { circuitAdmisPilote } from "../src/lib/perimetre-pilote";
import { conserverCourriel, identiteCourriel, reprendreCourriels, type ChargeCourriel } from "../src/lib/reprise-courriels";

const NOM = "20261125110000_relance_report_rdv_et_relance_a_la_main";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const HEX64 = /^[0-9a-f]{64}$/;
const LOCATAIRE = "lea.locataire@example.invalid";
const COLOCATAIRE = "colin.colocataire@example.invalid";
const GARANT = "gaston.garant@example.invalid";
const ARTISAN = "atelier.artisan@example.invalid";

describe("lot D4 — manifeste, texte de la migration et liste fermée (sans base)", () => {
  it("la migration est au manifeste une seule fois, en tête de la chaîne des e-mails, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261122200000_envois_automatiques_reglage.sql", "20261122210000_decision_artisan_notifiee.sql", "20261125106000_type_vendeur_et_vente_sans_mediateur.sql"]) {
      expect(manifeste.indexOf(`${NOM}.sql`), avant).toBeGreaterThan(manifeste.indexOf(avant));
    }
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // La preuve de la relance à la main cite la fonction du jour de Paris : son retour est dans l'ordre complet, en tête.
    expect(lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "").toMatch(/^\n?`20261125110000` \(relance d'une demande de report/);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/relances-d4-base.test.ts"');
    expect(MAILLONS_CHAINE_COURRIELS.at(-1)).toBe(NOM);
  });

  it("le cinquième interrupteur est fermé par défaut dans le code, rien ne s'ouvre à un visiteur, aucun droit de plus pour un compte", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("add column if not exists relance_report_rdv boolean not null default false;");
    // Aucune ligne n'ouvre un interrupteur : l'ouverture est un geste du jour de la publication, pas du code.
    expect(sql).not.toMatch(/update\s+public\.envois_automatiques_reglage\s+set\s+(?!avis_echeance = case)/i);
    expect(sql).not.toMatch(/regler_envoi_automatique\s*\(\s*'/);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // Les mêmes trois fonctions qu'au 22/11 s'ouvrent aux comptes, pas une de plus.
    expect([...sql.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to authenticated(?:, service_role)?;/g)].map((m) => m[1]).sort())
      .toEqual(["envois_automatiques_proposes", "lire_envois_automatiques", "regler_envoi_automatique"]);
    // Chaque fonction nouvelle ou réécrite : SECURITY DEFINER avec un chemin de recherche vide.
    const definitions = [...sql.matchAll(/create or replace function public\.(\w+)\([^)]*\)[\s\S]*?as \$\$/g)];
    expect(definitions.map((d) => d[1]).sort()).toEqual(["empreinte_maillon_relances_d4", "envoi_automatique_ouvert", "envois_automatiques_proposes", "finaliser_maillon_relances_d4", "lire_envois_automatiques", "regler_envoi_automatique"]);
    for (const d of definitions) expect(d[0], d[1]).toMatch(/security definer set search_path = ''/);
    expect(sql).toContain("if public.is_permanent_super_admin() is not true then");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    expect(sql).not.toMatch(/create trigger|disable row level security|drop policy/i);
  });

  it("le code connaît cinq envois ; le cinquième a son titre et son détail pour la console", () => {
    expect(FLUX_ENVOIS_AUTOMATIQUES).toEqual(["avis_echeance", "relance_loyer", "rappel_rendez_vous", "relance_invitation", "relance_report_rdv"]);
    expect(LIBELLES_ENVOIS_AUTOMATIQUES.relance_report_rdv.titre).toBe("Relance d’une demande de report de rendez-vous");
    expect(LIBELLES_ENVOIS_AUTOMATIQUES.relance_report_rdv.detail).toContain("artisan");
    // Q24 : la console dit que l'interrupteur de la relance ouvre aussi l'envoi à la main.
    expect(LIBELLES_ENVOIS_AUTOMATIQUES.relance_loyer.detail).toContain("envoyer lui-même une relance");
  });

  it("la liste fermée admet les deux e-mails par leur forme complète, et rien d'approchant", () => {
    const id = randomUUID(), org = randomUUID(), acteur = randomUUID();
    const base = { subject: "Objet", html: "<p>corps</p>", organisationId: org };
    const report: ChargeCourriel = { ...base, to: ARTISAN, contexteMetier: { type: "relance_report_rdv", id } };
    const manuelle: ChargeCourriel = { ...base, to: LOCATAIRE, contexteMetier: { type: "relance_loyer_manuelle", id, niveau: "relance_1", reste: "750", total: "1500.5", acteur } };
    for (const p of [report, manuelle]) {
      expect(circuitAdmisPilote(p), p.contexteMetier!.type).toBe(true);
      expect(circuitAdmisPilote({ ...p, organisationId: undefined }), p.contexteMetier!.type).toBe(false);
      expect(circuitAdmisPilote({ ...p, piecesJointes: [{ nom: "piece.pdf", contenuBase64: "AA==" }] }), p.contexteMetier!.type).toBe(false);
      expect(circuitAdmisPilote({ ...p, contexteMetier: { ...p.contexteMetier, id: "pas-un-identifiant" } } as ChargeCourriel), p.contexteMetier!.type).toBe(false);
      // Le même e-mail sans contexte reste suspendu : c'est ce que fait le code, interrupteur fermé.
      expect(circuitAdmisPilote({ ...p, contexteMetier: undefined }), p.contexteMetier!.type).toBe(false);
    }
    for (const surcharge of [{ niveau: "mise_en_demeure" }, { acteur: "moi" }, { acteur: undefined }, { reste: "750,00" }, { reste: "-1" }, { total: null }, { total: "beaucoup" }]) {
      expect(circuitAdmisPilote({ ...manuelle, contexteMetier: { ...manuelle.contexteMetier, ...surcharge } } as ChargeCourriel), JSON.stringify(surcharge)).toBe(false);
    }
  });
});

describe.skipIf(!url)("lot D4 — cinquième envoi et relance à la main (avec base)", () => {
  const db = new Client({ connectionString: url });
  const service = clientSurPg(db, { transactionnel: true }) as unknown as SupabaseClient;
  const transport = vi.fn();

  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as T[];
  const id = async (sql: string, p: unknown[] = []) => String((await q<{ id: string }>(sql, p))[0].id);
  const enService = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  };
  const en = async (compte: string, aal = "aal2") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: compte, role: "authenticated", aal })]);
    await db.query("set local role authenticated");
  };
  const enRole = async (role: "anon" | "service_role") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role })]);
    await db.query(`set local role ${role}`);
  };
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  async function compte(superviseur = false): Promise<string> {
    const c = await id(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-d4-'||gen_random_uuid()||'@example.invalid', 'x', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    if (superviseur) await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [c]);
    return c;
  }
  type Flux = (typeof FLUX_ENVOIS_AUTOMATIQUES)[number];
  const ouvrir = async (flux: Flux, ouvert = true) => { await enService(); await db.query(`update public.envois_automatiques_reglage set ${flux} = $1`, [ouvert]); };
  const arreter = async (cle: string) => {
    await enService();
    const auteur = await compte();
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, true, 'Essai de contrôle', $2) on conflict (cle) do update set arrete = true", [cle, auteur]);
  };
  const preuve = async (org: string | null, ctx: Record<string, unknown>) => {
    await enService();
    return (await q<{ e: string | null }>("select public.empreinte_metier_courriel($1, $2::jsonb) e", [org, JSON.stringify(ctx)]))[0].e;
  };
  /** Une modification tentée puis annulée : chaque contre-exemple repart du même décor. */
  const apres = async (changer: () => Promise<unknown>, lire: () => Promise<string | null>) => {
    await db.query("savepoint contre_exemple");
    await changer();
    const lu = await lire();
    await db.query("rollback to savepoint contre_exemple");
    return lu;
  };
  const h = (adresse: string) => empreinteCourriel(adresse);
  const ligne = async (p: ChargeCourriel) => (await q<Record<string, unknown>>("select * from public.courriels_durables where id = $1", [identiteCourriel(p).id]))[0];
  const envoyer = (p: ChargeCourriel, circuit: string) => envoyerEmail({ ...p, circuit, organisation: { db: service, id: p.organisationId! } });
  const reprendre = () => reprendreCourriels(service,
    (p, ref) => envoyerEmailTransport({ ...p, referenceInterne: ref, cleIdempotence: p.cleIdempotence, organisation: { db: service, id: p.organisationId! } }),
    async () => {});

  // ── Les décors ───────────────────────────────────────────────────────────────────────────────────────────────
  /** Une demande de report en attente sur un rendez-vous planifié ; sa relance est réservée, comme le fait la tâche. */
  async function decorReport(reserver = true) {
    await enService();
    const org = await id("insert into public.organizations(name,status,type) values('TEST report D4','active','agence') returning id");
    const compteLocataire = await compte(), compteArtisan = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values ($1,$2,'locataire'),($3,$2,'artisan')", [compteLocataire, org, compteArtisan]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email,account_id) values($1,'Essai','Marc',$2,$3) returning id", [org, LOCATAIRE, compteLocataire]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Immeuble fictif','appartement','9 rue Essai','75004','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50) returning id", [org, lot, locataire]);
    const incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,'INC-D4-001',$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite fictive','qualifie','proprietaire','Joint usé') returning id`, [org, lot, bail, locataire]);
    const artisan = await id(`insert into public.artisans(raison_sociale,siret,telephone,email,statut_plateforme,siret_etat,visibilite,account_id)
      values('Atelier fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000',$1,'valide','verifie','publique',$2) returning id`, [ARTISAN, compteArtisan]);
    const intervention = await id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','planifiee') returning id", [org, incident, artisan]);
    await db.query(`update public.incident_interventions
        set debut_prevu = (public.aujourdhui_paris() + 5 + time '09:00') at time zone 'Europe/Paris',
            fin_prevue  = (public.aujourdhui_paris() + 5 + time '11:00') at time zone 'Europe/Paris' where id = $1`, [intervention]);
    const demande = await id(`insert into public.intervention_demandes_rdv(organization_id,intervention_id,rdv_debut,type,motif_code,expire_le,cle_envoi)
      values($1,$2,now()+interval '7 days','report','travail',now()+interval '48 hours',gen_random_uuid()) returning id`, [org, intervention]);
    if (reserver) expect((await q<{ r: unknown }>("select public.reserver_relance_report_rdv($1) r", [demande]))[0].r).toBeTruthy();
    return { org, intervention, demande };
  }
  const ctxReport = (demande: string, adresse = ARTISAN, surcharge: Record<string, unknown> = {}) =>
    ({ type: "relance_report_rdv", id: demande, destinataire: h(adresse), ...surcharge });

  /**
   * Chez un propriétaire bailleur : un bail actif, son plus ancien terme échu depuis dix jours et impayé. L'espace n'a
   * PAS donné l'accord d'envoi automatique des relances (`relances_envoi_auto` faux) : c'est le cas que Q24 ouvre.
   */
  async function decorLoyer(agence = false) {
    await enService();
    const org = await id("insert into public.organizations(name,type,status,relances_envoi_auto) values('TEST relance à la main D4',$1,'active',false) returning id", [agence ? "agence" : "proprietaire_direct"]);
    const owner = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,$3)", [owner, org, agence ? "admin_agence" : "proprietaire_direct"]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','appartement','1 rue Essai','75001','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Essai','Léa',$2) returning id", [org, LOCATAIRE]);
    const bail = await id(`insert into public.baux(organization_id,lot_id,locataire_principal,loyer_hc,charges,etat,date_debut,jour_echeance)
      values($1,$2,$3,700,50,'actif',date_trunc('month', public.aujourdhui_paris())::date,1) returning id`, [org, lot, locataire]);
    for (const [adresse, role] of [[COLOCATAIRE, "colocataire"], [GARANT, "garant"]]) {
      const p = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Essai','Autre',$2) returning id", [org, adresse]);
      await db.query("insert into public.bail_personnes(organization_id,bail_id,person_id,role) values($1,$2,$3,$4)", [org, bail, p, role]);
    }
    if (agence) await couvrirParMandat(db, bail);
    await en(owner);
    await db.query("select public.generer_appels_loyer($1)", [bail]);
    await enService();
    // Le plus ancien terme est échu depuis dix jours ; les suivants éventuels restent à venir.
    const appel = await id("select id from public.appels_loyer where bail_id = $1 order by periode limit 1", [bail]);
    await db.query("update public.appels_loyer set date_echeance = public.aujourdhui_paris() - 10 where id = $1", [appel]);
    await db.query("update public.appels_loyer set date_echeance = public.aujourdhui_paris() + 20 where bail_id = $1 and id <> $2", [bail, appel]);
    const [m] = await q<{ reste: string }>("select round(montant_du - montant_couvert, 2)::text reste from public.etat_loyers_bail_brut($1) where appel_id = $2", [bail, appel]);
    return { org, owner, bail, appel, locataire, reste: montantDeContexte(m.reste)! };
  }
  type Loyer = Awaited<ReturnType<typeof decorLoyer>>;
  const ctxManuelle = (d: Loyer, adresse = LOCATAIRE, surcharge: Record<string, unknown> = {}) =>
    ({ type: "relance_loyer_manuelle", id: d.appel, niveau: "relance_1", reste: d.reste, total: d.reste, acteur: d.owner, destinataire: h(adresse), ...surcharge });
  const chargeReport = (d: { org: string; demande: string }, to = ARTISAN): ChargeCourriel => ({
    to, subject: "Relance fictive d’un report", html: "<p>Report fictif</p>", cleIdempotence: `rdv-report:relance:${d.demande}`, organisationId: d.org,
    contexteMetier: { type: "relance_report_rdv", id: d.demande },
  });
  const chargeManuelle = (d: Loyer, to = LOCATAIRE): ChargeCourriel => ({
    to, subject: "Relance fictive à la main", html: "<p>Relance fictive</p>", cleIdempotence: `essai-relance-main-${d.appel}-${to}`, organisationId: d.org,
    contexteMetier: { type: "relance_loyer_manuelle", id: d.appel, niveau: "relance_1", reste: d.reste, total: d.reste, acteur: d.owner },
  });

  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await enService();
    vi.stubEnv("GERIMMO_PILOTE_LIMITE", "true"); vi.stubEnv("COURRIELS_CHIFFREMENT_CLE", "ef".repeat(32)); vi.stubEnv("RESEND_API_KEY", "fictif-sans-service");
    partage.service = service;
    transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: `fictif-${randomUUID()}` }), { status: 200 }));
    vi.stubGlobal("fetch", transport);
    await db.query("update public.supervision_arrets set arrete = false");
    // Quel que soit l'état laissé sur le banc, chaque test part de la livraison : tout fermé.
    await db.query("update public.envois_automatiques_reglage set avis_echeance = false, relance_loyer = false, rappel_rendez_vous = false, relance_invitation = false, relance_report_rdv = false");
  });
  afterEach(async () => { await db.query("rollback"); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  // ── 1. Le cinquième interrupteur ─────────────────────────────────────────────────────────────────────────────
  it("Q37 — le cinquième interrupteur est fermé à la livraison ; seul le superviseur permanent l'ouvre, et son geste est journalisé", async () => {
    const [defaut] = await q<{ d: string; n: string }>(`select column_default d, is_nullable n from information_schema.columns
      where table_schema='public' and table_name='envois_automatiques_reglage' and column_name='relance_report_rdv'`);
    expect(defaut).toEqual({ d: "false", n: "NO" });
    expect(await envoiAutomatiqueOuvert(service, "relance_report_rdv")).toBe(false);

    const ordinaire = await compte(), superviseur = await compte(true);
    await en(ordinaire);
    expect(await refus("select public.regler_envoi_automatique('relance_report_rdv', true)")).toMatch(/Supervision permanente/);
    expect(await refus("select public.lire_envois_automatiques()")).toMatch(/Accès réservé à la supervision/);
    expect(await refus("select public.envoi_automatique_ouvert('relance_report_rdv')")).toMatch(/permission denied/);
    expect(await refus("update public.envois_automatiques_reglage set relance_report_rdv = true")).toMatch(/permission denied/);
    // Un superviseur sans double vérification ne l'ouvre pas non plus.
    await en(superviseur, "aal1");
    expect(await refus("select public.regler_envoi_automatique('relance_report_rdv', true)")).toMatch(/Supervision permanente/);
    await enRole("anon");
    expect(await refus("select public.regler_envoi_automatique('relance_report_rdv', true)")).toMatch(/permission denied/);
    expect(await refus("select public.envois_automatiques_proposes()")).toMatch(/permission denied/);
    await enService();
    expect(await envoiAutomatiqueOuvert(service, "relance_report_rdv")).toBe(false);

    await en(superviseur);
    expect(await refus("select public.regler_envoi_automatique('relance_report', true)")).toMatch(/Envoi automatique inconnu/);
    await db.query("select public.regler_envoi_automatique('relance_report_rdv', true)");
    const etat = (await q<{ e: Record<string, unknown> }>("select public.lire_envois_automatiques() e"))[0].e;
    expect(etat).toMatchObject({ avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false, relance_report_rdv: true });
    await en(ordinaire);
    expect((await q<{ e: unknown }>("select public.envois_automatiques_proposes() e"))[0].e)
      .toEqual({ avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false, relance_report_rdv: true });
    await enService();
    // Un seul envoi ouvert : les quatre autres restent fermés.
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(flux === "relance_report_rdv");
    await en(superviseur);
    await db.query("select public.regler_envoi_automatique('relance_report_rdv', false)");
    await enService();
    expect(await envoiAutomatiqueOuvert(service, "relance_report_rdv")).toBe(false);
    const journal = await q<{ details: Record<string, unknown> }>("select details from public.supervision_operations where action = 'envoi_automatique' and auteur = $1 order by details->>'ouvert' desc", [superviseur]);
    expect(journal.map((j) => j.details)).toEqual([
      { flux: "relance_report_rdv", ouvert: true, precedent: false },
      { flux: "relance_report_rdv", ouvert: false, precedent: true },
    ]);
  });

  // ── 2. Q37 : la preuve de la relance d'une demande de report ─────────────────────────────────────────────────
  it("Q37 — fermé : aucune preuve, même si la relance est réservée ; ouvert : une preuve stable, à l'adresse de l'artisan", async () => {
    const d = await decorReport();
    expect(await preuve(d.org, ctxReport(d.demande))).toBeNull();
    // Les quatre autres interrupteurs n'ouvrent pas celui-ci.
    for (const flux of ["avis_echeance", "relance_loyer", "rappel_rendez_vous", "relance_invitation"] as const) await ouvrir(flux);
    expect(await preuve(d.org, ctxReport(d.demande))).toBeNull();
    await ouvrir("relance_report_rdv");
    const e = await preuve(d.org, ctxReport(d.demande));
    expect(e).toMatch(HEX64);
    expect(await preuve(d.org, ctxReport(d.demande))).toBe(e);
    await ouvrir("relance_report_rdv", false);
    expect(await preuve(d.org, ctxReport(d.demande))).toBeNull();
  });

  it("Q37 — ouvert : pas de preuve pour une autre adresse, un autre espace, sans réservation, une relance déjà notée, une demande close ou échue, ou sous arrêt", async () => {
    const d = await decorReport();
    const autre = await decorReport();
    await ouvrir("relance_report_rdv");
    const lire = () => preuve(d.org, ctxReport(d.demande));
    expect(await lire()).toMatch(HEX64);
    // L'adresse : celle de l'artisan de la mission, pas celle du locataire ni d'un tiers.
    expect(await preuve(d.org, ctxReport(d.demande, LOCATAIRE))).toBeNull();
    expect(await preuve(d.org, ctxReport(d.demande, "intrus@example.invalid"))).toBeNull();
    // Isolation : la demande d'un espace ne se prouve pas depuis un autre, ni sans espace.
    expect(await preuve(autre.org, ctxReport(d.demande))).toBeNull();
    expect(await preuve(null, ctxReport(d.demande))).toBeNull();
    expect(await preuve(d.org, ctxReport(randomUUID()))).toBeNull();
    expect(await preuve(d.org, ctxReport("pas-un-identifiant"))).toBeNull();
    expect(await preuve(d.org, { ...ctxReport(d.demande), destinataire: "en-clair@example.invalid" })).toBeNull();
    const maj = (sql: string) => () => db.query(sql, [d.demande]);
    expect(await apres(maj("update public.intervention_demandes_rdv set relance_reservee_le = null, relance_reservation_id = null where id = $1"), lire)).toBeNull();
    expect(await apres(maj("update public.intervention_demandes_rdv set relance_envoyee_le = now() where id = $1"), lire)).toBeNull();
    expect(await apres(maj("update public.intervention_demandes_rdv set relance_echec = true where id = $1"), lire)).toBeNull();
    expect(await apres(maj("update public.intervention_demandes_rdv set expire_le = now() - interval '1 minute' where id = $1"), lire)).toBeNull();
    expect(await apres(maj("update public.intervention_demandes_rdv set statut = 'refusee', repondu_le = now() where id = $1"), lire)).toBeNull();
    expect(await apres(() => db.query("update public.incident_interventions set statut = 'refusee', refus_motif = 'Essai de contrôle' where id = $1", [d.intervention]), lire)).toBeNull();
    expect(await apres(() => arreter("rappels"), lire)).toBeNull();
    expect(await apres(() => arreter("global"), lire)).toBeNull();
    // L'arrêt d'une autre mission ne retient pas celle-ci.
    expect(await apres(() => arreter("relances"), lire)).toMatch(HEX64);
    expect(await lire()).toMatch(HEX64);
  });

  // ── 3. Q24 : la preuve de la relance de loyer envoyée à la main ──────────────────────────────────────────────
  it("Q24 — fermée : aucune preuve ; ouverte : une preuve pour le locataire et pour un colocataire engagé, sans l'accord permanent de l'espace", async () => {
    const d = await decorLoyer();
    expect(await preuve(d.org, ctxManuelle(d))).toBeNull();
    // Le cinquième interrupteur n'ouvre pas la relance de loyer.
    await ouvrir("relance_report_rdv");
    expect(await preuve(d.org, ctxManuelle(d))).toBeNull();
    await ouvrir("relance_loyer");
    // L'espace n'a pas donné l'accord permanent : la relance AUTOMATIQUE n'est pas due…
    expect((await q<{ a: boolean }>("select relances_envoi_auto a from public.organizations where id = $1", [d.org]))[0].a).toBe(false);
    expect(await q("select 1 from public.relances_loyer_dues(500) where bail_id = $1", [d.bail])).toHaveLength(0);
    // … mais la relance À LA MAIN se prouve : c'est le clic du propriétaire qui décide.
    const e = await preuve(d.org, ctxManuelle(d));
    expect(e).toMatch(HEX64);
    expect(await preuve(d.org, ctxManuelle(d))).toBe(e);
    expect(await preuve(d.org, ctxManuelle(d, COLOCATAIRE))).toMatch(HEX64);
    await ouvrir("relance_loyer", false);
    expect(await preuve(d.org, ctxManuelle(d))).toBeNull();
  });

  it("Q24 — ouverte : pas de preuve pour une autre adresse, la caution, un colocataire désengagé, une personne qui n'est pas le propriétaire, un autre espace", async () => {
    const d = await decorLoyer();
    const autre = await decorLoyer();
    await ouvrir("relance_loyer");
    const lire = (adresse = LOCATAIRE) => preuve(d.org, ctxManuelle(d, adresse));
    expect(await lire()).toMatch(HEX64);
    expect(await lire("intrus@example.invalid")).toBeNull();
    // La caution n'est pas destinataire d'une relance à la main.
    expect(await lire(GARANT)).toBeNull();
    expect(await apres(() => db.query("update public.bail_personnes set date_solidarite_fin = public.aujourdhui_paris() - 1 where bail_id = $1 and role = 'colocataire'", [d.bail]), () => lire(COLOCATAIRE))).toBeNull();
    // La personne qui clique : le propriétaire de CET espace, membre actif. Ni un inconnu, ni le propriétaire d'un autre
    // espace, ni un compte retiré, ni un autre rôle.
    expect(await preuve(d.org, ctxManuelle(d, LOCATAIRE, { acteur: await compte() }))).toBeNull();
    expect(await preuve(d.org, ctxManuelle(d, LOCATAIRE, { acteur: autre.owner }))).toBeNull();
    expect(await preuve(d.org, ctxManuelle(d, LOCATAIRE, { acteur: "moi" }))).toBeNull();
    expect(await preuve(d.org, ctxManuelle(d, LOCATAIRE, { acteur: undefined }))).toBeNull();
    expect(await apres(() => db.query("update public.memberships set status = 'inactive' where organization_id = $1 and account_id = $2", [d.org, d.owner]), () => lire())).toBeNull();
    // Isolation : l'appel d'un espace ne se prouve pas depuis un autre, même avec son propre propriétaire, ni sans espace.
    expect(await preuve(autre.org, ctxManuelle(d))).toBeNull();
    expect(await preuve(autre.org, ctxManuelle(d, LOCATAIRE, { acteur: autre.owner }))).toBeNull();
    expect(await preuve(null, ctxManuelle(d))).toBeNull();
    expect(await preuve(d.org, ctxManuelle(d, LOCATAIRE, { id: autre.appel }))).toBeNull();
    // Réservée aux espaces de propriétaires, comme l'écran qui la propose : dans une agence, même son administrateur
    // ne la prouve pas.
    const agence = await decorLoyer(true);
    expect(await preuve(agence.org, ctxManuelle(agence))).toBeNull();
  });

  it("Q24 — ouverte : pas de preuve pour d'autres montants, un terme réglé, non échu ou qui n'est pas le plus ancien, un plan en cours, une relance déjà consignée, ou sous arrêt", async () => {
    const d = await decorLoyer();
    await ouvrir("relance_loyer");
    const lire = (surcharge: Record<string, unknown> = {}) => preuve(d.org, ctxManuelle(d, LOCATAIRE, surcharge));
    expect(await lire()).toMatch(HEX64);
    for (const surcharge of [{ reste: "1" }, { total: "1" }, { total: null }, { reste: "750,00" }, { niveau: "mise_en_demeure" }, { niveau: undefined }]) {
      expect(await lire(surcharge), JSON.stringify(surcharge)).toBeNull();
    }
    const paiement = (montant: number) => () => db.query("insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,$3, public.aujourdhui_paris())", [d.org, d.bail, montant]);
    // Réglé en entier : plus rien à relancer. Réglé en partie : les montants de l'e-mail ne sont plus les bons.
    expect(await apres(paiement(Number(d.reste)), () => lire())).toBeNull();
    expect(await apres(paiement(100), () => lire())).toBeNull();
    // Échéance du jour : la relance n'est possible que le lendemain.
    expect(await apres(() => db.query("update public.appels_loyer set date_echeance = public.aujourdhui_paris() where id = $1", [d.appel]), () => lire())).toBeNull();
    // Un terme plus ancien impayé : c'est lui qu'on relance, pas celui-ci.
    expect(await apres(() => db.query(`insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,montant_du)
      select organization_id, bail_id, (periode - interval '1 month')::date, date_echeance - 30, montant_du from public.appels_loyer where id = $1`, [d.appel]), () => lire())).toBeNull();
    expect(await apres(() => db.query(`insert into public.plans_apurement(organization_id,bail_id,etat,activated_at,date_arrete,dette_initiale,mensualite,nombre_tranches,premiere_echeance)
      values($1,$2,'actif',now(),public.aujourdhui_paris(),750,250,3,public.aujourdhui_paris()+30)`, [d.org, d.bail]), () => lire())).toBeNull();
    const consigner = (niveau: string) => () => db.query("insert into public.relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,$3,public.aujourdhui_paris())", [d.org, d.bail, niveau]);
    expect(await apres(consigner("relance_1"), () => lire())).toBeNull();
    // Une première relance consignée n'empêche pas la preuve de la deuxième.
    expect(await apres(consigner("relance_1"), () => lire({ niveau: "relance_2" }))).toMatch(HEX64);
    expect(await apres(() => db.query("update public.baux set etat = 'brouillon' where id = $1", [d.bail]), () => lire())).toBeNull();
    expect(await apres(() => arreter("relances"), () => lire())).toBeNull();
    expect(await apres(() => arreter("global"), () => lire())).toBeNull();
    expect(await apres(() => arreter("rappels"), () => lire())).toMatch(HEX64);
    expect(await lire()).toMatch(HEX64);
  });

  it("Q24 — l'accord des espaces est conservé : exigé pour la relance automatique, il survit à une fermeture puis réouverture de l'interrupteur", async () => {
    const d = await decorLoyer();
    const superviseur = await compte(true);
    await enService();
    await db.query("update public.organizations set relances_envoi_auto = true, appels_envoi_auto = true where id = $1", [d.org]);
    const accords = async () => (await q<{ a: boolean; r: boolean }>("select appels_envoi_auto a, relances_envoi_auto r from public.organizations where id = $1", [d.org]))[0];
    await en(superviseur);
    for (const ouvert of [true, false, true]) {
      for (const flux of ["avis_echeance", "relance_loyer"]) await db.query("select public.regler_envoi_automatique($1, $2)", [flux, ouvert]);
      await enService();
      expect(await accords(), String(ouvert)).toEqual({ a: true, r: true });
      await en(superviseur);
    }
    // Et l'accord reste la condition de la relance AUTOMATIQUE (règle du 22/11, inchangée) : donné, la base la dit due
    // et la prouve ; retiré, elle ne la dit plus due et ne la prouve plus. Décor d'agence : chez un propriétaire, la
    // relance automatique attend en plus sa réponse « Pas encore reçu », ce qui n'est pas le sujet ici.
    const a = await decorLoyer(true);
    await enService();
    await db.query("update public.organizations set relances_envoi_auto = true where id = $1", [a.org]);
    const due = async () => q<{ niveau: string; echeance: string; reste: string; total: string | null }>(
      "select niveau, date_echeance::text echeance, reste::text reste, total_du::text total from public.relances_loyer_dues(500) where bail_id = $1", [a.bail]);
    const [avecAccord] = await due();
    expect(avecAccord).toMatchObject({ niveau: "relance_1" });
    const ctxAuto = { type: "relance_loyer", id: a.bail, niveau: avecAccord.niveau, echeance: avecAccord.echeance, reste: montantDeContexte(avecAccord.reste),
      total: montantDeContexte(avecAccord.total), cible: "locataire", destinataire: h(LOCATAIRE) };
    await ouvrir("relance_loyer");
    expect(await preuve(a.org, ctxAuto)).toMatch(HEX64);
    await db.query("update public.organizations set relances_envoi_auto = false where id = $1", [a.org]);
    expect(await due()).toHaveLength(0);
    expect(await preuve(a.org, ctxAuto)).toBeNull();
  });

  // ── 4. L'envoi complet ───────────────────────────────────────────────────────────────────────────────────────
  it("interrupteurs fermés : avec ou sans contexte, aucun des deux e-mails ne part", async () => {
    const r = await decorReport(), l = await decorLoyer();
    for (const [p, circuit] of [[chargeReport(r), "lib/relances-reports-rdv"], [chargeManuelle(l), "app/actions/reception-loyer"]] as const) {
      // Ce que fait le code, interrupteur fermé : aucun contexte, l'envoi reste suspendu comme avant.
      const sans = await envoyer({ ...p, contexteMetier: undefined }, circuit);
      expect(sans.erreur, circuit).toContain("Envoi suspendu dans le périmètre validé");
      // Et même si un contexte était joint par erreur : la base refuse la preuve.
      const avec = await envoyer({ ...p, cleIdempotence: `${p.cleIdempotence}-avec` }, circuit);
      expect(avec.erreur, circuit).toBeTruthy();
    }
    expect(transport).not.toHaveBeenCalled();
    expect(await q("select 1 from public.courriels_durables where organization_id = any($1) and etat in ('accepte','livre')", [[r.org, l.org]])).toHaveLength(0);
  });

  it("Q37 — ouvert : la relance du report part une fois à l'artisan, sa ligne est close ; une fois notée, elle ne repart pas", async () => {
    const d = await decorReport();
    await ouvrir("relance_report_rdv");
    expect((await envoyer(chargeReport(d, "intrus@example.invalid"), "lib/relances-reports-rdv")).erreur).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();
    const p = chargeReport(d);
    expect((await envoyer(p, "lib/relances-reports-rdv")).erreur).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse((transport.mock.calls[0] as [string, { body: string }])[1].body).to).toEqual([ARTISAN]);
    const m = await ligne(p);
    expect(m).toMatchObject({ etat: "accepte", finalisation_etat: "terminee" });
    expect((m.contexte_metier as Record<string, unknown>).type).toBe("relance_report_rdv");
    // La tâche note la relance : la preuve tombe, plus rien ne peut repartir pour cette demande.
    await enService();
    await db.query("select public.noter_relance_report_rdv($1, true)", [d.demande]);
    expect(await preuve(d.org, ctxReport(d.demande))).toBeNull();
    await envoyer(p, "lib/relances-reports-rdv");
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("Q24 — ouverte : la relance à la main part une fois au locataire, sa ligne est close ; consignée au bail, elle ne repart pas", async () => {
    const d = await decorLoyer();
    await ouvrir("relance_loyer");
    expect((await envoyer(chargeManuelle(d, GARANT), "app/actions/reception-loyer")).erreur).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();
    const p = chargeManuelle(d);
    expect((await envoyer(p, "app/actions/reception-loyer")).erreur).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse((transport.mock.calls[0] as [string, { body: string }])[1].body).to).toEqual([LOCATAIRE]);
    const m = await ligne(p);
    expect(m).toMatchObject({ etat: "accepte", finalisation_etat: "terminee" });
    expect((m.contexte_metier as Record<string, unknown>).type).toBe("relance_loyer_manuelle");
    await enService();
    await db.query("insert into public.relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,'relance_1',public.aujourdhui_paris())", [d.org, d.bail]);
    await envoyer(p, "app/actions/reception-loyer");
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("jour de la publication : une relance retenue tant que l'interrupteur était fermé part, une fois, dès qu'il est ouvert", async () => {
    const r = await decorReport(), l = await decorLoyer();
    const cas = [[chargeReport(r), "lib/relances-reports-rdv", "relance_report_rdv"], [chargeManuelle(l), "app/actions/reception-loyer", "relance_loyer"]] as const;
    // Avant l'ouverture : le code n'attache aucun contexte, l'e-mail est retenu et consigné comme tel.
    for (const [p, circuit] of cas) expect((await envoyer({ ...p, contexteMetier: undefined }, circuit)).erreur, circuit).toContain("Envoi suspendu");
    expect(transport).not.toHaveBeenCalled();
    // Le superviseur ouvre : le même e-mail, avec son contexte cette fois, part — et une seule fois.
    for (const [i, [p, circuit, flux]] of cas.entries()) {
      await ouvrir(flux);
      expect((await envoyer(p, circuit)).erreur, circuit).toBeUndefined();
      expect(transport).toHaveBeenCalledTimes(i + 1);
      expect(await ligne(p), circuit).toMatchObject({ etat: "accepte", finalisation_etat: "terminee" });
      await envoyer(p, circuit);
      expect(transport).toHaveBeenCalledTimes(i + 1);
    }
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("un e-mail déjà en file ne repart pas une fois l'interrupteur refermé ; tant que tout tient, il repart une seule fois", async () => {
    const r = await decorReport(), l = await decorLoyer();
    await ouvrir("relance_report_rdv"); await ouvrir("relance_loyer");
    const report = chargeReport(r), manuelle = chargeManuelle(l);
    await conserverCourriel(service, report);
    await conserverCourriel(service, manuelle);
    await ouvrir("relance_report_rdv", false); await ouvrir("relance_loyer", false);
    await enService();
    await reprendre();
    expect(transport).not.toHaveBeenCalled();
    expect((await ligne(report)).etat).not.toBe("accepte");
    expect((await ligne(manuelle)).etat).not.toBe("accepte");

    const r2 = await decorReport();
    await ouvrir("relance_report_rdv");
    const tient = chargeReport(r2);
    await conserverCourriel(service, tient);
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await ligne(tient)).toMatchObject({ etat: "accepte" });
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // ── 5. Droits, rejeu, retour ─────────────────────────────────────────────────────────────────────────────────
  it("les têtes ne s'ouvrent qu'au traitement ; le maillon d'avant est fermé à tous ; la table reste sans droit ni lecture directe", async () => {
    const droits = await q<{ f: string; anon: boolean; compte: boolean; traitement: boolean; definer: boolean; chemin: string }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement, p.prosecdef definer, coalesce(array_to_string(p.proconfig, ','), '') chemin
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('empreinte_metier_courriel','finaliser_courriel_metier','empreinte_avant_relances_d4','finaliser_avant_relances_d4',
                           'envoi_automatique_ouvert','lire_envois_automatiques','envois_automatiques_proposes','regler_envoi_automatique') order by 1`);
    expect(droits.map(({ f, anon, compte, traitement }) => ({ f, anon, compte, traitement }))).toEqual([
      { f: "empreinte_avant_relances_d4", anon: false, compte: false, traitement: false },
      { f: "empreinte_metier_courriel", anon: false, compte: false, traitement: true },
      { f: "envoi_automatique_ouvert", anon: false, compte: false, traitement: true },
      { f: "envois_automatiques_proposes", anon: false, compte: true, traitement: true },
      { f: "finaliser_avant_relances_d4", anon: false, compte: false, traitement: false },
      { f: "finaliser_courriel_metier", anon: false, compte: false, traitement: true },
      { f: "lire_envois_automatiques", anon: false, compte: true, traitement: false },
      { f: "regler_envoi_automatique", anon: false, compte: true, traitement: false },
    ]);
    for (const d of droits) {
      expect(d.definer, d.f).toBe(true);
      expect(d.chemin, d.f).toMatch(/search_path=(""|)$/);
    }
    expect(await maillonsEnAttente(db)).toEqual([]);
    const [table] = await q<{ rls: boolean; droits: string | null }>("select c.relrowsecurity rls, c.relacl::text droits from pg_class c where c.oid = 'public.envois_automatiques_reglage'::regclass");
    expect(table.rls).toBe(true);
    expect(table.droits ?? "").not.toMatch(/anon|authenticated|service_role/);
    expect(await q("select 1 from pg_policies where schemaname = 'public' and tablename = 'envois_automatiques_reglage'")).toHaveLength(0);
  });

  it("tout autre type suit la chaîne d'avant, à l'identique, que les interrupteurs soient ouverts ou fermés", async () => {
    const d = await decorLoyer();
    const autres = [{ type: "avis_echeance", id: d.appel, destinataire: h(LOCATAIRE) }, { type: "inconnu", id: d.appel }, { id: d.appel }, {}];
    const lire = async () => {
      await enService();
      const lus: unknown[] = [];
      for (const ctx of autres) {
        lus.push((await q("select public.empreinte_metier_courriel($1, $2::jsonb) nouvelle, public.empreinte_avant_relances_d4($1, $2::jsonb) ancienne", [d.org, JSON.stringify(ctx)]))[0]);
      }
      return lus as { nouvelle: string | null; ancienne: string | null }[];
    };
    for (const ouvert of [false, true]) {
      for (const flux of FLUX_ENVOIS_AUTOMATIQUES) await ouvrir(flux, ouvert);
      for (const l of await lire()) expect(l.nouvelle).toBe(l.ancienne);
    }
  });

  it("la migration se rejoue sans effet ; son retour rend l'état du 22/11, garde les quatre premiers interrupteurs, met de côté les e-mails en file ; reposée, elle livre le cinquième fermé", async () => {
    // Ce maillon est en tête : s'il ne l'est plus, le test de la migration plus récente prendra le relais.
    expect(maillonsPlusRecents(NOM)).toEqual([]);
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const NOMS = ["empreinte_metier_courriel", "finaliser_courriel_metier", "empreinte_avant_relances_d4", "finaliser_avant_relances_d4",
      "envoi_automatique_ouvert", "lire_envois_automatiques", "envois_automatiques_proposes", "regler_envoi_automatique"];
    const etat = async () => q<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname = any($1) order by 1`, [NOMS]);
    const corps = async (nom: string) => (await q<{ c: string }>("select md5(p.prosrc) c from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname=$1", [nom]))[0]?.c;
    const colonnes = async () => (await q<{ c: string }>("select column_name c from information_schema.columns where table_schema='public' and table_name='envois_automatiques_reglage' order by ordinal_position")).map((c) => c.c);

    const d = await decorReport();
    await ouvrir("avis_echeance"); await ouvrir("relance_report_rdv");
    const avec = await etat();
    expect(avec).toHaveLength(8);
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    expect(await maillonsEnAttente(db)).toEqual([]);
    // Rejouer ne referme pas ce que le superviseur a ouvert, et n'ouvre rien d'autre.
    await enService();
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(["avis_echeance", "relance_report_rdv"].includes(flux));

    // Une relance de report attend une reprise au moment du retour.
    const p = chargeReport(d);
    await conserverCourriel(service, p);
    expect(await preuve(d.org, ctxReport(d.demande))).toMatch(HEX64);
    const ancienneEmpreinte = await corps("empreinte_avant_relances_d4");
    const ancienneFinalisation = await corps("finaliser_avant_relances_d4");

    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations(version text primary key, name text)");
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261125110000','relance_report_rdv_et_relance_a_la_main') on conflict do nothing");
    await db.query(retour);
    const sans = await etat();
    expect(sans.map((f) => f.f)).toEqual(["empreinte_metier_courriel", "envoi_automatique_ouvert", "envois_automatiques_proposes", "finaliser_courriel_metier", "lire_envois_automatiques", "regler_envoi_automatique"]);
    expect(await corps("empreinte_metier_courriel")).toBe(ancienneEmpreinte);
    expect(await corps("finaliser_courriel_metier")).toBe(ancienneFinalisation);
    // Les droits de chaque fonction restante sont ceux d'avant le retour.
    expect(sans.map((f) => [f.f, f.d])).toEqual(avec.filter((f) => sans.some((s) => s.f === f.f)).map((f) => [f.f, f.d]));
    expect(await colonnes()).not.toContain("relance_report_rdv");
    expect((await q("select 1 from supabase_migrations.schema_migrations where version='20261125110000'")).length).toBe(0);
    // Les quatre fonctions du réglage ont retrouvé, mot pour mot, le texte que pose la migration du 22/11.
    const texte2211 = readFileSync("supabase/migrations/20261122200000_envois_automatiques_reglage.sql", "utf8");
    for (const f of ["envoi_automatique_ouvert", "lire_envois_automatiques", "envois_automatiques_proposes", "regler_envoi_automatique"]) {
      const [{ src }] = await q<{ src: string }>("select p.prosrc src from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname=$1", [f]);
      expect(texte2211, f).toContain(src);
      expect(src, f).not.toContain("relance_report_rdv");
    }
    // Les deux types ne sont plus prouvés ; l'e-mail en file est mis de côté, contenu effacé.
    expect(await preuve(d.org, ctxReport(d.demande))).toBeNull();
    expect(await ligne(p)).toMatchObject({ finalisation_etat: "a_verifier", reprise_autonome: false, charge_chiffree: null });
    // Les quatre premiers interrupteurs gardent leur état ; le cinquième se lit fermé (il n'existe plus).
    await enService();
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(flux === "avis_echeance");
    // Aucune trace métier effacée : la demande et sa réservation sont toujours là.
    expect(await q("select 1 from public.intervention_demandes_rdv where id = $1 and relance_reservee_le is not null", [d.demande])).toHaveLength(1);
    await db.query(retour);
    expect(await etat()).toEqual(sans);

    await db.query(migration);
    expect(await maillonsEnAttente(db)).toEqual([]);
    expect((await etat()).map((f) => [f.f, f.e, f.d])).toEqual(avec.map((f) => [f.f, f.e, f.d]));
    // Reposée, la migration livre le cinquième FERMÉ : l'ouverture d'avant le retour n'est pas rendue.
    await enService();
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(flux === "avis_echeance");
    expect(await preuve(d.org, ctxReport(d.demande))).toBeNull();
    await ouvrir("relance_report_rdv");
    expect(await preuve(d.org, ctxReport(d.demande))).toMatch(HEX64);
  });
});
