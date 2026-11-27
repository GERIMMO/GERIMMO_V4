import { neutraliserFormule } from "./csv-sur";
import { assemblerPage, echapper, Fusion, tableau, titre } from "./documents/gabarit";
import { eur, moisEnFrancais } from "./ged";
import { ventilerLoyers, type MontantsLoyer } from "./loyers-parc-mois";

const colonnes = ["Logement", "Locataire", "Attendu", "Reçu", "Compensé", "Reste dû"];
type LigneExport = Parameters<typeof ventilerLoyers>[0][number] & { lot_nom: string; locataire: string | null };
function chiffres({ attendu, recu, compense, resteDu }: MontantsLoyer) {
  return [attendu, recu, compense, resteDu];
}
function lignesRapport(lignes: ReadonlyArray<LigneExport>) {
  return lignes.map(ligne => {
    const valeur = ventilerLoyers([ligne]);
    if (!valeur) throw new Error("Montants de l’échéance indisponibles.");
    return { noms: [ligne.lot_nom, ligne.locataire ?? ""], valeurs: chiffres(valeur) };
  });
}

export function csvSuiviLoyers(lignes: ReadonlyArray<LigneExport>, totaux: MontantsLoyer) {
  function texte(valeur: string) { return `"${neutraliserFormule(valeur.trim()).replaceAll('"', '""')}"`; }
  function montants(valeurs: number[]) { return valeurs.map(v => v.toFixed(2).replace(".", ",")); }
  return "\ufeff" + [colonnes,
    ...lignesRapport(lignes).map(l => [...l.noms.map(texte), ...montants(l.valeurs)]),
    ["Total", "", ...montants(chiffres(totaux))],
  ].map(l => l.join(";")).join("\r\n") + "\r\n";
}

export function documentSuiviLoyers(lignes: ReadonlyArray<LigneExport>, totaux: MontantsLoyer, contexte: { mois: string; espace: string; selection: string }) {
  const lignesDuTableau = lignesRapport(lignes).map(l => [...l.noms.map(echapper), ...l.valeurs.map(eur)]);
  lignesDuTableau.push(["Total", "", ...chiffres(totaux).map(eur)]);
  return assemblerPage({
    f: new Fusion(), titreDocument: "Suivi des loyers", nomPied: "Suivi des loyers", reference: contexte.mois,
    corps: titre("Suivi des loyers", echapper(`${moisEnFrancais(contexte.mois)} · ${contexte.espace} · ${contexte.selection}`), [])
      + `<p>Récapitulatif de gestion des échéances sélectionnées. Les avances et les crédits non imputés sont exclus.</p>`
      + tableau(colonnes.map((libelle, i) => ({ libelle, droite: i >= 2 })), lignesDuTableau),
  });
}
