/**
 * Phase 3 de la mission palier 1, lot 46 (second tour) — catalogue proposé, émetteur et liens « À renseigner ».
 *
 *  - T18 (C56) : la demande d'attestation d'assurance d'un colocataire PARTI (date de départ passée) le traitait encore comme
 *    locataire du bail (émise par la bailleresse, avec le logement) ; sa fiche, elle, ne le compte plus ;
 *  - T19 : les liens « À renseigner » de l'adresse et de la commune de l'émetteur se déduisaient des liens du document et de son
 *    modèle, pas de l'en-tête imprimé (parties communes : profil de l'espace au lieu des détenteurs ; lot sans détenteur :
 *    fiche du propriétaire au lieu du profil de l'espace) ;
 *  - T20 : les règles appliquées après lecture (motifsDeRefus) s'appliquaient à la seule page de 50 déjà lue ; une page pouvait
 *    dire « Aucun dossier compatible » alors que des dossiers compatibles suivaient ;
 *  - T21 : des dossiers étaient proposés puis refusés par l'assembleur pour l'état du dossier (courriers de recouvrement hors
 *    palier, sans dette, après le décompte de départ ou sur un brouillon ; acte de cautionnement sans garant).
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  signatureOrganisation: vi.fn(async () => null),
}));
vi.mock("@/lib/rappels-loyers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifierCourrierDuBail: vi.fn(),
}));
import { verifierCourrierDuBail } from "@/lib/rappels-loyers";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { chargerCiblesCatalogue, verifierCibleCatalogue } from "@/lib/documents/catalogue-cibles";
import { RefusDocument, REFUS_AUCUNE_DETTE, REFUS_PLAN_SANS_TRANCHE, REFUS_SOLDE_DANS_DECOMPTE, REFUS_INVENTAIRE_NON_MEUBLE } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { expediteur } from "@/lib/documents/modeles/communs";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { Fusion } from "@/lib/documents/gabarit";
import { assemblerQuittanceDelivree, manquantsQuittance } from "@/lib/quittance-conforme";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
type Appel = { table: string; ops: unknown[][] };
const modele = (id: string) => CATALOGUE_DOCUMENTS.find((m) => m.id === id)!;
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const enTeteDe = (html: string) => texteDe(html.split('<div class="cartouche-ref">')[0].split('<header class="entete">')[1] ?? "");
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}

/**
 * Une base qui APPLIQUE les filtres (eq, in, is, not, gte, or « a.is.null,a.gte.x »), y compris ceux d'une table liée
 * (« bail_personnes.role ») et l'effet « !inner » d'une table liée déclarée dans la sélection ; la pagination (range) ; les
 * appels de fonction (rpc) selon leurs arguments. Chaque requête est consignée.
 */
