/**
 * Décision D27 : dans les ÉCRANS — pages et composants de src/app/agence/[orgId], composants partagés de
 * src/components — le choix de la racine (/agence ou /espace) se lit de la GARDE de la page, jamais d'une valeur
 * inversée, recalculée, convertie ou mise en dur.
 *
 * Relecture du 15/10 : sur une dizaine de pages, écrire `baseEspace(orgId, !estProprietaire)` ne faisait échouer aucun
 * test. Contre-relecture du même jour : le premier balayage, TEXTUEL, laissait encore passer
 * `` `${RACINE_PROPRIETAIRE}/${orgId}` `` (fiche du bail, loyers : l'agence part en 404 sur /espace/<agence>),
 * `versEspaceProprietaire(baseEspace(…))` (incidents), `baseDepuisRacine(orgId, RACINE_PROPRIETAIRE)` (invitation du
 * locataire), `baseEspace(orgId, false)` dans le volet artisan (son exception était indexée par FICHIER), et un parent
 * qui ne transmet plus `estProprietaire` / `racine` (volet artisan, liste des alertes, formulaire des loyers, fenêtre du
 * lot). Ce test lit désormais l'ARBRE SYNTAXIQUE (voir analyse-ast.ts) et exige, dans les écrans :
 *  1. que chaque `baseEspace(…)`, `racineEspace(…)` ou `cheminPourProfil(…)` reçoive l'identifiant `estProprietaire`,
 *     et que cet identifiant désigne (portée lexicale) la valeur de la garde, le rôle qu'elle rend, ou une propriété du
 *     composant à défaut « agence » ; chaque écart admis est nommé par fichier, fonction, forme exacte ET nombre ;
 *  2. qu'aucune constante de racine (RACINE_AGENCE, RACINE_PROPRIETAIRE) n'y choisisse une racine, hors du défaut
 *     « agence » d'une propriété `racine` et de deux emplacements nommés ;
 *  3. qu'aucun chemin n'y soit converti après coup (versEspaceProprietaire, versRouteAgence) ;
 *  4. que `baseDepuisRacine` y reçoive la propriété `racine` du composant, jamais une constante ni rien ;
 *  5. que chaque rendu d'un composant dont la propriété `estProprietaire`, `racine`, `bailleurDirect` ou `base` a un
 *     défaut (« agence ») la TRANSMETTE, et la transmette telle que la garde l'a lue ;
 *  6. qu'aucune adresse « /espace… » ni « /agence… » n'y soit écrite en dur (hors écrans réservés aux agences).
 * Les écrans eux-mêmes sont RENDUS pour les deux profils dans racine-pages-rendus.test.ts (fiche du bail, loyers,
 * incidents avec leur volet, alertes, parc, invitation du locataire), racine-coquille-espace.test.ts et
 * racine-rendus-serveur.test.ts ; le comportement de baseEspace / racineEspace, par racine-espace.test.ts.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  arbre,
  comparaisonAuProprietaireDirect,
  declarationDe,
  fichiersSources,
  fonctionEnglobante,
  ligne,
  luDeLaGarde,
  noeuds,
  nomAppele,
  proprieteDeComposant,
  resoudreImport,
  texte,
} from "./analyse-ast";

const ECRANS = ["src/app/agence/[orgId]", "src/components"];
const tousLesEcrans = ECRANS.flatMap(fichiersSources);
const toutSrc = fichiersSources("src");
const lire = (f: string) => arbre(f).getFullText();

/** L'argument qui choisit la racine : le booléen de baseEspace / cheminPourProfil, l'unique de racineEspace. */
const ARGUMENT_DU_CHOIX: Record<string, number> = { baseEspace: 1, cheminPourProfil: 1, racineEspace: 0 };

/** Ce qu'un nœud alimente : la forme qui sert de clé aux exceptions (avec le fichier et la fonction). */
function forme(n: ts.Node): string {
  const p = n.parent;
  if (ts.isBindingElement(p) && ts.isParameter(p.parent.parent)) return `paramètre ${texte(p)}`;
  if (ts.isVariableDeclaration(p)) return `const ${texte(p)}`;
  if (ts.isPropertyAssignment(p)) return `propriété ${texte(p)}`;
  if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) return `attribut ${texte(p.parent)}`;
  if (ts.isCallExpression(p) && p.expression !== n) return `argument de ${texte(p)}`;
  return `expression ${texte(n)}`;
}

/** Un écart admis, désigné exactement : fichier, fonction englobante, forme, et nombre d'occurrences. */
type Exception = { fichier: string; fonction: string; forme: string; nombre: number; raison: string; preuve: [string, string] };
const cle = (e: { fichier: string; fonction: string; forme: string }) => `${e.fichier} › ${e.fonction} › ${e.forme}`;

/** Compte les occurrences par clé et les confronte à la liste des exceptions : rend les écarts. */
function confronter(occurrences: { fichier: string; fonction: string; forme: string; ligne: number }[], exceptions: Exception[]): string[] {
  const compte = new Map<string, number[]>();
  for (const o of occurrences) compte.set(cle(o), [...(compte.get(cle(o)) ?? []), o.ligne]);
  const ecarts: string[] = [];
  for (const [k, lignes] of compte) {
    const e = exceptions.find((x) => cle(x) === k);
    if (!e) ecarts.push(`${k} (ligne ${lignes.join(", ")})`);
    else if (lignes.length !== e.nombre) ecarts.push(`${k} : ${lignes.length} occurrence(s) pour ${e.nombre} admise(s) (ligne ${lignes.join(", ")})`);
  }
  return ecarts;
}

