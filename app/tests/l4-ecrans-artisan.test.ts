/**
 * Plan de corrections du 26/11/2026, lot L4 (écrans justes), partie artisan. Cinq défauts relevés dans 1dca28b
 * (notes-L60.md, « Reste » ; relecture L60R, R6 et R9 ; passe 2, p2-relecture-artisan.md) ; chaque cas échouait avant sa
 * correction, sauf les témoins signalés.
 *  - « Aujourd'hui », carte « Dates proposées, réponse attendue » : le compteur brut, sans les dates, passées comprises.
 *  - Fiche de chantier : le volet « Voir mes autres rendez-vous avant de choisir » n'avait pas de chevron (motif E117).
 *  - /facture ouverte trop tôt ou une fois la facture déposée : renvoi à la fiche de mission sans un mot.
 *  - R9 : une alternance échec/succès de lecture pouvait enchaîner les renvois entre /artisan et /artisan/panne.
 *  - Q89 : la barre du téléphone appelait « Factures » la rubrique « Ma facturation ».
 * Les pages sont des composants serveur : on les appelle comme Next le fait, puis on rend l'arbre obtenu.
 */
process.env.TZ = "UTC";

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreneauMission, LigneAgenda } from "@/app/artisan/acces";

const b = vi.hoisted(() => ({
  agenda: { lignes: [] as LigneAgenda[], erreur: false },
  creneaux: new Map<string, { lignes: CreneauMission[]; erreur: boolean }>(),
  lectureEnEchec: false,
  // Relecture du lot L4 : la lecture réussit mais ne rend aucune fiche (compte sans fiche artisan).
  sansFiche: false,
  redirections: [] as string[],
  activite: null as unknown,
  chemin: "/artisan",
}));

vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
  usePathname: () => b.chemin,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, refresh() {} }),
  redirect: (vers: string) => { b.redirections.push(vers); throw new Error(`redirect:${vers}`); },
  notFound: () => { throw new Error("notFound"); },
}));
// La garde réelle (acces.ts) lit la fiche par ce client : la session est ouverte, la lecture de la fiche échoue.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: async () => ({ data: null, error: { message: "lecture impossible" } }),
  }),
}));
const fiche = { artisan_id: "a1", statut_plateforme: "valide", siret_etat: "verifie", visibilite: "publique", metiers: ["plomberie"], codes_postaux: ["75012"] };
vi.mock("@/app/artisan/acces", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/artisan/acces")>()),
  verifierAccesArtisan: async () => ({ fiche, user: { id: "u1" }, supabase: { rpc: async () => ({ data: null, error: null }) } }),
  chargerFicheArtisan: async () => ({ user: { id: "u1" }, fiche: b.lectureEnEchec || b.sansFiche ? null : fiche, erreur: b.lectureEnEchec }),
  chargerAgenda: async () => b.agenda,
  chargerCreneauxMission: async (id: string) => b.creneaux.get(id) ?? { lignes: [], erreur: false },
  chargerSollicitations: async () => ({ lignes: [], erreur: false }),
  chargerPieces: async () => ({ lignes: [], erreur: false }),
  chargerDemandesRdv: async () => ({ lignes: [], erreur: false }),
  chargerEchangesNonLus: async () => ({ lignes: [], erreur: false }),
  chargerReglementsFactures: async () => ({ lignes: [], erreur: false }),
  chargerFacturesRefusees: async () => ({ lignes: [], erreur: false }),
  chargerRendezVousManques: async () => ({ lignes: [], erreur: false }),
  chargerRelancesFactures: async () => ({ lignes: [], erreur: false }),
  chargerPhotosDemande: async () => ({ photos: [], erreur: false }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return { ...reel, environnementArtisanLocal: () => true, activationModuleArtisan: () => true, chargerActivitePrivee: async () => ({ data: b.activite }) };
});
// Les mêmes doublures que tests/lot49-reprise-ecrans-artisan.test.ts pour rendre la fiche de mission sans base.
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: (_: unknown, initial: unknown) => [initial, () => {}] }));
vi.mock("@/components/ui/bouton-envoi", () => ({ BoutonEnvoi: () => null }));
vi.mock("@/app/artisan/photos-demande", () => ({ PhotosDeLaDemande: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/accuse-annulation", () => ({ AccuseAnnulation: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/accepter-refuser", () => ({ AccepterOuRefuser: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/avertissement-rendez-vous", () => ({ AvertissementRendezVousAnticipe: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/bouton-demarrer", () => ({ BoutonDemarrer: () => null }));
vi.mock("@/app/artisan/missions/[interventionId]/dates-locataire", () => ({ DatesLocataire: () => null }));
vi.mock("@/components/echanges-intervention", () => ({ EchangesIntervention: () => null }));

import PageArtisanAccueil from "@/app/artisan/page";
import PageChantier from "@/app/artisan/chantiers/[chantierId]/page";
import PageFacture from "@/app/artisan/missions/[interventionId]/facture/page";
import PageMission from "@/app/artisan/missions/[interventionId]/page";
import PagePanneArtisan, { generateMetadata as metadonneesPanne } from "@/app/artisan/panne/page";
import { NavArtisan } from "@/components/nav-artisan";
import { CONSIGNE_PLUS_DE_DATE } from "@/app/artisan/agenda/dates-a-garder";
import { creneauTexte } from "@/app/artisan/libelles";

const texte = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/[\s  ]+/g, " ").trim();

const mission = (surcharge: Partial<LigneAgenda> = {}): LigneAgenda => ({
  intervention_id: "mission", organization_id: "org", agence_nom: "Agence du Port", incident_numero: "INC-1", statut: "acceptee",
  debut_prevu: null, fin_prevue: null, categorie: "plomberie_canalisation", description: null, urgence: "normale",
  piece: "Cuisine", nature_travaux: "entretien_courant", adresse: "1 rue du Test", code_postal: "44000", ville: "Nantes", lot_nom: null, etage: null,
  occupant_nom: null, occupant_prenom: null, occupant_telephone: null, montant_ttc_cents: null, montant_plafond_cents: null, montant_final_cents: null,
  compte_rendu_depose: false, photo_apres_deposee: false, facture_deposee: false, creneaux_en_attente: 0, dates_locataire_en_attente: 0,
  ...surcharge,
});
const creneau = (debut: string, fin: string, propose_par: CreneauMission["propose_par"] = "artisan"): CreneauMission =>
  ({ creneau_id: `${debut}-${propose_par}`, propose_par, tour: 1, debut, fin, statut: "propose" });

beforeEach(() => {
  b.agenda = { lignes: [], erreur: false };
  b.creneaux = new Map();
  b.lectureEnEchec = false;
  b.sansFiche = false;
  b.redirections = [];
  b.chemin = "/artisan";
});

describe("« Aujourd'hui » : la carte « Dates proposées » écrit les dates encore à venir, plus le compteur brut", () => {
  const accueil = async () => renderToStaticMarkup(await PageArtisanAccueil());

  it("trois dates comptées, deux encore à venir : « 2 dates », et les deux dates à garder libres", async () => {
    b.agenda = { lignes: [mission({ intervention_id: "a", incident_numero: "INC-A", creneaux_en_attente: 3 })], erreur: false };
    b.creneaux.set("a", { erreur: false, lignes: [
      creneau("2099-01-06T08:00:00Z", "2099-01-06T10:00:00Z"),
      creneau("2099-01-05T13:00:00Z", "2099-01-05T15:00:00Z"),
      // Une contre-proposition du locataire n'est pas une date que l'artisan garde libre.
      creneau("2099-01-07T08:00:00Z", "2099-01-07T10:00:00Z", "locataire"),
    ] });
    const html = await accueil();
    const lu = texte(html);
    expect(lu).toContain("Dates proposées, réponse attendue (1)");
    expect(lu).toContain("2 dates au choix du locataire");
    expect(lu).not.toContain("3 dates au choix du locataire");
    expect(html).toContain("data-dates-a-garder");
    const premiere = creneauTexte("2099-01-05T13:00:00Z", "2099-01-05T15:00:00Z");
    const seconde = creneauTexte("2099-01-06T08:00:00Z", "2099-01-06T10:00:00Z");
    expect(html).toContain(`<li>${premiere}</li><li>${seconde}</li>`);
    expect(html).not.toContain(creneauTexte("2099-01-07T08:00:00Z", "2099-01-07T10:00:00Z"));
  });

  it("toutes les dates proposées sont passées : la mission revient « à fixer », avec la consigne de la fiche", async () => {
    b.agenda = { lignes: [
      mission({ intervention_id: "a", incident_numero: "INC-A", creneaux_en_attente: 1 }),
      mission({ intervention_id: "b", incident_numero: "INC-B", creneaux_en_attente: 2 }),
    ], erreur: false };
    b.creneaux.set("a", { erreur: false, lignes: [creneau("2099-01-05T08:00:00Z", "2099-01-05T10:00:00Z")] });
    b.creneaux.set("b", { erreur: false, lignes: [] });
    const lu = texte(await accueil());
    const aFixer = lu.slice(lu.indexOf("Rendez-vous à fixer (1)"), lu.indexOf("Dates proposées, réponse attendue (1)"));
    expect(aFixer).toContain("INC-B");
    expect(aFixer).toContain(CONSIGNE_PLUS_DE_DATE);
    expect(aFixer).not.toContain("En attente du locataire");
    const enAttente = lu.slice(lu.indexOf("Dates proposées, réponse attendue (1)"));
    expect(enAttente).toContain("INC-A");
    expect(enAttente).not.toContain("INC-B");
    expect(lu).not.toContain("2 dates au choix du locataire");
  });

  it("lecture des dates en échec : le compteur reste, avec le renvoi à la fiche (jamais « aucune date »)", async () => {
    b.agenda = { lignes: [mission({ intervention_id: "c", incident_numero: "INC-C", creneaux_en_attente: 1 })], erreur: false };
    b.creneaux.set("c", { erreur: true, lignes: [] });
    const lu = texte(await accueil());
    expect(lu).toContain("Dates proposées, réponse attendue (1)");
    expect(lu).toContain("1 date au choix du locataire — dates à vérifier sur la fiche");
    expect(lu).not.toContain(CONSIGNE_PLUS_DE_DATE);
  });
});

describe("fiche de chantier : le volet « Voir mes autres rendez-vous avant de choisir » porte un chevron", () => {
  it("le titre du volet a son chevron, qui se retourne à l'ouverture, et le triangle du navigateur reste masqué", async () => {
    b.activite = {
      clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le: null }],
      chantiers: [{ id: "h1", client_id: "c1", titre: "Chantier TEST", adresse: "1 rue des Tests", description: "Fuite", statut: "accepte", revision: 1, bilan: null, photo_id: null }],
      devis: [], rendez_vous: [], factures: [], pieces: [], reglements: [], evenements: [], avoirs: [],
      activation: { clients: true, reglements: true },
    };
    const html = renderToStaticMarkup(await PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    const volet = /<details\b([^>]*)><summary\b([^>]*)>((?:(?!<\/summary>)[\s\S])*Voir mes autres rendez-vous avant de choisir(?:(?!<\/summary>)[\s\S])*)<\/summary>/.exec(html);
    expect(volet).not.toBeNull();
    const [, details, summary, contenu] = volet!;
    expect(details).toMatch(/class="group /);
    expect(summary).toContain("list-none");
    expect(summary).toContain("[&amp;::-webkit-details-marker]:hidden");
    expect(contenu).toMatch(/<svg\b[^>]*lucide-chevron-down[^>]*group-open:rotate-180/);
  });
});

describe("/facture : le renvoi à la fiche de mission dit pourquoi", () => {
  const facture = async (ligne: LigneAgenda) => {
    b.agenda = { lignes: [ligne], erreur: false };
    return PageFacture({ params: Promise.resolve({ interventionId: "mission" }) } as Parameters<typeof PageFacture>[0]);
  };
  const fiche = async (ligne: LigneAgenda, raison?: string) => {
    b.agenda = { lignes: [ligne], erreur: false };
    return texte(renderToStaticMarkup(await PageMission({ params: Promise.resolve({ interventionId: "mission" }), searchParams: Promise.resolve(raison ? { raison } : {}) } as Parameters<typeof PageMission>[0])));
  };
  const TROP_TOT = "La facture se dépose une fois l’intervention terminée, avec son compte rendu et la photo du travail réalisé.";
  const DEJA = "Votre facture est déjà déposée : elle ne se dépose qu’une fois, et son suivi se lit ci-dessous.";

  it("intervention en cours, ou facture déjà déposée : renvoi avec ?raison=facture", async () => {
    await expect(facture(mission({ statut: "en_cours" }))).rejects.toThrow("redirect:/artisan/missions/mission?raison=facture");
    await expect(facture(mission({ statut: "terminee", compte_rendu_depose: true, photo_apres_deposee: true, facture_deposee: true }))).rejects.toThrow("redirect:/artisan/missions/mission?raison=facture");
    expect(b.redirections).toEqual(["/artisan/missions/mission?raison=facture", "/artisan/missions/mission?raison=facture"]);
  });

  it("la fiche de mission écrit la raison qui vaut encore", async () => {
    expect(await fiche(mission({ statut: "en_cours" }), "facture")).toContain(TROP_TOT);
    const deposee = await fiche(mission({ statut: "terminee", compte_rendu_depose: true, photo_apres_deposee: true, facture_deposee: true }), "facture");
    expect(deposee).toContain(DEJA);
    expect(deposee).not.toContain(TROP_TOT);
  });

  it("témoins : sans le paramètre, ou une fois la facture déposable, la fiche ne dit rien de plus", async () => {
    expect(await fiche(mission({ statut: "en_cours" }))).not.toContain(TROP_TOT);
    const deposable = await fiche(mission({ statut: "terminee", compte_rendu_depose: true, photo_apres_deposee: true }), "facture");
    expect(deposable).not.toContain(TROP_TOT);
    expect(deposable).not.toContain(DEJA);
    expect(deposable).toContain("Déposer ma facture");
  });
});

describe("R9 — plus de renvois en boucle entre /artisan et /artisan/panne", () => {
  const panne = async (essai?: string) =>
    PagePanneArtisan({ params: Promise.resolve({}), searchParams: Promise.resolve(essai ? { essai } : {}) } as Parameters<typeof PagePanneArtisan>[0]);

  it("la garde qui ne lit pas la fiche envoie vers la panne avec ?essai=1", async () => {
    const { verifierAccesArtisan } = await vi.importActual<typeof import("@/app/artisan/acces")>("@/app/artisan/acces");
    await expect(verifierAccesArtisan()).rejects.toThrow("redirect:/artisan/panne?essai=1");
  });

  it("venue de la garde, la page ne renvoie plus d'elle-même : la fiche se lit de nouveau, elle le dit et laisse repartir d'un geste", async () => {
    const html = renderToStaticMarkup(await panne("1"));
    expect(b.redirections).toEqual([]);
    expect(texte(html)).toContain("Votre fiche se lit de nouveau");
    expect(html).toMatch(/<a [^>]*href="\/artisan"[^>]*>Revenir à mon espace<\/a>/);
    expect(texte(html)).not.toContain("n'a pas pu être lue");
  });

  it("témoin (passait déjà) : venue de la garde, la lecture échoue encore : le message d’échec, comme avant", async () => {
    b.lectureEnEchec = true;
    const lu = texte(renderToStaticMarkup(await panne("1")));
    expect(b.redirections).toEqual([]);
    expect(lu).toContain("Lecture momentanément impossible");
    expect(lu).toContain("Réessayer");
  });

  it("témoin (passait déjà) : ouverte sans le paramètre (favori, historique), une lecture réussie renvoie à l'espace", async () => {
    await expect(panne()).rejects.toThrow("redirect:/artisan");
    expect(b.redirections).toEqual(["/artisan"]);
  });
});

describe("Relecture du lot L4 — la page de panne dit ce que la lecture a rendu, jusque dans l'onglet", () => {
  const panne = async (essai?: string) =>
    PagePanneArtisan({ params: Promise.resolve({}), searchParams: Promise.resolve(essai ? { essai } : {}) } as Parameters<typeof PagePanneArtisan>[0]);
  const titreEcran = (html: string) => texte(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");

  it("le titre de l'onglet suit la lecture : « Lecture impossible » seulement si elle échoue encore", async () => {
    b.lectureEnEchec = true;
    expect(await metadonneesPanne()).toEqual({ title: "Lecture impossible" });
    b.lectureEnEchec = false;
    expect(await metadonneesPanne()).toEqual({ title: "Votre fiche se lit de nouveau" });
    b.sansFiche = true;
    expect(await metadonneesPanne()).toEqual({ title: "Lecture rétablie" });
  });

  it.each([["fiche relue", false], ["lecture réussie sans fiche", true]])("%s : l'onglet porte le titre de l'écran", async (_cas, sansFiche) => {
    b.sansFiche = sansFiche;
    const html = renderToStaticMarkup(await panne("1"));
    expect(titreEcran(html)).toBeTruthy();
    expect((await metadonneesPanne()).title).toBe(titreEcran(html));
  });

  it("lecture réussie sans fiche (compte non artisan) : une phrase neutre, le même bouton, aucun renvoi", async () => {
    b.sansFiche = true;
    const html = renderToStaticMarkup(await panne("1"));
    expect(b.redirections).toEqual([]);
    const lu = texte(html);
    expect(lu).toContain("La lecture fonctionne de nouveau.");
    expect(lu).not.toContain("Votre fiche se lit de nouveau");
    expect(lu).not.toContain("Rien n'est perdu");
    expect(html).toMatch(/<a [^>]*href="\/artisan"[^>]*>Revenir à mon espace<\/a>/);
  });

  it("témoin (passait déjà) : fiche relue, la phrase sur la fiche reste", async () => {
    const lu = texte(renderToStaticMarkup(await panne("1")));
    expect(lu).toContain("La lecture de votre fiche a réussi à l'instant. Rien n'est perdu.");
  });

  it("le paramètre de la page est obligatoire : sans lui, l'appel ne se compile plus (tenu par tsc)", () => {
    // @ts-expect-error — Next passe toujours `params` et `searchParams` ; un appel sans eux est une erreur de type.
    const sansParametres = () => PagePanneArtisan();
    expect(sansParametres).toBeTypeOf("function");
  });
});

describe("Q89 — la barre du téléphone nomme la rubrique comme la page", () => {
  it("« Facturation », plus « Factures » ; le menu latéral garde les titres des pages", () => {
    b.chemin = "/artisan/facturation";
    const mobile = renderToStaticMarkup(createElement(NavArtisan));
    expect(mobile).toMatch(/<a\b[^>]*href="\/artisan\/facturation"[^>]*>(?:(?!<\/a>)[\s\S])*>Facturation<\/span><\/a>/);
    expect(mobile).not.toContain(">Factures<");
    const bureau = texte(renderToStaticMarkup(createElement(NavArtisan, { presentation: "bureau" })));
    expect(bureau).toContain("Ma facturation");
    expect(bureau).toContain("Ma fiche entreprise");
  });

  it("relecture du lot L4 : les commentaires ne disent plus que la barre appelle la page « Factures »", () => {
    for (const fichier of ["src/app/artisan/clients/elements.tsx", "tests/artisan-ergonomie-des-b.test.ts"]) {
      expect(readFileSync(fichier, "utf8"), fichier).not.toContain("s'appelle « Factures »");
    }
  });
});
