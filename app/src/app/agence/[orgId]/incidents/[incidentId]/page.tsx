import { redirect } from "next/navigation";

// Recette 24/08 : la fiche incident vit désormais dans la vue scindée de la
// liste (pane-incident.tsx). L'ancienne URL reste valable — liens, favoris,
// notifications — et redirige vers la liste avec le dossier sélectionné.
export default async function PageIncident(
  props: PageProps<"/agence/[orgId]/incidents/[incidentId]">
) {
  const { orgId, incidentId } = await props.params;
  redirect(`/agence/${orgId}/incidents?sel=${incidentId}`);
}
