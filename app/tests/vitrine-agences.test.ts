/**
 * Liste d'attente des agences (20/10/2026), lot SITE : la page publique /agences et ses accès.
 *
 * Deux lectures, sans serveur :
 *  - le formulaire est RENDU côté serveur (le HTML que reçoit le visiteur) : champs dans l'ordre, obligatoires et
 *    facultatifs, pot de miel, bouton, phrase d'information et lien vers la confidentialité, erreur et succès ;
 *  - les autres fichiers sont LUS tels quels : la page /agences existe (en-tête, métadonnées, pied), l'accueil, la FAQ,
 *    /tarifs et le pied de page y mènent, le proxy et le plan du site la connaissent, l'inventaire des écrans l'audite,
 *    /confidentialite en parle ; et NI la page NI le formulaire ne promettent un prix ou une date d'ouverture.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_SUCCES_LISTE_ATTENTE, TRANCHES_LOTS } from "../src/lib/liste-attente-agences";

const etatSimule = vi.hoisted(() => ({ valeur: {} as { erreur?: string; succes?: string; valeurs?: Record<string, string> } }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [etatSimule.valeur, () => {}, false] };
});
// L'action serveur importe le client de service (« server-only ») : simulée, elle n'est pas le sujet ici.
vi.mock("@/app/actions/liste-attente-agences", () => ({ inscrireAgence: vi.fn() }));

import { FormulaireListeAttenteAgences } from "../src/app/agences/formulaire-liste-attente-agences";

const RACINE = path.resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(path.join(RACINE, chemin), "utf8");
const PAGE = "src/app/agences/page.tsx";
const FORMULAIRE = "src/app/agences/formulaire-liste-attente-agences.tsx";
const ACTION = "src/app/actions/liste-attente-agences.ts";
/** Le code sans ses commentaires : seul ce que le visiteur peut voir est jugé (les commentaires datent les décisions). */
const sansCommentaires = (s: string) => s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
/** Une apostrophe, droite, typographique ou échappée pour JSX. */
const apostrophe = (texte: string) => new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "(?:'|’|&apos;)"));
const rendre = () => renderToStaticMarkup(createElement(FormulaireListeAttenteAgences));

beforeEach(() => {
  etatSimule.valeur = {};
});

describe("le formulaire, tel que le serveur le rend", () => {
  it("porte les sept champs dans l'ordre du contrat, et le pot de miel invisible", () => {
    const html = rendre();
    const positions = ["agence", "contact", "email", "telephone", "code_postal", "nb_lots", "message"].map((n) => html.indexOf(`name="${n}"`));
    expect(positions.every((p) => p >= 0), html).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toMatch(/<input[^>]*name="site"[^>]*>/);
    // HTML ne distingue pas la casse des attributs (React rend « maxLength », « autoComplete ») : comparés en minuscules.
    const potDeMiel = /<input[^>]*name="site"[^>]*>/.exec(html)![0].toLowerCase();
    expect(potDeMiel).toContain('tabindex="-1"');
    expect(potDeMiel).toContain("aria-hidden");
    expect(potDeMiel).toContain('autocomplete="off"');
    expect(potDeMiel).toMatch(/class="[^"]*\bhidden\b/);
    expect(html).toMatch(/<form[^>]*data-saisie-libre/);
  });

  it("les libellés : « (facultatif) » sur le téléphone et le message, rien sur les cinq obligatoires", () => {
    const html = rendre();
    for (const libelle of ["Nom de l'agence", "Votre nom", "Votre e-mail professionnel", "Téléphone (facultatif)", "Code postal de l'agence", "Nombre de lots gérés", "Votre message (facultatif)"]) {
      expect(html).toMatch(apostrophe(libelle));
    }
    expect(html.match(/\(facultatif\)/g)).toHaveLength(2);
    const champ = (nom: string) => new RegExp(`<(?:input|select|textarea)[^>]*name="${nom}"[^>]*>`).exec(html)![0];
    for (const nom of ["agence", "contact", "email", "code_postal", "nb_lots"]) expect(champ(nom), nom).toMatch(/\brequired=""/);
    for (const nom of ["telephone", "message"]) expect(champ(nom), nom).not.toMatch(/\brequired=""/);
  });

  it("les attributs utiles : longueurs de la base, saisie numérique du code postal, autocomplétion, trois lignes de message", () => {
    const html = rendre();
    const champ = (nom: string) => new RegExp(`<(?:input|select|textarea)[^>]*name="${nom}"[^>]*>`).exec(html)![0].toLowerCase();
    expect(champ("agence")).toContain('maxlength="120"');
    expect(champ("agence")).toContain('autocomplete="organization"');
    expect(champ("contact")).toContain('maxlength="120"');
    expect(champ("contact")).toContain('autocomplete="name"');
    expect(champ("email")).toContain('type="email"');
    expect(champ("email")).toContain('maxlength="254"');
    expect(champ("email")).toContain('autocomplete="email"');
    expect(champ("telephone")).toContain('type="tel"');
    expect(champ("telephone")).toContain('maxlength="40"');
    expect(champ("telephone")).toContain('autocomplete="tel"');
    expect(champ("code_postal")).toContain('inputmode="numeric"');
    expect(champ("code_postal")).toContain('autocomplete="postal-code"');
    expect(champ("message")).toContain('maxlength="1000"');
    expect(champ("message")).toContain('rows="3"');
    // Chaque champ a son libellé (htmlFor → id).
    for (const id of [...html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1])) {
      expect(html, id).toContain(`for="${id}"`);
    }
  });

  it("la tranche de lots : « Choisir » vide en tête, puis les quatre tranches du module commun", () => {
    const html = rendre();
    const select = /<select[^>]*name="nb_lots"[^>]*>([\s\S]*?)<\/select>/.exec(html)![1];
    const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
    expect(options).toEqual([["", "Choisir"], ...TRANCHES_LOTS.map((t) => [t.code, t.libelle])]);
  });

  it("le bouton « Rejoindre la liste d'attente », puis la phrase d'information et le lien vers la confidentialité", () => {
    const html = rendre();
    const bouton = /<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(bouton?.[1]).toMatch(apostrophe("Rejoindre la liste d'attente"));
    expect(html).toMatch(apostrophe("Vos coordonnées servent uniquement à vous prévenir de l'ouverture de l'offre aux agences."));
    expect(html).toMatch(apostrophe("Vous pouvez en demander la suppression à tout moment"));
    expect(html).toMatch(/<a[^>]*href="\/confidentialite"[^>]*>politique de confidentialité<\/a>/);
    expect(html.indexOf("<button")).toBeLessThan(html.indexOf('href="/confidentialite"'));
  });

  it("une erreur s'affiche en alerte, la saisie reposée dans les champs ; le succès remplace le formulaire", () => {
    etatSimule.valeur = { erreur: "Indiquez le code postal de l'agence : cinq chiffres.", valeurs: { agence: "Agence du Parc", contact: "Marie Durand", nb_lots: "200_a_499", code_postal: "7501" } };
    let html = rendre();
    expect(html).toMatch(/<p[^>]*role="alert"[^>]*>Indiquez le code postal de l&#x27;agence : cinq chiffres\.<\/p>/);
    expect(html).toMatch(/<input[^>]*name="agence"[^>]*value="Agence du Parc"/);
    expect(html).toMatch(/<input[^>]*name="code_postal"[^>]*value="7501"/);
    expect(html).toMatch(/<option value="200_a_499"[^>]*selected=""/);

    etatSimule.valeur = { succes: MESSAGE_SUCCES_LISTE_ATTENTE };
    html = rendre();
    expect(html).not.toContain("<form");
    expect(html).toContain("Votre agence est sur la liste d&#x27;attente");
  });
});

