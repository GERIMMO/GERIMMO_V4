/**
 * Phase 3 de la mission palier 1, lot 40 — baux, notice, inventaires, bordereau, avenants.
 *
 * Défauts relevés sur les PDF des dossiers fictifs : C01, C14, C15 (la notice se disait annexe du bail, reçue par le
 * locataire), C04 (inventaire refusé pour une observation facultative vide), C05 (bordereau refusé pour une échéance ou
 * un diagnostiqueur vides), C07 (inventaire de sortie : observations d'entrée présentées comme celles de la sortie),
 * C08 (« première location » et travaux « depuis la fin du dernier contrat »), C12 et C20 (mention « Sans objet » sans
 * rubrique, « durée de droit commun » pour un bail étudiant), C13 et C29 (« Néant. — montant : —. »), C17 (tableau vide),
 * C18 (même référence pour tous les avenants d'un bail), C21 à C25 (avenant de remplacement : cadres, sortant, date,
 * libellés, contrat modifié), C30 (« loyer de référence » pour le plafond de la colocation).
 * Chaque cas ci-dessous échouait avant le correctif.
 */
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, referenceAvenant, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementBail } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerNotice, AVERTISSEMENT_RESUME_NOTICE } from "@/lib/documents/modeles/notice";
import { assemblerAvenant } from "@/lib/documents/modeles/avenant";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { carteResumeNotice, classerPiecesBail, resumeNoticeAActualiser, TITRE_GED_RESUME_NOTICE, TITRES_GED_RESUME_NOTICE } from "@/lib/documents-bail";
import { ajouterPagesSignature, annexesSignatureBail, empreinteSignatureBail, type AnnexeSignature } from "@/lib/signature-bail";
import { rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import { Fusion } from "@/lib/documents/gabarit";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;

/** Une base simulée : chaque table rend toutes ses lignes (les filtres sont ignorés), `maybeSingle` la première. */
function base(tables: Record<string, Ligne[]> = {}): SupabaseClient {
  const requete = (table: string) => {
    const lignes = tables[table] ?? [];
    const q: Record<string, unknown> = {
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
    };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt", "lte"]) q[op] = () => q;
    return q;
  };
  return { from: requete, rpc: (nom: string) => requete(nom) } as unknown as SupabaseClient;
}

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
/** Le texte lisible du document (sans feuille de style ni balises). */
const texteDe = (html: string) =>
  html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const source = (fichier: string) => fs.readFileSync(path.join(process.cwd(), fichier), "utf8");
const cadres = (html: string) => [...html.matchAll(/<div class="bandeau">([^<]*)<\/div>/g)].map((m) => m[1]);

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("C01, C14, C15 — la notice est un résumé, pas l'annexe du bail reçue par le locataire", () => {
  it("le PDF ne se dit plus annexé au contrat ni reçu par le locataire, et se titre « résumé »", async () => {
    ctx.bail.date_debut = "2025-09-01";
    ctx.bail.date_conclusion_prevue = "2025-08-25";
    const doc = succes(await assemblerNotice(base(), "org", "b1"));
    const texte = texteDe(doc.document.html);
    expect(texte).toContain(AVERTISSEMENT_RESUME_NOTICE);
    expect(texte).not.toMatch(/annexée? au contrat|annexe au contrat|partie intégrante|reconnaît avoir reçu|Remise de la notice/i);
    expect(texte).toContain("Résumé de la notice d'information");
    // C15 : aucune date « Fait le » du jour de génération au-dessus d'une acceptation sans signature.
    expect(texte).not.toContain("Fait à");
    // C14 : la date imprimée est celle de la prise d'effet, dite comme telle.
    expect(texte).toMatch(/Contrat\s*Réf\. BAIL-B1 — prise d'effet le 01\/09\/2025/);
    expect(texte).not.toMatch(/BAIL-B1 du 01\/09\/2025/);
    expect(doc.titreGed).toBe("Résumé de la notice d'information");
    expect(doc.nomFichier).toBe("resume-notice-information");
    expect(doc.document.titreDocument).toBe("Résumé de la notice d'information");
  });

  it("le bail, lui, déclare toujours la notice officielle annexée (obligation du bailleur, inchangée)", () => {
    const html = construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() }).html;
    expect(html).toContain("La notice d'information relative aux droits et obligations des locataires et des bailleurs");
    expect(html).toContain("annexée au présent contrat");
  });

  it("le résumé se retrouve sous son nouveau titre comme sous l'ancien (fiche du bail, récapitulatif, signature)", () => {
    const p = (id: string, titre: string) => ({ id, titre, type: "courrier", purged_at: null });
    const { notices } = classerPiecesBail([p("nouveau", "Résumé de la notice d'information"), p("ancien", "Notice d'information (annexe au bail)"), p("autre", "Courrier")], [], null);
    expect(notices.map((n) => n.id)).toEqual(["nouveau", "ancien"]);
    expect(TITRES_GED_RESUME_NOTICE).toEqual(["Résumé de la notice d'information", "Notice d'information (annexe au bail)"]);
  });

  it("l'écran de la signature électronique ne présente plus le résumé comme « la notice d'information » (libellés corrigés)", () => {
    const signature = source("src/lib/signature-bail.ts");
    expect(signature).toContain('.in("titre",TITRES_GED_RESUME_NOTICE)');
    expect(signature).not.toContain("Générez la notice d’information à l’étape Documents.");
    expect(signature).toContain("Générez le résumé de la notice d’information à l’étape Documents. Il ne remplace pas la notice officielle, à remettre aussi au locataire.");
    expect(source("src/lib/recapitulatif-pieces-bail.ts")).toContain('ajouter("notice", "Résumé de la notice d’information", "signature"');
  });
});

