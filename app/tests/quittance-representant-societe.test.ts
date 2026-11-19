/**
 * SCI-3 (audit après publication de la PR #347, 19/11/2026) : la quittance d'une société bailleresse disait
 * « Je soussigné(e) SCI du Tilleul, bailleur du logement… » et se signait « SCI du Tilleul », sans nommer la personne
 * qui signe. Avec un représentant actif au bail, elle dit « Je soussigné(e) Camille Martin, agissant pour le compte de
 * SCI du Tilleul, bailleur du logement… » et se signe « SCI du Tilleul, représentée par Camille Martin » (formulation à
 * valider juridiquement). Sans représentant, rien ne change. Les champs obligatoires (« manquants ») non plus.
 *
 * Le représentant arrive par `quittance_document` (migration 20261119200200 ; base : quittance-representant-base.test.ts)
 * pour la quittance délivrée au locataire, et par `representants_actifs_bail` pour le PDF du gestionnaire.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

const banc = vi.hoisted(() => ({ charger: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({
  ...(await original<typeof import("@/lib/documents/modeles/communs")>()),
  chargerContexteBail: banc.charger,
  signatureOrganisation: async () => null,
}));

import { assemblerQuittance, signataireQuittance } from "@/lib/documents/modeles/quittance";
import { assemblerQuittanceDelivree, manquantsQuittance, type DonneesQuittanceDocument } from "@/lib/quittance-conforme";

const SOCIETE = { nom: "SCI du Tilleul", prenom: null };
const CAMILLE = { nom: "Martin", prenom: "Camille" };

/** La quittance d'une SCI chez un propriétaire direct, telle que `quittance_document` la rend. */
function quittanceSci(representant?: { nom: string; prenom: string | null } | null, surcharge: Partial<DonneesQuittanceDocument> = {}) {
  const base = quittanceDocumentComplete();
  return quittanceDocumentComplete({
    organisation: { ...base.organisation, type: "proprietaire_direct", nom: "SCI du Tilleul", siret: null, carte_pro: null },
    bailleurs: [representant === undefined ? SOCIETE : { ...SOCIETE, representant }],
    ...surcharge,
  });
}

const DECLARATION_REPRESENTEE =
  'Je soussigné(e) <span class="v">Camille Martin</span>, agissant pour le compte de <span class="v">SCI du Tilleul</span>, bailleur du logement désigné ci-dessus';

describe("signataireQuittance : qui déclare et qui signe", () => {
  it("sans représentant : rien à changer", () => {
    expect(signataireQuittance([SOCIETE])).toBeNull();
    expect(signataireQuittance([{ nom: "Moreau", prenom: "Claire" }])).toBeNull();
    expect(signataireQuittance([])).toBeNull();
    expect(signataireQuittance(null)).toBeNull();
    expect(signataireQuittance([{ ...SOCIETE, representant: null }])).toBeNull();
    // Un représentant sans nom ni prénom ne nomme personne.
    expect(signataireQuittance([{ ...SOCIETE, representant: { nom: " ", prenom: null } }])).toBeNull();
  });

  it("une société représentée : le représentant, prénom puis nom, agit pour son compte", () => {
    expect(signataireQuittance([{ ...SOCIETE, representant: CAMILLE }])).toEqual({
      soussigne: '<span class="v">Camille Martin</span>, agissant pour le compte de <span class="v">SCI du Tilleul</span>',
      signature: "SCI du Tilleul, représentée par Camille Martin",
    });
  });

  it("plusieurs bailleurs : chacun garde sa place, sans confusion", () => {
    expect(signataireQuittance([{ ...SOCIETE, representant: CAMILLE }, { nom: "Dupont", prenom: "Jean" }])).toEqual({
      soussigne: '<span class="v">Camille Martin</span>, agissant pour le compte de <span class="v">SCI du Tilleul</span>, et <span class="v">Dupont Jean</span>',
      signature: "SCI du Tilleul, représentée par Camille Martin ; Dupont Jean",
    });
  });

  it("les noms sont échappés", () => {
    const r = signataireQuittance([{ nom: "SCI <b>", prenom: null, representant: { nom: "Martin & Fils", prenom: "<i>" } }]);
    expect(r?.soussigne).toBe('<span class="v">&lt;i&gt; Martin &amp; Fils</span>, agissant pour le compte de <span class="v">SCI &lt;b&gt;</span>');
    // La signature est du texte : `blocSignatureEmetteur` l'échappe.
    expect(r?.signature).toBe("SCI <b>, représentée par <i> Martin & Fils");
  });
});

