import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { assemblerDevisArtisan, type DevisArtisanDocument } from "@/lib/documents/devis-artisan";
import { rendrePdf } from "@/lib/documents/rendu";
import { chargerPreparationDevis } from "@/lib/parcours-devis-serveur";
import { lireSaisieDevisArtisan } from "@/lib/saisie-devis-artisan";
import { REFERENCES_TRAVAUX } from "@/lib/references-prix-travaux";
import { abandonnerPdfDepose, COMPARTIMENT_PREPARATIONS, effacerPdfPreparation, pdfRemplace } from "@/lib/devis-pdf-stockage";
import { demandeAChiffrer } from "@/app/artisan/libelles";
export const runtime = "nodejs";
const entetes = { "Content-Type":"application/pdf", "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" };

/** Validation explicite, PDF immuable et privé. Aucun envoi à cette étape. */
export async function POST(request: Request, context: { params: Promise<{sollicitationId:string}> }) {
  const erreur = (message: string, status: number) => Response.json({ erreur:message }, {status,headers:{"Cache-Control":"private, no-store"}});
  const { sollicitationId } = await context.params;
  let acces: Awaited<ReturnType<typeof chargerPreparationDevis>>;
  try { acces = await chargerPreparationDevis(sollicitationId, true); }
  catch { return erreur("Connectez-vous avec le compte artisan destinataire de cette demande.",403); }
  const { fiche, service, demande, preparation, profil } = acces;
  // D18 (livraison 2) : une demande en révision attend une nouvelle version : le formulaire est ouvert.
  if(!demandeAChiffrer(demande.statut)) return erreur("Cette demande est close.",409);
  let form: FormData; let saisie: ReturnType<typeof lireSaisieDevisArtisan>;
  try {
    form=await request.formData();
    if(form.get("validation_artisan")!=="oui") return erreur("Confirmez avoir relu les prestations, prix et conditions avant de valider.",422);
    saisie=lireSaisieDevisArtisan(form);
  } catch(e) { return erreur(e instanceof Error ? e.message : "Vérifiez les informations du devis.",422); }
  if(!profil.adresse) return erreur("Complétez l’adresse de votre entreprise dans Ma fiche entreprise avant de valider.",422);
  const revision=Number(form.get("revision")??0);
  if((preparation?.revision??0)!==revision) return erreur("Ce devis a changé dans une autre fenêtre. Rouvrez-le avant de le valider.",409);
  const id=preparation?.reference_id??randomUUID();
  const brutes=JSON.parse(String(form.get("lignes_devis")));
  const lignes=saisie.calcul.lignes.map((l,i)=>({...l,code:REFERENCES_TRAVAUX.some(r=>r.code===brutes[i]?.code)?brutes[i].code:""}));
  const instant=new Date().toISOString();
  const entreprise={artisan_nom:fiche.raison_sociale,artisan_siret:fiche.siret,artisan_telephone:fiche.telephone,artisan_email:fiche.email,
    artisan_adresse:profil.adresse,artisan_mentions:profil.mentions,artisan_logo:profil.logo_data};
  const doc=assemblerDevisArtisan({
    id,...saisie.calcul,...entreprise,description:saisie.prestations,diagnostic:saisie.diagnostic,
    delai_intervention:saisie.delai,duree_estimee:saisie.duree,contraintes:saisie.contraintes||null,observations:saisie.observations||null,
    statut:"valide",depose_le:instant,valide_jusqu_au:saisie.valideJusquAu,agence_nom:demande.agence_nom,
    incident_numero:demande.incident_numero,commune:demande.ville,code_postal:demande.code_postal,
  });
  if(doc.manquants.length) return erreur(`Complétez ces informations : ${doc.manquants.join(", ")}.`,422);
  // X17 (SUP-09) : le PDF déposé n'est « à nous » que tant que la base ne répond pas que la mise à jour a réussi ;
  // ensuite c'est l'ANCIEN PDF qui n'est plus référencé et qu'on efface (lib/devis-pdf-stockage.ts).
  let cheminDepose: string | null = null;
  try {
    const pdf=await rendrePdf(doc);
    const chemin=`${demande.organization_id}/devis-gerimmo/${randomUUID()}.pdf`;
    const {error:upload}=await service.storage.from(COMPARTIMENT_PREPARATIONS).upload(chemin,pdf,{contentType:"application/pdf"});
    if(upload) return erreur("Le PDF n’a pas pu être enregistré. Vos saisies sont conservées.",503);
    cheminDepose=chemin;
    const enregistrement={sollicitation_id:sollicitationId,artisan_id:fiche.artisan_id,reference_id:id,revision:revision+1,
      saisie:{diagnostic:saisie.diagnostic,delai:saisie.delai,duree:saisie.duree,contraintes:saisie.contraintes,observations:saisie.observations,
        valideJusquAu:saisie.valideJusquAu,prestations:saisie.prestations,lignes,
        // D18 (livraison 2) : « ce qui change », lu par la base au dépôt d'une version suivante.
        noteRevision:saisie.noteRevision},entreprise,statut:"valide",valide_le:instant,
      pdf_bucket:"devis-preparations",pdf_path:chemin,pdf_sha:createHash("sha256").update(pdf).digest("hex"),pdf_taille:pdf.length,updated_at:instant};
    const q=preparation?service.from("artisan_devis_preparations").update(enregistrement).eq("sollicitation_id",sollicitationId).eq("artisan_id",fiche.artisan_id).eq("revision",revision).neq("statut","envoye")
      :service.from("artisan_devis_preparations").insert(enregistrement);
    const {data,error}=await q.select("revision").single();
    if(error||!data) {
      await abandonnerPdfDepose(service,sollicitationId,fiche.artisan_id,chemin);
      return erreur("Le devis a changé pendant la génération. Validez de nouveau la version à jour.",409);
    }
    // La mise à jour a réussi : l'ancien PDF n'est plus référencé par personne.
    cheminDepose=null;
    await effacerPdfPreparation(service,pdfRemplace(preparation,chemin));
    return new Response(Buffer.from(pdf),{headers:{...entetes,"Content-Disposition":`inline; filename="${doc.reference}.pdf"`,"X-Devis-Revision":String(data.revision)}});
  } catch {
    // Incident après le dépôt : on ne sait pas si la mise à jour a abouti ; le PDF n'est effacé que si la base ne le référence pas.
    await abandonnerPdfDepose(service,sollicitationId,fiche.artisan_id,cheminDepose);
    return erreur("Le PDF n’a pas pu être généré. Vos saisies sont conservées : réessayez.",503);
  }
}

