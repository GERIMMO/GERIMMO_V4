/**
 * Textes officiels, lot T3 (25/11/2026) — dépôt de garantie, état des lieux, pièces demandées, information de la caution,
 * petits textes. Référence : recueil fourni par le dirigeant (source et version déclarées, non recontrôlé).
 *
 *  - R11-A2 : le reçu de dépôt imprimait le plafond d'après le LOGEMENT (coché meublé ou non) ; la base et le bail décident
 *    d'après le BAIL. Maintenant : même règle que la base. Les montants imprimés ne changent pas.
 *  - R15-A1 : l'état des lieux de sortie imprime la mention du décret du 30 mars 2016 (adresse du nouveau domicile).
 *  - R19-A1 : avant tout bail signé, et pour une caution, la pièce demandée se choisit dans les listes du décret
 *    n° 2015-1437 ; le libellé libre est refusé par le serveur.
 *  - R24-A1 : la date à ne pas dépasser pour informer la caution d'un loyer impayé (article 2303 du code civil).
 *  - R16-A2, R11-A3, T1R-3, T1R-6 : textes.
 * La régularisation de charges (R16-A1) est dans textes-t3-regularisation.test.ts et textes-t3-base.test.ts.
 *
 * Reprise du lot T3 (relecture T3R) : T3R-2 (nom libre rendu au locataire sorti et au propriétaire mandant), T3R-3 (le
 * refus du nom libre est tenu par l'action serveur, pas par la base : le titre le dit), T3R-4 (texte du décret entier dans
 * l'e-mail), T3R-5 (noms mot pour mot), T3R-6 (pièce reçue redemandable ; candidat et caution distingués), T3R-7 (en-tête
 * du reçu de dépôt d'un bail meublé). T3R-1 et T3R-8 : textes-t3-reprise-base.test.ts.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

const m = vi.hoisted(() => ({ acces: vi.fn(), notifier: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/notifications", async (importOriginal) => ({ ...(await importOriginal<object>()), notifierPieceDemandee: m.notifier }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerRecuDepot } from "@/lib/documents/modeles/recu-depot";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { construireRappelAssurance } from "@/lib/documents/modeles/rappel-assurance";
import { Fusion } from "@/lib/documents/gabarit";
import { moisDepotGarantie } from "@/lib/depot-garantie";
import { PIECES_DECRET, RUBRIQUES_DECRET, demandeUniqueDejaFaite, estTexteDecret, noteDecret, pieceDecret, regimePieces } from "@/lib/pieces-decret-2015";
import { messagePieceDemandee } from "@/lib/notifications";
import { rappelInformationCaution } from "@/lib/information-caution";
import { demanderPieceLocataire } from "@/app/actions/pieces-demandees";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/&amp;/g, "&").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const source = (chemin: string) => readFileSync(chemin, "utf8");

describe("R11-A2 — reçu de dépôt de garantie : le plafond imprimé suit le bail, comme la base", () => {
  /** Client minimal : l'encaissement demandé, puis tous les encaissements du bail. */
  const client = () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq"]) q[k] = () => q;
      q.maybeSingle = async () => ({ data: table === "depot_encaissements" ? { id: "e1", bail_id: "b1", montant: 450, date_encaissement: "2026-09-01", moyen: "virement", versant_libelle: null, versant_person_id: null } : null, error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ montant: 450 }, { montant: 150 }], error: null }).then(ok);
      return q;
    },
  }) as unknown as SupabaseClient;
  async function recu(typeBail: string, logementMeuble: boolean) {
    const c = contexte();
    c.bail.type = typeBail; c.bail.etat = "actif"; c.bail.depot_garantie = 1200; c.lot.meuble = logementMeuble;
    vi.mocked(chargerContexteBail).mockResolvedValue(c);
    const r = await assemblerRecuDepot(client(), "org", "e1");
    if ("erreur" in r) throw new Error(r.erreur);
    return texteDe(r.document.html);
  }

  it.each([
    // [type du bail, logement coché meublé, plafond imprimé AVANT (d'après le logement), plafond imprimé APRÈS (d'après le bail)]
    ["nu", true, "deux mois", "un mois"],          // l'écart signalé : bail nu sur un logement coché « meublé »
    ["meuble", false, "un mois", "deux mois"],     // l'écart inverse
    ["nu", false, "un mois", "un mois"],
    ["meuble", true, "deux mois", "deux mois"],
    ["colocation", true, "deux mois", "deux mois"],
    ["colocation", false, "un mois", "un mois"],
  ] as const)("bail « %s », logement meublé = %s : avant « %s », après « %s »", async (type, meuble, avant, apres) => {
    // L'ancienne règle, telle qu'elle était écrite dans le modèle : le logement seul décidait.
    expect(meuble ? "deux mois" : "un mois").toBe(avant);
    const texte = await recu(type, meuble);
    expect(texte).toContain(`Le montant du dépôt ne peut excéder ${apres} de loyer hors charges (plafond légal applicable à ce bail).`);
    expect(texte).not.toContain(`ne peut excéder ${apres === "un mois" ? "deux mois" : "un mois"}`);
    // La règle de l'application est celle de la base (plafond_depot_mois : bail meublé, ou colocation sur logement meublé → 2).
    expect(moisDepotGarantie(type, meuble)).toBe(apres === "deux mois" ? 2 : 1);
  });

  it("aucun montant du reçu ne change : versement 450,00 €, dépôt convenu 1 200,00 €, total encaissé 600,00 €, reste 600,00 €", async () => {
    for (const [type, meuble] of [["nu", true], ["meuble", false]] as const) {
      const texte = await recu(type, meuble);
      expect(texte).toMatch(/Versement reçu ce jour\s+450,00 €/);
      expect(texte).toMatch(/Dépôt de garantie convenu au bail\s+1 200,00 €/);
      expect(texte).toMatch(/Total encaissé à ce jour\s+600,00 €/);
      expect(texte).toMatch(/Reste à percevoir\s+600,00 €/);
    }
  });
  it("T3R-7 — en-tête : « Article 22 » pour un plafond d'un mois ; pour deux mois (bail meublé), la loi sans article", async () => {
    for (const [type, meuble, entete] of [["nu", true, "un"], ["meuble", false, "deux"], ["colocation", true, "deux"], ["colocation", false, "un"]] as const) {
      const texte = await recu(type, meuble);
      if (entete === "un") expect(texte, `${type} ${meuble}`).toContain("Article 22 de la loi n° 89-462 du 6 juillet 1989");
      else {
        expect(texte, `${type} ${meuble}`).not.toContain("Article 22");
        expect(texte, `${type} ${meuble}`).toContain("Loi n° 89-462 du 6 juillet 1989");
      }
    }
  });
});

