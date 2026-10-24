/**
 * PRO-4 (relevé du 23/10/2026) dans un VRAI navigateur : après un refus, les deux listes déroulantes du bloc « Vérifiez vos
 * informations » (« Vous utilisez Gerimmo pour », « Qualité du bailleur ») gardent le choix envoyé, avec et sans script.
 *
 * `premier-mot-de-passe-inscription.test.ts` ne voit que le HTML du serveur, rendu d'emblée avec l'état du refus : c'est
 * le cas d'un envoi SANS script (le formulaire s'envoie nativement, la page revient rendue par le serveur). Avec le script,
 * le refus est une MISE À JOUR suivie de la remise à zéro du formulaire par React (`form.reset()` après chaque action) :
 * un champ de saisie y reçoit sa nouvelle valeur par défaut avant la remise à zéro, une liste déroulante non (React ne
 * réapplique pas `defaultValue` à un <select> déjà monté). La liste reprenait donc l'option du premier affichage, et un
 * second envoi enregistrait en silence l'usage et la qualité d'origine (relecture adverse du 23/10, PRO-4 incomplet).
 *
 * Ce fichier hydrate le HTML du serveur du vrai formulaire dans Chromium (`fixtures/navigateur/banc-nouveau-mot-de-passe.tsx`,
 * assemblé par rolldown, sous <StrictMode>), câblé à la vraie action ; seul Supabase est simulé, et refuse chaque mot de
 * passe. Puis il rejoue les gestes : changer les listes, corriger le nom, cocher la case, envoyer, lire l'écran, renvoyer.
 *
 * Ne s'exécute que si un Chromium est disponible : GERIMMO_CHROME ou PLAYWRIGHT_CHROMIUM (le binaire), sinon celui de
 * Playwright (`npx playwright install chromium`), sinon `$PLAYWRIGHT_BROWSERS_PATH/chromium`. Ni base de données ni serveur.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatNouveauMotDePasse } from "@/app/actions/auth";
import type { BancMotDePasse, EnvoiRecu, RefusAuth } from "./fixtures/navigateur/banc-nouveau-mot-de-passe";

const mocks = vi.hoisted(() => ({ etat: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));
// Le HTML du serveur : `useActionState` y rend l'état que le serveur a sous la main (aucun, ou celui d'un envoi sans script).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [mocks.etat, () => {}, false] };
});

import { definirNouveauMotDePasse } from "@/app/actions/auth";
import { FormulaireNouveauMotDePasse } from "@/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe";

const RACINE = resolve(__dirname, "..");

function trouverChromium(): string | undefined {
  const candidats = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM];
  try {
    candidats.push(chromium.executablePath());
  } catch {
    // pas de Chromium de Playwright : on essaie la suite
  }
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) candidats.push(resolve(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium"));
  return candidats.find((c): c is string => Boolean(c && existsSync(c)));
}
const CHROMIUM = trouverChromium();

/** Les modules propres au serveur, remplacés dans le navigateur ; tout le reste (formulaire, action, règles) est le vrai code. */
const REMPLACEMENTS: Record<string, string> = {
  "@/lib/supabase/server": resolve(RACINE, "tests/fixtures/navigateur/supabase-serveur-neutre.ts"),
  "next/navigation": resolve(RACINE, "tests/fixtures/navigateur/next-serveur-neutre.ts"),
  "next/headers": resolve(RACINE, "tests/fixtures/navigateur/next-serveur-neutre.ts"),
  "next/link": resolve(RACINE, "tests/fixtures/navigateur/next-link-neutre.tsx"),
};

/** Assemble le banc (formulaire et action réels, Supabase simulé) en un script de navigateur. */
async function assembler(): Promise<string> {
  const paquet = await rolldown({
    input: resolve(RACINE, "tests/fixtures/navigateur/banc-nouveau-mot-de-passe.tsx"),
    platform: "browser",
    plugins: [{
      name: "serveur-hors-banc",
      resolveId: (id) => REMPLACEMENTS[id] ?? (id === "@/lib/lien-mot-de-passe" ? "\0lien-isole" : null),
      // L'envoi des liens (clé de service, courriel) n'a rien à faire dans un navigateur ; le banc ne l'appelle jamais.
      load: (id) => (id === "\0lien-isole" ? "export async function envoyerLienMotDePasse() {} export async function inscrireEtEnvoyerConfirmation() {}" : null),
    }],
    resolve: { alias: { "@": resolve(RACINE, "src") } },
    // Développement : <StrictMode> rejoue les effets deux fois, comme `next dev`.
    transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } },
    logLevel: "silent",
  });
  try {
    const { output } = await paquet.generate({ format: "iife" });
    return output[0].code;
  } finally {
    await paquet.close();
  }
}

