/**
 * Phase 3 de la mission palier 1, lot 53 — famille « impayés » (W33 à W35) et reprise du lot 51.
 *
 *  - W33 : le solde du relevé partait seul en page 2 avec « Fait à » et la signature, loin du tableau qu'il totalise ;
 *  - W34 : la mise en demeure imprimait, dans la lettre adressée au locataire, une consigne pour l'expéditeur
 *    (« Ce courrier est à notifier avec preuve de réception ») ;
 *  - W35 : les courriers d'impayés étaient classés en GED sous le seul nom du modèle, sans date ;
 *  - reprise du lot 51, W16 : une durée de vie de 0 (coût retenu en entier par la base) imprimait la règle de vétusté ;
 *  - reprise du lot 51, W19 : « prise d'effet » s'écrivait avec deux apostrophes différentes selon le document.
 * Chaque cas échouait avant le correctif.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
vi.mock("@/lib/rappels-loyers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifierCourrierDuBail: vi.fn(async () => ({ precedente: "2026-10-12" })),
}));
import { chargerContexteBail, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { construireRecuDepot } from "@/lib/documents/modeles/recu-depot";
import { assemblerCongeBailleur } from "@/lib/documents/modeles/conge-bailleur";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/** Une base simulée : chaque table (ou fonction) rend toutes ses lignes, filtres ignorés ; `maybeSingle` la première. */
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
  return { from: requete, rpc: requete } as unknown as SupabaseClient;
}
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[  ]/g, " ").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1");

const termesDus = [
  { appel_id: "a10", periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 565, montant_couvert: 0 },
  { appel_id: "a11", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 565, montant_couvert: 0 },
];
const plan = { id: "p1", bail_id: "b1", etat: "propose", date_arrete: "2026-11-20", dette_initiale: 1130, acompte: 0, tolerance_jours: 5, seuil_caducite: 2, conditions: null };
const tablesImpayes = (sur: Record<string, Ligne[]> = {}) => ({
  restitutions: [], relances: [], appels_loyer: [], etats_des_lieux: [], etat_loyers_bail: termesDus,
  plans_apurement: [plan], plan_apurement_tranches: [{ rang: 1, echeance: "2026-12-05", montant: 1130 }], ...sur,
});
const courrier = async (code: "relance_simple" | "seconde_relance" | "mise_en_demeure" | "situation_dette" | "protocole_apurement") =>
  succes(await assemblerComplementBail(code, base(tablesImpayes()), "org", "b1", { delai: "8" }));

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  ctx.bail.date_debut = "2025-12-01";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("W33 — le solde reste sous le tableau qu'il totalise", () => {
  /** Le paragraphe « Solde échu » tel qu'émis (balise ouvrante comprise). */
  const paragrapheSolde = (html: string) => /<p[^>]*><strong>Solde échu au /.exec(html)?.[0] ?? "";

  it.each(["situation_dette", "relance_simple", "seconde_relance", "mise_en_demeure"] as const)("%s : le solde ne se sépare pas du tableau (pas de saut avant lui)", async (code) => {
    const html = (await courrier(code)).document.html;
    expect(paragrapheSolde(html)).toMatch(/break-before:avoid-page/);
    // Les règles de coupure communes ne sont pas défaites : un long paragraphe peut toujours se couper.
    expect(html).toContain("p { break-inside:auto; page-break-inside:auto; }");
  });

  it("protocole d'apurement : HTML inchangé (il sert d'empreinte à son circuit de signature)", async () => {
    const html = (await courrier("protocole_apurement")).document.html;
    expect(paragrapheSolde(html)).toBe("<p><strong>Solde échu au ");
  });
});

describe("W34 — la mise en demeure ne donne plus de consigne d'envoi au locataire", () => {
  it("la consigne « à notifier » n'est plus imprimée ; la précision utile au locataire reste", async () => {
    const texte = texteDe((await courrier("mise_en_demeure")).document.html);
    expect(texte).not.toMatch(/à notifier/i);
    expect(texte).not.toMatch(/preuve de réception/i);
    expect(texte).toContain("Ce courrier ne constitue ni un commandement de payer ni une décision de résiliation du bail.");
    expect(texte).toContain("dans un délai de 8 jours à compter de sa réception");
  });

  it("la consigne reste à l'écran, pour l'expéditeur (aide du délai au catalogue et préparation du recommandé)", () => {
    expect(OPTIONS_CATALOGUE.mise_en_demeure[0].aide).toContain("à notifier avec preuve de réception");
    const ecran = readFileSync(join(__dirname, "../src/components/rappels-loyers-interactifs.tsx"), "utf8");
    expect(ecran).toContain("Gerimmo n’envoie pas ce PDF : ce courrier est à notifier avec preuve de réception.");
  });
});

