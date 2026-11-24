/**
 * Phase 3 de la mission palier 1, lot 52 — documents de la famille « loyers » (relecture des PDF de la passe 1).
 *
 *  - W23 : le décompte de prorata laissait la mention, « Fait à » et la signature seules en page 2 (suite de C53) ;
 *  - W24 : l'IBAN de l'avis d'échéance sortait d'un bloc de 27 caractères ;
 *  - W25 : une révision demandée à l'échéance, notifiée après sa date d'effet, ne disait pas la date de la demande ;
 *  - W26 : « article 17- » / « 1 I de la loi » coupé en fin de ligne ;
 *  - W27 : indices sans leurs décimales (« 100 », « 101,5 ») ;
 *  - W28 : le tableau « Indices retenus » coupé entre deux pages ;
 *  - W29 : « dernière révision, à défaut indice figé au bail » au lieu de l'origine de l'indice retenu ;
 *  - W30 : « Dossier n° » et « Dossier de location » sur l'attestation de loyer et le dossier CAF ;
 *  - W31 : le dossier CAF se disait « attestation » adressée à un « destinataire » puis « récapitulatif » ;
 *  - W32 : « nombre d'occupants du contrat » comptait les locataires titulaires.
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
// Le palier de relance d'un courrier est vérifié ailleurs (loyers-impayes-phase3.test.ts).
vi.mock("@/lib/rappels-loyers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifierCourrierDuBail: vi.fn(async () => ({ precedente: "2026-10-12" })),
}));
import { chargerContexteBail, ibanLisible, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerProrata } from "@/lib/documents/modeles/prorata";
import { assemblerRevisionIrl, construireRevisionIrl, origineReference, type DonneesRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/** Une base simulée : chaque table rend ses lignes (filtres ignorés), `maybeSingle` la première. `listesEnErreur` : la lecture
 *  d'une liste de la table échoue, celle d'une seule ligne réussit. */
function base(tables: Record<string, Ligne[]>, listesEnErreur: string[] = []) {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const erreur = listesEnErreur.includes(table) ? { message: "indisponible" } : null;
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: erreur ? null : lignes, error: erreur }).then(ok),
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
/** Le texte lisible : une cellule, un bloc ou un paragraphe fermé laisse une espace ; les autres balises s'effacent. */
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>|<\/(td|th|div|p|h1|h2)>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});
afterEach(() => vi.useRealTimers());

describe("W23 — décompte de prorata : la clôture reste sur la page du calcul", () => {
  it("mise en page compacte du catalogue (titre 19 pt, marges réduites) et lignes de tableau resserrées", async () => {
    ctx.bail.date_debut = "2025-10-15";
    const appel = { id: "a1", bail_id: "b1", periode: "2025-10-01", loyer_hc: 383.87, charges: 32.9, montant_du: 416.77, prorata: true, base_loyer_hc: 700, base_charges: 60 };
    const html = succes(await assemblerProrata(base({ appels_loyer: [appel] }), "org", "a1")).document.html;
    expect(html).toContain("h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}");
    expect(html).toContain("td{padding-top:3pt;padding-bottom:3pt}");
    // La règle commune qui garde « Fait à » avec la signature n'est pas touchée.
    expect(html).toContain(".fait-a { break-before:avoid-page;");
  });
});

