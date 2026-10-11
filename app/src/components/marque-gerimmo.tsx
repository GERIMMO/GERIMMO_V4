import Image from "next/image";
import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";

/** Le logo officiel détouré se pose sur le fond de chaque écran. */
export function MarqueGerimmo({
  className = "",
  surEncre = false,
}: {
  className?: string;
  surEncre?: boolean;
}) {
  return (
    <span className={`marque-gerimmo ${surEncre ? "marque-gerimmo-sur-encre" : ""} ${className}`}>
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
