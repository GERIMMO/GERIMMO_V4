/**
 * Phase 3 de la mission palier 1, lot 37 — émetteur, interlocuteur et destinataire justes.
 *
 * Défauts relevés sur les PDF des dossiers fictifs (espaces de propriétaires qui gèrent eux-mêmes) :
 *  - C36, C56, C76 : bordereau des clés, rappel d'assurance et courriers de charges émis et signés au nom technique de l'espace
 *    (avec son téléphone), alors que les autres documents du bail le sont par ses détenteurs ;
 *  - C41, C52, C70, C71 : accusé de congé, avis d'échéance et relances renvoient le locataire à un « gestionnaire » qui n'existe pas ;
 *  - C16, C24 : cadre « Le bailleur / mandataire » chez un propriétaire sans mandataire ;
 *  - C58 : « votre espace locataire Gerimmo » pour un locataire qui n'en a pas ;
 *  - C90 : le compte rendu déclaré par l'artisan lui était adressé ;
 *  - S39 : les trois courriers de recouvrement ne portaient pas l'adresse postale du locataire.
 * Chaque cas « propriétaire » échouait avant le correctif ; chaque cas « agence » garde la formulation de l'agence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
// Le palier de relance n'est pas l'objet de ce lot : il est vérifié par ses propres tests (rappels-loyers).
vi.mock("@/lib/rappels-loyers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifierCourrierDuBail: vi.fn(async () => ({ precedente: "2026-10-12" })),
}));
import { adresseLogement, chargerContexteBail, interlocuteurLocataire, libelleSignataireBailleur, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { assemblerRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { assemblerAvisEcheance, construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/**
 * Une base simulée : chaque table rend toutes ses lignes (les filtres sont ignorés), `maybeSingle` la première. Une fonction
 * de `rpcs` rend sa valeur telle quelle (objet), les autres fonctions se lisent comme une table.
 */
function base(tables: Record<string, Ligne[]>, rpcs: Record<string, unknown> = {}): SupabaseClient {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = () => q;
    return q;
  };
  const rpc = (nom: string) => nom in rpcs
    ? { then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: rpcs[nom], error: null }).then(ok) }
    : requete(nom);
  return { from: requete, rpc } as unknown as SupabaseClient;
}

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
/** Le bloc expéditeur de l'en-tête (nom, adresse, contact). */
const enTeteDe = (html: string) => texteDe(html.split('<div class="cartouche-ref">')[0].split('<header class="entete">')[1] ?? "");
/** Le cadre de signature qui porte ce bandeau : son titre et son contenu. */
const cadre = (html: string, bandeau: string) => html.includes(`<div class="bandeau">${bandeau}</div>`);
type Espace = "proprietaire_direct" | "agence";

