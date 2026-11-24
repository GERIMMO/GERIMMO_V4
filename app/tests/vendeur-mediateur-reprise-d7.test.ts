/**
 * REPRISE DU LOT D7 (24/11/2026) — vendeur des abonnements et médiateur de la consommation.
 *
 * Décision de pilotage appliquée ici. Le recueil de textes fourni par le dirigeant contient les articles L. 612-1 et
 * L. 616-1 du code de la consommation : le professionnel garantit au consommateur le recours effectif à une médiation
 * et lui en communique les coordonnées. La décision « ouvrir les ventes sans médiateur » du premier commit D7 est donc
 * reprise de la façon la plus prudente et réversible :
 *  a) PAR DÉFAUT, la première souscription d'un particulier reste fermée tant qu'aucun médiateur n'est saisi ; un
 *     professionnel n'est pas bloqué par le médiateur ;
 *  b) le super admin peut décider d'ouvrir quand même la vente au particulier, sans médiateur — SECONDE REPRISE du
 *     24/11/2026 (relecture T4R-02) : par une décision à part, datée, et non plus par le bouton « Lever le blocage »,
 *     dont une levée enregistrée avant le lot aurait ouvert cette vente d'office ;
 *  c) le vendeur incomplet bloque toujours, levée ou non, et pour TOUTE première souscription, agence comprise ;
 *  d) aucun médiateur n'est jamais inventé.
 *
 * Ce fichier prouve, sans base ni réseau :
 *  1. la règle de la garde, case par case (particulier ou professionnel, médiateur saisi ou non, blocage actif ou levé,
 *     vendeur complet ou non, mention « EI ») ;
 *  2. le type de vendeur CHOISI (seconde reprise, relectures T4R-03 et T4R-04 : il n'est plus deviné dans la forme
 *     juridique, une variante de forme par test) et la mention « EI », une variante par test (relecture D7R-05 ; code
 *     de commerce, article R. 526-27 : « précédé ou suivi immédiatement ») ;
 *  3. l'ouverture des ventes en console : vendeur exigé, mention « EI » rejouée, et ce que dit le message ;
 *  4. que le texte des conditions générales ne dépend que de ce que `identiteDesConditions` retient (relecture
 *     D7R-02) : saisir le médiateur ou retoucher le téléphone ne change pas le contrat, donc ne referme pas les ventes.
 *
 * AUCUNE DONNÉE RÉELLE : un vendeur fictif.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MANQUE_MENTION_EI,
  MANQUE_TYPE_VENDEUR,
  defautsVendeur,
  estEntrepreneurIndividuel,
  faitsManquants,
  identiteDesConditions,
  mediateurDesigne,
  porteLaMentionEI,
  sirenEtSiret,
} from "../src/lib/editeur";
import { MOTIF_IDENTITE_EDITEUR, MOTIF_IDENTITE_EDITEUR_ESSAI, MOTIF_MEDIATEUR, motifIdentiteEditeur } from "../src/lib/garde-souscription";
import { AIDES_EDITEUR, CHAMPS_EDITEUR, CHOIX_TYPE_VENDEUR, validerIdentite } from "../src/lib/identite-editeur";
import { extraireTexteContractuel } from "../src/lib/conditions-versions";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  identite: { editeur: {} as Record<string, string | null>, indisponible: false },
  rpc: vi.fn(), update: vi.fn(), eq: vi.fn(), saved: vi.fn(),
}));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => mocks.identite }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  const q = { update: mocks.update, eq: mocks.eq, select: () => q, maybeSingle: mocks.saved };
  mocks.update.mockReturnValue(q); mocks.eq.mockReturnValue(q);
  return { rpc: mocks.rpc, from: () => q };
} }));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import { reglerBlocageSouscription, reglerOuvertureVentes } from "../src/app/actions/reglage-souscription";
import Conditions from "../src/app/conditions/page";

/** Le vendeur fictif : entrepreneur individuel, nom suivi de « EI », sans médiateur. */
const VENDEUR: Record<string, string | null> = {
  denomination: "MARTIN Camille EI",
  // Seconde reprise (T4R-03) : le type de vendeur est choisi ; la forme juridique n'est plus qu'un texte affiché.
  typeVendeur: "entrepreneur_individuel",
  forme: "Entrepreneur individuel (nom commercial EXEMPLEXPERT)",
  capital: null,
  siege: "1 rue de l'Exemple, 75000 Paris",
  rcs: "RNE 000 000 000",
  siret: "00000000000018",
  tvaIntracommunautaire: null,
  directeurPublication: "MARTIN Camille",
  email: "contact@example.test",
  telephone: "01 00 00 00 00",
  mediateurNom: null,
  mediateurAdresse: null,
  mediateurSite: null,
};
const MEDIATEUR = { mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, 75000 Paris", mediateurSite: "https://example.test/mediation" };
const REQUIS = ["denomination", "forme", "siege", "rcs", "siret", "directeurPublication", "email", "telephone"] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identite = { editeur: { ...VENDEUR }, indisponible: false };
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.saved.mockResolvedValue({ data: { revision: 5 }, error: null });
});