/** Chaque exception existe encore, exactement autant de fois, et sa preuve figure dans le code. */
function exceptionsEncoreVraies(occurrences: { fichier: string; fonction: string; forme: string }[], exceptions: Exception[]) {
  for (const e of exceptions) {
    const n = occurrences.filter((o) => cle(o) === cle(e)).length;
    expect(n, `${cle(e)} : ${n} occurrence(s), l'exception en admet ${e.nombre} (la retirer ou la corriger)`).toBe(e.nombre);
    expect(lire(e.preuve[0]), `${cle(e)} : preuve absente de ${e.preuve[0]}`).toContain(e.preuve[1]);
  }
}

// ── 1. Le choix de la racine ───────────────────────────────────────────────────────────────────────────────────

/** D'où l'identifiant `estProprietaire` tient-il sa valeur ? null : d'aucune source admise. */
function sourceDuDrapeau(id: ts.Identifier): "garde" | "rôle de la garde" | "propriété" | null {
  const d = declarationDe(id);
  if (luDeLaGarde(d, "estProprietaire")) return "garde";
  if (d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.name.text === "estProprietaire") {
    const gauche = comparaisonAuProprietaireDirect(d.initializer);
    if (gauche && ts.isIdentifier(gauche) && gauche.text === "role" && luDeLaGarde(declarationDe(gauche), "role")) return "rôle de la garde";
  }
  // Propriété d'un composant : sans défaut, ou « agence » (false) par défaut — et chaque parent la transmet (point 5).
  if (proprieteDeComposant(d, "estProprietaire") && (!d.initializer || d.initializer.kind === ts.SyntaxKind.FalseKeyword)) return "propriété";
  return null;
}

const estLeDrapeau = (a: ts.Expression | undefined): a is ts.Identifier => Boolean(a && ts.isIdentifier(a) && a.text === "estProprietaire");

/** Les appels de choix des écrans, avec l'argument qui choisit. */
const appelsDeChoix = tousLesEcrans.flatMap((fichier) =>
  noeuds(arbre(fichier))
    .filter((n): n is ts.CallExpression => ts.isCallExpression(n) && (nomAppele(n) ?? "") in ARGUMENT_DU_CHOIX)
    .map((c) => ({ fichier, fonction: fonctionEnglobante(c), forme: forme(c), ligne: ligne(c), argument: c.arguments[ARGUMENT_DU_CHOIX[nomAppele(c)!]] })));

/**
 * Les seuls écarts admis à « exactement estProprietaire », et pourquoi. `preuve` : le fichier et le texte qui montrent
 * que la valeur est la bonne (écran réservé au propriétaire direct, défaut d'une propriété que l'appelant fournit…).
 */
const ECARTS_DU_CHOIX: Exception[] = [
  {
    fichier: "src/app/agence/[orgId]/accueil-proprietaire.tsx", fonction: "AccueilProprietaire", forme: "const base = baseEspace(orgId, true)", nombre: 1,
    raison: "accueil servi au seul propriétaire direct",
    preuve: ["src/app/agence/[orgId]/page.tsx", "if (estProprietaire) {\n    return (\n      <AccueilProprietaire"],
  },
  {
    fichier: "src/app/agence/[orgId]/articles-accueil.tsx", fonction: "ArticlesAccueil", forme: "const base = baseEspace(orgId, true)", nombre: 1,
    raison: "ancien encart propriétaire désormais sans appelant ; le test dédié ci-dessous interdit sa réintroduction implicite dans un écran partagé",
    preuve: ["src/app/agence/[orgId]/articles-accueil.tsx", "cet encart n'existe que dans l'accueil du propriétaire direct"],
  },
  {
    fichier: "src/components/bouton-assistance.tsx", fonction: "LienAssistance", forme: 'const chemin = cheminPourProfil(cheminInterne, racine === "/espace")', nombre: 1,
    raison: "l'aide lit le contexte fourni par le layout pour conserver la même adresse avant et après hydratation ; le profil n'est pas imposé",
    preuve: ["src/components/bouton-assistance.tsx", "const racine = useRacineEspace();"],
  },
  {
    fichier: "src/app/agence/[orgId]/artisans/carnet-proprietaire.tsx", fonction: "CarnetProprietaire", forme: "const base = baseEspace(orgId, true)", nombre: 1,
    raison: "carnet d’invitations rendu au seul propriétaire titulaire, hors consultation superadmin",
    preuve: ["src/app/agence/[orgId]/artisans/page.tsx", 'if (bailleurDirect && !traverseeLectureSeule) return <CarnetProprietaire orgId={orgId} />;'],
  },
  {
    fichier: "src/components/page-finances.tsx", fonction: "PageFinances", forme: "const base = baseEspace(orgId, true)", nombre: 1,
    raison: "« Finances » n'existe que chez le propriétaire direct",
    preuve: ["src/app/agence/[orgId]/loyers/page.tsx", "if (estProprietaire) return <PageFinances"],
  },
  {
    fichier: "src/components/recapitulatif-fiscal.tsx", fonction: "RecapitulatifFiscal", forme: "const base = baseEspace(orgId, true)", nombre: 1,
    raison: "l'aide à la déclaration n'existe que chez le propriétaire direct",
    preuve: ["src/components/recapitulatif-fiscal.tsx", "if (!estProprietaire) notFound();"],
  },
  {
    // Le DÉFAUT de la propriété `base` de ConsultationOuverte, et lui seul : le `const base` de VoletArtisan, dans le
    // même fichier, reste soumis à la règle (contre-relecture du 15/10, mutation X34).
    fichier: "src/app/agence/[orgId]/incidents/volet-artisan.tsx", fonction: "ConsultationOuverte", forme: "paramètre base = baseEspace(orgId, false)", nombre: 1,
    raison: "défaut de la propriété `base` de ConsultationOuverte (agence), que l'appelant fournit",
    preuve: ["src/app/agence/[orgId]/incidents/volet-artisan.tsx", "<ConsultationOuverte\n          orgId={orgId}\n          base={base}"],
  },
  {
    fichier: "src/app/agence/[orgId]/incidents/factures-incident.tsx", fonction: "FacturesIncident", forme: "paramètre base=baseEspace(orgId,false)", nombre: 1,
    raison: "défaut de la propriété `base` (agence), que l'appelant fournit",
    preuve: ["src/app/agence/[orgId]/incidents/pane-incident.tsx", "<FacturesIncident orgId={orgId} incidentId={incidentId} imputation={incident.imputation} base={base} />"],
  },
  {
    fichier: "src/app/agence/[orgId]/artisans/pane-artisan.tsx", fonction: "PaneArtisan", forme: "const base = baseEspace(orgId, bailleurDirect)", nombre: 1,
    raison: "propriété transmise par l'écran Artisans, dérivée du rôle lu par la garde (point 5)",
    preuve: ["src/app/agence/[orgId]/artisans/page.tsx", 'const bailleurDirect = role === "proprietaire_direct";'],
  },
  {
    fichier: "src/components/synthese-alertes.tsx", fonction: "racineAlerte", forme: "expression racineEspace(Boolean(a?.proprietaire_direct))", nombre: 1,
    raison: "chaque alerte porte le type de SON organisation (lib/alertes.ts)",
    preuve: ["src/lib/alertes.ts", '?.type === "proprietaire_direct",'],
  },
];

