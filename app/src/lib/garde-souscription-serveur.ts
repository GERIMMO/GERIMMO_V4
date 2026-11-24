import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { CONDITIONS_VERSION, type FaitEditeur } from "@/lib/editeur";
import { empreinteIdentite } from "@/lib/conditions-versions";
import { identiteDesConditions } from "@/lib/editeur";
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
  /** Vrai si le superadmin a décidé (décision datée, lue en base) de vendre aux particuliers sans médiateur. */
  venteSansMediateurDecidee: boolean;
  ventesOuvertes: boolean;
};

/**
 * L'identité telle que la production la tient : `supervision_identite`
 * superposée au code (lib/editeur-serveur.ts). Une lecture en échec rend
 * l'identité du code — vide à ce jour — donc le motif : fermeture par défaut,
 * et rien n'est prélevé entre-temps. `enEssai` : voir ContexteGarde.
 */
export async function lireMotifIdentiteEditeur(
  supabase: Client,
  enEssai: boolean,
  nouvelleSouscriptionParticulier = false,
  premiereSouscription = nouvelleSouscriptionParticulier
): Promise<string | null> {
  const [{ editeur }, { blocageIdentiteActif, venteSansMediateurLe }] = await Promise.all([lireEditeur(), lireReglageSouscription()]);
  const contexte: ContexteGarde = { enEssai, blocageIdentiteActif, venteSansMediateurDecidee: Boolean(venteSansMediateurLe), premiereSouscription, nouvelleSouscriptionParticulier };
  return motifIdentiteEditeur(editeur, contexte) ?? (nouvelleSouscriptionParticulier ? await motifArchiveCommande(supabase, editeur) : null);
}

/**
 * L'identité imprimée dans les conditions peut changer depuis leur archivage (nouvelle adresse, par exemple). Une
 * nouvelle commande attend alors la publication d'une version concordante.
 *
 * Reprise du 24/11/2026 (relecture D7R-02) : la comparaison portait sur TOUTE l'identité saisie, médiateur, téléphone
 * et prestataires compris. Saisir le médiateur après l'ouverture refermait donc les ventes sans un mot, jusqu'à une
 * livraison de code. Elle ne porte plus que sur ce que le texte des conditions imprime (`identiteDesConditions`) :
 * depuis la version du 24/11/2026, l'article 17 renvoie aux mentions légales pour le médiateur, désigné ou non.
 */
export async function motifArchiveCommande(supabase: Client, editeur: Record<string, FaitEditeur>): Promise<string | null> {
  const { data, error } = await supabase.from("versions_conditions").select("identite_editeur")
    .eq("document", "conditions_clients").eq("version", CONDITIONS_VERSION).maybeSingle();
  const archive = data?.identite_editeur;
  if (!error && archive && typeof archive === "object" && !Array.isArray(archive) &&
    empreinteIdentite(identiteDesConditions(archive)) === empreinteIdentite(identiteDesConditions(editeur))) return null;
  return "Les souscriptions sont en attente de la vérification de la version archivée des conditions générales.";
}

/**
 * Le compte a-t-il accepté la version en vigueur ? Lecture bornée au compte
 * (la RLS limite déjà au titulaire, mais un super-administrateur en traversée
 * verrait toutes les lignes) et à la version exacte — une version antérieure
 * ne compte pas. Une lecture en échec vaut « non acceptée » : la case est
 * redemandée, et une ligne de plus est sans conséquence (ajout seul).
 *
 * Reprise du lot D4 (relecture D4R-01) : seule compte une ligne qui porte l'EMPREINTE du texte archivé (recopiée par la
 * base). Une ligne sans empreinte — version non archivée au moment de l'accord, ouverture d'un espace propriétaire,
 * inscription, ou appel direct de `accepter_cgu` avant la migration 20261125150000 — ne prouve pas quel texte a été
 * accepté : la case est redemandée.
 */
export async function preuveConditionsEnVigueur(supabase: Client, accountId: string): Promise<string | null> {
  const lire = (parDocument: boolean) => {
    let requete = supabase.from("acceptations_cgu").select("id").eq("account_id", accountId);
    // 24/10 : une acceptation porte sur un document (conditions clients, conditions de l'espace artisan, règles des
    // espaces invités) ; seules les conditions clients ouvrent la souscription. La colonne de l'empreinte vient de la
    // même migration que celle du document : dans le repli ci-dessous (colonne absente), aucune ligne n'en a.
    if (parDocument) requete = requete.eq("document", "conditions_clients").not("empreinte_sha256", "is", null);
    return requete.eq("version", CONDITIONS_VERSION).limit(1).maybeSingle();
  };
  let { data, error } = await lire(true);
  // Relecture adverse du 24/10 (M3) : code déployé avant la migration 20261024090000, la colonne `document` manque
  // (42703) ; toutes les acceptations sont alors des conditions clients. Sans ce repli, la garde échouait à chaque
  // essai et plus personne ne pouvait payer. Toute autre erreur ferme par défaut.
  if (error?.code === "42703") ({ data, error } = await lire(false));
  return error ? null : data?.id ?? null;
}

export async function conditionsEnVigueurAccepteesPar(supabase: Client, accountId: string): Promise<boolean> {
  return Boolean(await preuveConditionsEnVigueur(supabase, accountId));
}

/** Les deux lectures en parallèle, pour l'écran « Mon abonnement ». */
export async function lireGardeSouscription(supabase: Client, accountId: string): Promise<GardeSouscription> {
  const [{ editeur }, conditionsAcceptees, { blocageIdentiteActif, ventesOuvertes, venteSansMediateurLe }] = await Promise.all([
    lireEditeur(),
    conditionsEnVigueurAccepteesPar(supabase, accountId),
    lireReglageSouscription(),
  ]);
  return { editeur, conditionsAcceptees, blocageIdentiteActif, venteSansMediateurDecidee: Boolean(venteSansMediateurLe), ventesOuvertes };
}
