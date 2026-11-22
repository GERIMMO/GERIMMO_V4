/**
 * LE LIEN DE CONFIRMATION DU MOBILE PART AU GARANT — audit palier 1 du 22/11/2026, P1-01.
 *
 * Le défaut : cet e-mail partait sans contexte métier ; la liste fermée des e-mails le suspendait, et la signature
 * électronique d'un bail avec garant restait bloquée. La migration 20261122130000 admet un type de plus,
 * « confirmation_mobile_garant », prouvé en base juste avant l'envoi.
 *
 * Ces tests tiennent, sur la base réelle :
 *  1. la preuve existe pour un lien ouvert, et pour lui seul : utilisé, remplacé, échu, autre garant, autre circuit,
 *     autre espace, autre demandeur, demandeur qui n'est plus propriétaire, adresse changée, circuit qui n'est plus
 *     prêt, espace suspendu, arrêt d'urgence — pas de preuve, donc pas d'envoi ; une valeur mal formée ne lève rien ;
 *  2. tout autre type d'e-mail suit la chaîne d'avant, à l'identique ;
 *  3. par la vraie chaîne d'envoi (liste fermée, conservation chiffrée, preuve, fournisseur simulé) : l'e-mail part
 *     une fois, au garant, puis sa ligne est close ; un lien remplacé avant une reprise ne repart pas ;
 *  4. les droits ne s'ouvrent à personne de plus ; la migration se rejoue sans effet ; son retour rend les têtes
 *     d'avant et met de côté les e-mails de ce type encore en file.
 *
 * AUCUN envoi réel : `fetch` est simulé. Nécessite SUPABASE_DB_URL. Chaque test dans une transaction annulée. Le
 * dernier bloc rejoue du DDL : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierBaseDeTest } from "./garde-base";
import { clientSurPg } from "./fixtures/supabase-sur-pg";

const partage = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => partage.service }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));

import { empreinteCourriel } from "../src/lib/courriels-durables";
import { envoyerEmail, envoyerEmailTransport } from "../src/lib/email";
import { circuitAdmisPilote } from "../src/lib/perimetre-pilote";
import { conserverCourriel, identiteCourriel, reprendreCourriels, type ChargeCourriel } from "../src/lib/reprise-courriels";

const NOM = "20261122130000_lien_garant_admis";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const ADRESSE_GARANT = "gaston.garant@example.invalid";
const jeton = () => randomBytes(32).toString("base64url");

describe("lien du garant — manifeste, retour et liste fermée (sans base)", () => {
  it("la migration est au manifeste une seule fois, après la chaîne qu'elle prolonge, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261024120000_signature_caution_mobile_et_edl_sur_place.sql", "20261116201423_avis_essai_et_inactivite.sql"]) {
      expect(manifeste.indexOf(avant), avant).toBeGreaterThan(-1);
      expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(avant));
    }
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/lien-garant-admis-base.test.ts"');
  });

  it("la migration prolonge la chaîne sans la réécrire, et n'ouvre aucun droit à un compte", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_lien_garant;");
    expect(sql).toContain("alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_lien_garant;");
    expect(sql).toContain("return public.empreinte_avant_lien_garant(p_org, p_contexte);");
    expect(sql).toContain("return public.finaliser_avant_lien_garant(p_id);");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public|authenticated)\b/i);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("la liste fermée admet le lien du garant complet, et lui seul", () => {
    const complet: ChargeCourriel = {
      to: ADRESSE_GARANT, subject: "Confirmation", html: "<p>lien</p>", organisationId: randomUUID(),
      contexteMetier: { type: "confirmation_mobile_garant", id: randomUUID(), garant: randomUUID(), jeton_empreinte: "a".repeat(64), acteur: randomUUID() },
    };
    expect(circuitAdmisPilote(complet)).toBe(true);
    const sans = (cle: string) => ({ ...complet, contexteMetier: { ...complet.contexteMetier, [cle]: "" } }) as ChargeCourriel;
    for (const cle of ["id", "garant", "jeton_empreinte", "acteur"]) expect(circuitAdmisPilote(sans(cle)), cle).toBe(false);
    expect(circuitAdmisPilote({ ...complet, organisationId: undefined })).toBe(false);
    expect(circuitAdmisPilote({ ...complet, piecesJointes: [{ nom: "piece.pdf", contenuBase64: "AA==" }] })).toBe(false);
    expect(circuitAdmisPilote({ ...complet, contexteMetier: { ...complet.contexteMetier, jeton_empreinte: "A".repeat(64) } } as ChargeCourriel)).toBe(false);
    // Le même e-mail sans contexte reste suspendu, comme avant le correctif.
    expect(circuitAdmisPilote({ ...complet, contexteMetier: undefined })).toBe(false);
  });
});

describe.skipIf(!url)("lien du garant (avec base)", () => {
  const db = new Client({ connectionString: url });
  const service = clientSurPg(db, { transactionnel: true }) as unknown as SupabaseClient;
  const transport = vi.fn();
  let org = "", owner = "", autre = "", bail = "", doc = "", circuit = "";

  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as T[];
  const id = async (sql: string, p: unknown[] = []) => String((await q<{ id: string }>(sql, p))[0].id);
  const signataires = (adresseGarant = ADRESSE_GARANT, garant = "garant") => JSON.stringify([
    { personId: garant, qualite: "Garant", prenom: "Gaston", nom: "Garant", email: adresseGarant, telephone: "", mentionCaution: "mention" },
    { personId: "owner", qualite: "Propriétaire", prenom: "Paule", nom: "Proprio", email: "paule@example.invalid", telephone: "+33600000002" },
  ]);
  /** Une demande de lien, comme le serveur la fait : rend le jeton (jamais conservé) et son empreinte. */
  async function demander(acteur = owner, c = circuit) {
    const j = jeton();
    await db.query("select public.demander_confirmation_mobile_caution($1, $2, $3)", [c, acteur, empreinteCourriel(j)]);
    return { jeton: j, empreinte: empreinteCourriel(j) };
  }
  const contexte = (empreinte: string, surcharge: Record<string, unknown> = {}) => ({
    type: "confirmation_mobile_garant", id: circuit, garant: "garant", jeton_empreinte: empreinte, acteur: owner,
    destinataire: empreinteCourriel(ADRESSE_GARANT), ...surcharge,
  });
  const preuve = async (ctx: Record<string, unknown>, espace = org) =>
    (await q<{ e: string | null }>("select public.empreinte_metier_courriel($1, $2::jsonb) e", [espace, JSON.stringify(ctx)]))[0].e;
  const charge = (j: { jeton: string; empreinte: string }): ChargeCourriel => ({
    to: ADRESSE_GARANT, subject: "Confirmez votre numéro de mobile", html: `<p>Lien fictif /signature/caution/${j.jeton}</p>`,
    cleIdempotence: `caution-mobile-${j.empreinte}`, organisationId: org,
    contexteMetier: { type: "confirmation_mobile_garant", id: circuit, garant: "garant", jeton_empreinte: j.empreinte, acteur: owner },
  });
  const ligne = async (p: ChargeCourriel) => (await q<Record<string, unknown>>("select * from public.courriels_durables where id = $1", [identiteCourriel(p).id]))[0];
  const envoyer = (p: ChargeCourriel) => envoyerEmail({ ...p, circuit: "lib/confirmation-mobile-caution", organisation: { db: service, id: org } });
  const reprendre = () => reprendreCourriels(service,
    (p, ref) => envoyerEmailTransport({ ...p, referenceInterne: ref, cleIdempotence: p.cleIdempotence, ...(p.organisationId ? { organisation: { db: service, id: p.organisationId } } : {}) }),
    async () => {});

  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    vi.stubEnv("GERIMMO_PILOTE_LIMITE", "true"); vi.stubEnv("COURRIELS_CHIFFREMENT_CLE", "cd".repeat(32)); vi.stubEnv("RESEND_API_KEY", "fictif-sans-service");
    partage.service = service;
    transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: `fictif-${randomUUID()}` }), { status: 200 }));
    vi.stubGlobal("fetch", transport);
    await db.query("update public.supervision_arrets set arrete = false");
    org = await id("insert into public.organizations(name,type,status) values('Essai lien garant fictif','proprietaire_direct','active') returning id");
    owner = await id("insert into auth.users(id,email) values(gen_random_uuid(), gen_random_uuid()||'@example.invalid') returning id");
    autre = await id("insert into auth.users(id,email) values(gen_random_uuid(), gen_random_uuid()||'@example.invalid') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [owner, org]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id", [org, bien]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Test','Alice','alice@example.invalid') returning id", [org]);
    bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',current_date,500,20) returning id", [org, lot, locataire]);
    doc = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Acte fictif',$1::uuid::text||'/acte.pdf','application/pdf',100,repeat('a',64)) returning id", [org]);
    circuit = await id(
      "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,options) values($1,$2,$3,$4,'production',repeat('b',64),repeat('a',64),$5,'zoho','cautionnement',jsonb_build_object('garant','garant')) returning id",
      [org, bail, doc, owner, signataires()]);
  });
  afterEach(async () => { await db.query("rollback"); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  // ── 1. La preuve ─────────────────────────────────────────────────────────────────────────────────────────────
  it("un lien ouvert a sa preuve, stable ; elle ne contient ni le jeton ni l'adresse", async () => {
    const l = await demander();
    const e = await preuve(contexte(l.empreinte));
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(await preuve(contexte(l.empreinte))).toBe(e);
    expect(e).not.toBe(l.empreinte);
  });

  it.each([
    ["l'adresse d'un autre destinataire", { destinataire: empreinteCourriel("autre@example.invalid") }],
    ["aucune adresse", { destinataire: undefined }],
    ["un autre garant", { garant: "owner" }],
    ["un autre circuit", { id: randomUUID() }],
    ["l'empreinte d'un autre jeton", { jeton_empreinte: "c".repeat(64) }],
    ["un circuit mal formé", { id: "pas-un-identifiant" }],
    ["un demandeur mal formé", { acteur: "x" }],
    ["aucun demandeur", { acteur: undefined }],
    ["une empreinte mal formée", { jeton_empreinte: "abc" }],
    ["aucun garant", { garant: "" }],
  ])("pas de preuve avec %s, et aucune erreur", async (_libelle, surcharge) => {
    const l = await demander();
    expect(await preuve(contexte(l.empreinte, surcharge))).toBeNull();
  });

  it("pas de preuve pour un autre demandeur, ni pour un demandeur qui n'est plus propriétaire actif de l'espace", async () => {
    const l = await demander();
    expect(await preuve(contexte(l.empreinte, { acteur: autre }))).toBeNull();
    await db.query("update public.memberships set status='inactive' where account_id=$1 and organization_id=$2", [owner, org]);
    expect(await preuve(contexte(l.empreinte))).toBeNull();
  });

  it("pas de preuve depuis un autre espace, ni pour un espace suspendu", async () => {
    const l = await demander();
    const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    expect(await preuve(contexte(l.empreinte), ailleurs)).toBeNull();
    expect((await q<{ e: string | null }>("select public.empreinte_metier_courriel(null, $1::jsonb) e", [JSON.stringify(contexte(l.empreinte))]))[0].e).toBeNull();
    await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set status='suspendue' where id=$1", [org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    expect(await preuve(contexte(l.empreinte))).toBeNull();
  });

  it("pas de preuve pour un lien remplacé, utilisé ou échu ; le nouveau lien, lui, a la sienne", async () => {
    const premier = await demander();
    const second = await demander();
    expect(await preuve(contexte(premier.empreinte))).toBeNull();
    expect(await preuve(contexte(second.empreinte))).toMatch(/^[0-9a-f]{64}$/);
    await db.query("select * from public.consommer_confirmation_mobile_caution($1, $2)", [second.empreinte, "+33611223344"]);
    expect(await preuve(contexte(second.empreinte))).toBeNull();
    const echu = empreinteCourriel(jeton());
    await db.query("insert into public.confirmations_mobile_caution(organization_id,circuit_id,garant_id,acte,jeton_empreinte,demande_par,cree_le,expire_le) values($1,$2,'garant','cautionnement',$3,$4,now()-interval '8 days',now()-interval '1 day')", [org, circuit, echu, owner]);
    expect(await preuve(contexte(echu))).toBeNull();
  });

  it("pas de preuve si l'adresse du garant a changé dans le circuit, ni si le circuit n'est plus prêt", async () => {
    const l = await demander();
    await db.query("update public.bail_signature_circuits set signataires=$2 where id=$1", [circuit, signataires("nouvelle.adresse@example.invalid")]);
    expect(await preuve(contexte(l.empreinte))).toBeNull();
    // Même avec la nouvelle adresse comme destinataire, un circuit qui a quitté « prêt » ferme ses liens.
    await db.query("update public.bail_signature_circuits set signataires=$2 where id=$1", [circuit, signataires()]);
    expect(await preuve(contexte(l.empreinte))).toMatch(/^[0-9a-f]{64}$/);
    // (La base refuse qu'un acte parte en signature tant que la caution n'a pas confirmé son numéro : on l'annule.)
    await db.query("update public.bail_signature_circuits set etat='annule' where id=$1", [circuit]);
    expect(await preuve(contexte(l.empreinte))).toBeNull();
    expect((await q<{ annulee: boolean }>("select annulee_le is not null annulee from public.confirmations_mobile_caution where jeton_empreinte=$1", [l.empreinte]))[0].annulee).toBe(true);
  });

  it.each(["signatures", "global"])("pas de preuve sous l'arrêt d'urgence « %s » ; elle revient quand il est levé", async (cle) => {
    const l = await demander();
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, true, 'Essai de contrôle', $2) on conflict (cle) do update set arrete = true", [cle, owner]);
    expect(await preuve(contexte(l.empreinte))).toBeNull();
    await db.query("update public.supervision_arrets set arrete = false where cle = $1", [cle]);
    expect(await preuve(contexte(l.empreinte))).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── 2. Les autres types ──────────────────────────────────────────────────────────────────────────────────────
  it("tout autre type suit la chaîne d'avant, à l'identique", async () => {
    const l = await demander();
    const autres = [
      { type: "acces", id: owner, usage: "recovery", jeton_empreinte: "d".repeat(64), destinataire: empreinteCourriel("x@example.invalid") },
      { type: "invitation_artisan", id: randomUUID(), acteur: owner, destinataire: empreinteCourriel("x@example.invalid") },
      { type: "notification", id: randomUUID(), evenement: "devis_recu", role: "agence", source: randomUUID() },
      { type: "notification", id: randomUUID(), evenement: "incident_urgent", role: "agence" },
      { type: "quittance", id: randomUUID(), montant: 100, est_quittance: true, acteur: owner },
      { type: "inconnu" },
      { id: circuit, garant: "garant", jeton_empreinte: l.empreinte, acteur: owner, destinataire: empreinteCourriel(ADRESSE_GARANT) },
      {},
    ];
    for (const ctx of autres) {
      const r = (await q<{ meme: boolean }>(
        "select public.empreinte_metier_courriel($1,$2::jsonb) is not distinct from public.empreinte_avant_lien_garant($1,$2::jsonb) as meme", [org, JSON.stringify(ctx)]))[0];
      expect(r.meme, JSON.stringify(ctx)).toBe(true);
    }
  });

  // ── 3. La vraie chaîne d'envoi ───────────────────────────────────────────────────────────────────────────────
  it("l'e-mail part une fois, au garant, puis sa ligne est close ; rien du jeton ne reste lisible en base", async () => {
    const l = await demander();
    const p = charge(l);
    const r = await envoyer(p);
    expect(r.erreur).toBeUndefined();
    expect(r).toMatchObject({ id: expect.any(String), finalisationEnAttente: false });
    expect(transport).toHaveBeenCalledTimes(1);
    const [adresse, requete] = transport.mock.calls[0] as [string, { body: string }];
    expect(String(adresse)).toContain("api.resend.com");
    expect(JSON.parse(requete.body).to).toEqual([ADRESSE_GARANT]);
    const m = await ligne(p);
    expect(m.finalisation_etat).toBe("terminee");
    expect(m.etat).toBe("accepte");
    expect(m.charge_chiffree).toBeNull();
    expect(JSON.stringify(m)).not.toContain(l.jeton);
    expect((m.contexte_metier as Record<string, unknown>).type).toBe("confirmation_mobile_garant");
    // Un second appel pour le même lien ne renvoie rien au fournisseur.
    await envoyer(p);
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await q("select etat from public.courriels_evenements where courrier_id=$1 and etat='finalisation_terminee'", [m.id])).length).toBe(1);
  });

  it("le même e-mail sans contexte reste suspendu : c'était le défaut", async () => {
    const l = await demander();
    const r = await envoyer({ ...charge(l), contexteMetier: undefined });
    expect(r.erreur).toContain("Envoi suspendu dans le périmètre validé");
    expect(transport).not.toHaveBeenCalled();
  });

  it("un e-mail conservé puis repris part une fois, tant que son lien est ouvert", async () => {
    const l = await demander();
    const p = charge(l);
    await conserverCourriel(service, p);
    expect((await ligne(p)).charge_chiffree).not.toContain(l.jeton);
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await ligne(p)).toMatchObject({ etat: "accepte" });
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("un lien remplacé avant la reprise ne repart pas : la ligne passe « à vérifier », sans reprise automatique", async () => {
    const l = await demander();
    const p = charge(l);
    await conserverCourriel(service, p);
    await demander(); // le bailleur redemande un lien : le premier est annulé
    await reprendre();
    expect(transport).not.toHaveBeenCalled();
    expect(await ligne(p)).toMatchObject({ finalisation_etat: "a_verifier", reprise_autonome: false });
    await reprendre();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ["utilisé par le garant", async (l: { empreinte: string }) => { await db.query("select * from public.consommer_confirmation_mobile_caution($1, $2)", [l.empreinte, "+33611223344"]); }],
    ["dont le circuit est annulé", async () => { await db.query("update public.bail_signature_circuits set etat='annule' where id=$1", [circuit]); }],
    ["sous arrêt d'urgence des signatures", async () => { await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ('signatures', true, 'Essai de contrôle', $1) on conflict (cle) do update set arrete = true", [owner]); }],
    ["dont le demandeur n'est plus propriétaire actif", async () => { await db.query("update public.memberships set status='inactive' where account_id=$1 and organization_id=$2", [owner, org]); }],
  ])("un lien %s avant la reprise ne repart pas", async (_libelle, changer) => {
    const l = await demander();
    const p = charge(l);
    await conserverCourriel(service, p);
    await changer(l);
    await reprendre();
    expect(transport).not.toHaveBeenCalled();
    expect((await ligne(p)).etat).not.toBe("accepte");
  });

  it("une preuve refusée dès la conservation : rien ne part (adresse qui n'est pas celle du garant)", async () => {
    const l = await demander();
    const r = await envoyer({ ...charge(l), to: "intrus@example.invalid" });
    expect(r.erreur).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();
  });

  // ── 4. Droits, rejeu, retour ─────────────────────────────────────────────────────────────────────────────────
  it("les têtes ne s'ouvrent qu'au traitement ; les anciennes têtes sont fermées à tous", async () => {
    const droits = (await q<{ f: string; anon: boolean; compte: boolean; traitement: boolean }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
             has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('empreinte_metier_courriel','finaliser_courriel_metier','empreinte_avant_lien_garant','finaliser_avant_lien_garant')
       order by 1`));
    expect(droits).toEqual([
      { f: "empreinte_avant_lien_garant", anon: false, compte: false, traitement: false },
      { f: "empreinte_metier_courriel", anon: false, compte: false, traitement: true },
      { f: "finaliser_avant_lien_garant", anon: false, compte: false, traitement: false },
      { f: "finaliser_courriel_metier", anon: false, compte: false, traitement: true },
    ]);
  });

  it("la migration se rejoue sans effet ; son retour rend les têtes d'avant et met de côté les e-mails en file", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async () => (await q<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('empreinte_metier_courriel','finaliser_courriel_metier','empreinte_avant_lien_garant','finaliser_avant_lien_garant')
       order by 1`));
    const corps = async (nom: string) => (await q<{ c: string }>("select md5(p.prosrc) c from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname=$1", [nom]))[0]?.c;

    const avec = await etat();
    expect(avec).toHaveLength(4);
    await db.query(migration);
    expect(await etat()).toEqual(avec);

    // Un e-mail de ce type attend une reprise au moment du retour.
    const l = await demander();
    const p = charge(l);
    await conserverCourriel(service, p);
    const ancienneEmpreinte = await corps("empreinte_avant_lien_garant");
    const ancienneFinalisation = await corps("finaliser_avant_lien_garant");

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122130000','lien_garant_admis') on conflict do nothing");
    await db.query(retour);
    const sans = await etat();
    expect(sans.map((f) => f.f)).toEqual(["empreinte_metier_courriel", "finaliser_courriel_metier"]);
    // Les têtes rendues sont bien celles d'avant, avec leurs droits : le traitement seul.
    expect(await corps("empreinte_metier_courriel")).toBe(ancienneEmpreinte);
    expect(await corps("finaliser_courriel_metier")).toBe(ancienneFinalisation);
    expect(sans.map((f) => f.d)).toEqual(avec.filter((f) => !f.f.includes("avant_lien_garant")).map((f) => f.d));
    expect((await q("select 1 from supabase_migrations.schema_migrations where version='20261122130000'")).length).toBe(0);
    // Le type n'est plus prouvé, et l'e-mail en file est mis de côté, contenu effacé.
    expect(await preuve(contexte(l.empreinte))).toBeNull();
    expect(await ligne(p)).toMatchObject({ finalisation_etat: "a_verifier", reprise_autonome: false, charge_chiffree: null });
    await db.query(retour);
    expect(await etat()).toEqual(sans);

    await db.query(migration);
    const denouveau = await etat();
    expect(denouveau.map((f) => [f.f, f.e, f.d])).toEqual(avec.map((f) => [f.f, f.e, f.d]));
    expect(await preuve(contexte(l.empreinte))).toMatch(/^[0-9a-f]{64}$/);
  });
});
