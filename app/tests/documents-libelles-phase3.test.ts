/**
 * Phase 3 de la mission palier 1, lot 36 — des libellés lisibles à la place des codes de la base.
 *
 * Défauts relevés sur les PDF des dossiers fictifs : C02 (type de diagnostic), C03 (état du mobilier), C48 (mode de
 * règlement de la quittance), C64 (titres de classement), C67 et C68 (période des tableaux d'échéances, terme au
 * prorata), C78 (description d'un devis), C81 (catégorie, état, nature, statut, imputation, décision), C83 (destinataire
 * « Organisation »), C92 (mois du journal, sens « depense »), S34 et S46 (liste de choix des dossiers).
 * Chaque cas ci-dessous échouait avant le correctif. Les tables de libellés sont celles des écrans.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, libellePeriodeTerme, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { assemblerQuittance, libelleMode } from "@/lib/documents/modeles/quittance";
import { assemblerProrata } from "@/lib/documents/modeles/prorata";
import { assemblerRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { assemblerRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { assemblerRecuDepot } from "@/lib/documents/modeles/recu-depot";
import { chargerCiblesCatalogue } from "@/lib/documents/catalogue-cibles";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { Fusion, moisEnToutesLettres } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { detailRapportGestion } from "@/lib/documents/modeles/detail-rapport-gestion";
import { ETATS_ELEMENT } from "@/lib/etats-elements-edl";
import { ETATS_INCIDENT, ETATS_INCIDENT_DOCUMENT } from "@/lib/incidents";
import { STATUTS_INTERVENTION, STATUTS_INTERVENTION_DOCUMENT } from "@/app/agence/[orgId]/artisans/referentiel";

type Ligne = Record<string, unknown>;

/** Une base simulée : chaque table rend toutes ses lignes (les filtres sont ignorés), `maybeSingle` la première. */
function base(tables: Record<string, Ligne[]>): SupabaseClient {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = () => q;
    return q;
  };
  return { from: requete, rpc: (nom: string) => requete(nom) } as unknown as SupabaseClient;
}

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
/** Le texte lisible du document (sans feuille de style ni balises). */
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, "");

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("C02 — bordereau des diagnostics : le type s'imprime avec le libellé de l'écran", () => {
  it("« Amiante (privatif) », « ERP — état des risques », jamais amiante_privatif ni erp", async () => {
    const r = succes(await assemblerComplementBail("bordereau_ddt", base({
      diagnostics: [
        { type: "amiante_privatif", date_realisation: "2025-10-19", date_expiration: null, diagnostiqueur: "Diag Test", document_id: "doc" },
        { type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", diagnostiqueur: "Diag Test", document_id: "doc" },
        { type: "dpe", date_realisation: "2024-03-12", date_expiration: "2034-03-11", diagnostiqueur: "Diag Test", document_id: "doc" },
      ],
    }), "org", "b1"));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Amiante (privatif)");
    expect(texte).toContain("ERP — état des risques");
    expect(texte).toContain("DPE");
    expect(texte).not.toMatch(/amiante_privatif|\berp\b/);
  });
});

describe("C03 — inventaire autonome : l'état du mobilier comme dans l'annexe du bail meublé", () => {
  it.each(["inventaire_entree", "inventaire_sortie"] as const)("%s : « Usagé », « Bon », « Neuf »", async (code) => {
    ctx.lot.meuble = true;
    if (code === "inventaire_sortie") ctx.bail.etat = "preavis";
    const r = succes(await assemblerComplementBail(code, base({
      inventaire_lignes: [
        { piece: "Séjour", designation: "Table", quantite: 1, etat: "usage", observation: "Rayure légère" },
        { piece: "Séjour", designation: "Canapé", quantite: 1, etat: "bon", observation: "RAS" },
        { piece: "Cuisine", designation: "Bouilloire", quantite: 1, etat: "neuf", observation: "RAS" },
      ],
    }), "org", "b1", { date_constat: "2026-11-01", constat: "Conforme" }));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Usagé");
    expect(texte).toContain("Bon");
    expect(texte).toContain("Neuf");
    expect(texte).not.toMatch(/\busage\b|\bbon\b|\bneuf\b/);
  });
});

describe("C67, C68 — période des tableaux d'échéances", () => {
  it("libellePeriodeTerme : le mois en toutes lettres ; un prorata le dit avec ses bornes réelles", () => {
    expect(libellePeriodeTerme("2026-11-01", false, "2025-02-15", null)).toBe("novembre 2026");
    expect(libellePeriodeTerme("2025-02-01", true, "2025-02-15", null)).toBe("février 2025 — prorata du 15/02 au 28/02");
    // Sortie en cours de mois.
    expect(libellePeriodeTerme("2026-03-01", true, "2024-01-01", "2026-03-10")).toBe("mars 2026 — prorata du 01/03 au 10/03");
    // Un appel marqué au prorata que les dates du bail ne bornent pas : il le dit, sans inventer de dates.
    expect(libellePeriodeTerme("2026-04-01", true, "2024-01-01", null)).toBe("avril 2026 — au prorata");
  });

  const termes = [
    { appel_id: "a-fev", periode: "2025-02-01", date_echeance: "2025-02-15", montant_du: 490, montant_couvert: 490 },
    { appel_id: "a-nov", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 980, montant_couvert: 0 },
  ];
  it.each(["situation_dette", "relance_simple", "protocole_apurement"] as const)("%s : « novembre 2026 », jamais « 2026-11-01 »", async (code) => {
    ctx.bail.date_debut = "2025-02-15";
    const r = succes(await assemblerComplementBail(code, base({
      restitutions: [], relances: [], etat_loyers_bail: termes,
      organizations: [{ id: "org", type: "proprietaire_direct", relance_1_jours: 5, relance_2_jours: 15 }],
      // Seuls les appels au prorata sont lus (filtre prorata = vrai) : la base simulée ne rend que celui de février.
      appels_loyer: [{ id: "a-fev" }],
    }), "org", "b1", { mensualites: "2", premiere_echeance: "2026-12-05", conditions: "Accord" }));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("novembre 2026");
    expect(texte).not.toMatch(/20\d\d-\d\d-\d\d/);
    if (code === "situation_dette") expect(texte).toContain("février 2025 — prorata du 15/02 au 28/02");
  });
});

describe("C48 — quittance du catalogue : le mode de règlement en toutes lettres, comme la quittance délivrée", () => {
  function client(mode: string) {
    return base({
      quittances: [{ id: "q0000000-0000", bail_id: "b1", appel_id: "a1", est_quittance: true, montant: 700, date_emission: "2026-05-07" }],
      appels_loyer: [{ id: "a1", periode: "2026-05-01", loyer_hc: 650, charges: 50, montant_du: 700, prorata: false }],
      encaissements: [{ date_paiement: "2026-05-07", mode, montant: 700, created_at: null }],
    });
  }
  it.each([["cheque", "chèque"], ["caf", "versement CAF / APL"], ["especes", "espèces"], ["prelevement", "prélèvement"]])("%s → « par %s »", async (code, libelle) => {
    const r = succes(await assemblerQuittance(client(code), "org", "q1"));
    expect(texteDe(r.document.html)).toMatch(new RegExp(`Règlement reçu le 07/05/2026 par ${libelle}`));
    expect(libelleMode(code)).toBe(libelle);
  });
  it("le reçu de dépôt : « Virement » pour le code du sélecteur, un texte saisi en clair inchangé", async () => {
    const client = (moyen: string) => base({ depot_encaissements: [{ id: "d0000000", bail_id: "b1", montant: 650, date_encaissement: "2026-09-01", moyen, versant_libelle: "Leblanc Julie", versant_person_id: null }] });
    expect(succes(await assemblerRecuDepot(client("virement"), "org", "d1")).document.html).toContain('<span class="v">Virement</span>');
    expect(texteDe(succes(await assemblerRecuDepot(client("Virement bancaire"), "org", "d1")).document.html)).toContain("Virement bancaire");
  });
});

describe("C64 — titres de classement : dates françaises, mois en toutes lettres, locataire nommé", () => {
  it("révision : « effet au 15/10/2026 »", async () => {
    const r = succes(await assemblerRevisionIrl(base({ revisions_loyer: [{ id: "r1", bail_id: "b1", date_effet: "2026-10-15", date_echeance: null, date_demande: null, irl_trimestre: "2e trimestre 2026", ancien_loyer: 700, nouveau_loyer: 710.5, irl_reference: 140, irl_nouveau: 142.1 }] }), "org", "r1"));
    expect(r.titreGed).toBe("Révision IRL — effet au 15/10/2026");
  });
  it("prorata : « octobre 2025 »", async () => {
    ctx.bail.date_debut = "2025-10-15";
    const r = succes(await assemblerProrata(base({ appels_loyer: [{ id: "a1", bail_id: "b1", periode: "2025-10-01", loyer_hc: 350, charges: 25, montant_du: 375, prorata: true }] }), "org", "a1"));
    expect(r.titreGed).toBe("Décompte de prorata — octobre 2025");
  });
  it("demande d'attestation d'assurance : le locataire concerné, « Nom Prénom »", async () => {
    const r = succes(await assemblerRappelAssurance(base({
      documents: [{ id: "doc1", type: "attestation_assurance", expire_le: "2026-09-30" }],
      organizations: [{ name: "Parc de Claire Moreau", type: "proprietaire_direct", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: null, email_contact: "c@x.fr" }],
      document_liens: [{ entite_id: "p1" }],
      persons: [{ id: "p1", nom: "Fictive", prenom: "Nadia" }],
      baux: [],
    }), "org", "doc1"));
    expect(r.titreGed).toBe("Demande d'attestation d'assurance — Fictive Nadia");
  });
});

/** Les données d'un incident chez un propriétaire, telles que la base les enregistre (codes). */
function incidents(): Record<string, Ligne[]> {
  return {
    organizations: [{ id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", city: "Lyon" }],
    lots: [{ id: "lot", nom: "Studio meublé n° 7", bien_id: "bien", meuble: true }],
    biens: [{ id: "bien", address_line1: "5 quai des Essais", postal_code: "69007", city: "Lyon" }],
    incidents: [{ id: "incident", numero: "INC-2026-0002", lot_id: "lot", description: "Le radiateur ne chauffe plus.", piece: "Séjour", categorie: "chauffage_panne", etat: "en_cours", imputation: "proprietaire", imputation_justification: "Usure.", clos_le: null }],
    // Reprise du lot 42 (C80) : la mission porte son devis, comme toute mission créée par l'application (retenir_devis) ;
    // l'ordre d'une mission sans devis est désormais refusé (il ne commandait rien).
    incident_interventions: [{ id: "intervention", incident_id: "incident", artisan_id: "artisan", devis_id: "devis", nature_travaux: "entretien_courant", statut: "planifiee", confiee_le: "2026-11-22", debut_prevu: "2026-11-26", fin_prevue: "2026-11-26" }],
    artisans: [{ id: "artisan", raison_sociale: "Plomberie Fictive", siret: "12345678901234", telephone: "0600000000", email: "a@x.fr" }],
    intervention_comptes_rendus: [{ travaux_realises: "Thermostat remplacé.", cause_reelle: "Usure.", montant_final_cents: 16170, nouvelle_intervention_necessaire: false, created_at: "2026-11-26" }],
    incident_devis: [
      { id: "devis", artisan_id: "artisan", statut: "retenu", montant_ttc_cents: 18700, depose_le: "2026-11-21T17:05:00+00:00", valide_jusqu_au: "2026-12-14",
        description: "Diagnostic : Joint du siphon fendu.\n\nTravaux proposés : Remplacement du siphon.\nSiphon PVC : 1 × 45.0000000000000000 € HT — TVA 10.0000000000000000 % — 49.5000000000000000 € TTC\nMain-d'œuvre (1 h 30) : 1.5 × 60.0000000000000000 € HT — TVA 10.0000000000000000 % — 99.0000000000000000 € TTC" },
      { artisan_id: "artisan", statut: "non_retenu", montant_ttc_cents: 26180, valide_jusqu_au: "2026-12-15", description: "Remplacement : 2 × 60.0000000000000000 € HT" },
    ],
  };
}

describe("C81 — documents d'incident : les libellés des écrans, pas les codes", () => {
  it("ordre d'intervention : catégorie, état, nature et statut lisibles", async () => {
    const r = succes(await assemblerComplementGestion("ordre_intervention", base(incidents()), "org", "intervention", { acces: "Clé chez la gardienne." }));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("catégorie : Chauffage — radiateur ou eau chaude en panne ; état : En cours.");
    expect(texte).toContain("Entretien courant ou réparation simple.");
    expect(texte).toContain("État de la mission : Planifiée ;");
    expect(texte).not.toMatch(/chauffage_panne|en_cours|entretien_courant|planifiee/);
  });
  it("compte rendu : « Terminée »", async () => {
    const t = incidents(); t.incident_interventions[0].statut = "terminee";
    const texte = texteDe(succes(await assemblerComplementGestion("compte_rendu_intervention", base(t), "org", "intervention")).document.html);
    expect(texte).toContain("État de la mission : Terminée ;");
    expect(texte).not.toContain("terminee");
  });
  it("récapitulatif : imputation « Charge propriétaire »", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("recap_incident", base(incidents()), "org", "incident")).document.html);
    expect(texte).toContain("Imputation enregistrée : Charge propriétaire.");
    expect(texte).not.toMatch(/: proprietaire/);
  });
  it("comparatif : décision « Retenu » / « Non retenu » ; C78 : prix en français, lignes conservées", async () => {
    const r = succes(await assemblerComplementGestion("comparatif_devis", base(incidents()), "org", "incident"));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Non retenu");
    expect(texte).toContain("Retenu");
    // Phase 3, lot 42 (C86) : la phrase finale dit désormais, en français, que le devis « a été retenu » ; le code de la base
    // (« retenu », « non_retenu ») ne doit toujours pas apparaître ailleurs.
    expect(texte.replace("a été retenu", "")).not.toMatch(/non_retenu|\bretenu\b/);
    expect(texte).toContain("1 × 45,00 € HT — TVA 10,00 % — 49,50 € TTC");
    expect(texte).toContain("1,5 × 60,00 € HT");
    expect(texte).not.toMatch(/\d\.\d{4,}/);
    // Les sauts de ligne de la description restent des sauts de ligne.
    expect(r.document.html).toContain("Diagnostic : Joint du siphon fendu.<br><br>Travaux proposés : Remplacement du siphon.<br>Siphon PVC");
  });
});

