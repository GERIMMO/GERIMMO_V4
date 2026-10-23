/**
 * Plan de conformité du 23/10/2026, constat R12 : le texte des conditions ne change pas sans nouvelle version.
 *
 * La page /conditions est rendue avec une identité d'éditeur FICTIVE et FIXE (aucune adresse réelle) ; son texte
 * contractuel (l'élément marqué `data-texte-contractuel`, lib/conditions-versions.ts) et la liste figée des
 * sous-traitants donnent une empreinte de référence, qui doit être celle que src/lib/conditions-versions.json déclare
 * pour la version en vigueur (CONDITIONS_VERSION).
 *
 * QUAND CE TEST ÉCHOUE, le texte a changé :
 *  - le changement touche le contrat : nouvelle version (CONDITIONS_VERSION et CONDITIONS_DATE dans lib/editeur.ts),
 *    puis une entrée de plus dans conditions-versions.json (date d'effet, nature, résumé, empreinte affichée ici) ;
 *    les entrées des versions passées ne se modifient pas ;
 *  - il ne touche pas le contrat (correction sans effet décidée par le dirigeant) : nouvelle empreinte pour la même
 *    version, avec la décision citée dans « note ». L'archive en ligne, elle, refusera l'archivage d'un texte différent
 *    sous la même version et alertera le relais.
 *
 * Sans base : la lecture de l'identité est remplacée, l'en-tête et le pied du site aussi.
 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENTS_PUBLIES,
  empreinteDeReference,
  extraireTexteContractuel,
  formeDeReference,
  listeFigeeSousTraitants,
  normaliserHtml,
  sha256Hex,
  estDocumentConditions,
  versionDeclaree,
  versionsDeclarees,
} from "../src/lib/conditions-versions";
import { CONDITIONS_VERSION, PRESTATAIRES, cleCoordonnees } from "../src/lib/editeur";

/** L'identité fictive et figée de la garde : la changer change l'empreinte de référence. */
const IDENTITE_FIXE: Record<string, string | null> = {
  denomination: "Éditeur fictif EI",
  forme: "Entrepreneur individuel (EI)",
  capital: null,
  siege: "1 rue de l'Exemple, 75000 Paris",
  rcs: "RNE 000 000 000",
  siret: "00000000000000",
  tvaIntracommunautaire: null,
  directeurPublication: "Personne fictive",
  email: "contact@example.com",
  telephone: "01 00 00 00 00",
  mediateurNom: null,
  mediateurAdresse: null,
  mediateurSite: null,
  localisationBan: "France",
  ...Object.fromEntries(PRESTATAIRES.map((p) => [cleCoordonnees(p), `Coordonnées fictives de ${p.nom}`])),
};

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/editeur-serveur", () => ({
  lireEditeur: async () => ({ editeur: lecture.valeurs, indisponible: false }),
}));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Conditions from "../src/app/conditions/page";

beforeEach(() => {
  lecture.valeurs = { ...IDENTITE_FIXE };
});

async function pageRendue(): Promise<string> {
  return renderToStaticMarkup(await Conditions());
}