describe("1. la garde : particulier sans médiateur fermé par défaut, ouvert sur décision distincte ; professionnel ouvert ; sans vendeur, fermé dans tous les cas", () => {
  const particulier = { enEssai: false, premiereSouscription: true, nouvelleSouscriptionParticulier: true };
  const professionnel = { enEssai: false, premiereSouscription: true, nouvelleSouscriptionParticulier: false };
  const hausse = { enEssai: false };

  it("particulier, vendeur complet, sans médiateur : fermé par défaut (blocage actif, absent ou illisible)", () => {
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif: true })).toBe(MOTIF_MEDIATEUR);
    // Le réglage non lu vaut « actif » : fermeture par défaut.
    expect(motifIdentiteEditeur(VENDEUR, particulier)).toBe(MOTIF_MEDIATEUR);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, enEssai: true, blocageIdentiteActif: true })).toBe(`${MOTIF_MEDIATEUR} Votre essai continue.`);
  });

  // Seconde reprise (relecture T4R-02). Ce test affirmait « blocage levé par le super admin : ouvert ». Une levée
  // enregistrée AVANT le lot (elle ne visait alors que les hausses) aurait donc ouvert d'office, au déploiement, la
  // vente aux particuliers sans médiateur. La levée seule ne l'ouvre plus.
  it("T4R-02 — particulier, vendeur complet, sans médiateur, blocage levé SEUL : toujours fermé", () => {
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif: false })).toBe(MOTIF_MEDIATEUR);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif: false, venteSansMediateurDecidee: false })).toBe(MOTIF_MEDIATEUR);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, enEssai: true, blocageIdentiteActif: false })).toBe(`${MOTIF_MEDIATEUR} Votre essai continue.`);
  });

  it("T4R-02 — particulier, vendeur complet, sans médiateur, décision distincte de vendre sans médiateur : ouvert, blocage actif ou levé", () => {
    for (const blocageIdentiteActif of [true, false, undefined]) {
      expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif, venteSansMediateurDecidee: true })).toBeNull();
    }
    // Seule la valeur `true` vaut décision : rien d'autre n'ouvre.
    for (const autre of [undefined, false, "oui", 1, "2026-11-25"]) {
      expect(motifIdentiteEditeur(VENDEUR, { ...particulier, venteSansMediateurDecidee: autre as unknown as boolean }), String(autre)).toBe(MOTIF_MEDIATEUR);
    }
  });

  it("T4R-02 — la décision de vendre sans médiateur n'ouvre rien si le vendeur est incomplet", () => {
    for (const client of [particulier, professionnel]) {
      expect(motifIdentiteEditeur({}, { ...client, blocageIdentiteActif: false, venteSansMediateurDecidee: true })).toBe(MOTIF_IDENTITE_EDITEUR);
      expect(motifIdentiteEditeur({ ...VENDEUR, typeVendeur: null }, { ...client, venteSansMediateurDecidee: true })).toBe(MOTIF_IDENTITE_EDITEUR);
    }
  });

  it("particulier, vendeur complet, médiateur saisi : ouvert, blocage actif ou levé, décision prise ou non", () => {
    for (const blocageIdentiteActif of [true, false]) {
      for (const venteSansMediateurDecidee of [true, false]) {
        expect(motifIdentiteEditeur({ ...VENDEUR, ...MEDIATEUR }, { ...particulier, blocageIdentiteActif, venteSansMediateurDecidee })).toBeNull();
      }
    }
  });

  it.each(Object.keys(MEDIATEUR))("particulier : un médiateur dont %s manque n'est pas désigné — fermé par défaut", (cle) => {
    const editeur = { ...VENDEUR, ...MEDIATEUR, [cle]: null };
    expect(mediateurDesigne(editeur)).toBe(false);
    expect(motifIdentiteEditeur(editeur, { ...particulier, blocageIdentiteActif: true })).toBe(MOTIF_MEDIATEUR);
    expect(motifIdentiteEditeur({ ...editeur, [cle]: "   " }, { ...particulier, blocageIdentiteActif: true })).toBe(MOTIF_MEDIATEUR);
  });

  it("professionnel, vendeur complet, sans médiateur : ouvert, blocage actif ou levé (le médiateur ne le concerne pas)", () => {
    for (const blocageIdentiteActif of [true, false]) {
      expect(motifIdentiteEditeur(VENDEUR, { ...professionnel, blocageIdentiteActif })).toBeNull();
    }
  });

  // « Vendeur incomplet : fermé dans tous les cas, agence comprise » (D7R-04).
  it.each(REQUIS)("sans %s : toute première souscription est fermée — particulier ou professionnel, médiateur saisi ou non, blocage actif ou levé", (cle) => {
    for (const client of [particulier, professionnel]) {
      for (const mediateur of [{}, MEDIATEUR]) {
        for (const blocageIdentiteActif of [true, false]) {
          const editeur = { ...VENDEUR, ...mediateur, [cle]: null };
          expect(motifIdentiteEditeur(editeur, { ...client, blocageIdentiteActif })).toBe(MOTIF_IDENTITE_EDITEUR);
          expect(motifIdentiteEditeur(editeur, { ...client, enEssai: true, blocageIdentiteActif })).toBe(MOTIF_IDENTITE_EDITEUR_ESSAI);
        }
      }
    }
  });

  it("le vendeur passe avant le médiateur : sans vendeur et sans médiateur, la phrase est celle du vendeur", () => {
    expect(motifIdentiteEditeur({}, { ...particulier, blocageIdentiteActif: true })).toBe(MOTIF_IDENTITE_EDITEUR);
  });

  it("hausse de capacité d'un client déjà abonné : le vendeur ferme si le blocage est actif, plus s'il est levé ; le médiateur ne ferme jamais une hausse", () => {
    expect(motifIdentiteEditeur({}, { ...hausse, blocageIdentiteActif: true })).toBe(MOTIF_IDENTITE_EDITEUR);
    expect(motifIdentiteEditeur({}, { ...hausse, blocageIdentiteActif: false })).toBeNull();
    expect(motifIdentiteEditeur(VENDEUR, { ...hausse, blocageIdentiteActif: true })).toBeNull();
  });

  // D7R-05 : une identité enregistrée avant le contrôle de saisie (nom sans « EI ») ne vend pas.
  it("entrepreneur individuel dont le nom ne porte pas « EI » : compté comme un vendeur incomplet, blocage actif ou levé", () => {
    const sansMention = { ...VENDEUR, ...MEDIATEUR, denomination: "MARTIN Camille" };
    expect(faitsManquants(sansMention)).toEqual([]);
    expect(defautsVendeur(sansMention)).toEqual([MANQUE_MENTION_EI]);
    for (const client of [particulier, professionnel]) {
      for (const blocageIdentiteActif of [true, false]) {
        expect(motifIdentiteEditeur(sansMention, { ...client, blocageIdentiteActif })).toBe(MOTIF_IDENTITE_EDITEUR);
      }
    }
    // Une société n'a pas à porter « EI » (seconde reprise, T4R-03 : elle se déclare par le type choisi, pas par sa forme).
    expect(defautsVendeur({ ...VENDEUR, typeVendeur: "personne_morale", denomination: "Exemple", forme: "SAS" })).toEqual([]);
    expect(defautsVendeur(VENDEUR)).toEqual([]);
  });

  // Seconde reprise (T4R-03) : sans type de vendeur choisi, on ne sait pas si « EI » est dû — le vendeur est incomplet.
  it.each([null, undefined, "", "Entrepreneur individuel", "EI", "societe", "ENTREPRENEUR_INDIVIDUEL"])("T4R-03 — type de vendeur « %s » (non choisi ou hors liste) : vendeur incomplet, toute première souscription fermée", (choix) => {
    const sansType = { ...VENDEUR, ...MEDIATEUR, typeVendeur: choix as string | null };
    expect(faitsManquants(sansType)).toEqual([]);
    expect(defautsVendeur(sansType)).toEqual([MANQUE_TYPE_VENDEUR]);
    for (const client of [particulier, professionnel]) {
      for (const blocageIdentiteActif of [true, false]) {
        expect(motifIdentiteEditeur(sansType, { ...client, blocageIdentiteActif })).toBe(MOTIF_IDENTITE_EDITEUR);
      }
    }
  });

  it("les deux phrases servies au client ne disent ni qu'un médiateur existe, ni qu'une adhésion est en cours", () => {
    expect(MOTIF_MEDIATEUR).not.toMatch(/adhésion|en cours/i);
    expect(MOTIF_IDENTITE_EDITEUR).not.toMatch(/médiateur/i);
    // Relecture T4R-08 : « les coordonnées du médiateur de la consommation de Gerimmo doivent être publiées »
    // présupposait un médiateur existant. La phrase dit qu'il reste à désigner.
    expect(MOTIF_MEDIATEUR).toBe("Le paiement en ligne n'est pas encore ouvert aux particuliers. Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription.");
    expect(MOTIF_MEDIATEUR).not.toMatch(/médiateur de la consommation de Gerimmo|du médiateur|le médiateur/i);
  });
});