describe("la page /agences", () => {
  it("existe, avec l'en-tête public, les métadonnées, le pied de page et le formulaire", () => {
    expect(existsSync(path.join(RACINE, PAGE))).toBe(true);
    const page = lire(PAGE);
    expect(page).toContain("metadonneesPubliques(");
    expect(page).toContain('titre: "Agences de gestion — Gerimmo"');
    expect(page).toContain('chemin: "/agences"');
    expect(page).toContain("<EnTetePublic />");
    expect(page).toContain('<PiedPublic courant="/agences" />');
    expect(page).toContain('className="public-page-intro"');
    expect(page).toMatch(/<p className="eyebrow">Agences de gestion<\/p>/);
    expect(page).toMatch(/<h1>Gerimmo pour les agences arrive\.<\/h1>/);
    expect(page).toMatch(apostrophe("propriétaires bailleurs et aux SCI"));
    expect(page).toMatch(apostrophe("Date d'ouverture et tarifs ne sont pas encore fixés : les agences inscrites en sont informées en premier."));
    expect(page).toContain("<FormulaireListeAttenteAgences />");
    // Trois à cinq points « en préparation », fondés sur l'espace /agence existant.
    const puces = page.match(/<li><Check aria-hidden \/>/g) ?? [];
    expect(puces.length).toBeGreaterThanOrEqual(3);
    expect(puces.length).toBeLessThanOrEqual(5);
  });

  it("ni la page ni le formulaire ne promettent un prix ou une date d'ouverture", () => {
    for (const fichier of [PAGE, FORMULAIRE]) {
      const code = sansCommentaires(lire(fichier));
      expect(code, fichier).not.toMatch(/€/);
      expect(code, fichier).not.toMatch(/\b20[2-9][0-9]\b/);
      expect(code, fichier).not.toMatch(/\b(janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre)\b/i);
      expect(code, fichier).not.toMatch(/\/mois\b|par mois|gratuit|offert/i);
    }
    expect(rendre()).not.toMatch(/€|\b20[2-9][0-9]\b/);
  });

  it("l'action serveur : « use server », validation commune, client de service, doublon = succès, clé absente dite en français", () => {
    const action = lire(ACTION);
    expect(action.trimStart().startsWith('"use server";')).toBe(true);
    expect(action).toContain("validerInscriptionAgence(");
    expect(action).toContain("clientDeService()");
    expect(action).toContain('.from("liste_attente_agences")');
    expect(action).toContain('source: "/agences"');
    expect(action).toContain('"23505"');
    expect(action).toContain("MESSAGE_SUCCES_LISTE_ATTENTE");
    expect(action).toContain("sansJargon(");
    expect(action).toContain("Le formulaire est momentanément indisponible. Réessayez dans quelques minutes.");
    // Le pot de miel est lu avant tout : rempli, on répond succès sans écrire.
    expect(action.indexOf('formData.get("site")')).toBeLessThan(action.indexOf("validerInscriptionAgence("));
    // Le formulaire appelle bien cette action, avec l'état de React.
    const formulaire = lire(FORMULAIRE);
    expect(formulaire).toContain('from "@/app/actions/liste-attente-agences"');
    expect(formulaire).toMatch(/useActionState</);
  });
});

