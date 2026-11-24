/**
 * LES MOTIFS D'UN REFUS OU D'UNE SUSPENSION SONT ENVOYÉS À L'ARTISAN PAR E-MAIL (audit palier 1 du 22/11/2026, P1-16).
 *
 * Les conditions de l'espace artisan (article A10) disent que Gerimmo « communique les motifs par courriel, au plus
 * tard quand la mesure prend effet ». Le motif était visible dans l'espace de l'artisan ; aucun e-mail ne partait.
 *
 * Ce que ces tests tiennent :
 *  1. la preuve n'existe que pour la DERNIÈRE décision de l'artisan, si c'est un refus ou une suspension motivé, pas
 *     encore notifié, pour l'adresse de sa fiche, l'inscription étant toujours dans l'état que la décision a posé ;
 *     un nouvel examen, une adresse changée, un arrêt d'urgence général la retirent ;
 *  2. l'e-mail part une fois, dit la décision et le motif mot pour mot (sans rien interpréter du HTML), et la décision
 *     est alors marquée notifiée ; un second essai ne renvoie rien ;
 *  3. un e-mail en file ne repart pas si la décision a été remplacée entre-temps ;
 *  4. personne d'autre que le traitement n'écrit la date de notification ; la migration se rejoue sans effet ; son
 *     retour rend les têtes d'avant, met de côté les e-mails en file, et n'efface ni décision ni date de notification.
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
import {
  defaireMaillonsPlusRecents, MAILLONS_CHAINE_COURRIELS, maillonsEnAttente, maillonsPlusRecents, REFUS_RETOUR_HORS_ORDRE,
  reposerMaillonsPlusRecents,
} from "./fixtures/chaine-courriels";

const partage = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => partage.service }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));

import { empreinteCourriel } from "../src/lib/courriels-durables";
import { corpsDecisionArtisan, envoyerMotifsDecisionArtisan, phraseEnvoiMotifs, sujetDecisionArtisan } from "../src/lib/decision-artisan-email";
import { envoyerEmailTransport } from "../src/lib/email";
import { circuitAdmisPilote } from "../src/lib/perimetre-pilote";
import { conserverCourriel, identiteCourriel, reprendreCourriels, type ChargeCourriel } from "../src/lib/reprise-courriels";

const NOM = "20261122210000_decision_artisan_notifiee";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const HEX64 = /^[0-9a-f]{64}$/;
const ARTISAN = "atelier.essai@example.invalid";
const MOTIF = "Attestation décennale expirée depuis mars.\nMerci d'en déposer une en cours de validité.";

describe("décision d'artisan notifiée — manifeste, retour, liste fermée et texte (sans base)", () => {
  it("la migration est au manifeste une seule fois, après les maillons qu'elle prolonge, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261122130000_lien_garant_admis.sql", "20261122200000_envois_automatiques_reglage.sql"]) {
      expect(manifeste.indexOf(avant), avant).toBeGreaterThan(-1);
      expect(manifeste.indexOf(`${NOM}.sql`), avant).toBeGreaterThan(manifeste.indexOf(avant));
    }
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/decision-artisan-base.test.ts"');
    // Lot D4 du 24/11/2026 : ce maillon n'est plus le dernier (la migration 20261125110000 prolonge la chaîne au-dessus
    // de lui). Ce que le test tient : il est dans la liste, juste après le maillon des envois automatiques.
    expect(MAILLONS_CHAINE_COURRIELS[MAILLONS_CHAINE_COURRIELS.indexOf("20261122200000_envois_automatiques_reglage") + 1]).toBe(NOM);
  });

  it("la migration n'ouvre aucun droit à un compte et ne pose aucune garde ailleurs", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public|authenticated)\b/i);
    expect(sql).not.toMatch(/create trigger|poser_gardes_abonnement/i);
    expect(sql).toContain("alter table public.artisan_validations add column if not exists notifie_le timestamptz;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("la liste fermée admet l'e-mail des motifs par sa forme : une décision, aucun espace, aucune pièce", () => {
    const complet: ChargeCourriel = { to: ARTISAN, subject: "Objet", html: "<p>corps</p>", contexteMetier: { type: "decision_artisan", id: randomUUID() } };
    expect(circuitAdmisPilote(complet)).toBe(true);
    expect(circuitAdmisPilote({ ...complet, contexteMetier: { type: "decision_artisan", id: "pas-un-identifiant" } })).toBe(false);
    expect(circuitAdmisPilote({ ...complet, organisationId: randomUUID() })).toBe(false);
    expect(circuitAdmisPilote({ ...complet, piecesJointes: [{ nom: "piece.pdf", contenuBase64: "AA==" }] })).toBe(false);
    expect(circuitAdmisPilote({ ...complet, contexteMetier: undefined })).toBe(false);
  });

  it("l'e-mail dit la décision, sa date et le motif mot pour mot ; rien du motif n'est interprété comme du HTML", () => {
    const base = { raisonSociale: "Atelier <Essai> & Fils", motif: `Pièce illisible.\n<script>alert("x")</script> & "guillemets"`, decideLe: "2026-11-22T09:30:00+01:00", site: "https://www.gerimmo.app" };
    const refus = corpsDecisionArtisan({ ...base, decision: "refus" });
    expect(sujetDecisionArtisan("refus")).toBe("Votre inscription sur Gerimmo n’a pas été retenue");
    expect(refus).toContain("a été examinée le 22 novembre 2026. Elle n’a pas été retenue.");
    expect(refus).toContain("Atelier &lt;Essai&gt; &amp; Fils");
    expect(refus).toContain("Pièce illisible.<br>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;guillemets&quot;");
    expect(refus).not.toContain("<script>");
    expect(refus).toContain("Motif communiqué par Gerimmo :");
    expect(refus).toContain("demander un réexamen");
    expect(refus).toContain('href="https://www.gerimmo.app/artisan/entreprise"');
    const suspension = corpsDecisionArtisan({ ...base, decision: "suspension", site: null });
    expect(sujetDecisionArtisan("suspension")).toBe("Votre inscription sur Gerimmo est suspendue");
    expect(suspension).toContain("est suspendue depuis le 22 novembre 2026");
    // L'élision suit le nom de l'entreprise : « d’Atelier… », « de Plomberie… ».
    expect(suspension).toContain("l’inscription d’<strong>Atelier &lt;Essai&gt; &amp; Fils</strong>");
    expect(corpsDecisionArtisan({ ...base, raisonSociale: "Plomberie Durand", decision: "suspension" })).toContain("l’inscription de <strong>Plomberie Durand</strong>");
    expect(corpsDecisionArtisan({ ...base, raisonSociale: "  ", decision: "suspension" })).toContain("l’inscription de <strong>votre entreprise</strong>");
    expect(suspension).toContain("vous n’êtes plus proposé pour de nouvelles demandes");
    expect(suspension).not.toContain("href=");
    // L'e-mail ne cite aucun texte de loi et ne promet rien que les conditions ne disent pas.
    for (const corps of [refus, suspension]) expect(corps).not.toMatch(/\barticle\b|\bloi\b|règlement|délai de|sous \d+ jours/i);
  });

  it("l'écran du superviseur dit ce qu'il en est de l'e-mail, sans jamais annoncer un envoi qui n'a pas eu lieu", () => {
    expect(phraseEnvoiMotifs({ envoye: true })).toBe("Les motifs ont été envoyés à l’artisan par e-mail.");
    for (const raison of ["sans_adresse", "sans_decision", "echec"] as const) {
      const phrase = phraseEnvoiMotifs({ envoye: false, raison });
      expect(phrase, raison).not.toContain("ont été envoyés");
      expect(phrase, raison).toMatch(/Aucun e-mail|n’est pas parti/);
    }
    expect(phraseEnvoiMotifs({ envoye: false, raison: "deja_notifiee" })).toContain("ont déjà été envoyés");
    expect(phraseEnvoiMotifs({ envoye: false, raison: "sans_adresse" })).toContain("n’a pas d’adresse e-mail");
  });
});

describe.skipIf(!url)("décision d'artisan notifiée (avec base)", () => {
  const db = new Client({ connectionString: url });
  const service = clientSurPg(db, { transactionnel: true }) as unknown as SupabaseClient;
  const transport = vi.fn();
  let superviseur = "";

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
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  async function compte(superAdmin = false): Promise<string> {
    const c = await id(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-decision-'||gen_random_uuid()||'@example.invalid', 'x', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    if (superAdmin) await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [c]);
    return c;
  }
  /** Une inscription d'artisan en attente (ou déjà validée), avec son compte et son adresse. */
  async function artisan(statut: "en_attente" | "valide" = "en_attente", email: string | null = ARTISAN) {
    await enService();
    const compteArtisan = await compte();
    const a = await id(`insert into public.artisans(raison_sociale,siret,telephone,email,statut_plateforme,siret_etat,visibilite,account_id)
      values('Atelier fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000',$1,$2,'verifie','publique',$3) returning id`, [email, statut, compteArtisan]);
    return { artisan: a, compteArtisan };
  }
  /**
   * La décision du superviseur, par le geste de la console ; rend l'identifiant de la décision tracée.
   * En réalité chaque décision est une transaction à part, donc porte sa propre heure. Ici tout le test tient dans UNE
   * transaction (annulée à la fin), où `now()` ne bouge pas : on donne à chaque décision l'heure réelle de l'horloge,
   * pour que « la dernière décision » veuille dire la même chose qu'en production.
   */
  async function decider(a: string, operation: "refus" | "suspension" | "remise_en_attente", motif: string | null = MOTIF) {
    await enService();
    const avant = (await q<{ id: string }>("select id from public.artisan_validations where artisan_id = $1", [a])).map((l) => l.id);
    await en(superviseur);
    await db.query("select public.traiter_inscription_artisan_atomique($1, $2, $3)", [a, operation, motif]);
    await enService();
    const nouvelle = await id("select id from public.artisan_validations where artisan_id = $1 and not (id = any($2::uuid[]))", [a, avant]);
    await db.query("update public.artisan_validations set created_at = clock_timestamp() where id = $1", [nouvelle]);
    return nouvelle;
  }
  const ctx = (decision: string, adresse = ARTISAN, surcharge: Record<string, unknown> = {}) =>
    ({ type: "decision_artisan", id: decision, destinataire: empreinteCourriel(adresse), ...surcharge });
  const preuve = async (c: Record<string, unknown>, org: string | null = null) => {
    await enService();
    return (await q<{ e: string | null }>("select public.empreinte_metier_courriel($1, $2::jsonb) e", [org, JSON.stringify(c)]))[0].e;
  };
  const notifiee = async (decision: string) => (await q<{ n: boolean }>("select notifie_le is not null n from public.artisan_validations where id = $1", [decision]))[0].n;
  /** Ce que l'action lit avec les droits du superviseur : la dernière décision et la fiche de l'artisan. */
  const lecteur = {
    from(table: string) {
      const filtres: Record<string, unknown> = {};
      const requete = {
        select: () => requete, order: () => requete, limit: () => requete,
        eq: (colonne: string, valeur: unknown) => { filtres[colonne] = valeur; return requete; },
        maybeSingle: async () => {
          const lignes = table === "artisan_validations"
            ? await q("select id, decision::text decision, motif, created_at::text created_at, notifie_le::text notifie_le from public.artisan_validations where artisan_id = $1 order by created_at desc, id desc limit 1", [filtres.artisan_id])
            : await q("select raison_sociale, email from public.artisans where id = $1", [filtres.id]);
          return { data: lignes[0] ?? null, error: null };
        },
      };
      return requete;
    },
  } as unknown as Pick<SupabaseClient, "from">;
  const envoyer = async (a: string) => { await enService(); return envoyerMotifsDecisionArtisan(lecteur, a); };
  const charge = (decision: string, to = ARTISAN): ChargeCourriel => ({
    to, subject: "Motifs fictifs", html: "<p>Motif fictif</p>", cleIdempotence: `decision-artisan/${decision}`, contexteMetier: { type: "decision_artisan", id: decision },
  });
  const ligne = async (p: ChargeCourriel) => (await q<Record<string, unknown>>("select * from public.courriels_durables where id = $1", [identiteCourriel(p).id]))[0];
  const reprendre = () => reprendreCourriels(service,
    (p, ref) => envoyerEmailTransport({ ...p, referenceInterne: ref, cleIdempotence: p.cleIdempotence }), async () => {});

  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await enService();
    vi.stubEnv("GERIMMO_PILOTE_LIMITE", "true"); vi.stubEnv("COURRIELS_CHIFFREMENT_CLE", "12".repeat(32)); vi.stubEnv("RESEND_API_KEY", "fictif-sans-service");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
    partage.service = service;
    transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: `fictif-${randomUUID()}` }), { status: 200 }));
    vi.stubGlobal("fetch", transport);
    await db.query("update public.supervision_arrets set arrete = false");
    superviseur = await compte(true);
  });
  afterEach(async () => { await db.query("rollback"); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  // ── 1. La preuve ───────────────────────────────────────────────────────────────────────────────────────────────
  it("un refus motivé a sa preuve, stable, pour l'adresse de la fiche et sans espace", async () => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    expect((await q<{ s: string }>("select statut_plateforme::text s from public.artisans where id = $1", [a]))[0].s).toBe("refuse");
    const e = await preuve(ctx(d));
    expect(e).toMatch(HEX64);
    expect(await preuve(ctx(d))).toBe(e);
    expect(await notifiee(d)).toBe(false);
  });

  it("une suspension motivée a sa preuve elle aussi", async () => {
    const { artisan: a } = await artisan("valide");
    const d = await decider(a, "suspension", "Deux interventions non honorées, signalées par deux clients.");
    expect((await q<{ s: string }>("select statut_plateforme::text s from public.artisans where id = $1", [a]))[0].s).toBe("en_attente");
    expect(await preuve(ctx(d))).toMatch(HEX64);
  });

  it.each([
    ["une autre adresse", (d: string) => ctx(d, "intrus@example.invalid")],
    ["aucune adresse", (d: string) => ctx(d, ARTISAN, { destinataire: undefined })],
    ["une adresse mal formée", (d: string) => ctx(d, ARTISAN, { destinataire: "abc" })],
    ["une autre décision", () => ctx(randomUUID())],
    ["un identifiant mal formé", () => ctx("pas-un-identifiant")],
    ["aucun identifiant", (d: string) => ctx(d, ARTISAN, { id: undefined })],
  ])("pas de preuve avec %s, et aucune erreur", async (_libelle, contexte) => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    expect(await preuve(ctx(d))).toMatch(HEX64);
    expect(await preuve(contexte(d))).toBeNull();
  });

  it("pas de preuve depuis un espace : un artisan n'appartient à aucun", async () => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    const org = await id("insert into public.organizations(name,type,status) values('Espace fictif','proprietaire_direct','active') returning id");
    expect(await preuve(ctx(d), org)).toBeNull();
    expect(await preuve(ctx(d), null)).toMatch(HEX64);
  });

  it("pas de preuve pour une décision remplacée par un nouvel examen ; la nouvelle décision, elle, n'est pas un refus", async () => {
    const { artisan: a } = await artisan();
    const refusInitial = await decider(a, "refus");
    expect(await preuve(ctx(refusInitial))).toMatch(HEX64);
    const reexamen = await decider(a, "remise_en_attente", null);
    expect(reexamen).not.toBe(refusInitial);
    expect(await preuve(ctx(refusInitial))).toBeNull();
    expect(await preuve(ctx(reexamen))).toBeNull();
    // Un second refus, après réexamen : c'est LUI qui se notifie, pas le premier.
    const second = await decider(a, "refus", "Toujours aucune assurance en cours.");
    expect(await preuve(ctx(second))).toMatch(HEX64);
    expect(await preuve(ctx(refusInitial))).toBeNull();
  });

  it("pas de preuve si l'adresse de la fiche a changé ou disparu, si l'état de l'inscription ne correspond plus, ou sous arrêt général", async () => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    // L'adresse change : seule la nouvelle adresse de la fiche est prouvée.
    await db.query("savepoint adresse");
    await db.query("update public.artisans set email = 'nouvelle.adresse@example.invalid' where id = $1", [a]);
    expect(await preuve(ctx(d))).toBeNull();
    expect(await preuve(ctx(d, "nouvelle.adresse@example.invalid"))).toMatch(HEX64);
    await db.query("update public.artisans set email = null where id = $1", [a]);
    expect(await preuve(ctx(d, "nouvelle.adresse@example.invalid"))).toBeNull();
    await db.query("rollback to savepoint adresse");

    // L'inscription n'est plus « refusée » (état modifié hors du geste de décision) : la décision ne se notifie plus.
    await db.query("savepoint etat");
    await db.query("update public.artisans set statut_plateforme = 'valide' where id = $1", [a]);
    expect(await preuve(ctx(d))).toBeNull();
    await db.query("rollback to savepoint etat");

    const auteur = await compte();
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ('global', true, 'Essai de contrôle', $1) on conflict (cle) do update set arrete = true", [auteur]);
    expect(await preuve(ctx(d))).toBeNull();
    await db.query("update public.supervision_arrets set arrete = false where cle = 'global'");
    expect(await preuve(ctx(d))).toMatch(HEX64);

    // Déjà notifiée : la même décision ne repart pas.
    await db.query("update public.artisan_validations set notifie_le = now() where id = $1", [d]);
    expect(await preuve(ctx(d))).toBeNull();
  });

  it("tout autre type suit la chaîne d'avant, à l'identique", async () => {
    const autres = [
      { type: "avis_echeance", id: randomUUID(), destinataire: empreinteCourriel(ARTISAN) },
      { type: "confirmation_mobile_garant", id: randomUUID(), garant: "garant", jeton_empreinte: "a".repeat(64), acteur: randomUUID(), destinataire: empreinteCourriel(ARTISAN) },
      { type: "notification", evenement: "mission_confiee", id: randomUUID(), destinataire: empreinteCourriel(ARTISAN) },
      { type: "inconnu", id: randomUUID() }, { id: randomUUID() }, {},
    ];
    for (const c of autres) {
      const [r] = await q<{ meme: boolean }>(
        "select public.empreinte_metier_courriel(null,$1::jsonb) is not distinct from public.empreinte_avant_decision_artisan(null,$1::jsonb) as meme", [JSON.stringify(c)]);
      expect(r.meme, JSON.stringify(c)).toBe(true);
    }
  });

  // ── 2. La vraie chaîne d'envoi ────────────────────────────────────────────────────────────────────────────────
  it("après un refus, l'e-mail part une fois à l'artisan avec le motif, et la décision est marquée notifiée", async () => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    expect(await envoyer(a)).toEqual({ envoye: true });
    expect(transport).toHaveBeenCalledTimes(1);
    const [adresse, requete] = transport.mock.calls[0] as [string, { body: string }];
    expect(String(adresse)).toContain("api.resend.com");
    const corps = JSON.parse(requete.body) as { to: string[]; subject: string; html: string };
    expect(corps.to).toEqual([ARTISAN]);
    expect(corps.subject).toBe("Votre inscription sur Gerimmo n’a pas été retenue");
    expect(corps.html).toContain("Attestation décennale expirée depuis mars.<br>Merci d&#39;en déposer une en cours de validité.");
    expect(corps.html).toContain("Atelier fictif");
    expect(await notifiee(d)).toBe(true);
    const m = await ligne(charge(d));
    expect(m).toMatchObject({ etat: "accepte", finalisation_etat: "terminee", charge_chiffree: null });
    // Le motif ne reste pas lisible dans la file : seul le contexte (la décision visée) y demeure.
    expect(JSON.stringify(m)).not.toContain("décennale");
    // Un second essai ne renvoie rien : la décision est déjà notifiée.
    expect(await envoyer(a)).toEqual({ envoye: false, raison: "deja_notifiee" });
    expect(transport).toHaveBeenCalledTimes(1);
    // La date de notification est celle du premier envoi : elle ne bouge plus.
    const [avant] = await q<{ n: string }>("select notifie_le::text n from public.artisan_validations where id = $1", [d]);
    await db.query("select public.finaliser_courriel_metier($1)", [m.id]);
    expect((await q<{ n: string }>("select notifie_le::text n from public.artisan_validations where id = $1", [d]))[0].n).toBe(avant.n);
  });

  it("après une suspension, l'e-mail part de même, avec son propre objet", async () => {
    const { artisan: a } = await artisan("valide");
    const d = await decider(a, "suspension", "Deux interventions non honorées, signalées par deux clients.");
    expect(await envoyer(a)).toEqual({ envoye: true });
    const corps = JSON.parse((transport.mock.calls[0] as [string, { body: string }])[1].body) as { subject: string; html: string };
    expect(corps.subject).toBe("Votre inscription sur Gerimmo est suspendue");
    expect(corps.html).toContain("Deux interventions non honorées, signalées par deux clients.");
    expect(await notifiee(d)).toBe(true);
  });

  it("rien ne part sans adresse sur la fiche, ni quand la dernière décision n'est ni un refus ni une suspension", async () => {
    const sansAdresse = await artisan("en_attente", null);
    const d = await decider(sansAdresse.artisan, "refus");
    expect(await envoyer(sansAdresse.artisan)).toEqual({ envoye: false, raison: "sans_adresse" });
    expect(await notifiee(d)).toBe(false);

    const reexamine = await artisan();
    await decider(reexamine.artisan, "refus");
    await decider(reexamine.artisan, "remise_en_attente", null);
    expect(await envoyer(reexamine.artisan)).toEqual({ envoye: false, raison: "sans_decision" });
    const jamaisDecide = await artisan();
    expect(await envoyer(jamaisDecide.artisan)).toEqual({ envoye: false, raison: "sans_decision" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("si le service d'envoi refuse, la décision reste entière et non notifiée ; l'écran peut le dire", async () => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    transport.mockImplementation(async () => new Response(JSON.stringify({ message: "refus du service" }), { status: 422 }));
    const r = await envoyer(a);
    expect(r).toMatchObject({ envoye: false, raison: "echec" });
    expect(await notifiee(d)).toBe(false);
    expect((await q<{ s: string }>("select statut_plateforme::text s from public.artisans where id = $1", [a]))[0].s).toBe("refuse");
    // Le service répond de nouveau : le renvoi depuis la fiche aboutit, une seule fois.
    transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: `fictif-${randomUUID()}` }), { status: 200 }));
    expect(await envoyer(a)).toEqual({ envoye: true });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await notifiee(d)).toBe(true);
    expect(await envoyer(a)).toEqual({ envoye: false, raison: "deja_notifiee" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("un envoi d'issue incertaine n'est jamais retenté sous une autre clé ; cinq refus définitifs arrêtent les essais", async () => {
    // Issue incertaine (le service ne rend pas de référence) : l'e-mail est peut-être parti. Aucun nouvel envoi.
    const incertain = await artisan();
    const d1 = await decider(incertain.artisan, "refus");
    transport.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect(await envoyer(incertain.artisan)).toMatchObject({ envoye: false, raison: "echec" });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: `fictif-${randomUUID()}` }), { status: 200 }));
    expect(await envoyer(incertain.artisan)).toMatchObject({ envoye: false, raison: "echec" });
    expect(transport).not.toHaveBeenCalled();
    expect(await notifiee(d1)).toBe(false);
    expect(await q("select etat from public.courriels_durables where contexte_metier->>'id' = $1", [d1])).toEqual([{ etat: "inconnu" }]);

    // Refus définitifs à répétition : un essai par clé, cinq au plus, puis plus aucun appel au service.
    const refuse = await artisan("en_attente", "refuse.toujours@example.invalid");
    const d2 = await decider(refuse.artisan, "refus");
    transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ message: "refus du service" }), { status: 422 }));
    for (let essai = 1; essai <= 5; essai++) expect(await envoyer(refuse.artisan), `essai ${essai}`).toMatchObject({ envoye: false, raison: "echec" });
    expect(transport).toHaveBeenCalledTimes(5);
    expect(await envoyer(refuse.artisan)).toEqual({ envoye: false, raison: "echec", detail: "Le service d’envoi a refusé cet e-mail plusieurs fois." });
    expect(transport).toHaveBeenCalledTimes(5);
    expect((await q<{ etat: string }>("select etat from public.courriels_durables where contexte_metier->>'id' = $1", [d2])).map((l) => l.etat)).toEqual(Array(5).fill("echec"));
    expect(await notifiee(d2)).toBe(false);
  });

  it("un e-mail en file part une fois tant que la décision tient ; remplacée par un nouvel examen, il ne repart pas", async () => {
    const tient = await artisan();
    const d1 = await decider(tient.artisan, "refus");
    await conserverCourriel(service, charge(d1));
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await notifiee(d1)).toBe(true);
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);

    const remplacee = await artisan();
    const d2 = await decider(remplacee.artisan, "refus");
    await conserverCourriel(service, charge(d2));
    await decider(remplacee.artisan, "remise_en_attente", null);
    await reprendre();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await notifiee(d2)).toBe(false);
    expect((await ligne(charge(d2))).etat).not.toBe("accepte");
  });

  it("une preuve refusée dès la conservation : rien ne part vers une adresse qui n'est pas celle de la fiche", async () => {
    const { artisan: a } = await artisan();
    const d = await decider(a, "refus");
    await expect(conserverCourriel(service, charge(d, "intrus@example.invalid"))).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(await notifiee(d)).toBe(false);
  });

  // ── 3. Droits, rejeu, retour ──────────────────────────────────────────────────────────────────────────────────
  it("les têtes ne s'ouvrent qu'au traitement ; l'artisan lit la date de notification de ses décisions, sans pouvoir l'écrire", async () => {
    const droits = await q<{ f: string; anon: boolean; compte: boolean; traitement: boolean }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
             has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('empreinte_metier_courriel','finaliser_courriel_metier','empreinte_avant_decision_artisan','finaliser_avant_decision_artisan')
       order by 1`);
    expect(droits).toEqual([
      { f: "empreinte_avant_decision_artisan", anon: false, compte: false, traitement: false },
      { f: "empreinte_metier_courriel", anon: false, compte: false, traitement: true },
      { f: "finaliser_avant_decision_artisan", anon: false, compte: false, traitement: false },
      { f: "finaliser_courriel_metier", anon: false, compte: false, traitement: true },
    ]);
    expect(await maillonsEnAttente(db)).toEqual([]);

    const mien = await artisan();
    const d = await decider(mien.artisan, "refus");
    const autre = await artisan("en_attente", "autre.artisan@example.invalid");
    await decider(autre.artisan, "refus");
    await en(mien.compteArtisan);
    // L'artisan ne voit que SES décisions, avec leur date de notification (vide ici).
    expect(await q("select id, notifie_le from public.artisan_validations")).toEqual([{ id: d, notifie_le: null }]);
    expect(await refus("update public.artisan_validations set notifie_le = now() where id = $1", [d])).toMatch(/permission denied/);
    await en(superviseur);
    expect(await refus("update public.artisan_validations set notifie_le = now() where id = $1", [d])).toMatch(/permission denied/);
    await enService();
    expect(await notifiee(d)).toBe(false);
  });

  it("la migration se rejoue sans effet ; son retour rend les têtes d'avant, met de côté les e-mails en file, et n'efface ni décision ni date de notification", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const NOMS = ["empreinte_metier_courriel", "finaliser_courriel_metier", "empreinte_avant_decision_artisan", "finaliser_avant_decision_artisan"];
    const etat = async () => q<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname = any($1) order by 1`, [NOMS]);
    const corps = async (nom: string) => (await q<{ c: string }>("select md5(p.prosrc) c from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname=$1", [nom]))[0]?.c;

    // Une décision déjà notifiée (sa date doit survivre au retour) et une autre dont l'e-mail attend en file.
    const notifie = await artisan("en_attente", "deja.notifie@example.invalid");
    const dNotifiee = await decider(notifie.artisan, "refus");
    await db.query("update public.artisan_validations set notifie_le = now() - interval '1 hour' where id = $1", [dNotifiee]);
    const enFile = await artisan();
    const dEnFile = await decider(enFile.artisan, "refus");

    const avec = await etat();
    expect(avec).toHaveLength(4);
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    expect(await maillonsEnAttente(db)).toEqual([]);
    expect(await notifiee(dNotifiee)).toBe(true);

    const p = charge(dEnFile);
    await conserverCourriel(service, p);
    expect(await preuve(ctx(dEnFile))).toMatch(HEX64);

    if (maillonsPlusRecents(NOM).length > 0) {
      await db.query("savepoint hors_ordre");
      await expect(db.query(retour)).rejects.toThrow(REFUS_RETOUR_HORS_ORDRE);
      await db.query("rollback to savepoint hors_ordre");
      expect(await etat()).toEqual(avec);
      await defaireMaillonsPlusRecents(db, NOM);
    }
    const ancienneEmpreinte = await corps("empreinte_avant_decision_artisan");
    const ancienneFinalisation = await corps("finaliser_avant_decision_artisan");

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122210000','decision_artisan_notifiee') on conflict do nothing");
    await db.query(retour);
    const sans = await etat();
    expect(sans.map((f) => f.f)).toEqual(["empreinte_metier_courriel", "finaliser_courriel_metier"]);
    expect(await corps("empreinte_metier_courriel")).toBe(ancienneEmpreinte);
    expect(await corps("finaliser_courriel_metier")).toBe(ancienneFinalisation);
    expect(sans.map((f) => f.d)).toEqual(avec.filter((f) => ["empreinte_metier_courriel", "finaliser_courriel_metier"].includes(f.f)).map((f) => f.d));
    expect((await q("select 1 from supabase_migrations.schema_migrations where version='20261122210000'")).length).toBe(0);
    // Le type n'est plus prouvé ; l'e-mail en file est mis de côté, contenu effacé.
    expect(await preuve(ctx(dEnFile))).toBeNull();
    expect(await ligne(p)).toMatchObject({ finalisation_etat: "a_verifier", reprise_autonome: false, charge_chiffree: null });
    // Rien d'effacé : les deux décisions, leurs motifs, et la date de la notification déjà faite.
    expect(await q("select decision::text d, motif from public.artisan_validations where id = any($1) order by id", [[dNotifiee, dEnFile]])).toHaveLength(2);
    expect(await notifiee(dNotifiee)).toBe(true);
    expect(await notifiee(dEnFile)).toBe(false);
    await db.query(retour);
    expect(await etat()).toEqual(sans);

    await db.query(migration);
    await reposerMaillonsPlusRecents(db, NOM);
    expect(await maillonsEnAttente(db)).toEqual([]);
    const denouveau = await etat();
    expect(denouveau.map((f) => [f.f, f.e, f.d])).toEqual(avec.map((f) => [f.f, f.e, f.d]));
    expect(await preuve(ctx(dEnFile))).toMatch(HEX64);
    expect(await notifiee(dNotifiee)).toBe(true);
  });
});
