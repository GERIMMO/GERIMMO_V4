/**
 * Phase 3 de la mission palier 1, lot 39 — loyers et impayés : contenus faux ou manquants.
 *
 * Défauts relevés sur les PDF des dossiers fictifs (espaces « loyers » et « impayés ») :
 *  - C47 : le décompte de prorata imprimait comme base le loyer ACTUEL du bail (révisé depuis), et une formule qui ne
 *    redonnait pas le montant imprimé (710,50 × 17 / 31 pour 383,87 €) ;
 *  - C54 : la révision annonçait le loyer révisé « à compter du 15/10/2026 » alors que le terme d'octobre restait appelé à
 *    l'ancien loyer, sans complément ;
 *  - C60, C61 : attestation de loyer et dossier CAF d'un bail en préavis, sans sa date de fin ;
 *  - C50, C72 : un paiement demandé par virement sans compte où verser (« — » sur l'avis, rien sur les courriers d'impayés) ;
 *  - C73 : relevés et courriers sans le reste dû par échéance ;
 *  - C65, C66, C74 : un protocole d'apurement qui promettait la suspension des relances sans plan enregistré, une règle de
 *    caducité que Gerimmo n'applique pas, et des « règlements à déduire avant signature » d'un échéancier ferme ;
 *  - C57, C59 : le rappel d'assurance titré « Attestation d'assurance », et le logement réduit à l'adresse de l'immeuble.
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
// Le palier de relance des courriers est vérifié à part (bloc « suivi des courriers ») avec la vraie fonction.
vi.mock("@/lib/rappels-loyers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifierCourrierDuBail: vi.fn(async () => ({ precedente: "2026-10-12" })),
}));
// Le suivi du tableau de bord (lot 39, reprise) se rend sans serveur : navigation, actions et bouton de document simulés.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/app/actions/reception-loyer", () => ({ declarerReceptionLoyer: vi.fn(), envoyerRelanceReception: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({
  BoutonGenererDocument: ({ code, libelle }: { code: string; libelle: string }) => createElement("button", { "data-modele": code }, libelle),
}));
import { chargerContexteBail, LIBELLE_COORDONNEES_BANCAIRES, type ContexteBail } from "@/lib/documents/modeles/communs";
import { courrierDisponible, pointReception } from "@/lib/paliers-reception-loyer";
import { RappelsLoyersInteractifs } from "@/components/rappels-loyers-interactifs";
import { assemblerComplementBail, LIBELLE_PLAN_A_ENREGISTRER } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerProrata } from "@/lib/documents/modeles/prorata";
import { applicationRevision, assemblerRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { assemblerAvisEcheance, construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { assemblerRappelAssurance, construireRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";
import type * as RappelsLoyers from "@/lib/rappels-loyers";

type Ligne = Record<string, unknown>;
type Appel = [string, ...unknown[]];

/** Une base simulée : chaque table rend ses lignes (filtres ignorés, mais notés), `maybeSingle` la première. */
function base(tables: Record<string, Ligne[]>, erreurs: string[] = []) {
  const appels: { table: string; ops: Appel[] }[] = [];
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const appel = { table, ops: [] as Appel[] };
    appels.push(appel);
    const erreur = erreurs.includes(table) ? { message: "indisponible" } : null;
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: erreur ? null : lignes, error: erreur }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: erreur }),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = (...args: unknown[]) => { appel.ops.push([op, ...args]); return q; };
    return q;
  };
  return { db: { from: requete, rpc: (nom: string) => requete(nom) } as unknown as SupabaseClient, appels };
}

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
/** Le texte lisible : une cellule, un bloc ou un paragraphe fermé laisse une espace ; les autres balises s'effacent. */
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>|<\/(td|th|div|p|h1|h2)>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("C47 — décompte de prorata : la base et la formule de l'appel, pas le loyer actuel du bail", () => {
  // Le dossier fictif : entrée le 15/10/2025 à 700,00 €, loyer révisé depuis à 710,50 €.
  const appel = { id: "a1", bail_id: "b1", periode: "2025-10-01", loyer_hc: 383.87, charges: 32.9, montant_du: 416.77, prorata: true, base_loyer_hc: 700, base_charges: 60 };
  it("imprime 700,00 € × 17 / 31 = 383,87 €, que le bail porte aujourd'hui 710,50 €", async () => {
    ctx.bail.date_debut = "2025-10-15";
    ctx.bail.loyer_hc = 710.5;
    ctx.bail.charges = 60;
    const r = succes(await assemblerProrata(base({ appels_loyer: [appel] }).db, "org", "a1"));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Loyer hors charges du mois plein 700,00 €");
    expect(texte).toContain("700,00 € × 17 / 31 383,87 €");
    expect(texte).toContain("60,00 € × 17 / 31 32,90 €");
    expect(texte).not.toContain("710,50");
    // La formule imprimée redonne le montant imprimé, au centime.
    expect(Math.round((700 * 17) / 31 * 100) / 100).toBe(383.87);
    expect(r.document.manquants).toEqual([]);
  });
  it("entrée et sortie dans le même mois : les deux bornes, comme le calcul de l'appel", async () => {
    ctx.bail.date_debut = "2026-02-10";
    ctx.bail.date_fin = "2026-02-20";
    const r = succes(await assemblerProrata(base({ appels_loyer: [{ ...appel, periode: "2026-02-01", loyer_hc: 275, charges: 23.57, montant_du: 298.57 }] }).db, "org", "a1"));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("du 10/02/2026 au 20/02/2026");
    expect(texte).toContain("700,00 € × 11 / 28 275,00 €");
  });
});

