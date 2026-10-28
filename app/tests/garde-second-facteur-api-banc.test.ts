/**
 * Audit final, seconde relecture du 28/10/2026 (PUB-01) — rejeu PAR L'API du banc : le mot de passe seul n'ouvre plus
 * rien d'un compte qui a activé sa double authentification, y compris par les fonctions SECURITY DEFINER.
 *
 * Constat rejoué (relecture, rpc-aal1 / fuites / ecritures) : avec un jeton aal1, un compte à facteur vérifié lisait
 * mon_echeancier_locataire, quittance_detail, quittance_document, export_artisan_plateforme, et declarer_reception_loyer
 * créait un encaissement. La garde centrale (exiger_second_facteur, pré-requête de PostgREST, que l'émulateur appelle
 * comme PostgREST) les refuse en 403. Pour chaque persona : (1) sans facteur, en aal1 : les réponses de référence ;
 * (2) facteur activé, session aal2 : les mêmes réponses ; (3) mot de passe seul (aal1) : 403 partout, sauf les
 * adhésions et la session lues par le sas. Les écritures sont éprouvées sur un appel de loyer et une organisation qui
 * n'existent pas ou n'appartiennent pas au compte : la réponse de la fonction elle-même prouve que la garde l'a laissée
 * passer, sans rien écrire sur le banc. Le facteur est retiré à la fin (session aal2).
 *
 * Ne s'exécute que sur le banc : SIGNATURE_TEST_API_URL (l'émulateur) et SIGNATURE_TEST_DB_URL (sa base, pour retrouver
 * les identifiants des données de parcours). Classé en série (vitest.config.ts) : un compte des données de parcours
 * porte un facteur pendant le fichier, aucun autre fichier ne doit se connecter avec lui en même temps.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totp } from "../e2e/local/mfa-local.mjs";

const api = process.env.SIGNATURE_TEST_API_URL ?? "";
const baseDuBanc = process.env.SIGNATURE_TEST_DB_URL ?? "";
const local = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(api) && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/].*ci_/.test(baseDuBanc);
const CLE_PUBLIQUE = "cle-locale";
const MOT_DE_PASSE = "Gerimmo-Demo-2026";

type Reponse = { status: number; data: unknown; error: { code?: string; message?: string } | null };
type Appel = { nom: string; faire: (c: SupabaseClient) => Promise<Reponse>; ecriture?: boolean };

const nouveauClient = () => createClient(api, CLE_PUBLIQUE, { auth: { persistSession: false, autoRefreshToken: false } });
async function connecter(email: string) {
  const c = nouveauClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password: MOT_DE_PASSE });
  if (error || !data.session) throw new Error(`${email} : ${error?.message}`);
  return { client: c, jeton: data.session.access_token };
}
const aal = (jeton: string) => JSON.parse(Buffer.from(jeton.split(".")[1], "base64url").toString()).aal;
const resume = (r: Reponse) => ({ status: r.status, code: r.error?.code ?? null, data: r.error ? null : r.data });
async function graphql(jeton: string) {
  const r = await fetch(`${api}/graphql/v1`, {
    method: "POST",
    headers: { apikey: CLE_PUBLIQUE, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
  });
  return { status: r.status, corps: await r.json() as { code?: string; message?: string } };
}

describe.skipIf(!local)("garde centrale du second facteur, par l'API du banc (PUB-01, seconde relecture)", () => {
  let db: Client;
  const plans: Record<string, Appel[]> = {};
  const aRetirer: { client: SupabaseClient; facteur: string }[] = [];

  beforeAll(async () => {
    db = new Client({ connectionString: baseDuBanc });
    await db.connect();
    const orgDe = async (email: string, role: string) => (await db.query(
      `select m.organization_id from public.memberships m join auth.users u on u.id = m.account_id
        where u.email = $1 and m.role = $2 and m.status = 'active' order by m.created_at limit 1`, [email, role])).rows[0]?.organization_id as string;
    const alpha = await orgDe("locataire.alpha@example.com", "locataire");
    const parc = await orgDe("proprietaire@example.com", "proprietaire_direct");
    expect(alpha && parc).toBeTruthy();
    // La quittance du locataire : la première de son échéancier, lue sans facteur (le compte n'en a pas encore).
    const { client } = await connecter("locataire.alpha@example.com");
    const echeancier = await client.rpc("mon_echeancier_locataire", { p_org: alpha });
    const quittance = ((echeancier.data ?? []) as { quittance_id: string | null }[]).find((l) => l.quittance_id)?.quittance_id;
    expect(quittance, "une quittance émise dans les données de parcours").toBeTruthy();
    plans["locataire.alpha@example.com"] = [
      { nom: "mon_echeancier_locataire", faire: (c) => c.rpc("mon_echeancier_locataire", { p_org: alpha }) },
      { nom: "quittance_detail", faire: (c) => c.rpc("quittance_detail", { p_quittance: quittance }) },
      { nom: "quittance_document", faire: (c) => c.rpc("quittance_document", { p_quittance: quittance }) },
    ];
    plans["artisan.alpha@example.com"] = [
      { nom: "export_artisan_plateforme", faire: (c) => c.rpc("export_artisan_plateforme") },
    ];
    plans["proprietaire@example.com"] = [
      { nom: "table lots", faire: (c) => c.from("lots").select("id").eq("organization_id", parc).order("id") },
      { nom: "perimetre_persons_gerant", faire: (c) => c.rpc("perimetre_persons_gerant", { p_org: parc }) },
      // Écritures, sur un appel inexistant / un espace dont le compte n'est pas titulaire : la fonction répond elle-même.
      { nom: "declarer_reception_loyer", ecriture: true, faire: (c) => c.rpc("declarer_reception_loyer", { p_org: parc, p_appel: randomUUID(), p_reponse: "recu", p_montant: 640, p_date: "2026-10-05", p_mode: "virement", p_cle: randomUUID(), p_reste_attendu: 640 }) },
      { nom: "demander_export_complet", ecriture: true, faire: (c) => c.rpc("demander_export_complet", { p_org: alpha }) },
    ];
  });
  afterAll(async () => {
    for (const { client, facteur } of aRetirer) await client.auth.mfa.unenroll({ factorId: facteur });
    await db?.end();
  });

  for (const email of ["locataire.alpha@example.com", "artisan.alpha@example.com", "proprietaire@example.com"]) {
    it(`${email} : sans facteur et en aal2, inchangé ; mot de passe seul avec facteur, 403 partout sauf le sas`, async () => {
      const appels = plans[email];
      // (1) Sans facteur : la référence.
      const sans = await connecter(email);
      expect((await sans.client.auth.getUser()).data.user?.factors?.filter((f) => f.status === "verified") ?? [], "le compte n'a pas encore de facteur").toEqual([]);
      const reference = await Promise.all(appels.map(async (a) => resume(await a.faire(sans.client))));
      for (const [i, a] of appels.entries()) {
        if (a.ecriture) expect(reference[i].status, `${a.nom} sans facteur`).not.toBe(403);
        else expect(reference[i], `${a.nom} sans facteur`).toMatchObject({ status: 200, code: null });
      }
      // (2) Le titulaire active son facteur : session aal2, mêmes réponses.
      const inscription = await sans.client.auth.mfa.enroll({ factorType: "totp" });
      if (inscription.error) throw inscription.error;
      const verification = await sans.client.auth.mfa.challengeAndVerify({ factorId: inscription.data.id, code: totp(inscription.data.totp.secret) });
      if (verification.error) throw verification.error;
      aRetirer.push({ client: sans.client, facteur: inscription.data.id });
      const titulaire = (await sans.client.auth.getSession()).data.session!;
      expect(aal(titulaire.access_token)).toBe("aal2");
      for (const [i, a] of appels.entries()) expect(resume(await a.faire(sans.client)), `${a.nom} en aal2`).toEqual(reference[i]);
      expect((await graphql(titulaire.access_token)).status, "GraphQL en aal2 : la garde laisse passer (pg_graphql absent du banc ⇒ 404)").toBe(404);
      // (3) Le mot de passe seul : aal1, tout est refusé.
      const voleur = await connecter(email);
      expect(aal(voleur.jeton)).toBe("aal1");
      for (const a of appels) {
        const r = await a.faire(voleur.client);
        expect({ nom: a.nom, status: r.status, code: r.error?.code, message: r.error?.message?.slice(0, 22) })
          .toEqual({ nom: a.nom, status: 403, code: "42501", message: "Second facteur requis " });
      }
      const g = await graphql(voleur.jeton);
      expect({ status: g.status, code: g.corps.code }).toEqual({ status: 403, code: "42501" });
      // Le sas lit encore les adhésions du compte (les siennes seulement) et sa session.
      const adhesions = await voleur.client.from("memberships").select("role, account_id");
      expect(adhesions.status).toBe(200);
      const moi = (await voleur.client.auth.getUser()).data.user!.id;
      expect((adhesions.data ?? []).length).toBeGreaterThan(0);
      expect((adhesions.data ?? []).every((m) => m.account_id === moi)).toBe(true);
      expect((await voleur.client.rpc("ma_session_active")).status).toBe(200);
    });
  }

  it("aucune écriture n'a eu lieu en aal1 : ni encaissement, ni archive", async () => {
    const { rows } = await db.query(
      `select (select count(*)::int from public.encaissements where created_at > now() - interval '10 minutes' and montant = 640) as encaissements,
              (select count(*)::int from public.exports_complets where demande_le > now() - interval '10 minutes') as archives`);
    expect(rows[0]).toEqual({ encaissements: 0, archives: 0 });
  });
});
