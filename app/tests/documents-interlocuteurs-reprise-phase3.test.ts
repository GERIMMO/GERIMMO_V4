/**
 * Phase 3 de la mission palier 1, reprise du lot 37 — émetteur, interlocuteur et destinataire justes (relecture contradictoire).
 *
 *  - C56 : la demande d'attestation d'assurance d'un COLOCATAIRE (non principal) ne trouvait pas son bail : elle repartait au nom
 *    technique de l'espace, avec son téléphone, et sans logement ;
 *  - ordre d'intervention (cause de C36/C76) : chez une propriétaire, il partait au nom technique de l'espace alors que le compte
 *    rendu de la même mission désignait la bailleresse comme donneur d'ordre ; une lecture des détenteurs en échec ne doit pas
 *    redonner le nom de l'espace ;
 *  - nouveau blocage des documents émis par le bailleur sans adresse : la liste « À renseigner » envoyait au profil de l'espace,
 *    que ces documents ne lisent pas.
 * Les autres constats de la reprise (C90, S39, décompte de fournitures) sont vérifiés dans documents-interlocuteurs-phase3,
 * dossiers-selon-etat-phase3 et regularisation-fournitures.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  signatureOrganisation: vi.fn(async () => null),
}));
import { assemblerRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { MESSAGE_CHARGEMENT_IMPOSSIBLE } from "@/lib/documents/modeles/catalogue-bail";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/**
 * Une base simulée qui APPLIQUE les filtres `eq`, `in` et `is` sur les colonnes de premier niveau (une colonne absente de la
 * ligne ne passe pas un `eq`). `echecs` : les tables dont la lecture rend une erreur.
 */
function base(tables: Record<string, Ligne[]>, echecs: string[] = []): SupabaseClient {
  const requete = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    const resultat = () => (echecs.includes(table)
      ? { data: null, error: { message: "lecture impossible" } }
      : { data: (tables[table] ?? []).filter((l) => filtres.every((f) => f(l))), error: null });
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve(resultat()).then(ok),
      maybeSingle: async () => { const r = resultat(); return { data: r.data?.[0] ?? null, error: r.error }; },
    };
    for (const op of ["select", "order", "limit", "range", "gte", "lt", "lte", "not", "or"]) q[op] = () => q;
    q.eq = (k: string, v: unknown) => { filtres.push((l) => l[k] === v); return q; };
    q.in = (k: string, v: unknown[]) => { filtres.push((l) => v.includes(l[k])); return q; };
    q.is = (k: string, v: unknown) => { filtres.push((l) => (l[k] ?? null) === v); return q; };
    return q;
  };
  return { from: requete, rpc: requete } as unknown as SupabaseClient;
}

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const enTeteDe = (html: string) => texteDe(html.split('<div class="cartouche-ref">')[0].split('<header class="entete">')[1] ?? "");

const ESPACE = { id: "org", type: "proprietaire_direct", name: "Parc de Claire Moreau", address_line1: "8 avenue des Tilleuls", postal_code: "69006", city: "Lyon", telephone: "04 00 00 00 00", email_contact: "parc@exemple.fr" };
const bailleuse = () => personne({ id: "prop", nom: "Moreau", prenom: "Claire", telephone: "06 11 11 11 11", email: "claire@exemple.fr", address_line1: "3 rue du Domicile" });

