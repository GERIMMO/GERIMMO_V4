/**
 * Relecture adverse du socle (24/10/2026, B1) : la page /conditions arrive EN FLUX. Next.js (React 19, Fizz) envoie
 * d'abord l'ossature, avec des marques vides `<template id="P:n">` à la place des passages pas encore prêts, puis ces
 * passages dans des `<div hidden id="S:n">` que des scripts `$RS("S:n","P:n")` (passage) et `$RC("B:n","S:n")`
 * (frontière d'attente) remettent en place dans le navigateur. Une extraction qui s'en tient à l'élément marqué range
 * un texte troué : relevé sur un vrai `next start`, 17 marques vides, dont l'article 8.7 et le délai de la L. 215-1.
 *
 * Ce fichier vérifie, sans base :
 *  - la page réellement servie par `next start` (tests/fixtures/conditions-next-start.html, relevée le 24/10/2026 sur
 *    le build de cette branche, base du banc à l'identité fictive) : 18 marques vides dans la page, texte complet après
 *    reconstitution, identique au caractère près au rendu d'un seul tenant ;
 *  - un vrai flux de React (renderToReadableStream), passages imbriqués et frontière d'attente compris, sur une page
 *    simple puis sur la page /conditions elle-même, chaque article arrivant en retard : le texte reconstitué est,
 *    au caractère près, celui du rendu d'un seul tenant ;
 *  - le refus d'une page dont un passage n'a pas pu être remis en place (segment absent, instruction absente,
 *    frontière rendue côté navigateur) : rien d'incomplet n'est archivé.
 *
 * Le parcours navigateur e2e/conditions-flux.spec.ts compare en outre, en CI, l'extraction au texte qu'un navigateur
 * affiche, sur le build servi par `next start`.
 */
import { readFileSync } from "node:fs";
import { createElement as h, Suspense, use, type ReactNode } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { extraireTexteContractuel, reconstituerFlux } from "../src/lib/conditions-versions";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/editeur-serveur", async () => {
  const { identiteDepuisValeurs } = await import("@/lib/identite-editeur");
  return { lireEditeur: async () => ({ editeur: identiteDepuisValeurs(lecture.valeurs), indisponible: false }) };
});
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
// Chaque article de la page attend une promesse propre, résolue à un moment différent : Fizz envoie alors l'article
// hors de sa place, dans un `<div hidden id="S:n">`, remis en place par `$RS`.
const retards = vi.hoisted(() => ({ actifs: false, promesses: new Map<string, Promise<void>>(), rang: 0 }));
vi.mock("@/components/coquille-legale", async (importer) => {
  const vrai = await importer<typeof import("@/components/coquille-legale")>();
  const { createElement, use: utiliser } = await import("react");
  function Retarde({ cle, children }: { cle: string; children?: ReactNode }) {
    if (retards.actifs) {
      let p = retards.promesses.get(cle);
      if (!p) {
        const delai = 5 + ((retards.rang++ * 7) % 23);
        p = new Promise<void>((r) => setTimeout(r, delai));
        retards.promesses.set(cle, p);
      }
      utiliser(p);
    }
    return children;
  }
  return {
    ...vrai,
    Article: (props: Parameters<typeof vrai.Article>[0]) =>
      createElement(Retarde, { cle: props.titre }, createElement(vrai.Article, props)),
  };
});
import Conditions from "../src/app/conditions/page";

async function lireFlux(flux: ReadableStream<Uint8Array>): Promise<string> {
  const lecteur = flux.getReader();
  const decodeur = new TextDecoder();
  let page = "";
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) return page + decodeur.decode();
    page += decodeur.decode(value, { stream: true });
  }
}

/** L'identité saisie dans la base du banc quand tests/fixtures/conditions-next-start.html a été relevée (fictive). */
const IDENTITE_DU_BANC: Record<string, string> = {
  denomination: "Éditeur fictif du banc EI",
  forme: "Entrepreneur individuel (EI)",
  siege: "1 rue de l'Exemple, 75000 Paris",
  rcs: "RNE 000 000 000",
  siret: "00000000000000",
  directeurPublication: "Personne fictive",
  email: "contact@example.com",
  telephone: "01 00 00 00 00",
};

