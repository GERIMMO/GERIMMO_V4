/**
 * CE QUE LES ESPACES VOIENT DES ENVOIS AUTOMATIQUES, SELON CE QUE LE SUPERVISEUR A OUVERT
 * (audit palier 1 du 22/11/2026, P1-08).
 *
 * Fermé (le défaut) : rien ne change — le profil dit « envoi suspendu », ne demande aucun accord, et l'enregistrement
 * du profil ne touche pas aux deux préférences. Ouvert : l'espace peut donner (ou retirer) son accord pour l'avis
 * d'échéance et pour la relance automatique ; les écrans cessent de dire « suspendu » pour ce qui ne l'est plus.
 *
 * Sans base : la lecture, le formulaire du profil, son action, et les phrases des écrans, avec des clients simulés.
 * Le parcours complet (superviseur, puis propriétaire) est tenu par e2e/envois-automatiques.spec.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const banc = vi.hoisted(() => ({ role: "proprietaire_direct" as string, rpc: vi.fn(), majOrganisation: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "compte" }, role: banc.role,
    supabase: {
      rpc: banc.rpc,
      from: () => ({ update: (valeurs: Record<string, unknown>) => { banc.majOrganisation(valeurs); return { eq: () => ({ select: async () => ({ data: [{ id: "org" }], error: null }) }) }; } }),
    },
  }),
}));

import { modifierProfilOrganisation } from "@/app/actions/organisation";
import { FormulaireProfilOrganisation } from "@/app/agence/[orgId]/profil/formulaire-profil";
import { texteInformationEnvois } from "@/components/information-envois-proprietaire";
import { AUCUN_ENVOI_PROPOSE, lireEnvoisProposes } from "@/lib/envois-suspendus";

// Décision du dirigeant du 24/11/2026 (Q37, lot D4) : la lecture rend cinq oui/non (quatre jusque-là).
const TOUT_OUVERT = { avis_echeance: true, relance_loyer: true, rappel_rendez_vous: true, relance_invitation: true, relance_report_rdv: true };
const reponse = (r: unknown) => ({ rpc: async () => r }) as unknown as Pick<SupabaseClient, "rpc">;

describe("la lecture de ce qui est proposé", () => {
  it("rend les cinq oui/non que la base donne", async () => {
    expect(await lireEnvoisProposes(reponse({ data: TOUT_OUVERT, error: null }))).toEqual(TOUT_OUVERT);
    const mixte = { avis_echeance: true, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: true, relance_report_rdv: false };
    expect(await lireEnvoisProposes(reponse({ data: { ...mixte, autre: "ignoré" }, error: null }))).toEqual(mixte);
  });

  it.each([
    ["une erreur", { data: TOUT_OUVERT, error: { message: "refus" } }],
    ["aucune réponse", { data: null, error: null }],
    ["une réponse incomplète", { data: { avis_echeance: true, relance_loyer: true }, error: null }],
    ["une valeur qui n'est pas un oui/non", { data: { ...TOUT_OUVERT, relance_loyer: "true" }, error: null }],
    ["un texte", { data: "tout", error: null }],
    ["rien du tout", {}],
  ])("%s vaut « rien n'est proposé »", async (_libelle, r) => {
    expect(await lireEnvoisProposes(reponse(r))).toEqual(AUCUN_ENVOI_PROPOSE);
  });

  it("une exception aussi", async () => {
    expect(await lireEnvoisProposes({ rpc: async () => { throw new Error("réseau"); } } as unknown as Pick<SupabaseClient, "rpc">)).toEqual(AUCUN_ENVOI_PROPOSE);
  });
});

describe("le profil d'un espace", () => {
  const organisation = {
    name: "SCI du Tilleul", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", telephone: "0400000000", email_contact: "camille@exemple.fr",
    siret: null, carte_pro: null, garantie_financiere: null, iban: null, tva_intracom: null, tva_franchise: true,
    quittances_envoi_auto: true, appels_envoi_auto: true, relances_envoi_auto: false, relance_1_jours: 5, relance_2_jours: 15, relance_seuil_montant: 0,
    logo_url: null, couleur_primaire: null, couleur_secondaire: null, domaine_personnalise: null, email_expediteur: null, nom_portail: null,
  } as unknown as Parameters<typeof FormulaireProfilOrganisation>[0]["organisation"];
  const rendre = (props: Partial<Parameters<typeof FormulaireProfilOrganisation>[0]> = {}) =>
    renderToStaticMarkup(createElement(FormulaireProfilOrganisation, { orgId: "org", organisation, lectureSeule: false, estProprietaire: true, ...props }));

  it("fermé (le défaut) : « suspendu », aucune case d'accord, aucun repère — même si une ancienne préférence est en base", () => {
    const html = rendre();
    expect(html).toContain("L’envoi automatique des avis est suspendu.");
    expect(html).toContain("Les courriers de relance automatiques sont suspendus.");
    for (const absent of ['name="appels_envoi_auto"', 'name="relances_envoi_auto"', 'name="avis_echeance_propose"', 'name="relance_loyer_propose"']) expect(html, absent).not.toContain(absent);
    // Les quittances, elles, restent réglables comme avant.
    expect(html).toContain('name="quittances_envoi_auto"');
  });

  it("avis ouverts : la case d'accord paraît, cochée si l'espace l'avait donnée ; les relances restent « suspendues »", () => {
    const html = rendre({ envoisProposes: { avis: true, relances: false } });
    expect(html).toMatch(/<input[^>]*id="pr-avis-auto"[^>]*name="appels_envoi_auto"[^>]*checked/);
    expect(html).toContain('name="avis_echeance_propose" value="1"');
    expect(html).toContain("Annoncer chaque échéance au locataire par e-mail");
    expect(html).toContain("Une\n            échéance déjà réglée n’est jamais réclamée".replace(/\n\s+/g, " "));
    expect(html).not.toContain("L’envoi automatique des avis est suspendu.");
    expect(html).toContain("Les courriers de relance automatiques sont suspendus.");
    expect(html).not.toContain('name="relances_envoi_auto"');
  });

  it("relances ouvertes : la case d'accord paraît, décochée si l'espace ne l'a pas donnée ; le propriétaire lit que rien ne part sans lui", () => {
    const html = rendre({ envoisProposes: { avis: false, relances: true } });
    const caseRelances = /<input[^>]*id="pr-relances-auto"[^>]*>/.exec(html)?.[0] ?? "";
    expect(caseRelances).toContain('name="relances_envoi_auto"');
    expect(caseRelances).not.toContain("checked");
    expect(html).toContain('name="relance_loyer_propose" value="1"');
    expect(html).toContain("Rien ne part sans vous");
    expect(html).toContain("L’envoi automatique des avis est suspendu.");
    expect(html).not.toContain("Les courriers de relance automatiques sont suspendus.");
    // Une agence n'a pas la phrase du propriétaire.
    expect(rendre({ envoisProposes: { avis: false, relances: true }, estProprietaire: false })).not.toContain("Rien ne part sans vous");
  });

  it("fiche en lecture seule : « Envoi suspendu » fermé ; « Automatique » ou « Manuel » ouvert", () => {
    const ferme = rendre({ lectureSeule: true });
    expect(ferme.match(/Envoi suspendu/g)).toHaveLength(2);
    const ouvert = rendre({ lectureSeule: true, envoisProposes: { avis: true, relances: true } });
    expect(ouvert).not.toContain("Envoi suspendu");
    expect(ouvert).toMatch(/Avis d&#x27;échéance par e-mail[\s\S]{0,200}Automatique/);
    expect(ouvert).toMatch(/Relances d&#x27;impayé par e-mail[\s\S]{0,200}Manuel/);
  });
});

describe("l'enregistrement du profil", () => {
  const formulaire = (champs: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ name: "SCI du Tilleul", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", email_contact: "camille@exemple.fr", telephone: "0400000000", ...champs })) f.set(k, v);
    return f;
  };
  const ouverts = (o: Partial<typeof TOUT_OUVERT>) => banc.rpc.mockImplementation(async (nom: string) =>
    nom === "envois_automatiques_proposes" ? { data: { ...AUCUN_ENVOI_PROPOSE, ...o }, error: null } : { data: 0, error: null });
  const enregistre = () => banc.majOrganisation.mock.calls[0][0] as Record<string, unknown>;
  beforeEach(() => { vi.clearAllMocks(); banc.role = "proprietaire_direct"; ouverts({}); });

  it("fermé : les deux préférences ne sont ni lues ni écrites, même si le formulaire les envoie", async () => {
    await modifierProfilOrganisation("org", {}, formulaire({ appels_envoi_auto: "on", relances_envoi_auto: "on" }));
    expect(banc.majOrganisation).toHaveBeenCalledOnce();
    expect(enregistre()).not.toHaveProperty("appels_envoi_auto");
    expect(enregistre()).not.toHaveProperty("relances_envoi_auto");
    expect(banc.rpc.mock.calls.map(([nom]) => nom)).not.toContain("envois_automatiques_proposes");
  });

  it("un repère forgé n'accorde rien : la base dit fermé, rien n'est écrit", async () => {
    await modifierProfilOrganisation("org", {}, formulaire({ avis_echeance_propose: "1", relance_loyer_propose: "1", appels_envoi_auto: "on", relances_envoi_auto: "on" }));
    expect(banc.rpc.mock.calls.map(([nom]) => nom)).toContain("envois_automatiques_proposes");
    expect(enregistre()).not.toHaveProperty("appels_envoi_auto");
    expect(enregistre()).not.toHaveProperty("relances_envoi_auto");
  });

  it("ouvert et proposé : l'accord s'enregistre — coché vaut oui, décoché vaut non", async () => {
    ouverts({ avis_echeance: true, relance_loyer: true });
    await modifierProfilOrganisation("org", {}, formulaire({ avis_echeance_propose: "1", relance_loyer_propose: "1", appels_envoi_auto: "on" }));
    expect(enregistre()).toMatchObject({ appels_envoi_auto: true, relances_envoi_auto: false });
  });

  it("un seul envoi ouvert : seul son accord s'enregistre, l'autre préférence n'est pas touchée", async () => {
    ouverts({ relance_loyer: true });
    await modifierProfilOrganisation("org", {}, formulaire({ avis_echeance_propose: "1", relance_loyer_propose: "1", appels_envoi_auto: "on", relances_envoi_auto: "on" }));
    expect(enregistre()).toMatchObject({ relances_envoi_auto: true });
    expect(enregistre()).not.toHaveProperty("appels_envoi_auto");
  });

  it("ouvert mais non proposé par le formulaire (page ouverte avant l'ouverture) : rien n'est écrit — une case absente ne vaut pas « décoché »", async () => {
    ouverts({ avis_echeance: true, relance_loyer: true });
    await modifierProfilOrganisation("org", {}, formulaire());
    expect(enregistre()).not.toHaveProperty("appels_envoi_auto");
    expect(enregistre()).not.toHaveProperty("relances_envoi_auto");
  });

  it("lecture de l'ouverture impossible : rien n'est écrit, le reste du profil s'enregistre", async () => {
    banc.rpc.mockImplementation(async (nom: string) => nom === "envois_automatiques_proposes" ? { data: null, error: { message: "indisponible" } } : { data: 0, error: null });
    const r = await modifierProfilOrganisation("org", {}, formulaire({ avis_echeance_propose: "1", appels_envoi_auto: "on" }));
    expect(r.erreur).toBeUndefined();
    expect(enregistre()).toMatchObject({ name: "SCI du Tilleul" });
    expect(enregistre()).not.toHaveProperty("appels_envoi_auto");
  });
});

describe("les phrases des écrans", () => {
  it("l'information de l'accueil dit ce qui reste suspendu et ce qui peut s'activer", () => {
    const ferme = texteInformationEnvois(false, false);
    expect(ferme).toBe("Vous pouvez préparer vos relances de loyer en PDF. Les relances locatives et les avis d’échéance par courriel restent suspendus : ils ne sont pas envoyés automatiquement.");
    const avis = texteInformationEnvois(true, false);
    expect(avis).toContain("Les avis d’échéance par courriel peuvent maintenant être activés");
    expect(avis).toContain("Les relances locatives par courriel restent suspendues.");
    const relances = texteInformationEnvois(false, true);
    expect(relances).toContain("Les relances automatiques par courriel peuvent maintenant être activées");
    expect(relances).toContain("Les avis d’échéance par courriel restent suspendus.");
    const tout = texteInformationEnvois(true, true);
    expect(tout).toContain("rien ne part tant que vous ne l’avez pas choisi");
    expect(tout).not.toContain("suspendu");
  });
});