describe("C83 — un document interne sans destinataire n'imprime plus « Organisation »", () => {
  it.each(["comparatif_devis", "recap_incident"] as const)("%s : pas de case « Destinataire »", async (code) => {
    const r = succes(await assemblerComplementGestion(code, base(incidents()), "org", "incident"));
    expect(r.document.html).not.toContain(">Destinataire<");
    expect(r.document.html).not.toContain(">Organisation<");
    expect(r.document.html).toContain(">Logement<");
  });
  it("l'ordre d'intervention garde son destinataire réel, l'artisan", async () => {
    const r = succes(await assemblerComplementGestion("ordre_intervention", base(incidents()), "org", "intervention", { acces: "Clé chez la gardienne." }));
    expect(r.document.html).toMatch(/>Destinataire<\/div><div><span class="v">Plomberie Fictive<\/span>/);
  });
});

describe("C92 — journal : le mois en toutes lettres, le sens accentué", () => {
  const ecritures = [
    { id: "e1", lot_id: "lot", libelle: "Loyer d'octobre", sens: "recette", montant: 700, date_imputation: "2026-10-05", date_piece: "2026-10-05" },
    { id: "e2", lot_id: "lot", libelle: "Appel de provisions du syndic", sens: "depense", montant: 310, date_imputation: "2026-10-10", date_piece: "2026-10-10" },
  ];
  it("clôture mensuelle : « Journal — octobre 2026 », « Recette », « Dépense », totaux inchangés", async () => {
    const r = succes(await assemblerComplementGestion("cloture_mensuelle", base({ ...incidents(), ecritures, clotures_comptables: [] }), "org", "org", { mois: "2026-10" }));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Journal — octobre 2026");
    expect(texte).not.toContain("2026-10");
    expect(texte).toContain("Dépense");
    expect(texte).toContain("Recette");
    expect(texte).not.toMatch(/\bdepense\b|\brecette\b/);
    expect(texte).toContain("Total recettes : 700,00 € ; dépenses : 310,00 €.");
    expect(r.document.html).not.toContain(">Destinataire<");
  });
  it("écriture rectificative : « Dépense »", async () => {
    const t = { ...incidents(), ecritures: [{ id: "rect", lot_id: "lot", contre_ecriture_de: "e2", libelle: "Annulation", sens: "depense", montant: 138, date_piece: "2026-10-12", motif: "Doublon." }] };
    const texte = texteDe(succes(await assemblerComplementGestion("ecriture_rectificative", base(t), "org", "rect")).document.html);
    expect(texte).toContain("Dépense");
    expect(texte).not.toMatch(/\bdepense\b/);
  });
  it("moisEnToutesLettres vit dans le gabarit et reste exporté par le catalogue de gestion", async () => {
    expect(moisEnToutesLettres("2026-10")).toBe("octobre 2026");
    expect(moisEnToutesLettres("2026-09-01")).toBe("septembre 2026");
    const { moisEnToutesLettres: reexporte } = await import("@/lib/documents/modeles/catalogue-gestion");
    expect(reexporte).toBe(moisEnToutesLettres);
  });
});

