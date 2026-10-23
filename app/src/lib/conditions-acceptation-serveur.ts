import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  conditionsArtisansEnVigueur,
  estDocumentAccepte,
  versionArtisansPubliee,
  type ConditionsArtisans,
  type DocumentAccepte,
} from "@/lib/conditions-acceptation";
import type { AbonnementCourant } from "@/lib/nouvelle-version-conditions";

// Les lectures des acceptations du compte connecté (plan de conformité du 23/10/2026, lot 1A). La politique
// `acceptations_cgu_lecture` ne rend au titulaire que ses propres lignes (et toutes à un super-administrateur) : chaque
// lecture est donc AUSSI bornée au compte, pour qu'un super-administrateur ne lise jamais l'acceptation d'un autre.

export type AcceptationLue = { document: DocumentAccepte; version: string; acceptee_le: string };

/** La dernière acceptation de chaque document par ce compte ; `null` si la lecture échoue. */
export async function dernieresAcceptations(
  db: SupabaseClient,
  accountId: string
): Promise<Partial<Record<DocumentAccepte, AcceptationLue>> | null> {
  const { data, error } = await db
    .from("acceptations_cgu")
    .select("document, version, acceptee_le")
    .eq("account_id", accountId)
    .order("acceptee_le", { ascending: false })
    .limit(200);
  if (error) return null;
  const dernieres: Partial<Record<DocumentAccepte, AcceptationLue>> = {};
  for (const ligne of (data ?? []) as { document: unknown; version: unknown; acceptee_le: unknown }[]) {
    if (!estDocumentAccepte(ligne.document) || typeof ligne.version !== "string" || typeof ligne.acceptee_le !== "string") continue;
    // Lignes les plus récentes d'abord : la première de chaque document est la dernière acceptée.
    dernieres[ligne.document] ??= { document: ligne.document, version: ligne.version, acceptee_le: ligne.acceptee_le };
  }
  return dernieres;
}

/** La version de ce document dans la dernière acceptation du compte ; `null` s'il n'en a aucune ou si la lecture échoue. */
export async function derniereVersionAcceptee(
  db: SupabaseClient,
  accountId: string,
  document: DocumentAccepte
): Promise<string | null> {
  const { data, error } = await db
    .from("acceptations_cgu")
    .select("version")
    .eq("account_id", accountId)
    .eq("document", document)
    .order("acceptee_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const version = (data as { version: unknown }).version;
  return typeof version === "string" ? version : null;
}

/**
 * L'abonnement de l'espace, tel que `mon_abonnement` le rend à son responsable (aucun identifiant Stripe) ; `null`
 * pour un autre compte, sans abonnement lisible, ou si la lecture échoue.
 */
export async function abonnementCourant(db: SupabaseClient, orgId: string): Promise<AbonnementCourant> {
  const { data, error } = await db.rpc("mon_abonnement", { p_org: orgId });
  if (error) return null;
  const ligne = ((data ?? []) as { souscrit?: unknown; periode_fin?: unknown; annulation_demandee?: unknown }[])[0];
  if (!ligne) return null;
  return {
    souscrit: ligne.souscrit === true,
    periode_fin: typeof ligne.periode_fin === "string" ? ligne.periode_fin : null,
    annulation_demandee: ligne.annulation_demandee === true,
  };
}

/**
 * Le compte a-t-il accepté CETTE version de ce document ? Égalité stricte (jamais une comparaison d'ordre). Une lecture
 * en échec vaut « non » : la case est redemandée, et une ligne de plus est sans conséquence (ajout seul).
 */
export async function versionAccepteePar(
  db: SupabaseClient,
  accountId: string,
  document: DocumentAccepte,
  version: string
): Promise<boolean> {
  const { data, error } = await db
    .from("acceptations_cgu")
    .select("id")
    .eq("account_id", accountId)
    .eq("document", document)
    .eq("version", version)
    .limit(1)
    .maybeSingle();
  return !error && data !== null;
}

/**
 * La garde de l'espace artisan (R10) : les conditions de l'espace artisan que ce compte doit encore accepter, ou
 * `null`. Tant qu'elles ne sont pas publiées (CONDITIONS_ARTISANS_VERSION nulle), rien n'est exigé ni même lu.
 *
 * Jamais pendant un diagnostic du super-administrateur (relecture adverse du 24/10, défaut 2) : `artisan_supervise()`
 * désigne alors l'artisan supervisé, dont l'espace s'affiche, mais le compte connecté est celui du super-administrateur.
 * La garde lisait SON acceptation (aucune), posait la case à la place de chaque page, et le clic échouait (diagnostic en
 * lecture seule). Rien n'est lu de l'acceptation de l'artisan : on ne lit que celle du compte connecté. Si le contexte de
 * diagnostic ne peut pas être lu, la garde s'applique au compte connecté (jamais ouverte par défaut).
 */
export async function conditionsArtisansAAccepter(
  db: SupabaseClient,
  accountId: string,
  artisans: ConditionsArtisans = conditionsArtisansEnVigueur()
): Promise<{ version: string; date: string | null } | null> {
  const version = versionArtisansPubliee(artisans);
  if (!version) return null;
  const { data: supervise, error: erreurDiagnostic } = await db.rpc("artisan_supervise");
  if (!erreurDiagnostic && typeof supervise === "string" && supervise) return null;
  if (await versionAccepteePar(db, accountId, "conditions_artisans", version)) return null;
  return { version, date: artisans.date?.trim() || null };
}
