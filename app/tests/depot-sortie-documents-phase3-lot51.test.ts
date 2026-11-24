/**
 * Phase 3 de la mission palier 1, lot 51 — famille « dépôt et sortie », relecture des PDF de la passe 1 (W09 à W22).
 *
 *  - W09, W10 : la suite d'une grille d'état des lieux coupée par la page ne disait pas à quelle pièce elle appartient (seul
 *    l'en-tête de colonnes se répète) ; le petit tableau des compteurs se coupait entre ses deux lignes ;
 *  - W11 : le reçu de dépôt datait le bail de sa prise d'effet (« Réf. … du 01/07/2024 », même défaut que C14) ;
 *  - W12 : l'acte de cautionnement solidaire et l'acte simple du même garant avaient le même numéro ;
 *  - W13 : le « € » du plafond garanti passait seul à la ligne ;
 *  - W14 : le reçu de dépôt (titre sur deux lignes) partait sur deux feuilles ;
 *  - W15 : le décompte de restitution expliquait un marquage « Non fourni » absent du document ;
 *  - W16 : le décompte des retenues appliquait la vétusté sans la nommer ;
 *  - W17 : le congé du bailleur imprimait, dans la lettre notifiée au locataire, des consignes destinées au bailleur ;
 *  - W18 : l'attestation de fin de bail ne datait pas la fin du contrat (« clôturé dans le dossier ») ;
 *  - W19 : la case « Contrat » des documents du dossier ne donnait que la référence interne ;
 *  - W20 : le bordereau des clés faisait signer le locataire comme « Partie concernée » ;
 *  - W21 : le titre du congé du bailleur laissait « BAILLEUR » seul sur une seconde ligne ;
 *  - W22 : « À défaut d'acceptation dans ce délai » renvoyait à un délai non nommé ; « article 15 II » puis « 15-II ».
 * Chaque cas échouait avant le correctif.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { construireRecuDepot } from "@/lib/documents/modeles/recu-depot";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { assemblerDecompteRestitution } from "@/lib/documents/modeles/decompte-restitution";
import { assemblerCongeBailleur } from "@/lib/documents/modeles/conge-bailleur";
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
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[  ]/g, " ").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1");
const bandeaux = (html: string) => [...html.matchAll(/<div class="bandeau">([^<]*)<\/div>/g)].map((m) => m[1]);
/** Le style local qui garde un titre long sur une ligne (celui des documents du catalogue). */
const TITRE_COMPACT = /<style>[^<]*h1\{font-size:19pt;letter-spacing:\.2em\}/;

