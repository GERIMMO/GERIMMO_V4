// Dossiers fictifs uniquement. Aucune signature ni certification.
import { chromium } from "@playwright/test";

export async function piecesDemonstration() {
  const documents = [
    ["diagnostic","Diagnostic du logement","Fiche de lecture du diagnostic énergétique","Le logement dispose d’un chauffage électrique individuel et de fenêtres à double vitrage.","La classe affichée dans Gerimmo appartient au scénario de démonstration."],
    ["risques","État des risques","Annexe au dossier de location","Cette annexe présente le classement des pièces relatives aux risques du logement.","Aucune évaluation réelle des risques de cette adresse n’a été effectuée."],
    ["bail","Contrat de location","Logement loué à titre de résidence principale","Bailleur du scénario : Claire Morel. Locataire : Julie Leblanc.","Appartement côté cour, Résidence des Acacias, 18 rue des Acacias, Paris."],
  ];
  const navigateur=await chromium.launch();
  try {
    const page=await navigateur.newPage();
    const pieces={};
    for (const [code,titre,sousTitre,...paragraphes] of documents) {
      await page.setContent(`<html lang="fr"><meta charset="utf-8"><style>@page{size:A4;margin:25mm}body{font:15px/1.65 system-ui;color:#142b38}header{border-bottom:2px solid #b58d57;padding-bottom:22px}h1{font:40px Georgia;margin:48px 0 0}h2{font-size:17px}footer{margin-top:64px;font-size:12px;color:#536570}</style><header>GERIMMO · RÉSIDENCE DES ACACIAS</header><h1>${titre}</h1><h2>${sousTitre}</h2>${paragraphes.map(p=>`<p>${p}</p>`).join("")}<footer>Exemple de présentation · dossier fictif sans valeur contractuelle.</footer></html>`);
      pieces[code]=await page.pdf({preferCSSPageSize:true,printBackground:true});
    }
    return pieces;
  } finally { await navigateur.close(); }
}
