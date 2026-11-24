/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D3 — SECONDE REPRISE après relecture. Tests sans base ni réseau.
 *
 *  - Point 1 (Q49) : le locataire ne lit pas, dans le titre d'un devis ou d'une facture, le libellé de la retenue d'un
 *    autre bail (la pièce d'espace peut justifier des retenues de deux baux).
 *  - Point 2 (Q49) : l'agent limité à son portefeuille, bloqué par la pièce d'un collègue, lit à qui s'adresser.
 *  - Point 3 (Q49) : une retenue dont la pièce a été purgée compte comme sans justificatif pour un nouveau décompte.
 *  - Point 5 (Q46) : hors habitation, le résumé de la notice n'est plus exigé et la phrase sur la notice officielle
 *    ne s'affiche plus.
 * Les règles de la base ont leurs tests (justificatif-retenue-dossier-du-bail-base, reperes-fiscaux-journal-source-base).
 * Chaque cas échouait avant la seconde reprise.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

const m = vi.hoisted(() => ({ acces: vi.fn(), preparer: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/depot-direct", async (importer) => ({ ...(await importer<object>()), resoudreDepotsFormulaire: vi.fn(async () => null) }));
vi.mock("@/lib/ged-depot", async (importer) => ({ ...(await importer<object>()), preparerFichierGed: m.preparer }));

import { ajouterRetenue, justifierRetenue } from "@/app/actions/restitution";
import { PIECE_DEPOSEE_PAR_UN_AUTRE, piecePurgee, retenueJustifiee, titrePieceRetenuePourLocataire } from "@/lib/justificatif-retenue";
import { exigerJustificatifsRetenues, libelleJustificatifRetenue } from "@/lib/documents/modeles/decompte-restitution";
import { Fusion } from "@/lib/documents/gabarit";
import { annexesSignatureBail, MANQUE_NOTICE_DEPOSEE } from "@/lib/signature-bail";
import { carteResumeNotice, TITRE_GED_RESUME_NOTICE } from "@/lib/documents-bail";

type Ligne = Record<string, unknown>;
const source = (chemin: string) => readFileSync(chemin, "utf8");

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("point 1 — le titre montré au locataire ne porte pas le libellé de la retenue d'un autre bail", () => {
  const PIECE = "piece-commune";
  it("le titre d'un devis ou d'une facture de retenue est refait avec les libellés des retenues du locataire", () => {
    // La pièce a été déposée pour la retenue « Lavabo » du bail B ; elle justifie aussi « Peinture » du bail A.
    expect(titrePieceRetenuePourLocataire("Devis/facture — Lavabo du bail B", PIECE, [{ libelle: "Peinture du séjour", justificatif_document: PIECE }]))
      .toBe("Devis/facture — Peinture du séjour");
    expect(titrePieceRetenuePourLocataire("Devis/facture — Lavabo du bail B", PIECE, [
      { libelle: "Peinture du séjour", justificatif_document: PIECE }, { libelle: "Vitre", justificatif_document: "autre" }, { libelle: "Peinture de la chambre", justificatif_document: PIECE }]))
      .toBe("Devis/facture — Peinture du séjour, Peinture de la chambre");
  });
  it("si ses retenues ne se lisent pas ou ne citent pas la pièce, le titre court s'affiche : jamais le libellé d'un autre", () => {
    expect(titrePieceRetenuePourLocataire("Devis/facture — Lavabo du bail B", PIECE, [])).toBe("Devis/facture");
    expect(titrePieceRetenuePourLocataire("Devis/facture — Lavabo du bail B", PIECE, [{ libelle: "Vitre", justificatif_document: "autre" }])).toBe("Devis/facture");
  });
  it("un autre document garde son titre (état des lieux de sortie, courrier, titre absent)", () => {
    const miennes = [{ libelle: "Peinture du séjour", justificatif_document: PIECE }];
    expect(titrePieceRetenuePourLocataire("État des lieux de sortie", PIECE, miennes)).toBe("État des lieux de sortie");
    expect(titrePieceRetenuePourLocataire(null, PIECE, miennes)).toBeNull();
  });
  it("la lecture du fichier par le locataire passe par ce titre, sans autre droit que ses propres retenues", () => {
    const route = source("src/app/locataire/[orgId]/documents/[documentId]/fichier/route.ts");
    expect(route).toContain('supabase.rpc("mes_retenues_restitution", { p_org: orgId })');
    expect(route).toContain("titrePieceRetenuePourLocataire(doc.titre, doc.document_id,");
    expect(route).not.toMatch(/titre: doc\.titre/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("point 2 — l'agent bloqué par la pièce d'un collègue lit à qui s'adresser", () => {
  const ORG = "org", BAIL = "bail", RETENUE = "retenue", RESTITUTION = "restitution";
  const NOUVEAU = { fichier: { chemin: "org/x.pdf", mime: "application/pdf", taille: 4, empreinte: "e" } };
  /** Le refus de la base quand le même fichier existe déjà dans l'espace, alors que l'écran n'a vu aucun doublon. */
  const DEJA_DEPOSE = { data: null, error: { message: "Un fichier au contenu strictement identique existe déjà dans la GED" } };
  const formulaire = (champs: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("justificatif", new File([new Uint8Array([37, 80, 68, 70])], "devis.pdf", { type: "application/pdf" }));
    for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
    return f;
  };
  beforeEach(() => {
    m.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    m.preparer.mockReset().mockResolvedValue(NOUVEAU);
    m.acces.mockReset().mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "agent" } });
  });

  it("le message est celui demandé, sans jargon", () => {
    expect(PIECE_DEPOSEE_PAR_UN_AUTRE).toBe("Cette pièce a été déposée par une autre personne de votre espace : demandez à un administrateur de la rattacher.");
  });

  it("justificatif après coup : le dépôt refusé pour « fichier identique » donne ce message ; le fichier monté est abandonné, rien n'est lu en plus", async () => {
    m.rpc.mockImplementation(async (nom: string) => nom === "justifier_retenue_avec_piece" ? DEJA_DEPOSE : { data: null, error: null });
    expect(await justifierRetenue(ORG, BAIL, RETENUE, {}, formulaire())).toEqual({ erreur: PIECE_DEPOSEE_PAR_UN_AUTRE });
    // Aucun droit ouvert : l'action n'appelle que le dépôt (refusé) et l'abandon du fichier monté.
    expect(m.rpc.mock.calls.map((a) => a[0])).toEqual(["justifier_retenue_avec_piece", "purger_fichier_sans_fiche"]);
  });

  it("ajout d'une retenue avec son fichier : même message, la saisie est rendue", async () => {
    m.rpc.mockImplementation(async (nom: string) => nom === "ajouter_retenue_avec_justificatif" ? DEJA_DEPOSE : { data: null, error: null });
    const etat = await ajouterRetenue(ORG, BAIL, RESTITUTION, {}, formulaire({ libelle: "Peinture", cout: "150" }));
    expect(etat.erreur).toBe(PIECE_DEPOSEE_PAR_UN_AUTRE);
    expect(etat.valeurs).toMatchObject({ libelle: "Peinture", cout: "150" });
    expect(m.rpc.mock.calls.map((a) => a[0])).toEqual(["ajouter_retenue_avec_justificatif", "purger_fichier_sans_fiche"]);
  });

  it("les autres refus de la base sont rendus tels quels", async () => {
    m.rpc.mockImplementation(async (nom: string) => nom === "justifier_retenue_avec_piece" ? { data: null, error: { message: "Cette retenue a déjà un justificatif" } } : { data: null, error: null });
    expect(await justifierRetenue(ORG, BAIL, RETENUE, {}, formulaire())).toEqual({ erreur: "Cette retenue a déjà un justificatif" });
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("point 3 — une pièce purgée ne justifie plus une retenue pour un nouveau décompte", () => {
  const PURGEE = { libelle: "Peinture du séjour", sans_justificatif: false, justificatif_document: "doc-1", piece: { purged_at: "2026-11-24T10:00:00+00:00" } };
  const VIVANTE = { libelle: "Vitre", sans_justificatif: false, justificatif_document: "doc-2", piece: { purged_at: null } };

  it("la règle commune : pièce purgée = sans justificatif ; pièce vivante, ou fiche illisible, = justifiée", () => {
    expect(piecePurgee(PURGEE)).toBe(true);
    expect(retenueJustifiee(PURGEE)).toBe(false); // « justifiée » avant la seconde reprise
    expect(retenueJustifiee({ ...PURGEE, piece: [{ purged_at: "2026-11-24T10:00:00+00:00" }] })).toBe(false); // la fiche rendue en liste
    expect(retenueJustifiee(VIVANTE)).toBe(true);
    // Un agent qui ne peut pas lire la fiche de la pièce (déposée par un collègue) : on ne sait pas, la retenue reste justifiée.
    expect(retenueJustifiee({ sans_justificatif: false, justificatif_document: "doc-3", piece: null })).toBe(true);
    expect(retenueJustifiee({ sans_justificatif: false, justificatif_document: "doc-3" })).toBe(true);
    expect(piecePurgee({ justificatif_document: null, piece: null })).toBe(false);
  });

  it("les deux décomptes sont bloqués par la retenue à pièce purgée, avec la ligne « À renseigner » habituelle", () => {
    const f = new Fusion();
    exigerJustificatifsRetenues(f, [PURGEE, VIVANTE]);
    expect(f.manquants).toEqual(["justificatif de la retenue « Peinture du séjour » (un devis suffit)"]);
    expect(libelleJustificatifRetenue(PURGEE)).toBe("À déposer");
    expect(libelleJustificatifRetenue(VIVANTE)).toBe("Déposé — sur demande");
  });

  it("les trois lectures des retenues (écran, décompte de restitution, décompte des retenues) lisent la fiche de la pièce", () => {
    for (const chemin of ["src/app/agence/[orgId]/baux/[bailId]/page.tsx", "src/lib/documents/modeles/decompte-restitution.ts", "src/lib/documents/modeles/catalogue-bail.ts"])
      expect(source(chemin), chemin).toMatch(/justificatif_document[^"`]*piece:documents!retenues_justificatif_document_fkey\(purged_at\)\)?"/);
  });

  it("l'écran propose de remplacer la pièce, et dit pourquoi", () => {
    const ecran = source("src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx");
    expect(ecran).toContain('{piecePurgee(retenue) ? "Justificatif supprimé (règle de conservation) : joignez-en un autre" : "Sans justificatif"}');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("point 5 — hors habitation, le résumé de la notice n'est plus exigé", () => {
  const ORG = "org", BAIL = "bail", LOT = "lot", BIEN = "bien";
  const fichier = (id: string, titre: string, type: string): Ligne => ({ id, organization_id: ORG, titre, type, created_at: "2026-11-20T10:00:00+00:00", purged_at: null, mime_type: "application/pdf", storage_path: `${ORG}/${id}.pdf`, empreinte: `e-${id}` });
  /** Une base simulée, réduite à ce que lit annexesSignatureBail (la même que tests/decisions-24-11-d3-reprise.test.ts). */
  function base(tables: Record<string, Ligne[]>): SupabaseClient {
    const from = (table: string) => {
      const filtres: ((l: Ligne) => boolean)[] = [];
      const lignes = () => (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      const q: Record<string, unknown> = {
        select: () => q, or: () => q, order: () => q, limit: () => q,
        eq: (cle: string, v: unknown) => { filtres.push((l) => l[cle] === v); return q; },
        is: (cle: string, v: unknown) => { filtres.push((l) => (l[cle] ?? null) === v); return q; },
        in: (cle: string, v: unknown[]) => { filtres.push((l) => v.includes(l[cle])); return q; },
        single: async () => ({ data: lignes()[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok, ko),
      };
      return q;
    };
    return { from } as unknown as SupabaseClient;
  }
  /** Un bail avec son ERP, sans notice déposée ; `resume` : le résumé rangé au bail, s'il y en a un. */
  const dossier = async (typeBien: string, resume?: Ligne) => {
    const erp = fichier("erp", "ERP", "diagnostic");
    const c = contexte(); c.lot = { ...c.lot, id: LOT }; c.bien = { ...c.bien, id: BIEN, copropriete: false, type: typeBien };
    return annexesSignatureBail(base({
      baux: [{ id: BAIL, organization_id: ORG, reglement_copropriete: null }],
      diagnostics: [{ id: "g1", organization_id: ORG, lot_id: LOT, bien_id: BIEN, type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", document_id: "erp", archived_at: null }],
      document_liens: resume ? [{ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: resume.id }] : [],
      documents: resume ? [resume, erp] : [erp],
    }), ORG, BAIL, c);
  };
  const GENERER = "Générez le résumé de la notice d’information à l’étape Documents. Il ne remplace pas la notice officielle, à remettre aussi au locataire.";

  it("parking, local, terrain sans résumé : ni résumé exigé, ni phrase sur la notice officielle (exigés avant)", async () => {
    for (const type of ["parking", "local", "terrain", "autre"]) expect((await dossier(type)).manquants, type).toEqual([]);
  });

  it("habitation : rien ne change, le résumé et la notice restent demandés", async () => {
    for (const type of ["appartement", "maison", "immeuble"]) expect((await dossier(type)).manquants, type).toEqual([GENERER, MANQUE_NOTICE_DEPOSEE]);
  });

  it("hors habitation, un résumé déjà rangé reste joint ; s'il porte l'ancien texte, il reste à actualiser (il serait joint)", async () => {
    const aJour = await dossier("parking", fichier("resume", TITRE_GED_RESUME_NOTICE, "courrier"));
    expect(aJour.manquants).toEqual([]);
    expect(aJour.annexes.map((a) => a.id)).toEqual(["erp", "resume"]);
    const ancien = await dossier("parking", fichier("resume", "Notice d'information (annexe au bail)", "courrier"));
    expect(ancien.manquants).toHaveLength(1);
    expect(ancien.manquants[0]).toMatch(/^Actualisez le résumé de la notice d’information/);
  });

  it("la carte « Résumé de la notice » dit « Non demandé » hors habitation, sans renvoyer à une notice à déposer", () => {
    const hors = carteResumeNotice(false, false, false);
    expect(hors.etat).toBe("Non demandé");
    expect(hors.ton).toBeUndefined();
    expect(hors.texte).not.toMatch(/à déposer|ne remplace pas|obligatoire|conforme|article/i);
    expect(carteResumeNotice(false, true, false)).toMatchObject({ etat: "Résumé disponible", ton: "ok", texte: "Il accompagne le dossier comme document d’information." });
    expect(carteResumeNotice(false, true, true)).toMatchObject({ etat: "Résumé à actualiser", ton: "attention" });
    // Habitation : les textes d'avant, mot pour mot.
    const AVANT = "Ce résumé ne remplace pas la notice d’information officielle, à déposer dans la carte « Notice d’information officielle » : il accompagne le dossier comme document d’information.";
    expect(carteResumeNotice(true, false, false)).toEqual({ etat: "Résumé à générer", ton: "attention", texte: AVANT });
    expect(carteResumeNotice(true, true, false)).toEqual({ etat: "Résumé disponible", ton: "ok", texte: AVANT });
    expect(carteResumeNotice(true, true, true)).toEqual({ etat: "Résumé à actualiser", ton: "attention", texte: AVANT });
    const parcours = source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx");
    expect(parcours).toContain("carteResumeNotice(!batiment.data || estBienHabitation(batiment.data.type), Boolean(notice), noticeAActualiser)");
    expect(parcours).toContain("{carteResume.texte}</p>");
  });

  it("le récapitulatif des pièces et la carte de la fiche du bail suivent la même distinction", () => {
    const recap = source("src/lib/recapitulatif-pieces-bail.ts");
    expect(recap).toContain('etatNotice.statut === "a_completer" && !notice && noticeNonDemandee ? { statut: "non_concerne", detail: "Bien déclaré hors habitation : Gerimmo ne le demande pas." }');
    const fiche = source("src/app/agence/[orgId]/baux/[bailId]/page.tsx");
    expect(fiche).toContain('<CardDescription data-notice-resume="hors-habitation">');
    expect(fiche).toContain("{!bienDuLot || estBienHabitation(bienDuLot.type) ? (");
  });
});