/** Le profil saisi à l'inscription : propriétaire, sans qualité renseignée. */
const PROFIL = { nom: "Initial", prenom: "Avant", espace: "proprietaire_direct", qualite: "" };
const SAISIES_DIFFERENTES = "Les deux saisies ne correspondent pas.";
const EXPOSE: RefusAuth = { code: "weak_password", message: "Password is known to be weak" };

/** Le HTML que le serveur rend pour la page, avec l'état d'action qu'il a sous la main. */
function htmlDuServeur(etat: EtatNouveauMotDePasse, profil: Record<string, string> = PROFIL): string {
  mocks.etat = etat;
  const formulaire = renderToString(
    createElement(StrictMode, null, createElement(FormulaireNouveauMotDePasse, { suite: "/espaces", profilAConfirmer: profil })),
  );
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><div id="racine">${formulaire}</div><script src="/banc.js"></script></body></html>`;
}

describe.skipIf(!CHROMIUM)("Premier mot de passe : les listes gardent le choix après un refus — dans un vrai navigateur", () => {
  let navigateur: Browser;
  let script: string;
  let contexte: BrowserContext;
  let page: Page;
  let erreursPage: string[];

  beforeAll(async () => {
    script = await assembler();
    navigateur = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 120_000);
  afterAll(async () => {
    await navigateur?.close();
  });

  /** Ouvre la page telle que le serveur l'envoie ; avec le script, attend la fin de l'hydratation. */
  async function ouvrir(html: string, { script: avecScript = true, profil = PROFIL }: { script?: boolean; profil?: Record<string, string> } = {}) {
    contexte = await navigateur.newContext({ locale: "fr-FR", javaScriptEnabled: avecScript });
    page = await contexte.newPage();
    erreursPage = [];
    page.on("pageerror", (e) => erreursPage.push(e.message));
    await page.route("http://localhost/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/banc.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    });
    if (avecScript) {
      const banc: BancMotDePasse = { profil, envois: [], enregistrements: [], refusAuth: [], erreurs: [], pret: false };
      await page.addInitScript((b) => { window.__bancMotDePasse = b; }, banc);
    }
    await page.goto("http://localhost/nouveau-mot-de-passe?motif=inscription");
    if (avecScript) await page.waitForFunction(() => window.__bancMotDePasse.pret);
  }

  beforeEach(() => {
    erreursPage = [];
  });
  afterEach(async () => {
    if (page && !page.isClosed()) {
      const rattrapees = await page.evaluate(() => window.__bancMotDePasse?.erreurs ?? []).catch(() => []);
      expect(rattrapees).toEqual([]);
    }
    await contexte?.close();
    expect(erreursPage).toEqual([]);
  });

  // ───────── gestes ─────────

  const liste = (nom: "espace" | "qualite") => page.locator(`select[name="${nom}"]`);
  const champ = (nom: string) => page.locator(`input[name="${nom}"]`);
  const envois = (): Promise<EnvoiRecu[]> => page.evaluate(() => window.__bancMotDePasse.envois);
  const enregistrements = (): Promise<Record<string, unknown>[]> => page.evaluate(() => window.__bancMotDePasse.enregistrements);
  const refuserAuth = (...r: RefusAuth[]) => page.evaluate((r) => { window.__bancMotDePasse.refusAuth.push(...r); }, r);
  /** Laisse React finir de poser l'état, de remettre le formulaire à zéro et d'exécuter les effets. */
  const laisserAfficher = () => page.evaluate(() => new Promise<void>((fini) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fini, 30)))));

  /** Tape les deux mots de passe et envoie ; attend la réponse de l'action et le retour au repos. */
  async function envoyer(motDePasse: string, confirmation = motDePasse) {
    const deja = (await envois()).length;
    await champ("mot_de_passe").fill(motDePasse);
    await champ("confirmation").fill(confirmation);
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await page.waitForFunction((n) => window.__bancMotDePasse.envois.length === n, deja + 1);
    await page.waitForFunction(() => {
      const bouton = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      return Boolean(bouton && !bouton.disabled && document.querySelector('[role="alert"]'));
    });
    await laisserAfficher();
  }

  const ecran = async () => ({
    espace: await liste("espace").inputValue(),
    qualite: await liste("qualite").inputValue(),
    nom: await champ("nom").inputValue(),
    cgu: await champ("cgu").isChecked(),
    motDePasse: await champ("mot_de_passe").inputValue(),
    confirmation: await champ("confirmation").inputValue(),
    alerte: (await page.getByRole("alert").textContent())?.trim(),
  });

  // ───────── avec le script ─────────

  it("saisies différentes : l'usage et la qualité choisis restent affichés, et le second envoi les porte", async () => {
    await ouvrir(htmlDuServeur({}));
    expect(await liste("espace").inputValue()).toBe("proprietaire_direct");
    expect(await liste("qualite").inputValue()).toBe("");

    await liste("espace").selectOption("artisan");
    await liste("qualite").selectOption("SCI");
    await champ("nom").fill("Corrigé");
    await champ("cgu").check();
    await envoyer("premier-choix-123", "autre-saisie-456");
    expect((await envois())[0]).toMatchObject({ espace: "artisan", qualite: "SCI", nom: "Corrigé", cgu: "on" });

    expect(await ecran()).toEqual({
      espace: "artisan",
      qualite: "SCI",
      nom: "Corrigé",
      cgu: true,
      motDePasse: "",
      confirmation: "",
      alerte: SAISIES_DIFFERENTES,
    });

    // La personne retape ses deux mots de passe, sans retoucher aux listes : c'est ce choix-là qui part et serait enregistré.
    await envoyer("premier-choix-123");
    expect((await envois())[1]).toMatchObject({ espace: "artisan", qualite: "SCI", nom: "Corrigé", cgu: "on" });
    expect(await enregistrements()).toEqual([expect.objectContaining({ espace: "artisan", qualite: "SCI", nom: "Corrigé" })]);
  });

  it("refus de Supabase Auth (mot de passe exposé) : les listes gardent aussi le choix", async () => {
    await ouvrir(htmlDuServeur({}));
    await refuserAuth(EXPOSE);
    await liste("espace").selectOption("invite");
    await liste("qualite").selectOption("Indivision (personnes physiques)");
    await champ("cgu").check();
    await envoyer("mot-de-passe-expose-1");
    const apres = await ecran();
    expect(apres.alerte).toBe("Mot de passe refusé : trop faible ou présent dans des fuites de données connues. Choisissez-en un autre.");
    expect({ espace: apres.espace, qualite: apres.qualite, cgu: apres.cgu }).toEqual({ espace: "invite", qualite: "Indivision (personnes physiques)", cgu: true });
  });

  it("refus successifs avec d'autres choix, jusqu'au retour au choix d'origine : la liste suit toujours le dernier envoi", async () => {
    await ouvrir(htmlDuServeur({}));
    await champ("cgu").check();

    await liste("espace").selectOption("artisan");
    await liste("qualite").selectOption("SCI");
    await envoyer("tour-numero-un-1", "tour-numero-un-2");
    expect([await liste("espace").inputValue(), await liste("qualite").inputValue()]).toEqual(["artisan", "SCI"]);

    // L'espace invité change le texte de la case : elle revient décochée, et se coche de nouveau sous ce texte-là.
    await liste("espace").selectOption("invite");
    await liste("qualite").selectOption("Personne morale");
    await champ("cgu").check();
    await envoyer("tour-numero-deux-1", "tour-numero-deux-2");
    expect([await liste("espace").inputValue(), await liste("qualite").inputValue()]).toEqual(["invite", "Personne morale"]);

    // Retour à l'usage d'origine et à « Non renseignée » : la liste ne doit pas rester sur le choix du refus précédent.
    await liste("espace").selectOption("proprietaire_direct");
    await liste("qualite").selectOption("");
    await champ("cgu").check();
    await envoyer("tour-numero-trois-1", "tour-numero-trois-2");
    expect([await liste("espace").inputValue(), await liste("qualite").inputValue()]).toEqual(["proprietaire_direct", ""]);

    // Un refus qui ne change rien aux listes les laisse telles quelles.
    await envoyer("tour-numero-quatre-1", "tour-numero-quatre-2");
    expect([await liste("espace").inputValue(), await liste("qualite").inputValue()]).toEqual(["proprietaire_direct", ""]);

    expect((await envois()).map(({ espace, qualite }) => [espace, qualite])).toEqual([
      ["artisan", "SCI"],
      ["invite", "Personne morale"],
      ["proprietaire_direct", ""],
      ["proprietaire_direct", ""],
    ]);
  });

  // ───────── la case des conditions suit son texte (relecture adverse du 24/10, défaut 1) ─────────
  //
  // La case des conditions change de libellé avec l'usage choisi (R10, R60). Montée une seule fois, elle gardait sa coche
  // quand son texte changeait : cochée pour « J'ai pris connaissance des règles d'utilisation des espaces invités… », elle
  // restait cochée sous « J'accepte les conditions générales d'utilisation et de vente », le champ caché passait à
  // `conditions_clients`, et le serveur enregistrait une acceptation des conditions de vente prouvée par une coche donnée
  // pour une autre phrase. Une coche ne survit qu'à un changement d'usage qui ne change pas le texte de la case.

  const caseCgu = () => page.locator('label:has(input[name="cgu"])');
  const documentAffiche = () => page.locator('input[name="cgu_document"]').inputValue();
  const formulaireValide = () => page.locator("form").evaluate((f: HTMLFormElement) => f.checkValidity());
  const REGLES_INVITES = "J’ai pris connaissance des règles d’utilisation des espaces invités (article 7 des conditions générales).";
  const CONDITIONS_CLIENTS = "J’accepte les conditions générales d’utilisation et de vente.";

  it("personne invitée qui coche, puis choisit « Gérer mes propres biens » : la case revient décochée sous son nouveau texte", async () => {
    const invite = { ...PROFIL, espace: "invite" };
    await ouvrir(htmlDuServeur({}, invite), { profil: invite });
    expect(await caseCgu().textContent()).toBe(REGLES_INVITES);
    await champ("cgu").check();

    await liste("espace").selectOption("proprietaire_direct");
    expect(await caseCgu().textContent()).toBe(CONDITIONS_CLIENTS);
    expect(await documentAffiche()).toBe("conditions_clients");
    expect(await champ("cgu").isChecked()).toBe(false);
    // La case est requise : le navigateur n'enverra rien tant qu'elle n'est pas cochée sous ce texte-là.
    expect(await formulaireValide()).toBe(false);

    await champ("cgu").check();
    await envoyer("premier-choix-123", "autre-saisie-456");
    expect((await envois())[0]).toMatchObject({ espace: "proprietaire_direct", cgu: "on", cgu_document: "conditions_clients" });
  });

  it("propriétaire qui coche, puis choisit l'espace invité, puis revient : la coche ne suit jamais un autre texte", async () => {
    await ouvrir(htmlDuServeur({}));
    expect(await caseCgu().textContent()).toBe(CONDITIONS_CLIENTS);
    await champ("cgu").check();

    // Même texte (conditions de l'espace artisan non publiées : l'artisan accepte les conditions clients) : la coche reste.
    await liste("espace").selectOption("artisan");
    expect(await caseCgu().textContent()).toBe(CONDITIONS_CLIENTS);
    expect(await champ("cgu").isChecked()).toBe(true);

    await liste("espace").selectOption("invite");
    expect(await caseCgu().textContent()).toBe(REGLES_INVITES);
    expect(await champ("cgu").isChecked()).toBe(false);

    await champ("cgu").check();
    await liste("espace").selectOption("proprietaire_direct");
    expect(await champ("cgu").isChecked()).toBe(false);
    expect(await formulaireValide()).toBe(false);
  });

  it("après un refus, la case recochée par la réponse se décoche aussi quand l'usage change de texte", async () => {
    await ouvrir(htmlDuServeur({}));
    await champ("cgu").check();
    await envoyer("premier-choix-123", "autre-saisie-456");
    expect(await champ("cgu").isChecked()).toBe(true);

    await liste("espace").selectOption("invite");
    expect(await caseCgu().textContent()).toBe(REGLES_INVITES);
    expect(await champ("cgu").isChecked()).toBe(false);

    // Cochée sous le texte des règles des espaces invités, puis refusée : elle revient cochée sous ce même texte.
    await champ("cgu").check();
    await envoyer("deuxieme-choix-1", "deuxieme-choix-2");
    expect((await envois())[1]).toMatchObject({ espace: "invite", cgu: "on", cgu_document: "regles_invites" });
    expect(await caseCgu().textContent()).toBe(REGLES_INVITES);
    expect(await champ("cgu").isChecked()).toBe(true);

    // Retour à « Gérer mes propres biens » : la coche de la réponse portait sur les règles des espaces invités.
    await liste("espace").selectOption("proprietaire_direct");
    expect(await caseCgu().textContent()).toBe(CONDITIONS_CLIENTS);
    expect(await champ("cgu").isChecked()).toBe(false);
  });

  // ───────── sans le script ─────────

  it("sans script : usage changé dans la liste puis refus du mot de passe, la case revient décochée sous son nouveau texte", async () => {
    // L'envoi natif d'une personne invitée qui a coché les règles des espaces invités, puis choisi « Gérer mes propres
    // biens » (sans script, la case n'a pas suivi), avec deux saisies différentes : le refus vient avant tout contrôle du
    // document, et la page revient avec la case des conditions clients.
    const envoiNatif = new FormData();
    const saisie = { mot_de_passe: "premier-choix-123", confirmation: "autre-saisie-456", suite: "/espaces", espace: "proprietaire_direct", nom: "Corrigé", cgu: "on", cgu_document: "regles_invites" };
    for (const [cle, valeur] of Object.entries(saisie)) envoiNatif.set(cle, valeur);
    const refus = await definirNouveauMotDePasse({}, envoiNatif);
    expect(refus).toMatchObject({ erreur: SAISIES_DIFFERENTES, valeurs: { espace: "proprietaire_direct" } });

    await ouvrir(htmlDuServeur(refus), { script: false });
    expect(await caseCgu().textContent()).toBe(CONDITIONS_CLIENTS);
    expect(await champ("cgu").isChecked()).toBe(false);
    expect(await formulaireValide()).toBe(false);
  });

  it("sans script : la page rendue par le serveur après l'envoi natif affiche le choix refusé, et le renverrait tel quel", async () => {
    // Le vrai refus de l'action (saisies différentes : aucun appel à Supabase), tel que le serveur le rend à la page.
    const envoiNatif = new FormData();
    const saisie = { mot_de_passe: "premier-choix-123", confirmation: "autre-saisie-456", suite: "/espaces", espace: "artisan", qualite: "SCI", nom: "Corrigé", prenom: "Avant", cgu: "on" };
    for (const [cle, valeur] of Object.entries(saisie)) envoiNatif.set(cle, valeur);
    const refus = await definirNouveauMotDePasse({}, envoiNatif);
    expect(refus).toMatchObject({ erreur: SAISIES_DIFFERENTES, champ: "confirmation", valeurs: { espace: "artisan", qualite: "SCI" } });

    await ouvrir(htmlDuServeur(refus), { script: false });
    expect(await liste("espace").inputValue()).toBe("artisan");
    expect(await liste("qualite").inputValue()).toBe("SCI");
    expect(await champ("nom").inputValue()).toBe("Corrigé");
    expect(await champ("cgu").isChecked()).toBe(true);
    expect(await champ("mot_de_passe").inputValue()).toBe("");
    // Ce que le navigateur enverrait au prochain envoi natif (liste des entrées du formulaire, sans les mots de passe).
    const prochainEnvoi = await page.locator("form").evaluate((f: HTMLFormElement) =>
      Object.fromEntries([...new FormData(f).entries()].filter(([cle]) => cle === "espace" || cle === "qualite")));
    expect(prochainEnvoi).toEqual({ espace: "artisan", qualite: "SCI" });
  });
});
