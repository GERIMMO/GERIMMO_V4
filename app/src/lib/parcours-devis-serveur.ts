import "server-only";
import { verifierArtisanLecture, verifierArtisanMutation, type LigneSollicitation } from "@/app/artisan/acces";
import { clientDeService } from "./supabase/service";
import type { PreparationDevis, ProfilDocumentArtisan } from "./parcours-devis-artisan";

/** Exception bornée au client de service : après identification de l'artisan
 * et preuve que la demande lui appartient via sa RPC, jamais depuis un ID client seul. */
export async function accesPreparationDevis(id: string, mutation = false) {
  const acces = await (mutation ? verifierArtisanMutation() : verifierArtisanLecture());
  const { fiche, supabase } = acces;
  // SA-07 : la garde de mutation donne la vraie raison (diagnostic en lecture
  // seule, accès indisponible) ; « Connectez-vous » n'est que le dernier repli.
  if (!fiche) throw new Error((acces as { erreur?: string }).erreur ?? "Connectez-vous à votre espace artisan.");
  const { data, error } = await supabase.rpc("mes_sollicitations");
  if (error) throw new Error("La demande ne peut pas être lue pour le moment.");
  const demande = (data as LigneSollicitation[] | null)?.find(d => d.sollicitation_id === id);
  if (!demande) throw new Error("Cette demande de devis ne vous est pas adressée.");
  const service = clientDeService();
  if (!service) throw new Error("Le service de préparation des devis doit être connecté.");
  return { fiche, supabase, service, demande };
}

export async function chargerPreparationDevis(id: string, mutation = false) {
  const acces = await accesPreparationDevis(id, mutation);
  const [{ data: preparation, error }, { data: profil, error: erreurProfil }] = await Promise.all([
    acces.service.from("artisan_devis_preparations").select("*").eq("sollicitation_id", id).eq("artisan_id", acces.fiche.artisan_id).maybeSingle(),
    acces.service.from("artisan_profils_documents").select("adresse,mentions,logo_data").eq("artisan_id", acces.fiche.artisan_id).maybeSingle(),
  ]);
  if (error || erreurProfil) throw new Error("La préparation des devis est indisponible. Réessayez dans un instant.");
  return { ...acces, preparation: preparation as PreparationDevis | null,
    profil: (profil ?? { adresse: "", mentions: "", logo_data: null }) as ProfilDocumentArtisan };
}
