/**
 * Audit final avant publication, chantier « design, UX, accessibilité, performance » (28/10/2026). Les gardes qui se
 * lisent dans les fichiers : jetons de marque déclarés une fois, cibles tactiles, image de partage, titre des fenêtres,
 * couleurs des courriels, pluriels, badge d'essai court.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARTE_GERIMMO } from "../src/lib/charte-gerimmo";
import { OPEN_GRAPH_PAR_DEFAUT } from "../src/lib/metadonnees-publiques";
import { badgeEssai, badgeEssaiCourt } from "../src/lib/tarifs";
import { ancreDuBlocage } from "../src/components/parcours-demarrage";

const racine = path.resolve(__dirname, "..");
const lire = (f: string) => readFileSync(path.join(racine, f), "utf8");
function fichiers(dossier: string, ext: RegExp): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin, ext) : ext.test(chemin) ? [chemin] : [];
  });
}

describe("UX-16 : les couleurs de marque sont déclarées une seule fois", () => {
  const jetons = ["marque", "marque-sombre", "marque-clair", "sur-marque", "or", "or-sombre", "or-texte", "sur-or", "or-clair", "or-filet", "encre", "graphite", "sur-encre", "prestige-nuit", "prestige-champagne", "prestige-champagne-texte"];
  const feuilles = fichiers(path.join(racine, "src/app"), /\.css$/).filter((f) => !f.endsWith(".module.css"));
  it.each(jetons)("--%s : une déclaration, dans globals.css, aux valeurs de la charte", (jeton) => {
    const lieux = feuilles.flatMap((f) => (readFileSync(f, "utf8").match(new RegExp(`^\\s*--${jeton}:`, "gm")) ?? []).map(() => path.basename(f)));
    expect(lieux).toEqual(["globals.css"]);
  });
  it("valeurs identiques à lib/charte-gerimmo.ts, et plus de commentaire de la charte bleue", () => {
    const g = lire("src/app/globals.css");
    expect(g).toMatch(new RegExp(`--marque: ${CHARTE_GERIMMO.marque};`));
    expect(g).toMatch(new RegExp(`--or: ${CHARTE_GERIMMO.or};`));
    expect(g).toMatch(new RegExp(`--encre: ${CHARTE_GERIMMO.encre};`));
    expect(g).not.toContain("plus de laiton, plus d'empattements");
    expect(g).not.toContain("#2457f5");
  });
  it("le bouton ne porte plus l'anneau Tailwind que prestige.css annulait", () => {
    expect(lire("src/components/ui/button.tsx")).not.toContain("focus-visible:ring-ring/50");
  });
});

describe("UX-12 : aucune cible fixée sous les 44 px du système", () => {
  it("aucun min-height de 42 px dans les feuilles", () => {
    const fautifs = fichiers(path.join(racine, "src"), /\.css$/).filter((f) => /min-height:\s*42px/.test(readFileSync(f, "utf8")));
    expect(fautifs.map((f) => path.relative(racine, f))).toEqual([]);
  });
});

describe("PUB-18 : image de partage 1200 × 630, légère", () => {
  it("l'Open Graph pointe une image au format attendu par les réseaux", () => {
    const image = OPEN_GRAPH_PAR_DEFAUT.images[0];
    expect(image).toMatchObject({ width: 1200, height: 630 });
    const fichier = path.join(racine, "public", image.url);
    expect(statSync(fichier).size).toBeLessThan(200 * 1024);
    const octets = readFileSync(fichier);
    expect(octets.subarray(0, 2).toString("hex")).toBe("ffd8");
  });
});

describe("UX-10 / DRT-08 : titres", () => {
  it("le titre de toute fenêtre est un h2 qui la nomme", () => {
    const m = lire("src/components/ui/modale.tsx");
    expect(m).toMatch(/<h2 id=\{idTitre\}/);
    expect(m).toContain("aria-labelledby={entete ? undefined : idTitre}");
    expect(m).not.toMatch(/<h3[^>]*>\{titre\}<\/h3>/);
  });
  it("le menu de la supervision a un nom distinct", () => {
    expect(lire("src/app/admin/nav-admin.tsx")).toContain('aria-label="Menu de la supervision"');
  });
});

describe("PUB-19 : courriels et illustration dans la charte", () => {
  it.each(["src/lib/lien-mot-de-passe.ts", "src/lib/notifications.ts", "src/lib/rappel-email.ts", "src/lib/appel-email.ts", "src/lib/relais-alerte.ts", "src/lib/relais-urgences.ts", "src/lib/alerte-veto-marketing.ts", "src/lib/conditions-versions-serveur.ts", "public/illustrations/journal-repli.svg"])("%s n'utilise plus les couleurs d'avant la charte", (f) => {
    expect(lire(f)).not.toMatch(/#0f2352|#151b2b|#4a5163|#2457f5/i);
  });
});

describe("PUB-17 : badge d'essai court au téléphone", () => {
  it("tient en une ligne à 390 px pendant l'offre de lancement, sans perdre l'information", () => {
    const pendant = new Date("2026-10-28T12:00:00Z");
    expect(badgeEssaiCourt(pendant)).toBe("2 mois gratuits jusqu'au 31/12");
    expect(badgeEssaiCourt(pendant).length).toBeLessThan(badgeEssai(pendant).length - 20);
  });
});

describe("PUB-20 : « Compléter le logement » ouvre la section du premier blocage", () => {
  it("diagnostics, détention, sinon caractéristiques", () => {
    expect(ancreDuBlocage("DPE absent ou expiré (obligatoire en habitation) · ERP absent")).toBe("#diagnostics");
    expect(ancreDuBlocage("Détention incomplète (50 %) · DPE absent")).toBe("#detention");
    expect(ancreDuBlocage("Loyer non renseigné")).toBe("#caracteristiques");
    expect(ancreDuBlocage(null)).toBe("#caracteristiques");
  });
});

describe("UX-13 : l'agenda ne précharge pas chaque case du mois", () => {
  it.each(["src/app/agence/[orgId]/agenda/page.tsx", "src/app/agence/[orgId]/agenda/agenda-proprietaire.tsx"])("%s : les jours et la navigation de mois portent prefetch={false}", (f) => {
    const a = lire(f);
    expect((a.match(/prefetch=\{false\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe("PUB-05 / PUB-06 : pages publiques statiques, police de document à la demande", () => {
  it.each(["src/app/page.tsx", "src/app/journal/page.tsx", "src/app/mentions-legales/page.tsx", "src/app/conditions/page.tsx", "src/app/confidentialite/page.tsx", "src/app/conditions/versions/page.tsx"])("%s lit sans cookie et se relit toutes les heures", (f) => {
    const t = lire(f);
    expect(t).not.toContain('from "@/lib/supabase/server"');
    expect(t).not.toContain("await createClient()");
    expect(t).toContain("export const revalidate = 3600");
  });
  it("Caladea n'est plus préchargée", () => {
    expect(lire("src/components/outils/police-document.ts")).toContain("preload: false");
  });
});
