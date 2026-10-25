"use server";

import { revalidatePath } from "next/cache";
import { chargerPreparationDevis } from "@/lib/parcours-devis-serveur";
import { brouillonDepuisFormulaire, type PreparationDevis } from "@/lib/parcours-devis-artisan";
import { proposerDevis } from "@/lib/proposition-devis-ia";
import { REFERENCES_TRAVAUX, type RepereHistorique } from "@/lib/references-prix-travaux";
import { verifierArtisanAction } from "../acces";
import { demandeAChiffrer } from "../libelles";
import { clientDeService } from "@/lib/supabase/service";
import { detecterMimeReel } from "@/lib/file-type";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { notifierDevisRecu } from "@/lib/notifications";
import { decalerJour } from "@/lib/agenda-gestion";
import { aujourdhuiParis } from "@/lib/ged";
import { effacerPdfPreparation, pdfRemplace } from "@/lib/devis-pdf-stockage";
import { reserverAppelIA } from "@/lib/plafond-ia";

export async function preparerPropositionDevis(id: string): Promise<{ preparation?: PreparationDevis; erreur?: string }> {
  try {
    const { service, fiche, demande, preparation } = await chargerPreparationDevis(id, true);
    if (preparation) return { preparation };
    if (!demandeAChiffrer(demande.statut)) throw new Error("Cette demande est close.");
    const { data: historique, error } = await service.rpc("reperes_devis_realises", { p_categorie: demande.categorie });
    if (error) throw new Error("Les références de prix ne sont pas disponibles. Vous pouvez saisir votre devis.");
    const proposition = await proposerDevis(demande.categorie, demande.description, (historique ?? []).map((h: RepereHistorique) => ({ ...h, nombre:Number(h.nombre), artisans:Number(h.artisans), moyenne_ht_cents:Number(h.moyenne_ht_cents) })), () => reserverAppelIA(service, "devis"));
    // Trente jours à partir du jour de Paris (le serveur est en UTC : son jour est celui de la veille entre minuit et 2 h).
    const validite = decalerJour(aujourdhuiParis(), 30);
    const { error: insertion } = await service.from("artisan_devis_preparations").upsert({
      sollicitation_id:id, artisan_id:fiche.artisan_id, proposition,
      saisie: { diagnostic:proposition.diagnostic, lignes:proposition.lignes, delai:"", duree:"", contraintes:"", observations:"", valideJusquAu:validite },
    }, { onConflict:"sollicitation_id", ignoreDuplicates:true });
    if (insertion) throw new Error("La proposition n’a pas pu être enregistrée.");
    return { preparation:(await chargerPreparationDevis(id, true)).preparation! };
  } catch (e) { return { erreur:e instanceof Error ? e.message : "La proposition est indisponible." }; }
}

export async function enregistrerBrouillonDevis(id: string, form: FormData): Promise<{ revision?: number; erreur?: string }> {
  try {
    const { service, fiche, demande, preparation } = await chargerPreparationDevis(id, true);
    // D18 (livraison 2) : une demande en révision rouvre le brouillon (la base l'a remis en « brouillon »).
    if (!demandeAChiffrer(demande.statut) || preparation?.statut === "envoye") throw new Error("Ce devis a déjà été envoyé.");
    const saisie = brouillonDepuisFormulaire(form);
    saisie.lignes = saisie.lignes.map(l => ({ ...l, code: REFERENCES_TRAVAUX.some(r=>r.code===l.code) ? l.code : "" }));
    const revision = Number(form.get("revision") ?? 0);
    if ((preparation?.revision ?? 0) !== revision) throw new Error("Le devis a changé dans une autre fenêtre. Rouvrez-le avant de continuer.");
    const donnees = { sollicitation_id:id, artisan_id:fiche.artisan_id, saisie, revision:revision+1, statut:"brouillon",
      pdf_path:null, pdf_sha:null, pdf_taille:null, valide_le:null, entreprise:null, updated_at:new Date().toISOString() };
    const requete = preparation
      ? service.from("artisan_devis_preparations").update(donnees).eq("sollicitation_id",id).eq("artisan_id",fiche.artisan_id).eq("revision",revision).neq("statut","envoye")
      : service.from("artisan_devis_preparations").insert(donnees);
    const { data, error } = await requete.select("revision").single();
    if (error || !data) throw new Error("Le brouillon a changé. Rouvrez-le avant de continuer.");
    // X17 (SUP-09) : le devis redevient brouillon, son PDF validé n'est plus référencé — on l'efface (jamais un devis envoyé).
    await effacerPdfPreparation(service, pdfRemplace(preparation, null));
    return { revision:data.revision };
  } catch (e) { return { erreur:e instanceof Error ? e.message : "Le brouillon n’a pas pu être enregistré." }; }
}

