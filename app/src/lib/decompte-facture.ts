import { assemblerPage, Fusion, echapper, eur, formaterDateFr, tableau, titre } from "./documents/gabarit";
import type { RepartitionFourniture } from "./proposition-repartition";

export function documentPartFacture(r: RepartitionFourniture, bail: string, contexte: {
  bailleur: string; locataire: string; logement: string; adresse: string; reference: string; fournisseur: string; debut:string; fin:string;
}) {
  const f = new Fusion();
  const parts = r.lignes.filter(l=>l.bail_id===bail && l.recuperable);
  const montant = parts.reduce((s,l)=>s+Number(l.montant_cents),0);
  const corps = titre("Répartition d’une facture", contexte.reference, []) +
    `<p>Bailleur : ${f.champ(contexte.bailleur,"Bailleur")}<br>Locataire : ${f.champ(contexte.locataire,"Locataire")}<br>Logement : ${f.champ(contexte.logement,"Logement")}<br>${f.champ(contexte.adresse,"Adresse")}</p>` +
    `<p>Facture ${echapper(contexte.reference)} · ${echapper(contexte.fournisseur)}<br>Période du ${formaterDateFr(contexte.debut)} au ${formaterDateFr(contexte.fin)}</p>`+
    `<p>Méthode : ${echapper(r.motif)}</p>` +
    tableau([{libelle:"Période retenue"},{libelle:"Index et consommation"},{libelle:"Part attribuée",droite:true}], parts.map(l=>{
      const m=r.source?.compteurs?.find(m=>m.id===l.compteur_id && m.periode_debut===l.periode_debut && m.periode_fin===l.periode_fin);
      return [`${formaterDateFr(l.periode_debut ?? contexte.debut)} – ${formaterDateFr(l.periode_fin ?? contexte.fin)}`,m?`${m.debut} → ${m.fin} · ${Number((m.fin-m.debut).toFixed(3))} ${echapper(m.unite==="m3"?"m³":m.unite)}`:"Clé enregistrée",eur(l.montant_cents/100)];
    })) +
    `<p><strong>Votre part de cette facture : ${eur(montant/100)}</strong></p><p>Ce document présente la répartition de cette facture à titre informatif. Aucun paiement supplémentaire n’est demandé par cet envoi. Les provisions seront prises en compte lors de la régularisation des charges. L’exercice reste ouvert.</p>`;
  return assemblerPage({f,titreDocument:"Répartition de facture",nomPied:"Information sur les charges",reference:`REP-${r.id}-${bail}`,corps});
}