let ctx: ContexteBail;
/** L'espace qui génère : le parc d'une propriétaire qui gère elle-même, ou une agence (mêmes données de bail). */
function organisation(type: Espace): Ligne {
  return type === "agence"
    ? { id: "org", type, name: "Agence du Parc", address_line1: "5 place du Marché", postal_code: "69001", city: "Lyon", telephone: "04 72 00 00 00", email_contact: "agence@exemple.fr", relance_1_jours: 5, relance_2_jours: 15 }
    : { id: "org", type, name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: "04 00 00 00 00", email_contact: "parc@exemple.fr", relance_1_jours: 5, relance_2_jours: 15 };
}
function espace(type: Espace) {
  const o = organisation(type);
  ctx.organisation = { ...ctx.organisation, type, name: String(o.name), address_line1: String(o.address_line1), postal_code: String(o.postal_code), city: String(o.city), telephone: String(o.telephone), email_contact: String(o.email_contact) };
  return o;
}
const bailleuse = () => ({ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", telephone: "06 11 11 11 11", email: "claire@exemple.fr", address_line1: "3 rue du Domicile" }), quote_part: 100 });

beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  ctx.bailleurs = [bailleuse()];
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("les deux utilitaires partagés", () => {
  it("« gestionnaire » et « ou son mandataire » seulement dans une agence", () => {
    expect(interlocuteurLocataire("agence")).toBe("gestionnaire");
    expect(interlocuteurLocataire("proprietaire_direct")).toBe("bailleur");
    expect(interlocuteurLocataire(null)).toBe("bailleur");
    expect(libelleSignataireBailleur("agence")).toBe("Le bailleur ou son mandataire");
    expect(libelleSignataireBailleur("proprietaire_direct")).toBe("Le bailleur");
  });
});

describe("C36 — bordereau des clés : émis et signé par le bailleur, pas par le nom de l'espace", () => {
  const tables = (type: Espace) => ({
    organizations: [espace(type)],
    etats_des_lieux: [{ id: "edl1", bail_id: "b1", type: "entree", etat: "signe", date_edl: "2026-09-01" }],
    edl_cles: [{ libelle: "Porte d'entrée", nombre: 2, reference: null }],
  });
  it("propriétaire : en-tête et cadre « Le bailleur » au nom de la bailleresse, avec son téléphone", async () => {
    const html = succes(await assemblerComplementGestion("restitution_cles", base(tables("proprietaire_direct")), "org", "edl1")).document.html;
    expect(enTeteDe(html)).toContain("Moreau Claire");
    expect(enTeteDe(html)).toContain("3 rue du Domicile, 69001 Lyon");
    expect(enTeteDe(html)).toContain("06 11 11 11 11");
    expect(html).not.toContain("Parc de Claire Moreau");
    expect(html).not.toContain("04 00 00 00 00");
    expect(html).toContain('<div class="bandeau">Le bailleur</div><div class="zone"><span class="v">Moreau Claire</span>');
    expect(html).not.toMatch(/mandataire/);
  });
  it("agence : l'agence reste l'émettrice ; cadre « Le bailleur ou son mandataire »", async () => {
    const html = succes(await assemblerComplementGestion("restitution_cles", base(tables("agence")), "org", "edl1")).document.html;
    expect(enTeteDe(html)).toContain("Agence du Parc");
    expect(enTeteDe(html)).toContain("5 place du Marché, 69001 Lyon");
    expect(html).toContain('<div class="bandeau">Le bailleur ou son mandataire</div><div class="zone"><span class="v">Agence du Parc</span>');
  });
});

describe("C76 — courriers de charges : émis par le bailleur hors agence", () => {
  const tables = (type: Espace) => ({
    organizations: [espace(type)],
    regularisations_charges: [{ id: "reg", bail_id: "b1", annee: 2025, provisions: 600, charges_reelles: 550, ecart: 50, date_emission: "2026-03-01", note: "Eau : 300 €", justificatif_document: "doc" }],
  });
  it.each(["regularisation_charges", "decompte_charges", "consultation_charges"] as const)("%s", async (code) => {
    const options = { consultation: "Au bureau, sur rendez-vous", detail_depenses: "Eau : 300 €" };
    const proprietaire = succes(await assemblerComplementGestion(code, base(tables("proprietaire_direct")), "org", "reg", options)).document.html;
    expect(enTeteDe(proprietaire)).toContain("Moreau Claire");
    expect(proprietaire).not.toContain("Parc de Claire Moreau");
    expect(proprietaire).not.toContain("04 00 00 00 00");
    const agence = succes(await assemblerComplementGestion(code, base(tables("agence")), "org", "reg", options)).document.html;
    expect(enTeteDe(agence)).toContain("Agence du Parc");
    expect(enTeteDe(agence)).not.toContain("Moreau Claire");
  });
});

describe("C56, C58 — demande d'attestation d'assurance", () => {
  const tables = (type: Espace, compte: string | null) => ({
    documents: [{ id: "doc1", type: "attestation_assurance", expire_le: "2026-12-05" }],
    organizations: [organisation(type)],
    document_liens: [{ entite_id: "p1" }],
    persons: [{ id: "p1", nom: "Fictive", prenom: "Nadia", account_id: compte }],
    baux: [{ id: "b1", locataire_principal: "p1", lot: { id: "l1", nom: "Lot unique", etage: null, bien: { address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" } } }],
    detentions: [{ quote_part: 100, person: bailleuse() }],
  });
  it("C56 propriétaire : émise et signée par la bailleresse (nom, téléphone), pas par l'espace", async () => {
    const html = succes(await assemblerRappelAssurance(base(tables("proprietaire_direct", null)), "org", "doc1")).document.html;
    expect(enTeteDe(html)).toContain("Moreau Claire");
    expect(enTeteDe(html)).toContain("06 11 11 11 11");
    expect(html).toContain('<div class="sig-nom">Moreau Claire</div>');
    expect(html).not.toContain("Parc de Claire Moreau");
    expect(html).not.toContain("04 00 00 00 00");
  });
  it("C56 agence : l'agence reste l'émettrice et la signataire", async () => {
    const html = succes(await assemblerRappelAssurance(base(tables("agence", null)), "org", "doc1")).document.html;
    expect(enTeteDe(html)).toContain("Agence du Parc");
    expect(html).toContain('<div class="sig-nom">Agence du Parc</div>');
    expect(html).not.toContain("Moreau Claire");
  });
  it("C58 : sans compte, seulement l'adresse de dépôt", async () => {
    const texte = texteDe(succes(await assemblerRappelAssurance(base(tables("proprietaire_direct", null)), "org", "doc1")).document.html);
    expect(texte).not.toContain("espace locataire");
    expect(texte).toContain("explosion), à l'adresse suivante : parc@exemple.fr.");
  });
  it("C58 : un compte dont l'accès est suspendu, ou illisible, ne fait pas parler de l'espace", async () => {
    for (const statut of [{ role: "locataire", status: "inactive" }, null]) {
      const r = succes(await assemblerRappelAssurance(base(tables("proprietaire_direct", "compte-1"), { statut_acces_locataire: statut }), "org", "doc1"));
      expect(texteDe(r.document.html)).not.toContain("espace locataire");
    }
  });
  it("C58 : un locataire dont l'accès est actif est renvoyé à son espace", async () => {
    const r = succes(await assemblerRappelAssurance(base(tables("proprietaire_direct", "compte-1"), { statut_acces_locataire: { role: "locataire", status: "active" } }), "org", "doc1"));
    expect(texteDe(r.document.html)).toContain("directement depuis votre espace locataire Gerimmo ou à l'adresse suivante : parc@exemple.fr.");
  });
});

describe("C41, C52, C70, C71 — l'interlocuteur du locataire : « gestionnaire » seulement en agence", () => {
  const termes = [{ appel_id: "a1", periode: "2026-01-01", date_echeance: "2026-01-05", montant_du: 740, montant_couvert: 0 }];
  const tables = (type: Espace) => ({
    organizations: [espace(type)], restitutions: [], relances: [], etat_loyers_bail: termes, appels_loyer: [],
    conges: [{ date_premiere_presentation: "2026-10-01", date_effet: "2027-01-01", preavis_mois: 3, par: "locataire" }],
  });
  const cas = [
    ["relance_simple", "contactez votre bailleur afin d’examiner votre situation.", "contactez votre gestionnaire afin d’examiner votre situation."],
    ["seconde_relance", "prendre contact avec votre bailleur.", "prendre contact avec votre gestionnaire."],
    ["accuse_conge", "sont à organiser avec le bailleur.", "sont à organiser avec le gestionnaire."],
  ] as const;
  it.each(cas)("%s", async (code, proprietaire, agence) => {
    // Phase 3 (C40) : l'accusé de réception se prépare pendant le préavis qui suit le congé du locataire.
    if (code === "accuse_conge") ctx.bail.etat = "preavis";
    const p = texteDe(succes(await assemblerComplementBail(code, base(tables("proprietaire_direct")), "org", "b1")).document.html);
    expect(p).toContain(proprietaire);
    expect(p).not.toContain("gestionnaire");
    const a = texteDe(succes(await assemblerComplementBail(code, base(tables("agence")), "org", "b1")).document.html);
    expect(a).toContain(agence);
  });

  const avis = (typeOrganisation: string) => texteDe(construireAvisEcheance({
    reference: "AVIS-1", periode: "2026-12-01", dateEcheance: "2026-12-05", loyerHc: 650, charges: 90, montantDu: 740, prorata: false,
    bailleurNom: "Moreau Claire", locatairesNoms: "Leblanc Julie", logementAdresse: "12 rue des Lilas, 69003 Lyon", referenceBail: "BAIL-1",
    dateBail: "2026-09-01", exp: { nom: "Moreau Claire", adresse: null, email: "claire@exemple.fr", ville: "Lyon" }, typeOrganisation, f: new Fusion(),
  }).html);
  it("C52 avis d'échéance : « votre bailleur » chez un propriétaire, « votre gestionnaire » en agence", () => {
    expect(avis("proprietaire_direct")).toContain("rapprochez-vous sans attendre de votre bailleur : des solutions amiables existent");
    expect(avis("proprietaire_direct")).not.toContain("gestionnaire");
    expect(avis("agence")).toContain("rapprochez-vous sans attendre de votre gestionnaire : des solutions amiables existent");
  });
  it("C52 : l'avis assemblé lit le type de l'espace du bail", async () => {
    const db = base({ appels_loyer: [{ id: "a1", bail_id: "b1", periode: "2026-12-01", loyer_hc: 650, charges: 90, montant_du: 740, date_echeance: "2026-12-05", prorata: false }], etat_loyers_bail: [] });
    espace("proprietaire_direct");
    expect(texteDe(succes(await assemblerAvisEcheance(db, "org", "a1")).document.html)).toContain("de votre bailleur :");
    espace("agence");
    expect(texteDe(succes(await assemblerAvisEcheance(db, "org", "a1")).document.html)).toContain("de votre gestionnaire :");
  });
});

describe("C16, C24 — cadre de signature : « Le bailleur » hors agence, « Le bailleur ou son mandataire » en agence", () => {
  const tables = (type: Espace) => ({
    organizations: [espace(type)],
    inventaire_lignes: [{ piece: "Séjour", designation: "Table", quantite: 1, etat: "bon", observation: "RAS" }],
  });
  // Phase 3 (C22) : le sortant est désigné par l'identifiant d'un titulaire du bail (« p1 », Leblanc Julie), plus par un nom saisi.
  const options = { date_constat: "2026-09-01", sortant: "p1", entrant: "Martin Paul, 1 rue Neuve", date_effet: "2026-12-01", depot: "Conservé" };
  it.each(["inventaire_entree", "avenant_remplacement"] as const)("%s", async (code) => {
    ctx.lot.meuble = true;
    if (code === "avenant_remplacement") ctx.bail.type = "colocation";
    const p = succes(await assemblerComplementBail(code, base(tables("proprietaire_direct")), "org", "b1", options)).document.html;
    expect(cadre(p, "Le bailleur")).toBe(true);
    expect(p).not.toMatch(/mandataire/);
    const a = succes(await assemblerComplementBail(code, base(tables("agence")), "org", "b1", options)).document.html;
    expect(cadre(a, "Le bailleur ou son mandataire")).toBe(true);
    expect(a).not.toContain("Le bailleur / mandataire");
  });
  it("état des lieux : même règle", () => {
    const donnees = (typeOrganisation: string): DonneesEdl => ({
      type: "entree", reference: "EDL-1", dateEdl: "2026-09-01", signeLe: null, personnesPresentes: "Les parties",
      detecteurFumeePresent: true, detecteurFumeeEtat: "Fonctionnel", attestationAssuranceFournie: true, adresseRestitutionDepot: null,
      observations: "Néant", lignes: [], compteurs: [], cles: [], comparatif: [], retenues: [], bailleurNom: "Moreau Claire",
      locatairesNoms: "Leblanc Julie", logementAdresse: "12 rue des Lilas, 69003 Lyon", referenceBail: "BAIL-1",
      exp: { nom: "Moreau Claire", adresse: null, email: "claire@exemple.fr", ville: "Lyon" }, typeOrganisation, f: new Fusion(),
    });
    expect(cadre(construireEdl(donnees("proprietaire_direct")).html, "Le bailleur")).toBe(true);
    expect(construireEdl(donnees("proprietaire_direct")).html).not.toMatch(/mandataire/);
    expect(cadre(construireEdl(donnees("agence")).html, "Le bailleur ou son mandataire")).toBe(true);
  });
  it("documents de mandat (agence) : l'agence signe comme mandataire, plus « Bailleur / mandataire »", async () => {
    const db = base({
      organizations: [organisation("agence")],
      mandats: [{ id: "m1", person_id: "p9", etat: "actif", preavis_mois: 3 }],
      persons: [{ id: "p9", nom: "Moreau", prenom: "Claire" }],
      mandat_lignes: [], lots: [],
    });
    const html = succes(await assemblerComplementGestion("avenant_mandat", db, "org", "m1", { date_effet: "2026-12-01", modifications: "Taux d'honoraires porté à 7 %" })).document.html;
    expect(html).toContain('<div class="bandeau">Le mandataire</div><div class="zone"><span class="v">Agence du Parc</span>');
    expect(html).not.toContain("Bailleur / mandataire");
  });
});

describe("C90 — compte rendu d'intervention : adressé au donneur d'ordre, pas à l'artisan", () => {
  const tables = (type: Espace) => ({
    organizations: [organisation(type)],
    lots: [{ id: "lot", nom: "Studio meublé n° 7", bien_id: "bien", meuble: true }],
    biens: [{ id: "bien", address_line1: "5 quai des Essais", postal_code: "69007", city: "Lyon" }],
    incidents: [{ id: "incident", numero: "INC-2026-0002", lot_id: "lot", description: "Le radiateur ne chauffe plus.", piece: "Séjour", categorie: "chauffage_panne", etat: "en_cours" }],
    incident_interventions: [{ id: "intervention", incident_id: "incident", artisan_id: "artisan", nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-11-22", debut_prevu: "2026-11-26", fin_prevue: "2026-11-27" }],
    artisans: [{ id: "artisan", raison_sociale: "Plomberie Fictive", siret: "12345678901234", telephone: "0600000000", email: "a@x.fr" }],
    intervention_comptes_rendus: [{ travaux_realises: "Thermostat remplacé.", cause_reelle: "Usure.", montant_final_cents: 16170, nouvelle_intervention_necessaire: false, created_at: "2026-11-26" }],
    detentions: [{ quote_part: 100, person: bailleuse() }],
  });
  const destinataire = (html: string) => /<div class="etiquette">Destinataire<\/div><div><span class="v">([^<]*)<\/span>/.exec(html)?.[1];
  it("propriétaire : la bailleresse, détentrice du lot ; l'artisan reste nommé dans la mission", async () => {
    const html = succes(await assemblerComplementGestion("compte_rendu_intervention", base(tables("proprietaire_direct")), "org", "intervention")).document.html;
    expect(destinataire(html)).toBe("Moreau Claire");
    expect(texteDe(html)).toContain("Artisan : Plomberie Fictive ;");
  });
  it("agence : l'agence", async () => {
    const html = succes(await assemblerComplementGestion("compte_rendu_intervention", base(tables("agence")), "org", "intervention")).document.html;
    expect(destinataire(html)).toBe("Agence du Parc");
  });
  it("l'ordre d'intervention reste adressé à l'artisan", async () => {
    const t = tables("proprietaire_direct"); t.incident_interventions[0].statut = "planifiee";
    const html = succes(await assemblerComplementGestion("ordre_intervention", base(t), "org", "intervention", { acces: "Clé chez la gardienne." })).document.html;
    expect(destinataire(html)).toBe("Plomberie Fictive");
  });
});

describe("S39 — courriers de recouvrement : un bloc destinataire avec l'adresse postale du locataire", () => {
  const termes = [{ appel_id: "a1", periode: "2026-01-01", date_echeance: "2026-01-05", montant_du: 740, montant_couvert: 0 }];
  const tables = (edl: Ligne[] = []) => ({ organizations: [espace("proprietaire_direct")], restitutions: [], relances: [], etat_loyers_bail: termes, appels_loyer: [], etats_des_lieux: edl });
  const COURRIERS = ["relance_simple", "seconde_relance", "mise_en_demeure"] as const;
  /** Le contenu de la case « Locataire (destinataire) » (jusqu'à la case suivante). */
  const blocDestinataire = (html: string) => html.split('<div class="etiquette">Locataire (destinataire)</div>')[1]?.split('<div class="case">')[0];
  it.each(COURRIERS)("%s : tant que le locataire occupe les lieux, le logement loué", async (code) => {
    const html = succes(await assemblerComplementBail(code, base(tables()), "org", "b1", { delai: "8" })).document.html;
    const bloc = blocDestinataire(html);
    expect(bloc).toBeDefined();
    expect(texteDe(bloc!)).toContain("Leblanc Julie");
    expect(texteDe(bloc!)).toContain(adresseLogement(ctx.lot, ctx.bien));
  });
  it.each(COURRIERS)("%s : après la sortie, l'adresse laissée à l'état des lieux de sortie", async (code) => {
    ctx.bail.etat = "termine";
    const html = succes(await assemblerComplementBail(code, base(tables([{ etat: "signe", adresse_restitution_depot: "5 rue Nouvelle, 38000 Grenoble" }])), "org", "b1", { delai: "8" })).document.html;
    const bloc = texteDe(blocDestinataire(html)!);
    expect(bloc).toContain("5 rue Nouvelle, 38000 Grenoble");
    expect(bloc).not.toContain("12 rue des Lilas");
  });
  it("sorti (état des lieux de sortie signé, bail encore en préavis) : plus le logement", async () => {
    ctx.bail.etat = "preavis";
    const html = succes(await assemblerComplementBail("relance_simple", base(tables([{ etat: "signe", adresse_restitution_depot: "5 rue Nouvelle, 38000 Grenoble" }])), "org", "b1")).document.html;
    expect(texteDe(blocDestinataire(html)!)).toContain("5 rue Nouvelle, 38000 Grenoble");
  });
  it("sorti sans adresse connue : le nom seul, aucune adresse inventée ni réclamée", async () => {
    ctx.bail.etat = "termine";
    const r = succes(await assemblerComplementBail("mise_en_demeure", base(tables()), "org", "b1", { delai: "8" }));
    const bloc = blocDestinataire(r.document.html)!;
    expect(texteDe(bloc).trim()).toBe("Leblanc Julie");
    expect(r.document.manquants).toEqual([]);
  });
  it("les autres documents du bail gardent la case « Locataire »", async () => {
    const html = succes(await assemblerComplementBail("situation_dette", base(tables()), "org", "b1")).document.html;
    expect(html).toContain('<div class="etiquette">Locataire</div>');
    expect(html).not.toContain("Locataire (destinataire)");
  });
});
