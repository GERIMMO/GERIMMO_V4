/**
 * Décision D27 : les écrans qui composent eux-mêmes des adresses de gestion, RENDUS pour une agence ET pour un
 * propriétaire direct — la liste des alertes, la synthèse des alertes à la connexion, trois écrans de la console
 * (fiche d'un client, fiche d'un compte, suivi des dossiers) et la quittance qui n'a pas pu être délivrée.
 *
 * Relecture du 15/10 : sur chacun de ces écrans, inverser le choix de la racine (ou y mettre /espace en dur) ne faisait
 * échouer aucun test. Or une agence envoyée sur /espace/<agence> tombe sur « introuvable » (404), et chaque « Traiter »,
 * « Entrer dans son espace » ou « à renseigner dans… » deviendrait une impasse. Ici, chaque écran est rendu en HTML
 * (composants client remplacés par des témoins quand ils ne composent pas d'adresse) et chaque test affirme qu'une
 * agence n'obtient JAMAIS /espace, et qu'un propriétaire direct n'est pas renvoyé sous /agence.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const m = vi.hoisted(() => ({
  client: null as unknown,
  // La synthèse des alertes s'ouvre d'elle-même APRÈS le premier rendu (effet différé) : le rendu serveur la verrait
  // fermée. Ce drapeau fait démarrer ses états booléens à « vrai » (ouverte, liste complète), le temps de son test.
  ouvrirSynthese: false,
  quittance: null as unknown,
}));

vi.mock("react", async (importer) => {
  const r = await importer<typeof import("react")>();
  const useState = ((initial: unknown) => r.useState(m.ouvrirSynthese && initial === false ? true : initial)) as typeof r.useState;
  return { ...r, default: r, useState };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => m.client }));
// La fenêtre de la charte vit dans un portail, absent du rendu serveur : un témoin rend son pied et son contenu.
vi.mock("@/components/ui/modale", () => ({
  Modale: (p: { pied?: ReactNode; children: ReactNode }) => createElement("dialog", null, p.pied, p.children),
}));
// Composants client sans adresse de gestion : témoins vides (ils tirent des actions serveur sans intérêt ici).
vi.mock("@/components/geste-controle", () => ({ GesteControle: () => null }));
vi.mock("@/app/actions/controle-supervision", () => ({ controlerOrganisation: vi.fn(), renvoyerInvitation: vi.fn(), controlerCompte: vi.fn() }));
vi.mock("@/app/admin/autonomie/suivi-correction", () => ({ SuiviCorrection: () => null }));
vi.mock("@/app/admin/autonomie/formulaire-delegation", () => ({ ActualiserDossiers: () => null, DecisionAmelioration: () => null }));
vi.mock("@/components/bouton-retour", () => ({ BoutonRetour: () => null }));
vi.mock("@/components/marque-organisation", () => ({ MarqueOrganisation: () => null }));
vi.mock("@/app/quittance/[quittanceId]/document-quittance", () => ({ DocumentQuittance: () => null }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/quittance-conforme", () => ({
  chargerQuittanceDocument: async () => m.quittance,
  assemblerQuittanceDelivree: () => ({ html: "<html><head></head><body></body></html>" }),
  // Une quittance à laquelle il manque le siège de l'émetteur et la référence du bail : la page dit où les renseigner.
  manquantsQuittance: () => ["Siège social de l'émetteur", "Référence du bail"],
}));

import { ListeAlertes } from "@/app/agence/[orgId]/alertes/liste-alertes";
import { SyntheseAlertes, type AlerteSynthese } from "@/components/synthese-alertes";
import PageAdminOrganisation from "@/app/admin/organisations/[orgId]/page";
import PageCompte from "@/app/admin/comptes/[accountId]/page";
import PageAutonomie from "@/app/admin/autonomie/page";
import PageQuittance from "@/app/quittance/[quittanceId]/page";

const ORG = "11111111-2222-4333-8444-555555555555";
const AUTRE = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const PROFILS = [
  { nom: "agence", type: "agence", proprietaire: false, attendu: `/agence/${ORG}`, interdit: "/espace/" },
  { nom: "propriétaire direct", type: "proprietaire_direct", proprietaire: true, attendu: `/espace/${ORG}`, interdit: "/agence/" },
] as const;

/** Les adresses de gestion (`/agence/…` ou `/espace/…`) des liens d'un rendu HTML. */
function adressesDeGestion(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((x) => x[1].replaceAll("&amp;", "&")).filter((h) => /^\/(agence|espace)\//.test(h));
}

/** Un client PostgREST factice : `lire(nom)` donne les lignes d'une table ou d'une fonction ; toute méthode chaîne. */
function client(lire: (nom: string) => unknown) {
  const requete = (nom: string) => {
    const reponse = () => {
      const d = lire(nom);
      return { data: d, error: null, count: Array.isArray(d) ? d.length : null };
    };
    const q: unknown = new Proxy({}, {
      get(_c, prop) {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(reponse()).then(ok, ko);
        if (prop === "maybeSingle" || prop === "single") return async () => { const r = reponse(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; };
        return () => q;
      },
    });
    return q;
  };
  return { from: requete, rpc: requete };
}

const alerte = (id: string, type: string, details: Ligne | null): Ligne => ({
  id, type, criticite: "normale", titre: `Alerte TEST ${id}`, echeance: null, created_at: "2026-10-01T08:00:00Z",
  assignee_account_id: null, assigned_all: true, escalades: null, details,
});

beforeEach(() => {
  m.ouvrirSynthese = false;
  m.client = null;
  m.quittance = null;
});

describe("ListeAlertes (écran Alertes) : « Traiter » et les liens de la liste", () => {
  it("la supervision consulte les dossiers sans se voir confier ni proposer de clore les alertes", () => {
    const html = renderToStaticMarkup(createElement(ListeAlertes, {
      orgId: ORG, membres: [], monCompte: "superadmin", estResponsable: true,
      estProprietaire: true, lectureSeule: true, ouvrirAlerteId: "al-2",
      alertes: [alerte("al-1", "loyer_impaye", { bail_id: "bail-1" }), alerte("al-2", "manuelle", null)] as never,
    }));
    expect(html).toContain("Consulter le dossier");
    expect(adressesDeGestion(html)).toEqual([`/espace/${ORG}/baux/bail-1#loyers`]);
    expect(html).toContain("Suivi par le gestionnaire");
    expect(html).not.toContain("Confier / clore");
    expect(html).not.toContain(">Traiter<");
    expect(html).not.toContain("Confiées à d");
  });
  for (const p of PROFILS) {
    it(`${p.nom} : chaque fiche à traiter sous ${p.attendu}, jamais ${p.interdit}`, () => {
      const html = renderToStaticMarkup(createElement(ListeAlertes, {
        orgId: ORG, membres: [], monCompte: "compte", estResponsable: true, estProprietaire: p.proprietaire, aujourdhui: "2026-10-15",
        alertes: [
          alerte("al-1", "loyer_impaye", { bail_id: "bail-1" }),
          alerte("al-2", "assurance_expiration", { person_id: "pers-1" }),
        ] as never,
      }));
      const liens = adressesDeGestion(html);
      expect(liens).toEqual([`${p.attendu}/baux/bail-1#loyers`, `${p.attendu}/personnes/pers-1#pieces`]);
      expect(html).not.toContain(p.interdit);
    });
  }

  it("propriétaire direct, liste vide : le renvoi vers « Mes lots » est sous /espace/<id>", () => {
    const html = renderToStaticMarkup(createElement(ListeAlertes, {
      orgId: ORG, membres: [], monCompte: "compte", estResponsable: true, estProprietaire: true, alertes: [],
    }));
    expect(adressesDeGestion(html)).toEqual([`/espace/${ORG}/parc`]);
  });
});

describe("SyntheseAlertes (fenêtre des alertes à la connexion) : la racine suit l'organisation de chaque alerte", () => {
  const synthese = (a: Ligne, org: string, proprietaire: boolean): AlerteSynthese =>
    ({ ...a, organization_id: org, organisation: proprietaire ? "Parc TEST" : "Agence TEST", proprietaire_direct: proprietaire }) as never;

  for (const p of PROFILS) {
    it(`${p.nom} : fiches, « Traiter » et « Toutes les alertes » sous ${p.attendu}`, () => {
      m.ouvrirSynthese = true;
      const html = renderToStaticMarkup(createElement(SyntheseAlertes, {
        aujourdhui: "2026-10-15",
        alertes: [
          synthese(alerte("al-1", "loyer_impaye", { bail_id: "bail-1" }), ORG, p.proprietaire),
          // Sans écran dédié : « Traiter » mène à la page Alertes, positionnée sur l'alerte.
          synthese(alerte("al-2", "autre", null), ORG, p.proprietaire),
        ],
      }));
      const liens = adressesDeGestion(html);
      expect(liens).toEqual(expect.arrayContaining([
        `${p.attendu}/alertes`, `${p.attendu}/baux/bail-1#loyers`, `${p.attendu}/alertes?traiter=al-2`,
      ]));
      for (const l of liens) expect(l.startsWith(`${p.attendu}/`), l).toBe(true);
      expect(html).not.toContain(p.interdit);
    });
  }

  it("deux organisations : l'alerte de l'agence reste sous /agence, celle du propriétaire direct passe sous /espace", () => {
    m.ouvrirSynthese = true;
    const html = renderToStaticMarkup(createElement(SyntheseAlertes, {
      alertes: [
        synthese(alerte("al-ag", "loyer_impaye", { bail_id: "bail-ag" }), AUTRE, false),
        synthese(alerte("al-pd", "loyer_impaye", { bail_id: "bail-pd" }), ORG, true),
      ],
    }));
    expect(adressesDeGestion(html).sort()).toEqual([`/agence/${AUTRE}/baux/bail-ag#loyers`, `/espace/${ORG}/baux/bail-pd#loyers`]);
  });
});

describe("console : la fiche d'un client (« Entrer dans son espace », profil à compléter)", () => {
  it("ne charge pas l’identité du client quand le journal de consultation échoue", async () => {
    const db=client(()=>[]), from=vi.fn(db.from);
    m.client={...db,from,rpc:async (nom:string)=>({data:nom==="is_super_admin",error:nom==="log_sa_access"?{message:"journal indisponible"}:null})};
    const html=renderToStaticMarkup(await PageAdminOrganisation({params:Promise.resolve({orgId:ORG}),searchParams:Promise.resolve({})} as never));
    expect(html).toContain("Journal des consultations"); expect(from).not.toHaveBeenCalled();
  });

  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}`, async () => {
      m.client = client((nom) => {
        if (nom === "is_super_admin") return true;
        if (nom === "organizations") {
          return [{ id: ORG, name: "Organisation TEST", status: "active", type: p.type, address_line1: "1 rue témoin", essai_fin: null, created_at: "2026-01-05T10:00:00Z" }];
        }
        return [];
      });
      const html = renderToStaticMarkup((await PageAdminOrganisation({
        params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}),
      } as never)) as never);
      const liens = adressesDeGestion(html);
      expect(liens).toEqual(expect.arrayContaining([p.attendu, `${p.attendu}/profil`]));
      for (const l of liens) expect(l.startsWith(p.attendu), l).toBe(true);
      expect(html).not.toContain(p.interdit);
      if (p.proprietaire) { expect(html.toLowerCase()).not.toContain("siret"); expect(html.toLowerCase()).not.toContain("tva"); }
      else { expect(html.toLowerCase()).toContain("siret"); expect(html.toLowerCase()).toContain("tva"); }
    });
  }
  it("conserve les renseignements professionnels réellement fournis par un propriétaire", async () => {
    m.client = client(nom => nom === "is_super_admin" ? true : nom === "organizations" ? [{id:ORG,name:"Propriétaire TEST",type:"proprietaire_direct",status:"active",siret:"12345678900012",tva_intracom:"FR00123456789",created_at:"2026-01-01"}] : []);
    const html = renderToStaticMarkup(await PageAdminOrganisation({params:Promise.resolve({orgId:ORG}),searchParams:Promise.resolve({})} as never));
    expect(html).toContain("12345678900012"); expect(html).toContain("FR00123456789");
  });
});

describe("console : la fiche d'un compte (« Entrer dans son espace » depuis chaque rôle)", () => {
  const COMPTE = "abcdefab-cdef-4abc-8def-abcdefabcdef";
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}`, async () => {
      m.client = client((nom) => {
        if (nom === "is_super_admin") return true;
        if (nom === "dossier_compte_supervision") {
          return [{ account_id: COMPTE, email: "compte@example.invalid", cree_le: "2026-01-05T10:00:00Z", derniere_connexion: null, email_confirme_le: null, facteurs_mfa: 0, bloque_jusqu_au: null, est_super_admin: false, artisan_id: null, artisan_raison_sociale: null }];
        }
        if (nom === "memberships") {
          return [{ id: "m-1", role: p.proprietaire ? "proprietaire_direct" : "admin_agence", status: "active", organization_id: ORG, organisation: { id: ORG, name: "Organisation TEST", type: p.type } }];
        }
        return [];
      });
      const html = renderToStaticMarkup((await PageCompte({ params: Promise.resolve({ accountId: COMPTE }) })) as never);
      expect(adressesDeGestion(html)).toEqual([p.attendu]);
      expect(html).not.toContain(p.interdit);
    });
  }
});