describe("S34, S46 — liste de choix des dossiers", () => {
  const modele = (id: string) => CATALOGUE_DOCUMENTS.find((m) => m.id === id)!;
  it("l'état du bail en clair : « Préavis », « Actif »", async () => {
    const db = base({
      baux: [{ id: "bail-preavis-0000", lot_id: "lot", locataire_principal: "p", etat: "preavis" }, { id: "bail-actif-00000", lot_id: "lot", locataire_principal: "p", etat: "actif" }],
      lots: [{ id: "lot", nom: "Studio meublé n° 12" }], persons: [{ id: "p", nom: "Fictif", prenom: "Hugo" }],
    });
    const libelles = (await chargerCiblesCatalogue(db, "org", modele("attestation_loyer"))).choix.map((c) => c.libelle);
    expect(libelles[0]).toBe("Studio meublé n° 12 · Fictif Hugo · Préavis · réf. bail-pre");
    expect(libelles[1]).toContain("· Actif ·");
    expect(libelles.join(" ")).not.toMatch(/preavis|actif/);
  });
  it("l'état d'un lot et d'un état des lieux en clair : « Loué », « Signé »", async () => {
    const lots = await chargerCiblesCatalogue(base({ lots: [{ id: "lot", nom: "T2", etat: "loue", meuble: false }] }), "org", modele("recap_fiscal_nu"));
    expect(lots.choix[0].libelle).toBe("T2 · Loué · réf. lot");
    const edl = await chargerCiblesCatalogue(base({ etats_des_lieux: [{ id: "edl", bail_id: "b", etat: "signe", date_edl: "2026-10-07", type: "sortie" }], baux: [{ id: "b", lot_id: "lot", locataire_principal: "p" }], lots: [{ id: "lot", nom: "T2" }], persons: [{ id: "p", nom: "Fictif", prenom: "Martin" }] }), "org", modele("edl_sortie"));
    expect(edl.choix[0].libelle).toBe("T2 · Fictif Martin · 07/10/2026 · Signé · réf. edl");
  });
  it("une régularisation porte son exercice", async () => {
    const db = base({
      regularisations_charges: [{ id: "reg2024-000", bail_id: "b", annee: 2024, date_emission: "2026-11-23", note: null }, { id: "reg2025-000", bail_id: "b", annee: 2025, date_emission: "2026-11-23", note: null }],
      baux: [{ id: "b", lot_id: "lot", locataire_principal: "p" }], lots: [{ id: "lot", nom: "T2" }], persons: [{ id: "p", nom: "Fictive", prenom: "Camille" }],
    });
    const libelles = (await chargerCiblesCatalogue(db, "org", modele("regularisation_charges"))).choix.map((c) => c.libelle);
    expect(libelles).toEqual(["T2 · Fictive Camille · Exercice 2024 · 23/11/2026 · réf. reg2024-", "T2 · Fictive Camille · Exercice 2025 · 23/11/2026 · réf. reg2025-"]);
  });
  it("une intervention porte le logement, l'incident, la nature, la date et le statut en clair", async () => {
    const db = base({ ...incidents(), incident_interventions: [{ id: "1eff086b-0000", incident_id: "incident", nature_travaux: "entretien_courant", statut: "planifiee", confiee_le: "2026-11-22T09:00:00+00:00" }] });
    const [choix] = (await chargerCiblesCatalogue(db, "org", modele("ordre_intervention"))).choix;
    expect(choix.libelle).toBe("Studio meublé n° 7 · Incident INC-2026-0002 · Entretien courant ou réparation simple · 22/11/2026 · Planifiée · réf. 1eff086b");
  });
  it("un incident : l'état en clair", async () => {
    const db = base({ ...incidents(), incidents: [{ id: "incident", numero: "INC-2026-0002", lot_id: "lot", etat: "en_cours" }] });
    const [choix] = (await chargerCiblesCatalogue(db, "org", modele("recap_incident"))).choix;
    expect(choix.libelle).toBe("Studio meublé n° 7 · Incident INC-2026-0002 · En cours · réf. incident");
  });
});