describe("W35 — titres de classement GED datés", () => {
  it.each([
    ["relance_simple", "Relance amiable de loyer — 24/11/2026"],
    ["seconde_relance", "Seconde relance de loyer — 24/11/2026"],
    ["mise_en_demeure", "Mise en demeure de payer — 24/11/2026"],
    ["situation_dette", "Situation du compte locataire — 24/11/2026"],
    ["protocole_apurement", "Protocole d’apurement — dette arrêtée au 20/11/2026"],
  ] as const)("%s : « %s »", async (code, titre) => {
    expect((await courrier(code)).titreGed).toBe(titre);
  });

  it("le nom du fichier et la référence ne changent pas", async () => {
    const r = await courrier("relance_simple");
    expect(r.nomFichier).toBe("relance_simple-b1");
    expect(r.document.reference).toBe("RELANCE-SIMPLE-B1");
  });

  it("les autres documents du dossier gardent leur titre", async () => {
    const r = succes(await assemblerComplementBail("decompte_retenues", base({ restitutions: [{ id: "r1", statut: "finalise" }], retenues: [] }), "org", "b1"));
    expect(r.titreGed).toBe("Décompte des retenues");
  });
});

describe("Reprise du lot 51, W16 — durée de vie de 0 : aucune décote", () => {
  const REGLE = "Vétusté : la retenue tient compte de l’âge de l’élément";
  const tables = (retenues: Ligne[]) => ({ restitutions: [{ id: "r1", statut: "finalise" }], retenues });
  const ligne = { libelle: "Remise en peinture du séjour", cout: 520, duree_vie_ans: 0, age_ans: 2, montant_retenu: 520, justificatif_document: "d1" };

  it("durée 0, âge 2, coût 520 : pas de règle de vétusté, le coût est dit retenu en intégralité", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([ligne])), "org", "b1")).document.html);
    expect(texte).not.toContain(REGLE);
    expect(texte).toContain("Durée de vie nulle : aucune décote de vétusté n’est appliquée, le coût est retenu en intégralité.");
    expect(texte).toContain("Total : 520,00 €");
  });

  it("une décote réellement appliquée garde sa règle, sans la phrase de la durée nulle", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([{ ...ligne, duree_vie_ans: 9, age_ans: 3, montant_retenu: 346.67 }])), "org", "b1")).document.html);
    expect(texte).toContain(REGLE);
    expect(texte).not.toContain("Durée de vie nulle");
  });
});

describe("Reprise du lot 51, W19 — « prise d’effet » avec une seule apostrophe dans les documents non signés en ligne", () => {
  it("reçu de dépôt : apostrophe typographique, comme la case « Contrat » des documents du dossier", () => {
    const html = construireRecuDepot({
      reference: "DEPOT-1", dateVersement: "2024-06-28", montantVerse: 890, moyen: "Chèque", versant: null, depotConvenu: 890, totalEncaisse: 890,
      plafond: "un mois de loyer hors charges", meuble: false, bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul",
      logementAdresse: "1 rue", referenceBail: "BAIL-42669582", dateBail: "2024-07-01",
      exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: null, telephone: null, ville: "Lyon" }, f: new Fusion(),
    }).html;
    expect(texteDe(html)).toContain("Réf. BAIL-42669582 — prise d’effet le 01/07/2024");
  });

  it("congé du bailleur : même graphie", async () => {
    ctx.bail.date_debut = "2024-07-01";
    ctx.bailleurs = [{ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile" }), quote_part: 100 }];
    const rpc = vi.fn(async () => ({ data: "2029-08-31", error: null }));
    const html = succes(await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", { motif: "motif_legitime", motif_detail: "Impayés répétés." })).document.html;
    expect(texteDe(html)).toContain("— prise d’effet le 01/07/2024");
    expect(texteDe(html)).not.toContain("prise d'effet le");
  });

  it("documents du dossier du bail : graphie inchangée (déjà typographique)", async () => {
    expect(texteDe((await courrier("situation_dette")).document.html)).toContain("Contrat Réf. BAIL-B1 — prise d’effet le 01/12/2025");
  });
});
