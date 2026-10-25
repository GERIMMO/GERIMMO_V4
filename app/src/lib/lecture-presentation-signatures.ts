import "server-only";
import { verifierAccesEspace } from "@/lib/espace";
import { clientDeService } from "@/lib/supabase/service";
import type { SignatureLisible } from "./presentation-signatures";

/** Lecture d'affichage uniquement. Aucun appel au prestataire ni geste de signature.
 * La supervision ne reçoit que l'état et les références GED déjà consultables.
 * Les signataires, téléphones, secrets et URL de signature ne sont jamais sélectionnés.
 */
export async function lirePresentationSignatures(orgId: string, filtre: { baux: string[] } | { documents: string[] }) {
  const ids = [...new Set("baux" in filtre ? filtre.baux : filtre.documents)];
  if (!ids.length) return { circuits: [] as SignatureLisible[], erreur: false };
  if (ids.length > 1000 || ids.some(id => !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) return { circuits: [] as SignatureLisible[], erreur: true };
  const acces = await verifierAccesEspace(orgId);
  let db = acces.supabase;
  if (acces.traverseeLectureSeule) {
    // Le contrôle de session/MFA et la trace de traversée précèdent cette lecture bornée.
    const droit = await db.rpc("is_super_admin");
    if (droit.error || droit.data !== true) return { circuits: [] as SignatureLisible[], erreur: true };
    const service = clientDeService();
    if (!service) return { circuits: [] as SignatureLisible[], erreur: true };
    db = service;
  }
  let q = db.from("bail_signature_circuits")
    .select("bail_id,modele,etat,document_id,document_signe,created_at")
    .eq("organization_id", orgId);
  q = "baux" in filtre ? q.eq("modele", "bail").in("bail_id", ids)
    : q.or(`document_id.in.(${ids.join(",")}),document_signe.in.(${ids.join(",")})`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
  // Le plafond PostgREST peut tronquer la réponse à 1 000 lignes même si
  // une limite supérieure est demandée. À cette borne, l'état reste inconnu.
  const incomplet = Boolean(error) || (data?.length ?? 0) >= 1000;
  return { circuits: incomplet ? [] : (data ?? []) as SignatureLisible[], erreur: incomplet };
}