describe("console : le suivi des dossiers (« Ouvrir le dossier »)", () => {
  it("le dossier d'une agence reste sous /agence, celui d'un propriétaire direct passe sous /espace", async () => {
    const dossier = (id: string, org: string, bail: string) => ({
      id, organization_id: org, dossier_type: "bail", dossier_id: bail, prochaine_action: "Étape TEST", mode: "manuel", etat: "a_faire",
      priorite: "normale", exception_message: null, updated_at: "2026-10-14T08:00:00Z", lien_action: null, agir_apres: null,
    });
    m.client = client((nom) => {
      if (nom === "orchestration_cases") return [dossier("d-ag", AUTRE, "bail-ag"), dossier("d-pd", ORG, "bail-pd")];
      if (nom === "organizations") return [{ id: AUTRE, name: "Agence TEST", type: "agence" }, { id: ORG, name: "Parc TEST", type: "proprietaire_direct" }];
      return [];
    });
    const html = renderToStaticMarkup((await PageAutonomie({ searchParams: Promise.resolve({}) })) as never);
    expect(adressesDeGestion(html)).toEqual([`/agence/${AUTRE}/baux/bail-ag`, `/espace/${ORG}/baux/bail-pd`]);
  });
});

describe("quittance non délivrable : « à renseigner dans… » vue par le gestionnaire", () => {
  for (const p of PROFILS) {
    it(`${p.nom} → ${p.attendu}/…`, async () => {
      m.client = client(() => []);
      m.quittance = {
        organization_id: ORG, bail_id: "bail-1", organisation: { nom: "Organisation TEST", type: p.type },
        est_quittance: true, periode: "2026-09-01", montant: "650.00", vue_gestionnaire: true,
      };
      const html = renderToStaticMarkup((await PageQuittance({
        params: Promise.resolve({ quittanceId: "q-1" }), searchParams: Promise.resolve({}),
      })) as never);
      expect(adressesDeGestion(html)).toEqual([`${p.attendu}/profil`, `${p.attendu}/baux/bail-1`]);
      expect(html).not.toContain(p.interdit);
    });
  }
});
