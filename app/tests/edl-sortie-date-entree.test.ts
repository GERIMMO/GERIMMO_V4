/**
 * L'ÉTAT DES LIEUX DE SORTIE RAPPELLE LA DATE DE CELUI D'ENTRÉE — audit palier 1 du 22/11/2026, P0-06 (relevé A11).
 *
 * Le défaut : le document de sortie n'imprimait pas la date de l'état des lieux d'entrée, que l'écran de saisie connaît.
 *
 * Ces tests tiennent :
 *  1. le modèle : sur une sortie, « État des lieux d'entrée établi le … » avec la date ; un horodatage de signature se
 *     lit au jour de Paris ; sans date, la mention reste avec un blanc à compléter à la main, qui n'est PAS compté parmi
 *     les informations manquantes (aucun écran ne permet de le remplir) ; sur une entrée, aucune mention ;
 *  2. l'assemblage : la date vient de l'entrée SIGNÉE du même bail et du même espace, la plus récente ; à défaut de date
 *     d'établissement, celle de la signature ; aucune lecture de plus pour un état des lieux d'entrée.
 *
 * Le texte officiel n'a pas été ouvert (QUESTIONS Q5) : ces tests ne disent pas que le document est conforme, seulement
 * que la date connue de Gerimmo y est imprimée. Le rendu réel est tenu par e2e/edl-sortie-date-entree.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (original) => ({
  ...(await original<typeof import("@/lib/documents/modeles/communs")>()),
  chargerContexteBail: async () => contexte(),
}));

import { Fusion } from "@/lib/documents/gabarit";
import { assemblerEdl, construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";

function donnees(sur: Partial<DonneesEdl> = {}): DonneesEdl {
  const f = new Fusion();
  return {
    type: "sortie", reference: "EDL-1", dateEdl: "2026-09-01", signeLe: null, personnesPresentes: "Claire Moreau, Julie Leblanc",
    detecteurFumeePresent: null, detecteurFumeeEtat: null, attestationAssuranceFournie: null,
    adresseRestitutionDepot: "12 rue des Lilas, 69003 Lyon", observations: "Néant",
    lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null }],
    compteurs: [{ type: "Électricité", numero: "E-1", releve: "100" }], cles: [{ libelle: "Clé", nombre: 2, reference: null }],
    comparatif: [], retenues: [], bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc",
    logementAdresse: "12 rue des Lilas, 69003 Lyon", referenceBail: "BAIL-1",
    exp: { nom: "Parc", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@example.invalid", telephone: null, ville: "Lyon" }, f,
    ...sur,
  };
}
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("modèle de l'état des lieux de sortie : la date de l'entrée", () => {
  it("imprime « État des lieux d'entrée établi le … » avec la date de l'entrée", () => {
    const doc = construireEdl(donnees({ dateEdlEntree: "2024-03-12" }));
    expect(doc.html).toContain('data-edl-entree="connue"');
    expect(texte(doc.html)).toContain("État des lieux d'entrée établi le 12/03/2024 .");
    expect(doc.html).not.toContain("date à porter à la main");
    expect(doc.manquants).toEqual([]);
  });

  it("un horodatage de signature se lit au jour de Paris", () => {
    // 23 h 30 UTC le 11 mars = 0 h 30 le 12 mars à Paris.
    expect(texte(construireEdl(donnees({ dateEdlEntree: "2024-03-11T23:30:00+00:00" })).html)).toContain("État des lieux d'entrée établi le 12/03/2024 .");
  });

  it.each([null, undefined, ""])("sans date (%j) : la mention reste, à compléter à la main, sans rien ajouter aux informations manquantes", (dateEdlEntree) => {
    const doc = construireEdl(donnees({ dateEdlEntree }));
    expect(doc.html).toContain('data-edl-entree="a-completer"');
    expect(texte(doc.html)).toContain("État des lieux d'entrée établi le date à porter à la main — aucun état des lieux d'entrée signé n'est enregistré dans Gerimmo pour ce bail.");
    // Le blanc est imprimé comme les autres blancs du document, mais aucun écran ne permet de le remplir : il ne bloque rien.
    expect(doc.html).toContain('<span class="fusion">date à porter à la main</span>');
    expect(doc.manquants).toEqual([]);
  });

  it("la mention suit le paragraphe d'ouverture et précède la grille", () => {
    const html = construireEdl(donnees({ dateEdlEntree: "2024-03-12" })).html;
    const ouverture = html.indexOf("éléments qui le composent."), mention = html.indexOf("data-edl-entree"), grille = html.indexOf("<h3>Séjour</h3>");
    expect(ouverture).toBeGreaterThan(0);
    expect(mention).toBeGreaterThan(ouverture);
    expect(grille).toBeGreaterThan(mention);
  });

  it("un état des lieux d'entrée ne porte aucune mention de ce genre, même si une date est passée par erreur", () => {
    const html = construireEdl(donnees({ type: "entree", detecteurFumeePresent: true, detecteurFumeeEtat: "Fonctionnel", attestationAssuranceFournie: true, dateEdlEntree: "2024-03-12" })).html;
    expect(html).not.toContain("data-edl-entree");
    expect(html).not.toContain("État des lieux d'entrée établi le");
  });
});

// ── L'assemblage : quelle entrée, lue comment. Une base simulée qui note chaque lecture.
type Lecture = { table: string; colonnes: string; filtres: Record<string, unknown>; ordre?: [string, unknown]; limite?: number };
const banc = { lectures: [] as Lecture[], edl: {} as Record<string, unknown>, entree: null as Record<string, unknown> | null };

function baseSimulee() {
  return {
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      const lecture: Lecture = { table, colonnes: "", filtres: {} };
      banc.lectures.push(lecture);
      const reponse = () => {
        if (table !== "etats_des_lieux") return { data: table === "restitutions" ? null : [], error: null };
        return { data: lecture.filtres.type === "entree" ? banc.entree : banc.edl, error: null };
      };
      const q = {
        select(colonnes: string) { lecture.colonnes = colonnes; return q; },
        eq(colonne: string, valeur: unknown) { lecture.filtres[colonne] = valeur; return q; },
        order(colonne: string, options?: unknown) { lecture.ordre ??= [colonne, options]; return q; },
        limit(n: number) { lecture.limite = n; return q; },
        maybeSingle: async () => reponse(),
        then: (suite: (r: ReturnType<typeof reponse>) => unknown) => Promise.resolve(reponse()).then(suite),
      };
      return q;
    },
  };
}
const assembler = async () => {
  const resultat = await assemblerEdl(baseSimulee() as never, "org-1", "edl-sortie");
  if ("erreur" in resultat) throw new Error(resultat.erreur);
  return resultat.document;
};
const lectureEntree = () => banc.lectures.filter((l) => l.table === "etats_des_lieux" && l.filtres.type === "entree");

describe("assemblage de l'état des lieux de sortie : l'entrée signée du même bail", () => {
  beforeEach(() => {
    banc.lectures = [];
    banc.edl = { id: "edl-sortie", bail_id: "bail-1", type: "sortie", etat: "brouillon", date_edl: "2026-09-01", signe_le: null, personnes_presentes: "Claire Moreau, Julie Leblanc", detecteur_fumee_present: null, detecteur_fumee_etat: null, attestation_assurance_fournie: null, adresse_restitution_depot: "12 rue des Lilas, 69003 Lyon", observations: "Néant" };
    banc.entree = { date_edl: "2024-03-12", signe_le: "2024-03-12T09:00:00+00:00" };
  });

  it("lit l'entrée SIGNÉE du même bail et du même espace, la plus récente, et imprime sa date", async () => {
    const document = await assembler();
    expect(texte(document.html)).toContain("État des lieux d'entrée établi le 12/03/2024 .");
    const lectures = lectureEntree();
    expect(lectures).toHaveLength(1);
    expect(lectures[0].filtres).toEqual({ bail_id: "bail-1", organization_id: "org-1", type: "entree", etat: "signe" });
    expect(lectures[0].ordre).toEqual(["date_edl", { ascending: false, nullsFirst: false }]);
    expect(lectures[0].limite).toBe(1);
    expect(lectures[0].colonnes).toBe("date_edl, signe_le");
  });

  it("à défaut de date d'établissement, la date de la signature (jour de Paris)", async () => {
    banc.entree = { date_edl: null, signe_le: "2024-03-11T23:30:00+00:00" };
    expect(texte((await assembler()).html)).toContain("État des lieux d'entrée établi le 12/03/2024 .");
  });

  it("aucune entrée signée dans Gerimmo : la mention reste à compléter à la main, le document n'a pas d'information manquante de plus", async () => {
    banc.entree = null;
    const document = await assembler();
    expect(document.html).toContain('data-edl-entree="a-completer"');
    expect(document.manquants).not.toContain("date à porter à la main");
    expect(document.manquants.filter((m) => /entrée/i.test(m))).toEqual([]);
  });

  it("un état des lieux d'entrée ne déclenche aucune lecture d'une autre entrée", async () => {
    banc.edl = { ...banc.edl, id: "edl-entree", type: "entree", detecteur_fumee_present: true, detecteur_fumee_etat: "Fonctionnel", attestation_assurance_fournie: true };
    const resultat = await assemblerEdl(baseSimulee() as never, "org-1", "edl-entree");
    if ("erreur" in resultat) throw new Error(resultat.erreur);
    expect(lectureEntree()).toHaveLength(0);
    expect(resultat.document.html).not.toContain("data-edl-entree");
  });
});
