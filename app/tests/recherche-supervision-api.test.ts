/**
 * X18 (fiche SA-09), décision du 14/10/2026 — la recherche de la console par référence, de bout en bout.
 *
 * Le vrai chemin : l'action serveur `rechercherDansSupervision` (code réel) → supabase-js, connecté comme un superviseur
 * en second facteur → l'API de test locale (RPC réelles, rôles et privilèges de la vraie base) →
 * `rechercher_reference_supervision` (fonction SQL réelle, qui trace la recherche).
 *
 * Pourquoi (relecture du 15/10) : le client Supabase n'est pas typé ; ni le nom de la fonction, ni son paramètre
 * `p_reference`, ni les colonnes qu'elle rend n'étaient vérifiés ENSEMBLE. L'essai unitaire décrit sa propre forme de
 * ligne, l'essai SQL appelle la fonction directement : une colonne renommée d'un seul côté laissait tout au vert.
 * Cet essai rejoue le constat de l'audit du 13/10 (S-RECHERCHE : « INC-2026-0003 » répondait « Aucun client trouvé ») :
 * un numéro d'incident, un nom de lot, un identifiant de bien mènent à la fiche de l'organisation.
 *
 * Variables (comme les autres essais d'API) : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY et
 * SUPALOCAL_DB. Sans elles, le fichier se saute. Les données d'essai portent une marque tirée au hasard et sont
 * effacées à la fin (traces comprises) : la base d'API sert ensuite aux parcours navigateur.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { totp } from "../e2e/local/mfa-local.mjs";
import { verifierBaseDeTest } from "./garde-base";
import { rechercherDansSupervision } from "@/app/actions/recherche-supervision";

const m = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const base = process.env.SUPALOCAL_DB;
verifierBaseDeTest(base);
const local = (adresse: string | undefined) => !!adresse && ["localhost", "127.0.0.1"].includes(new URL(adresse).hostname);
const actif = Boolean(cle) && local(url) && local(base);

const MARQUE = randomUUID().slice(0, 8);
const NUMERO = `INC-1999-${randomInt(100000, 999999)}`;
const ORGANISATION = `Agence recherche API ${MARQUE}`;
const LOT = `Lot recherche API ${MARQUE}`;
const TYPES_DOSSIER = ["Bien", "Lot", "Incident"];

describe.skipIf(!actif)("X18 — la recherche de la console retrouve un dossier par sa référence (API de test locale)", () => {
  const sql = new Client({ connectionString: base });
  let superviseur: SupabaseClient;
  let compte = "";
  let facteur = "";
  let org = "";
  let bien = "";

  beforeAll(async () => {
    await sql.connect();
    // Un superviseur à lui, élevé en second facteur par le SDK réel (comme tests/mfa-api.test.ts).
    compte = randomUUID();
    const motDePasse = randomUUID();
    const email = `recherche-x18-${compte}@test.local`;
    await sql.query(
      "insert into auth.users (id, email, encrypted_password, email_confirmed_at) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')), now())",
      [compte, email, motDePasse]
    );
    await sql.query("insert into public.memberships (account_id, role, status) values ($1, 'super_admin', 'active')", [compte]);
    superviseur = createClient(url!, cle!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await superviseur.auth.signInWithPassword({ email, password: motDePasse })).error).toBeNull();
    const inscription = await superviseur.auth.mfa.enroll({ factorType: "totp", friendlyName: "Essai X18" });
    expect(inscription.error).toBeNull();
    facteur = inscription.data!.id;
    expect((await superviseur.auth.mfa.challengeAndVerify({ factorId: facteur, code: totp(inscription.data!.totp.secret) })).error).toBeNull();
    expect((await superviseur.rpc("is_super_admin")).data).toBe(true);
    m.createClient.mockResolvedValue(superviseur);

    ({ rows: [{ id: org }] } = await sql.query("insert into public.organizations (name, status) values ($1, 'active') returning id", [ORGANISATION]));
    ({ rows: [{ id: bien }] } = await sql.query(
      "insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1, $2, 'appartement', '3 rue de l''Essai', '75011', 'Paris') returning id",
      [org, `Résidence recherche API ${MARQUE}`]
    ));
    const { rows: [{ id: lot }] } = await sql.query("insert into public.lots (organization_id, bien_id, nom) values ($1, $2, $3) returning id", [org, bien, LOT]);
    await sql.query(
      "insert into public.incidents (organization_id, numero, lot_id, canal, categorie, description) values ($1, $2, $3, 'agence', 'autre', 'Essai de recherche') returning id",
      [org, NUMERO, lot]
    );
  });

  afterAll(async () => {
    if (facteur) await superviseur?.auth.mfa.unenroll({ factorId: facteur });
    await superviseur?.auth.signOut({ scope: "local" });
    if (compte) await sql.query("delete from public.audit_log where account_id = $1", [compte]);
    if (org) {
      await sql.query("delete from public.incidents where organization_id = $1", [org]);
      await sql.query("delete from public.lots where organization_id = $1", [org]);
      await sql.query("delete from public.biens where organization_id = $1", [org]);
      await sql.query("delete from public.organizations where id = $1", [org]);
    }
    if (compte) {
      await sql.query("delete from public.memberships where account_id = $1", [compte]);
      await sql.query("delete from auth.users where id = $1", [compte]);
    }
    await sql.end();
  });

  const dossiers = (r: Awaited<ReturnType<typeof rechercherDansSupervision>>) => r.resultats.filter((x) => TYPES_DOSSIER.includes(x.type));

  it("un numéro d'incident (casse indifférente) : un résultat « Incident », en tête, qui ouvre la fiche de l'organisation", async () => {
    const r = await rechercherDansSupervision(`  ${NUMERO.toLowerCase()} `);
    expect(r.erreur).toBeUndefined();
    expect(r.remarque).toBeUndefined();
    expect(r.resultats[0]).toEqual({
      id: org,
      type: "Incident",
      titre: ORGANISATION,
      detail: "Un incident de cette organisation porte cette référence · ouvrir la fiche de l’organisation",
      href: `/admin/organisations/${org}`,
    });
    expect(dossiers(r)).toHaveLength(1);
    // La recherche est tracée par la base, dans la même transaction que sa lecture.
    const { rows } = await sql.query("select organization_id, details from public.audit_log where account_id = $1 and action = 'recherche_reference'", [compte]);
    expect(rows).toContainEqual({ organization_id: org, details: expect.objectContaining({ forme: "numero", reference: NUMERO, resultats: 1, organisations: [org] }) });
  });

  it("un nom de lot et un identifiant de bien retrouvent la même organisation", async () => {
    const parLot = await rechercherDansSupervision(LOT.toUpperCase());
    expect(parLot.erreur).toBeUndefined();
    expect(dossiers(parLot).map((x) => [x.type, x.titre, x.href])).toEqual([["Lot", ORGANISATION, `/admin/organisations/${org}`]]);
    const parBien = await rechercherDansSupervision(bien);
    expect(parBien.erreur).toBeUndefined();
    expect(dossiers(parBien).map((x) => [x.type, x.titre, x.href])).toEqual([["Bien", ORGANISATION, `/admin/organisations/${org}`]]);
  });

  it("une référence partielle ne trouve aucun dossier, sans erreur", async () => {
    const r = await rechercherDansSupervision(NUMERO.slice(0, -1));
    expect(r.erreur).toBeUndefined();
    expect(dossiers(r)).toEqual([]);
  });
});
