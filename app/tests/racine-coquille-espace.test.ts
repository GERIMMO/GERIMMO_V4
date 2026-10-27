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
  alertes: vi.fn(async () => []),
  compter: vi.fn(),
  charger: vi.fn(),
  carte: vi.fn(),
  rappels: vi.fn(),
  navigation: vi.fn(),
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
vi.mock("@/lib/alertes", () => ({ chargerSyntheseAlertes: m.alertes }));
vi.mock("@/lib/messagerie", () => ({ totalMessagesNonLus: async () => 0 }));
vi.mock("@/lib/actions-du-jour", () => ({ compterActionsDuJour: m.compter, chargerActionsDuJour: m.charger }));
vi.mock("@/lib/identite-compte", () => ({ identiteDuCompte: async () => ({ prenom: "Claire" }), initialesDe: () => "CM" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => m.client }));
vi.mock("@/components/barre-laterale", () => ({
  BarreLaterale: (p: { racine: string; navigation: unknown; essai: { href: string } | null }) => {
    m.navigation(p.navigation);
    return createElement("nav", { "data-barre": p.racine, "data-essai": p.essai?.href ?? "", "data-liens": adresses(p.navigation).join(" ") });
  },
  BarreBasse: (p: { racine: string; navigation: unknown }) =>
    createElement("footer", { "data-barre-basse": p.racine, "data-liens": adresses(p.navigation).join(" ") }),
}));
vi.mock("@/components/recherche-espace", () => ({ RechercheEspace: (p: { racine: string }) => createElement("search", { "data-recherche": p.racine }) }));
vi.mock("@/components/synthese-alertes", () => ({ SyntheseAlertes: () => createElement("div", { "data-alertes-client": true }) }));
vi.mock("@/components/menu-compte", () => ({
  MenuCompte: (p: { liens: { href: string; libelle: string }[] }) =>
    createElement("menu", null, ...p.liens.map((l) => createElement("a", { key: l.href, href: l.href }, l.libelle))),
}));
vi.mock("@/components/bouton-assistance", () => ({ LienAssistance: (p: { destination?: string }) => createElement("a", { "data-aide": p.destination ?? "" }) }));
vi.mock("@/components/ui/toast", () => ({ Toasteur: () => null }));
vi.mock("@/components/marque-organisation", () => ({ MarqueOrganisation: () => null }));
// 24/10 (plan de conformité, R19) : l'écran d'une nouvelle version des conditions est un composant serveur asynchrone,
// éprouvé par tests/conditions-acceptation.test.ts ; il ne porte aucune adresse de gestion.
vi.mock("@/components/nouvelle-version-conditions", () => ({ NouvelleVersionConditions: () => null }));
vi.mock("@/components/parcours-demarrage", () => ({ ParcoursDemarrage: () => null }));
vi.mock("@/app/agence/[orgId]/articles-accueil", () => ({ ArticlesAccueil: () => null }));
// Composant serveur asynchrone : ses échéances et adresses ont leur recette dédiée.
vi.mock("@/components/rappels-loyers", () => ({ RappelsLoyers: (p: { lectureSeule: boolean }) => {
  m.rappels(p);
  return createElement("div", { "data-rappels-loyers": true });
} }));
// La fenêtre est fermée au premier rendu réel. Ce témoin expose son contenu serveur
// pour vérifier les destinations, et conserve les compteurs transmis à la carte.
vi.mock("@/components/carte-verifications", () => ({
  CarteVerifications: (p: { children: ReactNode }) => {
    m.carte(p);
    return createElement("div", { "data-demandes": true }, p.children);
  },
}));

import LayoutAgence from "@/app/agence/[orgId]/layout";
import { AccueilProprietaire } from "@/app/agence/[orgId]/accueil-proprietaire";
import PageEspaces from "@/app/espaces/page";
import { useBaseEspace, useRacineEspace } from "@/components/racine-espace-contexte";
import { aujourdhuiParis } from "@/lib/ged";

const ORG = "11111111-2222-4333-8444-555555555555";

