/**
 * Sprint « Documents-0 » — modèles bail nu (01) et états des lieux (14/15) :
 * HTML construit depuis des fixtures, blocs conditionnels, manquants.
 */
import { describe, expect, it } from "vitest";
import { Fusion } from "../src/lib/documents/gabarit";
import { construireBailNu } from "../src/lib/documents/modeles/bail-nu";
import { construireEdl, type DonneesEdl } from "../src/lib/documents/modeles/edl";
import type { ContexteBail, PersonneDocument } from "../src/lib/documents/modeles/communs";

export function personne(sur: Partial<PersonneDocument> = {}): PersonneDocument {
  return {
    id: "p1",
    nom: "Leblanc",
    prenom: "Julie",
    email: "julie@exemple.fr",
    telephone: "06 00 00 00 00",
    date_naissance: "1990-05-12",
    address_line1: "3 rue Ancienne",
    postal_code: "69001",
    city: "Lyon",
    qualite: null,
    ...sur,
  };
}

export function contexte(sur: Partial<ContexteBail> = {}): ContexteBail {
  return {
    organisation: {
      name: "Parc de Claire Moreau",
      type: "proprietaire_direct",
      address_line1: "8 avenue des Tilleuls",
      postal_code: "69006",
      city: "Lyon",
      telephone: "06 11 22 33 44",
      email_contact: "claire@exemple.fr",
    },
    bail: {
      id: "b1",
      type: "nu",
      etat: "brouillon",
      date_debut: "2026-09-01",
      date_fin: null,
      loyer_hc: 650,
      charges: 90,
      charges_mode: "provisions",
      depot_garantie: 650,
      jour_echeance: 5,
      irl_trimestre: "2e trimestre 2026",
      revision_irl: true,
      locataire_principal: "p1",
    },
    lot: {
      id: "l1",
      nom: "Lot unique",
      surface_m2: 45,
      pieces: 2,
      etage: "3",
      meuble: false,
      identifiant_fiscal: "1234567890123",
      description: "cave n° 4",
    },
    bien: {
      id: "bi1",
      nom: "12 rue des Lilas",
      type: "appartement",
      address_line1: "12 rue des Lilas",
      postal_code: "69003",
      city: "Lyon",
      annee_construction: 1985,
      copropriete: true,
      zone_tendue: true,
      syndic_nom: "Syndic du Parc",
    },
    bailleurs: [{ ...personne({ id: "prop", nom: "Moreau", prenom: "Claire", qualite: "Personne physique" }), quote_part: 100 }],
    locataires: [personne()],
    garants: [],
    ...sur,
  };
}

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
    expect(zt.html).toContain("Zone tendue");
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
    expect(simple.html).not.toContain("Zone tendue");
    expect(simple.html).not.toContain("règlement de copropriété");
  });

  it("laisse en libellé ce que la base n'a pas — et le compte honnêtement", () => {
    const f = new Fusion();
    const doc = construireBailNu(contexte(), { dpeClasse: null, f });
    // Jamais demandés au sprint Documents-0 : chauffage, TIC, honoraires…
    expect(doc.html).toContain("individuel ou collectif, énergie");
    expect(doc.html).toContain("fibre, câble, TNT…");
    expect(doc.manquants).toContain("commune de naissance");
    expect(doc.manquants).toContain("IBAN, facultatif");
    expect(doc.manquants.length).toBeGreaterThan(5);
    // Mais ce que la base a ne doit PAS être compté manquant
    expect(doc.manquants).not.toContain("adresse complète, étage, porte");
    expect(doc.manquants).not.toContain("montant mensuel");
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
      lignes: [
        { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon", commentaire: null },
        { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "neuf", commentaire: "repeints" },
        { categorie: "equipement", piece: null, libelle: "Réfrigérateur", etat: null, commentaire: null },
      ],
      compteurs: [{ type: "Électricité", numero: "E-778", releve: "45210" }],
      cles: [{ libelle: "Clé porte d'entrée", nombre: 2, reference: null }],
      comparatif: [],
      retenues: [],
      bailleurNom: f.champ("Claire Moreau", "nom et prénom(s), ou dénomination"),
      locatairesNoms: f.champ("Julie Leblanc", "nom et prénom(s) du ou des locataires"),
      logementAdresse: "12 rue des Lilas, 69003 Lyon",
      referenceBail: "BAIL-0F3A21BC",
      exp: { nom: "Parc de Claire Moreau", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@x.fr", telephone: null, ville: "Lyon" },
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
    expect(doc.html).toContain("neuf, bon, usagé, mauvais");
    expect(doc.manquants).toContain("neuf, bon, usagé, mauvais");
  });

  it("la sortie affiche le comparatif, les retenues avec vétusté et leur total", () => {
    const doc = construireEdl(
      donnees({
        type: "sortie",
        comparatif: [
          { libelle: "Murs — Séjour", etat_entree: "neuf", etat_sortie: "mauvais", ecart: true },
          { libelle: "Sols — Séjour", etat_entree: "bon", etat_sortie: "bon", ecart: false },
        ],
        retenues: [{ libelle: "Peinture séjour", cout: 400, duree_vie_ans: 10, age_ans: 4, montant_retenu: 240 }],
      })
    );
    expect(doc.html).toContain("État des lieux de sortie");
    expect(doc.html).toContain("Synthèse");
    expect(doc.html).toContain("Murs — Séjour");
    expect(doc.html).not.toContain("Sols — Séjour</td>"); // pas d'écart → pas listé
    expect(doc.html).toContain("Comparatif chiffré et vétusté");
    expect(doc.html).toMatch(/240,00\s€/);
    expect(doc.html).toContain("Total des retenues après vétusté");
  });
});

