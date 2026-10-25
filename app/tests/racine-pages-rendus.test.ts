/**
 * Décision D27 : les pages de src/app/agence/[orgId] qui portent le plus de liens, RENDUES pour une agence ET pour un
 * propriétaire direct — fiche du bail (et son formulaire des loyers), loyers & charges, incidents (avec le dossier
 * ouvert, son volet artisan et la mise en concurrence), alertes, parc (fenêtre du lot), invitation du locataire.
 *
 * Contre-relecture du 15/10 : le balayage statique de ces pages laissait survivre des choix de racine faux — une
 * agence envoyée sur /espace/<agence> (404) par `${RACINE_PROPRIETAIRE}/${orgId}` sur la fiche du bail ou les loyers,
 * par `versEspaceProprietaire(…)` sur les incidents, par `baseDepuisRacine(orgId, RACINE_PROPRIETAIRE)` dans
 * l'invitation ; un propriétaire direct renvoyé sous /agence par un volet artisan qui ignore le drapeau, ou par un
 * parent qui ne le transmet plus (volet artisan, liste des alertes, formulaire des loyers, fenêtre du lot).
 *
 * Ici, la page est rendue avec la VRAIE garde (`verifierAccesEspace`, qui lit le type de l'organisation) et ses vrais
 * composants, serveur asynchrones compris (`prerender` attend chaque composant asynchrone : le dossier d'incident et
 * son volet artisan lisent eux-mêmes la base). Seuls la base et quelques composants client sont simulés ; un témoin
 * affiche ce qu'ils reçoivent (adresse de retour d'un document généré, drapeau de la fenêtre du lot). Chaque test
 * affirme qu'une agence n'obtient JAMAIS /espace, qu'un propriétaire direct n'est jamais renvoyé sous /agence, et que
 * les liens composés par chaque expression visée sont bien présents (le test n'est pas vide).
 */
import { createElement, type ReactElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const banc = vi.hoisted(() => ({
  /** Les lignes rendues par table ou par fonction : tableau (liste) ou objet (une ligne). */
  donnees: {} as Record<string, unknown>,
  appelsAttendues: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/",
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
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock("@/lib/supabase/server", () => {
  const lire = (nom: string) => banc.donnees[nom] ?? [];
  const requete = (nom: string) => {
    const reponse = () => {
      const d = lire(nom);
      return { data: d, error: null, count: Array.isArray(d) ? d.length : 0 };
    };
    const q: unknown = new Proxy(() => {}, {
      get(_c, prop) {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(reponse()).then(ok, ko);
        if (prop === "maybeSingle" || prop === "single") {
          return async () => { const r = reponse(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; };
        }
        return () => q;
      },
    });
    return q;
  };
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "compte-1" } } }) },
      from: requete,
      rpc: requete,
    }),
  };
});

