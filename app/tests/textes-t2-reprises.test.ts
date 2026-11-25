/**
 * Petites reprises du lot T2 (relecture T2R) — textes et mise en page des baux.
 *
 * T2R-1 : les écrans disent la règle des six mois sous condition (colocation ; pas pour des époux ou partenaires de PACS).
 * T2R-2 : plus de page ne portant que « Date et signatures » — la rubrique des annexes et les signatures forment un ensemble.
 * T2R-3 : la clause de solidarité et la liste des annexes ne se coupent plus entre deux pages.
 * T2R-4 : le refus de l'acte de cautionnement dit que Gerimmo ne prépare pas une caution commune à plusieurs locataires.
 *
 * La mise en page est prouvée par un rendu PDF réel (Chrome du banc ou de la CI : GERIMMO_CHROME), sur les cas témoins de la
 * relecture et sur des cas voisins. Le rendu ARCHIVÉ d'un bail déjà préparé ne reçoit aucune de ces retouches : son
 * empreinte se recalcule à l'identique (signature-empreinte-avant-g8 et -avant-24-octobre restent verts sans changement).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import type { ContexteBail } from "@/lib/documents/modeles/communs";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { AIDE_DEPART_COLOCATAIRE, OPTION_SANS_REMPLACANT, REFUS_RETRAIT_BAIL_SIGNE, RESERVE_EPOUX_PACS } from "@/lib/solidarite-colocation";
import { REFUS_CAUTION_SANS_COLOCATAIRE } from "@/lib/textes-signature-actes";

const LONG = "Clause fictive très longue : le locataire s'engage à entretenir les équipements mis à sa disposition, à signaler sans délai tout désordre et à laisser l'accès au logement pour les visites techniques convenues. ";
type Cas = { n?: number; type?: "nu" | "meuble" | "colocation"; long?: boolean; clauses?: number; agence?: boolean; copro?: boolean; garants?: string[] };
/** Un dossier d'essai : `n` locataires, textes courts ou longs, agence ou bailleur direct, copropriété, garants. */
function dossier(o: Cas): ContexteBail {
  const c = contexte() as ContexteBail & { bail: Record<string, unknown>; organisation: Record<string, unknown> };
  if (o.agence) Object.assign(c.organisation, { type: "agence", name: o.long ? "Agence Immobilière Fictive du Grand Parc de la Tête d'Or et des Quais du Rhône SARL" : "Agence X", siret: "12345678900012", carte_pro: "CPI 6901 2018 000 025 — CCI de Lyon Métropole Saint-Étienne Roanne", garantie_financiere: o.long ? "Compagnie Fictive Européenne de Garanties et Cautions Immobilières, 128 boulevard de l'Essai Prolongé, bâtiment C, 69003 Lyon — 1 200 000 €" : "G, 1 rue A, 69001 Lyon" });
  c.locataires = Array.from({ length: o.n ?? 1 }, (_, i) => personne({ id: `l${i + 1}`, nom: o.long ? ["Martin-Desrosiers de la Villardière", "Nguyen-Van-Thanh-Dupont", "De La Fontaine-Beauregard"][i] : ["Li", "Roy", "Ba"][i], prenom: o.long ? "Léo-Alexandre-Maximilien" : "Al", email: `l${i + 1}@example.invalid` }));
  Object.assign(c.bail, { locataire_principal: "l1", date_debut: "2026-11-15", clauses_particulieres: o.clauses ? LONG.repeat(o.clauses).trim() : null, type: o.type ?? "nu", loyer_hc: 650.5, charges: 50.5 });
  if (o.long) Object.assign(c.bail, { travaux_recents: LONG.repeat(4), travaux_recents_montant: 12000, travaux_locataire: LONG.repeat(3), complement_loyer: 120, complement_justification: LONG.repeat(2) });
  c.bien.copropriete = o.copro ?? true;
  c.garants = (o.garants ?? []).map((g, i) => ({ ...personne({ id: `g${i + 1}`, nom: o.long ? "Garant-Fictif de la Très Longue Dénomination" : "Gu", prenom: "Paul", email: `g${i + 1}@example.invalid` }), garant_de: g })) as never;
  return c;
}
const inventaire = (n: number) => Array.from({ length: n }, (_, i) => ({ piece: ["Séjour", "Cuisine", "Chambre"][i % 3], designation: `Élément fictif n° ${i + 1}`, quantite: 1, etat: "bon", observation: null }));
type Archive = { typographieArchivee?: boolean; presentationAncienne?: boolean };
const nu = (o: Cas, archive: Archive = {}) => construireBailNu(dossier(o), { dpeClasse: "D", f: new Fusion(), ...archive });
const meuble = (o: Cas, lignes = 11, archive: Archive = {}) => construireBailMeuble(dossier({ type: "meuble", ...o }), { dpeClasse: "D", inventaire: inventaire(lignes) as never, f: new Fusion(), ...archive });

