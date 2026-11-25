/**
 * Phase 3, reprise du lot 35 : un bail préparé pour la signature électronique AVANT la mise en ligne de la version g8 des
 * documents, avec la présentation d'aujourd'hui (#331 : expéditeur = le bailleur, SIREN, signatures d'indivision), signé
 * APRÈS, doit pouvoir être activé (« Activer le bail signé »). L'activation recalcule l'empreinte du contrat et la compare à
 * celle du circuit.
 *
 * Les empreintes attendues ci-dessous ont été relevées le 23/11/2026 en passant les mêmes données au code de cb368cbb,
 * identique pour les baux à celui de la production 81740dec (bail-nu, bail-meuble, gabarit, communs, mentions-location,
 * designation-individuelle, signature-bail : aucune différence) : `construireBailNu` ou `construireBailMeuble` (présentation
 * d'aujourd'hui), `partiesSignatureBail`, `documentSignatureBail`. Le lot 35 avait rangé la feuille g7 et la typographie
 * d'alors sous la seule « présentation ancienne » (celle d'avant #331) : aucun recalcul ne retrouvait ces empreintes, et
 * l'activation refusait le bail (« Les informations du dossier ont changé… »).
 *
 * Les dossiers couvrent ce que la version g8 et les textes du lot 40 changent : étage saisi avec le mot « étage », surface
 * « 45.00 », échéance le 1er, texte terminé par un point, travaux, indivision avec SIREN et quote-part décimale, contrat
 * individuel de colocation, bail étudiant. Ce test ne vaut que pour les circuits préparés avant la mise en ligne de g8 : si un
 * gabarit de bail change encore, la typographie archivée doit continuer de les reproduire.
 */
import { describe, expect, it } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import type { ContexteBail } from "@/lib/documents/modeles/communs";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { documentSignatureBail, partiesSignatureBail } from "@/lib/signature-bail";

const PRODUCTION_81740DEC: Record<string, string> = {
  simple_nu: "41ebe852b3210d762b331b1d094184a140ab4f164d94ab6df9349ae0df88f0a8",
  simple_meuble: "9ff3534b07c6a6246db9279854c936c93e5dfbbe96725743ab75254c7dd3e9cc",
  garant_nu: "d8230bfa56965f88cf1001f0e6d3df29eace938b74171d57c09382d85df9c48e",
  garant_meuble: "297392e79a0b7cd79d541f7d087e6ef9c03693ddc50b053b88a289d6d761dbfd",
  riche_nu: "83fff43b6a57098d8c525a06920ea162ee826cbdb1a7b019986d56328e66e958",
  riche_meuble: "ad913236ab636b77106f8bb715d1143dfb2376a4ad974df56a7c90c8b24dd599",
  individuel_nu: "8c311c952c0d5b85aa6ea6f2b9bbfd003f436f21a43f83309314eced402fbfc3",
  individuel_meuble: "49b3753f452f0f9a40871689cd529185ed967e8ef0dea3995ab31621e15d6674",
  etudiant_meuble: "6991462de6543e3ef1c5f15d484f3f9463d48c682d1ccedb66ecfb7597cf7bb6",
};

