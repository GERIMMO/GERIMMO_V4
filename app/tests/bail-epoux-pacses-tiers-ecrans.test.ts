/**
 * Relecture de la fusion du 25/11/2026, constat A-01 — case « mariés ou pacsés » : ce que les écrans et l'action d'ajout
 * disent d'une personne ajoutée au bail après sa signature (la base : tests/bail-epoux-pacses-tiers-base.test.ts).
 *
 *  - Fiche d'un bail signé coché : l'ajout d'un colocataire est précédé d'un avertissement (la personne ajoutée garde la
 *    règle de la colocation, elle et son garant) ; pour une ligne marquée « entrée après la signature », les textes du départ
 *    sont ceux de la colocation, jamais « aucune fin de solidarité enregistrée (époux ou pacsés) ».
 *  - L'action d'ajout le redit dans son message de réussite.
 *  - Préparation d'un bail coché à deux locataires : le bouton « Ajouter un colocataire » laisse la place à une note
 *    (décocher d'abord) ; la base refuse aussi le troisième.
 *  - La fiche lit la marque à part, et une lecture en échec rend les textes d'avant (ceux que la base applique sans la
 *    migration 20261125153000).
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ acces: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: vi.fn() }));

import { ajouterBailPersonne } from "@/app/actions/baux";
import { FormulaireColocation, type LigneColoc } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-colocation";
import {
  AIDE_GARANTS_EPOUX_PACS, AVERTISSEMENT_AJOUT_EPOUX_PACS, NOTE_TROISIEME_EPOUX_PACS, SOLIDAIRE_SANS_FIN_EPOUX_PACS, SUCCES_AJOUT_EPOUX_PACS,
} from "@/lib/solidarite-colocation";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const source = (chemin: string) => readFileSync(chemin, "utf8");
const D = "src/app/agence/[orgId]/baux/[bailId]/";

/** Une base imitée : `baux` lu par maybeSingle, l'insertion notée. */
function baseImitee(baux: Record<string, unknown>) {
  const insertions: unknown[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "in", "order", "limit"]) q[op] = () => q;
    q.maybeSingle = async () => ({ data: table === "baux" ? baux : null, error: null });
    q.insert = async (v: unknown) => { insertions.push(v); return { error: null }; };
    return q;
  };
  m.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { from } });
  return insertions;
}
const colocataire = () => { const f = new FormData(); f.set("person_id", "p3"); f.set("role", "colocataire"); return f; };
beforeEach(() => vi.clearAllMocks());

describe("A-01 — l'action d'ajout d'un colocataire", () => {
  it("bail signé coché : le message dit que la personne ajoutée garde la règle de la colocation ; sinon, le message d'avant", async () => {
    const ins = baseImitee({ etat: "actif", locataires_epoux_pacses: true });
    expect((await ajouterBailPersonne("org", "bail", {}, colocataire())).succes).toBe(SUCCES_AJOUT_EPOUX_PACS);
    expect(ins).toHaveLength(1);
    baseImitee({ etat: "actif", locataires_epoux_pacses: false });
    expect((await ajouterBailPersonne("org", "bail", {}, colocataire())).succes).toBe("Colocataire ajouté.");
    // Un garant ajouté : le message d'avant (son engagement suit la personne qu'il couvre).
    baseImitee({ etat: "actif", locataires_epoux_pacses: true });
    const g = new FormData(); g.set("person_id", "g1"); g.set("role", "garant"); g.set("garant_de", "p3");
    expect((await ajouterBailPersonne("org", "bail", {}, g)).succes).toBe("Garant ajouté.");
  });
});