// Seconde reprise du 24/11/2026 (relectures T4R-03 et T4R-04). Ce bloc faisait RECONNAÎTRE l'entrepreneur individuel
// dans le champ libre « Forme juridique », une variante par test (D7R-03). La relecture a montré que la devinette
// restait fragile dans les deux sens : « Auto-entreprise », « Artisan », « Profession libérale », « Personne physique »
// échappaient au contrôle « EI » (ventes ouvertes sans la mention), tandis que « E.I.R.L. », « SAS (ex-entreprise
// individuelle) » et « EI SAS » y tombaient (une société se voyait exiger « EI » et refuser son capital). Le type de
// vendeur se CHOISIT désormais dans une liste. Les mêmes variantes de forme sont gardées, une par test, pour prouver
// l'inverse : AUCUNE ne décide plus de rien.
describe("2. type de vendeur choisi : la forme juridique saisie ne décide de rien (T4R-03, T4R-04)", () => {
  const f = (valeurs: Record<string, string | null>) => { const d = new FormData(); for (const [k, v] of Object.entries(valeurs)) if (v) d.set(k, v); return d; };
  const FORMES = [
    // Les vingt-quatre variantes que le code reconnaissait.
    "Entrepreneur individuel", "Entrepreneur individuel (nom commercial EXEMPLEXPERT)", "Entrepreneur individuel, nom commercial X",
    "Entrepreneur individuel(X)", "entrepreneur individuel.", "ENTREPRENEUR INDIVIDUEL", "Entrepreneur  individuel",
    "Entrepreneur\u00a0individuel", "Entrepreneuse individuelle", "Entreprise individuelle", "EI", "EI, nom commercial X",
    "EI (nom commercial X)", "E.I.", "E. I.", "ei", "Micro-entrepreneur", "Micro entrepreneur", "Microentrepreneur",
    "Micro-entrepreneuse", "Micro-entreprise", "Auto-entrepreneur", "Auto-entrepreneuse", "Nom commercial X — entrepreneur individuel",
    // Celles qu'il ne reconnaissait pas (personnes physiques comprises), et celles qu'il reconnaissait à tort.
    "Auto-entreprise", "Artisan", "Profession libérale", "Personne physique", "Commerçant", "Indépendant",
    "EIRL", "E.I.R.L.", "SAS (ex-entreprise individuelle)", "EI SAS", "SARL de micro-entreprise",
    "SAS", "SARL", "SASU", "EURL", "SCI", "Société par actions simplifiée", "Association", "EIFFAGE SA",
  ];

  it.each(FORMES)("forme « %s » — type « entrepreneur individuel » : « EI » exigé avec le nom, capital refusé", (forme) => {
    const editeur = { ...VENDEUR, forme, typeVendeur: "entrepreneur_individuel" };
    expect(estEntrepreneurIndividuel(editeur)).toBe(true);
    expect(validerIdentite(f({ ...editeur, denomination: "MARTIN Camille" })).erreur).toContain("« EI »");
    expect(validerIdentite(f({ ...editeur, capital: "1 000 €" })).erreur).toContain("pas de capital social");
    expect(validerIdentite(f(editeur)).erreur).toBeUndefined();
    expect(defautsVendeur({ ...editeur, denomination: "MARTIN Camille" })).toEqual([MANQUE_MENTION_EI]);
    expect(defautsVendeur(editeur)).toEqual([]);
  });

  it.each(FORMES)("forme « %s » — type « société ou autre personne morale » : ni « EI » exigé, ni capital refusé", (forme) => {
    const editeur = { ...VENDEUR, forme, typeVendeur: "personne_morale", denomination: "Exemple" };
    expect(estEntrepreneurIndividuel(editeur)).toBe(false);
    expect(validerIdentite(f(editeur)).erreur).toBeUndefined();
    expect(validerIdentite(f({ ...editeur, capital: "1 000 €" })).erreur).toBeUndefined();
    expect(defautsVendeur(editeur)).toEqual([]);
  });

  it.each(FORMES)("forme « %s » — type non choisi : personne n'est deviné entrepreneur individuel, et le vendeur est incomplet", (forme) => {
    const editeur = { ...VENDEUR, forme, typeVendeur: null };
    expect(estEntrepreneurIndividuel(editeur)).toBe(false);
    expect(defautsVendeur(editeur)).toEqual([MANQUE_TYPE_VENDEUR]);
    expect(defautsVendeur({ ...editeur, denomination: "MARTIN Camille" })).toEqual([MANQUE_TYPE_VENDEUR]);
  });

  it("la saisie n'admet que les deux types de la liste ; un type vide s'enregistre (il reste dû, et ferme les ventes)", () => {
    for (const choix of ["Entrepreneur individuel", "EI", "societe", "personne_morale_", "ENTREPRENEUR_INDIVIDUEL", "1"]) {
      expect(validerIdentite(f({ ...VENDEUR, typeVendeur: choix })).erreur, choix).toBe("Choisissez le type de vendeur dans la liste : entrepreneur individuel, ou société ou autre personne morale.");
    }
    const sansType = validerIdentite(f({ ...VENDEUR, typeVendeur: null }));
    expect(sansType.erreur).toBeUndefined();
    expect(sansType.valeurs?.typeVendeur).toBeNull();
    expect(validerIdentite(f(VENDEUR)).valeurs?.typeVendeur).toBe("entrepreneur_individuel");
    expect(CHAMPS_EDITEUR.typeVendeur).toBe("Type de vendeur");
    expect(Object.keys(CHAMPS_EDITEUR).at(-1)).toBe("typeVendeur");
  });

  it("le formulaire propose le type dans une liste fermée (un `select`, deux choix), avant le nom", () => {
    const formulaire = readFileSync("src/app/admin/parametres/identite.tsx", "utf8");
    expect(formulaire).toContain('champs: ["typeVendeur", "denomination",');
    expect(formulaire).toContain('k === "typeVendeur"');
    expect(formulaire).toContain('<select className="champ mt-1 w-full" name={k} defaultValue={valeurs[k] ?? ""}><option value="">— À choisir —</option>{CHOIX_TYPE_VENDEUR.map(');
    expect(CHOIX_TYPE_VENDEUR).toEqual([["entrepreneur_individuel", "Entrepreneur individuel"], ["personne_morale", "Société ou autre personne morale"]]);
    // Plus aucune devinette sur la forme dans le code.
    const lib = readFileSync("src/lib/editeur.ts", "utf8");
    expect(lib).not.toMatch(/MOTS_ENTREPRENEUR_INDIVIDUEL|INITIALES_EI_EN_TETE|formeSimple/);
    expect(lib).toContain('return typeVendeur(editeur) === "entrepreneur_individuel";');
  });
});

