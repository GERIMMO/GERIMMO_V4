/**
 * Sprint « Documents-0 » — modèles bail nu (01) et états des lieux (14/15) :
 * HTML construit depuis des fixtures, blocs conditionnels, manquants.
 */
import { describe, expect, it } from "vitest";
import { Fusion } from "../src/lib/documents/gabarit";
import { construireBailNu } from "../src/lib/documents/modeles/bail-nu";
import { construireEdl, type DonneesEdl } from "../src/lib/documents/modeles/edl";
import { contexte, personne } from "./fixtures/contexte-document";

describe("Modèle 01 — bail nu", () => {
  it("porte les 11 sections du contrat type et le dépôt en toutes lettres", () => {
    const doc = construireBailNu(contexte(), { dpeClasse: "D", f: new Fusion() });
    expect(doc.html).toContain("<h1>Contrat de location</h1>");
    expect(doc.html).toContain("décret n° 2015-587");
    for (const s of [
      "I — Désignation des parties",
      "II — Objet du contrat",
      "III — Date de prise d'effet et durée du contrat",
      "IV — Conditions financières",
      "V — Travaux",
      "VI — Garanties",
      "VII — Clause résolutoire",
      "IX — Autres conditions particulières",
      "XI — Date et signatures",
    ]) {
      expect(doc.html).toContain(s);
    }
    expect(doc.html).toContain("six cent cinquante euros");
    expect(doc.html).toContain("1234567890123");
    expect(doc.html).toContain("Moreau Claire");
    expect(doc.html).toContain("Leblanc Julie");
  });

  it("ouvre les blocs conditionnels selon les données : zone tendue, copro, DPE F/G, solidarité", () => {
    const zt = construireBailNu(contexte(), { dpeClasse: "G", f: new Fusion() });
    expect(zt.html).toContain("plafonnement de l’évolution du loyer à la relocation : oui");
    expect(zt.html).toContain("règlement de copropriété");
    expect(zt.html).toContain("classé G");
    expect(zt.html).not.toContain("Clause de solidarité");

    const deux = construireBailNu(
      contexte({ locataires: [personne(), personne({ id: "p2", nom: "Martin", prenom: "Léo" })] }),
      { dpeClasse: null, f: new Fusion() }
    );
    expect(deux.html).toContain("VII — Clause de solidarité");
    expect(deux.html).toContain("XII — Date et signatures");

    const simple = construireBailNu(
      contexte({
        bien: { ...contexte().bien, copropriete: false, zone_tendue: false },
      }),
      { dpeClasse: "C", f: new Fusion() }
    );
    expect(simple.html).toContain("plafonnement de l’évolution du loyer à la relocation : non");
    expect(simple.html).not.toContain("règlement de copropriété");
  });

  it("imprime les données du bail 100 % rempli — zéro manquant sur la fixture complète", () => {
    const f = new Fusion();
    const doc = construireBailNu(contexte(), { dpeClasse: "D", f });
    // Câblage du contrat type (décret 2015-587) : chaque rubrique porte la donnée réelle
    expect(doc.html).toContain("Villeurbanne"); // commune de naissance du locataire
    expect(doc.html).toContain("Cuisine équipée, Placards"); // équipements du lot
    expect(doc.html).toContain("Individuel — électricité"); // chauffage
    expect(doc.html).toContain("Hall, ascenseur, local vélos"); // parties communes
    expect(doc.html).toContain("Fibre optique"); // accès TIC
    // Phase 3 (C12) : la mention « sans objet » dit à quelle rubrique elle se rapporte (elle était seule sur sa ligne).
    expect(doc.html).toContain("Durée réduite pour un événement précis justifiant la reprise du logement : sans objet — le contrat est conclu pour la durée de droit commun.");
    expect(doc.html).toContain("à échoir");
    expect(doc.html).toContain("Virement bancaire");
    expect(doc.html).toContain("FR76 3000 4000 0500 0012 3456 789"); // IBAN facultatif imprimé
    expect(doc.html).toMatch(/740,00\s€/); // 650 + 90, bail au 1er du mois : pas de prorata
    expect(doc.html).not.toContain("premier mois au prorata");
    expect(doc.html).toContain("145,17"); // valeur de l'indice IRL
    expect(doc.html).toMatch(/640,00\s€/); // dernier loyer du précédent locataire
    expect(doc.html).toContain("Complément de loyer : néant.");
    expect(doc.html).toContain("Sans objet — location conclue sans intermédiaire."); // pas une agence
    expect(doc.html).toContain("Néant."); // travaux et clauses particulières vides
    // Le bail complet ne laisse AUCUN champ en libellé d'épreuve
    expect(doc.manquants).toEqual([]);
  });

  it("laisse en libellé ce que la base n'a pas — et le compte honnêtement", () => {
    const f = new Fusion();
    const base = contexte();
    const doc = construireBailNu(
      contexte({
        organisation: { ...base.organisation, iban: null },
        bail: { ...base.bail, fixation_loyer: null, lieu_paiement: null, irl_valeur: null, date_debut: null },
        lot: { ...base.lot, chauffage: null, eau_chaude: null, equipements: [], locaux_privatifs: null },
        bien: { ...base.bien, parties_communes: null, acces_tic: null },
        locataires: [personne({ commune_naissance: null, telephone: null })],
      }),
      { dpeClasse: null, f }
    );
    expect(doc.html).toContain("individuel ou collectif, énergie");
    expect(doc.html).toContain("fibre, câble, TNT…");
    expect(doc.manquants).toContain("commune de naissance");
    expect(doc.manquants).toContain("équipements du logement");
    expect(doc.manquants).toContain("chauffage du logement");
    expect(doc.manquants).toContain("libre, plafonnement, réévaluation après travaux…");
    expect(doc.manquants).toContain("valeur de l'indice");
    // Sans date de début, le prorata de la première échéance est incalculable
    expect(doc.manquants).toContain("loyer + charges, montant au prorata");
    // FACULTATIFS (téléphone du locataire, IBAN) : un tiret, jamais un manquant
    expect(doc.manquants).not.toContain("IBAN, facultatif");
    expect(doc.manquants).not.toContain("facultatif");
    // Et ce que la base a ne doit PAS être compté manquant
    expect(doc.manquants).not.toContain("adresse complète, étage, porte");
    expect(doc.manquants).not.toContain("montant mensuel");
  });

  it("calcule le prorata du premier mois et sert le cas agence : carte pro, honoraires, plafond", () => {
    const f = new Fusion();
    const base = contexte();
    const doc = construireBailNu(
      contexte({
        organisation: {
          ...base.organisation,
          type: "agence",
          carte_pro: "CPI 6901 2018 000 025 — CCI de Lyon",
        },
        bail: {
          ...base.bail,
          date_debut: "2026-09-15",
          complement_loyer: 50,
          complement_justification: "Terrasse de 20 m² avec vue dégagée",
        },
      }),
      { dpeClasse: "D", f }
    );
    // 15 → 30 septembre : 16 jours sur 30 → (650 + 90) × 16/30 = 394,67 €
    expect(doc.html).toMatch(/394,67\s€/);
    // Textes officiels, lot T2 (R08-A3) : ce test affirmait « (premier mois au prorata) » à la place du montant d'une période
    // complète, que demande le contrat type. Le bail donne maintenant la période complète, puis le premier terme au prorata.
    const texte = doc.html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    expect(texte).toContain("pour une période complète de location : 740,00 € (loyer 650,00 € + charges 90,00 €).");
    expect(texte).toContain("(16 jours sur 30) : 394,67 € (loyer 346,67 € + charges 48,00 €).");
    // Agence : mandataire avec carte pro, honoraires chiffrés, plafond zone tendue calculé
    expect(doc.html).toContain("CPI 6901 2018 000 025 — CCI de Lyon");
    expect(doc.html).toMatch(/300,00\s€/);
    expect(doc.html).toMatch(/10,09\s€/);
    // Complément de loyer motivé. (Lot T2, R17-A2 : la durée réduite, que ce test remplissait, n'est plus préparée par Gerimmo :
    // voir textes-officiels-t2.test.ts.)
    expect(doc.html).toContain("Terrasse de 20 m² avec vue dégagée");
    expect(doc.html).not.toContain("Sans objet");
    // Lot T2 (R08-A1) : le garant du mandataire est exigé par le contrat type ; ce contexte d'essai n'en a pas.
    expect(doc.manquants).toEqual(["garantie financière du mandataire (nom et adresse du garant)"]);
  });
});

