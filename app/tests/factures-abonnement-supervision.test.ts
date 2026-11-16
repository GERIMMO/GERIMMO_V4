import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FacturesAbonnement } from "@/app/admin/organisations/[orgId]/factures-abonnement";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  reglage: vi.fn(), subscription: vi.fn(), factures: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));
vi.mock("@/lib/stripe", () => ({ configurationStripe: m.reglage,
  clientStripe: () => ({ subscriptions: { retrieve: m.subscription }, invoices: { list: m.factures } }) }));

const facture = {
  id: "in_fictive", number: "GER-EXEMPLE", created: 1794772800, currency: "eur", status: "paid",
  amount_paid: 0, amount_remaining: 0, pre_payment_credit_notes_amount: 599, post_payment_credit_notes_amount: 0,
  customer: "cus_fictif", parent: { subscription_details: { subscription: "sub_fictif" } },
  hosted_invoice_url: "https://example.test/lien-confidentiel", customer_email: "prive@example.test",
};
const page = async () => renderToStaticMarkup(await FacturesAbonnement({ organisation: "org-test" }));

beforeEach(() => {
  vi.resetAllMocks();
  m.rpc.mockImplementation(async (nom: string) => {
    switch (nom) {
      case "is_permanent_super_admin": return { data: true };
      case "log_sa_access": return { data: null };
      case "mon_client_stripe": return { data: "cus_fictif" };
      case "ma_souscription_stripe": return { data: "sub_fictif" };
      default: throw new Error("Lecture imprévue");
    }
  });
  m.reglage.mockReturnValue({ pret: true, config: {} });
  m.subscription.mockResolvedValue({ id: "sub_fictif", customer: "cus_fictif", metadata: { organization_id: "org-test" } });
  m.factures.mockResolvedValue({ data: [facture], has_more: false });
});

describe("historique de facturation en supervision", () => {
  it("borne la consultation au contrat demandé et affiche les avoirs sans inventer d’encaissement", async () => {
    const html = await page();
    expect(m.rpc).toHaveBeenCalledWith("log_sa_access", { org: "org-test", sa_action: "consultation_factures_abonnement" });
    expect(m.rpc).toHaveBeenCalledWith("mon_client_stripe", { p_org: "org-test" });
    expect(m.rpc).toHaveBeenCalledWith("ma_souscription_stripe", { p_org: "org-test" });
    expect(m.factures).toHaveBeenCalledWith({ customer: "cus_fictif", subscription: "sub_fictif", limit: 10 }, expect.anything());
    expect(html).toContain("GER-EXEMPLE");
    expect(html).toMatch(/Montant payé affecté à la facture : 0,00/);
    expect(html).toMatch(/Avoirs émis : 5,99/);
    expect(html).not.toMatch(/lien-confidentiel|prive@example|cus_fictif|sub_fictif/);
  });
  it("refuse un superviseur temporaire ou sans second facteur avant la lecture privilégiée", async () => {
    m.rpc.mockResolvedValue({ data: false });
    expect(await page()).toContain("réservée");
    expect(m.rpc.mock.calls).toEqual([["is_permanent_super_admin"]]);
    expect(m.subscription).not.toHaveBeenCalled();
    expect(m.factures).not.toHaveBeenCalled();
  });
  it("ferme la consultation si sa trace ne peut être conservée", async () => {
    m.rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ error: {} });
    expect(await page()).toContain("indisponible");
    expect(m.rpc).toHaveBeenCalledTimes(2);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it.each(["mon_client_stripe", "ma_souscription_stripe"])("refuse une lecture de contrat en échec (%s)", async refusee => {
    const habituelle = m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation(async (nom: string) => nom === refusee ? { error: {} } : habituelle(nom));
    expect(await page()).toContain("indisponible");
    expect(m.subscription).not.toHaveBeenCalled();
    expect(m.factures).not.toHaveBeenCalled();
  });
  it("refuse une référence Stripe dont le propriétaire diffère", async () => {
    m.subscription.mockResolvedValue({ id: "sub_fictif", customer: "cus_fictif", metadata: { organization_id: "autre" } });
    expect(await page()).toContain("indisponible");
    expect(m.factures).not.toHaveBeenCalled();
  });
  it.each([{ customer: "autre" }, { parent: null }, { currency: "usd" }])("bloque un retour hors contrat ou devise", async ecart => {
    m.factures.mockResolvedValue({ data: [facture, { ...facture, ...ecart }] });
    const html = await page();
    expect(html).toContain("indisponible");
    expect(html).not.toContain("GER-EXEMPLE");
  });
  it("ne transforme pas une panne Stripe en historique vide", async () => {
    m.factures.mockRejectedValue(new Error("détail interne"));
    expect(await page()).toContain("indisponible");
    expect(await page()).not.toContain("détail interne");
  });
});
