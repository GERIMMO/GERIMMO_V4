import { describe, expect, it } from "vitest";
import { cheminFicheAlerte, gesteAlerte } from "../src/lib/chemin-alerte";

describe("destination du traitement des alertes", () => {
  it.each(["edl_entree", "edl_sortie"])("ouvre la carte état des lieux pour %s", (type) => {
    expect(cheminFicheAlerte({ type, details: { bail_id: "bail" } }, "agence"))
      .toBe("/agence/agence/baux/bail#edl");
  });
  it("ouvre le document retourné pour contrôle", () => {
    expect(cheminFicheAlerte({ type: "signature_retournee", details: { document_id: "doc" } }, "agence"))
      .toBe("/agence/agence/documents?sel=doc");
  });
  it("ouvre le document d'origine lorsqu'une signature doit être reprise", () => {
    expect(cheminFicheAlerte({ type: "signature_a_reprendre", details: { document_id: "doc" } }, "agence"))
      .toBe("/agence/agence/documents?sel=doc");
    expect(gesteAlerte({ type: "signature_a_reprendre", details: { document_id: "doc" } }, "agence"))
      .toMatchObject({ libelle: "Reprendre la demande de signature", seFermeSeule: false });
  });
  it("ouvre les messages de la personne pour un message locataire", () => {
    expect(cheminFicheAlerte({ type: "message_locataire", details: { person_id: "personne" } }, "agence"))
      .toBe("/agence/agence/personnes/personne#messages");
  });
  it("conserve la carte de restitution", () => {
    expect(cheminFicheAlerte({ type: "decompte", details: { bail_id: "bail" } }, "agence"))
      .toBe("/agence/agence/baux/bail#restitution");
  });
  it.each([
    { type: "edl_entree", details: null },
    { type: "edl_entree", details: { lot_id: "lot" } },
    { type: "retenue_sans_justificatif", details: { restitution_id: "restitution" } },
    { type: "inconnu", details: { bail_id: "bail" } },
  ])("ne fabrique pas de destination sans contexte suffisant", (alerte) => {
    expect(cheminFicheAlerte(alerte, "agence")).toBeNull();
  });

  // Le trou rapporté le 19/09 : l'alerte disait qu'un document manquait et
  // n'offrait aucun chemin vers l'endroit où il se dépose.
  it.each(["assurance_expiration", "attestation_a_verifier"])(
    "emmène aux pièces justificatives de la personne pour %s",
    (type) => {
      expect(
        cheminFicheAlerte({ type, details: { document_id: "doc", person_id: "personne" } }, "agence")
      ).toBe("/agence/agence/personnes/personne#pieces");
    }
  );
  it("retombe sur la fiche GED quand l'alerte d'assurance ignore la personne", () => {
    expect(cheminFicheAlerte({ type: "assurance_expiration", details: { document_id: "doc" } }, "agence"))
      .toBe("/agence/agence/documents?sel=doc");
  });
  it("passe par la résolution de diagnostic, qui seule connaît le lot", () => {
    expect(
      cheminFicheAlerte({ type: "diagnostic_expiration", details: { diagnostic_id: "diag" } }, "agence")
    ).toBe("/agence/agence/diagnostics/diag");
  });
  it.each([
    "incident_a_qualifier",
    "incident_conteste",
    "incident_imputation_a_reviser",
  ])("ouvre le dossier d'incident pour %s", (type) => {
    expect(cheminFicheAlerte({ type, details: { incident_id: "inc" } }, "agence"))
      .toBe("/agence/agence/incidents?sel=inc");
  });
  it("ouvre les loyers du bail pour un impayé", () => {
    expect(cheminFicheAlerte({ type: "loyer_impaye", details: { bail_id: "bail" } }, "agence"))
      .toBe("/agence/agence/baux/bail#loyers");
  });
  it("ignore une charge utile dont la clé n'est pas une chaîne utilisable", () => {
    expect(cheminFicheAlerte({ type: "loyer_impaye", details: { bail_id: "" } }, "agence")).toBeNull();
    expect(cheminFicheAlerte({ type: "incident_conteste", details: { incident_id: 42 } }, "agence"))
      .toBeNull();
  });
});

describe("le geste qui règle l'alerte", () => {
  it("nomme le geste, pas la destination", () => {
    expect(
      gesteAlerte({ type: "assurance_expiration", details: { person_id: "p" } }, "agence")
    ).toEqual({
      href: "/agence/agence/personnes/p#pieces",
      libelle: "Déposer l’attestation d’assurance",
      seFermeSeule: true,
    });
  });

  // Les douze types que `fermer_alertes_origine` referme tout seuls : pour
  // eux, « marquer traitée » est la sortie de secours, pas le chemin normal.
  it.each([
    ["assurance_expiration", { person_id: "p" }],
    ["attestation_a_verifier", { person_id: "p" }],
    ["decompte", { bail_id: "b" }],
    ["decompte_lrar", { bail_id: "b" }],
    ["diagnostic_expiration", { diagnostic_id: "d" }],
    ["edl_entree", { bail_id: "b" }],
    ["edl_sortie", { bail_id: "b" }],
    ["loyer_impaye", { bail_id: "b" }],
    ["restitution_echeance", { bail_id: "b" }],
  ] as const)("sait que %s se referme d'elle-même", (type, details) => {
    expect(gesteAlerte({ type, details }, "agence")?.seFermeSeule).toBe(true);
  });

  it.each([
    ["conge_intention", { bail_id: "b" }],
    ["message_locataire", { person_id: "p" }],
    ["piece_deposee", { person_id: "p" }],
    ["signature_retournee", { document_id: "d" }],
    ["incident_a_qualifier", { incident_id: "i" }],
  ] as const)("laisse %s à la main de l'agent", (type, details) => {
    expect(gesteAlerte({ type, details }, "agence")?.seFermeSeule).toBe(false);
  });

  it("ne propose aucun geste quand aucune destination n'est connue", () => {
    expect(gesteAlerte({ type: "retenue_sans_justificatif", details: { retenue_id: "r" } }, "agence"))
      .toBeNull();
    expect(gesteAlerte({ details: { bail_id: "b" } }, "agence")).toBeNull();
  });
});