describe("C04, C07 — inventaires : observation et pièce facultatives, colonnes de la sortie dites « à l'entrée »", () => {
  const lignes = [
    { piece: null, designation: "Canapé-lit", quantite: 1, etat: "neuf", observation: null },
    { piece: "Séjour", designation: "Table", quantite: 1, etat: "bon", observation: "Neuf, sous housse" },
  ];
  it.each(["inventaire_entree", "inventaire_sortie"] as const)("%s : une ligne sans pièce ni observation ne bloque plus le PDF", async (code) => {
    ctx.lot.meuble = true;
    if (code === "inventaire_sortie") ctx.bail.etat = "preavis";
    const r = succes(await assemblerComplementBail(code, base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2026-09-01", constat: "Mobilier rendu au complet" }));
    expect(r.document.manquants).toEqual([]);
    expect(r.document.html).toMatch(/<td>—<\/td><td><span class="v">Canapé-lit<\/span><\/td>/);
    expect(r.document.html).toMatch(/<td>Neuf<\/td><td>—<\/td><\/tr>|<td><span class="v">Neuf<\/span><\/td><td>—<\/td><\/tr>/);
  });
  // Reprise du lot 40 : ce test affirmait « État à l'entrée » et « Observation à l'entrée ». C'était faux : les lignes de
  // l'inventaire restent modifiables pendant toute la location, sans date ni historique ; une ligne modifiée à la sortie
  // s'imprimait « à l'entrée ». Le tableau dit maintenant l'inventaire tel qu'il est inscrit au dossier.
  it("inventaire de sortie : l'inventaire « inscrit », jamais daté « à l'entrée », puis le constat de sortie sous son propre titre", async () => {
    ctx.lot.meuble = true;
    ctx.bail.etat = "preavis";
    const r = succes(await assemblerComplementBail("inventaire_sortie", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2026-12-10", constat: "Canapé taché" }));
    const texte = texteDe(r.document.html);
    expect(r.document.html).toContain("<th>État inscrit</th>");
    expect(r.document.html).toContain("<th>Observation inscrite</th>");
    expect(texte).toContain("Mobilier inscrit à l’inventaire du contrat");
    expect(texte).toContain("Ce tableau reprend l’inventaire tel qu’il est inscrit au dossier à la date d’établissement de ce document. Il ne constate pas l’état du mobilier à la sortie, qui suit.");
    expect(texte).not.toMatch(/à l’entrée|État de référence|Mobilier de référence et constat de sortie/);
    expect(texte).toMatch(/Constat de sortie\s*Constat contradictoire du mobilier à la sortie : Canapé taché\./);
  });
  it("inventaire d'entrée : colonnes inchangées", async () => {
    ctx.lot.meuble = true;
    const r = succes(await assemblerComplementBail("inventaire_entree", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2026-09-01" }));
    expect(r.document.html).toContain("<th>État</th>");
    expect(r.document.html).toContain("<th>Observation</th>");
    expect(r.document.html).not.toContain("Constat de sortie");
  });
});

describe("C05 — bordereau : échéance et diagnostiqueur vides ne bloquent plus le document", () => {
  it("amiante sans date de fin et sans diagnostiqueur : imprimés tels quels, sans date ni nom inventés", async () => {
    const r = succes(await assemblerComplementBail("bordereau_ddt", base({
      diagnostics: [
        { type: "amiante_privatif", date_realisation: "2025-10-19", date_expiration: null, diagnostiqueur: "Diag Test", document_id: "d1" },
        { type: "amiante_communes", date_realisation: "2025-10-19", date_expiration: null, diagnostiqueur: null, document_id: "d2" },
        { type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", diagnostiqueur: "  ", document_id: "d3" },
      ],
    }), "org", "b1"));
    expect(r.document.manquants).toEqual([]);
    const texte = texteDe(r.document.html);
    expect(texte.match(/sans date de fin indiquée au rapport/g)).toHaveLength(2);
    expect(texte.match(/non renseigné/g)).toHaveLength(2);
    expect(texte).toContain("05/05/2027");
  });
  it("reprise : un DPE, un ERP ou un gaz sans échéance (validité fixée, date obligatoire à la saisie) bloque le bordereau", async () => {
    for (const type of ["dpe", "erp", "gaz", "electricite"]) {
      const r = succes(await assemblerComplementBail("bordereau_ddt", base({
        diagnostics: [{ type, date_realisation: "2024-03-12", date_expiration: null, diagnostiqueur: "Diag", document_id: "d1", classe_dpe: "D" }],
      }), "org", "b1"));
      expect(r.document.manquants, type).toEqual(["Validité"]);
      expect(texteDe(r.document.html), type).not.toContain("sans date de fin indiquée au rapport");
    }
  });
  // Reprise du lot 40 : l'échéance du DPE est renseignée ici — vide, elle est désormais elle aussi à renseigner (cas ci-dessus).
  it("une date de réalisation absente reste à renseigner", async () => {
    const r = succes(await assemblerComplementBail("bordereau_ddt", base({
      diagnostics: [{ type: "dpe", date_realisation: null, date_expiration: "2034-03-12", diagnostiqueur: "Diag", document_id: "d1" }],
    }), "org", "b1"));
    expect(r.document.manquants).toEqual(["Réalisé le"]);
  });
});

describe("C17 — liste des pièces : sans demande, pas de tableau vide", () => {
  it("la phrase « aucune demande » vient sous le titre, sans en-têtes de tableau", async () => {
    const r = succes(await assemblerComplementBail("liste_dossier", base({ pieces_demandees: [] }), "org", "b1"));
    expect(r.document.html).not.toContain("<table>");
    expect(r.document.html).toMatch(/<h2>Pièces demandées dans le dossier<\/h2><p>Aucune demande de pièce enregistrée à cette date\.<\/p>/);
  });
  it("avec des demandes, le tableau reste", async () => {
    const r = succes(await assemblerComplementBail("liste_dossier", base({ pieces_demandees: [{ libelle: "Pièce d'identité", satisfaite_le: "2026-09-01" }] }), "org", "b1"));
    expect(r.document.html).toContain("<th>Pièce</th>");
    expect(r.document.html).not.toContain("Aucune demande de pièce");
  });
});

describe("C08, C12, C13, C20, C29 — clauses du bail", () => {
  it("C08 : une première location imprime « Sans objet — première location » pour les travaux, jamais les deux affirmations", () => {
    const c = contexte();
    c.bail = { ...c.bail, precedente_location: "premiere", travaux_recents: "Remise en peinture complète du logement", travaux_recents_montant: 2400 };
    for (const doc of [construireBailNu(c, { dpeClasse: "D", f: new Fusion() }), construireBailMeuble(c, { dpeClasse: "D", inventaire: [], f: new Fusion() })]) {
      const texte = texteDe(doc.html);
      expect(texte).toContain("Première location : aucun précédent loyer.");
      expect(texte).toContain("effectués depuis la fin du dernier contrat : Sans objet — première location.");
      expect(texte).not.toContain("Remise en peinture");
      expect(doc.manquants).not.toContain("montant");
    }
  });
  it("C08 : hors première location, les travaux saisis et leur montant s'impriment", () => {
    const c = contexte();
    c.bail = { ...c.bail, precedente_location: "recente", travaux_recents: "Remise en peinture", travaux_recents_montant: 2400 };
    const texte = texteDe(construireBailNu(c, { dpeClasse: "D", f: new Fusion() }).html);
    expect(texte).toMatch(/dernier contrat : Remise en peinture — montant : 2\s400,00\s€\./);
  });
  it("C08 : les deux écrans de saisie le disent quand « première location » est choisie", () => {
    for (const f of ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", "src/app/agence/[orgId]/baux/[bailId]/formulaire-parcours-bail.tsx"]) {
      expect(source(f)).toContain("data-travaux-premiere-location");
      expect(source(f)).toContain("Ce que vous saisissez ici n’y figure pas.");
    }
  });
  it("C08 (reprise) : le récapitulatif avant signature dit « Sans objet — première location », sans les travaux ni leur montant", () => {
    const lignes = (bail: Parameters<typeof rubriquesRecapBail>[0]["bail"]) => rubriquesRecapBail({ bail, lot: { meuble: false }, bien: {}, personnes: [], liens: { lot: "#lot", bien: "#bien" } })
      .find((r) => r.id === "clauses")!.lignes.filter((l) => l.champ.startsWith("bail.travaux_recents"));
    expect(lignes({ precedente_location: "premiere", travaux_recents: "Remise en peinture complète du logement", travaux_recents_montant: 2400 }))
      .toEqual([expect.objectContaining({ champ: "bail.travaux_recents", libelle: "Travaux récents", valeur: "Sans objet — première location" })]);
    expect(lignes({ precedente_location: "recente", travaux_recents: "Remise en peinture", travaux_recents_montant: 2400 }).map((l) => l.valeur))
      .toEqual(["Remise en peinture", expect.stringMatching(/^2\s400,00\s€$/)]);
    const ecran = source("src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx");
    expect(ecran).toContain('{situation === "premiere" ? "Sans objet pour une première location" : "Obligatoire si travaux renseignés"}');
  });
  it("C13, C29 : sans travaux, « Néant. » seul — plus de « montant : — »", () => {
    for (const doc of [construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() }), construireBailMeuble(contexte(), { dpeClasse: "D", inventaire: [], f: new Fusion() })]) {
      const texte = texteDe(doc.html);
      expect(texte).toContain("effectués depuis la fin du dernier contrat : Néant. Travaux que le locataire");
      expect(texte).not.toMatch(/montant : —/);
    }
  });
  it("C12 : la mention « sans objet » dit à quelle rubrique elle se rapporte", () => {
    const texte = texteDe(construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() }).html);
    expect(texte).toContain("Durée réduite pour un événement précis justifiant la reprise du logement : sans objet — le contrat est conclu pour la durée de droit commun.");
  });
  it("C20 : un bail étudiant de neuf mois n'est pas « conclu pour la durée de droit commun »", () => {
    const c = contexte();
    c.bail = { ...c.bail, meuble_etudiant: true };
    const texte = texteDe(construireBailMeuble(c, { dpeClasse: "D", inventaire: [], f: new Fusion() }).html);
    expect(texte).toContain("neuf mois — bail étudiant");
    expect(texte).not.toContain("durée de droit commun");
    // Textes officiels, lot T2 (R20-A1) : ce test affirmait la rubrique « Durée réduite … : sans objet » dans le bail meublé.
    // La durée réduite pour un événement précis ne s'applique pas à la location meublée et l'annexe 2 du contrat type n'a pas
    // cette rubrique : le bail meublé ne l'imprime plus du tout (le bail nu la garde).
    expect(texte).not.toContain("Durée réduite");
    expect(texte).toContain("consenti à un étudiant pour une durée de neuf mois, n’est pas reconduit tacitement à son terme");
    const standard = texteDe(construireBailMeuble(contexte(), { dpeClasse: "D", inventaire: [], f: new Fusion() }).html);
    expect(standard).not.toContain("Durée réduite");
    expect(standard).toContain("reconduit tacitement à son terme pour une durée d’un an");
    expect(texteDe(construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() }).html)).toContain("sans objet — le contrat est conclu pour la durée de droit commun.");
  });
  it("un bail déjà préparé pour la signature se relit avec ses anciennes phrases (empreinte inchangée)", () => {
    const c = contexte();
    c.bail = { ...c.bail, meuble_etudiant: true };
    const nu = texteDe(construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion(), presentationAncienne: true }).html);
    const meuble = texteDe(construireBailMeuble(c, { dpeClasse: "D", inventaire: [], f: new Fusion(), presentationAncienne: true }).html);
    for (const t of [nu, meuble]) {
      expect(t).toContain("Sans objet — le contrat est conclu pour la durée de droit commun.");
      expect(t).toContain("Néant. — montant : —.");
    }
  });
});

