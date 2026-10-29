"use server";
import { lireAnneeExercice } from "@/lib/annee-exercice";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import { documentRegularisationFournitures, type BrouillonRegularisationFourniture } from "@/lib/regularisation-fournitures";
import { rendrePdf } from "@/lib/documents/rendu";
import { preparerFichierGed, abandonnerPieceGed } from "@/lib/ged-depot";

export type EtatRegularisationFournitures = { erreur?: string; succes?: string; brouillon?: BrouillonRegularisationFourniture; documentId?: string };
export async function preparerRegularisationFournitures(orgId: string, bailId: string, _etat: EtatRegularisationFournitures, f: FormData): Promise<EtatRegularisationFournitures> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "regularisation_charges", cible: bailId });
  const annee = lireAnneeExercice(f.get("annee"));
  if (!user || !estUuid(bailId) || annee === null) return { erreur: "Vérifiez le bail et l’exercice." };
  const { data: id, error } = await supabase.rpc("preparer_regularisation_fourniture", { p_org: orgId, p_bail: bailId, p_annee: annee });
  if (error || !id) return { erreur: sansJargon(error?.message ?? "Le brouillon n’a pas pu être préparé.") };
  const { data, error: lecture } = await supabase.from("brouillons_regularisation_fourniture").select("*").eq("id", id).eq("organization_id", orgId).single();
  if (lecture || !data) return { erreur: "Le brouillon est conservé, mais sa lecture a échoué. Réessayez." };
  return { brouillon: data as BrouillonRegularisationFourniture };
}
export async function emettreRegularisationFournitures(orgId: string, bailId: string, id: string, _etat: EtatRegularisationFournitures, f: FormData): Promise<EtatRegularisationFournitures> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "regularisation_charges", cible: bailId });
  if (!user || ![bailId, id].every(estUuid)) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.from("brouillons_regularisation_fourniture").select("*").eq("id", id).eq("organization_id", orgId).eq("bail_id", bailId).single();
  if (error || !data) return { erreur: "Ce brouillon n’est pas accessible." };
  const d = data as BrouillonRegularisationFourniture;
  if (d.regularisation_id) return { succes: "Cette régularisation est déjà enregistrée." };
  if (f.get("empreinte") !== d.empreinte) return { erreur: "Le brouillon a changé. Recalculez-le puis vérifiez les nouveaux montants." };
  if (f.get("complet") !== "on") return { erreur: "Confirmez que toutes les charges de l’exercice sont présentes." };
  const etaler = f.get("etaler") === "on";
  try {
    const pdf = await rendrePdf(documentRegularisationFournitures(d, etaler));
    const prep = await preparerFichierGed(supabase, orgId, new File([new Uint8Array(pdf)], `decompte-charges-${d.annee}.pdf`, { type: "application/pdf" }), false, true);
    if (!prep.fichier) return { erreur: prep.erreur ?? "Le décompte n’a pas pu être conservé." };
    const piece = prep.fichier;
    const r = await supabase.rpc("emettre_regularisation_fourniture", { p_org: orgId, p_brouillon: id, p_empreinte: d.empreinte, p_complet: true, p_exercice_en_cours: f.get("exercice_en_cours") === "on", p_etaler: etaler, p_storage_path: piece.chemin, p_mime: piece.mime, p_taille: piece.taille, p_fichier_empreinte: piece.empreinte });
    if (r.error || !r.data) { await abandonnerPieceGed(supabase, piece); return { erreur: sansJargon(r.error?.message ?? "La régularisation n’a pas été enregistrée.") }; }
    const lecture = await supabase.from("regularisations_charges").select("justificatif_document,documents!regularisations_charges_justificatif_document_fkey(storage_path)").eq("id", r.data).eq("organization_id", orgId).single();
    // Un double clic peut préparer deux fichiers : seule la pièce liée à la
    // régularisation gagne, l’autre part à la purge sans seconde émission.
    const lie = lecture.data?.documents as unknown as { storage_path?: string } | null;
    if (lie?.storage_path && lie.storage_path !== piece.chemin) await abandonnerPieceGed(supabase, piece);
    revalidatePath(`/espace/${orgId}`, "layout"); revalidatePath(`/agence/${orgId}`, "layout"); revalidatePath(`/locataire/${orgId}`, "layout");
    return { succes: "Régularisation enregistrée. Le décompte est disponible dans les documents du bail et du locataire.", documentId: lecture.data?.justificatif_document ?? undefined };
  } catch (e) { return { erreur: sansJargon(e instanceof Error ? e.message : "Le décompte n’a pas pu être préparé. Réessayez.") }; }
}
