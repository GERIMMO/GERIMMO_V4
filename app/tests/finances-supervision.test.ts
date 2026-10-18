import { describe, expect, it } from "vitest";
import { daysUntil, inTrial, matchesFinanceFilter, monthlyCents, revenueSummary, upcomingEvents, type FinancialAccount } from "@/lib/finances-supervision";

const account = (patch: Partial<FinancialAccount> = {}): FinancialAccount => ({
 id:"demo", name:"Parc fictif", type:"proprietaire_direct", status:"active", essai_fin:null, created_at:"2026-10-01", grille_tarifaire:"2026-09-28", stripe_statut:"active", periodicite:"mensuel", formule:"bailleur", montant_periode_cents:999, periode_fin:"2026-11-01T10:00:00Z", periodicite_suivante:null, unites_a_couvrir:2, unites_souscrites:3, annulation_demandee:false, paiement_en_defaut_depuis:null, derniere_synchro:"2026-10-17T10:00:00Z", a_resynchroniser:false, synchro_en_erreur:false, premiere_facture_payee:true, avantages_en_attente:0, ...patch,
});
describe("pilotage financier de la supervision", () => {
 it("sépare HT et TTC et normalise les annuels sans arrondir chaque abonnement", () => {
  const r = revenueSummary([account({ periodicite:"annuel", montant_periode_cents:5990 }), account({ periodicite:"annuel", montant_periode_cents:5990 }), account({ type:"agence", montant_periode_cents:3900 })]);
  expect(r.owner.monthly).toBe(998); expect(r.owner.annual).toBe(11980);
  expect(r.agency.monthly).toBe(3900); expect(r.active).toBe(3);
 });
 it("ne confond pas accès actif, essai, impayé et revenu récurrent", () => {
  const r = revenueSummary([account({ stripe_statut:null }), account({ stripe_statut:"trialing" }), account({ stripe_statut:"past_due" }), account({ stripe_statut:"canceled" })]);
  expect(r.active).toBe(0); expect(r.owner.monthly).toBe(0);
 });
 it("ne transforme pas un montant inconnu en gratuité ni en prix catalogue", () => {
  const a = account({ montant_periode_cents:null });
  expect(monthlyCents(a)).toBeNull(); expect(revenueSummary([a]).owner.unknown).toBe(1);
  expect(monthlyCents(account({ montant_periode_cents:0 }))).toBe(0);
  expect(monthlyCents(account({ montant_periode_cents:-1 }))).toBeNull();
  expect(monthlyCents(account({ periodicite:"inconnu" }))).toBeNull();
 });
 it("ne double pas les abonnés actifs dans les essais quand l'accès est désynchronisé", () => {
  expect(inTrial(account({ status:"essai" }))).toBe(false);
  expect(inTrial(account({ status:"essai", stripe_statut:null }))).toBe(true);
 });
 it("conserve le revenu jusqu'à la résiliation effective", () => {
  const a = account({ annulation_demandee:true });
  expect(revenueSummary([a]).owner.cancelling).toBe(999);
  expect(matchesFinanceFilter(a,"resiliations")).toBe(true);
  expect(matchesFinanceFilter(account({ ...a,stripe_statut:"canceled" }),"resiliations")).toBe(false);
 });
 it("rend visible un défaut même si le statut actif n'est pas encore réconcilié", () => {
  const a = account({ paiement_en_defaut_depuis:"2026-10-15" });
  expect(matchesFinanceFilter(a,"defaut")).toBe(true);
  expect(revenueSummary([a]).owner.unknown).toBe(1);
 });
 it("emploie le jour de Paris même après minuit et autour du changement d'heure", () => {
  expect(daysUntil("2026-10-17T23:30:00Z", "2026-10-17")).toBe(1);
  expect(daysUntil("2026-10-25T12:00:00Z", "2026-10-24")).toBe(1);
  expect(daysUntil("invalide", "2026-10-17")).toBeNull();
 });
 it("ouvre exactement les essais signalés dans la vigilance du jour", () => {
  const trial = account({ stripe_statut:null, status:"essai", essai_fin:"2026-10-16" });
  expect(matchesFinanceFilter(trial,"essais_expires","2026-10-17")).toBe(true);
  expect(matchesFinanceFilter(trial,"essais_proches","2026-10-17")).toBe(false);
  expect(matchesFinanceFilter({ ...trial,essai_fin:"2026-10-24" },"essais_proches","2026-10-17")).toBe(true);
  expect(matchesFinanceFilter({ ...trial,essai_fin:"2026-10-25" },"essais_proches","2026-10-17")).toBe(false);
  expect(matchesFinanceFilter({ ...trial,essai_fin:null,periode_fin:null },"essais_expires","2026-10-17")).toBe(false);
 });
 it("limite les échéances à trente jours et exclut les contrats résiliés", () => {
  const trial = account({ id:"essai", stripe_statut:null, status:"essai", essai_fin:"2026-10-20", periode_fin:null });
  const r = upcomingEvents([trial, account(), account({ id:"ancien", stripe_statut:"canceled" }), account({ id:"futur", periode_fin:"2027-01-01" })], "2026-10-17");
  expect(r.map(e => e.account.id)).toEqual(["essai", "demo"]);
  expect(r[0].label).toBe("Fin d’essai");
 });
});