describe("R15-A1 — état des lieux de sortie : l'adresse du nouveau domicile du locataire", () => {
  const donnees = (type: "entree" | "sortie", adresse: string | null): DonneesEdl => ({
    type, reference: "EDL-1", dateEdl: "2026-10-07", dateEdlEntree: "2023-09-01", signeLe: null, personnesPresentes: "Les parties",
    detecteurFumeePresent: true, detecteurFumeeEtat: "bon", attestationAssuranceFournie: true, adresseRestitutionDepot: adresse, observations: "Néant",
    lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null }],
    compteurs: [], cles: [], comparatif: [],
    bailleurNom: "Moreau Claire", locatairesNoms: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
    exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "contact@example.invalid", telephone: null, ville: "Lyon" },
    typeOrganisation: "proprietaire_direct", f: new Fusion(),
  });

  it("la sortie imprime la mention du décret avec l'adresse saisie ; l'ancien libellé a disparu", () => {
    const texte = texteDe(construireEdl(donnees("sortie", "5 rue Neuve, 69003 Lyon")).html);
    expect(texte).toMatch(/Adresse du nouveau domicile ou du lieu d'hébergement du locataire : 5 rue Neuve, 69003 Lyon ?\./);
    expect(texte).not.toContain("Adresse de restitution du dépôt");
  });
  it("adresse non saisie : la mention est réclamée dans « À renseigner », jamais laissée en blanc ; l'entrée ne la porte pas", () => {
    const d = donnees("sortie", null);
    construireEdl(d);
    expect(d.f.manquants.join(" | ")).toContain("adresse du nouveau domicile ou du lieu d’hébergement du locataire");
    expect(texteDe(construireEdl(donnees("entree", null)).html)).not.toContain("nouveau domicile");
  });
  it("la saisie et la consultation portent le même libellé ; la colonne et le nom du champ ne changent pas (aucune donnée réécrite)", () => {
    const saisie = source("src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-mentions.tsx");
    expect(saisie).toContain("Adresse du nouveau domicile ou du lieu d’hébergement du locataire *");
    expect(saisie).toContain('name="adresse_restitution_depot" required');
    expect(source("src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-consultation.tsx")).toContain("Nouveau domicile ou lieu d’hébergement du locataire");
    const action = source("src/app/actions/edl.ts");
    expect(action).toContain("L’adresse du nouveau domicile ou du lieu d’hébergement du locataire est obligatoire.");
    expect(action).toContain("maj.adresse_restitution_depot = adresse;");
    for (const f of [saisie, action]) expect(f.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("Adresse de restitution du dépôt");
  });
});

