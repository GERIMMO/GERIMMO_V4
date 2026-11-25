/**
 * Audit palier 1, P2-05 — lire un relevé de banque exporté, sur l'appareil.
 *
 * Ce que ce fichier prouve : les formats courants des exports français se lisent (point-virgule, virgule, tabulation,
 * colonnes « Débit / Crédit », montant signé, colonne « Sens », OFX), on ne retient que les crédits, et ce qui ne se
 * lit pas sans deviner est compté « illisible », jamais interprété.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decoderReleve, decouperDelimite, lireDateReleve, lireMontantReleve, lireReleve, normaliserTexte,
  OPERATIONS_MAX_RELEVE, type ReleveLu,
} from "@/lib/releve-bancaire";

const lu = (texte: string): ReleveLu => {
  const r = lireReleve(texte);
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
};

describe("montants d'un relevé", () => {
  it("lit les écritures françaises et anglaises sans ambiguïté, au centime", () => {
    const cas: [string, number][] = [
      ["800", 80000], ["800,00", 80000], ["800.00", 80000], ["800,5", 80050], ["+800,00", 80000],
      ["1 234,56", 123456], ["1 234,56", 123456], ["1 234,56 €", 123456], ["1.234,56", 123456],
      ["1,234.56", 123456], ["12.345,67", 1234567], ["1.234.567,89", 123456789], ["-45,10", -4510], ["45,10-", -4510],
      ["(45,10)", -4510], ["0,07", 7], ["\"650,00\"", 65000], ["650,00 EUR", 65000],
    ];
    for (const [texte, centimes] of cas) expect(lireMontantReleve(texte), texte).toBe(centimes);
  });

  it("refuse plutôt que deviner", () => {
    for (const texte of ["", " ", "1.234", "1,234", "12,345", "1.2.3", "12.34,56", "1e3", "0x10", "Infinity", "abc", "8 00,0 0x", ",50", "--5", "5,", "99999999999,00", "12.345.678,90"])
      expect(lireMontantReleve(texte), texte).toBeNull();
  });
});

describe("dates d'un relevé", () => {
  it("lit le jour d'abord, l'ISO et la forme compacte d'OFX", () => {
    expect(lireDateReleve("05/11/2026")).toBe("2026-11-05");
    expect(lireDateReleve("5/1/2026")).toBe("2026-01-05");
    expect(lireDateReleve("05-11-2026")).toBe("2026-11-05");
    expect(lireDateReleve("05.11.2026")).toBe("2026-11-05");
    expect(lireDateReleve("05/11/26")).toBe("2026-11-05");
    expect(lireDateReleve("05/11/2026 08:30")).toBe("2026-11-05");
    expect(lireDateReleve("2026-11-05")).toBe("2026-11-05");
    expect(lireDateReleve("2026-11-05T00:00:00")).toBe("2026-11-05");
    expect(lireDateReleve("20261105")).toBe("2026-11-05");
    expect(lireDateReleve("20261105120000[+1:CET]")).toBe("2026-11-05");
    expect(lireDateReleve("29/02/2028")).toBe("2028-02-29");
  });

  it("refuse un jour qui n'existe pas ou une forme inconnue", () => {
    for (const texte of ["", "31/02/2026", "29/02/2026", "00/11/2026", "05/13/2026", "2026-13-01", "novembre 2026", "5 nov. 2026", "05/11", "20261305", "05/11/1850"])
      expect(lireDateReleve(texte), texte).toBeNull();
  });
});

describe("relevé CSV", () => {
  it("point-virgule, préambule avant l'en-tête, montant signé : seuls les crédits restent", () => {
    const r = lu([
      "Compte courant n° 000123;;;",
      "Solde au 30/11/2026;1 520,10;;",
      "",
      "Date;Date de valeur;Libellé;Montant",
      "05/11/2026;05/11/2026;VIR SEPA M DURAND MARC LOYER NOVEMBRE;800,00",
      "06/11/2026;06/11/2026;PRLV EDF;-64,20",
      "07/11/2026;07/11/2026;\"VIR \"\"LEGRAND\"\"; studio\";+450,00",
      "",
    ].join("\r\n"));
    expect(r.format).toBe("csv");
    expect(r.lignes).toEqual([
      { position: 0, date: "2026-11-05", libelle: "VIR SEPA M DURAND MARC LOYER NOVEMBRE", centimes: 80000, rang: 0 },
      { position: 1, date: "2026-11-07", libelle: "VIR \"LEGRAND\"; studio", centimes: 45000, rang: 0 },
    ]);
    expect([r.debits, r.illisibles, r.tronque]).toEqual([1, 0, false]);
  });

  it("colonnes « Débit » et « Crédit », virgule comme séparateur, BOM, deux colonnes de libellé", () => {
    const r = lu("﻿Date opération,Libellé,Détail,Débit euros,Crédit euros\n05/11/2026,VIREMENT RECU,DURAND LOYER,,\"1 234,56\"\n06/11/2026,CARTE,BOULANGERIE,\"12,00\",\n");
    expect(r.lignes).toEqual([{ position: 0, date: "2026-11-05", libelle: "VIREMENT RECU DURAND LOYER", centimes: 123456, rang: 0 }]);
    expect(r.debits).toBe(1);
  });

  it("tabulations, colonne « Sens », en-têtes sans accent ni casse", () => {
    const r = lu("DATE COMPTABLE\tLIBELLE\tMONTANT\tSENS\n05/11/2026\tVIR DURAND\t800,00\tC\n06/11/2026\tRETRAIT DAB\t100,00\tD\n");
    expect(r.lignes.map((l) => [l.date, l.centimes])).toEqual([["2026-11-05", 80000]]);
    expect(r.debits).toBe(1);
  });

  it("sans intitulé de libellé connu, le libellé est fait des autres colonnes de texte (ni solde, ni devise)", () => {
    const r = lu("Date;Tiers payeur;Objet;Montant;Solde;Devise\n05/11/2026;DURAND MARC;LOYER;800,00;1500,00;EUR\n");
    expect(r.lignes[0].libelle).toBe("DURAND MARC LOYER");
  });

  it("une date ou un montant illisible n'est pas deviné : la ligne est comptée et ignorée", () => {
    const r = lu("Date;Libellé;Montant\n05/11/2026;VIR A;1.234\n31/02/2026;VIR B;800,00\n06/11/2026;VIR C;800,00\n");
    expect(r.lignes.map((l) => l.libelle)).toEqual(["VIR C"]);
    expect(r.illisibles).toBe(2);
  });

  it("deux virements jumeaux restent deux lignes, distinguées par leur rang", () => {
    const r = lu("Date;Libellé;Montant\n05/11/2026;VIR LOYER;500,00\n05/11/2026;Vir  loyer;500,00\n05/11/2026;VIR LOYER;500,00\n06/11/2026;VIR LOYER;500,00\n");
    expect(r.lignes.map((l) => l.rang)).toEqual([0, 1, 2, 0]);
  });

  it("un libellé est ramené à une ligne de 200 caractères", () => {
    const r = lu(`Date;Libellé;Montant\n05/11/2026;"VIR\n  DURAND\t${"X".repeat(400)}";800,00\n`);
    expect(r.lignes[0].libelle.startsWith("VIR DURAND XXX")).toBe(true);
    expect(r.lignes[0].libelle).toHaveLength(200);
  });

  it("au-delà de la limite d'opérations, la lecture s'arrête et le dit", () => {
    const lignes = Array.from({ length: OPERATIONS_MAX_RELEVE + 5 }, () => "05/11/2026;VIR;1,00").join("\n");
    const r = lu(`Date;Libellé;Montant\n${lignes}\n`);
    expect(r.lignes).toHaveLength(OPERATIONS_MAX_RELEVE);
    expect(r.tronque).toBe(true);
  });

  it("un fichier qui n'est pas un relevé est refusé avec ce qu'il faut faire", () => {
    for (const texte of ["Bonjour,\nceci est une lettre.", "a;b;c\n1;2;3\n", "%PDF-1.7 binaire"]) {
      const r = lireReleve(texte);
      expect("erreur" in r && r.erreur, texte).toMatch(/colonne « Date »/);
    }
    expect(lireReleve("  \n ")).toEqual({ erreur: "Ce fichier est vide." });
  });
});

describe("relevé OFX", () => {
  const OFX = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>800.00<FITID>1<NAME>VIR SEPA DURAND<MEMO>LOYER NOVEMBRE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106120000[+1:CET]<TRNAMT>-64.20<FITID>2<NAME>PRLV EDF</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261107<TRNAMT>+450,00<FITID>3<NAME>REMISE CHEQUE<MEMO>REMISE CHEQUE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>pas une date<TRNAMT>10.00<FITID>4<NAME>X</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it("lit la date, le montant, le nom et le mémo ; ignore les débits ; compte l'illisible", () => {
    const r = lu(OFX);
    expect(r.format).toBe("ofx");
    expect(r.lignes).toEqual([
      { position: 0, date: "2026-11-05", libelle: "VIR SEPA DURAND LOYER NOVEMBRE", centimes: 80000, rang: 0 },
      { position: 1, date: "2026-11-07", libelle: "REMISE CHEQUE", centimes: 45000, rang: 0 },
    ]);
    expect([r.debits, r.illisibles]).toEqual([1, 1]);
  });

  it("un OFX sans opération le dit", () => {
    expect(lireReleve("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>")).toEqual({ erreur: "Ce fichier OFX ne contient aucune opération." });
  });
});

describe("décodage et outils", () => {
  it("UTF-8 valide tel quel ; sinon Windows-1252 (les exports « Excel »)", () => {
    expect(decoderReleve(new TextEncoder().encode("Libellé;Crédit"))).toBe("Libellé;Crédit");
    // « Libellé » en Windows-1252 : é = 0xE9, invalide en UTF-8.
    expect(decoderReleve(new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]))).toBe("Libellé");
  });

  it("normalise un texte pour le comparer : majuscules, sans accent, ponctuation en espace", () => {
    expect(normaliserTexte("  Vir. SEPA — M. Dùrand-Lefèvre (loyer) ")).toBe("VIR SEPA M DURAND LEFEVRE LOYER");
  });

  it("découpe un texte délimité avec guillemets doublés et retour à la ligne dans un champ", () => {
    expect(decouperDelimite('a;"b;""c""";d\r\n"e\nf";g', ";")).toEqual([["a", 'b;"c"', "d"], ["e\nf", "g"]]);
  });

  it("le module ne dépend d'aucune API serveur : il tourne dans le navigateur", () => {
    const source = readFileSync("src/lib/releve-bancaire.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|use server/);
    // Lecture stricte : aucune conversion permissive d'un texte du fichier.
    expect(source).not.toMatch(/\b(parseFloat|parseInt|Number)\s*\(/);
  });
});
