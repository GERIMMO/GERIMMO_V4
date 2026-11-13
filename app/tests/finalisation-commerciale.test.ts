import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { annulerFacturesOuvertes } from "@/lib/courriers-contrat-envoi";
import { envoyerEmail } from "@/lib/email";
import { envoyerAvisReconduction } from "@/lib/avis-abonnement";
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn(async () => ({ id: "message-fictif" })) }));

it.each([true, false])("conserve le résultat de chaque page de factures, seconde page accessible = %s", async accessible => {
  const ids = Array.from({length: 20}, (_, i) => "in_test_" + i);
  const list = vi.fn().mockResolvedValueOnce({data: ids.map(id => ({id})), has_more: true});
  if (accessible) list.mockResolvedValueOnce({data: [{id: "in_test_finale"}], has_more: false});
  else list.mockRejectedValueOnce(new Error("réseau fictif"));
  const voidInvoice = vi.fn().mockResolvedValue({status: "void"});
  const bilan = await annulerFacturesOuvertes({invoices: {list, voidInvoice}} as unknown as Stripe, "sub_fictive");
  expect(list.mock.calls[1][0]).toMatchObject({subscription: "sub_fictive", status: "open", starting_after: ids[19]});
  expect(bilan.annulees).toEqual(accessible ? [...ids, "in_test_finale"] : ids);
  expect(bilan.sort).toBe(accessible ? "annulees" : "a_annuler");
  expect(voidInvoice.mock.calls.map(c => c[2].idempotencyKey)).toEqual(bilan.annulees.map(id => "annulation-impaye-" + id));
});

it("ne compte pas une reconduction terminée si sa consignation échoue après acceptation", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({data: [{
    organization_id: "org-test", organisation: "SCI fictive", destinataire: "test@example.invalid",
    periode_fin: "2026-12-01T00:00:00Z", montant_periode_cents: 999, formule: null,
  }]}).mockResolvedValueOnce({error: {message: "indisponible"}});
  vi.mocked(envoyerEmail).mockResolvedValueOnce({id:"message-fictif",finalisationEnAttente:true});
  const bilan = await envoyerAvisReconduction({rpc} as unknown as SupabaseClient);
  expect(bilan.envoyes).toBe(0);
  expect(bilan.echecs).toEqual([expect.stringContaining("suivi de la reconduction à vérifier")]);
});
