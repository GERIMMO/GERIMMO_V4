/**
 * Phase 3 de la mission palier 1, lot 50 — contrats de location, résumé de la notice, avenant de remplacement.
 *
 *  - W01, W02, W06 : le bail nu, le bail meublé, le bail commun et le contrat individuel de colocation fixent un paiement par
 *    virement et imprimaient « Coordonnées bancaires : — » sans IBAN, sans le signaler. Ils suivent maintenant la règle de
 *    l'avis d'échéance (C50, C72) : par virement, l'IBAN du profil de l'espace est à renseigner. Un bail déjà préparé pour la
 *    signature (typographie archivée) garde son rendu, pour que son empreinte se recalcule à l'identique.
 *  - W03 : le titre de classement du bail meublé généré dit qu'il est à faire signer, comme le bail nu.
 *  - W04 : l'introduction du résumé de la notice n'annonce plus les voies « d'indemnisation », qu'aucune rubrique ne traite.
 *  - W05 : « Période de construction » est sur sa propre ligne : le libellé ne reste plus en bas de page sans sa valeur.
 *  - W07 : dans le contrat individuel, « Partie privative et espaces partagés » et « Indépendance du contrat » sont des
 *    rubriques de la section II (niveau des rubriques A, B, C), plus des titres de section.
 *  - W08 : le cadre de signature de l'entrant porte son identité (première ligne saisie), pas tout le bloc d'adresse ; l'écran
 *    demande ce que la liste « À renseigner » exige.
 * Chaque cas échouait avant le correctif.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, LIBELLE_COORDONNEES_BANCAIRES, type ContexteBail } from "@/lib/documents/modeles/communs";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerBailMeuble, construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerNotice } from "@/lib/documents/modeles/notice";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
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
  return { from: requete, rpc: (nom: string) => requete(nom) } as unknown as SupabaseClient;
}
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) =>
  html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

type Options = { typographieArchivee?: boolean };
const CONTRATS: Record<string, (ctx: ContexteBail, o?: Options) => DocumentAssemble> = {
  nu: (ctx, o = {}) => construireBailNu(ctx, { dpeClasse: "D", f: new Fusion(), ...o }),
  meuble: (ctx, o = {}) => construireBailMeuble(ctx, { dpeClasse: "D", inventaire: [], f: new Fusion(), ...o }),
};
function sansIban(lieu = "Virement bancaire"): ContexteBail {
  const ctx = contexte();
  ctx.organisation.iban = null;
  ctx.bail.lieu_paiement = lieu;
  return ctx;
}
function individuel(): ContexteBail {
  const ctx = contexte();
  Object.assign(ctx.bail, { type: "colocation", chambre_id: "c1" });
  ctx.chambre = { id: "c1", nom: "Chambre 2", surface_m2: "14.00" as never, volume_m3: "35.00" as never, description: "Porte palière à gauche.", espaces_partages: "Cuisine, salle d'eau.", equipements: "Lit, bureau." };
  ctx.plafondColocation = 1800;
  return ctx;
}

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("W01, W02, W06 — un contrat qui fixe le virement donne le compte où verser", () => {
  it.each(Object.keys(CONTRATS))("bail %s par virement sans IBAN : « À renseigner », plus « — » (PDF non produit)", (cle) => {
    const doc = CONTRATS[cle](sansIban());
    expect(doc.manquants).toContain(LIBELLE_COORDONNEES_BANCAIRES);
    expect(texteDe(doc.html)).not.toContain("Coordonnées bancaires : —");
    expect(refusDocumentIncomplet(doc)?.manquants).toContain(LIBELLE_COORDONNEES_BANCAIRES);
  });
  it.each(Object.keys(CONTRATS))("bail %s : l'IBAN connu s'imprime ; un autre mode de paiement garde « — » sans manquant", (cle) => {
    expect(texteDe(CONTRATS[cle](contexte()).html)).toContain("Coordonnées bancaires : FR76 3000 4000 0500 0012 3456 789.");
    const autre = CONTRATS[cle](sansIban("Domicile du bailleur"));
    expect(texteDe(autre.html)).toContain("Coordonnées bancaires : —.");
    expect(autre.manquants).not.toContain(LIBELLE_COORDONNEES_BANCAIRES);
  });
  it.each(Object.keys(CONTRATS))("bail %s déjà préparé pour la signature (typographie archivée) : rendu inchangé", (cle) => {
    const doc = CONTRATS[cle](sansIban(), { typographieArchivee: true });
    expect(doc.html).toContain("Coordonnées bancaires :\n    —.<br/>");
    expect(doc.manquants).not.toContain(LIBELLE_COORDONNEES_BANCAIRES);
  });
  it("le contrat individuel de colocation suit la même règle", () => {
    const c = individuel();
    c.organisation.iban = null;
    expect(CONTRATS.nu(c).manquants).toContain(LIBELLE_COORDONNEES_BANCAIRES);
    expect(CONTRATS.meuble(c).manquants).toContain(LIBELLE_COORDONNEES_BANCAIRES);
  });
});

describe("W03 — le bail meublé généré est classé « à faire signer »", () => {
  it("titre de classement", async () => {
    ctx.bail.type = "meuble";
    const r = succes(await assemblerBailMeuble(base(), "org", "b1"));
    expect(r.titreGed).toBe("Bail meublé (généré, à faire signer) — Leblanc Julie");
  });
});

describe("W04 — l'introduction du résumé de la notice n'annonce que ce qu'il contient", () => {
  it("plus de voies « d'indemnisation »", async () => {
    const texte = texteDe(succes(await assemblerNotice(base(), "org", "b1")).document.html);
    expect(texte).not.toMatch(/indemnisation/i);
    expect(texte).toContain("Ce résumé rappelle les droits et obligations respectifs des parties ainsi que les voies de recours ouvertes en cas de litige.");
  });
});

describe("W05 — « Période de construction » ne se sépare plus de sa valeur", () => {
  it.each(Object.keys(CONTRATS))("bail %s : libellé et valeur sur une ligne à part ; typographie archivée inchangée", (cle) => {
    const c = contexte();
    expect(CONTRATS[cle](c).html).toMatch(/copropriété<\/span><br\/>\n {4}Période de construction : <span class="v">/);
    expect(CONTRATS[cle](c, { typographieArchivee: true }).html).toMatch(/copropriété<\/span> —\n {4}Période de construction : /);
  });
});

describe("W07 — les intertitres du contrat individuel restent dans la section II", () => {
  it.each(Object.keys(CONTRATS))("bail %s individuel : rubriques <h3>, comme A, B et C", (cle) => {
    const html = CONTRATS[cle](individuel()).html;
    expect(html).toContain("<h3>Partie privative et espaces partagés</h3>");
    expect(html).toContain("<h3>Indépendance du contrat</h3>");
    expect(html).not.toContain("<h2>Indépendance du contrat</h2>");
    const titres = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(titres[titres.indexOf("II — Objet du contrat") + 1]).toBe("III — Date de prise d'effet et durée du contrat");
  });
  it.each(Object.keys(CONTRATS))("bail %s individuel déjà préparé pour la signature : rendu inchangé", (cle) => {
    expect(CONTRATS[cle](individuel(), { typographieArchivee: true }).html).toContain("<h2>Indépendance du contrat</h2>");
  });
});

describe("W08 — avenant de remplacement : l'identité de l'entrant dans son cadre de signature", () => {
  const options = { sortant: "p1", entrant: "Fictif Damien\nné le 29/05/1997 à Chambéry\n11 rue de la Maquette, 73000 Chambéry", date_effet: "2027-03-31", depot: "Conservé" };
  beforeEach(() => {
    ctx.bail.etat = "actif";
    ctx.bail.type = "colocation";
    ctx.locataires = [personne(), personne({ id: "p2", nom: "Fictif", prenom: "Bruno" })];
  });
  it("le cadre porte la première ligne ; la phrase des parties garde toute la saisie", async () => {
    const r = succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", options));
    expect(r.document.html).toContain('<div class="bandeau">Le colocataire entrant</div><div class="zone"><span class="v">Fictif Damien</span></div>');
    expect(r.document.html).toContain("colocataire entrant : <span class=\"v\">Fictif Damien\nné le 29/05/1997 à Chambéry\n11 rue de la Maquette, 73000 Chambéry</span>");
  });
  it("sans saisie, le cadre garde le repère « À renseigner » ; l'écran demande la même chose", async () => {
    const r = succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", { ...options, entrant: "" }));
    expect(r.document.manquants).toContain("identité, adresse et état civil de l’entrant");
    const champ = OPTIONS_CATALOGUE.avenant_remplacement.find((c) => c.cle === "entrant");
    expect(champ?.libelle).toBe("Identité, adresse et état civil de l’entrant");
    expect(champ?.aide).toContain("Première ligne : Nom Prénom");
  });
});
