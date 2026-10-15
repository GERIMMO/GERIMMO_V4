/**
 * Décision D27 : le CHOIX de la racine dans les gestes serveur, testé dans les deux profils.
 *
 * Le balayage (liens-espace-proprietaire.test.ts) ne voit que la disparition du motif littéral « /agence/${…} » : il ne
 * dit rien du booléen passé à baseEspace. Or une INVERSION enverrait une agence sur /espace/<agence>, que le proxy sert
 * en « introuvable » (404). Ici, chaque geste est exécuté pour une agence ET pour un propriétaire direct, et chaque test
 * affirme qu'une agence n'obtient JAMAIS /espace (et qu'un propriétaire direct n'est pas renvoyé sous /agence).
 *
 * Gestes couverts : creerBien et ouvrirIncident (redirection après création), rechercherDansEspace (adresses des
 * résultats), chargerSyntheseAlertes (drapeau lu du TYPE de l'organisation), envoyerAvisCapaciteDepassee (lien du
 * courrier), et — relecture du 15/10, mutations survivantes — creerPersonne et archiverPersonne (redirections),
 * creerEdl (grille ouverte), remplacerDocument (nouvelle version ouverte), deposerBailSigne (liens « à corriger » des
 * blocages de mise en location et des mentions obligatoires manquantes). Les gestes d'abonnement sont dans
 * racine-abonnement.test.ts ; la coquille et « Mes espaces » dans racine-coquille-espace.test.ts ; les écrans rendus
 * (alertes, console, quittance) dans racine-rendus-serveur.test.ts ; les pages, par lecture du code, dans
 * racine-pages-espace.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ligne = Record<string, unknown>;
const m = vi.hoisted(() => ({
  verifierGerant: vi.fn(),
  acces: vi.fn(),
  portefeuille: vi.fn(),
  envoyer: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect, unstable_rethrow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.verifierGerant, verifierLocataire: vi.fn() }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn(), preparerFichierGed: vi.fn(), abandonnerPieceGed: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: m.acces }));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: m.portefeuille, PortefeuilleIndisponible: class extends Set {} }));
vi.mock("@/lib/email", () => ({ envoyerEmail: m.envoyer }));

import { creerBien } from "@/app/actions/parc";
import { ouvrirIncident } from "@/app/actions/incidents";
import { rechercherDansEspace } from "@/app/actions/recherche-espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { envoyerAvisCapaciteDepassee } from "@/lib/avis-abonnement";
import { archiverPersonne, creerPersonne } from "@/app/actions/personnes";
import { creerEdl } from "@/app/actions/edl";
import { remplacerDocument } from "@/app/actions/documents-ged";
import { deposerBailSigne } from "@/app/actions/baux";

const ORG = "org-test";
const PROFILS = [
  { nom: "agence (admin)", role: "admin_agence", proprietaire: false, attendu: `/agence/${ORG}`, interdit: "/espace/" },
  { nom: "agence (agent)", role: "agent", proprietaire: false, attendu: `/agence/${ORG}`, interdit: "/espace/" },
  { nom: "propriétaire direct", role: "proprietaire_direct", proprietaire: true, attendu: `/espace/${ORG}`, interdit: "/agence/" },
] as const;

/** Une requête PostgREST factice : toute méthode chaîne, l'attente rend `donnees`, maybeSingle la première ligne. */
function requete(donnees: Ligne[]): unknown {
  const q: unknown = new Proxy({}, {
    get(_cible, prop) {
      if (prop === "then") return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: donnees, error: null, count: donnees.length }).then(ok, ko);
      if (prop === "maybeSingle" || prop === "single") return async () => ({ data: donnees[0] ?? null, error: null });
      return () => q;
    },
  });
  return q;
}
function base(tables: Record<string, Ligne[]>) {
  return { from: (t: string) => requete(tables[t] ?? []), rpc: (n: string) => requete(tables[n] ?? []) };
}
async function urlDeRedirection(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("aucune redirection");
}

beforeEach(() => {
  vi.clearAllMocks();
  m.envoyer.mockResolvedValue({ id: "courriel-1" });
});

