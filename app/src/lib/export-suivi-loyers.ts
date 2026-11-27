import { neutraliserFormule } from "./csv-sur";
import { assemblerPage, echapper, Fusion, tableau, titre } from "./documents/gabarit";
import { eur, moisEnFrancais } from "./ged";
import { ventilerLoyers, type MontantsLoyer } from "./loyers-parc-mois";

const colonnesMontants = [
  { cle: "attendu", libelle: "Attendu" },
  { cle: "recu", libelle: "Reçu" },
  { cle: "compense", libelle: "Compensé" },
  { cle: "resteDu", libelle: "Reste dû" },
] as const;
type LigneExport = Parameters<typeof ventilerLoyers>[0][number] & { lot_nom: string; locataire: string | null };
type LoyerARattacher = Pick<LigneExport, "lot_nom" | "montant_du">;

const titreARattacher = "Loyers à rattacher, exclus du total";
const decrireLoyerARattacher = (l: LoyerARattacher) => `${l.lot_nom} · ${eur(Number(l.montant_du))} demandé`;

function preparerRapport(lignes: ReadonlyArray<LigneExport>, totaux: MontantsLoyer, format: (valeur: number) => string) {
  const montants = colonnesMontants.filter(c => c.cle !== "compense" || totaux.compense !== 0);
  const valeurs = (ligne: MontantsLoyer) => montants.map(c => c.cle === "compense" && ligne.compense === 0 ? "" : format(ligne[c.cle]));
  return {
    colonnes: ["Logement", "Locataire", ...montants.map(c => c.libelle)],
    lignes: lignes.map(ligne => {
      const montants = ventilerLoyers([ligne]);
      if (!montants) throw new Error("Montants de l’échéance indisponibles.");
      return { noms: [ligne.lot_nom, ligne.locataire ?? ""], valeurs: valeurs(montants) };
    }),
    total: ["Total", "", ...valeurs(totaux)],
  };
}

export function csvSuiviLoyers(lignes: ReadonlyArray<LigneExport>, totaux: MontantsLoyer, aRattacher: ReadonlyArray<LoyerARattacher> = []) {
  function texte(valeur: string) { return `"${neutraliserFormule(valeur.trim()).replaceAll('"', '""')}"`; }
  const rapport = preparerRapport(lignes, totaux, v => v.toFixed(2).replace(".", ","));
  // Les exclusions sont des notes, sans montant dans les colonnes que le lecteur peut additionner.
  const notes = aRattacher.length ? [titreARattacher, ...aRattacher.map(decrireLoyerARattacher)] : [];
  return "\ufeff" + [
    rapport.colonnes,
    ...rapport.lignes.map(l => [...l.noms.map(texte), ...l.valeurs]),
    rapport.total,
    ...notes.map(note => [texte(note), ...Array<string>(rapport.colonnes.length - 1).fill("")]),
  ].map(l => l.join(";")).join("\r\n") + "\r\n";
}

export function documentSuiviLoyers(lignes: ReadonlyArray<LigneExport>, totaux: MontantsLoyer, contexte: {
  mois: string; espace: string; selection: string; aRattacher?: ReadonlyArray<LoyerARattacher>;
}) {
  const rapport = preparerRapport(lignes, totaux, eur);
  const aRattacher = contexte.aRattacher ?? [];
  return assemblerPage({
    f: new Fusion(), titreDocument: "Suivi des loyers", nomPied: "Suivi des loyers", reference: contexte.mois,
    corps: titre("Suivi des loyers", echapper(`${moisEnFrancais(contexte.mois)} · ${contexte.espace} · ${contexte.selection}`), [])
      + `<p>Récapitulatif de gestion des échéances sélectionnées. Les avances et les crédits non imputés sont exclus.</p>`
      + tableau(rapport.colonnes.map((libelle, i) => ({ libelle, droite: i >= 2 })), [
        ...rapport.lignes.map(l => [...l.noms.map(echapper), ...l.valeurs]),
        rapport.total,
      ])
      + (aRattacher.length ? `<h2>${titreARattacher}</h2><ul>${aRattacher.map(l => `<li>${echapper(decrireLoyerARattacher(l))}</li>`).join("")}</ul>` : ""),
  });
}