describe("C30 — contrat individuel : le plafond de la colocation n'est plus un « loyer de référence »", () => {
  const individuel = () => {
    const c = contexte();
    c.bail = { ...c.bail, type: "colocation", chambre_id: "ch1", encadrement_loyer: false };
    c.chambre = { id: "ch1", nom: "Chambre 1", surface_m2: 12, volume_m3: 30, description: "Porte palière", espaces_partages: "Cuisine, salon", equipements: null };
    c.plafondColocation = 1800;
    c.lot = { ...c.lot, meuble: true };
    return c;
  };
  it("« Loyer maximal applicable au logement entier », distinct des loyers de référence de l'encadrement", () => {
    const texte = texteDe(construireBailMeuble(individuel(), { dpeClasse: "D", inventaire: [], f: new Fusion() }).html);
    expect(texte).toMatch(/Loyer maximal applicable au logement entier, hors charges : 1\s800,00\s€ par mois\./);
    expect(texte).not.toContain("Loyer de référence du logement entier");
    expect(texte).toContain("Loyers de référence imposés par arrêté local : non.");
  });
  it("relu pour un circuit déjà préparé : l'ancien libellé", () => {
    const texte = texteDe(construireBailMeuble(individuel(), { dpeClasse: "D", inventaire: [], f: new Fusion(), presentationAncienne: true }).html);
    expect(texte).toContain("Loyer de référence du logement entier, hors charges");
  });
  it("l'écran du plafond et l'aide emploient le même mot", () => {
    const ecran = source("src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/chambres-logement.tsx");
    expect(ecran).toContain("Loyer maximal applicable au logement entier, hors charges (€ / mois)");
    expect(ecran).not.toContain("Loyer de référence du logement");
    expect(source("src/app/agence/[orgId]/faq/questions.ts")).not.toContain("loyer de référence du logement entier");
  });
});