describe("C54 — révision : à partir de quel terme le loyer révisé est appelé, et ce qu'il advient de la période d'avant", () => {
  const revision = { id: "r1", bail_id: "b1", date_effet: "2026-10-15", date_echeance: "2026-10-15", date_demande: "2026-10-15", irl_trimestre: "T2 2026", ancien_loyer: 700, nouveau_loyer: 710.5, irl_reference: 100, irl_nouveau: 101.5 };
  const assembler = (appels: Ligne[]) => assemblerRevisionIrl(base({ revisions_loyer: [revision], appels_loyer: appels }).db, "org", "r1");

  it("le dossier fictif : octobre reste à 700,00 €, novembre est le premier terme révisé", async () => {
    const r = succes(await assembler([
      { periode: "2026-10-01", loyer_hc: 700, base_loyer_hc: 700 },
      { periode: "2026-11-01", loyer_hc: 710.5, base_loyer_hc: 710.5 },
    ]));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Le loyer révisé est appelé à compter du terme de novembre 2026.");
    expect(texte).toContain("Le terme d’octobre 2026, appelé avant l'enregistrement de cette révision, reste au loyer de 700,00 € : aucun complément n'est appelé pour la période du 15/10/2026 au 31/10/2026.");
    expect(texte).toContain("Loyer hors charges révisé, appelé à compter du terme de novembre 2026 710,50 €");
    expect(texte).not.toContain("révisé, à compter du 15/10/2026");
    // La date d'effet reste dite.
    expect(texte).toContain("La révision prend effet à la date anniversaire du bail, le 15/10/2026.");
  });
  it("règle de lecture des appels (applicationRevision)", () => {
    const appel = (periode: string, base: number) => ({ periode, loyer_hc: base, base_loyer_hc: base });
    // Le terme de novembre n'est pas encore émis : il le sera au loyer du bail, révisé.
    expect(applicationRevision("2026-10-15", 700, 710.5, [appel("2026-10-01", 700)])).toEqual({
      premierTerme: "2026-11-01", nonComplete: { du: "2026-10-15", au: "2026-10-31", loyer: 700, termes: ["2026-10-01"] }, avantEffet: null,
    });
    // Le terme du mois de l'effet émis après la révision : au loyer révisé pour le mois entier, jours d'avant l'effet compris.
    expect(applicationRevision("2026-10-15", 700, 710.5, [appel("2026-10-01", 710.5)])).toEqual({
      premierTerme: "2026-10-01", nonComplete: null, avantEffet: { du: "2026-10-01", au: "2026-10-14" },
    });
    // Effet au 1er du mois, terme émis au loyer révisé : rien à signaler.
    expect(applicationRevision("2026-10-01", 700, 710.5, [appel("2026-10-01", 710.5)])).toEqual({ premierTerme: "2026-10-01", nonComplete: null, avantEffet: null });
    // Révision enregistrée tard : deux termes restés à l'ancien loyer.
    expect(applicationRevision("2026-10-15", 700, 710.5, [appel("2026-10-01", 700), appel("2026-11-01", 700), appel("2026-12-01", 710.5)])?.nonComplete)
      .toEqual({ du: "2026-10-15", au: "2026-11-30", loyer: 700, termes: ["2026-10-01", "2026-11-01"] });
    // Le bail finit avant le terme suivant : aucun terme révisé, période non complétée bornée à la fin du bail.
    expect(applicationRevision("2026-10-15", 700, 710.5, [appel("2026-10-01", 700)], "2026-10-25")).toEqual({
      premierTerme: null, nonComplete: { du: "2026-10-15", au: "2026-10-25", loyer: 700, termes: ["2026-10-01"] }, avantEffet: null,
    });
    // Rien à déduire : pas de terme pour le mois de l'effet, ou un montant ni ancien ni nouveau (avenant).
    expect(applicationRevision("2026-10-15", 700, 710.5, [])).toBeNull();
    expect(applicationRevision("2026-10-15", 700, 710.5, [appel("2026-10-01", 650)])).toBeNull();
  });
  it("le mois entier au loyer révisé est dit, avec les jours d'avant l'effet", async () => {
    const texte = texteDe(succes(await assembler([{ periode: "2026-10-01", loyer_hc: 710.5, base_loyer_hc: 710.5 }])).document.html);
    expect(texte).toContain("Le loyer révisé est appelé à compter du terme d’octobre 2026, pour le mois entier, y compris du 01/10/2026 au 14/10/2026, avant la date d'effet.");
  });
  it("sans appel lisible : la règle générale, sans date d'appel affirmée", async () => {
    const texte = texteDe(succes(await assembler([])).document.html);
    expect(texte).toContain("Le loyer révisé s'applique aux termes appelés après l'enregistrement de la révision ; un terme déjà appelé n'est pas modifié.");
    expect(texte).not.toContain("à compter du terme");
  });
  it("lot 39 (reprise) — loyer révisé égal à l'ancien : aucun terme n'est dit « révisé », ni facturé avant l'effet", async () => {
    const appel = (periode: string, base: number) => ({ periode, loyer_hc: base, base_loyer_hc: base });
    expect(applicationRevision("2026-10-15", 700, 700, [appel("2026-10-01", 700), appel("2026-11-01", 700)])).toEqual({
      premierTerme: null, nonComplete: null, avantEffet: null, inchange: true,
    });
    // Variation effacée à l'arrondi : même montant au centime.
    expect(applicationRevision("2026-10-15", 700, 700.001, [appel("2026-10-01", 700)])?.inchange).toBe(true);
    const r = succes(await assemblerRevisionIrl(base({ revisions_loyer: [{ ...revision, nouveau_loyer: 700, irl_nouveau: 100 }],
      appels_loyer: [appel("2026-10-01", 700), appel("2026-11-01", 700)] }).db, "org", "r1"));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Le loyer révisé est égal au loyer avant révision : la révision ne modifie le montant d'aucun terme.");
    expect(texte).not.toContain("avant la date d'effet");
    expect(texte).not.toContain("à compter du terme");
    expect(texte).toContain("Loyer hors charges révisé 700,00 €");
  });
  it("lot 39 (reprise) — baisse : le terme resté à l'ancien loyer est dit plus élevé, sans déduction", async () => {
    const r = succes(await assemblerRevisionIrl(base({ revisions_loyer: [{ ...revision, nouveau_loyer: 690, irl_nouveau: 98.57 }],
      appels_loyer: [{ periode: "2026-10-01", loyer_hc: 700, base_loyer_hc: 700 }, { periode: "2026-11-01", loyer_hc: 690, base_loyer_hc: 690 }] }).db, "org", "r1"));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Le loyer révisé est appelé à compter du terme de novembre 2026.");
    expect(texte).toContain("Le terme d’octobre 2026, appelé avant l'enregistrement de cette révision, reste au loyer de 700,00 €, supérieur au loyer révisé : aucune déduction n'est appliquée pour la période du 15/10/2026 au 31/10/2026.");
    expect(texte).not.toContain("aucun complément");
  });
  it("appels illisibles : le document n'est pas produit", async () => {
    const r = await assemblerRevisionIrl(base({ revisions_loyer: [revision] }, ["appels_loyer"]).db, "org", "r1");
    expect(r).toHaveProperty("erreur", expect.stringContaining("appels de loyer"));
  });
});

