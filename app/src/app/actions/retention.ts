"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function modifierDureeConservation(input: { categorie: string; mois: number; revision: number; motif: string; confirme: boolean }): Promise<{ erreur?: string }> {
  const db = await createClient();
  const droit = await db.rpc("is_permanent_super_admin");
  if (droit.error || droit.data !== true) return { erreur: "Réservé au superadmin permanent avec second facteur." };
  if (!input || input.confirme !== true || typeof input.categorie !== "string" || !/^[a-z_]+:[a-z_]+$/.test(input.categorie)
      || !Number.isInteger(input.mois) || input.mois < 0 || input.mois > 240
      || !Number.isSafeInteger(input.revision) || input.revision < 0
      || typeof input.motif !== "string" || input.motif.trim().length < 10 || input.motif.trim().length > 1000) {
    return { erreur: "Vérifiez la durée, le motif et la confirmation." };
  }
  const r = await db.rpc("modifier_duree_conservation", { p_categorie: input.categorie, p_duree_mois: input.mois, p_revision: input.revision, p_motif: input.motif.trim() });
  if (r.error) return { erreur: r.error.code === "40001" ? "Cette durée a changé dans une autre session. Rechargez la page." : r.error.code === "22023" ? sansJargon(r.error.message) : "Enregistrement refusé. Aucune durée n’a été modifiée." };
  if (!r.data || typeof r.data.modifiee !== "boolean") return { erreur: "Enregistrement non confirmé. Rechargez la page avant de réessayer." };
  for (const path of ["/admin/conservation", "/admin/journaux", "/admin/donnees", "/confidentialite"]) revalidatePath(path);
  return {};
}

export type BilanConservation = {
  erreur?: string;
  /** `echus` vaut null pour une catégorie du catalogue dont le nettoyage n'est pas encore écrit (plan du 23/10, lot 2). */
  categories?: { categorie: string; libelle: string; duree_mois: number; actif: boolean; echus: number | null }[];
  preuves_protegees?: number;
};
export async function simulerConservation(): Promise<BilanConservation> {
  const db = await createClient();
  const droit = await db.rpc("is_permanent_super_admin");
  if (droit.error || droit.data !== true) return { erreur: "Réservé au superadmin avec vérification de sécurité." };
  const resultat = await db.rpc("simuler_conservation_contacts");
  if (resultat.error || !resultat.data || resultat.data.suppressions !== 0 || !Array.isArray(resultat.data.categories)) {
    return { erreur: "Le bilan est indisponible. Aucun nettoyage n’a été lancé." };
  }
  return { categories: resultat.data.categories, preuves_protegees: resultat.data.preuves_protegees };
}

export type ResultatPurge = {
  erreur?: string;
  journaux?: Record<string, number>;
  documents_purges?: number;
  fichiers_supprimes?: number;
};

// Lancement manuel de la purge (Super Admin) : applique les règles de
// conservation en base puis vide la file de suppression physique via
// l'API Storage (le SQL ne peut pas supprimer dans storage.objects).
// La même purge tourne chaque nuit à 03h00 via pg_cron ; depuis le 27/09, les
// fichiers mis en file la nuit sont supprimés physiquement par la tâche
// planifiée `purge` (/api/cron/equipes?mission=purge, 03:40 UTC). Ce bouton
// reste le moyen de lancer les deux sans attendre.
export async function lancerPurge(): Promise<ResultatPurge> {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) return { erreur: "Réservé au super admin." };

  const { data, error } = await supabase.rpc("appliquer_retention");
  if (error) return { erreur: `Purge en échec : ${sansJargon(error.message)}` };

  // D06 : un arrêt d'urgence couvre la purge, aussi quand on la lance à la main. La base n'a rien supprimé ;
  // les fichiers en attente ne doivent pas l'être non plus, sans quoi l'arrêt ne retiendrait que la moitié du geste.
  if (data?.arret_en_cours === true) {
    return { erreur: "Un arrêt d’urgence est en cours : rien n’a été supprimé. Levez l’arrêt dans « Relais et arrêts » avant de relancer le nettoyage." };
  }

  // Suppression physique des fichiers en file. On ne marque « supprimé » que
  // ce que l'API a réellement supprimé : un chemin resté en file sera retenté
  // au prochain passage plutôt que perdu de vue.
  let fichiersSupprimes = 0;
  const { data: enAttente } = await supabase
    .from("purge_fichiers")
    .select("id, storage_path")
    .is("deleted_at", null);
  if (enAttente && enAttente.length > 0) {
    const { data: supprimes } = await supabase.storage
      .from("documents")
      .remove(enAttente.map((f) => f.storage_path));
    const cheminsSupprimes = new Set((supprimes ?? []).map((o) => o.name));
    const idsSupprimes = enAttente
      .filter((f) => cheminsSupprimes.has(f.storage_path))
      .map((f) => f.id);
    if (idsSupprimes.length > 0) {
      await supabase
        .from("purge_fichiers")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", idsSupprimes);
      fichiersSupprimes = idsSupprimes.length;
    }
  }

  revalidatePath("/admin/journaux");
  return {
    journaux: data?.journaux ?? {},
    documents_purges: data?.documents_purges ?? 0,
    fichiers_supprimes: fichiersSupprimes,
  };
}