describe("2 bis. mention « EI » accolée au nom : « précédé ou suivi immédiatement » (R. 526-27 ; D7R-05)", () => {
  it.each([
    "MARTIN Camille EI",
    "EI MARTIN Camille",
    "MARTIN Camille, EI",
    "MARTIN Camille (EI)",
    "MARTIN Camille E.I.",
    "E.I. MARTIN Camille",
    "MARTIN Camille entrepreneur individuel",
    "MARTIN Camille, entrepreneur individuel",
    "Entrepreneur individuel MARTIN Camille",
    "Entrepreneur  individuel MARTIN Camille",
    "MARTIN Camille Entrepreneuse individuelle",
    "MARTIN Camille EI — EXEMPLEXPERT",
    "EXEMPLEXPERT (MARTIN Camille EI)",
    "Jean-Pierre O'NEIL EI",
    "MARTIN Camille EI.",
    "MARTIN Camille EI",
    // Seconde reprise (relecture T4R-04) : faux refus corrigés. Un tiret ISOLÉ entre le nom et la mention n'est qu'un
    // séparateur (le premier cas était rangé parmi les refus : « pas immédiatement ») ; « E.I » sans point final ;
    // un nom d'une lettre ; les noms de famille qui sont aussi des mots de négation.
    "MARTIN Camille — EI",
    "DUPONT Jean - EI",
    "EI - DUPONT Jean",
    "DUPONT Jean E.I",
    "DUPONT Jean E. I.",
    "Y EI",
    "Jean SANS EI",
    "Marie PAS EI",
    "Sans Jean EI",
    "EI : DUPONT Jean",
  ])("« %s » porte la mention", (nom) => {
    expect(porteLaMentionEI(nom)).toBe(true);
  });

  it.each([
    ["MARTIN Camille", "aucune mention"],
    ["EI", "la mention seule, sans nom"],
    ["E.I.", "la mention seule, sans nom"],
    ["entrepreneur individuel", "la mention seule, sans nom"],
    ["EI-CONSEIL Martin", "« EI » collé à un autre mot par un trait d'union"],
    ["MARTIN-EI Camille", "« EI » collé à un autre mot par un trait d'union"],
    ["non entrepreneur individuel", "la mention niée"],
    ["MARTIN Camille non EI", "la mention niée"],
    ["MARTIN Camille-EI", "un trait d'union collé : un seul mot"],
    ["MARTIN Camille/EI", "une barre oblique collée : un seul mot"],
    ["MARTIN Camille sans EI", "la mention niée (négation en minuscules)"],
    ["MARTIN Camille pas EI", "la mention niée (négation en minuscules)"],
    ["MARTIN Camille E.I.R.L.", "un autre sigle"],
    ["- EI", "la mention seule, sans nom"],
    ["martin camille ei", "initiales en minuscules"],
    ["MARTIN Camille Ei", "initiales mal écrites"],
    ["EIRL MARTIN", "un autre sigle"],
    ["EI2 MARTIN", "un autre sigle"],
    ["MARTIN Reine", "« ei » à l'intérieur d'un mot"],
    ["MEIER Camille", "« EI » à l'intérieur d'un mot"],
    ["", "vide"],
  ])("« %s » ne la porte pas (%s)", (nom) => {
    expect(porteLaMentionEI(nom)).toBe(false);
  });

  it("limite connue, dite dans le code : rien ne prouve que le mot voisin est le nom de la personne", () => {
    expect(porteLaMentionEI("SOCIETE EI")).toBe(true);
    expect(porteLaMentionEI(null)).toBe(false);
    expect(porteLaMentionEI(undefined)).toBe(false);
  });

  it("le SIREN et le SIRET s'affichent groupés ; l'exemple du code est fictif (D7R-10)", () => {
    expect(sirenEtSiret("12345678900012")).toEqual({ siren: "123 456 789", siret: "123 456 789 00012" });
    expect(sirenEtSiret("123")).toBeNull();
    // Aucun vrai numéro du vendeur dans le code : tout ce qui a la forme d'un SIREN ou d'un SIRET écrit par groupes de
    // trois chiffres y est un exemple fictif.
    for (const fichier of ["src/lib/editeur.ts", "src/lib/identite-editeur.ts", "src/lib/garde-souscription.ts", "src/app/mentions-legales/page.tsx"]) {
      const numeros = readFileSync(fichier, "utf8").match(/\b\d{3}[ \u00a0]\d{3}[ \u00a0]\d{3}(?:[ \u00a0]\d{5})?\b/g) ?? [];
      for (const n of numeros) expect(["123 456 789", "123 456 789 00012", "000 000 000"], `${fichier} : ${n}`).toContain(n);
    }
    expect(readFileSync("src/lib/editeur.ts", "utf8")).toContain("« 123 456 789 » et « 123 456 789 00012 » (exemple fictif)");
  });
});