let ctx: ContexteBail;
const organisation = { id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: null, email_contact: null };
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "termine";
  ctx.bail.date_debut = "2023-09-01";
  ctx.bailleurs = [{ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile" }), quote_part: 100 }];
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("W09, W10 — état des lieux : une grille coupée garde le nom de sa pièce", () => {
  const donnees = (sur: Partial<DonneesEdl>): DonneesEdl => ({
    type: "sortie", reference: "EDL-1", dateEdl: "2026-10-07", dateEdlEntree: "2023-09-01", signeLe: null, personnesPresentes: "Les parties",
    detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true, adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon",
    observations: "Néant",
    lignes: [
      { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null },
      { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "mauvais", commentaire: "Trous de chevilles derrière le canapé" },
      { categorie: "piece", piece: "Salle d'eau", libelle: "Sols", etat: "bon", commentaire: null },
    ],
    compteurs: [{ type: "Eau froide", numero: "EF-1", releve: 402.8 }, { type: "Électricité (Base)", numero: "EL-1", releve: 26315 }],
    cles: [{ libelle: "Porte d'entrée", nombre: 2, reference: null }], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "contact@example.invalid", telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(), ...sur,
  });
  const entetes = (html: string) => [...html.matchAll(/<thead><tr><th>([^<]*)<\/th>/g)].map((m) => m[1]);

  it.each(["entree", "sortie"] as const)("%s : l'en-tête du tableau, répété en haut de chaque page, nomme la pièce", (type) => {
    const html = construireEdl(donnees({ type })).html;
    expect(entetes(html)).toEqual(expect.arrayContaining(["Élément — Séjour", "Élément — Salle d'eau"]));
    // Le titre de la pièce reste au-dessus de sa grille.
    expect(html).toMatch(/<h3>Séjour<\/h3>\s*<table><thead><tr><th>Élément — Séjour<\/th>/);
  });

  it("le tableau des compteurs ne se coupe pas entre deux pages (une ligne seule en haut de la suivante)", () => {
    const html = construireEdl(donnees({})).html;
    expect(html).toMatch(/<div style="break-inside:avoid-page;page-break-inside:avoid"><table><thead><tr><th>Fluide<\/th>/);
  });
});

describe("W11, W14 — reçu de dépôt de garantie", () => {
  const recu = () => construireRecuDepot({
    reference: "DEPOT-1", dateVersement: "2024-06-28", montantVerse: 890, moyen: "Chèque", versant: null, depotConvenu: 890, totalEncaisse: 890,
    plafond: "un mois de loyer hors charges", meuble: false, bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul",
    logementAdresse: "1 rue", referenceBail: "BAIL-42669582", dateBail: "2024-07-01",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: null, telephone: null, ville: "Lyon" }, f: new Fusion(),
  });

  it("W11 : la date du bail est dite « prise d'effet », jamais « du » (le reçu du 28/06 ne renvoie plus à un bail « du 01/07 »)", () => {
    const texte = texteDe(recu().html);
    // Lot 53 (reprise du lot 51, W19) : « prise d’effet » s'écrit avec l'apostrophe typographique, comme dans la case
    // « Contrat » des documents du dossier du bail (l'apostrophe droite était l'une des deux graphies de la même mention).
    expect(texte).toContain("Réf. BAIL-42669582 — prise d’effet le 01/07/2024");
    expect(texte).not.toMatch(/BAIL-42669582 du /);
  });

  it("W14 : le titre long tient sur une ligne (réglage compact des documents du catalogue)", () => {
    expect(recu().html).toMatch(TITRE_COMPACT);
  });
});

describe("W12, W13 — acte de cautionnement", () => {
  beforeEach(() => {
    ctx.bail.etat = "actif";
    ctx.garants = [{ ...personne({ id: "c622a941-garant", nom: "Fictif", prenom: "Gérard" }), garant_de: null }] as never;
  });
  const acte = async (options: Record<string, string>) =>
    succes(await assemblerCautionnement(base({}), "org", "b1", { garant: "c622a941-garant", sans_garantie_cumulee: "oui", montant_max: "1200,50", ...options }));

  it("W12 : l'acte solidaire et l'acte simple du même garant ont deux numéros ; le même acte garde le sien", async () => {
    const solidaire = await acte({ forme: "solidaire" });
    const simple = await acte({ forme: "simple" });
    expect(solidaire.document.reference).toMatch(/^CAUT-C622A941-[0-9A-F]{8}$/);
    expect(simple.document.reference).not.toBe(solidaire.document.reference);
    expect((await acte({ forme: "solidaire", montant_max: "1 200,50" })).document.reference).toBe(solidaire.document.reference);
    expect((await acte({ forme: "solidaire", montant_max: "1500" })).document.reference).not.toBe(solidaire.document.reference);
    expect(solidaire.nomFichier).not.toBe(simple.nomFichier);
    expect(solidaire.titreGed).toBe("Cautionnement solidaire — Fictif Gérard");
    expect(simple.titreGed).toBe("Cautionnement simple — Fictif Gérard");
  });

  it("W13 : le « € » du plafond reste attaché au nombre dans le texte (espace insécable) ; la mention transmise ne change pas", async () => {
    const r = await acte({ forme: "solidaire" });
    expect(r.document.html).toContain("<b>1 200,50 €</b> (mille deux cents euros et cinquante centimes)");
    expect(r.document.html).toContain("mille deux cents euros et cinquante centimes (1 200,50 €)");
    expect(r.document.html).not.toMatch(/200,50 €/);
    expect(r.mentionCaution).toContain("(1 200,50 €)");
  });
});

describe("W15 — décompte de restitution : la légende « Non fourni » seulement si une retenue le porte", () => {
  const tables = (retenues: Ligne[]) => ({
    organizations: [organisation],
    restitutions: [{ id: "r1", date_remise_cles: "2026-10-08", delai_mois: 2, depot: 890, impayes: 0, trop_percu: 0, statut: "finalise", solde: 472.13, date_emission: "2026-10-20", sans_edl_entree: false }],
    retenues,
  });
  const retenue = { libelle: "Remise en peinture du séjour", cout: 520, duree_vie_ans: 9, age_ans: 3, montant_retenu: 346.67, sans_justificatif: false, justificatif_document: "d1" };
  const LEGENDE = "Une retenue marquée « Non fourni » n'est appuyée d'aucune pièce.";

  it("toutes les retenues justifiées : pas de légende d'un marquage absent", async () => {
    const texte = texteDe(succes(await assemblerDecompteRestitution(base(tables([retenue])), "org", "b1")).document.html);
    expect(texte).toContain("Déposé — sur demande");
    expect(texte).toContain("sont tenus à la disposition du locataire sur demande.");
    expect(texte).not.toContain(LEGENDE);
  });

  // Décision du 24/11/2026 (Q49) : ce test affirmait « une retenue sans pièce : le marquage et sa légende s'impriment ».
  // Les deux décomptes sont alignés : une retenue sans pièce BLOQUE le décompte de restitution (une ligne « À renseigner »
  // par retenue) ; « Non fourni » et sa légende ne s'impriment plus.
  it("une retenue sans pièce : le décompte est bloqué, ni marquage « Non fourni » ni légende", async () => {
    const doc = succes(await assemblerDecompteRestitution(base(tables([retenue, { ...retenue, libelle: "Flexible", sans_justificatif: true, justificatif_document: null }])), "org", "b1")).document;
    expect(doc.manquants).toEqual(["justificatif de la retenue « Flexible » (un devis suffit)"]);
    const texte = texteDe(doc.html);
    expect(texte).not.toContain("Non fourni");
    expect(texte).not.toContain(LEGENDE);
  });
});

describe("W16, W19 — décompte des retenues", () => {
  const tables = (retenues: Ligne[]) => ({ organizations: [organisation], restitutions: [{ id: "r1", statut: "finalise" }], retenues });
  const avecVetuste = { libelle: "Remise en peinture du séjour", cout: 520, duree_vie_ans: 9, age_ans: 3, montant_retenu: 346.67, justificatif_document: "d1" };
  const REGLE = "Vétusté : la retenue tient compte de l’âge de l’élément ; elle est égale au coût × (durée de vie − âge) / durée de vie.";

  it("W16 : la décote appliquée est nommée et sa règle écrite", async () => {
    expect(texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document.html)).toContain(REGLE);
  });

  it("W16 : sans âge ni durée de vie, aucune décote : seule la phrase du « — » s'imprime", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([{ ...avecVetuste, duree_vie_ans: null, age_ans: null, montant_retenu: 520 }])), "org", "b1")).document.html);
    expect(texte).not.toContain(REGLE);
    expect(texte).toContain("aucune décote de vétusté n’est appliquée");
  });

  it("W19 : la case « Contrat » donne la date de prise d'effet avec la référence", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document.html);
    expect(texte).toContain("Contrat Réf. BAIL-B1 — prise d’effet le 01/09/2023");
  });

  it("W19 : une date de début non saisie ne bloque pas le document ; la case garde la référence seule", async () => {
    ctx.bail.date_debut = null as never;
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document;
    expect(doc.manquants).toEqual([]);
    expect(texteDe(doc.html)).toContain("Contrat Réf. BAIL-B1 ");
  });
});

