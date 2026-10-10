import { LogementReprisBail } from "./logement-repris-bail";
import { createClient } from "@/lib/supabase/server";

/** Lecture des sources du lot : aucune copie ni saisie des caractéristiques dans le bail. */
export async function CompleterSurPlace({ orgId, bailId, lotId, individuel }: { orgId: string; bailId: string; lotId: string; individuel: boolean }) {
  const db = await createClient();
  const [lotRes, catalogue, equipes, chambres] = await Promise.all([
    db.from("lots").select("*").eq("id", lotId).eq("organization_id", orgId).maybeSingle(),
    db.from("equipements_catalogue").select("id,nom").eq("organization_id", orgId).eq("actif", true).order("nom"),
    db.from("lot_equipements").select("equipement_id").eq("lot_id", lotId),
    individuel ? db.from("lot_chambres").select("*").eq("lot_id", lotId).eq("organization_id", orgId).order("nom") : Promise.resolve({data:[],error:null}),
  ]);
  const lot = lotRes.data;
  if (!lot || lotRes.error) return <p role="alert">Le logement n’a pas pu être chargé. Réessayez.</p>;
  const bien = await db.from("biens").select("*").eq("id", lot.bien_id).eq("organization_id", orgId).maybeSingle();
  if (!bien.data || bien.error) return <p role="alert">Le bâtiment n’a pas pu être chargé. Réessayez.</p>;
  return <><LogementReprisBail orgId={orgId} bailId={bailId} lot={lot} bien={bien.data}
    catalogue={catalogue.data ?? []} selection={(equipes.data ?? []).map(e => e.equipement_id)}
    erreurEquipements={Boolean(catalogue.error || equipes.error)} chambres={individuel ? chambres.data ?? [] : undefined} />
    {chambres.error && <p role="alert">Les chambres n’ont pas pu être chargées.</p>}
  </>;
}
