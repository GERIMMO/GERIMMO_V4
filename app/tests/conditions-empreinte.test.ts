/**
 * Plan de conformité du 23/10/2026, constat R12 : le texte des conditions ne change pas sans nouvelle version.
 *
 * La page /conditions est rendue avec une identité d'éditeur FICTIVE et FIXE (aucune adresse réelle) ; son texte
 * contractuel (l'élément marqué `data-texte-contractuel`, lib/conditions-versions.ts) et la liste figée des
 * sous-traitants donnent une empreinte de référence, qui doit être celle que src/lib/conditions-versions.json déclare
 * pour la version en vigueur (CONDITIONS_VERSION).
 *
 * La page est rendue sous plusieurs identités fictives (VARIANTES : médiateur désigné ou non, coordonnées du médiateur
 * manquantes, adresse de contact seule, identité vide) : l'empreinte de garde couvre chaque branche du texte qui dépend
 * de l'identité (relecture adverse du 24/10, I3). Depuis la version du 24/11/2026 des conditions clients, le médiateur
 * ne change plus leur texte : ses variantes restent, pour le prouver.
 *
 * QUAND CE TEST ÉCHOUE, le texte a changé :
 *  - le changement touche le contrat : nouvelle version (CONDITIONS_VERSION et CONDITIONS_DATE dans lib/editeur.ts),
 *    puis une entrée de plus dans conditions-versions.json (date d'effet, nature, résumé, empreinte affichée ici) ;
 *    les entrées des versions passées ne se modifient pas ;
 *  - il ne touche pas le contrat (correction sans effet décidée par le dirigeant) : nouvelle empreinte pour la même
 *    version ; l'ancienne passe dans « empreintes_precedentes » et « note » dit pourquoi, avec la décision (le test
 *    l'exige). L'archive en ligne, elle, refusera l'archivage d'un texte différent sous la même version et alertera le
 *    relais.
 *
 * Sans base : la lecture de l'identité est remplacée, l'en-tête et le pied du site aussi.
 *
 * V1 (plan de conformité du 23/10, R10) : les conditions de l'espace artisan (/conditions/artisans) entrent dans la
 * même garde, avec leur propre version (CONDITIONS_ARTISANS_VERSION) et leur propre entrée dans le fichier JSON.
 */
import { existsSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DocumentConditions,
  DOCUMENTS_PUBLIES,
  balisageAdmis,
  empreinteDeGarde,
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
import { CONDITIONS_ARTISANS_VERSION, CONDITIONS_VERSION, PRESTATAIRES, cleCoordonnees, sousTraitantsArtisan, sousTraitantsClient } from "../src/lib/editeur";

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

/**
 * Les branches du texte qui dépendent de l'identité (relecture adverse du 24/10, I3) : la garde rend la page sous
 * chacune, et l'empreinte de garde les couvre toutes. Sans elles, le paragraphe du médiateur désigné (article 17,
 * `CoordonneesMediateur`) ou l'encadré « en cours de finalisation » pouvaient changer sans faire échouer la CI — alors
 * que la saisie du médiateur, décision du 23/10, ne change pas la version. Ajouter une variante change l'empreinte.
 */
const MEDIATEUR_FICTIF = {
  mediateurNom: "Médiateur fictif de la consommation",
  mediateurAdresse: "2 rue Fictive, 75000 Paris",
  mediateurSite: "https://mediateur.example",
};
const VARIANTES: readonly { variante: string; identite: Record<string, string | null> }[] = [
  { variante: "identite_complete_sans_mediateur", identite: IDENTITE_FIXE },
  { variante: "identite_complete_avec_mediateur", identite: { ...IDENTITE_FIXE, ...MEDIATEUR_FICTIF } },
  { variante: "mediateur_sans_coordonnees", identite: { ...IDENTITE_FIXE, mediateurNom: MEDIATEUR_FICTIF.mediateurNom } },
  { variante: "adresse_de_contact_seule", identite: { email: "contact@example.com" } },
  { variante: "identite_vide", identite: {} },
];

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
// Comme lib/editeur-serveur.ts : l'identité du code recouverte par les valeurs saisies.
vi.mock("@/lib/editeur-serveur", async () => {
  const { identiteDepuisValeurs } = await import("@/lib/identite-editeur");
  return { lireEditeur: async () => ({ editeur: identiteDepuisValeurs(lecture.valeurs), indisponible: false }) };
});
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Conditions from "../src/app/conditions/page";
import ConditionsArtisans from "../src/app/conditions/artisans/page";

beforeEach(() => {
  lecture.valeurs = { ...IDENTITE_FIXE };
});

const PAGES: Record<DocumentConditions, () => Promise<ReactElement>> = {
  conditions_clients: Conditions,
  conditions_artisans: ConditionsArtisans,
};

async function pageRendue(document: DocumentConditions = "conditions_clients"): Promise<string> {
  return renderToStaticMarkup(await PAGES[document]());
}

/**
 * Le texte contractuel d'un document publié (par défaut /conditions) rendu sous chaque variante de l'identité.
 * Intégration des textes du 24/10 : les conditions de l'espace artisan suivent la même garde (cinq identités), comme le
 * socle final le fait pour les conditions clients.
 */
async function rendusDeGarde(document: DocumentConditions = "conditions_clients"): Promise<{ variante: string; html: string }[]> {
  const attendue = DOCUMENTS_PUBLIES.find((d) => d.document === document)?.version;
  const rendus: { variante: string; html: string }[] = [];
  for (const { variante, identite } of VARIANTES) {
    lecture.valeurs = { ...identite };
    const extraction = extraireTexteContractuel(await pageRendue(document), document);
    if (!extraction.ok) throw new Error(`${variante} : texte contractuel introuvable (${extraction.motif})`);
    if (extraction.version !== attendue) throw new Error(`${variante} : version ${extraction.version}`);
    rendus.push({ variante, html: extraction.html });
  }
  lecture.valeurs = { ...IDENTITE_FIXE };
  return rendus;
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
    expect(DOCUMENTS_PUBLIES.find((d) => d.document === "conditions_artisans")?.version).toBe(CONDITIONS_ARTISANS_VERSION);
  });

  // Intégration des textes du 24/10 : chaque document publié a son empreinte de garde (cinq identités fictives), celle
  // du socle final ; l'empreinte d'un seul rendu (empreinteDeReference) ne sert plus de référence.
  it.each(DOCUMENTS_PUBLIES.map((d) => [d.document, d] as const))(
    "l'empreinte de garde de %s (toutes les variantes de l'identité) est celle de conditions-versions.json pour sa version en vigueur",
    async (document, d) => {
      // Lot T4 (24/11/2026) : l'annexe des conditions de l'espace artisan garde son propre rôle d'OpenAI (propositions
      // de devis seulement) ; celle des conditions clients décrit désormais les trois envois. Chaque document est
      // empreint avec SA liste, et les conditions de l'espace artisan gardent leur empreinte du 24/10/2026.
      const liste = listeFigeeSousTraitants(document === "conditions_artisans" ? sousTraitantsArtisan() : sousTraitantsClient());
      const calculee = empreinteDeGarde(await rendusDeGarde(document), liste);
      const declaree = versionDeclaree(document, d.version)?.empreinte_reference;
      expect(
        calculee,
        `Le texte de ${d.chemin} a changé sans nouvelle version (${document} ${d.version}). ` +
          `Empreinte calculée : ${calculee}. Voir l'en-tête de tests/conditions-empreinte.test.ts.`
      ).toBe(declaree);
    }
  );

  it("la liste figée des sous-traitants est celle des annexes : les seuls sous-traitants des données du Client", () => {
    expect(listeFigeeSousTraitants().map((p) => p.nom)).toEqual(sousTraitantsClient().map((p) => p.nom));
    expect(listeFigeeSousTraitants().map((p) => p.cle)).toEqual(["supabase", "vercel", "resend", "zohoSign", "openai", "scaleway", "github"]);
    // Lot T4 : mêmes prestataires pour l'espace artisan ; seul le rôle d'OpenAI y diffère (devis seulement).
    const artisan = listeFigeeSousTraitants(sousTraitantsArtisan());
    expect(artisan.map((p) => p.cle)).toEqual(listeFigeeSousTraitants().map((p) => p.cle));
    expect(artisan.filter((p, i) => p.role !== listeFigeeSousTraitants()[i].role).map((p) => p.cle)).toEqual(["openai"]);
    expect(artisan.find((p) => p.cle === "openai")?.role).toBe(
      "Propositions de devis artisans : catalogue tarifaire et symptômes techniques sélectionnés, à l'exclusion des noms, adresses et descriptions libres des occupants"
    );
  });

  it("l'empreinte de garde de /conditions (toutes les variantes de l'identité) est celle de conditions-versions.json", async () => {
    const rendus = await rendusDeGarde();
    const calculee = empreinteDeGarde(rendus);
    const declaree = versionDeclaree("conditions_clients", CONDITIONS_VERSION)?.empreinte_reference;
    expect(
      calculee,
      `Le texte des conditions a changé sans nouvelle version (CONDITIONS_VERSION = ${CONDITIONS_VERSION}). ` +
        `Empreinte calculée : ${calculee}. Voir l'en-tête de tests/conditions-empreinte.test.ts.`
    ).toBe(declaree);
  });

  // Version du 24/11/2026 (reprise du lot D7, relectures D7R-01 et D7R-02) : ce test affirmait l'ancienne règle —
  // un paragraphe par état du médiateur (« dès l'adhésion de l'Éditeur », ou ses coordonnées), donc cinq rendus
  // distincts. L'article 17 est désormais UN SEUL texte, vrai dans les deux cas : les trois variantes qui ne diffèrent
  // que par le médiateur rendent le même texte, mot pour mot. Les variantes restent dans la garde : elles prouvent à
  // chaque passage que le contrat ne dépend pas du médiateur.
  it("I3 : chaque branche de l'identité est rendue — le médiateur ne change plus le texte ; encadré et ses deux renvois", async () => {
    const rendus = Object.fromEntries((await rendusDeGarde()).map((r) => [r.variante, r.html]));
    expect(rendus.identite_complete_avec_mediateur).toBe(rendus.identite_complete_sans_mediateur);
    expect(rendus.mediateur_sans_coordonnees).toBe(rendus.identite_complete_sans_mediateur);
    for (const html of Object.values(rendus)) {
      expect(html).not.toContain("adhésion de l&#x27;Éditeur");
      expect(html).not.toContain("Médiateur fictif de la consommation");
      expect(html).not.toContain("https://mediateur.example");
      expect(html).not.toContain("adresse du médiateur (à venir)");
      expect(html).toContain("Tant qu&#x27;aucun médiateur n&#x27;est désigné, les mentions légales");
    }
    expect(rendus.adresse_de_contact_seule).toContain("Document en cours de finalisation");
    expect(rendus.adresse_de_contact_seule).toContain('href="mailto:contact@example.com');
    expect(rendus.identite_vide).toContain("formulaire de contact de l&#x27;accueil");
    // Trois textes distincts : identité complète (avec ou sans médiateur), adresse de contact seule, identité vide.
    expect(new Set(Object.values(rendus)).size).toBe(3);
  });

  // Même raison : il n'existe plus de « paragraphe du médiateur désigné ». La propriété gardée est la même — un mot
  // changé dans UNE variante change l'empreinte de garde, les autres rendus restant intacts.
  it("I3 : un mot changé dans le paragraphe de la médiation d'une seule variante change l'empreinte de garde", async () => {
    const rendus = await rendusDeGarde();
    const reference = empreinteDeGarde(rendus);
    const modifies = rendus.map((r) =>
      r.variante === "identite_complete_avec_mediateur" ? { ...r, html: r.html.replace("recourir gratuitement à un médiateur", "recourir à un médiateur") } : r
    );
    expect(modifies).not.toEqual(rendus);
    expect(empreinteDeGarde(modifies)).not.toBe(reference);
    const sansMediateur = rendus.find((r) => r.variante === "identite_complete_sans_mediateur")!;
    expect(modifies.find((r) => r.variante === "identite_complete_sans_mediateur")!.html).toBe(sansMediateur.html);
  });

  it("I3 : une empreinte relevée de nouveau sous la même version garde les précédentes et dit pourquoi", () => {
    for (const [document, version, v] of versionsDeclarees()) {
      const precedentes = v.empreintes_precedentes ?? [];
      for (const e of precedentes) expect(e, `${document} ${version}`).toMatch(/^[0-9a-f]{64}$/);
      expect(precedentes, `${document} ${version} : l'empreinte en vigueur ne peut pas être aussi une précédente`).not.toContain(v.empreinte_reference);
      if (precedentes.length > 0) expect(v.note?.trim().length ?? 0, `${document} ${version} : « note » obligatoire`).toBeGreaterThan(20);
    }
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
    expect(extraction.html).toContain("Annexe 1 — Traitement de données pour le compte du Client");
    expect(extraction.html).toContain("Annexe 2 — Articles L. 215-1 à L. 215-3 et L. 241-3");
  });

  it("la page des conditions de l'espace artisan porte son texte marqué, hors du lien vers les versions", async () => {
    const page = await pageRendue("conditions_artisans");
    const extraction = extraireTexteContractuel(page, "conditions_artisans");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    expect(extraireTexteContractuel(page, "conditions_clients")).toEqual({ ok: false, motif: "absent" });
    expect(page).toContain('href="/conditions/versions"');
    expect(extraction.html).not.toContain("/conditions/versions");
    expect(extraction.html).toContain("<h1>Conditions de l");
    expect(extraction.html).toContain("A14. Réclamations et droit applicable");
    expect(extraction.html).toContain("Annexe — Traitement de données pour le compte de l");
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

  it("M1 : liste blanche — les contournements du filtre de code actif sont refusés, à l'extraction comme à l'affichage", () => {
    const marque = '<div data-texte-contractuel="conditions_clients" data-version="v">';
    for (const piege of [
      "<img/onerror=alert(1) src=x>",
      '<img src="x"/onerror="alert(1)">',
      '<a href="javascript&#58;alert(1)">x</a>',
      '<a href="jav&#x09;ascript:alert(1)">x</a>',
      '<svg><a xlink:href="javascript&colon;alert(1)">x</a></svg>',
      '<meta http-equiv="refresh" content="0;url=https://piege.example">',
      "<style>body{display:none}</style>",
      '<p style="background:url(https://piege.example/x)">x</p>',
      '<a href="//piege.example">x</a>',
      '<a href="/&#x09;/piege.example">x</a>',
      '<a href="data:text/html,x">x</a>',
      '<p id="P:1">x</p>',
      "<math><mi>x</mi></math>",
      "<p>texte <!x> suite</p>",
      "<p onclick='x()'>x</p>",
      "<button>x</button>",
    ]) {
      expect(balisageAdmis(`<p>Texte.</p>${piege}`), piege).toBe(false);
      expect(extraireTexteContractuel(`${marque}<p>Texte.</p>${piege}</div>`, "conditions_clients"), piege).toMatchObject({ ok: false });
    }
    // Ce que les conditions emploient réellement reste admis.
    expect(balisageAdmis(
      '<div><h1>T</h1><p class="mt-1">a &amp; b</p></div><section class="loc-carte"><h2>1.</h2><ul class="ml-4"><li><b>x</b></li></ul>' +
        '<a class="lien-texte" href="/confidentialite">c</a> <a href="https://exemple.example/vie-privee?a=1&amp;b=2" rel="noreferrer">d</a>' +
        ' <a href="mailto:contact@example.com?subject=donn%C3%A9es">e</a><table class="tableau"><thead><tr><th>P</th></tr></thead>' +
        '<tbody><tr><td data-libelle="Rôle"><span class="italic">x (à venir)</span></td></tr></tbody></table></section>'
    )).toBe(true);
  });

  it("M1 : chaque rendu de la garde passe la liste blanche (une balise nouvelle échoue ici, pas au moment d'archiver)", async () => {
    for (const d of DOCUMENTS_PUBLIES) {
      for (const r of await rendusDeGarde(d.document)) expect(balisageAdmis(r.html), `${d.document} ${r.variante}`).toBe(true);
    }
  });
});

// Relecture de la fusion du 25/11/2026 (C-03) : l'article 17 de la version du 24/11/2026 ne vise plus que le « Client
// consommateur » (« consommateur ou non-professionnel » auparavant). Le résumé des changements, montré à l'abonné à qui
// l'accord exprès est demandé puis recopié dans l'archive, ne le disait pas. Le résumé n'entre pas dans le texte
// contractuel : l'empreinte de garde de la version (test ci-dessus) ne bouge pas.
describe("résumé de la version du 24/11/2026 (relecture de la fusion, C-03)", () => {
  it("dit que l'article 17 ne vise plus le Client non-professionnel ; l'empreinte déclarée reste 67391a33…", () => {
    const v = versionDeclaree("conditions_clients", "2026-11-24");
    expect(v?.resume_modifications).toContain("le Client non-professionnel n’y est plus mentionné");
    expect(v?.resume_modifications).toMatch(/article 17/i);
    expect(v?.empreinte_reference).toBe("67391a33df830dffdb617ba08de99b734ce3e6ec0ac490d1d67f05f784d52fb9");
  });
});