describe("garde du code : le texte des conditions ne change pas sans nouvelle version", () => {
  it("chaque document publié a une page et une entrée pour sa version en vigueur", () => {
    for (const d of DOCUMENTS_PUBLIES) {
      expect(existsSync(d.fichier), d.fichier).toBe(true);
      expect(versionDeclaree(d.document, d.version), `${d.document} ${d.version} : ajoutez son entrée à conditions-versions.json`).not.toBeNull();
    }
    expect(DOCUMENTS_PUBLIES.find((d) => d.document === "conditions_clients")?.version).toBe(CONDITIONS_VERSION);
  });

  it("chaque version déclarée a une forme exacte : document connu, date d'effet, nature, résumé, empreinte", () => {
    const declarees = versionsDeclarees();
    expect(declarees.length).toBeGreaterThan(0);
    for (const [document, version, v] of declarees) {
      expect(estDocumentConditions(document), document).toBe(true);
      expect(version).toMatch(/^[0-9A-Za-z._-]{1,40}$/);
      expect(v.date_effet).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["substantielle", "technique"]).toContain(v.nature);
      expect(v.resume_modifications.trim().length).toBeGreaterThan(0);
      expect(v.resume_modifications.length).toBeLessThanOrEqual(4000);
      expect(v.empreinte_reference).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("les conditions de l'espace artisan, dès que leur page existe, entrent dans la garde", () => {
    const page = "src/app/conditions/artisans/page.tsx";
    if (existsSync(page)) {
      expect(DOCUMENTS_PUBLIES.map((d) => d.document), "ajoutez conditions_artisans à DOCUMENTS_PUBLIES").toContain("conditions_artisans");
    }
  });

  it("l'empreinte de référence de /conditions est celle de conditions-versions.json pour la version en vigueur", async () => {
    const extraction = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;
    expect(extraction.version).toBe(CONDITIONS_VERSION);
    const calculee = empreinteDeReference(extraction.html);
    const declaree = versionDeclaree("conditions_clients", CONDITIONS_VERSION)?.empreinte_reference;
    expect(
      calculee,
      `Le texte des conditions a changé sans nouvelle version (CONDITIONS_VERSION = ${CONDITIONS_VERSION}). ` +
        `Empreinte calculée : ${calculee}. Voir l'en-tête de tests/conditions-empreinte.test.ts.`
    ).toBe(declaree);
  });

  it("le rendu est déterministe : deux rendus, une seule empreinte", async () => {
    const a = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    const b = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    expect(a).toEqual(b);
  });

  it("un mot changé dans le texte, ou un sous-traitant changé, change l'empreinte", async () => {
    const extraction = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    const reference = empreinteDeReference(extraction.html);
    expect(empreinteDeReference(extraction.html.replace("droit français", "droit belge"))).not.toBe(reference);
    const liste = listeFigeeSousTraitants();
    const modifiee = liste.map((p, i) => (i === 0 ? { ...p, localisation: "Ailleurs" } : p));
    expect(empreinteDeReference(extraction.html, modifiee)).not.toBe(reference);
    expect(empreinteDeReference(extraction.html, [...liste, { cle: "nouveau", nom: "Nouveau", role: "Rôle", localisation: null, documentation: null }])).not.toBe(reference);
  });

  it("une classe ou un style changés ne changent pas l'empreinte de référence", async () => {
    const extraction = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    const reference = empreinteDeReference(extraction.html);
    const restylee = extraction.html.replace(/class="loc-carte/g, 'class="autre-carte').replace("<section ", '<section style="color:red" ');
    expect(restylee).not.toBe(extraction.html);
    expect(empreinteDeReference(restylee)).toBe(reference);
  });

  it("le lien vers les versions archivées est sur la page, hors du texte contractuel", async () => {
    const page = await pageRendue();
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    expect(page).toContain('href="/conditions/versions"');
    expect(extraction.html).not.toContain("/conditions/versions");
    // Le titre, le chapeau et les articles sont dans le texte.
    expect(extraction.html).toContain("<h1>Conditions générales d");
    expect(extraction.html).toContain("17. Droit applicable et litiges");
    expect(extraction.html).toContain("Annexe — Traitement de données pour le compte du Client");
  });

  it("l'identité saisie entre dans le texte rendu : la garde la fige, l'archive porte la réelle", async () => {
    const avant = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    lecture.valeurs = { ...IDENTITE_FIXE, email: "autre@example.com" };
    const apres = extraireTexteContractuel(await pageRendue(), "conditions_clients");
    if (!avant.ok || !apres.ok) throw new Error("texte contractuel introuvable");
    expect(apres.html).toContain("autre@example.com");
    expect(empreinteDeReference(apres.html)).not.toBe(empreinteDeReference(avant.html));
  });
});

describe("normalisation, extraction et empreinte (sans page)", () => {
  it("SHA-256 des octets UTF-8, comme la base (encode(sha256(convert_to(t, 'UTF8')), 'hex'))", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // « é » composé (NFC) et décomposé (NFD) : la normalisation les confond, l'empreinte brute non.
    expect(sha256Hex("é")).not.toBe(sha256Hex("é"));
    expect(normaliserHtml("é")).toBe("é");
  });

  it("retire les commentaires de React et réduit les blancs HTML, mais garde les espaces insécables", () => {
    expect(normaliserHtml("  <p>Le\n\t Client<!-- --> paie<!-- --> :</p>  ")).toBe("<p>Le Client paie :</p>");
    expect(normaliserHtml("a b")).toBe("a b");
    expect(formeDeReference('<p class="x" style="y">t</p>')).toBe("<p>t</p>");
  });

  it("extrait le seul élément marqué, divs imbriquées comprises, avec sa version", () => {
    const page =
      '<html><body><header><div>menu</div></header><main><div data-texte-contractuel="conditions_clients" data-version="2026-09-30" class="space-y-4">' +
      "<div><h1>Titre</h1></div><section><div><div>art.</div></div></section></div><nav>lien</nav></main></body></html>";
    expect(extraireTexteContractuel(page, "conditions_clients")).toEqual({
      ok: true,
      html: "<div><h1>Titre</h1></div><section><div><div>art.</div></div></section>",
      version: "2026-09-30",
      identiteLue: false,
      identiteEmpreinte: null,
    });
    expect(extraireTexteContractuel(page, "conditions_artisans")).toEqual({ ok: false, motif: "absent" });
  });

  it("refuse deux éléments marqués, un élément non refermé, ou du code actif", () => {
    const marque = '<div data-texte-contractuel="conditions_clients" data-version="v">';
    expect(extraireTexteContractuel(`${marque}a</div>${marque}b</div>`, "conditions_clients")).toEqual({ ok: false, motif: "plusieurs" });
    expect(extraireTexteContractuel(`${marque}<div>a</div>`, "conditions_clients")).toEqual({ ok: false, motif: "non_ferme" });
    expect(extraireTexteContractuel(`${marque}<script>x()</script></div>`, "conditions_clients")).toEqual({ ok: false, motif: "contenu_actif" });
    expect(extraireTexteContractuel(`${marque}<a href="#" onclick="x()">a</a></div>`, "conditions_clients")).toEqual({ ok: false, motif: "contenu_actif" });
  });
});
