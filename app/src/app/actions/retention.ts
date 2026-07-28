"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ResultatPurge = {
  erreur?: string;
  journaux?: Record<string, number>;
  documents_purges?: number;
  fichiers_supprimes?: number;
};

// Lancement manuel de la purge (Super Admin) : applique les règles de
// conservation en base puis vide la file de suppression physique via
// l'API Storage (le SQL ne peut pas supprimer dans storage.objects).
// La même purge tourne chaque nuit à 03h00 via pg_cron ; les fichiers mis en
// file la nuit sont supprimés physiquement au prochain passage ici.
export async function lancerPurge(): Promise<ResultatPurge> {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) return { erreur: "Réservé au super admin." };

  const { data, error } = await supabase.rpc("appliquer_retention");
  if (error) return { erreur: `Purge en échec : ${error.message}` };

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