describe("T2R-1 — la règle des six mois est dite sous condition, aux deux endroits", () => {
  it("les libellés : la règle de la colocation, « au plus », et sa limite pour des époux ou partenaires de PACS", () => {
    expect(OPTION_SANS_REMPLACANT).toBe("Personne — solidarité 6 mois au plus (sauf époux ou pacsés)");
    expect(RESERVE_EPOUX_PACS).toBe("Cette règle ne s’applique pas si le bail a été consenti exclusivement à des époux ou à des partenaires liés par un PACS : ce n’est pas une colocation au sens de cet article.");
    for (const texte of [AIDE_DEPART_COLOCATAIRE, REFUS_RETRAIT_BAIL_SIGNE]) {
      expect(texte).toMatch(/En colocation, /);
      expect(texte).toContain("six mois au plus");
      expect(texte).toContain(RESERVE_EPOUX_PACS);
      // Aucune référence nouvelle : seul l'article déjà cité par ces écrans.
      expect(texte.match(/art\. [\d-]+/g)).toEqual(["art. 8-1"]);
    }
  });
  it("le formulaire de départ et l'action n'écrivent plus les anciennes phrases, sans condition", () => {
    const formulaire = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-colocation.tsx", "utf8");
    expect(formulaire).toContain('<option value="">{OPTION_SANS_REMPLACANT}</option>');
    expect(formulaire).toContain("{AIDE_DEPART_COLOCATAIRE}");
    expect(formulaire).not.toContain("Personne — solidarité 6 mois<");
    expect(formulaire).not.toContain("jusqu&apos;à six mois après");
    const action = readFileSync("src/app/actions/baux.ts", "utf8");
    expect(action).toContain("return { erreur: REFUS_RETRAIT_BAIL_SIGNE };");
    expect(action).not.toContain("courent encore six mois (art. 8-1");
  });
  it("le calcul de la base n'est pas touché par ce lot : seule la décision du dirigeant (case « mariés ou pacsés ») redéfinit ensuite enregistrer_depart_colocataire", () => {
    // Reprise du lot T3 (T3R-1) : ce test exigeait que la migration du lot T3 reste la dernière ; la reprise en ajoute une
    // (régularisation des charges). Ce qu'il tient, c'est que le calcul de la fin de solidarité n'a pas bougé avec ce lot.
    // Décision du 24/11 (case « mariés ou pacsés », 20261125152000) : c'est elle, et elle seule, qui touche ce calcul
    // (tests/bail-epoux-pacses-base.test.ts) ; la règle de six mois reste celle de tout bail dont la case n'est pas cochée.
    const ordre = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    const suivantes = ordre.slice(ordre.indexOf("20261125111000_textes_officiels_t3.sql") + 1);
    // Fusion des deux arbres de travail (25/11) : les migrations des lots D5 (20261125140000) et de la reprise D4
    // (20261125150000), préparées en parallèle, prennent leur rang d'horodatage ; aucune ne touche ce calcul (ligne suivante).
    expect(suivantes).toEqual([
      "20261125140000_ancien_parcours_signature_manuelle_droits_retires.sql",
      "20261125150000_accord_conditions_version_archivee.sql",
      "20261125151000_textes_t3_reprise_exercice_ancien.sql",
      "20261125152000_bail_locataires_epoux_pacses.sql",
      // Relecture de la fusion (A-01, 25/11) : la case ne vaut que pour les deux personnes présentes à la signature.
      "20261125153000_bail_epoux_pacses_personnes_a_la_signature.sql",
      // Reprise de cette relecture (X-01, 25/11) : la marque suit la nouvelle signature après « Corriger » ; elle ne
      // touche pas ce calcul (filtre ci-dessous).
      "20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature.sql",
    ]);
    // Ce calcul n'est touché que par la case « mariés ou pacsés » et sa reprise A-01 (tests/bail-epoux-pacses-base.test.ts,
    // tests/bail-epoux-pacses-tiers-base.test.ts) ; la règle de six mois reste celle de tout bail dont la case n'est pas cochée.
    expect(suivantes.filter((m) => /enregistrer_depart_colocataire/.test(readFileSync(`supabase/migrations/${m}`, "utf8")))).toEqual([
      "20261125152000_bail_locataires_epoux_pacses.sql",
      "20261125153000_bail_epoux_pacses_personnes_a_la_signature.sql",
    ]);
  });
});