describe("la quittance délivrée au locataire (quittance_document)", () => {
  it("avec un représentant actif : il déclare pour la société et signe pour elle", () => {
    const doc = assemblerQuittanceDelivree(quittanceSci(CAMILLE));
    expect(doc.html).toContain(DECLARATION_REPRESENTEE);
    expect(doc.html).toContain('<div class="sig-nom">SCI du Tilleul, représentée par Camille Martin</div>');
    // Le bailleur reste la société (cartouche et en-tête).
    expect(doc.html).toMatch(/Bailleur[\s\S]*<span class="v">SCI du Tilleul<\/span>/);
    expect(manquantsQuittance(doc)).toEqual([]);
  });

  it("sans représentant : le texte d'avant", () => {
    for (const d of [quittanceSci(), quittanceSci(null)]) {
      const doc = assemblerQuittanceDelivree(d);
      expect(doc.html).toContain('Je soussigné(e) <span class="v">SCI du Tilleul</span>, bailleur du logement désigné ci-dessus');
      expect(doc.html).toContain('<div class="sig-nom">SCI du Tilleul</div>');
      expect(doc.html).not.toContain("agissant pour le compte de");
      expect(doc.html).not.toContain("représentée par");
    }
  });

  it("un reçu partiel suit la même règle", () => {
    const doc = assemblerQuittanceDelivree(quittanceSci(CAMILLE, { est_quittance: false, montant: 300 }));
    expect(doc.html).toContain("Reçu de paiement partiel");
    expect(doc.html).toContain(DECLARATION_REPRESENTEE);
  });

  it("les champs obligatoires ne changent pas : mêmes manquants avec ou sans représentant", () => {
    const incomplete = (representant?: typeof CAMILLE) => {
      const d = quittanceSci(representant);
      d.organisation = { ...d.organisation, adresse: null, email: null, ville: null };
      d.locataires = [];
      return manquantsQuittance(assemblerQuittanceDelivree(d));
    };
    expect(incomplete(CAMILLE)).toEqual(incomplete());
    expect(incomplete(CAMILLE)).toEqual(expect.arrayContaining(["domicile ou siège social", "adresse électronique", "commune"]));
  });

  it("le représentant ne remplace jamais une identité de bailleur manquante", () => {
    const d = quittanceSci(CAMILLE);
    d.bailleurs = [{ nom: "", prenom: null, representant: CAMILLE }];
    const doc = assemblerQuittanceDelivree(d);
    expect(manquantsQuittance(doc)).toContain("nom et prénom(s), ou dénomination");
    expect(doc.html).not.toContain("agissant pour le compte de");
  });

  it("une agence émet en mandataire : son texte ne change pas", () => {
    const d = quittanceDocumentComplete({ bailleurs: [{ ...SOCIETE, representant: CAMILLE }] });
    const doc = assemblerQuittanceDelivree(d);
    expect(doc.html).toContain('Je soussigné(e) <span class="v">SCI du Tilleul</span>, représenté par <span class="v">Agence Alpha</span>, bailleur du logement');
    expect(doc.html).toContain('<div class="sig-nom">Agence Alpha</div>');
    expect(doc.html).not.toContain("agissant pour le compte de");
  });
});

describe("le PDF de la quittance (gestionnaire)", () => {
  function client() {
    const lignes: Record<string, unknown> = {
      quittances: { id: "q0000000-0000", bail_id: "b1", appel_id: "a1", est_quittance: true, montant: 700, date_emission: "2026-11-05" },
      appels_loyer: [{ id: "a1", periode: "2026-11-01", loyer_hc: 650, charges: 50, montant_du: 700, prorata: false }],
      encaissements: [{ date_paiement: "2026-11-04", mode: "virement", montant: 700, created_at: null }],
    };
    const from = (table: string) => {
      const r = Promise.resolve({ data: lignes[table] ?? null, error: null });
      const q = { select: () => q, eq: () => q, order: () => q, maybeSingle: () => r, then: r.then.bind(r) };
      return q;
    };
    return { from, rpc: banc.rpc } as unknown as SupabaseClient;
  }
  function ctxSci(type = "proprietaire_direct") {
    const ctx = contexte();
    ctx.organisation = { ...ctx.organisation, type, name: "SCI du Tilleul" };
    ctx.bailleurs = [{ ...personne({ id: "societe", nom: "SCI du Tilleul", prenom: null, qualite: "SCI" }), quote_part: 100 }];
    return ctx;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    banc.charger.mockResolvedValue(ctxSci());
    banc.rpc.mockResolvedValue({ data: [{ societe_id: "societe", personne_id: "rep", nom: "Martin", prenom: "Camille" }], error: null });
  });

  it("lit le pouvoir actif du bail et nomme le représentant, comme la quittance délivrée", async () => {
    const r = await assemblerQuittance(client(), "org", "q1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(banc.rpc).toHaveBeenCalledWith("representants_actifs_bail", { p_bail: "b1" });
    expect(r.document.html).toContain(DECLARATION_REPRESENTEE);
    expect(r.document.html).toContain('<div class="sig-nom">SCI du Tilleul, représentée par Camille Martin</div>');
  });

  it("le pouvoir d'une autre société n'est pas imputé à celle-ci", async () => {
    banc.rpc.mockResolvedValue({ data: [{ societe_id: "autre", personne_id: "rep", nom: "Martin", prenom: "Camille" }], error: null });
    const r = await assemblerQuittance(client(), "org", "q1");
    if ("erreur" in r) throw new Error(r.erreur);
    expect(r.document.html).not.toContain("agissant pour le compte de");
  });

  it("pouvoir illisible : pas de quittance au texte incertain", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    expect(await assemblerQuittance(client(), "org", "q1")).toEqual({ erreur: "Le représentant de la société bailleresse n’a pas pu être vérifié. Réessayez." });
  });

  it("un particulier ou une agence : aucune lecture du pouvoir", async () => {
    const particulier = contexte();
    banc.charger.mockResolvedValue(particulier);
    expect("erreur" in (await assemblerQuittance(client(), "org", "q1"))).toBe(false);
    banc.charger.mockResolvedValue(ctxSci("agence"));
    expect("erreur" in (await assemblerQuittance(client(), "org", "q1"))).toBe(false);
    expect(banc.rpc).not.toHaveBeenCalled();
  });
});
