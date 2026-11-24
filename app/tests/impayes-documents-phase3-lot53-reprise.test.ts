/**
 * Phase 3 de la mission palier 1, reprise du lot 53 — constats du relecteur sur f2fbb2e0.
 *
 *  - W33 (bloquant) : le solde des courriers d'impayés, posé en paragraphe « gardé » sous le tableau (break-before:avoid),
 *    partait seul en tête de page dès que le tableau remplissait la page (relevé de 40 lignes), et la clôture du relevé de
 *    situation se coupait (36 à 39 lignes : image de signature sans son libellé, « Fait à » sans signature, clôture seule).
 *    Chrome ne revient pas dans un tableau terminé pour y couper plus tôt. Le solde est désormais la dernière rangée du
 *    tableau, dans une dernière section insécable avec la dernière échéance ; celle du relevé de situation porte aussi la
 *    clôture. Prouvé par des rendus réels de 1 à 45 lignes (sans signature, 3:1, carrée) ;
 *  - W34 : la consigne d'envoi du recommandé était repliée dans « Délai de règlement » et parlait aussi pour l'AR24 ;
 *  - W35 : « Mise en demeure de payer — 24/11/2026 généré — … » : le message de génération lit « <titre> : PDF généré — … ».
 * Les documents signés en ligne (leur HTML est l'empreinte de leur circuit de signature) ne changent pas : garde ci-dessous.
 * Chaque cas W33 à W35 échouait avant le correctif.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
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
import { chargerContexteBail, signatureOrganisation, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerBailColocation } from "@/lib/documents/modeles/bail-colocation";
import { assemblerBailIndividuel } from "@/lib/documents/modeles/bail-individuel";
import { assemblerNotice } from "@/lib/documents/modeles/notice";
import { assemblerAvenant } from "@/lib/documents/modeles/avenant";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { assemblerProrata } from "@/lib/documents/modeles/prorata";
import { Fusion, tableau, type DocumentAssemble } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/** Une base simulée : chaque table (ou fonction) rend toutes ses lignes, filtres ignorés ; `maybeSingle` la première. */
function base(tables: Record<string, Ligne[]> = {}): SupabaseClient {
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

/** n échéances mensuelles jusqu'à novembre 2026, une sur trois réglée en partie (comme la sonde de rendu du relecteur). */
const termes = (n: number) => Array.from({ length: n }, (_, i) => {
  const iso = new Date(Date.UTC(2026, 10 - n + i + 1, 1)).toISOString().slice(0, 10);
  return { appel_id: `a${i}`, periode: iso, date_echeance: `${iso.slice(0, 8)}05`, montant_du: 565, montant_couvert: i % 3 === 0 ? 100 : 0 };
});
const plan = { id: "p1", bail_id: "b1", etat: "propose", date_arrete: "2026-11-20", dette_initiale: 1130, acompte: 0, tolerance_jours: 5, seuil_caducite: 2, conditions: null };
const tablesImpayes = (n = 2) => ({
  restitutions: [], relances: [], appels_loyer: [], etats_des_lieux: [], etat_loyers_bail: termes(n),
  plans_apurement: [plan], plan_apurement_tranches: [{ rang: 1, echeance: "2026-12-05", montant: 1130 }],
});
type CodeImpaye = "relance_simple" | "seconde_relance" | "mise_en_demeure" | "situation_dette" | "protocole_apurement";
const courrier = async (code: CodeImpaye, n = 2) => succes(await assemblerComplementBail(code, base(tablesImpayes(n)), "org", "b1", { delai: "8" }));

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  ctx.bail.date_debut = "2023-01-01";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** La dernière section du tableau des échéances (celle qui ne se coupe pas). */
const derniereSection = (html: string) => /<tbody style="break-inside:avoid-page;page-break-inside:avoid">([\s\S]*?)<\/tbody><\/table>/.exec(html)?.[1] ?? "";

describe("W33 — le solde est la dernière rangée du tableau, insécable avec la dernière échéance", () => {
  it.each(["situation_dette", "relance_simple", "seconde_relance", "mise_en_demeure"] as const)("%s : solde et dernière échéance dans la dernière section du tableau", async (code) => {
    const html = (await courrier(code, 5)).document.html;
    const fin = derniereSection(html);
    expect(fin).toMatch(/^<tr><td><span class="v">novembre 2026<\/span><\/td>/);
    expect(fin).toContain('<tr><td colspan="5" style="padding:4pt 0 0;border-bottom:0"><strong>Solde échu au <span class="v">24/11/2026</span> :');
    // Plus de paragraphe de solde « gardé » sous le tableau : il partait seul en tête de page.
    expect(html).not.toMatch(/<p[^>]*><strong>Solde échu/);
    // Les règles de coupure communes ne sont pas défaites.
    expect(html).toContain("p { break-inside:auto; page-break-inside:auto; }");
    expect(html).toContain(".fait-a { break-before:avoid-page;");
  });

  it("relevé de situation : « Fait à » et la signature sont dans la dernière section du tableau, après le solde", async () => {
    vi.mocked(signatureOrganisation).mockResolvedValueOnce("data:image/png;base64,iVBORw0KGgo=");
    const html = (await courrier("situation_dette", 38)).document.html;
    const fin = derniereSection(html);
    expect(fin.indexOf("Solde échu")).toBeGreaterThan(0);
    expect(fin.indexOf('<p class="fait-a">Fait à')).toBeGreaterThan(fin.indexOf("Solde échu"));
    expect(fin).toMatch(/<p class="fait-a">Fait à [\s\S]*<div class="sig-emetteur">[\s\S]*class="sig-image"[\s\S]*class="sig-nom"/);
    expect(html.match(/<p class="fait-a">/g)).toHaveLength(1);
  });

  it.each(["relance_simple", "seconde_relance", "mise_en_demeure"] as const)("%s : la clôture reste après les paragraphes du courrier, hors du tableau", async (code) => {
    const html = (await courrier(code)).document.html;
    expect(derniereSection(html)).not.toContain("Fait à");
    expect(html.indexOf('<p class="fait-a">')).toBeGreaterThan(html.indexOf("Modalités de règlement"));
  });

  it("un tableau sans fin garde exactement son HTML (tous les autres documents)", () => {
    expect(tableau([{ libelle: "Nature" }, { libelle: "Montant", droite: true }], [["Loyer", "500,00 €"], ["Charges", "50,00 €"]]))
      .toBe('<table><thead><tr><th>Nature</th><th class="d">Montant</th></tr></thead><tbody><tr><td>Loyer</td><td class="d">500,00 €</td></tr><tr><td>Charges</td><td class="d">50,00 €</td></tr></tbody></table>');
  });
});

describe("W34 — la consigne d'envoi du PDF est visible sous son bouton, hors du réglage replié du délai", () => {
  const source = readFileSync(join(__dirname, "../src/components/rappels-loyers-interactifs.tsx"), "utf8");
  const preparation = source.slice(source.indexOf("function PreparationRecommande("), source.indexOf("\n}\n", source.indexOf("function PreparationRecommande(")));
  const CONSIGNE = "Ce PDF n’est pas envoyé par Gerimmo : à notifier avec preuve de réception.";
  it("elle parle du seul PDF et suit le bouton « Générer le recommandé en PDF »", () => {
    expect(preparation.indexOf(CONSIGNE)).toBeGreaterThan(preparation.indexOf("Générer le recommandé en PDF"));
  });
  it("elle n'est plus dans le <details> « Délai de règlement », qui sert aussi au recommandé AR24 envoyé par Gerimmo", () => {
    const replie = preparation.slice(preparation.indexOf("<details>"), preparation.indexOf("</details>"));
    expect(replie).toContain("Délai de règlement");
    expect(replie).not.toMatch(/notifier|n’envoie pas/);
    const position = preparation.indexOf(CONSIGNE);
    expect(position < preparation.indexOf("<details>") || position > preparation.indexOf("</details>")).toBe(true);
  });
});

describe("W33 — garde : le HTML des documents signés en ligne ne change pas (empreinte de leur circuit de signature)", () => {
  const sha = (doc: DocumentAssemble) => createHash("sha256").update(doc.html, "utf8").digest("hex");
  const donneesEdl = (type: "entree" | "sortie"): DonneesEdl => ({
    type, reference: "EDL-1", dateEdl: "2026-10-07", dateEdlEntree: "2023-09-01", signeLe: null, personnesPresentes: "Les parties",
    detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true, adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon",
    observations: "Néant",
    lignes: [
      { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null },
      { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "mauvais", commentaire: "Trous de chevilles derrière le canapé" },
    ],
    compteurs: [{ type: "Eau froide", numero: "EF-1", releve: 402.8 }], cles: [{ libelle: "Porte d'entrée", nombre: 2, reference: null }], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "contact@example.invalid", telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(),
  });
  const colocation = () => {
    const c = contexte();
    c.bail.type = "colocation";
    c.locataires.push(personne({ id: "p2", nom: "Martin", prenom: "Léo" }));
    return c;
  };
  const clientColocation = () => {
    const from = (table: string) => {
      const resultat = { data: table === "diagnostics" ? { classe_dpe: "D" } : [], error: null };
      const q = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: async () => resultat, then: (ok: (v: unknown) => unknown) => Promise.resolve(resultat).then(ok) };
      return q;
    };
    return { from } as unknown as SupabaseClient;
  };
  const inventaire = [{ piece: "Salon", designation: "Table", quantite: 1, etat: "bon", observation: null }];
  // Empreintes relevées sur le code 651f7f64 (avant la reprise du lot 53).
  // Textes officiels, lot T2 (25/11/2026) : six empreintes changent VOLONTAIREMENT. Les baux (nu, meublé, colocation, contrat
  // individuel), l'acte de cautionnement et le résumé de la notice ont reçu les textes corrigés d'après le recueil
  // (textes-officiels-t2.test.ts). Un bail déjà préparé pour la signature se relit toujours à l'identique par le rendu
  // archivé (signature-empreinte-avant-g8.test.ts, inchangé). Anciennes empreintes :
  //   bail_nu 154c4f7e321d4ffbd05908727375d52ec009ca1fe12289cd87d6b159d05ceb7d
  //   bail_meuble 0c4a7adc4096de3362a1090b75659b596e0bb4b90722416d0eda14b10cfc2b88
  //   bail_colocation aed3af5dd5e3a23dad87b6507188448d6d5a449f443ad4bcd536f52637f96111
  //   bail_individuel c050239518810a2abc538d9a483c8157afbddb3d4d90abcd1ea538b176127304
  //   notice 23f70583f1c11c540538fe8ac29c4e7cb6dc29fad487de257f6b534075985a89
  //   cautionnement 29215ed449ecd868c147fec1121d43e9eb3fcf208879f1d5327dc8f6053e9a0c
  const ATTENDU: Record<string, string> = {
    autorisation_travaux: "a055b8eaea533fd24e5912def245cffef02fcd57cccc44983aa815b37904706f",
    avenant: "574e5d33716c8970cd60e45ff90f103c59a4b461497c60762969ce6b9b04f332",
    avenant_remplacement: "748025b2c70cd30b567d950747e521071274ac92e92c12ec81d0529f16f96179",
    bail_colocation: "9e48131977f5d22a14f1ffbfab82fc0f06d5fb80248c6ac01addc6cbadc955c2",
    bail_individuel: "c537685fd17f2514147186cba71d1c987f3f1d5ca1fc784e26247a4971290dce",
    bail_meuble: "282b3ea7e5296794cd0c8805080586362e0d353475cb89f04a014a847dc86705",
    bail_nu: "1879fd7a97f6e8bc9c8a966cec3973e17fb25ac2adf7e3d9f62d33c9490cd33c",
    cautionnement: "7bd6bac8cc0599899c74c90ea0372b8402aa5b2ae9d45dedcdfb2d1898946b06",
    edl_entree: "200466aa191403c439ec7ba0aba70e9bc255f06cec214a3a70aac0c4f78cf6cf",
    // Textes officiels, lot T3 (R15-A1) : empreinte changée VOLONTAIREMENT. L'état des lieux de sortie imprime la mention du
    // décret du 30 mars 2016 (« Adresse du nouveau domicile ou du lieu d'hébergement du locataire ») à la place de
    // « Adresse de restitution du dépôt de garantie ». Un état des lieux de sortie préparé pour la signature mais pas encore
    // envoyé se prépare de nouveau (règle de Q40). Ancienne empreinte :
    //   edl_sortie 7b7b1f541e38f105cd3ebd5addcb4b95a99e7a190338fea149000cb381ac8752
    edl_sortie: "384b844b3a3d2744d1e21e9a26630414b79aad18d1d25c7d18ef5d927c07a0e5",
    notice: "41173fa67be66a45b3f10509968d7069f8286c2cffbdbd8aacb56b6124578452",
    // Relecture des reprises 52-53 : l'IBAN du contexte d'essai (« FR76 3000 4000 0500 0012 3456 789 ») est fictif et sa clé de
    // contrôle est fausse ; ibanLisible ne le regroupe plus, il s'imprime tel que saisi. Seul un protocole dont l'IBAN enregistré
    // a une clé fausse change donc d'empreinte ; avec un IBAN valide, son HTML est le même qu'avant (cas du banc, contrôlé au
    // rendu des familles). Ancienne empreinte : 5b5f7821e7a0d864c1c40370bfa4fecfe1f39c5e44011b7fa8881c2bc20c7fd4.
    protocole_apurement: "1c51d3a4d4f6fdd8b0acb0393b9f99846f0b2374fd9d6f9b47e1d7261af9f359",
  };
  const documents: [string, () => Promise<DocumentAssemble>][] = [
    ["bail_nu", async () => construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() })],
    ["bail_meuble", async () => construireBailMeuble(ctx, { dpeClasse: "D", inventaire, f: new Fusion() } as never)],
    ["bail_colocation", async () => { vi.mocked(chargerContexteBail).mockResolvedValueOnce(colocation()); return succes(await assemblerBailColocation(clientColocation(), "org", "b1")).document; }],
    // Relecture des reprises 52-53 : le contrat individuel de colocation est signé en ligne (politique-signature.ts) ; sa garde
    // manquait. Empreinte relevée sur 962ee6ea, code du contrat inchangé depuis le lot 50 (comparaison.txt de la reprise 53).
    ["bail_individuel", async () => {
      const c = colocation();
      c.locataires.splice(1);
      Object.assign(c.bail, { chambre_id: "c1" });
      c.chambre = { id: "c1", nom: "Chambre 2", surface_m2: "14.00" as never, volume_m3: "35.00" as never, description: "Porte palière à gauche.", espaces_partages: "Cuisine, salle d'eau.", equipements: "Lit, bureau." };
      vi.mocked(chargerContexteBail).mockResolvedValueOnce(c);
      return succes(await assemblerBailIndividuel(clientColocation(), "org", "b1")).document;
    }],
    ["notice", async () => succes(await assemblerNotice(base(), "org", "b1")).document],
    ["edl_entree", async () => construireEdl(donneesEdl("entree"))],
    ["edl_sortie", async () => construireEdl(donneesEdl("sortie"))],
    ["cautionnement", async () => {
      ctx.garants = [{ ...personne({ id: "c622a941-garant", nom: "Fictif", prenom: "Gérard" }), garant_de: null }] as never;
      return succes(await assemblerCautionnement(base(), "org", "b1", { garant: "c622a941-garant", forme: "solidaire", sans_garantie_cumulee: "oui", montant_max: "1200,50" })).document;
    }],
    ["avenant", async () => succes(await assemblerAvenant(base(), "org", "b1", { objet: "Ajout d'un emplacement de parking", modifications: "Le bail porte aussi sur le parking n° 4." })).document],
    ["avenant_remplacement", async () => {
      ctx.bail.type = "colocation";
      ctx.locataires.push(personne({ id: "p2", nom: "Martin", prenom: "Léo" }));
      return succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", { sortant: "p2", entrant: "Martin Paul\n1 rue Neuve, 69003 Lyon", date_effet: "2027-03-31", depot: "Conservé" })).document;
    }],
    ["protocole_apurement", async () => (await courrier("protocole_apurement", 5)).document],
    ["autorisation_travaux", async () => succes(await assemblerComplementBail("autorisation_travaux", base(), "org", "b1", { travaux: "Pose d'une cuisine", intervenant: "Entreprise fictive", periode: "décembre 2026", prise_en_charge: "Locataire", conditions: "Remise en état" })).document],
  ];
  it.each(documents)("%s : HTML identique", async (code, construire) => {
    const empreinte = sha(await construire());
    expect(empreinte).toBe(ATTENDU[code]);
  });
});