describe("Modèles 14/15 — états des lieux", () => {
  function donnees(sur: Partial<DonneesEdl> = {}): DonneesEdl {
    const f = new Fusion();
    return {
      type: "entree",
      reference: "EDL-1234ABCD",
      dateEdl: "2026-09-01",
      signeLe: null,
      personnesPresentes: "Claire Moreau, Julie Leblanc",
      detecteurFumeePresent: true,
      detecteurFumeeEtat: "Testé et fonctionnel",
      attestationAssuranceFournie: true,
      adresseRestitutionDepot: "12 rue des Lilas, 69003 Lyon",
      observations: "Néant",
      lignes: [
        { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null },
        { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "neuf", commentaire: "repeints" },
        { categorie: "equipement", piece: null, libelle: "Réfrigérateur", etat: null, commentaire: null },
      ],
      compteurs: [{ type: "Électricité", numero: "E-778", releve: "45210" }],
      cles: [{ libelle: "Clé porte d'entrée", nombre: 2, reference: null }],
      comparatif: [],
      bailleurNom: f.champ("Claire Moreau", "nom et prénom(s), ou dénomination"),
      locatairesNoms: f.champ("Julie Leblanc", "nom et prénom(s) du ou des locataires"),
      logementAdresse: "12 rue des Lilas, 69003 Lyon",
      referenceBail: "BAIL-0F3A21BC",
      exp: { nom: "Parc de Claire Moreau", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@x.fr", telephone: null, ville: "Lyon" },
      typeOrganisation: "proprietaire_direct",
      f,
      ...sur,
    };
  }

  it("l'entrée groupe la grille par pièce, imprime compteurs, clés et sécurité", () => {
    const doc = construireEdl(donnees());
    expect(doc.html).toContain("<h1>État des lieux d&#39;entrée</h1>".replace("&#39;", "'"));
    expect(doc.html).toContain("Séjour");
    expect(doc.html).toContain("repeints");
    expect(doc.html).toContain("Relevés de compteurs");
    expect(doc.html).toContain("E-778");
    expect(doc.html).toContain("Clé porte d'entrée");
    expect(doc.html).toContain("Détecteur avertisseur autonome de fumée");
    // un élément non relevé reste en libellé
    expect(doc.html).toContain("État de Réfrigérateur");
    expect(doc.manquants).toEqual([expect.stringMatching(/^État de Réfrigérateur — /)]);
  });

  // Phase 3 (C39) : l'index s'imprimait tel que la base le rend, avec un point décimal (« 311.02 ») au milieu de montants
  // écrits à la française. Il s'imprime désormais au format français, sans zéro inutile ; un index nul reste « 0 ».
  it.each([
    [311.02, "311,02"],
    [8412, "8\u202f412"],
    [0, "0"],
    ["311.020", "311,02"],
    [4521.3, "4\u202f521,3"],
  ])("imprime l'index %s reçu de la base au format français, sans perdre le zéro", (releve, attendu) => {
    const doc = construireEdl(donnees({
      compteurs: [{ type: "Eau froide", numero: "RCT-0317", releve }],
    }));
    expect(doc.html).toContain(`>${attendu}<`);
    expect(doc.manquants).not.toContain("index");
  });

  it.each([null, ""])("signale un index non renseigné (%s)", (releve) => {
    const doc = construireEdl(donnees({
      compteurs: [{ type: "Eau froide", numero: "RCT-0317", releve }],
    }));
    expect(doc.manquants).toContain("index");
  });

  // Le 11/09, l'état des lieux de sortie s'est mis à reprendre les clés de
  // l'entrée pour éviter de les retaper. Elles arrivaient avec `nombre = 0`.
  // Or les deux parties SIGNENT ce document : « 0 » y atteste que le locataire
  // n'a rendu aucune clé — le fait même qui fonde une retenue de serrurerie.
  // Une clé non comptée s'imprime donc en libellé, et remonte dans la liste
  // des champs restés à remplir, comme le fait déjà l'index de compteur.
  it("une clé non comptée ne s'imprime pas « 0 » et se signale comme manquante", () => {
    const doc = construireEdl(
      donnees({
        type: "sortie",
        cles: [{ libelle: "Clé porte d'entrée", nombre: null, reference: "A-12" }],
      })
    );
    expect(doc.html).toContain("Clé porte d&#39;entrée".replace("&#39;", "'"));
    expect(doc.manquants).toContain("nombre rendu");
    // La cellule « Nombre » de CETTE ligne porte le libellé de l'épreuve, pas
    // un chiffre : c'est ce que l'ancien code (`String(c.nombre)`) ne pouvait
    // pas produire — il aurait imprimé « 0 », ou « null ».
    const i = doc.html.indexOf("A-12");
    const ligne = doc.html.slice(i, i + 300);
    expect(ligne).toContain("nombre rendu");
    expect(ligne).not.toMatch(/>\s*(0|null)\s*</);
  });

  // Zéro clé RENDUE est un constat, et il s'imprime : la distinction entre
  // « pas encore compté » et « compté, rien rendu » est tout l'objet du null.
  it("zéro clé rendue s'imprime, et ne compte pas parmi les manquants", () => {
    const doc = construireEdl(
      donnees({
        type: "sortie",
        cles: [{ libelle: "Clé porte d'entrée", nombre: 0, reference: "A-12" }],
      })
    );
    expect(doc.html).toContain(">0<");
    expect(doc.manquants).not.toContain("nombre rendu");
  });

  // Phase 3 (C33) : la synthèse des écarts nomme la pièce de chaque élément (six lignes « Murs » ne se distinguaient pas).
  // Phase 3 (C34) : les retenues chiffrées ne s'impriment plus dans l'état des lieux — acte contradictoire signé le jour du constat,
  // alors que les retenues sont arrêtées plus tard, à la restitution. L'ancienne version de ce test exigeait ce « comparatif chiffré »
  // au-dessus des signatures : il est désormais porté par le décompte de restitution et le décompte des retenues.
  it("la sortie affiche la synthèse des écarts pièce par pièce, sans retenues chiffrées", () => {
    const doc = construireEdl(
      donnees({
        type: "sortie",
        comparatif: [
          { piece: "Chambre", categorie: "piece", libelle: "Murs", etat_entree: "neuf", etat_sortie: "usage", ecart: true },
          { piece: "Séjour", categorie: "piece", libelle: "Murs", etat_entree: "neuf", etat_sortie: "mauvais", ecart: true },
          { piece: "Séjour", categorie: "piece", libelle: "Sols", etat_entree: "bon", etat_sortie: "bon", ecart: false },
          { piece: null, categorie: "equipement", libelle: "Réfrigérateur", etat_entree: "bon", etat_sortie: null, ecart: true },
        ],
      })
    );
    expect(doc.html).toContain("État des lieux de sortie");
    const synthese = doc.html.slice(doc.html.indexOf("Synthèse"), doc.html.indexOf("Adresse de restitution du dépôt"));
    const lignes = [...synthese.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1].replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, ""));
    // Phase 3, reprise du lot 36 : l'état « usage » s'imprime « Usagé », comme l'écran de la grille et l'inventaire du même
    // dossier ; ce test affirmait « Usage », le code avec une capitale, que la table locale de l'état des lieux imprimait.
    expect(lignes).toEqual([
      "Pièce|Élément|État à l'entrée|État à la sortie",
      "Chambre|Murs|Neuf|Usagé",
      "Séjour|Murs|Neuf|Mauvais",
      "Équipements|Réfrigérateur|Bon|—",
    ]);
    // Pas d'écart → pas listé
    expect(synthese).not.toContain("Sols");
    for (const absent of ["Comparatif chiffré", "vétusté", "Montant retenu", "Total des retenues"]) expect(doc.html).not.toContain(absent);
  });
});

