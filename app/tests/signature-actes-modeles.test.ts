/**
 * Plan de conformité du 23/10/2026, lot 1D (R28, R30, R58), et décision du dirigeant du 23/10 « Cautionnement et état
 * des lieux signés dans Gerimmo » : textes des modèles d'actes.
 *  · R28 : « en autant d'exemplaires que de parties » (état des lieux) ; date de l'acte de cautionnement laissée à la
 *    signature, sans être comptée comme manquante ; exemplaire électronique remis à chacun.
 *  · Rappel au locataire dans l'état des lieux d'entrée (et pas dans celui de sortie).
 *  · R30 : pas d'acte de cautionnement sans la certification d'absence d'assurance ou d'autre garantie.
 *  · R58 : le garant qui signe le bail ne s'y engage pas comme caution (cadre du bail, page de signature électronique).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte, personne } from "./fixtures/contexte-document";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import { construireEdl, type DonneesEdl } from "@/lib/documents/modeles/edl";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { ajouterPagesSignature, type SignataireBail } from "@/lib/signature-bail";
import { messageInvitationSignature } from "@/lib/message-invitation-signature";
import { selectionSignatureValide } from "@/lib/politique-signature";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import {
  CERTIFICATION_SANS_GARANTIE_CUMULEE,
  MENTION_CADRE_CAUTION_BAIL,
  MENTION_PAGE_SIGNATURE_GARANT,
  RAPPEL_COMPLEMENT_EDL_ENTREE,
  RAPPEL_COMPLEMENT_EDL_ENTREE_DOCUMENT,
  REFUS_SANS_GARANTIE_CUMULEE,
  confirmationEdlSurPlace,
  dateVisiteFr,
} from "@/lib/textes-signature-actes";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));

function edl(type: "entree" | "sortie"): DonneesEdl {
  const f = new Fusion();
  return {
    type, reference: "EDL-1", dateEdl: "2026-09-01", signeLe: null, personnesPresentes: "Claire Moreau, Julie Leblanc",
    detecteurFumeePresent: true, detecteurFumeeEtat: "Fonctionnel", attestationAssuranceFournie: true,
    adresseRestitutionDepot: "12 rue des Lilas, 69003 Lyon", observations: "Néant",
    lignes: [{ categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null }],
    compteurs: [{ type: "Électricité", numero: "E-1", releve: "100" }], cles: [{ libelle: "Clé", nombre: 2, reference: null }],
    comparatif: [], retenues: [], bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc",
    logementAdresse: "12 rue des Lilas, 69003 Lyon", referenceBail: "BAIL-1",
    exp: { nom: "Parc", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@example.invalid", telephone: null, ville: "Lyon" }, f,
  };
}

describe("état des lieux : exemplaires et rappel au locataire (R28, décision du 23/10)", () => {
  it("l'entrée dit « autant d'exemplaires que de parties » et rappelle le droit de compléter", () => {
    const html = construireEdl(edl("entree")).html;
    expect(html).toContain(", en autant d'exemplaires que de parties.");
    expect(html).not.toContain("deux exemplaires");
    expect(html).toContain(`Rappel au locataire : ${RAPPEL_COMPLEMENT_EDL_ENTREE_DOCUMENT}`);
    expect(RAPPEL_COMPLEMENT_EDL_ENTREE).toBe("Locataire : vous pouvez demander au bailleur de compléter cet état des lieux d'entrée dans les dix jours suivant son établissement et, pour les éléments de chauffage, pendant le premier mois de la période de chauffe (article 3-2 de la loi du 6 juillet 1989).");
    expect(html).not.toContain("dans les dix jours de sa signature");
  });

  it("la sortie garde le rappel sur le dépôt de garantie, sans le rappel de l'entrée", () => {
    const html = construireEdl(edl("sortie")).html;
    expect(html).toContain(", en autant d'exemplaires que de parties.");
    expect(html).not.toContain(RAPPEL_COMPLEMENT_EDL_ENTREE_DOCUMENT);
    expect(html).toContain("Le dépôt de garantie est restitué");
  });

  it("la confirmation sur place a le même texte côté écran et côté base", () => {
    expect(confirmationEdlSurPlace(dateVisiteFr("2026-10-01"))).toBe("Je confirme que cet état des lieux a été établi contradictoirement, sur place, le 01/10/2026, en présence du locataire ou de son représentant.");
    const migration = readFileSync("supabase/migrations/20261024120000_signature_caution_mobile_et_edl_sur_place.sql", "utf8");
    const [avant, apres] = confirmationEdlSurPlace("§").split("§");
    expect(migration).toContain(`'${avant}'`);
    expect(migration).toContain(`'${apres}'`);
    expect(dateVisiteFr("2026-1-01")).toBe("");
  });
});

describe("acte de cautionnement (R28, R30)", () => {
  const ctx = () => {
    const c = contexte();
    c.garants = [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }];
    return c;
  };

  it("refuse de préparer l'acte sans la certification d'absence d'autre garantie", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx());
    for (const option of [undefined, "", "non", "true"]) {
      const doc = await assemblerCautionnement({} as SupabaseClient, "org", "b1", { garant: "g1", montant_max: "15000", ...(option === undefined ? {} : { sans_garantie_cumulee: option }) });
      expect(doc).toEqual({ erreur: REFUS_SANS_GARANTIE_CUMULEE });
    }
  });

  it("date effective laissée à la signature, non comptée manquante ; exemplaire électronique remis à chacun", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx());
    const doc = await assemblerCautionnement({} as SupabaseClient, "org", "b1", { garant: "g1", montant_max: "15000", sans_garantie_cumulee: "oui" });
    if ("erreur" in doc) throw new Error(doc.erreur);
    const texte = doc.document.html.replace(/\s+/g, " ");
    expect(texte).toContain('le <span class="fusion">date effective à compléter lors de la signature</span>, en autant d\'exemplaires originaux que de parties ou, en cas de signature électronique, sous forme d\'un exemplaire électronique remis à chacune d\'elles ; un exemplaire du contrat de location est remis à la caution (article 22-1 de la loi du 6 juillet 1989).');
    expect(texte).not.toContain("deux exemplaires");
    expect(doc.document.manquants.join("|")).not.toMatch(/date effective|jj\/mm\/aaaa/);
  });

  it("l'option de certification est admise par la sélection de signature et demandée par le catalogue", () => {
    const s = selectionSignatureValide({ code: "cautionnement", cibleId: "11111111-1111-4111-8111-111111111111", options: { garant: "g", sans_garantie_cumulee: "oui", autre: "x" } });
    expect(s.options).toEqual({ garant: "g", sans_garantie_cumulee: "oui" });
    expect(OPTIONS_CATALOGUE.cautionnement.find((c) => c.cle === "sans_garantie_cumulee")).toEqual({ cle: "sans_garantie_cumulee", libelle: CERTIFICATION_SANS_GARANTIE_CUMULEE, type: "case" });
    expect(readFileSync("src/app/agence/[orgId]/baux/[bailId]/carte-cautionnement.tsx", "utf8")).toContain("sans_garantie_cumulee: \"oui\"");
  });
});

describe("le garant qui signe le bail ne s'y engage pas comme caution (R58)", () => {
  const avecGarant = () => contexte({ garants: [{ ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null }] });

  it("cadre « La caution » du bail nu et du bail meublé", () => {
    expect(construireBailNu(avecGarant(), { dpeClasse: "D", f: new Fusion() }).html).toContain(`Leblanc Marc<br/>${MENTION_CADRE_CAUTION_BAIL}`);
    expect(construireBailMeuble(avecGarant(), { dpeClasse: "D", inventaire: [], f: new Fusion() }).html).toContain(`Leblanc Marc<br/>${MENTION_CADRE_CAUTION_BAIL}`);
    expect(construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() }).html).not.toContain(MENTION_CADRE_CAUTION_BAIL);
  });

  it("page de signature électronique du garant dans le bail, jamais dans l'acte de cautionnement", () => {
    const doc = { html: "<body>Contrat</body>", reference: "REF" } as DocumentAssemble;
    const parties: SignataireBail[] = [
      { personId: "l", qualite: "Locataire", prenom: "Julie", nom: "Leblanc", email: "l@example.invalid", telephone: "+33600000001" },
      { personId: "g", qualite: "Garant", prenom: "Marc", nom: "Leblanc", email: "g@example.invalid", telephone: "", mentionCaution: "Mention" },
      { personId: "p", qualite: "Propriétaire", prenom: "Claire", nom: "Moreau", email: "p@example.invalid", telephone: "+33600000002" },
    ];
    const bail = ajouterPagesSignature(doc, parties).html;
    expect(bail.split(MENTION_PAGE_SIGNATURE_GARANT)).toHaveLength(2);
    const acte = ajouterPagesSignature(doc, parties.slice(1), [], "Acte de cautionnement", true).html;
    expect(acte).not.toContain(MENTION_PAGE_SIGNATURE_GARANT);
  });
});

describe("relecture du 24/10 : formules des actes", () => {
  it("le PDF de l'état des lieux d'entrée s'adresse au locataire sans majuscule ni redite après les deux-points", () => {
    const html = construireEdl(edl("entree")).html;
    expect(html).toContain("Rappel au locataire : vous pouvez demander au bailleur de compléter le présent état des lieux dans les dix jours suivant son établissement et, pour les éléments de chauffage, pendant le premier mois de la période de chauffe (article 3-2 de la loi du 6 juillet 1989).");
    expect(html).not.toContain("Rappel au locataire : Pour");
  });

  it("l'invitation adresse le rappel au seul locataire, comme les consignes « Garant : … Propriétaire : … »", () => {
    const message = messageInvitationSignature({ modele: "edl", bailleur: "Claire Moreau", lienConfidentialite: "https://site.example/confidentialite", edlEntree: true });
    expect(message).toContain("Locataire : vous pouvez demander au bailleur de compléter cet état des lieux d'entrée dans les dix jours suivant son établissement et, pour les éléments de chauffage, pendant le premier mois de la période de chauffe (article 3-2 de la loi du 6 juillet 1989).");
  });

  it("le cadre « La caution » s'accorde au pluriel quand le bail a plusieurs garants", () => {
    const deux = contexte({ garants: [
      { ...personne({ id: "g1", nom: "Leblanc", prenom: "Marc" }), garant_de: null },
      { ...personne({ id: "g2", nom: "Roux", prenom: "Anne" }), garant_de: null },
    ] });
    for (const html of [construireBailNu(deux, { dpeClasse: "D", f: new Fusion() }).html, construireBailMeuble(deux, { dpeClasse: "D", inventaire: [], f: new Fusion() }).html]) {
      expect(html).toContain("Leblanc Marc<br/>Roux Anne<br/>Reconnaissent avoir reçu un exemplaire du présent contrat. Leur engagement de caution résulte du seul acte de cautionnement signé séparément par chacune.");
      expect(html).not.toContain("Reconnaît avoir reçu");
    }
  });

  it("la notice d'information donne le point de départ du délai de dix jours", () => {
    const notice = readFileSync("src/lib/documents/modeles/notice.ts", "utf8");
    expect(notice).toContain("dans les dix jours suivant son établissement");
    expect(notice).not.toContain("dans les dix jours pour tout élément");
  });
});
