import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { CONDITIONS_VERSION, type FaitEditeur } from "@/lib/editeur";
import { lireEditeur } from "@/lib/editeur-serveur";
import { motifIdentiteEditeur, type ContexteGarde } from "@/lib/garde-souscription";
import { lireReglageSouscription } from "@/lib/reglage-souscription-serveur";

// Les lectures en base des deux conditions de lib/garde-souscription.ts
// (lot B3, 19/10/2026), avec la session de la personne connectée :
//  - `supervision_identite` est lisible de tout compte connecté (politique
//    `identite_publique`, colonnes singleton/valeurs/revision/modifie_le) ;
//  - `acceptations_cgu` ne rend au titulaire que ses propres lignes (politique
//    `acceptations_cgu_lecture`), et toutes à un super-administrateur.
// Les deux lectures ferment par défaut : un échec vaut « pas de paiement ».

type Client = Awaited<ReturnType<typeof createClient>>;

export type GardeSouscription = {
  /**
   * L'identité de l'éditeur telle que la production la tient. L'écran en tire
   * le motif par `motifIdentiteEditeur(editeur, { enEssai })` une fois l'état
   * du compte lu : les deux lectures se font en parallèle, la phrase se choisit
   * après.
   */
  editeur: Record<string, FaitEditeur>;
  /** Vrai si le compte a une acceptation enregistrée pour la version en vigueur des conditions. */
  conditionsAcceptees: boolean;
  blocageIdentiteActif: boolean;
};

/**
 * L'identité telle que la production la tient : `supervision_identite`
 * superposée au code (lib/editeur-serveur.ts). Une lecture en échec rend
 * l'identité du code — vide à ce jour — donc le motif : fermeture par défaut,
 * et rien n'est prélevé entre-temps. `enEssai` : voir ContexteGarde.
 */
export async function lireMotifIdentiteEditeur(enEssai: boolean): Promise<string | null> {
  const [{ editeur }, { blocageIdentiteActif }] = await Promise.all([lireEditeur(), lireReglageSouscription()]);
  const contexte: ContexteGarde = { enEssai, blocageIdentiteActif };
  return motifIdentiteEditeur(editeur, contexte);
}

/**
 * Le compte a-t-il accepté la version en vigueur ? Lecture bornée au compte
 * (la RLS limite déjà au titulaire, mais un super-administrateur en traversée
 * verrait toutes les lignes) et à la version exacte — une version antérieure
 * ne compte pas. Une lecture en échec vaut « non acceptée » : la case est
 * redemandée, et une ligne de plus est sans conséquence (ajout seul).
 */
export async function conditionsEnVigueurAccepteesPar(supabase: Client, accountId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("acceptations_cgu")
    .select("id")
    .eq("account_id", accountId)
    // 24/10 : une acceptation porte sur un document (conditions clients, conditions de l'espace artisan, règles des
    // espaces invités) ; seules les conditions clients ouvrent la souscription.
    .eq("document", "conditions_clients")
    .eq("version", CONDITIONS_VERSION)
    .limit(1)
    .maybeSingle();
  return !error && data !== null;
}

/** Les deux lectures en parallèle, pour l'écran « Mon abonnement ». */
export async function lireGardeSouscription(supabase: Client, accountId: string): Promise<GardeSouscription> {
  const [{ editeur }, conditionsAcceptees, { blocageIdentiteActif }] = await Promise.all([
    lireEditeur(),
    conditionsEnVigueurAccepteesPar(supabase, accountId),
    lireReglageSouscription(),
  ]);
  return { editeur, conditionsAcceptees, blocageIdentiteActif };
}
