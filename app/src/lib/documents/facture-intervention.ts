import { aujourdhuiParis } from "../ged";
import { lireLignesDevis, libelleQuantite, libelleTauxTva } from "../devis-structure";
import { assemblerPage, cartouches, echapper, eur, Fusion, tableau, titre } from "./gabarit";

function texte(form: FormData, cle: string, libelle: string, limite: number) {
  const valeur = form.get(cle);
  if (typeof valeur !== "string" || !valeur.trim() || valeur.length > limite) {
    throw new Error(`Vérifiez le champ « ${libelle} ».`);
  }
  return valeur.trim();
}

function jour(form: FormData, cle: string, libelle: string) {
  const valeur = texte(form, cle, libelle, 10);
  const date = new Date(valeur);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== valeur) {
    throw new Error(`Vérifiez la date de ${libelle}.`);
  }
  return valeur;
}

/** Note de travaux au particulier. Le formulaire de dépôt reste disponible pour les factures établies ailleurs. */
export function factureInterventionParticulier(form: FormData, artisan: {raison_sociale: string; siret: string}, incident: string) {
  const numero = texte(form, "numero", "Numéro de facture", 60);
  const client = texte(form, "client_facture", "Nom du client", 250);
  const adresse = texte(form, "adresse_client", "Adresse de facturation", 500);
  const adresseArtisan = texte(form, "adresse_entreprise", "Adresse de l’entreprise", 500);
  const lieu = texte(form, "lieu_travaux", "Adresse des travaux", 500);
  const mentions = texte(form, "mentions_facture", "Mentions de l’entreprise et de TVA", 3000);
  const reglement = texte(form, "conditions_facture", "Conditions de règlement", 1000);
  const dateTravaux = jour(form, "date_travaux", "réalisation");
  const echeance = jour(form, "date_echeance", "règlement");
  const emission = aujourdhuiParis();
  if (dateTravaux > emission || echeance < emission) throw new Error("La prestation doit être réalisée et l’échéance ne peut pas précéder la facture.");
  if (!artisan.raison_sociale.trim() || !/^\d{14}$/.test(artisan.siret)) throw new Error("Vérifiez le nom et le SIRET dans votre fiche entreprise.");
  if (form.get("confirmation_facture") !== "oui") throw new Error("Vérifiez les coordonnées, votre numéro de facture et les montants avant de transmettre.");
  const calcul = lireLignesDevis(form.get("lignes_devis"));
  const f = new Fusion();
  const identites = cartouches([
    ["Entreprise", echapper(artisan.raison_sociale)], ["SIRET", echapper(artisan.siret)],
    ["Adresse de l’entreprise", echapper(adresseArtisan)], ["Client particulier", echapper(client)],
    ["Adresse de facturation", echapper(adresse)], ["Lieu des travaux", echapper(lieu)],
    ["Émise le", f.date(emission)], ["Travaux réalisés le", f.date(dateTravaux)],
    ["Échéance", f.date(echeance)], ["Intervention", echapper(incident)],
  ]);
  const lignes = tableau([{libelle:"Prestation ou fourniture"}, {libelle:"Quantité"}, {libelle:"Prix unitaire HT"}, {libelle:"TVA"}, {libelle:"Total HT"}],
    calcul.lignes.map(l => [echapper(l.libelle), libelleQuantite(l.quantite), eur(l.prix_unitaire_ht_cents / 100), libelleTauxTva(l.tva_bps), eur(l.montant_ht_cents / 100)]));
  const tva = new Map<number, number>();
  for (const ligne of calcul.lignes) tva.set(ligne.tva_bps, (tva.get(ligne.tva_bps) ?? 0) + ligne.montant_tva_cents);
  const totaux: [string,string][] = [["Total HT", eur(calcul.montant_ht_cents / 100)]];
  for (const [taux,montant] of tva) totaux.push([`TVA ${libelleTauxTva(taux)}`, eur(montant / 100)]);
  totaux.push(["Total TTC", eur(calcul.montant_ttc_cents / 100)]);
  const corps = titre("Facture de travaux", echapper(numero), []) + identites + lignes + cartouches(totaux)
    + "<p style='white-space:pre-line'>" + echapper(mentions) + "</p><p>Conditions de règlement : " + echapper(reglement) + "</p>";
  return { montant: calcul.montant_ttc_cents, document: assemblerPage({f, titreDocument:"Facture de travaux", reference:numero, nomPied:artisan.raison_sociale, corps}) };
}