describe("A-01 — la carte « Colocataires & garants » d'un bail signé", () => {
  const ligne = (o: Partial<LigneColoc>): LigneColoc => ({ id: "l", person_id: "p", person_nom: "Personne", role: "colocataire", quote_part: null, surface_privative: null, garant_de: null, garant_de_nom: null, ...o });
  const rendre = (epouxPacs: boolean, lignes: LigneColoc[], etatBail = "actif") => texte(renderToStaticMarkup(
    createElement(FormulaireColocation, { orgId: "org", bailId: "bail", personnes: [], principal: { id: "pa", nom: "Époux A" }, colocation: true, lignes, etatBail, epouxPacs }),
  ));
  it("case cochée : l'avertissement précède l'ajout ; l'époux parti « sans fin » ; le tiers parti, sa date, jamais le texte des époux", () => {
    const html = rendre(true, [
      ligne({ id: "lb", person_id: "pb", person_nom: "Époux B", date_depart: "2026-01-31", date_solidarite_fin: null }),
      ligne({ id: "lc", person_id: "pc", person_nom: "Tiers C", date_depart: "2026-03-31", date_solidarite_fin: "2026-09-30", entree_apres_signature: true }),
      // Tiers parti avant la migration (fin vide) : le texte des époux ne le décrit pas non plus.
      ligne({ id: "ld", person_id: "pd", person_nom: "Tiers D", date_depart: "2026-02-28", date_solidarite_fin: null, entree_apres_signature: true }),
    ]);
    expect(html).toContain(AVERTISSEMENT_AJOUT_EPOUX_PACS);
    expect(html.split(SOLIDAIRE_SANS_FIN_EPOUX_PACS)).toHaveLength(2); // une seule fois : l'époux B
    expect(html).toMatch(/Époux B .*parti le 31\/01\/2026 · aucune fin de solidarité enregistrée/);
    expect(html).toMatch(/Tiers C .*parti le 31\/03\/2026 · solidaire jusqu'au 30\/09\/2026/);
    expect(html).toContain(AIDE_GARANTS_EPOUX_PACS);
  });
  it("case non cochée, ou brouillon : pas d'avertissement", () => {
    expect(rendre(false, [])).not.toContain(AVERTISSEMENT_AJOUT_EPOUX_PACS);
    expect(rendre(true, [], "brouillon")).not.toContain(AVERTISSEMENT_AJOUT_EPOUX_PACS);
  });
  it("le formulaire de départ d'une ligne entrée après la signature reçoit les textes de la colocation", () => {
    expect(source(`${D}formulaire-colocation.tsx`)).toContain("epouxPacs={epouxPacs && !c.entree_apres_signature}");
  });
});

describe("A-01 — la fiche et la préparation", () => {
  it("la fiche lit la marque à part (tolérante) et la passe à chaque ligne", () => {
    const page = source(`${D}page.tsx`);
    expect(page).toContain('supabase.from("bail_personnes").select("id, entree_apres_signature")');
    expect(page).toContain("const entreesApresSignature = new Set(marquesIndisponibles ? [] :");
    expect(page).toContain("entree_apres_signature: entreesApresSignature.has(l.id),");
  });
  it("préparation d'un bail coché à deux locataires : la note remplace « Ajouter un colocataire »", () => {
    const p = source(`${D}personnes-bail.tsx`);
    expect(p).toContain("(epouxPacs && locataires.length >= 2");
    expect(p).toContain("{NOTE_TROISIEME_EPOUX_PACS}");
    expect(NOTE_TROISIEME_EPOUX_PACS).toBe("Case « mariés ou pacsés » cochée : ce bail est consenti à deux personnes. Décochez-la avant d’ajouter un troisième locataire.");
  });
  it("les textes ajoutés : seule l'article 8-1 est cité, rien de « conforme »", () => {
    for (const t of [AVERTISSEMENT_AJOUT_EPOUX_PACS, SUCCES_AJOUT_EPOUX_PACS, NOTE_TROISIEME_EPOUX_PACS, AIDE_GARANTS_EPOUX_PACS]) {
      expect(t).not.toMatch(/conforme/i);
      for (const ref of t.match(/art(?:icle|\.) [\d-]+/g) ?? []) expect(ref, t).toMatch(/8-1$/);
    }
  });
});
