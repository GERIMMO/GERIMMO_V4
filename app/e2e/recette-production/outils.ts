import { test as base, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { debordementHorizontal } from "../aides";
import { LIBELLES_INTERDITS, lireComptes, verifierCible, verifierEmail, type Persona } from "./cible";

// LES OUTILS DE LA RECETTE DE PRODUCTION.
//
// Trois soucis, dans l'ordre :
//  1. ne rien faire d'irréversible — aucun clic sur « Payer », « S'abonner »,
//     « Supprimer »… (vérifié avant chaque clic ET dans la page elle-même),
//     aucune adresse hors de resend.dev ;
//  2. juger un écran comme un humain le juge : il répond, il a un titre, il
//     n'affiche ni « introuvable » ni un message d'erreur, et la console du
//     navigateur reste muette ;
//  3. ne se connecter qu'une fois par persona : chaque connexion à la
//     production compte dans les limites de débit de Supabase.

export { debordementHorizontal };

type EtatSession = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Messages qu'un écran sain n'affiche jamais (frontières d'erreur, lectures en échec). */
export const MESSAGES_D_ERREUR: RegExp[] = [
  /Cette page n.a pas pu s.afficher/i,
  /Cette page est introuvable/i,
  /Application error/i,
  /Internal Server Error/i,
  /Impossible d.afficher/i,
  /Lecture impossible/i,
  /n.ont pas pu être lues|n.a pas pu être lue/i,
];

/** Messages de console tolérés : la protection voulue, pas une panne. */
function consoleToleree(texte: string): boolean {
  // Le document d'une quittance s'affiche dans un cadre isolé SANS scripts :
  // ce que l'outillage du navigateur tente d'y injecter est refusé, et Chrome
  // le dit (même exception que e2e/audit-ecrans.spec.ts).
  return texte.startsWith("Blocked script execution in 'about:srcdoc'");
}

/** Relève les erreurs de console et les exceptions non rattrapées d'une page. */
export function surveiller(page: Page) {
  const erreurs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !consoleToleree(m.text())) {
      erreurs.push(`console (${new URL(page.url()).pathname}) : ${m.text().slice(0, 300)}`);
    }
  });
  page.on("pageerror", (e) => {
    erreurs.push(`exception (${new URL(page.url()).pathname}) : ${e.message.slice(0, 300)}`);
  });
  return {
    erreurs,
    /** Vide la liste et rend ce qu'elle contenait. */
    relever(): string[] {
      return erreurs.splice(0, erreurs.length);
    },
  };
}

/**
 * LE BOUCLIER DANS LA PAGE. Un clic peut partir sans passer par `cliquer()` :
 * un clic tactile rejoué après l'hydratation, un Entrée dans un formulaire.
 * Ce script, posé avant tout autre, intercepte en phase de capture tout clic
 * ou toute soumission dont le bouton porte un libellé interdit — il n'atteint
 * jamais l'application.
 */
export async function poserBouclier(context: BrowserContext) {
  await context.addInitScript((source: string) => {
    const motif = new RegExp(source, "i");
    const libelle = (el: Element) =>
      `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""}`.trim();
    const bloquer = (ev: Event, el: Element | null | undefined) => {
      if (!el || !motif.test(libelle(el))) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const w = window as unknown as { __recetteRefus?: string[] };
      w.__recetteRefus = [...(w.__recetteRefus ?? []), libelle(el)];
    };
    document.addEventListener(
      "click",
      (ev) => bloquer(ev, (ev.target as Element | null)?.closest?.("button, a, [role=button], [role=menuitem], input[type=submit]")),
      true,
    );
    document.addEventListener("submit", (ev) => bloquer(ev, (ev as SubmitEvent).submitter), true);
  }, LIBELLES_INTERDITS.source);
  // La synthèse d'alertes s'ouvre à la première page d'une session et
  // recouvrirait les gestes : on la marque « déjà vue » — son propre
  // mécanisme (même geste que sansSyntheseAlertes, e2e/aides.ts, à l'échelle
  // du contexte).
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1");
    } catch {}
  });
}

/**
 * Étiquette des tests qui TAPENT le mot de passe (connexion, déconnexion) :
 * la configuration les range dans un projet sans trace Playwright — une
 * trace enregistrerait la saisie et la requête de connexion en clair, et
 * elle part en artefact. La capture d'écran d'échec, elle, reste.
 */
