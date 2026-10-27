/**
 * Audit #264, DOC-13 — un nouvel essai du même fichier (doublon refusé par
 * l'action métier, saisie corrigée) reprend sa réservation de transit encore
 * valable : il ne consomme ni le quota de 20 dépôts par heure, ni du stockage.
 * Quand la limite est atteinte, le message dit pourquoi et vers quelle heure
 * reprendre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { reserverDepotDirect } from "@/lib/depot-direct";

const compte = "33333333-3333-4333-8333-333333333333";
const id = "22222222-2222-4222-8222-222222222222";
const description = { nom: "Rapport.pdf", mime: "application/pdf", taille: 2048, empreinte: "a".repeat(64) };

function base({ existante = null as null | { id: string; chemin: string }, objets = [] as { name: string }[], insertion = { data: { id: "nouvelle", chemin: `${compte}/nouvelle` }, error: null } as { data: unknown; error: unknown }, plusAncienne = null as null | { created_at: string } } = {}) {
  const filtres: [string, unknown][] = [];
  const insert = vi.fn(() => ({ select: () => ({ single: async () => insertion }) }));
  const lectures: string[] = [];
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    let colonnes = "";
    q.select = (c: string) => { colonnes = c; lectures.push(c); return q; };
    for (const op of ["eq", "gt", "order", "limit"]) q[op] = (col: string, val: unknown) => { filtres.push([`${op}:${col}`, val]); return q; };
    q.maybeSingle = async () => ({ data: colonnes === "created_at" ? plusAncienne : existante, error: null });
    q.insert = insert;
    return q;
  });
  const list = vi.fn(async () => ({ data: objets, error: null }));
  const signe = vi.fn(async (chemin: string) => ({ data: { path: chemin, token: "jeton" }, error: null }));
  const db = { auth: { getUser: async () => ({ data: { user: { id: compte } }, error: null }) }, from, storage: { from: () => ({ list, createSignedUploadUrl: signe }) } };
  return { db: db as unknown as SupabaseClient, insert, list, signe, filtres, lectures };
}

describe("reprise d’une réservation de transit", () => {
  it("un fichier identique déjà transféré est repris sans nouvelle réservation ni transfert", async () => {
    const b = base({ existante: { id, chemin: `${compte}/${id}` }, objets: [{ name: id }] });
    expect(await reserverDepotDirect(b.db, description)).toEqual({ id, chemin: `${compte}/${id}`, transfere: true });
    expect(b.insert).not.toHaveBeenCalled();
    expect(b.signe).not.toHaveBeenCalled();
    // Même compte, même contenu, même nom, et assez de temps pour soumettre.
    expect(b.filtres).toEqual(expect.arrayContaining([["eq:compte_id", compte], ["eq:empreinte", description.empreinte], ["eq:nom", description.nom], ["eq:mime", description.mime], ["eq:taille", description.taille]]));
    const marge = b.filtres.find(([f]) => f === "gt:expire_le")?.[1] as string;
    expect(Date.parse(marge)).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(b.list).toHaveBeenCalledWith(compte, { search: id, limit: 10 });
  });

  it("un transfert interrompu repart sur le même chemin réservé, sans consommer de quota", async () => {
    const b = base({ existante: { id, chemin: `${compte}/${id}` }, objets: [] });
    expect(await reserverDepotDirect(b.db, description)).toEqual({ id, chemin: `${compte}/${id}`, jeton: "jeton" });
    expect(b.insert).not.toHaveBeenCalled();
    expect(b.signe).toHaveBeenCalledWith(`${compte}/${id}`, { upsert: false });
  });

  it("un autre fichier réserve normalement", async () => {
    const b = base();
    expect(await reserverDepotDirect(b.db, description)).toEqual({ id: "nouvelle", chemin: `${compte}/nouvelle`, jeton: "jeton" });
    expect(b.insert).toHaveBeenCalledWith(description);
  });

  it("à la limite, le message nomme la règle et l’heure de reprise (heure de Paris)", async () => {
    const b = base({
      insertion: { data: null, error: { code: "P0001", message: "Limite des dépôts atteinte, réessayez dans une heure" } },
      plusAncienne: { created_at: "2026-10-27T09:12:00Z" },
    });
    const r = await reserverDepotDirect(b.db, description);
    expect(r.erreur).toContain("20 fichiers ou 100 Mo par heure");
    expect(r.erreur).toContain("Vous pourrez reprendre vers 11:12 (heure de Paris).");
    expect(r.erreur).toContain("Votre fichier reste sélectionné.");
  });

  it("une autre panne garde le message général", async () => {
    const b = base({ insertion: { data: null, error: { code: "42501", message: "new row violates row-level security policy" } } });
    expect((await reserverDepotDirect(b.db, description)).erreur).toMatch(/^Le dépôt ne peut pas être préparé/);
  });
});