/**
 * Reprise du lot 36 (relecture contradictoire du commit 571d6bbe). Chaque cas échouait avant la reprise.
 *  · L'état des lieux gardait sa propre table d'états : « Usage » (le code avec une capitale) au lieu de « Usagé », et « absent »
 *    (valeur admise par l'énumération etat_element) imprimé brut. L'inventaire du même dossier dit « Usagé » (C03).
 *  · Les documents d'incident reprenaient les libellés des tableaux de bord, consignes de travail du gestionnaire comprises
 *    (« Terminé — à clôturer », « Confiée — l'artisan n'a pas encore répondu ») : l'ordre d'intervention part à l'entreprise.
 *  · Relevé annuel du mandat et rapport de gestion : la nature, la famille de dépense et l'état d'un incident en clair (C92).
 */
const lignesDe = (html: string) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/[\u00a0\u202f]/g, " ").trim()).join("|"));

describe("Reprise — état des lieux : l'état d'un élément comme à l'écran et dans l'inventaire", () => {
  const donnees = (sur: Partial<DonneesEdl>): DonneesEdl => ({
    type: "entree", reference: "EDL-1", dateEdl: "2026-10-07", signeLe: null, personnesPresentes: "Les parties",
    detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true, adresseRestitutionDepot: null,
    observations: "Néant", compteurs: [], cles: [], comparatif: [],
    lignes: [
      { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "usage", commentaire: "Rayure de 20 cm près de la fenêtre" },
      { categorie: "piece", piece: "Séjour", libelle: "Volets", etat: "absent", commentaire: null },
      { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "neuf", commentaire: null },
    ],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: null, telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(), ...sur,
  });

  it("entrée : « Usagé » et « Absent », jamais « Usage » ni le code « absent »", () => {
    const lignes = lignesDe(construireEdl(donnees({})).html);
    expect(lignes).toContain("Sols|Usagé|Rayure de 20 cm près de la fenêtre");
    expect(lignes).toContain("Volets|Absent|—");
    expect(lignes).toContain("Murs|Neuf|—");
    expect(lignes.join("\n")).not.toMatch(/\|Usage\||\|absent\|/);
  });

  it("sortie : la synthèse des écarts parle comme la grille", () => {
    const lignes = lignesDe(construireEdl(donnees({
      type: "sortie", dateEdlEntree: "2023-09-01", adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon",
      comparatif: [
        { piece: "Séjour", libelle: "Murs", etat_entree: "neuf", etat_sortie: "usage", ecart: true },
        { piece: "Séjour", libelle: "Volets", etat_entree: "bon", etat_sortie: "absent", ecart: true },
      ],
    })).html);
    expect(lignes).toContain("Séjour|Murs|Neuf|Usagé");
    expect(lignes).toContain("Séjour|Volets|Bon|Absent");
  });

  it("une seule table : celle de l'écran de saisie de la grille", () => {
    expect(ETATS_ELEMENT).toEqual({ neuf: "Neuf", bon: "Bon", usage: "Usagé", mauvais: "Mauvais", absent: "Absent" });
  });
});

