/**
 * Phase 3 de la mission palier 1, lot 38 — les dossiers proposés selon l'état du bail, du terme ou de l'incident.
 *
 * Défauts relevés sur les PDF des dossiers fictifs : C06 (avenant sur un bail en brouillon), C19 (avenant de remplacement
 * sur un contrat commun jamais signé), C31 et C32 (congé du bailleur sur un bail terminé ou déjà en préavis), C40 (accusé de
 * réception du congé sur un bail terminé), C46 (acte de cautionnement sur un bail terminé), C49 (avis d'échéance d'un terme
 * déjà payé), S09 (inventaires proposés pour des baux que le modèle refuse), C82 (incident des parties communes : « Réessayez »
 * sans issue). Pour chaque modèle, la liste de choix ne propose que ce que l'assembleur accepte, et l'assembleur refuse un
 * identifiant forcé avec un message qui dit pourquoi. Chaque cas ci-dessous échouait avant le correctif.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, type ContexteBail } from "@/lib/documents/modeles/communs";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { chargerCiblesCatalogue, colonnesCibles, verifierCibleCatalogue } from "@/lib/documents/catalogue-cibles";
import { assemblerComplementBail, RefusDocument } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { assemblerAvenant } from "@/lib/documents/modeles/avenant";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { assemblerAvisEcheance, REFUS_TERME_NON_DU, REFUS_TERME_SOLDE } from "@/lib/documents/modeles/avis-echeance";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
type Appel = { table: string; ops: unknown[][] };
const modele = (id: string) => CATALOGUE_DOCUMENTS.find((m) => m.id === id)!;
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}

/**
 * Une base qui APPLIQUE les filtres (eq, in, is, not is null), y compris ceux d'une table liée (« conges.par ») : la ligne est
 * gardée quand l'objet lié, ou l'une des lignes liées, satisfait tous les filtres de cette table (« !inner »). Chaque requête
 * est consignée (table, opérations).
 */
function baseFiltrante(tables: Record<string, Ligne[]>, rpcs: Record<string, { data: unknown; error: unknown }> = {}) {
  const appels: Appel[] = [];
  const valeur = (l: Ligne, cle: string) => l[cle];
  const requete = (table: string) => {
    const appel: Appel = { table, ops: [] };
    appels.push(appel);
    const filtres: ((l: Ligne) => boolean)[] = [];
    const lies = new Map<string, ((l: Ligne) => boolean)[]>();
    const ajouter = (cle: string, test: (v: unknown) => boolean) => {
      const [lien, col] = cle.includes(".") ? cle.split(".") : [null, cle];
      if (!lien) filtres.push((l) => test(valeur(l, col)));
      else lies.set(lien, [...(lies.get(lien) ?? []), (l) => test(valeur(l, col))]);
    };
    let page: [number, number] | null = null;
    const resultat = () => {
      let lignes = (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      for (const [lien, tests] of lies) lignes = lignes.filter((l) => {
        const v = l[lien];
        const ok = (x: unknown) => x !== null && typeof x === "object" && tests.every((t) => t(x as Ligne));
        return Array.isArray(v) ? v.some(ok) : ok(v);
      });
      return page ? lignes.slice(page[0], page[1] + 1) : lignes;
    };
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: resultat(), error: null }).then(ok),
      maybeSingle: async () => ({ data: resultat()[0] ?? null, error: null }),
    };
    const op = (nom: string, f?: (...a: unknown[]) => void) => (q[nom] = (...a: unknown[]) => { appel.ops.push([nom, ...a]); f?.(...a); return q; });
    op("select"); op("order"); op("limit"); op("gte"); op("lt"); op("lte"); op("or");
    op("eq", (k, v) => ajouter(String(k), (x) => x === v));
    op("in", (k, v) => ajouter(String(k), (x) => (v as unknown[]).includes(x)));
    op("is", (k, v) => ajouter(String(k), (x) => (x ?? null) === v));
    op("not", (k, o, v) => ajouter(String(k), (x) => (x ?? null) !== v));
    op("range", (de, a) => { page = [Number(de), Number(a)]; });
    return q;
  };
  const rpc = (nom: string) => {
    appels.push({ table: nom, ops: [["rpc"]] });
    const r = rpcs[nom] ?? { data: tables[nom] ?? [], error: null };
    return { then: (ok: (x: unknown) => unknown) => Promise.resolve(r).then(ok) };
  };
  return { db: { from: requete, rpc } as unknown as SupabaseClient, appels };
}