function base(tables: Record<string, Ligne[]>, rpcs: Record<string, (args: Ligne) => unknown> = {}) {
  const appels: Appel[] = [];
  const requete = (table: string) => {
    const appel: Appel = { table, ops: [] };
    appels.push(appel);
    const filtres: ((l: Ligne) => boolean)[] = [];
    const lies = new Map<string, ((l: Ligne) => boolean)[]>();
    const internes: string[] = [];
    let page: [number, number] | null = null;
    let limite: number | null = null;
    const ajouter = (cle: string, test: (v: unknown) => boolean) => {
      const [lien, col] = cle.includes(".") ? cle.split(".") : [null, cle];
      if (!lien) filtres.push((l) => test(l[col]));
      else lies.set(lien, [...(lies.get(lien) ?? []), (l) => test(l[col])]);
    };
    const resultat = () => {
      let lignes = (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      for (const lien of internes) lignes = lignes.filter((l) => { const v = l[lien]; return Array.isArray(v) ? v.length > 0 : v !== null && typeof v === "object"; });
      for (const [lien, tests] of lies) lignes = lignes.filter((l) => {
        const v = l[lien];
        const ok = (x: unknown) => x !== null && typeof x === "object" && tests.every((t) => t(x as Ligne));
        return Array.isArray(v) ? v.some(ok) : ok(v);
      });
      if (page) lignes = lignes.slice(page[0], page[1] + 1);
      return limite === null ? lignes : lignes.slice(0, limite);
    };
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: resultat(), error: null }).then(ok),
      maybeSingle: async () => ({ data: resultat()[0] ?? null, error: null }),
    };
    const op = (nom: string, f?: (...a: unknown[]) => void) => (q[nom] = (...a: unknown[]) => { appel.ops.push([nom, ...a]); f?.(...a); return q; });
    op("select", (s) => { for (const m of String(s).matchAll(/(\w+)(?:![\w]+)*!inner\(/g)) internes.push(m[1]); });
    op("order");
    op("limit", (n) => { limite = Number(n); });
    op("eq", (k, v) => ajouter(String(k), (x) => x === v));
    op("in", (k, v) => ajouter(String(k), (x) => (v as unknown[]).includes(x)));
    op("is", (k, v) => ajouter(String(k), (x) => (x ?? null) === v));
    op("gte", (k, v) => ajouter(String(k), (x) => x != null && String(x) >= String(v)));
    op("not", (k, o, v) => ajouter(String(k), o === "in" ? (x) => !String(v).slice(1, -1).split(",").includes(String(x)) : (x) => (x ?? null) !== v));
    // « a.is.null,a.gte.2026-11-23 » : une des conditions suffit.
    op("or", (expr) => {
      const conditions = String(expr).split(",").map((c) => {
        const [col, operateur, ...reste] = c.split(".");
        const valeur = reste.join(".");
        return (l: Ligne) => operateur === "is" && valeur === "null" ? l[col] == null : operateur === "gte" ? l[col] != null && String(l[col]) >= valeur : false;
      });
      filtres.push((l) => conditions.some((c) => c(l)));
    });
    op("range", (de, a) => { page = [Number(de), Number(a)]; });
    return q;
  };
  const rpc = (nom: string, args: Ligne) => {
    appels.push({ table: nom, ops: [["rpc", args]] });
    const data = rpcs[nom] ? rpcs[nom](args) : tables[nom] ?? [];
    return { then: (ok: (x: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok) };
  };
  return { db: { from: requete, rpc } as unknown as SupabaseClient, appels };
}

const bail = (id: string, etat: string, sur: Ligne = {}): Ligne => ({ id, organization_id: "org", etat, type: "nu", chambre_id: null, lot_id: "lot", locataire_principal: "p", ...sur });
const commun = { lots: [{ id: "lot", nom: "T2" }], persons: [{ id: "p", nom: "Fictif", prenom: "Paul" }] };
const ids = async (id: string, tables: Record<string, Ligne[]>, rpcs: Record<string, (args: Ligne) => unknown> = {}, debut = 0) =>
  (await chargerCiblesCatalogue(base({ ...commun, ...tables }, rpcs).db, "org", modele(id), debut)).choix.map((c) => c.id);