describe("écrans : le choix de la racine se lit de la garde", () => {
  it("le balayage voit bien les écrans de gestion (garde-fou du test lui-même)", () => {
    const avecChoix = new Set(appelsDeChoix.map((a) => a.fichier));
    expect(avecChoix.size).toBeGreaterThan(40);
    for (const f of [
      "src/app/agence/[orgId]/parc/page.tsx", "src/app/agence/[orgId]/baux/[bailId]/page.tsx", "src/app/agence/[orgId]/incidents/page.tsx",
      "src/app/agence/[orgId]/incidents/pane-incident.tsx", "src/app/agence/[orgId]/incidents/volet-artisan.tsx",
      "src/app/agence/[orgId]/personnes/[personId]/page.tsx", "src/app/agence/[orgId]/documents/page.tsx",
      "src/app/agence/[orgId]/comptabilite/page.tsx", "src/app/agence/[orgId]/abonnement/abonnement-2026.tsx",
      "src/app/agence/[orgId]/abonnement/abonnement-historique.tsx", "src/app/agence/[orgId]/alertes/liste-alertes.tsx",
      "src/app/agence/[orgId]/loyers/page.tsx",
    ]) expect([...avecChoix], f).toContain(f);
  });

  it("chaque baseEspace / racineEspace / cheminPourProfil reçoit `estProprietaire` (ou un écart nommé : fichier, fonction, forme, nombre)", () => {
    const ecarts = confronter(appelsDeChoix.filter((a) => !estLeDrapeau(a.argument)), ECARTS_DU_CHOIX);
    expect(ecarts, "un écran choisit sa racine autrement qu'avec le drapeau de la garde").toEqual([]);
  });

  it("chaque écart admis est encore vrai, exactement autant de fois, et sa preuve figure dans le code", () => {
    exceptionsEncoreVraies(appelsDeChoix.filter((a) => !estLeDrapeau(a.argument)), ECARTS_DU_CHOIX);
  });

  it("l'ancien encart propriétaire ArticlesAccueil n'a plus d'appelant ni d'import", () => {
    const references = toutSrc.filter(f => f !== "src/app/agence/[orgId]/articles-accueil.tsx")
      .flatMap(f => noeuds(arbre(f)).filter(n => (ts.isIdentifier(n) && n.text === "ArticlesAccueil")
        || (ts.isStringLiteral(n) && n.text.includes("articles-accueil"))).map(n => `${f}:${ligne(n)}`));
    expect(references).toEqual([]);
  });

  it("l'identifiant `estProprietaire` reçu désigne la garde, le rôle qu'elle rend, ou une propriété à défaut « agence »", () => {
    const sansSource = appelsDeChoix
      .filter((a) => estLeDrapeau(a.argument) && !sourceDuDrapeau(a.argument))
      .map((a) => `${a.fichier}:${a.ligne} [${a.fonction}] ${a.forme}`);
    expect(sansSource).toEqual([]);
  });

  it("le propre `bailleurDirect` du volet Artisans est une propriété, que l'écran lit du rôle de la garde", () => {
    const appel = appelsDeChoix.find((a) => a.fichier === "src/app/agence/[orgId]/artisans/pane-artisan.tsx");
    expect(appel?.argument && ts.isIdentifier(appel.argument) && proprieteDeComposant(declarationDe(appel.argument), "bailleurDirect")).toBe(true);
  });
});

// ── 2 à 4. Ni constante, ni conversion, ni base composée d'une racine imposée ──────────────────────────────────────