describe("Reprise C81 — un document dit l'état, pas la consigne de travail de l'écran", () => {
  it("chaque état d'incident et de mission a son libellé de document, sans consigne (« — à … », « À qualifier »)", () => {
    expect(Object.keys(ETATS_INCIDENT_DOCUMENT).sort()).toEqual(Object.keys(ETATS_INCIDENT).sort());
    expect(Object.keys(STATUTS_INTERVENTION_DOCUMENT).sort()).toEqual(Object.keys(STATUTS_INTERVENTION).sort());
    for (const libelle of [...Object.values(ETATS_INCIDENT_DOCUMENT), ...Object.values(STATUTS_INTERVENTION_DOCUMENT)]) {
      expect(libelle).not.toMatch(/ — |^À |artisan/);
    }
  });

  it.each([
    ["declare", "Signalé"], ["termine", "Terminé"], ["rouvert", "Rouvert"], ["en_cours", "En cours"],
  ])("ordre d'intervention, incident « %s » : état « %s »", async (etat, attendu) => {
    const t = incidents(); t.incidents[0].etat = etat;
    const texte = texteDe(succes(await assemblerComplementGestion("ordre_intervention", base(t), "org", "intervention", { acces: "Clé chez la gardienne." })).document.html);
    expect(texte).toContain(`; état : ${attendu}.`);
    expect(texte).not.toMatch(/à clôturer|à requalifier|À qualifier/);
  });

  it("ordre d'intervention, mission proposée : « En attente de réponse », sans parler de l'artisan à la troisième personne", async () => {
    const t = incidents(); t.incident_interventions[0].statut = "proposee";
    const texte = texteDe(succes(await assemblerComplementGestion("ordre_intervention", base(t), "org", "intervention", { acces: "Clé chez la gardienne." })).document.html);
    expect(texte).toContain("État de la mission : En attente de réponse ; confiée le 22/11/2026.");
    expect(texte).not.toContain("pas encore répondu");
  });

  it("compte rendu, incident terminé : « Terminé », mission « Terminée »", async () => {
    const t = incidents(); t.incidents[0].etat = "termine"; t.incident_interventions[0].statut = "terminee";
    const texte = texteDe(succes(await assemblerComplementGestion("compte_rendu_intervention", base(t), "org", "intervention")).document.html);
    expect(texte).toContain("; état : Terminé.");
    expect(texte).toContain("État de la mission : Terminée ;");
    expect(texte).not.toContain("à clôturer");
  });

  it("récapitulatif d'incident : la colonne « État » des missions sans consigne (mission refusée : « Refusée »)", async () => {
    const t = incidents(); t.incident_interventions[0].statut = "refusee";
    const html = succes(await assemblerComplementGestion("recap_incident", base(t), "org", "incident")).document.html;
    expect(lignesDe(html).some((l) => l.startsWith("Plomberie Fictive|") && l.includes("|Refusée|"))).toBe(true);
    expect(texteDe(html)).not.toContain("à réaffecter");
  });
});