describe("le site mène à la page", () => {
  it("l'accueil : une section #agences avec son lien, et une question fréquente", () => {
    const accueil = lire("src/app/page.tsx");
    const section = /<section id="agences"[\s\S]*?<\/section>/.exec(accueil)?.[0] ?? "";
    expect(section).toContain('<p className="eyebrow">Agences de gestion</p>');
    expect(section).toMatch(/<h2[^>]*>Vous gérez des biens pour des mandants \?<\/h2>/);
    expect(section).toMatch(/<Link href="\/agences" className="btn-secondaire[^"]*">Rejoindre la liste d(?:’|&apos;|')attente/);
    expect(accueil).toContain('"Gerimmo est-il ouvert aux agences de gestion ?"');
    expect(accueil).toMatch(apostrophe("Pas encore : la V1 s'adresse aux propriétaires bailleurs et aux SCI. L'offre pour les agences est en préparation ; inscrivez votre agence sur la liste d'attente et nous vous préviendrons à son ouverture."));
  });

  it("/tarifs : un article « Agences de gestion » après « Ce qui n'est pas dans l'abonnement », deux puces, le lien", () => {
    const tarifs = lire("src/app/tarifs/page.tsx");
    const horsAbonnement = tarifs.indexOf("titre=\"Ce qui n'est pas dans l'abonnement\"");
    const agences = tarifs.indexOf('titre="Agences de gestion"');
    expect(horsAbonnement).toBeGreaterThan(0);
    expect(agences).toBeGreaterThan(horsAbonnement);
    const article = /<Article titre="Agences de gestion">([\s\S]*?)<\/Article>/.exec(tarifs)![1];
    expect(article.match(/<li>/g)).toHaveLength(2);
    expect(article).toContain('href="/agences"');
    expect(sansCommentaires(article)).not.toMatch(/€|\b20[2-9][0-9]\b/);
  });

  it("le pied de page porte « Agences » ; ni la barre d'en-tête ni le menu mobile", () => {
    const chrome = lire("src/components/chrome-public.tsx");
    const navigation = chrome.slice(chrome.indexOf("const NAVIGATION"), chrome.indexOf("export function EnTetePublic"));
    const pied = chrome.slice(chrome.indexOf("const GROUPES_PIED"), chrome.indexOf("export function PiedPublic"));
    expect(navigation).not.toContain("/agences");
    expect(pied).toContain('["/agences", "Agences"]');
  });

  it("le proxy, le plan du site et l'inventaire des écrans connaissent /agences", () => {
    const proxy = lire("src/proxy.ts");
    const publics = proxy.slice(proxy.indexOf("const PUBLIC_PATHS"), proxy.indexOf("const REDIRECT_SI_CONNECTE"));
    expect(publics).toContain('"/agences"');
    const connus = proxy.slice(proxy.indexOf("const SEGMENTS_CONNUS"), proxy.indexOf("type ClientProxy"));
    expect(connus).toContain('"agences"');
    expect(lire("src/app/sitemap.ts")).toContain('{ chemin: "/agences", frequence: "monthly", priorite: 0.6 }');
    const inventaire: { path: string; persona: string }[] = JSON.parse(lire("e2e/routes-inventaire.json"));
    expect(inventaire.filter((r) => r.path === "/agences").map((r) => r.persona)).toEqual(["public"]);
  });

  it("/confidentialite : la liste d'attente dans les finalités, les données traitées et les durées, avec le repère à confirmer", () => {
    const confidentialite = lire("src/app/confidentialite/page.tsx");
    expect(confidentialite.match(apostrophe("iste d'attente des agences") as RegExp)).not.toBeNull();
    expect((confidentialite.match(new RegExp(apostrophe("iste d'attente des agences").source, "g")) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(confidentialite).toMatch(apostrophe("vous prévenir de l'ouverture de l'offre aux agences, à votre demande"));
    expect(confidentialite).toMatch(apostrophe("au plus tard trois ans après notre dernier échange, ou dès votre demande de suppression"));
    for (const donnee of ["nom de l'agence", "nom du contact", "adresse électronique", "téléphone", "code postal", "nombre de lots", "message"]) {
      expect(confidentialite, donnee).toMatch(apostrophe(donnee));
    }
    expect(confidentialite).toContain("à confirmer par le juriste et le DPO");
  });
});