export async function GET(_request: Request, context: { params: Promise<{sollicitationId:string}> }) {
  const {sollicitationId}=await context.params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return pageErreurFichier(403,"Connexion nécessaire","Connectez-vous pour consulter ce devis.","depuis vos devis");
  const {data,error}=await supabase.rpc("lire_devis_structure",{p_sollicitation:sollicitationId});
  // Un destinataire ne lit que les devis envoyés (RPC ci-dessus). L'artisan
  // peut également relire son PDF validé avant de l'envoyer.
  if(error||!data) {
    try {
      const acces=await chargerPreparationDevis(sollicitationId);
      if(!acces.preparation||acces.preparation.statut==="brouillon") throw new Error("Pas de PDF validé");
    } catch { return pageErreurFichier(403,"Devis indisponible","Ce devis n’existe pas ou votre compte n’a pas accès à ce dossier.","depuis vos devis"); }
  }
  const service=clientDeService();
  if(!service) return pageErreurFichier(503,"Document indisponible","La lecture du PDF enregistré est momentanément indisponible.","depuis vos devis");
  if(service) {
    const {data:prepare,error:lecture}=await service.from("artisan_devis_preparations").select("pdf_path,pdf_sha,pdf_bucket,reference_id,statut").eq("sollicitation_id",sollicitationId).maybeSingle();
    if(lecture) return pageErreurFichier(503,"Document indisponible","La lecture du document a échoué. Réessayez.","depuis vos devis");
    if(prepare?.pdf_path && prepare.statut!=="brouillon") {
      const {data:fichier,error:download}=await service.storage.from(prepare.pdf_bucket).download(prepare.pdf_path);
      if(!download&&fichier) {
        const octets=Buffer.from(await fichier.arrayBuffer());
        if(createHash("sha256").update(octets).digest("hex")===prepare.pdf_sha) return new Response(octets,{headers:{...entetes,"Content-Disposition":`inline; filename="DEV-${prepare.reference_id.slice(0,8).toUpperCase()}.pdf"`}});
      }
      return pageErreurFichier(503,"Document indisponible","Le PDF validé ne peut pas être lu. Réessayez dans un instant.","depuis vos devis");
    }
  }
  if(!data) return pageErreurFichier(503,"Document indisponible","La lecture du PDF validé est momentanément indisponible.","depuis vos devis");
  const doc=assemblerDevisArtisan(data as DevisArtisanDocument);
  if(doc.manquants.length) return pageErreurFichier(422,"Informations à compléter",`Complétez ces informations : ${doc.manquants.join(", ")}.`,"depuis vos devis");
  try {return new Response(Buffer.from(await rendrePdf(doc)),{headers:{...entetes,"Content-Disposition":`inline; filename="${doc.reference}.pdf"`}});}
  catch{return pageErreurFichier(503,"Document momentanément indisponible","La préparation du devis n’a pas abouti. Réessayez.","depuis vos devis");}
}