describe("W24 — l'IBAN de l'avis d'échéance par groupes de quatre, comme sur le portail", () => {
  it("ibanLisible : sans espace saisie, en majuscules, groupes liés par des espaces insécables", () => {
    expect(ibanLisible("FR7630006000011234567890189")).toBe("FR76 3000 6000 0112 3456 7890 189");
    expect(ibanLisible(" fr76 3000 6000 0112 3456 7890 189 ")).toBe("FR76 3000 6000 0112 3456 7890 189");
    expect(ibanLisible("  ")).toBeNull();
    expect(ibanLisible(null)).toBeNull();
  });
  const avis = (iban: string | null) => construireAvisEcheance({
    reference: "AVIS-1", periode: "2026-12-01", dateEcheance: "2026-12-05", loyerHc: 650, charges: 90, montantDu: 740, prorata: false,
    lieuPaiement: "Virement bancaire", iban, bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie", logementAdresse: "12 rue des Lilas, 69003 Lyon",
    referenceBail: "BAIL-1", dateBail: "2026-09-01", exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "claire@exemple.fr", ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(),
  });
  it("l'avis imprime « FR76 3000 6000 0112 3456 7890 189 » ; sans IBAN, toujours à renseigner", () => {
    expect(avis("FR7630006000011234567890189").html).toContain("Coordonnées bancaires : <span class=\"v\">FR76 3000 6000 0112 3456 7890 189</span>.");
    expect(avis("  ").manquants).toHaveLength(1);
  });
  it("les courriers du dossier qui demandent un virement aussi", async () => {
    ctx.organisation.iban = "FR7630006000011234567890189";
    const tables = { restitutions: [], relances: [], appels_loyer: [], etats_des_lieux: [], etat_loyers_bail: [{ appel_id: "a9", periode: "2025-09-01", date_echeance: "2025-09-05", montant_du: 980, montant_couvert: 0 }] };
    const html = succes(await assemblerComplementBail("relance_simple", base(tables), "org", "b1")).document.html;
    expect(html).toContain("FR76 3000 6000 0112 3456 7890 189");
  });
});

