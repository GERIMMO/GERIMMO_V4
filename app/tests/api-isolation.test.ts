/**
 * Tests d'intégration — isolation à travers la VRAIE pile d'accès
 * (Supabase Auth + PostgREST + RLS), avec les comptes de démo.
 * C'est le chemin qu'emprunte l'application déployée.
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (.env.local) ainsi que le seed de démo (app/supabase/seed.sql).
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const MOT_DE_PASSE_DEMO = "Gerimmo-Demo-2026";

function client(): SupabaseClient {
  return createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function connecte(email: string): Promise<SupabaseClient> {
  const c = client();
  const { error } = await c.auth.signInWithPassword({
    email,
    password: MOT_DE_PASSE_DEMO,
  });
  expect(error, `connexion ${email} : ${error?.message}`).toBeNull();
  return c;
}

describe.skipIf(!URL || !KEY)("API — isolation multi-agences (RM-A1.7)", () => {
  const clients: SupabaseClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.map((c) => c.auth.signOut()));
    clients.length = 0;
  });

  it("un visiteur anonyme ne lit aucune table du socle ni du Sprint 1", async () => {
    const c = client();
    for (const table of [
      "organizations",
      "accounts",
      "persons",
      "memberships",
      "audit_log",
      "documents",
      "document_liens",
      "alerts",
      "retention_rules",
      "tech_log",
      "acces_pieces_log",
      "purge_fichiers",
    ]) {
      const { data } = await c.from(table).select("*");
      expect(data ?? [], `fuite sur ${table}`).toHaveLength(0);
    }
  });

  it("l'admin d'Alpha ne voit qu'Alpha et ses fiches", async () => {
    const c = await connecte("admin.alpha@gerimmo-demo.fr");
    clients.push(c);

    const { data: orgs } = await c.from("organizations").select("name");
    expect(orgs?.map((o) => o.name)).toEqual(["Agence Alpha"]);

    const { data: fiches } = await c.from("persons").select("nom");
    const noms = fiches?.map((p) => p.nom) ?? [];
    // Isolation (RM-A1.7) : la fiche seed d'Alpha est visible, aucune fiche de
    // Beta ne fuit. Tolérant aux fiches de démo ajoutées en recette : on teste
    // l'étanchéité entre agences, pas le contenu exact du seed.
    expect(noms).toContain("Dupont"); // fiche d'Alpha (seed)
    expect(noms).not.toContain("Martin"); // fiche de Beta — ne doit jamais fuiter
  });

  it("l'admin de Beta ne voit que Beta et ses fiches", async () => {
    const c = await connecte("admin.beta@gerimmo-demo.fr");
    clients.push(c);

    const { data: orgs } = await c.from("organizations").select("name");
    expect(orgs?.map((o) => o.name)).toEqual(["Agence Beta"]);

    const { data: fiches } = await c.from("persons").select("nom");
    const noms = fiches?.map((p) => p.nom) ?? [];
    // Même principe que ci-dessus : on vérifie l'étanchéité, pas l'inventaire
    // exact du jeu de démo, qui bouge au fil des recettes.
    expect(noms).toContain("Martin"); // fiche de Beta (seed)
    for (const alpha of ["Dupont", "Leblanc", "Le", "Testeur", "Moreau"]) {
      expect(noms).not.toContain(alpha); // aucune fiche d'Alpha ne fuite
    }
  });

  it("le compte multi voit ses deux adhésions (sélecteur d'espaces)", async () => {
    const c = await connecte("multi@gerimmo-demo.fr");
    clients.push(c);

    const { data: user } = await c.auth.getUser();
    const { data: adhesions } = await c
      .from("memberships")
      .select("role, organization:organizations(name)")
      .eq("account_id", user.user!.id)
      .eq("status", "active");
    const resume = (adhesions ?? [])
      .map((a) => `${a.role}@${(a.organization as unknown as { name: string }).name}`)
      .sort();
    expect(resume).toEqual(["admin_agence@Agence Beta", "agent@Agence Alpha"]);
  });

  it("le super admin voit toutes les agences ; un compte d'agence ne peut pas écrire chez l'autre", async () => {
    const sa = await connecte("superadmin@gerimmo-demo.fr");
    clients.push(sa);
    const { data: orgs } = await sa.from("organizations").select("name");
    expect(orgs?.map((o) => o.name).sort()).toEqual(["Agence Alpha", "Agence Beta"]);

    // Tentative d'écriture transverse : l'admin d'Alpha essaie de créer une
    // fiche chez Beta — la RLS doit refuser.
    const beta = orgs!.find((o) => o.name === "Agence Beta");
    const { data: betaId } = await sa
      .from("organizations")
      .select("id")
      .eq("name", "Agence Beta")
      .single();
    expect(beta).toBeDefined();

    const alpha = await connecte("admin.alpha@gerimmo-demo.fr");
    clients.push(alpha);
    const { error } = await alpha
      .from("persons")
      .insert({ organization_id: betaId!.id, nom: "Intrus" });
    expect(error, "l'écriture transverse aurait dû être refusée").not.toBeNull();
  });
});

if (!URL || !KEY) {
  console.warn(
    "⚠ Variables NEXT_PUBLIC_SUPABASE_* absentes : tests d'intégration API ignorés."
  );
}
