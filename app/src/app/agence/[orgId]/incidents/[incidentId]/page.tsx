import { redirect } from "next/navigation";
import { exigerUuids } from "@/lib/identifiants";
import { baseEspace } from "@/lib/racine-espace";
import { verifierAccesEspace } from "@/lib/espace";

// Recette 24/08 : la fiche incident vit désormais dans la vue scindée de la
// liste (pane-incident.tsx). L'ancienne URL reste valable — liens, favoris,
// notifications — et redirige vers la liste avec le dossier sélectionné.
export default async function PageIncident(
  props: PageProps<"/agence/[orgId]/incidents/[incidentId]">
) {
  const { orgId, incidentId } = await props.params;
  exigerUuids(incidentId);
  // Décision D27 : la liste du propriétaire direct vit sous /espace/<id>. La garde est celle de toutes les pages de
  // l'espace (mise en cache par requête) : elle renvoie vers « Mes espaces » si l'accès manque, comme la liste le ferait.
  const { estProprietaire } = await verifierAccesEspace(orgId);
  redirect(`${baseEspace(orgId, estProprietaire)}/incidents?sel=${incidentId}`);
}
