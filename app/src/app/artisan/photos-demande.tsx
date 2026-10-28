import type { PhotoDemande } from "./acces";
import { CLASSE_AIDE, Carte, TitreSection } from "./ui";

/**
 * Les photos jointes par le locataire (D16, fiche ART-15, décision du 14/10/2026) : l'artisan chiffre avec ce que le locataire a
 * montré, au lieu de chiffrer à l'aveugle. Lecture seule : chaque image est une adresse Gerimmo qui revérifie le droit, trace
 * l'accès et redirige vers une URL signée de 60 secondes (lib/photos-demande-artisan.ts).
 *
 * Rien n'est annoncé quand il n'y a pas de photo : le locataire n'est pas tenu d'en joindre. Un échec de lecture, lui, se dit.
 */
export function PhotosDeLaDemande({ photos, erreur, base }: {
  photos: PhotoDemande[];
  erreur: boolean;
  /** L'adresse des photos de cette demande ou mission, sans barre finale : `${base}/<identifiant de la photo>`. */
  base: string;
}) {
  if (erreur) {
    return (
      <Carte>
        <TitreSection>Photos jointes par le locataire</TitreSection>
        <p role="alert" className={CLASSE_AIDE}>Les photos n’ont pas pu être chargées. Rechargez la page.</p>
      </Carte>
    );
  }
  if (photos.length === 0) return null;
  return (
    <Carte>
      <TitreSection>Photos jointes par le locataire</TitreSection>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <li key={photo.document_id}>
            <a
              href={`${base}/${photo.document_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-h-11 overflow-hidden rounded-xl border border-[var(--filet)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une URL signée de 60 secondes : pas d'optimisation d'image possible */}
              <img
                src={`${base}/${photo.document_id}`}
                alt={`Photo ${photo.rang} jointe par le locataire`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="aspect-[4/3] w-full object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
      <p className={`mt-3 ${CLASSE_AIDE}`}>
        Elles servent à chiffrer et ne peuvent pas être modifiées. Chaque consultation est enregistrée.
      </p>
    </Carte>
  );
}