describe("C60, C61 — attestation de loyer et dossier CAF d'un bail en préavis : la date de fin", () => {
  const options = { destinataire: "CAF du Rhône", allocataire: "1234567" };
  it.each(["attestation_loyer", "attestation_caf"] as const)("%s : « le contrat prend fin le 26/11/2026 »", async (code) => {
    ctx.bail.etat = "preavis";
    ctx.bail.date_fin = "2026-11-26";
    const r = succes(await assemblerComplementBail(code, base({}).db, "org", "b1", options));
    expect(texteDe(r.document.html)).toContain("prenant effet le 01/09/2026. Un congé est enregistré : le contrat prend fin le 26/11/2026.");
    expect(r.document.manquants).toEqual([]);
  });
  it("un bail actif n'a pas de fin à annoncer", async () => {
    const r = succes(await assemblerComplementBail("attestation_loyer", base({}).db, "org", "b1", options));
    expect(texteDe(r.document.html)).not.toContain("prend fin");
  });
  it("préavis sans date de fin enregistrée : à renseigner, sur la fiche du bail", async () => {
    ctx.bail.etat = "preavis";
    ctx.bail.date_fin = null;
    const r = succes(await assemblerComplementBail("attestation_caf", base({}).db, "org", "b1", options));
    expect(r.document.manquants).toEqual(["date de fin du contrat (congé enregistré)"]);
    expect(lienPourManquant("date de fin du contrat (congé enregistré)", "org", r.liens, "attestation_caf")?.href).toBe("/agence/org/baux/b1");
  });
});