describe("T2R-4 — caution d'un bail à plusieurs locataires : le refus dit aussi la limite de Gerimmo", () => {
  it("un garant ne se rattache qu'à un seul locataire ; pas de caution commune", () => {
    expect(REFUS_CAUTION_SANS_COLOCATAIRE).toContain("Gerimmo ne prépare pas cet acte : le bail a plusieurs locataires et ce garant n'est rattaché à aucun d'eux.");
    expect(REFUS_CAUTION_SANS_COLOCATAIRE).toContain("Un garant ne se rattache qu'à un seul locataire du bail : Gerimmo ne prépare pas l'acte d'une caution commune à plusieurs locataires (deux époux, par exemple).");
    expect(REFUS_CAUTION_SANS_COLOCATAIRE.match(/article [\d-]+/g)).toEqual(["article 8-1"]);
  });
});

describe("T2R-2, T2R-3 — structure du contrat rendu aujourd'hui, et rendu archivé intact", () => {
  /** La profondeur d'imbrication des <div> ouverts juste avant `repere`. */
  const profondeur = (html: string, repere: string) => {
    const avant = html.slice(0, html.indexOf(repere));
    return (avant.match(/<div\b/g) ?? []).length - (avant.match(/<\/div>/g) ?? []).length;
  };
  const INSECABLE = 'style="break-inside:avoid-page;page-break-inside:avoid"';
  const OUVERTURE = `<div data-fin-ensemble ${INSECABLE}>`;
  it.each([["nu, 1 locataire", nu({})], ["nu, 2 locataires", nu({ type: "colocation", n: 2 })], ["meublé, 3 locataires", meuble({ n: 3 })]] as const)("%s : annexes et signatures dans un seul ensemble insécable", (_nom, doc) => {
    const html = doc.html;
    expect(html.split(OUVERTURE)).toHaveLength(2);
    // L'ensemble s'ouvre sur le titre des annexes et contient le bloc de signatures…
    expect(html).toMatch(/<div data-fin-ensemble [^>]*><h2>X?I* — Annexes<\/h2>/);
    expect(html.indexOf(OUVERTURE)).toBeLessThan(html.indexOf('<div class="bloc-signataires">'));
    expect(profondeur(html, '<div class="bloc-signataires">')).toBe(profondeur(html, OUVERTURE) + 1);
    // … et se referme juste après lui (l'inventaire du meublé, sur sa propre page, n'y est pas).
    expect(html).toMatch(/<\/div>\s*<\/div><\/div>(?!\s*<\/div>)/);
    if (html.includes('<div class="saut">')) expect(profondeur(html, '<div class="saut">')).toBe(profondeur(html, OUVERTURE));
    expect(html).toContain(`<p class="mentions" ${INSECABLE}>☐`);
  });
  it("la règle de solidarité (deux ou trois locataires) est un alinéa insécable", () => {
    expect(nu({ type: "colocation", n: 2 }).html).toMatch(new RegExp(`<p ${INSECABLE}>En colocation \\(article 8-1 de la loi du 6 juillet 1989\\)[^<]*au sens de cet article\\.</p>`));
    expect(meuble({ n: 3 }).html).toMatch(new RegExp(`<p ${INSECABLE}>En colocation \\(article 8-1 de la loi du 6 juillet 1989\\)[^<]*date d’effet du congé\\.</p>`));
  });
  it("la feuille de style commune à tous les documents n'est pas touchée (elle entre dans l'empreinte des documents signés en ligne)", () => {
    const feuille = (html: string) => html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(feuille(nu({ type: "colocation", n: 2 }).html)).not.toMatch(/fin-ensemble|insecable/);
    const gabarit = readFileSync("src/lib/documents/gabarit.ts", "utf8");
    expect(gabarit).toContain("const CSS_DOCUMENT = CSS_DOCUMENT_G7 + CSS_CORRECTIFS_G8;");
  });
  it.each([["typographie archivée", { typographieArchivee: true }], ["présentation d'avant #331", { presentationAncienne: true }]] as const)("%s : aucune de ces retouches n'entre dans le rendu d'un bail déjà préparé", (_nom, archive) => {
    for (const html of [nu({ type: "colocation", n: 2, garants: ["l1"] }, archive).html, nu({}, archive).html, meuble({ n: 3 }, 11, archive).html]) {
      expect(html).not.toMatch(/data-fin-ensemble/);
      // Aucun style de coupure porté par un élément du corps du contrat.
      expect(html.slice(html.indexOf("</style>"))).not.toContain("break-inside:avoid-page;page-break-inside:avoid");
      expect(html).toContain('<p class="mentions">☐');
      expect(html).toMatch(/<\/p>\s+<div class="bloc-signataires">/);
    }
  });
});

