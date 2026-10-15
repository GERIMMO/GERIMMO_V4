/**
 * Décision D27 : la coquille de l'espace de gestion (layout), l'accueil du propriétaire direct et « Mes espaces »
 * choisissent la racine d'après le profil — rendus pour une agence ET pour un propriétaire direct.
 *
 * Le balayage du code ne voit pas un booléen inversé : la coquille d'une agence qui donnerait « /espace » à son
 * contexte, à sa barre latérale ou à sa recherche enverrait chaque clic sur /espace/<agence>, servi en « introuvable »
 * (404). Les composants client de la coquille sont remplacés par des témoins qui affichent la racine reçue ; le
 * fournisseur de contexte, lui, est le vrai, lu par un enfant qui appelle useRacineEspace / useBaseEspace.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const m = vi.hoisted(() => ({
  acces: vi.fn(),
  compter: vi.fn(),
  charger: vi.fn(),
  client: null as unknown,
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

/** Toutes les adresses de gestion (/agence/… ou /espace/…) contenues dans une valeur quelconque. */
function adresses(v: unknown): string[] {
  if (typeof v === "string") return /^\/(agence|espace)\//.test(v) ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(adresses);
  if (v && typeof v === "object") return Object.values(v).flatMap(adresses);
  return [];
}

vi.mock("next/navigation", () => ({ redirect: m.redirect, usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: m.acces }));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: async () => null }));
vi.mock("@/lib/alertes", () => ({ chargerSyntheseAlertes: async () => [] }));
vi.mock("@/lib/messagerie", () => ({ totalMessagesNonLus: async () => 0 }));
vi.mock("@/lib/actions-du-jour", () => ({ compterActionsDuJour: m.compter, chargerActionsDuJour: m.charger }));
vi.mock("@/lib/identite-compte", () => ({ identiteDuCompte: async () => ({ prenom: "Claire" }), initialesDe: () => "CM" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => m.client }));
vi.mock("@/components/barre-laterale", () => ({
  BarreLaterale: (p: { racine: string; navigation: unknown; essai: { href: string } | null }) =>
    createElement("nav", { "data-barre": p.racine, "data-essai": p.essai?.href ?? "", "data-liens": adresses(p.navigation).join(" ") }),
  BarreBasse: (p: { racine: string; navigation: unknown }) =>
    createElement("footer", { "data-barre-basse": p.racine, "data-liens": adresses(p.navigation).join(" ") }),
}));
vi.mock("@/components/recherche-espace", () => ({ RechercheEspace: (p: { racine: string }) => createElement("search", { "data-recherche": p.racine }) }));
vi.mock("@/components/synthese-alertes", () => ({ SyntheseAlertes: () => null }));
vi.mock("@/components/menu-compte", () => ({
  MenuCompte: (p: { liens: { href: string; libelle: string }[] }) =>
    createElement("menu", null, ...p.liens.map((l) => createElement("a", { key: l.href, href: l.href }, l.libelle))),
}));
vi.mock("@/components/bouton-assistance", () => ({ LienAssistance: (p: { destination?: string }) => createElement("a", { "data-aide": p.destination ?? "" }) }));
vi.mock("@/components/ui/toast", () => ({ Toasteur: () => null }));
vi.mock("@/components/marque-organisation", () => ({ MarqueOrganisation: () => null }));
vi.mock("@/components/parcours-demarrage", () => ({ ParcoursDemarrage: () => null }));
vi.mock("@/app/agence/[orgId]/articles-accueil", () => ({ ArticlesAccueil: () => null }));

import LayoutAgence from "@/app/agence/[orgId]/layout";
import { AccueilProprietaire } from "@/app/agence/[orgId]/accueil-proprietaire";
import PageEspaces from "@/app/espaces/page";
import { useBaseEspace, useRacineEspace } from "@/components/racine-espace-contexte";

const ORG = "11111111-2222-4333-8444-555555555555";

/** Une requête PostgREST factice : toute méthode chaîne ; l'attente rend ce que `lire(table, filtres)` donne. */
function client(lire: (table: string, filtres: Record<string, unknown>) => Ligne[] | boolean, extra: Record<string, unknown> = {}) {
  const requete = (table: string) => {
    const filtres: Record<string, unknown> = {};
    const q: unknown = new Proxy({}, {
      get(_c, prop) {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: lire(table, filtres), error: null }).then(ok, ko);
        if (prop === "maybeSingle") return async () => { const d = lire(table, filtres); return { data: Array.isArray(d) ? d[0] ?? null : d, error: null }; };
        if (prop === "eq") return (c: string, v: unknown) => { filtres[c] = v; return q; };
        return () => q;
      },
    });
    return q;
  };
  return { from: requete, rpc: (nom: string) => requete(nom), ...extra };
}

function Enfant() {
  return createElement("i", { "data-contexte": useRacineEspace(), "data-base": useBaseEspace(ORG) });
}

const PROFILS = [
  { nom: "agence (admin)", role: "admin_agence", proprietaire: false, racine: "/agence", interdit: "/espace/" },
  { nom: "agence (agent)", role: "agent", proprietaire: false, racine: "/agence", interdit: "/espace/" },
  { nom: "propriétaire direct", role: "proprietaire_direct", proprietaire: true, racine: "/espace", interdit: "/agence/" },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.compter.mockResolvedValue({ total: 0, critiques: 0 });
});

