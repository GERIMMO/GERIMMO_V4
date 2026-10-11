import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { disponibilitesQuittances } from "@/lib/quittance-conforme";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

it("n’annonce disponible que le document qui passe le contrôle réel du PDF", async () => {
  const complet = quittanceDocumentComplete();
  const incomplet = { ...complet, organisation: { ...complet.organisation, adresse:null, ville:null } };
  const rpc = vi.fn(async (_nom: string, args: {p_quittance:string}) => ({data:args.p_quittance === "complet" ? complet : args.p_quittance === "incomplet" ? incomplet : null, error:null}));
  const result = await disponibilitesQuittances({rpc} as unknown as SupabaseClient, ["complet", "incomplet", "introuvable", "complet", null]);
  expect(result).toEqual({complet:"disponible",incomplet:"en_preparation",introuvable:"lecture_impossible"});
  expect(rpc).toHaveBeenCalledTimes(3);
});

it("distingue une panne de lecture d’un document incomplet", async () => {
  const rpc = vi.fn().mockRejectedValue(new Error("indisponible"));
  expect(await disponibilitesQuittances({rpc} as unknown as SupabaseClient,["q"])).toEqual({q:"lecture_impossible"});
});
