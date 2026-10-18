/**
 * Garde D04 (1), fiche VER-TS-02 : plus aucun `Number()`, `parseFloat()` ni `parseInt()` n'est appliqué à une SAISIE
 * (champ de formulaire, paramètre d'adresse, valeur tapée dans un composant).
 *
 * Pourquoi. `Number(texte)` lit « 1e3 » comme 1000, « 0x10 » comme 16, « Infinity » comme un nombre, le vide comme 0, et
 * « 840,00 » comme NaN. Les champs `type="number"` d'un navigateur non francophone lisent en plus « 840,00 » comme
 * 84000 avant même que l'action ne le voie. Les montants et les nombres décimaux se lisent donc avec les lectures
 * strictes de `lib/saisie-montant.ts` : `lireMontant`, `lireMontantFacultatif`, `lireMontantSigne`,
 * `lireMontantAvecEspaces`, `lireDecimal`, `lireDecimalFacultatif` (virgule ou point, deux décimales pour un montant, ni
 * espace, ni point de milliers, ni exposant). Les quantités d'un devis ont leur lecture (`lireQuantite`).
 *
 * Comment. Ce test lit les sources de `src/` et relève chaque appel `Number(`, `parseFloat(`, `parseInt(`,
 * `Number.parseFloat(`, `Number.parseInt(` dont l'argument vient d'une saisie : lecture d'un FormData ou d'un paramètre
 * d'adresse (`.get(`), valeur d'un champ (`.value`), ou nom de variable initialisé par l'une de ces lectures. Tout appel
 * relevé doit figurer dans EXCEPTIONS, avec sa raison. Un NOUVEL appel fait échouer ce test : il faut le remplacer par
 * l'une des lectures ci-dessus, ou, si la valeur est un entier borné par une règle propre (un nombre de jours, une
 * année, une note de 1 à 5) et non un montant ni un décimal, l'inscrire ici avec la règle qui le borne.
 *
 * Limite assumée : le relevé est syntaxique. Il ne suit pas une valeur à travers plusieurs fonctions ; les tests
 * `virgule-actions-restantes.test.ts` et `montants-actions-lecture.test.ts` rejouent chaque action sur le texte tapé.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "..");
const SRC = join(RACINE, "src");

type Appel = { fichier: string; ligne: number; appel: string; argument: string };

/** Les appels de conversion numérique visés. `Number.isFinite(` et consorts ne correspondent pas (pas de parenthèse). */
const CONVERSION = /(?<![\w.$])(?:Number\.parseFloat|Number\.parseInt|parseFloat|parseInt|Number)\s*\(/g;

/** Ce qui désigne une saisie dans l'argument lui-même. */
const SOURCES_DE_SAISIE: RegExp[] = [
  /\.get(?:All)?\s*\(/, // FormData.get, URLSearchParams.get
  /\bformData\b/,
  /\bdonnees\.get\b/,
  /\bsearchParams\b/,
  /\.value\b/, // champ lu dans un composant
  /\bvalueAsNumber\b/,
  /\bsaisie\./, // état d'un formulaire client
  /\btexte\s*\(/, // assistant local de lecture d'un champ
];

/** Une virgule remplacée « à la main » avant de convertir : la lecture stricte existe pour ça. */
const VIRGULE_REMPLACEE_A_LA_MAIN = /\.replace\(\s*["'`]\s*,\s*["'`]\s*,\s*["'`]\s*\.\s*["'`]\s*\)/;

/** Lit l'argument d'un appel, de la parenthèse ouvrante à sa fermante, en ignorant les chaînes. */
function lireArgument(source: string, ouvrante: number): string {
  let profondeur = 0;
  let guillemet: string | null = null;
  for (let i = ouvrante; i < source.length; i++) {
    const c = source[i];
    if (guillemet) {
      if (c === "\\") i++;
      else if (c === guillemet) guillemet = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") guillemet = c;
    else if (c === "(") profondeur++;
    else if (c === ")") {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvrante + 1, i);
    }
  }
  return source.slice(ouvrante + 1);
}

/** Les variables simples (« valeur », « brut.trim() », « String(valeur) ») sont suivies jusqu'à leur déclaration. */
function sourceDeLaVariable(argument: string, source: string, avant: number, profondeur = 0): boolean {
  if (profondeur > 2) return false;
  const nom = /^\s*(?:String\s*\(\s*)?([A-Za-z_$][\w$]*)\s*(?:\.trim\(\s*\))?\s*\)?\s*$/.exec(argument)?.[1];
  if (!nom) return false;
  const tete = source.slice(0, avant);
  const declaration = new RegExp(`(?:const|let|var)\\s+${nom.replace(/\$/g, "\\$")}\\b[^=;]*=([^;]*);`, "g");
  let derniere: RegExpExecArray | null = null;
  for (let m = declaration.exec(tete); m; m = declaration.exec(tete)) derniere = m;
  if (!derniere) return false;
  const initialiseur = derniere[1];
  if (SOURCES_DE_SAISIE.some((re) => re.test(initialiseur))) return true;
  return sourceDeLaVariable(initialiseur, source, derniere.index, profondeur + 1);
}

/** Les appels de conversion appliqués à une saisie dans un texte source. */
export function appelsSurSaisie(fichier: string, source: string): Appel[] {
  const trouves: Appel[] = [];
  for (const m of source.matchAll(CONVERSION)) {
    const debut = m.index ?? 0;
    const ouvrante = debut + m[0].length - 1;
    const argument = lireArgument(source, ouvrante);
    const saisie =
      SOURCES_DE_SAISIE.some((re) => re.test(argument)) ||
      VIRGULE_REMPLACEE_A_LA_MAIN.test(argument) ||
      sourceDeLaVariable(argument, source, debut);
    if (!saisie) continue;
    trouves.push({
      fichier,
      ligne: source.slice(0, debut).split("\n").length,
      appel: m[0].replace(/\s*\($/, ""),
      argument: argument.replace(/\s+/g, " ").trim(),
    });
  }
  return trouves;
}

function fichiersSource(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSource(chemin));
    else if (/\.(ts|tsx)$/.test(nom) && !/\.d\.ts$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

/**
 * Les appels qui restent, un par (fichier, appel, argument) : des ENTIERS bornés par une règle propre, jamais un montant
 * ni un décimal. La raison dit ce qui borne la valeur.
 */
type Exception = { fichier: string; argument: string; raison: string };

const EXCEPTIONS: Exception[] = [
  { fichier: "src/app/actions/identite-editeur.ts", argument: "f.get('revision')", raison: "révision entière positive du formulaire, comparée atomiquement à la version enregistrée" },
  // ── Nombres de jours, de mois, d'années, d'unités, de pièces, de pages : entiers bornés par une règle propre ──
  { fichier: "src/app/actions/equipes.ts", argument: "form.get('jours')", raison: "durée en jours d'une délégation, entière ; la base borne" },
  { fichier: "src/app/actions/autonomie.ts", argument: 'formData.get("jours")', raison: "durée en jours d'une délégation, entière ; la base borne" },
  { fichier: "src/app/actions/controle-supervision.ts", argument: 'form.get("jours")', raison: "jours de prolongation de l'essai, entiers ; la base borne" },
  { fichier: "src/app/actions/organisations-admin.ts", argument: "joursSaisis", raison: "durée de l'essai en jours, entière ; la base borne" },
  { fichier: "src/app/actions/consignes-vacances.ts", argument: "texte(f,'version') || 0", raison: "numéro de version attendue (champ caché produit par le serveur)" },
  { fichier: "src/app/actions/consignes-vacances.ts", argument: "f.get('budget_total')", raison: "nombre de lectures autorisées (entier de 1 à 100), pas un montant" },
  { fichier: "src/app/actions/consignes-vacances.ts", argument: "f.get('budget_mensuel')", raison: "nombre de lectures autorisées (entier de 1 à 100), pas un montant" },
  { fichier: "src/app/actions/consignes-vacances.ts", argument: "f.get('delai')", raison: "délai en minutes, entier ; la base borne" },
  { fichier: "src/app/admin/marketing/actions.ts", argument: 'donnees.get("jour_1")', raison: "jour de la semaine, entier de 0 à 6 ; borné ensuite" },
  { fichier: "src/app/admin/marketing/actions.ts", argument: 'donnees.get("jour_2")', raison: "jour de la semaine, entier de 0 à 6 ; borné ensuite" },
  { fichier: "src/app/admin/marketing/actions.ts", argument: 'donnees.get("heure_paris")', raison: "heure, entier de 0 à 23 ; borné ensuite" },
  { fichier: "src/app/actions/etudes-territoriales.ts", argument: "form.get('nombre')", raison: "nombre d'agences ou de clients de l'étude : entier sûr et positif, vérifié ensuite" },
  { fichier: "src/app/actions/appels-charges.ts", argument: 'String(formData.get("exercice") ?? "").trim()', raison: "année d'exercice, entière ; bornée par la base" },
  { fichier: "src/app/actions/loyers.ts", argument: 'String(formData.get("annee") ?? "").trim()', raison: "année de régularisation, entière ; bornée ensuite" },
  { fichier: "src/app/actions/baux.ts", argument: 'formData.get("preavis_mois") ?? 3', raison: "préavis en mois, entier ; la base borne" },
  { fichier: "src/app/actions/baux.ts", argument: 'formData.get("quantite") ?? 1', raison: "quantité d'un meuble de l'inventaire, entière (arrondie vers le bas, au moins 1)" },
  { fichier: "src/app/actions/mandats.ts", argument: 'formData.get("date_rapport") ?? 10', raison: "jour du mois du rapport, entier de 1 à 28 ; la base borne" },
  { fichier: "src/app/actions/incidents.ts", argument: 'formData.get("validite") ?? 30', raison: "validité des devis en jours, entière ; bornée ensuite" },
  { fichier: "src/app/actions/incidents.ts", argument: "formData.get(cle) ?? 0", raison: "note de 1 à 5, entière (Number.isInteger puis bornes)" },
  { fichier: "src/app/actions/incidents-locataire.ts", argument: 'formData.get("note")', raison: "note de 1 à 5, entière (Number.isInteger puis bornes)" },
  { fichier: "src/app/actions/edl.ts", argument: 'formData.get("nombre") ?? 1', raison: "nombre de clés remises, entier (arrondi vers le bas)" },
  { fichier: "src/app/actions/edl.ts", argument: "brut", raison: "nombre de clés rendues, entier : fini et positif, arrondi vers le bas" },
  { fichier: "src/app/actions/parc.ts", argument: "valeur", raison: "nombre de pièces du lot, entier" },
  { fichier: "src/app/actions/parc.ts", argument: "annee", raison: "année de construction, entière : Number.isInteger puis bornes 1000-2100" },
  { fichier: "src/app/actions/organisation.ts", argument: 'String(formData.get(n) ?? ""), 10', raison: "jours de relance, entiers ; vérifiés ensuite" },
  { fichier: "src/app/api/devis/[sollicitationId]/pdf/route.ts", argument: 'form.get("revision")??0', raison: "numéro de révision du devis (champ caché produit par le serveur)" },
  { fichier: "src/app/api/devis/[sollicitationId]/pdf/route.ts", argument: 'numero', raison: "numéro de version archivée, jamais un montant : chiffres positifs puis entier sûr borné à 2147483647 avant la lecture SQL" },
  { fichier: "src/app/artisan/devis/actions-preparation.ts", argument: 'form.get("revision") ?? 0', raison: "numéro de révision du devis (champ caché produit par le serveur)" },
  { fichier: "src/app/artisan/devis/actions-preparation.ts", argument: 'form.get("revision")', raison: "numéro de révision du devis (champ caché produit par le serveur), comparé à la révision enregistrée" },
  { fichier: "src/app/artisan/clients/actions.ts", argument: 'form.get("revision")??0', raison: "numéro de révision du devis (champ caché produit par le serveur)" },
  { fichier: "src/app/artisan/devis/[sollicitationId]/apercu-devis.tsx", argument: 'reponse.headers.get("X-Devis-Revision")', raison: "numéro de révision renvoyé par le serveur dans un en-tête" },
  { fichier: "src/app/actions/baux.ts", argument: "jour", raison: "jour d'échéance : l'expression /^\\d+$/ précède, puis bornes de 1 à 28" },
  { fichier: "src/app/actions/incidents.ts", argument: "parts.find((p) => p.type === t)?.value ?? 0", raison: "partie de date rendue par Intl.DateTimeFormat (jour, heure), pas une saisie" },
  { fichier: "src/app/locataire/[orgId]/demandes/creneaux.ts", argument: "parts.find((p) => p.type === t)?.value ?? 0", raison: "partie de date rendue par Intl.DateTimeFormat (jour, heure), pas une saisie" },
  { fichier: "src/components/navigation-parcours.tsx", argument: "e.target.value", raison: "rang d'une étape choisie dans une liste fermée (les options valent 0, 1, 2…), pas un nombre tapé" },
  { fichier: "src/components/recapitulatif-fiscal.tsx", argument: "composantes.get(e.id)?.non_ventile", raison: "montant lu dans une table Map construite depuis la base (get d'une Map, pas d'un formulaire)" },
  { fichier: "src/app/admin/couverture/page.tsx", argument: 'texte("page")', raison: "numéro de page : l'expression /^[1-9]\\d{0,4}$/ précède l'appel" },
  { fichier: "src/app/admin/couverture/page.tsx", argument: 'texte("interets")', raison: "numéro de page : l'expression /^[1-9]\\d{0,4}$/ précède l'appel" },
  { fichier: "src/app/agence/[orgId]/reseau/page.tsx", argument: 'texte("page")', raison: "numéro de page : l'expression /^[1-9]\\d{0,4}$/ précède l'appel" },
];

function normaliser(texte: string): string {
  return texte.replace(/\s+/g, "");
}

function releve(): { tous: Appel[]; inattendus: Appel[]; exceptionsInutiles: Exception[] } {
  const tous: Appel[] = [];
  for (const chemin of fichiersSource(SRC)) {
    const fichier = relative(RACINE, chemin).split("\\").join("/");
    tous.push(...appelsSurSaisie(fichier, readFileSync(chemin, "utf8")));
  }
  const autorise = (a: Appel) =>
    EXCEPTIONS.some((e) => e.fichier === a.fichier && normaliser(e.argument) === normaliser(a.argument));
  const inattendus = tous.filter((a) => !autorise(a));
  const exceptionsInutiles = EXCEPTIONS.filter(
    (e) => !tous.some((a) => a.fichier === e.fichier && normaliser(e.argument) === normaliser(a.argument))
  );
  return { tous, inattendus, exceptionsInutiles };
}

describe("aucune saisie n'est lue par Number(), parseFloat() ni parseInt()", () => {
  const { tous, inattendus, exceptionsInutiles } = releve();

  it("le relevé voit bien les sources (pas de garde vide)", () => {
    expect(fichiersSource(SRC).length).toBeGreaterThan(500);
    expect(tous.length).toBeGreaterThan(30);
  });

  it("aucun appel nouveau : un montant ou un décimal se lit avec lib/saisie-montant.ts", () => {
    const message = inattendus
      .map(
        (a) =>
          `  ${a.fichier}:${a.ligne}  ${a.appel}(${a.argument.slice(0, 90)})`
      )
      .join("\n");
    expect(
      inattendus,
      `Une saisie est lue par Number()/parseFloat()/parseInt() :\n${message}\n\n` +
        "Un montant se lit avec lireMontant / lireMontantFacultatif / lireMontantSigne, un décimal avec lireDecimal / " +
        "lireDecimalFacultatif (lib/saisie-montant.ts), une quantité de devis avec lireQuantite (lib/devis-structure.ts), " +
        "et le champ est du texte à clavier décimal. Un entier borné par une règle propre s'inscrit dans EXCEPTIONS " +
        "avec cette règle."
    ).toEqual([]);
  });

  it("aucune exception périmée : chaque entrée de la liste correspond à un appel qui existe encore", () => {
    expect(
      exceptionsInutiles.map((e) => `${e.fichier} : ${e.argument}`),
      "Ces exceptions ne correspondent plus à aucun appel : retirez-les de la liste."
    ).toEqual([]);
  });

  it("chaque exception dit la règle qui borne la valeur", () => {
    for (const e of EXCEPTIONS) expect(e.raison.length, `${e.fichier} : ${e.argument}`).toBeGreaterThan(15);
  });

  it("aucune exception ne porte sur un montant ni sur un décimal", () => {
    const suspects = EXCEPTIONS.filter((e) => /montant|prix|cout|coût|loyer|charges|taux|quote|surface|depense|dépense|solde|tresorerie|trésorerie/i.test(e.argument));
    expect(suspects.map((e) => `${e.fichier} : ${e.argument}`)).toEqual([]);
  });
});

describe("le relevé lui-même : il voit les lectures interdites et laisse passer les valeurs de la base", () => {
  const voit = (source: string) => appelsSurSaisie("essai.ts", source).map((a) => a.argument);

  it("relève Number() sur un champ de formulaire, sous toutes ses formes", () => {
    expect(voit('const m = Number(formData.get("montant"));')).toEqual(['formData.get("montant")']);
    expect(voit("const m = Number(form.get('montant') ?? 0);")).toEqual(["form.get('montant') ?? 0"]);
    expect(voit('const m = parseFloat(String(formData.get("taux")));')).toEqual(['String(formData.get("taux"))']);
    expect(voit('const m = Number.parseFloat(String(donnees.get("taux")));')).toEqual(['String(donnees.get("taux"))']);
    expect(voit('const m = parseInt(String(formData.get("n")), 10);')).toEqual(['String(formData.get("n")), 10']);
    expect(voit("const m = Number.parseInt(f.get('n') as string, 10);")).toEqual(["f.get('n') as string, 10"]);
  });

  it("relève la variable qui porte la saisie (déclarée avant l'appel)", () => {
    expect(voit('const brut = String(formData.get("montant") ?? "").trim();\nconst m = Number(brut);')).toEqual(["brut"]);
    expect(voit('let valeur = formData.get("surface");\nconst m = Number(valeur.trim());')).toEqual(["valeur.trim()"]);
    expect(voit('const a = formData.get("x");\nconst b = String(a);\nconst m = Number(b);')).toEqual(["b"]);
  });

  it("relève la saisie d'un composant : valeur d'un champ, état du formulaire, virgule remplacée à la main", () => {
    expect(voit("const m = Number(e.target.value);")).toEqual(["e.target.value"]);
    expect(voit("const c = Number(saisie.cout.trim());")).toEqual(["saisie.cout.trim()"]);
    expect(voit('const q = Number(x.quantite.replace(",", "."));')).toEqual(['x.quantite.replace(",", ".")']);
    expect(voit("const n = Number(input.valueAsNumber);")).toEqual(["input.valueAsNumber"]);
    expect(voit('const p = Number(searchParams.get("page"));')).toEqual(['searchParams.get("page")']);
  });

  it("ne relève pas les valeurs de la base ni les calculs", () => {
    expect(voit("const dus = lignes.reduce((s, l) => s + Number(l.montant_du), 0);")).toEqual([]);
    expect(voit("const reste = Number(terme.montant_du) - Number(terme.montant_couvert);")).toEqual([]);
    expect(voit("const jour = Number(j.slice(8));")).toEqual([]);
    expect(voit("if (Number.isFinite(x) && Number.isInteger(y) && Number.isSafeInteger(z)) {}")).toEqual([]);
    expect(voit("const montant = Number(texte);")).toEqual([]); // `texte` n'est pas déclaré ici comme une saisie
  });

  it("ne suit pas une variable déclarée APRÈS l'appel, ni une variable d'un autre nom", () => {
    expect(voit('const a = Number(brut);\nconst brut = formData.get("x");')).toEqual([]);
    expect(voit('const brut = formData.get("x");\nconst m = Number(autre);')).toEqual([]);
  });

  it("lit l'argument entier, même avec des parenthèses et des chaînes qui en contiennent", () => {
    expect(voit('const m = Number(formData.get("a)b") ?? (0));')).toEqual(['formData.get("a)b") ?? (0)']);
  });
});
