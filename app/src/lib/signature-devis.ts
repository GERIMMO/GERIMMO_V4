import type { SupabaseClient } from "@supabase/supabase-js";
import { assemblerPage, echapper, Fusion } from "./documents/gabarit";
import type { ContexteBail } from "./documents/modeles/communs";
import { ajouterPagesSignature, empreinteSignatureBail, partiesSignatureBail, type AnnexeSignature } from "./signature-bail";
import { marquerDocumentEssai, signatureEnEssai } from "./signature-essai";
import type { SelectionSignature } from "./politique-signature";

type DevisSignature = {
  id:string; incident_id:string; lot_id:string; artisan_nom:string; version:number;
  montant_ttc_cents:number; valide_jusqu_au:string; depose_le:string; expire_le:string;
  proprietaires:ContexteBail["bailleurs"]; document:AnnexeSignature;
};

/** L'offre validée par l'artisan est jointe telle quelle, jamais rééditée.
 * Le client signe son acceptation de cette version précise ; la mission
 * reste une décision séparée après réception des preuves. */
export async function assemblerSignatureDevis(db:SupabaseClient,org:string,selection:SelectionSignature) {
  const res=await db.rpc("lire_signature_devis",{p_org:org,p_devis:selection.cibleId});
  if(res.error || !res.data) throw new Error(res.error?.message ?? "Devis inaccessible.");
  const devis=res.data as DevisSignature;
  const {signataires,manquants}=partiesSignatureBail({organisation:{type:"proprietaire_direct"},bailleurs:devis.proprietaires,locataires:[],garants:[]},false);
  const annexes=[devis.document];
  const reference=`DEVIS-${devis.id}-V${devis.version}`;
  const montant=(devis.montant_ttc_cents/100).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
  const original=assemblerPage({f:new Fusion(),titreDocument:"Acceptation du devis",nomPied:"Acceptation du devis",reference,
    corps:`<h1>Acceptation du devis</h1><p>Référence : ${echapper(reference)}</p>
      <h2>Offre de ${echapper(devis.artisan_nom)}</h2>
      <p>Version ${devis.version} · montant total TTC : <strong>${echapper(montant)}</strong></p>
      <p>Offre déposée le ${echapper(devis.depose_le.slice(0,10))} et valable jusqu’au ${echapper(devis.valide_jusqu_au)}.</p>
      <p>En signant, les propriétaires ci-dessous acceptent les travaux, prix et conditions de cette offre, annexée dans son intégralité. Ils reconnaissent en avoir pris connaissance. Aucun texte ni tarif du devis de l’artisan n’a été modifié.</p>
      <p>Le démarrage de l’intervention reste à convenir avec l’artisan selon les conditions du devis. Cette acceptation ne déclenche aucun paiement automatique.</p>`});
  const document=ajouterPagesSignature(signatureEnEssai(org)?marquerDocumentEssai(original):original,signataires,annexes,"Acceptation du devis");
  return {document,empreinte:empreinteSignatureBail(document.html,signataires),signataires,manquants,annexes,bailId:null,selection,incidentId:devis.incident_id,expireLe:devis.expire_le,
    titreGed:`Acceptation du devis — ${devis.artisan_nom} — v${devis.version}`,
    liens:[{entite:"lot" as const,entiteId:devis.lot_id},...signataires.map(p=>({entite:"personne" as const,entiteId:p.personId}))]};
}
