/**
 * Audit métier du 27/09 — non-régression côté documents, e-mails et écrans.
 *
 * Chaque cas rejoue un constat de l'audit (chiffres de l'audit quand il en
 * donne). Les corrections en base sont couvertes par
 * `audit-metier-2026-09-27.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte } from "./fixtures/contexte-document";
import { Fusion } from "@/lib/documents/gabarit";
import {
  assemblerComplementGestion,
  libelleSoldeRegularisation,
  moisEnToutesLettres,
} from "@/lib/documents/modeles/catalogue-gestion";
import { construireRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { construireQuittance, versementsDuTerme, type DonneesQuittance } from "@/lib/documents/modeles/quittance";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { bornesTerme, chargerContexteBail, libelleCharges } from "@/lib/documents/modeles/communs";
import { finDelaiRestitution, libelleJustificatifRetenue } from "@/lib/documents/modeles/decompte-restitution";
import { corpsRelanceLoyer } from "@/lib/relance-loyer-email";
import { derniereDateAnniversaire, exerciceRegularisationParDefaut } from "@/lib/baux";
import { verifierHonorairesContrat } from "@/lib/mentions-contrat";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
}));

const exp = { nom: "Agence Alpha", adresse: "5 place du Marché, 69001 Lyon", email: "a@b.fr", telephone: "04", ville: "Lyon" };

// ---------------------------------------------------------------------------
// BLOQUANT — sens de la régularisation dans le PDF
// ---------------------------------------------------------------------------
describe("régularisation : le PDF dit le bon sens du solde", () => {
  it("écart positif = trop-perçu en faveur du locataire, négatif = complément", () => {
    // Exemple du wiki : 1 200 € de provisions, 1 006,03 € de réel → +193,97 €
    expect(libelleSoldeRegularisation(193.97)).toMatch(/^Trop-perçu en faveur du locataire : 193,97/);
    expect(libelleSoldeRegularisation(-300)).toMatch(/^Complément à régler par le locataire : 300,00/);
    expect(libelleSoldeRegularisation(0)).toMatch(/équilibrées/);
  });

  it("le décompte généré ne réclame pas au locataire ce qu'on lui doit", async () => {
    const ctx = contexte();
    ctx.bail.etat = "actif";
    ctx.bail.charges_mode = "provision";
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx);
    const tables: Record<string, Record<string, unknown>[]> = {
      organizations: [{ id: "org", ...ctx.organisation, type: "agence" }],
      regularisations_charges: [
        { id: "reg", bail_id: "b1", annee: 2025, provisions: 1200, charges_reelles: 1006.03, ecart: 193.97, justificatif_document: "doc", date_emission: "2026-01-10" },
      ],
    };
    const q = (table: string) => {
      const r: Record<string, unknown> = {
        then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok),
      };
      for (const op of ["select", "eq", "order", "limit", "in", "is", "gte", "lt"]) r[op] = () => r;
      return r;
    };
    const db = { from: q, rpc: q } as unknown as SupabaseClient;
    const r = await assemblerComplementGestion("regularisation_charges", db, "org", "reg", { consultation: "à l'agence" });
    if ("erreur" in r) throw new Error(r.erreur);
    expect(r.document.html).toContain("Trop-perçu en faveur du locataire : 193,97");
    expect(r.document.html).not.toContain("Solde à régler");
  });
});

// ---------------------------------------------------------------------------
// BLOQUANT — lettre de révision IRL : les indices bien nommés
// ---------------------------------------------------------------------------
describe("révision IRL : la lettre nomme l'indice réellement utilisé", () => {
  it("indice de référence = dernière révision ou indice du bail ; charges au bon libellé", () => {
    const html = construireRevisionIrl({
      reference: "IRL-1",
      dateEffet: "2026-09-01",
      ancienLoyer: 764.78,
      nouveauLoyer: 774.96,
      irlReference: 148.03,
      irlNouveau: 150,
      trimestre: "2e trimestre",
      charges: 50,
      chargesMode: "provision",
      bailleurNom: "Paul",
      locatairesNoms: "Julie",
      logementAdresse: "1 rue",
      referenceBail: "BAIL-1",
      exp,
      f: new Fusion(),
    }).html;
    expect(html).not.toContain("Indice de l'année précédente");
    expect(html).toContain("Indice de référence (dernière révision, à défaut indice figé au bail)");
    expect(html).toContain("Nouvel indice retenu");
    expect(html).toContain("Provision sur charges (inchangé)");
  });
});

// ---------------------------------------------------------------------------
// MAJEUR — quittance : le règlement du terme, pas le dernier du bail ;
// pas de ligne de régularisation hors total
// ---------------------------------------------------------------------------
describe("quittance : les versements qui ont couvert CE terme", () => {
  const appels = [
    { id: "jan", periode: "2026-01-01", montant_du: 700 },
    { id: "fev", periode: "2026-02-01", montant_du: 700 },
    { id: "mar", periode: "2026-03-01", montant_du: 700 },
  ];
  it("janvier réglé le 03/01 par virement reste « le 03/01 par virement » après un versement en espèces en mars", () => {
    const versements = [
      { date_paiement: "2026-03-02", mode: "espèces", montant: 700 },
      { date_paiement: "2026-01-03", mode: "virement", montant: 700 },
      { date_paiement: "2026-02-03", mode: "virement", montant: 700 },
    ];
    expect(versementsDuTerme(appels, versements, "jan")).toEqual([{ date: "2026-01-03", mode: "virement", montant: 700 }]);
    expect(versementsDuTerme(appels, versements, "mar")).toEqual([{ date: "2026-03-02", mode: "espèces", montant: 700 }]);
  });
  it("un terme soldé en plusieurs versements les cite tous, pour la part imputée", () => {
    const versements = [
      { date_paiement: "2026-01-03", mode: "virement", montant: 1000 },
      { date_paiement: "2026-02-20", mode: "chèque", montant: 400 },
    ];
    expect(versementsDuTerme(appels, versements, "fev")).toEqual([
      { date: "2026-01-03", mode: "virement", montant: 300 },
      { date: "2026-02-20", mode: "chèque", montant: 400 },
    ]);
  });

  function donnees(sur: Partial<DonneesQuittance> = {}): DonneesQuittance {
    return {
      estQuittance: true,
      reference: "QUIT-1",
      dateEmission: "2026-09-20",
      periode: "2026-09-01",
      loyerHc: 346.67,
      charges: 26.67,
      montant: 373.34,
      montantDu: 373.34,
      prorata: true,
      chargesMode: "provision",
      regularisation: 193.97,
      encaissements: [
        { date: "2026-09-16", mode: "virement", montant: 200 },
        { date: "2026-09-18", mode: "chèque", montant: 173.34 },
      ],
      bailleurNom: "Paul",
      locatairesNoms: "Julie",
      logementAdresse: "1 rue",
      referenceBail: "BAIL-1",
      dateBail: "2026-09-15",
      exp,
      f: new Fusion(),
      ...sur,
    };
  }
  it("période bornée à l'entrée, sans ligne de régularisation, bail « prenant effet le »", () => {
    const html = construireQuittance(donnees()).html;
    expect(html).toContain("Période du 15/09/2026 au 30/09/2026");
    expect(html).not.toContain("Régularisation de charges");
    expect(html).toContain("prenant effet le");
    expect(html).toContain("Provision sur charges");
    expect(html).toContain("Règlements reçus sur ce terme");
    expect(html).toContain("chèque");
  });
});

describe("bornes d'un terme", () => {
  it("mois plein, entrée et sortie en cours de mois", () => {
    expect(bornesTerme("2026-09-01", false, "2026-09-15", null)).toEqual({ du: "2026-09-01", au: "2026-09-30" });
    expect(bornesTerme("2026-09-01", true, "2026-09-15", null)).toEqual({ du: "2026-09-15", au: "2026-09-30" });
    expect(bornesTerme("2027-02-01", true, "2026-09-15", "2027-02-10")).toEqual({ du: "2027-02-01", au: "2027-02-10" });
    expect(libelleCharges("forfait")).toBe("Forfait de charges");
  });
});

// ---------------------------------------------------------------------------
// MINEUR — avis d'échéance : solde antérieur, prorata, lieu de paiement
// ---------------------------------------------------------------------------
describe("avis d'échéance PDF", () => {
  it("annonce le solde antérieur comme l'e-mail, et le lieu de paiement du bail", () => {
    const f = new Fusion();
    const html = construireAvisEcheance({
      reference: "AVIS-1",
      periode: "2026-10-01",
      dateEcheance: "2026-10-05",
      loyerHc: 650,
      charges: 50,
      montantDu: 700,
      prorata: false,
      arriere: 400,
      chargesMode: "provision",
      lieuPaiement: "Virement sur le compte de l'agence",
      iban: "FR76 0000",
      bailleurNom: "Paul",
      locatairesNoms: "Julie",
      logementAdresse: "1 rue",
      referenceBail: "BAIL-1",
      dateBail: "2026-09-15",
      exp,
      f,
    }).html;
    expect(html).toContain("Solde antérieur restant dû : 400,00");
    expect(html).toMatch(/1\s100,00/);
    expect(html).toContain("Virement sur le compte de l");
    expect(f.manquants).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MAJEUR — décompte de restitution : date limite et justificatifs
// ---------------------------------------------------------------------------
describe("décompte de restitution", () => {
  it("la date limite ne déborde pas sur le mois suivant (comme la base)", () => {
    expect(finDelaiRestitution("2026-01-31", 1)).toBe("2026-02-28");
    expect(finDelaiRestitution("2025-12-31", 2)).toBe("2026-02-28");
    expect(finDelaiRestitution("2026-08-31", 1)).toBe("2026-09-30");
    expect(finDelaiRestitution("2024-01-31", 1)).toBe("2024-02-29");
    expect(finDelaiRestitution("2026-03-15", 2)).toBe("2026-05-15");
  });
  it("« sur demande » est réservé aux pièces déposées", () => {
    expect(libelleJustificatifRetenue({ sans_justificatif: true, justificatif_document: null })).toBe("Non fourni");
    expect(libelleJustificatifRetenue({ sans_justificatif: false, justificatif_document: "doc" })).toBe("Déposé — sur demande");
  });
});

// ---------------------------------------------------------------------------
// MAJEUR — relance automatique : la dette totale
// ---------------------------------------------------------------------------
describe("relance automatique", () => {
  it("dit la dette totale quand plusieurs termes sont impayés", () => {
    const html = corpsRelanceLoyer({
      niveau: "relance_1",
      prenom: "Claire",
      emetteur: "Agence",
      lot: "Lot 1",
      periode: "2026-07-01",
      dateEcheance: "2026-07-05",
      reste: 700,
      totalDu: 2100,
      lien: "https://x",
    });
    expect(html).toMatch(/2\s100,00/);
    expect(html).toContain("tous termes échus confondus");
  });
});

// ---------------------------------------------------------------------------
// Écrans : exercice par défaut, date anniversaire, honoraires, rapport
// ---------------------------------------------------------------------------
describe("valeurs proposées à l'écran", () => {
  it("exercice de régularisation couvert par le bail (bail de septembre 2026 → 2026)", () => {
    expect(exerciceRegularisationParDefaut("2026-09-01", null, "2026-09-27")).toBe(2026);
    expect(exerciceRegularisationParDefaut("2024-03-01", null, "2026-09-27")).toBe(2025);
    expect(exerciceRegularisationParDefaut("2020-01-01", "2023-06-30", "2026-09-27")).toBe(2023);
  });
  it("dernière date anniversaire atteinte, jamais avant le premier anniversaire", () => {
    expect(derniereDateAnniversaire("2024-09-01", "2026-09-27")).toBe("2026-09-01");
    expect(derniereDateAnniversaire("2024-10-15", "2026-09-27")).toBe("2025-10-15");
    expect(derniereDateAnniversaire("2026-09-01", "2026-09-27")).toBeNull();
    expect(derniereDateAnniversaire("2024-02-29", "2025-03-01")).toBe("2025-02-28");
  });
  it("honoraires locataire : date et zone exigées pour vérifier le plafond", () => {
    expect(verifierHonorairesContrat({ honoraires_bailleur: 6000, honoraires_locataire: 5000 }, 50)).toMatch(/date prévue de conclusion et la zone/);
    expect(verifierHonorairesContrat({ honoraires_bailleur: 100, honoraires_locataire: 0 }, 50)).toBeNull();
  });
  it("le rapport de gestion écrit le mois en toutes lettres", () => {
    expect(moisEnToutesLettres("2026-09-01")).toBe("septembre 2026");
  });
});

// ---------------------------------------------------------------------------
// MAJEUR — colocation : relance à chaque colocataire
// ---------------------------------------------------------------------------
const envois = vi.hoisted(() => ({ destinataires: [] as string[], notes: [] as string[] }));
vi.mock("@/lib/email", () => ({
  envoyerEmail: vi.fn(async (p: { to: string }) => {
    envois.destinataires.push(p.to);
    return { id: "ok" };
  }),
}));
vi.mock("@/lib/tache", () => ({ consignerTache: vi.fn(async () => undefined) }));
vi.mock("@/lib/site", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  adresseDuSite: () => "https://gerimmo.test",
}));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => ({
    rpc: async (nom: string, args: { p_note?: string }) => {
      if (nom === "relances_loyer_dues")
        return {
          data: [
            {
              bail_id: "b1", organization_id: "o1", niveau: "relance_1", destinataire: "claire@exemple.fr",
              prenom: "Claire", emetteur: "Agence", lot: "Lot 1", periode: "2026-07-01", date_echeance: "2026-07-05",
              reste: 700, jours_retard: 20, total_du: 2100, autres_destinataires: ["leo@exemple.fr"],
            },
          ],
          error: null,
        };
      if (nom === "relance_loyer_consigner") envois.notes.push(String(args.p_note));
      return { data: "id", error: null };
    },
  }),
}));

describe("relances automatiques : tous les colocataires", () => {
  beforeEach(() => {
    envois.destinataires = [];
    envois.notes = [];
    vi.stubEnv("CRON_SECRET", "secret-de-recette");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("écrit au principal et à chaque colocataire, et consigne une seule relance", async () => {
    const { GET } = await import("../src/app/api/cron/relances/route");
    const r = await GET(new Request("https://x/api/cron/relances", { headers: { authorization: "Bearer secret-de-recette" } }));
    expect(await r.json()).toMatchObject({ envoyees: 1, echecs: 0 });
    expect(envois.destinataires).toEqual(["claire@exemple.fr", "leo@exemple.fr"]);
    expect(envois.notes).toHaveLength(1);
    expect(envois.notes[0]).toContain("2100.00 € dus au total");
  });
});
