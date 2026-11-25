/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D3 — REPRISE après relecture. Tests sans base ni réseau.
 *
 *  - B1 (Q49) : un fichier déjà rangé dans Documents est rattaché à la retenue, sans copie (un devis pour plusieurs
 *    réparations, l'état des lieux de sortie) ; avant, il était refusé comme doublon et les décomptes restaient bloqués.
 *  - M1 (Q49) : l'écran dit que le délai de restitution continue de courir ; la fenêtre de finalisation liste toutes les
 *    retenues sans pièce ; un décompte finalisé sans pièce dit qu'il ne se génère plus.
 *  - M3 (Q46) : le retour arrière de la notice avertit pour les circuits de signature en cours.
 *  - M4 (Q46) : la notice n'est exigée que pour un bien d'habitation (même distinction que la mise en location).
 *  - M5 (Q28) : fiche du logement et dates égales : l'avertissement dit ce que fait réellement le contrôle.
 *  - M6 (Q46) : le résumé de Gerimmo ne porte plus une référence « NOTICE-… ».
 *  - M7 (Q46) : les anciennes versions de la notice déposée restent visibles sur la fiche du bail.
 * Les règles de la base ont leurs tests (justificatif-retenue-piece-existante-base, reperes-fiscaux-ancien-reglage-base).
 * Chaque cas échouait avant la reprise.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

const m = vi.hoisted(() => ({ acces: vi.fn(), preparer: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/depot-direct", async (importer) => ({ ...(await importer<object>()), resoudreDepotsFormulaire: vi.fn(async () => null) }));
vi.mock("@/lib/ged-depot", async (importer) => ({ ...(await importer<object>()), preparerFichierGed: m.preparer }));

import { ajouterRetenue, justifierRetenue } from "@/app/actions/restitution";
import { annexesSignatureBail, MANQUE_NOTICE_DEPOSEE } from "@/lib/signature-bail";
import { anciennesNoticesDeposees, carteNoticeDeposee, noticeDeposeeRetenue, TITRE_GED_NOTICE_DEPOSEE, TITRE_GED_RESUME_NOTICE, TYPE_GED_NOTICE_DEPOSEE } from "@/lib/documents-bail";
import { estBienHabitation } from "@/lib/parc";
import { ecartDpe, phrasesEcartDpe, usageDpeFicheLogement, type DpeEnregistre } from "@/lib/avertissement-dpe";
import { AvertissementDpe } from "@/components/avertissement-dpe";

type Ligne = Record<string, unknown>;
const source = (chemin: string) => readFileSync(chemin, "utf8");
/** Le texte d'un écran, sans commentaires ni mise en forme, pour y chercher une phrase. */
const texteEcran = (chemin: string) => source(chemin).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/&apos;/g, "'").replace(/\{" "\}/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("B1 — une pièce déjà rangée justifie la retenue, sans copie", () => {
  const ORG = "org", BAIL = "bail", RETENUE = "retenue", RESTITUTION = "restitution", DEJA_RANGEE = "document-deja-range";
  const formulaire = (champs: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("justificatif", new File([new Uint8Array([37, 80, 68, 70])], "devis.pdf", { type: "application/pdf" }));
    for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
    return f;
  };
  /** Ce que rend le dépôt quand le même contenu est déjà rangé : un refus, avec l'identifiant de la pièce existante. */
  const DOUBLON = { erreur: "Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « Devis ». Rattachez cette pièce existante plutôt que de la déposer en double.", doublonId: DEJA_RANGEE };
  beforeEach(() => {
    m.rpc.mockReset().mockResolvedValue({ data: 150, error: null });
    m.preparer.mockReset();
    m.acces.mockReset().mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "moi" } });
  });

  it("justificatif après coup : le fichier déjà rangé est rattaché par justifier_retenue, rien n'est déposé ni mis en purge", async () => {
    m.preparer.mockResolvedValue(DOUBLON);
    const etat = await justifierRetenue(ORG, BAIL, RETENUE, {}, formulaire());
    expect(m.rpc.mock.calls).toEqual([["justifier_retenue", { p_retenue: RETENUE, p_document: DEJA_RANGEE }]]);
    expect(etat).toEqual({ succes: "Justificatif joint. Ce fichier est déjà dans vos documents : il a été rattaché à cette retenue, sans copie supplémentaire." });
  });

  it("ajout d'une retenue : le fichier déjà rangé devient son justificatif par ajouter_retenue, sans copie", async () => {
    m.preparer.mockResolvedValue(DOUBLON);
    const etat = await ajouterRetenue(ORG, BAIL, RESTITUTION, {}, formulaire({ libelle: "Peinture de la chambre", cout: "150,00" }));
    expect(m.rpc.mock.calls).toEqual([["ajouter_retenue", { p_restitution: RESTITUTION, p_libelle: "Peinture de la chambre", p_cout: 150, p_duree_vie: null, p_age: null, p_justificatif: DEJA_RANGEE }]]);
    expect(etat).toEqual({ succes: "Retenue ajoutée. Ce fichier est déjà dans vos documents : il a été rattaché à cette retenue, sans copie supplémentaire." });
  });

  it("le refus de la base (autre espace, pièce illisible, dossier d'un autre bail) est rendu tel quel, sans rien écrire d'autre", async () => {
    m.preparer.mockResolvedValue(DOUBLON);
    m.rpc.mockResolvedValue({ data: null, error: { message: "Justificatif introuvable" } });
    expect(await justifierRetenue(ORG, BAIL, RETENUE, {}, formulaire())).toEqual({ erreur: "Justificatif introuvable" });
    expect(await ajouterRetenue(ORG, BAIL, RESTITUTION, {}, formulaire({ libelle: "Peinture", cout: "150" }))).toMatchObject({ erreur: "Justificatif introuvable" });
    expect(m.rpc.mock.calls.map((a) => a[0])).toEqual(["justifier_retenue", "ajouter_retenue"]);
  });

  it("un fichier nouveau suit le chemin d'avant (dépôt et retenue dans le même geste) ; un fichier refusé reste refusé", async () => {
    m.preparer.mockResolvedValue({ fichier: { chemin: "org/x.pdf", mime: "application/pdf", taille: 4, empreinte: "e" } });
    await justifierRetenue(ORG, BAIL, RETENUE, {}, formulaire());
    expect(m.rpc.mock.calls[0][0]).toBe("justifier_retenue_avec_piece");
    m.rpc.mockClear();
    m.preparer.mockResolvedValue({ erreur: "Format refusé : seuls les fichiers PDF, JPEG et PNG sont acceptés (contenu réel vérifié)." });
    expect(await justifierRetenue(ORG, BAIL, RETENUE, {}, formulaire())).toEqual({ erreur: "Format refusé : seuls les fichiers PDF, JPEG et PNG sont acceptés (contenu réel vérifié)." });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("l'écran le dit : une même pièce peut justifier plusieurs retenues", () => {
    expect(texteEcran("src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx")).toContain(
      "Une même pièce peut justifier plusieurs retenues : choisissez de nouveau le même fichier, il est rattaché sans copie, même s'il est déjà rangé dans vos documents.");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("M1 — l'écran de la restitution dit ce que le blocage ne fait pas", () => {
  const brut = source("src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx");
  const ecran = texteEcran("src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx");

  it("(a) le blocage du PDF n'arrête pas le délai de restitution : phrase neutre, sans article ni délai chiffré", () => {
    const phrase = "Ce blocage n'arrête pas le délai de restitution du dépôt : il continue de courir depuis la remise des clés.";
    expect(ecran).toContain(phrase);
    expect(phrase).not.toMatch(/\d|article|loi|décret/i);
    expect(brut).toContain("data-delai-court-toujours");
  });

  it("(b) la fenêtre de finalisation liste TOUTES les retenues sans pièce, quel que soit leur montant", () => {
    expect(brut).toContain("retenuesSansPiece={retenues.filter(r => !retenueJustifiee(r))}");
    expect(brut).not.toMatch(/retenuesSansPiece=\{retenues\.filter\(r => Number\(r\.montant_retenu\) > 0/);
  });

  it("un décompte finalisé dont une retenue n'a pas de pièce dit qu'il ne se génère plus, et que les PDF déjà rangés restent", () => {
    expect(brut).toContain("data-decompte-finalise-sans-piece");
    expect(ecran).toContain("Ce décompte est finalisé, mais une retenue n'a pas de justificatif : il ne peut plus être généré de nouveau tant que la pièce manque.");
    expect(ecran).toContain("Les décomptes déjà générés restent rangés dans vos documents.");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("M3 — le retour arrière de la notice avertit pour les circuits de signature en cours", () => {
  it("l'avertissement est écrit dans le retour et dans le LISEZ-MOI", () => {
    const retour = source("supabase/retours-arriere/20261124180000_notice_information_deposee.retour.sql");
    expect(retour).toContain("ACTIVER OU ANNULER LES CIRCUITS DE SIGNATURE DE BAIL EN COURS");
    expect(retour).toMatch(/ne s'activerait plus sous l'ancien code/);
    // Le retour reste ce qu'il était : il ne supprime aucun document.
    expect(retour.replace(/^\s*--.*$/gm, "").trim()).toBe("delete from supabase_migrations.schema_migrations where version = '20261124180000';");
    const ligne = source("supabase/retours-arriere/LISEZ-MOI.md").split("\n").find((l) => l.startsWith("| `20261124180000_notice_information_deposee.retour.sql`")) ?? "";
    expect(ligne).toContain("activer ou annuler les circuits de signature de bail EN COURS");
    expect(ligne).toContain("ne s'activerait plus sous l'ancien code");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("M4 — la notice n'est exigée que pour un bien d'habitation", () => {
  const ORG = "org", BAIL = "bail", LOT = "lot", BIEN = "bien";
  const fichier = (id: string, titre: string, type: string): Ligne => ({ id, organization_id: ORG, titre, type, created_at: "2026-11-20T10:00:00+00:00", purged_at: null, mime_type: "application/pdf", storage_path: `${ORG}/${id}.pdf`, empreinte: `e-${id}` });
  /** Une base simulée, réduite à ce que lit annexesSignatureBail (filtres eq, is, in ; tri et limite sans effet ici). */
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
  /** Un bail prêt pour la signature (résumé et ERP déposés), sans notice déposée, sur un bien du type donné. */
  const manquants = async (typeBien: string) => {
    const resume = fichier("resume", TITRE_GED_RESUME_NOTICE, "courrier"), erp = fichier("erp", "ERP", "diagnostic");
    const c = contexte(); c.lot = { ...c.lot, id: LOT }; c.bien = { ...c.bien, id: BIEN, copropriete: false, type: typeBien };
    return (await annexesSignatureBail(base({
      baux: [{ id: BAIL, organization_id: ORG, reglement_copropriete: null }],
      diagnostics: [{ id: "g1", organization_id: ORG, lot_id: LOT, bien_id: BIEN, type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", document_id: "erp", archived_at: null }],
      document_liens: [{ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: "resume" }],
      documents: [resume, erp],
    }), ORG, BAIL, c)).manquants;
  };

  it("la distinction est celle du contrôle de mise en location : appartement, maison, immeuble", () => {
    expect(["appartement", "maison", "immeuble", "local", "parking", "terrain", "autre", null, undefined].map(estBienHabitation))
      .toEqual([true, true, true, false, false, false, false, false, false]);
    // La base, pour le même contrôle (lot_blocages_location) : les trois mêmes types.
    const controles = readFileSync("supabase/migrations/20261027100200_diagnostics_validite_dpe_et_rapports.sql", "utf8");
    expect(controles).toContain("v_habitation := v_bien.type in ('appartement', 'maison', 'immeuble');");
  });

  it("habitation : la signature électronique reste bloquée sans notice ; local, parking, terrain : plus de blocage", async () => {
    for (const type of ["appartement", "maison", "immeuble"]) expect(await manquants(type), type).toEqual([MANQUE_NOTICE_DEPOSEE]);
    for (const type of ["local", "parking", "terrain", "autre"]) expect(await manquants(type), type).toEqual([]);
  });

  it("la carte de l'étape Documents ne dit « obligatoire » que pour l'habitation ; hors habitation le dépôt reste possible", () => {
    expect(carteNoticeDeposee(true, false)).toEqual({ etat: "À déposer", ton: "attention", obligation: "Obligatoire · Annexée au bail",
      effet: "Sans elle, l’envoi du bail en signature électronique est bloqué. Pour une signature sur papier, annexez-la vous-même au contrat." });
    expect(carteNoticeDeposee(true, true)).toMatchObject({ etat: "Déposée", ton: "ok", obligation: "Obligatoire · Annexée au bail" });
    const hors = carteNoticeDeposee(false, false);
    expect(hors).toEqual({ etat: "Non demandée", ton: undefined, obligation: "Bien déclaré hors habitation · Non demandée par Gerimmo",
      effet: "Ce bien n’est pas déclaré comme un logement (appartement, maison, immeuble) : Gerimmo ne bloque pas la signature électronique sans la notice. Si vous la déposez, elle sera jointe au dossier." });
    expect(Object.values(hors).join(" ")).not.toMatch(/obligatoire|bloqué\b|conforme|article/i);
    expect(carteNoticeDeposee(false, true)).toMatchObject({ etat: "Déposée", ton: "ok" });
    const parcours = source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx");
    expect(parcours).toContain("carteNoticeDeposee(!batiment.data || estBienHabitation(batiment.data.type), Boolean(noticeDeposee))");
    expect(parcours).toContain("<p className={styles.obligation}>{carteNotice.obligation}</p>");
    expect(parcours).not.toContain("<p className={styles.obligation}>Obligatoire · Annexée au bail</p>");
  });

  it("le rappel « signature sur papier » et la ligne du récapitulatif suivent la même distinction", () => {
    expect(source("src/app/agence/[orgId]/baux/[bailId]/page.tsx")).toContain("(!bienDuLot || estBienHabitation(bienDuLot.type)) && <p className=\"text-sm\" data-rappel-notice-papier>");
    const recap = source("src/lib/recapitulatif-pieces-bail.ts");
    expect(recap).toContain("const noticeNonDemandee = !bienIndisponible && !estBienHabitation(bien!.type);");
    expect(recap).toContain('{ statut: "non_concerne", detail: "Bien déclaré hors habitation : Gerimmo ne la demande pas." }');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("M5 — l'avertissement « plusieurs DPE » dit ce que fait réellement le contrôle", () => {
  const dpe = (id: string, classe: string | null, etabli: string, enregistre: string, archive = false): DpeEnregistre =>
    ({ id, classe_dpe: classe, date_realisation: etabli, created_at: `${enregistre}T10:00:00+00:00`, archived_at: archive ? "2026-11-20T10:00:00+00:00" : null });
  const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("fiche du logement, deux DPE en vigueur : le contrôle regarde tous les diagnostics, un seul en classe G suffit", () => {
    const deux = ecartDpe([dpe("a", "G", "2022-01-10", "2022-01-12"), dpe("b", "D", "2025-03-04", "2025-03-06")]);
    expect(deux).toMatchObject({ retenu: { id: "b" }, enVigueur: 2 });
    expect(usageDpeFicheLogement(deux)).toBe("Le contrôle de la mise en location et l’alerte « DPE classé G » ne lisent pas un seul diagnostic : ils regardent tous les diagnostics en vigueur, et il suffit que l’un d’eux soit en classe G.");
    // Un seul en vigueur : sa classe sert bien au contrôle. La phrase ne promet plus d'alerte sur la classe F, qui n'existe pas ici.
    const un = ecartDpe([dpe("recent", "D", "2026-10-01", "2026-10-03", true), dpe("ancien", "G", "2023-06-15", "2026-11-20")]);
    expect(usageDpeFicheLogement(un)).toBe("Sa classe sert au contrôle de la mise en location : en classe G, la mise en location est bloquée et l’alerte « DPE classé G » s’affiche.");
    expect(source("src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx")).toContain("<AvertissementDpe ecart={ecartDpe} usage={usageDpeFicheLogement(ecartDpe)} />");
    // Ce que fait la base : le blocage porte sur TOUT diagnostic non archivé en classe G, sans tri ni « retenu ».
    expect(source("supabase/migrations/20261027100200_diagnostics_validite_dpe_et_rapports.sql")).toMatch(/d\.type = 'dpe' and d\.archived_at is null and d\.classe_dpe = 'G'/);
  });

  it("deux DPE en vigueur à la même date d'établissement : l'écran ne dit pas lequel est retenu", () => {
    const e = ecartDpe([dpe("a", "E", "2025-03-04", "2025-03-06"), dpe("b", "G", "2025-03-04", "2025-03-08")]);
    expect(e?.aLaMemeDate.map((d) => d.id).sort()).toEqual(["a", "b"]);
    const p = phrasesEcartDpe(e!);
    expect(p.retenu).toBe("2 diagnostics en vigueur pour ce logement portent la même date d’établissement, le 04/03/2025 (classe G, classe E) : Gerimmo ne peut pas dire lequel est retenu, l’un ou l’autre peut être lu.");
    expect(p.plusRecent).toBe("Aucun diagnostic enregistré ne porte une date d’établissement plus récente.");
    expect(`${p.retenu} ${p.plusRecent}`).not.toMatch(/Gerimmo retient|C’est aussi le plus récent/);
    // Sur les écrans du bail et de la révision, la phrase « Sa classe… » ne s'affiche pas : aucune classe n'est désignée.
    const bail = texteDe(renderToStaticMarkup(createElement(AvertissementDpe, { ecart: e, usage: "Sa classe est celle que le contrat imprime." })));
    expect(bail).toContain("l’un ou l’autre peut être lu.");
    expect(bail).not.toContain("Sa classe");
    // Sur la fiche du logement, la phrase du contrôle (tous les diagnostics en vigueur) reste affichée.
    const fiche = texteDe(renderToStaticMarkup(createElement(AvertissementDpe, { ecart: e, usage: usageDpeFicheLogement(e) })));
    expect(fiche).toContain("ils regardent tous les diagnostics en vigueur");
  });

  it("dates différentes : les phrases d'avant ne changent pas", () => {
    const e = ecartDpe([dpe("a", "E", "2022-01-10", "2022-01-12"), dpe("b", null, "2025-03-04", "2025-03-06")]);
    expect(e?.aLaMemeDate.map((d) => d.id)).toEqual(["b"]);
    expect(phrasesEcartDpe(e!).retenu).toBe("Gerimmo retient aujourd’hui le diagnostic établi le 04/03/2025 (classe non renseignée) : c’est le plus récent des diagnostics en vigueur pour ce logement.");
    const html = texteDe(renderToStaticMarkup(createElement(AvertissementDpe, { ecart: e, usage: "Sa classe est celle que le contrat imprime." })));
    expect(html).toContain("pour ce logement. Sa classe est celle que le contrat imprime.");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("M6 — le résumé de Gerimmo ne porte plus une référence « NOTICE-… »", () => {
  it("la référence imprimée au pied du résumé le nomme pour ce qu'il est ; seuls les nouveaux résumés changent", () => {
    const modele = source("src/lib/documents/modeles/notice.ts");
    expect(modele).toContain('reference: referenceCourte("RESUME-NOTICE", ctx.bail.id),');
    expect(modele).not.toContain('referenceCourte("NOTICE"');
    // Le pied de page imprime bien cette référence (c'est là qu'elle se lisait dans le dossier signé).
    expect(source("src/lib/documents/gabarit.ts")).toContain("<span>Réf. ${echapper(reference)} · Modèle ${VERSION_MODELES} · Empreinte ${empreinte}</span>");
    // Un circuit déjà envoyé n'est pas touché : le dossier de signature joint le FICHIER rangé du résumé (son chemin et
    // son empreinte lus dans Documents), il ne régénère pas le résumé.
    const signature = source("src/lib/signature-bail.ts");
    expect(signature).toContain("annexes.push({id:d.id,titre:d.titre??\"Annexe du bail\",storage_path:d.storage_path,empreinte:d.empreinte});");
    expect(signature).not.toMatch(/MODELES\.notice|MODELES\["notice"\]/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("M7 — les anciennes versions de la notice déposée restent visibles sur la fiche du bail", () => {
  type Piece = { id: string; titre: string | null; type: string; purged_at: string | null; created_at: string };
  const notice = (id: string, le: string, plus: Partial<Piece> = {}): Piece => ({ id, titre: TITRE_GED_NOTICE_DEPOSEE, type: TYPE_GED_NOTICE_DEPOSEE, purged_at: null, created_at: le, ...plus });

  it("la plus récente est retenue ; les précédentes sont listées de la plus récente à la plus ancienne ; une notice supprimée ou un autre document n'y figure pas", () => {
    const pieces = [
      notice("v1", "2026-11-20T10:00:00+00:00"), notice("v3", "2026-11-23T10:00:00+00:00"), notice("v2", "2026-11-22T10:00:00+00:00"),
      notice("supprimee", "2026-11-21T10:00:00+00:00", { purged_at: "2026-11-22T00:00:00+00:00" }),
      notice("resume", "2026-11-19T10:00:00+00:00", { type: "courrier", titre: TITRE_GED_RESUME_NOTICE }),
    ];
    expect(noticeDeposeeRetenue(pieces)?.id).toBe("v3");
    expect(anciennesNoticesDeposees(pieces).map((p) => p.id)).toEqual(["v2", "v1"]);
    expect(anciennesNoticesDeposees([notice("seule", "2026-11-20T10:00:00+00:00")])).toEqual([]);
  });

  it("la carte de l'étape Documents les liste sous « Anciennes versions », avec un lien vers chaque fichier", () => {
    const parcours = source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx");
    expect(parcours).toContain("const anciennesNotices = anciennesNoticesDeposees(documentsBail);");
    expect(parcours).toContain("<summary>Anciennes versions ({anciennesNotices.length})</summary>");
    expect(parcours).toContain("href={fichier(d.id)}");
    expect(parcours).toContain("Seule la plus récente, ci-dessus, est jointe à la signature électronique.");
  });
});
