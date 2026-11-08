import { describe, expect, it, vi } from "vitest";
import { disponibilitesQuittances } from "@/lib/quittance-conforme";
import { bilanApresPaiement } from "@/lib/bilan-reception-loyer";

vi.mock("@/lib/quittance-conforme", () => ({ disponibilitesQuittances: vi.fn() }));

function base(lignes: Record<string, Record<string, unknown> | null>) {
  const filtres: Record<string, Record<string, unknown>> = {};
  const from = vi.fn((table: string) => {
    const criteres = filtres[table] = {} as Record<string, unknown>;
    const requete = {
      select: () => requete,
      eq: (champ: string, valeur: unknown) => { criteres[champ] = valeur; return requete; },
      limit: () => requete,
      maybeSingle: async () => ({ data: lignes[table] ?? null, error: null }),
    };
    return requete;
  });
  return { db: { from } as never, filtres };
}

describe("Bilan de la confirmation d'un loyer", () => {
  it("vérifie l’écriture du versement exact et la quittance du bon terme, avec sa date réelle d’envoi", async () => {
    const envoyeLe = "2026-11-05T10:00:00Z";
    const { db, filtres } = base({ encaissements: { id: "versement" }, ecritures: { id: "ecriture" },
      quittances: { id: "doc", est_quittance: true, email_envoye_at: envoyeLe } });
    vi.mocked(disponibilitesQuittances).mockResolvedValueOnce({ doc: "disponible" });
    expect(await bilanApresPaiement(db, "org", "bail", "appel", "regle", "cle")).toEqual({
      statut: "regle", comptabilise: true, document: { id: "doc", quittance: true, disponibilite: "disponible", envoyeLe },
    });
    expect(filtres).toEqual({
      encaissements: { organization_id: "org", bail_id: "bail", cle_envoi: "cle" },
      ecritures: { organization_id: "org", bail_id: "bail", encaissement_id: "versement", categorie: "loyer", sens: "recette" },
      quittances: { organization_id: "org", bail_id: "bail", appel_id: "appel" },
    });
  });
  it("distingue un reçu partiel incomplet, sans envoi et sans écriture vérifiée", async () => {
    const { db } = base({ encaissements: { id: "versement" },
      quittances: { id: "doc", est_quittance: false, email_envoye_at: null } });
    vi.mocked(disponibilitesQuittances).mockResolvedValueOnce({ doc: "en_preparation" });
    expect(await bilanApresPaiement(db, "org", "bail", "appel", "partiel", "cle")).toEqual({
      statut: "partiel", comptabilise: false, document: { id: "doc", quittance: false, disponibilite: "en_preparation", envoyeLe: null },
    });
  });
  it("conserve le règlement si la lecture du justificatif échoue", async () => {
    const { db } = base({ encaissements: { id: "versement" }, ecritures: { id: "ecriture" }, quittances: { id: "doc" } });
    vi.mocked(disponibilitesQuittances).mockRejectedValueOnce(new Error("indisponible"));
    expect(await bilanApresPaiement(db, "org", "bail", "appel", "regle", "cle")).toEqual({
      statut: "regle", comptabilise: true, document: undefined,
    });
  });
  it("ne revendique aucune nouvelle écriture pour un terme déjà soldé", async () => {
    const { db, filtres } = base({});
    expect(await bilanApresPaiement(db, "org", "bail", "appel", "regle", null)).toEqual({
      statut: "regle", comptabilise: undefined, document: undefined,
    });
    expect(filtres).not.toHaveProperty("encaissements");
  });
});