/** Une image PNG opaque de `largeur` × `hauteur` pixels, en data-URI : la taille d'une signature enregistrée. */
function signaturePng(largeur: number, hauteur: number): string {
  const morceau = (type: string, donnees: Buffer) => {
    const longueur = Buffer.alloc(4); longueur.writeUInt32BE(donnees.length);
    const corps = Buffer.concat([Buffer.from(type, "ascii"), donnees]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(corps));
    return Buffer.concat([longueur, corps, crc]);
  };
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0); entete.writeUInt32BE(hauteur, 4); entete[8] = 8; entete[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(largeur * 3, 0x30)]);
  const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: hauteur }, () => ligne)));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", entete), morceau("IDAT", pixels), morceau("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// Rendu PDF réel : seulement si un Chrome local est disponible (le banc et la CI fournissent GERIMMO_CHROME).
const CHROME = [process.env.GERIMMO_CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].find((c): c is string => Boolean(c && existsSync(c)));

/** Le texte du corps de chaque page (sans le pied répété) et la présence d'une image, lus dans le PDF rendu. */
async function pagesRendues(doc: DocumentAssemble): Promise<{ texte: string; image: boolean }[]> {
  const { rendrePdf } = await import("@/lib/documents/rendu");
  const octets = await rendrePdf(doc);
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chargement = getDocument({ data: new Uint8Array(octets), useSystemFonts: false });
  const pdf = await chargement.promise;
  try {
    const pages: { texte: string; image: boolean }[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      // Le pied de page (référence, « Document généré avec Gerimmo ») occupe les 58 px du bas : il est écarté.
      const items = (await page.getTextContent()).items.filter((i) => "str" in i && i.transform[5] > 50) as { str: string }[];
      const operations = await page.getOperatorList();
      pages.push({ texte: items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(), image: operations.fnArray.includes(OPS.paintImageXObject) });
    }
    return pages;
  } finally { await chargement.destroy(); }
}
const LIBELLE_SIGNATURE = /S\s*I\s*G\s*N\s*A\s*T\s*U\s*R\s*E/;
const ENTETES_TABLEAU = /P\s*É\s*R\s*I\s*O\s*D\s*E|É\s*C\s*H\s*É\s*A\s*N\s*C\s*E|A\s*P\s*P\s*E\s*L\s*É|C\s*O\s*U\s*V\s*E\s*R\s*T|R\s*E\s*S\s*T\s*E\s*D\s*Û/g;
/** Les défauts de coupure d'un rendu (aucun attendu) : critères du relecteur. */
function defautsDeCoupure(pages: { texte: string; image: boolean }[], avecImage: boolean): string[] {
  const defauts: string[] = [];
  const pageDe = (motif: RegExp | string) => pages.findIndex((p) => (typeof motif === "string" ? p.texte.includes(motif) : motif.test(p.texte)));
  const fait = pageDe("Fait à"), libelle = pageDe(LIBELLE_SIGNATURE);
  const derniere = pages.map((p) => p.texte.length > 0).lastIndexOf(true);
  if (fait < 0 || libelle < 0) return ["clôture introuvable"];
  if (fait !== libelle) defauts.push(`« Fait à » en page ${fait + 1}, signature en page ${libelle + 1}`);
  if (derniere !== libelle) defauts.push(`libellé SIGNATURE en page ${libelle + 1}, nom du signataire en page ${derniere + 1}`);
  if (avecImage && pages.map((p) => p.image).lastIndexOf(true) !== libelle) defauts.push("image de signature séparée de son libellé");
  const avantFait = pages[fait].texte.slice(0, pages[fait].texte.indexOf("Fait à")).replace(ENTETES_TABLEAU, "").trim();
  if (!avantFait) defauts.push(`clôture seule en page ${fait + 1}`);
  pages.forEach((p, i) => {
    const k = p.texte.indexOf("Solde échu");
    if (i > 0 && k >= 0 && !/\d{2}\/\d{2}\/\d{4}/.test(p.texte.slice(0, k))) defauts.push(`« Solde échu » en tête de la page ${i + 1}, sans ligne du tableau`);
  });
  return defauts;
}

