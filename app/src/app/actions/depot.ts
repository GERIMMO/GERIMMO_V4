"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { lireMontant, verifierDateDejaPassee } from "@/lib/saisie-montant";
import { estRejeuCleEnvoi, lireCleEnvoi, messageDejaEnregistre } from "@/lib/cle-envoi";

export type EtatDepot = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
  // D05, PR178-B-06 : cet envoi (même clé) était déjà enregistré. `succes` le dit ; rien n'a été écrit de plus.
  dejaEnregistre?: boolean;
};

// D05 (PR178-B-06) : le formulaire envoie une clé (`cle_envoi`), la même à chaque nouvel envoi du même formulaire.
// `encaisser_depot` reconnaît un envoi déjà reçu avant ses autres contrôles et le refuse (code 23505) ; l'index unique
// de la base reste le garde-fou quand deux envois se croisent. Dans les deux cas l'écran dit « déjà enregistré ».
export async function encaisserDepot(
  orgId: string,
  bailId: string,
  _etat: EtatDepot,
  formData: FormData
): Promise<EtatDepot> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "encaissement_depot", cible: bailId });
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const lu = lireMontant(formData.get("montant"));
  if ("erreur" in lu) return { erreur: lu.erreur, valeurs };
  const montant = lu.montant;
  const date = String(formData.get("date") ?? "").trim() || null;
  const dateRefusee = verifierDateDejaPassee(date, "La date d'encaissement");
  if (dateRefusee) return { erreur: dateRefusee, valeurs };
  const moyen = String(formData.get("moyen") ?? "").trim() || null;
  const versantPerson = String(formData.get("versant_person") ?? "").trim() || null;
  const versantLibelle = String(formData.get("versant_libelle") ?? "").trim() || null;
  const cleLue = lireCleEnvoi(formData.get("cle_envoi"));
  if ("erreur" in cleLue) return { erreur: cleLue.erreur, valeurs };
  const { error } = await supabase.rpc("encaisser_depot", {
    p_bail: bailId,
    p_montant: montant,
    p_date: date,
    p_moyen: moyen,
    p_versant_person: versantPerson,
    p_versant_libelle: versantLibelle,
    p_cle_envoi: cleLue.cle,
  });
  if (error && estRejeuCleEnvoi(error)) {
    // Cet envoi est déjà enregistré : on relit ce qu'il a écrit pour le dire, et on ne touche à rien.
    const { data: ligne } = await supabase
      .from("depot_encaissements")
      .select("bail_id, montant, date_encaissement")
      .eq("organization_id", orgId)
      .eq("cle_envoi", cleLue.cle)
      .maybeSingle();
    if (ligne && ligne.bail_id !== bailId) {
      return {
        erreur: "Cette référence d'envoi a déjà servi pour un autre dossier. Rechargez la page avant d'enregistrer.",
        valeurs,
      };
    }
    revalidatePath(`/agence/${orgId}/baux/${bailId}`);
    revalidatePath(`/agence/${orgId}/comptabilite`);
    return {
      succes: messageDejaEnregistre({
        objet: "Cet encaissement du dépôt",
        montant: ligne ? Number(ligne.montant) : null,
        date: ligne?.date_encaissement ?? null,
        montantSaisi: montant,
      }),
      dejaEnregistre: true,
    };
  }
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // Le dépôt passe au journal : la page comptabilité suit.
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: "Encaissement enregistré." };
}

// Retirer un encaissement de dépôt contre-passe l'écriture de dépôt déjà
// portée au journal (RM-A6.3). Comme toute correction comptable, elle porte le
// motif de son auteur (RM-A6.6) : il est saisi à l'écran et inscrit sur la
// contre-écriture par la base.
export async function supprimerEncaissementDepot(
  orgId: string,
  bailId: string,
  encId: string,
  formData?: FormData
): Promise<EtatDepot> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suppression_encaissement_depot", cible: bailId });
  if (!user) return { erreur: "Accès refusé." };
  const motif = String(formData?.get("motif") ?? "").trim();
  if (!motif) {
    return { erreur: "Dites pourquoi vous retirez cet encaissement : le motif reste au journal." };
  }
  const { error } = await supabase.rpc("supprimer_encaissement_depot", {
    p_encaissement: encId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: "Encaissement retiré — le motif est inscrit au journal." };
}