describe("C50 — avis d'échéance : un virement demandé sans compte n'est pas imprimé « — »", () => {
  const avis = (lieuPaiement: string | null, iban: string | null) => construireAvisEcheance({
    reference: "AVIS-1", periode: "2026-12-01", dateEcheance: "2026-12-05", loyerHc: 650, charges: 90, montantDu: 740, prorata: false,
    lieuPaiement, iban, bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie", logementAdresse: "12 rue des Lilas, 69003 Lyon",
    referenceBail: "BAIL-1", dateBail: "2026-09-01", exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "claire@exemple.fr", ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(),
  });
  it("virement sans IBAN : à renseigner, au profil de l'espace (agence et propriétaire)", () => {
    const doc = avis("Virement bancaire", null);
    expect(doc.manquants).toEqual([LIBELLE_COORDONNEES_BANCAIRES]);
    expect(texteDe(doc.html)).not.toContain("Coordonnées bancaires : —");
    expect(lienPourManquant(LIBELLE_COORDONNEES_BANCAIRES, "org", [{ entite: "bail", entiteId: "b1" }], "avis_echeance")?.href).toBe("/agence/org/profil");
    expect(lienPourManquant(LIBELLE_COORDONNEES_BANCAIRES, "org", [{ entite: "bail", entiteId: "b1" }], "avis_echeance", "/espace")?.href).toBe("/espace/org/profil");
  });
  it("virement avec IBAN : imprimé, rien à renseigner", () => {
    const doc = avis("Virement bancaire", "FR76 3000 4000 0500 0012 3456 789");
    expect(texteDe(doc.html)).toContain("Coordonnées bancaires : FR76 3000 4000 0500 0012 3456 789.");
    expect(doc.manquants).toEqual([]);
  });
  it("un autre mode de paiement n'exige pas d'IBAN", () => {
    const doc = avis("Chèque à l'ordre du bailleur", null);
    expect(texteDe(doc.html)).toContain("Coordonnées bancaires : —.");
    expect(doc.manquants).toEqual([]);
  });
  it("l'avis assemblé lit l'IBAN du profil de l'espace (organizations.iban)", async () => {
    ctx.organisation.iban = null;
    const { db } = base({ appels_loyer: [{ id: "a1", bail_id: "b1", periode: "2026-12-01", loyer_hc: 650, charges: 90, montant_du: 740, date_echeance: "2026-12-05", prorata: false }], etat_loyers_bail: [] });
    expect(succes(await assemblerAvisEcheance(db, "org", "a1")).document.manquants).toEqual([LIBELLE_COORDONNEES_BANCAIRES]);
  });
});

const termesDus = [
  { appel_id: "a9", periode: "2025-09-01", date_echeance: "2025-09-05", montant_du: 980, montant_couvert: 300 },
  { appel_id: "a10", periode: "2025-10-01", date_echeance: "2025-10-05", montant_du: 980, montant_couvert: 0 },
  { appel_id: "a11", periode: "2025-11-01", date_echeance: "2025-11-05", montant_du: 980, montant_couvert: 0 },
];
const tablesImpayes = (sur: Record<string, Ligne[]> = {}) => ({ restitutions: [], relances: [], appels_loyer: [], etats_des_lieux: [], etat_loyers_bail: termesDus, ...sur });

describe("C72 — courriers d'impayés : le compte où verser, comme l'avis", () => {
  it.each(["relance_simple", "seconde_relance", "mise_en_demeure", "protocole_apurement"] as const)("%s : IBAN connu imprimé", async (code) => {
    const plans: Record<string, Ligne[]> = code === "protocole_apurement" ? { plans_apurement: [{ id: "p1", bail_id: "b1", etat: "propose", date_arrete: "2025-11-20", dette_initiale: 2640, acompte: 0, tolerance_jours: 5, seuil_caducite: 2, conditions: null }], plan_apurement_tranches: [{ rang: 1, echeance: "2026-12-05", montant: 2640 }] } : {};
    const texte = texteDe(succes(await assemblerComplementBail(code, base(tablesImpayes(plans)).db, "org", "b1", { delai: "8" })).document.html);
    expect(texte).toContain("Modalités de règlement : Virement bancaire ; coordonnées bancaires : FR76 3000 4000 0500 0012 3456 789 ; référence à rappeler : BAIL-B1.");
  });
  it("virement sans IBAN : le courrier n'est pas produit, l'IBAN est à renseigner", async () => {
    ctx.organisation.iban = "  ";
    const r = succes(await assemblerComplementBail("mise_en_demeure", base(tablesImpayes()).db, "org", "b1", { delai: "8" }));
    expect(r.document.manquants).toEqual([LIBELLE_COORDONNEES_BANCAIRES]);
  });
  it("règlement par chèque : pas de coordonnées bancaires réclamées", async () => {
    ctx.bail.lieu_paiement = "Chèque remis au bailleur";
    ctx.organisation.iban = null;
    const r = succes(await assemblerComplementBail("relance_simple", base(tablesImpayes()).db, "org", "b1"));
    expect(texteDe(r.document.html)).not.toContain("coordonnées bancaires");
    expect(r.document.manquants).toEqual([]);
  });
});

