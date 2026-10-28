/**
 * « Conseils pour choisir votre locataire » — le rappel posé sur la fiche d'un
 * bail en cours, à côté des garants (demande du dirigeant, 14/10/2026).
 *
 * La page entière est rendue (`PageBail`), avec le vrai contrôle d'accès
 * (`verifierAccesEspace`) ; seule la base est simulée. On vérifie, pour chaque
 * profil de l'espace de gestion :
 *  · le propriétaire en gestion directe voit le bloc, replié, dans la carte
 *    « Garants » (bail nu ou meublé) ou « Colocataires & garants » (colocation),
 *    une seule fois ;
 *  · l'administrateur et l'agent d'une agence ne voient rien : la page est
 *    celle d'avant, octet pour octet à ce bloc près ;
 *  · un bail en préparation n'affiche pas le rappel ici (le parcours de
 *    création a le sien, à l'étape « Personnes ») ; un bail terminé non plus
 *    (plus de garants à rattacher).
 *
 * Le bloc posé à l'étape « Personnes » est testé dans `conseils-locataire.test.ts`.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
const LOT = "33333333-3333-4333-8333-333333333333";
const LOCATAIRE = "55555555-5555-4555-8555-555555555555";

const banc = vi.hoisted(() => ({
  adhesion: null as unknown,
  bail: null as unknown,
  superAdmin: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/agence/test/baux/test",
  useSearchParams: () => new URLSearchParams(),
  redirect: (cible: string) => {
    throw new Error(`redirect:${cible}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
  unstable_rethrow: (erreur: unknown) => {
    throw erreur;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Les étapes du parcours de création sont des composants serveur asynchrones,
// que le rendu statique ne sait pas attendre : ici elles sont remplacées par un
// bloc vide (l'étape « Personnes » a son propre test dans conseils-locataire.test.ts).
vi.mock("@/app/agence/[orgId]/baux/[bailId]/etape-personnes-bail", () => ({ EtapePersonnesBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/completer-sur-place", () => ({ CompleterSurPlace: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail", () => ({ DocumentsParcoursBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/recapitulatif-parcours-bail", () => ({ RecapitulatifParcoursBail: () => null }));
// Le suivi AR24 est un composant serveur asynchrone, testé séparément en navigateur.
vi.mock("@/components/historique-recommandes", () => ({ HistoriqueRecommandes: () => null }));
vi.mock("@/lib/actions-attendues", () => ({ actionsAttendues: async () => [] }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/verifier-dossier", () => ({
  verifierDossierBail: async () => ({ manquants: [] }),
}));

vi.mock("@/lib/supabase/server", () => {
  const lignes = (table: string): unknown => {
    switch (table) {
      case "memberships":
        return banc.adhesion;
      case "baux":
        return banc.bail;
      case "lots":
        return { id: "33333333-3333-4333-8333-333333333333", nom: "Studio du port", bien_id: "44444444-4444-4444-8444-444444444444", meuble: false, colocation_loyer_reference: null, bien: { zone_tendue: true, copropriete: false } };
      case "persons":
        return [{ id: "55555555-5555-4555-8555-555555555555", nom: "Martin", prenom: "Léa", email: "lea@example.org" }];
      default:
        return [];
    }
  };
  const requete = (table: string) => {
    const donnees = lignes(table);
    const un = Array.isArray(donnees) ? (table === "persons" ? donnees[0] : null) : donnees;
    const q: unknown = new Proxy(() => {}, {
      get(_cible, propriete) {
        if (propriete === "then")
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
            Promise.resolve({ data: donnees, error: null, count: 0 }).then(ok, ko);
        if (propriete === "maybeSingle" || propriete === "single") return async () => ({ data: un, error: null });
        return () => q;
      },
    });
    return q;
  };
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "compte-1" } } }) },
      from: requete,
      rpc: async (nom: string) => ({ data: nom === "is_super_admin" ? banc.superAdmin : null, error: null }),
    }),
  };
});

import PageBail from "@/app/agence/[orgId]/baux/[bailId]/page";

// ── Outils ────────────────────────────────────────────────────────────────

function adhesion(role: string, type: string) {
  return {
    role,
    organisation: { id: ORG, name: "Organisation de test", status: "actif", type, essai_fin: null, logo_url: null, couleur_primaire: null, couleur_secondaire: null, nom_portail: null },
  };
}
const PROFILS = {
  proprietaire: adhesion("proprietaire_direct", "proprietaire_direct"),
  adminAgence: adhesion("admin_agence", "agence"),
  agent: adhesion("agent", "agence"),
};

/** Toutes les colonnes que la page lit (52), vides par défaut : comme la ligne d'un bail neuf. */
const COLONNES_BAIL = [
  "id", "chambre_id", "type", "etat", "zone_tendue", "loyer_hc", "charges", "depot_garantie", "jour_echeance", "lot_id",
  "locataire_principal", "document_signe", "reglement_copropriete", "signe_envoye_le", "date_debut", "date_fin", "revision_irl",
  "charges_mode", "irl_trimestre", "fixation_loyer", "paiement_echeance", "lieu_paiement", "irl_valeur", "duree_reduite_evenement",
  "travaux_recents", "travaux_recents_montant", "travaux_locataire", "honoraires_bailleur", "honoraires_locataire",
  "clauses_particulieres", "loyer_reference", "loyer_reference_majore", "complement_loyer", "complement_justification",
  "dernier_loyer", "dernier_loyer_versement", "dernier_loyer_revision", "precedente_location", "precedent_loyer_revise",
  "meuble_etudiant", "date_conclusion_prevue", "servitude_residence_principale", "encadrement_loyer", "zone_honoraires",
  "honoraires_edl_bailleur", "honoraires_edl_locataire", "dpe_depenses_min", "dpe_depenses_max", "dpe_annees_reference",
  "clause_resolutoire_assurance", "clause_resolutoire_troubles", "clause_resolutoire_servitude",
];
function bail(surcharge: Record<string, unknown> = {}) {
  return {
    ...Object.fromEntries(COLONNES_BAIL.map((colonne) => [colonne, null])),
    id: BAIL, type: "nu", etat: "actif", zone_tendue: true,
    loyer_hc: 800, charges: 50, depot_garantie: 800, jour_echeance: 5, lot_id: LOT,
    locataire_principal: LOCATAIRE, date_debut: "2026-01-01", charges_mode: "provision",
    ...surcharge,
  };
}