const ESPACE = { id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: "04 00 00 00 00", email_contact: "parc@exemple.fr" };
const bailleuse = (sur: Ligne = {}) => ({ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", telephone: "06 11 11 11 11", email: "claire@exemple.fr", address_line1: "3 rue du Domicile" }), ...sur });

describe("T18 (C56) — demande d'attestation d'assurance : un colocataire parti n'est plus locataire du bail", () => {
  const tables = (dateDepart: string | null): Record<string, Ligne[]> => ({
    documents: [{ id: "doc1", organization_id: "org", type: "attestation_assurance", expire_le: "2026-12-05" }],
    organizations: [ESPACE],
    document_liens: [{ document_id: "doc1", entite: "personne", entite_id: "coloc" }],
    persons: [{ id: "coloc", nom: "Fictif", prenom: "Bruno", account_id: null }],
    baux: [{ id: "b1", organization_id: "org", etat: "actif", locataire_principal: "principal", chambre: null, lot: { id: "l1", nom: "T4 en colocation", etage: "2", bien: { address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" } } }],
    bail_personnes: [{ organization_id: "org", bail_id: "b1", person_id: "coloc", role: "colocataire", date_depart: dateDepart }],
    detentions: [{ lot_id: "l1", date_fin: null, quote_part: 100, person: bailleuse() }],
  });
  it("parti (départ passé) : plus d'en-tête de la bailleresse, ni de logement, ni de lien au bail", async () => {
    const { db, appels } = base(tables("2025-06-30"));
    const r = succes(await assemblerRappelAssurance(db, "org", "doc1"));
    expect(enTeteDe(r.document.html)).toContain("Parc de Claire Moreau");
    expect(enTeteDe(r.document.html)).not.toContain("Moreau Claire");
    expect(texteDe(r.document.html)).not.toContain("8 avenue des Essais");
    expect(r.document.manquants).toContain("adresse complète, étage, porte");
    expect(r.liens).toEqual([{ entite: "personne", entiteId: "coloc" }]);
    // Le même filtre que la fiche de la personne : départ vide ou à venir (jour de Paris).
    const lecture = appels.find((a) => a.table === "bail_personnes")!;
    expect(lecture.ops).toContainEqual(["or", expect.stringMatching(/^date_depart\.is\.null,date_depart\.gte\.\d{4}-\d{2}-\d{2}$/)]);
  });
  it.each([null, "2099-01-31"])("présent (départ %s) : le bail est retrouvé, émis par la bailleresse", async (depart) => {
    const r = succes(await assemblerRappelAssurance(base(tables(depart)).db, "org", "doc1"));
    expect(enTeteDe(r.document.html)).toContain("Moreau Claire");
    expect(texteDe(r.document.html)).toContain("8 avenue des Essais, 69003 Lyon, T4 en colocation, étage 2");
    expect(r.liens).toEqual([{ entite: "personne", entiteId: "coloc" }, { entite: "bail", entiteId: "b1" }]);
  });
});

describe("T19 — « À renseigner » suit l'en-tête effectivement imprimé", () => {
  const incidentTables = (sur: { incident?: Ligne; detentions?: Ligne[]; organisation?: Ligne } = {}): Record<string, Ligne[]> => ({
    organizations: [sur.organisation ?? ESPACE],
    biens: [{ id: "bien", organization_id: "org", nom: "Résidence des Essais", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" }],
    lots: [{ id: "l1", organization_id: "org", nom: "T2", bien_id: "bien", etage: null }],
    incidents: [{ id: "inc", organization_id: "org", numero: "INC-2026-0007", lot_id: null, bien_id: "bien", description: "Infiltration dans la cage d'escalier.", etat: "en_cours", ...sur.incident }],
    incident_interventions: [{ id: "int", organization_id: "org", incident_id: "inc", artisan_id: "art", devis_id: "dev", nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-11-10", debut_prevu: "2026-11-26", fin_prevue: "2026-11-27" }],
    incident_devis: [{ id: "dev", organization_id: "org", incident_id: "inc", artisan_id: "art", statut: "retenu", montant_ttc_cents: 120000, depose_le: "2026-11-05", description: "Reprise de l'étanchéité." }],
    artisans: [{ id: "art", raison_sociale: "Toitures Essai", siret: "12345678901234", telephone: "0600000000", email: "toit@exemple.fr" }],
    intervention_comptes_rendus: [{ organization_id: "org", intervention_id: "int", travaux_realises: "Étanchéité reprise.", cause_reelle: "Joint usé.", montant_final_cents: 120000, nouvelle_intervention_necessaire: false, created_at: "2026-11-27" }],
    detentions: sur.detentions ?? [{ lot_id: "l1", date_fin: null, quote_part: 100, person: bailleuse({ address_line1: null, postal_code: null, city: null }) }],
  });
  const liensDe = (r: Extract<Assemblage, { document: unknown }>, code: string) =>
    r.document.manquants.map((m) => lienPourManquant(m, "org", r.liens, code, "/espace", r.document.emetteur)?.href);

  it.each(["ordre_intervention", "compte_rendu_intervention"] as const)("%s des parties communes : bailleresse sans adresse → sa fiche, dans Personnes", async (code) => {
    const r = succes(await assemblerComplementGestion(code, base(incidentTables()).db, "org", "int", { acces: "Clé chez le gardien." }));
    expect(enTeteDe(r.document.html)).toContain("Moreau Claire");
    expect(r.liens).toEqual([]);
    expect(r.document.manquants).toEqual(["domicile ou siège social", "commune"]);
    expect(r.document.emetteur).toBe("detenteurs");
    expect(liensDe(r, code)).toEqual(["/espace/org/personnes", "/espace/org/personnes"]);
  });
  it("lot sans détenteur, espace sans adresse : l'en-tête est celui de l'espace → son profil", async () => {
    const t = incidentTables({ incident: { lot_id: "l1" }, detentions: [], organisation: { ...ESPACE, address_line1: null, postal_code: null, city: null } });
    const r = succes(await assemblerComplementGestion("ordre_intervention", base(t).db, "org", "int", { acces: "Clé chez le gardien." }));
    expect(enTeteDe(r.document.html)).toContain("Parc de Claire Moreau");
    expect(r.liens).toEqual([{ entite: "lot", entiteId: "l1" }]);
    expect(r.document.emetteur).toBe("espace");
    expect(liensDe(r, "ordre_intervention")).toEqual(["/espace/org/profil", "/espace/org/profil"]);
  });
  // Second passage du lot 46 : le contrat d'un lot sans détenteur prend l'en-tête de l'espace (complet ici) ; « domicile ou siège
  // social » manque dans la DÉSIGNATION DU BAILLEUR, au corps. Le lien suivait l'en-tête et menait au profil de l'espace, déjà
  // complet : le PDF restait bloqué. Le bailleur se désigne en ajoutant un détenteur au lot (son en-tête remplace alors celui
  // de l'espace), comme « nom et prénom(s), ou dénomination ».
  it("contrat d'un lot sans détenteur : le bailleur manque au corps → la détention, sur la fiche du lot", () => {
    const doc = construireBailNu(contexte({ bailleurs: [] }), { dpeClasse: "D", f: new Fusion() });
    const liens = [{ entite: "bail" as const, entiteId: "b1" }, { entite: "lot" as const, entiteId: "l1" }];
    expect(doc.emetteur).toBe("espace");
    expect(enTeteDe(doc.html)).not.toContain("domicile ou siège social");
    expect(doc.manquants).toEqual(expect.arrayContaining(["nom et prénom(s), ou dénomination", "domicile ou siège social"]));
    const detention = { href: "/espace/org/lots/l1?vers=detention", ecran: "fiche du lot" };
    expect(lienPourManquant("domicile ou siège social", "org", liens, "bail_nu", "/espace", doc.emetteur)).toEqual(detention);
    expect(lienPourManquant("nom et prénom(s), ou dénomination", "org", liens, "bail_nu", "/espace", doc.emetteur)).toEqual(detention);
    for (const modele of ["bail_meuble", "bail_colocation", "bail_individuel"]) {
      expect(lienPourManquant("domicile ou siège social", "org", liens, modele, "/espace", "espace")).toEqual(detention);
    }
    // L'acte de cautionnement n'a pas de lien vers le lot : repli sur la fiche du bail, comme « ou dénomination ».
    expect(lienPourManquant("domicile ou siège social", "org", [liens[0]], "cautionnement", "/espace", "espace")?.href).toBe("/espace/org/baux/b1");
    // Inchangé : avec des détenteurs, leur fiche ; un document qui n'imprime l'adresse qu'en en-tête, le profil de l'espace ;
    // la commune (« Fait à ») suit toujours l'en-tête ; en agence, le profil.
    expect(lienPourManquant("domicile ou siège social", "org", liens, "bail_nu", "/espace", "detenteurs")?.href).toBe("/espace/org/personnes");
    expect(lienPourManquant("domicile ou siège social", "org", liens, "quittance", "/espace", "espace")?.href).toBe("/espace/org/profil");
    expect(lienPourManquant("commune", "org", liens, "bail_nu", "/espace", "espace")?.href).toBe("/espace/org/profil");
    expect(lienPourManquant("domicile ou siège social", "org", liens, "bail_nu", "/agence", "espace")?.href).toBe("/agence/org/profil");
  });
  // Second passage du lot 46 : la quittance délivrée (page /quittance, celle que lit le locataire) imprime les bailleurs avec
  // l'adresse et la commune du PROFIL DE L'ESPACE (quittance_document). Sa liste « à renseigner » envoyait, faute d'origine
  // transmise, vers la fiche du propriétaire : la compléter ne débloquait pas la quittance.
  it("quittance délivrée, propriétaire direct, espace sans adresse : l'adresse et la commune mènent au profil de l'espace", () => {
    const base0 = quittanceDocumentComplete();
    const q = quittanceDocumentComplete({
      organisation: { ...base0.organisation, type: "proprietaire_direct", nom: "Parc de Claire Moreau", siret: null, carte_pro: null, adresse: null, code_postal: null, ville: null },
      bailleurs: [{ nom: "Moreau", prenom: "Claire" }],
    });
    const doc = assemblerQuittanceDelivree(q);
    expect(enTeteDe(doc.html)).toContain("Moreau Claire");
    expect(doc.emetteur).toBe("espace");
    const manquants = manquantsQuittance(doc);
    expect(manquants).toEqual(expect.arrayContaining(["domicile ou siège social", "commune"]));
    for (const m of ["domicile ou siège social", "commune"]) {
      expect(lienPourManquant(m, q.organization_id, [{ entite: "bail", entiteId: q.bail_id }], "quittance", "/espace", doc.emetteur)?.href).toBe("/espace/org-1/profil");
    }
    expect(readFileSync("src/app/quittance/[quittanceId]/page.tsx", "utf8")).toContain('"quittance", racineEspace(q.organisation.type === "proprietaire_direct"), document.emetteur)');
  });
  it("expediteur dit d'où vient l'en-tête ; sans origine transmise, la déduction d'avant reste le repli", () => {
    const organisation = { name: "Parc", type: "proprietaire_direct", address_line1: null, postal_code: null, city: null, telephone: null, email_contact: null };
    expect(expediteur({ organisation, bailleurs: [personne()] }).emetteur).toBe("detenteurs");
    expect(expediteur({ organisation, bailleurs: [] }).emetteur).toBe("espace");
    expect(expediteur({ organisation: { ...organisation, type: "agence" }, bailleurs: [personne()] }).emetteur).toBe("espace");
    const liensBail = [{ entite: "bail" as const, entiteId: "b1" }];
    expect(lienPourManquant("commune", "org", liensBail, "quittance", "/espace")?.href).toBe("/espace/org/personnes");
    expect(lienPourManquant("commune", "org", liensBail, "quittance", "/espace", "espace")?.href).toBe("/espace/org/profil");
    expect(lienPourManquant("domicile ou siège social", "org", [], "ordre_intervention", "/espace", "detenteurs")?.href).toBe("/espace/org/personnes");
    // En agence, l'espace émet toujours : son profil.
    expect(lienPourManquant("commune", "org", liensBail, "quittance", "/agence", "detenteurs")?.href).toBe("/agence/org/profil");
  });
  it("l'action de génération transmet l'origine de l'en-tête à l'écran, qui la passe au résolveur", () => {
    expect(readFileSync("src/app/actions/documents-generes.ts", "utf8")).toContain("...(assemblage.document.emetteur ? { emetteur: assemblage.document.emetteur } : {})");
    expect(readFileSync("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx", "utf8")).toContain("lienPourManquant(m,orgId,etat.liens??[],modeleId,racine,etat.emetteur)");
    expect(readFileSync("src/components/bouton-generer-document.tsx", "utf8")).toContain("lienPourManquant(m, orgId, affichage.liens ?? [], code, racine, affichage.emetteur)");
  });
});

describe("T20 — la page montre jusqu'à 50 dossiers compatibles, avec un curseur juste", () => {
  const numero = (i: number) => `b${String(i).padStart(3, "0")}`;
  it("inventaires : 60 baux nus puis 60 meublés → 50 meublés sur la première page, les 10 autres sur la suivante", async () => {
    const baux = Array.from({ length: 120 }, (_, i) => bail(numero(i), "actif", i < 60 ? { type: "nu", lots: { meuble: false } } : { type: "meuble", lots: { meuble: true } }));
    const { db } = base({ ...commun, baux });
    const premiere = await chargerCiblesCatalogue(db, "org", modele("inventaire_entree"));
    expect(premiere.choix.map((c) => c.id)).toEqual(Array.from({ length: 50 }, (_, i) => numero(60 + i)));
    expect(premiere).toMatchObject({ suite: true, suivant: 110 });
    const seconde = await chargerCiblesCatalogue(db, "org", modele("inventaire_entree"), premiere.suivant);
    expect(seconde.choix.map((c) => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => numero(110 + i)));
    expect(seconde.suite).toBe(false);
    expect(seconde.suivant).toBeUndefined();
  });
  it("page pleine et reste du paquet sans dossier compatible : pas de « Dossiers suivants » vers une page vide", async () => {
    // 10 nus, 50 meublés, puis 20 nus : la page se remplit dans le second paquet, dont le reste (déjà contrôlé) n'a rien de compatible.
    const baux = Array.from({ length: 80 }, (_, i) => bail(numero(i), "actif", i >= 10 && i < 60 ? { type: "meuble", lots: { meuble: true } } : { type: "nu", lots: { meuble: false } }));
    const r = await chargerCiblesCatalogue(base({ ...commun, baux }).db, "org", modele("inventaire_entree"));
    expect(r.choix.map((c) => c.id)).toEqual(Array.from({ length: 50 }, (_, i) => numero(10 + i)));
    expect(r.suite).toBe(false);
    // Le reste du paquet compte un dossier compatible : la suite reprend juste après la page.
    const avecUnDeplus = baux.map((b, i) => i === 70 ? { ...b, type: "meuble" } : b);
    expect(await chargerCiblesCatalogue(base({ ...commun, baux: avecUnDeplus }).db, "org", modele("inventaire_entree"))).toMatchObject({ suite: true, suivant: 60 });
  });
  it("au plus quatre paquets par affichage : un parc presque sans dossier compatible reprend où il s'est arrêté", async () => {
    const baux = Array.from({ length: 301 }, (_, i) => bail(numero(i), "actif", i < 300 ? { type: "nu", lots: { meuble: false } } : { type: "meuble", lots: { meuble: true } }));
    const { db, appels } = base({ ...commun, baux });
    const premiere = await chargerCiblesCatalogue(db, "org", modele("inventaire_entree"));
    expect(premiere).toEqual({ choix: [], suite: true, suivant: 200 });
    expect(appels.filter((a) => a.table === "baux").map((a) => a.ops.find((o) => o[0] === "range"))).toEqual([["range", 0, 50], ["range", 50, 100], ["range", 100, 150], ["range", 150, 200]]);
    const seconde = await chargerCiblesCatalogue(db, "org", modele("inventaire_entree"), 200);
    expect(seconde.choix.map((c) => c.id)).toEqual([numero(300)]);
    expect(seconde.suite).toBe(false);
  });
  it("modèle filtré en SQL seulement : 50 dossiers par page et la suite au rang 50, comme avant", async () => {
    const baux = Array.from({ length: 51 }, (_, i) => bail(numero(i), "actif"));
    const r = await chargerCiblesCatalogue(base({ ...commun, baux }).db, "org", modele("avenant"));
    expect(r.choix).toHaveLength(50);
    expect(r).toMatchObject({ suite: true, suivant: 50 });
  });
  it("l'écran garde le rang de départ des pages parcourues pour « Dossiers suivants » et « Dossiers précédents »", () => {
    const source = readFileSync("src/app/agence/[orgId]/documents/catalogue/page.tsx", "utf8");
    expect(source).toContain("cibles=await chargerCiblesCatalogue(supabase,orgId,choisi,page?departs[page-1]:0,bail||undefined);");
    expect(source).toContain('<Link href={lien(choisi.id,page-1,departs.slice(0,page-1))} className="underline">Dossiers précédents</Link>');
    expect(source).toContain('<Link href={lien(choisi.id,page+1,[...departs,cibles.suivant??(page+1)*DOSSIERS_PAR_PAGE])} className="underline">Dossiers suivants</Link>');
    expect(source).toContain('...(num?{page:String(num),de:de.join(",")}:{})');
  });
});

describe("T21 — le catalogue ne propose plus ce que l'assembleur refuse pour l'état du dossier", () => {
  beforeEach(() => {
    vi.mocked(verifierCourrierDuBail).mockReset();
  });
  // Les termes d'un bail (etat_loyers_bail) : « du » 760 €, échu le 05/01/2026, couvert selon le bail.
  const termes = (couvert: Record<string, number>) => ({
    etat_loyers_bail: (args: Ligne) => [{ appel_id: `a-${String(args.p_bail)}`, periode: "2026-01-01", date_echeance: "2026-01-05", montant_du: 760, montant_couvert: couvert[String(args.p_bail)] ?? 0 }],
  });

  it("courriers de recouvrement : bail engagé, sans décompte de départ finalisé, avec une dette, au palier disponible", async () => {
    const baux = [bail("brouillon", "brouillon"), bail("sans-dette", "actif"), bail("palier-ok", "actif"), bail("palier-ko", "preavis"), bail("decompte", "termine")];
    const tables = { baux, restitutions: [{ organization_id: "org", bail_id: "decompte", statut: "finalise" }, { organization_id: "org", bail_id: "palier-ok", statut: "brouillon" }] };
    vi.mocked(verifierCourrierDuBail).mockImplementation(async (_db, _org, bailId) => bailId === "palier-ko" ? { erreur: "Ce courrier ne correspond pas au palier disponible. Vérifiez la prochaine étape et sa date dans le suivi du loyer." } : { precedente: undefined });
    const rpcs = termes({ "sans-dette": 760 });
    for (const [id, niveau] of [["relance_simple", "relance_1"], ["seconde_relance", "relance_2"], ["mise_en_demeure", "recommande"]] as const) {
      vi.mocked(verifierCourrierDuBail).mockClear();
      expect(await ids(id, tables, rpcs)).toEqual(["palier-ok"]);
      // La vérification même de l'assembleur, avec les termes échus et le niveau du courrier ; pas pour un bail sans dette.
      expect(vi.mocked(verifierCourrierDuBail).mock.calls.map((c) => [c[2], c[5]])).toEqual([["palier-ok", niveau], ["palier-ko", niveau]]);
      expect(vi.mocked(verifierCourrierDuBail).mock.calls[0][3]).toEqual([expect.objectContaining({ appel_id: "a-palier-ok", montant_couvert: 0 })]);
    }
    // Un identifiant forcé est refusé avec le motif de l'assembleur.
    const { db } = base({ ...commun, ...tables }, rpcs);
    await expect(verifierCibleCatalogue(db, "org", modele("relance_simple"), "sans-dette")).rejects.toThrow(REFUS_AUCUNE_DETTE);
    await expect(verifierCibleCatalogue(db, "org", modele("relance_simple"), "decompte")).rejects.toThrow(REFUS_SOLDE_DANS_DECOMPTE);
    await expect(verifierCibleCatalogue(db, "org", modele("relance_simple"), "palier-ko")).rejects.toThrow("Ce courrier ne correspond pas au palier disponible.");
    await expect(verifierCibleCatalogue(db, "org", modele("relance_simple"), "brouillon")).rejects.toBeInstanceOf(RefusDocument);
    await expect(verifierCibleCatalogue(db, "org", modele("relance_simple"), "palier-ok")).resolves.toBeUndefined();
  });
  it("relevé de situation : tout bail sauf celui dont le solde est au décompte de départ (sans lire les loyers)", async () => {
    const baux = [bail("brouillon", "brouillon"), bail("actif", "actif"), bail("decompte", "termine")];
    const { db, appels } = base({ ...commun, baux, restitutions: [{ organization_id: "org", bail_id: "decompte", statut: "finalise" }] });
    expect((await chargerCiblesCatalogue(db, "org", modele("situation_dette"))).choix.map((c) => c.id)).toEqual(["brouillon", "actif"]);
    expect(appels.some((a) => a.table === "etat_loyers_bail")).toBe(false);
  });
  it("protocole : une dette (plan vivant ou solde échu) et un plan qui a ses tranches ; aucun palier de relance", async () => {
    const baux = [bail("plan", "actif"), bail("plan-sans-tranche", "actif"), bail("sans-plan-dette", "actif"), bail("sans-plan-sans-dette", "actif"), bail("plan-caduc", "actif"), bail("brouillon", "brouillon")];
    const tables = {
      baux,
      plans_apurement: [
        { id: "p1", organization_id: "org", bail_id: "plan", etat: "actif", dette_initiale: 1520, created_at: "2026-10-01" },
        { id: "p2", organization_id: "org", bail_id: "plan-sans-tranche", etat: "propose", dette_initiale: 900, created_at: "2026-10-01" },
        { id: "p3", organization_id: "org", bail_id: "plan-caduc", etat: "caduc", dette_initiale: 900, created_at: "2026-10-01" },
      ],
      plan_apurement_tranches: [{ organization_id: "org", plan_id: "p1", rang: 1 }],
    };
    // Le bail sous plan a ses termes couverts : la dette est celle du plan.
    const rpcs = termes({ plan: 760, "plan-sans-tranche": 760, "sans-plan-sans-dette": 760, "plan-caduc": 760 });
    expect(await ids("protocole_apurement", tables, rpcs)).toEqual(["plan", "sans-plan-dette"]);
    expect(verifierCourrierDuBail).not.toHaveBeenCalled();
    const { db } = base({ ...commun, ...tables }, rpcs);
    await expect(verifierCibleCatalogue(db, "org", modele("protocole_apurement"), "plan-sans-tranche")).rejects.toThrow(REFUS_PLAN_SANS_TRANCHE);
    await expect(verifierCibleCatalogue(db, "org", modele("protocole_apurement"), "plan-caduc")).rejects.toThrow(REFUS_AUCUNE_DETTE);
  });
  it("acte de cautionnement : seulement un bail qui a un garant rattaché", async () => {
    const baux = [bail("garant", "actif", { bail_personnes: [{ role: "garant" }] }), bail("colocataire-seul", "actif", { bail_personnes: [{ role: "colocataire" }] }), bail("personne", "actif", { bail_personnes: [] })];
    expect(await ids("cautionnement", { baux })).toEqual(["garant"]);
    const { db, appels } = base({ ...commun, baux });
    await expect(verifierCibleCatalogue(db, "org", modele("cautionnement"), "personne")).rejects.toBeInstanceOf(RefusDocument);
    expect(appels.at(-1)!.ops).toContainEqual(["select", "id,bail_personnes!bail_personnes_bail_meme_org_fk!inner(role)"]);
    expect(appels.at(-1)!.ops).toContainEqual(["eq", "bail_personnes.role", "garant"]);
  });
  // Second passage du lot 46 : revue des refus des assembleurs, modèle par modèle. Deux restaient proposés puis refusés pour
  // l'état du dossier : le bordereau de remise des clés d'un état des lieux sans clé (« Aucune clé n'a été enregistrée… ») et le
  // bordereau de versement d'un rapport dont le versement n'est pas enregistré (« Enregistrez le versement du rapport… »).
  it("bordereau de remise des clés : un état des lieux qui a des clés ; bordereau de versement : un versement enregistré", async () => {
    const edl = (id: string, cles: Ligne[]) => ({ id, organization_id: "org", bail_id: "b", type: "sortie", etat: "signe", date_edl: "2026-11-02", edl_cles: cles });
    const tables = { baux: [bail("b", "termine")], etats_des_lieux: [edl("avec-cles", [{ id: "k1" }]), edl("sans-cle", [])] };
    expect(await ids("restitution_cles", tables)).toEqual(["avec-cles"]);
    const { db, appels } = base({ ...commun, ...tables });
    await expect(verifierCibleCatalogue(db, "org", modele("restitution_cles"), "sans-cle")).rejects.toBeInstanceOf(RefusDocument);
    expect(appels.at(-1)!.ops).toContainEqual(["select", "id,edl_cles!edl_cles_edl_id_fkey!inner(id)"]);
    const rapport = (id: string, versement_montant: number | null, versement_date: string | null) => ({ id, organization_id: "org", mandat_id: "m", mois: "2026-10-01", statut: "envoye", versement_montant, versement_date });
    const rapports_gestion = [rapport("verse", 1250, "2026-11-05"), rapport("sans-date", 1250, null), rapport("non-verse", null, null)];
    expect(await ids("bordereau_versement", { rapports_gestion })).toEqual(["verse"]);
    // Le rapport de gestion lui-même se prépare avant le versement : inchangé.
    expect(await ids("rapport_gestion", { rapports_gestion })).toEqual(["verse", "sans-date", "non-verse"]);
  });
  it("les motifs de la liste sont ceux de l'assembleur (mêmes constantes, mêmes calculs)", () => {
    const source = readFileSync("src/lib/documents/modeles/catalogue-bail.ts", "utf8");
    expect(source).toContain("if (restitutions.length) return { erreur: REFUS_SOLDE_DANS_DECOMPTE };");
    expect(source).toContain("const echus = termesEchus(termes, aujourdhui);");
    expect(source).toContain('if (code !== "situation_dette" && detteCentimes <= 0) return { erreur: REFUS_AUCUNE_DETTE };');
    expect(source).toContain("if (!plan.tranches.length) return { erreur: REFUS_PLAN_SANS_TRANCHE };");
    expect(source).toContain("const suivi = await verifierCourrierDuBail(supabase, orgId, bailId, echus, aujourdhui, niveau);");
    expect(REFUS_INVENTAIRE_NON_MEUBLE).toBe("L’inventaire du mobilier concerne un logement meublé.");
  });
});

describe("garde : le contexte d'un bail de test garde ses bailleurs (l'émetteur suit les détenteurs)", () => {
  it("contexte() a des bailleurs : l'en-tête d'un document du bail est celui des détenteurs", () => {
    expect(expediteur(contexte()).emetteur).toBe("detenteurs");
  });
});
