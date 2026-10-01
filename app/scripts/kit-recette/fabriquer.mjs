#!/usr/bin/env node
// Fabrique le kit de recette « Propriétaire bailleur » : les quatre PDF de
// lecture, le tableau de suivi (xlsx, via suivi.py) et toutes les pièces
// fictives, puis l'archive zip.
//
//   node scripts/kit-recette/fabriquer.mjs --sortie /chemin/de/sortie
//
// Prérequis : Playwright (Chromium) du projet, python3 + openpyxl, zip.
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EUR, fermerNavigateur, iban } from "./commun.mjs";
import * as D from "./documents.mjs";
import { jpegVitreFelee, pngSignature } from "./images.mjs";
import { pdfFiche, pdfLire, pdfPersonnage, pdfRemontee } from "./kit.mjs";
import * as P from "./donnees/proprietaire.mjs";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const sortie = args[args.indexOf("--sortie") + 1];
if (!sortie || args.indexOf("--sortie") < 0) {
  console.error("Usage : node fabriquer.mjs --sortie <dossier>");
  process.exit(1);
}

const NOM_KIT = "03-proprietaire-bailleur";
const racine = path.join(sortie, NOM_KIT);
const docs = path.join(racine, "documents");
await rm(racine, { recursive: true, force: true });
await mkdir(docs, { recursive: true });

const F = P.FICHIERS;
const fichiers = []; // [chemin relatif à documents/, usage]
const doc = (rel) => path.join(docs, rel);
function noter(rel, usage) {
  fichiers.push([rel, usage]);
}

const adressePersona = `${P.persona.civilite} ${P.persona.prenom} ${P.persona.nom.toUpperCase()}<br>${P.persona.adresse}<br>${P.persona.cp} ${P.persona.ville}`;
const bien1 = { designation: P.bien1.designation, adresse: `${P.bien1.adresse}, ${P.bien1.cp} ${P.bien1.ville}`, annee: P.bien1.annee, surface: `${String(P.bien1.surface).replace(".", ",")} m²`, chauffage: "Individuel gaz (chaudière murale) / Individuelle gaz", entretienChaudiere: "17/04/2026", elecInfo: "Prévoir le remplacement d'un cache de prise fêlé (séjour)", mesuresPlomb: 61 };
const immeuble1 = { designation: "Immeuble du Prototype (parties communes)", adresse: bien1.adresse, annee: P.bien1.annee, argiles: "moyenne" };
const bien2 = { designation: P.bien2.designation, adresse: `${P.bien2.adresse}, ${P.bien2.cp} ${P.bien2.ville}`, annee: P.bien2.annee, surface: `${String(P.bien2.surface).replace(".", ",")} m²`, chauffage: "Individuel électrique / Individuelle électrique (ballon)" };
const immeuble2 = { designation: "Immeuble du Gabarit (parties communes)", adresse: bien2.adresse, annee: P.bien2.annee, argiles: "faible" };

// 01 — identité
await pngSignature(doc(F.signature), P.persona.signature);
noter(F.signature, "Signature préenregistrée (PRO-03)");
await D.pdfRib(doc(F.rib), P.persona, P.ibanPersona, "d'Orsay");
noter(F.rib, "Votre RIB fictif, pour mémoire (IBAN du profil)");

// 02 — diagnostics du Prototype
const d1 = P.diags.bien1;
const cab = P.cabinet;
const diag = async (rel, spec, usage) => {
  await D.pdfDiagnostic(doc(rel), { cabinet: cab, ...spec });
  noter(rel, usage);
};
await diag(`${F.d1}/DPE-lot-D2.pdf`, { type: "dpe", numero: "EG-2026-204-01", bien: bien1, realise: d1.dpe[0], expire: d1.dpe[1], classe: P.bien1.dpe }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/electricite-lot-D2.pdf`, { type: "elec", numero: "EG-2026-204-02", bien: bien1, realise: d1.elec[0], expire: d1.elec[1] }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/gaz-lot-D2.pdf`, { type: "gaz", numero: "EG-2026-204-03", bien: bien1, realise: d1.gaz[0], expire: d1.gaz[1] }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/plomb-CREP-lot-D2.pdf`, { type: "crep", numero: "EG-2026-204-04", bien: bien1, realise: d1.crep[0] }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/amiante-privatif-lot-D2.pdf`, { type: "amiante", numero: "EG-2026-204-05", bien: bien1, realise: d1.amiante[0] }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/ERP-immeuble.pdf`, { type: "erp", numero: "EG-2026-204-06", bien: immeuble1, realise: d1.erp[0], expire: d1.erp[1] }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/amiante-parties-communes-immeuble.pdf`, { type: "amiantePC", numero: "EG-2026-204-07", bien: immeuble1, realise: d1.amiantePC[0] }, "Diagnostic du Prototype (PRO-05)");
await diag(`${F.d1}/secours/DPE-lot-D2-copie-de-secours.pdf`, { type: "dpe", numero: "EG-2026-204-01b", bien: bien1, realise: d1.dpe[0], expire: d1.dpe[1], classe: P.bien1.dpe, copie: true }, "Copie de secours, si un premier dépôt a échoué (PRO-05)");