describe("creerBien : la fiche créée s'ouvre sous la racine du profil", () => {
  function saisie(): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      creation_id: "48d3f344-e341-4b50-977a-cc06c07eebfa", nom: "TEST Racine", type: "appartement", address_line1: "1 rue TEST",
      postal_code: "75001", city: "Paris", annee_construction: "1990", parties_communes: "Hall", acces_tic: "Fibre",
      surface_m2: "42.25", pieces: "2", lots: JSON.stringify([{ nom: "TEST Lot", surface: "42.25", pieces: "2" }]),
    })) f.set(k, v);
    return f;
  }
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/parc/…`, async () => {
      const rpc = vi.fn(async () => ({ data: { bien_id: "bien-1", lot_unique_id: "lot-1", saisie_differente: false }, error: null }));
      m.verifierGerant.mockResolvedValue({ supabase: { rpc, from: vi.fn() }, user: { id: "compte" }, role: p.role });
      const url = await urlDeRedirection(creerBien(ORG, {}, saisie()));
      expect(url).toBe(`${p.attendu}/parc/bien-1/lots/lot-1`);
      expect(url).not.toContain(p.interdit);
      // Les deux autres sorties (confirmation pour le brouillon, reprise d'une demande déjà créée) suivent la même base.
      const confirmee = saisie();
      confirmee.set("confirmation_creation", "1");
      expect((await creerBien(ORG, {}, confirmee)).creationConfirmeeHref).toBe(`${p.attendu}/parc/bien-1/lots/lot-1`);
      rpc.mockResolvedValue({ data: { bien_id: "bien-1", lot_unique_id: null, saisie_differente: true }, error: null } as never);
      expect((await creerBien(ORG, {}, saisie())).repriseHref).toBe(`${p.attendu}/parc/bien-1`);
    });
  }
});

describe("ouvrirIncident : la fiche de l'incident saisi s'ouvre sous la racine du profil", () => {
  function declaration(): FormData {
    const f = new FormData();
    f.set("lot", "lot-1");
    f.set("categorie", "plomberie_canalisation");
    f.set("description", "Fuite sous l'évier de la cuisine");
    f.set("urgence", "normale");
    return f;
  }
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/incidents?sel=…`, async () => {
      const rpc = vi.fn(async () => ({ data: "inc-9", error: null }));
      m.verifierGerant.mockResolvedValue({ supabase: { rpc, from: vi.fn() }, user: { id: "compte" }, role: p.role });
      const url = await urlDeRedirection(ouvrirIncident(ORG, {}, declaration()));
      expect(rpc).toHaveBeenCalledWith("ouvrir_incident_agence", expect.objectContaining({ p_org: ORG, p_lot: "lot-1" }));
      expect(url).toBe(`${p.attendu}/incidents?sel=inc-9`);
      expect(url).not.toContain(p.interdit);
    });
  }
});

describe("rechercherDansEspace : chaque résultat mène sous la racine du profil", () => {
  const tables = {
    lots: [{ id: "lot-1", nom: "Lot TEST", bien_id: "bien-1", etat: "loue", bien: { nom: "Maison", address_line1: "1 rue TEST", postal_code: "75001", city: "Paris" } }],
    biens: [{ id: "bien-1" }],
    persons: [{ id: "pers-1", nom: "Dupont", prenom: "Alice", email: "alice@example.invalid" }],
    baux: [{ id: "bail-1", lot_id: "lot-1", locataire_principal: "pers-1", etat: "actif" }],
    documents_courants: [{ id: "doc-1", titre: "Bail TEST", type: "bail" }],
    incidents: [{ id: "inc-1", numero: "INC-1", description: "Fuite TEST", etat: "declare" }],
    artisan_agences: [{ artisan_id: "art-1" }],
    artisans: [{ id: "art-1", raison_sociale: "TEST Plomberie", siret: "00000000000000", email: "artisan@example.invalid" }],
    encaissements: [{ id: "enc-1", bail_id: "bail-1", montant: "650.00", date_paiement: "2026-10-05", mode: "virement", note: null }],
  };
  for (const p of PROFILS) {
    it(`${p.nom} : les huit sortes de résultats sous ${p.attendu}`, async () => {
      // Le propriétaire direct voit tout son parc (portefeuille null) ; l'agent, son portefeuille.
      m.acces.mockResolvedValue({ supabase: base(tables), user: { id: "compte" }, role: p.role, estProprietaire: p.proprietaire });
      m.portefeuille.mockResolvedValue(p.role === "agent" ? new Set(["lot-1"]) : null);
      const r = await rechercherDansEspace(ORG, "test");
      expect(r.erreur).toBeUndefined();
      expect(new Set(r.resultats.map((x) => x.type))).toEqual(new Set(["Logement", "Personne", "Bail", "Document", "Incident", "Artisan", "Paiement"]));
      for (const x of r.resultats) {
        expect(x.href.startsWith(`${p.attendu}/`), `${x.type} : ${x.href}`).toBe(true);
        expect(x.href, x.type).not.toContain(p.interdit);
      }
    });
  }
});

