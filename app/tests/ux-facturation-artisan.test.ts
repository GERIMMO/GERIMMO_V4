import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { preparerVueFactures, VueFactures } from "@/app/artisan/facturation/vue-factures";
import { bilanReglements, type ActiviteArtisanPrivee, type FactureArtisanPrivee, type ReglementArtisan } from "@/lib/artisan-prive";
import type { FactureVueParArtisan } from "@/lib/reglement-facture";
vi.mock("next/navigation", () => ({ usePathname: () => "/artisan/facturation" }));
import { NavArtisan } from "@/components/nav-artisan";
const facture = (id: string, client = "Élise Morel", montant = 10000, origine: "gerimmo" | "externe" = "gerimmo"): FactureArtisanPrivee => ({ id, client, montant_ttc_cents: montant, numero: `F-${id}`, origine, created_at: "2026-11-18", intervention_id: id });
const reglement = (id: string, montant: number, annule = false): ReglementArtisan => ({ facture_gerimmo_id: id, facture_externe_id: null, montant_cents: montant, annule_le: annule ? "2026-11-18" : null }) as ReglementArtisan;
const client = (id: string, etat: FactureVueParArtisan["etat"]): FactureVueParArtisan => ({ facture_id: id, intervention_id: id, organization_id: "org", numero: `F-${id}`, montant_ttc_cents: 10000, validee_le: etat === "deposee" ? null : "2026-11-18", etat, reglements: [], reglee_le: null });
function activite(factures = [facture("f")], reglements: ReglementArtisan[] = []): ActiviteArtisanPrivee {
  return { factures, reglements, avoirs: [], clients: [], chantiers: [], devis: [], rendez_vous: [], pieces: [], evenements: [], activation: { clients: true, reglements: true } };
}
describe("facturation lisible sans modifier les comptes", () => {
  it("sépare attente de validation et facture à régler", () => {
    const d = activite([facture("a"), facture("b")]);
    const v = preparerVueFactures(d, [client("a", "deposee"), client("b", "validee")]);
    expect(v.lignes.map(l => l.statut)).toEqual(["En attente de validation", "À régler"]);
    expect([v.reste, v.attendues, v.enValidation]).toEqual([20000, 2, 1]);
  });
  it("particulier, SCI et externe : 100 + (200 − 50) + (300 − 300) = 250 €", () => {
    const d = activite([facture("a"), facture("b", "SCI des Amandiers", 20000), facture("c", "Client extérieur", 30000, "externe")], [reglement("b", 5000), { ...reglement("c", 30000), facture_gerimmo_id: null, facture_externe_id: "c" }]);
    const v = preparerVueFactures(d, [client("a", "validee"), client("b", "partiellement_reglee")]);
    expect([v.reste, v.attendues]).toEqual([25000, 2]);
    expect(v.lignes.map(l => l.statut)).toEqual(["À régler", "Partiellement réglée · déclaré", "Réglée · déclaré"]);
    for (const l of v.lignes) expect(l.bilan).toEqual(bilanReglements(l.f, d.reglements, d.avoirs));
    const html = renderToStaticMarkup(createElement(VueFactures, { data: d, clients: [], erreurClients: false, agenda: [] }));
    for (const nom of ["Élise Morel", "SCI des Amandiers", "Client extérieur", "sans confirmation bancaire"]) expect(html).toContain(nom);
  });
  it("ne cumule jamais la déclaration du client avec celle de l’artisan", () => {
    const d = activite([facture("a")], [reglement("a", 4000)]);
    const v = preparerVueFactures(d, [client("a", "reglee")]);
    expect(v.reste).toBe(6000); expect(v.lignes[0].bilan.declare).toBe(4000);
    expect(v.lignes[0].client?.etat).toBe("reglee");
    expect(preparerVueFactures(activite([facture("a")]), [client("a", "reglee")]).lignes[0].statut).toBe("Réception à confirmer");
  });
  it("une même facture présente deux fois ne double pas le total", () => {
    const f = facture("a"); expect(preparerVueFactures(activite([f, f]), []).reste).toBe(10000);
  });
  it("une déclaration annulée ne réduit pas le solde", () => {
    expect(preparerVueFactures(activite([facture("a")], [reglement("a", 10000, true)]), []).reste).toBe(10000);
  });
  it("un avoir reste visible et n’entre pas dans les sommes attendues", () => {
    const d = activite([facture("a", "Client extérieur", 10000, "externe")]);
    d.avoirs = [{ facture_id: "a", numero: "AV-1", montant_ttc_cents: 10000 } as never];
    const v = preparerVueFactures(d, []); expect(v.reste).toBe(0); expect(v.attendues).toBe(0); expect(v.lignes[0].statut).toBe("Annulée par avoir");
  });
  it("une lecture manquante n’annonce pas une validation du client", () => {
    expect(preparerVueFactures(activite(), [], true).lignes[0].statut).toBe("Validation à vérifier");
    const html = renderToStaticMarkup(createElement(VueFactures, { data: null, clients: [], erreurClients: false, agenda: [] }));
    expect(html).toContain("total est indisponible"); expect(html).not.toContain("0,00");
  });
  it("ne propose aucune déclaration si le module existant est désactivé", () => {
    const d = activite(); d.activation.reglements = false;
    const html = renderToStaticMarkup(createElement(VueFactures, { data: d, clients: [], erreurClients: false, agenda: [] }));
    expect(html).not.toContain("Déclarer un règlement reçu"); expect(html).toContain("Voir le détail et l’historique");
  });
  it("mobile : Facturation et Menu sont accessibles sans retirer les trois premiers accès", () => {
    const html = renderToStaticMarkup(createElement(NavArtisan));
    for (const lien of ["/artisan", "/artisan/agenda", "/artisan/devis", "/artisan/facturation"]) expect(html).toContain(`href="${lien}"`);
    // Q89 (relevé du 26/11) : l'onglet s'appelle « Facturation », comme la page « Ma facturation » (plus « Factures »).
    expect(html).toContain(">Facturation</span>"); expect(html).toContain("Menu"); expect(html).toContain('aria-haspopup="dialog"');
  });
});