// 03 — diagnostics du Gabarit
const d2 = P.diags.bien2;
await diag(`${F.d2}/DPE-lot-S1.pdf`, { type: "dpe", numero: "EG-2026-211-01", bien: bien2, realise: d2.dpe[0], expire: d2.dpe[1], classe: P.bien2.dpe }, "Diagnostic du Studio du Gabarit (PRO-06)");
await diag(`${F.d2}/electricite-lot-S1.pdf`, { type: "elec", numero: "EG-2026-211-02", bien: bien2, realise: d2.elec[0], expire: d2.elec[1] }, "Diagnostic du Studio du Gabarit (PRO-06)");
await diag(`${F.d2}/ERP-immeuble.pdf`, { type: "erp", numero: "EG-2026-211-03", bien: immeuble2, realise: d2.erp[0], expire: d2.erp[1] }, "Diagnostic du Studio du Gabarit (PRO-06)");

// 04 — dossier de Thomas
const loc = P.locataire;
await D.pdfPieceIdentite(doc(`${F.dossier}/piece-identite-thomas-girard.pdf`), loc);
noter(`${F.dossier}/piece-identite-thomas-girard.pdf`, "Dossier de Thomas déposé par vous (PRO-09)");
for (const [mois, label, paie] of [["2026-06", "juin 2026", "29/06/2026"], ["2026-07", "juillet 2026", "30/07/2026"], ["2026-08", "août 2026", "28/08/2026"]]) {
  const rel = `${F.dossier}/bulletin-salaire-${mois}-thomas-girard.pdf`;
  await D.pdfBulletin(doc(rel), { salarie: loc, employeur: P.employeurLocataire, mois, moisLabel: label, paiementLe: paie, brut: P.brutLocataire });
  noter(rel, "Dossier de Thomas déposé par vous (PRO-09)");
}
await D.pdfAttestationEmployeur(doc(`${F.dossier}/attestation-employeur-thomas-girard.pdf`), { salarie: loc, employeur: P.employeurLocataire, brut: P.brutLocataire, date: "16/09/2026", signataire: "A. Lefebvre" });
noter(`${F.dossier}/attestation-employeur-thomas-girard.pdf`, "Dossier de Thomas déposé par vous (PRO-09)");

// 05 — bail signé
await D.pdfBailSigne(doc(F.bailSigne), {
  bailleur: `${adressePersona.replace(/<br>/g, ", ")}, né le ${P.persona.naissance} à ${P.persona.lieuNaissance}.`,
  locataire: `${loc.civilite} ${loc.prenom} ${loc.nom.toUpperCase()}, né(e) le ${loc.naissance} à ${loc.lieuNaissance}.`,
  logement: `${bien1.adresse} — Lot ${P.bien1.lot} — ${P.bien1.designation.split("— ")[1]} — ${bien1.surface}, ${P.bien1.pieces} pièces principales. Annexe : ${P.bien1.locauxPrivatifs}. Construction : ${P.bien1.annee}. Chauffage : ${P.bien1.chauffage.toLowerCase()}.`,
  equipements: ["Cuisine équipée (plaques gaz, hotte)", "Chaudière murale gaz (chauffage et eau chaude)", "Fenêtres double vitrage, volets battants"],
  priseEffet: "21 septembre 2026",
  loyer: P.bail.loyer,
  charges: P.bail.charges,
  depot: P.bail.depot,
  lieuSignature: P.persona.ville,
  dateSignature: "19 septembre 2026",
  signatureBailleur: P.persona.signature,
  signatureLocataire: "T. Girard",
});
noter(F.bailSigne, "Exemplaire signé à déposer (PRO-11)");

// 06 — incident
await jpegVitreFelee(doc(F.vitre));
noter(F.vitre, "Photo de l'incident que vous déclarez (PRO-18)");