export const SANS_TRACE = { tag: "@sans-trace" };

/** Cliquer, après avoir vérifié que le libellé n'est pas interdit. */
export async function cliquer(cible: Locator) {
  const texte = await cible.evaluate(
    (el) => `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""}`,
  );
  if (LIBELLES_INTERDITS.test(texte)) {
    throw new Error(`Clic refusé par la recette : « ${texte.trim()} »`);
  }
  await cible.click();
}

/** Saisir, après avoir vérifié qu'une adresse e-mail reste dans resend.dev. */
export async function saisir(champ: Locator, valeur: string) {
  const type = await champ.getAttribute("type");
  if (type === "email" || valeur.includes("@")) verifierEmail(valeur);
  await champ.fill(valeur);
}

const DESTINATIONS = /\/(espaces|agence|locataire|artisan|admin)(\/|\?|$)/;

/** La connexion par le vrai formulaire /connexion. */
export async function seConnecter(page: Page, persona: Persona) {
  const comptes = lireComptes();
  await page.goto("/connexion");
  await expect(page.locator("#email")).toBeVisible();
  await saisir(page.locator("#email"), comptes.emails[persona]);
  await page.locator("#mot-de-passe").fill(comptes.motDePasse);
  await cliquer(page.getByRole("button", { name: "Se connecter", exact: true }));
  await page.waitForURL(DESTINATIONS, { timeout: 45_000 });
  await expect(page.locator("body")).not.toContainText("Identifiants invalides");
}

/** L'adresse de l'espace attendu pour chaque persona. */
export function espaceDe(persona: Persona): string {
  const c = lireComptes();
  if (persona === "admin") return `/agence/${c.orgAgence}`;
  if (persona === "proprietaire") return `/agence/${c.orgProprietaire}`;
  return `/locataire/${c.orgAgence}`;
}

/** Le menu de l'espace : la barre latérale (présente dans le DOM à toutes les largeurs). */
export function selecteurMenu(persona: Persona): string {
  return persona === "locataire" ? "nav.loc-menu" : "nav.coquille-menu";
}

// Les sessions ouvertes, une par persona et par processus de test. Une
// déconnexion (révocation globale côté Supabase) oblige à l'oublier.
const sessions = new Map<Persona, EtatSession>();

