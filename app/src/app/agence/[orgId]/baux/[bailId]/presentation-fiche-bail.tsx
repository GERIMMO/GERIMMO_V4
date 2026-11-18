import type { ReactNode } from "react";
import { RubriqueDossier } from "@/components/rubrique-dossier";
import { formaterDate } from "@/lib/ged";

/** Décrit les dates du dossier, sans inventer une échéance juridique. */
export function situationDatesBail(bail: { etat: string; date_fin: string | null; date_sortie_reelle: string | null }) {
  if (bail.date_sortie_reelle) return [bail.date_fin && `Fin indiquée au ${formaterDate(bail.date_fin)}`, `Sortie enregistrée le ${formaterDate(bail.date_sortie_reelle)}`].filter(Boolean).join(" · ");
  if (bail.date_fin) return `Fin indiquée au ${formaterDate(bail.date_fin)}`;
  if (bail.etat === "termine") return "Bail terminé · date de sortie absente du dossier";
  if (bail.etat === "preavis") return "Préavis en cours · date de départ à confirmer";
  if (bail.etat === "brouillon") return "Dates à confirmer avant la signature";
  return bail.etat === "actif" ? "Location en cours · aucun départ renseigné" : "Aucune date de fin indiquée dans le dossier";
}

/** Une seule ouverture par rubrique : le panneau de l'onglet est déjà visible. */
export function RubriqueBail({ proprietaire, id, titre, resume, ouverte, children }: {
  proprietaire: boolean; id: string; titre: ReactNode; resume: string; ouverte?: boolean; children: ReactNode;
}) {
  return proprietaire ? <section id={id} className="space-y-4 scroll-mt-24"><h2 className="font-heading text-lg font-semibold">{titre}</h2>{children}</section>
    : <RubriqueDossier id={id} titre={titre} resume={resume} ouverte={ouverte}>{children}</RubriqueDossier>;
}