// ── Rendu PDF réel ───────────────────────────────────────────────────────────────────────────────────────────────────
const CHROME = [process.env.GERIMMO_CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].find((c): c is string => Boolean(c && existsSync(c)));

/** Le texte du corps de chaque page du PDF rendu, sans le pied répété, sans espaces (les titres sont en lettres espacées). */
async function pagesRendues(doc: DocumentAssemble): Promise<string[]> {
  const { rendrePdf } = await import("@/lib/documents/rendu");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chargement = getDocument({ data: new Uint8Array(await rendrePdf(doc)), useSystemFonts: false });
  const pdf = await chargement.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      // Le pied de page (référence, « Document généré avec Gerimmo ») occupe les 50 points du bas : il est écarté.
      const items = (await (await pdf.getPage(n)).getTextContent()).items.filter((i) => "str" in i && i.transform[5] > 50) as { str: string }[];
      pages.push(serre(items.map((i) => i.str).join("")));
    }
    return pages;
  } finally { await chargement.destroy(); }
}
const serre = (texte: string) => texte.replace(/\s+/g, "").replace(/[’']/g, "'").toUpperCase();
const TITRE_SIGNATURES = /X?I+—DATEETSIGNATURES/;

/** Les défauts de coupure d'un bail rendu (aucun attendu). */
function defauts(pages: string[], o: { meuble: boolean; colocation: boolean; locataires: number; copro: boolean }): string[] {
  const d: string[] = [];
  const pageDe = (repere: string) => pages.findIndex((p) => p.includes(serre(repere)));
  const signatures = pages.findIndex((p) => TITRE_SIGNATURES.test(p));
  if (signatures < 0) return ["titre « Date et signatures » introuvable"];
  // T2R-2 : le titre des signatures n'ouvre jamais une page, et la rubrique des annexes est sur la même page.
  if (new RegExp(`^${TITRE_SIGNATURES.source}`).test(pages[signatures])) d.push(`page ${signatures + 1} : ne commence que par « Date et signatures »`);
  if (pageDe("Sont annexées et jointes au contrat les pièces suivantes") !== signatures) d.push("la rubrique des annexes n'est pas sur la page des signatures");
  if (pageDe("grille de vétusté applicable") !== signatures) d.push("la liste des annexes est coupée avant les signatures");
  // Les cadres de signature suivent leur titre sur la même page ; plus rien après (sauf l'inventaire du meublé).
  const apresTitre = pages[signatures].slice(pages[signatures].search(TITRE_SIGNATURES));
  for (const cadre of ["Fait à", "exemplaires originaux que de parties", "Le bailleur", o.colocation ? `Colocataire ${o.locataires}` : o.locataires > 1 ? "Les locataires" : "Le locataire"]) {
    if (!apresTitre.includes(serre(cadre))) d.push(`« ${cadre} » n'est pas sur la page des signatures, sous leur titre`);
  }
  const suivantes = pages.slice(signatures + 1);
  if (!o.meuble && suivantes.some((p) => p.length > 0)) d.push("du texte suit la page des signatures");
  if (o.meuble && !suivantes[0]?.startsWith(serre("Annexe — Inventaire du mobilier"))) d.push("l'inventaire ne suit pas la page des signatures sur sa propre page");
  // T2R-3 : les deux alinéas cités par la relecture tiennent chacun sur une page.
  const entier = (debut: string, fin: string, nom: string) => {
    const a = pageDe(debut), b = pageDe(fin);
    if (a < 0 || b < 0) d.push(`${nom} : introuvable`);
    else if (a !== b) d.push(`${nom} : coupé entre les pages ${a + 1} et ${b + 1}`);
  };
  if (o.locataires > 1) entier("la solidarité de celui des colocataires qui donne congé", o.locataires === 2 ? "n'est pas une colocation au sens de cet article." : "délai de six mois après la date d'effet du congé.", "clause de solidarité");
  if (o.copro) entier("Les extraits du règlement de copropriété (destination", "dans chacune des catégories de charges)", "ligne du règlement de copropriété");
  return d;
}

describe.skipIf(!CHROME)("T2R-2, T2R-3 (rendu PDF réel) — ni page de signatures seule, ni alinéa coupé", () => {
  const CAS: [string, Cas, number?][] = [
    // Les cas témoins de la relecture (pdf/coloc2-court, coloc3-court, meuble-long, agence-long).
    ["témoin : nu, 2 locataires, textes courts", { type: "colocation", n: 2 }],
    ["témoin : nu, 3 locataires, textes courts", { type: "colocation", n: 3 }],
    ["témoin : meublé long, 2 locataires, 60 lignes d'inventaire", { type: "meuble", n: 2, long: true, clauses: 20 }, 60],
    ["témoin : agence, textes longs, 2 locataires", { agence: true, long: true, clauses: 3, n: 2 }],
    // Les cas voisins : un seul locataire, sans copropriété, clauses de une à cent vingt phrases, garants, agence.
    ["voisin : nu, 1 locataire, textes courts, sans copropriété", { copro: false }],
    ["voisin : nu, 1 locataire, textes courts, copropriété", {}],
    ["voisin : nu, 1 locataire, textes longs", { long: true, clauses: 6 }],
    ["voisin : nu, 1 locataire, textes très longs", { long: true, clauses: 120 }],
    ["voisin : nu, 2 locataires, une clause", { type: "colocation", n: 2, clauses: 1 }],
    ["voisin : nu, 2 locataires, trois clauses", { type: "colocation", n: 2, clauses: 3 }],
    ["voisin : nu, 2 locataires, sept clauses", { type: "colocation", n: 2, clauses: 7 }],
    ["voisin : nu, 2 locataires, sans copropriété", { type: "colocation", n: 2, copro: false }],
    ["voisin : nu, 3 locataires, textes très longs, trois garants", { type: "colocation", n: 3, long: true, clauses: 90, garants: ["l1", "l2", "l3"] }],
    ["voisin : agence, 3 colocataires, textes longs, un garant", { agence: true, type: "colocation", n: 3, long: true, clauses: 12, garants: ["l1"] }],
    ["voisin : meublé, 1 locataire, textes courts", { type: "meuble" }, 11],
    ["voisin : meublé, 1 locataire, textes très longs, 140 lignes d'inventaire", { type: "meuble", long: true, clauses: 100 }, 140],
    ["voisin : meublé, 3 locataires, textes courts", { type: "meuble", n: 3 }, 5],
    ["voisin : agence, meublé long, 3 locataires", { agence: true, type: "meuble", n: 3, long: true, clauses: 6 }, 30],
  ];
  it.each(CAS)("%s", { timeout: 90_000 }, async (_nom, cas, lignes) => {
    const estMeuble = cas.type === "meuble";
    const doc = estMeuble ? meuble(cas, lignes) : nu(cas);
    expect(doc.manquants).toEqual([]);
    expect(defauts(await pagesRendues(doc), { meuble: estMeuble, colocation: cas.type === "colocation", locataires: cas.n ?? 1, copro: cas.copro ?? true })).toEqual([]);
  });
});