describe("C73 — le reste dû de chaque échéance, et un total qui redonne le solde", () => {
  it("relevé de situation : colonne « Reste dû », 680 + 980 + 980 = 2 640,00 €", async () => {
    const r = succes(await assemblerComplementBail("situation_dette", base(tablesImpayes()).db, "org", "b1"));
    expect(r.document.html).toContain('<th class="d">Reste dû</th>');
    const texte = texteDe(r.document.html);
    expect(texte).toContain("septembre 2025 05/09/2025 980,00 € 300,00 € 680,00 €");
    expect(texte).toMatch(/Solde échu au \d\d\/\d\d\/\d{4} : 2 640,00 €\./);
    expect(texte).toContain("Les échéances à venir sont exclues de ce solde.");
  });
  it("relevé de situation : ce qui reste dû sur une échéance pas encore échue est dit à part", async () => {
    const termes = [...termesDus, { appel_id: "a12", periode: "2099-12-01", date_echeance: "2099-12-05", montant_du: 980, montant_couvert: 100 }];
    const texte = texteDe(succes(await assemblerComplementBail("situation_dette", base(tablesImpayes({ etat_loyers_bail: termes })).db, "org", "b1")).document.html);
    expect(texte).toMatch(/Solde échu au \d\d\/\d\d\/\d{4} : 2 640,00 €\./);
    expect(texte).toContain("Les échéances à venir sont exclues de ce solde : il reste 880,00 € sur les échéances du tableau qui ne sont pas encore échues.");
  });
  it("mise en demeure : même colonne, total égal au solde échu", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("mise_en_demeure", base(tablesImpayes()).db, "org", "b1", { delai: "8" })).document.html);
    expect(texte).toContain("Reste dû");
    expect(texte).toContain("octobre 2025 05/10/2025 980,00 € 0,00 € 980,00 €");
    expect(texte).toMatch(/Solde échu au \d\d\/\d\d\/\d{4} : 2 640,00 €\./);
  });
});

