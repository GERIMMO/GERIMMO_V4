import { assemblerPage, Fusion, echapper, eur, formaterDateFr, tableau, titre, section } from "./documents/gabarit";

export type BrouillonRegularisationFourniture = {
  id: string; bail_id: string; annee: number; empreinte: string; regularisation_id: string | null;
  source: { annee: number; locataire: string; logement: string; adresse: string;
    provisions: number; charges_reelles: number; ecart: number;
    factures: { repartition_id: string; document_id: string; facture_id: string; reference: string; fournisseur: string; debut: string; fin: string; montant_cents: number }[] };
};
export function documentRegularisationFournitures(d: BrouillonRegularisationFourniture, etaler: boolean) {
  const f = new Fusion(); const s = d.source;
  const corps = titre("Décompte annuel de charges", `Exercice ${d.annee}`, []) +
    `<p>Locataire : ${f.champ(s.locataire, "Nom du locataire")}<br>Logement : ${f.champ(s.logement, "Nom du logement")}<br>${f.champ(s.adresse, "Adresse du logement")}</p>` +
    section(`Parts de l’exercice ${d.annee} affectées à votre bail`) + tableau([{ libelle: "Facture / fournisseur" }, { libelle: "Période" }, { libelle: "Votre part", droite: true }], s.factures.map(x => [echapper(`${x.reference} · ${x.fournisseur}`), `${formaterDateFr(x.debut)} – ${formaterDateFr(x.fin)}`, eur(Number(x.montant_cents) / 100)])) +
    `<p>Ces parts reprennent uniquement les périodes de cet exercice dans les décomptes vérifiés. Pour une consommation mesurée entre deux index, la date du dernier index ouvre la période suivante. Aucune part ne figure sur deux exercices ; aucun second prorata n’est appliqué.</p>` +
    tableau([{ libelle: "Récapitulatif" }, { libelle: "Montant", droite: true }], [["Charges réelles affectées", eur(Number(s.charges_reelles))], ["Provisions appelées sur l’exercice", eur(Number(s.provisions))], [Number(s.ecart) >= 0 ? "Solde en faveur du locataire" : "Complément de charges", eur(Math.abs(Number(s.ecart)))]]) +
    `<p>Les éventuels loyers ou provisions impayés restent suivis séparément dans le compte locataire. Ce décompte ne constitue ni une quittance ni une preuve de remboursement.</p>` +
    (etaler ? "<p>Le complément de cette régularisation tardive est enregistré en douze mensualités, conformément à la demande du locataire.</p>" : "") +
    `<p>Pièces de référence : ${s.factures.map(x => echapper(x.reference)).join(", ")}. Les justificatifs peuvent être consultés auprès du gestionnaire.</p>`;
  return assemblerPage({ f, titreDocument: `Décompte de charges ${d.annee}`, nomPied: "Régularisation des charges", reference: `REG-${d.id}`, corps });
}
