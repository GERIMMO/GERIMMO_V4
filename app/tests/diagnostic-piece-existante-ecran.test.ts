/**
 * X07 (PROP-11) — l'écran de dépôt d'un diagnostic propose « Utiliser cette pièce pour ce lot » quand le même
 * rapport est déjà rangé (DPE collectif d'un immeuble), au lieu d'afficher seulement un refus.
 *
 * Le bouton est un bouton d'envoi du MÊME formulaire (nom `piece_existante`, valeur = identifiant de la pièce) :
 * les dates, la classe et le diagnostiqueur déjà saisis partent avec, sans ressaisie ni nouveau choix de fichier.
 * L'action qui reçoit ce champ est testée dans tests/diagnostic-piece-existante-action.test.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PIECE = "00000000-0000-4000-8000-00000000d0c1";
const banc = vi.hoisted(() => ({ etat: {} as Record<string, unknown> }));

vi.mock("@/lib/use-action-formulaire", () => ({
  useActionFormulaire: () => ({ etat: banc.etat, soumettre: vi.fn(), enCours: false }),
}));
vi.mock("@/app/actions/parc", () => ({ deposerDiagnostic: vi.fn() }));

import { FormulaireDiagnostic } from "../src/app/agence/[orgId]/parc/[bienId]/formulaire-diagnostic";

function rendre(niveau: "lot" | "bien" = "lot", typeInitial = niveau === "lot" ? "dpe" : "erp") {
  return renderToStaticMarkup(createElement(FormulaireDiagnostic, {
    orgId: "org", bienId: "bien", lotId: niveau === "lot" ? "lot" : null, niveau, typeInitial,
  }));
}
const REFUS = "Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « DPE — 13/10/2026 ». Rattachez cette pièce existante plutôt que de la déposer en double.";

beforeEach(() => { banc.etat = {}; });

describe("X07 : l'écran propose la pièce existante", () => {
  it("sans doublon, aucune proposition", () => {
    const html = rendre();
    expect(html).not.toContain("piece_existante");
    expect(html).not.toContain("Utiliser cette pièce");
  });

  it("avec un doublon de rapport, propose « Utiliser cette pièce pour ce lot » en bouton d'envoi du même formulaire", () => {
    banc.etat = { erreur: REFUS, pieceExistante: { id: PIECE, titre: "DPE — 13/10/2026" } };
    const html = rendre("lot");
    expect(html).toContain("Ce rapport est déjà dans votre dossier");
    expect(html).toContain("DPE — 13/10/2026");
    expect(html).toContain("Utiliser cette pièce pour ce lot");
    // L'ordre des attributs ne compte pas : le bouton est un « submit » qui porte le nom et la valeur du champ.
    const bouton = (html.match(/<button\b[^>]*>/g) ?? []).find((b) => b.includes('name="piece_existante"'));
    expect(bouton).toBeDefined();
    expect(bouton).toContain('type="submit"');
    expect(bouton).toContain(`value="${PIECE}"`);
    expect(html).toMatch(/pas déposée une seconde fois/);
  });

  it("remplace le message de refus brut par la proposition (pas d'alerte rouge à côté)", () => {
    banc.etat = { erreur: REFUS, pieceExistante: { id: PIECE, titre: "DPE — 13/10/2026" } };
    const html = rendre("lot");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Rattachez cette pièce existante plutôt que");
  });

  it("garde le message d'erreur quand il n'y a rien à proposer", () => {
    banc.etat = { erreur: REFUS };
    const html = rendre("lot");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Utiliser cette pièce");
  });

  it("parle du bien (et non du lot) pour un diagnostic du bâtiment", () => {
    banc.etat = { erreur: REFUS, pieceExistante: { id: PIECE, titre: "ERP — 13/10/2026" } };
    const html = rendre("bien");
    expect(html).toContain("Utiliser cette pièce pour ce bien");
    expect(html).not.toContain("pour ce lot");
  });

  it("une pièce sans titre est nommée « sans titre »", () => {
    banc.etat = { erreur: REFUS, pieceExistante: { id: PIECE, titre: null } };
    expect(rendre("lot")).toContain("sans titre");
  });

  it("« Déposer » est le premier bouton d'envoi du DOM (bouton par défaut : Entrée dans un champ), et s'affiche pourtant en dernier", () => {
    banc.etat = { erreur: REFUS, pieceExistante: { id: PIECE, titre: "DPE — 13/10/2026" } };
    const html = rendre("lot");
    const boutons = (html.match(/<button\b[^>]*>[^<]*(?:<[^b/][^>]*>[^<]*)*<\/button>/g) ?? []).filter((b) => b.includes('type="submit"'));
    expect(boutons).toHaveLength(2);
    // Entrée dans un champ clique le premier bouton d'envoi du formulaire : c'est « Déposer », jamais la proposition.
    expect(boutons[0]).toContain("Déposer");
    expect(boutons[0]).not.toContain("piece_existante");
    expect(boutons[1]).toContain('name="piece_existante"');
    // L'affichage reste celui d'avant (proposition au-dessus de « Déposer ») : colonne flex, « Déposer » en dernier.
    expect(boutons[0]).toMatch(/class="[^"]*\border-last\b/);
    expect(html).toMatch(/<form\b[^>]*class="[^"]*\bflex flex-col\b/);
    // Le dépôt ordinaire est le même sans proposition.
    banc.etat = {};
    const sans = (rendre("lot").match(/<button\b[^>]*>/g) ?? []).filter((b) => b.includes('type="submit"'));
    expect(sans).toHaveLength(1);
  });

  it("le champ du rapport reste affiché : l'utilisateur peut aussi choisir un autre fichier", () => {
    banc.etat = { erreur: REFUS, pieceExistante: { id: PIECE, titre: "DPE — 13/10/2026" } };
    expect(rendre("lot")).toContain('name="fichier"');
  });
});
