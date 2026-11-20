import { createClient } from "@/lib/supabase/server";

export async function SuiviSignatureDevisArtisan({sollicitationId}:{sollicitationId:string}) {
  const db=await createClient();
  const {data,error}=await db.rpc("lire_signature_devis_archive",{p_sollicitation:sollicitationId});
  if(error||!data) return null;
  const termine=data.etat==="termine";
  const lien=`/api/devis/${sollicitationId}/signature`;
  return <section className="artisan-carte space-y-3">
    <h2>Acceptation de votre devis</h2>
    <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">{termine?"Le client a signé son acceptation. La mission et le rendez-vous restent à confirmer dans Gerimmo.":data.etat==="pret"?"Le client prépare la signature de votre offre.":["annule","refuse","expire"].includes(data.etat)?"Le circuit de signature a été arrêté. Consultez le suivi de la demande.":"La signature du client est en cours. Votre offre et son PDF restent inchangés."}</p>
    {data.essai&&<p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Essai fictif sans engagement.</p>}
    {termine&&<div className="flex flex-wrap gap-x-6 gap-y-1"><a className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-[var(--encre)] underline underline-offset-4" target="_blank" rel="noreferrer" href={lien}>Télécharger l’acceptation signée</a><a className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-[var(--encre)] underline underline-offset-4" target="_blank" rel="noreferrer" href={`${lien}?preuve=1`}>Certificat de signature</a></div>}
  </section>;
}
