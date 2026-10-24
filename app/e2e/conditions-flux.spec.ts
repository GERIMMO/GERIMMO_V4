import { test, expect } from "@playwright/test";
import { extraireTexteContractuel } from "../src/lib/conditions-versions";

// Relecture adverse du socle (24/10/2026, B1) : l'archive des conditions range le texte de la page /conditions telle
// que le serveur l'envoie, EN FLUX (marques `<template id="P:n">`, segments `<div hidden id="S:n">`, scripts
// `$RS`/`$RC`). Sur le build servi par `next start`, l'extraction (lib/conditions-versions.ts, qui reconstitue le flux)
// doit donner exactement le texte qu'un navigateur affiche. Le navigateur joue ici les seuls scripts du flux : les
// fichiers JavaScript de l'application sont bloqués, rien n'hydrate ni ne réécrit la page après coup.

test.use({ storageState: { cookies: [], origins: [] } });

test("conditions : le texte extrait de la page servie est celui que le navigateur affiche, sans trou", async ({ page, request }) => {
  const reponse = await request.get("/conditions");
  expect(reponse.status()).toBe(200);
  const extraction = extraireTexteContractuel(await reponse.text(), "conditions_clients");
  expect(extraction.ok, JSON.stringify(extraction)).toBe(true);
  if (!extraction.ok) return;
  expect(extraction.html).not.toMatch(/<template\b|\bid="[PSB]:/);
  for (const passage of ["8.7 — Reconduction", "8.8 — Hors abonnement", "Droits des personnes.", "17. Droit applicable et litiges"]) {
    expect(extraction.html, passage).toContain(passage);
  }

  await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort());
  await page.goto("/conditions");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-texte-contractuel]").length === 1 && !document.querySelector('template[id^="P:"], template[id^="B:"]'),
    undefined,
    { timeout: 15_000 }
  );
  // Les deux textes passent par l'analyseur du navigateur, commentaires retirés et blancs réduits comme à l'archivage.
  const [affiche, extrait] = await page.evaluate((html) => {
    const serialiser = (racine: Element) => {
      const copie = racine.cloneNode(true) as Element;
      const marcheur = document.createTreeWalker(copie, NodeFilter.SHOW_COMMENT);
      const commentaires: Node[] = [];
      while (marcheur.nextNode()) commentaires.push(marcheur.currentNode);
      for (const c of commentaires) c.parentNode?.removeChild(c);
      return copie.innerHTML.replace(/[ \t\n\r\f]+/g, " ").trim();
    };
    const lu = document.createElement("div");
    lu.innerHTML = html;
    return [serialiser(document.querySelector("[data-texte-contractuel]")!), serialiser(lu)];
  }, extraction.html);
  expect(extrait).toBe(affiche);
});