const identifiants = (fichier: string, noms: RegExp) =>
  noeuds(arbre(fichier)).filter((n): n is ts.Identifier => ts.isIdentifier(n) && noms.test(n.text) && !ts.isImportSpecifier(n.parent));

/** Les seuls emplacements où une constante de racine est écrite dans un écran, hors défaut « agence » d'une propriété `racine`. */
const CONSTANTES_ADMISES: Exception[] = [
  {
    fichier: "src/components/racine-espace-contexte.tsx", fonction: "(module)", forme: "argument de createContext<string>(RACINE_AGENCE)", nombre: 1,
    raison: "valeur du contexte HORS de l'espace (aucun fournisseur) : un lien y reste redirigé, jamais cassé",
    preuve: ["src/app/agence/[orgId]/layout.tsx", "<FournisseurRacineEspace racine={racine}>"],
  },
];

/** Le défaut « agence » d'une propriété `racine` de composant : `{ racine = RACINE_AGENCE }`. */
function defautAgenceDeRacine(id: ts.Identifier): boolean {
  const p = id.parent;
  return id.text === "RACINE_AGENCE" && ts.isBindingElement(p) && p.initializer === id && proprieteDeComposant(p, "racine");
}

describe("écrans : aucune racine imposée par une constante, une conversion ou une base sans racine", () => {
  it("RACINE_AGENCE / RACINE_PROPRIETAIRE n'y servent que de défaut « agence » d'une propriété `racine` (ou à l'emplacement nommé)", () => {
    const occurrences = tousLesEcrans.flatMap((fichier) =>
      identifiants(fichier, /^RACINE_(AGENCE|PROPRIETAIRE)$/)
        .filter((id) => !defautAgenceDeRacine(id))
        .map((id) => ({ fichier, fonction: fonctionEnglobante(id), forme: forme(id), ligne: ligne(id) })));
    expect(confronter(occurrences, CONSTANTES_ADMISES), "une constante de racine choisit la racine d'un écran").toEqual([]);
    exceptionsEncoreVraies(occurrences, CONSTANTES_ADMISES);
  });

  it("aucun chemin n'y est converti après coup (versEspaceProprietaire, versRouteAgence) : la racine se choisit à la source", () => {
    const conversions = tousLesEcrans.flatMap((fichier) =>
      identifiants(fichier, /^(versEspaceProprietaire|versRouteAgence)$/).map((id) => `${fichier}:${ligne(id)} [${fonctionEnglobante(id)}] ${forme(id)}`));
    expect(conversions).toEqual([]);
  });

  it("baseDepuisRacine y reçoit la propriété `racine` du composant (défaut « agence »), jamais une constante ni rien", () => {
    const ecarts: string[] = [];
    for (const fichier of tousLesEcrans) {
      for (const id of identifiants(fichier, /^baseDepuisRacine$/)) {
        const appel = id.parent;
        const ou = `${fichier}:${ligne(id)} [${fonctionEnglobante(id)}]`;
        if (!ts.isCallExpression(appel) || appel.expression !== id) {
          ecarts.push(`${ou} baseDepuisRacine passée sans être appelée`);
          continue;
        }
        const racine = appel.arguments[1];
        // Le crochet du contexte lit la racine que le layout a posée (racine-coquille-espace.test.ts).
        if (fichier === "src/components/racine-espace-contexte.tsx" && racine && texte(racine) === "useContext(Racine)") continue;
        const d = racine && ts.isIdentifier(racine) && racine.text === "racine" ? declarationDe(racine) : undefined;
        const admise = proprieteDeComposant(d, "racine") && (!d.initializer || texte(d.initializer) === "RACINE_AGENCE");
        if (!admise) ecarts.push(`${ou} ${texte(appel)}`);
      }
    }
    expect(ecarts).toEqual([]);
  });
});

// ── 5. Chaque parent transmet le drapeau, tel que la garde l'a lu ────────────────────────────────────────────────

/** Les propriétés qui décident du profil, et dont un défaut vaut « agence ». */
const PROPRIETES_DU_PROFIL = ["estProprietaire", "racine", "bailleurDirect", "base"];

/** Pour chaque fichier, ses composants (nom → propriétés du profil OPTIONNELLES : un défaut ou un `?`). */
const composantsDuProfil = new Map<string, Map<string, string[]>>();
for (const fichier of toutSrc.filter((f) => f.endsWith(".tsx"))) {
  for (const n of noeuds(arbre(fichier))) {
    let nom: string | null = null;
    let fonction: ts.SignatureDeclaration | null = null;
    if (ts.isFunctionDeclaration(n) && n.name) [nom, fonction] = [n.name.text, n];
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      [nom, fonction] = [n.name.text, n.initializer];
    }
    const proprietes = fonction?.parameters[0];
    if (!nom || !/^[A-Z]/.test(nom) || !proprietes || !ts.isObjectBindingPattern(proprietes.name)) continue;
    const type = proprietes.type && ts.isTypeLiteralNode(proprietes.type) ? proprietes.type : null;
    const optionnelles = proprietes.name.elements
      .filter((e) => {
        const p = (e.propertyName ?? e.name).getText();
        const membre = type?.members.find((m) => m.name?.getText() === p);
        return PROPRIETES_DU_PROFIL.includes(p) && (e.initializer || (membre && ts.isPropertySignature(membre) && membre.questionToken));
      })
      .map((e) => (e.propertyName ?? e.name).getText());
    if (optionnelles.length) {
      if (!composantsDuProfil.has(fichier)) composantsDuProfil.set(fichier, new Map());
      composantsDuProfil.get(fichier)!.set(nom, optionnelles);
    }
  }
}

