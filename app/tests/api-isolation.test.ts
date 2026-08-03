/**
 * Tests d'intégration — isolation à travers la VRAIE pile d'accès
 * (Supabase Auth + PostgREST + RLS). C'est le chemin qu'emprunte l'application
 * déployée : ce que ces tests prouvent, l'application le garantit.
 *
 * Ils vérifient la RÈGLE (RM-A1.7 : aucune agence ne voit les données d'une
 * autre), pas l'inventaire d'un jeu de données. Une version précédente
 * comparait des noms de fiches en dur — elle tombait en rouge dès qu'on changeait
 * d'environnement, alors que l'étanchéité était intacte.
 *
 * Comptes : par défaut ceux du seed de démo (app/supabase/seed.sql). Sur un autre
 * environnement, les redéfinir dans .env.local :
 *   TEST_ADMIN_A, TEST_ADMIN_B, TEST_MULTI, TEST_SUPERADMIN, TEST_MOT_DE_PASSE
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const ADMIN_A = process.env.TEST_ADMIN_A ?? "admin.alpha@gerimmo-demo.fr";
const ADMIN_B = process.env.TEST_ADMIN_B ?? "admin.beta@gerimmo-demo.fr";
const MULTI = process.env.TEST_MULTI ?? "multi@gerimmo-demo.fr";
const SUPERADMIN = process.env.TEST_SUPERADMIN ?? "superadmin@gerimmo-demo.fr";
const MOT_DE_PASSE = process.env.TEST_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";

function client(): SupabaseClient {
  return createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function connecte(email: string): Promise<SupabaseClient> {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password: MOT_DE_PASSE });
  expect(
    error,
    `connexion ${email} : ${error?.message}. Comptes attendus absents de cet ` +
      `environnement ? Renseignez TEST_ADMIN_A / TEST_ADMIN_B / TEST_MULTI / ` +
      `TEST_SUPERADMIN / TEST_MOT_DE_PASSE dans .env.local.`
  ).toBeNull();
  return c;
}

async function nomsDesFiches(c: SupabaseClient): Promise<string[]> {
  const { data } = await c.from("persons").select("id");
  return (data ?? []).map((p) => p.id as string);
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

  it("chaque admin ne voit que sa propre agence", async () => {
    const a = await connecte(ADMIN_A);
    const b = await connecte(ADMIN_B);
    clients.push(a, b);

    const { data: orgsA } = await a.from("organizations").select("id, name");
    const { data: orgsB } = await b.from("organizations").select("id, name");
    expect(orgsA, `${ADMIN_A} devrait voir exactement une agence`).toHaveLength(1);
    expect(orgsB, `${ADMIN_B} devrait voir exactement une agence`).toHaveLength(1);
    expect(orgsA![0].id).not.toBe(orgsB![0].id);
  });

  it("aucune fiche n'est visible des deux côtés à la fois", async () => {
    const a = await connecte(ADMIN_A);
    const b = await connecte(ADMIN_B);
    clients.push(a, b);

    // Le cœur de la règle : l'intersection doit être vide. On compare les
    // identifiants, pas les noms — deux « Dupont » dans deux agences sont deux
    // personnes différentes et n'ont rien d'une fuite.
    const idsA = new Set(await nomsDesFiches(a));
    const idsB = await nomsDesFiches(b);
    expect(idsA.size, "l'agence A n'a aucune fiche : test sans valeur").toBeGreaterThan(0);
    expect(idsB.length, "l'agence B n'a aucune fiche : test sans valeur").toBeGreaterThan(0);
    const communes = idsB.filter((id) => idsA.has(id));
    expect(communes, "fiches visibles des deux agences").toHaveLength(0);
  });

  it("un compte présent dans deux agences voit ses deux adhésions", async () => {
    const c = await connecte(MULTI);
    clients.push(c);

    const { data: user } = await c.auth.getUser();
    const { data: adhesions } = await c
      .from("memberships")
      .select("role, organization_id")
      .eq("account_id", user.user!.id)
      .eq("status", "active");

    expect(adhesions?.length ?? 0).toBeGreaterThanOrEqual(2);
    const agences = new Set((adhesions ?? []).map((a) => a.organization_id));
    expect(agences.size, "les deux adhésions devraient viser deux agences").toBeGreaterThanOrEqual(2);
  });

  it("le super admin voit toutes les agences", async () => {
    const sa = await connecte(SUPERADMIN);
    const a = await connecte(ADMIN_A);
    clients.push(sa, a);

    const { data: toutes } = await sa.from("organizations").select("id");
    const { data: sienne } = await a.from("organizations").select("id");
    expect((toutes ?? []).length).toBeGreaterThan((sienne ?? []).length);
  });

  it("un admin ne peut pas créer de fiche chez une autre agence", async () => {
    const sa = await connecte(SUPERADMIN);
    const a = await connecte(ADMIN_A);
    clients.push(sa, a);

    const { data: sienne } = await a.from("organizations").select("id");
    const { data: toutes } = await sa.from("organizations").select("id");
    const autre = (toutes ?? []).find((o) => o.id !== sienne![0].id);
    expect(autre, "il faut au moins deux agences pour ce test").toBeDefined();

    const { error } = await a
      .from("persons")
      .insert({ organization_id: autre!.id, nom: "Intrus" });
    expect(error, "l'écriture transverse aurait dû être refusée").not.toBeNull();
  });
});

if (!URL || !KEY) {
  console.warn(
    "⚠ Variables NEXT_PUBLIC_SUPABASE_* absentes : tests d'intégration API ignorés."
  );
}