async function ouvrirSession(browser: Browser, persona: Persona): Promise<EtatSession> {
  const deja = sessions.get(persona);
  if (deja) return deja;
  const context = await browser.newContext({
    baseURL: verifierCible(process.env.RECETTE_URL),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  await poserBouclier(context);
  const page = await context.newPage();
  await seConnecter(page, persona);
  const etat = await context.storageState();
  await context.close();
  sessions.set(persona, etat);
  return etat;
}

/** Retenir la session qu'un test vient d'ouvrir par le formulaire. */
export async function retenirSession(persona: Persona, context: BrowserContext) {
  sessions.set(persona, await context.storageState());
}

/** Après une déconnexion : la session retenue est révoquée. */
export function oublierSession(persona: Persona) {
  sessions.delete(persona);
}

/**
 * Le `test` de la recette : `persona` choisit la session du test (aucune pour
 * les pages publiques ou quand le test se connecte lui-même) ; le bouclier est
 * posé sur chaque contexte. (`fournir` est le `use` des fixtures Playwright,
 * renommé : ESLint le prendrait pour le hook React.)
 */
export const test = base.extend<{ persona: Persona | null; surveillance: ReturnType<typeof surveiller> }>({
  persona: [null, { option: true }],
  storageState: async ({ persona, browser }, fournir) => {
    await fournir(persona ? await ouvrirSession(browser, persona) : undefined);
  },
  context: async ({ context }, fournir) => {
    await poserBouclier(context);
    await fournir(context);
  },
  surveillance: async ({ page }, fournir) => {
    await fournir(surveiller(page));
  },
});

export { expect };

/**
 * Juger un écran : il répond (< 400), a un titre h1 visible, n'affiche aucun
 * message d'erreur, ne lève rien dans la console. Rend la liste des défauts
 * (vide si l'écran est sain) plutôt que d'échouer au premier : un tour de menu
 * doit dire TOUT ce qui ne va pas.
 */
export async function jugerEcran(
  page: Page,
  chemin: string,
  surveillance: ReturnType<typeof surveiller>,
): Promise<string[]> {
  const defauts: string[] = [];
  surveillance.relever();
  let statut = 0;
  try {
    const reponse = await page.goto(chemin, { waitUntil: "load", timeout: 60_000 });
    statut = reponse?.status() ?? 0;
  } catch (e) {
    return [`${chemin} : ne répond pas (${String(e).slice(0, 200)})`];
  }
  if (statut >= 400) defauts.push(`${chemin} : statut HTTP ${statut}`);
  try {
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    defauts.push(`${chemin} : aucun titre h1 visible`);
  }
  // Laisser aux composants client le temps de s'hydrater et de parler.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const texte = await page.locator("body").innerText().catch(() => "");
  for (const motif of MESSAGES_D_ERREUR) {
    const trouve = texte.match(motif);
    if (trouve) defauts.push(`${chemin} : affiche « ${trouve[0]} »`);
  }
  const refus = await page.evaluate(() => (window as unknown as { __recetteRefus?: string[] }).__recetteRefus ?? []);
  for (const r of refus) defauts.push(`${chemin} : clic interdit intercepté (« ${r} »)`);
  defauts.push(...surveillance.relever());
  return defauts;
}

/** Les liens du menu de l'espace, lus dans la page (pas une liste en dur). */
export async function liensDuMenu(page: Page, selecteur: string): Promise<string[]> {
  const menu = page.locator(selecteur).first();
  await expect(menu).toBeAttached();
  const hrefs = await menu
    .locator("a[href]")
    .evaluateAll((liens) => liens.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs.filter((h) => h.startsWith("/")))];
}

/** Se déconnecter par le menu du compte, et vérifier que la session est bien close. */
export async function seDeconnecterParLeMenu(page: Page) {
  const avatar = page.getByRole("button", { name: /Mon compte/ });
  const sortir = page.getByRole("menuitem", { name: "Se déconnecter" });
  // Un clic parti avant l'hydratation ne fait rien : on rouvre jusqu'à voir
  // le volet (même précaution que les menus mobiles de la suite du banc).
  await expect(async () => {
    if (!(await sortir.isVisible())) await cliquer(avatar);
    await expect(sortir).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await cliquer(sortir);
  await page.waitForURL(/\/connexion(\?|$)/, { timeout: 30_000 });
  // La conséquence, pas seulement l'atterrissage : l'espace renvoie à la connexion.
  await page.goto("/espaces");
  await expect(page).toHaveURL(/\/connexion/);
}

/** Créer un bien et son lot unique par le formulaire du parc. Rend son nom. */
export async function creerBien(page: Page, orgId: string, nom: string) {
  await page.goto(`/agence/${orgId}/parc/nouveau`);
  await expect(page.getByLabel("Référence interne")).toBeVisible();
  await saisir(page.getByLabel("Référence interne"), nom);
  await saisir(page.getByLabel("Adresse", { exact: true }), "12 rue de la Recette");
  await saisir(page.getByLabel("Code postal"), "69001");
  await saisir(page.getByLabel("Ville"), "Lyon");
  await saisir(page.getByLabel(/Année de construction/), "2005");
  await saisir(page.getByLabel(/Parties communes/), "Hall et cour intérieure");
  await saisir(page.getByLabel(/\(TIC\)/), "Fibre optique et TNT");
  await saisir(page.getByLabel(/Surface.*m²/), "38");
  await saisir(page.getByLabel("Nombre de pièces"), "2");
  // L'autocomplétion d'adresse peut ouvrir sa liste par-dessus le bouton.
  await page.keyboard.press("Escape");
  await cliquer(page.getByRole("button", { name: /Créer le bien/ }));
  await expect(page.locator("body")).toContainText(nom, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(/Création impossible|violates/i);
  return nom;
}

/** Un nom unique pour ce que la recette crée : suffixe du passage + horodatage court. */
export function nomUnique(prefixe: string): string {
  return `${prefixe} ${lireComptes().suffixe} ${Date.now().toString(36).slice(-5)}`;
}