// Témoins : ce qu'un composant client reçoit, quand il ne l'affiche pas lui-même.
vi.mock("@/components/bouton-generer-document", () => ({
  BoutonGenererDocument: (p: { code: string; cheminRetour: string }) => createElement("span", { "data-document": p.code, "data-retour": p.cheminRetour }),
}));
vi.mock("@/components/fenetre-lot", async () => {
  const { default: Link } = await import("next/link");
  return {
    FenetreLotProvider: (p: { estProprietaire?: boolean; children: ReactNode }) =>
      createElement("div", { "data-fenetre-lot": String(p.estProprietaire) }, p.children),
    BoutonLot: (p: { href: string; className?: string; children: ReactNode }) => createElement(Link, { href: p.href, className: p.className }, p.children),
  };
});
// « Finances » : l'écran du seul propriétaire direct, rendu à la place des loyers (racine-pages-espace.test.ts).
vi.mock("@/components/page-finances", () => ({ PageFinances: () => createElement("i", { "data-page-finances": "" }) }));
// Le parcours de création d'un bail et ses vérifications : sans objet sur un bail actif.
vi.mock("@/app/agence/[orgId]/baux/[bailId]/etape-personnes-bail", () => ({ EtapePersonnesBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/completer-sur-place", () => ({ CompleterSurPlace: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail", () => ({ DocumentsParcoursBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/recapitulatif-parcours-bail", () => ({ RecapitulatifParcoursBail: () => null }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/verifier-dossier", () => ({ verifierDossierBail: async () => ({ manquants: [] }) }));
// Les blocages du bail : la page leur passe la racine du profil (vérifiée ici), leurs adresses sont éprouvées ailleurs.
vi.mock("@/lib/actions-attendues", async (importer) => {
  const reel = await importer<typeof import("@/lib/actions-attendues")>();
  return { ...reel, actionsAttendues: async (...args: unknown[]) => { banc.appelsAttendues.push(args[2]); return []; } };
});

import PageBail from "@/app/agence/[orgId]/baux/[bailId]/page";
import PageLoyers from "@/app/agence/[orgId]/loyers/page";
import PageIncidents from "@/app/agence/[orgId]/incidents/page";
import PageAlertes from "@/app/agence/[orgId]/alertes/page";
import PageParc from "@/app/agence/[orgId]/parc/page";
import { FormulaireInvitation } from "@/app/agence/[orgId]/personnes/[personId]/formulaire-invitation";
import { FournisseurRacineEspace } from "@/components/racine-espace-contexte";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
const LOT = "33333333-3333-4333-8333-333333333333";
const BIEN = "44444444-4444-4444-8444-444444444444";
const LOCATAIRE = "55555555-5555-4555-8555-555555555555";
const INCIDENT = "66666666-6666-4666-8666-666666666666";
const MISSION = "77777777-7777-4777-8777-777777777777";
const PHOTO = "88888888-8888-4888-8888-888888888888";

const PROFILS = [
  { nom: "agence (admin)", role: "admin_agence", type: "agence", racine: "/agence", interdit: "/espace/" },
  { nom: "propriétaire direct", role: "proprietaire_direct", type: "proprietaire_direct", racine: "/espace", interdit: "/agence/" },
] as const;
type Profil = (typeof PROFILS)[number];

/** L'adhésion que lit la garde : c'est elle qui décide du profil (`organisation.type`). */
function adhesion(p: Profil) {
  return {
    role: p.role,
    organisation: { id: ORG, name: "Organisation TEST", status: "active", type: p.type, essai_fin: null, logo_url: null, couleur_primaire: null, couleur_secondaire: null, nom_portail: null },
  };
}

/** Le HTML complet d'un élément, composants serveur asynchrones attendus. */
async function rendre(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(createElement("div", null, element));
  return new Response(prelude).text();
}

/** Toutes les adresses de gestion (`/agence/…` ou `/espace/…`) portées par un attribut du HTML (href, src, data-…). */
function adressesDeGestion(html: string): string[] {
  return [...html.matchAll(/\s[\w-]+="(\/(?:agence|espace)\/[^"]*)"/g)].map((x) => x[1].replaceAll("&amp;", "&"));
}

/** Aucune adresse de l'autre profil ; toutes sous la base attendue ; et celles qu'on attend y sont. */
function verifier(html: string, p: Profil, attendues: string[]) {
  const base = `${p.racine}/${ORG}`;
  const adresses = adressesDeGestion(html);
  for (const a of adresses) expect(a.startsWith(`${base}/`) || a === base, a).toBe(true);
  expect(adresses).toEqual(expect.arrayContaining(attendues.map((s) => `${base}${s}`)));
  expect(html).not.toContain(p.interdit);
}

/** Les colonnes que la fiche du bail lit : vides par défaut, comme la ligne d'un bail neuf. */
const COLONNES_BAIL = [
  "id", "chambre_id", "type", "etat", "zone_tendue", "loyer_hc", "charges", "depot_garantie", "jour_echeance", "lot_id",
  "locataire_principal", "document_signe", "reglement_copropriete", "signe_envoye_le", "date_debut", "date_fin", "date_sortie_reelle",
  "revision_irl", "charges_mode", "irl_trimestre", "fixation_loyer", "paiement_echeance", "lieu_paiement", "irl_valeur",
  "duree_reduite_evenement", "travaux_recents", "travaux_recents_montant", "travaux_locataire", "honoraires_bailleur",
  "honoraires_locataire", "clauses_particulieres", "loyer_reference", "loyer_reference_majore", "complement_loyer",
  "complement_justification", "dernier_loyer", "dernier_loyer_versement", "dernier_loyer_revision", "precedente_location",
  "precedent_loyer_revise", "meuble_etudiant", "date_conclusion_prevue", "servitude_residence_principale", "encadrement_loyer",
  "zone_honoraires", "honoraires_edl_bailleur", "honoraires_edl_locataire", "dpe_depenses_min", "dpe_depenses_max",
  "dpe_annees_reference", "clause_resolutoire_assurance", "clause_resolutoire_troubles", "clause_resolutoire_servitude",
];

beforeEach(() => {
  banc.donnees = {};
  banc.appelsAttendues = [];
});

describe("fiche du bail : la page et son formulaire des loyers", () => {
  for (const p of PROFILS) {
    it(`${p.nom} : chaque lien sous ${p.racine}/<id>, jamais ${p.interdit}`, async () => {
      banc.donnees = {
        memberships: adhesion(p),
        baux: {
          ...Object.fromEntries(COLONNES_BAIL.map((c) => [c, null])),
          id: BAIL, type: "nu", etat: "actif", zone_tendue: true, loyer_hc: 800, charges: 50, depot_garantie: 800, jour_echeance: 5,
          lot_id: LOT, locataire_principal: LOCATAIRE, date_debut: "2026-01-01", charges_mode: "provision",
        },
        lots: { id: LOT, nom: "Lot TEST", bien_id: BIEN, meuble: false, colocation_loyer_reference: null, bien: { zone_tendue: true, copropriete: false } },
        persons: [{ id: LOCATAIRE, nom: "Martin", prenom: "Léa", email: "lea@example.invalid" }],
        etats_des_lieux: [{ id: "edl-1", type: "entree", etat: "signe" }],
        // L'échéancier du bail : chaque terme propose son avis d'échéance, composé par FormulaireLoyers.
        etat_loyers_bail: [{ appel_id: "appel-1", periode: "2026-09-01", date_echeance: "2026-09-05", montant_du: 850, montant_couvert: 0, statut: "attendu", prorata: false }],
      };
      const html = await rendre((await PageBail({ params: Promise.resolve({ orgId: ORG, bailId: BAIL }) } as never)) as ReactElement);
      verifier(html, p, [`/parc/${BIEN}/lots/${LOT}`, `/baux/${BAIL}/edl/edl-1`]);
      // L'adresse de retour de l'avis d'échéance : celle que FormulaireLoyers compose avec la racine que la page lui
      // transmet (sans elle, son défaut « agence » renverrait le propriétaire direct sous /agence).
      expect(html).toContain(`data-document="avis_echeance" data-retour="${p.racine}/${ORG}/baux/${BAIL}"`);
      // Les blocages du bail sont demandés sous la racine du profil.
      expect(banc.appelsAttendues).toEqual([expect.objectContaining({ racine: p.racine })]);
    });
  }
});

describe("bail en consultation superadmin", () => {
  for (const etat of ["brouillon", "actif", "preavis", "termine"]) it(`${etat} : données consultables sans aucune commande de gestion`, async () => {
    banc.donnees = {
      is_super_admin: true,
      organizations: {id:ORG, type:"proprietaire_direct",status:"active",name:"Parc témoin"},
      baux: {...Object.fromEntries(COLONNES_BAIL.map(c=>[c,null])), id:BAIL, type:"nu", etat, lot_id:LOT, loyer_hc:800, charges:50, date_debut:"2026-01-01", charges_mode:"provision"},
      lots: {id:LOT, nom:"Lot témoin",bien_id:BIEN,meuble:false,bien:{copropriete:false}},
      etats_des_lieux: [{id:"edl-1",type:"entree",etat:"brouillon"}],
      inventaire_lignes: [{id:"i",piece:"Chambre",designation:"Armoire témoin",quantite:1,etat:"bon"}],
      revisions_loyer:[{id:"r",date_effet:"2026-09-01",ancien_loyer:790,nouveau_loyer:800,irl_reference:100,irl_nouveau:101}],
      conges:[{par:"locataire",date_effet:"2026-12-01",preavis_mois:1,motif:"Départ témoin"}],
    };
    const html=await rendre(await PageBail({params:Promise.resolve({orgId:ORG,bailId:BAIL})} as never));
    expect(html).not.toMatch(/<(form|input|textarea|select)\b/);
    for(const texte of ["Enregistrer", "Modifier le bail", "Générer le PDF"])expect(html).not.toContain(texte);
    for(const texte of ["Lot témoin","Armoire témoin","Départ témoin"])expect(html).toContain(texte);
    expect(html).toContain(`/espace/${ORG}/baux/${BAIL}/edl/edl-1`);
    if(etat!=="brouillon")expect(html).toContain("Révision au");
  });
});

describe("loyers & charges", () => {
  it("agence (admin) : l'écran du mois, chaque lien sous /agence/<id>", async () => {
    const p = PROFILS[0];
    banc.donnees = { memberships: adhesion(p) };
    const html = await rendre((await PageLoyers({ params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never)) as ReactElement);
    verifier(html, p, ["/comptabilite", "/parc"]);
  });

  it("agent d'agence : même racine /agence/<id>", async () => {
    const p = { ...PROFILS[0], nom: "agent", role: "agent" } as unknown as Profil;
    banc.donnees = { memberships: adhesion(p), lots_de_mon_portefeuille: [] };
    const html = await rendre((await PageLoyers({ params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never)) as ReactElement);
    verifier(html, p, ["/comptabilite", "/parc"]);
  });

  it("propriétaire direct : « Finances » est servi à la place, sans aucune adresse /agence", async () => {
    const p = PROFILS[1];
    banc.donnees = { memberships: adhesion(p) };
    const html = await rendre((await PageLoyers({ params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never)) as ReactElement);
    expect(html).toContain("data-page-finances");
    expect(html).not.toContain(p.interdit);
  });
});

describe("incidents : la liste, le dossier ouvert, son volet artisan et la mise en concurrence", () => {
  for (const p of PROFILS) {
    it(`${p.nom} : chaque lien sous ${p.racine}/<id>, jamais ${p.interdit}`, async () => {
      banc.donnees = {
        memberships: adhesion(p),
        incidents: [{
          id: INCIDENT, organization_id: ORG, lot_id: LOT, numero: "INC-0001", categorie: "plomberie_canalisation", urgence: "normale",
          etat: "affecte", imputation: "proprietaire", created_at: "2026-10-01T08:00:00Z", responsable_account_id: null, canal: "espace_locataire",
          description: "Fuite TEST", lot: { id: LOT, nom: "Lot TEST", bien_id: BIEN }, declarant: { id: LOCATAIRE, nom: "Martin", prenom: "Léa", telephone: null },
        }],
        // Le volet artisan : une mise en concurrence ouverte sans artisan proposable (« Enregistrez une entreprise dans
        // votre carnet » pour une agence, « Invitez un artisan » pour le propriétaire direct), et la mission précédente,
        // terminée, avec sa photo de chantier.
        incident_consultations: [{ id: "c-1", metier: "plomberie", nature_travaux: "entretien_courant", decennale_requise: false, devis_unique_assume: false, validite_jours: 30, statut: "ouverte", created_at: "2026-10-02T08:00:00Z" }],
        incident_interventions: [{ id: MISSION, artisan_id: "art-1", devis_id: null, nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-09-01T08:00:00Z", acceptee_le: null, refusee_le: null, refus_motif: null, debut_prevu: null, fin_prevue: null, demarree_le: null, terminee_le: "2026-09-10T08:00:00Z", annulation_motif: null }],
        intervention_photos: [{ id: "ph-1", intervention_id: MISSION, document_id: PHOTO, moment: "apres" }],
        artisan_evaluations: [{ id: "ev-1", intervention_id: MISSION, source: "gerant", note_globale: 4, retiree_le: null }],
        lots: { bien_id: BIEN },
      };
      const html = await rendre((await PageIncidents({
        params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({ sel: INCIDENT }),
      } as never)) as ReactElement);
      verifier(html, p, [
        // la page (liste, création, réseau ou carnet)
        "/incidents/nouveau", `/incidents?sel=${INCIDENT}`,
        // le dossier ouvert (PaneIncident)
        `/parc/${BIEN}/lots/${LOT}`, `/personnes/${LOCATAIRE}#messages`,
        // le volet artisan (VoletArtisan) et la mise en concurrence (ConsultationOuverte) ; sans artisan proposable, le
        // propriétaire direct est mené au formulaire d'invitation de son carnet (décision du 15/10/2026, lot
        // invitation-artisan), l'agence à son carnet (« Enregistrez une entreprise »)
        `/documents/${PHOTO}/fichier`, p.racine === "/espace" ? "/artisans#inviter-un-artisan" : "/artisans",
      ]);
    });
  }
});

describe("alertes : la liste reçoit le drapeau de la garde", () => {
  for (const p of PROFILS) {
    it(`${p.nom} : « Traiter » et les fiches sous ${p.racine}/<id>, jamais ${p.interdit}`, async () => {
      const alerte = (id: string, type: string, details: Ligne) => ({
        id, type, criticite: "normale", titre: `Alerte TEST ${id}`, echeance: null, created_at: "2026-10-01T08:00:00Z", statut: "ouverte",
        assignee_account_id: null, assigned_all: true, escalades: null, details, ferme_le: null, fermee_le: null,
      });
      banc.donnees = {
        memberships: adhesion(p),
        alerts: [alerte("al-1", "loyer_impaye", { bail_id: BAIL }), alerte("al-2", "assurance_expiration", { person_id: LOCATAIRE })],
      };
      const html = await rendre((await PageAlertes({ params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never)) as ReactElement);
      verifier(html, p, [`/baux/${BAIL}#loyers`, `/personnes/${LOCATAIRE}#pieces`]);
    });
  }
});

describe("parc : la fenêtre du lot reçoit le drapeau de la garde", () => {
  for (const p of PROFILS) {
    it(`${p.nom} : liens sous ${p.racine}/<id>, fenêtre du lot ${p.type === "agence" ? "d'agence" : "du propriétaire direct"}`, async () => {
      banc.donnees = {
        memberships: adhesion(p),
        biens: [{ id: BIEN, nom: "Bien TEST", adresse: "1 rue TEST", code_postal: "75001", ville: "Paris", archive: false, lots: [{ id: LOT, nom: "Lot TEST", etat: "disponible", bien_id: BIEN, surface_m2: 30 }] }],
      };
      const html = await rendre((await PageParc({ params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never)) as ReactElement);
      verifier(html, p, ["/parc/nouveau"]);
      expect(html).toContain(`data-fenetre-lot="${p.type === "proprietaire_direct"}"`);
    });
  }
});

describe("invitation du locataire : la base vient du contexte posé par le layout", () => {
  for (const p of PROFILS) {
    it(`${p.nom} : « Ajouter un email » sous ${p.racine}/<id>`, async () => {
      const html = await rendre(createElement(FournisseurRacineEspace, { racine: p.racine },
        createElement(FormulaireInvitation, { orgId: ORG, personId: LOCATAIRE, email: null, dejaInvite: false })));
      verifier(html, p, [`/personnes/${LOCATAIRE}?modifier=1#identite`]);
    });
  }
});
