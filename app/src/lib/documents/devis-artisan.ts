import { assemblerPage, cartouches, echapper, eur, Fusion, section, tableau, titre } from "./gabarit";
import { libelleQuantite, libelleTauxTva, type LigneDevisCalculee } from "../devis-structure";
export type DevisArtisanDocument = {
  artisan_adresse?: string; artisan_mentions?: string; artisan_logo?: string | null;
  id: string; description: string; lignes: LigneDevisCalculee[]; montant_ht_cents: number | null; montant_tva_cents: number | null; montant_ttc_cents: number;
  diagnostic: string | null; delai_intervention: string | null; duree_estimee: string | null; contraintes: string | null; observations: string | null;
  statut: string; depose_le: string; valide_jusqu_au: string; artisan_nom: string; artisan_siret: string; artisan_telephone: string | null; artisan_email: string | null;
  agence_nom: string; incident_numero: string; commune: string | null; code_postal: string | null;
};
const paragraphes = (texte: string) => texte.split(/\n+/).filter(Boolean).map(p => `<p>${echapper(p)}</p>`).join("");
export function assemblerDevisArtisan(d: DevisArtisanDocument) {
  const f=new Fusion();
  const brouillon = d.statut === "brouillon";
  const reference = `${brouillon ? "APERCU" : "DEV"}-${d.id.slice(0,8).toUpperCase()}`;
  const statut = ({valide:"Validé par l’artisan",brouillon:"Aperçu - non envoyé",depose:"Transmis pour décision",retenu:"Devis retenu",non_retenu:"Devis non retenu",expire:"Devis expiré",annule:"Devis annulé"} as Record<string,string>)[d.statut] ?? "Devis transmis";
  const identite=cartouches([
    ["Artisan",f.champ(d.artisan_nom,"Nom de l’artisan")], ["SIRET",f.champ(d.artisan_siret,"SIRET de l’artisan")],
    ["Destinataire",f.champ(d.agence_nom,"Organisation destinataire")], ["Dossier",f.champ(d.incident_numero,"Référence de l’incident")],
    [brouillon ? "Préparé le" : d.statut === "valide" ? "Établi le" : "Transmis le",f.date(d.depose_le)], ["Valable jusqu’au",f.date(d.valide_jusqu_au)],
  ]);
  const prix=d.lignes?.length ? tableau([{libelle:"Prestation / fourniture"},{libelle:"Quantité",droite:true},{libelle:"Prix HT",droite:true},{libelle:"TVA",droite:true},{libelle:"Total TTC",droite:true}],
    d.lignes.map(l => [echapper(l.libelle),echapper(libelleQuantite(l.quantite)),eur(l.prix_unitaire_ht_cents/100),libelleTauxTva(l.tva_bps),eur(l.montant_ttc_cents/100)])) : "";
  const sommes=cartouches([
    ...(d.montant_ht_cents!==null ? [["Total HT",eur(d.montant_ht_cents/100)] as [string,string]] : []),
    ...(d.montant_tva_cents!==null ? [["TVA",eur(d.montant_tva_cents/100)] as [string,string]] : []),
    ["Total TTC",eur(d.montant_ttc_cents/100)],
  ]);
  const contact=[d.artisan_telephone,d.artisan_email].filter(Boolean).join(" · ");
  const structure = Boolean(d.lignes?.length && d.diagnostic);
  const organisation = [
    d.delai_intervention ? `<p><strong>Délai d’intervention :</strong> ${echapper(d.delai_intervention)}</p>` : "",
    d.duree_estimee ? `<p><strong>Durée estimée :</strong> ${echapper(d.duree_estimee)}</p>` : "",
    d.contraintes ? section("Contraintes et accès") + paragraphes(d.contraintes) : "",
    d.observations ? section("Observations") + paragraphes(d.observations) : "",
  ].join("");
  const logo = d.artisan_logo && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d.artisan_logo)
    ? `<img src="${d.artisan_logo}" alt="Logo de l’entreprise" style="display:block;max-width:150px;max-height:48px;object-fit:contain;margin-bottom:12px" />` : "";
  const corps=logo+titre("Devis de travaux",`${echapper(reference)} · ${echapper(statut)}`,[])+identite+
    (d.artisan_adresse ? `<p><strong>Adresse de l’entreprise :</strong> ${echapper(d.artisan_adresse)}</p>` : "")+
    (d.artisan_mentions ? paragraphes(d.artisan_mentions) : "")+
    (contact ? `<p>${echapper(contact)}</p>` : "")+
    (d.commune ? `<p>Localisation : ${echapper([d.code_postal,d.commune].filter(Boolean).join(" "))}</p>` : "")+
    (structure ? section("Diagnostic")+paragraphes(d.diagnostic!) : section("Travaux proposés")+paragraphes(d.description))+
    (prix ? section("Prestations et fournitures")+prix : "")+`<div class="devis-totaux">${sommes}</div>`+
    (structure ? section("Organisation de l’intervention")+organisation : "")+
    `<p class="mention">${brouillon ? "Aperçu de travail : ce devis n’a pas encore été envoyé. La référence définitive sera attribuée à l’envoi. " : ""}Document généré par Gerimmo à partir des informations ${brouillon ? "saisies" : "transmises"} par l’artisan. Toute augmentation du total nécessite une demande complémentaire et un accord enregistré avant les travaux supplémentaires.</p>`;
  return assemblerPage({f,titreDocument:"Devis de travaux",nomPied:"Devis artisan · Gerimmo",reference,corps:`<style>
.devis-artisan h1{font-size:19pt;letter-spacing:.18em}
.devis-artisan .bloc-titre{padding:10pt 0;margin-bottom:8pt}
.devis-artisan .sous-titre{font-size:9pt;letter-spacing:.12em}
.devis-artisan h2{font-size:11pt;margin:12pt 0 6pt;padding-bottom:3pt}
.devis-artisan p{margin:4pt 0;text-align:left}
.devis-artisan .cartouches{margin:10pt 0;gap:0 20pt}
.devis-artisan .cartouches .case{padding:4pt 0 5pt}
.devis-artisan .devis-totaux .cartouches{grid-template-columns:repeat(3,1fr)}
.devis-artisan .devis-totaux .case:last-child{color:var(--encre);font-weight:700}
.devis-artisan td{padding-top:5pt;padding-bottom:5pt}
</style><main class="devis-artisan">${corps}</main>`});
}