describe.skipIf(!CHROME)("W33 (rendu réel) — ni solde seul, ni clôture coupée, quelle que soit la longueur du relevé", () => {
  const SIGNATURES = [["3:1", signaturePng(300, 100)], ["carrée", signaturePng(200, 200)]] as const;
  // 36 à 40 lignes : les longueurs où le relecteur a vu le défaut (bail d'environ trois ans) ; 35 et 41 encadrent.
  const relevés = SIGNATURES.flatMap(([nom, image]) => [35, 36, 37, 38, 39, 40, 41].map((n) => [n, nom, image] as const));
  it.each(relevés)("relevé de situation, %i lignes, signature %s", { timeout: 60_000 }, async (n, _nom, image) => {
    vi.mocked(signatureOrganisation).mockResolvedValueOnce(image);
    expect(defautsDeCoupure(await pagesRendues((await courrier("situation_dette", n)).document), true)).toEqual([]);
  });
  const courriers = (["relance_simple", "seconde_relance", "mise_en_demeure"] as const).flatMap((code) => [36, 37, 38, 39].map((n) => [code, n] as const));
  it.each(courriers)("%s, %i lignes, signature 3:1", { timeout: 60_000 }, async (code, n) => {
    vi.mocked(signatureOrganisation).mockResolvedValueOnce(SIGNATURES[0][1]);
    expect(defautsDeCoupure(await pagesRendues((await courrier(code, n)).document), true)).toEqual([]);
  });
});

