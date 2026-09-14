import { describe, expect, it } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { Fusion } from "@/lib/documents/gabarit";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
function document(meuble: boolean) {
  const c = contexte(); c.bail.type = "colocation"; c.bail.chambre_id = "chambre1"; c.lot.meuble = meuble;
  c.chambre = { id: "chambre1", nom: "Chambre Jardin", surface_m2: 12, volume_m3: 30, description: "Porte 2, fenêtre sur jardin", espaces_partages: "Cuisine équipée, séjour et salle de bains", equipements: "Bureau, placard et lit" };
  c.plafondColocation = 1200;
  const options = { f: new Fusion(), dpeClasse: "D", inventaire: [{ piece: "Chambre Jardin", designation: "Lit double", quantite: 1, etat: "bon", observation: null }] };
  return meuble ? construireBailMeuble(c, options) : construireBailNu(c, options);
}
describe("document individuel", () => {
  it.each([false, true])("décrit la partie privative, conserve le loyer individuel et exclut la solidarité (meublé=%s)", meuble => {
    const doc = document(meuble);
    expect(doc.html).toContain("Contrat individuel de colocation");
    expect(doc.html).toContain("Chambre Jardin"); expect(doc.html).toContain("Porte 2, fenêtre sur jardin");
    expect(doc.html).toContain("Cuisine équipée, séjour et salle de bains");
    expect(doc.html).toContain("aucune solidarité"); expect(doc.html).toContain("ne mettent pas fin aux contrats des autres");
    expect(doc.html).not.toContain("Contrat type — annexe"); expect(doc.html).not.toContain("Clause de solidarité");
    expect(doc.html).toMatch(/650,00\s€/); expect(doc.html).toMatch(/1[\s\u202f]200,00\s€/);
    expect(doc.html.includes("Lit double")).toBe(meuble);
    expect(doc.piedHtml).toContain("contrat individuel");
  });
});
const chrome = process.env.GERIMMO_CHROME;
it.skipIf(!chrome || !existsSync(chrome))("produit les deux PDF individuels pour contrôle visuel", { timeout: 60000 }, async () => {
  const { rendrePdf } = await import("@/lib/documents/rendu");
  const dossier = join(tmpdir(), "gerimmo-contrats-individuels"); mkdirSync(dossier, { recursive: true });
  for (const meuble of [false, true]) {
    const pdf = await rendrePdf(document(meuble));
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toContain("%PDF-");
    writeFileSync(join(dossier, meuble ? "meuble.pdf" : "nu.pdf"), pdf);
  }
});