describe("C65, C66, C74 — protocole d'apurement : ce que fait le plan enregistré, rien de plus", () => {
  const plan = (sur: Ligne = {}) => ({ id: "p1", bail_id: "b1", etat: "propose", date_arrete: "2025-11-20", dette_initiale: 1130, acompte: 0, tolerance_jours: 5, seuil_caducite: 2, conditions: null, ...sur });
  const tranches = [
    { rang: 1, echeance: "2027-03-31", montant: 188.34 }, { rang: 2, echeance: "2027-04-30", montant: 188.34 },
    { rang: 3, echeance: "2027-05-31", montant: 188.33 }, { rang: 4, echeance: "2027-06-30", montant: 188.33 },
    { rang: 5, echeance: "2027-07-31", montant: 188.33 }, { rang: 6, echeance: "2027-08-31", montant: 188.33 },
  ];
  const protocole = async (plans: Ligne[], options: Record<string, string> = {}) =>
    assemblerComplementBail("protocole_apurement", base(tablesImpayes({ plans_apurement: plans, plan_apurement_tranches: tranches })).db, "org", "b1", options);

  it("sans plan enregistré : rien à signer, le plan est à enregistrer sur la fiche du bail", async () => {
    const r = succes(await protocole([], { mensualites: "6", premiere_echeance: "2027-03-31", conditions: "Accord" }));
    expect(r.document.manquants).toEqual([LIBELLE_PLAN_A_ENREGISTRER]);
    const texte = texteDe(r.document.html);
    expect(texte).not.toContain("suspend");
    expect(texte).not.toContain("188,3");
    expect(lienPourManquant(LIBELLE_PLAN_A_ENREGISTRER, "org", r.liens, "protocole_apurement")).toEqual({ href: "/agence/org/baux/b1#plan-apurement", ecran: "plan d’apurement du bail" });
    expect(lienPourManquant(LIBELLE_PLAN_A_ENREGISTRER, "org", r.liens, "protocole_apurement", "/espace")?.href).toBe("/espace/org/baux/b1#plan-apurement");
  });
  it("le plan en cours du bail : ses tranches, sa tolérance, son seuil de caducité", async () => {
    const r = succes(await protocole([plan()]));
    expect(r.document.manquants).toEqual([]);
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Dette arrêtée au 20/11/2025 : 1 130,00 €. Reste à étaler : 1 130,00 €, en 6 mensualités.");
    expect(texte).toContain("31/03/2027 188,34 €");
    expect(texte).toContain("31/08/2027 188,33 €");
    expect(texte).toContain("Une mensualité qui n’est pas réglée 5 jours après son échéance est constatée comme manquée. À 2 mensualités manquées et non rattrapées, l’accord devient caduc et les sommes restantes sont immédiatement exigibles.");
    // Lot 39 (reprise) : « tant qu'il n'est ni caduc ni annulé » oubliait le plan soldé, qui ne suspend plus rien (la base ne
    // suspend que pendant un plan actif ou en défaut) : la phrase dit la fin de la suspension, soldé compris.
    expect(texte).toContain("Les relances de loyer sont suspendues dès l’activation du plan, après l’accord du locataire, et jusqu’à sa fin : dette soldée, plan devenu caduc ou annulé. Après cette fin, toute somme impayée peut de nouveau être relancée.");
    expect(texte).not.toContain("tant qu’il n’est ni caduc ni annulé");
    expect(texte).toContain("les règlements reçus depuis le 20/11/2025 sont pris en compte");
    expect(texte).toContain("Conditions particulières de suivi : Néant.");
    // C66 : plus de caducité à la première mensualité manquée ; C74 : plus de déduction « avant signature » d'un échéancier ferme.
    expect(texte).not.toContain("Une mensualité non réglée à son échéance rend l’accord caduc");
    expect(texte).not.toContain("à déduire avant signature");
    expect(texte).not.toContain("Le bailleur suspend ses relances tant que");
  });
  // Phase 3, lot 43 (T07, reste du lot 40) : le protocole est signé par les parties ; il portait « Fait à Lyon, le <jour de
  // génération> » au-dessus de cadres vides. La date se complète à la signature, comme pour les inventaires. Les courriers
  // (relance, mise en demeure) restent datés du jour de leur émission.
  it("le protocole se date à la signature ; la relance garde la date de son émission", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-23T13:32:00Z"));
      const texte = texteDe(succes(await protocole([plan()])).document.html);
      expect(texte).toContain("Fait à Lyon, le date effective à compléter lors de la signature.");
      expect(texte).not.toContain("le 23/11/2026.");
      const relance = texteDe(succes(await assemblerComplementBail("relance_simple", base(tablesImpayes()).db, "org", "b1")).document.html);
      expect(relance).toContain("Fait à Lyon, le 23/11/2026.");
    } finally {
      vi.useRealTimers();
    }
  });
  it("tolérance nulle, seuil d'une mensualité, acompte et conditions du plan", async () => {
    const texte = texteDe(succes(await protocole([plan({ tolerance_jours: 0, seuil_caducite: 1, acompte: 130, conditions: "Point mensuel par téléphone." })])).document.html);
    expect(texte).toContain("Une mensualité qui n’est pas réglée à son échéance est constatée comme manquée. À 1 mensualité manquée et non rattrapée, l’accord devient caduc");
    expect(texte).toContain("Acompte versé ou à verser à la signature : 130,00 €. Reste à étaler : 1 000,00 €, en 6 mensualités.");
    expect(texte).toContain("Conditions particulières de suivi : Point mensuel par téléphone.");
  });
  it("le plan désigné doit être celui du bail, et vivant", async () => {
    expect(await protocole([plan({ bail_id: "autre" })], { plan_id: "p1" })).toHaveProperty("erreur", "Ce plan d’apurement n’appartient pas à ce bail.");
    expect(await protocole([plan({ etat: "annule" })], { plan_id: "p1" })).toHaveProperty("erreur", "Ce plan d’apurement est annulé.");
    // Lot 39 (reprise) : un plan caduc ou soldé n'est plus vivant — son protocole annonçait encore la suspension des relances.
    expect(await protocole([plan({ etat: "caduc" })], { plan_id: "p1" })).toHaveProperty("erreur", "Ce plan d’apurement est caduc : un protocole ne se prépare plus sur ce plan.");
    expect(await protocole([plan({ etat: "solde" })], { plan_id: "p1" })).toHaveProperty("erreur", "Ce plan d’apurement est soldé : un protocole ne se prépare plus sur ce plan.");
    expect(await protocole([plan({ etat: "inconnu" })], { plan_id: "p1" })).toHaveProperty("erreur", "Ce plan d’apurement n’est plus en cours.");
    for (const etat of ["propose", "actif", "en_defaut"]) expect(succes(await protocole([plan({ etat })], { plan_id: "p1" })).document.manquants).toEqual([]);
  });
  it("le plan en cours se cherche dans l'espace et sur ce bail, parmi les plans vivants", async () => {
    const { db, appels } = base(tablesImpayes({ plans_apurement: [plan()], plan_apurement_tranches: tranches }));
    succes(await assemblerComplementBail("protocole_apurement", db, "org", "b1"));
    const lecture = appels.find((a) => a.table === "plans_apurement")!;
    expect(lecture.ops).toContainEqual(["eq", "organization_id", "org"]);
    expect(lecture.ops).toContainEqual(["eq", "bail_id", "b1"]);
    expect(lecture.ops).toContainEqual(["in", "etat", ["propose", "actif", "en_defaut"]]);
    expect(appels.find((a) => a.table === "plan_apurement_tranches")!.ops).toContainEqual(["eq", "organization_id", "org"]);
  });
});

