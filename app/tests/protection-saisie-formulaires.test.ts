/**
 * Audit du 13/10/2026 (VER-PR178-01) : la correction PR178-A-02 a fait de `data-saisie-confirmee` une liste blanche
 * (src/lib/protection-saisie.ts, `eligible`). Une trentaine de vrais formulaires de saisie (profil, bail, lot, EDL,
 * messages, assistance…) n'avaient pas l'attribut et ont cessé d'avertir avant qu'on quitte la page. Aucun test ne
 * le voyait : le test navigateur sert une page synthétique qui porte déjà l'attribut.
 *
 * Ce test lit le code source. Chaque balise `<form` d'un fichier de src/ doit dire ce qu'elle est :
 *   - `data-saisie-confirmee` : saisie à protéger (le formulaire confirme ses envois, voir les hooks
 *     useActionFormulaire / useActionStateProtegee) ;
 *   - `data-saisie-libre` : volontairement non suivi (déconnexion, code à usage unique, bouton seul, page hors des
 *     espaces suivis…) ;
 *   - `method="get"` ou `role="search"` : filtre ou recherche ;
 *   - `data-protection-saisie="locale"` : protégé par une copie locale propre (reprise de saisie).
 * Un nouveau formulaire sans marqueur fait échouer ce test : mieux vaut un choix explicite qu'un oubli silencieux.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eligible } from "../src/lib/protection-saisie";

const RACINE = fileURLToPath(new URL("../src", import.meta.url));

type Balise = { fichier: string; ligne: number; texte: string };

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) return fichiersTsx(chemin);
    return e.name.endsWith(".tsx") ? [chemin] : [];
  });
}

/** Remplace les commentaires par des espaces (mêmes positions) : un `<form action={…}>` cité en exemple n'est pas un formulaire. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? " ".repeat(l.length) : l))
    .join("\n");
}

/** Toutes les balises ouvrantes `<form …>`, y compris sur plusieurs lignes et avec des accolades imbriquées. */
function balisesForm(source: string, fichier: string): Balise[] {
  const code = sansCommentaires(source);
  const resultat: Balise[] = [];
  for (const m of code.matchAll(/<form(?=[\s>])/g)) {
    let profondeur = 0;
    let guillemet: string | null = null;
    let i = m.index! + 5;
    for (; i < code.length; i++) {
      const c = code[i];
      if (guillemet) { if (c === guillemet && code[i - 1] !== "\\") guillemet = null; continue; }
      if (c === "{") profondeur++;
      else if (c === "}") profondeur--;
      else if (c === '"' || c === "'" || (profondeur > 0 && c === "`")) guillemet = c;
      else if (profondeur === 0 && c === ">") break;
    }
    resultat.push({
      fichier: path.relative(RACINE, fichier).split(path.sep).join("/"),
      ligne: code.slice(0, m.index).split("\n").length,
      texte: code.slice(m.index, i + 1).replace(/\s+/g, " "),
    });
  }
  return resultat;
}

const sources = fichiersTsx(RACINE).map((f) => ({ f, source: readFileSync(f, "utf8") }));
const balises = sources.flatMap(({ f, source }) => balisesForm(source, f));