describe("3. console : ouverture des ventes et levée du blocage", () => {
  const ouvrir = () => { const f = new FormData(); f.set("ventes", "ouvrir"); f.set("revision", "4"); f.set("confirmation", "oui"); return f; };
  const blocage = (choix: string) => { const f = new FormData(); f.set("blocage", choix); f.set("revision", "4"); return f; };

  it("vendeur complet, sans médiateur : l'ouverture est enregistrée, et le message dit que le particulier reste fermé", async () => {
    const r = await reglerOuvertureVentes({}, ouvrir());
    expect(r.erreur).toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith({ souscriptions_payantes_ouvertes: true, revision: 5 });
    expect(r.succes).toBe(
      // Seconde reprise (T4R-02) : « sauf si vous levez le blocage des abonnements » n'est plus vrai.
      "Ouverture enregistrée. Les contrôles avant paiement s’appliquent. Aucun médiateur de la consommation n’est saisi : la première souscription d’un particulier reste fermée tant qu’il manque, sauf décision de votre part (carte « Blocage des abonnements », « Vente aux particuliers sans médiateur »)."
    );
  });

  it("vendeur complet et médiateur saisi : l'ouverture est enregistrée, sans réserve", async () => {
    mocks.identite = { editeur: { ...VENDEUR, ...MEDIATEUR }, indisponible: false };
    expect((await reglerOuvertureVentes({}, ouvrir())).succes).toBe("Ouverture enregistrée. Les contrôles avant paiement s’appliquent.");
  });

  // D7R-05 : le contrôle de la mention « EI », fait à la saisie, est rejoué à l'ouverture.
  it.each(["MARTIN Camille", "EI-CONSEIL Martin", "non entrepreneur individuel"])(
    "entrepreneur individuel dont le nom « %s » ne porte pas la mention : l'ouverture est refusée et nomme le manque",
    async (denomination) => {
      mocks.identite = { editeur: { ...VENDEUR, ...MEDIATEUR, denomination }, indisponible: false };
      const r = await reglerOuvertureVentes({}, ouvrir());
      expect(r.erreur).toBe(`Les souscriptions ne peuvent pas s’ouvrir : l’identité du vendeur est incomplète. À compléter : ${MANQUE_MENTION_EI}.`);
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it.each(REQUIS)("sans %s : l'ouverture est refusée, médiateur saisi ou non", async (cle) => {
    for (const mediateur of [{}, MEDIATEUR]) {
      mocks.identite = { editeur: { ...VENDEUR, ...mediateur, [cle]: null }, indisponible: false };
      expect((await reglerOuvertureVentes({}, ouvrir())).erreur).toContain("l’identité du vendeur est incomplète");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  // Seconde reprise (relecture T4R-02). Ces deux tests affirmaient que lever le blocage ouvre la première souscription
  // d'un particulier sans médiateur, et que le réactiver la referme. La levée ne concerne plus que les augmentations
  // payantes ; elle ne touche pas à la décision de vendre sans médiateur, et le message le dit.
  it("T4R-02 — lever le blocage : n'écrit que ce réglage ; le message dit que la vente sans médiateur est une décision à part", async () => {
    const r = await reglerBlocageSouscription({}, blocage("lever"));
    expect(mocks.update).toHaveBeenCalledWith({ blocage_souscription_identite: false, revision: 5 });
    expect(r.succes).not.toContain("n’attend plus le médiateur");
    expect(r.succes).toContain("Blocage levé : une identité du vendeur incomplète n’empêche plus les augmentations payantes.");
    expect(r.succes).toContain("Toute première souscription reste fermée tant que l’identité du vendeur est incomplète.");
    expect(r.succes).toContain("Cette levée n’ouvre pas la vente aux particuliers sans médiateur de la consommation : c’est une décision à part, sur la même carte.");
    expect(r.succes).toContain("Cette décision est inscrite à l’historique des changements.");
    expect(r.succes).not.toMatch(/conforme/i);
  });

  it("T4R-02 — réactiver le blocage : n'écrit que ce réglage, et ne parle plus du médiateur", async () => {
    const r = await reglerBlocageSouscription({}, blocage("activer"));
    expect(mocks.update).toHaveBeenCalledWith({ blocage_souscription_identite: true, revision: 5 });
    expect(r.succes).toBe("Blocage réactivé : une identité du vendeur incomplète empêche à nouveau les augmentations payantes.");
  });

  // Seconde reprise (T4R-02) : la ligne du journal écrivait « médiateur absent » en dur, même quand il était saisi. Les
  // lignes sont désormais calculées (tests/vendeur-textes-seconde-reprise-t4.test.ts les éprouve une à une).
  it("la levée est journalisée par la base (table d'historique lue par /admin/journaux), et l'écran la nomme sans rien affirmer du médiateur", () => {
    const journal = readFileSync("src/app/admin/journaux/preuves.tsx", "utf8");
    expect(journal).toContain("{r.objet==='supervision_identite'&&lignesJournalReglage(r.avant,r.apres).map(l=><p key={l}>{l}</p>)}");
    expect(journal).not.toContain("médiateur absent");
    const carte = readFileSync("src/app/admin/parametres/blocage-souscription.tsx", "utf8");
    expect(carte).toContain('href="/admin/journaux?registre=supervision_identite"');
  });

  // D7R-07 : les longues parenthèses d'aide ressortaient dans le journal et dans le refus d'archivage.
  it("les libellés des champs sont courts ; l'aide de saisie est à part", () => {
    expect(CHAMPS_EDITEUR.denomination).toBe("Nom de l’éditeur");
    expect(CHAMPS_EDITEUR.forme).toBe("Forme juridique");
    expect(CHAMPS_EDITEUR.siege).toBe("Adresse");
    for (const cle of ["denomination", "forme", "capital", "siege", "rcs", "siret", "email", "telephone"]) expect(CHAMPS_EDITEUR[cle].length, cle).toBeLessThanOrEqual(40);
    expect(AIDES_EDITEUR.denomination).toContain("immédiatement précédés ou suivis de « EI »");
    const formulaire = readFileSync("src/app/admin/parametres/identite.tsx", "utf8");
    expect(formulaire).toContain("{AIDES_EDITEUR[k] && <span");
    // D7R-02 : la rubrique prévient AVANT la saisie de ce qui suspend les ventes, et de ce qui ne les suspend pas.
    expect(formulaire).toContain("le nom, l’adresse et l’e-mail de contact sont imprimés dans les conditions générales. Les modifier après l’archivage des conditions suspend les premières souscriptions des particuliers");
    expect(formulaire).toContain("Cette saisie ne suspend aucune souscription et ne demande pas de nouvelle version des conditions.");
  });
});

describe("4. le contrat ne dépend que de ce que retient `identiteDesConditions` (D7R-02)", () => {
  const COMPLETE: Record<string, string | null> = { ...VENDEUR, ...MEDIATEUR, capital: "1 000 €", tvaIntracommunautaire: "FR00 000000000" };
  async function texteDuContrat(identite: Record<string, string | null>): Promise<string> {
    mocks.identite = { editeur: identite, indisponible: false };
    const extraction = extraireTexteContractuel(renderToStaticMarkup(await Conditions()), "conditions_clients");
    if (!extraction.ok) throw new Error(`texte contractuel introuvable (${extraction.motif})`);
    return extraction.html;
  }

  // Pour CHAQUE champ de la saisie : une autre valeur, puis une valeur vide. Le texte du contrat change si et
  // seulement si ce que `identiteDesConditions` retient change. Si un article se met à citer un autre champ, ce test
  // échoue : la liste de `identiteDesConditions` doit alors le reprendre (sinon la garde de commande laisserait vendre
  // sous un contrat qui n'est plus celui de l'archive).
  it.each(Object.keys(CHAMPS_EDITEUR))("champ %s : le texte change si et seulement si l'identité retenue change", async (cle) => {
    const reference = await texteDuContrat(COMPLETE);
    for (const valeur of [`${COMPLETE[cle] ?? "valeur"} (modifié)`, null]) {
      const modifiee = { ...COMPLETE, [cle]: valeur };
      const memeTexte = (await texteDuContrat(modifiee)) === reference;
      const memeIdentiteRetenue = JSON.stringify(identiteDesConditions(modifiee)) === JSON.stringify(identiteDesConditions(COMPLETE));
      expect(memeTexte, `${cle} = ${valeur}`).toBe(memeIdentiteRetenue);
    }
  });

  it("le médiateur, le téléphone et les prestataires ne changent pas le contrat ; le nom, l'adresse et l'e-mail le changent", async () => {
    const reference = await texteDuContrat(COMPLETE);
    for (const cle of ["mediateurNom", "mediateurAdresse", "mediateurSite", "coordonneesVercel", "coordonneesSupabase", "localisationBan", "capital", "tvaIntracommunautaire"]) {
      expect(await texteDuContrat({ ...COMPLETE, [cle]: null }), cle).toBe(reference);
      expect(await texteDuContrat({ ...COMPLETE, [cle]: "autre valeur fictive" }), cle).toBe(reference);
    }
    for (const cle of ["telephone", "siret", "rcs", "directeurPublication", "forme"]) {
      expect(await texteDuContrat({ ...COMPLETE, [cle]: "autre valeur fictive" }), cle).toBe(reference);
    }
    for (const cle of ["denomination", "siege", "email"]) {
      expect(await texteDuContrat({ ...COMPLETE, [cle]: cle === "email" ? "autre@example.test" : "autre valeur fictive" }), cle).not.toBe(reference);
    }
  });

  it("ce que la fonction retient : nom, adresse, e-mail, et l'état de l'encadré « en cours de finalisation »", () => {
    expect(identiteDesConditions(COMPLETE)).toEqual({
      denomination: "MARTIN Camille EI", siege: "1 rue de l'Exemple, 75000 Paris", email: "contact@example.test", encadre: "complet",
    });
    expect(identiteDesConditions({ ...COMPLETE, telephone: null }).encadre).toBe("en cours de finalisation");
    expect(identiteDesConditions({})).toEqual({ denomination: null, siege: null, email: null, encadre: "en cours de finalisation" });
    // Une valeur illisible dans l'archive (ni texte ni vide) compte comme absente : la commande attend.
    expect(identiteDesConditions({ ...COMPLETE, siege: 12 as unknown as string }).siege).toBeNull();
  });
});
