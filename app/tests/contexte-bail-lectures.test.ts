import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { contexte } from "./fixtures/contexte-document";

type Reponse = { data: unknown; error: { message: string } | null };
function client(reponses: Record<string, Partial<Reponse>> = {}, sansPrincipal = false) {
  const ctx = contexte();
  const donnees: Record<string, unknown> = {
    organizations: ctx.organisation,
    baux: { ...ctx.bail, locataire_principal: sansPrincipal ? null : ctx.bail.locataire_principal, lot: { ...ctx.lot, bien: ctx.bien } },
    lot_equipements: [], detentions: [], bail_personnes: [], persons: ctx.locataires[0],
  };
  const filtres = vi.fn();
  const from = vi.fn((table: string) => {
    const resultat = Promise.resolve({ data: donnees[table] ?? null, error: null, ...reponses[table] });
    const q = {
      select: () => q,
      eq: (champ: string, valeur: unknown) => { filtres(table, champ, valeur); return q; },
      is: () => q,
      maybeSingle: () => resultat,
      then: resultat.then.bind(resultat),
    };
    return q;
  });
  return { supabase: { from } as unknown as SupabaseClient, from, filtres };
}

it("charge un brouillon sans principal et accepte les listes vides", async () => {
  const c = client({}, true);
  const resultat = await chargerContexteBail(c.supabase, "org", "b1");
  if ("erreur" in resultat) throw new Error(resultat.erreur);
  expect(resultat.locataires).toEqual([]);
  expect(resultat.garants).toEqual([]);
  expect(resultat.bailleurs).toEqual([]);
  expect(resultat.lot.equipements).toEqual([]);
  expect(c.from).not.toHaveBeenCalledWith("persons");
  expect(c.filtres).toHaveBeenCalledWith("baux", "organization_id", "org");
  expect(c.filtres).toHaveBeenCalledWith("baux", "id", "b1");
});

it.each(["organizations", "baux", "lot_equipements", "detentions", "bail_personnes", "persons"])("ne transforme pas une erreur de %s en données manquantes", async (table) => {
  const c = client({ [table]: { error: { message: "source indisponible" } } });
  expect(await chargerContexteBail(c.supabase, "org", "b1")).toHaveProperty("erreur");
});

it.each(["lot_equipements", "detentions", "bail_personnes"])("accepte une liste %s absente sans erreur de lecture", async (table) => {
  const c = client({ [table]: { data: null } });
  expect(await chargerContexteBail(c.supabase, "org", "b1")).not.toHaveProperty("erreur");
});

it.each([["organizations", "Organisation introuvable."], ["baux", "Bail introuvable."]])("conserve le diagnostic d’une ligne %s introuvable", async (table, erreur) => {
  const c = client({ [table]: { data: null } });
  expect(await chargerContexteBail(c.supabase, "org", "b1")).toEqual({ erreur });
});
