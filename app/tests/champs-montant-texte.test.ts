/**
 * Vérification adverse du 14/10/2026 (VER-TS-02) : un propriétaire dont le navigateur n'est pas
 * en français tape « 840,00 » dans un champ `type="number"` ; le navigateur lit la virgule
 * comme un séparateur de milliers et envoie « 84000 ». Le serveur l'acceptait : 84 000 €
 * encaissés, deux quittances émises.
 *
 * Un champ de montant dont l'action serveur sait lire la virgule est donc du texte brut
 * (`type="text" inputMode="decimal"`) : le clavier reste numérique sur mobile, et le serveur
 * reçoit ce qui a été tapé. Ce test lit les sources, comme `inventaire-ecrans.test.ts` : le
 * comportement du navigateur ne se rejoue pas en vitest.
 *
 * Un champ ne passe en texte que si l'action serveur qui le reçoit sait lire la virgule. Les champs
 * qui lisaient `Number(valeur)` (refus de « 840,00 » une fois en texte) ont d'abord changé de lecture
 * (VFL-07, voir `montants-actions-lecture.test.ts`), puis de type : ils sont dans la seconde moitié de la liste.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lireMontantFacultatif } from "../src/lib/saisie-montant";

const RACINE = resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(resolve(RACINE, chemin), "utf8");

/** L'élément JSX qui contient le repère : de son `<` ouvrant au `/>` qui le ferme. */
function elementAutour(source: string, repere: string): string {
  const i = source.indexOf(repere);
  expect(i, `repère introuvable : ${repere}`).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(repere, i + 1), `repère ambigu : ${repere}`).toBe(-1);
  const debut = source.lastIndexOf("<", i);
  const fin = source.indexOf("/>", i);
  return source.slice(debut, fin + 2);
}

