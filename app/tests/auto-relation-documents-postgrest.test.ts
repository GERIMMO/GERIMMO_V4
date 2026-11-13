import { createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indicesDuCode } from "./indices-jointure";

/**
 * G-02 (recette du 11/11/2026) — sens de l'auto-relation « versions » des documents.
 * `documents!remplace_id(…)` doit rendre, pour un document, les documents qui le remplacent (un-à-plusieurs) ;
 * `documents!documents_remplace_id_fkey(…)` est refusé par PostgREST (PGRST200).
 *
 * Deux moteurs, mêmes attentes :
 * - l'émulateur du banc local (NEXT_PUBLIC_SUPABASE_URL sur 127.0.0.1) ;
 * - un VRAI PostgREST, de la version de production (14.5), branché sur la même base que l'émulateur :
 *   POSTGREST_REEL_URL (ex. http://127.0.0.1:3901) et POSTGREST_REEL_JWT_SECRET (son « jwt-secret »).
 *   Sans ces variables, la partie « PostgREST réel » est sautée : la CI n'a pas encore ce binaire.
 * Les documents fictifs sont écrits puis effacés dans la base de l'émulateur (SUPALOCAL_DB).
 */
const emulateur = process.env.NEXT_PUBLIC_SUPABASE_URL;
const local = Boolean(emulateur && ["127.0.0.1", "localhost"].includes(new URL(emulateur).hostname));
const baseApi = process.env.SUPALOCAL_DB;
const reel = process.env.POSTGREST_REEL_URL;
const secretReel = process.env.POSTGREST_REEL_JWT_SECRET;
const DEMO = { email: "proprietaire@example.com", motDePasse: "Gerimmo-Demo-2026" };

type Ligne = { id: string; versions: { id: string }[] };
const jwt = (claims: Record<string, unknown>) => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${corps}.${createHmac("sha256", secretReel!).update(corps).digest("base64url")}`;
};

describe.skipIf(!local || !baseApi)("auto-relation des versions de documents", () => {
  const ids = { v1: randomUUID(), v2: randomUUID() };
  let compte = "", organisation = "";
  beforeAll(async () => {
    const db = new Client({ connectionString: baseApi });
    await db.connect();
    try {
      const r = await db.query("select u.id, m.organization_id from auth.users u join public.memberships m on m.account_id = u.id where u.email = $1 and m.organization_id is not null limit 1", [DEMO.email]);
      [compte, organisation] = [r.rows[0].id, r.rows[0].organization_id];
      const fichier = (n: string) => [`audit-g02/${n}.pdf`, "application/pdf", 10, n.repeat(64).slice(0, 64)];
      await db.query("insert into public.documents(id, organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte) values ($1, $2, 'autre', 'G-02 version 1', $3, $4, $5, $6)", [ids.v1, organisation, ...fichier("a")]);
      await db.query("insert into public.documents(id, organization_id, type, titre, remplace_id, storage_path, mime_type, taille_octets, empreinte) values ($1, $2, 'autre', 'G-02 version 2', $3, $4, $5, $6, $7)", [ids.v2, organisation, ids.v1, ...fichier("b")]);
    } finally { await db.end(); }
  });
  afterAll(async () => {
    const db = new Client({ connectionString: baseApi });
    await db.connect();
    try { await db.query("delete from public.documents where id = any($1)", [[ids.v2, ids.v1]]); } finally { await db.end(); }
  });

  const verifier = (lire: (select: string) => Promise<{ data: Ligne[] | null; error: { code?: string } | null }>) => async () => {
    const refuse = await lire("id,versions:documents!documents_remplace_id_fkey(id)");
    expect(refuse.error?.code).toBe("PGRST200");
    const r = await lire("id,versions:documents!remplace_id(id)");
    expect(r.error).toBeNull();
    const parId = new Map((r.data ?? []).map(l => [l.id, l.versions.map(v => v.id)]));
    expect(parId.get(ids.v1)).toEqual([ids.v2]);
    expect(parId.get(ids.v2)).toEqual([]);
  };

  it("émulateur du banc : indice par nom refusé, indice par colonne = versions qui remplacent le document", verifier(async select => {
    const db = createClient(emulateur!, "cle-locale", { auth: { persistSession: false } });
    expect((await db.auth.signInWithPassword({ email: DEMO.email, password: DEMO.motDePasse })).error).toBeNull();
    return await db.from("documents").select(select).in("id", [ids.v1, ids.v2]) as never;
  }));

  it.skipIf(!reel || !secretReel)("PostgREST réel : mêmes résultats", verifier(async select => {
    const reponse = await fetch(`${reel}/documents?select=${encodeURIComponent(select)}&id=in.(${ids.v1},${ids.v2})`,
      { headers: { Authorization: `Bearer ${jwt({ role: "authenticated", aud: "authenticated", sub: compte })}` } });
    const corps = await reponse.json();
    return reponse.ok ? { data: corps, error: null } : { data: null, error: corps };
  }));

  it.skipIf(!reel || !secretReel)("PostgREST réel : chaque indice de jointure du code est résolu", async () => {
    const ecarts: string[] = [];
    for (const { cible, indice, fichiers } of indicesDuCode()) {
      const db = new Client({ connectionString: baseApi });
      await db.connect();
      let bases: string[];
      try {
        bases = (await db.query<{ base: string }>(`select distinct case when c.conrelid = c.confrelid then s.relname
              when t.relname = $1 then s.relname else t.relname end as base
            from pg_constraint c join pg_class s on s.oid = c.conrelid join pg_class t on t.oid = c.confrelid
            where c.contype = 'f' and c.connamespace = 'public'::regnamespace and (s.relname = $1 or t.relname = $1)
              and (c.conname = $2 or (select a.attname from pg_attribute a where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) = $2)`, [cible, indice])).rows.map(r => r.base);
      } finally { await db.end(); }
      if (!bases.length) { ecarts.push(`${cible}!${indice} : aucune relation (${fichiers.join(", ")})`); continue; }
      for (const base of bases) {
        const r = await fetch(`${reel}/${base}?select=${encodeURIComponent(`x:${cible}!${indice}(*)`)}&limit=0`, { headers: { Authorization: `Bearer ${jwt({ role: "service_role" })}` } });
        if (!r.ok) ecarts.push(`${base} → ${cible}!${indice} : ${r.status} (${fichiers.join(", ")})`);
      }
    }
    expect(ecarts).toEqual([]);
  });
});