const CONFIRMEE = /\bdata-saisie-confirmee\b/;
const LIBRE = /\bdata-saisie-libre\b/;
const FILTRE = /\bmethod\s*=\s*["']get["']|\brole\s*=\s*["']search["']/i;
const LOCALE = /\bdata-protection-saisie\s*=\s*["']locale["']/;

// Exceptions justifiées. Chacune est un formulaire qui n'a PAS de marqueur, ou qui n'est pas « confirmee » dans un
// fichier branché sur les hooks de confirmation. Liste courte : toute nouvelle entrée se discute.
type Exception = { fichier: string; balise: string; raison: string };
const SANS_MARQUEUR: Exception[] = [];
const LIBRE_DANS_FICHIER_A_HOOK: Exception[] = [
  {
    fichier: "app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-annexes.tsx",
    balise: "<form onSubmit={formAction}>",
    raison: "Bouton « Retirer » seul : aucun champ, rien à perdre.",
  },
  {
    fichier: "app/assistance/formulaire-retour.tsx",
    balise: '<form onSubmit={soumettre} className="mt-3">',
    raison: "Bouton « Soutenir cette idée » seul : aucun champ, rien à perdre.",
  },
  {
    fichier: "app/agence/[orgId]/parc/import/formulaire-import.tsx",
    balise: "<form id={`${base}-import`}",
    raison: "Seul un fichier à rechoisir ; EtatImport n'a pas de `succes`, le formulaire ne se confirmerait jamais "
      + "et la boîte « Quitter la page ? » s'ouvrirait après chaque import réussi.",
  },
];
// Les marqueurs sont retirés avant la comparaison : l'exception décrit la balise, pas le choix qu'on y a posé.
const sansMarqueurs = (texte: string) => texte.replace(/ data-saisie-(libre|confirmee)\b/g, "");
const correspond = (b: Balise, e: Exception) => b.fichier === e.fichier && sansMarqueurs(b.texte).startsWith(e.balise);

describe("les formulaires du code disent s'ils sont suivis (VER-PR178-01)", () => {
  it("le test voit bien les formulaires, y compris sur plusieurs lignes", () => {
    expect(balises.length).toBeGreaterThan(200);
    const multiligne = balises.find((b) => b.fichier.endsWith("edl-annexes.tsx") && b.texte.includes("idFormAnnexes"));
    expect(sansMarqueurs(multiligne?.texte ?? "")).toMatch(/^<form id=\{idFormAnnexes\} onSubmit=\{formAnnexes\}.*>$/);
    expect(balisesForm("// <form action={x}>\n/* <form> */\n{/* <form a> */}", "x.tsx")).toEqual([]);
  });

  it("chaque <form porte un marqueur : confirmée, libre, filtre (GET, search) ou copie locale", () => {
    const sansMarqueur = balises
      .filter((b) => ![CONFIRMEE, LIBRE, FILTRE, LOCALE].some((r) => r.test(b.texte)))
      .filter((b) => !SANS_MARQUEUR.some((e) => correspond(b, e)))
      .map((b) => `${b.fichier}:${b.ligne}  ${b.texte.slice(0, 110)}`);
    expect(sansMarqueur, "Ajoutez data-saisie-confirmee (saisie à protéger) ou data-saisie-libre (non suivi voulu).").toEqual([]);
  });

  it("un formulaire ne peut pas être à la fois confirmé et libre", () => {
    expect(balises.filter((b) => CONFIRMEE.test(b.texte) && LIBRE.test(b.texte)).map((b) => `${b.fichier}:${b.ligne}`)).toEqual([]);
  });

  it("dans un fichier branché sur les hooks de confirmation, tout <form est confirmé (sauf exceptions justifiées)", () => {
    const hooks = /\buse(ActionFormulaire|ActionStateProtegee|ActionRetour)\b/;
    const avecHook = new Set(sources.filter(({ source }) => hooks.test(sansCommentaires(source)))
      .map(({ f }) => path.relative(RACINE, f).split(path.sep).join("/")));
    // Garde-fou du test : les fichiers qui définissent les hooks ne contiennent pas de formulaire, et la liste n'est pas vide.
    expect(avecHook.size).toBeGreaterThan(30);
    const fautifs = balises
      .filter((b) => avecHook.has(b.fichier) && !CONFIRMEE.test(b.texte))
      .filter((b) => !FILTRE.test(b.texte) && !LOCALE.test(b.texte))
      .filter((b) => !LIBRE_DANS_FICHIER_A_HOOK.some((e) => correspond(b, e)))
      .map((b) => `${b.fichier}:${b.ligne}  ${b.texte.slice(0, 110)}`);
    expect(fautifs, "Un formulaire branché sur useActionFormulaire / useActionStateProtegee doit porter data-saisie-confirmee.").toEqual([]);
  });

  it("chaque exception cite un formulaire qui existe encore (la liste ne se périme pas)", () => {
    for (const e of [...SANS_MARQUEUR, ...LIBRE_DANS_FICHIER_A_HOOK]) {
      expect(balises.some((b) => correspond(b, e)), `${e.fichier} : ${e.balise}`).toBe(true);
    }
  });

  it("data-saisie-libre est documenté là où `eligible` l'exclut", () => {
    const garde = readFileSync(path.join(RACINE, "lib/protection-saisie.ts"), "utf8");
    expect(garde).toMatch(/data-saisie-libre/);
  });
});

describe("eligible : quels formulaires sont suivis", () => {
  afterEach(() => vi.unstubAllGlobals());
  function formulaire(attributs: Record<string, string>, dansCopieLocale = false) {
    return {
      hasAttribute: (n: string) => n in attributs,
      getAttribute: (n: string) => attributs[n] ?? null,
      closest: (s: string) => (dansCopieLocale && s === '[data-protection-saisie="locale"]' ? {} : null),
    } as unknown as HTMLFormElement;
  }
  const sur = (chemin: string) => vi.stubGlobal("location", { pathname: chemin });

  it("suit un formulaire confirmé d'un espace connecté", () => {
    sur("/agence/o1/profil");
    expect(eligible(formulaire({ "data-saisie-confirmee": "" }))).toBe(true);
  });
  it("ne suit pas un formulaire sans marqueur", () => {
    sur("/agence/o1/profil");
    expect(eligible(formulaire({}))).toBe(false);
  });
  it("ne suit pas un formulaire libre, même s'il porte aussi l'attribut de confirmation", () => {
    sur("/agence/o1/profil");
    expect(eligible(formulaire({ "data-saisie-libre": "" }))).toBe(false);
    expect(eligible(formulaire({ "data-saisie-libre": "", "data-saisie-confirmee": "" }))).toBe(false);
  });
  it("ne suit pas un filtre (GET, recherche) ni un formulaire à copie locale", () => {
    sur("/agence/o1/documents");
    expect(eligible(formulaire({ "data-saisie-confirmee": "", method: "GET" }))).toBe(false);
    expect(eligible(formulaire({ "data-saisie-confirmee": "", role: "search" }))).toBe(false);
    expect(eligible(formulaire({ "data-saisie-confirmee": "" }, true))).toBe(false);
  });
  it("ne suit rien hors des espaces connectés", () => {
    sur("/inscription");
    expect(eligible(formulaire({ "data-saisie-confirmee": "" }))).toBe(false);
  });
  it("décision D27 : suit aussi les formulaires du propriétaire direct sous /espace/<id> (sans quoi sa saisie ne serait plus protégée)", () => {
    for (const chemin of ["/espace/o1", "/espace/o1/profil", "/espace/o1/personnes", "/espace/o1/parc/nouveau"]) {
      sur(chemin);
      expect(eligible(formulaire({ "data-saisie-confirmee": "" })), chemin).toBe(true);
      expect(eligible(formulaire({ "data-saisie-libre": "" })), chemin).toBe(false);
      expect(eligible(formulaire({ "data-saisie-confirmee": "", method: "GET" })), chemin).toBe(false);
    }
  });
  it("ne confond pas /espace avec /espaces (la page « Mes espaces » n'a pas de saisie à protéger)", () => {
    sur("/espaces");
    expect(eligible(formulaire({ "data-saisie-confirmee": "" }))).toBe(false);
  });
});