describe("C65 — suivi des courriers : aucune relance préparée pendant un plan d'apurement en cours", () => {
  const termes = [{ appel_id: "a1", periode: "2025-10-01", date_echeance: "2025-10-05", montant_du: 980, montant_couvert: 0 }];
  it("un plan actif ou en défaut arrête la préparation du courrier, avant toute autre lecture", async () => {
    const reel = await vi.importActual<typeof RappelsLoyers>("@/lib/rappels-loyers");
    const { db, appels } = base({ plans_apurement: [{ id: "p1" }] });
    expect(await reel.verifierCourrierDuBail(db, "org", "b1", termes, "2026-11-23", "relance_1")).toEqual({ erreur: reel.PLAN_APUREMENT_EN_COURS });
    expect(appels.map((a) => a.table)).toEqual(["plans_apurement"]);
    expect(appels[0].ops).toContainEqual(["eq", "organization_id", "org"]);
    expect(appels[0].ops).toContainEqual(["eq", "bail_id", "b1"]);
    expect(appels[0].ops).toContainEqual(["in", "etat", ["actif", "en_defaut"]]);
  });
  it("plan illisible : rien n'est préparé", async () => {
    const reel = await vi.importActual<typeof RappelsLoyers>("@/lib/rappels-loyers");
    const r = await reel.verifierCourrierDuBail(base({}, ["plans_apurement"]).db, "org", "b1", termes, "2026-11-23", "recommande");
    expect(r.erreur).toContain("plan d’apurement");
  });
});

describe("C65 (reprise) — le suivi du tableau de bord ne propose plus de relance pendant un plan d'apurement en cours", () => {
  // Deux baux impayés depuis le 05/10/2026, non-réception confirmée le 22/11 ; le bail b1 est sous plan actif.
  const jour = "2026-11-23";
  // Phase 3, lot 48 (U01) : le suivi lit l'heure réelle (enrichirRappelsLoyers, Date.now()) et une confirmation qui n'a
  // déclenché aucun envoi expire 36 h après le signalement (paliers-reception-loyer.ts). Sans horloge figée, ce bloc
  // devenait rouge le 23/11/2026 à 21 h UTC. L'horloge est donc figée au jour du suivi, 27 h après le signalement : la
  // confirmation est encore valable, comme le jour où le cas a été écrit. Les assertions ne changent pas.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const ligne = (bail: string): RappelsLoyers.RappelLoyer => ({ appel_id: "appel-" + bail, bail_id: bail, lot_nom: "Lot " + bail, locataire: "Fictif Hugo",
    periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 980, montant_couvert: 0, non_recu_signale_le: "2026-11-22T09:00:00Z" });
  const tables = (plans: Ligne[]) => ({ organizations: [{ relances_envoi_auto: true, relance_1_jours: 5, relance_2_jours: 15 }], relances: [], recommandes_ar24: [], plans_apurement: plans });
  const reel = () => vi.importActual<typeof RappelsLoyers>("@/lib/rappels-loyers");
  const rendre = (dus: RappelsLoyers.RappelLoyer[]) => renderToStaticMarkup(createElement(RappelsLoyersInteractifs, {
    orgId: "org", aujourdHui: jour, dus, prochaine: null, totalEcheancesDues: dus.length, lectureSeule: false,
    envoiRelanceDisponible: false, relanceAutomatiqueOuverte: true, dansFenetre: false }));

  it("le suivi lit les plans en cours de l'espace, pour les baux affichés, dans les états qui suspendent les relances", async () => {
    const { db, appels } = base(tables([{ bail_id: "b1" }]));
    const [b1, b2] = await (await reel()).enrichirRappelsLoyers(db, "org", [ligne("b1"), ligne("b2")], jour);
    expect(b1.plan_apurement_en_cours).toBe(true);
    expect(b2.plan_apurement_en_cours).toBe(false);
    const lecture = appels.find((a) => a.table === "plans_apurement")!;
    expect(lecture.ops).toContainEqual(["eq", "organization_id", "org"]);
    expect(lecture.ops).toContainEqual(["in", "bail_id", ["b1", "b2"]]);
    expect(lecture.ops).toContainEqual(["in", "etat", ["actif", "en_defaut"]]);
    // Sous plan : ni palier, ni courrier. Sans plan : la première relance, comme avant.
    expect(b1.point).toBeNull();
    expect(courrierDisponible(b1, jour)).toBeNull();
    expect(b2.point).toMatchObject({ etape: "relance_1" });
    expect(courrierDisponible(b2, jour)).toBe("relance_1");
  });
  it("l'écran n'annonce ni « Relance 1 », ni la relance automatique, ni le PDF de relance pour le bail sous plan", async () => {
    const [b1, b2] = await (await reel()).enrichirRappelsLoyers(base(tables([{ bail_id: "b1" }])).db, "org", [ligne("b1"), ligne("b2")], jour);
    const sousPlan = rendre([b1]);
    expect(sousPlan).toContain("Plan d’apurement en cours : les relances sont suspendues jusqu’à sa fin (dette soldée, plan caduc ou annulé).");
    expect(sousPlan).toContain('href="/espace/org/baux/b1#plan-apurement"');
    for (const absent of ["Relance 1", "Recommandé", "Préparer la première relance en PDF", "data-modele", "Confirmation enregistrée pour la relance automatique.", "vous pouvez préparer le PDF", "Prochain point"]) {
      expect(sousPlan).not.toContain(absent);
    }
    // Les réponses sur la réception restent proposées : le loyer courant compte pour le respect du plan.
    expect(sousPlan).toContain("J’ai reçu le loyer");
    // Le bail sans plan garde son suivi (témoin : la même ligne, sans plan, montrait tout cela).
    const sansPlan = rendre([b2]);
    expect(sansPlan).toContain("Relance 1");
    expect(sansPlan).toContain("Confirmation enregistrée pour la relance automatique.");
    expect(sansPlan).toContain('data-modele="relance_simple"');
  });
  it("sous plan, une nouvelle mensualité due demande encore sa confirmation, sans palier de relance", () => {
    const l = { ...ligne("b1"), plan_apurement_en_cours: true, derniere_echeance_due: "2026-11-05", non_recu_signale_le: null,
      relances_automatiques: { active: true, premierDelai: 5, secondDelai: 15 }, historique_relances_disponible: true };
    expect(pointReception(l, jour)).toEqual({ etape: "echeance", date: "2026-11-05", aConfirmer: true });
    expect(courrierDisponible(l, jour)).toBeNull();
  });
  it("plans illisibles : aucun palier n'est affirmé (« Suivi à vérifier »), aucun courrier proposé", async () => {
    const [b2] = await (await reel()).enrichirRappelsLoyers(base(tables([]), ["plans_apurement"]).db, "org", [ligne("b2")], jour);
    expect(b2.point).toMatchObject({ etape: "inconnu" });
    expect(courrierDisponible(b2, jour)).toBeNull();
  });
  it("le refus au clic dit la même fin de suspension, plan soldé compris", async () => {
    expect((await reel()).PLAN_APUREMENT_EN_COURS).toContain("jusqu’à sa fin (dette soldée, plan caduc ou annulé)");
  });
});