describe("W25 à W29 — révision du loyer", () => {
  const revision = { id: "r1", bail_id: "b1", date_effet: "2026-10-15", date_echeance: "2026-10-15", date_demande: "2026-10-15", irl_trimestre: "T2 2026", ancien_loyer: 700, nouveau_loyer: 710.5, irl_reference: 100, irl_nouveau: 101.5 };
  const appels = [{ periode: "2026-10-01", loyer_hc: 700, base_loyer_hc: 700 }, { periode: "2026-11-01", loyer_hc: 710.5, base_loyer_hc: 710.5 }];
  const donnees = (sur: Partial<DonneesRevisionIrl> = {}): DonneesRevisionIrl => ({
    reference: "IRL-1", dateEffet: "2026-10-15", dateEcheance: "2026-10-15", dateDemande: "2026-10-15", trimestreNouveau: "T2 2026",
    ancienLoyer: 700, nouveauLoyer: 710.5, irlReference: 100, irlNouveau: 101.5, trimestre: "T2 2025", charges: 60, chargesMode: "forfait",
    bailleurNom: "Fictive Jeanne", locatairesNoms: "Fictif Hugo", logementAdresse: "3 place des Essais, 69007 Lyon", referenceBail: "BAIL-1",
    exp: { nom: "Fictive Jeanne", adresse: "12 rue des Essais, 69003 Lyon", email: null, telephone: null, ville: "Lyon", emetteur: "detenteurs" },
    f: new Fusion(), ...sur,
  });

  it("W25 — demandée à l'échéance, établie après : la date de la demande et la date du courrier sont dites", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
    const texte = texteDe(construireRevisionIrl(donnees()).html);
    expect(texte).toContain("La révision a été demandée le 15/10/2026. Elle prend effet à la date anniversaire du bail, le 15/10/2026. Le présent courrier est établi le 24/11/2026, après cette date d'effet.");
    expect(texte).toContain("Établi le 24/11/2026");
    expect(texte).toContain("Fait à Lyon, le 24/11/2026.");
  });
  it("W25 — courrier établi avant la date d'effet : rien de plus que la demande", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    const texte = texteDe(construireRevisionIrl(donnees({ dateDemande: "2026-09-20" })).html);
    expect(texte).toContain("La révision a été demandée le 20/09/2026. Elle prend effet à la date anniversaire du bail, le 15/10/2026.");
    expect(texte).not.toContain("après cette date d'effet");
  });
  it("W25 — sans date de demande enregistrée : le document le dit, sans en supposer une", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
    const texte = texteDe(construireRevisionIrl(donnees({ dateDemande: null, dateEcheance: null })).html);
    expect(texte).toContain("La révision prend effet à la date anniversaire du bail, le 15/10/2026. La date de la demande de révision n'est pas enregistrée dans le dossier. Le présent courrier est établi le 24/11/2026, après cette date d'effet.");
    expect(texte).not.toContain("demandée le");
  });
  it("W25 — demande tardive : phrase inchangée (la date de la demande y était déjà)", () => {
    const texte = texteDe(construireRevisionIrl(donnees({ dateDemande: "2026-11-02", dateEffet: "2026-11-02" })).html);
    expect(texte).toContain("Demandée le 02/11/2026, après cette date anniversaire, elle prend effet à la date de la demande, soit le 02/11/2026, sans effet rétroactif (article 17-1 I de la loi du 6 juillet 1989).");
  });
  it("W26 — « article 17-1 I » ne se coupe pas en fin de ligne", () => {
    const tardive = construireRevisionIrl(donnees({ dateDemande: "2026-11-02", dateEffet: "2026-11-02" })).html;
    expect(tardive).toContain('pour l\'année écoulée (<span style="white-space:nowrap">article 17-1&nbsp;I</span> de la loi');
    expect(tardive).toContain('sans effet rétroactif (<span style="white-space:nowrap">article 17-1&nbsp;I</span> de la');
  });
  it("W27 — indices à deux décimales, dans le tableau et la note de calcul", () => {
    const texte = texteDe(construireRevisionIrl(donnees()).html);
    expect(texte).toContain("Nouvel indice retenu 101,50");
    expect(texte).toContain("700,00 € × 101,50 / 100,00 = 710,50 €");
    // Une saisie plus fine n'est pas arrondie.
    expect(texteDe(construireRevisionIrl(donnees({ irlNouveau: 101.505 })).html)).toContain("Nouvel indice retenu 101,505");
  });
  it("W28 — le titre « Indices retenus » et son tableau forment un bloc insécable", () => {
    const html = construireRevisionIrl(donnees()).html;
    expect(html).toMatch(/<div style="break-inside:avoid-page;page-break-inside:avoid">\s*<h2>Indices retenus<\/h2>\s*<table>[\s\S]*?<\/table>\s*<\/div>/);
  });
  it("W29 — origine de l'indice de référence (règle de reviser_loyer), rien d'affirmé si les valeurs ne concordent pas", () => {
    const bail = { irl_valeur: "100.00", irl_trimestre: "T2 2025" };
    expect(origineReference("2026-10-15", 100, [], bail)).toEqual({ bail: true, trimestre: "T2 2025" });
    const precedente = { date_effet: "2025-10-15", irl_nouveau: "98.50", irl_trimestre: "T2 2025" };
    expect(origineReference("2026-10-15", 98.5, [precedente, { date_effet: "2024-10-15", irl_nouveau: 96, irl_trimestre: "T2 2024" }], bail)).toEqual({ revisionDu: "2025-10-15", trimestre: "T2 2025" });
    // La révision elle-même ou une révision postérieure ne compte pas.
    expect(origineReference("2026-10-15", 100, [{ date_effet: "2026-10-15", irl_nouveau: 101.5, irl_trimestre: "T2 2026" }], bail)).toEqual({ bail: true, trimestre: "T2 2025" });
    // Valeur enregistrée différente de celle retrouvée : aucune origine affirmée.
    expect(origineReference("2026-10-15", 99, [], bail)).toBeNull();
    expect(origineReference("2026-10-15", 100, [precedente], bail)).toBeNull();
  });
  it("W29 — le document assemblé dit « indice figé au bail, T2 2025 », ou « indice de la révision du … »", async () => {
    ctx.bail.irl_valeur = 100;
    ctx.bail.irl_trimestre = "T2 2025";
    const premiere = texteDe(succes(await assemblerRevisionIrl(base({ revisions_loyer: [revision], appels_loyer: appels }), "org", "r1")).document.html);
    expect(premiere).toContain("Indice de référence (indice figé au bail, T2 2025) 100,00");
    expect(premiere).not.toContain("à défaut indice figé au bail");
    const seconde = { ...revision, id: "r2", date_effet: "2027-10-15", date_echeance: "2027-10-15", date_demande: "2027-10-15", irl_trimestre: "T2 2027", ancien_loyer: 710.5, nouveau_loyer: 720, irl_reference: 101.5, irl_nouveau: 102.77 };
    const texte = texteDe(succes(await assemblerRevisionIrl(base({ revisions_loyer: [seconde, revision], appels_loyer: [] }), "org", "r2")).document.html);
    expect(texte).toContain("Indice de référence (indice de la révision du 15/10/2026, T2 2026) 101,50");
    // Lecture des révisions ratée : le libellé reste la règle, le document est produit.
    const sansLecture = texteDe(succes(await assemblerRevisionIrl(base({ revisions_loyer: [revision], appels_loyer: appels }, ["revisions_loyer"]), "org", "r1")).document.html);
    expect(sansLecture).toContain("Indice de référence (dernière révision, à défaut indice figé au bail) 100,00");
  });
});

