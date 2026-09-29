/**
 * Audit des parcours baux et actes du 29/09 — non-régression côté documents
 * et règles miroirs. Les corrections en base sont couvertes par
 * `audit-baux-documents-2026-09-29-base.test.ts` (parité TS/SQL comprise).
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte, personne } from "./fixtures/contexte-document";
import { Fusion } from "@/lib/documents/gabarit";
import { datesRevisionIrl, numeroTrimestreIrl } from "@/lib/baux";
import {
  QUALITES_BAILLEUR,
  dureeBailNuAnnees,
  estPersonnePhysique,
  estQualiteBailleur,
  normaliserQualiteBailleur,
} from "@/lib/qualite-bailleur";
import { construireRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerCautionnement, RESILIATION_CAUTION_DUREE_INDETERMINEE } from "@/lib/documents/modeles/cautionnement";
import {
  ajouterMois,
  assemblerCongeBailleur,
  congeBailleurDansLesDelais,
  prixDepuisOptions,
} from "@/lib/documents/modeles/conge-bailleur";
import { assemblerMandatGestion, mentionsConsommateur } from "@/lib/documents/modeles/mandat-gestion";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));

const exp = { nom: "Agence Alpha", adresse: "5 place du Marché, 69001 Lyon", email: "a@b.fr", telephone: "04", ville: "Lyon" };
const html = (d: { document: { html: string } } | { erreur: string }) => ("erreur" in d ? d.erreur : d.document.html);

// ---------------------------------------------------------------------------
// Constat 1 — révision IRL : pas de rétroactivité
// ---------------------------------------------------------------------------
describe("révision IRL : effet = max(anniversaire, demande)", () => {
  it("demandée après l'anniversaire : effet à la date de la demande", () => {
    expect(datesRevisionIrl("2024-03-01", "2026-09-15")).toEqual({ echeance: "2026-03-01", dateEffet: "2026-09-15" });
  });
  it("demandée le jour anniversaire : effet à l'anniversaire ; avant le 1er : rien", () => {
    expect(datesRevisionIrl("2024-03-01", "2026-03-01")).toEqual({ echeance: "2026-03-01", dateEffet: "2026-03-01" });
    expect(datesRevisionIrl("2026-03-01", "2026-09-15")).toBeNull();
  });
  it("la lettre dit la date de la demande, sans rétroactivité", () => {
    const doc = construireRevisionIrl({
      reference: "IRL-1",
      dateEffet: "2026-09-15",
      dateEcheance: "2026-03-01",
      dateDemande: "2026-09-15",
      trimestreNouveau: "T2 2026",
      ancienLoyer: 750,
      nouveauLoyer: 764.78,
      irlReference: 145.17,
      irlNouveau: 148.03,
      trimestre: "2e trimestre 2025",
      charges: 50,
      bailleurNom: "Moreau Claire",
      locatairesNoms: "Leblanc Julie",
      logementAdresse: "1 rue A",
      referenceBail: "BAIL-1",
      exp,
      f: new Fusion(),
    });
    expect(doc.html).toContain("Échéance annuelle du <span class=\"v\">01/03/2026</span>");
    expect(doc.html).toMatch(/prend effet à la date de la\s+demande, soit le <b><span class="v">15\/09\/2026/);
    expect(doc.html).toContain("à compter du <span class=\"v\">15/09/2026</span>");
    expect(doc.html).not.toContain("à compter du <span class=\"v\">01/03/2026</span>");
    expect(doc.html).toContain("sans rétroactivité");
    expect(doc.html).toContain("T2 2026");
  });
});

describe("révision IRL : trimestre de l'indice (constat 21)", () => {
  it("lit les libellés usuels", () => {
    expect(numeroTrimestreIrl("T2 2026")).toBe(2);
    expect(numeroTrimestreIrl("2e trimestre 2026")).toBe(2);
    expect(numeroTrimestreIrl("1er trimestre")).toBe(1);
    expect(numeroTrimestreIrl("quatrième trimestre 2024")).toBe(4);
    expect(numeroTrimestreIrl("n'importe")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constat 3 — durée du bail nu selon la qualité
// ---------------------------------------------------------------------------
describe("qualité du bailleur et durée du bail nu (art. 10 et 13)", () => {
  it("liste fermée et normalisation des anciennes écritures", () => {
    expect(QUALITES_BAILLEUR).toContain("SCI familiale");
    expect(QUALITES_BAILLEUR).toContain("Indivision (personnes physiques)");
    expect(normaliserQualiteBailleur("Indivision")).toBe("Indivision (personnes physiques)");
    expect(normaliserQualiteBailleur("personne_physique")).toBe("Personne physique");
    expect(estQualiteBailleur(normaliserQualiteBailleur("SARL Bidule"))).toBe(false);
  });
  it("3 ans : physique, indivision, SCI familiale ; 6 ans : SCI, personne morale, et tout mélange qui en contient", () => {
    expect(dureeBailNuAnnees(["SCI familiale"])).toBe(3);
    expect(dureeBailNuAnnees(["Indivision (personnes physiques)"])).toBe(3);
    expect(dureeBailNuAnnees([null])).toBe(3);
    expect(dureeBailNuAnnees(["SCI"])).toBe(6);
    expect(dureeBailNuAnnees(["Personne physique", "Personne morale"])).toBe(6);
    expect(dureeBailNuAnnees(["Personne physique", "SCI familiale"])).toBe(3);
  });
  it("le bail PDF applique la même règle", () => {
    const avec = (qualites: string[]) =>
      construireBailNu(
        contexte({
          bailleurs: qualites.map((q, i) => ({ ...personne({ id: `b${i}`, nom: `B${i}`, prenom: null, qualite: q }), quote_part: 100 / qualites.length })),
        }),
        { dpeClasse: "D", f: new Fusion() }
      ).html;
    expect(avec(["SCI familiale"])).toMatch(/Durée du contrat : <span class="v">trois ans/);
    expect(avec(["Indivision (personnes physiques)"])).toMatch(/Durée du contrat : <span class="v">trois ans/);
    expect(avec(["SCI"])).toMatch(/Durée du contrat : <span class="v">six ans/);
    expect(avec(["Personne physique", "Personne morale"])).toMatch(/Durée du contrat : <span class="v">six ans/);
  });
});

// ---------------------------------------------------------------------------
// Constat 4 — cautionnement sans durée : faculté de résiliation (art. 22-1)
// ---------------------------------------------------------------------------
describe("acte de cautionnement", () => {
  it("reproduit l'avant-dernier alinéa de l'article 22-1 (engagement sans durée)", async () => {
    const ctx = contexte();
    ctx.garants = [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }];
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx);
    const doc = await assemblerCautionnement({} as SupabaseClient, "org", "b1", { garant: "g1", montant_max: "15000" });
    expect(html(doc)).toContain(RESILIATION_CAUTION_DUREE_INDETERMINEE);
    expect(RESILIATION_CAUTION_DUREE_INDETERMINEE).toMatch(/^Lorsque le cautionnement d'obligations résultant d'un contrat de location/);
    expect(RESILIATION_CAUTION_DUREE_INDETERMINEE).toMatch(/au cours duquel le bailleur reçoit notification de la résiliation\.$/);
  });
});

// ---------------------------------------------------------------------------
// Constats 8 et 20 — congé pour vente : prix et terme calculé
// ---------------------------------------------------------------------------
describe("congé du bailleur (PDF)", () => {
  const client = (termes: string[]) => {
    const rpc = vi.fn(async () => ({ data: termes.shift() ?? null, error: null }));
    return { client: { rpc } as unknown as SupabaseClient, rpc };
  };

  it("vente en location nue : pas de PDF sans prix", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const { client: c } = client(["2029-08-31"]);
    const doc = await assemblerCongeBailleur(c, "org", "b1", { motif: "vente" });
    expect("erreur" in doc && doc.erreur).toMatch(/prix de vente proposé/);
  });

  it("vente en location nue : le prix et le terme calculé par la base sont imprimés", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const { client: c, rpc } = client(["2029-08-31"]);
    const doc = await assemblerCongeBailleur(c, "org", "b1", {
      motif: "vente",
      prix_vente: "245 000",
      date_presentation: "2029-01-10",
      date_effet: "2026-12-25", // une date saisie à la main n'est plus lue
    });
    const h = html(doc);
    expect(rpc).toHaveBeenCalledWith("terme_bail", { p_bail: "b1", p_date: "2029-01-10" });
    expect(h).toMatch(/245\s000,00\s€/);
    expect(h).toContain("deux cent quarante-cinq mille euros");
    expect(h).toContain("soit le <span class=\"v\">31/08/2029</span>");
    expect(h).not.toContain("25/12/2026");
  });

  it("présenté trop tard pour le terme en cours : vise le terme suivant", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const { client: c, rpc } = client(["2029-08-31", "2032-08-31"]);
    const doc = await assemblerCongeBailleur(c, "org", "b1", {
      motif: "vente",
      prix_vente: "200000",
      date_presentation: "2029-04-01",
    });
    expect(rpc).toHaveBeenLastCalledWith("terme_bail", { p_bail: "b1", p_date: "2029-09-01" });
    expect(html(doc)).toContain("soit le <span class=\"v\">31/08/2032</span>");
    expect(html(doc)).toContain("il vise l'échéance suivante");
  });

  it("vente en meublé : le prix reste facultatif (art. 25-8)", async () => {
    const ctx = contexte();
    ctx.bail.type = "meuble";
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx);
    const { client: c } = client(["2027-08-31"]);
    const doc = await assemblerCongeBailleur(c, "org", "b1", { motif: "vente", date_presentation: "2027-01-10" });
    expect("erreur" in doc).toBe(false);
    expect(html(doc)).toContain("n'emporte pas offre de vente");
  });

  it("délai de préavis : même arithmétique que la base", () => {
    expect(ajouterMois("2026-08-31", 6)).toBe("2027-02-28");
    expect(congeBailleurDansLesDelais("2029-02-28", "2029-08-31", 6)).toBe(true);
    expect(congeBailleurDansLesDelais("2029-03-02", "2029-08-31", 6)).toBe(false);
    expect(prixDepuisOptions("245 000,50")).toBe(245000.5);
    expect(prixDepuisOptions("0")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constat 22 — mandat de gestion : mentions dues au consommateur
// ---------------------------------------------------------------------------
describe("mandat de gestion : mandant personne physique", () => {
  const faux = (qualite: string | null, prenom: string | null) => {
    const donnees: Record<string, unknown> = {
      mandats: { id: "m1", person_id: "p1", etat: "actif", date_rapport: 5, seuil_delegation: null, duree_mois: 12, preavis_mois: 3, date_debut: "2026-10-01" },
      organizations: { name: "Agence Alpha", type: "agence", address_line1: "5 place du Marché", postal_code: "69001", city: "Lyon", telephone: "04", email_contact: "a@b.fr", siret: "123", carte_pro: "CPI 6901", garantie_financiere: "Galian 110 000 €" },
      persons: { id: "p1", nom: "Moreau", prenom, email: "c@m.fr", telephone: null, address_line1: "8 av. des Tilleuls", postal_code: "69006", city: "Lyon", qualite },
      mandat_lignes: [],
    };
    return {
      from: (table: string) => {
        const b: Record<string, unknown> = {
          maybeSingle: async () => ({ data: donnees[table], error: null }),
          then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: donnees[table], error: null }).then(ok),
        };
        for (const op of ["select", "eq", "is", "order"]) b[op] = () => b;
        return b;
      },
    } as unknown as SupabaseClient;
  };

  it("personne physique : rétractation 14 jours et formulaire, médiateur, reconduction tacite", async () => {
    const doc = await assemblerMandatGestion(faux("Personne physique", "Claire"), "org", "m1");
    const h = html(doc);
    expect(h).toContain("V — Informations du mandant consommateur");
    expect(h).toContain("quatorze jours");
    expect(h).toContain("L221-18");
    expect(h).toContain("Formulaire de rétractation");
    expect(h).toContain("médiateur de la");
    expect(h).toContain("L215-1");
    expect(h).toContain("VII — Date et signatures");
  });

  it("personne morale : pas de mentions consommateur", async () => {
    const doc = await assemblerMandatGestion(faux("SCI", null), "org", "m1");
    expect(html(doc)).not.toContain("mandant consommateur");
    expect(html(doc)).toContain("VI — Date et signatures");
  });

  it("qualification du mandant", () => {
    expect(estPersonnePhysique("Indivision (personnes physiques)")).toBe(true);
    expect(estPersonnePhysique("SCI familiale")).toBe(false);
    expect(estPersonnePhysique(null, "Claire")).toBe(true);
    expect(estPersonnePhysique(null, null)).toBe(false);
    expect(mentionsConsommateur(new Fusion(), "V", { nom: "A", mediateur: "Médiateur X, 1 rue Y" })).toContain("Médiateur X, 1 rue Y");
  });
});
