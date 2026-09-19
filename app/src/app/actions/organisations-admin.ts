"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { normaliserCode } from "@/lib/parrainage";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatOuverture = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

/**
 * Ouvrir une organisation depuis la console (RM-16.1.1).
 *
 * Entre la demande reçue sur le site et le client qui se connecte, il fallait
 * jusqu'ici ouvrir un client SQL : insérer l'organisation, insérer l'adhésion,
 * fabriquer le compte de son responsable. Le geste le plus commercial du
 * produit était le seul à ne pas exister.
 *
 * Deux temps, et pas un : la base crée (organisation, compte, adhésion), puis
 * l'application envoie l'invitation — par le même chemin que « mot de passe
 * oublié », celui qui sert déjà à inviter un locataire. Une base ne poste pas
 * de courrier.
 */
export async function ouvrirOrganisation(
  _etat: EtatOuverture,
  formData: FormData
): Promise<EtatOuverture> {
  const supabase = await createClient();
  const valeurs = valeursDuFormulaire(formData);

  const nom = String(formData.get("nom") ?? "").trim();
  const type = String(formData.get("type") ?? "agence");
  const email = String(formData.get("email") ?? "").trim();
  const active = formData.get("active") !== null;
  const jours = Number(String(formData.get("essai_jours") ?? "14"));
  const demande = String(formData.get("demande_id") ?? "").trim();
  // Le code de parrainage (19/09) : facultatif ; s'il est là, il doit être
  // bien formé ET connu AVANT d'ouvrir quoi que ce soit — une organisation
  // créée puis un rattachement refusé laisserait la supervision devant un
  // écran de succès pour un geste à moitié fait.
  const codeSaisi = String(formData.get("code_parrainage") ?? "").trim();
  const codeParrainage = codeSaisi ? normaliserCode(codeSaisi) : null;

  if (!nom) return { erreur: "Le nom de l'organisation est obligatoire.", valeurs };
  if (!email) return { erreur: "L'adresse du responsable est obligatoire.", valeurs };
  if (!active && (!Number.isFinite(jours) || jours < 0 || jours > 365)) {
    return { erreur: "La durée d'essai doit tenir entre 0 et 365 jours.", valeurs };
  }
  if (codeSaisi && !codeParrainage) {
    return { erreur: "Le code de parrainage n'a pas la bonne forme : huit lettres ou chiffres, comme 3FA2B9C0.", valeurs };
  }
  if (codeParrainage) {
    const { data: parrain } = await supabase
      .from("organizations")
      .select("id")
      .eq("code_parrainage", codeParrainage)
      .neq("status", "archivee")
      .maybeSingle();
    if (!parrain) return { erreur: "Code de parrainage inconnu.", valeurs };
  }

  const { data, error } = await supabase.rpc("ouvrir_organisation", {
    p_nom: nom,
    p_type: type,
    p_email_responsable: email,
    p_essai_jours: active ? 0 : jours,
    p_active_immediatement: active,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  const ligne = ((data ?? []) as {
    organization_id: string;
    email_responsable: string;
    compte_deja_existant: boolean;
  }[])[0];
  if (!ligne) return { erreur: "L'organisation n'a pas pu être ouverte.", valeurs };

  // L'invitation : le responsable définit son mot de passe par le lien reçu.
  // Si elle échoue, on ne perd PAS l'organisation — on le dit, et le super
  // admin peut renvoyer l'invitation depuis la fiche.
  const origine = (await headers()).get("origin") ?? "";
  const { error: erreurMail } = await supabase.auth.resetPasswordForEmail(
    ligne.email_responsable,
    { redirectTo: `${origine}/auth/confirm?next=/nouveau-mot-de-passe` }
  );

  if (demande) {
    // La demande qui a mené à cette ouverture n'a plus à être retraitée.
    await supabase.rpc("demande_devis_traitee", { p_demande: demande });
    revalidatePath("/admin/devis");
  }
  // Le rattachement, une fois l'organisation née. Le code a été vérifié plus
  // haut ; un refus ici serait une course (parrain archivé entre-temps) et
  // se dit dans le journal plutôt que de faire échouer une ouverture réussie.
  if (codeParrainage) {
    const { error: erreurParrainage } = await supabase.rpc("enregistrer_parrainage", {
      p_filleul: ligne.organization_id,
      p_code: codeParrainage,
    });
    if (erreurParrainage) console.error("[ouverture] parrainage non enregistré:", erreurParrainage.message);
  }
  revalidatePath("/admin");

  if (erreurMail) {
    redirect(
      `/admin/organisations/${ligne.organization_id}?ouverte=1&mail=${encodeURIComponent(
        sansJargon(erreurMail.message)
      )}`
    );
  }
  redirect(`/admin/organisations/${ligne.organization_id}?ouverte=1`);
}