/** Le fichier et le nom exporté du composant qu'une balise désigne (déclaration locale, sinon import). */
function composantDeLaBalise(fichier: string, balise: string): { fichier: string; nom: string } | null {
  const source = arbre(fichier);
  for (const s of source.statements) {
    if (ts.isFunctionDeclaration(s) && s.name?.text === balise) return { fichier, nom: balise };
    if (ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === balise)) return { fichier, nom: balise };
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings)) {
      const specificateur = s.importClause.namedBindings.elements.find((e) => e.name.text === balise);
      const cible = specificateur ? resoudreImport(fichier, s.moduleSpecifier.text) : null;
      if (specificateur && cible) return { fichier: cible, nom: (specificateur.propertyName ?? specificateur.name).text };
    }
  }
  return null;
}

/** Les rendus JSX de tout src : balise, composant désigné, attributs. */
const rendus = toutSrc
  .filter((f) => f.endsWith(".tsx"))
  .flatMap((fichier) =>
    noeuds(arbre(fichier))
      .filter((n): n is ts.JsxOpeningElement | ts.JsxSelfClosingElement => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName))
      .map((el) => {
        const balise = el.tagName.getText();
        const composant = /^[A-Z]/.test(balise) ? composantDeLaBalise(fichier, balise) : null;
        return { fichier, el, balise, attendues: composant ? composantsDuProfil.get(composant.fichier)?.get(composant.nom) ?? [] : [] };
      }));

/**
 * Les rendus admis SANS la propriété, et pourquoi (fichier, fonction, forme « <Balise> sans x », nombre). Un rendu de
 * plus, ou dans une autre fonction, fait échouer le test.
 */
const OMISSIONS_ADMISES: Exception[] = [
  {
    fichier: "src/components/fenetre-lot.tsx", fonction: "FenetreLot", forme: "<OngletDocuments> sans estProprietaire", nombre: 1,
    raison: "la fenêtre historique n'est plus rendue chez le propriétaire ; celui-ci utilise SuiviLotProprietaire qui transmet explicitement vrai",
    preuve: ["src/components/fenetre-lot.tsx", "{ouvert && !estProprietaire && ("],
  },
  {
    fichier: "src/app/agence/[orgId]/alertes/liste-alertes.tsx", fonction: "ListeAlertes", forme: "<ModaleAlerte> sans racine", nombre: 1,
    raison: "`racine` n'y est imposée que HORS de l'espace (synthèse de connexion) ; dans l'espace, la fenêtre lit le contexte posé par le layout",
    preuve: ["src/app/agence/[orgId]/alertes/modale-alerte.tsx", "const racine = racineImposee ?? racineEspaceCourant;"],
  },
  {
    fichier: "src/app/agence/[orgId]/alertes/traiter-alerte.tsx", fonction: "TraiterAlerte", forme: "<ModaleAlerte> sans racine", nombre: 1,
    raison: "même fenêtre, ouverte dans l'espace (tableau de bord, cloche) : elle lit le contexte",
    preuve: ["src/app/agence/[orgId]/alertes/modale-alerte.tsx", "const racine = racineImposee ?? racineEspaceCourant;"],
  },
  {
    fichier: "src/app/agence/[orgId]/page.tsx", fonction: "PageTableauDeBord", forme: "<ParcoursDemarrage> sans estProprietaire", nombre: 1,
    raison: "tableau de bord d'AGENCE : le propriétaire direct est servi plus haut par AccueilProprietaire",
    preuve: ["src/app/agence/[orgId]/page.tsx", "if (estProprietaire) {\n    return (\n      <AccueilProprietaire"],
  },
  {
    fichier: "src/app/locataire/[orgId]/logement/page.tsx", fonction: "PageLogementLocataire", forme: "<FenetreLotProvider> sans estProprietaire", nombre: 1,
    raison: "espace LOCATAIRE : la fenêtre du lot y suit la portée « locataire » et ses adresses /locataire",
    preuve: ["src/components/fenetre-lot.tsx", "locataire ? `/locataire/${orgId}/logement#bail` : `${base}/baux/${fiche.bail_id}`"],
  },
  {
    fichier: "src/components/nav-locataire.tsx", fonction: "SidebarLocataire", forme: "<BarreBasse> sans racine", nombre: 1,
    raison: "espace LOCATAIRE, sans organisation à choisir ni aide de l'espace de gestion (la racine n'y sert pas)",
    preuve: ["src/components/barre-laterale.tsx", "{orgId && organisations.length > 1 && ("],
  },
];

const attribut = (el: ts.JsxOpeningElement | ts.JsxSelfClosingElement, nom: string) =>
  el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === nom);

/** La valeur `x` de `nom={x}` ; null pour la forme courte (`<X estProprietaire />`, vrai). */
const valeur = (a: ts.JsxAttribute): ts.Expression | null =>
  a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression ? a.initializer.expression : null;

/** `organisation.type === "proprietaire_direct"` ou `role === "proprietaire_direct"`, lus de la garde. */
function profilLuDeLaGarde(e: ts.Expression): boolean {
  const gauche = comparaisonAuProprietaireDirect(e);
  if (!gauche) return false;
  if (ts.isIdentifier(gauche) && gauche.text === "role") return luDeLaGarde(declarationDe(gauche), "role");
  return ts.isPropertyAccessExpression(gauche) && gauche.name.text === "type" && ts.isIdentifier(gauche.expression)
    && gauche.expression.text === "organisation" && luDeLaGarde(declarationDe(gauche.expression), "organisation");
}