const bail = (id: string, etat: string, sur: Ligne = {}): Ligne => ({ id, organization_id: "org", etat, type: "nu", chambre_id: null, lot_id: "lot", locataire_principal: "p", ...sur });
const ids = async (id: string, tables: Record<string, Ligne[]>) =>
  (await chargerCiblesCatalogue(baseFiltrante({ lots: [{ id: "lot", nom: "T2" }], persons: [{ id: "p", nom: "Fictif", prenom: "Paul" }], ...tables }).db, "org", modele(id))).choix.map((c) => c.id);

describe("la liste de choix ne propose que les baux que le modèle accepte", () => {
  const quatreEtats = [bail("brouillon", "brouillon"), bail("actif", "actif"), bail("preavis", "preavis"), bail("termine", "termine")];
  it("C06 avenant : un bail signé et en cours (actif ou en préavis), jamais un brouillon ni un bail terminé", async () => {
    expect(await ids("avenant", { baux: quatreEtats })).toEqual(["actif", "preavis"]);
  });
  it("C19 avenant de remplacement : le contrat commun d'une colocation en cours", async () => {
    const baux = [
      bail("commun-brouillon", "brouillon", { type: "colocation" }), bail("commun-actif", "actif", { type: "colocation" }),
      bail("commun-preavis", "preavis", { type: "colocation" }), bail("individuel-actif", "actif", { type: "colocation", chambre_id: "ch" }),
      bail("nu-actif", "actif"),
    ];
    expect(await ids("avenant_remplacement", { baux })).toEqual(["commun-actif"]);
  });
  it("C31, C32 congé du bailleur : un bail actif seulement", async () => {
    expect(await ids("conge_bailleur", { baux: quatreEtats })).toEqual(["actif"]);
  });
  it("C40 accusé de réception : un congé du locataire enregistré, bail en préavis (sortie pas faite)", async () => {
    const locataire = { par: "locataire", annule_le: null };
    const baux = [
      bail("preavis-locataire", "preavis", { conges: [locataire] }),
      bail("preavis-bailleur", "preavis", { conges: [{ par: "bailleur", annule_le: null }] }),
      bail("preavis-annule", "preavis", { conges: [{ par: "locataire", annule_le: "2026-11-01" }] }),
      bail("termine-locataire", "termine", { conges: [locataire] }),
      bail("actif", "actif", { conges: [] }),
    ];
    expect(await ids("accuse_conge", { baux })).toEqual(["preavis-locataire"]);
    expect(colonnesCibles(modele("accuse_conge"), "*")).toBe("*,conges!conges_bail_meme_org_fk!inner(par)");
  });
  it("C46 acte de cautionnement : bail en préparation ou actif, ni en préavis ni terminé", async () => {
    expect(await ids("cautionnement", { baux: quatreEtats })).toEqual(["brouillon", "actif"]);
  });
  it("S09 inventaires : un logement meublé ; à la sortie, après l'enregistrement du congé", async () => {
    const meuble = { lots: { meuble: true } }, nu = { lots: { meuble: false } };
    const baux = [
      bail("nu-brouillon", "brouillon", nu), bail("meuble-brouillon", "brouillon", { type: "meuble", ...meuble }),
      bail("meuble-preavis", "preavis", { type: "meuble", ...meuble }), bail("meuble-termine", "termine", { type: "meuble", ...meuble }),
      bail("coloc-meublee", "actif", { type: "colocation", ...meuble }), bail("coloc-nue", "actif", { type: "colocation", ...nu }),
    ];
    expect(await ids("inventaire_entree", { baux })).toEqual(["meuble-brouillon", "meuble-preavis", "meuble-termine", "coloc-meublee"]);
    expect(await ids("inventaire_sortie", { baux })).toEqual(["meuble-preavis", "meuble-termine"]);
    expect(colonnesCibles(modele("inventaire_sortie"), "id")).toBe("id,lots!baux_lot_meme_org_fk!inner(meuble)");
  });
  it("un identifiant forcé hors de la liste est refusé à la vérification, avec le même filtre", async () => {
    const { db, appels } = baseFiltrante({ baux: quatreEtats });
    await expect(verifierCibleCatalogue(db, "org", modele("conge_bailleur"), "termine")).rejects.toBeInstanceOf(RefusDocument);
    await expect(verifierCibleCatalogue(db, "org", modele("conge_bailleur"), "actif")).resolves.toBeUndefined();
    expect(appels[0].ops).toContainEqual(["eq", "etat", "actif"]);
  });
});

