/**
 * Relecture transverse 3 du 24/10 (I1) : un bail préparé et envoyé AVANT la mise en ligne des finitions de conformité,
 * signé APRÈS, doit pouvoir être activé (« Activer le bail signé »). L'activation recalcule l'empreinte du contrat et
 * la compare à celle du circuit, calculée par le code de la production (20b3ffa, publication n°2).
 *
 * Les empreintes attendues ci-dessous ont été relevées le 24/10/2026 en passant les mêmes données (fixture
 * `contexte-document`, locataire, bailleur et, selon le cas, un garant) au code de 20b3ffa : `construireBailNu` ou
 * `construireBailMeuble`, `partiesSignatureBail`, `ajouterPagesSignature`, `empreinteSignatureBail`.
 *  · sans garant, le calcul d'aujourd'hui doit rendre l'empreinte de la production (la page de signature est restée
 *    octet pour octet la même) ;
 *  · avec garant, le calcul « avant le 24/10 » de l'activation (numéro de la fiche du garant, contrat sans les deux
 *    mentions du garant ajoutées le 24/10) doit la rendre aussi.
 * Ce test ne vaut que pour les circuits préparés avant la mise en ligne : si un gabarit de bail change ensuite, il est à
 * revoir (et ces circuits auront été activés ou abandonnés entre-temps).
 */
import { describe, expect, it } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { documentSignatureBail, partiesSignatureBail } from "@/lib/signature-bail";

const PRODUCTION_20B3FFA = {
  nu_sans_garant: "dd19999db1a45eb11af48c7e99a38de19d00468ee1bb89e638c2ca54db131730",
  nu_avec_garant: "0d3aa2a3a297ed164dcff62c14c6e7a73f6bd04c7614c928d5d1d7c8e9d4b8bf",
  meuble_sans_garant: "6c61bca9ff1e52f82f36fb519cca5cf67e76e7bc84391d489b30f7d1e05c6fa8",
  meuble_avec_garant: "b20bcabc6c38fa5d55664bfa4c5b95e3a08c1af869ae4bb8db76fbd4c7b61406",
};

function ctxDe(avecGarant: boolean) {
  const p = (o: Record<string, unknown>) => ({ ...personne(o as never), email: o.email as string, telephone: (o.telephone as string) ?? "+33600000001", qualite: "personne physique" });
  const ctx = contexte({ garants: [] } as never);
  ctx.locataires = [p({ id: "l1", nom: "Martin", prenom: "Lea", email: "locataire@example.invalid" }) as never];
  ctx.bailleurs = [{ ...p({ id: "b1", nom: "Durand", prenom: "Paul", email: "bailleur@example.invalid", telephone: "+33600000002" }), quote_part: 100 } as never];
  if (avecGarant) ctx.garants = [p({ id: "g1", nom: "Leblanc", prenom: "Marc", email: "garant@example.invalid", telephone: "+33600000009" }) as never];
  return ctx;
}

const MODELES: [string, (c: never) => DocumentAssemble][] = [
  ["nu", (c) => construireBailNu(c, { dpeClasse: "D", f: new Fusion() })],
  ["meuble", (c) => construireBailMeuble(c, { dpeClasse: "D", inventaire: [], f: new Fusion() })],
];

describe("empreinte d'un bail préparé avant la mise en ligne (relecture transverse 3, I1)", () => {
  for (const [nom, construire] of MODELES) {
    it(`bail ${nom} sans garant : le calcul d'aujourd'hui rend l'empreinte de la production`, () => {
      const ctx = ctxDe(false);
      const { signataires } = partiesSignatureBail(ctx as never);
      const { empreinte } = documentSignatureBail(construire(ctx as never), signataires, [], 0);
      expect(empreinte).toBe(PRODUCTION_20B3FFA[`${nom}_sans_garant` as keyof typeof PRODUCTION_20B3FFA]);
    });
    it(`bail ${nom} avec garant : le calcul d'avant le 24/10 de l'activation rend l'empreinte de la production`, () => {
      const ctx = ctxDe(true);
      const ancien = partiesSignatureBail(ctx as never, true, { telephoneGarantDuDossier: true });
      const { empreinte } = documentSignatureBail(construire(ctx as never), ancien.signataires, [], 1, true);
      expect(empreinte).toBe(PRODUCTION_20B3FFA[`${nom}_avec_garant` as keyof typeof PRODUCTION_20B3FFA]);
      // Le calcul d'aujourd'hui, lui, diffère (mentions du garant, numéro confirmé par le garant) : d'où le repli.
      const nouveau = partiesSignatureBail(ctx as never);
      expect(documentSignatureBail(construire(ctx as never), nouveau.signataires, [], 1).empreinte).not.toBe(empreinte);
    });
  }
});