async function fiche(): Promise<string> {
  const element = (await PageBail({ params: Promise.resolve({ orgId: ORG, bailId: BAIL }) } as never)) as ReactElement;
  return renderToStaticMarkup(createElement("div", null, element));
}
const occurrences = (html: string, motif: RegExp) => html.match(motif)?.length ?? 0;
const RAPPEL = /data-conseils-locataire="garanties-bail"/g;

beforeEach(() => {
  banc.adhesion = PROFILS.proprietaire;
  banc.bail = bail();
  banc.superAdmin = false;
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("fiche d'un bail en cours : rappel des conseils, à côté des garants", () => {
  it("masque les conseils non relus au propriétaire et conserve les garants", async () => {
    const html = await fiche();
    expect(occurrences(html, RAPPEL)).toBe(0);
    expect(html).not.toContain("Conseils pour choisir votre locataire");
    expect(html).toContain("Aucun garant.");
  });

  it("l'administrateur d'une agence ne voit rien", async () => {
    banc.adhesion = PROFILS.adminAgence;
    const html = await fiche();
    expect(html).toContain(">Garants<");
    expect(html).not.toContain("data-conseils-locataire");
    expect(html).not.toContain("Conseils pour choisir votre locataire");
  });

  it("l'agent d'une agence ne voit rien", async () => {
    banc.adhesion = PROFILS.agent;
    const html = await fiche();
    expect(html).toContain(">Garants<");
    expect(html).not.toContain("data-conseils-locataire");
  });

  it("le profil est décidé par le type de l'organisation, pas par le rôle seul : un rôle de propriétaire dans une agence ne l'ouvre pas", async () => {
    banc.adhesion = adhesion("proprietaire_direct", "agence");
    const html = await fiche();
    expect(html).not.toContain("data-conseils-locataire");
  });

  it("en colocation, la carte des garants reste présente sans conseil non relu", async () => {
    banc.bail = bail({ type: "colocation" });
    const html = await fiche();
    expect(html).toContain("Colocataires &amp; garants");
    expect(occurrences(html, RAPPEL)).toBe(0);
  });

  it("pour un contrat individuel de colocation, les conseils restent masqués", async () => {
    banc.bail = bail({ type: "colocation_individuelle", chambre_id: "66666666-6666-4666-8666-666666666666" });
    const html = await fiche();
    expect(occurrences(html, RAPPEL)).toBe(0);
  });

  it("pas de rappel sur un bail en préparation : le parcours de création a le sien", async () => {
    banc.bail = bail({ etat: "brouillon" });
    const html = await fiche();
    expect(html).not.toContain("data-conseils-locataire");
  });

  it("pas de rappel sur un bail terminé : il n'y a plus de garant à rattacher", async () => {
    banc.bail = bail({ etat: "termine" });
    const html = await fiche();
    expect(html).not.toContain("data-conseils-locataire");
  });

  it("un bail en préavis ne réaffiche pas les conseils non relus", async () => {
    banc.bail = bail({ etat: "preavis" });
    const html = await fiche();
    expect(occurrences(html, RAPPEL)).toBe(0);
  });
});
