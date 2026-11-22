/**
 * LE RECOMMANDÉ ÉLECTRONIQUE N'APPARAÎT QUE S'IL EST RELIÉ — audit palier 1 du 22/11/2026, P1-18 (décision Q10).
 *
 * Le défaut : le propriétaire voyait « Recommandé AR24 disponible » et un bouton qui répondait « pas encore activé » ;
 * le locataire était invité à accepter des recommandés électroniques qu'aucun service ne pouvait lui adresser.
 *
 * Ces tests tiennent :
 *  1. la règle de disponibilité — accès de la plateforme ET expéditeur actif de l'espace, même environnement ; tout
 *     doute vaut « non », et sans accès de plateforme la base n'est même pas lue ;
 *  2. côté propriétaire : non relié, seul le courrier en PDF est proposé ; relié, l'envoi électronique revient ;
 *  3. côté locataire : l'accord n'est demandé que si le service est relié ; un accord déjà donné reste retirable ;
 *  4. l'action refuse un nouvel accord quand le service n'est pas relié, et laisse toujours retirer.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RappelLoyer } from "@/lib/rappels-loyers";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), revalider: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "locataire" } } }) }, rpc: banc.rpc }) }));
vi.mock("@/app/actions/reception-loyer", () => ({ declarerReceptionLoyer: vi.fn(), envoyerRelanceReception: vi.fn() }));
vi.mock("@/app/actions/recommandes", () => ({ preparerRecommande: vi.fn(), confirmerEnvoiRecommande: vi.fn(), actualiserRecommande: vi.fn(), chargerRecommande: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({
  BoutonGenererDocument: ({ code, libelle }: { code: string; libelle: string }) => createElement("button", { "data-modele": code }, libelle),
}));

import { modifierConsentementDocument } from "@/app/actions/consentements-documents";
import { ConsentementsDocuments } from "@/app/locataire/[orgId]/documents/consentements";
import { RappelsLoyersInteractifs } from "@/components/rappels-loyers-interactifs";
import { recommandeElectroniqueConfigure, recommandeElectroniqueDisponible } from "@/lib/recommande-disponible";

const RELIE = { AR24_TOKEN: "jeton-fictif", AR24_PRIVATE_KEY: "cle-fictive", AR24_ENVIRONMENT: "sandbox", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1", SUPABASE_SERVICE_ROLE_KEY: "cle-service-fictive" };
const CLES_AR24 = ["AR24_TOKEN", "AR24_PRIVATE_KEY", "AR24_ENVIRONMENT"] as const;

function baseAvec(reponse: { data: unknown; error: unknown } | Error) {
  const lecture = vi.fn(async () => { if (reponse instanceof Error) throw reponse; return reponse; });
  const eq = vi.fn(() => ({ maybeSingle: lecture }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, eq };
}

describe("règle de disponibilité", () => {
  it.each([
    ["aucun accès", {}],
    ["sans jeton", { ...RELIE, AR24_TOKEN: " " }],
    ["sans clé privée", { ...RELIE, AR24_PRIVATE_KEY: "" }],
    ["environnement inconnu", { ...RELIE, AR24_ENVIRONMENT: "recette" }],
    ["sans clé de service", { ...RELIE, SUPABASE_SERVICE_ROLE_KEY: "" }],
  ])("plateforme non reliée (%s) : non, et la base n'est pas lue", async (_libelle, env) => {
    expect(recommandeElectroniqueConfigure(env)).toBe(false);
    const base = baseAvec({ data: { actif: true, environnement: "sandbox" }, error: null });
    expect(await recommandeElectroniqueDisponible(base.client, "org", env)).toBe(false);
    expect(base.from).not.toHaveBeenCalled();
  });

  it("plateforme reliée et expéditeur actif de l'espace, même environnement : oui", async () => {
    expect(recommandeElectroniqueConfigure(RELIE)).toBe(true);
    const base = baseAvec({ data: { actif: true, environnement: "sandbox" }, error: null });
    expect(await recommandeElectroniqueDisponible(base.client, "org", RELIE)).toBe(true);
    expect(base.from).toHaveBeenCalledWith("connexions_ar24");
    expect(base.eq).toHaveBeenCalledWith("organization_id", "org");
    const production = { ...RELIE, AR24_ENVIRONMENT: "production" };
    expect(await recommandeElectroniqueDisponible(baseAvec({ data: { actif: true, environnement: "production" }, error: null }).client, "org", production)).toBe(true);
  });

  it.each([
    ["aucun expéditeur pour l'espace", { data: null, error: null }],
    ["expéditeur inactif", { data: { actif: false, environnement: "sandbox" }, error: null }],
    ["expéditeur d'un autre environnement", { data: { actif: true, environnement: "production" }, error: null }],
    ["lecture en erreur", { data: null, error: { message: "panne" } }],
    ["lecture interrompue", new Error("réseau")],
  ])("plateforme reliée mais %s : non", async (_libelle, reponse) => {
    expect(await recommandeElectroniqueDisponible(baseAvec(reponse as never).client, "org", RELIE)).toBe(false);
  });
});

describe("côté propriétaire : la relance arrivée au recommandé", () => {
  const ligne: RappelLoyer = {
    appel_id: "appel", bail_id: "bail", lot_nom: "Appartement", locataire: "Camille", periode: "2026-10-01", date_echeance: "2026-10-05",
    montant_du: 800, montant_couvert: 200, non_recu_signale_le: "2026-10-26T09:00:00Z",
    relances_automatiques: { active: false, premierDelai: 5, secondDelai: 15 }, historique_relances_disponible: true,
    derniere_relance: { niveau: "relance_2", date_envoi: "2026-10-15" },
  };
  const rendre = (recommandeElectroniqueDisponible?: boolean) => renderToStaticMarkup(createElement(RappelsLoyersInteractifs, {
    orgId: "org", aujourdHui: "2026-10-26", dus: [ligne], prochaine: null, totalEcheancesDues: 1, lectureSeule: false,
    envoiRelanceDisponible: true, recommandeElectroniqueDisponible,
  }));

  it.each([["non relié", false], ["réglage absent", undefined]])("%s : seul le courrier en PDF est proposé", (_libelle, valeur) => {
    const html = rendre(valeur);
    expect(html).toContain('data-modele="mise_en_demeure"');
    expect(html).toContain("Générer le recommandé en PDF");
    expect(html).toContain("Délai de règlement");
    expect(html).not.toContain("AR24");
  });

  it("relié : l'envoi électronique est proposé, à côté du PDF", () => {
    const html = rendre(true);
    expect(html).toContain("Recommandé AR24 disponible");
    expect(html).toContain("Préparer l’envoi du recommandé AR24");
    expect(html).toContain('data-modele="mise_en_demeure"');
  });
});

describe("côté locataire : réception de mes documents", () => {
  const rendre = (props: { recommandes: boolean; recommandesProposes?: boolean; retraitSeulement?: boolean }) =>
    renderToStaticMarkup(createElement(ConsentementsDocuments, { orgId: "org", quittances: false, email: "locataire@test.local", ...props }));
  const blocRecommandes = (html: string) => html.split("Recommandés électroniques")[1] ?? "";

  it("service non relié, aucun accord : l'accord n'est pas demandé ; les quittances restent proposées", () => {
    for (const html of [rendre({ recommandes: false }), rendre({ recommandes: false, recommandesProposes: false })]) {
      expect(html).not.toContain("Recommandés électroniques");
      expect(html).not.toContain("lettres recommandées");
      expect(html).toContain("Quittances et reçus de paiement");
      expect(html).toContain("J’accepte la réception électronique");
    }
  });

  it("service non relié, accord déjà donné : il reste visible, pour être retiré seulement", () => {
    const bloc = blocRecommandes(rendre({ recommandes: true, recommandesProposes: false }));
    expect(bloc).toContain("Accord électronique enregistré");
    expect(bloc).toContain("Retirer mon accord");
    expect(bloc).not.toContain("J’accepte la réception électronique");
  });

  it("service relié : l'accord est proposé, et se retire", () => {
    expect(blocRecommandes(rendre({ recommandes: false, recommandesProposes: true }))).toContain("J’accepte la réception électronique");
    expect(blocRecommandes(rendre({ recommandes: true, recommandesProposes: true }))).toContain("Retirer mon accord");
    // Adhésion inactive : retrait seulement, comme avant.
    expect(blocRecommandes(rendre({ recommandes: false, recommandesProposes: true, retraitSeulement: true }))).not.toContain("J’accepte la réception électronique");
  });
});

describe("action : accord du locataire", () => {
  const form = (accepte: "oui" | "non") => { const f = new FormData(); f.set("accepte", accepte); f.set("email", "locataire@test.local"); return f; };
  const anciennes: Record<string, string | undefined> = {};
  const poser = (env: Record<string, string | undefined>) => { for (const cle of [...CLES_AR24, "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) { if (env[cle] === undefined) delete process.env[cle]; else process.env[cle] = env[cle]; } };
  beforeEach(() => {
    vi.clearAllMocks();
    for (const cle of [...CLES_AR24, "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) anciennes[cle] = process.env[cle];
    return () => poser(anciennes);
  });

  it("service non relié : un nouvel accord pour les recommandés est refusé, sans appel à la base", async () => {
    poser({});
    const r = await modifierConsentementDocument("org", "recommandes", {}, form("oui"));
    expect(r.erreur).toContain("ne sont pas proposés pour le moment");
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalider).not.toHaveBeenCalled();
  });

  it("service non relié : le retrait reste possible, et les quittances ne sont pas concernées", async () => {
    poser({});
    banc.rpc.mockResolvedValue({ data: false, error: null });
    expect((await modifierConsentementDocument("org", "recommandes", {}, form("non"))).accepte).toBe(false);
    expect(banc.rpc).toHaveBeenCalledWith("modifier_consentement_document", expect.objectContaining({ p_nature: "recommandes", p_accepte: false }));
    banc.rpc.mockResolvedValue({ data: true, error: null });
    expect((await modifierConsentementDocument("org", "quittances", {}, form("oui"))).accepte).toBe(true);
  });

  it("service relié : l'accord pour les recommandés s'enregistre", async () => {
    poser(RELIE);
    banc.rpc.mockResolvedValue({ data: true, error: null });
    expect((await modifierConsentementDocument("org", "recommandes", {}, form("oui"))).accepte).toBe(true);
    expect(banc.rpc).toHaveBeenCalledWith("modifier_consentement_document", { p_org: "org", p_nature: "recommandes", p_accepte: true, p_email: "locataire@test.local" });
  });
});
