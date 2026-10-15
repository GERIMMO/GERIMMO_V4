import Image from "next/image";
import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";

/**
 * Le logo officiel détouré se pose sur le fond de chaque écran.
 *
 * `tuile` (décision D28 A, audit du 13/10, DES-A-10 et DES-B-10) : sur un fond CLAIR, le doré du logo se lit à
 * ≈ 1,5:1, le nom du produit s'y devine à peine. Posé dans la tuile bleu nuit de l'inscription artisan, il atteint
 * ≈ 13,6:1. La tuile est le fond du logo, pas un autre logo : le fichier ne change pas. Sur un fond déjà sombre
 * (colonne, rail, bandeau bleu nuit), on ne la pose pas — `surEncre` suffit.
 */
export function MarqueGerimmo({
  className = "",
  surEncre = false,
  tuile = false,
}: {
  className?: string;
  surEncre?: boolean;
  tuile?: boolean;
}) {
  return (
    <span className={`marque-gerimmo ${surEncre ? "marque-gerimmo-sur-encre" : ""} ${tuile ? "marque-gerimmo-tuile" : ""} ${className}`}>
      <Image
        src={CHARTE_GERIMMO.logoTransparent}
        alt="Gerimmo — L’immobilier en confiance"
        width={CHARTE_GERIMMO.logoTransparentLargeur}
        height={CHARTE_GERIMMO.logoTransparentHauteur}
        sizes="(max-width: 640px) 72px, 180px"
      />
    </span>
  );
}
