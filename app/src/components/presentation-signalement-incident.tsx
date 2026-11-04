import type { ReactNode } from "react";
import { Building2, Camera, Wrench } from "lucide-react";

/** Même lecture que la fiche bien : identité, repères, puis contenu du dossier. */
export function PresentationSignalementIncident({ numero, titre, statut, lieu, informations, description, photos, nombrePhotos, photosIndisponibles, ajoutPhoto }: {
  numero: string; titre: string; statut: ReactNode; lieu: ReactNode; informations: ReactNode;
  description: string | null; photos: ReactNode; nombrePhotos: number; photosIndisponibles: boolean; ajoutPhoto: ReactNode;
}) {
  const blocPhotos = <div className="incident-fiche-photos">
    <span><Camera size={16} aria-hidden="true"/>{photosIndisponibles ? "Photos indisponibles" : nombrePhotos ? `${nombrePhotos} photo${nombrePhotos > 1 ? "s" : ""} jointe${nombrePhotos > 1 ? "s" : ""}` : "Aucune photo jointe"}</span>
    {photos}
    {ajoutPhoto && <details><summary>Ajouter des photos</summary>{ajoutPhoto}</details>}
  </div>;
  return <>
    <header className="incident-fiche-identite" aria-label="Identité de l’incident">
      <div className="incident-fiche-titre">
        <span className="incident-fiche-embleme"><Wrench size={24} aria-hidden="true" /></span>
        <div><p className="incident-reference">{numero}</p><h2>{titre}</h2></div>
        <div className="incident-badges">{statut}</div>
      </div>
      <div className="incident-fiche-lieu"><Building2 size={16} aria-hidden="true"/>{lieu}</div>
      {informations}
      {description && <p className="incident-fiche-description">{description}</p>}
      {blocPhotos}
    </header>
  </>;
}