const MARQUES_DE_FLUX = /<template\b|\bid="[PSB]:[0-9a-zA-Z]+"|<!--\$[?!~]-->/;

describe("B1 : la page servie par next start, reconstituée avant l'extraction", () => {
  const page = readFileSync("tests/fixtures/conditions-next-start.html", "utf8");

  it("la page servie est bien en flux (sinon ce test ne prouverait rien)", () => {
    expect(page).toMatch(/<template id="P:[0-9a-f]+"><\/template>/);
    expect(page).toContain('$RS("S:2","P:2")');
    expect(page).toContain('$RC("B:0","S:0")');
  });

  it("le texte extrait est complet : les passages envoyés hors de leur place y sont, sans aucune marque de flux", () => {
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;
    expect(extraction.html).not.toMatch(MARQUES_DE_FLUX);
    for (const passage of [
      "8.7 — Reconduction",
      "au plus tôt trois mois et au plus tard un mois avant le terme",
      "8.8 — Hors abonnement",
      "Droits des personnes.",
      "Formulaire de rétractation",
      "17. Droit applicable et litiges",
    ]) {
      expect(extraction.html, passage).toContain(passage);
    }
    // Le texte suit l'ordre de la page : le délai de la L. 215-1 est à sa place dans la phrase.
    expect(extraction.html).toMatch(/par courrier électronique, <b class="font-semibold">au plus tôt trois mois/);
  });

  it("le texte reconstitué est, au caractère près, celui du rendu d'un seul tenant avec la même identité", async () => {
    // L'identité fictive de la base du banc qui a servi la page (supervision_identite.valeurs).
    lecture.valeurs = { ...IDENTITE_DU_BANC };
    const attendu = extraireTexteContractuel(renderToStaticMarkup(await Conditions()), "conditions_clients");
    expect(attendu.ok).toBe(true);
    expect(extraireTexteContractuel(page, "conditions_clients")).toEqual(attendu);
  });

  it("la reconstitution ne laisse ni segment caché ni frontière en attente dans la page", () => {
    const reconstituee = reconstituerFlux(page);
    expect(reconstituee).not.toMatch(/<div hidden id="S:/);
    expect(reconstituee).not.toMatch(/<template id="[PB]:/);
    expect(reconstituee).not.toContain("<!--$?-->");
    expect(reconstituee.match(/data-texte-contractuel="conditions_clients"/g)).toHaveLength(1);
  });
});

function Lent({ p, children }: { p: Promise<string>; children?: ReactNode }) {
  return h("div", null, h("b", null, use(p)), children);
}
// Une ligne de tableau en retard : Fizz l'envoie dans `<table hidden><tbody id="S:n">`, pas dans un `<div hidden>`.
function Ligne({ p }: { p: Promise<string> }) {
  return h("tr", null, h("td", null, use(p)));
}
const apres = (ms: number, v: string) => new Promise<string>((r) => setTimeout(() => r(v), ms));

describe("B1 : un vrai flux de React, reconstitué au caractère près", () => {
  it("passages imbriqués et frontière d'attente : chaque passage revient à sa place", async () => {
    const arbre = (a: Promise<string>, b: Promise<string>, c: Promise<string>) =>
      h("html", null, h("body", null,
        h(Suspense, { fallback: h("p", null, "Chargement…") },
          h("div", { "data-texte-contractuel": "conditions_clients", "data-version": "v1" },
            h("h1", null, "Titre"),
            h(Lent, { p: a }, h(Lent, { p: c })),
            h("p", null, "Entre deux."),
            h(Lent, { p: b }),
            h("table", null, h("tbody", null, h(Ligne, { p: a }), h(Ligne, { p: c }))))))); 
    const page = await lireFlux(await renderToReadableStream(arbre(apres(10, "A"), apres(25, "B"), apres(40, "C")), { progressiveChunkSize: 10 }));
    expect(page).toMatch(/\$RS\("S:\d+","P:\d+"\)/);
    expect(page).toContain('$RC("B:0","S:0")');
    expect(page).toMatch(/<table hidden><tbody id="S:\d+">/);
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    expect(extraction).toMatchObject({ ok: true, version: "v1" });
    if (!extraction.ok) return;
    expect(extraction.html).toBe(
      "<h1>Titre</h1><div><b>A</b><div><b>C</b></div></div><p>Entre deux.</p><div><b>B</b></div>" +
        "<table><tbody><tr><td>A</td></tr><tr><td>C</td></tr></tbody></table>"
    );
  });

  it("la page /conditions envoyée article par article donne le texte du rendu d'un seul tenant", async () => {
    lecture.valeurs = { denomination: "Éditeur fictif EI", email: "contact@example.com", siege: "1 rue de l'Exemple, Paris" };
    retards.actifs = false;
    const attendu = extraireTexteContractuel(renderToStaticMarkup(await Conditions()), "conditions_clients");
    expect(attendu.ok).toBe(true);
    retards.actifs = true;
    retards.promesses.clear();
    try {
      const page = await lireFlux(await renderToReadableStream(
        h("html", null, h("body", null, h(Suspense, { fallback: h("p", null, "Chargement…") }, await Conditions()))),
        { progressiveChunkSize: 64 }
      ));
      expect((page.match(/\$RS\(/g) ?? []).length).toBeGreaterThan(5);
      const extraction = extraireTexteContractuel(page, "conditions_clients");
      expect(extraction).toEqual(attendu);
    } finally {
      retards.actifs = false;
    }
  });
});

describe("B1 : une page dont un passage manque n'est jamais extraite", () => {
  const ouverture = '<div data-texte-contractuel="conditions_clients" data-version="v1">';
  const runtime = "<script>$RS=function(a,b){};</script>";

  it("marque vide sans segment, ou segment sans instruction : refus « incomplet »", () => {
    const sansSegment = `<body>${ouverture}<p>Début</p><template id="P:1"></template></div>${runtime}<script>$RS("S:1","P:1")</script></body>`;
    expect(extraireTexteContractuel(sansSegment, "conditions_clients")).toEqual({ ok: false, motif: "incomplet" });
    const sansInstruction = `<body>${ouverture}<p>Début</p><template id="P:1"></template></div><div hidden id="S:1"><p>Suite</p></div></body>`;
    expect(extraireTexteContractuel(sansInstruction, "conditions_clients")).toEqual({ ok: false, motif: "incomplet" });
    const complete = `<body>${ouverture}<p>Début</p><template id="P:1"></template></div><div hidden id="S:1"><p>Suite</p></div>${runtime}<script>$RS("S:1","P:1")</script></body>`;
    expect(extraireTexteContractuel(complete, "conditions_clients")).toMatchObject({ ok: true, html: "<p>Début</p><p>Suite</p>", version: "v1" });
  });

  it("frontière d'attente jamais complétée (rendu reporté au navigateur, $RX) : refus « incomplet »", () => {
    const page = `<body><!--$?--><template id="B:0"></template><p>Chargement…</p><!--/$--><div hidden id="S:0">${ouverture}<p>Texte</p></div></div><script>$RX("B:0","digest")</script></body>`;
    expect(extraireTexteContractuel(page, "conditions_clients")).toEqual({ ok: false, motif: "absent" });
    // Un passage du texte en erreur au serveur : React envoie le texte d'attente, le navigateur rendra le reste.
    const pageErreur = `<body>${ouverture}<p>Début</p><!--$!--><template data-dgst="x"></template><p>Chargement…</p><!--/$--></div></body>`;
    expect(extraireTexteContractuel(pageErreur, "conditions_clients")).toEqual({ ok: false, motif: "incomplet" });
  });

  it("un segment ne se remet en place qu'une fois, et une marque inconnue reste un trou", () => {
    const double = `<body>${ouverture}<template id="P:1"></template><template id="P:2"></template></div><div hidden id="S:1"><p>Un</p></div>${runtime}<script>$RS("S:1","P:1");$RS("S:1","P:2")</script></body>`;
    expect(extraireTexteContractuel(double, "conditions_clients")).toEqual({ ok: false, motif: "incomplet" });
  });
});
