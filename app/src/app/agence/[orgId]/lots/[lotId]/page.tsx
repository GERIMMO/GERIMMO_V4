import { redirect } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { exigerUuids } from "@/lib/identifiants";

/**
 * Le renvoi d'un lot vers sa fiche complète, par son seul identifiant.
 *
 * POURQUOI. Les « à renseigner » d'un document généré (bail, notice…) ne
 * connaissent que le lot (`document_liens`), pas son bien ; or la fiche du lot
 * vit sous `/parc/[bienId]/lots/[lotId]`. Jusqu'au 01/10 ces liens ouvraient
 * la fenêtre du parc (`?sel=lot:`), un résumé sans formulaire : le testeur
 * propriétaire n'y trouvait « aucun endroit où remplir ces infos ». Cette page
 * lit le bien une fois et renvoie à la fiche, section demandée, formulaire
 * ouvert si `modifier=1`.
 *
 * `vers` : la section de la fiche (`caracteristiques`, `equipements`,
 * `detention`, `diagnostics`, `pieces`…) ou `bien` pour la fiche du bien
 * (parties communes, accès internet, année de construction).
 */
export default async function PageRenvoiLot(props: PageProps<"/agence/[orgId]/lots/[lotId]">) {
  const { orgId, lotId } = await props.params;
  const { modifier, vers } = ((await props.searchParams) ?? {}) as { modifier?: string; vers?: string };
  exigerUuids(lotId);
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: lot } = await supabase
    .from("lots")
    .select("bien_id")
    .eq("id", lotId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!lot?.bien_id) redirect(`/agence/${orgId}/parc`);

  const section = typeof vers === "string" && /^[a-z-]{1,40}$/.test(vers) ? vers : "caracteristiques";
  if (section === "bien") redirect(`/agence/${orgId}/parc/${lot.bien_id}#caracteristiques`);
  redirect(
    `/agence/${orgId}/parc/${lot.bien_id}/lots/${lotId}${modifier === "1" ? "?modifier=1" : ""}#${section}`
  );
}
