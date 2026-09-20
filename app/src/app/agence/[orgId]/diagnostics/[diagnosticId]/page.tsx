import { redirect } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";

/**
 * Le renvoi d'un diagnostic vers l'endroit où il se redépose.
 *
 * POURQUOI UNE PAGE PLUTÔT QU'UN LIEN DIRECT. L'alerte « DPE expiré » ne porte
 * que l'identifiant du diagnostic ({diagnostic_id, type_diagnostic} —
 * 20260830120000:372) : ni le lot ni le bien. Or un diagnostic se dépose sur la
 * fiche du logement, ou sur celle de l'immeuble s'il couvre les parties
 * communes — et c'est la base qui sait laquelle (contrainte
 * `diagnostics_un_seul_niveau` : bien_id XOR lot_id).
 *
 * Plutôt que d'enrichir la charge utile — une migration, pour une information
 * déjà en base — ou de faire lire la table aux trois écrans qui ouvrent une
 * alerte, cette page la lit une fois et renvoie. Le constructeur de lien
 * (`cheminFicheAlerte`) reste une fonction pure, utilisable depuis le
 * navigateur comme depuis le serveur.
 */
export default async function PageRenvoiDiagnostic(
  props: PageProps<"/agence/[orgId]/diagnostics/[diagnosticId]">
) {
  const { orgId, diagnosticId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: diagnostic } = await supabase
    .from("diagnostics")
    .select("bien_id, lot_id")
    .eq("id", diagnosticId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // Une alerte peut survivre à l'archivage du diagnostic qu'elle ciblait.
  // Revenir aux alertes permet de traiter ce cas sans laisser un lien en 404.
  // La destination est identique pour un objet absent ou hors de l'agence.
  if (!diagnostic) redirect(`/agence/${orgId}/alertes?source_introuvable=diagnostic`);

  // Diagnostic d'immeuble : la fiche du bien, sur sa carte diagnostics.
  if (diagnostic.bien_id) {
    redirect(`/agence/${orgId}/parc/${diagnostic.bien_id}#diagnostics`);
  }

  // Diagnostic de logement : la fiche du lot. Son bien se lit à part — deux
  // lectures simples valent mieux ici qu'une jointure imbriquée, les FK
  // composites de la revue 2 ayant rendu les relations ambiguës pour PostgREST.
  const { data: lot } = await supabase
    .from("lots")
    .select("bien_id")
    .eq("id", diagnostic.lot_id as string)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!lot?.bien_id) redirect(`/agence/${orgId}/alertes?source_introuvable=diagnostic`);

  redirect(
    `/agence/${orgId}/parc/${lot.bien_id}/lots/${diagnostic.lot_id}#diagnostics`
  );
}
