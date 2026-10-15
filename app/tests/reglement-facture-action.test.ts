/**
 * Décision D23 (option A) : les actions serveur du règlement déclaratif, appelées pour de bon avec un faux client.
 *
 *  - la saisie est lue au centime (« 139,68 » → 13968), jamais par Number() ;
 *  - D05 : un rejeu de la même clé d'envoi (23505 sur « cle_envoi ») répond « déjà enregistré », n'est pas une erreur,
 *    et ne prévient pas l'artisan une seconde fois ;
 *  - un refus de la base est repris sans jargon, avec la saisie, et ne prévient personne ;
 *  - l'e-mail à l'artisan part APRÈS le succès seulement (notifierEnCoulisses) ;
 *  - le retrait exige un motif et appelle la fonction de retrait.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  verifier: vi.fn(),
  notifierEnCoulisses: vi.fn(),
  notifierReglementFacture: vi.fn(),
  revalider: vi.fn(),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.verifier }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalider }));
vi.mock("@/lib/notifications", () => ({
  notifierEnCoulisses: m.notifierEnCoulisses,
  notifierReglementFacture: m.notifierReglementFacture,
}));

import { declarerReglementFacture, retirerReglementFacture } from "@/app/actions/reglement-facture";
import { aujourdhuiParis } from "@/lib/ged";

const CLE = "3f2b8c1e-5d4a-4b6c-9e8f-0a1b2c3d4e5f";
function saisie(champs: Record<string, string> = {}) {
  const f = new FormData();
  const valeurs = { montant: "139,68", date_reglement: aujourdhuiParis(), moyen: "virement", reference: "VIR 1234", cle_envoi: CLE, ...champs };
  for (const [nom, valeur] of Object.entries(valeurs)) f.set(nom, valeur);
  return f;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.verifier.mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "gerant" } });
  m.notifierEnCoulisses.mockResolvedValue(undefined);
});

describe("declarerReglementFacture", () => {
  it("succès : la base reçoit des centimes exacts, l'artisan est prévenu une fois, le message le dit", async () => {
    m.rpc.mockResolvedValue({ data: "reglement-1", error: null });
    const retour = await declarerReglementFacture("org", "facture-1", {}, saisie());
    expect(m.rpc).toHaveBeenCalledOnce();
    expect(m.rpc).toHaveBeenCalledWith("enregistrer_reglement_facture", {
      p_org: "org", p_facture: "facture-1", p_montant_cents: 13968, p_date_reglement: aujourdhuiParis(),
      p_moyen: "virement", p_reference: "VIR 1234", p_cle_envoi: CLE,
    });
    expect(retour.erreur).toBeUndefined();
    expect(retour.dejaEnregistre).toBeUndefined();
    expect(retour.succes).toContain("enregistré et écrit au journal comptable");
    expect(retour.succes).toContain("139,68");
    expect(retour.succes).toContain("l’artisan est prévenu");
    expect(m.notifierEnCoulisses).toHaveBeenCalledOnce();
    expect(m.notifierEnCoulisses.mock.calls[0][1]).toEqual({ evenement: "facture_reglee", objet: "reglement-1", org: "org" });
    // L'envoi lui-même passe par notifierReglementFacture, avec le règlement créé.
    await m.notifierEnCoulisses.mock.calls[0][2]("service");
    expect(m.notifierReglementFacture).toHaveBeenCalledWith("service", "org", "reglement-1");
    expect(m.revalider).toHaveBeenCalledWith("/agence/org/incidents");
    expect(m.revalider).toHaveBeenCalledWith("/artisan/facturation");
  });

  it("rejeu de la même clé (23505, cle_envoi) : « déjà enregistré », pas d'erreur, pas de second e-mail", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "Ce règlement est déjà enregistré (cle_envoi) : il n'a pas été enregistré une seconde fois." } });
    const retour = await declarerReglementFacture("org", "facture-1", {}, saisie());
    expect(retour.erreur).toBeUndefined();
    expect(retour.dejaEnregistre).toBe(true);
    expect(retour.succes).toContain("déjà enregistré");
    expect(retour.succes).toContain("n'a pas été enregistré une seconde fois");
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
    expect(m.revalider).toHaveBeenCalled();
  });

  it("un 23505 sans la clé d'envoi n'est pas un rejeu : erreur reprise avec la saisie", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"autre\"" } });
    const retour = await declarerReglementFacture("org", "facture-1", {}, saisie());
    expect(retour.dejaEnregistre).toBeUndefined();
    expect(retour.succes).toBeUndefined();
    expect(retour.erreur).toBeTruthy();
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
  });

  it("refus de la base (dépassement du reste) : message repris, saisie rendue au formulaire, personne n'est prévenu", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Le montant dépasse le reste à régler (100,00 €) : le total des règlements ne peut pas dépasser le montant de la facture." } });
    const retour = await declarerReglementFacture("org", "facture-1", {}, saisie({ montant: "139,68", moyen: "cheque", reference: "CHQ 7" }));
    expect(retour.erreur).toContain("Le montant dépasse le reste à régler (100,00 €)");
    expect(retour.valeurs).toMatchObject({ montant: "139,68", moyen: "cheque", reference: "CHQ 7" });
    expect(retour.succes).toBeUndefined();
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
    expect(m.revalider).not.toHaveBeenCalled();
  });

  it.each([
    ["un montant illisible", { montant: "cent euros" }],
    ["un montant au-delà du centime", { montant: "10,005" }],
    ["une date future", { date_reglement: "2999-01-01" }],
    ["un moyen inconnu", { moyen: "bitcoin" }],
    ["une clé d'envoi absente", { cle_envoi: "" }],
    ["une référence trop longue", { reference: "x".repeat(201) }],
  ])("%s : refus avant la base, saisie reprise", async (_cas, champs) => {
    const retour = await declarerReglementFacture("org", "facture-1", {}, saisie(champs));
    expect(retour.erreur).toBeTruthy();
    expect(retour.valeurs).toBeTruthy();
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
  });

  it("sans compte : accès refusé, rien n'est appelé", async () => {
    m.verifier.mockResolvedValue({ supabase: { rpc: m.rpc }, user: null });
    expect(await declarerReglementFacture("org", "facture-1", {}, saisie())).toEqual({ erreur: "Accès refusé." });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("retirerReglementFacture", () => {
  it("motif vide : refus, rien n'est appelé", async () => {
    const f = new FormData();
    f.set("motif", "   ");
    const retour = await retirerReglementFacture("org", "reglement-1", {}, f);
    expect(retour.erreur).toContain("Indiquez le motif du retrait");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("succès : la fonction de retrait reçoit le motif, le message dit la contre-écriture", async () => {
    m.rpc.mockResolvedValue({ data: "contre-1", error: null });
    const f = new FormData();
    f.set("motif", " Virement rejeté ");
    const retour = await retirerReglementFacture("org", "reglement-1", {}, f);
    expect(m.rpc).toHaveBeenCalledWith("retirer_reglement_facture", { p_org: "org", p_reglement: "reglement-1", p_motif: "Virement rejeté" });
    expect(retour.succes).toContain("contre-écriture est passée au journal");
    expect(m.revalider).toHaveBeenCalledWith("/agence/org/comptabilite");
  });

  it("refus de la base : message repris avec le motif saisi", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Ce règlement a déjà été retiré : rien n'a été modifié." } });
    const f = new FormData();
    f.set("motif", "Doublon");
    const retour = await retirerReglementFacture("org", "reglement-1", {}, f);
    expect(retour.erreur).toContain("déjà été retiré");
    expect(retour.valeurs).toMatchObject({ motif: "Doublon" });
  });
});