describe("W18, W19 — attestation de fin de bail et accusé de réception du congé", () => {
  const conge = { date_premiere_presentation: "2026-09-08", date_effet: "2026-10-08", preavis_mois: 1, par: "locataire" };

  it("W18 : l'attestation date la fin du contrat et la sortie réelle enregistrée, sans « clôturé dans le dossier »", async () => {
    ctx.bail.date_fin = "2026-10-08";
    const texte = texteDe(succes(await assemblerComplementBail("attestation_fin_bail", base({ organizations: [organisation], conges: [conge], baux: [{ date_sortie_reelle: "2026-09-30" }] }), "org", "b1")).document.html);
    expect(texte).toContain("Le contrat a pris fin le 08/10/2026. Sortie des lieux enregistrée le 30/09/2026.");
    expect(texte).not.toContain("clôturé dans le dossier");
    expect(texte).toContain("Contrat Réf. BAIL-B1 — prise d’effet le 01/09/2023");
  });

  it("W18 : sans sortie réelle enregistrée (bail clôturé avant la décision D34), la phrase de sortie est omise, rien n'est exigé", async () => {
    ctx.bail.date_fin = "2026-10-08";
    const doc = succes(await assemblerComplementBail("attestation_fin_bail", base({ organizations: [organisation], conges: [conge], baux: [{ date_sortie_reelle: null }] }), "org", "b1")).document;
    expect(doc.manquants).toEqual([]);
    expect(texteDe(doc.html)).toContain("Le contrat a pris fin le 08/10/2026. Cette attestation");
  });

  it("W19 : l'accusé de réception du congé désigne aussi le contrat par sa date de prise d'effet", async () => {
    ctx.bail.etat = "preavis";
    const texte = texteDe(succes(await assemblerComplementBail("accuse_conge", base({ organizations: [organisation], conges: [conge], etats_des_lieux: [] }), "org", "b1")).document.html);
    expect(texte).toContain("Contrat Réf. BAIL-B1 — prise d’effet le 01/09/2023");
  });
});