describe("R19-A1 — pièces demandables : les listes du décret n° 2015-1437", () => {
  it("annexe I : 18 choix, annexe II : 16 ; identité et domicile sont UNE demande par rubrique ; aucun nom ne dépasse 120 caractères", () => {
    const de = (a: string) => PIECES_DECRET.filter((p) => p.annexe === a);
    expect(de("I").map((p) => p.code)).toEqual(["I-A", "I-B", ...[1, 2, 3, 4, 5, 6, 7].map((n) => `I-C-${n}`), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `I-D-${n}`)]);
    expect(de("II").map((p) => p.code)).toEqual(["II-A", "II-B-1", "II-B-2", "II-C", ...[1, 2, 3, 4, 5, 6].map((n) => `II-D-${n}`), ...[1, 2, 3, 4, 5, 6].map((n) => `II-E-${n}`)]);
    expect(PIECES_DECRET.filter((p) => p.unique).map((p) => p.code)).toEqual(["I-A", "I-B", "II-A", "II-C"]);
    for (const p of PIECES_DECRET) {
      expect(p.libelle.length, p.code).toBeLessThanOrEqual(120);
      expect(RUBRIQUES_DECRET[p.annexe][p.rubrique], p.code).toBeTruthy();
    }
  });

  it("les textes sont ceux du recueil, mot pour mot (phrases témoins et empreinte de l'ensemble)", () => {
    const texte = (code: string) => PIECES_DECRET.find((p) => p.code === code)!.texte;
    expect(texte("I-B")).toContain("1. Trois dernières quittances de loyer ou, à défaut, attestation du précédent bailleur, ou de son mandataire, indiquant que le locataire est à jour de ses loyers et charges.");
    expect(texte("I-A")).toContain("4. Document justifiant du droit au séjour du candidat à la location étranger, notamment, carte de séjour temporaire, carte de résident, carte de ressortissant d'un Etat membre de l'Union européenne ou de l'Espace économique européen.");
    expect(texte("I-C-3")).toBe("La fiche d'immatriculation au Registre national des entreprises de moins de trois mois pour une entreprise du secteur des métiers et de l'artisanat.");
    expect(texte("I-D-2")).toBe("Trois derniers bulletins de salaires.");
    expect(texte("II-C")).toContain("2. Facture d'eau, de gaz ou d'électricité de moins de trois mois.");
    // La caution : la liste d'identité du recueil s'arrête au permis de conduire (doute noté pour le juriste) ; rien n'est ajouté.
    expect(texte("II-A")).toMatch(/3\. Permis de conduire français ou étranger ;$/);
    expect(texte("II-A")).not.toMatch(/séjour/);
    // Garde : toute retouche d'un texte change cette empreinte. La vérification contre le recueil (34 pièces retrouvées mot
    // pour mot) a été faite le 25/11/2026 par programme ; elle se refait depuis le texte officiel en cas de changement du décret.
    expect(createHash("sha256").update(PIECES_DECRET.map((p) => `${p.code}|${p.texte}`).join("\n"), "utf8").digest("hex")).toBe(EMPREINTE_LISTES);
    // Ni relevé d'identité bancaire, ni attestation d'assurance pour le candidat (l'annexe II l'admet comme justificatif de domicile de la caution).
    expect(PIECES_DECRET.some((p) => /bancaire|\bRIB\b/i.test(p.texte))).toBe(false);
    expect(PIECES_DECRET.filter((p) => p.annexe === "I").some((p) => /assurance/i.test(p.texte))).toBe(false);
  });

  it("qui reçoit quelle liste : locataire d'un bail signé → libre ; candidat → annexe I ; caution → annexe II ; caution qui prépare son bail → les deux", () => {
    const sans = { ancienLocataireOuProprietaire: false };
    expect(regimePieces({ locataireBailSigne: true, caution: false, locataireEnPreparation: false, ...sans })).toEqual({ libre: true, annexes: [] });
    expect(regimePieces({ locataireBailSigne: false, caution: false, locataireEnPreparation: false, ...sans })).toEqual({ libre: false, annexes: ["I"] });
    expect(regimePieces({ locataireBailSigne: false, caution: false, locataireEnPreparation: true, ...sans })).toEqual({ libre: false, annexes: ["I"] });
    expect(regimePieces({ locataireBailSigne: false, caution: true, locataireEnPreparation: false, ...sans })).toEqual({ libre: false, annexes: ["II"] });
    expect(regimePieces({ locataireBailSigne: false, caution: true, locataireEnPreparation: true, ...sans })).toEqual({ libre: false, annexes: ["I", "II"] });
    // Reprise T3R-2 : locataire sorti ou propriétaire (mandant) → libre, s'il n'est ni caution ni candidat d'un bail en préparation.
    const ancien = { ancienLocataireOuProprietaire: true };
    expect(regimePieces({ locataireBailSigne: false, caution: false, locataireEnPreparation: false, ...ancien })).toEqual({ libre: true, annexes: [] });
    expect(regimePieces({ locataireBailSigne: false, caution: true, locataireEnPreparation: false, ...ancien })).toEqual({ libre: false, annexes: ["II"] });
    expect(regimePieces({ locataireBailSigne: false, caution: false, locataireEnPreparation: true, ...ancien })).toEqual({ libre: false, annexes: ["I"] });
    expect(pieceDecret("II-C", ["I"])).toBeNull();
    expect(pieceDecret("I-D-2", ["I"])?.libelle).toBe("Trois derniers bulletins de salaires");
    expect(pieceDecret("inconnu", ["I", "II"])).toBeNull();
  });

  it("le texte du décret accompagne la demande quand son nom ne le contient pas en entier ; « une seule pièce » se reconnaît au nom enregistré", () => {
    expect(noteDecret(pieceDecret("I-D-2", ["I"])!)).toBeNull();
    expect(noteDecret(pieceDecret("I-D-1", ["I"])!)).toMatch(/^Le dernier ou avant-dernier avis d'imposition ou de non-imposition et, lorsque tout ou partie des revenus/);
    const domicile = pieceDecret("I-B", ["I"])!;
    expect(demandeUniqueDejaFaite(domicile, ["Justificatif de domicile", "Trois derniers bulletins de salaires"])).toBeNull(); // ancienne demande libre : non comptée
    expect(demandeUniqueDejaFaite(domicile, ["Une seule pièce justificative de domicile"])).toBe("Une seule pièce justificative de domicile");
    // Reprise T3R-6 : le domicile de la caution ne se confond plus avec celui du candidat.
    expect(demandeUniqueDejaFaite(pieceDecret("II-C", ["II"])!, ["Une seule pièce justificative de domicile"])).toBeNull();
    expect(demandeUniqueDejaFaite(pieceDecret("I-D-2", ["I"])!, ["Trois derniers bulletins de salaires"])).toBeNull(); // « un ou plusieurs documents »
  });

  // Reprise T3R-3 : le titre disait « requête directe comprise ». C'est vrai pour une requête adressée à l'ACTION serveur
  // (formulaire forgé) ; la base, elle, ne contrôle pas le nom d'une pièce demandée : une écriture directe dans la table
  // par le gérant de l'espace (son droit sur ses propres demandes) n'est pas refusée (sonde T3R/tmp/sonde2.sql). Ce n'est
  // pas une élévation de droits ; un contrôle en base demanderait de recopier en SQL toute la lecture de la place de la
  // personne (baux, départs, cautions, lots, mandats) : non fait, noté pour le dirigeant.
  describe("l'action serveur refuse toute autre pièce (formulaire forgé compris ; la base ne contrôle pas le nom)", () => {
    /** La personne : `liens` = ses lignes bail_personnes, `baux` = l'état des baux concernés, `demandes` = noms déjà demandés. */
    function situation(s: { liens?: { bail_id: string; role: string; date_depart?: string }[]; baux?: { id: string; etat: string }[]; titulaire?: { id: string; etat: string }[]; demandes?: (string | { libelle: string; satisfaite_le: string })[]; detentions?: { id: string }[]; mandats?: { id: string }[]; panne?: string }) {
      // Les deux lectures de `baux` se distinguent par leur filtre : `locataire_principal` (baux dont elle est titulaire) ou
      // `id in (…)` (baux où elle est colocataire ou caution).
      // Reprise T3R-2 : les filtres d'état des baux (`in("etat", …)`) et de départ (`or("date_depart…")`) sont appliqués,
      // comme la base le ferait : sans eux, un bail terminé ou un départ passé passait pour un bail en cours.
      const lecture = (table: string, lignes: (titulaire: boolean) => unknown[]) => {
        const l: Record<string, unknown> = {};
        let titulaire = false;
        const filtres: ((x: Record<string, unknown>) => boolean)[] = [];
        for (const k of ["select", "is"]) l[k] = () => l;
        l.eq = (colonne: string) => { if (colonne === "locataire_principal") titulaire = true; return l; };
        l.in = (colonne: string, valeurs: unknown[]) => { if (colonne === "etat") filtres.push((x) => x.etat === undefined || valeurs.includes(x.etat)); return l; };
        l.or = (expression: string) => {
          const depart = /^date_depart\.is\.null,date_depart\.gte\.(\S+)$/.exec(expression);
          if (depart) filtres.push((x) => !x.date_depart || String(x.date_depart) >= depart[1]);
          return l;
        };
        l.then = (ok: (v: unknown) => unknown) => Promise.resolve(s.panne === table ? { data: null, error: { message: "panne" } }
          : { data: (lignes(titulaire) as Record<string, unknown>[]).filter((x) => filtres.every((f) => f(x))), error: null }).then(ok);
        l.maybeSingle = async () => ({ data: { id: "personne", account_id: null }, error: null });
        return l;
      };
      const ecriture = { insert: m.insert, select: () => ecriture, single: async () => ({ data: { id: "demande" }, error: null }), eq: () => ecriture, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: (s.demandes ?? []).map((d) => (typeof d === "string" ? { libelle: d } : d)), error: null }).then(ok) };
      m.insert.mockReturnValue(ecriture);
      m.acces.mockResolvedValue({ user: { id: "proprietaire" }, supabase: { from: (table: string) =>
        table === "persons" ? lecture(table, () => [])
        : table === "bail_personnes" ? lecture(table, () => s.liens ?? [])
        : table === "baux" ? lecture(table, (titulaire) => (titulaire ? s.titulaire ?? [] : s.baux ?? []))
        // Reprise T3R-2 : lots détenus et mandats de la personne.
        : table === "detentions" ? lecture(table, () => s.detentions ?? [])
        : table === "mandats" ? lecture(table, () => s.mandats ?? [])
        : ecriture } });
    }
    const form = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
    beforeEach(() => { vi.clearAllMocks(); m.notifier.mockResolvedValue({ envoyee: true }); });

    it("candidat (aucun bail signé) : un libellé libre est refusé, rien n'est enregistré", async () => {
      situation({});
      const r = await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Relevé de compte", type: "justificatif" }));
      expect(r.erreur).toContain("Choisissez la pièce dans la liste");
      expect(r.erreur).toContain("décret n° 2015-1437 du 5 novembre 2015");
      expect(m.insert).not.toHaveBeenCalled();
    });
    it("candidat : une pièce de l'annexe I s'enregistre sous le nom et le type de la liste, quoi que dise le formulaire", async () => {
      situation({ titulaire: [{ id: "b", etat: "brouillon" }] });
      const r = await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-D-1", libelle: "Autre chose", type: "attestation_assurance", note: "note libre" }));
      expect(r.erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({
        organization_id: "org", person_id: "personne", type: "justificatif",
        libelle: "Le dernier ou avant-dernier avis d'imposition ou de non-imposition",
        note: expect.stringMatching(/^Le dernier ou avant-dernier avis d'imposition ou de non-imposition et, lorsque/),
      }));
    });
    it("candidat : une pièce de l'annexe des cautions est refusée ; caution : l'inverse", async () => {
      situation({});
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "II-C" }))).erreur).toContain("Choisissez la pièce dans la liste");
      situation({ liens: [{ bail_id: "b", role: "garant" }], baux: [{ id: "b", etat: "actif" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-D-2" }))).erreur).toContain("Choisissez la pièce dans la liste");
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Avis d'imposition" }))).erreur).toContain("Choisissez la pièce dans la liste");
      expect(m.insert).not.toHaveBeenCalled();
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "II-E-3" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ libelle: "Trois derniers bulletins de salaires", type: "justificatif", note: null }));
    });
    it("« une seule pièce justificative de domicile » : la seconde demande est refusée, la première passe", async () => {
      situation({ demandes: [] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-B" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledTimes(1);
      situation({ demandes: ["Une seule pièce justificative de domicile"] });
      const r = await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-B" }));
      expect(r.erreur).toContain("déjà faite");
      expect(m.insert).toHaveBeenCalledTimes(1);
    });
    it("locataire d'un bail signé : le libellé reste libre, comme avant", async () => {
      situation({ titulaire: [{ id: "b", etat: "actif" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Attestation d'entretien de la chaudière", type: "justificatif" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ libelle: "Attestation d'entretien de la chaudière", note: null }));
      situation({ liens: [{ bail_id: "b", role: "colocataire" }], baux: [{ id: "b", etat: "preavis" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Attestation", type: "justificatif" }))).erreur).toBeUndefined();
    });
    it("situation illisible : la demande est refusée, rien n'est enregistré", async () => {
      for (const panne of ["bail_personnes", "baux", "detentions", "mandats"]) {
        situation({ panne });
        const r = await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Avis d'imposition" }));
        expect(r.erreur, panne).toContain("Impossible de vérifier la situation");
      }
      expect(m.insert).not.toHaveBeenCalled();
    });
    // Reprise T3R-2 — avant : le lot T3 ne lisait que les baux brouillon, actif ou préavis ; ces personnes n'avaient plus
    // que la liste des candidats (plus de RIB pour restituer le dépôt, plus d'attestation du propriétaire).
    it("T3R-2 — locataire sorti (bail terminé, ou départ enregistré d'un bail signé) : le nom reste libre", async () => {
      situation({ titulaire: [{ id: "b", etat: "termine" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "RIB pour la restitution du dépôt de garantie", type: "justificatif" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenLastCalledWith(expect.objectContaining({ libelle: "RIB pour la restitution du dépôt de garantie", note: null }));
      situation({ liens: [{ bail_id: "b", role: "colocataire", date_depart: "2026-06-30" }], baux: [{ id: "b", etat: "actif" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "RIB", type: "justificatif" }))).erreur).toBeUndefined();
      situation({ liens: [{ bail_id: "b", role: "colocataire" }], baux: [{ id: "b", etat: "termine" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "RIB", type: "justificatif" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledTimes(3);
    });
    it("T3R-2 — propriétaire d'un lot, ou mandant : le nom reste libre", async () => {
      situation({ detentions: [{ id: "d" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Attestation d'assurance du propriétaire non occupant", type: "attestation_assurance" }))).erreur).toBeUndefined();
      situation({ mandats: [{ id: "m" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Relevé d'identité bancaire du mandant", type: "justificatif" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledTimes(2);
    });
    it("T3R-2 — mais une caution, ou un candidat d'un bail en préparation, reste sur la liste du décret même s'il a été locataire ou est propriétaire", async () => {
      situation({ titulaire: [{ id: "a", etat: "termine" }, { id: "b", etat: "brouillon" }], detentions: [{ id: "d" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "RIB" }))).erreur).toContain("Choisissez la pièce dans la liste");
      situation({ liens: [{ bail_id: "g", role: "garant" }], baux: [{ id: "g", etat: "actif" }], mandats: [{ id: "m" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "RIB" }))).erreur).toContain("Choisissez la pièce dans la liste");
      // Un colocataire encore présent sur un bail signé reste libre, comme avant (départ à venir : encore au bail).
      situation({ liens: [{ bail_id: "b", role: "colocataire", date_depart: "2099-12-31" }], baux: [{ id: "b", etat: "preavis" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ libelle: "Attestation" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledTimes(1);
    });
    it("T3R-6 — une pièce « unique » déjà reçue se redemande (identité périmée) ; en cours, non", async () => {
      situation({ demandes: [{ libelle: "Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire", satisfaite_le: "2026-10-01T10:00:00Z" }] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-A" }))).erreur).toBeUndefined();
      situation({ demandes: ["Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire"] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-A" }))).erreur).toContain("déjà faite pour cette personne et toujours en cours");
      expect(m.insert).toHaveBeenCalledTimes(1);
    });
    it("T3R-6 — une personne à la fois candidate et caution : une demande de domicile pour chaque liste", async () => {
      situation({ titulaire: [{ id: "b", etat: "brouillon" }], liens: [{ bail_id: "g", role: "garant" }], baux: [{ id: "g", etat: "actif" }], demandes: ["Une seule pièce justificative de domicile"] });
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "II-C" }))).erreur).toBeUndefined();
      expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ libelle: "Une seule pièce justificative de domicile (caution)" }));
      expect((await demanderPieceLocataire("org", "personne", {}, form({ piece_decret: "I-B" }))).erreur).toContain("déjà faite pour cette personne et toujours en cours");
    });
  });

  it("isolation : l'action n'ouvre aucune lecture de plus — elle passe par la session du gérant (verifierGerant), sans clé de service", () => {
    const action = source("src/app/actions/pieces-demandees.ts");
    expect(action).not.toMatch(/service_role|createAdminClient|supabaseAdmin|creerClientService/);
    // Reprise T3R-2 : la lecture de la place de la personne reçoit le client de la session, et rien d'autre.
    expect(source("src/lib/pieces-regime.ts")).not.toMatch(/service_role|createAdminClient|supabaseAdmin|creerClientService|createClient/);
    expect(source("src/lib/pieces-decret-2015.ts")).not.toMatch(/supabase/i);
    // Aucune migration du lot ne touche la table ni ses règles de lecture.
    expect(source("supabase/migrations/20261125111000_textes_officiels_t3.sql")).not.toMatch(/pieces_demandees|policy|row level/i);
  });
});
describe("reprise T3R-5, T3R-4, T3R-7 — noms mot pour mot, texte du décret entier dans l'e-mail, en-tête du reçu meublé", () => {
  it("T3R-5 — chaque nom enregistré est le début du texte du décret, mot pour mot (« (caution) » mis à part)", () => {
    for (const p of PIECES_DECRET) {
      const nom = p.libelle.replace(/ \(caution\)$/, "");
      // Seule la capitale initiale d'un nom pris après « Pour les cautions personnes physiques, » diffère du texte.
      const debut = p.texte.startsWith("Pour les cautions personnes physiques, ") ? p.texte.slice("Pour les cautions personnes physiques, ".length).replace(/^u/, "U") : p.texte;
      expect(debut.startsWith(nom), p.code).toBe(true);
    }
    // Les deux noms relevés : plus de « pièce équivalente » (mot absent du décret), plus de reformulation.
    expect(pieceDecret("II-B-1", ["II"])!.libelle).toBe("Extrait K bis original de moins de trois mois de la société ou les statuts");
    expect(pieceDecret("I-D-6", ["I"])!.libelle).toBe("Attestation de simulation établie par l'organisme payeur ou simulation établie par le locataire");
    expect(PIECES_DECRET.some((p) => /équivalente/.test(p.libelle) && !/équivalente/.test(p.texte))).toBe(false);
    // T3R-6 : plus deux rubriques « une pièce » au même nom (les autres pièces, qui se demandent librement une par une,
    // peuvent figurer dans les deux annexes sous le même nom, comme dans le décret).
    const noms = PIECES_DECRET.filter((p) => p.unique).map((p) => p.libelle);
    expect(new Set(noms).size).toBe(noms.length);
    expect(PIECES_DECRET.filter((p) => p.annexe === "II" && p.unique).map((p) => p.libelle)).toEqual([
      "Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire (caution)",
      "Une seule pièce justificative de domicile (caution)",
    ]);
  });
  it("T3R-4 — l'e-mail reproduit le texte du décret en entier (avant : coupé à 300 caractères) ; une précision libre reste abrégée", () => {
    const longues = PIECES_DECRET.filter((p) => noteDecret(p) && p.texte.length > 300);
    expect(longues.map((p) => p.code)).toEqual(["I-A", "I-B", "I-D-1", "II-A", "II-B-1", "II-C", "II-E-1"]);
    for (const p of longues) {
      const html = messagePieceDemandee({ emetteur: "Claire Moreau", prenom: "Awa", libelle: p.libelle, note: noteDecret(p), relance: false, lien: null }).html;
      const texte = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
      expect(texte, p.code).toContain(p.texte);
      expect(estTexteDecret(noteDecret(p)), p.code).toBe(true);
    }
    const libre = "Précision libre ".repeat(30).trim();
    const html = messagePieceDemandee({ emetteur: "Claire Moreau", libelle: "Attestation", note: libre, relance: false, lien: null }).html;
    expect(html).not.toContain(libre);
    expect(html).toContain("…");
    expect(estTexteDecret(libre)).toBe(false);
  });
});

const EMPREINTE_LISTES = "3eb69ee1d5e138f6f985e0a64348fab2d667f124a1c731ca0532768bf8d89ec5";

describe("R24-A1 — information de la caution : la date à ne pas dépasser", () => {
  const terme = (date_echeance: string, montant_du: number, montant_couvert: number) => ({ date_echeance, montant_du, montant_couvert });
  it("un mois après l'échéance du plus ancien terme impayé ; quantième ramené en fin de mois", () => {
    expect(rappelInformationCaution([terme("2026-11-05", 650, 0)], true, "2026-11-24")).toEqual({ echeance: "2026-11-05", limite: "2026-12-05", depassee: false });
    expect(rappelInformationCaution([terme("2026-11-05", 650, 0)], true, "2026-12-05")).toMatchObject({ depassee: false });
    expect(rappelInformationCaution([terme("2026-11-05", 650, 0)], true, "2026-12-06")).toMatchObject({ depassee: true });
    expect(rappelInformationCaution([terme("2027-01-31", 650, 100)], true, "2027-02-10")).toMatchObject({ limite: "2027-02-28" });
    // Le plus ancien terme non soldé décide ; un terme soldé ou pas encore échu ne compte pas.
    expect(rappelInformationCaution([terme("2026-09-05", 650, 650), terme("2026-11-05", 650, 0), terme("2026-10-05", 650, 649.99), terme("2026-12-05", 650, 0)], true, "2026-11-24"))
      .toMatchObject({ echeance: "2026-10-05", limite: "2026-11-05", depassee: true });
  });
  it("rien à afficher sans caution, sans impayé échu, ou le jour même de l'échéance", () => {
    expect(rappelInformationCaution([terme("2026-11-05", 650, 0)], false, "2026-11-24")).toBeNull();
    expect(rappelInformationCaution([terme("2026-11-05", 650, 650)], true, "2026-11-24")).toBeNull();
    expect(rappelInformationCaution([terme("2026-11-05", 650, 0)], true, "2026-11-05")).toBeNull();
  });
  it("le réglage des relances dit que l'e-mail à la caution suit la seconde relance et peut partir après un mois ; le circuit d'envoi n'est pas modifié", () => {
    const profil = source("src/app/agence/[orgId]/profil/formulaire-profil.tsx");
    expect(profil).toContain("Caution : Gerimmo ne l’informe par e-mail qu’avec la seconde relance.");
    expect(profil).toContain("L’article 2303 du code civil demande au créancier professionnel d’informer la caution personne physique");
    expect(profil.match(/data-caution-relance/g)).toHaveLength(2);
    expect(source("src/app/agence/[orgId]/baux/[bailId]/page.tsx")).toContain('cautionAuBail={lignesColoc.some((l) => l.role === "garant"');
  });
});

describe("textes : rappel d'assurance (R16-A2), espace locataire (R11-A3, T1R-3), congé (T1R-6)", () => {
  it("R16-A2 — le rappel d'assurance ne mêle plus la résiliation (clause et commandement) et l'assurance pour compte (mise en demeure)", () => {
    const f = new Fusion();
    const texte = texteDe(construireRappelAssurance({
      reference: "ASSU-1", echeance: "2026-12-31", expiree: false, locataireNom: "Martin Paul", logementAdresse: "1 rue", referenceBail: "BAIL-1",
      canalReponse: "contact@example.invalid", espaceLocataire: false,
      exp: { nom: "Moreau Claire", adresse: "3 rue du Domicile, 69001 Lyon", email: "contact@example.invalid", telephone: null, ville: "Lyon" }, f,
    }).html);
    expect(texte).toContain("vous en justifiez à la remise des clés puis, chaque année, à la demande du bailleur");
    expect(texte).toContain("ne produit effet qu'un mois après un commandement resté sans effet");
    expect(texte).toContain("un mois après une mise en demeure non suivie d'effet, le bailleur peut souscrire une assurance pour le compte du locataire");
    expect(texte).toContain("Cette mise en demeure vaut renoncement à la clause de résiliation.");
    expect(texte).not.toContain("après mise en demeure restée sans effet, constitue un motif de résiliation");
  });
  it("R11-A3 — l'espace du locataire donne le critère du texte (état des lieux conforme), plus « si des retenues sont justifiées »", () => {
    for (const f of ["src/app/locataire/[orgId]/logement/carte-conge.tsx", "src/app/locataire/[orgId]/logement/page.tsx", "src/app/locataire/[orgId]/faq/page.tsx"]) {
      const s = source(f).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      expect(s, f).not.toContain("2 mois si des retenues sont justifiées");
      expect(s, f).toMatch(/2 mois sinon/);
    }
  });
  it("T1R-3 — zone inconnue : le mois de préavis n'est plus promis d'office", () => {
    expect(source("src/app/locataire/[orgId]/logement/page.tsx")).toContain("1 mois si le logement est en zone tendue et que votre lettre le précise et le justifie, 3 mois sinon");
  });
  it("T1R-6 — la lettre de congé ne dit plus que la désignation est « telle qu'elle figure au bail »", () => {
    const modele = source("src/lib/documents/modeles/conge-bailleur.ts");
    expect(modele).toContain("<p>Désignation des locaux loués :<br/>");
    expect(modele).not.toContain("telle qu'elle figure au bail");
  });
});