// [fichier, repère unique dans l'élément, action serveur qui le lit]
const CHAMPS_EN_TEXTE: [string, string, string][] = [
  ["src/components/fenetre-lot.tsx", "id={`part-${bailId}`}", "ajouterEncaissement (lireMontant)"],
  ["src/components/fenetre-lot.tsx", "id={`dep-montant-${lotId}`}", "ajouterEcriture (lireMontant)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", 'id="enc-montant"', "ajouterEncaissement (lireMontant)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-depot.tsx", 'id="dep-montant"', "encaisserDepot (lireMontant)"],
  ["src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx", 'id="ec-montant"', "ajouterEcriture (lireMontant)"],
  ["src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx", 'id="ec-teom"', "ajouterEcriture (replace de la virgule)"],
  ["src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx", 'id="v-montant"', "ventilerDepense (lireMontant)"],
  ["src/app/agence/[orgId]/profil/formulaire-profil.tsx", 'id="pr-relance-seuil"', "organisation (replace de la virgule)"],
  ["src/app/agence/[orgId]/baux/[bailId]/carte-cautionnement.tsx", "id={`caut-plafond-${garant.id}`}", "cautionnement (replace de la virgule)"],
  ["src/components/formulaires-fiscaux.tsx", 'name="loyer_hc"', "qualifierPieceFiscale (lireMontantFacultatif)"],
  ["src/components/formulaires-fiscaux.tsx", 'name="charges"', "qualifierPieceFiscale (lireMontantFacultatif)"],
  ["src/components/formulaires-fiscaux.tsx", 'name="regularisation230"', "enregistrerExerciceFiscal (lireMontantFacultatif)"],
  ["src/app/artisan/chantiers/[chantierId]/page.tsx", 'label="Montant TTC (€)"', "action « facture » (montantEnCentimes)"],
  ["src/app/artisan/facturation/[factureId]/page.tsx", 'label="Montant reçu (€)"', "action « reglement » (montantEnCentimes)"],
  ["src/app/artisan/clients/formulaire.tsx", "value={x.prix}", "devis : montantEnCentimes avant l'envoi"],
  ["src/app/admin/marketing/reglages-automatiques.tsx", 'name="budget"', "enregistrerReglagesMarketing (replace de la virgule)"],
  ["src/app/admin/territoire/etude.tsx", 'name="depense"', "enregistrerEtude (replace de la virgule)"],
  // VFL-07 : champs restés en type="number" jusque-là, dont l'action lit maintenant le texte tapé.
  ["src/components/champs-bail.tsx", 'name="loyer_hc"', "creerBail / modifierBail (lireMontantFacultatif)"],
  ["src/components/champs-bail.tsx", 'name="charges"', "creerBail / modifierBail (lireMontantFacultatif)"],
  ["src/components/champs-bail.tsx", 'name="depot_garantie"', "creerBail / modifierBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", 'id="irl-nouv"', "reviserLoyer (lireDecimal)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", 'id="reg-reel"', "regulariserCharges (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-irl-valeur"', "modifierComplementsBail (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-travaux-montant"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-hono-bailleur"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-hono-locataire"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-loyer-ref"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-loyer-ref-majore"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-complement"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx", 'id="comp-dernier-loyer"', "modifierComplementsBail (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx", 'aria-label="Montant versé, en euros"', "enregistrerVersement (lireMontant)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-appels-charges.tsx", 'id="ac-total"', "creerAppelCharges (lireMontant)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-appels-charges.tsx", "id={idMontant}", "ajouterPosteCharge (lireMontant)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx", 'id="ret-cout"', "ajouterRetenue (lireMontant)"],
  ["src/app/agence/[orgId]/personnes/[personId]/formulaire-mandat.tsx", 'id="m-seuil"', "creerMandat (lireMontantFacultatif)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/chambres-logement.tsx", 'name="plafond"', "enregistrerPlafondColocation (lireMontant)"],
  // D04 (1), VER-TS-02 : les champs décimaux restés en type="number", dont l'action lit maintenant le texte tapé.
  ["src/app/agence/[orgId]/personnes/[personId]/formulaire-mandat.tsx", "id={`l-taux-${mandatId}`}", "ajouterLigneMandat (lireDecimal)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-colocation.tsx", 'id="coloc-qp"', "ajouterBailPersonne (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-colocation.tsx", 'id="coloc-surf"', "ajouterBailPersonne (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/chambres-logement.tsx", 'name="surface_m2"', "enregistrerChambre (lireDecimal)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/chambres-logement.tsx", 'name="volume_m3"', "enregistrerChambre (lireDecimal)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-lot.tsx", 'id="lot-surface-form"', "modifierLot (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-lot.tsx", 'id="lot-carrez"', "modifierLot (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-lot.tsx", 'id="lot-tantieme"', "modifierLot (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-detention.tsx", 'id="detention-quote-part"', "ajouterDetention (lireDecimal)"],
  ["src/app/agence/[orgId]/parc/[bienId]/formulaire-cle.tsx", "id={`${idPart}-${lot.id}`}", "validerCle (lireDecimal)"],
  ["src/app/agence/[orgId]/parc/[bienId]/formulaire-decoupage.tsx", 'name="lot_surface"', "decouperBien (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/parc/formulaire-bien.tsx", "id=\"lot-surface\"", "creerBien (lireDecimal)"],
  ["src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-annexes.tsx", "name={`releve_${c.id}`}", "enregistrerAnnexesEdl (lireDecimal)"],
  ["src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-annexes.tsx", 'name="releve"', "ajouterCompteur (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx", 'id="ret-duree"', "ajouterRetenue (lireDecimalFacultatif)"],
  ["src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx", 'id="ret-age"', "ajouterRetenue (lireDecimalFacultatif)"],
  ["src/components/formulaires-fiscaux.tsx", 'name="quote_part230"', "enregistrerExerciceFiscal (lireDecimalFacultatif)"],
  ["src/components/formulaires-fiscaux.tsx", "aria-label={`Quote-part période ${i+1}`}", "enregistrerExerciceFiscal (lireDecimal par période)"],
];

describe("champs de montant : du texte brut, pas un champ numérique du navigateur", () => {
  it.each(CHAMPS_EN_TEXTE)("%s : %s (%s)", (fichier, repere) => {
    const element = elementAutour(lire(fichier), repere);
    expect(element).not.toMatch(/type=\{?["']number["']/);
    expect(element).toMatch(/type="text"/);
    expect(element).toMatch(/inputMode="decimal"/);
  });
});

describe("catalogue de documents : les montants d'un document sont du texte à clavier décimal (D04 1)", () => {
  const options = lire("src/lib/documents/catalogue-options.ts");
  const formulaire = lire("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx");

  it.each(["montant_max", "interets_emprunt"])("%s est déclaré « montant », pas « number »", (cle) => {
    const champ = options.match(new RegExp(`\\{cle:"${cle}"[^}]*\\}`))?.[0] ?? "";
    expect(champ, `champ ${cle} introuvable`).not.toBe("");
    expect(champ).toContain('type:"montant"');
    expect(champ).not.toContain('type:"number"');
  });

  it("un champ « montant » est rendu en texte à clavier décimal", () => {
    expect(formulaire).toContain('type={c.type==="montant"?"text":(c.type??"text")}');
    expect(formulaire).toContain('inputMode={c.type==="montant"?"decimal":undefined}');
  });
});

describe("étape « loyer » du parcours de bail : les montants sont déclarés en « montant »", () => {
  const source = lire("src/app/agence/[orgId]/baux/[bailId]/formulaire-parcours-bail.tsx");
  const MONTANTS = [
    "loyer_hc", "charges", "depot_garantie", "dernier_loyer",
    "honoraires_bailleur", "honoraires_locataire", "honoraires_edl_bailleur", "honoraires_edl_locataire",
    "dpe_depenses_min", "dpe_depenses_max", "loyer_reference", "loyer_reference_majore", "complement_loyer",
    "travaux_recents_montant",
  ];
  it.each(MONTANTS)("%s", (nom) => {
    const ligne = source.split("\n").find((l) => l.includes(`{nom:"${nom}"`));
    expect(ligne, `champ ${nom} introuvable`).toBeDefined();
    expect(ligne).toContain('type:"montant"');
    expect(ligne).not.toContain('type:"number"');
  });

  it("un champ « montant » est rendu en texte décimal, sans min ni pas numérique", () => {
    expect(source).toContain('type={c.type==="montant"?"text":(c.type??"text")}');
    expect(source).toContain('inputMode={c.type==="montant"?"decimal":undefined}');
    expect(source).toContain('step={c.type==="number"?');
  });

  it("le complément de loyer saisi avec une virgule fait apparaître sa justification, lu comme le serveur (jamais par Number)", () => {
    // D04 (1) : la visibilité de la justification lit le complément avec lireMontantFacultatif (voir complement-loyer-saisie.test.ts).
    expect(source).toContain('visible:v=>v.encadrement_loyer==="true"&&complementPositif(v.complement_loyer)');
    expect(source).toContain('lireMontantFacultatif');
    expect(source).not.toMatch(/Number\(\(v\.complement_loyer/);
  });
});

describe("compléments de contrat (mentions du bail) : les montants sont du texte à clavier décimal (D04 1)", () => {
  const source = lire("src/app/agence/[orgId]/baux/[bailId]/mentions-contrat.tsx");
  it.each(["dpe_depenses_min", "dpe_depenses_max", "honoraires_edl_bailleur", "honoraires_edl_locataire"])("%s est déclaré « montant »", (nom) => {
    const ligne = source.split("\n").find((l) => l.includes(`nom: '${nom}'`));
    expect(ligne, `champ ${nom} introuvable`).toBeDefined();
    expect(ligne).toContain("type: 'montant'");
    expect(ligne).not.toContain("type: 'number'");
  });
  it("aucun champ de ce formulaire n'est rendu en type=\"number\"", () => {
    expect(source).not.toMatch(/type:\s*'number'/);
    expect(source).not.toMatch(/type=\{?["']number["']/);
    expect(source).toContain("inputMode={c.type === 'montant' ? 'decimal' : undefined}");
    expect(source).toContain("type={c.type === 'date' ? 'date' : 'text'}");
  });
  it("un montant déjà enregistré revient avec sa virgule, et la virgule est relue telle quelle par le serveur", () => {
    expect(source).toContain("String(actuel).replace('.', ',')");
    expect(lireMontantFacultatif("1250,42")).toEqual({ montant: 1250.42 });
  });
});

describe("l'indice IRL du parcours de bail : lu avec la virgule par le serveur, donc saisi en texte (VFL-07)", () => {
  const source = lire("src/app/agence/[orgId]/baux/[bailId]/formulaire-parcours-bail.tsx");
  it("irl_valeur est déclaré en « montant » (texte décimal) et non plus en « number »", () => {
    const ligne = source.split("\n").find((l) => l.includes('{nom:"irl_valeur"'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('type:"montant"');
    expect(ligne).not.toContain('type:"number"');
  });
});

describe("la lecture serveur de ces champs accepte bien la virgule (condition du passage en texte)", () => {
  it("lireEtapeBail lit les montants du parcours avec la virgule, strictement (D04 1 : plus de Number())", () => {
    const source = lire("src/lib/champs-etape-bail.ts");
    expect(source).toContain("lireMontantFacultatif(brut)");
    expect(source).not.toContain('Number(brut.replace(",", "."))');
  });
  it("les actions de l'encaissement, du dépôt et de la compta passent par lireMontant", () => {
    expect(lire("src/app/actions/loyers.ts")).toContain('lireMontant(formData.get("montant"))');
    expect(lire("src/app/actions/depot.ts")).toContain('lireMontant(formData.get("montant"))');
    expect(lire("src/app/actions/compta.ts")).toContain('lireMontant(formData.get("montant"))');
  });
  it("les montants fiscaux illisibles sont refusés au lieu de devenir « non renseignés »", () => {
    const source = lire("src/app/actions/fiscalite.ts");
    expect(source).toContain("lireMontantFacultatif");
    expect(source).not.toMatch(/nombreOptionnel\(f,'(loyer_hc|charges|regularisation230)'\)/);
  });
});
