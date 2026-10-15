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
 * courrier). Le retour de paiement et la confirmation de hausse sont dans racine-abonnement.test.ts ; la coquille et
 * « Mes espaces » dans racine-coquille-espace.test.ts.
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
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: m.acces }));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: m.portefeuille, PortefeuilleIndisponible: class extends Set {} }));
vi.mock("@/lib/email", () => ({ envoyerEmail: m.envoyer }));

import { creerBien } from "@/app/actions/parc";
import { ouvrirIncident } from "@/app/actions/incidents";
import { rechercherDansEspace } from "@/app/actions/recherche-espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { envoyerAvisCapaciteDepassee } from "@/lib/avis-abonnement";

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
