import type { DonneesQuittanceDocument } from "@/lib/quittance-conforme";

/** Une quittance complète, telle que `quittance_document` la rend (agence). */
export function quittanceDocumentComplete(
  surcharge: Partial<DonneesQuittanceDocument> = {}
): DonneesQuittanceDocument {
  return {
    quittance_id: "9ccce3bb-0000-4000-8000-000000000001",
    appel_id: "a0000000-0000-4000-8000-000000000003",
    organization_id: "org-1",
    est_quittance: true,
    montant: 700,
    date_emission: "2026-09-05",
    periode: "2026-09-01",
    loyer_hc: 650,
    charges: 50,
    montant_du: 700,
    prorata: false,
    bail_id: "b41d0000-0000-4000-8000-000000000002",
    bail_date_debut: "2026-09-01",
    bail_date_fin: null,
    charges_mode: "provision",
    organisation: {
      type: "agence",
      nom: "Agence Alpha",
      siret: "12345678900011",
      carte_pro: "CPI 7501 2026 000 000 001",
      adresse: "3 place de la Mairie",
      code_postal: "75004",
      ville: "Paris",
      telephone: null,
      email: "contact@alpha.test",
    },
    bailleurs: [{ nom: "Dupont", prenom: "Jean" }],
    locataires: [{ nom: "Martin", prenom: "Léa" }],
    logement: {
      lot_nom: "Appartement 2",
      etage: "2",
      adresse: "18 rue des Acacias",
      code_postal: "75012",
      ville: "Paris",
    },
    appels: [{ id: "a0000000-0000-4000-8000-000000000003", periode: "2026-09-01", montant_du: 700 }],
    encaissements: [{ date_paiement: "2026-09-04", mode: "virement", montant: 700, created_at: null }],
    vue_gestionnaire: false,
    ...surcharge,
  };
}
