import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { rechercherDansEspace } from "@/app/actions/recherche-espace";
const m = vi.hoisted(() => ({ acces: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: m.acces }));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
describe.skipIf(!url || !cle)("Recherche étendue par l’API locale", () => {
  const clients: SupabaseClient[] = [];
  beforeAll(() => { expect(new URL(url!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/); });
  afterEach(async () => { for (const c of clients) await c.auth.signOut(); clients.length = 0; });
  it.each(["admin.alpha", "agent.alpha"])("exécute toutes les recherches sans erreur pour %s", async compte => {
    const db = createClient(url!, cle!, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(db);
    const auth = await db.auth.signInWithPassword({ email: `${compte}@gerimmo-demo.fr`, password: "Gerimmo-Demo-2026" });
    expect(auth.error).toBeNull();
    const role = compte.startsWith("admin") ? "admin_agence" : "agent";
    const org = await db.from("memberships").select("organization_id").eq("account_id", auth.data.user!.id).eq("role", role).limit(1).single();
    expect(org.error).toBeNull();
    m.acces.mockResolvedValue({ supabase: db, user: auth.data.user, role });
    for (const texte of ["rapport", "400", "plomb", "virement", "INC-2026-0001", "zzzz_aucun_document_92718"]) {
      const r = await rechercherDansEspace(org.data!.organization_id, texte);
      expect(r.erreur, `${role} / ${texte}`).toBeUndefined();
      expect(r.resultats.every(x => x.href.startsWith(`/agence/${org.data!.organization_id}/`))).toBe(true);
      expect(r.resultats.length).toBeLessThanOrEqual(42);
      if (texte.startsWith("zzzz_")) expect(r.resultats).toEqual([]);
    }
  });
});