/** Une requête PostgREST factice : toute méthode chaîne ; l'attente rend ce que `lire(table, filtres)` donne. */
function client(lire: (table: string, filtres: Record<string, unknown>) => Ligne[] | boolean, extra: Record<string, unknown> = {}) {
  const requete = (table: string) => {
    const filtres: Record<string, unknown> = {};
    const q: unknown = new Proxy({}, {
      get(_c, prop) {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(() => { const data = lire(table, filtres); return { data, error: null, count: Array.isArray(data) ? data.length : null }; }).then(ok, ko);
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
  m.charger.mockResolvedValue({ plan: { surLesBaux: [], enRetard: [], aVenir: [], total: 0, critiques: 0 }, attendues: [], erreurs: { baux: false, alertes: false, rapports: false } });
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
      // Le plan du jour (pastille « Alertes ») compose ses liens sous la même racine. Le menu du propriétaire direct n'a
      // pas cette pastille : le layout ne calcule pas ses vérifications (audit du 27/10, LAT-08).
      if (p.proprietaire) expect(m.charger).not.toHaveBeenCalled();
      else expect(m.compter).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ racine: p.racine }));
      // Menu du compte (profil), lien de l'essai (responsables seulement), entrées de navigation.
      expect(html).toContain(`href="${base}/profil"`);
      if (p.role !== "agent") expect(html).toContain(`data-essai="${base}/abonnement"`);
      const liens = [...html.matchAll(/data-liens="([^"]*)"/g)].flatMap((x) => x[1].split(" ").filter(Boolean));
      expect(liens.length).toBeGreaterThan(3);
      for (const l of liens) expect(l.startsWith(`${base}`), l).toBe(true);
      if (p.proprietaire) expect(html).not.toContain("data-aide=");
      else expect(html).toContain('data-aide=""');
      expect(html).not.toContain(p.interdit);
    });
  }
});

it("le menu propriétaire ne duplique plus les tâches du tableau de bord", async () => {
  const lues: string[] = [];
  const db = client(table => (lues.push(table), table) === "rappels_loyers_proprietaire" ? [{
    appel_id: "appel", bail_id: "bail", lot_nom: "Appartement", locataire: "Camille", periode: "2020-01-01",
    date_echeance: aujourdhuiParis(), montant_du: 800, montant_couvert: 0, non_recu_signale_le: null,
  }] : []);
  m.acces.mockResolvedValue({ supabase: db, user: { id: "compte" }, role: "proprietaire_direct", estProprietaire: true,
    organisation: { id: ORG, name: "Parc", status: "active", essai_fin: null } });
  renderToStaticMarkup(await LayoutAgence({ children: null, params: Promise.resolve({ orgId: ORG }) } as never));
  expect(m.navigation).toHaveBeenCalledWith(expect.objectContaining({
    principales: expect.not.arrayContaining([expect.objectContaining({ libelle: "À faire" })]),
  }));
  expect(m.compter).not.toHaveBeenCalled();
  // Ni plan du jour ni rappels de loyers : aucune pastille ne les affiche dans ce menu (audit du 27/10, LAT-08).
  expect(m.charger).not.toHaveBeenCalled();
  expect(lues).not.toContain("rappels_loyers_proprietaire");
});