/** La valeur transmise est-elle celle de la garde (ou la racine qui en découle) ? */
function transmissionAdmise(nom: string, e: ts.Expression | null): boolean {
  if (!e) return false;
  if (nom === "estProprietaire") return (estLeDrapeau(e) && sourceDuDrapeau(e) !== null) || profilLuDeLaGarde(e);
  if (nom === "bailleurDirect") {
    const d = ts.isIdentifier(e) && e.text === "bailleurDirect" ? declarationDe(e) : undefined;
    return Boolean(d && ts.isVariableDeclaration(d) && d.initializer && profilLuDeLaGarde(d.initializer));
  }
  if (nom === "racine") {
    // racineEspace(estProprietaire) : son argument est contrôlé par le point 1.
    if (ts.isCallExpression(e)) return nomAppele(e) === "racineEspace" && estLeDrapeau(e.arguments[0]);
    const d = ts.isIdentifier(e) && e.text === "racine" ? declarationDe(e) : undefined;
    if (proprieteDeComposant(d, "racine")) return true;
    return Boolean(d && ts.isVariableDeclaration(d) && d.initializer && ts.isCallExpression(d.initializer)
      && nomAppele(d.initializer) === "racineEspace" && estLeDrapeau(d.initializer.arguments[0]));
  }
  // base : la base de l'écran (baseEspace(orgId, estProprietaire), contrôlée par le point 1, ou celle du contexte).
  const d = ts.isIdentifier(e) && e.text === "base" ? declarationDe(e) : undefined;
  if (proprieteDeComposant(d, "base")) return true;
  return Boolean(d && ts.isVariableDeclaration(d) && d.initializer && ts.isCallExpression(d.initializer)
    && ["baseEspace", "useBaseEspace", "baseDepuisRacine"].includes(nomAppele(d.initializer) ?? ""));
}

/** Les transmissions admises hors de cette règle (forme exacte de l'attribut). */
const TRANSMISSIONS_ADMISES: Exception[] = [
  { fichier: "src/app/agence/[orgId]/baux/[bailId]/finaliser-parcours-bail.tsx", fonction: "FinaliserParcoursBail", forme: "<PointsManquantsFinalisation> racine={racine}", nombre: 1,
    raison: "la racine vient du contexte de l’espace authentifié via useRacineEspace, sans transformation",
    preuve: ["src/app/agence/[orgId]/baux/[bailId]/finaliser-parcours-bail.tsx", "racine = useRacineEspace()"] },
  {
    fichier: "src/components/actions-rapides-incident.tsx", fonction: "ActionsRapidesIncident", forme: "<FormulaireQualification> estProprietaire", nombre: 1,
    raison: "actions rapides réservées au tableau de bord du propriétaire direct ; l'agence conserve sa fiche incident",
    preuve: ["src/app/agence/[orgId]/page.tsx", "if (estProprietaire) {\n    return (\n      <AccueilProprietaire"],
  },
  {
    fichier: "src/components/fenetre-lot.tsx", fonction: "SuiviLotProprietaire", forme: "<OngletDocuments> estProprietaire", nombre: 1,
    raison: "outil de documents rendu uniquement dans la branche propriétaire de la fiche du lot",
    preuve: ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx", 'estProprietaire ? <FicheContinue'],
  },
  {
    fichier: "src/components/fenetre-lot.tsx", fonction: "SuiviLotProprietaire", forme: "<OngletComptabilite> estProprietaire", nombre: 1,
    raison: "journal du lot placé dans suiviLot, contenu de la fiche continue réservé au propriétaire ; l'agence conserve sa rubrique Résumé",
    preuve: ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx", 'estProprietaire ? <FicheContinue'],
  },
  {
    fichier: "src/app/agence/[orgId]/accueil-proprietaire.tsx", fonction: "AccueilProprietaire", forme: "<ParcoursDemarrage> estProprietaire", nombre: 1,
    raison: "accueil servi au seul propriétaire direct : vrai en dur",
    preuve: ["src/app/agence/[orgId]/page.tsx", "if (estProprietaire) {\n    return (\n      <AccueilProprietaire"],
  },
  {
    fichier: "src/components/synthese-alertes.tsx", fonction: "SyntheseAlertes", forme: "<ModaleAlerte> racine={racineAlerte(traitement)}", nombre: 1,
    raison: "la fenêtre s'ouvre HORS de l'espace : la racine suit l'organisation de l'alerte traitée (point 1, racineAlerte)",
    preuve: ["src/components/synthese-alertes.tsx", "const racineAlerte = (a: Pick<AlerteSynthese, \"proprietaire_direct\"> | undefined) => racineEspace(Boolean(a?.proprietaire_direct));"],
  },
];