describe("W30 à W32 — attestation de loyer et dossier de préparation CAF", () => {
  const options = { destinataire: "CAF du Rhône", allocataire: "1234567" };
  it.each(["attestation_loyer", "attestation_caf"] as const)("W30 — %s : en-tête « Contrat n° », sans sous-titre « Dossier de location »", async (code) => {
    const html = succes(await assemblerComplementBail(code, base({}), "org", "b1", options)).document.html;
    expect(html).not.toContain("Dossier de location");
    expect(texteDe(html)).not.toContain("Dossier n°");
    expect(texteDe(html)).toContain("Contrat n°");
  });
  it("W30 — les autres documents du dossier gardent leur sous-titre ; leur en-tête dit aussi « Contrat »", async () => {
    const tables = { restitutions: [], relances: [], appels_loyer: [], etats_des_lieux: [], etat_loyers_bail: [{ appel_id: "a9", periode: "2025-09-01", date_echeance: "2025-09-05", montant_du: 980, montant_couvert: 0 }] };
    const html = succes(await assemblerComplementBail("relance_simple", base(tables), "org", "b1")).document.html;
    expect(html).toContain("Dossier de location");
    expect(texteDe(html)).not.toContain("Dossier n°");
  });
  it("W31 — le dossier CAF se dit récapitulatif : ni « atteste », ni « Destinataire », ni « Cette attestation »", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("attestation_caf", base({}), "org", "b1", options)).document.html);
    expect(texte).toContain("Le locataire désigné est titulaire du contrat relatif aux locaux désignés");
    expect(texte).toContain("Caisse concernée : CAF du Rhône.");
    expect(texte).toContain("Ce récapitulatif reprend les conditions du bail ; les paiements effectifs sont justifiés par les quittances ou reçus.");
    expect(texte).not.toMatch(/atteste|Destinataire|Cette attestation/);
  });
  it("W31 (rendu) — dans la situation locative, le « € » reste avec son montant", async () => {
    const html = succes(await assemblerComplementBail("attestation_caf", base({}), "org", "b1", options)).document.html;
    expect(html).toContain("Loyer mensuel hors charges : <span class=\"v\">650,00\u00a0€</span> ; charges mensuelles : <span class=\"v\">90,00\u00a0€</span>");
  });
  it("W31 — l'attestation de loyer garde ses formules", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("attestation_loyer", base({}), "org", "b1", options)).document.html);
    expect(texte).toContain("Le bailleur atteste que le locataire désigné est titulaire du contrat");
    expect(texte).toContain("Destinataire : CAF du Rhône.");
    expect(texte).toContain("Cette attestation décrit les conditions du bail");
  });
  it("W32 — « nombre de locataires titulaires du contrat », pas « d'occupants »", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("attestation_caf", base({}), "org", "b1", options)).document.html);
    expect(texte).toContain("nombre de locataires titulaires du contrat : 1.");
    expect(texte).not.toContain("occupants");
  });
});