it("la consultation superadmin ne reçoit pas les alertes ni l'identité du propriétaire", async () => {
  m.acces.mockResolvedValue({
    supabase: client(() => []), user: { id: "superviseur" }, role: "proprietaire_direct", estProprietaire: true,
    traverseeLectureSeule: true, organisation: { id: ORG, name: "Client TEST", status: "essai", essai_fin: "2099-01-01" },
  });
  const html = renderToStaticMarkup((await LayoutAgence({ children: null, params: Promise.resolve({ orgId: ORG }) } as never)) as never);
  expect(m.alertes).not.toHaveBeenCalled();
  expect(html).not.toContain("data-alertes-client");
  expect(html).toContain("Consultation superadmin · lecture seule");
  expect(html).toContain("Revenir au superadmin");
  expect(html).toContain('data-essai=""');
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
    const db = client((table) => table === "biens" ? [{ id: "bien-1" }] : table === "lots" ? [{ id: "lot-1", nom: "Lot TEST", etat: "disponible", bien_id: "bien-1" }] : []);
    const html = renderToStaticMarkup((await AccueilProprietaire({ supabase: db as never, orgId: ORG, organisation: { name: "Parc TEST", status: "active", essai_fin: null }, userId: "compte" })) as never);
    expect(m.charger).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ racine: "/espace" }));
    // Audit du 27/10 (LAT-05) : la carte annonce le chiffre de « Mes tâches » (l'alerte et le lot sans bail).
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ base: `/espace/${ORG}`, total: 2, loyersAConfirmer: 0, indisponible: false }));
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]).filter((h) => h.startsWith("/agence") || h.startsWith("/espace"));
    // Encaissé, lots, récapitulatif fiscal, alertes, rang « Traiter », lots sans bail et réglages.
    expect(hrefs).toEqual(expect.arrayContaining([
      // L'encaissé du mois mène aux recettes datées de Finances (audit du 27/10, LAT-06).
      `/espace/${ORG}/loyers#operations`, `/espace/${ORG}/parc`, `/espace/${ORG}/comptabilite/fiscal`, `/espace/${ORG}/alertes`,
      `/espace/${ORG}/alertes?traiter=al-1`, `/espace/${ORG}/parc/bien-1/lots/lot-1#baux`, `/espace/${ORG}/profil#envois`,
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


describe("accueil : un seul geste pour chaque loyer à confirmer", () => {
  const rappel = { appel_id: "appel", bail_id: "bail-1", lot_nom: "Appartement", locataire: "Camille", periode: "2020-01-01", date_echeance: "2020-01-05", montant_du: 800, montant_couvert: 0, non_recu_signale_le: null };
  async function rendre(patch = {}, erreur = false, lectureSeule = false) {
    m.charger.mockResolvedValue({ plan: { surLesBaux: [{ source: "bail", cle: "impaye-bail-1", nature: "Bail", criticite: "critique", titre: "Loyer en retard TEST", detail: null, echeance: null, href: `/espace/${ORG}/baux/bail-1` }], enRetard: [], aVenir: [], total: 1 }, erreurs: { alertes: false, rapports: false } });
    const db = client(table => table === "rappels_loyers_proprietaire" ? [{ ...rappel, ...patch }] : []);
    if (erreur) db.rpc = () => { const q = { order: () => q, range: async () => ({ data: null, error: { message: "indisponible" } }) }; return q; };
    return renderToStaticMarkup(await AccueilProprietaire({ supabase: db as never, orgId: ORG, organisation: { name: "Parc", status: "active", essai_fin: null }, userId: "compte", lectureSeule }));
  }
  it("compte une seule demande sans répéter un impayé présenté dans la confirmation", async () => {
    const html = await rendre();
    expect(html).not.toContain("Loyer en retard TEST");
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ total: 1, loyersAConfirmer: 1, critiques: 0, indisponible: false, apercu: "Réception du loyer à confirmer" }));
  });
  it("conserve l’action si la lecture de la confirmation échoue", async () => {
    const html = await rendre({}, true);
    expect(html).toContain("Loyer en retard TEST");
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ total: 1, loyersAConfirmer: 0, critiques: 1, indisponible: true }));
  });
  it("place les demandes critiques avant les loyers, puis les autres vérifications", async () => {
    m.charger.mockResolvedValue({
      plan: {
        surLesBaux: [],
        enRetard: [{ source: "alerte", cle: "urgent", type: "assurance_expiration", titre: "Urgence TEST", detail: null, echeance: null, criticite: "critique", href: null, alerte: { id: "urgent" } }],
        aVenir: [{ source: "alerte", cle: "normal", type: "assurance_expiration", titre: "Vérification TEST", detail: null, echeance: null, criticite: "normale", href: null, alerte: { id: "normal" } }],
        total: 2,
      }, erreurs: { alertes: false, rapports: false },
    });
    const db = client(table => table === "rappels_loyers_proprietaire" ? [rappel] : []);
    const html = renderToStaticMarkup(await AccueilProprietaire({ supabase: db as never, orgId: ORG, organisation: { name: "Parc", status: "active", essai_fin: null }, userId: "compte" }));
    const avant = html.indexOf("Urgence TEST");
    const loyers = html.indexOf('data-rappels-loyers="true"');
    const apres = html.indexOf("Vérification TEST");
    expect(avant).toBeGreaterThanOrEqual(0);
    expect(loyers).toBeGreaterThan(avant);
    expect(apres).toBeGreaterThan(loyers);
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ total: 2, loyersAConfirmer: 1, critiques: 1, apercu: "Urgence TEST" }));
  });
  it.each([{ date_echeance: "2099-01-05" }, { montant_couvert: 800 }])("ne masque pas un blocage absent des confirmations : %j", async patch => {
    expect(await rendre(patch)).toContain("Loyer en retard TEST");
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ loyersAConfirmer: 0 }));
  });
  it("compte chaque échéance due dans la carte, même si la fenêtre ne présente que la plus ancienne du bail", async () => {
    m.charger.mockResolvedValue({ plan: { surLesBaux: [], enRetard: [], aVenir: [], total: 0 }, erreurs: { alertes: false, rapports: false } });
    const db = client(table => table === "rappels_loyers_proprietaire" ? [rappel, {
      ...rappel, appel_id: "suivant", periode: "2020-02-01", date_echeance: "2020-02-05",
    }] : []);
    renderToStaticMarkup(await AccueilProprietaire({ supabase: db as never, orgId: ORG, organisation: { name: "Parc", status: "active", essai_fin: null }, userId: "compte" }));
    // Audit du 27/10 (LAT-03) : « 2 loyers à confirmer » ; la ligne du bail annonce l'autre mois et le total.
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ total: 2, loyersAConfirmer: 2 }));
  });
  it("revient à une carte sans demande après réception de tous les loyers", async () => {
    m.charger.mockResolvedValue({ plan: { surLesBaux: [], enRetard: [], aVenir: [], total: 0 }, erreurs: { alertes: false, rapports: false } });
    const db = client(table => table === "rappels_loyers_proprietaire" ? [{ ...rappel, montant_couvert: 800 }] : []);
    renderToStaticMarkup(await AccueilProprietaire({ supabase: db as never, orgId: ORG, organisation: { name: "Parc", status: "active", essai_fin: null }, userId: "compte" }));
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ total: 0, loyersAConfirmer: 0, indisponible: false, apercu: null }));
  });
  it("conserve la lecture seule jusqu'au formulaire de réception", async () => {
    await rendre({}, false, true);
    expect(m.rappels).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG, lectureSeule: true }));
  });
});

