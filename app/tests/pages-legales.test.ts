/**
 * Les documents légaux — le contrat qu'on fait accepter (11/09).
 *
 * Jusqu'à cette date, la case d'inscription faisait cocher « j'accepte les
 * conditions d'utilisation », l'action serveur refusait l'inscription sans
 * elle, et le document n'existait nulle part : on faisait signer un contrat
 * introuvable. Le site, marchand et français, ne publiait par ailleurs aucune
 * mention légale — manquement pénalement sanctionné (art. 6-III de la LCEN).
 *
 * Ces tests gardent les trois propriétés qui rendent la correction durable :
 * le lien depuis la case, l'ouverture au public des routes, et le fait qu'un
 * fait d'éditeur manquant se voie au lieu de se taire.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CHAMPS_PRESTATAIRES,
  CONDITIONS_VERSION,
  PRESTATAIRES,
  cleCoordonnees,
  cleLocalisation,
  documentsIncomplets,
  confidentialiteIncomplete,
  estEntrepreneurIndividuel,
  faitsACompleter,
  faitsManquants,
  prestatairesAvecFaits,
  prestatairesIncomplets,
  reservesLegales,
} from "../src/lib/editeur";

const SRC = path.resolve(__dirname, "..", "src");
const lire = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

describe("identité de l'éditeur", () => {
  it("dit ce qu'il lui manque, en français", () => {
    const manquants = faitsManquants();
    // Aucune assertion sur la LONGUEUR : le jour où l'éditeur est renseigné,
    // la liste se vide et ce test doit continuer à passer.
    for (const m of manquants) {
      // Une phrase lisible, pas un nom de champ : ces libellés s'affichent
      // tels quels au visiteur. « le SIRET » est une phrase ; « siret » non.
      expect(m).toMatch(/^(le |la |l'|les )/);
      expect(m).toContain(" ");
    }
  });

  it("un éditeur complet ne manque de rien, et fait disparaître l'encadré", () => {
    const complet = {
      denomination: "Gerimmo SAS",
      forme: "société par actions simplifiée",
      capital: "10 000 €",
      siege: "1 rue de la Paix, 75002 Paris",
      rcs: "Paris 000 000 000",
      siret: "00000000000000",
      tvaIntracommunautaire: null,
      directeurPublication: "Une personne",
      email: "contact@exemple.fr",
      telephone: "01 00 00 00 00",
      mediateurNom: "Un médiateur",
      mediateurAdresse: "1 rue Exemple, Paris",
      mediateurSite: "https://example.test/mediateur",
    };
    expect(faitsManquants(complet)).toEqual([]);
    expect(documentsIncomplets(complet)).toBe(false);
  });

  it("un seul fait retiré suffit à rouvrir l'encadré", () => {
    const presque = {
      denomination: "Gerimmo SAS",
      forme: "SAS",
      capital: null,
      siege: "1 rue de la Paix, 75002 Paris",
      rcs: "Paris 000 000 000",
      siret: "00000000000000",
      tvaIntracommunautaire: null,
      directeurPublication: "Une personne",
      email: "contact@exemple.fr",
      telephone: "01 00 00 00 00",
      mediateurNom: "Médiateur Exemple",
      mediateurAdresse: "1 rue Exemple, Paris",
      mediateurSite: "https://example.test/mediateur",
    };
    expect(documentsIncomplets(presque)).toBe(false);
    expect(documentsIncomplets({ ...presque, telephone: null })).toBe(true);
    expect(faitsManquants({ ...presque, telephone: null })).toEqual(["le téléphone de contact"]);
  });

  // Décision du dirigeant du 23/10/2026 : le médiateur se complète plus tard,
  // sans encadré ni blocage ; la console le rappelle (faitsACompleter).
  it("le médiateur manquant ne rouvre pas l'encadré mais reste à compléter", () => {
    const sansMediateur = {
      denomination: "Gerimmo SAS", forme: "SAS", capital: null, siege: "1 rue de la Paix, 75002 Paris",
      rcs: "Paris 000 000 000", siret: "00000000000000", tvaIntracommunautaire: null,
      directeurPublication: "Une personne", email: "contact@exemple.fr", telephone: "01 00 00 00 00",
      mediateurNom: null, mediateurAdresse: null, mediateurSite: null,
    };
    expect(documentsIncomplets(sansMediateur)).toBe(false);
    expect(faitsManquants(sansMediateur)).toEqual([]);
    expect(faitsACompleter(sansMediateur)).toEqual([
      "le médiateur de la consommation", "l'adresse du médiateur", "le site du médiateur",
    ]);
    expect(faitsACompleter({ ...sansMediateur, mediateurNom: "M", mediateurAdresse: "A", mediateurSite: "S" })).toEqual([]);
  });

  it("la version des conditions est datée et comparable", () => {
    // Elle voyage dans les métadonnées du compte à l'inscription : elle doit
    // rester triable pour savoir quelle version un compte a acceptée.
    expect(CONDITIONS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("le contrat est lisible avant d'être accepté", () => {
  it("la case de finalisation d'inscription après preuve e-mail renvoie vers les conditions", () => {
    const src = lire("app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe.tsx");
    // Le lien vit DANS le libellé de la case : c'est là qu'on lit ce qu'on
    // accepte, pas dans un pied de page.
    const label = src.slice(src.indexOf('name="cgu"'), src.indexOf('name="cgu"') + 1400);
    expect(label).toContain('href="/conditions"');
  });

  it("les trois pages légales sont ouvertes au public", () => {
    const proxy = fs.readFileSync(path.join(SRC, "proxy.ts"), "utf8");
    const liste = proxy.slice(proxy.indexOf("PUBLIC_PATHS"), proxy.indexOf("REDIRECT_SI_CONNECTE"));
    for (const route of ["/conditions", "/mentions-legales", "/confidentialite"]) {
      expect(liste).toContain(`"${route}"`);
    }
  });

  it("l'inscription enregistre QUELLE version a été acceptée", () => {
    // Sans cela, l'éditeur ne peut pas prouver le contenu du contrat le jour
    // de sa formation — alors que l'article 16 se réserve de le modifier.
    const auth = lire("app/actions/auth.ts");
    expect(auth).toContain("cgu_version: CONDITIONS_VERSION");
    expect(auth).toContain("cgu_acceptee_le");
  });
});

describe("les pages légales ne promettent que ce qui existe", () => {
  it("l'article de réversibilité n'affirme pas les exports absents", () => {
    const cgu = lire("app/conditions/page.tsx");
    const article = cgu.slice(cgu.indexOf('titre="9. Réversibilité"'), cgu.indexOf('titre="10.'));
    // Le journal s'exporte (route /comptabilite/export) : l'article peut le dire.
    expect(article).toContain("journal de gestion");
    // Les autres exports et l'accès après suspension n'existent pas : aucun
    // engagement contractuel ne doit les présenter comme disponibles.
    expect(article).not.toContain("archive documentaire indexée");
    expect(article).not.toContain("export du référentiel");
    expect(article).not.toContain("accès en lecture seule après suspension");
  });

  it("la route d'export citée par l'article 9 existe vraiment", () => {
    const route = path.join(SRC, "app/agence/[orgId]/comptabilite/export/route.ts");
    expect(fs.existsSync(route)).toBe(true);
  });
});

// Relevé du 29/09 : des conditions d'utilisation qui portaient aussi la vente,
// des prix « TTC » et « HT » sous un régime de franchise, une résiliation
// « sans préavis » contredite par l'article 8.6, une conservation « à venir »
// alors que l'accueil promettait que rien n'est supprimé.
describe("conditions générales d'utilisation et de vente (29/09)", () => {
  const cgu = lire("app/conditions/page.tsx");

  it("portent leur vrai nom, partout où on les nomme", () => {
    expect(cgu).toContain('titre="Conditions générales d\'utilisation et de vente"');
    expect(lire("app/inscription/formulaire-inscription.tsx")).toContain("conditions générales d&apos;utilisation et de vente");
    expect(lire("app/artisan/inscription/formulaire-compte.tsx")).toContain("conditions générales d&apos;utilisation et de vente");
    expect(lire("app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe.tsx")).toContain("conditions générales d&apos;utilisation et de vente");
    expect(lire("components/chrome-public.tsx")).toContain('["/conditions", "Conditions générales"]');
  });

  it("disent la même chose de la résiliation aux articles 8.6 et 15", () => {
    expect(cgu).not.toContain("sans\n          frais ni préavis");
    expect(cgu).not.toMatch(/sans\s+frais\s+ni\s+préavis/);
    const art15 = cgu.slice(cgu.indexOf('titre="15.'), cgu.indexOf('titre="16.'));
    expect(art15).toContain("prochaine échéance");
  });

  it("prévoient l'information avant reconduction de l'annuel (art. L. 215-1)", () => {
    expect(cgu).toContain("L. 215-1");
    expect(cgu).toMatch(/au plus tôt trois mois et au plus tard\s+un mois avant le terme/);
  });

  it("n'annoncent pas de prix TTC ou HT sous la franchise en base", () => {
    expect(cgu).toContain('{FRANCHISE ? "" : ", prix toutes taxes comprises"}');
    expect(cgu).toContain('{FRANCHISE ? "" : " hors taxes"}');
  });

  it("arrêtent conservation, disponibilité, plafond et mise en demeure", () => {
    for (const cle of ["conservation", "disponibilite", "plafond", "delaiMiseEnDemeure"]) {
      expect(cgu).not.toMatch(new RegExp(`\\n  ${cle}: null,`));
    }
    expect(cgu).toContain("jamais supprimées automatiquement");
    expect(cgu).toContain("dix ans");
    expect(cgu).toContain("douze mois précédant le fait générateur");
    expect(cgu).toContain('delaiMiseEnDemeure: "trente jours"');
    // La réversibilité ne promet plus une suppression au terme d'un délai.
    const art9 = cgu.slice(cgu.indexOf('titre="9. Réversibilité"'), cgu.indexOf('titre="10.'));
    expect(art9).not.toContain("supprimées ou anonymisées");
  });

  it("portent l'annexe « article 28 » avec ses clauses obligatoires", () => {
    const annexe = cgu.slice(cgu.indexOf("Annexe — Traitement de données pour le compte du Client"));
    for (const clause of [
      "Instructions documentées",
      "Confidentialité",
      "Sécurité",
      "Sous-traitants ultérieurs",
      "Droits des personnes",
      "analyse d&apos;impact",
      "Violation de données",
      "Fin du contrat",
      "Information et audit",
    ]) {
      expect(annexe).toContain(clause);
    }
    // Les sous-traitants sont ceux des autres pages légales, pas une liste recopiée : la même liste fusionnée
    // avec les faits saisis (19/10), passée au composant.
    expect(annexe).toMatch(/<TableauPrestataires prestataires=\{prestataires\} \/>/);
  });

  it("« rien n'est supprimé automatiquement » se dit de la même façon partout", () => {
    for (const fichier of ["app/page.tsx", "app/tarifs/page.tsx"]) {
      const texte = lire(fichier).replace(/&apos;/g, "'");
      expect(texte).toMatch(/rien n'est supprimé automatiquement du fait de l'arrêt/i);
      expect(texte).toContain("tant que le compte existe");
    }
  });
});

describe("confidentialité (29/09)", () => {
  const page = lire("app/confidentialite/page.tsx");

  it("donne la base légale de chaque traitement", () => {
    for (const base of ["Exécution du contrat", "obligation légale", "Intérêt légitime", "consentement"]) {
      expect(page).toContain(base);
    }
  });

  it("dit comment les transferts hors UE sont encadrés, sans certifier personne", () => {
    expect(page).toContain("clauses contractuelles types de la");
    expect(page).toContain("Data Privacy Framework UE–États-Unis, selon le prestataire");
    expect(page).toContain("GitHub Actions");
    expect(page).not.toMatch(/hébergées <b className="font-semibold">dans\s+l&apos;Union/);
  });

  it("conserve les factures dix ans et la preuve d'acceptation le temps du contrat plus cinq ans", () => {
    expect(page).toContain("10 ans (obligation légale)");
    expect(page).toContain("Durée du contrat, puis 5 ans");
  });

  it("n'envoie plus exercer ses droits par le formulaire de devis", () => {
    const droits = page.slice(page.indexOf('titre="Vos droits"'));
    expect(droits).not.toContain("OuNousEcrire");
    expect(droits).toContain('href="/compte/donnees"');
    // L'adresse de l'éditeur dès qu'elle est fournie ; sa réserve, sinon.
    expect(droits).toContain("adresse de contact de l'éditeur");
  });

  it("est annoncée au moment de l'inscription", () => {
    const formulaire = lire("app/inscription/formulaire-inscription.tsx");
    const avantBouton = formulaire.slice(0, formulaire.indexOf("<BoutonEnvoi"));
    expect(avantBouton).toContain('href="/confidentialite"');
  });
});

// 19/10 : la localisation de la Base Adresse Nationale et les coordonnées de chaque prestataire étaient figées à vide
// dans le code (`localisation: null`, `COORDONNEES_PRESTATAIRES = null`) : l'encadré « Document en cours de
// finalisation » restait affiché même une fois les treize faits d'éditeur saisis, et l'encadré renvoyait toujours au
// formulaire de l'accueil (`courrielDeContact()` sans argument lisait la constante, jamais la base). Ces faits se
// saisissent désormais dans /admin/parametres, par les mêmes clés JSON que l'identité.
describe("prestataires saisissables depuis les paramètres (19/10)", () => {
  const ban = PRESTATAIRES.find((p) => p.cle === "ban")!;
  const supabase = PRESTATAIRES.find((p) => p.cle === "supabase")!;
  /** Les treize faits d'éditeur, fournis (valeurs fictives). */
  const EDITEUR_COMPLET: Record<string, string | null> = {
    denomination: "Éditeur fictif",
    forme: "société par actions simplifiée",
    capital: null,
    siege: "1 rue Fictive, 75000 Paris",
    rcs: "Paris 000 000 000",
    siret: "00000000000000",
    tvaIntracommunautaire: null,
    directeurPublication: "Une personne",
    email: "contact@example.test",
    telephone: "01 00 00 00 00",
    mediateurNom: "Un médiateur",
    mediateurAdresse: "1 rue Exemple, Paris",
    mediateurSite: "https://example.test/mediateur",
  };
  /** La localisation de la BAN et les coordonnées des onze prestataires, fournies (valeurs fictives). */
  const prestatairesComplets = (sauf?: string): Record<string, string | null> => {
    const v: Record<string, string | null> = { [cleLocalisation(ban)]: "Localisation de test" };
    for (const p of PRESTATAIRES) v[cleCoordonnees(p)] = p.cle === sauf ? null : `Coordonnées fictives de ${p.nom}`;
    return v;
  };

  it("sans saisie, chaque localisation fixée dans le code est gardée et la Base Adresse Nationale reste à venir", () => {
    const liste = prestatairesAvecFaits({});
    expect(liste.map((p) => p.nom)).toEqual(PRESTATAIRES.map((p) => p.nom));
    for (const p of liste) {
      expect(p.localisation).toBe(PRESTATAIRES.find((q) => q.cle === p.cle)!.localisation);
      expect(p.coordonnees).toBeNull();
    }
    expect(liste.find((p) => p.cle === "ban")!.localisation).toBeNull();
    expect(prestatairesIncomplets(liste)).toBe(true);
  });

  it("la saisie fournit la localisation manquante et les coordonnées, prestataire par prestataire", () => {
    const liste = prestatairesAvecFaits({
      [cleLocalisation(ban)]: "Localisation de test",
      [cleCoordonnees(supabase)]: "Coordonnées fictives\nligne 2",
    });
    expect(liste.find((p) => p.cle === "ban")!.localisation).toBe("Localisation de test");
    expect(liste.find((p) => p.cle === "supabase")!.coordonnees).toBe("Coordonnées fictives\nligne 2");
    for (const p of liste.filter((p) => p.cle !== "supabase")) expect(p.coordonnees).toBeNull();
    // La page confidentialité n'affiche pas les coordonnées : sa réserve ne porte que sur les localisations.
    expect(prestatairesIncomplets(liste)).toBe(false);
    // Les mentions légales les affichent : leur réserve tient tant qu'une coordonnée manque.
    expect(prestatairesIncomplets(liste, true)).toBe(true);
  });

  it("la saisie ne peut pas écraser une localisation établie par le code", () => {
    const liste = prestatairesAvecFaits({ localisationSupabase: "ailleurs" });
    expect(liste.find((p) => p.cle === "supabase")!.localisation).toBe(supabase.localisation);
    expect(CHAMPS_PRESTATAIRES).not.toHaveProperty("localisationSupabase");
    expect(CHAMPS_PRESTATAIRES).toHaveProperty(cleLocalisation(ban));
  });

  it("la réserve des mentions légales ne se lève qu'avec toutes les coordonnées et la localisation de la BAN", () => {
    expect(prestatairesIncomplets(prestatairesAvecFaits(prestatairesComplets()), true)).toBe(false);
    const presque = prestatairesAvecFaits(prestatairesComplets("supabase"));
    expect(prestatairesIncomplets(presque, true)).toBe(true);
    expect(prestatairesIncomplets(presque)).toBe(false);
    const sansBan = prestatairesAvecFaits({ ...prestatairesComplets(), [cleLocalisation(ban)]: null });
    expect(prestatairesIncomplets(sansBan)).toBe(true);
  });

  it("les réserves légales se lisent telles quelles : faits d'éditeur, médiateur à compléter, puis prestataires", () => {
    const reserves = reservesLegales({});
    const faits = [...faitsManquants({}), ...faitsACompleter({})];
    expect(reserves.slice(0, faits.length)).toEqual(faits);
    expect(reserves.slice(faits.length)).toEqual([
      `la localisation de ${ban.nom}`,
      `les coordonnées de ${PRESTATAIRES.length} prestataires sur ${PRESTATAIRES.length} (${PRESTATAIRES.map((p) => p.nom).join(", ")})`,
    ]);
    for (const r of reserves) expect(r).toMatch(/^(le |la |l'|les )/);
    // Une seule coordonnée manquante : nommée, au singulier.
    expect(reservesLegales({ ...EDITEUR_COMPLET, ...prestatairesComplets("vercel") })).toEqual([
      `les coordonnées de 1 prestataire sur ${PRESTATAIRES.length} (Vercel)`,
    ]);
    expect(reservesLegales({ ...EDITEUR_COMPLET, ...prestatairesComplets() })).toEqual([]);
  });

  it("les pages lisent l'adresse saisie et passent les prestataires fusionnés à la coquille", () => {
    const coquille = lire("components/coquille-legale.tsx");
    // L'encadré ne lit plus la constante : il reçoit l'adresse saisie (ou null) de la page.
    expect(coquille).not.toContain("courrielDeContact()");
    expect(coquille).toContain("courriel: string | null");
    for (const page of ["app/mentions-legales/page.tsx", "app/confidentialite/page.tsx", "app/conditions/page.tsx"]) {
      const src = lire(page);
      const ouverture = src.match(/<CoquilleLegale[\s\S]*?\n\s*>/)?.[0] ?? "";
      expect(ouverture, page).toContain("courriel=");
      if (!page.includes("mentions-legales")) expect(src, page).toContain("prestataires={prestataires}");
    }
    const mentions = lire("app/mentions-legales/page.tsx");
    expect(mentions).not.toContain("COORDONNEES_PRESTATAIRES");
    expect(mentions).toContain("prestatairesAvecFaits(EDITEUR)");
    expect(mentions).toContain("prestatairesIncomplets(hebergeurs, true)");
    // La confidentialité n'affiche pas les coordonnées : réserve sur les seules localisations.
    expect(lire("app/confidentialite/page.tsx")).toContain("prestatairesIncomplets(prestataires)");
  });
});


