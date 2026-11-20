/**
 * UN BAIL DÉJÀ EN COURS S'ACTIVE PAR SON CONTRAT SIGNÉ — décision B du dirigeant, 20/11/2026. Côté écran.
 *
 * La base décide (migration 20261120190000, tests/bail-deja-en-cours-base.test.ts) ; l'écran annonce. Ce que ces tests
 * tiennent, sans base :
 *  1. `bailDejaEnCours` : date d'entrée strictement passée, au format des dates de la base ;
 *  2. la fiche du bail ouvre le dépôt du contrat signé pour un bail déjà en cours dont le logement est encore « en
 *     préparation », et le dit ; le raccourci en tête mène à l'étape du dépôt ;
 *  3. le guide de démarrage dit au propriétaire dont le locataire est déjà en place qu'il peut créer le bail sans attendre.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bailDejaEnCours } from "../src/lib/baux";
import { indexEtapeBail } from "../src/lib/champs-etape-bail";
import { ParcoursDemarrage } from "../src/components/parcours-demarrage";

describe("bailDejaEnCours : la date d'entrée est strictement passée", () => {
  const AUJOURDHUI = "2026-11-20";

  it.each([
    ["2024-11-01", true],
    ["2026-11-19", true],
    ["2026-11-20", false],
    ["2026-11-21", false],
    ["2027-01-01", false],
  ])("entrée le %s, vue le 20/11/2026 → %s", (date, attendu) => {
    expect(bailDejaEnCours(date, AUJOURDHUI)).toBe(attendu);
  });

  it.each([null, undefined, "", "20/11/2024", "2024-11", "hier", "2024-11-01T00:00:00Z"])(
    "une date absente ou mal formée (%s) n'est jamais « déjà en cours » : le contrôle complet s'applique",
    (date) => {
      expect(bailDejaEnCours(date as string | null | undefined, AUJOURDHUI)).toBe(false);
    },
  );
});

describe("la fiche du bail", () => {
  const page = readFileSync("src/app/agence/[orgId]/baux/[bailId]/page.tsx", "utf8");

  it("un bail déjà en cours n'est plus retenu par un logement « en préparation »", () => {
    expect(page).toContain('const dejaEnCours = bail.etat === "brouillon" && bailDejaEnCours(bail.date_debut, aujourdhuiParis());');
    expect(page).toContain('const lotEnPreparation = bail.etat === "brouillon" && lot?.etat === "brouillon" && !dejaEnCours;');
    // Les trois endroits qui fermaient le dépôt lisent tous ce même drapeau.
    expect(page.match(/lotEnPreparation/g)!.length).toBeGreaterThanOrEqual(4);
    expect(page).toContain("activationDisponible={!lotEnPreparation}");
    expect(page).toContain(") : lotEnPreparation ? null : mentions.length > 0 ? (");
  });

  it("elle dit pourquoi le dépôt est ouvert, sans promettre que les diagnostics sont inutiles", () => {
    expect(page).toContain("Ce bail a déjà commencé : le contrat signé suffit à l’activer.");
    expect(page).toContain("ils restent signalés dans vos actions à mener");
  });

  it("le raccourci en tête mène à l'étape du dépôt, et s'efface dès qu'un contrat est déposé ou en lecture seule", () => {
    expect(page).toContain("{!traverseeLectureSeule && dejaEnCours && !bail.document_signe && !signeNonActif && (");
    expect(page).toContain('<a href="#bail-signe"');
    // L'ancre ouvre bien la septième étape de l'assistant, celle qui porte le dépôt.
    expect(indexEtapeBail("#bail-signe")).toBe(6);
  });

  it("les mentions obligatoires ferment toujours le dépôt : locataire, date d'entrée, loyer", () => {
    expect(page).toContain("Le dépôt reste fermé : ce bail n&apos;a pas encore toutes ses");
  });
});

describe("le guide de démarrage", () => {
  const etapes = (lotPret: boolean) => ["identite", "bien", "lot_pret", "locataire", "bail", "loyer"].map((etape, i) => ({
    etape,
    faite: i < 2 || (etape === "lot_pret" && lotPret),
    detail: etape === "lot_pret" && !lotPret ? "DPE absent ou expiré (obligatoire en habitation) · ERP absent ou expiré (état des risques, validité 6 mois)" : null,
    lot_id: null,
    bien_id: null,
  }));
  const supabase = (lotPret: boolean) => ({
    rpc: async () => ({ data: etapes(lotPret), error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { quittances_envoi_auto: false, appels_envoi_auto: false, relances_envoi_auto: false }, error: null }) }) }) }),
  });
  const rendre = async (lotPret: boolean, estProprietaire: boolean) =>
    renderToStaticMarkup((await ParcoursDemarrage({ supabase: supabase(lotPret) as never, orgId: "org", estProprietaire }))!);

  it("dit au propriétaire dont le locataire est déjà en place qu'il peut créer le bail sans attendre les diagnostics", async () => {
    const html = await rendre(false, true);
    expect(html).toContain("Préparation du logement");
    expect(html).toContain("Votre locataire est déjà en place ?");
    expect(html).toContain("le contrat signé suffit à l’activer");
  });

  it("ne le dit plus une fois le logement prêt ou loué, ni à une agence", async () => {
    expect(await rendre(true, true)).not.toContain("Votre locataire est déjà en place ?");
    expect(await rendre(false, false)).not.toContain("Votre locataire est déjà en place ?");
  });
});

describe("l'action de dépôt lit les blocages du bail, et ceux du lot seulement à défaut", () => {
  const actions = readFileSync("src/app/actions/baux.ts", "utf8");

  it("la fonction du bail d'abord ; le repli couvre la base non encore migrée", () => {
    expect(actions).toContain('supabase.rpc("bail_blocages_mise_en_location", { p_bail: bailId })');
    expect(actions).toContain("!duBail.error && Array.isArray(duBail.data)");
    expect(actions).toContain('(await supabase.rpc("lot_blocages_location", { p_lot: bail.lot_id })).data');
  });

  it("le contrôle avant dépôt reste celui de la base, inchangé", () => {
    expect(actions).toContain('supabase.rpc("controler_mise_en_location", { p_bail: bailId })');
    expect(actions).toContain('supabase.rpc("activer_bail_papier", {');
  });
});
