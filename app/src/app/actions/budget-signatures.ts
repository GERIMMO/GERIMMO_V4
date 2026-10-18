"use server";
import {createClient} from "@/lib/supabase/server";
import {revalidatePath} from "next/cache";
import {lireDecimal} from "@/lib/saisie-montant";
import {sansJargon} from "@/lib/erreurs";
export type EtatBudgetSignature={erreur?:string;succes?:string};
export async function reglerBudgetSignatures(_:EtatBudgetSignature,form:FormData):Promise<EtatBudgetSignature>{
 const lecture=lireDecimal(form.get("credits")),revisionLue=lireDecimal(form.get("revision"));
 if("erreur" in lecture || "erreur" in revisionLue) return {erreur:"Choisissez un plafond en crédits entiers ou demi-crédits."};
 const credits=lecture.valeur,revision=revisionLue.valeur;
 if(!Number.isSafeInteger(credits*2)||credits<0||credits>1_000_000||!Number.isSafeInteger(revision)||revision<1) return {erreur:"Choisissez un plafond en crédits entiers ou demi-crédits."};
 const db=await createClient();
 const {data:user}=await db.auth.getUser();
 if(!user.user)return {erreur:"Connectez-vous à votre compte superadmin."};
 const {error}=await db.rpc("regler_budget_signature",{p_plafond:credits*2,p_revision:revision});
 if(error)return {erreur:sansJargon(error.message)};
 revalidatePath("/admin/sante");
 return {succes:"Plafond enregistré. Les nouveaux envois le respecteront. Aucun crédit n’a été acheté."};
}
