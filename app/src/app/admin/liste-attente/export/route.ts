import { createClient } from "@/lib/supabase/server";
import { journaliserSupervision } from "@/lib/journal-supervision";
import {
  csvListeAttenteAgences,
  nomFichierExportListeAttente,
  type LigneListeAttente,
} from "@/lib/liste-attente-agences-csv";

const SANS_CACHE = { "Cache-Control": "no-store" };
const texte = (message: string, status: number) =>
  new Response(message, { status, headers: { ...SANS_CACHE, "Content-Type": "text/plain; charset=utf-8" } });

// Export CSV de la liste d'attente des agences : des coordonnées de personnes, donc réservé au super-administrateur,
// jamais mis en cache, et tracé au journal d'audit AVANT que le fichier ne parte (comme la consultation d'un
// justificatif d'artisan, admin/artisans/pieces/[pieceId]/fichier) : sans ligne d'audit, pas de fichier.
export async function GET(request: Request) {
  const supabase = await createClient();
  // Le proxy a déjà fermé /admin aux autres profils ; une route ne passe pas par le layout de la console, elle refait
  // donc la vérification elle-même. Refus sans contenu.
  const { data: autorise, error: erreurAcces } = await supabase.rpc("is_super_admin");
  if (erreurAcces || autorise !== true) return new Response(null, { status: 403, headers: SANS_CACHE });
  const inclureRetirees = new URL(request.url).searchParams.get("inclure_retirees") === "1";
  let requete = supabase
    .from("liste_attente_agences")
    .select("agence, contact, email, telephone, code_postal, nb_lots, message, statut, contactee_le, created_at")
    .order("created_at", { ascending: false });
  if (!inclureRetirees) requete = requete.neq("statut", "retiree");
  const { data, error } = await requete;
  // Une lecture en échec ne produit pas un fichier vide qui aurait l'air complet.
  if (error) return texte("Export impossible pour l’instant : réessayez dans un instant.", 503);
  const lignes = (data ?? []) as LigneListeAttente[];
  const trace = await journaliserSupervision(supabase, "liste_attente_exportee", {
    lignes: lignes.length,
    inclure_retirees: inclureRetirees,
  });
  if (!trace) return texte("L’export ne peut pas être journalisé pour l’instant : réessayez dans un instant.", 503);
  return new Response(csvListeAttenteAgences(lignes), {
    headers: {
      ...SANS_CACHE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichierExportListeAttente()}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
