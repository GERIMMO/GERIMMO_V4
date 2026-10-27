"use server";
import { avertissementsCoherenceLoyer } from "@/lib/coherence-loyer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { baseEspace } from "@/lib/racine-espace";
import { premier } from "@/lib/postgrest";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { CHAMPS_ETAPE_BAIL, lireEtapeBail, type EtapeSaisieBail } from "@/lib/champs-etape-bail";
import type { EtatBail } from "./baux";

function revaliderBailEtLot(orgId: string, bailId: string, lotId: string, bienId: string | null | undefined, proprietaire: boolean) {
  // Conserver la route partagée et actualiser aussi l'adresse consultée par
  // le propriétaire, réécrite par le proxy vers cette même route.
  const bases = [baseEspace(orgId, false), ...(proprietaire ? [baseEspace(orgId, true)] : [])];
  for (const base of bases) {
    revalidatePath(`${base}/baux/${bailId}`);
    if (bienId) revalidatePath(`${base}/parc/${bienId}/lots/${lotId}`);
  }
}

export async function modifierEtapeBail(orgId: string, bailId: string, etape: EtapeSaisieBail, _etat: EtatBail, form: FormData): Promise<EtatBail> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(form);
  if (!Object.hasOwn(CHAMPS_ETAPE_BAIL, etape)) return { erreur: "Étape inconnue.", valeurs };
  const {data: bail,error: lecture} = await supabase.from("baux").select("*,lot:lots!baux_lot_meme_org_fk(meuble,surface_m2,bien_id)").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
  if (lecture) return {erreur:"Le bail n’a pas pu être relu. Votre saisie est conservée.",valeurs};
  if (!bail || bail.etat !== "brouillon") return {erreur:"Seul un bail en brouillon accessible peut être modifié.",valeurs};
  const lot = premier(bail.lot);
  if (!lot) return {erreur:"Le logement n’a pas pu être vérifié.",valeurs};
  const resultat = lireEtapeBail(etape,form,bail,{meuble:lot.meuble===true,surface:lot.surface_m2 == null ? null : Number(lot.surface_m2)});
  if (resultat.erreur || !resultat.patch) return {erreur:resultat.erreur,valeurs};
  let modification = supabase.from("baux").update(resultat.patch).eq("id",bailId).eq("organization_id",orgId).eq("etat","brouillon");
  // Recontrôler les valeurs financières liées à la validation, sans comparer
  // des horodatages dont certains adaptateurs réduisent la précision.
  for (const cle of ["type","loyer_hc","depot_garantie","charges_mode"]) {
    modification = bail[cle] == null ? modification.is(cle,null) : modification.eq(cle,bail[cle]);
  }
  const {data,error} = await modification.select("id");
  if(error) return {erreur:sansJargon(error.message),valeurs};
  if(!data?.length) return {erreur:"Le bail a changé pendant l’enregistrement. Rechargez le dossier avant de réessayer ; votre saisie reste affichée.",valeurs};
  revaliderBailEtLot(orgId, bailId, bail.lot_id, lot.bien_id, role === "proprietaire_direct");
  return {succes:"Étape enregistrée.",avertissements:avertissementsCoherenceLoyer({...bail,...resultat.patch},lot.surface_m2)};
}

/** Créer le dossier de préparation et ouvrir son parcours dans la même réponse.
 * Les mentions restent exigées avant le PDF et l’activation. */
export async function commencerBail(orgId:string,lotId:string,bienId:string):Promise<EtatBail>{
  const {supabase,user,role}=await verifierGerant(orgId);
  if(!user)return {erreur:"Accès refusé."};
  const {data:lot,error:lecture}=await supabase.from("lots").select("id,meuble").eq("id",lotId).eq("bien_id",bienId).eq("organization_id",orgId).maybeSingle();
  if(lecture||!lot)return {erreur:"Ce logement n’est pas accessible. Rechargez sa fiche."};
  const {data,error}=await supabase.from("baux").insert({organization_id:orgId,lot_id:lotId,type:lot.meuble?"meuble":"nu",etat:"brouillon"}).select("id").single();
  if(error||!data)return {erreur:sansJargon(error?.message??"Le brouillon n’a pas pu être créé.")};
  revaliderBailEtLot(orgId, data.id, lotId, bienId, role === "proprietaire_direct");
  // La navigation fait partie de l'action : aucun router.push client ne peut
  // être supplanté par la revalidation de la fiche du lot.
  redirect(`${baseEspace(orgId, role === "proprietaire_direct")}/baux/${data.id}#etape-bail-1`);
}
