/**
 * ARTISAN : RELANCE D'UNE FACTURE ET RENDEZ-VOUS MANQUÉ — audit palier 1 du 22/11/2026, P2-04. Sans base.
 *
 * Ces tests tiennent :
 *  1. ce que lit le locataire : le dernier rendez-vous manqué de chaque intervention, tant qu'aucun nouveau n'est
 *     fixé ; la phrase dit qui est dit absent, par qui, et quoi faire s'il n'est pas d'accord ;
 *  2. les actions : aucune n'accepte d'artisan ni d'auteur en paramètre ; l'artisan confirme avoir été sur place ; les
 *     saisies trop longues ou illisibles sont refusées avant la base ; le message de la base est rendu tel quel ;
 *  3. les deux alertes et les deux lignes de chronologie ont leur libellé et leur destination ;
 *  4. les écrans : formulaires protégés avec le bouton d'envoi commun, l'indicateur de l'artisan n'est plus « pas
 *     encore mesuré », la relance se lit sur la facture du gestionnaire.
 * La base est tenue par tests/artisan-relance-rdv-manque-base.test.ts, le parcours par
 * e2e/artisan-relance-rdv-manque.spec.ts.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  fiche: { artisan_id: "artisan-test" } as null | Record<string, unknown>,
  gerant: { id: "gerant-test" } as null | Record<string, unknown>,
  appels: [] as [string, Record<string, unknown>][],
  erreur: null as null | string,
}));
const supabase = { rpc: async (nom: string, args: Record<string, unknown>) => { banc.appels.push([nom, args]); return { data: null, error: banc.erreur ? { message: banc.erreur } : null }; } };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/artisan/acces", () => ({ verifierArtisanAction: async () => ({ fiche: banc.fiche, supabase }) }));
vi.mock("@/app/artisan/devis/actions-preparation", () => ({ envoyerDevisValide: vi.fn() }));

import { consignerMonRendezVousManque, relancerMaFacture } from "@/app/actions/artisan";
import { FormulaireRendezVousManque } from "@/app/artisan/missions/[interventionId]/rendez-vous-manque";
import { RelanceFacture } from "@/app/artisan/missions/[interventionId]/relance-facture";
import { cheminFicheAlerte, gesteAlerte } from "@/lib/chemin-alerte";
import { TYPES_EVENEMENT_INCIDENT } from "@/lib/incidents";
import { phraseRendezVousManque, rendezVousManquesAffiches, type RendezVousManqueLocataire } from "@/lib/rendez-vous-manque";

const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const ID = "11111111-1111-4111-8111-111111111111";
const FACTURE = "22222222-2222-4222-8222-222222222222";
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

beforeEach(() => { banc.fiche = { artisan_id: "artisan-test" }; banc.appels = []; banc.erreur = null; });

describe("ce que lit le locataire", () => {
  const manque = (intervention: string, rdv: string, absent: "locataire" | "artisan" = "locataire", role: "artisan" | "gestionnaire" = "artisan"): RendezVousManqueLocataire =>
    ({ incident_id: `inc-${intervention}`, intervention_id: intervention, rdv_debut: rdv, absent, consigne_role: role, consigne_le: rdv });
  const suivi = (intervention: string, rdv: string | null = null, terminee: string | null = null) =>
    ({ incident_id: `inc-${intervention}`, intervention_id: intervention, rdv_debut: rdv, terminee_le: terminee });

  it("le dernier rendez-vous manqué de chaque intervention, et seulement tant qu'aucun nouveau n'est fixé", () => {
    const lignes = [manque("a", "2026-11-10T09:00:00Z"), manque("a", "2026-11-18T09:00:00Z", "artisan", "gestionnaire"), manque("b", "2026-11-12T14:00:00Z")];
    expect(rendezVousManquesAffiches(lignes, [suivi("a"), suivi("b")]).map((l) => [l.intervention_id, l.rdv_debut, l.absent]))
      .toEqual([["a", "2026-11-18T09:00:00Z", "artisan"], ["b", "2026-11-12T14:00:00Z", "locataire"]]);
    // Un nouveau rendez-vous est fixé, l'intervention est terminée, ou elle n'est plus suivie : l'avis disparaît.
    expect(rendezVousManquesAffiches(lignes, [suivi("a", "2026-11-25T09:00:00Z"), suivi("b", null, "2026-11-20T10:00:00Z")])).toEqual([]);
    expect(rendezVousManquesAffiches(lignes, [])).toEqual([]);
    expect(rendezVousManquesAffiches([], [suivi("a")])).toEqual([]);
  });

  it("la phrase dit qui est dit absent, par qui, et quoi faire en cas de désaccord", () => {
    expect(phraseRendezVousManque({ absent: "locataire", consigne_role: "artisan" }))
      .toBe("L’artisan a indiqué que vous étiez absent. Un nouveau rendez-vous va être convenu. Si vous étiez présent, écrivez-le dans la discussion de l’intervention, plus bas dans cette page.");
    expect(phraseRendezVousManque({ absent: "locataire", consigne_role: "gestionnaire" }))
      .toBe("Votre propriétaire a consigné que vous étiez absent. Un nouveau rendez-vous va être convenu. Si vous étiez présent, écrivez-le dans la discussion de l’intervention, plus bas dans cette page.");
    expect(phraseRendezVousManque({ absent: "artisan", consigne_role: "gestionnaire" }))
      .toBe("Votre propriétaire a consigné que l’artisan ne s’est pas présenté. Un nouveau rendez-vous va être convenu.");
  });

  it("sa page lit la fonction qui ne rend jamais la précision libre, et mène à la demande concernée", () => {
    const page = lire("src/app/locataire/[orgId]/demandes/page.tsx");
    expect(page).toContain('supabase.rpc("mes_rdv_manques_locataire", { p_org: orgId })');
    expect(page).toContain("data-rdv-manque={m.absent}");
    // La date est dite en toutes lettres, à l'heure de Paris, comme les autres rendez-vous du locataire.
    expect(page).toContain("Rendez-vous manqué {instantRdv(m.rdv_debut)}");
    expect(page).toContain("href={`#demande-${m.incident_id}`}");
    expect(lire("src/lib/rendez-vous-manque.ts")).not.toMatch(/\bnote\b\s*[:?]/);
  });
});

describe("les actions de l'artisan", () => {
  it("rendez-vous manqué : il confirme avoir été sur place ; la précision est bornée ; rien ne désigne un autre artisan", async () => {
    expect(await consignerMonRendezVousManque(ID, {}, formulaire({ note: "Personne" })))
      .toEqual({ erreur: "Cochez la case pour confirmer que vous étiez sur place et que le locataire était absent." });
    expect(await consignerMonRendezVousManque(ID, {}, formulaire({ confirmation: "oui", note: "x".repeat(501) })))
      .toEqual({ erreur: "Raccourcissez votre précision (500 caractères au plus)." });
    expect(await consignerMonRendezVousManque("pas-un-identifiant", {}, formulaire({ confirmation: "oui" }))).toEqual({ erreur: "Mission introuvable." });
    expect(banc.appels).toEqual([]);

    expect(await consignerMonRendezVousManque(ID, {}, formulaire({ confirmation: "oui", note: "  Attendu 20 minutes  ", artisan_id: "un-autre", absent: "artisan" })))
      .toEqual({ succes: "Rendez-vous manqué consigné : votre client est prévenu. Proposez de nouvelles dates quand vous le pouvez." });
    expect(await consignerMonRendezVousManque(ID, {}, formulaire({ confirmation: "oui" }))).toMatchObject({ succes: expect.any(String) });
    expect(banc.appels).toEqual([
      ["consigner_rdv_manque_artisan", { p_intervention: ID, p_note: "Attendu 20 minutes" }],
      ["consigner_rdv_manque_artisan", { p_intervention: ID, p_note: null }],
    ]);
  });

  it("relance : la facture seule est transmise ; le message de la base (délai, facture réglée) est rendu tel quel", async () => {
    expect(await relancerMaFacture("x", ID, {}, formulaire({}))).toEqual({ erreur: "Facture introuvable." });
    expect(await relancerMaFacture(FACTURE, ID, {}, formulaire({ artisan_id: "un-autre" })))
      .toEqual({ succes: "Relance enregistrée : votre client la voit dans son espace, sur le dossier de l’intervention. Aucun e-mail n’est envoyé." });
    expect(banc.appels).toEqual([["relancer_ma_facture", { p_facture: FACTURE }]]);
    banc.erreur = "Une facture se relance à partir de 30 jours après son dépôt : vous pourrez relancer celle-ci le 22/12/2026";
    expect(await relancerMaFacture(FACTURE, ID, {}, formulaire({})))
      .toEqual({ erreur: "Une facture se relance à partir de 30 jours après son dépôt : vous pourrez relancer celle-ci le 22/12/2026" });
  });

  it("sans fiche d'artisan, aucune des deux n'appelle la base", async () => {
    banc.fiche = null;
    expect((await consignerMonRendezVousManque(ID, {}, formulaire({ confirmation: "oui" }))).erreur).toBeTruthy();
    expect((await relancerMaFacture(FACTURE, ID, {}, formulaire({}))).erreur).toBeTruthy();
    expect(banc.appels).toEqual([]);
  });

  it("l'action du gestionnaire exige « locataire » ou « artisan » et borne la précision avant la base", () => {
    const action = lire("src/app/actions/incidents.ts");
    const bloc = action.slice(action.indexOf("export async function consignerRendezVousManque"), action.indexOf("// RM-7.5.3"));
    expect(bloc).toContain("await verifierGerant(orgId)");
    expect(bloc).toContain('if (absent !== "locataire" && absent !== "artisan")');
    expect(bloc).toContain("if (note.length > 500)");
    expect(bloc.indexOf("note.length > 500")).toBeLessThan(bloc.indexOf('supabase.rpc("consigner_rdv_manque"'));
    expect(bloc).toContain("p_org: orgId");
  });
});

describe("alertes et chronologie", () => {
  it("les deux lignes de chronologie ont leur libellé, et l'écran du gestionnaire leur détail", () => {
    expect(TYPES_EVENEMENT_INCIDENT.rdv_manque).toBe("Rendez-vous manqué");
    expect(TYPES_EVENEMENT_INCIDENT.facture_relancee).toBe("Facture relancée par l'artisan");
    const fiche = lire("src/app/agence/[orgId]/incidents/pane-incident.tsx");
    expect(fiche).toContain('case "rdv_manque":');
    expect(fiche).toContain('case "facture_relancee":');
    expect(fiche).toContain("le locataire était absent");
    expect(fiche).toContain("l’artisan était absent");
  });

  it("les deux alertes mènent au dossier de l'incident et se ferment d'elles-mêmes", () => {
    const details = { incident_id: "inc-1", intervention_id: "int-1" };
    for (const [type, libelle] of [["rdv_manque", "Convenir d’un nouveau rendez-vous"], ["facture_artisan_relancee", "Voir la facture relancée par l’artisan"]] as const) {
      const alerte = { type, details } as never;
      expect(cheminFicheAlerte(alerte, "org-1")).toBe("/agence/org-1/incidents?sel=inc-1");
      expect(gesteAlerte(alerte, "org-1")).toMatchObject({ libelle, seFermeSeule: true });
      // Sans incident dans la charge utile : aucun lien fabriqué.
      expect(gesteAlerte({ type, details: {} } as never, "org-1")).toBeNull();
    }
  });
});

describe("les écrans", () => {
  it("l'artisan : case de confirmation obligatoire, précision facultative, bouton d'envoi commun", () => {
    const html = renderToStaticMarkup(createElement(FormulaireRendezVousManque, { interventionId: ID }));
    expect(html).toContain("data-saisie-confirmee");
    expect(html).toContain("data-rdv-manque-artisan");
    const champ = (nom: string) => html.match(new RegExp(`<input[^>]*name="${nom}"[^>]*>`))?.[0] ?? "";
    expect(champ("confirmation")).toMatch(/type="checkbox"/);
    expect(champ("confirmation")).toMatch(/required/);
    expect(champ("confirmation")).toMatch(/value="oui"/);
    expect(champ("note")).toMatch(/maxlength="500"/i);
    expect(champ("note")).not.toMatch(/required/);
    const lu = texte(html);
    expect(lu).toContain("J’étais sur place à l’heure du rendez-vous et le locataire était absent.");
    expect(lu).toContain("Consigner l’absence du locataire");
    expect(lu).toContain("le locataire la lit dans sa demande");
    // L'artisan ne choisit pas qui était absent : aucun champ ne le lui propose.
    expect(html).not.toMatch(/name="absent"/);
  });

  it("l'artisan : la relance nomme la facture et dit qu'aucun e-mail ne part", () => {
    const html = renderToStaticMarkup(createElement(RelanceFacture, { factureId: FACTURE, interventionId: ID, numero: "F-2026-41" }));
    expect(html).toContain("data-saisie-confirmee");
    const lu = texte(html);
    expect(lu).toContain("Relancer mon client pour la facture n° F-2026-41");
    expect(lu).toContain("Aucun e-mail n’est envoyé.");
  });

  it("la mission de l'artisan : le geste n'est offert qu'une fois l'heure passée ; la relance selon ce que dit la base", () => {
    const page = lire("src/app/artisan/missions/[interventionId]/page.tsx");
    expect(page).toContain('mission.statut === "planifiee" && Boolean(mission.debut_prevu) && new Date(mission.debut_prevu!).getTime() <= new Date().getTime()');
    expect(page).toContain("{rendezVousPasse && !reportEnAttente && (");
    expect(page).toContain("{relance.relancable ? (");
    expect(page).toContain("(30 jours après le dépôt)");
    expect(page).toContain("votre client a indiqué que vous ne vous êtes pas présenté.");
    // Une lecture en échec se dit, elle ne se déguise pas en « rien ».
    expect(page).toContain("Les rendez-vous manqués de cette mission n’ont pas pu être lus");
    expect(page).toContain("L’état de relance de cette facture n’a pas pu être lu");
  });

  it("« Mes évaluations » : les rendez-vous manqués sont mesurés, et n'entrent toujours pas dans la note", () => {
    const page = lire("src/app/artisan/note/page.tsx");
    expect(page).not.toContain("ne sont pas encore mesurés");
    expect(page).toContain("Rendez-vous manqués sur douze mois : aucun.");
    expect(page).toContain("Vos rendez-vous manqués n’ont pas pu être lus à l’instant.");
    expect(page).toContain("Ces indicateurs n’entrent pas dans le calcul de votre note.");
  });

  it("le gestionnaire : le formulaire n'apparaît qu'après l'heure du rendez-vous ; la relance se lit sur la facture", () => {
    const volet = lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
    expect(volet).toContain('mission.statut === "planifiee" && mission.debut_prevu && new Date(mission.debut_prevu).getTime() <= maintenant');
    const formulaires = lire("src/app/agence/[orgId]/incidents/formulaires-artisan.tsx");
    const bloc = formulaires.slice(formulaires.indexOf("export function FormulaireRendezVousManque"), formulaires.indexOf("// RM-10.4.1"));
    expect(bloc).toContain("data-saisie-confirmee");
    expect(bloc).toContain('name="absent" value="locataire" required');
    expect(bloc).toContain('name="absent" value="artisan" required');
    expect(bloc).toContain("<BoutonEnvoi");
    expect(bloc).toContain("qui n’entre pas dans sa note");
    const factures = lire("src/app/agence/[orgId]/incidents/factures-incident.tsx");
    expect(factures).toContain("relancee_le,relances");
    expect(factures).toContain("data-facture-relancee");
    expect(factures).toContain('f.relancee_le && etat !== "reglee" && etat !== "refusee"');
  });
});