describe("W20 — bordereau des clés : le locataire signe en cette qualité", () => {
  const tables = () => ({
    organizations: [organisation],
    etats_des_lieux: [{ id: "edl1", bail_id: "b1", type: "sortie", etat: "signe", date_edl: "2026-10-07" }],
    edl_cles: [{ libelle: "Porte d'entrée", nombre: 3, reference: null }],
  });

  it("un locataire : « Le locataire » ; plusieurs : « Les locataires » (jamais « Partie concernée »)", async () => {
    expect(bandeaux(succes(await assemblerComplementGestion("restitution_cles", base(tables()), "org", "edl1")).document.html)).toEqual(["Le bailleur", "Le locataire"]);
    ctx.locataires = [...ctx.locataires, personne({ id: "p2", nom: "Fictive", prenom: "Inès" })];
    expect(bandeaux(succes(await assemblerComplementGestion("restitution_cles", base(tables()), "org", "edl1")).document.html)).toEqual(["Le bailleur", "Les locataires"]);
  });
});

describe("W17, W21, W22 — congé délivré par le bailleur", () => {
  const conge = async (options: Record<string, string>) => {
    ctx.bail.etat = "actif";
    ctx.bail.date_debut = "2024-07-01";
    const rpc = vi.fn(async () => ({ data: "2029-08-31", error: null }));
    return succes(await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", options)).document.html;
  };
  const MOTIFS: Record<string, string>[] = [
    { motif: "vente", prix_vente: "245000" },
    { motif: "reprise", beneficiaire_nom: "Fictif Paul", beneficiaire_lien: "fils", beneficiaire_adresse: "1 rue Neuve, 69003 Lyon", raisons_reprise: "Résidence principale." },
    { motif: "motif_legitime", motif_detail: "Impayés répétés." },
  ];

  it.each(MOTIFS)("W17 ($motif) : aucune consigne destinée au bailleur ni vocabulaire de l'application dans la lettre au locataire", async (options) => {
    const html = await conge(options);
    const texte = texteDe(html);
    expect(html).not.toContain('<p class="etiquette">Notification</p>');
    expect(texte).not.toMatch(/Gerimmo génère|ne le notifie jamais|fiche du bail|À notifier par/);
    // La lettre elle-même est inchangée : elle notifie le congé et en donne la date d'effet.
    expect(texte).toContain("Nous vous notifions par la présente congé du logement désigné ci-dessus");
  });

  it.each(MOTIFS)("W21 ($motif) : le titre « Congé délivré par le bailleur » tient sur une ligne", async (options) => {
    expect(await conge(options)).toMatch(TITRE_COMPACT);
  });

  it("W22 : le délai d'acceptation de l'offre est nommé ; l'article s'écrit « 15-II » partout", async () => {
    const texte = texteDe(await conge(MOTIFS[0]));
    expect(texte).toContain("À défaut d'acceptation pendant les deux premiers mois du délai de préavis, vous êtes déchu de plein droit");
    expect(texte).not.toContain("dans ce délai");
    expect(texte).not.toContain("15 II");
    expect(texte).toContain("(article 15-II).");
    ctx.bail.type = "nu";
    const refus = await assemblerCongeBailleur({ rpc: vi.fn(async () => ({ data: "2029-08-31", error: null })) } as unknown as SupabaseClient, "org", "b1", { motif: "vente" });
    expect(refus).toEqual({ erreur: "Congé pour vente d'un logement loué nu : indiquez le prix de vente proposé — le congé vaut offre de vente au locataire (article 15-II de la loi du 6 juillet 1989)." });
  });
});