const p = (o: Record<string, unknown>) => ({
  ...personne(o as never),
  email: o.email as string,
  telephone: (o.telephone as string) ?? "+33600000001",
  qualite: (o.qualite as string) ?? "personne physique",
  siren: (o.siren as string) ?? null,
});
function simple(avecGarant: boolean): ContexteBail {
  const ctx = contexte({ garants: [] } as never);
  ctx.locataires = [p({ id: "l1", nom: "Martin", prenom: "Lea", email: "locataire@example.invalid" }) as never];
  ctx.bailleurs = [{ ...p({ id: "b1", nom: "Durand", prenom: "Paul", email: "bailleur@example.invalid", telephone: "+33600000002" }), quote_part: 100 } as never];
  if (avecGarant) ctx.garants = [{ ...p({ id: "g1", nom: "Leblanc", prenom: "Marc", email: "garant@example.invalid", telephone: "+33600000009" }), garant_de: "l1" } as never];
  return ctx;
}
function riche(): ContexteBail {
  const ctx = simple(false);
  ctx.bailleurs = [
    { ...p({ id: "b1", nom: "Durand", prenom: "Paul", email: "bailleur@example.invalid", telephone: "+33600000002" }), quote_part: 62.5 } as never,
    { ...p({ id: "b2", nom: "Durand", prenom: "Anne", email: "bailleur2@example.invalid", telephone: "+33600000003", siren: "123456789" }), quote_part: 37.5 } as never,
  ];
  Object.assign(ctx.lot, { nom: "T2", etage: "2e étage, porte gauche", surface_m2: "45.00" });
  Object.assign(ctx.bail, { jour_echeance: 1, duree_reduite_evenement: "Mutation professionnelle prévue.", travaux_recents: "Peinture refaite.", travaux_recents_montant: 1200, precedente_location: "relocation" });
  return ctx;
}
function individuel(): ContexteBail {
  const ctx = riche();
  ctx.bailleurs = [ctx.bailleurs[0]];
  Object.assign(ctx.bail, { type: "colocation", chambre_id: "c1", duree_reduite_evenement: null });
  ctx.chambre = { id: "c1", nom: "Chambre 2", surface_m2: "14.00" as never, volume_m3: "35.00" as never, description: "Porte palière à gauche.", espaces_partages: "Cuisine, salle d'eau.", equipements: "Lit, bureau." };
  ctx.plafondColocation = 1800;
  return ctx;
}
function etudiant(): ContexteBail {
  const ctx = riche();
  Object.assign(ctx.bail, { type: "meuble", meuble_etudiant: true, duree_reduite_evenement: null });
  return ctx;
}

type Options = { presentationAncienne?: boolean; typographieArchivee?: boolean };
const construire: Record<"nu" | "meuble", (ctx: ContexteBail, o: Options) => DocumentAssemble> = {
  nu: (ctx, o) => construireBailNu(ctx, { dpeClasse: "D", f: new Fusion(), ...o }),
  meuble: (ctx, o) => construireBailMeuble(ctx, { dpeClasse: "D", inventaire: [], f: new Fusion(), ...o }),
};
const DOSSIERS: [string, () => ContexteBail][] = [
  ["simple", () => simple(false)],
  ["garant", () => simple(true)],
  ["riche", riche],
  ["individuel", individuel],
  ["etudiant", etudiant],
];
function empreinte(nom: string, regime: "nu" | "meuble", o: Options): string {
  const ctx = DOSSIERS.find(([n]) => n === nom)![1]();
  const { signataires } = partiesSignatureBail(ctx as never);
  return documentSignatureBail(construire[regime](ctx, o), signataires, [], ctx.garants.length).empreinte;
}

describe("empreinte d'un bail préparé avant la version g8, avec la présentation d'aujourd'hui (reprise du lot 35)", () => {
  for (const cle of Object.keys(PRODUCTION_81740DEC)) {
    const [nom, regime] = cle.split("_") as [string, "nu" | "meuble"];
    it(`${nom}, ${regime} : la typographie archivée rend l'empreinte calculée par la production`, () => {
      expect(empreinte(nom, regime, { typographieArchivee: true })).toBe(PRODUCTION_81740DEC[cle]);
    });
    it(`${nom}, ${regime} : ni la version g8 ni la présentation d'avant #331 ne la rendent (d'où ce recalcul)`, () => {
      expect(empreinte(nom, regime, {})).not.toBe(PRODUCTION_81740DEC[cle]);
      expect(empreinte(nom, regime, { presentationAncienne: true })).not.toBe(PRODUCTION_81740DEC[cle]);
    });
  }

  it("la typographie archivée garde la présentation d'aujourd'hui : le bailleur expédie, le SIREN du co-indivisaire reste", () => {
    const ctx = riche();
    const html = construireBailNu(ctx, { dpeClasse: "D", f: new Fusion(), typographieArchivee: true }).html;
    expect(html).toContain("SIREN 123456789");
    // Et la mise en forme d'avant g8 : « étage » toujours ajouté, surface brute, feuille sans les correctifs g8.
    expect(html).toContain("étage 2e étage, porte gauche");
    expect(html).toContain("45.00 m²");
    expect(html).not.toContain("table.ligne-total");
    const ancienne = construireBailNu(riche(), { dpeClasse: "D", f: new Fusion(), presentationAncienne: true }).html;
    expect(ancienne).not.toContain("SIREN 123456789");
  });
});