describe("chaque parent transmet le drapeau ou la racine, tels que la garde les a lus", () => {
  it("les composants réservés au propriétaire gardent exactement leurs appelants dédiés", () => {
    const attendus = [
      ["ActionsRapidesIncident", "src/app/agence/[orgId]/accueil-proprietaire.tsx", "listeDemandes", 1],
      ["RappelsLoyersInteractifs", "src/components/rappels-loyers.tsx", "RappelsLoyers", 1],
      ["SelecteurPatrimoine", "src/app/agence/[orgId]/layout.tsx", "LayoutAgence", 1],
      ["SuiviLotProprietaire", "src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx", "PageLot", 3],
      ["FenetreLot", "src/components/fenetre-lot.tsx", "FenetreLotProvider", 1],
    ] as const;
    for (const [balise, fichier, fonction, nombre] of attendus) {
      const parents = rendus.filter(r => r.balise === balise).map(r => `${r.fichier} › ${fonctionEnglobante(r.el)}`);
      expect(parents, balise).toEqual(Array.from({ length: nombre }, () => `${fichier} › ${fonction}`));
    }
    expect(rendus.filter(r => r.balise === "RappelsLoyers").map(r => `${r.fichier} › ${fonctionEnglobante(r.el)}`).sort()).toEqual([
      "src/app/agence/[orgId]/accueil-proprietaire.tsx › AccueilProprietaire",
      "src/app/agence/[orgId]/alertes/page.tsx › PageAlertes",
    ]);
    expect(lire("src/app/agence/[orgId]/alertes/page.tsx")).toContain("estProprietaire && !traverseeLectureSeule && verifications && <RappelsLoyers");
    expect(lire("src/app/agence/[orgId]/layout.tsx")).toContain('.eq("role", "proprietaire_direct")');
  });

  it("le balayage voit les composants concernés (garde-fou du test lui-même)", () => {
    const vus = [...composantsDuProfil.values()].flatMap((m) => [...m.keys()]);
    for (const nom of ["VoletArtisan", "ListeAlertes", "FenetreLotProvider", "FormulaireLoyers", "FormulaireCatalogue", "ConsultationOuverte", "FacturesIncident", "BarreBasse"]) {
      expect(vus, nom).toContain(nom);
    }
    expect(rendus.filter((r) => r.attendues.length).length).toBeGreaterThan(20);
  });

  it("chaque rendu d'un composant à défaut « agence » lui transmet `estProprietaire` / `racine` / `bailleurDirect` / `base`", () => {
    const omissions = rendus.flatMap((r) =>
      r.attendues
        .filter((p) => !attribut(r.el, p))
        .map((p) => ({ fichier: r.fichier, fonction: fonctionEnglobante(r.el), forme: `<${r.balise}> sans ${p}`, ligne: ligne(r.el) })));
    expect(confronter(omissions, OMISSIONS_ADMISES), "un parent ne transmet plus le profil : l'enfant retombe sur « agence »").toEqual([]);
    exceptionsEncoreVraies(omissions, OMISSIONS_ADMISES);
  });

  it("la valeur transmise est la garde (ou le type, le rôle, la racine qu'elle donne), jamais une négation ni une constante", () => {
    const ecarts = rendus.flatMap((r) =>
      PROPRIETES_DU_PROFIL.flatMap((p) => {
        const a = attribut(r.el, p);
        // `base` : seulement dans les écrans (ailleurs, la propriété homonyme n'est pas une adresse de gestion).
        if (!a || (p === "base" && !tousLesEcrans.includes(r.fichier))) return [];
        // Les attributs homonymes des balises HTML ou des composants hors profil ne sont pas visés.
        if (!r.attendues.includes(p) && !/^[A-Z]/.test(r.balise)) return [];
        if (transmissionAdmise(p, valeur(a))) return [];
        return [{ fichier: r.fichier, fonction: fonctionEnglobante(r.el), forme: `<${r.balise}> ${texte(a)}`, ligne: ligne(r.el) }];
      }));
    expect(confronter(ecarts, TRANSMISSIONS_ADMISES)).toEqual([]);
    exceptionsEncoreVraies(ecarts, TRANSMISSIONS_ADMISES);
  });

  it("une propriété `estProprietaire` vaut « agence » par défaut, une propriété `racine` vaut RACINE_AGENCE", () => {
    const ecarts: string[] = [];
    for (const fichier of toutSrc) {
      for (const n of noeuds(arbre(fichier))) {
        if (!ts.isBindingElement(n) || !n.initializer) continue;
        if (proprieteDeComposant(n, "estProprietaire") && n.initializer.kind !== ts.SyntaxKind.FalseKeyword) ecarts.push(`${fichier}:${ligne(n)} ${texte(n)}`);
        if (proprieteDeComposant(n, "racine") && texte(n.initializer) !== "RACINE_AGENCE") ecarts.push(`${fichier}:${ligne(n)} ${texte(n)}`);
      }
    }
    expect(ecarts).toEqual([]);
  });
});

// ── 6. Aucune adresse de gestion écrite en dur ───────────────────────────────────────────────────────────────────

/** Les morceaux de texte littéral d'un écran (chaînes, gabarits), hors positions de TYPE (`PageProps<"/agence/…">`). */
function litteraux(fichier: string) {
  return noeuds(arbre(fichier)).filter(
    (n): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail =>
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n))
      && !ts.isLiteralTypeNode(n.parent) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent));
}
/** L'appel qui contient le nœud est-il une revalidation (le chemin de la ROUTE, resté /agence) ? */
function dansUneRevalidation(n: ts.Node): boolean {
  for (let p = n.parent; p && !ts.isBlock(p); p = p.parent) if (ts.isCallExpression(p) && nomAppele(p) === "revalidatePath") return true;
  return false;
}