describe("la coquille de l'espace (layout) : contexte, barres, recherche, menu du compte, aide et essai", () => {
  for (const p of PROFILS) {
    it(`${p.nom} : tout sous ${p.racine}/<id>, jamais ${p.interdit}`, async () => {
      const db = client((table) => (table === "memberships" ? [{ organization_id: ORG, organisation: { id: ORG, name: "Parc TEST", type: "proprietaire_direct" } }] : []));
      m.acces.mockResolvedValue({
        supabase: db, user: { id: "compte" }, role: p.role, estProprietaire: p.proprietaire,
        organisation: { id: ORG, name: "Organisation TEST", status: "essai", essai_fin: "2099-01-01", nom_portail: null, logo_url: null },
      });
      const html = renderToStaticMarkup((await LayoutAgence({ children: createElement(Enfant) as ReactNode, params: Promise.resolve({ orgId: ORG }) } as never)) as never);
      const base = `${p.racine}/${ORG}`;
      // Le contexte que lisent tous les composants client de l'espace.
      expect(html).toContain(`data-contexte="${p.racine}"`);
      expect(html).toContain(`data-base="${base}"`);
      // Barre latérale, barre basse, recherche.
      expect(html).toContain(`data-barre="${p.racine}"`);
      expect(html).toContain(`data-barre-basse="${p.racine}"`);
      expect(html).toContain(`data-recherche="${p.racine}"`);
      // Le plan du jour (pastille « Alertes ») compose ses liens sous la même racine.
      expect(m.compter).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ racine: p.racine }));
      // Menu du compte (profil), lien de l'essai (responsables seulement), entrées de navigation.
      expect(html).toContain(`href="${base}/profil"`);
      if (p.role !== "agent") expect(html).toContain(`data-essai="${base}/abonnement"`);
      const liens = [...html.matchAll(/data-liens="([^"]*)"/g)].flatMap((x) => x[1].split(" ").filter(Boolean));
      expect(liens.length).toBeGreaterThan(3);
      for (const l of liens) expect(l.startsWith(`${base}`), l).toBe(true);
      if (p.proprietaire) expect(html).toContain(`data-aide="${base}/faq"`);
      expect(html).not.toContain(p.interdit);
    });
  }
});

describe("l'accueil du propriétaire direct (servi au seul propriétaire direct)", () => {
  it("chaque lien de l'accueil, et le plan du jour qu'il lit, sont sous /espace/<id>", async () => {
    m.charger.mockResolvedValue({
      plan: {
        surLesBaux: [],
        enRetard: [{ source: "alerte", cle: "al-1", type: "assurance_expiration", titre: "Assurance TEST", detail: null, echeance: null, criticite: "normale", href: null, alerte: { id: "al-1" } }],
        aVenir: [],
        total: 1,
      },
      erreurs: { alertes: false, rapports: false },
    });
    const db = client((table) => (table === "lots" ? [{ id: "lot-1", nom: "Lot TEST", etat: "disponible", bien_id: "bien-1" }] : []));
    const html = renderToStaticMarkup((await AccueilProprietaire({ supabase: db as never, orgId: ORG, organisation: { name: "Parc TEST", status: "active", essai_fin: null }, userId: "compte" })) as never);
    expect(m.charger).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ racine: "/espace" }));
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]).filter((h) => h.startsWith("/agence") || h.startsWith("/espace"));
    // Encaissé, lots, récapitulatif fiscal, alertes, rang « Traiter », lots sans bail, abonnement.
    expect(hrefs).toEqual(expect.arrayContaining([
      `/espace/${ORG}/loyers`, `/espace/${ORG}/parc`, `/espace/${ORG}/comptabilite/fiscal`, `/espace/${ORG}/alertes`,
      `/espace/${ORG}/alertes?traiter=al-1`, `/espace/${ORG}/parc/bien-1/lots/lot-1#baux`, `/espace/${ORG}/abonnement`,
    ]));
    for (const h of hrefs) expect(h.startsWith(`/espace/${ORG}`), h).toBe(true);
  });
});

describe("« Mes espaces » : l'entrée directe d'un compte à une seule adhésion", () => {
  function compte(role: string) {
    return client(
      // Pas de relais de supervision (`has_supervision_power` faux), pas d'invitation, pas d'artisan, pas d'ancien bail.
      (table, filtres) => table === "has_supervision_power" ? false
        : table === "memberships" && filtres.status === "active" ? [{ id: "m-1", role, organization: { id: ORG, name: "Organisation TEST" } }] : [],
      { auth: { getUser: async () => ({ data: { user: { id: "compte", user_metadata: {} } } }) } },
    );
  }
  for (const [role, attendu, interdit] of [
    ["admin_agence", `/agence/${ORG}`, "/espace/"],
    ["agent", `/agence/${ORG}`, "/espace/"],
    ["proprietaire_direct", `/espace/${ORG}`, "/agence/"],
  ] as const) {
    it(`${role} → ${attendu}`, async () => {
      m.client = compte(role);
      const echec = await PageEspaces().then(() => null, (e: { url?: string }) => e);
      expect(echec?.url).toBe(attendu);
      expect(echec?.url).not.toContain(interdit);
    });
  }
});