describe("C56 — demande d'attestation d'assurance d'un colocataire", () => {
  const tables = (): Record<string, Ligne[]> => ({
    documents: [{ id: "doc1", organization_id: "org", type: "attestation_assurance", expire_le: "2026-12-05" }],
    organizations: [ESPACE],
    document_liens: [{ document_id: "doc1", entite: "personne", entite_id: "coloc" }],
    persons: [{ id: "coloc", nom: "Fictif", prenom: "Bruno", account_id: null }],
    // Le bail de la colocation : le locataire principal est une autre personne ; Bruno y figure comme colocataire.
    baux: [{ id: "b1", organization_id: "org", etat: "actif", locataire_principal: "principal", chambre: null, lot: { id: "l1", nom: "T4 en colocation", etage: "2", bien: { address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" } } }],
    bail_personnes: [{ organization_id: "org", bail_id: "b1", person_id: "coloc", role: "colocataire" }],
    detentions: [{ lot_id: "l1", date_fin: null, quote_part: 100, person: bailleuse() }],
  });
  it("trouve son bail : émise et signée par la bailleresse, avec le logement et la référence du bail", async () => {
    const r = succes(await assemblerRappelAssurance(base(tables()), "org", "doc1"));
    const html = r.document.html;
    expect(enTeteDe(html)).toContain("Moreau Claire");
    expect(enTeteDe(html)).toContain("06 11 11 11 11");
    expect(html).toContain('<div class="sig-nom">Moreau Claire</div>');
    expect(html).not.toContain("Parc de Claire Moreau");
    expect(html).not.toContain("04 00 00 00 00");
    expect(texteDe(html)).toContain("8 avenue des Essais, 69003 Lyon, T4 en colocation, étage 2");
    expect(r.document.manquants).toEqual([]);
    expect(r.liens).toEqual([{ entite: "personne", entiteId: "coloc" }, { entite: "bail", entiteId: "b1" }]);
  });
  it("un garant du bail n'est pas pris pour un colocataire", async () => {
    const t = tables();
    t.bail_personnes = [{ organization_id: "org", bail_id: "b1", person_id: "coloc", role: "garant" }];
    const r = succes(await assemblerRappelAssurance(base(t), "org", "doc1"));
    expect(r.liens).toEqual([{ entite: "personne", entiteId: "coloc" }]);
  });
  it("une colocation terminée n'est pas un bail en cours", async () => {
    const t = tables();
    t.baux = [{ ...t.baux[0], etat: "termine" }];
    const r = succes(await assemblerRappelAssurance(base(t), "org", "doc1"));
    expect(r.liens).toEqual([{ entite: "personne", entiteId: "coloc" }]);
  });
  it.each(["baux", "bail_personnes"])("une lecture de %s en échec refuse le document (plus « aucun bail en cours »)", async (table) => {
    expect(await assemblerRappelAssurance(base(tables(), [table]), "org", "doc1")).toEqual({ erreur: "Le bail de cette personne ne peut pas être vérifié. Réessayez." });
  });
});

describe("ordre d'intervention : le donneur d'ordre, jamais le nom de l'espace", () => {
  const tables = (): Record<string, Ligne[]> => ({
    organizations: [ESPACE],
    lots: [{ id: "lot", organization_id: "org", nom: "T2", bien_id: "bien", etage: null }],
    biens: [{ id: "bien", organization_id: "org", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" }],
    incidents: [{ id: "incident", organization_id: "org", numero: "INC-2026-0004", lot_id: "lot", description: "Fuite sous l'évier.", piece: "Cuisine", categorie: "plomberie_joint", etat: "en_cours" }],
    incident_interventions: [{ id: "int", organization_id: "org", incident_id: "incident", artisan_id: "art", nature_travaux: "entretien_courant", statut: "planifiee", confiee_le: "2026-11-22", debut_prevu: "2026-11-26", fin_prevue: "2026-11-27" }],
    artisans: [{ id: "art", raison_sociale: "Plomberie Fictive", siret: "12345678901234", telephone: "0600000000", email: "a@x.fr" }],
    intervention_comptes_rendus: [{ organization_id: "org", intervention_id: "int", travaux_realises: "Joint remplacé.", cause_reelle: "Usure.", montant_final_cents: 18700, nouvelle_intervention_necessaire: false, created_at: "2026-11-26" }],
    detentions: [{ lot_id: "lot", date_fin: null, quote_part: 100, person: bailleuse() }],
  });
  it.each(["ordre_intervention", "compte_rendu_intervention"] as const)("%s : une lecture des détenteurs en échec refuse le document", async (code) => {
    const t = tables();
    if (code === "compte_rendu_intervention") t.incident_interventions[0].statut = "terminee";
    const r = await assemblerComplementGestion(code, base(t, ["detentions"]), "org", "int", { acces: "Clé chez la gardienne." });
    expect(r).toEqual({ erreur: MESSAGE_CHARGEMENT_IMPOSSIBLE });
  });
  it("bailleresse sans adresse enregistrée : l'ordre reste à compléter (domicile et commune), jamais l'adresse de l'espace", async () => {
    const t = tables();
    t.detentions = [{ lot_id: "lot", date_fin: null, quote_part: 100, person: { ...bailleuse(), address_line1: null, postal_code: null, city: null } }];
    const r = succes(await assemblerComplementGestion("ordre_intervention", base(t), "org", "int", { acces: "Clé chez la gardienne." }));
    expect(r.document.manquants).toEqual(["domicile ou siège social", "commune"]);
    expect(enTeteDe(r.document.html)).not.toContain("8 avenue des Tilleuls");
    // La liste « À renseigner » envoie à la fiche du propriétaire (voir plus bas), pas au profil de l'espace.
    expect(r.document.manquants.map((m) => lienPourManquant(m, "org", r.liens, "ordre_intervention", "/espace")?.ecran)).toEqual(["fiche du propriétaire, dans Personnes", "fiche du propriétaire, dans Personnes"]);
  });
  it("sans détenteur enregistré, l'espace reste l'émetteur (règle d'expediteur)", async () => {
    const t = tables();
    t.detentions = [];
    const html = succes(await assemblerComplementGestion("ordre_intervention", base(t), "org", "int", { acces: "Clé chez la gardienne." })).document.html;
    expect(enTeteDe(html)).toContain("Parc de Claire Moreau");
  });
});

describe("À renseigner : l'adresse et la commune du bailleur se complètent sur sa fiche, pas au profil de l'espace", () => {
  const liensBail = [{ entite: "bail" as const, entiteId: "b1" }, { entite: "lot" as const, entiteId: "l1" }];
  const liensLot = [{ entite: "lot" as const, entiteId: "l1" }];
  it.each([
    ["restitution_cles", liensBail], ["regularisation_charges", liensBail], ["decompte_charges", liensBail], ["consultation_charges", liensBail],
    ["rappel_assurance", [{ entite: "personne" as const, entiteId: "p1" }, { entite: "bail" as const, entiteId: "b1" }]],
    ["quittance", [{ entite: "bail" as const, entiteId: "b1" }]], ["ordre_intervention", liensLot], ["compte_rendu_intervention", liensLot],
  ] as const)("propriétaire, %s", (modele, liens) => {
    for (const libelle of ["domicile ou siège social", "commune"]) {
      expect(lienPourManquant(libelle, "org", [...liens], modele, "/espace")).toEqual({ href: "/espace/org/personnes", ecran: "fiche du propriétaire, dans Personnes" });
    }
  });
  it("les documents propres à l'espace et l'agence gardent le profil", () => {
    for (const modele of ["recap_incident", "comparatif_devis", "recap_fiscal_nu", "ecriture_rectificative"]) {
      expect(lienPourManquant("commune", "org", liensLot, modele, "/espace")?.href).toBe("/espace/org/profil");
    }
    expect(lienPourManquant("commune", "org", [], "cloture_mensuelle", "/espace")?.href).toBe("/espace/org/profil");
    expect(lienPourManquant("domicile ou siège social", "org", liensBail, "restitution_cles", "/agence")?.href).toBe("/agence/org/profil");
    expect(lienPourManquant("commune", "org", liensBail, "quittance")?.href).toBe("/agence/org/profil");
  });
  it("l'adresse électronique garde le profil (contact de gestion, repli de l'en-tête du bailleur)", () => {
    expect(lienPourManquant("adresse électronique", "org", liensBail, "restitution_cles", "/espace")?.href).toBe("/espace/org/profil");
  });
});