describe("Reprise C92 — documents de mandat : nature, famille de dépense et état d'incident en clair", () => {
  const agence = (): Record<string, Ligne[]> => ({
    organizations: [{ id: "org", type: "agence", name: "Agence Fictive", city: "Lyon" }],
    mandats: [{ id: "mandat-0000", person_id: "mandant", etat: "actif" }],
    persons: [{ id: "mandant", nom: "Fictif", prenom: "Paul" }],
    mandat_lignes: [{ mandat_id: "mandat-0000", lot_id: "lot", date_debut: "2026-01-01", date_fin: null, taux_honoraires: 7 }],
    lots: [{ id: "lot", nom: "T2", bien_id: "bien" }],
    ecritures: [
      { id: "e1", lot_id: "lot", categorie: "loyer", libelle: "Loyer d'octobre", sens: "recette", montant: 700, date_piece: "2026-10-05", date_imputation: "2026-10-05" },
      { id: "e2", lot_id: "lot", categorie: "depot_garantie", libelle: "Dépôt reçu", sens: "recette", montant: 700, date_piece: "2026-10-10", date_imputation: "2026-10-10" },
      { id: "e3", lot_id: "lot", categorie: "taxe_fonciere", libelle: "Taxe foncière", sens: "depense", montant: 310, date_piece: "2026-10-12", date_imputation: "2026-10-12" },
    ],
  });

  it("relevé annuel du mandat : « Loyer », « Dépôt de garantie », « Taxe foncière » (le lot 42 l'avait corrigé ; il reste vérifié ici)", async () => {
    const html = succes(await assemblerComplementGestion("recap_fiscal_agence", base(agence()), "org", "mandat-0000", { annee: "2026" })).document.html;
    const lignes = lignesDe(html);
    expect(lignes).toContain("05/10/2026|Loyer|Loyer d'octobre|Recette|700,00 €");
    expect(lignes).toContain("10/10/2026|Dépôt de garantie|Dépôt reçu|Recette|700,00 €");
    expect(lignes).toContain("12/10/2026|Taxe foncière|Taxe foncière|Dépense|310,00 €");
    expect(texteDe(html)).not.toMatch(/depot_garantie|taxe_fonciere|\bloyer\b/);
  });

  it("rapport de gestion : la famille de dépense et l'état d'un incident ouvert comme à l'écran", async () => {
    const tables: Record<string, Ligne[]> = {
      biens: [{ id: "bien", nom: "Immeuble Fictif", address_line1: "5 quai des Essais" }],
      baux: [], etat_loyers_bail: [],
      incidents: [{ lot_id: "lot", numero: "INC-01", description: "Robinet", etat: "termine" }, { lot_id: "lot", numero: "INC-02", description: "Volet", etat: "declare" }],
    };
    const html = await detailRapportGestion(base(tables), "org", new Fusion(), [{ id: "lot", nom: "T2", bien_id: "bien" }],
      [{ lot_id: "lot", date_debut: "2026-01-01", taux_honoraires: 7 }],
      [{ lot_id: "lot", sens: "depense", montant: 310, categorie: "taxe_fonciere" }, { lot_id: "lot", sens: "depense", montant: 14, categorie: "honoraires" }],
      "2026-10-01", "2026-11-01");
    const lignes = lignesDe(html);
    expect(lignes).toContain("Taxe foncière|310,00 €");
    expect(lignes).toContain("Honoraires|14,00 €");
    expect(lignes).toContain("INC-01|Robinet|Terminé");
    expect(lignes).toContain("INC-02|Volet|Signalé");
    expect(texteDe(html)).not.toMatch(/taxe fonciere|\btermine\b|\bdeclare\b/);
  });
});
