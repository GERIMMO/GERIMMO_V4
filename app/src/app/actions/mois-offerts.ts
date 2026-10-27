"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { clientStripe, configurationStripe } from "@/lib/stripe";
import { appliquerCreditOffert, type CreditOffert } from "@/lib/mois-offerts-stripe";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";
import { lireDecimal } from "@/lib/saisie-montant";
import { sansJargon } from "@/lib/erreurs";

export type EtatMoisOfferts = { erreur?: string; succes?: string; apercu?: { nature: string; reactivation?: boolean; fin?: string; montant_cents?: number; abonnement?: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function offrirMois(accountId: string, _etat: EtatMoisOfferts, form: FormData): Promise<EtatMoisOfferts> {
 const org = String(form.get("organisation") ?? ""), id = String(form.get("cadeau") ?? "");
 const lu = lireDecimal(form.get("mois"));
 const mois = "valeur" in lu ? lu.valeur : NaN, motif = String(form.get("motif") ?? "").trim();
 if (![org,id,accountId].every(v => UUID.test(v)) || !Number.isInteger(mois) || mois<1 || mois>12 || motif.length<5 || motif.length>500) {
  return { erreur: "Choisissez un espace, 1 à 12 mois et un motif de quelques mots." };
 }
 const supabase = await createClient();
 const garde = await supabase.rpc("is_permanent_super_admin");
 if (garde.error || garde.data !== true) return { erreur: "Reconnectez votre compte superadmin avec son second facteur." };
 const confirmer = form.get("confirmation") === "oui";
 let attendu: EtatMoisOfferts["apercu"] | null = null;
 try { attendu = JSON.parse(String(form.get("apercu") ?? "null")); } catch { return { erreur: "Vérifiez le cadeau avant de confirmer." }; }
 const { data, error } = await supabase.rpc("offrir_mois_abonnement", {
  p_id: id, p_compte: accountId, p_org: org, p_mois: mois, p_motif: motif, p_confirmer: confirmer, p_attendu: attendu,
 });
 if (error) return { erreur: sansJargon(error.message) };
 if (!data) return { erreur: "Le cadeau n’a pas pu être préparé." };
 if (!confirmer && !data.id) return { apercu: data };
 // Une confirmation rejouée renvoie la même ligne, jamais un nouveau crédit.
 if (data.nature === "credit" && !data.applique_le) {
  const config = configurationStripe();
  const service = clientDeService();
  if (!config.pret || !service) return { erreur: "Cadeau enregistré, crédit en attente : la connexion Stripe est indisponible. Réessayez cette même confirmation.", apercu: attendu ?? undefined };
  const verrou = await prendreVerrouFacturation(service, org, "cadeau");
  if (!verrou.ok) return { erreur: verrou.erreur, apercu: attendu ?? undefined };
  try {
   const reference = await appliquerCreditOffert(verrou.proteger(clientStripe(config.config)), data as CreditOffert);
   const solde = await service.rpc("mois_offert_credit_applique", { p_id: id, p_reference: reference });
   if (solde.error) throw new Error("Le crédit est transmis ; sa preuve reste à enregistrer. Réessayez la même confirmation.");
  } catch (e) {
   return { erreur: e instanceof Error ? e.message : "Crédit en attente. Réessayez cette même confirmation.", apercu: attendu ?? undefined };
  } finally { await verrou.rendre(); }
 }
 revalidatePath(`/admin/comptes/${accountId}`);
 revalidatePath(`/admin/organisations/${org}`);
 revalidatePath(`/espace/${org}`, "layout");
 revalidatePath(`/agence/${org}`, "layout");
 return { succes: data.nature === "acces"
  ? `${mois} mois offerts : accès jusqu’au ${String(data.fin).split("-").reverse().join("/")}, sans prélèvement automatique.`
  : `${mois} mois offerts : ${(Number(data.montant_cents)/100).toFixed(2).replace(".",",")} € de crédit sur les prochaines factures. Aucun paiement passé remboursé.` };
}