// Rendu PDF réel des deux gros modèles (Chrome local uniquement) : les
// fichiers partent dans le scratchpad pour la comparaison visuelle aux épreuves.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const CHROME_LOCAL = [process.env.GERIMMO_CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((c): c is string => Boolean(c && existsSync(c)));
describe.skipIf(!CHROME_LOCAL)("Rendu PDF des modèles (Chrome local)", () => {
  it("bail nu et EDL de sortie se rendent en PDF multi-pages", { timeout: 90_000 }, async () => {
    process.env.GERIMMO_CHROME = CHROME_LOCAL;
    const { rendrePdf } = await import("../src/lib/documents/rendu");
    const dossier =
      join(tmpdir(), "gerimmo-recette-pdf");
    mkdirSync(dossier, { recursive: true });
    const bail = construireBailNu(contexte(), { dpeClasse: "G", f: new Fusion() });
    const pdfBail = await rendrePdf(bail);
    expect(pdfBail.length).toBeGreaterThan(30_000);
    writeFileSync(`${dossier}/test-bail-nu.pdf`, pdfBail);
    const edl = construireEdl({
      type: "sortie" as const,
      reference: "EDL-1234ABCD",
      dateEdl: "2027-09-01",
      signeLe: null,
      personnesPresentes: "Claire Moreau, Julie Leblanc",
      detecteurFumeePresent: true,
      detecteurFumeeEtat: "Testé et fonctionnel",
      attestationAssuranceFournie: true,
      adresseRestitutionDepot: "12 rue des Lilas, 69003 Lyon",
      observations: "Néant",
      lignes: [
        { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon" as const, commentaire: null },
        { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "mauvais" as const, commentaire: "trous de chevilles" },
        { categorie: "piece", piece: "Chambre", libelle: "Sols", etat: "bon" as const, commentaire: null },
      ],
      compteurs: [{ type: "Électricité", numero: "E-778", releve: "48114" }],
      cles: [{ libelle: "Clé porte d'entrée", nombre: 2, reference: null }],
      comparatif: [{ piece: "Séjour", categorie: "piece", libelle: "Murs", etat_entree: "neuf", etat_sortie: "mauvais", ecart: true }],
      bailleurNom: "Claire Moreau",
      locatairesNoms: "Julie Leblanc",
      logementAdresse: "12 rue des Lilas, 69003 Lyon",
      referenceBail: "BAIL-0F3A21BC",
      exp: { nom: "Parc de Claire Moreau", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@x.fr", telephone: null, ville: "Lyon" },
      typeOrganisation: "proprietaire_direct",
      f: new Fusion(),
    });
    const pdfEdl = await rendrePdf(edl);
    writeFileSync(`${dossier}/test-edl-sortie.pdf`, pdfEdl);
  });
});