describe("identité individuelle et réserves propres à chaque document (20/10)", () => {
  const individuel = { denomination: "Une personne", forme: "Entrepreneur individuel (EI)", siege: "1 rue Exemple", email: "contact@example.test" };
  it("la confidentialité identifie son responsable même si la médiation n’est pas encore configurée", () => {
    expect(confidentialiteIncomplete(individuel)).toBe(false);
    expect(documentsIncomplets(individuel)).toBe(true);
    for (const cle of ["denomination", "forme", "siege", "email"]) {
      expect(confidentialiteIncomplete({ ...individuel, [cle]: " " })).toBe(true);
    }
  });
  it("reconnaît une EI sans appliquer cette exception aux sociétés ou à une forme inconnue", () => {
    for (const forme of ["EI", "entrepreneur individuel (EI)", "Entreprise individuelle"]) expect(estEntrepreneurIndividuel({ forme })).toBe(true);
    for (const forme of [null, "", "SAS", "EIRL société"]) expect(estEntrepreneurIndividuel({ forme })).toBe(false);
  });
  it("garde le téléphone dans les réserves et les coordonnées de médiation à compléter", () => {
    const manquants = faitsManquants({});
    expect(manquants).toContain("le téléphone de contact");
    expect(manquants).not.toContain("l'adresse du médiateur");
    const aCompleter = faitsACompleter({});
    expect(aCompleter).toContain("l'adresse du médiateur");
    expect(aCompleter).toContain("le site du médiateur");
  });
  it("décrit les copies locales et ne promet ni confidentialité absolue ni prescription uniforme", () => {
    const page = lire("app/confidentialite/page.tsx");
    expect(page).toContain("IndexedDB");
    expect(page).toContain("non encore synchronisés");
    expect(page).toContain("doute raisonnable");
    expect(page).not.toContain("même par erreur de programme");
    expect(page).not.toContain("Les cinq ans correspondent à la prescription");
    expect(page).not.toContain("aucune donnée des lecteurs n&apos;est collectée");
  });
});