describe("chargerSyntheseAlertes : le drapeau propriétaire direct se lit du TYPE de l'organisation", () => {
  it("vrai pour une organisation de propriétaire direct, faux pour une agence ou un type illisible", async () => {
    const lignes = [
      { id: "a1", type: "loyer_impaye", organization_id: "o-pd", organization: { name: "Parc TEST", type: "proprietaire_direct" } },
      { id: "a2", type: "loyer_impaye", organization_id: "o-ag", organization: { name: "Agence TEST", type: "agence" } },
      { id: "a3", type: "loyer_impaye", organization_id: "o-x", organization: null },
    ];
    const client = { auth: { getUser: async () => ({ data: { user: { id: "compte" } } }) }, from: () => requete(lignes) } as unknown as SupabaseClient;
    const alertes = await chargerSyntheseAlertes(client, { toutes: true });
    expect(Object.fromEntries(alertes.map((a) => [a.id, a.proprietaire_direct]))).toEqual({ a1: true, a2: false, a3: false });
  });
});

describe("envoyerAvisCapaciteDepassee : le lien du courrier suit le profil", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gerimmo.test"));
  const client = { rpc: async () => ({ data: "facturation@example.invalid", error: null }) } as unknown as SupabaseClient;
  const avis = { orgId: ORG, organisation: "Organisation TEST", capacite: 3, aCouvrir: 5, echeance: "2026-11-02T00:00:00Z" };

  it("agence → /agence/<id>/abonnement, jamais /espace", async () => {
    expect(await envoyerAvisCapaciteDepassee(client, { ...avis, estAgence: true })).toBeNull();
    const html = (m.envoyer.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain(`https://gerimmo.test/agence/${ORG}/abonnement`);
    expect(html).not.toContain("/espace/");
  });

  it("propriétaire direct → /espace/<id>/abonnement, jamais /agence", async () => {
    expect(await envoyerAvisCapaciteDepassee(client, { ...avis, estAgence: false })).toBeNull();
    const html = (m.envoyer.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain(`https://gerimmo.test/espace/${ORG}/abonnement`);
    expect(html).not.toContain("/agence/");
  });
});

/**
 * Un client PostgREST factice qui distingue les écritures : `reponse(nom, ecriture)` donne la réponse d'une table
 * (`from`) ou d'une fonction (`rpc`) ; `ecriture` vaut « insert », « update » ou null pour une lecture. Une liste se
 * lit telle quelle, `maybeSingle` / `single` en prennent la première ligne. Le stockage accepte tout dépôt.
 */
type Reponse = { data?: unknown; error?: { message: string; code?: string } | null };
function scenario(reponse: (nom: string, ecriture: "insert" | "update" | null) => Reponse) {
  const chaine = (nom: string) => {
    let ecriture: "insert" | "update" | null = null;
    const lire = () => ({ data: null, error: null, ...reponse(nom, ecriture) });
    const q: unknown = new Proxy({}, {
      get(_c, prop) {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(lire()).then(ok, ko);
        if (prop === "maybeSingle" || prop === "single") {
          return async () => { const r = lire(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; };
        }
        if (prop === "insert" || prop === "update") return () => { ecriture = prop; return q; };
        return () => q;
      },
    });
    return q;
  };
  return { from: chaine, rpc: chaine, storage: { from: () => ({ upload: async () => ({ data: {}, error: null }) }) } };
}
function gerant(role: string, client: unknown) {
  m.verifierGerant.mockResolvedValue({ supabase: client, user: { id: "compte" }, role });
}
/** Un PDF minimal (« %PDF- » … « %%EOF ») : le type réel est lu dans le contenu, pas dans le nom. */
function pdf(nom: string, marque: string): File {
  return new File([new TextEncoder().encode(`%PDF-1.4\n% ${marque}\n%%EOF\n`)], nom, { type: "application/pdf" });
}

describe("creerPersonne : la fiche créée s'ouvre sous la racine du profil", () => {
  function saisie(): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      nom: "TEST Racine", prenom: "Alice", email: "alice.racine@example.invalid", date_naissance: "1980-04-12",
      commune_naissance: "Lyon", address_line1: "1 rue TEST", postal_code: "69001", city: "Lyon",
    })) f.set(k, v);
    return f;
  }
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/personnes/<fiche>`, async () => {
      // Aucune fiche ne porte l'adresse, aucun homonyme ; l'insertion rend la nouvelle fiche.
      gerant(p.role, scenario((nom, ecriture) => (nom === "persons" && ecriture === "insert" ? { data: { id: "pers-9" } } : { data: [] })));
      const url = await urlDeRedirection(creerPersonne(ORG, {}, saisie()));
      expect(url).toBe(`${p.attendu}/personnes/pers-9`);
      expect(url).not.toContain(p.interdit);
    });
  }
});

describe("archiverPersonne : retour à l'annuaire sous la racine du profil", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/personnes`, async () => {
      // Fiche sans compte ni lien vivant (détention, mandat, bail) : l'archivage passe.
      gerant(p.role, scenario((nom, ecriture) =>
        nom === "persons" && !ecriture ? { data: [{ account_id: null, archived_at: null }] } : { data: [] }));
      const url = await urlDeRedirection(archiverPersonne(ORG, "pers-1", {}, new FormData()));
      expect(url).toBe(`${p.attendu}/personnes`);
      expect(url).not.toContain(p.interdit);
    });
  }
});

