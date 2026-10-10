import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const origine = process.env.NEXT_PUBLIC_SUPABASE_URL;
const local = origine && ["localhost", "127.0.0.1"].includes(new URL(origine).hostname);

// Le banc local seul : aucun compte ni mot de passe de production.
describe.skipIf(!local)("RPC de l'émulateur — filtres et comptage PostgREST", () => {
  let client: SupabaseClient;
  let org: string;
  beforeAll(async () => {
    client = createClient(origine!, "cle-locale", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: "agent.alpha@gerimmo-demo.fr", password: "Gerimmo-Demo-2026" });
    expect(error).toBeNull();
    const { data, error: erreur } = await client.from("memberships").select("organization_id").eq("role", "agent").eq("account_id", (await client.auth.getUser()).data.user!.id).single();
    expect(erreur).toBeNull();
    org = data!.organization_id;
  });
  it("HEAD transmet les arguments dans l'URL et compte sans renvoyer le corps", async () => {
    const post = await client.rpc("documents_courants", { p_org: org }, { count: "exact" });
    const head = await client.rpc("documents_courants", { p_org: org }, { count: "exact", head: true });
    expect(post.error).toBeNull();
    expect(head.error).toBeNull();
    expect(head.data).toBeNull();
    expect(head.count).toBe(post.data.length);
    expect(post.count).toBe(head.count);
  });
  it("compte avant pagination, avec les mêmes filtres en GET et POST", async () => {
    const tous = await client.rpc("documents_courants", { p_org: org }, { get: true, count: "exact" });
    const limite = await client.rpc("documents_courants", { p_org: org }, { count: "exact" }).limit(1);
    const vide = await client.rpc("documents_courants", { p_org: org }, { head: true, count: "exact" }).eq("titre", "titre inexistant regression RPC");
    expect(tous.error).toBeNull();
    expect(limite.error).toBeNull();
    expect(limite.count).toBe(tous.data.length);
    expect(limite.data.length).toBeLessThanOrEqual(1);
    expect(vide.error).toBeNull();
    expect(vide.count).toBe(0);
  });
  it("conserve l'isolation de l'organisation", async () => {
    const r = await client.rpc("documents_courants", { p_org: "00000000-0000-4000-8000-000000000001" }, { head: true, count: "exact" });
    expect(r.error).toBeNull();
    expect(r.count).toBe(0);
  });
});
