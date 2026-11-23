/**
 * Phase 3 de la mission palier 1, lot 41 — dépôt de garantie, états des lieux, clés.
 *
 * Défauts relevés sur les PDF des dossiers fictifs (famille « dépôt et sortie ») :
 *  - C35 : le décompte des retenues disait les justificatifs « joints au décompte de restitution », qui les dit seulement tenus
 *    à la disposition du locataire ;
 *  - C37 : un âge ou une durée de vie laissés vides (l'écran de restitution le permet : coût retenu en intégralité) rendaient le
 *    décompte des retenues « incomplet » ;
 *  - C42 : le bordereau de remise des clés était daté du jour de génération, pas du jour de la remise ;
 *  - S20 : une clé sans référence (facultative à la saisie) rendait le bordereau impossible ;
 *  - S21 : un état des lieux enregistré ou signé dans Gerimmo après coup portait « Fait à …, le » du jour d'enregistrement ;
 *  - S20 (reprise, même cause) : un compteur sans numéro (facultatif à la saisie) rendait l'état des lieux impossible une fois signé.
 *  - S20, lot 45 (T17, même cause) : l'index relevé et le nombre de clés, facultatifs à la saisie et figés à la signature, restaient
 *    exigés : un état des lieux SIGNÉ sans eux ne pouvait jamais donner de PDF (ni son bordereau des clés).
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
import { assemblerEdl, construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/**
 * Une base simulée : chaque table rend toutes ses lignes (les filtres sont ignorés), `maybeSingle` la première. Les tables de
 * `enEchec` rendent une erreur de lecture (`{ data: null, error }`), comme PostgREST quand une requête échoue.
 */
function base(tables: Record<string, Ligne[]>, enEchec: string[] = []): SupabaseClient {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const reponse = enEchec.includes(table) ? { data: null, error: { message: "lecture impossible" } } : { data: lignes, error: null };
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve(reponse).then(ok),
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
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1");
/** Les lignes d'un tableau (en-tête compris), cellules séparées par « | », espaces insécables ramenées à des espaces. */
const lignesDe = (html: string) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/[\u00a0\u202f]/g, " ").trim()).join("|"));

let ctx: ContexteBail;
const organisation = { id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: null, email_contact: null };
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "termine";
  ctx.bailleurs = [{ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile" }), quote_part: 100 }];
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  // Le jour de génération est postérieur à tout : une date de génération imprimée à la place de la date de l'acte se verrait.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("C35, C37 — décompte des retenues", () => {
  const tables = (retenues: Ligne[]) => ({
    organizations: [organisation],
    restitutions: [{ id: "r1", statut: "finalise" }],
    retenues,
  });
  const avecVetuste = { libelle: "Plan de travail", cout: 260, duree_vie_ans: 10, age_ans: 2.5, montant_retenu: 195, justificatif_document: "d2" };
  const sansVetuste = { libelle: "Remise en peinture du séjour", cout: 520, duree_vie_ans: null, age_ans: null, montant_retenu: 520, justificatif_document: "d1" };

  it("C37 : âge et durée de vie vides s'impriment « — » (coût intégral) sans rendre le décompte incomplet", async () => {
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([sansVetuste, avecVetuste])), "org", "b1")).document;
    expect(doc.manquants).toEqual([]);
    const lignes = lignesDe(doc.html);
    expect(lignes).toContain("Remise en peinture du séjour|520,00 €|—|—|520,00 €");
    // Une valeur saisie s'imprime au format français.
    expect(lignes).toContain("Plan de travail|260,00 €|2,5|10|195,00 €");
    expect(texteDe(doc.html)).toContain("« — » : âge ou durée de vie non renseigné ; aucune décote de vétusté n’est appliquée, le coût est retenu en intégralité.");
  });

  it("C37 : la mention du « — » n'apparaît que s'il y en a un", async () => {
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document;
    expect(texteDe(doc.html)).not.toContain("« — »");
  });

  it("C35 : les justificatifs sont tenus à la disposition du locataire, comme le dit le décompte de restitution — rien n'est « joint »", async () => {
    const texte = texteDe(succes(await assemblerComplementBail("decompte_retenues", base(tables([avecVetuste])), "org", "b1")).document.html);
    expect(texte).toContain("Les justificatifs déposés (devis, facture, constat comparé des états des lieux) sont tenus à la disposition du locataire sur demande.");
    expect(texte).not.toMatch(/joint/);
  });

  it("une retenue sans justificatif déposé reste signalée, avec le mot de l'écran (« déposer »)", async () => {
    const doc = succes(await assemblerComplementBail("decompte_retenues", base(tables([{ ...avecVetuste, justificatif_document: null }])), "org", "b1")).document;
    expect(doc.manquants).toEqual(["justificatifs de retenues à déposer"]);
  });
});