describe.skipIf(!CHROME)("Reprise du lot 52 (rendu réel) — avis et prorata à trois locataires et adresse longue : une clôture qui déborde part avec le paragraphe qui la précède", () => {
  const ADRESSE = "Appartement traversant du bâtiment B, escalier 2, résidence des Essais fictifs";
  const LOCATAIRES = "Fictive-Lambert Marie-Charlotte, Fictif-Delacroix Jean-Baptiste, Fictive-Montgolfier Anne-Sophie";
  const cas = [["3:1", signaturePng(300, 100)], ["carrée", signaturePng(200, 200)]].flatMap(([nom, image]) => [1, 2, 3].map((longueur) => [longueur, nom, image] as const));
  it.each(cas)("avis d'échéance réglé en partie, adresse ×%i, signature %s", { timeout: 60_000 }, async (longueur, _nom, image) => {
    const doc = construireAvisEcheance({
      reference: "AVIS-1", periode: "2026-09-01", dateEcheance: "2026-09-05", loyerHc: 700, charges: 60, montantDu: 760, prorata: false,
      dejaRegle: 400, suivantsEchus: 1530.5, lieuPaiement: "Virement bancaire", iban: "FR7630006000011234567890189",
      bailleurNom: "Fictive Jeanne", locatairesNoms: LOCATAIRES,
      logementAdresse: `8 avenue des Essais, 69003 Lyon, ${Array(longueur).fill(ADRESSE).join(", ")}, 2e étage, porte gauche`,
      referenceBail: "BAIL-BACFFE39", dateBail: "2025-10-15",
      exp: { nom: "Fictive Jeanne", adresse: "12 rue des Essais, 69003 Lyon", email: "jeanne@exemple.fr", telephone: "06 00 00 00 00", ville: "Lyon" },
      typeOrganisation: "proprietaire_direct", signatureImg: image, jour: "2026-11-24", f: new Fusion(),
    });
    expect(defautsDeCoupure(await pagesRendues(doc), true)).toEqual([]);
  });
  it.each(cas)("décompte de prorata, adresse ×%i, signature %s", { timeout: 60_000 }, async (longueur, _nom, image) => {
    ctx.bail.date_debut = "2025-10-15";
    ctx.locataires = [
      personne({ id: "p1", nom: "Fictive-Lambert", prenom: "Marie-Charlotte" }),
      personne({ id: "p2", nom: "Fictif-Delacroix", prenom: "Jean-Baptiste" }),
      personne({ id: "p3", nom: "Fictive-Montgolfier", prenom: "Anne-Sophie" }),
    ];
    ctx.lot.nom = Array(longueur).fill(ADRESSE).join(", ");
    vi.mocked(signatureOrganisation).mockResolvedValueOnce(image);
    const appel = { id: "a1", bail_id: "b1", periode: "2025-10-01", loyer_hc: 383.87, charges: 32.9, montant_du: 416.77, prorata: true, base_loyer_hc: 700, base_charges: 60 };
    const r = succes(await assemblerProrata(base({ appels_loyer: [appel] }), "org", "a1"));
    expect(defautsDeCoupure(await pagesRendues(r.document), true)).toEqual([]);
  });
});
