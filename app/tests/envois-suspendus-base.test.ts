/**
 * LES ENVOIS AUTOMATIQUES OUVERTS UN PAR UN PAR LE SUPERVISEUR (audit palier 1 du 22/11/2026, P1-08).
 *
 * Quatre envois étaient écrits et planifiés, mais suspendus par la liste fermée des e-mails : l'avis d'échéance du
 * loyer, la relance amiable d'un impayé, le rappel d'un rendez-vous d'intervention, la relance d'une invitation de
 * locataire. La migration 20261122200000 leur donne un interrupteur chacun, FERMÉ PAR DÉFAUT, et une preuve refaite
 * par la base juste avant chaque envoi.
 *
 * Ce que ces tests tiennent :
 *  1. tout est fermé à la livraison ; seul le superviseur permanent en double vérification ouvre ou ferme, et son
 *     geste est journalisé ; personne d'autre ne lit ni n'écrit le réglage ;
 *  2. interrupteur fermé : aucune preuve, donc aucun envoi — même si un contexte est joint ;
 *  3. interrupteur ouvert : la preuve n'existe que si la base redit elle-même que CET e-mail est dû à CETTE adresse
 *     (appel encore à envoyer, relance due à ce niveau et pour ces montants, rappel dû, relance d'invitation réservée
 *     aujourd'hui) ; un arrêt d'urgence la retire ; un fait périmé aussi ;
 *  4. un e-mail déjà en file ne repart pas si l'interrupteur a été refermé entre-temps ;
 *  5. les autres types d'e-mails suivent la chaîne d'avant, à l'identique ;
 *  6. la migration se rejoue sans effet (un interrupteur ouvert reste ouvert) ; son retour rend les têtes d'avant,
 *     met de côté les e-mails en file, et la repose referme tout.
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
import {
  defaireMaillonsPlusRecents, MAILLONS_CHAINE_COURRIELS, maillonsEnAttente, maillonsPlusRecents, REFUS_RETOUR_HORS_ORDRE,
  reposerMaillonsPlusRecents,
} from "./fixtures/chaine-courriels";

const partage = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => partage.service }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));

import { empreinteCourriel } from "../src/lib/courriels-durables";
import { envoyerEmail, envoyerEmailTransport } from "../src/lib/email";
import { envoiAutomatiqueOuvert, FLUX_ENVOIS_AUTOMATIQUES, montantDeContexte, type FluxEnvoiAutomatique } from "../src/lib/envois-suspendus";
import { circuitAdmisPilote } from "../src/lib/perimetre-pilote";
import { conserverCourriel, identiteCourriel, reprendreCourriels, type ChargeCourriel } from "../src/lib/reprise-courriels";

const NOM = "20261122200000_envois_automatiques_reglage";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const HEX64 = /^[0-9a-f]{64}$/;
const LOCATAIRE = "lea.locataire@example.invalid";
const GARANT = "gaston.garant@example.invalid";
const ARTISAN = "atelier.artisan@example.invalid";

describe("envois automatiques — manifeste, retour et liste fermée (sans base)", () => {
  it("la migration est au manifeste une seule fois, après les maillons qu'elle prolonge, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261014830000_relances_invitations_locataires.sql", "20261116201423_avis_essai_et_inactivite.sql", "20261122130000_lien_garant_admis.sql"]) {
      expect(manifeste.indexOf(avant), avant).toBeGreaterThan(-1);
      expect(manifeste.indexOf(`${NOM}.sql`), avant).toBeGreaterThan(manifeste.indexOf(avant));
    }
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // La preuve de la relance d'invitation cite la fonction du jour de Paris : son retour est dans l'ordre complet.
    expect(lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "").toMatch(/^`20261122200000` \(envois automatiques/m);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/envois-suspendus-base.test.ts"');
    expect(MAILLONS_CHAINE_COURRIELS).toContain(NOM);
  });

  it("tout est fermé à la livraison, rien n'est ouvert à un compte, et aucune garde n'est posée sur la table des autres", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(sql, flux).toContain(`${flux} boolean not null default false`);
    expect(sql).toContain("revoke all on public.envois_automatiques_reglage from public, anon, authenticated, service_role;");
    expect(sql).toContain("alter table public.envois_automatiques_reglage enable row level security;");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // Seules la lecture de la console et le geste du superviseur s'ouvrent aux comptes ; chacune se garde elle-même.
    expect([...sql.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to authenticated(?:, service_role)?;/g)].map((m) => m[1]).sort())
      .toEqual(["envois_automatiques_proposes", "lire_envois_automatiques", "regler_envoi_automatique"]);
    // La lecture ouverte aux comptes ne rend que quatre oui/non : elle ne cite ni la table ni une autre colonne.
    const proposes = /create or replace function public\.envois_automatiques_proposes\(\)[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";
    expect(proposes).not.toMatch(/envois_automatiques_reglage|modifie_|organizations/);
    expect(sql).toContain("if public.is_permanent_super_admin() is not true then");
    expect(sql).toContain("if public.is_super_admin() is not true then");
    expect(sql).not.toContain("poser_gardes_abonnement");
    expect(sql).not.toMatch(/create trigger/i);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it.each(MAILLONS_CHAINE_COURRIELS)("%s : le maillon ne recrée jamais la tête sur place, et son retour se refuse hors de l'ordre", (maillon) => {
    const sql = readFileSync(`supabase/migrations/${maillon}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    // Recréer la tête sur place écraserait, au rejeu, le maillon d'une migration plus récente.
    expect(sql).not.toMatch(/create (or replace )?function public\.(empreinte_metier_courriel|finaliser_courriel_metier)\(/);
    const suffixe = /rename to empreinte_avant_(\w+);/.exec(sql)?.[1];
    expect(suffixe).toBeTruthy();
    for (const [tete, signature, fonction] of [["empreinte_metier_courriel", "uuid,jsonb", "empreinte"], ["finaliser_courriel_metier", "text", "finaliser"]]) {
      expect(sql).toContain(`alter function public.${tete}(${signature}) rename to ${fonction}_avant_${suffixe};`);
      expect(sql).toContain(`alter function public.${fonction}_maillon_${suffixe}(${signature}) rename to ${tete};`);
      expect(sql).toContain(`drop function public.${fonction}_maillon_${suffixe}(${signature});`);
    }
    expect(sql).toContain(`return public.empreinte_avant_${suffixe}(p_org, p_contexte);`);
    expect(sql).toContain(`return public.finaliser_avant_${suffixe}(p_id);`);
    const retour = readFileSync(`supabase/retours-arriere/${maillon}.retour.sql`, "utf8");
    expect(retour).toMatch(REFUS_RETOUR_HORS_ORDRE);
    expect(retour).toContain(`position('public.empreinte_avant_${suffixe}(' in`);
    expect(retour).toContain(`position('public.finaliser_avant_${suffixe}(' in`);
  });

  it("la liste fermée admet les quatre envois par leur forme complète, et rien d'approchant", () => {
    const id = randomUUID(), org = randomUUID();
    const base = { to: LOCATAIRE, subject: "Objet", html: "<p>corps</p>", organisationId: org };
    const avis: ChargeCourriel = { ...base, contexteMetier: { type: "avis_echeance", id } };
    const relance: ChargeCourriel = { ...base, contexteMetier: { type: "relance_loyer", id, niveau: "relance_1", echeance: "2026-11-05", reste: "750", total: null, cible: "locataire" } };
    const rappel: ChargeCourriel = { ...base, contexteMetier: { type: "rappel_rendez_vous", id, echeance: "veille", role: "artisan" } };
    const invitation: ChargeCourriel = { to: LOCATAIRE, subject: "Objet", html: "<p>corps</p>", contexteMetier: { type: "relance_invitation", id, rang: "2" } };
    for (const p of [avis, relance, rappel, invitation]) expect(circuitAdmisPilote(p), p.contexteMetier!.type).toBe(true);
    expect(circuitAdmisPilote({ ...relance, contexteMetier: { ...relance.contexteMetier, total: "1500.5" } } as ChargeCourriel)).toBe(true);

    const avec = (p: ChargeCourriel, surcharge: Record<string, unknown>) => ({ ...p, contexteMetier: { ...p.contexteMetier, ...surcharge } }) as ChargeCourriel;
    for (const p of [avis, relance, rappel, invitation]) {
      expect(circuitAdmisPilote(avec(p, { id: "pas-un-identifiant" })), p.contexteMetier!.type).toBe(false);
      expect(circuitAdmisPilote({ ...p, piecesJointes: [{ nom: "piece.pdf", contenuBase64: "AA==" }] }), p.contexteMetier!.type).toBe(false);
      // Le même e-mail sans contexte reste suspendu : c'est ce que font les tâches, interrupteur fermé.
      expect(circuitAdmisPilote({ ...p, contexteMetier: undefined }), p.contexteMetier!.type).toBe(false);
    }
    for (const p of [avis, relance, rappel]) expect(circuitAdmisPilote({ ...p, organisationId: undefined }), p.contexteMetier!.type).toBe(false);
    for (const surcharge of [{ niveau: "mise_en_demeure" }, { cible: "proprietaire" }, { echeance: "05/11/2026" }, { reste: "750,00" }, { reste: "-1" }, { total: "beaucoup" }, { reste: undefined }]) {
      expect(circuitAdmisPilote(avec(relance, surcharge)), JSON.stringify(surcharge)).toBe(false);
    }
    for (const surcharge of [{ echeance: "j3" }, { role: "proprietaire" }]) expect(circuitAdmisPilote(avec(rappel, surcharge)), JSON.stringify(surcharge)).toBe(false);
    for (const rang of ["0", "3", 1, undefined]) expect(circuitAdmisPilote(avec(invitation, { rang })), String(rang)).toBe(false);
  });

  it("l'interrupteur ne vaut « ouvert » que si la base répond vrai ; un montant ne s'écrit que s'il est exact au centime", async () => {
    const reponse = (r: unknown) => ({ rpc: async () => r }) as unknown as Pick<SupabaseClient, "rpc">;
    expect(await envoiAutomatiqueOuvert(reponse({ data: true, error: null }), "avis_echeance")).toBe(true);
    for (const r of [{ data: false, error: null }, { data: null, error: null }, { data: "true", error: null }, { data: 1, error: null }, { data: true, error: { message: "refus" } }, {}]) {
      expect(await envoiAutomatiqueOuvert(reponse(r), "avis_echeance"), JSON.stringify(r)).toBe(false);
    }
    expect(await envoiAutomatiqueOuvert({ rpc: async () => { throw new Error("réseau"); } } as unknown as Pick<SupabaseClient, "rpc">, "relance_loyer")).toBe(false);
    expect([750, "750.00", "750.5", 0, "1234.56"].map(montantDeContexte)).toEqual(["750", "750", "750.5", "0", "1234.56"]);
    expect([null, undefined, "", "abc", -1, 1e9, "12.345", Number.NaN].map(montantDeContexte)).toEqual(Array(8).fill(null));
  });
});

describe.skipIf(!url)("envois automatiques (avec base)", () => {
  const db = new Client({ connectionString: url });
  const service = clientSurPg(db, { transactionnel: true }) as unknown as SupabaseClient;
  const transport = vi.fn();

  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as T[];
  const id = async (sql: string, p: unknown[] = []) => String((await q<{ id: string }>(sql, p))[0].id);
  /** Le traitement du serveur : superutilisateur du banc, jeton de service. */
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
        'test-envois-'||gen_random_uuid()||'@example.invalid', 'x', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    if (superviseur) await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [c]);
    return c;
  }
  const ouvrir = async (flux: FluxEnvoiAutomatique, ouvert = true) => { await enService(); await db.query(`update public.envois_automatiques_reglage set ${flux} = $1`, [ouvert]); };
  const arreter = async (cle: string, arrete = true) => {
    await enService();
    const auteur = await compte();
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, $2, 'Essai de contrôle', $3) on conflict (cle) do update set arrete = excluded.arrete", [cle, arrete, auteur]);
  };
  const preuve = async (org: string | null, ctx: Record<string, unknown>) => {
    await enService();
    return (await q<{ e: string | null }>("select public.empreinte_metier_courriel($1, $2::jsonb) e", [org, JSON.stringify(ctx)]))[0].e;
  };
  const h = (adresse: string) => empreinteCourriel(adresse);
  const ligne = async (p: ChargeCourriel) => (await q<Record<string, unknown>>("select * from public.courriels_durables where id = $1", [identiteCourriel(p).id]))[0];
  const reprendre = () => reprendreCourriels(service,
    (p, ref) => envoyerEmailTransport({ ...p, referenceInterne: ref, cleIdempotence: p.cleIdempotence, ...(p.organisationId ? { organisation: { db: service, id: p.organisationId } } : {}) }),
    async () => {});

  // ── Les décors : un fait réellement dû, comme les tâches le lisent ─────────────────────────────────────────────
  /**
   * Un bail actif, son terme du mois appelé et impayé, l'accord d'envoi automatique donné. Par défaut chez un
   * propriétaire bailleur ; `agence` pour les relances — chez un propriétaire, une relance n'est due qu'après qu'il a
   * lui-même signalé le loyer non reçu (règle existante, tenue par ses propres tests), ce qui n'est pas le sujet ici.
   */
  async function decorLoyer(agence = false) {
    await enService();
    const org = await id("insert into public.organizations(name,type,status,relances_envoi_auto) values('TEST envois automatiques',$1,'active',true) returning id", [agence ? "agence" : "proprietaire_direct"]);
    const owner = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,$3)", [owner, org, agence ? "admin_agence" : "proprietaire_direct"]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','appartement','1 rue Essai','75001','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Essai','Léa',$2) returning id", [org, LOCATAIRE]);
    const bail = await id(`insert into public.baux(organization_id,lot_id,locataire_principal,loyer_hc,charges,etat,date_debut,jour_echeance)
      values($1,$2,$3,700,50,'actif',date_trunc('month', public.aujourdhui_paris())::date,1) returning id`, [org, lot, locataire]);
    if (agence) await couvrirParMandat(db, bail);
    await en(owner);
    await db.query("select public.generer_appels_loyer($1)", [bail]);
    await enService();
    await db.query("update public.organizations set appels_envoi_auto = true where id = $1", [org]);
    const appel = await id("select id from public.appels_loyer where bail_id = $1 order by periode desc limit 1", [bail]);
    return { org, owner, bail, appel };
  }
  const ctxAvis = (appel: string, adresse = LOCATAIRE, surcharge: Record<string, unknown> = {}) =>
    ({ type: "avis_echeance", id: appel, destinataire: h(adresse), ...surcharge });

  type Due = { niveau: string; echeance: string; reste: string; total: string | null; garants: string[] };
  /** La relance que la base dit due aujourd'hui pour ce bail, telle que la tâche la lit. */
  async function relanceDue(bail: string): Promise<Due> {
    await enService();
    const [d] = await q<Due>("select niveau, date_echeance::text echeance, reste::text reste, total_du::text total, garants from public.relances_loyer_dues(500) where bail_id = $1", [bail]);
    return d;
  }
  async function decorRelance(joursDeRetard = 10) {
    const d = await decorLoyer(true);
    await db.query("update public.appels_loyer set date_echeance = public.aujourdhui_paris() - $1::int where bail_id = $2", [joursDeRetard, d.bail]);
    return d;
  }
  const ctxRelance = (bail: string, due: Due, cible: "locataire" | "caution" = "locataire", adresse = LOCATAIRE, surcharge: Record<string, unknown> = {}) => ({
    type: "relance_loyer", id: bail, niveau: due.niveau, echeance: due.echeance, reste: montantDeContexte(due.reste), total: montantDeContexte(due.total),
    cible, destinataire: h(adresse), ...surcharge,
  });

  /** Un rendez-vous d'intervention planifié pour demain : le rappel « la veille » est dû au locataire et à l'artisan. */
  async function decorRendezVous() {
    await enService();
    const org = await id("insert into public.organizations(name,status,type) values('TEST rappels automatiques','active','agence') returning id");
    const gerant = await compte(), compteLocataire = await compte(), compteArtisan = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values ($1,$2,'admin_agence'),($3,$2,'locataire'),($4,$2,'artisan')", [gerant, org, compteLocataire, compteArtisan]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email,account_id) values($1,'Essai','Marc',$2,$3) returning id", [org, LOCATAIRE, compteLocataire]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Immeuble fictif','appartement','9 rue Essai','75004','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50) returning id", [org, lot, locataire]);
    const incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,'INC-ENVOIS-001',$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite fictive','qualifie','proprietaire','Joint usé') returning id`, [org, lot, bail, locataire]);
    const artisan = await id(`insert into public.artisans(raison_sociale,siret,telephone,email,statut_plateforme,siret_etat,visibilite,account_id)
      values('Atelier fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000',$1,'valide','verifie','publique',$2) returning id`, [ARTISAN, compteArtisan]);
    const intervention = await id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','planifiee') returning id", [org, incident, artisan]);
    await db.query(`update public.incident_interventions
        set debut_prevu = (public.aujourdhui_paris() + 1 + time '09:00') at time zone 'Europe/Paris',
            fin_prevue  = (public.aujourdhui_paris() + 1 + time '11:00') at time zone 'Europe/Paris' where id = $1`, [intervention]);
    return { org, intervention };
  }
  const ctxRappel = (intervention: string, role: "locataire" | "artisan" = "locataire", adresse = LOCATAIRE, surcharge: Record<string, unknown> = {}) =>
    ({ type: "rappel_rendez_vous", id: intervention, echeance: "veille", role, destinataire: h(adresse), ...surcharge });

  /** Une invitation de locataire envoyée il y a trois jours : la relance de rang 1 est due aujourd'hui. */
  async function decorInvitation(reserver = true) {
    await enService();
    const owner = await compte();
    const org = await id("insert into public.organizations(name,type,status) values('TEST relances automatiques','proprietaire_direct','active') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [owner, org]);
    const person = await id("insert into public.persons(organization_id,nom,email) values($1,'TEST invité',$2) returning id", [org, LOCATAIRE]);
    await en(owner);
    const [{ r }] = await q<{ r: { id: string } }>("select public.preparer_invitation_locataire($1,$2) r", [org, person]);
    await enService();
    await db.query("update public.invitations_locataires set envoye_le = (public.aujourdhui_paris() - 3 + time '10:00') at time zone 'Europe/Paris' where id = $1", [r.id]);
    expect((await q<{ rang: number | null }>("select public.relance_invitation_locataire_due($1) rang", [r.id]))[0].rang).toBe(1);
    if (reserver) expect((await q<{ ok: boolean }>("select public.reserver_relance_invitation_locataire($1, 1::smallint) ok", [r.id]))[0].ok).toBe(true);
    return { org, invitation: r.id };
  }
  const ctxInvitation = (invitation: string, adresse = LOCATAIRE, surcharge: Record<string, unknown> = {}) =>
    ({ type: "relance_invitation", id: invitation, rang: "1", destinataire: h(adresse), ...surcharge });

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
    await db.query("update public.envois_automatiques_reglage set avis_echeance = false, relance_loyer = false, rappel_rendez_vous = false, relance_invitation = false");
  });
  afterEach(async () => { await db.query("rollback"); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  // ── 1. Le réglage ──────────────────────────────────────────────────────────────────────────────────────────────
  it("à la livraison tout est fermé : valeurs par défaut de la table, lecture du traitement, flux inconnu", async () => {
    const defauts = await q<{ c: string; d: string }>(`select column_name c, column_default d from information_schema.columns
      where table_schema='public' and table_name='envois_automatiques_reglage' and column_name = any($1) order by 1`, [[...FLUX_ENVOIS_AUTOMATIQUES]]);
    expect(defauts.map((d) => d.d)).toEqual(["false", "false", "false", "false"]);
    expect(await q("select singleton from public.envois_automatiques_reglage")).toHaveLength(1);
    for (const flux of [...FLUX_ENVOIS_AUTOMATIQUES, "autre", ""]) {
      expect((await q<{ o: boolean }>("select public.envoi_automatique_ouvert($1) o", [flux]))[0].o, flux).toBe(false);
    }
    expect((await q<{ o: boolean | null }>("select public.envoi_automatique_ouvert(null) o"))[0].o).toBe(false);
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(false);
    // Sans ligne de réglage : fermé aussi.
    await db.query("delete from public.envois_automatiques_reglage");
    expect((await q<{ o: boolean }>("select public.envoi_automatique_ouvert('avis_echeance') o"))[0].o).toBe(false);
  });

  it("personne ne lit ni n'écrit le réglage directement ; la lecture du traitement est fermée aux comptes", async () => {
    const ordinaire = await compte(), superviseur = await compte(true);
    for (const [libelle, entrer] of [["compte", () => en(ordinaire)], ["superviseur", () => en(superviseur)], ["visiteur", () => enRole("anon")], ["traitement", () => enRole("service_role")]] as const) {
      await entrer();
      expect(await refus("select * from public.envois_automatiques_reglage"), libelle).toMatch(/permission denied/);
      expect(await refus("update public.envois_automatiques_reglage set avis_echeance = true"), libelle).toMatch(/permission denied/);
    }
    await en(ordinaire);
    expect(await refus("select public.envoi_automatique_ouvert('avis_echeance')")).toMatch(/permission denied/);
    await enRole("anon");
    expect(await refus("select public.envoi_automatique_ouvert('avis_echeance')")).toMatch(/permission denied/);
    expect(await refus("select public.lire_envois_automatiques()")).toMatch(/permission denied/);
    expect(await refus("select public.regler_envoi_automatique('avis_echeance', true)")).toMatch(/permission denied/);
    await enRole("service_role");
    expect((await q<{ o: boolean }>("select public.envoi_automatique_ouvert('avis_echeance') o"))[0].o).toBe(false);
    expect(await refus("select public.regler_envoi_automatique('avis_echeance', true)")).toMatch(/permission denied/);
    expect(await refus("select public.lire_envois_automatiques()")).toMatch(/permission denied/);
    await enService();
    expect((await q<{ n: number }>("select count(*)::int n from public.envois_automatiques_reglage where avis_echeance or relance_loyer or rappel_rendez_vous or relance_invitation"))[0].n).toBe(0);
  });

  it("seul le superviseur permanent en double vérification ouvre ou ferme un envoi ; le geste est journalisé", async () => {
    const ordinaire = await compte(), superviseur = await compte(true);
    await en(ordinaire);
    expect(await refus("select public.regler_envoi_automatique('relance_loyer', true)")).toMatch(/Supervision permanente/);
    expect(await refus("select public.lire_envois_automatiques()")).toMatch(/Accès réservé à la supervision/);
    await en(superviseur, "aal1");
    expect(await refus("select public.regler_envoi_automatique('relance_loyer', true)")).toMatch(/Supervision permanente/);
    await en(superviseur);
    expect(await refus("select public.regler_envoi_automatique('mise_en_demeure', true)")).toMatch(/Envoi automatique inconnu/);
    expect(await refus("select public.regler_envoi_automatique(null, true)")).toMatch(/Envoi automatique inconnu/);
    expect(await refus("select public.regler_envoi_automatique('relance_loyer', null)")).toMatch(/ouvert ou fermé/);
    expect((await q<{ e: Record<string, unknown> }>("select public.lire_envois_automatiques() e"))[0].e)
      .toMatchObject({ avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false, modifie_le: null });
    // Avant d'ouvrir, le superviseur lit combien d'espaces ont déjà donné leur accord permanent.
    const avant = (await q<{ e: { espaces_avis_echeance: number; espaces_relance_loyer: number } }>("select public.lire_envois_automatiques() e"))[0].e;
    await enService();
    await db.query("insert into public.organizations(name,type,status,appels_envoi_auto,relances_envoi_auto) values ('TEST accord A','proprietaire_direct','active',true,false), ('TEST accord B','proprietaire_direct','active',true,true)");
    await en(superviseur);
    const apres = (await q<{ e: { espaces_avis_echeance: number; espaces_relance_loyer: number } }>("select public.lire_envois_automatiques() e"))[0].e;
    expect(apres.espaces_avis_echeance - avant.espaces_avis_echeance).toBe(2);
    expect(apres.espaces_relance_loyer - avant.espaces_relance_loyer).toBe(1);

    await db.query("select public.regler_envoi_automatique('relance_loyer', true)");
    const etat = (await q<{ e: Record<string, unknown> }>("select public.lire_envois_automatiques() e"))[0].e;
    expect(etat).toMatchObject({ avis_echeance: false, relance_loyer: true, rappel_rendez_vous: false, relance_invitation: false });
    expect(etat.modifie_le).toBeTruthy();
    await enService();
    // Un seul envoi ouvert : les trois autres restent fermés.
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(flux === "relance_loyer");
    expect((await q<{ p: string }>("select modifie_par p from public.envois_automatiques_reglage"))[0].p).toBe(superviseur);

    await en(superviseur);
    await db.query("select public.regler_envoi_automatique('relance_loyer', false)");
    await enService();
    expect(await envoiAutomatiqueOuvert(service, "relance_loyer")).toBe(false);
    const journal = await q<{ auteur: string; details: Record<string, unknown> }>("select auteur, details from public.supervision_operations where action = 'envoi_automatique' and auteur = $1 order by details->>'ouvert' desc", [superviseur]);
    expect(journal).toEqual([
      { auteur: superviseur, details: { flux: "relance_loyer", ouvert: true, precedent: false } },
      { auteur: superviseur, details: { flux: "relance_loyer", ouvert: false, precedent: true } },
    ]);
  });

  it("les écrans des espaces lisent quels envois sont ouverts — quatre oui/non, pour tout compte connecté, jamais pour un visiteur", async () => {
    const ordinaire = await compte(), superviseur = await compte(true);
    const TOUT_FERME = { avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false };
    await en(ordinaire);
    expect((await q<{ e: unknown }>("select public.envois_automatiques_proposes() e"))[0].e).toEqual(TOUT_FERME);
    await en(superviseur);
    await db.query("select public.regler_envoi_automatique('avis_echeance', true)");
    await db.query("select public.regler_envoi_automatique('relance_invitation', true)");
    await en(ordinaire);
    expect((await q<{ e: unknown }>("select public.envois_automatiques_proposes() e"))[0].e).toEqual({ ...TOUT_FERME, avis_echeance: true, relance_invitation: true });
    // Lire n'ouvre aucun autre droit : ni le réglage, ni le geste.
    expect(await refus("select * from public.envois_automatiques_reglage")).toMatch(/permission denied/);
    expect(await refus("select public.regler_envoi_automatique('relance_loyer', true)")).toMatch(/Supervision permanente/);
    await enRole("service_role");
    expect((await q<{ e: unknown }>("select public.envois_automatiques_proposes() e"))[0].e).toEqual({ ...TOUT_FERME, avis_echeance: true, relance_invitation: true });
    await enRole("anon");
    expect(await refus("select public.envois_automatiques_proposes()")).toMatch(/permission denied/);
    // Sans ligne de réglage : tout fermé.
    await enService();
    await db.query("delete from public.envois_automatiques_reglage");
    await en(ordinaire);
    expect((await q<{ e: unknown }>("select public.envois_automatiques_proposes() e"))[0].e).toEqual(TOUT_FERME);
  });

  // ── 2. L'avis d'échéance ──────────────────────────────────────────────────────────────────────────────────────
  it("avis d'échéance : fermé, aucune preuve même si l'avis est dû ; ouvert, une preuve stable pour le locataire", async () => {
    const d = await decorLoyer();
    expect((await q("select 1 from public.appels_a_envoyer(500) where appel_id = $1", [d.appel]))).toHaveLength(1);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
    // Les autres interrupteurs n'ouvrent pas celui-ci.
    for (const flux of ["relance_loyer", "rappel_rendez_vous", "relance_invitation"] as const) await ouvrir(flux);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
    await ouvrir("avis_echeance");
    const e = await preuve(d.org, ctxAvis(d.appel));
    expect(e).toMatch(HEX64);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBe(e);
    // L'adresse entre dans la preuve : une autre adresse n'a pas la même, et ici elle n'en a aucune.
    expect(e).not.toBe(h(LOCATAIRE));
    await ouvrir("avis_echeance", false);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
  });

  it.each([
    ["une autre adresse", (a: string) => ctxAvis(a, "intrus@example.invalid")],
    ["aucune adresse", (a: string) => ctxAvis(a, LOCATAIRE, { destinataire: undefined })],
    ["une adresse mal formée", (a: string) => ctxAvis(a, LOCATAIRE, { destinataire: "abc" })],
    ["un autre appel", () => ctxAvis(randomUUID())],
    ["un identifiant mal formé", () => ctxAvis("pas-un-identifiant")],
  ])("avis d'échéance ouvert : pas de preuve avec %s, et aucune erreur", async (_libelle, contexte) => {
    const d = await decorLoyer();
    await ouvrir("avis_echeance");
    expect(await preuve(d.org, contexte(d.appel))).toBeNull();
  });

  it("avis d'échéance ouvert : pas de preuve depuis un autre espace, sans espace, ni pour un terme réglé, envoyé ou dont l'accord est retiré", async () => {
    const d = await decorLoyer();
    await ouvrir("avis_echeance");
    const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    expect(await preuve(ailleurs, ctxAvis(d.appel))).toBeNull();
    expect(await preuve(null, ctxAvis(d.appel))).toBeNull();
    expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);

    // L'espace retire son accord : plus rien ne part en son nom.
    await db.query("savepoint accord");
    await db.query("update public.organizations set appels_envoi_auto = false where id = $1", [d.org]);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
    await db.query("rollback to savepoint accord");

    // Le terme est réglé entre-temps : on ne réclame jamais un loyer payé.
    await db.query("savepoint regle");
    await db.query("insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,750, public.aujourdhui_paris())", [d.org, d.bail]);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
    await db.query("rollback to savepoint regle");

    // L'avis est déjà marqué envoyé : il ne repart pas.
    expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);
    await db.query("select public.marquer_appel_envoye($1)", [d.appel]);
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
  });

  it.each([["appels", true], ["global", true], ["relances", false], ["rappels", false]] as const)(
    "avis d'échéance ouvert : l'arrêt d'urgence « %s » retire la preuve ? %s", async (cle, bloque) => {
      const d = await decorLoyer();
      await ouvrir("avis_echeance");
      await arreter(cle);
      if (bloque) expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
      else expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);
      await arreter(cle, false);
      expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);
    });

  // ── 3. La relance amiable ─────────────────────────────────────────────────────────────────────────────────────
  it("relance amiable : fermée, aucune preuve ; ouverte, une preuve pour ce niveau, ce terme et ces montants", async () => {
    const d = await decorRelance();
    const due = await relanceDue(d.bail);
    expect(due).toMatchObject({ niveau: "relance_1", garants: [] });
    expect(Number(due.reste)).toBe(750);
    expect(await preuve(d.org, ctxRelance(d.bail, due))).toBeNull();
    await ouvrir("avis_echeance");
    expect(await preuve(d.org, ctxRelance(d.bail, due))).toBeNull();
    await ouvrir("relance_loyer");
    const e = await preuve(d.org, ctxRelance(d.bail, due));
    expect(e).toMatch(HEX64);
    expect(await preuve(d.org, ctxRelance(d.bail, due))).toBe(e);
  });

  it.each([
    ["un autre montant restant", { reste: "749.99" }],
    ["un autre total dû", { total: "9999" }],
    ["l'autre niveau", { niveau: "relance_2" }],
    ["un niveau inconnu", { niveau: "mise_en_demeure" }],
    ["un autre terme", { echeance: "2020-01-01" }],
    ["une date mal formée", { echeance: "01/11/2026" }],
    ["un montant mal formé", { reste: "750,00" }],
    ["aucun montant", { reste: null }],
    ["une cible inconnue", { cible: "proprietaire" }],
    ["la cible « caution » sans caution au bail", { cible: "caution" }],
    ["une autre adresse", { destinataire: empreinteCourriel("intrus@example.invalid") }],
    ["un autre bail", { id: randomUUID() }],
  ])("relance amiable ouverte : pas de preuve avec %s, et aucune erreur", async (_libelle, surcharge) => {
    const d = await decorRelance();
    const due = await relanceDue(d.bail);
    await ouvrir("relance_loyer");
    expect(await preuve(d.org, ctxRelance(d.bail, due))).toMatch(HEX64);
    expect(await preuve(d.org, ctxRelance(d.bail, due, "locataire", LOCATAIRE, surcharge))).toBeNull();
  });

  it("relance amiable ouverte : pas de preuve pour un terme réglé, une relance déjà consignée, un accord retiré, un autre espace, ou sous arrêt", async () => {
    const d = await decorRelance();
    const due = await relanceDue(d.bail);
    await ouvrir("relance_loyer");
    const ctx = ctxRelance(d.bail, due);
    expect(await preuve(d.org, ctx)).toMatch(HEX64);
    expect(await preuve(null, ctx)).toBeNull();
    const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    expect(await preuve(ailleurs, ctx)).toBeNull();

    for (const cle of ["relances", "global"]) {
      await arreter(cle);
      expect(await preuve(d.org, ctx), cle).toBeNull();
      await arreter(cle, false);
    }
    await arreter("appels");
    expect(await preuve(d.org, ctx)).toMatch(HEX64);
    await arreter("appels", false);

    await db.query("savepoint accord");
    await db.query("update public.organizations set relances_envoi_auto = false where id = $1", [d.org]);
    expect(await preuve(d.org, ctx)).toBeNull();
    await db.query("rollback to savepoint accord");

    // Un paiement partiel change le reste dû : l'e-mail préparé annonce un montant faux, il ne part pas.
    await db.query("savepoint partiel");
    await db.query("insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,200, public.aujourdhui_paris())", [d.org, d.bail]);
    expect(await preuve(d.org, ctx)).toBeNull();
    await db.query("rollback to savepoint partiel");

    await db.query("savepoint regle");
    await db.query("insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,750, public.aujourdhui_paris())", [d.org, d.bail]);
    expect(await preuve(d.org, ctx)).toBeNull();
    await db.query("rollback to savepoint regle");

    // La relance est consignée (envoyée) : la même ne repart pas.
    expect(await preuve(d.org, ctx)).toMatch(HEX64);
    await db.query("select public.relance_loyer_consigner($1, $2, 'essai')", [d.bail, due.niveau]);
    expect(await preuve(d.org, ctx)).toBeNull();
  });

  it("relance amiable ouverte : la caution n'est informée qu'à la seconde relance, à sa propre adresse", async () => {
    const d = await decorRelance(16);
    const garant = await id("insert into public.persons (organization_id, nom, prenom, email) values ($1,'Garant','Gaston',$2) returning id", [d.org, GARANT]);
    await db.query("insert into public.bail_personnes (organization_id, bail_id, person_id, role) values ($1,$2,$3,'garant')", [d.org, d.bail, garant]);
    await ouvrir("relance_loyer");
    const premiere = await relanceDue(d.bail);
    expect(premiere).toMatchObject({ niveau: "relance_1", garants: [] });
    // À la première relance, la caution n'est pas destinataire.
    expect(await preuve(d.org, ctxRelance(d.bail, premiere, "caution", GARANT))).toBeNull();
    expect(await preuve(d.org, ctxRelance(d.bail, premiere, "locataire", GARANT))).toBeNull();

    await db.query("insert into public.relances (organization_id, bail_id, niveau, date_envoi) values ($1,$2,'relance_1', public.aujourdhui_paris() - 10)", [d.org, d.bail]);
    const seconde = await relanceDue(d.bail);
    expect(seconde).toMatchObject({ niveau: "relance_2", garants: [GARANT] });
    expect(await preuve(d.org, ctxRelance(d.bail, seconde, "caution", GARANT))).toMatch(HEX64);
    expect(await preuve(d.org, ctxRelance(d.bail, seconde, "locataire", LOCATAIRE))).toMatch(HEX64);
    // Chacun à sa place : la caution n'est pas « locataire », le locataire n'est pas « caution ».
    expect(await preuve(d.org, ctxRelance(d.bail, seconde, "locataire", GARANT))).toBeNull();
    expect(await preuve(d.org, ctxRelance(d.bail, seconde, "caution", LOCATAIRE))).toBeNull();
  });

  // ── 4. Le rappel de rendez-vous ───────────────────────────────────────────────────────────────────────────────
  it("rappel de rendez-vous : fermé, aucune preuve ; ouvert, une preuve pour chacun à son adresse, pour l'échéance due", async () => {
    const d = await decorRendezVous();
    expect((await q<{ destinataire: string }>("select destinataire from public.rendez_vous_a_rappeler(500) where intervention_id = $1 order by 1", [d.intervention])).map((l) => l.destinataire))
      .toEqual(["artisan", "locataire"]);
    expect(await preuve(d.org, ctxRappel(d.intervention))).toBeNull();
    await ouvrir("rappel_rendez_vous");
    expect(await preuve(d.org, ctxRappel(d.intervention, "locataire", LOCATAIRE))).toMatch(HEX64);
    expect(await preuve(d.org, ctxRappel(d.intervention, "artisan", ARTISAN))).toMatch(HEX64);
    // Chacun à son adresse, pour l'échéance réellement due (demain = « la veille », pas « sept jours avant »).
    expect(await preuve(d.org, ctxRappel(d.intervention, "artisan", LOCATAIRE))).toBeNull();
    expect(await preuve(d.org, ctxRappel(d.intervention, "locataire", ARTISAN))).toBeNull();
    expect(await preuve(d.org, ctxRappel(d.intervention, "locataire", LOCATAIRE, { echeance: "j7" }))).toBeNull();
    expect(await preuve(d.org, ctxRappel(d.intervention, "locataire", LOCATAIRE, { echeance: "j3" }))).toBeNull();
    expect(await preuve(d.org, ctxRappel(d.intervention, "locataire", LOCATAIRE, { role: "proprietaire" }))).toBeNull();
    expect(await preuve(d.org, ctxRappel(randomUUID()))).toBeNull();
    expect(await preuve(null, ctxRappel(d.intervention))).toBeNull();
    const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    expect(await preuve(ailleurs, ctxRappel(d.intervention))).toBeNull();
  });

  it("rappel de rendez-vous ouvert : pas de preuve sous arrêt, pour un rendez-vous déplacé, ni pour un rappel déjà marqué", async () => {
    const d = await decorRendezVous();
    await ouvrir("rappel_rendez_vous");
    for (const cle of ["rappels", "global"]) {
      await arreter(cle);
      expect(await preuve(d.org, ctxRappel(d.intervention)), cle).toBeNull();
      await arreter(cle, false);
    }
    expect(await preuve(d.org, ctxRappel(d.intervention))).toMatch(HEX64);

    // Le rendez-vous est déplacé à dans trois jours : le rappel « la veille » n'est plus dû aujourd'hui.
    await db.query("savepoint deplace");
    await db.query(`update public.incident_interventions
        set debut_prevu = (public.aujourdhui_paris() + 3 + time '09:00') at time zone 'Europe/Paris',
            fin_prevue  = (public.aujourdhui_paris() + 3 + time '11:00') at time zone 'Europe/Paris' where id = $1`, [d.intervention]);
    expect(await preuve(d.org, ctxRappel(d.intervention))).toBeNull();
    await db.query("rollback to savepoint deplace");

    // Le rappel du locataire est marqué envoyé : il ne repart pas ; celui de l'artisan reste dû.
    await db.query("select public.marquer_rappel_envoye($1, 'veille', 'locataire', $2)", [d.intervention, LOCATAIRE]);
    expect(await preuve(d.org, ctxRappel(d.intervention))).toBeNull();
    expect(await preuve(d.org, ctxRappel(d.intervention, "artisan", ARTISAN))).toMatch(HEX64);
  });

  // ── 5. La relance d'invitation ────────────────────────────────────────────────────────────────────────────────
  it("relance d'invitation : fermée, aucune preuve ; ouverte, une preuve seulement pour la relance réservée aujourd'hui", async () => {
    const sansReservation = await decorInvitation(false);
    await ouvrir("relance_invitation");
    expect(await preuve(sansReservation.org, ctxInvitation(sansReservation.invitation))).toBeNull();
    await db.query("select public.reserver_relance_invitation_locataire($1, 1::smallint)", [sansReservation.invitation]);
    await ouvrir("relance_invitation", false);
    expect(await preuve(sansReservation.org, ctxInvitation(sansReservation.invitation))).toBeNull();
    await ouvrir("relance_invitation");
    const e = await preuve(sansReservation.org, ctxInvitation(sansReservation.invitation));
    expect(e).toMatch(HEX64);
    // Cet envoi-ci n'est pas toujours rattaché à un espace : la preuve vaut aussi sans espace, jamais pour un autre.
    expect(await preuve(null, ctxInvitation(sansReservation.invitation))).toMatch(HEX64);
    const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    expect(await preuve(ailleurs, ctxInvitation(sansReservation.invitation))).toBeNull();
  });

  it("relance d'invitation ouverte : pas de preuve pour un autre rang, une autre adresse, une réservation d'hier, une relance notée, une invitation échue, ou sous arrêt", async () => {
    const d = await decorInvitation();
    await ouvrir("relance_invitation");
    const ctx = ctxInvitation(d.invitation);
    expect(await preuve(d.org, ctx)).toMatch(HEX64);
    for (const surcharge of [{ rang: "2" }, { rang: "3" }, { rang: undefined }, { destinataire: h("intrus@example.invalid") }, { id: randomUUID() }, { id: "pas-un-identifiant" }]) {
      expect(await preuve(d.org, ctxInvitation(d.invitation, LOCATAIRE, surcharge)), JSON.stringify(surcharge)).toBeNull();
    }
    for (const cle of ["rappels", "global"]) {
      await arreter(cle);
      expect(await preuve(d.org, ctx), cle).toBeNull();
      await arreter(cle, false);
    }
    await db.query("savepoint hier");
    await db.query("update public.relances_invitations_locataires set jour = public.aujourdhui_paris() - 1 where invitation_id = $1", [d.invitation]);
    expect(await preuve(d.org, ctx)).toBeNull();
    await db.query("rollback to savepoint hier");

    await db.query("savepoint echue");
    await db.query("update public.invitations_locataires set expire_le = now() - interval '1 minute' where id = $1", [d.invitation]);
    expect(await preuve(d.org, ctx)).toBeNull();
    await db.query("rollback to savepoint echue");

    // La relance a son sort (envoyée) : la même ne repart pas.
    expect(await preuve(d.org, ctx)).toMatch(HEX64);
    await db.query("select public.noter_relance_invitation_locataire($1, 1::smallint, 'envoyee')", [d.invitation]);
    expect(await preuve(d.org, ctx)).toBeNull();
  });

  // ── 6. Les autres types, et la vraie chaîne d'envoi ───────────────────────────────────────────────────────────
  it("tout autre type suit la chaîne d'avant, à l'identique, que les interrupteurs soient ouverts ou fermés", async () => {
    const d = await decorLoyer();
    const autres = [
      { type: "confirmation_mobile_garant", id: randomUUID(), garant: "garant", jeton_empreinte: "a".repeat(64), acteur: randomUUID(), destinataire: h(GARANT) },
      { type: "quittance", id: randomUUID(), automatique: true, destinataire: h(LOCATAIRE) },
      { type: "notification", evenement: "rendez_vous_fixe", id: randomUUID(), destinataire: h(LOCATAIRE) },
      { type: "inconnu", id: randomUUID() }, { id: randomUUID() }, {},
    ];
    for (const ouvert of [false, true]) {
      for (const flux of FLUX_ENVOIS_AUTOMATIQUES) await ouvrir(flux, ouvert);
      for (const ctx of autres) {
        const [r] = await q<{ meme: boolean }>(
          "select public.empreinte_metier_courriel($1,$2::jsonb) is not distinct from public.empreinte_avant_envois_automatiques($1,$2::jsonb) as meme", [d.org, JSON.stringify(ctx)]);
        expect(r.meme, JSON.stringify(ctx)).toBe(true);
      }
    }
  });

  const chargeAvis = (d: { org: string; appel: string }, to = LOCATAIRE): ChargeCourriel => ({
    to, subject: "Avis d’échéance fictif", html: "<p>Avis fictif</p>", cleIdempotence: `essai-avis-${d.appel}-${to}`, organisationId: d.org,
    contexteMetier: { type: "avis_echeance", id: d.appel },
  });
  const envoyer = (p: ChargeCourriel) => envoyerEmail({ ...p, circuit: "lib/missions-planifiees/appels", ...(p.organisationId ? { organisation: { db: service, id: p.organisationId } } : {}) });

  it("interrupteur fermé : avec ou sans contexte, l'e-mail ne part pas", async () => {
    const d = await decorLoyer();
    // Ce que font les tâches, interrupteur fermé : aucun contexte, l'envoi reste suspendu comme avant.
    const sans = await envoyer({ ...chargeAvis(d), contexteMetier: undefined });
    expect(sans.erreur).toContain("Envoi suspendu dans le périmètre validé");
    // Et même si un contexte était joint par erreur : la base refuse la preuve.
    const avec = await envoyer(chargeAvis(d));
    expect(avec.erreur).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();
    expect((await q("select 1 from public.courriels_durables where organization_id = $1 and etat in ('accepte','livre')", [d.org]))).toHaveLength(0);
  });

  it("interrupteur ouvert : l'avis part une fois au locataire, puis sa ligne est close ; à une autre adresse, rien ne part", async () => {
    const d = await decorLoyer();
    await ouvrir("avis_echeance");
    const intrus = await envoyer(chargeAvis(d, "intrus@example.invalid"));
    expect(intrus.erreur).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();

    const p = chargeAvis(d);
    const r = await envoyer(p);
    expect(r.erreur).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
    const [adresse, requete] = transport.mock.calls[0] as [string, { body: string }];
    expect(String(adresse)).toContain("api.resend.com");
    expect(JSON.parse(requete.body).to).toEqual([LOCATAIRE]);
    const m = await ligne(p);
    expect(m).toMatchObject({ etat: "accepte", finalisation_etat: "terminee" });
    expect((m.contexte_metier as Record<string, unknown>).type).toBe("avis_echeance");
    // Un second passage pour le même avis ne renvoie rien au fournisseur.
    await envoyer(p);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("les trois autres envois partent eux aussi, une fois, interrupteur ouvert", async () => {
    const loyer = await decorRelance();
    const due = await relanceDue(loyer.bail);
    const rdv = await decorRendezVous();
    const invitation = await decorInvitation();
    for (const flux of ["relance_loyer", "rappel_rendez_vous", "relance_invitation"] as const) await ouvrir(flux);
    const reste = montantDeContexte(due.reste)!;
    const charges: ChargeCourriel[] = [
      { to: LOCATAIRE, subject: "Relance fictive", html: "<p>Relance</p>", cleIdempotence: `essai-relance-${loyer.bail}`, organisationId: loyer.org,
        contexteMetier: { type: "relance_loyer", id: loyer.bail, niveau: due.niveau as "relance_1", echeance: due.echeance, reste, total: montantDeContexte(due.total), cible: "locataire" } },
      { to: ARTISAN, subject: "Rappel fictif", html: "<p>Rappel</p>", cleIdempotence: `essai-rappel-${rdv.intervention}`, organisationId: rdv.org,
        contexteMetier: { type: "rappel_rendez_vous", id: rdv.intervention, echeance: "veille", role: "artisan" } },
      { to: LOCATAIRE, subject: "Relance d’invitation fictive", html: "<p>Invitation</p>", cleIdempotence: `essai-invitation-${invitation.invitation}`,
        contexteMetier: { type: "relance_invitation", id: invitation.invitation, rang: "1" } },
    ];
    for (const [i, p] of charges.entries()) {
      const r = await envoyer(p);
      expect(r.erreur, p.contexteMetier!.type).toBeUndefined();
      expect(transport).toHaveBeenCalledTimes(i + 1);
      expect(await ligne(p), p.contexteMetier!.type).toMatchObject({ etat: "accepte", finalisation_etat: "terminee" });
    }
  });

  it.each([
    ["l'interrupteur refermé", async () => { await ouvrir("avis_echeance", false); }],
    ["un arrêt d'urgence des appels", async () => { await arreter("appels"); }],
    ["le terme réglé", async (d: { org: string; bail: string }) => { await db.query("insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,750, public.aujourdhui_paris())", [d.org, d.bail]); }],
  ])("un avis déjà en file ne repart pas après %s", async (_libelle, changer) => {
    const d = await decorLoyer();
    await ouvrir("avis_echeance");
    const p = chargeAvis(d);
    await conserverCourriel(service, p);
    await changer(d);
    await enService();
    await reprendre();
    expect(transport).not.toHaveBeenCalled();
    expect((await ligne(p)).etat).not.toBe("accepte");
  });

  it("un avis en file repart une seule fois tant que tout tient", async () => {
    const d = await decorLoyer();
    await ouvrir("avis_echeance");
    const p = chargeAvis(d);
    await conserverCourriel(service, p);
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await ligne(p)).toMatchObject({ etat: "accepte" });
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // ── 7. Droits, rejeu, retour ──────────────────────────────────────────────────────────────────────────────────
  it("les têtes ne s'ouvrent qu'au traitement ; les maillons d'avant sont fermés à tous ; aucun maillon en attente", async () => {
    const droits = await q<{ f: string; anon: boolean; compte: boolean; traitement: boolean }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
             has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('empreinte_metier_courriel','finaliser_courriel_metier','empreinte_avant_envois_automatiques','finaliser_avant_envois_automatiques',
                           'envoi_automatique_ouvert','envois_automatiques_proposes','lire_envois_automatiques','regler_envoi_automatique')
       order by 1`);
    expect(droits).toEqual([
      { f: "empreinte_avant_envois_automatiques", anon: false, compte: false, traitement: false },
      { f: "empreinte_metier_courriel", anon: false, compte: false, traitement: true },
      { f: "envoi_automatique_ouvert", anon: false, compte: false, traitement: true },
      { f: "envois_automatiques_proposes", anon: false, compte: true, traitement: true },
      { f: "finaliser_avant_envois_automatiques", anon: false, compte: false, traitement: false },
      { f: "finaliser_courriel_metier", anon: false, compte: false, traitement: true },
      { f: "lire_envois_automatiques", anon: false, compte: true, traitement: false },
      { f: "regler_envoi_automatique", anon: false, compte: true, traitement: false },
    ]);
    expect(await maillonsEnAttente(db)).toEqual([]);
    const [table] = await q<{ rls: boolean; droits: string | null }>("select c.relrowsecurity rls, c.relacl::text droits from pg_class c where c.oid = 'public.envois_automatiques_reglage'::regclass");
    expect(table.rls).toBe(true);
    expect(table.droits ?? "").not.toMatch(/anon|authenticated|service_role/);
  });

  it("la migration se rejoue sans effet (un interrupteur ouvert le reste) ; son retour rend les têtes d'avant, met de côté les e-mails en file, et la repose referme tout", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const NOMS = ["empreinte_metier_courriel", "finaliser_courriel_metier", "empreinte_avant_envois_automatiques", "finaliser_avant_envois_automatiques",
      "envoi_automatique_ouvert", "envois_automatiques_proposes", "lire_envois_automatiques", "regler_envoi_automatique"];
    const etat = async () => q<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname = any($1) order by 1`, [NOMS]);
    const corps = async (nom: string) => (await q<{ c: string }>("select md5(p.prosrc) c from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname=$1", [nom]))[0]?.c;
    const reglage = async () => (await q<Record<FluxEnvoiAutomatique, boolean>>("select avis_echeance, relance_loyer, rappel_rendez_vous, relance_invitation from public.envois_automatiques_reglage"))[0];

    const d = await decorLoyer();
    await ouvrir("avis_echeance");
    const avec = await etat();
    expect(avec).toHaveLength(8);
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    expect(await maillonsEnAttente(db)).toEqual([]);
    // Rejouer la migration ne referme pas ce que le superviseur a ouvert, et n'ouvre rien d'autre.
    expect(await reglage()).toEqual({ avis_echeance: true, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false });

    // Un avis attend une reprise au moment du retour.
    const p = chargeAvis(d);
    await conserverCourriel(service, p);
    expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);

    // Tant qu'un maillon plus récent s'appuie sur celui-ci, son retour se refuse sans rien modifier.
    if (maillonsPlusRecents(NOM).length > 0) {
      await db.query("savepoint hors_ordre");
      await expect(db.query(retour)).rejects.toThrow(REFUS_RETOUR_HORS_ORDRE);
      await db.query("rollback to savepoint hors_ordre");
      expect(await etat()).toEqual(avec);
      await defaireMaillonsPlusRecents(db, NOM);
      expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);
    }
    const ancienneEmpreinte = await corps("empreinte_avant_envois_automatiques");
    const ancienneFinalisation = await corps("finaliser_avant_envois_automatiques");

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122200000','envois_automatiques_reglage') on conflict do nothing");
    await db.query(retour);
    const sans = await etat();
    expect(sans.map((f) => f.f)).toEqual(["empreinte_metier_courriel", "finaliser_courriel_metier"]);
    expect(await corps("empreinte_metier_courriel")).toBe(ancienneEmpreinte);
    expect(await corps("finaliser_courriel_metier")).toBe(ancienneFinalisation);
    expect(sans.map((f) => f.d)).toEqual(avec.filter((f) => ["empreinte_metier_courriel", "finaliser_courriel_metier"].includes(f.f)).map((f) => f.d));
    expect((await q<{ t: string | null }>("select to_regclass('public.envois_automatiques_reglage')::text t"))[0].t).toBeNull();
    expect((await q("select 1 from supabase_migrations.schema_migrations where version='20261122200000'")).length).toBe(0);
    // Les quatre types ne sont plus prouvés ; l'avis en file est mis de côté, contenu effacé ; le code encore en place
    // lit « fermé » (la fonction de lecture n'existe plus).
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
    expect(await ligne(p)).toMatchObject({ finalisation_etat: "a_verifier", reprise_autonome: false, charge_chiffree: null });
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) expect(await envoiAutomatiqueOuvert(service, flux), flux).toBe(false);
    // Aucune trace métier effacée : l'appel est toujours là, toujours à envoyer.
    expect(await q("select 1 from public.appels_a_envoyer(500) where appel_id = $1", [d.appel])).toHaveLength(1);
    await db.query(retour);
    expect(await etat()).toEqual(sans);

    await db.query(migration);
    await reposerMaillonsPlusRecents(db, NOM);
    expect(await maillonsEnAttente(db)).toEqual([]);
    const denouveau = await etat();
    expect(denouveau.map((f) => [f.f, f.e, f.d])).toEqual(avec.map((f) => [f.f, f.e, f.d]));
    // Reposée, la migration livre tout fermé : l'ouverture d'avant le retour n'est pas rendue.
    expect(await reglage()).toEqual({ avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false });
    expect(await preuve(d.org, ctxAvis(d.appel))).toBeNull();
    await ouvrir("avis_echeance");
    expect(await preuve(d.org, ctxAvis(d.appel))).toMatch(HEX64);
  });
});