describe("C42, S20 — bordereau de remise des clés", () => {
  const tables = (cles: Ligne[], edl: Ligne = {}) => ({
    organizations: [organisation],
    etats_des_lieux: [{ id: "edl1", bail_id: "b1", type: "entree", etat: "signe", date_edl: "2023-09-01", ...edl }],
    edl_cles: cles,
  });
  const cles = [
    { libelle: "Porte d'entrée", nombre: 3, reference: "Clé sécurisée n° 4521-A" },
    { libelle: "Boîte aux lettres", nombre: 1, reference: null },
  ];

  it("C42 : daté du jour de la remise (l'état des lieux), en en-tête comme au « Fait à », jamais du jour de génération", async () => {
    const html = succes(await assemblerComplementGestion("restitution_cles", base(tables(cles)), "org", "edl1")).document.html;
    const texte = texteDe(html);
    expect(texte).toContain("Date du constat : 01/09/2023.");
    expect(texte).toMatch(/Fait à Lyon, le 01\/09\/2023\./);
    expect(texte).toContain("Établi le 01/09/2023");
    expect(texte).not.toContain("23/11/2026");
  });

  it("C42 : à la sortie, daté de la restitution", async () => {
    const html = succes(await assemblerComplementGestion("restitution_cles", base(tables(cles, { type: "sortie", date_edl: "2026-10-07" })), "org", "edl1")).document.html;
    expect(texteDe(html)).toMatch(/Fait à Lyon, le 07\/10\/2026\./);
  });

  it("S20 : une clé sans référence s'imprime « — » et ne bloque pas le bordereau", async () => {
    const doc = succes(await assemblerComplementGestion("restitution_cles", base(tables(cles)), "org", "edl1")).document;
    expect(doc.manquants).toEqual([]);
    expect(lignesDe(doc.html)).toContain("Boîte aux lettres|1|—");
  });

  // Lot 45 (T17) : ce cas figeait le blocage sur un état des lieux SIGNÉ (etat « signe » ci-dessus), dont les clés ne se
  // complètent plus : le bordereau ne pouvait jamais être établi. Décision prudente : exigé avant la signature seulement.
  it("un nombre de clés non compté reste exigé tant que l'état des lieux n'est pas signé (comme dans l'état des lieux)", async () => {
    const doc = succes(await assemblerComplementGestion("restitution_cles", base(tables([{ libelle: "Cave", nombre: null, reference: "Cave n° 4" }], { etat: "brouillon" })), "org", "edl1")).document;
    expect(doc.manquants).toEqual(["Nombre"]);
  });

  it("T17 : état des lieux signé (figé), un nombre non saisi s'imprime « non compté » et ne bloque plus le bordereau", async () => {
    const doc = succes(await assemblerComplementGestion("restitution_cles", base(tables([{ libelle: "Cave", nombre: null, reference: "Cave n° 4" }, { libelle: "Porte d'entrée", nombre: 0, reference: null }])), "org", "edl1")).document;
    expect(doc.manquants).toEqual([]);
    expect(lignesDe(doc.html)).toContain("Cave|non compté|Cave n° 4");
    // Un nombre saisi, même 0, s'imprime tel quel : « non compté » ne remplace que l'absence de saisie.
    expect(lignesDe(doc.html)).toContain("Porte d'entrée|0|—");
  });

  // Reprise du lot 45 (T17, contre-relecture) : sans aucune clé, un état des lieux SIGNÉ recevait « Renseignez les clés dans l'état
  // des lieux », consigne impossible (signé, il refuse tout ajout de clé). Le refus dit ce qui est ; avant la signature, la consigne
  // reste celle-ci, qui se suit.
  it("T17 (reprise) : état des lieux signé sans aucune clé, le refus dit ce qui est au lieu d'une consigne impossible", async () => {
    const r = await assemblerComplementGestion("restitution_cles", base(tables([])), "org", "edl1");
    expect(r).toEqual({ erreur: "Aucune clé n’a été enregistrée dans cet état des lieux avant sa signature. Un état des lieux signé ne se modifie plus : le bordereau, qui reprend ses clés, ne peut pas être préparé." });
    expect(await assemblerComplementGestion("restitution_cles", base(tables([], { etat: "brouillon" })), "org", "edl1"))
      .toEqual({ erreur: "Renseignez les clés dans l’état des lieux avant de préparer le bordereau." });
  });

  it("une lecture des clés en échec refuse le bordereau (jamais une liste vide prise pour « aucune clé »)", async () => {
    const r = await assemblerComplementGestion("restitution_cles", base(tables([{ libelle: "Cave", nombre: 1, reference: null }]), ["edl_cles"]), "org", "edl1");
    expect(r).toEqual({ erreur: "Les données du dossier n’ont pas pu être chargées. Réessayez avant de générer ce document." });
  });
});

