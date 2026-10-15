/**
 * Lecture du code par son ARBRE SYNTAXIQUE (compilateur TypeScript), pour les balayages de la décision D27.
 *
 * Pourquoi pas le texte : une contre-relecture du 15/10 a fait survivre au balayage textuel des formes qu'il ne
 * savait pas lire — une constante de racine mise en dur (`${RACINE_PROPRIETAIRE}/${orgId}`), un chemin converti après
 * coup (`versEspaceProprietaire(…)`), une exception admise pour TOUT un fichier alors qu'elle visait un seul défaut de
 * propriété. L'arbre dit, lui, dans quelle fonction est un appel, ce qu'il initialise, et d'où vient la variable qu'il
 * reçoit (portée lexicale), sans se laisser tromper par un commentaire, une chaîne ou une mise en forme.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const APP = path.resolve(__dirname, "..");

/** Les fichiers .ts / .tsx d'un dossier (chemins relatifs à app/, en « / »). */
export function fichiersSources(dossier: string): string[] {
  return readdirSync(path.join(APP, dossier)).flatMap((nom) => {
    const relatif = path.posix.join(dossier, nom);
    if (statSync(path.join(APP, relatif)).isDirectory()) return fichiersSources(relatif);
    return /\.(ts|tsx)$/.test(nom) ? [relatif] : [];
  });
}

const arbres = new Map<string, ts.SourceFile>();
/** L'arbre syntaxique d'un fichier (relatif à app/), mis en cache. */
export function arbre(fichier: string): ts.SourceFile {
  let a = arbres.get(fichier);
  if (!a) {
    const texte = readFileSync(path.join(APP, fichier), "utf8");
    a = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, fichier.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    arbres.set(fichier, a);
  }
  return a;
}

/** Tous les nœuds d'un arbre, en profondeur. */
export function noeuds(racine: ts.Node): ts.Node[] {
  const tous: ts.Node[] = [];
  const visiter = (n: ts.Node) => {
    tous.push(n);
    ts.forEachChild(n, visiter);
  };
  visiter(racine);
  return tous;
}

/** Le texte d'un nœud, espaces réduits. */
export const texte = (n: ts.Node): string => n.getText().replace(/\s+/g, " ").trim();

/** La ligne (1…) d'un nœud. */
export const ligne = (n: ts.Node): number => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;

/** Le nom de la fonction (déclarée, ou constante fléchée) qui contient le nœud ; « (module) » hors de toute fonction. */
export function fonctionEnglobante(n: ts.Node): string {
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText();
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) {
      return p.parent.name.text;
    }
  }
  return "(module)";
}

/** Le nom appelé : `f(…)` → « f » ; null pour `a.b(…)` ou une expression. */
export const nomAppele = (c: ts.CallExpression): string | null => (ts.isIdentifier(c.expression) ? c.expression.text : null);

function dansLaLiaison(nom: ts.BindingName, cherche: string): ts.Node | undefined {
  if (ts.isIdentifier(nom)) return nom.text === cherche ? nom.parent : undefined;
  for (const e of nom.elements) {
    if (ts.isOmittedExpression(e)) continue;
    const d = dansLaLiaison(e.name, cherche);
    if (d) return d;
  }
  return undefined;
}

/**
 * La déclaration que désigne un identifiant, par la portée lexicale : paramètres des fonctions englobantes, puis
 * déclarations des blocs englobants (la plus proche d'abord). Rend le `BindingElement`, la `VariableDeclaration`, le
 * `ParameterDeclaration` ou la `FunctionDeclaration` ; undefined pour un nom importé ou global.
 */
export function declarationDe(id: ts.Identifier): ts.Node | undefined {
  const cherche = id.text;
  for (let n: ts.Node | undefined = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      for (const p of n.parameters) {
        const d = dansLaLiaison(p.name, cherche);
        if (d) return d;
      }
    }
    if ((ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isForStatement(n)) && n.initializer && ts.isVariableDeclarationList(n.initializer)) {
      for (const v of n.initializer.declarations) {
        const d = dansLaLiaison(v.name, cherche);
        if (d) return d;
      }
    }
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n)) {
      for (const s of n.statements) {
        if (ts.isVariableStatement(s)) {
          for (const v of s.declarationList.declarations) {
            const d = dansLaLiaison(v.name, cherche);
            if (d) return d;
          }
        }
        if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name?.text === cherche) return s;
      }
    }
  }
  return undefined;
}

/** `await verifierAccesEspace(…)` : la garde des pages de l'espace. */
export function estAppelDeLaGarde(e: ts.Expression | undefined): boolean {
  return Boolean(e && ts.isAwaitExpression(e) && ts.isCallExpression(e.expression) && nomAppele(e.expression) === "verifierAccesEspace");
}

/** Le premier paramètre de la fonction qui porte ce paramètre : les propriétés d'un composant. */
export function estPremierParametre(p: ts.ParameterDeclaration): boolean {
  return ts.isFunctionLike(p.parent) && p.parent.parameters[0] === p;
}

/** Un `BindingElement` lu de la garde sous ce nom de propriété : `const { estProprietaire } = await verifierAccesEspace(…)`. */
export function luDeLaGarde(d: ts.Node | undefined, propriete: string): boolean {
  if (!d || !ts.isBindingElement(d)) return false;
  if ((d.propertyName ?? d.name).getText() !== propriete) return false;
  const conteneur = d.parent.parent;
  return ts.isVariableDeclaration(conteneur) && estAppelDeLaGarde(conteneur.initializer);
}

/** Une propriété de composant : élément du motif déstructuré du premier paramètre, sous ce nom. */
export function proprieteDeComposant(d: ts.Node | undefined, propriete: string): d is ts.BindingElement {
  if (!d || !ts.isBindingElement(d) || !ts.isObjectBindingPattern(d.parent)) return false;
  if ((d.propertyName ?? d.name).getText() !== propriete) return false;
  const conteneur = d.parent.parent;
  return ts.isParameter(conteneur) && estPremierParametre(conteneur);
}

/** `x === "proprietaire_direct"` : rend `x` (le côté gauche), sinon null. */
export function comparaisonAuProprietaireDirect(e: ts.Expression | undefined): ts.Expression | null {
  if (!e || !ts.isBinaryExpression(e) || e.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null;
  return ts.isStringLiteral(e.right) && e.right.text === "proprietaire_direct" ? e.left : null;
}

/** Résout un spécificateur d'import (`@/…` ou relatif) vers un fichier de app/src, ou null. */
export function resoudreImport(depuis: string, specificateur: string): string | null {
  let base: string;
  if (specificateur.startsWith("@/")) base = path.posix.join("src", specificateur.slice(2));
  else if (specificateur.startsWith(".")) base = path.posix.join(path.posix.dirname(depuis), specificateur);
  else return null;
  for (const candidat of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    try {
      if (statSync(path.join(APP, candidat)).isFile()) return candidat;
    } catch {
      // essai suivant
    }
  }
  return null;
}