describe("creerEdl : la grille de l'état des lieux s'ouvre sous la racine du profil", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/baux/<bail>/edl/<edl>`, async () => {
      gerant(p.role, scenario((nom, ecriture) => (nom === "etats_des_lieux" && ecriture === "insert" ? { data: { id: "edl-1" } } : { data: null })));
      const f = new FormData();
      f.set("type", "entree");
      const url = await urlDeRedirection(creerEdl(ORG, "bail-1", {}, f));
      expect(url).toBe(`${p.attendu}/baux/bail-1/edl/edl-1`);
      expect(url).not.toContain(p.interdit);
    });
  }
});

describe("remplacerDocument : la nouvelle version s'ouvre sous la racine du profil", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/documents?sel=<version>`, async () => {
      // Aucun doublon d'empreinte ; la fonction de remplacement rend la nouvelle version.
      gerant(p.role, scenario((nom) => (nom === "remplacer_document_ged" ? { data: "doc-2" } : { data: null })));
      const f = new FormData();
      f.set("fichier", pdf("attestation.pdf", p.role));
      f.set("titre", "Attestation TEST");
      const url = await urlDeRedirection(remplacerDocument(ORG, "doc-1", {}, f));
      expect(url).toBe(`${p.attendu}/documents?sel=doc-2`);
      expect(url).not.toContain(p.interdit);
    });
  }
});

describe("deposerBailSigne : les liens « à corriger » d'une mise en location refusée", () => {
  function depot(): FormData {
    const f = new FormData();
    f.set("fichier", pdf("bail-signe.pdf", "bail"));
    return f;
  }
  for (const p of PROFILS) {
    it(`${p.nom} : blocages du lot → ${p.attendu}/parc/<bien>/lots/<lot>#…`, async () => {
      gerant(p.role, scenario((nom) => {
        if (nom === "controler_mise_en_location") return { error: { message: "Mise en location bloquée : surface, DPE" } };
        if (nom === "baux") return { data: [{ lot_id: "lot-1" }] };
        if (nom === "lots") return { data: [{ id: "lot-1", bien_id: "bien-1" }] };
        if (nom === "lot_blocages_location") return { data: ["Surface habitable non renseignée", "DPE manquant"] };
        return { data: null };
      }));
      const r = await deposerBailSigne(ORG, "bail-1", {}, depot());
      expect(r.erreur).toBe("Mise en location bloquée — à corriger :");
      expect(r.blocages?.map((b) => b.href)).toEqual([
        `${p.attendu}/parc/bien-1/lots/lot-1#caracteristiques`,
        `${p.attendu}/parc/bien-1/lots/lot-1#diagnostics`,
      ]);
      for (const b of r.blocages ?? []) expect(b.href).not.toContain(p.interdit);
    });

    it(`${p.nom} : mentions obligatoires manquantes → ${p.attendu}/baux/<bail>#corriger`, async () => {
      gerant(p.role, scenario((nom) => {
        if (nom === "controler_mise_en_location") return { error: { message: "Mentions obligatoires du contrat manquantes" } };
        if (nom === "baux") return { data: [{ locataire_principal: null, date_debut: null, loyer_hc: null }] };
        return { data: null };
      }));
      const r = await deposerBailSigne(ORG, "bail-1", {}, depot());
      expect(r.blocages).toHaveLength(3);
      for (const b of r.blocages ?? []) {
        expect(b.href).toBe(`${p.attendu}/baux/bail-1#corriger`);
        expect(b.href).not.toContain(p.interdit);
      }
    });
  }
});