describe("S21 — « Fait à …, le » d'un état des lieux : la date du constat", () => {
  const donnees = (sur: Partial<DonneesEdl>): DonneesEdl => ({
    type: "entree", reference: "EDL-1", dateEdl: "2023-09-01", signeLe: null, personnesPresentes: "Les parties",
    detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true, adresseRestitutionDepot: null,
    observations: "Néant", lignes: [], compteurs: [], cles: [], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: null, telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(), ...sur,
  });

  it("enregistré et signé dans Gerimmo le 23/11/2026, l'état des lieux du 01/09/2023 reste daté du 01/09/2023", () => {
    const texte = texteDe(construireEdl(donnees({ signeLe: "2026-11-23T09:30:00+00:00" })).html);
    expect(texte).toContain("Fait à Lyon, le 01/09/2023, en autant d'exemplaires que de parties.");
    expect(texte).not.toContain("23/11/2026");
  });

  it("de même pour la sortie", () => {
    const texte = texteDe(construireEdl(donnees({ type: "sortie", dateEdl: "2026-10-07", dateEdlEntree: "2023-09-01", signeLe: "2026-11-23T09:30:00+00:00", adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon" })).html);
    expect(texte).toContain("Fait à Lyon, le 07/10/2026, en autant d'exemplaires que de parties.");
  });

  it("sans date de constat, la date de signature sert encore", () => {
    const texte = texteDe(construireEdl(donnees({ dateEdl: null, signeLe: "2026-10-08T09:30:00+00:00" })).html);
    expect(texte).toContain("Fait à Lyon, le 08/10/2026");
  });
});

// Reprise du lot 41 (même cause que S20, relevée par la revue) : le numéro d'un compteur est facultatif à la saisie
// (ajouterCompteur : vide → null ; champ sans « required »), et ne peut plus être complété une fois l'état des lieux signé
// (ajout et retrait refusés, enregistrer_annexes_edl ne touche que l'index). L'exiger rendait le PDF d'un état des lieux
// signé impossible pour toujours. Comme la référence d'une clé, il s'imprime « — ».
describe("S20 (reprise) — état des lieux : numéro de compteur facultatif", () => {
  const donnees = (sur: Partial<DonneesEdl>): DonneesEdl => ({
    type: "entree", reference: "EDL-1", dateEdl: "2023-09-01", dateEdlEntree: "2023-09-01", signeLe: "2023-09-01T08:30:00+00:00",
    personnesPresentes: "Les parties", detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true,
    adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon", observations: "Néant",
    lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "bon", commentaire: null }],
    compteurs: [], cles: [{ libelle: "Porte d'entrée", nombre: 2, reference: null }], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "contact@example.invalid", telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(), ...sur,
  });

  it.each(["entree", "sortie"] as const)("%s : un compteur sans numéro s'imprime « — » et ne rend pas l'état des lieux incomplet", (type) => {
    const doc = construireEdl(donnees({
      type,
      compteurs: [{ type: "Électricité", numero: null, releve: 100 }, { type: "Eau froide", numero: "EF-12", releve: "42.5" }],
    }));
    expect(doc.manquants).toEqual([]);
    const lignes = lignesDe(doc.html);
    expect(lignes).toContain("Électricité|—|100");
    expect(lignes).toContain("Eau froide|EF-12|42,5");
  });

  // Lot 45 (T17) : ce cas affirmait le blocage pour un état des lieux SIGNÉ (donnees() porte signeLe) : c'était l'impasse
  // relevée par la contre-relecture (S20). L'index reste exigé AVANT la signature ; signé, il ne se complète plus (voir
  // « T17 » ci-dessous) et s'imprime « non relevé ».
  it("l'index relevé, lui, reste exigé avant la signature : c'est le relevé que les parties constatent", () => {
    const doc = construireEdl(donnees({ signeLe: null, compteurs: [{ type: "Gaz", numero: null, releve: null }] }));
    expect(doc.manquants).toEqual(["index"]);
  });
});

// Lot 45 (T17, décision prudente et réversible) : l'index relevé et le nombre de clés sont facultatifs à la saisie (ajouterCompteur,
// lireDecimalFacultatif ; aucun champ « required »), figés une fois l'état des lieux signé (enregistrer_annexes_edl et le
// déclencheur refusent), et signer_edl ne les contrôle pas. Exigés par le PDF, ils rendaient un état des lieux signé sans eux
// impossible à imprimer, pour toujours. Avant la signature : toujours exigés (« À renseigner »). Après : « non relevé »,
// « non compté ». Aucune règle de signature n'est ajoutée.
describe("T17 — état des lieux signé : index et nombre de clés non saisis n'empêchent plus le PDF", () => {
  const donnees = (sur: Partial<DonneesEdl>): DonneesEdl => ({
    type: "entree", reference: "EDL-1", dateEdl: "2023-09-01", signeLe: "2023-09-01T08:30:00+00:00",
    personnesPresentes: "Les parties", detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true,
    adresseRestitutionDepot: "5 rue Neuve, 69003 Lyon", observations: "Néant",
    lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "bon", commentaire: null }],
    compteurs: [{ type: "Gaz", numero: "G-1", releve: null }, { type: "Eau froide", numero: "EF-12", releve: "42.5" }],
    cles: [{ libelle: "Porte d'entrée", nombre: null, reference: "Clé n° 4521" }, { libelle: "Cave", nombre: 1, reference: null }], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "contact@example.invalid", telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(), ...sur,
  });

  it.each(["entree", "sortie"] as const)("%s, avant la signature : l'index et le nombre de clés restent « À renseigner »", (type) => {
    const doc = construireEdl(donnees({ type, signeLe: null }));
    expect(doc.manquants).toEqual(["index", "nombre rendu"]);
    expect(texteDe(doc.html)).not.toMatch(/non relevé|non compté/);
  });

  it.each(["entree", "sortie"] as const)("%s, signé (figé) : « non relevé » et « non compté », le PDF n'est plus bloqué", (type) => {
    const doc = construireEdl(donnees({ type, fige: true }));
    expect(doc.manquants).toEqual([]);
    const lignes = lignesDe(doc.html);
    expect(lignes).toContain("Gaz|G-1|non relevé");
    expect(lignes).toContain("Eau froide|EF-12|42,5");
    expect(lignes).toContain("Porte d'entrée|Clé n° 4521|non compté");
    expect(lignes).toContain("Cave|—|1");
  });

  it("signé sans aucun compteur ni aucune clé enregistrés : la rubrique le dit au lieu de bloquer ; avant la signature, elle reste exigée", () => {
    const fige = construireEdl(donnees({ fige: true, compteurs: [], cles: [] }));
    expect(fige.manquants).toEqual([]);
    expect(texteDe(fige.html)).toContain("Relevés de compteurs : non relevés.");
    expect(texteDe(fige.html)).toContain("Clés et moyens d'accès : non comptés.");
    expect(construireEdl(donnees({ signeLe: null, compteurs: [], cles: [] })).manquants).toEqual(["relevés de compteurs", "clés et moyens d'accès"]);
  });

  it("l'assemblage lit l'état de l'état des lieux : figé seulement s'il est signé", async () => {
    const tables = (etat: string) => ({
      organizations: [organisation],
      etats_des_lieux: [{ id: "edl1", bail_id: "b1", type: "entree", etat, date_edl: "2023-09-01", signe_le: etat === "signe" ? "2023-09-01T08:30:00+00:00" : null,
        personnes_presentes: "Les parties", detecteur_fumee_present: true, detecteur_fumee_etat: "bon", attestation_assurance_fournie: true, adresse_restitution_depot: null, observations: "Néant" }],
      edl_lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "bon", commentaire: null, photo_document_id: null }],
      edl_compteurs: [{ type: "Gaz", numero: "G-1", releve: null }],
      edl_cles: [{ libelle: "Porte d'entrée", nombre: null, reference: null }],
    });
    expect(succes(await assemblerEdl(base(tables("brouillon")), "org", "edl1")).document.manquants).toEqual(["index", "nombre rendu"]);
    const signe = succes(await assemblerEdl(base(tables("signe")), "org", "edl1")).document;
    expect(signe.manquants).toEqual([]);
    expect(lignesDe(signe.html)).toContain("Gaz|G-1|non relevé");
  });

  // Reprise du lot 45 (T17, contre-relecture) : une lecture en échec donnait une liste vide ; signé, l'état des lieux imprimait
  // alors « non relevés » / « non comptés » alors que des relevés et des clés sont enregistrés. Le document est refusé.
  it.each(["edl_compteurs", "edl_cles", "edl_lignes", "edl_compteurs et edl_cles"])("T17 (reprise) : lecture en échec (%s), le document est refusé au lieu d'affirmer « non relevés » / « non comptés »", async (tablesEnEchec) => {
    const enEchec = tablesEnEchec.split(" et ");
    const tables = (etat: string) => ({
      organizations: [organisation],
      etats_des_lieux: [{ id: "edl1", bail_id: "b1", type: "entree", etat, date_edl: "2023-09-01", signe_le: etat === "signe" ? "2023-09-01T08:30:00+00:00" : null,
        personnes_presentes: "Les parties", detecteur_fumee_present: true, detecteur_fumee_etat: "bon", attestation_assurance_fournie: true, adresse_restitution_depot: null, observations: "Néant" }],
      edl_lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "bon", commentaire: null, photo_document_id: null }],
      edl_compteurs: [{ type: "Gaz", numero: "G-1", releve: 1234 }],
      edl_cles: [{ libelle: "Porte d'entrée", nombre: 2, reference: null }],
    });
    for (const etat of ["signe", "brouillon"]) {
      expect(await assemblerEdl(base(tables(etat), enEchec), "org", "edl1")).toEqual({ erreur: "Les données du dossier n’ont pas pu être chargées. Réessayez avant de générer ce document." });
    }
    // Sans échec, le même état des lieux signé imprime ce qui est enregistré.
    const texte = texteDe(succes(await assemblerEdl(base(tables("signe")), "org", "edl1")).document.html);
    expect(texte).not.toMatch(/non relevés|non comptés/);
  });
});
