import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { preuveEmailRecente } from "../src/lib/autorisation-nouveau-mot-de-passe";

const endpoint = process.env.GERIMMO_AUTH_REEL_URL;
const connexion = process.env.GERIMMO_AUTH_REEL_DB;
if (endpoint && (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint) || !connexion || !/^postgres(?:ql)?:\/\/postgres@127\.0\.0\.1:\d+\/gerimmo_ci_auth_[a-z]+$/.test(connexion))) {
  throw new Error("Ce banc exige un service Auth et une base fictive locaux.");
}

describe.skipIf(!endpoint)("récupération — Auth réel local", () => {
  const identifiants: string[] = [];
  const db = new Client({ connectionString: connexion });
  const cle = process.env.GERIMMO_AUTH_REEL_SERVICE ?? "";
  const password = `Fictif-A9-${randomUUID()}`;
  const client = () => createClient(endpoint!, cle, { global: { fetch: (input, init) => fetch(String(input).replace("/auth/v1/", "/"), init) }, auth: { autoRefreshToken: false, persistSession: false } });
  const service = endpoint ? client() : null;
  beforeAll(async () => { await db.connect(); });
  afterAll(async () => {
    for (const id of identifiants) await service!.auth.admin.deleteUser(id);
    await db.end();
  });

  it("conserve la date de la preuve au renouvellement et permet une nouvelle récupération", async () => {
    const email = [`recette-${randomUUID()}`, "example.invalid"].join("@");
    const compte = await service!.auth.admin.createUser({ email, password, email_confirm: true });
    expect(compte.error).toBeNull();
    identifiants.push(compte.data.user!.id);
    const session = client();
    const ordinaire = await session.auth.signInWithPassword({ email, password });
    expect(ordinaire.error).toBeNull();
    expect(preuveEmailRecente((await session.auth.getClaims()).data!.claims.amr)).toBe(false);
    const ouvrirLien = async () => {
      const lien = await service!.auth.admin.generateLink({ type: "recovery", email });
      expect(lien.error).toBeNull();
      const verification = await session.auth.verifyOtp({ type: "recovery", token_hash: lien.data.properties!.hashed_token });
      expect(verification.error).toBeNull();
      return (await session.auth.getClaims()).data!.claims;
    };
    const recentes = await ouvrirLien();
    expect(preuveEmailRecente(recentes.amr)).toBe(true);
    const vieillies = await db.query("update auth.mfa_amr_claims set created_at=now()-interval '20 minutes', updated_at=now()-interval '20 minutes' where session_id=$1 and authentication_method in ('recovery','otp')", [recentes.session_id]);
    expect(vieillies.rowCount).toBeGreaterThan(0);
    expect((await session.auth.refreshSession()).error).toBeNull();
    const anciennes = (await session.auth.getClaims()).data!.claims;
    expect(anciennes.session_id).toBe(recentes.session_id);
    expect(preuveEmailRecente(anciennes.amr)).toBe(false);
    expect(preuveEmailRecente((await ouvrirLien()).amr)).toBe(true);
    expect((await session.auth.updateUser({ password: `${password}-suite` })).error).toBeNull();
  });
});