/** Les écrans réservés aux agences, qui gardent leurs adresses /agence écrites à la main (nombre exact). */
const AGENCE_EN_DUR_ADMISE: Exception[] = [
  {
    fichier: "src/app/agence/[orgId]/page.tsx", fonction: "PageTableauDeBord", forme: "adresse /agence", nombre: 16,
    raison: "tableau de bord d'AGENCE : le propriétaire direct est servi avant par AccueilProprietaire (liens-espace-proprietaire.test.ts vérifie l'ordre)",
    preuve: ["src/app/agence/[orgId]/page.tsx", "if (estProprietaire) {\n    return (\n      <AccueilProprietaire"],
  },
  {
    fichier: "src/app/agence/[orgId]/fil-activite.tsx", fonction: "FilActivite", forme: "adresse /agence", nombre: 6,
    raison: "fil d'activité d'AGENCE, rendu par ce seul tableau de bord",
    preuve: ["src/app/agence/[orgId]/page.tsx", "<FilActivite"],
  },
];

describe("écrans : aucune adresse de gestion écrite en dur", () => {
  it("aucune adresse « /espace… » (la racine vient de lib/racine-espace.ts)", () => {
    // La FAQ n'existe que chez le propriétaire direct (`if (!estProprietaire) notFound()`) : son libellé d'écran
    // par défaut nomme la route /espace, ce n'est pas un lien.
    expect(lire("src/app/agence/[orgId]/faq/page.tsx")).toContain("if (!estProprietaire) notFound();");
    const occurrences = tousLesEcrans.flatMap((fichier) =>
      litteraux(fichier).filter((n) => /\/espace\b/.test(n.text))
        .map((n) => ({ fichier, fonction: fonctionEnglobante(n), forme: `${texte(n.parent)}`, ligne: ligne(n) })));
    const admises: Exception[] = [{
      fichier: "src/app/agence/[orgId]/faq/page.tsx", fonction: "PageFaqProprietaire", forme: 'params.ecran ??= "/espace/[dossier]/faq"', nombre: 1,
      raison: "libellé d'écran de la FAQ, réservée au propriétaire direct", preuve: ["src/app/agence/[orgId]/faq/page.tsx", "if (!estProprietaire) notFound();"],
    }, {
      fichier: "src/components/bouton-assistance.tsx", fonction: "LienAssistance", forme: 'racine === "/espace"', nombre: 1,
      raison: "comparaison avec la racine du contexte pour l'hydratation, et non adresse de destination imposée",
      preuve: ["src/components/bouton-assistance.tsx", "const racine = useRacineEspace();"],
    }, {
      fichier: "src/components/rappels-loyers-interactifs.tsx", fonction: "RappelsLoyersInteractifs", forme: '`/espace/${orgId}/loyers`', nombre: 1,
      raison: "rappel de réception réservé à l'accueil propriétaire, lien vers ses finances",
      preuve: ["src/app/agence/[orgId]/accueil-proprietaire.tsx", "<RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} />"],
    }, {
      fichier: "src/components/rappels-loyers-interactifs.tsx", fonction: "ReceptionLoyer", forme: '`/espace/${orgId}`', nombre: 1,
      raison: "retour de préparation d'une relance dans le rappel de réception du seul accueil propriétaire",
      preuve: ["src/app/agence/[orgId]/accueil-proprietaire.tsx", "<RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} />"],
    }, {
      fichier: "src/components/rappels-loyers-interactifs.tsx", fonction: "ReceptionLoyer", forme: '`/espace/${orgId}/baux/${ligne.bail_id}#relances`', nombre: 1,
      raison: "suivi de la relance du loyer présenté au seul propriétaire depuis son accueil",
      preuve: ["src/app/agence/[orgId]/accueil-proprietaire.tsx", "<RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} />"],
    }, {
      fichier: "src/components/rappels-loyers-interactifs.tsx", fonction: "ReceptionLoyer", forme: '`/espace/${orgId}/baux/${ligne.bail_id}#loyers`', nombre: 1,
      raison: "loyers du bail ouverts depuis le nom du lot, dans le rappel de réception du seul propriétaire (audit du 27/10, LAT-07)",
      preuve: ["src/app/agence/[orgId]/accueil-proprietaire.tsx", "<RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} />"],
    }, {
      fichier: "src/components/rappels-loyers-interactifs.tsx", fonction: "PreparationRecommande", forme: '`/espace/${orgId}`', nombre: 1,
      raison: "retour du PDF de recommandé vers le seul accueil propriétaire qui présente ce formulaire",
      preuve: ["src/app/agence/[orgId]/accueil-proprietaire.tsx", "<RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} />"],
    }, {
      fichier: "src/components/selecteur-patrimoine.tsx", fonction: "SelecteurPatrimoine", forme: '`/espace/${o.id}`', nombre: 1,
      raison: "sélecteur propre au propriétaire ; le layout ne fournit que ses adhésions actives de propriétaire_direct",
      preuve: ["src/app/agence/[orgId]/layout.tsx", "{estProprietaire && <SelecteurPatrimoine"],
    }];
    expect(confronter(occurrences, admises)).toEqual([]);
    exceptionsEncoreVraies(occurrences, admises);
  });

  it("aucune adresse « /agence… » hors des revalidations et des écrans réservés aux agences (nombre exact)", () => {
    const occurrences = tousLesEcrans.flatMap((fichier) =>
      litteraux(fichier).filter((n) => /^\/agence(\/|$)/.test(n.text) && !dansUneRevalidation(n))
        .map((n) => ({ fichier, fonction: fonctionEnglobante(n), forme: "adresse /agence", ligne: ligne(n) })));
    expect(confronter(occurrences, AGENCE_EN_DUR_ADMISE)).toEqual([]);
    exceptionsEncoreVraies(occurrences, AGENCE_EN_DUR_ADMISE);
  });
});
