import { assemblerPage, cartouches, echapper, eur, Fusion, section, tableau, titre } from "./gabarit";
import type { LigneDevisCalculee } from "../devis-structure";
export type DevisArtisanDocument = {
  id: string; description: string; lignes: LigneDevisCalculee[]; montant_ht_cents: number | null; montant_tva_cents: number | null; montant_ttc_cents: number;
  diagnostic: string | null; delai_intervention: string | null; duree_estimee: string | null; contraintes: string | null; observations: string | null;
  statut: string; depose_le: string; valide_jusqu_au: string; artisan_nom: string; artisan_siret: string; artisan_telephone: string | null; artisan_email: string | null;
  agence_nom: string; incident_numero: string; commune: string | null; code_postal: string | null;
};
const paragraphes = (texte: string) => texte.split(/\n+/).filter(Boolean).map(p => `<p>${echapper(p)}</p>`).join("");
export function assemblerDevisArtisan(d: DevisArtisanDocument) {
  const f=new Fusion();
  const reference=`DEV-${d.id.slice(0,8).toUpperCase()}`;
  const statut = ({depose:"Transmis pour décision",retenu:"Devis retenu",non_retenu:"Devis non retenu",expire:"Devis expiré",annule:"Devis annulé"} as Record<string,string>)[d.statut] ?? "Devis transmis";
  const identite=cartouches([
    ["Artisan",f.champ(d.artisan_nom,"Nom de l’artisan")], ["SIRET",f.champ(d.artisan_siret,"SIRET de l’artisan")],
    ["Destinataire",f.champ(d.agence_nom,"Organisation destinataire")], ["Dossier",f.champ(d.incident_numero,"Référence de l’incident")],
    ["Transmis le",f.date(d.depose_le)], ["Valable jusqu’au",f.date(d.valide_jusqu_au)],
  ]);
  const prix=d.lignes?.length ? tableau([{libelle:"Prestation / fourniture"},{libelle:"Quantité",droite:true},{libelle:"Prix HT",droite:true},{libelle:"TVA",droite:true},{libelle:"Total TTC",droite:true}],
    d.lignes.map(l => [echapper(l.libelle),echapper(String(l.quantite)),eur(l.prix_unitaire_ht_cents/100),`${l.tva_bps/100} %`,eur(l.montant_ttc_cents/100)])) : "";
  const sommes=cartouches([
    ...(d.montant_ht_cents!==null ? [["Total HT",eur(d.montant_ht_cents/100)] as [string,string]] : []),
    ...(d.montant_tva_cents!==null ? [["TVA",eur(d.montant_tva_cents/100)] as [string,string]] : []),
    ["Total TTC",eur(d.montant_ttc_cents/100)],
  ]);
  const contact=[d.artisan_telephone,d.artisan_email].filter(Boolean).join(" · ");
  const corps=titre("Détail du devis transmis",`${echapper(reference)} · ${echapper(statut)}`,[])+identite+
    (contact ? `<p>${echapper(contact)}</p>` : "")+
    (d.commune ? `<p>Localisation : ${echapper([d.code_postal,d.commune].filter(Boolean).join(" "))}</p>` : "")+
    section("Travaux proposés")+paragraphes(d.description)+
    (prix ? section("Détail du prix")+prix : "")+sommes+
    `<p class="mention">Toute augmentation du total nécessite une demande complémentaire et un accord enregistré avant les travaux supplémentaires. Ce récapitulatif reprend le devis transmis dans Gerimmo ; les pièces jointes et les accords restent dans le dossier.</p>`;
  const document=assemblerPage({f,titreDocument:"Détail du devis",nomPied:"Devis artisan",reference,corps});
  // La marge de page se répète ; un padding du body ne protège que la première.
  document.html=document.html.replace("</style>","@page { margin-top:44pt; } body { padding-top:0; }</style>");
  return document;
}