export async function enregistrerProfilDocuments(_etat: { erreur?: string; succes?: string }, form: FormData): Promise<{erreur?: string; succes?: string}> {
  try {
    const { fiche, erreur } = await verifierArtisanAction();
    if (!fiche) throw new Error(erreur ?? "Connectez-vous à votre espace artisan.");
    const service = clientDeService();
    if (!service) throw new Error("La fiche entreprise est indisponible.");
    const adresse = String(form.get("adresse") ?? "").trim();
    const mentions = String(form.get("mentions") ?? "").trim();
    if (!adresse || adresse.length>500 || mentions.length>3000) throw new Error("Complétez l’adresse et vérifiez la longueur des mentions.");
    const logo = form.get("logo");
    let logoData: string | undefined;
    if (logo instanceof File && logo.size) {
      if (logo.size>500000) throw new Error("Le logo doit peser moins de 500 Ko.");
      const octets = new Uint8Array(await logo.arrayBuffer());
      const mime = detecterMimeReel(octets);
      if (mime!=="image/png" && mime!=="image/jpeg") throw new Error("Choisissez un logo PNG ou JPEG.");
      logoData = `data:${mime};base64,${Buffer.from(octets).toString("base64")}`;
    }
    const { error } = await service.from("artisan_profils_documents").upsert({
      artisan_id:fiche.artisan_id, adresse, mentions, ...(logoData ? {logo_data:logoData} : {}), updated_at:new Date().toISOString(),
    }, {onConflict:"artisan_id"});
    if (error) throw new Error("Les informations n’ont pas pu être enregistrées.");
    revalidatePath("/artisan/entreprise");
    return { succes:"Informations enregistrées pour vos nouveaux devis. Pour un brouillon déjà créé, ouvrez le chantier et choisissez « Reprendre avec mes coordonnées à jour »." };
  } catch (e) { return { erreur:e instanceof Error ? e.message : "Enregistrement impossible." }; }
}

export async function envoyerDevisValide(id: string, _etat: { erreur?: string }, form: FormData): Promise<{ erreur?: string }> {
  let email = "echec";
  try {
    const { preparation, supabase, service, fiche, demande } = await chargerPreparationDevis(id, true);
    if (!preparation || preparation.statut==="brouillon" || !preparation.pdf_path) throw new Error("Validez d’abord votre devis pour générer le PDF.");
    if (Number(form.get("revision"))!==preparation.revision) throw new Error("Le devis a changé. Relisez et validez sa dernière version.");
    const {data:fichier,error:lecture}=await service.storage.from(preparation.pdf_bucket).download(preparation.pdf_path);
    if (lecture||!fichier) throw new Error("Le PDF validé est indisponible. L’envoi n’a pas été effectué.");
    const octets=Buffer.from(await fichier.arrayBuffer());
    if(createHash("sha256").update(octets).digest("hex")!==preparation.pdf_sha) throw new Error("L’intégrité du PDF n’a pas pu être vérifiée. L’envoi est interrompu.");
    // Classer le PDF dans l'espace du demandeur seulement à l'envoi. Le
    // compartiment de préparation n'est lisible que par le serveur autorisé.
    if(preparation.statut!=="envoye" && preparation.pdf_bucket!=="documents") {
      const {error:depot}=await supabase.storage.from("documents").upload(preparation.pdf_path,octets,{contentType:"application/pdf"});
      if(depot) {
        // Une reprise après un dépôt réussi mais un classement interrompu
        // réutilise uniquement les mêmes octets, jamais un fichier différent.
        const {data:existant}=await service.storage.from("documents").download(preparation.pdf_path);
        if(!existant || createHash("sha256").update(Buffer.from(await existant.arrayBuffer())).digest("hex")!==preparation.pdf_sha)
          throw new Error("Le PDF n’a pas pu être classé. Réessayez l’envoi.");
      }
    }
    const {data:devisId,error}=await supabase.rpc("envoyer_mon_devis_prepare",{p_sollicitation:id,p_revision:preparation.revision});
    if(error||typeof devisId!=="string") throw new Error(error?.message??"Votre profil ne permet plus de déposer cette révision. Le gestionnaire a été prévenu ; votre devis est conservé.");
    if(preparation.email_statut==="envoye") email="envoye";
    else {
      const notification=await notifierDevisRecu(service,demande.organization_id,devisId,{
        nom:`DEV-${preparation.reference_id.slice(0,8).toUpperCase()}.pdf`,contenuBase64:octets.toString("base64"),
      });
      email=notification.envoyee?"envoye":"echec";
      await service.from("artisan_devis_preparations").update({email_statut:email,updated_at:new Date().toISOString()})
        .eq("sollicitation_id",id).eq("artisan_id",fiche.artisan_id).eq("devis_id",devisId).eq("statut","envoye");
    }
    revalidatePath("/artisan/devis"); revalidatePath(`/artisan/devis/${id}`);
    revalidatePath(`/agence/${demande.organization_id}/incidents`);
  } catch(e) { return {erreur:e instanceof Error ? e.message : "L’envoi n’a pas abouti."}; }
  redirect(`/artisan/devis/${id}?envoye=1&email=${email}`);
}