describe("C18, C23 — avenant au bail : une référence par avenant, date portée à la signature", () => {
  const options = { objet: "Ajout d'un emplacement de parking", modifications: "Le bail porte aussi sur le parking n° 4." };
  // Reprise du lot 40 : ces tests affirmaient une référence tirée de la date et de l'heure de génération. Elle changeait à
  // chaque minute ; or les pages de signature l'impriment et l'empreinte du circuit la lit : un avenant préparé pour la
  // signature électronique ne correspondait plus à lui-même au moment de l'envoi. La référence se tire maintenant du contenu.
  it("la référence combine le bail et le contenu de l'avenant : la même pour le même avenant, une autre pour un autre", () => {
    const ref = referenceAvenant("2dfb98cb-1111", options);
    expect(ref).toMatch(/^AVT-2DFB98CB-[0-9A-F]{8}$/);
    expect(referenceAvenant("2dfb98cb-1111", { modifications: "Le bail porte aussi sur le parking n° 4.\r\n", objet: "  Ajout d'un emplacement de parking " })).toBe(ref);
    expect(referenceAvenant("2dfb98cb-1111", { ...options, objet: "Ajout d'une cave" })).not.toBe(ref);
    expect(referenceAvenant("478ff191-2222", options).startsWith("AVT-478FF191-")).toBe(true);
  });
  it("le même avenant, assemblé à deux moments, garde sa référence et l'empreinte de son dossier de signature", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-23T13:32:00Z"));
      const premier = succes(await assemblerAvenant(base(), "org", "b1", options)).document;
      vi.setSystemTime(new Date("2026-12-02T09:10:00Z"));
      const second = succes(await assemblerAvenant(base(), "org", "b1", options)).document;
      const autre = succes(await assemblerAvenant(base(), "org", "b1", { ...options, objet: "Ajout d'une cave" })).document;
      expect(premier.reference).toBe(referenceAvenant("b1", options));
      expect(second.reference).toBe(premier.reference);
      expect(autre.reference).not.toBe(premier.reference);
      expect(premier.piedHtml).toContain(`Réf. ${premier.reference}`);
      // Les pages de signature impriment la référence : l'empreinte du circuit (préparation, puis envoi) ne bouge plus.
      const signataires = [{ personId: "p1", qualite: "Locataire" as const, nom: "Leblanc", prenom: "Julie", email: "julie@exemple.fr", telephone: "+33600000000" }];
      const a = ajouterPagesSignature(premier, signataires, [], "Avenant au bail");
      const b = ajouterPagesSignature(second, signataires, [], "Avenant au bail");
      expect(a.html).toContain(`Référence : ${premier.reference}`);
      expect(empreinteSignatureBail(a.html, signataires)).toBe(empreinteSignatureBail(b.html, signataires));
    } finally {
      vi.useRealTimers();
    }
  });
  it("« Fait à …, le » reste à compléter à la signature, comme dans le bail", async () => {
    const texte = texteDe(succes(await assemblerAvenant(base(), "org", "b1", options)).document.html);
    expect(texte).toContain("Fait à Lyon, le date effective à compléter lors de la signature, en autant d'exemplaires originaux que de parties.");
  });
});

