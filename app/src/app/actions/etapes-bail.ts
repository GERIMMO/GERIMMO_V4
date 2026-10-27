"use server";
import { avertissementsCoherenceLoyer } from "@/lib/coherence-loyer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { baseEspace } from "@/lib/racine-espace";
import { premier } from "@/lib/postgrest";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { CHAMPS_ETAPE_BAIL, champsDifferents, lireEtapeBail, lireValeursLues, type EtapeSaisieBail } from "@/lib/champs-etape-bail";
import { initialiserParcoursBail } from "@/lib/initialiser-parcours-bail";
import { bailPrecedentDuLot, valeursReprisesDuBail } from "@/lib/reprise-bail-precedent";
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
  // Une étape enregistrée entre-temps dans un autre onglet, ou par une autre
  // personne, n’est jamais écrasée sans le dire : la saisie reste affichée.
  const enregistrees = initialiserParcoursBail(bail, lot.meuble===true);
  const lues = lireValeursLues(form.get("valeurs_lues"));
  const ailleurs = lues ? champsDifferents(etape, lues, enregistrees) : [];
  if (ailleurs.length) return {erreur:"Cette étape a été enregistrée entre-temps dans un autre onglet ou par une autre personne. Rien n’a été enregistré : vérifiez les valeurs ci-dessous, puis enregistrez à nouveau.",valeurs,modifieesAilleurs:Object.fromEntries(ailleurs.map(nom=>[nom,enregistrees[nom]??""]))};
  const resultat = lireEtapeBail(etape,form,bail,{meuble:lot.meuble===true,surface:lot.surface_m2 == null ? null : Number(lot.surface_m2)});
  if (resultat.erreur || !resultat.patch) return {erreur:resultat.erreur,valeurs};
  let modification = supabase.from("baux").update(resultat.patch).eq("id",bailId).eq("organization_id",orgId).eq("etat","brouillon");
  // Recontrôler les valeurs financières liées à la validation, sans comparer
  // des horodatages dont certains adaptateurs réduisent la précision.
  for (const cle of ["type","loyer_hc","depot_garantie","charges_mode"]) {
    modification = bail[cle] == null ? modification.is(cle,null) : modification.eq(cle,bail[cle]);
  }
  const {data,error} = await modification.select("*");
  if(error) return {erreur:sansJargon(error.message),valeurs};
  if(!data?.length) return {erreur:"Le bail a changé pendant l’enregistrement. Rechargez le dossier avant de réessayer ; votre saisie reste affichée.",valeurs};
  revaliderBailEtLot(orgId, bailId, bail.lot_id, lot.bien_id, role === "proprietaire_direct");
  // La ligne relue après les déclencheurs devient la nouvelle référence du formulaire.
  const apres = initialiserParcoursBail({...bail,...resultat.patch,...data[0]}, lot.meuble===true);
  return {succes:"Étape enregistrée.",avertissements:avertissementsCoherenceLoyer({...bail,...resultat.patch},lot.surface_m2),valeursEnregistrees:Object.fromEntries(CHAMPS_ETAPE_BAIL[etape].map(nom=>[nom,apres[nom]??""]))};
}

/** Brouillon du lot encore vierge : ni chambre, ni locataire, ni date, ni loyer, ni personne rattachée.
 * Le plus ancien est repris plutôt que d’en créer un second (audit #264, FL-02 / CB-02). */
async function brouillonVierge(supabase: SupabaseClient, orgId: string, lotId: string): Promise<{ id: string | null } | { erreur: string }> {
  const {data:vierges,error}=await supabase.from("baux").select("id").eq("organization_id",orgId).eq("lot_id",lotId).eq("etat","brouillon")
    .is("chambre_id",null).is("locataire_principal",null).is("date_debut",null).is("loyer_hc",null).is("document_signe",null).is("signe_envoye_le",null)
    .order("created_at").order("id");
  if(error)return {erreur:"Les contrats déjà en préparation n’ont pas pu être vérifiés. Rechargez la fiche."};
  if(!vierges?.length)return {id:null};
  const {data:liens,error:lectureLiens}=await supabase.from("bail_personnes").select("bail_id").in("bail_id",vierges.map(b=>b.id));
  if(lectureLiens)return {erreur:"Les contrats déjà en préparation n’ont pas pu être vérifiés. Rechargez la fiche."};
  return {id:vierges.find(b=>!(liens??[]).some(l=>l.bail_id===b.id))?.id ?? null};
}

/** Créer le dossier de préparation et ouvrir son parcours dans la même réponse.
 * Un brouillon vierge du lot est repris : un second clic ne crée pas de contrat vide en double.
 * Un contrat individuel de colocation devient distinct dès que sa chambre est choisie à l’étape 1.
 * Les mentions restent exigées avant le PDF et l’activation. */
export async function commencerBail(orgId:string,lotId:string,bienId:string):Promise<EtatBail>{
  const {supabase,user,role}=await verifierGerant(orgId);
  if(!user)return {erreur:"Accès refusé."};
  const {data:lot,error:lecture}=await supabase.from("lots").select("id,meuble").eq("id",lotId).eq("bien_id",bienId).eq("organization_id",orgId).maybeSingle();
  if(lecture||!lot)return {erreur:"Ce logement n’est pas accessible. Rechargez sa fiche."};
  const existant=await brouillonVierge(supabase,orgId,lotId);
  if("erreur" in existant)return {erreur:existant.erreur};
  let bailId=existant.id;
  if(!bailId){
    // Relocation (décision du 27/10, CB-08) : le bail précédent le plus récent du lot propose son type (nu/meublé),
    // son loyer, ses charges et leur mode, son échéance et sa référence IRL ; l’étape Loyer le signale et tout reste
    // modifiable. Jamais le locataire, les garants, les dates ni le dépôt de garantie versé.
    const {data:precedents,error:lecturePrecedents}=await supabase.from("baux").select("id, chambre_id, type, date_debut, date_fin, date_sortie_reelle, loyer_hc, charges, charges_mode, jour_echeance, paiement_echeance, revision_irl, irl_trimestre, irl_valeur").eq("organization_id",orgId).eq("lot_id",lotId).in("etat",["termine","preavis"]);
    if(lecturePrecedents)return {erreur:"Les contrats précédents du logement n’ont pas pu être lus. Rechargez la fiche."};
    const precedent=bailPrecedentDuLot(precedents??[]);
    const typeDuLot=lot.meuble?"meuble":"nu";
    const {data,error}=await supabase.from("baux").insert({organization_id:orgId,lot_id:lotId,type:typeDuLot,etat:"brouillon",...(precedent?valeursReprisesDuBail(precedent,typeDuLot):{})}).select("id").single();
    if(error||!data)return {erreur:sansJargon(error?.message??"Le brouillon n’a pas pu être créé.")};
    bailId=String(data.id);
  }
  revaliderBailEtLot(orgId, bailId, lotId, bienId, role === "proprietaire_direct");
  // La navigation fait partie de l'action : aucun router.push client ne peut
  // être supplanté par la revalidation de la fiche du lot.
  redirect(`${baseEspace(orgId, role === "proprietaire_direct")}/baux/${bailId}#etape-bail-1`);
}