describe("accueil : les alertes ouvrent de vraies actions sur le bon incident", () => {
  const incidentId = "22222222-3333-4444-8555-666666666666";
  const href = `/espace/${ORG}/incidents?sel=${incidentId}#qualification`;
  async function rendre({ doublon = false, lectureSeule = false, lectureIndisponible = false } = {}) {
    const alerte = (cle: string) => ({
      source: "alerte", cle, type: "incident_a_qualifier", nature: "Incident", titre: `Fuite TEST ${cle}`,
      detail: null, echeance: null, criticite: "critique", href,
      alerte: { id: cle, details: { incident_id: incidentId } },
    });
    m.charger.mockResolvedValue({
      plan: { surLesBaux: [], enRetard: doublon ? [alerte("premiere"), alerte("seconde")] : [alerte("premiere")], aVenir: [] },
      erreurs: { alertes: false, rapports: false },
    });
    const db = client(table => {
      if (table !== "incidents") return [];
      if (lectureIndisponible) throw new Error("Lecture interrompue");
      return [{
        id: incidentId, etat: "declare", categorie: "plomberie_canalisation", description: "Fuite sous le meuble de la cuisine.",
        imputation: null, imputation_justification: null, imputation_contestation: null, declarant_person_id: null,
      }];
    });
    return renderToStaticMarkup(await AccueilProprietaire({
      supabase: db as never, orgId: ORG, organisation: { name: "Parc", status: "active", essai_fin: null },
      userId: "compte", lectureSeule,
    }));
  }

  it("propose les actions rapides avec une fiche correspondant à l’incident de l’alerte", async () => {
    const html = await rendre();
    expect(html).toContain("Décider qui paie");
    expect(html).toContain("Ajouter une photo");
    expect(html).toContain("Fuite sous le meuble de la cuisine.");
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Voir la fiche incident");
    expect(html).not.toContain("Clôturer l’incident");
    // Les champs n'apparaissent qu'après un choix explicite, sans décision au rendu.
    expect(html).not.toContain('name="imputation"');
  });

  it("ne propose qu’un seul jeu d’actions quand deux alertes concernent le même incident", async () => {
    const html = await rendre({ doublon: true });
    expect(html.match(/Décider qui paie/g)).toHaveLength(1);
    expect(html.match(/Ajouter une photo/g)).toHaveLength(1);
    expect(html.match(/Voir la fiche incident/g)).toHaveLength(1);
    expect(html).toContain("Fuite TEST premiere");
    expect(html).toContain("Fuite TEST seconde");
  });

  it("conserve uniquement la consultation du dossier en lecture seule", async () => {
    const html = await rendre({ lectureSeule: true });
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Voir la fiche incident");
    expect(html).not.toContain("Décider qui paie");
    expect(html).not.toContain("Ajouter une photo");
    expect(html).not.toContain("Clôturer l’incident");
    expect(html).not.toContain('name="imputation"');
  });

  it("garde l’accès à la fiche si les données nécessaires aux actions sont indisponibles", async () => {
    const html = await rendre({ lectureIndisponible: true });
    expect(html).toContain("Certaines actions rapides sont indisponibles");
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Ouvrir l’incident");
    expect(html).not.toContain("Décider qui paie");
    expect(html).not.toContain("Ajouter une photo");
  });
});