describe("C21 à C25 — avenant de remplacement en colocation", () => {
  const options = { sortant: "p1", entrant: "Martin Paul\n1 rue Neuve, 69003 Lyon", date_effet: "2027-03-31", depot: "Conservé" };
  const coloc = () => {
    ctx.bail.type = "colocation";
    ctx.bail.date_debut = "2025-09-01";
    ctx.locataires = [personne(), personne({ id: "p2", nom: "Fictif", prenom: "Bruno" }), personne({ id: "p3", nom: "Fictif", prenom: "Chloé" })];
  };
  it("C21 : un cadre pour le bailleur, le sortant, l'entrant et les colocataires restants", async () => {
    coloc();
    const r = succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", options));
    expect(cadres(r.document.html)).toEqual(["Le bailleur", "Le colocataire sortant", "Le colocataire entrant", "Les colocataires restants"]);
    expect(r.document.html).toContain('<div class="bandeau">Le colocataire sortant</div><div class="zone"><span class="v">Leblanc Julie</span></div>');
    // Phase 3, lot 50 (W08) : le cadre de l'entrant porte son identité (première ligne saisie), comme celui du sortant porte
    // son nom ; il recopiait tout le bloc, adresse comprise. L'adresse reste dans la phrase des parties.
    expect(r.document.html).toContain('<div class="bandeau">Le colocataire entrant</div><div class="zone"><span class="v">Martin Paul</span></div>');
    expect(r.document.html).toContain('<div class="bandeau">Les colocataires restants</div><div class="zone">Fictif Bruno<br/>Fictif Chloé</div>');
  });
  it("C21 : un colocataire dont le départ est enregistré ne signe pas comme restant ; un seul restant au singulier", async () => {
    coloc();
    const r = succes(await assemblerComplementBail("avenant_remplacement", base({ bail_personnes: [{ person_id: "p3", date_depart: "2026-06-30" }, { person_id: "p2", date_depart: null }] }), "org", "b1", options));
    expect(r.document.html).toContain('<div class="bandeau">Le colocataire restant</div><div class="zone">Fictif Bruno</div>');
  });
  it("C22 : le sortant doit être un titulaire du contrat commun — sinon refus ; absent, il reste à renseigner", async () => {
    coloc();
    expect(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", { ...options, sortant: "Essai fictif (colocataire sortant)" }))
      .toEqual({ erreur: "Le colocataire sortant doit être l’un des titulaires du contrat commun : choisissez-le dans la liste." });
    const r = succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", { ...options, sortant: "" }));
    expect(r.document.manquants).toEqual(["identité du colocataire sortant"]);
    expect(OPTIONS_CATALOGUE.avenant_remplacement.find((c) => c.cle === "sortant")?.aide).toBe("Choisissez l’un des titulaires du contrat commun.");
    const ecran = source("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx");
    expect(ecran).toContain('c.cle==="sortant"&&modeleId==="avenant_remplacement"?<select');
    expect(source("src/app/agence/[orgId]/documents/catalogue/page.tsx")).toContain('choisi.id==="avenant_remplacement"');
  });
  it("C23, C24, C25 : date à la signature, sous-titre, une seule référence, pluriel, contrat daté", async () => {
    coloc();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-23T13:32:00Z"));
      const r = succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", options));
      const texte = texteDe(r.document.html);
      expect(texte).toContain("Fait à Lyon, le date effective à compléter lors de la signature.");
      expect(texte).not.toContain("Fait à Lyon, le 23/11/2026");
      expect(texte).toContain("Modification du contrat commun de location");
      expect(texte).not.toContain("Dossier de location");
      // Reprise du lot 40 (C18) : la référence se tire du contenu du remplacement, et non plus de l'heure de génération.
      const reference = referenceAvenant("b1", { sortant: "p1", entrant: options.entrant, date_effet: options.date_effet, depot: options.depot });
      expect(reference).toMatch(/^AVT-B1-[0-9A-F]{8}$/);
      expect(texte).toContain(`Avenant n° ${reference}`);
      expect(r.document.reference).toBe(reference);
      vi.setSystemTime(new Date("2026-12-02T09:10:00Z"));
      expect(succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", options)).document.reference).toBe(reference);
      expect(succes(await assemblerComplementBail("avenant_remplacement", base(), "org", "b1", { ...options, sortant: "p2" })).document.reference).not.toBe(reference);
      expect(texte).not.toMatch(/Dossier n°|AVENANT-REMPLACEMENT/);
      expect(r.document.html).toContain('<div class="etiquette">Locataires</div>');
      expect(texte).toMatch(/Contrat\s*Réf\. BAIL-B1 — prise d’effet le 01\/09\/2025/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C24 (autres documents du bail) — plusieurs locataires au pluriel", () => {
  it("inventaire d'un bail à deux locataires : « Locataires » et « Les locataires »", async () => {
    ctx.lot.meuble = true;
    ctx.locataires = [personne(), personne({ id: "p2", nom: "Fictif", prenom: "Bruno" })];
    const r = succes(await assemblerComplementBail("inventaire_entree", base({ inventaire_lignes: [{ piece: "Séjour", designation: "Table", quantite: 1, etat: "bon", observation: null }] }), "org", "b1", { date_constat: "2026-09-01" }));
    expect(r.document.html).toContain('<div class="etiquette">Locataires</div>');
    expect(cadres(r.document.html)).toEqual(["Le bailleur", "Les locataires"]);
  });
});

describe("reprise du lot 40 — C23 et S08 : les inventaires ne se datent plus du jour de leur génération", () => {
  const lignes = [{ piece: "Séjour", designation: "Table", quantite: 1, etat: "bon", observation: null }];
  it.each(["inventaire_entree", "inventaire_sortie"] as const)("%s : « Fait à …, le » se complète à la signature, au-dessus des cadres", async (code) => {
    ctx.lot.meuble = true;
    if (code === "inventaire_sortie") ctx.bail.etat = "preavis";
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-23T13:32:00Z"));
      const r = succes(await assemblerComplementBail(code, base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2027-03-31", constat: "Table rayée" }));
      const texte = texteDe(r.document.html);
      expect(texte).toContain("Date du constat : 31/03/2027.");
      expect(texte).toContain("Fait à Lyon, le date effective à compléter lors de la signature.");
      expect(texte).not.toContain("23/11/2026.");
      expect(cadres(r.document.html)).toEqual(["Le bailleur", "Le locataire"]);
      expect(r.document.manquants).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("S08 : un inventaire d'entrée daté après la fin du contrat est refusé ; un inventaire de sortie avant sa prise d'effet aussi", async () => {
    ctx.lot.meuble = true;
    ctx.bail.etat = "preavis";
    ctx.bail.date_debut = "2025-09-01";
    ctx.bail.date_fin = "2026-12-10";
    expect(await assemblerComplementBail("inventaire_entree", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2027-03-31" }))
      .toEqual({ erreur: "La date du constat (31/03/2027) tombe après la fin du contrat (10/12/2026) : l’inventaire d’entrée se fait à l’entrée dans les lieux. Vérifiez la date du constat." });
    expect(await assemblerComplementBail("inventaire_sortie", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2025-08-31", constat: "Rien à signaler" }))
      .toEqual({ erreur: "La date du constat (31/08/2025) précède la prise d’effet du contrat (01/09/2025) : l’inventaire de sortie se fait au départ du locataire. Vérifiez la date du constat." });
    // Possibles : clés remises avant l'entrée, départ effectif après la date de fin. La date saisie s'imprime telle quelle.
    expect(texteDe(succes(await assemblerComplementBail("inventaire_entree", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2025-08-30" })).document.html)).toContain("Date du constat : 30/08/2025.");
    expect(texteDe(succes(await assemblerComplementBail("inventaire_sortie", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2026-12-20", constat: "Rien à signaler" })).document.html)).toContain("Date du constat : 20/12/2026.");
  });
});

describe("lot 43 — T04 (C07) et T07 : phrase de la sortie, accord de travaux daté à la signature", () => {
  const lignes = [{ piece: "Séjour", designation: "Table", quantite: 1, etat: "bon", observation: null }];
  it("inventaire de sortie : constat établi à la restitution des clés ; l'entrée garde sa phrase", async () => {
    ctx.lot.meuble = true;
    const entree = texteDe(succes(await assemblerComplementBail("inventaire_entree", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2026-09-01" })).document.html);
    expect(entree).toContain("Inventaire annexé au contrat, établi contradictoirement à la remise des clés. Date du constat : 01/09/2026.");
    ctx.bail.etat = "preavis";
    const sortie = texteDe(succes(await assemblerComplementBail("inventaire_sortie", base({ inventaire_lignes: lignes }), "org", "b1", { date_constat: "2027-03-31", constat: "Table rayée" })).document.html);
    expect(sortie).toContain("Constat de sortie établi contradictoirement lors de la restitution des clés. Date du constat : 31/03/2027.");
    expect(sortie).not.toContain("remise des clés");
    expect(sortie).not.toContain("Inventaire annexé au contrat");
  });
  it("autorisation de travaux : « Fait à …, le » se complète à la signature, au-dessus des cadres", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-23T13:32:00Z"));
      const r = succes(await assemblerComplementBail("autorisation_travaux", base(), "org", "b1", { travaux: "Peinture du séjour", intervenant: "Peinture Fictive", periode: "Décembre 2026", prise_en_charge: "Le locataire, plafond 500 €", conditions: "Remise en état" }));
      const texte = texteDe(r.document.html);
      expect(texte).toContain("Fait à Lyon, le date effective à compléter lors de la signature.");
      expect(texte).not.toContain("23/11/2026.");
      expect(cadres(r.document.html)).toEqual(["Le bailleur", "Le locataire"]);
      expect(r.document.manquants).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("reprise du lot 40 — C01 : le résumé n'est ni la notice annexée au contrat, ni joint sous son ancien texte", () => {
  // Phase 3, lot 48 (U01) : l'ERP de la base simulée expire le 05/05/2027 et la signature compare cette échéance au jour
  // réel : après cette date, « ERP : le diagnostic est expiré » s'ajoutait aux manquants. Horloge figée.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  type Table = { data: unknown; error: null };
  /** Base simulée de `annexesSignatureBail` : chaque table rend ses lignes, `single` la première. */
  const baseAnnexes = (documents: Record<string, unknown>[]) => {
    const tables: Record<string, unknown[]> = {
      baux: [{ reglement_copropriete: null }],
      diagnostics: [{ id: "g1", type: "erp", date_realisation: "2026-11-05", date_expiration: "2027-05-05", document_id: "erp", lot_id: "l1" }],
      document_liens: documents.map((d) => ({ document_id: d.id })),
      documents,
    };
    return { from: (table: string) => {
      const reponse: Table = { data: tables[table] ?? [], error: null };
      const q: Record<string, unknown> = { then: (ok: (x: Table) => unknown) => Promise.resolve(reponse).then(ok), single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }) };
      for (const op of ["select", "eq", "is", "in", "or", "order", "limit"]) q[op] = () => q;
      return q;
    } } as unknown as SupabaseClient;
  };
  const fichier = (id: string, titre: string) => ({ id, titre, type: "courrier", storage_path: `org/${id}.pdf`, empreinte: `e-${id}`, mime_type: "application/pdf", purged_at: null, created_at: "2026-11-01" });
  const ctxAnnexes = () => { const c = contexte(); c.lot = { ...c.lot, id: "l1" }; c.bien = { ...c.bien, copropriete: false }; return c; };

  it("un résumé rangé sous l'ancien titre (ancien texte) est à actualiser avant une nouvelle préparation ; il reste lu", async () => {
    const ancien = await annexesSignatureBail(baseAnnexes([fichier("n", "Notice d'information (annexe au bail)"), fichier("erp", "ERP")]), "org", "b1", ctxAnnexes());
    expect(ancien.manquants).toContain("Actualisez le résumé de la notice d’information à l’étape Documents : celui qui est rangé a été établi avec un ancien texte, qui se disait à tort annexé au contrat et reçu par le locataire.");
    // Toujours joint : l'empreinte d'un circuit préparé avec lui se recalcule à l'identique à l'activation (qui ne lit pas les consignes).
    expect(ancien.annexes.map((a) => a.id)).toContain("n");
    const nouveau = await annexesSignatureBail(baseAnnexes([fichier("n", TITRE_GED_RESUME_NOTICE), fichier("erp", "ERP")]), "org", "b1", ctxAnnexes());
    expect(nouveau.manquants).toEqual([]);
    expect(resumeNoticeAActualiser({ titre: "Notice d'information (annexe au bail)" })).toBe(true);
    expect(resumeNoticeAActualiser({ titre: TITRE_GED_RESUME_NOTICE })).toBe(false);
    expect(resumeNoticeAActualiser(undefined)).toBe(false);
  });

  it("le dossier de signature liste le résumé à part : document d'information, pas une annexe du contrat", () => {
    const doc = { html: "<html><body><p>Contrat</p></body></html>", reference: "BAIL-B1" } as Parameters<typeof ajouterPagesSignature>[0];
    const erp: AnnexeSignature = { id: "erp", titre: "ERP — état des risques", storage_path: "x", empreinte: "aaa" };
    const resume: AnnexeSignature = { id: "n", titre: TITRE_GED_RESUME_NOTICE, storage_path: "y", empreinte: "bbb" };
    const html = ajouterPagesSignature(doc, [], [erp, resume]).html;
    const annexes = html.slice(html.indexOf("Annexes remises avec le contrat"), html.indexOf("Document d’information joint"));
    expect(annexes).toContain("ERP — état des risques");
    expect(annexes).not.toContain(TITRE_GED_RESUME_NOTICE);
    expect(texteDe(html)).toContain(`Document d’information jointCe résumé, établi par Gerimmo, accompagne le document dans le même dossier de signature. Il n’est pas une annexe du contrat et ne remplace pas la notice d’information officielle, que le bailleur remet au locataire avec le contrat.${TITRE_GED_RESUME_NOTICE}SHA-256 : bbb`);
    // Un dossier préparé avant (ancien titre) garde sa page octet pour octet : son empreinte se recalcule à l'identique.
    const ancien: AnnexeSignature = { ...resume, titre: "Notice d'information (annexe au bail)" };
    expect(ajouterPagesSignature(doc, [], [erp, ancien]).html).toBe(doc.html.replace("</body>", `<section style="break-before:page"><h1>Annexes remises avec le contrat</h1><p>Ces pièces accompagnent le document dans le même dossier de signature. Leur empreinte identifie exactement la version remise.</p><div style="break-inside:avoid;margin:14pt 0"><strong>ERP — état des risques</strong><p style="font:8px monospace;overflow-wrap:anywhere">SHA-256 : aaa</p></div><div style="break-inside:avoid;margin:14pt 0"><strong>Notice d'information (annexe au bail)</strong><p style="font:8px monospace;overflow-wrap:anywhere">SHA-256 : bbb</p></div></section></body>`));
  });

  it("la fiche du bail dit « Résumé à actualiser » pour l'ancien texte ; l'aperçu et le catalogue nomment le résumé", () => {
    const fiche = source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx");
    // Seconde reprise du lot D3 (24/11) : l'état de la carte est rendu par carteResumeNotice (lib/documents-bail.ts), qui
    // distingue aussi le bien hors habitation ; l'écran l'affiche. Les deux libellés sont les mêmes.
    expect(fiche).toContain('{docsBail.error ? "Indisponible" : carteResume.etat}');
    expect(carteResumeNotice(true, true, true).etat).toBe("Résumé à actualiser");
    expect(carteResumeNotice(true, true, false).etat).toBe("Résumé disponible");
    expect(fiche).toContain('titre="Résumé de la notice d’information"');
    expect(fiche).not.toContain('titre="Notice d’information"');
    expect(CATALOGUE_DOCUMENTS.find((d) => d.code === "notice")?.nom).toBe("Résumé de la notice d’information");
    expect(source("src/lib/recapitulatif-pieces-bail.ts")).toContain("Actualisez le résumé : celui qui est rangé a été établi avec un ancien texte.");
  });
});