describe("C57, C59 — demande d'attestation d'assurance : son vrai titre, le logement complet", () => {
  const tables = (chambre: Ligne | null = null) => ({
    documents: [{ id: "doc1", type: "attestation_assurance", expire_le: "2026-11-03" }],
    organizations: [{ name: "Parc de Jeanne", type: "proprietaire_direct", address_line1: "12 rue des Essais", postal_code: "69003", city: "Lyon", telephone: null, email_contact: "parc@exemple.fr" }],
    document_liens: [{ entite_id: "p1" }],
    persons: [{ id: "p1", nom: "Fictif", prenom: "Hugo", account_id: null }],
    baux: [{ id: "b1", locataire_principal: "p1", chambre, lot: { id: "l1", nom: "Studio meublé n° 12", etage: "3, porte 12", bien: { address_line1: "3 place des Essais", postal_code: "69007", city: "Lyon" } } }],
    detentions: [{ quote_part: 100, person: { ...personne({ id: "prop", nom: "Fictive", prenom: "Jeanne" }) } }],
  });
  it("C57 : le titre est « Demande d'attestation d'assurance »", () => {
    const html = construireRappelAssurance({
      reference: "ASSU-1", echeance: "2026-11-03", expiree: true, locataireNom: "Fictif Hugo", logementAdresse: "3 place des Essais, 69007 Lyon",
      referenceBail: "BAIL-1", canalReponse: "parc@exemple.fr", espaceLocataire: false,
      exp: { nom: "Fictive Jeanne", adresse: null, email: "parc@exemple.fr", ville: "Lyon" }, f: new Fusion(),
    }).html;
    expect(html).toContain("<h1>Demande d'attestation d'assurance</h1>");
    expect(html).not.toContain("<h1>Attestation d'assurance</h1>");
  });
  it("C59 : immeuble, lot, étage et porte, comme les autres documents du bail", async () => {
    const r = succes(await assemblerRappelAssurance(base(tables()).db, "org", "doc1"));
    expect(texteDe(r.document.html)).toContain("Logement loué 3 place des Essais, 69007 Lyon, Studio meublé n° 12, étage 3, porte 12");
  });
  it("C59 : un contrat individuel de colocation nomme aussi sa chambre", async () => {
    const r = succes(await assemblerRappelAssurance(base(tables({ nom: "Chambre 2" })).db, "org", "doc1"));
    expect(texteDe(r.document.html)).toContain("3 place des Essais, 69007 Lyon, Studio meublé n° 12 · Chambre 2, étage 3, porte 12");
  });
});