// Rendu PDF réel des deux gros modèles (Chrome local uniquement) : les
// fichiers partent dans le scratchpad pour la comparaison visuelle aux épreuves.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const CHROME_LOCAL = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((c) => existsSync(c));
describe.skipIf(!CHROME_LOCAL)("Rendu PDF des modèles (Chrome local)", () => {
  it("bail nu et EDL de sortie se rendent en PDF multi-pages", { timeout: 90_000 }, async () => {
    process.env.GERIMMO_CHROME = CHROME_LOCAL;
    const { rendrePdf } = await import("../src/lib/documents/rendu");
    const dossier =
      "C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-Documents-vault-Gerimmo/ceefd2e8-ae36-45de-ae3c-959d39cbb275/scratchpad/pdf-generes";
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
      lignes: [
        { categorie: "piece", piece: "Séjour", libelle: "Sols", etat: "bon" as const, commentaire: null },
        { categorie: "piece", piece: "Séjour", libelle: "Murs", etat: "mauvais" as const, commentaire: "trous de chevilles" },
        { categorie: "piece", piece: "Chambre", libelle: "Sols", etat: "bon" as const, commentaire: null },
      ],
      compteurs: [{ type: "Électricité", numero: "E-778", releve: "48114" }],
      cles: [{ libelle: "Clé porte d'entrée", nombre: 2, reference: null }],
      comparatif: [{ libelle: "Murs — Séjour", etat_entree: "neuf", etat_sortie: "mauvais", ecart: true }],
      retenues: [{ libelle: "Peinture séjour", cout: 400, duree_vie_ans: 10, age_ans: 4, montant_retenu: 240 }],
      bailleurNom: "Claire Moreau",
      locatairesNoms: "Julie Leblanc",
      logementAdresse: "12 rue des Lilas, 69003 Lyon",
      referenceBail: "BAIL-0F3A21BC",
      exp: { nom: "Parc de Claire Moreau", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@x.fr", telephone: null, ville: "Lyon" },
      f: new Fusion(),
    });
    const pdfEdl = await rendrePdf(edl);
    writeFileSync(`${dossier}/test-edl-sortie.pdf`, pdfEdl);
  });
});