describe("C49 — avis d'échéance : seulement les termes restant à régler", () => {
  // Un terme soldé porte sa quittance (est_quittance) ; un paiement partiel, un reçu (est_quittance = false).
  const appel = (id: string): Ligne => ({ id, organization_id: "org", bail_id: "b", periode: "2026-03-01", date_echeance: "2026-03-05", montant_du: 760 });
  const tables = {
    appels_loyer: [appel("a-paye"), appel("a-impaye"), appel("a-partiel")],
    quittances: [{ organization_id: "org", appel_id: "a-paye", est_quittance: true }, { organization_id: "org", appel_id: "a-partiel", est_quittance: false }],
    baux: [{ id: "b", lot_id: "lot", locataire_principal: "p" }], lots: [{ id: "lot", nom: "T2" }], persons: [{ id: "p", nom: "Fictive", prenom: "Nadia" }],
  };
  it("la liste écarte le terme payé, garde l'impayé et le partiel", async () => {
    const { choix } = await chargerCiblesCatalogue(baseFiltrante(tables).db, "org", modele("avis_echeance"));
    expect(choix.map((c) => c.id)).toEqual(["a-impaye", "a-partiel"]);
  });
  it("la page suivante reste proposée même quand la page lue n'a que des termes payés", async () => {
    const appels = Array.from({ length: 51 }, (_, i) => appel(`a-${String(i).padStart(2, "0")}`));
    const quittances = appels.slice(0, 50).map((a) => ({ organization_id: "org", appel_id: a.id, est_quittance: true }));
    const r = await chargerCiblesCatalogue(baseFiltrante({ ...tables, appels_loyer: appels, quittances }).db, "org", modele("avis_echeance"));
    expect(r).toEqual({ choix: [], suite: true });
  });
  it("un terme payé forcé est refusé avec le motif ; un terme à régler passe", async () => {
    const { db } = baseFiltrante(tables);
    await expect(verifierCibleCatalogue(db, "org", modele("avis_echeance"), "a-paye")).rejects.toThrow(REFUS_TERME_SOLDE);
    await expect(verifierCibleCatalogue(db, "org", modele("avis_echeance"), "a-impaye")).resolves.toBeUndefined();
  });

  const avis = async (terme: Ligne | null, erreur: unknown = null) => {
    vi.mocked(chargerContexteBail).mockResolvedValue(Object.assign(contexte(), { bail: { ...contexte().bail, etat: "actif" } }));
    const { db } = baseFiltrante(
      { appels_loyer: [{ ...appel("a1"), loyer_hc: 700, charges: 60, prorata: false }] },
      { etat_loyers_bail: { data: terme ? [{ appel_id: "a1", periode: "2026-03-01", ...terme }] : [], error: erreur } },
    );
    return assemblerAvisEcheance(db, "org", "a1");
  };
  it("l'assembleur refuse un terme soldé, et un terme qui suit la fin du bail", async () => {
    expect(await avis({ montant_du: 760, montant_couvert: 760, statut: "paye" })).toEqual({ erreur: REFUS_TERME_SOLDE });
    expect(await avis({ montant_du: 0, montant_couvert: 0, statut: "non_du" })).toEqual({ erreur: REFUS_TERME_NON_DU });
    expect(REFUS_TERME_SOLDE).toContain("préparez la quittance de ce terme");
  });
  it("l'assembleur produit l'avis d'un terme impayé ou partiellement payé", async () => {
    expect(texteDe(succes(await avis({ montant_du: 760, montant_couvert: 0, statut: "impaye" })).document.html)).toContain("Le règlement est attendu à cette date.");
    expect("document" in (await avis({ montant_du: 760, montant_couvert: 400, statut: "partiel" }))).toBe(true);
  });
  it("sans la situation des paiements, l'avis n'est pas produit (il ne pourrait ni dire l'arriéré ni écarter un terme payé)", async () => {
    expect(await avis(null, { message: "indisponible" })).toEqual({ erreur: "La situation des paiements du bail n’a pas pu être lue. Réessayez avant de générer cet avis." });
  });
  it("la fiche du bail ne propose l'avis que pour un terme restant à régler", () => {
    const source = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8");
    expect(source).toMatch(/\{Number\(l\.montant_couvert\) < Number\(l\.montant_du\) && \(\s*<BoutonGenererDocument\s+orgId=\{orgId\}\s+code="avis_echeance"/);
  });
});

describe("les assembleurs refusent un bail dans un état que le document contredit", () => {
  let ctx: ContexteBail;
  beforeEach(() => {
    ctx = contexte();
    ctx.garants = [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }];
    vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  });
  const vide = baseFiltrante({}).db;

  it("C06 avenant : refusé sur un brouillon et sur un bail terminé, produit sur un bail actif ou en préavis", async () => {
    const options = { objet: "Ajout d'un emplacement de parking", modifications: "Le bail porte aussi sur le parking n° 4." };
    ctx.bail.etat = "brouillon";
    expect(await assemblerAvenant(vide, "org", "b1", options)).toEqual({ erreur: "L’avenant modifie un bail signé et en cours. Ce bail est encore en préparation : modifiez directement le contrat avant sa signature, ou activez d’abord la location s’il est déjà signé." });
    ctx.bail.etat = "termine";
    expect(await assemblerAvenant(vide, "org", "b1", options)).toEqual({ erreur: "Ce bail est terminé : il ne se modifie plus par avenant." });
    for (const etat of ["actif", "preavis"]) {
      ctx.bail.etat = etat;
      expect(texteDe(succes(await assemblerAvenant(vide, "org", "b1", options)).document.html)).toContain("Le présent avenant modifie le contrat de location conclu entre les parties");
    }
  });

  it("C19 avenant de remplacement : seulement sur un contrat commun actif", async () => {
    ctx.bail.type = "colocation";
    // Phase 3 (C22) : le sortant est désigné par l'identifiant d'un titulaire du bail (« p1 », Leblanc Julie), plus par un nom saisi.
    const options = { sortant: "p1", entrant: "Martin Paul, 1 rue Neuve", date_effet: "2026-12-01", depot: "Conservé" };
    const refus = {
      brouillon: "Le contrat commun est encore en préparation : modifiez les colocataires directement dans le brouillon avant sa signature, ou activez d’abord la location s’il est déjà signé.",
      preavis: "Un congé est enregistré pour ce contrat commun (préavis en cours) : le remplacement d’un colocataire se prépare tant que la location est en cours.",
      termine: "Ce contrat commun est terminé : aucun remplacement de colocataire n’est possible.",
    };
    for (const [etat, erreur] of Object.entries(refus)) {
      ctx.bail.etat = etat;
      expect(await assemblerComplementBail("avenant_remplacement", vide, "org", "b1", options)).toEqual({ erreur });
    }
    ctx.bail.etat = "actif";
    expect(texteDe(succes(await assemblerComplementBail("avenant_remplacement", vide, "org", "b1", options)).document.html)).toContain("Les autres clauses du contrat commun restent inchangées.");
  });

  it("C46 acte de cautionnement : refusé en préavis et sur un bail terminé, produit en préparation ou en cours", async () => {
    const options = { garant: "g1", montant_max: "15000", sans_garantie_cumulee: "oui" };
    ctx.bail.etat = "termine";
    expect(await assemblerCautionnement(vide, "org", "b1", options)).toEqual({ erreur: "Ce bail est terminé : un acte de cautionnement ne s’établit plus pour ce contrat." });
    ctx.bail.etat = "preavis";
    expect(await assemblerCautionnement(vide, "org", "b1", options)).toEqual({ erreur: "Un congé est enregistré pour ce bail (préavis en cours) : un nouvel acte de cautionnement n’a plus lieu d’être." });
    for (const etat of ["brouillon", "actif"]) {
      ctx.bail.etat = etat;
      expect("document" in (await assemblerCautionnement(vide, "org", "b1", options))).toBe(true);
    }
  });

  describe("C40 accusé de réception du congé", () => {
    const congeLocataire = { organization_id: "org", bail_id: "b1", date_premiere_presentation: "2026-11-13", date_effet: "2026-12-13", preavis_mois: 1, par: "locataire", annule_le: null };
    const accuse = (tables: Record<string, Ligne[]>) => assemblerComplementBail("accuse_conge", baseFiltrante({ organizations: [{ id: "org" }], ...tables }).db, "org", "b1");
    it("produit pendant le préavis qui suit le congé du locataire, avant l'état des lieux de sortie", async () => {
      ctx.bail.etat = "preavis";
      expect(texteDe(succes(await accuse({ conges: [congeLocataire] })).document.html)).toContain("sont à organiser avec le bailleur.");
    });
    it("refusé sur un bail terminé, sans congé, sur un congé du bailleur, après l'état des lieux de sortie signé", async () => {
      ctx.bail.etat = "termine";
      expect(await accuse({ conges: [congeLocataire] })).toEqual({ erreur: "Ce bail est terminé : la sortie du locataire est faite, l’accusé de réception du congé n’a plus lieu d’être." });
      ctx.bail.etat = "actif";
      expect(await accuse({ conges: [] })).toEqual({ erreur: "Aucun congé en cours n’est enregistré pour ce contrat." });
      ctx.bail.etat = "preavis";
      expect(await accuse({ conges: [{ ...congeLocataire, par: "bailleur" }] })).toEqual({ erreur: "Le congé enregistré a été donné par le bailleur : l’accusé de réception concerne un congé reçu du locataire." });
      expect(await accuse({ conges: [congeLocataire], etats_des_lieux: [{ id: "edl", organization_id: "org", bail_id: "b1", type: "sortie", etat: "signe" }] }))
        .toEqual({ erreur: "L’état des lieux de sortie est signé : la sortie du locataire est faite, l’accusé de réception du congé n’a plus lieu d’être." });
      // Un état des lieux de sortie en préparation ne fait pas la sortie.
      expect("document" in (await accuse({ conges: [congeLocataire], etats_des_lieux: [{ id: "edl", organization_id: "org", bail_id: "b1", type: "sortie", etat: "brouillon" }] }))).toBe(true);
    });
  });

  it("S09 inventaire de sortie : le refus existant reste celui d'avant le congé", async () => {
    ctx.lot.meuble = true;
    ctx.bail.etat = "brouillon";
    expect(await assemblerComplementBail("inventaire_sortie", vide, "org", "b1")).toEqual({ erreur: "Préparez l’inventaire de sortie après l’enregistrement du congé." });
  });

  it("C46 : la fiche du bail ne propose l'acte de cautionnement qu'en préparation ou pendant la location", () => {
    const source = readFileSync("src/app/agence/[orgId]/baux/[bailId]/page.tsx", "utf8");
    expect(source).toContain('{garantsDuBail.length > 0 && (bail.etat === "brouillon" || bail.etat === "actif") && (');
  });
});

describe("C82 — incident des parties communes (sans lot)", () => {
  const organisation = (type: string) => ({ id: "org", type, name: type === "agence" ? "Agence du Parc" : "Parc de Claire Moreau", city: "Lyon" });
  const incident = { id: "inc", organization_id: "org", numero: "INC-2026-0003", lot_id: null, bien_id: "bien", description: "Infiltration au plafond de la cage d'escalier", etat: "clos", clos_le: "2026-11-20", cloture_motif: "transmis_syndic", cloture_commentaire: "Transmis au syndic." };
  const bien = { id: "bien", organization_id: "org", nom: "Résidence des Essais", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" };
  const tables = (type = "proprietaire_direct"): Record<string, Ligne[]> => ({
    organizations: [organisation(type)], incidents: [incident], biens: [bien],
    incident_devis: [{ organization_id: "org", incident_id: "inc", artisan_id: "art", description: "Reprise de l'étanchéité", montant_ttc_cents: 120000, valide_jusqu_au: "2026-12-31", statut: "depose" }],
    artisans: [{ id: "art", raison_sociale: "Toitures Essai", siret: "12345678901234", telephone: "0600000000", email: "toit@exemple.fr" }],
    incident_interventions: [{ id: "int", organization_id: "org", incident_id: "inc", artisan_id: "art", nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-11-10" }],
    intervention_comptes_rendus: [{ organization_id: "org", intervention_id: "int", travaux_realises: "Étanchéité reprise", cause_reelle: "Joint usé", montant_final_cents: 120000, nouvelle_intervention_necessaire: false, created_at: "2026-11-15" }],
    lots: [{ id: "l1", bien_id: "bien" }, { id: "l2", bien_id: "bien" }, { id: "ailleurs", bien_id: "autre" }],
    detentions: [
      { lot_id: "l1", date_fin: null, quote_part: 100, person: personne({ id: "prop", nom: "Moreau", prenom: "Claire" }) },
      { lot_id: "l2", date_fin: null, quote_part: 100, person: personne({ id: "prop", nom: "Moreau", prenom: "Claire" }) },
      { lot_id: "ailleurs", date_fin: null, quote_part: 100, person: personne({ id: "autre", nom: "Autre", prenom: "Personne" }) },
    ],
  });
  const lieu = "Résidence des Essais · Parties communes · 8 avenue des Essais · 69003 · Lyon";

  it.each(["recap_incident", "comparatif_devis"] as const)("%s : produit, avec l'immeuble et « Parties communes », sans lire de lot", async (code) => {
    const { db, appels } = baseFiltrante(tables());
    const html = succes(await assemblerComplementGestion(code, db, "org", "inc")).document.html;
    expect(html).toContain(`<div class="etiquette">Lieu</div><div>${lieu}</div>`);
    expect(texteDe(html)).not.toContain("Logement");
    expect(appels.some((a) => a.table === "lots")).toBe(false);
    expect(appels.flatMap((a) => a.ops).some((o) => o[0] === "eq" && o[2] === "")).toBe(false);
  });
  it("le récapitulatif garde ses pièces : décision, clôture", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("recap_incident", baseFiltrante(tables()).db, "org", "inc")).document.html);
    expect(texte).toContain("Incident INC-2026-0003");
    expect(texte).toContain("Clôturé le 20/11/2026. Transmis au syndic.");
  });
  it("ordre d'intervention : produit pour les parties communes", async () => {
    const t = tables();
    (t.incident_interventions[0] as Ligne).statut = "planifiee";
    const r = await assemblerComplementGestion("ordre_intervention", baseFiltrante(t).db, "org", "int", { acces: "Clé chez le gardien" });
    expect(texteDe(succes(r).document.html)).toContain(lieu);
  });
  it("compte rendu hors agence : adressé aux détenteurs des logements de l'immeuble, chacun une fois", async () => {
    const { db, appels } = baseFiltrante(tables());
    const texte = texteDe(succes(await assemblerComplementGestion("compte_rendu_intervention", db, "org", "int")).document.html);
    const html = succes(await assemblerComplementGestion("compte_rendu_intervention", baseFiltrante(tables()).db, "org", "int")).document.html;
    expect(html).toMatch(/<div class="etiquette">Destinataire<\/div><div>(?:<[^>]+>)*Moreau Claire</);
    expect(texte).not.toContain("Autre Personne");
    expect(appels.flatMap((a) => a.ops).some((o) => o[0] === "eq" && o[2] === "")).toBe(false);
  });
  it("un incident sans lot ni immeuble est refusé avec un motif, jamais « Réessayez »", async () => {
    const t = tables();
    t.incidents = [{ ...incident, bien_id: null }];
    const r = await assemblerComplementGestion("recap_incident", baseFiltrante(t).db, "org", "inc");
    expect(r).toEqual({ erreur: "Ce signalement n’indique ni logement ni immeuble : précisez le lieu de l’incident avant de générer ce document." });
  });
  it("un incident d'un logement garde le lot et son adresse (« Logement »)", async () => {
    const t = tables();
    t.incidents = [{ ...incident, lot_id: "l1" }];
    t.lots = [{ id: "l1", organization_id: "org", nom: "T2", bien_id: "bien" }];
    const html = succes(await assemblerComplementGestion("recap_incident", baseFiltrante(t).db, "org", "inc")).document.html;
    // Phase 3, lot 42 (C88) : le logement s'écrit comme dans les documents du bail (adresseLogement), étage et porte compris
    // quand ils sont enregistrés ; il n'en donnait que le nom et l'adresse de l'immeuble, séparés par des points.
    expect(html).toContain('<div class="etiquette">Logement</div><div>8 avenue des Essais, 69003 Lyon, T2</div>');
    expect(texteDe(html)).not.toContain("Parties communes");
  });
});