// 07 — livre recettes-dépenses
const L = F.livre;
await D.pdfAppelDeFonds(doc(`${L}/appel-de-fonds-syndic-T4-2026-prototype.pdf`), { syndic: P.syndic, destinataire: adressePersona, copro: `Immeuble du Prototype — ${bien1.adresse}`, lot: `Lot ${P.bien1.lot} — ${P.bien1.designation.split("— ")[1]}`, trimestre: "4ᵉ trimestre 2026", emisLe: "01/10/2026", limite: "15/10/2026", postes: P.chiffres.appelSyndic });
noter(`${L}/appel-de-fonds-syndic-T4-2026-prototype.pdf`, "Appel du syndic à joindre (PRO-20)");
await D.pdfTaxeFonciere(doc(`${L}/avis-taxe-fonciere-2026-prototype.pdf`), { proprietaire: adressePersona, bien: bien1.adresse, tfpb: P.chiffres.taxeFonciere - P.chiffres.teom, teom: P.chiffres.teom, limite: "15/10/2026" });
noter(`${L}/avis-taxe-fonciere-2026-prototype.pdf`, "Justificatif à ranger dans Documents (PRO-19) ; redéposé en PRO-23");
await D.pdfAttestationPno(doc(`${L}/attestation-assurance-PNO-2026.pdf`), { assure: adressePersona, bien: bien1.adresse, contrat: "MFE-PNO-2026-6440", cotisation: P.chiffres.pno, date: "03/01/2026" });
noter(`${L}/attestation-assurance-PNO-2026.pdf`, "Justificatif à ranger dans Documents (PRO-19)");
await D.pdfFacture(doc(`${L}/facture-travaux-salle-de-bain-2026.pdf`), { fournisseur: { initiales: "PS", nom: "Plomberie Fictive Services", adresse: "9 rue du Siphon, 91400 Orsay" }, numero: "F-2026-0912", date: "24/09/2026", client: adressePersona, objet: `Joints de la salle de bain et remplacement du mitigeur avant location — ${bien1.adresse}`, lignes: [{ libelle: "Dépose et réfection des joints silicone (douche, lavabo)", montant: 145 }, { libelle: "Fourniture et pose d'un mitigeur de lavabo", montant: 240 }], note: "Travaux d'entretien déductibles (dépense de réparation et d'entretien)." });
noter(`${L}/facture-travaux-salle-de-bain-2026.pdf`, "Justificatif à ranger dans Documents (PRO-19)");
const interets = await D.pdfAmortissement(doc(`${L}/tableau-amortissement-pret-2026.pdf`), { emprunteur: `${P.persona.civilite} ${P.persona.prenom} ${P.persona.nom.toUpperCase()}`, objet: `acquisition — ${bien1.adresse}`, ...P.chiffres.pret });
noter(`${L}/tableau-amortissement-pret-2026.pdf`, "Justificatif à ranger dans Documents (PRO-19)");
if (Math.abs(interets - P.interetsPret) > 0.01) throw new Error(`Intérêts incohérents : ${interets} vs ${P.interetsPret}`);

// ── Les quatre PDF de lecture et le suivi ───────────────────────────────────
const kit = {
  role: "Propriétaire bailleur",
  prefixe: "PRO",
  heroFiche: `${P.persona.prenom} ${P.persona.nom}, propriétaire de deux biens, gère seul sans agence`,
  heroPersonnage: `Vous possédez deux appartements en Essonne et les gérez vous-même, sans agence. Vous louez le T2 d'${P.bien1.ville} à Thomas Girard ; le studio d'${P.bien2.ville} est vide.`,
  persona: P.persona,
  phases: P.phases,
  sections: P.sectionsPersonnage({ signature: F.signature, liste: fichiers.sort((a, b) => a[0].localeCompare(b[0])) }),
};
await pdfLire(path.join(racine, "00-A-lire-en-premier.pdf"), P.guide);
await pdfFiche(path.join(racine, "01-Fiche-de-tests-proprietaire-bailleur.pdf"), kit);
await pdfPersonnage(path.join(racine, "02-Mon-personnage-proprietaire-bailleur.pdf"), kit);
await pdfRemontee(path.join(racine, "03-Fiche-de-remontee.pdf"), P.remontee);

const lignes = P.phases.flatMap((p) => p.tests.map((t) => [t.id, p.titre, t.titre, t.resultat]));
const json = path.join(sortie, "suivi-proprietaire.json");
await writeFile(json, JSON.stringify({ role: "Propriétaire bailleur", lignes }));
execFileSync("python3", [path.join(ICI, "suivi.py"), json, path.join(racine, "04-Suivi-des-tests-proprietaire-bailleur.xlsx")], { stdio: "inherit" });
await rm(json);

await fermerNavigateur();

const zip = path.join(sortie, `Kit-recette-Gerimmo-${NOM_KIT}.zip`);
await rm(zip, { force: true });
execFileSync("zip", ["-qr", zip, NOM_KIT], { cwd: sortie });
console.log(`Kit fabriqué : ${zip} (${fichiers.length} pièces, ${lignes.length} tests)`);
console.log(`Intérêts 2026 du prêt : ${EUR(interets)} ; IBAN ${iban("00018", "00006440018").affiche}`);
